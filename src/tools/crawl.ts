import { runLighthouse } from "../lib/lighthouse.js";
import { discoverUrls } from "../lib/crawler.js";
import type { Device, AnalysisResult, CrawlResult, CrawlPageScore } from "../lib/types.js";

export async function crawlSite(args: {
  url: string;
  device?: Device;
  maxPages?: number;
}): Promise<CrawlResult> {
  const { url, device = "mobile", maxPages = 20 } = args;

  if (!url || typeof url !== "string") {
    throw new Error("url is required");
  }

  const cap = Math.min(maxPages, 20);
  const discovery = await discoverUrls(url);
  const urls = discovery.urls.slice(0, cap);

  if (urls.length === 0) {
    throw new Error(`No pages found for ${url}`);
  }

  const base = new URL(url);

  // Run Lighthouse on all URLs in parallel (semaphore in lighthouse.ts controls concurrency)
  const settled = await Promise.allSettled(
    urls.map((u) => runLighthouse(u, device))
  );

  const results: AnalysisResult[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === "fulfilled") {
      results.push(outcome.value);
    } else {
      errors.push({ url: urls[i], error: outcome.reason?.message || "Unknown error" });
    }
  }

  // Build condensed per-page scores for MCP token efficiency
  const pageScores: CrawlPageScore[] = results.map((r) => {
    const perf = r.scores.performance ?? 0;
    return {
      url: r.url,
      performance: perf,
      lcp: r.coreWebVitals.lcp.value,
      fcp: r.coreWebVitals.fcp.value,
      cls: r.coreWebVitals.cls.value,
      tbt: r.coreWebVitals.tbt.value,
      si: r.coreWebVitals.si.value,
      ttfb: r.coreWebVitals.ttfb.value,
      rating: perf >= 90 ? "good" : perf >= 50 ? "needs-improvement" : "poor",
    };
  });

  // Build summary
  const scores = results.map((r) => r.scores.performance ?? 0);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;

  const worstPage = results.length > 0
    ? results.reduce((w, r) => (r.scores.performance ?? 0) < (w.scores.performance ?? 0) ? r : w).url
    : "";
  const bestPage = results.length > 0
    ? results.reduce((b, r) => (r.scores.performance ?? 0) > (b.scores.performance ?? 0) ? r : b).url
    : "";

  // Aggregate common recommendations across pages
  const issueCounts = new Map<string, number>();
  for (const r of results) {
    for (const rec of r.recommendations) {
      issueCounts.set(rec.title, (issueCounts.get(rec.title) ?? 0) + 1);
    }
  }
  const commonIssues = [...issueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([title, count]) => ({ title, count }));

  return {
    site: base.origin,
    device,
    timestamp: new Date().toISOString(),
    pagesAnalyzed: results.length,
    pagesDiscovered: discovery.urls.length,
    discoveryMethod: discovery.method,
    pageScores,
    results,
    errors,
    summary: {
      avgScore,
      minScore,
      maxScore,
      worstPage,
      bestPage,
      commonIssues,
    },
  };
}
