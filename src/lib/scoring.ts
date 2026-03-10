import type { MetricKey, Rating } from "./types.js";

export const THRESHOLDS: Record<MetricKey, { good: number; poor: number }> = {
  lcp: { good: 2500, poor: 4000 },
  fcp: { good: 1800, poor: 3000 },
  ttfb: { good: 800, poor: 1800 },
  cls: { good: 0.1, poor: 0.25 },
  tbt: { good: 200, poor: 600 },
  si: { good: 3400, poor: 5800 },
};

export const METRIC_UNITS: Record<MetricKey, string> = {
  lcp: "ms",
  fcp: "ms",
  ttfb: "ms",
  cls: "",
  tbt: "ms",
  si: "ms",
};

export function getRating(metric: MetricKey, value: number): Rating {
  const t = THRESHOLDS[metric];
  if (value <= t.good) return "good";
  if (value > t.poor) return "poor";
  return "needs-improvement";
}
