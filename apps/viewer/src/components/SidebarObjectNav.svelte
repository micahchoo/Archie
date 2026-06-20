<script lang="ts">
  // Sidebar bottom object-nav (R4): a VISIBLE, labelled stepper pinned to the foot of a reader sidebar
  // for multi-object exhibits. The top-bar carousel is the glance-and-step affordance over the canvas;
  // this is its discoverable, full-width twin in the reading pane — so you can move between sibling
  // objects (and back to the overview) without the breadcrumb getting lost over the image, and so touch
  // readers who never hover still have a way through. Prior art: annomea shipped stepping but kept it
  // keyboard-only/invisible (Prior Art 07 "surface stepping visibly") — this surfaces it.
  // Pure presentational: the host (ExhibitView, via the reader component) owns selection; this only
  // reflects the sibling list + calls back. Shown only when there are siblings to step (length > 1).
  let { siblings, currentId, onstep, onoverview }: {
    siblings: { id: string; label: string }[];
    currentId: string;
    onstep: (id: string) => void;
    onoverview: () => void;
  } = $props();

  const idx = $derived(siblings.findIndex((s) => s.id === currentId));
  const prev = $derived(idx > 0 ? siblings[idx - 1] : undefined);
  const next = $derived(idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : undefined);
</script>

<nav class="object-nav" aria-label="Objects in this exhibit">
  <!-- "Back to Exhibit" is the LOCKED canonical term for returning to the object overview (system.md
       Archie-dba2 / Archie-2cc1: action-named, not the category-named "All objects") — matches the
       breadcrumb + the Reader's exhibit-back so one phrase means "go up a level" everywhere. -->
  <button type="button" class="overview" onclick={onoverview}>
    <span class="mark" aria-hidden="true">▦</span>Back to Exhibit
  </button>
  <div class="stepper">
    <button type="button" class="step" disabled={!prev}
      onclick={() => { if (prev) onstep(prev.id); }}
      aria-label={prev ? `Previous object: ${prev.label}` : "This is the first object"}
      title={prev ? `Previous: ${prev.label}` : "This is the first object"}>
      <span aria-hidden="true">‹</span> Prev
    </button>
    <span class="pos">{idx >= 0 ? idx + 1 : "–"} / {siblings.length}</span>
    <button type="button" class="step" disabled={!next}
      onclick={() => { if (next) onstep(next.id); }}
      aria-label={next ? `Next object: ${next.label}` : "This is the last object"}
      title={next ? `Next: ${next.label}` : "This is the last object"}>
      Next <span aria-hidden="true">›</span>
    </button>
  </div>
</nav>

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

  /* Prev · N/M · Next — the visible stepper. Prev/Next are generous hit targets (Fitts); the position
     reads in tabular mono so the count doesn't reflow as it changes. */
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
    font-family: var(--font-mono), monospace; font-variant-numeric: tabular-nums;
    font-size: var(--text-ui-sm); letter-spacing: 0.08em; color: var(--ink-paper-muted);
  }
</style>
