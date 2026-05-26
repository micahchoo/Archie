import { describe, it, expect } from "vitest";
import { splitNoteMedia } from "./media.js";

describe("splitNoteMedia (note media vs prose, for the strip + lightbox)", () => {
  it("collects markdown images in order, classified, stripped from prose", () => {
    expect(splitNoteMedia("Look ![a](u1.jpg) and ![](u2.png) done")).toEqual({
      media: [{ kind: "image", url: "u1.jpg" }, { kind: "image", url: "u2.png" }],
      text: "Look and done",
    });
  });
  it("classifies a markdown link to an audio file as audio (the bidar pattern)", () => {
    expect(splitNoteMedia("[♪ audio](track.mp3)")).toEqual({ media: [{ kind: "audio", url: "track.mp3" }], text: "" });
  });
  it("classifies a video file link as video", () => {
    expect(splitNoteMedia("see [clip](v.mp4) here").media).toEqual([{ kind: "video", url: "v.mp4" }]);
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
