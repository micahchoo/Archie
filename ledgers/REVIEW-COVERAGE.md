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
