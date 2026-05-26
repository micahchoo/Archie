<script lang="ts">
  // The single client-routed shell — "one smart hall" (CONTEXT §"Local view loop"). Reads the hash,
  // routes to the Gallery or an ExhibitView, listens for hashchange. Replaces the former hand-written
  // per-exhibit .astro pages: any published Library renders here with no per-exhibit code. Hash
  // routing = zero per-host config (works on any static host, incl. GH project sites).
  import { onMount } from "svelte";
  import { parseRoute, breadcrumbFor, shouldRenderGalleryFromJson, type ViewerRoute, type ExhibitsJson } from "@render/core";
  import { loadGallery } from "../published.js";
  import Gallery from "./Gallery.svelte";
  import ExhibitView from "./ExhibitView.svelte";

  let route = $state<ViewerRoute>({ view: "gallery" });
  let gallery = $state<ExhibitsJson | null>(null);
  let galleryError = $state("");

  function sync() {
    route = parseRoute(location.hash);
  }

  onMount(() => {
    sync();
    window.addEventListener("hashchange", sync);
    loadGallery()
      .then((g) => {
        gallery = g;
        // Single-exhibit collapse (CONTEXT §Gallery): a lone exhibit with no framing → land straight
        // in it rather than show a one-card gallery.
        if (route.view === "gallery" && !shouldRenderGalleryFromJson(g) && g.exhibits[0]) {
          route = { view: "exhibit", slug: g.exhibits[0].slug };
        }
      })
      .catch((e) => (galleryError = e instanceof Error ? e.message : "Could not load the gallery."));
    return () => window.removeEventListener("hashchange", sync);
  });

  // Exhibit↔Library up-nav (the gap: previously no way back to the gallery). Shown only when a
  // gallery actually exists to return to (not when collapsed to a single exhibit).
  const showCrumbs = $derived(route.view === "exhibit" && gallery !== null && shouldRenderGalleryFromJson(gallery));
  const crumbs = $derived.by(() => {
    if (route.view !== "exhibit" || !gallery) return [];
    const slug = route.slug; // capture before the closure (TS won't narrow a mutable across it)
    return breadcrumbFor(route, {
      libraryLabel: gallery.library.title ?? "Gallery",
      exhibitTitle: gallery.exhibits.find((e) => e.slug === slug)?.title,
    });
  });
</script>

{#if showCrumbs}
  <nav class="crumbs" aria-label="Breadcrumb">
    {#each crumbs as c, i (c.hash)}
      {#if i > 0}<span class="sep">›</span>{/if}
      <a href={c.hash}>{c.label}</a>
    {/each}
  </nav>
{/if}

{#if route.view === "exhibit"}
  {#key `${route.slug}/${route.noteId ?? ""}`}
    <ExhibitView slug={route.slug} noteId={route.noteId} />
  {/key}
{:else if galleryError}
  <div class="state error"><span class="warn">⚠</span><span>{galleryError}</span></div>
{:else if gallery}
  <Gallery {gallery} />
{:else}
  <div class="state"><span class="dot"></span><span>Loading…</span></div>
{/if}

<style>
  /* Breadcrumb — understated, top-left over the dark table; the way back up (CONTEXT §125). */
  .crumbs {
    position: fixed; z-index: 35; top: var(--space-3); left: var(--space-4);
    display: flex; align-items: center; gap: var(--space-2);
    font-family: var(--font-ui), sans-serif; font-size: 0.78rem;
  }
  .crumbs a { color: var(--ink-canvas-secondary); text-decoration: none; }
  .crumbs a:hover { color: var(--accent); }
  .crumbs .sep { color: var(--ink-canvas-muted); }

  .state {
    display: flex; align-items: center; justify-content: center; gap: 10px; height: 100vh;
    background: var(--surface-canvas); color: var(--ink-canvas-secondary);
    font-family: var(--font-ui), sans-serif; font-size: 0.9375rem; letter-spacing: 0.02em;
  }
  .state.error { color: var(--accent); }
  .warn { font-size: 1.1rem; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: pulse 1.1s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
</style>
