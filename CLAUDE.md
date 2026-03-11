# CLAUDE.md — LightScout MCP

## Overview
Dual-mode Core Web Vitals analysis powered by Lighthouse. First tool in the TestScout MCP Suite.
Published as npm package `lightscout-mcp`.

**Two entry points, same core logic:**
- `lightscout-mcp` → MCP server (AI tools: Claude Code, Cursor, Windsurf, n8n)
- `lightscout` → CLI (CI/CD, shell scripts, non-AI users)

## Commands
```bash
yarn build       # Build via tsup → dist/index.js + dist/cli.js (ESM)
yarn dev         # Build with watch mode
yarn clean       # Nuke node_modules (handles Finder artifacts with spaces)
yarn verify      # Check critical deps exist
```

## CLI Usage
```bash
lightscout analyze <url> [--device mobile|desktop] [--categories perf,a11y]
lightscout compare <urlA> [urlB] [--device mobile|desktop]
lightscout crawl <url> [--device mobile|desktop] [--max-pages 20]
lightscout check <url> [--perf 90] [--lcp 2500] [--cls 0.1] [--tbt 300]
lightscout --help | --version
```

## Architecture
- `src/index.ts` — MCP server entry, registers 4 tools via `@modelcontextprotocol/sdk` 1.12.1
- `src/cli.ts` — CLI entry, 4 subcommands, lightweight arg parsing, JSON to stdout
- `src/tools/analyze.ts` — `analyze_performance` (single URL)
- `src/tools/compare.ts` — `compare_performance` (two URLs or mobile vs desktop)
- `src/tools/check.ts` — `check_threshold` (CI pass/fail)
- `src/tools/crawl.ts` — `crawl_site` (site-wide audit: discover pages + parallel Lighthouse)
- `src/lib/lighthouse.ts` — Subprocess launcher: spawns Lighthouse CLI, parses JSON. Semaphore (3 concurrent) prevents resource contention.
- `src/lib/crawler.ts` — URL discovery: tries sitemap.xml first, falls back to BFS link crawling. Returns `{ urls, method }`. Max 20 pages.
- `src/lib/scoring.ts` — CWV thresholds + getRating() (ported from LightScout Chrome extension)
- `src/lib/types.ts` — Shared TypeScript interfaces

## Key Decisions
- **SDK pinned to 1.12.1** — v1.27.1 imports zod/v4 which causes module-loading hang in Node 22 (CJS shim deadlock on 27+ submodules). 1.12.1 uses zod v3 + ajv v6, loads fast.
- **Zod v3 for tool schemas** — SDK 1.12.1's `.tool()` expects `ZodRawShape`, not raw JSON Schema.
- **Subprocess model** — Lighthouse runs as a child process (`execFile` → `node lighthouse/cli/index.js`), avoiding ESM loader deadlocks on Node 22. The CLI manages its own Chrome lifecycle. Desktop mode uses `--preset=desktop` (auto-updated UA). Lighthouse must remain as a dependency for CLI binary resolution.
- **SDK + zod bundled** — tsup inlines SDK + zod (~244KB) so server works from any CWD. Lighthouse stays external (large, spawned as subprocess).

## MCP Server Registration
```bash
claude mcp add -s user lightscout node /Users/bobbyg/Documents/test-scout/lightscout-mcp/dist/index.js
```

After npm publish:
```bash
claude mcp add -s user lightscout npx -y lightscout-mcp
```

## Testing
MCP: Server responds to JSON-RPC over stdio. `initialize` → server info, `tools/list` → 4 tools.
CLI: `node dist/cli.js analyze https://example.com` → JSON to stdout. All 4 commands verified March 10.
Lighthouse subprocess requires Chrome installed. The CLI manages Chrome lifecycle internally.

## macOS Finder Artifact Mitigation (v0.1.2)
Finder creates duplicate dirs with spaces (e.g. `lighthouse 2/`) inside `node_modules` when browsing in Finder. These corrupt the dependency tree and cause Lighthouse subprocess hangs via Node 22 ESM loader deadlock.

**Three-layer defense:**
1. **Runtime guard** (`src/lib/finder-guard.ts`) — `ensureCleanNodeModules()` runs once before first Lighthouse spawn. Scans `node_modules/` root + `node_modules/lighthouse/` for entries matching `/^.+ \d+$/`, removes them with `fs.rm`. If timeout occurs, re-scans and provides specific error message.
2. **`.metadata_never_index`** — Postinstall script creates this file in `node_modules/` to discourage Spotlight/Finder indexing.
3. **Manual fallback** — `yarn clean && yarn install` still works. Avoid opening `node_modules` in Finder.

## Repair Log — March 6, 2026: ESM Deadlock Fix

### Problem
Lighthouse (v11 and v12) deadlocked when imported in-process on Node 22.17.0. The `core/index.cjs` shim internally does `await import('./index.js')` which triggers Node 22's ESM loader worker thread deadlock (known issues: nodejs/node#53097, nodejs/node#50948, GoogleChrome/lighthouse#15130). The deadlock was caused by the complex module graph (50+ nested ESM imports) combined with other project dependencies. An isolated install with only lighthouse+chrome-launcher worked fine (8.5s, score 83), but the project's fuller `node_modules` tree triggered the hang.

