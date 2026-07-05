# CAPABILITY — capability-reach diffs (ISSUES.md Directions 1 and 3)

Direction loop: inventory every operation/capability, classify reachable/gated/orphaned,
bring clusters to the user for a verdict (pursue/park/reject), log the reason, and — for
a pursue — commission a spec interview or prototype brief. No building happens in this
ledger; a "commissioned as" cell is a paste-ready prompt for separate follow-on work.

---

## Direction 1 — The collaboration machinery is built, tested, and unreachable

Inventory taken 2026-07-05 via a full-repo investigation (spine/merge.ts, session.ts,
apps/studio's MergeReview.svelte/IdentityPrompt.svelte, ingest-flows.ts, collab.ts) plus
git history on every orphaned file. Verdict: **pursue**, given directly by the user for
all three directions in this session — logged per cluster below with the evidence that
supports pursuing rather than parking or rejecting.

| operation | defined at | user path | gate | intent | class | cluster |
|---|---|---|---|---|---|---|
| `lineage` | `spine/merge.ts:23` | none | zero callers anywhere, including internally | designed-latent (ADR-0003 rev-chain walking is core to the DAG) but no consumer even inside its own module | orphaned | DAG-classification |
| `ancestors` | `spine/merge.ts:44` | none directly | called only by `classifyMerge` | designed-latent (ADR-0003 multi-parent ancestor walk) | orphaned (root caller orphaned) | DAG-classification |
| `commonAncestor` | `spine/merge.ts:87` | none directly | called only by `classifyMerge` | designed-latent (ADR-0003: "merge-base... walking the parent chain" is the ADR's whole point) | orphaned (root caller orphaned) | DAG-classification |
| `classifyMerge` | `spine/merge.ts:138` | none | called only by `classifyLogical`, itself uncalled | designed-latent — own doc comment: "the ONE interactive/stateful projection in the architecture"; ADR-0003 explicitly scopes its UI as "~4–6 weeks of work not derivable from the locked frames" | orphaned | DAG-classification |
| `classifyLogical` | `spine/merge.ts:158` | none | zero callers outside its own test | designed-latent — doc comment: "the per-logicalId async-zip merge entry point," written for a caller that was never built | orphaned | DAG-classification |
| `conflictTiebreak` | `spine/merge.ts:174` | none | zero callers outside tests | designed-latent — doc comment: "the ONLY sanctioned use of modifiedAt... a UI suggestion inside a conflict card," written for `MergeReview.svelte`, which never calls it | orphaned | DAG-classification |
| `mergeLogs` | `spine/merge.ts:112` | none | called by `session.ts:148` inside `importChanges`, itself uncalled | designed-latent per ADR-0003 | orphaned | import-merge path |
| `headsOf` | `spine/merge.ts:104` | **yes**, indirectly — every note render goes through `AnnotationSession.notes()` → `projectHeads()` (`spine/heads.ts:24`) | none for single-head case | single-head path is genuinely load-bearing production code | **reachable** (single-head); orphaned (plural-head/conflict branch — nothing ever produces plural heads without `importChanges`) | DAG-classification (split) |
| `resolveConflict` | `spine/merge.ts:194` | none live | called only by `session.ts`'s `resolve()` (`:190`), whose only caller is `MergeReview.svelte:29` `keep()`, unmounted | designed-latent — doc comment describes exactly `MergeReview.svelte`'s `keep()`, which exists and matches but is never mounted | orphaned | import-merge path |
| `AnnotationSession.importChanges` | `session/session.ts:147` | none — no button/menu/trigger anywhere in `apps/studio` | zero app callers (confirmed with `grep -a` + full read of `App.svelte`, which hides matches from plain grep via a NUL byte) | designed-latent at the session layer; UI half looks forgotten (see `MergeReview.svelte` row) | orphaned | import-merge path |
| `conflicts()` / `conflictHeads()` | `session.ts:156,162` | none | called only by `MergeReview.svelte` (unmounted) + tests | same as above | orphaned | import-merge path |
| `resolve()` | `session.ts:175` | none | called only by `MergeReview.svelte:29` (unmounted) | same as above | orphaned | import-merge path |
| `MergeReview.svelte` | `apps/studio/src/MergeReview.svelte` | **none** — not imported anywhere; `apps/studio/README.md:35` lists it as if mounted | nothing gates it — simply never `import`ed | ambiguous — own header: "the #1 validation-priority invention... BROWSER + HUMAN-GATED (§83): build the prototype, the user runs the comprehension test," i.e. a human validation step that appears to have never run; added complete (68/80 lines, full styling) in the original `Add Studio authoring app` commit (`5653253`, 2026-05-25) and never imported at any point in git history — never wired in, not un-wired later | orphaned | merge-UI |
| `IdentityPrompt.svelte` | `apps/studio/src/IdentityPrompt.svelte` | **none** — same non-import status; `App.svelte:1861` name-drops it in a comment with no actual mount | App.svelte ships a separate, simpler identity mechanism (`loadIdentity()`/localStorage `IDENTITY_KEY` → `author`, `App.svelte:59-71`) with no "asked at first Import changes" behavior | forgotten-latent — doc comment: "asked at the FIRST 'Import changes'... never at launch," describing a trigger (`importChanges`) that itself has no caller; same never-imported history as `MergeReview.svelte` | orphaned | merge-UI |
| `openZip` → `replaceProjectFrom` | `ingest-flows.ts:496,475` | **yes** — real "Open" menu → file input (`App.svelte:1267-1275`) | confirm-gated (`ctx.confirmReplace`), otherwise fully wired | intentional design — comment: "REPLACE the current OPFS project... the destructive library-replace"; never calls `mergeLogs`/`importChanges`/`classifyLogical` | **reachable**, but bypasses the entire merge subsystem — this is the "opening a colleague's zip overwrites, never merges" symptom | import-merge path |
| `collabBreakdown` / `collabSummaryText` | `apps/studio/src/collab.ts:14,31` | **yes** — dismissible banner after `openZip` (`App.svelte:165,1218,1279-1284`) | none | deliberate stand-in, not a stub — doc comment: "live co-editing's entire serverless approximation" | **reachable** | import-merge path |

**README.md:226 claim check** — "Silent DAG merge; conflict-card resolution; identity prompt" is
**not accurate**: the only live collaboration path is `openZip`'s destructive replace plus the
`collab.ts` post-replace attribution banner. The actual DAG merge/conflict-card/identity-prompt
machinery exists and is tested but has zero UI reach. This confirms `ledgers/CLAIMS.md:40`'s prior
finding (class `claimed-not-implemented`, left blocked-on-verdict pending this direction).

### Verdicts

| cluster | verdict | reason | commissioned as |
|---|---|---|---|
| DAG-classification functions (`lineage`, `ancestors`, `commonAncestor`, `classifyMerge`, `classifyLogical`, `conflictTiebreak`, `headsOf`'s plural-head branch) | **pursue** | User's direct instruction 2026-07-05 ("pursue pursue pursue"). Substantively: this is a complete, ADR-designed, fully-tested library sitting one UI away from shipping the README's own headline claim — the cheapest possible roadmap item is a backend a project already built. | Spec interview: `docs/adr/0003-annotation-spine.md`'s "Refinement" section already scopes the merge-base algorithm; what's missing is a UI spec. **Prompt:** "Read `docs/adr/0003-annotation-spine.md` and `packages/render-core/src/spine/merge.ts`'s doc comments (they describe the intended UI contract inline — 'the ONE interactive/stateful projection,' 'a UI suggestion inside a conflict card'). Write a spec interview for a conflict-resolution UI in apps/studio that would call `classifyMerge`/`classifyLogical`/`conflictTiebreak`/`resolveConflict`: what triggers classification (on import? on every session start?), what a conflict card shows a user (both versions? a diff? the tiebreak suggestion?), and what 'resolved' writes back through `resolveConflict`. Interview the user; do not design unilaterally — this is ADR-0003's own flagged '~4-6 weeks not derivable from the locked frames' scope." |
| import-merge path (`importChanges`, `conflicts`/`conflictHeads`, `resolve`, `resolveConflict`, `mergeLogs`) | **pursue** | Same instruction. This is the session-layer API the DAG-classification UI (above) would actually call — pursuing it is the same decision as pursuing DAG-classification, split into its own row because it's a distinct architectural layer (session vs. spine). | Folds into the same spec interview as DAG-classification above — the UI's trigger point (when does `importChanges` get called?) is the first question that interview must answer. No separate prompt; same commission. |
| merge-UI components (`MergeReview.svelte`, `IdentityPrompt.svelte`) | **pursue** | Same instruction. Both components are already built, styled, and functionally correct (confirmed by reading their source) — pursuing here specifically means "finish wiring them in," not "design from scratch." `MergeReview.svelte`'s own header names an unrun comprehension test as its remaining gate. | Prototype brief: **Prompt:** "MergeReview.svelte and IdentityPrompt.svelte (apps/studio/src/) are complete, styled Svelte components that have never been imported into App.svelte since the initial commit (5653253, 2026-05-25). Before wiring them in, run the human comprehension test MergeReview.svelte's own header comment calls for (§83 in the original design doc, if recoverable via git blame/history) — mount both behind a temporary dev-only route, walk through a real conflict scenario (two zips imported with overlapping edits), and check whether a first-time user understands what a 'conflict card' is asking them to decide. Report friction before wiring permanently into the Open-menu flow." |

**Status: done 2026-07-05.** Every row classified; all three clusters carry a pursue verdict with
the user's own reason and a commissioned next-step prompt. No code changed, no gate opened — the
DAG-merge library, the session API, and both UI components remain exactly as they were; the
commissioned spec interview and prototype brief are separate follow-on work, not run in this ledger.
