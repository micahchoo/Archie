// Display-master bake (CONTEXT §89.1): on import of a phone photo with EXIF orientation, generate an
// UPRIGHT derivative so everything downstream — OSD, Annotorious coords, publish — is orientation-blind
// (the decision's whole point: "ZERO orientation-awareness in the coord layer"). The original is
// preserved separately (store.saveOriginalFile); this produces the master the object's `source` points at.
//
// Browser-only (createImageBitmap + canvas) — verified in the browser, not headless. The pixel push
// is delegated to the browser via `imageOrientation: "from-image"`, which decodes already-upright;
// the core reader (readExifOrientation) decides WHETHER to bake and records the orientation/transform.
// The dimension math (fitWithin) is the headless-tested core seam; only the canvas re-encode is here.
import { fitWithin, exceedsCap } from "@render/core";

export interface BakedMaster {
  blob: Blob;
  width: number;
  height: number;
}

export interface BakeOptions {
  /** Cap the longer edge to this many px (downscale-only, LARGE-MEDIA-MEMORY-CEILING #4 / §80). Omit or 0
   *  = keep full dimensions. */
  maxDim?: number;
  /** Output mime. Default "image/png" (the upright EXIF master). Pass the SOURCE mime to preserve format
   *  when downscaling a non-rotated import — re-encoding a JPEG photo to PNG would bloat it. */
  mime?: string;
  /** Encode quality (0–1) for a lossy `mime` (jpeg/webp). Default 0.92. Ignored for png. */
  quality?: number;
}

/** Re-encode `file` to a display master via the browser canvas. Dimensions come from the decoded
 *  (upright) bitmap, optionally capped to `maxDim` on the longer edge (aspect-preserving downscale) —
 *  deterministic, and exactly what the stored master measures. Default output is upright PNG (the EXIF
 *  bake); pass `mime` to preserve a non-rotated import's format while downscaling. */
export async function bakeDisplayMaster(file: Blob, opts: BakeOptions = {}): Promise<BakedMaster> {
  const { maxDim = 0, mime = "image/png", quality = 0.92 } = opts;
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const target = maxDim > 0 ? fitWithin(bmp.width, bmp.height, maxDim) : { width: bmp.width, height: bmp.height };
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable for display-master bake");
    ctx.drawImage(bmp, 0, 0, target.width, target.height); // dest dims = the downscale
    const lossy = mime === "image/jpeg" || mime === "image/webp";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, lossy ? quality : undefined));
    if (!blob) throw new Error("canvas.toBlob produced no display master");
    return { blob, width: target.width, height: target.height };
  } finally {
    bmp.close();
  }
}

/** Bake a small gallery/overview THUMBNAIL from an already-baked display master (the grid loads this, not
 *  the full master — the multi-object load win). Decodes the master (already ≤ MAX_MASTER_DIM, so cheap)
 *  and downscales to `dim` on the longer edge in the SAME `mime` (so the stored name's extension stays
 *  truthful). Returns null when the master is already within `dim` — then there's nothing to gain and the
 *  caller leaves the object thumbnail-less (the grid uses the master). Lossy mimes use `quality` (default
 *  0.8 — a thumbnail tolerates more compression than the master). */
export async function bakeThumbnail(master: Blob, dim: number, mime: string, quality = 0.8): Promise<Blob | null> {
  const bmp = await createImageBitmap(master);
  try {
    if (!exceedsCap(bmp.width, bmp.height, dim)) return null; // master already small — use it directly
    const target = fitWithin(bmp.width, bmp.height, dim);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable for thumbnail bake");
    ctx.drawImage(bmp, 0, 0, target.width, target.height);
    const lossy = mime === "image/jpeg" || mime === "image/webp";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, lossy ? quality : undefined));
    if (!blob) throw new Error("canvas.toBlob produced no thumbnail");
    return blob;
  } finally {
    bmp.close();
  }
}

/** Decode `file` ONCE to read its dimensions; if it exceeds `maxDim` on the longer edge, re-encode a
 *  downscaled master (preserving `mime`, quality 0.92 for lossy); otherwise return the file untouched
 *  with its real dimensions. Used by the non-rotated import path to avoid the double-decode of probing
 *  dims with a separate `<img>` and then re-decoding to bake (POLISH P6). */
export async function downscaleIfNeeded(file: Blob, maxDim: number, mime: string): Promise<BakedMaster> {
  const bmp = await createImageBitmap(file);
  try {
    if (!exceedsCap(bmp.width, bmp.height, maxDim)) {
      return { blob: file, width: bmp.width, height: bmp.height }; // under cap → keep the raw bytes
    }
    const target = fitWithin(bmp.width, bmp.height, maxDim);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable for downscale");
    ctx.drawImage(bmp, 0, 0, target.width, target.height);
    const lossy = mime === "image/jpeg" || mime === "image/webp";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, lossy ? 0.92 : undefined));
    if (!blob) throw new Error("canvas.toBlob produced no downscaled master");
    return { blob, width: target.width, height: target.height };
  } finally {
    bmp.close();
  }
}
