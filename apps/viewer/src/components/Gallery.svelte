<script lang="ts">
  // The Library Gallery (CONTEXT §Gallery, UX-Q7) — rendered FROM exhibits.json at runtime, PLUS an
  // all-images wall from the baked image index (ADR-0023 / Phase 3.3). One surface, two views (Exhibit
  // cards / all-images wall), one search box filtering the ACTIVE view by title. Cards link via the hash
  // router (#/<slug>); wall images link to the object in its exhibit (#/<slug>/o/<id>) — the shell handles
  // navigation, no page reload. The wall only appears when the image index loaded (older trees: cards only).
  import { onMount } from "svelte";
  import type { ExhibitsJson, ImageIndex } from "@render/core";
  import { isLiveSlug, publishedAssetUrl } from "../published.js";
  import { hasWall, filterExhibits, filterImages, wallHref, listedExhibits, unlistedSlugSet, searchActive, coverFallbacks, type GalleryView } from "../gallery-view.js";
  import { type Density, loadGridDensity, saveGridDensity, densityMetrics } from "../grid-density.js";
  import Credit from "./Credit.svelte";

  let { gallery, imageIndex = null }: { gallery: ExhibitsJson; imageIndex?: ImageIndex | null } = $props();

  // The public hall lists only LISTED exhibits (Archie-77b2) — an unlisted card is reachable by direct
  // URL but absent here. `hidden` also drops unlisted exhibits' tiles from the all-images wall below.
  const cards = $derived(listedExhibits([...gallery.exhibits].sort((a, b) => a.order - b.order)));
  const hidden = $derived(unlistedSlugSet(gallery.exhibits));
  const title = $derived(gallery.library.title ?? "Gallery");
  const wall = $derived(hasWall(imageIndex));

  let view = $state<GalleryView>("exhibits");
  let query = $state("");
  // The wall can vanish on a live refresh (index goes null) — never leave the view stranded there.
  $effect(() => { if (!wall && view === "wall") view = "exhibits"; });

  // V6 — the lens browses, the search finds everything (Studio's Archie-2308 rule, ported). While a query
  // is live BOTH corpora are filtered and BOTH result groups render, whatever the lens says; the lens hides,
  // because there is nothing left for it to govern. Before this the lens silently scoped the search and only
  // the placeholder said so, so typing before noticing searched the wrong corpus and an empty result read as
  // "this library doesn't have it".
  const searching = $derived(searchActive(query));
  const shownCards = $derived(filterExhibits(cards, query));
  const shownImages = $derived(imageIndex ? filterImages(imageIndex.images.filter((e) => !hidden.has(e.exhibitSlug)), query) : []);

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

  // V7 — an exhibit with no explicit cover used to render as its title on a blank wash; in the seeded
  // library that was the FIRST card, top-left. Studio has always borrowed the first object's thumbnail
  // (gallery-data.ts `coverOf`); this is the same move off the baked index, which is emitted in
  // library→reading order so "first" is the exhibit's opening object. Tracked under a `fb:` key so a
  // borrowed cover that 404s falls through to the title rather than re-arming the explicit one.
  const covers = $derived(coverFallbacks(imageIndex));
  function coverSrcOf(ex: { slug: string; cover?: string }): { src: string; key: string } | null {
    const declared = publishedAssetUrl(ex.cover); // tree-relative refs need the serving base (V7)
    if (declared && !failed.has(ex.slug)) return { src: declared, key: ex.slug };
    const borrowed = publishedAssetUrl(covers.get(ex.slug));
    const key = `fb:${ex.slug}`;
    if (borrowed && !failed.has(key)) return { src: borrowed, key };
    return null;
  }
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
      <!-- The lens governs BROWSING only, so it hides while a search is live (V6). -->
      {#if wall && !searching}
        <div class="views" role="group" aria-label="Gallery view">
          <button type="button" class:on={view === "exhibits"} aria-pressed={view === "exhibits"} onclick={() => (view = "exhibits")}>Exhibits</button>
          <button type="button" class:on={view === "wall"} aria-pressed={view === "wall"} onclick={() => (view = "wall")}>All images</button>
        </div>
      {/if}
      <!-- One name for one corpus: the box searches the whole library, so it says so and never swaps
           meaning underneath the reader. -->
      <input class="search" type="search" bind:value={query}
        placeholder={wall ? "Search this library…" : "Search exhibits…"}
        aria-label={wall ? "Search this library by title" : "Search exhibits by title"} />
      {#if view === "wall" && !searching}
        <div class="density" role="group" aria-label="Wall density">
          <button type="button" class:on={density === "comfortable"} aria-pressed={density === "comfortable"} onclick={() => setDensity("comfortable")}>Comfortable</button>
          <button type="button" class:on={density === "compact"} aria-pressed={density === "compact"} onclick={() => setDensity("compact")}>Compact</button>
        </div>
      {/if}
    </div>
  {/if}

  {#if cards.length === 0}
    <p class="empty">No exhibits published yet.</p>
  {:else if searching}
    <!-- SEARCH MODE (V6): both corpora, both groups, whatever the lens was set to. Counted headings so
         "nothing here" is distinguishable from "nothing anywhere" without switching views to find out. -->
    <div class="results">
      <h2 class="group-head">Exhibits ({shownCards.length})</h2>
      {#if shownCards.length === 0}
        <p class="empty">No exhibits match “{query}”.</p>
      {:else}
        {@render cardGrid(shownCards)}
      {/if}
      {#if wall}
        <h2 class="group-head">Images ({shownImages.length})</h2>
        {#if shownImages.length === 0}
          <p class="empty">No images match “{query}”.</p>
        {:else}
          {@render wallGrid(shownImages)}
        {/if}
      {/if}
    </div>
  {:else if view === "exhibits"}
    {@render cardGrid(shownCards)}
  {:else}
    <!-- All-images wall: one entry per Object from the baked index; a click opens the Object in its
         Exhibit (#/<slug>/o/<id>). Virtualized like ObjectGrid (content-visibility + lazy imgs). -->
    {@render wallGrid(shownImages)}
  {/if}
</main>

<!-- The two result grids as snippets so search mode and browse mode render the SAME markup — the groups
     are a different arrangement of one gallery, not a second gallery. -->
{#snippet cardGrid(items: typeof shownCards)}
  <ul class="grid cards">
    {#each items as ex (ex.slug)}
      {@const c = coverSrcOf(ex)}
      <li>
        <a class="card" href={`#/${ex.slug}`}>
          {#if c}
            <img class="cover" src={c.src} alt="" loading="lazy" decoding="async" onerror={() => markFailed(c.key)} />
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
{/snippet}

{#snippet wallGrid(items: typeof shownImages)}
  <ul class="grid wallgrid" style:--grid-min={metrics.minCol} style:--grid-intrinsic={metrics.intrinsic}>
    {#each items as img (`${img.exhibitSlug}/${img.objectId}`)}
      <li style:aspect-ratio={aspectOf(img.width, img.height)}>
        <a class="tile" href={wallHref(img)} title={img.title}>
          {#if img.thumbnail && !failed.has(`${img.exhibitSlug}/${img.objectId}`)}
            <img src={publishedAssetUrl(img.thumbnail)} alt={img.title} loading="lazy" decoding="async" onerror={() => markFailed(`${img.exhibitSlug}/${img.objectId}`)} />
          {:else}
            <span class="tile-fallback">{img.title || "Untitled"}</span>
          {/if}
        </a>
      </li>
    {/each}
  </ul>
{/snippet}

<style>
  /* Gallery wall — warm, lamplit; cards float as invitations (system.md §Exhibit Gallery). */
  .gallery { max-width: 1040px; margin: 0 auto; padding: var(--space-12) var(--space-6); }
  .intro { margin-bottom: var(--space-8); max-width: 40rem; }
  .intro h1 { font-family: var(--font-display); font-weight: 300; font-size: 3rem; line-height: 1.1; margin: var(--space-2) 0 var(--space-3); color: var(--ink-paper-primary); text-shadow: var(--shadow-text-haze); }
  .blurb { font-family: var(--font-body); font-size: 1.25rem; line-height: 1.6; color: var(--ink-paper-secondary); margin: 0; }
  .credit-row { margin: var(--space-3) 0 0; }

  /* Toolbar — quiet: a view toggle, one search field, an optional density switch. Matches the landing voice. */
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-bottom: var(--space-8); }
  .views, .density { display: inline-flex; border-radius: var(--radius-sm); overflow: hidden; }
  .views button, .density button {
    background: var(--surface-canvas-raised); color: var(--ink-canvas-secondary);
    border: none; padding: var(--space-2) var(--space-4); cursor: pointer;
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-xs); font-weight: 500;
    letter-spacing: 0.1em; text-transform: uppercase; transition: color 160ms ease, background 160ms ease;
  }
  .views button:hover, .density button:hover { color: var(--accent-2); }
  /* Selected state, quiet (V21's sibling): ink weight + an emphasis hairline instead of an accent fill,
     so the segmented controls don't out-shout the library title. One idiom across both grids. */
  .views button.on, .density button.on {
    background: var(--surface-canvas); color: var(--ink-paper-primary); font-weight: 600;
    box-shadow: inset 0 0 0 1px var(--border-paper-emphasis);
  }
  .views button.on:hover, .density button.on:hover { color: var(--ink-paper-primary); }
  .search {
    flex: 1; min-width: 12rem; max-width: 22rem;
    font-family: var(--font-body); font-size: 1rem; color: var(--ink-paper-primary);
    padding: var(--space-2) var(--space-3); background: var(--surface-canvas-raised);
    border: none; border-radius: var(--radius-sm); box-shadow: var(--shadow-inset-fog);
  }
  .search::placeholder { color: var(--ink-paper-secondary); }

  .grid { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-6); }
  .cards { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
  .card { display: flex; flex-direction: column; text-decoration: none; background: var(--surface-canvas-raised); border: none; border-radius: var(--radius-md); overflow: hidden; transition: transform 200ms ease; }
  .card:hover { transform: translateY(-3px); }
  /* Group headings in search mode — same quiet uppercase rubric as Studio's LibraryHome results. */
  .group-head { margin: 0 0 var(--space-4); font-family: var(--font-ui), sans-serif; font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-secondary); }
  .results .group-head:not(:first-child) { margin-top: var(--space-8); }

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
  .wallgrid > li { content-visibility: auto; contain-intrinsic-size: auto var(--grid-intrinsic, 360px); border-radius: var(--radius-md); overflow: hidden; background: var(--surface-canvas-raised); transition: transform 200ms ease; }
  .wallgrid > li:hover { transform: translateY(-3px); }
  .tile { display: block; width: 100%; height: 100%; }
  .tile img { display: block; width: 100%; height: 100%; object-fit: cover; background-color: var(--surface-canvas); }
  .tile-fallback { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; box-sizing: border-box; padding: var(--space-4); text-align: center; font-family: var(--font-display); font-size: 1.2rem; line-height: 1.2; color: var(--ink-canvas-secondary); background: var(--surface-canvas); }

  .empty { font-family: var(--font-body); font-size: 1.25rem; line-height: 1.6; color: var(--ink-paper-secondary); padding: var(--space-8); background: var(--surface-canvas-raised); border: none; border-radius: var(--radius-lg); box-shadow: var(--shadow-inset-fog); }
</style>
