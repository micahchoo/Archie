# NEGSPACE — ingest boundary negative-space matrix (ISSUES.md Issue 7)

Inventory taken 2026-07-05 against `main`, after Issues 5/6 landed. Probed with real,
local-only faults — a local HTTP server for the IIIF-fetch cases, crafted byte buffers for
the zip cases, direct calls for the pure parsers — never a live remote host. Every "actual"
below is either a real probe result (quoted verbatim, run via a temporary `*.test.ts` deleted
after this phase) or a direct code read cited by file:line. No fixes in this phase.

Six flows, six negative-space cases each (`remote service down/404/non-JSON 200` marked N/A
for flows with no network leg).

## IIIF manifest URL import (`ingest-flows.ts:310-342` `newExhibitFromManifest`, `iiif-import.ts` `manifestToExhibit`)

| case | actual | verdict |
|---|---|---|
| invalid input — malformed JSON body | outer `catch` on `resp.json()` throwing → `alert("Couldn't open that link. Check the address is correct and reachable.")` | pass |
| invalid input — valid JSON, not a manifest (`{hello:1}`) | `manifestToExhibit` throws `ManifestImportError("That URL didn't return a IIIF manifest.")`, surfaced verbatim (already covered by `iiif-import.test.ts`) | pass |
| empty data — manifest with 0 usable canvases | `ManifestImportError("That IIIF link has no images or media Archie can add.")` (tested) | pass |
| huge input | **Probed live**: a local server streaming 60 MB of JSON-array body downloaded + `resp.json()`-parsed in 213 ms with **zero size check** — no cap exists before paying that cost, unlike the zip-bomb path (512 MB cap) or `?src=` (`SRC_MAX_BYTES` 256 MB). A slow-drip multi-GB response blocks the fetch indefinitely / risks OOM-ing the tab. This is the exact gap ISSUES.md Issue 7 named. | **fail** |
| remote down / 404 / non-JSON 200 | **Probed live** against a real local server: connection-refused → one alert; HTTP 404 → one alert (`console.error` + alert); 200 OK with an HTML body → `resp.json()` throws → same generic alert as the down case. All three: exactly one clean alert, no stack trace, no hang. (Non-JSON-200 reuses the "reachable" wording rather than a "that's not JSON" one — cosmetic, not blocking.) | pass |
| double-submit | The button (`LibraryHome.svelte:246`) fires `window.prompt` — a blocking native dialog — so two submissions can't interleave mid-fetch; each call is purely additive (`ctx.newExhibit` makes a new exhibit), nothing shared to corrupt. | pass |
| mid-flow interruption | The per-object loop (`ingest-flows.ts:332-338`) calls `exhibit()`, which reads `ctx.currentSlug()` **live** on every iteration. The Editor view has no blocking overlay during import (only a toast, `App.svelte:1424-1430`) — a user who navigates to a different exhibit mid-import gets later objects silently appended to the wrong exhibit. | **fail** |

## Image-folder import (`ingest-flows.ts:250-306` `newExhibitFromFolder`, `folder-import.ts`)

| case | actual | verdict |
|---|---|---|
| invalid input — folder with no image/audio/video files | `planFolderImportGroups` → `[]` → `ctx.alert("No images, audio, or video found in that folder.")` | pass |
| invalid input — some files individually corrupt | per-file `try/catch` in the loop (`ingest-flows.ts:285-291`), skip-and-tally, reported in the end summary | pass |
| empty data | same empty-groups path as above | pass |
| huge input (thousands of files) | no count cap; sequential with per-file progress + skip-and-tally — slow, not a hang or crash | pass (perf caveat, not correctness) |
| remote service down/404/non-JSON 200 | N/A — no network leg | n/a |
| double-submit | native `webkitdirectory` picker is modal; each call additive (new exhibit per group) | pass |
| mid-flow interruption | **Same root cause as the IIIF row above**: `newExhibit` (called per group) navigates into the Editor view and sets `currentSlug`; the per-file loop's `addObjectFromFile` reads `exhibit()` live. A multi-folder import (several subfolders → several groups) is especially exposed: switch exhibits while group 2 of 3 is still importing, and its remaining files land on whatever exhibit the user switched to. | **fail** |

## `.archie.zip` open (`ingest-flows.ts:442-462` `openZip`, `render-core/publish/open.ts`)

| case | actual | verdict |
|---|---|---|
| invalid input — non-zip / garbage bytes | **Probed live**: `fflate`'s `unzipSync` throws `"invalid zip data"`, surfaced verbatim. **Correction**: this looked like a leaked internal string at first read, but `ledgers/SILENCE.md` row 32 (ISSUES.md Issue 4) already examined this exact site and *deliberately chose* pass-`e.message`-through-when-`Error` over a generic fallback — verified there with the same forced check, same result, recorded as **pass** ("the thrown message ('invalid zip data') now reaches `ctx.alert` instead of the generic line"). Re-litigating it here would contradict that recorded decision without new evidence; not re-opened. | pass — deliberate (Issue 4, `a587471`) |
| invalid input — valid zip, wrong schema (no ADR-0020 marker) | **Probed live**: `"This file isn't an Archie library. Choose a published .archie.zip exported from Archie."` | pass |
| empty data — zip with 0 exhibits | `ingest-flows.ts:456`: `alert("That file has no exhibits to open.")` | pass |
| huge input (zip bomb: size / entry-count / ratio) | Already exhaustively tested (`fs/zip.test.ts`, `ZIP_LIMITS`) — 512 MB / 50k entries / 100× ratio all throw specific, friendly messages | pass |
| remote service down/404/non-JSON 200 | N/A — local file only | n/a |
| double-submit | Gated by `ctx.confirmReplace()` (blocking `window.confirm`); overlapping calls can't race past it — worst case two sequential, clean replacements | pass |
| mid-flow interruption | `replaceProjectFrom` calls `ctx.cancelPendingSave()` *first*, specifically to stop an in-flight autosave timer from writing the outgoing session into the incoming project's dirs (documented `Archie-788e`) — the class of bug this case probes for was already closed here | pass |

