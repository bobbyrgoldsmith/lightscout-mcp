import { readdir, rm } from "node:fs/promises";
import { join, dirname, basename } from "node:path";

/** Pattern matching Finder duplicate directories: "name 2", "semver 3", etc. */
const FINDER_DUP_RE = /^.+ \d+$/;

export interface GuardResult {
  cleaned: boolean;
  removed: string[];
}

/**
 * Scans node_modules for macOS Finder artifact directories and removes them.
 * Finder creates duplicates like "lighthouse 2/" when users browse node_modules.
 * These corrupt the dependency tree and cause Lighthouse CLI subprocess hangs.
 */
export async function ensureCleanNodeModules(lighthouseDir: string): Promise<GuardResult> {
  const removed: string[] = [];

  // Walk up to find node_modules root
  let nmRoot = lighthouseDir;
  while (basename(dirname(nmRoot)) !== "node_modules" && dirname(nmRoot) !== nmRoot) {
    nmRoot = dirname(nmRoot);
  }
  nmRoot = dirname(nmRoot); // now points to node_modules/

  // If we couldn't find node_modules, bail
  if (basename(nmRoot) !== "node_modules") {
    return { cleaned: false, removed };
  }

  // Scan node_modules root + lighthouse subdirectory
  const dirsToScan = [nmRoot, lighthouseDir];

  for (const dir of dirsToScan) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (FINDER_DUP_RE.test(entry)) {
        const fullPath = join(dir, entry);
        try {
          await rm(fullPath, { recursive: true, force: true });
          removed.push(fullPath);
        } catch {
          // Best effort — skip if can't remove
        }
      }
    }
  }

  if (removed.length > 0) {
    console.error(
      `[lightscout] Removed ${removed.length} macOS Finder artifact(s) from node_modules: ${removed.map((p) => basename(p)).join(", ")}. Avoid opening node_modules in Finder.`
    );
  }

  return { cleaned: removed.length > 0, removed };
}
