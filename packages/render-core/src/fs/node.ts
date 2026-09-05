// NodeFilesystem — a real node:fs directory backend behind the Filesystem seam (ADR-0003 storage / Q-5).
// The Node-side sibling of FsaFilesystem/TauriFilesystem: an absolute folder on disk is the canonical
// store, written in place. Serves the script toolbelt (scripts/*.mts — the verify/republish/deposit
// bridges re-pointed onto it, Phase 1 Wave 1) and the conformance suite's real-disk proof: anything
// that runs OUTSIDE a browser/desktop webview and needs a genuine writable directory. node:fs/promises
// is the platform surface, so this module is Node-only by construction — every other backend stays
// headless (see index.ts for the export contract).
//
// The same disciplines the other path-joining backends re-establish for themselves (tauri-fs-seam):
//   • Name containment — every caller-supplied segment is `assertSafeName`-checked before it joins a
//     real path, so an untrusted segment (`..`, `a/b`, NUL) cannot escape the root (fs/names.ts).
//   • Absent vs failed (render-core-data-integrity contract #2) — ENOENT is translated to the seam's
//     canonical `no such (file|directory)` phrasing (fs/seam.ts isNotFound); anything else (EACCES,
//     ENOSPC, a torn read) propagates as a FAILURE, never absence.
//   • Atomic writes — `writable()` commits via a same-dir temp + rename (the TauriFile discipline), so
//     a crash mid-flush never leaves the destination truncated; Blob writes STREAM through a file
//     handle so a multi-GB asset never fully buffers in heap.
//   • Lazy getFile() — stat for the size, defer the byte read (Archie-623e seam contract): the
//     large-media publish path depends on getFile() never pre-materializing bytes into the JS heap.

import * as fsp from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import type { Filesystem, FsDirectory, FsFile, FsWritable } from "./seam.js";
import { assertSafeName } from "./names.js";

/** Does the path exist? ENOENT → false (absent); any other stat fault (EACCES, ENOSPC) → rethrown (failed). */
async function exists(path: string): Promise<boolean> {
  try {
    await fsp.access(path);
    return true;
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") return false;
    throw e;
  }
}

/** Join a directory path and a child name with a single "/" — the same shape fs/tauri.ts uses. */
function join(dir: string, name: string): string {
  return dir.endsWith("/") ? dir + name : `${dir}/${name}`;
}

/** Drain ONE chunk fully into a file handle, looping over POSIX short writes (a bare call can silently
 *  truncate). The in-core sibling of fs/tauri.ts `writeAllToHandle`. */
async function writeAllToHandle(handle: FileHandle, chunk: Uint8Array): Promise<void> {
  let off = 0;
  while (off < chunk.byteLength) {
    const { bytesWritten } = await handle.write(chunk.subarray(off));
    if (bytesWritten <= 0) throw new Error(`node write made no progress at byte ${off}/${chunk.byteLength}`);
    off += bytesWritten;
  }
}

// Monotonic suffix for atomic-write temp files. Unique-per-process is sufficient: writes to any one
// path are serialized by the app's save-queue, and a temp exists only between writeFile and rename.
let tmpSeq = 0;

/**
 * A lazily-read `File` for the node backend — the seam's "getFile() never pre-materializes" contract
 * (Archie-623e). `new File([], name)` is a real, `instanceof File` handle; `size` is redefined from a
 * stat (no read) and the READ methods (`arrayBuffer`/`stream`/`text`) pull the bytes on demand.
 * `slice()` throws — a lazy backend can't produce a synchronous sub-Blob and no seam consumer slices
 * getFile() (they read arrayBuffer()/stream(); a blob: URL uses `readable()`). Do NOT pass this to
 * `URL.createObjectURL` / `createImageBitmap` / `createWritable().write`: those read the (empty)
 * internal byte sequence — MATERIALIZE via `new Blob([await f.arrayBuffer()])` first (seam.ts).
 */
function lazyNodeFile(path: string, name: string, size: number): File {
  const read = async (): Promise<Uint8Array> => new Uint8Array(await fsp.readFile(path));
  const file = new File([], name);
  const def = (key: string, value: unknown): void => {
    Object.defineProperty(file, key, { value, configurable: true });
  };
  def("size", size);
  def("arrayBuffer", async (): Promise<ArrayBuffer> => (await read()).buffer as ArrayBuffer);
  def("text", async (): Promise<string> => new TextDecoder().decode(await read()));
  def("stream", (): ReadableStream<Uint8Array> =>
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        controller.enqueue(await read());
        controller.close();
      },
    }),
  );
  def("slice", () => {
    throw new Error(
      "lazy Node File does not support slice(); read via arrayBuffer()/stream() or the seam's readable()",
    );
  });
  return file;
}

