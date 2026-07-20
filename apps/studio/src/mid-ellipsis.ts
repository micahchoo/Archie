// Middle-ellipsis for identifier-shaped titles (UX-CRITIQUE O3): filename titles distinguish
// themselves at the END ("…07a" vs "…07b"), so end-truncation — CSS text-overflow — amputates
// exactly the informative part. CSS can't middle-truncate, hence this pure helper. Kept
// framework-free (cf. reorder-state.ts) so it's headless-testable.

/** Truncate `s` to at most `max` display characters by dropping the MIDDLE, keeping both ends.
 *  The tail gets the extra character on odd splits — the suffix is the distinguishing part.
 *  Operates on code points (not UTF-16 units) so surrogate pairs never split. Grapheme CLUSTERS
 *  (ZWJ emoji, combining marks) can still split at the cut — accepted for filename-shaped titles. */
export function midEllipsis(s: string, max: number): string {
  const chars = [...s];
  if (max < 3 || chars.length <= max) return s;
  const keep = max - 1; // room for the ellipsis itself
  const head = Math.floor(keep / 2);
  const tail = keep - head;
  return chars.slice(0, head).join("") + "…" + chars.slice(chars.length - tail).join("");
}

/** Split `s` for WIDTH-ADAPTIVE middle truncation (UX-CRITIQUE O3 follow-up): the head span takes
 *  CSS end-ellipsis and shrinks with the container; the tail span (the last `tailLen` code points)
 *  is rendered unshrinkable, so the distinguishing suffix survives at ANY width — no character
 *  budget guessing a pixel width. Short strings come back whole in `head` (empty tail → no
 *  ellipsis source, no layout change). Same code-point/grapheme caveat as midEllipsis above. */
export function splitForMidTruncation(s: string, tailLen = 7): { head: string; tail: string } {
  const chars = [...s];
  if (chars.length <= tailLen) return { head: s, tail: "" };
  const cut = chars.length - tailLen;
  return { head: chars.slice(0, cut).join(""), tail: chars.slice(cut).join("") };
}
