import { describe, it, expect, beforeEach, vi } from "vitest";
// localStorage is stubbed (node env) — same idiom as canvas-first-use.test.ts / binding.test.ts.
import { safeGet, safeSet, safeRemove, persistedFlag, persistedString, readJson, writeJson } from "./persisted.js";

const store = new Map<string, string>();
const workingStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
vi.stubGlobal("localStorage", workingStub);

beforeEach(() => store.clear());

describe("safeGet / safeSet / safeRemove — the core", () => {
  it("round-trips a value", () => {
    expect(safeGet("k")).toBeNull();
    safeSet("k", "v");
    expect(safeGet("k")).toBe("v");
    safeRemove("k");
    expect(safeGet("k")).toBeNull();
  });

  it("never throw when localStorage itself throws (private mode / disabled storage)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("SecurityError"); },
      removeItem: () => { throw new Error("SecurityError"); },
    });
    expect(() => safeGet("k")).not.toThrow();
    expect(safeGet("k")).toBeNull();
    expect(() => safeSet("k", "v")).not.toThrow();
    expect(() => safeRemove("k")).not.toThrow();
    vi.stubGlobal("localStorage", workingStub);
  });

  it("a throwing setItem alone (quota denied) leaves reads/removes unaffected", () => {
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: () => { throw new Error("QuotaExceededError"); },
      removeItem: (k: string) => void store.delete(k),
    });
    expect(() => safeSet("k", "v")).not.toThrow();
    expect(safeGet("k")).toBeNull(); // the write never landed
    vi.stubGlobal("localStorage", workingStub);
  });
});

describe("persistedFlag", () => {
  it("defaults to false and round-trips true/false via explicit \"1\"/\"0\"", () => {
    const f = persistedFlag("archie.flag.v1");
    expect(f.get()).toBe(false);
    f.set(true);
    expect(f.get()).toBe(true);
    expect(store.get("archie.flag.v1")).toBe("1");
    f.set(false);
    expect(f.get()).toBe(false);
    expect(store.get("archie.flag.v1")).toBe("0");
  });

  it("treats any non-\"1\" stored value (garbage, absent, denied) as false", () => {
    const f = persistedFlag("archie.flag.v1");
    store.set("archie.flag.v1", "yes");
    expect(f.get()).toBe(false);
  });

  it("read/write never throw when localStorage throws; get reads as false", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("SecurityError"); },
      removeItem: () => { throw new Error("SecurityError"); },
    });
    const f = persistedFlag("archie.flag.v1");
    expect(() => f.get()).not.toThrow();
    expect(f.get()).toBe(false);
    expect(() => f.set(true)).not.toThrow();
    vi.stubGlobal("localStorage", workingStub);
  });
});

describe("persistedString", () => {
  type Mode = "grid" | "list";
  it("defaults to the fallback and accepts an allowed value", () => {
    const p = persistedString<Mode>("archie.mode.v1", ["list"], "grid");
    expect(p.get()).toBe("grid");
    p.set("list");
    expect(p.get()).toBe("list");
    expect(store.get("archie.mode.v1")).toBe("list");
  });

  it("falls back on garbage OR a retired value not in the allowed set", () => {
    const p = persistedString<Mode>("archie.mode.v1", ["list"], "grid");
    store.set("archie.mode.v1", "canvas"); // a retired legacy value
    expect(p.get()).toBe("grid");
    store.set("archie.mode.v1", "bogus");
    expect(p.get()).toBe("grid");
  });

  it("read/write never throw when localStorage throws; get reads as the fallback", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("SecurityError"); },
      removeItem: () => { throw new Error("SecurityError"); },
    });
    const p = persistedString<Mode>("archie.mode.v1", ["list"], "grid");
    expect(() => p.get()).not.toThrow();
    expect(p.get()).toBe("grid");
    expect(() => p.set("list")).not.toThrow();
    vi.stubGlobal("localStorage", workingStub);
  });
});

describe("readJson / writeJson", () => {
  interface Thing { a: number; b: string }
  const isThing = (v: unknown): v is Thing =>
    !!v && typeof v === "object" && typeof (v as Partial<Thing>).a === "number" && typeof (v as Partial<Thing>).b === "string";

  it("round-trips a value with no validator (trust-the-parse mode)", () => {
    expect(readJson<Thing>("archie.thing.v1")).toBeNull();
    writeJson("archie.thing.v1", { a: 1, b: "x" });
    expect(readJson<Thing>("archie.thing.v1")).toEqual({ a: 1, b: "x" });
  });

  it("trust-the-parse mode does NOT validate shape — a wrong-shaped stored value passes through", () => {
    store.set("archie.thing.v1", JSON.stringify({ nope: true }));
    expect(readJson<Thing>("archie.thing.v1")).toEqual({ nope: true } as unknown as Thing);
  });

  it("with a validator, absent / malformed JSON / wrong-shaped all collapse to null", () => {
    expect(readJson("archie.thing.v1", isThing)).toBeNull(); // absent
    store.set("archie.thing.v1", "{not json");
    expect(readJson("archie.thing.v1", isThing)).toBeNull(); // malformed
    store.set("archie.thing.v1", JSON.stringify({ nope: true }));
    expect(readJson("archie.thing.v1", isThing)).toBeNull(); // wrong shape
    store.set("archie.thing.v1", JSON.stringify({ a: 1, b: "x" }));
    expect(readJson("archie.thing.v1", isThing)).toEqual({ a: 1, b: "x" }); // valid
  });

  it("read/write never throw when localStorage throws; get reads as null", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("SecurityError"); },
      removeItem: () => { throw new Error("SecurityError"); },
    });
    expect(() => readJson<Thing>("archie.thing.v1", isThing)).not.toThrow();
    expect(readJson<Thing>("archie.thing.v1", isThing)).toBeNull();
    expect(() => writeJson("archie.thing.v1", { a: 1, b: "x" })).not.toThrow();
    vi.stubGlobal("localStorage", workingStub);
  });
});
