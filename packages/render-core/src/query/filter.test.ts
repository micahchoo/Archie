import { describe, it, expect } from "vitest";
import { tagsOf, filterByTag, allTags } from "./filter.js";
import { appendNew } from "../spine/log.js";
import { asClientId } from "../wadm/brand.js";
import type { AnnotationRecord } from "../wadm/types.js";

// Tag filtering (ADR-0007: Tags = a body with purpose:tagging — the additive home legacy `layers`
// folded into). The retired multi-valued `layers` filters (layersOf/filterByLayer/allLayers) and
// their round-trip assertions were removed with the field; layer→Tags back-compat is proven in
// spine/deserialize.test.ts ("ADR-0007: legacy archie:layers folds into Tags on load").

const alice = asClientId("alice");
const t = "t";

function note(opts: { value: string; tags?: string[] }) {
  const bodies = [{ type: "TextualBody" as const, value: opts.value }, ...(opts.tags ?? []).map((v) => ({ type: "TextualBody" as const, value: v, purpose: "tagging" }))];
  return appendNew([], { target: "c1", body: bodies, lastEditor: alice, modifiedAt: t, now: 1 }).record;
}

describe("tagsOf", () => {
  it("reads purpose:tagging bodies as tags (ignoring the comment body)", () => {
    const r = note({ value: "a comment", tags: ["medieval", "ink"] });
    expect(tagsOf(r)).toEqual(["medieval", "ink"]);
  });
  it("returns no tags for a plain comment note", () => {
    expect(tagsOf(note({ value: "y" }))).toEqual([]);
  });
});

describe("filterByTag / allTags (cross-object filter)", () => {
  const records: AnnotationRecord[] = [
    note({ value: "1", tags: ["ink"] }),
    note({ value: "2", tags: ["ink", "gold"] }),
    note({ value: "3" }),
  ];
  it("filters by tag", () => {
    expect(filterByTag(records, "ink")).toHaveLength(2);
    expect(filterByTag(records, "gold")).toHaveLength(1);
    expect(filterByTag(records, "none")).toHaveLength(0);
  });
  it("allTags enumerates a sorted, deduped set across notes", () => {
    expect(allTags(records)).toEqual(["gold", "ink"]);
  });
});
