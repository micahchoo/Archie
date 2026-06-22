// AV deep-link landing (Phase 3, 4.7): a `#/<slug>/a/<note>?t=<offset>` link lands on a recording at a
// time offset. Section-142 is the load-bearing constraint: landing must SEEK-TO-OFFSET but NOT auto-play
// (the player's own `seekTo` couples `play()` for the in-read affordance — it must NOT be reused for the
// passive arrival). This module is the pure seek-resolution the MediaPlayer wires on `loadedmetadata`:
// parse the route's `t=` (via render-core's robust parseTimeFragment) and clamp the START to the loaded
// duration. Garbage / out-of-range → 0 (land paused at the head, never NaN onto mediaEl.currentTime).
import { parseTimeFragment } from "@render/core";

/**
 * Resolve a route's `t=` fragment to a clamped start offset in seconds for an initial (paused) seek.
 *
 *  - `t` undefined / null / unparsable → 0 (land at the head; a garbage offset is not an error).
 *  - a valid `t=start[,end]` → `start`, clamped to `[0, dur]`.
 *  - `dur` ≤ 0 / non-finite (metadata not yet known, or a zero-length stream) → start clamped at its
 *    own floor of 0 only (no upper bound to clamp against — the caller seeks once metadata arrives).
 *
 * NEVER returns NaN or a negative — the result is safe to assign straight to `HTMLMediaElement.currentTime`.
 */
export function clampSeekStart(t: string | null | undefined, dur: number): number {
  if (!t) return 0;
  const parsed = parseTimeFragment(t);
  if (!parsed) return 0; // garbage offset → head, paused
  const start = parsed.start; // parseTimeFragment guarantees start ≥ 0 and finite
  if (!Number.isFinite(dur) || dur <= 0) return Math.max(0, start);
  return Math.max(0, Math.min(dur, start));
}
