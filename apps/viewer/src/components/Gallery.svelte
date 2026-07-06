<script lang="ts">
  // The Library Gallery (CONTEXT §Gallery, UX-Q7) — rendered FROM exhibits.json at runtime, PLUS an
  // all-images wall from the baked image index (ADR-0023 / Phase 3.3). One surface, two views (Exhibit
  // cards / all-images wall), one search box filtering the ACTIVE view by title. Cards link via the hash
  // router (#/<slug>); wall images link to the object in its exhibit (#/<slug>/o/<id>) — the shell handles
  // navigation, no page reload. The wall only appears when the image index loaded (older trees: cards only).
  import { onMount } from "svelte";
  import type { ExhibitsJson, ImageIndex } from "@render/core";
  import { isLiveSlug } from "../published.js";
  import { hasWall, filterExhibits, filterImages, wallHref, type GalleryView } from "../gallery-view.js";
  import { type Density, loadGridDensity, saveGridDensity, densityMetrics } from "../grid-density.js";
  import Credit from "./Credit.svelte";

  let { gallery, imageIndex = null }: { gallery: ExhibitsJson; imageIndex?: ImageIndex | null } = $props();

  const cards = $derived([...gallery.exhibits].sort((a, b) => a.order - b.order));
  const title = $derived(gallery.library.title ?? "Gallery");
  const wall = $derived(hasWall(imageIndex));

  let view = $state<GalleryView>("exhibits");
  let query = $state("");
  // The wall can vanish on a live refresh (index goes null) — never leave the view stranded there.
  $effect(() => { if (!wall && view === "wall") view = "exhibits"; });

  const shownCards = $derived(filterExhibits(cards, query));
  const shownImages = $derived(imageIndex ? filterImages(imageIndex.images, query) : []);

  // Wall density (Phase 4, reused): a 2-step per-device preference; metrics drive the min column width AND
  // the contain-intrinsic-size estimate together, so the content-visibility virtualization can't jank.
  let density = $state<Density>("comfortable");
  onMount(() => { density = loadGridDensity(); });
  const metrics = $derived(densityMetrics(density));
  function setDensity(d: Density) { density = d; saveGridDensity(d); }

  // Broken-cover fallback (#10): a CSS background-image can't fire onerror, so a 404'd cover was a dead
  // rectangle on the front door — render an <img> and fall back to the exhibit's name on a quiet wash.
  let failed = $state(new Set<string>());
  function markFailed(key: string) { failed.add(key); failed = new Set(failed); }
  const aspectOf = (w?: number, h?: number) => (w && h ? `${w} / ${h}` : "3 / 2");
</script>

