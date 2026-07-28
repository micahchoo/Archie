<script lang="ts">
  // Viewer reader island (Phase-2 UI, browser-verify pending). Adopts annomea's read pattern:
  // a 3-state pane (list ⇄ detail) + popup on marker select, over a READ-ONLY OSD canvas. Reads
  // the published heads-page form (toHeadsPage) exactly as a consumer would — no editing.
  // Object-parameterized (Phase-2 Grid): the parent (ExhibitView) supplies which object to read
  // and that object's projected annotations; `onback` returns to the exhibit's object grid.
  import Canvas from "@render/svelte/Canvas.svelte";
  import ResizeDivider from "@render/svelte/ResizeDivider.svelte";
  import type { FrameOverlay } from "@render/svelte";
  import NoteLightbox from "./NoteLightbox.svelte";
  import ReadingSheet from "./ReadingSheet.svelte";
  import ReadingLegend from "./ReadingLegend.svelte";
  import SidebarObjectNav from "./SidebarObjectNav.svelte";
  import NotePopup from "./NotePopup.svelte";
  import Credit from "./Credit.svelte";
  import MetadataRun from "./MetadataRun.svelte";
  import MetadataList from "./MetadataList.svelte";
  import { loadAsideWidth, loadAsideCollapsed, saveAside, type AsideState } from "../aside-persistence.js";
  import { navPosition, navRegionName, navStepName, noteIndexOpenMark } from "../product-copy.js";
  import { stripMarkdown, metadataRows } from "@render/core";
  import { type MarkerStyle, formatZoomRatio, zoomBand } from "@render/svelte";
  import { splitNoteMedia, commentOfAnnotation as commentOf, tagsOfAnnotation as tagsOf, readingIdOf, geoOf, geoCenter, formatLngLat, arrivalPulseIntensity, withArrivalPulse, withZoomBand, type MarkerStyleSpec, type NoteMediaItem, type RightsFields, type W3CAnnotation, type Reading, type TileSourceDescriptor } from "@render/core";

  // Resizable / collapsible reader sidebar (Phase-2 expandability). `asideWidth` is a px OVERRIDE of the
  // responsive clamp() default (null ⇒ default); persisted per the archie.*.v1 metadata idiom. Drag math
  // is headless-tested in @render/core; ResizeDivider is the handle. Collapse = image-first close looking.
  const ASIDE_W_KEY = "archie.readerAsideWidth.v1";
  const ASIDE_COLLAPSED_KEY = "archie.readerAsideCollapsed.v1";
  let asideWidth = $state<number | null>(loadAsideWidth(ASIDE_W_KEY));
  let asideCollapsed = $state<boolean>(loadAsideCollapsed(ASIDE_COLLAPSED_KEY));
  // Expand the open note into the centred reading sheet (Phase-3 focus surface). A BOOLEAN, not a text
  // snapshot: the sheet renders the same `current` note the card does (Archie-dbbc), so there is nothing
  // to copy into it and no way for the two to describe different notes.
  let readingSheet = $state(false);

  let {
    object,
    annotations = [],
    readings = [],
    activeReading = null,
    onreading,
    styleOf,
    frame = null,
    onback,
    rights,
    exhibitRights,
    initialSelected = null,
    initialRegion = null,
    onnotehover,
    onlocus,
    notesHidden = false,
    onhiddenchange,
    onopenfinder,
    siblings,
    currentId,
    onstep,
    onoverview,
    readingCount,
  }: {
    object: { source: string; canvasId: string; label: string; summary?: string; tileSource?: TileSourceDescriptor };
    annotations?: W3CAnnotation[];
    /** The object-level credit/license (Q5; falls back to the exhibit credit upstream). Shown by the label. */
    rights?: RightsFields;
    /** The EXHIBIT's credit/license/metadata (Archie-36e6). A single-object exhibit routes straight
     *  past the grid to this reader, so without this prop the exhibit's requiredStatement — a IIIF
     *  MUST-display — was rendered nowhere in the SPA. Always shown, beside the object's own. */
    exhibitRights?: RightsFields;
    /** The exhibit's Readings (ADR-0007) — drives the canvas legend. Empty = no legend. */
    readings?: Reading[];
    activeReading?: string | null;
    onreading?: (id: string | null) => void;
    /** Per-marker style by annotation id — colours a marker by its Reading. */
    styleOf?: (id: string) => MarkerStyle | undefined;
    /** 7e1f coverage border — the whole-object mark to frame the canvas with (ExhibitView decides
     *  which mark + colour; this island wires onActivate to its own selection + suppresses the
     *  framed mark's overlay rect so it isn't double-drawn). null = no frame. */
    frame?: { markId: string; colour: string } | null;
    onback?: () => void;
    initialSelected?: string | null; // deep-link arrival: land selected on this note (→ fitBounds)
    /** Deep-link sub-region (#/<slug>/a/<id>?xywh=…, Phase 3 / 4.2): the raw xywh fragment VALUE (e.g.
     *  `pixel:100,50,200,80` or `percent:…`) off the note link. When present the camera fits THIS region
     *  instead of the note's default mark bounds — a cite can frame a detail tighter than the whole mark.
     *  null = no region (the note's own bounds drive the camera). */
    initialRegion?: string | null;
    /** Hovering a note in the list solos its mark on the canvas (the legend's hover affordance,
     *  per-note). The host owns the state so the styleOf identity re-mints. null = hover ended. */
    onnotehover?: (id: string | null) => void;
    /** V101 (Archie-99b1): report the DEEPEST rung open here, so ExhibitView can write the address.
     *  Reports the note's raw published id — this island stays ignorant of the address grammar; the
     *  caller converts to a logical id. Null = no note selected (the object itself is the rung). */
    onlocus?: (l: { noteId: string | null; xywh: string | null }) => void;
    /** Hide-all (ReadingLegend declutter): when true the canvas draws no markers — only the SELECTED
     *  note's mark stays, so picking from the list still shows what you chose. The note list is intact. */
    notesHidden?: boolean;
    onhiddenchange?: (hidden: boolean) => void;
    /** A tag chip was clicked (Q-4): open the mode-independent finder pre-scoped with that tag as a
     *  facet. The chips become the discovery affordance everywhere they render. */
    onopenfinder?: (tag: string) => void;
    /** Multi-object exhibit (R4): the sibling objects + this object's id drive a visible stepper pinned
     *  to the sidebar foot. Omitted for single-object / narrative-index readers (no sibling stepping). */
    siblings?: { id: string; label: string }[];
    currentId?: string;
    onstep?: (id: string) => void;
    onoverview?: () => void;
    /** Per-reading note count on THIS object (ExhibitView computes it for the active object) — threaded
     *  straight to the ReadingLegend so each layer shows how many notes it adds to this image. */
    readingCount?: (id: string | null) => number;
  } = $props();

  // Show the sidebar footer only with real siblings AND the wiring to drive it. When present it owns
  // "back to the overview", so the top "← Back to exhibit" would be redundant — suppressed below.
  const objectNav = $derived(
    !!siblings && siblings.length > 1 && !!currentId && !!onstep && !!onoverview,
  );
  // Index of the current object among siblings — drives the CANVAS-CHROME object nav below.
  const navIdx = $derived(siblings ? siblings.findIndex((s) => s.id === currentId) : -1);

  // Archie-01a6 — object nav belongs to the canvas, in BOTH sidebar states.
  //
  // Before: `SidebarObjectNav` held the visible stepper, inside the collapsible aside; collapsing the
  // aside took it away, so a stepper had grown into the NOTE CARD to cover the gap (V65). That control
  // stepped OBJECTS from inside a note — a different noun than its container — and it was reachable
  // only from a state most visitors never enter, which is the more serious half of the finding.
  //
  // Fixing the cause rather than the label: the nav lives where the thing it navigates lives, so it is
  // present whether the aside is open or closed and the note card has nothing to cover for. The card's
  // stepper is gone and `SidebarObjectNav` is now the "Back to Exhibit" footer only — one object nav in
  // the reader at a time, which is also the half of V23 this ticket can honestly move.
  //
  // Stepping here does NOT carry the reading (the old popup stepper's `stepIntoReading` flip-and-read).
  // A control that steps objects steps objects; auto-opening a note on the object it lands on is the
  // note surface making a decision on the reader's behalf, and it is exactly what let a nav affordance
  // and a note card fuse into one thing in the first place.
  const canvasNav = $derived(!!siblings && siblings.length > 1 && !!currentId && !!onstep && navIdx >= 0);
  function stepObject(delta: number) {
    if (!siblings) return;
    const i = navIdx + delta;
    const target = siblings[i]; // bounds-checked below; the local narrows the indexed access for TS
    if (i < 0 || i >= siblings.length || !target) return;
    onstep?.(target.id);
  }
  // NOTE (dba2): the prev/next carousel that occluded the image TOP-CENTER stays lifted out into the
  // persistent top bar (ViewerShell). The canvas nav added here anchors TOP-RIGHT, joining the same
  // reserved `.canvas-chrome-right` flex row as the scale cue (Archie-40fe's model: chrome that shares
  // one anchored row stacks by gap and cannot drift onto its neighbour), so it re-creates neither the
  // top-center occlusion nor a collision with the readout.

  // Descriptive metadata (Archie-b50f) — the OBJECT's own entries, projected to display rows. It joins
  // the sidebar as a TAB beside Notes, not as another stacked slip: the sidebar is already spoken for,
  // and stacking made an expanded long value push the notes list below the fold. `rights` is the same
  // prop the credit line reads (metadata rides RightsFields), so this needs no new data path.
  const metaRows = $derived(metadataRows(rights));
  // The EXHIBIT run: rendered beside the credit stack, NOT folded into the Details tab — Details is the
  // object's own record, and mixing levels there is the drift this ticket is fixing.
  const exhibitMeta = $derived(metadataRows(exhibitRights));
  const hasDetails = $derived(metaRows.length > 0);
  // The reader's CHOICE survives stepping to a sibling object (comparing one field across objects is
  // the reason to open Details at all); `tab` collapses it to Notes whenever this object has no
  // metadata, so a tab can never be selected while its panel doesn't exist.
  const TABS = ["notes", "details"] as const;
  let tabWanted = $state<(typeof TABS)[number]>("notes");
  const tab = $derived<(typeof TABS)[number]>(hasDetails ? tabWanted : "notes");
  let tablistEl = $state<HTMLElement | null>(null);
  // APG tabs, automatic activation: arrows/Home/End move focus AND selection (both panels are cheap
  // to render, so there's nothing to defer with manual activation). Roving tabindex lives on the
  // buttons — exactly one tab is in the tab order at a time.
  function onTabKey(e: KeyboardEvent) {
    const i = TABS.indexOf(tab);
    const next =
      e.key === "ArrowRight" ? (i + 1) % TABS.length
      : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length
      : e.key === "Home" ? 0
      : e.key === "End" ? TABS.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    tabWanted = TABS[next]!;
    tablistEl?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }

  // A note's Reading colour (from the registry) — accents its list card + marker (ADR-0007).
  const readingColourOf = (it: W3CAnnotation): string | undefined => {
    const rid = readingIdOf(it);
    return rid !== undefined ? readings.find((r) => r.id === rid)?.colour : undefined;
  };

  // svelte-ignore state_referenced_locally -- initial-capture is the contract: `initialSelected` seeds
  // selection once; LATER changes are adopted by the re-selection $effect below (prevInitialSelected).
  let selected = $state<string | null>(initialSelected);
  // Scale cue (Archie-93fd): current zoom / home zoom, streamed live from Canvas's onzoom. Defaults
  // to 1 (home/fit) — the value it settles back to once the canvas mounts and reports its own home.
  let zoomRatio = $state(1);

  // V101 (Archie-99b1): publish the deepest rung upward whenever selection changes, so the address
  // can follow. Reports the RAW published note id; ExhibitView owns the address grammar. The region
  // rides along only while the arrival region is still the one being shown — once the reader picks a
  // different note, the old `?xywh=` no longer describes anything and must not stick to the address.
  $effect(() => {
    onlocus?.({ noteId: selected, xywh: selected !== null && selected === initialSelected ? initialRegion : null });
  });

  // Deep-link sub-region (4.2): the camera target fragment for Canvas's `focus`. The route gives the raw
  // xywh VALUE (no `xywh=` prefix); fitRegion's parser needs the prefixed form, so add it when absent. A
  // `percent:` value parses to null in fitRegion → a safe no-op (the note's own bounds then drive the
  // camera), so an unsupported region never breaks the landing. null = no region cite.
  const focusRegion = $derived(
    initialRegion ? (initialRegion.startsWith("xywh=") ? initialRegion : `xywh=${initialRegion}`) : null,
  );

  // Worklist 1.3 (arrival moment): on first paint — and again when the carousel lands on another
  // object — the marks briefly emphasize, then settle to their quiet resting weight. Answers "where
  // do I start, what's here?" and gives touch readers (no hover-discovery) a way in.
  //
  // Archie-a6fb: this used to be a CSS breathe on `main.arrival .a9s-annotation`, but Annotorious 3
  // renders marks to a WebGL canvas with no per-shape SVG node — that selector matched nothing for a
  // month (probe 2026-07-19). Reimplemented through the SAME style channel the reading colours ride:
  // a decaying pulse intensity (arrivalPulseIntensity) drives withArrivalPulse over the base styleOf,
  // re-minting the styleOf identity each frame so Canvas re-applies it (setStyle) and the sweep shows.
  let pulseIntensity = $state(0);
  let pulseRaf = 0;
  // Respect prefers-reduced-motion (parity with the retired `animation: none` rule): no sweep, marks
  // sit at their resting weight. Guarded for SSR (Astro renders this island server-side first).
  const reduceMotion = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  function pulseMarks() {
    if (reduceMotion) return;
    cancelAnimationFrame(pulseRaf);
    const start = performance.now();
    pulseIntensity = 1; // peak now, so the reveal lands on the same frame as arrival
    const step = () => {
      const k = arrivalPulseIntensity(performance.now() - start);
      pulseIntensity = k;
      pulseRaf = k > 0 ? requestAnimationFrame(step) : 0;
    };
    pulseRaf = requestAnimationFrame(step);
  }
  $effect(() => () => cancelAnimationFrame(pulseRaf)); // teardown on destroy

  // The pulse must start when the MARKS ARE ACTUALLY PAINTED, not when this island mounts: the OSD
  // surface resolves only after the (often remote IIIF) image `open` completes, which for the seed's
  // Yale folios routinely outlasts the ~1.4s pulse — firing at mount would decay the whole sweep
  // before setStyle can ever apply it (the reveal would be invisible on exactly the app's primary
  // content). So each object landing ARMS the pulse, and Canvas's first `onzoom` after mount — which
  // fires once the surface is ready and marks are drawn — DISARMS it and starts the sweep.
  let armArrival = false;
  function onCanvasZoom(r: number) {
    zoomRatio = r;
    if (armArrival) { armArrival = false; pulseMarks(); }
  }

  // Scale-aware weight (Archie-c1d9 inherited decision): the coarse zoom band, memoized BY VALUE so it
  // only re-mints the styleOf identity when the band actually crosses far↔mid↔near (not every zoom
  // frame) — same shape as studio's zoomBandNow.
  const band = $derived(zoomBand(zoomRatio));
  // Wrap the reading styleOf (from ExhibitView) with the scale-aware weight AND the transient arrival
  // emphasis — one style channel, layered: withZoomBand is the RESTING modulation (far → heavier stroke
  // for presence at fit-width, near → recede), withArrivalPulse the transient on top. Order matters: the
  // pulse lerps fillOpacity toward 0.3 for the reveal, and running it LAST keeps the existing comparing
  // transient exactly as it was (withZoomBand leaves an outline-only mark's fill at 0). At rest (intensity
  // 0, mid band) it returns the base styleOf UNCHANGED so the identity stays stable between arrivals.
  const pulsedStyleOf = $derived.by<((id: string) => MarkerStyle | undefined) | undefined>(() => {
    const base = styleOf;
    const k = pulseIntensity;
    const b = band;
    if (!base) return base;
    if (k <= 0 && b === "mid") return base; // no modulation active — keep the stable identity
    return (id: string) => {
      const s = base(id);
      if (!s) return s;
      const scaled = withZoomBand(s as MarkerStyleSpec, b);
      return k > 0 ? withArrivalPulse(scaled, k) : scaled;
    };
  });

  // Reset selection when the object ACTUALLY changes (grid → different object) — but not on the
  // first run, so a deep-link's initialSelected survives mount.
  let prevCanvas: string | undefined;
  $effect(() => {
    const c = object.canvasId;
    // Object actually changed: clear the selection. (The `stepIntoReading` carry that used to keep a
    // note open across a popup-stepper step went with the popup stepper — Archie-01a6.)
    //
    // `readingSheet` must be cleared with it. The sheet renders under `{#if readingSheet && current}`,
    // so clearing `selected` alone UNMOUNTS the sheet while leaving the flag true — and the next plain
    // note selection would then open a reading sheet nobody asked for. Latent rather than shipping
    // today (the scrim covers every control that could change the object while the sheet is open, and
    // `use:dialog` traps Tab), but it stops being latent the moment any control lands above z-index 60
    // or the finder gains a cross-object result. Clear the flag where the selection is cleared, not
    // where the sheet happens to be unreachable.
    if (prevCanvas !== undefined && prevCanvas !== c) { selected = null; readingSheet = false; }
    prevCanvas = c;
    armArrival = true; // every landing (first paint or carousel switch) arms the reveal; the
                       // canvas-ready onzoom below fires it once marks are actually on screen
  });

  // Re-selection seam (A0): when ExhibitView's arriveAtNote re-fires on an ALREADY-mounted Reader
  // (search jump Q-4, keyboard index Q-5), `initialSelected` changes to a new note — `selected` was
  // only seeded once at $state init, so without this the re-selection did nothing. Track the previous
  // value and adopt a new non-null target; `selected` is bound into Canvas (zoomOnSelect), so the
  // camera fits the new mark just as it does on a marker click. Null clears (e.g. arrival dismissed)
  // are NOT forced here — the object-change effect owns clearing, so this only drives positive jumps.
  // svelte-ignore state_referenced_locally -- deliberately the initial value: this is the previous-value
  // tracker the $effect below compares against; seeding it reactively would defeat the comparison.
  let prevInitialSelected: string | null = initialSelected;
  $effect(() => {
    const next = initialSelected;
    // membership guard (review): only adopt a target that exists in THIS object's notes — defends a
    // stale initialSelected on a manual carousel switch, and keeps the cross-object jump correct
    // regardless of effect order (object-change clears, this re-selects the now-present note).
    if (next !== null && next !== prevInitialSelected && annotations.some((a) => a.id === next)) selected = next;
    prevInitialSelected = next;
  });

  // 7e1f: the canvas-wide frame overlay — its corners activate (select) the framed note, reusing the
  // same `selected` path a marker click uses. The framed mark's own overlay rect is suppressed below
  // (filtered out of the canvas annotations) so the whole-object border isn't double-drawn.
  // V46 (Archie-52a0): the frame SURVIVES Hide-all, deliberately. It is the canvas's only named tab
  // stop ("View whole object", frame-overlay.ts) — hiding it left a keyboard reader with no way onto
  // the canvas at all. Declutter means "hide the REGION marks", not "remove the keyboard
  // infrastructure"; the dashed border is a hairline and costs the decluttered view almost nothing.
  const canvasFrame = $derived<FrameOverlay | null>(
    frame ? { colour: frame.colour, onActivate: () => (selected = frame.markId) } : null,
  );
  // The notes list + detail (`current`) keep the FULL array — only the canvas drops the framed rect.
  // Hide-all: the canvas shows ONLY the selected note's mark (or nothing), decluttering the basemap
  // while a list pick still reveals its single pin (the camera fit then centres it).
  const canvasAnnotations = $derived.by(() => {
    if (notesHidden) { const sel = annotations.find((a) => a.id === selected); return sel ? [sel] : []; }
    return frame ? annotations.filter((a) => a.id !== frame.markId) : annotations;
  });

  const current = $derived(annotations.find((it) => it.id === selected));
  // Split the selected note into media (clickable tiles → lightbox) + prose (CONTEXT §"Local view loop").
  const noteParts = $derived(current ? splitNoteMedia(commentOf(current)) : { media: [] as NoteMediaItem[], text: "" });
  // Geo readout (Q7): a Map note shows its centre lng/lat in the opened note — supplementary, not chrome.
  const geoCoord = $derived.by(() => { if (!current) return null; const g = geoOf(current); return g ? formatLngLat(geoCenter(g)) : null; });
  let lightbox = $state<{ media: NoteMediaItem[]; text: string; index: number } | null>(null);

  // Esc closes the open note (#3): the most-travelled loop is open-read-dismiss-next, and until now Esc
  // worked in the lightbox/reading-sheet but NOT in the note state itself. Guarded so the lightbox/sheet
  // (which bind their own Esc) own the key while open. Arrow-stepping is intentionally NOT bound here —
  // OpenSeadragon owns the arrow keys for panning the deep-zoom image, so hijacking them would regress pan.
  // V26/V25 (Archie-3d55) — an Escape LADDER, not a single binding.
  //
  // Escape used to mean exactly one thing here: close the selected note. With no note open it did
  // nothing at all — measured, still `#/voynich`, still "Object 2 of 12" — and the only way up a
  // level was the BACK TO EXHIBIT button, which is invisible when the sidebar is collapsed. Same
  // shape as V1's inert Escape in the empty hall: a binding per surface, no ladder.
  //
  // The rungs, innermost first. Each step is the smallest one that changes something, so a reader
  // holding Escape walks out rather than teleporting:
  //   1. a note is open           → close it
  //   2. focus is inside the canvas → leave the canvas (V25's other half: arrows are OSD's while
  //      focus is there, and the reader had no announced way to take them back)
  //   3. otherwise                → up a level, to the exhibit
  function onkey(e: KeyboardEvent) {
    if (lightbox || readingSheet) return; // those surfaces own Esc while open
    if (e.key !== "Escape") return;
    if (selected !== null) { selected = null; e.preventDefault(); return; }
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest(".openseadragon-container")) {
      // Hand focus back to the reader's own frame rather than to <body>: blurring to nothing is how
      // a keyboard reader loses their place entirely.
      mainEl?.focus({ preventScroll: true });
      e.preventDefault();
      return;
    }
    if (onback) { onback(); e.preventDefault(); }
  }

  // Escape's landing place (V25) — the canvas frame itself, so a keyboard reader leaving OSD does not
  // blur to <body>.
  //
  // V48 (Archie-40fe) used to be wired beside it: a `getFitOptions` callback that measured the legend
  // and the note card and told the camera which flank of the canvas was covered, so `fitBounds` could
  // frame a region in the part the reader could actually see. It is GONE, with its subject. Under the
  // layout row (ADR-0019) the legend, the object nav, the readout and the note card are all flow
  // siblings of the canvas box, so the canvas IS the visible window and the plain fit is the right fit.
  let mainEl = $state<HTMLElement | undefined>(undefined);
