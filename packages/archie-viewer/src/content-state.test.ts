// content-state.ts — IIIF Content State interop, the PURE decode → internal-target mapping (ADR-0021
// deferred-additive). Headless-testable in full: the donor codec (render-core deeplink.ts
// encodeContentState) BUILDS the fixtures, so the round-trip is exercised against the real format.
//
// Contract points the brief names:
//   • a Content State referencing a known canvas (+xywh) resolves to the right object + region
//   • a foreign / unknown Content State degrades upward (→ null ⇒ gallery)
//   • a malformed / garbage iiif-content is rejected gracefully (→ null, no throw)
import { describe, it, expect } from "vitest";
import { encodeContentState, type PortableExhibit, type ExhibitsJson, type SelectorRef } from "@render/core";
import {
  parseContentStateTarget,
  matchContentStateInExhibit,
  contentStateMatchToRoute,
  resolveContentState,
} from "./content-state.js";

// --- fixtures: a 2-exhibit gallery; exhibit "voynich" owns canvas IRIs under a published base ----------
const BASE = "https://u.gh.io/lib/";
const CANVAS_IMG = `${BASE}voynich/canvas/obj-img`;
const CANVAS_AV = `${BASE}voynich/canvas/obj-av`;
const MANIFEST = `${BASE}voynich/manifest.json`;

function exhibit(): PortableExhibit {
  return {
    slug: "voynich",
    title: "Voynich",
    objects: [
      { id: "obj-img", source: "blob:img", label: "Folio 1" },
      { id: "obj-av", source: "blob:audio", label: "Reading", mediaType: "sound", duration: 60 },
    ],
    annotationsByObject: { "obj-img": [], "obj-av": [] },
    readingAnnotationsByObject: { "obj-img": {}, "obj-av": {} },
    readings: [],
    sections: [],
    canvasIdByObject: { "obj-img": CANVAS_IMG, "obj-av": CANVAS_AV },
  } as unknown as PortableExhibit;
}

function gallery(): ExhibitsJson {
  return {
    library: { id: "L", title: "Lib" },
    exhibits: [
      { slug: "voynich", title: "Voynich", order: 0 },
      { slug: "other", title: "Other", order: 1 },
    ],
    presentation: {},
  } as unknown as ExhibitsJson;
}

/** Encode a Content State via the DONOR codec (deeplink.ts) — real format, not a hand-rolled blob. */
function cs(annotationId: string, canvasId: string, selector: SelectorRef): string {
  return encodeContentState(annotationId, canvasId, selector);
}

