# CLAIMS — operational-docs claim-vs-reality diff (ISSUES.md Issue 2)

Diff taken 2026-07-05 against `main`, after Issues 1/3/4/5/6/7 landed. Three parallel research
passes (read-only) covered `HANDOFF.md` (full document), `README.md` (Features / Status & roadmap /
Known limitations), and `docs/IMPLEMENTATION-STRATEGY.md`'s Deferred-work registry (lines 262-307
only — the rest of that document is process/methodology, out of Issue 2's stated scope, logged
separately below). One row (README's Collaboration claim) was pre-flagged blocked-on-verdict per
ISSUES.md Issue 2's own instructions and is not resolved here. Every other row below was
independently re-checked (not taken on the researching agent's word) before being marked resolved.

Columns: claim | where claimed | what the code does | type | resolution | commit | recheck.

## HANDOFF.md

| claim | where | code does | type | resolution | commit | recheck |
|---|---|---|---|---|---|---|
| Whole feature UNCOMMITTED on `feat/archie-viewer-embed`, `packages/archie-viewer/` untracked, ADRs 0019-0021 untracked, "commit required" | L3-4, 74, 122-124, 147, 154 | Shipped to `main` in `c471b93` (2026-06-21); `packages/archie-viewer/` a real 26-tracked-file package; ADRs 0019-0022 tracked. Confirmed via `git log`/`git show --stat`. | claimed-not-implemented (docs describe a branch state that no longer exists) | deprecate — archive whole doc | pending | pending |
| `render-mount/mount.ts:238` TS2345 "pre-existing" | L146 | Fixed — `ledgers/GATE.md` rows for `7415fe2`/`8693795` (actual site was `:251`, drifted). `tsc --noEmit` clean on render-mount/render-svelte/archie-viewer today. | claimed-not-implemented (stale) | folded into deprecation | pending | pending |
| Static bake in `apps/viewer/public/published/` stale, regen owed pre-commit | L126-128, 150-152 | Regenerated in `e45f38b` (2026-06-22), postdating the dup-id fix. | claimed-not-implemented (stale) | folded into deprecation | pending | pending |
| Cross-library affordance still blocked on Studio authoring; live strict-CSP packaged-app smoke still unverified | L141-144 | Still true — `docs/plans/EMBED-VIEWER-IMPLEMENTATION-STRATEGY.md:95-96,158-159` still lists it deferred; no CSP smoke-test file exists anywhere (`.claude/rules/tauri-csp.md` is a rule doc, not a test). | accurate, but already tracked elsewhere | fold pointer into deprecation note | pending | pending |
| Showroom prep done, ASSEMBLE step pending | L7-39 | Still true — matches `ISSUES.md` Issue 9 verbatim ("queued", "stranded at ~80%"). | accurate, but already tracked elsewhere | fold pointer into deprecation note | pending | pending |

**Resolution for all five HANDOFF.md rows**: the document's only claims that are still true are
*already* duplicated, more currently, in `ISSUES.md` Issue 9 (showroom) and
`docs/plans/EMBED-VIEWER-IMPLEMENTATION-STRATEGY.md` (cross-library affordance). Nothing here is
uniquely live. Archive the file with a one-line pointer to both, rather than a line-by-line rewrite
of a session-status doc for a feature that finished shipping two weeks ago.

## README.md — Features (208-227)

| claim | where | code does | type | resolution | commit | recheck |
|---|---|---|---|---|---|---|
| Image / Audio / Video annotation | 212-214 | Confirmed: OSD+Annotorious, WaveSurfer, spatiotemporal `xywh=&t=`, VTT/SRT transcript import — all wired and tested. | accurate | none | n/a | n/a |
| Map annotation | 215 | Confirmed end-to-end, including the Viewer: `apps/viewer/src/components/Reader.svelte:53,192,213` passes `tileSource` into the shared `Canvas` component and has a geo lng/lat readout. (First-pass research flagged this as unconfirmed because it searched for `AddMapModal.svelte`/`geo.ts`/`resolve.ts` by name in `apps/viewer/src` — those are Studio-only authoring modules; the Viewer correctly consumes baked `tileSource` through the shared render layer instead, which is the expected architecture, not a gap.) | accurate (corrected from initial flag) | none | n/a | n/a |
| Readings & Tags / Rights & metadata / Data model / IIIF / Storage / Linking / Arrangement & reading / Publish / Portable Viewer / EXIF | 216-225 | All confirmed with direct file:line evidence (see agent report — `iiif/rights.ts`, `spine/merge.ts:43,188`, `fs/seam.ts`, `CmdK.svelte`, `link/link.ts:241-265`, `ExhibitOverview.svelte:234-320`, `exif/read.ts`, etc.). "Schema migration" sub-claim under Data model is thin (only `spine/deserialize.ts` matches; no dedicated runner exercised yet — see IMPLEMENTATION-STRATEGY row below) but the row as a whole is accurate. | accurate | none | n/a | n/a |
| Collaboration: "Silent DAG merge; conflict-card resolution; identity prompt on first import" | 226 | `MergeReview.svelte`/`IdentityPrompt.svelte` mounted nowhere in `App.svelte`. | claimed-not-implemented | **blocked-on-verdict — see ISSUES.md Direction 1; not resolved here per Issue 2's own instruction** | n/a | n/a |

## README.md — Status & roadmap (330-345)

| claim | where | code does | type | resolution | commit | recheck |
|---|---|---|---|---|---|---|
| "~770 across the workspace (≈568 `@render/core`, 43 `@render/mount`, 7 `@render/svelte`, 127 `@archie/studio`, 24 `@archie/viewer`)" | 332 | Actual (re-run 2026-07-05): `@render/core` 714/70, `@render/mount` 116/15, `@render/svelte` 7/1, `@archie/studio` 154/15, `@archie/viewer` 63/9 — sum **1054**. `@render/archie-viewer` (98/7) isn't counted at all. Grand total **1152**. | claimed-not-implemented (stale count; one package entirely missing) | fix docs | pending | pending |
| "v1.1 frontier: progressive marker reveal · reading modes (scrollytelling, compare, slideshow) · ellipse/freehand · image-aware overlay contrast" | 338 | Confirmed still unbuilt for all four — `geometry/selector.ts:110-124` explicitly gates ellipse/freehand behind "v1.1 svgpath gate"; `model.ts:32-53`'s `mode` is reserved scaffolding only; no "progressive"/"reveal" or overlay-contrast code anywhere. | accurate | none | n/a | n/a |
| Cross-reference to `docs/IMPLEMENTATION-STRATEGY.md` as "the canonical remaining-work list" | 338 | File exists; cross-reference intact. | accurate | none | n/a | n/a |
| Known limitations (Chromium-only folder autosave · unbound-only live loop · token-based GitHub publish · zip-exchange collaboration) | 340-345 | All four confirmed with file:line evidence (`binding.ts:16`, `published.ts:84` + comments 57-77, `Publish.svelte`, `session.ts:141`). | accurate | none | n/a | n/a |

## `docs/IMPLEMENTATION-STRATEGY.md` — Deferred-work registry (262-307 only)

| claim | where | code does | type | resolution | commit | recheck |
|---|---|---|---|---|---|---|
| IIIF Content-State arrival wiring — pending | A, 276 | Shipped (ADR-0022, `content-state.ts`) | claimed-not-implemented | **already known — ISSUES.md Issue 2 seed evidence; not re-resolved here, folds into the registry's general staleness fix below** | n/a | n/a |
| Narrative Studio section-authoring — pending | A, 273 | Shipped — `NarrativeEditor.svelte` lazy-mounted `App.svelte:88-89,1536-1537`; section creation at `App.svelte:386`. | claimed-not-implemented | remove from registry | pending | pending |
| Sections round-trip via manifest Ranges (`sectionsFromManifest`) — pending | A, 274 | Shipped — `iiif/manifest.ts:336`, round-trip test `manifest.test.ts:78-93`. | claimed-not-implemented | remove from registry | pending | pending |
| Cold-arrival chrome (breadcrumb + zoom-to-fit) — pending | A, 277 | Shipped — `url/breadcrumb.ts` (+ test), used in `ExhibitView.svelte`/`ViewerShell.svelte`. | claimed-not-implemented | remove from registry | pending | pending |
| Overview section dividers — pending | A, 275 | Confirmed still pending — no "divider"/"SectionDivider" hits anywhere. | accurate | none | n/a | n/a |
| Progressive marker reveal — pending | A, 278 | Confirmed still pending. | accurate | none | n/a | n/a |
| Marker highlight drops per edit (bugfix) — pending | A, 279 | No "highlight" logic found anywhere in `render-mount`/`render-svelte`/studio outside an unrelated CSS comment. No evidence of a fix commit either way. | unconfirmed | leave as-is (no evidence to change it) | n/a | n/a |
| Styled AV scrubber — pending, lowest priority | A, 280 | Confirmed still pending (cosmetic). | accurate | none | n/a | n/a |
| In-memory publish/zip scaling gap → streaming/chunked write needed | B, 285 | **Nuanced, not a flat contradiction with README's "streaming-zip save: shipped."** `ZipFilesystem.streamZip()` (`fs/zip.ts:142-181`) streams chunk-by-chunk; `saveZipToDisk` (`binding.ts:69-102`) uses it via `FileSystemWritableFileStream` when `supportsFileStreamSave()` (Chromium). Non-Chromium still falls back to eager whole-buffer `toZip()`, size-guarded via `zipSizeOk()` (safe, not silently broken — just not streaming). | implemented-differently (Chromium: shipped; non-Chromium: guarded fallback, registry text overstates the gap) | fix docs — qualify the item instead of presenting it as fully open | pending | pending |
| v1.1 in-browser tiling (OffscreenCanvas DZI) — pending | B, 286 | Confirmed still pending, no code found. | accurate | none | n/a | n/a |
| Human-gate/browser-verify items (identity-prompt, overview pan/zoom, AV player, Studio AV hand-annotation, layout-picker; real-OSD visual equivalence; real third-party WADM interop; GH-Pages end-to-end) | C, 289-292 | Sanity-checked only (human-verification status can't be re-certified by an agent): every underlying feature still exists in code, nothing stale/removed. | out of scope to resolve | none — leave as human-gate items | n/a | n/a |
| Empty/error/loading states — not built (v1) | D, 297 | Shipped — `EmptyHall.svelte` mounted in `ViewerShell`. | claimed-not-implemented | **already known — folds into registry staleness fix below** | n/a | n/a |
| Overlay-contrast adaptive styling — not built | D, 298 | Confirmed still pending. | accurate | none | n/a | n/a |
| Schema-migration runner exercised — owed, first real migration still pending | D, 299 | Confirmed accurate — `migrate/migrate.ts:56` `MIGRATIONS: Migration[] = []` (empty registry); runner exists (`:73`) but unexercised; `git log --grep=migration` finds no schema-migration commits. | accurate | none | n/a | n/a |
| Body sanitization — satisfied (`sanitizeHtml`, 12 tests) | D, 300 | Still satisfied; test count grew to 15. | implemented-differently (stale count only) | fix docs — update count | pending | pending |
| EXIF-bake-at-ingest — satisfied (shipped) | D, 301 | Confirmed — `apps/studio/src/bake.ts` `bakeDisplayMaster`, wired at `ingest-flows.ts:185,195-197`. | accurate | none | n/a | n/a |
| Bundle measurement ~327 KB gz studio | D, 302 | Stale figure — fresh build today: eager entry ≈**126.7 KB gz** (110.5 KB JS + ~1.1 KB chunks + 13.1 KB CSS), consistent with the already-recorded "Studio perf" 1.26MB→340KB raw-bundle win. | implemented-differently (stale figure, real number is much better) | fix docs — update figure | pending | pending |
| search (minisearch) — out of v1 | E, 305 | Shipped — `SearchOverlay.svelte` mounted in `ExhibitView`. | claimed-not-implemented | **already known — folds into registry staleness fix below** | n/a | n/a |
| Ellipse/freehand (svgpath) — out of v1 | E, 305 | Confirmed still pending, explicitly gated in `selector.ts:110-124`. | accurate | none | n/a | n/a |
| Slideshow / Scrollytelling+Compare (layout modes) — out of v1 | E, 305 | Confirmed still pending — `model.ts:32-53`'s `mode` is reserved scaffolding, no mode values implemented. | accurate | none | n/a | n/a |
| AV ingest/media-upload UX — gate before first AV-bearing *uploaded* exhibit; "current `/av` uses an external URL" | E, 305 | Stale — the upload gate was explicitly lifted 2026-05-26 (`ingest-flows.ts:170-182`, "§152 gate lifted... user"); `addObjectFromFile` now branches on audio/video MIME, stores via OPFS, renders in `AvEditor`. Uploaded AV is a supported path today, not just external URL. | claimed-not-implemented (stale) | fix docs — update or remove | pending | pending |
| embedding/oEmbed (v1.2) — out of v1 | E, 305 | Implemented differently: `<archie-viewer>` (ADR-0021) shipped as a native custom-element embed contract (`src`/`target`/`offline`), explicitly not the oEmbed protocol — `recipes/EMBED.md` has zero "oEmbed" hits, ADR-0021's alternatives-rejected section never mentions it. The literal oEmbed protocol item is still genuinely unbuilt. | implemented-differently (risk of confusion, not a false claim) | fix docs — disambiguate from the shipped WC embed | pending | pending |
| AI-authoring / mask→SvgSelector (v1.2/v2) — out of v1 | E, 305 | Confirmed still pending — "SvgSelector" hits are the existing IIIF selector type (used for ellipse/freehand geometry), unrelated to AI mask generation; no AI-authoring code exists. | accurate | none | n/a | n/a |

## Out-of-scope finding (not fixed here — see ISSUES.md queued candidate below)

`docs/IMPLEMENTATION-STRATEGY.md`'s lines 1-261 (everything *above* the deferred-work registry —
the phase/wave/task methodology) references tooling that doesn't exist in this environment: `sd`/seeds
DAG, `mulch`, `gate-enforcer`, `qmd`, `foxhound`, `record-extractor`, `decision-record.sh`,
`dispatching-parallel-agents`, `strategic-looping`, `failure-capture`, `requesting-code-review`,
`verification-before-completion`, `/thermo-nuclear-code-quality-review`. None of these appear in the
current skill/tool set (which instead has `tend`, the `ISSUES.md`/`ledgers/` convention,
`writing-plans`, `executing-plans`, `code-review`, etc.) — the whole operating methodology this
document describes has been superseded, not just a few claims within it. Explicitly out of Issue 2's
stated scope (which names only "the deferred-work registry"); logged as a new queued issue instead of
fixed opportunistically.

## Done

Re-running this diff after the fix phase below found nothing outstanding except the two rows
correctly left blocked-on-verdict / unconfirmed (Collaboration, marker-highlight bugfix) and the
Section C human-gate items (not re-resolvable by an agent).
