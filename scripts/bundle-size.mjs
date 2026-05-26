import { gzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

// esbuild is a transitive (vitest) dep, not hoisted — resolve it from the pnpm store.
const require = createRequire(import.meta.url);
const esbuild = require(`${process.cwd()}/node_modules/.pnpm/esbuild@0.21.5/node_modules/esbuild`);

const root = process.cwd();

async function measureEntry(label, entry, external = []) {
  const r = await esbuild.build({ entryPoints: [entry], bundle: true, minify: true, format: "esm", write: false, external, platform: "browser", logLevel: "silent" });
  return size(label, r.outputFiles[0].contents);
}
async function measureStdin(label, contents, resolveDir) {
  const r = await esbuild.build({ stdin: { contents, resolveDir, loader: "ts" }, bundle: true, minify: true, format: "esm", write: false, platform: "browser", logLevel: "silent" });
  return size(label, r.outputFiles[0].contents);
}
function size(label, raw) {
  return { label, minKB: +(raw.length / 1024).toFixed(1), gzKB: +(gzipSync(Buffer.from(raw)).length / 1024).toFixed(1) };
}

const rows = [];
// Archie's own data-layer code (fflate external — the part WE wrote).
rows.push(await measureEntry("@render/core (fflate external)", `${root}/packages/render-core/src/index.ts`, ["fflate"]));
// Archie core including its only runtime dep, fflate.
rows.push(await measureEntry("@render/core + fflate", `${root}/packages/render-core/src/index.ts`));
// The renderer floor: OSD + Annotorious (the 240KB-budget concern, BEFORE any Archie code).
rows.push(await measureStdin("OSD + Annotorious + plugin-tools", `import "openseadragon"; import "@annotorious/openseadragon"; import "@annotorious/plugin-tools";`, `${root}/packages/render-mount`));

for (const r of rows) console.log(`${r.label.padEnd(36)} ${String(r.minKB).padStart(8)}KB min  ${String(r.gzKB).padStart(8)}KB gz`);
writeFileSync(`${root}/docs/bundle-size.json`, JSON.stringify({ measuredAt: new Date().toISOString(), budgetKB: 240, note: "gz = minified+gzipped. Renderer floor has no tree-shaking applied; real app bundle is the Phase-2 dogfood number (strategy §33).", rows }, null, 2) + "\n");
