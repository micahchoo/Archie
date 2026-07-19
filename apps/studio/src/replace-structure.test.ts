// replaceProjectFrom × the structure rev-log (Archie-2a9a deliverable 1, the wiring layer): the
// open-zip/open-folder replace merges an incoming exhibit's structure/history/ pages into the local
// store — flag-ON only, source-fs only. The OFF path (the archie.structureRevlog default) is pinned
// here the way structure-session pins its own inertness: the replace never opens (so never creates)
// a local structure dir. OPFS store primitives are mocked onto a MemoryFilesystem.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MemoryFilesystem,
  appendEditSection,
  appendNewSection,
  asClientId,
  asExhibitId,
  headsOf,
  readStructureReport,
  sectionKey,
  writeStructure,
  type FsDirectory,
  type SectionLog,
} from "@render/core";
import { createIngestFlows, type IngestContext } from "./ingest-flows.js";

const h = vi.hoisted(() => ({
  /** Per-slug local structure dir factory — installed per test; null = OPFS unavailable. */
  openStruct: null as null | ((slug: string) => Promise<unknown>),
  structOpens: 0,
}));
vi.mock("./store.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./store.js")>()),
  openExhibitAnnotationsDir: async () => null, // annotation persistence is not under test (no OPFS)
  clearExhibitAnnotations: async () => {},
  openExhibitStructureDir: async (slug: string) => {
    h.structOpens++;
    return h.openStruct ? h.openStruct(slug) : null;
  },
}));

const alice = asClientId("alice");
const bob = asClientId("bob");
const EX = "voynich";
const exId = asExhibitId(EX); // loadLibrary recovers exhibit ids AS slugs — the post-replace id
const k1 = sectionKey(exId, "s1");

function divergedLogs(): { local: SectionLog; incoming: SectionLog } {
  const base = appendNewSection([], { key: k1, order: "i", objectId: "o1", title: "Intro", lastEditor: alice, now: 1 }).log;
  return {
    local: appendEditSection(base, k1, { title: "Intro (local)", lastEditor: alice, now: 2 }).log,
    incoming: appendEditSection(base, k1, { title: "Intro (incoming)", lastEditor: bob, now: 3 }).log,
  };
}

/** The minimal IngestContext replaceProjectFrom touches; everything else is inert. */
function makeCtx(over: Partial<IngestContext> = {}): IngestContext {
  return {
    baseUrl: "/",
    lib: { meta: { exhibits: [] }, setMeta: () => {}, persist: async () => {} },
    author: () => alice,
    cancelPendingSave: () => {},
    finishReplace: () => {},
    ...over,
  } as unknown as IngestContext;
}

/** A LoadedLibrary for one empty-object exhibit (annotation logs are not under test). */
const loadedLib = () =>
  ({ library: { id: "lib", exhibits: [{ id: EX, slug: EX, title: "Voynich", objects: [] }] }, logs: {} }) as never;

/** An incoming source tree, optionally carrying structure pages for the exhibit. */
async function makeSrcFs(structureLog?: SectionLog): Promise<MemoryFilesystem> {
  const src = new MemoryFilesystem();
  const exDir = await (await src.root()).getDirectory(EX, { create: true });
  const w = await (await exDir.getFile("manifest.json", { create: true })).writable();
  await w.write("{}");
  await w.close();
  if (structureLog) await writeStructure(await exDir.getDirectory("structure", { create: true }), structureLog);
  return src;
}

beforeEach(() => {
  h.openStruct = null;
  h.structOpens = 0;
});

describe("replaceProjectFrom — structure-log merge wiring (Archie-2a9a)", () => {
  it("flag ON: merges the incoming exhibit's structure log into the local store (plural heads kept)", async () => {
    const { local, incoming } = divergedLogs();
    const localFs = new MemoryFilesystem();
    const dir = await (await localFs.root()).getDirectory("structure", { create: true });
    await writeStructure(dir, local);
    h.openStruct = async () => dir;

    const flows = createIngestFlows(makeCtx({ structureRevlog: true }));
    await flows.replaceProjectFrom(loadedLib(), await makeSrcFs(incoming));

    const merged = (await readStructureReport(dir, exId)).log;
    expect(merged.length).toBe(3); // shared base deduped by rev
    expect(headsOf(merged, k1).length).toBe(2); // concurrent edits from the two copies — gated, not auto-resolved
  });

  it("flag OFF (the default): the replace never opens a local structure dir — byte-identical off path", async () => {
    const { incoming } = divergedLogs();
    const flows = createIngestFlows(makeCtx({ structureRevlog: false }));
    await flows.replaceProjectFrom(loadedLib(), await makeSrcFs(incoming));
    expect(h.structOpens).toBe(0);
  });

  it("flag ON, incoming tree WITHOUT structure pages: local structure store never opened (seed-from-array stays)", async () => {
    const flows = createIngestFlows(makeCtx({ structureRevlog: true }));
    await flows.replaceProjectFrom(loadedLib(), await makeSrcFs());
    expect(h.structOpens).toBe(0);
  });

  it("flag ON, no source fs (a caller without the tree in hand): structure untouched", async () => {
    const flows = createIngestFlows(makeCtx({ structureRevlog: true }));
    await flows.replaceProjectFrom(loadedLib());
    expect(h.structOpens).toBe(0);
  });

  it("flag ON, exhibit with NO local log: the incoming section history lands whole", async () => {
    const { incoming } = divergedLogs();
    const localFs = new MemoryFilesystem();
    let dir: FsDirectory | null = null;
    h.openStruct = async () => (dir ??= await (await localFs.root()).getDirectory("structure", { create: true }));

    const flows = createIngestFlows(makeCtx({ structureRevlog: true }));
    await flows.replaceProjectFrom(loadedLib(), await makeSrcFs(incoming));

    const landed = (await readStructureReport(dir!, exId)).log;
    expect(new Set(landed.map((r) => r.rev))).toEqual(new Set(incoming.map((r) => r.rev)));
  });
});
