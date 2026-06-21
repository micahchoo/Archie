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

/** One directory entry as reported by the platform. Mirrors plugin-fs `DirEntry`. */
export interface TauriDirEntry {
  name: string;
  isDirectory: boolean;
}

/**
 * The minimal path-based filesystem surface this backend needs. A structural subset of
 * @tauri-apps/plugin-fs; also implementable over node:fs (the conformance binding). Paths are
 * absolute and use "/" separators (Rust std::path and node accept these on every OS we target).
 */
export interface TauriFsBridge {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  mkdir(path: string): Promise<void>;
  readDir(path: string): Promise<TauriDirEntry[]>;
  /** Recursive remove of a file or directory. Must reject if the path is missing. */
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

/** Join a directory path and a child name with a single "/" — no Node `path` dep (render-core is headless). */
function join(dir: string, name: string): string {
  return dir.endsWith("/") ? dir + name : `${dir}/${name}`;
}

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
    // Accumulate then flush once on close — mirrors FSA's createWritable() stream (append, not
    // replace) and keeps a half-written file off disk if close() never runs.
    const chunks: Uint8Array[] = [];
    return {
      write: async (data) => {
        if (typeof data === "string") chunks.push(new TextEncoder().encode(data));
        else if (data instanceof ArrayBuffer) chunks.push(new Uint8Array(data.slice(0)));
        else chunks.push(new Uint8Array(await data.arrayBuffer()));
      },
      close: async () => {
        const total = chunks.reduce((n, c) => n + c.byteLength, 0);
        const buf = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
          buf.set(c, off);
          off += c.byteLength;
        }
        await this.bridge.writeFile(this.path, buf);
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
    const childPath = join(this.path, name);
    if (opts?.create === true) {
      await this.bridge.mkdir(childPath); // idempotent (recursive)
    } else if (!(await this.bridge.exists(childPath))) {
      throw new Error(`no such directory: ${name}`);
    }
    return new TauriDir(this.bridge, childPath);
  }

  async getFile(name: string, opts?: { create?: boolean }): Promise<FsFile> {
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
