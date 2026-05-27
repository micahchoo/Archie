<script lang="ts">
  // Exhibit overview-as-canvas (CONTEXT invention #1, the marquee gate). The exhibit's OTHER scale:
  // its Objects laid out as plates on the dark light-table, in reading order — a space you PAN (drag) and
  // ZOOM (wheel / ± controls), the SAME zoom metaphor as descending into an Object's deep-zoom surface
  // (1a). Click a plate → open that Object. The comprehension gate: does this read as a CANVAS, not a list
  // pretending to be one? The 1b fallback (an explicit List view) ships alongside so the contrast is in hand.
  // Browser-verified (pointer/wheel transforms). Narrative SECTION authoring lives in the editor sidebar
  // (NarrativeEditor), not here — this overview is the zoomed-OUT viewing/arranging scale only.
  import type { LayoutType, RightsFields } from "@render/core";
  import DetailsEditor from "./DetailsEditor.svelte";
  import PropsDrawer from "./PropsDrawer.svelte";

  type OverviewObject = { id: string; label: string; source: string; mediaType?: "image" | "sound" | "video" };

  let {
    title,
    layout,
    objects,
    noteCountOf,
    thumbFor,
    onopenobject,
    onaddobject,
    onsetlayout,
    onback,
    onreorder,
    rights,
    onrights,
    summary,
    ontitle,
    onsummary,
  }: {
    title: string;
    layout: LayoutType;
    objects: OverviewObject[];
    noteCountOf: (objId: string) => number;
    /** Resolve an object's thumbnail URL ("" if none — AV/extensionless → placeholder plate). */
    thumbFor: (obj: OverviewObject) => string;
    onopenobject: (objId: string) => void;
    onaddobject: () => void;
    onsetlayout: () => void;
    onback: () => void;
    /** New reading order, by object id — the overview's reason to exist (Grid/Narrative sequence). */
    onreorder: (orderedIds: string[]) => void;
    /** This exhibit's credit/license (rights grill Q6) — edited in the header → drawer. */
    rights: RightsFields;
    onrights: (next: RightsFields) => void;
    /** Exhibit identity (Phase 4): description + the title (the existing `title` prop), edited in the drawer. */
    summary?: string;
    ontitle: (v: string) => void;
    onsummary: (v: string) => void;
  } = $props();

  let rightsOpen = $state(false);
  const hasRights = $derived(!!(rights.rights || rights.requiredStatement));

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
  let dragId = $state<string | null>(null);
  let overId = $state<string | null>(null); // drop target — insert BEFORE it; END = append
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
  function onDragEnd() { dragId = null; overId = null; }
</script>

