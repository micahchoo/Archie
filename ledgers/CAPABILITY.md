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

---

## Direction 3 — The embed element outgrew its snippet generator

Inventory taken 2026-07-05: every `<archie-viewer>` capability (`packages/archie-viewer/src/element.ts`)
against what Studio's `PublishDialog.svelte` embed-snippet generator actually lets an author reach.

| operation | defined at | user path | gate | intent | class |
|---|---|---|---|---|---|
| `src` (hosted zip URL / published-tree base) | `element.ts:74,97-98`; ADR-0021 | PublishDialog "Save a copy" phase → `zipUrl` input (`:150`) → `wcSnippet` (`:72-74`) | none | designed + shipped end-to-end | **reachable** |
| absent-`src` local-drop default | `element.ts:139-142,166-184` | available any time an author omits `src` from the snippet, but the dialog never emits a src-less snippet by choice — only reachable by hand-deleting the attribute | none (element's own default state) | designed-latent — `recipes/03-local-drop.html` documents it explicitly | reachable (indirectly, not authored by the dialog) |
| `target` (cite-ladder deep link — Exhibit/Object/Note/region/Section) | `element.ts:74,100-101,229-247`; ADR-0021:16,21-26; `recipes/EMBED.md:32-41` | **none** — no dialog field ever sets `target`; only reachable by hand-editing the copied snippet against `recipes/EMBED.md` | nothing in the dialog reaches it | git evidence (see below) leans **deliberate v1 scoping**, not staleness — `target` was already in `observedAttributes` in the exact commit (`77e5a29`, 2026-06-21) that wrote the src-only snippet | **gated** |
| `iiif-content` (IIIF Pres 3 Content State, base64url) | `element.ts:74,103-105,196-227`; ADR-0022:26-49; `recipes/EMBED.md:43-53` | **none** — zero references anywhere in `apps/studio/src`; no in-app Content-State *encoder* exists to feed one even if the dialog had a field | no UI surface at all | same commit evidence as `target`; ADR-0022 calls this attribute part of "the frozen embed public API" — deliberate on the element side, absent on the dialog side | **gated** |
| `offline` (boolean, kiosk/air-gapped mode) | `element.ts:74,107-109,159-163`; ADR-0021:27; `recipes/EMBED.md:30-31` | **none** — zero references in `apps/studio/src` | no UI surface at all | present in `element.ts` from the same originating commit as the dialog's snippet code | **gated** |
| `currentContentState()` (reverse interop — encode the currently-open object) | `element.ts:408-417`; ADR-0022:46-49 | none — a runtime JS method, not an attribute; no markup-only snippet generator could emit it into HTML at all | category mismatch, not a UI gap | orphaned by design from this generator's shape; would need a separate "copy live location" affordance | **orphaned** |
| iframe fallback (`embedSnippet`) | `PublishDialog.svelte:75`, wraps `shareLink` (`:46-54`) → canonical viewer `?src=` | Same "Save a copy" phase, "Copy iframe" button | `apps/viewer/src/published.ts` only reads `?src=` — no `?target=`/`?offline=` query-param analog exists on the hosted viewer at all | never designed for parity with the WC path — ADR-0021's frozen surface is scoped to the custom element, not the iframe's query contract | **gated**, further behind than the WC snippet — a hand-appended `#/...` hash fragment might work (the standalone viewer's address bar uses that hash router) but is unverified and unoffered either way |

**Adjacent in-app source confirmed:** the Studio's ⌘K citation flow (`App.svelte:1041-1131`,
`buildCmdEntries`/`insertCite`/`requestCite`) already computes cite-ladder addresses for every
note/exhibit/object via `encodeLinkRef` (`packages/render-core/src/link/link.ts:194`) — the *same*
route grammar ADR-0021 defines for `target=`, just wrapped in an `archie:` scheme for note-body
citations instead of copied bare. This flow predates the embed element by a month (⌘K traces to
`5653253`, 2026-05-25; `element.ts` first appears 2026-06-21) — never built for embed purposes, but
a ready-made source of exactly the values `target=` needs, wired only to note-body links today.

**Git-history sequencing check:** `PublishDialog.svelte`'s snippet logic was last substantively
changed in the same commit (`77e5a29`, 2026-06-21) that introduced `element.ts` with `target`/
`iiif-content`/`offline` already in `observedAttributes`. Two later commits touched `element.ts`
and neither touched `PublishDialog.svelte` nor added new attributes. This contradicts a pure
"attributes landed after the dialog shipped" story — the evidence leans toward deliberate v1
scoping (ship the simplest snippet, document the rest in `recipes/`) over a staleness gap, though
git alone can't fully rule out "shipped-then-never-revisited" (no commit message states a rationale).

### Verdicts

| cluster | verdict | reason | commissioned as |
|---|---|---|---|
| `target` deep-linking | **pursue** | User's direct instruction 2026-07-05. The Studio already computes the exact values this attribute needs (⌘K's `encodeLinkRef`) — this is wiring an existing computation into an existing dialog, the cheapest of the three. | Prototype brief. **Prompt:** "PublishDialog.svelte's embed-snippet generator (`apps/studio/src/PublishDialog.svelte:72-75`) only emits `src=`. The Studio's ⌘K citation flow (`App.svelte:1041-1131`) already computes cite-ladder routes via `encodeLinkRef` (`packages/render-core/src/link/link.ts:194`) — the same grammar `target=` expects (ADR-0021). Prototype a 'link to a specific note/exhibit/object' picker in the Publish dialog (reusing ⌘K's picker UI if practical) that appends `target=\"...\"` to the generated `<archie-viewer>` snippet. Verify against `recipes/04-deep-link.html`'s documented grammar before wiring in generally." |
| `iiif-content` Content State | **pursue** | Same instruction. Larger than `target` — no in-app encoder exists yet, so this needs a small new computation, not just wiring, but ADR-0022 already specifies the encoding contract. | Spec interview. **Prompt:** "Read `docs/adr/0022-iiif-content-state-interop.md` in full — it specifies the base64url Content State encoding `iiif-content=` expects and calls this attribute part of 'the frozen embed public API.' No Studio surface computes a Content State today. Write a spec interview for adding one: should the Publish dialog compute a Content State for the currently-open object/note the same way ⌘K computes a `target=` route (see the `target` row's commissioned prototype), or does IIIF Content State need its own encoder given its different addressing model? Interview the user on scope — this is more novel than `target`'s wiring job." |
| `offline` mode | **pursue** | Same instruction. Simplest of the three — a boolean flag with no value computation needed at all, just a checkbox. | Prototype brief. **Prompt:** "The `<archie-viewer>` element already supports an `offline` boolean attribute (`packages/archie-viewer/src/element.ts:74,107-109`, documented `recipes/EMBED.md:30-31`, `recipes/05-offline.html`) that blocks all remote tile/media fetch for kiosk/air-gapped use — but PublishDialog.svelte has no checkbox for it. Prototype adding a plain toggle to the embed-snippet section that appends `offline` to the generated tag when checked. This is the lowest-risk of Direction 3's three items — no new computation, just exposing an existing boolean." |
| `currentContentState()` reverse interop | **not pursued — orphaned by category, not by gap** | This is a runtime JS method a host page's own script calls, not markup a snippet generator can emit. Not a "missing UI" in the same sense as the other three; logged here for completeness, no commission. | n/a |
| iframe-path parity (`?target=`/`?offline=` query params on the hosted viewer) | **pursue** | User's instruction covers "each" — but flagged as the largest unknown: the standalone viewer's own hash router might already support a `#/...` fragment appended to the iframe `src`, unverified either way. | Spec interview. **Prompt:** "The iframe embed path (`PublishDialog.svelte:75`, wrapping `apps/viewer`'s canonical `?src=` URL) has no query-param or hash-fragment analog for `target`/`offline` today, unlike the Web-Component path. Check whether `apps/viewer`'s existing hash-based SPA router (used for in-app navigation) could accept a hand-appended `#/...` fragment on the iframe `src` as a deep link without any code change — if so this may already work and only needs documenting in `recipes/`; if not, scope what routing change the iframe path would need to reach parity with the Web-Component path." |

**Status: done 2026-07-05.** Every element capability classified against the Studio's actual embed
UI; four of five clusters carry a pursue verdict with reason and a commissioned next step, one
(`currentContentState()`) logged as orphaned-by-category with no commission. No code changed.
