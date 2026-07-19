import { describe, it, expect, beforeEach, vi } from "vitest";
// The modality state-machine core is DOM-free by design (restore is a callback, not an element), so the
// single-scrim replace semantics, focus-return targeting, and the Esc ladder order are all exercised
// headlessly here — the DOM glue (scrimmed/trapFocus/floating actions) is left to manual smoke, matching
// the repo's "Svelte shell needs manual smoke" split (vitest.config.ts).
import {
  presentScrim,
  releaseScrim,
  registerFloater,
  handleEsc,
  dismissScrim,
  modality,
  nextModalityId,
  _resetModalityForTests,
} from "./modality.svelte";

beforeEach(() => _resetModalityForTests());

/** A fake surface: an id, an onClose that flips a local `open` bool AND (mimicking the real unmount →
 *  action.destroy) calls releaseScrim, plus a spy restore. Optionally carries an `opener` token and a
 *  `contains` predicate for its panel `node`, so a test can model "opened from inside this surface" vs
 *  "opened from the page" — the axis the focus-return inheritance rule turns on. All DOM-free. */
function fakeSurface(
  label: string,
  opts: { opener?: unknown; contains?: (el: unknown) => boolean } = {},
) {
  const id = nextModalityId();
  const restore = vi.fn();
  const surface = {
    id,
    label,
    open: true,
    restore,
    opener: opts.opener ?? null,
    node: { contains: opts.contains ?? (() => false) },
    onClose: () => {
      surface.open = false;
      releaseScrim(id); // the real action's destroy() runs on unmount
    },
  };
  return surface;
}

/** Present a fake surface with all its handle fields — the shape the `scrimmed` action passes. */
function present(su: ReturnType<typeof fakeSurface>) {
  presentScrim({ id: su.id, onClose: su.onClose, restore: su.restore, node: su.node, opener: su.opener });
}

describe("modality — single-scrim invariant", () => {
  it("holds no surface initially", () => {
    expect(modality.hasScrim).toBe(false);
    expect(modality.hasFloater).toBe(false);
  });

  it("presenting a second surface REPLACES the first (closes it)", () => {
    const a = fakeSurface("a");
    const b = fakeSurface("b");
    present(a);
    expect(modality.hasScrim).toBe(true);

    present(b);
    // A was closed by the replace; B is now the one scrimmed surface.
    expect(a.open).toBe(false);
    expect(b.open).toBe(true);
    expect(modality.hasScrim).toBe(true);
  });

  it("re-presenting the SAME id (e.g. action update) does not close itself", () => {
    const a = fakeSurface("a");
    present(a);
    present(a);
    expect(a.open).toBe(true);
    expect(modality.hasScrim).toBe(true);
  });
});

describe("modality — focus return", () => {
  it("restores focus to the opener when the surface is dismissed", () => {
    const a = fakeSurface("a");
    present(a);
    releaseScrim(a.id);
    expect(a.restore).toHaveBeenCalledTimes(1);
    expect(modality.hasScrim).toBe(false);
  });

  it("does NOT restore a replaced surface's focus (the replacer owns focus)", () => {
    const a = fakeSurface("a");
    const b = fakeSurface("b");
    present(a);
    present(b);
    // Replacing A already ran A's onClose → releaseScrim(a) — but A was no longer current, so no restore.
    expect(a.restore).not.toHaveBeenCalled();
    expect(modality.hasScrim).toBe(true);
  });

  it("a replacement opened from INSIDE the surface inherits its opener (return there on close)", () => {
    const bOpener = { tag: "control-inside-a" };
    // A's opener is a page control; A's panel CONTAINS B's opener (B was opened from a button in A).
    const a = fakeSurface("a", { opener: { tag: "page-a" }, contains: (el) => el === bOpener });
    const b = fakeSurface("b", { opener: bOpener });
    present(a);
    present(b);
    dismissScrim(); // closes B
    // B's own opener is about to unmount, so it inherited A's restore; focus returns to A's opener.
    expect(b.restore).not.toHaveBeenCalled();
    expect(a.restore).toHaveBeenCalledTimes(1);
    expect(modality.hasScrim).toBe(false);
  });

  it("a replacement opened from the PAGE keeps its OWN opener (return to what was clicked)", () => {
    // Repro of the review's SHOULD-FIX 1: rights drawer open (A) → page-level 'New exhibit' opens the
    // dialog (B, opener NOT inside A) → close B → focus must land on 'New exhibit', not the drawer's
    // Details opener (word + ✎ now — decision Archie-3e0a retired the ⓘ this comment used to name).
    const a = fakeSurface("a", { opener: { tag: "drawer-opener-details" }, contains: () => false });
    const b = fakeSurface("b", { opener: { tag: "new-exhibit-cell" } });
    present(a);
    present(b);
    dismissScrim(); // closes B
    expect(a.restore).not.toHaveBeenCalled();
    expect(b.restore).toHaveBeenCalledTimes(1);
    expect(modality.hasScrim).toBe(false);
  });
});

describe("modality — Esc ladder", () => {
  it("closes the topmost floater before the scrimmed surface", () => {
    const a = fakeSurface("a");
    const floaterClose = vi.fn();
    present(a);
    const unregister = registerFloater({ id: nextModalityId(), close: floaterClose });

    // First Esc closes the floater, not the surface.
    expect(handleEsc()).toBe(true);
    expect(floaterClose).toHaveBeenCalledTimes(1);
    expect(a.open).toBe(true);

    unregister(); // the floater's own destroy on close
    // Second Esc now closes the scrimmed surface.
    expect(handleEsc()).toBe(true);
    expect(a.open).toBe(false);
  });

  it("returns false when nothing is open (so App falls through to the page-level ladder)", () => {
    expect(handleEsc()).toBe(false);
  });

  it("tracks floater presence and unregistration", () => {
    const unregister = registerFloater({ id: nextModalityId(), close: vi.fn() });
    expect(modality.hasFloater).toBe(true);
    unregister();
    expect(modality.hasFloater).toBe(false);
  });
});
