// APPROACH P — data-provider + blob URLs.
//
// The portable Viewer opens a `.archie.zip` → ZipFilesystem (zip.ts:fromZip). It then reads the
// SAME data published.ts would fetch over HTTP, but out of the in-memory fs; and because there is
// no server to resolve `{slug}/assets/{name}` bytes, it mints `blob:` object URLs for them and
// REWRITES the image URLs in the returned data to point at those blobs.
//
// Why this is cheap at the sink: `thumbnailUrl` already passes `blob:` and `data:` through unchanged
// (render-core/src/iiif/resolve.test.ts:46-47), so ObjectGrid/Reader's `thumbnailUrl(obj.source,…)`
// and MediaPlayer's `object.source` render a blob URL with ZERO component changes. NoteMedia/Lightbox
// read `m.url` from the parsed note body — same blob-rewrite trick on a relative asset url.
//
// Prior art cited:
//   - PublishedExhibit shape (incl. readings + readingAnnotationsByObject) — apps/viewer/src/published.ts:28
//   - readPublishedExhibit returns a STRUCTURALLY-NARROWER shape (no readings) — site.ts:287,306
//   - ZipFilesystem / FsDirectory seam                                       — fs/zip.ts, fs/seam.ts
//   - blob:/data: passthrough                                                — iiif/resolve.ts:41 (+ test:46)
//   - revoke lifecycle pattern                                               — apps/studio/src/App.svelte:99

import type { Filesystem, FsDirectory } from "../../../packages/render-core/src/fs/seam.js";
import {
  objectsFromManifest,
  canvasIdMap,
  sectionsFromManifest,
  rightsFromIIIF,
} from "../../../packages/render-core/src/index.js";
import type {
  AObject,
  IIIFManifest,
  Reading,
  Section,
  W3CAnnotation,
} from "../../../packages/render-core/src/index.js";

/** The exhibit data the portable Viewer hands components — the SAME shape published.ts produces
 *  over HTTP (apps/viewer/src/published.ts:28), so the read path is identical downstream. */
export interface PortableExhibit {
  slug: string;
  title: string;
  summary?: string;
  objects: AObject[];
  annotationsByObject: Record<string, W3CAnnotation[]>;
  readings: Reading[];
  readingAnnotationsByObject: Record<string, Record<string, W3CAnnotation[]>>;
  sections: Section[];
  canvasIdByObject: Record<string, string>;
}

/** A portable load result + its revoke handle (App.svelte:99 lifecycle). Call `revoke()` on
 *  navigation away / library close to free the minted blob URLs. */
export interface PortableLoad {
  exhibit: PortableExhibit;
  /** Minted blob URLs, in mint order, for the revoke lifecycle. */
  blobUrls: string[];
  revoke(): void;
}

const ASSET_SEG = "/assets/";

async function readJson<T>(dir: FsDirectory, name: string): Promise<T> {
  const file = await dir.getFile(name);
  return JSON.parse(new TextDecoder().decode(await file.readable())) as T;
}

async function readJsonOptional<T>(dir: FsDirectory, name: string): Promise<T | null> {
  try {
    return await readJson<T>(dir, name);
  } catch {
    return null; // missing file (e.g. readings.json on a base-only exhibit) → null, like fetchJsonOptional
  }
}

/**
 * Mint a `blob:` URL for an embedded asset, reading its bytes out of `{slug}/assets/{name}`.
 * Returns null if the file isn't in the archive (leave the source as-is, like publishLibrary's
 * "bytes unavailable" branch, site.ts:136).
 */
async function mintAssetBlob(
  root: FsDirectory,
  slug: string,
  name: string,
  mime: string,
  sink: string[],
): Promise<string | null> {
  let exDir: FsDirectory;
  let assetsDir: FsDirectory;
  try {
    exDir = await root.getDirectory(slug);
    assetsDir = await exDir.getDirectory("assets");
  } catch {
    return null;
  }
  let file;
  try {
    file = await assetsDir.getFile(name);
  } catch {
    return null;
  }
  const bytes = await file.readable();
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  sink.push(url);
  return url;
}

function guessMime(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
    svg: "image/svg+xml", mp3: "audio/mpeg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm",
  };
  return map[ext] ?? "application/octet-stream";
}

/**
 * Rewrite an asset-relative URL to a blob URL. The published object.source for an imported asset is
 * `${baseUrl}${slug}/assets/${name}` (site.ts:141); note-body media (`![](…/assets/x.png)`) may carry
 * either an absolute published url or a bare `assets/name`. We match on the `/assets/` segment and
 * mint a blob for whatever follows. Returns the input unchanged if it isn't an embedded asset.
 */
