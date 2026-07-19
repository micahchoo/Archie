// Layer-zero read caps (ticket C2). Home for size limits shared across layers: publish/open.ts
// (untrusted `.archie.zip` fetch/decode) and fs/http.ts (HttpFilesystem response cap) both bound
// reads by SRC_MAX_BYTES — fs/ importing it from publish/ was a layering inversion, so the
// definition lives here, below both. publish/open.ts re-exports it (the seam's documented surface,
// per .claude/rules/untrusted-archive-open-seam.md); this remains the ONE definition.

/** Default cap on untrusted source bytes — a `.archie.zip` in hand or fetched, or any single
 *  HTTP-backend response (ADR-0009 untrusted-content boundary). The single canonical constant —
 *  no consumer redefines this. */
export const SRC_MAX_BYTES = 256 * 1024 * 1024; // 256 MB
