// The `Filesystem` seam (packages/render-core/src/fs/seam.ts), implemented over the loopback folder
// sink — see `scripts/accept/sink.mjs` for why the pixels are made in Chromium and the bytes land on
// a real disk, and why that is structurally the shipping desktop folder store (`fs/tauri.ts`) with a
// different transport.
//
// This is the FOURTH implementation of the seam in the tree (Memory / FSA-OPFS / Zip / Tauri), and it
// is deliberately a HARNESS implementation, not a product one: it exists to give the acceptance run a
// real folder, and it is not wired into any app.
//
// Two contracts of the seam that a naive proxy drops, re-established here because `publishLibrary`
// depends on both:
//   1. `entries()` observes a directory that HAS CONTENT (empty dirs need not appear) — the sink's
//      `/ls/` answers straight off readdir, which satisfies that.
//   2. A path segment is UNTRUSTED (exhibit slugs and asset names come from the model). `assertSafeName`
//      here mirrors `fs/tauri.ts`'s, and the sink refuses an escaping path independently — two
//      independent refusals, same as the desktop backend's belt and braces.

const SEP = /[/\\]/;
function assertSafeName(name: string): void {
  if (name === "" || name === "." || name === ".." || SEP.test(name) || name.includes("\0")) {
    throw new Error(`unsafe path segment: ${JSON.stringify(name)}`);
  }
}

export interface SinkFsStats {
  writes: number;
  writeBytes: number;
  reads: number;
  writeMs: number;
}

export class SinkFilesystem {
  readonly stats: SinkFsStats = { writes: 0, writeBytes: 0, reads: 0, writeMs: 0 };
  constructor(private readonly base: string, private readonly prefix = "") {}
  async root(): Promise<SinkDirectory> {
    return new SinkDirectory(this, this.base, this.prefix);
  }
  /** @internal */ get sinkBase(): string { return this.base; }
}

class SinkDirectory {
  constructor(private readonly fs: SinkFilesystem, private readonly base: string, private readonly path: string) {}
  private child(name: string): string {
    assertSafeName(name);
    return this.path === "" ? name : `${this.path}/${name}`;
  }
  // `create` is a no-op for directories: the sink creates parents on write (`mkdir -p` per file), and
  // the seam's own contract says an EMPTY directory need not be observable. Returning the handle
  // eagerly is exactly what the Zip backend does for the same reason.
  async getDirectory(name: string): Promise<SinkDirectory> {
    return new SinkDirectory(this.fs, this.base, this.child(name));
  }
  async getFile(name: string, opts?: { create?: boolean }): Promise<SinkFile> {
    const p = this.child(name);
    if (!opts?.create) {
      const r = await fetch(`${this.base}/r/${p}`, { method: "HEAD" });
      if (!r.ok) throw new Error(`no such file: ${p}`); // the seam's canonical ABSENT phrasing
    }
    return new SinkFile(this.fs, this.base, p);
  }
  async remove(name: string): Promise<void> {
    const r = await fetch(`${this.base}/w/${this.child(name)}`, { method: "DELETE" });
    if (!r.ok) throw new Error(`remove failed: ${r.status}`);
  }
  async *entries(): AsyncIterable<{ name: string; kind: "file" | "directory" }> {
    const r = await fetch(`${this.base}/ls/${this.path}`);
    if (!r.ok) return; // absent dir = no children, matching the "empty dirs may not exist" contract
    for (const e of (await r.json()) as { name: string; kind: "file" | "directory" }[]) yield e;
  }
}

class SinkFile {
  constructor(private readonly fs: SinkFilesystem, private readonly base: string, private readonly path: string) {}
  async readable(): Promise<ArrayBuffer> {
    const r = await fetch(`${this.base}/r/${this.path}`);
    if (!r.ok) throw new Error(`no such file: ${this.path}`);
    this.fs.stats.reads++;
    return await r.arrayBuffer();
  }
  async getFile(): Promise<File> {
    return new File([await this.readable()], this.path.split("/").pop()!);
  }
  async size(): Promise<number> {
    const r = await fetch(`${this.base}/r/${this.path}`, { method: "HEAD" });
    if (!r.ok) throw new Error(`no such file: ${this.path}`);
    return Number(r.headers.get("content-length") ?? 0);
  }
  async writable(): Promise<SinkWritable> {
    return new SinkWritable(this.fs, this.base, this.path);
  }
}

/** Buffer, then ONE PUT on close — the same commit-on-close shape FSA's `createWritable` has, and the
 *  reason `fs/tauri.ts` writes a temp file and renames. A partially-written file never appears. */
class SinkWritable {
  private parts: (string | Blob | ArrayBuffer)[] = [];
  constructor(private readonly fs: SinkFilesystem, private readonly base: string, private readonly path: string) {}
  async write(data: string | Blob | ArrayBuffer): Promise<void> { this.parts.push(data); }
  async close(): Promise<void> {
    const blob = new Blob(this.parts);
    const t = performance.now();
    const r = await fetch(`${this.base}/w/${this.path}`, { method: "PUT", body: blob });
    if (!r.ok) throw new Error(`PUT ${this.path} -> ${r.status}`);
    this.fs.stats.writeMs += performance.now() - t;
    this.fs.stats.writes++;
    this.fs.stats.writeBytes += blob.size;
    this.parts = [];
  }
}
