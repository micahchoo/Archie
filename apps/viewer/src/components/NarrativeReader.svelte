<script lang="ts">
  // Narrative layout (CONTEXT §92; ADR-0005 — the "third-layer" model). A prose-spine of ordered Sections
  // beside the canvas. Reading is prose-led: the ACTIVE section DRIVES the canvas — it switches to that
  // section's `objectId` object and fits its `start` region (a media fragment) — NOT coupled to annotation
  // order (the old section-i↔note-i index coupling is gone). An AV-object section renders the temporal
  // MediaPlayer instead of the OSD canvas. Markers shown = the active object's notes (progressive §122 = v1.1).
  import Canvas from "@render/svelte/Canvas.svelte";
  import ResizeDivider from "@render/svelte/ResizeDivider.svelte";
  import MediaPlayer from "./MediaPlayer.svelte";
  import NoteLightbox from "./NoteLightbox.svelte";
  import ReadingSheet from "./ReadingSheet.svelte";
  import NotePopup from "./NotePopup.svelte";
  import Credit from "./Credit.svelte";
  import MetadataRun from "./MetadataRun.svelte";
  import ReadingLegend from "./ReadingLegend.svelte";
  import ProseCites from "./ProseCites.svelte";
  import { type MarkerStyle, type FrameOverlay, formatZoomRatio, zoomBand } from "@render/svelte";
  import { loadAsideWidth, saveAsideWidth, scopedKey, loadSessionCollapsed, saveSessionCollapsed, type AsideState } from "../aside-persistence.js";
  import { untrack } from "svelte";
  import { splitNoteMedia, commentOfAnnotation as commentOf, tagsOfAnnotation as tagsOf, overlay, geoOf, geoCenter, formatLngLat, readingIdOf, stripMarkdown, metadataRows, withZoomBand, type MarkerStyleSpec, type AObject, type NoteMediaItem, type Reading, type RightsFields, type W3CAnnotation, type Section } from "@render/core";
  import { ownerObjectOf, arrivalSectionIndex } from "../narrative-landing.js";
  import { navPosition, navRegionName, navStepName, noteIndexOpenMark } from "../product-copy.js";

  // Resizable / collapsible narrative spine (Phase-2 expandability). `asideWidth` is a px OVERRIDE of the
  // responsive clamp() default (null ⇒ default); persisted per the archie.*.v1 metadata idiom. Drag math
  // is headless-tested in @render/core; ResizeDivider is the handle. Collapse = give the canvas the page.
  //
  // Archie-c5cb splits the two halves of that state apart, because they answer different questions.
  // WIDTH stays global (`archie.narrativeAsideWidth.v1`, localStorage): "how wide I like my reading
  // column" is one taste, not one per exhibit. COLLAPSED is now per-exhibit AND session-scoped — see
  // `aside-persistence.ts` for the full reasoning; the short form is that after Archie-0d6c the spine
  // is the mode's input device, so a sticky global "hidden" silently removed the interaction the mode
  // is named for, on narratives the reader had never opened.
  const ASIDE_W_KEY = "archie.narrativeAsideWidth.v1";
  const ASIDE_COLLAPSED_KEY = "archie.narrativeAsideCollapsed.v1";
  let asideWidth = $state<number | null>(loadAsideWidth(ASIDE_W_KEY));
  // Expand the open note into the centred reading sheet (Phase-3 focus surface). A BOOLEAN, not a text
  // snapshot: the sheet renders the same `current` note the card does (Archie-dbbc).
  let readingSheet = $state(false);

  let {
    slug = "",
    objects = [],
    canvasIdOf,
    annotationsByObject = {},
    readingAnnotationsByObject = {},
    sections = [],
    title = "",
    rights,
    readings = [],
    activeReading = null,
    onreading,
    styleFor,
    frameFor,
    initialSelected = null,
    onlocus,
    initialSection = null,
    notesHidden = false,
    onhiddenchange,
    onindex,
    onopenfinder,
    onreadinginfo,
  }: {
    /** The exhibit's slug — scopes the per-exhibit collapse key (Archie-c5cb). */
    slug?: string;
    objects: AObject[];
    /** Resolve an object id to its published canvas IRI (the Viewer owns the slug). */
    canvasIdOf: (objectId: string) => string;
    annotationsByObject?: Record<string, W3CAnnotation[]>;
    /** Per object id → per reading id → that reading's notes (ADR-0007). */
    readingAnnotationsByObject?: Record<string, Record<string, W3CAnnotation[]>>;
    sections?: Section[];
    title?: string;
    /** The exhibit-level credit/license (Q5), shown under the title beside the spine hint. */
    rights?: RightsFields;
    /** The exhibit's Readings (ADR-0007) — drives the canvas legend. Empty = no legend. */
    readings?: Reading[];
    activeReading?: string | null;
    onreading?: (id: string | null) => void;
    /** Per-object marker styler (objectId → (annId → style)); colours markers by Reading. */
    styleFor?: (objectId: string) => (id: string) => MarkerStyle | undefined;
    /** 7e1f coverage border — the whole-object mark to frame the ACTIVE object's canvas with (mirrors
     *  Reader.svelte's `frame` prop; a callback here since the active object changes internally as the
     *  spine steps, not from ExhibitView). null return = no frame for that object. Absent = never framed —
     *  a whole-object (selectorless, ADR-0018) note would otherwise have no marker AND no list entry in
     *  the narrative (its sidebar is the section spine, not a note list), making it unreachable. */
    frameFor?: (objectId: string) => { markId: string; colour: string } | null;
    initialSelected?: string | null; // deep-link arrival: land on the section whose object owns this note
    /** V101/V84 (Archie-99b1): report the deepest rung — the active SECTION, plus a selected note if
     *  one is open. V84 is exactly this: the spine had no address, so stepping out and back lost
     *  your place. Raw published note id; the caller owns the address grammar. */
    onlocus?: (l: { sectionId: string | null; noteId: string | null }) => void;
    /** Section-cite arrival (#/<slug>/s/<id>, ADR-0021 / 4.6): the resolved (in-range) section index to
     *  land the spine on. Takes precedence over a note's owning-section when both are present (an explicit
     *  section cite wins). null = no section cite. */
    initialSection?: number | null;
    /** Hide-all (ReadingLegend declutter): canvas draws no markers except the SELECTED one. */
    notesHidden?: boolean;
    onhiddenchange?: (hidden: boolean) => void;
    /** Reopen the active reading's wall text — threaded to the legend's (i) (gated on the handler there). */
    onreadinginfo?: () => void;
    /** Open the object grid as an index (ADR-0016 keystone): the narrative leads, but the grid stays
     *  reachable behind it — precision-in/escape-out (§137), never a dead-end takeover. Absent = hide it. */
    onindex?: () => void;
    /** A tag chip in the note popup was clicked (Q-4): open the mode-independent finder pre-scoped with
     *  that tag as a facet — the narrative's only discovery surface besides the finder itself. */
    onopenfinder?: (tag: string) => void;
  } = $props();

  // The exhibit-level metadata run (Archie-36e6) — this reader already showed the exhibit CREDIT but
  // never its metadata, so a narrative exhibit dropped creator/date entirely.
  const exhibitMeta = $derived(metadataRows(rights));

  // Per-exhibit, session-scoped collapse (Archie-c5cb). Read once, at mount, from the slug-scoped key.
  // svelte-ignore state_referenced_locally -- initial-capture is the contract: the slug is fixed for a
  // mounted narrative (the shell re-keys ExhibitView per route), so this seeds once and the toggle owns
  // it from there.
  let asideCollapsed = $state<boolean>(loadSessionCollapsed(scopedKey(ASIDE_COLLAPSED_KEY, slug)));
  function setCollapsed(v: boolean) {
    asideCollapsed = v;
    saveSessionCollapsed(scopedKey(ASIDE_COLLAPSED_KEY, slug), v);
  }

  // Deep-link arrival → land on the right section. An explicit section cite (4.6) wins; else land on the
  // section whose object OWNS the note. The owner search now scans BASE + per-reading pages (4.9) via the
  // shared resolver — a note that lives ONLY on a reading overlay used to fall to section 0.
  // svelte-ignore state_referenced_locally -- initial-capture is deliberate: the object list is stable
  // for a mounted narrative (ExhibitView remounts the reader per exhibit); these ids seed arrival only.
  const objectIds = objects.map((o) => o.id);
  const arrivalSection = (() => {
    if (initialSection !== null) return initialSection;
    return arrivalSectionIndex(initialSelected, objectIds, sections, { annotationsByObject, readingAnnotationsByObject });
  })();

  let activeIndex = $state(arrivalSection);
  // svelte-ignore state_referenced_locally -- initial-capture is the contract: seeds once; later
  // changes are adopted by the re-selection seam (A0) $effect below via prevInitialSelected.
  let selected = $state<string | null>(initialSelected); // a clicked marker (highlight), distinct from the active section
  // Scale cue (Archie-93fd): current zoom / home zoom, streamed live from Canvas's onzoom. Defaults
  // to 1 (home/fit) — the value it settles back to once the canvas mounts and reports its own home.
  // Only meaningful for the spatial (non-AV) branch — see the `{#if !isAV}` guard below.
  let zoomRatio = $state(1);

  // ── The image follows along: ONE coupling, run in both directions (Archie-0d6c) ─────────────────
  //
  // The spine is a single scrollable column of beats; the canvas follows `activeSection.start` through
  // the existing declarative `focus` prop. So the whole feature is: keep `activeIndex` and the column's
  // scroll position agreeing with each other, whichever one the reader moved.
  //
  // PRIOR ART, and exactly what each citation does and does not support:
  //
  //  - `scrollama` (corpus, README:5) — "IntersectionObserver in favor of scroll events". That is the
  //    citation for the API CHOICE and nothing else: don't hand-roll scroll math, don't bind `scroll`.
  //    It does NOT support the guard below; scrollama never scrolls the page itself (`grep scrollIntoView
  //    src/` is empty — it only ever READS `scrollTop`), so it has no two-directions problem to solve.
  //  - `quire` `_assets/javascript/application/intersection-observer-factory.js` — the observer's exact
  //    shape, ported: `root` = the scrolling content column, `rootMargin: '-50% 0% -50% 0%'` collapsing
  //    that root to a horizontal CENTRE LINE, `threshold: 0`, and a callback that acts only on
  //    `entry.isIntersecting`. A zero-height root is what makes "the active beat" unambiguous: at most
  //    one beat can cross the line, so there is no tie to break and no ratio to rank.
  //  - `quire` `canvas-panel.js` `goToFigureState` — the one-function shape for the activate direction.
  //    ONE function owns the whole transition (state, then scroll, then address), and both the click
  //    handler and the observer callback route through it, so the two directions cannot each hold half
  //    the state. `goToSection` is that function here.
  //
  // THE GUARD BELOW IS ORIGINAL DESIGN WITH NO CORPUS PRECEDENT — stated, not dressed up.
  // A programmatic scroll re-enters the observer and reports the beats it sweeps past, so an activation
  // can bounce the reader onto a neighbour. No corpus system solves this; all three DODGE it, and it is
  // worth being precise about how, because "quire does it too" would be a false comfort:
  //   - scrollama never scrolls at all (`grep scrollIntoView src/` is empty; it only reads `scrollTop`).
  //   - quire's `canvas-panel.js:259` really does call `goToFigureState` (`:68`) — and its
  //     `scrollToHash` (`:118`) — from inside an IntersectionObserver callback, with no suppression of
  //     any kind. But it CANNOT re-enter: its observer root is `.quire-entry__content`
  //     (`intersection-observer-factory.js:12`) while `scroll-to-hash.js:21-28` scrolls the DOCUMENT.
  //     An IntersectionObserver measures the target's geometry RELATIVE TO ITS ROOT, and a document
  //     scroll translates root and target by the same delta — so the measurement is invariant under the
  //     scroll its own callback triggers. Structurally immune, not solved.
  //     (An earlier version of this note added "and `.quire-entry__content` carries no CSS rule anywhere
  //     in the repo, so it is not a scroller". True of that checkout and worthless as evidence: the
  //     checkout vendors no 11ty theme stylesheets AT ALL — zero `.scss`, no `node_modules`, and its
  //     only two `.css` files belong to an unrelated React app. An absence proved against a tree with no
  //     stylesheets in it is exactly the shape `prior-art-citation-discipline.md` warns about. Dropped:
  //     the root-relative argument above holds whether or not the root is a scroller, so the weaker
  //     claim was never load-bearing.)
  //   - annomea/anvil have no scroll-coupled surface at all.
  // Here the observer's root IS the scroller we scroll, so the re-entry is real. So this is ours:
  //
  //   An INTENT token. `scrollToBeat` computes the exact scrollTop it is scrolling TO and records it
  //   with the target index; while an intent is live the observer is inert; the intent ends when the
  //   column ARRIVES at that scrollTop, or when the reader touches the column, whichever comes first.
  //
  //   Arrival, not a timer. An earlier draft ended the intent on the column going quiet — the last
  //   `scroll` event plus a 150ms settle, re-armed by each scroll. Review measured that fully defeated:
  //   because every scroll re-armed it, a zero-distance activation followed by continuous scrolling
  //   froze the highlight for 1546ms while the reader passed 2760px and 15 sections, released only by
  //   the outer ceiling. A scrollbar drag is the realistic path to that (it emits `scroll` without the
  //   `wheel`/`touchstart`/`keydown` that cancel an intent). Arrival has no such failure mode: the
  //   target is known exactly at the moment we ask for it, so "are we there yet" is a comparison rather
  //   than a guess, and the suppression lasts precisely as long as the scroll it is covering. It also
  //   removes the load-sensitivity a wall-clock heuristic had, and that is not a hopeful aside — it is
  //   the same root cause as a flake review caught in one full-suite run under CPU contention, where
  //   the bounce test saw an intermediate "Section 2 of 21". The mechanism, measured directly on an
  //   instrumented build: a smooth scroll emits `scroll` continuously, so the 150ms quiet timer should
  //   never have fired mid-animation — but a single natural FRAME STALL of 160ms did leave the column
  //   silent long enough, the timer fired, the observer went live mid-sweep, and it reported whatever
  //   beat was under the line at that instant. Under contention stalls get longer and more frequent,
  //   which is exactly why the flake only appeared under load. Arrival cannot be released by a stall:
  //   only reaching or passing the target ends it, and a stalled frame moves nothing.
  //
  //   The zero-distance case falls out for free and is worth naming: if the column is already at the
  //   target, no intent is armed at all. That is the exact shape review used to wedge the old design.
  //
  //   `INTENT_MAX_MS` is the backstop for an intent that never arrives — a target made unreachable by a
  //   reflow mid-flight (prose images landing, the pane toggle) is the realistic path. An earlier
  //   version of this comment claimed nothing in normal operation reaches it and that therefore no test
  //   could pin it. Review disproved that in BOTH directions and it is worth recording how, because the
  //   error was structural rather than a wrong number: the deadline was read only inside
  //   `intentActive()`, whose only caller is the observer callback. So where observer crossings kept
  //   coming the ceiling did fire (measured at 1491ms), and where they did not — the column left at rest
  //   short of its target — NOTHING consulted it at all, and the highlight stayed frozen for 3500ms with
  //   no recovery. A deadline that only a callback can notice is not a backstop, because the wedge it is
  //   meant to bound is exactly the state in which that callback stops arriving.
  //   So it is now enforced by a timer armed with the intent, which ends the intent AND re-observes the
  //   beats so the observer re-delivers against the column's real position. `endIntent` is the single
  //   exit, so arrival and reader input cancel that timer rather than leaving it to fire on a later
  //   intent. It only ever ENDS suppression, never extends it — which is what separates it from the
  //   quiet-timer design it replaced.
  //
  //   When an intent ends we deliberately do NOT resync `activeIndex` from wherever the line ended up —
  //   the column cannot always put the requested beat on the line, and resyncing would undo the very
  //   activation that asked for it. The reader's next real scroll takes ownership back.
  //
  // What the guard is and is NOT gated by, measured rather than assumed: deleting `intentActive()`
  // does NOT change where a section cite lands (the arrival scroll is instant, so the observer's first
  // delivery already sees the settled column). What the guard holds is the JOURNEY: without it a smooth
  // sweep across several beats fires a full section change for each one it passes, closing the open note
  // and swapping the canvas's object per beat. `narrative-coupling.spec.ts`'s "does not bounce the
  // reader through the beats in between" records that, and reddens on removal.
  let asideEl = $state<HTMLElement | undefined>(undefined);
  let beatEls: (HTMLElement | undefined)[] = [];
  let scrollIntent: number | null = null;
  /** The exact scrollTop the live intent is travelling to, and which way. Meaningless when null. */
  let intentTop = 0;
  let intentDown = true;
  let intentDeadline = 0;
  let intentTimer: ReturnType<typeof setTimeout> | undefined;
  /** Set by the observer effect: disconnect and re-observe, forcing a fresh delivery against the
   *  column's current position. The backstop's way of asking "so where are we actually?". */
  let resyncObserver: (() => void) | undefined;
  /**
   * Arrival tolerance — and it is LOAD-BEARING, which took two wrong readings to establish.
   *
   *  - FROM ABOVE it is pinned. At 100000 every `scrollToBeat` takes the nothing-to-do branch and the
   *    prose stops following at all; `activate → camera AND prose … stepping the canvas nav` reddens.
   *  - FROM BELOW it is pinned too, and an earlier version of this note said the opposite. The suite IS
   *    green at 0 — but that is a coverage gap, not redundancy: every probe in it jumps to `max` or `0`,
   *    hundreds of pixels past the target, so every intent is released by overshoot and the tolerance
   *    never has to do anything. Two independent mechanisms make 0 a real defect.
   *      (a) CHROMIUM ROUNDS `scrollTo` TO WHOLE PIXELS, while this target comes from
   *          `getBoundingClientRect()` and is fractional — 20 of 21 beats are non-exact, landing up to
   *          0.48px short, stable across DPR 1 → 2.4. Landing 0.36px short satisfies
   *          `scrollTop >= intentTop - 2` and fails at 0, so the intent never ends and the column can
   *          then move somewhere SHORT of the target, where reached-or-passed cannot rescue it either.
   *      (b) the same constant gates the nothing-to-do branch in `scrollToBeat`, so at 0 a sub-pixel
   *          target arms an intent whose `scrollTo` may not move the column at all — and therefore may
   *          emit no scroll event, so nothing is ever there to notice the arrival.
   *    Pinned by "a sub-pixel arrival still ends the intent" below: at 2 the highlight follows the
   *    column to the truth, at 0 it stays stuck on the activated beat.
   */
  const ARRIVE_PX = 2;
  const INTENT_MAX_MS = 1500;

  /** The ONE exit from a live intent, so the backstop timer can never outlive the intent that armed it
   *  and fire against a later one. */
  function endIntent(): void {
    scrollIntent = null;
    clearTimeout(intentTimer);
    intentTimer = undefined;
  }

  /** True while a programmatic scroll owns the column — the observer must stay out of the way. */
  function intentActive(): boolean {
    if (scrollIntent === null) return false;
    if (performance.now() > intentDeadline) { endIntent(); return false; }
    return true;
  }

  /** The scrollTop that puts `li` on the column's centre line, clamped to what the column can reach.
   *  Read from live rects rather than `offsetTop`: the `<li>`'s offsetParent is `.narrative` (the aside
   *  is not positioned), so `offsetTop` is measured against the wrong box entirely. */
  function centreTopFor(el: HTMLElement, li: HTMLElement): number {
    const c = el.getBoundingClientRect();
    const b = li.getBoundingClientRect();
    const delta = b.top + b.height / 2 - (c.top + c.height / 2);
    return Math.max(0, Math.min(el.scrollTop + delta, el.scrollHeight - el.clientHeight));
  }

  /**
   * Has the column reached — or passed — the live intent's target?
   *
   * REACHED OR PASSED, not equals, and that distinction is the whole robustness of this design. An
   * equality test (even with a tolerance) assumes the column approaches the target smoothly and stops
   * on it. A scroll driven by something OTHER than our own animation does not: a dragged scrollbar
   * moves in jumps, and one 58px step can straddle a 2px window and miss it entirely. The intent would
   * then survive to the backstop — reintroducing, through the back door, exactly the wedge that ending
   * on arrival was meant to remove. Recording the direction of travel at issue time and asking whether
   * we are at or beyond the target makes overshoot terminate the intent, which is the honest reading:
   * once the column is past where we asked it to go, our scroll is over however it got there.
   *
   * Clamping the target at issue time is what makes this correct for a beat that CANNOT be centred
   * (the last one) as well as one that can.
   */
  function intentArrived(): boolean {
    const el = asideEl;
    if (!el) return true;
    return intentDown ? el.scrollTop >= intentTop - ARRIVE_PX : el.scrollTop <= intentTop + ARRIVE_PX;
  }
  /**
   * The beat at a column END, or null in between.
   *
   * MEASURED HOLE in the centre-line rule, closed here rather than by moving the line (2026-07-26,
   * `voynich-reading`, 1280x720): the column's header — eyebrow, title, hint, credit, pane toggle, on
   * top of the `--pane-top` reservation — pushes the first beat's box to 400–819px in a 720px column,
   * so at `scrollTop: 0` the centre line at 360 sits ABOVE it. Symmetrically, the V87 finder-pill
   * reservation at the foot leaves the last beat ending 98px clear of the scroll floor, so at maximum
   * scroll the line at 1985 sits above its top at 2017. Both ends therefore have NO beat on the line,
   * and the observer is structurally silent there — nothing crosses, so nothing is reported.
   *
   * Scrolled hard against an end, the beat at that end is the one being read. Two boundary predicates
   * say so. This is not the hand-rolled scroll math scrollama warns against — there is no offset
   * arithmetic and no ranking; it is the two positions where "which beat crosses the line" has no
   * answer at all.
   */
  function beatAtColumnEnd(): number | null {
    const el = asideEl;
    if (!el || sections.length === 0) return null;
    if (el.scrollTop <= 1) return 0;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) return sections.length - 1;
    return null;
  }

  /** Each scroll of the column asks one question of a live intent — are we there yet? — and hands the
   *  column back the moment the answer is yes, or the moment the intent has outlived its deadline.
   *  `intentActive()` is what consults that deadline; testing `scrollIntent !== null` here instead was
   *  the structural half of the backstop hole (this path never noticed the ceiling at all). With no
   *  intent live, this is also where the two column ends are resolved. */
  function onColumnScroll() {
    if (intentActive()) {
      if (!intentArrived()) return; // still travelling — the observer stays muted
      endIntent();
    }
    const end = beatAtColumnEnd();
    if (end !== null && end !== activeIndex) goToSection(end, { scroll: false });
  }

  /**
   * A direct scroll INPUT from the reader abandons the intent — a human who reaches for the column
   * mid-animation wins immediately, whether or not the programmatic scroll ever arrived.
   *
   * IT MUST STOP THE MACHINE, NOT JUST DROP THE TOKEN, and that distinction shipped a real bounce
   * before review caught it. Clearing `scrollIntent` un-mutes the observer; if the programmatic
   * animation is still running, the observer then reports every beat the animation sweeps past —
   * measured at TEN spurious section changes in ~300ms on a beat-0-to-18 activation, each one clearing
   * the open note and swapping the canvas object. Precisely the defect this whole guard exists to
   * prevent, reintroduced by the thing meant to make it polite.
   *
   * Why `wheel`/`touchstart` looked fine and hid it: Chromium cancels a programmatic smooth scroll when
   * a real scroll GESTURE arrives, so for those the column had genuinely stopped and the un-muted
   * observer saw a still column. `pointerdown` is not a scroll gesture — nothing stops the animation —
   * so it exposed a dependence on browser behaviour this code never stated. Scrolling to the current
   * position cancels the animation ourselves, which makes all four paths honest rather than three of
   * them lucky.
   *
   * `pointerdown` earns its place in the list: a scrollbar drag, a press-and-hold on a beat, starting a
   * text selection in the prose and a right-click all scroll or intend to scroll without ever emitting
   * wheel/touch/key.
   */
  function onColumnInput() {
    const el = asideEl;
    if (scrollIntent !== null && el) el.scrollTo({ top: el.scrollTop, behavior: "auto" });
    endIntent();
  }

  /** Scroll beat `i` onto the column's centre line, under an intent that mutes the observer until the
   *  column gets there. A scroll with nowhere to go arms no intent — there is nothing to suppress. */
  function scrollToBeat(i: number, behavior: ScrollBehavior) {
    const li = beatEls[i];
    const el = asideEl;
    if (!li || !el) return;
    const top = centreTopFor(el, li);
    if (Math.abs(el.scrollTop - top) <= ARRIVE_PX) { endIntent(); return; }
    endIntent(); // a new intent replaces any old one, timer and all
    scrollIntent = i;
    intentTop = top;
    intentDown = top > el.scrollTop;
    intentDeadline = performance.now() + INTENT_MAX_MS;
    // The backstop, armed WITH the intent rather than left for a callback to notice. An intent that
    // never arrives — a reflow moving the target mid-flight is the realistic way — otherwise wedges the
    // highlight for as long as nothing else touches the column, because the observer that would have
    // spotted the expiry is exactly the thing the intent has muted. Re-observing forces a fresh delivery
    // against wherever the column really is.
    intentTimer = setTimeout(() => { endIntent(); resyncObserver?.(); }, INTENT_MAX_MS);
    // `scrollTo` on the column rather than `scrollIntoView` on the beat: we need the destination as a
    // NUMBER to test arrival against, and this scrolls exactly one box — no ancestor walk to reason about.
    el.scrollTo({ top, behavior });
  }

  const reducedMotion = () =>
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Re-selection seam (A0): when ExhibitView's arriveAtNote re-fires on an ALREADY-mounted narrative
  // (search jump Q-4, keyboard index Q-5), `initialSelected` changes to a new note. `selected` and
  // `activeIndex` were only seeded once at init, so without this the re-selection did nothing. Track the
  // previous value; on a new non-null target, select it AND jump to the section whose object owns it
  // (mirrors arrivalSection — the canvas follows `activeSection.start`, so the camera fits the region).
  // svelte-ignore state_referenced_locally -- deliberately the initial value: the previous-value tracker
  // the $effect below compares against; seeding it reactively would defeat the comparison.
  let prevInitialSelected: string | null = initialSelected;
  $effect(() => {
    const next = initialSelected;
    if (next !== null && next !== prevInitialSelected) {
      selected = next;
      // Owner search scans BASE + per-reading pages (4.9) — a reading-only note now lands on its section.
      const ownerId = ownerObjectOf(next, objectIds, { annotationsByObject, readingAnnotationsByObject });
      const idx = sections.findIndex((s) => s.objectId === ownerId);
      // Both halves, as everywhere else now: the camera follows `activeSection.start`, and the prose
      // comes with it. Without the scroll the reader landed on the right image beside the wrong beat.
      // NOT via `goToSection` — that clears `selected`, and this seam has just set it.
      if (idx >= 0) { activeIndex = idx; scrollToBeat(idx, "auto"); }
    }
    prevInitialSelected = next;
  });

  const activeSection = $derived(sections[activeIndex]);

  // V101/V84 (Archie-99b1): publish the deepest rung upward so the address can follow. V84 IS this:
  // the spine carried no address, so stepping out to the index and back lost your place entirely.
  // The section is the narrative's own unit of navigation, so it is the rung here — an object id
  // would be the wrong grain (the spine may revisit one object across several sections).
  $effect(() => {
    onlocus?.({ sectionId: activeSection?.id ?? null, noteId: selected });
  });
  const activeObject = $derived.by(() => {
    // A section whose objectId no longer resolves (its object was deleted in Studio without the section
    // being pruned) must NOT silently fall back to objects[0] — that pairs the WRONG image with this
    // section's prose. Undefined → the render gate surfaces a broken-reference state. Only the no-section
    // case keeps the objects[0] default.
    if (!activeSection) return objects[0];
    return objects.find((o) => o.id === activeSection.objectId);
  });
  const isAV = $derived(activeObject?.mediaType === "sound" || activeObject?.mediaType === "video");
  // Base notes are always visible (Q16); an active Reading overlays its notes on top (ADR-0007) —
  // mirrors ExhibitView.annotationsOf / Reader semantics so the narrative spine carries Readings too.
  const activeNotes = $derived.by(() => {
    if (!activeObject) return [] as W3CAnnotation[];
    const base = annotationsByObject[activeObject.id] ?? [];
    if (activeReading === null) return base;
    return overlay(base, readingAnnotationsByObject[activeObject.id]?.[activeReading]);
  });
  // Scale-aware weight (Archie-c1d9 inherited decision, parity with Reader): wrap the reading styleOf
  // with withZoomBand off the coarse band (memoized BY VALUE so the styleOf identity only re-mints on a
  // band crossing, not every zoom frame). No arrival pulse here — the narrative has no arrival moment.
  const band = $derived(zoomBand(zoomRatio));
  const activeStyleOf = $derived.by<((id: string) => MarkerStyle | undefined) | undefined>(() => {
    const base = activeObject ? styleFor?.(activeObject.id) : undefined;
    const b = band;
    if (!base || b === "mid") return base; // mid = the authored resting weight; keep the stable identity
    return (id: string) => {
      const s = base(id);
      return s ? withZoomBand(s as MarkerStyleSpec, b) : s;
    };
  });
  // 7e1f coverage border (parity with Reader.svelte): the whole-object mark for the ACTIVE object, if any.
  // Without this a selectorless (ADR-0018) whole-object note has no marker (read-overlay skips it — no
  // geometry to draw) AND no sidebar entry (the aside here is the section spine, not a note list) — so it
  // was unreachable in the narrative. The frame's corners activate the same `selected` path a marker does.
  const activeFrame = $derived(activeObject && frameFor ? frameFor(activeObject.id) : null);
  // V46 (Archie-52a0): survives Hide-all — same reasoning as Reader.svelte's canvasFrame. The frame
  // is the canvas's only named tab stop; declutter hides REGION marks, not keyboard infrastructure.
  const canvasFrame = $derived<FrameOverlay | null>(
    activeFrame ? { colour: activeFrame.colour, onActivate: () => (selected = activeFrame.markId) } : null,
  );
  const multiObject = $derived(new Set(sections.map((s) => s.objectId)).size > 1);
  // Per-layer note count on the ACTIVE object for the legend (id=null → base / General notes). Re-mints
  // when the active section's object changes, so the legend's counts track the canvas you're reading.
  const readingCount = $derived.by(() => {
    const oid = activeObject?.id;
    const base = oid ? (annotationsByObject[oid] ?? []) : [];
    const byR = oid ? (readingAnnotationsByObject[oid] ?? {}) : {};
    return (id: string | null): number => (id === null ? base.length : (byR[id]?.length ?? 0));
  });

  // THE one function that owns a section transition — quire's `goToFigureState` shape (canvas-panel.js:68).
  // Every door into a new section goes through here: a spine click, the canvas stepper, the observer.
  // That is the point of the shape: with two entry points each doing half the work, the scroll direction
  // and the activate direction each held part of the state and disagreed (V82 — a cite landed the camera
  // and stranded the prose off-screen).
  //
  // Changing section clears the open note — and the reading sheet with it. The sheet renders under
  // `{#if readingSheet && current}`, so clearing `selected` alone would unmount it while leaving the
  // flag true, and the next plain note selection would open a sheet nobody asked for. Same latent bug
  // as Reader.svelte's object-change effect; same fix, at the one place selection is cleared.
  //
  // `scroll: false` is for the one caller that MUST NOT scroll: the observer, which is reporting where
  // the reader has already scrolled to. Scrolling back at them would be the fight this whole seam exists
  // to prevent — and the intent guard would not even catch it, because the intent would be honest.
  function goToSection(i: number, opts: { scroll?: boolean } = {}) {
    if (i < 0 || i >= sections.length) return;
    activeIndex = i;
    selected = null;
    readingSheet = false;
    if (opts.scroll !== false) scrollToBeat(i, reducedMotion() ? "auto" : "smooth");
  }
  const activate = (i: number) => goToSection(i);

  // Scroll → camera (V81). quire's `intersection-observer-factory.js`, ported: the column as root, a
  // -50%/-50% margin collapsing it to a centre line, threshold 0, act on `isIntersecting`.
  //
  // Rewired (not just re-targeted) whenever the observed set changes — the `<ol>` only exists in the
  // sections pane, and it is unmounted/remounted by the pane toggle and by collapsing the aside. The
  // effect reads exactly those four things and `untrack`s `activeIndex`, because re-running on every
  // activation would tear down and rebuild the observer inside its own callback.
  //
  // The re-sync at the end is load-bearing on ARRIVAL, not just on a pane toggle: a section cite mounts
  // the spine scrolled to the TOP with `activeIndex` already at the cited beat, so the observer's very
  // first callback would report beat 0 and overwrite the cite. Setting the intent synchronously here,
  // before any callback can be delivered, is what makes the cite stick.
  $effect(() => {
    const root = asideEl;
    const pane = asidePane;
    const n = sections.length;
    const collapsed = asideCollapsed;
    if (!root || pane !== "sections" || collapsed || n === 0) return;

    const io = new IntersectionObserver((entries) => {
      if (intentActive()) return; // ← the guard; see the block comment above
      // AN END OF THE COLUMN OUTRANKS THE LINE, at both entry points, or the two disagree and the
      // observer wins the argument. Measured (2026-07-26, `voynich-reading`): scrolled hard to the
      // foot, the line sits on beat 4 of 6 while the reader is plainly at beat 5. The scroll handler
      // set 5, the observer's crossing report for beat 4 landed a frame later, and the last beat was
      // unreachable by scrolling. One rule, checked first in both places.
      const end = beatAtColumnEnd();
      if (end !== null) {
        if (end !== activeIndex) goToSection(end, { scroll: false });
        return;
      }
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const i = beatEls.indexOf(e.target as HTMLElement);
        if (i >= 0 && i !== activeIndex) goToSection(i, { scroll: false });
      }
    }, { root, rootMargin: "-50% 0px -50% 0px", threshold: 0 });

    const observeAll = () => { for (const li of beatEls.slice(0, n)) if (li) io.observe(li); };
    observeAll();
    // Re-observing re-delivers each target's CURRENT state, which is how the backstop asks where the
    // column actually ended up without duplicating the centre-line rule outside the observer.
    resyncObserver = () => { io.disconnect(); observeAll(); };

    // The column's listeners belong to the coupling, not to the `<aside>`'s markup: they carry no
    // interaction a reader has to reach, they are meaningless while the sections pane is unmounted,
    // and writing them as attributes made svelte-check's a11y rule (correctly) flag a non-interactive
    // element with mouse and keyboard handlers. Wired and torn down with the observer they belong to.
    root.addEventListener("scroll", onColumnScroll, { passive: true });
    const INPUTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    for (const ev of INPUTS) root.addEventListener(ev, onColumnInput, { passive: true });

    scrollToBeat(untrack(() => activeIndex), "auto");

    return () => {
      io.disconnect();
      resyncObserver = undefined;
      root.removeEventListener("scroll", onColumnScroll);
      for (const ev of INPUTS) root.removeEventListener(ev, onColumnInput);
      endIntent();
    };
  });

  // Aside pane toggle: the spine (the authored read) or the ACTIVE object's note list. The narrative's
  // aside was sections-only, so an object's notes were reachable solely via canvas markers — fine for a
  // sighted mouse reader who spots the pins, a wall for anyone scanning "what's written on this item?".
  // Notes mode reuses the Reader sidebar's card idiom; a card selects the same `selected` path a marker
  // click does. Per-session component state (like the filmstrip), defaults to the leading read.
  let asidePane = $state<"sections" | "notes">("sections");
  // A note's Reading colour (from the registry) — accents its list card's edge (ADR-0007; mirrors Reader).
  const readingColourOf = (it: W3CAnnotation): string | undefined => {
    const rid = readingIdOf(it);
    return rid !== undefined ? readings.find((r) => r.id === rid)?.colour : undefined;
  };

  // Archie-01a6 — SECTION nav belongs to the canvas, in BOTH aside states.
  //
  // The narrative's mirror of the grid reader's object nav, and the same finding (V65): the spine is the
  // only way to change section, the spine lives in a collapsible aside, and the gap that left had been
  // filled by a stepper inside the NOTE CARD — a control acting on sections from inside a note, present
  // only while the aside was collapsed. Now the nav is anchored to the canvas the sections drive.
  //
  // It behaves exactly like `activate()` (selection cleared), NOT like the popup stepper it replaces:
  // that one deliberately carried the reading forward, selecting the next section-object's first note so
  // the card would survive the step. A note from the section you just left has no claim on the section
  // you just arrived at, and auto-opening one is the nav deciding what to read for you.
  const canvasNav = $derived(sections.length > 1);
  function stepSection(delta: number) {
    const ni = activeIndex + delta;
    if (ni < 0 || ni >= sections.length) return;
    activate(ni);
  }

  // Note popup on marker click (CONTEXT §123 "Both: annomea popup/drawer on marker click"). Narrative
  // was missing this entirely — a clicked marker selected but showed nothing, so notes never surfaced.
  const current = $derived(activeNotes.find((it) => it.id === selected));
  // Hide-all: the canvas shows only the selected note's mark (or nothing) — declutter the basemap while a
  // marker pick still surfaces its single pin. The spine + popup keep the full active-notes set. The framed
  // note's own rect is dropped too (mirrors Reader.svelte's canvasAnnotations) — its coverage border IS its
  // mark, so drawing the underlying shape as well would double it.
  const canvasNotes = $derived.by(() => {
    if (notesHidden) { const sel = activeNotes.find((a) => a.id === selected); return sel ? [sel] : []; }
    return activeFrame ? activeNotes.filter((a) => a.id !== activeFrame.markId) : activeNotes;
  });
  const noteParts = $derived(current ? splitNoteMedia(commentOf(current)) : { media: [] as NoteMediaItem[], text: "" });
  // The note's orientation label — "Section · object" in the narrative (the grid reader uses the plain
  // object label). Derived ONCE and handed to both the card and the reading sheet, so "expand to read"
  // cannot arrive somewhere that names the note differently (V64).
  const noteEyebrow = $derived(
    `${activeSection?.title ?? title}${multiObject && activeObject ? ` · ${activeObject.label}` : ""}`,
  );
  // Geo readout (Q7): a Map note shows its centre lng/lat in the opened popup.
  const geoCoord = $derived.by(() => { if (!current) return null; const g = geoOf(current); return g ? formatLngLat(geoCenter(g)) : null; });
  let lightbox = $state<{ media: NoteMediaItem[]; text: string; index: number } | null>(null);

  // Esc closes the open note-pop (#3), matching the Reader. Guarded so the lightbox / reading sheet own
  // Esc while open; arrows stay with OpenSeadragon (it pans the canvas), so only Esc is bound here.
  // V26/V25 (Archie-3d55) — the same Escape ladder Reader.svelte walks, with the narrative's own top
  // rung: the way UP from a narrative is its object index, not an exhibit overview.
  function onkey(e: KeyboardEvent) {
    if (lightbox || readingSheet) return;
    if (e.key !== "Escape") return;
    if (selected !== null) { selected = null; e.preventDefault(); return; }
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest(".openseadragon-container")) {
      mainEl?.focus({ preventScroll: true });
      e.preventDefault();
      return;
    }
    if (onindex) { onindex(); e.preventDefault(); }
  }

  // V48 (Archie-40fe)'s left-flank reservation was wired here too, and is gone for the same reason it
  // is gone from Reader.svelte: under ADR-0019's layout row the legend and the note card are flow rows,
  // not overlays, so the canvas is the visible window and the plain fit is the correct one.
  let mainEl = $state<HTMLElement | undefined>(undefined);
