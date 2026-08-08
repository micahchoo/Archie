# PROBE — read-seam adversarial pair (2026-08-08)

Two adversarial probes were written against the read seam the 9-phase architecture deepening
(`docs/plans/ARCHITECTURE-DEEPENING-2026-08-07.md`, landed `8341381`) had just unified. Phase 1 made
`publish/open.ts` + `fs/http.ts` + `fs/zip.ts` the ONE composition every consumer funnels through —
which is exactly why probing it is worth more than probing any one consumer: a defect here is a defect
in the viewer, the embed, and studio's ingest at once.

| probe | owns | result |
| --- | --- | --- |
| `scripts/probe/read-path-in-core-adversarial.mts` | `ZipFilesystem.fromZip`, `openArchieLibrary`, `fetchArchieLibraryBytes`, `fetchZipBytesIfAny`, `assertSafeSegment`, `classifyArchieMarker` — hand-crafted bytes, no server | **72/81 checks, 6 finding classes** |
| `scripts/probe/read-path-transport-adversarial.mts` | `HttpFilesystem` + `fsJsonSource` against a fault-injection HTTP server (hangs, torn bodies, lying headers, 404-with-8MiB-body, 16-way concurrency) | **40/43 checks, 3 finding classes** |

## The findings, and their state

| # | finding | state |
| --- | --- | --- |
| A | `ZipFilesystem` has no name gate: `getFile("../x")`, `("/abs/x")`, `("a\\b")`, `("a/../b")` all resolve to bytes, and `tryResolveFile` walks `a/../b` through | **open** — no test yet |
| B | Corrupt-zip decode surfaces fflate-raw text ("invalid zip data") — `openError` rethrows any `Error` verbatim, so the friendly steer never fires | **open** — no test yet |
| C | A truncated STORED entry decodes to short bytes SILENTLY: the EOCD-declared size is never compared against actual (measured 79 bytes for a declared 100) | **open** — no test yet |
| D | Torn transfer propagated raw: `fetchArchieLibraryBytes`/`fetchZipBytesIfAny` wrapped `fetch()` but not `arrayBuffer()` | **fixed** — friendly error / swallow-to-null, per each function's own documented contract |
| E | `openArchieLibrary(Blob)` bypassed the byte cap — opened 1,073,742,244 bytes against a 1 GiB `SRC_MAX_BYTES` (`ZIP_LIMITS` bounds only what the archive DECLARES) | **fixed** — checked off `Blob.size` BEFORE `arrayBuffer()` |
| F | A present-but-torn `archie.json` surfaces `FailedReadError`, not the marker's refusal — `validateArchieMarker` wraps the exhibits probe, not the marker read | **open** — needs a surface decision (see below) |
| G | No timeout anywhere in the HTTP read path — a hung server hangs the viewer forever | fixed by a **concurrent session** |
| H | A query-carrying base swallowed every segment into the QUERY: base `…/tree?g=gen` + `exhibits.json` requested pathname `/` query `?g=gen/exhibits.json` (server-observed) and classified the file ABSENT — a silent wrong-target read | fixed by a **concurrent session** |
| I | Same join bug into the FRAGMENT (fetch strips it before sending) | fixed by a **concurrent session** |

F is not obviously a defect and should not be "fixed" without deciding the surface: per
`[[render-core-data-integrity]]` #2 a torn read IS a FAILED read, so `FailedReadError` is arguably
correct. The argument for a refusal is that this surface holds the bytes in hand — nothing is
transient about a torn marker inside a zip you already have — whereas the hosted-tree gate, where
`FailedReadError` is right, is measured correct already (transport cases 13a–13g all pass).

## Two things the probes found that the probes were not looking for

**1. `main` shipped a RED suite.** The deepening's own Verification record claims "render-core 1521"
green. Measured on the committed tree at `8341381`: **7 tests failing** (4 in `fs/http.test.ts`, 3 in
`publish/open.test.ts`) — the tests for findings D/E/G/H/I were committed WITHOUT their
implementations. The claim and the tree disagree; the tree is what ships. Reconcile a gate matrix
against a run you watched, per `[[post-review-fixes-are-unreviewed]]` §2.

