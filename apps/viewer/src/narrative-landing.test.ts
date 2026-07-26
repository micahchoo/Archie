// Phase 3 / 4.9 — narrative section-jump scans BASE pages AND per-reading pages, so a note that lives
// ONLY on a reading overlay lands on its OWNING section, not section 0.
import { describe, it, expect } from "vitest";
import { ownerObjectOf, arrivalSectionIndex, type NarrativeOwnerData } from "./narrative-landing.js";
import type { W3CAnnotation } from "@render/core";

const ann = (id: string): W3CAnnotation => ({ id, type: "Annotation", motivation: "commenting", target: "" });

// REALISTIC IDS (V100, Archie-67b6). These were `"n-base"` / `"n-cipher"` on BOTH sides of the
// comparison, so the fixture could not tell a working owner search from the broken `a.id === noteId`
// one — and `ownerObjectOf` carried exactly that defect, silently landing every deep-linked note on
// section 0 instead of its own beat. A published annotation id is the full IRI; the address bar
// carries the bare ULID.
const BASE = "https://micahchoo.github.io/Archie/viewer/published/voynich/annotations";
const ULID_BASE = "01KVPP7FN3KRAF8B45HJQKYSZG";
const ULID_CIPHER = "01KVPP80S5NHFMEBP6XPB5X6B5";
const ULID_GONE = "01KVPQ3WXQ4PJ0614J4BEAC2XN";

const data: NarrativeOwnerData = {
  annotationsByObject: {
    o1: [ann(`${BASE}/${ULID_BASE}/v1`)],
    o2: [],
  },
  readingAnnotationsByObject: {
    o2: { cipher: [ann(`${BASE}/${ULID_CIPHER}/v1`)], hoax: [] },
  },
};
const objectIds = ["o1", "o2"];
const sections = [{ objectId: "o1" }, { objectId: "o2" }]; // section 0 → o1, section 1 → o2

describe("ownerObjectOf — base + per-reading owner search (4.9)", () => {
  it("finds a base-page note's owner from the ADDRESS-BAR form (a bare ULID)", () => {
    expect(ownerObjectOf(ULID_BASE, objectIds, data)).toBe("o1");
  });

  it("finds a note that lives ONLY on a per-reading page", () => {
    expect(ownerObjectOf(ULID_CIPHER, objectIds, data)).toBe("o2");
  });

  it("returns null for an unknown id (tombstoned cite)", () => {
    expect(ownerObjectOf(ULID_GONE, objectIds, data)).toBeNull();
  });

  it("also accepts the FULL published IRI, and ignores its version", () => {
    expect(ownerObjectOf(`${BASE}/${ULID_CIPHER}/v7`, objectIds, data)).toBe("o2");
  });

  it("returns null for a malformed id rather than throwing", () => {
    for (const bad of ["", "not-a-ulid", `${BASE}/nope/v1`]) {
      expect(ownerObjectOf(bad, objectIds, data)).toBeNull();
    }
  });
});

describe("arrivalSectionIndex — spine lands on the owning section (4.9)", () => {
  it("lands on the reading-only note's owning section, not 0", () => {
    expect(arrivalSectionIndex(ULID_CIPHER, objectIds, sections, data)).toBe(1);
  });

  it("lands on a base note's section", () => {
    expect(arrivalSectionIndex(ULID_BASE, objectIds, sections, data)).toBe(0);
  });

  it("falls back to 0 for an unknown note or no target", () => {
    expect(arrivalSectionIndex(ULID_GONE, objectIds, sections, data)).toBe(0);
    expect(arrivalSectionIndex(null, objectIds, sections, data)).toBe(0);
  });

  it("falls back to 0 when the owner has no section in the spine", () => {
    const orphanSections = [{ objectId: "o1" }]; // o2 has no section
    expect(arrivalSectionIndex(ULID_CIPHER, objectIds, orphanSections, data)).toBe(0);
  });
});
