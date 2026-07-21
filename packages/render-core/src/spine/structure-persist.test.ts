import { describe, it, expect } from "vitest";
import {
  sectionKey,
  orderKeyBetween,
  appendNewSection,
  appendEditSection,
  appendDeleteSection,
  appendUndeleteSection,
  resolveSectionConflict,
  projectSections,
  type SectionLog,
} from "./structure.js";
import { mergeLogs } from "./merge.js";
import { STRUCTURE_PAGE_FORMAT, type StructurePage } from "./structure-serialize.js";
import { writeStructure, readStructure, readStructureReport, StructureCorruptError } from "./structure-persist.js";
import { MemoryFilesystem } from "../fs/memory.js";
import type { FsDirectory, FsFile, FsWritable } from "../fs/seam.js";
import { asClientId, asExhibitId } from "../wadm/brand.js";

// Archie-a911 — the durable shape the probe did NOT prove (PROBE-structure-revlog sharp edge 5):
// the full author → persist (Filesystem seam) → reload → project round trip, plus the
// crash-consistency contracts (rules render-core-data-integrity #1 + #2): content pages first /
// index LAST, per-page tolerant reads, absent-vs-failed never collapsed.

const alice = asClientId("alice");
const bob = asClientId("bob");
const ex = asExhibitId("ex1");

const kIntro = sectionKey(ex, "intro");
const kMap = sectionKey(ex, "map");
const kGone = sectionKey(ex, "gone");
const kBack = sectionKey(ex, "back");

const sortByRev = (log: SectionLog) => [...log].sort((a, b) => (a.rev < b.rev ? -1 : a.rev > b.rev ? 1 : 0));

/** The full authored life: creates + edits + a kept tombstone + an un-delete + a resolved conflict. */
function authoredLog(): SectionLog {
  const o1 = orderKeyBetween(null, null);
  const o2 = orderKeyBetween(o1, null);
  const o3 = orderKeyBetween(o2, null);
  const o4 = orderKeyBetween(o3, null);
  let log: SectionLog;
  ({ log } = appendNewSection([], { key: kIntro, order: o1, objectId: "obj-1", title: "Intro", start: "xywh=0,0,10,10", prose: "See [note](archie:note/n1)", lastEditor: alice, modifiedAt: "t1", now: 1 }));
  ({ log } = appendEditSection(log, kIntro, { title: "Introduction", prose: null, lastEditor: bob, modifiedAt: "t2", now: 2 })); // edit + optional-field CLEAR
  ({ log } = appendNewSection(log, { key: kMap, order: o2, objectId: "obj-2", title: "Map", lastEditor: alice, modifiedAt: "t3", now: 3 }));
  ({ log } = appendNewSection(log, { key: kGone, order: o3, objectId: "obj-3", title: "Gone", lastEditor: alice, modifiedAt: "t4", now: 4 }));
  ({ log } = appendDeleteSection(log, kGone, { lastEditor: alice, modifiedAt: "t5", now: 5 })); // tombstone that STAYS
  ({ log } = appendNewSection(log, { key: kBack, order: o4, objectId: "obj-missing", title: "Back", prose: "raw archie: cite stays raw", lastEditor: alice, modifiedAt: "t6", now: 6 }));
  ({ log } = appendDeleteSection(log, kBack, { lastEditor: bob, modifiedAt: "t7", now: 7 }));
  ({ log } = appendUndeleteSection(log, kBack, { lastEditor: alice, modifiedAt: "t8", now: 8 })); // first-class un-delete
  // A real DAG conflict on kMap (two replicas edit the same head), merged then RESOLVED.
  const la = appendEditSection(log, kMap, { title: "Map (alice)", lastEditor: alice, modifiedAt: "t9", now: 9 }).log;
  const lb = appendEditSection(log, kMap, { title: "Map (bob)", start: "xywh=1,1,2,2", lastEditor: bob, modifiedAt: "t10", now: 10 }).log;
  const merged = mergeLogs(la, lb);
  return resolveSectionConflict(merged, kMap, { title: "Map (resolved)", lastEditor: alice, modifiedAt: "t11", now: 11 });
}

const liveObjects = new Set(["obj-1", "obj-2", "obj-3"]); // "obj-missing" dangles deliberately

async function structDirOf(fs: MemoryFilesystem): Promise<FsDirectory> {
  return (await fs.root()).getDirectory("structure", { create: true });
}

