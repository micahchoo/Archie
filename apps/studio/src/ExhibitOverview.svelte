<script lang="ts">
  // Exhibit overview — the exhibit's OTHER scale: its Objects laid out as plates in reading order, arranged
  // and browsed. Two modes: a plain scrollable GRID (default) and an explicit LIST, toggled in the header.
  // Click a plate → open that Object. The spatial-canvas mode (a pan/zoom viewport over a CSS-transformed
  // tableau) was RETIRED (SCALE-GALLERY): it persisted NO spatial data — no x/y in the model, tx/ty/z were
  // in-memory session state — and eagerly rendered every plate under one transform, deterring use above
  // ~100 objects. The grid keeps every durable thing the canvas set (reading order via drag-reorder, shared
  // with list) and adds real virtualization (content-visibility per plate) + a scrollbar instead of pan.
  // Narrative SECTION authoring lives in the editor sidebar (NarrativeEditor), not here — this overview is
  // the zoomed-OUT viewing/arranging scale only.
  import type { Snippet } from "svelte";
  import { tick } from "svelte";
  import type { LayoutType, RightsFields, Section } from "@render/core";
  import DetailsEditor from "./DetailsEditor.svelte";
  import PropsDrawer from "./PropsDrawer.svelte";
  import { moveBlock, marqueeHits, START, END, type ClickMods, type PlateRect } from "./overview-selection.js";
  import { viewPrefs, overviewDensityMetrics } from "./view-prefs.svelte.js";
  import { hintSeen, markHintSeen } from "./canvas-first-use.js";
  import { isReorderable, reorderBlockedMessage } from "./reorder-state.js";
  import {
    liftRow, moveRow, moveRowTo, indexOfMoving,
    liftAnnouncement, moveAnnouncement, boundaryAnnouncement, dropAnnouncement, cancelAnnouncement,
    type MoveState,
  } from "./overview-move-mode.js";

  type OverviewObject = { id: string; label: string; source: string; mediaType?: "image" | "sound" | "video" };

  let {
    title,
    layout,
    objects,
    sections = [],
    noteCountOf,
    lastAnnotatedOf,
    thumbFor,
    onopenobject,
    onopenbeat,
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
    selection,
    selectMode,
    onselectmode,
    onselect,
    onmarquee,
    onclear,
    onbulkdelete,
    bulkConfirming,
    onvisible,
    safety,
  }: {
    title: string;
    layout: LayoutType;
    objects: OverviewObject[];
    /** The exhibit's narrative spine (ADR-0016). 0 → show the invitation strip; ≥1 → surface the ordered
     *  spine + the drag-legend disambiguation. Authored in the object editor (§56), surfaced read-only here. */
    sections?: ReadonlyArray<Section>;
    noteCountOf: (objId: string) => number;
    /** Most-recent note timestamp per object (ISO string; "" = none) — the recently-annotated sort key (Phase 2). */
    lastAnnotatedOf: (objId: string) => string;
    /** Resolve an object's thumbnail URL ("" if none — AV/extensionless → placeholder plate). */
    thumbFor: (obj: OverviewObject) => string;
    onopenobject: (objId: string) => void;
    /** Beat deep link (Archie-696d): activate a spine row → editor at that beat's object, Narrative panel
     *  scrolled to the section with a transient highlight (App: navigate + focusSectionId). Distinct from
     *  onopenobject (a plain plate click) because it also carries WHICH section to focus. Only called for
     *  a row whose beat object still exists — see the ns-beat-gone branch below (requirement 5). */
    onopenbeat: (sectionId: string) => void;
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
    // --- Multi-select (Phase 2). Selection state is App-owned (bulk delete / keyboard / future bulk-move);
    // this component reflects it + emits pointer intents. ---
    /** The App-owned selected object ids. */
    selection: Set<string>;
    /** Select-mode ON = checkboxes + click-toggles + background marquee; OFF = click opens, drag pans. */
    selectMode: boolean;
    /** Toggle select-mode (App owns it so the Esc ladder can exit it). */
    onselectmode: () => void;
    /** A plate click intent (App runs the pure reducer over the canonical order). */
    onselect: (id: string, mods: ClickMods) => void;
    /** A marquee result — the ids the rubber-band covered. */
    onmarquee: (ids: string[]) => void;
    /** Clear the selection (the "Clear" action + a background click). */
    onclear: () => void;
    /** Request bulk delete of the selection (two-step inline confirm — arms, then commits). */
    onbulkdelete: () => void;
    /** The bulk-delete confirm is armed (second click / Delete commits) — App-owned so keyboard + button share it. */
    bulkConfirming: boolean;
    /** Report the current VISIBLE (filtered/sorted) object order UP to App, so shift-range and ⌘A operate on
     *  what's on screen — never on filtered-out objects a bulk delete would then remove unseen. */
    onvisible: (orderedIds: string[]) => void;
    /** The shared SafetyState indicator (Archie-c76d) — App owns the save/binding wiring and passes it as a
     *  snippet so it mounts in this header's one save slot, identical to the editor + library headers. */
    safety?: Snippet;
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

  // Grid ↔ List — a persisted VIEW PREFERENCE (CONTEXT.md Navigation § "View preference"), not transient
  // screen state: last choice wins and survives app restarts. Read through the shared view-prefs store so
  // it's the SAME preference everywhere it's set (this toggle is the only writer today; LibraryHome's
  // Exhibits/All-images lens is the other reader/writer of that module). A legacy "canvas" value migrates
  // to "grid" inside view-prefs' loader, so `mode` is only ever "grid" | "list" here.
  const mode = $derived(viewPrefs.overviewMode);
  let gridScroll = $state<HTMLDivElement | null>(null); // grid-mode scroll container — roving-focus + marquee root
  let listRoot = $state<HTMLElement | null>(null); // list-mode's grid — the roving-focus query root there

  // Grid density (SCALE-GALLERY) — a persisted 2-step preference (Comfortable / Compact), read through the
  // shared view-prefs store. The metrics drive the plate min-width AND the content-visibility intrinsic-size
  // estimate together (overviewDensityMetrics returns both, so virtualization can't jank). Applied to GRID
  // mode only; list keeps its one fixed row height (Archie-a9fc: the overview settled on fixed sizes when
  // the old density slider was removed — this discrete toggle is the grid's lighter replacement).
  const density = $derived(viewPrefs.overviewDensity);
  const densityMetrics = $derived(overviewDensityMetrics(density));

  // First-use-only "click to open" hint (canvas-first-use.ts): teaches the open gesture once, then hides
  // permanently after the first plate open. Seeded once at mount from the persisted flag, same idiom as
  // App.svelte's FIRST_ADD_KEY local $state seed. (The pan/zoom legend it used to sit beside was retired
  // with the spatial canvas; drag-to-reorder guidance is a standing hint line, not first-use chrome.)
  let showHint = $state(!hintSeen());

  // --- Toolbar: search / sort (Phase 2). VIEW-only local $state — these never touch the canonical
  // `objects` array (sort is a view, never a reorder — plan :21). `displayObjects` folds filter→sort
  // ONCE; both render blocks iterate it. The density "Size" slider was removed (Archie-a9fc chrome trim,
  // W9+W12 grill): canvas plates and list rows now use ONE fixed size (the former slider midpoint). ---
  let search = $state("");
  let sortMode = $state<"reading" | "name" | "recent">("reading");
  // Reorder is meaningless outside canonical order — a drop index in a filtered/sorted view ≠ canonical
  // index. So drag is live ONLY in reading order with no active search; otherwise the grip/legend say why.
  // Pure predicates live in reorder-state.ts (tested headless) — this $derived is its only caller here,
  // plus the canvas indicator, the list-mode hint, AND the list grip's title all share reorderMessage
  // below (never !reorderable / "clear search & sort" duplicated as separate, driftable copies).
  const reorderable = $derived(isReorderable(sortMode, search));
  // "" while reorderable; otherwise the ACCURATE reason (search-only / sort-only / both — review
  // follow-up: the old fixed "Clear search & sort to reorder" wrongly told a search-only user to also
  // clear a sort they'd never touched).
  const reorderMessage = $derived(reorderBlockedMessage(sortMode, search));
  // The plate/row NUMBER is the canonical reading-order position — stable even when the view is sorted by
  // name/recency (sort is a view, never a reorder), so a sorted plate still shows where it reads.
  const orderIndexOf = $derived(new Map(objects.map((o, i) => [o.id, i])));
  const displayObjects = $derived.by(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? objects.filter((o) => o.label.toLowerCase().includes(q)) : objects;
    if (sortMode === "name") return [...filtered].sort((a, b) => a.label.localeCompare(b.label));
    if (sortMode === "recent") return [...filtered].sort((a, b) => lastAnnotatedOf(b.id).localeCompare(lastAnnotatedOf(a.id))); // MAX modifiedAt desc; "" (none) sorts last
    return filtered; // reading order = canonical
  });
  // Keep App's copy of the visible order current (drives shift-range + ⌘A over what's actually on screen).
  // Report ONLY on a real change: onvisible is a fresh arrow each App render, so an unguarded call would
  // loop (report → App re-render → new arrow → effect re-runs → report …). The id-equality guard stops it.
  let lastReported: string[] = [];
  $effect(() => {
    const ids = displayObjects.map((o) => o.id);
    if (ids.length === lastReported.length && ids.every((id, i) => id === lastReported[i])) return;
    lastReported = ids;
    onvisible(ids);
  });

  // Opening a media item (the plate click / dbl-click gesture the hint teaches) — first successful open
  // dismisses the hint permanently (canvas-first-use.ts). A single choke point so every open call site
  // (plain click, dbl-click, canvas + list) shares one dismissal.
  function openPlate(id: string) {
    if (showHint) { showHint = false; markHintSeen(); }
    onopenobject(id);
  }

  // Plate click routing (spike-0003 §1/§2). Select-mode: click TOGGLES (checkbox), shift ranges, dbl-click
  // opens. Off-mode: the primary gesture is UNBROKEN — plain click opens; ctrl/shift-click is the power
  // path that selects without entering select-mode.
  function onPlateClick(e: MouseEvent, id: string) {
    const mods: ClickMods = { meta: e.metaKey || e.ctrlKey, shift: e.shiftKey };
    if (selectMode) { onselect(id, { meta: !mods.shift, shift: mods.shift }); return; } // plain → toggle, shift → range
    if (mods.meta || mods.shift) { onselect(id, mods); return; }
    openPlate(id);
  }

  // --- Keyboard range-select while selection mode is active (Archie-3b03 requirement 4, applying
  // docs/research/a11y-interactions.md §1 "Multi-select without marquee" — the WAI-ARIA APG Grid
  // pattern's row-selection keys: Shift+Arrow extends, bare Space toggles without moving focus,
  // roving tabindex so exactly ONE plate sits in the page Tab sequence and arrow keys move between
  // them without leaving the grid). Ctrl/Cmd+A is already wired app-wide in App.svelte's
  // onGlobalKey (unconditional on selectMode, guarded by typingInField) — not duplicated here.
  // Space needs NO new code: a plate is a real <button>, so native Space/Enter activation already
  // fires onPlateClick, whose selectMode branch above already treats a plain click as a toggle
  // (`meta: !mods.shift`) — roving tabindex just makes sure that activation lands on the FOCUSED
  // plate. The listener lives on the grid container (.grid / .list), a sibling of the toolbar's
  // search field, not an ancestor of it — so it structurally never sees keys typed there; no
  // typingInField() guard needed. ---
  let roveId = $state<string | null>(null);
  $effect(() => {
    if (!selectMode) { roveId = null; return; } // roving tabindex only applies during selection mode
    if (roveId && displayObjects.some((o) => o.id === roveId)) return; // still on-screen — leave it
    roveId = displayObjects[0]?.id ?? null; // just entered select-mode, or the roved plate got filtered out
  });
  function plateEl(id: string): HTMLElement | null {
    const root = mode === "grid" ? gridScroll : listRoot;
    return root?.querySelector<HTMLElement>(`[data-plate-id="${CSS.escape(id)}"]`) ?? null;
  }
  // Arrow moves the roving focus by one step in DISPLAY order (the same visible/filtered sequence
  // onvisible reports up — never the canonical order, so keyboard nav can't range over
  // filtered-out plates either). Shift held: also fold this id into the selection via the SAME
  // reducer path a literal shift-click uses (onselect's shift branch, applyClick in
  // overview-selection.ts) — one range implementation, not a second copy for the keyboard.
  function moveRove(delta: 1 | -1, extend: boolean) {
    const ids = displayObjects.map((o) => o.id);
    if (ids.length === 0) return;
    const at = roveId ? ids.indexOf(roveId) : -1;
    const next = ids[Math.min(ids.length - 1, Math.max(0, (at === -1 ? 0 : at) + delta))]!;
    roveId = next;
    if (extend) onselect(next, { meta: false, shift: true });
    // Both modes now scroll natively (grid: overflow-y:auto, list: overflow-y:auto), so a plain focus()
    // scrolling an off-screen plate into view is exactly what we want — no preventScroll special-case
    // (that existed only for the retired canvas's hidden-overflow transform panning).
    plateEl(next)?.focus();
  }
  function onGridKeyDown(e: KeyboardEvent) {
    if (!selectMode) return;
    const forward = e.key === "ArrowDown" || e.key === "ArrowRight";
    const backward = e.key === "ArrowUp" || e.key === "ArrowLeft";
    if (!forward && !backward) return;
    e.preventDefault();
    moveRove(forward ? 1 : -1, e.shiftKey);
  }
  // Keep the roving cursor in sync when focus lands on a plate some OTHER way (a mouse click — some
  // browsers focus a clicked button, some don't; either way this is the single source of truth so
  // a following arrow-key press always continues from wherever focus actually is).
  function onPlateFocus(id: string) {
    if (selectMode) roveId = id;
  }

  // Background drag on the grid draws a MARQUEE in select-mode (§2). Pan is gone — the grid scrolls
  // natively — so a background drag has exactly one job now, and only in select-mode (the toggle
  // disambiguates; off-mode the background is inert). Plates handle their own clicks/drags; this fires only
  // on the empty grid background. The rubber-band endpoints are stored in CLIENT coords (getBoundingClientRect
  // space), so marqueeHits — pure, geometry-agnostic — needs no change from the retired canvas: only the
  // overlay's positioning math (which used to subtract the fixed viewport rect) becomes scroll-aware below.
  let marquee = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null); // client coords
  function onBgPointerDown(e: PointerEvent) {
    if (mode !== "grid" || !selectMode) return;
    marquee = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onBgPointerMove(e: PointerEvent) {
    if (!marquee) return;
    marquee = { ...marquee, x1: e.clientX, y1: e.clientY };
  }
  function onBgPointerUp(e: PointerEvent) {
    if (!marquee) return;
    commitMarquee();
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }
  // Hit-test the rubber-band against live plate rects (the pure geometry is marqueeHits; the DOM read stays
  // here). Both the band endpoints and each plate rect are client-space, so scroll position is already baked
  // into the getBoundingClientRect reads — a plate scrolled half out of view hit-tests against its real
  // on-screen box. A near-zero drag (a bare background click in select-mode) clears the selection instead.
  function commitMarquee() {
    const m = marquee; marquee = null;
    if (!m || !gridScroll) return;
    if (Math.abs(m.x1 - m.x0) < 4 && Math.abs(m.y1 - m.y0) < 4) { onclear(); return; }
    const rects: PlateRect[] = [...gridScroll.querySelectorAll<HTMLElement>("[data-plate-id]")].map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.dataset.plateId!, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    });
    onmarquee(marqueeHits(rects, m));
  }
  // The marquee rectangle in the grid's CONTENT coords (for the overlay). The overlay is an absolute child
  // of the scroll container, so it scrolls WITH the plates — its position must be measured from the content
  // origin, i.e. (client coord − container top-left) + current scroll offset. Contrast the retired canvas,
  // whose viewport never scrolled (it panned via transform), so a plain client−rect sufficed there.
  const marqueeRect = $derived.by(() => {
    if (!marquee || !gridScroll) return null;
    const cr = gridScroll.getBoundingClientRect();
    return {
      left: Math.min(marquee.x0, marquee.x1) - cr.left + gridScroll.scrollLeft,
      top: Math.min(marquee.y0, marquee.y1) - cr.top + gridScroll.scrollTop,
      width: Math.abs(marquee.x1 - marquee.x0),
      height: Math.abs(marquee.y1 - marquee.y0),
    };
  });

  // Drag-to-reorder reading order — the overview's REASON TO EXIST (the published Grid display order /
  // Narrative sequence, settable nowhere else; the object rail only navigates). Native HTML5 DnD, working
  // identically in grid + list modes. Emits the new id order; App reorders the canonical objects[] array.
  // Future: section grouping reuses this primitive.
  // START/END sentinels + moveBlock live in overview-selection.ts now (ONE definition, shared with the
  // pure tests). A drag moves the WHOLE selection when the grabbed plate is selected, else just that plate
  // (a 1-element block) — moveBlock preserves canonical relative order and subsumes the old first-position
  // edge case. Drag is inert unless `reorderable` (canonical order, no filter): the handlers guard on it.
  let dragId = $state<string | null>(null);
  let overId = $state<string | null>(null); // drop target — insert BEFORE it; END = append; START = prepend
  function onPlateDragStart(e: DragEvent, id: string) {
    if (!reorderable) { e.preventDefault(); return; }
    dragId = id;
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); }
  }
  function onPlateDragOver(e: DragEvent, id: string) {
    if (!dragId || id === dragId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    overId = id;
  }
  // The block that travels with the drag: the selection if the grabbed plate is in it, else just it.
  const movingIds = () => (dragId && selection.has(dragId) ? selection : new Set(dragId ? [dragId] : []));
  const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);
  function commit(before: string | null) {
    if (!dragId) { overId = null; return; }
    const cur = objects.map((o) => o.id);
    const next = moveBlock(cur, movingIds(), before);
    dragId = null; overId = null;
    if (!sameOrder(cur, next)) {
      onreorder(next); // skip a no-op drop — no spurious persist + folder mirror
    }
  }
  const commitReorder = (beforeId: string | null) => commit(beforeId ?? END);
  const commitToStart = () => commit(START);
  function onDragEnd() { dragId = null; overId = null; }

  // --- Keyboard "move mode" reorder (Archie-f260, docs/research/a11y-interactions.md §1 — the WAI-ARIA APG
  // Grid pattern's rearrangeable-row grammar: the ⠿ grip toggles move mode, arrows move the row, Home/End
  // jump it to an end, Enter/Space drops, Escape cancels — the keyboard twin of the pointer drag above, and
  // its ONLY keyboard path (canvas stays mouse/touch-primary per Archie-a9fc, so this is list-mode only).
  // The pure reducer + announcement grammar live in overview-move-mode.ts (headless-tested). A lift snapshots
  // the canonical order into moveState.order (the list renders THAT while lifted); arrows re-index within the
  // copy so Escape is a pure discard and only a Drop reaches onreorder — same single commit channel the drag
  // uses. The announcement text feeds the one mounted polite live region (#move-live) below. ---
  let moveState = $state<MoveState | null>(null);
  let announce = $state(""); // the live-region text (position announcements); the region stays mounted, text toggles
  const byId = $derived(new Map(objects.map((o) => [o.id, o] as const)));
  // The rows the LIST renders: the working move order while a row is lifted, else the normal display order.
  // (Move mode only ever enters in reading order with no filter — reorderable — so the working order and the
  // display order carry the same set; mapping through byId just re-sequences them.)
  const listRows = $derived(
    moveState ? moveState.order.map((id) => byId.get(id)).filter((o): o is OverviewObject => !!o) : displayObjects,
  );
  async function refocusGrip(id: string) {
    await tick(); // let the reordered rows re-render, then keep focus on the moving row's grip
    listRoot?.querySelector<HTMLElement>(`[data-grip-id="${CSS.escape(id)}"]`)?.focus();
  }
  function dropMove(id: string) {
    if (!moveState) return;
    const dropped = dropAnnouncement(objectLabel(id), moveState);
    const next = moveState.order;
    const cur = objects.map((o) => o.id);
    if (!sameOrder(cur, next)) { onreorder(next); } // same commit path as a drag drop
    moveState = null;
    announce = dropped;
    void refocusGrip(id);
  }
  function cancelMove(id: string, refocus = true) {
    if (!moveState) return;
    announce = cancelAnnouncement(objectLabel(id), moveState); // ORIGIN position — canonical order never changed
    moveState = null;
    if (refocus) void refocusGrip(id); // a blur-driven cancel (focus already leaving) must NOT yank focus back
  }
  // Apply a move, announcing the new position — or, when the move hit an end and did nothing, a DISTINCT
  // "At the top/bottom" so the screen reader still speaks (identical "Moved to position 1" text is silent).
  function applyMove(id: string, next: MoveState) {
    const before = indexOfMoving(moveState!);
    moveState = next;
    announce = indexOfMoving(next) === before ? boundaryAnnouncement(next) : moveAnnouncement(next);
    void refocusGrip(id);
  }
  function onGripKeyDown(e: KeyboardEvent, id: string) {
    if (moveState && moveState.movingId === id) {
      // Lifted: arrows move the row, Home/End jump it, Enter/Space drops, Escape cancels. stopPropagation so
      // the grid container's select-mode roving handler (onGridKeyDown) never also acts on these keys.
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); applyMove(id, moveRow(moveState, -1)); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); applyMove(id, moveRow(moveState, 1)); return; }
      if (e.key === "Home") { e.preventDefault(); e.stopPropagation(); applyMove(id, moveRowTo(moveState, 0)); return; }
      if (e.key === "End") { e.preventDefault(); e.stopPropagation(); applyMove(id, moveRowTo(moveState, moveState.order.length - 1)); return; }
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); dropMove(id); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelMove(id); return; }
      return;
    }
    // Not lifted: Enter/Space lifts (enters move mode) — only when a drag WOULD reorder (reading order, no filter).
    if (e.key === " " || e.key === "Enter") {
      if (!reorderable) return;
      const s = liftRow(objects.map((o) => o.id), id);
      if (!s) return;
      e.preventDefault(); e.stopPropagation();
      // Lifting a DIFFERENT grip while one is already lifted must never silently drop the first lift on the
      // floor: cancel it first (restores its row, announces the cancel), then lift this one.
      if (moveState && moveState.movingId !== id) cancelMove(moveState.movingId, false);
      moveState = s;
      announce = liftAnnouncement(objectLabel(id), s);
      void refocusGrip(id);
    }
  }
  // Focus leaving the grid entirely while a row is lifted (Tab away, click the row pencil, click outside) is an
  // abandon: cancel move mode with its announcement rather than stranding an uncommitted working order on screen.
  // relatedTarget still inside the grid (moving between the grip and its neighbours) is NOT a leave.
  function onGridFocusOut(e: FocusEvent) {
    if (!moveState) return;
    const to = e.relatedTarget as Node | null;
    if (to && listRoot?.contains(to)) return;
    cancelMove(moveState.movingId, false);
  }
  // Exit move mode if the surface changes underneath it (mode switch to canvas, a search/sort that turns
  // reordering off, or the lifted object disappearing) — a silent discard, never a stranded lifted row.
  $effect(() => {
    if (moveState && (mode !== "list" || !reorderable || !objects.some((o) => o.id === moveState!.movingId))) {
      moveState = null;
    }
  });
