// Marginalia layout (MARGINALIA-PLAN cut B — the heart of worklist 2.1). Pure 1-D interval
// placement: each note card wants to sit beside its region's vertical position in the viewport;
// cards must not overlap; what can't fit (or whose region is off-screen) pins to a gutter with an
// overflow count. Framework-free and headless-tested — the margin component is a thin projection
// of this. Deliberately deterministic: same input, same layout (ties break by input order).

export interface MarginItem {
  id: string;
  /** The region's anchor (vertical centre of its on-screen rect), in margin-column px. */
  anchorY: number;
  /** The card's rendered height, in px. */
  height: number;
}

export interface MarginLayoutOptions {
  /** The margin column's visible height, px. */
  viewportH: number;
  /** Minimum vertical gap between cards, px. */
  gap: number;
  /** Top inset (e.g. a sticky header) — cards never start above this. Default 0. */
  minY?: number;
  /**
   * GUARANTEED-placement item (the focused card). Found the hard way (Playwright, 2026-06-11):
   * the focused card hosts the editor, the editor balloons its height, and the plain capacity
   * check then EVICTS the very card being edited — a self-eviction feedback loop. The pinned
   * item always places (its anchor clamped into the band if off-screen); the rest solve into
   * the two bands around it.
   */
  pinId?: string;
}

export interface MarginPlacement {
  id: string;
  /** The card's resolved top, px (within [minY, viewportH - height]). */
  top: number;
}

export interface MarginLayout {
  placed: MarginPlacement[];
  /** Ids whose region sits above the viewport (render as a "N more ↑" gutter chip, in order). */
  above: string[];
  /** Ids whose region sits below the viewport — or that could not fit — in order. */
  below: string[];
}

/**
 * Place margin cards beside their anchors without overlap.
 *
 * Algorithm: partition off-screen anchors to gutters → sort in-view items by anchor (stable) →
 * keep the prefix that can physically fit (rest → below gutter) → forward pass (each card at
 * `max(centredIdeal, prevBottom + gap)`) → backward relax if the chain ran past the bottom.
 * Non-finite anchors degrade to the below gutter; the function never throws.
 */
export function layoutMarginalia(items: MarginItem[], opts: MarginLayoutOptions): MarginLayout {
  const minY = opts.minY ?? 0;
  const { viewportH, gap } = opts;

  // Pinned (focused) item: place it FIRST at its clamped ideal — even with an off-screen anchor,
  // the open editor must stay reachable — then solve the two bands around it independently.
  if (opts.pinId !== undefined) {
    const pin = items.find((i) => i.id === opts.pinId);
    // No size precondition: an OVERSIZED pin (editor taller than the column) still places, clamped
    // to the top — reachability of the open editor beats band purity (its host caps/scrolls it).
    if (pin && Number.isFinite(pin.height) && pin.height >= 0) {
      const anchor = Number.isFinite(pin.anchorY) ? Math.min(Math.max(pin.anchorY, minY), viewportH) : minY;
      const top = Math.min(Math.max(anchor - pin.height / 2, minY), Math.max(viewportH - pin.height, minY));
      const rest = items.filter((i) => i.id !== pin.id);
      // In-view anchors that fall under the pinned card are CLAMPED into their band (they chain
      // against the pin), never mislabeled as gutter; off-screen/degenerate anchors keep their
      // own classification via the sub-solves.
      const clampInto = (i: MarginItem, band: "up" | "down"): MarginItem =>
        !Number.isFinite(i.anchorY) ? i
        : band === "up" ? { ...i, anchorY: Math.min(i.anchorY, Math.max(top - gap, minY)) }
        : { ...i, anchorY: Math.max(i.anchorY, Math.min(top + pin.height + gap, viewportH)) };
      const upItems = rest.filter((i) => Number.isFinite(i.anchorY) && i.anchorY <= anchor && i.anchorY >= minY).map((i) => clampInto(i, "up"));
      const downItems = rest.filter((i) => !(Number.isFinite(i.anchorY) && i.anchorY <= anchor && i.anchorY >= minY)).map((i) => clampInto(i, "down"));
      const up = layoutMarginalia(upItems, { viewportH: Math.max(top - gap, minY), gap, minY });
      const down = layoutMarginalia(downItems, { viewportH, gap, minY: Math.min(top + pin.height + gap, viewportH) });
      return {
        placed: [...up.placed, { id: pin.id, top }, ...down.placed],
        above: [...up.above, ...down.above],
        below: [...up.below, ...down.below],
      };
    }
  }

  const above: string[] = [];
  const below: string[] = [];
  const inView: MarginItem[] = [];
  for (const it of items) {
    if (!Number.isFinite(it.anchorY) || !Number.isFinite(it.height) || it.height < 0) below.push(it.id);
    else if (it.anchorY < minY) above.push(it.id);
    else if (it.anchorY > viewportH) below.push(it.id);
    else inView.push(it);
  }

  // Stable sort by anchor (ties keep input order — Array.prototype.sort is stable per spec).
  const sorted = [...inView].sort((a, b) => a.anchorY - b.anchorY);

  // Capacity: keep the longest prefix whose stacked height fits the column; overflow → below.
  const usable = viewportH - minY;
  const fits: MarginItem[] = [];
  let stacked = 0;
  for (const it of sorted) {
    const need = it.height + (fits.length > 0 ? gap : 0);
    if (usable <= 0 || stacked + need > usable) { below.push(it.id); continue; }
    stacked += need;
    fits.push(it);
  }

  // Forward pass: centre each card on its anchor, clamped; never overlap the previous card.
  const tops: number[] = [];
  for (let i = 0; i < fits.length; i++) {
    const it = fits[i]!;
    const ideal = Math.min(Math.max(it.anchorY - it.height / 2, minY), Math.max(viewportH - it.height, minY));
    const floor = i === 0 ? minY : tops[i - 1]! + fits[i - 1]!.height + gap;
    tops.push(Math.max(ideal, floor));
  }
  // Backward relax: if the chain ran past the bottom, pull it back up (capacity guarantees room).
  if (fits.length > 0) {
    const last = fits.length - 1;
    tops[last] = Math.min(tops[last]!, viewportH - fits[last]!.height);
    for (let i = last - 1; i >= 0; i--) {
      tops[i] = Math.min(tops[i]!, tops[i + 1]! - gap - fits[i]!.height);
    }
    // minY is preserved by the capacity check (total stacked ≤ usable).
  }

  return {
    placed: fits.map((it, i) => ({ id: it.id, top: tops[i]! })),
    above,
    below,
  };
}
