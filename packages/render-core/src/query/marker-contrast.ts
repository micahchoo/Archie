// The overlay contrast gate (Archie-eec7 / CONTEXT orphan gap 4) — pure colour maths over the
// annotation marker palette.
//
// WHY LUMINANCE CONTRAST IS NOT THE WHOLE ANSWER HERE, and getting this wrong is the easy mistake:
// WCAG's contrast ratio is a LUMINANCE ratio. It answers "can I see this against that background",
// and it says nothing at all about "can I tell these two markers apart" — two colours of equal
// lightness and opposite hue are trivially distinguishable to most people and have a contrast ratio
// of ~1.0. A palette gate built on contrast ratio alone would pass a palette nobody can read and
// fail one everybody can. So this module carries TWO independent rules:
//
//   1. VISIBILITY — a marker is drawn over an arbitrary photograph, so there is no known background
//      to measure against. The honest worst case is both extremes: a colour must clear 3:1 (WCAG
//      1.4.11 non-text contrast) against BOTH white and black. Note the arithmetic that makes this a
//      real constraint rather than a formality: contrast-vs-white × contrast-vs-black is ALWAYS 21,
//      so requiring ≥3 on both sides confines every marker colour to a mid-luminance band. That is
//      the price of being visible over anything.
//
//   2. DISTINGUISHABILITY — measured as CIE76 ΔE in Lab, which is perceptual, and measured again
//      under simulated deuteranopia and protanopia. Red-green colour vision deficiency affects
//      roughly 8% of men, and a reading palette is exactly the kind of categorical encoding it
//      destroys. This is not hypothetical here: the palette this gate replaced collapsed its rust
//      and ochre readings to ΔE 1.3 under deuteranopia — indistinguishable, for a reader who had no
//      way to know two different readings were being shown.
//
// CVD simulation is Viénot–Brettel–Mollon (1999): linear-RGB → LMS, project onto the dichromat's
// plane, back. Standard, cheap, and adequate for a gate — it is used to catch collapses, not to
// render a preview.

/** sRGB hex → three 0..1 channels. Accepts `#rrggbb` (with or without the hash). */
function channels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const toSrgb = (v: number): number => {
  const c = Math.max(0, Math.min(1, v));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
};
const hex2 = (v: number): string => Math.round(toSrgb(v) * 255).toString(16).padStart(2, "0");

/** WCAG relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map(toLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** WCAG 1.4.11 non-text contrast: graphical objects need 3:1. */
export const NON_TEXT_CONTRAST_MIN = 3;

/**
 * Is this colour visible over ANY image? True when it clears {@link NON_TEXT_CONTRAST_MIN} against
 * both white and black — the only defensible worst case when the background is a photograph nobody
 * controls.
 */
export function visibleOverAnyImage(hex: string): boolean {
  return contrastRatio(hex, "#ffffff") >= NON_TEXT_CONTRAST_MIN && contrastRatio(hex, "#000000") >= NON_TEXT_CONTRAST_MIN;
}

/** CIE L*a*b* (D65). */
export function toLab(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map(toLinear) as [number, number, number];
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/** CIE76 colour difference. ~2.3 is "just noticeable"; >10 reads as a different colour. */
export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Vision types the palette must survive. `normal` is the identity simulation. */
export type VisionType = "normal" | "deuteranopia" | "protanopia";

/** Simulate how `hex` appears to a dichromat (Viénot–Brettel–Mollon 1999). */
export function simulateVision(hex: string, vision: VisionType): string {
  if (vision === "normal") return hex.startsWith("#") ? hex : `#${hex}`;
  const [r, g, b] = channels(hex).map(toLinear) as [number, number, number];
  const L = 17.8824 * r + 43.5161 * g + 4.11935 * b;
  const M = 3.45565 * r + 27.1554 * g + 3.86714 * b;
  const S = 0.0299566 * r + 0.184309 * g + 1.46709 * b;
  // Each dichromacy replaces ONE cone response with a projection of the other two.
  const L2 = vision === "protanopia" ? 2.02344 * M - 2.52581 * S : L;
  const M2 = vision === "deuteranopia" ? 0.494207 * L + 1.24827 * S : M;
  return `#${hex2(0.080944 * L2 - 0.130504 * M2 + 0.116721 * S)}${hex2(-0.0102485 * L2 + 0.0540194 * M2 - 0.113615 * S)}${hex2(-0.000365294 * L2 - 0.00412163 * M2 + 0.693513 * S)}`;
}

/**
 * The floor for "these are different readings, not the same one twice".
 *
 * 10 is chosen because CIE76 ΔE of ~2.3 is merely *just noticeable* under ideal side-by-side
 * conditions — far too weak for two small marker strokes at opposite ends of a zoomed image, seen
 * seconds apart. 10 is the point at which two swatches read as different colours rather than as two
 * shades of one, which is the judgement a reader is actually being asked to make.
 */
export const MARKER_DISTINCT_MIN_DELTA_E = 10;

/** One pair of palette entries that a reader could confuse, and under which vision. */
export interface PaletteConfusion {
  a: string;
  b: string;
  vision: VisionType;
  deltaE: number;
}

/**
 * Every pair in `palette` that falls under {@link MARKER_DISTINCT_MIN_DELTA_E}, checked under normal
 * vision AND both red-green deficiencies. Empty = the palette is safe.
 */
export function paletteConfusions(
  palette: readonly string[],
  minDeltaE: number = MARKER_DISTINCT_MIN_DELTA_E,
): PaletteConfusion[] {
  const out: PaletteConfusion[] = [];
  const visions: VisionType[] = ["normal", "deuteranopia", "protanopia"];
  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      for (const vision of visions) {
        const d = deltaE(simulateVision(palette[i]!, vision), simulateVision(palette[j]!, vision));
        if (d < minDeltaE) out.push({ a: palette[i]!, b: palette[j]!, vision, deltaE: d });
      }
    }
  }
  return out;
}

/** Palette entries that would vanish against some part of some image. Empty = all safe. */
export const paletteInvisibilities = (palette: readonly string[]): string[] =>
  palette.filter((c) => !visibleOverAnyImage(c));

/**
 * The reading-marker swatches Studio offers (Archie-eec7). Lives here, beside the gate that guards
 * it, rather than as a literal in App.svelte — a palette nothing checks is how the previous one
 * shipped with a pair that vanished under deuteranopia.
 *
 * Every entry clears {@link visibleOverAnyImage}, and every pair clears
 * {@link MARKER_DISTINCT_MIN_DELTA_E} under normal, deuteranopic AND protanopic vision (worst pair
 * measured at ΔE 13.6, against 1.3 for the set this replaced). `#3A8C5D` is kept as the first
 * swatch: it is also `BASE_MARKER`, the reading-less default, so the base note colour is unchanged.
 * The rest are Okabe-Ito-derived — a palette designed for colour-vision deficiency.
 *
 * Changing an entry means re-running `marker-contrast.test.ts`, which gates exactly these two rules.
 */
export const READING_PALETTE: readonly string[] = ["#3A8C5D", "#0072B2", "#D55E00", "#CC79A7", "#006E6E", "#8C5000"];
