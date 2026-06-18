// Geo-truth persistence corpus (Phase 1 part 2 — ADR-0015 / Q4): archie:geo rides the append-only spine
// exactly like archie:emphasis — carried on the record, byte-stable when absent, round-tripping through
// heads + history, ignored by pure consumers. lng/lat is the SOURCE OF TRUTH (the pixel selector is derived).
import { describe, it, expect } from "vitest";
import { appendNew, appendEdit } from "./log.js";
import { toHeadsPage, toHistory } from "./serialize.js";
import { fromHistory } from "./deserialize.js";
import { asClientId } from "../wadm/brand.js";
import { geoOf } from "../query/published.js";
import type { GeoAnchor } from "../wadm/types.js";

const alice = asClientId("alice");
const target = "https://example.org/lib/ex/canvas/m1";
const t0 = "2026-06-18T10:00:00.000Z";
const box: GeoAnchor = { type: "bbox", west: -0.5, south: 51.3, east: 0.3, north: 51.7 };
const poly: GeoAnchor = { type: "polygon", coordinates: [[-0.1, 51.5], [0.0, 51.6], [0.1, 51.5]] };

describe("geo-truth persistence — archie:geo through the spine", () => {
  it("appendNew stores the geo anchor on the record", () => {
    const { record } = appendNew([], { target, lastEditor: alice, modifiedAt: t0, geo: box });
    expect(record.geo).toEqual(box);
  });

  it("appendEdit carries geo forward when unchanged, clears on null, replaces on a new value", () => {
    const a = appendNew([], { target, lastEditor: alice, modifiedAt: t0, geo: box });
    const b = appendEdit(a.log, a.record.logicalId, { lastEditor: alice, modifiedAt: t0 }); // omitted → carry
    expect(b.record.geo).toEqual(box);
    const c = appendEdit(b.log, a.record.logicalId, { lastEditor: alice, modifiedAt: t0, geo: null }); // clear
    expect(c.record.geo).toBeUndefined();
    const d = appendEdit(c.log, a.record.logicalId, { lastEditor: alice, modifiedAt: t0, geo: poly }); // set
    expect(d.record.geo).toEqual(poly);
  });

  it("emits archie:geo on the heads page; geoOf reads it back (bbox + polygon)", () => {
    const boxPage = toHeadsPage(appendNew([], { target, lastEditor: alice, modifiedAt: t0, geo: box }).log, "p1");
    expect(geoOf(boxPage.items[0]!)).toEqual(box);
    const polyPage = toHeadsPage(appendNew([], { target, lastEditor: alice, modifiedAt: t0, geo: poly }).log, "p1");
    expect(geoOf(polyPage.items[0]!)).toEqual(poly);
  });

  it("round-trips through history: log → toHistory → fromHistory preserves geo (geo-truth survives reload)", () => {
    const { log } = appendNew([], { target, lastEditor: alice, modifiedAt: t0, geo: poly });
    const recovered = fromHistory(Object.values(toHistory(log).pages));
    expect(recovered).toHaveLength(1);
    expect(recovered[0]!.geo).toEqual(poly);
  });

  it("is byte-stable when absent — a non-Map note carries NO archie:geo key (heads + history)", () => {
    const { log } = appendNew([], { target, lastEditor: alice, modifiedAt: t0 }); // no geo
    const head = toHeadsPage(log, "p1").items[0] as object;
    expect("archie:geo" in head).toBe(false);
    expect(geoOf(head as never)).toBeUndefined();
    const hist = Object.values(toHistory(log).pages)[0]!.items[0] as object;
    expect("archie:geo" in hist).toBe(false);
  });

  it("a malformed archie:geo value reads as absent (skip, not throw)", () => {
    const head = toHeadsPage(appendNew([], { target, lastEditor: alice, modifiedAt: t0 }).log, "p1").items[0]!;
    (head as unknown as Record<string, unknown>)["archie:geo"] = { type: "bbox", west: "nope" };
    expect(geoOf(head)).toBeUndefined();
  });
});
