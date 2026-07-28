// INGEST 1,000 masters (Archie-c74e step 2), in real Chromium, into a real folder working store.
//
// WHAT IS REAL HERE AND WHAT IS TRANSCRIBED — stated up front, because the ticket's value is entirely
// in which claim each number supports.
//
// REAL (the shipped modules, imported, not reimplemented):
//   `bake-async.ts`      — `downscaleIfNeededAsync` / `bakeThumbnailAsync`, the worker pool with its
//                          DOM-canvas fallback and `bakeFallbackCount()`.
//   `tiff-transcode.ts`  — the UTIF decode + WebP re-encode, the path that exists because 375 real
//                          files died in `createImageBitmap` on a real museum import.
//   `folder-import.ts`   — `inferredMime` / `isImportableMedia` / `folderNameFrom`, the classification
//                          that decides what a `.tif` is and which folder becomes which exhibit.
//   `session/session.ts` — `AnnotationSession`, minting the notes.
//
// TRANSCRIBED (≈60 lines, from `apps/studio/src/ingest-flows.ts:445-566`, cited inline):
//   the per-file decision ladder — AV / non-image refusal / TIFF / EXIF / plain downscale — and the
//   reference-after-bytes write order. It is transcribed rather than imported because `addObjectFromFile`
//   is reachable only through `createIngestFlows(ctx: IngestContext)`, and `IngestContext` is 40+
//   members of App.svelte's reactive scope (a `LibraryStore`, an `AnnotationSession`, `$state` setters).
//   `scripts/perf/publishbench.ts:84` transcribes `tileObject` for exactly this reason and says so.
//
// NOT PROVEN BY THIS SCRIPT, and it is a real gap rather than a formality: nobody dragged a
// 1,000-file folder onto the running Studio. The serial loop shape, the per-file work, and the byte
// writes are the shipped ones; the `<input webkitdirectory>` pick, `createImportRunTracker`'s
// progress arbitration, and the Svelte re-render storm that a 1,000-object `library.json` provokes
// are NOT exercised here. `thousand-ui.mjs` attacks that half separately.
import { downscaleIfNeededAsync, bakeThumbnailAsync, bakeFallbackCount } from "../../apps/studio/src/bake-async.ts";
import { transcodeTiff, isTiffMime } from "../../apps/studio/src/tiff-transcode.ts";
import { inferredMime, isImportableMedia } from "../../apps/studio/src/folder-import.ts";
import { AnnotationSession } from "../../packages/render-core/src/session/session.ts";
import { asClientId } from "../../packages/render-core/src/wadm/brand.ts";
import { SinkFilesystem } from "./sink-fs.ts";

const out = document.querySelector("#out")!;
const say = (s: string) => { out.textContent += s + "\n"; console.log(s); };

const params = new URLSearchParams(location.search);
const CORPUS = params.get("corpus")!;     // sink base for the source folder
const WORK = params.get("work")!;         // sink base for the working store
const N = Number(params.get("n") ?? "1000");
const EXHIBITS = Number(params.get("exhibits") ?? "20");
const BASE_URL = params.get("base")!;     // the deploy base; targets are authored AT it (see notes)

// ingest-flows.ts:42-43 — the two constants the bake ladder is parameterised by.
const MAX_MASTER_DIM = 6000; // geometry/downscale.ts:8
const THUMB_DIM = 640;
const ASSET_PREFIX = "/assets/";
const ASSET_THUMB_PREFIX = "/assets-thumb/";

interface CorpusEntry { name: string; w: number; h: number; bytes: number; src: string; kind: "jpeg" | "tiff" }