<main class="gallery">
  <header class="intro">
    <p class="eyebrow">Gallery · {cards.length} {cards.length === 1 ? "exhibit" : "exhibits"}</p>
    <h1>{title}</h1>
    {#if gallery.library.summary}<p class="blurb">{gallery.library.summary}</p>{/if}
    <p class="credit-row"><Credit rights={gallery.library} tone="paper" /></p>
  </header>

  {#if cards.length > 0}
    <div class="toolbar">
      {#if wall}
        <div class="views" role="group" aria-label="Gallery view">
          <button type="button" class:on={view === "exhibits"} aria-pressed={view === "exhibits"} onclick={() => (view = "exhibits")}>Exhibits</button>
          <button type="button" class:on={view === "wall"} aria-pressed={view === "wall"} onclick={() => (view = "wall")}>All images</button>
        </div>
      {/if}
      <input class="search" type="search" bind:value={query}
        placeholder={view === "wall" ? "Search images…" : "Search exhibits…"}
        aria-label={view === "wall" ? "Search images by title" : "Search exhibits by title"} />
      {#if view === "wall"}
        <div class="density" role="group" aria-label="Wall density">
          <button type="button" class:on={density === "comfortable"} aria-pressed={density === "comfortable"} onclick={() => setDensity("comfortable")}>Comfortable</button>
          <button type="button" class:on={density === "compact"} aria-pressed={density === "compact"} onclick={() => setDensity("compact")}>Compact</button>
        </div>
      {/if}
    </div>
  {/if}

  {#if cards.length === 0}
    <p class="empty">No exhibits published yet.</p>
  {:else if view === "exhibits"}
    {#if shownCards.length === 0}
      <p class="empty">No exhibits match “{query}”.</p>
    {:else}
      <ul class="grid cards">
        {#each shownCards as ex (ex.slug)}
          <li>
            <a class="card" href={`#/${ex.slug}`}>
              {#if ex.cover && !failed.has(ex.slug)}
                <img class="cover" src={ex.cover} alt="" loading="lazy" decoding="async" onerror={() => markFailed(ex.slug)} />
              {:else}
                <span class="cover cover-fallback">{ex.title}</span>
              {/if}
              <span class="caption">
                <span class="c-title">{ex.title}{#if isLiveSlug(ex.slug)}<span class="draft" title="Browser — saved only in this browser; only you can see it until you publish.">Browser</span>{/if}</span>
                {#if ex.description}<span class="desc">{ex.description}</span>{/if}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <!-- All-images wall: one entry per Object from the baked index; a click opens the Object in its
         Exhibit (#/<slug>/o/<id>). Virtualized like ObjectGrid (content-visibility + lazy imgs). -->
    {#if shownImages.length === 0}
      <p class="empty">No images match “{query}”.</p>
    {:else}
      <ul class="grid wallgrid" style:--grid-min={metrics.minCol} style:--grid-intrinsic={metrics.intrinsic}>
        {#each shownImages as img (`${img.exhibitSlug}/${img.objectId}`)}
          <li style:aspect-ratio={aspectOf(img.width, img.height)}>
            <a class="tile" href={wallHref(img)} title={img.title}>
              {#if img.thumbnail && !failed.has(`${img.exhibitSlug}/${img.objectId}`)}
                <img src={img.thumbnail} alt={img.title} loading="lazy" decoding="async" onerror={() => markFailed(`${img.exhibitSlug}/${img.objectId}`)} />
              {:else}
                <span class="tile-fallback">{img.title || "Untitled"}</span>
              {/if}
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</main>

<style>
  /* Gallery wall — warm, lamplit; cards float as invitations (system.md §Exhibit Gallery). */
  .gallery { max-width: 1040px; margin: 0 auto; padding: var(--space-12) var(--space-6); }
  .intro { margin-bottom: var(--space-8); max-width: 40rem; }
  .intro h1 { font-family: var(--font-display); font-weight: 300; font-size: 3rem; line-height: 1.1; margin: var(--space-2) 0 var(--space-3); color: var(--ink-paper-primary); text-shadow: var(--shadow-text-haze); }
  .blurb { font-family: var(--font-body); font-size: 1.25rem; line-height: 1.6; color: var(--ink-paper-secondary); margin: 0; }
  .credit-row { margin: var(--space-3) 0 0; }

  /* Toolbar — quiet: a view toggle, one search field, an optional density switch. Matches the landing voice. */
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-bottom: var(--space-8); }
  .views, .density { display: inline-flex; border-radius: var(--radius-sm); overflow: hidden; box-shadow: var(--shadow-lift-low); }
  .views button, .density button {
    background: var(--surface-canvas-raised); color: var(--ink-canvas-secondary);
    border: none; padding: var(--space-2) var(--space-4); cursor: pointer;
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-xs); font-weight: 500;
    letter-spacing: 0.1em; text-transform: uppercase; transition: color 160ms ease, background 160ms ease;
  }
  .views button:hover, .density button:hover { color: var(--accent-2); }
  .views button.on, .density button.on { background: var(--accent); color: var(--ink-on-accent, #fff); }
  .views button.on:hover, .density button.on:hover { color: var(--ink-on-accent, #fff); }
  .search {
    flex: 1; min-width: 12rem; max-width: 22rem;
    font-family: var(--font-body); font-size: 1rem; color: var(--ink-paper-primary);
    padding: var(--space-2) var(--space-3); background: var(--surface-canvas-raised);
    border: none; border-radius: var(--radius-sm); box-shadow: var(--shadow-inset-fog);
  }
  .search::placeholder { color: var(--ink-paper-secondary); }

  .grid { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-6); }
  .cards { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
  .card { display: flex; flex-direction: column; text-decoration: none; background: var(--surface-canvas-raised); border: none; border-radius: var(--radius-md); overflow: hidden; box-shadow: var(--shadow-lift-low); transition: transform 200ms ease, box-shadow 200ms ease; }
  .card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lift-mid); }
  .cover { display: block; width: 100%; aspect-ratio: 3 / 2; object-fit: cover; background-color: var(--surface-canvas); }
  .cover-fallback { display: flex; align-items: center; justify-content: center; padding: var(--space-5); box-sizing: border-box; text-align: center; font-family: var(--font-display); font-size: 1.5rem; font-weight: 400; line-height: 1.15; color: var(--ink-canvas-secondary); }
  .caption { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4) var(--space-5) var(--space-5); }
  .c-title { font-family: var(--font-display); font-size: 1.6rem; font-weight: 400; line-height: 1.15; color: var(--ink-paper-primary); }
  .draft {
    display: inline-block; vertical-align: middle; margin-left: var(--space-2); padding: 1px var(--space-2);
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-xs); font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--accent); background: var(--accent-muted); border: none; border-radius: var(--radius-sm);
  }
  .desc { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.6; color: var(--ink-paper-secondary); }

  /* All-images wall: a uniform grid of aspect-respecting tiles. content-visibility skips off-screen tiles;
     each <li>'s aspect-ratio (from the index's width/height) reserves space so the lazy <img> can't shift
     layout. --grid-min / --grid-intrinsic come from the density switch (tracks the virtualization estimate). */
  .wallgrid { grid-template-columns: repeat(auto-fill, minmax(var(--grid-min, 280px), 1fr)); }
  .wallgrid > li { content-visibility: auto; contain-intrinsic-size: auto var(--grid-intrinsic, 360px); border-radius: var(--radius-md); overflow: hidden; box-shadow: var(--shadow-lift-low); background: var(--surface-canvas-raised); transition: transform 200ms ease, box-shadow 200ms ease; }
  .wallgrid > li:hover { transform: translateY(-3px); box-shadow: var(--shadow-lift-mid); }
  .tile { display: block; width: 100%; height: 100%; }
  .tile img { display: block; width: 100%; height: 100%; object-fit: cover; background-color: var(--surface-canvas); }
  .tile-fallback { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; box-sizing: border-box; padding: var(--space-4); text-align: center; font-family: var(--font-display); font-size: 1.2rem; line-height: 1.2; color: var(--ink-canvas-secondary); background: var(--surface-canvas); }

  .empty { font-family: var(--font-body); font-size: 1.25rem; line-height: 1.6; color: var(--ink-paper-secondary); padding: var(--space-8); background: var(--surface-canvas-raised); border: none; border-radius: var(--radius-lg); box-shadow: var(--shadow-inset-fog); }
</style>
