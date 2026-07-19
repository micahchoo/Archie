import { describe, it, expect, beforeEach, vi } from "vitest";
// localStorage is stubbed (node env) — same idiom as binding.test.ts. reloadViewPrefsForTests re-reads
// the module-singleton $state container from the stub so each test can prime storage first.
import { viewPrefs, reloadViewPrefsForTests } from "./view-prefs.svelte";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

beforeEach(() => {
  store.clear();
  reloadViewPrefsForTests();
});

describe("view-prefs — overviewMode", () => {
  it("defaults to canvas", () => {
    expect(viewPrefs.overviewMode).toBe("canvas");
  });

  it("persists a set value and survives a reload", () => {
    viewPrefs.setOverviewMode("list");
    expect(viewPrefs.overviewMode).toBe("list");
    expect(store.get("archie.overviewMode.v1")).toBe("list");

    reloadViewPrefsForTests(); // simulate a fresh app load reading localStorage again
    expect(viewPrefs.overviewMode).toBe("list");
  });

  it("last-set wins", () => {
    viewPrefs.setOverviewMode("list");
    viewPrefs.setOverviewMode("canvas");
    expect(viewPrefs.overviewMode).toBe("canvas");
    reloadViewPrefsForTests();
    expect(viewPrefs.overviewMode).toBe("canvas");
  });

  it("tolerates garbage in storage by falling back to the default", () => {
    store.set("archie.overviewMode.v1", "bogus");
    reloadViewPrefsForTests();
    expect(viewPrefs.overviewMode).toBe("canvas");
  });
});

describe("view-prefs — galleryView", () => {
  it("defaults to exhibits", () => {
    expect(viewPrefs.galleryView).toBe("exhibits");
  });

  it("persists a set value and survives a reload", () => {
    viewPrefs.setGalleryView("wall");
    expect(viewPrefs.galleryView).toBe("wall");
    expect(store.get("archie.libraryGalleryView.v1")).toBe("wall");

    reloadViewPrefsForTests();
    expect(viewPrefs.galleryView).toBe("wall");
  });

  it("is independent of overviewMode (two separate keys)", () => {
    viewPrefs.setOverviewMode("list");
    viewPrefs.setGalleryView("wall");
    expect(viewPrefs.overviewMode).toBe("list");
    expect(viewPrefs.galleryView).toBe("wall");
    expect(store.size).toBe(2);
  });

  it("tolerates garbage in storage by falling back to the default", () => {
    store.set("archie.libraryGalleryView.v1", "bogus");
    reloadViewPrefsForTests();
    expect(viewPrefs.galleryView).toBe("exhibits");
  });
});

describe("view-prefs — inspectorWidth (Archie-d48e: dock → inspector rename)", () => {
  it("defaults to null (the CSS clamp() width) when nothing is stored", () => {
    expect(viewPrefs.inspectorWidth).toBeNull();
  });

  it("persists a set width under the new key and survives a reload", () => {
    viewPrefs.setInspectorWidth(360);
    expect(viewPrefs.inspectorWidth).toBe(360);
    expect(store.get("archie.editorInspectorWidth.v1")).toBe("360");

    reloadViewPrefsForTests();
    expect(viewPrefs.inspectorWidth).toBe(360);
  });

  it("falls back to the legacy dock-width key so a rename doesn't lose an existing user's width", () => {
    store.set("archie.editorDockWidth.v1", "412"); // width dragged before the rename
    reloadViewPrefsForTests();
    expect(viewPrefs.inspectorWidth).toBe(412);
  });

  it("prefers the new key over the legacy key when both exist", () => {
    store.set("archie.editorDockWidth.v1", "412");
    store.set("archie.editorInspectorWidth.v1", "300");
    reloadViewPrefsForTests();
    expect(viewPrefs.inspectorWidth).toBe(300);
  });

  it("clearing to null removes the new key (back to the default width)", () => {
    viewPrefs.setInspectorWidth(360);
    viewPrefs.setInspectorWidth(null);
    expect(viewPrefs.inspectorWidth).toBeNull();
    expect(store.has("archie.editorInspectorWidth.v1")).toBe(false);
  });

  it("clearing to null ALSO removes the legacy key, so a reset doesn't resurrect the old dock width", () => {
    store.set("archie.editorDockWidth.v1", "412"); // a pre-rename width still in storage
    reloadViewPrefsForTests();
    expect(viewPrefs.inspectorWidth).toBe(412); // fallback picked it up

    viewPrefs.setInspectorWidth(null); // ResizeDivider reset
    expect(store.has("archie.editorDockWidth.v1")).toBe(false);
    expect(store.has("archie.editorInspectorWidth.v1")).toBe(false);

    reloadViewPrefsForTests(); // a fresh load must NOT bring the legacy width back
    expect(viewPrefs.inspectorWidth).toBeNull();
  });
});

describe("view-prefs — private-mode tolerance", () => {
  it("read/write never throw when localStorage itself throws (mirrors canvas-first-use.test.ts)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("SecurityError"); },
      removeItem: () => { throw new Error("SecurityError"); },
    });
    expect(() => reloadViewPrefsForTests()).not.toThrow();
    expect(viewPrefs.overviewMode).toBe("canvas"); // treated as unset — resets to default, harmless
    expect(viewPrefs.galleryView).toBe("exhibits");
    expect(() => viewPrefs.setOverviewMode("list")).not.toThrow();
    expect(() => viewPrefs.setGalleryView("wall")).not.toThrow();
    // the in-memory $state still updates even though the persist write was swallowed — the preference
    // just won't survive a reload this session (same contract as App.svelte's FIRST_ADD_KEY idiom).
    expect(viewPrefs.overviewMode).toBe("list");
    expect(viewPrefs.galleryView).toBe("wall");

    // restore the working stub for any later test in this file
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    reloadViewPrefsForTests();
  });
});
