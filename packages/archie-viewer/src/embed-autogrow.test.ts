// embed-autogrow.ts — the PURE height-message shaping + when-to-post decisions (DIVERGENCES §5). The
// ResizeObserver/rAF/postMessage wiring in element.ts is browser-only (verified by a Playwright probe);
// the decisions that determine WHAT gets posted (and whether) are unit-tested here.
import { describe, it, expect } from "vitest";
import { EMBED_HEIGHT_MESSAGE, embedHeightMessage, heightToPost, isFramed } from "./embed-autogrow.js";

describe("embedHeightMessage — the parent-bound payload", () => {
  it("is namespaced and carries a non-negative integer height + discriminator", () => {
    expect(embedHeightMessage(640.4, "codex")).toEqual({ type: EMBED_HEIGHT_MESSAGE, height: 641, id: "codex" });
    expect(embedHeightMessage(0, "")).toEqual({ type: "archie-embed:height", height: 0, id: "" });
    expect(embedHeightMessage(-5, "x").height).toBe(0); // clamps a bogus negative to 0
  });
});

describe("heightToPost — when (and what) to post", () => {
  it("posts the ceil'd height for a grid-family view when it changed", () => {
    expect(heightToPost({ viewKind: "gallery", height: 812.2, lastPosted: null })).toBe(813);
    expect(heightToPost({ viewKind: "exhibit", height: 500, lastPosted: 480 })).toBe(500);
    expect(heightToPost({ viewKind: "empty", height: 320, lastPosted: null })).toBe(320);
  });
  it("SKIPS the reader view — a 70vh deep-zoom surface would drive a vh feedback loop", () => {
    expect(heightToPost({ viewKind: "reader", height: 900, lastPosted: 400 })).toBeNull();
  });
  it("SKIPS a non-positive height (pre-layout / detached)", () => {
    expect(heightToPost({ viewKind: "gallery", height: 0, lastPosted: null })).toBeNull();
    expect(heightToPost({ viewKind: "gallery", height: -10, lastPosted: 500 })).toBeNull();
  });
  it("SKIPS an unchanged height — coalesces ResizeObserver no-ops so pan/zoom can't spam", () => {
    expect(heightToPost({ viewKind: "gallery", height: 700, lastPosted: 700 })).toBeNull();
    expect(heightToPost({ viewKind: "gallery", height: 700.9, lastPosted: 701 })).toBeNull(); // 701 === 701
  });
});

describe("isFramed — auto-grow only applies inside an iframe", () => {
  it("true when parent differs from the window", () => {
    const parent = {} as Window;
    expect(isFramed({ parent } as unknown as Window)).toBe(true);
  });
  it("false for a top-level window (parent === self)", () => {
    const win = {} as Window;
    (win as { parent: Window }).parent = win;
    expect(isFramed(win)).toBe(false);
  });
});
