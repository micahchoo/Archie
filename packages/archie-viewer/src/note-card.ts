// The note surface for the <archie-viewer> embed: a docked CARD, and the READING SHEET it expands to.
//
// Both are drawn by ONE renderer (`renderNote`), which is the whole of Archie-dbbc's shape ported to
// plain DOM. The shell arrived here the hard way and the two defects it closed are worth restating,
// because a second renderer reintroduces both the day it is written:
//   V60 — the old sheet rendered prose ONLY, so a note's media vanished at the moment the reader asked
//         to see more of it.
//   V64 — the sheet named itself "Note" while the card it expanded from said "Note — Herbal, f1r", so
//         expanding LOST the note's identity.
// One renderer and one `noteSurfaceName` mean neither can drift back (ReadingSheet.svelte:1-6, :49,
// which is now a shell around `<NotePopup size="sheet">` and nothing else).
//
// LAZY BY CONSTRUCTION. This module is reached only through `await import("./note-card.js")`, from
// #openObject and from av-player.ts — both already past the reader boundary. It used to be a STATIC
// import in element.ts even though every call site was past that boundary, which put its whole graph
// (and now splitNoteMedia's) on the page-load path for nothing. See
// .claude/rules/archie-viewer-eager-closure.md: "keep code that only runs past the boundary in a
// module past the boundary".
//
// SECURITY: prose reaches innerHTML ONLY as `renderMarkdown` output (snarkdown → DOMPurify). Media
// URLs reach a live `src` ONLY after `splitNoteMedia`'s `isSafeMediaUrl` gate (media.ts:48), which
// rejects `javascript:`/`file:`/`data:text/html` and leaves the rejected URL in the prose to be
// sanitized there instead. Labels and captions are `textContent`, never HTML.

import {
  commentOfAnnotation,
  renderMarkdown,
  splitNoteMedia,
  type NoteMediaItem,
  type W3CAnnotation,
} from "@render/core";

/** A note's body, split into sanitized prose and the media the author embedded in it. */
export interface NoteParts {
  /** DOMPurify-sanitized HTML for the prose, with media references already lifted out. */
  html: string;
  /** The note's media, in document order (`splitNoteMedia`). `alt` is the author's own description. */
  media: NoteMediaItem[];
}

/** The card controller the element drives. */
export interface NoteCard {
  /** Show the note `id` from `annotations`. A null/unknown id (or an empty note) hides the card. */
  showNote(annotations: readonly W3CAnnotation[], id: string | null): void;
  /** Hide the card (a null selection, or a teardown). Also closes the sheet. */
  hide(): void;
  /** Remove the card AND its sheet layer from the host (reader teardown / object change). */
  destroy(): void;
}

/**
 * Resolve a selected annotation id to its renderable parts.
 *
 * `splitNoteMedia` runs BEFORE `renderMarkdown`, and the order is the point: it removes the media
 * references from the body, so the prose we render is already free of them and the pictures are ours
 * to lay out. Without it `renderMarkdown` passes `![alt](url)` straight through to DOMPurify as a raw
 * `<img>` — which is what this embed shipped: an unconstrained remote image at its natural width
 * inside a 38%-height scrolling row, with the author's description reachable only as an `alt`
 * attribute. (Measured 2026-07-26 against `voynich.ts:237`. ADR-0019's row said the embed "drops"
 * note media; it did not — it rendered them unmanaged, which is a different defect with a different
 * fix, and the row has been corrected.)
 */
export function noteParts(
  annotations: readonly W3CAnnotation[],
  id: string | null,
): NoteParts {
  if (!id) return { html: "", media: [] };
  const ann = annotations.find((a) => String(a.id) === id);
  if (!ann) return { html: "", media: [] };
  const { media, text } = splitNoteMedia(commentOfAnnotation(ann));
  return { html: renderMarkdown(text), media };
}

