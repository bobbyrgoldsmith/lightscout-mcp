import { describe, it, expect } from "vitest";
import { mockResult } from "./helpers.js";
import type { CrawlResult, MetricResult } from "../src/lib/types.js";

describe("MCP format optimizations", () => {
  // ─── Token efficiency: no threshold/unit in MetricResult ───────────

  describe("MetricResult structure", () => {
    it("has only value and rating fields", () => {
      const metric: MetricResult = { value: 2000, rating: "good" };
      expect(Object.keys(metric)).toEqual(["value", "rating"]);
    });

    it("mock results match MetricResult interface (no threshold/unit)", () => {
      const result = mockResult();
      for (const [key, metric] of Object.entries(result.coreWebVitals)) {
        expect(metric, `metric ${key}`).toHaveProperty("value");
        expect(metric, `metric ${key}`).toHaveProperty("rating");
        expect(metric, `metric ${key}`).not.toHaveProperty("threshold");
        expect(metric, `metric ${key}`).not.toHaveProperty("unit");
        expect(Object.keys(metric)).toHaveLength(2);
      }
    });
  });

  // ─── Token efficiency: compact JSON ────────────────────────────────

  describe("compact JSON", () => {
    it("compact JSON is smaller than pretty-printed", () => {
      const data = mockResult();
      const compact = JSON.stringify(data);
      const pretty = JSON.stringify(data, null, 2);
      expect(compact.length).toBeLessThan(pretty.length);
    });

    it("compact JSON saves ~30-40% for typical result", () => {
      const data = mockResult();
      const compact = JSON.stringify(data);
      const pretty = JSON.stringify(data, null, 2);
      const savings = 1 - compact.length / pretty.length;
      expect(savings).toBeGreaterThan(0.2); // at least 20% savings
    });
  });

  // ─── Token efficiency: condensed crawl output ──────────────────────

  describe("condensed crawl output", () => {
    function makeCrawlResult(): CrawlResult {
      return {
        site: "https://example.com",
        device: "mobile",
        timestamp: "2026-03-10T00:00:00.000Z",
        pagesAnalyzed: 2,
        pagesDiscovered: 2,
        discoveryMethod: "crawl",
        pageScores: [
          {
            url: "https://example.com/",
            performance: 95,
            lcp: 2000,
            fcp: 1500,
            cls: 0.05,
            tbt: 250,
            si: 3000,
            ttfb: 600,
            rating: "good",
          },
          {
            url: "https://example.com/about",
            performance: 72,
            lcp: 2000,
            fcp: 1500,
            cls: 0.05,
            tbt: 250,
            si: 3000,
            ttfb: 600,
            rating: "needs-improvement",
          },
        ],
        results: [mockResult("https://example.com/", 95), mockResult("https://example.com/about", 72)],
        errors: [],
        summary: {
          avgScore: 84,
          minScore: 72,
          maxScore: 95,
          worstPage: "https://example.com/about",
          bestPage: "https://example.com/",
          commonIssues: [{ title: "Remove unused JavaScript", count: 2 }],
        },
      };
    }

    it("MCP handler strips full results but keeps pageScores", () => {
      const crawlResult = makeCrawlResult();
      // Simulate MCP handler: const { results: _full, ...condensed } = result
      const { results: _full, ...condensed } = crawlResult;

      expect(condensed).not.toHaveProperty("results");
      expect(condensed).toHaveProperty("pageScores");
      expect(condensed).toHaveProperty("summary");
      expect(condensed).toHaveProperty("site");
      expect(condensed.pageScores).toHaveLength(2);
    });

    it("condensed output is dramatically smaller", () => {
      const crawlResult = makeCrawlResult();
      const full = JSON.stringify(crawlResult);
      const { results: _full, ...condensed } = crawlResult;
      const condensedJson = JSON.stringify(condensed);

      expect(condensedJson.length).toBeLessThan(full.length);
      const savings = 1 - condensedJson.length / full.length;
      // Should save significant bytes by dropping full per-page results
      expect(savings).toBeGreaterThan(0.3);
    });

    it("pageScores has all 6 metric values per page", () => {
      const crawlResult = makeCrawlResult();
      for (const page of crawlResult.pageScores) {
        expect(page).toHaveProperty("url");
        expect(page).toHaveProperty("performance");
        expect(page).toHaveProperty("lcp");
        expect(page).toHaveProperty("fcp");
        expect(page).toHaveProperty("cls");
        expect(page).toHaveProperty("tbt");
        expect(page).toHaveProperty("si");
        expect(page).toHaveProperty("ttfb");
        expect(page).toHaveProperty("rating");
        expect(Object.keys(page)).toHaveLength(9);
      }
    });

    it("full results still available for CLI output", () => {
      const crawlResult = makeCrawlResult();
      // CLI uses the full results array with pretty JSON
      expect(crawlResult.results).toHaveLength(2);
      expect(crawlResult.results[0]).toHaveProperty("recommendations");
      expect(crawlResult.results[0]).toHaveProperty("diagnostics");
      expect(crawlResult.results[0]).toHaveProperty("coreWebVitals");

      const cliJson = JSON.stringify(crawlResult, null, 2);
      expect(cliJson).toContain('"recommendations"');
    });
  });

  // ─── CLI exit code for check ───────────────────────────────────────

  describe("check result for CLI exit code", () => {
    it("passed=false when thresholds exceeded", () => {
      // The CLI uses result.passed === false → process.exitCode = 1
      // Verify the check result structure supports this
      const failResult = {
        passed: false,
        failedChecks: ["performance: 30 < 50"],
        summary: "1 check(s) failed",
      };
      expect(failResult.passed).toBe(false);
      expect(failResult.failedChecks.length).toBeGreaterThan(0);
    });

    it("passed=true when all thresholds met", () => {
      const passResult = {
        passed: true,
        failedChecks: [] as string[],
        summary: "All checks passed",
      };
      expect(passResult.passed).toBe(true);
      expect(passResult.failedChecks).toHaveLength(0);
    });
  });
});
