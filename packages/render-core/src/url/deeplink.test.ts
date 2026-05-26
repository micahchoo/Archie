import { describe, it, expect } from "vitest";
import {
  encodeContentState,
  decodeContentState,
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

  it("detects legacy ?annotation=urn: params for redirect", () => {
    expect(detectLegacyAnnotationParam("?annotation=urn:archie:note:x&image=y")).toBe("urn:archie:note:x");
    expect(detectLegacyAnnotationParam("?image=y")).toBeNull();
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
