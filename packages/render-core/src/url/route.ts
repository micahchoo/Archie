// Viewer top-level hash routing (CONTEXT §"Local view loop": "one smart hall", routing=hash).
// The single client shell owns ALL exhibits, so the route is slug-qualified — the grammar MOVES
// up from page-local `#/a/<id>` (deeplink.ts, when each exhibit had its own page) to:
//   `#/`                          → the Library Gallery
//   `#/<slug>`                    → an Exhibit
//   `#/<slug>/a/<noteId>[?xywh=]` → an Exhibit, landing on a note (cold-arrival)
//   `?src=<zip-url>`              → a hosted-zip pointer (ADR-0009) that COMPOSES with any of the
//                                   above: open that `.archie.zip` first, then apply the rest of the
//                                   hash. A query param, NOT a path segment — so it can't collide
//                                   with a slug and `#/voynich/a/n3?src=…` opens AND deep-links.
// Pure + corpus-tested here; the shell (apps/viewer ViewerShell) consumes it. Within-exhibit note
// parsing still delegates to parseNoteDeepLink (deeplink.ts) on the `#/a/<id>` tail.

export type ViewerRoute =
  | { view: "gallery"; src?: string }
  | { view: "exhibit"; slug: string; noteId?: string; xywh?: string; src?: string };

/**
 * Parse a location hash into a ViewerRoute. Structural only — an empty/garbage path falls back to
 * the Gallery and NEVER throws; whether a well-formed slug actually exists is the shell's call
 * (it 404s the fetch → error state), not the parser's. `?src=` is extracted for ANY route.
 */
export function parseRoute(hash: string): ViewerRoute {
  let h = hash.startsWith("#") ? hash.slice(1) : hash;
  if (h.startsWith("/")) h = h.slice(1);

  const qIdx = h.indexOf("?");
  const path = qIdx === -1 ? h : h.slice(0, qIdx);
  const params = qIdx === -1 ? null : new URLSearchParams(h.slice(qIdx + 1));
  // ?src=<zip-url> (ADR-0009): a hosted-zip pointer that composes with any route. URLSearchParams
  // decodes the percent-encoded url (its own :/?& survive). Empty string → undefined (no key emitted).
  const src = params?.get("src") || undefined;

  const parts = path.split("/").filter((p) => p.length > 0); // drop empties (trailing slash, `//`)
  if (parts.length === 0) return src ? { view: "gallery", src } : { view: "gallery" };

  const slug = parts[0]!;
  const route: { view: "exhibit"; slug: string; noteId?: string; xywh?: string; src?: string } = { view: "exhibit", slug };
  // `/a/<noteId>` tail → land on a note; xywh only meaningful alongside a note.
  if (parts.length >= 3 && parts[1] === "a" && parts[2]) {
    route.noteId = parts[2];
    const xywh = params?.get("xywh");
    if (xywh) route.xywh = xywh;
  }
  if (src) route.src = src;
  return route;
}

/** Inverse of parseRoute — build a canonical hash for a route (link-building, breadcrumb targets). */
export function routeToHash(route: ViewerRoute): string {
  let h: string;
  if (route.view === "gallery") {
    h = "#/";
  } else {
    h = `#/${route.slug}`;
    if (route.noteId) {
      h += `/a/${route.noteId}`;
      if (route.xywh) h += `?xywh=${route.xywh}`;
    }
  }
  // ?src= is appended last and percent-encoded (its :/?& would otherwise break the outer hash).
  if (route.src) h += `${h.includes("?") ? "&" : "?"}src=${encodeURIComponent(route.src)}`;
  return h;
}
