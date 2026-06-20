// Generate the published static site tree to apps/viewer/public/published/ — run with vite-node
// (resolves the workspace TS core + the app's sample-data exactly as the app does). This is the
// REAL disk publish: publishLibrary → MemoryFilesystem → collectFiles → write each file to disk.
// The Viewer then FETCHes /published/... (see published.ts) — the deployed-consumer path.
//
// Source (priority): an explicit `--from <path>`; else the MOST RECENT `*.archie.zip` in the drop
// folder apps/viewer/libraries/ (newest mtime, filename-DESC tiebreak); else the bundled sample-data.
// So a plain `gen` bakes whatever zip you last dropped in libraries/ (see libraries/README.md):
//   `pnpm --filter @archie/viewer gen`                        (most-recent libraries/ zip, else sample-data)
//   `pnpm --filter @archie/viewer gen --from x.archie.zip`    (explicit override)
//
// MERGE-PRESERVING (Archie-9b93): the tree is a UNION — this run rewrites only the exhibits its
// SOURCE owns and CARRIES every other committed exhibit (the curated atlas, a cloner's authored
// publishes) untouched, re-merging the three root indexes (exhibits.json / collection.json /
// index.html). The old rm-everything regen silently deleted committed exhibits on every dev run
// and CI deploy. Consequence: `--from` now ADDS your library beside the samples (mirroring the
// Viewer's live-source hall merge) instead of replacing the tree.
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MemoryFilesystem, ZipFilesystem, publishLibrary, collectFiles, loadLibrary, mergePublishedIndexes, libraryPageHtml, asExhibitId,
  type AnnotationLog, type Library, type ExhibitsJson, type IIIFCollection, type PublishedIndexes,
} from "@render/core";
import { library as sampleLibrary, getLog as sampleGetLog } from "../fixtures/sample-data.js";
// Bases come from config (ADR-0013), NOT the sample fixture — so a dropped zip bakes against the real
// deploy origin, not a demo base (Archie-3db4). BASE was re-exported through sample-data; sourcing it
// straight from published-base makes the provenance explicit. VIEWER_BASE: canonical Viewer base so cites resolve to in-app routes.
import { BASE, VIEWER_BASE } from "../src/published-base.js";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "published");

const fromIdx = process.argv.indexOf("--from");
const explicitZip = fromIdx !== -1 ? process.argv[fromIdx + 1] : undefined;

// The drop folder: committed `.archie.zip` exports live in apps/viewer/libraries/. With no explicit
// --from, the build bakes the MOST RECENT zip there (newest mtime; filename-DESC tiebreak — git does
// NOT preserve mtimes, so a fresh clone / CI sees every committed zip at checkout time and the tiebreak
// decides deterministically; commit a single zip for a fully reproducible deploy). Absent/empty folder
// → the bundled sample-data. The chosen source is always logged so a wrong pick is never silent.
const LIBRARIES = join(dirname(fileURLToPath(import.meta.url)), "..", "libraries");
function mostRecentLibraryZip(): string | undefined {
  let names: string[];
  try {
    names = readdirSync(LIBRARIES).filter((f) => f.endsWith(".archie.zip"));
  } catch {
    return undefined; // no libraries/ folder yet
  }
  if (names.length === 0) return undefined;
  const chosen = names
    .map((name) => ({ name, mtime: statSync(join(LIBRARIES, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime || (a.name < b.name ? 1 : -1))[0];
  if (!chosen) return undefined; // unreachable (names is non-empty here) — satisfies noUncheckedIndexedAccess
  if (names.length > 1) console.log(`libraries/: ${names.length} zips present — baking the most recent: ${chosen.name}`);
  return join(LIBRARIES, chosen.name);
}

const zipPath = explicitZip ?? mostRecentLibraryZip();

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
  console.log("Source: bundled sample-data (no zip in apps/viewer/libraries/)");
}

const fs = new MemoryFilesystem();
await publishLibrary(fs, library, getLog, { baseUrl: BASE, viewerBase: VIEWER_BASE });
const files = await collectFiles(await fs.root()); // Record<path, {text}|{base64}>

// What does the EXISTING tree hold that this source doesn't own? (null on first run / fresh clone)
const readJsonIf = <T,>(name: string): T | null => {
  const p = join(OUT, name);
  try {
    return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null;
  } catch (e) {
    // Unparsable index — treat as no existing tree rather than aborting the regen, but WARN: a corrupt
    // exhibits.json/collection.json makes the merge skip preservation, so carried (non-owned) exhibits
    // drop out of the rewritten root indexes (their dirs survive on disk, but the cards/landing vanish).
    console.warn(`gen-published: failed to parse existing ${name} (${p}) — treating as no existing tree; carried exhibits will NOT be preserved this run: ${e instanceof Error ? e.message : String(e)}`);
    return null;
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
      ...carriedCards.map((c) => ({ id: asExhibitId(c.slug), slug: c.slug, title: c.title, ...(c.description ? { summary: c.description } : {}), objects: [] })),
    ],
  };
  writeFileSync(join(OUT, "index.html"), libraryPageHtml(displayLibrary, { baseUrl: BASE, viewerBase: VIEWER_BASE }));
  console.log(`Preserved ${merged.preservedSlugs.length} committed exhibit(s): ${merged.preservedSlugs.join(", ")}`);
}
console.log(`Wrote ${n} published files → ${OUT}`);
