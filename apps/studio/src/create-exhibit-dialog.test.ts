import { describe, it, expect, vi, afterEach } from "vitest";
import {
  surfaceTitle, createActionLabel, offersStartEmpty, offersMap, offersLink, pickedFromFiles,
  emptyPathValid, folderPathValid, iiifPathValid, looksLikeUrl, previewManifest,
  folderTitleFieldApplies, iiifTitleFieldApplies, prefillTitle, linkPathValid,
  routeCollectionPreview, buildPickerRows, checkedCount, selectedRefs, setAllChecked,
  hydrateRowLabels, overCapRefusal, skipNote, skipDetail, type PickerRow,
  summarizeImport, IMPORT_FAILURE_LIST_CAP,
} from "./create-exhibit-dialog.js";
import type { CollectionPreview, CollectionImportOutcome } from "./ingest-flows.js";
import type { DiscoveredManifest, TraverseResult, TraverseSkip } from "./collection-import.js";
import type { ManifestPlan } from "./iiif-import.js";

describe("CreateSurfaceScope copy (Archie-beb6's prop-level parameter)", () => {
  it("titles + labels the new-exhibit scope (the only one wired/shipped by Archie-51cc)", () => {
    expect(surfaceTitle({ kind: "new-exhibit" })).toBe("New exhibit");
    expect(createActionLabel({ kind: "new-exhibit" })).toBe("Create exhibit");
    expect(offersStartEmpty({ kind: "new-exhibit" })).toBe(true);
  });
  it("the add-to-exhibit scope resolves its copy + offers the Map path, not Start-empty (Archie-56cf)", () => {
    const scope = { kind: "add-to-exhibit" as const, slug: "herbal-quires", title: "Herbal quires" };
    expect(surfaceTitle(scope)).toBe("Add to “Herbal quires”");
    expect(createActionLabel(scope)).toBe("Add to exhibit");
    expect(offersStartEmpty(scope)).toBe(false);
    expect(offersMap(scope)).toBe(true);
  });
  it("the new-exhibit scope offers Start-empty but NOT the Map path (a map needs an existing exhibit)", () => {
    expect(offersMap({ kind: "new-exhibit" })).toBe(false);
    expect(offersStartEmpty({ kind: "new-exhibit" })).toBe(true);
  });
});

describe("offersLink — where the 'From a link' path shows (Archie-32e8)", () => {
  it("shows only in add-to-exhibit scope — same reasoning as offersMap: a remote object needs an existing exhibit to append onto", () => {
    expect(offersLink({ kind: "add-to-exhibit", slug: "herbal-quires", title: "Herbal quires" })).toBe(true);
  });
  it("never shows in new-exhibit scope — a lone remote object isn't a sensible new exhibit", () => {
    expect(offersLink({ kind: "new-exhibit" })).toBe(false);
  });
});

describe("linkPathValid — light gating for the 'From a link' path (non-empty, http(s) only)", () => {
  it("rejects an empty or whitespace-only URL", () => {
    expect(linkPathValid("")).toBe(false);
    expect(linkPathValid("   ")).toBe(false);
  });
  it("rejects a non-URL string", () => {
    expect(linkPathValid("not a link")).toBe(false);
  });
  it("rejects a well-formed URL with a non-http(s) scheme", () => {
    expect(linkPathValid("ftp://example.org/file.jpg")).toBe(false);
    expect(linkPathValid("javascript:alert(1)")).toBe(false);
  });
  it("accepts a well-formed http(s) URL", () => {
    expect(linkPathValid("https://example.org/herbal.jpg")).toBe(true);
    expect(linkPathValid("http://example.org/herbal.jpg")).toBe(true);
  });
  it("trims surrounding whitespace before validating", () => {
    expect(linkPathValid("  https://example.org/herbal.jpg  ")).toBe(true);
  });
});

describe("pickedFromFiles — the one place a real File touches this module", () => {
  it("reads webkitRelativePath when a picker/drop set it, else falls back to name", () => {
    const withPath = Object.assign(new File([], "a.jpg", { type: "image/jpeg" }), { webkitRelativePath: "Box/a.jpg" });
    const bare = new File([], "b.jpg", { type: "image/jpeg" });
    expect(pickedFromFiles([withPath, bare])).toEqual([
      { name: "a.jpg", relativePath: "Box/a.jpg", type: "image/jpeg" },
      { name: "b.jpg", relativePath: "b.jpg", type: "image/jpeg" },
    ]);
  });
});

