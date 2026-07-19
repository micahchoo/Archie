---
scope: packages/render-core/src/publish/open.ts,packages/archie-viewer/src/load.ts,apps/viewer/src/published.ts,apps/studio/src/ingest-flows.ts
tags: [security, canonicalization, zip, untrusted-input]
priority: high
source: hand-written
---

# The untrusted-archive open path lives in ONE module — never copy it

`packages/render-core/src/publish/open.ts` (`openArchieLibrary`, `openArchieLibraryFromUrl`,
`fetchArchieLibraryBytes`, `looksLikeZip`, `SRC_MAX_BYTES`) is the **only** place `ZipFilesystem.fromZip`
and `validateArchieMarker` are composed. Every consumer that opens an untrusted `.archie.zip` —
`packages/archie-viewer/src/load.ts`, `apps/viewer/src/published.ts`, `apps/studio/src/ingest-flows.ts`
— imports this module instead of re-implementing the decode-then-validate sequence.

**Why:** this is the trust boundary for hostile input (ISSUES.md Issue 5, `ledgers/CANON.md`). Before
canonicalization, `load.ts` and `published.ts` had near-verbatim duplicate copies of the zip-bomb-cap +
marker-validate + capped-fetch logic (drifted in small ways — one surfaced `e.message`, the other
sometimes didn't), and `apps/studio/src/ingest-flows.ts`'s `openZip` skipped `validateArchieMarker`
entirely — a wrong-schema `.archie.zip` got a generic parse error instead of `NotAnArchieLibraryError`'s
specific message. A security-relevant fix (a cap change, a new marker rule) made to one copy silently
skipped the others.

**How to apply:**
- A new "open an untrusted archive" call site imports `openArchieLibrary` (bytes/Blob in hand) or
  `openArchieLibraryFromUrl` (fetch a URL under a cap, then decode) from `@render/core` — it does not
  call `ZipFilesystem.fromZip` or `validateArchieMarker` directly.
- `SRC_MAX_BYTES` has one definition, in the layer-zero `packages/render-core/src/limits.ts`
  (moved there by ticket C2 so `fs/http.ts` can share the cap without importing upward from
  `publish/`; `open.ts` re-exports it, so consumers keep importing it from this seam / the
  `@render/core` barrel). Don't redeclare the cap constant locally, even as an "identical" literal.
- The only sanctioned caller-local exception is `packages/archie-viewer/src/load.ts`'s
  `openSrcAsZipIfBytesAreZip` fallback: it needs raw fetched bytes back **before** committing to decode
  (to sniff via `looksLikeZip`), and needs a fetch failure to swallow to `null` rather than throw (so the
  original tree-open error surfaces) — a genuinely different error-handling contract from
  `fetchArchieLibraryBytes`'s always-throws contract, not an oversight. Don't use this as precedent for
  a new hand-rolled copy elsewhere; if a new caller needs the same swallow-then-sniff shape, extract it
  into `open.ts` instead of copying `load.ts`'s version.
- `apps/archie-viewer/src/load.ts`'s `openLibraryFromTree` (the published-tree-over-HTTP marker check)
  and `apps/viewer/src/published.ts`'s hosted-tree reading (`loadGallery`/`httpSource`) are a related,
  currently-separate validator — deliberately NOT folded into this seam (would require a new
  `Filesystem` HTTP backend; scoped out of Issue 5, flagged as a follow-up in `ledgers/CANON.md`). Don't
  treat their existence as license to add a *third* shape for the zip-open case.
