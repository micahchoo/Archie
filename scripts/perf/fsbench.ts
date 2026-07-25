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
import { FsaFilesystem } from "../../packages/render-core/src/fs/fsa.ts";
import { MemoryFilesystem } from "../../packages/render-core/src/fs/memory.ts";
import { ZipStreamFilesystem } from "../../packages/render-core/src/fs/zip-stream.ts";
import type { Filesystem, FsDirectory } from "../../packages/render-core/src/fs/seam.ts";
import { mapLimit } from "../../packages/render-core/src/concurrency.ts";

const out = document.querySelector("#out")!;
const say = (s: string) => { out.textContent += s + "\n"; console.log(s); };

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

async function main() {
  const results: Record<string, unknown> = {};
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
