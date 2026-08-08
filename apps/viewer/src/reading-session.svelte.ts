// ONE Reading concept (Phase 5, reading-surface home; ADR-0007/0016). The exhibit's reading state
// used to be ~15 locals scattered through ExhibitView — activeReading, notesHidden, the wall-text
// threshold machine (wallSeen/openReading/dismissWallText/reopenWallText/wallStats), the per-object
// note counts, and the style minting (readingColourById/readingStyleOf/frameFor/annotationById) —
// with the PURE gating rules living in reading-walltext.ts and the seen-set hand-rolled in ~6
// functions INSIDE the component. Everything the readers + legend + wall-text dialog need now
// lives here; ExhibitView constructs one session per exhibit and threads the SAME prop surface it
// always did (the readers and ReadingLegend are unchanged consumers).
//
// The wall-text threshold machine (plan 2026-07-29) is the session's own: raise on activation
// (first entry per visit), record on dismiss, ignore-seen reopen via the legend's (i). The pure
// gates (`wallTextFor`/`visibleReadings`) stay in reading-walltext.ts — this module holds the
// STATE. The seen-store is injectable so the machine is headless-testable next to those rules.
import { overlay, readingMarkerStyle, emphasisOf, selectorOf, isWholeObjectFor, wholeObjectFlagOf, type Reading, type W3CAnnotation } from "@render/core";
import type { MarkerStyle } from "@render/svelte";
import { wallTextFor, wallTextSeenKey } from "./reading-walltext.js";

/** What the session reads off the published exhibit — a structural subset (ExhibitView passes the
 *  full PublishedExhibit; tests pass a minimal fixture). */
export interface ReadingSessionData {
  readings: Reading[];
  objects: readonly { id: string }[];
  annotationsByObject: Record<string, W3CAnnotation[]>;
  readingAnnotationsByObject: Record<string, Record<string, W3CAnnotation[]>>;
}

/** The seen-set seam — sessionStorage by default (SESSION semantics: "first entry per visit"),
 *  injectable so the threshold machine is testable headlessly. */
export interface WallTextStore {
  seen(rid: string): boolean;
  record(rid: string): void;
}

export interface ReadingSessionDeps {
  /** Scopes the wall-text seen key per exhibit (wallTextSeenKey). */
  slug: string;
  /** The live exhibit — re-read per render (starts null, fills on mount). */
  data: () => ReadingSessionData | null;
  /** The seen-store; defaults to sessionStorage (see below). */
  store?: WallTextStore;
}

/** sessionStorage can throw (privacy modes). Degrade both ways to "never block": unreadable → treat
 *  as seen (no dialog), unwritable → the reading re-introduces itself next activation. Never an error. */
function defaultStore(slug: string): WallTextStore {
  return {
    seen: (rid) => {
      try {
        return sessionStorage.getItem(wallTextSeenKey(slug, rid)) === "1";
      } catch {
        return true;
      }
    },
    record: (rid) => {
      try {
        sessionStorage.setItem(wallTextSeenKey(slug, rid), "1");
      } catch {
        /* degrade — the reading re-introduces itself next activation */
      }
    },
  };
}

/** The Reading session one exhibit owns: the active layer + hide-all toggles, the wall-text
 *  threshold machine, and the per-object projections the readers and legend consume. */
export interface ReadingSession {
  activeReading: string | null;
  notesHidden: boolean;
  /** Hover-solo (the Reader list's hover → the mark lights up) — read INSIDE readingStyleOf so the
   *  template's `styleOf={readingStyleOf(...)}` expression depends on it and re-mints the closure
   *  identity on change (Canvas only re-applies styles when the prop identity changes). */
  hoverNote: string | null;
  /** The wall-text dialog currently up, or null. Raised on first entry per visit via the legend
   *  radios; NEVER by the A0 note-arrival seam (the note is the destination). */
  wallReading: Reading | null;
  /** Exhibit-wide wall-text stats — the threshold speaks for the whole pass (note count + how many
   *  objects carry the reading's notes). */
  wallStats: { notes: number; sources: number };
  /** Every legend radio routes through here — activation is where the threshold is. */
  openReading(id: string | null): void;
  /** Seen is recorded on DISMISS, not open — a reload mid-read shows the text again, not loses it. */
  dismissWallText(): void;
  /** The legend's (i): reread on demand — ignores seen (silence rules live in wallTextFor's cases). */
  reopenWallText(): void;
  /** Base notes are always visible (Q16); an active Reading overlays its notes on top of the base. */
  annotationsOf(objectId: string): W3CAnnotation[];
  /** Per-reading note count on a given object for the ReadingLegend (id=null → base / General notes).
   *  The count is per-OBJECT — the current image — matching the legend's per-canvas overlay action.
   *  Reading-independent (it counts attachment, not what's active), so it's stable as you toggle
   *  readings and only re-mints when the object changes. */
  readingCountOf(objectId: string): (id: string | null) => number;
  /** Colour each marker by its Reading (ADR-0007): annotation-id → reading colour for an object. */
  readingColourById(objectId: string): Record<string, string>;
  /** Per-note marker style by annotation id — colours a marker by its Reading, weighted by emphasis,
   *  with the hover solo folded in. ONE style source shared with Studio (render-core
   *  readingMarkerStyle). */
  readingStyleOf(objectId: string): (id: string) => MarkerStyle | undefined;
  /** The single mark that frames the WHOLE object (first qualifying), or null (7e1f coverage
   *  border). A bare-IRI Object-level Note always frames; a region note frames via the ≥75%
   *  coverage heuristic or the authored region-override. */
  frameFor(objectId: string, w?: number, h?: number): { markId: string; colour: string } | null;
}

