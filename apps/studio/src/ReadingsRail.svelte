<script lang="ts">
  // The Readings RAIL (P-2 / archie-ux Q-2 — the permanent home; "rail = use, modal = edit").
  // Two explicit states per row, never conflated (grill Q1): the eye checkbox = VISIBLE (display
  // composition — any set), the pen radio = ACTIVE (where a drawn note files — exactly one).
  // 2+ readings visible = comparing → marks render outline-only (grill Q2); hovering a row SOLOS
  // its fill back. Mirrors the Viewer legend's overlay idiom (authoring↔reading symmetry) but is
  // an authoring surface: counts, visibility, the pen, and the single "manage…" entry to the modal.
  import type { Reading } from "@render/core";
  import type { ReadingState } from "./reading-state.svelte.js";
  import { BASE } from "./reading-state.svelte.js";

  let { readings, rdg, countOf, baseCount, onsolo, onmanage }: {
    readings: Reading[];
    rdg: ReadingState;
    /** Notes filed in a reading, on the CURRENT object (the rail answers "what would show?"). */
    countOf: (readingId: string) => number;
    baseCount: number;
    /** Row hover → solo that reading's fill while comparing (null on leave). */
    onsolo: (key: string | null) => void;
    onmanage: () => void;
  } = $props();

  const comparing = $derived(rdg.comparing(readings));
</script>

<aside class="rail" aria-label="Readings rail" data-comparing={comparing}>
  <span class="title">Readings{#if comparing}<span class="cmp" title="Two or more readings are visible, so notes show as outlines and their colours stay distinct.">· comparing</span>{/if}</span>
  <div class="rows">
    {#each [{ id: BASE, name: "General notes", colour: "var(--accent)" }, ...readings] as r (r.id)}
      <div class="row" data-reading={r.id}
        onmouseenter={() => onsolo(r.id)} onmouseleave={() => onsolo(null)} role="group" aria-label={r.name}>
        <input type="checkbox" class="vis" title={`Show “${r.name}” notes (on the image and in the margin)`}
          checked={rdg.isVisible(r.id)} onchange={() => rdg.toggle(r.id)} aria-label={`Show ${r.name}`} />
        <span class="sw" style="background:{r.colour ?? 'var(--accent)'}"></span>
        <span class="nm">{r.name}</span>
        <span class="ct">{r.id === BASE ? baseCount : countOf(r.id)}</span>
        <label class="pen" title={`File new notes under “${r.name}”. This is where every note you draw goes, no matter which readings are shown.`}>
          <input type="radio" name="active-reading" value={r.id}
            checked={rdg.active === r.id} onchange={() => rdg.setActive(r.id)} aria-label={`Draw into ${r.name}`} />
          <span aria-hidden="true">✎</span>
        </label>
      </div>
    {/each}
  </div>
  <button type="button" class="manage" onclick={onmanage}>Manage readings…</button>
</aside>

<style>
  /* Same overlay language as the Viewer's ReadingLegend (surface/border/accent stripe) — the
     authoring rail and the reading legend are the two faces of one concept. */
  .rail {
    position: absolute; z-index: 20; top: var(--space-4); right: var(--space-5); min-width: 13rem; max-width: 17rem;
    padding: var(--space-3) var(--space-4);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-primary);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
    font-family: var(--font-body), sans-serif;
  }
  .title { display: block; font-family: var(--font-ui), monospace; font-size: 0.65rem; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent-2); opacity: 0.62; margin-bottom: var(--space-2); }
  .title .cmp { margin-left: var(--space-2); color: var(--ink-canvas-secondary); letter-spacing: 0.12em; }
  .rows { display: flex; flex-direction: column; gap: 2px; }
  .row { display: flex; align-items: center; gap: var(--space-2); padding: 3px var(--space-1); border-radius: var(--radius-sm); transition: background 0.16s ease; }
  .row:hover { background: var(--accent-2-muted); }
  .vis { margin: 0; accent-color: var(--accent-2); cursor: pointer; }
  .sw { width: 11px; height: 11px; border-radius: 50%; border: 1px solid var(--border-canvas); flex: none; }
  .nm { flex: 1; font-size: var(--text-ui-sm, 0.8rem); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ct { font-family: var(--font-mono); font-size: var(--text-ui-xs); color: var(--ink-canvas-muted); }
  .pen { display: inline-flex; align-items: center; cursor: pointer; color: var(--ink-canvas-muted); }
  .pen input { position: absolute; opacity: 0; pointer-events: none; }
  .pen span { padding: 0 var(--space-1); border-radius: var(--radius-sm); transition: color 0.16s ease, background 0.16s ease; }
  .pen input:checked + span { color: var(--accent-2); background: var(--accent-2-muted); }
  .pen:hover span { color: var(--accent-2); }
  .manage { margin-top: var(--space-2); width: 100%; cursor: pointer; font-family: var(--font-ui), monospace; font-size: var(--text-ui-xs); letter-spacing: 0.14em; text-transform: uppercase; padding: var(--space-1) var(--space-2); background: var(--surface-canvas); color: var(--ink-canvas-secondary); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); transition: color 0.16s ease, border-color 0.16s ease; }
  .manage:hover { color: var(--accent-2); border-color: var(--accent-2-muted); }
</style>
