// PUBLISH the 1,000-object library at BOTH quality tiers, with fixity on, into real folders
// (Archie-c74e step 4), in real Chromium.
//
// REAL (imported, shipped):
//   `publish/site.ts#publishLibrary`   — the writer, including the fixity manifest and the selector
//                                        rescale seam.
//   `publish-tier.ts`                  — `projectLibraryForTier` / `applyTier` / `capsFor`, the tier
//                                        engine, carrying `archive-probe.ts`'s PINNED WEB_TIER
//                                        (2400 px, q0.80) rather than a local copy of those numbers.
//   `dzi-slice-pool.ts#sliceToDziAuto` — the process-wide worker pool with its inline fallback.
//   `bake-async.ts`                    — the WebP re-encode the web tier's `encodeImage` uses.
//
// TRANSCRIBED (~35 lines, from `apps/studio/src/publish-flows.svelte.ts`, cited inline):
//   `tileObject` (:195-225) and `tierRun` (:334-363). Both live in a `.svelte.ts` rune module that a
//   bare vite server cannot evaluate; `scripts/perf/publishbench.ts:84` transcribes the same
//   `tileObject` for the same reason and says so. The transcription is line-for-line, so a drift
//   between this harness and the app is a diff away from being visible.
import { publishLibrary } from "../../packages/render-core/src/publish/site.ts";
import { MemoryFilesystem } from "../../packages/render-core/src/fs/memory.ts";
import { sliceToDziAuto } from "../../apps/studio/src/dzi-slice-pool.ts";
import { bakeDisplayMasterAsync, bakeFallbackCount } from "../../apps/studio/src/bake-async.ts";
import {
  projectLibraryForTier, capsFor, applyTier, tierDecision, assetMime, selectorScaleOf,
  resetTierFallbacks, tierFallbackCount, tierFallbacksByReason,
  type TierEncoders, type QualityTier,
} from "../../apps/studio/src/publish-tier.ts";
import { SinkFilesystem } from "./sink-fs.ts";

const out = document.querySelector("#out")!;
const say = (s: string) => { out.textContent += s + "\n"; console.log(s); };

const params = new URLSearchParams(location.search);
const WORK = params.get("work")!;
const SINKS: Record<string, string> = JSON.parse(params.get("sinks")!); // tier -> sink base
const BASE_URL = params.get("base")!;
const TIERS = (params.get("tiers") ?? "archival,web").split(",") as QualityTier[];
/** Objects in the paired MemoryFilesystem control (0 = skip). See CONTROL below. */
const CONTROL_N = Number(params.get("control") ?? "50");
/** The control's OWN folder sink — never the tier sinks, or the control would write into the artifact
 *  this run is about to verify. */
const CONTROL_SINK = params.get("controlSink") ?? "";

declare global { interface Window { __VIEWER_FILES__?: string[] } }

const gb = (n: number) => `${(n / 1e9).toFixed(3)} GB`;
const fmt = (n: number) => n.toLocaleString("en-US");

// ── publish-flows.svelte.ts:195-225, transcribed ────────────────────────────────────────────────
const TILE_MIN_EDGE = 4096; // publish-flows.svelte.ts:195
const tileObject = async (_slug: string, name: string, bytes: ArrayBuffer | Blob) => {
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
};

// publish-flows.svelte.ts:311-315 — the web tier's WebP re-encode, reusing the ingest bake's
// process-wide worker pool rather than opening a second one.
const tierEncoders: TierEncoders = {
  encodeImage: async (src, maxDim, quality) => (await bakeDisplayMasterAsync(src, { maxDim, mime: "image/webp", quality })).blob,
};

