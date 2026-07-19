<script lang="ts">
  // The create/import dialog (Archie-51cc, decided by Archie-8482 "Variant A — one scrimmed dialog,
  // three in-surface expanding paths"). Replaces the old New-exhibit grid cell's cramped trio (a
  // title field + a hidden folder input + `window.prompt` for IIIF) with ONE entry point: a
  // three-card chooser that expands the picked path IN PLACE (others disappear; `‹ Back` returns to
  // the chooser without closing the dialog) — ported from prototypes/create-surface/{app.js,styles.css},
  // which the user reviewed and approved. This component is UI only: every actual ingest is one of
  // the three callbacks below, already wired to ingest-flows.ts by App.svelte/LibraryHome.svelte —
  // no new ingest logic lives here (see create-exhibit-dialog.ts / folder-drop.ts for the supporting
  // pure/DOM helpers, which likewise only orchestrate existing ingest-flows.ts / iiif-import.ts /
  // folder-import.ts exports).
  //
  // Scrim/dismissal (CONTEXT.md → Surfaces): via the shared modality helper (Archie-5968) — scrim-click
  // and Esc both close the WHOLE dialog in one action (the in-surface `‹ Back` link is the return-to-
  // chooser affordance, NOT an Esc rung). No close-confirmation guard (autosave makes dismissal lossless);
  // a mid-flight IIIF check cancels cleanly on close or supersede — iiifToken discards its result AND
  // iiifAbort stops the actual network request. Focus trap + return are the helper's, not hand-rolled.
  //
  // Single-scrim invariant: this component does NOT close other surfaces itself (it doesn't know about
  // them) — the helper's `presentScrim` REPLACES whatever scrimmed surface was open (an open PropsDrawer)
  // the moment this dialog mounts, so opening it structurally closes the drawer. That is the ONE mechanism:
  // LibraryHome's openers no longer hand-close the other surface (removed as redundant, Archie-5968).
  import { tick } from "svelte";
  import { lngLatToPixel, pixelToLngLat, type XyzTileSource } from "@render/core";
  import {
    type CreateSurfaceScope, type IiifStatus, type ManifestPreview, type PickerRow,
    surfaceTitle, createActionLabel, offersStartEmpty, offersMap, offersLink,
    pickedFromFiles, emptyPathValid, folderPathValid, iiifPathValid, looksLikeUrl, previewManifest,
    folderTitleFieldApplies, iiifTitleFieldApplies, prefillTitle, linkPathValid,
    routeCollectionPreview, checkedCount, selectedRefs, setAllChecked,
    hydrateRowLabels, skipNote, skipDetail,
    summarizeImport, type ImportSummary,
  } from "./create-exhibit-dialog.js";
  import type { CollectionPreview, CollectionImportOutcome } from "./ingest-flows.js";
  import type { DiscoveredManifest, TraverseSkip } from "./collection-import.js";
  import type { ManifestPlan } from "./iiif-import.js";
  import { summarizeFolderFiles, folderGroupCount, flattenedRelativePaths, type FolderSummary } from "./folder-import.js";
  import { readDroppedFolderFiles } from "./folder-drop.js";
  // Scrimmed surface via the shared helper (Archie-5968): the hand-rolled Esc handler, Tab-trap, and
  // focus-return this dialog carried are now the ONE modality implementation. `focusFirst` stays — it is
  // surface-specific (re-focus after switching path view / a prefill open), richer than the helper's
  // generic "focus the first control", not part of the modal-open/return contract the helper owns.
  import { scrimmed, trapFocus, modality } from "./modality.svelte";

  let {
    open,
    scope = { kind: "new-exhibit" },
    prefillFolderFiles = null,
    oncreate,
    oncreatefromfolder,
    oncreatefrommanifest,
    previewcollection,
    hydratemanifest,
    oncreatefromcollection,
    onundoimport,
    onaddmap,
    onaddlink,
    onclose,
  }: {
    open: boolean;
    /** Archie-beb6's scope parameter. "new-exhibit" (LibraryHome) mints a new exhibit; "add-to-exhibit"
     *  (Archie-56cf: overview Add-media plate + editor "+ Add media") adds into an existing one and
     *  reveals the Map path. */
    scope?: CreateSurfaceScope;
    /** Page-level folder drop (LibraryHome's drop target) hands the picked files straight in — the
     *  dialog opens already on the folder path with this folder summarized (Variant B's grafted
     *  trait). Read once per open transition; LibraryHome clears it after handing off. */
    prefillFolderFiles?: File[] | null;
    oncreate: (title: string) => void;
    /** Archie-46bf: the folder path's title arg is the editable field's value — present (non-blank)
     *  only in the single-exhibit branch of new-exhibit scope (see folderTitleFieldApplies); undefined
     *  everywhere else, so callers fall back to the folder-derived name unchanged. */
    oncreatefromfolder: (files: File[], title?: string) => void;
    /** Archie-46bf: same title arg as oncreatefromfolder, from the IIIF path's editable field —
     *  present only in new-exhibit scope (see iiifTitleFieldApplies); undefined in add-to-exhibit
     *  scope, where callers fall back to the manifest's own label. */
    oncreatefrommanifest: (url: string, title?: string) => void;
    /** Archie-a9e2 collection ingest (PLAN §3–5), all three OPTIONAL so the dialog degrades to today's
     *  single-manifest behaviour when a caller (or a not-yet-wired scope) omits them. Collection mode is
     *  active ONLY in new-exhibit scope AND when both previewcollection + oncreatefromcollection are
     *  present — App wiring is ticket Archie-cbf6's job. `previewcollection` is ingest-flows'
     *  fetchCollectionPreview (the ONE fetch head); `hydratemanifest` is its fetchManifestPlan, used by the
     *  background label-hydration pool (absent → rows keep URL-segment fallbacks, no hydration). */
    previewcollection?: (url: string, signal?: AbortSignal) => Promise<CollectionPreview>;
    hydratemanifest?: (url: string, opts: { signal?: AbortSignal; onError?: (msg: string) => void }) => Promise<ManifestPlan | null>;
    /** Run the import for the CHECKED refs in COLLECTION ORDER (Archie-cbf6). Gets the hydration `planCache`
     *  (keyed by ref.id) so it never re-fetches a plan pulled at preview time, plus `hooks` — a `signal` the
     *  dialog's Cancel/Esc aborts, and an `onProgress(done,total)` the dialog renders live. Resolves to the
     *  batch outcome (created slugs + skips + cancelled/fatal) the dialog turns into its summary + Undo. The
     *  batch itself runs in the flow layer (App → newExhibitsFromCollection); the dialog owns only the
     *  progress/summary UI. The picker's Create button is disabled when this prop is absent. */
    oncreatefromcollection?: (
      selected: DiscoveredManifest[],
      planCache: Map<string, ManifestPlan>,
      hooks: { signal: AbortSignal; onProgress: (done: number, total: number) => void },
    ) => Promise<CollectionImportOutcome>;
    /** Undo the just-finished import batch (Archie-cbf6, PLAN §8): remove exactly the created slugs in ONE
     *  act (App → lib.removeExhibits). Fired from the summary state's "Undo import" button, which shows only
     *  when the batch committed ≥1 exhibit. Optional — wired alongside oncreatefromcollection. */
    onundoimport?: (slugs: string[]) => void;
    /** The Map path's submit (Archie-56cf — absorbed from the retired AddMapModal). Only fires in
     *  add-to-exhibit scope (offersMap); wired to ingest-flows' addMapObject. */
    onaddmap?: (m: { label: string; tileSource: XyzTileSource }) => void;
    /** The "From a link" path's submit (Archie-32e8 — restores the pre-Archie-56cf URL-add UI onto
     *  ingest-flows.ts's addObject(source, label), which survived that cut ready-made but UI-less). Only
     *  fires in add-to-exhibit scope (offersLink); label is "" when the optional field was left blank —
     *  addObject itself falls back to "Untitled object". */
    onaddlink?: (source: string, label: string) => void;
    onclose: () => void;
  } = $props();

  type PathKind = "empty" | "folder" | "iiif" | "link" | "map";
  let activePath = $state<PathKind | null>(null);
  let dialogEl = $state<HTMLElement | null>(null);

  // "Start empty" path.
  let title = $state("");

  // "From a media folder" path.
  let folderFiles = $state<File[] | null>(null);
  let folderSummary = $state<FolderSummary | null>(null);
  let folderGroups = $state(1);
  let grouping = $state<"per-subfolder" | "flatten">("per-subfolder");
  let dropActive = $state(false);
  let dirEl = $state<HTMLInputElement | null>(null);
  // Archie-46bf: whether the folder path's editable title field applies right now — new-exhibit scope,
  // and not the "several exhibits" grouping choice (see folderTitleFieldApplies' docstring).
  const folderTitleApplies = $derived(folderTitleFieldApplies(scope, folderGroups, grouping));

  // "From a IIIF link" path.
  let iiifUrl = $state("");
  let iiifStatus = $state<IiifStatus>("idle");
  let iiifMessage = $state("");
  let iiifPreview = $state<{ title: string; canvases: number } | null>(null);
  let iiifToken = 0;
  let iiifTimer: ReturnType<typeof setTimeout> | undefined;
  // The in-flight preview fetch, so close/supersede can actually stop the network request (NIT,
  // code review) rather than just discarding its result once it eventually resolves (iiifToken
  // alone already guarantees the DISCARD half of "cancels cleanly").
  let iiifAbort: AbortController | undefined;
  // Archie-46bf: whether the IIIF path's editable title field applies right now — new-exhibit scope only.
  const iiifTitleApplies = $derived(iiifTitleFieldApplies(scope));

  // ── Collection ingest (Archie-a9e2, PLAN §3–5) — the IIIF path's second face in new-exhibit scope. A
  // pasted URL that resolves to a IIIF Collection shows a checkbox picker instead of the single-manifest
  // preview. `iiifCollection` non-null IS "the picker is showing"; over-cap/error reuse the existing
  // invalid-message state (no picker). planCache accumulates background-hydrated plans, handed to the
  // confirm so import never re-fetches. All of it lives under the shared iiifToken/iiifAbort cancel
  // machinery below (a superseding keystroke / close aborts the preview AND the hydration pool).
  let iiifCollection = $state<{ rootTitle: string; rows: PickerRow[]; skips: TraverseSkip[] } | null>(null);
  let hydrationCappedOut = $state(0);
  let planCache = new Map<string, ManifestPlan>();
  // Collection mode is offered ONLY in new-exhibit scope with both wiring props present (App: Archie-cbf6).
  // Absent → the IIIF path stays exactly the single-manifest preview it is today (add-to-exhibit always).
  const collectionModeAvailable = $derived(scope.kind === "new-exhibit" && !!previewcollection && !!oncreatefromcollection);
  const checkedRowCount = $derived(iiifCollection ? checkedCount(iiifCollection.rows) : 0);
  const skipDetailText = $derived(iiifCollection ? skipDetail(iiifCollection.skips) : "");
  // The quiet, never-modal note (PLAN §2): traversal skips plus any labels the hydration cap left on a URL
  // fallback (PLAN §5). Null when there's nothing to say.
  const collectionNote = $derived.by(() => {
    if (!iiifCollection) return null;
    const parts: string[] = [];
    const s = skipNote(iiifCollection.skips);
    if (s) parts.push(s);
    if (hydrationCappedOut > 0) parts.push(`${hydrationCappedOut} label${hydrationCappedOut === 1 ? "" : "s"} not loaded`);
    return parts.length > 0 ? parts.join(" · ") : null;
  });

  // ── Import execution (Archie-cbf6, PLAN §6/§8). Once the picker's Create fires, the dialog leaves the
  // picker and drives the batch through three phases IN PLACE (no new surface — the dialog is already an
  // open, focus-trapped, action-capable scrimmed surface, so progress + summary live here rather than in a
  // toast the app has no action-capable idiom for; see the summary-vs-toast note on submitCollection):
  //   • "running" — "Importing 34 of 520…" + Cancel, live via onProgress. Esc/scrim/× route to Cancel, NOT
  //                 close (requestDismiss), so dismissing never silently orphans a running batch.
  //   • "done"    — the summary (summarizeImport) + "Undo import" (when ≥1 committed) + Done.
  // The batch runs in the flow layer (oncreatefromcollection → App → newExhibitsFromCollection); this state
  // is purely the UI. `importTotal` is captured at submit because the outcome doesn't carry it (a cancel
  // abandons un-fetched slots without recording them, so "X of N" needs N from here).
  type ImportPhase =
    | { kind: "idle" }
    | { kind: "running"; done: number; total: number }
    | { kind: "done"; summary: ImportSummary; createdSlugs: string[] };
  let importPhase = $state<ImportPhase>({ kind: "idle" });
  let importAbort: AbortController | undefined;

  // "From a link" path (Archie-32e8 — restores the pre-Archie-56cf URL-add UI onto ingest-flows.ts's
  // addObject). No fetch/sniff preview here (that's what keeps this path cheap) — addObject itself does
  // the media-type sniff + best-effort image dimension probe once submitted.
  let linkUrl = $state("");
  let linkLabel = $state("");

  // ── "Map" path (Archie-56cf) — absorbed from the retired AddMapModal.svelte. Pick a CURATED basemap
  // (terms permit static-site embedding, attribution baked in), set the bounded extent on a pan/zoom
  // world locator, name it → emits a tileSource descriptor + label to onaddmap (= ingest-flows'
  // addMapObject, the exact flow AddMapModal's submit used). The locator is a pointer-only VISUAL
  // enhancement over the real numeric W/S/E/N inputs + region presets; a11y lives on those (the svg is
  // aria-hidden decoration, its drag dispatched from the role="application" container — no per-svg/rect
  // handlers, so the 3 warnings the old locator carried die with the file rather than being re-absorbed).
  const PROVIDERS = [
    { id: "osm", name: "OpenStreetMap", template: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "© OpenStreetMap contributors", maxZoom: 19 },
    { id: "carto-light", name: "Carto — Light (Positron)", template: "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", attribution: "© OpenStreetMap contributors, © CARTO", maxZoom: 19 },
    { id: "carto-dark", name: "Carto — Dark (Dark Matter)", template: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", attribution: "© OpenStreetMap contributors, © CARTO", maxZoom: 19 },
  ];
  const REGIONS: Array<{ name: string; bounds: [number, number, number, number] }> = [
    { name: "Whole world", bounds: [-180, -85, 180, 85] },
    { name: "Europe", bounds: [-11, 35, 32, 60] },
    { name: "Greater London", bounds: [-0.51, 51.28, 0.33, 51.69] },
    { name: "Contiguous US", bounds: [-125, 24, -66, 50] },
  ];
  const MAP_DEFAULTS = { west: -0.51, south: 51.28, east: 0.33, north: 51.69, maxZoom: 14, locZoom: 8, locCenter: { lng: -0.09, lat: 51.485 } };

  let providerId = $state(PROVIDERS[0]!.id);
  let mapLabel = $state("");
  let west = $state(MAP_DEFAULTS.west), south = $state(MAP_DEFAULTS.south), east = $state(MAP_DEFAULTS.east), north = $state(MAP_DEFAULTS.north);
  let maxZoom = $state(MAP_DEFAULTS.maxZoom);
  let useCustom = $state(false);
  let customTemplate = $state("");
  let customAttribution = $state("");

  const provider = $derived(PROVIDERS.find((p) => p.id === providerId) ?? PROVIDERS[0]!);
  const templateOk = $derived(!useCustom || (/\{z\}/.test(customTemplate) && /\{x\}/.test(customTemplate) && /\{y\}/.test(customTemplate)));
  const mapValid = $derived(east > west && north > south && maxZoom >= 1 && maxZoom <= 22 && templateOk);

  // Locator (mini slippy map): pixel↔lng/lat at a chosen zoom; pan + zoom for precise clamping.
  const S = 320; // locator viewport (px)
  const clampN = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  const ext = (z: number): { tileSize: number; maxZoom: number } => ({ tileSize: 256, maxZoom: z });
  const llToWorld = (lng: number, lat: number, z: number) => lngLatToPixel({ lng, lat }, ext(z));
  const worldToLL = (x: number, y: number, z: number) => pixelToLngLat({ x, y }, ext(z));

  let locZoom = $state(MAP_DEFAULTS.locZoom);
  let locCenter = $state<{ lng: number; lat: number }>({ ...MAP_DEFAULTS.locCenter });

  const origin = $derived.by(() => { const c = llToWorld(locCenter.lng, locCenter.lat, locZoom); return { x: c.x - S / 2, y: c.y - S / 2, z: locZoom }; });
  const screenToLL = (sx: number, sy: number) => worldToLL(origin.x + sx, origin.y + sy, origin.z);
  const llToScreen = (lng: number, lat: number) => { const w = llToWorld(lng, lat, origin.z); return { x: w.x - origin.x, y: w.y - origin.y }; };
  const tiles = $derived.by(() => {
    const z = origin.z, n = 2 ** z;
    const t = useCustom ? customTemplate : provider.template;
    const out: Array<{ key: string; url: string; left: number; top: number }> = [];
    for (let tx = Math.floor(origin.x / 256); tx <= Math.floor((origin.x + S) / 256); tx++) {
      for (let ty = Math.floor(origin.y / 256); ty <= Math.floor((origin.y + S) / 256); ty++) {
        if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
        const url = t.replace("{z}", String(z)).replace("{x}", String(tx)).replace("{y}", String(ty));
        if (/\{[zxy]\}/.test(url)) continue; // unfilled (invalid custom template) → skip
        out.push({ key: `${z}/${tx}/${ty}`, url, left: tx * 256 - origin.x, top: ty * 256 - origin.y });
      }
    }
    return out;
  });
  const boxPx = $derived.by(() => { const nw = llToScreen(west, north); const se = llToScreen(east, south); return { x: nw.x, y: nw.y, w: se.x - nw.x, h: se.y - nw.y }; });

  type DragMode = "move" | "pan" | "nw" | "ne" | "sw" | "se";
  const HANDLES: Array<{ m: DragMode; fx: (b: { x: number; y: number; w: number; h: number }) => number; fy: (b: { x: number; y: number; w: number; h: number }) => number }> = [
    { m: "nw", fx: (b) => b.x, fy: (b) => b.y },
    { m: "ne", fx: (b) => b.x + b.w, fy: (b) => b.y },
    { m: "sw", fx: (b) => b.x, fy: (b) => b.y + b.h },
    { m: "se", fx: (b) => b.x + b.w, fy: (b) => b.y + b.h },
  ];
  let locatorEl = $state<HTMLDivElement | null>(null);
  let drag = $state<{ mode: DragMode; ox: number; oy: number } | null>(null);
  // Hover-only mode (no active drag) — drives the per-element cursor feedback below (review nit: the
  // consolidated single-pointerdown container had dropped the old AddMapModal's per-element cursors —
  // handle/box/background each had their own — when the svg+rects went handler-free/aria-hidden).
  let hoverMode = $state<DragMode | null>(null);
  function ptr(e: MouseEvent): { x: number; y: number } { const r = locatorEl!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function order(): void { if (west > east) [west, east] = [east, west]; if (south > north) [south, north] = [north, south]; }
  function dragDown(mode: DragMode, e: PointerEvent): void { if (!locatorEl) return; e.preventDefault(); locatorEl.setPointerCapture(e.pointerId); const p = ptr(e); drag = { mode, ox: p.x, oy: p.y }; }
  // Shared hit-test (which drag mode a press/hover at p resolves to: handle / box move / pan) — used by
  // both locatorDown (press) and dragMove's hover branch (cursor feedback) so they can never disagree.
  function hitTest(p: { x: number; y: number }): DragMode {
    const b = boxPx;
    for (const h of HANDLES) {
      if (Math.abs(p.x - h.fx(b)) <= 6 && Math.abs(p.y - h.fy(b)) <= 6) return h.m;
    }
    const inBox = p.x >= Math.min(b.x, b.x + b.w) && p.x <= Math.max(b.x, b.x + b.w) && p.y >= Math.min(b.y, b.y + b.h) && p.y <= Math.max(b.y, b.y + b.h);
    return inBox ? "move" : "pan";
  }
  // The ONE pointerdown for the whole locator: hit-test which drag mode the press starts (handle / box
  // move / pan), so the svg + rects stay handler-free decoration (their a11y warnings die). Mirrors the
  // old per-element dispatch exactly — container coords == the inset:0 svg's coords. The zoom buttons AND
  // the z-level badge (review nit: it sat inside the pan hit area, so a click meant to just read the
  // current zoom silently started a pan) are excluded — a press there is not a locator gesture.
  function locatorDown(e: PointerEvent): void {
    if (!locatorEl || (e.target as HTMLElement).closest(".zoom-ctrls, .loc-z")) return;
    dragDown(hitTest(ptr(e)), e);
  }
  function dragMove(e: PointerEvent): void {
    if (!locatorEl) return;
    if (!drag) {
      // Not dragging — just update the hover-driven cursor (skip over the zoom controls/z-badge, which
      // have their own default cursor and aren't locator gestures).
      hoverMode = (e.target as HTMLElement).closest(".zoom-ctrls, .loc-z") ? null : hitTest(ptr(e));
      return;
    }
    const p = ptr(e);
    if (drag.mode === "pan") {
      const c = llToWorld(locCenter.lng, locCenter.lat, origin.z);
      locCenter = worldToLL(c.x - (p.x - drag.ox), c.y - (p.y - drag.oy), origin.z);
      drag.ox = p.x; drag.oy = p.y;
    } else if (drag.mode === "move") {
      const nw = llToScreen(west, north), se = llToScreen(east, south);
      const dx = p.x - drag.ox, dy = p.y - drag.oy;
      const a = screenToLL(nw.x + dx, nw.y + dy), bb = screenToLL(se.x + dx, se.y + dy);
      west = a.lng; north = a.lat; east = bb.lng; south = bb.lat;
      drag.ox = p.x; drag.oy = p.y;
    } else {
      const ll = screenToLL(p.x, p.y);
      if (drag.mode.includes("w")) west = ll.lng;
      if (drag.mode.includes("e")) east = ll.lng;
      if (drag.mode.includes("n")) north = ll.lat;
      if (drag.mode.includes("s")) south = ll.lat;
      order();
    }
  }
  function dragUp(): void { drag = null; }
  function locatorLeave(): void { if (!drag) hoverMode = null; }
  // Per-element cursor feedback (mirrors the retired AddMapModal's `.sel`/`.handle`/background rules,
  // lost when the svg+rects went pointer-events:none/handler-free — see locatorDown's docstring): a
  // handle reads "pointer", the box body "move", the background "grab"/"grabbing" while panning.
  const locatorCursor = $derived.by(() => {
    if (drag) return drag.mode === "pan" ? "grabbing" : drag.mode === "move" ? "move" : "pointer";
    switch (hoverMode) {
      case "nw": case "ne": case "sw": case "se": return "pointer";
      case "move": return "move";
      default: return "grab";
    }
  });
  // Zoom keeping the geographic point under (mx,my) fixed on screen — "zoom at mouse", not at centre.
  function zoomAt(mx: number, my: number, d: number): void {
    const nz = clampN(locZoom + d, 0, Math.min(provider.maxZoom, 18));
    if (nz === locZoom) return;
    const g = screenToLL(mx, my);
    const gw = llToWorld(g.lng, g.lat, nz);
    locZoom = nz;
    locCenter = worldToLL(gw.x - mx + S / 2, gw.y - my + S / 2, nz);
  }
  const zoomBy = (d: number): void => zoomAt(S / 2, S / 2, d); // the ± buttons zoom at centre
  function onWheel(e: WheelEvent): void { e.preventDefault(); const p = ptr(e); zoomAt(p.x, p.y, e.deltaY < 0 ? 1 : -1); }
  function selectCurrent(): void { const nw = screenToLL(0, 0), se = screenToLL(S, S); west = nw.lng; north = nw.lat; east = se.lng; south = se.lat; }
  function fitToBox(): void {
    locCenter = { lng: (west + east) / 2, lat: (south + north) / 2 };
    for (let z = 18; z >= 0; z--) {
      const w = llToWorld(east, south, z).x - llToWorld(west, north, z).x;
      const h = llToWorld(west, south, z).y - llToWorld(east, north, z).y;
      if (w <= S * 0.85 && h <= S * 0.85) { locZoom = z; return; }
    }
    locZoom = 0;
  }
  function applyRegion(b: [number, number, number, number]) { [west, south, east, north] = b; fitToBox(); }

  function submitMap() {
    if (!mapValid) return;
    const base = { kind: "xyz" as const, tileSize: 256, minZoom: 0, maxZoom, bounds: [west, south, east, north] as [number, number, number, number] };
    const tileSource: XyzTileSource = useCustom
      ? { ...base, template: customTemplate.trim(), ...(customAttribution.trim() ? { attribution: customAttribution.trim() } : {}) }
      : { ...base, template: provider.template, attribution: provider.attribution };
    onaddmap?.({ label: mapLabel.trim() || `${provider.name} map`, tileSource });
    close();
  }

  function resetAll() {
    activePath = null;
    title = "";
    folderFiles = null;
    folderSummary = null;
    folderGroups = 1;
    grouping = "per-subfolder";
    iiifUrl = "";
    iiifStatus = "idle";
    iiifMessage = "";
    iiifPreview = null;
    iiifCollection = null;
    hydrationCappedOut = 0;
    planCache = new Map();
    iiifToken++;
    clearTimeout(iiifTimer);
    iiifAbort?.abort();
    iiifAbort = undefined;
    // Import phase (Archie-cbf6) — abort any batch left running from a previous open (belt-and-braces; a
    // running batch is normally cancelled via requestDismiss before close), then clear to idle.
    importAbort?.abort();
    importAbort = undefined;
    importPhase = { kind: "idle" };
    // Link path
    linkUrl = "";
    linkLabel = "";
    // Map path
    providerId = PROVIDERS[0]!.id;
    mapLabel = "";
    west = MAP_DEFAULTS.west; south = MAP_DEFAULTS.south; east = MAP_DEFAULTS.east; north = MAP_DEFAULTS.north;
    maxZoom = MAP_DEFAULTS.maxZoom;
    useCustom = false;
    customTemplate = "";
    customAttribution = "";
    locZoom = MAP_DEFAULTS.locZoom;
    locCenter = { ...MAP_DEFAULTS.locCenter };
    drag = null;
  }

  function applyFolderFiles(files: File[]) {
    folderFiles = files;
    const picked = pickedFromFiles(files);
    folderSummary = summarizeFolderFiles(picked);
    folderGroups = folderGroupCount(picked);
    grouping = "per-subfolder";
    // Archie-46bf: prefill from the folder's name — user edit wins (prefillTitle only overwrites an
    // EMPTY title), so re-picking a folder after typing a custom title doesn't clobber it.
    title = prefillTitle(title, folderSummary.name);
  }

  async function focusFirst() {
    await tick();
    const el = dialogEl?.querySelector<HTMLElement>(".path-card, .field input");
    if (el) el.focus();
    else dialogEl?.focus();
  }

  // Opening (re)seeds every path's transient state — a stale IIIF preview or half-picked folder
  // from a previous open must never bleed into the next one. A page-level folder drop instead seeds
  // straight into the folder path with its summary already computed (skips the dropzone step).
  $effect(() => {
    if (open) {
      resetAll();
      if (prefillFolderFiles && prefillFolderFiles.length > 0) {
        activePath = "folder";
        applyFolderFiles(prefillFolderFiles);
      }
      void focusFirst();
    }
  });

  // Esc/scrim-click both route here through the shared helper (onClose: requestDismiss): the WHOLE dialog
  // closes in one action (the `‹ Back` link is the return-to-chooser affordance, not an Esc rung). No close
  // confirmation — autosave makes it lossless. A mid-flight IIIF check cancels cleanly (discard + abort);
  // focus-return to the opener is the helper's job now.
  function close() {
    clearTimeout(iiifTimer);
    iiifToken++; // discards any in-flight IIIF check's result — the "cancels cleanly" contract
    iiifAbort?.abort(); // and actually stops the network request, not just its result
    onclose();
  }
  // The dismissal fork (Archie-cbf6, §Surfaces dismissal contract). Esc / scrim-click / × all route here.
  // While a batch is RUNNING, dismissing must NOT close-and-orphan it — it aborts the batch instead (same
  // as the Cancel button); the batch then resolves cancelled and the summary shows, from which a second
  // dismiss closes normally. In every other phase (picker, or the finished summary), dismiss closes.
  //
  // Modality contract tension (documented, not currently reachable): the running branch cancels but does NOT
  // flip the parent `open` bool, so this dialog stays mounted. modality's ScrimHandle.onClose is ALSO how a
  // NEWLY-presenting scrimmed surface REPLACES this one (presentScrim fires the incumbent's onClose) — if
  // that fired mid-import it would cancel the batch (correct) yet leave this panel mounted beside the new
  // surface, breaking the single-scrim invariant. It can't happen today: a running import is scrimmed +
  // focus-trapped, so nothing behind it can open another scrimmed surface. If a non-UI trigger ever could,
  // this needs a phase-aware split (distinguish user-dismiss from replace) — a real change, not a one-liner,
  // so it's deliberately left as this note rather than speculative code.
  function requestDismiss() {
    if (importPhase.kind === "running") { cancelImport(); return; }
    close();
  }

  function selectPath(p: PathKind) {
    activePath = p;
    void focusFirst();
  }
  function backToMenu() {
    activePath = null;
    void focusFirst();
  }

  function submitEmpty() {
    if (!emptyPathValid(title)) return;
    oncreate(title.trim());
    close();
  }

  // The flatten choice returns FRESH File instances (never mutates folderFiles in place) — this
  // dialog closes right after submit today, but leaving the picked files' original per-subfolder
  // paths untouched means a future "stay open, try another grouping" tweak can't be bitten by a
  // stale in-place edit.
  function applyFlatten(files: File[]): File[] {
    const paths = flattenedRelativePaths(pickedFromFiles(files));
    return files.map((f, i) => Object.assign(new File([f], f.name, { type: f.type, lastModified: f.lastModified }), { webkitRelativePath: paths[i] }));
  }

  function submitFolder() {
    if (!folderFiles || !folderPathValid(folderSummary, folderTitleApplies, title)) return;
    const files = grouping === "flatten" && folderGroups > 1 ? applyFlatten(folderFiles) : folderFiles;
    oncreatefromfolder(files, folderTitleApplies ? title.trim() : undefined);
    close();
  }

  function submitIiif() {
    if (!iiifPathValid(iiifStatus, iiifTitleApplies, title)) return;
    oncreatefrommanifest(iiifUrl.trim(), iiifTitleApplies ? title.trim() : undefined);
    close();
  }

  function submitLink() {
    if (!linkPathValid(linkUrl)) return;
    onaddlink?.(linkUrl.trim(), linkLabel.trim());
    close();
  }

  function onIiifInput(v: string) {
    iiifUrl = v;
    clearTimeout(iiifTimer);
    iiifAbort?.abort(); // a newer keystroke supersedes any check already in flight (preview AND hydration)
    // Any keystroke invalidates a shown picker and its hydration cache — a new URL is a fresh preview.
    iiifCollection = null;
    hydrationCappedOut = 0;
    planCache = new Map();
    const trimmed = v.trim();
    if (!trimmed) {
      iiifStatus = "idle";
      iiifMessage = "";
      iiifPreview = null;
      iiifToken++;
      return;
    }
    if (!looksLikeUrl(trimmed)) {
      iiifStatus = "invalid";
      iiifMessage = "That doesn't look like a link yet.";
      iiifPreview = null;
      iiifToken++;
      return;
    }
    iiifStatus = "checking";
    iiifMessage = "";
    iiifPreview = null;
    const myToken = ++iiifToken;
    iiifTimer = setTimeout(() => void runIiifCheck(trimmed, myToken), 500);
  }
  // Apply a single-manifest previewManifest result to the manifest-preview state (the pre-Archie-a9e2
  // behaviour) — reused by both the legacy path and the collection route's `manifest` fall-through.
  function applyManifestResult(result: ManifestPreview) {
    iiifCollection = null;
    if (result.status === "valid") {
      iiifStatus = "valid";
      iiifPreview = { title: result.title, canvases: result.canvases };
      // Archie-46bf: prefill from the manifest's label — user edit wins (see applyFolderFiles).
      title = prefillTitle(title, result.title);
    } else {
      iiifStatus = "invalid";
      iiifMessage = result.message;
      iiifPreview = null;
    }
  }
  async function runIiifCheck(url: string, myToken: number) {
    const controller = new AbortController();
    iiifAbort = controller;
    // New-exhibit scope with collection wiring: route through the ONE fetch head (fetchCollectionPreview,
    // Archie-656a). A `manifest` result now CARRIES the parsed plan (Archie-cbf6 / D2), so its title+count
    // render straight from that plan — no second fetch of the same URL via previewManifest.
    if (collectionModeAvailable && previewcollection) {
      const preview = await previewcollection(url, controller.signal);
      if (myToken !== iiifToken) return; // a newer keystroke (or a close) superseded this check
      const route = routeCollectionPreview(preview);
      if (route.kind === "aborted") return; // discard silently — no state change (PLAN §5)
      if (route.kind === "error" || route.kind === "over-cap") {
        applyManifestResult({ status: "invalid", message: route.message });
        return;
      }
      if (route.kind === "manifest") {
        // D2: consume the carried plan instead of re-fetching (was: fall through to previewManifest, a
        // duplicate fetch of a URL fetchCollectionPreview already fetched AND parsed).
        applyManifestResult({ status: "valid", title: route.plan.title, canvases: route.plan.objects.length });
        return;
      }
      if (route.kind === "collection") {
        iiifStatus = "idle";
        iiifMessage = "";
        iiifPreview = null;
        iiifCollection = { rootTitle: route.rootTitle, rows: route.rows, skips: route.skips };
        hydrationCappedOut = 0;
        // Background label hydration (PLAN §5) — fire-and-forget, abort-aware (shares controller.signal),
        // alerts suppressed inside the pool. Mutate the PROXIED rows (via iiifCollection.rows) so in-place
        // label updates stay reactive.
        if (hydratemanifest && iiifCollection) {
          const rows = iiifCollection.rows;
          void hydrateRowLabels(rows, planCache, hydratemanifest, { signal: controller.signal }).then((s) => {
            if (myToken === iiifToken) hydrationCappedOut = s.cappedOut;
          });
        }
        return;
      }
    }
    // Single-manifest preview for add-to-exhibit scope (and any new-exhibit paste without collection
    // wiring): the ONLY path that still fetches via previewManifest. previewManifest itself is untouched
    // (Archie-cbf6 D2) — the collection-mode manifest branch above consumes the carried plan instead.
    const result = await previewManifest(url, controller.signal);
    if (myToken !== iiifToken) return; // a newer keystroke (or a close) superseded this check
    applyManifestResult(result);
  }
  // Collection picker confirm → run the import (Archie-cbf6). Leave the picker for the "running" phase,
  // drive progress live via onProgress, then land on the summary. The dialog stays OPEN across the batch;
  // the summary state (not a toast) carries the outcome + Undo, because the app has no action-capable toast
  // idiom (ctx.alert is a blocking window.alert that can't hold an "Undo" button) and the dialog is already
  // the natural, focus-trapped, action-capable home for it — no new floating chrome invented (§Surfaces).
  async function submitCollection() {
    if (!iiifCollection || !oncreatefromcollection) return;
    const selected = selectedRefs(iiifCollection.rows);
    if (selected.length === 0) return;
    const total = selected.length;
    importAbort = new AbortController();
    importPhase = { kind: "running", done: 0, total };
    try {
      const outcome: CollectionImportOutcome = await oncreatefromcollection(selected, planCache, {
        signal: importAbort.signal,
        onProgress: (done, t) => { if (importPhase.kind === "running") importPhase = { kind: "running", done, total: t }; },
      });
      importPhase = { kind: "done", summary: summarizeImport(outcome, total), createdSlugs: outcome.createdSlugs };
    } catch (e) {
      // The batch (newExhibitsFromCollection) NEVER throws today — it always resolves a summary. This guard
      // is cheap insurance against a future wiring change that could reject: without it, importPhase would
      // stick at "running" forever (an unclosable modal with a dead Cancel). Map any rejection to a fatal
      // summary the user can dismiss. The created slugs are unknown on a throw → empty (so no Undo offered).
      const message = e instanceof Error ? e.message : String(e);
      importPhase = { kind: "done", summary: summarizeImport({ createdSlugs: [], skipped: [], cancelled: false, fatal: message }, total), createdSlugs: [] };
    }
  }
  // Cancel a running import — abort the batch's signal (it checks between jobs/commits, keeps the committed
  // prefix, and resolves cancelled). submitCollection's await then flips to the summary. Also the target of
  // Esc/scrim/× while running (requestDismiss), so dismissing a running batch cancels rather than orphans it.
  function cancelImport() {
    importAbort?.abort();
  }
  // "Undo import" (PLAN §8): remove exactly the batch's created slugs in ONE act (App → lib.removeExhibits),
  // then close. No confirm — this reverses the user's own just-finished action on freshly-minted exhibits
  // they're looking at (matches undo semantics; the two-step confirm guards deleting PRE-EXISTING work, not
  // undoing a fresh import). Shown only when the batch committed ≥1 exhibit.
  function undoImport() {
    if (importPhase.kind !== "done") return;
    onundoimport?.(importPhase.createdSlugs);
    close();
  }
  function selectAllRows(checked: boolean) {
    if (iiifCollection) setAllChecked(iiifCollection.rows, checked);
  }

  function pickFolder() {
    dirEl?.click();
  }
  function onDirChange(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    if (el.files?.length) applyFolderFiles(Array.from(el.files));
    el.value = "";
  }
  async function onDrop(e: DragEvent) {
    e.preventDefault();
    dropActive = false;
    const items = e.dataTransfer?.items;
    if (!items || items.length === 0) return;
    // The walker is itself per-entry tolerant (folder-drop.ts); this catch is the belt-and-braces
    // half (code review S1) — a rejection here must surface a plain-language message, not an
    // unhandled promise rejection and a silently dead drop.
    try {
      const files = await readDroppedFolderFiles(Array.from(items));
      if (files.length > 0) applyFolderFiles(files);
    } catch (err) {
      console.error("Folder drop failed", err);
      window.alert("Couldn't read that folder.");
    }
  }
</script>

{#if open}
  <!-- Sibling scrim + dialog (PropsDrawer/TutorialModal's shape): the panel needs no click-stop
       handler since a click inside it never bubbles to a non-ancestor sibling. -->
  <div class="scrim" role="presentation" onclick={() => modality.dismiss()}></div>
  <div class="dialog" bind:this={dialogEl} role="dialog" aria-modal="true" aria-label={surfaceTitle(scope)} tabindex="-1"
    use:scrimmed={{ onClose: requestDismiss }} onkeydown={trapFocus}>
    {#if importPhase.kind === "running"}
      <!-- Import in flight (Archie-cbf6, PLAN §6). The dialog is committed to the batch: no path chooser,
           just live progress + Cancel. Esc/scrim/× route to Cancel (requestDismiss), never a silent close. -->
      <div class="chooser-head">
        <h2>Importing…</h2>
      </div>
      <div class="import-progress" role="status">
        <span class="ip-spinner" aria-hidden="true"></span>
        <span class="ip-count">Importing {importPhase.done} of {importPhase.total}…</span>
      </div>
      <div class="path-actions">
        <button type="button" class="btn btn-ghost" onclick={cancelImport}>Cancel</button>
      </div>
    {:else if importPhase.kind === "done"}
      <!-- Import summary (Archie-cbf6, PLAN §6/§8): outcome copy + per-failure lines (truncated past 10) +
           "Undo import" (removes exactly the created slugs) when the batch committed anything. -->
      {@const s = importPhase.summary}
      <div class="chooser-head">
        <h2>{s.tone === "success" ? "Import complete" : s.tone === "cancelled" ? "Import cancelled" : s.tone === "fatal" ? "Import stopped" : "Import finished"}</h2>
        <button type="button" class="close-x" onclick={close} aria-label="Close">×</button>
      </div>
      <p class="import-summary" class:is-error={s.tone === "fatal"}>{s.headline}</p>
      {#if s.failures.length > 0}
        <ul class="import-failures">
          {#each s.failures as line}<li>{line}</li>{/each}
          {#if s.overflow > 0}<li class="if-more">…and {s.overflow} more</li>{/if}
        </ul>
      {/if}
      <div class="path-actions">
        {#if s.createdCount > 0 && onundoimport}
          <button type="button" class="btn btn-ghost" onclick={undoImport}>Undo import</button>
        {/if}
        <button type="button" class="btn btn-primary" onclick={close}>Done</button>
      </div>
    {:else if activePath === null}
      <div class="chooser-head">
        <h2>{surfaceTitle(scope)}</h2>
        <button type="button" class="close-x" onclick={close} aria-label="Close">×</button>
      </div>
      <div class="path-cards">
        {#if offersStartEmpty(scope)}
          <button type="button" class="path-card" onclick={() => selectPath("empty")}>
            <span class="glyph" aria-hidden="true">+</span>
            <span class="p-title">Start empty</span>
            <span class="p-desc">Begin with a blank exhibit and add media as you go.</span>
          </button>
        {/if}
        <button type="button" class="path-card" onclick={() => selectPath("folder")}>
          <span class="glyph" aria-hidden="true">⌸</span>
          <span class="p-title">From a media folder</span>
          <span class="p-desc">Point at a folder of images, audio, or video — each file becomes an object, in folder order.</span>
        </button>
        <button type="button" class="path-card" onclick={() => selectPath("iiif")}>
          <span class="glyph" aria-hidden="true">⇲</span>
          <span class="p-title">From a IIIF link</span>
          <span class="p-desc">Paste a IIIF link (from a library or museum site) and Archie fetches its pages for you.</span>
        </button>
        {#if offersLink(scope)}
          <button type="button" class="path-card" onclick={() => selectPath("link")}>
            <span class="glyph" aria-hidden="true">↗</span>
            <span class="p-title">From a link</span>
            <span class="p-desc">Add a picture, audio, or video that lives at a web address — it stays there; Archie only keeps the link.</span>
          </button>
        {/if}
        {#if offersMap(scope)}
          <button type="button" class="path-card" onclick={() => selectPath("map")}>
            <span class="glyph" aria-hidden="true">◎</span>
            <span class="p-title">A map</span>
            <span class="p-desc">Add a world map as a place to annotate — pick a basemap and the area visitors see.</span>
          </button>
        {/if}
      </div>
    {:else}
      <div class="chooser-head">
        <h2>{activePath === "empty" ? "Start empty" : activePath === "folder" ? "From a media folder" : activePath === "iiif" ? "From a IIIF link" : activePath === "link" ? "From a link" : "Add a map"}</h2>
        <button type="button" class="close-x" onclick={close} aria-label="Close">×</button>
      </div>
      <button type="button" class="back-link" onclick={backToMenu}><span aria-hidden="true">‹</span> Back</button>

      {#if activePath === "empty"}
        <div class="field">
          <label class="f-label" for="createTitle">Exhibit title</label>
          <input id="createTitle" type="text" bind:value={title} placeholder="e.g. Herbal quires" autocomplete="off" />
        </div>
        <div class="path-actions">
          <button type="button" class="btn btn-ghost" onclick={close}>Cancel</button>
          <button type="button" class="btn btn-primary" disabled={!emptyPathValid(title)} onclick={submitEmpty}>{createActionLabel(scope)}</button>
        </div>
      {:else if activePath === "folder"}
        {#if folderSummary}
          <div class="folder-summary">
            <span class="fs-icon" aria-hidden="true">⌸</span>
            <span class="fs-text">
              <span class="fs-name">{folderSummary.name}</span>
              <span class="fs-counts">{folderSummary.images} image{folderSummary.images === 1 ? "" : "s"} · {folderSummary.audio} audio · {folderSummary.video} video</span>
            </span>
            <button type="button" class="fs-change" onclick={pickFolder}>Change folder…</button>
          </div>
          {#if folderSummary.total === 0}
            <p class="empty-folder-note">No images, audio, or video found in that folder.</p>
          {:else}
            {#if folderGroups > 1 && scope.kind === "new-exhibit"}
              <!-- Progressive disclosure (Archie-8482): only shown once the folder actually holds
                   media subfolders — a flat folder never sees a choice with nothing to choose between.
                   New-exhibit scope only: per-subfolder split makes SEVERAL exhibits, which is
                   meaningless when adding INTO one exhibit (Archie-56cf) — there, every file lands here. -->
              <fieldset class="grouping-choice">
                <!-- Lead with the outcome, not a subfolder count (code review S2): folderGroups is
                     planFolderImportGroups().length, which also counts a loose-top-level-files group
                     as one — "N subfolders" over-counts whenever loose media sits alongside a real
                     subfolder. "N exhibits" is unambiguous either way. -->
                <legend class="f-label">This will create {folderGroups} exhibits</legend>
                <label class="grouping-option">
                  <input type="radio" name="grouping" checked={grouping === "per-subfolder"} onchange={() => (grouping = "per-subfolder")} />
                  One exhibit per subfolder ({folderGroups})
                </label>
                <label class="grouping-option">
                  <input type="radio" name="grouping" checked={grouping === "flatten"} onchange={() => (grouping = "flatten")} />
                  One exhibit from everything
                </label>
              </fieldset>
            {/if}
            {#if folderTitleApplies}
              <!-- Archie-46bf: restores the approved prototype's editable title (prototypes/create-surface/app.js
                   pathFolderHtml) — hidden only in the "one exhibit per subfolder" branch just above, where a
                   single title is semantically inapplicable (folderTitleFieldApplies). -->
              <div class="field">
                <label class="f-label" for="titleFolder">Exhibit title</label>
                <input id="titleFolder" type="text" bind:value={title} placeholder="e.g. Herbal quires" autocomplete="off" />
                <span class="f-hint">We used the folder's name — change it if you like.</span>
              </div>
            {/if}
          {/if}
        {:else}
          <div
            class="dropzone"
            role="presentation"
            class:dragover={dropActive}
            ondragover={(e) => {
              e.preventDefault();
              dropActive = true;
            }}
            ondragleave={() => (dropActive = false)}
            ondrop={onDrop}
          >
            <span class="dz-title">Drag a folder here</span>
            <span class="dz-or">or</span>
            <button type="button" class="btn btn-ghost" onclick={pickFolder}>Choose a folder</button>
            <span class="dz-hint">Archie sorts images, audio, and video into reading order automatically.</span>
          </div>
        {/if}
        <input bind:this={dirEl} type="file" webkitdirectory style="display:none" aria-label="Choose a folder of media" onchange={onDirChange} />
        <div class="path-actions">
          <button type="button" class="btn btn-ghost" onclick={close}>Cancel</button>
          <button type="button" class="btn btn-primary" disabled={!folderPathValid(folderSummary, folderTitleApplies, title)} onclick={submitFolder}>{createActionLabel(scope)}</button>
        </div>
      {:else if activePath === "iiif"}
        <div class="field" class:has-success={iiifStatus === "valid"} class:has-error={iiifStatus === "invalid"}>
          <label class="f-label" for="iiifUrl">IIIF link</label>
          <input
            id="iiifUrl"
            type="url"
            placeholder="https://…/manifest.json"
            value={iiifUrl}
            oninput={(e) => onIiifInput((e.currentTarget as HTMLInputElement).value)}
            autocomplete="off"
          />
          <span class="f-hint">A IIIF link (from a library or museum site) points at a set of pages Archie can import.</span>
          {#if iiifStatus === "checking"}
            <div class="iiif-status checking"><span class="spinner" aria-hidden="true"></span> Checking that link…</div>
          {:else if iiifStatus === "valid" && iiifPreview}
            <div class="iiif-status valid">Found it.</div>
            <div class="manifest-preview">
              <span class="mp-thumb" aria-hidden="true"></span>
              <span class="mp-text">
                <span class="mp-label">{iiifPreview.title}</span>
                <span class="mp-count">{iiifPreview.canvases} canvas{iiifPreview.canvases === 1 ? "" : "es"}</span>
              </span>
            </div>
          {:else if iiifStatus === "invalid" && iiifMessage}
            <div class="iiif-status invalid" role="alert">{iiifMessage}</div>
          {/if}
        </div>
        {#if iiifCollection}
          <!-- Collection picker (Archie-a9e2, PLAN §3): the pasted URL is a IIIF Collection — pick which of
               its manifests become exhibits. No editable title field here (PLAN §4 — each exhibit takes its
               own manifest label). The Create button emits the checked refs upward; the actual import is
               Archie-cbf6 wires the actual import (progress/summary/undo). -->
          <div class="collection-head">
            <span class="ch-title">{iiifCollection.rootTitle}</span>
            <span class="ch-count">{checkedRowCount} exhibit{checkedRowCount === 1 ? "" : "s"} will be created</span>
          </div>
          {#if collectionNote}
            {#if skipDetailText}
              <!-- Skip-reason detail is a keyboard/SR-reachable disclosure, not a hover-only title
                   (Archie-cbf6 D1 / rev-picker): the per-reason breakdown must be readable without a mouse. -->
              <details class="collection-note">
                <summary>{collectionNote}</summary>
                <p class="cn-detail">{skipDetailText}</p>
              </details>
            {:else}
              <p class="collection-note">{collectionNote}</p>
            {/if}
          {/if}
          <div class="picker-controls">
            <span class="pc-count">{checkedRowCount} of {iiifCollection.rows.length} selected</span>
            <button type="button" class="pc-link" onclick={() => selectAllRows(true)}>Select all</button>
            <span class="pc-sep" aria-hidden="true">·</span>
            <button type="button" class="pc-link" onclick={() => selectAllRows(false)}>Select none</button>
          </div>
          <ul class="picker-list" aria-label="Manifests to import as exhibits">
            {#each iiifCollection.rows as row (row.ref.id)}
              <li>
                <label class="picker-row">
                  <input type="checkbox" bind:checked={row.checked} />
                  <span class="pr-text">
                    <span class="pr-label">{row.label}</span>
                    {#if row.context}<span class="pr-context">{row.context}</span>{/if}
                  </span>
                </label>
              </li>
            {/each}
          </ul>
          <div class="path-actions">
            <button type="button" class="btn btn-ghost" onclick={close}>Cancel</button>
            <button type="button" class="btn btn-primary" disabled={checkedRowCount === 0 || !oncreatefromcollection} onclick={submitCollection}>Create {checkedRowCount} exhibit{checkedRowCount === 1 ? "" : "s"}</button>
          </div>
        {:else}
          {#if iiifTitleApplies && iiifStatus === "valid"}
            <!-- Archie-46bf: restores the approved prototype's editable title (prototypes/create-surface/app.js
                 pathIiifHtml), prefilled from the validated manifest's label once a check succeeds. -->
            <div class="field">
              <label class="f-label" for="titleIiif">Exhibit title</label>
              <input id="titleIiif" type="text" bind:value={title} placeholder="e.g. Herbal quires" autocomplete="off" />
              <span class="f-hint">We used the manifest's label — change it if you like.</span>
            </div>
          {/if}
          <div class="path-actions">
            <button type="button" class="btn btn-ghost" onclick={close}>Cancel</button>
            <button type="button" class="btn btn-primary" disabled={!iiifPathValid(iiifStatus, iiifTitleApplies, title)} onclick={submitIiif}>{createActionLabel(scope)}</button>
          </div>
        {/if}
      {:else if activePath === "link"}
        <!-- "From a link" (Archie-32e8, restoring the pre-Archie-56cf URL-add UI onto ingest-flows.ts's
             addObject) — a URL field + an optional label, no preview: addObject itself sniffs media type
             and best-effort probes image dimensions once submitted. -->
        <div class="field">
          <label class="f-label" for="linkUrl">Link</label>
          <input id="linkUrl" type="url" bind:value={linkUrl} placeholder="https://…/image.jpg" autocomplete="off" />
          <span class="f-hint">Add a picture, audio, or video that lives at a web address — it stays there; Archie only keeps the link.</span>
        </div>
        <div class="field">
          <label class="f-label" for="linkLabel">Label (optional)</label>
          <input id="linkLabel" type="text" bind:value={linkLabel} placeholder="e.g. Herbal folio 12r" autocomplete="off" />
        </div>
        <div class="path-actions">
          <button type="button" class="btn btn-ghost" onclick={close}>Cancel</button>
          <button type="button" class="btn btn-primary" disabled={!linkPathValid(linkUrl)} onclick={submitLink}>{createActionLabel(scope)}</button>
        </div>
      {:else}
        <!-- Map path (Archie-56cf, absorbed from AddMapModal). Basemap + name + bounded extent. The
             pan/zoom locator is a pointer-only VISUAL over the real numeric edges below — keyboard users
             set the area via the presets + W/S/E/N inputs, so the locator's svg is aria-hidden decoration. -->
        <div class="field map-basemap">
          <label class="f-label" for="mapBasemap">Basemap</label>
          <select id="mapBasemap" bind:value={providerId} disabled={useCustom}>
            {#each PROVIDERS as p}<option value={p.id}>{p.name}</option>{/each}
          </select>
          <span class="f-hint">{useCustom ? (customAttribution || "Add attribution below — most providers require it.") : provider.attribution}</span>
        </div>
        <div class="field">
          <label class="f-label" for="mapName">Name</label>
          <input id="mapName" type="text" bind:value={mapLabel} placeholder={`${provider.name} map`} autocomplete="off" />
        </div>
        <fieldset class="extent">
          <legend class="f-label">Area shown to visitors</legend>
          <div class="presets">
            {#each REGIONS as r}<button type="button" onclick={() => applyRegion(r.bounds)}>{r.name}</button>{/each}
            <button type="button" class="preset-action" onclick={selectCurrent} title="Set the area to exactly what the map below shows right now"><span aria-hidden="true">⊡</span> Use view</button>
            <button type="button" onclick={fitToBox} title="Recentre the map below so the whole area fits in view">Fit <span aria-hidden="true">⤢</span></button>
          </div>
          <div class="locator" bind:this={locatorEl} role="application"
            aria-label="Region locator — drag to set the visible area, or type exact edges below"
            style="width:{S}px;height:{S}px" style:cursor={locatorCursor}
            onpointerdown={locatorDown} onpointermove={dragMove} onpointerup={dragUp} onpointercancel={dragUp} onpointerleave={locatorLeave} onwheel={onWheel}>
            <div class="tiles" aria-hidden="true">{#each tiles as t (t.key)}<img src={t.url} alt="" draggable="false" style="left:{t.left}px;top:{t.top}px" />{/each}</div>
            <svg width={S} height={S} aria-hidden="true">
              <rect class="sel" x={boxPx.x} y={boxPx.y} width={Math.max(0, boxPx.w)} height={Math.max(0, boxPx.h)} />
              {#each HANDLES as h}
                <rect class="handle" x={h.fx(boxPx) - 5} y={h.fy(boxPx) - 5} width="10" height="10" />
              {/each}
            </svg>
            <div class="zoom-ctrls">
              <button type="button" onclick={() => zoomBy(1)} aria-label="Zoom in" title="Zoom in">+</button>
              <button type="button" onclick={() => zoomBy(-1)} aria-label="Zoom out" title="Zoom out">−</button>
            </div>
            <span class="loc-z">z{locZoom}</span>
          </div>
          <div class="bounds">
            <label>W<input type="number" step="any" bind:value={west} /></label>
            <label>S<input type="number" step="any" bind:value={south} /></label>
            <label>E<input type="number" step="any" bind:value={east} /></label>
            <label>N<input type="number" step="any" bind:value={north} /></label>
            <label>Max&nbsp;zoom<input type="number" min="1" max="22" bind:value={maxZoom} /></label>
          </div>
          <p class="map-hint">Drag the box to resize · drag the map to move · scroll to zoom · or type exact edges above.</p>
        </fieldset>
        <details class="map-advanced" bind:open={useCustom}>
          <summary>Advanced: custom tile URL</summary>
          <input bind:value={customTemplate} placeholder={"https://…/{z}/{x}/{y}.png"} />
          <input bind:value={customAttribution} placeholder="Attribution (e.g. © Provider)" />
        </details>
        <div class="path-actions">
          <button type="button" class="btn btn-ghost" onclick={close}>Cancel</button>
          <button type="button" class="btn btn-primary" disabled={!mapValid} onclick={submitMap}>{createActionLabel(scope)}</button>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(59, 49, 56, 0.42);
    backdrop-filter: blur(2px);
  }
  .dialog {
    position: fixed;
    z-index: 51;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(640px, 92vw);
    max-height: 86vh;
    overflow-y: auto;
    box-sizing: border-box;
    background: var(--surface-canvas-raised);
    color: var(--ink-canvas-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lift-mid);
    padding: var(--space-6);
  }
  .dialog:focus-visible {
    outline: none;
  }

  .chooser-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }
  .chooser-head h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.4rem;
    font-weight: 400;
  }
  .close-x {
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 1.3rem;
    line-height: 1;
    color: var(--ink-canvas-secondary);
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    transition: color 0.18s ease;
  }
  .close-x:hover {
    color: var(--semantic-error);
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 0 var(--space-4);
    font-family: var(--font-ui);
    font-size: var(--text-ui-sm);
    color: var(--ink-canvas-secondary);
  }
  .back-link:hover {
    color: var(--accent);
  }

  .path-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-4);
  }
  @media (max-width: 640px) {
    .path-cards {
      grid-template-columns: 1fr;
    }
  }
  .path-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    text-align: left;
    padding: var(--space-4);
    min-height: 8.5rem;
    background: var(--surface-canvas-overlay);
    border: 1px solid var(--border-canvas);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
  }
  .path-card:hover,
  .path-card:focus-visible {
    border-color: var(--accent);
    box-shadow: var(--shadow-lift-low);
    transform: translateY(-1px);
  }
  .path-card .glyph {
    width: 2rem;
    height: 2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: 0.9rem;
    color: var(--accent);
    background: var(--accent-muted);
    border-radius: var(--radius-sm);
  }
  .path-card .p-title {
    font-family: var(--font-body);
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--ink-canvas-primary);
  }
  .path-card .p-desc {
    font-family: var(--font-body);
    font-size: 0.82rem;
    line-height: 1.45;
    color: var(--ink-canvas-secondary);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .field .f-label {
    font-family: var(--font-ui);
    font-size: var(--text-ui-md);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-canvas-muted);
  }
  .field input[type="text"],
  .field input[type="url"] {
    width: 100%;
    box-sizing: border-box;
    font-family: var(--font-body);
    font-size: 1rem;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-canvas-raised);
    color: var(--ink-canvas-primary);
    border: 1px solid var(--border-canvas);
    border-radius: var(--radius-sm);
    transition: border-color 160ms ease, box-shadow 160ms ease;
  }
  .field input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-muted);
  }
  .field .f-hint {
    font-family: var(--font-body);
    font-size: 0.78rem;
    color: var(--ink-canvas-secondary);
  }
  .field.has-error input {
    border-color: var(--semantic-error);
  }
  .field.has-success input {
    border-color: var(--semantic-success);
  }

  .dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-8) var(--space-5);
    text-align: center;
    border: 2px dashed var(--border-canvas-emphasis);
    border-radius: var(--radius-md);
    transition: border-color 160ms ease, background 160ms ease;
  }
  .dropzone.dragover {
    border-color: var(--accent);
    background: var(--accent-muted);
  }
  .dropzone .dz-title {
    font-family: var(--font-body);
    font-size: 0.95rem;
    color: var(--ink-canvas-primary);
  }
  .dropzone .dz-or {
    font-family: var(--font-ui);
    font-size: var(--text-ui-md);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-canvas-muted);
  }
  .dropzone .dz-hint {
    font-family: var(--font-body);
    font-size: 0.78rem;
    color: var(--ink-canvas-secondary);
    max-width: 26rem;
  }

  .folder-summary {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4);
    background: var(--surface-canvas-overlay);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
  }
  .folder-summary .fs-icon {
    width: 2.4rem;
    height: 2.4rem;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-muted);
    color: var(--accent);
    border-radius: var(--radius-sm);
    font-size: 1.1rem;
  }
  .folder-summary .fs-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .folder-summary .fs-name {
    font-family: var(--font-body);
    font-weight: 600;
    font-size: 0.95rem;
  }
  .folder-summary .fs-counts {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--ink-canvas-secondary);
  }
  .folder-summary .fs-change {
    margin-left: auto;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--accent-2);
    font-family: var(--font-ui);
    font-size: 0.78rem;
  }
  .folder-summary .fs-change:hover {
    text-decoration: underline;
  }
  .empty-folder-note {
    font-family: var(--font-body);
    font-size: 0.82rem;
    color: var(--semantic-error);
    margin: 0 0 var(--space-4);
  }

  .grouping-choice {
    border: 1px solid var(--border-canvas);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4) var(--space-4);
    margin: 0 0 var(--space-4);
  }
  .grouping-choice legend {
    padding: 0 var(--space-1);
  }
  .grouping-option {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-body);
    font-size: 0.88rem;
    color: var(--ink-canvas-primary);
    padding: var(--space-1) 0;
    cursor: pointer;
  }

  .iiif-status {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-body);
    font-size: 0.82rem;
  }
  .iiif-status.checking {
    color: var(--ink-canvas-secondary);
  }
  .iiif-status.valid {
    color: var(--semantic-success);
  }
  .iiif-status.invalid {
    color: var(--semantic-error);
  }
  .spinner {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid var(--border-canvas-emphasis);
    border-top-color: var(--accent);
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .manifest-preview {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--surface-canvas-overlay);
    border-radius: var(--radius-md);
    margin-top: var(--space-2);
    box-shadow: inset 3px 0 0 var(--semantic-success);
  }
  .manifest-preview .mp-thumb {
    width: 2.6rem;
    height: 3.4rem;
    flex: none;
    border-radius: 4px;
    background: linear-gradient(160deg, #d8cfbd, #b9ae95);
    box-shadow: var(--shadow-lift-low);
  }
  .manifest-preview .mp-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .manifest-preview .mp-label {
    font-family: var(--font-body);
    font-weight: 600;
    font-size: 0.92rem;
  }
  .manifest-preview .mp-count {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--ink-canvas-secondary);
  }

  /* ── Collection picker (Archie-a9e2) — the IIIF path's second face. */
  .collection-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
  }
  .collection-head .ch-title {
    font-family: var(--font-body);
    font-weight: 600;
    font-size: 1rem;
    color: var(--ink-canvas-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .collection-head .ch-count {
    flex: none;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--ink-canvas-secondary);
  }
  .collection-note {
    margin: 0 0 var(--space-2);
    font-family: var(--font-body);
    font-size: 0.78rem;
    color: var(--ink-canvas-secondary);
  }
  /* Skip-detail disclosure (Archie-cbf6 D1): the summary is the quiet note, the detail expands on click/Enter. */
  details.collection-note > summary {
    cursor: pointer;
    list-style-position: inside;
  }
  details.collection-note .cn-detail {
    margin: var(--space-1) 0 0 var(--space-3);
    color: var(--ink-canvas-muted);
  }
  .picker-controls {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
    font-family: var(--font-ui);
    font-size: 0.78rem;
  }
  .picker-controls .pc-count {
    color: var(--ink-canvas-muted);
    margin-right: auto;
  }
  .picker-controls .pc-link {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--accent-2);
    font-family: var(--font-ui);
    font-size: 0.78rem;
    padding: 0;
  }
  .picker-controls .pc-link:hover {
    text-decoration: underline;
  }
  .picker-controls .pc-sep {
    color: var(--ink-canvas-muted);
  }
  .picker-list {
    list-style: none;
    margin: 0 0 var(--space-4);
    padding: var(--space-1);
    max-height: 18rem;
    overflow-y: auto;
    border: 1px solid var(--border-canvas);
    border-radius: var(--radius-md);
    background: var(--surface-canvas-overlay);
  }
  .picker-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .picker-row:hover {
    background: var(--surface-canvas-raised);
  }
  .picker-row input[type="checkbox"] {
    margin-top: 2px;
    flex: none;
  }
  .picker-row .pr-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .picker-row .pr-label {
    font-family: var(--font-body);
    font-size: 0.9rem;
    color: var(--ink-canvas-primary);
    word-break: break-word;
  }
  .picker-row .pr-context {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--ink-canvas-muted);
  }

  /* ── Import progress + summary (Archie-cbf6). */
  .import-progress {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-5) var(--space-4);
    font-family: var(--font-body);
    font-size: 0.95rem;
    color: var(--ink-canvas-primary);
  }
  .ip-spinner {
    width: 16px;
    height: 16px;
    flex: none;
    border-radius: 50%;
    border: 2px solid var(--border-canvas-emphasis);
    border-top-color: var(--accent);
    animation: spin 0.7s linear infinite;
  }
  .import-summary {
    margin: 0 0 var(--space-3);
    font-family: var(--font-body);
    font-size: 0.95rem;
    line-height: 1.5;
    color: var(--ink-canvas-primary);
  }
  .import-summary.is-error {
    color: var(--semantic-error);
  }
  .import-failures {
    list-style: none;
    margin: 0 0 var(--space-4);
    padding: var(--space-2) var(--space-3);
    max-height: 16rem;
    overflow-y: auto;
    border: 1px solid var(--border-canvas);
    border-radius: var(--radius-md);
    background: var(--surface-canvas-overlay);
    font-family: var(--font-body);
    font-size: 0.82rem;
    color: var(--ink-canvas-secondary);
  }
  .import-failures li {
    padding: 2px 0;
    word-break: break-word;
  }
  .import-failures .if-more {
    color: var(--ink-canvas-muted);
    font-style: italic;
  }

  .path-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-3);
    margin-top: var(--space-5);
  }
  .btn {
    font-family: var(--font-ui);
    font-size: var(--text-ui-sm);
    font-weight: 600;
    letter-spacing: 0.02em;
    padding: var(--space-2) var(--space-5);
    cursor: pointer;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    transition: background 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
  }
  .btn-primary {
    background: var(--accent);
    color: var(--ink-on-accent);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
    box-shadow: var(--shadow-lift-low);
  }
  .btn-primary:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .btn-ghost {
    background: var(--surface-canvas-raised);
    color: var(--ink-canvas-primary);
    border-color: var(--border-canvas-emphasis);
  }
  .btn-ghost:hover {
    background: var(--surface-canvas-overlay);
  }

  /* ── Map path (Archie-56cf, absorbed from AddMapModal) — restyled onto the dialog's canvas palette. */
  .map-basemap select {
    width: 100%;
    box-sizing: border-box;
    font-family: var(--font-body);
    font-size: 1rem;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-canvas-raised);
    color: var(--ink-canvas-primary);
    border: 1px solid var(--border-canvas);
    border-radius: var(--radius-sm);
  }
  .map-basemap select:disabled {
    opacity: 0.5;
  }
  .extent {
    border: 1px solid var(--border-canvas);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4) var(--space-4);
    margin: 0 0 var(--space-4);
  }
  .extent legend {
    padding: 0 var(--space-1);
  }
  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .presets button {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    padding: 3px var(--space-3);
    border: 1px solid var(--border-canvas-emphasis);
    border-radius: 999px;
    background: var(--surface-canvas-raised);
    color: var(--ink-canvas-primary);
    cursor: pointer;
  }
  .presets button:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .presets .preset-action {
    margin-left: auto;
  }
  .locator {
    position: relative;
    margin: var(--space-2) auto;
    border: 1px solid var(--border-canvas-emphasis);
    border-radius: var(--radius-sm);
    overflow: hidden;
    touch-action: none;
    background: #aadaff;
    cursor: grab;
  }
  .locator .tiles {
    position: absolute;
    inset: 0;
  }
  .locator .tiles img {
    position: absolute;
    width: 256px;
    height: 256px;
    user-select: none;
    -webkit-user-drag: none;
  }
  .locator svg {
    position: absolute;
    inset: 0;
    pointer-events: none; /* decoration only — the container owns the drag (a11y: real inputs below) */
  }
  .locator .sel {
    fill: var(--accent);
    fill-opacity: 0.2;
    stroke: var(--accent);
    stroke-width: 1.5;
  }
  .locator .handle {
    fill: var(--surface-canvas-raised);
    stroke: var(--accent);
    stroke-width: 1.5;
  }
  .zoom-ctrls {
    position: absolute;
    top: 6px;
    left: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .zoom-ctrls button {
    width: 24px;
    height: 24px;
    font-size: 1rem;
    line-height: 1;
    border: 1px solid var(--border-canvas-emphasis);
    background: rgba(255, 255, 255, 0.92);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: #2a2722;
  }
  .loc-z {
    position: absolute;
    cursor: default; /* press here is inert (excluded from pan-start) — don't promise a grab */
    bottom: 6px;
    left: 6px;
    font: 0.7rem var(--font-mono);
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    padding: 1px 5px;
    border-radius: 3px;
  }
  .bounds {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .bounds label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-body);
    font-size: 0.78rem;
    color: var(--ink-canvas-secondary);
  }
  .bounds input {
    width: 5.5rem;
    font-family: var(--font-body);
    font-size: 0.9rem;
    padding: var(--space-1) var(--space-2);
    background: var(--surface-canvas-raised);
    color: var(--ink-canvas-primary);
    border: 1px solid var(--border-canvas);
    border-radius: var(--radius-sm);
  }
  .map-hint {
    margin: var(--space-2) 0 0;
    font-family: var(--font-body);
    font-size: 0.72rem;
    color: var(--ink-canvas-secondary);
  }
  .map-advanced {
    margin-bottom: var(--space-4);
    font-family: var(--font-body);
    font-size: 0.85rem;
  }
  .map-advanced summary {
    cursor: pointer;
    color: var(--ink-canvas-secondary);
  }
  .map-advanced input {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin-top: var(--space-2);
    font-family: var(--font-body);
    font-size: 0.95rem;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-canvas-raised);
    color: var(--ink-canvas-primary);
    border: 1px solid var(--border-canvas);
    border-radius: var(--radius-sm);
  }
</style>
