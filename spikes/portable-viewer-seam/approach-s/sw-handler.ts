// APPROACH S — Service Worker serves the Filesystem.
//
// Idea: a SW `fetch` handler maps a request for `${BASE_URL}published/<path>` to bytes read out of
// a loaded ZipFilesystem. published.ts + EVERY component stay UNCHANGED — the portable Viewer just
// fetches `published/...` like the hosted one, and the SW intercepts. Media + deep-links resolve for
// free (the network is the seam), and a `?src=` zip is HTTP-cacheable.
//
// What's NODE-TESTABLE (this file): the pure handler logic + the cache-isolation keying.
// What's NOT (sw-bootstrap.ts): real interception on a GH project base path, and the
//   "SW active before the first fetch" bootstrap. Implemented but BROWSER-VERIFY-OWED.
//
// Prior art cited:
//   - the seam published.ts fetches: exhibits.json, {slug}/manifest.json,
//     {slug}/canvas/{objId}/annotations.json, readings.json, annotations-{readingId}.json
//                                                                — apps/viewer/src/published.ts:8-26,45-71
//   - ZipFilesystem read path (root → getDirectory → getFile → readable) — fs/zip.ts, fs/seam.ts
//   - PUBLISHED base = `${import.meta.env.BASE_URL}published`            — published.ts:8

import type { Filesystem, FsDirectory } from "../../../packages/render-core/src/fs/seam.js";

/** Per-library registry: a loaded ZipFilesystem keyed by an opaque library id (a content hash in
 *  the real bootstrap). The KEY is what makes cache isolation possible — two libraries opened in the
 *  same origin live under different ids and therefore different cache namespaces. */
export interface LibraryRegistry {
  get(libraryId: string): Filesystem | undefined;
}

export interface HandlerOptions {
  /** e.g. "/repo/" on a GH project site, "/" at a user/org root. Mirrors import.meta.env.BASE_URL. */
  baseUrl: string;
  registry: LibraryRegistry;
}

const CONTENT_TYPES: Record<string, string> = {
  json: "application/json",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  svg: "image/svg+xml", mp3: "audio/mpeg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm",
};

function contentTypeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/**
 * Parse a request URL into (libraryId, relPath) IF it targets this Viewer's published namespace.
 * Grammar: `${baseUrl}published/<libraryId>/<rel...>`. The libraryId segment is what namespaces the
 * cache: a different library → a different first segment → a different cache key (cacheKeyFor below).
 * Returns undefined for any URL that isn't ours (the SW must fall through to the network).
 */
export function parsePublishedUrl(
  url: string,
  baseUrl: string,
): { libraryId: string; relPath: string } | undefined {
  const u = new URL(url, "https://example.invalid"); // base only used to parse relative paths in tests
  const prefix = `${baseUrl}published/`;
  if (!u.pathname.startsWith(prefix)) return undefined;
  const rest = u.pathname.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash === -1) return undefined; // need at least libraryId + a file
  const libraryId = rest.slice(0, slash);
  const relPath = rest.slice(slash + 1);
  if (libraryId === "" || relPath === "") return undefined;
  return { libraryId, relPath };
}

/** Cache key for a published asset — NAMESPACED by libraryId so two libraries opened under one
 *  origin cannot read each other's cached bytes. This is the cache-isolation invariant under S. */
export function cacheKeyFor(libraryId: string, relPath: string): string {
  return `archie-published:${libraryId}:${relPath}`;
}

/** Walk `relPath` through the ZipFilesystem and read the file bytes. Throws if any segment is absent. */
async function readFileBytes(fs: Filesystem, relPath: string): Promise<ArrayBuffer> {
  const parts = relPath.split("/");
  let dir: FsDirectory = await fs.root();
  for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectory(parts[i]!);
  const file = await dir.getFile(parts[parts.length - 1]!);
  return file.readable();
}

/**
 * The SW fetch handler, as a pure function. Given a Request, return:
 *   - a 200 Response with the file bytes + correct content-type, OR
 *   - a 404 Response if the URL is ours but the file isn't in the archive, OR
 *   - undefined if the URL isn't ours (caller does NOT respondWith → falls through to network).
 *
 * The real SW calls this from `addEventListener('fetch', e => { const r = handleArchiveFetch(...);
 * if (r) e.respondWith(r); })`. The undefined return is the fall-through contract (deep-links to the
 * app shell, cross-origin IIIF, etc. all reach the network untouched).
 */
export async function handleArchiveFetch(
  req: Request,
  opts: HandlerOptions,
): Promise<Response | undefined> {
  const parsed = parsePublishedUrl(req.url, opts.baseUrl);
  if (!parsed) return undefined; // not ours — fall through to network

  const fs = opts.registry.get(parsed.libraryId);
  if (!fs) return undefined; // unknown library — let the network 404 it (don't pretend to serve)

  try {
    const bytes = await readFileBytes(fs, parsed.relPath);
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": contentTypeFor(parsed.relPath),
        // A handle for HTTP caching (published bytes are immutable per content-hashed libraryId).
        "cache-control": "public, max-age=31536000, immutable",
        "x-archie-cache-key": cacheKeyFor(parsed.libraryId, parsed.relPath),
      },
    });
  } catch {
    // Our namespace, but the archive has no such file (e.g. optional readings.json) → honest 404,
    // which published.ts's fetchJsonOptional treats as null (published.ts:22-26).
    return new Response("Not Found", { status: 404 });
  }
}
