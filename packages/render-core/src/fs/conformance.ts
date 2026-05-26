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
