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

/**
 * WHERE a note lives, in the reader's own nouns (V106, Archie-9eeb).
 *
 * A result that says only what it found is half an answer: the reader can read the prose but has no
 * idea which of twenty-one folios it is on. This is the finder's half of the address ladder — the
 * NOUN half. It deliberately builds no hash: `ExhibitView.svelte:206` (`locus`) is the ONE address
 * writer, and activating a result routes through `arriveAtNote` → `locusNote` → that derivation, so
 * the finder never needs (and must never grow) an address model of its own.
 */
export type NoteLocus = {
  objectId: string;
  /** The object's authored label — what a reader calls it. Never a ULID. */
  objectLabel: string;
  /** Present only in a narrative, and only when ONE section activates this object (see below). */
  sectionId?: string;
  sectionTitle?: string;
};

/**
 * Map every note in the exhibit to the place it lives.
 *
 * Object attribution is free: `annotationsByObject` / `readingAnnotationsByObject` are KEYED by
 * object id, so the finder already knows which object a hit sits on. What it cannot know without
 * `objects` is what that object is CALLED — hence the label lookup. Base pages win over reading
 * overlays, matching `flattenExhibitNotes`'s de-dupe order, so a note carried in both is attributed
 * once and identically.
 *
 * Section attribution is deliberately conservative. A note is anchored to an OBJECT; a section
 * merely *activates* one, and a narrative spine may revisit the same object across several sections
 * (`Section.objectId`, model.ts:189). When two sections share an object, no section owns the note —
 * naming one of them would be a confident lie about where the reader will land. So a section is
 * reported only when exactly one activates that object; otherwise the object name stands alone,
 * which is true either way.
 *
 * An object with no known label yields NO entry rather than a ULID-shaped one: a locus a reader
 * cannot read is worse than an honest absence, and the overlay renders nothing in that case.
 */
export function locateNotes(
  data: {
    annotationsByObject: Record<string, W3CAnnotation[]>;
    readingAnnotationsByObject: Record<string, Record<string, W3CAnnotation[]>>;
  },
  objects: readonly { id: string; label: string }[],
  sections?: readonly { id: string; title: string; objectId: string }[] | null,
): Map<string, NoteLocus> {
  const labelOf = new Map(objects.map((o) => [o.id, o.label]));

  // Sections that activate each object. Only a SOLE occupant is reported (see the doc comment).
  const sectionsByObject = new Map<string, { id: string; title: string }[]>();
  for (const s of sections ?? []) {
    const list = sectionsByObject.get(s.objectId);
    if (list) list.push({ id: s.id, title: s.title });
    else sectionsByObject.set(s.objectId, [{ id: s.id, title: s.title }]);
  }

  const out = new Map<string, NoteLocus>();
  const place = (objectId: string, notes: W3CAnnotation[]): void => {
    const objectLabel = labelOf.get(objectId);
    if (objectLabel === undefined || objectLabel === "") return; // honest absence, never a ULID
    const owning = sectionsByObject.get(objectId);
    const sole = owning?.length === 1 ? owning[0] : undefined;
    for (const a of notes) {
      if (!a.id || out.has(a.id)) continue; // first wins — base before readings
      out.set(a.id, {
        objectId,
        objectLabel,
        ...(sole ? { sectionId: sole.id, sectionTitle: sole.title } : {}),
      });
    }
  };

  for (const [objectId, list] of Object.entries(data.annotationsByObject)) place(objectId, list);
  for (const [objectId, byReading] of Object.entries(data.readingAnnotationsByObject))
    for (const list of Object.values(byReading)) place(objectId, list);
  return out;
}

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
