import { describe, it, expect } from "vitest";
import { resizePanelWidth, clampWidth, stepPanelWidth, type ResizeBounds } from "./panel-resize.js";

// Dense headless coverage here is what lets ResizeDivider.svelte stay a thin projection: the sign
// of the drag (which way is "wider") is the whole subtlety, and it flips with the panel's side.

const bounds: ResizeBounds = { min: 200, max: 600 };

describe("resizePanelWidth", () => {
  it("a right-docked panel (viewer aside) SHRINKS when the divider is dragged right", () => {
    expect(resizePanelWidth(400, +50, "right", bounds)).toBe(350);
  });
  it("a right-docked panel GROWS when the divider is dragged left", () => {
    expect(resizePanelWidth(400, -50, "right", bounds)).toBe(450);
  });
  it("a left-docked panel (studio aside) GROWS when the divider is dragged right", () => {
    expect(resizePanelWidth(400, +50, "left", bounds)).toBe(450);
  });
  it("a left-docked panel SHRINKS when the divider is dragged left", () => {
    expect(resizePanelWidth(400, -50, "left", bounds)).toBe(350);
  });
  it("clamps to max", () => {
    expect(resizePanelWidth(580, +100, "left", bounds)).toBe(600);
  });
  it("clamps to min", () => {
    expect(resizePanelWidth(220, -100, "left", bounds)).toBe(200);
  });
  it("zero delta is a no-op (within bounds)", () => {
    expect(resizePanelWidth(400, 0, "right", bounds)).toBe(400);
  });
  it("a non-finite delta degrades to the clamped start width", () => {
    expect(resizePanelWidth(400, NaN, "right", bounds)).toBe(400);
    expect(resizePanelWidth(700, Infinity, "left", bounds)).toBe(600);
  });
});

describe("clampWidth", () => {
  it("passes a value already inside the band", () => {
    expect(clampWidth(350, bounds)).toBe(350);
  });
  it("clamps below min and above max", () => {
    expect(clampWidth(50, bounds)).toBe(200);
    expect(clampWidth(9999, bounds)).toBe(600);
  });
  it("non-finite ⇒ min", () => {
    expect(clampWidth(NaN, bounds)).toBe(200);
  });
  it("a degenerate min>max prefers min (never returns < min)", () => {
    expect(clampWidth(500, { min: 400, max: 300 })).toBe(400);
  });
});

describe("stepPanelWidth", () => {
  it("ArrowRight nudges the divider right — grows a left-docked panel, shrinks a right-docked one", () => {
    expect(stepPanelWidth(400, +1, 16, "left", bounds)).toBe(416);
    expect(stepPanelWidth(400, +1, 16, "right", bounds)).toBe(384);
  });
  it("ArrowLeft is the mirror", () => {
    expect(stepPanelWidth(400, -1, 16, "left", bounds)).toBe(384);
    expect(stepPanelWidth(400, -1, 16, "right", bounds)).toBe(416);
  });
  it("respects the bounds", () => {
    expect(stepPanelWidth(595, +1, 16, "left", bounds)).toBe(600);
  });
});
