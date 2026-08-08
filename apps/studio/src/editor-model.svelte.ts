// The editor view-model (Archie phase-8 extraction out of App.svelte): ONE factory owning the canvas
// derivation cluster — the notes/annotations chain (hiddenByStructure → sel), the per-canvas note-count
// + recency maps, the marginalia rail's item lists, the LOD dots, the live marker styler, the whole-
// object frame, and the co-located-note stack. App.svelte constructs it once against its reactive
// primitives (EditorModelDeps below) and renders model state; the rune scope is per-instance, so the
// $state/$derived declarations inside the factory behave exactly like the component-scoped ones they
// replaced (cf. view-state.svelte.ts / publish-flows.svelte.ts — the same `.svelte.ts` factory idiom).
//
// ORDER MATTERS. App's original comments warn "$derived reads eagerly" — the derivations are evaluated
// in declaration order and several read ones declared earlier (notes → marginaliaItems/dotItems;
// annById → markerStyleOf; sel + objNotes → coLocated). The cluster was extracted VERBATIM, in App's
// original order — do not reorder.
//
// NOT here (still App-owned): the DOM-bound bits — notesListEl + its marker-follow $effect
// (scrollIntoView touches the DOM, and bind:this must reference a component-scope variable) and
// mergeReviewOpen (a modal flag, not a derivation). The pure helpers App still calls directly
// (oneTarget / selHasSelector / BASE_MARKER) are exported at module level beside the factory.
import {
  stripMarkdown, readingMarkerStyle, emphasisOf, withZoomBand, readingIdOf, zoomBand,
  isWholeObjectFor, wholeObjectFlagOf, selectorOf, selectorBBox,
  type AnnotationSession, type AnnotationRecord, type W3CAnnotation, type Reading,
  // Structurally identical to @render/mount's MarkerStyle (core declares the compatibility); the
  // mount's FrameOverlay is a 2-field structural type. Deliberately NOT imported from @render/mount:
  // the mount barrel statically drags OpenSeadragon, which cannot load in this package's headless
  // node test environment, and the rune-module transform would retain even a type-only import.
  type MarkerStyleSpec,
} from "@render/core";
import { hasMultipleEditors, distinctEditors } from "./collab-attribution.js";
import { dedupeHeadsByLogicalId } from "./note-heads.js";
import { dedupeById } from "./conflict-gate.js";
import type { ViewState } from "./view-state.svelte.js";
import type { ReadingState } from "./reading-state.svelte.js";
import type { StructureSession } from "./structure-session.svelte.js";

/** The deps the derivation cluster reads out of App's reactive primitives. Every value App can mutate
 *  (the session, rev, currentReadings, isAvCurrent, zoomRatio) is a THUNK so the module's $deriveds
 *  re-evaluate on change — reading `rev()` inside a derivation registers the $state read, exactly like
 *  App's inline `void rev;` did (the same getter-dep pattern as createViewState's `exhibits()`). */
export interface EditorModelDeps {
  /** The live per-exhibit AnnotationSession (sess.session — REPLACED on exhibit switch, so a thunk). */
  session: () => AnnotationSession;
  /** The editor cursor (view triple + selection); reads are reactive, writes (`selected`) mutate it. */
  vs: ViewState;
  /** The readings visibility/pen state (noteVisible / isVisible / active / comparing). */
  rdg: ReadingState;
  /** The structure rev-log (hiddenIds / conflictedLocalIds — empty sets whenever the flag is off). */
  structure: StructureSession;
  /** The revision counter, bumped on every log write — the "content changed" dep for the deriveds that
   *  read session state directly (entries / notes() / conflicts() / workingAnnotations()). */
  rev: () => number;
  /** The exhibit's readings (vs.currentExhibit?.readings) — colour/label lookups for markers + rail. */
  currentReadings: () => Reading[];
  /** Whether the current object is sound/video (no OSD canvas → no whole-object frame). */
  isAvCurrent: () => boolean;
  /** The live canvas zoom ratio (streamed via onzoom) — the coarse zoom-band input. */
  zoomRatio: () => number;
  /** W3C target → source IRI (App-owned; also used by the canvas lifecycle handlers). */
  srcOf: (t: unknown) => string | undefined;
  /** The note's comment text (App-owned WADM helper; also feeds the NoteEditor form). */
  commentOf: (r: AnnotationRecord) => string;
}

