// Viewer product copy — the WORDING the reader sees, in one place, for the surfaces where the same
// phrase has to appear twice and MUST NOT drift (Archie-01a6 / Archie-dbbc).
//
// Two classes of drift this closes:
//
// 1. **Visible text disagreeing with its own aria.** `SidebarObjectNav` read "Object 2 of 12" to a
//    screen reader while showing `‹ Prev  1 / 12  Next ›` on screen (V65). The count was honest in
//    one channel and mute in the other, so the two nav affordances in view could not be reconciled
//    by a sighted reader (V23). The nav now renders `navPosition` in BOTH channels, by construction.
//
// 2. **The same note named differently on two surfaces.** The floating card called itself
//    "Note — Herbal, f1r"; the reading sheet it expanded into was labelled the bare literal "Note"
//    (V64) — expanding to read LOST the identity at the exact moment the reader asked for more.
//    `noteSurfaceName` is the one name; the card's region label and the sheet's dialog label are the
//    same call on the same eyebrow.
//
// Pure strings, no Svelte, so the wording is unit-testable and a copy change is a one-file diff. The
// index math stays in `exhibit-nav.ts` (`positionLabel`) — this module is its voice, not a second copy.
import { positionLabel } from "./exhibit-nav.js";

/** What a canvas-chrome stepper steps. The grid reader steps OBJECTS; the narrative steps SECTIONS. */
export type NavUnit = "object" | "section";

/** Sentence-case noun for a unit, as it appears mid-phrase ("Previous object: f2r"). */
const NOUN: Record<NavUnit, string> = { object: "object", section: "section" };
/** Title-case noun for a unit, as it leads a position label ("Object 2 of 12"). */
const NOUN_CAP: Record<NavUnit, string> = { object: "Object", section: "Section" };

/** The stepper's VISIBLE position — "Object 2 of 12", "Section 3 of 6". Speaks the noun on purpose:
 *  a bare "2 / 12" beside a filmstrip, a breadcrumb and a spine tells the reader a number and leaves
 *  them to guess which of the four things in view it counts (V23/V65). `index` is 0-based. */
export function navPosition(index: number, total: number, unit: NavUnit): string {
  return positionLabel(index, total, NOUN_CAP[unit]);
}

/** The nav landmark's accessible name — "Objects in this exhibit" / "Sections in this narrative". */
export function navRegionName(unit: NavUnit): string {
  return unit === "object" ? "Objects in this exhibit" : "Sections in this narrative";
}

/** Prev/next button name. `label` = the destination's own title; absent ⇒ this end is the end, and the
 *  control says so rather than going silent (a disabled button with no name is unexplained). */
export function navStepName(unit: NavUnit, direction: "prev" | "next", label?: string): string {
  const word = direction === "prev" ? "Previous" : "Next";
  if (label) return `${word} ${NOUN[unit]}: ${label}`;
  return direction === "prev" ? `This is the first ${NOUN[unit]}` : `This is the last ${NOUN[unit]}`;
}

/** The accessible name BOTH note surfaces carry — the floating card's `role="region"` label and the
 *  reading sheet's `role="dialog"` label. One function so "expand to read" cannot lose the identity
 *  it expanded FROM (V64). `eyebrow` is the host-built orientation string (object, or section·object). */
export function noteSurfaceName(eyebrow: string): string {
  return eyebrow ? `Note — ${eyebrow}` : "Note";
}

/** What a note's SIDEBAR entry says while that note is open on the canvas (V60). The list is the
 *  index: it locates, it does not re-read. A selected entry drops its prose preview — which was the
 *  same sentence the open card was showing, in a second type treatment ~900px away — and marks
 *  position instead. `index` is 0-based within the list being shown. */
export function noteIndexOpenMark(index: number, total: number): string {
  return `${positionLabel(index, total, "Note")} · Open`;
}