</script>

<svelte:window onkeydown={onkey} />

<div class="reader">
  <!-- THE STAGE (ADR-0019 layout row). A flex COLUMN: the canvas chrome bar · the canvas · the open
       note. Every one of those used to be `position: absolute` over `main`; now the canvas is one row
       among siblings and nothing can be on top of it. The nearest corpus shape is clover-iiif's
       `Main` column, where `<Painting>` (the canvas) and `<MediaWrapper>` (the item strip) are flow
       siblings (`Content.tsx:128-146`); its `<ViewerHeader>`/`<ViewerContent>`
       (`Viewer/Viewer.tsx:180-184`) is the same shape. -->
  <div class="stage">
    <!-- Canvas chrome — readings (leading) · object nav + zoom readout (trailing). One docked row.
         `.legend` and `.canvas-chrome-right` were separate absolutes at top-left and top-right of the
         image; they are the two ends of this bar now, which is also why neither needs a plate, a
         shadow or a contrast floor against arbitrary imagery (V42/Archie-de08 closes obviated). -->
    <div class="canvas-dock">
      {#if onreading && readings.length > 0}
        <ReadingLegend {readings} active={activeReading} onselect={onreading} hidden={notesHidden} {onhiddenchange} count={readingCount} />
      {:else}
        <span class="dock-spacer"></span>
      {/if}
      <!-- Trailing end of the docked bar: object nav + the zoom readout. It was an absolutely-positioned
           group at the canvas's top-right (Archie-93fd/V80 gave it ONE anchor so its two members could not
           land on each other); docking makes that guarantee structural and extends it to the image. -->
      <div class="canvas-chrome-right">
        {#if canvasNav && siblings}
        <!-- Archie-01a6: the object nav, present in BOTH sidebar states, speaking its noun VISIBLY.
             It used to read `‹ Prev  2 / 12  Next ›` on screen while announcing "Object 2 of 12" to a
             screen reader — honest in one channel, mute in the other, beside a filmstrip and a
             breadcrumb that also count things (V23/V65). Both channels are now the same string, from
             `product-copy`, so they cannot drift apart again. -->
        <nav class="canvas-nav" aria-label={navRegionName("object")}>
          <button type="button" class="cn-step" disabled={navIdx <= 0}
            onclick={() => stepObject(-1)}
            aria-label={navStepName("object", "prev", siblings[navIdx - 1]?.label)}
            title={navStepName("object", "prev", siblings[navIdx - 1]?.label)}><span aria-hidden="true">‹</span></button>
          <span class="cn-pos">{navPosition(navIdx, siblings.length, "object")}</span>
          <button type="button" class="cn-step" disabled={navIdx >= siblings.length - 1}
            onclick={() => stepObject(1)}
            aria-label={navStepName("object", "next", siblings[navIdx + 1]?.label)}
            title={navStepName("object", "next", siblings[navIdx + 1]?.label)}><span aria-hidden="true">›</span></button>
        </nav>
        {/if}
        <!-- Scale cue (Archie-93fd): the locator answers WHERE the viewport sits in the image; this
             answers HOW FAR IN. Quiet by design: small, muted, no button chrome — a readout, not an
             action. aria-live so a screen-reader user hears it change without it stealing focus. -->
        <span class="scale-cue" aria-live="polite"><span class="sc-label">Zoom</span> {formatZoomRatio(zoomRatio)}</span>
      </div>
    </div>

    <!-- `tabindex="-1"` so Escape can hand focus back HERE when leaving the canvas (V25) — a landing
         place inside the reader, never a tab stop of its own. -->
    <main bind:this={mainEl} tabindex="-1">
      <!-- Key on the object so the OSD viewer REMOUNTS (loads the new image) when the carousel switches
           objects — Canvas creates the viewer once in onMount, so without this only annotations swap. -->
      {#key object.canvasId}
        <Canvas source={object.source} tileSource={object.tileSource} canvasId={object.canvasId} annotations={canvasAnnotations} styleOf={pulsedStyleOf} frame={canvasFrame} focus={focusRegion} zoomOnSelect locator bind:selected onzoom={onCanvasZoom} />
      {/key}
    </main>
    {#if current}
      <!-- THE NOTE (shared NotePopup), on ANY marker/note selection — parity with the narrative. It
           carries no stepper: object nav is canvas chrome now (Archie-01a6).

           DOCKED (2026-07-26). It floated at the canvas's bottom-left, and that is the surface
           Archie-c30a measured clipping a fitted region: `fitBoundsRect`'s reservation slides a region
           HORIZONTALLY, so a region tall enough to make the fit height-constrained could not be lifted
           clear of a card anchored to the bottom — two of `screenshots`' 67 halo notes were in that
           state on the shipped build, and no amount of tuning could fix it because the model had no
           vertical axis. As the stage's last ROW it cannot clip anything: the canvas ends where the card
           begins. That is c30a closing OBVIATED rather than fixed.

           `hidden-behind-sheet` (Archie-dbbc / V60): while the reading sheet is open this card is the same
           note a second time, sitting legibly behind a scrim — the third copy V60 counted.

           PRIOR ART, and a deliberate deviation from it. anvil solved this with a MOUNT GUARD —
           `app/src/embed/EmbeddedReader.svelte:670` renders the popup under `… && !detailOpen` and `:689`
           renders the expanded Sidebar under `… && detailOpen`, so the two can never be mounted at once
           and there is nothing to leak. That is the stronger form and it was the first choice here.

           It is not available to Archie, because Archie has a focus contract anvil's embed does not:
           `use:dialog` (dialog-a11y.ts) captures its restore target from `document.activeElement` at
           ACTION MOUNT and restores it on destroy only `if (trigger && document.contains(trigger))`. The
           trigger is this card's ⤢. Under a mount guard the card unmounts in the same flush the sheet
           mounts, and the failure is ORDER-INDEPENDENT: unmount-first snapshots `BODY`, action-first
           snapshots the ⤢ and then finds `document.contains` false by the time it restores. Either way
           Escape out of the sheet strands a keyboard reader — note.spec.ts's V63 guard, "Escape closes it
           and returns focus to the ⤢ that opened it". "We'll order the effects correctly" is not an
           escape hatch; there is no order that works.

           The one form that WOULD work is restore-by-RE-QUERY — an `onrestore` on the shared action plus
           a host callback focusing the freshly-remounted ⤢ after a `tick()`. A restore-target PARAMETER
           cannot work: the remounted ⤢ is a different node than the one captured, so no node reference
           survives the round trip. That is ~10 lines across three files plus a dependence on flush
           ordering that only a driven browser test can keep honest — to buy an observable guarantee these
           two CSS lines already deliver.

           So: hidden, and hidden the way that gives the same OBSERVABLE guarantee. `display: none` takes
           the card out of rendering AND out of the a11y tree — the ticket's defect was "in the DOM and
           LEGIBLE", and e2e/note-surface.spec.ts asserts the count of VISIBLE `.note-body` elements is
           exactly one. The wrapper is `display: contents` when shown, so it generates no box: `.note-pop`
           takes no row in the stage, so the canvas reclaims the height while the sheet is up. (This used
           to also have to be right for the `getFitOptions` reservation, which read `.note-pop`'s 0×0 box
           as "not occluding"; that reservation is gone.) -->

      <div class="note-slot note-dock" class:hidden-behind-sheet={readingSheet}>
      <NotePopup
        eyebrow={object.label}
        text={noteParts.text}
        media={noteParts.media}
        tags={tagsOf(current)}
        {geoCoord}
        onclose={() => (selected = null)}
        onexpand={() => { if (noteParts.text) readingSheet = true; else if (noteParts.media.length) lightbox = { media: noteParts.media, text: noteParts.text, index: 0 }; }}
        onopenfinder={(t) => onopenfinder?.(t)}
        onmedia={(idx) => (lightbox = { media: noteParts.media, text: noteParts.text, index: idx })}
      />
      </div>
    {/if}
  </div>


  <!-- min/max match the aside's responsive clamp(320px … 560px) so a resize can't escape the designed
       reading-measure (#14) — the floor and ceiling are the same numbers the CSS clamp uses. -->
  <ResizeDivider side="right" label="notes" min={320} max={560} bind:width={asideWidth} bind:collapsed={asideCollapsed} oncommit={(s: AsideState) => saveAside(ASIDE_W_KEY, ASIDE_COLLAPSED_KEY, s)} />
  <!-- Collapsed = the docked note row is the sole note surface (object nav is canvas chrome in BOTH
       states now — Archie-01a6), so the clipped aside (width:0, overflow:hidden) must leave the a11y
       tree + tab order too: `inert` stops its note list and its "Back to Exhibit" footer being
       announced or tabbed while invisible. The ResizeDivider is a sibling, so un-collapsing stays
       reachable.

       BOTH HALVES ARE NOW MEASURED, not assumed (Archie-9838, 2026-07-26). Against Chromium's OWN
       accessibility tree — `Accessibility.getFullAXTree` over CDP, the tree the browser hands a screen
       reader — the note list is exposed while the rail is open and absent while it is collapsed; and
       removing the `inert` attribute at runtime WHILE STILL COLLAPSED brings it back, which is what
       attributes the guarantee to `inert` rather than to the zero-width box. Tab order was never in
       doubt. `e2e/inert-a11y.spec.ts` holds all three.

       The reason this needed measuring: the a11y half "did not reproduce" under Playwright's
       `getByRole`, which still returned the entry. **`getByRole` and `toMatchAriaSnapshot` are not
       reliable probes for `inert`** — they are Playwright's own accessibility model computed over the
       DOM, not a read of the browser's tree, and they do not model it. Don't re-open this on their
       evidence; use the CDP tree. -->
  <!-- The note list, ONE definition: it renders either inside the Notes tabpanel (this object has
       metadata) or bare under the plain "Notes · N" heading (it doesn't). A snippet, not a copy —
       the two branches must never drift. -->
  {#snippet notesPanel()}
    {#if annotations.length === 0}
      <p class="empty">No notes on this image yet.</p>
    {/if}
    <!-- Named, so the list is addressable as a list rather than an anonymous group — the embed's note
         list already carries this exact name (reader-chrome.ts), and ADR-0019's note-list row says the
         two surfaces are the same capability. It is also what makes Archie-9838's claim MEASURABLE:
         e2e/inert-a11y.spec.ts reads Chromium's own accessibility tree for this name in both rail
         states, and an unnamed list gives that probe nothing to find in EITHER state — which reads as
         a pass. -->
    <ul aria-label="Notes on this item">
      {#each annotations as it, i (it.id)}
        <li onmouseenter={() => onnotehover?.(it.id ?? null)} onmouseleave={() => onnotehover?.(null)}>
          <!-- Solo the mark on FOCUS too, not just hover (#11): keyboard tab + touch-focus light the
               note's mark on the canvas before commit — the connect-note-to-region affordance was
               hover-only, invisible to tablet/phone readers. Reuses the same hoverNote/MarkerStyle path.

               Archie-dbbc / V60: this list is the INDEX. While its note is open the entry MARKS POSITION
               and stops restating the text — measured, the selected card and the floating card showed
               the same sentence in two type treatments ~900px apart, and expanding made it three. The
               entry keeps everything only an index can give (reading colour, tags, where you are in the
               list); what it drops is the copy of the prose that is, right now, fully legible on screen.
               `aria-current` says the same thing to a screen reader that `.active` says to the eye. -->
          <button class:active={it.id === selected} aria-current={it.id === selected ? "true" : undefined} style="border-left-color: {readingColourOf(it) ?? 'transparent'}" onclick={() => (selected = it.id)} onfocus={() => onnotehover?.(it.id ?? null)} onblur={() => onnotehover?.(null)}>
            {#if it.id === selected}
              <span class="card-open">{noteIndexOpenMark(i, annotations.length)}</span>
            {:else}
              <span class="card-preview">{stripMarkdown(commentOf(it))}</span>
            {/if}
          </button>
          <!-- Card tags live OUTSIDE the card button (no nested buttons) and are their own facet
               triggers (Q-4): click one to open the finder pre-scoped with that tag. -->
          {#if tagsOf(it).length}<span class="card-tags">{#each tagsOf(it) as t}<button type="button" class="tag tag-btn" onclick={() => onopenfinder?.(t)}>#{t}</button>{/each}</span>{/if}
        </li>
      {/each}
    </ul>
    <p class="hint">Select a note, or a marker on the image. Markers stay pinned as you pan and zoom, and selecting one zooms in.</p>
  {/snippet}

  <aside class:collapsed={asideCollapsed} inert={asideCollapsed} style:--reader-aside-w={asideWidth != null ? `${asideWidth}px` : null}>
    {#if onback && !objectNav}
      <button class="exhibit-back soft-btn" onclick={() => onback?.()}>← Back to Exhibit</button>
    {/if}
    <!-- The sidebar is ALWAYS the note list now (parity with the narrative spine): selecting a note floats
         the shared NotePopup over the canvas rather than swapping this pane to a detail view. The selected
         note's list card stays lit (.active) so the open list shows which note the floating card holds. -->
    <h1 class="object-label">{object.label}</h1>
    {#if object.summary}<p class="object-summary">{object.summary}</p>{/if}
    <!-- The credit sits ABOVE the tab pair, visible from both tabs: the IIIF requiredStatement is a
         MUST-display, and it must never become a row of the Details list (rights are a typed slot,
         distinguished by FORM — tracked mono line vs. the list's hanging-key voice). -->
    <p class="credit-row"><Credit {rights} {exhibitRights} objectLevelLabel="This image" tone="paper" /></p>
    <MetadataRun rows={exhibitMeta} tone="paper" />
    {#if hasDetails}
      <!-- Real APG tablist (roving tabindex, automatic activation) — not styled divs. -->
      <div class="tabs" role="tablist" aria-label="About this image" bind:this={tablistEl}>
        <button type="button" role="tab" id="reader-tab-notes" aria-controls="reader-panel-notes"
                aria-selected={tab === "notes"} tabindex={tab === "notes" ? 0 : -1}
                onclick={() => (tabWanted = "notes")} onkeydown={onTabKey}>Notes · {annotations.length}</button>
        <button type="button" role="tab" id="reader-tab-details" aria-controls="reader-panel-details"
                aria-selected={tab === "details"} tabindex={tab === "details" ? 0 : -1}
                onclick={() => (tabWanted = "details")} onkeydown={onTabKey}>Details · {metaRows.length}</button>
      </div>
      <!-- tabindex=0 on the panels per APG: the Notes panel holds no focusable element when the object
           has no notes, and a keyboard reader must still be able to reach what the tab revealed. -->
      <div role="tabpanel" id="reader-panel-notes" aria-labelledby="reader-tab-notes" tabindex="0" hidden={tab !== "notes"}>
        {@render notesPanel()}
      </div>
      <div role="tabpanel" id="reader-panel-details" aria-labelledby="reader-tab-details" tabindex="0" hidden={tab !== "details"}>
        <!-- Key on the object (same identity as the canvas key above) so the list REMOUNTS when the
             carousel steps: MetadataList's per-value expansion is plain $state keyed by row+index, and
             ExhibitView keys Reader on the EXHIBIT id — so one instance serves every folio. Without this
             key, expanding Provenance on one folio leaves the next folio's Provenance pre-expanded
             ("Show less") on a value the reader never opened. The TAB choice deliberately survives the
             step (it lives in Reader, above this key); the expansion deliberately does not. -->
        {#key object.canvasId}
          <MetadataList rows={metaRows} />
        {/key}
      </div>
    {:else}
      <!-- No metadata on this object: no lone tab. The sidebar keeps exactly its pre-b50f shape. -->
      <h2 class="eyebrow">Notes · {annotations.length}</h2>
      {@render notesPanel()}
    {/if}
    {#if objectNav}
      <SidebarObjectNav onoverview={() => onoverview?.()} />
    {/if}
  </aside>

  {#if lightbox}
    <NoteLightbox media={lightbox.media} text={lightbox.text} index={lightbox.index} onclose={() => (lightbox = null)} />
  {/if}

  {#if readingSheet && current}
    <!-- The sheet is the SAME note at reading size: it takes the card's props, not a text snapshot. That
         is what makes the sheet's header identical to the card's by construction (V64) and what stops
         media/tags/geo vanishing on expand.

         Closing the sheet is "read less", not "dismiss the note": it collapses back to the card and
         deliberately leaves `selected` alone. Only the card's × clears selection (see its `onclose`
         above; anvil ADR-0007 F5, "on close … clear the canvas's selected state"). This is the one
         place the two dismissals diverge, and the divergence is the point.

         ONE MODAL AT A TIME. Giving the sheet the card's whole prop set closed a real gap (tags, media
         and geo used to vanish on expand) and opened a new one: the sheet is `aria-modal="true"`, and
         both of the things its chips and tiles can open — the finder (SearchOverlay) and the lightbox
         (NoteLightbox) — are `aria-modal="true"` too. Clicking a tag chip inside the sheet stacked two
         modals, each asserting to assistive tech that everything outside it is hidden, and one of them
         necessarily lying. So both routes CLOSE the sheet first: the new surface REPLACES it rather
         than covering it. This is the same one-at-a-time posture the whole slice rests on, applied to
         the surfaces the note can reach.

         The alternative with precedent was to not forward these at sheet size at all — NotePopup
         already withholds ⤢ there (see its header block), so "drop an affordance the sheet can't
         honour" is an established pattern in this component. It is not the same case. ⤢ at sheet size
         is MEANINGLESS — it offers to expand what is already expanded, so withholding it costs the
         reader nothing. A tag chip and a media tile are meaningful at any size: the chip is how you
         find the other notes sharing a tag, the tile is how you see the image. Withholding them would
         make the sheet show LESS than the card it came from — which is V64's exact shape, reintroduced
         in miniature by the fix for it. Replace keeps the sheet a full peer of the card; and unlike
         "render them inert", it leaves no control that looks clickable and isn't. -->

    <ReadingSheet
      eyebrow={object.label}
      text={noteParts.text}
      media={noteParts.media}
      tags={tagsOf(current)}
      {geoCoord}
      onclose={() => (readingSheet = false)}
      onopenfinder={(t) => { readingSheet = false; onopenfinder?.(t); }}
      onmedia={(idx) => { readingSheet = false; lightbox = { media: noteParts.media, text: noteParts.text, index: idx }; }}
    />
  {/if}
</div>

<style>
  /* The published reading experience: the object floats on the soft warm ground (left); notes read
     like quiet catalog entries on warm paper (right); a hushed callout echoes the selection. */
  .reader { position: relative; display: flex; height: 100%; min-height: 0; background: var(--surface-canvas); }
  /* THE STAGE — the canvas and its chrome, as ROWS. `min-width: 0` / `min-height: 0` are what let the
     canvas actually shrink into the space the bars leave rather than overflowing the column. */
  .stage { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  main { position: relative; flex: 1 1 auto; min-height: 0; min-width: 0; background: var(--surface-canvas); }
  /* The canvas chrome bar: readings at the leading end, object nav + readout at the trailing end. Both
     were absolutes over the image (`.legend` top-left, this group top-right, each clearing the fixed
     top bar via `--topbar-h`). As the ends of one docked row they cannot reach the image at all, which
     is what makes "the image is never obscured by chrome" structural instead of a set of offsets. */
  .canvas-dock {
    flex: none; display: flex; align-items: center; justify-content: space-between;
    gap: var(--space-4); padding: var(--space-2) var(--space-5);
    background: var(--surface-canvas); border-bottom: 1px solid var(--border-canvas);
  }
  /* Keeps the trailing group at the trailing end when there is no legend to push it there. */
  .dock-spacer { flex: 1 1 auto; }
  .canvas-chrome-right {
    display: flex; align-items: center; gap: var(--space-2);
  }
  /* The open note's row. Capped so a long note can never squeeze the image to nothing — it scrolls
     inside its own row instead, which is the trade a docked surface makes and a floating one dodged. */
  .note-dock {
    flex: none; max-height: 38%; min-height: 0; overflow: auto;
    background: var(--surface-canvas); border-top: 1px solid var(--border-canvas);
  }
  /* Object nav (Archie-01a6) — a quiet canvas pill in the same warm-paper-over-dark language as the
     narrative's "All items" escape. Louder than the readout beside it (it is an action, not a cue) and
     quieter than the image. Tabular numerals so stepping never reflows the row, and connector-blue
     (--accent-2) hover keeps the rationed orange for the focal signal.

     LEGIBILITY over arbitrary imagery: `--surface-canvas-raised` is `#FDFCF5` — a fully OPAQUE plate,
     not a translucent scrim. That is deliberate and it is the strongest of the corpus's four
     techniques: clover-iiif's `PanelToggle` is the only thing it floats over a canvas and it is
     likewise an opaque theme-coloured plate with a drop shadow, sidestepping contrast rather than
     negotiating it (universalviewer, anvil and immarkus all use scrims and then need blur, borders or
     text-shadow halos to rescue them). It also happens to be Archie's own existing idiom — `.to-index`,
     `.scale-cue` and the note card are the same plate — so the nav needs no new mechanism and adds no
     new failure mode at either luminance pole (dark Voynich parchment, near-white screenshots).
     Contrast legibility in general is V42/Archie-de08 and is not this ticket; the obligation here is
     only not to make it worse. */
  .canvas-nav {
    display: inline-flex; align-items: center; gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    background: var(--surface-canvas-raised); border-radius: var(--radius-md);
  }
  .cn-step {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 28px; min-height: 28px; /* a real touch target, not a glyph's ink box (Fitts) */
    background: none; border: none; padding: 0; cursor: pointer;
    font-size: 1.05rem; line-height: 1; color: var(--ink-canvas-secondary);
    border-radius: var(--radius-sm); transition: color 160ms ease;
  }
  .cn-step:hover:not(:disabled) { color: var(--accent-2); }
  .cn-step:disabled { opacity: 0.32; cursor: default; }
  .cn-step:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 1px; }
  .cn-pos {
    font-family: var(--font-ui), sans-serif; font-variant-numeric: tabular-nums;
    font-size: var(--text-ui-sm); letter-spacing: 0.04em; color: var(--ink-canvas-secondary);
    white-space: nowrap;
  }
  /* Scale cue (Archie-93fd) — deliberately the quietest thing in the group: no card/shadow/border like
     .legend or the note popup — just muted mono text, low-contrast, easy to read past. */
  .scale-cue {
    padding: var(--space-1) var(--space-2);
    font-family: var(--font-mono), monospace; font-size: 0.72rem; letter-spacing: 0.02em;
    color: var(--ink-canvas-muted);
    background: var(--surface-canvas-raised); border-radius: var(--radius-sm);
    pointer-events: none; /* a readout, not a control */
  }
  .scale-cue .sc-label {
    font-family: var(--font-ui), sans-serif; font-size: 0.65rem; font-weight: 500;
    letter-spacing: 0.18em; text-transform: uppercase; margin-right: 2px;
  }
  /* Worklist 1.3 arrival reveal (Archie-a6fb): the marks' one-shot emphasis-and-settle used to be a
     CSS breathe here on `.a9s-annotation`, but Annotorious 3 renders marks to WebGL (no per-shape
     SVG node), so that selector was inert for a month. It now rides the style channel — see
     pulseMarks / pulsedStyleOf in the script (prefers-reduced-motion honoured there via reduceMotion). */

  /* Reader panel — warm paper, quiet catalog entries; separated from the canvas by a soft shadow
     and a hair-thin warm border, not a hard rule. */
  aside {
    /* Width = a token: responsive by default (clamp), drag-resizable via --reader-aside-w (Phase 2). */
    width: var(--reader-aside-w, clamp(320px, 27vw, 560px)); flex-shrink: 0; overflow: auto; box-sizing: border-box;
    /* Plain padding: the top bar is docked, so there is no fixed band overhead to reserve against. */
    padding: var(--space-5) var(--space-5) var(--space-6);
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border-left: 1px solid var(--border-canvas);
  }
  /* Collapsed = give the canvas the whole width (image-first close looking). Divider stays (anti-trap). */
  aside.collapsed { width: 0; min-width: 0; padding: 0; border-left: 0; box-shadow: none; overflow: hidden; }
  /* The only h2 is the `.eyebrow` — let the global Soft Static eyebrow (tracked mono, low-opacity)
     own its colour/type; just give it bottom rhythm here. */
  aside h2 { margin: 0 0 var(--space-4); }
  ul { list-style: none; margin: 0; padding: 0; }

  /* Notes | Details tab pair (Archie-b50f). It stands exactly where the "Notes · N" eyebrow stood and
     keeps that voice — tracked uppercase chrome, no pill, no fill. The selected tab is signalled by
     ink weight PLUS a 2px accent rule, so the state survives greyscale and low contrast; the shared
     hairline under the pair is what makes the two read as one control rather than two labels. */
  .tabs { display: flex; gap: var(--space-5); margin: 0 0 var(--space-4); border-bottom: 1px solid var(--border-paper-emphasis); }
  .tabs button {
    background: none; border: none; cursor: pointer;
    padding: 0 0 var(--space-2); margin-bottom: -1px;
    border-bottom: 2px solid transparent;
    font-family: var(--font-ui); font-size: var(--text-ui-md); font-weight: 400;
    letter-spacing: 0.26em; text-transform: uppercase;
    color: var(--ink-paper-secondary);
    transition: color 160ms ease, border-color 160ms ease;
  }
  .tabs button:hover { color: var(--ink-paper-primary); }
  .tabs button[aria-selected="true"] { color: var(--ink-paper-primary); border-bottom-color: var(--accent); }
  /* The panel is focusable (APG) but is not itself an affordance — no focus ring styling beyond the
     browser default outline, which only shows for keyboard focus. */
  [role="tabpanel"]:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 4px; border-radius: var(--radius-sm); }

  /* Note card (list state) — warm paper, soft shadow, generous corners. The 3px left edge carries
     the note's Reading colour (inline binding) and turns to the quiet accent signal on hover. */
  li > button {
    display: block; width: 100%; text-align: left; cursor: pointer;
    padding: var(--space-3) var(--space-4); margin-bottom: var(--space-3);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: none; border-left: 3px solid transparent;
    border-radius: var(--radius-md);
    font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.45;
    transition: background 160ms ease, border-color 160ms ease;
  }
  li > button:hover { background: var(--surface-paper-hover); border-left-color: var(--accent); }
  /* Selected note (parity with the narrative's active-section mark): the open list shows which note the
     floating card currently holds. */
  li > button.active { background: var(--accent-muted); }
  /* 3-line preview clamp + a per-card tag row — the documented scan contract (system.md §Craft Notes):
     a dense list scans by shape, and tags (the cross-cutting discovery affordance) surface on the card. */
  .card-preview { display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  /* The open entry's position mark (Archie-dbbc / V60), in the index's own chrome voice — tracked
     uppercase mono, never body prose. The switch of VOICE is the point: the entry stops looking like
     a reading of the note and starts looking like a place in a list. */
  .card-open { display: block; font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-paper-secondary); }
  .card-tags { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }

  /* Return to the exhibit's object grid (only shown for multi-object exhibits) — quiet soft button
     (composes .soft-btn; just position + size here). */
  .exhibit-back { display: inline-block; margin-bottom: var(--space-5); font-size: var(--text-ui-md); padding: var(--space-2) var(--space-4); }
  .object-label { font-family: var(--font-display); font-size: 1.7rem; font-weight: 400; line-height: 1.15; color: var(--ink-paper-primary); margin: 0 0 var(--space-2); }
  .object-summary { font-family: var(--font-body); font-size: 0.95rem; line-height: 1.6; color: var(--ink-paper-secondary); margin: 0 0 var(--space-2); }
  .credit-row { margin: 0 0 var(--space-3); }

  /* (Detail-state styles removed — the selected note now floats in the shared NotePopup, not an
     in-sidebar drawer; the note prose / media / tag styles live in NotePopup.svelte.) */
  /* Quiet found-meta chips (mono, tinted) — not loud orange fills; the orange stays rationed. */
  .tag { font-family: var(--font-mono); font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-secondary); background: var(--surface-paper-hover); padding: 2px var(--space-3); border-radius: var(--radius-sm); }
  /* Clickable tag chip (Q-4 facet trigger) — button reset over the chip look; hover signals the
     cross-cutting discovery affordance with the rationed connector accent. */
  .tag-btn { border: none; cursor: pointer; transition: color 160ms ease, background 160ms ease; }
  .tag-btn:hover { color: var(--ink-paper-primary); background: var(--accent-muted); }
  .hint { font-family: var(--font-ui); font-size: var(--text-ui-md); color: var(--ink-paper-secondary); line-height: 1.6; margin-top: var(--space-5); }
  .empty { font-family: var(--font-body); font-size: 1rem; line-height: 1.6; color: var(--ink-paper-secondary); padding: var(--space-4); background: var(--surface-paper-hover); border-radius: var(--radius-md); }

  /* The standalone note card's styles now live in the shared NotePopup.svelte component. */
  /* The card's slot (Archie-dbbc / V60) IS the docked row now — it used to be `display: contents` so
     the absolutely-positioned card could keep `.reader` as its containing block, and there is no
     absolute positioning left to preserve. `display: none` still takes the whole card off screen and
     out of the a11y tree while the reading sheet — the SAME note, larger — is open, without unmounting
     the ⤢ that `use:dialog` returns focus to; and now it also gives the height back to the image. */
  .note-slot.hidden-behind-sheet { display: none; }
</style>
