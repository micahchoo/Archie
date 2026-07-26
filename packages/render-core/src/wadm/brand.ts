// Branded id types + constructors for the annotation spine (ADR-0003 / Q-3).
//
// Brand pattern adopted from anvil anvil-uri.ts:14-21 (ADR-0029): a phantom unique
// symbol makes nominally-distinct string subtypes that erase at build time.
//
// Id scheme (CONTEXT.md "deceptively-simple" ID row): ULID logical ids, the
// {logicalId}/v{n} version grammar, never-reuse. Logical ids are time-ordered so
// the append-only log sorts naturally and the version DAG has a stable spine.

declare const __brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** Stable identity of a Note across all its versions (a ULID). */
export type LogicalId = Brand<string, "LogicalId">;
/**
 * The DAG-node id: per-record-unique ULID, the `parent` pointer's target.
 * Distinct from VersionId because `{logicalId}/v{n}` collides under concurrency
 * (ADR-0003 Refinement 2026-05-25). This is git's commit-hash to VersionId's tag.
 */
export type RevId = Brand<string, "RevId">;
/** A specific version's resolvable CITATION id: `{logicalId}/v{n}` (n >= 1). Not the DAG node id. */
export type VersionId = Brand<string, "VersionId">;
/** The author/agent that wrote a version (merge `lastEditor`). */
export type ClientId = Brand<string, "ClientId">;
/** An Exhibit identity (IIIF Manifest scope). */
export type ExhibitId = Brand<string, "ExhibitId">;
/** A Library identity (IIIF Collection scope). */
export type LibraryId = Brand<string, "LibraryId">;
/** An Object identity, unique within its Exhibit (the canvas-id stem). */
export type ObjectId = Brand<string, "ObjectId">;

// ---- ULID (dependency-free; Crockford base32) ----

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // excludes I L O U
const TIME_LEN = 10;
const RAND_LEN = 16;
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function encodeTime(time: number, len: number): string {
  if (!Number.isFinite(time) || time < 0 || !Number.isInteger(time)) {
    throw new RangeError(`ULID time must be a non-negative integer ms, got ${time}`);
  }
  let str = "";
  let t = time;
  for (let i = len - 1; i >= 0; i--) {
    const mod = t % 32;
    str = ENCODING[mod] + str;
    t = (t - mod) / 32;
  }
  return str;
}

function encodeRandom(len: number, rng: () => number): string {
  let str = "";
  for (let i = 0; i < len; i++) {
    str += ENCODING[Math.floor(rng() * 32)];
  }
  return str;
}

/**
 * Mint a fresh raw ULID string (time prefix + random suffix) — the shared core of
 * every branded mint (LogicalId / RevId / ObjectId). `now` (ms) and `rng` are
 * injectable for deterministic tests; defaults use wall-clock + Math.random. The time
 * prefix is big-endian, so larger timestamps sort lexicographically later (ADR-0003 spine).
 * Callers brand the result to their own id type — see mintLogicalId / mintRevId / mintObjectId.
 */
export function mintUlid(now: number = Date.now(), rng: () => number = Math.random): string {
  return encodeTime(now, TIME_LEN) + encodeRandom(RAND_LEN, rng);
}

/**
 * Mint a fresh ULID logical id. `now` (ms) and `rng` are injectable for
 * deterministic tests; defaults use wall-clock + Math.random. The time prefix is
 * big-endian, so larger timestamps sort lexicographically later (ADR-0003 spine).
 */
export function mintLogicalId(now: number = Date.now(), rng: () => number = Math.random): LogicalId {
  return mintUlid(now, rng) as LogicalId;
}

/**
 * Mint a fresh per-record DAG node id (ULID). Same encoding as logical ids but a
 * distinct brand: every appended record gets its own rev, so the parent pointer is
 * collision-free even when two concurrent edits share a `{logicalId}/v{n}` citation id.
 */
export function mintRevId(now: number = Date.now(), rng: () => number = Math.random): RevId {
  return mintUlid(now, rng) as RevId;
}

/** Brand an existing ULID string as a RevId. Throws on malformed input. */
export function asRevId(s: string): RevId {
  if (typeof s !== "string" || !ULID_RE.test(s)) {
    throw new TypeError(`invalid RevId (expected 26-char ULID): ${JSON.stringify(s)}`);
  }
  return s as RevId;
}

