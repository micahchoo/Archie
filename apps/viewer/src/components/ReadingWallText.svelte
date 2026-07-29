<script lang="ts">
  // The reading's WALL TEXT — its full voice at the threshold (readings redesign, plan 2026-07-29).
  // Entering a reading is entering a gallery room: the stage dims in the reading's colour and this
  // panel introduces the interpretation ONCE per visit; after that, chips switch instantly and the
  // legend's (i) reopens it on demand. Prior art: museum wall text, quire exhibition intros.
  //
  // A SHELL in ReadingSheet's sense (Archie-dbbc): scrim + `role="dialog"` + `use:dialog` (focus
  // trap / Esc / focus return) — the prose renders through the same ProseCites every other authored
  // body uses, so cites, hovercards and sanitization stay one pipeline. Single-scrim invariant
  // holds: this opens only from the legend's radios / (i), which live on canvas chrome — never from
  // inside another scrimmed surface.
  //
  // Dismissal IS entry — Esc, scrim-click and the button all mean "into the reading" (closing is
  // lossless, so nothing guards it). The host records seen-this-visit on close, not on open, so a
  // reload mid-read shows the text again rather than losing it.
  import ProseCites from "./ProseCites.svelte";
  import { dialog } from "../lib/dialog-a11y.js";
  import type { Reading } from "@render/core";

  let { reading, noteCount, sourceCount, onclose }: {
    reading: Reading;
    /** Exhibit-wide (the threshold speaks for the whole pass, unlike the legend's per-object counts). */
    noteCount: number;
    /** Objects carrying at least one of this reading's notes. */
    sourceCount: number;
    onclose: () => void;
  } = $props();

  // The full voice when authored; the one-line description is the honest fallback, never both.
  const text = $derived(reading.prose ?? reading.description ?? "");
  const colour = $derived(reading.colour ?? "var(--accent)");
</script>

<div class="wall-scrim" role="presentation" style:--rd={colour} onclick={onclose}></div>
<div class="wall" role="dialog" aria-modal="true" aria-label="Reading: {reading.name}" style:--rd={colour} use:dialog={{ onclose }}>
  <p class="eyebrow">A reading</p>
  <h2>{reading.name}</h2>
  <div class="prose"><ProseCites {text} /></div>
  <footer>
    <span class="meta">{noteCount} {noteCount === 1 ? "note" : "notes"} across {sourceCount} {sourceCount === 1 ? "source" : "sources"}</span>
    <button type="button" class="enter" onclick={onclose}>Enter reading →</button>
  </footer>
</div>

<style>
  /* Same warm dim + blur as the sheet/lightbox scrims, washed with the reading's own colour — the
     room you are entering announces its hue before a single mark is seen. */
  .wall-scrim {
    position: fixed; inset: 0; z-index: 60;
    background: color-mix(in srgb, var(--rd) 14%, transparent);
    backdrop-filter: blur(3px);
  }
  .wall-scrim::before { content: ""; position: absolute; inset: 0; background: var(--scrim-dim); }
  .wall {
    position: fixed; z-index: 61; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(92vw, 560px); max-height: 82vh; box-sizing: border-box;
    display: flex; flex-direction: column; gap: var(--space-3);
    padding: var(--space-6) var(--space-7, var(--space-6));
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border: none; border-top: 4px solid var(--rd); border-radius: var(--radius-lg, var(--radius-md));
    box-shadow: var(--shadow-lift-mid);
  }
  .eyebrow {
    margin: 0; font-family: var(--font-ui), monospace; font-size: 0.65rem; font-weight: 500;
    letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-paper-muted);
  }
  h2 { margin: 0; font-family: var(--font-display); font-weight: 300; font-size: 1.8rem; line-height: 1.2; }
  .prose { min-height: 0; overflow-y: auto; font-family: var(--font-body), sans-serif; line-height: 1.6; color: var(--ink-paper-secondary); }
  footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-top: var(--space-2); }
  .meta { font-family: var(--font-mono), monospace; font-variant-numeric: tabular-nums; font-size: 0.78rem; color: var(--ink-paper-muted); }
  .enter {
    padding: var(--space-2) var(--space-4); cursor: pointer; font: inherit; font-weight: 600; font-size: 0.9rem;
    color: var(--ink-paper-primary); background: none;
    border: 1px solid var(--rd); border-radius: 999px;
    box-shadow: inset 0 -2px 0 var(--rd);
    transition: background 160ms ease;
  }
  .enter:hover { background: var(--surface-paper-hover); }
  .enter:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 1px; }
  @media (prefers-reduced-motion: reduce) {
    .enter { transition: none; }
  }
</style>
