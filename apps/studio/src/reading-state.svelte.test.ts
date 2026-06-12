import { describe, it, expect } from "vitest";
import { createReadingState, BASE } from "./reading-state.svelte.js";
import type { Reading } from "@render/core";

// P-2 grill corpus: the visible/active split's transition rules (Q1) + the comparing threshold
// (Q2) + the legacy-dropdown adapter (faithful until B3 retires it).

const cipher: Reading = { id: "cipher", name: "Cipher", colour: "#a33" };
const hoax: Reading = { id: "hoax", name: "Hoax", colour: "#33a" };
const REG = [cipher, hoax];

describe("reading-state — visibility (hidden-set semantics)", () => {
  it("everything is visible by default — including base and readings created later", () => {
    const rs = createReadingState();
    expect(rs.isVisible(BASE)).toBe(true);
    expect(rs.isVisible("cipher")).toBe(true);
    expect(rs.isVisible("a-reading-created-after-the-store")).toBe(true);
  });

  it("toggle hides and re-shows a key", () => {
    const rs = createReadingState();
    rs.toggle("cipher");
    expect(rs.isVisible("cipher")).toBe(false);
    rs.toggle("cipher");
    expect(rs.isVisible("cipher")).toBe(true);
  });

  it("noteVisible maps a record's reading (undefined = base) onto visibility", () => {
    const rs = createReadingState();
    expect(rs.noteVisible({})).toBe(true);
    rs.toggle(BASE);
    expect(rs.noteVisible({})).toBe(false);
    expect(rs.noteVisible({ reading: "cipher" })).toBe(true);
    rs.toggle("cipher");
    expect(rs.noteVisible({ reading: "cipher" })).toBe(false);
  });
});

describe("reading-state — the pen (active) is independent of visibility (grill Q1)", () => {
  it("hiding the active reading does NOT move the pen", () => {
    const rs = createReadingState();
    rs.setActive("cipher");
    rs.toggle("cipher");
    expect(rs.active).toBe("cipher"); // hidden but still where notes file
    expect(rs.newNoteReading()).toBe("cipher");
  });

  it("newNoteReading maps base → undefined (the log's optional field)", () => {
    const rs = createReadingState();
    expect(rs.newNoteReading()).toBeUndefined();
    rs.setActive("hoax");
    expect(rs.newNoteReading()).toBe("hoax");
  });

  it("reconcile: deleting the active reading falls the pen back to base; survivors keep state", () => {
    const rs = createReadingState();
    rs.setActive("cipher");
    rs.toggle("hoax"); // hidden
    rs.reconcile([hoax]); // cipher deleted
    expect(rs.active).toBe(BASE);
    expect(rs.isVisible("hoax")).toBe(false); // survivor's visibility preserved
    expect(rs.isVisible("cipher")).toBe(true); // stale hidden key pruned (id could be reused)
  });

  it("resetForExhibit restores everything-visible + pen-on-base", () => {
    const rs = createReadingState();
    rs.setActive("cipher");
    rs.toggle("hoax");
    rs.resetForExhibit();
    expect(rs.active).toBe(BASE);
    expect(rs.isVisible("hoax")).toBe(true);
  });
});

describe("reading-state — comparing (grill Q2: 2+ READINGS visible; base never counts)", () => {
  it("all visible with two readings = comparing", () => {
    expect(createReadingState().comparing(REG)).toBe(true);
  });
  it("one reading hidden = not comparing", () => {
    const rs = createReadingState();
    rs.toggle("hoax");
    expect(rs.comparing(REG)).toBe(false);
  });
  it("base + one reading visible = not comparing (base is substrate, not a reading)", () => {
    const rs = createReadingState();
    rs.toggle("hoax");
    expect(rs.isVisible(BASE)).toBe(true);
    expect(rs.comparing(REG)).toBe(false);
  });
  it("an empty registry can never compare", () => {
    expect(createReadingState().comparing([])).toBe(false);
  });
});

// (The legacy readingFilter adapter and its tests were retired with the dropdown in B3 — the
// rail is the only writer of visibility/active now.)