Additional issues found during audit:
- `node_modules` had Finder artifacts corrupting the lighthouse directory
- `package.json` declared `^11.0.0` but lock file had resolved to 12.8.2
- Hardcoded macOS desktop user agent string would go stale over time
- Missing audit metrics silently defaulted to 0 without warning
- Generic error messages lost URL/phase context

### Solution Applied
Replaced in-process `require("lighthouse/core/index.cjs")` + `chrome-launcher.launch()` with `child_process.execFile` spawning the Lighthouse CLI as a subprocess. The CLI manages its own Chrome lifecycle in an isolated Node process, completely avoiding ESM loader issues.

### Files Changed
1. **`src/lib/lighthouse.ts`** — Full rewrite (~130 lines)
   - Removed: `chrome-launcher` import, Chrome lifecycle, CJS require, hardcoded desktop config
   - Added: `execFile` subprocess spawn of `lighthouse/cli/index.js`, `--preset=desktop` for desktop mode, contextual error messages (timeout/ENOENT/DNS/Chrome), missing-audit warnings
   - Kept: `runLighthouse()` signature, `AnalysisResult` return type, mutex pattern, `METRIC_AUDIT_MAP`, all metric/recommendation/diagnostic extraction

2. **`package.json`** — Removed `chrome-launcher` dep, pinned lighthouse to `^11.7.1`
3. **`tsup.config.ts`** — Removed `"chrome-launcher"` from externals
4. **`CLAUDE.md`** — Updated architecture notes

### Alternatives Considered & Rejected
- PSI API: Different scoring, requires internet, rate-limited, no intranet
- Puppeteer: Still imports lighthouse in-process → same deadlock
- Node flags (`--experimental-require-module`): Doesn't help with top-level await
- Different Node version: Not realistic for an npm package

### Verification (completed March 9, 2026)
- Clean install: success (11s)
- Lighthouse CLI: v11.7.1 confirmed
- Build: 245KB → 251KB (after crawl_site addition)
- MCP init: JSON-RPC responds with serverInfo + 4 tools
- End-to-end: all 3 original tools tested successfully on testscout.dev (5 pages, scores 99-100)
- `crawl_site`: built and registered, awaiting end-to-end test after CC restart

## Repair Log — March 9, 2026: Crawl + Parallelization + Reliability

### Changes
1. **`src/lib/lighthouse.ts`** — Replaced single mutex with semaphore (3 concurrent runs). Each Lighthouse subprocess has its own Chrome, so parallel is safe.
2. **`src/lib/crawler.ts`** — New file. URL discovery via sitemap.xml (regex `<loc>` extraction), fallback BFS crawl (HTTP fetch + `<a href>` parsing). Same-domain filter, max 20 pages, skips non-page resources.
3. **`src/lib/types.ts`** — Added `CrawlPageResult`, `CrawlResult` interfaces.
4. **`src/tools/crawl.ts`** — New tool. Discovers pages → runs parallel Lighthouse → aggregates results with summary (avg/min/max scores, worst/best page, top 5 common issues).
5. **`src/index.ts`** — Registered `crawl_site` tool (4 tools total).
6. **`package.json`** — Added `clean` (Finder artifact removal) and `verify` (dep check) scripts.
7. **`.gitignore`** — Added `.DS_Store`.

### Finder Artifact Issue
macOS Finder creates duplicate dirs with spaces (`lighthouse 2/`, `sdk 2/`) in `node_modules` when browsing. These break `rm -rf` and `yarn install`. Root cause: Finder folder duplication on drag/view. Prevention: don't open `node_modules` in Finder. Recovery: `yarn clean && yarn install`.

## Changelog — March 10, 2026: CLI Entry Point + Discovery Method Fix

### Changes
1. **`src/cli.ts`** — New CLI entry point (~115 lines). 4 subcommands (analyze, compare, crawl, check), lightweight `process.argv` parsing, JSON stdout, stderr errors with exit code 1, `--help`/`--version`.
2. **`src/lib/crawler.ts`** — `discoverUrls()` now returns `{ urls, method }` instead of just `string[]`. Enables accurate discovery method reporting.
3. **`src/tools/crawl.ts`** — Updated to use `DiscoveryResult` type. Removed broken detection heuristic that always reported "sitemap".
4. **`package.json`** — Added `"lightscout": "dist/cli.js"` bin entry.
5. **`tsup.config.ts`** — Added `src/cli.ts` to entry array. Build produces shared chunk for tool/lib code.

### Build Output
- `dist/index.js` — 237KB (MCP server, bundles SDK + zod)
- `dist/cli.js` — 4.7KB (CLI entry)
- `dist/chunk-PXVPMNAL.js` — 14KB (shared tool/lib code)

### Verification
- CLI: all 4 commands tested on example.com (analyze, compare, crawl, check)
- MCP: JSON-RPC init returns serverInfo correctly
- Discovery method: crawl correctly reported for example.com (no sitemap)
- Finder artifacts found again — `yarn clean && yarn install` fixed Lighthouse CLI hang
