import { describe, it, expect } from "vitest";
import { AnnotationSession, asClientId } from "@render/core";
import { collabBreakdown, collabSummaryText } from "./collab.js";

const sel = (x: number) => ({
  type: "SpecificResource" as const,
  source: "https://x.test/lib/canvas/o1",
  selector: { type: "FragmentSelector" as const, conformsTo: "http://www.w3.org/TR/media-frags/", value: `xywh=pixel:${x},0,10,10` },
});
const note = (s: AnnotationSession, x: number) =>
  s.createNote({ target: sel(x), body: [{ type: "TextualBody", value: `n${x}`, purpose: "commenting" }] });

describe("collabBreakdown — who wrote what, on live notes", () => {
  it("splits live notes by editor, deletions dropping out", () => {
    const priya = new AnnotationSession(asClientId("priya"));
    note(priya, 1); note(priya, 2);
    const me = new AnnotationSession(asClientId("me"), priya.entries);
    const mine = note(me, 3);
    const b = collabBreakdown({ ex: me.log }, asClientId("me"));
    expect(b).toEqual({ others: [{ editor: "priya", count: 2 }], yours: 1 });

    const afterDelete = new AnnotationSession(asClientId("me"), me.entries);
    afterDelete.deleteNote(mine);
    expect(collabBreakdown({ ex: afterDelete.entries }, asClientId("me")).yours).toBe(0);
  });
  it("sums across exhibits", () => {
    const a = new AnnotationSession(asClientId("priya")); note(a, 1);
    const b2 = new AnnotationSession(asClientId("priya")); note(b2, 2); note(b2, 3);
    const b = collabBreakdown({ one: a.entries, two: b2.entries }, asClientId("me"));
    expect(b.others).toEqual([{ editor: "priya", count: 3 }]);
  });
});

describe("collabSummaryText — the draft banner copy (human-gated wording)", () => {
  it("names the others' work and yours, with the send-it-back loop", () => {
    expect(collabSummaryText("field-notes.archie.zip", { others: [{ editor: "priya", count: 12 }], yours: 3 }))
      .toBe("Opened “field-notes.archie.zip” — it carries 12 notes by priya alongside 3 of yours. Annotate your pass and send the zip back to keep the exchange going.");
  });
  it("stays silent when there's nothing collaborative to say", () => {
    expect(collabSummaryText("x.zip", { others: [], yours: 5 })).toBeNull();
  });
});