**2. `doclint` is red on `main`** — the deepening touched the scope of 8 hubs (authoring, data,
desktop, embed, process, publishing, reading, verification) with no closure line on any of them. The
stale-hub convention is a CI gate as of 2026-07-27, so this is a red build, not a docs nicety.

## The relative-base regression, measured

The concurrent session's fix for H/I parses the base with `new URL(base)`. That is safe only for an
ABSOLUTE base, and the viewer's real base is not one — `apps/viewer/src/published.ts:31` is
`` `${import.meta.env.BASE_URL}published` ``, i.e. `/published`. Driven directly:

```
THROWS base="/published"           -> TypeError: Invalid URL
THROWS base="published/"           -> TypeError: Invalid URL
OK     base="https://host/published"
```

Every `HttpFilesystem` test uses an absolute base, so **the render-core suite is green while every
hosted read in the viewer throws at construction**. The string-level split (`base.search(/[?#]/)`,
slice, normalize the path half) has no such dependency, because a relative base is a legal thing for
this layer to receive and not its business to resolve. Same shape as
`[[svelte-no-typecheck-net]]`: the gate answered its question correctly, and the question was not
"do the bases real callers pass still work?".

## Also worth keeping

- The probes report per-item (`scripts/lib/checklist.mjs`, P9's unified tail): every check runs, and
  the tail re-lists FAILs with contract wording. That is why 9 findings came out of one run each
  instead of one finding per fix-and-rerun cycle.
- Cases that PASSED are contract evidence too, and some are load-bearing: a 404 with an 8 MiB dribbled
  body returns absent in 1 ms (fail-fast on the status line, never consumes the body); 16 parallel
  opens and generation-keyed reads (`?g=genA` vs `?g=genB`) do not cross-contaminate; `__proto__` in a
  marker does not pollute `Object.prototype`.
- Documented non-defects: `assertSafeSegment` accepts U+2215 / U+FF0F (division slash, fullwidth
  solidus) because the predicate mirrors the FSA rule — they are legal literal name characters, not
  separators, on every backend that joins them.

> **RESOLVED 2026-08-08 (caa3736)** — appended by the documentation-freshness pass; the staged
> content above is untouched. All four "open — no test yet" findings are now fixed with regression
> tests in committed `caa3736` (read-path hardening):
>
> - **A** (zip name gate) → `ZipFilesystem` now gates entry names; tickets Archie-b436 (name
>   containment), Archie-d2dc (torn transfers), Archie-7c77 (Blob byte cap) created+closed with fix
>   refs. Regression coverage: `zip.test.ts` 23/23.
> - **B** (raw fflate decode text) → friendly `openError` steer fires; Archie-7e30 created+closed.
>   `open.test.ts` 24/24.
> - **C** (silently short truncated STORED entries) → declared-vs-actual size compared; Archie-e2d4
>   created+closed. `zip.test.ts` (above).
> - **F** (torn-marker surface) → refusal path decided and landed; Archie-3bd0 created+closed.
>   `marker.test.ts` 20/20.
> - HTTP transport findings (G timeout, H query-carrying base, I fragment) → Archie-0f07 / 9d0f
>   created+closed; `http.test.ts` 27/27.
>
> The relative-base regression ("render-core stays green while every hosted read in the viewer
> throws") was fixed by the string-level `base.search(/[?#]/)` split (`packages/render-core/src/fs/http.ts:178`)
> in the same commit — no `new URL(base)` dependency remains.
>
> The two "main is red" claims were true only transiently at `8341381` (the 7 failing tests were
> committed before their implementations; the 8 stale-hub closure lines were absent). Both are
> resolved on the current tree: render-core 1544/1544, doclint 12/12 checks PASS.
