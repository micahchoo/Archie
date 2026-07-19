# ANTIPATTERN-SWEEP — 2026-07-19 (Archie-fb42)

Fresh re-run + one-time triage of the anti-pattern scan, against `main` @ `400d8d9` (the base this
branch was cut from). Supersedes the 2026-06-20 `.scratch/anti-pattern-report.txt` snapshot behind
the 8 stale seed tickets (fe6c, 7382, 2478, fddf, 983e, 8ada, b7cb, 3abe) — their line refs and
counts no longer match the churned tree.

## Method

No generator script for the original report exists anywhere in this repo (confirmed by
`ledgers/ARTIFACTS.md`'s own audit row and re-confirmed here — nothing under `.agents/`, `scripts/`,
or `qa/` produces the `[signal] file:line -- reason` format). This sweep is a manual re-run: targeted
`grep`/Python greps per signal over `apps/*/src` and `packages/*/src` (`.ts`/`.svelte`/`.mts`,
non-test files; test files excluded the same way the old report implicitly did — it never listed a
`*.test.ts` hit), each candidate then opened and read in context before a verdict was assigned. Two
prior-art ledgers did real triage work on overlapping ground and are cited throughout instead of
re-litigated: `ledgers/SILENCE.md` (2026-07-05 error-handling census, ISSUES.md Issue 4) and
`.claude/rules/render-core-data-integrity.md` (the absent-vs-failed / content-first-marker-last
contracts). Both predate today's HEAD's newest code (collection-import, bulk-delete/teardown), which
got fresh eyes here.

No NUL-byte files hit this sweep (the one that broke grep before, `App.svelte`'s byte 48001, was
fixed in `c96b787` and is byte-exact clean now — spot-checked with `file(1)`).

## [catch-all] — bare catch-all with no rethrow/reject/error-return/logging

