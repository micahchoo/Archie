import { describe, expect, it } from "vitest";
import { snippetParts } from "./snippet";

const rejoin = (p: { pre: string; match: string; post: string }) => p.pre + p.match + p.post;

describe("snippetParts", () => {
  it("returns the whole text unsplit when the query is empty or whitespace", () => {
    expect(snippetParts("Some note text", "")).toEqual({ pre: "Some note text", match: "", post: "" });
    expect(snippetParts("Some note text", "   ")).toEqual({ pre: "Some note text", match: "", post: "" });
  });

  it("returns the whole text unsplit when the query does not occur in the text", () => {
    // e.g. the row matched on its `where` metadata, not the note body
    expect(snippetParts("A vivid herbal plant", "balneological")).toEqual({
      pre: "A vivid herbal plant",
      match: "",
      post: "",
    });
  });

  it("splits around an early match without shifting the window", () => {
    const p = snippetParts("Under the abjad reading, the label is syllabic", "abjad");
    expect(p).toEqual({ pre: "Under the ", match: "abjad", post: " reading, the label is syllabic" });
    expect(rejoin(p)).toBe("Under the abjad reading, the label is syllabic");
  });

  it("preserves the text's casing in the match, not the query's", () => {
    const p = snippetParts("The Rosettes foldout", "ROSETTES");
    expect(p.match).toBe("Rosettes");
  });

  it("shifts a deep match into view with an ellipsis, opening at a word boundary", () => {
    const filler =
      "Under the cipher reading, the drawing and text are a mask over the true content, " +
      "a cover story maintained across every quire and folio of ";
    const text = filler + "the Rosettes foldout and its nine spheres."; // match well past the visible head
    const p = snippetParts(text, "rosettes");
    expect(p.pre.startsWith("… ")).toBe(true);
    expect(p.pre.endsWith("the ")).toBe(true); // opened just after a space, some context kept
    expect(p.match).toBe("Rosettes");
    expect(p.post).toBe(" foldout and its nine spheres.");
    // nothing between the window start and the match is lost
    expect(text.endsWith(p.pre.slice(2) + p.match + p.post)).toBe(true);
  });
});
