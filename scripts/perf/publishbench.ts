// Bench 3 — END-TO-END publish, the validation the first two sweeps were missing.
//
// Both prior sweeps measured PRIMITIVES (a tile encode, a heads projection) and reported large
// multiples. Neither showed the number moving in a flow a user performs. This one runs the real
// `publishLibrary` over a whole library, with the real `tileObject` wiring transcribed from
// apps/studio/src/publish-flows.svelte.ts, into the real fs backends — and asks the only question
// that decides whether the tiling work mattered: WHAT FRACTION OF PUBLISH IS TILING?
//
// If tiling is 80% of publish, 37x on it was the right target. If it is 15%, the next sweep should
// go somewhere else, and the honest headline is much smaller than "37x".
//
// Run:  node scripts/perf/publishrun.mjs
import { publishLibrary } from "../../packages/render-core/src/publish/site.ts";
import { MemoryFilesystem } from "../../packages/render-core/src/fs/memory.ts";
import { ZipStreamFilesystem } from "../../packages/render-core/src/fs/zip-stream.ts";
import { FsaFilesystem } from "../../packages/render-core/src/fs/fsa.ts";
import type { Filesystem } from "../../packages/render-core/src/fs/seam.ts";
import { appendNew } from "../../packages/render-core/src/spine/log.ts";
import { asClientId, asExhibitId, asLibraryId, asObjectId } from "../../packages/render-core/src/wadm/brand.ts";
import type { AnnotationLog } from "../../packages/render-core/src/wadm/types.ts";
import { sliceToDziAuto } from "../../apps/studio/src/dzi-slice-pool.ts";
import { sliceToDzi } from "../../apps/studio/src/dzi-slicer.ts";
import { DZI_TILE_SIZE, DZI_OVERLAP } from "../../packages/render-core/src/geometry/dzi.ts";

const out = document.querySelector("#out")!;
const say = (s: string) => { out.textContent += s + "\n"; console.log(s); };

const alice = asClientId("alice");
const TILE_MIN_EDGE = 4096; // publish-flows.svelte.ts:134