async function rewriteAssetUrl(
  root: FsDirectory,
  slug: string,
  url: string,
  sink: string[],
): Promise<string> {
  const idx = url.indexOf(ASSET_SEG);
  if (idx === -1) return url; // external IIIF / http image / blob / data — leave alone (resolve.ts passthrough)
  const name = url.slice(idx + ASSET_SEG.length).split(/[?#]/)[0]!;
  const blob = await mintAssetBlob(root, slug, name, guessMime(name), sink);
  return blob ?? url;
}

/** Rewrite embedded-asset urls inside a note body's markdown/HTML (the `m.url` sink:
 *  NoteMedia/NoteLightbox read these via splitNoteMedia). We rewrite the raw body text so the
 *  existing splitNoteMedia pipeline yields blob urls with no component change. */
async function rewriteNoteBodyMedia(
  root: FsDirectory,
  slug: string,
  note: W3CAnnotation,
  sink: string[],
): Promise<W3CAnnotation> {
  const body = (note as { body?: unknown }).body;
  if (body === undefined) return note;
  const arr = Array.isArray(body) ? body : [body];
  let changed = false;
  const next = await Promise.all(
    arr.map(async (b) => {
      const v = (b as { value?: unknown }).value;
      if (typeof v !== "string" || !v.includes(ASSET_SEG)) return b;
      // Find every `/assets/<name>` token in the body text and swap it for a blob url.
      const matches = [...v.matchAll(/[^\s"'()]*\/assets\/[^\s"'()]+/g)].map((m) => m[0]);
      let out = v;
      for (const url of matches) {
        const blob = await rewriteAssetUrl(root, slug, url, sink);
        if (blob !== url) {
          out = out.split(url).join(blob);
          changed = true;
        }
      }
      return changed ? { ...(b as object), value: out } : b;
    }),
  );
  if (!changed) return note;
  return { ...note, body: Array.isArray(body) ? next : next[0] } as W3CAnnotation;
}

/**
 * Load ONE published exhibit from the opened zip filesystem, resolving embedded media to blob URLs.
 * Mirrors apps/viewer/src/published.ts:loadPublishedExhibit, including the readings registry that
 * site.ts:readPublishedExhibit OMITS — so the portable path is data-complete for the legend.
 */
export async function loadPortableExhibit(fs: Filesystem, slug: string): Promise<PortableLoad> {
  const root = await fs.root();
  const exDir = await root.getDirectory(slug);
  const manifest = await readJson<IIIFManifest>(exDir, "manifest.json");
  const objects = objectsFromManifest(manifest);
  const blobUrls: string[] = [];

  // Rewrite each object.source that points at an embedded asset → blob url.
  const rewrittenObjects: AObject[] = await Promise.all(
    objects.map(async (o) => {
      const src = await rewriteAssetUrl(root, slug, o.source, blobUrls);
      return src === o.source ? o : { ...o, source: src };
    }),
  );

  const readings = (await readJsonOptional<Reading[]>(exDir, "readings.json")) ?? [];

  const canvasDir = await exDir.getDirectory("canvas");
  const annotationsByObject: Record<string, W3CAnnotation[]> = {};
  const readingAnnotationsByObject: Record<string, Record<string, W3CAnnotation[]>> = {};
  for (const obj of objects) {
    const objDir = await canvasDir.getDirectory(obj.id);
    const base = await readJson<{ items?: W3CAnnotation[] }>(objDir, "annotations.json");
    annotationsByObject[obj.id] = await Promise.all(
      (base.items ?? []).map((n) => rewriteNoteBodyMedia(root, slug, n, blobUrls)),
    );
    if (readings.length > 0) {
      readingAnnotationsByObject[obj.id] = {};
      for (const r of readings) {
        const page = await readJsonOptional<{ items?: W3CAnnotation[] }>(objDir, `annotations-${r.id}.json`);
        readingAnnotationsByObject[obj.id][r.id] = await Promise.all(
          (page?.items ?? []).map((n) => rewriteNoteBodyMedia(root, slug, n, blobUrls)),
        );
      }
    }
  }

  const title = manifest.label?.none?.[0] ?? slug;
  const summary = (manifest as { summary?: { none?: string[] } }).summary?.none?.[0];
  const sections = sectionsFromManifest(manifest);
  const canvasIdByObject = canvasIdMap(manifest);

  const exhibit: PortableExhibit = {
    slug,
    title,
    objects: rewrittenObjects,
    annotationsByObject,
    readings,
    readingAnnotationsByObject,
    sections,
    canvasIdByObject,
    ...rightsFromIIIF(manifest),
    ...(summary !== undefined ? { summary } : {}),
  };

  return {
    exhibit,
    blobUrls,
    revoke() {
      for (const u of blobUrls) URL.revokeObjectURL(u);
      blobUrls.length = 0;
    },
  };
}
