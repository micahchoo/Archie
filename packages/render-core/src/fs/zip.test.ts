import { describe, it, expect } from "vitest";
import { zipSync, type Zippable, type ZipOptions } from "fflate";
import { ZipFilesystem, ZIP_LIMITS } from "./zip.js";
import { writeAnnotations, readAnnotations } from "../spine/persist.js";
import { appendNew, appendEdit } from "../spine/log.js";
import { asClientId } from "../wadm/brand.js";
import type { AnnotationLog } from "../wadm/types.js";

// ZipFilesystem — the DownloadFilesystem core (UX-Q2: the zip IS the canonical file). Backs
// the Filesystem seam over an in-memory file tree, serializable to/from a .archie.zip (fflate).

describe("ZipFilesystem — seam + zip serialization round-trip", () => {
  it("round-trips a nested file tree through toZip / fromZip", async () => {
    const fs = new ZipFilesystem();
    const root = await fs.root();
    const w1 = await (await root.getFile("manifest.json", { create: true })).writable();
    await w1.write('{"type":"Manifest"}');
    await w1.close();
    const sub = await root.getDirectory("annotations", { create: true });
    const w2 = await (await sub.getFile("index.json", { create: true })).writable();
    await w2.write('{"a":1}');
    await w2.close();

    const bytes = fs.toZip();
    expect(bytes.byteLength).toBeGreaterThan(0);

    const fs2 = ZipFilesystem.fromZip(bytes);
    const root2 = await fs2.root();
    const m = new TextDecoder().decode(await (await root2.getFile("manifest.json")).readable());
    expect(m).toBe('{"type":"Manifest"}');
    const idx = new TextDecoder().decode(await (await (await root2.getDirectory("annotations")).getFile("index.json")).readable());
    expect(idx).toBe('{"a":1}');
  });

  it("lists immediate entries (files and implicit directories) by prefix", async () => {
    const fs = new ZipFilesystem();
    const root = await fs.root();
    await (await (await root.getFile("a.json", { create: true })).writable()).close();
    const d = await root.getDirectory("history", { create: true });
    await (await (await d.getFile("x.json", { create: true })).writable()).close();
    const top: string[] = [];
    for await (const e of root.entries()) top.push(`${e.kind}:${e.name}`);
    expect(top).toContain("file:a.json");
    expect(top).toContain("directory:history");
  });

  it("getFile/getDirectory without create throws on missing paths", async () => {
    const fs = new ZipFilesystem();
    const root = await fs.root();
    await expect(root.getFile("missing.json")).rejects.toThrow();
    await expect(root.getDirectory("missing")).rejects.toThrow();
  });

  it("INTEGRATION: persist the annotation spine through a zip round-trip (the canonical-file path)", async () => {
    const alice = asClientId("alice");
    const { log: l1, record: v1 } = appendNew([], { target: "c1", body: { type: "TextualBody", value: "v1" }, lastEditor: alice, modifiedAt: "t1", now: 1 });
    const { log }: { log: AnnotationLog } = appendEdit(l1, v1.logicalId, { body: { type: "TextualBody", value: "v2" }, lastEditor: alice, modifiedAt: "t2", now: 2 });

    const fs = new ZipFilesystem();
    await writeAnnotations(await fs.root(), log, { baseUrl: "b/" });
    // Save → reopen (the "Open a .archie.zip" flow): serialize and reload from the bytes.
    const reopened = ZipFilesystem.fromZip(fs.toZip());
    const reloaded = await readAnnotations(await reopened.root());

    const sort = (l: AnnotationLog) => [...l].sort((a, b) => (a.rev < b.rev ? -1 : 1));
    expect(sort(reloaded)).toEqual(sort(log));
  });
});

