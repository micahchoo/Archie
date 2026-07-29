import { describe, it, expect } from "vitest";
import { visibleReadings, wallTextFor, wallTextSeenKey } from "./reading-walltext.js";
import type { Reading } from "@render/core";

const R = (id: string, extra: Partial<Reading> = {}): Reading => ({ id, name: id, ...extra });

describe("visibleReadings (amendment 1: chips only where the reading has notes)", () => {
  const readings = [R("a"), R("b"), R("c")];
  const counts = (m: Record<string, number>) => (id: string | null) => (id === null ? 9 : (m[id] ?? 0));

  it("hides zero-count readings on the current object", () => {
    expect(visibleReadings(readings, null, counts({ a: 2, b: 0, c: 1 })).map((r) => r.id)).toEqual(["a", "c"]);
  });
  it("keeps the ACTIVE reading's chip even at 0 — the radio state must not vanish under the reader", () => {
    expect(visibleReadings(readings, "b", counts({ a: 2, b: 0, c: 0 })).map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("no count fn (host renders no counts) → all readings show, as before", () => {
    expect(visibleReadings(readings, null, undefined)).toEqual(readings);
  });
  it("a reading empty exhibit-wide disappears everywhere (0 on every object)", () => {
    expect(visibleReadings(readings, null, counts({}))).toEqual([]);
  });
});

describe("wallTextFor (threshold gating; amendment 2: General notes is never wall-texted)", () => {
  const readings = [R("cipher", { prose: "The **full** voice." }), R("hoax", { description: "One line." }), R("mute")];
  const never = () => false;

  it("null (General notes / base layer) is silent — it is not a Reading", () => {
    expect(wallTextFor(null, readings, never)).toBeNull();
  });
  it("first entry to a reading with prose raises its wall text", () => {
    expect(wallTextFor("cipher", readings, never)?.id).toBe("cipher");
  });
  it("falls back to description when prose is absent", () => {
    expect(wallTextFor("hoax", readings, never)?.id).toBe("hoax");
  });
  it("a reading with nothing to say (no prose, no description) is silent, not an empty dialog", () => {
    expect(wallTextFor("mute", readings, never)).toBeNull();
  });
  it("seen this visit → silent (switching back is instant)", () => {
    expect(wallTextFor("cipher", readings, (rid) => rid === "cipher")).toBeNull();
  });
  it("unknown id (stale address) degrades to silence, never an error", () => {
    expect(wallTextFor("gone", readings, never)).toBeNull();
  });
});

describe("wallTextSeenKey", () => {
  it("scopes by slug AND reading id", () => {
    expect(wallTextSeenKey("voynich", "cipher")).toBe("archie:walltext:voynich:cipher");
    expect(wallTextSeenKey("voynich", "cipher")).not.toBe(wallTextSeenKey("herbal", "cipher"));
  });
});
