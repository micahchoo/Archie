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
    initLiveSource,
  } from "../published.js";
  import Gallery from "./Gallery.svelte";
  import ExhibitView from "./ExhibitView.svelte";
  import EmptyHall from "./EmptyHall.svelte";

  let route = $state<ViewerRoute>({ view: "gallery" });
  let gallery = $state<ExhibitsJson | null>(null);
  let phase = $state<"probing" | "empty" | "ready" | "error">("probing");
  let errorMsg = $state("");
  let openError = $state(""); // shown in the empty hall when an open attempt fails

  // Object-nav carousel snapshot lifted up from ExhibitView (dba2): the center zone of the persistent top
  // bar. `selectedObjectId` stays owned by ExhibitView; this only reflects it + calls back to navigate.
  // null whenever the carousel shouldn't show (gallery, grid overview, AV, narrative, single object).
  type CarouselNav = { siblings: { id: string; label: string }[]; currentId: string; navigate: (id: string) => void };
  let carousel = $state<CarouselNav | null>(null);

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
    // Live source (Q-3): probe the same-origin Studio working store BEFORE the gallery load so an
    // authored exhibit appears with no publish step. Quiet no-op everywhere it can't apply.
    await initLiveSource();
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

  // Leaving an exhibit (back to gallery / empty hall) leaves the lifted carousel stale — clear it so the
  // bar's center zone empties. ExhibitView also emits null on teardown, but this guards the route-change
  // case where its effect may not have re-run yet.
  $effect(() => {
    if (route.view !== "exhibit") carousel = null;
  });

  // Origin-drift observability (ADR-0013): canonical builds bake the expected origin
  // (PUBLIC_CANONICAL_ORIGIN, set only by build-gh-pages.sh); if this build serves from anywhere
  // else, the config and the deploy have drifted — every minted ?src=/og/sitemap URL is breaking.
  // Third-party publishes don't bake the var and never see this.
  // Passed by index.astro's frontmatter (where build-time env exists) — Vite does not
  // define-replace import.meta.env.PUBLIC_* inside client islands, so a prop carries it.
  let { expectedBase }: { expectedBase?: string } = $props();
  let originDrift = $state(false);
  $effect(() => {
    if (expectedBase && typeof window !== "undefined" && !window.location.href.startsWith(expectedBase)) {
      originDrift = true;
      console.warn(`Archie: this canonical build expects to serve at ${expectedBase} but is at ${window.location.href} — minted absolute URLs (share links, og:image, sitemap) are broken. Update archie.config.json and redeploy.`);
    }
  });

  // The three-zone bar shows whenever a library is loaded (same gate as the old open-another chrome).
  const showBar = $derived(phase === "ready");
  // Center-zone carousel geometry (was the in-Reader carousel's derived idx/prev/next, lifted up).
  const cIdx = $derived(carousel ? carousel.siblings.findIndex((s) => s.id === carousel!.currentId) : -1);
  const cPrev = $derived(carousel && cIdx > 0 ? carousel.siblings[cIdx - 1] : undefined);
  const cNext = $derived(carousel && cIdx >= 0 && cIdx < carousel.siblings.length - 1 ? carousel.siblings[cIdx + 1] : undefined);
</script>

<!-- The persistent top bar (dba2): ONE thin three-zone bar over the dark table — left = breadcrumb /
     "Back to Exhibit", center = object carousel (lifted out of Reader so it no longer occludes the image
     top-center), right = "Open another library" (quiet escape so a single-exhibit collapse can't trap the
     reader; shown whenever a library is loaded — hosted OR portable, reversed 2026-05-27 per ADR-0008). The
     chrome recedes — the image is the star. -->
