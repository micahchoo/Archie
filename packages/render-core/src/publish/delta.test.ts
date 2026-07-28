import { describe, it, expect } from "vitest";
import { computeDelta } from "./delta.js";
import type { FileContent } from "./ghpages.js";

const text = (s: string): FileContent => ({ text: s });
const b64 = (s: string): FileContent => ({ base64: s });

describe("computeDelta — Archie-c85f: does an unchanged file come out byte-identical?", () => {
  it("identical maps: everything unchanged, nothing added/removed/changed", () => {
    const prev = { "a.json": text("{}"), "b.jpg": b64("AAA") };
    const next = { "a.json": text("{}"), "b.jpg": b64("AAA") };
    expect(computeDelta(prev, next)).toEqual({ added: [], removed: [], changed: [], unchanged: ["a.json", "b.jpg"] });
  });

  it("a text file's content differing is CHANGED, not unchanged", () => {
    const prev = { "a.json": text('{"v":1}') };
    const next = { "a.json": text('{"v":2}') };
    expect(computeDelta(prev, next)).toEqual({ added: [], removed: [], changed: ["a.json"], unchanged: [] });
  });

  it("a new path is ADDED", () => {
    const prev = { "a.json": text("{}") };
    const next = { "a.json": text("{}"), "c/manifest.json": text("{}") };
    expect(computeDelta(prev, next)).toEqual({ added: ["c/manifest.json"], removed: [], changed: [], unchanged: ["a.json"] });
  });

  it("a path missing from next is REMOVED — rclone sync would delete it", () => {
    const prev = { "a.json": text("{}"), "stale/manifest.json": text("{}") };
    const next = { "a.json": text("{}") };
    expect(computeDelta(prev, next)).toEqual({ added: [], removed: ["stale/manifest.json"], changed: [], unchanged: ["a.json"] });
  });

  it("same path, prev binary vs next text at the SAME string value is CHANGED (representation flip), never a false unchanged", () => {
    // Regression guard for the encodedOf tag: without the t:/b: prefix, base64("AAA") happening to
    // equal text("AAA") would report unchanged — silently wrong (rclone would skip a real content change).
    const prev = { "x": b64("AAA") };
    const next = { "x": text("AAA") };
    expect(computeDelta(prev, next).changed).toEqual(["x"]);
    expect(computeDelta(prev, next).unchanged).toEqual([]);
  });

  it("a full library republish with ONE exhibit edited: only that exhibit's files + library-global projections change", () => {
    // Mirrors publishLibrary's real shape: per-exhibit files under `{slug}/...`, plus always-rewritten
    // library-global projections (collection.json, exhibits.json, images.json, sitemap.*, index.html).
    const prev: Record<string, FileContent> = {
      "collection.json": text("v1"),
      "exhibits.json": text("v1"),
      "images.json": text("v1"),
      "sitemap.txt": text("v1"),
      "sitemap.xml": text("v1"),
      "index.html": text("v1"),
      "archie.json": text("g1"),
      "a/manifest.json": text("a-v1"),
      "a/canvas/o1/annotations.json": text("a-notes-v1"),
      "b/manifest.json": text("b-v1"),
      "b/canvas/o1/annotations.json": text("b-notes-v1"),
    };
    // Only exhibit "b" changed; global projections are ALWAYS rewritten (site.ts's own contract) even
    // though their CONTENT is unchanged here except for the generation stamp, which does change because
    // it's a hash over exhibits.json + images.json — so archie.json changes too even on a no-op edit if
    // the edit touched exhibits.json. Here we simulate the realistic case: only b's manifest + notes change.
    const next: Record<string, FileContent> = {
      ...prev,
      "b/manifest.json": text("b-v2"),
      "b/canvas/o1/annotations.json": text("b-notes-v2"),
    };
    const delta = computeDelta(prev, next);
    expect(delta.changed).toEqual(["b/canvas/o1/annotations.json", "b/manifest.json"]);
    expect(delta.unchanged).toEqual([
      "a/canvas/o1/annotations.json",
      "a/manifest.json",
      "archie.json",
      "collection.json",
      "exhibits.json",
      "images.json",
      "index.html",
      "sitemap.txt",
      "sitemap.xml",
    ]);
    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual([]);
  });
});
