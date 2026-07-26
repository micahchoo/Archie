<script lang="ts">
  // THE NOTE (annomea popup; CONTEXT §123) — the viewer's ONE note-content renderer, at two sizes.
  //
  // Archie-c982 settled that a note has a single home. Three surfaces, three jobs: the sidebar list is
  // the INDEX (it locates, it never re-reads), this component is THE NOTE, and `ReadingSheet` is this
  // component at `size="sheet"` inside a focus-trapped shell. The sheet is not a second content surface,
  // so V64 — the expanded view carrying LESS identity than the card it came from — cannot recur: one
  // renderer cannot have two headers. Prior art: annomea's NarrativePane (ADR-0021) is ONE pane at
  // mini/half/full, and its ADR-0007 is explicit that the popup IS the note surface, popup OR drawer,
  // one at a time.
  //
  // Still ONE component across both readers (grid Reader and NarrativeReader) — the mode difference is
  // the eyebrow's CONTENT (object, vs "section · object"), which is data. Pure presentational: the HOST
  // owns selection and expand; this reflects content and calls back.
  //
  // Archie-01a6 removed the footer stepper. It stepped OBJECTS (grid) or SECTIONS (narrative) — never
  // notes — so it acted on a different noun than its container, and it existed only while the sidebar
  // was collapsed. That nav now lives in the canvas chrome of both readers, visible in both states.
  import ProseCites from "./ProseCites.svelte";
  import NoteMedia from "./NoteMedia.svelte";
  import { noteSurfaceName } from "../product-copy.js";
  import type { NoteMediaItem } from "@render/core";

  let {
    eyebrow,
    text = "",
    media = [],
    tags = [],
    geoCoord = null,
    size = "card",
    onclose,
    onexpand,
    onopenfinder,
    onmedia,
  }: {
    /** Orientation label (eyebrow-first rhythm #4): grid = object label; narrative = "Section · object". */
    eyebrow: string;
    /** The media-stripped note prose (rendered rich, with cite link-scent). Empty ⇒ no body / no ⤢. */
    text?: string;
    media?: NoteMediaItem[];
    tags?: string[];
    geoCoord?: string | null;
    /** `"card"` = the floating callout anchored bottom-left over the canvas (the default, and the only
     *  size that positions itself). `"sheet"` = the SAME note at reading size — wider measure, larger
     *  type, paper ink, statically placed — for `ReadingSheet` to centre inside its dialog shell. The
     *  card's own chrome (close, expand-to-read, the focus pull) belongs to the card: at sheet size the
     *  shell owns dismissal and focus, and ⤢ would offer to expand what is already expanded. */
    size?: "card" | "sheet";
    onclose: () => void;
    /** Expand to the centred reading sheet (prose) / lightbox (media-only) — the host decides which. */
    onexpand: () => void;
    onopenfinder?: (tag: string) => void;
    onmedia?: (idx: number) => void;
  } = $props();

  const isCard = $derived(size === "card");

  // V61/V62 — the card had no role, no accessible name, and no focus behaviour at all. Measured on the
  // MARKER path, `document.activeElement` stayed `.openseadragon-canvas` after the card appeared, so a
  // screen-reader user got no announcement and no focus change: the sidebar's own instruction ("Select a
  // note, or a marker on the image") led to silence. And dismissing via `×` dropped focus on
  // `document.body`, while Escape correctly returned it.
  //
  // This is deliberately NOT a modal: the card floats beside a still-usable canvas, so `aria-modal` and a
  // focus trap would be a lie in the other direction. A named region that can take programmatic focus is
  // the honest shape.
  //
  // Card-only. At `size="sheet"` the surrounding `ReadingSheet` is a real modal: `use:dialog` moves
  // focus in, traps Tab and returns focus on close. A second focus-grab from inside it would fight the
  // trap for the initial landing spot, and the "return focus to the trigger" teardown would fire on a
  // trigger the dialog is already restoring.
  let root = $state<HTMLElement | null>(null);
  $effect(() => {
    const el = root;
    if (!el || !isCard) return;
    const trigger = document.activeElement as HTMLElement | null;
    // Only pull focus when it is sitting on the CANVAS — i.e. the card was opened by activating a marker,
    // the path that announced nothing. Opening from a sidebar card leaves focus where the reader put it,
    // so the existing keyboard flow through the notes list is untouched.
    const fromMarker = !!trigger?.closest?.(".openseadragon-canvas, .openseadragon-container");
    if (fromMarker) el.focus({ preventScroll: true });
    return () => {
      // Return focus on ANY dismissal (× or Escape or selection change), not just the one that happened to
      // work. Guarded so we never yank focus the reader has since moved somewhere else deliberately.
      const active = document.activeElement;
      const strandedOrInside = active === document.body || active === null || el.contains(active);
      if (trigger?.isConnected && strandedOrInside) trigger.focus({ preventScroll: true });
    };
  });
