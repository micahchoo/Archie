import { describe, it, expect } from "vitest";
import {
  serializePlace, parsePlace, placesEqual, resolvePlace, librarySnapshot,
  LIBRARY, type Place,
} from "./place.js";

const overview = (slug: string): Place => ({ kind: "overview", slug });
const editor = (slug: string, objectId: string): Place => ({ kind: "editor", slug, objectId });

describe("serialize ↔ parse round trips", () => {
  const cases: Place[] = [
    LIBRARY,
    overview("voynich"),
    editor("voynich", "o1"),
    editor("voynich-rosettes", "p-abc123"),
  ];
  for (const p of cases) {
    it(`round-trips ${JSON.stringify(p)}`, () => {
      expect(parsePlace(serializePlace(p))).toEqual(p);
    });
  }

  it("serializes each kind to the archie-viewer cite-ladder grammar (ADR-0021 rungs)", () => {
    expect(serializePlace(LIBRARY)).toBe("#/");
    expect(serializePlace(overview("voynich"))).toBe("#/voynich"); // Exhibit rung
    expect(serializePlace(editor("voynich", "o1"))).toBe("#/voynich/o/o1"); // Object rung
  });

  it("percent-encodes/decodes segments with reserved characters", () => {
    const p = editor("a b/c", "o?1");
    const url = serializePlace(p);
    expect(url).not.toContain(" ");
    expect(parsePlace(url)).toEqual(p);
  });
});

describe("parsePlace tolerance", () => {
  it("treats empty / bare-hash as the library (a bare URL is Library Home, ADR-0024 #5)", () => {
    expect(parsePlace("")).toEqual(LIBRARY);
    expect(parsePlace("#")).toEqual(LIBRARY);
    expect(parsePlace("#/")).toEqual(LIBRARY);
    expect(parsePlace("/")).toEqual(LIBRARY);
  });
  it("accepts a bare fragment without the leading #", () => {
    expect(parsePlace("/voynich")).toEqual(overview("voynich"));
    expect(parsePlace("voynich/o/o1")).toEqual(editor("voynich", "o1"));
  });
  it("tolerates a #! hashbang", () => {
    expect(parsePlace("#!/voynich")).toEqual(overview("voynich"));
  });
  it("degrades a deeper viewer rung UP to the exhibit overview (Studio addresses only Exhibit/Object)", () => {
    expect(parsePlace("#/voynich/a/n5")).toEqual(overview("voynich")); // Note rung → overview
    expect(parsePlace("#/voynich/s/s2")).toEqual(overview("voynich")); // Section rung → overview
    expect(parsePlace("#/voynich/o1")).toEqual(overview("voynich")); // 2-seg, no /o/ → overview
  });
  it("ignores extra segments past the object id", () => {
    expect(parsePlace("#/voynich/o/o1/xywh")).toEqual(editor("voynich", "o1"));
  });
  it("does not throw on a malformed percent-escape", () => {
    expect(() => parsePlace("#/%E0%A4%A")).not.toThrow();
  });
});

describe("placesEqual", () => {
  it("matches identical places", () => {
    expect(placesEqual(LIBRARY, LIBRARY)).toBe(true);
    expect(placesEqual(overview("v"), overview("v"))).toBe(true);
    expect(placesEqual(editor("v", "o1"), editor("v", "o1"))).toBe(true);
  });
  it("separates by kind, slug, and object", () => {
    expect(placesEqual(LIBRARY, overview("v"))).toBe(false);
    expect(placesEqual(overview("v"), overview("w"))).toBe(false);
    expect(placesEqual(overview("v"), editor("v", "o1"))).toBe(false);
    expect(placesEqual(editor("v", "o1"), editor("v", "o2"))).toBe(false);
  });
});

describe("resolvePlace degrades to the nearest surviving ancestor (ADR-0024 #4)", () => {
  const lib = librarySnapshot([
    { slug: "voynich", objects: [{ id: "o1" }, { id: "o2" }] },
    { slug: "bidar", objects: [] },
  ]);

  it("passes the library through unchanged", () => {
    expect(resolvePlace(LIBRARY, lib)).toEqual({ place: LIBRARY, missing: null, degraded: false });
  });
  it("keeps a live overview / editor", () => {
    expect(resolvePlace(overview("voynich"), lib).degraded).toBe(false);
    expect(resolvePlace(editor("voynich", "o1"), lib).degraded).toBe(false);
  });
  it("missing exhibit → library, naming the exhibit", () => {
    const r = resolvePlace(overview("gone"), lib);
    expect(r).toEqual({ place: LIBRARY, missing: { kind: "exhibit", slug: "gone" }, degraded: true });
  });
  it("missing object (exhibit survives) → that exhibit's overview, naming the object", () => {
    const r = resolvePlace(editor("voynich", "o9"), lib);
    expect(r).toEqual({
      place: overview("voynich"),
      missing: { kind: "object", slug: "voynich", objectId: "o9" },
      degraded: true,
    });
  });
  it("editor of a live-but-empty exhibit → its overview (a 0-object overview is valid, ADR-0024 #2)", () => {
    const r = resolvePlace(editor("bidar", "o1"), lib);
    expect(r.place).toEqual(overview("bidar"));
    expect(r.degraded).toBe(true);
  });
  it("editor whose exhibit is gone → library, naming the exhibit (not the object)", () => {
    const r = resolvePlace(editor("gone", "o1"), lib);
    expect(r.place).toEqual(LIBRARY);
    expect(r.missing).toEqual({ kind: "exhibit", slug: "gone" });
  });
});
