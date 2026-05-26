import { describe, it, expect } from "vitest";
import { parseRoute, routeToHash, type ViewerRoute } from "./route.js";

// Slug-qualified hash routing for the single Viewer shell (CONTEXT §"Local view loop").
// The deceptively-simple item flagged in LOCAL-VIEW-PHASE-A.md: the corpus, not the happy path.

describe("parseRoute", () => {
  it("empty / bare hash / root → gallery", () => {
    for (const h of ["", "#", "#/", "/"]) expect(parseRoute(h)).toEqual({ view: "gallery" });
  });

  it("#/<slug> → exhibit", () => {
    expect(parseRoute("#/voynich")).toEqual({ view: "exhibit", slug: "voynich" });
  });

  it("trailing slash is tolerated", () => {
    expect(parseRoute("#/voynich/")).toEqual({ view: "exhibit", slug: "voynich" });
  });

  it("#/<slug>/a/<noteId> → exhibit landing on a note", () => {
    expect(parseRoute("#/voynich/a/n7")).toEqual({ view: "exhibit", slug: "voynich", noteId: "n7" });
  });

  it("carries ?xywh alongside a note", () => {
    expect(parseRoute("#/voynich/a/n7?xywh=10,20,30,40")).toEqual({
      view: "exhibit", slug: "voynich", noteId: "n7", xywh: "10,20,30,40",
    });
  });

  it("ignores xywh without a note (it is meaningless there)", () => {
    expect(parseRoute("#/voynich?xywh=1,2,3,4")).toEqual({ view: "exhibit", slug: "voynich" });
  });

  it("empty note id degrades to plain exhibit, never throws", () => {
    expect(parseRoute("#/voynich/a/")).toEqual({ view: "exhibit", slug: "voynich" });
  });

  it("garbage never throws — double slash collapses to gallery", () => {
    expect(() => parseRoute("#//")).not.toThrow();
    expect(parseRoute("#//")).toEqual({ view: "gallery" });
  });

  it("a well-formed unknown slug still parses as an exhibit (existence is the shell's call)", () => {
    expect(parseRoute("#/does-not-exist")).toEqual({ view: "exhibit", slug: "does-not-exist" });
  });
});

describe("routeToHash (inverse)", () => {
  const cases: ViewerRoute[] = [
    { view: "gallery" },
    { view: "exhibit", slug: "voynich" },
    { view: "exhibit", slug: "voynich", noteId: "n7" },
    { view: "exhibit", slug: "voynich", noteId: "n7", xywh: "10,20,30,40" },
  ];
  it("round-trips: parseRoute(routeToHash(r)) === r", () => {
    for (const r of cases) expect(parseRoute(routeToHash(r))).toEqual(r);
  });
  it("gallery serializes to #/", () => {
    expect(routeToHash({ view: "gallery" })).toBe("#/");
  });
});
