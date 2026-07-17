// Library-level image index (ADR-0023 / SCALE-GALLERY Phase 3, spike-0004 §1). A flat, publish-time
// projection of every Object across the Library — the Viewer Gallery's all-images wall reads THIS one
// file (`images.json`) instead of eager-fetching every manifest at landing.
//
// Built by reading each exhibit's PUBLISHED `manifest.json` AFTER the write loop, so it is uniform for
// freshly-written AND incrementally-skipped exhibits (a skipped exhibit's manifest is the untouched prior
// one — still correct). The thumbnail ref it copies is `canvas.thumbnail` — a baked `{slug}/assets-thumb/…`
// path OR a derived IIIF thumbnail URL — read DIRECTLY off the canvas (unlike `objectsFromManifest`, which
// recovers only baked thumbs), so remote-source Objects get a wall thumbnail too, and the ref provably
// survives a byte-pass-skipped incremental publish (the recover path re-emits `canvas.thumbnail` verbatim).

import type { Filesystem } from "../fs/seam.js";
import type { Library } from "../model/model.js";
import { fsJsonSource } from "../publish/read.js";
import { objIdFromCanvasId } from "./manifest.js";
import type { IIIFManifest } from "./presentation.js";

/** One Object in the library-level image index (ADR-0023 pinned format). */
export interface ImageIndexEntry {
  objectId: string;
  exhibitSlug: string;
  title: string;
  /** Published thumbnail ref (baked `{slug}/assets-thumb/…` OR derived IIIF URL). Omitted for a
   *  thumbnail-less Object — e.g. an AV object with no baked derivative (spike-0004 deviation note). */
  thumbnail?: string;
  /** Canvas dimensions when known — lets the wall lay out a justified grid without measuring each thumb. */
  width?: number;
  height?: number;
}

/** The `images.json` payload (pre-`stamp()`): entries in library order, then per-exhibit reading order. */
export interface ImageIndex {
  images: ImageIndexEntry[];
}

/**
 * Project the published tree into the library-level image index. Reads each `{slug}/manifest.json` in
 * `library.exhibits` order, then each manifest's canvas (reading) order.
 *
 * Issue 25a (absent-vs-failed reconciliation): the manifest read goes through `getOptional`, whose Issue-23
 * contract is **absent (404 / not-found) → null; failed (torn JSON / read fault) → throw `FailedReadError`**.
 * So a genuinely-ABSENT manifest (an empty / never-written exhibit) contributes nothing — an empty Library
 * still yields the valid empty index `{ images: [] }` — but a TORN manifest **propagates loud** rather than
 * silently vanishing from the wall. This deliberately matches `loadLibrary`'s hard-throw on the same file
 * (site.ts): one corrupt file no longer means two policies (silent-omit here, hard-throw there). The
 * absent→omit branch is retained on purpose — a missing exhibit directory is not a corruption.
 */
export async function buildImageIndex(fs: Filesystem, library: Library): Promise<ImageIndex> {
  const src = fsJsonSource(fs);
  const images: ImageIndexEntry[] = [];
  for (const exhibit of library.exhibits) {
    const manifest = await src.getOptional<IIIFManifest>(`${exhibit.slug}/manifest.json`); // torn → throws (loud); absent → null (omit)
    if (!manifest) continue;
    for (const canvas of manifest.items) {
      const thumbnail = canvas.thumbnail?.[0]?.id;
      images.push({
        objectId: objIdFromCanvasId(canvas.id),
        exhibitSlug: exhibit.slug,
        title: canvas.label?.none?.[0] ?? "",
        ...(thumbnail !== undefined ? { thumbnail } : {}),
        ...(canvas.width !== undefined ? { width: canvas.width } : {}),
        ...(canvas.height !== undefined ? { height: canvas.height } : {}),
      });
    }
  }
  return { images };
}
