// Ingest-flow tests (tend Issue 7, docs/state/NEGSPACE.md). This path had zero direct coverage before —
// each test below reproduces one of the negative-space matrix's real findings against the actual
// createIngestFlows factory (not a reimplementation), with a minimal in-memory IngestContext mock.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createIngestFlows, type IngestContext } from "./ingest-flows.js";
import type { ExhibitMeta } from "./store.js";
import type { ManifestPlan } from "./iiif-import.js";
import type { DiscoveredManifest } from "./collection-import.js";

// OPFS isn't available in the jsdom/happy-dom test env; the AV branch of addObjectFromFile is the
// simplest deterministic path through it (no EXIF/downscale/thumbnail image decoding either), so
// tests below use audio files and stub the file-write calls.
vi.mock("./store.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./store.js")>()),
  saveAssetFile: vi.fn(async () => {}),
  saveOriginalFile: vi.fn(async () => {}),
  saveThumbFile: vi.fn(async () => {}),
}));

// The image path decodes via bake.ts (createImageBitmap), absent in the test env — mock it so an image
// file's processing is deterministic AND so a marked "corrupt" file can REJECT the way a real undecodable
// image does (bakeDisplayMaster/downscaleIfNeeded throw), which the defect-1 skip-and-tally test needs.
// No existing test exercises the image path (they all use audio), so this mock is inert for them.
// The TIFF transcode decodes via UTIF + canvas (browser-only, like bake.js) — mock it the same way so
// the WIRING is provable headless: a tiff-MIME file must route here, and its output must become the
// stored master. The real decode is verified in the browser (tiff-transcode.ts header).
vi.mock("./tiff-transcode.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tiff-transcode.js")>()), // real isTiffMime — only the decode is stubbed
  transcodeTiff: vi.fn(async () => ({ blob: new Blob([new Uint8Array([1])], { type: "image/webp" }), width: 8, height: 8 })),
}));