describe("path validity — gates the primary button per path (mirrors the prototype's syncCreateDisabled)", () => {
  it("empty path needs a non-blank title", () => {
    expect(emptyPathValid("")).toBe(false);
    expect(emptyPathValid("   ")).toBe(false);
    expect(emptyPathValid("Herbal quires")).toBe(true);
  });
  it("folder path needs a summary with at least one importable file", () => {
    expect(folderPathValid(null)).toBe(false);
    expect(folderPathValid({ total: 0 })).toBe(false);
    expect(folderPathValid({ total: 1 })).toBe(true);
  });
  it("IIIF path needs a resolved-valid preview", () => {
    expect(iiifPathValid("idle")).toBe(false);
    expect(iiifPathValid("checking")).toBe(false);
    expect(iiifPathValid("invalid")).toBe(false);
    expect(iiifPathValid("valid")).toBe(true);
  });
  it("folder/IIIF paths additionally gate on a non-blank title when the title field applies (Archie-46bf)", () => {
    // titleApplies defaults to false — the pre-Archie-46bf callers (and any future caller that never
    // shows the field) keep gating on the summary/status alone.
    expect(folderPathValid({ total: 1 })).toBe(true);
    expect(folderPathValid({ total: 1 }, true, "")).toBe(false);
    expect(folderPathValid({ total: 1 }, true, "   ")).toBe(false);
    expect(folderPathValid({ total: 1 }, true, "Herbal quires")).toBe(true);
    expect(folderPathValid({ total: 1 }, false, "")).toBe(true); // field hidden -> no title gate

    expect(iiifPathValid("valid")).toBe(true);
    expect(iiifPathValid("valid", true, "")).toBe(false);
    expect(iiifPathValid("valid", true, "Voynich MS")).toBe(true);
    expect(iiifPathValid("valid", false, "")).toBe(true); // field hidden -> no title gate
  });
});

describe("folderTitleFieldApplies — where the folder path's editable title shows (Archie-46bf)", () => {
  const newExhibit = { kind: "new-exhibit" as const };
  const addToExhibit = { kind: "add-to-exhibit" as const, slug: "herbal-quires", title: "Herbal quires" };

  it("shows for a flat folder (one group) in new-exhibit scope", () => {
    expect(folderTitleFieldApplies(newExhibit, 1, "per-subfolder")).toBe(true);
  });
  it("hides for the 'one exhibit per subfolder' choice — several exhibits, no single title applies", () => {
    expect(folderTitleFieldApplies(newExhibit, 3, "per-subfolder")).toBe(false);
  });
  it("shows for the 'one exhibit from everything' (flatten) choice — collapses back to one exhibit", () => {
    expect(folderTitleFieldApplies(newExhibit, 3, "flatten")).toBe(true);
  });
  it("never shows in add-to-exhibit scope — it appends into an exhibit that already has a title", () => {
    expect(folderTitleFieldApplies(addToExhibit, 1, "per-subfolder")).toBe(false);
    expect(folderTitleFieldApplies(addToExhibit, 3, "flatten")).toBe(false);
  });
});

describe("iiifTitleFieldApplies — where the IIIF path's editable title shows (Archie-46bf)", () => {
  it("shows only in new-exhibit scope", () => {
    expect(iiifTitleFieldApplies({ kind: "new-exhibit" })).toBe(true);
    expect(iiifTitleFieldApplies({ kind: "add-to-exhibit", slug: "herbal-quires", title: "Herbal quires" })).toBe(false);
  });
});

describe("prefillTitle — prefill/override precedence (Archie-46bf, mirrors the prototype's `if (!state.title.trim())` guard)", () => {
  it("installs the derived name when the title is empty", () => {
    expect(prefillTitle("", "Herbal quires scans")).toBe("Herbal quires scans");
  });
  it("installs the derived name when the title is whitespace-only", () => {
    expect(prefillTitle("   ", "Herbal quires scans")).toBe("Herbal quires scans");
  });
  it("leaves a user-edited title untouched — user edit wins over a later derive (e.g. re-picking a folder)", () => {
    expect(prefillTitle("My custom title", "Herbal quires scans")).toBe("My custom title");
  });
});

describe("looksLikeUrl — the pre-fetch check (a half-typed paste shouldn't flash an error)", () => {
  it("accepts a well-formed URL", () => {
    expect(looksLikeUrl("https://example.org/manifest.json")).toBe(true);
  });
  it("rejects a bare string", () => {
    expect(looksLikeUrl("not a link")).toBe(false);
  });
});

