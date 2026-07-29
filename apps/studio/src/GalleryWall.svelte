<script lang="ts">
/**
 * @surface gallery
 * @composes GalleryThumb
 * @variants populated, empty (with query, without query)
 * @constraint content-visibility: auto for virtualized off-screen tiles
 */
  // The all-images wall (SCALE-GALLERY Phase 3.2) — every Object across the Library on one virtualized
  // grid, the Studio twin of the Viewer Gallery wall (congruent shape, but Studio feeds OPFS thumbs, not
  // baked refs — and reads live, never the published index). Studio-LOCAL by design: a truly shared
  // component would force packages/ churn against the committed viewer wall; congruent shape > forced reuse
  // (spike-0004 §3). Clicking a tile opens that exhibit's editor at that object (onopenobject).
  import GalleryThumb from "./GalleryThumb.svelte";
  import type { GalleryImage } from "./gallery-data.js";

  let { images, query = "", onopenobject }: {
    images: ReadonlyArray<GalleryImage>;
    /** The active search text — only so the empty state reads correctly (filtered-empty vs no-media). */
    query?: string;
    /** Open the object in its exhibit's editor (App owns the cross-exhibit navigation). */
    onopenobject: (slug: string, objId: string) => void;
  } = $props();
</script>

{#if images.length === 0}
  <p class="wall-empty">{query.trim() ? "No media matches your search." : "No media in this library yet."}</p>
{:else}
  <ul class="wall">
    <!-- Key by slug+id: legacy composed ids repeat their ordinal tail across exhibits, and pre-migration
         libraries still carry exhibit-local "o<n>" ids that collide outright (Archie-9ea8). -->
    {#each images as im (im.exhibitSlug + "/" + im.objectId)}
      <li>
        <button class="tile" onclick={() => onopenobject(im.exhibitSlug, im.objectId)}
          title={`${im.title} — ${im.exhibitTitle}`}>
          <GalleryThumb slug={im.exhibitSlug} source={im.source} mediaType={im.mediaType} alt={im.title} />
          <span class="cap">
            <span class="t">{im.title}</span>
            <span class="ex">{im.exhibitTitle}</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .wall { list-style: none; margin: 0 auto; padding: 0; max-width: 60rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--space-5); }
  /* PERF: skip layout/paint/decode of off-screen tiles at Library scale (the 50+-object surface). Pairs
     with GalleryThumb's IntersectionObserver mint — content-visibility bounds paint, the observer bounds
     the blob-URL minting. `auto` remembers each tile's real height so the scrollbar never jumps. */
  .wall > li { content-visibility: auto; contain-intrinsic-size: auto 240px; }
  .tile {
    display: flex; flex-direction: column; gap: var(--space-2); width: 100%; padding: var(--space-2); cursor: pointer; text-align: left;
    background: var(--surface-canvas-raised); color: inherit; border: none; border-radius: var(--radius-md);
    transition: transform 160ms ease;
  }
  /* No lift on a tile (Archie-1244 / 5c1d Option C — a grid tile sits ON the wall, it does not float
     above it). The raised fill separates it at rest and the 2px rise is the hover affordance; both
     were already here, with the shadow layered on top as a third cue. */
  .tile:hover { transform: translateY(-2px); }
  /* The lift is gone but the FOCUS RING must not be — it was the second layer of this same
     box-shadow, and dropping the whole declaration would silently delete keyboard focus. */
  .tile:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--accent); }
  .cap { display: flex; flex-direction: column; gap: 1px; padding: 0 var(--space-1) var(--space-1); }
  .cap .t { font-family: var(--font-display); font-size: 1rem; font-weight: 400; line-height: 1.15; color: var(--ink-canvas-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cap .ex { font-family: var(--font-mono); font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-canvas-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .wall-empty { max-width: 60rem; margin: var(--space-8) auto; font-family: var(--font-body); font-size: 1.05rem; color: var(--ink-canvas-secondary); text-align: center; }
</style>
