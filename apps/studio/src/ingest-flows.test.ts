// Ingest-flow tests (tend Issue 7, ledgers/NEGSPACE.md). This path had zero direct coverage before —
// each test below reproduces one of the negative-space matrix's real findings against the actual
// createIngestFlows factory (not a reimplementation), with a minimal in-memory IngestContext mock.
import { describe, it, expect, vi } from "vitest";
import { createIngestFlows, type IngestContext } from "./ingest-flows.js";
import type { ExhibitMeta } from "./store.js";

// OPFS isn't available in the jsdom/happy-dom test env; the AV branch of addObjectFromFile is the
// simplest deterministic path through it (no EXIF/downscale/thumbnail image decoding either), so
// tests below use audio files and stub the file-write calls.
vi.mock("./store.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./store.js")>()),
  saveAssetFile: vi.fn(async () => {}),
  saveOriginalFile: vi.fn(async () => {}),
  saveThumbFile: vi.fn(async () => {}),
}));

/** A minimal in-memory IngestContext. `currentSlug` is a mutable ref so a test can simulate the user
 *  navigating to a different exhibit mid-import — exactly the case the mid-flow-interruption fix guards. */
function makeCtx(overrides: Partial<IngestContext> = {}) {
  const exhibits: ExhibitMeta[] = [];
  let currentSlug = "";
  let currentObjectId = "";
  const alerts: string[] = [];
  const notes: string[] = [];
  const ctx: IngestContext = {
    baseUrl: "/",
    lib: {
      meta: { exhibits },
      appendObject: async (slug: string, obj: any) => {
        const ex = exhibits.find((e) => e.slug === slug);
        if (ex) (ex.objects as any[]).push(obj);
      },
      setMeta: () => {},
      persist: async () => {},
    } as any,
    author: () => "alice" as any,
    currentSlug: () => currentSlug,
    storeReady: () => true,
    objects: () => (exhibits.find((e) => e.slug === currentSlug)?.objects ?? []) as any,
    currentObjectId: () => currentObjectId,
    currentReadings: () => [],
    session: () => ({}) as any,
    seedMaster: () => {},
    setPlate: () => {},
    setCurrentObjectId: (id: string) => { currentObjectId = id; },
    setImportStatus: () => {},
    setImportNote: (s: string) => notes.push(s),
    addPendingNotes: () => 0,
    setAddingObject: () => {},
    clearAddForm: () => {},
    setMapModalOpen: () => {},
    setCollabNote: () => {},
    canvasIdOf: (id: string) => id,
    switchObject: () => {},
    toEditor: () => {},
    newExhibit: async (title: string) => {
      const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "exhibit";
      exhibits.push({ id: `ex-${slug}`, slug, title, objects: [] } as unknown as ExhibitMeta);
      currentSlug = slug; // mirrors App.svelte's newExhibit -> openExhibit side effect
    },
    openExhibit: async (slug: string) => { currentSlug = slug; },
    bump: () => {},
    cancelPendingSave: () => {},
    finishReplace: () => {},
    confirmReplace: () => true,
    alert: (msg: string) => alerts.push(msg),
    ...overrides,
  };
  return { ctx, exhibits, alerts, notes, switchTo: (slug: string) => { currentSlug = slug; } };
}

describe("newExhibitFromManifest — mid-flow exhibit switch (NEGSPACE row 3)", () => {
  it("keeps every planned object on the exhibit the import created, even if the user switches away mid-import", async () => {
    const { ctx, exhibits, switchTo } = makeCtx();
    const flows = createIngestFlows(ctx);
    // Pre-existing exhibit the user will "switch to" mid-import.
    exhibits.push({ id: "ex-other", slug: "other", title: "Other", objects: [] } as unknown as ExhibitMeta);

    // Stub global fetch to return a 2-canvas P3 manifest; after the FIRST object is appended, flip
    // ctx.currentSlug() to "other" — simulating the user clicking into a different exhibit mid-loop.
    const manifest = {
      type: "Manifest",
      label: { none: ["Imported"] },
      items: [
        { type: "Canvas", items: [{ items: [{ body: { id: "https://x/1.jpg", type: "Image" } }] }] },
        { type: "Canvas", items: [{ items: [{ body: { id: "https://x/2.jpg", type: "Image" } }] }] },
      ],
    };
    const body = new TextEncoder().encode(JSON.stringify(manifest));
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-length": String(body.byteLength) }),
      arrayBuffer: async () => body.buffer,
    })));

    const origAppendObject = ctx.lib.appendObject.bind(ctx.lib);
    let calls = 0;
    ctx.lib.appendObject = async (slug: string, obj: any) => {
      calls++;
      if (calls === 1) switchTo("other"); // user navigates away right after the first object lands
      return origAppendObject(slug, obj);
    };

    await flows.newExhibitFromManifest("https://x/manifest.json");

    const imported = exhibits.find((e) => e.slug === "imported")!;
    const other = exhibits.find((e) => e.slug === "other")!;
    expect(imported.objects.length).toBe(2); // BOTH objects landed on the exhibit the import created
    expect(other.objects.length).toBe(0); // none leaked onto the exhibit the user switched to
  });
});