// Forest-green neutral default for reading-less (base) marks (system.md §"Base notes") — same
// stroke-over-stroke opacities as the reading style, so emphasis modulates a VISIBLE base mark.
const ACCENT = "#3A8C5D"; // emerald base mark (--accent) — clears ~4.7:1 on the near-black light-table canvas
// 0045 contrast rule: the frame draws over the near-black light-table canvas (#181714), NOT the
// grey overlay (#252420) the rule actually targets — and forest-green-on-canvas is the established
// normal (the active-object ring is green here). A raw WCAG ratio would wrongly fail green on the
// dark canvas (~2.9:1) and flip every frame to amber, so per the contract we default to the reading
// colour (or the green base) and leave the amber rescue as a TODO.
// TODO(0045): surface-aware contrast rescue to golden-amber (--accent-2 #d6a23e) — needs the actual
// surface luminance under the frame (light-table vs grey overlay vs photo region), not a fixed pair.
const frameColour = (colour: string): string => colour;
const noNotes: W3CAnnotation[] = [];

export function createReadingSession(deps: ReadingSessionDeps): ReadingSession {
  const store = deps.store ?? defaultStore(deps.slug);
  let activeReading = $state<string | null>(null); // ADR-0007 / Q16: base-only by default; null = base
  let notesHidden = $state(false); // ReadingLegend "Hide all" — declutter the canvas to the bare basemap/image
  let hoverNote = $state<string | null>(null);
  let wallReading = $state<Reading | null>(null);

  const wallStats = $derived.by(() => {
    let notes = 0;
    let sources = 0;
    const d = deps.data();
    const wr = wallReading;
    if (wr && d) {
      for (const o of d.objects) {
        const n = d.readingAnnotationsByObject[o.id]?.[wr.id]?.length ?? 0;
        if (n > 0) {
          notes += n;
          sources += 1;
        }
      }
    }
    return { notes, sources };
  });

  function openReading(id: string | null) {
    activeReading = id;
    wallReading = wallTextFor(id, deps.data()?.readings ?? [], store.seen);
  }

  function dismissWallText() {
    if (wallReading) store.record(wallReading.id);
    wallReading = null;
  }

  function reopenWallText() {
    const r = deps.data()?.readings.find((x) => x.id === activeReading);
    if (r) wallReading = r;
  }

  function annotationsOf(objectId: string): W3CAnnotation[] {
    const d = deps.data();
    if (!d) return noNotes;
    const base = d.annotationsByObject[objectId] ?? noNotes;
    if (activeReading === null) return base;
    return overlay(base, d.readingAnnotationsByObject[objectId]?.[activeReading]);
  }

  function readingCountOf(objectId: string): (id: string | null) => number {
    const d = deps.data();
    const base = d?.annotationsByObject[objectId] ?? noNotes;
    const byR = d?.readingAnnotationsByObject[objectId] ?? {};
    return (id: string | null): number => (id === null ? base.length : (byR[id]?.length ?? 0));
  }

  function readingColourById(objectId: string): Record<string, string> {
    const m: Record<string, string> = {};
    const d = deps.data();
    if (!d) return m;
    const byR = d.readingAnnotationsByObject[objectId] ?? {};
    for (const r of d.readings) {
      if (!r.colour) continue;
      for (const a of byR[r.id] ?? []) if (a.id) m[a.id] = r.colour;
    }
    return m;
  }

  // 1489 emphasis — id → visible annotation, built from the SAME source the canvas renders
  // (annotationsOf = base + active reading), so base notes pick up emphasis too (never hue, ADR-0007).
  function annotationById(objectId: string): Record<string, W3CAnnotation> {
    const m: Record<string, W3CAnnotation> = {};
    for (const a of annotationsOf(objectId)) if (a.id) m[a.id] = a;
    return m;
  }

  function readingStyleOf(objectId: string): (id: string) => MarkerStyle | undefined {
    const colourBy = readingColourById(objectId);
    const annBy = annotationById(objectId);
    const hovered = hoverNote; // captured per mint — the read that re-mints identity
    return (id) =>
      readingMarkerStyle(colourBy[id] ?? ACCENT, annBy[id] ? emphasisOf(annBy[id]!) : "normal", { highlighted: hovered === id });
  }

  function frameFor(objectId: string, w?: number, h?: number): { markId: string; colour: string } | null {
    const colourBy = readingColourById(objectId);
    for (const a of annotationsOf(objectId)) {
      if (!a.id) continue;
      if (isWholeObjectFor(selectorOf(a), w ?? 0, h ?? 0, wholeObjectFlagOf(a))) {
        return { markId: a.id, colour: frameColour(colourBy[a.id] ?? ACCENT) };
      }
    }
    return null;
  }

  return {
    get activeReading() {
      return activeReading;
    },
    set activeReading(v: string | null) {
      activeReading = v;
    },
    get notesHidden() {
      return notesHidden;
    },
    set notesHidden(v: boolean) {
      notesHidden = v;
    },
    get hoverNote() {
      return hoverNote;
    },
    set hoverNote(v: string | null) {
      hoverNote = v;
    },
    get wallReading() {
      return wallReading;
    },
    get wallStats() {
      return wallStats;
    },
    openReading,
    dismissWallText,
    reopenWallText,
    annotationsOf,
    readingCountOf,
    readingColourById,
    readingStyleOf,
    frameFor,
  };
}
