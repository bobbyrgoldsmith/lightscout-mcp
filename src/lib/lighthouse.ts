import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Device, AnalysisResult, Recommendation, MetricKey } from "./types.js";
import { getRating } from "./scoring.js";
import { ensureCleanNodeModules } from "./finder-guard.js";

const execFile = promisify(execFileCb);
const require = createRequire(import.meta.url);

// Resolve lighthouse CLI path from installed package
const lhPkgPath = require.resolve("lighthouse/package.json");
const lhDir = dirname(lhPkgPath);
const lhCli = join(lhDir, "cli", "index.js");

// Finder artifact check runs once per process
let nodeModulesChecked = false;

// Semaphore for concurrency control (default: 3 parallel runs)
const MAX_CONCURRENCY = 3;
let running = 0;
let queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (running < MAX_CONCURRENCY) {
    running++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => queue.push(resolve));
}

function releaseSlot() {
  const next = queue.shift();
  if (next) {
    next();
  } else {
    running--;
  }
}

// Lighthouse audit IDs for CWV metrics
const METRIC_AUDIT_MAP: Record<MetricKey, string> = {
  lcp: "largest-contentful-paint",
  fcp: "first-contentful-paint",
  cls: "cumulative-layout-shift",
  tbt: "total-blocking-time",
  si: "speed-index",
  ttfb: "server-response-time",
};

export function truncateDesc(raw?: string): string {
  if (!raw) return "";
  const clean = raw.replace(/\[.*?\]\(.*?\)/g, "").trim();
  const first = clean.split(". ")[0];
  return first.length > 120 ? first.slice(0, 117) + "..." : first;
}

export async function runLighthouse(
  url: string,
  device: Device = "mobile",
  categories: string[] = ["performance"]
): Promise<AnalysisResult> {
  if (!nodeModulesChecked) {
    await ensureCleanNodeModules(lhDir);
    nodeModulesChecked = true;
  }

  await acquireSlot();

  try {
    const args = [
      lhCli,
      url,
      "--output=json",
      "--quiet",
      "--chrome-flags=--headless --no-sandbox --disable-gpu",
      `--only-categories=${categories.join(",")}`,
      "--no-enable-error-reporting",
    ];

    if (device === "desktop") {
      args.push("--preset=desktop");
    }

    const { stdout } = await execFile(process.execPath, args, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
    });

    const lhr = JSON.parse(stdout);

    // Extract scores
    const scores: Record<string, number> = {};
    for (const [key, cat] of Object.entries(lhr.categories)) {
      scores[key] = Math.round((cat as any).score * 100);
    }

    // Extract CWV metrics
    const coreWebVitals: Record<string, any> = {};
    for (const [metric, auditId] of Object.entries(METRIC_AUDIT_MAP)) {
      const audit = lhr.audits[auditId];
      if (!audit?.numericValue && audit?.numericValue !== 0) {
        console.error(`Warning: missing audit "${auditId}" for metric "${metric}"`);
      }
      const value = audit?.numericValue ?? 0;
      const rounded = metric === "cls" ? Math.round(value * 1000) / 1000 : Math.round(value);
      coreWebVitals[metric] = {
        value: rounded,
        rating: getRating(metric as MetricKey, rounded),
      };
    }

    // Extract recommendations — audits with savings, sorted by impact
    const recommendations: Recommendation[] = [];
    for (const audit of Object.values(lhr.audits)) {
      const a = audit as any;
      if (
        a.score !== null &&
        a.score < 1 &&
        a.details?.overallSavingsMs > 0
      ) {
        recommendations.push({
          title: a.title,
          impact: a.details.overallSavingsMs > 1000 ? "high" : a.details.overallSavingsMs > 300 ? "medium" : "low",
          savings: `${Math.round(a.details.overallSavingsMs)}ms`,
          description: truncateDesc(a.description),
        });
      }
    }
    recommendations.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return (order[a.impact as keyof typeof order] ?? 3) - (order[b.impact as keyof typeof order] ?? 3);
    });

    // Extract diagnostics
    const networkAudit = lhr.audits["network-requests"] as any;
    const totalRequests = networkAudit?.details?.items?.length ?? 0;
    const totalBytes = (lhr.audits["total-byte-weight"] as any)?.numericValue ?? 0;
    const mainThreadBlocking = (lhr.audits["mainthread-work-breakdown"] as any)?.numericValue ?? 0;
    const domSize = (lhr.audits["dom-size"] as any)?.numericValue ?? 0;

    return {
      url: lhr.finalDisplayedUrl || url,
      timestamp: new Date().toISOString(),
      device,
      scores,
      coreWebVitals: coreWebVitals as AnalysisResult["coreWebVitals"],
      recommendations: recommendations.slice(0, 10),
      diagnostics: {
        totalRequests,
        totalBytes: Math.round(totalBytes),
        mainThreadBlocking: Math.round(mainThreadBlocking),
        domSize: Math.round(domSize),
      },
    };
  } catch (err: any) {
    // Contextual error messages
    if (err.killed || err.signal === "SIGTERM") {
      // Re-scan for Finder artifacts on timeout — they cause ESM loader deadlocks
      const guard = await ensureCleanNodeModules(lhDir);
      nodeModulesChecked = false; // force re-check on next run
      if (guard.cleaned) {
        throw new Error(
          `Lighthouse timed out — found macOS Finder artifacts in node_modules. Cleaned automatically; retry should work. To prevent: don't open node_modules in Finder.`
        );
      }
      throw new Error(`Lighthouse timed out analyzing ${url}`);
    }
    if (err.code === "ENOENT") {
      throw new Error(`Lighthouse CLI not found at ${lhCli}`);
    }
    const msg = err.stderr || err.message || "";
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/.test(msg)) {
      throw new Error(`URL unreachable: ${url}`);
    }
    if (/Chrome/.test(msg) && /not found|cannot find|no chrome/i.test(msg)) {
      throw new Error("Chrome not found — install Chrome or Chromium");
    }
    throw new Error(`Lighthouse failed for ${url}: ${msg}`);
  } finally {
    releaseSlot();
  }
}
