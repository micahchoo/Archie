// MemoryFilesystem — an in-memory backend behind the Filesystem seam (ADR-0003 storage / Q-5).
// Serves: unit tests (the persistence round-trip oracle) and the Playground working store
// (ephemeral OPFS-equivalent — UX-Q1). Donor pattern: anvil storage/backends/test.ts.

import type { Filesystem, FsDirectory, FsFile, FsWritable } from "./seam.js";

class MemFile implements FsFile {
  constructor(
    public readonly name: string,
    private bytes: Uint8Array = new Uint8Array(0),
  ) {}
  async readable(): Promise<ArrayBuffer> {
    const copy = this.bytes.slice();
    return copy.buffer;
  }
  async writable(): Promise<FsWritable> {
    let buf = new Uint8Array(0);
    return {
      write: async (data) => {
        if (typeof data === "string") buf = new TextEncoder().encode(data);
        else if (data instanceof ArrayBuffer) buf = new Uint8Array(data);
        else buf = new Uint8Array(await data.arrayBuffer());
      },
      close: async () => {
        this.bytes = buf;
      },
    };
  }
  async getFile(): Promise<File> {
    return new File([this.bytes.slice()], this.name);
  }
}

class MemDir implements FsDirectory {
  private files = new Map<string, MemFile>();
  private dirs = new Map<string, MemDir>();
  async getDirectory(name: string, opts?: { create?: boolean }): Promise<FsDirectory> {
    let d = this.dirs.get(name);
    if (d === undefined) {
      if (opts?.create !== true) throw new Error(`no such directory: ${name}`);
      d = new MemDir();
      this.dirs.set(name, d);
    }
    return d;
  }
  async getFile(name: string, opts?: { create?: boolean }): Promise<FsFile> {
    let f = this.files.get(name);
    if (f === undefined) {
      if (opts?.create !== true) throw new Error(`no such file: ${name}`);
      f = new MemFile(name);
      this.files.set(name, f);
    }
    return f;
  }
  async remove(name: string): Promise<void> {
    this.files.delete(name);
    this.dirs.delete(name);
  }
  async *entries(): AsyncIterable<{ name: string; kind: "file" | "directory" }> {
    for (const name of this.files.keys()) yield { name, kind: "file" };
    for (const name of this.dirs.keys()) yield { name, kind: "directory" };
  }
}

/** An in-memory Filesystem. Each instance is an isolated root. */
export class MemoryFilesystem implements Filesystem {
  private readonly _root = new MemDir();
  async root(): Promise<FsDirectory> {
    return this._root;
  }
}
