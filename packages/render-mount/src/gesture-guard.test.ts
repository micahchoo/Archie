import { describe, it, expect } from "vitest";
import { GestureGuard } from "./gesture-guard.js";

describe("GestureGuard (worklist 0.2 — public-API guard, no internals)", () => {
  it("clean create notifies", () => {
    const g = new GestureGuard();
    expect(g.onCreate("a1", false)).toBe("notify");
  });

  it("degenerate create removes, then swallows exactly the one delete echo", () => {
    const g = new GestureGuard();
    expect(g.onCreate("a1", true)).toBe("remove");
    expect(g.onDelete("a1")).toBe("swallow"); // the echo of our removeAnnotation
    expect(g.onDelete("a1")).toBe("notify"); // a LATER real delete of a same-id annotation must flow
  });

  it("a real user delete notifies (no pending echo)", () => {
    const g = new GestureGuard();
    expect(g.onDelete("a2")).toBe("notify");
  });

  it("clean update notifies", () => {
    const g = new GestureGuard();
    expect(g.onUpdate("a1", false)).toBe("notify");
  });

  it("degenerate update reverts, then swallows exactly the one update echo", () => {
    const g = new GestureGuard();
    expect(g.onUpdate("a1", true)).toBe("revert");
    expect(g.onUpdate("a1", false)).toBe("swallow"); // the restore echo (previous, good geometry)
    expect(g.onUpdate("a1", false)).toBe("notify"); // the user's next real edit must flow
  });

  it("echo bookkeeping is per-id — other annotations are unaffected", () => {
    const g = new GestureGuard();
    g.onCreate("bad", true);
    g.onUpdate("alsobad", true);
    expect(g.onDelete("good")).toBe("notify");
    expect(g.onUpdate("good", false)).toBe("notify");
    expect(g.onDelete("bad")).toBe("swallow");
    expect(g.onUpdate("alsobad", false)).toBe("swallow");
  });

  it("an id-less event never poisons the echo sets", () => {
    const g = new GestureGuard();
    expect(g.onCreate(undefined, true)).toBe("remove"); // mount can't act without an id, but decision is honest
    expect(g.onDelete(undefined)).toBe("notify");
    expect(g.onUpdate(undefined, true)).toBe("revert");
    expect(g.onUpdate(undefined, false)).toBe("notify");
  });
});
