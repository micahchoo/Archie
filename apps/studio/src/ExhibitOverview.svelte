<script lang="ts">
  // Exhibit overview-as-canvas (CONTEXT invention #1, the marquee gate). The exhibit's OTHER scale:
  // its Objects laid out as plates on the dark light-table, in reading order — a space you PAN (drag) and
  // ZOOM (wheel / ± controls), the SAME zoom metaphor as descending into an Object's deep-zoom surface
  // (1a). Click a plate → open that Object. The comprehension gate: does this read as a CANVAS, not a list
  // pretending to be one? The 1b fallback (an explicit List view) ships alongside so the contrast is in hand.
  // Browser-verified (pointer/wheel transforms). Narrative SECTION authoring lives in the editor sidebar
  // (NarrativeEditor), not here — this overview is the zoomed-OUT viewing/arranging scale only.
  import type { LayoutType, RightsFields, Section } from "@render/core";
  import DetailsEditor from "./DetailsEditor.svelte";
  import PropsDrawer from "./PropsDrawer.svelte";

  type OverviewObject = { id: string; label: string; source: string; mediaType?: "image" | "sound" | "video" };

  let {
    title,
    layout,
    objects,
    sections = [],
    noteCountOf,
    thumbFor,
    onopenobject,
    oneditobject,
    onaddobject,
    onback,
    onreorder,
    onstartnarrative,
    rights,
    onrights,
    summary,
    ontitle,
    onsummary,
    onremove,
  }: {
    title: string;
    layout: LayoutType;
    objects: OverviewObject[];
    /** The exhibit's narrative spine (ADR-0016). 0 → show the invitation strip; ≥1 → surface the ordered
     *  spine + the drag-legend disambiguation. Authored in the object editor (§56), surfaced read-only here. */
    sections?: ReadonlyArray<Section>;
    noteCountOf: (objId: string) => number;
    /** Resolve an object's thumbnail URL ("" if none — AV/extensionless → placeholder plate). */
    thumbFor: (obj: OverviewObject) => string;
    onopenobject: (objId: string) => void;
    /** Per-plate/per-row pencil CRUD (Archie-79be): open the App-owned object details drawer (title /
     *  description / credit / remove) WITHOUT descending into the object editor. */
    oneditobject: (objId: string) => void;
    onaddobject: () => void;
    onback: () => void;
    /** New reading order, by object id — the overview's reason to exist (Grid/Narrative sequence). */
    onreorder: (orderedIds: string[]) => void;
    /** Start the narrative: drop into an object editor to author beat 1 (beats are framed on the object
     *  canvas, NOT the overview — §56). Shown only when there are 0 sections. */
    onstartnarrative?: () => void;
    /** This exhibit's credit/license (rights grill Q6) — edited in the header → drawer. */
    rights: RightsFields;
    onrights: (next: RightsFields) => void;
    /** Exhibit identity (Phase 4): description + the title (the existing `title` prop), edited in the drawer. */
    summary?: string;
    ontitle: (v: string) => void;
    onsummary: (v: string) => void;
    /** Remove this exhibit from the library (Archie-3f4c) — threaded to the DetailsEditor's remove guard. */
    onremove?: () => void;
  } = $props();

  let rightsOpen = $state(false);
  const hasRights = $derived(!!(rights.rights || rights.requiredStatement));

  // The narrative spine surfaced at the overview scale (staging spec §5). 0 → an invitation strip; ≥1 → the
  // ordered spine list + the drag-legend disambiguation. Beats are NOT authored here (§56) — the spine is
  // read-only at this scale; "Start the narrative" / a spine row drops into the object editor.
  const hasNarrative = $derived(sections.length > 0);
  const objectLabel = (id: string) => objects.find((o) => o.id === id)?.label ?? id;

  // Reading intent per derived reading-mode (Archie-1f0e): name what the VISITOR experiences, not the
  // feature. `layout` is the DERIVED LayoutType — now the canonical render-core resolveLayoutType result
  // (ADR-0016 single source), display-only here. The exhaustive Record over the unchanged LayoutType
  // union keeps this total. (LAYOUT_NAME chip retired — ADR-0016.)
  const LAYOUT_INTENT: Record<LayoutType, string> = {
    single: "one media item, full attention",
    grid: "a wall of media to browse",
    narrative: "a guided sequence led by your writing",
  };

  let mode = $state<"canvas" | "list">("canvas"); // 1a spatial canvas ↔ 1b plain list
  let viewport = $state<HTMLDivElement | null>(null);

  // Pan/zoom transform of the whole tableau (the canvas gesture). z clamped to a sane range.
  let tx = $state(0), ty = $state(0), z = $state(1);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  function fit() { tx = 0; ty = 0; z = 1; }
  function nudgeZoom(factor: number) {
    if (!viewport) { z = clamp(z * factor, 0.4, 3); return; }
    const r = viewport.getBoundingClientRect();
    zoomAt(r.width / 2, r.height / 2, factor); // zoom toward the viewport centre
  }
  function zoomAt(cx: number, cy: number, factor: number) {
    const nz = clamp(z * factor, 0.4, 3);
    tx = cx - (cx - tx) * (nz / z); // keep the point under (cx,cy) fixed
    ty = cy - (cy - ty) * (nz / z);
    z = nz;
  }
  function onWheel(e: WheelEvent) {
    if (mode !== "canvas" || !viewport) return;
    e.preventDefault();
    const r = viewport.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }

  // Drag-to-pan, but ONLY from the tableau background (plates handle their own clicks).
  let dragging = false, lastX = 0, lastY = 0;
  function onBgPointerDown(e: PointerEvent) {
    if (mode !== "canvas") return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onBgPointerMove(e: PointerEvent) {
    if (!dragging) return;
    tx += e.clientX - lastX; ty += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
  }
  function onBgPointerUp(e: PointerEvent) {
    dragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }

  // Drag-to-reorder reading order — the overview's REASON TO EXIST (the published Grid display order /
  // Narrative sequence, settable nowhere else; the object rail only navigates). Native HTML5 DnD so it's
  // independent of the pan/zoom CSS transform and works identically in canvas + list modes. Emits the new
  // id order; App reorders the canonical objects[] array. Future: section grouping reuses this primitive.
  const END = "__end__";
  const START = "__start__"; // leading drop target — insert BEFORE the first object (position 0)
  let dragId = $state<string | null>(null);
  let overId = $state<string | null>(null); // drop target — insert BEFORE it; END = append; START = prepend
  function onPlateDragStart(e: DragEvent, id: string) {
    dragId = id;
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); }
  }
  function onPlateDragOver(e: DragEvent, id: string) {
    if (!dragId || id === dragId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    overId = id;
  }
  function commitReorder(beforeId: string | null) {
    if (!dragId) { overId = null; return; }
    const ids = objects.map((o) => o.id).filter((id) => id !== dragId);
    const at = beforeId === null ? ids.length : ids.indexOf(beforeId);
    ids.splice(at < 0 ? ids.length : at, 0, dragId);
    dragId = null; overId = null;
    onreorder(ids);
  }
  // Prepend to position 0. Dedicated path so it survives the dragged item BEING first (where
  // commitReorder(objects[0].id) would indexOf its own filtered-out id → -1 → wrongly append to end).
  function commitToStart() {
    if (!dragId) { overId = null; return; }
    const ids = objects.map((o) => o.id).filter((id) => id !== dragId);
    ids.unshift(dragId);
    dragId = null; overId = null;
    onreorder(ids);
  }
  function onDragEnd() { dragId = null; overId = null; }
</script>

<main class="overview">
  <!-- Exhibit-scale header: where you are + the exhibit's reading-intent + the canvas/list switch. -->
  <header>
    <button class="back" onclick={onback}>← Exhibits</button>
    <div class="titles">
      <p class="eyebrow">Exhibit · {objects.length} {objects.length === 1 ? "media item" : "media items"} · reading order</p>
      <h1>{title}</h1>
      <p class="intent">{LAYOUT_INTENT[layout]}</p>
    </div>
    <span class="spacer"></span>
    <!-- The "Exhibit layout" chip is RETIRED (ADR-0016): the reading mode is no longer a picked layout but
         an emergent property of content; the intent line under the title still names what visitors get. -->
    <button class="chip rights" class:set={hasRights} onclick={() => (rightsOpen = true)} title="Title, description, credit & license for this exhibit">ⓘ Details{#if hasRights}<span class="dot">●</span>{/if}</button>
    <div class="viewtoggle" role="group" aria-label="Overview mode">
      <button class:on={mode === "canvas"} onclick={() => (mode = "canvas")} title="Spatial canvas (pan + zoom)">Canvas</button>
      <button class:on={mode === "list"} onclick={() => (mode = "list")} title="Plain list">List</button>
    </div>
  </header>

  <PropsDrawer open={rightsOpen} title="Exhibit details" onclose={() => (rightsOpen = false)}>
    <DetailsEditor title={title} summary={summary ?? ""} rights={rights} scope="exhibit" ontitle={ontitle} onsummary={onsummary} onrights={onrights} {onremove} />
  </PropsDrawer>

  <!-- Narrative at the overview scale (staging spec §5). 0 sections → an invitation to start; ≥1 → the
       ordered spine, read-only here (beats are authored on the object canvas, §56 — a row drops into it). -->
  {#if objects.length > 0}
    {#if !hasNarrative}
      <div class="narrative-strip invite">
        <div class="ns-text">
          <p class="ns-eyebrow">Exhibit narrative</p>
          <p class="ns-line">Guide visitors through the media with your writing.</p>
        </div>
        <button class="ns-start" onclick={() => onstartnarrative?.()}>＋ Start the narrative</button>
      </div>
    {:else}
      <div class="narrative-strip spine">
        <p class="ns-eyebrow">Exhibit narrative · {sections.length} {sections.length === 1 ? "section" : "sections"}</p>
        <ol class="ns-spine">
          {#each sections as s, i (s.id)}
            <li>
              <button class="ns-beat" onclick={() => onopenobject(s.objectId)} title="Open the media item for this section">
                <span class="ns-n">{i + 1}</span>
                <span class="ns-title">{s.title || `Section ${i + 1}`}</span>
                <span class="ns-with">{objectLabel(s.objectId)}</span>
              </button>
            </li>
          {/each}
        </ol>
      </div>
    {/if}
  {/if}

  {#if mode === "canvas"}
    <div
      class="viewport"
      bind:this={viewport}
      onwheel={onWheel}
      onpointerdown={onBgPointerDown}
      onpointermove={onBgPointerMove}
      onpointerup={onBgPointerUp}
      onpointercancel={onBgPointerUp}
      role="application"
      aria-label="Exhibit canvas — drag to pan, scroll to zoom"
    >
      <div class="tableau" style={`transform: translate(${tx}px, ${ty}px) scale(${z});`}>
        <!-- Leading drop zone: the ONLY way to express "insert before the first object" (Archie-1933).
             Inert unless a drag is active and the dragged plate isn't already first. -->
        <div class="dropstart" class:armed={dragId && objects[0]?.id !== dragId} class:over={overId === START}
          ondragover={(e) => { if (dragId && objects[0]?.id !== dragId) { e.preventDefault(); overId = START; } }}
          ondrop={(e) => { e.preventDefault(); commitToStart(); }}
          ondragleave={() => { if (overId === START) overId = null; }}
          role="presentation" aria-hidden="true"></div>
        {#each objects as o, i (o.id)}
          {@const thumb = thumbFor(o)}
          <div class="plate-wrap" class:dragging={dragId === o.id}>
            <button class="plate" class:over={overId === o.id}
              draggable="true"
              ondragstart={(e) => onPlateDragStart(e, o.id)}
              ondragover={(e) => onPlateDragOver(e, o.id)}
              ondrop={(e) => { e.preventDefault(); commitReorder(o.id); }}
              ondragend={onDragEnd}
              onpointerdown={(e) => e.stopPropagation()} onclick={() => onopenobject(o.id)} title={o.label}>
              <span class="order">{i + 1}</span>
              <span class="frame" class:av={!thumb}>
                {#if thumb}<span class="img" style={`background-image:url(${thumb})`}></span>{:else}<span class="glyph">{o.mediaType === "video" ? "▶" : "♪"}</span>{/if}
              </span>
              <span class="caption">
                <span class="lbl">{o.label}</span>
                <span class="cnt">{noteCountOf(o.id)} {noteCountOf(o.id) === 1 ? "note" : "notes"}</span>
              </span>
            </button>
            <!-- Per-plate pencil (Archie-79be): edit this media item's details without opening it. A SIBLING
                 of the plate button (no button-in-button); stops pointerdown/click so it neither pans the
                 canvas nor opens the object. -->
            <button class="plate-edit" title="Edit details for {o.label}" aria-label="Edit details for {o.label}"
              onpointerdown={(e) => e.stopPropagation()} onclick={(e) => { e.stopPropagation(); oneditobject(o.id); }}>✎</button>
          </div>
        {/each}
        <button class="plate add" class:over={overId === END}
          ondragover={(e) => { if (dragId) { e.preventDefault(); overId = END; } }}
          ondrop={(e) => { e.preventDefault(); commitReorder(null); }}
          ondragleave={() => { if (overId === END) overId = null; }}
          onpointerdown={(e) => e.stopPropagation()} onclick={onaddobject}>
          <span class="frame add-frame"><span class="glyph">{dragId ? "↧" : "+"}</span></span>
          <span class="caption"><span class="lbl">{dragId ? "Move to end" : "Add media"}</span></span>
        </button>
      </div>

      <!-- Pan/zoom affordances: a top legend NAMES the gestures, an edge vignette implies space beyond the
           frame, and the zoom cluster shows the live % — together signalling "this is a movable canvas". -->
      <div class="edges" aria-hidden="true"></div>
      <div class="canvas-legend" aria-hidden="true">
        <!-- Drag-legend disambiguation (staging spec §6): once a narrative exists, drag here no longer sets
             "the order visitors see" — the SECTION order does. Demote drag to the fallback grid order. -->
        <span class="g lead"><span class="ico">⇅</span> {hasNarrative ? "Visitors follow your section order — dragging here sets the fallback grid order." : "Drag a media item to set the reading order"}</span>
        <span class="dot">·</span>
        <span class="g"><span class="ico">✥</span> Drag the canvas to pan</span>
        <span class="dot">·</span>
        <span class="g"><span class="ico">⊙</span> Scroll to zoom</span>
      </div>
      <div class="zoomctl" role="group" aria-label="Zoom">
        <button onclick={() => nudgeZoom(1 / 1.2)} aria-label="Zoom out">−</button>
        <span class="pct" aria-live="polite">{Math.round(z * 100)}%</span>
        <button class="fit" onclick={fit} title="Reset to 100%">Fit</button>
        <button onclick={() => nudgeZoom(1.2)} aria-label="Zoom in">+</button>
      </div>
      <p class="hint">Click a media item to open and add notes</p>
    </div>
  {:else}
    <!-- 1b fallback: the explicit list (the contrast the gate measures the canvas against). Same
         drag-to-reorder — a vertical list is the most legible place to set sequence. -->
    <p class="list-hint">{hasNarrative ? "Visitors follow your section order — dragging here sets the fallback grid order." : "Drag a row by its ⠿ handle to set the reading order."}</p>
    <ul class="list">
      <li class="dropstart-row" class:armed={dragId && objects[0]?.id !== dragId} class:over={overId === START}
        ondragover={(e) => { if (dragId && objects[0]?.id !== dragId) { e.preventDefault(); overId = START; } }}
        ondrop={(e) => { e.preventDefault(); commitToStart(); }}
        ondragleave={() => { if (overId === START) overId = null; }}
        aria-hidden="true"></li>
      {#each objects as o, i (o.id)}
        <li class:dragging={dragId === o.id} class:over={overId === o.id}
          ondragover={(e) => onPlateDragOver(e, o.id)}
          ondrop={(e) => { e.preventDefault(); commitReorder(o.id); }}>
          <button type="button" class="grip" draggable="true" ondragstart={(e) => onPlateDragStart(e, o.id)} ondragend={onDragEnd} title="Drag to reorder" aria-label="Reorder {o.label}">⠿</button>
          <button onclick={() => onopenobject(o.id)}>
            <span class="li-order">{i + 1}</span>
            <span class="li-thumb" class:av={!thumbFor(o)} style={thumbFor(o) ? `background-image:url(${thumbFor(o)})` : ""}>{#if !thumbFor(o)}<span class="glyph">{o.mediaType === "video" ? "▶" : "♪"}</span>{/if}</span>
            <span class="li-lbl">{o.label}</span>
            <span class="li-cnt">{noteCountOf(o.id)} {noteCountOf(o.id) === 1 ? "note" : "notes"}</span>
          </button>
          <!-- Per-row pencil (Archie-79be): edit this media item's details without opening it. -->
          <button class="row-edit" title="Edit details for {o.label}" aria-label="Edit details for {o.label}"
            onclick={(e) => { e.stopPropagation(); oneditobject(o.id); }}>✎</button>
        </li>
      {/each}
      <li class="end" class:over={overId === END} ondragover={(e) => { if (dragId) { e.preventDefault(); overId = END; } }} ondrop={(e) => { e.preventDefault(); commitReorder(null); }} ondragleave={() => { if (overId === END) overId = null; }}>
        <button class="li-add" onclick={onaddobject}>{dragId ? "↧ Move to end" : "+ Add media"}</button>
      </li>
    </ul>
  {/if}
</main>

<style>
  /* The exhibit at the overview scale — plates as soft warm paper on the atmospheric ground (Soft Static). */
  /* The overview occupies the middle ~80vh band, FULL WIDTH — the canvas is fully available, not a framed
     window. Vertically centred by .overview-stage (App). */
  .overview { display: flex; flex-direction: column; height: 92vh; min-height: 36rem; width: 100%; box-sizing: border-box; background: var(--surface-canvas); color: var(--ink-canvas-primary); }

  /* Narrative strip — sits between the header and the canvas; quiet, on the dark canvas ground. The invite
     variant is a one-line CTA; the spine variant a capped, scrollable read-only list (authored elsewhere). */
  .narrative-strip { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-3) var(--space-6); border-bottom: 1px solid var(--border-canvas); }
  .narrative-strip.spine { flex-direction: column; align-items: stretch; gap: var(--space-2); }
  .ns-eyebrow { margin: 0; font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-canvas-muted); }
  .narrative-strip .ns-text { display: flex; flex-direction: column; gap: 2px; }
  .ns-line { margin: 0; font-family: var(--font-body); font-size: 0.95rem; line-height: 1.5; color: var(--ink-canvas-secondary); }
  /* "Start the narrative" — the ONE rationed signal-orange CTA at this scale (mirrors NarrativeEditor's Add). */
  .ns-start { margin-left: auto; cursor: pointer; font-family: var(--font-body); font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.01em; padding: var(--space-2) var(--space-4); background: var(--accent); color: var(--ink-on-accent); border: none; border-radius: var(--radius-sm); box-shadow: var(--shadow-signal-glow); transition: background 140ms ease; }
  .ns-start:hover { background: var(--accent-hover); }
  /* The ordered spine: numbered, scrollable, each row a quiet button that opens the item it's shown with. */
  .ns-spine { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); max-height: 22vh; overflow-y: auto; }
  .ns-beat { display: flex; align-items: baseline; gap: var(--space-3); width: 100%; text-align: left; cursor: pointer; padding: var(--space-1) var(--space-2); background: transparent; border: none; border-radius: var(--radius-sm); color: inherit; transition: background 140ms ease; }
  .ns-beat:hover { background: var(--surface-canvas-raised); }
  .ns-beat .ns-n { font-family: var(--font-mono); font-size: var(--text-ui-xs); color: var(--accent-2); min-width: 1.25rem; }
  .ns-beat .ns-title { flex: 1; font-family: var(--font-display); font-size: 1.05rem; font-weight: 400; color: var(--ink-canvas-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ns-beat .ns-with { font-family: var(--font-mono); font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-canvas-muted); white-space: nowrap; }

  header { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-4) var(--space-6); border-bottom: 1px solid var(--border-canvas); }
  .back { font-family: var(--font-ui); font-size: var(--text-ui-sm); text-transform: uppercase; letter-spacing: 0.14em; cursor: pointer; padding: var(--space-2) var(--space-3); background: var(--surface-canvas-raised); color: var(--ink-canvas-secondary); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); transition: color 160ms ease, border-color 160ms ease; }
  .back:hover { color: var(--ink-canvas-primary); border-color: var(--border-canvas-emphasis); }
  .titles .eyebrow { margin: 0; }
  .titles h1 { margin: 2px 0 0; font-family: var(--font-display); font-weight: 400; font-size: 2rem; line-height: 1.1; color: var(--ink-canvas-primary); }
  .titles .intent { margin: 4px 0 0; font-family: var(--font-ui); font-size: var(--text-ui-sm); text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-canvas-muted); }
  .spacer { flex: 1; }
  .chip { font-family: var(--font-ui); font-size: var(--text-ui-sm); text-transform: uppercase; letter-spacing: 0.14em; cursor: pointer; padding: var(--space-2) var(--space-3); background: var(--surface-canvas-raised); color: var(--ink-canvas-secondary); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); transition: color 160ms ease, border-color 160ms ease; }
  .chip.rights { display: inline-flex; align-items: center; gap: var(--space-1); }
  .chip.rights.set { border-color: var(--accent-2-muted); }
  .chip.rights .dot { color: var(--accent-2); font-size: 0.55rem; }
  .chip:hover { border-color: var(--border-canvas-emphasis); color: var(--ink-canvas-primary); }
  .viewtoggle { display: inline-flex; border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); overflow: hidden; }
  .viewtoggle button { font-family: var(--font-ui); font-size: var(--text-ui-sm); text-transform: uppercase; letter-spacing: 0.14em; cursor: pointer; padding: 6px var(--space-3); background: transparent; color: var(--ink-canvas-muted); border: none; transition: color 160ms ease, background 160ms ease; } /* 6px v-pad -> 25px hit box (Fitts) */
  .viewtoggle button.on { background: var(--accent-muted); color: var(--ink-canvas-primary); box-shadow: inset 0 -2px 0 var(--accent); }

  /* The canvas: a clipped viewport holding the pan/zoomed tableau. grab cursor signals "this is a space". */
  .viewport { position: relative; flex: 1; min-height: 0; overflow: hidden; cursor: grab; touch-action: none; background: var(--focal-bloom); }
  .viewport:active { cursor: grabbing; }
  /* Plates centred in the viewport (few objects sit in the middle, not jammed top-left); pan/zoom transforms the whole. */
  .tableau { display: flex; flex-wrap: wrap; gap: var(--space-6); justify-content: center; align-content: center; min-width: 100%; min-height: 100%; box-sizing: border-box; padding: var(--space-10); transform-origin: 0 0; }

  /* Edge vignette — the frame reads as a window onto a larger surface, not a bounded page; soft warm haze. */
  .edges { position: absolute; inset: 0; pointer-events: none; background: var(--vignette); }
  /* Gesture legend — names the two non-obvious gestures, quietly, top-centre. */
  .canvas-legend { position: absolute; top: var(--space-4); left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-4); font-family: var(--font-ui); font-size: var(--text-ui-sm); text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-canvas-secondary); background: var(--surface-canvas-raised); border-radius: var(--radius-md); box-shadow: var(--shadow-lift-low); pointer-events: none; }
  .canvas-legend .g { display: inline-flex; align-items: center; gap: var(--space-1); }
  .canvas-legend .ico { color: var(--accent-2); font-size: 0.95rem; }
  .canvas-legend .dot { color: var(--ink-canvas-muted); }

  .plate { display: flex; flex-direction: column; gap: var(--space-2); width: 13rem; cursor: pointer; text-align: left; padding: var(--space-3); background: var(--surface-canvas-raised); border-radius: var(--radius-md); box-shadow: var(--shadow-lift-low); transition: transform 180ms ease, box-shadow 180ms ease; }
  .plate:hover { transform: translateY(-2px); box-shadow: var(--shadow-lift-mid); }
  .plate .order { font-family: var(--font-mono); font-size: var(--text-ui-xs); text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-canvas-muted); }
  .frame { position: relative; aspect-ratio: 4 / 3; border-radius: var(--radius-sm); overflow: hidden; background: var(--surface-canvas-overlay); display: flex; align-items: center; justify-content: center; }
  .frame .img { position: absolute; inset: 0; background-size: cover; background-position: center; }
  .frame.av { background: var(--surface-canvas-overlay); }
  .frame .glyph { font-size: 2rem; color: var(--accent-2); }
  .caption { display: flex; flex-direction: column; gap: 2px; }
  .caption .lbl { font-family: var(--font-display); font-size: 1.2rem; font-weight: 400; line-height: 1.15; color: var(--ink-canvas-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .caption .cnt { font-family: var(--font-mono); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-canvas-muted); }
  .plate.add { background: transparent; box-shadow: none; border: 1px dashed var(--border-canvas-emphasis); justify-content: center; }
  .plate.add:hover { background: var(--surface-canvas-raised); box-shadow: var(--shadow-lift-low); }
  .add-frame { background: transparent; border: 1px dashed var(--border-canvas-emphasis); }
  .plate[draggable="true"] { cursor: grab; }
  .plate[draggable="true"]:active { cursor: grabbing; }
  /* Drag-to-reorder feedback (canvas): dragged plate dims; drop target shows a quiet signal insert-before bar. */
  .plate-wrap.dragging { opacity: 0.4; } /* dim the whole wrapper (plate + pencil) while it's the drag source */
  .plate.over { box-shadow: var(--shadow-lift-low), -4px 0 0 var(--accent); }
  /* Per-plate pencil (Archie-79be): a quiet glyph over the plate's top-right corner. The wrapper is both the
     flex/drag child AND the positioning context. Faint at rest (still visible on touch), bright on hover/focus. */
  .plate-wrap { position: relative; }
  .plate-edit {
    position: absolute; top: var(--space-2); right: var(--space-2); z-index: 1;
    display: inline-flex; align-items: center; justify-content: center;
    width: 1.85rem; height: 1.85rem; padding: 0; cursor: pointer; line-height: 1;
    font-family: var(--font-ui); font-size: 0.95rem;
    color: var(--ink-canvas-secondary); background: var(--surface-canvas-raised);
    border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm);
    box-shadow: var(--shadow-lift-low);
    opacity: 0.5; transition: opacity 160ms ease, color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  }
  .plate-wrap:hover .plate-edit, .plate-wrap:focus-within .plate-edit { opacity: 1; }
  .plate-edit:hover { color: var(--accent); border-color: var(--accent); box-shadow: var(--shadow-lift-mid); }
  .plate-edit:focus-visible { opacity: 1; outline: 2px solid var(--accent); outline-offset: 1px; }
  .plate.add.over { border-color: var(--accent); border-style: solid; color: var(--accent); }
  .canvas-legend .lead { color: var(--ink-canvas-secondary); }
  /* Leading "insert before first" drop zone (canvas): a thin column that only takes space while armed;
     shows the same accent insert bar as a plate's .over state. */
  .dropstart { width: 0; align-self: stretch; border-radius: var(--radius-sm); transition: width 120ms ease; }
  .dropstart.armed { width: 1.5rem; border: 1px dashed var(--border-canvas-emphasis); }
  .dropstart.over { border-color: var(--accent); border-style: solid; box-shadow: 4px 0 0 var(--accent); }

  .zoomctl { position: absolute; bottom: var(--space-5); right: var(--space-5); display: flex; gap: 1px; background: var(--border-canvas); border-radius: var(--radius-sm); box-shadow: var(--shadow-lift-low); overflow: hidden; }
  .zoomctl button { font-family: var(--font-display); font-weight: 400; font-size: 1.1rem; cursor: pointer; min-width: 2.25rem; padding: var(--space-2) var(--space-2); background: var(--surface-canvas-raised); color: var(--ink-canvas-primary); border: none; transition: color 160ms ease, background 160ms ease; }
  .zoomctl .fit { font-family: var(--font-ui); text-transform: uppercase; letter-spacing: 0.14em; font-size: var(--text-ui-sm); }
  .zoomctl button:hover { color: var(--ink-canvas-primary); background: var(--surface-canvas-overlay); }
  .zoomctl .pct { display: inline-flex; align-items: center; justify-content: center; min-width: 3rem; font-family: var(--font-mono); font-size: var(--text-ui-xs); color: var(--ink-canvas-secondary); background: var(--surface-canvas-raised); }
  .hint { position: absolute; bottom: var(--space-5); left: var(--space-6); margin: 0; font-family: var(--font-ui); font-size: var(--text-ui-xs); text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-canvas-muted); pointer-events: none; }

  /* 1b list fallback. */
  .list-hint { max-width: 48rem; margin: var(--space-6) auto 0; padding: 0 var(--space-6); font-family: var(--font-ui); font-size: var(--text-ui-sm); text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-canvas-muted); }
  .list { list-style: none; margin: 0; padding: var(--space-4) var(--space-6) var(--space-6); overflow-y: auto; flex: 1; max-width: 48rem; }
  .list li { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
  .list li.dragging { opacity: 0.4; }
  .list li.over { box-shadow: 0 -3px 0 var(--accent); } /* insert-before line */
  /* Leading "insert before first" drop zone (list): collapsed until a drag is active. */
  .list li.dropstart-row { height: 0; margin: 0; padding: 0; border-radius: var(--radius-sm); transition: height 120ms ease; }
  .list li.dropstart-row.armed { height: var(--space-4); }
  .list li.dropstart-row.over { box-shadow: 0 3px 0 var(--accent); }
  .list .grip { cursor: grab; user-select: none; color: var(--ink-canvas-muted); font-size: 1.15rem; padding: 0 var(--space-2); background: none; border: none; line-height: 1; transition: color 160ms ease; }
  .list .grip:hover { color: var(--ink-canvas-secondary); }
  .list .grip:active { cursor: grabbing; }
  .list li button { display: flex; flex: 1; align-items: center; gap: var(--space-4); text-align: left; cursor: pointer; padding: var(--space-3); background: var(--surface-canvas-raised); border-radius: var(--radius-md); box-shadow: var(--shadow-lift-low); color: inherit; transition: transform 180ms ease, box-shadow 180ms ease; }
  .list li button:hover { transform: translateY(-2px); box-shadow: var(--shadow-lift-mid); }
  .list li.end.over button { border: 1px solid var(--accent); color: var(--accent); }
  .li-order { font-family: var(--font-mono); font-size: var(--text-ui-xs); letter-spacing: 0.14em; color: var(--ink-canvas-muted); min-width: 1.5rem; }
  .li-thumb { width: 3rem; height: 2.25rem; border-radius: var(--radius-sm); background: var(--surface-canvas-overlay) center/cover; display: flex; align-items: center; justify-content: center; }
  .li-thumb .glyph { color: var(--accent-2); }
  .li-lbl { flex: 1; font-family: var(--font-display); font-size: 1.25rem; font-weight: 400; color: var(--ink-canvas-primary); }
  .li-cnt { font-family: var(--font-mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-canvas-muted); }
  /* Per-row pencil (Archie-79be): a trailing quiet glyph. Selector outspecifies `.list li button` (which sets
     flex:1) so flex:none holds and the open-button keeps the row width. */
  .list li .row-edit {
    flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
    width: 2rem; height: 2rem; margin-left: var(--space-1); padding: 0; cursor: pointer; line-height: 1;
    font-family: var(--font-ui); font-size: 0.95rem;
    color: var(--ink-canvas-muted); background: var(--surface-canvas-raised);
    border: 1px solid var(--border-canvas); border-radius: var(--radius-sm);
    box-shadow: var(--shadow-lift-low);
    transition: color 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
  }
  .list li .row-edit:hover { color: var(--accent); border-color: var(--accent); box-shadow: var(--shadow-lift-mid); transform: none; }
  .list li .row-edit:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .li-add { font-family: var(--font-ui); font-size: var(--text-ui-sm); text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-canvas-secondary); background: var(--surface-canvas-raised); border: 1px dashed var(--border-canvas-emphasis); border-radius: var(--radius-md); padding: var(--space-3); cursor: pointer; width: 100%; transition: color 160ms ease, border-color 160ms ease; }
  .li-add:hover { color: var(--ink-canvas-primary); border-color: var(--accent); }
</style>
