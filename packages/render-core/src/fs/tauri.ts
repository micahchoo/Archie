// TauriFilesystem — the Tauri desktop backend behind the Filesystem seam (ADR-0003 storage / Q-5).
// The desktop analogue of FsaFilesystem: a native folder on disk is the canonical store, written
// in place. Tauri's webview is Chromium only on Windows (WKWebView/WebKitGTK elsewhere), so the
// FSA + OPFS paths are unreliable under it; this single native backend behaves identically on all
// three OSes and replaces the whole capability dance (see fs/binding.ts) when running under Tauri.
//
// Like memory.ts / fsa.ts this stays PURE and headless: it talks to a small injected `TauriFsBridge`
// (path-based — a structural subset of @tauri-apps/plugin-fs) rather than importing the plugin. That
// keeps render-core dependency-free and lets the conformance suite prove the path/dir/file logic in
// Node CI (bind the bridge to node:fs) without a Rust toolchain. The real plugin-fs binding is a
// 1:1 adapter and lives in the app (apps/studio/src/tauri-fs.ts) — the same headless-core /
// platform-glue split that apps/studio/src/binding.ts documents.

import type { Filesystem, FsDirectory, FsFile, FsWritable } from "./seam.js";
import { assertSafeName } from "./names.js";

/** One directory entry as reported by the platform. Mirrors plugin-fs `DirEntry`. */
export interface TauriDirEntry {
  name: string;
  isDirectory: boolean;
}

/**
 * A streaming write handle — the slice of a plugin-fs `FileHandle` the large-write path needs
 * (`open()` below). Its `write` follows the POSIX contract: it may commit FEWER bytes than given
 * and returns how many, so callers must loop (see `writeAllToHandle`). Structural sibling of
 * apps/studio/src/tauri-fs.ts `TauriFileHandleLike`.
 */
export interface TauriWriteHandle {
  write(data: Uint8Array): Promise<number>;
  close(): Promise<void>;
}

/**
 * The minimal path-based filesystem surface this backend needs. A structural subset of
 * @tauri-apps/plugin-fs; also implementable over node:fs (the conformance binding). Paths are
 * absolute and use "/" separators (Rust std::path and node accept these on every OS we target).
 */
export interface TauriFsBridge {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  /**
   * Open a path for STREAMING writes (create + truncate), returning a handle whose `write` is
   * driven chunk-by-chunk. The large-asset write path (TauriFile.writable given a Blob) uses this
   * so a multi-GB asset never fully buffers in heap. Small JSON writes stay on `writeFile`.
   * Adding this method means BOTH implementers move in lockstep (the real plugin-fs adapter in
   * apps/studio/src/tauri-fs.ts and the node:fs conformance bridge in tauri.test.ts) — tsc is the
   * gate that catches a missed one (.claude/rules/tauri-fs-seam.md).
   */
  open(path: string): Promise<TauriWriteHandle>;
  /** Atomically replace `newPath` with `oldPath` (both absolute, same directory — see TauriFile.close). */
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  readDir(path: string): Promise<TauriDirEntry[]>;
  /** Recursive remove of a file or directory. Must reject if the path is missing. */
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

/** Drain ONE chunk fully into a streaming handle, looping over POSIX short writes (a bare call can
 *  silently truncate). The in-core sibling of apps/studio/src/tauri-fs.ts `writeAllToTauriHandle`. */
async function writeAllToHandle(handle: TauriWriteHandle, chunk: Uint8Array): Promise<void> {
  let off = 0;
  while (off < chunk.byteLength) {
    const n = await handle.write(off === 0 ? chunk : chunk.subarray(off));
    if (n <= 0) throw new Error(`tauri write made no progress at byte ${off}/${chunk.byteLength}`);
    off += n;
  }
}

/** Join a directory path and a child name with a single "/" — no Node `path` dep (render-core is headless). */
function join(dir: string, name: string): string {
  return dir.endsWith("/") ? dir + name : `${dir}/${name}`;
}

// Name containment (`assertSafeName`) is shared with the HTTP backend — plugin-fs path-joins raw,
// so an untrusted segment (e.g. an exhibit slug carried in a `.archie.zip`) could otherwise
// `..`-traverse out of the library root. Every TauriDir method that joins a caller-supplied name
// onto a real path calls it first — see fs/names.ts.

// Monotonic suffix for atomic-write temp files. Unique-per-process is sufficient: writes to any one
// path are serialized by the app's save-queue, and a temp exists only between writeFile and rename.
let tmpSeq = 0;

class TauriFile implements FsFile {
  constructor(
    private readonly bridge: TauriFsBridge,
    private readonly path: string,
    readonly name: string,
  ) {}

  async readable(): Promise<ArrayBuffer> {
    // slice() detaches a right-sized copy so callers never see the bridge's backing buffer.
    const copy = (await this.bridge.readFile(this.path)).slice();
    return copy.buffer;
  }

