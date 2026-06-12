import { describe, it, expect } from "vitest";
import { layoutMarginalia, type MarginItem } from "./marginalia.js";

// MARGINALIA-PLAN cut B: the solver is the heart of worklist 2.1 — dense headless coverage here
// is what lets the margin component stay a thin projection.

const item = (id: string, anchorY: number, height = 40): MarginItem => ({ id, anchorY, height });
const opts = { viewportH: 600, gap: 8 };

describe("layoutMarginalia — placement", () => {
  it("a single card centres on its anchor", () => {
    const r = layoutMarginalia([item("a", 300)], opts);
    expect(r.placed).toEqual([{ id: "a", top: 280 }]); // 300 - 40/2
    expect(r.above).toEqual([]);
    expect(r.below).toEqual([]);
  });

  it("a single card clamps to the column edges", () => {
    expect(layoutMarginalia([item("top", 5)], opts).placed[0]!.top).toBe(0);
    expect(layoutMarginalia([item("bot", 595)], opts).placed[0]!.top).toBe(560); // 600 - 40
  });

  it("non-overlapping cards all sit at their ideal centres", () => {
    const r = layoutMarginalia([item("a", 100), item("b", 300), item("c", 500)], opts);
    expect(r.placed.map((p) => p.top)).toEqual([80, 280, 480]);
  });

  it("an overlap chain pushes down, preserving anchor order and the gap", () => {
    const r = layoutMarginalia([item("a", 100), item("b", 110), item("c", 120)], opts);
    const [a, b, c] = r.placed;
    expect(a!.top).toBe(80);
    expect(b!.top).toBe(a!.top + 40 + 8);
    expect(c!.top).toBe(b!.top + 40 + 8);
  });

  it("a chain that runs past the bottom relaxes back up (never overflows the column)", () => {
    const r = layoutMarginalia([item("a", 560), item("b", 570), item("c", 580)], opts);
    const [a, b, c] = r.placed;
    expect(c!.top).toBe(560); // clamped to the bottom
    expect(b!.top).toBe(c!.top - 8 - 40);
    expect(a!.top).toBe(b!.top - 8 - 40);
    expect(a!.top).toBeGreaterThanOrEqual(0);
  });

  it("input order breaks anchor ties deterministically", () => {
    const r1 = layoutMarginalia([item("x", 200), item("y", 200)], opts);
    const r2 = layoutMarginalia([item("x", 200), item("y", 200)], opts);
    expect(r1.placed.map((p) => p.id)).toEqual(["x", "y"]);
    expect(r1).toEqual(r2);
  });

  it("respects minY (sticky header inset): an in-view anchor's card never starts above it", () => {
    const r = layoutMarginalia([item("a", 65)], { ...opts, minY: 60 }); // ideal 45 → clamped to 60
    expect(r.placed[0]!.top).toBe(60);
  });
});

describe("layoutMarginalia — gutters & overflow", () => {
  it("off-screen anchors pin to the right gutters, in order", () => {
    const r = layoutMarginalia([item("up", -50), item("in", 300), item("down", 700), item("up2", -10)], opts);
    expect(r.above).toEqual(["up", "up2"]);
    expect(r.below).toEqual(["down"]);
    expect(r.placed.map((p) => p.id)).toEqual(["in"]);
  });

  it("anchors above minY count as above (not squeezed in)", () => {
    const r = layoutMarginalia([item("a", 30)], { ...opts, minY: 60 });
    expect(r.above).toEqual(["a"]);
    expect(r.placed).toEqual([]);
  });

  it("cards beyond column capacity overflow to below, by anchor order", () => {
    // 600px column, 100px cards + 8 gap → 5 fit (540 + 4×8 = 572), the 6th and 7th do not.
    const many = Array.from({ length: 7 }, (_, i) => item(`n${i}`, 50 + i * 10, 100));
    const r = layoutMarginalia(many, opts);
    expect(r.placed).toHaveLength(5);
    expect(r.below).toEqual(["n5", "n6"]);
  });

  it("a zero/negative-height viewport places nothing and loses nothing", () => {
    const r = layoutMarginalia([item("a", 0), item("b", 10)], { viewportH: 0, gap: 8 });
    expect(r.placed).toEqual([]);
    expect(r.above.length + r.below.length).toBe(2);
  });

  it("degenerate items (NaN anchor, negative height) degrade to below — never throw", () => {
    const r = layoutMarginalia([item("nan", NaN), { id: "neg", anchorY: 100, height: -5 }, item("ok", 300)], opts);
    expect(r.below).toEqual(expect.arrayContaining(["nan", "neg"]));
    expect(r.placed.map((p) => p.id)).toEqual(["ok"]);
  });

  it("empty input yields an empty layout", () => {
    expect(layoutMarginalia([], opts)).toEqual({ placed: [], above: [], below: [] });
  });
});

describe("layoutMarginalia — pinned (focused) item: no self-eviction", () => {
  it("a tall pinned card ALWAYS places, even when capacity would evict it", () => {
    // The Playwright-found bug: 3 cards of 100px fit a 350px column, but the focused card's open
    // editor makes it 400px — the plain capacity check evicted the card being edited.
    const its = [item("a", 60, 100), item("b", 170, 400), item("c", 280, 100)];
    const r = layoutMarginalia(its, { viewportH: 600, gap: 8, pinId: "b" });
    expect(r.placed.map((p) => p.id)).toContain("b");
    const b = r.placed.find((p) => p.id === "b")!;
    expect(b.top).toBeGreaterThanOrEqual(0);
    expect(b.top + 400).toBeLessThanOrEqual(600);
  });

  it("neighbours chain around the pinned card without overlap", () => {
    const its = [item("a", 200, 40), item("pin", 210, 200), item("c", 220, 40)];
    const r = layoutMarginalia(its, { ...opts, pinId: "pin" });
    const tops = Object.fromEntries(r.placed.map((p) => [p.id, p.top]));
    expect(tops["pin"]).toBeDefined();
    if ("a" in tops) expect(tops["a"]! + 40 + 8).toBeLessThanOrEqual(tops["pin"]! + 0.001);
    if ("c" in tops) expect(tops["c"]!).toBeGreaterThanOrEqual(tops["pin"]! + 200 + 8 - 0.001);
  });

  it("a pinned card with an OFF-SCREEN anchor is pulled into view (the editor stays reachable)", () => {
    const r = layoutMarginalia([item("pin", -500, 120), item("x", 300, 40)], { ...opts, pinId: "pin" });
    const pin = r.placed.find((p) => p.id === "pin");
    expect(pin).toBeDefined();
    expect(pin!.top).toBeGreaterThanOrEqual(0);
  });

  it("pinId for an absent item degrades to the plain solve", () => {
    const plain = layoutMarginalia([item("a", 100)], opts);
    expect(layoutMarginalia([item("a", 100)], { ...opts, pinId: "ghost" })).toEqual(plain);
  });

  it("an OVERSIZED pin still places, clamped to the top (editor reachability beats band purity)", () => {
    const r = layoutMarginalia([item("a", 100, 9999), item("b", 300, 40)], { ...opts, pinId: "a" });
    const pin = r.placed.find((p) => p.id === "a");
    expect(pin).toBeDefined();
    expect(pin!.top).toBe(0);
    expect(r.below).toContain("b"); // no room beneath an oversized pin — neighbour gutters honestly
  });
});
