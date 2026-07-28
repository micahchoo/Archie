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
// The two things `loadLibrary` deliberately DROPS, and why each is handed back here:
//
//   `recoverAssetSources` (site.ts:846-847) deletes `tileSource` and `thumbnail` when it inverts a
//   published `{base}{slug}/assets/{name}` source back to the working `/assets/{name}` form. That is
//   correct for its own contract — those two are publish-DERIVED, and their old values name the old
//   origin. But dropping them without handing them back would silently ship a tree with NO deep-zoom
//   pyramid (a 5184x3456 master loaded whole) and a DANGLING `cover` in exhibits.json, because
//   `card.cover` round-trips through loadLibrary while the bytes it names would never be rewritten.
//
//   So `tileObject` here does NOT slice anything — it REUSES the pyramid already in the tree, read
//   off disk, with the descriptor recovered from the old manifest's `archie:tileSource`. publish
//   re-stamps `filesPath` at the new base (site.ts:536). Re-slicing would need OffscreenCanvas, which
//   is browser-only; the tiles are right there and they are not origin-dependent.
//
// Usage:
//   pnpm exec vite-node ../../scripts/republish-tree.mts -- \
//     --src <dir> --out <dir> --base https://user.github.io/repo/ [--no-viewer] [--published-at <iso>]
//
// --no-viewer is the RED control: same tree, `getViewerBundle` omitted, so viewer.html / _viewer/ /
// .nojekyll are absent and every drive assertion that depends on them must fail.
import { readFile, readdir, stat, mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  MemoryFilesystem, publishLibrary, collectFiles, loadLibrary,
  type AnnotationLog, type FsDirectory, type AObject,
} from "@render/core";

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

/** Read a disk directory into an fs-seam directory, recursively. `.git` is not part of the tree. */
async function loadDirInto(dir: FsDirectory, diskPath: string): Promise<void> {
  for (const name of await readdir(diskPath)) {
    if (name === ".git") continue;
    const p = path.join(diskPath, name);
    if ((await stat(p)).isDirectory()) {
      await loadDirInto(await dir.getDirectory(name, { create: true }), p);
    } else {
      const w = await (await dir.getFile(name, { create: true })).writable();
      const buf = await readFile(p);
      await w.write(new Uint8Array(buf).buffer as ArrayBuffer);
      await w.close();
    }
  }
}

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
  const src = new MemoryFilesystem();
  await loadDirInto(await src.root(), SRC);
  const loaded = await loadLibrary(src);
  const srcRoot = await src.root();

  // The OLD manifests, read before anything is rewritten: the only place the published DZI
  // descriptors survive (`archie:tileSource` per canvas). Keyed by `${slug} ${objectId}`.
  const oldTiles = new Map<string, Record<string, unknown>>();
  for (const ex of loaded.library.exhibits) {
    const m = JSON.parse(new TextDecoder().decode(
      await (await (await srcRoot.getDirectory(ex.slug)).getFile("manifest.json")).readable(),
    )) as { items?: { id?: string; "archie:tileSource"?: Record<string, unknown> }[] };
    for (const canvas of m.items ?? []) {
      const ts = canvas["archie:tileSource"];
      const id = canvas.id ?? "";
      const objId = id.slice(id.lastIndexOf("/canvas/") + "/canvas/".length);
      if (ts && objId) oldTiles.set(`${ex.slug} ${objId}`, ts);
    }
  }

  // Hand `thumbnail` back so publish's `wantThumbs` gate (site.ts:509) opens and `getThumbnail` is
  // consulted. The VALUE is irrelevant — publish deletes it and re-mints at the new base
  // (site.ts:541,549) — but its PRESENCE is what decides whether assets-thumb/ ships at all, and
  // `exhibits.json`'s `cover` (which round-trips independently of it) names a file in that directory.
  //
  // `tileObject` is keyed by ASSET NAME while `archie:tileSource` is keyed by object id, so the two
  // need joining; this is the join table, built during the walk that is happening anyway.
  const objIdByAsset = new Map<string, string>();
  for (const ex of loaded.library.exhibits) {
    ex.objects = ex.objects.map((o: AObject): AObject => {
      if (!o.source.startsWith("/assets/")) return o;
      const name = o.source.slice("/assets/".length);
      objIdByAsset.set(`${ex.slug} ${name}`, o.id);
      return { ...o, thumbnail: `/assets-thumb/${name}` };
    });
  }

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
  // `filesPath` named the dead origin, and publish re-stamps that.
  let reusedPyramids = 0;
  const tileObject = async (slug: string, name: string): Promise<{ descriptor: never; tiles: Map<string, Blob> } | null> => {
    const objId = objIdByAsset.get(`${slug} ${name}`);
    const descriptor = objId ? oldTiles.get(`${slug} ${objId}`) : undefined;
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
    return { descriptor: descriptor as never, tiles };
  };

  const bundle = NO_VIEWER ? undefined : await embedBundle();
  const out = new MemoryFilesystem();
  const report = await publishLibrary(out, loaded.library, getLog, {
    baseUrl: BASE,
    publishedAt: PUBLISHED_AT,
    getAsset,
    getThumbnail,
    tileObject,
    ...(bundle ? { getViewerBundle: async () => bundle } : {}),
  });

  await rm(OUT, { recursive: true, force: true });
  const files = await collectFiles(await out.root());
  let bytes = 0;
  for (const [rel, content] of Object.entries(files)) {
    const dest = path.join(OUT, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    const buf = "text" in content ? Buffer.from(content.text, "utf8") : Buffer.from(content.base64, "base64");
    await writeFile(dest, buf);
    bytes += buf.length;
  }

  // PRINT THE SUBJECT, not only the verdict. A publish of an EMPTY library writes a valid tree and
  // reports success; these counts are what distinguish that from the real thing.
  console.log(`\nbase        ${BASE}`);
  console.log(`exhibits    ${loaded.library.exhibits.length} — ${loaded.library.exhibits.map((e) => `${e.slug}(${e.objects.length} obj)`).join(", ")}`);
  console.log(`annotations ${Object.values(loaded.logs).reduce((n, l) => n + l.length, 0)} record(s) carried`);
  console.log(`pyramids    ${reusedPyramids} reused${NO_VIEWER ? "" : `; viewer bundle ${bundle!.size} files`}`);
  console.log(`written     ${Object.keys(files).length} files / ${bytes} bytes -> ${OUT}${NO_VIEWER ? "  [--no-viewer: RED control]" : ""}`);
  if (report.missingAssets.length > 0) console.log(`MISSING ASSETS: ${JSON.stringify(report.missingAssets)}`);
  if (report.brokenLinks.length > 0) console.log(`BROKEN LINKS: ${JSON.stringify(report.brokenLinks)}`);
  if (report.incompleteCanvases.length > 0) console.log(`INCOMPLETE CANVASES: ${JSON.stringify(report.incompleteCanvases)}`);
  // The generation is not on PublishResult — it is stamped into the marker, which is also the
  // publish COMMIT POINT. Read it back off the written tree, so what is printed is what shipped.
  const marker = JSON.parse(await readFile(path.join(OUT, "archie.json"), "utf8")) as { generation?: string };
  console.log(`generation  ${marker.generation}`);
}

await main();
