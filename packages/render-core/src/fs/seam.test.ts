import { describe, it, expect } from "vitest";
import type { Filesystem, FsDirectory, FsFile, FsWritable } from "./seam.js";

// The seam carries NO backends in Phase 0 (those are Phase 2). This test proves the contract
// is coherent and implementable by standing up a throwaway in-memory backend and exercising it.

class MemFile implements FsFile {
  constructor(public name: string, private bytes = new Uint8Array(0)) {}
  async readable(): Promise<ArrayBuffer> {
    return this.bytes.buffer.slice(this.bytes.byteOffset, this.bytes.byteOffset + this.bytes.byteLength);
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
    return new File([this.bytes], this.name);
  }
}

class MemDir implements FsDirectory {
  files = new Map<string, MemFile>();
  dirs = new Map<string, MemDir>();
  async getDirectory(name: string, opts?: { create?: boolean }): Promise<FsDirectory> {
    let d = this.dirs.get(name);
    if (!d) {
      if (!opts?.create) throw new Error(`no such directory: ${name}`);
      d = new MemDir();
      this.dirs.set(name, d);
    }
    return d;
  }
  async getFile(name: string, opts?: { create?: boolean }): Promise<FsFile> {
    let f = this.files.get(name);
    if (!f) {
      if (!opts?.create) throw new Error(`no such file: ${name}`);
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

class MemFilesystem implements Filesystem {
  private _root = new MemDir();
  async root(): Promise<FsDirectory> {
    return this._root;
  }
}

describe("Filesystem seam is implementable (interface-only contract)", () => {
  it("round-trips a string write through readable()", async () => {
    const fs: Filesystem = new MemFilesystem();
    const root = await fs.root();
    const file = await root.getFile("notes.json", { create: true });
    const w = await file.writable();
    await w.write('{"hello":"world"}');
    await w.close();
    const text = new TextDecoder().decode(await file.readable());
    expect(text).toBe('{"hello":"world"}');
  });

  it("creates nested directories and lists entries", async () => {
    const fs: Filesystem = new MemFilesystem();
    const root = await fs.root();
    const anns = await root.getDirectory("annotations", { create: true });
    await anns.getFile("index.json", { create: true });
    await root.getFile("manifest.json", { create: true });
    const seen: string[] = [];
    for await (const e of root.entries()) seen.push(`${e.kind}:${e.name}`);
    expect(seen).toContain("directory:annotations");
    expect(seen).toContain("file:manifest.json");
  });

  it("getFile without create on a missing file throws", async () => {
    const fs: Filesystem = new MemFilesystem();
    const root = await fs.root();
    await expect(root.getFile("nope.json")).rejects.toThrow();
  });
});