/** A ULID-shaped, DETERMINISTIC object id.
 *
 *  The shipped `mintObjectId` is a real ULID with a `Math.random` suffix. This run wants the SAME
 *  library from the same corpus on a re-run — otherwise a re-publish is not comparable with the one
 *  before it, and the incremental-push arithmetic this ticket has to report would be measuring id
 *  churn rather than content. Deterministic ids are a harness property, stated here rather than
 *  hidden; note ids are NOT deterministic (see `AnnotationSession` below), which is why nothing in
 *  this run keys on note order (.claude/rules/a-green-run-is-one-sample.md). */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function objectIdFor(i: number): string {
  let s = "";
  let v = 0x1c74e000 + i * 7919;
  for (let k = 0; k < 26; k++) { s = CROCKFORD[v % 32]! + s; v = Math.floor(v / 32) + (k * 31 + i) % 97; }
  return s;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const gb = (n: number) => `${(n / 1e9).toFixed(2)} GB`;

async function main() {
  const corpusFs = new SinkFilesystem(CORPUS);
  const workFs = new SinkFilesystem(WORK);

  const manifest: CorpusEntry[] = await (await fetch(`${CORPUS}/r/_manifest.json`)).json();
  const files = manifest.slice(0, N);
  say(`corpus: ${files.length} files, ${gb(files.reduce((n, f) => n + f.bytes, 0))}`);

  // Exhibit assignment: contiguous runs, the shape a folder-of-folders import produces
  // (`folder-import.ts` groups by first path segment).
  const perEx = Math.ceil(files.length / EXHIBITS);
  const slugOf = (i: number) => `series-${String(Math.floor(i / perEx) + 1).padStart(2, "0")}`;

  type Obj = { id: string; source: string; label: string; width?: number; height?: number; thumbnail?: string; format?: string };
  const objectsBySlug = new Map<string, Obj[]>();
  const refusals: { name: string; reason: string }[] = [];

  const phase = { read: 0, decode: 0, thumb: 0, write: 0 };
  let masterBytes = 0, thumbBytes = 0, tiffCount = 0, thumbSkipped = 0;
  const perFileMs: number[] = [];
  const t0 = performance.now();

  const workRoot = await workFs.root();

  // SERIAL, deliberately. `ingest-flows.ts#addFiles` is a strictly serial `for` loop and it is serial
  // ON PURPOSE (a terminal storage refusal `break`s, assuming every later write is doomed; the
  // progress tick reports a sequential index). `scripts/perf/ingestbench.ts:1-7` records that a prior
  // sweep reported a 7.9x that did not exist because it benchmarked 24 concurrent bakes against a
  // caller that has none. So this measures the shape the caller HAS.
  for (let i = 0; i < files.length; i++) {
    const entry = files[i]!;
    const fileStart = performance.now();
    const slug = slugOf(i);
    const id = objectIdFor(i);
    const safe = entry.name.replace(/[^a-zA-Z0-9._-]/g, "_");

    // The real classification: what does the importer think this file IS?
    const mime = inferredMime({ name: entry.name, relativePath: `${slug}/${entry.name}`, type: "" });
    if (!isImportableMedia({ name: entry.name, relativePath: `${slug}/${entry.name}`, type: mime })) {
      refusals.push({ name: entry.name, reason: "not-importable" }); continue;
    }

    // READ (ingest-flows.ts:481 — its own phase and its own refusal reason: a file chosen minutes ago
    // can be gone by the time a 1,000-file batch reaches it).
    let bytes: ArrayBuffer;
    const tRead = performance.now();
    try {
      bytes = await (await corpusFs.root()).getFile(entry.name).then((f) => f.readable());
    } catch { refusals.push({ name: entry.name, reason: "unreadable" }); continue; }
    phase.read += performance.now() - tRead;
    const file = new File([bytes], entry.name, { type: mime });

    // DECODE PHASE (ingest-flows.ts:495-535). Same ladder, same order.
    let master: Blob, masterMime: string, name: string, dims: { w: number; h: number };
    const tDec = performance.now();
    try {
      if (isTiffMime(mime)) {
        const t = await transcodeTiff(bytes, MAX_MASTER_DIM);
        master = t.blob; masterMime = "image/webp"; dims = { w: t.width, h: t.height };
        name = `${id}-${safe.replace(/\.[^.]+$/, "")}.webp`;
        tiffCount++;
      } else {
        // No EXIF rotation: a canvas-encoded JPEG carries no orientation tag, so this corpus takes the
        // plain path — the EXIF branch (upright PNG master + preserved original) is NOT exercised, and
        // that is on the not-proven list rather than implied by a green run.
        const prepared = await downscaleIfNeededAsync(file, MAX_MASTER_DIM, mime);
        master = prepared.blob; masterMime = mime; dims = { w: prepared.width, h: prepared.height };
        name = `${id}-${safe}`;
      }
    } catch (e) {
      console.warn(`[ingest] could not decode ${entry.name}`, e);
      refusals.push({ name: entry.name, reason: "undecodable" }); continue;
    }
    phase.decode += performance.now() - tDec;

    // WRITE master BEFORE the object exists (reference-after-bytes, ingest-flows.ts:538): library.json
    // must never reference bytes that did not land.
    const tW = performance.now();
    const exDir = await workRoot.getDirectory(slug);
    const w = await (await (await exDir.getDirectory("assets")).getFile(name, { create: true })).writable();
    await w.write(master); await w.close();
    masterBytes += master.size;
    phase.write += performance.now() - tW;

    // THUMBNAIL — a pure optimisation; a failure must never block an import (ingest-flows.ts:547-558).
    let thumbnail: string | undefined;
    const tT = performance.now();
    try {
      const thumb = await bakeThumbnailAsync(master, THUMB_DIM, masterMime);
      if (thumb) {
        const tw = await (await (await exDir.getDirectory("assets-thumb")).getFile(name, { create: true })).writable();
        await tw.write(thumb); await tw.close();
        thumbnail = `${ASSET_THUMB_PREFIX}${name}`;
        thumbBytes += thumb.size;
      } else thumbSkipped++;
    } catch (e) { console.warn(`[ingest] thumbnail skipped for ${name}`, e); thumbSkipped++; }
    phase.thumb += performance.now() - tT;

    const list = objectsBySlug.get(slug) ?? [];
    list.push({
      id, source: `${ASSET_PREFIX}${name}`, label: entry.name.replace(/\.[^.]+$/, ""),
      width: dims.w, height: dims.h, format: masterMime, ...(thumbnail ? { thumbnail } : {}),
    });
    objectsBySlug.set(slug, list);

    perFileMs.push(performance.now() - fileStart);
    if ((i + 1) % 50 === 0) {
      const el = (performance.now() - t0) / 1000;
      say(`  ${i + 1}/${files.length}  ${el.toFixed(0)}s  ${((i + 1) / el).toFixed(2)} files/s  · master ${gb(masterBytes)} · refused ${refusals.length}`);
      // Yield to the event loop so the page is not wedged — the real app is a live UI during this.
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const ingestSec = (performance.now() - t0) / 1000;

  // ── the library ────────────────────────────────────────────────────────────────────────────────
  const exhibits = [...objectsBySlug.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([slug, objects], k) => ({
    id: `ex-${slug}`, slug, title: `Series ${k + 1}`, objects,
    sections: [{ id: `${slug}-s1`, title: "Overview", prose: `Series ${k + 1} — ${objects.length} plates from the acceptance corpus.` }],
  }));
  const library = { id: "lib-thousand", title: "Thousand-image acceptance library", exhibits };

  // ── annotations (step 3) ───────────────────────────────────────────────────────────────────────
  // ~50 notes across ~20 objects, through the REAL `AnnotationSession`.
  //
  // Targets are authored AT the deploy base. `site.ts:820` derives `canvasId` as
  // `${baseUrl}${slug}/canvas/${obj.id}` and keeps only heads whose `targetSource` equals it; authoring
  // at the same base means the match is exact and no `rebaseCanvasId` re-minting is in play. Rebasing
  // is real behaviour and is NOT exercised here — stated, not implied.
  //
  // Selectors are `xywh=pixel:` in the AUTHORED (archival) pixel space, which is what makes the web
  // tier's selector rescale (Archie-4b0a) measurable at all: the web publish serves a 2400 px master,
  // so a correct tree must carry these coordinates multiplied by the served/authored factor.
  const alice = asClientId("acceptance-runner");
  const logs: Record<string, unknown[]> = {};
  const annotated: { slug: string; objectId: string; width: number; height: number; xywh: [number, number, number, number] }[] = [];
  const NOTE_OBJECTS = 20, NOTES = 50;
  // Spread the annotated objects across exhibits by STRIDE, so more than one exhibit carries notes.
  const flat = exhibits.flatMap((ex) => ex.objects.map((o) => ({ slug: ex.slug, exId: ex.id, o })));
  const stride = Math.max(1, Math.floor(flat.length / NOTE_OBJECTS));
  const sessions = new Map<string, AnnotationSession>();
  for (let k = 0; k < NOTE_OBJECTS; k++) {
    const pick = flat[k * stride]!;
    const canvasId = `${BASE_URL}${pick.slug}/canvas/${pick.o.id}`;
    const s = sessions.get(pick.exId) ?? new AnnotationSession(alice);
    sessions.set(pick.exId, s);
    // Deterministic geometry keyed to the object's OWN dimensions — a fixed pixel box would fall
    // outside a 2000 px plate and inside a 6000 px one, which is a different test per object.
    const W = pick.o.width!, H = pick.o.height!;
    const perObject = Math.floor(NOTES / NOTE_OBJECTS) + (k < NOTES % NOTE_OBJECTS ? 1 : 0);
    for (let j = 0; j < perObject; j++) {
      const x = Math.round(W * (0.1 + 0.15 * j)), y = Math.round(H * (0.12 + 0.15 * j));
      const w2 = Math.round(W * 0.2), h2 = Math.round(H * 0.18);
      s.createNote({
        target: { source: canvasId, selector: { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: `xywh=pixel:${x},${y},${w2},${h2}` } },
        body: { type: "TextualBody", format: "text/markdown", value: `Acceptance note ${k}.${j} on ${pick.o.label}. Marginal annotation in the hand of the scribe.` },
      } as never);
      if (j === 0) annotated.push({ slug: pick.slug, objectId: pick.o.id, width: W, height: H, xywh: [x, y, w2, h2] });
    }
  }
  let noteCount = 0;
  for (const [exId, s] of sessions) { const e = s.entries as unknown as unknown[]; logs[exId] = e; noteCount += e.length; }

  // ── persist the working store ──────────────────────────────────────────────────────────────────
  const putJson = async (name: string, value: unknown) => {
    const wr = await (await workRoot.getFile(name, { create: true })).writable();
    await wr.write(JSON.stringify(value)); await wr.close();
  };
  await putJson("library.json", library);
  await putJson("annotations.json", logs);
  await putJson("annotated.json", annotated);

  const libBytes = JSON.stringify(library).length;
  say("");
  say(`ingest: ${fmt(files.length - refusals.length)}/${fmt(files.length)} objects in ${ingestSec.toFixed(0)}s (${(files.length / ingestSec).toFixed(2)} files/s)`);
  say(`  phases (serial, so these SUM to the wall clock): read ${(phase.read / 1000).toFixed(0)}s · decode+bake ${(phase.decode / 1000).toFixed(0)}s · thumb ${(phase.thumb / 1000).toFixed(0)}s · write ${(phase.write / 1000).toFixed(0)}s`);
  say(`  masters ${gb(masterBytes)} · thumbs ${gb(thumbBytes)} · tiff transcodes ${tiffCount} · thumb skipped ${thumbSkipped}`);
  say(`  worker-pool fallbacks: ${bakeFallbackCount()} (non-zero ⇒ the pool silently did not run)`);
  say(`  library.json ${fmt(libBytes)} bytes for ${fmt(files.length - refusals.length)} objects across ${exhibits.length} exhibits`);
  say(`  notes ${noteCount} across ${annotated.length} objects in ${sessions.size} exhibit log(s)`);
  if (refusals.length > 0) say(`  REFUSALS ${refusals.length}: ${JSON.stringify(refusals.slice(0, 10))}`);

  perFileMs.sort((a, b) => a - b);
  const pct = (p: number) => perFileMs[Math.min(perFileMs.length - 1, Math.floor(perFileMs.length * p))] ?? 0;

  (window as unknown as { __BENCH__: unknown }).__BENCH__ = {
    files: files.length, objects: files.length - refusals.length, exhibits: exhibits.length,
    ingestSec, filesPerSec: files.length / ingestSec,
    phaseSec: { read: phase.read / 1000, decode: phase.decode / 1000, thumb: phase.thumb / 1000, write: phase.write / 1000 },
    perFileMs: { p50: pct(0.5), p90: pct(0.9), p99: pct(0.99), max: perFileMs[perFileMs.length - 1] ?? 0 },
    masterBytes, thumbBytes, tiffCount, thumbSkipped, refusals,
    bakeFallbacks: bakeFallbackCount(),
    libraryJsonBytes: libBytes, noteCount, annotatedObjects: annotated.length,
    sinkWrites: workFs.stats.writes, sinkWriteMs: workFs.stats.writeMs, sinkWriteBytes: workFs.stats.writeBytes,
  };
}

main().catch((e) => {
  say(`ERROR: ${e?.stack ?? e}`);
  (window as unknown as { __BENCH__: unknown }).__BENCH__ = { error: String(e?.stack ?? e) };
});
