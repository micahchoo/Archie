<script lang="ts">
  // The single client-routed shell — "one smart hall" (CONTEXT §"Local view loop"). Reads the hash,
  // routes to the Gallery / an ExhibitView / the empty hall, listens for hashchange. Two data sources
  // behind one shell (ADR-0008): HOSTED (baked tree, fetched) auto-detected by presence; PORTABLE (an
  // opened `.archie.zip`). Mode is detected at boot: try to load a library; on "no baked tree" (404)
  // show the empty hall; a `?src=` (ADR-0009) opens a hosted zip first. Hash routing = zero per-host config.
  import { onMount } from "svelte";
  import { parseRoute, breadcrumbFor, shouldRenderGalleryFromJson, type ViewerRoute, type ExhibitsJson } from "@render/core";
  import {
    loadGallery, probeViewerMode, openLibraryFromSrc, openLibraryFromFile, closePortableLibrary,
  } from "../published.js";
  import Gallery from "./Gallery.svelte";
  import ExhibitView from "./ExhibitView.svelte";
  import EmptyHall from "./EmptyHall.svelte";

  let route = $state<ViewerRoute>({ view: "gallery" });
  let gallery = $state<ExhibitsJson | null>(null);
  let phase = $state<"probing" | "empty" | "ready" | "error">("probing");
  let errorMsg = $state("");
  let openError = $state(""); // shown in the empty hall when an open attempt fails

  function sync() {
    route = parseRoute(location.hash);
  }

  // Cold-arrival (§96): a deep-link to an exhibit/note landed, but no library is open here.
  const coldArrival = $derived(phase === "empty" && route.view === "exhibit");

  /** A library is available (hosted tree or an opened zip) — load the gallery + collapse if single. */
  async function loadAndShow(): Promise<boolean> {
    try {
      const g = await loadGallery();
      gallery = g;
      // Single-exhibit collapse (CONTEXT §Gallery): a lone exhibit → land straight in it.
      if (route.view === "gallery" && !shouldRenderGalleryFromJson(g) && g.exhibits[0]) {
        route = { view: "exhibit", slug: g.exhibits[0].slug };
      }
      phase = "ready";
      return true;
    } catch {
      return false;
    }
  }

  async function boot() {
    route = parseRoute(location.hash);
    // ?src= (ADR-0009): open the hosted zip first, then apply the rest of the route.
    if (route.src) {
      try {
        await openLibraryFromSrc(route.src);
      } catch (e) {
        openError = e instanceof Error ? e.message : "Couldn’t open that library.";
        phase = "empty";
        return;
      }
    }
    if (await loadAndShow()) return;
    // No library loaded — distinguish "no baked tree" (→ empty hall) from a real failure.
    const mode = await probeViewerMode();
    if (mode === "portable") phase = "empty";
    else {
      errorMsg = "Could not reach the library.";
      phase = "error";
    }
  }

  async function handleFile(file: File) {
    openError = "";
    try {
      await openLibraryFromFile(file);
    } catch {
      openError = "That file isn’t an Archie library.";
      return;
    }
    if (!(await loadAndShow())) {
      closePortableLibrary();
      openError = "That library couldn’t be read.";
    }
  }

  /** Leave the current library and return to the empty hall (portable swap-to-change, CONTEXT §223). */
  function openAnother() {
    closePortableLibrary();
    gallery = null;
    route = { view: "gallery" };
    if (location.hash !== "#/" && location.hash !== "") location.hash = "#/";
    openError = "";
    phase = "empty";
  }

  onMount(() => {
    void boot();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  });

  // Exhibit↔Library up-nav — only when a gallery exists to return to (not when collapsed to one exhibit).
  const showCrumbs = $derived(
    phase === "ready" && route.view === "exhibit" && gallery !== null && shouldRenderGalleryFromJson(gallery),
  );
  const crumbs = $derived.by(() => {
    if (route.view !== "exhibit" || !gallery) return [];
    const slug = route.slug; // capture before the closure (TS won't narrow a mutable across it)
    return breadcrumbFor(route, {
      libraryLabel: gallery.library.title ?? "Gallery",
      exhibitTitle: gallery.exhibits.find((e) => e.slug === slug)?.title,
    });
  });
</script>

<!-- "Open another library" escape, in persistent chrome so a single-exhibit collapse can't trap the
     reader. Shown whenever a library is loaded — hosted OR portable (reversed 2026-05-27 from the
     original portable-only rule, per user override; see ADR-0008). In hosted mode it drops to the
     empty hall, from which a `.archie.zip` can be opened. -->
{#if phase === "ready"}
  <button class="open-another" onclick={openAnother}>Open another library</button>
{/if}

{#if showCrumbs}
  <nav class="crumbs" aria-label="Breadcrumb">
    {#each crumbs as c, i (c.hash)}
      {#if i > 0}<span class="sep">›</span>{/if}
      <a href={c.hash}>{c.label}</a>
    {/each}
  </nav>
{/if}

{#if phase === "probing"}
  <div class="state"><span class="dot"></span><span>Opening…</span></div>
{:else if phase === "empty"}
  <EmptyHall onfile={handleFile} cold={coldArrival} error={openError} />
{:else if phase === "error"}
  <div class="state error"><span class="warn">⚠</span><span>{errorMsg}</span></div>
{:else if route.view === "exhibit"}
  {#key `${route.slug}/${route.noteId ?? ""}`}
    <ExhibitView slug={route.slug} noteId={route.noteId} />
  {/key}
{:else if gallery}
  <Gallery {gallery} />
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

  /* Portable swap-to-change — quiet, top-right (escape-out, not a primary action; CONTEXT §134). */
  .open-another {
    position: fixed; z-index: 35; top: var(--space-3); right: var(--space-4);
    font-family: var(--font-ui), sans-serif; font-size: 0.78rem; cursor: pointer;
    background: none; border: none; padding: 0; color: var(--ink-canvas-secondary);
  }
  .open-another:hover { color: var(--accent); }

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
