// NOTE-CARD seam tests (happy-dom). The card is plain DOM (no OSD), so unlike reader.test.ts we can
// exercise it fully here: build a card in a host, resolve a selected annotation's body through the
// SAME render-core pipeline the full viewer uses (splitNoteMedia → renderMarkdown), and assert the
// body TEXT lands in the card — and that a null/empty selection hides it.
//
// The media + sheet suites below carry the Archie-1820 capability. Note what they can and CANNOT
// prove: happy-dom has no layout, so `getClientRects()` is empty for everything, which makes the
// sheet's Tab trap untestable here (`focusables` filters on it) and makes any assertion about the
// sheet COVERING the canvas meaningless. Those belong to recipes/smoke.mjs, which drives a real
// browser. What these tests own is structure, the alt/description contract, and the
// hidden-not-unmounted invariant — all of which are observable without layout.
import { describe, it, expect } from "vitest";
import { createNoteCard, noteParts } from "./note-card.js";
import type { W3CAnnotation } from "@render/core";

/** A published annotation with a TextualBody comment (the shape the overlay selects by `id`). */
const annoWith = (id: string, comment: string): W3CAnnotation =>
  ({
    id,
    type: "Annotation",
    body: { type: "TextualBody", value: comment, purpose: "commenting" },
    target: { source: "blob:o1" },
  } as W3CAnnotation);

describe("noteParts — resolve a selected id to SANITIZED prose + lifted media", () => {
  const annos = [annoWith("a1", "The *folio* margin gloss."), annoWith("a2", "Second note")];

  it("a known id renders that annotation's body text (markdown → html)", () => {
    const { html } = noteParts(annos, "a1");
    expect(html).toContain("folio"); // the body text survived
    expect(html).toContain("<em>folio</em>"); // markdown emphasis rendered
  });

  it("string-equality matches the overlay's String(id) keying", () => {
    expect(noteParts(annos, "a2").html).toContain("Second note");
  });

  it("a null selection yields nothing (the card will hide)", () => {
    expect(noteParts(annos, null)).toEqual({ html: "", media: [] });
  });

  it("an unknown id yields nothing (no matching annotation)", () => {
    expect(noteParts(annos, "ghost")).toEqual({ html: "", media: [] });
  });

  it("SANITIZES — body HTML is routed through renderMarkdown (DOMPurify), stripping active payloads", () => {
    // The load-bearing claim: bodies pass through renderMarkdown (snarkdown → DOMPurify), so an
    // event-handler attribute (the real injection vector) is removed. (render-core's own sanitize
    // suite, run under node, asserts the full strip-set including <script>; happy-dom's <script>
    // re-serialization is an environment quirk, so here we pin the attribute-level strip that holds.)
    const dirty = [annoWith("x", "<img src=x onerror=alert(1)> caption")];
    const { html } = noteParts(dirty, "x");
    expect(html).not.toContain("onerror"); // the active payload is gone
    expect(html).not.toContain("alert(1)");
  });

  // --- the media lift (Archie-1820 · note media) -----------------------------------------------
  it("LIFTS media OUT of the prose instead of leaving a raw <img> in it", () => {
    // This is the regression that shipped: renderMarkdown alone passes `![alt](url)` straight through
    // to DOMPurify, so the card rendered an unconstrained remote image at natural width with the
    // author's description reachable only as an attribute. splitNoteMedia must run FIRST.
    const body = "Prose before. ![f1r — a related folio](https://x.test/f1r.jpg) Prose after.";
    const parts = noteParts([annoWith("m1", body)], "m1");
    expect(parts.html).not.toContain("<img"); // the picture is no longer inline in the prose
    expect(parts.html).toContain("Prose before.");
    expect(parts.html).toContain("Prose after.");
    expect(parts.media).toEqual([
      { kind: "image", url: "https://x.test/f1r.jpg", alt: "f1r — a related folio" },
    ]);
  });

  it("carries the author's DESCRIPTION (Archie-ff79/V66) — and omits the key when there is none", () => {
    // media.ts:12-22 makes this a contract, not a detail: ABSENT means "the author wrote nothing",
    // where `alt: ""` would be a positive claim that the picture is decorative. Collapsing the two
    // is unrecoverable downstream, so assert the ABSENCE of the key, not its emptiness.
    const described = noteParts([annoWith("d", "![A tolling bell](https://x.test/b.jpg)")], "d");
    expect(described.media[0]!.alt).toBe("A tolling bell");
    const bare = noteParts([annoWith("b", "![](https://x.test/b.jpg)")], "b");
    expect(bare.media[0]).not.toHaveProperty("alt");
  });

  it("REFUSES an unsafe media scheme rather than turning it into a live src", () => {
    // media.ts:48 — a rejected URL stays in the prose (sanitized there by DOMPurify) and never
    // becomes a tile's `src`.
    const parts = noteParts([annoWith("s", "![x](javascript:alert(1))")], "s");
    expect(parts.media).toEqual([]);
  });
});

