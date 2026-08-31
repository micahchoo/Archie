// fake-opfs.ts — a fake OPFS root for tests: the FSA-handle shape FsaFilesystem consumes,
// backed by a MemoryFilesystem (whose seam conformance fs/conformance.ts already proves).
//
// Why this exists (Archie-cebf): `initLiveSource` is reached ONLY through
// `navigator.storage.getDirectory()`, and node/happy-dom have no OPFS — so no test stood up the
// viewer's LIVE source at all. That gap is why Archie-f34b (a live cover 404'd against the
// published root) shipped unnoticed. This adapter closes the shape gap: FsaFilesystem wants
// FileSystemDirectoryHandle semantics (getDirectoryHandle / getFileHandle / removeEntry /
// async-iteration of `[name, handle]` pairs); MemoryFilesystem speaks the fs seam
// (FsDirectory / FsFile). The adapter is a thin projection of one onto the other — every byte
// read and write lands in the MemoryFilesystem, so a test seeds it like any writable backend.
//
// Deliberately out of scope: permissions/locks (nothing in the live path touches them) and
// recursive removeEntry (MemoryFilesystem's seam remove is single-entry; tests seed flat files).

import type { FsDirectory } from "@render/core";
import { MemoryFilesystem } from "@render/core";

/** Seed content: "/"-joined tree-relative path → body (strings are written as UTF-8). */
export type OpfsSeed = Record<string, string | ArrayBuffer>;

/** A MemoryFilesystem seeded with `files` — the backing store the fake handles serve. */
export async function seededMemoryFs(files: OpfsSeed): Promise<MemoryFilesystem> {
  const mem = new MemoryFilesystem();
  for (const [path, body] of Object.entries(files)) {
    const parts = path.split("/");
    let dir: FsDirectory = await mem.root();
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectory(p, { create: true });
    const w = await (await dir.getFile(parts[parts.length - 1]!, { create: true })).writable();
    await w.write(body);
    await w.close();
  }
  return mem;
}

/** The ONE handle→seam traversal: walk `parts` off the MemoryFilesystem root (absent → throws). */
async function dirAt(mem: MemoryFilesystem, parts: string[]): Promise<FsDirectory> {
  let dir: FsDirectory = await mem.root();
  for (const p of parts) dir = await dir.getDirectory(p);
  return dir;
}

class FakeFileHandle {
  readonly kind = "file" as const;
  constructor(
    readonly name: string,
    private readonly mem: MemoryFilesystem,
    private readonly dirParts: string[],
  ) {}

  async getFile(): Promise<File> {
    const f = await dirAt(this.mem, this.dirParts).then((d) => d.getFile(this.name));
    return new File([await f.readable()], this.name);
  }

  /** The subset of FileSystemWritableFileStream FsaFile uses: `write` then `close`. */
  async createWritable(): Promise<{ write: (data: string | Blob | ArrayBuffer) => Promise<void>; close: () => Promise<void> }> {
    const f = await dirAt(this.mem, this.dirParts).then((d) => d.getFile(this.name));
    const w = await f.writable();
    return { write: (data) => w.write(data), close: () => w.close() };
  }
}
class FakeDirHandle {
  readonly kind = "directory" as const;
  constructor(
    readonly name: string,
    private readonly mem: MemoryFilesystem,
    private readonly parts: string[],
  ) {}

  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FakeDirHandle> {
    if (opts?.create) await (await dirAt(this.mem, this.parts)).getDirectory(name, { create: true });
    await dirAt(this.mem, [...this.parts, name]); // absent && !create → throws (OPFS NotFoundError shape)
    return new FakeDirHandle(name, this.mem, [...this.parts, name]);
  }

  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<FakeFileHandle> {
    await (await dirAt(this.mem, this.parts)).getFile(name, { create: opts?.create === true });
    return new FakeFileHandle(name, this.mem, this.parts);
  }

  async removeEntry(name: string): Promise<void> {
    await dirAt(this.mem, this.parts).then((d) => d.remove(name));
  }

  // FileSystemDirectoryHandle is async-iterable of [name, handle] — FsaDir enumerates it.
  async *[Symbol.asyncIterator](): AsyncGenerator<readonly [string, FakeDirHandle | FakeFileHandle]> {
    for await (const { name, kind } of await dirAt(this.mem, this.parts)) {
      yield kind === "directory"
        ? [name, new FakeDirHandle(name, this.mem, [...this.parts, name])] as const
        : [name, new FakeFileHandle(name, this.mem, this.parts)] as const;
    }
  }
}

/** A fake `navigator.storage.getDirectory()` root over a freshly seeded MemoryFilesystem. */
export async function fakeOpfsRoot(files: OpfsSeed = {}): Promise<FileSystemDirectoryHandle> {
  const mem = await seededMemoryFs(files);
  return new FakeDirHandle("", mem, []) as unknown as FileSystemDirectoryHandle;
}
