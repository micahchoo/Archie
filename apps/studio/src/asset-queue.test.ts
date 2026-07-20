// Issue 26 / ledgers/ASSETQ.md: binary asset writes route through the save-queue (failures visible) and
// a quota preflight refuses cleanly. Drives the real createIngestFlows factory with a minimal
// IngestContext; the store writers are mocked so a test can force a write failure deterministically.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Controllable store writers. Each test flips *Fail to make the next write reject (an OPFS/quota error).
const saveAssetFile = vi.fn(async () => {});
const saveOriginalFile = vi.fn(async () => {});
const saveThumbFile = vi.fn(async () => {});
vi.mock("./store.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./store.js")>()),
  saveAssetFile,
  saveOriginalFile,
  saveThumbFile,
}));

const { createIngestFlows: makeFlows } = await import("./ingest-flows.js");
type IngestContext = import("./ingest-flows.js").IngestContext;
type ExhibitMeta = import("./store.js").ExhibitMeta;
const { saveStatus, resetSaveQueueForTests } = await import("./save-queue.svelte.js");

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function makeCtx(overrides: Partial<IngestContext> = {}) {
  const exhibits: ExhibitMeta[] = [{ id: "ex-a", slug: "a", title: "A", objects: [] } as unknown as ExhibitMeta];
  let currentSlug = "a";
  const notes: string[] = [];
  const ctx: IngestContext = {
    baseUrl: "/",
    lib: {
      meta: { exhibits },
      appendObject: async (slug: string, obj: any) => {
        const ex = exhibits.find((e) => e.slug === slug);
        if (ex) (ex.objects as any[]).push(obj);
      },
      // Bulk append (ingest-batch scale-fix): addFiles/import loops commit a run of objects in one call now.
      appendObjects: async (slug: string, objs: any[]) => {
        const ex = exhibits.find((e) => e.slug === slug);
        if (ex) (ex.objects as any[]).push(...objs);
      },
      setMeta: () => {},
      persist: async () => {},
    } as any,
    author: () => "alice" as any,
    currentSlug: () => currentSlug,
    storeReady: () => true,
    objects: () => (exhibits.find((e) => e.slug === currentSlug)?.objects ?? []) as any,
    currentObjectId: () => "",
    currentReadings: () => [],
    session: () => ({}) as any,
    seedMaster: () => {},
    setPlate: () => {},
    setCurrentObjectId: () => {},
    setImportStatus: () => {},
    setImportNote: (s: string) => notes.push(s),
    addPendingNotes: () => 0,
    setCollabNote: () => {},
    canvasIdOf: (id: string) => id,
    switchObject: () => {},
    toEditor: () => {},
    newExhibit: async () => {},
    newExhibitInLibrary: async () => "exhibit",
    openExhibit: async (slug: string) => { currentSlug = slug; },
    bump: () => {},
    cancelPendingSave: () => {},
    finishReplace: () => {},
    confirmReplace: () => true,
    alert: (msg: string) => notes.push(msg),
    ...overrides,
  };
  return { ctx, exhibits, notes };
}

const av = (name = "clip.mp3") => new File([new Uint8Array([1, 2, 3])], name, { type: "audio/mpeg" });

describe("asset writes route through the save-queue (Issue 26 / ASSETQ Q1)", () => {
  beforeEach(() => {
    resetSaveQueueForTests();
    saveAssetFile.mockReset().mockResolvedValue(undefined);
    saveOriginalFile.mockReset().mockResolvedValue(undefined);
    saveThumbFile.mockReset().mockResolvedValue(undefined);
    vi.unstubAllGlobals();
  });

  it("a successful AV import is visible-green and appends the object", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = makeFlows(ctx);
    const r = await flows.addObjectFromFile(av());
    expect(r.added).toBe(true);
    expect(exhibits[0]!.objects.length).toBe(1);
    expect(saveStatus.health).toBe("saved");
  });

  it("a FAILED asset write is now visible in saveStatus AND aborts the add (no dangling ref)", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = makeFlows(ctx);
    saveAssetFile.mockRejectedValueOnce(new Error("OPFS write failed"));
    const r = await flows.addObjectFromFile(av());
    await tick();
    expect(r.added).toBe(false); // reference-after-bytes: no object appended
    expect(exhibits[0]!.objects.length).toBe(0); // library.json would reference nothing
    expect(saveStatus.health).toBe("error"); // NO LONGER invisible — the contract holds
    expect(saveStatus.error).toContain("Media couldn't be stored");
  });
});

describe("no quota preflight — estimate() never gates an import (reverses Issue 26 / ASSETQ Q3)", () => {
  // The Q3 preflight compared the batch to `estimate().quota - usage`. Chromium reports quota as
  // `usage + 10 GiB` — a static privacy constant (kStaticStorageQuota) — so that arithmetic refused
  // any batch over ~9.5 GB regardless of real headroom (measured: a 17.8 GB import refused with
  // ~1 TB of enforced-quota headroom; docs/research/browser-storage-quota.md). The write itself is
  // the only truthful signal now; the clean-refusal property Q3 proved lives on in the write path
  // (reference-after-bytes: a failed write appends no object) and the stop-early contract
  // (ingest-flows.test.ts "storage failure stops the batch early").
  beforeEach(() => {
    resetSaveQueueForTests();
    saveAssetFile.mockReset().mockResolvedValue(undefined);
    vi.unstubAllGlobals();
  });

  function stubEstimate(quota: number, usage: number) {
    vi.stubGlobal("navigator", { storage: { estimate: async () => ({ quota, usage }) } });
  }

  it("a batch larger than the REPORTED headroom still attempts its writes — the constant must not gate", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = makeFlows(ctx);
    stubEstimate(1000, 999); // reported headroom ~1 byte; the import is 3 bytes — the old preflight refused this
    const files = { 0: av(), length: 1, item: () => av() } as unknown as FileList;
    await flows.addFiles(files);
    expect(saveAssetFile).toHaveBeenCalled(); // the write is attempted; only a REAL failure refuses
    expect(exhibits[0]!.objects.length).toBe(1);
  });

  it("with ample free space the import proceeds", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = makeFlows(ctx);
    stubEstimate(1_000_000, 0);
    const files = { 0: av(), length: 1, item: () => av() } as unknown as FileList;
    await flows.addFiles(files);
    expect(saveAssetFile).toHaveBeenCalled();
    expect(exhibits[0]!.objects.length).toBe(1);
  });
});
