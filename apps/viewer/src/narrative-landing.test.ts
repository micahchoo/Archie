// Phase 3 / 4.9 — narrative section-jump scans BASE pages AND per-reading pages, so a note that lives
// ONLY on a reading overlay lands on its OWNING section, not section 0.
import { describe, it, expect } from "vitest";
import { ownerObjectOf, arrivalSectionIndex, type NarrativeOwnerData } from "./narrative-landing.js";
import type { W3CAnnotation } from "@render/core";

const ann = (id: string): W3CAnnotation => ({ id, type: "Annotation", motivation: "commenting", target: "" });

const data: NarrativeOwnerData = {
  annotationsByObject: {
    o1: [ann("n-base")],
    o2: [],
  },
  readingAnnotationsByObject: {
    o2: { cipher: [ann("n-cipher")], hoax: [] },
  },
};
const objectIds = ["o1", "o2"];
const sections = [{ objectId: "o1" }, { objectId: "o2" }]; // section 0 → o1, section 1 → o2

describe("ownerObjectOf — base + per-reading owner search (4.9)", () => {
  it("finds a base-page note's owner", () => {
    expect(ownerObjectOf("n-base", objectIds, data)).toBe("o1");
  });

  it("finds a note that lives ONLY on a per-reading page", () => {
    expect(ownerObjectOf("n-cipher", objectIds, data)).toBe("o2");
  });

  it("returns null for an unknown id (tombstoned cite)", () => {
    expect(ownerObjectOf("n-gone", objectIds, data)).toBeNull();
  });
});

describe("arrivalSectionIndex — spine lands on the owning section (4.9)", () => {
  it("lands on the reading-only note's owning section, not 0", () => {
    expect(arrivalSectionIndex("n-cipher", objectIds, sections, data)).toBe(1);
  });

  it("lands on a base note's section", () => {
    expect(arrivalSectionIndex("n-base", objectIds, sections, data)).toBe(0);
  });

  it("falls back to 0 for an unknown note or no target", () => {
    expect(arrivalSectionIndex("n-gone", objectIds, sections, data)).toBe(0);
    expect(arrivalSectionIndex(null, objectIds, sections, data)).toBe(0);
  });

  it("falls back to 0 when the owner has no section in the spine", () => {
    const orphanSections = [{ objectId: "o1" }]; // o2 has no section
    expect(arrivalSectionIndex("n-cipher", objectIds, orphanSections, data)).toBe(0);
  });
});
