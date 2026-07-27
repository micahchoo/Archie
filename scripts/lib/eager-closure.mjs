import { gzipSync } from "node:zlib";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Walk a Vite manifest from every `isEntry` and collect the files a browser fetches before first
 * paint: the entry chunk, its stylesheets, and everything reachable through `imports`.
 *
 * `dynamicImports` is deliberately NOT followed — it is the lazy boundary, and the whole reason this
 * function exists apart from a plain directory sum. packages/archie-viewer/build.mjs draws the same
 * line off esbuild's metafile (`kind === "import-statement"`, build.mjs:139); Vite spells it as two
 * sibling arrays instead of a tagged one.
 *
 * Exported separately from the sum so a test can assert the traversal without a real dist on disk.
 *
 * @param {Record<string, {file: string, isEntry?: boolean, css?: string[], imports?: string[], dynamicImports?: string[]}>} manifest
 * @returns {Set<string>} emitted file paths, relative to the dist root
 */
export function eagerFiles(manifest) {
  const files = new Set();
  const walk = (key) => {
    const node = manifest[key];
    if (!node || files.has(node.file)) return;
    files.add(node.file);
    for (const css of node.css ?? []) files.add(css);
    for (const imp of node.imports ?? []) walk(imp);
  };
  for (const [key, node] of Object.entries(manifest)) if (node.isEntry) walk(key);
  return files;
}

/**
 * Total gz weight of a dist's eager closure, or `null` when the build emitted no manifest.
 *
 * A null is not the same as a zero, and callers must not conflate them: a baseline that exists with
 * no measurement beside it means `build.manifest` was dropped and the gate is off, which is a
 * failure. Same absent-vs-failed distinction as render-core's readers
 * (.claude/rules/render-core-data-integrity.md).
 */
export function eagerGzKB(dist) {
  const manifestPath = join(dist, ".vite", "manifest.json");
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  let total = 0;
  for (const f of eagerFiles(manifest)) {
    const p = join(dist, f);
    if (existsSync(p)) total += gzipSync(readFileSync(p)).length;
  }
  return +(total / 1024).toFixed(1);
}