describe("createNoteCard — show renders the body, hide/empty conceals it", () => {
  function host(): HTMLElement {
    // A real SHADOW ROOT, matching production: the sheet layer mounts on the ROOT (it covers the
    // whole element), so a shared `document.body` would let one test's layer answer another test's
    // query — the first-match trap. One root per card scopes every lookup to its own card.
    const outer = document.createElement("div");
    document.body.appendChild(outer);
    const h = document.createElement("div");
    outer.attachShadow({ mode: "open" }).appendChild(h);
    return h;
  }

  it("selecting an annotation renders its body TEXT into the card", () => {
    const h = host();
    const card = createNoteCard(h);
    card.showNote([annoWith("a1", "Marginalia: a star-shaped sigil.")], "a1");
    const el = h.querySelector(".archie-note-card") as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.hidden).toBe(false);
    expect(el.textContent).toContain("star-shaped sigil");
  });

  it("deselect (null) hides the card and clears its body", () => {
    const h = host();
    const card = createNoteCard(h);
    const annos = [annoWith("a1", "Visible note")];
    card.showNote(annos, "a1");
    card.showNote(annos, null); // a null selection → nothing → hide
    const el = h.querySelector(".archie-note-card") as HTMLElement;
    expect(el.hidden).toBe(true);
    expect(el.querySelector(".archie-note-card__body")!.textContent).toBe("");
  });

  it("the dismiss button hides the card (it is dismissible)", () => {
    const h = host();
    const card = createNoteCard(h);
    card.showNote([annoWith("a1", "Dismiss me")], "a1");
    const el = h.querySelector(".archie-note-card") as HTMLElement;
    expect(el.hidden).toBe(false);
    h.querySelector<HTMLButtonElement>(".archie-note-card__dismiss")!.click();
    expect(el.hidden).toBe(true);
  });

  it("destroy removes the card element AND its sheet layer", () => {
    const h = host();
    const card = createNoteCard(h);
    card.destroy();
    expect(h.querySelector(".archie-note-card")).toBeNull();
    // The layer mounts on the ROOT (it covers the whole element), so a destroy that only removed the
    // card would leak one layer per object open.
    expect(h.getRootNode().querySelector(".archie-note-sheet-layer")).toBeNull();
  });
});

const MEDIA_NOTE =
  "The wheels are read beside the herbal pages that open the book. " +
  "![f1r — the opening herbal leaf, for comparison](https://x.test/f1r.jpg)";

