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
    storeFields: ["id", "logicalId", "tags"],
    searchOptions: { prefix: true, fuzzy: 0.2 },
  });
  index.addAll(annotations.map(toSearchDoc));
  return index;
}
