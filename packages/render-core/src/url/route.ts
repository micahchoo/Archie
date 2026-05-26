// Viewer top-level hash routing (CONTEXT §"Local view loop": "one smart hall", routing=hash).
// The single client shell owns ALL exhibits, so the route is slug-qualified — the grammar MOVES
// up from page-local `#/a/<id>` (deeplink.ts, when each exhibit had its own page) to:
//   `#/`                          → the Library Gallery
//   `#/<slug>`                    → an Exhibit
//   `#/<slug>/a/<noteId>[?xywh=]` → an Exhibit, landing on a note (cold-arrival)
// Pure + corpus-tested here; the shell (apps/viewer ViewerShell) consumes it. Within-exhibit note
// parsing still delegates to parseNoteDeepLink (deeplink.ts) on the `#/a/<id>` tail.

export type ViewerRoute =
  | { view: "gallery" }
  | { view: "exhibit"; slug: string; noteId?: string; xywh?: string };

/**
 * Parse a location hash into a ViewerRoute. Structural only — an empty/garbage path falls back to
 * the Gallery and NEVER throws; whether a well-formed slug actually exists is the shell's call
 * (it 404s the fetch → error state), not the parser's.
 */
export function parseRoute(hash: string): ViewerRoute {
  let h = hash.startsWith("#") ? hash.slice(1) : hash;
  if (h.startsWith("/")) h = h.slice(1);
  if (h === "") return { view: "gallery" };

  const qIdx = h.indexOf("?");
  const path = qIdx === -1 ? h : h.slice(0, qIdx);
  const query = qIdx === -1 ? "" : h.slice(qIdx + 1);
  const parts = path.split("/").filter((p) => p.length > 0); // drop empties (trailing slash, `//`)
  if (parts.length === 0) return { view: "gallery" };

  const slug = parts[0]!;
  const route: { view: "exhibit"; slug: string; noteId?: string; xywh?: string } = { view: "exhibit", slug };
  // `/a/<noteId>` tail → land on a note; xywh only meaningful alongside a note.
  if (parts.length >= 3 && parts[1] === "a" && parts[2]) {
    route.noteId = parts[2];
    const xywh = query ? new URLSearchParams(query).get("xywh") : null;
    if (xywh) route.xywh = xywh;
  }
  return route;
}

/** Inverse of parseRoute — build a canonical hash for a route (link-building, breadcrumb targets). */
export function routeToHash(route: ViewerRoute): string {
  if (route.view === "gallery") return "#/";
  let h = `#/${route.slug}`;
  if (route.noteId) {
    h += `/a/${route.noteId}`;
    if (route.xywh) h += `?xywh=${route.xywh}`;
  }
  return h;
}
