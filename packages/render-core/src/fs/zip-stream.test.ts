import { describe, it, expect } from "vitest";
import { unzipSync } from "fflate";
import {
  ZipStreamFilesystem,
  crc32,
  dosDateTime,
  buildLocalHeader,
  buildCentralDirectoryEntry,
  buildEocdTail,
} from "./zip-stream.js";
import { ZipFilesystem } from "./zip.js";
import type { Filesystem } from "./seam.js";

// ZipStreamFilesystem — the WRITE-THROUGH streaming .archie.zip sink (SCALE LARGE-MEDIA-MEMORY-CEILING
// A). Unlike ZipFilesystem (whole tree in a Map, serialized after), this feeds each file into an
// fflate Zip as it closes and RELEASES media bytes immediately. These tests pin the byte production +
// the memory-release contract headlessly; the browser file-handle sink is verified in the browser.

/** A sink that concatenates every emitted chunk (fflate may reuse buffers → copy each) and records
 *  the event order, so we can assert close() fires only after the writes have drained. */
function collector() {
  const chunks: Uint8Array[] = [];
  const events: string[] = [];
  return {
    sink: {
      write: async (chunk: Uint8Array) => {
        await Promise.resolve(); // a microtask hop — a fire-and-forget producer would let close() jump ahead
        chunks.push(chunk.slice());
        events.push("write");
      },
      close: () => {
        events.push("close");
      },
    },
    bytes: (): Uint8Array => {
      const total = chunks.reduce((n, c) => n + c.byteLength, 0);
      const out = new Uint8Array(total);
      let o = 0;
      for (const c of chunks) {
        out.set(c, o);
        o += c.byteLength;
      }
      return out;
    },
    events: () => events,
  };
}