</script>

<svelte:window onkeydown={onkey} />

<div class="narrative">
  <!-- THE STAGE (ADR-0019 layout row) — canvas chrome bar · canvas · the open note, as ROWS. Same shape
       as Reader.svelte's; see the head comment there. -->
  <div class="stage">
    <!-- Canvas chrome, DOCKED: readings at the leading end, section nav + escapes + readout trailing. -->
    <div class="canvas-dock">
      {#if onreading && readings.length > 0}
        <ReadingLegend {readings} active={activeReading} onselect={onreading} hidden={notesHidden} {onhiddenchange} count={readingCount} oninfo={onreadinginfo} />
      {:else}
        <span class="dock-spacer"></span>
      {/if}
      <!-- Trailing end of the docked bar (ADR-0016 keystone + Archie-93fd): the grid-index escape, the
           section nav and the scale cue. V80 was this group living OUTSIDE `main` and so anchoring to the
           row that also held the prose spine — it landed ON the spine; moving it inside `main` fixed that
           by giving it the canvas as its containing block. Docking makes the whole question moot: there
           is no containing block to get wrong, because there is no absolute positioning left. Grid-index
           escape: the narrative leads, but the object grid stays reachable BEHIND it as an index (§137
           precision-in/escape-out; §223 anti-trap) — shown only when there's a grid to reach (>1 object).
           Scale cue: the locator's companion, HOW FAR IN vs WHERE — hidden during an AV section. -->
      <div class="canvas-chrome-right">
      {#if canvasNav}
        <!-- Archie-01a6: the section nav, present in BOTH aside states, speaking its noun VISIBLY —
             "Section 3 of 6", the same string the spine's own position indicator carries and the same
             string the buttons announce. It joins this reserved flex row rather than claiming its own
             absolute corner, which is what keeps it off the readout beside it (Archie-40fe). -->
        <nav class="canvas-nav" aria-label={navRegionName("section")}>
          <button type="button" class="cn-step" disabled={activeIndex <= 0}
            onclick={() => stepSection(-1)}
            aria-label={navStepName("section", "prev", sections[activeIndex - 1]?.title)}
            title={navStepName("section", "prev", sections[activeIndex - 1]?.title)}><span aria-hidden="true">‹</span></button>
          <span class="cn-pos">{navPosition(activeIndex, sections.length, "section")}</span>
          <button type="button" class="cn-step" disabled={activeIndex >= sections.length - 1}
            onclick={() => stepSection(1)}
            aria-label={navStepName("section", "next", sections[activeIndex + 1]?.title)}
            title={navStepName("section", "next", sections[activeIndex + 1]?.title)}><span aria-hidden="true">›</span></button>
        </nav>
      {/if}
      {#if asideCollapsed && sections.length > 0}
        <!-- Archie-c5cb — the collapsed spine's visible, NAMED way back.
             The ResizeDivider stays a sibling of the collapsed aside (Archie-3d55's anti-trap idiom, and
             re-measured here: its collapse disc is `opacity: 1` while `.collapsed`, so the state is
             reversible). But re-measuring it also showed what it is NOT: a 20px chevron disc on a 10px
             seam whose only WORDS live in `aria-label`. That was survivable when hiding the spine cost
             the reader a panel of prose. After Archie-0d6c it costs them the mode's input device — the
             surface whose scroll drives the camera — so the way back has to say so on screen.
             It joins the canvas-chrome row for exactly the reason Archie-01a6 put the section nav there:
             when the aside is gone, the affordances it owned have to be reachable from the canvas. -->
        <button type="button" class="to-index show-spine" onclick={() => setCollapsed(false)}>
          <span class="grid-mark" aria-hidden="true">☰</span>Show sections
        </button>
      {/if}
      {#if onindex && objects.length > 1}
        <button type="button" class="to-index" onclick={onindex}>
          <span class="grid-mark" aria-hidden="true">▦</span>All items
        </button>
      {/if}
      {#if !isAV}
        <span class="scale-cue" aria-live="polite"><span class="sc-label">Zoom</span> {formatZoomRatio(zoomRatio)}</span>
      {/if}
      </div>
    </div>

    <!-- tabindex="-1": the landing place Escape hands focus to when leaving the canvas (V25). -->
    <main bind:this={mainEl} tabindex="-1">
    {#if activeSection && !activeObject}
      <!-- A section references an object that's no longer in the exhibit (deleted, section not pruned).
           Surface it instead of silently showing the wrong image with this section's prose. -->
      <div class="missing-obj"><span aria-hidden="true">⚠</span><span>This section points to an item that’s no longer in the exhibit.</span></div>
    {:else if activeObject}
      {#if isAV}
        <!-- Keyed so an AV→AV section step remounts the player (its media/error state has no per-object
             reset); mirrors the Canvas branch's {#key activeObject.id} below. -->
        {#key activeObject.id}
          <MediaPlayer object={activeObject} annotations={activeNotes} />
        {/key}
      {:else}
        {#key activeObject.id}
          <Canvas
            source={activeObject.source}
            tileSource={activeObject.tileSource}
            canvasId={canvasIdOf(activeObject.id)}
            annotations={canvasNotes}
            styleOf={activeStyleOf}
            frame={canvasFrame}
            focus={activeSection?.start ?? null}
            bind:selected
            onzoom={(r) => (zoomRatio = r)}
          />
        {/key}
      {/if}
    {/if}
    </main>
    {#if current}
      <!-- THE NOTE (shared NotePopup), in narrative form: the eyebrow is "Section · object" where the
           Reader's is the object label — the mode difference is DATA, which is why one component still
           serves both (Archie-c982). It carries no stepper: section nav is canvas chrome now.
           `hidden-behind-sheet` and the `display: contents` wrapper: see Reader.svelte's note, which
           records the full reasoning — anvil's mount guard (EmbeddedReader.svelte:670/:689) is the
           stronger form and is unavailable here, because unmounting the card takes the ⤢ that
           `use:dialog` returns focus to out of the document (V62/V63). -->
      <div class="note-slot note-dock" class:hidden-behind-sheet={readingSheet}>
      <NotePopup
        eyebrow={noteEyebrow}
        text={noteParts.text}
        media={noteParts.media}
        tags={tagsOf(current)}
        {geoCoord}
        onclose={() => (selected = null)}
        onexpand={() => { if (noteParts.text) readingSheet = true; }}
        onopenfinder={(t) => onopenfinder?.(t)}
        onmedia={(idx) => (lightbox = { media: noteParts.media, text: noteParts.text, index: idx })}
      />
      </div>
    {/if}
  </div>


  <!-- min/max match the spine's responsive clamp(360px … 620px) so a resize can't escape the designed
       reading-measure (#14). -->
  <!-- The two halves of this state persist differently now (Archie-c5cb): width globally in
       localStorage, collapsed per-exhibit in sessionStorage. `setCollapsed` rather than a raw write
       so the divider's chevron and the canvas-chrome "Show sections" button commit identically. -->
  <ResizeDivider side="right" label="narrative" min={360} max={620} bind:width={asideWidth} bind:collapsed={asideCollapsed} oncommit={(s: AsideState) => { saveAsideWidth(ASIDE_W_KEY, s.width); setCollapsed(s.collapsed); }} />
  <!-- Collapsed = give the canvas the page. Section nav survives the collapse now (it is canvas chrome —
       Archie-01a6), so `inert` drops the clipped spine out of the a11y tree + tab order without taking
       the reader's only way through the narrative with it. The ResizeDivider is a sibling, so
       re-expanding stays reachable (§223 anti-trap). -->
  <!-- `bind:this`: this column IS the scroll container (`overflow: auto`), so it is both the observer's
       root and the surface whose quiet ends a programmatic scroll's intent (Archie-0d6c). Its scroll
       and input listeners are attached by that effect, not here — see the comment there. -->
  <aside bind:this={asideEl} class="spine" class:collapsed={asideCollapsed} inert={asideCollapsed} style:--narr-aside-w={asideWidth != null ? `${asideWidth}px` : null}>
    <p class="eyebrow">Narrative · {sections.length} {sections.length === 1 ? "section" : "sections"}
      {#if sections.length > 1}<span class="spine-pos">· {navPosition(activeIndex, sections.length, "section")}</span>{/if}</p>
    <h1>{title}</h1>
    <p class="hint">{asidePane === "sections"
      ? `Read down the page, or jump to any section. The image follows along, zooming to what each section is about${multiObject ? ", and switching between items as you go" : ""}.`
      : "Notes written on the item you’re reading. Select one to open it — its marker lights up on the image."}</p>
    <!-- `rights` here is ALREADY the exhibit's (ExhibitView passes exhibitRights to this reader), so the
         credit line was correct — what was missing is its metadata run (Archie-36e6).

         The credit stays UNCONDITIONALLY VISIBLE and must never move inside the disclosure below: it
         renders the IIIF `requiredStatement`, which is MUST-display, and a closed `<details>` is not
         displayed. The metadata run is `metadata` — additive, not MUST-display (presentation.ts:31) —
         so that is the half that folds. Archie-1474: adding the run at :793 grew this header enough to
         push the pane toggle off-screen on a scrolled narrative, which is the defect being fixed. -->
    <p class="credit-row"><Credit {rights} tone="paper" /></p>
    {#if exhibitMeta.length > 0}
      <details class="meta-fold">
        <summary>Details · {exhibitMeta.length}</summary>
        <MetadataRun rows={exhibitMeta} tone="paper" />
      </details>
    {/if}
    <!-- Pane toggle: the authored read (sections) ⇄ the active object's notes. Without it, an item's
         notes were reachable only by spotting canvas markers — no listable surface in the narrative. -->
    <div class="pane-toggle" role="group" aria-label="Show sections or notes">
      <button type="button" class:active={asidePane === "sections"} aria-pressed={asidePane === "sections"} onclick={() => (asidePane = "sections")}>Sections</button>
      <button type="button" class:active={asidePane === "notes"} aria-pressed={asidePane === "notes"} onclick={() => (asidePane = "notes")}>Notes · {activeNotes.length}</button>
    </div>
    {#if asidePane === "sections"}
    <ol class="sections">
      {#each sections as s, i (s.id)}
        <li bind:this={beatEls[i]}>
          <button class:active={i === activeIndex} aria-current={i === activeIndex ? "true" : undefined} onclick={() => activate(i)}>
            <!-- V85: number the beats. Once the active beat moves under the reader — the scroll now
                 drives it — "where am I" cannot be answered by typographic emphasis alone: the reader
                 has to look at the highlight and count. Every beat states its own position, in the
                 noun-and-position idiom `SidebarObjectNav` and Archie-01a6 already use ("Section 3 of
                 6", `navPosition`), so the answer is legible from whichever beat you are looking at.
                 Its own element, deliberately OUTSIDE `.num`: narrative.spec.ts's V86 label assertions
                 read `.num`'s first child text node and its `.obj` span, and a position string folded
                 in there would be read as part of the section title. -->
            <span class="beat-pos">{navPosition(i, sections.length, "section")}</span>
            <!-- V86: rendered as `HERBAL· F1R — HERBAL (OPENING PAGE)` — the leading space inside <span
                 class="obj"> is trimmed at compile time, so at letter-spacing 0.16em the separator sat
                 flush against the section title; and the section title and the object label both carry
                 the division name, so the reader was told "Herbal" twice in one line. The separator now
                 owns its own spacing in CSS, and the object label is shown only when it says something
                 the section title hasn't. -->
            <span class="num">{s.title}{#if multiObject && objects.length > 1}{@const objLabel = objects.find((o) => o.id === s.objectId)?.label ?? ""}{#if objLabel && !objLabel.toLowerCase().includes(s.title.toLowerCase())}<span class="obj">{objLabel}</span>{/if}{/if}</span>
            <div class="prose"><ProseCites text={s.prose ?? ""} /></div>
          </button>
        </li>
      {/each}
    </ol>
    {:else}
    <!-- The active object's note list — the Reader sidebar's card idiom (reading-colour edge, 3-line
         preview clamp, per-card tag chips as finder facets). A card drives the SAME `selected` path a
         marker click does, so the shared NotePopup floats identically. Re-mints as the spine crosses
         objects (activeNotes tracks the active section's object). -->
    {#if multiObject && activeObject}<h2 class="eyebrow notes-obj">On “{activeObject.label}”</h2>{/if}
    {#if activeNotes.length === 0}
      <p class="empty">No notes on this item yet.</p>
    {/if}
    <ul class="notes-list">
      {#each activeNotes as it, i (it.id)}
        <li>
          <!-- Archie-dbbc / V60, ported from the Reader's list for the same reason: while its note is
               open this entry MARKS POSITION and stops restating the text. Both note lists in the viewer
               are the same idiom, so both had the same duplication. -->
          <button class:active={it.id === selected} aria-current={it.id === selected ? "true" : undefined} style="border-left-color: {readingColourOf(it) ?? 'transparent'}" onclick={() => (selected = it.id)}>
            {#if it.id === selected}
              <span class="card-open">{noteIndexOpenMark(i, activeNotes.length)}</span>
            {:else}
              <span class="card-preview">{stripMarkdown(commentOf(it))}</span>
            {/if}
          </button>
          {#if tagsOf(it).length}<span class="card-tags">{#each tagsOf(it) as t}<button type="button" class="tag tag-btn" onclick={() => onopenfinder?.(t)}>#{t}</button>{/each}</span>{/if}
        </li>
      {/each}
    </ul>
    {/if}
  </aside>


  {#if readingSheet && current}
    <!-- Same note, same eyebrow, reading size. `noteEyebrow` is ONE derived value feeding both surfaces,
         so the sheet cannot introduce its own idea of what you are reading (V64).
         ONE MODAL AT A TIME: the finder and the lightbox are both `aria-modal="true"`, as is this sheet,
         so both routes out of it close it first — the new surface replaces the sheet rather than
         stacking on it. Full reasoning in Reader.svelte's twin of this block. -->
    <ReadingSheet
      eyebrow={noteEyebrow}
      text={noteParts.text}
      media={noteParts.media}
      tags={tagsOf(current)}
      {geoCoord}
      onclose={() => (readingSheet = false)}
      onopenfinder={(t) => { readingSheet = false; onopenfinder?.(t); }}
      onmedia={(idx) => { readingSheet = false; lightbox = { media: noteParts.media, text: noteParts.text, index: idx }; }}
    />
  {/if}

  {#if lightbox}
    <NoteLightbox media={lightbox.media} text={lightbox.text} index={lightbox.index} onclose={() => (lightbox = null)} />
  {/if}
</div>

<style>
  /* Prose-led reading (Soft Static, narrative): the canvas floats on the warm gradient ground (left);
     the prose spine reads as a field journal on warm paper (right); section nav chrome is quiet mono,
     the active section is marked by a single rationed signal-orange edge — not a loud fill. Soft serif
     headings, generous radii, wide low-opacity warm shadows. No hard pixel edge anywhere. */
  .narrative { position: relative; display: flex; height: 100%; min-height: 0; background: var(--surface-canvas); }
  /* THE STAGE — canvas chrome bar · canvas · the open note, as rows (ADR-0019's layout row). */
  .stage { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  main { position: relative; flex: 1 1 auto; min-height: 0; min-width: 0; background: var(--surface-canvas); }
  .canvas-dock {
    flex: none; display: flex; align-items: center; justify-content: space-between;
    gap: var(--space-4); padding: var(--space-2) var(--space-5);
    background: var(--surface-canvas); border-bottom: 1px solid var(--border-canvas);
  }
  .dock-spacer { flex: 1 1 auto; }
  .note-dock {
    flex: none; max-height: 38%; min-height: 0; overflow: auto;
    background: var(--surface-canvas); border-top: 1px solid var(--border-canvas);
  }
  /* Broken-reference state: a section points at a deleted object. Quiet found-meta chrome over the canvas
     ground, not a loud error — the rest of the spine still reads. */
  .missing-obj { display: flex; gap: var(--space-3); align-items: center; justify-content: center; height: 100%; padding: var(--space-6); color: var(--ink-canvas-secondary); font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-sm); }

  aside {
    /* Width = a token: responsive by default (clamp), drag-resizable via --narr-aside-w (Phase 2). */
    width: var(--narr-aside-w, clamp(360px, 32vw, 620px)); flex-shrink: 0; overflow: auto; box-sizing: border-box;
    /* Plain padding. Two reservations used to live in this one declaration and both are retired: the
       top reserved the FIXED top bar (`--pane-top`), and the bottom reserved the fixed finder pill's
       whole footprint (`--strip-h` + `--finder-h`) because the pill lived at the viewport's
       bottom-right, inside this column's x range (spine 860–1280, pill 1102–1260), and sat on whatever
       the reader had scrolled to — measured cutting section 1's embedded cite card mid-word
       ("→ open obj|"), and getting WORSE when V22 lifted the pill clear of the filmstrip. Both the bar
       and the pill are docked now, so the spine's last card cannot be under either of them. That is
       V87 closing the same way V22/V71/V48 do: obviated. */
    padding: var(--space-5) var(--space-5) var(--space-6);
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border-left: 1px solid var(--border-canvas);
  }
  /* Collapsed = give the canvas the whole page (image-first). Divider stays (anti-trap §223: always expandable). */
  aside.collapsed { width: 0; min-width: 0; padding: 0; border-left: 0; overflow: hidden; }
  .eyebrow { color: var(--ink-paper-muted); }
  /* Persistent position indicator (Phase 4 / §146): "Section N of M", live as the spine scrolls. A quiet
     tabular-numeral echo in the eyebrow — connector-blue lifts it just off the category label beside it. */
  .spine-pos { color: var(--accent-2); font-variant-numeric: tabular-nums; }
  aside h1 { font-family: var(--font-display); font-weight: 300; font-size: 2rem; line-height: 1.2; margin: var(--space-2) 0 var(--space-3); color: var(--ink-paper-primary); text-shadow: var(--shadow-text-haze); }
  .hint { font-family: var(--font-body); font-size: 0.8rem; line-height: 1.6; color: var(--ink-paper-secondary); margin: 0 0 var(--space-5); }

  /* Pane toggle (sections ⇄ notes) — a quiet segmented pair in the spine's mono eyebrow voice; the
     active pane gets the muted-accent fill (the same "you are here" mark the active section card uses),
     never a loud orange. */
  /* STICKY, because this column is the scroll container (`aside { overflow: auto }`) and the toggle is
     the only way to reach an item's notes. Before Archie-1474 it scrolled away with the header, so the
     further a reader got into a narrative the more unreachable the Notes pane became — the reported
     defect. `top: 0` pins it to the scrollport's top edge; the aside's own top padding scrolls beneath.
     The negative horizontal margin bleeds the bar into that padding so section cards passing underneath
     cannot peek at its left and right edges, and the padding puts the buttons back where they were. */
  .pane-toggle {
    display: flex; gap: var(--space-2);
    position: sticky; top: 0; z-index: 2;
    margin: 0 calc(var(--space-5) * -1) var(--space-4);
    padding: var(--space-3) var(--space-5);
    background: var(--surface-paper);
    border-bottom: 1px solid var(--border-canvas);
  }

  /* The exhibit's Dublin Core rows, folded. Open they are the tallest thing in this header, and every
     pixel here pushes the sticky bar's resting position down and eats the spine. Closed by default —
     descriptive metadata is reference material a reader consults, not something they read on arrival.
     The credit line above is deliberately NOT in here (MUST-display; see the markup comment). */
  .meta-fold { margin: 0 0 var(--space-4); }
  .meta-fold > summary {
    cursor: pointer; list-style: none; display: inline-flex; align-items: center; gap: var(--space-2);
    padding: var(--space-1) 0;
    font-family: var(--font-ui); font-size: 0.7rem; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-paper-muted);
    transition: color 160ms ease;
  }
  .meta-fold > summary::-webkit-details-marker { display: none; }
  /* The affordance: a caret that turns. Drawn here rather than left to the UA marker so the row keeps
     the eyebrow's voice, and so `list-style: none` above cannot leave it with no open/closed signal. */
  .meta-fold > summary::before {
    content: "▸"; display: inline-block; font-size: 0.85em;
    transition: transform 160ms ease;
  }
  .meta-fold[open] > summary::before { transform: rotate(90deg); }
  .meta-fold > summary:hover { color: var(--ink-paper-primary); }
  .meta-fold > summary:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 2px; border-radius: var(--radius-sm); }
  .meta-fold[open] > summary { margin-bottom: var(--space-2); }
  .pane-toggle button {
    flex: none; cursor: pointer; padding: var(--space-2) var(--space-3);
    background: none; border: none; border-radius: var(--radius-sm);
    font-family: var(--font-ui); font-size: 0.7rem; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-paper-muted);
    transition: background 160ms ease, color 160ms ease;
  }
  .pane-toggle button:hover { color: var(--ink-paper-primary); }
  .pane-toggle button.active { background: var(--accent-muted); color: var(--ink-paper-primary); }

  .sections { list-style: none; margin: 0; padding: 0; counter-reset: none; }
  .sections li { margin-bottom: var(--space-3); }
  .sections button {
    display: block; width: 100%; text-align: left; cursor: pointer;
    padding: var(--space-3) var(--space-4) var(--space-3) var(--space-5);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: none; border-left: 2px solid transparent;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
    transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  }
  .sections button:hover { background: var(--surface-paper-hover); box-shadow: var(--shadow-lift-mid); }
  .sections button.active { border-left-color: var(--accent); background: var(--accent-muted); box-shadow: var(--shadow-lift-mid); }
  /* Per-beat position (V85) — the quietest thing on the card: tabular mono, muted, on its own line
     above the title. It locates; it must never compete with the prose it labels. The ACTIVE beat's
     lifts to connector-blue, the same "you are here" register `.spine-pos` uses in the eyebrow. */
  .beat-pos {
    display: block; font-family: var(--font-mono), monospace; font-variant-numeric: tabular-nums;
    font-size: 0.68rem; letter-spacing: 0.08em; color: var(--ink-paper-muted);
    margin-bottom: var(--space-1);
  }
  .sections button.active .beat-pos { color: var(--accent-2); }
  .num { display: inline-block; font-family: var(--font-ui); font-size: 0.7rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-paper-secondary); margin-bottom: var(--space-2); }
  /* The separator lives here, not in the markup, so compile-time whitespace trimming can't eat it (V86). */
  .num .obj::before { content: " · "; }
  .num .obj { color: var(--ink-paper-muted); letter-spacing: 0.14em; }
  .prose { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.65; color: var(--ink-paper-primary); }
  .prose :global(p) { margin: 0 0 var(--space-2); }
  .prose :global(p:last-child) { margin-bottom: 0; }
  .prose :global(strong) { font-weight: 600; }
  .prose :global(em) { font-style: italic; }
  /* Cite link-scent: underline + cursor so it reads as clickable; the ¶ seal marks an intra-Library
     cite (hash route into this viewer), matching the author-side ¶ Cite affordance. */
  .prose :global(a) { color: var(--accent-2); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.15em; cursor: pointer; }
  .prose :global(a[href*="#/"]:not(.cite-card))::after { content: "¶" / ""; margin-left: 0.15em; font-size: 0.7em; vertical-align: 0.35em; opacity: 0.6; text-decoration: none; }
  .prose :global(img) { max-width: 100%; height: auto; border-radius: var(--radius-sm); margin-top: var(--space-2); }
  .prose :global(audio) { width: 100%; margin-top: var(--space-2); }
  /* Pulled quotes read as soft serif set off by a warm clay hairline rule. */
  .prose :global(blockquote) { margin: var(--space-3) 0; padding: 0 0 0 var(--space-4); border-left: 1px solid var(--accent-3); font-family: var(--font-display-2); font-weight: 600; font-style: italic; font-size: 1.2rem; line-height: 1.5; color: var(--ink-paper-secondary); }

  /* Trailing end of the docked chrome bar (Archie-93fd) — grid-index escape, section nav, scale cue. */
  .canvas-chrome-right {
    display: flex; align-items: center; gap: var(--space-2);
  }
  /* Section nav (Archie-01a6) — the twin of Reader.svelte's object nav, ported verbatim so the two
     readers' canvas chrome reads as one control (its legibility rationale is documented there: the
     plate is opaque, not a scrim). Deliberate duplication, on the same grounds as `getFitOptions`
     above: the two readers differ in container structure and in what they step, and the only shared
     part is a pill of markup whose WORDING already lives in `product-copy`. */
  .canvas-nav {
    display: inline-flex; align-items: center; gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    background: var(--surface-canvas-raised); border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
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
  /* Grid-index escape — a quiet canvas overlay, sibling to the legend (same warm-paper pill language).
     Recedes so the read stays the star, but is always reachable so the narrative can never trap the
     visitor (§223 anti-trap, §137 escape-out). Connector-blue (--accent-2) hover — the secondary
     up/nav signal — keeps the rationed orange for the one focal action, and is the established
     green-on-dark-canvas contrast rescue (system.md §contrast). */
  .to-index {
    display: inline-flex; align-items: center; gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-secondary);
    border: none; border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low); cursor: pointer;
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-sm);
    letter-spacing: 0.04em; transition: color 160ms ease;
  }
  .to-index:hover { color: var(--accent-2); }
  .to-index .grid-mark { font-size: 0.95rem; line-height: 1; color: var(--ink-canvas-muted); transition: color 160ms ease; }
  .to-index:hover .grid-mark { color: var(--accent-2); }
  /* Scale cue — the locator's missing companion (HOW FAR IN vs WHERE), ported verbatim from
     Reader.svelte so the two readers' cues read identically. Deliberately the quietest thing in the
     group: no button chrome, muted mono text — a readout, not an action. */
  .scale-cue {
    padding: var(--space-1) var(--space-2);
    font-family: var(--font-mono), monospace; font-size: 0.72rem; letter-spacing: 0.02em;
    color: var(--ink-canvas-muted);
    background: var(--surface-canvas-raised); border-radius: var(--radius-sm);
    pointer-events: none;
  }
  .scale-cue .sc-label {
    font-family: var(--font-ui), sans-serif; font-size: 0.65rem; font-weight: 500;
    letter-spacing: 0.18em; text-transform: uppercase; margin-right: 2px;
  }

  /* Notes pane — the Reader sidebar's note-card idiom, ported verbatim so the two note lists read as
     one component (warm paper card, 3px Reading-colour edge, 3-line scan clamp, per-card tag chips). */
  .notes-obj { margin: 0 0 var(--space-3); }
  .notes-list { list-style: none; margin: 0; padding: 0; }
  .notes-list li > button {
    display: block; width: 100%; text-align: left; cursor: pointer;
    padding: var(--space-3) var(--space-4); margin-bottom: var(--space-3);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: none; border-left: 3px solid transparent;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
    font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.45;
    transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  }
  .notes-list li > button:hover { background: var(--surface-paper-hover); border-left-color: var(--accent); box-shadow: var(--shadow-lift-mid); }
  .notes-list li > button.active { background: var(--accent-muted); box-shadow: var(--shadow-lift-mid); }
  .card-preview { display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  /* The open entry's position mark (Archie-dbbc / V60) — the index's chrome voice, not body prose. */
  .card-open { display: block; font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-paper-secondary); }
  .card-tags { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }
  .tag { font-family: var(--font-mono); font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-secondary); background: var(--surface-paper-hover); padding: 2px var(--space-3); border-radius: var(--radius-sm); }
  .tag-btn { border: none; cursor: pointer; transition: color 160ms ease, background 160ms ease; }
  .tag-btn:hover { color: var(--ink-paper-primary); background: var(--accent-muted); }
  .empty { font-family: var(--font-body); font-size: 1rem; line-height: 1.6; color: var(--ink-paper-secondary); padding: var(--space-4); background: var(--surface-paper-hover); border-radius: var(--radius-md); }

  /* The standalone note card's styles now live in the shared NotePopup.svelte component. */
  /* The card's slot (Archie-dbbc / V60). `display: contents` generates no box, so the card keeps
     `.narrative` as its containing block and its absolute anchoring is unchanged; `display: none`
     takes the whole card off screen and out of the a11y tree while the reading sheet — the SAME note,
     larger — is open, without unmounting the ⤢ that `use:dialog` returns focus to. */
  .note-slot.hidden-behind-sheet { display: none; }
</style>
