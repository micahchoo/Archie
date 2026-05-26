import { describe, it, expect } from "vitest";
import {
  asLogicalId,
  mintLogicalId,
  versionId,
  parseVersionId,
  asClientId,
  type LogicalId,
  type ClientId,
} from "./brand.js";

// Branded ids (ADR-0029 pattern adopted from anvil anvil-uri.ts:14-21; Q-3 id scheme).
// ULID logicalId · versioned id grammar {logicalId}/v{n} · never-reuse.

describe("branded id constructors (Q-3)", () => {
  it("mints ULID-format logical ids (26 Crockford-base32 chars)", () => {
    const a = mintLogicalId();
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("mints distinct ids on successive calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => mintLogicalId() as string));
    expect(ids.size).toBe(100);
  });

  it("mints time-ordered ids (ULID timestamp prefix is lexicographically monotonic)", () => {
    const earlier = mintLogicalId(1_000) as string;
    const later = mintLogicalId(2_000) as string;
    expect(later > earlier).toBe(true);
  });

  it("asLogicalId brands a valid ULID string and rejects malformed input", () => {
    const valid = mintLogicalId() as string;
    expect(asLogicalId(valid)).toBe(valid);
    expect(() => asLogicalId("not-a-ulid")).toThrow();
    expect(() => asLogicalId("")).toThrow();
    expect(() => asLogicalId("01ARZ3NDEKTSV4RRFFQ69G5FA/v1")).toThrow(); // a version id, not a logical id
  });

  it("builds and parses the {logicalId}/v{n} version id grammar (round-trip)", () => {
    const lid = mintLogicalId();
    const vid = versionId(lid, 3);
    expect(vid).toBe(`${lid}/v3`);
    const parsed = parseVersionId(vid);
    expect(parsed.logicalId).toBe(lid);
    expect(parsed.version).toBe(3);
  });

  it("rejects non-positive-integer versions (version starts at 1, never reused)", () => {
    const lid = mintLogicalId();
    expect(() => versionId(lid, 0)).toThrow();
    expect(() => versionId(lid, -1)).toThrow();
    expect(() => versionId(lid, 1.5)).toThrow();
  });

  it("parseVersionId rejects malformed version ids", () => {
    expect(() => parseVersionId("garbage" as never)).toThrow();
    expect(() => parseVersionId("01ARZ3NDEKTSV4RRFFQ69G5FAV/vX" as never)).toThrow();
  });

  it("asClientId brands non-empty strings", () => {
    expect(asClientId("alice-client-1")).toBe("alice-client-1");
    expect(() => asClientId("")).toThrow();
  });
});

describe("brand nominal typing (compile-time guard — enforced by tsc --noEmit)", () => {
  it("keeps brands nominally distinct", () => {
    const lid: LogicalId = mintLogicalId();

    // @ts-expect-error a raw string is not assignable to LogicalId without the constructor
    const bad1: LogicalId = "raw-string";

    // @ts-expect-error LogicalId and ClientId are nominally distinct despite both being string
    const bad2: ClientId = lid;

    expect(typeof lid).toBe("string");
    void bad1;
    void bad2;
  });
});
