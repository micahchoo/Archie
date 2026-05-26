import { describe, it, expect } from "vitest";
import { appendNew, appendEdit, appendDelete, append } from "./log.js";
import { toHeadsPage, toHistory } from "./serialize.js";
import { asClientId, mintRevId } from "../wadm/brand.js";
import type { W3CAnnotation, W3CAnnotationPage, AnnotationRecord } from "../wadm/types.js";

// ════════════════════════════════════════════════════════════════════════════════════
// THE GATE (strategy line 18; ADR-0003 three-tier interop contract).
//
// A PURE WADM consumer (Mirador / Universal Viewer) loads the canvas AnnotationPage and
// renders its items. It does NOT understand archie:hasHistory, so it NEVER follows that
// link to load the history sidecar; it reads only stock WADM fields. The contract: such a
// consumer sees the CURRENT state — exactly the head version(s) per note — and NEVER sees
// historical versions stacked as live overlays. Until this passes, the contract is
// hypothetical. This is the Phase-0 unit-test surrogate for a real third-party-viewer test.
// ════════════════════════════════════════════════════════════════════════════════════

const alice = asClientId("alice");
const bob = asClientId("bob");
const canvas = "https://example.org/canvas/1";
const t = "2026-05-24T10:00:00.000Z";
const base = "https://u.github.io/lib/ex/";
const opts = { baseUrl: base };

/** Stock WADM keys a pure consumer understands. Everything else (archie:/prov:) is invisible to it. */
const WADM_KEYS = new Set(["@context", "id", "type", "motivation", "body", "target", "created", "modified", "creator"]);

/**
 * Simulate a pure WADM consumer: render the page's items, seeing ONLY stock WADM fields.
 * It cannot follow archie:hasHistory (doesn't know the key), so the history sidecar is
 * never loaded — only the heads page reaches it.
 */
function pureWadmConsumer(headsPage: W3CAnnotationPage): Array<Record<string, unknown>> {
  return headsPage.items.map((item) => {
    const rendered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(item)) {
      if (WADM_KEYS.has(k)) rendered[k] = v;
    }
    return rendered;
  });
}

function note(target = canvas) {
  return { type: "SpecificResource" as const, source: target, selector: { type: "FragmentSelector" as const, value: "xywh=pixel:0,0,10,10" } };
}

describe("THE GATE — pure-WADM-consumer interop (ADR-0003)", () => {
  it("renders exactly one overlay per note (the head) — history versions do NOT leak", () => {
    // Note A edited twice (v1->v2->v3); note B created once. History exists for A.
    const { log: a1, record: aV1 } = appendNew([], { target: note(), body: { type: "TextualBody", value: "A v1" }, lastEditor: alice, modifiedAt: t, now: 1 });
    const { log: a2 } = appendEdit(a1, aV1.logicalId, { body: { type: "TextualBody", value: "A v2" }, lastEditor: alice, modifiedAt: t, now: 2 });
    const { log: a3 } = appendEdit(a2, aV1.logicalId, { body: { type: "TextualBody", value: "A v3" }, lastEditor: alice, modifiedAt: t, now: 3 });
    const { log, record: bV1 } = appendNew(a3, { target: note(), body: { type: "TextualBody", value: "B v1" }, lastEditor: bob, modifiedAt: t, now: 4 });

    const headsPage = toHeadsPage(log, `${base}page`, opts);
    const history = toHistory(log, opts);

    // Ground truth: A's history sidecar holds all 3 versions; B's holds 1.
    expect(history.pages[aV1.logicalId]!.items).toHaveLength(3);
    expect(history.pages[bV1.logicalId]!.items).toHaveLength(1);

    const rendered = pureWadmConsumer(headsPage);

    // 1. One overlay per note — NOT one per version.
    expect(rendered).toHaveLength(2);

    // 2. The rendered ids are the HEADS only: A/v3 and B/v1.
    const ids = rendered.map((r) => r.id);
    expect(new Set(ids)).toEqual(new Set([`${base}${aV1.logicalId}/v3`, `${base}${bV1.logicalId}/v1`]));

    // 3. ZERO history leak: A's v1 and v2 are NOT among the live overlays.
    expect(ids).not.toContain(`${base}${aV1.logicalId}/v1`);
    expect(ids).not.toContain(`${base}${aV1.logicalId}/v2`);
  });

  it("the rendered overlays are valid stock WADM and carry NO archie:/prov: extension keys", () => {
    const { log: l1, record: v1 } = appendNew([], { target: note(), body: { type: "TextualBody", value: "x" }, lastEditor: alice, modifiedAt: t, now: 1 });
    const { log } = appendEdit(l1, v1.logicalId, { body: { type: "TextualBody", value: "y" }, lastEditor: alice, modifiedAt: t, now: 2 });
    const rendered = pureWadmConsumer(toHeadsPage(log, `${base}page`, opts));
    for (const r of rendered) {
      expect(r.type).toBe("Annotation");
      expect(r.id).toBeDefined();
      expect(r.target).toBeDefined();
      expect(r["archie:hasHistory"]).toBeUndefined(); // invisible to a pure consumer
      expect(r["prov:wasRevisionOf"]).toBeUndefined();
    }
  });

  it("unresolved concurrent merge = plural heads BOTH shown (honest degradation, not a leak)", () => {
    // The one case where a pure consumer sees >1 overlay for a single note: both competing
    // current versions. This is the ADR's "honest degradation" — still NO history leak.
    const { log: b, record: v1 } = appendNew([], { target: note(), body: { type: "TextualBody", value: "v1" }, lastEditor: alice, modifiedAt: t, now: 1 });
    const cA: AnnotationRecord = { logicalId: v1.logicalId, rev: mintRevId(0, () => 0.2), version: 2, parent: v1.rev, modifiedAt: t, lastEditor: alice, deleted: false, target: note(), body: { type: "TextualBody", value: "Alice" } };
    const cB: AnnotationRecord = { logicalId: v1.logicalId, rev: mintRevId(0, () => 0.8), version: 2, parent: v1.rev, modifiedAt: t, lastEditor: bob, deleted: false, target: note(), body: { type: "TextualBody", value: "Bob" } };
    const log = append(append(b, cA), cB);

    const rendered = pureWadmConsumer(toHeadsPage(log, `${base}page`, opts));
    expect(rendered).toHaveLength(2); // both heads (honest degradation)
    // Both are version-2 competing heads; v1 (the ancestor) does NOT appear as an overlay.
    const ids = rendered.map((r) => String(r.id));
    expect(ids.every((id) => id.includes(`${v1.logicalId}/v2`))).toBe(true);
    expect(ids).not.toContain(`${base}${v1.logicalId}/v1`);
    expect(new Set(ids).size).toBe(2); // distinct ids — valid JSON-LD (Q-6 disambiguation)
  });

  it("a deleted note disappears entirely from the pure consumer's view", () => {
    const { log: l1, record: v1 } = appendNew([], { target: note(), body: { type: "TextualBody", value: "x" }, lastEditor: alice, modifiedAt: t, now: 1 });
    const { log: l2, record: keep } = appendNew(l1, { target: note(), body: { type: "TextualBody", value: "keep" }, lastEditor: alice, modifiedAt: t, now: 2 });
    // delete the first note (tombstone) — a pure consumer must not render it
    const { log } = appendDelete(l2, v1.logicalId, { lastEditor: alice, modifiedAt: t, now: 3 });
    const rendered = pureWadmConsumer(toHeadsPage(log, `${base}page`, opts));
    expect(rendered).toHaveLength(1);
    expect(rendered[0]!.id).toBe(`${base}${keep.logicalId}/v1`);
  });
});
