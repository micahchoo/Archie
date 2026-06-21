import { describe, it, expect } from "vitest";
import {
  encodeLinkRef,
  parseLinkRef,
  resolveLink,
  resolveViewerLink,
  validateLink,
  buildLinkIndex,
  citedExhibitSlug,
  classifyCite,
  type LinkTarget,
} from "./link.js";
import { parseRoute, routeToHash } from "../url/route.js";
import { appendNew } from "../spine/log.js";
import { asClientId } from "../wadm/brand.js";

// The cite ladder gains an Object rung (ADR-0018 / amends Q-1): cite a whole Object directly via
// objectId + the `#/{slug}/o/<id>` route — distinct from citing a note ON it.
const obj: LinkTarget = { exhibitSlug: "voynich", objectId: "f1r" };

describe("Object cite route grammar (route.ts)", () => {
  it("parses `#/<slug>/o/<objectId>`", () => {
    expect(parseRoute("#/voynich/o/f1r")).toEqual({ view: "exhibit", slug: "voynich", objectId: "f1r" });
  });
  it("round-trips through routeToHash", () => {
    const r = { view: "exhibit" as const, slug: "voynich", objectId: "f1r" };
    expect(parseRoute(routeToHash(r))).toEqual(r);
  });
  it("does not confuse `/o/` with the `/a/` note tail", () => {
    expect(parseRoute("#/voynich/a/n1").objectId).toBeUndefined();
    expect(parseRoute("#/voynich/o/f1r").noteId).toBeUndefined();
  });
});

describe("Object cite in-body archie: ref (link.ts)", () => {
  it("encodes to `archie:<slug>/#/o/<id>`", () => {
    expect(encodeLinkRef(obj)).toBe("archie:voynich/#/o/f1r");
  });
  it("parses back losslessly", () => {
    expect(parseLinkRef("archie:voynich/#/o/f1r")).toEqual(obj);
  });
  it("rejects an empty object id", () => {
    expect(parseLinkRef("archie:voynich/#/o/")).toBeNull();
  });
  it("encode→parse round-trips", () => {
    expect(parseLinkRef(encodeLinkRef(obj))).toEqual(obj);
  });
});

describe("Object cite resolution", () => {
  it("resolveLink projects to the published display URL", () => {
    expect(resolveLink(obj, { baseUrl: "https://x.org/lib/" })).toBe("https://x.org/lib/voynich/#/o/f1r");
  });
  it("resolveViewerLink routes via the single-shell route grammar", () => {
    expect(resolveViewerLink(obj, { viewerBase: "https://v.org/viewer/" })).toBe("https://v.org/viewer/#/voynich/o/f1r");
  });
  it("resolveViewerLink degrades to the static per-object anchor (no viewer)", () => {
    expect(resolveViewerLink(obj, { dataBase: "/lib/" })).toBe("/lib/voynich/index.html#object-f1r");
  });
});

describe("Object cite validation + card guard", () => {
  it("validates against exhibit presence in the index (like a range/exhibit ref)", () => {
    const { log } = appendNew([], { target: "https://x/voynich/canvas/f1r", lastEditor: asClientId("a") });
    const index = buildLinkIndex({ voynich: log });
    expect(validateLink(obj, index)).toBe(true);
    expect(validateLink({ exhibitSlug: "missing", objectId: "x" }, index)).toBe(false);
  });
  it("an object cite is NOT promoted to a bare-exhibit card", () => {
    const known = new Set(["voynich"]);
    expect(citedExhibitSlug("https://v/#/voynich/o/f1r", known)).toBeNull(); // object → its own card (Phase 4)
    expect(citedExhibitSlug("https://v/#/voynich", known)).toBe("voynich"); // bare exhibit → exhibit card
  });
});

describe("classifyCite (type-driven rendering — Phase 4)", () => {
  const known = new Set(["voynich", "bidar"]);
  it("classifies the SPA route forms across the ladder", () => {
    expect(classifyCite("https://v/#/voynich", known)).toEqual({ kind: "exhibit", slug: "voynich" });
    expect(classifyCite("https://v/#/voynich/o/f1r", known)).toEqual({ kind: "object", slug: "voynich", objectId: "f1r" });
    expect(classifyCite("https://v/#/voynich/a/n3", known)).toEqual({ kind: "note", slug: "voynich", noteId: "n3" });
    expect(classifyCite("https://v/#/voynich/a/n3?xywh=pixel:0,0,10,10", known)).toEqual({ kind: "region", slug: "voynich", noteId: "n3", xywh: "pixel:0,0,10,10" });
  });
  it("classifies the static-archival fallback forms", () => {
    expect(classifyCite("https://h/lib/bidar/index.html", known)).toEqual({ kind: "exhibit", slug: "bidar" });
    expect(classifyCite("https://h/lib/bidar/index.html#note-n3", known)).toEqual({ kind: "note", slug: "bidar", noteId: "n3" });
    expect(classifyCite("https://h/lib/bidar/index.html#object-f1r", known)).toEqual({ kind: "object", slug: "bidar", objectId: "f1r" });
  });
  it("an unknown slug or external link is external (→ plain link)", () => {
    expect(classifyCite("https://v/#/unknown", known)).toEqual({ kind: "external" });
    expect(classifyCite("https://example.org/x", known)).toEqual({ kind: "external" });
    expect(classifyCite("", known)).toEqual({ kind: "external" });
  });
});
