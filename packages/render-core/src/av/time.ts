// Temporal selector helpers (CONTEXT §81: AV notes target a media-fragments `t=` range). The
// transcript adapter (transcript.ts) WRITES `t=start,end`; these READ it back for the player —
// seek-to-cue + highlight-active-cue. Pure + headless-testable; the player UI consumes them.

/** A parsed media-fragments time range, in seconds. `end` absent = a point marker (no duration). */
export interface TimeRange {
  start: number;
  end?: number;
}

/** Build a media-fragments temporal selector value (`t=start,end` or `t=start`). The write-side
 *  inverse of parseTimeFragment — the single source of truth for the `t=` format (hand-annotation
 *  in the Studio + transcript import both go through this). */
export function timeFragmentValue(start: number, end?: number): string {
  return end === undefined ? `t=${start}` : `t=${start},${end}`;
}

/**
 * Parse a media-fragments temporal selector value to seconds. Accepts the stored `t=start,end`
 * form plus the bare RFC forms an author/import may supply — `start`, `start,end`, `,end` — and
 * tolerates an `npt:` prefix. Times are plain seconds (WebVTT clock stamps are already converted
 * to seconds upstream). Returns null on anything malformed (negative, NaN, end<start, >2 parts).
 */
export function parseTimeFragment(value: string): TimeRange | null {
  if (typeof value !== "string") return null;
  let v = value.trim();
  if (v.startsWith("t=")) v = v.slice(2);
  if (v.startsWith("npt:")) v = v.slice(4);
  if (v.length === 0) return null;

  const num = (s: string): number | null => {
    const n = Number(s.trim());
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const parts = v.split(",");
  if (parts.length > 2) return null;

  if (parts.length === 1) {
    const start = num(parts[0]!);
    return start === null ? null : { start };
  }
  const startRaw = parts[0]!.trim();
  const endRaw = parts[1]!.trim();
  const start = startRaw === "" ? 0 : num(startRaw); // ",end" → start defaults to 0
  if (start === null) return null;
  if (endRaw === "") return { start }; // "start," → open-ended
  const end = num(endRaw);
  if (end === null || end < start) return null;
  return { start, end };
}

/**
 * Index of the cue active at time `t` (seconds), or -1. "Active" = `start ≤ t < end` (half-open,
 * matching HTML5 media `timeupdate` — at exactly `t=end` the NEXT cue is active). Point markers
 * (no `end`) are never "active" (they still seek on click). When ranges overlap (a Studio-authored
 * note over an imported cue), the MOST-RECENTLY-STARTED active range wins (largest `start`; on a
 * tie, the later index).
 */
export function activeNoteIndex(ranges: readonly (TimeRange | null | undefined)[], t: number): number {
  let best = -1;
  let bestStart = -Infinity;
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (!r || r.end === undefined) continue;
    if (t >= r.start && t < r.end && r.start >= bestStart) {
      best = i;
      bestStart = r.start;
    }
  }
  return best;
}
