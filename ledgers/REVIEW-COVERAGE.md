# REVIEW-COVERAGE — adversarial review ledger

## Cycle 0 — Bootstrap baseline 2026-07-21

Commit examined: `8a577f0` (main). This is the first-run bootstrap (§9).

### Gate baseline

| Gate | Result | Detail |
|------|--------|--------|
| Typecheck | GREEN | 0 errors (6 packages) |
| Tests | GREEN | rc 1110 / rm 159 / rs 7 / av 138 / studio 919 / viewer 136 |
| Studio svelte-check | GREEN | 0 errors / 0 warnings, 1143 files |
| Viewer astro check | GREEN | 0 errors / 0 warnings / 0 hints, 46 files |
| Viewer islands | GREEN | 0 errors / 0 warnings, 1464 files |
| Build | GREEN | Studio (Vite) + Viewer (Astro) clean |
| dist mirror | GREEN | root dist/ matches packages/archie-viewer/dist/ |
| Embed ratchet | GREEN | 261.7KB gz, budget 262KB |
| Embed smoke | GREEN | 4/4 assertions PASS |
| Studio e2e | SKIP | no nav/chrome touched |
| Rust | SKIP | no src-tauri touched |

### Lane map

| Lane | Last examined | Status |
|------|--------------|--------|
| 1. Data-integrity spine | `8a577f0` | current |
| 2. Untrusted-input seams | `8a577f0` | current |
| 3. Gate-shadow code | `8a577f0` | current |
| 4. Hollow features | `8a577f0` | current |
| 5. Drift surfaces | `8a577f0` | current |
| 6. Dead weight | `8a577f0` | current |
| 7. Rust shell | `8a577f0` | current |

### Deferred issues from ISSUES.md

Issue 13 (collab summary inert), Issue 14 (note ladder claims), Issue 16 (gh-pages bake untested),
Issue 17 (embed drops whole-object notes), Issue 18 (App.svelte god-orchestrator) — all queued,
unverified at this bootstrap. Issues 22/25 need manual verify (ledgers/TABS.md, ledgers/MIRROR.md).

### Rotation

Next: Lane 1 (data-integrity spine) — per §3 lanes 1–2 alternate until clean cells current.

## Cycle 1 — 2026-07-21 [clean-cell]

Lane: 1 (data-integrity spine). Attack: round-trip torture — serialize→deserialize every AnnotationRecord field.

### Clean cells

| Check | Evidence (file:line) | Verdict |
|-------|---------------------|---------|
| AnnotationRecord field inventory (16 fields) | wadm/types.ts:231-274 | clean |
| Serialize carry sentinel | serialize.ts:47-64 | clean |
| Deserialize carry sentinel | deserialize.ts:31-48 | clean |
| Merge carry sentinel | merge.ts:204-221 | clean |
| Edit carry sentinel | log.ts:184-201 | clean |
| Delete carry sentinel | log.ts:252-269 | clean |
| Serialize runtime withExtensions | serialize.ts:228-236 | clean |
| Deserialize runtime recordFromHistoryAnnotation | deserialize.ts:75-123 | clean |
| Merge runtime resolveConflict | merge.ts:246-252,268 | clean |
| Write ordering (pages-first, index-last) | persist.ts:50-58 | clean |
| Per-page tolerant reads | persist.ts:61-93 | clean |
| SectionRecord round-trip (13 fields, twin sentinels) | structure-serialize.ts:52-104 | clean |

### Rotation

Lane 1 examined to `8a577f0`. Clean cells current. Next: Lane 2 (untrusted-input seams).

## Cycle 2 — 2026-07-21 [clean-cell]

Lane: 2 (untrusted-input seams). Attack: hostile-ingest surface audit — verify every .archie.zip open, assertSafeName, DOMPurify, CSP, URL params.

### Clean cells