</script>

<!-- Root classes, and why there are three of them:
     `note-surface` = the content renderer, shared by both sizes — every type/media/tag rule keys off it.
     `note-pop`     = the CARD's identity: its absolute anchoring, and the handle the two readers'
                      `getFitOptions` reservation (Archie-40fe) queries to know what is covering the
                      canvas's left flank. Sheet-size deliberately does NOT carry it — a centred modal
                      is not left-flank occlusion, and the canvas is not being fitted behind a scrim.
     `sheet-size`   = the reading-size overrides (measure, type scale, paper ink).
     `tabindex="-1"` = programmatically focusable, never a tab stop of its own. Kept STATIC on both
     sizes: `use:dialog`'s focusable query excludes `[tabindex="-1"]`, so inside the sheet it changes
     nothing, and a dynamic expression here is a value svelte-check cannot prove is negative. -->
<div
  class="note-surface"
  class:note-pop={isCard}
  class:sheet-size={!isCard}
  bind:this={root}
  tabindex="-1"
  role={isCard ? "region" : undefined}
  aria-label={isCard ? noteSurfaceName(eyebrow) : undefined}
>
  <header class="np-head">
    <p class="np-eyebrow">{eyebrow}</p>
    {#if isCard}
      <!-- Card-only chrome. The sheet's shell owns its own × (and is the thing Escape closes); ⤢ would
           offer to expand a note that is already at reading size. -->
      <div class="np-actions">
        {#if text}<button class="np-icon expand" onclick={onexpand} title="Expand to read" aria-label="Expand note to a reading sheet">⤢</button>{/if}
        <button class="np-icon close" onclick={onclose} aria-label="Close note" title="Close note">×</button>
      </div>
    {/if}
  </header>
  <div class="np-body">
    {#if text}<div class="note-body"><ProseCites {text} /></div>{/if}
    <NoteMedia {media} onopen={(idx) => onmedia?.(idx)} />
    {#if geoCoord}<p class="geo-coord" title="Longitude / latitude">{geoCoord}</p>{/if}
    <!-- Tag chips are clickable (Q-4): open the finder pre-scoped with that tag as a facet. -->
    {#if tags.length}<div class="tags">{#each tags as t}<button type="button" class="tag tag-btn" onclick={() => onopenfinder?.(t)}>#{t}</button>{/each}</div>{/if}
  </div>
</div>

<style>
  /* ONE note surface at two sizes (Archie-dbbc). The shared rules live on `.note-surface`; `.note-pop`
     adds only the CARD's anchoring and box, `.sheet-size` only the reading-size overrides. Anything
     added below the fold here lands in the sheet the same day it lands in the card — which is the
     structural half of the fix for V64 (the expanded view carrying less than the card it came from).

     The ink split rides three custom properties rather than duplicated rule bodies: the card floats
     over the dark canvas ground (canvas ink), the sheet sits on warm paper inside its shell (paper
     ink), and every rule between them names the variable, not the palette. */
  .note-surface {
    --np-ink: var(--ink-canvas-primary);
    --np-ink-2: var(--ink-canvas-secondary);
    --np-ink-muted: var(--ink-canvas-muted);
    --np-body-size: 1rem;
    display: flex; flex-direction: column; gap: var(--space-3);
    color: var(--np-ink);
  }

  /* THE SAME NOTE AT READING SIZE — no anchoring and no box of its own (ReadingSheet's shell supplies
     the paper, the padding and the shadow), a generous measure and a step up in type. It fills the
     shell so `.np-body` keeps the scroll the retired `.sheet-body` used to own. */
  .sheet-size {
    --np-ink: var(--ink-paper-primary);
    --np-ink-2: var(--ink-paper-secondary);
    --np-ink-muted: var(--ink-paper-muted);
    --np-body-size: 1.15rem;
    flex: 1; min-height: 0;
    max-width: 62ch;
  }

  /* THE CARD — a warm paper callout floating bottom-left over the canvas ground. A header (eyebrow +
     ⤢/× icons) tops the card and the note body scrolls if tall. Green (--accent) left edge = the note
     signal. Positioned absolute against the host's relative container. */
  .note-pop {
    /* z-index 30 (Archie-b42d), not the original 5: the popup is anchored near the viewport BOTTOM and,
       for a short note, its trailing NoteMedia tile row commonly lands inside the Filmstrip's fixed
       bottom band (.filmstrip, z-index 25, full-width) — at z:5 the filmstrip painted over the tile AND
       ate its clicks (measured: elementFromPoint at the tile's center returned the filmstrip's <ul>, and
       a real click there never opened the lightbox). 30 matches the existing "floats above the ambient
       Filmstrip" tier ExhibitView already uses for .finder-trigger/.arrival/.to-read/.partial-note — the
       popup is the user-opened foreground card, filmstrip is passive chrome; it should win the same way. */
    /* V71 (Archie-40fe): winning the z-fight was the right call and is NOT the whole answer — the card
       still overlapped the band by 74px and covered SIX of twelve frames, silently removing half the
       survey affordance the reader was using a moment earlier, with no reflow and no acknowledgement.
       Clearing `--strip-h` (Filmstrip's live measured height, the bottom mirror of --topbar-h) means
       the card sits ABOVE the band instead of on it, so both surfaces stay usable at once. The z-index
       note below still applies: the tiers are unchanged, they simply no longer overlap. */
    position: absolute; left: var(--space-5);
    bottom: calc(var(--strip-h, 0px) + var(--space-3)); z-index: 30;
    max-width: min(46ch, 46%);
    min-width: min(320px, calc(100vw - 2 * var(--space-5)));
    /* Height budget shrinks by the band too, or a tall note reclaims the space the offset just bought. */
    max-height: calc(100vh - var(--topbar-h) - var(--strip-h, 0px) - var(--space-5) - var(--space-4));
    padding: var(--space-4);
    background: var(--surface-canvas-raised);
    border: none; border-left: 2px solid var(--accent);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-mid);
  }
  /* Header — eyebrow on the left, the ⤢ expand / × close icons on the right (flowed in a row, not
     absolutely positioned over the body's first line). At sheet size the icons are absent and the
     eyebrow becomes the sheet's visible title — the same string the dialog is NAMED by (V64). */
  .np-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
  .np-eyebrow { margin: 0; font-family: var(--font-ui); font-size: 0.7rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.16em; color: var(--np-ink-2); line-height: 1.4; }
  /* Reading size gives the identity a little more room and a rule under it, so the sheet OPENS by
     saying what you are reading rather than dropping you into prose (quire: expanded views lead with
     the work's identity). Padding-right clears the shell's own × in the same corner. */
  .sheet-size .np-eyebrow { width: 100%; font-size: 0.75rem; padding-right: var(--space-6); padding-bottom: var(--space-3); border-bottom: 1px solid var(--border-paper-emphasis); }
  .np-actions { display: inline-flex; align-items: center; gap: var(--space-3); flex: none; }
  .np-icon { background: none; border: none; cursor: pointer; padding: 0; line-height: 1; color: var(--np-ink-muted); transition: color 160ms ease; }
  .np-icon.close { font-size: 1.2rem; }
  .np-icon.close:hover { color: var(--accent); }
  /* Expand-to-read — quiet cord-blue affordance beside the close, opens the centred reading sheet. */
  .np-icon.expand { font-size: 0.95rem; }
  .np-icon.expand:hover { color: var(--accent-2); }
  /* The note body scrolls if tall, while the header stays put. */
  .np-body { flex: 1; min-height: 0; overflow-y: auto; }
  .note-body { font-family: var(--font-body); font-size: var(--np-body-size); line-height: 1.65; color: var(--np-ink); }
  .sheet-size .note-body { line-height: 1.7; }
  .note-body :global(p) { margin: 0 0 var(--space-2); }
  .note-body :global(p:last-child) { margin-bottom: 0; }
  .note-body :global(strong) { font-weight: 600; }
  .note-body :global(em) { font-style: italic; }
  .note-body :global(a) { color: var(--accent-2); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.15em; cursor: pointer; }
  .note-body :global(a[href*="#/"]:not(.cite-card))::after { content: "¶" / ""; margin-left: 0.15em; font-size: 0.7em; vertical-align: 0.35em; opacity: 0.6; text-decoration: none; }
  /* Note images render as thumbnails — click opens the lightbox. */
  .note-body :global(img) { display: block; max-width: 100%; max-height: 180px; height: auto; margin-top: var(--space-2); border-radius: var(--radius-sm); cursor: zoom-in; }
  .geo-coord { margin: var(--space-2) 0 0; font-family: var(--font-mono); font-size: 0.72rem; letter-spacing: 0.08em; color: var(--np-ink-muted); }
  .tags { margin-top: var(--space-3); display: flex; flex-wrap: wrap; gap: var(--space-3); }
  .tag { font-family: var(--font-ui); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--np-ink-2); }
  /* Clickable tag chip (Q-4 facet trigger) — button reset over the chip look; hover lifts to the
     connector accent (the cross-cutting discovery affordance). */
  .tag-btn { background: none; border: none; padding: 0; cursor: pointer; transition: color 160ms ease; }
  .tag-btn:hover { color: var(--accent-2); }
  /* (The footer stepper is gone — Archie-01a6. It stepped objects/sections, not notes, and only while
     the sidebar was collapsed. The canvas chrome of both readers now carries that nav in both states.) */
</style>
