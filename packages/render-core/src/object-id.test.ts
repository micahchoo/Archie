import { describe, it, expect } from "vitest";
import { mintObjectId, composeLegacyObjectId, isLegacyObjectId } from "./object-id.js";

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/; // Crockford base32, 26 chars (wadm/brand.ts)

describe("mintObjectId", () => {
  it("mints a 26-char ULID-shaped id", () => {
    expect(mintObjectId()).toMatch(ULID_RE);
  });

  it("is time-ordered: a later `now` sorts lexicographically after an earlier one", () => {
    const early = mintObjectId(1000, () => 0);
    const late = mintObjectId(2000, () => 0);
    expect(late > early).toBe(true);
  });

  it("mints distinct ids across calls (uniqueness — the id-reuse bug is closed)", () => {
    const ids = new Set(Array.from({ length: 500 }, () => mintObjectId()));
    expect(ids.size).toBe(500);
  });

  it("a freshly minted id is NOT legacy-shaped (it is already global)", () => {
    expect(isLegacyObjectId(mintObjectId())).toBe(false);
  });
});

describe("composeLegacyObjectId", () => {
  it("composes `<exhibitId>.<ordinal>`", () => {
    expect(composeLegacyObjectId("ex-voynich", "o9")).toBe("ex-voynich.o9");
  });

  it("is deterministic — same inputs, same id", () => {
    expect(composeLegacyObjectId("ex-atlas", "o3")).toBe(composeLegacyObjectId("ex-atlas", "o3"));
  });

  it("carries a non-`o\\d+` ordinal verbatim (maps/sampler local ids)", () => {
    expect(composeLegacyObjectId("ex-geo", "m1")).toBe("ex-geo.m1");
    expect(composeLegacyObjectId("ex-sampler", "sv1")).toBe("ex-sampler.sv1");
  });

  it("produces an id that is NOT itself legacy-shaped", () => {
    expect(isLegacyObjectId(composeLegacyObjectId("ex-voynich", "o9"))).toBe(false);
  });
});

describe("isLegacyObjectId", () => {
  it("accepts bare `o` + digits, including o0 and multi-digit", () => {
    for (const id of ["o0", "o1", "o9", "o12", "o120"]) expect(isLegacyObjectId(id)).toBe(true);
  });

  it("rejects composed ids, ULIDs, and other shapes", () => {
    for (const id of [
      "ex-voynich.o9", // composed
      "0000000000CDEFGHJKMNPQRSTV", // ULID-shaped
      "m1", "sv1", "sa1", "si1", // non-ordinal local ids
      "o", "o1a", "1o", "oo1", " o1", "o1 ", "", // near-misses
    ]) {
      expect(isLegacyObjectId(id)).toBe(false);
    }
  });
});
