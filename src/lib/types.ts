export type Device = "mobile" | "desktop";
export type Rating = "good" | "needs-improvement" | "poor";
export type MetricKey = "lcp" | "fcp" | "cls" | "tbt" | "si" | "ttfb";

export interface MetricResult {
  value: number;
  rating: Rating;
}

export interface Recommendation {
  title: string;
  impact: string;
  savings: string;
  description: string;
}

export interface Diagnostics {
  totalRequests: number;
  totalBytes: number;
  mainThreadBlocking: number;
  domSize: number;
}

export interface AnalysisResult {
  url: string;
  timestamp: string;
  device: Device;
  scores: Record<string, number>;
  coreWebVitals: Record<MetricKey, MetricResult>;
  recommendations: Recommendation[];
  diagnostics: Diagnostics;
}

export interface ComparisonResult {
  urlA: string;
  urlB: string;
  deviceA: Device;
  deviceB: Device;
  timestamp: string;
  metrics: Record<
    string,
    { a: number; b: number; delta: number; winner: "A" | "B" | "tie" }
  >;
  summary: string;
}

export interface ThresholdCheck {
  metric: string;
  value: number;
  threshold: number;
  passed: boolean;
}

export interface ThresholdResult {
  url: string;
  device: Device;
  timestamp: string;
  passed: boolean;
  results: Record<string, ThresholdCheck>;
  failedChecks: string[];
  summary: string;
}

export interface CrawlPageResult {
  url: string;
  score: number | null;
  error?: string;
}

export interface CrawlPageScore {
  url: string;
  performance: number;
  lcp: number;
  fcp: number;
  cls: number;
  tbt: number;
  si: number;
  ttfb: number;
  rating: Rating;
}

export interface CrawlResult {
  site: string;
  device: Device;
  timestamp: string;
  pagesAnalyzed: number;
  pagesDiscovered: number;
  discoveryMethod: "sitemap" | "crawl";
  pageScores: CrawlPageScore[];
  results: AnalysisResult[];
  errors: Array<{ url: string; error: string }>;
  summary: {
    avgScore: number;
    minScore: number;
    maxScore: number;
    worstPage: string;
    bestPage: string;
    commonIssues: Array<{ title: string; count: number }>;
  };
}
