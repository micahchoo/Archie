import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { HashingFilesystem, sha256Hex } from "./hashing.js";
import { MemoryFilesystem } from "./memory.js";

// The oracle is node:crypto, deliberately — an INDEPENDENT implementation of the same algorithm.
// Comparing our WebCrypto digest against our own WebCrypto digest would be a tautology.
function nodeSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function write(fs: MemoryFilesystem | HashingFilesystem, path: string, data: string | Uint8Array): Promise<void> {
  const parts = path.split("/");
  let dir = await fs.root();
  for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectory(parts[i]!, { create: true });
  const file = await dir.getFile(parts[parts.length - 1]!, { create: true });
  const w = await file.writable();
  await w.write(typeof data === "string" ? data : (data.buffer as ArrayBuffer).slice(data.byteOffset, data.byteOffset + data.byteLength));
  await w.close();
}

describe("sha256Hex", () => {
  it("matches the RFC 6234 test vector for the empty string and for 'abc'", async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("agrees with node:crypto over a megabyte of pseudo-random bytes", async () => {
    const bytes = new Uint8Array(1 << 20);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 2654435761) & 0xff;
    expect(await sha256Hex(bytes)).toBe(nodeSha256(bytes));
  });
});

describe("HashingFilesystem — records what is written, passes everything else through", () => {
  it("records one entry per file, path-relative to the root, hash matching node:crypto", async () => {
    const mem = new MemoryFilesystem();
    const h = new HashingFilesystem(mem);
    await write(h, "a.txt", "hello");
    await write(h, "deep/nested/b.bin", new Uint8Array([1, 2, 3]));

    expect(h.written().map((r) => r.path)).toEqual(["a.txt", "deep/nested/b.bin"]);
    expect(h.written().find((r) => r.path === "a.txt")).toEqual({
      path: "a.txt",
      sha256: nodeSha256(new TextEncoder().encode("hello")),
      bytes: 5,
    });
    expect(h.written().find((r) => r.path === "deep/nested/b.bin")).toEqual({
      path: "deep/nested/b.bin",
      sha256: nodeSha256(new Uint8Array([1, 2, 3])),
      bytes: 3,
    });
  });

  it("the bytes it hashed are the bytes the WRAPPED filesystem holds", async () => {
    const mem = new MemoryFilesystem();
    const h = new HashingFilesystem(mem);
    await write(h, "x/y.json", '{"a":1}');
    // Read back through the UNDECORATED filesystem: the decorator must be write-through, not a sink.
    const storedFile = await (await (await mem.root()).getDirectory("x")).getFile("y.json");
    const stored = new Uint8Array(await storedFile.readable());
    expect(new TextDecoder().decode(stored)).toBe('{"a":1}');
    expect(h.written()[0]!.sha256).toBe(nodeSha256(stored));
  });

  it("accepts an ArrayBufferView write (Archie-7f6d): hashes and stores the view's bytes", async () => {
    const mem = new MemoryFilesystem();
    const h = new HashingFilesystem(mem);
    // A SUBARRAY view — non-zero byteOffset and a short length, so a wrong normalization shows up as
    // wrong bytes, not just a wrong hash. The helper above copies to an ArrayBuffer before writing;
    // this passes the VIEW itself, the shape the built viewer bundle actually arrives as.
    const raw = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    const dir = await (await h.root()).getDirectory("v", { create: true });
    const file = await dir.getFile("view.bin", { create: true });
    const w = await file.writable();
    // The seam's declared write union stays string|ArrayBuffer|Blob (the other backends really do
    // reject views); HashingFilesystem accepts the view at runtime and normalizes it, so the test
    // hands it over through a runtime-typed hole rather than pretending the seam declares it.
    await (w.write as (data: unknown) => Promise<void>)(raw.subarray(2, 6));
    await w.close();
    const rec = h.written().find((r) => r.path === "v/view.bin")!;
    expect(rec).toEqual({
      path: "v/view.bin",
      sha256: nodeSha256(new Uint8Array([2, 3, 4, 5])),
      bytes: 4,
    });
    // The bytes the WRAPPED filesystem holds are the view's bytes — write-through, not a sink.
    const storedFile = await (await (await mem.root()).getDirectory("v")).getFile("view.bin");
    expect([...new Uint8Array(await storedFile.readable())]).toEqual([2, 3, 4, 5]);

    const dv = await dir.getFile("dv.bin", { create: true });
    const w2 = await dv.writable();
    await (w2.write as (data: unknown) => Promise<void>)(new DataView(raw.buffer, 1, 4));
    await w2.close();
    expect(h.written().find((r) => r.path === "v/dv.bin")).toEqual({
      path: "v/dv.bin",
      sha256: nodeSha256(new Uint8Array([1, 2, 3, 4])),
      bytes: 4,
    });
  });

  it("a rewritten file replaces its record rather than accumulating one", async () => {
    const h = new HashingFilesystem(new MemoryFilesystem());
    await write(h, "a.txt", "one");
    await write(h, "a.txt", "two");
    expect(h.written()).toHaveLength(1);
    expect(h.written()[0]!.sha256).toBe(nodeSha256(new TextEncoder().encode("two")));
  });

  it("mixed chunks produce the same stored bytes and fixity digest", async () => {
    const fs = new HashingFilesystem(new MemoryFilesystem());
    const file = await (await fs.root()).getFile("mixed.bin", { create: true });
    const writer = await file.writable();
    const input = new Uint8Array([0, 255]);
    await writer.write("start");
    await writer.write(input.buffer);
    input.fill(9);
    await writer.write(new Blob(["end"]));
    await writer.close();
    const expected = new Uint8Array(await new Blob(["start", new Uint8Array([0, 255]), "end"]).arrayBuffer());
    expect(new Uint8Array(await file.readable())).toEqual(expected);
    expect(fs.written()).toEqual([{ path: "mixed.bin", bytes: expected.length, sha256: nodeSha256(expected) }]);
  });

  it("removing a directory drops every record beneath it, and reports the prefix", async () => {
    const h = new HashingFilesystem(new MemoryFilesystem());
    await write(h, "keep/a.txt", "a");
    await write(h, "drop/b.txt", "b");
    await write(h, "drop/deeper/c.txt", "c");
    await write(h, "dropped-suffix/d.txt", "d"); // must NOT be caught by a naive startsWith("drop")

    await (await h.root()).remove("drop");

    expect(h.written().map((r) => r.path)).toEqual(["dropped-suffix/d.txt", "keep/a.txt"]);
    expect(h.removedPrefixes()).toEqual(["drop"]);
  });

  it("reads, listings and sizes pass through unchanged", async () => {
    const h = new HashingFilesystem(new MemoryFilesystem());
    await write(h, "d/a.txt", "abc");
    const root = await h.root();
    const names: string[] = [];
    for await (const e of root.entries()) names.push(`${e.kind}:${e.name}`);
    expect(names).toEqual(["directory:d"]);
    const file = await (await root.getDirectory("d")).getFile("a.txt");
    expect(await file.size()).toBe(3);
    expect(new TextDecoder().decode(await file.readable())).toBe("abc");
    expect(await (await file.getFile()).text()).toBe("abc");
  });

  it("leaves resolveUrl UNDEFINED when the wrapped backend has none — callers feature-detect on it", async () => {
    const h = new HashingFilesystem(new MemoryFilesystem());
    await write(h, "a.txt", "x");
    const file = await (await h.root()).getFile("a.txt");
    expect(file.resolveUrl).toBeUndefined();
  });

  it("forwards resolveUrl when the wrapped backend HAS one", async () => {
    const mem = new MemoryFilesystem();
    const inner = { root: async () => {
      const r = await mem.root();
      return {
        ...r,
        getFile: async (n: string, o?: { create?: boolean }) => Object.assign(await r.getFile(n, o), { resolveUrl: async () => "asset://x" }),
        getDirectory: r.getDirectory.bind(r),
        remove: r.remove.bind(r),
        entries: r.entries.bind(r),
      };
    } };
    const h = new HashingFilesystem(inner);
    const file = await (await h.root()).getFile("a.txt", { create: true });
    expect(await file.resolveUrl?.()).toBe("asset://x");
  });
});
