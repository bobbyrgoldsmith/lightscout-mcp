import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockResult } from "./helpers.js";

vi.mock("../src/lib/lighthouse.js", () => ({
  runLighthouse: vi.fn(),
  truncateDesc: vi.fn((s: string) => s),
}));

vi.mock("../src/lib/crawler.js", () => ({
  discoverUrls: vi.fn(),
}));

import { runLighthouse } from "../src/lib/lighthouse.js";
import { discoverUrls } from "../src/lib/crawler.js";
import { analyzePerformance } from "../src/tools/analyze.js";
import { comparePerformance } from "../src/tools/compare.js";
import { checkThreshold } from "../src/tools/check.js";
import { crawlSite } from "../src/tools/crawl.js";

const mockedRunLH = vi.mocked(runLighthouse);
const mockedDiscover = vi.mocked(discoverUrls);

beforeEach(() => {
  vi.clearAllMocks();
  mockedRunLH.mockResolvedValue(mockResult());
});

// ─── analyze_performance ─────────────────────────────────────────────

describe("analyzePerformance", () => {
  it("returns AnalysisResult with correct structure", async () => {
    const result = await analyzePerformance({ url: "https://example.com" });
    expect(result).toHaveProperty("url");
    expect(result).toHaveProperty("scores");
    expect(result).toHaveProperty("coreWebVitals");
    expect(result).toHaveProperty("recommendations");
    expect(result).toHaveProperty("diagnostics");
  });

  it("defaults to mobile device", async () => {
    await analyzePerformance({ url: "https://example.com" });
    expect(mockedRunLH).toHaveBeenCalledWith(
      "https://example.com",
      "mobile",
      ["performance"]
    );
  });

  it("passes custom device and categories", async () => {
    await analyzePerformance({
      url: "https://example.com",
      device: "desktop",
      categories: ["performance", "accessibility"],
    });
    expect(mockedRunLH).toHaveBeenCalledWith(
      "https://example.com",
      "desktop",
      ["performance", "accessibility"]
    );
  });

  it("filters invalid categories", async () => {
    await analyzePerformance({
      url: "https://example.com",
      categories: ["performance", "invalid-cat"],
    });
    expect(mockedRunLH).toHaveBeenCalledWith(
      "https://example.com",
      "mobile",
      ["performance"]
    );
  });

  it("throws on missing url", async () => {
    await expect(analyzePerformance({ url: "" })).rejects.toThrow(
      "url is required"
    );
  });

  it("metrics have value and rating only (no threshold/unit)", async () => {
    const result = await analyzePerformance({ url: "https://example.com" });
    for (const metric of Object.values(result.coreWebVitals)) {
      expect(Object.keys(metric)).toEqual(
        expect.arrayContaining(["value", "rating"])
      );
      expect(metric).not.toHaveProperty("threshold");
      expect(metric).not.toHaveProperty("unit");
    }
  });
});

// ─── compare_performance ─────────────────────────────────────────────

