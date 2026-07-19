// IIIF Collection → discovered manifest refs (Archie-cc77, PLAN §7 first two bullets + §2/§5 caps;
// ADR-0025 "Collection unpacks into Exhibits"). The FETCH-FREE half of collection ingest: parse one
// collection document into typed member refs, and traverse a nesting depth-first with fetch injected
// as a callback (ingest-flows owns the real fetch head — next ticket). DOM-free too: pure functions
// over already-fetched JSON, so the whole traversal + every cap is unit-testable with a fake fetcher.
//
// Reuses iiif-import.ts's ONE id/array/label readers rather than re-deriving P3-vs-P2 shape handling —
// a second copy would drift the way the untrusted-archive-open copies did (see that seam's rule).

import { asArray, idOf, labelToString, type Json } from "./iiif-import.js";

/** One member listed by a collection document. `label` is present ONLY when the collection inlined
 *  one (spec SHOULD, not MUST) — absent means the caller supplies a URL-segment fallback and may
 *  hydrate the real label in the background (PLAN §5 two-tier labels). */
export interface MemberRef {
  id: string;
  kind: "manifest" | "collection";
  label?: string;
}

/** Read ONE collection document's direct members, in document order, deduped by id within the doc.
 *  Handles P3 `items[]` and P2 `members[]` (ordered, typed) plus P2's split `collections[]`/
 *  `manifests[]` — some P2 docs carry BOTH the ordered `members` and the split arrays as redundant
 *  representations, so the split arrays are read last and deduped (members[] keeps the order).
 *  Members with no id, and within-doc duplicate ids, are silently dropped by design (that P2
 *  both-shapes redundancy is not signal); CROSS-document duplicates, by contrast, are counted skips
 *  in traverseCollection. */
export function collectionToRefs(json: unknown, _url: string): MemberRef[] {
  if (!json || typeof json !== "object") return [];
  const c = json as Json;
  const refs: MemberRef[] = [];
  const seen = new Set<string>();
  const push = (item: Json, forced?: "manifest" | "collection") => {
    const id = idOf(item);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const label = inlineLabel(item);
    const ref: MemberRef = { id, kind: forced ?? kindOf(item) };
    if (label !== undefined) ref.label = label;
    refs.push(ref);
  };
  for (const item of asArray(c["items"])) push(item); // P3
  for (const item of asArray(c["members"])) push(item); // P2 ordered
  for (const item of asArray(c["collections"])) push(item, "collection"); // P2 split (redundant → deduped)
  for (const item of asArray(c["manifests"])) push(item, "manifest");
  return refs;
}

/** A manifest reached by traversal, carrying the label trail of its ancestor collections (root →
 *  immediate parent) for picker context and provenance stamping (ADR-0025: sub-collection names
 *  survive only as searchable provenance). `label` is the collection's inline label for it, if any. */
export interface DiscoveredManifest {
  id: string;
  label?: string;
  trail: string[];
}

export type SkipReason = "duplicate" | "depth-cap" | "doc-cap" | "fetch-failed";

/** A member the traversal did NOT descend into or emit, and why (PLAN §2: capped/skipped nodes are
 *  counted and reported, never silent). `duplicate` covers both cycles and cross-branch dupes. */
export interface TraverseSkip {
  reason: SkipReason;
  id: string;
  kind: "manifest" | "collection";
  label?: string;
  trail: string[]; // trail to the skipped node's parent
  error?: string; // fetch-failed only: the sub-collection fetch's message
}

export interface TraverseCaps {
  depth: number; // max collection nesting; root = 0
  docs: number; // max collection documents touched, INCLUDING the root
  manifests: number; // max discovered manifests before the result is a refusal signal
}

/** PLAN §5: depth ≤ 3, ≤ 25 collection docs, ≤ 1,000 discovered manifests. */
export const DEFAULT_TRAVERSE_CAPS: TraverseCaps = { depth: 3, docs: 25, manifests: 1000 };

export type FetchJson = (url: string) => Promise<unknown>;

/** `over-manifest-cap` is the caller's cue to refuse (PLAN §5); `manifestCount` is still the true
 *  total found so the caller can name it. `ok` may still carry `skips` — ok-with-skips is normal. */
