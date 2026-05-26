import { describe, it, expect } from "vitest";
import { appendNew, appendEdit, append } from "./log.js";
import { toHeadsPage, toHistory, recordToAnnotation } from "./serialize.js";
import { asClientId, mintRevId } from "../wadm/brand.js";
import { ARCHIE_HAS_HISTORY, PROV_WAS_REVISION_OF, WADM_CONTEXT, type AnnotationRecord, type W3CSpecificResource } from "../wadm/types.js";

// History-sidecar serialization (ADR-0003 / Q-3): heads page (only current versions, with
// the archie:hasHistory + prov:wasRevisionOf link-outs) + per-logicalId history pages +
// index. Versioned citation id = {logicalId}/v{n}; disambiguated on collision (Q-6).

const alice = asClientId("alice");
const bob = asClientId("bob");
const canvas = "https://example.org/canvas/1";
const t = "2026-05-24T10:00:00.000Z";
const base = "https://u.github.io/lib/ex/";
const opts = { baseUrl: base, historyBase: "annotations/history/" };

const rectTarget: W3CSpecificResource = { type: "SpecificResource", source: canvas, selector: { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: "xywh=pixel:10,20,30,40" } };
const polyTarget: W3CSpecificResource = { type: "SpecificResource", source: canvas, selector: { type: "SvgSelector", value: "<svg><polygon points='0,0 10,0 10,10'/></svg>" } };

describe("recordToAnnotation — WADM round-trip for the v1 shape vocab (rect + polygon)", () => {
  it("preserves a rect (FragmentSelector) verbatim through a JSON round-trip", () => {
    const { record } = appendNew([], { target: rectTarget, body: { type: "TextualBody", value: "x" }, lastEditor: alice, modifiedAt: t, now: 1 });
    const ann = recordToAnnotation(record, "id1");
    const round = JSON.parse(JSON.stringify(ann));
    expect(round.target.selector).toEqual(rectTarget.selector);
  });

  it("preserves a polygon (SvgSelector) verbatim through a JSON round-trip", () => {
    const { record } = appendNew([], { target: polyTarget, lastEditor: alice, modifiedAt: t, now: 1 });
    const ann = recordToAnnotation(record, "id2");
    const round = JSON.parse(JSON.stringify(ann));
    expect(round.target.selector).toEqual(polyTarget.selector);
  });
});

