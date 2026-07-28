// HashingFilesystem (Archie-039e) — a WRITE-THROUGH decorator over the Filesystem seam that records
// a SHA-256 of every file's bytes as it is written, keyed by the file's path relative to the root.
//
// WHY A DECORATOR AND NOT A HASH CALL AT EACH WRITE SITE. The published tree is written from at least
// eight places — `writeJson`/`writeText`/`writeTilePyramid`/the asset, thumbnail and original byte
// passes in `publish/site.ts`, `writeTreeViewer`, and `spine/structure-persist.ts` in a different
// module entirely. A fixity manifest's whole value is COMPLETENESS ("every payload file is listed"),
// and a per-call-site hash makes completeness a thing a future writer must remember. Wrapping the
// seam makes it structural: anything written through this Filesystem is recorded, including files
// added by code that has never heard of fixity.
//
// WHY NOT A POST-HOC TREE WALK. Reading the tree back after the write pass would be simpler and is
// not available: `ZipStreamFilesystem` (the bounded-memory export sink) retains only STRUCTURAL
// files for read-back and streams media straight to disk — a walk would silently miss every asset
// and tile. The bytes are only in hand DURING the write.
//
// MEMORY. `crypto.subtle.digest` is one-shot (there is no streaming WebCrypto digest), so a file's
// chunks are held until `close()`. Publish writes each file with a single `write()` of bytes the
// caller already holds, so this adds one reference, not one copy of the tree — but it does mean a
// single multi-GB asset is momentarily referenced twice. That is the known cost of a WebCrypto-only
// implementation; a streaming digest would need a hand-rolled SHA-256, which is a bigger claim than
// this buys. See ledgers/PROTO-bagit-fixity-2026-07-27.md.

import type { Filesystem, FsDirectory, FsFile, FsWritable } from "./seam.js";

/** One file's fixity record: path relative to the tree root, lowercase hex SHA-256, byte length. */
export interface FixityRecord {
  path: string;
  sha256: string;
  bytes: number;
}

function join(prefix: string, name: string): string {
  return prefix === "" ? name : `${prefix}/${name}`;
}

function concat(chunks: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  if (chunks.length === 1) return chunks[0]!;
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * SHA-256 of `bytes` as lowercase hex, via WebCrypto. `globalThis.crypto.subtle` is present without
 * an import in every browser and in Node >= 20 (verified on this repo's Node 24 toolchain), so this
 * stays isomorphic — render-core must not reach for `node:crypto`.
 */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  let hex = "";
  for (const b of view) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/**
 * Wrap a Filesystem so every file written through it is hashed. Reads, listings and removals pass
 * straight through; only `writable()` is instrumented.
 *
 * Removals are TRACKED, not just forwarded: `publish/site.ts`'s orphan pruning goes through
 * `FsDirectory.remove`, so `removedPrefixes()` is exactly the set of paths that left the tree during
 * this pass — which is what lets an incremental publish drop a stale carried-forward manifest line
 * without re-deriving the removal list from `PublishOptions`.
 */
export class HashingFilesystem implements Filesystem {
  private readonly records = new Map<string, FixityRecord>();
  private readonly removed: string[] = [];

  constructor(private readonly inner: Filesystem) {}

  async root(): Promise<FsDirectory> {
    return new HashingDir(await this.inner.root(), "", this);
  }

  /** @internal — called by HashingFile on close. */
  put(rec: FixityRecord): void {
    this.records.set(rec.path, rec);
  }

  /** @internal — called by HashingDir on remove. */
  noteRemoved(path: string): void {
    this.removed.push(path);
    // A removed directory takes its whole subtree with it; a re-created path is re-recorded on write.
    for (const key of this.records.keys()) {
      if (key === path || key.startsWith(`${path}/`)) this.records.delete(key);
    }
  }

  /** Every file written through this filesystem, sorted by path. */
  written(): FixityRecord[] {
    return [...this.records.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  /** Was this exact path written during this pass? */
  wasWritten(path: string): boolean {
    return this.records.has(path);
  }

  /** Paths removed through the seam during this pass (files AND directory prefixes). */
  removedPrefixes(): readonly string[] {
    return this.removed;
  }
}

class HashingDir implements FsDirectory {
  constructor(
    private readonly inner: FsDirectory,
    private readonly path: string,
    private readonly owner: HashingFilesystem,
  ) {}

  async getDirectory(name: string, opts?: { create?: boolean }): Promise<FsDirectory> {
    return new HashingDir(await this.inner.getDirectory(name, opts), join(this.path, name), this.owner);
  }

  async getFile(name: string, opts?: { create?: boolean }): Promise<FsFile> {
    return new HashingFile(await this.inner.getFile(name, opts), join(this.path, name), this.owner);
  }

  async remove(name: string): Promise<void> {
    await this.inner.remove(name);
    this.owner.noteRemoved(join(this.path, name));
  }

  entries(): AsyncIterable<{ name: string; kind: "file" | "directory" }> {
    return this.inner.entries();
  }
}

class HashingFile implements FsFile {
  /** Only defined when the wrapped backend implements it — the seam's callers feature-detect on
   *  presence, so an always-present forwarder that resolves `undefined` would change behaviour. */
  readonly resolveUrl?: () => Promise<string | undefined>;

  constructor(
    private readonly inner: FsFile,
    private readonly path: string,
    private readonly owner: HashingFilesystem,
  ) {
    if (inner.resolveUrl) this.resolveUrl = () => inner.resolveUrl!();
  }

  readable(): Promise<ArrayBuffer> {
    return this.inner.readable();
  }

  getFile(): Promise<File> {
    return this.inner.getFile();
  }

  size(): Promise<number> {
    return this.inner.size();
  }

  async writable(): Promise<FsWritable> {
    const inner = await this.inner.writable();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    return {
      write: async (data) => {
        // Chunks are CONCATENATED (append), matching ZipStreamFilesystem and the FSA writable
        // stream. MemoryFilesystem/ZipFilesystem instead treat each write as a replace — the seam
        // has never pinned multi-write semantics because every caller writes exactly once. If that
        // ever stops being true the backends disagree with each other before they disagree with us.
        if (typeof data === "string") chunks.push(new TextEncoder().encode(data));
        else if (data instanceof ArrayBuffer) chunks.push(new Uint8Array(data));
        else chunks.push(new Uint8Array(await data.arrayBuffer()));
        await inner.write(data);
      },
      close: async () => {
        await inner.close();
        const bytes = concat(chunks.length > 0 ? chunks : [new Uint8Array(0)]);
        this.owner.put({ path: this.path, sha256: await sha256Hex(bytes), bytes: bytes.byteLength });
      },
    };
  }
}
