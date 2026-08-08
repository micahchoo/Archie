import { describe, it, expect, vi } from "vitest";
import { createCanvasController, createDotLayer, type DotLayerSolved } from "./controller.js";
import type { MountSurface, ScreenRect, SelectionId } from "@render/mount";

// The adapter's binding LOGIC (the spike module-1 inversion), as plain TS so it is testable
// with a mock MountSurface — no real OSD. Canvas.svelte is a thin reactive shell over this.

function mockSurface() {
  let emit: (id: SelectionId | null) => void = () => {};
  const setSelected = vi.fn<(id: SelectionId | null) => void>();
  const fitBounds = vi.fn<(id: SelectionId) => void>();
  const destroy = vi.fn();
  const noop = (): (() => void) => () => {};
  const surface: MountSurface = {
    setAnnotations: vi.fn(),
    setStyle: vi.fn(),
    setSelected,
    fitBounds,
    fitRegion: vi.fn(),
    setFrame: vi.fn(),
    setNavigatorDots: vi.fn(),
    setDrawingEnabled: vi.fn(),
    setDrawingTool: vi.fn(),
    markerScreenRect: vi.fn(() => null),
    markerScreenRects: vi.fn(() => ({})),
    onViewportChange: noop,
    getZoomRatio: vi.fn(() => 1),
    destroy,
    onSelect: (cb) => {
      emit = cb;
      return () => {
        emit = () => {};
      };
    },
    onCreate: noop,
    onUpdate: noop,
    onDelete: noop,
  };
  return { surface, setSelected, fitBounds, destroy, userSelects: (id: SelectionId | null) => emit(id) };
}

describe("createCanvasController — selection binding (the inversion)", () => {
  it("programmatic select drives the surface: setSelected + fitBounds, and updates state", () => {
    const m = mockSurface();
    const c = createCanvasController(m.surface);
    c.select("note-a");
    expect(m.setSelected).toHaveBeenCalledWith("note-a");
    expect(m.fitBounds).toHaveBeenCalledWith("note-a");
    expect(c.selected).toBe("note-a");
  });

  it("clearing selection (null) calls setSelected(null) but NOT fitBounds", () => {
    const m = mockSurface();
    const c = createCanvasController(m.surface);
    c.select(null);
    expect(m.setSelected).toHaveBeenCalledWith(null);
    expect(m.fitBounds).not.toHaveBeenCalled();
    expect(c.selected).toBeNull();
  });

  it("user selection ON the surface flows IN via onSelect and updates state (the inversion)", () => {
    const m = mockSurface();
    const c = createCanvasController(m.surface);
    m.userSelects("note-b");
    expect(c.selected).toBe("note-b");
    // A user click must NOT re-drive the surface (no feedback loop), and without the reader
    // option it must not move the camera either (Studio's editing default).
    expect(m.setSelected).not.toHaveBeenCalled();
    expect(m.fitBounds).not.toHaveBeenCalled();
  });

  it("notifies onSelectChange subscribers for both programmatic and user selection", () => {
    const m = mockSurface();
    const c = createCanvasController(m.surface);
    const seen: Array<SelectionId | null> = [];
    const unsub = c.onSelectChange((id) => seen.push(id));
    c.select("x");
    m.userSelects("y");
    unsub();
    m.userSelects("z"); // after unsub — not seen
    expect(seen).toEqual(["x", "y"]);
  });

  it("destroy tears down the surface and stops further inbound selection", () => {
    const m = mockSurface();
    const c = createCanvasController(m.surface);
    const seen: Array<SelectionId | null> = [];
    c.onSelectChange((id) => seen.push(id));
    c.destroy();
    expect(m.destroy).toHaveBeenCalledOnce();
    m.userSelects("late"); // surface listener was unsubscribed
    expect(seen).toEqual([]);
  });
});

describe("zoomOnSurfaceSelect (reader UX) — a marker click zooms, without the feedback loop", () => {
  it("fitBounds fires on user selection, setSelected still does not", () => {
    const m = mockSurface();
    createCanvasController(m.surface, { zoomOnSurfaceSelect: true });
    m.userSelects("note-z");
    expect(m.fitBounds).toHaveBeenCalledWith("note-z");
    expect(m.setSelected).not.toHaveBeenCalled();
  });
  it("deselect (null) never zooms", () => {
    const m = mockSurface();
    createCanvasController(m.surface, { zoomOnSurfaceSelect: true });
    m.userSelects(null);
    expect(m.fitBounds).not.toHaveBeenCalled();
  });
});

