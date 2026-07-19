import { describe, it, expect, beforeEach, vi } from "vitest";
// localStorage is stubbed (node env) — same idiom as binding.test.ts. The per-mode pan/zoom legend flag
// was retired with the spatial canvas (SCALE-GALLERY); only the open hint survives.
import { hintSeen, markHintSeen } from "./canvas-first-use.js";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

beforeEach(() => store.clear());

describe("canvas-first-use — hint flag", () => {
  it("defaults to not-seen", () => {
    expect(hintSeen()).toBe(false);
  });

  it("marks seen and stays seen (metadata write, not a toggle)", () => {
    markHintSeen();
    expect(hintSeen()).toBe(true);
    expect(store.get("archie.canvasHintSeen.v1")).toBe("1");
    markHintSeen(); // idempotent — a second mark doesn't unset anything
    expect(hintSeen()).toBe(true);
  });
});

describe("canvas-first-use — private-mode tolerance", () => {
  it("read/write never throw when localStorage itself throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("SecurityError"); },
      removeItem: () => { throw new Error("SecurityError"); },
    });
    expect(() => hintSeen()).not.toThrow();
    expect(hintSeen()).toBe(false); // treated as never-seen — cue simply re-shows, harmless
    expect(() => markHintSeen()).not.toThrow();

    // restore the working stub for any later test in this file
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
});
