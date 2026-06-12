// Generate the published static site tree to apps/viewer/public/published/ — run with vite-node
// (resolves the workspace TS core + the app's sample-data exactly as the app does). This is the
// REAL disk publish: publishLibrary → MemoryFilesystem → collectFiles → write each file to disk.
// The Viewer then FETCHes /published/... (see published.ts) — the deployed-consumer path.
//
// Source: the bundled sample-data by default, OR a published `.archie.zip` via `--from <path>`:
//   `pnpm --filter @archie/viewer gen`                        (sample-data)
//   `pnpm --filter @archie/viewer gen --from x.archie.zip`    (an authored library)
//
// MERGE-PRESERVING (Archie-9b93): the tree is a UNION — this run rewrites only the exhibits its
// SOURCE owns and CARRIES every other committed exhibit (the curated atlas, a cloner's authored
// publishes) untouched, re-merging the three root indexes (exhibits.json / collection.json /
// index.html). The old rm-everything regen silently deleted committed exhibits on every dev run
// and CI deploy. Consequence: `--from` now ADDS your library beside the samples (mirroring the
// Viewer's live-source hall merge) instead of replacing the tree.
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MemoryFilesystem, ZipFilesystem, publishLibrary, collectFiles, loadLibrary, mergePublishedIndexes, libraryPageHtml,
  type AnnotationLog, type Library, type ExhibitsJson, type IIIFCollection, type PublishedIndexes,
} from "@render/core";
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

// What does the EXISTING tree hold that this source doesn't own? (null on first run / fresh clone)
const readJsonIf = <T,>(name: string): T | null => {
  const p = join(OUT, name);
  try {
    return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null;
  } catch {
    return null; // unparsable index — treat as no existing tree rather than aborting the regen
  }
};
const existingExhibits = readJsonIf<ExhibitsJson>("exhibits.json");
const existingCollection = readJsonIf<IIIFCollection>("collection.json");
const existing: PublishedIndexes | null =
  existingExhibits && existingCollection ? { exhibits: existingExhibits, collection: existingCollection } : null;

const generated: PublishedIndexes = {
  exhibits: JSON.parse((files["exhibits.json"] as { text: string }).text) as ExhibitsJson,
  collection: JSON.parse((files["collection.json"] as { text: string }).text) as IIIFCollection,
};
const merged = mergePublishedIndexes(generated, existing, {
  dirExists: (slug) => existsSync(join(OUT, slug, "manifest.json")),
});

// Targeted clean: ONLY the exhibit dirs this source owns (idempotent regen of owned content);
// carried exhibits' dirs are never touched. Root files are overwritten by the write below.
for (const ex of library.exhibits) rmSync(join(OUT, ex.slug), { recursive: true, force: true });

let n = 0;
for (const [path, fc] of Object.entries(files)) {
  const full = join(OUT, path);
  mkdirSync(dirname(full), { recursive: true });
  if ("text" in fc) writeFileSync(full, fc.text);
  else writeFileSync(full, Buffer.from(fc.base64, "base64"));
  n++;
}

if (merged.preservedSlugs.length > 0) {
  // Re-merge the three root indexes over the carried exhibits. The landing page (ADR-0014) lists
  // the merged set — carried cards contribute slug/title/description (all it renders).
  writeFileSync(join(OUT, "exhibits.json"), JSON.stringify(merged.exhibits, null, 2));
  writeFileSync(join(OUT, "collection.json"), JSON.stringify(merged.collection, null, 2));
  const carriedCards = merged.exhibits.exhibits.filter((c) => merged.preservedSlugs.includes(c.slug));
  const displayLibrary: Library = {
    ...library,
    exhibits: [
      ...library.exhibits,
      ...carriedCards.map((c) => ({ id: c.slug, slug: c.slug, title: c.title, ...(c.description ? { summary: c.description } : {}), objects: [] })),
    ],
  };
  writeFileSync(join(OUT, "index.html"), libraryPageHtml(displayLibrary, { baseUrl: BASE }));
  console.log(`Preserved ${merged.preservedSlugs.length} committed exhibit(s): ${merged.preservedSlugs.join(", ")}`);
}
console.log(`Wrote ${n} published files → ${OUT}`);
