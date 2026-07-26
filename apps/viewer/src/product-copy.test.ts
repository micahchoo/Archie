// The wording contract (Archie-01a6 / Archie-dbbc). These are string assertions on purpose: the whole
// point of the module is that a phrase appearing on two surfaces is ONE call, so the value it returns
// is the contract, not an implementation detail.
import { describe, it, expect } from "vitest";
import { navPosition, navRegionName, navStepName, noteSurfaceName, noteIndexOpenMark } from "./product-copy.js";

describe("navPosition — the stepper speaks its noun (V65)", () => {
  it("names the unit in the VISIBLE label, not just the aria", () => {
    // The measured defect: `‹ Prev  2 / 12  Next ›` on screen, "Object 2 of 12" announced. A reader
    // looking at a filmstrip, a breadcrumb, a spine and this control got a number with no noun.
    expect(navPosition(1, 12, "object")).toBe("Object 2 of 12");
    expect(navPosition(2, 6, "section")).toBe("Section 3 of 6");
  });

  it("is 1-based for the reader and 0-based for the caller", () => {
    expect(navPosition(0, 5, "object")).toBe("Object 1 of 5");
    expect(navPosition(4, 5, "object")).toBe("Object 5 of 5");
  });
});

describe("navStepName / navRegionName", () => {
  it("names the destination when there is one", () => {
    expect(navStepName("object", "prev", "f2r")).toBe("Previous object: f2r");
    expect(navStepName("section", "next", "The Rosettes")).toBe("Next section: The Rosettes");
  });

  it("says WHY a disabled end is disabled rather than going silent", () => {
    // A disabled button with no accessible name is an unexplained dead control.
    expect(navStepName("object", "prev")).toBe("This is the first object");
    expect(navStepName("object", "next")).toBe("This is the last object");
    expect(navStepName("section", "prev")).toBe("This is the first section");
    expect(navStepName("section", "next")).toBe("This is the last section");
  });

  it("keeps the landmark named per host", () => {
    expect(navRegionName("object")).toBe("Objects in this exhibit");
    expect(navRegionName("section")).toBe("Sections in this narrative");
  });
});

describe("noteSurfaceName — the card and the sheet are the SAME note (V64)", () => {
  it("carries the eyebrow's identity into the name", () => {
    expect(noteSurfaceName("Herbal, f1r")).toBe("Note — Herbal, f1r");
  });

  it("is one function, so the two surfaces cannot disagree", () => {
    // V64 was the bare literal "Note" on the sheet against "Note — <object>" on the card. The guard
    // that matters is that ONE call produces both; this pins the value that call returns.
    const eyebrow = "The Rosettes · f86v";
    expect(noteSurfaceName(eyebrow)).toBe(noteSurfaceName(eyebrow));
    expect(noteSurfaceName(eyebrow)).toContain(eyebrow);
  });

  it("degrades to the bare noun when there is no eyebrow to carry", () => {
    expect(noteSurfaceName("")).toBe("Note");
  });
});

describe("noteIndexOpenMark — the list marks position, it does not re-read (V60)", () => {
  it("gives position and state, and no prose", () => {
    expect(noteIndexOpenMark(3, 7)).toBe("Note 4 of 7 · Open");
    expect(noteIndexOpenMark(0, 1)).toBe("Note 1 of 1 · Open");
  });
});
