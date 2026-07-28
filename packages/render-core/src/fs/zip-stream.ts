// ZipStreamFilesystem — a WRITE-THROUGH streaming `.archie.zip` sink (SCALE LARGE-MEDIA-MEMORY-CEILING
// A). Implements the `Filesystem` seam like `ZipFilesystem`, but instead of assembling the whole
// published tree into an in-memory Map and serializing afterward, it hand-writes each file's local
// header + bytes into the archive as the file CLOSES and releases the media bytes immediately (Archie-
// 1cf0: no zip library is used for the streaming encoder itself — see the format-builders doc below for
// why). On a Chromium `showSaveFilePicker` handle the chunks go straight to disk, so a full-media export
// runs in bounded memory — the ~10 GB of masters/thumbnails/DZI tiles never accumulates.
//
// Why a retained side-map at all: the publish pass READS SOME FILES BACK mid-run — `buildImageIndex`
// reads every `{slug}/manifest.json` after the write loop (site.ts). A pure write-only sink would
// return "absent" for those and silently drop the Gallery image index. The split that makes this safe
// AND bounded is by WRITE KIND, not by path (path-coupling would be fragile):
//   • STRUCTURAL files are written as STRINGS (`writeJson`/`writeText` → JSON/HTML) — small, and the
//     only thing ever read back. Retained in `structural` so read-back works; bounded by structural
//     size, INDEPENDENT of media volume.
//   • MEDIA is written as `Blob`/`ArrayBuffer` (masters, baked thumbnails, tiles, originals) — large
//     and never read back. Streamed into the archive and released; nothing keeps a reference.
//
// Concurrency: a sibling change makes `publishLibrary`'s writes CONCURRENT (bounded fan-out across
// exhibits/objects). Commits are serialized internally through a `tail` promise chain so entries never
// interleave in the stream — each entry's bytes are contiguous — while any number of writers may close
// concurrently. Each `close()` resolves only once its entry has drained to the sink, which both bounds
// memory (a slow disk can't queue the whole archive back into RAM) and provides natural backpressure.

import { strToU8 } from "fflate";
import type { Filesystem, FsDirectory, FsFile, FsWritable } from "./seam.js";
import { ZIP_FORMAT_LIMITS, type ZipFormatLimits, type ZipSink } from "./zip.js";

