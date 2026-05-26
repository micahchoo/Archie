import { describe, it, expect } from "vitest";
import { mediaTypeFromSource, readingFamily, isValidMode } from "./model.js";

describe("isValidMode — the §43 family-binding rule + guard for untrusted JSON (v1: only 'no mode')", () => {
  it("accepts the absence of a mode for any layout", () => {
    expect(isValidMode("grid", undefined)).toBe(true);
    expect(isValidMode("narrative", undefined)).toBe(true);
  });
  it("rejects any set mode in v1 (no reading modes defined yet — guards a hand-edited/forward file)", () => {
    expect(isValidMode("grid", "slideshow")).toBe(false);
    expect(isValidMode("narrative", "scrollytelling")).toBe(false);
  });
});

describe("readingFamily — the §43 reading-mode axis the picker groups by", () => {
  it("maps object-led arrangements vs the prose-led narrative", () => {
    expect(readingFamily("single")).toBe("object-led");
    expect(readingFamily("grid")).toBe("object-led");
    expect(readingFamily("narrative")).toBe("prose-led");
  });
});

describe("mediaTypeFromSource — classify an added object's media kind (default image)", () => {
  it("recognizes sound extensions", () => {
    for (const s of ["a.mp3", "x/y.m4a", "z.ogg", "f.opus", "r.wav", "q.flac"]) expect(mediaTypeFromSource(s)).toBe("sound");
    expect(mediaTypeFromSource("https://h/clip.mp3?token=1#t")).toBe("sound"); // ext before query/hash
  });
  it("recognizes video extensions", () => {
    for (const s of ["a.mp4", "b.webm", "c.mov", "d.m4v"]) expect(mediaTypeFromSource(s)).toBe("video");
  });
  it("prefers an explicit MIME format over the extension", () => {
    expect(mediaTypeFromSource("blob:weird-no-ext", "audio/mpeg")).toBe("sound");
    expect(mediaTypeFromSource("blob:weird-no-ext", "video/mp4")).toBe("video");
    expect(mediaTypeFromSource("misleading.mp3", "image/jpeg")).toBe("image");
  });
  it("falls back to image for unknown/extensionless/heic sources", () => {
    expect(mediaTypeFromSource("photo.jpg")).toBe("image");
    expect(mediaTypeFromSource("photo.heic")).toBe("image"); // phone photo, EXIF path
    expect(mediaTypeFromSource("https://iiif.example/image/info.json")).toBe("image");
    expect(mediaTypeFromSource("blob:no-extension-at-all")).toBe("image");
  });
});
