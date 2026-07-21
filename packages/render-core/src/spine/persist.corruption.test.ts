import { describe, it, expect } from "vitest";
import { appendNew } from "./log.js";
import { writeAnnotations, readAnnotations, readAnnotationsReport } from "./persist.js";
import { MemoryFilesystem } from "../fs/memory.js";
import type { FsDirectory, FsFile, FsWritable } from "../fs/seam.js";
import { asClientId } from "../wadm/brand.js";
import type { AnnotationLog } from "../wadm/types.js";

// Issue 19 — crash-consistency of the annotation store. A torn write (index committed before its
// pages) or a corrupt page must NOT silently empty an exhibit: reads are per-page tolerant and report
// corruption; the index is the commit point (written LAST).

const alice = asClientId("alice");
const target = "https://example.org/canvas/1";

function twoNoteLog(): { log: AnnotationLog; ids: string[] } {
  const { log: l1, record: a } = appendNew([], { target, body: { type: "TextualBody", value: "a1" }, lastEditor: alice, now: 1 });
  const { log: l2, record: b } = appendNew(l1, { target, body: { type: "TextualBody", value: "b1" }, lastEditor: alice, now: 2 });
  return { log: l2, ids: [a.logicalId, b.logicalId] };
}

/** A directory wrapper that records the order in which files are OPENED for writing. */
class RecordingDir implements FsDirectory {
  constructor(private readonly inner: FsDirectory, private readonly log: string[]) {}
  async getDirectory(name: string, opts?: { create?: boolean }): Promise<FsDirectory> {
    return new RecordingDir(await this.inner.getDirectory(name, opts), this.log);
  }
  async getFile(name: string, opts?: { create?: boolean }): Promise<FsFile> {
    const f = await this.inner.getFile(name, opts);
    const log = this.log;
    return {
      readable: () => f.readable(),
      getFile: () => f.getFile(),
      size: () => f.size(),
      writable: async (): Promise<FsWritable> => { log.push(name); return f.writable(); },
    };
  }
  remove(name: string): Promise<void> { return this.inner.remove(name); }
  entries(): AsyncIterable<{ name: string; kind: "file" | "directory" }> { return this.inner.entries(); }
}

describe("Issue 19 — write order: index is the commit point", () => {
  it("writes every history page BEFORE index.json", async () => {
    const { log } = twoNoteLog();
    const fs = new MemoryFilesystem();
    const order: string[] = [];
    await writeAnnotations(new RecordingDir(await fs.root(), order), log);
    const idxPos = order.indexOf("index.json");
    const pagePositions = order
      .map((n, i) => ({ n, i }))
      .filter(({ n }) => n.endsWith(".json") && n !== "index.json" && n !== "heads.json")
      .map(({ i }) => i);
    expect(idxPos).toBeGreaterThanOrEqual(0);
    expect(pagePositions.length).toBeGreaterThan(0);
    for (const p of pagePositions) expect(p).toBeLessThan(idxPos); // pages first, index last
  });
});

describe("Issue 19 — per-page tolerant read (corrupt ≠ empty)", () => {
  it("19a: an index listing a MISSING page reports corruption, and the surviving page still loads", async () => {
    const { log, ids } = twoNoteLog();
    const fs = new MemoryFilesystem();
    const root = await fs.root();
    await writeAnnotations(root, log);
    const hist = await root.getDirectory("history");
    await hist.remove(`${ids[0]}.json`); // torn write: index still lists it

    const { log: read, corrupt } = await readAnnotationsReport(root);
    expect(corrupt.map((c) => c.logicalId)).toEqual([ids[0]]); // reported, not swallowed
    expect(read.length).toBe(1); // the surviving note still loads — NOT all-or-nothing
    expect(read[0]!.logicalId).toBe(ids[1]);
  });

  it("19b: one CORRUPT page (invalid JSON) reports corruption, other pages survive", async () => {
    const { log, ids } = twoNoteLog();
    const fs = new MemoryFilesystem();
    const root = await fs.root();
    await writeAnnotations(root, log);
    const hist = await root.getDirectory("history");
    const f = await hist.getFile(`${ids[0]}.json`, { create: true });
    const w = await f.writable(); await w.write("{ not json"); await w.close();

    const { log: read, corrupt } = await readAnnotationsReport(root);
    expect(corrupt.map((c) => c.logicalId)).toEqual([ids[0]]);
    expect(corrupt[0]!.reason).toMatch(/JSON/i);
    expect(read.length).toBe(1);
    expect(read[0]!.logicalId).toBe(ids[1]);
  });

  it("readAnnotations (log-only) stays tolerant: returns the readable subset, does not reject", async () => {
    const { log, ids } = twoNoteLog();
    const fs = new MemoryFilesystem();
    const root = await fs.root();
    await writeAnnotations(root, log);
    await (await root.getDirectory("history")).remove(`${ids[0]}.json`);
    const read = await readAnnotations(root); // must NOT throw (was: Promise.all reject)
    expect(read.length).toBe(1);
  });

  it("an ABSENT store is empty, not corrupt (no history dir, no committed index)", async () => {
    const fs = new MemoryFilesystem();
    const { log, corrupt } = await readAnnotationsReport(await fs.root());
    expect(log).toEqual([]);
    expect(corrupt).toEqual([]);
  });

  it("a clean store reports NO corruption", async () => {
    const { log } = twoNoteLog();
    const fs = new MemoryFilesystem();
    const root = await fs.root();
    await writeAnnotations(root, log);
    const { corrupt } = await readAnnotationsReport(root);
    expect(corrupt).toEqual([]);
  });
});