// =====================================================================================================
describe("parseContentStateTarget — decode + structural recovery (the donor gate + the IRI it drops)", () => {
  it("recovers the Canvas IRI (target.source) and an xywh fragment from the selector", () => {
    const enc = cs("anno-1", CANVAS_IMG, { type: "FragmentSelector", value: "xywh=pixel:10,20,30,40" });
    expect(parseContentStateTarget(enc)).toEqual({
      resourceIri: CANVAS_IMG,
      fragment: { kind: "xywh", value: "pixel:10,20,30,40" },
    });
  });

  it("recovers a temporal (t=) fragment", () => {
    const enc = cs("anno-2", CANVAS_AV, { type: "FragmentSelector", value: "t=12.5,30" });
    expect(parseContentStateTarget(enc)).toEqual({
      resourceIri: CANVAS_AV,
      fragment: { kind: "t", value: "12.5,30" },
    });
  });

  it("a selector with no value (point/svg) → resource IRI, no fragment (whole object)", () => {
    const enc = cs("anno-3", CANVAS_IMG, { type: "SvgSelector" });
    expect(parseContentStateTarget(enc)).toEqual({ resourceIri: CANVAS_IMG });
  });

  it("a Manifest-IRI Content State recovers the manifest IRI (no object yet)", () => {
    // No fragment selector type still gates as a string; use a bare FragmentSelector with no value.
    const enc = cs("anno-4", MANIFEST, { type: "FragmentSelector" });
    expect(parseContentStateTarget(enc)).toEqual({ resourceIri: MANIFEST });
  });

  it("rejects garbage (not base64 / not an Annotation) gracefully → null, no throw", () => {
    expect(parseContentStateTarget("@@@not-base64@@@")).toBeNull();
    expect(parseContentStateTarget("")).toBeNull();
    // valid base64url of a NON-annotation JSON → the donor gate rejects it
    const notAnno = btoa(encodeURIComponent(JSON.stringify({ type: "Manifest" }))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(parseContentStateTarget(notAnno)).toBeNull();
  });

  it("rejects a non-string input gracefully (defensive — attribute could be coerced)", () => {
    expect(parseContentStateTarget(undefined as unknown as string)).toBeNull();
  });
});

// =====================================================================================================
describe("matchContentStateInExhibit — Canvas IRI → object, Manifest IRI → slug", () => {
  it("an exact Canvas-IRI hit resolves to that object", () => {
    expect(matchContentStateInExhibit(exhibit(), CANVAS_IMG)).toEqual({ slug: "voynich", objectId: "obj-img" });
    expect(matchContentStateInExhibit(exhibit(), CANVAS_AV)).toEqual({ slug: "voynich", objectId: "obj-av" });
  });

  it("a Manifest IRI (shares the {base}{slug}/ prefix) resolves to the slug, no object", () => {
    expect(matchContentStateInExhibit(exhibit(), MANIFEST)).toEqual({ slug: "voynich" });
  });

  it("a foreign IRI (different base/slug) does NOT match this exhibit → null", () => {
    expect(matchContentStateInExhibit(exhibit(), "https://elsewhere.org/iiif/x/canvas/z")).toBeNull();
  });
});

// =====================================================================================================
describe("contentStateMatchToRoute — match → internal ViewerRoute (feeds resolveExhibitTarget)", () => {
  it("an object hit + xywh becomes an /o/<id> route carrying ?xywh", () => {
    expect(contentStateMatchToRoute({ slug: "voynich", objectId: "obj-img" }, { kind: "xywh", value: "pixel:1,2,3,4" }))
      .toEqual({ view: "exhibit", slug: "voynich", objectId: "obj-img", xywh: "pixel:1,2,3,4" });
  });
  it("an object hit + t becomes an /o/<id> route carrying ?t", () => {
    expect(contentStateMatchToRoute({ slug: "voynich", objectId: "obj-av" }, { kind: "t", value: "5,10" }))
      .toEqual({ view: "exhibit", slug: "voynich", objectId: "obj-av", t: "5,10" });
  });
  it("an object hit with no fragment is a bare /o/<id> route", () => {
    expect(contentStateMatchToRoute({ slug: "voynich", objectId: "obj-img" }))
      .toEqual({ view: "exhibit", slug: "voynich", objectId: "obj-img" });
  });
  it("a slug-only hit is a bare exhibit route", () => {
    expect(contentStateMatchToRoute({ slug: "voynich" })).toEqual({ view: "exhibit", slug: "voynich" });
  });
});

// =====================================================================================================
describe("resolveContentState — the full pipeline with degrade-upward (ADR-0021)", () => {
  const loader = (slug: string): Promise<PortableExhibit | null> =>
    Promise.resolve(slug === "voynich" ? exhibit() : null);

  it("a Content State referencing a known canvas (+xywh) resolves to the right object + region", async () => {
    const enc = cs("anno-1", CANVAS_IMG, { type: "FragmentSelector", value: "xywh=pixel:10,20,30,40" });
    expect(await resolveContentState(enc, gallery(), loader)).toEqual({
      view: "exhibit", slug: "voynich", objectId: "obj-img", xywh: "pixel:10,20,30,40",
    });
  });

  it("a Manifest-only Content State resolves to the exhibit (slug, no object)", async () => {
    const enc = cs("anno-4", MANIFEST, { type: "FragmentSelector" });
    expect(await resolveContentState(enc, gallery(), loader)).toEqual({ view: "exhibit", slug: "voynich" });
  });

  it("a FOREIGN Content State (no loaded exhibit owns the IRI) degrades upward → null (gallery)", async () => {
    const enc = cs("anno-x", "https://elsewhere.org/iiif/x/canvas/z", { type: "FragmentSelector", value: "xywh=pixel:0,0,1,1" });
    expect(await resolveContentState(enc, gallery(), loader)).toBeNull();
  });

  it("a MALFORMED iiif-content is rejected gracefully → null (gallery), no throw", async () => {
    expect(await resolveContentState("@@@garbage@@@", gallery(), loader)).toBeNull();
  });

  it("an exhibit that fails to load doesn't sink the resolve — a later exhibit still matches", async () => {
    const enc = cs("anno-1", CANVAS_IMG, { type: "FragmentSelector", value: "xywh=pixel:1,1,1,1" });
    const flaky = (slug: string): Promise<PortableExhibit | null> => {
      if (slug === "other") return Promise.reject(new Error("boom"));
      return Promise.resolve(slug === "voynich" ? exhibit() : null);
    };
    // gallery order puts voynich first, so add a gallery that tries "other" first to exercise the catch
    const g = { ...gallery(), exhibits: [{ slug: "other", title: "Other", order: 0 }, { slug: "voynich", title: "Voynich", order: 1 }] } as unknown as ExhibitsJson;
    expect(await resolveContentState(enc, g, flaky)).toEqual({ view: "exhibit", slug: "voynich", objectId: "obj-img", xywh: "pixel:1,1,1,1" });
  });
});
