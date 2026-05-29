import { describe, it, expect } from "vitest";
import { patchLibraryIn, patchExhibitIn, patchObjectIn, appendObjectIn, addExhibitIn, removeExhibitIn, removeObjectIn } from "./library-meta-reducers.js";
import type { LibraryMeta } from "./store.js";

// The pure reducers behind the library-meta store — App.svelte's ~14 hand-rolled
// `{...exhibits.map(...)}` patches, factored out so they're testable headless (the rune store + Svelte
// shell stay manual-smoke). Immutability + per-slug/per-object isolation are the load-bearing properties.
const meta = (): LibraryMeta => ({
  title: "Lib",
  exhibits: [
    { id: "e1", slug: "a", title: "A", objects: [{ id: "o1", source: "s1", label: "one" }, { id: "o2", source: "s2", label: "two" }] },
    { id: "e2", slug: "b", title: "B", objects: [{ id: "o3", source: "s3", label: "three" }] },
  ],
});

describe("library-meta reducers", () => {
  it("patchLibraryIn merges top-level fields, returns a new object", () => {
    const m = meta();
    const next = patchLibraryIn(m, { title: "New", summary: "s" });
    expect(next.title).toBe("New");
    expect(next.summary).toBe("s");
    expect(next).not.toBe(m); // new ref
    expect(m.title).toBe("Lib"); // input untouched
  });

  it("patchExhibitIn updates ONLY the matched slug", () => {
    const m = meta();
    const next = patchExhibitIn(m, "b", { title: "B!" });
    expect(next.exhibits.find((e) => e.slug === "b")!.title).toBe("B!");
    expect(next.exhibits.find((e) => e.slug === "a")!.title).toBe("A"); // untouched
    expect(next.exhibits.find((e) => e.slug === "a")).toBe(m.exhibits[0]); // unmatched ref preserved
  });

  it("patchObjectIn updates ONLY the matched object in the matched slug", () => {
    const m = meta();
    const next = patchObjectIn(m, "a", "o2", { label: "TWO" });
    const exA = next.exhibits.find((e) => e.slug === "a")!;
    expect(exA.objects.find((o) => o.id === "o2")!.label).toBe("TWO");
    expect(exA.objects.find((o) => o.id === "o1")!.label).toBe("one"); // sibling object untouched
    expect(next.exhibits.find((e) => e.slug === "b")).toBe(m.exhibits[1]); // other exhibit ref preserved
  });

  it("appendObjectIn appends to the matched exhibit only", () => {
    const next = appendObjectIn(meta(), "a", { id: "o9", source: "s9", label: "nine" });
    expect(next.exhibits.find((e) => e.slug === "a")!.objects.map((o) => o.id)).toEqual(["o1", "o2", "o9"]);
    expect(next.exhibits.find((e) => e.slug === "b")!.objects).toHaveLength(1);
  });

  it("addExhibitIn appends an exhibit", () => {
    const next = addExhibitIn(meta(), { id: "e3", slug: "c", title: "C", objects: [] });
    expect(next.exhibits.map((e) => e.slug)).toEqual(["a", "b", "c"]);
  });

  it("removeExhibitIn drops ONLY the matched slug; others keep identity", () => {
    const m = meta();
    const next = removeExhibitIn(m, "a");
    expect(next.exhibits.map((e) => e.slug)).toEqual(["b"]);
    expect(next.exhibits[0]).toBe(m.exhibits[1]); // surviving ref preserved
    expect(m.exhibits).toHaveLength(2); // input untouched
  });

  it("removeExhibitIn on the last exhibit leaves a truly-empty library (no reseed)", () => {
    const one: LibraryMeta = { title: "Lib", exhibits: [{ id: "e1", slug: "a", title: "A", objects: [] }] };
    expect(removeExhibitIn(one, "a").exhibits).toEqual([]);
  });

  it("removeObjectIn drops ONLY the matched object in the matched slug", () => {
    const m = meta();
    const next = removeObjectIn(m, "a", "o1");
    expect(next.exhibits.find((e) => e.slug === "a")!.objects.map((o) => o.id)).toEqual(["o2"]);
    expect(next.exhibits.find((e) => e.slug === "b")).toBe(m.exhibits[1]); // other exhibit untouched
  });

  it("removeObjectIn on the last object leaves an empty exhibit (valid post-e5c0)", () => {
    const next = removeObjectIn(meta(), "b", "o3");
    expect(next.exhibits.find((e) => e.slug === "b")!.objects).toEqual([]);
  });
});