// A W3C annotation target is `W3CTarget | W3CTarget[]`; Archie authors ONE target per note, so
// normalize to the single target wherever a single is required (createNote/editNote/geoForTarget).
export const oneTarget = <T,>(t: T | T[]): T => (Array.isArray(t) ? (t[0] as T) : t);

// Is the open note a region note (has a spatial/temporal selector)? Drives the note-form Scope control
// AND (Archie-e913) marginaliaItems' `wholeImage` flag — one definition, both readers (the model's
// marginaliaItems + App's setNoteScope); "moved up from its original spot beside setNoteScope so both
// readers see one definition (script order matters: $derived reads eagerly)".
export const selHasSelector = (r: AnnotationRecord | undefined): boolean =>
  !!r && typeof r.target !== "string" && r.target.selector != null;

// Live marker styling (Archie-1489) — forest green: the base (reading-less) note default. The studio
// notes list renders the same swatch (App template), so it lives here with the styling chain.
export const BASE_MARKER = "#3A8C5D";

/** A 2-D box in selector (image-pixel) space — the co-located-note geometry unit. */
export interface Bx { x: number; y: number; w: number; h: number; }

/** Overlap of two boxes as IoU ∈ [0,1] — the co-located-note predicate (≥ 0.5 = a stack). Pure. */
export const bboxIoU = (a: Bx, b: Bx): number => {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy, uni = a.w * a.h + b.w * b.h - inter;
  return uni > 0 ? inter / uni : 0;
};