export interface TraverseResult {
  status: "ok" | "over-manifest-cap";
  manifests: DiscoveredManifest[]; // document order, deduped
  skips: TraverseSkip[];
  docsAttempted: number; // collection docs charged to the fetch budget: root + every fetch ATTEMPT
  manifestCount: number; // === manifests.length; the count to show on an over-cap refusal
}

/** Depth-first, document-order flatten of a collection nesting into manifest refs, with fetch
 *  injected. Every guard is counted into the result, never silent: a shared visited-id set (across
 *  collections AND manifests) drops cycles and cross-branch dupes to a single appearance; depth /
 *  doc caps bound the shape; a sub-collection fetch throw is a counted `fetch-failed` skip, NOT a
 *  traversal abort. The doc cap bounds fetch ATTEMPTS, not just successes — a slot is charged BEFORE
 *  the fetch, so a hostile root of 100k broken sub-collection URLs still makes at most `caps.docs`
 *  attempts. Traversal always runs to completion (bounded by that cap), so an over-cap refusal still
 *  reports the exact total found within the attempt budget. */
export async function traverseCollection(
  rootJson: unknown,
  rootUrl: string,
  fetchJson: FetchJson,
  caps: TraverseCaps = DEFAULT_TRAVERSE_CAPS,
): Promise<TraverseResult> {
  const manifests: DiscoveredManifest[] = [];
  const skips: TraverseSkip[] = [];
  const visited = new Set<string>();
  let docsAttempted = 1; // the root occupies slot 1 (the caller fetched it) though we never fetch it

  const rootId = idOf(rootJson as Json) || rootUrl;
  visited.add(rootId);
  const rootLabel = labelToString((rootJson as Json)?.["label"], urlSegment(rootUrl));

  const descend = async (doc: unknown, docUrl: string, depth: number, trail: string[]): Promise<void> => {
    for (const ref of collectionToRefs(doc, docUrl)) {
      const at = (reason: SkipReason, error?: string): TraverseSkip => {
        const s: TraverseSkip = { reason, id: ref.id, kind: ref.kind, trail };
        if (ref.label !== undefined) s.label = ref.label;
        if (error !== undefined) s.error = error;
        return s;
      };
      if (visited.has(ref.id)) {
        skips.push(at("duplicate"));
        continue;
      }
      visited.add(ref.id);

      if (ref.kind === "manifest") {
        const m: DiscoveredManifest = { id: ref.id, trail };
        if (ref.label !== undefined) m.label = ref.label;
        manifests.push(m);
        continue;
      }

      // A sub-collection: bounded by depth THEN doc budget, then fetched.
      if (depth + 1 > caps.depth) {
        skips.push(at("depth-cap"));
        continue;
      }
      if (docsAttempted >= caps.docs) {
        skips.push(at("doc-cap"));
        continue;
      }
      docsAttempted++; // charge the slot BEFORE fetching — a failed fetch still spends the budget
      let childJson: unknown;
      try {
        childJson = await fetchJson(ref.id);
      } catch (e) {
        skips.push(at("fetch-failed", e instanceof Error ? e.message : String(e)));
        continue;
      }
      const childLabel = ref.label ?? labelToString((childJson as Json)?.["label"], urlSegment(ref.id));
      await descend(childJson, ref.id, depth + 1, [...trail, childLabel]);
    }
  };

  await descend(rootJson, rootUrl, 0, [rootLabel]);

  return {
    status: manifests.length > caps.manifests ? "over-manifest-cap" : "ok",
    manifests,
    skips,
    docsAttempted,
    manifestCount: manifests.length,
  };
}

/** A member's inline label, or undefined when the collection didn't inline one (so the caller can
 *  tell "no label" from a real one — labelToString would mask it with a fallback). */
function inlineLabel(item: Json): string | undefined {
  const raw = item["label"];
  if (raw === undefined || raw === null) return undefined;
  return labelToString(raw, "") || undefined;
}

function kindOf(item: Json): "manifest" | "collection" {
  const t = String(item["type"] ?? item["@type"] ?? "");
  return /Collection/i.test(t) ? "collection" : "manifest";
}

/** Last path segment of a URL, decoded — the fallback label when a document/member has none. Exported so
 *  ingest-flows.ts's collection preview reuses the ONE segment-fallback definition (Archie-656a review). */
export function urlSegment(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] ?? "") || url;
  } catch {
    return url;
  }
}
