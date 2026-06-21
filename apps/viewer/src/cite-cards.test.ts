import { describe, it, expect } from "vitest";
import { renderMarkdown } from "@render/core";
import { splitProseCites, type ProseSegment } from "./cite-cards.js";

// Tested against REAL renderMarkdown output (snarkdown emits <br>, never <p>) — the prior <p><a> fixtures
// were fiction the production path never produced. Phase 4 (ADR-0018): promotion is type-aware.
const known = new Set(["bidar", "voynich"]);
const VB = "https://h/Archie/viewer/"; // a resolved viewer base (publish rewrites archie: → this form)
const cites = (md: string) => splitProseCites(renderMarkdown(md), known).filter((s): s is Extract<ProseSegment, { kind: "cite" }> => s.kind === "cite");

describe("splitProseCites (against real renderMarkdown output)", () => {
  it("promotes a standalone exhibit-cite line to a typed cite segment", () => {
    const segs = splitProseCites(renderMarkdown(`Intro.\n\n[Bidar](${VB}#/bidar)`), known);
    expect(segs).toEqual([
      { kind: "html", html: "Intro." },
      { kind: "cite", cite: { kind: "exhibit", slug: "bidar" }, label: "Bidar" },
    ]);
  });

  it("classifies standalone object, note, and region cites", () => {
    expect(cites(`[folio 1r](${VB}#/voynich/o/o1)`)).toEqual([{ kind: "cite", cite: { kind: "object", slug: "voynich", objectId: "o1" }, label: "folio 1r" }]);
    expect(cites(`[a note](${VB}#/bidar/a/n3)`)).toEqual([{ kind: "cite", cite: { kind: "note", slug: "bidar", noteId: "n3" }, label: "a note" }]);
    expect(cites(`[a detail](${VB}#/voynich/a/n9?xywh=pixel:0,0,10,10)`)).toEqual([{ kind: "cite", cite: { kind: "region", slug: "voynich", noteId: "n9", xywh: "pixel:0,0,10,10" }, label: "a detail" }]);
  });

  it("leaves an INLINE cite (link amid other text) as plain html", () => {
    const segs = splitProseCites(renderMarkdown(`See [Bidar](${VB}#/bidar) for more.`), known);
    expect(segs.every((s) => s.kind === "html")).toBe(true);
    expect(cites(`See [Bidar](${VB}#/bidar) for more.`)).toEqual([]);
  });

  it("leaves an external link as plain html", () => {
    expect(cites(`[ext](https://example.org/x)`)).toEqual([]);
  });

  it("promotes a cite at the end of a multi-line prose block", () => {
    // The real dogfood shape: a paragraph of prose, then a standalone cite line.
    const segs = splitProseCites(renderMarkdown(`The leaf entire.\n\n[Folio 1r, as a whole object.](${VB}#/voynich/o/o1)`), known);
    expect(segs.at(-1)).toEqual({ kind: "cite", cite: { kind: "object", slug: "voynich", objectId: "o1" }, label: "Folio 1r, as a whole object." });
  });

  it("returns a single html segment when there are no cites, and [] for empty", () => {
    expect(splitProseCites(renderMarkdown("plain prose"), known)).toEqual([{ kind: "html", html: "plain prose" }]);
    expect(splitProseCites("", known)).toEqual([]);
  });
});
