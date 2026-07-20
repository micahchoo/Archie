// Folder-by-URL listing (SCOPE-linked-objects.md companion, "add a folder from a static server").
// Plain HTTP has no directory-listing verb — fs/http.ts's entries() throws for exactly that reason —
// but nearly every dumb file server EMITS one as a page: nginx `autoindex`, Apache mod_autoindex,
// `python -m http.server`, caddy `file_server browse`. This module turns ONE fetched listing into
// pickable image entries, headless: the parse functions are pure (regex href extraction — autoindex
// pages are machine-generated markup, and a DOM parser would drag a document environment into what
// should be unit-testable logic), and `previewFolder` owns the one fetch, mirroring
// create-exhibit-dialog.ts's previewManifest never-throws/tagged-result shape and ingest-flows'
// IIIF_MANIFEST_MAX_BYTES double-check cap discipline (imported, not redeclared).
//
// Every entry stays a zero-copy REMOTE REFERENCE — exactly what a hand-pasted link (addObject) makes.
// Nothing is downloaded at ingest beyond the listing page itself (and addObject's best-effort
// dimension probe, unchanged from the single-link path).
import { hasImageExtension } from "@render/core";
import { IIIF_MANIFEST_MAX_BYTES } from "./ingest-flows.js";

/** One direct-child image file of the listed folder. */
export interface FolderEntry {
  /** Decoded filename (e.g. "folio 12r.jpg") — the picker row's text and the object-label seed. */
  name: string;
  /** Absolute resolved URL — what addObject will store verbatim (zero-copy remote reference). */
  url: string;
}

export interface FolderListing {
  /** Direct-child image files, in listing (server) order. */
  entries: FolderEntry[];
  /** Direct subfolder links skipped — v1 lists ONE level, no recursive crawl (a crawl is a different
   *  feature with cap/abort needs; the count feeds the picker's quiet note so the skip is never silent). */
  skippedDirs: number;
  /** Direct-child files skipped for not having a known raster extension (same never-silent note). */
  skippedFiles: number;
}

/** Whether a pasted Link-path value should take the folder flow: a well-formed http(s) URL whose path
 *  ends in `/` (the one honest, predictable folder signal — hinted in the field copy), with no
 *  query/hash (a `?C=M;O=A`-style sort link is a page, not a folder). Anything else keeps the
 *  existing single-link behaviour untouched. */
export function isFolderUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.pathname.endsWith("/") &&
      parsed.search === "" &&
      parsed.hash === ""
    );
  } catch {
    return false;
  }
}

/** A percent-decoded display name; a malformed escape keeps the raw segment (display-only fallback —
 *  the entry's `url` is what gets stored, and that stays the resolved href either way). */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// Href extraction across the autoindex dialects: double-quoted (nginx/python/Apache), single-quoted,
// or unquoted attribute values. Matching <a> tags only — autoindex pages link every listed file, and
// icons/decoration ride <img src>, which this deliberately ignores.
const HREF_RE = /<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

/** Parse an autoindex HTML page into the folder's direct-child image entries. Pure. The filters are
 *  the whole contract — each drops a link class every real autoindex dialect emits:
 *  - other-origin           → footer/docs links;
 *  - any query string       → Apache column-sort links (`?C=N;O=D`);
 *  - path not under folder  → parent (`../`) and breadcrumb links;
 *  - trailing slash         → subfolder (counted, not crawled — v1 is one level);
 *  - deeper than one level  → not a direct child (breadcrumb/permalink shapes);
 *  - non-raster extension   → counted into `skippedFiles`, feeds the quiet note. */
export function parseAutoindexHtml(html: string, folderUrl: string): FolderListing {
  const base = new URL(folderUrl.trim());
  const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  const seen = new Set<string>();
  const listing: FolderListing = { entries: [], skippedDirs: 0, skippedFiles: 0 };
  for (const m of html.matchAll(HREF_RE)) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (raw === "" || raw.startsWith("#")) continue;
    let resolved: URL;
    try {
      resolved = new URL(raw, base);
    } catch {
      continue;
    }
    if (resolved.origin !== base.origin) continue;
    if (resolved.search !== "") continue;
    if (!resolved.pathname.startsWith(basePath)) continue;
    const rest = resolved.pathname.slice(basePath.length);
    if (rest === "") continue; // self/heading link
    if (rest.endsWith("/")) {
      if (!rest.slice(0, -1).includes("/")) listing.skippedDirs++;
      continue;
    }
    if (rest.includes("/")) continue;
    if (seen.has(resolved.href)) continue; // some dialects link a file twice (icon + name)
    seen.add(resolved.href);
    if (!hasImageExtension(rest)) {
      listing.skippedFiles++;
      continue;
    }
    listing.entries.push({ name: safeDecode(rest), url: resolved.href });
  }
  return listing;
}

