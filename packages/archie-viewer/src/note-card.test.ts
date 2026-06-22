// NOTE-CARD seam tests (happy-dom). The card is plain DOM (no OSD), so unlike reader.test.ts we can
// exercise it fully here: build a card in a host, resolve a selected annotation's body through the
// SAME render-core pipeline the full viewer uses (commentOfAnnotation → renderMarkdown), and assert the
// body TEXT lands in the card — and that a null/empty selection hides it.
import { describe, it, expect } from "vitest";
import { createNoteCard, noteBodyHtml } from "./note-card.js";
import type { W3CAnnotation } from "@render/core";

/** A published annotation with a TextualBody comment (the shape the overlay selects by `id`). */
const annoWith = (id: string, comment: string): W3CAnnotation =>
  ({
    id,
    type: "Annotation",
    body: { type: "TextualBody", value: comment, purpose: "commenting" },
    target: { source: "blob:o1" },
  } as W3CAnnotation);

describe("noteBodyHtml — resolve a selected id to SANITIZED body HTML", () => {
  const annos = [annoWith("a1", "The *folio* margin gloss."), annoWith("a2", "Second note")];

  it("a known id renders that annotation's body text (markdown → html)", () => {
    const html = noteBodyHtml(annos, "a1");
    expect(html).toContain("folio"); // the body text survived
    expect(html).toContain("<em>folio</em>"); // markdown emphasis rendered
  });

  it("string-equality matches the overlay's String(id) keying", () => {
    expect(noteBodyHtml(annos, "a2")).toContain("Second note");
  });

  it("a null selection yields '' (the card will hide)", () => {
    expect(noteBodyHtml(annos, null)).toBe("");
  });

  it("an unknown id yields '' (no matching annotation)", () => {
    expect(noteBodyHtml(annos, "ghost")).toBe("");
  });

  it("SANITIZES — body HTML is routed through renderMarkdown (DOMPurify), stripping active payloads", () => {
    // The load-bearing claim: bodies pass through renderMarkdown (snarkdown → DOMPurify), so an
    // event-handler attribute (the real injection vector) is removed. (render-core's own sanitize
    // suite, run under node, asserts the full strip-set including <script>; happy-dom's <script>
    // re-serialization is an environment quirk, so here we pin the attribute-level strip that holds.)
    const dirty = [annoWith("x", "<img src=x onerror=alert(1)> caption")];
    const html = noteBodyHtml(dirty, "x");
    expect(html).not.toContain("onerror"); // the active payload is gone
    expect(html).not.toContain("alert(1)");
  });
});

describe("createNoteCard — show renders the body, hide/empty conceals it", () => {
  function host(): HTMLElement {
    const h = document.createElement("div");
    document.body.appendChild(h);
    return h;
  }

  it("selecting an annotation renders its body TEXT into the card", () => {
    const h = host();
    const card = createNoteCard(h);
    const annos = [annoWith("a1", "Marginalia: a star-shaped sigil.")];
    card.show(noteBodyHtml(annos, "a1"));
    const el = h.querySelector(".archie-note-card") as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.hidden).toBe(false);
    expect(el.textContent).toContain("star-shaped sigil");
  });

  it("deselect (null) hides the card and clears its body", () => {
    const h = host();
    const card = createNoteCard(h);
    const annos = [annoWith("a1", "Visible note")];
    card.show(noteBodyHtml(annos, "a1"));
    card.show(noteBodyHtml(annos, null)); // a null selection → "" → hide
    const el = h.querySelector(".archie-note-card") as HTMLElement;
    expect(el.hidden).toBe(true);
    expect(el.querySelector(".archie-note-card__body")!.textContent).toBe("");
  });

  it("the dismiss button hides the card (it is dismissible)", () => {
    const h = host();
    const card = createNoteCard(h);
    card.show(noteBodyHtml([annoWith("a1", "Dismiss me")], "a1"));
    const el = h.querySelector(".archie-note-card") as HTMLElement;
    expect(el.hidden).toBe(false);
    h.querySelector<HTMLButtonElement>(".archie-note-card__dismiss")!.click();
    expect(el.hidden).toBe(true);
  });

  it("destroy removes the card element from the host", () => {
    const h = host();
    const card = createNoteCard(h);
    card.destroy();
    expect(h.querySelector(".archie-note-card")).toBeNull();
  });
});
