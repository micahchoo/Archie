import { describe, it, expect } from "vitest";
import { unzipSync } from "fflate";
import { ZipFilesystem } from "./zip.js";

// streamZip — the v1.1 streaming serializer (LARGE-MEDIA-MEMORY-CEILING #3 / A.1). Instead of
// `toZip()`'s `zipSync` (which builds the WHOLE archive as a 2nd full copy in memory), `streamZip`
// emits the archive chunk-by-chunk to a sink, so on a Chromium FileSystemWritableFileStream the zip
// never fully materializes. SCOPE: this removes the zip-output copy only (peak ≈2× → ≈1×); the
// in-memory file Map still holds the published tree until A.3 (OPFS→sink stream). These tests pin
// the SOURCE behaviour (the byte production) headlessly; the browser file-handle sink is verified
// in the browser. Parity is asserted on the UNZIPPED tree, not the zipped bytes (store vs deflate
// differ by design — see the doc-comment on ZipFilesystem.streamZip).

interface CollectedSink {
  write(chunk: Uint8Array): void | Promise<void>;
  close(): void | Promise<void>;
}
/** A test sink that copies each chunk (fflate may reuse the emitted buffer) and records the event
 *  order, so we can assert close() fires only after every write() has resolved (serial-drain). */
function collector() {
  const chunks: Uint8Array[] = [];
  const events: string[] = [];
  let pendingWrites = 0;
  const sink: CollectedSink = {
    write: async (chunk) => {
      pendingWrites++;
      // Yield a microtask so a fire-and-forget producer (one that ignores the returned promise)
      // would let close() jump the queue — making the serial-drain contract observable.
      await Promise.resolve();
      chunks.push(chunk.slice());
      events.push("write");
      pendingWrites--;
    },
    close: () => {
      events.push("close");
    },
  };
  return {
    sink,
    bytes: () => {
      const total = chunks.reduce((n, c) => n + c.byteLength, 0);
      const out = new Uint8Array(total);
      let o = 0;
      for (const c of chunks) {
        out.set(c, o);
        o += c.byteLength;
      }
      return out;
    },
    events: () => events,
    pendingWrites: () => pendingWrites,
  };
}

/** Write a flat path→bytes tree into a fresh ZipFilesystem through the seam (implicit dirs). */
async function fsFromTree(tree: Record<string, Uint8Array>): Promise<ZipFilesystem> {
  const fs = new ZipFilesystem();
  const root = await fs.root();
  for (const [path, bytes] of Object.entries(tree)) {
    const parts = path.split("/");
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectory(parts[i]!, { create: true });
    const w = await (await dir.getFile(parts[parts.length - 1]!, { create: true })).writable();
    await w.write(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    await w.close();
  }
  return fs;
}

/** Decode an unzipped record to a comparable path→number[] map (Uint8Array deep-equality is brittle). */
function asComparable(unzipped: Record<string, Uint8Array>): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(unzipped)) out[k] = Array.from(v);
  return out;
}

const enc = (s: string) => new TextEncoder().encode(s);

describe("ZipFilesystem.streamZip — chunked serialization (A.1)", () => {
  it("streams a nested tree that unzips identically to the eager toZip() path (the oracle)", async () => {
    const tree = { "manifest.json": enc('{"type":"Manifest"}'), "annotations/index.json": enc('{"a":1}') };
    const fs = await fsFromTree(tree);

    const c = collector();
    await fs.streamZip(c.sink);

    // Parity is on the UNZIPPED contents, not the zipped bytes (store vs deflate differ).
    expect(asComparable(unzipSync(c.bytes()))).toEqual(asComparable(unzipSync(fs.toZip())));
  });

  it("round-trips the exact source bytes (independent of the oracle)", async () => {
    const tree = { "manifest.json": enc('{"type":"Manifest"}'), "a/b/c.json": enc('{"deep":true}') };
    const fs = await fsFromTree(tree);

    const c = collector();
    await fs.streamZip(c.sink);

    expect(asComparable(unzipSync(c.bytes()))).toEqual({
      "manifest.json": Array.from(enc('{"type":"Manifest"}')),
      "a/b/c.json": Array.from(enc('{"deep":true}')),
    });
  });

  it("handles an empty (zero-byte) file", async () => {
    const fs = await fsFromTree({ "empty.txt": new Uint8Array(0), "x.json": enc("{}") });
    const c = collector();
    await fs.streamZip(c.sink);
    const out = unzipSync(c.bytes());
    expect(out["empty.txt"]!.byteLength).toBe(0);
    expect(new TextDecoder().decode(out["x.json"]!)).toBe("{}");
  });

  it("preserves binary bytes across a real chunk boundary (>64KB)", async () => {
    const big = new Uint8Array(70_000);
    for (let i = 0; i < big.length; i++) big[i] = (i * 31 + 7) & 0xff; // deterministic, incompressible-ish
    const fs = await fsFromTree({ "assets/blob.bin": big, "note.json": enc('{"n":1}') });

    const c = collector();
    await fs.streamZip(c.sink);

    const out = unzipSync(c.bytes());
    expect(Array.from(out["assets/blob.bin"]!)).toEqual(Array.from(big));
  });

  it("emits all entries for an N≥10 tree (ordering / no dropped files)", async () => {
    const tree: Record<string, Uint8Array> = {};
    for (let i = 0; i < 12; i++) tree[`f/${String(i).padStart(2, "0")}.json`] = enc(`{"i":${i}}`);
    const fs = await fsFromTree(tree);

    const c = collector();
    await fs.streamZip(c.sink);

    const out = unzipSync(c.bytes());
    expect(Object.keys(out).sort()).toEqual(Object.keys(tree).sort());
    for (let i = 0; i < 12; i++) {
      expect(new TextDecoder().decode(out[`f/${String(i).padStart(2, "0")}.json`]!)).toBe(`{"i":${i}}`);
    }
  });

  it("closes the sink only after every write has resolved, and exactly once (serial-drain)", async () => {
    const fs = await fsFromTree({ "a.json": enc("{}"), "b.json": enc("{}"), "c.json": enc("{}") });
    const c = collector();
    await fs.streamZip(c.sink);

    const events = c.events();
    expect(c.pendingWrites()).toBe(0); // no write left in flight
    expect(events[events.length - 1]).toBe("close"); // close is last
    expect(events.filter((e) => e === "close")).toHaveLength(1); // closed exactly once
    expect(events.filter((e) => e === "write").length).toBeGreaterThan(0); // something streamed
  });

  it("streams an empty filesystem to a valid (empty) archive", async () => {
    const fs = new ZipFilesystem();
    const c = collector();
    await fs.streamZip(c.sink);
    expect(c.events()).toContain("close");
    expect(Object.keys(unzipSync(c.bytes()))).toHaveLength(0);
  });
});
