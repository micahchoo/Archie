<script lang="ts">
/**
 * @surface chrome
 * @composes standalone
 * @variants {ambient, critical}
 * @constraint {corner chip: position fixed out of flow, never a full-width strip}
 */
  // The storage chip — REFRAMED (docs/research/browser-storage-quota.md): no gauge, no percentage.
  // The browser's reported quota is a privacy constant (`usage + 10 GiB`), so a fraction of it is
  // structurally unable to warn before imports fail. What the chip shows instead is the truth we
  // hold: absolute origin usage (calm, ambient), and a witnessed write failure (critical — the
  // "storage" refusal already stopped the import; this names the state and the way out).
  import { storageQuota, formatBytes, refreshQuota } from "./storage-quota.svelte.js";

  let { pollMs = 60_000 }: { pollMs?: number } = $props();

  // Poll gently. The estimate moves only when bytes are written, and App re-reads on every save-queue
  // drain — the interval just catches drift (another tab writing, external clearing). `refreshQuota`
  // never throws, so this can't wedge the app.
  $effect(() => {
    void refreshQuota();
    const t = setInterval(() => void refreshQuota(), pollMs);
    return () => clearInterval(t);
  });

  const usage = $derived(storageQuota.usage);
  const level = $derived(storageQuota.level);
</script>

{#if level !== "unknown"}
  <!-- Unknown renders NOTHING: with no estimate and no witnessed failure there is no truth to show,
       and an empty chip is just chrome. role=status on critical only — the failure state is the one
       a screen reader should hear about; ambient usage is queryable, not announced. -->
  <div class="storage-bar {level}" role={level === "critical" ? "status" : undefined}>
    {#if level === "critical"}
      <span class="figure">Storage on this device is full — the import stopped.</span>
      <span class="consequence">
        Free some space{usage !== null ? ` (Archie holds ${formatBytes(usage)})` : ""}, then add the files again.
      </span>
    {:else}
      <span class="ambient">{formatBytes(usage ?? 0)} stored on this device</span>
    {/if}
  </div>
{/if}

<style>
  /* A CORNER CHIP, not a full-width strip — it must cost the canvas nothing. `position: fixed` keeps
     it out of flow (`.app` reserves NO space), and it must be visible without scrolling: `.app` is
     `height: 100vh` / `overflow: visible` with a `flex: 0 0 auto` main, so the VIEWPORT is the
     scroller and a flow-positioned child lands at the bottom of the DOCUMENT (measured: 1568px of
     content in an 800px viewport). Bottom-RIGHT because import/save notes surface at the footer's
     left, and the chip must never sit on one. z-index 20 stays below the modal/overlay band
     (40–110, dialogs at 9996+) — an open dialog covers this, never the reverse. */
  .storage-bar {
    position: fixed;
    right: var(--space-3); bottom: var(--space-3);
    z-index: 20;
    max-width: 220px;
    padding: var(--space-2);
    border-radius: 6px;
    background: color-mix(in srgb, var(--surface-canvas-raised) 88%, transparent);
    border: 1px solid var(--border-canvas);
    font-family: var(--font-ui); font-size: var(--text-ui-xs); line-height: 1.25;
    display: flex; flex-direction: column; gap: 3px;
    /* Calm is nearly nothing: a dimmed chip that resolves only when looked at. Critical drops the
       dimming — a witnessed failure earns full presence. */
    opacity: 0.55;
    transition: opacity 200ms ease;
    pointer-events: none; /* ambient readout, never an obstacle to a click on the canvas beneath */
  }
  .storage-bar:hover,
  .storage-bar.critical { opacity: 1; }

  .ambient { color: var(--ink-canvas-muted); letter-spacing: 0.02em; white-space: nowrap; }
  .figure { color: var(--semantic-error); font-weight: 600; letter-spacing: 0.02em; }
  .consequence { color: var(--ink-canvas-secondary); font-weight: 400; text-wrap: balance; }

  @media (prefers-reduced-motion: reduce) {
    .storage-bar { transition: none; }
  }
</style>
