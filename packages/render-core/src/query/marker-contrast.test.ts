import { describe, it, expect } from "vitest";
import {
  contrastRatio, relativeLuminance, visibleOverAnyImage, deltaE, simulateVision,
  paletteConfusions, paletteInvisibilities, READING_PALETTE,
  NON_TEXT_CONTRAST_MIN, MARKER_DISTINCT_MIN_DELTA_E,
} from "./marker-contrast.js";

describe("contrast primitives", () => {
  it("black on white is 21:1 and a colour against itself is 1:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#3A8C5D", "#3A8C5D")).toBeCloseTo(1, 5);
  });
  it("is symmetric — order must not change the answer", () => {
    expect(contrastRatio("#3A8C5D", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#3A8C5D"), 10);
  });
  it("luminance matches the WCAG reference points", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 6);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 6);
  });
});

describe("visibleOverAnyImage", () => {
  it("rejects colours that vanish at ONE end, however good the other end is", () => {
    // The trap this rule exists for. Both of these are excellent against one extreme and invisible
    // against the other — and a marker is drawn over a photograph containing both.
    expect(contrastRatio("#000000", "#ffffff")).toBeGreaterThan(NON_TEXT_CONTRAST_MIN);
    expect(visibleOverAnyImage("#000000")).toBe(false); // perfect on white, gone on black
    expect(visibleOverAnyImage("#ffffff")).toBe(false); // and the mirror image
    expect(visibleOverAnyImage("#f5f5f5")).toBe(false);
  });

  it("accepts a mid-luminance colour", () => {
    expect(visibleOverAnyImage("#3A8C5D")).toBe(true);
  });

  it("the band is REAL: contrast-vs-white × contrast-vs-black is always 21", () => {
    // Which is why passing both at ≥3 confines a marker to mid luminance — the constraint is
    // arithmetic, not a style preference, and it is why the palette cannot simply be "dark colours".
    for (const c of ["#3A8C5D", "#0072B2", "#808080", "#123456"]) {
      expect(contrastRatio(c, "#ffffff") * contrastRatio(c, "#000000")).toBeCloseTo(21, 4);
    }
  });
});

describe("deltaE + CVD simulation", () => {
  it("a colour is zero distance from itself, and normal vision is the identity", () => {
    expect(deltaE("#3A8C5D", "#3A8C5D")).toBeCloseTo(0, 6);
    expect(simulateVision("#3A8C5D", "normal")).toBe("#3A8C5D");
  });

  it("collapses red and green under deuteranopia — the whole point of simulating it", () => {
    const red = "#a3553a";
    const ochre = "#8a6d3b";
    // Distinguishable to normal vision…
    expect(deltaE(red, ochre)).toBeGreaterThan(MARKER_DISTINCT_MIN_DELTA_E);
    // …and NOT to a deuteranope. This exact pair shipped in the previous palette at ΔE 1.3.
    expect(deltaE(simulateVision(red, "deuteranopia"), simulateVision(ochre, "deuteranopia"))).toBeLessThan(3);
  });

  it("blue is largely preserved under red-green deficiency (a sanity check on the transform)", () => {
    expect(deltaE("#0072B2", simulateVision("#0072B2", "deuteranopia"))).toBeLessThan(30);
  });
});

// THE GATE. These two run against the SHIPPED palette, so a swatch edit that breaks either rule
// fails the build rather than reaching a reader.
describe("the shipped READING_PALETTE", () => {
  it("every swatch survives any image", () => {
    expect(paletteInvisibilities(READING_PALETTE)).toEqual([]);
  });

  it("no two swatches are confusable — under normal, deuteranopic OR protanopic vision", () => {
    const confusions = paletteConfusions(READING_PALETTE);
    expect(
      confusions,
      `confusable pairs: ${confusions.map((c) => `${c.a}/${c.b} under ${c.vision} ΔE ${c.deltaE.toFixed(1)}`).join("; ")}`,
    ).toEqual([]);
  });

  it("keeps the base marker colour as its first swatch", () => {
    // BASE_MARKER (the reading-less note default) must stay offered, or a reading cannot be given
    // the colour notes already use.
    expect(READING_PALETTE[0]).toBe("#3A8C5D");
  });

  it("offers six swatches — enough readings to be useful, few enough to stay distinguishable", () => {
    // Not decoration: the distinguishability floor is what caps this. Adding a seventh means proving
    // it against every existing swatch under all three vision types.
    expect(READING_PALETTE).toHaveLength(6);
  });

  it("REGRESSION GUARD: the palette this replaced would FAIL the confusability rule", () => {
    // Pinning the defect, not just the fix — if someone reverts the swatches, this says why not.
    const old = ["#3A8C5D", "#a3553a", "#4c5d8a", "#8a6d3b", "#6b4c8a", "#3a7d8a"];
    const confusions = paletteConfusions(old);
    expect(confusions.length).toBeGreaterThan(0);
    expect(confusions.some((c) => c.vision === "deuteranopia" && c.deltaE < 3)).toBe(true);
  });
});