vi.mock("./bake.js", () => ({
  bakeDisplayMaster: vi.fn(async () => ({ blob: new Blob([new Uint8Array([0])]), width: 10, height: 10 })),
  downscaleIfNeeded: vi.fn(async (file: File) => {
    if (file.name.includes("corrupt")) throw new Error("createImageBitmap: undecodable image");
    return { blob: file, width: 10, height: 10 };
  }),
  bakeThumbnail: vi.fn(async () => null),
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
      // Bulk append (scale-fix): the import loops now commit a run of objects in ONE call (one library.json
      // persist) instead of one appendObject per object — mirror that here so persist-count spies are real.
      appendObjects: async (slug: string, objs: any[]) => {
        const ex = exhibits.find((e) => e.slug === slug);
        if (ex) (ex.objects as any[]).push(...objs);
      },
      setMeta: () => {},
      persist: async () => {},
      patchExhibit: (slug: string, fields: any) => {
        const ex = exhibits.find((e) => e.slug === slug);
        if (ex) Object.assign(ex, fields);
      },
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
    setCollabNote: () => {},
    canvasIdOf: (id: string) => id,
    switchObject: () => {},
    toEditor: () => {},
    newExhibit: async (title: string) => {
      const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "exhibit";
      exhibits.push({ id: `ex-${slug}`, slug, title, objects: [] } as unknown as ExhibitMeta);
      currentSlug = slug; // mirrors App.svelte's newExhibit -> openExhibit side effect
    },
    // Non-navigating create (Archie-cbf6): pushes the exhibit + returns its slug WITHOUT moving currentSlug —
    // mirrors App's createExhibitInLibrary. The collection batch uses this so it never opens each exhibit.
    newExhibitInLibrary: async (title: string) => {
      const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "exhibit";
      exhibits.push({ id: `ex-${slug}`, slug, title, objects: [] } as unknown as ExhibitMeta);
      return slug;
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

    // Stub global fetch to return a 2-canvas P3 manifest; as the batch lands, flip ctx.currentSlug() to
    // "other" — simulating the user clicking into a different exhibit mid-import. The import targets the
    // PINNED slug (passed to appendObjects), so the switch must not redirect any object.
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

    const origAppendObjects = ctx.lib.appendObjects.bind(ctx.lib);
    let calls = 0;
    ctx.lib.appendObjects = async (slug: string, objs: any[]) => {
      calls++;
      if (calls === 1) switchTo("other"); // user navigates away as the batch lands
      return origAppendObjects(slug, objs);
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

    const origAppendObjects = ctx.lib.appendObjects.bind(ctx.lib);
    let calls = 0;
    ctx.lib.appendObjects = async (slug: string, objs: any[]) => {
      calls++;
      if (calls === 1) switchTo("other"); // user navigates away as the group's batch lands
      return origAppendObjects(slug, objs);
    };

    await flows.newExhibitFromFolder(files);

    const roll = exhibits.find((e) => e.slug === "roll")!;
    const other = exhibits.find((e) => e.slug === "other")!;
    expect(roll.objects.length).toBe(2); // both files landed on the folder's own exhibit
    expect(other.objects.length).toBe(0); // none leaked onto the exhibit the user switched to
  });
});

describe("newExhibitFromFolder / newExhibitFromManifest — optional title override (Archie-46bf)", () => {
  const makeFile = (dir: string, name: string) =>
    Object.assign(new File([new Uint8Array([0])], name, { type: "audio/mpeg" }), { webkitRelativePath: `${dir}/${name}` });

  it("uses the override title when the folder makes exactly one exhibit", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = createIngestFlows(ctx);
    await flows.newExhibitFromFolder([makeFile("roll", "a.mp3")], "My custom title");
    expect(exhibits[0]!.title).toBe("My custom title");
  });

  it("falls back to the folder-derived name when no override is given", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = createIngestFlows(ctx);
    await flows.newExhibitFromFolder([makeFile("roll", "a.mp3")]);
    expect(exhibits[0]!.title).toBe("roll");
  });

  it("falls back to the folder-derived name when the override is blank/whitespace", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = createIngestFlows(ctx);
    await flows.newExhibitFromFolder([makeFile("roll", "a.mp3")], "   ");
    expect(exhibits[0]!.title).toBe("roll");
  });

  it("ignores an override when the folder makes SEVERAL exhibits (per-subfolder groups) — a single title is inapplicable there", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = createIngestFlows(ctx);
    // planFolderImportGroups needs a THIRD path segment to see a first-level subfolder (root/sub/file)
    // — a two-segment path (root/file) reads as a loose file at the root, one group either way.
    const files = [makeFile("roll/box-a", "a.mp3"), makeFile("roll/box-b", "b.mp3")];
    await flows.newExhibitFromFolder(files, "Should be ignored");
    expect(exhibits.map((e) => e.title).sort()).toEqual(["box-a", "box-b"]);
  });

  const oneCanvasManifest = {
    type: "Manifest",
    label: { none: ["Manifest label"] },
    items: [{ type: "Canvas", items: [{ items: [{ body: { id: "https://x/1.jpg", type: "Image" } }] }] }],
  };
  function stubManifestFetch() {
    const body = new TextEncoder().encode(JSON.stringify(oneCanvasManifest));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, headers: new Headers(), arrayBuffer: async () => body.buffer })));
  }

  it("uses the override title over the manifest's own label", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = createIngestFlows(ctx);
    stubManifestFetch();
    await flows.newExhibitFromManifest("https://x/manifest.json", "My custom title");
    expect(exhibits[0]!.title).toBe("My custom title");
  });

  it("falls back to the manifest's own label when no override is given", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = createIngestFlows(ctx);
    stubManifestFetch();
    await flows.newExhibitFromManifest("https://x/manifest.json");
    expect(exhibits[0]!.title).toBe("Manifest label");
  });

  it("falls back to the manifest's own label when the override is blank/whitespace", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = createIngestFlows(ctx);
    stubManifestFetch();
    await flows.newExhibitFromManifest("https://x/manifest.json", "   ");
    expect(exhibits[0]!.title).toBe("Manifest label");
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

// ── Collection ingest (Archie-656a, PLAN §5–6) ──────────────────────────────────────────────────
const ref = (id: string, trail: string[], label?: string): DiscoveredManifest =>
  ({ id, trail, ...(label ? { label } : {}) });

// A minimal one-canvas P3 manifest whose label is `label` — createExhibitFromPlan slugs the exhibit from it.
const manifestJson = (label: string) => ({
  type: "Manifest",
  label: { none: [label] },
  items: [{ type: "Canvas", items: [{ items: [{ body: { id: `https://x/${label}.jpg`, type: "Image" } }] }] }],
});

/** Stub global fetch for a pool of manifest URLs. `delay` staggers completion (to force out-of-order
 *  arrival); `status >= 400` makes that URL fail (→ skip). Honors the AbortSignal passed by fetchJsonCapped
 *  — a delayed fetch rejects with an AbortError the instant the signal fires, so the abort-mid-fetch path
 *  is actually exercised. Returns the spy so a test can count calls. */
function stubManifestPool(cfg: Record<string, { label?: string; delay?: number; status?: number }>) {
  const spy = vi.fn(async (url: string, init?: { signal?: AbortSignal }) => {
    const c = cfg[url];
    if (!c) throw new Error(`unexpected fetch: ${url}`);
    const signal = init?.signal;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (c.delay) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, c.delay);
        signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); });
      });
    }
    const bytes = new TextEncoder().encode(JSON.stringify(manifestJson(c.label ?? "X")));
    return { ok: !c.status || c.status < 400, status: c.status ?? 200, headers: new Headers(), arrayBuffer: async () => bytes.buffer };
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** Stub global fetch to return one document for ANY URL (the collection preview's root fetch). */
function stubSingleFetch(json: unknown, opts: { contentLength?: number } = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  const spy = vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: new Headers(opts.contentLength ? { "content-length": String(opts.contentLength) } : {}),
    arrayBuffer: async () => bytes.buffer,
  }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("newExhibitsFromCollection — reorder buffer (PLAN §6)", () => {
  it("commits exhibits in selected order even when fetches complete out of order", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = createIngestFlows(ctx);
    const selected = [ref("https://x/m1", ["Root"]), ref("https://x/m2", ["Root"]), ref("https://x/m3", ["Root"])];
    // Adversarial: m3 resolves FIRST, m1 LAST — a naive commit-as-they-arrive would reorder the library.
    stubManifestPool({ "https://x/m1": { label: "M1", delay: 40 }, "https://x/m2": { label: "M2", delay: 25 }, "https://x/m3": { label: "M3", delay: 10 } });
    const res = await flows.newExhibitsFromCollection(selected, {});
    expect(exhibits.map((e) => e.title)).toEqual(["M1", "M2", "M3"]);
    expect(res.createdSlugs).toEqual(["m1", "m2", "m3"]); // commit order === selected order
    expect(res.skipped).toEqual([]);
    expect(res.cancelled).toBe(false);
  });
});

describe("newExhibitsFromCollection — skip-and-continue (PLAN §6)", () => {
  it("skips a failed manifest, records it, and keeps the surviving exhibits in order", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = createIngestFlows(ctx);
    const selected = [ref("https://x/m1", ["Root"]), ref("https://x/m2", ["Root"], "Second"), ref("https://x/m3", ["Root"])];
    stubManifestPool({ "https://x/m1": { label: "M1", delay: 10 }, "https://x/m2": { status: 404, delay: 5 }, "https://x/m3": { label: "M3", delay: 8 } });
    const res = await flows.newExhibitsFromCollection(selected, {});
    expect(exhibits.map((e) => e.title)).toEqual(["M1", "M3"]); // the middle failure did not abort the batch
    expect(res.createdSlugs).toEqual(["m1", "m3"]);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]!.id).toBe("https://x/m2");
    expect(res.skipped[0]!.label).toBe("Second"); // ref label carried onto the skip record
    expect(res.skipped[0]!.reason).toMatch(/Couldn't open/);
  });
});

