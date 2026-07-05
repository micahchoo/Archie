# CANON — untrusted-zip open-path canonicalization ledger (ISSUES.md Issue 5)

Inventory taken 2026-07-05 against `main`. Prior art check (per Archie/CLAUDE.md): no relevant prior
art found anywhere under `/mnt/Ghar/2TA/DevStuff/Annotators/Image` — `.scratch/Prior Art/` covers SVG
sanitization and OAuth, not zip-handling or code-deduplication; sibling projects use "canonicalization"
only for URL rewriting. This design has no external precedent to reconcile against.

Full map (confirmed by direct read + call-site grep across the repo — the Issue-3 NUL-byte bug that
once made grep undercount in `apps/studio/src/App.svelte` was already fixed before this work started,
so the enumeration below is trustworthy):

- **`packages/archie-viewer/src/load.ts`** — instance-scoped, most general (byte-sniffing, injectable
  `fetchImpl`), called `validateArchieMarker` ✓
- **`apps/viewer/src/published.ts`** — module-global, had live-mode features `load.ts` lacks, called
  `validateArchieMarker` ✓ but hardcoded global `fetch` (no injection)
- **`apps/studio/src/ingest-flows.ts`'s `openZip`** — called `loadLibrary` directly, **never called
  `validateArchieMarker`** — the real security gap: a wrong-schema `.archie.zip` got a generic parse
  error instead of `NotAnArchieLibraryError`'s specific message.

`@render/core` already correctly centralized `ZipFilesystem.fromZip`, `validateArchieMarker`,
`NotAnArchieLibraryError`, `loadLibrary` — the duplication was entirely in the two viewer wrapper files;
studio's problem was a missing call, not a diverged copy.

## Design process

Ran the codebase-design skill's "design it twice" process: framed the deepening candidate (module /
interface / seam / dependency-category vocabulary), then 3 parallel sub-agents each designed a radically
different interface for the new canonical module — minimal (3 entry points), common-caller-optimized (4
entry points, added a `genericErrorMessage` knob to preserve studio's copy-paste-drifted string), and
maximal-flexibility (introduced a 5th `Filesystem` backend, `HttpFilesystem`, unifying the zip-open AND
the tree-over-HTTP marker-check into one seam).

**Decision:** adopted the minimal design as the base — smallest interface, no incidental-drift baked
into a permanent knob (rejected the common-caller design's `genericErrorMessage` option; unified the
three callers' generic fallback strings instead, since the variance was accidental copy-paste drift, not
intent). Borrowed one idea from the other two designs: export `looksLikeZip` from the module too (pure,
in-process, costs nothing, avoids a future 4th reimplementation of magic-byte sniffing).

**Deferred:** the maximal-flexibility design's `HttpFilesystem`/tree-unification insight is real (Archie
already has a `Filesystem` seam with memory/zip/fsa/tauri backends — an HTTP backend is the natural 5th
adapter, and it would collapse `load.ts`'s bespoke tree-marker-check into the same seam). Scoped out of
this pass: it's bigger than Issue 5's named duplication + gap, touches a foundational abstraction that
deserves its own review, and this repo's phased/≤5-files-then-verify discipline argues against folding
it in here. Flagged as a follow-up, not built.

## Migration

| losing call site | file | change | tests green |
|---|---|---|---|
| — (new canonical module) | `packages/render-core/src/publish/open.ts` + `open.test.ts` | added `openArchieLibrary`, `fetchArchieLibraryBytes`, `openArchieLibraryFromUrl`, `looksLikeZip`, `SRC_MAX_BYTES`; barrel-exported from `index.ts` | `pnpm --filter @render/core exec vitest run` — 70/70 files, 714/714 tests; `tsc --noEmit` clean |
| `openZip`'s `ZipFilesystem.fromZip(...)` with no marker validation | `apps/studio/src/ingest-flows.ts` | now calls `openArchieLibrary(file)` (validates the ADR-0020 marker) before `loadLibrary` — closes the security gap | `pnpm --filter @archie/studio exec vitest run` — 14/14 files, 148/148 tests (no pre-existing `ingest-flows.test.ts`; this path has no direct test coverage before or after — Issue 7's territory, not rebuilt here); `tsc --noEmit` clean |
| local `SRC_MAX_BYTES`, `openError`, `openZipBytes`'s manual `fromZip`+`validateArchieMarker`, `looksLikeZip` | `packages/archie-viewer/src/load.ts` | delegates to `@render/core`; kept `openZipBytes`/`SRC_MAX_BYTES` as re-exports for API compatibility; kept local `openError` (still used by the out-of-scope tree-path) and `openSrcAsZipIfBytesAreZip`'s manual fetch (genuinely different swallow-vs-throw contract, documented in-line) | `pnpm --filter @render/archie-viewer exec vitest run` — 7/7 files, 98/98 tests; `tsc --noEmit` clean |
| local `SRC_MAX_BYTES`, `openError`, `openZipBytes`'s manual `fromZip`+`validateArchieMarker` | `apps/viewer/src/published.ts` | `openLibraryFromFile`/`openLibraryFromSrc` now delegate to `openArchieLibrary`/`openArchieLibraryFromUrl`; `openError` and `openZipBytes` deleted entirely (no residual caller-local need, unlike `load.ts`) | `pnpm --filter @archie/viewer exec vitest run` — 9/9 files, 63/63 tests; `tsc --noEmit` clean |

Zero production call sites remain that call `ZipFilesystem.fromZip` outside `open.ts` (verified: `grep
-rn "ZipFilesystem.fromZip" apps packages`, excluding `*.test.ts` — the only non-comment hit is
`packages/render-core/src/publish/open.ts:56`).

**Commits:** not yet made — this repo's operating rule is to commit only on explicit request. All four
changes above are staged in the working tree, verified green individually and together (see below);
ready to commit as 3 focused commits (new module; studio gap fix; viewer/archie-viewer migration) once
authorized, matching this ledger's granularity.

## One disclosed, non-user-facing behavior change

`load.ts`'s dev-console log prefix on a `?src=`/`src=` fetch failure changed from `"archie-viewer:
couldn't fetch..."` to `"open: couldn't fetch..."` (now emitted by the shared module). No test asserts
on this string — only on the thrown user-facing `Error` message, which is byte-identical to before.

## Correction to ISSUES.md

The Issue 5 "Run it" block's test command `pnpm --filter archie-viewer exec vitest run` is wrong — the
package is named `@render/archie-viewer` (not bare `archie-viewer`), so `pnpm --filter archie-viewer`
matches nothing. Correct command used throughout this ledger:
`pnpm --filter @render/archie-viewer exec vitest run`.

## Lock

Rule recorded at `.claude/rules/untrusted-archive-open-seam.md` (scoped to the four files above): the
untrusted-archive open path lives in `packages/render-core/src/publish/open.ts` alone; a new caller
imports `openArchieLibrary`/`openArchieLibraryFromUrl`, never `ZipFilesystem.fromZip` +
`validateArchieMarker` directly.

**Done 2026-07-05** pending commit authorization: zero losing call sites, all four packages' full test
suites green (70+7+9+14 files / 714+98+63+148 tests), typecheck clean across all four, and the
canonicalization rule recorded both as a ledger and as a scoped `.claude/rules/` file.
