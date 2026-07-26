// TEXT-ONLY note card for the <archie-viewer> embed (the read-overlay selection seam's missing half).
//
// The read-only reader (reader.ts → render-mount) already DRAWS region shapes and FIRES selection
// (read-overlay.ts onSelect → id|null). Until now the embed showed the outline but NO body text. This
// module is the plain-DOM analogue of the full viewer's NotePopup.svelte: a floating card that, on a
// non-null selection, shows the selected annotation's body; on a null/empty selection, hides.
//
// SECURITY: `show(html)` sets `card.innerHTML = html` where `html` is the ALREADY-SANITIZED output of
// render-core's renderMarkdown (snarkdown → DOMPurify). The element wires that pipeline (noteBodyHtml
// below). This is the SAME safe pattern the full viewer uses via `{@html renderMarkdown(...)}` — never
// pass raw/unsanitized body text here. (Unrelated to read-overlay's selector-geometry no-innerHTML
// rule, which is about selector VALUES, not body HTML.)
//
// Scope is TEXT-ONLY: media tiles, cite hovercards, and the reading legend are explicit follow-ons.

import {
  commentOfAnnotation,
  renderMarkdown,
  type W3CAnnotation,
} from "@render/core";

/** The card controller the element drives: show a body, hide it, or tear it down. */
export interface NoteCard {
  /** Show the card carrying `safeHtml` (the SANITIZED renderMarkdown output). Empty/"" → hide instead. */
  show(safeHtml: string): void;
  /** Hide the card (a null/empty selection, or a teardown). */
  hide(): void;
  /** Remove the card element from the host (reader teardown / object change). */
  destroy(): void;
}

// DOCKED (2026-07-26, ADR-0019's layout row). The card sits in its own row under the canvas
// (`.reader-note`), so it is a plain block with no anchoring at all.
//
// What that replaced, because it is the clearest small case for the whole ruling: V55 measured
// 8970px² of overlap between this card and the OSD locator mini-map — both wanted the bottom-right
// corner, since read-mount asks for `navigatorPosition: "BOTTOM_RIGHT"` (read-mount.ts:245) and the
// card anchored there too, so opening a note buried the one control that says where you are in the
// image. The fix was the shell's reservation idiom: `--archie-locator-h`, published by reader.ts from
// the navigator's MEASURED height (a literal would be wrong at every container size, since OSD sizes
// the navigator as a ratio of the viewer). Docking removes the corner contest instead of arbitrating
// it, and the measurement with it.
const CARD_STYLE = [
  "max-height:100%",
  "box-sizing:border-box",
  "overflow:auto",
  "padding:14px 16px",
  "background:#fffdfb",
  "color:#2a2320",
  "border:none",
  "border-left:2px solid #3A8C5D",
  "font:inherit",
  "font-size:.95rem",
  "line-height:1.45",
  "position:relative",
].join(";");

const DISMISS_STYLE = [
  "position:absolute",
  "top:6px",
  "right:8px",
  "border:none",
  "background:transparent",
  "color:#6b5d52",
  "font-size:1.1rem",
  "line-height:1",
  "cursor:pointer",
  "padding:2px 4px",
].join(";");

/**
 * Build a note card inside `host` — the reader's note ROW (`.reader-note`), below the canvas. The card
 * starts hidden; `show` reveals it with sanitized HTML, `hide`/dismiss conceals it. Returns the
 * controller. The host imposes the height cap; the card fills it and scrolls.
 */
export function createNoteCard(host: HTMLElement): NoteCard {
  const doc = host.ownerDocument;
  const card = doc.createElement("div");
  card.className = "archie-note-card";
  card.setAttribute("role", "complementary");
  card.setAttribute("aria-label", "Note");
  card.style.cssText = CARD_STYLE;
  card.hidden = true;

  const dismiss = doc.createElement("button");
  dismiss.type = "button";
  dismiss.className = "archie-note-card__dismiss";
  dismiss.setAttribute("aria-label", "Close note");
  dismiss.textContent = "×"; // ×
  dismiss.style.cssText = DISMISS_STYLE;
  dismiss.addEventListener("click", () => hide());

  const body = doc.createElement("div");
  body.className = "archie-note-card__body";

  card.append(dismiss, body);
  host.appendChild(card);

  function show(safeHtml: string): void {
    if (typeof safeHtml !== "string" || safeHtml.length === 0) {
      hide();
      return;
    }
    // safeHtml is the DOMPurify-sanitized renderMarkdown output (see module header) — safe to inject.
    body.innerHTML = safeHtml;
    card.hidden = false;
  }

  function hide(): void {
    card.hidden = true;
    body.innerHTML = "";
  }

  function destroy(): void {
    card.remove();
  }

  return { show, hide, destroy };
}

/**
 * Resolve the SANITIZED body HTML for a selected annotation id from an object's annotation list — the
 * pure pipeline the element wires into the overlay's onSelect: match id → commentOfAnnotation (the body
 * text) → renderMarkdown (snarkdown → DOMPurify). A null/empty id, or an id with no matching annotation,
 * yields "" (the card hides). The overlay keys selection by `String(annotation.id)` (read-overlay.ts),
 * so we match the same way.
 */
export function noteBodyHtml(
  annotations: readonly W3CAnnotation[],
  id: string | null,
): string {
  if (!id) return "";
  const ann = annotations.find((a) => String(a.id) === id);
  if (!ann) return "";
  return renderMarkdown(commentOfAnnotation(ann));
}
