// Archie-027c — the BROWSER half of the export-fidelity harness. Driven by scripts/export-fidelity.mjs.
//
// PRINCIPLE (freecut, `Prior Art/freecut/headless/README.md:6-12`): "Because the engine depends on
// browser APIs …, a Node port would be a fragile rewrite. Instead, a tiny Node driver launches
// headless Chrome, loads a UI-less harness page (`window.freecut`) that reuses the exact export
// pipeline … and captures the output." Archie's publish is the same shape — OPFS, OffscreenCanvas,
// module Workers — so this file is Archie's `src/headless/main.ts`: it runs the REAL
// `publishLibrary` with the REAL app-side callbacks and hands the produced bytes to the driver,
// which is where every assertion lives. `docs/research/freecut-gaps.md:120-146` is the mapping.
//
// What is real here, and what is a fixture:
//   REAL — publishLibrary (packages/render-core/src/publish/site.ts), the OPFS backend
//          (FsaFilesystem over navigator.storage), the ZipFilesystem export leg, the DZI worker
//          pool (apps/studio/src/dzi-slice-pool.ts) and the bake worker pool
//          (apps/studio/src/bake-async.ts). tileObject is transcribed from the app's own wiring at
//          apps/studio/src/publish-flows.svelte.ts:210-238 (that file carries embedded NUL bytes —
//          read it with `grep -a` / `tr -d '\000'`, plain grep reports zero matches).
//   FIXTURE — the library itself (makeLibrary below), so the run is self-contained and needs no
//          seeded OPFS store.
//
// This file ASSERTS NOTHING. It reports evidence and streams bytes out through `__emitFile`. Keeping
// the verdicts in Node is deliberate: an assertion that lives inside the thing it measures can be
// skipped by the same failure that broke the thing.
import { publishLibrary } from "../packages/render-core/src/publish/site.ts";
import { FsaFilesystem } from "../packages/render-core/src/fs/fsa.ts";
import { ZipFilesystem } from "../packages/render-core/src/fs/zip.ts";
import type { Filesystem, FsDirectory } from "../packages/render-core/src/fs/seam.ts";
import { canvasIdFor } from "../packages/render-core/src/iiif/canvasid.ts";
import { WORKING_IRI_BASE } from "../packages/render-core/src/publish/working.ts";
import { appendNew } from "../packages/render-core/src/spine/log.ts";
import { asClientId, asExhibitId, asLibraryId, asObjectId } from "../packages/render-core/src/wadm/brand.ts";
import type { AnnotationLog } from "../packages/render-core/src/wadm/types.ts";
import { sliceToDziAuto } from "../apps/studio/src/dzi-slice-pool.ts";
import { bakeThumbnailAsync, bakeFallbackCount } from "../apps/studio/src/bake-async.ts";

// ── worker evidence ──────────────────────────────────────────────────────────────────────────────
// Both worker call sites degrade SILENTLY (.claude/rules/perf-measure-the-flow.md §2): a broken
// worker path yields a slower but entirely healthy-looking publish. `bakeFallbackCount()` is the
// witness bake-async already ships; the DZI pool has none, so this counts Worker CONSTRUCTIONS
// directly (positive evidence — "no fallback warning" is an absence, and an absence is also what a
// path that never ran produces).
let workerCtorCount = 0;
const RealWorker = globalThis.Worker;
class CountingWorker extends RealWorker {
  constructor(url: string | URL, opts?: WorkerOptions) {
    super(url, opts);
    workerCtorCount++;
  }
}
(globalThis as unknown as { Worker: typeof Worker }).Worker = CountingWorker as unknown as typeof Worker;

const fallbackWarnings: string[] = [];
const realWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  const text = args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ");
  if (/worker pool failed|falling back/i.test(text)) fallbackWarnings.push(text.slice(0, 200));
  realWarn(...args);
};

// ── the driver's byte sink ───────────────────────────────────────────────────────────────────────
declare function __emitFile(path: string, b64: string): Promise<void>;

