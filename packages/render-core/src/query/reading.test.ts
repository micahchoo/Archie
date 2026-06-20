import { describe, it, expect } from "vitest";
import { readingOf, filterByReading, allReadings, baseNotes, tagsOf } from "./filter.js";
import { foldLayersIntoTags } from "../migrate/migrate.js";
import { readingById } from "../model/model.js";
import type { Exhibit } from "../model/model.js";
import { appendNew, appendEdit } from "../spine/log.js";
import { toHistory, toHeadsPage, headsPagesByReading, citationIdMap } from "../spine/serialize.js";
import { fromHistory } from "../spine/deserialize.js";
import { projectHeads } from "../spine/heads.js";
import { asClientId } from "../wadm/brand.js";
import type { AnnotationRecord, AnnotationLog } from "../wadm/types.js";

// READINGS corpus (ADR-0007). A Reading is a SINGLE, mutually-exclusive interpretive pass per note
// (vs the deprecated multi-valued `layers`). This pins the target semantics for the Layer→Reading
// reframe (expand-and-contract Phase 1, sub-phase 1A: model + query + log threading). The
// serialize/deserialize round-trip + heads-page carrying are sub-phase 1B.

const alice = asClientId("alice");
const t = "t";

function note(opts: { value: string; target?: string; reading?: string; tags?: string[] }): AnnotationRecord {
  const bodies = [
    { type: "TextualBody" as const, value: opts.value },
    ...(opts.tags ?? []).map((v) => ({ type: "TextualBody" as const, value: v, purpose: "tagging" })),
  ];
  return appendNew([], {
    target: opts.target ?? "c1",
    body: bodies,
    lastEditor: alice,
    modifiedAt: t,
    now: 1,
    ...(opts.reading ? { reading: opts.reading } : {}),
  }).record;
}

describe("readingOf — a single reading, or base", () => {
  it("returns the note's reading, or undefined for a base note", () => {
    expect(readingOf(note({ value: "x", reading: "cipher" }))).toBe("cipher");
    expect(readingOf(note({ value: "y" }))).toBeUndefined();
  });
});

describe("filterByReading / baseNotes / allReadings", () => {
  const records: AnnotationRecord[] = [
    note({ value: "1", reading: "cipher" }),
    note({ value: "2", reading: "hoax" }),
    note({ value: "3", reading: "cipher" }),
    note({ value: "4" }), // base (no reading)
  ];
  it("filters to one reading (a note is in exactly one)", () => {
    expect(filterByReading(records, "cipher")).toHaveLength(2);
    expect(filterByReading(records, "hoax")).toHaveLength(1);
    expect(filterByReading(records, "none")).toHaveLength(0);
  });
  it("baseNotes = the always-visible notes in no reading (Q16)", () => {
    expect(baseNotes(records)).toHaveLength(1);
  });
  it("allReadings enumerates distinct readings, sorted, base excluded", () => {
    expect(allReadings(records)).toEqual(["cipher", "hoax"]);
  });
});

describe("the keystone — rival readings of the SAME region coexist (ADR-0007)", () => {
  it("two notes on one region, different readings, isolate by reading; no merge conflict", () => {
    const region = "folio1#xywh=pixel:10,10,50,50";
    const cipher = note({ value: "enciphered noun-phrase", target: region, reading: "cipher" });
    const hoax = note({ value: "meaningless glyph-string", target: region, reading: "hoax" });
    const all = [cipher, hoax];
    expect(filterByReading(all, "cipher")).toEqual([cipher]);
    expect(filterByReading(all, "hoax")).toEqual([hoax]);
    expect(baseNotes(all)).toHaveLength(0);
    // Different logicalIds → these are DIFFERENT notes, never a version conflict (the Q12 synergy):
    // competing readings coexist; merge only reconciles same-logicalId divergence.
    expect(cipher.logicalId).not.toBe(hoax.logicalId);
  });
});

describe("appendEdit carries the reading forward unless changed", () => {
  it("keeps the reading when the edit omits it", () => {
    const r = note({ value: "x", reading: "cipher" });
    const { record } = appendEdit([r], r.logicalId, {
      body: { type: "TextualBody", value: "x2" },
      lastEditor: alice,
      modifiedAt: t,
      now: 2,
    });
    expect(record.reading).toBe("cipher");
  });
  it("changes the reading when the edit sets it", () => {
    const r = note({ value: "x", reading: "cipher" });
    const { record } = appendEdit([r], r.logicalId, { reading: "hoax", lastEditor: alice, modifiedAt: t, now: 2 });
    expect(record.reading).toBe("hoax");
  });
});

