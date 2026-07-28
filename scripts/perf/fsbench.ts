// Bench 2 — the PUBLISH WRITE path, not the encode path.
//
// The first sweep (PERF-image-pipeline-2026-07-24) made tiles fast to PRODUCE. This one asks what it
// costs to WRITE them. `publish/site.ts#writeTilePyramid` walks a 1033-tile Map with a serial
// `await getFile → writable → write → close` per tile — the same serial-await shape that was 19x in
// the slicer, on a backend where every one of those four steps is a real round trip.
//
// Backends measured are the REAL shipped classes (imported by path, not through the @render/core
// barrel — see render-core-shim.ts for why the barrel can't be loaded here):
//   • FsaFilesystem over OPFS  — the folder-publish sink (and what Tauri's path backend mirrors)
//   • ZipStreamFilesystem      — the streaming .archie.zip sink; commits are serialized internally
//                                through a `tail` chain, so this one is the interesting negative case
//   • MemoryFilesystem         — the floor: no I/O, isolates pure scheduling overhead
//
// writeSerial() below is a verbatim transcription of the shipped writeTilePyramid, so the baseline is
// the real thing and not a strawman.
//
// ── SECOND FLOW: the AUTOSAVE write path, against a REAL user folder (Archie-b5c2) ──────────────
//
// `?flow=autosave` runs a different measurement entirely, and `?folder=1` adds a fourth backend the
// default run cannot have: an `FsaFilesystem` over a directory handle from `showDirectoryPicker()`.
// That distinction is the whole point of the ticket. `FsaFilesystem over OPFS` (the default backend
// above) does NOT exercise the temp-file path — OPFS `createWritable()` is in-place, whereas a
// handle to a real folder must create a temp file, write it, and atomically swap on `close()`. The
// question is whether that per-save constant is large enough at Studio's 800 ms autosave debounce
// (`apps/studio/src/exhibit-session.svelte.ts:79`) to force a save-cadence change before web
// folder-canonical work can start.
//
// Both flows are opt-in query params, so a bare `node scripts/perf/fsrun.mjs` behaves exactly as it
// did — this file is on no ratchet, but the tile sweep is what fsrun's readers expect.
//
// The autosave flow drives the SHIPPED `AnnotationSession.save()` (not a transcription): a debounced
// autosave is one `editNote` coalesced into one `save()`, which writes heads.json + the ONE dirty
// history page + history/index.json — three small files, `only`-gated at session.ts:312.
import { FsaFilesystem } from "../../packages/render-core/src/fs/fsa.ts";
import { MemoryFilesystem } from "../../packages/render-core/src/fs/memory.ts";
import { ZipStreamFilesystem } from "../../packages/render-core/src/fs/zip-stream.ts";
import type { Filesystem, FsDirectory } from "../../packages/render-core/src/fs/seam.ts";
import { mapLimit } from "../../packages/render-core/src/concurrency.ts";
import { AnnotationSession } from "../../packages/render-core/src/session/session.ts";
import { asClientId, type LogicalId } from "../../packages/render-core/src/wadm/brand.ts";
import type { W3CSpecificResource } from "../../packages/render-core/src/wadm/types.ts";

const out = document.querySelector("#out")!;
const say = (s: string) => { out.textContent += s + "\n"; console.log(s); };

const PARAMS = new URLSearchParams(location.search);
const FLOW = PARAMS.get("flow") ?? "tiles";
const WANT_FOLDER = PARAMS.get("folder") === "1";

/** A pyramid shaped like a real one: 1033 tiles across 14 levels, ~9 KB of JPEG each. */
async function makeTiles(count: number): Promise<Map<string, Blob>> {
  // Real JPEG bytes (noise → incompressible, like a photo) so the zip sink does representative work.
  const c = new OffscreenCanvas(254, 254);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(254, 254);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = Math.random() * 255; img.data[i + 1] = Math.random() * 255;
    img.data[i + 2] = Math.random() * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.82 });
  const tiles = new Map<string, Blob>();
  let level = 14, col = 0, row = 0, perLevel = 0;
  for (let i = 0; i < count; i++) {
    tiles.set(`${level}/${col}_${row}.jpg`, blob);
    row++; if (row > 31) { row = 0; col++; }
    if (++perLevel > 380) { perLevel = 0; level--; col = 0; row = 0; }
  }
  return tiles;
}

