# LightScout MCP — Runbook

## Quick Reference

```bash
cd /Users/bobbyg/Documents/test-scout/lightscout-mcp

# Build
yarn build                # → dist/index.js (MCP) + dist/cli.js (CLI)

# CLI usage
node dist/cli.js analyze https://example.com
node dist/cli.js analyze https://example.com --device desktop --categories performance,accessibility
node dist/cli.js compare https://a.com https://b.com
node dist/cli.js compare https://example.com                    # mobile vs desktop
node dist/cli.js crawl https://example.com --max-pages 10
node dist/cli.js check https://example.com --perf 90 --lcp 2500 --cls 0.1
node dist/cli.js --help
node dist/cli.js --version

# After npm publish
npx lightscout analyze https://example.com
npx lightscout-mcp                                              # starts MCP server

# MCP registration (local dev)
claude mcp add -s user lightscout node /Users/bobbyg/Documents/test-scout/lightscout-mcp/dist/index.js

# MCP registration (after npm publish)
claude mcp add -s user lightscout npx -y lightscout-mcp

# Verify MCP server responds
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node dist/index.js 2>/dev/null | head -1
```

## Troubleshooting

### Lighthouse CLI hangs (even `--version`)
**Cause**: Finder artifacts — macOS Finder creates duplicate dirs with spaces in `node_modules`.
```bash
yarn clean && yarn install && yarn build
```
**Prevention**: Never open `node_modules` in Finder.

### Build fails with "service was stopped" (esbuild)
**Cause**: Stale esbuild binary or corrupted node_modules.
```bash
yarn clean && yarn install && yarn build
```

### SDK import hang on Node 22
**Cause**: SDK 1.27.1+ imports zod/v4 which deadlocks Node 22's CJS-ESM interop.
**Fix**: SDK must stay pinned to 1.12.1 in `package.json`. Do not upgrade.

### Lighthouse deadlocks in-process
**Cause**: Node 22 ESM loader thread deadlock with complex module graphs.
**Fix**: Already mitigated — Lighthouse runs as subprocess via `execFile`. Do not import lighthouse in-process.

### Chrome not found
**Cause**: Chrome or Chromium not installed.
**Fix**: Install Google Chrome. The Lighthouse CLI manages Chrome lifecycle — no need for `chrome-launcher`.

### `crawl_site` always reports "sitemap" as discovery method
**Status**: Fixed (March 10). `discoverUrls()` now returns `{ urls, method }`.

## Publishing Checklist

```bash
# 1. Clean build
yarn clean && yarn install && yarn build

# 2. Verify CLI
node dist/cli.js --version
node dist/cli.js analyze https://example.com

# 3. Verify MCP
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node dist/index.js 2>/dev/null | head -1

# 4. Check package contents
npm pack --dry-run

# 5. Publish
npm publish

# 6. Verify install
npx lightscout --version
npx lightscout analyze https://example.com
```

## Architecture Overview

```
src/
├── index.ts           # MCP server entry (JSON-RPC over stdio)
├── cli.ts             # CLI entry (process.argv → JSON to stdout)
├── tools/
│   ├── analyze.ts     # Single URL audit
│   ├── compare.ts     # A/B comparison (two URLs or mobile vs desktop)
│   ├── check.ts       # Pass/fail threshold checking
│   └── crawl.ts       # Site-wide crawl + parallel audit
└── lib/
    ├── lighthouse.ts  # Subprocess launcher (execFile, semaphore of 3)
    ├── crawler.ts     # URL discovery (sitemap.xml → BFS fallback)
    ├── scoring.ts     # CWV thresholds + ratings
    └── types.ts       # Shared interfaces
```

Both entry points (`index.ts` MCP, `cli.ts` CLI) import the same `tools/` and `lib/` code. No duplication.

## Key Constraints

| Constraint | Reason |
|-----------|--------|
| SDK 1.12.1 only | 1.27.1+ has zod/v4 deadlock on Node 22 |
| Lighthouse as subprocess | In-process import deadlocks on Node 22 |
| Max 3 concurrent Lighthouse | Semaphore prevents resource contention |
| Max 20 pages per crawl | Prevents runaway audits |
| Lighthouse ^11.7.1 | v12 also deadlocks in-process (subprocess avoids it) |
| yarn only | npm has cache permission issues on this machine |