describe("reading round-trips through serialize/deserialize (sub-phase 1B)", () => {
  it("round-trips the reading: log -> history -> log", () => {
    const { log } = appendNew([], { target: "c1", body: { type: "TextualBody", value: "x" }, reading: "cipher", lastEditor: alice, modifiedAt: t, now: 1 });
    const reloaded = fromHistory(Object.values(toHistory(log, { baseUrl: "b/" }).pages));
    expect(reloaded[0]!.reading).toBe("cipher");
  });
  it("carries archie:reading onto the heads page, forward through an edit", () => {
    const r = note({ value: "x", reading: "cipher" });
    const { log } = appendEdit([r], r.logicalId, { body: { type: "TextualBody", value: "x2" }, lastEditor: alice, modifiedAt: t, now: 2 });
    void projectHeads(log);
    const item = toHeadsPage(log, "p", { baseUrl: "b/" }).items[0] as unknown as Record<string, unknown>;
    expect(item["archie:reading"]).toBe("cipher");
  });
  it("a base note (no reading) carries no archie:reading on the heads page", () => {
    const item = toHeadsPage([note({ value: "x" })], "p", { baseUrl: "b/" }).items[0] as unknown as Record<string, unknown>;
    expect(item["archie:reading"]).toBeUndefined();
  });
});

describe("migration — legacy layers fold into Tags, losslessly (sub-phase 1C, ADR-0007)", () => {
  // `layers` is retired from the model (the field no longer exists on AnnotationRecord / NewNoteInput),
  // so legacy data is simulated by attaching the raw value via cast — exactly how deserialize.ts hands
  // it to foldLayersIntoTags after reading `archie:layers` off old persisted JSON.
  const withLegacyLayers = (r: AnnotationRecord, layers: string[]): AnnotationRecord =>
    Object.assign({}, r, { layers }) as AnnotationRecord;
  it("folds every layer into a purpose:tagging body and drops layers (no data loss)", () => {
    const r = withLegacyLayers(note({ value: "comment" }), ["conservation", "iconography"]);
    const m = foldLayersIntoTags(r);
    expect(tagsOf(m).sort()).toEqual(["conservation", "iconography"]);
    expect((m as { layers?: string[] }).layers).toBeUndefined();
    expect(m.reading).toBeUndefined(); // migration does NOT guess a reading — the curator re-curates
  });
  it("does not duplicate a layer already present as a tag", () => {
    const r = withLegacyLayers(note({ value: "c", tags: ["ink"] }), ["ink", "gold"]);
    const m = foldLayersIntoTags(r);
    expect(tagsOf(m).sort()).toEqual(["gold", "ink"]);
  });
  it("is idempotent / a no-op for a record with no layers", () => {
    const r = note({ value: "x", reading: "cipher" });
    expect(foldLayersIntoTags(r)).toBe(r);
  });
});

describe("headsPagesByReading — partition a canvas into per-Reading AnnotationPages (Phase 2, ADR-0007)", () => {
  const pageId = (r: string | undefined) => (r === undefined ? "ann.json" : `ann-${r}.json`);
  const coll = (r: string) => `coll/${r}`;
  function headsWith(readings: (string | undefined)[]) {
    let log: AnnotationLog = [];
    readings.forEach((reading, i) => {
      log = appendNew(log, { target: "c1", body: { type: "TextualBody", value: `n${i}` }, lastEditor: alice, modifiedAt: t, now: i + 1, ...(reading ? { reading } : {}) }).log;
    });
    return { heads: projectHeads(log), ids: citationIdMap(log, "b/") };
  }

  it("emits base + one page per reading; base first then sorted; partOf only on readings", () => {
    const { heads, ids } = headsWith(["cipher", undefined, "hoax", "cipher"]);
    const out = headsPagesByReading(heads, ids, pageId, coll);
    expect(out.map((o) => o.reading)).toEqual([undefined, "cipher", "hoax"]);
    expect(out[0]!.page.partOf).toBeUndefined(); // base page has no partOf
    expect(out[1]!.page.partOf).toEqual([{ id: "coll/cipher", type: "AnnotationCollection" }]);
    expect(out[1]!.page.items).toHaveLength(2); // two cipher notes
    expect(out[0]!.page.items).toHaveLength(1); // one base note
  });
  it("a reading absent from the heads emits NO page (zero-note readings are silent)", () => {
    const { heads, ids } = headsWith(["cipher"]);
    expect(headsPagesByReading(heads, ids, pageId, coll).map((o) => o.reading)).toEqual(["cipher"]);
  });
  it("base-only heads → a single base page, no partOf", () => {
    const { heads, ids } = headsWith([undefined, undefined]);
    const out = headsPagesByReading(heads, ids, pageId, coll);
    expect(out).toHaveLength(1);
    expect(out[0]!.reading).toBeUndefined();
    expect(out[0]!.page.partOf).toBeUndefined();
  });
});

describe("Exhibit readings registry resolves id -> identity (sub-phase 1D, ADR-0007)", () => {
  const exhibit: Pick<Exhibit, "readings"> = {
    readings: [
      { id: "cipher", name: "Cipher", description: "an enciphered natural language", colour: "#a33" },
      { id: "hoax", name: "Hoax" },
    ],
  };
  it("resolves a reading id to its registry entry (name/description/colour)", () => {
    expect(readingById(exhibit, "cipher")?.name).toBe("Cipher");
    expect(readingById(exhibit, "cipher")?.colour).toBe("#a33");
  });
  it("returns undefined for an unknown id or an absent registry", () => {
    expect(readingById(exhibit, "nope")).toBeUndefined();
    expect(readingById({}, "cipher")).toBeUndefined();
  });
});