// ── the shipped implementation, transcribed verbatim (site.ts:250) ────────────────────────────────
async function writeSerial(filesDir: FsDirectory, tiles: Map<string, Blob>): Promise<void> {
  const levelDirs = new Map<string, FsDirectory>();
  for (const [path, blob] of tiles) {
    const slash = path.indexOf("/");
    const level = path.slice(0, slash);
    const fileName = path.slice(slash + 1);
    let dir = levelDirs.get(level);
    if (!dir) { dir = await filesDir.getDirectory(level, { create: true }); levelDirs.set(level, dir); }
    const file = await dir.getFile(fileName, { create: true });
    const w = await file.writable();
    await w.write(blob);
    await w.close();
  }
}

// ── the candidate: group by level, then fan the per-level writes out under a bound ────────────────
async function writeConcurrent(filesDir: FsDirectory, tiles: Map<string, Blob>, limit: number): Promise<void> {
  const byLevel = new Map<string, [string, Blob][]>();
  for (const [path, blob] of tiles) {
    const slash = path.indexOf("/");
    const level = path.slice(0, slash);
    let bucket = byLevel.get(level);
    if (!bucket) { bucket = []; byLevel.set(level, bucket); }
    bucket.push([path.slice(slash + 1), blob]);
  }
  // Levels serially (each is one getDirectory create), tiles within a level concurrently. Creating the
  // level dirs concurrently would race create-if-absent on the same parent on some backends.
  for (const [level, entries] of byLevel) {
    const dir = await filesDir.getDirectory(level, { create: true });
    await mapLimit(entries, limit, async ([fileName, blob]) => {
      const file = await dir.getFile(fileName, { create: true });
      const w = await file.writable();
      await w.write(blob);
      await w.close();
    });
  }
}

/** Read every written tile back and byte-compare against the source — order changes must not lose data. */
async function verify(fs: Filesystem, tiles: Map<string, Blob>): Promise<string> {
  const root = await fs.root();
  const files = await root.getDirectory("obj_files");
  let checked = 0;
  for (const [path, blob] of tiles) {
    const slash = path.indexOf("/");
    const dir = await files.getDirectory(path.slice(0, slash));
    const f = await dir.getFile(path.slice(slash + 1));
    const got = new Uint8Array(await f.readable());
    const want = new Uint8Array(await blob.arrayBuffer());
    if (got.byteLength !== want.byteLength) return `size mismatch at ${path}: ${got.byteLength} vs ${want.byteLength}`;
    if (checked % 97 === 0) for (let i = 0; i < want.length; i += 512) if (got[i] !== want[i]) return `byte mismatch at ${path}`;
    checked++;
  }
  return `ok (${checked} tiles read back)`;
}

async function freshOpfs(): Promise<Filesystem> {
  const root = await navigator.storage.getDirectory();
  for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) {
    await root.removeEntry(name, { recursive: true }).catch(() => {});
  }
  return new FsaFilesystem(root);
}

function nullSink() {
  let bytes = 0;
  return { sink: { write: async (c: Uint8Array) => { bytes += c.byteLength; }, close: async () => {} }, total: () => bytes };
}

// ── the autosave flow (Archie-b5c2) ───────────────────────────────────────────────────────────────

const AUTHOR = asClientId("bench@archie");
const CANVAS = "https://archie.bench/exhibit/canvas/o";

