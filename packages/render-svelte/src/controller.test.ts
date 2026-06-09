import { describe, it, expect, vi } from "vitest";
import { createCanvasController } from "./controller.js";
import type { MountSurface, SelectionId } from "@render/mount";

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
    setDrawingEnabled: vi.fn(),
    setDrawingTool: vi.fn(),
    markerScreenRect: vi.fn(() => null),
    onViewportChange: noop,
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
    // A user click must NOT re-drive the surface (no feedback loop).
    expect(m.setSelected).not.toHaveBeenCalled();
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