describe("previewManifest — the IIIF validation preview (Archie-51cc)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves a valid manifest to title + canvas count, reusing manifestToExhibit", async () => {
    const manifest = {
      "@context": "https://iiif.io/api/presentation/3/context.json",
      type: "Manifest",
      label: { none: ["Voynich MS"] },
      items: [
        {
          type: "Canvas", label: { none: ["f1r"] }, width: 800, height: 1000,
          items: [{ type: "AnnotationPage", items: [{ type: "Annotation", motivation: "painting", body: {
            type: "Image", id: "https://x.org/iiif/2/img1/full/full/0/default.jpg",
            service: [{ "@id": "https://x.org/iiif/2/img1", type: "ImageService2", profile: "level1" }],
          } }] }],
        },
      ],
    };
    const body = new TextEncoder().encode(JSON.stringify(manifest));
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, headers: new Headers(), arrayBuffer: async () => body.buffer,
    })));
    const result = await previewManifest("https://x.org/manifest.json");
    expect(result).toEqual({ status: "valid", title: "Voynich MS", canvases: 1 });
  });

  it("maps a non-OK response to the plain-language unreachable message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, headers: new Headers() })));
    const result = await previewManifest("https://x.org/missing.json");
    expect(result).toEqual({ status: "invalid", message: "Couldn't reach that link — check the URL and try again." });
  });

  it("maps a thrown fetch (network failure) to the same unreachable message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const result = await previewManifest("https://no-such-host.invalid/manifest.json");
    expect(result).toEqual({ status: "invalid", message: "Couldn't reach that link — check the URL and try again." });
  });

  it("reuses ManifestImportError's message VERBATIM for a IIIF Collection link (never a raw error string)", async () => {
    const collection = { type: "Collection", label: "Herbals" };
    const body = new TextEncoder().encode(JSON.stringify(collection));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, headers: new Headers(), arrayBuffer: async () => body.buffer })));
    const result = await previewManifest("https://example.org/iiif/collections/herbals");
    expect(result).toEqual({
      status: "invalid",
      message: "This is a IIIF Collection (a list of manifests). Paste the URL of a single manifest instead.",
    });
  });

  it("maps a non-manifest JSON body to the generic plain-language message", async () => {
    const body = new TextEncoder().encode(JSON.stringify({ hello: "world" }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, headers: new Headers(), arrayBuffer: async () => body.buffer })));
    const result = await previewManifest("https://example.org/not-a-manifest.json");
    expect(result).toEqual({ status: "invalid", message: "That URL didn't return a IIIF manifest." });
  });

  it("rejects an oversized body against the SAME cap ingest-flows.ts enforces (imported, not redeclared)", async () => {
    const big = new ArrayBuffer(33 * 1024 * 1024);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, headers: new Headers(), arrayBuffer: async () => big })));
    const result = await previewManifest("https://example.org/huge-manifest.json");
    expect(result).toEqual({ status: "invalid", message: "That IIIF link is too large to check here." });
  });
});

// ── Collection preview + picker (Archie-a9e2, PLAN §3–5).

function dm(id: string, opts: { label?: string; trail?: string[] } = {}): DiscoveredManifest {
  const ref: DiscoveredManifest = { id, trail: opts.trail ?? ["Root"] };
  if (opts.label !== undefined) ref.label = opts.label;
  return ref;
}
function traverse(manifests: DiscoveredManifest[], opts: { skips?: TraverseSkip[]; status?: "ok" | "over-manifest-cap"; manifestCount?: number } = {}): TraverseResult {
  return {
    status: opts.status ?? "ok",
    manifests,
    skips: opts.skips ?? [],
    docsAttempted: 1,
    manifestCount: opts.manifestCount ?? manifests.length,
  };
}
function plan(title: string): ManifestPlan {
  return { title, objects: [] };
}

