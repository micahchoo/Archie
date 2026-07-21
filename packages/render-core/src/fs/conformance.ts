// Filesystem seam conformance suite (donor: anvil storage/backends/conformance.ts). One shared
// suite every backend must satisfy identically — the contract test that keeps Memory / Zip /
// (FSA, browser) interchangeable behind the seam.

import { describe, it, expect } from "vitest";
import type { Filesystem } from "./seam.js";

async function expectFailure(op: () => unknown | Promise<unknown>): Promise<void> {
  let failed = false;
  try {
    await op();
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
}

/** Seed content for the read-only conformance suite: "/"-joined tree-relative path → body. */
export type SeedFiles = Record<string, string | Uint8Array>;

/** Seed a WRITABLE backend with a fixture tree — lets the full-featured backends run the same
 *  read subset a read-only backend runs, proving the subset is the shared contract's read half
 *  rather than something HTTP-shaped. */
export async function seedWritableFs(fs: Filesystem, files: SeedFiles): Promise<Filesystem> {
  for (const [path, body] of Object.entries(files)) {
    const parts = path.split("/");
    let dir = await fs.root();
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectory(p, { create: true });
    const w = await (await dir.getFile(parts[parts.length - 1]!, { create: true })).writable();
    await w.write(typeof body === "string" ? body : body.slice().buffer);
    await w.close();
  }
  return fs;
}

async function readAt(fs: Filesystem, path: string): Promise<ArrayBuffer> {
  const parts = path.split("/");
  let dir = await fs.root();
  for (const p of parts.slice(0, -1)) dir = await dir.getDirectory(p);
  return (await dir.getFile(parts[parts.length - 1]!)).readable();
}

/**
 * Register the READ-ONLY applicable subset of the conformance suite for a backend factory that
 * opens over pre-existing content (`HttpFilesystem` can't be seeded by writes — a published tree
 * already exists on the host). Mirrors the read half of `runConformance` case-for-case; the
 * write half doesn't apply to a read-only backend (mutations throw — pinned in the backend's own
 * targeted tests, e.g. http.test.ts).
 *
 * One deliberate loosening: "missing" is asserted on the whole getDirectory→getFile→readable
 * chain, not on `getFile` alone — a lazy-existence backend (HTTP has no cheap probe) surfaces
 * absence at read time, an eager one at handle time; either way absence is OBSERVABLE, never an
 * empty read.
 */
export function runReadConformance(
  name: string,
  makeFs: (files: SeedFiles) => Filesystem | Promise<Filesystem>,
): void {
  describe(`Filesystem read conformance: ${name}`, () => {
    it("reads a string-seeded file to a readable ArrayBuffer", async () => {
      const fs = await makeFs({ "a.txt": "hello world" });
      expect(new TextDecoder().decode(await readAt(fs, "a.txt"))).toBe("hello world");
    });

    it("reads seeded bytes byte-for-byte", async () => {
      const fs = await makeFs({ "b.bin": new Uint8Array([1, 2, 3, 250]) });
      expect(Array.from(new Uint8Array(await readAt(fs, "b.bin")))).toEqual([1, 2, 3, 250]);
    });

    it("getFile() returns a File mirroring name and size", async () => {
      const fs = await makeFs({ "named.txt": "data" });
      const f = await (await (await fs.root()).getFile("named.txt")).getFile();
      expect(f).toBeInstanceOf(File);
      expect(f.name).toBe("named.txt");
      expect(f.size).toBe(4);
    });

    it("reads a file nested under directories", async () => {
      const fs = await makeFs({ "x/y/z.json": '{"ok":true}' });
      expect(new TextDecoder().decode(await readAt(fs, "x/y/z.json"))).toBe('{"ok":true}');
    });

    it("size() reports the seeded byte length (Archie-623e capability 2)", async () => {
      const fs = await makeFs({ "sz.bin": new Uint8Array([1, 2, 3, 4, 5]) });
      expect(await (await (await fs.root()).getFile("sz.bin")).size()).toBe(5);
    });

    it("resolveUrl is absent on this read-only backend (callers fall back to a blob: URL)", async () => {
      const fs = await makeFs({ "r.txt": "x" });
      const f = await (await fs.root()).getFile("r.txt");
      expect(f.resolveUrl).toBeUndefined();
    });

    it("a missing file is observably absent (the read chain fails; it never reads as empty)", async () => {
      const fs = await makeFs({ "present.txt": "here" });
      await expectFailure(() => readAt(fs, "missing.txt"));
      await expectFailure(() => readAt(fs, "no-dir/missing.txt"));
    });
  });
}

/** Register the conformance describe-block for a backend factory. */
export function runConformance(name: string, makeFs: () => Filesystem): void {
  describe(`Filesystem conformance: ${name}`, () => {
    it("round-trips a string write to a readable ArrayBuffer", async () => {
      const root = await (makeFs()).root();
      const w = await (await root.getFile("a.txt", { create: true })).writable();
      await w.write("hello world");
      await w.close();
      expect(new TextDecoder().decode(await (await root.getFile("a.txt")).readable())).toBe("hello world");
    });

    it("round-trips an ArrayBuffer write byte-for-byte", async () => {
      const root = await (makeFs()).root();
      const src = new Uint8Array([1, 2, 3, 250]);
      const w = await (await root.getFile("b.bin", { create: true })).writable();
      await w.write(src.buffer);
      await w.close();
      expect(Array.from(new Uint8Array(await (await root.getFile("b.bin")).readable()))).toEqual([1, 2, 3, 250]);
    });

    it("getFile() returns a File mirroring name and size", async () => {
      const root = await (makeFs()).root();
      const w = await (await root.getFile("named.txt", { create: true })).writable();
      await w.write("data");
      await w.close();
      const f = await (await root.getFile("named.txt")).getFile();
      expect(f).toBeInstanceOf(File);
      expect(f.name).toBe("named.txt");
      expect(f.size).toBe(4);
    });

    it("size() reports byte length without materializing content (Archie-623e capability 2)", async () => {
      const root = await (makeFs()).root();
      const w = await (await root.getFile("sz.bin", { create: true })).writable();
      await w.write(new Uint8Array([1, 2, 3, 4, 5]).buffer);
      await w.close();
      expect(await (await root.getFile("sz.bin")).size()).toBe(5);
    });

    it("resolveUrl is OPTIONAL — absent, or resolves to a URL string (Archie-623e capability 3)", async () => {
      const root = await (makeFs()).root();
      await (await (await root.getFile("r.txt", { create: true })).writable()).close();
      const f = await root.getFile("r.txt");
      if (f.resolveUrl === undefined) {
        expect(f.resolveUrl).toBeUndefined(); // memory/zip: callers fall back to a blob: URL
      } else {
        expect(typeof (await f.resolveUrl())).toBe("string"); // tauri: a convertFileSrc asset:// URL
      }
    });

    it("creates nested directories and reads a file back", async () => {
      const root = await (makeFs()).root();
      const sub = await (await root.getDirectory("x", { create: true })).getDirectory("y", { create: true });
      const w = await (await sub.getFile("z.json", { create: true })).writable();
      await w.write('{"ok":true}');
      await w.close();
      const reopened = await (await root.getDirectory("x")).getDirectory("y");
      expect(new TextDecoder().decode(await (await reopened.getFile("z.json")).readable())).toBe('{"ok":true}');
    });

    it("entries() enumerates files and dirs with correct kind", async () => {
      const root = await (makeFs()).root();
      await (await (await root.getFile("a.txt", { create: true })).writable()).close();
      // A directory is observable once it has content (empty-dir persistence is NOT part of the
      // contract — zip-style backends keep dirs implicit; see seam.ts). Reuse the handle.
      const sub = await root.getDirectory("sub", { create: true });
      await (await (await sub.getFile("inner", { create: true })).writable()).close();
      const seen = new Map<string, string>();
      for await (const e of root.entries()) seen.set(e.name, e.kind);
      expect(seen.get("a.txt")).toBe("file");
      expect(seen.get("sub")).toBe("directory");
    });

    it("overwrites an existing file", async () => {
      const root = await (makeFs()).root();
      const w1 = await (await root.getFile("o.txt", { create: true })).writable();
      await w1.write("first");
      await w1.close();
      const w2 = await (await root.getFile("o.txt", { create: true })).writable();
      await w2.write("second");
      await w2.close();
      expect(new TextDecoder().decode(await (await root.getFile("o.txt")).readable())).toBe("second");
    });

    it("getFile / getDirectory without create fail on missing paths", async () => {
      const root = await (makeFs()).root();
      await expectFailure(() => root.getFile("missing.txt"));
      await expectFailure(() => root.getDirectory("missing"));
    });

    it("remove deletes a file", async () => {
      const root = await (makeFs()).root();
      await (await (await root.getFile("gone.txt", { create: true })).writable()).close();
      await root.remove("gone.txt");
      await expectFailure(() => root.getFile("gone.txt"));
    });
  });
}
