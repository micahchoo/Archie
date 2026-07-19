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

describe("canvas-first-use — legend flag", () => {
  it("defaults to not-seen", () => {
    expect(legendSeen()).toBe(false);
  });

  it("marks seen and stays seen (metadata write, not a toggle)", () => {
    markLegendSeen();
    expect(legendSeen()).toBe(true);
    expect(store.get("archie.canvasLegendSeen.v1")).toBe("1");
    markLegendSeen(); // idempotent — a second mark doesn't unset anything
    expect(legendSeen()).toBe(true);
  });
});

describe("canvas-first-use — hint flag", () => {
  it("defaults to not-seen", () => {
    expect(hintSeen()).toBe(false);
  });

  it("marks seen independently of the legend flag", () => {
    markHintSeen();
    expect(hintSeen()).toBe(true);
    expect(legendSeen()).toBe(false); // two separate keys, not one shared "onboarded" flag
  });
});

describe("canvas-first-use — private-mode tolerance", () => {
  it("read/write never throw when localStorage itself throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("SecurityError"); },
      removeItem: () => { throw new Error("SecurityError"); },
    });
    expect(() => legendSeen()).not.toThrow();
    expect(legendSeen()).toBe(false); // treated as never-seen — cue simply re-shows, harmless
    expect(() => markLegendSeen()).not.toThrow();
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
