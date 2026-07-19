// Place-addressable navigation model for Studio (ADR-0024). A *place* is a user's
// addressable position: the library, an exhibit's overview, or one object's editor
// (CONTEXT.md → Navigation). Selected notes, panels, viewports and toggles are NEVER a
// place — those are transient screen state.
//
// This module is PURE (parse/serialize the URL grammar, compare places, resolve a place
// against the current library). It is a plain `.ts`, not `.svelte.ts`, so vitest runs it
// without the rune harness — the wiring that pushes history + drives the view lives in
// App.svelte, over this vocabulary.

export type Place =
  | { kind: "library" }
  | { kind: "overview"; slug: string }
  | { kind: "editor"; slug: string; objectId: string };

export const LIBRARY: Place = { kind: "library" };

/** What a place named that the library no longer holds — drives the fallback notice (ADR-0024 #4). */
export type Missing =
  | { kind: "exhibit"; slug: string }
  | { kind: "object"; slug: string; objectId: string };

// --- URL grammar (hash-based; see docs/research/routing-mechanism.md) ---
//   library   #/
//   overview  #/{slug}                 (the Exhibit rung)
//   editor    #/{slug}/o/{objectId}    (the Object rung)
// This mirrors the established `<archie-viewer>` target cite-ladder (ADR-0021: Exhibit `#/{slug}`,
// Object `#/{slug}/o/<id>`, Note `#/{slug}/a/<id>`, Section `#/{slug}/s/<id>`) — Studio addresses only
// its top two rungs, and DEGRADES a deeper viewer-style rung UPWARD to the exhibit overview, exactly
// the degrade-upward philosophy that contract established. ADR-0024's consequence ("the viewer's URL
// scheme should eventually mirror place grammar") is served by sharing this grammar now.
//
// Hash routing is base-path- and static-host-safe: pushState with a "#…" URL keeps the pathname
// (`/studio/`) untouched, so identical code serves the GH-Pages deploy, the dev front-door proxy, and
// the Tauri webview with no server rewrites. Slugs/object ids contain no "/" by construction, but each
// segment is percent-encoded defensively.

export function serializePlace(p: Place): string {
  if (p.kind === "library") return "#/";
  const slug = encodeURIComponent(p.slug);
  if (p.kind === "overview") return `#/${slug}`;
  return `#/${slug}/o/${encodeURIComponent(p.objectId)}`;
}

/** Parse a `location.hash` ("#/a/o/b"), a bare fragment ("/a"), or "" into a place. Never throws. */
export function parsePlace(hash: string): Place {
  let h = hash ?? "";
  if (h.startsWith("#")) h = h.slice(1);
  if (h.startsWith("!")) h = h.slice(1); // tolerate a legacy "#!" hashbang
  const segs = h.split("/").filter((s) => s.length > 0).map(decodeSegment);
  if (segs.length === 0) return { kind: "library" };
  const slug = segs[0]!;
  // The Object rung: `{slug}/o/{objectId}`. Anything else at slug-depth (a bare `{slug}`, or a deeper
  // viewer rung Studio doesn't address — `/a/` note, `/s/` section) degrades UP to the exhibit overview.
  if (segs.length >= 3 && segs[1] === "o") return { kind: "editor", slug, objectId: segs[2]! };
  return { kind: "overview", slug };
}

function decodeSegment(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; } // a malformed %xx degrades to the raw text
}

/** Structural equality — two places name the same position. */
export function placesEqual(a: Place, b: Place): boolean {
  if (a.kind === "library" || b.kind === "library") return a.kind === b.kind;
  if (a.slug !== b.slug) return false;
  if (a.kind === "editor" && b.kind === "editor") return a.objectId === b.objectId;
  return a.kind === b.kind; // both overview of the same slug
}

// --- Resolution / degradation (ADR-0024 #4) ---
// A place that no longer resolves degrades to its nearest surviving ancestor
// (object → overview → library), reporting what was missing so the UI can name it. Same
// philosophy as render-core's absent-vs-failed per-item tolerance — never a dead-end screen.

export interface LibrarySnapshot {
  hasExhibit(slug: string): boolean;
  hasObject(slug: string, objectId: string): boolean;
}

export type Resolution = { place: Place; missing: Missing | null; degraded: boolean };

export function resolvePlace(target: Place, lib: LibrarySnapshot): Resolution {
  if (target.kind === "library") return { place: target, missing: null, degraded: false };
  if (!lib.hasExhibit(target.slug)) {
    return { place: LIBRARY, missing: { kind: "exhibit", slug: target.slug }, degraded: true };
  }
  if (target.kind === "overview") return { place: target, missing: null, degraded: false };
  if (!lib.hasObject(target.slug, target.objectId)) {
    const missing: Missing = { kind: "object", slug: target.slug, objectId: target.objectId };
    return { place: { kind: "overview", slug: target.slug }, missing, degraded: true };
  }
  return { place: target, missing: null, degraded: false };
}

/** Build a snapshot from the live exhibit list (App passes `lib.meta.exhibits`). */
export function librarySnapshot(
  exhibits: readonly { slug: string; objects: readonly { id: string }[] }[],
): LibrarySnapshot {
  return {
    hasExhibit: (slug) => exhibits.some((e) => e.slug === slug),
    hasObject: (slug, id) => exhibits.some((e) => e.slug === slug && e.objects.some((o) => o.id === id)),
  };
}