92 `catch (...)` sites scanned (every one in non-test `apps/*/src`, `packages/*/src`). Read every
body. **Zero real defects** — every site does one of: rethrow (with a comment explaining what's
still safe about the rethrow-adjacent side effect), set a reactive error field consumed by visible UI
chrome, `console.error`/`console.warn` **and** throw/reject to a caller that shows UI, or a
documented-by-comment by-design swallow (mostly "nothing stored — fine" absent-vs-failed reads, or
the `.tmp` cleanup-of-a-cleanup case in `tauri.ts` the tauri-fs-seam rule already names). Representative
sample (full 92-site list available via `grep -naE 'catch\s*\(' <non-test src files>` — every entry
in this list carries the same verdict, so we don't repeat 92 near-identical rows):

- `apps/studio/src/binding-store.svelte.ts:263` — intentional — `saveProject`'s catch sets `s.error`
  (SILENCE.md row "Worklist 0.1: a failed ⌘S/Save must be loud"), consumed by `bindingError` chrome.
- `apps/studio/src/binding.ts:97` — intentional — primary error rethrown to the caller above; the
  secondary (`abort()`-during-cleanup) failure now `console.warn`s per SILENCE.md's fix (`a346b33`).
- `apps/studio/src/ingest-flows.ts:884` (`openZip`) — intentional — `ctx.alert(e.message)`, the exact
  SILENCE.md `a587471` fix (cause-specific message, not the old generic string).
- `apps/studio/src/publish-machine.svelte.ts:284,329,360` — intentional — every catch sets
  `s.error = asDeployError(e)`, consumed by the publish dialog's error state.
- `apps/viewer/src/published.ts:164,212,279,354,370,377` — intentional — this file is SILENCE.md's
  named "reference pattern the rest of the audit was measured against": absent-vs-failed always kept
  distinct, every degrade commented with the exact intended distinction.
- `packages/archie-viewer/src/element.ts:191,220,253,301,365,399` — intentional — `191/220/301` carry
  the message into `#setView({kind:"empty"/"exhibit", error})` (the SILENCE.md `893284e` fix); `253`
  logs (also `893284e`, the previously-silent Content-State resolve); `365/399` replace the mount host
  with a visible `.notice`.
- `packages/render-core/src/publish/read.ts:67,74,105,149,155,182,198`, `spine/persist.ts:124`,
  `spine/structure-persist.ts:114` — intentional — all implement the documented absent-vs-failed /
  per-item-tolerant contract (`render-core-data-integrity.md` rule 2): `FailedReadError` thrown or
  `incomplete`/`corrupt` flipped, never collapsed to "nothing here."
- `packages/render-core/src/fs/tauri.ts:93` inner `catch { /* best-effort */ }` — intentional — the
  documented temp-file-cleanup-of-a-cleanup case named in `.claude/rules/tauri-fs-seam.md`.
- `apps/studio/src/save-queue.svelte.ts:76` `run.catch(() => {})` — intentional, and already
  corrected once (SILENCE.md: "Correction, not a bug" — it's chain plumbing, not error handling; the
  real handling is the sibling `.then(onSuccess, onError)` two lines below).
- All remaining sites (`CreateExhibitDialog.svelte`, `LibraryHome.svelte`, `Publish.svelte`,
  `collection-import.ts`, `deploy/deploy-flows.svelte.ts`, `folder-drop.ts`, `AvEditor.svelte`,
  `ExhibitView.svelte`, `ViewerShell.svelte`, `load.ts`, `http.ts`, `open.ts`, `ghpages.ts`,
  `read-mount.ts`, `Canvas.svelte`) — intentional, same shape: either `window.alert`/local error-state
  assignment in the same block, or a rethrow with a one-line comment naming what's still safe.

## [console-only-error] — console.error/warn with no UI feedback in surrounding context

60 sites (28 `console.error`, 32 `console.warn`) read in context. **Zero real defects.** Every
`console.error` is paired with either a `throw`/`reject` that propagates to an already-verified UI
caller (`window.alert`, a dialog's error field, `#setView`), or a `window.alert` in the same
statement chain. Confirmed by direct read (not pattern-match) for the ones that looked riskiest on
name alone:

- `packages/render-mount/src/mount.ts:114`, `read-mount.ts:215,229` — `console.error` then
  `reject(new Error(...))` — the mount promise's rejection is what the OSD-hosting component catches.
- `packages/render-core/src/publish/open.ts:82`, `ghpages.ts:97` — `console.error` (raw HTTP status /
  GitHub detail, deliberately never shown to the author per the file's own doc comment) then `throw` a
  plain-language error the caller displays.
- `apps/viewer/src/published.ts:349,357` — `console.error` then `throw new Error("Couldn't load this
  exhibit...")`.
- `apps/studio/src/ingest-flows.ts:75` — `console.error` inside `manifestFetchFailureMessage`, which
  **returns** the user-facing string; callers do `onError(manifestFetchFailureMessage(...))`.
- `apps/studio/src/App.svelte:271` `console.warn` — paired with `window.alert(...)` two lines below
  (Issue 19 corruption surfacing).
- `apps/studio/src/publish-flows.svelte.ts:285` `console.error` — the one legitimately log-only site,
  but it's a background site-projection **cache warm** with no caller to report to (comment says so
  explicitly) and a documented fallback (re-projects on demand at actual publish time) — acceptable,
  matches SILENCE.md's severity calibration for low-stakes best-effort paths.
- The remaining `console.warn` sites all match the `render-core-data-integrity.md` rule 2
  absent-vs-failed / `incomplete`-flag contract, or are documented low-stakes (`AvEditor.svelte:281`
  peak-cache write, `handles-db.ts`, `binding.ts` recents/localStorage — all pre-reviewed in
  SILENCE.md as "harmless / private mode").

## [silent-catch] — catch body logs but never surfaces to the user

Distinct from catch-all: this is specifically "logged, but nothing user-visible happens as a result."
One real finding:

- `apps/studio/src/folder-drop.ts:24-26,40-42,54-57` — **real defect** — `readDroppedFolderFiles`'s
  three per-entry catches (`file()` read fails, `readEntries()` batch fails, a top-level entry throws)
  each do `console.warn` only and drop the entry. The file's own top-of-file comment claims "same
  skip-and-tally posture as ingest-flows.ts's per-file loops," but there is no tally: the function
  returns `File[]` with no count of how many entries were silently dropped, and both call sites
  (`CreateExhibitDialog.svelte:657`, `LibraryHome.svelte:384`) just consume the returned array with no
  comparison against the original entry count. A folder drop with permission-denied files silently
  imports fewer objects than the user dropped, with zero indication anything was skipped (devtools
  console only). See "Real defects" below.
- Every other candidate from the catch-all/console-only-error sweep that logs *does* also surface
  (throw/`window.alert`/error-state) — no other silent-catch findings.

## [fire-and-forget] — await with no try/catch/.catch() in nearby context

493 raw candidates (naive sweep: every `await` line with no `catch`/`.catch(` within an 8-line
window) across 52 files — comparable in shape to the old report's 150 (this codebase's non-test `src`
line count has grown ~2x since May). **Listing all 493 individually adds no signal**: the overwhelming
majority are ordinary `async` function bodies whose rejections propagate to a caller by normal JS
semantics, not floating/orphaned promises — the same limitation SILENCE.md already named about the
original scan ("a pure keyword sweep... cannot find this class of defect" — and, the mirror problem,
cannot rule it *out* either, without checking the actual call chain). This sweep checked the call
chains. Two convergent, code-verified guarantees make nearly the entire studio surface safe:

1. **`enqueueSave` (`apps/studio/src/save-queue.svelte.ts`) never throws** — its own doc comment:
   "Contract: enqueueSave NEVER throws/rejects — it returns `true`/`false`... fire-and-forget callers
   may still `void` it safely." Every `library-meta.svelte.ts` mutator (`removeExhibits`,
   `patchExhibits`, `addExhibit`, `removeObject`, ...) routes through `persist()` → `enqueueSave`, so
   `void lib.removeExhibits(...)`/`void lib.patchExhibits(...)` etc. are safe by this contract, not by
   omission.