/** A real JPEG of the given size — noise + gradient, so encode does representative work. */
async function makeJpeg(w: number, h: number): Promise<Blob> {
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#2a4"); g.addColorStop(1, "#83b");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // Noise on a coarse grid — cheap to draw, still defeats a trivially-compressible flat fill.
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgb(${(i * 37) % 255},${(i * 91) % 255},${(i * 13) % 255})`;
    ctx.fillRect((i * 131) % w, (i * 17) % h, 24, 24);
  }
  return await c.convertToBlob({ type: "image/jpeg", quality: 0.85 });
}

function makeLibrary(objectCount: number, exhibits: number) {
  const logs: Record<string, AnnotationLog> = {};
  const perEx = Math.ceil(objectCount / exhibits);
  const exs = [];
  for (let e = 0; e < exhibits; e++) {
    const objects = [];
    let log: AnnotationLog = [];
    for (let o = 0; o < perEx && e * perEx + o < objectCount; o++) {
      const name = `img_${e}_${o}.jpg`;
      objects.push({ id: asObjectId(`o${e}_${o}`), source: `/assets/${name}`, label: `Folio ${o}`, width: 5000, height: 3800 });
      for (let n = 0; n < 5; n++) {
        log = appendNew(log, { target: `/assets/${name}`, body: { type: "TextualBody", value: `Note ${n} on folio ${o}. `.repeat(4) }, lastEditor: alice, modifiedAt: `t${n}`, now: n + 1 }).log;
      }
    }
    logs[`ex${e}`] = log;
    exs.push({
      id: asExhibitId(`ex${e}`), slug: `ex${e}`, title: `Exhibit ${e}`, objects,
      sections: Array.from({ length: 3 }, (_, s) => ({ id: `s${e}_${s}`, title: `Section ${s}`, prose: "Narrative prose. ".repeat(30) })),
    });
  }
  return { library: { id: asLibraryId("lib"), title: "Bench", exhibits: exs } as never, getLog: (id: string): AnnotationLog => logs[id] ?? [] };
}

async function freshOpfs(): Promise<Filesystem> {
  const root = await navigator.storage.getDirectory();
  for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) {
    await root.removeEntry(name, { recursive: true }).catch(() => {});
  }
  return new FsaFilesystem(root);
}

type Mode = "off" | "serial" | "inline" | "pooled";

async function run(label: string, make: () => Promise<Filesystem>, objectCount: number, exhibits: number, mode: Mode, master: Blob, baselineOff: number | null = null) {
  const { library, getLog } = makeLibrary(objectCount, exhibits);
  const fs = await make();
  let tileCalls = 0;

  // Transcribed from publish-flows.svelte.ts:135-175 — decode for dimensions, release, gate, slice.
  const tileObject = async (_slug: string, name: string, _bytes: ArrayBuffer | Blob) => {
    if (mode === "off") return null;
    tileCalls++;
    const bmp = await createImageBitmap(master);
    const { width, height } = bmp;
    bmp.close();
    if (Math.max(width, height) <= TILE_MIN_EDGE) return null;
    let r;
    if (mode === "pooled") r = await sliceToDziAuto(master, width, height, `${name}_files`, "image/jpeg");
    else {
      const b = await createImageBitmap(master);
      try {
        // mode "serial" reproduces the PRE-CHANGE slicer exactly (encodeConcurrency = 1).
        r = await sliceToDzi(b, `${name}_files`, "image/jpeg", DZI_TILE_SIZE, DZI_OVERLAP, 0.82, mode === "serial" ? 1 : undefined);
      } finally { b.close(); }
    }
    return r;
  };

  const t = performance.now();
  await publishLibrary(fs, library, getLog, {
    baseUrl: "https://u.gh.io/lib/",
    getAsset: async () => master,
    getThumbnail: async () => null,
    tileObject,
  } as never);
  const total = performance.now() - t;
  if ("finish" in fs) await (fs as ZipStreamFilesystem).finish();
  // Tiling's share is the DIFFERENCE against the same publish with tiling off. Summing per-call
  // elapsed times would be wrong by a lot: objects tile CONCURRENTLY (Promise.all per exhibit inside
  // a mapLimit across exhibits), so those intervals overlap and sum to more than the wall clock —
  // the first version of this bench reported "tiling 883% of total", which is how that was caught.
  const attributable = baselineOff === null ? null : total - baselineOff;
  const pct = attributable === null ? "  —" : `${(100 * attributable / total).toFixed(0)}%`;
  say(`  ${label.padEnd(14)} ${mode.padEnd(7)} total ${total.toFixed(0).padStart(7)} ms   tiling(by difference) ${attributable === null ? "     —" : attributable.toFixed(0).padStart(6)} ms ${pct.padStart(5)}   [${tileCalls} tiled]`);
  return { total, attributable, tileCalls };
}

function nullSink() {
  return { write: async () => {}, close: async () => {} };
}

async function main() {
  const results: Record<string, unknown> = {};
  // 5000x3800 — inside MAX_MASTER_DIM (6000) and over TILE_MIN_EDGE (4096), i.e. the band an
  // IMPORTED asset can actually occupy. This is the realistic worst case, not an 8000px synthetic.
  say("building a 5000x3800 master…");
  const master = await makeJpeg(5000, 3800);
  say(`master: ${(master.size / 1e6).toFixed(1)} MB\n`);

  for (const [objects, exhibits] of [[10, 2], [70, 10]] as const) {
    say(`── ${objects} objects across ${exhibits} exhibits, every one tileable (worst case) ──`);
    const opfsOff = await run("opfs", freshOpfs, objects, exhibits, "off", master);
    results[`opfs|${objects}|off`] = opfsOff;
    for (const mode of ["serial", "inline", "pooled"] as Mode[]) {
      results[`opfs|${objects}|${mode}`] = await run("opfs", freshOpfs, objects, exhibits, mode, master, opfsOff.total);
    }
    const zipMake = async () => new ZipStreamFilesystem(nullSink());
    const zipOff = await run("zip-stream", zipMake, objects, exhibits, "off", master);
    results[`zip|${objects}|off`] = zipOff;
    for (const mode of ["serial", "pooled"] as Mode[]) {
      results[`zip|${objects}|${mode}`] = await run("zip-stream", zipMake, objects, exhibits, mode, master, zipOff.total);
    }
    say("");
  }

  (window as unknown as { __BENCH__: unknown }).__BENCH__ = results;
}

main().catch((e) => {
  say(`ERROR: ${e?.stack ?? e}`);
  (window as unknown as { __BENCH__: unknown }).__BENCH__ = { error: String(e) };
});
