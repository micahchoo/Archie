// Display-master bake (CONTEXT §89.1): on import of a phone photo with EXIF orientation, generate an
// UPRIGHT derivative so everything downstream — OSD, Annotorious coords, publish — is orientation-blind
// (the decision's whole point: "ZERO orientation-awareness in the coord layer"). The original is
// preserved separately (store.saveOriginalFile); this produces the master the object's `source` points at.
//
// Browser-only (createImageBitmap + canvas) — verified in the browser, not headless. The pixel push
// is delegated to the browser via `imageOrientation: "from-image"`, which decodes already-upright;
// the core reader (readExifOrientation) decides WHETHER to bake and records the orientation/transform.
// The dimension math (fitWithin) is the headless-tested core seam; only the canvas re-encode is here.
import { fitWithin } from "@render/core";

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
