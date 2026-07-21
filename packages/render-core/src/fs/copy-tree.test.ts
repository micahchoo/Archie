// copyTree contract (Archie-623e Phase 1). Proven over MemoryFilesystem (the seam's oracle) — the
// same seam the OPFS (fsa) and Tauri backends implement, so a green round-trip here proves the copy
// logic on every backend; the streaming/atomic write specifics have their own tests (tauri.test.ts).

import { describe, it, expect } from "vitest";
import { MemoryFilesystem } from "./memory.js";
import { copyTree } from "./copy-tree.js";
import type { Filesystem, FsDirectory } from "./seam.js";

function leaf(path: string[]): string {
  const name = path[path.length - 1];
  if (name === undefined) throw new Error("empty path");
  return name;
}

async function writeFile(fs: Filesystem, path: string[], text: string): Promise<void> {
  let dir = await fs.root();
  for (const seg of path.slice(0, -1)) dir = await dir.getDirectory(seg, { create: true });
  const f = await dir.getFile(leaf(path), { create: true });
  const w = await f.writable();
  await w.write(text);
  await w.close();
}

async function readFile(fs: Filesystem, path: string[]): Promise<string> {
  let dir: FsDirectory = await fs.root();
  for (const seg of path.slice(0, -1)) dir = await dir.getDirectory(seg);
  const f = await dir.getFile(leaf(path));
  return new TextDecoder().decode(await f.readable());
}

async function hasEntry(fs: Filesystem, name: string): Promise<boolean> {
  for await (const e of (await fs.root()).entries()) if (e.name === name) return true;
  return false;
}

describe("copyTree", () => {
  it("round-trips a multi-directory tree byte-for-byte", async () => {
    const src = new MemoryFilesystem();
    await writeFile(src, ["library.json"], '{"v":1}');
    await writeFile(src, ["annotations", "a.json"], '{"note":"one"}');
    await writeFile(src, ["exhibits", "voynich", "annotations", "b.json"], '{"note":"two"}');
    await writeFile(src, ["exhibits", "voynich", "assets", "folio.webp"], "PRETEND-IMAGE-BYTES");

    const dst = new MemoryFilesystem();
    const res = await copyTree(src, dst);

    expect(res.files).toBe(4);
    // dirs: annotations, exhibits, exhibits/voynich, exhibits/voynich/annotations, exhibits/voynich/assets
    expect(res.directories).toBe(5);
    expect(await readFile(dst, ["library.json"])).toBe('{"v":1}');
    expect(await readFile(dst, ["annotations", "a.json"])).toBe('{"note":"one"}');
    expect(await readFile(dst, ["exhibits", "voynich", "annotations", "b.json"])).toBe('{"note":"two"}');
    expect(await readFile(dst, ["exhibits", "voynich", "assets", "folio.webp"])).toBe("PRETEND-IMAGE-BYTES");
  });

  it("streams a Blob-backed file through the target's writable (write accepts a Blob)", async () => {
    const src = new MemoryFilesystem();
    const big = new Uint8Array(50_000).map((_, i) => i % 253);
    // Seed via a Blob write to exercise the same write shape copyTree uses on the read side.
    const f = await (await src.root()).getFile("big.bin", { create: true });
    const w = await f.writable();
    await w.write(new Blob([big]));
    await w.close();

    const dst = new MemoryFilesystem();
    await copyTree(src, dst);
    const out = new Uint8Array(await (await (await dst.root()).getFile("big.bin")).readable());
    expect(out.byteLength).toBe(big.byteLength);
    expect(Array.from(out.slice(0, 8))).toEqual(Array.from(big.slice(0, 8)));
  });

  it("overwrites pre-existing target files in place (idempotent re-run after a torn copy)", async () => {
    const src = new MemoryFilesystem();
    await writeFile(src, ["library.json"], "FRESH");
    await writeFile(src, ["exhibits", "x", "a.json"], "FRESH-A");

    const dst = new MemoryFilesystem();
    // Simulate a torn prior copy: a partial/stale file already sits in the target.
    await writeFile(dst, ["library.json"], "STALE-PARTIAL");

    await copyTree(src, dst); // must overwrite, not append or error
    expect(await readFile(dst, ["library.json"])).toBe("FRESH");
    expect(await readFile(dst, ["exhibits", "x", "a.json"])).toBe("FRESH-A");
  });

  it("writes only content — never a completion marker (marker-LAST is the caller's job)", async () => {
    const src = new MemoryFilesystem();
    await writeFile(src, ["library.json"], "{}");
    const dst = new MemoryFilesystem();
    await copyTree(src, dst);
    expect(await hasEntry(dst, "migrated.json")).toBe(false);
  });
});
