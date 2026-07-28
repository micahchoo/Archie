// DZI tile worker — the off-main-thread half of dzi-slice-pool.ts. AUTHOR-SIDE / bake-time ONLY.
//
// Each worker decodes the source blob ONCE and then serves tile tasks. Two task shapes, chosen by the
// pool so that output stays BYTE-IDENTICAL to the single-threaded sliceToDzi (verified by
// scripts/perf/bench.ts's compareTiles, which byte-compares every tile against the serial reference):
//
//  - "strip": only ever dispatched for the pyramid's TOP level, whose scale is exactly 1 (maxLevel =>
//    2^0). Rendering a horizontal band there is a 1:1 blit, not a resample, so a band is pixel-exact
//    and carries no filter-tap edge error. This is where ~70-75% of all tiles live, so it is what
//    actually parallelizes.
//  - "level": render the whole level canvas and crop every tile — identical ops to the serial slicer.
//    Used for every DOWNSCALED level, where a band render WOULD risk differing filter taps. These
//    levels are cheap (each is a quarter of the one above), so not splitting them costs little.
//
// Memory is the binding constraint, not CPU: the decoded source alone is w*h*4 bytes per worker
// (192 MB for an 8000x6000). The pool sizes itself against that — see dzi-slice-pool.ts.
// The DOM-FREE subpath, deliberately — see bake-worker.ts and
// packages/render-core/src/worker.ts. The barrel cannot be imported here.
import { tileRect, tilePath, mapLimit, type DziLevel } from "@render/core/worker";

/** Encode fan-out WITHIN one worker. Deliberately smaller than the inline slicer's 48: this multiplies
 *  by the pool width, and the pool already saturates the encode threads. */
const WORKER_ENCODE_CONCURRENCY = 12;

interface InitMsg { kind: "init"; blob: Blob }
interface StripMsg { kind: "strip"; id: number; level: DziLevel; rowFrom: number; rowTo: number; tileSize: number; overlap: number; format: string; quality: number }
interface LevelMsg { kind: "level"; id: number; level: DziLevel; tileSize: number; overlap: number; format: string; quality: number }

let bitmap: ImageBitmap | null = null;

/** Crop + encode a set of (col,row) tiles out of an already-rendered canvas. `originY` is the canvas's
 *  top edge in LEVEL coordinates (0 for a full level render, the band top for a strip). */
async function emit(
  src: OffscreenCanvas, originY: number, lvl: DziLevel,
  coords: { col: number; row: number }[],
  tileSize: number, overlap: number, format: string, quality: number,
) {
  return mapLimit(coords, WORKER_ENCODE_CONCURRENCY, async ({ col, row }) => {
    const r = tileRect(lvl, col, row, tileSize, overlap);
    const tc = new OffscreenCanvas(r.sw, r.sh);
    const tctx = tc.getContext("2d");
    if (!tctx) throw new Error("dzi-tile-worker: no 2d context for the tile canvas");
    tctx.drawImage(src, r.sx, r.sy - originY, r.sw, r.sh, 0, 0, r.sw, r.sh);
    const blob = await tc.convertToBlob({ type: format, quality });
    return { path: tilePath(lvl.level, col, row, format), blob };
  });
}

self.onmessage = async (e: MessageEvent<InitMsg | StripMsg | LevelMsg>) => {
  const msg = e.data;
  const post = (m: unknown, t?: Transferable[]) => (self as unknown as Worker).postMessage(m, t ?? []);

  try {
    if (msg.kind === "init") {
      bitmap = await createImageBitmap(msg.blob);
      post({ kind: "ready" });
      return;
    }
    if (!bitmap) throw new Error("dzi-tile-worker: task before init");
    const { id, level: lvl, tileSize, overlap, format, quality } = msg;

    if (msg.kind === "strip") {
      // Top level only: scale is 1, so this is a 1:1 blit of rows [rowFrom, rowTo).
      let minSy = Infinity;
      let maxSy = 0;
      const coords: { col: number; row: number }[] = [];
      for (let row = msg.rowFrom; row < msg.rowTo; row++) {
        const r = tileRect(lvl, 0, row, tileSize, overlap);
        minSy = Math.min(minSy, r.sy);
        maxSy = Math.max(maxSy, r.sy + r.sh);
        for (let col = 0; col < lvl.cols; col++) coords.push({ col, row });
      }
      const bandH = maxSy - minSy;
      const strip = new OffscreenCanvas(lvl.scaledW, bandH);
      const sctx = strip.getContext("2d");
      if (!sctx) throw new Error("dzi-tile-worker: no 2d context for the strip canvas");
      sctx.drawImage(bitmap, 0, minSy, lvl.scaledW, bandH, 0, 0, lvl.scaledW, bandH);
      post({ kind: "done", id, tiles: await emit(strip, minSy, lvl, coords, tileSize, overlap, format, quality) });
      return;
    }

    // Whole downscaled level — same single drawImage the serial slicer does.
    const lc = new OffscreenCanvas(lvl.scaledW, lvl.scaledH);
    const lctx = lc.getContext("2d");
    if (!lctx) throw new Error("dzi-tile-worker: no 2d context for the level canvas");
    lctx.drawImage(bitmap, 0, 0, lvl.scaledW, lvl.scaledH);
    const coords: { col: number; row: number }[] = [];
    for (let col = 0; col < lvl.cols; col++) for (let row = 0; row < lvl.rows; row++) coords.push({ col, row });
    post({ kind: "done", id, tiles: await emit(lc, 0, lvl, coords, tileSize, overlap, format, quality) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ kind: "error", id: (msg as StripMsg).id ?? -1, message: String((err as Error)?.message ?? err) });
  }
};
