## Session 2026-07-22: 10-ticket wayfinder sweep + concurrent @surface docblocks

### State at handoff
- **main** at `a8e228a`: 188 files, +11844/-2286. All gates green: render-core 92/92 files 1112/1112, render-mount 18/18 159/159, studio tsc 0 + svelte-check 0/0/1143 + 68/68 test files 919/919, viewer astro check 0/0/46.
- **Uncommitted**: none (full sweep committed and pushed).
- **Concurrent session**: @surface docblock annotations on all 30+ Studio components committed. Their markers.css/tokens.css work also landed. prototypes/ directory added (crdt-annotation-merge, create-surface, editor-chrome, multi-tab-live-sync).
- **10 tickets closed this session**: dace (embed multi-whole-object), 07a7 (lowercase ondelete), 893f (rights write-back scoped rule), c59a (markers tokenization ledger), 45ac (migrate refinements), 72d1 (bake schema version), 1cfe (re-baked demo tree), cf54 (freecut storage findings), 04e9 (blob URL audit), ffa5 (Tauri nav audit). Close reasons in seeds.
- **6 new tickets created from map Fog**: 7e2e/be3a/e47d/ffa5 (tend-desktop), 0f72/5fb5 (freecut-optimization).
- **New files created**: .claude/rules/metadata-rights-keyed-writebacks.md, ledgers/CANON-markers.md.

### Design decisions installed
- **render-mount read-mount.ts**: frame draw iterates all whole-object notes (last wins visually per frame-overlay single-SVG contract). All remain in annotations list for sidebar + fitBounds.
- **migrate.ts**: normalizeRecord (canonical name for foldLayersIntoTags), migrate() returns {doc, migrated} flag for force-re-save, BAKE_SCHEMA_VERSION=1 for regenerable artifacts.
- **asset-store.ts**: .bake-schema marker written on saveAssetFile/saveThumbFile, checked on every openAssetFile read. Absent marker = OK (pre-schema), version mismatch = null → caller regenerates. saveOriginalFile excluded.
- **NoteEditor.svelte**: onDelete → ondelete (last camelCase callback gone; 33/0 lowercase/camelCase).

### Open maps summary (6 open of 14 total)
- Archie-298d (tldraw): 6 children — 3 research/prototype ready, 2 blocked, 1 grilling
- Archie-21b1 (studio-ux): 8 children — 2 implementation ready, 4 grilling, 1 blocked, 1 gated
- Archie-c548 (open-backlog): 15 children — all human gates or parked
- Archie-5b06 (freecut): 11 children — mixed research/task
- Archie-51ff (tend-desktop): 4 new research tickets
- Archie-c6bf (DC metadata): 0 children

# HANDOFF — Archie

(Previous handoffs — collection-import map; the Wave-plan version of this file — in git history.)

## Session 2026-07-19→20 (overnight): fleet drove map Archie-c548 to the human-gate line

