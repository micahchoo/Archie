// Linkability resolution (CONTEXT linkability v1, locked frame "linkable + navigable").
//
// Intra-Library: links are STRUCTURED refs (stable logicalIds), resolved to a published display
// URL at publish time (auto-updating if the path changes, since the URL is projected not stored)
// and publish-time validatable against the Library-wide note index. Cross-Library links reuse
// the Q8 deep-link (#/a/<id>) — no separate link system (CONTEXT). Pure.

import { buildNoteDeepLink, parseNoteDeepLink } from "../url/deeplink.js";
import type { LogicalId } from "../wadm/brand.js";
import type { AnnotationLog } from "../wadm/types.js";

/** A structured intra-Library link target (what ⌘K stores). */
export interface LinkTarget {
  /** Optional — present for cross-Library refs; intra-Library links omit or match the current. */
  libraryId?: string;
  exhibitSlug: string;
  /** Target a specific Note... */
  noteLogicalId?: LogicalId;
  /** ...or a Range (narrative section)... */
  rangeId?: string;
  /** ...or a bare region on the exhibit's object. */
  xywh?: string;
}

export interface IndexEntry {
  exhibitSlug: string;
}

/** The Library-wide note index — a projection of every exhibit's log (Studio author-time lookup). */
export function buildLinkIndex(logsByExhibit: Record<string, AnnotationLog>): Map<LogicalId, IndexEntry> {
  const index = new Map<LogicalId, IndexEntry>();
  for (const [exhibitSlug, log] of Object.entries(logsByExhibit)) {
    for (const record of log) {
      if (!index.has(record.logicalId)) index.set(record.logicalId, { exhibitSlug });
    }
  }
  return index;
}

export interface ResolveOptions {
  /** Published base, e.g. `https://user.github.io/lib/`. Default "" (relative). */
  baseUrl?: string;
}

/**
 * Project a structured ref to a published display URL using the pinned grammar
 * `{baseUrl}{exhibitSlug}/` + the `#/a/<id>` deep-link fragment. A note ref gets the fragment;
 * a bare exhibit ref resolves to the exhibit root.
 */
export function resolveLink(target: LinkTarget, opts: ResolveOptions = {}): string {
  const exhibitUrl = `${opts.baseUrl ?? ""}${target.exhibitSlug}/`;
  if (target.noteLogicalId !== undefined) {
    const fragment = buildNoteDeepLink(target.noteLogicalId, target.xywh !== undefined ? { xywh: target.xywh } : {});
    return `${exhibitUrl}${fragment}`;
  }
  if (target.rangeId !== undefined) return `${exhibitUrl}#/s/${target.rangeId}`;
  return exhibitUrl;
}

/** Publish-time validation: does the target resolve in the Library-wide index? */
export function validateLink(target: LinkTarget, index: Map<LogicalId, IndexEntry>): boolean {
  if (target.noteLogicalId !== undefined) {
    return index.get(target.noteLogicalId)?.exhibitSlug === target.exhibitSlug;
  }
  // bare exhibit / range ref: valid iff the exhibit appears in the index (has any notes)
  for (const entry of index.values()) if (entry.exhibitSlug === target.exhibitSlug) return true;
  return false;
}

// ---- In-body structured ref: the `archie:` URI ⌘K stores inside a markdown body ----
//
// The link the author inserts lives IN the note's markdown body (one source of truth — ADR-0003's
// append-only log, persisted verbatim in the history sidecar so it survives Open-zip round-trips).
// It is NOT the resolved URL: it is a structured `archie:` ref encoding a LinkTarget, rewritten to a
// real display URL only on the heads-page PROJECTION at publish (resolveLink), never in the source
// history (CONTEXT §95 author-time-resolvable + publish-time-validatable + auto-updating; §85 the
// log→projection spine). The grammar reuses resolveLink/parseNoteDeepLink with the `archie:` scheme
// as the baseUrl, so encode/resolve stay symmetric.

const ARCHIE_SCHEME = "archie:";

/** Encode a structured ref to the in-body `archie:` URI (e.g. `archie:bidar/#/a/<id>`). */
export function encodeLinkRef(target: LinkTarget): string {
  return resolveLink(target, { baseUrl: ARCHIE_SCHEME });
}

/** Parse an in-body `archie:` URI back to a LinkTarget. Null if it is not a well-formed archie ref. */
export function parseLinkRef(uri: string): LinkTarget | null {
  if (!uri.startsWith(ARCHIE_SCHEME)) return null;
  const rest = uri.slice(ARCHIE_SCHEME.length); // `{slug}/` or `{slug}/#/a/<id>[?xywh=]` or `{slug}/#/s/<id>`
  const hashAt = rest.indexOf("#");
  const path = hashAt === -1 ? rest : rest.slice(0, hashAt);
  const fragment = hashAt === -1 ? "" : rest.slice(hashAt);
  const exhibitSlug = path.replace(/\/+$/, "");
  if (exhibitSlug.length === 0) return null;
  // Slug hardening (security S5): reject anything outside the slug charset, so a crafted slug can't inject
  // markup/attributes when rewritten into an <a href> on the published page (defence-in-depth past DOMPurify).
  if (!/^[a-z0-9_-]+$/i.test(exhibitSlug)) return null;
  if (fragment.startsWith("#/a/")) {
    const note = parseNoteDeepLink(fragment);
    if (!note) return null;
    return {
      exhibitSlug,
      noteLogicalId: note.logicalId as LogicalId,
      ...(note.xywh !== undefined ? { xywh: note.xywh } : {}),
    };
  }
  if (fragment.startsWith("#/s/")) {
    const rangeId = fragment.slice("#/s/".length);
    return rangeId.length > 0 ? { exhibitSlug, rangeId } : null;
  }
  if (fragment.length > 0) return null; // unknown fragment shape
  return { exhibitSlug };
}

export interface RewriteOptions {
  /** Project a (valid) target to its published display URL — e.g. (t) => resolveLink(t, { baseUrl }). */
  resolve: (target: LinkTarget) => string;
  /** Optional existence check — e.g. (t) => validateLink(t, index). Failing refs degrade to plain text. */
  validate?: (target: LinkTarget) => boolean;
}

export interface RewriteResult {
  md: string;
  /** Refs that failed validation (or were malformed) — surfaced as publish-time warnings. */
  broken: LinkTarget[];
}

// `[text](archie:...)` — the ref body is everything up to the closing paren (no spaces/parens).
const ARCHIE_LINK_RE = /\[([^\]]*)\]\((archie:[^)\s]+)\)/g;

/**
 * Rewrite in-body `archie:` links to published display URLs (the heads-page projection step).
 * Valid refs → `[text](resolvedUrl)`; broken/malformed refs degrade to plain `text` (honest, never a
 * dead href) and are reported. The history sidecar is NOT run through this — it is the canonical
 * source the log round-trips through, so its raw `archie:` refs are preserved.
 */
export function rewriteArchieLinks(md: string, opts: RewriteOptions): RewriteResult {
  if (typeof md !== "string" || md.length === 0) return { md: md ?? "", broken: [] };
  const broken: LinkTarget[] = [];
  const out = md.replace(ARCHIE_LINK_RE, (_m, text: string, uri: string) => {
    const target = parseLinkRef(uri);
    if (!target) return text; // malformed → plain text (no broken target to report)
    if (opts.validate && !opts.validate(target)) {
      broken.push(target);
      return text; // dead target → plain text + warning
    }
    return `[${text}](${opts.resolve(target)})`;
  });
  return { md: out, broken };
}
