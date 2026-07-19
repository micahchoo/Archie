// Marginalia direction C (density clusters) — pure clustering + density logic (Archie-dff3).
//
// The reverted 2026-06-11 presentation was an always-on floating column of full note cards. The
// engine that placed them survives (@render/core `layoutMarginalia`, the mount `markerScreenRects`
// stream). Direction C rebuilds the PRESENTATION as a near-invisible rail: notes whose on-screen
// regions sit near each other MERGE into one counted chip, and a faint heat band marks where notes
// pile up. This module is the framework-free heart — single-linkage clustering over anchor Y plus
// the density gate that keeps the rail near-invisible until an exhibit is actually crowded. It is
// the direct analogue of the prototype's `cluster()` (prototypes/marginalia-presentation/
// c-density-clusters.html), taken to screen-space px and headless-tested.
//
// Coordinate space: `anchorY` is the vertical CENTRE of a note's on-screen region rect, in rail px
// (the caller subtracts the rail box top from the Canvas `onmarkerrects` value). A note whose region
// is off-screen / unresolvable arrives with a non-finite anchorY and is dropped from clustering — a
// tick can't sit beside a region that isn't on screen. Deterministic: same input, same output; ties
// break by input order (Array.prototype.sort is stable per spec).

export interface ClusterInput {
  id: string;
  /** Vertical centre of the note's on-screen region, in rail px. NaN when off-screen/unresolvable. */
  anchorY: number;
}

export interface MarginCluster {
  /** Stable cluster id — `c:` + the first (topmost) member's id. */
  id: string;
  /** Member note ids, in ascending anchorY order. */
  ids: string[];
  /** Centroid anchorY (mean of member anchors), in rail px — where the chip wants to sit. */
  anchorY: number;
  /** Vertical extent the cluster's members span, in rail px (the heat band's top/bottom). */
  top: number;
  bottom: number;
}

/**
 * Below this note count the rail shows NO cluster chrome — near-invisible ticks only. Direction C's
 * bet is CROWDING (aggregation + a density signal), so a 2-note exhibit gets nothing to look at; the
 * heat band and counted chips earn their visual weight only once notes actually pile up. Governing
 * constraint of the ticket: "no cluster chrome for 2 notes."
 */
export const CLUSTER_DENSITY_MIN = 4;

/**
 * Default single-linkage merge distance, in rail px. Two notes merge when their on-screen anchors
 * are closer than a compact chip is tall — i.e. closer than they could be drawn as separate rows.
 * The rail overrides this with its measured chip height; this is the pre-measure fallback.
 */
export const CLUSTER_THRESHOLD_PX = 44;

export type MarginaliaDensity = "sparse" | "dense";

/**
 * The rail's disclosure gate. `sparse` → near-invisible (ticks only, chips on pointer intent);
 * `dense` → the heat band + counted chips are worth their weight. Purely a function of note count.
 */
export function marginaliaDensity(noteCount: number, min: number = CLUSTER_DENSITY_MIN): MarginaliaDensity {
  return noteCount >= min ? "dense" : "sparse";
}

/**
 * Single-linkage cluster over anchor Y. Sort by anchor; start a new cluster whenever the gap to the
 * previous note exceeds `threshold`. Non-finite anchors are dropped (an off-screen region has no
 * place on the rail). Never throws; returns clusters top-to-bottom.
 */
export function clusterMarginalia(
  items: ClusterInput[],
  threshold: number = CLUSTER_THRESHOLD_PX,
): MarginCluster[] {
  const placeable = items.filter((i) => Number.isFinite(i.anchorY));
  // Stable sort by anchor (ties keep input order).
  const sorted = [...placeable].sort((a, b) => a.anchorY - b.anchorY);

  const groups: ClusterInput[][] = [];
  let cur: ClusterInput[] | null = null;
  for (const it of sorted) {
    if (cur && it.anchorY - cur[cur.length - 1]!.anchorY <= threshold) cur.push(it);
    else { cur = [it]; groups.push(cur); }
  }

  return groups.map((members) => {
    const anchorY = members.reduce((s, m) => s + m.anchorY, 0) / members.length;
    return {
      id: `c:${members[0]!.id}`,
      ids: members.map((m) => m.id),
      anchorY,
      top: members[0]!.anchorY,
      bottom: members[members.length - 1]!.anchorY,
    };
  });
}

/**
 * Heat-band opacity for a cluster of `count` notes — more notes, darker band, capped so it never
 * becomes a solid bar competing with the image. Mirrors the prototype's `heatColor` ramp.
 */
export function heatOpacity(count: number): number {
  return Math.min(0.14 + count * 0.16, 0.6);
}