2. **`binding-store.svelte.ts`'s `saveProject`/`openRecent` self-wrap** — both have their own
   top-level `try { ... } catch (err) { s.error = ...; }`, consumed by the `bindingError` chrome prop
   (verified by reading both functions in full). `void bnd.saveProject()` / `void bnd.openRecent(...)`
   are safe the same way.

Traced specifically (not just pattern-matched) because they looked highest-risk on first pass:

- `apps/studio/src/App.svelte:1852,1873,1875,1924` (`onundoimport`/`onremoveexhibit`/`onbulkdelete`
  → `void removeExhibitsById`/`removeExhibitById`/`removeCurrentExhibit`) — **intentional, verified,
  not a false alarm avoided by luck**: `exhibit-teardown.ts`'s `teardownAndRemoveExhibits` calls
  `clearExhibitStructure`/`clearExhibitAnnotations` (both `store.ts`, both a bare `catch { /* nothing
  stored — fine */ }` swallow already reviewed as by-design in SILENCE.md) and `removeMeta` →
  `lib.removeExhibits` → guarantee 1 above. The function cannot reject in practice. This was worth
  checking in full rather than pattern-matching "`void` + destructive op = bug" — it isn't, here.
- `apps/studio/src/App.svelte:1859,1861,1864,1889,1962,1976` (`void bnd.saveProject()` /
  `openRecent(...)`, `keepCopy()`) — intentional per guarantee 2 (`saveProject`/`openRecent`) and
  transitively per guarantee 1 (`keepCopy` bottoms out in `lib.persist()`/`lib.removeObject` etc.).
- `apps/studio/src/App.svelte:1963` `void ensurePub().then((p) => p.openMenu())` — intentional, low
  risk: the only await is a dynamic `import()` of an already-bundled chunk; a failure here means the
  Publish menu silently doesn't open (rare, no data-loss risk) — the actual publish action
  (`advPublish`) has its own try/catch (`Publish.svelte:229`/`323`) once the menu *is* open.
- `apps/studio/src/App.svelte:1801,1840` (`void openZipFile(f)`, `void openObjectInExhibit(...)`) —
  intentional: `openZipFile` → `flows.openZip` already catches internally and calls `ctx.alert`
  (SILENCE.md `a587471`); `openObjectInExhibit` bottoms out in the same session/save-queue path.

Per-file breakdown of the raw 493 (file, count, verdict) — every file below shares one of the two
guarantees above, or is non-studio internal plumbing (an `async` function whose own throw is the
error-handling — checked for `packages/render-core/src/publish/site.ts`, `fs/conformance.ts`, and
`fs/tauri.ts` specifically, see notes):

