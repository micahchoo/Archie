import { describe, it, expect } from "vitest";
import {
  WADM_CONTEXT,
  ARCHIE_HAS_HISTORY,
  PROV_WAS_REVISION_OF,
  type W3CAnnotation,
  type ArchieAnnotation,
  type AnnotationRecord,
  type W3CAnnotationPage,
} from "./types.js";
import { mintLogicalId, mintRevId, asClientId } from "./brand.js";

// WADM structural types (Q-3 serialization row): AnnotationPage-not-array,
// pixel: normalization, SpecificResource wrap, @context never mixed.

describe("WADM constants (Q-3)", () => {
  it("pins the canonical WADM @context IRI", () => {
    expect(WADM_CONTEXT).toBe("http://www.w3.org/ns/anno.jsonld");
  });
  it("pins the archie/prov extension keys (the head link-outs)", () => {
    expect(ARCHIE_HAS_HISTORY).toBe("archie:hasHistory");
    expect(PROV_WAS_REVISION_OF).toBe("prov:wasRevisionOf");
  });
});

describe("WADM structural shapes compile and serialize as expected", () => {
  it("builds a rect (FragmentSelector) annotation with SpecificResource target", () => {
    const ann: W3CAnnotation = {
      "@context": WADM_CONTEXT,
      id: "https://example.org/anno/1",
      type: "Annotation",
      motivation: "commenting",
      body: { type: "TextualBody", value: "a note", format: "text/plain" },
      target: {
        type: "SpecificResource",
        source: "https://example.org/canvas/1",
        selector: { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: "xywh=pixel:10,20,30,40" },
      },
    };
    expect(JSON.parse(JSON.stringify(ann)).target.selector.value).toBe("xywh=pixel:10,20,30,40");
  });

  it("builds a polygon (SvgSelector) annotation — the second v1 shape", () => {
    const ann: W3CAnnotation = {
      id: "https://example.org/anno/2",
      type: "Annotation",
      target: {
        type: "SpecificResource",
        source: "https://example.org/canvas/1",
        selector: { type: "SvgSelector", value: "<svg><polygon points='0,0 10,0 10,10'/></svg>" },
      },
    };
    expect((ann.target as { selector: { type: string } }).selector.type).toBe("SvgSelector");
  });

  it("an ArchieAnnotation is a W3CAnnotation plus the two ignorable link-outs", () => {
    const head: ArchieAnnotation = {
      id: "https://example.org/anno/3/v2",
      type: "Annotation",
      target: "https://example.org/canvas/1",
      [ARCHIE_HAS_HISTORY]: "annotations/history/abc.json",
      [PROV_WAS_REVISION_OF]: "abc/v1",
    };
    // A pure WADM consumer assigns it to the base type and never reads the extensions.
    const asBase: W3CAnnotation = head;
    expect(asBase.id).toBe("https://example.org/anno/3/v2");
    expect(head[ARCHIE_HAS_HISTORY]).toBe("annotations/history/abc.json");
  });

  it("builds an AnnotationRecord whose parent points to a rev (the DAG node id), not a version id", () => {
    const lid = mintLogicalId();
    const parentRev = mintRevId();
    const rec: AnnotationRecord = {
      logicalId: lid,
      rev: mintRevId(),
      version: 2,
      parent: parentRev,
      modifiedAt: "2026-05-24T12:00:00.000Z",
      lastEditor: asClientId("alice"),
      deleted: false,
      body: { type: "TextualBody", value: "edited" },
      target: "https://example.org/canvas/1",
    };
    expect(rec.version).toBe(2);
    expect(rec.parent).toBe(parentRev); // a RevId, not `${lid}/v1` (ADR-0003 Refinement)
    expect(rec.rev).not.toBe(rec.parent);
  });

  it("a v1 record has a null parent (DAG root)", () => {
    const lid = mintLogicalId();
    const rec: AnnotationRecord = {
      logicalId: lid,
      rev: mintRevId(),
      version: 1,
      parent: null,
      modifiedAt: "2026-05-24T12:00:00.000Z",
      lastEditor: asClientId("alice"),
      deleted: false,
      // body omitted — a bodyless region marker is valid (exactOptionalPropertyTypes)
      target: "https://example.org/canvas/1",
    };
    expect(rec.parent).toBeNull();
    expect(rec.body).toBeUndefined();
  });

  it("an AnnotationPage holds items (not a bare array) — Q-3 serialization", () => {
    const page: W3CAnnotationPage = {
      "@context": WADM_CONTEXT,
      id: "https://example.org/canvas/1/annotations",
      type: "AnnotationPage",
      items: [],
    };
    expect(page.type).toBe("AnnotationPage");
    expect(Array.isArray(page.items)).toBe(true);
  });
});
