import { describe, it, expect, beforeEach, vi } from "vitest";
import { AnnotationSession, asClientId } from "@render/core";
// localStorage is stubbed (node env) — same idiom as canvas-first-use.test.ts / binding.test.ts.
import {
  othersLiveNoteCount, computeImportFreshness, freshnessBadgeText,
  loadImportFreshness, saveImportFreshness, recordImportFreshness,
} from "./import-freshness.js";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});
beforeEach(() => store.clear());

const sel = (x: number) => ({
  type: "SpecificResource" as const,
  source: "https://x.test/lib/canvas/o1",
  selector: { type: "FragmentSelector" as const, conformsTo: "http://www.w3.org/TR/media-frags/", value: `xywh=pixel:${x},0,10,10` },
});
const note = (s: AnnotationSession, x: number) =>
  s.createNote({ target: sel(x), body: [{ type: "TextualBody", value: `n${x}`, purpose: "commenting" }] });

describe("othersLiveNoteCount — others' live notes in one exhibit's log", () => {
  it("counts notes not attributed to you, deletions dropping out", () => {
    const priya = new AnnotationSession(asClientId("priya"));
    note(priya, 1); note(priya, 2);
    const me = new AnnotationSession(asClientId("me"), priya.entries);
    note(me, 3);
    expect(othersLiveNoteCount(me.entries, asClientId("me"))).toBe(2);
  });
  it("is 0 for a solo (you-only) log", () => {
    const me = new AnnotationSession(asClientId("me"));
    note(me, 1);
    expect(othersLiveNoteCount(me.entries, asClientId("me"))).toBe(0);
  });
});

describe("computeImportFreshness — pure watermark math", () => {
  it("first import (no prior baseline): establishes the baseline silently — delta 0, no badge", () => {
    expect(computeImportFreshness(undefined, 3)).toEqual({ baseline: 3, delta: 0 });
  });
  it("a later import with MORE others' notes: delta is the increase", () => {
    expect(computeImportFreshness(3, 7)).toEqual({ baseline: 7, delta: 4 });
  });
  it("a later import with the SAME or FEWER others' notes: delta floors at 0", () => {
    expect(computeImportFreshness(7, 7)).toEqual({ baseline: 7, delta: 0 });
    expect(computeImportFreshness(7, 2)).toEqual({ baseline: 2, delta: 0 });
  });
});

describe("freshnessBadgeText — the badge-render predicate", () => {
  it("renders '+N since your last import' when a watermark carries a positive delta", () => {
    expect(freshnessBadgeText({ baseline: 5, delta: 5 })).toBe("+5 since your last import");
  });
  it("is null with no watermark at all (no import has ever happened)", () => {
    expect(freshnessBadgeText(null)).toBeNull();
    expect(freshnessBadgeText(undefined)).toBeNull();
  });
  it("is null when the watermark's delta is 0 (nothing new since the last import)", () => {
    expect(freshnessBadgeText({ baseline: 5, delta: 0 })).toBeNull();
  });
});

describe("loadImportFreshness / saveImportFreshness — the localStorage watermark", () => {
  it("round-trips a stored watermark, keyed per exhibit slug", () => {
    expect(loadImportFreshness("voynich")).toBeNull();
    saveImportFreshness("voynich", { baseline: 4, delta: 4 });
    expect(loadImportFreshness("voynich")).toEqual({ baseline: 4, delta: 4 });
    expect(loadImportFreshness("other-exhibit")).toBeNull(); // a sibling slug is untouched
  });
  it("tolerates corrupt stored JSON — reads as absent, never throws", () => {
    store.set("archie.importFreshness.v1.broken", "{not json");
    expect(loadImportFreshness("broken")).toBeNull();
  });
  it("tolerates a wrong-shaped stored value — reads as absent", () => {
    store.set("archie.importFreshness.v1.wrong", JSON.stringify({ nope: true }));
    expect(loadImportFreshness("wrong")).toBeNull();
  });
});

describe("recordImportFreshness — the one production seam (read-compute-write)", () => {
  it("first import: stores the full others-count as baseline with delta 0 (no badge yet)", () => {
    const priya = new AnnotationSession(asClientId("priya"));
    note(priya, 1); note(priya, 2); note(priya, 3);
    const result = recordImportFreshness("voynich", priya.entries, asClientId("me"));
    expect(result).toEqual({ baseline: 3, delta: 0 });
    expect(loadImportFreshness("voynich")).toEqual({ baseline: 3, delta: 0 });
  });
  it("a second import layering more others' notes: delta is only the NEW ones since the stored baseline", () => {
    const priya = new AnnotationSession(asClientId("priya"));
    note(priya, 1); note(priya, 2);
    recordImportFreshness("voynich", priya.entries, asClientId("me")); // baseline=2, delta=0 (first)

    const priya2 = new AnnotationSession(asClientId("priya"), priya.entries);
    note(priya2, 3); note(priya2, 4); note(priya2, 5);
    const result = recordImportFreshness("voynich", priya2.entries, asClientId("me"));
    expect(result).toEqual({ baseline: 5, delta: 3 });
  });
  it("re-importing the SAME log again: delta drops to 0 (nothing new)", () => {
    const priya = new AnnotationSession(asClientId("priya"));
    note(priya, 1); note(priya, 2);
    recordImportFreshness("voynich", priya.entries, asClientId("me"));
    const result = recordImportFreshness("voynich", priya.entries, asClientId("me"));
    expect(result).toEqual({ baseline: 2, delta: 0 });
    expect(freshnessBadgeText(result)).toBeNull();
  });
});
