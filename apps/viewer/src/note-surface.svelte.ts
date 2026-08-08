// ONE open-note state machine (Phase 5, reading-surface home). The three reading hosts — Reader,
// NarrativeReader, MediaPlayer — each used to re-implement the same surface: `selected` +
// `readingSheet` + `lightbox` state, the `current`/`noteParts`/`geoCoord` derivations, and the
// popup/sheet/lightbox mount handlers (~100 ln of near-identical code per host, differing only in
// the text source — commentOfAnnotation vs transcriptTextOf — and the eyebrow). The same three
// defects were found and fixed IN EACH COPY: hidden-behind-sheet (Archie-dbbc), the
// readingSheet-stuck-after-object-change flag, and the one-modal-at-a-time sheet/replace rule.
// The precedent is aside-persistence.ts (the shared I/O module the readers duplicated verbatim);
// this is the rune-based factory form of that idea — each host constructs its surface once and
// renders the three mounts from its state.
//
// What the host still owns: the Canvas binding (bind:selected + zoomOnSelect in the spatial
// readers, seek in the AV player — `onSelect` is the seam for the latter), the Escape ladder's
// up-a-level rungs (onback vs onindex vs onoverview), and the object/section-change reset calls
// `reset()`.
import {
  splitNoteMedia,
  tagsOfAnnotation,
  geoOf,
  geoCenter,
  formatLngLat,
  type NoteMediaItem,
  type W3CAnnotation,
} from "@render/core";

export interface NoteSurfaceDeps {
  /** The host's LIVE note list (a closure over its `annotations` prop). Re-read per render, so the
   *  derived `current` tracks object/reading changes the same way the inline `$derived` did. */
  annotations: () => W3CAnnotation[];
  /** The note's body text source — commentOfAnnotation (spatial readers) vs transcriptTextOf (AV;
   *  load-bearing there: a transcript-imported cue carries `purpose: "supplementing"`, which
   *  commentOfAnnotation does not match). */
  textOf: (note: W3CAnnotation) => string;
  /** The eyebrow — object label (Reader/MediaPlayer) vs "Section · object" (NarrativeReader). A
   *  FUNCTION, not a string: the narrative's label is itself derived and must stay live (V64: the
   *  card and the sheet must name the same thing — one value feeds both). */
  eyebrow: () => string;
  /** A tag chip was clicked (Q-4) — open the mode-independent finder pre-scoped with that tag.
   *  Absent ⇒ the surface renders NO tags at all (MediaPlayer's gating, made universal): a tag chip
   *  with no handler is a control that renders and does nothing. */
  onopenfinder?: (tag: string) => void;
  /** The host's canvas-binding callback — what selecting a note does BEYOND the surface. The
   *  spatial readers pass nothing (their Canvas is bound via `bind:selected` + `zoomOnSelect`);
   *  the AV player passes a seek closure so one click both selects and travels the recording. */
  onSelect?: (noteId: string) => void;
  /** Deep-link arrival seed: land selected on this note on mount (Reader/NarrativeReader pass
   *  `initialSelected`). Seed-once by design, exactly like the old `$state(initialSelected)`. */
  initialSelected?: string | null;
}

/** The lightbox payload — the note's full content plus the tile index that opened it. */
export interface NoteLightboxState {
  media: NoteMediaItem[];
  text: string;
  index: number;
}

export interface NoteParts {
  media: NoteMediaItem[];
  text: string;
}

/** The note surface one host owns: the mount state the template renders from, the derived content
 *  the mounts consume, and the transitions that keep the sheet/lightbox/card invariants. */