function join(prefix: string, name: string): string {
  return prefix === "" ? name : `${prefix}/${name}`;
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const ZIP64_EXTRA_TAG = 0x0001;

/**
 * Archie-1cf0, BYTE dimension. fflate's writer is NOT used at all in this file (below) — traced (fflate
 * 0.8.3 `esm/index.mjs`) and found insufficient even as an intercept:
 *
 *  - `wzh` (`:1893-1931`, called from `Zip.prototype.e` at `:2190` — the SAME "final" chunk this module
 *    used to intercept) writes the CENTRAL DIRECTORY entry's local-header-OFFSET field via
 *    `wbytes(d, b+10, ce)` (`:1916`). `wbytes` (`:980-983`) does `d[b]=v; v>>>=8` in a loop — `>>>=`
 *    performs ToUint32 on its LHS BEFORE shifting, so any `ce` (offset) ≥ 2**32 is silently truncated
 *    mod 2**32 in the WRITTEN BYTES. This is INSIDE the central-directory bytes the old intercept
 *    treated as "unaffected, kept as-is" (true only for the entries-count dimension) — so patching only
 *    the trailing EOCD, as the entries-dimension fix did, is NOT sufficient once total archive bytes
 *    cross 4 GiB: every entry whose local header lands past that point gets a corrupted CD offset field.
 *  - Per-entry SIZES have the same exposure a level earlier: `Zip.prototype.add`'s streaming mode uses a
 *    DATA DESCRIPTOR (general-purpose bit 3) — a 16-byte block written via `wbytes(dd, 8, cl_1)` /
 *    `wbytes(dd, 12, file.size)` (`:2141-2142`) for a SINGLE entry's own compressed/uncompressed size —
 *    and that block is flushed to the sink as an ordinary (non-"final") chunk, DURING that entry's own
 *    commit, before finalization. A finalize-time intercept has no way to fix bytes already on the wire.
 *
 * Since `commit()` below already has each entry's COMPLETE bytes in hand before touching the sink (this
 * is a streaming SINK over a SEQUENCE of files, not sub-file streaming), sizes and CRC are known upfront
 * — so this writer needs no data descriptor at all, sidestepping that corruption class entirely rather
 * than working around it. Local headers, the central directory, and this trailing block are hand-written
 * directly from APPNOTE 4.5.3, using ONLY offset/size/crc values this module tracked itself.
 *
 * Byte layout for every builder below was checked against TWO independent readers' source, not just the
 * spec text: cpython 3.14 `Lib/zipfile/__init__.py` (`structCentralDir`/`structFileHeader` field order,
 * `_decodeExtra:578-621` for the CONDITIONAL/sparse zip64-extra parsing this module relies on: a central
 * directory zip64 extra may carry ONLY the fields whose fixed 0xFFFFFFFF sentinel is set, in the fixed
 * order [uncompressed size, compressed size, offset] — e.g. offset alone, with no size fields, when only
 * offset overflows), and fflate 0.8.3's own zip64 READER (`z64hs`/`zh`, `:1853-1878`), which parses the
 * identical sparse-extra shape the same way.
 *
 * ONE READER-SIDE LIMITATION found in the process, load-bearing for how this is tested (see
 * `zip-stream.test.ts`): fflate's `unzipSync` locates the Zip64 EOCD record via
 * `b4(data, e - 12)` (`:2684`, a 32-bit read) even though APPNOTE 4.3.15 defines that Locator field as
 * 8 bytes. Past a true 4 GiB `cdOffset`, that read truncates and fflate's OWN reader (and therefore
 * `ZipFilesystem.fromZip`, which is built on it) silently falls back to the classic EOCD's sentinelled,
 * unusable fields — a bug in fflate's zip64 READ support, not in this writer. Python's
 * `structEndArchive64Locator = "<4sLQL"` reads the same field as a genuine 8-byte `Q`, so it does not
 * share this blind spot. Practical effect: a real archive whose central directory starts past 4 GiB can
 * only be verified by readers OTHER than fflate (Python `zipfile`, Info-ZIP `unzip`) — see the test file
 * for how the injected-tiny-threshold tests stay under this ceiling on purpose, so all four readers
 * (including fflate's own) can still validate them.
 */

/** IEEE 802.3 CRC-32 (the zip/gzip standard) — single-shot, since every entry here is a fully-
 *  materialized `Uint8Array` at commit time (no incremental/streaming variant is needed). Verified
 *  against the canonical check value in the test file: `crc32(ascii "123456789") === 0xcbf43926`. */
let crc32Table: Uint32Array | undefined;
function getCrc32Table(): Uint32Array {
  if (crc32Table) return crc32Table;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  crc32Table = t;
  return t;
}
export function crc32(bytes: Uint8Array): number {
  const t = getCrc32Table();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS date+time, packed into one 32-bit field (APPNOTE 4.4.6) — mirrors fflate's own packing formula
 *  (`esm/index.mjs:1902-1905`) exactly, but CLAMPS rather than throwing: this timestamp is synthetic
 *  (archive-generation time, not user input), so a value outside the DOS year range (1980-2099) should
 *  degrade, not abort a publish. */
export function dosDateTime(d: Date): number {
  const y = Math.max(0, Math.min(119, d.getFullYear() - 1980));
  return (
    ((y << 25) |
      ((d.getMonth() + 1) << 21) |
      (d.getDate() << 16) |
      (d.getHours() << 11) |
      (d.getMinutes() << 5) |
      (d.getSeconds() >> 1)) >>>
    0
  );
}

/** UTF-8-encode a zip entry name and report whether the general-purpose UTF-8 flag (bit 11, 0x0800)
 *  is needed — the same check fflate's own writer uses (`fl_1 != file.filename.length`, `:2091`). */
function nameAndFlag(path: string): { readonly nameBytes: Uint8Array; readonly flag: number } {
  const nameBytes = strToU8(path);
  return { nameBytes, flag: nameBytes.length !== path.length ? 0x0800 : 0 };
}

/** One committed entry's tracked metadata — everything the central directory needs, independent of
 *  anything fflate (or any library) computed, per the module doc's corruption trace above. */
interface CdEntry {
  readonly nameBytes: Uint8Array;
  readonly flag: number;
  readonly size: number;
  readonly crc: number;
  readonly offset: number;
  readonly dt: number;
}

/**
 * Local file header for one STORED entry (APPNOTE 4.3.7 — 30 fixed bytes + name [+ Zip64 extra]).
 * Sizes/CRC are real, known-upfront values — general-purpose bit 3 (data descriptor) is never set, so
 * there is no per-entry corruption surface to route around (see module doc). Past `threshold` this
 * entry's OWN size needs Zip64: both fixed size fields are sentinelled to 0xFFFFFFFF and a 16-byte
 * Zip64 extra (tag 0x0001) carries the true 8-byte values — the LOCAL-header form of this extra always
 * carries BOTH sizes together (never sparse), per cpython's `ZipInfo.FileHeader` (`:543-549`, unpacks
 * `'<HHQQ'` unconditionally once `zip64`). `>=` (not `>`) so a real size that happens to equal the
 * sentinel value itself is never mistaken for "fits".
 */
export function buildLocalHeader(
  nameBytes: Uint8Array,
  flag: number,
  size: number,
  crc: number,
  dt: number,
  threshold: number,
): Uint8Array {
  const useZip64 = size >= threshold;
  const extraLen = useZip64 ? 20 : 0; // 4B header (tag+len) + 16B payload (uncompressed + compressed)
  const out = new Uint8Array(30 + nameBytes.length + extraLen);
  const dv = new DataView(out.buffer);
  let o = 0;
  dv.setUint32(o, LOCAL_SIG, true);
  o += 4;
  dv.setUint16(o, useZip64 ? 45 : 20, true); // version needed to extract
  o += 2;
  dv.setUint16(o, flag, true);
  o += 2;
  dv.setUint16(o, 0, true); // compression method: stored
  o += 2;
  dv.setUint32(o, dt, true);
  o += 4;
  dv.setUint32(o, crc >>> 0, true);
  o += 4;
  dv.setUint32(o, useZip64 ? 0xffffffff : size, true); // compressed size (== size, STORED)
  o += 4;
  dv.setUint32(o, useZip64 ? 0xffffffff : size, true); // uncompressed size
  o += 4;
  dv.setUint16(o, nameBytes.length, true);
  o += 2;
  dv.setUint16(o, extraLen, true);
  o += 2;
  out.set(nameBytes, o);
  o += nameBytes.length;
  if (useZip64) {
    dv.setUint16(o, ZIP64_EXTRA_TAG, true);
    o += 2;
    dv.setUint16(o, 16, true);
    o += 2;
    dv.setBigUint64(o, BigInt(size), true); // uncompressed size
    o += 8;
    dv.setBigUint64(o, BigInt(size), true); // compressed size
    o += 8;
  }
  return out;
}

/**
 * Central-directory entry (APPNOTE 4.3.12 — 46 fixed bytes + name [+ Zip64 extra]). TWO INDEPENDENT
 * overflow axes, each sentinelled ONLY when it individually doesn't fit (APPNOTE 4.4.1.4: "only a field
 * that is actually too small MUST be sentinelled") — this entry's own SIZE (rare: one file past the
 * threshold) and its local-header OFFSET (the realistic case at library scale: total bytes ahead of this
 * entry crossed the threshold). When present, the Zip64 extra carries ONLY the overflowing fields, in
 * the fixed order [uncompressed size, compressed size, offset] — verified against cpython's
 * `_decodeExtra` (`:586-603`, reads each field CONDITIONALLY on its own fixed-field sentinel, so
 * "offset alone" with no size fields present parses correctly) and against fflate's OWN zip64 reader
 * (`z64hs`, `:1859-1877`), which does the identical conditional/positional read.
 */
export function buildCentralDirectoryEntry(e: CdEntry, threshold: number): Uint8Array {
  const sizeOverflow = e.size >= threshold;
  const offsetOverflow = e.offset >= threshold;
  const useZip64 = sizeOverflow || offsetOverflow;
  const extraPayload = (sizeOverflow ? 16 : 0) + (offsetOverflow ? 8 : 0);
  const extraLen = extraPayload ? extraPayload + 4 : 0;
  const out = new Uint8Array(46 + e.nameBytes.length + extraLen);
  const dv = new DataView(out.buffer);
  let o = 0;
  dv.setUint32(o, CENTRAL_SIG, true);
  o += 4;
  dv.setUint16(o, useZip64 ? 45 : 20, true); // version made by (low=version, high=OS=0/MS-DOS)
  o += 2;
  dv.setUint16(o, useZip64 ? 45 : 20, true); // version needed to extract
  o += 2;
  dv.setUint16(o, e.flag, true);
  o += 2;
  dv.setUint16(o, 0, true); // compression method: stored
  o += 2;
  dv.setUint32(o, e.dt, true);
  o += 4;
  dv.setUint32(o, e.crc >>> 0, true);
  o += 4;
  dv.setUint32(o, sizeOverflow ? 0xffffffff : e.size, true); // compressed size
  o += 4;
  dv.setUint32(o, sizeOverflow ? 0xffffffff : e.size, true); // uncompressed size
  o += 4;
  dv.setUint16(o, e.nameBytes.length, true);
  o += 2;
  dv.setUint16(o, extraLen, true);
  o += 2;
  dv.setUint16(o, 0, true); // comment length
  o += 2;
  dv.setUint16(o, 0, true); // disk number start
  o += 2;
  dv.setUint16(o, 0, true); // internal attributes
  o += 2;
  dv.setUint32(o, 0, true); // external attributes
  o += 4;
  dv.setUint32(o, offsetOverflow ? 0xffffffff : e.offset, true); // relative offset of local header
  o += 4;
  out.set(e.nameBytes, o);
  o += e.nameBytes.length;
  if (useZip64) {
    dv.setUint16(o, ZIP64_EXTRA_TAG, true);
    o += 2;
    dv.setUint16(o, extraPayload, true);
    o += 2;
    if (sizeOverflow) {
      dv.setBigUint64(o, BigInt(e.size), true); // uncompressed size
      o += 8;
      dv.setBigUint64(o, BigInt(e.size), true); // compressed size
      o += 8;
    }
    if (offsetOverflow) {
      dv.setBigUint64(o, BigInt(e.offset), true); // relative offset of local header
      o += 8;
    }
  }
  return out;
}

/**
 * Build the archive's TRAILING block — the classic End Of Central Directory record, preceded by a
 * Zip64 EOCD Record + Locator once EITHER dimension needs it: `entries` past `maxClassicEntries`
 * (Archie-1cf0, entries dimension, unchanged from the merged fix), or `cdSize`/`cdOffset` at or past
 * `bytesThreshold` (Archie-1cf0, bytes dimension — new: once total archive bytes ahead of the central
 * directory cross 4 GiB, the CLASSIC EOCD's 4-byte cdOffset field can no longer hold it).
 *
 * `cdSize`/`cdOffset` are sentinelled to 0xFFFFFFFF INDEPENDENTLY of what triggered `useZip64` (APPNOTE
 * 4.4.1.4's "only sentinel what doesn't fit") — even when only the entry count forced Zip64, a small
 * `cdOffset` stays a real, unambiguous value. `>=` (not `>`) for the same reason as the per-entry
 * builders: a real value equal to the sentinel must not be mistaken for representable.
 */
export function buildEocdTail(
  entries: number,
  cdSize: number,
  cdOffset: number,
  maxClassicEntries: number,
  bytesThreshold: number,
): Uint8Array {
  const cdSizeOverflow = cdSize >= bytesThreshold;
  const cdOffsetOverflow = cdOffset >= bytesThreshold;
  const useZip64 = entries > maxClassicEntries || cdSizeOverflow || cdOffsetOverflow;
  const zip64Len = useZip64 ? 56 + 20 : 0; // Zip64 EOCD Record (56B, APPNOTE 4.3.14) + Locator (20B, 4.3.15)
  const out = new Uint8Array(zip64Len + 22); // + classic EOCD (22B, APPNOTE 4.3.16)
  const dv = new DataView(out.buffer);
  let o = 0;
  if (useZip64) {
    const zip64RecordOffset = cdOffset + cdSize; // where this tail starts = where the zip64 record lands
    dv.setUint32(o, ZIP64_EOCD_SIG, true);
    o += 4;
    dv.setBigUint64(o, 44n, true); // size of this record, excluding the sig + this 8-byte field itself
    o += 8;
    dv.setUint16(o, 45, true); // version made by (4.5+, i.e. Zip64-aware)
    o += 2;
    dv.setUint16(o, 45, true); // version needed to extract
    o += 2;
    dv.setUint32(o, 0, true); // disk number
    o += 4;
    dv.setUint32(o, 0, true); // disk where the central directory starts
    o += 4;
    dv.setBigUint64(o, BigInt(entries), true); // entries on this disk
    o += 8;
    dv.setBigUint64(o, BigInt(entries), true); // total entries
    o += 8;
    dv.setBigUint64(o, BigInt(cdSize), true); // size of the central directory
    o += 8;
    dv.setBigUint64(o, BigInt(cdOffset), true); // offset of the central directory's start
    o += 8;
    dv.setUint32(o, ZIP64_LOCATOR_SIG, true);
    o += 4;
    dv.setUint32(o, 0, true); // disk holding the zip64 EOCD record
    o += 4;
    dv.setBigUint64(o, BigInt(zip64RecordOffset), true); // offset of the zip64 EOCD record
    o += 8;
    dv.setUint32(o, 1, true); // total number of disks
    o += 4;
  }
  dv.setUint32(o, EOCD_SIG, true);
  o += 4;
  dv.setUint16(o, 0, true); // disk number
  o += 2;
  dv.setUint16(o, 0, true); // disk where the central directory starts
  o += 2;
  dv.setUint16(o, useZip64 ? 0xffff : entries, true); // entries on this disk
  o += 2;
  dv.setUint16(o, useZip64 ? 0xffff : entries, true); // total entries
  o += 2;
  dv.setUint32(o, cdSizeOverflow ? 0xffffffff : cdSize, true); // size of the central directory
  o += 4;
  dv.setUint32(o, cdOffsetOverflow ? 0xffffffff : cdOffset, true); // offset of the central directory's start
  o += 4;
  dv.setUint16(o, 0, true); // comment length
  return out;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 1) return chunks[0]!;
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

/** The shared, mutable core: the hand-written zip encoder, the serialization queue, and the read-back
 *  surface. No zip library is used here (see the module doc for why) — every byte is built from
 *  offset/size/crc values this class tracks itself. */
class StreamState {
  /** Read-back surface — text-written (structural) files only. Bounded by structural size. */
  readonly structural = new Map<string, Uint8Array>();
  private readonly outbox: Uint8Array[] = [];
  /** Set once a commit's own drain rejects, so the chain fails FAST for every later commit rather than
   *  doing wasted work against a sink that has already failed. */
  private failed = false;
  /** Serializes concurrent commits: each awaits the previous, so entries never interleave. */
  private tail: Promise<void> = Promise.resolve();
  /** Central-directory metadata, one entry per commit, in commit order. */
  private readonly cdEntries: CdEntry[] = [];
  /** Bytes emitted into the archive so far — the offset of the NEXT thing written. */
  private written = 0;

  constructor(
    private readonly sink: ZipSink,
    private readonly limits: ZipFormatLimits = ZIP_FORMAT_LIMITS,
  ) {}

  /**
   * Commit ONE entry into the archive. Chained onto `tail` so — even under concurrent `close()` calls
   * — exactly one file is header→pushed→drained at a time, and the drain awaits the sink before the
   * next commit runs. Resolves once this entry has been written to the sink.
   *
   * Format guard (Archie-1cf0): entries past `limits.maxEntries`, and bytes past `limits.maxBytes` (in
   * EITHER an entry's own size or its local-header offset), switch that dimension to Zip64 rather than
   * refusing — see the module doc for why hand-writing every header is what makes this possible.
   */
  commit(path: string, bytes: Uint8Array): Promise<void> {
    const run = this.tail.then(async () => {
      if (this.failed) throw new Error("zip stream aborted after a prior write failure");
      try {
        const offset = this.written; // this entry's local header starts here
        const { nameBytes, flag } = nameAndFlag(path);
        const crc = crc32(bytes);
        const dt = dosDateTime(new Date());
        const header = buildLocalHeader(nameBytes, flag, bytes.length, crc, dt, this.limits.maxBytes);
        this.outbox.push(header, bytes);
        this.written += header.length + bytes.length;
        this.cdEntries.push({ nameBytes, flag, size: bytes.length, crc, offset, dt });
        await this.drain();
      } catch (e) {
        this.failed = true;
        throw e;
      }
    });
    // Keep the chain alive even if this link rejects (a later commit must not inherit the rejection),
    // but still surface the failure to THIS caller.
    this.tail = run.catch(() => {});
    return run;
  }

  private async drain(): Promise<void> {
    while (this.outbox.length) await this.sink.write(this.outbox.shift()!);
  }

  /** Flush all queued entries, emit the central directory, and close the sink. Call once every write
   *  has resolved (the publish pass has returned). */
  async finish(): Promise<void> {
    await this.tail; // every queued entry committed + drained
    if (this.failed) throw new Error("zip stream aborted after a prior write failure");
    const cdOffset = this.written; // content first, index LAST (render-core-data-integrity #1)
    const cd = concat(this.cdEntries.map((e) => buildCentralDirectoryEntry(e, this.limits.maxBytes)));
    const tail = buildEocdTail(this.cdEntries.length, cd.length, cdOffset, this.limits.maxEntries, this.limits.maxBytes);
    this.outbox.push(cd, tail);
    this.written += cd.length + tail.length;
    await this.drain();
    await this.sink.close();
  }
}

class StreamFile implements FsFile {
  constructor(
    private readonly state: StreamState,
    private readonly path: string,
    public readonly name: string,
  ) {}
  async readable(): Promise<ArrayBuffer> {
    const bytes = this.state.structural.get(this.path);
    // A released media file (or a path never written) reads as absent — matches ZipFilesystem's
    // "no such file" so `fsJsonSource.getOptional` classifies it absent→null (Issue 23). Only the
    // structural read-back (manifest.json &c.) is served here; media is gone from memory by design.
    if (bytes === undefined) throw new Error(`no such file: ${this.path}`);
    return bytes.slice().buffer;
  }
  async writable(): Promise<FsWritable> {
    const chunks: Uint8Array[] = [];
    let isText = true; // stays true only if EVERY chunk was a string (structural); any binary → media
    return {
      write: async (data) => {
        if (typeof data === "string") {
          chunks.push(strToU8(data));
        } else {
          isText = false;
          chunks.push(data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(await data.arrayBuffer()));
        }
      },
      close: async () => {
        const bytes = concat(chunks.length ? chunks : [new Uint8Array(0)]);
        if (isText) this.state.structural.set(this.path, bytes); // retain for read-back
        await this.state.commit(this.path, bytes); // stream into the archive (media ref released after)
      },
    };
  }
  async getFile(): Promise<File> {
    const bytes = this.state.structural.get(this.path) ?? new Uint8Array(0);
    return new File([bytes.slice()], this.name);
  }
  async size(): Promise<number> {
    // Only structural (read-back) files have a retained size; released media reads as absent → 0,
    // matching this sink's read-back-only contract.
    return this.state.structural.get(this.path)?.byteLength ?? 0;
  }
}

class StreamDir implements FsDirectory {
  constructor(
    private readonly state: StreamState,
    private readonly prefix: string,
  ) {}
  async getDirectory(name: string, opts?: { create?: boolean }): Promise<FsDirectory> {
    const p = join(this.prefix, name);
    if (opts?.create !== true) {
      // Existence is over the STRUCTURAL surface only (released media leaves no trace). The full
      // publish path only ever navigates to structural read-backs, so this is sufficient.
      const exists = [...this.state.structural.keys()].some((k) => k === p || k.startsWith(`${p}/`));
      if (!exists) throw new Error(`no such directory: ${name}`);
    }
    return new StreamDir(this.state, p);
  }
  async getFile(name: string, opts?: { create?: boolean }): Promise<FsFile> {
    const p = join(this.prefix, name);
    if (opts?.create !== true && !this.state.structural.has(p)) throw new Error(`no such file: ${name}`);
    return new StreamFile(this.state, p, name);
  }
  async remove(name: string): Promise<void> {
    // A streamed entry can't be un-written mid-stream; only the structural read-back surface can drop
    // a name. The full-publish path (the sole user of this sink) never removes — orphan pruning is a
    // FOLDER/incremental concern (`PublishOptions.removedExhibits`), never passed on the zip build.
    const p = join(this.prefix, name);
    this.state.structural.delete(p);
    for (const k of [...this.state.structural.keys()]) if (k.startsWith(`${p}/`)) this.state.structural.delete(k);
  }
  async *entries(): AsyncIterable<{ name: string; kind: "file" | "directory" }> {
    // Reflects the structural surface only (released media is gone). The full-publish path never lists.
    const pre = this.prefix === "" ? "" : `${this.prefix}/`;
    const seen = new Set<string>();
    for (const k of this.state.structural.keys()) {
      if (!k.startsWith(pre)) continue;
      const rest = k.slice(pre.length);
      const slash = rest.indexOf("/");
      if (slash === -1) {
        if (!seen.has(rest)) {
          seen.add(rest);
          yield { name: rest, kind: "file" };
        }
      } else {
        const dir = rest.slice(0, slash);
        if (!seen.has(`d:${dir}`)) {
          seen.add(`d:${dir}`);
          yield { name: dir, kind: "directory" };
        }
      }
    }
  }
}

/**
 * A `Filesystem` that streams every written file into a `.archie.zip` as it closes, holding only the
 * small structural (JSON/HTML) files in memory for read-back. Publish INTO it, then call `finish()`.
 */
export class ZipStreamFilesystem implements Filesystem {
  private readonly state: StreamState;
  /** `limits` is injectable ONLY so tests can trip the format guard cheaply — production always
   *  streams under the canonical `ZIP_FORMAT_LIMITS`. */
  constructor(sink: ZipSink, limits?: ZipFormatLimits) {
    this.state = new StreamState(sink, limits);
  }
  async root(): Promise<FsDirectory> {
    return new StreamDir(this.state, "");
  }
  /** Flush queued entries, write the central directory, and close the sink. Call after every write
   *  has resolved (the publish pass returned) — NOT before, or the archive is truncated. */
  finish(): Promise<void> {
    return this.state.finish();
  }
  /** Introspection for tests: the paths currently held in the read-back surface (structural files
   *  only). A released media file is provably absent from this list. */
  retainedPaths(): string[] {
    return [...this.state.structural.keys()];
  }
}
