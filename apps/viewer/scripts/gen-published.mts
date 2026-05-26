// Generate the published static site tree to apps/viewer/public/published/ — run with vite-node
// (resolves the workspace TS core + the app's sample-data exactly as the app does). This is the
// REAL disk publish: publishLibrary → MemoryFilesystem → collectFiles → write each file to disk.
// The Viewer then FETCHes /published/... (see published.ts) — the deployed-consumer path.
// Re-run when the library changes: `pnpm --filter @archie/viewer gen`.
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryFilesystem, publishLibrary, collectFiles } from "@render/core";
import { library, getLog, BASE } from "../src/sample-data.js";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "published");

const fs = new MemoryFilesystem();
await publishLibrary(fs, library, getLog, { baseUrl: BASE });
const files = await collectFiles(await fs.root()); // Record<path, {text}|{base64}>

if (existsSync(OUT)) rmSync(OUT, { recursive: true }); // clean stale files (idempotent regen)
let n = 0;
for (const [path, fc] of Object.entries(files)) {
  const full = join(OUT, path);
  mkdirSync(dirname(full), { recursive: true });
  if ("text" in fc) writeFileSync(full, fc.text);
  else writeFileSync(full, Buffer.from(fc.base64, "base64"));
  n++;
}
console.log(`Wrote ${n} published files → ${OUT}`);
