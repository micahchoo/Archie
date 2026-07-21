// Publish/export emits the structure rev-log (Archie-aef4) — the exchange leg that makes the
// zip/folder import merge (Archie-2a9a, mergeImportedStructure) reachable from an Archie-produced
// source. Pinned here:
//   1. NO-LOG COMPATIBILITY: a publish without a structure log (absent callback, or a callback
//      returning []) is byte-for-byte identical to the pre-Archie-aef4 output.
//   2. EMISSION LAYOUT: {slug}/structure/history/{localId}.json + history/index.json — exactly
//      what readStructure/readStructureReport (and thus mergeImportedStructure) read back.
//   3. WRITE ORDER: structure pages before the structure index (rule #1 via writeStructure), and
//      archie.json stays the LAST file of the WHOLE publish (the global commit point).
//   4. VIEWER TOLERANCE: a published tree WITH structure pages renders identically to one
//      without — the read paths fetch known files and never enumerate directories.
import { describe, it, expect } from "vitest";
import { publishLibrary, libraryToZip, readPublishedExhibit } from "./site.js";
import { collectFiles } from "./ghpages.js";
import { MemoryFilesystem } from "../fs/memory.js";
import { ZipFilesystem } from "../fs/zip.js";
import type { Filesystem, FsDirectory, FsFile, FsWritable } from "../fs/seam.js";
import { readStructure, readStructureReport } from "../spine/structure-persist.js";
import { appendNewSection, appendEditSection, sectionKey, orderKeyBetween, type SectionLog } from "../spine/structure.js";
import { appendNew } from "../spine/log.js";
import { asClientId, asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import type { Library } from "../model/model.js";
import type { AnnotationLog } from "../wadm/types.js";

const alice = asClientId("alice");
const exA = { id: asExhibitId("exA"), slug: "a", title: "Exhibit A", objects: [{ id: asObjectId("o1"), source: "https://img/a.jpg", label: "A1", width: 10, height: 10 }] };
const library: Library = { id: asLibraryId("lib"), exhibits: [exA] };
const logA: AnnotationLog = appendNew([], { target: "https://img/a.jpg", body: { type: "TextualBody", value: "note" }, lastEditor: alice, modifiedAt: "t", now: 1 }).log;
const getLog = (id: string): AnnotationLog => (id === "exA" ? logA : []);

/** A two-section structure log for exhibit exA (deterministic revs via now). */
function structLog(): SectionLog {
  const k1 = sectionKey(exA.id, "s1");
  const k2 = sectionKey(exA.id, "s2");
  const o1 = orderKeyBetween(null, null);
  const o2 = orderKeyBetween(o1, null);
  let log = appendNewSection([], { key: k1, order: o1, objectId: "o1", title: "Intro", prose: "Opening", lastEditor: alice, modifiedAt: "t1", now: 10 }).log;
  log = appendEditSection(log, k1, { title: "Intro v2", lastEditor: alice, modifiedAt: "t2", now: 11 }).log;
  log = appendNewSection(log, { key: k2, order: o2, objectId: "o1", title: "Detail", lastEditor: alice, modifiedAt: "t3", now: 12 }).log;
  return log;
}

const OPTS = { baseUrl: "https://u.gh.io/lib/", publishedAt: "2026-07-19T00:00:00.000Z" };

describe("publishLibrary — structure rev-log emission (Archie-aef4)", () => {
  it("NO-LOG PIN: absent getStructure and empty-log getStructure produce byte-identical trees", async () => {
    const without = new MemoryFilesystem();
    await publishLibrary(without, library, getLog, OPTS);
    const withEmpty = new MemoryFilesystem();
    await publishLibrary(withEmpty, library, getLog, { ...OPTS, getStructure: () => [] });
    const a = await collectFiles(await without.root());
    const b = await collectFiles(await withEmpty.root());
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
    expect(b).toEqual(a); // exactly today's output, byte for byte — and no structure/ path at all
    expect(Object.keys(a).some((p) => p.includes("structure"))).toBe(false);
  });

  it("emits {slug}/structure/history/ pages + index that readStructure round-trips (the import merge's layout)", async () => {
    const fs = new MemoryFilesystem();
    const log = structLog();
    await publishLibrary(fs, library, getLog, { ...OPTS, getStructure: (exhibitId) => (exhibitId === "exA" ? log : []) });
    const files = await collectFiles(await fs.root());
    expect(Object.keys(files)).toContain("a/structure/history/s1.json");
    expect(Object.keys(files)).toContain("a/structure/history/s2.json");
    expect(Object.keys(files)).toContain("a/structure/history/index.json");
    // Index urls are the default relative grammar — identical to what the studio store's own
    // writeStructure writes and what mergeImportedStructure's readStructureReport resolves.
    const index = JSON.parse((files["a/structure/history/index.json"] as { text: string }).text) as Record<string, string>;
    expect(index).toEqual({ s1: "structure/history/s1.json", s2: "structure/history/s2.json" });
    // Full round trip through the SAME reader the import merge uses.
    const structDir = await (await (await fs.root()).getDirectory("a")).getDirectory("structure");
    const reloaded = await readStructureReport(structDir, exA.id);
    expect(reloaded.corrupt).toEqual([]);
    expect(reloaded.log.map((r) => r.rev).sort()).toEqual(log.map((r) => r.rev).sort());
  });

  it("zip round trip: libraryToZip carries the structure pages through fromZip", async () => {
    const log = structLog();
    const { zip } = await libraryToZip(library, getLog, { ...OPTS, getStructure: () => log });
    const back = ZipFilesystem.fromZip(zip);
    const structDir = await (await (await back.root()).getDirectory("a")).getDirectory("structure");
    const reloaded = await readStructure(structDir, exA.id);
    expect(reloaded.map((r) => r.rev).sort()).toEqual(log.map((r) => r.rev).sort());
  });

  it("WRITE ORDER: structure pages before structure index; archie.json is the LAST write of the whole publish", async () => {
    const order: string[] = [];
    const mem = new MemoryFilesystem();
    const fs: Filesystem = { root: async () => new RecordingDir(await mem.root(), order, "") };
    await publishLibrary(fs, library, getLog, { ...OPTS, getStructure: () => structLog() });
    const structIdx = order.indexOf("a/structure/history/index.json");
    expect(structIdx).toBeGreaterThan(-1);
    for (const p of ["a/structure/history/s1.json", "a/structure/history/s2.json"]) {
      expect(order.indexOf(p)).toBeGreaterThan(-1);
      expect(order.indexOf(p)).toBeLessThan(structIdx); // pages first, index last (rule #1)
    }
    expect(order[order.length - 1]).toBe("archie.json"); // the global commit point stays LAST
  });

  it("VIEWER TOLERANCE: a tree WITH structure pages renders identically to one without", async () => {
    const bare = new MemoryFilesystem();
    await publishLibrary(bare, library, getLog, OPTS);
    const withStruct = new MemoryFilesystem();
    await publishLibrary(withStruct, library, getLog, { ...OPTS, getStructure: () => structLog() });
    // The shared published-tree reader (readExhibitTree via the fs source) — the same domino the
    // Viewer/preview paths consume. It reads known files, so the extra structure/ dir is inert.
    const a = await readPublishedExhibit(bare, "a");
    const b = await readPublishedExhibit(withStruct, "a");
    expect(b).toEqual(a);
  });
});

/** Directory wrapper recording the full path of every file OPENED for writing (the same
 *  instrument as structure-persist.test.ts's RecordingDir, with path prefixes). */
class RecordingDir implements FsDirectory {
  constructor(
    private readonly inner: FsDirectory,
    private readonly log: string[],
    private readonly prefix: string,
  ) {}
  async getDirectory(name: string, opts?: { create?: boolean }): Promise<FsDirectory> {
    return new RecordingDir(await this.inner.getDirectory(name, opts), this.log, `${this.prefix}${name}/`);
  }
  async getFile(name: string, opts?: { create?: boolean }): Promise<FsFile> {
    const f = await this.inner.getFile(name, opts);
    const log = this.log;
    const path = `${this.prefix}${name}`;
    return {
      readable: () => f.readable(),
      getFile: () => f.getFile(),
      size: () => f.size(),
      writable: async (): Promise<FsWritable> => {
        log.push(path);
        return f.writable();
      },
    };
  }
  remove(name: string): Promise<void> {
    return this.inner.remove(name);
  }
  entries(): AsyncIterable<{ name: string; kind: "file" | "directory" }> {
    return this.inner.entries();
  }
}
