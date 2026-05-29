// Portable read seam (ADR-0010): read a published tree out of an in-memory Filesystem (a
// `.archie.zip` opened via ZipFilesystem.fromZip), resolving embedded `{slug}/assets/{name}` media
// to `blob:` object URLs — because the portable Viewer has NO server to resolve those paths.
//
// Sibling of `readPublishedExhibit` (site.ts): same Filesystem-seam read, but (a) it mints blob URLs
// for embedded assets and rewrites the image URLs to them, and (b) it ALSO carries the Readings
// registry that `readPublishedExhibit` omits (the Viewer's legend needs it), mirroring the Viewer's
// HTTP `loadPublishedExhibit` (apps/viewer/src/published.ts). The Viewer's published.ts gains the
// hosted/portable branch that calls this in PV-2; this module is the pure, tested data source.
//
// Why blob URLs are cheap downstream: `thumbnailUrl` passes `blob:`/`data:` through unchanged
// (resolve.ts:41) so ObjectGrid/Reader/MediaPlayer need no change; note-body media (`m.url`, fed by
// splitNoteMedia) works because we rewrite the `/assets/` token inside the body text too.
// Provenance of this code: promoted from spikes/portable-viewer-seam/approach-p (ADR-0010 donor).

import type { Filesystem, FsDirectory } from "../fs/seam.js";
import type { Reading } from "../model/model.js";
import type { W3CAnnotation } from "../wadm/types.js";
import type { ExhibitsJson } from "../iiif/exhibits.js";
import type { PublishedExhibitData } from "./site.js";
import { readExhibitTree, fsJsonSource, type NoteTransform } from "./read.js";

/** A portably-read exhibit: the preview/HTTP `PublishedExhibitData` PLUS the Readings registry (the
 *  legend needs it) — structurally what the Viewer consumes. As of the ADR-0007 read↔write fix,
 *  `readPublishedExhibit` also returns this superset; `loadPortableExhibit` adds only the blob rewrite. */
export interface PortableExhibit extends PublishedExhibitData {
  readings: Reading[];
  readingAnnotationsByObject: Record<string, Record<string, W3CAnnotation[]>>;
}

/** A load result + its revoke handle (App.svelte:99 lifecycle). Call `revoke()` on navigation away /
 *  library close / "open another library" to free the minted blob URLs. */
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

/**
 * Mint a `blob:` URL for an embedded asset at `{slug}/assets/{name}`. Returns null if the file isn't
 * in the archive — leave the source as-is, like publishLibrary's "bytes unavailable" branch (site.ts).
 */
async function mintAssetBlob(root: FsDirectory, slug: string, name: string, mime: string, sink: string[]): Promise<string | null> {
  let assetsDir: FsDirectory;
  try {
    assetsDir = await (await root.getDirectory(slug)).getDirectory("assets");
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
 * Rewrite an asset-relative URL to a blob URL. The published `object.source` for an imported asset is
 * `${baseUrl}${slug}/assets/${name}` (site.ts); note-body media may carry an absolute published url or
 * a bare `assets/name`. Match on the `/assets/` segment, mint a blob for what follows. Returns the
 * input unchanged if it isn't an embedded asset (external IIIF / http / blob / data — resolve.ts passthrough).
 */
async function rewriteAssetUrl(root: FsDirectory, slug: string, url: string, sink: string[]): Promise<string> {
  const idx = url.indexOf(ASSET_SEG);
  if (idx === -1) return url;
  const name = url.slice(idx + ASSET_SEG.length).split(/[?#]/)[0]!;
  const blob = await mintAssetBlob(root, slug, name, guessMime(name), sink);
  return blob ?? url;
}

/** Rewrite embedded-asset urls inside a note body (the `m.url` sink: NoteMedia/NoteLightbox read these
 *  via splitNoteMedia). Rewriting the raw body text yields blob urls with no component change. */
async function rewriteNoteBodyMedia(root: FsDirectory, slug: string, note: W3CAnnotation, sink: string[]): Promise<W3CAnnotation> {
  const body = (note as { body?: unknown }).body;
  if (body === undefined) return note;
  const arr = Array.isArray(body) ? body : [body];
  let changed = false;
  const next = await Promise.all(
    arr.map(async (b) => {
      const v = (b as { value?: unknown }).value;
      if (typeof v !== "string" || !v.includes(ASSET_SEG)) return b;
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
  return { ...note, body: Array.isArray(body) ? next : next[0]! } as W3CAnnotation;
}

/**
 * Read ONE published exhibit from the opened Filesystem, resolving embedded media to blob URLs.
 * Mirrors the Viewer's HTTP `loadPublishedExhibit`, including the readings registry — so the
 * portable path is data-complete for the legend. Adds only the blob rewrite over `readPublishedExhibit`.
 */
export async function loadPortableExhibit(fs: Filesystem, slug: string): Promise<PortableLoad> {
  const root = await fs.root();
  const blobUrls: string[] = [];
  // The blob-rewrite transform is fs-coupled (mintAssetBlob reads asset bytes off `root`): rewrite the
  // object source, then each note body's `/assets/` tokens, minting into `blobUrls` for revoke().
  const transform: NoteTransform = {
    object: async (o) => {
      const src = await rewriteAssetUrl(root, slug, o.source, blobUrls);
      return src === o.source ? o : { ...o, source: src };
    },
    note: (n) => rewriteNoteBodyMedia(root, slug, n, blobUrls),
  };
  const exhibit = await readExhibitTree(fsJsonSource(fs), slug, transform);
  return {
    exhibit,
    blobUrls,
    revoke() {
      for (const u of blobUrls) URL.revokeObjectURL(u);
      blobUrls.length = 0;
    },
  };
}

/** Read the Library Gallery index (`exhibits.json`) from the opened Filesystem — the portable
 *  equivalent of the Viewer's HTTP `loadGallery`. No media, so no blob lifecycle. */
export async function loadPortableGallery(fs: Filesystem): Promise<ExhibitsJson> {
  const root = await fs.root();
  return readJson<ExhibitsJson>(root, "exhibits.json");
}
