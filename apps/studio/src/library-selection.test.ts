// Phase 2 — LibraryHome exhibit multi-select. The selection GRAMMAR is exercised by
// overview-selection.test.ts (imported here, not re-tested); this file covers only what library-selection
// adds: the selectable-in-view derivation (search filter + template exclusion) that makes
// select-all-respects-search + template-exclusion structural, plus the bar's helper predicates.
import { describe, it, expect } from "vitest";
import {
  selectableSlugs,
  allSelected,
  pruneSelection,
  reconcileSelection,
  applyClick,
  selectAll,
} from "./library-selection.js";

type Ex = { slug: string };
const ex = (...slugs: string[]): Ex[] => slugs.map((slug) => ({ slug }));
// Examples/templates in these fixtures: any slug starting with "ex-".
const isTemplate = (slug: string) => slug.startsWith("ex-");

describe("selectableSlugs — search filter + template exclusion", () => {
  it("returns the shown slugs in display order, dropping templates", () => {
    const shown = ex("a", "ex-voynich", "b", "ex-beowulf", "c");
    expect(selectableSlugs(shown, isTemplate)).toEqual(["a", "b", "c"]);
  });

  it("respects the active search: only the filtered set is selectable", () => {
    // The caller passes the ALREADY-filtered view (filterExhibits output) — this never re-filters, so
    // 'search Documents → select all' selects exactly what's on screen.
    const filtered = ex("docs-1", "docs-2");
    expect(selectableSlugs(filtered, isTemplate)).toEqual(["docs-1", "docs-2"]);
  });

  it("an all-template view is not selectable at all", () => {
    expect(selectableSlugs(ex("ex-a", "ex-b"), isTemplate)).toEqual([]);
  });

  it("feeds the shared reducers: select-all over the selectable list excludes templates", () => {
    const shown = ex("a", "ex-t", "b");
    const s = selectAll(selectableSlugs(shown, isTemplate));
    expect([...s.selection]).toEqual(["a", "b"]);
    expect(s.anchor).toBe("b"); // last selectable, so a following shift-click ranges from there
  });

  it("feeds the shared reducers: a shift-range over the selectable list can never pick a template", () => {
    const shown = ex("a", "ex-t", "b", "c");
    const selectable = selectableSlugs(shown, isTemplate); // ["a","b","c"] — template gone from the order
    const r = applyClick({ selection: new Set(["a"]), anchor: "a" }, "c", { meta: false, shift: true }, selectable);
    expect([...r.selection]).toEqual(["a", "b", "c"]);
  });
});

describe("allSelected — Select-all disabled state", () => {
  const selectable = ["a", "b", "c"];
  it("true only when every selectable slug is selected", () => {
    expect(allSelected(new Set(["a", "b", "c"]), selectable)).toBe(true);
    expect(allSelected(new Set(["a", "b", "c", "extra"]), selectable)).toBe(true); // extras off-view don't matter
    expect(allSelected(new Set(["a", "b"]), selectable)).toBe(false);
  });
  it("empty selectable set is false (nothing to have selected)", () => {
    expect(allSelected(new Set(), [])).toBe(false);
    expect(allSelected(new Set(["a"]), [])).toBe(false);
  });
});

describe("pruneSelection — drop removed exhibits", () => {
  it("keeps only slugs that still exist, order-independent", () => {
    const pruned = pruneSelection(new Set(["a", "b", "gone"]), ["a", "b", "c"]);
    expect(pruned).toEqual(new Set(["a", "b"]));
  });
  it("is pure — a new Set, inputs untouched", () => {
    const sel = new Set(["a", "gone"]);
    const out = pruneSelection(sel, ["a"]);
    expect(out).not.toBe(sel);
    expect(sel).toEqual(new Set(["a", "gone"]));
    expect(out).toEqual(new Set(["a"]));
  });
  it("accepts a Set or any iterable for the existing slugs", () => {
    expect(pruneSelection(new Set(["a", "b"]), new Set(["a"]))).toEqual(new Set(["a"]));
  });
});

describe("reconcileSelection — one source of truth after a removal", () => {
  it("drops removed slugs from the selection AND clears a now-dangling anchor, reporting a change", () => {
    const r = reconcileSelection({ selection: new Set(["a", "gone"]), anchor: "gone" }, ["a", "b"]);
    expect(r.state.selection).toEqual(new Set(["a"]));
    expect(r.state.anchor).toBeNull(); // anchor's exhibit is gone → dropped, so no phantom shift-range origin
    expect(r.selectionChanged).toBe(true);
  });

  it("keeps a still-live anchor", () => {
    const r = reconcileSelection({ selection: new Set(["a", "gone"]), anchor: "a" }, ["a", "b"]);
    expect(r.state.selection).toEqual(new Set(["a"]));
    expect(r.state.anchor).toBe("a");
  });

  it("reports NO change when nothing was removed (the reactive write-back must not self-trigger)", () => {
    const state = { selection: new Set(["a", "b"]), anchor: "b" };
    const r = reconcileSelection(state, ["a", "b", "c"]);
    expect(r.selectionChanged).toBe(false);
    expect(r.state.selection).toEqual(new Set(["a", "b"]));
    expect(r.state.anchor).toBe("b");
  });

  it("is pure — inputs untouched", () => {
    const sel = new Set(["a", "gone"]);
    const r = reconcileSelection({ selection: sel, anchor: "gone" }, ["a"]);
    expect(sel).toEqual(new Set(["a", "gone"]));
    expect(r.state.selection).not.toBe(sel);
  });
});
