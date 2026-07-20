import { describe, it, expect } from "vitest";
import { unzipSync } from "fflate";
import { ZipStreamFilesystem } from "./zip-stream.js";
import { ZipFilesystem } from "./zip.js";
import type { Filesystem } from "./seam.js";

// ZipStreamFilesystem — the WRITE-THROUGH streaming .archie.zip sink (SCALE LARGE-MEDIA-MEMORY-CEILING
// A). Unlike ZipFilesystem (whole tree in a Map, serialized after), this feeds each file into an
// fflate Zip as it closes and RELEASES media bytes immediately. These tests pin the byte production +
// the memory-release contract headlessly; the browser file-handle sink is verified in the browser.

/** A sink that concatenates every emitted chunk (fflate may reuse buffers → copy each) and records
 *  the event order, so we can assert close() fires only after the writes have drained. */
function collector() {
  const chunks: Uint8Array[] = [];
  const events: string[] = [];
  return {
    sink: {
      write: async (chunk: Uint8Array) => {
        await Promise.resolve(); // a microtask hop — a fire-and-forget producer would let close() jump ahead
        chunks.push(chunk.slice());
        events.push("write");
      },
      close: () => {
        events.push("close");
      },
    },
    bytes: (): Uint8Array => {
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
  };
}

const enc = (s: string) => new TextEncoder().encode(s);
/** Mirror site.ts writeJson/writeText: STRUCTURAL files are written as STRINGS (→ retained for read-back). */
async function writeText(fs: Filesystem, path: string, text: string): Promise<void> {
  const parts = path.split("/");
  let dir = await fs.root();
  for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectory(parts[i]!, { create: true });
  const w = await (await dir.getFile(parts[parts.length - 1]!, { create: true })).writable();
  await w.write(text);
  await w.close();
}
/** Mirror the media path: masters/thumbs/tiles are written as BYTES (→ streamed + released). */
async function writeBin(fs: Filesystem, path: string, bytes: Uint8Array): Promise<void> {
  const parts = path.split("/");
  let dir = await fs.root();
  for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectory(parts[i]!, { create: true });
  const w = await (await dir.getFile(parts[parts.length - 1]!, { create: true })).writable();
  await w.write(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  await w.close();
}

describe("ZipStreamFilesystem — write-through streaming zip sink", () => {
  it("entry integrity: a stream-written archive reopens via fromZip with identical contents", async () => {
    const c = collector();
    const fs = new ZipStreamFilesystem(c.sink);
    const master = new Uint8Array(70_000).map((_, i) => (i * 31 + 7) & 0xff); // >64KB, spans a chunk boundary
    await writeText(fs, "voynich/manifest.json", '{"type":"Manifest"}');
    await writeBin(fs, "voynich/assets/f1.jpg", master);
    await writeText(fs, "voynich/canvas/o1/annotations.json", '{"items":[]}');
    await fs.finish();

    // Reopen through the REAL open-side decoder (proves a valid central directory + intact entries).
    const reopened = ZipFilesystem.fromZip(c.bytes());
    const root = await reopened.root();
    const read = async (p: string): Promise<Uint8Array> => {
      const parts = p.split("/");
      let d = root;
      for (let i = 0; i < parts.length - 1; i++) d = await d.getDirectory(parts[i]!);
      return new Uint8Array(await (await d.getFile(parts[parts.length - 1]!)).readable());
    };
    expect(new TextDecoder().decode(await read("voynich/manifest.json"))).toBe('{"type":"Manifest"}');
    expect(new TextDecoder().decode(await read("voynich/canvas/o1/annotations.json"))).toBe('{"items":[]}');
    expect(Array.from(await read("voynich/assets/f1.jpg"))).toEqual(Array.from(master)); // media bytes exact
  });

  it("interleaved CONCURRENT writes serialize into a valid archive with contiguous entries", async () => {
    const c = collector();
    const fs = new ZipStreamFilesystem(c.sink);
    // Fan writes out concurrently (as the concurrent publishLibrary will), each yielding microtasks
    // between getFile/write/close so their commits genuinely interleave at the queue.
    const N = 24;
    await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        await Promise.resolve();
        const bin = new Uint8Array(1000 + i).map((_v, j) => (i * 7 + j) & 0xff);
        if (i % 2 === 0) await writeBin(fs, `ex/assets/m${i}.bin`, bin);
        else await writeText(fs, `ex/canvas/o${i}/annotations.json`, `{"i":${i}}`);
      }),
    );
    await fs.finish();

    const out = unzipSync(c.bytes()); // decodes only if every entry's bytes are contiguous (no interleave)
    expect(Object.keys(out)).toHaveLength(N);
    for (let i = 0; i < N; i++) {
      if (i % 2 === 0) {
        const expected = new Uint8Array(1000 + i).map((_v, j) => (i * 7 + j) & 0xff);
        expect(Array.from(out[`ex/assets/m${i}.bin`]!)).toEqual(Array.from(expected));
      } else {
        expect(new TextDecoder().decode(out[`ex/canvas/o${i}/annotations.json`]!)).toBe(`{"i":${i}}`);
      }
    }
  });

  it("RELEASES media bytes: a binary-written file is NOT held in the read-back surface", async () => {
    const c = collector();
    const fs = new ZipStreamFilesystem(c.sink);
    await writeText(fs, "voynich/manifest.json", '{"type":"Manifest"}'); // structural → retained
    await writeBin(fs, "voynich/assets/big.jpg", new Uint8Array(500_000)); // media → released
    await writeBin(fs, "voynich/f1_files/0/0_0.jpg", new Uint8Array(120_000)); // DZI tile → released

    const retained = fs.retainedPaths();
    expect(retained).toContain("voynich/manifest.json"); // read-back surface keeps structural JSON
    expect(retained).not.toContain("voynich/assets/big.jpg"); // media ref dropped
    expect(retained).not.toContain("voynich/f1_files/0/0_0.jpg");
    // The retained surface is structural-only — its footprint is independent of media volume.
    expect(retained).toEqual(["voynich/manifest.json"]);
    await fs.finish();
  });

  it("serves read-back of a structural file mid-stream, but a released media file reads as absent", async () => {
    const c = collector();
    const fs = new ZipStreamFilesystem(c.sink);
    await writeText(fs, "voynich/manifest.json", '{"ok":true}');
    await writeBin(fs, "voynich/assets/m.jpg", new Uint8Array(2048));

    // Read-back (what buildImageIndex does): the manifest is reachable and intact.
    const root = await fs.root();
    const man = await (await (await root.getDirectory("voynich")).getFile("manifest.json")).readable();
    expect(new TextDecoder().decode(new Uint8Array(man))).toBe('{"ok":true}');
    // A released media file is absent (→ getOptional would map to null, never a false read). The
    // absence surfaces at the first released segment (the empty `assets/` dir) — either way, "no such".
    const readReleasedMedia = async (): Promise<ArrayBuffer> => {
      const assets = await (await root.getDirectory("voynich")).getDirectory("assets");
      return (await assets.getFile("m.jpg")).readable();
    };
    await expect(readReleasedMedia()).rejects.toThrow(/no such/i);
    await fs.finish();
  });

  it("finishes an empty filesystem to a valid (empty) archive, closing the sink last", async () => {
    const c = collector();
    const fs = new ZipStreamFilesystem(c.sink);
    await fs.finish();
    expect(Object.keys(unzipSync(c.bytes()))).toHaveLength(0); // valid empty central directory
    const events = c.events();
    expect(events[events.length - 1]).toBe("close"); // close is last
    expect(events.filter((e) => e === "close")).toHaveLength(1); // exactly once
  });

  // Format guard (ZIP_FORMAT_LIMITS): fflate's writer silently wraps a >65 535 entry count and
  // truncates >4 GiB offsets (wzf writes them unchecked), so the stream must REFUSE with the
  // actionable steer instead of emitting a corrupt archive. Limits are injected tiny — the guard
  // logic is identical at the production ceilings.
  it("format guard: refuses the entry that would overflow the 2-byte entry count", async () => {
    const c = collector();
    const fs = new ZipStreamFilesystem(c.sink, { maxEntries: 2, maxBytes: 0xffff_ffff });
    await writeText(fs, "a.json", "{}");
    await writeText(fs, "b.json", "{}");
    await expect(writeText(fs, "c.json", "{}")).rejects.toThrow(/publish to a folder/i);
    // The refusal names the limit, not a generic failure.
    await expect(writeText(fs, "d.json", "{}")).rejects.toThrow(/files/i);
  });

  it("format guard: refuses once emitted bytes overflow a 4-byte offset", async () => {
    const c = collector();
    const fs = new ZipStreamFilesystem(c.sink, { maxEntries: 65_535, maxBytes: 1500 });
    await writeBin(fs, "ex/assets/m0.bin", new Uint8Array(1000)); // under the ceiling — fine
    // This entry's emission pushes `written` past maxBytes → its commit rejects (post-drain check).
    await expect(writeBin(fs, "ex/assets/m1.bin", new Uint8Array(1000))).rejects.toThrow(/publish to a folder/i);
  });

  it("format guard: a full stream at the production limits is untouched (round-trips)", async () => {
    const c = collector();
    const fs = new ZipStreamFilesystem(c.sink); // default ZIP_FORMAT_LIMITS
    await writeText(fs, "ex/manifest.json", '{"ok":true}');
    await writeBin(fs, "ex/assets/m.bin", new Uint8Array(10_000));
    await fs.finish();
    expect(Object.keys(unzipSync(c.bytes()))).toHaveLength(2);
  });
});
