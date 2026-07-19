// Object identity — the ONE place object-id shapes are minted, composed, and detected (Archie-9ea8).
//
// An Object is a canvas within an Exhibit (the canvas-id stem: `${base}${slug}/canvas/${objectId}`).
// Historically (ADR-0001 drift) object ids were exhibit-LOCAL ordinals `o1`, `o2`, … minted by a
// len+1 probe in ingest-flows.ts — a scheme that could REUSE a deleted object's id (remove o3 from
// [o1,o2,o3], re-add → o3 again) and only ever guaranteed uniqueness within one exhibit. Archie-8a45
// settled the replacement: mint library-global ULIDs (the SAME family as the annotation spine's
// logical ids), and give the future migration (Archie-8c10 / Archie-8439, NOT this ticket) a
// deterministic composed grammar for turning a legacy `<exhibitId>` + local id into a global one.
//
// This module owns ALL of that. No other file may regex or hand-parse an object-id shape — a caller
// that needs to know "is this a pre-migration exhibit-local id?" asks isLegacyObjectId here.
import { mintUlid, asObjectId, type ObjectId } from "./wadm/brand.js";

// The legacy exhibit-local grammar: a bare `o` followed by one or more digits (`o0`, `o1`, `o12`).
// This is exactly what nextObjectId minted, so it is the detector the migration keys off. A composed
// id (`ex-voynich.o9`) or a ULID (26-char Crockford base32) does NOT match — both are already global.
const LEGACY_OBJECT_ID_RE = /^o\d+$/;

/**
 * Mint a fresh, library-global object id from the ULID family — the same mechanism the spine uses for
 * logical ids (mintUlid). Never collides with a prior (even deleted) object's id, closing the
 * id-reuse bug the old len+1 probe carried. `now`/`rng` are injectable for deterministic tests.
 */
export function mintObjectId(now?: number, rng?: () => number): ObjectId {
  return asObjectId(mintUlid(now, rng));
}

/**
 * Compose the deterministic, library-global id the FUTURE migration assigns to a legacy exhibit-local
 * object: `<exhibitId>.<ordinal>` (e.g. composeLegacyObjectId("ex-voynich", "o9") === "ex-voynich.o9").
 * Deterministic — the same inputs always produce the same id — so a migration is idempotent and the
 * seed fixtures can carry stable, post-migration-shaped ids. `ordinal` is the object's legacy local id.
 */
export function composeLegacyObjectId(exhibitId: string, ordinal: string): ObjectId {
  return asObjectId(`${exhibitId}.${ordinal}`);
}

/**
 * True iff `id` is a legacy exhibit-local object id (`/^o\d+$/`) — a pre-migration ordinal that is only
 * unique within its exhibit. Composed ids and ULIDs are already global and return false.
 */
export function isLegacyObjectId(id: string): boolean {
  return LEGACY_OBJECT_ID_RE.test(id);
}
