// Phase 4 — grid density: metrics coupling + localStorage persistence with a safe default.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { densityMetrics, loadGridDensity, saveGridDensity } from "./grid-density.js";

/** Install a Map-backed localStorage so the read/write path is exercised regardless of test env. */
function fakeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() { return m.size; },
  } as Storage;
}

describe("densityMetrics — min column width and intrinsic size move together", () => {
  it("comfortable matches the established grid defaults", () => {
    expect(densityMetrics("comfortable")).toEqual({ minCol: "280px", intrinsic: "360px" });
  });
  it("compact packs smaller — both metrics shrink", () => {
    const m = densityMetrics("compact");
    expect(m).toEqual({ minCol: "180px", intrinsic: "260px" });
    expect(parseInt(m.minCol)).toBeLessThan(parseInt(densityMetrics("comfortable").minCol));
    expect(parseInt(m.intrinsic)).toBeLessThan(parseInt(densityMetrics("comfortable").intrinsic));
  });
});

describe("loadGridDensity / saveGridDensity", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  beforeEach(() => { Object.defineProperty(globalThis, "localStorage", { value: fakeLocalStorage(), configurable: true }); });
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  // V20: the default was the density that shows FEWEST — measured at 1280x800, three of twelve objects
  // in view on an exhibit whose own summary says it exists "to browse side by side". Compact is now the
  // unset default; an explicit "comfortable" is still honoured and still round-trips.
  it("defaults to compact when unset", () => {
    expect(loadGridDensity()).toBe("compact");
  });

  it("round-trips a saved density", () => {
    saveGridDensity("compact");
    expect(loadGridDensity()).toBe("compact");
    saveGridDensity("comfortable");
    expect(loadGridDensity()).toBe("comfortable");
  });

  it("defaults to compact on an unrecognized stored value", () => {
    localStorage.setItem("archie:gridDensity", "huge");
    expect(loadGridDensity()).toBe("compact");
  });

  it("does not throw and defaults when localStorage is unavailable (SSR/private)", () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(() => saveGridDensity("compact")).not.toThrow();
    expect(loadGridDensity()).toBe("compact");
  });
});
