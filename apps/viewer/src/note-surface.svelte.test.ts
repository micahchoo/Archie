// Headless tests for the ONE open-note state machine (note-surface.svelte.ts, Phase 5). The three
// reading hosts' per-host copies are gone; the transitions they all shared are pinned here:
// open/close, the expand affordance's text gate, the sheet→lightbox / sheet→finder REPLACE rule
// (one modal at a time, Archie-dbbc), the object-change reset, and the per-host deps (text source,
// eyebrow, tag gating, canvas-binding callback). Component-level wiring stays pinned by
// note-surface-wiring.test.ts (AST) and the e2e suite (rendered behaviour).
//
// The `.svelte.test.ts` extension is load-bearing: `$state` here needs the Svelte compiler (the
// svelte plugin in vitest.config.ts, studio's library-meta.svelte.ts precedent).
import { describe, it, expect } from "vitest";
import { createNoteSurface, type NoteSurfaceDeps } from "./note-surface.svelte.js";
import type { W3CAnnotation } from "@render/core";

const ann = (id: string, comment: string, tags: string[] = []): W3CAnnotation => ({
  id,
  type: "Annotation",
  motivation: "commenting",
  target: "",
  body: [
    { type: "TextualBody", purpose: "commenting", value: comment },
    ...tags.map((value) => ({ type: "TextualBody" as const, purpose: "tagging" as const, value })),
  ],
});

const TEXT_NOTE = ann("n1", "a **prose** note", ["cipher"]);
const MEDIA_NOTE = ann("n2", "![figure](https://example.com/fig.jpg)");

function make(over: Partial<NoteSurfaceDeps> = {}) {
  // A $state array so the derived `current` re-computes when the host's note list changes — the
  // same reactivity a host's `annotations` prop closure provides.
  let notes = $state<W3CAnnotation[]>([TEXT_NOTE, MEDIA_NOTE]);
  let eyebrow = $state("The object");
  const deps: NoteSurfaceDeps = {
    annotations: () => notes,
    textOf: (a) => {
      const b = Array.isArray(a.body) ? a.body[0] : a.body;
      return (b as { value?: string } | undefined)?.value ?? "";
    },
    eyebrow: () => eyebrow,
    ...over,
  };
  return { surface: createNoteSurface(deps), setNotes: (n: W3CAnnotation[]) => (notes = n), setEyebrow: (e: string) => (eyebrow = e) };
}

describe("selection", () => {
  it("open() selects the note and derives current/noteParts from the host's list", () => {
    const { surface } = make();
    expect(surface.selected).toBeNull();
    expect(surface.current).toBeNull();
    surface.open("n1");
    expect(surface.selected).toBe("n1");
    expect(surface.current?.id).toBe("n1");
    expect(surface.noteParts.text).toContain("**prose**");
  });

  it("close() clears the selection but not the sheet/lightbox flags", () => {
    // The card's × is the only dismissal that clears selection; the sheet has its own × (sheetClose).
    const { surface } = make();
    surface.open("n1");
    surface.expand();
    surface.close();
    expect(surface.selected).toBeNull();
    expect(surface.readingSheet).toBe(true); // deliberately untouched — the sheet unmounts via `&& current`
  });

  it("seeds from initialSelected (the deep-link contract)", () => {
    const { surface } = make({ initialSelected: "n1" });
    expect(surface.selected).toBe("n1");
    expect(surface.current?.id).toBe("n1");
  });

  it("open() applies the host's canvas-binding callback (AV seek)", () => {
    const calls: string[] = [];
    const { surface } = make({ onSelect: (id) => calls.push(id) });
    surface.open("n1");
    expect(calls).toEqual(["n1"]);
  });

  it("current tracks the host's annotations list changing (object/reading change)", () => {
    const { surface, setNotes } = make();
    surface.open("n1");
    setNotes([ann("n9", "replacement object's note")]);
    expect(surface.current).toBeNull(); // n1 no longer exists on the new object
    surface.open("n9");
    expect(surface.current?.id).toBe("n9");
  });
});

