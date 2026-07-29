// Ingest bake worker — the off-main-thread half of bake-async.ts.
//
// Mirrors bake.ts exactly, with OffscreenCanvas in place of document.createElement("canvas") (there is
// no DOM here). The dimension math is the SAME imported core seam (fitWithin / exceedsCap), so the two
// implementations cannot drift on the part that decides what gets stored.
// The DOM-FREE subpath, deliberately — NOT the "@render/core" barrel, which re-exports
// text/sanitize.ts and dies on import in a worker (no DOM for DOMPurify to attach to).
// See packages/render-core/src/worker.ts for the measurement and the failing line.
import { fitWithin, exceedsCap } from "@render/core/worker";

interface MasterMsg { kind: "master"; id: number; file: Blob; maxDim: number; mime: string; quality: number }
interface ThumbMsg { kind: "thumb"; id: number; master: Blob; dim: number; mime: string; quality: number }
interface DownscaleMsg { kind: "downscale"; id: number; file: Blob; maxDim: number; mime: string }

/** Shared encode tail: draw `bmp` into a target-sized OffscreenCanvas and encode. */
async function encode(bmp: ImageBitmap, width: number, height: number, mime: string, quality: number) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("bake-worker: 2D canvas context unavailable");
  ctx.drawImage(bmp, 0, 0, width, height);
  const lossy = mime === "image/jpeg" || mime === "image/webp";
  return canvas.convertToBlob(lossy ? { type: mime, quality } : { type: mime });
}

self.onmessage = async (e: MessageEvent<MasterMsg | ThumbMsg | DownscaleMsg>) => {
  const msg = e.data;
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
  try {
    if (msg.kind === "master") {
      // imageOrientation: "from-image" — the EXIF bake contract from bake.ts (decode already upright).
      const bmp = await createImageBitmap(msg.file, { imageOrientation: "from-image" });
      try {
        const t = msg.maxDim > 0 ? fitWithin(bmp.width, bmp.height, msg.maxDim) : { width: bmp.width, height: bmp.height };
        const blob = await encode(bmp, t.width, t.height, msg.mime, msg.quality);
        post({ kind: "done", id: msg.id, blob, width: t.width, height: t.height });
      } finally { bmp.close(); }
      return;
    }
    if (msg.kind === "thumb") {
      const bmp = await createImageBitmap(msg.master);
      try {
        if (!exceedsCap(bmp.width, bmp.height, msg.dim)) { post({ kind: "done", id: msg.id, blob: null }); return; }
        const t = fitWithin(bmp.width, bmp.height, msg.dim);
        const blob = await encode(bmp, t.width, t.height, msg.mime, msg.quality);
        post({ kind: "done", id: msg.id, blob, width: t.width, height: t.height });
      } finally { bmp.close(); }
      return;
    }
    // downscale: return the ORIGINAL bytes untouched when already under the cap (bake.ts contract).
    const bmp = await createImageBitmap(msg.file);
    try {
      if (!exceedsCap(bmp.width, bmp.height, msg.maxDim)) {
        post({ kind: "done", id: msg.id, blob: msg.file, width: bmp.width, height: bmp.height, untouched: true });
        return;
      }
      const t = fitWithin(bmp.width, bmp.height, msg.maxDim);
      const blob = await encode(bmp, t.width, t.height, msg.mime, 0.92);
      post({ kind: "done", id: msg.id, blob, width: t.width, height: t.height });
    } finally { bmp.close(); }
  } catch (err) {
    post({ kind: "error", id: msg.id, message: String((err as Error)?.message ?? err) });
  }
};