export interface NoteSurface {
  // State (get/set so `bind:selected={surface.selected}` on Canvas keeps working).
  selected: string | null;
  readingSheet: boolean;
  lightbox: NoteLightboxState | null;
  // Derived content for the mounts.
  current: W3CAnnotation | null;
  noteParts: NoteParts;
  geoCoord: string | null;
  tags: string[];
  eyebrow: string;
  // Transitions.
  /** Select a note (marker/list click) — applies the host's canvas-binding callback too. */
  open(noteId: string): void;
  /** Dismiss the note (the card's ×). Only the card can reach this: the sheet has its own ×. */
  close(): void;
  /** ⤢ on the card — open the reading sheet. Text-only: NotePopup renders ⤢ only `{#if text}`, so
   *  a media-only note has no expand affordance (the old `else if media → lightbox` branches in
   *  Reader/MediaPlayer were unreachable dead code — unified away). */
  expand(): void;
  /** A media tile was clicked — open the lightbox at that index. */
  media(index: number): void;
  /** A tag chip was clicked on the CARD (the card is not modal — nothing closes). */
  openFinder(tag: string): void;
  /** The sheet's × — "read less", collapses back to the card and deliberately leaves `selected`. */
  sheetClose(): void;
  /** A tag chip inside the SHEET: ONE MODAL AT A TIME (Archie-dbbc) — the finder replaces the
   *  sheet rather than stacking on it, so close first. */
  sheetFinder(tag: string): void;
  /** A media tile inside the SHEET: same one-modal rule — the lightbox replaces the sheet. */
  sheetMedia(index: number): void;
  closeLightbox(): void;
  /** The object/section actually changed — clear selection AND the sheet AND the lightbox. The
   *  sheet renders under `readingSheet && current`, so clearing `selected` alone would leave the
   *  flag true and the next plain selection would open a sheet nobody asked for (the latent bug
   *  fixed in both readers; `lightbox` is cleared with them — the modal scrim makes it unreachable
   *  today, and it stops being latent the moment any control can change the object). */
  reset(): void;
}

const EMPTY_PARTS: NoteParts = { media: [], text: "" };

export function createNoteSurface(deps: NoteSurfaceDeps): NoteSurface {
  let selected = $state<string | null>(deps.initialSelected ?? null);
  let readingSheet = $state(false);
  let lightbox = $state<NoteLightboxState | null>(null);

  const current = $derived.by(() => deps.annotations().find((it) => it.id === selected) ?? null);
  const noteParts = $derived.by(() => (current ? splitNoteMedia(deps.textOf(current)) : EMPTY_PARTS));
  const geoCoord = $derived.by(() => {
    if (!current) return null;
    const g = geoOf(current);
    return g ? formatLngLat(geoCenter(g)) : null;
  });
  const tags = $derived.by(() => (deps.onopenfinder && current ? tagsOfAnnotation(current) : []));
  const eyebrow = $derived.by(() => deps.eyebrow());

  return {
    get selected() {
      return selected;
    },
    set selected(v: string | null) {
      selected = v;
    },
    get readingSheet() {
      return readingSheet;
    },
    get lightbox() {
      return lightbox;
    },
    get current() {
      return current;
    },
    get noteParts() {
      return noteParts;
    },
    get geoCoord() {
      return geoCoord;
    },
    get tags() {
      return tags;
    },
    get eyebrow() {
      return eyebrow;
    },
    open(noteId: string) {
      selected = noteId;
      deps.onSelect?.(noteId);
    },
    close() {
      selected = null;
    },
    expand() {
      if (noteParts.text) readingSheet = true;
    },
    media(index: number) {
      lightbox = { media: noteParts.media, text: noteParts.text, index };
    },
    openFinder(tag: string) {
      deps.onopenfinder?.(tag);
    },
    sheetClose() {
      readingSheet = false;
    },
    sheetFinder(tag: string) {
      readingSheet = false;
      deps.onopenfinder?.(tag);
    },
    sheetMedia(index: number) {
      readingSheet = false;
      lightbox = { media: noteParts.media, text: noteParts.text, index };
    },
    closeLightbox() {
      lightbox = null;
    },
    reset() {
      selected = null;
      readingSheet = false;
      lightbox = null;
    },
  };
}
