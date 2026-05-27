<script lang="ts">
  // The Library Gallery (CONTEXT §Gallery, UX-Q7) — rendered FROM exhibits.json at runtime (was a
  // hardcoded stand-in array in index.astro). A uniform card grid on the warm gallery wall; cards
  // link via the hash router (#/<slug>) — the shell handles navigation, no page reload.
  import type { ExhibitsJson } from "@render/core";
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
              <span class="title">{ex.title}</span>
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
  .eyebrow { color: var(--accent); }
  .intro h1 { font-family: var(--font-display); font-weight: 600; font-size: 3rem; line-height: 1.05; margin: var(--space-2) 0 var(--space-3); color: var(--ink-paper-primary); }
  .blurb { font-family: var(--font-body); font-size: 1.25rem; line-height: 1.5; color: var(--ink-paper-secondary); margin: 0; }
  .credit-row { margin: var(--space-3) 0 0; }

  .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-6); }
  .card { display: flex; flex-direction: column; text-decoration: none; background: var(--surface-paper-card); border: 1px solid var(--border-paper); border-radius: var(--radius-lg); overflow: hidden; transition: transform 160ms ease, background 160ms ease; }
  .card:hover { background: var(--surface-paper-hover); transform: translateY(-2px); }
  .cover { display: block; aspect-ratio: 3 / 2; background-color: var(--surface-canvas); background-size: cover; background-position: center; border-bottom: 1px solid var(--border-paper); }
  .caption { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4) var(--space-5) var(--space-5); }
  .title { font-family: var(--font-display); font-size: 1.6rem; font-weight: 600; line-height: 1.1; color: var(--ink-paper-primary); }
  .desc { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.45; color: var(--ink-paper-secondary); }

  .empty { font-family: var(--font-body); font-size: 1.25rem; line-height: 1.5; color: var(--ink-paper-secondary); padding: var(--space-8); border: 1px dashed var(--border-paper); border-radius: var(--radius-lg); }
</style>
