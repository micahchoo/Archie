<script lang="ts">
  // Narrative layout (CONTEXT §92; ADR-0005 — the "third-layer" model). A prose-spine of ordered Sections
  // beside the canvas. Reading is prose-led: the ACTIVE section DRIVES the canvas — it switches to that
  // section's `objectId` object and fits its `start` region (a media fragment) — NOT coupled to annotation
  // order (the old section-i↔note-i index coupling is gone). An AV-object section renders the temporal
  // MediaPlayer instead of the OSD canvas. Markers shown = the active object's notes (progressive §122 = v1.1).
  import Canvas from "@render/svelte/Canvas.svelte";
  import MediaPlayer from "./MediaPlayer.svelte";
  import { renderMarkdown } from "@render/svelte";
  import type { AObject, W3CAnnotation, Section } from "@render/core";

  let {
    objects = [],
    canvasIdOf,
    annotationsByObject = {},
    sections = [],
    title = "",
    initialSelected = null,
  }: {
    objects: AObject[];
    /** Resolve an object id to its published canvas IRI (the Viewer owns the slug). */
    canvasIdOf: (objectId: string) => string;
    annotationsByObject?: Record<string, W3CAnnotation[]>;
    sections?: Section[];
    title?: string;
    initialSelected?: string | null; // deep-link arrival: land on the section whose object owns this note
  } = $props();

  // Deep-link arrival → land on the section whose object owns the note (else section 0).
  const arrivalSection = (() => {
    if (!initialSelected) return 0;
    const ownerId = objects.find((o) => (annotationsByObject[o.id] ?? []).some((a) => a.id === initialSelected))?.id;
    const idx = sections.findIndex((s) => s.objectId === ownerId);
    return idx >= 0 ? idx : 0;
  })();

  let activeIndex = $state(arrivalSection);
  let selected = $state<string | null>(initialSelected); // a clicked marker (highlight), distinct from the active section

  const activeSection = $derived(sections[activeIndex]);
  const activeObject = $derived(objects.find((o) => o.id === activeSection?.objectId) ?? objects[0]);
  const isAV = $derived(activeObject?.mediaType === "sound" || activeObject?.mediaType === "video");
  const activeNotes = $derived(activeObject ? (annotationsByObject[activeObject.id] ?? []) : []);
  const multiObject = $derived(new Set(sections.map((s) => s.objectId)).size > 1);

  function activate(i: number) { activeIndex = i; selected = null; }
</script>

<div class="narrative">
  <main>
    {#if activeObject}
      {#if isAV}
        <MediaPlayer object={activeObject} annotations={activeNotes} />
      {:else}
        {#key activeObject.id}
          <Canvas
            source={activeObject.source}
            canvasId={canvasIdOf(activeObject.id)}
            annotations={activeNotes}
            focus={activeSection?.start ?? null}
            bind:selected
          />
        {/key}
      {/if}
    {/if}
  </main>

  <aside>
    <p class="eyebrow">Narrative · {sections.length} {sections.length === 1 ? "section" : "sections"}</p>
    <h1>{title}</h1>
    <p class="hint">Read down the spine — the canvas travels to each section's focus{multiObject ? ", moving between objects" : ""}.</p>
    <ol class="sections">
      {#each sections as s, i (s.id)}
        <li>
          <button class:active={i === activeIndex} onclick={() => activate(i)}>
            <span class="num">{s.title}{#if multiObject && objects.length > 1}<span class="obj"> · {objects.find((o) => o.id === s.objectId)?.label ?? ""}</span>{/if}</span>
            <div class="prose">{@html renderMarkdown(s.prose ?? "")}</div>
          </button>
        </li>
      {/each}
    </ol>
  </aside>
</div>

<style>
  /* Prose-led reading (system.md §Exhibit Reader, narrative): the canvas on the dark light-table (left);
     the prose spine reads like a field journal on warm paper (right); the active section is inked
     forest-green. */
  .narrative { position: relative; display: flex; height: 100vh; background: var(--surface-canvas); }
  main { flex: 1; min-width: 0; background: var(--surface-canvas); }

  aside {
    width: 420px; flex-shrink: 0; overflow: auto; box-sizing: border-box;
    padding: var(--space-6) var(--space-5);
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border-left: 1px solid var(--border-canvas);
  }
  .eyebrow { color: var(--accent); }
  aside h1 { font-family: var(--font-display); font-weight: 600; font-size: 2rem; line-height: 1.1; margin: var(--space-2) 0 var(--space-3); color: var(--ink-paper-primary); }
  .hint { font-family: var(--font-ui); font-size: 0.78rem; line-height: 1.6; color: var(--ink-paper-muted); margin: 0 0 var(--space-5); }

  .sections { list-style: none; margin: 0; padding: 0; counter-reset: none; }
  .sections li { margin-bottom: var(--space-3); }
  .sections button {
    display: block; width: 100%; text-align: left; cursor: pointer;
    padding: var(--space-3) var(--space-4) var(--space-3) var(--space-5);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-paper); border-left: 3px solid transparent;
    border-radius: var(--radius-md);
    transition: background 120ms ease, border-color 120ms ease;
  }
  .sections button:hover { background: var(--surface-paper-hover); border-left-color: var(--accent); }
  .sections button.active { border-left-color: var(--accent); background: var(--accent-muted); }
  .num { display: inline-block; font-family: var(--font-mono); font-size: 0.7rem; color: var(--accent); margin-bottom: var(--space-2); }
  .num .obj { color: var(--ink-paper-muted); }
  .prose { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.55; color: var(--ink-paper-primary); }
  .prose :global(p) { margin: 0 0 var(--space-2); }
  .prose :global(p:last-child) { margin-bottom: 0; }
  .prose :global(strong) { font-weight: 700; }
  .prose :global(em) { font-style: italic; }
  .prose :global(a) { color: var(--accent); }
  .prose :global(img) { max-width: 100%; height: auto; border-radius: var(--radius-sm); margin-top: var(--space-2); }
  .prose :global(audio) { width: 100%; margin-top: var(--space-2); }
</style>
