// Accessors over the PUBLISHED W3CAnnotation shape — the canonical home (Standard 6) for the
// body/reading/overlay reads the viewer hand-rolled across Reader/NarrativeReader/MediaPlayer/
// ExhibitView. Distinct from query/filter.ts, which is typed for the INTERNAL flat AnnotationRecord
// (`record.reading`): here the reading lives under the JSON-LD key `archie:reading` (ADR-0007) and
// must be read without filter.ts's record type. Body traversal is SHARED via query/body.ts — these
// accessors earn their keep on the reading-key read + commentOf, not by re-typing the body list.

import { ARCHIE_READING, ARCHIE_EMPHASIS, type Emphasis, type W3CAnnotation, type W3CBody } from "../wadm/types.js";
import { bodyList } from "./body.js";

export type { Emphasis };

/** JSON-LD annotation property `archie:wholeObject` (precedent: `archie:reading`, ADR-0007). */
const ARCHIE_WHOLE_OBJECT = "archie:wholeObject";

const purposeOf = (b: W3CBody): string | undefined => (b as { purpose?: string }).purpose;
const valueOf = (b: W3CBody): string | undefined => {
  const v = (b as { value?: unknown }).value;
  return typeof v === "string" ? v : undefined;
};

/** Bodies of a published annotation as a list (single | array | absent). */
export function bodiesOfAnnotation(a: W3CAnnotation): W3CBody[] {
  return bodyList(a);
}

/** The comment text — first body with purpose `commenting` or none — `"(untitled)"` when absent. */
export function commentOfAnnotation(a: W3CAnnotation): string {
  const b = bodiesOfAnnotation(a).find((x) => { const p = purposeOf(x); return p === undefined || p === "commenting"; });
  return (b !== undefined ? valueOf(b) : undefined) ?? "(untitled)";
}

/** Tag values (bodies with purpose `tagging`). KEEPS empty values for viewer parity (filter.ts drops them). */
export function tagsOfAnnotation(a: W3CAnnotation): string[] {
  return bodiesOfAnnotation(a).filter((x) => purposeOf(x) === "tagging").map((x) => valueOf(x) ?? "");
}

/** The Reading id a published annotation belongs to (the `archie:reading` JSON-LD key), typed —
 *  replaces the viewer's `as unknown as Record<string, unknown>` cast. */
export function readingIdOf(a: W3CAnnotation): string | undefined {
  const rid = (a as unknown as Record<string, unknown>)[ARCHIE_READING];
  return typeof rid === "string" ? rid : undefined;
}

/** Transcript/cue text — ALL non-tagging textual body values, joined. Unlike a single-body read, a
 *  cue carrying a `supplementing` body (the AV cue purpose) plus a comment surfaces both; tags never
 *  fold into transcript text. (Fixes MediaPlayer's lossy `body[0]`-only read.) */
export function transcriptTextOf(a: W3CAnnotation): string {
  return bodiesOfAnnotation(a)
    .filter((x) => purposeOf(x) !== "tagging")
    .map(valueOf)
    .filter((v): v is string => v !== undefined)
    .join(" ");
}

/** Base notes are always visible (Q16); an active Reading's notes overlay on top (ADR-0007). One home
 *  for ExhibitView.annotationsOf + NarrativeReader.activeNotes. Returns `base` unchanged when no reading. */
export function overlay(base: W3CAnnotation[], readingNotes: W3CAnnotation[] | undefined): W3CAnnotation[] {
  return readingNotes && readingNotes.length ? [...base, ...readingNotes] : base;
}

// ---- 7e1f / 1489 read-helpers (pure; no render-pkg type dep — core stays framework-free, ADR-0002) ----

/** Authored "applies to whole object" override (7e1f) — the JSON-LD `archie:wholeObject: true`
 *  property (precedent: `archie:reading`). Anything but a literal `true` reads false. */
export function wholeObjectFlagOf(a: W3CAnnotation): boolean {
  return (a as unknown as Record<string, unknown>)[ARCHIE_WHOLE_OBJECT] === true;
}

/** The emphasis a published annotation carries (the `archie:emphasis` JSON-LD key); `"normal"` when
 *  absent or not one of the three values. */
export function emphasisOf(a: W3CAnnotation): Emphasis {
  const e = (a as unknown as Record<string, unknown>)[ARCHIE_EMPHASIS];
  return e === "muted" || e === "strong" ? e : "normal";
}

/** Multipliers an emphasis applies — `opacityMul` scales fill/stroke opacity, `strokeWidthMul` scales
 *  stroke width. PLAIN numbers (not a MarkerStyle — core is framework-free); clamp opacity ≤ 1 at the
 *  call site. normal {1,1} · strong {1.4,1.5} · muted {0.5,0.75}. */
export function emphasisModifiers(e: Emphasis): { opacityMul: number; strokeWidthMul: number } {
  switch (e) {
    case "strong":
      return { opacityMul: 1.4, strokeWidthMul: 1.5 };
    case "muted":
      return { opacityMul: 0.5, strokeWidthMul: 0.75 };
    default:
      return { opacityMul: 1, strokeWidthMul: 1 };
  }
}
