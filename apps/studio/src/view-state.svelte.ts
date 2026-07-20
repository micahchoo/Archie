// The view-state store (worklist 0.3 cut 3 out of App.svelte). Owns the editor's canonical VIEW STATE —
// the "where am I / what's selected" cursor: the view triple (view / currentSlug / currentObjectId) plus
// the selection cursor (selected / editing / creating) and the per-note hover the marginalia rail drives
// (hoverNote). With it ride the derivations that are a PURE FUNCTION of that cursor + the library meta —
// currentExhibit / OBJECTS / current / currentObjectIndex / canvasId — and currentPlace, which ADR-0024
// defines as "a pure function of the view triple".
//
// The DOMINO cut (exhibit-session.svelte.ts) deliberately LEFT this cursor in App: "moving it behind a
// getter would break two-way binding" (its header). That concern is about PLAIN getters — a get/set
// accessor pair DOES support `bind:` in Svelte 5 (proven by publish-machine.svelte.ts's `set repo` +
// `bind:value={machine.repo}` in Publish.svelte), so `selected` / `currentObjectId` are exposed as get+set
// and stay `bind:`-bound on the Canvas / AvEditor exactly as before.
//
// A `.svelte.ts` rune module (cf. binding-store.svelte.ts / exhibit-session.svelte.ts): the `$state`
// container is never reassigned, so getters stay live across the module boundary; `$derived` inside the
// factory preserves the memoized identity App's inline `$derived` gave these values (a plain getter would
// re-allocate the `?? []` / place object per access and re-key every `{#each OBJECTS}`).
//
// NOT here: the marginalia/dot ITEM lists (marginaliaItems / dotItems / marginaliaRectIds). They read NO
// view-state atom — they are pure projections of `notes` + `currentReadings` — so folding them in would
// only drag the whole notes-derivation chain into this store for zero coupling gain. What the marginalia
// rail actually couples to is `selected` / `hoverNote` (it DRIVES them), and those live here.
import type { ExhibitMeta } from "./store.js";
import type { DrawTool } from "@render/mount";
import { LIBRARY, type Place } from "./place.js";

export type StudioView = "library" | "overview" | "editor";

export interface ViewStateDeps {
  /** The library's exhibits (live read — `lib.meta.exhibits`); the derivations resolve the cursor against it. */
  exhibits: () => readonly ExhibitMeta[];
  /** Canvas-IRI base (BASE from seed-data) — `${baseUrl}${slug}/canvas/${objId}` mirrors publishLibrary's grammar. */
  baseUrl: string;
  /** The slug the editor boots pointing at (DEFAULT_EXHIBITS[0].slug). */
  initialSlug: string;
  /** Reset the App-owned transients an object switch also drops (the armed pending-placement + the narrative
   *  card's frame focus). Called ONLY on a real switch — a same-object switchObject is a no-op, INCLUDING
   *  skipping this reset (the Archie-696d deep-link contract navigateToSection relies on). */
  onObjectSwitch: () => void;
}

export function createViewState(deps: ViewStateDeps) {
  const s = $state<{
    view: StudioView;
    currentSlug: string;
    currentObjectId: string;
    selected: string | null; // the canvas/inspector selection cursor (ambient; ADR-0011)
    editing: string | null; // FOLLOWS `selected` on real selections, held across Annotorious' null churn (P2-5)
    creating: DrawTool | null; // the transient armed state for a NEW NOTE (null = not drawing)
    hoverNote: string | null; // per-note solo: the note momentarily lit on the canvas (list / marginalia hover)
  }>({
    view: "library",
    currentSlug: deps.initialSlug,
    currentObjectId: "o1",
    selected: null,
    editing: null,
    creating: null,
    hoverNote: null,
  });

  // Derivations — memoized so identity is stable across a tick (an inline App `$derived` would be; a plain
  // getter would not — it would re-run `.find()` / `?? []` per read and thrash `{#each}` keying).
  const currentExhibit = $derived(deps.exhibits().find((e) => e.slug === s.currentSlug) ?? deps.exhibits()[0]);
  const OBJECTS = $derived(currentExhibit?.objects ?? []);
  const current = $derived(OBJECTS.find((o) => o.id === s.currentObjectId) ?? OBJECTS[0]);
  const currentObjectIndex = $derived(OBJECTS.findIndex((o) => o.id === s.currentObjectId));
  const canvasId = $derived(`${deps.baseUrl}${s.currentSlug}/canvas/${s.currentObjectId}`);
  // The current place is a pure function of the view triple (ADR-0024 #6): modals/panels/selections can never
  // leak into the URL because currentPlace reads ONLY view/slug/object.
  const currentPlace = $derived<Place>(
    s.view === "library" ? LIBRARY
    : s.view === "overview" ? { kind: "overview", slug: s.currentSlug }
    : { kind: "editor", slug: s.currentSlug, objectId: s.currentObjectId },
  );

  // Which object of the exhibit the editor shows. Switching resets the selection cursor + the armed gesture;
  // early-returns (no-op, INCLUDING skipping the onObjectSwitch reset) when already on that object.
  function switchObject(id: string) {
    if (id === s.currentObjectId) return;
    s.currentObjectId = id;
    s.selected = null;
    s.editing = null;
    s.creating = null; // cancel any armed new-note gesture when changing objects
    deps.onObjectSwitch(); // …and any armed pending-placement + narrative frame focus (App-owned transients)
  }

  return {
    // — view triple (get/set: App assigns them across the nav transitions; currentObjectId is `bind:`-adjacent) —
    get view(): StudioView { return s.view; },
    set view(v: StudioView) { s.view = v; },
    get currentSlug(): string { return s.currentSlug; },
    set currentSlug(v: string) { s.currentSlug = v; },
    get currentObjectId(): string { return s.currentObjectId; },
    set currentObjectId(v: string) { s.currentObjectId = v; },
    // — selection cursor (selected + hoverNote are `bind:`/handler-driven from Canvas, AvEditor, Marginalia) —
    get selected(): string | null { return s.selected; },
    set selected(v: string | null) { s.selected = v; },
    get editing(): string | null { return s.editing; },
    set editing(v: string | null) { s.editing = v; },
    get creating(): DrawTool | null { return s.creating; },
    set creating(v: DrawTool | null) { s.creating = v; },
    get hoverNote(): string | null { return s.hoverNote; },
    set hoverNote(v: string | null) { s.hoverNote = v; },
    // — derivations riding the cursor (live getters over the module-local `$derived`) —
    get currentExhibit(): ExhibitMeta | undefined { return currentExhibit; },
    get OBJECTS() { return OBJECTS; },
    get current() { return current; },
    get currentObjectIndex(): number { return currentObjectIndex; },
    get canvasId(): string { return canvasId; },
    get currentPlace(): Place { return currentPlace; },
    /** Canvas IRI for an object of the CURRENT exhibit (matches publishLibrary's grammar per slug). */
    canvasIdOf(objId: string): string { return `${deps.baseUrl}${s.currentSlug}/canvas/${objId}`; },
    // — transitions —
    switchObject,
  };
}
export type ViewState = ReturnType<typeof createViewState>;
