<script lang="ts">
  // The exhibit's object overview (Phase-2 Grid layout). Objects glow on the dark light table
  // (system.md signature) — the visitor scans the works and chooses one to read (object-led
  // reading, strategy §27). Deliberately a PLAIN thumbnail grid, NOT the Phase-3 "overview-as-canvas"
  // invention (a zoomable canvas-of-objects) — that stays gated. Selecting a card opens its Reader.
  import { thumbnailUrl, type AObject, type RightsFields } from "@render/core";
  import Credit from "./Credit.svelte";

  let {
    title,
    summary,
    objects,
    countOf,
    onselect,
    rights,
  }: {
    title: string;
    summary?: string;
    objects: AObject[];
    countOf: (objectId: string) => number;
    onselect: (objectId: string) => void;
    /** The exhibit-level credit/license (Q5) — shown under the title on this overview. */
    rights?: RightsFields;
  } = $props();

  // Broken-media fallback (empty/error gate): a plate whose image fails shows a quiet "couldn’t load"
  // placeholder rather than a silent dark rectangle (was a CSS background-image — now an <img> for onerror).
  let failed = $state(new Set<string>());
  function markFailed(id: string) { failed.add(id); failed = new Set(failed); }
</script>

<main class="overview">
  <header>
    <p class="eyebrow">Exhibit · {objects.length} {objects.length === 1 ? "item" : "items"}</p>
    <h1>{title}</h1>
    {#if summary}<p class="summary">{summary}</p>{/if}
    <p class="credit-row"><Credit {rights} tone="canvas" /></p>
  </header>

  {#if objects.length === 0}
    <!-- empty state (orphan gate §39) — an exhibit with no objects yet -->
    <p class="empty">Nothing in this exhibit yet.</p>
  {:else}
    <ul class="grid">
      {#each objects as obj (obj.id)}
        <li>
          <button class="object" onclick={() => onselect(obj.id)}>
            {#if failed.has(obj.id)}
              <span class="plate plate-failed">Couldn’t load this media item.</span>
            {:else}
              <!-- A bare IIIF service base isn't an image; thumbnailUrl derives a sized JPEG (else passes through). -->
              <img class="plate" src={thumbnailUrl(obj.source, 480)} alt="" loading="lazy" onerror={() => markFailed(obj.id)} />
            {/if}
            <span class="caption">
              <span class="label">{obj.label}</span>
              <span class="count">{countOf(obj.id)} {countOf(obj.id) === 1 ? "note" : "notes"}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  /* The light table: objects laid out on warm near-black, each plate glowing under lamplight.
     Cards elevate by warming (surface-shift, no shadows) per system.md depth strategy. */
  .overview { min-height: 100vh; box-sizing: border-box; background: var(--surface-canvas); color: var(--ink-canvas-primary); padding: var(--space-12) var(--space-8); }
  header { max-width: 60rem; margin: 0 auto var(--space-10); }
  h1 { font-family: var(--font-display); font-weight: 300; font-size: 3rem; line-height: 1.1; margin: var(--space-2) 0 var(--space-3); color: var(--ink-canvas-primary); text-shadow: var(--shadow-text-haze); }
  .summary { font-family: var(--font-body); font-size: 1.25rem; line-height: 1.6; color: var(--ink-canvas-secondary); margin: 0; max-width: 42rem; }

  .grid { list-style: none; margin: 0 auto; padding: 0; max-width: 60rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--space-6); }

  .object {
    display: flex; flex-direction: column; width: 100%; padding: 0; cursor: pointer; text-align: left;
    background: var(--surface-canvas-raised); color: inherit;
    border: none; border-radius: var(--radius-md); overflow: hidden;
    box-shadow: var(--shadow-lift-low);
    transition: transform 200ms ease, box-shadow 200ms ease;
  }
  .object:hover { transform: translateY(-3px); box-shadow: var(--shadow-lift-mid); }
  /* Quiet selected/active signal — a rationed accent left-border, not a loud fill. */
  .object:focus-visible { outline: none; box-shadow: var(--shadow-lift-mid); }

  /* The plate — the object rests whole on warm paper (contain, not cover: don't truncate a
     portrait or a wide landscape; show the work entire, soft ground around it). */
  .plate { display: block; width: 100%; aspect-ratio: 4 / 3; background-color: var(--surface-canvas); object-fit: contain; }
  .plate-failed { display: flex; align-items: center; justify-content: center; font-family: var(--font-ui); font-size: var(--text-ui-sm); font-style: italic; color: var(--ink-canvas-secondary); }
  .caption { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-4) var(--space-5) var(--space-5); }
  .label { font-family: var(--font-display); font-size: 1.6rem; font-weight: 400; line-height: 1.15; color: var(--ink-canvas-primary); }
  .count { font-family: var(--font-mono); font-size: 0.72rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-canvas-muted); }

  /* Empty state on warm paper (orphan gate §39) */
  .empty { max-width: 60rem; margin: 0 auto; font-family: var(--font-body); font-size: 1.125rem; line-height: 1.6; color: var(--ink-canvas-secondary); padding: var(--space-6); background: var(--surface-canvas-raised); border: none; border-radius: var(--radius-lg); box-shadow: var(--shadow-inset-fog); }
</style>
