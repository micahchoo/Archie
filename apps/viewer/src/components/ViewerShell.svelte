<script lang="ts">
  // The single client-routed shell — "one smart hall" (CONTEXT §"Local view loop"). Reads the hash,
  // routes to the Gallery / an ExhibitView / the empty hall, listens for hashchange. Two data sources
  // behind one shell (ADR-0008): HOSTED (baked tree, fetched) auto-detected by presence; PORTABLE (an
  // opened `.archie.zip`). Mode is detected at boot: try to load a library; on "no baked tree" (404)
  // show the empty hall; a `?src=` (ADR-0009) opens a hosted zip first. Hash routing = zero per-host config.
  import { onMount, setContext } from "svelte";
  import { parseRoute, breadcrumbFor, shouldRenderGalleryFromJson, LIVE_CHANNEL, type ViewerRoute, type ExhibitsJson, type ImageIndex } from "@render/core";
  import { CITE_GALLERY, type GalleryRef } from "../cite-context.js";
  import {
    loadGallery, loadImageIndex, probeViewerMode, bootErrorMessage, openLibraryFromSrc, openLibraryFromFile, closePortableLibrary,
    initLiveSource, isPortable,
  } from "../published.js";
  import Gallery from "./Gallery.svelte";
  // ExhibitView is imported LAZILY in the exhibit-route block below — its subtree (Reader/NarrativeReader →
  // @render/svelte → @render/mount) pulls OpenSeadragon + Annotorious (~1 MB), none of which the gallery
  // landing needs. Static-importing it here forced that chunk onto the highest-traffic page.
  import EmptyHall from "./EmptyHall.svelte";

  let route = $state<ViewerRoute>({ view: "gallery" });
  let gallery = $state<ExhibitsJson | null>(null);
  let imageIndex = $state<ImageIndex | null>(null); // ADR-0023 wall source; null → Gallery hides the wall
  // Expose the loaded gallery to the cite-card layer (ProseCites) without prop-drilling — a getter ref
  // so consumers re-derive as the library loads. See cite-context.ts.
  setContext(CITE_GALLERY, { get value() { return gallery; } } satisfies GalleryRef);
  let phase = $state<"probing" | "empty" | "ready" | "error">("probing");
  let errorMsg = $state("");
  let openError = $state(""); // shown in the empty hall when an open attempt fails
  // The library chooser is a DISMISSIBLE SURFACE, not a place (Archie-4635 / audit V1+V2). It used to be
  // expressed as `phase = "empty"` with the current library torn down first, which made "Open another
  // library" a one-way door: the hall's only control was "Open a library…", Esc did nothing, and browser
  // Back restored the ADDRESS while leaving the hall on screen. Keeping it separate from `phase` means the
  // library being read survives underneath, so Cancel/Esc/navigation can return to it. CONTEXT's rule that
  // scrimmed surfaces aren't places is why the address deliberately stays put while it's open.
  let choosing = $state(false);
  // Something to go back TO — false in genuine empty state (no baked tree, or portable before first open),
  // where the hall is the whole app and there is nothing to cancel.
  const canCancelChoosing = $derived(choosing && phase === "ready");
  // The slug rung's degrade notice (audit V3). The object/note/section rungs announce themselves from
  // inside ExhibitView (`arrivalMessage`), but a bad SLUG degrades to the Gallery — which ExhibitView never
  // renders — so the notice for that rung has to live up here, or it can't be shown at all.
  let degradeNotice = $state("");

  // Object-nav carousel snapshot lifted up from ExhibitView (dba2): the center zone of the persistent top
  // bar. `selectedObjectId` stays owned by ExhibitView; this only reflects it + calls back to navigate.
  // null whenever the carousel shouldn't show (gallery, grid overview, AV, narrative, single object).
  // `toOverview` (R2): the Exhibit breadcrumb's "natural start" (CONTEXT §142) is the OVERVIEW for a
  // multi-object exhibit. Object selection is component-local (un-routed by design), so the exhibit
  // crumb can't navigate by hash (it'd point at the current hash → no hashchange → no-op). ExhibitView
  // hands up a reset callback instead; present only while an object is open within a multi-object exhibit.
  type CarouselNav = { siblings: { id: string; label: string }[]; currentId: string; navigate: (id: string) => void; toOverview?: () => void };
  let carousel = $state<CarouselNav | null>(null);

  function sync() {
    route = parseRoute(location.hash);
    // V2: any navigation — including browser Back — dismisses the chooser. Without this the hash changed
    // underneath a hall that stayed mounted, so the address said "#/{slug}" while the pixels said "no
    // library open", and only a reload reconciled them. Guarded on `ready` so a genuine empty state (no
    // library at all) still shows the hall after a hashchange.
    if (phase === "ready") choosing = false;
    degradeNotice = ""; // a fresh navigation supersedes any previous degrade announcement
  }

  // Cold-arrival (§96): a deep-link to an exhibit/note landed, but no library is open here.
  const coldArrival = $derived(phase === "empty" && route.view === "exhibit");

  /** A library is available (hosted tree or an opened zip) — load the gallery + collapse if single. */
  async function loadAndShow(): Promise<boolean> {
    try {
      const g = await loadGallery();
      gallery = g;
      // ADR-0023 wall source — fire-and-forget so the landing (esp. the single-exhibit collapse below)
      // never waits on images.json; the wall populates reactively when it resolves, null → cards-only.
      void loadImageIndex().then((i) => (imageIndex = i));
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

  // Slug-level degrade-upward (Phase 3 / 4.3): a deep-link to an exhibit slug ABSENT from the loaded
  // library used to throw a full-screen error (loadPublishedExhibit → readExhibitTree 404 → status=error).
  // Mirror the note-rung degrade (ExhibitView.arriveAtNote linkMissing): never a dead error screen — fall
  // back to the Gallery, or, when the library holds exactly ONE exhibit, straight into that exhibit. The
  // load lives in ExhibitView; it calls this on a load failure instead of rendering its error state.
  function degradeToGallery() {
    const exhibits = gallery?.exhibits ?? [];
    if (exhibits.length === 1 && exhibits[0]) {
      // One-exhibit library: a bad slug can only have meant the single real exhibit — land in it.
      route = { view: "exhibit", slug: exhibits[0].slug };
      degradeNotice = "That exhibit isn’t in this library — showing the one it holds instead";
    } else {
      route = { view: "gallery" };
      degradeNotice = "That exhibit isn’t in this library — showing the library instead";
    }
    // V3: SAY SO. This rung degraded silently, while the object/note/section rungs each announced
    // themselves — a reader who followed a link to one exhibit landed on a gallery of six and was told
    // nothing. The notice component existed and worked; this rung just wasn't using it.
    // V4: normalize the address with replaceState, NOT `location.hash =`. Two reasons: assigning the hash
    // fires `hashchange` → `sync()`, which would immediately wipe the notice we just set; and replaceState
    // doesn't add a history entry, so Back still goes where the reader came from rather than bouncing off
    // the dead target. Same policy now applies on the note/object/section rungs inside ExhibitView.
    const want = route.view === "gallery" ? "#/" : `#/${route.slug}`;
    if (location.hash !== want) history.replaceState(null, "", want);
  }

  // Live refresh (no reload): re-probe the working store + reload the gallery IN PLACE so a newly-
  // authored exhibit appears without a restart. Doesn't touch route/phase (the open exhibit is
  // undisturbed). Guarded against overlap; skips portable mode (an opened .archie.zip is static). From
  // the empty hall a signal may mean a first library now exists — re-boot to pick it up.
  let refreshing = false;
  async function refreshLive(): Promise<void> {
    if (refreshing || isPortable()) return;
    refreshing = true;
    try {
      if (phase === "ready") {
        await initLiveSource();
        gallery = await loadGallery();
        imageIndex = await loadImageIndex();
      } else if (phase === "empty") {
        await boot();
      }
    } catch {
      /* transient (e.g. a read during a Studio write) — keep the current view; the next focus/signal retries */
    } finally {
      refreshing = false;
    }
  }

  async function boot() {
    route = parseRoute(location.hash);
    // Live source (Q-3): probe the same-origin Studio working store BEFORE the gallery load so an
    // authored exhibit appears with no publish step. Quiet no-op everywhere it can't apply.
    await initLiveSource();
    // ?src= (ADR-0009): open the hosted library first, then apply the rest of the route. Since
    // Archie-6d85 the src may be a `.archie.zip` OR a published TREE BASE — openLibraryFromSrc
    // dispatches on the extension, so nothing here needs to know which.
    if (route.src) {
      try {
        await openLibraryFromSrc(route.src);
      } catch (e) {
        openError = e instanceof Error ? e.message : "That library couldn’t be opened. Give it an Archie .archie.zip file, or the address of a published Archie library.";
        phase = "empty";
        return;
      }
    }
    if (await loadAndShow()) return;
    // No library loaded — distinguish "no baked tree" (→ empty hall) from a real failure, and WHICH
    // failure (Archie-a2b9): "offline" gets the connection message; a deploy/data problem ("broken":
    // corrupt JSON / 5xx — or "hosted": the probe read fine yet the load failed, e.g. a wrong-version
    // marker) gets the republish one. One collapsed message here used to blame the reader's connection
    // for a broken deployment.
    const mode = await probeViewerMode();
    if (mode === "portable") phase = "empty";
    else {
      errorMsg = bootErrorMessage(mode);
      phase = "error";
    }
  }

  async function handleFile(file: File) {
    openError = "";
    try {
      await openLibraryFromFile(file);
    } catch (e) {
      // The open seam (untrusted-archive-open-seam) re-throws its zip-bomb-cap / torn-zip /
      // NotAnArchieLibraryError failures as Errors with a user-appropriate message — surface it, same
      // as the ?src= path below, instead of collapsing every reason into one generic line.
      openError = e instanceof Error ? e.message : "That file isn’t an Archie library.";
      return;
    }
    if (!(await loadAndShow())) {
      closePortableLibrary();
      openError = "That library couldn’t be opened. Make sure it’s an Archie .archie.zip file.";
      return;
    }
    // A replacement actually arrived — leave the chooser. On failure we deliberately stay, so the error
    // sits beside the control that produced it (the embed's failed-`src` pattern, audit V10).
    choosing = false;
    degradeNotice = "";
  }

  /**
   * Offer the chooser (portable swap-to-change, CONTEXT §223) WITHOUT discarding what's being read.
   *
   * This used to tear down first — `closePortableLibrary()`, `gallery = null`, `phase = "empty"` — which
   * is what made it a one-way door (audit V1): after the teardown there was nothing to return to, so no
   * Cancel could exist even in principle. ADR-0008 put this affordance in both data modes so a
   * single-exhibit collapse "can't trap the reader"; the mitigation had become the trap.
   *
   * Deferring the close is leak-free: `openPortableLibrary()` calls `closePortableLibrary()` itself before
   * adopting a new fs, so the old zip's blob URLs are revoked exactly when a replacement actually arrives.
   * Abandoning the chooser now costs nothing.
   */
  function openAnother() {
    openError = "";
    choosing = true;
  }

  /** Abandon the chooser and return to the library that was open (no-op in a genuine empty state). */
  function cancelChoosing() {
    if (!canCancelChoosing) return;
    choosing = false;
    openError = "";
  }

  onMount(() => {
    void boot();
    window.addEventListener("hashchange", sync);
    // V1: Escape dismisses the chooser — the ratified dismissal contract (Archie-389f: Esc ladder, focus
    // return, no close-confirms). Registered at window level because the hall replaces the view rather
    // than layering over it, so there's no scrim element to own the key.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && canCancelChoosing) { e.preventDefault(); cancelChoosing(); }
    };
    window.addEventListener("keydown", onKey);
    // Live refresh triggers: tab regains focus (separate-tab flow) OR Studio broadcasts a structural
    // change (side-by-side / instant). Same-origin, so the channel reaches a backgrounded Viewer too.
    const onVisible = () => { if (document.visibilityState === "visible") void refreshLive(); };
    document.addEventListener("visibilitychange", onVisible);
    let bc: BroadcastChannel | undefined;
    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel(LIVE_CHANNEL);
      bc.onmessage = (e) => { if ((e.data as { type?: string } | null)?.type === "library-changed") void refreshLive(); };
    }
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisible);
      bc?.close();
    };
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
  // Hidden while the chooser is up: its "Open another library" button is the thing that opened it, and the
  // breadcrumb would offer navigation into a view the chooser is covering.
  const showBar = $derived(phase === "ready" && !choosing);
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
<div class="shell">
{#if originDrift}
  <span class="drift" title="This site is loading from a different web address than the one it was published for, so share links and link previews won’t work. The exhibits still read fine here; whoever published this site can fix the links by publishing again from its current address.">Site address mismatch</span>
{/if}

{#if showBar}
  <div class="topbar" class:on-paper={route.view !== "exhibit"}>
    <div class="zone left">
      {#if showCrumbs}
        <nav class="crumbs" aria-label="Breadcrumb">
          {#each crumbs as c, i (c.hash)}
            {#if i > 0}<span class="sep">›</span>{/if}
            {#if c.level === "exhibit" && carousel?.toOverview}
              <!-- R2: in a multi-object exhibit viewing an object, the Exhibit crumb returns to the
                   OVERVIEW (its natural start). Selection is un-routed, so reset via the lifted callback
                   rather than an href that points at the current hash (which would no-op). -->
              <button type="button" class="text-link crumb-link" onclick={() => carousel?.toOverview?.()}>{c.label}</button>
            {:else}
              <a class="text-link" href={c.hash}>{c.label}</a>
            {/if}
          {/each}
        </nav>
      {:else if route.view === "exhibit" && crumbs.length > 1}
        <!-- Single-exhibit library: no breadcrumb (nothing above to return to), so the only overview route
             lived inside the collapsible sidebar — collapse it and you were stranded on an object (#5). The
             bar now guarantees it: in an object → "Back to Exhibit"; at the overview → the exhibit's name. -->
        {#if carousel?.toOverview}
          <button type="button" class="text-link crumb-link" onclick={() => carousel?.toOverview?.()}>← Back to Exhibit</button>
        {:else}
          <span class="bar-title">{crumbs[1]?.label}</span>
        {/if}
      {/if}
    </div>
    <div class="zone center">
      {#if carousel}
        <nav class="carousel" aria-label="Media in this exhibit">
          <button class="cnav" disabled={!cPrev} aria-label={cPrev ? `Previous: ${cPrev.label}` : "This is the first item"} onclick={() => { if (cPrev) carousel?.navigate(cPrev.id); }} title={cPrev ? `Previous: ${cPrev.label}` : "This is the first item"}>‹</button>
          <span class="cpos" aria-label={`Item ${cIdx >= 0 ? cIdx + 1 : "–"} of ${carousel.siblings.length}`}>{cIdx >= 0 ? cIdx + 1 : "–"} / {carousel.siblings.length}</span>
          <button class="cnav" disabled={!cNext} aria-label={cNext ? `Next: ${cNext.label}` : "This is the last item"} onclick={() => { if (cNext) carousel?.navigate(cNext.id); }} title={cNext ? `Next: ${cNext.label}` : "This is the last item"}>›</button>
        </nav>
      {/if}
    </div>
    <div class="zone right">
      <button class="text-link open-another" onclick={openAnother}>Open another library</button>
    </div>
  </div>
{/if}

<!-- The slug rung's honest arrival line (V3). Mirrors ExhibitView's `arrivalMessage` chrome in wording and
     dismissibility, but lives here because this rung lands on the Gallery, which ExhibitView never renders. -->
{#if degradeNotice && phase === "ready" && !choosing}
  <div class="degrade" class:on-paper={route.view === "gallery"} role="status">
    <span class="seal" aria-hidden="true">⚐</span>
    <span>{degradeNotice}</span>
    <button type="button" class="text-link dismiss" onclick={() => (degradeNotice = "")}>Dismiss</button>
  </div>
{/if}

<div class="route">
{#if phase === "probing"}
  <div class="state"><span class="dot"></span><span>Opening the library…</span></div>
{:else if phase === "empty" || choosing}
  <!-- `choosing` renders the hall OVER a still-loaded library (V1): gallery, portable fs and route are all
       intact behind it, so oncancel simply stops showing it. -->
  <EmptyHall onfile={handleFile} cold={coldArrival} error={openError}
             oncancel={canCancelChoosing ? cancelChoosing : undefined} />
{:else if phase === "error"}
  <div class="state error"><span class="warn" aria-hidden="true">⚠</span><span>{errorMsg}</span></div>
{:else if route.view === "exhibit"}
  <!-- Lazy ExhibitView: its subtree pulls OpenSeadragon + Annotorious (~1 MB), so it's fetched only on the
       exhibit route, not the gallery landing. The {#key} sits inside :then so switching object/exhibit
       remounts the resolved component WITHOUT re-importing (the dynamic import resolves from cache). The
       deep-link [slug].astro keeps its own eager client:only ExhibitView. Canvas/OSD mount is browser-verify-owed. -->
  {#await import("./ExhibitView.svelte")}
    <div class="state"><span class="dot"></span><span>Opening the exhibit…</span></div>
  {:then { default: ExhibitView }}
    <!-- Thread the URL-level sub-region/time/section precision (route.ts parses xywh + t + sectionId) so it
         reaches the canvas / MediaPlayer — was dropped here, stranding deep-links at the object's default
         camera/playhead (Phase 3 / 4.2). The {#key} now folds them in so a same-slug hashchange that only
         changes the sub-target still remounts ExhibitView onto the new landing. -->
    {#key `${route.slug}/${route.noteId ?? ""}/${route.objectId ?? ""}/${route.sectionId ?? ""}/${route.xywh ?? ""}/${route.t ?? ""}`}
      <ExhibitView
        slug={route.slug}
        noteId={route.noteId}
        objectId={route.objectId}
        sectionId={route.sectionId}
        xywh={route.xywh}
        t={route.t}
        onnav={(n) => (carousel = n)}
        ondegrade={degradeToGallery}
      />
    {/key}
  {:catch}
    <div class="state error"><span class="warn" aria-hidden="true">⚠</span><span>Couldn’t load the viewer. Reload to try again.</span></div>
  {/await}
{:else if gallery}
  <Gallery {gallery} {imageIndex} />
{/if}
</div>
</div>

<style>
/* THE APP FRAME (ADR-0019 layout row, 2026-07-26). The shell is a flex COLUMN and every persistent
     bar is a flow sibling of the routed view, so the canvas's box is bounded by the chrome rather than
     running underneath it. clover-iiif does exactly this — under `Wrapper`'s `"> div"` column rule
     (`Viewer.styled.tsx:125-127`, `:138-141`), `<ViewerHeader>` and `<ViewerContent>` are
     flex siblings (`Viewer/Viewer.tsx:180-184`, `Viewer.styled.tsx:15-22`) — and it is why its header
     can be `background-color: transparent` without a legibility problem: nothing is behind it.
     `min-height: 0` on `.route` is what lets the routed view actually shrink to the space left over
     instead of overflowing it (the default `min-height: auto` on a flex item). */
  /* `height`, not `min-height`. A DEFINITE height here is what makes `height: 100%` resolve all the
     way down the chain (`.exhibit` → `.reader` → `.stage` → the canvas); with `min-height` the column
     is content-sized, the percentages resolve to `auto`, and a tall child grows the page instead of
     scrolling inside it. Measured while docking: the narrative's spine (1847px of section cards) took
     `.narrative` to 2239px in an 800px viewport, which pushed the docked chrome bar off the bottom of
     the screen and left the reader scrolling the whole app. */
  .shell { display: flex; flex-direction: column; height: 100dvh; }
  /* The routed view gets whatever the bars leave. It is a plain block, not a flex parent: a routed
     component emits SEVERAL root elements (ExhibitView emits its strips and its reader), so a
     `flex: 1` on every child would stretch a status strip to fill the page. Each view fills the row
     with `height: 100%` from its own stylesheet instead.

     `overflow: auto` is for the views that are genuinely TALLER than the row — the gallery wall and the
     object grid are paper columns that scroll. A view sized `height: 100%` fills the row exactly and
     never reaches it. */
  .route { flex: 1 1 auto; min-height: 0; overflow: auto; }

  /* Persistent top bar (dba2) — ONE thin three-zone bar; chrome recedes, the image is the star.
     DOCKED (2026-07-26): it used to be `position: fixed` over the canvas, which is what made the
     `--topbar-h` clearance token and the `--scrim-top` wash necessary. Both retired with it — a bar
     that owns its own row needs no reservation from anything below it and no scrim to be legible over
     an arbitrary image, because there is no image beneath it. */
  .topbar {
    flex: none;
    display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
    padding: var(--space-3) var(--space-4); gap: var(--space-3);
    background: var(--surface-canvas); border-bottom: 1px solid var(--border-canvas);
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-sm);
  }
  .topbar.on-paper { background: var(--surface-paper); border-bottom-color: var(--border-paper); }
  .topbar .zone { display: flex; align-items: center; }
  .topbar .left { justify-self: start; }
  .topbar .center { justify-self: center; }
  .topbar .right { justify-self: end; }

  /* Breadcrumb — understated; the way back up (CONTEXT §125). Connector-blue hover (the secondary
     signal for links/up-nav) keeps the rationed orange free for the one focal action. */
  .crumbs { display: flex; align-items: center; gap: var(--space-2); }
  .crumbs .sep { color: var(--ink-canvas-muted); }
  /* The Exhibit crumb in a multi-object object view is a button (resets selection → overview); it and the
     anchor crumbs both carry .text-link so they read identically to each other AND differ from the inert
     text beside them. They used to paint --ink-canvas-secondary — the same token as .bar-title below,
     which is explicitly non-interactive and occupies the SAME slot in this bar. */
  /* Single-exhibit orientation label where the breadcrumb would be — quiet, non-interactive (the name,
     not a link, since there's nothing above to return to). */
  .bar-title { color: var(--ink-canvas-secondary); font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-sm); }

  /* Object carousel — ‹ prev · i/n · next › thin glyph form (dba2: lean, no thumbs/labels, so it
     doesn't fight crumbs + open-another for width). The one floating surface reads as a soft warm-paper
     pill — rounded, lifted by a wide soft shadow, no border (separated by shadow + tone). */
  .carousel {
    display: flex; align-items: center; gap: var(--space-1);
    padding: 2px var(--space-2);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-primary);
    border-radius: var(--radius-sm);
  }
  .carousel .cnav {
    /* 1.5rem = 24px: the WCAG 2.2 SC 2.5.8 floor (Archie-cf4a). Was 1.25rem/20px, which beat
       the shared floor in atmosphere.css on specificity and shipped a 20px-wide arrow on phones. */
    display: flex; align-items: center; justify-content: center; min-width: 1.5rem;
    background: none; border: none; color: var(--ink-canvas-secondary); cursor: pointer; font: inherit;
    font-size: 1.05rem; line-height: 1;
  }
  .carousel .cnav:hover:not(:disabled) { color: var(--accent-2); }
  .carousel .cnav:disabled { opacity: 0.3; cursor: default; }
  .carousel .cpos {
    /* Secondary, not muted: the i/n count is the carousel's payload — it read fainter than the ‹ › arrows
       (also --ink-canvas-secondary) beside it, undercutting the reason the carousel was lifted into the bar. */
    color: var(--ink-canvas-secondary); font-family: var(--font-mono), monospace;
    font-variant-numeric: tabular-nums; padding: 0 var(--space-1); letter-spacing: 0.1em;
  }

  /* Origin-drift badge — a broken-config alert. Warm-paper chip lifted by a soft shadow, rounded;
     the alert reads through semantic-error ink + a hairline error border and the quiet uppercase mono
     tracking (a found warning label, not a loud arcade panel) (CONTEXT §134). */
  /* The slug rung's arrival line (V3) — deliberately the SAME object as ExhibitView's `.arrival` chrome
     (:608): top-center under the bar, warm raised paper, accent-2 left rule. One degrade, one appearance,
     whichever rung produced it. It sits on paper here (the Gallery) rather than over a canvas, so it takes
     the paper ink token instead of the canvas one. */
  .degrade {
    /* DOCKED (2026-07-26). It was `position: fixed` and had already been moved twice to dodge whatever
       it landed on — first the "Archie Library" title, then the gallery's search field. That chase is
       what a flow row ends: it takes its own strip under the bar and there is nothing left to collide
       with, on either surface family. */
    flex: none;
    display: flex; align-items: center; gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: none; border-left: 3px solid var(--accent-2);
    border-radius: var(--radius-md);
    font-family: var(--font-body), sans-serif; font-size: 0.8125rem;
  }
  .degrade .seal { color: var(--accent-2); }
  .degrade .dismiss { font-size: var(--text-ui-xs); text-transform: uppercase; letter-spacing: 0.08em; }

  .drift {
    /* DOCKED (2026-07-26) — the FIRST row of the shell, above the bar. Its whole history is a tour of
       corners it had to be evicted from for stealing someone's click (top-right = the bar's "Open
       another library"; bottom-right = the sidebar object nav). A persistent alert about a broken
       config has no business floating over a reading surface at all; it gets a strip. */
    flex: none; align-self: center;
    margin-top: var(--space-2); padding: 4px var(--space-2);
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-xs); font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.14em;
    color: var(--semantic-error);
    border: 1px solid var(--border-canvas-emphasis);
    border-radius: var(--radius-sm);
    background: var(--surface-canvas-raised);
  }
  /* Chrome + resting underline from .text-link. It kept the uppercase/0.14em eyebrow recipe — the same
     one the INERT "GALLERY · N EXHIBITS" label uses — painted in --ink-canvas-secondary, so the only
     action in this corner of the bar read as a caption. The tracking stays; the link ink is what tells
     you it does something. */
  .open-another {
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-xs);
    text-transform: uppercase; letter-spacing: 0.14em;
    padding: var(--space-2) 0; /* 24px+ hit box (Fitts) */
  }

  /* Over the gallery wall (light) the bar's canvas inks fail contrast (axe: 2.1) — swap the quiet
     chrome to paper inks; the bar floats over BOTH surface families, so ink follows the backdrop. */
  /* The LINKS keep link ink here (the paper-tuned amber), or this rule would out-specify .text-link and
     silently undo the affordance on the gallery wall. Only the inert .bar-title takes the quiet ink. */
  .topbar.on-paper .crumbs a,
  .topbar.on-paper .crumbs .crumb-link,
  .topbar.on-paper .open-another { color: var(--accent-2-paper); }
  .topbar.on-paper .crumbs a:hover,
  .topbar.on-paper .crumbs .crumb-link:hover,
  .topbar.on-paper .open-another:hover { color: var(--accent-2-paper-hover); }
  .topbar.on-paper .bar-title { color: var(--ink-paper-secondary); }
  .topbar.on-paper .crumbs .sep { color: var(--ink-paper-muted); }

  .state {
    display: flex; align-items: center; justify-content: center; gap: 10px; height: 100%;
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