describe("toHeadsPage (Q-3)", () => {
  it("emits a valid AnnotationPage with a single, non-mixed @context", () => {
    const { log } = appendNew([], { target: rectTarget, body: { type: "TextualBody", value: "x" }, lastEditor: alice, modifiedAt: t, now: 1 });
    const page = toHeadsPage(log, "https://u.github.io/lib/ex/page", opts);
    expect(page.type).toBe("AnnotationPage");
    expect(page["@context"]).toBe(WADM_CONTEXT);
    expect(page.items).toHaveLength(1);
  });

  it("gives a v1 head the {logicalId}/v1 citation id, a history link, and NO prov:wasRevisionOf", () => {
    const { log, record: v1 } = appendNew([], { target: rectTarget, lastEditor: alice, modifiedAt: t, now: 1 });
    const item = toHeadsPage(log, "page", opts).items[0]!;
    expect(item.id).toBe(`${base}${v1.logicalId}/v1`);
    expect((item as unknown as Record<string, unknown>)[ARCHIE_HAS_HISTORY]).toBe(`annotations/history/${v1.logicalId}.json`);
    expect((item as unknown as Record<string, unknown>)[PROV_WAS_REVISION_OF]).toBeUndefined();
  });

  it("links an edited head's prov:wasRevisionOf to the PARENT's citation id (resolved from rev)", () => {
    const { log: l1, record: v1 } = appendNew([], { target: rectTarget, lastEditor: alice, modifiedAt: t, now: 1 });
    const { log: l2, record: v2 } = appendEdit(l1, v1.logicalId, { body: { type: "TextualBody", value: "v2" }, lastEditor: bob, modifiedAt: t, now: 2 });
    const item = toHeadsPage(l2, "page", opts).items[0]!;
    expect(item.id).toBe(`${base}${v2.logicalId}/v2`);
    expect((item as unknown as Record<string, unknown>)[PROV_WAS_REVISION_OF]).toBe(`${base}${v1.logicalId}/v1`);
  });

  it("shows only HEADS — a pure consumer never sees history versions as live overlays (the interop contract)", () => {
    const { log: l1, record: v1 } = appendNew([], { target: rectTarget, lastEditor: alice, modifiedAt: t, now: 1 });
    const { log: l2 } = appendEdit(l1, v1.logicalId, { body: { type: "TextualBody", value: "v2" }, lastEditor: alice, modifiedAt: t, now: 2 });
    const { log: l3 } = appendEdit(l2, v1.logicalId, { body: { type: "TextualBody", value: "v3" }, lastEditor: alice, modifiedAt: t, now: 3 });
    const page = toHeadsPage(l3, "page", opts);
    expect(page.items).toHaveLength(1); // only v3, not v1/v2
  });

  it("Q-6: plural heads sharing v2 get DISTINCT ids (valid JSON-LD) — bare + ~rev suffix, stable by rev", () => {
    const { log: b, record: v1 } = appendNew([], { target: rectTarget, lastEditor: alice, modifiedAt: t, now: 1 });
    const a: AnnotationRecord = { logicalId: v1.logicalId, rev: mintRevId(0, () => 0.1), version: 2, parent: v1.rev, modifiedAt: t, lastEditor: alice, deleted: false, target: rectTarget };
    const b2: AnnotationRecord = { logicalId: v1.logicalId, rev: mintRevId(0, () => 0.9), version: 2, parent: v1.rev, modifiedAt: t, lastEditor: bob, deleted: false, target: rectTarget };
    const page = toHeadsPage(append(append(b, a), b2), "page", opts);
    const ids = page.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(2); // distinct — no duplicate id in the page
    const lower = a.rev < b2.rev ? a : b2;
    const higher = a.rev < b2.rev ? b2 : a;
    expect(ids).toContain(`${base}${v1.logicalId}/v2`); // lexicographically-first rev keeps the bare id
    expect(ids).toContain(`${base}${v1.logicalId}/v2~${higher.rev}`);
    void lower;
  });
});

describe("toHistory (Q-3)", () => {
  it("emits a per-logicalId page with ALL versions + an index mapping logicalId -> url", () => {
    const { log: l1, record: v1 } = appendNew([], { target: rectTarget, lastEditor: alice, modifiedAt: t, now: 1 });
    const { log: l2 } = appendEdit(l1, v1.logicalId, { body: { type: "TextualBody", value: "v2" }, lastEditor: alice, modifiedAt: t, now: 2 });
    const { index, pages } = toHistory(l2, opts);
    expect(index[v1.logicalId]).toBe(`annotations/history/${v1.logicalId}.json`);
    const page = pages[v1.logicalId]!;
    expect(page.type).toBe("AnnotationPage");
    expect(page.items).toHaveLength(2); // full chain v1 + v2
    expect(page.items.map((i) => i.id)).toEqual([`${base}${v1.logicalId}/v1`, `${base}${v1.logicalId}/v2`]);
  });

  it("history versions carry prov:wasRevisionOf back-links (citation-dereference chain)", () => {
    const { log: l1, record: v1 } = appendNew([], { target: rectTarget, lastEditor: alice, modifiedAt: t, now: 1 });
    const { log: l2 } = appendEdit(l1, v1.logicalId, { lastEditor: alice, modifiedAt: t, now: 2 });
    const page = toHistory(l2, opts).pages[v1.logicalId]!;
    const [h1, h2] = page.items as unknown as Array<Record<string, unknown>>;
    expect(h1![PROV_WAS_REVISION_OF]).toBeUndefined(); // v1 has no parent
    expect(h2![PROV_WAS_REVISION_OF]).toBe(`${base}${v1.logicalId}/v1`);
  });
});