| Check | Evidence (file:line) | Verdict |
|-------|---------------------|---------|
| fromZip + validateArchieMarker composed in ONE place | open.ts:70-71 | clean |
| Studio import uses sanctioned seam | ingest-flows.ts:1261 | clean |
| Viewer published uses sanctioned seam | published.ts:282 | clean |
| Embed load uses sanctioned seam | load.ts:96,110 | clean |
| load.ts sniff exception documented | .claude/rules/untrusted-archive-open-seam.md | clean |
| SRC_MAX_BYTES ONE definition | limits.ts:19 | clean |
| Double-cap-check (header + actual) | open.ts:99-102 | clean |
| fetch bound default — .bind(globalThis) | open.ts:92, http.ts:161 | clean |
| assertSafeName on Tauri | tauri.ts:255,266,278 | clean |
| assertSafeName on HTTP | http.ts:121 | clean |
| sectionKey parity with assertSafeName | structure.ts:39-43, test at structure.test.ts:85-92 | clean |
| DOMPurify html profile + dead-anchor hook | sanitize.ts:16-23 | clean |
| WADM import whitelist-based selector rebuild | wadm-import.ts:82-101 | clean |
| Slug hardening defence-in-depth | link.ts:207-209 | clean |
| Tauri CSP matches documented rule | tauri.conf.json:24 | clean |
| No URLSearchParams in any app | grep zero matches | clean |

### Rotation

Lane 2 examined to `8a577f0`. Lanes 1-2 clean cells current. Next: Lane 3 (gate-shadow code).

## Cycle 3 — 2026-07-21 [clean-cell]

Lane: 3 (gate-shadow code). Attack: browser-or-it-didn't-happen — verify bound-fetch-defaults at all four canonical sites + Svelte island gate coverage.

### Clean cells

| Check | Evidence (file:line) | Verdict |
|-------|---------------------|---------|
| HttpFilesystem fetch default bound | http.ts:161 | clean |
| fetchArchieLibraryBytes fetch default bound | open.ts:92 | clean |
| openLibraryFromSrc fetch default bound | load.ts:116 | clean |
| openLibraryFromTree fetch default bound | load.ts:214 | clean |
| http.ts brand-check test | http.test.ts:228-232 | clean |
| load.ts brand-check tests (2 entry points) | load.test.ts:265-275 | clean |
| Studio svelte-check gate | 0/0 at bootstrap | clean |
| Viewer svelte-check gate | 0/0 at bootstrap | clean |
| Viewer astro check | 0/0/0 at bootstrap | clean |
| Embed smoke (real Chromium) | smoke.mjs 4/4 PASS | clean |
| $effect runtime gap documented | Publish.svelte:240-242 | clean |

### Rotation

Lane 3 examined to `8a577f0`. Lanes 1-3 clean cells current. Next: Lane 4 (hollow features).

## Cycle 4 — 2026-07-21 [filed Archie-dace]

Lane: 4 (hollow features). Attack: hollow-feature trace — verify Issue 13 (collab identity writer) and Issue 17 (embed whole-object notes).

### Findings

| Check | Evidence (file:line) | Verdict |
|-------|---------------------|---------|
| Issue 13: identity writer `setIdentity` exists | App.svelte:156-159 | refuted-because |
| Issue 13: IdentityPrompt imported + mounted | App.svelte:37,2726 | refuted-because |
| Issue 13: LibraryHome permanent identity field | LibraryHome.svelte:494-498 | refuted-because |
| Issue 17: wholeObjects[0] only, drops 1..n | read-mount.ts:282 | filed Archie-dace |
| Issue 14: exhibit-note rung zero authoring UI | App.svelte createNote sites | noted (queued) |

### Rotation

Lane 4 examined to `8a577f0`. Next: Lane 5 (drift surfaces).

## Cycle 5 — 2026-07-21 [clean-cell]

Lane: 5 (drift surfaces). Attack: override rationale audit — pnpm-workspace.yaml overrides vs DEPS.md.

### Clean cells

| Check | Evidence (file:line) | Verdict |
|-------|---------------------|---------|
| yaml override rationale | pnpm-workspace.yaml:7 | clean |
| esbuild override (may be stale) | pnpm-workspace.yaml:8 | clean |
| dompurify override (may be stale) | pnpm-workspace.yaml:10 | clean |
| vite 8.x override + bound | pnpm-workspace.yaml:12 | clean |
| undici override + bound | pnpm-workspace.yaml:14 | clean |
| js-yaml override + bound | pnpm-workspace.yaml:21 | clean |
| vite 7.x override + bound | pnpm-workspace.yaml:28 | clean |
| stale astro exclusion removed | pnpm-workspace.yaml:34 | clean |
| DEPS.md every advisory reasoned-in-row | DEPS.md:96-134 | clean |

