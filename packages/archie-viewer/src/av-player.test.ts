// AV-PLAYER seam tests (happy-dom). The embed's plain-DOM rewrite of apps/viewer MediaPlayer.svelte:
// a native <audio>/<video> + a time-cue band + whole-track notes, reusing the note-card for bodies.
//
// happy-dom media is limited (no real decode, no live `timeupdate`/`loadedmetadata` from a network
// source), so we test what's deterministic: the DOM STRUCTURE rendered, the PURE cue split
// (cuesOf / wholeTrackNotesOf), the click→seek+note wiring (driven by firing the handler directly),
// and the clamped paused landing seek (landSeek via a synthetic loadedmetadata + a duration shim).
import { describe, it, expect } from "vitest";
import { mountAvPlayer, cuesOf, wholeTrackNotesOf } from "./av-player.js";
import { fragmentSelector, type AObject, type W3CAnnotation } from "@render/core";

// A note targeting a time range (cue) or a whole track (no t=). The overlay/resolver key selection by
// String(a.id); we mirror that.
function timeNote(id: string, start: number, end: number | undefined, text: string): W3CAnnotation {
  const value = end === undefined ? `t=${start}` : `t=${start},${end}`;
  return {
    id,
    type: "Annotation",
    body: [{ type: "TextualBody", value, purpose: "commenting" } as never].map(() => ({
      type: "TextualBody",
      value: text,
      purpose: "commenting",
    })) as never,
    target: { source: "obj", selector: fragmentSelector(value) },
  } as unknown as W3CAnnotation;
}

function wholeNote(id: string, text: string): W3CAnnotation {
  return {
    id,
    type: "Annotation",
    body: [{ type: "TextualBody", value: text, purpose: "commenting" }],
    target: { source: "obj" }, // bare target, no selector → whole-track
  } as unknown as W3CAnnotation;
}

const soundObj = (over: Partial<AObject> = {}): AObject =>
  ({ id: "o12", source: "blob:fake-audio", label: "Field recording", mediaType: "sound", ...over } as AObject);

const videoObj = (over: Partial<AObject> = {}): AObject =>
  ({ id: "v1", source: "blob:fake-video", label: "Clip", mediaType: "video", ...over } as AObject);

function host(): HTMLElement {
  const h = document.createElement("div");
  h.style.position = "relative";
  document.body.appendChild(h);
  return h;
}

describe("cuesOf — time-region notes become cues, sorted by start", () => {
  it("keeps only notes with a t= time fragment, sorted ascending by start", () => {
    const anns = [
      timeNote("a", 30, 40, "third"),
      timeNote("b", 5, 10, "first"),
      timeNote("c", 12, 18, "second"),
      wholeNote("w", "about the whole thing"),
    ];
    const cues = cuesOf(anns);
    expect(cues.map((c) => c.id)).toEqual(["b", "c", "a"]);
    expect(cues[0]!.range.start).toBe(5);
    expect(cues[0]!.text).toBe("first");
  });

  it("a point marker (t=start, no end) is still a cue", () => {
    const cues = cuesOf([timeNote("p", 7, undefined, "ping")]);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.range.start).toBe(7);
    expect(cues[0]!.range.end).toBeUndefined();
  });
});

describe("wholeTrackNotesOf — bare-target notes (no t=) are whole-track", () => {
  it("returns only selectorless / non-time notes", () => {
    const anns = [timeNote("a", 1, 2, "cue"), wholeNote("w1", "whole one"), wholeNote("w2", "whole two")];
    const whole = wholeTrackNotesOf(anns);
    expect(whole.map((n) => n.id)).toEqual(["w1", "w2"]);
  });
});

describe("mountAvPlayer — renders a native media element for the medium", () => {
  it("a sound object renders an <audio controls> with the object source", () => {
    const h = host();
    mountAvPlayer(h, { object: soundObj(), annotations: [] });
    const audio = h.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(h.querySelector("video")).toBeNull();
    expect(audio!.getAttribute("src")).toBe("blob:fake-audio");
    expect(audio!.hasAttribute("controls")).toBe(true);
  });

  it("a video object renders a <video controls> with the object source", () => {
    const h = host();
    mountAvPlayer(h, { object: videoObj(), annotations: [] });
    const video = h.querySelector("video");
    expect(video).not.toBeNull();
    expect(h.querySelector("audio")).toBeNull();
    expect(video!.getAttribute("src")).toBe("blob:fake-video");
  });

  it("lists time-region notes as cues (sorted) and whole-track notes separately", () => {
    const h = host();
    mountAvPlayer(h, {
      object: soundObj(),
      annotations: [timeNote("a", 30, 40, "late"), timeNote("b", 5, 10, "early"), wholeNote("w", "the whole tape")],
    });
    const cueButtons = [...h.querySelectorAll<HTMLButtonElement>("[data-cue]")];
    expect(cueButtons.map((b) => b.dataset["cue"])).toEqual(["b", "a"]); // sorted by start
    const whole = h.querySelector('[data-whole-note="w"]');
    expect(whole).not.toBeNull();
    expect(whole!.textContent).toContain("the whole tape");
  });
});

