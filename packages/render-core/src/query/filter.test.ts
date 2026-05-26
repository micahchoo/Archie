import { describe, it, expect } from "vitest";
import { tagsOf, layersOf, filterByLayer, filterByTag, allLayers, allTags } from "./filter.js";
import { appendNew, appendEdit } from "../spine/log.js";
import { toHistory, toHeadsPage } from "../spine/serialize.js";
import { fromHistory } from "../spine/deserialize.js";
import { projectHeads } from "../spine/heads.js";
import { asClientId } from "../wadm/brand.js";
import type { AnnotationRecord } from "../wadm/types.js";

// Layer + tag filtering (CONTEXT: Layers = per-note membership v1; Tags = purpose:tagging).

const alice = asClientId("alice");
const t = "t";

function note(opts: { value: string; tags?: string[]; layers?: string[] }) {
  const bodies = [{ type: "TextualBody" as const, value: opts.value }, ...(opts.tags ?? []).map((v) => ({ type: "TextualBody" as const, value: v, purpose: "tagging" }))];
  return appendNew([], { target: "c1", body: bodies, lastEditor: alice, modifiedAt: t, now: 1, ...(opts.layers ? { layers: opts.layers } : {}) }).record;
}

describe("tagsOf / layersOf", () => {
  it("reads purpose:tagging bodies as tags (ignoring the comment body)", () => {
    const r = note({ value: "a comment", tags: ["medieval", "ink"] });
    expect(tagsOf(r)).toEqual(["medieval", "ink"]);
  });
  it("reads layer membership off the record", () => {
    const r = note({ value: "x", layers: ["conservation", "iconography"] });
    expect(layersOf(r)).toEqual(["conservation", "iconography"]);
    expect(layersOf(note({ value: "y" }))).toEqual([]);
  });
});

describe("filterByLayer / filterByTag (cross-object filter)", () => {
  const records: AnnotationRecord[] = [
    note({ value: "1", layers: ["conservation"], tags: ["ink"] }),
    note({ value: "2", layers: ["iconography"], tags: ["ink", "gold"] }),
    note({ value: "3", layers: ["conservation", "iconography"] }),
  ];
  it("filters by layer membership", () => {
    expect(filterByLayer(records, "conservation")).toHaveLength(2);
    expect(filterByLayer(records, "iconography")).toHaveLength(2);
    expect(filterByLayer(records, "none")).toHaveLength(0);
  });
  it("filters by tag", () => {
    expect(filterByTag(records, "ink")).toHaveLength(2);
    expect(filterByTag(records, "gold")).toHaveLength(1);
  });
  it("allLayers / allTags enumerate sorted, deduped sets across notes", () => {
    expect(allLayers(records)).toEqual(["conservation", "iconography"]);
    expect(allTags(records)).toEqual(["gold", "ink"]);
  });
});

describe("layer membership persists through serialize/deserialize + is filterable on the heads page", () => {
  it("round-trips layers (log -> history -> log)", () => {
    const { log } = appendNew([], { target: "c1", body: { type: "TextualBody", value: "x" }, layers: ["conservation"], lastEditor: alice, modifiedAt: t, now: 1 });
    const reloaded = fromHistory(Object.values(toHistory(log, { baseUrl: "b/" }).pages));
    expect(reloaded[0]!.layers).toEqual(["conservation"]);
  });
  it("carries archie:layers onto the heads page (Archie viewer filters; pure consumer ignores)", () => {
    const r = note({ value: "x", layers: ["conservation"] });
    const { log } = appendEdit([r], r.logicalId, { body: { type: "TextualBody", value: "x2" }, lastEditor: alice, modifiedAt: t, now: 2 });
    void projectHeads(log);
    const page = toHeadsPage(log, "p", { baseUrl: "b/" });
    const item = page.items[0] as unknown as Record<string, unknown>;
    expect(item["archie:layers"]).toEqual(["conservation"]); // edit carried layers forward
  });
});
