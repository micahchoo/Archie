import { describe, it, expect } from "vitest";
import { withPoolGate, poolSizeFor, planTasks } from "./dzi-slice-pool.js";
import { dziPyramid } from "@render/core";

// The gate exists because per-call worker pools blew up under publishLibrary's real fan-out
// (~42 concurrent tileObject calls x up to 8 workers, each decoding its own ~76 MB source). Measured
// end-to-end, every pool then died and sliceToDziAuto fell back to inline for all 70 objects — with
// no user-visible error. These pin the two properties that failure depended on.
describe("withPoolGate — one pyramid slices at a time", () => {
  it("serializes concurrent callers instead of overlapping them", async () => {
    let live = 0;
    let peak = 0;
    const work = async () => {
      live++; peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return peak;
    };
    await Promise.all(Array.from({ length: 8 }, () => withPoolGate(work)));
    expect(peak).toBe(1); // never two pools in flight — that is the whole memory guarantee
  });

  it("runs callers in submission order", async () => {
    const order: number[] = [];
    await Promise.all([0, 1, 2, 3].map((i) => withPoolGate(async () => { order.push(i); })));
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it("a REJECTED call does not poison the queue for the callers behind it", async () => {
    // sliceToDziAuto catches pool failures and falls back, so a rejection here is a NORMAL event.
    // If the gate chained the rejection, one bad image would fail every later image's pooled path
    // and silently degrade the rest of the publish to the inline slicer.
    const boom = withPoolGate(async () => { throw new Error("worker died"); });
    await expect(boom).rejects.toThrow("worker died");
    await expect(withPoolGate(async () => "fine")).resolves.toBe("fine");
  });

  it("still releases the gate when the caller throws synchronously", async () => {
    await expect(withPoolGate(() => { throw new Error("sync"); })).rejects.toThrow("sync");
    await expect(withPoolGate(async () => "after")).resolves.toBe("after");
  });
});

describe("poolSizeFor — memory budgets the width, not the core count", () => {
  it("shrinks the pool for a large source even on a many-core machine", () => {
    expect(poolSizeFor(8000, 6000, 32)).toBeLessThanOrEqual(4); // 192 MB each against a 768 MB budget
    expect(poolSizeFor(512, 512, 32)).toBe(8);                  // small source → capped by POOL_MAX
    expect(poolSizeFor(8000, 6000, 1)).toBe(1);                 // never below one
  });
});

describe("planTasks — the partition that buys byte-identity", () => {
  it("splits only the top level into bands and sends every other level whole", () => {
    const pyr = dziPyramid(5000, 3800, 254, 1);
    const tasks = planTasks(pyr, 4);
    const top = pyr.levels[pyr.levels.length - 1]!;
    expect(tasks.filter((t) => t.kind === "level").map((t) => t.level.level)).not.toContain(top.level);
    const strips = tasks.filter((t) => t.kind === "strip");
    expect(strips.every((t) => t.level.level === top.level)).toBe(true);
    // The bands must tile the top level exactly — no gap, no overlap, or tiles go missing/duplicated.
    const rows = strips.flatMap((t) => Array.from({ length: t.rowTo - t.rowFrom }, (_, i) => t.rowFrom + i)).sort((a, b) => a - b);
    expect(rows).toEqual(Array.from({ length: top.rows }, (_, i) => i));
  });
});
