import type { AnalysisResult, Device } from "../src/lib/types.js";

export function mockResult(
  url = "https://example.com",
  perf = 85,
  device: Device = "mobile"
): AnalysisResult {
  return {
    url,
    timestamp: "2026-03-10T00:00:00.000Z",
    device,
    scores: { performance: perf },
    coreWebVitals: {
      lcp: { value: 2000, rating: "good" },
      fcp: { value: 1500, rating: "good" },
      cls: { value: 0.05, rating: "good" },
      tbt: { value: 250, rating: "needs-improvement" },
      si: { value: 3000, rating: "good" },
      ttfb: { value: 600, rating: "good" },
    },
    recommendations: [
      {
        title: "Remove unused JavaScript",
        impact: "high",
        savings: "1500ms",
        description: "Reduce unused JS",
      },
      {
        title: "Serve images in WebP",
        impact: "medium",
        savings: "500ms",
        description: "Use WebP or AVIF",
      },
    ],
    diagnostics: {
      totalRequests: 25,
      totalBytes: 500000,
      mainThreadBlocking: 3000,
      domSize: 800,
    },
  };
}
