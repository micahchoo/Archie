// Layer-zero read caps (ticket C2). Home for size limits shared across layers: publish/open.ts
// (untrusted `.archie.zip` fetch/decode) and fs/http.ts (HttpFilesystem response cap) both bound
// reads by SRC_MAX_BYTES — fs/ importing it from publish/ was a layering inversion, so the
// definition lives here, below both. publish/open.ts re-exports it (the seam's documented surface,
// per .claude/rules/untrusted-archive-open-seam.md); this remains the ONE definition.

/** Default cap on untrusted source bytes — a `.archie.zip` in hand or fetched, or any single
 *  HTTP-backend response (ADR-0009 untrusted-content boundary). The single canonical constant —
 *  no consumer redefines this.
 *
 *  Raised 256 MB → 1 GiB (SCALE zip round-trip). Rationale: 256 MB refused a legitimately
 *  media-heavy shared library at the URL-open (`?src=`) door. This governs bytes that are fetched
 *  AND fully decoded in-memory (the whole zip → `unzipSync` → a Map), so it is bounded by what a
 *  browser tab can actually hold, NOT by how large a library can get — a multi-GB library is meant
 *  to be HOSTED as a published tree, not fetched-and-opened as one monolithic zip. 1 GiB admits a
 *  substantial single-file library while keeping the DoS ceiling (network + in-memory decode)
 *  realistic. Also caps single HTTP-backend responses (`fs/http.ts`) — a loose per-response ceiling,
 *  not a typical size. */
export const SRC_MAX_BYTES = 1024 * 1024 * 1024; // 1 GiB