describe("routeCollectionPreview — the dialog's routing of ingest-flows' discriminated preview (PLAN §5)", () => {
  it("discards an aborted preview silently — a superseded keystroke maps to a no-op route, no state", () => {
    expect(routeCollectionPreview({ kind: "aborted" })).toEqual({ kind: "aborted" });
  });
  it("carries the parsed plan on the single-manifest route so the dialog needn't re-fetch (D2)", () => {
    const p = plan("Solo manifest");
    expect(routeCollectionPreview({ kind: "manifest", plan: p })).toEqual({ kind: "manifest", plan: p });
  });
  it("passes an error message straight through to the existing invalid display", () => {
    const preview: CollectionPreview = { kind: "error", message: "Couldn't open that link." };
    expect(routeCollectionPreview(preview)).toEqual({ kind: "error", message: "Couldn't open that link." });
  });
  it("turns an over-manifest-cap collection into a refusal naming the count — no picker", () => {
    const preview: CollectionPreview = { kind: "collection", rootTitle: "Big", result: traverse([], { status: "over-manifest-cap", manifestCount: 1500 }) };
    const route = routeCollectionPreview(preview);
    expect(route.kind).toBe("over-cap");
    if (route.kind === "over-cap") expect(route.message).toContain("1500");
  });
  it("builds a picker route (rows + skips) from an ok collection", () => {
    const skips: TraverseSkip[] = [{ reason: "duplicate", id: "https://x/dup", kind: "manifest", trail: ["Root"] }];
    const preview: CollectionPreview = {
      kind: "collection", rootTitle: "Herbals",
      result: traverse([dm("https://x/a", { label: "A", trail: ["Herbals"] }), dm("https://x/b", { trail: ["Herbals", "Sub"] })], { skips }),
    };
    const route = routeCollectionPreview(preview);
    expect(route.kind).toBe("collection");
    if (route.kind === "collection") {
      expect(route.rootTitle).toBe("Herbals");
      expect(route.rows.map((r) => r.label)).toEqual(["A", "b"]); // b has no label → URL-segment fallback
      expect(route.skips).toBe(skips);
    }
  });
});

describe("buildPickerRows — row model: label fallback + parent-collection context (PLAN §3)", () => {
  it("uses the inline collection label when present, and marks it as not needing hydration", () => {
    const [row] = buildPickerRows([dm("https://x/iiif/manifests/abc", { label: "Folio 1r", trail: ["Root"] })]);
    expect(row).toMatchObject({ label: "Folio 1r", needsHydration: false, checked: true });
  });
  it("falls back to the URL's last segment (collection-import's ONE urlSegment) when the label is absent, flagging hydration", () => {
    const [row] = buildPickerRows([dm("https://x/iiif/manifests/abc123", { trail: ["Root"] })]);
    expect(row).toMatchObject({ label: "abc123", needsHydration: true });
  });
  it("shows the trail minus the root as ' › '-joined context, and omits it when the manifest sits directly under the root", () => {
    const rows = buildPickerRows([
      dm("https://x/a", { trail: ["Root"] }),
      dm("https://x/b", { trail: ["Root", "Herbals"] }),
      dm("https://x/c", { trail: ["Root", "Herbals", "Quire 3"] }),
    ]);
    expect(rows.map((r) => r.context)).toEqual(["", "Herbals", "Herbals › Quire 3"]);
  });
  it("checks every row by default", () => {
    const rows = buildPickerRows([dm("https://x/a"), dm("https://x/b")]);
    expect(rows.every((r) => r.checked)).toBe(true);
  });
});

describe("selection — select all / none / count, and the confirm payload's order (PLAN §3)", () => {
  it("counts checked rows live", () => {
    const rows = buildPickerRows([dm("https://x/a"), dm("https://x/b"), dm("https://x/c")]);
    expect(checkedCount(rows)).toBe(3);
    rows[1]!.checked = false;
    expect(checkedCount(rows)).toBe(2);
  });
  it("select all / none flip every row", () => {
    const rows = buildPickerRows([dm("https://x/a"), dm("https://x/b")]);
    setAllChecked(rows, false);
    expect(checkedCount(rows)).toBe(0);
    setAllChecked(rows, true);
    expect(checkedCount(rows)).toBe(2);
  });
  it("emits the checked refs in COLLECTION ORDER, never check order", () => {
    const rows = buildPickerRows([dm("https://x/a"), dm("https://x/b"), dm("https://x/c")]);
    rows[1]!.checked = false; // uncheck the middle
    // Toggling c off then on last does not reorder — selectedRefs is row order.
    rows[2]!.checked = false;
    rows[2]!.checked = true;
    expect(selectedRefs(rows).map((r) => r.id)).toEqual(["https://x/a", "https://x/c"]);
  });
});

