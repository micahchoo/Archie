// The <archie-viewer> TARGET LADDER resolver (ADR-0018 cite ladder + ADR-0021 degrade-upward).
//
// PURE over a loaded PortableExhibit + a parsed ViewerRoute: it answers "given this cite-ladder
// address, WHICH object do I open, and WHICH fragment (region/time) do I apply once it's open?" — and,
// when a rung points deeper than the library reaches, WHERE it degrades upward to. No OSD, no DOM: the
// element calls this BEFORE the lazy reader import, so the full ladder is unit-testable headless (a live
// OSD/media surface can't run under happy-dom — the element wires the returned fragment onto the surface;
// THAT wiring is the only PARTIAL bit, reported honestly).
//
// Donor (conceptual, NOT imported — the element stays self-contained per the brief / ADR-0019):
//   • apps/viewer/src/note-arrival.ts  resolveNoteArrival — note id → owning object (base + per-reading scan)
//   • render-core search-index.ts      logicalIdOf — a note's deep-link identity is `archie:logicalId` ||
//                                       a.id (a pure-WADM import has no logicalId, so it falls back to id)
//   • render-core model.ts Section     a section activates `objectId` at the media-fragment `start`
//   • render-mount fitbounds.ts         clampToContentBounds — an off-image region degrades to whole-object
//
// DEGRADE-UPWARD ladder (ADR-0021), nearest existing ancestor, NEVER an error:
//   note-not-found      → the exhibit (its object grid)
//   section-not-found   → the exhibit
//   object-not-found    → the exhibit
//   (slug-not-found / no library → the gallery: handled in the element, one rung above this resolver)
//   region/time out-of-fit → the WHOLE object (the reader path clamps via clampToContentBounds; a `t`
//                            offset past the media duration is a reader-side seek clamp). This resolver
//                            still RETURNS the fragment; the surface degrades the FIT, not the open.

import { ARCHIE_LOGICAL_ID, type PortableExhibit, type ViewerRoute, type W3CAnnotation, type Section } from "@render/core";

/** A media fragment to apply to the opened object's surface: a spatial region or a temporal offset. */
export interface TargetFragment {
  /** `xywh` = a pixel/percent region (image objects); `t` = a time offset in seconds-or-range (AV objects). */
  kind: "xywh" | "t";
  /** The raw fragment value (e.g. `pixel:10,20,30,40` or `12.5` / `12.5,30`), as it rides the route. */
  value: string;
}

/** The resolved landing: WHAT to show, plus an optional fragment to apply, plus how we got here. */
export interface ResolvedTarget {
  /** The surface to mount: the whole gallery, an exhibit's object grid, or one object's reader. */
  kind: "gallery" | "exhibit" | "object";
  /** Present iff `kind === "object"` — the object to open. */
  objectId?: string;
  /** Present iff a region/time rung resolved — applied to the surface AFTER open (seek-not-play for `t`). */
  fragment?: TargetFragment;
  /** The RAW annotation id (a.id) to select+fit on the overlay, when a note rung resolved. Distinct from
   *  the route's `noteId`, which may be a logical id — the overlay keys by raw a.id (read-overlay.ts), so
   *  the element selects THIS, not the route id. */
  selectId?: string;
  /** Set when a deeper rung degraded upward (ADR-0021) — drives the cold-arrival notice; absent on a clean hit. */
  degraded?: "note-not-found" | "section-not-found" | "object-not-found";
}

/** A note's deep-link identity: its published `archie:logicalId` if present, else the bare annotation id
 *  (a pure-WADM import carries no logicalId). Mirrors render-core search-index.ts logicalIdOf — replicated,
 *  not imported, so the element bundle stays self-contained. */
function logicalIdOf(a: W3CAnnotation): string {
  const v = (a as unknown as Record<string, unknown>)[ARCHIE_LOGICAL_ID];
  return typeof v === "string" && v.length > 0 ? v : a.id;
}

/** Does this annotation answer to `noteId` — by raw id OR by its logical (deep-link) id? */
function matchesNote(a: W3CAnnotation, noteId: string): boolean {
  return a.id === noteId || logicalIdOf(a) === noteId;
}

/** Which object OWNS the note `noteId`, AND that note's RAW annotation id (the overlay selects by a.id,
 *  not by the route's possibly-logical id). Scan each object's base page; first match wins. Replicates
 *  resolveNoteArrival's base scan — the portable element renders base-page heads, so the base scan is the
 *  ladder rung we need (per-reading pages aren't mounted by the read-only reader). Null = unknown id
 *  (a tombstoned cite, ADR-0003) → the caller degrades to the exhibit. */
