import { describe, it, expect } from "vitest";
import { isDegenerateSelectorValue } from "@render/core";
import { selectorValue } from "./mount.js";

// ════════════════════════════════════════════════════════════════════════════════════
// CHARACTERIZATION — the degenerate-gesture guard's selector extraction (mount.ts).
//
// Pins the CURRENT behaviour of the exact expression the create/update/setAnnotations guard
// sites run: `isDegenerateSelectorValue(selectorValue(a))`. This is the safety net for the
// "is `selectorValue` a dedup of core's `selectorOf`?" question — it is NOT. `selectorValue`
// reads the raw `.value` string for ANY single selector (type-agnostic) and yields `undefined`
// for an ARRAY-shaped selector; `selectorOf` only accepts Fragment/Svg and dereferences `[0]`.
// Swapping would change what the guard sees for the array + non-Fragment/Svg cases below.
// ════════════════════════════════════════════════════════════════════════════════════

const guard = (a: unknown): boolean => isDegenerateSelectorValue(selectorValue(a));

describe("selectorValue — raw value for ANY single selector (the degenerate-guard input)", () => {
  it("plain rect FragmentSelector → returns its raw value string (guard: not degenerate)", () => {
    const a = { id: "r", target: { selector: { type: "FragmentSelector", value: "xywh=pixel:1,2,3,4" } } };
    expect(selectorValue(a)).toBe("xywh=pixel:1,2,3,4");
    expect(guard(a)).toBe(false);
  });

  it("SvgSelector polygon → returns its raw value string (guard: not degenerate)", () => {
    const a = { id: "p", target: { selector: { type: "SvgSelector", value: "<polygon points='0,0 1,1 2,0'/>" } } };
    expect(selectorValue(a)).toBe("<polygon points='0,0 1,1 2,0'/>");
    expect(guard(a)).toBe(false);
  });

  it("ARRAY-shaped selector → undefined (NOT dereferenced [0]) — distinct from selectorOf", () => {
    // selectorOf would take [0] and resolve "xywh=..."; selectorValue reads `.value` on the array
    // (→ undefined). The guard therefore treats an array-shaped selector as non-degenerate. This is
    // the load-bearing divergence: do not "dedup" this into selectorOf.
    const a = { id: "arr", target: { selector: [{ type: "FragmentSelector", value: "xywh=pixel:1,2,3,4" }] } };
    expect(selectorValue(a)).toBeUndefined();
    expect(guard(a)).toBe(false);
  });

  it("degenerate / NaN value → returns the string, guard flags it degenerate", () => {
    const a = { id: "bad", target: { selector: { type: "SvgSelector", value: "<polygon points='NaN'/>" } } };
    expect(selectorValue(a)).toBe("<polygon points='NaN'/>");
    expect(guard(a)).toBe(true);
  });

  it("non-Fragment/Svg single selector → still returns its raw value (type-agnostic)", () => {
    // selectorOf returns null here; selectorValue returns the string. A degenerate NaN value on a
    // non-v1 selector type is STILL flagged by the guard — proof selectorValue is type-agnostic.
    const a = { id: "tq", target: { selector: { type: "TextQuoteSelector", value: "<path d='M NaN' />" } } };
    expect(selectorValue(a)).toBe("<path d='M NaN' />");
    expect(guard(a)).toBe(true);
  });

  it("missing target / non-string value → undefined (guard: not degenerate)", () => {
    expect(selectorValue(undefined)).toBeUndefined();
    expect(selectorValue({ id: "x" })).toBeUndefined();
    expect(selectorValue({ target: { selector: { value: 123 } } })).toBeUndefined();
    expect(guard({ id: "x" })).toBe(false);
  });
});
