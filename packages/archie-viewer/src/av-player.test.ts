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

describe("mountAvPlayer — surface.select is the reader note list's door (S1)", () => {
  // The reader's note list mounts beside an AV object too, and its rows were a DEAD DOOR: the embed
  // owns no note card on this path (the player owns one), so element.ts's row handler had nothing to
  // drive. Measured on ex-voynich.o12 (Sound, 5 notes) — rows rendered, aria-current moved, nothing
  // ever opened. `select` is the same behaviour a cue click has, exposed after mount.
  const mounted = () => {
    const h = host();
    const surface = mountAvPlayer(h, {
      object: soundObj(),
      annotations: [timeNote("a", 12, 20, "the chant begins"), wholeNote("w", "whole")],
    });
    const media = h.querySelector("audio") as HTMLMediaElement;
    let ct = 0;
    Object.defineProperty(media, "currentTime", { get: () => ct, set: (v: number) => (ct = v), configurable: true });
    return { h, surface, at: () => ct };
  };

  it("select(id) seeks to the cue and opens its body — the cue click's behaviour, by id", () => {
    const { h, surface, at } = mounted();
    expect(surface.select("a")).toBe(true);
    expect(at()).toBe(12);
    const card = h.querySelector(".archie-note-card") as HTMLElement;
    expect(card.hidden).toBe(false);
    expect(card.querySelector(".archie-note-card__body")!.textContent).toContain("the chant begins");
  });

  it("reports false for a note with no timed cue, so the caller can tell 'no door' from 'opened'", () => {
    // A whole-track note has no cue to travel to; silently doing nothing and silently succeeding are
    // different claims, and only the second would let a dead row look alive again.
    const { surface } = mounted();
    expect(surface.select("w")).toBe(false);
    expect(surface.select("nope")).toBe(false);
  });

  it("syncs the active-cue highlight, which paused media would never fire a timeupdate for", () => {
    const { h, surface } = mounted();
    surface.select("a");
    expect(h.querySelector('[data-cue="a"]')!.classList.contains("active")).toBe(true);
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

describe("mountAvPlayer — an /a/<noteId> cite to a TIMED note lands on the moment (Archie-a9f4)", () => {
  function shim(media: HTMLMediaElement, dur: number): { ct: () => number; played: () => boolean } {
    let ct = 0;
    let played = false;
    Object.defineProperty(media, "currentTime", { get: () => ct, set: (v: number) => (ct = v), configurable: true });
    Object.defineProperty(media, "duration", { get: () => dur, configurable: true });
    media.play = (() => { played = true; return Promise.resolve(); }) as never;
    return { ct: () => ct, played: () => played };
  }

  it("on loadedmetadata: seeks PAUSED to the cue's start, highlights it, and shows its note card", () => {
    const h = host();
    mountAvPlayer(h, {
      object: soundObj(),
      annotations: [timeNote("a", 12, 20, "the chant begins"), timeNote("b", 30, 40, "later")],
      initialSelect: "a",
    });
    const media = h.querySelector("audio") as HTMLMediaElement;
    const m = shim(media, 100);

    media.dispatchEvent(new Event("loadedmetadata"));

    expect(m.ct()).toBe(12); // landed at the cue's own start (recovered from its t= selector)
    expect(m.played()).toBe(false); // seek-paused ONLY — no auto-play (section-142)
    expect(h.querySelector('[data-cue="a"]')!.classList.contains("active")).toBe(true); // highlighted
    expect(h.querySelector('[data-cue="b"]')!.classList.contains("active")).toBe(false);
    const card = h.querySelector(".archie-note-card") as HTMLElement;
    expect(card.hidden).toBe(false); // its note card is open on arrival
    expect(card.querySelector(".archie-note-card__body")!.textContent).toContain("the chant begins");
  });

  it("an explicit initialSeek (route ?t) WINS the seek position; the cited cue's card still opens", () => {
    const h = host();
    mountAvPlayer(h, {
      object: soundObj(),
      annotations: [timeNote("a", 12, 20, "the chant begins")],
      initialSelect: "a",
      initialSeek: "50",
    });
    const media = h.querySelector("audio") as HTMLMediaElement;
    const m = shim(media, 100);

    media.dispatchEvent(new Event("loadedmetadata"));

    expect(m.ct()).toBe(50); // the explicit cite won the playhead
    const card = h.querySelector(".archie-note-card") as HTMLElement;
    expect(card.hidden).toBe(false); // the cited note's card is still open
    // The highlight follows the playhead truthfully: 50 is outside [12,20) → not active.
    expect(h.querySelector('[data-cue="a"]')!.classList.contains("active")).toBe(false);
  });

  it("an initialSelect naming a whole-track (non-timed) note is an ordinary landing — head 0, no card", () => {
    const h = host();
    mountAvPlayer(h, {
      object: soundObj(),
      annotations: [timeNote("a", 12, 20, "cue"), wholeNote("w", "about the whole tape")],
      initialSelect: "w",
    });
    const media = h.querySelector("audio") as HTMLMediaElement;
    const m = shim(media, 100);

    media.dispatchEvent(new Event("loadedmetadata"));

    expect(m.ct()).toBe(0); // no cue to land on — playhead stays at the head, paused
    expect((h.querySelector(".archie-note-card") as HTMLElement).hidden).toBe(true);
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
