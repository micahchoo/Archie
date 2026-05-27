<script lang="ts">
  // Exhibit-layout orchestrator (v1: Single + Grid + Narrative). Loads the exhibit from the PUBLISHED
  // form (published.ts: publish → read back as a consumer) — so the Viewer renders what the publish
  // pipeline emits. The layout DECISION comes from `@render/core` `resolveLayout`: sections ⇒
  // narrative; >1 object ⇒ grid; else single. Sections come from sample-data `sectionsFor` (the
  // authored prose-spine; round-tripping them through manifest Ranges is a follow-up).
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { resolveLayout, type Exhibit, type LayoutDescriptor, type RightsFields, type W3CAnnotation } from "@render/core";
  import { loadPublishedExhibit, type PublishedExhibit } from "../published.js";
  import { canvasIdFor } from "../published-base.js";
  import ObjectGrid from "./ObjectGrid.svelte";
  import Reader from "./Reader.svelte";
  import NarrativeReader from "./NarrativeReader.svelte";
  import MediaPlayer from "./MediaPlayer.svelte";
  import type { MarkerStyle } from "@render/svelte";

  let { slug, noteId }: { slug: string; noteId?: string } = $props();

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
      errorMsg = e instanceof Error ? e.message : "Could not load the exhibit.";
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
    const r = data?.readingAnnotationsByObject[objectId]?.[activeReading] ?? noNotes;
    return r.length ? [...base, ...r] : base;
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
  const readingStyleOf = (objectId: string): ((id: string) => MarkerStyle | undefined) => {
    const m = readingColourById(objectId);
    return (id) => (m[id] ? { fill: m[id], fillOpacity: 0.18, stroke: m[id], strokeOpacity: 0.95, strokeWidth: 2 } : undefined);
  };

  // Rights/credit (Q5): the Viewer renders ALREADY-RESOLVED published values and never re-runs the
  // opt-in cascade (that collapsed at publish) — so the exhibit chrome shows the exhibit's own credit and
  // the Reader shows the OBJECT's own credit, with NO display-time inheritance (no silent drift; Q2). Where
  // an object should carry its own provenance (each Voynich folio = Beinecke), that lives on the object.
  const pick = (r: RightsFields | undefined): RightsFields => ({ ...(r?.rights ? { rights: r.rights } : {}), ...(r?.requiredStatement ? { requiredStatement: r.requiredStatement } : {}) });
  const exhibitRights = $derived(pick(data ?? undefined));
  const objectRightsOf = (objectId: string): RightsFields => pick(data?.objects.find((x) => x.id === objectId));
</script>

{#if status === "loading"}
  <div class="state"><span class="dot"></span><span>Loading the exhibit…</span></div>
{:else if status === "error"}
  <div class="state error"><span class="warn">⚠</span><span>{errorMsg}</span></div>
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
      object={{ source: activeObject.source, canvasId: canvasIdOf(activeObject.id), label: activeObject.label, summary: activeData?.summary }}
      annotations={annotationsOf(activeObject.id)}
      readings={data.readings}
      activeReading={activeReading}
      onreading={(id) => (activeReading = id)}
      styleOf={readingStyleOf(activeObject.id)}
      siblings={layout.objects.map((o) => ({ id: o.id, label: o.label, source: o.source }))}
      currentId={activeObject.id}
      onnavigate={(id) => (selectedObjectId = id)}
      onback={isGrid ? () => (selectedObjectId = null) : undefined}
      rights={objectRightsOf(activeObject.id)}
      initialSelected={arrivedNote}
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
      <span class="seal">↪</span>
      <span class="msg">You followed a link to this note</span>
      <span class="dismiss">Dismiss</span>
    </button>
  {/if}
{/if}

<style>
  /* Load / error states over the dark light table (system.md §Reader States). */
  .state {
    display: flex; align-items: center; justify-content: center; gap: 10px; height: 100vh;
    background: var(--surface-canvas); color: var(--ink-canvas-secondary);
    font-family: var(--font-ui), sans-serif; font-size: 0.9375rem; letter-spacing: 0.02em;
  }
  .state.error { color: var(--accent); }
  .warn { font-size: 1.1rem; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: pulse 1.1s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }

  /* Cold-arrival chrome — a wax-sealed note over the dark table; understated, fades, not a gate. */
  .arrival {
    position: fixed; z-index: 30; top: var(--space-5); left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: var(--space-3); cursor: pointer;
    padding: var(--space-2) var(--space-4);
    background: var(--surface-canvas-overlay); color: var(--ink-canvas-primary);
    border: 1px solid var(--border-canvas-emphasis); border-left: 3px solid var(--accent);
    border-radius: var(--radius-md);
    font-family: var(--font-ui), sans-serif; font-size: 0.85rem;
  }
  .arrival .seal { color: var(--accent); font-size: 1rem; }
  .arrival .dismiss { font-size: 0.65rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-canvas-secondary); }
  .arrival:hover .dismiss { color: var(--accent); }
</style>
