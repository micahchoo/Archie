// TauriFilesystem conformance — binds the path-based TauriFsBridge to node:fs over temp dirs and
// runs the one shared seam contract (conformance.ts). Green here proves the backend's path / dir /
// file logic; the production binding (@tauri-apps/plugin-fs, in apps/studio/src/tauri-fs.ts) is a
// 1:1 adapter over the same TauriFsBridge surface, so it needs no separate logic test — only the
// thin plugin wiring is browser/desktop-verified. node:fs is used as the test double because
// plugin-fs is a structural subset of it (readFile/writeFile/mkdir/readDir/remove/exists).

import { afterAll, describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import * as fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as nodeJoin } from "node:path";
import { runConformance } from "./conformance.js";
import { TauriFilesystem, type TauriFsBridge, type TauriDirEntry } from "./tauri.js";

const roots: string[] = [];

/** A TauriFsBridge backed by node:fs — the conformance test double for @tauri-apps/plugin-fs. */
const nodeBridge: TauriFsBridge = {
  async readFile(path) {
    return new Uint8Array(await fsp.readFile(path));
  },
  async writeFile(path, data) {
    await fsp.writeFile(path, data);
  },
  async open(path) {
    // Mirrors plugin-fs `open(path, { write, create, truncate })` → a FileHandle. node:fs's "w"
    // flag is create+truncate. `write` returns bytesWritten (POSIX short-write contract).
    const fh = await fsp.open(path, "w");
    return {
      async write(data) {
        const { bytesWritten } = await fh.write(data);
        return bytesWritten;
      },
      async close() {
        await fh.close();
      },
    };
  },
  async rename(oldPath, newPath) {
    await fsp.rename(oldPath, newPath);
  },
  async mkdir(path) {
    await fsp.mkdir(path, { recursive: true });
  },
  async readDir(path): Promise<TauriDirEntry[]> {
    const ents = await fsp.readdir(path, { withFileTypes: true });
    return ents.map((d) => ({ name: d.name, isDirectory: d.isDirectory() }));
  },
  async remove(path) {
    // force:false → rejects on a missing path, satisfying the seam's "remove must reject if missing".
    await fsp.rm(path, { recursive: true });
  },
  async exists(path) {
    try {
      await fsp.access(path);
      return true;
    } catch {
      return false;
    }
  },
  async stat(path) {
    return { size: (await fsp.stat(path)).size };
  },
  resolveUrl(path) {
    // Stand-in for plugin `convertFileSrc` — the real adapter (apps/studio/src/tauri-fs.ts) returns the
    // webview asset URL; the node double just proves the capability threads through the seam.
    return `asset://localhost/${path.replace(/^\/+/, "")}`;
  },
};

// Each conformance test wants an isolated root; mint a fresh temp dir per factory call.
runConformance("TauriFilesystem (node-bridge)", () => {
  const root = mkdtempSync(nodeJoin(tmpdir(), "archie-tauri-"));
  roots.push(root);
  return new TauriFilesystem(nodeBridge, root);
});