describe("comparePerformance", () => {
  it("runs two URLs in parallel", async () => {
    const callOrder: string[] = [];

    mockedRunLH.mockImplementation(async (url) => {
      callOrder.push(`start:${url}`);
      await new Promise((r) => setTimeout(r, 50));
      callOrder.push(`end:${url}`);
      return mockResult(url as string);
    });

    await comparePerformance({
      urlA: "https://a.com",
      urlB: "https://b.com",
    });

    // Both should start before either ends
    expect(callOrder[0]).toBe("start:https://a.com");
    expect(callOrder[1]).toBe("start:https://b.com");
    expect(callOrder.indexOf("end:https://a.com")).toBeGreaterThan(1);
    expect(callOrder.indexOf("end:https://b.com")).toBeGreaterThan(1);
  });

  it("compares same URL mobile vs desktop when urlB omitted", async () => {
    mockedRunLH.mockImplementation(async (url, device) => {
      return mockResult(url as string, 85, device);
    });

    const result = await comparePerformance({ urlA: "https://example.com" });

    expect(mockedRunLH).toHaveBeenCalledTimes(2);
    expect(result.deviceA).toBe("mobile");
    expect(result.deviceB).toBe("desktop");
    expect(result.urlA).toBe("https://example.com");
    expect(result.urlB).toBe("https://example.com");
  });

  it("calculates metric deltas correctly", async () => {
    mockedRunLH
      .mockResolvedValueOnce(mockResult("https://a.com", 90))
      .mockResolvedValueOnce(
        (() => {
          const r = mockResult("https://b.com", 70);
          r.coreWebVitals.lcp = { value: 3000, rating: "needs-improvement" };
          return r;
        })()
      );

    const result = await comparePerformance({
      urlA: "https://a.com",
      urlB: "https://b.com",
    });

    expect(result.metrics.lcp.a).toBe(2000);
    expect(result.metrics.lcp.b).toBe(3000);
    expect(result.metrics.lcp.delta).toBe(1000);
    // Lower is better for LCP, so A wins
    expect(result.metrics.lcp.winner).toBe("A");
  });

  it("determines overall winner in summary", async () => {
    mockedRunLH
      .mockResolvedValueOnce(mockResult("https://a.com", 90))
      .mockResolvedValueOnce(mockResult("https://b.com", 70));

    const result = await comparePerformance({
      urlA: "https://a.com",
      urlB: "https://b.com",
    });

    // Performance score: A=90 > B=70 → A wins performance metric
    expect(result.metrics.performance.winner).toBe("A");
    expect(result.summary).toContain("90");
    expect(result.summary).toContain("70");
  });

  it("throws on missing urlA", async () => {
    await expect(comparePerformance({ urlA: "" })).rejects.toThrow(
      "urlA is required"
    );
  });
});

// ─── check_threshold ─────────────────────────────────────────────────

describe("checkThreshold", () => {
  it("passes when all metrics within thresholds", async () => {
    // Default mock has perf=85, all metrics in good range
    const result = await checkThreshold({ url: "https://example.com" });
    expect(result.passed).toBe(true);
    expect(result.failedChecks).toHaveLength(0);
  });

  it("fails when performance below threshold", async () => {
    mockedRunLH.mockResolvedValue(mockResult("https://example.com", 30));

    const result = await checkThreshold({
      url: "https://example.com",
      thresholds: { performance: 50 },
    });

    expect(result.passed).toBe(false);
    expect(result.failedChecks.length).toBeGreaterThan(0);
    expect(result.failedChecks[0]).toContain("performance");
  });

  it("fails when custom metric threshold exceeded", async () => {
    const result = await checkThreshold({
      url: "https://example.com",
      thresholds: { lcp: 1000 }, // mock LCP is 2000
    });

    expect(result.passed).toBe(false);
    expect(result.failedChecks.some((f) => f.includes("lcp"))).toBe(true);
  });

  it("includes all checked metrics in results", async () => {
    const result = await checkThreshold({
      url: "https://example.com",
      thresholds: { performance: 50, lcp: 5000, cls: 1 },
    });

    expect(result.results).toHaveProperty("performance");
    expect(result.results).toHaveProperty("lcp");
    expect(result.results).toHaveProperty("cls");
    // Each result has the right shape
    expect(result.results.performance).toEqual({
      metric: "performance",
      value: 85,
      threshold: 50,
      passed: true,
    });
  });

  it("summary indicates pass or fail", async () => {
    const pass = await checkThreshold({ url: "https://example.com" });
    expect(pass.summary).toContain("passed");

    mockedRunLH.mockResolvedValue(mockResult("https://example.com", 10));
    const fail = await checkThreshold({
      url: "https://example.com",
      thresholds: { performance: 50 },
    });
    expect(fail.summary).toContain("failed");
  });

  it("throws on missing url", async () => {
    await expect(checkThreshold({ url: "" })).rejects.toThrow(
      "url is required"
    );
  });
});

// ─── crawl_site ──────────────────────────────────────────────────────

