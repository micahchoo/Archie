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
  collectFiles,
  type FsDirectory,
  type Library,
  type SectionLog,
} from "@render/core";
import { createIngestFlows, type IngestContext } from "./ingest-flows.js";
import { createPublishFlows, type PublishDeps } from "./publish-flows.svelte.js";

const h = vi.hoisted(() => ({
  openStruct: null as null | ((slug: string) => Promise<unknown>),
  /** Non-creating publish-side probe (openExhibitStructureDirIfExists) — null = no persisted log. */
  openStructRO: null as null | ((slug: string) => Promise<unknown>),
}));
vi.mock("./store.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./store.js")>()),
  openExhibitAnnotationsDir: async () => null, // annotation persistence not under test (no OPFS)
  clearExhibitAnnotations: async () => {},
  openExhibitStructureDir: async (slug: string) => (h.openStruct ? h.openStruct(slug) : null),
  openExhibitStructureDirIfExists: async (slug: string) => (h.openStructRO ? h.openStructRO(slug) : null),
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
  h.openStructRO = null;
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
    // NON-flag path (Archie-b0b1): no structureRevlog is set — the import merge is ungated, driven by
    // the incoming pages that the export leg wrote, so the round trip holds regardless of the flag.
    const flows = createIngestFlows(makeCtx());
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
    const flows = createIngestFlows(makeCtx()); // ungated — no flag set (Archie-b0b1)
    await flows.replaceProjectFrom(await loadLibrary(srcFs), srcFs);

    const landed = await readStructureReport(dir!, exId);
    expect(new Set(landed.log.map((r) => r.rev))).toEqual(new Set(authorA.map((r) => r.rev)));
    expect(headsOf(landed.log, k1).length).toBe(1); // linear history — nothing conflicted to gate
  });
});

// Torn structure store at publish time (Archie-aef4 review finding). Posture = PARITY with the
// annotation publish path (loadAllLogs → AnnotationSession.load → readAnnotationsReport →
// `.entries` ships the readable subset, `loadCorruption` never consulted at publish): publish
// exports what READS. Partial-corrupt → the readable pages ship, with a warn. ALL-corrupt → the
// export carries NO structure at all (the published artifact reads as "never authored" — the
// rule-2 collapse, accepted for consistency, made loud), with a distinct NOT-exported warn.
// The local store is never touched by publishing (getStructure is read-only + non-creating).
describe("publish with a torn structure store — parity with the annotation ship-what-reads posture", () => {
  function publishDeps(): PublishDeps {
    return {
      publishBase: () => "https://u.gh.io/lib/",
      flushExhibit: async () => {},
      loadAllLogs: async () => ({}),
      buildFullLibrary: () => libraryA,
      exhibits: () => [],
      canFolder: () => false,
      currentZipName: () => "lib.archie.zip",
    };
  }
  /** A two-section persisted store, with the given pages then clobbered to garbage in place. */
  async function tornStore(corruptIds: string[]): Promise<FsDirectory> {
    const k2 = sectionKey(exId, "s2");
    let log = appendNewSection([], { key: k1, order: "i", objectId: "o1", title: "Intro", lastEditor: alice, now: 1 }).log;
    log = appendNewSection(log, { key: k2, order: "m", objectId: "o1", title: "Map", lastEditor: alice, now: 2 }).log;
    const dir = await (await new MemoryFilesystem().root()).getDirectory("structure", { create: true });
    await writeStructure(dir, log);
    const hist = await dir.getDirectory("history");
    for (const id of corruptIds) {
      const w = await (await hist.getFile(`${id}.json`)).writable();
      await w.write("not json{");
      await w.close();
    }
    return dir;
  }
  const structureWarns = (spy: ReturnType<typeof vi.spyOn>) =>
    spy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("structure") || m.includes("section history"));

  it("PARTIAL-corrupt: the readable pages ship, the torn page is skipped, and the publish warns", async () => {
    const dir = await tornStore(["s2"]);
    h.openStructRO = async () => dir;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const out = new MemoryFilesystem();
      await createPublishFlows(publishDeps()).writeToFolder(out);
      const files = await collectFiles(await out.root());
      expect(Object.keys(files)).toContain("voynich/structure/history/s1.json"); // readable history ships
      expect(Object.keys(files)).not.toContain("voynich/structure/history/s2.json"); // torn page skipped
      const index = JSON.parse((files["voynich/structure/history/index.json"] as { text: string }).text) as Record<string, string>;
      expect(Object.keys(index)).toEqual(["s1"]); // the EXPORT's index only names what it carries
      const warns = structureWarns(warn);
      expect(warns.length).toBe(1);
      expect(warns[0]).toContain("1 unreadable structure history page(s)");
    } finally {
      warn.mockRestore();
    }
  });

  it("ALL-corrupt: nothing ships (reads as never-authored — the accepted parity collapse) and the warn says NOT exported", async () => {
    const dir = await tornStore(["s1", "s2"]);
    h.openStructRO = async () => dir;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const out = new MemoryFilesystem();
      await createPublishFlows(publishDeps()).writeToFolder(out);
      const files = await collectFiles(await out.root());
      expect(Object.keys(files).some((p) => p.includes("structure"))).toBe(false); // no structure/ at all
      const warns = structureWarns(warn);
      expect(warns.length).toBe(1);
      expect(warns[0]).toContain("NOT exported"); // distinct from the partial-corrupt advisory
      expect(warns[0]).toContain('"voynich"'); // exhibit named
    } finally {
      warn.mockRestore();
    }
  });

  // Archie-a690 remaining scope: the console warns above are pre-publish-time, invisible to a curator.
  // These pin that the SAME findings ride into the flows' `corruptLogs` state (what the Publish dialog
  // renders as its advisory) — BEFORE the artifact ships — for both log families, with the all-corrupt
  // vs partial distinction preserved.
  it("structure PARTIAL-corrupt → a 'sections' advisory finding (allCorrupt:false, readable subset ships)", async () => {
    const dir = await tornStore(["s2"]);
    h.openStructRO = async () => dir;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const flows = createPublishFlows(publishDeps());
      await flows.projectSiteFs();
      expect(flows.corruptLogs).toEqual([{ slug: "voynich", family: "sections", corruptCount: 1, allCorrupt: false }]);
    } finally {
      warn.mockRestore();
    }
  });

  it("structure ALL-corrupt → the advisory marks it allCorrupt:true (reads as never-authored)", async () => {
    const dir = await tornStore(["s1", "s2"]);
    h.openStructRO = async () => dir;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const flows = createPublishFlows(publishDeps());
      await flows.projectSiteFs();
      expect(flows.corruptLogs).toEqual([{ slug: "voynich", family: "sections", corruptCount: 2, allCorrupt: true }]);
    } finally {
      warn.mockRestore();
    }
  });

  it("annotation findings (from the loadAllLogs pass) ride into the SAME advisory list", async () => {
    // No structure store here (openStructRO stays null) — the advisory carries the annotation side alone,
    // proving both families feed one list via deps.annotationCorruption.
    const annFinding = { slug: "herbal", family: "annotations" as const, corruptCount: 2, allCorrupt: true };
    const flows = createPublishFlows({ ...publishDeps(), annotationCorruption: () => [annFinding] });
    await flows.projectSiteFs();
    expect(flows.corruptLogs).toEqual([annFinding]);
  });
});