function ownerOfNote(exhibit: PortableExhibit, noteId: string): { objectId: string; rawId: string } | null {
  for (const o of exhibit.objects) {
    const hit = (exhibit.annotationsByObject[o.id] ?? []).find((a) => matchesNote(a, noteId));
    if (hit) return { objectId: o.id, rawId: hit.id };
  }
  return null;
}

/** A note's own region selector, recovered from its WADM target (so a note deep-link with NO explicit
 *  `xywh` still frames the note's region, not the whole object). `pixel:`-style FragmentSelector values
 *  only — a polygon/svg selector has no `xywh=` value, so it returns null and the object opens un-framed
 *  (the overlay still draws it; ADR-0018 whole-object fallback). */
function regionOfNote(exhibit: PortableExhibit, objectId: string, noteId: string): string | null {
  const note = (exhibit.annotationsByObject[objectId] ?? []).find((a) => matchesNote(a, noteId));
  if (!note) return null;
  const targets = Array.isArray(note.target) ? note.target : [note.target];
  for (const t of targets) {
    if (typeof t === "string") continue;
    const sels = Array.isArray(t.selector) ? t.selector : t.selector ? [t.selector] : [];
    for (const s of sels) {
      if (s.type === "FragmentSelector" && typeof s.value === "string" && s.value.startsWith("xywh=")) {
        return s.value.slice("xywh=".length);
      }
    }
  }
  return null;
}

/** A section's media fragment is its `start` (ADR-0005): `xywh=...` (image) or `t=...` (AV). Split the
 *  `key=value` head off so the surface can route it to a region-fit vs a seek. Bare `start` (no `=`) or
 *  absent → no fragment (whole object). */
function fragmentOfStart(start: string | undefined): TargetFragment | undefined {
  if (!start) return undefined;
  if (start.startsWith("xywh=")) return { kind: "xywh", value: start.slice("xywh=".length) };
  if (start.startsWith("t=")) return { kind: "t", value: start.slice("t=".length) };
  return undefined;
}

/**
 * Resolve an EXHIBIT-scoped route (slug already matched + exhibit loaded) into a landing. The element
 * handles the two rungs ABOVE this — no library / unknown slug → the gallery — then hands the loaded
 * PortableExhibit here. Pure; never throws; degrades upward per ADR-0021.
 */
export function resolveExhibitTarget(exhibit: PortableExhibit, route: ViewerRoute): ResolvedTarget {
  if (route.view !== "exhibit") return { kind: "gallery" };

  // ---- NOTE rung (`/a/<noteId>` [+ ?xywh / ?t]) -------------------------------------------------
  if (route.noteId) {
    const owner = ownerOfNote(exhibit, route.noteId);
    if (!owner) return { kind: "exhibit", degraded: "note-not-found" }; // unknown id → its exhibit
    const { objectId, rawId } = owner;
    // The route's explicit xywh/t wins; else the note's own region selector frames it; else whole object.
    const explicit: TargetFragment | undefined = route.xywh
      ? { kind: "xywh", value: route.xywh }
      : route.t
      ? { kind: "t", value: route.t }
      : undefined;
    const fragment = explicit ?? fragmentFromRegion(regionOfNote(exhibit, objectId, route.noteId));
    // selectId = the raw a.id so the overlay can select+fit the note's own shape (the real nav contract).
    return { kind: "object", objectId, selectId: rawId, ...(fragment ? { fragment } : {}) };
  }

  // ---- SECTION rung (`/s/<sectionId>`) ----------------------------------------------------------
  if (route.sectionId) {
    const section: Section | undefined = (exhibit.sections ?? []).find((s) => s.id === route.sectionId);
    if (!section) return { kind: "exhibit", degraded: "section-not-found" };
    // A section may name an object that no longer exists (hand-edited zip) → degrade to the exhibit.
    if (!exhibit.objects.some((o) => o.id === section.objectId)) return { kind: "exhibit", degraded: "section-not-found" };
    const fragment = fragmentOfStart(section.start);
    return fragment ? { kind: "object", objectId: section.objectId, fragment } : { kind: "object", objectId: section.objectId };
  }

  // ---- OBJECT rung (`/o/<objectId>`) ------------------------------------------------------------
  if (route.objectId) {
    if (!exhibit.objects.some((o) => o.id === route.objectId)) return { kind: "exhibit", degraded: "object-not-found" };
    return { kind: "object", objectId: route.objectId };
  }

  // ---- EXHIBIT rung (slug only) -----------------------------------------------------------------
  return { kind: "exhibit" };
}

/** A recovered `xywh=`-stripped region value → a spatial TargetFragment (or undefined for none). */
function fragmentFromRegion(region: string | null): TargetFragment | undefined {
  return region ? { kind: "xywh", value: region } : undefined;
}