describe("mountAvPlayer — selecting a cue seeks the media + shows the note body", () => {
  it("clicking a cue sets currentTime to its start and reveals the note card with its text", () => {
    const h = host();
    mountAvPlayer(h, {
      object: soundObj(),
      annotations: [timeNote("a", 12, 20, "the chant begins"), wholeNote("w", "whole")],
    });
    const media = h.querySelector("audio") as HTMLMediaElement;
    // happy-dom media has no real timeline; make currentTime a plain writable shim so the seek is observable.
    let ct = 0;
    Object.defineProperty(media, "currentTime", { get: () => ct, set: (v: number) => (ct = v), configurable: true });

    const cue = h.querySelector<HTMLButtonElement>('[data-cue="a"]')!;
    cue.click();

    expect(ct).toBe(12); // seeked to the cue start
    const card = h.querySelector(".archie-note-card") as HTMLElement;
    expect(card.hidden).toBe(false);
    expect(card.querySelector(".archie-note-card__body")!.textContent).toContain("the chant begins");
  });
});

describe("mountAvPlayer — a t= landing computes a clamped PAUSED seek (no auto-play)", () => {
  it("on loadedmetadata, seeks currentTime to the clamped initialSeek and never calls play()", () => {
    const h = host();
    const handle = mountAvPlayer(h, { object: soundObj({ duration: 100 }), annotations: [], initialSeek: "42" });
    const media = h.querySelector("audio") as HTMLMediaElement;

    let ct = 0;
    Object.defineProperty(media, "currentTime", { get: () => ct, set: (v: number) => (ct = v), configurable: true });
    Object.defineProperty(media, "duration", { get: () => 100, configurable: true });
    let played = false;
    media.play = (() => { played = true; return Promise.resolve(); }) as never;

    media.dispatchEvent(new Event("loadedmetadata"));

    expect(ct).toBe(42); // clamped to [0,100], landed at 42
    expect(played).toBe(false); // section-142: landing seeks but must NOT auto-play
    handle.destroy();
  });

  it("an out-of-range initialSeek clamps to the duration ceiling (still paused)", () => {
    const h = host();
    mountAvPlayer(h, { object: soundObj({ duration: 30 }), annotations: [], initialSeek: "999" });
    const media = h.querySelector("audio") as HTMLMediaElement;
    let ct = 0;
    Object.defineProperty(media, "currentTime", { get: () => ct, set: (v: number) => (ct = v), configurable: true });
    Object.defineProperty(media, "duration", { get: () => 30, configurable: true });
    media.dispatchEvent(new Event("loadedmetadata"));
    expect(ct).toBe(30); // clamped to the ceiling
  });

  it("no initialSeek leaves the playhead at the head (0)", () => {
    const h = host();
    mountAvPlayer(h, { object: soundObj({ duration: 50 }), annotations: [] });
    const media = h.querySelector("audio") as HTMLMediaElement;
    let ct = 0;
    Object.defineProperty(media, "currentTime", { get: () => ct, set: (v: number) => (ct = v), configurable: true });
    Object.defineProperty(media, "duration", { get: () => 50, configurable: true });
    media.dispatchEvent(new Event("loadedmetadata"));
    expect(ct).toBe(0);
  });
});

describe("mountAvPlayer — teardown removes the player + its note card", () => {
  it("destroy() empties the host", () => {
    const h = host();
    const handle = mountAvPlayer(h, { object: soundObj(), annotations: [timeNote("a", 1, 2, "x")] });
    expect(h.querySelector("audio")).not.toBeNull();
    handle.destroy();
    expect(h.querySelector("audio")).toBeNull();
    expect(h.querySelector(".archie-note-card")).toBeNull();
  });
});