/** A session shaped like a real exhibit's: N notes, each a polygon region with a paragraph of body. */
function seedSession(noteCount: number): { session: AnnotationSession; ids: LogicalId[] } {
  const session = new AnnotationSession(AUTHOR);
  const ids: LogicalId[] = [];
  for (let i = 0; i < noteCount; i++) {
    const target: W3CSpecificResource = {
      type: "SpecificResource",
      source: `${CANVAS}${i % 8}`,
      selector: { type: "FragmentSelector", value: `xywh=pixel:${10 + i},${20 + i},${180 + i},${140 + i}` },
    };
    ids.push(session.createNote({
      target,
      body: { type: "TextualBody", purpose: "commenting", format: "text/plain",
        value: `Bench note ${i}. ${"The scribe's hand changes at this quire boundary; the ink is browner and the ruling wider. ".repeat(3)}` },
    }));
  }
  return { session, ids };
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]!; };

interface AutosaveResult { noteCount: number; firstFullSaveMs: number; samples: number[]; }

/**
 * ONE debounced autosave = one edit coalesced into one `session.save(dir)`. The first (full) save is
 * measured separately and NOT folded into the samples — it is the post-open write of every page, a
 * different event from the steady-state autosave the 800 ms debounce actually schedules.
 */
async function autosaveFlow(dir: FsDirectory, noteCount: number, saves: number): Promise<AutosaveResult> {
  const { session, ids } = seedSession(noteCount);
  const opts = { baseUrl: "https://archie.bench/annotations/" };
  const t0 = performance.now();
  await session.save(dir, opts); // full projection — every page (session.ts:304)
  const firstFullSaveMs = performance.now() - t0;

  const samples: number[] = [];
  for (let r = 0; r < saves; r++) {
    // What an author's 800 ms of typing coalesces into: one edited note, one dirty page.
    session.editNote(ids[r % ids.length]!, {
      body: { type: "TextualBody", purpose: "commenting", format: "text/plain", value: `revision ${r} — ${"reworded ".repeat(20)}` },
    });
    const t = performance.now();
    await session.save(dir, opts); // incremental — heads.json + 1 page + index.json (session.ts:312)
    samples.push(performance.now() - t);
  }
  return { noteCount, firstFullSaveMs, samples };
}

/** Wait for a REAL folder handle. `showDirectoryPicker` needs a user gesture, so the page must offer
 *  a button for the drive (`scripts/perf/fsafolderrun.mjs`) to click; there is no headless grant. */
async function awaitFolderHandle(): Promise<FileSystemDirectoryHandle> {
  const btn = document.createElement("button");
  btn.id = "pickfolder";
  btn.textContent = "PICK A FOLDER";
  btn.style.cssText = "font-size:32px;padding:32px;margin:16px 0;display:block";
  out.parentElement!.insertBefore(btn, out);
  say("waiting for a real-folder pick (click #pickfolder)…");
  return await new Promise<FileSystemDirectoryHandle>((resolve, reject) => {
    btn.addEventListener("click", async () => {
      try {
        const handle = await (window as unknown as { showDirectoryPicker(o: unknown): Promise<FileSystemDirectoryHandle> })
          .showDirectoryPicker({ mode: "readwrite" });
        (window as unknown as { __FOLDER_OK__: boolean }).__FOLDER_OK__ = true;
        btn.remove();
        resolve(handle);
      } catch (e) { reject(e as Error); }
    });
  });
}

/** A clean subdirectory per config — a prior run's pages must not turn a full write into a no-op. */
async function freshDir(fs: Filesystem, name: string): Promise<FsDirectory> {
  const root = await fs.root();
  await root.remove(name).catch(() => {});
  return root.getDirectory(name, { create: true });
}

