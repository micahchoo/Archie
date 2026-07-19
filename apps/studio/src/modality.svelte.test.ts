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
 *  action.destroy) calls releaseScrim, plus a spy restore. Lets a test drive the same present→close→
 *  release lifecycle the Svelte action produces, without a DOM. */
function fakeSurface(label: string) {
  const id = nextModalityId();
  const restore = vi.fn();
  const surface = {
    id,
    label,
    open: true,
    restore,
    onClose: () => {
      surface.open = false;
      releaseScrim(id); // the real action's destroy() runs on unmount
    },
  };
  return surface;
}

describe("modality — single-scrim invariant", () => {
  it("holds no surface initially", () => {
    expect(modality.hasScrim).toBe(false);
    expect(modality.hasFloater).toBe(false);
  });

  it("presenting a second surface REPLACES the first (closes it)", () => {
    const a = fakeSurface("a");
    const b = fakeSurface("b");
    presentScrim({ id: a.id, onClose: a.onClose, restore: a.restore });
    expect(modality.hasScrim).toBe(true);

    presentScrim({ id: b.id, onClose: b.onClose, restore: b.restore });
    // A was closed by the replace; B is now the one scrimmed surface.
    expect(a.open).toBe(false);
    expect(b.open).toBe(true);
    expect(modality.hasScrim).toBe(true);
  });

  it("re-presenting the SAME id (e.g. action update) does not close itself", () => {
    const a = fakeSurface("a");
    presentScrim({ id: a.id, onClose: a.onClose, restore: a.restore });
    presentScrim({ id: a.id, onClose: a.onClose, restore: a.restore });
    expect(a.open).toBe(true);
    expect(modality.hasScrim).toBe(true);
  });
});

describe("modality — focus return", () => {
  it("restores focus to the opener when the surface is dismissed", () => {
    const a = fakeSurface("a");
    presentScrim({ id: a.id, onClose: a.onClose, restore: a.restore });
    releaseScrim(a.id);
    expect(a.restore).toHaveBeenCalledTimes(1);
    expect(modality.hasScrim).toBe(false);
  });

  it("does NOT restore a replaced surface's focus (the replacer owns focus)", () => {
    const a = fakeSurface("a");
    const b = fakeSurface("b");
    presentScrim({ id: a.id, onClose: a.onClose, restore: a.restore });
    presentScrim({ id: b.id, onClose: b.onClose, restore: b.restore });
    // Replacing A already ran A's onClose → releaseScrim(a) — but A was no longer current, so no restore.
    expect(a.restore).not.toHaveBeenCalled();
    expect(modality.hasScrim).toBe(true);
  });

  it("a replacement inherits the ORIGINAL opener's restore, so dismissing it returns focus there", () => {
    const a = fakeSurface("a"); // opened from the page
    const b = fakeSurface("b"); // opened from inside A (replaces it)
    presentScrim({ id: a.id, onClose: a.onClose, restore: a.restore });
    presentScrim({ id: b.id, onClose: b.onClose, restore: b.restore });
    dismissScrim(); // closes B
    // B's own restore is never used; A's opener (carried forward) is where focus returns.
    expect(b.restore).not.toHaveBeenCalled();
    expect(a.restore).toHaveBeenCalledTimes(1);
    expect(modality.hasScrim).toBe(false);
  });
});

describe("modality — Esc ladder", () => {
  it("closes the topmost floater before the scrimmed surface", () => {
    const a = fakeSurface("a");
    const floaterClose = vi.fn();
    presentScrim({ id: a.id, onClose: a.onClose, restore: a.restore });
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
