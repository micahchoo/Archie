import { describe, it, expect } from "vitest";
import { langMap, IIIF_PRESENTATION_CONTEXT } from "./presentation.js";

describe("langMap — build a single-language `none` IIIF language map", () => {
  it("wraps a value under the `none` key", () => {
    expect(langMap("My Title")).toEqual({ none: ["My Title"] });
  });

  it("wraps an empty string as-is (no special-casing blank values)", () => {
    expect(langMap("")).toEqual({ none: [""] });
  });
});

describe("IIIF_PRESENTATION_CONTEXT", () => {
  it("is the canonical Presentation 3 context IRI", () => {
    expect(IIIF_PRESENTATION_CONTEXT).toBe("https://iiif.io/api/presentation/3/context.json");
  });
});
