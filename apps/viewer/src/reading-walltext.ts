// Wall-text gating + legend visibility (readings redesign, plan 2026-07-29). A Reading's full voice
// (`prose`) is shown at the THRESHOLD — a wall-text dialog on first entry per visit — instead of the
// 28ch-clipped gloss the docked legend used to carry. Pure functions here; ExhibitView owns the state.
import type { Reading } from "@render/core";

/**
 * Which chips the legend shows (amendment 1, thread 2806900f): only readings with notes on the
 * CURRENT object — a chip is a filter for this image, so a zero here is noise. Two carve-outs:
 *  - the ACTIVE reading keeps its chip at 0 (navigating to an object where it has no notes must not
 *    yank the radio state out from under the reader);
 *  - no `count` fn (host renders no counts — nothing to filter on) → all readings show, as before.
 * A reading empty exhibit-wide has count 0 on every object, so it never appears anywhere.
 */
export function visibleReadings(
  readings: Reading[],
  active: string | null,
  count?: (id: string | null) => number,
): Reading[] {
  if (!count) return readings;
  return readings.filter((r) => r.id === active || count(r.id) > 0);
}

/**
 * The wall text a reading-activation should raise, or `null` for silence. Silent when:
 *  - `id` is null — General notes is the BASE layer, not a Reading; it has no voice to introduce
 *    (amendment 2, thread 2806900f);
 *  - the reading is unknown (stale id — degrade, never error);
 *  - it has no text at all (neither prose nor description — nothing to say is not a dialog);
 *  - already seen this visit (`seen`). Note-targeted deep links never call this at all — the note is
 *    the destination (ExhibitView's A0 seam assigns `activeReading` directly, by design).
 */
export function wallTextFor(
  id: string | null,
  readings: Reading[],
  seen: (rid: string) => boolean,
): Reading | null {
  if (id === null) return null;
  const r = readings.find((x) => x.id === id);
  if (!r) return null;
  if (!(r.prose ?? r.description)) return null;
  return seen(id) ? null : r;
}

/** sessionStorage key — SESSION semantics ("first entry per visit"), deliberately not the
 *  localStorage the aside uses (`aside-persistence.ts` persists preference; this expires with the visit). */
export const wallTextSeenKey = (slug: string, rid: string): string => `archie:walltext:${slug}:${rid}`;
