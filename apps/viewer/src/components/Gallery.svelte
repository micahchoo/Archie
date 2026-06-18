<script lang="ts">
  // The Library Gallery (CONTEXT §Gallery, UX-Q7) — rendered FROM exhibits.json at runtime (was a
  // hardcoded stand-in array in index.astro). A uniform card grid on the warm gallery wall; cards
  // link via the hash router (#/<slug>) — the shell handles navigation, no page reload.
  import type { ExhibitsJson } from "@render/core";
  import { isLiveSlug } from "../published.js";
  import Credit from "./Credit.svelte";

  let { gallery }: { gallery: ExhibitsJson } = $props();

  const cards = $derived([...gallery.exhibits].sort((a, b) => a.order - b.order));
  const title = $derived(gallery.library.title ?? "Exhibition gallery");
</script>

<main class="gallery">
  <header class="intro">
    <p class="eyebrow">Exhibition gallery</p>
    <h1>{title}</h1>
    {#if gallery.library.summary}<p class="blurb">{gallery.library.summary}</p>{/if}
    <p class="credit-row"><Credit rights={gallery.library} tone="paper" /></p>
  </header>

  {#if cards.length === 0}
    <p class="empty">No exhibits published yet.</p>
  {:else}
    <ul class="grid">
      {#each cards as ex (ex.slug)}
        <li>
          <a class="card" href={`#/${ex.slug}`}>
            <span class="cover" style={ex.cover ? `background-image:url(${ex.cover})` : ""}></span>
            <span class="caption">
              <span class="title">{ex.title}{#if isLiveSlug(ex.slug)}<span class="local" title="Only you can see this. It's saved in this browser until you publish it.">Draft</span>{/if}</span>
              {#if ex.description}<span class="desc">{ex.description}</span>{/if}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  /* Gallery wall — warm, lamplit; cards float as invitations (system.md §Exhibit Gallery). Ported
     from the former static index.astro; tokens come from the page-level tokens.css import. */
  .gallery { max-width: 1040px; margin: 0 auto; padding: var(--space-12) var(--space-6); }
  .intro { margin-bottom: var(--space-10); max-width: 40rem; }
  .intro h1 { font-family: var(--font-display); font-weight: 300; font-size: 3rem; line-height: 1.1; margin: var(--space-2) 0 var(--space-3); color: var(--ink-paper-primary); text-shadow: var(--shadow-text-haze); }
  .blurb { font-family: var(--font-body); font-size: 1.25rem; line-height: 1.6; color: var(--ink-paper-secondary); margin: 0; }
  .credit-row { margin: var(--space-3) 0 0; }

  .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-6); }
  .card { display: flex; flex-direction: column; text-decoration: none; background: var(--surface-canvas-raised); border: none; border-radius: var(--radius-md); overflow: hidden; box-shadow: var(--shadow-lift-low); transition: transform 200ms ease, box-shadow 200ms ease; }
  .card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lift-mid); }
  .cover { display: block; aspect-ratio: 3 / 2; background-color: var(--surface-canvas); background-size: cover; background-position: center; }
  .caption { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4) var(--space-5) var(--space-5); }
  .title { font-family: var(--font-display); font-size: 1.6rem; font-weight: 400; line-height: 1.15; color: var(--ink-paper-primary); }
  /* Live working-store exhibit (Q-3) — "Local: only you can see this"; Publish is what makes it public. */
  .local {
    display: inline-block; vertical-align: middle; margin-left: var(--space-2); padding: 1px var(--space-2);
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-xs); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--accent); background: var(--accent-muted); border: none; border-radius: var(--radius-sm);
  }
  .desc { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.6; color: var(--ink-paper-secondary); }

  .empty { font-family: var(--font-body); font-size: 1.25rem; line-height: 1.6; color: var(--ink-paper-secondary); padding: var(--space-8); background: var(--surface-canvas-raised); border: none; border-radius: var(--radius-lg); box-shadow: var(--shadow-inset-fog); }
</style>