describe("newExhibitsFromCollection — cancellation (PLAN §6)", () => {
  it("stops after abort, keeps the committed prefix, and reports cancelled", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = createIngestFlows(ctx);
    const controller = new AbortController();
    const selected = [ref("https://x/m1", ["Root"]), ref("https://x/m2", ["Root"]), ref("https://x/m3", ["Root"])];
    stubManifestPool({ "https://x/m1": { label: "M1", delay: 5 }, "https://x/m2": { label: "M2", delay: 5 }, "https://x/m3": { label: "M3", delay: 5 } });
    const res = await flows.newExhibitsFromCollection(selected, {
      signal: controller.signal,
      onProgress: (done) => { if (done === 1) controller.abort(); }, // cancel right after the first commit
    });
    expect(res.createdSlugs).toEqual(["m1"]); // the committed prefix survives
    expect(res.cancelled).toBe(true);
    expect(res.fatal).toBeNull(); // a user cancel is not a storage failure
    expect(res.skipped).toEqual([]); // un-committed slots are abandoned, NOT recorded as skips
    expect(exhibits.map((e) => e.title)).toEqual(["M1"]); // nothing further committed
  });
});

describe("newExhibitsFromCollection — commit failure is fatal but non-throwing (Archie-656a review)", () => {
  it("stops the batch, keeps the committed prefix, records the poisoned slot, and never retries it", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = createIngestFlows(ctx);
    // Make the SECOND exhibit's object-append reject (a storage-side failure); m1 commits fine. The batch
    // commits via appendObjects now, and a flush throw propagates out of importManifestObjects → the drain
    // catches it as fatal (a real save failure surfaces in saveStatus, never throws; this exercises the path).
    const origAppend = ctx.lib.appendObjects.bind(ctx.lib);
    ctx.lib.appendObjects = async (slug: string, objs: any[]) => {
      if (slug === "m2") throw new Error("storage exploded");
      return origAppend(slug, objs);
    };
    // Count newExhibitInLibrary calls to PROVE the poisoned slot is committed at most once (never retried).
    // The batch creates exhibits without navigating (Archie-cbf6), so it's this path, not newExhibit.
    const origNewExhibit = ctx.newExhibitInLibrary;
    let newExhibitCalls = 0;
    ctx.newExhibitInLibrary = async (t: string) => { newExhibitCalls++; return origNewExhibit(t); };
    const selected = [ref("https://x/m1", ["Root"]), ref("https://x/m2", ["Root"], "Second"), ref("https://x/m3", ["Root"])];
    stubManifestPool({ "https://x/m1": { label: "M1", delay: 15 }, "https://x/m2": { label: "M2", delay: 10 }, "https://x/m3": { label: "M3", delay: 5 } });
    const res = await flows.newExhibitsFromCollection(selected, {}); // resolves — must NOT throw
    // createdSlugs = healthy m1 PLUS the half-minted m2 (orphan sweep): m2's exhibit was created before its
    // append rejected, so its slug rides createdSlugs for the undo batch to remove.
    expect(res.createdSlugs).toEqual(["m1", "m2"]);
    expect(exhibits.map((e) => e.title)).toEqual(["M1", "M2"]); // the half-minted M2 exists in the library (the orphan)
    expect(res.fatal).toMatch(/storage exploded/); // the storage error surfaced as fatal
    expect(res.cancelled).toBe(false); // storage failure ≠ user cancel
    expect(res.skipped.map((s) => s.id)).toEqual(["https://x/m2"]); // m2 ALSO recorded as a skip (didn't fully import); m3 never reached
    expect(res.skipped[0]!.label).toBe("Second");
    expect(res.skipped[0]!.reason).toMatch(/Couldn't save/);
    expect(newExhibitCalls).toBe(2); // m1 + the single m2 attempt; no retry of m2, m3 never launched
  });
});

describe("newExhibitsFromCollection — all slots skipped", () => {
  it("returns an empty committed prefix with every manifest recorded as a skip", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = createIngestFlows(ctx);
    stubManifestPool({ "https://x/m1": { status: 500, delay: 5 }, "https://x/m2": { status: 500, delay: 5 } });
    const res = await flows.newExhibitsFromCollection([ref("https://x/m1", ["R"]), ref("https://x/m2", ["R"])], {});
    expect(res.createdSlugs).toEqual([]);
    expect(res.skipped.map((s) => s.id)).toEqual(["https://x/m1", "https://x/m2"]);
    expect(res.cancelled).toBe(false);
    expect(res.fatal).toBeNull();
    expect(exhibits).toEqual([]); // nothing minted
  });
});

describe("newExhibitsFromCollection — plan cache (PLAN §5)", () => {
  it("uses a cached plan without refetching that manifest", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = createIngestFlows(ctx);
    const spy = stubManifestPool({ "https://x/m2": { label: "M2", delay: 5 } }); // ONLY m2 is fetchable
    const planCache = new Map<string, ManifestPlan>([
      ["https://x/m1", { title: "Cached M1", objects: [{ source: "https://x/c.jpg", label: "C" }] }],
    ]);
    const selected = [ref("https://x/m1", ["Root"]), ref("https://x/m2", ["Root"])];
    const res = await flows.newExhibitsFromCollection(selected, { planCache });
    expect(exhibits.map((e) => e.title)).toEqual(["Cached M1", "M2"]);
    expect(res.createdSlugs).toEqual(["cached-m1", "m2"]);
    expect(spy.mock.calls.map((c) => c[0])).toEqual(["https://x/m2"]); // m1 never hit the network
  });
});

describe("newExhibitsFromCollection — provenance stamping (PLAN §8)", () => {
  it("stamps the collection trail into each exhibit's summary", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = createIngestFlows(ctx);
    stubManifestPool({ "https://x/m1": { label: "M1", delay: 5 } });
    await flows.newExhibitsFromCollection([ref("https://x/m1", ["Yale", "Voynich"])], {});
    expect((exhibits[0] as any).summary).toBe("From: Yale › Voynich");
  });
});