async function runAutosave(results: Record<string, unknown>): Promise<void> {
  const SAVES = Number(PARAMS.get("saves") ?? 25);
  const COUNTS = (PARAMS.get("notes") ?? "10,50,200").split(",").map(Number);

  const backends: [string, () => Promise<Filesystem>][] = [];
  if (WANT_FOLDER) {
    const handle = await awaitFolderHandle();
    say(`real folder acquired: "${handle.name}"\n`);
    backends.push([`real folder (${handle.name})`, async () => new FsaFilesystem(handle)]);
  }
  backends.push(["opfs", async () => new FsaFilesystem(await navigator.storage.getDirectory())]);
  backends.push(["memory (floor)", async () => new MemoryFilesystem()]);

  say(`autosave flow — ${SAVES} debounced saves per config, note counts ${COUNTS.join("/")}\n`);
  for (const [label, make] of backends) {
    say(`── ${label} ─────────────────────────────`);
    const fs = await make();
    for (const n of COUNTS) {
      const r = await autosaveFlow(await freshDir(fs, `b5c2_${n}`), n, SAVES);
      const med = median(r.samples), lo = Math.min(...r.samples), hi = Math.max(...r.samples);
      results[`${label}|notes${n}`] = { median: med, p90: pct(r.samples, 0.9), min: lo, max: hi, n: r.samples.length, firstFullSaveMs: r.firstFullSaveMs, samples: r.samples };
      say(`  ${String(n).padStart(3)} notes  median ${med.toFixed(2)} ms   p90 ${pct(r.samples, 0.9).toFixed(2)}   range ${lo.toFixed(2)}–${hi.toFixed(2)}   (n=${r.samples.length})`);
      say(`             first full save ${r.firstFullSaveMs.toFixed(1)} ms  (${n} pages + heads + index)`);
    }
    say("");
  }
}

async function main() {
  const results: Record<string, unknown> = {};
  if (FLOW === "autosave") {
    await runAutosave(results);
    (window as unknown as { __BENCH__: unknown }).__BENCH__ = results;
    return;
  }
  const COUNT = 1033;
  say(`building ${COUNT} real JPEG tiles…`);
  const tiles = await makeTiles(COUNT);
  const rawBytes = [...tiles.values()].reduce((n, b) => n + b.size, 0);
  say(`pyramid: ${tiles.size} tiles, ${(rawBytes / 1e6).toFixed(1)} MB\n`);

  const backends: [string, () => Promise<Filesystem>][] = [
    ["opfs (folder publish sink)", freshOpfs],
    ["zip-stream (.archie.zip sink)", async () => new ZipStreamFilesystem(nullSink().sink)],
    ["memory (scheduling floor)", async () => new MemoryFilesystem()],
  ];

  for (const [label, make] of backends) {
    say(`── ${label} ─────────────────────────────`);
    // serial = the shipped path
    {
      const fs = await make();
      const dir = await (await fs.root()).getDirectory("obj_files", { create: true });
      const t = performance.now();
      await writeSerial(dir, tiles);
      const ms = performance.now() - t;
      results[`${label}|serial`] = ms;
      say(`  serial (SHIPPED)   ${ms.toFixed(0)} ms`);
      if (label.startsWith("opfs")) say(`    verify: ${await verify(fs, tiles)}`);
      var baseline = ms; // eslint-disable-line no-var
    }
    for (const limit of [4, 8, 16, 32, 64]) {
      const fs = await make();
      const dir = await (await fs.root()).getDirectory("obj_files", { create: true });
      const t = performance.now();
      await writeConcurrent(dir, tiles, limit);
      const ms = performance.now() - t;
      results[`${label}|limit${limit}`] = ms;
      say(`  concurrent x${String(limit).padEnd(3)} ${ms.toFixed(0)} ms   (${(baseline / ms).toFixed(1)}x)`);
      if (label.startsWith("opfs") && limit === 16) say(`    verify: ${await verify(fs, tiles)}`);
    }
    say("");
  }

  (window as unknown as { __BENCH__: unknown }).__BENCH__ = results;
}

main().catch((e) => {
  say(`ERROR: ${e?.stack ?? e}`);
  (window as unknown as { __BENCH__: unknown }).__BENCH__ = { error: String(e) };
});
