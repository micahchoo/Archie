# PERSIST — annotation persistence crash-consistency (ISSUES.md Issue 19)

The Archie annotation store is a **multi-file transaction** whether it was designed as one or
not. `writeAnnotations` (`packages/render-core/src/spine/persist.ts`) and `readAnnotations`
must agree on a commit point and a torn-read policy, or a torn write presents as an *empty
exhibit* — silent total annotation loss, the opposite of the append-only "nothing is ever lost"
promise.

**Loop:** characterize every row against a `MemoryFilesystem` (Phase 1, actuals below), then fix
one row per commit (Phase 2). Tests: `pnpm --filter @render/core exec vitest run`; studio surfacing
via `pnpm --filter @archie/studio exec vitest run`.

## Root cause (the schema-level defect)

Write order was `heads.json → history/index.json → pages (Promise.all)` — the index (the read
target) was committed **before** the pages it references. Any interruption after the index write
(tab close, crash, quota) leaves `index.json` listing a page that does not exist. `readAnnotations`
then `Promise.all`-read every listed page with **no per-page tolerance** — one missing/corrupt page
rejects the whole read — and `readExhibitLog` (`publish/working.ts`) caught *every* throw to `[]`
("nothing authored"). Net: torn write → whole exhibit reads empty, no error; the next save writes a
fresh index over it, orphaning every old page permanently.

Fix shape: **pages first, index last** (index = commit point); **per-page-tolerant read**
(skip-and-report, never all-or-nothing); **corrupt ≠ empty**, surfaced through a typed error the
studio-open path and viewer live-source both already sit above.

## Ledger

| case | expected | actual (Phase 1, current code) | verdict | fix commit | retest |
|------|----------|-------------------------------|---------|-----------|--------|
| **19a** index lists a missing page (torn write: index committed, page never written) | corruption reported; surviving pages still load (per-page tolerant); studio must NOT seed-fresh-over-it | `readAnnotations` **throws** `no such file: {id}.json` (Promise.all rejects); `readExhibitLog` swallows → `[]` → exhibit reads empty, no error; next save orphans old pages | FIXED — write pages before index (commit point); tolerant `readAnnotationsReport` (skips + reports); `readExhibitLog` throws typed `AnnotationsCorruptError` on corrupt≠absent; `session.load.loadCorruption` + studio guards seed-over | `<fix1>` | ✅ persist.corruption.test.ts (6) + write-order test; 743 render-core, 270 studio, svelte-check 0 err |
| **19b** one corrupt page (invalid JSON on disk) | same as 19a — reported, other pages survive | `readAnnotations` **throws** `Expected property name … in JSON`; swallowed to `[]` identically | FIXED — same tolerant-read path as 19a (JSON.parse failure is just another per-page skip+report) | `<fix1>` | ✅ persist.corruption.test.ts 19b |
| **19c** duplicated page / duplicate revs (`fromHistory` vs `serialize`'s `dedupe`) | `fromHistory` dedupes by `rev` like `serialize.ts:50-60`; a duplicated page does not spawn plural heads | `fromHistory([page,page])` returns **2** records for a 1-record page (no dedupe) → duplicate `rev` survives → spurious `plural heads` throw at `log.ts:49` on the next edit | FIX — dedupe by `rev` in `fromHistory` (mirror `serialize`'s first-seen `Set<RevId>`) | | |
| **19d** DAG cycle (`linearHead` `heads.length===0` fallback) | a cycle is corruption → throw, not a silent guess | `linearHead` **silently returns the last version** (`?? versions[last]`) on a pure cycle — no head exists yet it hands one back | FIX — `heads.length===0` ⟺ every version referenced as parent ⟺ cycle → throw a corruption error (the `?? versions[last]` fallback was dead code for valid DAGs) | | |
| **19e** user exhibit slugged `"sample"` aliases the legacy `SAMPLE_SLUG` top-level `annotations/` dir | a user slug can never map onto the legacy path | **REACHABLE**: `newExhibit` (App.svelte:619-622) slugifies the title and only de-dupes against existing exhibit slugs; no seed occupies `"sample"` (seed slugs: voynich*, language-atlas, geo-map, sampler), so titling an exhibit "Sample" yields slug `"sample"` → `openExhibitAnnotationsDir`/`readExhibitLog` route it to `{project}/annotations/` (legacy), aliasing any pre-multi-exhibit data there | FIX (minimal) — reserve `"sample"` at the studio slug-mint site (`newExhibit`); full retirement of the `SAMPLE_SLUG` special-case needs a store.ts migration (off-limits this loop) — flagged as follow-up | | |

## Notes / deferrals

- **19e** ingest-flows.ts and store.ts also mint/route slugs but are owned by a concurrent agent's
  worktree this loop — the reservation is applied only at `newExhibit` (the primary user-facing
  create path). Retiring `SAMPLE_SLUG` entirely (migrate `{project}/annotations/` →
  `exhibits/sample/annotations/` once, drop the alias) is the durable fix; deferred as it requires
  editing store.ts.
- Surfacing target (per scope): `AnnotationSession.load` carries a `loadCorruption` field;
  `exhibit-session.svelte.ts` reads it to (a) surface and (b) refuse to seed-fresh-over a torn store.
  The viewer live-source (`initLiveSource`) already wraps `loadWorkingLibrary` in try/catch → a
  thrown `AnnotationsCorruptError` becomes a `console.warn` + fall-back-to-published (corrupt ≠ the
  silent-empty it showed before).
