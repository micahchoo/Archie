// §258 SNAG regression — the three Voynich exhibits (voynich / voynich-reading / voynich-rosettes)
// are built from ONE shared seed (./voynich.ts) by buildVoynichLog in sample-data.ts. Each exhibit is
// published against its OWN slug, so a published note's logicalId is a DURABLE cross-exhibit anchor
// (ADR-0014); buildLinkIndex resolves `archie:<slug>/#/a/<logicalId>` cites first-seen-wins. If two
// exhibits mint the SAME logicalId, a cross-exhibit cite mis-attributes to whichever log was indexed
// first. logicalId = encodeTime(now) + encodeRandom(rng) (wadm/brand.ts mintLogicalId): with an
// IDENTICAL `now` sequence (1,2,3…) AND an identical rng seed across builders, the suffixes collide
// byte-for-byte. The fix seeds the rng PER-SLUG so each exhibit's logicalId set is DISJOINT.
import { describe, it, expect } from "vitest";
import { getLog } from "./sample-data.js";

const idsOf = (exhibitId: string): Set<string> =>
  new Set(getLog(exhibitId).map((r) => r.logicalId as string));

const intersect = (a: Set<string>, b: Set<string>): string[] =>
  [...a].filter((id) => b.has(id));

describe("buildVoynichLog — per-slug logicalIds (§258 dup-id SNAG)", () => {
  const rosettes = idsOf("ex-voynich-rosettes");
  const grid = idsOf("ex-voynich");
  const narrative = idsOf("ex-voynich-reading");

  it("mints a non-empty logicalId set per exhibit", () => {
    expect(rosettes.size).toBeGreaterThan(0);
    expect(grid.size).toBeGreaterThan(0);
    expect(narrative.size).toBeGreaterThan(0);
  });

  it("voynich-rosettes and voynich share NO logicalIds", () => {
    expect(intersect(rosettes, grid)).toEqual([]);
  });

  it("voynich-rosettes and voynich-reading share NO logicalIds", () => {
    expect(intersect(rosettes, narrative)).toEqual([]);
  });

  it("voynich and voynich-reading share NO logicalIds", () => {
    expect(intersect(grid, narrative)).toEqual([]);
  });
});