/** Brand an existing string as a LogicalId, validating ULID format. Throws on malformed input. */
export function asLogicalId(s: string): LogicalId {
  if (typeof s !== "string" || !ULID_RE.test(s)) {
    throw new TypeError(`invalid LogicalId (expected 26-char ULID): ${JSON.stringify(s)}`);
  }
  return s as LogicalId;
}

/** Build the resolvable version id `{logicalId}/v{n}` (n must be a positive integer). */
export function versionId(logicalId: LogicalId, version: number): VersionId {
  if (!Number.isInteger(version) || version < 1) {
    throw new RangeError(`version must be a positive integer (>=1), got ${version}`);
  }
  return `${logicalId}/v${version}` as VersionId;
}

// ONE source for the `{ULID}/v{n}` shape, composed from ULID_RE so the charset is never spelled
// twice. Both the bare-version parser and the published-IRI extractor below are built from it.
const VERSION_ID_SRC = `(${ULID_RE.source.replace(/^\^|\$$/g, "")})\\/v([1-9][0-9]*)`;
const VERSION_ID_RE = new RegExp(`^${VERSION_ID_SRC}$`);

/** Parse a version id back into its logical id + version number. Throws on malformed input. */
export function parseVersionId(vid: VersionId): { logicalId: LogicalId; version: number } {
  const m = typeof vid === "string" ? vid.match(VERSION_ID_RE) : null;
  if (!m) {
    throw new TypeError(`invalid VersionId (expected {ULID}/v{n}): ${JSON.stringify(vid)}`);
  }
  return { logicalId: m[1] as LogicalId, version: Number(m[2]) };
}

// A PUBLISHED annotation id is `{baseUrl}{slug}/annotations/{ULID}/v{n}` (publish/site.ts `citeBase`).
// Anchored on `/annotations/` AND on the end of the string, so a base path that happens to contain
// `/annotations/` cannot shift the match — the failure mode a `split("/").at(-2)` would have had, and
// which would have been invisible until someone deployed under such a path.
const PUBLISHED_NOTE_ID_RE = new RegExp(`\\/annotations\\/${VERSION_ID_SRC}$`);

/**
 * The logical (stable, version-free) id of a note, from EITHER form callers hold: a bare ULID as it
 * appears in an address (`#/<slug>/a/<ULID>`), or a full published annotation IRI. Anything else —
 * a tombstoned cite, a foreign IRI, a malformed hand-typed id — is `null`, never a throw (ADR-0003:
 * a miss degrades honestly).
 *
 * WHY THIS EXISTS. The cite ladder's note rung had NEVER resolved (V100). `route.ts` parses one path
 * segment out of `#/<slug>/a/<id>`, while published ids are full IRIs, and `note-arrival.ts` compared
 * the two with `===`. Nothing could satisfy it, and both halves were individually correct — the bug
 * lived only in the seam. Normalising BOTH sides through this helper is what closes it, and it is why
 * the comparison must never go back to matching raw ids.
 */
export function logicalIdOf(id: string | null | undefined): LogicalId | null {
  if (typeof id !== "string") return null;
  const s = id.trim();
  if (s === "") return null;
  if (ULID_RE.test(s)) return s as LogicalId; // already a bare logical id (the address-bar form)
  const m = s.match(PUBLISHED_NOTE_ID_RE);
  return m ? (m[1] as LogicalId) : null;
}

/** Brand a non-empty string as a ClientId. */
export function asClientId(s: string): ClientId {
  if (typeof s !== "string" || s.length === 0) {
    throw new TypeError(`ClientId must be a non-empty string`);
  }
  return s as ClientId;
}

/** Brand a non-empty string as an ExhibitId. */
export function asExhibitId(s: string): ExhibitId {
  if (typeof s !== "string" || s.length === 0) {
    throw new TypeError(`ExhibitId must be a non-empty string`);
  }
  return s as ExhibitId;
}

/** Brand a non-empty string as a LibraryId. */
export function asLibraryId(s: string): LibraryId {
  if (typeof s !== "string" || s.length === 0) {
    throw new TypeError(`LibraryId must be a non-empty string`);
  }
  return s as LibraryId;
}

/** Brand a non-empty string as an ObjectId. */
export function asObjectId(s: string): ObjectId {
  if (typeof s !== "string" || s.length === 0) {
    throw new TypeError(`ObjectId must be a non-empty string`);
  }
  return s as ObjectId;
}