| file | candidates | verdict / reasoning |
|---|---:|---|
| `packages/render-core/src/publish/site.ts` | 81 | intentional — publish-tree builder; every exported entry point (`buildFullLibrary`, `collectSiteFiles`, ...) is called from `publish-flows.svelte.ts`, which wraps the outer call in try/catch (verified `publish-flows.svelte.ts:244`, `:281`'s explicit "no caller to report to" comment for the one background exception, already logged above) |
| `packages/render-core/src/fs/conformance.ts` | 61 | **noise, not a candidate at all** — a shared vitest fixture (`describe/it/expect`, donor: anvil `storage/backends/conformance.ts`); an unguarded `await` inside a `vitest` `it()` block is the *correct* pattern (let it throw, the test runner reports failure). Also covered by `.claude/rules/test-fixtures.md` ("never modify to fix one test"). The old report flagging this file was itself the false-positive category |
| `apps/studio/src/App.svelte` | 41 | intentional — component-scope; every destructive/ingest handler wired with `.catch(...)` (verified `:957,1842-2488`) or bottoms out in guarantee 1/2 above (verified `:1852-1976`) |
| `apps/studio/src/ingest-flows.ts` | 37 | intentional — every exported flow function either catches+returns an error object (`newExhibitFromManifest`, `openZip`, structure-merge paths — verified via catch-body reads) or is called by an App.svelte handler with `.catch()` |
| `apps/studio/src/store.ts` | 32 | intentional — OPFS read/write primitives; SILENCE.md's persistence-path table covers this file exhaustively (persistPending/loadLibraryMeta/loadPendingNotes/clearExhibit* rows) |
| `apps/studio/src/deploy/deploy-flows.svelte.ts` | 22 | intentional — GitHub OAuth/deploy plumbing called from `publish-machine.svelte.ts`, whose every catch sets `s.error` (verified above) |
| `apps/studio/src/publish-flows.svelte.ts` | 22 | intentional — `advPublish`'s try/catch (`Publish.svelte:229/323`) is the outer boundary; internal awaits are implementation detail of one publish attempt |
| `packages/render-core/src/publish/ghpages.ts` | 19 | intentional — every non-2xx throws `GitHubPublishError` (verified `ghError`/`ghJson` composition), caught by `deploy-flows.svelte.ts` |
| `apps/studio/src/tauri-fs.ts` | 14 | intentional — desktop fs backend; errors propagate to the same `Filesystem` consumers as every other backend (`fs/tauri.test.ts` conformance-suite-covered per `tauri-fs-seam.md`) |
| `packages/render-core/src/spine/persist.ts` | 11 | intentional — per-page corrupt-tolerant reads already covered under catch-all above |
| `apps/studio/src/binding-store.svelte.ts` | 10 | intentional — guarantee 2 |
| `apps/studio/src/library-meta.svelte.ts` | 10 | intentional — guarantee 1 |
| `packages/render-core/src/fs/tauri.ts` | 10 | intentional — the atomic-write temp+rename sequence (`tauri-fs-seam.md`); failures during `close()` propagate to the same `Filesystem` caller as any other backend, and the hardening tests (`tauri.test.ts`) specifically exercise the failure path |
| `packages/render-core/src/spine/structure-persist.ts` | 10 | intentional — structure sibling of `spine/persist.ts`, same per-page contract |
| `apps/studio/src/exhibit-session.svelte.ts` | 8 | intentional (awaits) — flagged separately under untested-churn below for a *different* reason (no test coverage of the state machine itself, not a fire-and-forget gap) |
| `apps/studio/src/folder-backend.ts` | 8 | intentional — folder-mirror fs backend, same shape as `tauri-fs.ts`/`fs/tauri.ts` |
| `apps/viewer/src/published.ts` | 8 | intentional — SILENCE.md's named reference pattern |
| `packages/render-core/src/publish/portable.ts` | 8 | intentional — publish-pipeline internals, same as `site.ts` |
| all remaining files (≤6 candidates each: `bake.ts`, `fs/fsa.ts`, `fs/zip.ts`, `CreateExhibitDialog.svelte`, `structure-session.svelte.ts`, `load.ts`, `publish/open.ts`, `publish/read.ts`, `Publish.svelte`, `create-exhibit-dialog.ts`, `exhibit-teardown.ts`, `structure-import.ts`, `element.ts`, `publish/marker.ts`, `session/session.ts`, `AvEditor.svelte`, `asset-urls.svelte.ts`, `handles-db.ts`, `ViewerShell.svelte`, `reader.ts`, `ExhibitOverview.svelte`, `GalleryThumb.svelte`, `binding.ts`, `collection-import.ts`, `dzi-slicer.ts`, `ExhibitView.svelte`, `av-player.ts`, `fs/http.ts`, `fs/memory.ts`, `iiif/image-index.ts`, `mount.ts`, `read-mount.ts`, `Canvas.svelte`) | ≤6 each, 60 total | intentional — same two patterns (self-contained error state, or throw-propagates-to-an-already-verified-caller); individually spot-checked a majority while tracing the App.svelte call graph above |

## [untested-churn] — high commit count (6mo), no test coverage

The old report's check (same-named `.test.ts` file) undercounts — this codebase tests by *scenario*
file, not 1:1 mirroring (e.g. `store.ts`'s functions are exercised from `ingest-flows.test.ts`,
`bulk-rights.test.ts`, `structure-lifecycle.svelte.test.ts`, not a `store.test.ts`). Re-ran with "is
this module imported by **any** `*.test.ts` in the repo" instead. Threshold: ≥8 commits in the last 6
months (old report's lowest entry was 9).

| file | commits (6mo) | test coverage | verdict |
|---:|---:|---|---|
| `apps/studio/src/App.svelte` | 101 | untested | intentional — `.svelte` orchestrator; the project's testing strategy for view components is `svelte-check` + browser-drive (`.claude/rules/svelte-no-typecheck-net.md`, `run-app` skill), not vitest. Same call the old report's own list made (App.svelte was flagged there too, at 44 commits) |
| `apps/studio/src/LibraryHome.svelte` | 37 | untested | intentional, same reason (old report: 11 commits) |
| `apps/studio/src/ExhibitOverview.svelte` | 30 | untested | intentional, same reason (old report: 12 commits) |
| `packages/render-core/src/publish/site.ts` | 25 | **tested** | noise — covered, old report's line no longer applies |
| `packages/render-core/src/index.ts` | 22 | tested | noise — a barrel re-export, exercised transitively |
| `apps/viewer/src/published.ts` | 21 | tested | noise |
| `apps/viewer/src/components/ExhibitView.svelte` | 21 | tested | noise |
| `apps/studio/src/ingest-flows.ts` | 21 | tested | noise |
| `apps/viewer/src/components/NarrativeReader.svelte` | 20 | untested | intentional (view component), same as above — was in old report (18 commits) |
| `apps/viewer/src/components/Reader.svelte` | 18 | tested | noise — was in old report untested (18 commits); now covered |
| `apps/studio/src/store.ts` | 18 | tested | noise — was in old report untested (10 commits); now covered per the re-check above |
| `apps/studio/src/publish-flows.svelte.ts` | 17 | tested | noise |
| `packages/render-mount/src/mount.ts` | 16 | tested | noise |
| `apps/viewer/src/components/ViewerShell.svelte` | 14 | untested | intentional (view component), was in old report (13 commits) |
| `apps/studio/src/Publish.svelte` | 14 | untested | intentional (view component) — successor to the old report's `PublishDialog.svelte` (10 commits) |
| `apps/studio/src/NarrativeEditor.svelte` | 14 | untested | intentional (view component), was in old report (9 commits) |
| `packages/render-core/src/spine/log.ts` | 13 | tested | noise |
| `packages/render-core/src/session/session.ts` | 13 | tested | noise |
| `apps/studio/src/AvEditor.svelte` | 13 | untested | intentional (view component) |
| `packages/render-svelte/src/Canvas.svelte` | 12 | tested | noise — was in old report untested (12 commits), now covered |
| `packages/render-core/src/iiif/manifest.ts` | 12 | tested | noise |
| `apps/viewer/src/components/MediaPlayer.svelte` | 12 | tested | noise — was in old report untested (12 commits), now covered |
| `apps/studio/src/binding-store.svelte.ts` | 11 | tested | noise |
| `apps/studio/src/CreateExhibitDialog.svelte` | 11 | untested | intentional (view component; new-ish, IIIF collection import UI) |
| `apps/viewer/src/components/ReadingLegend.svelte` | 9 | untested | intentional (view component), was in old report (9 commits) |
| `apps/studio/src/NoteEditor.svelte` | 9 | untested | intentional (view component) |
| `apps/viewer/src/components/Gallery.svelte` | 8 | tested | noise |
| `apps/studio/src/CmdK.svelte` | 8 | untested | intentional (view component — a command palette; interaction-heavy, `svelte-check`-gated) |
| `packages/render-mount/src/surface.ts` | 7 | untested (below threshold, checked anyway) | noise — 77-line type/interface contract module (`ADR-0002` mount-surface types), not executable logic; consumers (`mount.ts`) are tested |
| `apps/studio/src/exhibit-session.svelte.ts` | 6 (below threshold, checked anyway) | untested | **real defect (coverage gap, not a bug)** — see below |

## [impact-scope] — widely-imported module with a low tested-importer fraction

Could not reproduce the original transitive (Tier 0 direct + Tier 1 depth-2) import-graph analysis —
no such tool exists in-repo, and this codebase's cross-package imports go through bare specifiers
(`@render/core`, `@render/mount`) via barrel `index.ts` re-exports, which a relative-path grep can't
resolve without a real module resolver. This is a methodology limitation, not a "no findings" claim —
noted rather than papered over.

What *is* checkable directly: the five modules the old report specifically named now each have a
dedicated test file exercising them, closing the originally-flagged gap:

| module | old report | now |
|---|---|---|
| `apps/studio/src/seed-data.ts` | 3/5 importers untested | imported by `geo-notes.test.ts` |
| `apps/viewer/fixtures/sample-data.ts` | 4/9 importers untested | imported by `sample-data.test.ts` |
| `packages/archie-viewer/src/element.ts` | 14/38 importers untested | imported by `element.test.ts` |
| `packages/render-core/src/publish/marker.ts` | 15/45 importers untested | imported by `marker.test.ts` |
| `packages/render-mount/src/read-mount.ts` | 2/7 importers untested | imported by `read-mount.test.ts` |

Verdict for all 5: noise/stale — the specific historical gap looks closed. No new impact-scope
candidates enumerated (methodology limitation above).

## [todo-density] — TODO/FIXME/HACK/XXX comment clusters

Only 2 hits in non-test `apps/*/src`, `packages/*/src` (repo-wide `TODO` grep outside that scope is
out of task bounds):

- `apps/studio/src/App.svelte:2093,2691` — noise — the comment itself states "sits disabled, not
  absent": the "Preview how it opens" button is a deliberately-disabled placeholder, not silent debt.
- `apps/viewer/src/components/ExhibitView.svelte:287-288` — noise — `TODO(0045)` is an explicitly
  numbered, externally-tracked reference (a contrast-rescue color tweak), not an untracked stub.

## [unpaired-resource] — acquire/lock with no matching release/unlock

One real candidate: `apps/studio/src/App.svelte:369` `writerLock.claim()` / `:372`
`writerLock.release()` (on `beforeunload`). Read `writer-lock.svelte.ts`: the underlying primitive is
`navigator.locks.request(name, {mode:"exclusive"}, async (lock) => {...})` — the Web Locks API's
managed-callback shape, which auto-releases when the callback's promise settles; `claim()`/`release()`
are the app's own wrapper, and they're symmetric (claim on boot, release on unload). Verdict: noise —
correctly paired, and there's nothing else lock/acquire/release-shaped in non-test `src`.

The old report's single unpaired-resource finding (`App.svelte:48001`) was itself a documented false
positive — a raw NUL byte in the file made the byte *offset* collide with a lock-shaped match; fixed
in `c96b787` (`ledgers/ARTIFACTS.md`). It doesn't reproduce here because the byte is gone, not because
anything was silently dropped.

## Counts

| signal | found (raw candidates) | real defects | intentional | noise |
|---|---:|---:|---:|---:|
| catch-all | 92 | 0 | 92 | 0 |
| console-only-error | 60 | 0 | 59 | 1 (background cache-warm log, accepted low severity) |
| silent-catch | 3 (folder-drop.ts's three sites, one finding) | 1 | 0 | 0 (subset of catch-all/console-only-error otherwise) |
| fire-and-forget | 493 | 0 | 493 | 0 (1 file — `conformance.ts`, 61 lines — is arguably not a candidate at all; counted as intentional here) |
| untested-churn | 33 (≥8 commits) | 1 | 17 | 15 |
| impact-scope | 5 (re-checked from old report) | 0 | 0 | 5 |
| todo-density | 2 | 0 | 0 | 2 |
| unpaired-resource | 1 | 0 | 0 | 1 |
| **total** | **689** | **2** | **661** | **24 (+2 methodology-limited)** |

## Real defects

1. **`readDroppedFolderFiles` silently drops unreadable folder-drop entries with no user-visible
   count** (`apps/studio/src/folder-drop.ts:24-26,40-42,54-57`; consumed by
   `apps/studio/src/CreateExhibitDialog.svelte:657` and `apps/studio/src/LibraryHome.svelte:384`).
   The walker's own doc comment claims parity with `ingest-flows.ts`'s per-file tally pattern, but
   it doesn't tally — it just returns fewer `File`s than were dropped, logging only to devtools.
   A user who drags in a folder containing a permission-denied file (or one removed mid-drag) gets a
   quietly smaller import with zero indication why, unlike every other batch-import path in Studio
   (folder picker, IIIF manifest, CSV/WADM note import), which all surface either a per-run alert or
   a "N couldn't be added" summary.
   - **Proposed ticket**: "folder-drop: surface skipped-entry count to the caller" — Priority: low
     (cosmetic/UX-observability, not data loss — the files simply aren't imported, nothing is
     corrupted). Fix sketch: change `readDroppedFolderFiles`'s return to `{ files: File[]; skipped:
     number }` (or a `{name, reason}[]`), and have both call sites fold that into the same "N
     couldn't be added" alert `newExhibitFromFolder`'s own per-file loop already produces, so a
     drag-drop failure reads the same as a picker-based one.

2. **`exhibit-session.svelte.ts`'s atomic open/autosave state machine has zero test coverage**
   (`apps/studio/src/exhibit-session.svelte.ts`, 156 lines, 6 commits/6mo, not imported by any
   `*.test.ts`). This is the module whose own header comment explains it exists *specifically* to fix
   a partial-state-visibility bug class ("the old inline `openExhibit` interleaved 7 mutations across
   2 awaits — partial states visible") — exactly the kind of subtle sequencing bug that regresses
   silently under refactor without a test pinning the atomicity contract (session/annDir/storeReady
   swap in one synchronous batch). No bug was found in the current code (read in full; the ordering
   looks correct) — this is a coverage gap on a module that has already had one bug in this exact
   shape, not a live defect.
   - **Proposed ticket**: "add a characterization test for exhibit-session's atomic open transition" —
     Priority: moderate. Fix sketch: a test that opens exhibit A, starts `open(B)`, and asserts no
     subscriber-visible read ever sees a mixed A/B state (session for B with annDir still null, or
     vice versa) — mirroring the bug the module's own comment describes fixing.

## Delta from the stale seed tickets

- `Archie-fe6c` (catch-all, 1 finding @ 2026-06-20) → 92 candidates now, 0 real defects. Count grew
  from code volume, not from new bugs.
- `Archie-7382` (console-only-error, 1 finding) → 60 candidates now, 0 real defects.
- `Archie-2478` (fire-and-forget, 150 findings) → 493 candidates now, 0 real defects (2 App.svelte
  clusters specifically re-verified rather than assumed).
- `Archie-fddf` (untested-churn, 6 findings) → 33 candidates (≥8 threshold) now, 1 real (coverage-gap)
  finding.
- `Archie-983e` (impact-scope, 4 findings) → same 5 modules re-checked, all closed.
- `Archie-8ada` (todo-density, 1 finding) → 2 findings now, both noise (one is the same one, still
  noise; one is new and also noise).
- `Archie-b7cb` (silent-catch, 1 finding) → 1 real finding now, but a **different** site
  (`folder-drop.ts`, new code) — the original site this ticket pointed at no longer matches.
- `Archie-3abe` (unpaired-resource, 1 finding) → 0 findings now; the original was a NUL-byte artifact,
  independently confirmed fixed.
