import { describe, it, expectTypeOf, expect } from "vitest";
import { selectorBBox } from "@render/core";
import type { MountSurface } from "./index.js";

describe("@render/mount scaffold", () => {
  it("consumes @render/core across the workspace boundary (plumbing check)", () => {
    // Exercises the workspace `@render/core` import + its exports map at runtime.
    expect(selectorBBox({ type: "FragmentSelector", value: "xywh=pixel:1,2,3,4" })).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });

  it("declares the imperative surface contract (fitBounds/setSelected/destroy/onSelect)", () => {
    expectTypeOf<MountSurface>().toHaveProperty("fitBounds");
    expectTypeOf<MountSurface>().toHaveProperty("setSelected");
    expectTypeOf<MountSurface>().toHaveProperty("destroy");
    expectTypeOf<MountSurface>().toHaveProperty("onSelect");
  });
});
