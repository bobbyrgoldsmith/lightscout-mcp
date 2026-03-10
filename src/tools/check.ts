import { runLighthouse } from "../lib/lighthouse.js";
import { THRESHOLDS } from "../lib/scoring.js";
import type { Device, ThresholdResult, ThresholdCheck, MetricKey } from "../lib/types.js";

// Default thresholds use Google's "poor" boundary — only fails if genuinely red
const DEFAULT_THRESHOLDS: Record<string, number> = {
  performance: 50,
  lcp: THRESHOLDS.lcp.poor,
  fcp: THRESHOLDS.fcp.poor,
  cls: THRESHOLDS.cls.poor,
  tbt: THRESHOLDS.tbt.poor,
  ttfb: THRESHOLDS.ttfb.poor,
};

export async function checkThreshold(args: {
  url: string;
  device?: Device;
  thresholds?: Record<string, number>;
}): Promise<ThresholdResult> {
  const { url, device = "mobile", thresholds = {} } = args;

  if (!url || typeof url !== "string") {
    throw new Error("url is required");
  }

  const merged = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const analysis = await runLighthouse(url, device);

  const results: Record<string, ThresholdCheck> = {};
  const failedChecks: string[] = [];

  // Check performance score (higher is better)
  if (merged.performance !== undefined) {
    const value = analysis.scores.performance ?? 0;
    const passed = value >= merged.performance;
    results.performance = { metric: "performance", value, threshold: merged.performance, passed };
    if (!passed) failedChecks.push(`performance: ${value} < ${merged.performance}`);
  }

  // Check CWV metrics (lower is better)
  const cwvKeys: MetricKey[] = ["lcp", "fcp", "cls", "tbt", "ttfb"];
  for (const key of cwvKeys) {
    if (merged[key] !== undefined) {
      const value = analysis.coreWebVitals[key].value;
      const passed = value <= merged[key];
      results[key] = { metric: key, value, threshold: merged[key], passed };
      if (!passed) failedChecks.push(`${key}: ${value} > ${merged[key]}`);
    }
  }

  const passed = failedChecks.length === 0;
  const summary = passed
    ? `All ${Object.keys(results).length} checks passed for ${url}`
    : `${failedChecks.length} check(s) failed: ${failedChecks.join("; ")}`;

  return {
    url,
    device,
    timestamp: new Date().toISOString(),
    passed,
    results,
    failedChecks,
    summary,
  };
}