describe("writeStructure / readStructure — the full round-trip the probe lacked", () => {
  it("author -> persist -> reload == authored log (whole DAG, rev-exact)", async () => {
    const log = authoredLog();
    const fs = new MemoryFilesystem();
    const dir = await structDirOf(fs);
    await writeStructure(dir, log);
    const reloaded = await readStructure(dir, ex);
    expect(sortByRev(reloaded)).toEqual(sortByRev(log));
  });

  it("reloaded projection deep-equals the never-persisted projection (tombstone, un-delete, resolved conflict, dangling ref)", async () => {
    const log = authoredLog();
    const fs = new MemoryFilesystem();
    const dir = await structDirOf(fs);
    await writeStructure(dir, log);
    const reloaded = await readStructure(dir, ex);

    const fresh = projectSections(log, liveObjects); // never touched disk
    const persisted = projectSections(reloaded, liveObjects);
    expect(persisted).toEqual(fresh);
    // And the projection actually exercises every authored shape:
    expect(fresh.sections.map((s) => s.section.title)).toEqual(["Introduction", "Map (resolved)", "Back"]);
    expect(fresh.tombstoned).toEqual(new Set([kGone]));
    expect(fresh.sections.find((s) => s.key === kBack)!.missingObject).toBe(true);
    expect(fresh.sections.some((s) => s.conflicted)).toBe(false); // the conflict was resolved
  });

  it("re-writing the reloaded log is idempotent on disk (pure projection of the log)", async () => {
    const log = authoredLog();
    const fs = new MemoryFilesystem();
    const dir = await structDirOf(fs);
    await writeStructure(dir, log);
    const reloaded = await readStructure(dir, ex);
    await writeStructure(dir, reloaded);
    expect(sortByRev(await readStructure(dir, ex))).toEqual(sortByRev(log));
  });
});

describe("on-disk shape — local ids only, exhibit context comes from where the pages live (sharp edge 4)", () => {
  it("pages are keyed by LOCAL id and items carry localId with the exhibit prefix stripped", async () => {
    const log = authoredLog();
    const fs = new MemoryFilesystem();
    const dir = await structDirOf(fs);
    await writeStructure(dir, log);

    const hist = await dir.getDirectory("history");
    const names: string[] = [];
    for await (const e of hist.entries()) names.push(e.name);
    expect(names.sort()).toEqual(["back.json", "gone.json", "index.json", "intro.json", "map.json"]);

    const raw = new TextDecoder().decode(await (await hist.getFile("intro.json")).readable());
    const page = JSON.parse(raw) as StructurePage;
    expect(page.format).toBe(STRUCTURE_PAGE_FORMAT);
    expect(page.localId).toBe("intro");
    expect(page.items.length).toBe(2); // v1 + the edit
    for (const item of page.items) {
      expect(item.localId).toBe("intro"); // never the composed `ex1/intro`
    }
    expect(raw).not.toContain("ex1/"); // the composed key never reaches disk
  });

  it("reload recomposes SectionKeys via the passed exhibit id — a different exhibit context yields different keys", async () => {
    const log = authoredLog();
    const fs = new MemoryFilesystem();
    const dir = await structDirOf(fs);
    await writeStructure(dir, log);
    const other = asExhibitId("other");
    const reloaded = await readStructure(dir, other);
    expect(new Set(reloaded.map((r) => r.logicalId))).toEqual(new Set([sectionKey(other, "intro"), sectionKey(other, "map"), sectionKey(other, "gone"), sectionKey(other, "back")]));
  });
});

/** A directory wrapper that records the order in which files are OPENED for writing
 *  (same instrument as persist.corruption.test.ts). */