describe("createNoteCard — note media (Archie-1820)", () => {
  function host(): HTMLElement {
    // A real SHADOW ROOT, matching production: the sheet layer mounts on the ROOT (it covers the
    // whole element), so a shared `document.body` would let one test's layer answer another test's
    // query — the first-match trap. One root per card scopes every lookup to its own card.
    const outer = document.createElement("div");
    document.body.appendChild(outer);
    const h = document.createElement("div");
    outer.attachShadow({ mode: "open" }).appendChild(h);
    return h;
  }

  it("renders media as a TILE, not as a raw image inside the prose", () => {
    const h = host();
    const card = createNoteCard(h);
    card.showNote([annoWith("m", MEDIA_NOTE)], "m");
    const prose = h.querySelector(".archie-note-card__prose")!;
    expect(prose.querySelector("img")).toBeNull(); // not left inline
    const tile = h.querySelector<HTMLButtonElement>(".archie-note-media button.tile")!;
    expect(tile).not.toBeNull();
    expect(tile.querySelector("img")!.getAttribute("src")).toBe("https://x.test/f1r.jpg");
    expect(prose.textContent).toContain("herbal pages");
  });

  it("the TILE carries the author's description as its accessible name; the img stays decorative", () => {
    // NoteMedia.svelte:23-25/:33 — the button is the control and owns the name, so labelling the
    // child too would double-announce. Without this every tile in a note announces identically and a
    // reader with several cannot tell them apart.
    const h = host();
    const card = createNoteCard(h);
    card.showNote([annoWith("m", MEDIA_NOTE)], "m");
    const tile = h.querySelector<HTMLButtonElement>(".archie-note-media button.tile")!;
    expect(tile.getAttribute("aria-label")).toBe(
      "Open image: f1r — the opening herbal leaf, for comparison",
    );
    expect(tile.querySelector("img")!.getAttribute("alt")).toBe("");
  });

  it("an UNDESCRIBED tile names its kind and invents nothing", () => {
    const h = host();
    const card = createNoteCard(h);
    card.showNote([annoWith("m", "text ![](https://x.test/p.png)")], "m");
    const tile = h.querySelector<HTMLButtonElement>(".archie-note-media button.tile")!;
    expect(tile.getAttribute("aria-label")).toBe("Open image");
  });

  it("a BROKEN tile degrades to a notice keyed by URL, not by index", () => {
    // NoteMedia.svelte:12-17 — one card element is reused across every note on an object, so an
    // index-keyed failure set bleeds a dead tile onto the NEXT note's healthy tile at that position.
    // Drive it exactly that way: fail note A's only tile, then show note B and assert B is intact.
    const h = host();
    const card = createNoteCard(h);
    const a = annoWith("a", "A ![one](https://x.test/broken.jpg)");
    const b = annoWith("b", "B ![two](https://x.test/fine.jpg)");
    card.showNote([a, b], "a");
    h.querySelector(".archie-note-media button.tile img")!.dispatchEvent(new Event("error"));
    expect(h.querySelector(".archie-note-media .tile-failed")).not.toBeNull();
    card.showNote([a, b], "b");
    expect(h.querySelector(".archie-note-media .tile-failed")).toBeNull();
    expect(h.querySelector(".archie-note-media button.tile img")!.getAttribute("src")).toBe(
      "https://x.test/fine.jpg",
    );
  });
});

