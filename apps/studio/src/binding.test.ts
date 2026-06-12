import { describe, it, expect, beforeEach, vi } from "vitest";
// Characterization tests on the browser glue of invention #3 (worklist 0.4 — the binding seam was
// the highest-risk UNTESTED surface; the pure recents algebra is already core-tested). localStorage
// is stubbed (node env): these pin the tolerant-load / silent-save contracts the boot path leans on.
import { zipNameFor, loadLastBinding, saveLastBinding, loadRecents, saveRecents, supportsFolderPicker, supportsFileStreamSave } from "./binding.js";
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
