import { describe, it, expect } from "vitest";
import { bodiesOfAnnotation, commentOfAnnotation, tagsOfAnnotation, readingIdOf, transcriptTextOf, overlay, wholeObjectFlagOf, emphasisOf, emphasisModifiers } from "./published.js";
import { ARCHIE_READING } from "../wadm/types.js";
import type { W3CAnnotation } from "../wadm/types.js";

// Accessors over the PUBLISHED W3CAnnotation shape (reading under the archie:reading JSON-LD key),
// distinct from filter.ts which is typed for the internal flat AnnotationRecord (record.reading).
const anno = (body: unknown, extra: Record<string, unknown> = {}): W3CAnnotation =>
  ({ id: "a", type: "Annotation", target: "c", body, ...extra }) as unknown as W3CAnnotation;

describe("published-annotation accessors", () => {
  it("commentOfAnnotation: comment/undefined-purpose body value, (untitled) fallback", () => {
    expect(commentOfAnnotation(anno({ type: "TextualBody", value: "hi", purpose: "commenting" }))).toBe("hi");
    expect(commentOfAnnotation(anno({ type: "TextualBody", value: "plain" }))).toBe("plain"); // undefined purpose counts as comment
    expect(commentOfAnnotation(anno([{ type: "TextualBody", value: "t", purpose: "tagging" }]))).toBe("(untitled)");
  });

  it("tagsOfAnnotation: purpose:tagging values, KEEPS empties (viewer parity, unlike filter.ts)", () => {
    const a = anno([
      { type: "TextualBody", value: "c", purpose: "commenting" },
      { type: "TextualBody", value: "x", purpose: "tagging" },
      { type: "TextualBody", value: "", purpose: "tagging" },
    ]);
    expect(tagsOfAnnotation(a)).toEqual(["x", ""]);
  });

  it("readingIdOf: reads the archie:reading JSON-LD key (replaces the as-unknown cast)", () => {
    expect(readingIdOf(anno(undefined, { [ARCHIE_READING]: "cipher" }))).toBe("cipher");
    expect(readingIdOf(anno(undefined))).toBeUndefined();
  });

  it("transcriptTextOf: joins all non-tagging textual bodies incl. supplementing (the AV cue purpose)", () => {
    const a = anno([
      { type: "TextualBody", value: "cue", purpose: "supplementing" },
      { type: "TextualBody", value: "note", purpose: "commenting" },
      { type: "TextualBody", value: "tag", purpose: "tagging" },
    ]);
    expect(transcriptTextOf(a)).toBe("cue note"); // supplementing + comment joined; tag excluded
    expect(transcriptTextOf(anno({ type: "TextualBody", value: "solo", purpose: "supplementing" }))).toBe("solo");
  });

  it("bodiesOfAnnotation: normalizes single / array / absent", () => {
    expect(bodiesOfAnnotation(anno(undefined))).toEqual([]);
    expect(bodiesOfAnnotation(anno({ type: "TextualBody", value: "x" }))).toHaveLength(1);
    expect(bodiesOfAnnotation(anno([{ type: "TextualBody", value: "x" }, { type: "TextualBody", value: "y" }]))).toHaveLength(2);
  });

  it("overlay: base alone when no reading notes; base+reading when present (ADR-0007/Q16)", () => {
    const base = [anno({ type: "TextualBody", value: "b" })];
    const rd = [anno({ type: "TextualBody", value: "r" })];
    expect(overlay(base, undefined)).toBe(base); // same ref, no copy
    expect(overlay(base, [])).toBe(base);
    expect(overlay(base, rd)).toEqual([...base, ...rd]);
  });

  it("wholeObjectFlagOf: reads archie:wholeObject === true (7e1f), else false", () => {
    expect(wholeObjectFlagOf(anno(undefined, { "archie:wholeObject": true }))).toBe(true);
    expect(wholeObjectFlagOf(anno(undefined, { "archie:wholeObject": false }))).toBe(false);
    expect(wholeObjectFlagOf(anno(undefined, { "archie:wholeObject": "true" }))).toBe(false); // not literal true
    expect(wholeObjectFlagOf(anno(undefined))).toBe(false);
  });

  it("emphasisOf: reads archie:emphasis, defaults to normal (1489)", () => {
    expect(emphasisOf(anno(undefined, { "archie:emphasis": "strong" }))).toBe("strong");
    expect(emphasisOf(anno(undefined, { "archie:emphasis": "muted" }))).toBe("muted");
    expect(emphasisOf(anno(undefined, { "archie:emphasis": "normal" }))).toBe("normal");
    expect(emphasisOf(anno(undefined, { "archie:emphasis": "loud" }))).toBe("normal"); // unknown → normal
    expect(emphasisOf(anno(undefined))).toBe("normal");
  });

  it("emphasisModifiers: normal {1,1} · strong {1.4,1.5} · muted {0.5,0.75}", () => {
    expect(emphasisModifiers("normal")).toEqual({ opacityMul: 1, strokeWidthMul: 1 });
    expect(emphasisModifiers("strong")).toEqual({ opacityMul: 1.4, strokeWidthMul: 1.5 });
    expect(emphasisModifiers("muted")).toEqual({ opacityMul: 0.5, strokeWidthMul: 0.75 });
  });
});
