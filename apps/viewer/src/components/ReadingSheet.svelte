<script lang="ts">
  // Reading sheet — a SHELL, not a content surface (Archie-dbbc / the decision in Archie-c982).
  //
  // What it owns, and all it owns: the scrim, `role="dialog" aria-modal="true"`, `use:dialog` (the
  // focus trap V63 installed), and the × that closes it. What it SHOWS is `NotePopup` at
  // `size="sheet"` — the same component the floating card is, at reading size.
  //
  // It used to render the prose itself, through its own ProseCites at its own type scale, with a
  // `label` prop that no caller ever passed. Two consequences, both measured:
  //
  //   V64 — the sheet's accessible name was the default literal "Note" while the card it expanded
  //         from said "Note — Herbal, f1r". Expanding to read LOST the identity at the moment the
  //         reader asked for more. It cannot recur now: `eyebrow` reaches the dialog's `aria-label`
  //         and the rendered header through the SAME value, so there is nothing to keep in sync.
  //   V60 — the sheet showed only the prose, so the note's media, tags and geo readout silently
  //         disappeared on expand. One renderer means the sheet gains every field the card has.
  //
  // Prior art: annomea's NarrativePane (ADR-0021) is ONE pane at mini/half/full — a size control over
  // a single surface, not a second surface. Its ADR-0007: the popup IS the note surface, popup OR
  // drawer, one at a time. quire's expanded views lead with the work's identity (the eyebrow's rule).
  import NotePopup from "./NotePopup.svelte";
  import { dialog } from "../lib/dialog-a11y.js";
  import { noteSurfaceName } from "../product-copy.js";
  import type { NoteMediaItem } from "@render/core";

  let { eyebrow, text = "", media = [], tags = [], geoCoord = null, onclose, onopenfinder, onmedia }: {
    /** The card's orientation label, carried through unchanged — this is what makes the sheet say what
     *  you are reading (V64). Same prop, same string, same `noteSurfaceName` call as the card. */
    eyebrow: string;
    text?: string;
    media?: NoteMediaItem[];
    tags?: string[];
    geoCoord?: string | null;
    onclose: () => void;
    onopenfinder?: (tag: string) => void;
    onmedia?: (idx: number) => void;
  } = $props();

  // V63: this sheet declared `role="dialog" aria-modal="true"` and implemented NONE of it — no focus
  // trap, no initial focus, no focus return — while the shared `use:dialog` action (whose own header
  // names "the NoteLightbox and the SearchOverlay" as its users) sat one import away. A false ARIA claim
  // is worse than an absent one: assistive tech acts on the assertion. The action owns ESC too, so the
  // window handler that used to live here is gone — keeping it would double-close.
</script>

<!-- Scrim + sheet as SIBLINGS (NoteLightbox pattern): clicks inside the sheet don't reach the scrim,
     so no stopPropagation; the scrim is a click-to-close backdrop and Esc closes via the window. -->
<div class="sheet-scrim" role="presentation" onclick={onclose}></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label={noteSurfaceName(eyebrow)} use:dialog={{ onclose }}>
  <button class="sheet-close" onclick={onclose} aria-label="Close reading sheet">×</button>
  <!-- `onexpand` is a no-op here by construction: NotePopup renders no ⤢ at sheet size (you are already
       expanded), so nothing can call it. It stays a required prop because the CARD needs it. -->
  <NotePopup size="sheet" {eyebrow} {text} {media} {tags} {geoCoord} {onclose} onexpand={() => {}} {onopenfinder} {onmedia} />
</div>

<style>
  /* Same warm dim + blur as NoteLightbox (visual consistency) — the read stays the star. */
  .sheet-scrim { position: fixed; inset: 0; background: var(--scrim-dim); backdrop-filter: blur(3px); z-index: 60; }
  .sheet {
    position: fixed; z-index: 61; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(92vw, 680px); max-height: 86vh; box-sizing: border-box;
    display: flex; flex-direction: column;
    padding: var(--space-7, var(--space-6)) var(--space-7, var(--space-6)) var(--space-6);
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border: none; border-radius: var(--radius-lg, var(--radius-md));
    box-shadow: var(--shadow-lift-mid);
  }
  .sheet-close {
    position: absolute; top: var(--space-3); right: var(--space-3);
    width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
    font-size: 1.4rem; line-height: 1; cursor: pointer;
    background: none; border: none; color: var(--ink-paper-muted);
    border-radius: 999px; transition: color 160ms ease, background 160ms ease;
  }
  .sheet-close:hover { color: var(--accent); background: var(--surface-paper-hover); }
  .sheet-close:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 1px; }
  /* The reading measure and the scroll now live in NotePopup's `.sheet-size` — the shell only supplies
     the paper and the box. (`.sheet-body` is gone with the sheet's own ProseCites.) */
  @media (prefers-reduced-motion: reduce) {
    .sheet-close { transition: none; }
  }
</style>
