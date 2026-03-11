import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureCleanNodeModules } from "../src/lib/finder-guard.js";

describe("ensureCleanNodeModules", () => {
  let tmpDir: string;
  let nmDir: string;
  let lhDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "finder-guard-"));
    nmDir = join(tmpDir, "node_modules");
    lhDir = join(nmDir, "lighthouse");
    await mkdir(lhDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("removes Finder duplicate directories from node_modules root", async () => {
    await mkdir(join(nmDir, "lighthouse 2"));
    await mkdir(join(nmDir, "semver 3"));

    const result = await ensureCleanNodeModules(lhDir);

    expect(result.cleaned).toBe(true);
    expect(result.removed).toHaveLength(2);
    const entries = await readdir(nmDir);
    expect(entries).not.toContain("lighthouse 2");
    expect(entries).not.toContain("semver 3");
    expect(entries).toContain("lighthouse");
  });

  it("removes Finder duplicates from lighthouse subdirectory", async () => {
    await mkdir(join(lhDir, "core 2"));

    const result = await ensureCleanNodeModules(lhDir);

    expect(result.cleaned).toBe(true);
    expect(result.removed).toHaveLength(1);
    const entries = await readdir(lhDir);
    expect(entries).not.toContain("core 2");
  });

  it("does not remove legitimate directories", async () => {
    await mkdir(join(nmDir, "@types"));
    await mkdir(join(nmDir, "is-number"));
    await mkdir(join(nmDir, "lodash.merge"));

    const result = await ensureCleanNodeModules(lhDir);

    expect(result.cleaned).toBe(false);
    expect(result.removed).toHaveLength(0);
    const entries = await readdir(nmDir);
    expect(entries).toContain("@types");
    expect(entries).toContain("is-number");
    expect(entries).toContain("lodash.merge");
  });

  it("only matches Finder duplicate pattern (name + space + number)", async () => {
    // These should NOT match
    await mkdir(join(nmDir, "node-2"));       // hyphen, not space
    await mkdir(join(nmDir, "v 1.0"));        // has dot
    await mkdir(join(nmDir, "test abc"));      // letters, not digits
    // This SHOULD match
    await mkdir(join(nmDir, "chalk 42"));

    const result = await ensureCleanNodeModules(lhDir);

    expect(result.cleaned).toBe(true);
    expect(result.removed).toHaveLength(1);
    const entries = await readdir(nmDir);
    expect(entries).toContain("node-2");
    expect(entries).toContain("v 1.0");
    expect(entries).toContain("test abc");
    expect(entries).not.toContain("chalk 42");
  });

  it("returns quickly when no artifacts exist", async () => {
    const start = performance.now();
    const result = await ensureCleanNodeModules(lhDir);
    const elapsed = performance.now() - start;

    expect(result.cleaned).toBe(false);
    expect(result.removed).toHaveLength(0);
    expect(elapsed).toBeLessThan(100); // should be ~1ms
  });
});
