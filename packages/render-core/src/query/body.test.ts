import { describe, it, expect } from "vitest";
import { bodyList } from "./body.js";
import type { W3CTextualBody } from "../wadm/types.js";

const comment: W3CTextualBody = { type: "TextualBody", value: "hi", purpose: "commenting" };
const tag: W3CTextualBody = { type: "TextualBody", value: "red", purpose: "tagging" };

describe("bodyList — normalize a W3C body (single | array | absent) to a list", () => {
  it("returns [] when body is absent", () => {
    expect(bodyList({})).toEqual([]);
  });

  it("wraps a single body in a one-element list", () => {
    expect(bodyList({ body: comment })).toEqual([comment]);
  });

  it("passes an array body through unchanged, preserving order", () => {
    expect(bodyList({ body: [comment, tag] })).toEqual([comment, tag]);
  });

  it("preserves an empty array body as-is (distinct from absent)", () => {
    expect(bodyList({ body: [] })).toEqual([]);
  });
});