describe("createDotLayer — the far-band dot solver (Archie-c1d9), headless", () => {
  // The layer solves against the SAME MountSurface seam (getZoomRatio + markerScreenRects) with an
  // injected frame scheduler, so the rAF throttle is unit-testable without requestAnimationFrame.
  // zoomBand thresholds (render-core): ≤1.25 = far, ≤4 = mid, beyond = near.
  const RECT: ScreenRect = { left: 1, top: 2, right: 9, bottom: 8 };

  function makeScheduler() {
    let pending: (() => void)[] = [];
    return {
      scheduleFrame: (cb: () => void) => {
        pending.push(cb);
        return () => {
          pending = pending.filter((c) => c !== cb);
        };
      },
      flush: () => {
        const q = pending;
        pending = [];
        q.forEach((cb) => cb());
      },
      count: () => pending.length,
    };
  }
  function dotSurface(ratio: number, rects: Record<string, ScreenRect | null> = {}) {
    const markerScreenRects = vi.fn(() => rects);
    const getZoomRatio = vi.fn(() => ratio);
    return { markerScreenRects, getZoomRatio };
  }

  it("solves the far band: band + per-dot rects straight from markerScreenRects", () => {
    const sched = makeScheduler();
    const surface = dotSurface(1, { a: RECT, b: null });
    const solved: DotLayerSolved[] = [];
    const layer = createDotLayer(surface, () => [{ id: "a" }, { id: "b" }], { scheduleFrame: sched.scheduleFrame });
    layer.onSolve((s) => solved.push(s));
    layer.requestSolve();
    expect(solved).toEqual([]); // throttled: nothing until the frame runs
    sched.flush();
    expect(surface.markerScreenRects).toHaveBeenCalledWith(["a", "b"]);
    expect(solved).toEqual([{ band: "far", rects: { a: RECT, b: null } }]);
  });

  it("is rAF-throttled: a pending solve swallows further requests (one solve per frame)", () => {
    const sched = makeScheduler();
    const surface = dotSurface(1, { a: RECT });
    const layer = createDotLayer(surface, () => [{ id: "a" }], { scheduleFrame: sched.scheduleFrame });
    layer.requestSolve();
    layer.requestSolve();
    layer.requestSolve();
    expect(sched.count()).toBe(1);
    sched.flush();
    expect(surface.markerScreenRects).toHaveBeenCalledTimes(1);
  });

  it("off-band: flips the gate but SKIPS the rect pass (stale rects ride along, hidden)", () => {
    const sched = makeScheduler();
    const surface = dotSurface(2, { a: RECT }); // ratio 2 → mid band
    const solved: DotLayerSolved[] = [];
    const layer = createDotLayer(surface, () => [{ id: "a" }], { scheduleFrame: sched.scheduleFrame });
    layer.onSolve((s) => solved.push(s));
    layer.requestSolve();
    sched.flush();
    expect(solved).toEqual([{ band: "mid", rects: {} }]); // band solved, rects NOT refreshed
    expect(surface.markerScreenRects).not.toHaveBeenCalled();
  });

  it("returns to far: the rect pass runs again on the next solve", () => {
    // Band transitions are re-read every solve — leaving AND re-entering far must both be observed.
    const sched = makeScheduler();
    const markerScreenRects = vi.fn(() => ({ a: RECT }));
    const getZoomRatio = vi.fn(() => 1);
    const surface = { markerScreenRects, getZoomRatio };
    const layer = createDotLayer(surface, () => [{ id: "a" }], { scheduleFrame: sched.scheduleFrame });
    layer.requestSolve();
    sched.flush();
    getZoomRatio.mockReturnValue(2);
    layer.requestSolve();
    sched.flush();
    expect(markerScreenRects).toHaveBeenCalledTimes(1); // the mid solve skipped the rect pass
    getZoomRatio.mockReturnValue(1);
    layer.requestSolve();
    sched.flush();
    expect(markerScreenRects).toHaveBeenCalledTimes(2); // back at far: solved again
  });

  it("empty/undefined dots schedule nothing", () => {
    const sched = makeScheduler();
    const surface = dotSurface(1);
    const layer = createDotLayer(surface, () => [], { scheduleFrame: sched.scheduleFrame });
    layer.requestSolve();
    expect(sched.count()).toBe(0);
    const layer2 = createDotLayer(surface, () => undefined, { scheduleFrame: sched.scheduleFrame });
    layer2.requestSolve();
    expect(sched.count()).toBe(0);
  });

  it("re-reads dots at FRAME time — a set that changed between request and paint wins", () => {
    const sched = makeScheduler();
    const surface = dotSurface(1);
    let dots = [{ id: "a" }];
    const layer = createDotLayer(surface, () => dots, { scheduleFrame: sched.scheduleFrame });
    layer.requestSolve();
    dots = [{ id: "b" }]; // the prop changed before the frame ran
    sched.flush();
    expect(surface.markerScreenRects).toHaveBeenCalledWith(["b"]);
  });

  it("destroy cancels the pending frame and stops notifications", () => {
    const sched = makeScheduler();
    const surface = dotSurface(1);
    const solved: DotLayerSolved[] = [];
    const layer = createDotLayer(surface, () => [{ id: "a" }], { scheduleFrame: sched.scheduleFrame });
    layer.onSolve((s) => solved.push(s));
    layer.requestSolve();
    layer.destroy();
    sched.flush();
    expect(solved).toEqual([]);
    expect(surface.markerScreenRects).not.toHaveBeenCalled();
  });

  it("unsubscribe stops notifications", () => {
    const sched = makeScheduler();
    const surface = dotSurface(1, { a: RECT });
    const solved: DotLayerSolved[] = [];
    const layer = createDotLayer(surface, () => [{ id: "a" }], { scheduleFrame: sched.scheduleFrame });
    const unsub = layer.onSolve((s) => solved.push(s));
    unsub();
    layer.requestSolve();
    sched.flush();
    expect(solved).toEqual([]);
  });
});
