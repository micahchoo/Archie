import { describe, it, expect, beforeEach, vi } from "vitest";
// localStorage is stubbed (node env) — same idiom as binding.test.ts.
import { legendSeen, markLegendSeen, hintSeen, markHintSeen } from "./canvas-first-use.js";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

beforeEach(() => store.clear());

describe("canvas-first-use — legend flag (per-mode)", () => {
  it("defaults to not-seen in both modes", () => {
    expect(legendSeen("canvas")).toBe(false);
    expect(legendSeen("list")).toBe(false);
  });

  it("marks seen and stays seen (metadata write, not a toggle)", () => {
    markLegendSeen("canvas");
    expect(legendSeen("canvas")).toBe(true);
    expect(store.get("archie.canvasLegendSeen.v2.canvas")).toBe("1");
    markLegendSeen("canvas"); // idempotent — a second mark doesn't unset anything
    expect(legendSeen("canvas")).toBe(true);
  });

  it("a reorder demonstrated in LIST mode does NOT mark the CANVAS legend seen (Archie-adae)", () => {
    markLegendSeen("list");
    expect(legendSeen("list")).toBe(true);
    expect(legendSeen("canvas")).toBe(false); // canvas legend still shows next time canvas mode is on
  });

  it("a reorder demonstrated in CANVAS mode does NOT mark the LIST flag seen", () => {
    markLegendSeen("canvas");
    expect(legendSeen("canvas")).toBe(true);
    expect(legendSeen("list")).toBe(false);
  });

  it("migration: the OLD single flag grandfathers BOTH modes as seen", () => {
    store.set("archie.canvasLegendSeen.v1", "1"); // pre-split user who already dismissed it
    expect(legendSeen("canvas")).toBe(true);
    expect(legendSeen("list")).toBe(true);
  });

  it("migration: the old flag is read-only — marking one mode doesn't touch it", () => {
    store.set("archie.canvasLegendSeen.v1", "1");
    markLegendSeen("canvas");
    expect(store.get("archie.canvasLegendSeen.v1")).toBe("1"); // unchanged, never written forward
  });
});

describe("canvas-first-use — hint flag", () => {
  it("defaults to not-seen", () => {
    expect(hintSeen()).toBe(false);
  });

  it("marks seen independently of the legend flags", () => {
    markHintSeen();
    expect(hintSeen()).toBe(true);
    expect(legendSeen("canvas")).toBe(false); // separate keys, not one shared "onboarded" flag
    expect(legendSeen("list")).toBe(false);
  });
});

describe("canvas-first-use — private-mode tolerance", () => {
  it("read/write never throw when localStorage itself throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("SecurityError"); },
      removeItem: () => { throw new Error("SecurityError"); },
    });
    expect(() => legendSeen("canvas")).not.toThrow();
    expect(legendSeen("canvas")).toBe(false); // treated as never-seen — cue simply re-shows, harmless
    expect(() => markLegendSeen("canvas")).not.toThrow();
    expect(() => hintSeen()).not.toThrow();
    expect(() => markHintSeen()).not.toThrow();

    // restore the working stub for any later test in this file
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
});
