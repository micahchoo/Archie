// Bench 5 — INGEST as the caller actually drives it.
//
// The first sweep reported "ingest bake 7.9x" from a fleet of 24 concurrent bakes. That premise is
// false: `ingest-flows.ts#addFiles` is a strictly SERIAL `for` loop (`await addObjectFromFile` per
// file), and it is serial on purpose — a terminal storage-refusal `break` assumes every later write
// is doomed, and `run.tick({index, total})` reports sequential progress. So this measures the shape
// the caller has, and the shape it COULD have, side by side.
import { bakeDisplayMasterAsync, bakeThumbnailAsync, bakeFallbackCount } from "../../apps/studio/src/bake-async.ts";
import { bakeDisplayMaster, bakeThumbnail } from "../../apps/studio/src/bake.ts";
import { mapLimit } from "../../packages/render-core/src/concurrency.ts";

const out = document.querySelector("#out")!;
const say = (s: string) => { out.textContent += s + "\n"; console.log(s); };
const MAX_MASTER_DIM = 6000, THUMB_DIM = 480;

async function makeFile(i: number): Promise<File> {
  const c = new OffscreenCanvas(6000, 4000);
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 6000, 4000);
  g.addColorStop(0, `hsl(${i * 7 % 360} 60% 40%)`); g.addColorStop(1, "#222");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 6000, 4000);
  for (let k = 0; k < 3000; k++) { ctx.fillStyle = `rgb(${(k*37)%255},${(k*91)%255},${(k*13)%255})`; ctx.fillRect((k*131)%6000, (k*17)%4000, 30, 30); }
  const b = await c.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  return new File([b], `folio-${i}.jpg`, { type: "image/jpeg" });
}

async function main() {
  const N = 70;
  say(`building ${N} 6000x4000 source files…`);
  const files = await Promise.all(Array.from({ length: N }, (_, i) => makeFile(i)));
  say(`${N} files, ${(files.reduce((n, f) => n + f.size, 0) / 1e6).toFixed(0)} MB total\n`);

  const results: Record<string, number> = {};
  const time = async (label: string, fn: () => Promise<void>) => {
    const t = performance.now(); await fn(); const ms = performance.now() - t;
    results[label] = ms; say(`  ${label.padEnd(46)} ${(ms / 1000).toFixed(2).padStart(6)} s`); return ms;
  };

  // What ships today, driven the way addFiles drives it.
  await time("SERIAL, DOM canvas (pre-change)", async () => {
    for (const f of files) { const m = await bakeDisplayMaster(f, { maxDim: MAX_MASTER_DIM }); await bakeThumbnail(m.blob, THUMB_DIM, "image/png"); }
  });
  await time("SERIAL, worker pool (ships now)", async () => {
    for (const f of files) { const m = await bakeDisplayMasterAsync(f, { maxDim: MAX_MASTER_DIM }); await bakeThumbnailAsync(m.blob, THUMB_DIM, "image/png"); }
  });
  // What a bounded-concurrency addFiles would get, using the SAME shipped worker pool.
  for (const limit of [2, 4, 6]) {
    await time(`CONCURRENT x${limit}, worker pool (not shipped)`, async () => {
      await mapLimit(files, limit, async (f) => { const m = await bakeDisplayMasterAsync(f, { maxDim: MAX_MASTER_DIM }); await bakeThumbnailAsync(m.blob, THUMB_DIM, "image/png"); });
    });
  }
  say(`\n  worker fallbacks: ${bakeFallbackCount()} (non-zero ⇒ the pool silently did not run)`);
  (window as unknown as { __BENCH__: unknown }).__BENCH__ = results;
}
main().catch((e) => { say(`ERROR: ${e?.stack ?? e}`); (window as unknown as { __BENCH__: unknown }).__BENCH__ = { error: String(e) }; });
