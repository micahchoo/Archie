// Re-export `apps/viewer/libraries/*.archie.zip` from the CURRENT published tree.
//
//   pnpm --filter @archie/viewer exec vite-node scripts/reexport-library-zip.mts
//
// WHY THIS EXISTS. The committed zip is a source artifact that does not update itself, and it had
// silently rotted across three model changes: **0 inline annotations** on all 21 canvases (its log
// targeted `https://archie.demo/` while its canvases sat at the deploy origin — the base mismatch
// fixed in c22f62e) and bare `o1`-style object ids predating Archie-9ea8's `ex-<exhibit>.<object>`
// grammar. `pnpm gen` repairs all of that at bake time, so the PUBLISHED tree is correct while the zip
// a user downloads is not. This closes the gap.
//
// It reads the repaired tree back (`loadLibrary` — the inverse of publishLibrary), keeps only the
// exhibits the existing zip OWNS, and re-publishes those to a fresh zip. Deliberately NOT the whole
// tree: the zip owns `screenshots`, and folding in the sample-data seed would change what a dropped
// zip overrides and re-break the union `gen-published.mts` performs (its "THE SEED IS ALWAYS OWNED"
// note is the fossilisation this would recreate).
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readdir, readFile, stat } from "node:fs/promises";
import {
  MemoryFilesystem, ZipFilesystem, loadLibrary, libraryToZip, type Library,
} from "@render/core";
import { BASE, VIEWER_BASE } from "../src/published-base.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const TREE = join(HERE, "..", "public", "published");
const LIBRARIES = join(HERE, "..", "libraries");

/** Load a disk tree into a MemoryFilesystem. No node `Filesystem` backend exists in render-core (the
 *  four are FSA / OPFS / Zip / Tauri), and inventing a fifth for a one-off script would be a real
 *  surface to maintain — walking the tree is a dozen lines and has no contract to keep. */
async function treeToMemory(root: string): Promise<MemoryFilesystem> {
  const fs = new MemoryFilesystem();
  const memRoot = await fs.root();
  const walk = async (abs: string): Promise<void> => {
    for (const name of await readdir(abs)) {
      const child = join(abs, name);
      if ((await stat(child)).isDirectory()) { await walk(child); continue; }
      const parts = relative(root, child).split(sep);
      let dir = memRoot;
      for (const seg of parts.slice(0, -1)) dir = await dir.getDirectory(seg, { create: true });
      const file = await dir.getFile(parts[parts.length - 1]!, { create: true });
      const w = await file.writable();
      const bytes = await readFile(child);
      await w.write(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      await w.close();
    }
  };
  await walk(root);
  return fs;
}

/** Which exhibits does the existing zip own? Re-exporting exactly those preserves the drop semantics. */
async function ownedSlugs(zipPath: string): Promise<string[]> {
  const zipFs = ZipFilesystem.fromZip(new Uint8Array(readFileSync(zipPath)));
  const out: string[] = [];
  for await (const e of (await zipFs.root()).entries()) if (e.kind === "directory") out.push(e.name);
  return out;
}

const zipName = readdirSync(LIBRARIES).filter((f) => f.endsWith(".archie.zip")).sort(
  (a, b) => statSync(join(LIBRARIES, b)).mtimeMs - statSync(join(LIBRARIES, a)).mtimeMs,
)[0];
if (!zipName) throw new Error(`no .archie.zip in ${LIBRARIES}`);
const zipPath = join(LIBRARIES, zipName);
const owned = new Set(await ownedSlugs(zipPath));
console.log(`re-exporting ${zipName} — owns: ${[...owned].join(", ")}`);

const { library, logs } = await loadLibrary(await treeToMemory(TREE));
const kept: Library = { ...library, exhibits: library.exhibits.filter((e) => owned.has(e.slug)) };
if (kept.exhibits.length !== owned.size) {
  throw new Error(
    `the tree is missing an owned exhibit — zip owns [${[...owned]}], tree has [${kept.exhibits.map((e) => e.slug)}]`,
  );
}
const noteCount = kept.exhibits.reduce((n, e) => n + (logs[e.id]?.length ?? 0), 0);
console.log(`carrying ${kept.exhibits.length} exhibit(s), ${noteCount} annotation record(s)`);
if (noteCount === 0) throw new Error("refusing to write a zip with no annotations — that is the bug this fixes");

// Asset bytes come straight off the published tree, so the zip stays self-contained.
const getAsset = async (slug: string, name: string): Promise<ArrayBuffer | null> => {
  try {
    const buf = await readFile(join(TREE, slug, "assets", name));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch {
    return null; // an external-URL object — publishLibrary leaves its source as-is
  }
};

const { zip, missingAssets } = await libraryToZip(kept, (id) => logs[id] ?? [], {
  baseUrl: BASE, viewerBase: VIEWER_BASE, getAsset,
});
for (const m of missingAssets) console.warn(`missing bytes: ${m.exhibitSlug}/${m.name} (object ${m.objectId})`);
writeFileSync(zipPath, zip);
console.log(`wrote ${zipPath} (${(zip.byteLength / 1e6).toFixed(1)} MB)`);
