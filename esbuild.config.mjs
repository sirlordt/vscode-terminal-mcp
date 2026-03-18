import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const sharedOptions = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: true,
  minify: false,
  external: ["vscode"],
};

// Extension host bundle
const extensionBuild = esbuild.build({
  ...sharedOptions,
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
});

// MCP entry shim (separate entry point for auto-discovery)
const mcpEntryBuild = esbuild.build({
  ...sharedOptions,
  entryPoints: ["src/mcp-entry.ts"],
  outfile: "dist/mcp-entry.js",
  external: ["vscode"], // no vscode dependency in shim
});

if (isWatch) {
  const extCtx = await esbuild.context({
    ...sharedOptions,
    entryPoints: ["src/extension.ts"],
    outfile: "dist/extension.js",
  });
  const mcpCtx = await esbuild.context({
    ...sharedOptions,
    entryPoints: ["src/mcp-entry.ts"],
    outfile: "dist/mcp-entry.js",
    external: ["vscode"],
  });
  await Promise.all([extCtx.watch(), mcpCtx.watch()]);
  console.log("[watch] Build started...");
} else {
  await Promise.all([extensionBuild, mcpEntryBuild]);
  console.log("[build] Done.");
}