describe("fetchCollectionPreview (PLAN §5)", () => {
  it("classifies a manifest URL to the single-manifest signal AND carries its parsed plan — one fetch, no double-fetch (D2)", async () => {
    const { ctx } = makeCtx();
    const flows = createIngestFlows(ctx);
    const spy = stubSingleFetch(manifestJson("Solo"));
    const preview = await flows.fetchCollectionPreview("https://x/manifest.json");
    expect(preview.kind).toBe("manifest");
    if (preview.kind !== "manifest") return;
    // The root doc was already fetched + parsed here, so the plan rides along — the dialog renders title +
    // count from it instead of re-fetching the same URL via previewManifest (was the pre-cbf6 double fetch).
    expect(preview.plan.title).toBe("Solo");
    expect(preview.plan.objects).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(1); // exactly ONE network hit for the whole manifest preview
  });

  it("maps a manifest-shaped doc that can't be planned to an error (not a payload-less manifest signal) — D2 edge", async () => {
    const { ctx } = makeCtx();
    const flows = createIngestFlows(ctx);
    // classifyIiifDocument sees a Manifest, but it has no canvases → manifestToExhibit throws; D2 must map
    // that to an error the dialog renders, never a `manifest` result carrying an unusable/undefined plan.
    stubSingleFetch({ type: "Manifest", label: { none: ["Empty"] }, items: [] });
    const preview = await flows.fetchCollectionPreview("https://x/empty.json");
    expect(preview.kind).toBe("error");
  });

  it("returns over-manifest-cap status and the exact count for a too-large collection", async () => {
    const { ctx } = makeCtx();
    const flows = createIngestFlows(ctx);
    // 1001 manifest members > the default cap of 1000 → the traversal refuses with the true count.
    const items = Array.from({ length: 1001 }, (_, i) => ({ id: `https://x/m${i}`, type: "Manifest" }));
    stubSingleFetch({ type: "Collection", label: { none: ["Big"] }, items });
    const preview = await flows.fetchCollectionPreview("https://x/collection.json");
    expect(preview.kind).toBe("collection");
    if (preview.kind !== "collection") return;
    expect(preview.rootTitle).toBe("Big");
    expect(preview.result.status).toBe("over-manifest-cap");
    expect(preview.result.manifestCount).toBe(1001);
  });

  it("returns the traversal for an in-cap collection", async () => {
    const { ctx } = makeCtx();
    const flows = createIngestFlows(ctx);
    const items = [{ id: "https://x/m1", type: "Manifest" }, { id: "https://x/m2", type: "Manifest" }];
    stubSingleFetch({ type: "Collection", label: { none: ["Two" ] }, items });
    const preview = await flows.fetchCollectionPreview("https://x/collection.json");
    expect(preview.kind).toBe("collection");
    if (preview.kind !== "collection") return;
    expect(preview.result.status).toBe("ok");
    expect(preview.result.manifests.map((m) => m.id)).toEqual(["https://x/m1", "https://x/m2"]);
  });

  it("aborts SILENTLY when the signal fires during the root fetch — no alert, discardable outcome", async () => {
    const { ctx, alerts } = makeCtx();
    const flows = createIngestFlows(ctx);
    const controller = new AbortController();
    stubManifestPool({ "https://x/c.json": { label: "C", delay: 10000 } }); // hangs until aborted
    const p = flows.fetchCollectionPreview("https://x/c.json", controller.signal);
    controller.abort(); // a newer keystroke supersedes this preview
    const preview = await p;
    expect(preview.kind).toBe("aborted");
    expect(alerts).toEqual([]); // NOT one "couldn't open" modal per abandoned keystroke
  });

  it("aborts mid-traversal WITHOUT surfacing a phantom-skip collection result", async () => {
    const { ctx, alerts } = makeCtx();
    const flows = createIngestFlows(ctx);
    const controller = new AbortController();
    const root = { type: "Collection", label: { none: ["Root"] }, items: [{ id: "https://x/sub", type: "Collection" }] };
    const jsonResp = (json: unknown) => {
      const bytes = new TextEncoder().encode(JSON.stringify(json));
      return { ok: true, status: 200, headers: new Headers(), arrayBuffer: async () => bytes.buffer };
    };
    // Root resolves fine; the sub-collection fetch fires the abort DURING traversal, then throws — the
    // traversal folds that into a fetch-failed skip, but the aborted preview must discard the whole result.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "https://x/root.json") return jsonResp(root);
      if (url === "https://x/sub") { controller.abort(); throw new DOMException("Aborted", "AbortError"); }
      throw new Error(`unexpected fetch: ${url}`);
    }));
    const preview = await flows.fetchCollectionPreview("https://x/root.json", controller.signal);
    expect(preview.kind).toBe("aborted"); // NOT { kind: "collection" } carrying a fetch-failed skip
    expect(alerts).toEqual([]);
  });
});