// ---------------------------------------------------------------------------------------------
// Styles. Written against the shared token layer (tokens.ts) like element.ts's own rules — never
// against literals, which is what V9/V31/V69 were about.
// ---------------------------------------------------------------------------------------------
const NOTE_STYLES = `
  .archie-note-card {
    max-height: 100%; box-sizing: border-box; overflow: auto; padding: var(--space-4) var(--space-5);
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border: none; border-left: 2px solid var(--accent);
    font: inherit; font-size: .95rem; line-height: 1.45; position: relative;
  }
  .archie-note-card__actions { position: absolute; top: 6px; right: 8px; display: flex; gap: 2px; }
  .archie-note-card__actions button {
    border: none; background: transparent; color: var(--ink-paper-secondary);
    font-size: 1.1rem; line-height: 1; cursor: pointer; padding: 2px 5px; border-radius: var(--radius-sm);
  }
  .archie-note-card__actions button:hover { color: var(--accent-2); background: var(--surface-paper-hover); }

  /* Media strip — the shell's NoteMedia.svelte tile in plain DOM (132x92, zoom-in cursor). The fixed
     tile is Archie's own shell idiom; no corpus viewer constrains a body image on the read side
     (clover renders it at natural width, annomea caps it at container width — see the ledger). */
  .archie-note-media { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }
  .archie-note-media button.tile {
    position: relative; width: 132px; height: 92px; padding: 0; overflow: hidden; cursor: zoom-in;
    border: 1px solid var(--border-paper); border-radius: var(--radius-sm); background: var(--surface-paper-card);
  }
  .archie-note-media button.tile:hover { border-color: var(--accent-2); }
  .archie-note-media button.tile > img, .archie-note-media button.tile > video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .archie-note-media .badge {
    position: absolute; right: 4px; bottom: 3px; padding: 0 4px; border-radius: var(--radius-sm);
    background: var(--accent-2); color: var(--surface-canvas-raised); font-size: .7rem; line-height: 1.4;
  }
  .archie-note-media .wave { display: flex; align-items: center; justify-content: center; gap: 2px; width: 100%; height: 100%; }
  .archie-note-media .wave i { display: block; width: 3px; background: var(--accent-2); border-radius: 2px; }
  .archie-note-media .tile-failed {
    display: grid; place-items: center; width: 132px; height: 92px; padding: 0 var(--space-2);
    border: 1px dashed var(--border-paper); border-radius: var(--radius-sm);
    color: var(--ink-paper-muted); font-size: .78rem; text-align: center;
  }

  /* The reading sheet. ABSOLUTE within the element (':host' is position:relative), never 'fixed':
     an embed must stay inside its own box — a fixed overlay would be clipped by the host's iframe
     anyway, and escaping to document.body (the shell's ProseCites portal trick) would leave the
     shadow root and lose every token this file styles against. */
  .archie-note-sheet-layer { position: absolute; inset: 0; z-index: 60; display: grid; place-items: center; }
  .archie-note-sheet-scrim { position: absolute; inset: 0; background: var(--moss-shadow); opacity: .55; }
  /* Scrim and sheet are SIBLINGS, not nested — the shell's idiom (NoteLightbox.svelte:38/43,
     ReadingSheet.svelte:48/49). That is precisely why no stopPropagation appears anywhere here:
     a click inside the sheet can never reach the scrim. */
  .archie-note-sheet {
    position: relative; width: min(92%, 680px); max-height: 86%; box-sizing: border-box;
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border-radius: var(--radius-md); box-shadow: var(--shadow-lift-mid);
  }
  .archie-note-sheet__head { display: flex; justify-content: flex-end; padding: var(--space-2) var(--space-2) 0; }
  .archie-note-sheet__head button {
    border: none; background: transparent; color: var(--ink-paper-secondary);
    font-size: 1.2rem; line-height: 1; cursor: pointer; padding: 4px 7px; border-radius: var(--radius-sm);
  }
  .archie-note-sheet__head button:hover { color: var(--accent-2); background: var(--surface-paper-hover); }
  .archie-note-sheet__body {
    overflow: auto; padding: 0 var(--space-6) var(--space-6);
    font-size: 1.05rem; line-height: 1.6; max-width: 62ch;
  }
  /* At sheet size the media is the point, so it is shown rather than tiled — capped to the sheet's
     width (annomea app.css:101 is the same container cap) with the author's description as a VISIBLE
     caption. clover-iiif Image.tsx:18 is the precedent for the caption: it renders the body's own
     description as text beside a templated alt, rather than hiding it in an attribute. */
  .archie-note-sheet .archie-note-figures { display: flex; flex-direction: column; gap: var(--space-4); margin-top: var(--space-4); }
  .archie-note-sheet figure { margin: 0; }
  .archie-note-sheet figure > img, .archie-note-sheet figure > video, .archie-note-sheet figure > audio {
    display: block; width: 100%; max-width: 100%; border-radius: var(--radius-sm);
  }
  .archie-note-sheet figcaption { margin-top: var(--space-2); font-size: .85rem; color: var(--ink-paper-secondary); }
  .archie-note-sheet .figure-failed { padding: var(--space-3); border: 1px dashed var(--border-paper); border-radius: var(--radius-sm); color: var(--ink-paper-muted); font-size: .85rem; }
`;

