// Middle-ellipsis for identifier-shaped titles (UX-CRITIQUE O3): filename titles distinguish
// themselves at the END ("…07a" vs "…07b"), so end-truncation — CSS text-overflow — amputates
// exactly the informative part. CSS can't middle-truncate, hence this pure helper. Kept
// framework-free (cf. reorder-state.ts) so it's headless-testable.

/** Truncate `s` to at most `max` display characters by dropping the MIDDLE, keeping both ends.
 *  The tail gets the extra character on odd splits — the suffix is the distinguishing part.
 *  Operates on code points (not UTF-16 units) so surrogate pairs never split. */
export function midEllipsis(s: string, max: number): string {
  const chars = [...s];
  if (max < 3 || chars.length <= max) return s;
  const keep = max - 1; // room for the ellipsis itself
  const head = Math.floor(keep / 2);
  const tail = keep - head;
  return chars.slice(0, head).join("") + "…" + chars.slice(chars.length - tail).join("");
}