describe("overCapRefusal + skip note copy (PLAN §2/§5)", () => {
  it("names the true manifest count and points at a smaller sub-collection", () => {
    const msg = overCapRefusal(1500);
    expect(msg).toContain("1500");
    expect(msg.toLowerCase()).toContain("sub-collection");
  });
  it("skipNote is null when nothing was skipped, else a pluralized headline", () => {
    expect(skipNote([])).toBeNull();
    expect(skipNote([{ reason: "duplicate", id: "a", kind: "manifest", trail: [] }])).toBe("1 item skipped");
    expect(skipNote([
      { reason: "duplicate", id: "a", kind: "manifest", trail: [] },
      { reason: "depth-cap", id: "b", kind: "collection", trail: [] },
    ])).toBe("2 items skipped");
  });
  it("skipDetail groups counts by reason in plain language", () => {
    const detail = skipDetail([
      { reason: "duplicate", id: "a", kind: "manifest", trail: [] },
      { reason: "duplicate", id: "b", kind: "manifest", trail: [] },
      { reason: "fetch-failed", id: "c", kind: "collection", trail: [] },
    ]);
    expect(detail).toContain("2 already listed elsewhere");
    expect(detail).toContain("1 couldn't be read");
  });
});

describe("hydrateRowLabels — background label pool (PLAN §5): cap, cache, silent-fallback, abort", () => {
  it("replaces fallback labels in place and populates the plan cache, keyed by ref.id", async () => {
    const rows = buildPickerRows([dm("https://x/a"), dm("https://x/b", { label: "B" })]);
    const cache = new Map<string, ManifestPlan>();
    const fetchPlan = vi.fn(async (url: string) => plan(`Title for ${url}`));
    const summary = await hydrateRowLabels(rows, cache, fetchPlan);
    expect(fetchPlan).toHaveBeenCalledTimes(1); // only the label-less row a
    expect(rows[0]).toMatchObject({ label: "Title for https://x/a", needsHydration: false });
    expect(rows[1]!.label).toBe("B"); // already labelled — untouched
    expect(cache.get("https://x/a")?.title).toBe("Title for https://x/a");
    expect(summary).toMatchObject({ hydrated: 1, failed: 0, cappedOut: 0 });
  });
  it("enforces the fetch cap — rows beyond it keep their fallback and are counted", async () => {
    const rows = buildPickerRows([dm("https://x/a"), dm("https://x/b"), dm("https://x/c")]);
    const fetchPlan = vi.fn(async (url: string) => plan(`T ${url}`));
    const summary = await hydrateRowLabels(rows, new Map(), fetchPlan, { cap: 2 });
    expect(fetchPlan).toHaveBeenCalledTimes(2);
    expect(summary.cappedOut).toBe(1);
    expect(rows[2]!.label).toBe("c"); // fallback stands
  });
  it("keeps the fallback silently on a failed fetch — no throw, and the pool passes a non-alerting onError", async () => {
    const rows = buildPickerRows([dm("https://x/a")]);
    let sawOnError = false;
    const fetchPlan = vi.fn(async (_url: string, opts: { onError?: (m: string) => void }) => {
      // fetchManifestPlan calls onError then returns null on failure; the pool must supply one so no alert fires.
      expect(typeof opts.onError).toBe("function");
      opts.onError?.("boom");
      sawOnError = true;
      return null;
    });
    const summary = await hydrateRowLabels(rows, new Map(), fetchPlan);
    expect(sawOnError).toBe(true);
    expect(rows[0]!.label).toBe("a"); // unchanged
    expect(summary).toMatchObject({ hydrated: 0, failed: 1 });
  });
  it("stops pending fetches once the signal aborts — committed rows stand, later rows are never fetched", async () => {
    const rows = buildPickerRows([dm("https://x/a"), dm("https://x/b"), dm("https://x/c")]);
    const controller = new AbortController();
    const calls: string[] = [];
    const fetchPlan = vi.fn(async (url: string) => {
      calls.push(url);
      if (calls.length === 2) controller.abort(); // abort DURING the 2nd fetch
      return plan(`T ${url}`);
    });
    await hydrateRowLabels(rows, new Map(), fetchPlan, { signal: controller.signal, concurrency: 1 });
    expect(calls).toEqual(["https://x/a", "https://x/b"]); // c never fetched
    expect(rows[0]!.label).toBe("T https://x/a"); // 1st committed before abort
    expect(rows[1]!.label).toBe("b"); // 2nd aborted post-await → not applied
    expect(rows[2]!.label).toBe("c"); // untouched fallback
  });
});

