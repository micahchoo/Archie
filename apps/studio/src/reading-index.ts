// Pattern 3 — colour-independent reading identification (Archie-f260, applying
// docs/research/a11y-interactions.md §3 / WCAG 1.4.1's chemistry-diagram worked example: colour + a NUMBER
// + a legend, so a reader who can't tell the hues apart still reads reading identity by number). A reading's
// number is its 1-based position in the panel's `[base, ...registry]` order (`① General notes / ② … / ③ …`) —
// derived from the same array the legend already iterates, NOT stored on the model (reading-state stays
// additive-only; no persist change). ONE definition so the badge that identifies a reading in the readings
// panel, the notes-list layer chip, and the note-selection announcement (§4) all speak the same number.
//
// Framework-free (cf. reorder-state.ts) so it's unit-testable headless; the marker-stroke dash pattern and
// an on-marker corner glyph (§3's optional step) are deliberately NOT here — they live in render-core's
// `readingMarkerStyle`, out of this ticket's territory, and the doc frames them as nice-to-have.

/** The base substrate key (a reading-less note) — mirrors reading-state.svelte.ts BASE. */
export const BASE_READING = "base";

/**
 * A reading's 1-based number: base is 1, each registry reading follows in order (2, 3, …). An id absent
 * from the registry (pruned/unknown) returns 0 — callers render no badge for it.
 * `readingIds` is the exhibit's `currentReadings` id order — the same order the panel/legend iterate.
 */
export function readingNumber(key: string | null | undefined, readingIds: readonly string[]): number {
  if (key == null || key === "" || key === BASE_READING) return 1;
  const i = readingIds.indexOf(key);
  return i < 0 ? 0 : i + 2;
}

// U+2460 ① … U+2473 ⑳; U+24EA ⓪. Circled forms read as one glyph next to a swatch (the WCAG example's shape)
// and stay legible where a bare "2." would look like body text. Past 20, a plain "(21)" keeps it honest.
const CIRCLED = ["⓪", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
export function circled(n: number): string {
  return n >= 0 && n <= 20 ? CIRCLED[n]! : `(${n})`;
}

/** The badge glyph for a reading key (e.g. "②"), or "" for an unknown/pruned reading (number 0). */
export function readingBadge(key: string | null | undefined, readingIds: readonly string[]): string {
  const n = readingNumber(key, readingIds);
  return n >= 1 ? circled(n) : "";
}

/**
 * The live-region text spoken when a note is selected via keyboard in the notes listbox (§4). Reuses the
 * §3 reading NUMBER so the same number names a reading in the legend, the layer chip, and here — but as the
 * plain word "reading N", NOT the circled glyph (a screen reader reads "①" as "circled digit one", noise).
 * Shape: `"{comment or (untitled)}, note {i} of {n}, reading {N}, {reading label}."` (the "reading N," clause
 * is dropped for an unknown/pruned reading — number 0).
 */
export function noteAnnouncement(opts: {
  comment: string;
  index: number; // 0-based position in the visible notes list
  count: number;
  readingKey: string | null | undefined;
  readingLabel: string;
  readingIds: readonly string[];
}): string {
  const c = opts.comment.trim() || "(untitled)";
  const n = readingNumber(opts.readingKey, opts.readingIds);
  const reading = n >= 1 ? `reading ${n}, ${opts.readingLabel}` : opts.readingLabel;
  return `${c}, note ${opts.index + 1} of ${opts.count}, ${reading}.`;
}