</script>

<main class="overview">
  <!-- One mounted polite live region for keyboard move-mode position announcements (docs §1). Stays in the
       DOM always (text-toggled, never {#if}-mounted) so AT reliably announces each change (some AT only
       announce a CHANGE to existing content, not a region that appears already-populated). Visually hidden. -->
  <p class="sr-only" role="status" aria-live="polite">{announce}</p>
  <!-- Exhibit-scale header: where you are + the exhibit's reading-intent + the canvas/list switch. -->
  <header>
    <button class="back" onclick={onback}><span aria-hidden="true">←</span> Exhibits</button>
    <div class="titles">
      <p class="eyebrow">Exhibit · {objects.length} {objects.length === 1 ? "media item" : "media items"} · reading order</p>
      <h1>{title}</h1>
      <p class="intent">{LAYOUT_INTENT[layout]}</p>
    </div>
    <span class="spacer"></span>
    <!-- The one save UI (Archie-0b7b / Archie-c76d) — the SAME SafetyState the editor + library headers
         mount, threaded in as a snippet so App keeps the save/binding wiring. Its ⌘S handler is live while
         the overview shows, so ⌘S flushes here too. -->
    {@render safety?.()}
    <!-- The "Exhibit layout" chip is RETIRED (ADR-0016): the reading mode is no longer a picked layout but
         an emergent property of content; the intent line under the title still names what visitors get. -->
    <!-- The ONE "Details" affordance (decision Archie-3e0a, ticket Archie-ebf4): word + ✎, never the
         retired ⓘ. Title leads with "Details" per the copy rule, then names the scope it opens;
         aria-label mirrors it (label-in-name: starts with "Details", then the exhibit) so it doesn't
         collapse to the same accessible name as the per-plate/row pencils elsewhere on this page. -->
    <button class="chip rights" class:set={hasRights} onclick={() => (rightsOpen = true)}
      title="Details — title, description, credit & license for this exhibit"
      aria-label={`Details — ${title && title.trim() ? title : "Exhibit"}`}
      >✎ Details{#if hasRights}<span class="dot">●</span>{/if}</button>
    <div class="viewtoggle" role="group" aria-label="Overview mode">
      <button class:on={mode === "grid"} onclick={() => viewPrefs.setOverviewMode("grid")} title="Scrollable grid">Grid</button>
      <button class:on={mode === "list"} onclick={() => viewPrefs.setOverviewMode("list")} title="Plain list">List</button>
    </div>
  </header>

  <PropsDrawer open={rightsOpen} title="Exhibit details" onclose={() => (rightsOpen = false)}>
    <DetailsEditor title={title} summary={summary ?? ""} rights={rights} scope="exhibit" ontitle={ontitle} onsummary={onsummary} onrights={onrights} {onremove} />
  </PropsDrawer>

  <!-- Organizing toolbar (Phase 2): find (search titles) · sort (a VIEW, never a reorder) · density (grid
       mode only) · select-mode toggle. When something's selected, a distinct tray carries the bulk actions.
       The density toggle is the 2-step Comfortable/Compact control (SCALE-GALLERY, mirroring the viewer
       gallery wall) that replaced Archie-a9fc's removed "Size" slider — a discrete choice, not a slider. -->
  {#if objects.length > 0}
    <div class="toolbar">
      <label class="tb-search">
        <span class="glass" aria-hidden="true">⌕</span>
        <input type="search" placeholder="Search titles" bind:value={search} aria-label="Search media titles" />
      </label>
      <label class="tb-field">
        <span class="tb-lbl">Sort</span>
        <select bind:value={sortMode} aria-label="Sort media items">
          <option value="reading">Reading order</option>
          <option value="name">Name</option>
          <option value="recent">Recently annotated</option>
        </select>
      </label>
      {#if mode === "grid"}
        <!-- Density (grid only): a per-device preference driving the plate min-width AND the virtualization
             intrinsic-size in lockstep (view-prefs overviewDensityMetrics). List mode keeps one fixed row
             height, so it hides this control (same as the viewer wall showing density only in wall view). -->
        <div class="tb-density" role="group" aria-label="Grid density">
          <button type="button" class:on={density === "comfortable"} aria-pressed={density === "comfortable"} onclick={() => viewPrefs.setOverviewDensity("comfortable")}>Comfortable</button>
          <button type="button" class:on={density === "compact"} aria-pressed={density === "compact"} onclick={() => viewPrefs.setOverviewDensity("compact")}>Compact</button>
        </div>
      {/if}
      <!-- Select toggle only — the row itself NEVER morphs (decision Archie-315e / audit W10: the old
           inline "N selected · Remove N · Clear" used to grow here beside Size/Sort). Entering select-mode
           now slides in a DISTINCT bottom tray (.selection-tray below) that carries the bulk actions;
           search/sort/this toggle keep their fixed home regardless of selection state. -->
      <button type="button" class="tb-select" class:on={selectMode} onclick={onselectmode} aria-pressed={selectMode}
        title="Select several media items to reorder or remove together">
        Select
      </button>
    </div>
  {/if}

  <!-- Narrative at the overview scale (staging spec §5). 0 sections → an invitation to start; ≥1 → the
       ordered spine, read-only here (beats are authored on the object canvas, §56 — a row drops into it). -->
  {#if objects.length > 0}
    {#if !hasNarrative}
      <div class="narrative-strip invite">
        <div class="ns-text">
          <p class="ns-eyebrow">Exhibit narrative</p>
          <p class="ns-line">Guide visitors through the media with your writing.</p>
        </div>
        <button class="ns-start" onclick={() => onstartnarrative?.()}><span aria-hidden="true">＋</span> Start the narrative</button>
      </div>
    {:else}
      <div class="narrative-strip spine">
        <p class="ns-eyebrow">Exhibit narrative · {sections.length} {sections.length === 1 ? "section" : "sections"}</p>
        <ol class="ns-spine">
          {#each sections as s, i (s.id)}
            {@const beatObjectExists = objects.some((o) => o.id === s.objectId)}
            <li>
              {#if beatObjectExists}
                <!-- Beat deep link (Archie-696d): real button semantics → keyboard-activable (Enter/Space),
                     real focus ring. Jumps to the editor at this beat's object with the Narrative panel
                     scrolled + highlighted on this section — NOT just "open the media item" anymore. -->
                <button class="ns-beat" onclick={() => onopenbeat(s.id)} title="Open this section in the editor">
                  <span class="ns-n">{i + 1}</span>
                  <span class="ns-title">{s.title || `Section ${i + 1}`}</span>
                  <span class="ns-with">{objectLabel(s.objectId)}</span>
                </button>
              {:else}
                <!-- Requirement 5 (degrade gracefully): the beat's media item was removed but its section
                     wasn't pruned (deleteObjectNotesAndMeta drops the object, not orphaned sections). No
                     sensible editor target exists for it, so the row goes inert rather than link to a
                     nonexistent object — never a button/link, so it's out of the tab order too. -->
                <!-- aria-disabled dropped (code review NIT 2): a role-less div doesn't map it to anything
                     for AT — the visible "Media item removed" text already carries the meaning. -->
                <div class="ns-beat ns-beat-gone" title="This section's media item was removed">
                  <span class="ns-n">{i + 1}</span>
                  <span class="ns-title">{s.title || `Section ${i + 1}`}</span>
                  <span class="ns-with">Media item removed</span>
                </div>
              {/if}
            </li>
          {/each}
        </ol>
      </div>
    {/if}
  {/if}

  {#if mode === "grid"}
    <!-- Reorderability guidance (mirrors .list-hint): the accurate reason drag is blocked (search/sort), or
         the drag instruction. Always-relevant, so it's a standing line, not first-use chrome — the retired
         canvas's dismissible pan/zoom legend + separate reorder-state box collapse into this one line. -->
    <p class="grid-hint">{reorderMessage || (hasNarrative ? "Visitors follow your section order — dragging here sets the fallback grid order." : "Drag a media item to set the reading order.")}</p>
    <!-- Scrollable, virtualized grid (SCALE-GALLERY): a normal overflow-y scroll region, NOT a pan/zoom
         viewport. The container carries only the marquee pointer handlers (select-mode background
         rubber-band); the roving-tabindex keydown lives on the plate BUTTONS (real interactive elements),
         so the APG Grid role stays scoped to the LIST (docs §1). role="application" (parity with the retired
         canvas, which used the same for its pointer handlers) is the honest interactive-surface role that
         also keeps the marquee handlers clear of svelte-a11y's no_static_element_interactions. -->
    <div class="grid-scroll" bind:this={gridScroll}
      role="application" aria-label="Exhibit grid"
      onpointerdown={onBgPointerDown}
      onpointermove={onBgPointerMove}
      onpointerup={onBgPointerUp}
      onpointercancel={onBgPointerUp}>
      <div class="grid" style:--plate-w={densityMetrics.minCol} style:--plate-intrinsic={densityMetrics.intrinsic}>
        <!-- Leading drop zone: the ONLY way to express "insert before the first object" (Archie-1933).
             Inert unless a drag is active and the dragged plate isn't already first. Deliberately OUTSIDE
             the content-visibility scope (a reserved-height sentinel would break the insert-line). -->
        <div class="dropstart" class:armed={dragId && objects[0]?.id !== dragId} class:over={overId === START}
          ondragover={(e) => { if (dragId && objects[0]?.id !== dragId) { e.preventDefault(); overId = START; } }}
          ondrop={(e) => { e.preventDefault(); commitToStart(); }}
          ondragleave={() => { if (overId === START) overId = null; }}
          role="presentation" aria-hidden="true"></div>
        {#each displayObjects as o (o.id)}
          {@const thumb = thumbFor(o)}
          <div class="plate-wrap" class:dragging={dragId === o.id} class:selected={selection.has(o.id)}>
            <button class="plate" class:over={overId === o.id} class:sel-on={selectMode}
              data-plate-id={o.id}
              draggable={reorderable}
              ondragstart={(e) => onPlateDragStart(e, o.id)}
              ondragover={(e) => onPlateDragOver(e, o.id)}
              ondrop={(e) => { e.preventDefault(); commitReorder(o.id); }}
              ondragend={onDragEnd}
              onpointerdown={(e) => e.stopPropagation()}
              onclick={(e) => onPlateClick(e, o.id)}
              ondblclick={() => openPlate(o.id)}
              onfocus={() => onPlateFocus(o.id)}
              onkeydown={onGridKeyDown}
              tabindex={selectMode ? (o.id === roveId ? 0 : -1) : undefined}
              aria-pressed={selectMode ? selection.has(o.id) : undefined}
              title={o.label}>
              {#if selectMode}<span class="checkbox" class:checked={selection.has(o.id)} aria-hidden="true"></span>{/if}
              <span class="order">{(orderIndexOf.get(o.id) ?? 0) + 1}</span>
              <span class="frame" class:av={!thumb}>
                {#if thumb}<span class="img" style={`background-image:url(${thumb})`}></span>{:else}<span class="glyph" aria-hidden="true">{o.mediaType === "video" ? "▶" : "♪"}</span>{/if}
              </span>
              <span class="caption">
                <span class="lbl">{o.label}</span>
                <span class="cnt">{noteCountOf(o.id)} {noteCountOf(o.id) === 1 ? "note" : "notes"}</span>
              </span>
            </button>
            <!-- Per-plate pencil (Archie-79be): edit this media item's details without opening it. A SIBLING
                 of the plate button (no button-in-button); stops pointerdown/click so it neither starts a
                 marquee nor opens the object. The ONE "Details" affordance (Archie-3e0a / Archie-ebf4): tight
                 space, so pencil-alone, visible tooltip always "Details" — .details-pencil (atmosphere.css)
                 is the shared look every card/plate/row pencil uses — but aria-label carries the per-item
                 scope (label-in-name: starts with "Details", then the item) so a grid full of plates stays
                 distinguishable to screen-reader users. -->
            <button class="plate-edit details-pencil" title="Details" aria-label={`Details — ${o.label}`}
              onpointerdown={(e) => e.stopPropagation()} onclick={(e) => { e.stopPropagation(); oneditobject(o.id); }}>✎</button>
          </div>
        {/each}
        <button class="plate add" class:over={overId === END}
          ondragover={(e) => { if (dragId) { e.preventDefault(); overId = END; } }}
          ondrop={(e) => { e.preventDefault(); commitReorder(null); }}
          ondragleave={() => { if (overId === END) overId = null; }}
          onpointerdown={(e) => e.stopPropagation()} onclick={onaddobject}>
          <span class="frame add-frame"><span class="glyph" aria-hidden="true">{dragId ? "↧" : "+"}</span></span>
          <span class="caption"><span class="lbl">{dragId ? "Move to end" : "Add media"}</span></span>
        </button>
      </div>

      <!-- Marquee rubber-band (select-mode background drag). Content-space coords (scrolls with the plates);
           pointer-events off so it never eats the drag it visualizes. -->
      {#if marqueeRect}
        <div class="marquee" aria-hidden="true" style={`left:${marqueeRect.left}px; top:${marqueeRect.top}px; width:${marqueeRect.width}px; height:${marqueeRect.height}px;`}></div>
      {/if}
    </div>
    <!-- First-use "click to open" hint (canvas-first-use.ts): teaches the open gesture once, then hides
         permanently after the first plate open. A sibling under the scroll region so it stays visible. -->
    {#if showHint}
      <p class="hint">Click a media item to open and add notes</p>
    {/if}
  {:else}
    <!-- List mode: the same media in a single vertical column — the most legible place to set sequence, and
         the home of the keyboard move-mode grip. Same drag-to-reorder as the grid. -->
    <p class="list-hint">{reorderMessage || (hasNarrative ? "Visitors follow your section order — dragging here sets the fallback grid order." : "Drag a row by its ⠿ handle to set the reading order.")}</p>
    <!-- The honest APG Grid triple (docs/research/a11y-interactions.md §1): rows-with-interactive-children
         are a Grid, not a Listbox — this container is role="grid", each media row is role="row", and its
         grip / open-button / pencil sit in role="gridcell" cells. It's a <div> (not <ul>): svelte-a11y
         won't allow the widget role 'grid' on a <ul>, and a grid IS the honest structure here anyway (the
         list semantics are subsumed by the grid). `grid` is a widget role, so the roving-tabindex keydown
         (select-mode arrow nav) is honest — retiring the old svelte-ignore. aria-multiselectable + per-row
         aria-selected expose the multi-select state to AT while select-mode is on. -->
    <div class="list" role="grid" aria-label="Media items — reading order"
      aria-multiselectable={selectMode ? true : undefined}
      tabindex="-1"
      bind:this={listRoot} onkeydown={onGridKeyDown} onfocusout={onGridFocusOut}>
      <div class="dropstart-row" class:armed={dragId && objects[0]?.id !== dragId} class:over={overId === START}
        ondragover={(e) => { if (dragId && objects[0]?.id !== dragId) { e.preventDefault(); overId = START; } }}
        ondrop={(e) => { e.preventDefault(); commitToStart(); }}
        ondragleave={() => { if (overId === START) overId = null; }}
        role="presentation" aria-hidden="true"></div>
      {#each listRows as o (o.id)}
        <div role="row" tabindex="-1" class:dragging={dragId === o.id} class:over={overId === o.id} class:selected={selection.has(o.id)}
          class:moving={moveState?.movingId === o.id}
          aria-selected={selectMode ? selection.has(o.id) : undefined}
          ondragover={(e) => onPlateDragOver(e, o.id)}
          ondrop={(e) => { e.preventDefault(); commitReorder(o.id); }}>
          <!-- The reorder handle (docs §1 grip spec): drag with a pointer, OR Enter/Space to enter keyboard
               move mode, then arrows to move, Enter/Space to drop, Escape to cancel — announced by position
               in #move-live above. aria-roledescription names it a reorder handle; aria-pressed reflects the
               lifted state. -->
          <span role="gridcell" class="cell-grip">
            <button type="button" class="grip" class:off={!reorderable} class:lifted={moveState?.movingId === o.id}
              data-grip-id={o.id}
              draggable={reorderable && !moveState} ondragstart={(e) => onPlateDragStart(e, o.id)} ondragend={onDragEnd}
              onkeydown={(e) => onGripKeyDown(e, o.id)}
              aria-roledescription="Reorder handle"
              aria-pressed={moveState?.movingId === o.id}
              title={reorderable ? "Drag, or press Enter to move with the keyboard" : reorderMessage}
              aria-label={moveState?.movingId === o.id
                ? `Moving ${o.label} — arrow keys to move, Enter to drop, Escape to cancel`
                : `Reorder ${o.label}`}>⠿</button>
          </span>
          <span role="gridcell" class="cell-main">
            <button data-plate-id={o.id} onclick={(e) => onPlateClick(e, o.id)} ondblclick={() => openPlate(o.id)}
              onfocus={() => onPlateFocus(o.id)}
              tabindex={selectMode ? (o.id === roveId ? 0 : -1) : undefined}
              aria-pressed={selectMode ? selection.has(o.id) : undefined}>
              {#if selectMode}<span class="checkbox" class:checked={selection.has(o.id)} aria-hidden="true"></span>{/if}
              <span class="li-order">{(orderIndexOf.get(o.id) ?? 0) + 1}</span>
              <span class="li-thumb" class:av={!thumbFor(o)} style={thumbFor(o) ? `background-image:url(${thumbFor(o)})` : ""}>{#if !thumbFor(o)}<span class="glyph" aria-hidden="true">{o.mediaType === "video" ? "▶" : "♪"}</span>{/if}</span>
              <span class="li-lbl">{o.label}</span>
              <span class="li-cnt">{noteCountOf(o.id)} {noteCountOf(o.id) === 1 ? "note" : "notes"}</span>
            </button>
          </span>
          <!-- Per-row pencil (Archie-79be): edit this media item's details without opening it. The ONE
               "Details" affordance (Archie-3e0a / Archie-ebf4): tight space, so pencil-alone, visible
               tooltip always "Details" — .details-pencil (atmosphere.css) is the shared look every
               card/plate/row pencil uses — but aria-label carries the per-item scope (label-in-name:
               starts with "Details", then the item) so a list of rows stays distinguishable to
               screen-reader users tabbing through it. -->
          <span role="gridcell" class="cell-edit">
            <button class="row-edit details-pencil" title="Details" aria-label={`Details — ${o.label}`}
              onclick={(e) => { e.stopPropagation(); oneditobject(o.id); }}>✎</button>
          </span>
        </div>
      {/each}
      <!-- Trailing "add / move-to-end" affordance — a real grid row (role=row > gridcell) rather than a
           role=presentation div holding a focusable button as a direct grid child, so the grid's owned
           structure stays honest (review S3). It doubles as the END drop target for pointer reorder. -->
      <div class="end" role="row" tabindex="-1" class:over={overId === END} ondragover={(e) => { if (dragId) { e.preventDefault(); overId = END; } }} ondrop={(e) => { e.preventDefault(); commitReorder(null); }} ondragleave={() => { if (overId === END) overId = null; }}>
        <span role="gridcell" class="cell-main">
          <button class="li-add" onclick={onaddobject}>{#if dragId}<span aria-hidden="true">↧</span> Move to end{:else}<span aria-hidden="true">+</span> Add media{/if}</button>
        </span>
      </div>
    </div>
  {/if}

  <!-- Selection tray (decision Archie-315e, closes audit W10). The toolbar above NEVER morphs — this is a
       DISTINCT surface that slides in only while select-mode is active ("appears-when-real": the element
       itself is mount/unmount via {#if}, not just opacity-toggled — unlike the always-mounted #move-live
       region above, a toolbar doesn't need that live-region nuance). Entering select-mode (the toolbar toggle, OR starting a
       marquee — background-drag-to-marquee only fires once already in select-mode, so it lands here too)
       shows the tray; Done (same onselectmode as the toolbar toggle) or the app's Esc ladder
       (App.svelte onGlobalKey "Phase 2 rungs": clears the selection first, THEN exits select-mode) leaves
       it. Two-step inline Remove confirm is unchanged (DetailsEditor idiom — bulkConfirming is App-owned so
       the keyboard Delete/⌫ path and this button share one guard). role="toolbar" — a labelled control
       group, not a status announcement (the live count uses aria-live on its own span). -->
  <!-- selectMode OR a live off-mode selection (⌘A / ctrl-click power path): the tray is the
       two-step Remove confirm's ONLY UI — without it an off-mode ⌫⌫ would bulk-delete with
       zero visible confirmation. -->
  {#if selectMode || selection.size > 0}
    <div class="selection-tray" role="toolbar" aria-label="Selection actions">
      <span class="tray-count" aria-live="polite">{selection.size} selected</span>
      <button type="button" class="tray-remove" class:confirming={bulkConfirming} onclick={onbulkdelete} disabled={selection.size === 0}>
        {bulkConfirming ? `Confirm — remove ${selection.size} ${selection.size === 1 ? "item" : "items"} & their notes` : `Remove ${selection.size}`}
      </button>
      <button type="button" class="tray-clear" onclick={onclear} disabled={selection.size === 0}>Clear</button>
      <!-- Off-mode (⌘A / ctrl-click) the tray shows without selectMode: Done then means
           "dismiss this selection" (clear), not "toggle select mode ON". -->
      <button type="button" class="tray-done" onclick={() => (selectMode ? onselectmode() : onclear())}>Done</button>
    </div>
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
  /* A row whose beat object was removed (requirement 5): inert, not a link — dimmed + no pointer/hover
     affordance, so it reads as "can't act on this" rather than a broken/silent click. */
  .ns-beat-gone { cursor: default; opacity: 0.5; }
  .ns-beat-gone:hover { background: transparent; }
  .ns-beat-gone .ns-with { font-style: italic; }

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

  /* Density toggle (grid only) — the 2-step Comfortable/Compact segmented control, matching the .viewtoggle
     look so the toolbar reads as one family. */
  .tb-density { display: inline-flex; border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); overflow: hidden; }
  .tb-density button { font-family: var(--font-ui); font-size: var(--text-ui-xs); text-transform: uppercase; letter-spacing: 0.12em; cursor: pointer; padding: 6px var(--space-3); background: transparent; color: var(--ink-canvas-muted); border: none; transition: color 160ms ease, background 160ms ease; }
  .tb-density button.on { background: var(--accent-muted); color: var(--ink-canvas-primary); box-shadow: inset 0 -2px 0 var(--accent); }

  /* Grid mode: a plain scrollable region (NOT a pan/zoom viewport) holding plates that flow, wrap, and
     scroll vertically. content-visibility per plate (below) virtualizes off-screen plates so large exhibits
     stay cheap — the retired canvas rendered every plate eagerly under one CSS transform. */
  .grid-scroll { position: relative; flex: 1; min-height: 0; overflow-y: auto; padding: var(--space-6); background: var(--focal-bloom); }
  /* Flex-wrap of fixed-width plates; --plate-w (density) sets the width, so a Compact column packs more per
     row. flex-start (not centre) reads as a browsable grid, not a small centred cluster. */
  .grid { display: flex; flex-wrap: wrap; gap: var(--space-6); align-content: flex-start; }
  /* Reorder guidance — a quiet standing line above the grid (mirrors .list-hint); the accurate blocked
     reason (search/sort) or the drag instruction. Replaces the retired canvas legend + reorder-state box. */
  .grid-hint { max-width: 100%; margin: var(--space-4) var(--space-6) 0; padding: 0; font-family: var(--font-ui); font-size: var(--text-ui-sm); text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-canvas-muted); }

  .plate { position: relative; display: flex; flex-direction: column; gap: var(--space-2); width: var(--plate-w, 12.5rem); cursor: pointer; text-align: left; padding: var(--space-3); background: var(--surface-canvas-raised); border-radius: var(--radius-md); box-shadow: var(--shadow-lift-low); transition: transform 180ms ease, box-shadow 180ms ease; }
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
  /* Drag-to-reorder feedback (grid): dragged plate dims; drop target shows a quiet signal insert-before bar. */
  .plate-wrap.dragging { opacity: 0.4; } /* dim the whole wrapper (plate + pencil) while it's the drag source */
  .plate.over { box-shadow: var(--shadow-lift-low), -4px 0 0 var(--accent); }
  /* Per-plate pencil (Archie-79be): a quiet glyph over the plate's top-right corner. The wrapper is both the
     flex/drag child AND the positioning context. Faint at rest (still visible on touch), bright on hover/focus.
     PERF (SCALE-GALLERY): content-visibility skips layout/paint/decode of off-screen plates in a large grid —
     the same treatment the list rows and GalleryWall's `.wall > li` use. Explicit width (from --plate-w) keeps
     wrapping stable while skipped; contain-intrinsic-size reserves the plate height (--plate-intrinsic) so the
     scrollbar never jumps. Both come from the density metrics IN LOCKSTEP (view-prefs), so a narrower Compact
     column always pairs with a shorter estimate. */
  .plate-wrap { position: relative; width: var(--plate-w, 12.5rem); content-visibility: auto; contain-intrinsic-size: auto var(--plate-intrinsic, 15.5rem); }
  /* Position + idle-visibility only — the pencil's own look is the shared .details-pencil
     (atmosphere.css), so it's identical to the LibraryHome card pencil and the list-row pencil below. */
  .plate-edit {
    position: absolute; top: var(--space-2); right: var(--space-2); z-index: 1;
    opacity: 0.5;
  }
  .plate-wrap:hover .plate-edit, .plate-wrap:focus-within .plate-edit { opacity: 1; }
  .plate-edit:focus-visible { opacity: 1; }
  .plate.add.over { border-color: var(--accent); border-style: solid; color: var(--accent); }
  /* Leading "insert before first" drop zone (grid): a thin column that only takes space while armed; shows
     the same accent insert bar as a plate's .over state. Not virtualized (no content-visibility) — a
     reserved-height sentinel would break the insert-line. */
  .dropstart { width: 0; align-self: stretch; border-radius: var(--radius-sm); transition: width 120ms ease; }
  .dropstart.armed { width: 1.5rem; border: 1px dashed var(--border-canvas-emphasis); }
  .dropstart.over { border-color: var(--accent); border-style: solid; box-shadow: 4px 0 0 var(--accent); }

  /* First-use "click to open" hint — a quiet line under the grid (in normal flow, always visible). */
  .hint { margin: var(--space-3) var(--space-6) var(--space-5); font-family: var(--font-ui); font-size: var(--text-ui-xs); text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-canvas-muted); pointer-events: none; }

  /* List mode. */
  .list-hint { max-width: 48rem; margin: var(--space-6) auto 0; padding: 0 var(--space-6); font-family: var(--font-ui); font-size: var(--text-ui-sm); text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-canvas-muted); }
  .list { list-style: none; margin: 0; padding: var(--space-4) var(--space-6) var(--space-6); overflow-y: auto; flex: 1; max-width: 48rem; }
  .list > div { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
  /* PERF (SCALE-GALLERY Phase 1.3): skip layout/paint/decode of off-screen rows in a large list — the
     same treatment the Viewer's ObjectGrid uses (ObjectGrid.svelte). `auto` remembers each row's real
     height after first render so the scrollbar never jumps; the fixed estimate covers never-seen rows.
     Scoped OFF the zero-height drop sentinels (dropstart-row / end) — reserving a row's height for them
     would break the insert-line affordance. */
  /* One fixed row height (Archie-a9fc chrome trim retired the density slider that used to feed this via
     --row-h; 3.3rem is the former slider's midpoint value). */
  .list > div:not(.dropstart-row):not(.end) { content-visibility: auto; contain-intrinsic-size: auto 3.3rem; }
  /* :not(.row-edit) — the row-open button gets the fixed row height, but the trailing Details pencil
     must stay the shared .details-pencil 1.85rem square (review fix: min-height was beating its height). */
  .list > div:not(.dropstart-row):not(.end) button:not(.row-edit) { min-height: 3.3rem; box-sizing: border-box; }
  .list > div.dragging { opacity: 0.4; }
  .list > div.over { box-shadow: 0 -3px 0 var(--accent); } /* insert-before line */
  /* Leading "insert before first" drop zone (list): collapsed until a drag is active. */
  .list > div.dropstart-row { height: 0; margin: 0; padding: 0; border-radius: var(--radius-sm); transition: height 120ms ease; }
  .list > div.dropstart-row.armed { height: var(--space-4); }
  .list > div.dropstart-row.over { box-shadow: 0 3px 0 var(--accent); }
  /* APG Grid triple (Archie-f260): the grip / open / pencil buttons now sit in role="gridcell" span cells.
     The cells carry the row's flex layout (the open cell grows, the grip + pencil cells size to content) so
     the inner buttons keep their existing looks unchanged — this is structure/ARIA only, not a redesign. */
  .list > div .cell-main { display: flex; flex: 1 1 auto; min-width: 0; }
  .list > div .cell-grip, .list > div .cell-edit { display: inline-flex; flex: 0 0 auto; align-items: center; }
  .list .grip { cursor: grab; user-select: none; color: var(--ink-canvas-muted); font-size: 1.15rem; padding: 0 var(--space-2); background: none; border: none; line-height: 1; transition: color 160ms ease; }
  .list .grip:hover { color: var(--ink-canvas-secondary); }
  .list .grip:active { cursor: grabbing; }
  /* Keyboard move-mode (Archie-f260, docs §1): the grip glows accent while lifted, and the whole row carries
     a visible accent outline so a sighted keyboard user sees which row is travelling. Static (no transition)
     so there's nothing for prefers-reduced-motion to suppress. */
  .list .grip.lifted { color: var(--accent); }
  .list > div.moving { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-md); }
  .list > div button { display: flex; flex: 1; align-items: center; gap: var(--space-4); text-align: left; cursor: pointer; padding: var(--space-3); background: var(--surface-canvas-raised); border-radius: var(--radius-md); box-shadow: var(--shadow-lift-low); color: inherit; transition: transform 180ms ease, box-shadow 180ms ease; }
  .list > div button:hover { transform: translateY(-2px); box-shadow: var(--shadow-lift-mid); }
  .list > div.end.over button { border: 1px solid var(--accent); color: var(--accent); }
  .li-order { font-family: var(--font-mono); font-size: var(--text-ui-xs); letter-spacing: 0.14em; color: var(--ink-canvas-muted); min-width: 1.5rem; }
  .li-thumb { width: 3rem; height: 2.25rem; border-radius: var(--radius-sm); background: var(--surface-canvas-overlay) center/cover; display: flex; align-items: center; justify-content: center; }
  .li-thumb .glyph { color: var(--accent-2); }
  .li-lbl { flex: 1; font-family: var(--font-display); font-size: 1.25rem; font-weight: 400; color: var(--ink-canvas-primary); }
  .li-cnt { font-family: var(--font-mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-canvas-muted); }
  /* Per-row pencil (Archie-79be): a trailing quiet glyph — the shared .details-pencil (atmosphere.css)
     look, same as the canvas plate's pencil and the LibraryHome card's. Selector outspecifies
     `.list > div button` (which sets flex:1) so flex:none holds and the open-button keeps the row width;
     `.list > div button:hover` also matches this (it's a button), so transform is explicitly cancelled.
     Review fix: `.list > div .row-edit` (0,2,1) still beats the GLOBAL `.details-pencil` (0,1,0) on every
     property they both set (padding, border-radius, color, transition) and `.list > div .row-edit:hover`
     (0,3,1) beats `.details-pencil:hover` (0,2,0) too — so those contested properties are re-asserted
     here instead of assumed inherited from the shared class, or the row pencil silently reverts to the
     plain list-button look. */
  .list > div .row-edit {
    flex: 0 0 auto; margin-left: var(--space-1);
    padding: 0; min-height: 0; border-radius: var(--radius-sm); color: var(--ink-canvas-secondary);
    transition: opacity 160ms ease, color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  }
  .list > div .row-edit:hover { color: var(--accent); border-color: var(--accent); transform: none; }
  .li-add { font-family: var(--font-ui); font-size: var(--text-ui-sm); text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-canvas-secondary); background: var(--surface-canvas-raised); border: 1px dashed var(--border-canvas-emphasis); border-radius: var(--radius-md); padding: var(--space-3); cursor: pointer; width: 100%; transition: color 160ms ease, border-color 160ms ease; }
  .li-add:hover { color: var(--ink-canvas-primary); border-color: var(--accent); }

  /* --- Organizing toolbar (Phase 2) — one quiet row under the header: find · sort · select. --- */
  .toolbar { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-6); border-bottom: 1px solid var(--border-canvas); flex-wrap: wrap; }
  .tb-search { display: inline-flex; align-items: center; gap: var(--space-2); padding: 4px var(--space-3); background: var(--surface-canvas-raised); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); }
  .tb-search .glass { color: var(--ink-canvas-muted); font-size: 0.9rem; }
  .tb-search input { background: none; border: none; outline: none; color: var(--ink-canvas-primary); font-family: var(--font-ui); font-size: var(--text-ui-sm); width: 11rem; }
  .tb-search input::placeholder { color: var(--ink-canvas-muted); }
  .tb-field { display: inline-flex; align-items: center; gap: var(--space-2); }
  .tb-lbl { font-family: var(--font-ui); font-size: var(--text-ui-xs); text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-canvas-muted); }
  .tb-field select { background: var(--surface-canvas-raised); color: var(--ink-canvas-primary); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); padding: 4px var(--space-2); font-family: var(--font-ui); font-size: var(--text-ui-sm); cursor: pointer; }
  .tb-select { font-family: var(--font-ui); font-size: var(--text-ui-sm); text-transform: uppercase; letter-spacing: 0.14em; cursor: pointer; padding: var(--space-2) var(--space-3); background: var(--surface-canvas-raised); color: var(--ink-canvas-secondary); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); transition: color 160ms ease, border-color 160ms ease, background 160ms ease; }
  .tb-select:hover { color: var(--ink-canvas-primary); border-color: var(--border-canvas-emphasis); }
  .tb-select.on { background: var(--accent-muted); color: var(--ink-canvas-primary); border-color: var(--accent); box-shadow: inset 0 -2px 0 var(--accent); }

  /* Selection tray (Archie-315e / audit W10) — a DISTINCT bottom-centre surface, deliberately NOT part of
     the toolbar's flex flow (the toolbar never morphs — see the .toolbar rule above, unchanged by this
     ticket). A REAL flex child of .overview (last, after the {#if mode}grid/list{/if} block) — NOT a
     position:absolute overlay: .grid-scroll/.list are flex:1, so this sibling's own height comes out of
     THEIR share, reserving real space instead of floating on top of live plate content underneath it
     (verified in-browser: an earlier absolute-overlay version visually covered the last plate row —
     reserved flow space is the fix, matching how bottom bulk-action bars behave in Photos/Drive-shaped
     apps). tray-in plays on every mount (the tray is {#if selectMode}-gated — mount/unmount, not an
     opacity toggle — so "exists only during selection" is structural, not just visual; unlike the
     always-mounted #move-live region above, this is a toolbar of live buttons, not a status announcement,
     so it doesn't need to stay mounted for AT reasons). */
  .selection-tray { align-self: center; display: flex; align-items: center; gap: var(--space-3); margin: var(--space-3) 0 0; padding: var(--space-2) var(--space-3); background: var(--surface-canvas-raised); border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-md); box-shadow: var(--shadow-lift-mid); animation: tray-in 180ms ease; }
  @keyframes tray-in { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .tray-count { font-family: var(--font-mono); font-size: var(--text-ui-xs); letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-canvas-secondary); white-space: nowrap; }
  /* Bulk delete — quiet at rest, warms to the semantic-error fill on the armed second-click guard (DetailsEditor idiom); same two-step semantics as before, just relocated off the toolbar. */
  .tray-remove { font-family: var(--font-ui); font-size: var(--text-ui-sm); cursor: pointer; padding: var(--space-2) var(--space-3); background: var(--surface-canvas-overlay); color: var(--ink-canvas-secondary); border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); transition: color 160ms ease, background 160ms ease, border-color 160ms ease; white-space: nowrap; }
  .tray-remove:hover:not(:disabled) { background: var(--semantic-error); color: var(--ink-on-accent); border-color: transparent; }
  .tray-remove.confirming { background: var(--semantic-error); color: var(--ink-on-accent); border-color: transparent; font-weight: 600; box-shadow: var(--shadow-lift-mid); }
  .tray-remove:disabled { opacity: 0.4; cursor: default; }
  .tray-clear { font-family: var(--font-ui); font-size: var(--text-ui-sm); cursor: pointer; padding: var(--space-2) var(--space-2); background: none; border: none; color: var(--ink-canvas-muted); transition: color 160ms ease; }
  .tray-clear:hover:not(:disabled) { color: var(--accent-2); }
  .tray-clear:disabled { opacity: 0.4; cursor: default; }
  .tray-done { font-family: var(--font-ui); font-size: var(--text-ui-sm); font-weight: 600; cursor: pointer; padding: var(--space-2) var(--space-3); background: var(--accent-muted); color: var(--ink-canvas-primary); border: 1px solid var(--accent); border-radius: var(--radius-sm); transition: background 160ms ease; }
  .tray-done:hover { background: var(--accent); color: var(--ink-on-accent); }

  /* Selected state — a rationed accent ring on the plate/row; the checkbox corner appears in select-mode. */
  .plate-wrap.selected .plate, .list > div.selected button:not(.grip):not(.row-edit) { box-shadow: var(--shadow-lift-low), 0 0 0 2px var(--accent); }
  .checkbox { position: absolute; top: var(--space-2); left: var(--space-2); z-index: 1; width: 1.15rem; height: 1.15rem; border-radius: var(--radius-sm); border: 2px solid var(--border-canvas-emphasis); background: var(--surface-canvas-raised); }
  .checkbox.checked { background: var(--accent); border-color: var(--accent); }
  .checkbox.checked::after { content: "✓"; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: var(--ink-on-accent); }
  .list > div button { position: relative; } /* anchor the row checkbox */
  .plate.sel-on { cursor: default; } /* in select-mode a click toggles, not opens — signal it's not the open gesture */
  .grip.off { opacity: 0.3; cursor: default; }

  /* Marquee rubber-band — a faint accent-tinted rectangle over the canvas while background-dragging in select-mode. */
  .marquee { position: absolute; z-index: 5; pointer-events: none; border: 1px solid var(--accent); background: var(--accent-muted); border-radius: 2px; }

  /* Visually-hidden live region (keyboard move-mode announcements) — present for AT, invisible on screen. */
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
</style>
