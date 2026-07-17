import { describe, it, expect, beforeEach, vi } from "vitest";
// Characterization tests on the browser glue of invention #3 (worklist 0.4 — the binding seam was
// the highest-risk UNTESTED surface; the pure recents algebra is already core-tested). localStorage
// is stubbed (node env): these pin the tolerant-load / silent-save contracts the boot path leans on.
import { zipNameFor, loadLastBinding, saveLastBinding, loadRecents, saveRecents, subscribeRecents, supportsFolderPicker, supportsFileStreamSave } from "./binding.js";
import type { Binding, RecentProject } from "@render/core";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const BINDING_KEY = "archie.activeBinding.v1";
const RECENTS_KEY = "archie.recentProjects.v1";

beforeEach(() => store.clear());

describe("binding seam — capability detection (node = the no-FSA floor)", () => {
  it("reports no folder picker / file stream without a window", () => {
    expect(supportsFolderPicker()).toBe(false);
    expect(supportsFileStreamSave()).toBe(false);
  });
});

describe("binding seam — zipNameFor", () => {
  it("derives a filesystem-safe .archie.zip name", () => {
    expect(zipNameFor("Archie Library")).toBe("archie-library.archie.zip");
    expect(zipNameFor("  Voynich: the *Cipher* reading!  ")).toBe("voynich-the-cipher-reading.archie.zip");
  });
  it("falls back to 'library' when the title sanitizes to nothing", () => {
    expect(zipNameFor("")).toBe("library.archie.zip");
    expect(zipNameFor("⌘⌘⌘")).toBe("library.archie.zip");
  });
});

describe("binding seam — active-binding descriptor round-trip", () => {
  it("folder binding (with handleKey) survives a reload", () => {
    const b: Binding = { kind: "folder", name: "MyLib", handleKey: "hk-1" };
    saveLastBinding(b);
    expect(loadLastBinding()).toEqual(b);
  });
  it("file binding (no handleKey) survives a reload without growing fields", () => {
    saveLastBinding({ kind: "file", name: "lib.archie.zip" });
    expect(loadLastBinding()).toEqual({ kind: "file", name: "lib.archie.zip" });
  });
  it("unbound CLEARS the stored descriptor (Close project leaves nothing behind)", () => {
    saveLastBinding({ kind: "folder", name: "X", handleKey: "k" });
    saveLastBinding({ kind: "unbound" });
    expect(store.has(BINDING_KEY)).toBe(false);
    expect(loadLastBinding()).toEqual({ kind: "unbound" });
  });
  it("tolerates corrupt / malformed records (boot must never throw)", () => {
    store.set(BINDING_KEY, "{not json");
    expect(loadLastBinding()).toEqual({ kind: "unbound" });
    store.set(BINDING_KEY, JSON.stringify({ kind: "teleport", name: "X" }));
    expect(loadLastBinding()).toEqual({ kind: "unbound" });
    store.set(BINDING_KEY, JSON.stringify({ kind: "folder" })); // missing name
    expect(loadLastBinding()).toEqual({ kind: "unbound" });
  });
});

describe("binding seam — recents round-trip", () => {
  const rec = (id: string, ts: number): RecentProject => ({ id, name: id, kind: "folder", lastOpened: ts, reopenable: true });
  it("save → load preserves the list", () => {
    const list = [rec("a", 2), rec("b", 1)];
    saveRecents(list);
    expect(loadRecents()).toEqual(list);
  });
  it("tolerates corrupt storage ([] — recents are hints, never load-bearing)", () => {
    store.set(RECENTS_KEY, "][");
    expect(loadRecents()).toEqual([]);
  });
  it("empty storage loads as []", () => {
    expect(loadRecents()).toEqual([]);
  });
});

describe("binding seam — cross-tab recents reconcile (Issue 22 / TABS)", () => {
  const rec = (id: string, ts: number): RecentProject => ({ id, name: id, kind: "folder", lastOpened: ts, reopenable: true });

  it("adopts another tab's recents write via the storage event (no lost update)", () => {
    // Stub a minimal window that records the storage listener so we can fire a cross-tab event.
    let handler: ((e: any) => void) | null = null;
    vi.stubGlobal("window", {
      addEventListener: (type: string, h: (e: any) => void) => { if (type === "storage") handler = h; },
      removeEventListener: () => {},
    });
    const seen: RecentProject[][] = [];
    const unsub = subscribeRecents((list) => seen.push(list));
    expect(typeof handler).toBe("function");

    // Simulate TAB B adding a recent to the shared key, then the storage event firing in THIS tab.
    store.set(RECENTS_KEY, JSON.stringify([rec("from-tab-b", 5)]));
    handler!({ key: RECENTS_KEY, newValue: store.get(RECENTS_KEY) });
    expect(seen.at(-1)).toEqual([rec("from-tab-b", 5)]); // this tab adopted B's list

    // An unrelated key change is ignored.
    handler!({ key: "some.other.key", newValue: "x" });
    expect(seen.length).toBe(1);

    unsub();
    vi.unstubAllGlobals();
  });

  it("no-ops without a window (node/SSR floor)", () => {
    // No window stubbed here → subscribeRecents returns a no-op unsubscribe and never throws.
    const unsub = subscribeRecents(() => { throw new Error("should not fire"); });
    expect(typeof unsub).toBe("function");
    unsub();
  });
});
