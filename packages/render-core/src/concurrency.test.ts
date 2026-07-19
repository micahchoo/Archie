import { describe, it, expect } from "vitest";
import { mapLimit } from "./concurrency.js";

/** A promise whose settlement the test drives from outside — the harness for pinning WHEN each `fn`
 *  completes relative to a sibling failure. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("mapLimit", () => {
  it("runs at most `limit` fns concurrently and preserves input order", async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    const out = await mapLimit(items, 6, async (i) => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return i * 2;
    });
    expect(peak).toBeLessThanOrEqual(6);
    expect(out).toEqual(items.map((i) => i * 2)); // out[i] === fn(items[i]) regardless of completion order
  });

  // The bail-fast contract (code-review defect): once one fn rejects, the pool must stop pulling UNSTARTED
  // items — else a failed publish leaves background workers writing into exhibit subtrees after the caller
  // has moved on and (re)started, the torn-write the render-core-data-integrity rule guards.
  it("stops pulling unstarted items once one fn rejects; the first rejection propagates", async () => {
    const N = 20;
    const LIMIT = 6;
    const started: number[] = [];
    const gates = Array.from({ length: N }, () => deferred<void>());
    const items = Array.from({ length: N }, (_, i) => i);

    const run = mapLimit(items, LIMIT, async (i) => {
      started.push(i);
      await gates[i]!.promise; // park until the test releases this specific item
      return i;
    });
    run.catch(() => {}); // pre-attach so the eventual rejection is never an unhandled-rejection warning

    // The pool fills synchronously: each of the LIMIT workers pulls one item and parks on its gate before
    // any await yields, so exactly items 0..LIMIT-1 have started and nothing beyond has been pulled yet.
    expect([...started].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);

    // Fail one IN-FLIGHT item, then release the other five. Their workers, on resuming, see the failure and
    // exit WITHOUT pulling item 6 — the reject is queued before the resolves, so `failed` is set first.
    gates[2]!.reject(new Error("boom"));
    for (const i of [0, 1, 3, 4, 5]) gates[i]!.resolve();

    await expect(run).rejects.toThrow("boom"); // the first (and only) rejection surfaces to the caller

    // The pin: not a single item past the initially-started LIMIT ever ran.
    expect([...started].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(started.some((i) => i >= LIMIT)).toBe(false);
  });

  it("propagates a rejection even when fn throws `undefined` (boolean sentinel, not `failure === undefined`)", async () => {
    // Guards the fix's use of a separate `failed` flag: `throw undefined` is legal, so a `failure === undefined`
    // sentinel would swallow it. This must still reject.
    await expect(
      mapLimit([1, 2, 3], 2, async (n) => {
        if (n === 2) throw undefined;
        return n;
      }),
    ).rejects.toBeUndefined();
  });
});