class RecordingDir implements FsDirectory {
  constructor(
    private readonly inner: FsDirectory,
    private readonly log: string[],
  ) {}
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
      writable: async (): Promise<FsWritable> => {
        log.push(name);
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

describe("write order — the index is the commit point (rule #1)", () => {
  it("writes every content page BEFORE history/index.json", async () => {
    const log = authoredLog();
    const fs = new MemoryFilesystem();
    const order: string[] = [];
    await writeStructure(new RecordingDir(await structDirOf(fs), order), log);
    const idxPos = order.indexOf("index.json");
    const pagePositions = order.map((n, i) => ({ n, i })).filter(({ n }) => n !== "index.json").map(({ i }) => i);
    expect(idxPos).toBe(order.length - 1); // LAST write, nothing after the commit point
    expect(pagePositions.length).toBe(4);
    for (const p of pagePositions) expect(p).toBeLessThan(idxPos);
  });

  it("torn write (crash before the index): content pages alone read as EMPTY, never as complete", async () => {
    const log = authoredLog();
    const fs = new MemoryFilesystem();
    const dir = await structDirOf(fs);
    await writeStructure(dir, log);
    const hist = await dir.getDirectory("history");
    await hist.remove("index.json"); // the commit never landed

    // The pages are still on disk…
    const names: string[] = [];
    for await (const e of hist.entries()) names.push(e.name);
    expect(names.length).toBe(4);
    // …but without a committed index the store reads as stale/absent — empty, NOT corrupt,
    // and NEVER a partial "complete" log.
    const { log: read, corrupt } = await readStructureReport(dir, ex);
    expect(read).toEqual([]);
    expect(corrupt).toEqual([]);
  });
});

describe("tolerant read — corrupt ≠ empty, per-page skip-and-report (rule #2)", () => {
  async function writtenStore(): Promise<{ dir: FsDirectory; hist: FsDirectory; log: SectionLog }> {
    const log = authoredLog();
    const fs = new MemoryFilesystem();
    const dir = await structDirOf(fs);
    await writeStructure(dir, log);
    return { dir, hist: await dir.getDirectory("history"), log };
  }

  it("an index listing a MISSING page reports corruption; the surviving sections still load", async () => {
    const { dir, hist } = await writtenStore();
    await hist.remove("intro.json"); // index still lists it
    const { log: read, corrupt } = await readStructureReport(dir, ex);
    expect(corrupt.map((c) => c.localId)).toEqual(["intro"]);
    expect(corrupt[0]!.url).toBe("structure/history/intro.json");
    expect(new Set(read.map((r) => r.logicalId))).toEqual(new Set([kMap, kGone, kBack])); // NOT all-or-nothing
  });

  it("a CORRUPT page (torn JSON) reports corruption; other pages survive; log-only read does not throw", async () => {
    const { dir, hist } = await writtenStore();
    const f = await hist.getFile("map.json", { create: true });
    const w = await f.writable();
    await w.write("{ not json");
    await w.close();

    const { log: read, corrupt } = await readStructureReport(dir, ex);
    expect(corrupt.map((c) => c.localId)).toEqual(["map"]);
    expect(corrupt[0]!.reason).toMatch(/JSON/i);
    expect(new Set(read.map((r) => r.logicalId))).toEqual(new Set([kIntro, kGone, kBack]));
    await expect(readStructure(dir, ex)).resolves.toHaveLength(read.length); // tolerant, no reject
  });

  it("a WRONG-SCHEMA page (valid JSON, not a structure page) is corrupt — refused, not silently absorbed", async () => {
    const { dir, hist } = await writtenStore();
    const f = await hist.getFile("gone.json", { create: true });
    const w = await f.writable();
    await w.write(JSON.stringify({ some: "other file" }));
    await w.close();
    const { corrupt } = await readStructureReport(dir, ex);
    expect(corrupt.map((c) => c.localId)).toEqual(["gone"]);
    expect(corrupt[0]!.reason).toMatch(/structure history page/);
  });

  it("a HOSTILE localId inside a page refuses to compose (containment) — reported corrupt, never a key escape", async () => {
    const { dir, hist } = await writtenStore();
    const raw = JSON.parse(new TextDecoder().decode(await (await hist.getFile("back.json")).readable())) as StructurePage;
    raw.items[0]!.localId = "../evil";
    const f = await hist.getFile("back.json", { create: true });
    const w = await f.writable();
    await w.write(JSON.stringify(raw));
    await w.close();
    const { log: read, corrupt } = await readStructureReport(dir, ex);
    expect(corrupt.map((c) => c.localId)).toEqual(["back"]);
    expect(corrupt[0]!.reason).toMatch(/invalid section localId/);
    expect(read.every((r) => !r.logicalId.includes(".."))).toBe(true);
  });

  it("a malformed ITEM in an otherwise well-formed page is skipped per-item; the rest of the page loads", async () => {
    const { dir, hist } = await writtenStore();
    const raw = JSON.parse(new TextDecoder().decode(await (await hist.getFile("intro.json")).readable())) as StructurePage;
    raw.items.push({ foreign: "junk" } as unknown as StructurePage["items"][number]);
    const f = await hist.getFile("intro.json", { create: true });
    const w = await f.writable();
    await w.write(JSON.stringify(raw));
    await w.close();
    const { log: read, corrupt } = await readStructureReport(dir, ex);
    expect(corrupt).toEqual([]); // the page itself is fine
    expect(read.filter((r) => r.logicalId === kIntro).length).toBe(2); // both real revs, junk skipped
  });

  it("an ABSENT store is empty, not corrupt (no history dir at all)", async () => {
    const fs = new MemoryFilesystem();
    const dir = await structDirOf(fs);
    const { log, corrupt } = await readStructureReport(dir, ex);
    expect(log).toEqual([]);
    expect(corrupt).toEqual([]);
  });

  it("a clean store reports NO corruption", async () => {
    const { dir } = await writtenStore();
    const { corrupt } = await readStructureReport(dir, ex);
    expect(corrupt).toEqual([]);
  });

  it("StructureCorruptError names the unreadable pages for callers that must refuse", async () => {
    const { dir, hist } = await writtenStore();
    await hist.remove("intro.json");
    const { corrupt } = await readStructureReport(dir, ex);
    const err = new StructureCorruptError(corrupt);
    expect(err.name).toBe("StructureCorruptError");
    expect(err.message).toContain("1 unreadable page(s)");
    expect(err.message).toContain("intro");
  });
});
