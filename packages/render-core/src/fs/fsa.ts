// FsaFilesystem — the File System Access backend (ADR-0003 storage / Q-5; UX-Q2 Chromium
// Project). Wraps a user-picked FileSystemDirectoryHandle for autosave-in-place — the
// git / GitHub-Pages on-ramp. The directory PICKER (showDirectoryPicker) and live writes are
// browser-only, so this wrapper is typechecked here but VERIFIED in the browser (no headless
// test — happy-dom has no FSA). Donor: anvil storage/backends/fsa.ts.

import type { Filesystem, FsDirectory, FsFile, FsWritable } from "./seam.js";

class FsaFile implements FsFile {
  constructor(private readonly handle: FileSystemFileHandle) {}
  async readable(): Promise<ArrayBuffer> {
    return (await this.handle.getFile()).arrayBuffer();
  }
  async writable(): Promise<FsWritable> {
    const stream = await this.handle.createWritable();
    return {
      write: (data) => stream.write(data),
      close: () => stream.close(),
    };
  }
  getFile(): Promise<File> {
    return this.handle.getFile();
  }
}

class FsaDir implements FsDirectory {
  constructor(private readonly handle: FileSystemDirectoryHandle) {}
  async getDirectory(name: string, opts?: { create?: boolean }): Promise<FsDirectory> {
    return new FsaDir(await this.handle.getDirectoryHandle(name, { create: opts?.create ?? false }));
  }
  async getFile(name: string, opts?: { create?: boolean }): Promise<FsFile> {
    return new FsaFile(await this.handle.getFileHandle(name, { create: opts?.create ?? false }));
  }
  async remove(name: string): Promise<void> {
    await this.handle.removeEntry(name, { recursive: true });
  }
  async *entries(): AsyncIterable<{ name: string; kind: "file" | "directory" }> {
    // FileSystemDirectoryHandle is async-iterable of [name, handle].
    for await (const [name, handle] of this.handle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      yield { name, kind: handle.kind === "directory" ? "directory" : "file" };
    }
  }
}

export class FsaFilesystem implements Filesystem {
  constructor(private readonly handle: FileSystemDirectoryHandle) {}
  async root(): Promise<FsDirectory> {
    return new FsaDir(this.handle);
  }
}
