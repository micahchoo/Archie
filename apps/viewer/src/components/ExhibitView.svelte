<script lang="ts">
  // Exhibit-layout orchestrator (v1: Single + Grid + Narrative). Loads the exhibit from the PUBLISHED
  // form (published.ts: publish → read back as a consumer) — so the Viewer renders what the publish
  // pipeline emits. The layout DECISION comes from `@render/core` `resolveLayout`: sections ⇒
  // narrative; >1 object ⇒ grid; else single. Sections come from sample-data `sectionsFor` (the
  // authored prose-spine; round-tripping them through manifest Ranges is a follow-up).
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import {
    resolveLayout, overlay, selectorOf, asExhibitId,
    isWholeObjectFor, wholeObjectFlagOf, emphasisOf, readingMarkerStyle,
    type Exhibit, type LayoutDescriptor, type RightsFields, type W3CAnnotation,
  } from "@render/core";
  import { loadPublishedExhibit, type PublishedExhibit } from "../published.js";
  import { canvasIdFor } from "../published-base.js";
  import { resolveNoteArrival } from "../note-arrival.js";
  import ObjectGrid from "./ObjectGrid.svelte";
  import Reader from "./Reader.svelte";
  import NarrativeReader from "./NarrativeReader.svelte";
  import MediaPlayer from "./MediaPlayer.svelte";
  import SearchOverlay from "./SearchOverlay.svelte";
  import type { MarkerStyle } from "@render/svelte";

  // `onnav` (dba2): publishes the object-nav snapshot up to ViewerShell, which renders the carousel in
  // the persistent top bar. `selectedObjectId` stays the source of truth here; ViewerShell only reflects
  // it. Emits null whenever the carousel shouldn't show (grid overview, AV, narrative, single object).
  let { slug, noteId, objectId, onnav }: {
    slug: string;
    noteId?: string;
    /** Object-cite arrival (#/<slug>/o/<id>, ADR-0018) — land on the whole Object, not the grid. */
    objectId?: string;
    onnav?: (
      nav: { siblings: { id: string; label: string }[]; currentId: string; navigate: (id: string) => void; toOverview?: () => void } | null,
    ) => void;
  } = $props();

  let status = $state<"loading" | "ready" | "error">("loading");
  let errorMsg = $state("");
  let data = $state<PublishedExhibit | null>(null);
  let layout = $state<LayoutDescriptor | null>(null);
  let selectedObjectId = $state<string | null>(null);
  let arrivedNote = $state<string | null>(null); // deep-link target id (land-in-context)
  let chromeVisible = $state(false); // cold-arrival chrome (§124), fades after a few seconds
  let linkMissing = $state(false); // the deep-linked note resolved to no owner (tombstoned cite) — be honest (#8)
  let activeReading = $state<string | null>(null); // ADR-0007 / Q16: base-only by default; null = base
  let notesHidden = $state(false); // ReadingLegend "Hide all" — declutter the canvas to the bare basemap/image
  // Grid-index escape (ADR-0016 keystone): when a narrative LEADS, the object grid stays reachable BEHIND
  // it as an index (§137 precision-in/escape-out; §223 anti-trap) — not a dead-end takeover. `narrativeIndex`
  // opens that grid over the read; `indexObjectId` is an object opened FROM the index (its own Reader).
  let narrativeIndex = $state(false);
  let indexObjectId = $state<string | null>(null);

  // Finder overlay (Q-3/Q-4): the ONE mode-independent discovery surface, mounted here so it works in
  // grid AND narrative exhibits. `finderTag` pre-scopes it as a facet when a tag chip opened it; null =
  // opened cold from the chrome affordance / accelerator. The overlay is a PURE finder — selecting a
  // result routes through arriveAtNote (the A0 seam), so it never mutates canvas/reading state itself.
  let finderOpen = $state(false);
  let finderTag = $state<string | null>(null);
  function openFinder(tag: string | null = null) { finderTag = tag; finderOpen = true; }

  onMount(async () => {
    try {
      const d = await loadPublishedExhibit(slug);
      const secs = d.sections; // narrative spine round-tripped from the published manifest (was sample-data sectionsFor)
      const exhibit: Exhibit = {
        id: asExhibitId(`ex-${slug}`), slug, title: d.title, objects: d.objects,
        ...(secs.length ? { sections: secs } : {}),
        ...(d.summary !== undefined ? { summary: d.summary } : {}),
      };
      const l = resolveLayout(exhibit); // sections ⇒ narrative; >1 object ⇒ grid; one ⇒ single
      data = d;
      layout = l;
      selectedObjectId = l.type === "grid" ? null : (l.objects[0]?.id ?? null);
      // Object-cite arrival (#/<slug>/o/<id>, ADR-0018): land on the whole Object, not the overview/spine.
      // A narrative layout ignores selectedObjectId (it renders the spine), so open the object FROM the
      // index instead (indexObjectId → its own Reader); grid/single consume selectedObjectId.
      if (objectId && l.objects.some((o) => o.id === objectId)) {
        if (l.type === "narrative") indexObjectId = objectId;
        else selectedObjectId = objectId;
      }
      status = "ready";

      // deep-link arrival (§82/§124): the shell parses #/<slug>/a/<id> and passes the note id here
      // (the hash is slug-qualified now, so ExhibitView no longer reads location.hash itself). Same
      // path the search overlay (Q-4) and keyboard index activation (Q-5) take — see arriveAtNote.
      if (noteId) arriveAtNote(noteId);
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : "Couldn’t load this exhibit. Reload to try again.";
      status = "error";
    }
  });

  // The selection seam (A0): resolve a note id to its owner+reading and apply the land-in-context state
  // (active reading · selected object · arrived note · arrival chrome). Called from onMount for a deep
  // link AND exposed for imperative use — the search overlay (Q-4) and keyboard index (Q-5) jump to a
  // note by calling this, so every "go to this note" path lands identically. No-ops before load (no data).
  function arriveAtNote(targetNote: string) {
    if (!data || !layout) return;
    const arrival = resolveNoteArrival(targetNote, layout.objects, data);
    if (arrival) {
      if (arrival.reading) activeReading = arrival.reading; // a jump into a reading opens that reading
      selectedObjectId = arrival.objectId; // land on the object (not the grid overview)
      arrivedNote = targetNote; // → Reader/NarrativeReader initialSelected → fitBounds
      linkMissing = false;
      chromeVisible = true;
      setTimeout(() => (chromeVisible = false), 6000);
    } else {
      // The cited note is gone — notes are append-only/tombstoned (ADR-0003), so old citation links
      // outlive their targets. Don't strand a link-follower silently (#8): still raise the arrival
      // chrome, honestly, and land them on the exhibit instead of somewhere generic with no word.
      linkMissing = true;
      chromeVisible = true;
      setTimeout(() => (chromeVisible = false), 8000);
    }
  }

  // Finder accelerators (Q-4): Cmd/Ctrl-K and `/` open the finder from anywhere in the exhibit. `/` is
  // suppressed while typing (input/textarea/select or any contenteditable) so it can't hijack search
  // boxes or note prose. No URL state — the finder is transient (open → find → jump → close).
  function onWindowKey(e: KeyboardEvent) {
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      openFinder();
      return;
    }
    if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !finderOpen) {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      e.preventDefault();
      openFinder();
    }
  }

  const isGrid = $derived(layout?.type === "grid");
  // Sibling objects for the visible sidebar stepper (R4) — non-narrative multi-object exhibits only (the
  // narrative spine is section-led, not object-stepped). null ⇒ no sidebar nav for this reader.
  const gridSiblings = $derived(
    layout && layout.type !== "narrative" && layout.objects.length > 1
      ? layout.objects.map((o) => ({ id: o.id, label: o.label }))
      : null,
  );
  // The object opened FROM the narrative index (its own Reader), resolved against both the layout
  // descriptor (for the OSD Reader props) and the published data (for mediaType/duration → AV routing).
  const indexObject = $derived(layout?.objects.find((o) => o.id === indexObjectId));
  const indexData = $derived(data?.objects.find((o) => o.id === indexObjectId));
  const indexIsAV = $derived(indexData?.mediaType === "sound" || indexData?.mediaType === "video");
  const activeObject = $derived(layout?.objects.find((o) => o.id === selectedObjectId));
  // The selected object from the PUBLISHED data (carries mediaType/duration); AV objects render in the
  // temporal MediaPlayer instead of the spatial OSD Reader. Works for single AV and AV-in-a-grid.
  const activeData = $derived(data?.objects.find((o) => o.id === selectedObjectId));
  const isAV = $derived(activeData?.mediaType === "sound" || activeData?.mediaType === "video");
  const noNotes: W3CAnnotation[] = [];
  // Base notes are always visible (Q16); an active Reading overlays its notes on top of the base.
  const annotationsOf = (objectId: string): W3CAnnotation[] => {
    const base = data?.annotationsByObject[objectId] ?? noNotes;
    if (activeReading === null) return base;
    return overlay(base, data?.readingAnnotationsByObject[objectId]?.[activeReading]);
  };
  // Per-reading note count on a given object for the ReadingLegend (id=null → base / General notes). The
  // count is per-OBJECT — the current image — matching the legend's per-canvas overlay action (Q: current
  // image, not exhibit-wide). Reading-independent (it counts attachment, not what's active), so it's stable
  // as you toggle readings and only re-mints when the object changes.
  const readingCountOf = (objectId: string) => {
    const base = data?.annotationsByObject[objectId] ?? noNotes;
    const byR = data?.readingAnnotationsByObject[objectId] ?? {};
    return (id: string | null): number => (id === null ? base.length : (byR[id]?.length ?? 0));
  };
  // Canvas IRI from the published manifest (SNAG fix — matches annotation targets for any publish
  // origin); falls back to the demo BASE reconstruction only if the map lacks it.
  const canvasIdOf = (objectId: string): string => data?.canvasIdByObject[objectId] ?? canvasIdFor(slug, objectId);
  // Colour each marker by its Reading (ADR-0007) so toggling readings is VISIBLE on the canvas, not
  // only in the note pane: build annotation-id → reading colour for an object, then a per-id style fn.
  const readingColourById = (objectId: string): Record<string, string> => {
    const m: Record<string, string> = {};
    const byR = data?.readingAnnotationsByObject[objectId] ?? {};
    for (const r of data?.readings ?? []) {
      if (!r.colour) continue;
      for (const a of byR[r.id] ?? []) if (a.id) m[a.id] = r.colour;
    }
    return m;
  };
  // 1489 emphasis — id → visible annotation, built from the SAME source the canvas renders
  // (annotationsOf = base + active reading), so base notes pick up emphasis too (never hue, ADR-0007).
  const annotationById = (objectId: string): Record<string, W3CAnnotation> => {
    const m: Record<string, W3CAnnotation> = {};
    for (const a of annotationsOf(objectId)) if (a.id) m[a.id] = a;
    return m;
  };
  // Forest-green neutral default for reading-less (base) marks (system.md §"Base notes") — same
  // stroke-over-stroke opacities as the reading style, so emphasis modulates a VISIBLE base mark.
  const ACCENT = "#3A8C5D"; // emerald base mark (--accent) — clears ~4.7:1 on the near-black light-table canvas
  // Per-note hover solo (the Reader list's hover → the mark lights up). Read INSIDE readingStyleOf
  // so the template's `styleOf={readingStyleOf(...)}` expression depends on it and re-mints the
  // closure identity on change — Canvas only re-applies styles when the prop identity changes
  // (the Studio harness finding).
  let hoverNote = $state<string | null>(null);
  const readingStyleOf = (objectId: string): ((id: string) => MarkerStyle | undefined) => {
    const colourBy = readingColourById(objectId);
    const annBy = annotationById(objectId);
    const hovered = hoverNote; // captured per mint — the read that re-mints identity
    // ONE style source shared with Studio (render-core readingMarkerStyle). The Viewer stays
    // exclusive-radio in v1 (archie-ux Q-2), so no comparing/solo state is passed here.
    return (id) => readingMarkerStyle(colourBy[id] ?? ACCENT, annBy[id] ? emphasisOf(annBy[id]!) : "normal", { highlighted: hovered === id });
  };

  // 7e1f coverage border — single-object image Reader only. The first selector off a target comes from
  // the canonical `selectorOf` (@render/core): same array-vs-single + Fragment/Svg filtering, returns
  // W3CSelector | null (was an inline replica back when render-mount's selectorOf wasn't exported).
  // 0045 contrast rule: the frame draws over the near-black light-table canvas (#181714), NOT the
  // grey overlay (#252420) the rule actually targets — and forest-green-on-canvas is the established
  // normal (the active-object ring is green here). A raw WCAG ratio would wrongly fail green on the
  // dark canvas (~2.9:1) and flip every frame to amber, so per the contract we default to the reading
  // colour (or the green base) and leave the amber rescue as a TODO.
  // TODO(0045): surface-aware contrast rescue to golden-amber (--accent-2 #d6a23e) — needs the actual
  // surface luminance under the frame (light-table vs grey overlay vs photo region), not a fixed pair.
  const frameColour = (colour: string): string => colour;
  // The single mark that frames the WHOLE object (first qualifying), or null. A bare-IRI Object-level
  // Note (no selector — ADR-0018) ALWAYS frames (it has no geometry to measure, and IS the whole
  // object); a region note frames via the ≥75% coverage heuristic or the authored region-override.
  const frameFor = (objectId: string, w?: number, h?: number): { markId: string; colour: string } | null => {
    const colourBy = readingColourById(objectId);
    for (const a of annotationsOf(objectId)) {
      if (!a.id) continue;
      if (isWholeObjectFor(selectorOf(a), w ?? 0, h ?? 0, wholeObjectFlagOf(a))) {
        return { markId: a.id, colour: frameColour(colourBy[a.id] ?? ACCENT) };
      }
    }
    return null;
  };

  // Rights/credit (Q5): the Viewer renders ALREADY-RESOLVED published values and never re-runs the
  // opt-in cascade (that collapsed at publish) — so the exhibit chrome shows the exhibit's own credit and
  // the Reader shows the OBJECT's own credit, with NO display-time inheritance (no silent drift; Q2). Where
  // an object should carry its own provenance (each Voynich folio = Beinecke), that lives on the object.
  const pick = (r: RightsFields | undefined): RightsFields => ({ ...(r?.rights ? { rights: r.rights } : {}), ...(r?.requiredStatement ? { requiredStatement: r.requiredStatement } : {}) });
  const exhibitRights = $derived(pick(data ?? undefined));
  const objectRightsOf = (objectId: string): RightsFields => pick(data?.objects.find((x) => x.id === objectId));

  // ONE nav shape (S-3): the object currently reading and the setter that navigates between siblings,
  // derived per layout so the $effect consumes a single snapshot instead of branching on `inNarrative`
  // three times in parallel ternaries. In a leading narrative the reader is the index-opened object
  // (image OR AV — both escape back, so both carry the persistent carousel); otherwise it's the selected
  // object — `activeObject` is undefined only at the grid OVERVIEW (selection null), so the carousel shows
  // for a grid OBJECT (siblings to step) and is suppressed on the overview and for single-object exhibits.
  const reader = $derived(
    layout?.type === "narrative"
      ? { obj: indexObject, set: (id: string) => (indexObjectId = id) }
      : { obj: activeObject, set: (id: string) => (selectedObjectId = id) },
  );

  // The Exhibit breadcrumb's "natural start" (CONTEXT §142) for a multi-object exhibit = the overview;
  // lifted to the top bar so the un-routed object selection resets on a crumb click (ViewerShell wiring).
  // Narrative's overview is the leading read (close any index-opened object); grid's is the object grid.
  function toOverview() {
    if (layout?.type === "narrative") { indexObjectId = null; narrativeIndex = false; }
    else selectedObjectId = null;
  }

  // Lift the object-nav snapshot to ViewerShell's top bar (dba2). Reads the derived `reader` so it
  // re-fires on every navigation, keeping the bar's i/n counter live. An object opened from the
  // narrative INDEX (image or AV) carries the same persistent nav — the index escape and the carousel
  // are consistent. Emits null when there's no reader or only one sibling; clears on teardown so
  // leaving the exhibit doesn't leave a stale carousel in the bar.
  $effect(() => {
    const objs = layout?.objects ?? [];
    const navObject = reader.obj;
    const showCarousel = !!navObject && objs.length > 1;
    onnav?.(
      showCarousel
        ? {
            siblings: objs.map((o) => ({ id: o.id, label: o.label })),
            currentId: navObject!.id,
            navigate: reader.set,
            toOverview,
          }
        : null,
    );
    return () => onnav?.(null);
  });
