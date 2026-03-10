import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: "esm",
  target: "node18",
  outDir: "dist",
  clean: true,
  // Bundle SDK + zod so the server works from any CWD.
  // Keep lighthouse external (spawned as subprocess, not imported).
  noExternal: [/@modelcontextprotocol/, "zod", "zod-to-json-schema"],
  external: ["lighthouse"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