describe("expand — the reading sheet", () => {
  it("opens the sheet when the note has text (NotePopup renders ⤢ only `{#if text}`)", () => {
    const { surface } = make();
    surface.open("n1");
    surface.expand();
    expect(surface.readingSheet).toBe(true);
    expect(surface.lightbox).toBeNull();
  });

  it("is a no-op for a textless note — the expand affordance does not exist there", () => {
    // Reader/MediaPlayer's old `else if (media) → lightbox` expand branches were unreachable dead
    // code (NotePopup withholds ⤢ without text); the canonical form is the text gate only.
    const { surface } = make();
    surface.open("n2");
    surface.expand();
    expect(surface.readingSheet).toBe(false);
    expect(surface.lightbox).toBeNull();
  });

  it("sheetClose collapses back to the card and leaves the selection", () => {
    const { surface } = make();
    surface.open("n1");
    surface.expand();
    surface.sheetClose();
    expect(surface.readingSheet).toBe(false);
    expect(surface.selected).toBe("n1"); // "read less", not "dismiss the note"
  });
});

describe("the lightbox", () => {
  it("opens via a card media tile at the clicked index", () => {
    const { surface } = make();
    surface.open("n2");
    surface.media(0);
    // The whole body IS a media embed, so splitNoteMedia yields the figure with empty prose — the
    // lightbox gets the note's full content regardless, exactly as the note card would.
    expect(surface.lightbox?.index).toBe(0);
    expect(surface.lightbox?.media.length).toBeGreaterThan(0);
    expect(surface.readingSheet).toBe(false);
  });

  it("opens via a SHEET media tile by REPLACING the sheet — one modal at a time (Archie-dbbc)", () => {
    const { surface } = make();
    surface.open("n2");
    surface.expand(); // no text → no sheet; use a text+media note instead
    // (n2 has no text so expand is a no-op; the sheet's replace rule is exercised on the text note)
    surface.open("n1");
    surface.expand();
    expect(surface.readingSheet).toBe(true);
    surface.sheetMedia(0);
    expect(surface.readingSheet).toBe(false); // the sheet is GONE
    expect(surface.lightbox).not.toBeNull(); // the lightbox REPLACED it
  });

  it("closes via closeLightbox", () => {
    const { surface } = make();
    surface.open("n1");
    surface.media(0);
    surface.closeLightbox();
    expect(surface.lightbox).toBeNull();
    expect(surface.selected).toBe("n1"); // closing the lightbox is not dismissing the note
  });
});

describe("the finder route", () => {
  it("opens the finder from the card WITHOUT closing anything (the card is not modal)", () => {
    const tags: string[] = [];
    const { surface } = make({ onopenfinder: (t) => tags.push(t) });
    surface.open("n1");
    surface.openFinder("cipher");
    expect(tags).toEqual(["cipher"]);
    expect(surface.selected).toBe("n1");
  });

  it("opens the finder from the SHEET by REPLACING it — one modal at a time", () => {
    const tags: string[] = [];
    const { surface } = make({ onopenfinder: (t) => tags.push(t) });
    surface.open("n1");
    surface.expand();
    surface.sheetFinder("cipher");
    expect(tags).toEqual(["cipher"]);
    expect(surface.readingSheet).toBe(false);
  });

  it("renders NO tags when the host wires no finder (MediaPlayer's gating, made universal)", () => {
    const { surface } = make(); // no onopenfinder dep
    surface.open("n1");
    expect(surface.tags).toEqual([]);
  });

  it("renders tags only when the finder is wired — a dead tag button is worse than none", () => {
    const { surface } = make({ onopenfinder: () => {} });
    surface.open("n1");
    expect(surface.tags.length).toBeGreaterThan(0);
  });
});

describe("the eyebrow", () => {
  it("is derived LIVE from the host's label (the narrative's 'Section · object')", () => {
    const { surface, setEyebrow } = make();
    surface.open("n1");
    expect(surface.eyebrow).toBe("The object");
    setEyebrow("Section 3 · The object");
    expect(surface.eyebrow).toBe("Section 3 · The object");
  });
});

describe("reset — the object/section-change clear", () => {
  it("clears selection, the sheet AND the lightbox together", () => {
    const { surface } = make();
    surface.open("n1");
    surface.expand();
    surface.sheetMedia(0); // sheet → lightbox
    expect(surface.lightbox).not.toBeNull();
    surface.reset();
    expect(surface.selected).toBeNull();
    expect(surface.readingSheet).toBe(false);
    expect(surface.lightbox).toBeNull();
  });

  it("is what makes the readingSheet-stuck bug impossible: after reset, a plain selection opens no sheet", () => {
    const { surface } = make();
    surface.open("n1");
    surface.expand();
    surface.reset(); // e.g. the carousel stepped to another object
    surface.open("n2");
    expect(surface.readingSheet).toBe(false); // no zombie flag → no sheet nobody asked for
  });
});