describe("crawlSite", () => {
  beforeEach(() => {
    mockedDiscover.mockResolvedValue({
      urls: ["https://example.com/", "https://example.com/about"],
      method: "crawl",
    });
    mockedRunLH
      .mockResolvedValueOnce(mockResult("https://example.com/", 95))
      .mockResolvedValueOnce(mockResult("https://example.com/about", 72));
  });

  it("builds pageScores with condensed metrics", async () => {
    const result = await crawlSite({ url: "https://example.com" });

    expect(result.pageScores).toHaveLength(2);
    expect(result.pageScores[0]).toEqual({
      url: "https://example.com/",
      performance: 95,
      lcp: 2000,
      fcp: 1500,
      cls: 0.05,
      tbt: 250,
      si: 3000,
      ttfb: 600,
      rating: "good",
    });
  });

  it("assigns correct rating based on performance score", async () => {
    const result = await crawlSite({ url: "https://example.com" });
    // 95 >= 90 → good
    expect(result.pageScores[0].rating).toBe("good");
    // 72 >= 50 but < 90 → needs-improvement
    expect(result.pageScores[1].rating).toBe("needs-improvement");
  });

  it("assigns poor rating for low scores", async () => {
    mockedRunLH.mockReset();
    mockedDiscover.mockResolvedValue({
      urls: ["https://example.com/"],
      method: "crawl",
    });
    mockedRunLH.mockResolvedValueOnce(mockResult("https://example.com/", 30));

    const result = await crawlSite({ url: "https://example.com" });
    expect(result.pageScores[0].rating).toBe("poor");
  });

  it("still includes full results array", async () => {
    const result = await crawlSite({ url: "https://example.com" });
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toHaveProperty("recommendations");
    expect(result.results[0]).toHaveProperty("diagnostics");
  });

  it("calculates summary correctly", async () => {
    const result = await crawlSite({ url: "https://example.com" });
    expect(result.summary.avgScore).toBe(84); // Math.round((95+72)/2) = 84
    expect(result.summary.minScore).toBe(72);
    expect(result.summary.maxScore).toBe(95);
    expect(result.summary.worstPage).toBe("https://example.com/about");
    expect(result.summary.bestPage).toBe("https://example.com/");
  });

  it("aggregates common issues across pages", async () => {
    const result = await crawlSite({ url: "https://example.com" });
    // Both pages have the same 2 recs, so each appears 2 times
    expect(result.summary.commonIssues.length).toBeGreaterThan(0);
    expect(result.summary.commonIssues[0].count).toBe(2);
  });

  it("respects maxPages cap", async () => {
    mockedRunLH.mockReset();
    mockedDiscover.mockResolvedValue({
      urls: Array.from({ length: 10 }, (_, i) => `https://example.com/p${i}`),
      method: "crawl",
    });
    for (let i = 0; i < 3; i++) {
      mockedRunLH.mockResolvedValueOnce(
        mockResult(`https://example.com/p${i}`, 80)
      );
    }

    const result = await crawlSite({
      url: "https://example.com",
      maxPages: 3,
    });
    expect(mockedRunLH).toHaveBeenCalledTimes(3);
    expect(result.pagesAnalyzed).toBe(3);
  });

  it("captures errors for failed pages", async () => {
    mockedRunLH.mockReset();
    mockedDiscover.mockResolvedValue({
      urls: ["https://example.com/", "https://example.com/broken"],
      method: "crawl",
    });
    mockedRunLH
      .mockResolvedValueOnce(mockResult("https://example.com/", 90))
      .mockRejectedValueOnce(new Error("Lighthouse timed out"));

    const result = await crawlSite({ url: "https://example.com" });
    expect(result.results).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("timed out");
  });

  it("reports discovery method", async () => {
    mockedDiscover.mockResolvedValue({
      urls: ["https://example.com/"],
      method: "sitemap",
    });
    mockedRunLH.mockReset();
    mockedRunLH.mockResolvedValueOnce(mockResult("https://example.com/", 90));

    const result = await crawlSite({ url: "https://example.com" });
    expect(result.discoveryMethod).toBe("sitemap");
  });

  it("throws when no pages found", async () => {
    mockedDiscover.mockResolvedValue({ urls: [], method: "crawl" });
    await expect(crawlSite({ url: "https://example.com" })).rejects.toThrow(
      "No pages found"
    );
  });
});
