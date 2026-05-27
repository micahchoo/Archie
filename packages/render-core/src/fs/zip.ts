// ZipFilesystem — the DownloadFilesystem core (ADR-0003 storage / Q-5; UX-Q2). Backs the
// Filesystem seam over an in-memory flat file tree, serializable to/from a `.archie.zip`
// (fflate). On non-Chromium the zip IS the canonical file: explicit Save = download the zip,
// Open = pick it (the "Word-doc 2003" model). Directories are implicit (zip path prefixes).

import { zipSync, unzipSync, strToU8, Zip, ZipPassThrough } from "fflate";
import type { Filesystem, FsDirectory, FsFile, FsWritable } from "./seam.js";

/** A chunk sink for streaming serialization (A.1). Mirrors the slice of FileSystemWritableFileStream
 *  we need; `write` may be async (the browser sink awaits disk) and is drained serially. */
export interface ZipSink {
  write(chunk: Uint8Array): void | Promise<void>;
  close(): void | Promise<void>;
}

class ZipStore {
  readonly files = new Map<string, Uint8Array>();
}

function join(prefix: string, name: string): string {
  return prefix === "" ? name : `${prefix}/${name}`;
}

class ZipFile implements FsFile {
  constructor(
    private readonly store: ZipStore,
    private readonly path: string,
    public readonly name: string,
  ) {}
  async readable(): Promise<ArrayBuffer> {
    const bytes = this.store.files.get(this.path);
    if (bytes === undefined) throw new Error(`no such file: ${this.path}`);
    return bytes.slice().buffer;
  }
  async writable(): Promise<FsWritable> {
    let buf = new Uint8Array(0);
    return {
      write: async (data) => {
        if (typeof data === "string") buf = strToU8(data);
        else if (data instanceof ArrayBuffer) buf = new Uint8Array(data);
        else buf = new Uint8Array(await data.arrayBuffer());
      },
      close: async () => {
        this.store.files.set(this.path, buf);
      },
    };
  }
  async getFile(): Promise<File> {
    const bytes = this.store.files.get(this.path) ?? new Uint8Array(0);
    return new File([bytes.slice()], this.name);
  }
}

class ZipDir implements FsDirectory {
  constructor(
    private readonly store: ZipStore,
    private readonly prefix: string,
  ) {}
  async getDirectory(name: string, opts?: { create?: boolean }): Promise<FsDirectory> {
    const p = join(this.prefix, name);
    if (opts?.create !== true) {
      const exists = [...this.store.files.keys()].some((k) => k === p || k.startsWith(`${p}/`));
      if (!exists) throw new Error(`no such directory: ${name}`);
    }
    return new ZipDir(this.store, p);
  }
  async getFile(name: string, opts?: { create?: boolean }): Promise<FsFile> {
    const p = join(this.prefix, name);
    if (!this.store.files.has(p)) {
      if (opts?.create !== true) throw new Error(`no such file: ${name}`);
      this.store.files.set(p, new Uint8Array(0));
    }
    return new ZipFile(this.store, p, name);
  }
  async remove(name: string): Promise<void> {
    const p = join(this.prefix, name);
    this.store.files.delete(p);
    for (const k of [...this.store.files.keys()]) if (k.startsWith(`${p}/`)) this.store.files.delete(k);
  }
  async *entries(): AsyncIterable<{ name: string; kind: "file" | "directory" }> {
    const pre = this.prefix === "" ? "" : `${this.prefix}/`;
    const seen = new Set<string>();
    for (const k of this.store.files.keys()) {
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

export class ZipFilesystem implements Filesystem {
  private readonly store = new ZipStore();
  async root(): Promise<FsDirectory> {
    return new ZipDir(this.store, "");
  }
  /** Serialize the whole tree to a zip (the canonical `.archie.zip` to download on Save). */
  toZip(): Uint8Array {
    const data: Record<string, Uint8Array> = {};
    for (const [k, v] of this.store.files) data[k] = v;
    return zipSync(data);
  }

  /**
   * Stream the tree to `sink` chunk-by-chunk (A.1 — LARGE-MEDIA-MEMORY-CEILING #3). Unlike `toZip()`
   * (zipSync builds the WHOLE archive as a 2nd full copy in memory), the archive never fully
   * materializes here — on a Chromium `FileSystemWritableFileStream` the chunks go straight to disk,
   * dropping peak from ≈2× to ≈1×. SCOPE: this removes the zip-output copy only; the in-memory file
   * Map still holds the published tree until A.3 (OPFS→sink stream). Files are STORED, not deflated
   * (`ZipPassThrough`): published media is already compressed, and store is synchronous + ordered so
   * the output is deterministic — a JSON-heavy library will produce a slightly larger zip than
   * `toZip()`'s deflate, the accepted v1.1 tradeoff. Backpressure: chunks are drained SERIALLY (each
   * `sink.write` awaited before the next file is added) so a slow disk sink can't queue the whole
   * archive back into RAM — which would defeat the purpose. Throws if fflate reports an error.
   */
  async streamZip(sink: ZipSink): Promise<void> {
    const queue: Uint8Array[] = [];
    let streamErr: Error | undefined;
    const zip = new Zip((err, chunk) => {
      if (err) streamErr = err;
      else if (chunk.length) queue.push(chunk);
    });
    const drain = async (): Promise<void> => {
      while (queue.length) await sink.write(queue.shift()!);
    };
    for (const [path, bytes] of this.store.files) {
      if (streamErr) throw streamErr;
      const file = new ZipPassThrough(path);
      zip.add(file);
      file.push(bytes, true); // one chunk per file; per-file multi-chunk streaming is A.3 scope
      await drain();
    }
    zip.end(); // emits the central directory (the zip footer)
    if (streamErr) throw streamErr;
    await drain();
    await sink.close();
  }
  /** Load a ZipFilesystem from `.archie.zip` bytes (the Open flow). */
  static fromZip(bytes: Uint8Array): ZipFilesystem {
    const fs = new ZipFilesystem();
    const unzipped = unzipSync(bytes);
    for (const [k, v] of Object.entries(unzipped)) fs.store.files.set(k, v);
    return fs;
  }
}
