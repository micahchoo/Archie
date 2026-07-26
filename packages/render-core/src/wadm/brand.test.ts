import { describe, it, expect } from "vitest";
import {
  asLogicalId,
  mintLogicalId,
  versionId,
  parseVersionId,
  logicalIdOf,
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

// logicalIdOf — the V100 fix (Archie-67b6). The cite ladder's note rung had never resolved because
// `route.ts` parses ONE path segment out of `#/<slug>/a/<id>` while a published annotation id is the
// full IRI `{base}{slug}/annotations/{ULID}/v{n}`, and the two were compared with `===`. This helper
// is what both sides normalise through, so it must accept BOTH forms and refuse everything else.
describe("logicalIdOf", () => {
  const ULID = "01KVPP7FN3KRAF8B45HJQKYSZG";
  const BASE = "https://micahchoo.github.io/Archie/viewer/published/voynich/annotations";

  it("passes a bare ULID through — the address-bar form", () => {
    expect(logicalIdOf(ULID)).toBe(ULID);
  });

  it("extracts the ULID from a published annotation IRI — the data form", () => {
    expect(logicalIdOf(`${BASE}/${ULID}/v1`)).toBe(ULID);
  });

  it("is version-agnostic: every version of a note has ONE logical id", () => {
    // ADR-0003 — notes are append-only, so a citation minted at v1 must still name the note at v9.
    expect(logicalIdOf(`${BASE}/${ULID}/v9`)).toBe(logicalIdOf(`${BASE}/${ULID}/v1`));
  });

  it("anchors on the RIGHTMOST /annotations/ segment", () => {
    // A deploy path containing `/annotations/` must not shift the match — the silent failure a
    // `split("/").at(-2)` would have had, invisible until someone deployed under such a path.
    expect(logicalIdOf(`https://host/annotations/archive/lib/voynich/annotations/${ULID}/v2`)).toBe(ULID);
  });

  it("is idempotent — feeding its own output back is a no-op", () => {
    expect(logicalIdOf(logicalIdOf(`${BASE}/${ULID}/v1`))).toBe(ULID);
  });

  it("returns null (never throws) for anything that is not a note id", () => {
    for (const bad of [
      "", "   ", "not-a-ulid", "../../etc/passwd",
      `${BASE}/${ULID}`,            // no version tail
      `${BASE}/${ULID}/v0`,         // versions are 1-based
      `${BASE}/${ULID}/v1/extra`,   // not the end of the string
      `${BASE}/NOTAULID0000000000000000/v1`,
      `${BASE}/${ULID.toLowerCase()}/v1`, // Crockford base32 is upper-case
      "https://collections.library.yale.edu/iiif/2/1006231/canvas/p1",
      null, undefined, 42, {},
    ] as unknown[]) {
      expect(logicalIdOf(bad as string)).toBeNull();
    }
  });

  it("refuses the ULID charset's excluded letters (I, L, O, U)", () => {
    expect(logicalIdOf("01KVPP7FN3KRAF8B45HJQKYSZI")).toBeNull();
  });
});
