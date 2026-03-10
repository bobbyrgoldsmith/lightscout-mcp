# LightScout MCP

> **Part of the [TestScout MCP Suite](https://testscout.dev)** — AI-powered QA tools for modern development teams.

Core Web Vitals analysis powered by Lighthouse. Runs as an MCP server for AI coding tools (Claude Code, Cursor, Windsurf, etc.) or as a standalone CLI for CI pipelines and terminals. Four tools: analyze a URL, compare two URLs, check against thresholds, or crawl an entire site.

## Requirements

- Node.js >= 18
- Google Chrome or Chromium

## MCP Server Setup

### Claude Code

```bash
claude mcp add lightscout -- npx -y lightscout-mcp
```

### Cursor, VS Code, Windsurf, Cline, Roo Code, Gemini CLI

All use the same `mcpServers` JSON format. Add this to the appropriate config file:

```json
{
  "mcpServers": {
    "lightscout": {
      "command": "npx",
      "args": ["-y", "lightscout-mcp"]
    }
  }
}
```

| Client            | Config file                                 |
|-------------------|---------------------------------------------|
| Cursor            | `~/.cursor/mcp.json`                        |
| VS Code (Copilot) | `.vscode/mcp.json`                          |
| Windsurf          | `~/.codeium/windsurf/mcp_config.json`       |
| Cline             | Settings > MCP > Edit Config                |
| Roo Code          | `.roo/mcp.json`                             |
| Gemini CLI        | `~/.gemini/settings.json`                   |

### Zed

Zed uses `context_servers` instead of `mcpServers`:

```json
{
  "context_servers": {
    "lightscout": {
      "command": "npx",
      "args": ["-y", "lightscout-mcp"]
    }
  }
}
```

## CLI

### Install

```bash
npm install -g lightscout-mcp
```

### Try without installing

```bash
npx -p lightscout-mcp lightscout analyze https://example.com
```

### Commands

```
lightscout analyze <url> [--device mobile|desktop] [--categories perf,a11y,seo,best-practices]
lightscout compare <urlA> [urlB] [--device mobile|desktop]
lightscout crawl <url> [--max-pages N] [--device mobile|desktop]
lightscout check <url> [--perf 90] [--lcp 2500] [--fcp 3000] [--cls 0.1] [--tbt 300] [--ttfb 1800]
```

### Examples

Analyze a single page:

```bash
lightscout analyze https://example.com
lightscout analyze https://example.com --device desktop --categories performance,accessibility
```

Compare two URLs, or the same URL on mobile vs desktop:

```bash
lightscout compare https://a.com https://b.com
lightscout compare https://example.com                    # mobile vs desktop
```

Crawl a site and audit discovered pages:

```bash
lightscout crawl https://example.com --max-pages 5
```

CI quality gate (exits 1 on failure):

```bash
lightscout check https://example.com --perf 90 --lcp 2500
```

## Tools

### analyze_performance

Run Lighthouse on a URL. Returns performance scores, Core Web Vitals (LCP, FCP, CLS, TBT, SI, TTFB) with good/needs-improvement/poor ratings, top recommendations sorted by impact, and diagnostics.

| Parameter    | Type                          | Required | Description                                                    |
|--------------|-------------------------------|----------|----------------------------------------------------------------|
| `url`        | string                        | yes      | URL to analyze                                                 |
| `device`     | `"mobile"` \| `"desktop"`     | no       | Device emulation (default: mobile)                             |
| `categories` | string[]                      | no       | Lighthouse categories (default: `["performance"]`)             |

### compare_performance

Compare Core Web Vitals between two URLs, or the same URL on mobile vs desktop. Shows per-metric deltas with winner indicators.

| Parameter | Type                          | Required | Description                                                    |
|-----------|-------------------------------|----------|----------------------------------------------------------------|
| `urlA`    | string                        | yes      | First URL                                                      |
| `urlB`    | string                        | no       | Second URL. If omitted, compares urlA mobile vs desktop        |
| `device`  | `"mobile"` \| `"desktop"`     | no       | Device emulation when comparing two URLs (default: mobile)     |

### check_threshold

Pass/fail check against performance thresholds. Useful for CI quality gates.

| Parameter    | Type                          | Required | Description                                       |
|--------------|-------------------------------|----------|---------------------------------------------------|
| `url`        | string                        | yes      | URL to check                                      |
| `device`     | `"mobile"` \| `"desktop"`     | no       | Device emulation (default: mobile)                |
| `thresholds` | object                        | no       | Custom thresholds (see defaults below)            |

Default thresholds use Google's "poor" boundary -- only fails if metrics are genuinely bad:

| Metric      | Default (fail if worse) |
|-------------|------------------------|
| performance | < 50                   |
| LCP         | > 4000ms               |
| FCP         | > 3000ms               |
| CLS         | > 0.25                 |
| TBT         | > 600ms                |
| TTFB        | > 1800ms               |

### crawl_site

Discover pages on a site (via sitemap.xml or link crawling) and run Lighthouse on each. Returns per-page results plus site-wide summary with avg/min/max scores and common issues.

| Parameter  | Type                          | Required | Description                                       |
|------------|-------------------------------|----------|---------------------------------------------------|
| `url`      | string                        | yes      | Site URL or homepage to crawl                     |
| `device`   | `"mobile"` \| `"desktop"`     | no       | Device emulation (default: mobile)                |
| `maxPages` | number                        | no       | Maximum pages to analyze (default: 20, max: 20)   |

Pages are discovered via sitemap.xml first, falling back to link crawling. Up to 3 Lighthouse runs execute in parallel.

## CWV Rating Thresholds

| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| LCP | <= 2500ms | 2500-4000ms | > 4000ms |
| FCP | <= 1800ms | 1800-3000ms | > 3000ms |
| CLS | <= 0.1 | 0.1-0.25 | > 0.25 |
| TBT | <= 200ms | 200-600ms | > 600ms |
| SI | <= 3400ms | 3400-5800ms | > 5800ms |
| TTFB | <= 800ms | 800-1800ms | > 1800ms |

## Notes

- TBT (Total Blocking Time) is used instead of INP/FID because Lighthouse runs lab-only tests with no real user interaction.
- Up to 3 concurrent Lighthouse runs (semaphore-controlled).
- Chrome is launched headless and killed after each audit.
- MCP responses are token-optimized with condensed metrics and compact JSON.

## TestScout MCP Suite

LightScout is the first tool in the TestScout MCP Suite. More tools are coming:

| Tool | Description | Status |
|------|-------------|--------|
| **lightscout-mcp** | Core Web Vitals & Lighthouse analysis | Available |
| testscout-diagnose | Error triage & root cause analysis | Coming soon |
| testscout-scrape | Structured data extraction for testing | Coming soon |
| testscout-plan | AI test plan & code generation | Coming soon |
| testscout-load | Load test generation & analysis | Coming soon |
| testscout-maintain | Self-healing test maintenance | Coming soon |

Follow development at [testscout.dev](https://testscout.dev).

## License

MIT