async function main() {
  const workFs = new SinkFilesystem(WORK);
  const workRoot = await workFs.root();
  const readJson = async (name: string) => JSON.parse(new TextDecoder().decode(await (await workRoot.getFile(name)).readable()));

  const library = await readJson("library.json");
  const logs: Record<string, unknown[]> = await readJson("annotations.json");
  const objectCount = library.exhibits.reduce((n: number, e: { objects: unknown[] }) => n + e.objects.length, 0);
  say(`library: ${fmt(objectCount)} objects across ${library.exhibits.length} exhibits · ${fmt(Object.values(logs).reduce((n, l) => n + l.length, 0))} annotation records`);

  // The working store's byte readers — the harness analogue of `asset-store.ts`'s
  // `readAssetBlob` / `readThumbBytes`. `getOriginal` is deliberately absent: the corpus takes the
  // no-EXIF path, so nothing wrote `assets-original/`, and asking for bytes that were never stored
  // would publish dangling references.
  const readFrom = (dirName: string) => async (slug: string, name: string): Promise<Blob | null> => {
    try {
      const d = await (await workRoot.getDirectory(slug)).getDirectory(dirName);
      const f = await d.getFile(name);
      return new Blob([await f.readable()]);
    } catch { return null; }
  };
  const readAssetBlob = readFrom("assets");
  const readThumbBytes = readFrom("assets-thumb");

  // ── publish-flows.svelte.ts:334-363, transcribed ──────────────────────────────────────────────
  function tierRun(tier: QualityTier, lib: typeof library) {
    resetTierFallbacks();
    const caps = capsFor(tierEncoders);
    const proj = projectLibraryForTier(lib, tier, caps);
    const read = (source: (slug: string, name: string) => Promise<Blob | null>) => async (slug: string, published: string): Promise<Blob | null> => {
      const stored = proj.stored.get(slug)?.get(published) ?? published;
      const src = await source(slug, stored);
      if (!src || tier === "archival") return src;
      const srcMime = assetMime(stored, src.type || undefined);
      return (await applyTier(src, tierDecision(srcMime, tier, caps), tierEncoders, srcMime)).bytes;
    };
    const scales = new Map<string, ReturnType<typeof selectorScaleOf>>();
    for (const r of proj.rescaled) scales.set(`${r.slug} ${r.objectId}`, selectorScaleOf(r));
    const scaleSelectors = (slug: string, objectId: string) => scales.get(`${slug} ${objectId}`) ?? null;
    return { library: proj.library, rescaled: proj.rescaled, scaleSelectors, getAsset: read(readAssetBlob), getThumbnail: read(readThumbBytes) };
  }

  // The embed bundle, so the published tree carries its OWN viewer (Archie-e09d) — which is what
  // makes `scripts/drive-published-tree.mjs` able to drive the artifact at all.
  const viewerNames = window.__VIEWER_FILES__ ?? [];
  // `ViewerBundleFiles` is `ReadonlyMap<string, string | ArrayBuffer | Blob>` (site.ts:215) — and the
  // union is load-bearing rather than decorative. A `Uint8Array` here is accepted by every backend's
  // own `write` and then dies in `HashingFilesystem`'s (`fs/hashing.ts:170-173`), which normalises
  // exactly those three and calls `.arrayBuffer()` on anything else. So it fails ONLY when
  // `fixity: true`, only at the very last write of a publish, after the whole tree is already on
  // disk. Measured here as `TypeError: data.arrayBuffer is not a function`. Hand it a Blob.
  const getViewerBundle = async () => {
    const m = new Map<string, Blob>();
    for (const n of viewerNames) {
      const r = await fetch(`/viewer-dist/${n}`);
      if (!r.ok) throw new Error(`viewer bundle ${n}: ${r.status}`);
      m.set(n, await r.blob());
    }
    return m;
  };

  const results: Record<string, unknown> = {};

  for (const tier of TIERS) {
    const sinkBase = SINKS[tier]!;
    const fs = new SinkFilesystem(sinkBase);
    say(`\n── publish ${tier} → folder sink, fixity ON ──`);
    const run = tierRun(tier, library);
    const t = performance.now();
    const res = await publishLibrary(fs as never, run.library, (id: string) => (logs[id] ?? []) as never, {
      baseUrl: BASE_URL,
      getAsset: run.getAsset,
      getThumbnail: run.getThumbnail,
      scaleSelectors: run.scaleSelectors,
      tileObject,
      getViewerBundle,
      // Archie-039e. Attributed by DIFFERENCE below, not by summing per-file hash times — publish's
      // writes are concurrent (.claude/rules/perf-measure-the-flow.md).
      fixity: true,
      // A fixed timestamp keeps the pages byte-stable across a republish, which is what makes the
      // incremental-push delta arithmetic in this run mean anything (site.ts `publishedAt`).
      publishedAt: "2026-07-27T00:00:00.000Z",
    } as never);
    const sec = (performance.now() - t) / 1000;
    const r = res as { brokenLinks: unknown[]; incompleteCanvases: unknown[]; missingAssets: unknown[]; unscaledSelectors: unknown[]; fixity?: { path: string; sha256: string; bytes: number | null }[] };
    say(`  ${sec.toFixed(0)}s · sink writes ${fmt(fs.stats.writes)} · ${gb(fs.stats.writeBytes)} · PUT time ${(fs.stats.writeMs / 1000).toFixed(0)}s (summed over CONCURRENT writes — an upper bound, not a share)`);
    say(`  fixity entries ${fmt(r.fixity?.length ?? 0)} · rescaled ${fmt(run.rescaled.length)} · unscaled selectors ${r.unscaledSelectors.length} · tier fallbacks ${tierFallbackCount()} ${JSON.stringify(tierFallbacksByReason())}`);
    say(`  brokenLinks ${r.brokenLinks.length} · incompleteCanvases ${r.incompleteCanvases.length} · missingAssets ${r.missingAssets.length} · bake fallbacks ${bakeFallbackCount()}`);
    results[tier] = {
      sec, writes: fs.stats.writes, writeBytes: fs.stats.writeBytes, putMs: fs.stats.writeMs,
      fixityEntries: r.fixity?.length ?? 0,
      rescaled: run.rescaled.length,
      rescaleSample: run.rescaled.slice(0, 3),
      unscaledSelectors: r.unscaledSelectors.length,
      tierFallbacks: tierFallbackCount(), tierFallbacksByReason: tierFallbacksByReason(),
      brokenLinks: r.brokenLinks.length, incompleteCanvases: r.incompleteCanvases.length,
      missingAssets: r.missingAssets.length, bakeFallbacks: bakeFallbackCount(),
    };
  }

  // ── CONTROL: what does the loopback transport cost? ────────────────────────────────────────────
  // The tier numbers above are wall clock THROUGH an HTTP folder sink. `perf-measure-the-flow` says
  // attribute by DIFFERENCE against a run with the stage removed, so the same publish is run over the
  // first CONTROL_N objects twice — once into the sink, once into an in-page `MemoryFilesystem`. The
  // delta is the transport's whole share (framing, syscalls, the real disk), measured rather than
  // assumed. A subset, because a MemoryFilesystem cannot hold a 1,000-object archival pyramid.
  if (CONTROL_N > 0 && CONTROL_SINK) {
    const subsetLib = { ...library, exhibits: [{ ...library.exhibits[0], objects: library.exhibits[0].objects.slice(0, CONTROL_N) }] };
    const control: Record<string, number> = {};
    for (const [label, make] of [
      ["memory", () => new MemoryFilesystem()],
      ["folder", () => new SinkFilesystem(CONTROL_SINK)],
    ] as const) {
      const run = tierRun("archival", subsetLib);
      const t = performance.now();
      await publishLibrary(make() as never, run.library, (id: string) => (logs[id] ?? []) as never, {
        baseUrl: BASE_URL, getAsset: run.getAsset, getThumbnail: run.getThumbnail,
        scaleSelectors: run.scaleSelectors, tileObject, fixity: true, publishedAt: "2026-07-27T00:00:00.000Z",
      } as never);
      control[label] = (performance.now() - t) / 1000;
    }
    say(`\ncontrol (${CONTROL_N} objects, archival): memory ${control.memory!.toFixed(1)}s · folder ${control.folder!.toFixed(1)}s · transport by difference ${(control.folder! - control.memory!).toFixed(1)}s (${(100 * (control.folder! - control.memory!) / control.folder!).toFixed(0)}%)`);
    results.control = { n: CONTROL_N, ...control, transportSec: control.folder! - control.memory! };
  }

  (window as unknown as { __BENCH__: unknown }).__BENCH__ = results;
}

main().catch((e) => {
  say(`ERROR: ${e?.stack ?? e}`);
  (window as unknown as { __BENCH__: unknown }).__BENCH__ = { error: String(e?.stack ?? e) };
});
