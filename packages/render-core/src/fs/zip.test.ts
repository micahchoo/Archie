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

  it("exposes documented, sane default caps (SCALE-rescaled for a real large library)", () => {
    expect(ZIP_LIMITS.maxTotalBytes).toBe(4 * 1024 * 1024 * 1024); // 4 GiB total uncompressed
    expect(ZIP_LIMITS.maxEntries).toBe(500_000);
    expect(ZIP_LIMITS.maxRatio).toBe(100); // per-entry decompressed:compressed (unchanged — the real bomb guard)
  });

  // Enforcement is driven with an INJECTED tiny `limits` (fromZip's optional 2nd arg — a test seam,
  // default `ZIP_LIMITS`), NOT a production-cap-sized real archive: building 4 GiB / 500k entries to
  // trip the raised caps would be absurd. This proves the guard LOGIC; the test above pins the values.
  it("rejects an archive whose total uncompressed size exceeds the cap, with a clear error", () => {
    // A few small STORED entries whose declared sizes accumulate past a tiny injected total cap. Each
    // entry's ratio is 1× (stored, declared == compressed), so the ratio guard is NOT what trips.
    const tree: Zippable = {};
    for (let i = 0; i < 4; i++) tree[`big/${i}.bin`] = [new Uint8Array(50).fill(65), STORED]; // ~200 declared bytes total
    const bytes = zipSync(tree);
    const tinyTotal = { maxTotalBytes: 100, maxEntries: 500_000, maxRatio: 100 }; // 100-byte total cap
    expect(() => ZipFilesystem.fromZip(bytes, tinyTotal)).toThrow(/too large|exceed|uncompress|total|MB/i);
  });

  it("stores already-compressed media instead of deflating it, and still round-trips", async () => {
    // toZip picks a per-entry compression level: media is entropy-coded already, so deflating it burns
    // main-thread time (measured 150ms vs 19ms on a 1073-entry pyramid) to save ~0.7%. Text still
    // deflates. This pins BOTH halves — a regression to a single global level would break one of them.
    const fs = new ZipFilesystem();
    const root = await fs.root();
    // Incompressible bytes standing in for a JPEG tile, and highly compressible text.
    const media = new Uint8Array(20_000);
    for (let i = 0; i < media.length; i++) media[i] = (i * 2654435761) % 251;
    // Varied, JSON-ish text — realistic for manifest.json. (A single repeated phrase compresses ~230x
    // and trips fromZip's own 100x zip-bomb ratio guard, which would be testing the wrong thing.)
    const prose = JSON.stringify(
      Array.from({ length: 300 }, (_, i) => ({ id: `canvas-${i}`, label: `Folio ${i} recto`, width: 2000 + i, height: 3000 - i })),
    );

    const write = async (name: string, data: Uint8Array | string) => {
      const f = await root.getFile(name, { create: true });
      const w = await f.writable();
      await w.write(typeof data === "string" ? data : data.buffer as ArrayBuffer);
      await w.close();
    };
    await write("tile.jpg", media);
    await write("manifest.json", prose);

    const bytes = fs.toZip();
    // fflate records the method per entry: 0 = stored, 8 = deflated. Read it off the local headers so
    // this asserts the ARCHIVE, not our intent.
    const methodOf = (name: string): number => {
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let i = 0; i + 30 < bytes.length; i++) {
        if (dv.getUint32(i, true) !== 0x04034b50) continue; // local file header signature
        const nameLen = dv.getUint16(i + 26, true);
        const entry = new TextDecoder().decode(bytes.subarray(i + 30, i + 30 + nameLen));
        if (entry === name) return dv.getUint16(i + 8, true);
      }
      throw new Error(`no local header for ${name}`);
    };
    expect(methodOf("tile.jpg")).toBe(0);       // stored — no deflate attempt on entropy-coded bytes
    expect(methodOf("manifest.json")).toBe(8);  // deflated — text still pays off

    // The whole point is that this is invisible downstream: the tree reopens byte-identically.
    const reopened = ZipFilesystem.fromZip(bytes);
    const rroot = await reopened.root();
    expect(new Uint8Array(await (await rroot.getFile("tile.jpg")).readable())).toEqual(media);
    expect(new TextDecoder().decode(await (await rroot.getFile("manifest.json")).readable())).toBe(prose);
  });

  it("rejects an archive with too many entries, with a clear error", () => {
    const tree: Zippable = {};
    for (let i = 0; i <= 5; i++) tree[`f/${i}.b`] = [enc("x"), STORED]; // 6 tiny entries — over the injected cap of 5
    const bytes = zipSync(tree);
    const fewEntries = { maxTotalBytes: 4 * 1024 * 1024 * 1024, maxEntries: 5, maxRatio: 100 };
    expect(() => ZipFilesystem.fromZip(bytes, fewEntries)).toThrow(/too many|entries/i);
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

// SCALE requirement #2 — the EAGER assembly path (Tauri/non-Chromium) holds the whole tree in memory
// AND toZip() doubles it, so a runaway library OOMs the webview. `maxUncompressedBytes` tracks
// cumulative retained bytes during assembly and aborts EARLY with an actionable error — catching media
// (generated DZI tiles, remote bakes) a pre-assembly asset-size estimate can't see.
describe("ZipFilesystem — eager-assembly memory ceiling (maxUncompressedBytes)", () => {
  const write = async (fs: ZipFilesystem, name: string, n: number): Promise<void> => {
    const w = await (await (await fs.root()).getFile(name, { create: true })).writable();
    await w.write(new Uint8Array(n).buffer);
    await w.close();
  };

  it("aborts early, with an actionable error, once the tree crosses the ceiling", async () => {
    const fs = new ZipFilesystem({ maxUncompressedBytes: 1024 }); // 1 KB ceiling
    await write(fs, "a.bin", 600); // under — fine
    await expect(write(fs, "b.bin", 600)).rejects.toThrow(/too large|folder|URL|memory/i); // 1200 > 1024
  });

  it("is unbounded by default (no ceiling → large writes never throw)", async () => {
    const fs = new ZipFilesystem();
    await expect(write(fs, "big.bin", 8 * 1024 * 1024)).resolves.toBeUndefined(); // 8 MB, no cap
    expect(fs.toZip().byteLength).toBeGreaterThan(0);
  });

  it("counts a delete back off the running total (a rewrite/prune frees headroom)", async () => {
    const fs = new ZipFilesystem({ maxUncompressedBytes: 1000 });
    await write(fs, "a.bin", 800);
    await (await fs.root()).remove("a.bin"); // frees 800
    await expect(write(fs, "b.bin", 800)).resolves.toBeUndefined(); // fits again
  });
});

// Format guard (ZIP_FORMAT_LIMITS): fflate's zipSync writes the EOCD entry count into a 2-byte field
// with no overflow check, so a >65 535-file tree would serialize to a silently corrupt archive (its
// own reader would reopen count-mod-65536 files). toZip must refuse instead. Limits injected tiny —
// same guard at the production ceiling.
describe("ZipFilesystem — toZip entry-count format guard", () => {
  const write = async (fs: ZipFilesystem, name: string): Promise<void> => {
    const w = await (await (await fs.root()).getFile(name, { create: true })).writable();
    await w.write("{}");
    await w.close();
  };

  it("refuses a tree past the entry ceiling with the actionable steer", async () => {
    const fs = new ZipFilesystem();
    await write(fs, "a.json");
    await write(fs, "b.json");
    await write(fs, "c.json");
    expect(() => fs.toZip({ maxEntries: 2, maxBytes: 0xffff_ffff })).toThrow(/publish to a folder/i);
    expect(() => fs.toZip({ maxEntries: 3, maxBytes: 0xffff_ffff })).not.toThrow(); // at the limit — fine
  });
});