### State at handoff
- **main is green** at `4a61da4` (wf/nav-flake merged — 2e2f closed): render-core 981 / render-mount 130 / render-svelte 7 / studio 728 / viewer 99; all tsc clean; studio svelte-check 0/0 (635 files); astro check 0/0.
- **Uncommitted**: `.seeds/issues.jsonl` (all bookkeeping below — `sd sync`), this file, `.claude/.skill-invocation-log`. Untracked strays not mine: DIVERGENCES.md, PRFAQ.md, NotePicker.svelte, snippet.ts(+test), IIIF ledgers, prototypes/*.
- **Merged, deletable branches** (~13): Wave-1's five plus `wf/folder-drop`, `wf/session-test`, `wf/object-id`, `wf/object-id-reint`, `wf/marginalia`, `wf/objectid-adr`, `wf/migration-engine`, `wf/migration-triggers`, `wf/style-channel`, `wf/lod-navigator`, `wf/view-state`, `wf/whole-image-rects`.
- A **concurrent session** shares HEAD and landed big work all night (ingest batching + reservation registry [superseded by ULIDs], overview grid, publish-parallel). ALWAYS `git branch --show-current` + `git log --oneline -3` before committing; expect App.svelte/ingest-flows.ts conflicts when merging stale-based branches — resolve semantically (one design, not two interleaved; see 9ea8's re-integration in the map gists).

### Closed this session (all merged with opus review + gates on merged tree; evidence in each close reason)
`bf5b` folder-drop skipped-count · `94b6` exhibit-session characterization (mutation-verified) · **the whole object-id chain from the 8a45 grilling: `9ea8` module (ULID mint; killed BOTH nextObjectId and the concurrent registry) → `8c10` migration engine (landed as SIX classes — review caught the library.json-sections default-store miss + torn-snapshot sentinel) → `5826` ADR-0026 (amended for the sixth class) → `8439` triggers (reset-first crash-self-healing; completeness hunt clean)** · `dff3` marginalia (user-steered C→strip→B: tick rail, rail=where/inspector=what; user screenshot sign-off) · `a6fb` style-channel SNAG (probe confirmed WebGL-only; withZoomBand/withArrivalPulse on the ONE DrawingStyleExpression; browser-verify caught the arrival-decays-before-OSD-open bug) · `c1d9` pin/dot LOD + navigator note-dots + viewer zoom-band · `3e12` dead labelMarkers (a11y moved onto real dot buttons) · `6a16` view-state store (0.3 cuts COMPLETE; zero test changes) · `e913` whole-image rail slot (no fake geometry in the shared rect stream) · `c03a` closed OBSOLETED by the direction-B verdict (premise was the killed card column).

### What remains on map Archie-c548 (the endgame)
- **`2e2f`** nav-e2e flake — CLOSED (merged 4a61da4: test race, expect.poll fix, 10/10 proof; add `wf/nav-flake` to the deletable-branches list).
- **`e640`** surfaces-follow-attention — OPEN but annotated: premise predates direction B; re-judge during the 79be walk before building. Do NOT fleet it blind.
- **Human gates (need Micah, not agents):** `79be` checklist walk (screenshots per item, user verdicts — includes 5 scale-cue visual checks + judging edit-in-inspector distance, per c03a's close) · `87ba` real-exhibit validation with outside readers · `eec7` a11y pass + `cf4a` touch pass (agents may draft findings ledgers; verdicts human) · `a09d` tauri-build smoke (native env).
- When the last child closes → close map `c548` with a gist trail; Fog either graduates or dies with it.
- Other maps: `21b1` studio-UX (child `7e5b` gated on future merge-wiring — note `importChanges` is confirmed ORPHANED, which is 7e5b's whole subject).

### Design decisions installed this session (do not relitigate)
- **ADR-0026** library-unique object ids: composed `<exhibitId>.<ordinal>` for migrated, ULID for new mints, isLegacyObjectId the ONLY parser, six-class in-place migration, sentinel-guarded snapshot + idScheme:2 marker LAST, exactly three triggers, viewer zero-code, citation-break + localStorage loss accepted (revisit-conditions stated in the ADR).
- **Marginalia = direction B tick rail**: rail says where/how-much, inspector says what; NO text/cards/heat in the rail; whole-image notes get the dedicated slot; the card column stays dead.
- **Marker styling rides ONE DrawingStyleExpression** (single-writer setStyle): base readingMarkerStyle → withZoomBand (both apps) → withArrivalPulse (viewer). New effects compose onto the spec; never a second setStyle owner, never CSS on `.a9s-annotation` (WebGL — zero SVG nodes, see ledgers/PROBE-annotorious-dom-2026-07-19.md).

### The fleet recipe (proven across ~12 branches; reuse verbatim)
1. **Batch from `sd ready`**: code-shaped, unblocked only; group by disjoint FILE territory (same file → one agent); claim first (`sd update <id> --assignee micah --status in_progress`).
2. **One worktree agent per territory** (opus multi-seam / sonnet contained). Brief must bake in: Step-0 base pin to an EXPLICIT current sha (`git checkout -B wf/<t> <sha>` — worktrees spawn stale) + `pnpm install --prefer-offline`; self-contained ticket text; never touch `.seeds/`/HANDOFF; `grep -a` (NUL history); per-app vitest; the full gate list (studio adds `pnpm typecheck` — svelte-check relaxes exactOptionalPropertyTypes); browser-verify anything visual (run-app skill, spare port, Playwright-from-/tmp createRequire) — it caught real bugs twice; deliver branch+sha+EXACT gate counts, no merge.
3. **Opus code-reviewer per code branch**, read-only, own detached worktree (`git worktree add --detach /tmp/review-x <sha>`), re-runs gates itself, hunts same-class misses + adversarial crash-window walks. Artifact/docs branches: main session reviews directly. REQUEST-CHANGES → SendMessage the impl agent (they resume from transcript; watch-it-fail-first for fixture gaps) → reviewer verifies the fix delta. Nits: fix trivially on the branch (in the agent's worktree — but MERGE FROM THE MAIN CHECKOUT, a merge run inside the worktree self-merges "Already up to date").
4. **Merge protocol** (main checkout, sequential): `git branch --show-current` first; `--no-ff` with the verdict in the message; re-run affected gates on the MERGED tree; `sd close` with an evidence-rich reason; one-line gist appended to the map's Decisions-so-far (jq sub on "\n\n## Fog"); fork discovered bugs as new tickets immediately (3e12, e913, 2e2f all born this way).
5. **Comms quirks**: idle notifications precede reports — nudge via SendMessage naming the SPECIFIC asks. Worktree LSP diagnostics flood the main session (ERR_MODULE_NOT_FOUND, phantom errors on worktree paths, stale App.svelte buffers after big merges) — gates are authoritative, ignore the noise. Test counts vary a few units between environments (proven repeatedly); the reviewer's relative before/after accounting is what matters.

### Next session start
`sd prime` → `sd ready`. If 2e2f merged: the ONLY fleet-shaped work left is drafting findings ledgers for eec7/cf4a; everything else is the human walk. Suggest starting 79be with the run-app skill and walking the 7-item checklist with Micah live.

## Fleet session 2026-07-20→21 (tend maps → three-phase fleet) — appended by the fleet session; the section above belongs to the concurrent session

State is canonical in seeds (`sd prime`; six `tend:` maps) + docs/plans/TEND-FLEET-2026-07-20.md + docs/plans/native-canonical-store.md (Micah's three answers appended). Ledgers: ledgers/TEND-EXPLORE-*-2026-07-20.md with verification appendices.

- **Done & merged (all reviewed, gates on merged tree):** Phase 1 all 10 lanes / 20 tickets; Phase 2 all 4 lanes (3148 persisted.ts, cf93 asset-store split + opfs-project leaf, 77b2 unlisted lever, fada NativeFetch seam); follow-ups b9f4-adjacent: small-polish (09a0+5478) merged. Grill verdicts recorded on maps: rev-log ENACT→b0b1; native store PURSUE→623e (plan answered: single-instance, keep-OPFS-until-manual-clear, hidden cache dir); embed honors unlisted (32a9→f735).
- **UPDATE (later checkpoint):** heads-logicalid (b9f4), viewer-fixes (569d+b42d), embed-unlisted (f735, dist rebuilt), small-polish (09a0+5478), and native-store P1 (migration engine + streaming writes + single-instance, deliberate stop at the flip) are ALL merged & closed. Micah's Phase-2 decision: EXTEND THE FILESYSTEM SEAM (3 capabilities, resolveUrl? optional — recorded in plan doc + 623e). Plan doc was clobbered once by a doubled Bash run and RESTORED (dbd4437); guard merges with merge-base --is-ancestor, keep state-mutating commands stepwise.
- **FINAL UPDATE (pre-compaction):** native-store-p2 MERGED (seam extension + flip + phases 3-6; review caught the lazy-File/createImageBitmap silent tiling bug — fixed; 623e stays OPEN as the a09d packaged-smoke release gate, status open). revlog-enact MERGED (b0b1 closed: import ungated, flag default-ON with '0' kill-switch, no view/restore primitive exists so history UI is a documented follow-up in ledgers/PROBE-structure-revlog.md; persisted.ts docstring fast-follow 71f8a3f). Maps 04ba/cc98/098f/13e8 CLOSED with gist trails + fog in close reasons. Merge protocol: guarded (`git merge-base --is-ancestor` first), stepwise commands (double-execution hazard is real — see memory), gates on merged tree, sd close with evidence, gist to map.
- **PROGRAM DRAINED (2026-07-21):** bdc0 (unlisted carry + Studio hide-from-gallery toggle) MERGED at `2d77ded` after opus APPROVE on all six review axes; gates on merged tree rc 1110 / studio 919 + tsc 0 + svelte-check 0/0 / viewer 136. bdc0 CLOSED, viewer map 27c5 CLOSED with trail (fog preserved in map body). **Five of six tend maps closed; the desktop map 51ff stays open solely as the a09d packaged-smoke release gate (checklist in docs/plans/native-canonical-store.md — human/native-env only).** Merge required a stash-dance around the concurrent session's NEW docblock WIP (@surface annotations on 4 studio components) — popped clean, their WIP intact in working tree; their two older stashes ("hold concurrent WIP during toolchain merge", "modality merge") still parked — hand back, don't drop. Housekeeping open: delete merged wf/* branches (several pinned by agent worktrees under .claude/worktrees/), `.seeds/` uncommitted as always. Seeds CLI gotcha (bit once, map body was clobbered + restored): `sd show <id> --json` wraps the issue — the body is `.issue.description`, NOT `.description`.
- **Merge protocol** (unchanged): main checkout only, --no-ff with verdict, gates on merged tree, sd close with evidence, gist to map. Stash-dance any dirty-file overlap (concurrent session WIP); their capture-screenshots WIP is parked in `git stash` ("hold concurrent WIP during toolchain merge") — hand back, don't drop.
- **Agent policy:** spawn on opus (reviews/multi-seam) or sonnet (contained) — never inherit session model (Micah 2026-07-20).
- Branch cleanup pending for merged wf/* still pinned by agent worktrees.

## Wayfinder session 2026-07-20→21: map:studio-ux-overhaul fog-graduation audit (Archie-21b1)

Task: the map was revived with its Fog broken out into 8 seeds tickets; assess what prior/new
knowledge each needs. Answer: most prior knowledge was already in-repo — the blocker was that the
tickets themselves were unreliable. Two ledgers written (both committed):
`ledgers/MAP-READINESS-studio-ux-overhaul-2026-07-20.md` (47KB, per-ticket + tiered reading list +
its own unverified-claims section at :616) and `ledgers/PROVENANCE-astryx-tickets-2026-07-20.md`.

- **PROVENANCE — the "Astryx component audit 2026-07-20" is not an artifact.** Astryx is Meta's
  React+StyleX library (astryx.atmeta.com). The "audit" was a deepseek-v4-pro OMP session
  (`~/.omp/agent/sessions/--mnt-…-Archie--/2026-07-21T03-40-06*`) that wrote ZERO files, read only
  NoteEditor + SafetyState (both truncated), then published an event-dialect table covering CmdK and
  dialogs it never opened — that table became Archie-07a7 verbatim. Six code claims false. Pattern:
  **correctly smelled, falsely evidenced.** Don't dismiss the smells; don't trust the citations.
- **Commit 09ace42** — 86 uncommitted seeds issues committed (HEAD was 187, worktree 273; they were
  on no branch/stash/reflog). Also RESTORED Archie-21b1's body, which the graduation session had cut
  21,963→4,746 chars: 26 entries back (MERGE WAVE 1, six decision tickets incl. Add-grammar's 14/14,
  twelve merge records, USER RATIFICATIONS, TAIL MERGES). Deduped an append bug — 9 entries had been
  written 3× each; 58 raw → 36 unique.
- **Commit 8a577f0** — map rebuilt from measurement. 15 of 16 proposed edits applied.
- **DECISION (Micah, this session): callback props are LOWERCASE `on*`.** Measured by parsing
  `$props()` destructures + `export let`: Archie **33 lowercase / 1 camelCase** (`onDelete`,
  NoteEditor.svelte:55) vs ADR-0002 donors anvil **38:1** and annomea **17:13** camelCase. Real fork
  (those components were adopted as running code) — resolved for in-repo incumbency + Svelte 5's
  native `onclick` idiom. ADR-0002 adopted donor *logic*, not donor style. The `~140:1` figure in the
  MAP-READINESS ledger is superseded by this narrower prop-only parse.
- **Frontier now:** 7e5b (strongest — its blocker 697c closed 2026-07-19, the "coordinate with 697c"
  gate was phantom), 07a7 (rescoped to NoteEditor + its ONE App.svelte call site), 7aef (retyped
  grilling; parity has FOUR consumers incl. packages/render-mount), 1244 (absorbed 5c1d's ~65-selector
  Option C list; 5c1d-impl was never filed so 5c1d closed), 99db prose, 05e4 (palette/type grilling
  split). Blocked: cdfe (screenshot re-shoots) behind 1244 + c59a.
- **Closed:** 3547 (fragmentation — 199-line NoteEditor fails the repo's own three-consumer bar set by
  ZipExportFields), 6be3 (speculative generality — ONE consumer, "never forked (ADR-0006)"). Real
  residue carried in each close reason (dead .note-popover rule, duplicated fmtMMSS, stale
  e2e/loop.spec.ts line ref; and `commentEl = $bindable()` letting App reach into NoteEditor's textarea).
- **NOT applied, deliberately:** retargeting 33bf as a bug. `sitemap.xml.ts:1-2` states hash-routed
  deep links are excluded BY DESIGN (crawlers ignore fragments — Archie-b4f2/ADR-0013) and the
  listed/unlisted enumeration split is deliberate (Archie-77b2). 33bf stays grilling, body corrected.
- **Deck path correction that recurs:** decks are `docs/learn/`, NOT `apps/studio/decks/` (does not
  exist). Archie-6595 already refreshed all 7 against the shipped UI on 2026-07-19.
- **NOT pushed.** Working tree still holds the concurrent session's `@surface` docblock + markers.css
  tokenization WIP (per §45 above) — left untouched; it silently implements open c1e0/c59a and was
  reportedly verified against the wrong svelte-check config. Not mine to commit.
- **Method note:** tracker writes are a single JSONL — never parallelize `sd` mutations. Script used:
  /tmp/apply_map_edits.py (idempotent-guarded creates).