/** Parse nginx's `autoindex_format json` body (`[{name, type: "file"|"directory", …}]`) — the one
 *  machine-readable autoindex dialect in the wild, so it gets a fast path before the HTML scrape.
 *  Returns null when the shape isn't that dialect (caller falls back to the HTML parser). */
export function parseNginxJsonListing(json: unknown, folderUrl: string): FolderListing | null {
  if (!Array.isArray(json)) return null;
  const base = new URL(folderUrl.trim());
  const listing: FolderListing = { entries: [], skippedDirs: 0, skippedFiles: 0 };
  for (const item of json) {
    if (typeof item !== "object" || item === null) return null;
    const { name, type } = item as Record<string, unknown>;
    if (typeof name !== "string" || typeof type !== "string") return null;
    if (type === "directory") {
      listing.skippedDirs++;
      continue;
    }
    if (type !== "file") continue; // "other" (fifos/sockets) — nothing to add
    if (!hasImageExtension(name)) {
      listing.skippedFiles++;
      continue;
    }
    // JSON names are raw (undecoded); encode the one path segment to build the fetchable URL.
    listing.entries.push({ name, url: new URL(encodeURIComponent(name), base).href });
  }
  return listing;
}

export type FolderPreview = { status: "ok"; listing: FolderListing } | { status: "invalid"; message: string };

// Plain-language copy, same voice as the IIIF-path refusals in create-exhibit-dialog.ts. The
// unreachable message deliberately names browser access: a dumb static server without CORS headers
// fails HERE (the fetch throws), and "check the URL" alone would send the user hunting a typo that
// isn't there.
export const FOLDER_UNREACHABLE_MESSAGE = "Couldn't read that folder — check the URL, and that the server allows access from a browser (CORS).";
export const FOLDER_TOO_LARGE_MESSAGE = "That folder's listing is too large to read here.";
export const FOLDER_NO_IMAGES_MESSAGE = "No images found in that folder's listing.";

/** Fetch + parse a folder listing for the dialog's picker. Never throws — unreachable/non-OK/CORS,
 *  an oversized body, and an imageless listing all resolve to a tagged `{status:"invalid", message}`
 *  the Link path renders directly (an aborted call's result is discarded by the caller's own token
 *  check, mirroring previewManifest). Content sniff: a JSON content-type or a `[`-leading body tries
 *  the nginx JSON dialect first, then everything falls back to the HTML scrape. */
export async function previewFolder(url: string, signal?: AbortSignal): Promise<FolderPreview> {
  const trimmed = url.trim();
  let text: string;
  let contentType = "";
  try {
    const resp = await fetch(trimmed, signal ? { signal } : undefined);
    if (!resp.ok) return { status: "invalid", message: FOLDER_UNREACHABLE_MESSAGE };
    // Cap enforced twice, the IIIF_MANIFEST_MAX_BYTES discipline (ingest-flows.ts): cheaply against a
    // declared content-length before reading the body, then against the actual received size.
    const declared = Number(resp.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > IIIF_MANIFEST_MAX_BYTES) return { status: "invalid", message: FOLDER_TOO_LARGE_MESSAGE };
    contentType = resp.headers.get("content-type") ?? "";
    const buf = await resp.arrayBuffer();
    if (buf.byteLength > IIIF_MANIFEST_MAX_BYTES) return { status: "invalid", message: FOLDER_TOO_LARGE_MESSAGE };
    text = new TextDecoder().decode(buf);
  } catch {
    return { status: "invalid", message: FOLDER_UNREACHABLE_MESSAGE };
  }
  let listing: FolderListing | null = null;
  if (/json/i.test(contentType) || text.trimStart().startsWith("[")) {
    try {
      listing = parseNginxJsonListing(JSON.parse(text), trimmed);
    } catch {
      listing = null; // not the JSON dialect after all — scrape it as HTML below
    }
  }
  listing ??= parseAutoindexHtml(text, trimmed);
  if (listing.entries.length === 0) return { status: "invalid", message: FOLDER_NO_IMAGES_MESSAGE };
  return { status: "ok", listing };
}
