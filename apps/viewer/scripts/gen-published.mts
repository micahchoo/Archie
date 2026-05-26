// Generate the published static site tree to apps/viewer/public/published/ — run with vite-node
// (resolves the workspace TS core + the app's sample-data exactly as the app does). This is the
// REAL disk publish: publishLibrary → MemoryFilesystem → collectFiles → write each file to disk.
// The Viewer then FETCHes /published/... (see published.ts) — the deployed-consumer path.
//
// Source: the bundled sample-data by default, OR a published `.archie.zip` via `--from <path>` —
// the NON-CHROMIUM local-view loop (author → Save downloads the zip → expand it into the served
// tree; Chromium uses Studio's FsaFilesystem folder-write directly). Re-run on change:
//   `pnpm --filter @archie/viewer gen`            (sample-data)
//   `pnpm --filter @archie/viewer gen --from x.archie.zip`   (an authored library)
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryFilesystem, ZipFilesystem, publishLibrary, collectFiles, loadLibrary, type AnnotationLog, type Library } from "@render/core";
import { library as sampleLibrary, getLog as sampleGetLog, BASE } from "../src/sample-data.js";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "published");

const fromIdx = process.argv.indexOf("--from");
const zipPath = fromIdx !== -1 ? process.argv[fromIdx + 1] : undefined;

let library: Library;
let getLog: (id: string) => AnnotationLog;
if (zipPath) {
  // loadLibrary is the inverse of publishLibrary (publish↔load symmetry); logs are keyed by slug and
  // recovered exhibit.id === slug, so getLog(id) hits loaded.logs[slug].
  const loaded = await loadLibrary(ZipFilesystem.fromZip(new Uint8Array(readFileSync(zipPath))));
  library = loaded.library;
  getLog = (id) => loaded.logs[id] ?? [];
  console.log(`Source: ${zipPath} (${library.exhibits.length} exhibit(s))`);
} else {
  library = sampleLibrary;
  getLog = sampleGetLog;
}

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
