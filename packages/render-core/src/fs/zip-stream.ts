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
    this.zip = new Zip((err, chunk) => {
      if (err) this.streamErr = err;
      else if (chunk && chunk.length) {
        this.written += chunk.length;
        this.outbox.push(chunk);
      }
    });
  }

  /**
   * Commit ONE entry into the archive. Chained onto `tail` so — even under concurrent `close()` calls
   * — exactly one file is added→pushed→drained at a time: `ZipPassThrough` emits its whole entry
   * synchronously during `push(final)` (so no other entry can be mid-emission), and the drain awaits
   * the sink before the next commit runs. Resolves once this entry has been written to the sink.
   *
   * Format guard: fflate's writer has NO overflow checks (see `ZIP_FORMAT_LIMITS`), so refuse — with
   * the actionable steer — the entry that would breach the 2-byte entry count, and the archive whose
   * emitted bytes have overflowed a 4-byte offset (checked AFTER emission: once `written` exceeds the
   * ceiling, this and every later entry's central-directory offset is already unrepresentable).
   */
  commit(path: string, bytes: Uint8Array): Promise<void> {
    const run = this.tail.then(async () => {
      if (this.streamErr) throw this.streamErr;
      if (this.entries >= this.limits.maxEntries) throw zipFormatError("entries", this.limits);
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