// ── Import batching: library.json persist count (scale-fix) ──────────────────────────────────────
// The blocker: every imported object drove one whole-library.json rewrite (O(N²) cumulative bytes). The
// import loops now commit a run of objects in ONE appendObjects call per IMPORT_PERSIST_CHUNK (25); each
// appendObjects call = ONE library.json persist. These pin the count so the amplification can't creep back.
describe("import batches library.json persists (scale-fix)", () => {
  it("a 100-canvas manifest commits in ceil(100/25)=4 persists — not one per object — with unique ids", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = createIngestFlows(ctx);
    const appendObjectsSpy = vi.spyOn(ctx.lib, "appendObjects");
    const appendObjectSpy = vi.spyOn(ctx.lib, "appendObject");
    const items = Array.from({ length: 100 }, (_, i) =>
      ({ type: "Canvas", items: [{ items: [{ body: { id: `https://x/${i}.jpg`, type: "Image" } }] }] }));
    const body = new TextEncoder().encode(JSON.stringify({ type: "Manifest", label: { none: ["Big"] }, items }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, headers: new Headers(), arrayBuffer: async () => body.buffer })));

    await flows.newExhibitFromManifest("https://x/big.json");

    const objs = exhibits[0]!.objects;
    expect(objs.length).toBe(100); // every canvas imported
    expect(new Set(objs.map((o) => o.id)).size).toBe(100); // mintObjectId mints a distinct ULID per object across the batch
    expect(appendObjectsSpy).toHaveBeenCalledTimes(4); // 25 + 25 + 25 + 25 — batched, not 100 full-library rewrites
    expect(appendObjectSpy).not.toHaveBeenCalled(); // the per-object write-amplifying path is gone
  });

  it("a 100-file drop commits in 4 persists, one per 25 files", async () => {
    const { ctx, exhibits, switchTo } = makeCtx();
    const flows = createIngestFlows(ctx);
    exhibits.push({ id: "ex-a", slug: "a", title: "A", objects: [] } as unknown as ExhibitMeta);
    switchTo("a"); // addFiles imports into the open exhibit
    const appendObjectsSpy = vi.spyOn(ctx.lib, "appendObjects");
    const appendObjectSpy = vi.spyOn(ctx.lib, "appendObject");
    const files = Array.from({ length: 100 }, (_, i) => new File([new Uint8Array([0])], `f${i}.mp3`, { type: "audio/mpeg" }));

    await flows.addFiles(files);

    const objs = exhibits.find((e) => e.slug === "a")!.objects;
    expect(objs.length).toBe(100); // every file added
    expect(new Set(objs.map((o) => o.id)).size).toBe(100); // unique ids across the batch
    expect(appendObjectsSpy).toHaveBeenCalledTimes(4); // batched at 25 — not 100 library.json rewrites
    expect(appendObjectSpy).not.toHaveBeenCalled();
  });

  it("a 60-canvas manifest chunks at 25 (25 + 25 + 10) — the crash-durability window is bounded, not the whole import", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = createIngestFlows(ctx);
    const appendObjectsSpy = vi.spyOn(ctx.lib, "appendObjects");
    const items = Array.from({ length: 60 }, (_, i) =>
      ({ type: "Canvas", items: [{ items: [{ body: { id: `https://x/${i}.jpg`, type: "Image" } }] }] }));
    const body = new TextEncoder().encode(JSON.stringify({ type: "Manifest", label: { none: ["Mid"] }, items }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, headers: new Headers(), arrayBuffer: async () => body.buffer })));

    await flows.newExhibitFromManifest("https://x/mid.json");

    expect(exhibits[0]!.objects.length).toBe(60);
    expect(appendObjectsSpy.mock.calls.map((c) => (c[1] as unknown[]).length)).toEqual([25, 25, 10]);
  });
});

