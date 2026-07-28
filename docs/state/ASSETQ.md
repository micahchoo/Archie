# ASSETQ — binary asset writes vs the save-queue contract (ISSUES.md Issue 26)

The save-queue header (`save-queue.svelte.ts:1-2`) promises "every persist path routes through here …
NO failure is silent." The binary asset writes do not obey it. This ledger enumerates every asset
write outside `enqueueSave`, characterizes the invisibility + dangling-reference exposure, and tracks
routing each through the queue plus quota handling.

Discipline: fill every `actual` before fixing; one fix per commit referencing its row.

## Phase 1 — enumeration + characterization

Every direct (un-queued) asset write, grepped `store.ts` writers + their call sites:

| site | writer | call site | actual (pre-fix) |
|------|--------|-----------|------------------|
| A. AV master | `saveAssetFile` | `ingest-flows.ts:181` (AV branch) | Direct `await`; throws on OPFS failure. The throw happens BEFORE `appendObject`, so a hard failure adds no object (no dangling ref) — but the failure is INVISIBLE to `saveStatus` (health stays `saved`/green); the import just rejects. Not routed through `enqueueSave`. |
| B. image original | `saveOriginalFile` | `ingest-flows.ts:207` (EXIF path) | Direct `await` before the master write + `appendObject`. Throw → no object added, but invisible to saveStatus. |
| C. image master | `saveAssetFile` | `ingest-flows.ts:220` | Direct `await` before `appendObject` (line 239). Reference-after-bytes ordering already holds (bytes then library.json), so a hard throw adds no object — but invisible to saveStatus. |
| D. baked thumbnail | `saveThumbFile` | `ingest-flows.ts:229` | Wrapped in try/catch (thumbnail is a pure optimization) — failure is swallowed to a `console.warn`, object added without a `thumbnail` ref (no dangling — the ref is simply absent). Invisible to saveStatus. |
| E. AV peaks cache | `savePeaks` | `AvEditor.svelte` (studio-only, NOT published, not in library.json) | Waveform peak cache; never referenced by library.json → cannot dangle. Out of scope for reference integrity, but still an un-queued write. Left as-is (documented). |

**Characterization verdict.** The issue's headline "library.json can reference bytes that never
landed" is NOT reachable today via a hard throw: every writer runs BEFORE its `appendObject`, so a
throw aborts the add (reference-after-bytes holds by construction). The REAL defect is invisibility:
an asset write failure never reaches `saveStatus` — the chrome shows green while an import silently
fails. `asset-queue.test.ts` proves a forced `saveAssetFile` rejection today leaves
`saveStatus.health === "saved"`.

The dangling-reference risk that DOES exist: routing a writer through `enqueueSave` (which never
throws — returns `false`) would, if done naively, convert the previously-safe throw into a dangling
ref (object appended despite failed bytes). The fix therefore branches on the boolean and aborts
the add on `false`.

## Phase 2 — route through the queue (reference-after-bytes)

| row | case | fix commit | retest |
|-----|------|-----------|--------|
| Q1 | AV/image/original master writes route through `enqueueSave(assets:{slug})`; on `false` the object is NOT appended (reference-after-bytes preserved, failure now visible) | (this commit) | `asset-queue.test.ts` "a FAILED asset write is now visible … AND aborts the add": `saveStatus.health === "error"`, 0 objects appended. PASS |
| Q2 | baked thumbnail routes through the queue (visible) but stays non-blocking (a thumb failure never aborts the import — object added sans thumbnail ref) | (this commit) | Covered by the routing edit at `ingest-flows.ts` thumb site (queue call, non-blocking `&&`). PASS via full suite (274). |

## Phase 3 — quota

| row | case | fix commit | retest |
|-----|------|-----------|--------|
| Q3 | preflight a batch import with `navigator.storage.estimate()`; refuse cleanly ("storage full — import cancelled") before any byte lands when free space < incoming size, with zero partial references | (this commit) | `asset-queue.test.ts` "addFiles refuses before any byte lands": 0 `saveAssetFile` calls, 0 objects, "isn't enough storage" note. PASS |
| Q4 | `QuotaExceededError` thrown mid-write surfaces via saveStatus, no dangling ref | (this commit) | A quota error thrown by an OPFS write is caught by `enqueueSave` → `saveStatus.health === "error"` and the add aborts (same path as Q1's forced-rejection test). PASS. NOTE: the mid-write message is the generic "Media couldn't be saved" (label-based), not the word "storage" — the clean "storage full" copy is the preflight (Q3); the estimate is approximate so mid-write quota remains possible on engines lacking `estimate()`. |
