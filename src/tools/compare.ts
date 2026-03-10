import { runLighthouse } from "../lib/lighthouse.js";
import type { Device, ComparisonResult, MetricKey } from "../lib/types.js";

export async function comparePerformance(args: {
  urlA: string;
  urlB?: string;
  device?: Device;
}): Promise<ComparisonResult> {
  const { urlA, urlB, device = "mobile" } = args;

  if (!urlA || typeof urlA !== "string") {
    throw new Error("urlA is required");
  }

  // If no urlB, compare same URL mobile vs desktop
  const isCrossDevice = !urlB;
  const deviceA: Device = isCrossDevice ? "mobile" : device;
  const deviceB: Device = isCrossDevice ? "desktop" : device;
  const targetB = urlB || urlA;

  const [resultA, resultB] = await Promise.all([
    runLighthouse(urlA, deviceA),
    runLighthouse(targetB, deviceB),
  ]);

  const metrics: ComparisonResult["metrics"] = {};
  const cwvKeys: MetricKey[] = ["lcp", "fcp", "cls", "tbt", "si", "ttfb"];

  for (const key of cwvKeys) {
    const a = resultA.coreWebVitals[key].value;
    const b = resultB.coreWebVitals[key].value;
    const delta = Math.round((b - a) * 1000) / 1000;
    // Lower is better for all metrics
    metrics[key] = {
      a,
      b,
      delta,
      winner: delta > 0 ? "A" : delta < 0 ? "B" : "tie",
    };
  }

  // Performance scores
  const scoreA = resultA.scores.performance ?? 0;
  const scoreB = resultB.scores.performance ?? 0;
  metrics["performance"] = {
    a: scoreA,
    b: scoreB,
    delta: scoreB - scoreA,
    // Higher is better for score
    winner: scoreA > scoreB ? "A" : scoreA < scoreB ? "B" : "tie",
  };

  const labelA = isCrossDevice ? `${urlA} (mobile)` : urlA;
  const labelB = isCrossDevice ? `${urlA} (desktop)` : urlB!;
  const winsA = Object.values(metrics).filter((m) => m.winner === "A").length;
  const winsB = Object.values(metrics).filter((m) => m.winner === "B").length;

  let summary: string;
  if (winsA > winsB) {
    summary = `${labelA} wins ${winsA}-${winsB} across metrics. Performance: ${scoreA} vs ${scoreB}.`;
  } else if (winsB > winsA) {
    summary = `${labelB} wins ${winsB}-${winsA} across metrics. Performance: ${scoreB} vs ${scoreA}.`;
  } else {
    summary = `Tie at ${winsA}-${winsB}. Performance: ${scoreA} vs ${scoreB}.`;
  }

  return {
    urlA,
    urlB: targetB,
    deviceA,
    deviceB,
    timestamp: new Date().toISOString(),
    metrics,
    summary,
  };
}
