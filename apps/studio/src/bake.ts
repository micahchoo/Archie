// Display-master bake (CONTEXT §89.1): on import of a phone photo with EXIF orientation, generate an
// UPRIGHT derivative so everything downstream — OSD, Annotorious coords, publish — is orientation-blind
// (the decision's whole point: "ZERO orientation-awareness in the coord layer"). The original is
// preserved separately (store.saveOriginalFile); this produces the master the object's `source` points at.
//
// Browser-only (createImageBitmap + canvas) — verified in the browser, not headless. The pixel push
// is delegated to the browser via `imageOrientation: "from-image"`, which decodes already-upright;
// the core reader (readExifOrientation) decides WHETHER to bake and records the orientation/transform.

export interface BakedMaster {
  blob: Blob;
  width: number;
  height: number;
}

/** Re-encode `file` to an upright PNG display master. Dimensions come from the decoded (upright)
 *  bitmap — deterministic, and exactly what the stored master measures. */
export async function bakeDisplayMaster(file: Blob): Promise<BakedMaster> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable for EXIF bake");
    ctx.drawImage(bmp, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("canvas.toBlob produced no display master");
    return { blob, width: bmp.width, height: bmp.height };
  } finally {
    bmp.close();
  }
}
