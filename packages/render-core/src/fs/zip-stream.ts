// ZipStreamFilesystem — a WRITE-THROUGH streaming `.archie.zip` sink (SCALE LARGE-MEDIA-MEMORY-CEILING
// A). Implements the `Filesystem` seam like `ZipFilesystem`, but instead of assembling the whole
// published tree into an in-memory Map and serializing afterward, it feeds each file's bytes into an
// fflate streaming `Zip` as the file CLOSES and releases the media bytes immediately. On a Chromium
// `showSaveFilePicker` handle the chunks go straight to disk, so a full-media export runs in bounded
// memory — the ~10 GB of masters/thumbnails/DZI tiles never accumulates.
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

import { Zip, ZipPassThrough, strToU8 } from "fflate";
import type { Filesystem, FsDirectory, FsFile, FsWritable } from "./seam.js";
import { ZIP_FORMAT_LIMITS, zipFormatError, type ZipFormatLimits, type ZipSink } from "./zip.js";

function join(prefix: string, name: string): string {
  return prefix === "" ? name : `${prefix}/${name}`;
}

const EOCD_SIG = 0x06054b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;

/**
 * Rebuild the archive's TRAILING block ourselves (Archie-1cf0) — the classic End Of Central Directory
 * record, preceded by a Zip64 EOCD Record + Locator once `entries` passes `maxClassicEntries`.
 *
 * fflate's own EOCD writer (`wzf`, traced in fflate 0.8.2) stores the entry count in an UNCHECKED
 * 2-byte field: past 65,535 entries the byte-by-byte `wbytes` write for the count spills into the
 * ADJACENT central-directory-size field, corrupting it too. We never read or trust fflate's own EOCD
 * bytes for this reason — `cdOffset`/`cdSize` are values WE tracked independently (bytes emitted
 * before this final chunk, and this chunk's own length), never parsed back out of fflate's tail.
 *
 * SCOPE: only the ENTRY-COUNT dimension of Zip64 is implemented here. Total archive bytes stay capped
 * at `ZIP_FORMAT_LIMITS.maxBytes` (4 GiB, enforced in `commit()` below) — fflate's per-entry local/
 * central-directory header offset fields are still classic 4-byte, so representing an offset PAST
 * 4 GiB needs a per-entry Zip64 extra field, which this does not add. See zip.ts's `ZIP_FORMAT_LIMITS`
 * doc for the citation and the decision to defer that dimension.
 */
function buildEocdTail(entries: number, cdSize: number, cdOffset: number, maxClassicEntries: number): Uint8Array {
  const useZip64 = entries > maxClassicEntries;
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
  // 0xFFFF sentinel (APPNOTE 4.4.4/4.4.21) tells a reader (incl. fflate's own unzipSync) to consult the
  // zip64 record instead — cdSize/cdOffset stay REAL 4-byte values, not sentinelled: the byte-size cap
  // above keeps them representable, and a real value here is spec-legal either way (only a field that
  // is actually too small MUST be sentinelled — APPNOTE 4.4.1.4).
  dv.setUint16(o, useZip64 ? 0xffff : entries, true); // entries on this disk
  o += 2;
  dv.setUint16(o, useZip64 ? 0xffff : entries, true); // total entries
  o += 2;
  dv.setUint32(o, cdSize, true); // size of the central directory
  o += 4;
  dv.setUint32(o, cdOffset, true); // offset of the central directory's start
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

/** The shared, mutable core: the fflate stream, the serialization queue, and the read-back surface. */
class StreamState {
  /** Read-back surface — text-written (structural) files only. Bounded by structural size. */
  readonly structural = new Map<string, Uint8Array>();
  private readonly zip: Zip;
  private readonly outbox: Uint8Array[] = [];
  private streamErr: Error | undefined;
  /** Serializes concurrent commits: each awaits the previous, so entries never interleave. */
  private tail: Promise<void> = Promise.resolve();
  /** Format-guard counters (`ZIP_FORMAT_LIMITS`): entries committed, bytes emitted into the archive. */
  private entries = 0;
  private written = 0;

  constructor(
    private readonly sink: ZipSink,
    private readonly limits: ZipFormatLimits = ZIP_FORMAT_LIMITS,
  ) {
    this.zip = new Zip((err, chunk, final) => {
      if (err) {
        this.streamErr = err;
        return;
      }
      if (!chunk) return;
      if (final) {
        // fflate's own trailing block: [central directory entries][classic 22-byte EOCD]. Rebuild the
        // EOCD ourselves (Archie-1cf0) from values WE tracked — `written` (bytes emitted so far = the
        // central directory's offset) and this chunk's own length (minus the 22-byte EOCD = the
        // central directory's size) — never from fflate's own count field, which silently corrupts an
        // adjacent field past 65,535 entries. See `buildEocdTail`.
        const cdOffset = this.written;
        const cdSize = chunk.length - 22;
        const cd = chunk.subarray(0, cdSize); // fflate's central-directory ENTRIES are unaffected by
        // the count-overflow (only the trailing EOCD references the count) — kept as-is.
        const tail = buildEocdTail(this.entries, cdSize, cdOffset, this.limits.maxEntries);
        this.written += cd.length + tail.length;
        this.outbox.push(cd, tail);
        return;
      }
      if (!chunk.length) return;
      this.written += chunk.length;
      this.outbox.push(chunk);
    });
  }

  /**
   * Commit ONE entry into the archive. Chained onto `tail` so — even under concurrent `close()` calls
   * — exactly one file is added→pushed→drained at a time: `ZipPassThrough` emits its whole entry
   * synchronously during `push(final)` (so no other entry can be mid-emission), and the drain awaits
   * the sink before the next commit runs. Resolves once this entry has been written to the sink.
   *
   * Format guard (Archie-1cf0): fflate's writer has NO overflow checks (see `ZIP_FORMAT_LIMITS`). Past
   * `limits.maxEntries` the archive switches to Zip64 (`buildEocdTail`, at `finish()`) rather than
   * refusing — that dimension has no cap here anymore. The BYTE dimension is still refused: once
   * `written` exceeds `limits.maxBytes`, this and every later entry's central-directory offset would
   * need a per-entry Zip64 extra field this sink does not write (checked AFTER emission, since only
   * then is the true total known).
   */
  commit(path: string, bytes: Uint8Array): Promise<void> {
    const run = this.tail.then(async () => {
      if (this.streamErr) throw this.streamErr;
      this.entries++;
      const entry = new ZipPassThrough(path);
      this.zip.add(entry);
      entry.push(bytes, true); // synchronous for ZipPassThrough → this entry's chunks are now in outbox
      await this.drain();
      if (this.streamErr) throw this.streamErr;
      if (this.written > this.limits.maxBytes) throw zipFormatError("bytes", this.limits);
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
    if (this.streamErr) throw this.streamErr;
    this.zip.end(); // central directory (the zip footer)
    await this.drain();
    if (this.streamErr) throw this.streamErr;
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