// ── Code-review defect 1 (dropped chunk) + concurrent-flow id distinctness ─────────────────────────
describe("addFiles — one file rejects mid-batch (code-review defect 1)", () => {
  it("skips the undecodable file, keeps + flushes the successes, and reports the tally", async () => {
    const { ctx, exhibits, notes, switchTo } = makeCtx();
    const flows = createIngestFlows(ctx);
    exhibits.push({ id: "ex-a", slug: "a", title: "A", objects: [] } as unknown as ExhibitMeta);
    switchTo("a");
    const appendObjectsSpy = vi.spyOn(ctx.lib, "appendObjects");
    // 5 images in ONE chunk; the middle one rejects in downscaleIfNeeded (the bake mock throws on "corrupt").
    const img = (name: string) => new File([new Uint8Array([0])], name, { type: "image/png" });
    const files = [img("f0.png"), img("f1.png"), img("corrupt.png"), img("f3.png"), img("f4.png")];

    await flows.addFiles(files);

    const objs = exhibits.find((e) => e.slug === "a")!.objects;
    expect(objs.length).toBe(4); // the 4 decodable files survived — NOT lost when the corrupt one threw
    expect(new Set(objs.map((o) => o.id)).size).toBe(4); // unique ids
    expect(appendObjectsSpy).toHaveBeenCalledTimes(1); // the survivors were flushed in the one end-of-drop persist
    expect(notes.at(-1)).toMatch(/Added 4 files/); // success count surfaced
    // …and the skip now says WHY. This file rejected in downscaleIfNeeded — the decode phase — so the
    // summary names that cause and the file, instead of the old content-free "1 couldn't be added."
    expect(notes.at(-1)).toMatch(/“corrupt\.png” isn't a readable image/);
    expect(notes.at(-1)).toMatch(/damaged, or in a format this browser can't open/);
    expect(notes.at(-1)).not.toMatch(/no reason Archie could identify/); // it WAS identified
  });

  it("folds many failures of one kind into a single clause, not one line per file", async () => {
    // The guard against a wall of text: 4 undecodable files must read as ONE sentence with a count, and
    // must NOT name any of them (naming is reserved for the exactly-one case, where it identifies).
    const { ctx, notes, exhibits, switchTo } = makeCtx();
    const flows = createIngestFlows(ctx);
    exhibits.push({ id: "ex-b", slug: "b", title: "B", objects: [] } as unknown as ExhibitMeta);
    switchTo("b");
    const img = (name: string) => new File([new Uint8Array([0])], name, { type: "image/png" });
    await flows.addFiles([img("ok.png"), img("corrupt-1.png"), img("corrupt-2.png"), img("corrupt-3.png"), img("corrupt-4.png")]);

    const summary = notes.at(-1)!;
    expect(summary).toMatch(/Added 1 file/);
    expect(summary).toMatch(/4 images couldn't be read/);
    expect(summary).not.toMatch(/corrupt-1\.png/); // collapsed to a count, not enumerated
  });

  it("reports an unsupported file by its kind, not as an anonymous failure", async () => {
    const { ctx, notes, exhibits, switchTo } = makeCtx();
    const flows = createIngestFlows(ctx);
    exhibits.push({ id: "ex-c", slug: "c", title: "C", objects: [] } as unknown as ExhibitMeta);
    switchTo("c");
    await flows.addFiles([new File([new Uint8Array([0])], "notes.pdf", { type: "application/pdf" })]);

    expect(notes.at(-1)).toMatch(/Archie can’t open “notes\.pdf”/);
    expect(notes.at(-1)).toMatch(/images, audio, and video/);
  });
});

describe("concurrent flows — manual add during an import batch mints a distinct id (Archie-9ea8)", () => {
  it("a manual addObject while a batch's flush is in flight never collides on object id", async () => {
    const { ctx, exhibits, switchTo } = makeCtx();
    const flows = createIngestFlows(ctx);
    exhibits.push({ id: "ex-a", slug: "a", title: "A", objects: [] } as unknown as ExhibitMeta);
    switchTo("a");
    // Suspend the batch's FIRST appendObjects flush on a gate: while it's parked, its 25 objects are minted
    // but NOT yet in meta. Fire a manual addObject in that window — it must land a DIFFERENT id. This was the
    // cross-flow collision (old code-review defect 2, when ids were ordinal `o${n}` read off delayed meta and
    // needed a reservation registry); ULIDs (mintObjectId) make distinctness structural, so this now just
    // pins that the two concurrent flows still never share an id.
    let releaseGate!: () => void;
    const gate = new Promise<void>((r) => { releaseGate = r; });
    let flushReached!: () => void;
    const reached = new Promise<void>((r) => { flushReached = r; });
    const origAppendObjects = ctx.lib.appendObjects.bind(ctx.lib);
    let first = true;
    ctx.lib.appendObjects = async (slug: string, objs: any[]) => {
      if (first) { first = false; flushReached(); await gate; }
      return origAppendObjects(slug, objs);
    };
    const files = Array.from({ length: 25 }, (_, i) => new File([new Uint8Array([0])], `f${i}.mp3`, { type: "audio/mpeg" }));

    const importP = flows.addFiles(files); // 25 files → one chunk → flush parks on the gate
    await reached; // batch is now suspended mid-flush: 25 objects minted, not yet in meta
    await flows.addObject("https://x/manual.mp3", "Manual"); // manual add in the mid-flush window
    releaseGate();
    await importP;

    const ids = exhibits.find((e) => e.slug === "a")!.objects.map((o) => o.id);
    expect(ids.length).toBe(26); // 25 batched + 1 manual
    expect(new Set(ids).size).toBe(26); // NO duplicate id across the two flows
  });
});

// ── Failure containment: newExhibitFromManifest never leaks an unhandled rejection (scale-fix) ─────
describe("newExhibitFromManifest — failure containment", () => {
  it("catches an exhibit-create/append throw, surfaces it via ctx.alert, and does not reject", async () => {
    const { ctx, alerts } = makeCtx();
    const flows = createIngestFlows(ctx);
    // Make exhibit creation reject (the realistic throw source — a save failure is non-throwing/saveStatus).
    ctx.newExhibit = async () => { throw new Error("boom"); };
    const body = new TextEncoder().encode(JSON.stringify({
      type: "Manifest", label: { none: ["X"] },
      items: [{ type: "Canvas", items: [{ items: [{ body: { id: "https://x/1.jpg", type: "Image" } }] }] }],
    }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, headers: new Headers(), arrayBuffer: async () => body.buffer })));

    await expect(flows.newExhibitFromManifest("https://x/m.json")).resolves.toBeUndefined(); // no unhandled rejection
    expect(alerts.at(-1)).toMatch(/Couldn't finish importing/); // surfaced through the existing alert channel
  });
});

describe("newExhibitFromManifest — descriptive metadata lands on the exhibit + objects (Archie-c6bf)", () => {
  it("stamps summary/rights/credit on the minted exhibit and carries per-canvas entries onto objects", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = createIngestFlows(ctx);
    const manifest = {
      type: "Manifest",
      label: { none: ["Described"] },
      summary: { none: ["An institutional description."] },
      rights: "http://creativecommons.org/publicdomain/mark/1.0/",
      requiredStatement: { label: { none: ["Held by"] }, value: { none: ["Y Library"] } },
      metadata: [{ label: { none: ["Author"] }, value: { none: ["Ada"] } }],
      items: [
        { type: "Canvas", metadata: [{ label: { none: ["Date"] }, value: { none: ["1843"] } }], items: [{ items: [{ body: { id: "https://x/1.jpg", type: "Image" } }] }] },
        { type: "Canvas", items: [{ items: [{ body: { id: "https://x/2.jpg", type: "Image" } }] }] },
      ],
    };
    const body = new TextEncoder().encode(JSON.stringify(manifest));
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-length": String(body.byteLength) }),
      arrayBuffer: async () => body.buffer,
    })));

    await flows.newExhibitFromManifest("https://x/manifest.json");

    const ex = exhibits.find((e) => e.slug === "described")! as any;
    expect(ex.summary).toBe("An institutional description.");
    expect(ex.rights).toBe("http://creativecommons.org/publicdomain/mark/1.0/");
    expect(ex.requiredStatement).toEqual({ label: "Held by", value: "Y Library" });
    expect(ex.metadata).toEqual([{ property: "dcterms:creator", label: "Author", value: "Ada" }]);
    expect(ex.objects[0]!.metadata).toEqual([{ property: "dcterms:date", value: "1843" }]);
    expect(ex.objects[1]!.metadata).toBeUndefined();
  });
});

