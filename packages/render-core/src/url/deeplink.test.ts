import { describe, it, expect } from "vitest";
import {
  encodeContentState,
  decodeContentState,
  parseMediaFragmentHead,
  detectLegacyAnnotationParam,
  buildNoteDeepLink,
  parseNoteDeepLink,
} from "./deeplink.js";

// URL <-> selector serialization (spike-0001 module 4, CLEAN-LIFT from anvil share-url.ts).
// Only the PURE parts lift into @render/core; buildShareUrl/copyToClipboard touch
// window/document and stay in the adapter (Phase 1). Plus Archie's #/a/<id> deep-link (Q8).

describe("IIIF Content State (round-trip, anvil share-url.ts)", () => {
  it("encodes then decodes an annotation reference losslessly", () => {
    const enc = encodeContentState("urn:archie:note:abc", "https://ex.org/canvas/1", { type: "FragmentSelector", value: "xywh=pixel:10,20,30,40" });
    expect(enc).not.toContain("=");   // base64url: no padding
    expect(enc).not.toContain("+");
    expect(enc).not.toContain("/");
    const dec = decodeContentState(enc);
    expect(dec).not.toBeNull();
    expect(dec!.annotationId).toBe("urn:archie:note:abc");
    expect(dec!.selector).toEqual({ type: "FragmentSelector", value: "xywh=pixel:10,20,30,40" });
  });

  it("returns null for malformed Content State", () => {
    expect(decodeContentState("not-valid-base64url!!!")).toBeNull();
    expect(decodeContentState("")).toBeNull();
  });

  it("carries the referenced resource IRI (target.source) — the field consumers used to re-decode for", () => {
    const enc = encodeContentState("urn:archie:note:abc", "https://ex.org/canvas/1", { type: "FragmentSelector", value: "xywh=pixel:10,20,30,40" });
    const dec = decodeContentState(enc);
    expect(dec).not.toBeNull();
    expect(dec!.source).toBe("https://ex.org/canvas/1");
    expect(dec!.id).toBe("https://ex.org/canvas/1#xywh=pixel:10,20,30,40"); // the authored target.id, tail intact
  });

  it("falls back to target.id (fragment-stripped) for a bare-IRI target with no source", () => {
    const cs = {
      "@context": "http://iiif.io/api/presentation/3/context.json",
      id: "anno",
      type: "Annotation",
      motivation: "highlighting",
      target: { id: "https://ex.org/canvas/1#xywh=pixel:1,2,3,4", type: "SpecificResource", selector: { type: "FragmentSelector" } },
    };
    const enc = btoa(encodeURIComponent(JSON.stringify(cs))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const dec = decodeContentState(enc);
    expect(dec).not.toBeNull();
    expect(dec!.source).toBe("https://ex.org/canvas/1"); // the `#xywh=…` tail stripped from the match key
    expect(dec!.id).toBe("https://ex.org/canvas/1#xywh=pixel:1,2,3,4"); // but kept on `id` for the tail's fragment
  });

  it("returns null when the Content State has no usable target IRI", () => {
    const cs = {
      "@context": "http://iiif.io/api/presentation/3/context.json",
      id: "anno",
      type: "Annotation",
      motivation: "highlighting",
      target: { type: "SpecificResource", selector: { type: "FragmentSelector", value: "xywh=1,2,3,4" } },
    };
    const enc = btoa(encodeURIComponent(JSON.stringify(cs))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodeContentState(enc)).toBeNull();
  });

  it("detects legacy ?annotation=urn: params for redirect", () => {
    expect(detectLegacyAnnotationParam("?annotation=urn:archie:note:x&image=y")).toBe("urn:archie:note:x");
    expect(detectLegacyAnnotationParam("?image=y")).toBeNull();
  });
});

describe("parseMediaFragmentHead — the ONE fragment-head parser (xywh=/t= strip)", () => {
  it("splits an xywh= value (unit prefix rides through unchanged)", () => {
    expect(parseMediaFragmentHead("xywh=pixel:10,20,30,40")).toEqual({ kind: "xywh", value: "pixel:10,20,30,40" });
  });
  it("splits a t= value (offset/range rides through unchanged)", () => {
    expect(parseMediaFragmentHead("t=12.5,30")).toEqual({ kind: "t", value: "12.5,30" });
    expect(parseMediaFragmentHead("t=7")).toEqual({ kind: "t", value: "7" });
  });
  it("bare / unknown / absent → undefined (whole-resource)", () => {
    expect(parseMediaFragmentHead(undefined)).toBeUndefined();
    expect(parseMediaFragmentHead("")).toBeUndefined();
    expect(parseMediaFragmentHead("pixel:10,20,30,40")).toBeUndefined();
    expect(parseMediaFragmentHead("#xywh=1,2,3,4")).toBeUndefined(); // a raw IRI tail is not a fragment value
  });
});

describe("Archie note deep-link #/a/<id> (Q8 nav contract)", () => {
  it("builds a bare note deep-link", () => {
    expect(buildNoteDeepLink("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe("#/a/01ARZ3NDEKTSV4RRFFQ69G5FAV");
  });
  it("builds a deep-link with an xywh region hint", () => {
    expect(buildNoteDeepLink("01ARZ3NDEKTSV4RRFFQ69G5FAV", { xywh: "10,20,30,40" })).toBe("#/a/01ARZ3NDEKTSV4RRFFQ69G5FAV?xywh=10,20,30,40");
  });
  it("parses a deep-link back to its parts", () => {
    expect(parseNoteDeepLink("#/a/01ARZ3NDEKTSV4RRFFQ69G5FAV")).toEqual({ logicalId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" });
    expect(parseNoteDeepLink("#/a/01ARZ3NDEKTSV4RRFFQ69G5FAV?xywh=10,20,30,40")).toEqual({ logicalId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", xywh: "10,20,30,40" });
  });
  it("returns null for non-note hashes", () => {
    expect(parseNoteDeepLink("#/exhibit/foo")).toBeNull();
    expect(parseNoteDeepLink("")).toBeNull();
  });
});