  async writable(): Promise<FsWritable> {
    // Both modes commit the SAME way — write a same-directory `{path}.tmp-{seq}`, then rename it
    // over the destination. plugin-fs writeFile/open truncates-then-writes, so a crash mid-flush
    // straight to the destination would leave `library.json`/`manifest.json` truncated and
    // unparseable — a durability guarantee the FSA/OPFS backends give for free. Same-dir temp keeps
    // the rename atomic (one filesystem). The mode is chosen by the FIRST chunk:
    //   - string / ArrayBuffer (authored JSON): buffer in heap, flush once via writeFile. The
    //     proven durable-JSON path — kept deliberately unchanged (small, atomicity is what matters).
    //   - Blob (an imported asset, potentially a multi-GB AV file): STREAM it into a plugin-fs
    //     `open()` handle, so it never fully materializes. The buffered path would concatenate the
    //     whole file (~2× in heap) and OOM (fs/tauri.ts header / Archie-623e Phase 1).
    const tmp = `${this.path}.tmp-${tmpSeq++}`;
    const chunks: Uint8Array[] = [];
    let handle: TauriWriteHandle | null = null;
    const discardTemp = async (): Promise<void> => {
      try {
        if (handle) await handle.close();
      } catch {
        /* handle may already be closed by a failed close() */
      }
      try {
        await this.bridge.remove(tmp);
      } catch {
        /* best-effort: temp may not exist if the first write itself failed */
      }
    };
    return {
      write: async (data) => {
        if (data instanceof Blob) {
          handle ??= await this.bridge.open(tmp);
          const reader = data.stream().getReader();
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              await writeAllToHandle(handle, value);
            }
          } catch (e) {
            await discardTemp();
            throw e;
          }
        } else if (typeof data === "string") {
          chunks.push(new TextEncoder().encode(data));
        } else {
          chunks.push(new Uint8Array(data.slice(0)));
        }
      },
      close: async () => {
        try {
          if (handle) {
            // Streamed path — the bytes are already in the temp; just close the handle.
            await handle.close();
          } else {
            // Buffered path (also the empty-write case: an eager getFile{create} touch that never
            // wrote produces a 0-byte file, matching the prior close()-always-writes behaviour).
            const total = chunks.reduce((n, c) => n + c.byteLength, 0);
            const buf = new Uint8Array(total);
            let off = 0;
            for (const c of chunks) {
              buf.set(c, off);
              off += c.byteLength;
            }
            await this.bridge.writeFile(tmp, buf);
          }
          await this.bridge.rename(tmp, this.path);
        } catch (e) {
          await discardTemp();
          throw e;
        }
      },
    };
  }

  async getFile(): Promise<File> {
    const bytes = (await this.bridge.readFile(this.path)).slice();
    return new File([bytes], this.name);
  }
}

class TauriDir implements FsDirectory {
  constructor(
    private readonly bridge: TauriFsBridge,
    private readonly path: string,
  ) {}

  async getDirectory(name: string, opts?: { create?: boolean }): Promise<FsDirectory> {
    assertSafeName(name);
    const childPath = join(this.path, name);
    if (opts?.create === true) {
      await this.bridge.mkdir(childPath); // idempotent (recursive)
    } else if (!(await this.bridge.exists(childPath))) {
      throw new Error(`no such directory: ${name}`);
    }
    return new TauriDir(this.bridge, childPath);
  }

  async getFile(name: string, opts?: { create?: boolean }): Promise<FsFile> {
    assertSafeName(name);
    const childPath = join(this.path, name);
    if (!(await this.bridge.exists(childPath))) {
      if (opts?.create !== true) throw new Error(`no such file: ${name}`);
      // Eager-touch an empty file so it exists before the first write (matches FSA's
      // getFileHandle({create:true})). Existing files are left intact — never truncated here.
      await this.bridge.writeFile(childPath, new Uint8Array(0));
    }
    return new TauriFile(this.bridge, childPath, name);
  }

  async remove(name: string): Promise<void> {
    assertSafeName(name);
    await this.bridge.remove(join(this.path, name));
  }

  async *entries(): AsyncIterable<{ name: string; kind: "file" | "directory" }> {
    for (const e of await this.bridge.readDir(this.path)) {
      yield { name: e.name, kind: e.isDirectory ? "directory" : "file" };
    }
  }
}

/** A Tauri-backed Filesystem rooted at an absolute folder path. */
export class TauriFilesystem implements Filesystem {
  constructor(
    private readonly bridge: TauriFsBridge,
    private readonly rootPath: string,
  ) {}

  async root(): Promise<FsDirectory> {
    await this.bridge.mkdir(this.rootPath); // ensure the root exists (idempotent, recursive)
    return new TauriDir(this.bridge, this.rootPath);
  }
}