### Rotation

Lane 5 examined to `8a577f0`. Lanes 1-5 clean cells current. Next: Lane 6 (dead weight).

## Cycle 6 — 2026-07-21 [clean-cell]

Lane: 6 (dead weight). Attack: dead-code sweep — localStorage keys, orphan CSS, unimported exports.

### Clean cells

| Check | Evidence | Verdict |
|-------|----------|---------|
| archie.displayName.v1 reader+writer | App.svelte:114,158 | clean |
| archie.narrativeFirstAddShown.v1 reader+writer | App.svelte:124-125 | clean |
| archie.lastPlace.v1 reader+writer | App.svelte:217,687 | clean |
| archie.notesAsideWidth.v1 reader+writer | App.svelte:808,814 | clean |
| archie.notesAsideCollapsed.v1 reader+writer | App.svelte:809,815 | clean |
| .note-popover CSS rule live | NoteEditor.svelte:198 | clean |
| MarginColumn.svelte dead export | ISSUES.md Direction 7 — tracked | noted |

### Rotation

Lane 6 examined. All 7 lanes examined at least once. Rotation restarts at Lane 1 (data-integrity spine, now stale — `8a577f0` vs HEAD `ce8b577`).

## Cycle 7 — 2026-07-21 [clean-cell]

Lane: 7 (Rust shell). Attack: CSP + capability surface audit.

### Clean cells

| Check | Evidence | Verdict |
|-------|----------|---------|
| CSP script-src 'unsafe-eval' for PixiJS | tauri.conf.json:24 | clean |
| CSP img/media/connect-src https: for IIIF | tauri.conf.json:24 | clean |
| fs scope: \$APPDATA/\*\* + \$HOME/\*\* | capabilities/default.json:24 | clean |
| opener scoped github.com/github.io only | capabilities/default.json:27-32 | clean |
| Single-instance plugin | lib.rs:22-28 | clean |
| GitHub token in Rust (not webview) | lib.rs:33-40 | clean |
| Menu nav same-origin location.replace | lib.rs:53-65 | clean |

### Rotation summary (7 cycles, all 7 lanes)

| Cycle | Lane | Bucket |
|-------|------|--------|
| 1 | 1. Data-integrity spine | clean-cell |
| 2 | 2. Untrusted-input seams | clean-cell |
| 3 | 3. Gate-shadow code | clean-cell |
| 4 | 4. Hollow features | filed Archie-dace |
| 5 | 5. Drift surfaces | clean-cell |
| 6 | 6. Dead weight | clean-cell |
| 7 | 7. Rust shell | clean-cell |

**6 clean-cell + 1 filed across all 7 lanes.** HEAD moved from `8a577f0` to `b66e230` during the run (ledger commits). Next rotation: Lane 1 against current HEAD.

## CYCLE 8 DRY — 2026-07-21

Lane: 1 (data-integrity spine). Re-examined at 5113702. Zero diff from 8a577f0 in packages/render-core/. Clean cells from Cycle 1 remain current.

## CYCLE 9 DRY — 2026-07-21

Lane: 2 (untrusted-input seams). Re-examined at 5113702. Zero diff in open.ts, fs/, src-tauri/. Clean cells from Cycle 2 remain current.

## CYCLE 10 DRY — 2026-07-21

Lane: 3 (gate-shadow code). Re-examined at 5113702. Zero diff in http.ts, load.ts. Clean cells from Cycle 3 remain current.

## CYCLE 11 DRY — 2026-07-21

Lane: 4 (hollow features). Re-examined at 5113702. Zero diff in apps/studio/src/, packages/render-mount/src/. Filed Archie-dace from Cycle 4 remains active. Issue 13 refuted-because stands.

## CYCLE 12 DRY — 2026-07-21

Lane: 5 (drift surfaces). Re-examined at 5113702. Zero diff in pnpm-workspace.yaml, README.md. Clean cells from Cycle 5 remain current.

---

