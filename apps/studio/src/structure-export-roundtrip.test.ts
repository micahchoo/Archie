// The Archie-aef4 proof: the TWO-AUTHOR round trip, end to end over the real seams.
//   Author A (structure log authored under archie.structureRevlog) → publish to a real
//   `.archie.zip` (libraryToZip + PublishOptions.getStructure) → author B, holding the SAME
//   exhibit with a CONCURRENT section edit, imports A's zip through the canonical open seam
//   (openArchieLibrary) and the replaceProjectFrom → mergeImportedStructure path (Archie-2a9a)
//   → the touched section carries 2 heads and PROJECTS conflicted (42f3's gating engages).
// Before the export leg shipped, this whole chain was latent: no Archie-produced zip carried
// structure/history/ pages, so the import merge only ever fired for hand-carried trees.
// Harness shape follows replace-structure.test.ts (the 2a9a wiring tests): OPFS store primitives
// mocked onto a MemoryFilesystem; this file is new — no other stream's tests are touched.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MemoryFilesystem,
  appendEditSection,
  appendNewSection,
  asClientId,
  asExhibitId,
  headsOf,
  libraryToZip,
  loadLibrary,
  openArchieLibrary,
  projectSections,
  readStructureReport,
  sectionKey,
  writeStructure,
  asLibraryId,
  asObjectId,
  type Library,
  type SectionLog,
} from "@render/core";
import { createIngestFlows, type IngestContext } from "./ingest-flows.js";

const h = vi.hoisted(() => ({
  openStruct: null as null | ((slug: string) => Promise<unknown>),
}));
vi.mock("./store.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./store.js")>()),
  openExhibitAnnotationsDir: async () => null, // annotation persistence not under test (no OPFS)
  clearExhibitAnnotations: async () => {},
  openExhibitStructureDir: async (slug: string) => (h.openStruct ? h.openStruct(slug) : null),
}));

const alice = asClientId("alice");
const bob = asClientId("bob");
const SLUG = "voynich";
// loadLibrary recovers exhibit ids AS slugs, and on-disk structure pages carry only localIds —
// so the slug-derived id is the ONE id both sides of the merge recompose their SectionKeys under.
const exId = asExhibitId(SLUG);
const k1 = sectionKey(exId, "s1");

/** The shared-history fork: one base section, then A and B edit it CONCURRENTLY. */
function forkedLogs(): { authorA: SectionLog; authorB: SectionLog } {
  const base = appendNewSection([], { key: k1, order: "i", objectId: "o1", title: "Intro", lastEditor: alice, now: 1 }).log;
  return {
    authorA: appendEditSection(base, k1, { title: "Intro (A's take)", lastEditor: alice, now: 2 }).log,
    authorB: appendEditSection(base, k1, { title: "Intro (B's take)", lastEditor: bob, now: 3 }).log,
  };
}

/** Author A's library — same exhibit (slug) both authors hold. */
const libraryA: Library = {
  id: asLibraryId("lib-a"),
  exhibits: [{ id: exId, slug: SLUG, title: "Voynich", objects: [{ id: asObjectId("o1"), source: "https://img/f1.jpg", label: "f1", width: 10, height: 10 }] }],
};

/** The minimal IngestContext replaceProjectFrom touches (cf. replace-structure.test.ts). */
function makeCtx(over: Partial<IngestContext> = {}): IngestContext {
  return {
    baseUrl: "/",
    lib: { meta: { exhibits: [] }, setMeta: () => {}, persist: async () => {} },
    author: () => bob,
    cancelPendingSave: () => {},
    finishReplace: () => {},
    ...over,
  } as unknown as IngestContext;
}

beforeEach(() => {
  h.openStruct = null;
});

describe("two-author round trip: publish → .archie.zip → import merge (Archie-aef4 end to end)", () => {
  it("A publishes with structure; B's concurrent edit + import ⇒ 2 heads on the touched section, projected conflicted", async () => {
    const { authorA, authorB } = forkedLogs();

    // — Author A: publish the library to a real .archie.zip, structure log riding along.
    const { zip } = await libraryToZip(libraryA, () => [], { getStructure: () => authorA });

    // — Author B: local store already holds the SAME exhibit with a concurrent edit.
    const localFs = new MemoryFilesystem();
    const localDir = await (await localFs.root()).getDirectory("structure", { create: true });
    await writeStructure(localDir, authorB);
    h.openStruct = async () => localDir;

    // — B imports A's zip: the canonical untrusted-open seam, then the replace path that 2a9a
    //   wired mergeImportedStructure into.
    const srcFs = await openArchieLibrary(zip);
    const loaded = await loadLibrary(srcFs);
    const flows = createIngestFlows(makeCtx({ structureRevlog: true }));
    await flows.replaceProjectFrom(loaded, srcFs);

    // — The merge landed: shared base deduped by rev, both concurrent edits kept as PLURAL heads.
    const merged = await readStructureReport(localDir, exId);
    expect(merged.corrupt).toEqual([]);
    expect(merged.log.length).toBe(3); // base + A's edit + B's edit (base deduped)
    const heads = headsOf(merged.log, k1);
    expect(heads.length).toBe(2); // the ticket's proof: 2 heads on the touched section
    expect(new Set(heads.map((r) => r.title))).toEqual(new Set(["Intro (A's take)", "Intro (B's take)"]));

    // — And it PROJECTS conflicted: the 42f3 gating input (both head rows flagged, not auto-resolved).
    const projection = projectSections(merged.log, new Set(["o1"]));
    const rows = projection.sections.filter((r) => r.key === k1);
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.conflicted)).toBe(true);
  });

  it("B has NO local log: A's published section history lands whole via the same zip", async () => {
    const { authorA } = forkedLogs();
    const { zip } = await libraryToZip(libraryA, () => [], { getStructure: () => authorA });

    const localFs = new MemoryFilesystem();
    let dir: Awaited<ReturnType<MemoryFilesystem["root"]>> | null = null;
    h.openStruct = async () => (dir ??= await (await localFs.root()).getDirectory("structure", { create: true }));

    const srcFs = await openArchieLibrary(zip);
    const flows = createIngestFlows(makeCtx({ structureRevlog: true }));
    await flows.replaceProjectFrom(await loadLibrary(srcFs), srcFs);

    const landed = await readStructureReport(dir!, exId);
    expect(new Set(landed.log.map((r) => r.rev))).toEqual(new Set(authorA.map((r) => r.rev)));
    expect(headsOf(landed.log, k1).length).toBe(1); // linear history — nothing conflicted to gate
  });
});