/**
 * Where the styles and the sheet layer attach.
 *
 * In the element this is always the ShadowRoot — the sheet must cover the whole embed, and `:host` is
 * the positioned ancestor it sizes against (element.ts:76). A `Document` root only happens in unit
 * tests, which mount a bare host into `document.body`; appending straight to a Document is illegal
 * (one element allowed), so fall back to `<body>` there rather than making every test build a shadow
 * root it does not otherwise need.
 */
function mountPoint(root: ShadowRoot | Document, doc: Document): ParentNode {
  // nodeType, not `instanceof`: under happy-dom the test realm's `Document` is not the same
  // constructor as the global one the check would compare against, so `instanceof` is silently false
  // and we would append straight to the Document again. 9 = DOCUMENT_NODE, 11 = DOCUMENT_FRAGMENT
  // (which is what a ShadowRoot is).
  return root.nodeType === 9 ? ((root as Document).body ?? doc.body) : (root as ShadowRoot);
}

/** Inject this module's rules ONCE per root (the card is re-created on every object open). */
function ensureStyles(root: ShadowRoot | Document, doc: Document): void {
  if (root.querySelector("style[data-archie-note]")) return;
  const style = doc.createElement("style");
  style.setAttribute("data-archie-note", "");
  style.textContent = NOTE_STYLES;
  mountPoint(root, doc).appendChild(style);
}

/** Deterministic bar heights for the audio tile — decoration standing in for a waveform, never a
 *  decode (the shell's NoteMedia.svelte:10 does the same, with the same arithmetic). */
const BARS = Array.from({ length: 11 }, (_, b) => 28 + ((b * 53) % 64));

/**
 * The accessible name for a media control.
 *
 * The `alt` contract (media.ts:12-22) is that ABSENT means "the author wrote no description" and is
 * NOT the same as `""`, which is a positive claim that a picture is decorative. So the description is
 * appended when present and simply omitted when not — never substituted with a placeholder, and never
 * collapsed to `alt=""` on a control that has no other name.
 */
function mediaLabel(m: NoteMediaItem, verb: string): string {
  return m.alt ? `${verb} ${m.kind}: ${m.alt}` : `${verb} ${m.kind}`;
}

/**
 * Render one note into `body` — THE shared content renderer, used at both sizes.
 *
 * `failed` is keyed by URL and NOT by index, and that is load-bearing rather than a style choice: one
 * card element is reused across every note in an object, so an index-keyed set bleeds a broken tile
 * onto the next note's healthy tile at the same position. The shell records the same bite at
 * NoteMedia.svelte:12-17.
 */