## CSV notes import (`ingest-flows.ts:346-391` `importNotesCsv`, `csv-import.ts`)

| case | actual | verdict |
|---|---|---|
| invalid input — malformed CSV / wrong columns | `planCsvImport` → `skipped:[{row:0, reason:"Missing columns: ..."}]`, surfaced via the composed `importNote` | pass |
| empty data — 0-byte file | `planCsvImport`: `rows.length===0` → `skipped:[{row:0, reason:"the file is empty"}]` | pass |
| huge input | No size cap anywhere on this path: `file.text()` then a full-file `parseCsv` char-scan, entirely on the main thread. A many-hundred-MB CSV freezes the tab for the duration of the parse — same class of gap as the IIIF-fetch row, just on the local-file vector. | **fail** |
| remote service down/404/non-JSON 200 | N/A | n/a |
| double-submit | `existing` dedup `Set` is rebuilt from **live** `session.entries` at the start of every call; note-creation is synchronous once `file.text()` resolves (no per-note await), so two overlapping submissions of the same file run-to-completion serially and the second one dedupes cleanly against the first's results | pass |
| mid-flow interruption | Exactly one await (`file.text()`); everything after is synchronous — nothing to interrupt mid-loop | pass |

## WADM import (`ingest-flows.ts:395-418` `importNotesWadm`, `wadm-import.ts`)

| case | actual | verdict |
|---|---|---|
| invalid input — malformed JSON | `JSON.parse` wrapped in `try/catch` → `setImportNote("Couldn't read “name” — it isn't a valid notes file.")` | pass |
| invalid input — legacy `oa:`/`sc:AnnotationList` | explicit, specific refusal message | pass |
| empty data — valid JSON, no annotations | `"No notes found in that file. Archie reads a W3C Web Annotation file..."` | pass |
| huge input | Same class as CSV: `file.text()` + `JSON.parse` on an arbitrarily large file, no cap, main-thread | **fail** |
| remote service down/404/non-JSON 200 | N/A | n/a |
| double-submit | Same reasoning as CSV — dedup `Set` seeded fresh per call, synchronous note-creation loop | pass |
| mid-flow interruption | Same as CSV — no per-note await | pass |

## VTT/SRT transcript import (`App.svelte:1002-1007` `onImportTranscript`, `AvEditor.svelte:321-326` `loadTranscript`, `render-core/av/transcript.ts`)

| case | actual | verdict |
|---|---|---|
| invalid input — malformed text (no `-->` cue lines at all) | **Probed live**: `parseVtt`/`parseCues` returns 0 cues on non-cue text; `importTranscript` returns the log unchanged (`log.length` 0 added); `onImportTranscript` only calls `bump()`/`openPanelTo` when `n > 0` — with 0 cues there is **no alert, no toast, no note, nothing**. The user picks a file and the UI gives zero indication anything happened, success or failure. | **fail** — silent wrong result |
| empty data — 0-byte file | **Probed live**: identical to the malformed case, same silent no-op | **fail** — same root cause |
| huge input | No cap anywhere; `parseCues` is an unbounded char-scan of the whole string, same class as CSV/WADM's gap | **fail** — same class, lower severity |
| remote service down/404/non-JSON 200 | N/A — local file only | n/a |
| double-submit | `loadTranscript` resets `input.value=""` before any await; each import is additive with **no dedup** (unlike CSV/WADM) — but this is documented, deliberate: "APPEND-ONLY... no destructive replace, no heuristic merge... each cue becomes a new note even if it overlaps existing ones" (`App.svelte:999-1001`, `archie-av Q-1`, advisor-decided). Re-importing the same file twice doubling its cues is the *designed* behavior, not a bug. | pass — by design, cited |
| mid-flow interruption | One await (`file.text()`), then fully synchronous | pass |

## Summary

8 fail rows (a 9th, zip-open's "invalid zip data", turned out to be a already-decided pass on
recheck — see its row above), clustering into 3 root causes:

1. **Transcript import silently no-ops on unparseable/empty input** (2 rows) — highest priority: reads as success, isn't.
2. **Mid-flow exhibit-switch misdirects objects/notes to the wrong exhibit** (2 rows, one root cause) in the IIIF-manifest and folder-import per-item loops — real correctness bug, needs a pinned-target-slug guard.
3. **No byte cap on four ingest vectors** (4 rows: IIIF fetch, CSV, WADM, transcript) — the network one (IIIF fetch) is Issue 7's own named symptom; the local-file ones are the same class of gap on a different vector.

## Fixes

| # | item | case | fix commit | retest |
|---|---|---|---|---|
| 1 | transcript import | invalid input (silent no-op) | (this fix; hash filled at close) | pass — studio suite 148/148 green; re-probed the malformed-text case, now sets `importNote` |
| 2 | transcript import | empty data (silent no-op) | (this fix; hash filled at close) | pass — same fix, same re-probe (empty string) |
| 3 | IIIF manifest import | mid-flow interruption (wrong-exhibit misdirect) | | |
| 4 | folder import | mid-flow interruption (wrong-exhibit misdirect) | | |
| 5 | IIIF manifest import | huge input (no byte cap) | | |
| 6 | CSV import | huge input (no byte cap) | | |
| 7 | WADM import | huge input (no byte cap) | | |
| 8 | transcript import | huge input (no byte cap) | | |

Done when every row above reads pass.