// Strategy item 5.1 — cap decompression in fromZip (the file-drop path). Before this guard, the
// local drop flow (apps/studio/src/ingest-flows.ts, apps/viewer/src/published.ts → fromZip) fed
// attacker-controlled bytes straight into unzipSync with NO ceiling — a zip bomb (a few KB that
// declares GBs uncompressed) would OOM the tab. (The ?src= fetch path already had a 256MB cap; this
// closes the matching High on the drop path.) The guard reads the central-directory metadata via
// fflate's `filter` callback (originalSize / compressed size are known BEFORE decompression) and
// fails CLOSED on breach of: total uncompressed bytes, entry count, or per-entry compression ratio.
describe("ZipFilesystem.fromZip — decompression cap (strategy 5.1, zip-bomb defense)", () => {
  // Build a zip whose entries are STORED (compression 0) with attacker-chosen declared sizes — we
  // can't make fflate emit GBs cheaply, so we drive the guard with the declared `originalSize` that
  // the filter sees from the central directory. A genuinely bomb-sized real payload is unnecessary:
  // the guard must reject on the DECLARED size, before paying to decompress.
  const enc = (s: string) => new TextEncoder().encode(s);
  const STORED: ZipOptions = { level: 0 }; // no deflate → originalSize === payload length

  it("exposes documented, sane default caps", () => {
    expect(ZIP_LIMITS.maxTotalBytes).toBe(512 * 1024 * 1024); // 512 MB total uncompressed
    expect(ZIP_LIMITS.maxEntries).toBe(50_000);
    expect(ZIP_LIMITS.maxRatio).toBe(100); // per-entry decompressed:compressed
  });

  it("rejects an archive whose total uncompressed size exceeds the cap, with a clear error", () => {
    // Many entries, EACH within the 100× ratio cap (so the ratio guard is NOT what trips), whose
    // DECLARED sizes ACCUMULATE past 512MB. This isolates the total-bytes guard from the per-entry
    // ratio guard. ~26MB declared per entry × ~21 entries > 512MB; each entry is a real 1MB stored
    // blob declaring 26MB (26× ratio, under 100×), forged via the directory patch.
    const perEntryCompressed = 1024 * 1024; // 1 MB real stored payload
    const perEntryDeclared = 26 * 1024 * 1024; // 26× ratio — under the 100× cap
    const need = Math.ceil((ZIP_LIMITS.maxTotalBytes + 1) / perEntryDeclared); // entries to top 512MB
    const tree: Zippable = {};
    const blob = new Uint8Array(perEntryCompressed).fill(65);
    for (let i = 0; i < need; i++) tree[`big/${i}.bin`] = [blob, STORED];
    const bomb = patchUncompressedSizes(zipSync(tree), () => perEntryDeclared);
    expect(() => ZipFilesystem.fromZip(bomb)).toThrow(/too large|exceed|512|uncompress|total/i);
  });

  it("rejects an archive with too many entries, with a clear error", () => {
    const tree: Zippable = {};
    // 50_001 tiny stored entries — over the 50k cap. Each is a single byte; cheap to build.
    for (let i = 0; i <= ZIP_LIMITS.maxEntries; i++) tree[`f/${i}.b`] = [enc("x"), STORED];
    const bytes = zipSync(tree);
    expect(() => ZipFilesystem.fromZip(bytes)).toThrow(/too many|entries|50/i);
  });

  it("rejects an entry whose declared decompression ratio exceeds the cap, with a clear error", () => {
    // A small compressed entry that DECLARES a wildly larger uncompressed size (ratio > 100x) — the
    // classic single-entry bomb. Forged via the same directory-patch helper.
    const bomb = makeRatioBomb({ compressedSize: 1000, declaredOriginalSize: 1000 * (ZIP_LIMITS.maxRatio + 5) });
    expect(() => ZipFilesystem.fromZip(bomb)).toThrow(/ratio|too large|exceed|bomb/i);
  });

  it("accepts a benign archive sitting just under the caps (no false positive)", () => {
    const tree: Zippable = {};
    for (let i = 0; i < 100; i++) tree[`note/${i}.json`] = enc(JSON.stringify({ i, body: "hello world".repeat(20) }));
    const bytes = zipSync(tree);
    const fs = ZipFilesystem.fromZip(bytes);
    expect(fs).toBeInstanceOf(ZipFilesystem);
  });

  // --- bomb forgers: patch the ZIP central directory so the filter sees an attacker-declared size,
  // --- without allocating the payload. ZIP stores uncompressed size at +0x18 of each central
  // --- directory header (signature 0x02014b50, little-endian) and of each local file header
  // --- (signature 0x04034b50, +0x16). fflate's `filter` reads the central directory.
  function makeRatioBomb(opts: { compressedSize: number; declaredOriginalSize: number }): Uint8Array {
    // A real entry with `compressedSize` STORED bytes (so size==compressedSize), then forge the
    // declared uncompressed size to blow the ratio — the directory disagrees with reality on size.
    const payload = new Uint8Array(opts.compressedSize).fill(65);
    const bytes = zipSync({ "ratio.bin": [payload, STORED] });
    return patchUncompressedSizes(bytes, () => opts.declaredOriginalSize);
  }
  /** Rewrite every uncompressed-size field (central dir +0x18, local header +0x16) to `f()`. */
  function patchUncompressedSizes(zip: Uint8Array, f: () => number): Uint8Array {
    const out = zip.slice();
    const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
    for (let i = 0; i + 4 <= out.length; i++) {
      const sig = dv.getUint32(i, true);
      if (sig === 0x02014b50 && i + 0x18 + 4 <= out.length) dv.setUint32(i + 0x18, f() >>> 0, true); // central dir: uncompressed size @ +0x18
      else if (sig === 0x04034b50 && i + 0x16 + 4 <= out.length) dv.setUint32(i + 0x16, f() >>> 0, true); // local header: uncompressed size @ +0x16
    }
    return out;
  }
});
