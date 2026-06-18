<script lang="ts">
  // Exhibit-layout orchestrator (v1: Single + Grid + Narrative). Loads the exhibit from the PUBLISHED
  // form (published.ts: publish → read back as a consumer) — so the Viewer renders what the publish
  // pipeline emits. The layout DECISION comes from `@render/core` `resolveLayout`: sections ⇒
  // narrative; >1 object ⇒ grid; else single. Sections come from sample-data `sectionsFor` (the
  // authored prose-spine; round-tripping them through manifest Ranges is a follow-up).
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import {
    resolveLayout, overlay, selectorOf,
    spatialCoverage, isWholeObject, wholeObjectFlagOf, emphasisOf, readingMarkerStyle,
    type Exhibit, type LayoutDescriptor, type RightsFields, type W3CAnnotation,
  } from "@render/core";
  import { loadPublishedExhibit, type PublishedExhibit } from "../published.js";
  import { canvasIdFor } from "../published-base.js";
  import ObjectGrid from "./ObjectGrid.svelte";
  import Reader from "./Reader.svelte";
  import NarrativeReader from "./NarrativeReader.svelte";
  import MediaPlayer from "./MediaPlayer.svelte";
  import type { MarkerStyle } from "@render/svelte";

  // `onnav` (dba2): publishes the object-nav snapshot up to ViewerShell, which renders the carousel in
  // the persistent top bar. `selectedObjectId` stays the source of truth here; ViewerShell only reflects
  // it. Emits null whenever the carousel shouldn't show (grid overview, AV, narrative, single object).
  let { slug, noteId, onnav }: {
    slug: string;
    noteId?: string;
    onnav?: (
      nav: { siblings: { id: string; label: string }[]; currentId: string; navigate: (id: string) => void } | null,
    ) => void;
  } = $props();

  let status = $state<"loading" | "ready" | "error">("loading");
  let errorMsg = $state("");
  let data = $state<PublishedExhibit | null>(null);
  let layout = $state<LayoutDescriptor | null>(null);
  let selectedObjectId = $state<string | null>(null);
  let arrivedNote = $state<string | null>(null); // deep-link target id (land-in-context)
  let chromeVisible = $state(false); // cold-arrival chrome (§124), fades after a few seconds
  let activeReading = $state<string | null>(null); // ADR-0007 / Q16: base-only by default; null = base

  onMount(async () => {
    try {
      const d = await loadPublishedExhibit(slug);
      const secs = d.sections; // narrative spine round-tripped from the published manifest (was sample-data sectionsFor)
      const exhibit: Exhibit = {
        id: `ex-${slug}`, slug, title: d.title, objects: d.objects,
        ...(secs.length ? { sections: secs } : {}),
        ...(d.summary !== undefined ? { summary: d.summary } : {}),
      };
      const l = resolveLayout(exhibit); // sections ⇒ narrative; >1 object ⇒ grid; one ⇒ single
      data = d;
      layout = l;
      selectedObjectId = l.type === "grid" ? null : (l.objects[0]?.id ?? null);
      status = "ready";

      // deep-link arrival (§82/§124): the shell parses #/<slug>/a/<id> and passes the note id here
      // (the hash is slug-qualified now, so ExhibitView no longer reads location.hash itself).
      if (noteId) {
        let foundReading: string | null = null;
        const owner = l.objects.find((o) => {
          if ((d.annotationsByObject[o.id] ?? []).some((a) => a.id === noteId)) return true;
          for (const [rid, notes] of Object.entries(d.readingAnnotationsByObject[o.id] ?? {})) {
            if (notes.some((a) => a.id === noteId)) { foundReading = rid; return true; }
          }
          return false;
        });
        if (owner) {
          if (foundReading) activeReading = foundReading; // a deep-link into a reading opens that reading
          selectedObjectId = owner.id; // land on the object (not the grid overview)
          arrivedNote = noteId; // → Reader/NarrativeReader initialSelected → fitBounds
          chromeVisible = true;
          setTimeout(() => (chromeVisible = false), 6000);
        }
      }
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : "Couldn’t load this exhibit. Reload to try again.";
      status = "error";
    }
  });

  const isGrid = $derived(layout?.type === "grid");
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
  const ACCENT = "#3a6b4c";
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
  // The single mark that frames the WHOLE object (first qualifying), or null. Image objects only;
  // skips if dims are unknown (can't measure spatial coverage) unless an authored override flags it.
  const frameFor = (objectId: string, w?: number, h?: number): { markId: string; colour: string } | null => {
    const colourBy = readingColourById(objectId);
    for (const a of annotationsOf(objectId)) {
      if (!a.id) continue;
      const sel = selectorOf(a);
      const coverage = sel && w && h ? spatialCoverage(sel, w, h) : 0;
      if (isWholeObject(coverage, wholeObjectFlagOf(a))) {
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

  // Lift the object-nav snapshot to ViewerShell's top bar (dba2). Reads `selectedObjectId` (via
  // activeObject) so it re-fires on every navigation, keeping the bar's i/n counter live. Replicates the
  // OLD in-Reader carousel visibility EXACTLY: only for the single-object Reader path (not grid overview,
  // AV, or narrative) and only with >1 sibling. Emits null otherwise; clears on teardown so leaving the
  // exhibit doesn't leave a stale carousel in the bar.
  $effect(() => {
    const objs = layout?.objects ?? [];
    const showCarousel =
      !!activeObject && !isGrid && !isAV && layout?.type !== "narrative" && objs.length > 1;
    onnav?.(
      showCarousel
        ? {
            siblings: objs.map((o) => ({ id: o.id, label: o.label })),
            currentId: activeObject!.id,
            navigate: (id: string) => (selectedObjectId = id),
          }
        : null,
    );
    return () => onnav?.(null);
  });
</script>

{#if status === "loading"}
  <div class="state"><span class="dot"></span><span>Loading the exhibit…</span></div>
{:else if status === "error"}
  <div class="state error"><span class="warn" aria-hidden="true">⚠</span><span>{errorMsg}</span></div>
{:else if data && layout}
  {#if isAV && activeData}
    <MediaPlayer object={activeData} annotations={annotationsOf(activeData.id)} rights={objectRightsOf(activeData.id)} />
  {:else if layout.type === "narrative" && layout.sections && layout.objects[0]}
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
    />
  {:else if activeObject}
    <Reader
      object={{ source: activeObject.source, canvasId: canvasIdOf(activeObject.id), label: activeObject.label, summary: activeData?.summary, ...(activeObject.tileSource ? { tileSource: activeObject.tileSource } : {}) }}
      annotations={annotationsOf(activeObject.id)}
      readings={data.readings}
      activeReading={activeReading}
      onreading={(id) => (activeReading = id)}
      styleOf={readingStyleOf(activeObject.id)}
      frame={frameFor(activeObject.id, activeData?.width, activeData?.height)}
      onback={isGrid ? () => (selectedObjectId = null) : undefined}
      rights={objectRightsOf(activeObject.id)}
      initialSelected={arrivedNote}
      onnotehover={(id) => (hoverNote = id)}
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

  <!-- Cold-arrival chrome (§124): orient a link-follower, then fade. Transparent, no gate. -->
  {#if chromeVisible}
    <button class="arrival" transition:fade={{ duration: 400 }} onclick={() => (chromeVisible = false)}>
      <span class="seal" aria-hidden="true">↪</span>
      <span class="msg">You followed a link to this note</span>
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

  /* Cold-arrival chrome — a soft warm-paper toast; understated, fades, not a gate. */
  .arrival {
    position: fixed; z-index: 30; top: var(--space-5); left: 50%; transform: translateX(-50%);
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
  .arrival .seal { color: var(--accent-2); font-size: 1rem; }
  .arrival .dismiss {
    font-family: var(--font-ui), monospace; font-size: 0.65rem; font-weight: 500;
    letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-canvas-muted);
  }
  .arrival:hover .dismiss { color: var(--accent-2); }
</style>
