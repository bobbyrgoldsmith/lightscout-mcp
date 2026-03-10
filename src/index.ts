import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { analyzePerformance } from "./tools/analyze.js";
import { comparePerformance } from "./tools/compare.js";
import { checkThreshold } from "./tools/check.js";
import { crawlSite } from "./tools/crawl.js";

const server = new McpServer({
  name: "lightscout-mcp",
  version: "0.1.0",
});

server.tool(
  "analyze_performance",
  "Run Lighthouse on a URL and get Core Web Vitals scores, metrics, and prioritized recommendations. Returns LCP, FCP, CLS, TBT, SI, TTFB with good/needs-improvement/poor ratings.",
  {
    url: z.string().describe("URL to analyze"),
    device: z
      .enum(["mobile", "desktop"])
      .optional()
      .describe("Device emulation (default: mobile)"),
    categories: z
      .array(z.string())
      .optional()
      .describe(
        "Lighthouse categories: performance, accessibility, seo, best-practices (default: [performance])"
      ),
  },
  async (args) => {
    try {
      const result = await analyzePerformance(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "compare_performance",
  "Compare Core Web Vitals between two URLs, or the same URL on mobile vs desktop. Shows per-metric deltas with winner indicators.",
  {
    urlA: z.string().describe("First URL to compare"),
    urlB: z
      .string()
      .optional()
      .describe(
        "Second URL to compare. If omitted, compares urlA mobile vs desktop."
      ),
    device: z
      .enum(["mobile", "desktop"])
      .optional()
      .describe(
        "Device emulation when comparing two different URLs (default: mobile)"
      ),
  },
  async (args) => {
    try {
      const result = await comparePerformance(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "check_threshold",
  "Pass/fail check against performance thresholds. Use for CI quality gates. Defaults use Google's 'poor' thresholds — only fails if metrics are genuinely bad.",
  {
    url: z.string().describe("URL to check"),
    device: z
      .enum(["mobile", "desktop"])
      .optional()
      .describe("Device emulation (default: mobile)"),
    thresholds: z
      .object({
        performance: z
          .number()
          .optional()
          .describe("Minimum performance score (0-100)"),
        lcp: z.number().optional().describe("Max LCP in ms"),
        fcp: z.number().optional().describe("Max FCP in ms"),
        cls: z.number().optional().describe("Max CLS score"),
        tbt: z.number().optional().describe("Max TBT in ms"),
        ttfb: z.number().optional().describe("Max TTFB in ms"),
      })
      .optional()
      .describe(
        "Custom thresholds. Defaults to Google's 'poor' boundary."
      ),
  },
  async (args) => {
    try {
      const result = await checkThreshold(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "crawl_site",
  "Discover all pages on a site (via sitemap.xml or link crawling) and run Lighthouse on each. Returns per-page results plus site-wide summary with avg/min/max scores and common issues. Max 20 pages, 3 parallel runs.",
  {
    url: z.string().describe("Site URL or homepage to crawl"),
    device: z
      .enum(["mobile", "desktop"])
      .optional()
      .describe("Device emulation (default: mobile)"),
    maxPages: z
      .number()
      .optional()
      .describe("Maximum pages to analyze (default: 20, max: 20)"),
  },
  async (args) => {
    try {
      const result = await crawlSite(args);
      const { results: _full, ...condensed } = result;
      return {
        content: [{ type: "text", text: JSON.stringify(condensed) }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