class NodeFile implements FsFile {
  constructor(
    private readonly path: string,
    readonly name: string,
  ) {}

  async readable(): Promise<ArrayBuffer> {
    // `new Uint8Array(buffer)` copies into a right-sized fresh buffer — callers never see the fs read buffer.
    return new Uint8Array(await fsp.readFile(this.path)).buffer;
  }

  async writable(): Promise<FsWritable> {
    // Commit the SAME way the Tauri backend does — write a same-dir `{path}.tmp-{seq}`, then rename it
    // over the destination, so a crash mid-flush never leaves `library.json`/`manifest.json` truncated.
    // Each `write(data)` DISPATCHES BY ITS OWN TYPE (not a mode fixed by the first chunk):
    //   - string / ArrayBuffer (authored JSON): buffer in heap, flush once via writeFile on close().
    //   - Blob (an imported asset, potentially multi-GB): STREAM it into a `w` file handle chunk by
    //     chunk, so it never fully materializes (the buffered path would OOM — fs/tauri.ts header).
    const tmp = `${this.path}.tmp-${tmpSeq++}`;
    const chunks: Uint8Array[] = [];
    let handle: FileHandle | null = null;
    const discardTemp = async (): Promise<void> => {
      try {
        if (handle) await handle.close();
      } catch {
        /* handle may already be closed by a failed close() */
      }
      try {
        await fsp.rm(tmp, { force: true });
      } catch {
        /* best-effort: temp may not exist if the first write itself failed */
      }
    };
    return {
      write: async (data) => {
        try {
          if (data instanceof Blob) {
            if (!handle) {
              handle = await fsp.open(tmp, "w");
              // Switching to streaming must first preserve every earlier buffered chunk.
              for (const chunk of chunks) await writeAllToHandle(handle, chunk);
              chunks.length = 0;
            }
            const reader = data.stream().getReader();
            try {
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                await writeAllToHandle(handle, value);
              }
            } finally { reader.releaseLock(); }
          } else {
            const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data.slice(0));
            if (handle) await writeAllToHandle(handle, bytes);
            else chunks.push(bytes);
          }
        } catch (error) {
          await discardTemp();
          throw error;
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
            await fsp.writeFile(tmp, buf);
          }
          await fsp.rename(tmp, this.path);
        } catch (e) {
          await discardTemp();
          throw e;
        }
      },
    };
  }

  async getFile(): Promise<File> {
    // LAZY (Archie-623e seam contract): stat for the size, defer the byte read. NEVER readFile() here.
    const { size } = await fsp.stat(this.path);
    return lazyNodeFile(this.path, this.name, size);
  }

  async size(): Promise<number> {
    return (await fsp.stat(this.path)).size;
  }
}

class NodeDir implements FsDirectory {
  constructor(private readonly path: string) {}

  async getDirectory(name: string, opts?: { create?: boolean }): Promise<FsDirectory> {
    assertSafeName(name);
    const childPath = join(this.path, name);
    if (opts?.create === true) {
      await fsp.mkdir(childPath, { recursive: true }); // idempotent (recursive), like FSA/tauri
    } else if (!(await exists(childPath))) {
      throw new Error(`no such directory: ${name}`);
    }
    return new NodeDir(childPath);
  }

  async getFile(name: string, opts?: { create?: boolean }): Promise<FsFile> {
    assertSafeName(name);
    const childPath = join(this.path, name);
    if (!(await exists(childPath))) {
      if (opts?.create !== true) throw new Error(`no such file: ${name}`);
      // Eager-touch an empty file so it exists before the first write (matches FSA's
      // getFileHandle({create:true}) and the Tauri backend). Existing files are left intact.
      await fsp.writeFile(childPath, new Uint8Array(0));
    }
    return new NodeFile(childPath, name);
  }

  async remove(name: string): Promise<void> {
    assertSafeName(name);
    await fsp.rm(join(this.path, name), { recursive: true });
  }

  async *entries(): AsyncIterable<{ name: string; kind: "file" | "directory" }> {
    for (const e of await fsp.readdir(this.path, { withFileTypes: true })) {
      yield { name: e.name, kind: e.isDirectory() ? "directory" : "file" };
    }
  }
}

/** A node:fs-backed Filesystem rooted at an absolute folder path. */
export class NodeFilesystem implements Filesystem {
  constructor(
    /** Absolute directory path — the canonical store, written in place. */
    private readonly rootPath: string,
  ) {}

  async root(): Promise<FsDirectory> {
    await fsp.mkdir(this.rootPath, { recursive: true }); // ensure the root exists (idempotent, recursive)
    return new NodeDir(this.rootPath);
  }
}
