<script lang="ts">
  // Sidebar bottom footer: the way UP, pinned to the foot of a reader sidebar for multi-object exhibits.
  //
  // It USED to also hold the object stepper (R4: annomea shipped stepping keyboard-only/invisible —
  // Prior Art 07 "surface stepping visibly" — and this surfaced it). Archie-01a6 moved that stepper to
  // the canvas chrome and this is why: a stepper living inside the COLLAPSIBLE aside disappears with it,
  // and the gap it left had already been filled by a stepper growing inside the note card, which stepped
  // objects from inside a note (V65). Stepping is still visible — more visible, in fact, since the canvas
  // nav survives collapse — it is simply anchored to the canvas it acts on. Keeping a second copy here
  // would put two object steppers in view at once, which is the disagreement V23 measured, not its fix.
  //
  // What every host still gets is the thing the canvas chrome does NOT carry: the step UP to the object
  // overview. The stepper is now OPT-IN, and the condition for opting in is precise: **a surface with no
  // canvas chrome to put it in.** `MediaPlayer` is that surface — an AV object has a waveform and a
  // transcript, not an OSD canvas, so 01a6's "put it where the thing it navigates lives" has nowhere
  // else to land there and removing it would strand an AV reader mid-exhibit. `Reader` passes only
  // `onoverview`, because its canvas nav is the object stepper and a second one in the aside is exactly
  // the duplication V23 measured.
  //
  // Pure presentational: the host (ExhibitView, via the reader component) owns navigation.
  import { navPosition, navRegionName, navStepName } from "../product-copy.js";

  let { siblings, currentId, onstep, onoverview }: {
    /** Opt into the stepper: supply all three. Omit them for a host whose canvas chrome carries it. */
    siblings?: { id: string; label: string }[];
    currentId?: string;
    onstep?: (id: string) => void;
    onoverview: () => void;
  } = $props();

  const stepper = $derived(!!siblings && siblings.length > 1 && !!currentId && !!onstep);
  const idx = $derived(siblings ? siblings.findIndex((s) => s.id === currentId) : -1);
  const prev = $derived(siblings && idx > 0 ? siblings[idx - 1] : undefined);
  const next = $derived(siblings && idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : undefined);
</script>

<div class="object-nav">
  <!-- "Back to Exhibit" is the LOCKED canonical term for returning to the object overview (system.md
       Archie-dba2 / Archie-2cc1: action-named, not the category-named "All objects") — matches the
       breadcrumb + the Reader's exhibit-back so one phrase means "go up a level" everywhere. -->
  <button type="button" class="overview" onclick={onoverview}>
    <span class="mark" aria-hidden="true">▦</span>Back to Exhibit
  </button>
  {#if stepper && siblings}
    <!-- Archie-01a6: the visible label now speaks the noun ("Object 2 of 12") instead of "‹ Prev 1 / 12
         Next ›" — it always ANNOUNCED the noun, and the two channels disagreeing is half of V65. -->
    <nav class="stepper" aria-label={navRegionName("object")}>
      <button type="button" class="step" disabled={!prev}
        onclick={() => { if (prev) onstep?.(prev.id); }}
        aria-label={navStepName("object", "prev", prev?.label)}
        title={navStepName("object", "prev", prev?.label)}>
        <span aria-hidden="true">‹</span> Prev
      </button>
      <span class="pos">{idx >= 0 ? navPosition(idx, siblings.length, "object") : `– of ${siblings.length}`}</span>
      <button type="button" class="step" disabled={!next}
        onclick={() => { if (next) onstep?.(next.id); }}
        aria-label={navStepName("object", "next", next?.label)}
        title={navStepName("object", "next", next?.label)}>
        Next <span aria-hidden="true">›</span>
      </button>
    </nav>
  {/if}
</div>

<style>
  /* Pinned to the foot of the (scrolling) sidebar via sticky — content scrolls UNDER it, so the nav is
     always reachable without scrolling to the end. Negative margins bleed it full-width across the
     aside's padding and flush to its bottom edge; the paper fill + hairline rule set it off from the
     list above (the sibling of the list's own warm-paper cards). */
  .object-nav {
    position: sticky; bottom: 0; z-index: 1;
    margin: var(--space-5) calc(-1 * var(--space-5)) calc(-1 * var(--space-6));
    padding: var(--space-3) var(--space-5) var(--space-4);
    display: flex; flex-direction: column; gap: var(--space-2);
    background: var(--surface-paper);
    border-top: 1px solid var(--border-canvas);
  }
  /* "All objects" — quiet mono label (the way back to the overview), connector-blue on hover. */
  .overview {
    display: inline-flex; align-items: center; gap: var(--space-2); align-self: start;
    background: none; border: none; padding: var(--space-1) 0; cursor: pointer;
    font-family: var(--font-ui), monospace; font-size: var(--text-ui-xs); font-weight: 500;
    letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-secondary);
    transition: color 160ms ease;
  }
  .overview:hover { color: var(--accent-2); }
  .overview .mark { font-size: 0.95rem; line-height: 1; color: var(--ink-paper-muted); transition: color 160ms ease; }
  .overview:hover .mark { color: var(--accent-2); }

  /* Prev · Object N of M · Next — the opt-in stepper (canvas-less hosts only, see the header). Prev/Next
     are generous hit targets (Fitts); the position reads in tabular numerals so it doesn't reflow. */
  .stepper { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
  .step {
    display: inline-flex; align-items: center; gap: var(--space-1);
    background: none; border: none; padding: var(--space-2) var(--space-2); cursor: pointer;
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-sm); letter-spacing: 0.02em;
    color: var(--ink-paper-secondary); transition: color 160ms ease;
  }
  .step span[aria-hidden] { font-size: 1.05rem; line-height: 1; }
  .step:hover:not(:disabled) { color: var(--accent-2); }
  .step:disabled { opacity: 0.32; cursor: default; }
  .pos {
    font-family: var(--font-ui), sans-serif; font-variant-numeric: tabular-nums;
    font-size: var(--text-ui-sm); letter-spacing: 0.04em; color: var(--ink-paper-muted);
    white-space: nowrap;
  }
</style>
