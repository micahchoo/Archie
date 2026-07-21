// opfs-to-folder migration contract (Archie-623e Phase 1). Headless over MemoryFilesystem — the
// production wiring hands it an OPFS FsaFilesystem + a TauriFilesystem, but the sentinel/marker/
// idempotency logic is backend-agnostic and proven here. The crux proof is TORN-COPY SAFETY:
// a mid-copy failure must leave `migrated.json` absent so the next boot re-runs.

import { describe, it, expect } from "vitest";
import { MemoryFilesystem } from "@render/core";
import type { Filesystem, FsDirectory, FsFile, FsWritable } from "@render/core";
import { migrateOpfsToFolder, MIGRATION_MARKER, type MigrationStamp } from "./opfs-to-folder.js";

function leaf(path: string[]): string {
  const name = path[path.length - 1];
  if (name === undefined) throw new Error("empty path");
  return name;
}
async function put(fs: Filesystem, path: string[], text: string): Promise<void> {
  let dir = await fs.root();
  for (const seg of path.slice(0, -1)) dir = await dir.getDirectory(seg, { create: true });
  const w = await (await dir.getFile(leaf(path), { create: true })).writable();
  await w.write(text);
  await w.close();
}
async function get(fs: Filesystem, path: string[]): Promise<string> {
  let dir: FsDirectory = await fs.root();
  for (const seg of path.slice(0, -1)) dir = await dir.getDirectory(seg);
  const f = await dir.getFile(leaf(path));
  return new TextDecoder().decode(await f.readable());
}
async function rootNames(fs: Filesystem): Promise<string[]> {
  const out: string[] = [];
  for await (const e of (await fs.root()).entries()) out.push(e.name);
  return out;
}

/** A Filesystem that throws when a file whose name is in `failOn` is written — to simulate a torn
 *  copy. Wraps a real MemoryFilesystem so successfully-written bytes actually land (proving the
 *  copy was genuinely partial when the fault fires). Toggle `failOn.clear()` to "repair" the fs. */
function faultyFs(inner: MemoryFilesystem, failOn: Set<string>): Filesystem {
  const wrapDir = (dir: FsDirectory): FsDirectory => ({
    async getDirectory(name, opts) {
      return wrapDir(await dir.getDirectory(name, opts));
    },
    async getFile(name, opts) {
      const f = await dir.getFile(name, opts);
      return wrapFile(name, f);
    },
    remove: (name) => dir.remove(name),
    entries: () => dir.entries(),
  });
  const wrapFile = (name: string, f: FsFile): FsFile => ({
    readable: () => f.readable(),
    getFile: () => f.getFile(),
    size: () => f.size(),
    async writable(): Promise<FsWritable> {
      const w = await f.writable();
      return {
        write: (d) => w.write(d),
        async close() {
          if (failOn.has(name)) throw new Error(`simulated write fault on ${name}`);
          await w.close();
        },
      };
    },
  });
  return { async root() { return wrapDir(await inner.root()); } };
}

describe("migrateOpfsToFolder", () => {
  it("copies the whole OPFS tree and writes migrated.json LAST", async () => {
    const src = new MemoryFilesystem();
    await put(src, ["library.json"], '{"exhibits":[]}');
    await put(src, ["annotations", "a.json"], "AA");
    await put(src, ["exhibits", "voynich", "assets", "f.webp"], "IMG");

    const dst = new MemoryFilesystem();
    const out = await migrateOpfsToFolder(src, dst);

    expect(out.migrated).toBe(true);
    if (out.migrated) {
      const stamp: MigrationStamp = out.stamp;
      expect(stamp.v).toBe(1);
      expect(stamp.files).toBe(3);
    }
    expect(await get(dst, ["library.json"])).toBe('{"exhibits":[]}');
    expect(await get(dst, ["exhibits", "voynich", "assets", "f.webp"])).toBe("IMG");
    expect(await rootNames(dst)).toContain(MIGRATION_MARKER);
  });

  it("is a no-op once the marker exists (never re-copies over live folder work)", async () => {
    const src = new MemoryFilesystem();
    await put(src, ["library.json"], "SOURCE");
    const dst = new MemoryFilesystem();
    await put(dst, [MIGRATION_MARKER], '{"v":1}');
    await put(dst, ["library.json"], "FOLDER-EDITED-SINCE"); // live folder work

    const out = await migrateOpfsToFolder(src, dst);
    expect(out).toEqual({ migrated: false, reason: "already-migrated" });
    expect(await get(dst, ["library.json"])).toBe("FOLDER-EDITED-SINCE"); // untouched
  });

  it("no-source: null source, or an OPFS store never authored (no library.json) — no marker written", async () => {
    const dst1 = new MemoryFilesystem();
    expect(await migrateOpfsToFolder(null, dst1)).toEqual({ migrated: false, reason: "no-source" });
    expect(await rootNames(dst1)).not.toContain(MIGRATION_MARKER);

    const emptySrc = new MemoryFilesystem();
    await put(emptySrc, ["stray.txt"], "no library here");
    const dst2 = new MemoryFilesystem();
    expect(await migrateOpfsToFolder(emptySrc, dst2)).toEqual({ migrated: false, reason: "no-source" });
    expect(await rootNames(dst2)).not.toContain(MIGRATION_MARKER);
  });

  it("TORN COPY: a mid-copy failure leaves migrated.json ABSENT, and the re-run completes idempotently", async () => {
    const src = new MemoryFilesystem();
    await put(src, ["library.json"], "LIB");
    await put(src, ["boom.json"], "WILL-FAIL-FIRST-RUN");
    await put(src, ["exhibits", "x", "note.json"], "NOTE");

    const innerDst = new MemoryFilesystem();
    const failOn = new Set<string>(["boom.json"]);
    const dst = faultyFs(innerDst, failOn);

    // First run: the copy of boom.json throws; the marker (written AFTER copyTree) is never reached.
    await expect(migrateOpfsToFolder(src, dst)).rejects.toThrow(/simulated write fault/);
    expect(await rootNames(innerDst)).not.toContain(MIGRATION_MARKER);

    // Repair the fault (simulating the transient cause clearing) and re-run from the ORIGINAL,
    // untouched source (the real production shape). The re-run overwrites the partial folder
    // in place and completes — idempotent.
    failOn.clear();
    const out2 = await migrateOpfsToFolder(src, innerDst);
    expect(out2.migrated).toBe(true);
    expect(await get(innerDst, ["library.json"])).toBe("LIB");
    expect(await get(innerDst, ["boom.json"])).toBe("WILL-FAIL-FIRST-RUN");
    expect(await get(innerDst, ["exhibits", "x", "note.json"])).toBe("NOTE");
    expect(await rootNames(innerDst)).toContain(MIGRATION_MARKER);
  });
});
