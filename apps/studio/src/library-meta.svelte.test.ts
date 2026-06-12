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

describe("library-meta store (rune wrapper)", () => {
  beforeEach(() => saveLibraryMeta.mockClear());

  it("patchExhibit mutates meta, persists once, and fires onAfterPersist (the touchBinding seam)", async () => {
    const onAfterPersist = vi.fn();
    const lib = createLibraryStore(initial(), { onAfterPersist });
    lib.patchExhibit("a", { title: "A!" });
    expect(lib.meta.exhibits[0]!.title).toBe("A!"); // live read through the getter
    await flush(); // settle the fire-and-forget persist
    expect(saveLibraryMeta).toHaveBeenCalledTimes(1);
    expect(onAfterPersist).toHaveBeenCalledTimes(1);
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
});
