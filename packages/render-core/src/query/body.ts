import type { W3CBody } from "../wadm/types.js";

/** Normalize a W3C `body` (single | array | absent) to a list. The ONE body traversal shared by both
 *  the internal-record accessors (filter.ts) and the published-annotation accessors (published.ts) —
 *  the two differ only in how they read the *reading* key, not in how they list bodies. */
export function bodyList(x: { body?: W3CBody | W3CBody[] }): W3CBody[] {
  const b = x.body;
  if (b === undefined) return [];
  return Array.isArray(b) ? b : [b];
}
