// Archie author-side image-pipeline benchmark (real shipped code, not transcriptions).
//
// Subject: the two main-thread batch paths that had no worker offload at all —
//   1. publish-time DZI tiling  — apps/studio/src/dzi-slicer.ts  sliceToDzi()
//   2. ingest-time bake         — apps/studio/src/bake.ts        bakeDisplayMaster/bakeThumbnail
//
// The tiling baseline is produced by calling the REAL sliceToDzi with encodeConcurrency=1, which is
// exactly the pre-2026-07-24 serial behaviour — so "before" and "after" are the same function under
// one parameter, and the identity check below compares like with like.
//
// Driven headlessly by scripts/perf/run.mjs.
import { dziPyramid } from "@render/core";
import { sliceToDzi } from "../../apps/studio/src/dzi-slicer.ts";
import { bakeDisplayMaster, bakeThumbnail } from "../../apps/studio/src/bake.ts";
import { sliceToDziPooled, poolAvailable } from "../../apps/studio/src/dzi-slice-pool.ts";
import { bakeDisplayMasterAsync, bakeThumbnailAsync, bakeFallbackCount } from "../../apps/studio/src/bake-async.ts";

const FORMAT = "image/jpeg";
const QUALITY = 0.82;
const SIZES: [number, number][] = [[4096, 4096], [8000, 6000]];

const out = document.getElementById("out")!;
const say = (s: string) => { out.textContent += `\n${s}`; console.log(s); };
const ms = async (fn: () => Promise<unknown>) => { const t = performance.now(); await fn(); return performance.now() - t; };

/** Photographic-ish source: high-frequency noise + gradients. A flat fill would make JPEG encode
 *  ~free and the whole benchmark a lie, so content matters more than realism here. */
async function makeSource(w: number, h: number): Promise<{ bitmap: ImageBitmap; blob: Blob }> {
  const noise = new OffscreenCanvas(512, 512);
  const nctx = noise.getContext("2d")!;
  const img = nctx.createImageData(512, 512);
  let seed = 12345;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = seed >>> 24;
    img.data[i] = v; img.data[i + 1] = (v * 3) & 255; img.data[i + 2] = (v * 7) & 255; img.data[i + 3] = 255;
  }
  nctx.putImageData(img, 0, 0);

  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext("2d")!;
  for (let y = 0; y < h; y += 512) for (let x = 0; x < w; x += 512) ctx.drawImage(noise, x, y);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "rgba(255,80,0,0.55)");
  g.addColorStop(0.5, "rgba(0,120,255,0.35)");
  g.addColorStop(1, "rgba(0,255,140,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const blob = await c.convertToBlob({ type: FORMAT, quality: 0.9 });
  return { bitmap: await createImageBitmap(blob), blob };
}

/** Byte-compare two tile maps. Same keys AND same bytes = the change is provably pixel-neutral. */
async function compareTiles(a: Map<string, Blob>, b: Map<string, Blob>) {
  if (a.size !== b.size) return { identical: false, detail: `size ${a.size} vs ${b.size}` };
  const missing = [...a.keys()].filter((k) => !b.has(k));
  if (missing.length) return { identical: false, detail: `${missing.length} missing key(s), e.g. ${missing[0]}` };
  let differing = 0;
  let firstDiff = "";
  for (const [k, blobA] of a) {
    const blobB = b.get(k)!;
    if (blobA.size !== blobB.size) { differing++; firstDiff ||= `${k} (size ${blobA.size} vs ${blobB.size})`; continue; }
    const [bufA, bufB] = await Promise.all([blobA.arrayBuffer(), blobB.arrayBuffer()]);
    const ua = new Uint8Array(bufA), ub = new Uint8Array(bufB);
    for (let i = 0; i < ua.length; i++) {
      if (ua[i] !== ub[i]) { differing++; firstDiff ||= `${k} (byte ${i})`; break; }
    }
  }
  return { identical: differing === 0, detail: differing ? `${differing}/${a.size} tiles differ, first ${firstDiff}` : "byte-identical" };
}

