<script lang="ts">
/**
 * @surface scrimmed
 * @composes standalone
 * @variants open, closed
 * @constraint modal — focus trap + Esc, on the shared dismissal ladder
 */
  // The Settings panel (spec: docs/superpowers/specs/2026-07-26-studio-settings-panel-design.md).
  //
  // ONE panel with TWO labelled sections (L1), because R7 is the whole point of the surface: an author
  // must be able to tell a setting that travels with the LIBRARY from one that belongs to this app on
  // this machine. Two separate surfaces would let that distinction rot; a single unlabelled list would
  // never have made it.
  //
  // PHASE 1 ships the frame and the read-only half. What is deliberately NOT here yet:
  //   • the autosave cadence control (L2/R5) — it mutates a live seam, so it lands with its own tests
  //   • "Reclaim space" (L3/R3) — destructive, gated behind a typed confirm, lands last
  // Both are named in the panel as "not yet" rather than omitted, so the surface does not read as
  // finished when it isn't.
  //
  // NOT here at all, by decision:
  //   • Flags (L5/R6, WITHDRAWN) — the one flag is a default-ON emergency kill-switch; a section for
  //     it would advertise a lever the author must never pull.
  //   • Layout state (L6) — pane widths are already directly draggable; a numeric mirror is decoration.
  //   • Anything that writes AUTHORED content (L7) — no rights, no metadata, no readings. That is
  //     what .claude/rules/metadata-rights-keyed-writebacks.md exists to protect, and the cheapest way
  //     to never violate it here is to have no such control on this surface.
  import { scrimmed } from "./modality.svelte";

  let {
    open,
    onclose,
    libraryName,
    /** Diagnostics (L4): READ-ONLY in v1. These are what the app decided at runtime, not knobs.
     *  A slider over `POOL_MAX` invites an author to tune something whose correct value is a
     *  hardware fact, and .claude/rules/perf-measure-the-flow.md is the record of what happens
     *  when a pool is sized against the wrong model. */
    diagnostics,
  }: {
    open: boolean;
    onclose: () => void;
    libraryName: string;
    diagnostics: () => {
      /** Workers this machine will actually use for the ingest bake. */
      bakeWorkers: number;
      /** How many bakes fell back to the main thread. Non-zero is the ONLY visible sign of a
       *  silent degradation — both worker paths swallow their failures by design. */
      bakeFallbacks: number;
      /** Whether the publish-time DZI slice pool can run here at all. */
      tilePoolAvailable: boolean;
      /** Deep Zoom tile edge, in px. */
      dziTileSize: number;
    };
  } = $props();

  // Read once per open, not per render: these are runtime facts that only move when work runs, and a
  // live-polling readout would be a spinner pretending to be information.
  const d = $derived(open ? diagnostics() : null);
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={onclose}></div>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Settings" tabindex="-1"
    use:scrimmed={{ onClose: onclose }}>
    <header>
      <p class="eyebrow">Settings</p>
      <h2>Settings</h2>
    </header>

    <section aria-labelledby="set-app">
      <h3 id="set-app">This app</h3>
      <p class="sec-note">Belongs to Archie on this machine. Doesn't travel with your library.</p>

      <div class="row readonly">
        <div class="r-label">
          <span class="r-title">Import workers</span>
          <span class="r-desc">How many images Archie prepares at once when you add them.</span>
        </div>
        <span class="r-value">{d?.bakeWorkers ?? "—"}</span>
      </div>

      <div class="row readonly">
        <div class="r-label">
          <span class="r-title">Fell back to the slow path</span>
          <span class="r-desc">
            When a worker can't start, Archie still finishes the import — just slower, and without
            saying so. This is the count since the app opened. Anything other than zero is worth
            reporting.
          </span>
        </div>
        <span class="r-value" class:warn={(d?.bakeFallbacks ?? 0) > 0}>{d?.bakeFallbacks ?? "—"}</span>
      </div>

      <div class="row readonly">
        <div class="r-label">
          <span class="r-title">Publish tiling</span>
          <span class="r-desc">Large images are cut into {d?.dziTileSize ?? "—"} px tiles so the viewer loads only what's on screen.</span>
        </div>
        <span class="r-value">{d === null ? "—" : d.tilePoolAvailable ? "In parallel" : "One at a time"}</span>
      </div>

      <p class="pending">Saving cadence and reclaiming disk space aren't here yet.</p>
    </section>

    <section aria-labelledby="set-lib">
      <h3 id="set-lib">This library <span class="lib-name">({libraryName})</span></h3>
      <p class="sec-note">Travels with the library — anyone you send it to gets these.</p>
      <p class="pending">Nothing here yet. Library-level rights and metadata stay where you author
        them, on the library and exhibit screens; settings never edits your content.</p>
    </section>

    <div class="actions">
      <button type="button" class="ghost" onclick={onclose}>Close</button>
    </div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; background: var(--scrim, rgba(26, 60, 35, 0.28)); z-index: 100; }
  .dialog {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 101;
    width: min(38rem, calc(100vw - var(--space-6))); display: flex; flex-direction: column;
    gap: var(--space-5); padding: var(--space-6);
    background: var(--surface-paper-card); border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lift-high, 0 24px 60px rgba(26, 60, 35, 0.22));
    /* The Publish surface shipped without these and could not be scrolled at all once a fourth card
       crossed the viewport — fixed + transform-centred means overflow leaves BOTH edges unreachable.
       Any new dialog gets them from the start. */
    max-height: calc(100vh - var(--space-8)); overflow-y: auto; overscroll-behavior: contain;
  }
  header { display: flex; flex-direction: column; gap: var(--space-1); }
  .eyebrow { font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-paper-muted); margin: 0; }
  h2 { font-family: var(--font-display); font-size: 1.5rem; margin: 0; color: var(--ink-paper-primary); }

  section { display: flex; flex-direction: column; gap: var(--space-3); }
  h3 { font-family: var(--font-display); font-size: 1.05rem; margin: 0; color: var(--ink-paper-primary); }
  .lib-name { font-family: var(--font-body); font-weight: 400; color: var(--ink-paper-secondary); }
  .sec-note { font-family: var(--font-body); font-size: 0.9rem; color: var(--ink-paper-muted); margin: 0; }

  .row { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-5); }
  .r-label { display: flex; flex-direction: column; gap: var(--space-1); }
  .r-title { font-family: var(--font-body); font-size: 0.98rem; color: var(--ink-paper-primary); }
  .r-desc { font-family: var(--font-body); font-size: 0.85rem; line-height: 1.5; color: var(--ink-paper-secondary); }
  .r-value { font-variant-numeric: tabular-nums; font-size: 0.98rem; color: var(--ink-paper-secondary); white-space: nowrap; }
  .r-value.warn { color: var(--ink-paper-primary); font-weight: 600; }

  .pending {
    font-family: var(--font-body); font-size: 0.85rem; line-height: 1.5; margin: 0;
    color: var(--ink-paper-muted); font-style: italic;
  }

  .actions { display: flex; justify-content: flex-end; gap: var(--space-3); }
  .ghost {
    background: none; border: 1px solid var(--border-paper); cursor: pointer;
    padding: var(--space-2) var(--space-4); border-radius: var(--radius-md);
    font: inherit; font-size: 0.95rem; color: var(--ink-paper-secondary);
  }
  .ghost:hover { color: var(--ink-paper-primary); border-color: var(--accent); }
</style>
