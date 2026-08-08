// Re-bake an ALREADY-PUBLISHED Archie tree at a new base, self-contained (Archie-8d3d).
//
// WHY THIS EXISTS. micahchoo/test's live tree was published with `baseUrl` left at the Studio's
// WORKING IRI namespace (`https://archie.demo/`, `publish/working.ts`), so every absolute id in it
// points at a host that does not exist — see ledgers/TRACE-publish-base-url-2026-07-26.md. The
// library that produced it was authored in Studio's browser OPFS and is not reachable from a shell.
// The published tree itself IS reachable, and `loadLibrary` (site.ts:857) is the documented inverse
// of `publishLibrary`. So the fix needs no substitute content: read the user's own tree back, and
// re-publish it at the base it is actually served from, with the embed bundle inside it.
//
// The two things `loadLibrary` deliberately DROPS by default, and why this script keeps them:
//
//   `recoverAssetSources` (site.ts:846-847) deletes `tileSource` and `thumbnail` when it inverts a
//   published `{base}{slug}/assets/{name}` source back to the working `/assets/{name}` form. That is
//   correct for its own contract — those two are publish-DERIVED, and their old values name the old
//   origin. But dropping them without handing them back would silently ship a tree with NO deep-zoom
//   pyramid (a 5184x3456 master loaded whole) and a DANGLING `cover` in exhibits.json, because
//   `card.cover` round-trips through loadLibrary while the bytes it names would never be rewritten.
//
//   So this script loads with `{ preservePublishFields: true }` (loadLibrary's lossless-on-request
//   option): the DZI descriptor and the baked-thumbnail ref ride through on the objects, and
//   `tileObject` here does NOT slice anything — it REUSES the pyramid already in the tree, read off
//   disk, descriptor taken from the preserved `tileSource` (which the manifest's `archie:tileSource`
//   round-trips through objectsFromManifest). publish re-stamps `filesPath` at the new base
//   (site.ts:536) and re-bakes the thumbnail. No manifest walk, no objId↔asset join, no thumbnail
//   stamping — the whole recovery is the load→publish composition. Re-slicing would need
//   OffscreenCanvas, which is browser-only; the tiles are right there and they are not origin-dependent.
//
// Usage:
//   pnpm exec vite-node ../../scripts/republish-tree.mts -- \
//     --src <dir> --out <dir> --base https://user.github.io/repo/ [--no-viewer] [--published-at <iso>]
//
// --no-viewer is the RED control: same tree, `getViewerBundle` omitted, so viewer.html / _viewer/ /
// .nojekyll are absent and every drive assertion that depends on them must fail.
import { readFile, readdir, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { NodeFilesystem } from "@render/core/node";
import {
  publishLibrary, loadLibrary,
  type AnnotationLog, type FsDirectory, type AObject, type DziTileSource,
} from "@render/core";
import { treeStats } from "./lib/tree-stats.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EMBED_DIST = path.join(REPO, "packages/archie-viewer/dist");

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1]!;
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}
const SRC = path.resolve(arg("src"));
const OUT = path.resolve(arg("out"));
const BASE = arg("base");
const NO_VIEWER = process.argv.includes("--no-viewer");
const PUBLISHED_AT = arg("published-at", new Date().toISOString());

if (!BASE.endsWith("/")) throw new Error(`--base must end with "/" (got ${BASE})`);

/** The embed bundle, exactly as `packages/archie-viewer/dist` holds it — flat, entry + chunks. */
async function embedBundle(): Promise<Map<string, string | ArrayBuffer | Blob>> {
  const out = new Map<string, string | ArrayBuffer | Blob>();
  for (const name of await readdir(EMBED_DIST)) {
    if (!name.endsWith(".js")) continue;
    out.set(name, await readFile(path.join(EMBED_DIST, name), "utf8"));
  }
  if (!out.has("archie-viewer.js")) throw new Error(`${EMBED_DIST} has no archie-viewer.js — run the embed build first`);
  return out;
}

/** Every `{level}/{col}_{row}.{ext}` tile under an existing published pyramid dir, as Blobs. */
async function readPyramid(dir: FsDirectory): Promise<Map<string, Blob>> {
  const tiles = new Map<string, Blob>();
  for await (const level of dir.entries()) {
    if (level.kind !== "directory") continue;
    const levelDir = await dir.getDirectory(level.name);
    for await (const tile of levelDir.entries()) {
      if (tile.kind !== "file") continue;
      tiles.set(`${level.name}/${tile.name}`, new Blob([await (await levelDir.getFile(tile.name)).readable()]));
    }
  }
  return tiles;
}