async function main() {
  out.textContent = "running…";
  const results: Record<string, unknown> = { cores: navigator.hardwareConcurrency, poolAvailable: poolAvailable() };

  for (const [w, h] of SIZES) {
    const key = `${w}x${h}`;
    say(`\n=== ${key} ===`);
    const { bitmap, blob } = await makeSource(w, h);
    const pyr = dziPyramid(w, h);
    const r: Record<string, unknown> = { tiles: pyr.totalTiles, levels: pyr.levels.length };
    say(`${pyr.totalTiles} tiles across ${pyr.levels.length} levels`);

    // Baseline = the shipped pre-change behaviour, reproduced exactly by concurrency 1.
    let reference: Map<string, Blob> | null = null;
    r.serial = await ms(async () => {
      reference = (await sliceToDzi(bitmap, "b", FORMAT, undefined, undefined, QUALITY, 1)).tiles;
    });
    say(`concurrency   1 (== shipped)      ${(r.serial as number).toFixed(0)} ms`);

    // Bound sweep — pick the plateau, not the maximum.
    for (const n of [8, 16, 32, 48, 64, 128]) {
      let tiles: Map<string, Blob> | null = null;
      const t = await ms(async () => { tiles = (await sliceToDzi(bitmap, "b", FORMAT, undefined, undefined, QUALITY, n)).tiles; });
      r[`c${n}`] = t;
      const cmp = await compareTiles(reference!, tiles!);
      say(`concurrency ${String(n).padStart(3)}                  ${t.toFixed(0)} ms  ` +
          `(${((r.serial as number) / t).toFixed(1)}x)  ${cmp.identical ? "✓ identical" : "✗ " + cmp.detail}`);
      r[`c${n}_identical`] = cmp.identical;
    }

    // Worker pool — off the main thread entirely.
    if (poolAvailable()) {
      for (const n of [4, 8, 12]) {
        let tiles: Map<string, Blob> | null = null;
        const t = await ms(async () => { tiles = (await sliceToDziPooled(blob, w, h, "b", FORMAT, QUALITY, n)).tiles; });
        r[`pool${n}`] = t;
        const cmp = await compareTiles(reference!, tiles!);
        say(`worker pool x${String(n).padStart(2)}               ${t.toFixed(0)} ms  ` +
            `(${((r.serial as number) / t).toFixed(1)}x)  ${cmp.identical ? "✓ identical" : "✗ " + cmp.detail}`);
        r[`pool${n}_identical`] = cmp.identical;
      }
    } else {
      say("worker pool UNAVAILABLE in this environment");
    }

    bitmap.close();
    results[key] = r;
  }

  // ── ingest bake path ──
  say(`\n=== ingest bake (6000x4000 source) ===`);
  const { blob: src } = await makeSource(6000, 4000);
  const bake: Record<string, unknown> = {};
  bake.domMaster = await ms(async () => { await bakeDisplayMaster(src, { maxDim: 4096, mime: FORMAT }); });
  const master = (await bakeDisplayMaster(src, { maxDim: 4096, mime: FORMAT })).blob;
  bake.domThumb = await ms(async () => { await bakeThumbnail(master, 512, FORMAT); });
  bake.domPerImage = (bake.domMaster as number) + (bake.domThumb as number);
  say(`DOM canvas  master ${(bake.domMaster as number).toFixed(0)} ms + thumb ${(bake.domThumb as number).toFixed(0)} ms ` +
      `= ${(bake.domPerImage as number).toFixed(0)} ms/image  (x70 = ${((bake.domPerImage as number) * 70 / 1000).toFixed(1)} s)`);

  // Worker-backed, one image at a time (isolates per-image cost, no parallelism credit).
  bake.workerMaster = await ms(async () => { await bakeDisplayMasterAsync(src, { maxDim: 4096, mime: FORMAT }); });
  bake.workerThumb = await ms(async () => { await bakeThumbnailAsync(master, 512, FORMAT); });
  bake.workerPerImage = (bake.workerMaster as number) + (bake.workerThumb as number);
  say(`worker      master ${(bake.workerMaster as number).toFixed(0)} ms + thumb ${(bake.workerThumb as number).toFixed(0)} ms ` +
      `= ${(bake.workerPerImage as number).toFixed(0)} ms/image`);

  // The real ingest win is the FLEET: 70 images through the pool vs 70 sequential DOM bakes.
  const FLEET = 24;
  bake.domFleet = await ms(async () => {
    for (let i = 0; i < FLEET; i++) await bakeDisplayMaster(src, { maxDim: 4096, mime: FORMAT });
  });
  bake.workerFleet = await ms(async () => {
    await Promise.all(Array.from({ length: FLEET }, () => bakeDisplayMasterAsync(src, { maxDim: 4096, mime: FORMAT })));
  });
  say(`fleet of ${FLEET}: DOM ${(bake.domFleet as number).toFixed(0)} ms → worker pool ${(bake.workerFleet as number).toFixed(0)} ms  ` +
      `(${((bake.domFleet as number) / (bake.workerFleet as number)).toFixed(1)}x)`);
  // Every worker-labelled number above is only meaningful if the worker path actually ran.
  bake.fallbacks = bakeFallbackCount();
  say(bake.fallbacks === 0
    ? `✓ 0 DOM fallbacks — worker numbers are real`
    : `✗ ${bake.fallbacks} DOM fallbacks — worker numbers above are CONTAMINATED`);
  results.bake = bake;

  (window as unknown as { __BENCH__: unknown }).__BENCH__ = results;
  say("\nDONE");
}

main().catch((e) => {
  say(`ERROR ${e?.stack || e}`);
  (window as unknown as { __BENCH__: unknown }).__BENCH__ = { error: String(e?.stack || e) };
});