describe("storage failure stops the batch early (no-preflight contract, docs/research/browser-storage-quota.md)", () => {
  // The quota preflight is gone: Chromium's estimate() headroom is a ~10 GiB privacy constant, so the
  // only honest storage signal is the write itself failing. These tests pin the replacement contract:
  // first storage refusal → stop, keep the committed prefix, count the rest as not attempted.
  const makeAudio = (name: string, rel?: string) =>
    Object.assign(new File([new Uint8Array([0])], name, { type: "audio/mpeg" }), { webkitRelativePath: rel ?? name });

  it("addFiles: keeps the pre-failure adds, refuses the failing file as 'storage', never attempts the rest", async () => {
    const { ctx, exhibits, notes } = makeCtx();
    const flows = createIngestFlows(ctx);
    await ctx.newExhibit("Drop target");

    const store = vi.mocked(await import("./store.js"));
    store.saveAssetFile.mockClear(); // the module mock is file-wide — count only THIS test's writes
    store.saveAssetFile
      .mockImplementationOnce(async () => {}) // a.mp3 lands
      .mockImplementationOnce(async () => { throw new Error("QuotaExceededError: device full"); }); // b.mp3 fails
    // c.mp3 / d.mp3 must never reach the writer — the loop stops at the storage refusal.

    await flows.addFiles([makeAudio("a.mp3"), makeAudio("b.mp3"), makeAudio("c.mp3"), makeAudio("d.mp3")]);

    expect(exhibits.find((e) => e.slug === "drop-target")!.objects.length).toBe(1); // committed prefix survives
    expect(store.saveAssetFile).toHaveBeenCalledTimes(2); // stop means STOP: no doomed writes for c/d
    const note = notes.at(-1)!;
    expect(note).toContain("Added 1 file");
    expect(note).toContain("Couldn't store “b.mp3”"); // the storage refusal names its cause
    expect(note).toContain("The remaining 2 files were not attempted.");
  });

  it("newExhibitFromFolder: a storage failure in group 1 stops before minting group 2's exhibit", async () => {
    const { ctx, exhibits, alerts } = makeCtx();
    const flows = createIngestFlows(ctx);

    const store = vi.mocked(await import("./store.js"));
    store.saveAssetFile.mockClear(); // the module mock is file-wide — count only THIS test's writes
    store.saveAssetFile
      .mockImplementationOnce(async () => {}) // roll/a.mp3 lands
      .mockImplementationOnce(async () => { throw new Error("QuotaExceededError: device full"); }); // roll/b.mp3 fails

    await flows.newExhibitFromFolder([
      makeAudio("a.mp3", "top/roll/a.mp3"),
      makeAudio("b.mp3", "top/roll/b.mp3"),
      makeAudio("c.mp3", "top/roll/c.mp3"),
      makeAudio("d.mp3", "top/spool/d.mp3"),
      makeAudio("e.mp3", "top/spool/e.mp3"),
    ]);

    // Group 1 (roll) was minted and keeps its committed prefix; group 2 (spool) must NOT exist —
    // stopping before minting it is exactly the titled-but-empty-exhibit trail the old preflight
    // guarded against, now handled without the phantom-quota refusal.
    expect(exhibits.find((e) => e.slug === "roll")!.objects.length).toBe(1);
    expect(exhibits.find((e) => e.slug === "spool")).toBeUndefined();
    expect(store.saveAssetFile).toHaveBeenCalledTimes(2);
    const summary = alerts.at(-1)!;
    expect(summary).toContain("Added 1 file to 1 exhibit."); // exhibitsMade, not groups.length
    expect(summary).toContain("The remaining 3 files were not attempted."); // 1 left in roll + 2 in spool
  });
});

describe("TIFF ingest routes through the transcode (docs/research/browser-storage-quota.md follow-up 3)", () => {
  it("stores a tiff-MIME file as a .webp master with the transcoder's dimensions", async () => {
    const { ctx, exhibits } = makeCtx();
    const flows = createIngestFlows(ctx);
    await ctx.newExhibit("Scans");

    const transcode = vi.mocked(await import("./tiff-transcode.js"));
    transcode.transcodeTiff.mockClear();

    const tif = new File([new Uint8Array([0x49, 0x49, 0x2a, 0x00])], "BHC_006_GMT_AF_261a.tif", { type: "image/tiff" });
    await flows.addFiles([tif]);

    expect(transcode.transcodeTiff).toHaveBeenCalledTimes(1); // routed to the TIFF branch, not createImageBitmap
    const obj = exhibits.find((e) => e.slug === "scans")!.objects[0]! as any;
    expect(obj.source).toMatch(/\.webp$/); // the stored master is the transcode's WebP, extension truthful
    expect(obj.width).toBe(8);
    expect(obj.height).toBe(8);
  });

  it("classifies a TIFF the decoder rejects as 'undecodable' — named, not just counted", async () => {
    const { ctx, exhibits, notes } = makeCtx();
    const flows = createIngestFlows(ctx);
    await ctx.newExhibit("Scans");

    const transcode = vi.mocked(await import("./tiff-transcode.js"));
    transcode.transcodeTiff.mockClear();
    transcode.transcodeTiff.mockImplementationOnce(async () => { throw new Error("UTIF found no IFDs"); });

    await flows.addFiles([new File([new Uint8Array([0])], "damaged.tif", { type: "image/tiff" })]);

    expect(exhibits.find((e) => e.slug === "scans")!.objects.length).toBe(0);
    expect(notes.at(-1)!).toContain("“damaged.tif” isn't a readable image");
  });
});