function renderNote(
  body: HTMLElement,
  parts: NoteParts,
  opts: { size: "card" | "sheet"; failed: Set<string>; onmedia?: ((index: number) => void) | undefined },
): void {
  const doc = body.ownerDocument;
  body.textContent = "";

  if (parts.html) {
    const prose = doc.createElement("div");
    prose.className = "archie-note-card__prose";
    // Sanitized renderMarkdown output (see the module header) — safe to inject.
    prose.innerHTML = parts.html;
    body.appendChild(prose);
  }
  if (parts.media.length === 0) return;

  if (opts.size === "card") {
    const strip = doc.createElement("div");
    strip.className = "archie-note-media";
    parts.media.forEach((m, i) => {
      if (opts.failed.has(m.url)) {
        const dead = doc.createElement("span");
        dead.className = "tile-failed";
        dead.textContent = "Couldn't load";
        strip.appendChild(dead);
        return;
      }
      const tile = doc.createElement("button");
      tile.type = "button";
      tile.className = `tile ${m.kind}`;
      // The BUTTON carries the accessible name; its child image is decorative-by-default. Labelling
      // both double-announces (NoteMedia.svelte:23-25, :33).
      tile.setAttribute("aria-label", mediaLabel(m, "Open"));
      const fail = (): void => { opts.failed.add(m.url); renderNote(body, parts, opts); };
      if (m.kind === "image") {
        const img = doc.createElement("img");
        img.src = m.url;
        img.alt = "";
        img.loading = "lazy";
        img.addEventListener("error", fail);
        tile.appendChild(img);
      } else if (m.kind === "video") {
        const vid = doc.createElement("video");
        vid.src = m.url;
        vid.muted = true;
        vid.preload = "metadata"; // yields the first frame as a poster without a full fetch
        vid.tabIndex = -1; // the button is the control; keep the media out of the tab order
        vid.addEventListener("error", fail);
        const badge = doc.createElement("span");
        badge.className = "badge";
        badge.setAttribute("aria-hidden", "true");
        badge.textContent = "▶";
        tile.append(vid, badge);
      } else {
        const wave = doc.createElement("span");
        wave.className = "wave";
        wave.setAttribute("aria-hidden", "true");
        for (const h of BARS) {
          const bar = doc.createElement("i");
          bar.style.height = `${h}%`;
          wave.appendChild(bar);
        }
        const badge = doc.createElement("span");
        badge.className = "badge";
        badge.setAttribute("aria-hidden", "true");
        badge.textContent = "♪";
        tile.append(wave, badge);
      }
      tile.addEventListener("click", () => opts.onmedia?.(i));
      strip.appendChild(tile);
    });
    body.appendChild(strip);
    return;
  }

  // Sheet size: show the media, with the author's description as a visible caption.
  const figures = doc.createElement("div");
  figures.className = "archie-note-figures";
  for (const m of parts.media) {
    const fig = doc.createElement("figure");
    if (opts.failed.has(m.url)) {
      const dead = doc.createElement("p");
      dead.className = "figure-failed";
      dead.textContent = m.alt ? `Couldn't load this ${m.kind}: ${m.alt}` : `Couldn't load this ${m.kind}.`;
      fig.appendChild(dead);
      figures.appendChild(fig);
      continue;
    }
    const fail = (): void => { opts.failed.add(m.url); renderNote(body, parts, opts); };
    if (m.kind === "image") {
      const img = doc.createElement("img");
      img.src = m.url;
      // Here `alt` IS the element's own accessible name and there is no wrapping control to carry it,
      // so the description belongs on the image. `""` is the correct fallback for "no description"
      // (an unnamed image is decorative), which is the one place the empty string is right.
      img.alt = m.alt ?? "";
      img.addEventListener("error", fail);
      fig.appendChild(img);
    } else {
      const el = doc.createElement(m.kind === "video" ? "video" : "audio");
      el.src = m.url;
      el.controls = true;
      if (m.alt) el.setAttribute("aria-label", m.alt);
      el.addEventListener("error", fail);
      fig.appendChild(el);
    }
    if (m.alt) {
      const cap = doc.createElement("figcaption");
      cap.textContent = m.alt;
      fig.appendChild(cap);
    }
    figures.appendChild(fig);
  }
  body.appendChild(figures);
}

/** Everything inside `el` that can take focus. Excludes `[tabindex="-1"]`, and uses
 *  `getClientRects().length` rather than `offsetParent` — the latter is null for positioned
 *  elements, which every control in this sheet is (dialog-a11y.ts:39-40, :55-58). */
function focusables(el: HTMLElement): HTMLElement[] {
  const sel = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return [...el.querySelectorAll<HTMLElement>(sel)].filter((n) => n.getClientRects().length > 0);
}

/**
 * Build the note card inside `host` (the reader's `.reader-note` row, or the AV player's host), plus
 * the reading-sheet layer it expands into.
 */
