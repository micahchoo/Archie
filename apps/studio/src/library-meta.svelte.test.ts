import { describe, it, expect, vi, beforeEach } from "vitest";

// Guard the persist / touchBinding seam (STEP-5 §2) — the part of the manual smoke (item #8, binding
// chip) that IS automatable: which methods persist, and that onAfterPersist (= App's touchBinding) fires.
// Mock ./store so saveLibraryMeta is a spy and store.ts's OPFS code never loads.
const saveLibraryMeta = vi.fn(async () => {});
vi.mock("./store.js", () => ({ saveLibraryMeta }));

const { createLibraryStore } = await import("./library-meta.svelte.js");
type LibraryMeta = import("./store.js").LibraryMeta;

const initial = (): LibraryMeta => ({ title: "L", exhibits: [{ id: "e1", slug: "a", title: "A", objects: [] }] });
// A macrotask drains ALL pending microtasks — persist now hops through the save queue (worklist 0.1),
// so a fixed two-await flush undercounts.
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
// patch* now DEBOUNCES the persist (500ms) — wait past the window, then let the queued write settle.
const afterDebounce = () => new Promise<void>((r) => setTimeout(r, 600));

describe("library-meta store (rune wrapper)", () => {
  beforeEach(() => saveLibraryMeta.mockClear());

  it("patchExhibit mutates meta synchronously, then persists once (debounced) + fires onAfterPersist", async () => {
    const onAfterPersist = vi.fn();
    const lib = createLibraryStore(initial(), { onAfterPersist });
    lib.patchExhibit("a", { title: "A!" });
    expect(lib.meta.exhibits[0]!.title).toBe("A!"); // live read through the getter — instant
    await flush();
    expect(saveLibraryMeta).not.toHaveBeenCalled(); // debounced — no write yet
    await afterDebounce(); // settle the debounced fire-and-forget persist
    expect(saveLibraryMeta).toHaveBeenCalledTimes(1);
    expect(onAfterPersist).toHaveBeenCalledTimes(1);
  });

  it("a burst of patch* edits coalesces into ONE library.json write (the write-amplification fix)", async () => {
    const onAfterPersist = vi.fn();
    const lib = createLibraryStore(initial(), { onAfterPersist });
    const full = "A new description"; // simulate per-keystroke oninput → cumulative substrings
    for (let i = 1; i <= full.length; i++) lib.patchExhibit("a", { summary: full.slice(0, i) });
    await afterDebounce();
    expect(saveLibraryMeta).toHaveBeenCalledTimes(1); // ONE write for the whole burst, not one-per-keystroke
    expect(lib.meta.exhibits[0]!.summary).toBe(full); // the final coalesced state persisted
  });

  it("setMeta does NOT persist (boot reconcile / replaceProjectFrom keep their own timing)", async () => {
    const onAfterPersist = vi.fn();
    const lib = createLibraryStore(initial(), { onAfterPersist });
    lib.setMeta({ title: "X", exhibits: [] });
    expect(lib.meta.title).toBe("X");
    await flush();
    expect(saveLibraryMeta).not.toHaveBeenCalled();
    expect(onAfterPersist).not.toHaveBeenCalled();
  });

  it("explicit persist() writes + fires onAfterPersist (used by the conditional/await callers)", async () => {
    const onAfterPersist = vi.fn();
    const lib = createLibraryStore(initial(), { onAfterPersist });
    await lib.persist();
    expect(saveLibraryMeta).toHaveBeenCalledTimes(1);
    expect(onAfterPersist).toHaveBeenCalledTimes(1);
  });

  it("a FAILED write does not fire onAfterPersist (the binding chip must not claim sync)", async () => {
    const onAfterPersist = vi.fn();
    saveLibraryMeta.mockRejectedValueOnce(new Error("quota"));
    const lib = createLibraryStore(initial(), { onAfterPersist });
    await lib.persist();
    expect(saveLibraryMeta).toHaveBeenCalledTimes(1);
    expect(onAfterPersist).not.toHaveBeenCalled();
  });

  it("awaitable addExhibit appends and persists before resolving", async () => {
    const lib = createLibraryStore(initial(), {});
    await lib.addExhibit({ id: "e2", slug: "b", title: "B", objects: [] });
    expect(lib.meta.exhibits.map((e) => e.slug)).toEqual(["a", "b"]);
    expect(saveLibraryMeta).toHaveBeenCalledTimes(1);
  });

  it("bulk appendObjects appends N objects in ONE persist + fires ONE exhibit-assets dirt (the ingest-batch scale-fix)", async () => {
    const onDirty = vi.fn();
    const lib = createLibraryStore(initial(), { onDirty });
    const objs = Array.from({ length: 5 }, (_, i) => ({ id: `o${i + 1}`, source: `s${i + 1}`, label: `${i + 1}` }));
    await lib.appendObjects("a", objs);
    expect(lib.meta.exhibits[0]!.objects.map((o) => o.id)).toEqual(["o1", "o2", "o3", "o4", "o5"]); // order preserved
    expect(saveLibraryMeta).toHaveBeenCalledTimes(1); // ONE write for the whole batch, not one per object
    expect(onDirty.mock.calls.map((c) => c[0])).toEqual([{ kind: "exhibit-assets", slug: "a" }]); // ONE dirt, keyed by slug
  });

  it("appendObjects on an empty batch is a no-op — no persist, no dirt (identity preserved)", async () => {
    const onDirty = vi.fn();
    const lib = createLibraryStore(initial(), { onDirty });
    const before = lib.meta;
    await lib.appendObjects("a", []);
    expect(lib.meta).toBe(before); // same reference — no spurious re-render
    expect(saveLibraryMeta).not.toHaveBeenCalled();
    expect(onDirty).not.toHaveBeenCalled();
  });

  it("bulk removeObjects drops N objects in ONE persist (Phase 2 — no per-object write amplification)", async () => {
    const lib = createLibraryStore(
      { title: "L", exhibits: [{ id: "e1", slug: "a", title: "A", objects: [{ id: "o1", source: "s1", label: "1" }, { id: "o2", source: "s2", label: "2" }, { id: "o3", source: "s3", label: "3" }] }] },
      {},
    );
    await lib.removeObjects("a", new Set(["o1", "o3"]));
    expect(lib.meta.exhibits[0]!.objects.map((o) => o.id)).toEqual(["o2"]);
    expect(saveLibraryMeta).toHaveBeenCalledTimes(1); // ONE write for the whole bulk delete
  });

  it("bulk removeExhibits drops N exhibits in ONE persist + fires exhibit-removed per removed slug", async () => {
    const onDirty = vi.fn();
    const lib = createLibraryStore(
      { title: "L", exhibits: [{ id: "e1", slug: "a", title: "A", objects: [] }, { id: "e2", slug: "b", title: "B", objects: [] }, { id: "e3", slug: "c", title: "C", objects: [] }] },
      { onDirty },
    );
    await lib.removeExhibits(["a", "c", "nope"]); // "nope" is not present — must NOT emit a bogus prune
    expect(lib.meta.exhibits.map((e) => e.slug)).toEqual(["b"]);
    expect(saveLibraryMeta).toHaveBeenCalledTimes(1); // ONE write for the whole bulk delete, not per-slug
    expect(onDirty.mock.calls.map((c) => c[0])).toEqual([
      { kind: "exhibit-removed", slug: "a" },
      { kind: "exhibit-removed", slug: "c" },
    ]); // per removed slug only (bnd.markExhibitRemoved is per-slug); absent "nope" queues nothing
  });

  it("bulk patchExhibits applies ONE rights patch to N exhibits in ONE persist + fires exhibit dirt per present slug", async () => {
    const onDirty = vi.fn();
    const lib = createLibraryStore(
      { title: "L", exhibits: [{ id: "e1", slug: "a", title: "A", objects: [] }, { id: "e2", slug: "b", title: "B", objects: [] }, { id: "e3", slug: "c", title: "C", objects: [] }] },
      { onDirty },
    );
    await lib.patchExhibits(["a", "c", "nope"], { rights: "http://cc/by" }); // "nope" is not present
    expect(lib.meta.exhibits.find((e) => e.slug === "a")!.rights).toBe("http://cc/by");
    expect(lib.meta.exhibits.find((e) => e.slug === "c")!.rights).toBe("http://cc/by");
    expect(lib.meta.exhibits.find((e) => e.slug === "b")!.rights).toBeUndefined(); // unselected untouched
    expect(saveLibraryMeta).toHaveBeenCalledTimes(1); // ONE write for the whole bulk edit, not per-slug
    expect(onDirty.mock.calls.map((c) => c[0])).toEqual([
      { kind: "exhibit", slug: "a" },
      { kind: "exhibit", slug: "c" },
    ]); // same per-slug `exhibit` dirt as singular patchExhibit (bnd.markExhibitDirty); absent "nope" none
  });
});