## Cycle 13 — 2026-07-22 [fixed@68368d4]
Lane: 1 (data-integrity spine). Attack: claim audit — verify every carry sentinel, write-ordering contract, and corrupt-vs-empty rule against the code.

### Findings

| id | sev | evidence | bucket | catchable |
|----|-----|----------|--------|-----------|
| corrupt-index-silent-empty | S2 | persist.ts:109-116, structure-persist.ts:100-107 | fixed@<hash> | yes — test 19c |

**Root cause:** `readAnnotationsReport` (persist.ts) and `readStructureReport` (structure-persist.ts) caught ALL exceptions from reading `index.json` and returned `{log:[], corrupt:[]}` — treating both "file not found" (absent) and "JSON parse error" (corrupt) identically. The comment at persist.ts:112 claimed the distinction was intentional, but `isNotFound()` from the seam was available and unused. A corrupt-but-present index was silently presented as "nothing authored," and the next write would overwrite it blind, orphaning valid history pages.

**Why no gate caught it:** The corruption test suite (persist.corruption.test.ts) covered missing pages (19a), corrupt pages (19b), and absent stores — but never a corrupt INDEX. The index was treated as the commit point (written last), so the assumed failure mode was "absent or valid," not "present and corrupt."

**Fix:** distinguish `isNotFound(e)` → absent (return empty) from other errors → corrupt (throw `AnnotationsCorruptError` / `StructureCorruptError`). Same fix in both persist.ts and structure-persist.ts. Test 19c added as permanent guard.

### Clean cells

| Check | Evidence (file:line) | Verdict |
|-------|---------------------|---------|
| 5 carry sentinels all 16/16 AnnotationRecord fields | serialize.ts:47-64, deserialize.ts:31-48, merge.ts:204-221, log.ts:184-201, log.ts:252-269 | clean |
| 4 carry sentinels all WorkingExhibitMeta/WorkingObjectMeta fields | working.ts:160-171 | clean |
| 2 carry sentinels all Exhibit/AObject fields | working.ts:216-226 | clean |
| persist.ts write order: heads → pages → index | persist.ts:35,50,59 | clean (heads-first is safe: consumer projection, not authoritative) |
| structure-persist.ts write order: pages → index | structure-persist.ts:44,47 | clean |
| site.ts write order: content → archie.json LAST | site.ts:636 | clean |
| readAnnotationsReport per-page tolerant | persist.ts:120-131 | clean |
| readStructureReport per-page tolerant | structure-persist.ts:110-119 | clean |
| read.ts getOptional absent-vs-failed | read.ts:62-71 | clean |
| session.ts surfaces loadCorruption from readAnnotationsReport | session.ts:124-126 | clean |
| working.ts throws AnnotationsCorruptError on corrupt pages | working.ts:305-306 | clean |

### Rotation

Lane 1 re-examined to current HEAD. Finding fixed. Next: Lane 2 (untrusted-input seams) — lanes 1-2 alternate until clean cells current.

### Gate summary

| Gate | Result |
|------|--------|
| Typecheck | GREEN — 0 errors (6 packages) |
| Tests | GREEN — rc 1111 / rm 159 / rs 7 / av 138 / viewer 136 / studio 919 |
| Studio svelte-check | GREEN — 0/0 (1143 files) |
| Viewer astro check | GREEN — 0/0/0 (46 files) |
| Viewer islands | GREEN — 0/0 (1464 files) |
| Build | GREEN |
| dist mirror | GREEN |
| Embed ratchet | GREEN — 261.7KB gz, budget 262KB |
| Embed smoke | GREEN — 4/4 PASS |
| Studio e2e | SKIP — no nav/chrome touched |
| Rust | SKIP — no src-tauri touched |

## CYCLE 14 DRY — 2026-07-22

Lane: 2 (untrusted-input seams). Re-examined at 68368d4. Zero diff from 8a577f0 in open.ts,
fs/tauri.ts, fs/http.ts, fs/names.ts, fs/zip.ts, fs/zip-stream.ts, text/sanitize.ts, link/link.ts,
read.ts, limits.ts, tauri.conf.json, capabilities/default.json, src-tauri/src/, and
.claude/rules/untrusted-archive-open-seam.md. All 14 clean cells from Cycle 2 remain current.