export function createEditorModel(deps: EditorModelDeps) {
  const { session, vs, rdg, structure, rev, currentReadings, isAvCurrent, zoomRatio, srcOf, commentOf } = deps;

  // Mutable view-model state: the editor-filter lens + the marginalia rail's two live inputs (the
  // soloed reading + the canvas's latest marker-rect frame). One `$state` container, never reassigned —
  // the get/set accessors on the returned model keep the same reactivity App's bare `let`s had
  // (cf. view-state.svelte.ts's selection cursors). The rail READS markerRects; the Canvas writes it.
  const s = $state<{
    editorFilter: string;
    soloReading: string | null;
    markerRects: Record<string, { left: number; top: number; right: number; bottom: number } | null>;
  }>({ editorFilter: "all", soloReading: null, markerRects: {} });

  // Notes + working annotations are scoped to the CURRENT object's canvas (then the layer filter).
  // `void rev();` registers the revision counter as a reactive dep (bumped on every log write) without
  // the bare-comma idiom svelte-check flags as an unused expression.
  // Hide-by-ancestry (Archie-42f3, flag-on only): notes attributed to a TOMBSTONED section are
  // filtered from the working surfaces at data level (spine/visibility.ts hiddenNoteIds). Flag off
  // ⇒ structure.hiddenIds returns the constant empty set and both filters are identity.
  const hiddenByStructure = $derived.by<ReadonlySet<string>>(() => { void rev(); return structure.hiddenIds(vs.currentSlug, session().entries); });
  // Sections with plural heads (unresolved concurrent edits) — gates the NarrativeEditor's edit
  // affordances (merge contract C4). Empty set whenever the flag is off.
  const conflictedSectionIds = $derived<ReadonlySet<string>>(structure.conflictedLocalIds(vs.currentSlug));
  // NOTES with plural heads (Archie-90f1, merge contract C4/C5) — the annotation-level sibling of
  // conflictedSectionIds above. Source-agnostic: session.conflicts() just reads the log, so this reflects
  // whatever put plural heads there (a merged colleague's zip today; a live-sync transport tomorrow) — the
  // status strip's summary, MergeReview, and the per-note edit gate below all read this ONE set.
  const noteConflicts = $derived.by<string[]>(() => { void rev(); return session().conflicts(); });
  const conflictedNoteIds = $derived<ReadonlySet<string>>(new Set(noteConflicts));
  const allNotes = $derived.by(() => { void rev(); return session().notes().filter((r) => !hiddenByStructure.has(r.logicalId)); });
  // Attribution chrome (Archie-90f1) is gated on ≥2 distinct editors across the WHOLE exhibit's live
  // notes (not just this object) — a solo library/exhibit shows zero attribution chips or filter lens.
  const showAttribution = $derived(hasMultipleEditors(allNotes));
  // Filter-by-editor lens, composing with the Readings visibility filter below ("all" = no narrowing).
  // Reset on exhibit switch (mirrors rdg.resetForExhibit()) so a filter picked in one exhibit doesn't
  // silently hide notes in the next.
  const editorOptions = $derived.by<string[]>(() => { void rev(); return [...distinctEditors(allNotes)]; });
  // ONE row per note (Archie-d48e): session.notes() returns every live head, so an edit-vs-edit conflict
  // yields 2+ records sharing a logicalId — deduped here to one max-rev representative so the inspector's
  // logicalId-keyed list (and the object-scoped reading counts) are per-NOTE, not per-head. Both sides stay
  // reachable for resolution via session.conflictHeads() (MergeReview); exhibit-wide allNotes is left with
  // all heads on purpose (editor-diversity / attribution legitimately counts every editor's head).
  const objNotes = $derived(dedupeHeadsByLogicalId(allNotes.filter((r) => srcOf(r.target) === vs.canvasId)));
  const notes = $derived(
    objNotes.filter((r) => rdg.noteVisible(r) && (s.editorFilter === "all" || String(r.lastEditor ?? "unknown") === s.editorFilter)),
  );
  // Archie-7e5b S3a: `workingAnnotations()` yields every live HEAD, so a conflicted note arrives as
  // TWO annotations sharing one `id` — Annotorious is handed duplicate ids and draws the note twice,
  // with only one of them addressable. Dedupe to a single representative, the same rule `objNotes`
  // above applies to the sidebar list; both sides stay reachable through MergeReview.
  const objAnnotations = $derived.by<W3CAnnotation[]>(() => {
    void rev();
    return dedupeById(session().workingAnnotations().filter((a) => srcOf(a.target) === vs.canvasId && !hiddenByStructure.has(a.id)));
  });
  // O(1) marker lookup for the live styler: Annotorious calls styleOf per marker on every restyle
  // (hover / solo / reading toggle), so a per-call array scan was O(n²) across the canvas. Rebuilt only
  // when the working-annotation set changes.
  const annById = $derived(new Map(objAnnotations.map((a) => [a.id, a] as const)));
  const annotations = $derived<W3CAnnotation[]>(
    objAnnotations.filter((a) => rdg.isVisible(readingIdOf(a) ?? "base")),
  );
  const sel = $derived(notes.find((r) => r.logicalId === vs.editing));
  // Note count per canvas, built ONCE per allNotes change — the overview/library lists call this per
  // object, so the old per-call filter was O(objects × notes) on every `rev` bump. O(1) lookup now.
  // Deduped by logicalId first (Archie-d7ee): allNotes carries EVERY live head, so an edit-vs-edit
  // conflict holds 2+ records for one note — counting raw heads would tally that note twice. The count
  // is per-NOTE (like objNotes / the inspector list), not per-head.
  const noteCountByCanvas = $derived.by(() => {
    const m = new Map<string, number>();
    for (const r of dedupeHeadsByLogicalId(allNotes)) { const c = srcOf(r.target); if (c === undefined) continue; m.set(c, (m.get(c) ?? 0) + 1); }
    return m;
  });
  const noteCountOf = (objId: string) => noteCountByCanvas.get(vs.canvasIdOf(objId)) ?? 0;
  // Recency per canvas for the overview's "recently-annotated" sort (Phase 2) — MAX modifiedAt over the
  // object's notes, built ONCE per allNotes change (same shape as noteCountByCanvas). modifiedAt is an ISO
  // string, so lexicographic MAX = chronological MAX; "" (no notes) sorts oldest. Exhibit-scoped, which is
  // exactly the overview's scope (the session holds one exhibit's log).
  const lastAnnotatedByCanvas = $derived.by(() => {
    const m = new Map<string, string>();
    for (const r of allNotes) { const c = srcOf(r.target); if (c === undefined) continue; const t = r.modifiedAt ?? ""; const cur = m.get(c); if (cur === undefined || t > cur) m.set(c, t); }
    return m;
  });
  const lastAnnotatedOf = (objId: string) => lastAnnotatedByCanvas.get(vs.canvasIdOf(objId)) ?? "";
  // The active reading (the pen's destination), shaped for the draw-time cue (P1): name + colour,
  // falling back to base ("General notes" / the base hue) when the pen is on base. `find ?? null`
  // dodges the BASE-url collision — base is never in currentReadings, so a miss means base.
  const activeReading = $derived(currentReadings().find((r) => r.id === rdg.active) ?? null);
  const activeReadingLabel = $derived(activeReading?.name ?? "General notes");
  const activeReadingColour = $derived(activeReading?.colour ?? BASE_MARKER);
  // Solo (rail-row hover, B4): the soloed reading's fill returns while comparing. null = none.
  // Per-NOTE solo: hovering a note in the list lights its mark on the canvas (the rail's hover
  // affordance applied to annotations) — `vs.hoverNote`, driven by the notes list + the marginalia rail.

  // --- Marginalia rail (Archie-dff3, direction B — collapsed tick rail) — the surviving marginalia
  // engine, re-presented as a near-invisible tick rail beside the canvas (NOT the reverted floating
  // card column, and superseding an intermediate direction-C density-cluster build per user verdict).
  // Canvas streams each visible note's on-screen region rect via `onmarkerrects`; the rail places one
  // tick per note (no clustering, no chip chrome, no heat band — ticks at every density). It's a
  // spatial index that DRIVES `selected`/`hoverNote` — the same channels the inspector list and canvas
  // marks use — so it never becomes a second edit surface. Image/Map objects only (regions have a
  // screen rect; AV notes are temporal). `markerRects` is the latest batched frame; the rail re-solves
  // off it. Each tick's colour is the note's reading colour (mirroring markerStyleOf's base
  // fallback) — WHERE + HOW MUCH only, never a text lead (user-verdict strip, Archie-dff3). ---
  // Archie-e913: a whole-image (bare-IRI) note has no marker rect — `markerRects[id]` is always null for
  // it (mount.ts's markerScreenRects only sees Annotorious-registered markers, and canvasAnnotations drops
  // the framed whole-object note entirely). Rather than synthesize a fake rect into that shared stream
  // (dots/selection-popover consumers trust it as real geometry — see Marginalia.svelte's header comment),
  // the rail is told directly which ids are whole-image and gives them their own reserved slot.
  const marginaliaItems = $derived(
    notes.map((r) => ({
      id: r.logicalId,
      colour: (r.reading ? currentReadings().find((x) => x.id === r.reading)?.colour : undefined) ?? BASE_MARKER,
      wholeImage: !selHasSelector(r),
    })),
  );
  const marginaliaRectIds = $derived(notes.map((r) => r.logicalId));

  // LOD dots (Archie-c1d9) — the note set the canvas plots as far-band location dots AND as navigator
  // note-dots. Same id/colour as the marginalia rail (logicalId = the annotation id the canvas keys on;
  // colour = the note's Reading hue, base fallback), plus an accessible label (the note's prose snippet)
  // for the far-band dot's aria-label — the marker-level a11y contract now lives on these real dots
  // (Archie-3e12), the inspector notes list stays the PRIMARY keyboard surface.
  const dotItems = $derived(
    notes.map((r) => ({
      id: r.logicalId,
      colour: (r.reading ? currentReadings().find((x) => x.id === r.reading)?.colour : undefined) ?? BASE_MARKER,
      label: stripMarkdown(commentOf(r)).slice(0, 120) || "Untitled note",
    })),
  );

  // Scale-aware marks (Archie-a6fb): the coarse zoom band, derived from the live zoomRatio the
  // canvas streams via onzoom. A `$derived` so it's memoized BY VALUE — while a pan/zoom keeps the
  // reader in the same band, this stays the same string and doesn't re-mint styleOfLive; it only
  // re-mints (→ setStyle re-applies) when the band actually crosses far↔mid↔near. The zoom-band CSS
  // that used to do this against `.a9s-annotation` was inert (WebGL mark layer, no SVG node), so the
  // weight now rides the style channel via withZoomBand below.
  const zoomBandNow = $derived(zoomBand(zoomRatio()));
  // Canvas re-applies styles only when the styleOf PROP IDENTITY changes ($effect dep) — a stable
  // function would freeze the comparing/solo regime (browser-harness finding). This derived mints
  // a fresh identity whenever the display state (visibility/solo/hover/readings/log/zoom band) changes.
  const styleOfLive = $derived.by(() => {
    void rdg.comparing(currentReadings());
    void s.soloReading;
    void vs.hoverNote;
    void rev();
    void zoomBandNow;
    return (id: string) => markerStyleOf(id);
  });
  function markerStyleOf(id: string): MarkerStyleSpec | undefined {
    const a = annById.get(id);
    if (!a) return undefined;
    const rid = readingIdOf(a);
    const colour = (rid ? currentReadings().find((r) => r.id === rid)?.colour : undefined) ?? BASE_MARKER;
    // ONE style source for both apps (render-core readingMarkerStyle) carrying the comparing
    // regime (archie-ux Q-2): 2+ readings visible → outline-only; solo-on-hover restores a fill.
    const base = readingMarkerStyle(colour, emphasisOf(a), {
      comparing: rdg.comparing(currentReadings()),
      soloed: s.soloReading !== null && (rid ?? "base") === s.soloReading,
      highlighted: vs.hoverNote === id, // the hovered list note's mark is momentarily the brightest thing
    });
    // Layer the zoom-band weight ON TOP (post-modulation): far → heavier stroke for presence at
    // fit-width; near → the outline recedes. Composes with the regime above, one style channel.
    return withZoomBand(base, zoomBandNow);
  }

  // Whole-object frame for the STUDIO canvas (ADR-0018): the first note that frames the WHOLE object —
  // a bare-IRI note (no selector) or a ≥75%/override region note. Mirrors the viewer's ExhibitView.frameFor
  // so a created/converted whole-object note is VISIBLE while authoring (it has no marker of its own). AV
  // objects have no OSD canvas, so no frame there (their whole-track band lives in the viewer's MediaPlayer).
  const frameMark = $derived.by<{ markId: string; colour: string } | null>(() => {
    if (isAvCurrent()) return null;
    const w = vs.current?.width, h = vs.current?.height;
    for (const a of annotations) {
      if (!a.id) continue;
      if (isWholeObjectFor(selectorOf(a), w ?? 0, h ?? 0, wholeObjectFlagOf(a))) {
        const rid = readingIdOf(a);
        const colour = (rid ? currentReadings().find((r) => r.id === rid)?.colour : undefined) ?? BASE_MARKER;
        return { markId: a.id, colour };
      }
    }
    return null;
  });
  // The OSD frame overlay; its corners activate (select) the framed note, like a marker click.
  // Structurally identical to @render/mount's FrameOverlay ({colour, onActivate}) — see the import
  // note at the top of this file for why the mount type isn't referenced here.
  const studioFrame = $derived<{ colour: string; onActivate: () => void } | null>(
    frameMark ? { colour: frameMark.colour, onActivate: () => (vs.selected = frameMark.markId) } : null,
  );
  // Drop the framed note's own rect from the canvas array (a ≥75% region note would otherwise draw rect +
  // frame); a bare-IRI whole-object note has no rect, so this is a no-op for the common case.
  const canvasAnnotations = $derived(frameMark ? annotations.filter((a) => a.id !== frameMark!.markId) : annotations);

  // Co-located notes — a "stack" of notes whose hitboxes overlap so much you can't separate them by
  // clicking the canvas (e.g. the cipher/hoax/abjad reading notes share one region). The note editor cycles
  // through them so every note at a spot is reachable. Overlap = bbox IoU ≥ 0.5 on the SAME object.
  const bboxOf = (t: unknown): Bx | null => { const s = selectorOf({ target: t }); return s ? selectorBBox(s) : null; };
  const coLocated = $derived.by<AnnotationRecord[]>(() => {
    if (!sel) return [];
    const sb = bboxOf(sel.target);
    if (!sb) return []; // whole-object / no-region selected → no stack to step through
    return objNotes.filter((r) => { const b = bboxOf(r.target); return !!b && bboxIoU(sb, b) >= 0.5; });
  });
  const coLocatedIndex = $derived(coLocated.findIndex((r) => r.logicalId === vs.editing));
  function cycleCoLocated(dir: 1 | -1) {
    if (coLocated.length < 2) return;
    const i = ((coLocatedIndex < 0 ? 0 : coLocatedIndex) + dir + coLocated.length) % coLocated.length;
    vs.selected = coLocated[i]!.logicalId;
  }

  return {
    // — conflict surface (the status strip's summary + every edit gate read these) —
    get conflictedSectionIds(): ReadonlySet<string> { return conflictedSectionIds; },
    get conflictedNoteIds(): ReadonlySet<string> { return conflictedNoteIds; },
    get noteConflicts(): string[] { return noteConflicts; },
    // — editor-filter lens (exhibit-scoped; App resets to "all" on exhibit switch) —
    get editorFilter(): string { return s.editorFilter; },
    set editorFilter(v: string) { s.editorFilter = v; },
    get editorOptions(): string[] { return editorOptions; },
    // — the notes list (object-scoped, deduped, layer+editor filtered) + the open note —
    get objNotes(): AnnotationRecord[] { return objNotes; },
    get notes(): AnnotationRecord[] { return notes; },
    get sel(): AnnotationRecord | undefined { return sel; },
    get showAttribution(): boolean { return showAttribution; },
    // — overview/library per-object reads (O(1) lookups over the per-canvas maps) —
    noteCountOf(objId: string): number { return noteCountOf(objId); },
    lastAnnotatedOf(objId: string): string { return lastAnnotatedOf(objId); },
    // — draw-time pen cue (P1) —
    get activeReadingLabel(): string { return activeReadingLabel; },
    get activeReadingColour(): string { return activeReadingColour; },
    // — marginalia rail (Archie-dff3): the two live inputs + the item projections —
    get soloReading(): string | null { return s.soloReading; },
    set soloReading(v: string | null) { s.soloReading = v; },
    get markerRects(): Record<string, { left: number; top: number; right: number; bottom: number } | null> { return s.markerRects; },
    set markerRects(v: Record<string, { left: number; top: number; right: number; bottom: number } | null>) { s.markerRects = v; },
    get marginaliaItems(): { id: string; colour: string; wholeImage: boolean }[] { return marginaliaItems; },
    get marginaliaRectIds(): string[] { return marginaliaRectIds; },
    get dotItems(): { id: string; colour: string; label: string }[] { return dotItems; },
    // — live marker styling (Canvas styleOf — fresh identity per display-state change) —
    get styleOfLive(): (id: string) => MarkerStyleSpec | undefined { return styleOfLive; },
    // — whole-object frame for the STUDIO canvas (ADR-0018) —
    get studioFrame(): { colour: string; onActivate: () => void } | null { return studioFrame; },
    get canvasAnnotations(): W3CAnnotation[] { return canvasAnnotations; },
    // The reading-visible annotation set (pre-frame) — what the AV editor draws (no frame for AV).
    get annotations(): W3CAnnotation[] { return annotations; },
    // — co-located note stack (the NoteEditor cycler) —
    get coLocated(): AnnotationRecord[] { return coLocated; },
    get coLocatedIndex(): number { return coLocatedIndex; },
    cycleCoLocated,
  };
}
export type EditorModel = ReturnType<typeof createEditorModel>;