describe("skipDetail — the branch the picker uses to show a disclosure vs. nothing (Archie-cbf6 D1)", () => {
  it("is empty when the traversal skipped nothing (so the picker shows no disclosure)", () => {
    expect(skipDetail([])).toBe("");
  });
  it("names each reason with a count when there ARE skips (the visible disclosure body)", () => {
    const detail = skipDetail([
      { reason: "duplicate", id: "a", kind: "manifest", trail: [] },
      { reason: "duplicate", id: "b", kind: "manifest", trail: [] },
      { reason: "fetch-failed", id: "c", kind: "manifest", trail: [] },
    ]);
    expect(detail).toBe("2 already listed elsewhere, 1 couldn't be read");
  });
});

describe("summarizeImport — the finished-batch summary surface (Archie-cbf6, PLAN §6/§8)", () => {
  const outcome = (o: Partial<CollectionImportOutcome> = {}): CollectionImportOutcome =>
    ({ createdSlugs: [], skipped: [], cancelled: false, fatal: null, ...o });

  it("full success names the count and shows no failures", () => {
    const s = summarizeImport(outcome({ createdSlugs: ["a", "b", "c"] }), 3);
    expect(s.tone).toBe("success");
    expect(s.headline).toBe("Created 3 exhibits.");
    expect(s.failures).toEqual([]);
    expect(s.overflow).toBe(0);
    expect(s.createdCount).toBe(3);
  });

  it("singular exhibit reads without the plural 's'", () => {
    expect(summarizeImport(outcome({ createdSlugs: ["a"] }), 1).headline).toBe("Created 1 exhibit.");
  });

  it("partial names the created count, the failed count, and one line per failure (label else URL)", () => {
    const s = summarizeImport(outcome({
      createdSlugs: ["a"],
      skipped: [
        { id: "https://x/m2", label: "Folio 2r", reason: "Couldn't open that link." },
        { id: "https://x/m3", reason: "not a manifest" }, // no label → URL is the name
      ],
    }), 3);
    expect(s.tone).toBe("partial");
    expect(s.headline).toBe("Created 1 exhibit. 2 couldn't be imported:");
    expect(s.failures).toEqual(["Folio 2r — Couldn't open that link.", "https://x/m3 — not a manifest"]);
    expect(s.overflow).toBe(0);
  });

  it("truncates the failure list past the cap and reports the overflow count (…and N more)", () => {
    const skipped = Array.from({ length: 14 }, (_, i) => ({ id: `https://x/m${i}`, reason: "boom" }));
    const s = summarizeImport(outcome({ createdSlugs: ["a"], skipped }), 15);
    expect(s.failures).toHaveLength(IMPORT_FAILURE_LIST_CAP); // exactly 10 named
    expect(s.overflow).toBe(4); // 14 - 10 elided into "…and 4 more"
    expect(s.headline).toContain("14 couldn't be imported");
  });

  it("cancelled reads 'Imported X of N before cancelling' and keeps the committed prefix", () => {
    const s = summarizeImport(outcome({ createdSlugs: ["a", "b"], cancelled: true }), 10);
    expect(s.tone).toBe("cancelled");
    expect(s.headline).toBe("Imported 2 of 10 exhibits before cancelling.");
    expect(s.createdCount).toBe(2);
  });

  it("fatal wins over other tones, names what was kept, and still lists the failure", () => {
    const s = summarizeImport(outcome({
      createdSlugs: ["a", "b"], // 'b' is the half-minted orphan the sweep recorded
      skipped: [{ id: "https://x/b", label: "Half one", reason: "Couldn't save this exhibit to this device — import stopped." }],
      cancelled: true, // even if an abort raced the storage failure, fatal takes precedence
      fatal: "storage exploded",
    }), 5);
    expect(s.tone).toBe("fatal");
    expect(s.headline).toBe("Couldn't save to this device, so the import stopped. Kept the 2 exhibits that imported first.");
    expect(s.failures).toEqual(["Half one — Couldn't save this exhibit to this device — import stopped."]);
    expect(s.createdCount).toBe(2); // Undo removes both, including the orphan
  });
});

// Type-only guard: PickerRow shape stays what the component binds to (checked is a plain boolean).
const _pickerRowShape: PickerRow = { ref: dm("https://x/a"), label: "a", context: "", needsHydration: true, checked: true };
void _pickerRowShape;