function toBase64(bytes: Uint8Array): string {
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

async function sha256(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = bytes instanceof Uint8Array ? bytes.slice().buffer : bytes;
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", buf as ArrayBuffer));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── write-order recorder ─────────────────────────────────────────────────────────────────────────
// ADR-0020 / render-core-data-integrity rule 1: content first, `archie.json` LAST is the commit
// point. That is an ordering claim about WRITES, so the only place it can be observed is the
// Filesystem seam — a finished tree looks identical whichever order it was written in. Recorded on
// `close()`, i.e. when a write COMMITS, not when it is opened.
function recordingFilesystem(inner: Filesystem, order: string[]): Filesystem {
  const wrapDir = (d: FsDirectory, prefix: string): FsDirectory => ({
    async getDirectory(name, opts) {
      return wrapDir(await d.getDirectory(name, opts), `${prefix}${name}/`);
    },
    async getFile(name, opts) {
      const f = await d.getFile(name, opts);
      const path = `${prefix}${name}`;
      return {
        readable: () => f.readable(),
        getFile: () => f.getFile(),
        size: () => f.size(),
        async writable() {
          const w = await f.writable();
          return {
            write: (data) => w.write(data),
            async close() {
              await w.close();
              order.push(path);
            },
          };
        },
      };
    },
    remove: (name) => d.remove(name),
    entries: () => d.entries(),
  });
  return { async root() { return wrapDir(await inner.root(), ""); } };
}

// ── fixture ──────────────────────────────────────────────────────────────────────────────────────
const alice = asClientId("alice");
const TILE_MIN_EDGE = 4096; // publish-flows.svelte.ts:210
const NOTES_PER_OBJECT = 3;

/** A real JPEG — gradient + coarse noise, so the encode does representative work and the bytes are
 *  not trivially compressible (same construction as scripts/perf/publishbench.ts:32-44). */
async function makeJpeg(w: number, h: number, seed: number): Promise<Blob> {
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#2a4");
  g.addColorStop(1, "#83b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 2000; i++) {
    const k = i * seed;
    ctx.fillStyle = `rgb(${(k * 37) % 255},${(k * 91) % 255},${(k * 13) % 255})`;
    ctx.fillRect((k * 131) % w, (k * 17) % h, 24, 24);
  }
  return await c.convertToBlob({ type: "image/jpeg", quality: 0.85 });
}

interface Plate {
  slug: string;
  name: string;
  objId: string;
  width: number;
  height: number;
  blob: Blob;
}

async function makeFixture() {
  // ONE object over TILE_MIN_EDGE (so the DZI worker pool actually runs) plus two small ones across
  // two exhibits (so the manifest sweep has more than one tree to walk). Deliberately small: this is
  // a fidelity gate, not a perf bench — publishrun.mjs owns the 70-object end-to-end number.
  const specs: Array<[string, string, number, number]> = [
    ["ex0", "plate-a.jpg", 4200, 3400],
    ["ex0", "plate-b.jpg", 900, 700],
    ["ex1", "plate-c.jpg", 900, 700],
  ];
  const plates: Plate[] = [];
  for (const [slug, name, w, h] of specs) {
    plates.push({ slug, name, objId: `o-${name.replace(/\W/g, "-")}`, width: w, height: h, blob: await makeJpeg(w, h, plates.length + 1) });
  }

  const logs: Record<string, AnnotationLog> = {};
  const bySlug = new Map<string, Plate[]>();
  for (const p of plates) bySlug.set(p.slug, [...(bySlug.get(p.slug) ?? []), p]);

  const exhibits = [...bySlug].map(([slug, ps]) => {
    let log: AnnotationLog = [];
    for (const p of ps) {
      for (let n = 0; n < NOTES_PER_OBJECT; n++) {
        // Authored against the WORKING base, exactly as Studio does — publishing to a different base
        // then exercises `rebaseCanvasId` (iiif/canvasid.ts:42), the seam whose absence once shipped
        // a library with 182 history records and ZERO inline annotations on 21 canvases.
        //
        // MEASURED, and the reason this fixture is not simpler: `publishLibrary` groups heads by
        // EXACT canvas-IRI equality (site.ts:828 `targetSource(h) === canvasId`). A first draft
        // targeted `/assets/plate-a.jpg#xywh=…` — the ASSET path, not the canvas IRI — and every
        // published AnnotationPage came out `items: []`: 9 authored, 0 published, history sidecars
        // all present, publish reporting success, and `verify-publish.mjs` green (its heads check is
        // a `check(true, …)` report line, so a zero is a PASS there). Only an in-vs-out COUNT sees it.
        log = appendNew(log, {
          target: { type: "SpecificResource" as const, source: canvasIdFor(WORKING_IRI_BASE, slug, p.objId), selector: { type: "FragmentSelector" as const, conformsTo: "http://www.w3.org/TR/media-frags/", value: `xywh=pixel:${10 + n},10,100,100` } },
          body: { type: "TextualBody", value: `Note ${n} on ${p.name}.` },
          lastEditor: alice,
          modifiedAt: `t${n}`,
          now: n + 1,
        }).log;
      }
    }
    logs[slug] = log;
    return {
      id: asExhibitId(slug),
      slug,
      title: `Exhibit ${slug}`,
      objects: ps.map((p) => ({
        id: asObjectId(p.objId),
        source: `/assets/${p.name}`,
        thumbnail: `/assets/${p.name}`,
        label: p.name,
        width: p.width,
        height: p.height,
      })),
      sections: [{ id: `${slug}-s0`, title: "Section 0", prose: "Narrative prose. ".repeat(10) }],
    };
  });

  const library = { id: asLibraryId("fidelity-lib"), title: "Export fidelity fixture", exhibits } as never;
  const getLog = (id: string): AnnotationLog => logs[id] ?? [];
  const totalHeads = plates.length * NOTES_PER_OBJECT;
  return { library, getLog, plates, totalHeads };
}

async function freshOpfs(): Promise<Filesystem> {
  const root = await navigator.storage.getDirectory();
  for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) {
    await root.removeEntry(name, { recursive: true }).catch(() => {});
  }
  return new FsaFilesystem(root);
}

// ── the publish options, transcribed from the app ────────────────────────────────────────────────
function publishOptions(plates: Plate[], baseUrl: string) {
  const find = (slug: string, name: string) => plates.find((p) => p.slug === slug && p.name === name) ?? null;
  return {
    baseUrl,
    getAsset: async (slug: string, name: string) => find(slug, name)?.blob ?? null,
    // Real bake worker pool. bakeThumbnailAsync counts its own silent fallbacks (bakeFallbackCount).
    getThumbnail: async (slug: string, name: string) => {
      const p = find(slug, name);
      return p ? await bakeThumbnailAsync(p.blob, 640, "image/jpeg") : null;
    },
    // publish-flows.svelte.ts:211-238, with the same degrade-to-null-on-undecodable posture.
    tileObject: async (_slug: string, name: string, bytes: ArrayBuffer | Blob) => {
      let bmp: ImageBitmap;
      let blob: Blob;
      let mime = "image/jpeg";
      try {
        const src = bytes instanceof Blob ? bytes : new Blob([bytes]);
        blob = new Blob([await src.arrayBuffer()], src.type ? { type: src.type } : {});
        if (blob.type) mime = blob.type;
        bmp = await createImageBitmap(blob);
      } catch {
        return null;
      }
      const { width, height } = bmp;
      bmp.close();
      if (Math.max(width, height) <= TILE_MIN_EDGE) return null;
      return await sliceToDziAuto(blob, width, height, `${name}_files`, mime);
    },
  } as never;
}

async function emitTree(dir: FsDirectory, prefix: string, seen: string[]): Promise<void> {
  const kids: Array<{ name: string; kind: "file" | "directory" }> = [];
  for await (const e of dir.entries()) kids.push(e);
  for (const e of kids) {
    if (e.kind === "directory") {
      await emitTree(await dir.getDirectory(e.name), `${prefix}${e.name}/`, seen);
    } else {
      const buf = await (await dir.getFile(e.name)).readable();
      const path = `${prefix}${e.name}`;
      await __emitFile(`tree/${path}`, toBase64(new Uint8Array(buf)));
      seen.push(path);
    }
  }
}

const BASE_URL = "https://fidelity.example/lib/";

const step = (s: string) => { console.log(`[harness] ${s}`); document.querySelector("#out")!.textContent += `\n${s}`; };

async function run() {
  const t0 = performance.now();
  step("building fixture");
  const { library, getLog, plates, totalHeads } = await makeFixture();

  // Leg 1 — the PUBLISHED TREE, into real OPFS through the write-order recorder.
  const writeOrder: string[] = [];
  step("publishing → OPFS tree");
  const opfs = await freshOpfs();
  const tileCallsSeen: string[] = [];
  const opts = publishOptions(plates, BASE_URL) as Record<string, unknown>;
  const wrappedTile = opts.tileObject as (s: string, n: string, b: ArrayBuffer | Blob) => Promise<unknown>;
  opts.tileObject = async (s: string, n: string, b: ArrayBuffer | Blob) => {
    const r = await wrappedTile(s, n, b);
    if (r) tileCallsSeen.push(`${s}/${n}`);
    return r;
  };
  await publishLibrary(recordingFilesystem(opfs, writeOrder), library, getLog, opts as never);

  step(`tree published (${writeOrder.length} writes); emitting bytes`);
  const emitted: string[] = [];
  await emitTree(await opfs.root(), "", emitted);

  // Leg 2 — the .archie.zip export surface, same library, same options (publish-flows.svelte.ts:507
  // publishes the zip through the identical option bag). Byte-for-byte agreement between the two is
  // the check that the export surfaces have not drifted.
  step(`emitted ${emitted.length} files; publishing → .archie.zip`);
  const zipFs = new ZipFilesystem();
  await publishLibrary(zipFs, library, getLog, publishOptions(plates, BASE_URL));
  const zipBytes = zipFs.toZip();
  await __emitFile("library.archie.zip", toBase64(zipBytes));

  step(`zip built (${zipBytes.length} bytes); hashing inputs`);
  const authoredAssets = [];
  for (const p of plates) {
    authoredAssets.push({ slug: p.slug, name: p.name, objId: p.objId, bytes: p.blob.size, sha256: await sha256(await p.blob.arrayBuffer()) });
  }

  return {
    baseUrl: BASE_URL,
    elapsedMs: Math.round(performance.now() - t0),
    writeOrder,
    treeFiles: emitted,
    zipBytes: zipBytes.length,
    workers: {
      poolAvailable: typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined",
      workerCtorCount,
      bakeFallbacks: bakeFallbackCount(),
      fallbackWarnings,
    },
    authored: {
      annotationHeads: totalHeads,
      notesPerObject: NOTES_PER_OBJECT,
      assets: authoredAssets,
      tiledObjects: tileCallsSeen,
    },
  };
}

(window as unknown as { __ARCHIE_FIDELITY__: unknown }).__ARCHIE_FIDELITY__ = {
  run: () => run().then((r) => ({ ok: true, report: r }), (e) => ({ ok: false, error: String(e?.stack ?? e) })),
};
document.querySelector("#out")!.textContent = "harness ready";