describe("createNoteCard — the reading sheet (Archie-1820)", () => {
  function host(): HTMLElement {
    // A real SHADOW ROOT, matching production: the sheet layer mounts on the ROOT (it covers the
    // whole element), so a shared `document.body` would let one test's layer answer another test's
    // query — the first-match trap. One root per card scopes every lookup to its own card.
    const outer = document.createElement("div");
    document.body.appendChild(outer);
    const h = document.createElement("div");
    outer.attachShadow({ mode: "open" }).appendChild(h);
    return h;
  }
  const sheetLayer = (h: HTMLElement): HTMLElement =>
    (h.getRootNode() as ShadowRoot).querySelector(".archie-note-sheet-layer")!;

  it("offers ⤢ only while a note is open", () => {
    const h = host();
    const card = createNoteCard(h);
    const expand = h.querySelector<HTMLButtonElement>(".archie-note-card__expand")!;
    expect(expand.hidden).toBe(true);
    card.showNote([annoWith("a", "Something to read")], "a");
    expect(expand.hidden).toBe(false);
    card.showNote([annoWith("a", "Something to read")], null);
    expect(expand.hidden).toBe(true);
  });

  it("⤢ opens a modal sheet carrying the SAME note, prose and media together", () => {
    // V60: the pre-Archie-dbbc sheet rendered prose only, so media silently vanished at the moment
    // the reader asked to see MORE. One renderer is what makes that unrepresentable.
    const h = host();
    const card = createNoteCard(h);
    card.showNote([annoWith("m", MEDIA_NOTE)], "m");
    h.querySelector<HTMLButtonElement>(".archie-note-card__expand")!.click();
    const layer = sheetLayer(h);
    expect(layer.hidden).toBe(false);
    const sheet = layer.querySelector(".archie-note-sheet")!;
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(sheet.textContent).toContain("herbal pages"); // the prose
    expect(sheet.querySelector("figure img")!.getAttribute("src")).toBe("https://x.test/f1r.jpg");
  });

  it("the sheet shows the author's description as a VISIBLE caption", () => {
    // The embed has no lightbox, so the sheet is the only surface where the description can be seen
    // rather than merely announced. clover-iiif Image.tsx:18 is the precedent for rendering it as
    // text; the shell keeps it in aria-label/alt only.
    const h = host();
    const card = createNoteCard(h);
    card.showNote([annoWith("m", MEDIA_NOTE)], "m");
    h.querySelector<HTMLButtonElement>(".archie-note-card__expand")!.click();
    const cap = sheetLayer(h).querySelector("figure figcaption")!;
    expect(cap.textContent).toBe("f1r — the opening herbal leaf, for comparison");
  });

  it("a media TILE opens the sheet — the embed has ONE overlay, so nothing can stack", () => {
    // The shell needs a separate lightbox and therefore enforces "a modal REPLACES the sheet, never
    // stacks on it" at three call sites (Reader.svelte:557-571). Collapsing enlarge into the sheet
    // means the embed cannot reach a two-modal state at all.
    const h = host();
    const card = createNoteCard(h);
    card.showNote([annoWith("m", MEDIA_NOTE)], "m");
    h.querySelector<HTMLButtonElement>(".archie-note-media button.tile")!.click();
    expect(sheetLayer(h).hidden).toBe(false);
    expect(h.getRootNode().querySelectorAll("[aria-modal='true']").length).toBe(1);
  });

  it("the card is HIDDEN, NOT UNMOUNTED, while the sheet is open", () => {
    // Both halves matter and they are different claims. Still in the DOM: focus must return to the ⤢
    // that opened the sheet, and that button has to exist for closeSheet to find it — unmounting
    // strands a keyboard reader, in BOTH effect orderings (dialog-a11y.ts:10-37). Hidden: a second
    // legible copy of the note behind the scrim was V60's other defect.
    const h = host();
    const card = createNoteCard(h);
    card.showNote([annoWith("a", "Read me at length")], "a");
    const el = h.querySelector(".archie-note-card") as HTMLElement;
    h.querySelector<HTMLButtonElement>(".archie-note-card__expand")!.click();
    expect(h.querySelector(".archie-note-card")).not.toBeNull(); // still mounted
    expect(el.hidden).toBe(true); // and out of the a11y tree
  });

  it("Escape closes the sheet and returns focus to the ⤢ that opened it", () => {
    const h = host();
    const card = createNoteCard(h);
    card.showNote([annoWith("a", "Read me at length")], "a");
    const expand = h.querySelector<HTMLButtonElement>(".archie-note-card__expand")!;
    expand.click();
    const layer = sheetLayer(h);
    layer.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(layer.hidden).toBe(true);
    expect(h.querySelector<HTMLElement>(".archie-note-card")!.hidden).toBe(false);
    expect((h.getRootNode() as ShadowRoot).activeElement).toBe(expand);
  });

  it("closing the sheet is 'read less' — the note stays open, it is not dismissed", () => {
    // Reader.svelte:551-556 — only the CARD's × clears the selection. The divergence is the point.
    const h = host();
    const card = createNoteCard(h);
    card.showNote([annoWith("a", "Still selected")], "a");
    h.querySelector<HTMLButtonElement>(".archie-note-card__expand")!.click();
    sheetLayer(h).querySelector<HTMLButtonElement>(".archie-note-sheet__head button")!.click();
    const el = h.querySelector(".archie-note-card") as HTMLElement;
    expect(el.hidden).toBe(false);
    expect(el.textContent).toContain("Still selected");
  });

  it("the scrim closes the sheet", () => {
    const h = host();
    const card = createNoteCard(h);
    card.showNote([annoWith("a", "Read me")], "a");
    h.querySelector<HTMLButtonElement>(".archie-note-card__expand")!.click();
    const layer = sheetLayer(h);
    layer.querySelector<HTMLElement>(".archie-note-sheet-scrim")!.click();
    expect(layer.hidden).toBe(true);
  });

  it("hiding the card while the sheet is open closes the sheet too", () => {
    // A deselect / teardown must not leave a modal covering the element with nothing behind it.
    const h = host();
    const card = createNoteCard(h);
    card.showNote([annoWith("a", "Read me")], "a");
    h.querySelector<HTMLButtonElement>(".archie-note-card__expand")!.click();
    card.hide();
    expect(sheetLayer(h).hidden).toBe(true);
  });
});