async function main(): Promise<void> {
  // The source tree straight off disk through the node:fs backend — no memory round-trip.
  // preservePublishFields (loadLibrary's lossless-on-request): the DZI descriptor + baked-thumbnail
  // ref ride through on the objects, so publish can REUSE them (see the header) — no manifest walk
  // for `archie:tileSource`, no objId↔asset join table, no thumbnail presence stamping. The DEFAULT
  // loadLibrary strips both as publish projections, which is right for a working-store import but
  // wrong for a re-publish of this same tree.
  const src = new NodeFilesystem(SRC);
  const loaded = await loadLibrary(src, { preservePublishFields: true });
  const srcRoot = await src.root();

  const bytesFrom = async (slug: string, dirName: string, name: string): Promise<ArrayBuffer | null> => {
    try {
      const exDir = await srcRoot.getDirectory(slug);
      return await (await (await exDir.getDirectory(dirName)).getFile(name)).readable();
    } catch { return null; }
  };

  const getLog = (id: string): AnnotationLog => loaded.logs[id] ?? [];
  const getAsset = (slug: string, name: string): Promise<ArrayBuffer | null> => bytesFrom(slug, "assets", name);
  const getThumbnail = (slug: string, name: string): Promise<ArrayBuffer | null> => bytesFrom(slug, "assets-thumb", name);

  // REUSE, never re-slice. The pyramid in the source tree is already the right pixels; only its
  // `filesPath` named the dead origin, and publish re-stamps that (site.ts asset pass). The
  // descriptor rides on the LOADED object — publish hands it over as the 4th tileObject argument —
  // so there is no manifest walk and no objId↔asset join table.
  let reusedPyramids = 0;
  const tileObject = async (slug: string, name: string, _bytes: ArrayBuffer | Blob, obj: AObject): Promise<{ descriptor: DziTileSource; tiles: Map<string, Blob> } | null> => {
    const descriptor = obj.tileSource?.kind === "dzi" ? obj.tileSource : undefined;
    if (!descriptor) return null;
    let dir: FsDirectory;
    try { dir = await (await srcRoot.getDirectory(slug)).getDirectory(`${name}_files`); }
    catch { return null; }
    const tiles = await readPyramid(dir);
    if (tiles.size === 0) return null;
    reusedPyramids += 1;
    console.log(`  reusing published pyramid ${slug}/${name}_files — ${tiles.size} tiles`);
    // `filesPath` is overwritten by publish at the new base; the rest of the descriptor (width,
    // height, tileSize, overlap, format) describes the PIXELS and is origin-independent.
    return { descriptor, tiles };
  };

  const bundle = NO_VIEWER ? undefined : await embedBundle();
  // Publish straight to disk through the node:fs backend — no memory-tree-then-dump step. The
  // destination is cleared first so stale files from an earlier run cannot linger in the tree.
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const out = new NodeFilesystem(OUT);
  const report = await publishLibrary(out, loaded.library, getLog, {
    baseUrl: BASE,
    publishedAt: PUBLISHED_AT,
    getAsset,
    getThumbnail,
    tileObject,
    ...(bundle ? { getViewerBundle: async () => bundle } : {}),
  });
  const { files, bytes } = await treeStats(out);

  // PRINT THE SUBJECT, not only the verdict. A publish of an EMPTY library writes a valid tree and
  // reports success; these counts are what distinguish that from the real thing.
  console.log(`\nbase        ${BASE}`);
  console.log(`exhibits    ${loaded.library.exhibits.length} — ${loaded.library.exhibits.map((e) => `${e.slug}(${e.objects.length} obj)`).join(", ")}`);
  console.log(`annotations ${Object.values(loaded.logs).reduce((n, l) => n + l.length, 0)} record(s) carried`);
  console.log(`pyramids    ${reusedPyramids} reused${NO_VIEWER ? "" : `; viewer bundle ${bundle!.size} files`}`);
  console.log(`written     ${files} files / ${bytes} bytes -> ${OUT}${NO_VIEWER ? "  [--no-viewer: RED control]" : ""}`);
  if (report.missingAssets.length > 0) console.log(`MISSING ASSETS: ${JSON.stringify(report.missingAssets)}`);
  if (report.brokenLinks.length > 0) console.log(`BROKEN LINKS: ${JSON.stringify(report.brokenLinks)}`);
  if (report.incompleteCanvases.length > 0) console.log(`INCOMPLETE CANVASES: ${JSON.stringify(report.incompleteCanvases)}`);
  // The generation is not on PublishResult — it is stamped into the marker, which is also the
  // publish COMMIT POINT. Read it back off the written tree, so what is printed is what shipped.
  const marker = JSON.parse(await readFile(path.join(OUT, "archie.json"), "utf8")) as { generation?: string };
  console.log(`generation  ${marker.generation}`);
}

await main();