export function createNoteCard(host: HTMLElement): NoteCard {
  const doc = host.ownerDocument;
  const root = host.getRootNode() as ShadowRoot | Document;
  ensureStyles(root, doc);

  // The failed-URL set outlives any one note, deliberately — see renderNote's docblock.
  const failed = new Set<string>();
  let parts: NoteParts = { html: "", media: [] };
  let sheetOpen = false;

  const card = doc.createElement("div");
  card.className = "archie-note-card";
  card.setAttribute("role", "complementary");
  card.setAttribute("aria-label", "Note");
  card.hidden = true;

  const actions = doc.createElement("div");
  actions.className = "archie-note-card__actions";

  const expand = doc.createElement("button");
  expand.type = "button";
  expand.className = "archie-note-card__expand";
  expand.setAttribute("aria-label", "Expand note to a reading sheet");
  expand.title = "Expand note to a reading sheet";
  expand.textContent = "⤢";
  expand.hidden = true;

  const dismiss = doc.createElement("button");
  dismiss.type = "button";
  dismiss.className = "archie-note-card__dismiss";
  dismiss.setAttribute("aria-label", "Close note");
  dismiss.textContent = "×";
  dismiss.addEventListener("click", () => hide());

  actions.append(expand, dismiss);

  const body = doc.createElement("div");
  body.className = "archie-note-card__body";

  card.append(actions, body);
  host.appendChild(card);

  // --- the reading sheet ------------------------------------------------------------------------
  const layer = doc.createElement("div");
  layer.className = "archie-note-sheet-layer";
  layer.hidden = true;

  const scrim = doc.createElement("div");
  scrim.className = "archie-note-sheet-scrim";
  scrim.addEventListener("click", () => closeSheet());

  const sheet = doc.createElement("div");
  sheet.className = "archie-note-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "Note");
  sheet.tabIndex = -1;

  const sheetHead = doc.createElement("div");
  sheetHead.className = "archie-note-sheet__head";
  const sheetClose = doc.createElement("button");
  sheetClose.type = "button";
  sheetClose.setAttribute("aria-label", "Close reading sheet");
  sheetClose.textContent = "×";
  sheetClose.addEventListener("click", () => closeSheet());
  sheetHead.appendChild(sheetClose);

  const sheetBody = doc.createElement("div");
  sheetBody.className = "archie-note-sheet__body";
  sheet.append(sheetHead, sheetBody);
  layer.append(scrim, sheet);
  // Mounted on the ROOT, not on `host`: the sheet covers the whole element (`:host` is
  // position:relative, element.ts:76), while `host` is one row of the reader's stage.
  mountPoint(root, doc).appendChild(layer);

  layer.addEventListener("keydown", (e) => {
    const ev = e as KeyboardEvent;
    if (ev.key === "Escape") {
      // Owned here, and stopped, so no ancestor handler can co-fire and double-close
      // (dialog-a11y.ts:72-76).
      ev.preventDefault();
      ev.stopPropagation();
      closeSheet();
      return;
    }
    if (ev.key !== "Tab") return;
    // Tab trap with wrap at BOTH ends — `aria-modal="true"` without one is a claim the DOM doesn't
    // honour (dialog-a11y.ts:176-190).
    const f = focusables(sheet);
    if (f.length === 0) { ev.preventDefault(); return; }
    const first = f[0]!;
    const last = f[f.length - 1]!;
    const active = (root as ShadowRoot).activeElement ?? doc.activeElement;
    if (ev.shiftKey && (active === first || active === sheet)) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && active === last) { ev.preventDefault(); first.focus(); }
  });

  function openSheet(): void {
    if (sheetOpen || (!parts.html && parts.media.length === 0)) return;
    sheetOpen = true;
    renderNote(sheetBody, parts, { size: "sheet", failed, onmedia: undefined });
    layer.hidden = false;
    // HIDDEN, NOT UNMOUNTED. Focus must return to the ⤢ that opened the sheet, and that button has to
    // still be in the document for `closeSheet` to find it. Unmounting the card would strand a
    // keyboard reader on nothing — and it fails in BOTH orderings, so "we'll sequence the effects" is
    // not an escape hatch (dialog-a11y.ts:10-37, Reader.svelte:456-460). `hidden` also takes the card
    // out of the a11y tree, which is the other half: a second legible copy of the note behind the
    // scrim was V60's defect.
    card.hidden = true;
    (focusables(sheet)[0] ?? sheet).focus();
  }

  function closeSheet(): void {
    if (!sheetOpen) return;
    sheetOpen = false;
    layer.hidden = true;
    sheetBody.textContent = "";
    // Closing the sheet is "read LESS", not "dismiss the note" — the card comes back and the
    // selection is untouched. Only the card's × clears the selection (Reader.svelte:551-556).
    card.hidden = false;
    expand.focus();
  }

  expand.addEventListener("click", () => openSheet());

  function showNote(annotations: readonly W3CAnnotation[], id: string | null): void {
    parts = noteParts(annotations, id);
    if (!parts.html && parts.media.length === 0) { hide(); return; }
    renderNote(body, parts, {
      size: "card",
      failed,
      // A tile opens the SHEET rather than a third surface. The shell needs a separate lightbox and
      // therefore needs a "one modal at a time" rule enforced at three call sites (Reader.svelte:
      // 557-571); collapsing enlarge into the sheet means the embed has exactly one overlay and the
      // stacking hazard cannot arise. Stated as a deliberate divergence in the ledger.
      onmedia: () => openSheet(),
    });
    // Nothing to expand when there is nothing to read (the shell gates ⤢ on text at
    // NotePopup.svelte:113-120; the embed gates on text OR media, since it has no separate lightbox
    // for a media-only note to open instead).
    expand.hidden = false;
    card.hidden = false;
  }

  function hide(): void {
    if (sheetOpen) closeSheet();
    card.hidden = true;
    expand.hidden = true;
    body.textContent = "";
    parts = { html: "", media: [] };
  }

  function destroy(): void {
    card.remove();
    layer.remove();
  }

  return { showNote, hide, destroy };
}
