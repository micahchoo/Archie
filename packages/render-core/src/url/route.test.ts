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

  it("#/<slug>/o/<objectId> → exhibit landing on a whole Object", () => {
    expect(parseRoute("#/voynich/o/obj-2")).toEqual({ view: "exhibit", slug: "voynich", objectId: "obj-2" });
  });

  it("#/<slug>/s/<sectionId> → exhibit landing on a Section (ADR-0021 cite ladder)", () => {
    expect(parseRoute("#/voynich/s/sec-3")).toEqual({ view: "exhibit", slug: "voynich", sectionId: "sec-3" });
  });

  it("empty section id degrades to plain exhibit, never throws", () => {
    expect(parseRoute("#/voynich/s/")).toEqual({ view: "exhibit", slug: "voynich" });
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

  it("carries ?t time fragment alongside a note (mirrors xywh)", () => {
    expect(parseRoute("#/voynich/a/n7?t=10,20")).toEqual({
      view: "exhibit", slug: "voynich", noteId: "n7", t: "10,20",
    });
  });

  it("carries ?t and ?xywh together on a note", () => {
    expect(parseRoute("#/voynich/a/n7?xywh=1,2,3,4&t=10,20")).toEqual({
      view: "exhibit", slug: "voynich", noteId: "n7", xywh: "1,2,3,4", t: "10,20",
    });
  });

  it("ignores t without a note (it is meaningless there, like xywh)", () => {
    expect(parseRoute("#/voynich?t=10,20")).toEqual({ view: "exhibit", slug: "voynich" });
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
    { view: "exhibit", slug: "voynich", noteId: "n7", t: "10,20" },
    { view: "exhibit", slug: "voynich", noteId: "n7", xywh: "10,20,30,40", t: "10,20" },
    { view: "exhibit", slug: "voynich", objectId: "obj-2" },
    { view: "exhibit", slug: "voynich", sectionId: "sec-3" },
  ];
  it("round-trips: parseRoute(routeToHash(r)) === r", () => {
    for (const r of cases) expect(parseRoute(routeToHash(r))).toEqual(r);
  });
  it("gallery serializes to #/", () => {
    expect(routeToHash({ view: "gallery" })).toBe("#/");
  });
});

describe("?src= hosted-zip pointer (ADR-0009) — composes with any route", () => {
  it("#/?src=<url> → gallery + src", () => {
    expect(parseRoute("#/?src=https://h/x.zip")).toEqual({ view: "gallery", src: "https://h/x.zip" });
  });

  it("#/<slug>?src=<url> → exhibit + src", () => {
    expect(parseRoute("#/voynich?src=https://h/x.zip")).toEqual({ view: "exhibit", slug: "voynich", src: "https://h/x.zip" });
  });

  it("composes with a deep-link: #/<slug>/a/<note>?src=<url> opens AND lands on the note", () => {
    expect(parseRoute("#/voynich/a/n7?src=https://h/x.zip")).toEqual({
      view: "exhibit", slug: "voynich", noteId: "n7", src: "https://h/x.zip",
    });
  });

  it("coexists with ?xywh in the same query", () => {
    expect(parseRoute("#/voynich/a/n7?xywh=1,2,3,4&src=https://h/x.zip")).toEqual({
      view: "exhibit", slug: "voynich", noteId: "n7", xywh: "1,2,3,4", src: "https://h/x.zip",
    });
  });

  it("a routeless src is absent → no src key (existing equalities hold)", () => {
    expect(parseRoute("#/voynich")).toEqual({ view: "exhibit", slug: "voynich" });
    expect(parseRoute("#/")).toEqual({ view: "gallery" });
  });

  it("round-trips a src whose own url carries :/?& (percent-encoded, then decoded back)", () => {
    const tricky = "https://host.example/path/lib.archie.zip?v=2&t=a/b";
    for (const r of [
      { view: "gallery" as const, src: tricky },
      { view: "exhibit" as const, slug: "voynich", src: tricky },
      { view: "exhibit" as const, slug: "voynich", noteId: "n7", xywh: "1,2,3,4", src: tricky },
    ]) {
      expect(parseRoute(routeToHash(r))).toEqual(r);
    }
  });
});