<!-- Origin-drift badge renders UNGATED (review r8): the worst drift case — the old host gone,
     the library failing to load — is exactly when it must still surface. -->
{#if originDrift}
  <span class="drift" title="This canonical build expects {expectedBase} — minted share/og/sitemap URLs are broken. Update archie.config.json and redeploy.">⚠ origin drift</span>
{/if}

{#if showBar}
  <div class="topbar" class:on-paper={route.view !== "exhibit"}>
    <div class="zone left">
      {#if showCrumbs}
        <nav class="crumbs" aria-label="Breadcrumb">
          {#each crumbs as c, i (c.hash)}
            {#if i > 0}<span class="sep">›</span>{/if}
            <a href={c.hash}>{c.label}</a>
          {/each}
        </nav>
      {/if}
    </div>
    <div class="zone center">
      {#if carousel}
        <nav class="carousel" aria-label="Objects in this exhibit">
          <button class="cnav" disabled={!cPrev} onclick={() => { if (cPrev) carousel?.navigate(cPrev.id); }} title={cPrev ? `Previous: ${cPrev.label}` : "No previous object"}>‹</button>
          <span class="cpos">{cIdx >= 0 ? cIdx + 1 : "–"} / {carousel.siblings.length}</span>
          <button class="cnav" disabled={!cNext} onclick={() => { if (cNext) carousel?.navigate(cNext.id); }} title={cNext ? `Next: ${cNext.label}` : "No next object"}>›</button>
        </nav>
      {/if}
    </div>
    <div class="zone right">
      <button class="open-another" onclick={openAnother}>Open another library</button>
    </div>
  </div>
{/if}

{#if phase === "probing"}
  <div class="state"><span class="dot"></span><span>Opening…</span></div>
{:else if phase === "empty"}
  <EmptyHall onfile={handleFile} cold={coldArrival} error={openError} />
{:else if phase === "error"}
  <div class="state error"><span class="warn">⚠</span><span>{errorMsg}</span></div>
{:else if route.view === "exhibit"}
  {#key `${route.slug}/${route.noteId ?? ""}`}
    <ExhibitView slug={route.slug} noteId={route.noteId} onnav={(n) => (carousel = n)} />
  {/key}
{:else if gallery}
  <Gallery {gallery} />
{/if}

<style>
  /* Persistent top bar (dba2) — ONE thin three-zone bar over the dark table; chrome recedes, the image is
     the star. Transparent so it floats over the canvas without a hard band; the carousel pill carries its
     own surface. left | center | right via a 3-column grid so the carousel stays truly centered. */
  .topbar {
    position: fixed; z-index: 35; top: 0; left: 0; right: 0;
    display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
    padding: var(--space-3) var(--space-4); gap: var(--space-3);
    pointer-events: none; /* the bar's gaps don't steal canvas clicks — zones re-enable below */
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-sm);
  }
  .topbar .zone { display: flex; align-items: center; pointer-events: auto; }
  .topbar .left { justify-self: start; }
  .topbar .center { justify-self: center; }
  .topbar .right { justify-self: end; }
  .topbar .zone:empty { pointer-events: none; }

  /* Breadcrumb — understated; the way back up (CONTEXT §125). Connector-blue hover (the secondary
     signal for links/up-nav) keeps the rationed orange free for the one focal action. */
  .crumbs { display: flex; align-items: center; gap: var(--space-2); }
  .crumbs a { color: var(--ink-canvas-secondary); text-decoration: none; }
  .crumbs a:hover { color: var(--accent-2); }
  .crumbs .sep { color: var(--ink-canvas-muted); }

  /* Object carousel — ‹ prev · i/n · next › thin glyph form (dba2: lean, no thumbs/labels, so it
     doesn't fight crumbs + open-another for width). The one floating surface reads as a soft warm-paper
     pill — rounded, lifted by a wide soft shadow, no border (separated by shadow + tone). */
  .carousel {
    display: flex; align-items: center; gap: var(--space-1);
    padding: 2px var(--space-2);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-primary);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-lift-low);
  }
  .carousel .cnav {
    display: flex; align-items: center; justify-content: center; min-width: 1.25rem;
    background: none; border: none; color: var(--ink-canvas-secondary); cursor: pointer; font: inherit;
    font-size: 1.05rem; line-height: 1;
  }
  .carousel .cnav:hover:not(:disabled) { color: var(--accent-2); }
  .carousel .cnav:disabled { opacity: 0.3; cursor: default; }
  .carousel .cpos {
    color: var(--ink-canvas-muted); font-family: var(--font-mono), monospace;
    font-variant-numeric: tabular-nums; padding: 0 var(--space-1); letter-spacing: 0.1em;
  }

  /* Origin-drift badge — a broken-config alert. Warm-paper chip lifted by a soft shadow, rounded;
     the alert reads through semantic-error ink + a hairline error border and the quiet uppercase mono
     tracking (a found warning label, not a loud arcade panel) (CONTEXT §134). */
  .drift {
    position: fixed; z-index: 60; top: var(--space-3); right: var(--space-3);
    padding: 4px var(--space-2);
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-xs); font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.14em;
    color: var(--semantic-error);
    border: 1px solid var(--border-canvas-emphasis);
    border-radius: var(--radius-sm);
    background: var(--surface-canvas-raised); box-shadow: var(--shadow-lift-low);
  }
    .open-another {
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-xs); cursor: pointer;
    text-transform: uppercase; letter-spacing: 0.14em;
    background: none; border: none; padding: var(--space-2) 0; color: var(--ink-canvas-secondary); /* 24px+ hit box (Fitts) — transparent, no visual shift */
  }
  .open-another:hover { color: var(--accent-2); }

  /* Over the gallery wall (light) the bar's canvas inks fail contrast (axe: 2.1) — swap the quiet
     chrome to paper inks; the bar floats over BOTH surface families, so ink follows the backdrop. */
  .topbar.on-paper .crumbs a { color: var(--ink-paper-secondary); }
  .topbar.on-paper .crumbs .sep { color: var(--ink-paper-muted); }
  .topbar.on-paper .open-another { color: var(--ink-paper-secondary); }

  .state {
    display: flex; align-items: center; justify-content: center; gap: 10px; height: 100vh;
    background: var(--surface-canvas); color: var(--ink-canvas-secondary);
    font-family: var(--font-ui), sans-serif; font-size: 0.9375rem; text-transform: uppercase; letter-spacing: 0.16em;
  }
  .state.error { color: var(--semantic-error); }
  .warn { font-size: 1.1rem; }
  /* Soft round pulse — a quiet breathing dot in the rationed signal-orange; the one focal mark on the
     loading surface (pulse keyframe preserved). */
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: pulse 1.1s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
</style>
