// Client-side full-text search index over a published exhibit's annotations (Q-3/Q-4).
// Headless, pure TS (no Svelte) — fully unit-testable. The viewer builds one MiniSearch
// per loaded exhibit and queries it for the reader's search affordance.
//
// Bodies are authored as markdown and rendered THROUGH snarkdown at display time
// (render-core `renderMarkdown`). For SEARCH we index the PLAIN PROSE: a hit must match the
// words a reader sees, never the `[text](url)` / `#heading` / `*emphasis*` markup. We reuse
// render-core's `stripMarkdown` (the one canonical strip — same helper Reader uses for list
// snippets) so there's one source of truth, not a viewer-local reinvention.

import MiniSearch from "minisearch";
import {
  ARCHIE_LOGICAL_ID,
  commentOfAnnotation,
  tagsOfAnnotation,
  stripMarkdown,
  type W3CAnnotation,
} from "@render/core";

/** One indexed document per annotation. `body` is markdown-stripped prose; `id` is the
 *  annotation id; `logicalId` is the note's stable DAG identity (for deep-linking a hit). */
export type SearchDoc = {
  id: string;
  body: string;
  tags: string[];
  logicalId: string;
};

/** Read the note's stable logical id off the published `archie:logicalId` JSON-LD key.
 *  Falls back to the annotation id when absent (a pure-WADM import without the extension). */
function logicalIdOf(a: W3CAnnotation): string {
  const v = (a as unknown as Record<string, unknown>)[ARCHIE_LOGICAL_ID];
  return typeof v === "string" && v.length > 0 ? v : a.id;
}

/** Project one annotation into a search document. */
function toSearchDoc(a: W3CAnnotation): SearchDoc {
  return {
    id: a.id,
    body: stripMarkdown(commentOfAnnotation(a)),
    tags: tagsOfAnnotation(a),
    logicalId: logicalIdOf(a),
  };
}

/** Build a populated MiniSearch index over the given annotations. Search matches `body`
 *  (stripped prose) and `tags`; results carry `id`, `logicalId`, and `tags`. */
export function buildSearchIndex(annotations: W3CAnnotation[]): MiniSearch<SearchDoc> {
  const index = new MiniSearch<SearchDoc>({
    fields: ["body", "tags"],
    storeFields: ["id", "logicalId", "tags", "body"],
    searchOptions: { prefix: true, fuzzy: 0.2 },
  });
  index.addAll(annotations.map(toSearchDoc));
  return index;
}

/** Pull EVERY note in the exhibit into one flat array — the base page per object PLUS every
 *  per-reading page (Q-4): the finder is mode-independent and scopes ALL readings, so a note that
 *  lives only in a non-active reading is still findable. A note id can repeat across the base + a
 *  reading overlay; we de-dupe by id (first wins) so the index carries one doc per note. */
export function flattenExhibitNotes(data: {
  annotationsByObject: Record<string, W3CAnnotation[]>;
  readingAnnotationsByObject: Record<string, Record<string, W3CAnnotation[]>>;
}): W3CAnnotation[] {
  const seen = new Set<string>();
  const out: W3CAnnotation[] = [];
  const take = (a: W3CAnnotation) => {
    if (!a.id || seen.has(a.id)) return;
    seen.add(a.id);
    out.push(a);
  };
  for (const list of Object.values(data.annotationsByObject)) for (const a of list) take(a);
  for (const byReading of Object.values(data.readingAnnotationsByObject))
    for (const list of Object.values(byReading)) for (const a of list) take(a);
  return out;
}

/** Stored search result — the index's `storeFields`, narrowed for callers. */
export type StoredDoc = Pick<SearchDoc, "id" | "logicalId" | "tags" | "body">;

/** PURE finder (Q-4): tags OR each other (union of any note carrying ≥1 active tag); a text query
 *  ANDs that union (narrows it to notes also matching the prose/tag search). No active tags + no
 *  query ⇒ everything (the open-overlay browse state). Extracted out of the overlay component so the
 *  filter semantics are unit-tested in isolation, never re-derived from the rendered DOM. */
export function filterResults(
  index: MiniSearch<SearchDoc>,
  query: string,
  activeTags: string[],
): StoredDoc[] {
  const q = query.trim();
  // Tag union: a note is in scope if it carries ANY active tag (OR), with case-insensitive match
  // (tags are authored free-form). Empty tag set ⇒ no tag constraint (the whole index is in scope).
  const tagSet = new Set(activeTags.map((t) => t.toLowerCase()));
  const inTagScope = (doc: StoredDoc): boolean =>
    tagSet.size === 0 || doc.tags.some((t) => tagSet.has(t.toLowerCase()));

  if (q === "") {
    // No query: return the tag union (or everything when no tags either). Drain the index via a
    // match-all search so we get StoredDocs without holding a separate doc list.
    return (index.search(MiniSearch.wildcard) as unknown as StoredDoc[]).filter(inTagScope);
  }
  // Query present: AND it onto the tag union — search hits intersected with the tag scope.
  return (index.search(q) as unknown as StoredDoc[]).filter(inTagScope);
}