</script>

<svelte:window onkeydown={onWindowKey} />

{#if status === "loading"}
  <div class="state"><span class="dot"></span><span>Loading the exhibit…</span></div>
{:else if status === "error"}
  <div class="state error"><span class="warn" aria-hidden="true">⚠</span><span>{errorMsg}</span></div>
{:else if data && layout}
  {#if isAV && activeData}
    <!-- Key on the object so the player REMOUNTS when stepping between AV siblings (R4) — MediaPlayer's
         media/error state is plain $state with no per-object reset, so without this a failed recording's
         error (or a stale playhead) would persist onto a healthy sibling. Mirrors the Reader's canvas key. -->
    {#key activeData.id}
      <MediaPlayer
        object={activeData}
        annotations={annotationsOf(activeData.id)}
        rights={objectRightsOf(activeData.id)}
        siblings={gridSiblings ?? undefined}
        currentId={activeData.id}
        onstep={(id) => (selectedObjectId = id)}
        onoverview={() => (selectedObjectId = null)}
      />
    {/key}
  {:else if layout.type === "narrative" && layout.sections && layout.objects[0]}
    <!-- The narrative LEADS (ADR-0016 keystone); the object grid stays reachable BEHIND it as an INDEX
         (§137 precision-in/escape-out, §223 anti-trap) — never the old whole-exhibit takeover. Three
         states: read the spine · the index grid · an object opened from the index (its own Reader). -->
    {#if indexObject}
      {#if indexIsAV && indexData}
        <!-- Keyed like the grid-AV player: stepping the carousel between AV index objects must remount. -->
        {#key indexData.id}
          <MediaPlayer object={indexData} annotations={annotationsOf(indexData.id)} rights={objectRightsOf(indexData.id)} onback={() => (indexObjectId = null)} />
        {/key}
      {:else}
        <Reader
          object={{ source: indexObject.source, canvasId: canvasIdOf(indexObject.id), label: indexObject.label, summary: indexData?.summary, ...(indexObject.tileSource ? { tileSource: indexObject.tileSource } : {}) }}
          annotations={annotationsOf(indexObject.id)}
          readings={data.readings}
          activeReading={activeReading}
          onreading={(id) => (activeReading = id)}
          readingCount={readingCountOf(indexObject.id)}
          styleOf={readingStyleOf(indexObject.id)}
          frame={frameFor(indexObject.id, indexData?.width, indexData?.height)}
          onback={() => (indexObjectId = null)}
          rights={objectRightsOf(indexObject.id)}
          onnotehover={(id) => (hoverNote = id)}
          notesHidden={notesHidden}
          onhiddenchange={(v) => (notesHidden = v)}
          onopenfinder={(tag) => openFinder(tag)}
        />
      {/if}
    {:else if narrativeIndex}
      <ObjectGrid
        title={data.title}
        summary={data.summary}
        objects={layout.objects}
        countOf={(id) => annotationsOf(id).length}
        onselect={(id) => (indexObjectId = id)}
        rights={exhibitRights}
      />
      <!-- Escape-out (§137): the index is a side-trip; one quiet step returns to the leading read. -->
      <button class="to-read" onclick={() => (narrativeIndex = false)}>
        <span class="back-mark" aria-hidden="true">‹</span>Back to the reading
      </button>
    {:else}
      <NarrativeReader
        objects={data.objects}
        canvasIdOf={canvasIdOf}
        annotationsByObject={data.annotationsByObject}
        readingAnnotationsByObject={data.readingAnnotationsByObject}
        sections={layout.sections}
        title={data.title}
        rights={exhibitRights}
        readings={data.readings}
        activeReading={activeReading}
        onreading={(id) => (activeReading = id)}
        styleFor={readingStyleOf}
        initialSelected={arrivedNote}
        notesHidden={notesHidden}
        onhiddenchange={(v) => (notesHidden = v)}
        onindex={() => (narrativeIndex = true)}
        onopenfinder={(tag) => openFinder(tag)}
      />
    {/if}
  {:else if activeObject}
    <Reader
      object={{ source: activeObject.source, canvasId: canvasIdOf(activeObject.id), label: activeObject.label, summary: activeData?.summary, ...(activeObject.tileSource ? { tileSource: activeObject.tileSource } : {}) }}
      annotations={annotationsOf(activeObject.id)}
      readings={data.readings}
      activeReading={activeReading}
      onreading={(id) => (activeReading = id)}
      readingCount={readingCountOf(activeObject.id)}
      styleOf={readingStyleOf(activeObject.id)}
      frame={frameFor(activeObject.id, activeData?.width, activeData?.height)}
      onback={isGrid ? () => (selectedObjectId = null) : undefined}
      rights={objectRightsOf(activeObject.id)}
      initialSelected={arrivedNote}
      onnotehover={(id) => (hoverNote = id)}
      notesHidden={notesHidden}
      onhiddenchange={(v) => (notesHidden = v)}
      onopenfinder={(tag) => openFinder(tag)}
      siblings={gridSiblings ?? undefined}
      currentId={activeObject.id}
      onstep={(id) => (selectedObjectId = id)}
      onoverview={() => (selectedObjectId = null)}
    />
  {:else}
    <ObjectGrid
      title={data.title}
      summary={data.summary}
      objects={layout.objects}
      countOf={(id) => annotationsOf(id).length}
      onselect={(id) => (selectedObjectId = id)}
      rights={exhibitRights}
    />
  {/if}

  <!-- Finder affordance (Q-4): a quiet visible search trigger in the exhibit chrome — the discoverable
       home for the Cmd/Ctrl-K + `/` accelerators, present in BOTH grid and narrative layouts. -->
  <button class="finder-trigger" onclick={() => openFinder()} aria-label="Find a note (⌘K)">
    <span class="glass" aria-hidden="true">⌕</span><span class="lbl">Find a note</span>
    <span class="kbd" aria-hidden="true">⌘K</span>
  </button>

  <!-- The ONE mode-independent finder (Q-3/Q-4): a PURE finder over the flattened note tree. On select
       it routes through arriveAtNote (A0 seam) — flips reading + object + fits camera — and closes. -->
  {#if finderOpen}
    <SearchOverlay
      data={{ annotationsByObject: data.annotationsByObject, readingAnnotationsByObject: data.readingAnnotationsByObject }}
      initialTag={finderTag}
      onselect={(id) => arriveAtNote(id)}
      onclose={() => (finderOpen = false)}
    />
  {/if}

  <!-- Cold-arrival chrome (§124): orient a link-follower, then fade. Transparent, no gate. -->
  {#if chromeVisible}
    <button class="arrival" transition:fade={{ duration: 400 }} onclick={() => (chromeVisible = false)}>
      <span class="seal" aria-hidden="true">{linkMissing ? "⚐" : "↪"}</span>
      <span class="msg">{linkMissing ? "That note isn’t here anymore — showing the exhibit instead" : "You followed a link to this note"}</span>
      <span class="dismiss">Dismiss</span>
    </button>
  {/if}
{/if}

<style>
  /* Load / error states — quiet found-meta chrome over the warm atmospheric ground (Soft Static).
     Spline Sans Mono eyebrow: tracked, uppercase, reduced opacity — it feels found, not announced. */
  .state {
    display: flex; align-items: center; justify-content: center; gap: var(--space-3); height: 100vh;
    background: transparent; color: var(--ink-canvas-secondary);
    font-family: var(--font-ui), monospace; font-size: 0.8125rem; letter-spacing: 0.16em;
    text-transform: uppercase; opacity: 0.62;
  }
  .state.error { color: var(--semantic-error); opacity: 0.85; }
  .warn { font-size: 1.1rem; }
  /* Soft signal dot — the one rationed orange mark, gently breathing (no hard pixel steps). */
  .dot { width: 8px; height: 8px; border-radius: var(--radius-sm); background: var(--accent); animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }

  /* Escape-out from the narrative index (§137 precision-in/escape-out, §223 anti-trap) — a quiet step
     back to the leading read, floating over the dark index grid. Mirrors the breadcrumb up-nav idiom:
     transparent chrome, canvas inks, connector-blue (--accent-2) hover (the secondary up/nav signal,
     and the green-on-dark contrast rescue) — the rationed orange stays free for the one focal action. */
  .to-read {
    /* Cleared below the persistent top-bar band via the shared --topbar-h token (ViewerShell .topbar owns
       the top-left for the breadcrumb) — S-4: at top:space-5 it collided with that band. One token now
       sets the clearance for every below-band escape (legend, .to-index), so they can't drift apart. */
    position: fixed; z-index: 30; top: var(--topbar-h); left: var(--space-5);
    display: inline-flex; align-items: center; gap: var(--space-1);
    background: none; border: none; cursor: pointer; padding: var(--space-2) var(--space-1);
    color: var(--ink-canvas-secondary);
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-sm); letter-spacing: 0.04em;
    transition: color 160ms ease;
  }
  .to-read:hover { color: var(--accent-2); }
  .to-read .back-mark { font-size: 1.05rem; line-height: 1; }

  /* Cold-arrival chrome — a soft warm-paper toast; understated, fades, not a gate. Sits just BELOW the
     top-bar band (--topbar-h): at top:space-5 it landed on the centered carousel when a deep-link opened
     a multi-object exhibit (both centered) — now it clears it and stacks under it. */
  .arrival {
    position: fixed; z-index: 30; top: calc(var(--topbar-h) + var(--space-2)); left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: var(--space-3); cursor: pointer;
    padding: var(--space-3) var(--space-4);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-primary);
    border: none;
    border-left: 3px solid var(--accent-2);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
    font-family: var(--font-body), sans-serif; font-size: 0.8125rem;
    letter-spacing: 0; text-transform: none;
  }
  /* Finder trigger — a quiet warm-paper pill pinned bottom-right of the canvas, the discoverable home
     for the ⌘K / `/` accelerators. Recedes (canvas inks, connector-blue hover) so the read stays the
     star; rationed orange is left free for the one focal action. Below-band tokens keep it off the bar. */
  .finder-trigger {
    position: fixed; z-index: 30; right: var(--space-5); bottom: var(--space-5);
    display: inline-flex; align-items: center; gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-secondary);
    border: none; border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low); cursor: pointer;
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-sm); letter-spacing: 0.04em;
    transition: color 160ms ease, box-shadow 160ms ease;
  }
  .finder-trigger:hover { color: var(--accent-2); box-shadow: var(--shadow-lift-mid); }
  .finder-trigger .glass { font-size: 1rem; line-height: 1; }
  .finder-trigger .kbd { font-family: var(--font-mono), monospace; font-size: 0.65rem; letter-spacing: 0.1em; color: var(--ink-canvas-muted); }

  .arrival .seal { color: var(--accent-2); font-size: 1rem; }
  .arrival .dismiss {
    font-family: var(--font-ui), monospace; font-size: 0.65rem; font-weight: 500;
    letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-canvas-muted);
  }
  .arrival:hover .dismiss { color: var(--accent-2); }
</style>
