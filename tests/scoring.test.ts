import { describe, it, expect } from "vitest";
import { getRating, THRESHOLDS, METRIC_UNITS } from "../src/lib/scoring.js";
import type { MetricKey } from "../src/lib/types.js";

describe("scoring", () => {
  describe("THRESHOLDS", () => {
    it("has all 6 metrics", () => {
      const keys = Object.keys(THRESHOLDS);
      expect(keys).toHaveLength(6);
      for (const k of ["lcp", "fcp", "cls", "tbt", "si", "ttfb"]) {
        expect(keys).toContain(k);
      }
    });

    it("good < poor for every metric", () => {
      for (const val of Object.values(THRESHOLDS)) {
        expect(val.good).toBeLessThan(val.poor);
      }
    });
  });

  describe("METRIC_UNITS", () => {
    it("has all 6 metrics", () => {
      expect(Object.keys(METRIC_UNITS)).toHaveLength(6);
    });

    it("time metrics use ms", () => {
      for (const k of ["lcp", "fcp", "tbt", "si", "ttfb"] as MetricKey[]) {
        expect(METRIC_UNITS[k]).toBe("ms");
      }
    });

    it("CLS has empty unit", () => {
      expect(METRIC_UNITS.cls).toBe("");
    });
  });

  describe("getRating", () => {
    it("returns good at or below good threshold", () => {
      expect(getRating("lcp", 2500)).toBe("good");
      expect(getRating("lcp", 1000)).toBe("good");
      expect(getRating("cls", 0.1)).toBe("good");
      expect(getRating("cls", 0)).toBe("good");
    });

    it("returns needs-improvement between good and poor", () => {
      expect(getRating("lcp", 2501)).toBe("needs-improvement");
      expect(getRating("lcp", 3999)).toBe("needs-improvement");
      expect(getRating("cls", 0.11)).toBe("needs-improvement");
      expect(getRating("cls", 0.25)).toBe("needs-improvement");
    });

    it("returns poor above poor threshold", () => {
      expect(getRating("lcp", 4001)).toBe("poor");
      expect(getRating("cls", 0.26)).toBe("poor");
      expect(getRating("tbt", 601)).toBe("poor");
    });

    it("handles boundaries for all metrics", () => {
      const cases: [MetricKey, number, string][] = [
        // At good boundary → good
        ["fcp", 1800, "good"],
        ["tbt", 200, "good"],
        ["si", 3400, "good"],
        ["ttfb", 800, "good"],
        // Just above good → needs-improvement
        ["fcp", 1801, "needs-improvement"],
        ["tbt", 201, "needs-improvement"],
        ["si", 3401, "needs-improvement"],
        ["ttfb", 801, "needs-improvement"],
        // At poor boundary → needs-improvement (> not >=)
        ["fcp", 3000, "needs-improvement"],
        ["tbt", 600, "needs-improvement"],
        ["si", 5800, "needs-improvement"],
        ["ttfb", 1800, "needs-improvement"],
        // Just above poor → poor
        ["fcp", 3001, "poor"],
        ["tbt", 601, "poor"],
        ["si", 5801, "poor"],
        ["ttfb", 1801, "poor"],
      ];
      for (const [metric, value, expected] of cases) {
        expect(getRating(metric, value), `${metric}=${value}`).toBe(expected);
      }
    });
  });
});
