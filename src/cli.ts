import { analyzePerformance } from "./tools/analyze.js";
import { comparePerformance } from "./tools/compare.js";
import { checkThreshold } from "./tools/check.js";
import { crawlSite } from "./tools/crawl.js";
import type { Device } from "./lib/types.js";

const VERSION = "0.1.0";

function usage(exitCode = 0): never {
  const text = `lightscout v${VERSION} — Core Web Vitals analysis powered by Lighthouse

Usage:
  lightscout <command> [options]

Commands:
  analyze <url>              Run Lighthouse audit on a single URL
  compare <urlA> [urlB]      Compare two URLs (or same URL mobile vs desktop)
  crawl <url>                Discover pages and audit entire site
  check <url>                Pass/fail threshold check for CI gates

Options:
  --device <mobile|desktop>  Device emulation (default: mobile)
  --categories <list>        Comma-separated: performance,accessibility,seo,best-practices
  --max-pages <n>            Max pages for crawl (default: 20, max: 20)
  --perf <n>                 Min performance score for check (0-100)
  --lcp <n>                  Max LCP in ms for check
  --fcp <n>                  Max FCP in ms for check
  --cls <n>                  Max CLS for check
  --tbt <n>                  Max TBT in ms for check
  --ttfb <n>                 Max TTFB in ms for check
  --help                     Show this help
  --version                  Show version

Examples:
  lightscout analyze https://example.com
  lightscout analyze https://example.com --device desktop
  lightscout compare https://a.com https://b.com
  lightscout compare https://example.com  # mobile vs desktop
  lightscout crawl https://example.com --max-pages 10
  lightscout check https://example.com --perf 90 --lcp 2500
`;
  process.stderr.write(text);
  process.exit(exitCode);
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const positional: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      usage(0);
    }
    if (arg === "--version" || arg === "-v") {
      process.stdout.write(`${VERSION}\n`);
      process.exit(0);
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = args[++i];
      if (value === undefined) {
        process.stderr.write(`Missing value for --${key}\n`);
        process.exit(1);
      }
      flags[key] = value;
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

function getDevice(flags: Record<string, string>): Device {
  const d = flags.device;
  if (!d) return "mobile";
  if (d !== "mobile" && d !== "desktop") {
    process.stderr.write(`Invalid device: ${d}. Use "mobile" or "desktop".\n`);
    process.exit(1);
  }
  return d;
}

async function main() {
  const { positional, flags } = parseArgs(process.argv);
  const command = positional[0];

  if (!command) usage(1);

  try {
    let result: unknown;

    switch (command) {
      case "analyze": {
        const url = positional[1];
        if (!url) { process.stderr.write("Usage: lightscout analyze <url>\n"); process.exit(1); }
        const categories = flags.categories?.split(",");
        result = await analyzePerformance({ url, device: getDevice(flags), categories });
        break;
      }
      case "compare": {
        const urlA = positional[1];
        if (!urlA) { process.stderr.write("Usage: lightscout compare <urlA> [urlB]\n"); process.exit(1); }
        const urlB = positional[2];
        result = await comparePerformance({ urlA, urlB, device: getDevice(flags) });
        break;
      }
      case "crawl": {
        const url = positional[1];
        if (!url) { process.stderr.write("Usage: lightscout crawl <url>\n"); process.exit(1); }
        const maxPages = flags["max-pages"] ? parseInt(flags["max-pages"], 10) : undefined;
        result = await crawlSite({ url, device: getDevice(flags), maxPages });
        break;
      }
      case "check": {
        const url = positional[1];
        if (!url) { process.stderr.write("Usage: lightscout check <url>\n"); process.exit(1); }
        const thresholds: Record<string, number> = {};
        for (const key of ["perf", "lcp", "fcp", "cls", "tbt", "ttfb"]) {
          if (flags[key] !== undefined) {
            const name = key === "perf" ? "performance" : key;
            thresholds[name] = parseFloat(flags[key]);
          }
        }
        result = await checkThreshold({
          url,
          device: getDevice(flags),
          thresholds: Object.keys(thresholds).length > 0 ? thresholds : undefined,
        });
        break;
      }
      default:
        process.stderr.write(`Unknown command: ${command}\n\n`);
        usage(1);
    }

    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    // Exit 1 for failed threshold checks (CI gate support)
    if (command === "check" && (result as any)?.passed === false) {
      process.exitCode = 1;
    }
  } catch (err: any) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