// ── imageDims: desktop native-fetch dimension probe (Archie-fada) ────────────────────────────────
// On desktop a CORS-restricted / redirecting host fails the plain <img> probe; when a native fetcher is
// injected (ctx.fetchRemoteAsBlobUrl, Tauri-only) imageDims pulls the bytes to a same-origin blob: URL
// and probes THAT. The desktop RUNTIME (packaged webview) is OWED to the a09d smoke; these pin the wiring.
describe("imageDims — remote dimension probe routes through the injected native fetcher (Archie-fada)", () => {
  let probedSrc: string | null = null;
  let revokeSpy: ReturnType<typeof vi.fn>;
  const origImage = (globalThis as { Image?: unknown }).Image;
  const origRevoke = (globalThis.URL as { revokeObjectURL?: unknown }).revokeObjectURL;
  // A minimal <img> that resolves its dimensions off `src` on the next microtask (a "unreadable" src errors).
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    set src(v: string) {
      probedSrc = v;
      queueMicrotask(() => {
        if (v.includes("unreadable")) { this.onerror?.(); return; }
        this.naturalWidth = 640; this.naturalHeight = 480; this.onload?.();
      });
    }
  }
  beforeEach(() => {
    probedSrc = null;
    revokeSpy = vi.fn();
    (globalThis as { Image?: unknown }).Image = FakeImage;
    (globalThis.URL as { revokeObjectURL?: unknown }).revokeObjectURL = revokeSpy;
  });
  afterEach(() => {
    (globalThis as { Image?: unknown }).Image = origImage;
    (globalThis.URL as { revokeObjectURL?: unknown }).revokeObjectURL = origRevoke;
  });

  it("desktop: pulls remote bytes natively → probes the blob: URL → revokes it", async () => {
    const fetchRemoteAsBlobUrl = vi.fn(async (_u: string) => "blob:probe-xyz");
    const { ctx } = makeCtx({ fetchRemoteAsBlobUrl });
    const flows = createIngestFlows(ctx);
    const dims = await flows.imageDims("https://host/pic.jpg");
    expect(fetchRemoteAsBlobUrl).toHaveBeenCalledWith("https://host/pic.jpg");
    expect(probedSrc).toBe("blob:probe-xyz"); // probed the native blob, not the remote URL
    expect(dims).toEqual({ w: 640, h: 480 });
    expect(revokeSpy).toHaveBeenCalledWith("blob:probe-xyz");
  });

  it("web: no fetcher → probes the raw URL directly (byte-identical to before)", async () => {
    const { ctx } = makeCtx(); // no fetchRemoteAsBlobUrl
    const flows = createIngestFlows(ctx);
    const dims = await flows.imageDims("https://host/pic.jpg");
    expect(probedSrc).toBe("https://host/pic.jpg");
    expect(dims).toEqual({ w: 640, h: 480 });
  });

  it("desktop: a blob:/data: source is NOT re-fetched (the probe guard is http(s)-only)", async () => {
    const fetchRemoteAsBlobUrl = vi.fn(async () => "blob:should-not-happen");
    const { ctx } = makeCtx({ fetchRemoteAsBlobUrl });
    const flows = createIngestFlows(ctx);
    await flows.imageDims("blob:local-master");
    expect(fetchRemoteAsBlobUrl).not.toHaveBeenCalled();
    expect(probedSrc).toBe("blob:local-master");
  });

  it("desktop: a native-fetch throw falls back to probing the raw URL (never worse than web)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchRemoteAsBlobUrl = vi.fn(async () => { throw new Error("host down"); });
    const { ctx } = makeCtx({ fetchRemoteAsBlobUrl });
    const flows = createIngestFlows(ctx);
    const dims = await flows.imageDims("https://host/pic.jpg");
    expect(probedSrc).toBe("https://host/pic.jpg"); // fell back to the raw URL
    expect(dims).toEqual({ w: 640, h: 480 });
    warn.mockRestore();
  });
});

// ── The view is steered ONCE per import, not once per chunk (Archie-4855) ────────────────────────
// The bug: `beginBatch`'s chunk flush called setCurrentObjectId every IMPORT_PERSIST_CHUNK (25) files.
// Each move fires App.svelte:1182's rail effect — `scrollIntoView({ behavior: "smooth" })` — plus a
// roving-tabindex jump (:1193) and a master re-mint, so a 100-file import scrolled the rail out from
// under the pointer four times and a 1,000-file one forty times. Clicking an object mid-import missed.
//
// These count the CALLS, because the count is the whole defect: steering to the newest object is
// correct behaviour, doing it repeatedly mid-run is not.
describe("import steers the view once, not per chunk (Archie-4855)", () => {
  it("a 100-file drop moves the current object EXACTLY once, to the last object", async () => {
    const { ctx, exhibits, switchTo } = makeCtx();
    const flows = createIngestFlows(ctx);
    exhibits.push({ id: "ex-a", slug: "a", title: "A", objects: [] } as unknown as ExhibitMeta);
    switchTo("a");
    const steerSpy = vi.spyOn(ctx, "setCurrentObjectId");
    const files = Array.from({ length: 100 }, (_, i) => new File([new Uint8Array([0])], `f${i}.mp3`, { type: "audio/mpeg" }));

    await flows.addFiles(files);

    const objs = exhibits.find((e) => e.slug === "a")!.objects;
    expect(objs.length).toBe(100); // the import really happened — otherwise 0 steers passes vacuously
    // Four chunks at 25. Pre-fix this was 4; the contract is 1.
    expect(steerSpy).toHaveBeenCalledTimes(1);
    // And it lands on the TAIL, so the reader still ends up looking at what just arrived.
    expect(steerSpy).toHaveBeenLastCalledWith(objs[objs.length - 1]!.id);
  });

  it("a single-file add still steers, so the common case is unchanged", async () => {
    const { ctx, exhibits, switchTo } = makeCtx();
    const flows = createIngestFlows(ctx);
    exhibits.push({ id: "ex-b", slug: "b", title: "B", objects: [] } as unknown as ExhibitMeta);
    switchTo("b");
    const steerSpy = vi.spyOn(ctx, "setCurrentObjectId");

    await flows.addFiles([new File([new Uint8Array([0])], "one.mp3", { type: "audio/mpeg" })]);

    const objs = exhibits.find((e) => e.slug === "b")!.objects;
    expect(objs.length).toBe(1);
    expect(steerSpy).toHaveBeenCalledTimes(1); // the fix must not cost the single-add its steer
    expect(steerSpy).toHaveBeenLastCalledWith(objs[0]!.id);
  });
});