// Backend-specific hardening beyond the shared seam contract (atomic write + path containment).
describe("TauriFilesystem hardening", () => {
  const freshRoot = (): TauriFilesystem => {
    const root = mkdtempSync(nodeJoin(tmpdir(), "archie-tauri-h-"));
    roots.push(root);
    return new TauriFilesystem(nodeBridge, root);
  };

  it("close() commits via a same-dir temp+rename and leaves no .tmp-* sibling", async () => {
    const root = await freshRoot().root();
    const w = await (await root.getFile("m.json", { create: true })).writable();
    await w.write('{"ok":true}');
    await w.close();
    const names: string[] = [];
    for await (const e of root.entries()) names.push(e.name);
    expect(names).toContain("m.json");
    expect(names.some((n) => n.includes(".tmp-"))).toBe(false);
    expect(new TextDecoder().decode(await (await root.getFile("m.json")).readable())).toBe('{"ok":true}');
  });

  it("streams a Blob write through open() (never buffered) and commits atomically via temp+rename", async () => {
    // A large-ish multi-chunk blob: prove it round-trips byte-exact AND that it went through the
    // streaming open() handle, not the buffered writeFile path. We spy by wrapping the node bridge.
    let opens = 0;
    let writeFiles = 0;
    const spyBridge: TauriFsBridge = {
      ...nodeBridge,
      async open(path) {
        opens++;
        return nodeBridge.open(path);
      },
      async writeFile(path, data) {
        writeFiles++;
        return nodeBridge.writeFile(path, data);
      },
    };
    const root = mkdtempSync(nodeJoin(tmpdir(), "archie-tauri-blob-"));
    roots.push(root);
    const rootDir = await new TauriFilesystem(spyBridge, root).root();
    const bytes = new Uint8Array(300_000).map((_, i) => i % 251);
    const f = await rootDir.getFile("big.bin", { create: true });
    // getFile{create} eager-touches an empty file via writeFile — reset the counter so we only
    // measure the writable() path below.
    writeFiles = 0;
    const w = await f.writable();
    await w.write(new Blob([bytes]));
    await w.close();
    expect(opens).toBe(1); // streamed via open(), not buffered
    expect(writeFiles).toBe(0); // the buffered writeFile path was NOT taken for the Blob
    const names: string[] = [];
    for await (const e of rootDir.entries()) names.push(e.name);
    expect(names.some((n) => n.includes(".tmp-"))).toBe(false); // committed, no temp left behind
    const round = new Uint8Array(await (await rootDir.getFile("big.bin")).readable());
    expect(round.byteLength).toBe(bytes.byteLength);
    expect(round[0]).toBe(bytes[0]);
    expect(round[299_999]).toBe(bytes[299_999]);
  });

  it("getFile() is LAZY — a stat for the size, ZERO content reads until the bytes are consumed", async () => {
    // The Archie-623e no-materialize proof: getFile() must not readFile() the whole asset (an OOM on a
    // multi-GB AV file). Spy the bridge — getFile() may stat but must NOT readFile; the read defers to
    // arrayBuffer()/stream()/text().
    let readFiles = 0;
    let stats = 0;
    const spyBridge: TauriFsBridge = {
      ...nodeBridge,
      async readFile(path) { readFiles++; return nodeBridge.readFile(path); },
      async stat(path) { stats++; return nodeBridge.stat(path); },
    };
    const root = mkdtempSync(nodeJoin(tmpdir(), "archie-tauri-lazy-"));
    roots.push(root);
    const rootDir = await new TauriFilesystem(spyBridge, root).root();
    const w = await (await rootDir.getFile("big.bin", { create: true })).writable();
    await w.write(new Blob([new Uint8Array(50_000).map((_, i) => i % 251)]));
    await w.close();

    readFiles = 0; stats = 0;
    const f = await (await rootDir.getFile("big.bin")).getFile();
    expect(f).toBeInstanceOf(File);
    expect(f.name).toBe("big.bin");
    expect(f.size).toBe(50_000); // size came from stat, not a read
    expect(readFiles).toBe(0);   // NEVER pre-materialized
    expect(stats).toBeGreaterThan(0);

    // Consuming the bytes now (and only now) reads from disk, byte-exact.
    const round = new Uint8Array(await f.arrayBuffer());
    expect(readFiles).toBeGreaterThan(0);
    expect(round.byteLength).toBe(50_000);
    expect(round[49_999]).toBe(49_999 % 251);
    // stream() round-trips the same bytes.
    const chunks: Uint8Array[] = [];
    for await (const c of (f.stream() as unknown as AsyncIterable<Uint8Array>)) chunks.push(c);
    expect(chunks.reduce((n, c) => n + c.byteLength, 0)).toBe(50_000);
  });

  it("size() stats without reading; resolveUrl() threads convertFileSrc through the seam", async () => {
    let readFiles = 0;
    const spyBridge: TauriFsBridge = {
      ...nodeBridge,
      async readFile(path) { readFiles++; return nodeBridge.readFile(path); },
    };
    const root = mkdtempSync(nodeJoin(tmpdir(), "archie-tauri-stat-"));
    roots.push(root);
    const rootDir = await new TauriFilesystem(spyBridge, root).root();
    const w = await (await rootDir.getFile("m.json", { create: true })).writable();
    await w.write("hello");
    await w.close();
    const file = await rootDir.getFile("m.json");
    readFiles = 0;
    expect(await file.size()).toBe(5);
    expect(readFiles).toBe(0); // size() is a stat, never a read
    // resolveUrl() is present on the Tauri backend and returns the bridge's asset URL (capability 3).
    expect(typeof file.resolveUrl).toBe("function");
    const url = await file.resolveUrl!();
    expect(url).toMatch(/^asset:\/\/localhost\//);
  });

  it("rejects a traversal / separator segment before it reaches the bridge", async () => {
    const root = await freshRoot().root();
    await expect(root.getFile("../escape.txt", { create: true })).rejects.toThrow(/unsafe path/);
    await expect(root.getDirectory("..", { create: true })).rejects.toThrow(/unsafe path/);
    await expect(root.getFile("a/b", { create: true })).rejects.toThrow(/unsafe path/);
    await expect(root.remove("../x")).rejects.toThrow(/unsafe path/);
  });
});

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});
