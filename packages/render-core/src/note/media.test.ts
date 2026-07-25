import { describe, it, expect } from "vitest";
import { splitNoteMedia } from "./media.js";

describe("splitNoteMedia (note media vs prose, for the strip + lightbox)", () => {
  it("collects markdown images in order, classified, stripped from prose", () => {
    expect(splitNoteMedia("Look ![a](u1.jpg) and ![](u2.png) done")).toEqual({
      // `alt` now rides along where the author wrote one (V66) — u2 has none, so the key stays absent.
      media: [{ kind: "image", url: "u1.jpg", alt: "a" }, { kind: "image", url: "u2.png" }],
      text: "Look and done",
    });
  });
  it("classifies a markdown link to an audio file as audio (the bidar pattern)", () => {
    expect(splitNoteMedia("[♪ audio](track.mp3)")).toEqual({ media: [{ kind: "audio", url: "track.mp3", alt: "♪ audio" }], text: "" });
  });
  it("classifies a video file link as video", () => {
    expect(splitNoteMedia("see [clip](v.mp4) here").media).toEqual([{ kind: "video", url: "v.mp4", alt: "clip" }]);
  });
  it("leaves non-media links (web pages) in the prose", () => {
    const r = splitNoteMedia("read [the page](https://example.com/article)");
    expect(r.media).toEqual([]);
    expect(r.text).toContain("[the page](https://example.com/article)");
  });
  it("handles inline html media tags", () => {
    expect(splitNoteMedia('<img src="h.webp"> <video src="c.webm"></video>').media).toEqual([
      { kind: "image", url: "h.webp" },
      { kind: "video", url: "c.webm" },
    ]);
  });
  it("query/hash after the extension still classifies", () => {
    expect(splitNoteMedia("![](a.png?v=2)").media).toEqual([{ kind: "image", url: "a.png?v=2" }]);
  });
  it("no media → prose unchanged", () => {
    expect(splitNoteMedia("just prose")).toEqual({ media: [], text: "just prose" });
  });
});

// The author's description is the ONLY accessible name these tiles can ever have (audit V66/V67): the
// tile is a button over a decorative-by-default <img>, and the lightbox is a dialog labelled "Note". If
// the parser drops the alt, no downstream component can invent it — a screen-reader user hears
// "Open image, button" → "Note, dialog" → an unlabelled graphic, and the note's whole point is the part
// that doesn't arrive. `MD_IMAGE` matched the alt and captured only the URL, so it was discarded here.
describe("splitNoteMedia — the author's description survives (V66)", () => {
  it("captures markdown image alt text", () => {
    expect(splitNoteMedia("![f1r — a related folio](a.jpg)").media).toEqual([
      { kind: "image", url: "a.jpg", alt: "f1r — a related folio" },
    ]);
  });

  it("captures a markdown media LINK's label", () => {
    expect(splitNoteMedia("[Bell, tolling](track.mp3)").media).toEqual([
      { kind: "audio", url: "track.mp3", alt: "Bell, tolling" },
    ]);
  });

  it("captures an HTML alt attribute, whatever the attribute order", () => {
    expect(splitNoteMedia('<img alt="A cat" src="c.png">').media).toEqual([{ kind: "image", url: "c.png", alt: "A cat" }]);
    expect(splitNoteMedia('<img src="d.png" alt="A dog">').media).toEqual([{ kind: "image", url: "d.png", alt: "A dog" }]);
  });

  it("omits `alt` entirely when the author wrote none — absent, never an empty string", () => {
    // `alt: ""` would be a CLAIM that the image is decorative. Absence lets the consumer decide.
    expect(splitNoteMedia("![](u.png)").media).toEqual([{ kind: "image", url: "u.png" }]);
    expect(splitNoteMedia("![   ](u.png)").media).toEqual([{ kind: "image", url: "u.png" }]);
    expect(splitNoteMedia('<img src="e.png">').media).toEqual([{ kind: "image", url: "e.png" }]);
  });

  it("keeps each item's own description when a note carries several", () => {
    expect(splitNoteMedia("![one](a.jpg) then ![two](b.png)").media).toEqual([
      { kind: "image", url: "a.jpg", alt: "one" },
      { kind: "image", url: "b.png", alt: "two" },
    ]);
  });

  it("does not let an alt containing markdown-ish characters break the split", () => {
    const r = splitNoteMedia("![a [bracketed] word](a.jpg)");
    expect(r.media.length + r.text.length).toBeGreaterThan(0); // never throws, never loses the body wholesale
  });
});

describe("splitNoteMedia — URL scheme hardening (security S3)", () => {
  it("does NOT treat an extension-bearing javascript: <img src> as media", () => {
    // the dangerous case: a bad scheme that still matches the media-extension regex
    expect(splitNoteMedia('<img src="javascript:alert(1)//x.jpg">').media).toEqual([]);
  });
  it("does NOT treat a markdown image with a javascript: URL as media (was defaulted to image)", () => {
    expect(splitNoteMedia("![x](javascript:alert(1))").media).toEqual([]);
  });
  it("does NOT treat a vbscript: markdown link to a media file as media", () => {
    expect(splitNoteMedia("[clip](vbscript:evil.mp3)").media).toEqual([]);
  });
  it("still accepts http(s), relative, and typed data:image/ media", () => {
    expect(splitNoteMedia("![](https://ex.org/a.jpg)").media).toEqual([{ kind: "image", url: "https://ex.org/a.jpg" }]);
    expect(splitNoteMedia("![](photo.png)").media).toEqual([{ kind: "image", url: "photo.png" }]);
    expect(splitNoteMedia("![](data:image/png;base64,iVBOR)").media).toEqual([{ kind: "image", url: "data:image/png;base64,iVBOR" }]);
  });
});