<section class="overview">
  <!-- Exhibit-scale header: where you are + the exhibit's reading-intent + the canvas/list switch. -->
  <header>
    <button class="back" onclick={onback}>← Exhibits</button>
    <div class="titles">
      <p class="eyebrow">Exhibit · {objects.length} {objects.length === 1 ? "object" : "objects"} · reading order</p>
      <h1>{title}</h1>
    </div>
    <span class="spacer"></span>
    <button class="chip layout" onclick={onsetlayout} title="How visitors read this exhibit (reading intent)">▦ {layout}</button>
    <button class="chip rights" class:set={hasRights} onclick={() => (rightsOpen = true)} title="Title, description, credit & license for this exhibit">ⓘ Details{#if hasRights}<span class="dot">●</span>{/if}</button>
    <div class="viewtoggle" role="group" aria-label="Overview mode">
      <button class:on={mode === "canvas"} onclick={() => (mode = "canvas")} title="Spatial canvas (pan + zoom)">Canvas</button>
      <button class:on={mode === "list"} onclick={() => (mode = "list")} title="Plain list">List</button>
    </div>
  </header>

  <PropsDrawer open={rightsOpen} title="Exhibit details" onclose={() => (rightsOpen = false)}>
    <DetailsEditor title={title} summary={summary ?? ""} rights={rights} scope="exhibit" ontitle={ontitle} onsummary={onsummary} onrights={onrights} />
  </PropsDrawer>

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
        {#each objects as o, i (o.id)}
          {@const thumb = thumbFor(o)}
          <button class="plate" class:dragging={dragId === o.id} class:over={overId === o.id}
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
        {/each}
        <button class="plate add" class:over={overId === END}
          ondragover={(e) => { if (dragId) { e.preventDefault(); overId = END; } }}
          ondrop={(e) => { e.preventDefault(); commitReorder(null); }}
          ondragleave={() => { if (overId === END) overId = null; }}
          onpointerdown={(e) => e.stopPropagation()} onclick={onaddobject}>
          <span class="frame add-frame"><span class="glyph">{dragId ? "↧" : "+"}</span></span>
          <span class="caption"><span class="lbl">{dragId ? "Move to end" : "Add object"}</span></span>
        </button>
      </div>

      <!-- Pan/zoom affordances: a top legend NAMES the gestures, an edge vignette implies space beyond the
           frame, and the zoom cluster shows the live % — together signalling "this is a movable canvas". -->
      <div class="edges" aria-hidden="true"></div>
      <div class="canvas-legend" aria-hidden="true">
        <span class="g lead"><span class="ico">⇅</span> Drag a plate to set reading order</span>
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
      <p class="hint">Click a plate to annotate it up close</p>
    </div>
  {:else}
    <!-- 1b fallback: the explicit list (the contrast the gate measures the canvas against). Same
         drag-to-reorder — a vertical list is the most legible place to set sequence. -->
    <p class="list-hint">Drag a row by its ⠿ handle to set the reading order.</p>
    <ul class="list">
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
        </li>
      {/each}
      <li class="end" class:over={overId === END} ondragover={(e) => { if (dragId) { e.preventDefault(); overId = END; } }} ondrop={(e) => { e.preventDefault(); commitReorder(null); }} ondragleave={() => { if (overId === END) overId = null; }}>
        <button class="li-add" onclick={onaddobject}>{dragId ? "↧ Move to end" : "+ Add object"}</button>
      </li>
    </ul>
  {/if}
</section>

<style>
  /* The exhibit at the overview scale — plates on the dark light-table (system.md). */
  /* The overview occupies the middle ~80vh band, FULL WIDTH — the canvas is fully available, not a framed
     window. Vertically centred by .overview-stage (App). */
  .overview { display: flex; flex-direction: column; height: 80vh; width: 100%; box-sizing: border-box; background: var(--surface-canvas); color: var(--ink-canvas-primary); }

  header { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-4) var(--space-6); border-bottom: 1px solid var(--border-canvas); }
  .back { font-family: var(--font-ui); font-size: var(--text-ui-sm); cursor: pointer; padding: var(--space-1) var(--space-3); background: transparent; color: var(--ink-canvas-secondary); border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); }
  .back:hover { color: var(--accent); border-color: var(--accent); }
  .titles .eyebrow { margin: 0; font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
  .titles h1 { margin: 2px 0 0; font-family: var(--font-display); font-weight: 600; font-size: 1.9rem; line-height: 1.05; color: var(--ink-canvas-primary); }
  .spacer { flex: 1; }
  .chip { font-family: var(--font-ui); font-size: var(--text-ui-sm); cursor: pointer; padding: var(--space-1) var(--space-3); background: var(--surface-canvas-overlay); color: var(--ink-canvas-primary); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); }
  .chip.rights { display: inline-flex; align-items: center; gap: var(--space-1); }
  .chip.rights.set { border-color: var(--accent); }
  .chip.rights .dot { color: var(--accent); font-size: 0.55rem; }
  .chip:hover { border-color: var(--accent); color: var(--accent); }
  .viewtoggle { display: inline-flex; border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); overflow: hidden; }
  .viewtoggle button { font-family: var(--font-ui); font-size: var(--text-ui-sm); cursor: pointer; padding: var(--space-1) var(--space-3); background: transparent; color: var(--ink-canvas-secondary); border: none; }
  .viewtoggle button.on { background: var(--accent); color: var(--ink-on-accent); }

  /* The canvas: a clipped viewport holding the pan/zoomed tableau. grab cursor signals "this is a space". */
  .viewport { position: relative; flex: 1; min-height: 0; overflow: hidden; cursor: grab; touch-action: none; background:
    radial-gradient(circle at 1px 1px, rgba(160,155,142,0.08) 1px, transparent 0) 0 0 / 28px 28px; } /* faint dot-grid = a surface, not a page */
  .viewport:active { cursor: grabbing; }
  /* Plates centred in the viewport (few objects sit in the middle, not jammed top-left); pan/zoom transforms the whole. */
  .tableau { display: flex; flex-wrap: wrap; gap: var(--space-6); justify-content: center; align-content: center; min-width: 100%; min-height: 100%; box-sizing: border-box; padding: var(--space-10); transform-origin: 0 0; }

  /* Edge vignette — the frame reads as a window onto a larger surface, not a bounded page. */
  .edges { position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 64px 10px rgba(20,19,16,0.5); }
  /* Gesture legend — names the two non-obvious gestures, prominently, top-centre. */
  .canvas-legend { position: absolute; top: var(--space-4); left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-4); font-family: var(--font-ui); font-size: var(--text-ui-sm); color: var(--ink-canvas-primary); background: rgba(30,29,25,0.85); border: 1px solid var(--border-canvas-emphasis); border-radius: 999px; pointer-events: none; }
  .canvas-legend .g { display: inline-flex; align-items: center; gap: var(--space-1); }
  .canvas-legend .ico { color: var(--accent); font-size: 0.95rem; }
  .canvas-legend .dot { color: var(--ink-canvas-muted); }

  .plate { display: flex; flex-direction: column; gap: var(--space-2); width: 13rem; cursor: pointer; text-align: left; padding: var(--space-3); background: var(--surface-canvas-raised); border: 1px solid var(--border-canvas); border-radius: var(--radius-md); transition: border-color 140ms ease, transform 140ms ease, box-shadow 140ms ease; }
  .plate:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
  .plate .order { font-family: var(--font-mono); font-size: var(--text-ui-xs); color: var(--accent); }
  .frame { position: relative; aspect-ratio: 4 / 3; border-radius: var(--radius-sm); overflow: hidden; background: var(--surface-canvas-overlay); display: flex; align-items: center; justify-content: center; }
  .frame .img { position: absolute; inset: 0; background-size: cover; background-position: center; }
  .frame.av { background: var(--surface-canvas-overlay); }
  .frame .glyph { font-size: 2rem; color: var(--ink-canvas-muted); }
  .caption { display: flex; flex-direction: column; gap: 2px; }
  .caption .lbl { font-family: var(--font-display); font-size: 1.15rem; font-weight: 600; line-height: 1.1; color: var(--ink-canvas-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .caption .cnt { font-family: var(--font-mono); font-size: 0.68rem; color: var(--ink-canvas-secondary); }
  .plate.add { border-style: dashed; justify-content: center; }
  .add-frame { border: 1px dashed var(--border-canvas-emphasis); }
  .plate[draggable="true"] { cursor: grab; }
  .plate[draggable="true"]:active { cursor: grabbing; }
  /* Drag-to-reorder feedback (canvas): dragged plate dims; drop target shows an insert-before bar. */
  .plate.dragging { opacity: 0.4; }
  .plate.over { border-color: var(--accent); box-shadow: -4px 0 0 var(--accent); }
  .plate.add.over { border-color: var(--accent); border-style: solid; color: var(--accent); }
  .canvas-legend .lead { color: var(--accent); }

  .zoomctl { position: absolute; bottom: var(--space-5); right: var(--space-5); display: flex; gap: 1px; background: var(--border-canvas); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); overflow: hidden; }
  .zoomctl button { font-family: var(--font-ui); font-size: 1.05rem; cursor: pointer; min-width: 2.25rem; padding: var(--space-2) var(--space-2); background: var(--surface-canvas-raised); color: var(--ink-canvas-primary); border: none; }
  .zoomctl .fit { font-size: var(--text-ui-sm); }
  .zoomctl button:hover { color: var(--accent); }
  .zoomctl .pct { display: inline-flex; align-items: center; justify-content: center; min-width: 3rem; font-family: var(--font-mono); font-size: var(--text-ui-xs); color: var(--ink-canvas-secondary); background: var(--surface-canvas-raised); }
  .hint { position: absolute; bottom: var(--space-5); left: var(--space-6); margin: 0; font-family: var(--font-ui); font-size: var(--text-ui-xs); color: var(--ink-canvas-muted); pointer-events: none; }

  /* 1b list fallback. */
  .list-hint { max-width: 48rem; margin: var(--space-6) auto 0; padding: 0 var(--space-6); font-family: var(--font-ui); font-size: var(--text-ui-sm); color: var(--ink-canvas-secondary); }
  .list { list-style: none; margin: 0; padding: var(--space-4) var(--space-6) var(--space-6); overflow-y: auto; flex: 1; max-width: 48rem; }
  .list li { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
  .list li.dragging { opacity: 0.4; }
  .list li.over { box-shadow: 0 -3px 0 var(--accent); } /* insert-before line */
  .list .grip { cursor: grab; user-select: none; color: var(--ink-canvas-muted); font-size: 1.15rem; padding: 0 var(--space-2); background: none; border: none; line-height: 1; }
  .list .grip:hover { color: var(--accent); }
  .list .grip:active { cursor: grabbing; }
  .list li button { display: flex; flex: 1; align-items: center; gap: var(--space-4); text-align: left; cursor: pointer; padding: var(--space-3); background: var(--surface-canvas-raised); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); color: inherit; }
  .list li button:hover { border-color: var(--accent); }
  .list li.end.over button { border-color: var(--accent); border-style: solid; color: var(--accent); }
  .li-order { font-family: var(--font-mono); font-size: var(--text-ui-xs); color: var(--accent); min-width: 1.5rem; }
  .li-thumb { width: 3rem; height: 2.25rem; border-radius: var(--radius-sm); background: var(--surface-canvas-overlay) center/cover; display: flex; align-items: center; justify-content: center; }
  .li-thumb .glyph { color: var(--ink-canvas-muted); }
  .li-lbl { flex: 1; font-family: var(--font-display); font-size: 1.2rem; font-weight: 600; color: var(--ink-canvas-primary); }
  .li-cnt { font-family: var(--font-mono); font-size: 0.7rem; color: var(--ink-canvas-secondary); }
  .li-add { font-family: var(--font-ui); font-size: var(--text-ui-sm); color: var(--ink-canvas-secondary); background: none; border: 1px dashed var(--border-canvas-emphasis); border-radius: var(--radius-sm); padding: var(--space-3); cursor: pointer; width: 100%; }
</style>