const enc = (s: string) => new TextEncoder().encode(s);
/** Mirror site.ts writeJson/writeText: STRUCTURAL files are written as STRINGS (→ retained for read-back). */
async function writeText(fs: Filesystem, path: string, text: string): Promise<void> {
  const parts = path.split("/");
  let dir = await fs.root();
  for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectory(parts[i]!, { create: true });
  const w = await (await dir.getFile(parts[parts.length - 1]!, { create: true })).writable();
  await w.write(text);
  await w.close();
}
/** Mirror the media path: masters/thumbs/tiles are written as BYTES (→ streamed + released). */
async function writeBin(fs: Filesystem, path: string, bytes: Uint8Array): Promise<void> {
  const parts = path.split("/");
  let dir = await fs.root();
  for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectory(parts[i]!, { create: true });
  const w = await (await dir.getFile(parts[parts.length - 1]!, { create: true })).writable();
  await w.write(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  await w.close();
}

describe("ZipStreamFilesystem — write-through streaming zip sink", () => {
  it("entry integrity: a stream-written archive reopens via fromZip with identical contents", async () => {
    const c = collector();
    const fs = new ZipStreamFilesystem(c.sink);
    const master = new Uint8Array(70_000).map((_, i) => (i * 31 + 7) & 0xff); // >64KB, spans a chunk boundary
    await writeText(fs, "voynich/manifest.json", '{"type":"Manifest"}');
    await writeBin(fs, "voynich/assets/f1.jpg", master);
    await writeText(fs, "voynich/canvas/o1/annotations.json", '{"items":[]}');
    await fs.finish();

    // Reopen through the REAL open-side decoder (proves a valid central directory + intact entries).
    const reopened = ZipFilesystem.fromZip(c.bytes());
    const root = await reopened.root();
    const read = async (p: string): Promise<Uint8Array> => {
      const parts = p.split("/");
      let d = root;
      for (let i = 0; i < parts.length - 1; i++) d = await d.getDirectory(parts[i]!);
      return new Uint8Array(await (await d.getFile(parts[parts.length - 1]!)).readable());
    };
    expect(new TextDecoder().decode(await read("voynich/manifest.json"))).toBe('{"type":"Manifest"}');
    expect(new TextDecoder().decode(await read("voynich/canvas/o1/annotations.json"))).toBe('{"items":[]}');
    expect(Array.from(await read("voynich/assets/f1.jpg"))).toEqual(Array.from(master)); // media bytes exact
  });

  it("interleaved CONCURRENT writes serialize into a valid archive with contiguous entries", async () => {
    const c = collector();
    const fs = new ZipStreamFilesystem(c.sink);
    // Fan writes out concurrently (as the concurrent publishLibrary will), each yielding microtasks
    // between getFile/write/close so their commits genuinely interleave at the queue.
    const N = 24;
    await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        await Promise.resolve();
        const bin = new Uint8Array(1000 + i).map((_v, j) => (i * 7 + j) & 0xff);
        if (i % 2 === 0) await writeBin(fs, `ex/assets/m${i}.bin`, bin);
        else await writeText(fs, `ex/canvas/o${i}/annotations.json`, `{"i":${i}}`);
      }),
    );
    await fs.finish();

    const out = unzipSync(c.bytes()); // decodes only if every entry's bytes are contiguous (no interleave)
    expect(Object.keys(out)).toHaveLength(N);
    for (let i = 0; i < N; i++) {
      if (i % 2 === 0) {
        const expected = new Uint8Array(1000 + i).map((_v, j) => (i * 7 + j) & 0xff);
        expect(Array.from(out[`ex/assets/m${i}.bin`]!)).toEqual(Array.from(expected));
      } else {
        expect(new TextDecoder().decode(out[`ex/canvas/o${i}/annotations.json`]!)).toBe(`{"i":${i}}`);
      }
    }
  });

  it("RELEASES media bytes: a binary-written file is NOT held in the read-back surface", async () => {
    const c = collector();
    const fs = new ZipStreamFilesystem(c.sink);
    await writeText(fs, "voynich/manifest.json", '{"type":"Manifest"}'); // structural → retained
    await writeBin(fs, "voynich/assets/big.jpg", new Uint8Array(500_000)); // media → released
    await writeBin(fs, "voynich/f1_files/0/0_0.jpg", new Uint8Array(120_000)); // DZI tile → released

    const retained = fs.retainedPaths();
    expect(retained).toContain("voynich/manifest.json"); // read-back surface keeps structural JSON
    expect(retained).not.toContain("voynich/assets/big.jpg"); // media ref dropped
    expect(retained).not.toContain("voynich/f1_files/0/0_0.jpg");
    // The retained surface is structural-only — its footprint is independent of media volume.
    expect(retained).toEqual(["voynich/manifest.json"]);
    await fs.finish();
  });

  it("serves read-back of a structural file mid-stream, but a released media file reads as absent", async () => {
    const c = collector();
    const fs = new ZipStreamFilesystem(c.sink);
    await writeText(fs, "voynich/manifest.json", '{"ok":true}');
    await writeBin(fs, "voynich/assets/m.jpg", new Uint8Array(2048));

    // Read-back (what buildImageIndex does): the manifest is reachable and intact.
    const root = await fs.root();
    const man = await (await (await root.getDirectory("voynich")).getFile("manifest.json")).readable();
    expect(new TextDecoder().decode(new Uint8Array(man))).toBe('{"ok":true}');
    // A released media file is absent (→ getOptional would map to null, never a false read). The
    // absence surfaces at the first released segment (the empty `assets/` dir) — either way, "no such".
    const readReleasedMedia = async (): Promise<ArrayBuffer> => {
      const assets = await (await root.getDirectory("voynich")).getDirectory("assets");
      return (await assets.getFile("m.jpg")).readable();
    };
    await expect(readReleasedMedia()).rejects.toThrow(/no such/i);
    await fs.finish();
  });

  it("finishes an empty filesystem to a valid (empty) archive, closing the sink last", async () => {
    const c = collector();
    const fs = new ZipStreamFilesystem(c.sink);
    await fs.finish();
    expect(Object.keys(unzipSync(c.bytes()))).toHaveLength(0); // valid empty central directory
    const events = c.events();
    expect(events[events.length - 1]).toBe("close"); // close is last
    expect(events.filter((e) => e === "close")).toHaveLength(1); // exactly once
  });

  // Format guard (ZIP_FORMAT_LIMITS), ENTRIES dimension — Archie-1cf0. fflate's writer silently wraps
  // a >65 535 entry count (wzf writes it unchecked; see zip.ts's ZIP_FORMAT_LIMITS doc), so past
  // `limits.maxEntries` the stream now switches the archive to Zip64 (a Zip64 EOCD Record + Locator
  // ahead of the classic EOCD, entry-count sentinelled to 0xFFFF) instead of refusing. `limits` is
  // injected tiny here so the switch is cheap to trigger; the production threshold (65,535) gets its
  // own real-scale proof below.
  it("format guard: entries past maxEntries switch to Zip64 instead of refusing, and round-trip", async () => {
    const c = collector();
    const fs = new ZipStreamFilesystem(c.sink, { maxEntries: 2, maxBytes: 0xffff_ffff });
    await writeText(fs, "a.json", "{}");
    await writeText(fs, "b.json", "{}");
    await writeText(fs, "c.json", '{"c":1}'); // 3rd entry — past the injected ceiling — no refusal
    await writeText(fs, "d.json", '{"d":1}');
    await fs.finish();
    // fflate's OWN unzipSync (the reader ZipFilesystem.fromZip is built on) must parse the Zip64 EOCD.
    const out = unzipSync(c.bytes());
    expect(Object.keys(out)).toHaveLength(4);
    expect(new TextDecoder().decode(out["c.json"]!)).toBe('{"c":1}');
    expect(new TextDecoder().decode(out["d.json"]!)).toBe('{"d":1}');
  });

  // The real acceptance criterion (Archie-1cf0): the 65,535-entry classic-ZIP ceiling is gone at
  // PRODUCTION scale, not just under an injected tiny limit — and the result is readable back through
  // the repo's own untrusted-open path (ZipFilesystem.fromZip / the Filesystem seam), not merely by
  // fflate's raw unzipSync. 66,001 tiny entries is cheap in CI; a >4 GiB archive is not (that dimension
  // is documented, not tested here — see the byte-cap test above and zip.ts's ZIP_FORMAT_LIMITS doc).
  it("Archie-1cf0: 66,001 entries — past the classic 65,535 cap for real — round-trip via ZipFilesystem.fromZip", async () => {
    const c = collector();
    const fs = new ZipStreamFilesystem(c.sink); // production ZIP_FORMAT_LIMITS — the real 65,535 threshold
    const N = 66_001;
    for (let i = 0; i < N; i++) await writeText(fs, `f${i}.json`, "{}");
    await fs.finish();

    const raw = unzipSync(c.bytes());
    expect(Object.keys(raw)).toHaveLength(N);

    const reopened = ZipFilesystem.fromZip(c.bytes());
    const root = await reopened.root();
    let count = 0;
    for await (const _entry of root.entries()) count++;
    expect(count).toBe(N); // every entry survives the repo's own open path, not just fflate's raw reader

    for (const i of [0, 33_000, N - 1]) {
      const f = await root.getFile(`f${i}.json`);
      expect(new TextDecoder().decode(new Uint8Array(await f.readable()))).toBe("{}");
    }
  }, 30_000);

  // Format guard (ZIP_FORMAT_LIMITS), BYTE dimension — Archie-1cf0. Past `limits.maxBytes`, an entry's
  // own size OR its local-header offset now gets a per-entry Zip64 extra field (buildCentralDirectoryEntry)
  // instead of a refusal — see zip-stream.ts's module doc for why fflate's writer had to be replaced
  // entirely (not just intercepted) to make this possible. `limits.maxBytes` is injected tiny so BOTH
  // axes trip cheaply: `m0` alone exceeds it (entry-size Zip64), and `m1`'s offset (after m0) also
  // exceeds it (offset Zip64) — a real-scale proof (a genuine >4 GiB archive) is NOT run here (see the
  // module doc's note on fflate's OWN 32-bit zip64-record-offset read — Info-ZIP `unzip -t` and Python
  // `zipfile` are the only readers that can verify that scale; recorded as a one-off manual run, not a
  // CI test, in the ticket note).
  it("format guard: bytes past maxBytes switch to Zip64 (entry size AND offset) instead of refusing, and round-trip", async () => {
    const c = collector();
    const fs = new ZipStreamFilesystem(c.sink, { maxEntries: 65_535, maxBytes: 500 });
    const m0 = new Uint8Array(600).map((_, i) => i & 0xff); // own size (600) > 500 — entry-size Zip64
    await writeBin(fs, "ex/assets/m0.bin", m0);
    const m1 = new Uint8Array(50).map((_, i) => (i * 3 + 1) & 0xff); // small itself, but its OFFSET
    await writeBin(fs, "ex/assets/m1.bin", m1); // (after m0's local header + 600B) exceeds 500 — offset Zip64
    await writeText(fs, "ex/manifest.json", '{"ok":true}'); // ordinary small entry, offset also past 500
    await fs.finish();

    // fflate's own unzipSync — proves its zip64 READER (not just this writer) accepts the result.
    const raw = unzipSync(c.bytes());
    expect(Object.keys(raw)).toHaveLength(3);
    expect(Array.from(raw["ex/assets/m0.bin"]!)).toEqual(Array.from(m0));
    expect(Array.from(raw["ex/assets/m1.bin"]!)).toEqual(Array.from(m1));
    expect(new TextDecoder().decode(raw["ex/manifest.json"]!)).toBe('{"ok":true}');

    // The repo's own open path, through the full Filesystem seam.
    const reopened = ZipFilesystem.fromZip(c.bytes());
    const root = await reopened.root();
    const assets = await (await root.getDirectory("ex")).getDirectory("assets");
    expect(Array.from(new Uint8Array(await (await assets.getFile("m0.bin")).readable()))).toEqual(Array.from(m0));
    expect(Array.from(new Uint8Array(await (await assets.getFile("m1.bin")).readable()))).toEqual(Array.from(m1));
  });

  it("format guard: a full stream at the production limits is untouched (round-trips)", async () => {
    const c = collector();
    const fs = new ZipStreamFilesystem(c.sink); // default ZIP_FORMAT_LIMITS
    await writeText(fs, "ex/manifest.json", '{"ok":true}');
    await writeBin(fs, "ex/assets/m.bin", new Uint8Array(10_000));
    await fs.finish();
    expect(Object.keys(unzipSync(c.bytes()))).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------------
// Format-builder fixtures (Archie-1cf0, byte dimension). These test the byte-layout BUILDERS directly,
// against hand-computed field positions (not against a round-trip through the writer's own reader), so
// they can pin exact offsets/sentinels/extra-field bytes straddling 0xFFFFFFFF without building a real
// 4 GiB archive. Cross-checked against APPNOTE 4.5.3 field order — see the module doc in zip-stream.ts
// for the cpython/fflate source citations these positions were verified against.
// ---------------------------------------------------------------------------------------------------
describe("crc32 — IEEE 802.3 CRC-32 (Archie-1cf0)", () => {
  it("matches the canonical check value", () => {
    // The standard CRC-32 "check value" for the ASCII string "123456789" — used to validate every
    // conformant CRC-32 implementation (ISO/IEC 13239, "PKZIP"/IEEE 802.3 variant).
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("is 0 for an empty buffer", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("dosDateTime — DOS date+time packing (Archie-1cf0)", () => {
  it("packs a known date into the documented bit layout", () => {
    // 2024-03-05 13:07:44 — an arbitrary but hand-verifiable instant.
    const d = new Date(2024, 2, 5, 13, 7, 44); // month is 0-indexed in the Date ctor
    const packed = dosDateTime(d);
    const y = (packed >>> 25) & 0x7f;
    const mo = (packed >>> 21) & 0xf;
    const day = (packed >>> 16) & 0x1f;
    const h = (packed >>> 11) & 0x1f;
    const mi = (packed >>> 5) & 0x3f;
    const s2 = packed & 0x1f; // seconds / 2
    expect(y).toBe(2024 - 1980);
    expect(mo).toBe(3);
    expect(day).toBe(5);
    expect(h).toBe(13);
    expect(mi).toBe(7);
    expect(s2).toBe(44 >> 1);
  });
});

/** Decode one local-header (30B fixed + name [+ zip64 extra]) back into fields, purely by hand-coded
 *  offset reads mirroring APPNOTE 4.3.7 — an INDEPENDENT read path from `buildLocalHeader`'s own
 *  writes, so a byte-position bug in the builder can't hide behind a matching bug in the checker. */
function decodeLocalHeader(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sig = dv.getUint32(0, true);
  const versionNeeded = dv.getUint16(4, true);
  const flag = dv.getUint16(6, true);
  const compression = dv.getUint16(8, true);
  const dt = dv.getUint32(10, true);
  const crc = dv.getUint32(14, true);
  const compressedSize = dv.getUint32(18, true);
  const uncompressedSize = dv.getUint32(22, true);
  const nameLen = dv.getUint16(26, true);
  const extraLen = dv.getUint16(28, true);
  const name = new TextDecoder().decode(bytes.subarray(30, 30 + nameLen));
  const extra = bytes.subarray(30 + nameLen, 30 + nameLen + extraLen);
  return { sig, versionNeeded, flag, compression, dt, crc, compressedSize, uncompressedSize, nameLen, extraLen, name, extra };
}

describe("buildLocalHeader — Archie-1cf0 byte dimension", () => {
  it("classic path: sizes under the threshold are written as real 4-byte values, no extra", () => {
    const nameBytes = new TextEncoder().encode("a.bin");
    const h = buildLocalHeader(nameBytes, 0, 1234, 0xdeadbeef, 0x12345678, 0xffff_ffff);
    const d = decodeLocalHeader(h);
    expect(d.sig).toBe(0x04034b50);
    expect(d.versionNeeded).toBe(20);
    expect(d.flag).toBe(0);
    expect(d.compression).toBe(0);
    expect(d.dt).toBe(0x12345678);
    expect(d.crc).toBe(0xdeadbeef);
    expect(d.compressedSize).toBe(1234);
    expect(d.uncompressedSize).toBe(1234);
    expect(d.name).toBe("a.bin");
    expect(d.extraLen).toBe(0);
    expect(h.length).toBe(30 + nameBytes.length);
  });

  it("zip64 path: size AT the threshold (not just past it) is sentinelled — the >= boundary", () => {
    const nameBytes = new TextEncoder().encode("big.bin");
    const threshold = 0xffff_ffff;
    const h = buildLocalHeader(nameBytes, 0, threshold, 0, 0, threshold); // size === threshold exactly
    const d = decodeLocalHeader(h);
    expect(d.versionNeeded).toBe(45);
    expect(d.compressedSize).toBe(0xffff_ffff); // sentinel, not the real value
    expect(d.uncompressedSize).toBe(0xffff_ffff);
    expect(d.extraLen).toBe(20); // 4B header + 16B (both sizes)
    const edv = new DataView(d.extra.buffer, d.extra.byteOffset, d.extra.byteLength);
    expect(edv.getUint16(0, true)).toBe(0x0001); // zip64 extra tag
    expect(edv.getUint16(2, true)).toBe(16); // payload length
    expect(edv.getBigUint64(4, true)).toBe(BigInt(threshold)); // uncompressed size (real value)
    expect(edv.getBigUint64(12, true)).toBe(BigInt(threshold)); // compressed size (real value)
  });

  it("zip64 path: a size straddling 0xFFFFFFFF by one byte still resolves via the extra field", () => {
    const size = 0x1_0000_0005; // 4 GiB + 5 — a genuine >4GiB single-entry size
    const h = buildLocalHeader(new TextEncoder().encode("huge.bin"), 0, size, 0, 0, 0xffff_ffff);
    const d = decodeLocalHeader(h);
    expect(d.compressedSize).toBe(0xffff_ffff);
    const edv = new DataView(d.extra.buffer, d.extra.byteOffset, d.extra.byteLength);
    expect(edv.getBigUint64(4, true)).toBe(BigInt(size));
    expect(edv.getBigUint64(12, true)).toBe(BigInt(size));
  });

  it("sets the UTF-8 flag bit (0x0800) only when the name needed it — the caller's own check", () => {
    const h = buildLocalHeader(new TextEncoder().encode("a.bin"), 0x0800, 10, 0, 0, 0xffff_ffff);
    expect(decodeLocalHeader(h).flag).toBe(0x0800);
  });
});

/** Decode one central-directory entry (46B fixed + name [+ zip64 extra]) — independent hand-coded read
 *  path, same rationale as `decodeLocalHeader`. */
function decodeCdEntry(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sig = dv.getUint32(0, true);
  const versionMadeBy = dv.getUint16(4, true);
  const versionNeeded = dv.getUint16(6, true);
  const flag = dv.getUint16(8, true);
  const compression = dv.getUint16(10, true);
  const dt = dv.getUint32(12, true);
  const crc = dv.getUint32(16, true);
  const compressedSize = dv.getUint32(20, true);
  const uncompressedSize = dv.getUint32(24, true);
  const nameLen = dv.getUint16(28, true);
  const extraLen = dv.getUint16(30, true);
  const commentLen = dv.getUint16(32, true);
  const diskStart = dv.getUint16(34, true);
  const internalAttrs = dv.getUint16(36, true);
  const externalAttrs = dv.getUint32(38, true);
  const offset = dv.getUint32(42, true);
  const name = new TextDecoder().decode(bytes.subarray(46, 46 + nameLen));
  const extra = bytes.subarray(46 + nameLen, 46 + nameLen + extraLen);
  return {
    sig,
    versionMadeBy,
    versionNeeded,
    flag,
    compression,
    dt,
    crc,
    compressedSize,
    uncompressedSize,
    nameLen,
    extraLen,
    commentLen,
    diskStart,
    internalAttrs,
    externalAttrs,
    offset,
    name,
    extra,
  };
}

describe("buildCentralDirectoryEntry — Archie-1cf0 byte dimension", () => {
  const baseEntry = (over: Partial<{ size: number; offset: number }>) => ({
    nameBytes: new TextEncoder().encode("f.bin"),
    flag: 0,
    size: 100,
    crc: 0xcafef00d,
    offset: 0,
    dt: 0x87654321,
    ...over,
  });

  it("classic path: neither size nor offset overflow — no extra, real values, version 20", () => {
    const e = buildCentralDirectoryEntry(baseEntry({ size: 100, offset: 2000 }), 0xffff_ffff);
    const d = decodeCdEntry(e);
    expect(d.sig).toBe(0x02014b50);
    expect(d.versionMadeBy).toBe(20);
    expect(d.versionNeeded).toBe(20);
    expect(d.compressedSize).toBe(100);
    expect(d.uncompressedSize).toBe(100);
    expect(d.offset).toBe(2000);
    expect(d.extraLen).toBe(0);
    expect(d.commentLen).toBe(0);
    expect(d.name).toBe("f.bin");
  });

  it("offset-only overflow: size stays real, offset sentinelled, extra carries ONLY the offset (8B payload)", () => {
    const offset = 0x1_0000_0000; // exactly 4 GiB — realistic shape: many small entries, huge cumulative offset
    const e = buildCentralDirectoryEntry(baseEntry({ size: 100, offset }), 0xffff_ffff);
    const d = decodeCdEntry(e);
    expect(d.versionNeeded).toBe(45);
    expect(d.compressedSize).toBe(100); // NOT sentinelled — size fits
    expect(d.uncompressedSize).toBe(100);
    expect(d.offset).toBe(0xffff_ffff); // sentinelled
    expect(d.extraLen).toBe(12); // 4B header + 8B (offset only)
    const edv = new DataView(d.extra.buffer, d.extra.byteOffset, d.extra.byteLength);
    expect(edv.getUint16(0, true)).toBe(0x0001);
    expect(edv.getUint16(2, true)).toBe(8); // payload length — offset ALONE, no size fields ahead of it
    expect(edv.getBigUint64(4, true)).toBe(BigInt(offset)); // at position 0 of the payload, not position 16
  });

  it("size-only overflow: offset stays real, size sentinelled, extra carries uncompressed+compressed (16B)", () => {
    const size = 0x1_0000_0064; // 4 GiB + 100
    const e = buildCentralDirectoryEntry(baseEntry({ size, offset: 500 }), 0xffff_ffff);
    const d = decodeCdEntry(e);
    expect(d.compressedSize).toBe(0xffff_ffff);
    expect(d.uncompressedSize).toBe(0xffff_ffff);
    expect(d.offset).toBe(500); // NOT sentinelled
    expect(d.extraLen).toBe(20); // 4B header + 16B (both sizes)
    const edv = new DataView(d.extra.buffer, d.extra.byteOffset, d.extra.byteLength);
    expect(edv.getUint16(2, true)).toBe(16);
    expect(edv.getBigUint64(4, true)).toBe(BigInt(size)); // uncompressed at position 0
    expect(edv.getBigUint64(12, true)).toBe(BigInt(size)); // compressed at position 8
  });

  it("both overflow: extra carries [uncompressed, compressed, offset] in that fixed order (24B)", () => {
    const size = 0x2_0000_0000;
    const offset = 0x3_0000_0000;
    const e = buildCentralDirectoryEntry(baseEntry({ size, offset }), 0xffff_ffff);
    const d = decodeCdEntry(e);
    expect(d.compressedSize).toBe(0xffff_ffff);
    expect(d.uncompressedSize).toBe(0xffff_ffff);
    expect(d.offset).toBe(0xffff_ffff);
    expect(d.extraLen).toBe(28); // 4B header + 24B (both sizes + offset)
    const edv = new DataView(d.extra.buffer, d.extra.byteOffset, d.extra.byteLength);
    expect(edv.getUint16(2, true)).toBe(24);
    expect(edv.getBigUint64(4, true)).toBe(BigInt(size)); // uncompressed
    expect(edv.getBigUint64(12, true)).toBe(BigInt(size)); // compressed
    expect(edv.getBigUint64(20, true)).toBe(BigInt(offset)); // offset — AFTER both size fields
  });

  it("the >= boundary: a value EQUAL to the sentinel is treated as overflowing, not as fitting", () => {
    const e = buildCentralDirectoryEntry(baseEntry({ size: 100, offset: 0xffff_ffff }), 0xffff_ffff);
    const d = decodeCdEntry(e);
    expect(d.offset).toBe(0xffff_ffff); // sentinel value — MUST have gone via the extra, not "coincidentally correct"
    expect(d.extraLen).toBe(12);
    const edv = new DataView(d.extra.buffer, d.extra.byteOffset, d.extra.byteLength);
    expect(edv.getBigUint64(4, true)).toBe(0xffff_ffffn);
  });
});

/** Decode the trailing block's classic EOCD (last 22 bytes) and, when present, the Zip64 EOCD Record +
 *  Locator ahead of it — independent hand-coded read path. */
function decodeEocdTail(bytes: Uint8Array) {
  const classicOffset = bytes.length - 22;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const classic = {
    sig: dv.getUint32(classicOffset, true),
    entriesThisDisk: dv.getUint16(classicOffset + 8, true),
    entriesTotal: dv.getUint16(classicOffset + 10, true),
    cdSize: dv.getUint32(classicOffset + 12, true),
    cdOffset: dv.getUint32(classicOffset + 16, true),
  };
  if (bytes.length === 22) return { classic, zip64: undefined };
  const recordOffset = 0; // record always comes first when present
  const locatorOffset = 56;
  const zip64 = {
    recordSig: dv.getUint32(recordOffset, true),
    entriesThisDisk: dv.getBigUint64(recordOffset + 24, true),
    entriesTotal: dv.getBigUint64(recordOffset + 32, true),
    cdSize: dv.getBigUint64(recordOffset + 40, true),
    cdOffset: dv.getBigUint64(recordOffset + 48, true),
    locatorSig: dv.getUint32(locatorOffset, true),
    locatorRecordOffset: dv.getBigUint64(locatorOffset + 8, true),
  };
  return { classic, zip64 };
}

describe("buildEocdTail — Archie-1cf0 byte dimension (bytes-triggered zip64, independent of entries)", () => {
  it("classic path: small entries/cdSize/cdOffset — no zip64 block at all", () => {
    const out = buildEocdTail(3, 200, 1000, 65_535, 0xffff_ffff);
    expect(out.length).toBe(22);
    const d = decodeEocdTail(out);
    expect(d.classic.entriesTotal).toBe(3);
    expect(d.classic.cdSize).toBe(200);
    expect(d.classic.cdOffset).toBe(1000);
    expect(d.zip64).toBeUndefined();
  });

  it("cdOffset alone past the threshold triggers zip64, even with entries and cdSize both small", () => {
    const cdOffset = 0x1_0000_0000; // 4 GiB
    const out = buildEocdTail(3, 200, cdOffset, 65_535, 0xffff_ffff);
    const d = decodeEocdTail(out);
    expect(d.classic.entriesTotal).toBe(0xffff); // sentinelled TOGETHER once useZip64 is true
    expect(d.classic.cdSize).toBe(200); // cdSize alone still fits — NOT sentinelled (independent axis)
    expect(d.classic.cdOffset).toBe(0xffff_ffff); // sentinelled
    expect(d.zip64).toBeDefined();
    expect(d.zip64!.recordSig).toBe(0x06064b50);
    expect(d.zip64!.locatorSig).toBe(0x07064b50);
    expect(d.zip64!.entriesTotal).toBe(3n);
    expect(d.zip64!.cdSize).toBe(200n);
    expect(d.zip64!.cdOffset).toBe(BigInt(cdOffset));
    expect(d.zip64!.locatorRecordOffset).toBe(BigInt(cdOffset) + 200n); // record sits right after the CD
  });

  it("entries alone past maxClassicEntries still forces zip64, with cdOffset staying a real small value", () => {
    const out = buildEocdTail(70_000, 500, 3000, 65_535, 0xffff_ffff);
    const d = decodeEocdTail(out);
    expect(d.classic.cdOffset).toBe(3000); // real value — cdOffset itself never overflowed
    expect(d.zip64!.entriesTotal).toBe(70_000n); // the true count lives in the zip64 record
  });

  it("the >= boundary: cdOffset EQUAL to the sentinel is treated as overflowing", () => {
    const out = buildEocdTail(1, 10, 0xffff_ffff, 65_535, 0xffff_ffff);
    const d = decodeEocdTail(out);
    expect(d.classic.cdOffset).toBe(0xffff_ffff);
    expect(d.zip64).toBeDefined();
    expect(d.zip64!.cdOffset).toBe(0xffff_ffffn);
  });
});