describe("newExhibitFromFolder — mid-flow exhibit switch (NEGSPACE row 4)", () => {
  it("keeps a group's files on its own exhibit even if the user switches exhibits between files", async () => {
    const { ctx, exhibits, switchTo } = makeCtx();
    const flows = createIngestFlows(ctx);
    exhibits.push({ id: "ex-other", slug: "other", title: "Other", objects: [] } as unknown as ExhibitMeta);

    const makeFile = (name: string) => Object.assign(new File([new Uint8Array([0])], name, { type: "audio/mpeg" }), { webkitRelativePath: `roll/${name}` });
    const files = [makeFile("a.mp3"), makeFile("b.mp3")];

    const origAppendObject = ctx.lib.appendObject.bind(ctx.lib);
    let calls = 0;
    ctx.lib.appendObject = async (slug: string, obj: any) => {
      calls++;
      if (calls === 1) switchTo("other"); // user navigates away after the first file lands
      return origAppendObject(slug, obj);
    };

    await flows.newExhibitFromFolder(files);

    const roll = exhibits.find((e) => e.slug === "roll")!;
    const other = exhibits.find((e) => e.slug === "other")!;
    expect(roll.objects.length).toBe(2); // both files landed on the folder's own exhibit
    expect(other.objects.length).toBe(0); // none leaked onto the exhibit the user switched to
  });
});

describe("no-byte-cap fixes (NEGSPACE rows 5-7)", () => {
  it("newExhibitFromManifest rejects a huge response via the declared content-length, before reading the body", async () => {
    const { ctx } = makeCtx();
    const flows = createIngestFlows(ctx);
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-length": String(64 * 1024 * 1024) }), // over the 32 MB cap
      arrayBuffer,
    })));
    await flows.newExhibitFromManifest("https://x/huge-manifest.json");
    expect(arrayBuffer).not.toHaveBeenCalled(); // rejected on the declared header — body never read
  });

  it("newExhibitFromManifest rejects a huge response by actual size when content-length is absent/lying", async () => {
    const { ctx, alerts } = makeCtx();
    const flows = createIngestFlows(ctx);
    const big = new ArrayBuffer(33 * 1024 * 1024); // over the 32 MB cap, no content-length header at all
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, headers: new Headers(), arrayBuffer: async () => big })));
    await flows.newExhibitFromManifest("https://x/huge-manifest.json");
    expect(alerts.at(-1)).toMatch(/too large/);
  });

  it("importNotesCsv rejects a file over the local-text-import cap without reading it", async () => {
    const { ctx, notes } = makeCtx();
    const flows = createIngestFlows(ctx);
    const text = vi.fn(async () => "object,comment\n,hi\n");
    const file = { name: "huge.csv", size: 65 * 1024 * 1024, text } as unknown as File;
    await flows.importNotesCsv(file);
    expect(text).not.toHaveBeenCalled();
    expect(notes.at(-1)).toMatch(/too large/);
  });

  it("importNotesWadm rejects a file over the local-text-import cap without reading it", async () => {
    const { ctx, notes } = makeCtx();
    const flows = createIngestFlows(ctx);
    const text = vi.fn(async () => "{}");
    const file = { name: "huge.json", size: 65 * 1024 * 1024, text } as unknown as File;
    await flows.importNotesWadm(file);
    expect(text).not.toHaveBeenCalled();
    expect(notes.at(-1)).toMatch(/too large/);
  });
});
