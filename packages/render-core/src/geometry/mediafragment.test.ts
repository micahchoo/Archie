import { describe, it, expect } from "vitest";
import { parseMediaFragment, mediaFragmentValue } from "./mediafragment.js";

describe("parseMediaFragment", () => {
  it("parses a pixel xywh (image)", () => {
    expect(parseMediaFragment("xywh=pixel:10,20,30,40")).toEqual({ box: { x: 10, y: 20, w: 30, h: 40 }, unit: "pixel" });
  });
  it("parses a percent xywh (video frame region)", () => {
    expect(parseMediaFragment("xywh=percent:5,10,20,30")).toEqual({ box: { x: 5, y: 10, w: 20, h: 30 }, unit: "percent" });
  });
  it("defaults a unit-less xywh to pixel (W3C default)", () => {
    expect(parseMediaFragment("xywh=1,2,3,4")).toEqual({ box: { x: 1, y: 2, w: 3, h: 4 }, unit: "pixel" });
  });
  it("parses a temporal-only fragment (audio)", () => {
    expect(parseMediaFragment("t=12,48")).toEqual({ time: { start: 12, end: 48 } });
  });
  it("parses a point-in-time (no end)", () => {
    expect(parseMediaFragment("t=12")).toEqual({ time: { start: 12 } });
  });
  it("parses a SPATIOTEMPORAL fragment (video — both axes)", () => {
    expect(parseMediaFragment("t=12,48&xywh=percent:5,10,20,30")).toEqual({
      time: { start: 12, end: 48 },
      box: { x: 5, y: 10, w: 20, h: 30 },
      unit: "percent",
    });
  });
  it("is order-independent (xywh before t)", () => {
    expect(parseMediaFragment("xywh=percent:5,10,20,30&t=12,48")).toEqual({
      time: { start: 12, end: 48 },
      box: { x: 5, y: 10, w: 20, h: 30 },
      unit: "percent",
    });
  });
  it("returns {} for empty / garbage", () => {
    expect(parseMediaFragment("")).toEqual({});
    expect(parseMediaFragment("nonsense")).toEqual({});
    expect(parseMediaFragment(undefined as unknown as string)).toEqual({});
  });
  it("keeps the valid axis when the other is malformed", () => {
    expect(parseMediaFragment("t=5,9&xywh=bogus")).toEqual({ time: { start: 5, end: 9 } });
  });
});

describe("mediaFragmentValue", () => {
  it("serializes space-only (image, pixel default)", () => {
    expect(mediaFragmentValue({ box: { x: 1, y: 2, w: 3, h: 4 } })).toBe("xywh=pixel:1,2,3,4");
  });
  it("serializes time-only (audio)", () => {
    expect(mediaFragmentValue({ time: { start: 3, end: 9 } })).toBe("t=3,9");
  });
  it("serializes spatiotemporal in donor order (t then xywh)", () => {
    expect(mediaFragmentValue({ time: { start: 12, end: 48 }, box: { x: 5, y: 10, w: 20, h: 30 }, unit: "percent" }))
      .toBe("t=12,48&xywh=percent:5,10,20,30");
  });
  it("serializes a point-in-time (no end)", () => {
    expect(mediaFragmentValue({ time: { start: 7 } })).toBe("t=7");
  });
});

describe("round-trip", () => {
  it("parse(serialize(f)) preserves a spatiotemporal fragment", () => {
    const f = { time: { start: 12, end: 48 }, box: { x: 5, y: 10, w: 20, h: 30 }, unit: "percent" as const };
    expect(parseMediaFragment(mediaFragmentValue(f))).toEqual(f);
  });
  it("preserves a time-only fragment", () => {
    const f = { time: { start: 3, end: 9 } };
    expect(parseMediaFragment(mediaFragmentValue(f))).toEqual(f);
  });
  it("preserves a pixel-space fragment", () => {
    const f = { box: { x: 100, y: 200, w: 300, h: 400 }, unit: "pixel" as const };
    expect(parseMediaFragment(mediaFragmentValue(f))).toEqual(f);
  });
});
