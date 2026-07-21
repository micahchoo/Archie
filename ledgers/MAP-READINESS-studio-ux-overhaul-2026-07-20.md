# Map readiness — Studio UX overhaul (Archie-21b1)

**Date:** 2026-07-20 · **Scope:** the 8 open tickets the map graduated out of its Fog section.
**Method:** every ticket premise re-checked against the file it names, then adversarially re-checked
by a second pass. Claims below carry `file:line`. Claims that could not be settled are named as such
in the final section rather than smoothed over.

This ledger answers one question: **what does a session need to hold in its head before it can
pick up any of these eight tickets, and which of them can be picked up at all?**

---

## Headline — the batch is not uniformly trustworthy, and the split runs along a provenance line

Five of the eight tickets are sound-to-repairable. Three are contaminated, and they are the same
three: **callback conventions (Archie-07a7)**, **NoteEditor sub-primitives (Archie-3547)**, and
**NoteEditor snippets (Archie-6be3)**. All three cite `Context: Astryx component audit 2026-07-20`.

That audit does not exist. Searching `astryx` / `Astryx` / `ASTRYX` by content and by filename
across the repo, across git history on all branches (`git log --all -i --grep`, plus
`--diff-filter=AD --name-only` for ever-deleted paths), across both stashes, and across the parent
tree `/mnt/Ghar/2TA/DevStuff/Annotators/Image` returns exactly two files: `.seeds/issues.jsonl`
(the three ticket bodies citing it) and `ledgers/PROVENANCE-astryx-tickets-2026-07-20.md`, which is
a peer agent's untracked output from this same session (`git ls-files` on it returns nothing) and
therefore carries no more authority than a fresh measurement. The audit exists only as transient
conversation in a non-Claude agent session whose tool census contains zero writes. Astryx itself is
Meta's React/StyleX component library — no overlap with Svelte 5.

The consequence is visible in the ticket bodies. Of the code claims across those three tickets that
can be checked, **six are false**:

| Claim (ticket) | Verdict | Evidence |
|---|---|---|
| CmdK uses `on:select` dispatch (07a7) | FALSE | `CmdK.svelte:41-42` declares `onpick` / `onclose`; zero `on:` directives repo-wide |
| SafetyState takes a `safety` enum prop (07a7) | FALSE | `SafetyState.svelte:54` — `safety` is local `$derived(computeSafetyState(...))`; its one callback is `onflush` (:29) |
| `createEventDispatcher` remains (07a7 Contract) | FALSE | 0 occurrences in `apps/` and `packages/` |
| Three interaction dialects exist (07a7) | FALSE | one house dialect plus one non-conforming file |
| EmphasisField is a radio, `normal/reduced/removed` (3547) | FALSE | `NoteEditor.svelte:128-134` is a `<select>` over `muted`/`normal`/`strong`, matching `packages/render-core/src/wadm/types.ts:277` |
| ScopeToggle is a whole-object-vs-region toggle (3547) | FALSE | `NoteEditor.svelte:106-119` is a read-out plus contextual buttons, with the comment "no overloaded create button" — the affordance ADR-0018 deliberately rejected |

Four claims in the same three tickets do hold: NoteEditor's injected function props
(`NoteEditor.svelte:39-52`), its flat-prop count, `TimeRangeField` (:100-106) and
`CoLocatedStackCycler` (:87-95) as real inline sections. One claim a peer ledger flagged as
fabricated is in fact correct: `import { readingBadge } from "./reading-index.js"`
(`NoteEditor.svelte:18`) is the right NodeNext specifier for a `.ts` source, not a phantom file.

**The right reading is "correctly smelled, falsely evidenced."** NoteEditor genuinely is the one
component that never adopted the house callback convention; it genuinely does take 21 props, 13 of
them functions. The instinct was sound and the evidence table was written without opening the files.
Rewrite from measurement; do not close the underlying concerns.

Two further headline facts, independent of provenance:

**The map's own decision record is incomplete.** `sd list --label map:studio-ux-overhaul --all`
returns 50 issues (8 open, 42 closed), 14 of them `wayfinder:grilling` — 13 closed. The map's
"Decisions so far" section records 9 of those 13. Six binding decisions exist only in close reasons:
collaboration (Archie-d71c), help and onboarding (Archie-66b0), publish continuity (Archie-7d9b),
add-grammar (Archie-beb6), bulk selection (Archie-315e), library home (Archie-2308). Two of the six
directly govern open tickets. A session that reads the map and stops is missing roughly a third of
the settled design. `docs/agents/issue-tracker.md` requires appending a gist to the map on every
close; that step was skipped six times.

**The prior-art rule was under-served across the board.** `Annotators/Image/CLAUDE.md` names two
roots. `Archie/Prior Art/` holds exactly one entry (`freecut`) and is usually a dead end; the second
root, `/mnt/Ghar/2TA/DevStuff/Annotators/Image/`, holds ~30 sibling codebases including annomea,
anvil, field-studio, canvases-annotations-sharing, tropy, juncture and quire. Searching only the
first root and concluding "the corpus is thin" is the single most repeated error in the assessment
inputs. Search the second root first.

---

## Per ticket

### Callback conventions (Archie-07a7) — **needs rewrite, and the direction is a user decision**

**Prior knowledge.** The ticket's own evidence table is unusable (see headline). Replace it with a
measurement over `interface Props` blocks only — a regex over `name: (...) =>` conflates prop
declarations with options-object keys and produced the ticket's inflated figures. Measured directly
this session: lowercase `on*` is the incumbent house dialect at ~140 declarations across
`apps/studio/src/*.svelte` and `apps/viewer/src/components/*.svelte`; camelCase `onX` appears as a
**component prop declaration exactly once**, `NoteEditor.svelte:53 onDelete`. Every other camelCase
hit is a nested options key or object-literal field, verified individually:
`HelpMenu.svelte:24` (a `use:floating` action option), `LibraryHome.svelte:110,114` and
`CreateExhibitDialog.svelte:95,105,685` (hook objects inside function signatures),
`Publish.svelte:104,108,115` (device-code callbacks), `App.svelte:167` (a store-factory option),
`App.svelte:1511` and `Reader.svelte:271` / `NarrativeReader.svelte:167` (fields of a
`FrameOverlay` object literal).

The prior art runs the other way, and it is the mandated kind. `docs/adr/0002-rendering-and-framework.md:14`
names annomea as a codebase Archie adopts components *from* ("The read-side donors that are adopted
*as components* (annomea's pane + popup/drawer) are all Svelte"). Measured this session:
**annomea** — 22 `.svelte` files, 17 camelCase `onX` prop declarations against 11 lowercase, on
svelte ^5.55.5 (Archie runs 5.55.9). **anvil** — 28 `.svelte`, 26 camelCase against 1 lowercase, and
`apps/studio/package.json:6` names anvil as the donor of Studio's editor shell and AnnotationForm.
That ancestor, `anvil/app/src/editor/AnnotationForm.svelte`, is 632 lines with ~35 flat props and no
snippet or slot API at all.

Three more artifacts a rewrite must hold: `App.svelte:2248-2252`, where every NoteEditor prop is
passed by Svelte **shorthand**, so the prop name and the App-side local name are one name and a
rename is a two-file edit, not a component-local one; `Publish.svelte:86-95,115`, where
`onfolder`/`onzip`/`ondownload`/`onenterweb`/`onpublish` are Promise-returning services already
wearing the `on` prefix, so a clean "void = event, Promise = service" partition would mandate
renaming five conforming props; and the in-file `@surface`/`@composes`/`@variants`/`@constraint`
JSDoc blocks, present in **30/30** studio components (`NoteEditor.svelte:2-6` is the exemplar) —
the nearest thing the repo has to a written component-convention record. `.interface-design/system.md`
contains zero prop-naming guidance; no ADR covers it.

**New knowledge — genuinely undetermined.** Which direction wins: in-repo incumbency (~140:1
lowercase) or cited prior-art precedent (annomea 17:11, anvil 26:1 camelCase, both named as donors
by ADR-0002 and `apps/studio/package.json`). Both sides are real, both are now measured, and nothing
in the compiler settles it — a probe against the repo's own svelte 5.55.9 finds
`event_directive_deprecated` but no prop-naming warning of any kind. **How to get it: put the two
measurements to the user and take the call.** This is the highest-leverage 10 minutes on the map.

**Readiness: needs rewrite, gated on that decision.** Rewrite scope to what is true — NoteEditor is
the sole non-conforming component (12 bare-verb function props plus one camelCase `onDelete`) —
and state explicitly out of scope: CmdK, SafetyState, any `createEventDispatcher` removal, and the
five non-callback injected props that a naive sweep would churn (`noteCountOf`, `countOf`,
`getFitOptions`, `signIn`, `persistSession`).

### Viewer parity (Archie-7aef) — **needs rewrite as a scoping ticket; blocked on nothing**

**Prior knowledge.** `docs/IMPLEMENTATION-STRATEGY.md:31,35-36` defines Phase 3 ("any invented
interaction (playground/project entry, overview-as-canvas, narrative, collaboration) — those are
Phase 3"), and `CONTEXT.md:28-31,63` defines "drawer" as a scrimmed surface and states that drawers
are not places. Both terms the ticket uses are first-class repo vocabulary; a session that greps for
the literal string "narrative drawer", finds nothing, and concludes the ticket is fiction has made
an error this ledger should prevent. The ticket does still need its author to *name the surface* —
the real question is what the narrative reading surface's note-card behaviour should be
(`NarrativeReader.svelte` plus the shared `NotePopup.svelte`, imported by both `Reader.svelte:14`
and `NarrativeReader.svelte:12`).

The decisive scoping fact: `ledgers/UX-AUDIT-studio-wireframes.md` is the map's own declared source,
and `grep -ain viewer` over it returns **zero hits**. The viewer was never inside the audit that
generated this map. Same for `docs/research/a11y-interactions.md` — one viewer mention at :147, in a
prior-art survey list, not a scope statement. That is why the viewer's `ReadingLegend.svelte:33-38`
carries no reading number and its `Filmstrip.svelte` no `tabindex` while Studio has both.

Parity has **four** consumers, not three. `apps/viewer` (23 Svelte islands), the embed
(`packages/archie-viewer`, whose `element.ts:9-10` records that viewer markup was *ported*, not
imported), the duplicated stylesheet (`apps/studio/src/markers.css` and `apps/viewer/src/markers.css`
are byte-identical with a sync warning at :7), and **`packages/render-mount/src/read-overlay.ts`** —
the shared read-only overlay, with its own package gate. Note `packages/archie-viewer/src/read-overlay.ts`
does not exist; a session handed that path will not find the file.

One a11y claim circulating about this ticket is dead: the embed overlay keyboard/AT dead end was
closed by Archie-9413 (merged `4178a7b`), and `read-overlay.ts:184-191` now sets `role`, `aria-label`,
`tabindex="0"` and a `keydown` handler. Do not carry it forward as an open gap.

**New knowledge.** Which viewer surfaces are in scope at what fidelity — irreducibly a product call,
since the audit never covered them. Reconcile with two existing plans rather than inventing a
parallel table: `docs/plans/EMBED-VIEWER-IMPLEMENTATION-STRATEGY.md:73-82` (Phase 3 route ladder)
and `docs/plans/SCALE-GALLERY-PLAN.md:100` ("Phase 3 — Library-level Gallery (Studio + publish
format + Viewer parity)"). `IMPLEMENTATION-STRATEGY.md:72` also names the method for Phase 3
invention work — brainstorming first.

**Readiness: rewrite as an explicitly-scoped grilling ticket.** It is genuine unscoped fog, not a
task. Nothing upstream gates it.

### Published-site deep links (Archie-33bf) — **retarget; do not close, and cut its blocker edge**

**Prior knowledge.** The ticket's framing ("should viewer URLs mirror Studio place grammar?") is
backwards on every axis. `packages/render-core/src/url/route.ts` predates `apps/studio/src/place.ts`
by roughly two months on the shared rungs (`git log`: route.ts from `0c3717e` 2026-05-25, the `/o/`
rung at `4795d95` 2026-06-20; place.ts has exactly one commit, `4f68f9a` 2026-07-18), and
`place.ts:27-31` says so in prose — Studio mirrors the ADR-0021 cite-ladder, degrading deeper viewer
rungs upward (:53-56, tested at `place.test.ts:51-55`). The question was already settled by
Archie-7153, closed 2026-07-19, two days *before* this ticket was created. `ADR-0021:35-37` freezes
the grammar as a public API (adding allowed, renaming/removing not).

But the two grammars are **not** byte-identical, and that is the ticket's real residue: `place.ts:40,42`
percent-encodes both segments and `:50` decodes; `route.ts:63,73` emits raw and `parseRoute:38-39`
never decodes. Only `?src=` is encoded (`route.ts:78`).

The sharper defect sits one layer up. `apps/viewer/src/pages/[slug].astro` documents itself at :1-8
as "the deep-link `[slug].astro`", yet its whole 150 lines contain no hash handling and no
`parseRoute` import — line 148 is a bare `<ExhibitView client:only="svelte" slug={slug!} />`, while
`ViewerShell.svelte:296-303` threads all six rung props. And that page form is the **canonical
published address**: `sitemap.xml.ts:6` mints `/viewer/<slug>/` and `og-image.ts:12` defines
`CANONICAL_BASE` from the same source. The URL Archie advertises to search engines and unfurlers is
precisely the one that honours no rung below the exhibit. That is a documented intent contradicted
by its own implementation — a bug, not an open architecture question.

Three closed tickets are the governing prior art and all postdate or immediately predate this
ticket: Archie-b9f4 (closed ~2.5 hours before Archie-33bf was created — `/a/{logicalId}` deep links
now resolve on real published trees, browser-proven 8/8), Archie-69a7 (the same defect *shape* — a
surface advertising rungs it silently drops — with the transferable lesson that the gap is a missing
seam on the imperative sink, not a resolver bug), and Archie-d93a (route-set enumeration must derive
from one source; route dirs == sitemap locs, 8/8). Archie-77b2, cited at `[slug].astro:5`, requires
that every slug including `unlisted` gets a built page while only the listed subset is advertised —
any routing change must preserve that.

**New knowledge.** One narrow call: should `/viewer/<slug>/#/<slug>/o/<id>` resolve in place on the
per-slug page, or redirect to the shell form?

**Readiness: retarget as a bug.** New title along the lines of "the canonical published URL form
drops every rung below the exhibit", scoped to `[slug].astro` plus the `place.ts`/`route.ts`
encoding asymmetry. Its `wayfinder:grilling` label is wrong for what survives.

### Conflict source (Archie-7e5b) — **the strongest ticket in the batch; ready with edits**

**Prior knowledge.** Its premises hold, verified end to end. `importChanges` has zero production
callers (`session.ts:199` is the definition; every other hit is a test or a prose comment).
`openZip` replaces rather than merges (`ingest-flows.ts:1268-1269`), so `session.conflicts()` —
the sole feeder of `App.svelte:1329` — is always empty. Both shipped slivers are real: memoized
conflicts at `session.ts:210-220`, the editor thunk at `session.ts:98-111` with Studio's side at
`exhibit-session.svelte.ts:52-55`. The two C4 gate bypasses are real: the canvas `onUpdate`
(`App.svelte:1617`, bound at :2507) calls `editNote` with no conflicted check, and both delete loops
(`App.svelte:515-524` and :882-900) are unguarded and abort half-done, with `bulkRemove` interleaving
`markObjectRemoved` so a mid-loop throw leaves objects tagged but not removed. The one premise a
prior pass ruled stale actually holds: `git show e2f2b87` confirms MergeReview's
`synced: number` prop and its "Added {synced} notes from a colleague's copy" string were deleted
hours before the ticket was filed, and nothing shipped since carries a merge-added total.

Two shipped artifacts answer questions the ticket poses as open, and both must be read first.
`apps/studio/src/note-heads.ts` — `dedupeHeadsByLogicalId`, the decided plural-head display policy
(max-rev representative, first-seen order preserved), whose 13-line header *is* the written analysis
of the duplicate-logicalId failure modes (duplicate Svelte 5 `{#each}` keys → runtime error;
duplicate `id="note-editor-{logicalId}"`). It is applied at `App.svelte:1346` and `:1366` and
**skipped only at :1350**, the canvas feed. That one-line gap is the actual open item — not an
unmeasured question about Annotorious behaviour. And `apps/studio/src/structure-reconcile.ts:64-108`
is a shipped in-repo reference implementation of exactly the fix the delete loops need: collect
conflicted ids up front (:67-70), skip the delete leg (:82-85), skip every other append with a
cursor-advance so neighbours are not squeezed (:98-105), return the gated list. That path is
guarded, deliberately, with the C4 clause cited in-comment — it is a template, not a shipped crash.

Governing decision: `sd show Archie-d71c` (wire maximal; MergeReview non-blocking; keep-both cut;
the merge *contract* belongs to the collab-readiness map — coordinate, never fork). Also read
`ledgers/AUDIT-stable-ids.md`, named by both d71c and Archie-f849 as the identity source of truth,
and `ISSUES.md` Issue 13 knowing all three of its claims are contradicted by shipped code.

**New knowledge.** One product question: on opening a colleague's `.archie.zip`, should the non-log
parts of the library (objects, assets, meta) merge or replace? `openZip` replaces today; d71c's
"MergeReview non-blocking" clause is scoped to review blocking, not to open semantics, so this is an
unresolved ambiguity rather than a proven contradiction. Grilling-shaped.

**Readiness: pickable today, after a copy edit.** Its declared blocker Archie-697c has been closed
since 2026-07-19T03:07Z — the ticket named an already-closed ticket as its future wirer 14 hours
after that close, and `sd list` renders it unblocked (`-`, not `!`). What actually stalls a session
is the body text "Do NOT fork the zip-merge work itself." That is prose, not a gate. Also required
by the repo rule and absent from the ticket: `canvases-annotations-sharing/weavejs` under the
sibling root is substantive prior art for a collaborative annotation canvas
(`annotation-state-advisor-eval.md`, 279 lines, opening on Yjs UndoManager CRDT-native undo), and
`ledgers/PROBE-annotorious-dom-2026-07-19.md` is an existing in-repo probe of Annotorious DOM
behaviour.

### NoteEditor sub-primitives (Archie-3547) — **propose closing; the surviving work is different**

**Prior knowledge.** Two of five extraction targets describe controls that do not exist (see
headline), and neither is a regression — `git show 4795d95:apps/studio/src/NoteEditor.svelte`, the
ADR-0018 commit that *introduced* scope, already renders the read-out-plus-buttons shape with the
same comment. The widget types were invented, not outdated. The five component names appear nowhere
but in the ticket body; `.interface-design/system.md:144-155` names an entirely different set
(StudioHeader, ObjectRail, NotesSidebar, NoteCard, WadmForm, CanvasWorkspace).

The economics were never examined and they are decisive. Each of the five sections has exactly one
render site; NoteEditor itself has exactly one consumer (`App.svelte:40` import, :2248
instantiation, :2609 render). The repo's own stated bar for extraction is duplication across real
consumers — `ZipExportFields.svelte`'s header states "Three consumers … so the fields, their notes,
and the opts composition live here ONCE." None of the five clears it. The ticket names
`SafetyState.svelte` as its model, but SafetyState earned componenthood by **multi-mount reuse** —
three mount sites across two files (`App.svelte:2070`, `App.svelte:2153`, `LibraryHome.svelte:468`),
which its own docstring at :9-16 gives as its reason to exist. That is precisely the property all
five candidates lack, and it makes SafetyState an argument *against* the ticket.

SafetyState also demonstrates the repo's actual extraction pattern, which contradicts the ticket's:
its state machine lives in a tested `safety-state.svelte.ts:93` while the markup stayed inline.
`ledgers/TEND-EXPLORE-studio-2026-07-20.md` — dated exactly the date the ticket's phantom audit
claims, and a far likelier intended provenance — argues the same way: every structural friction item
it raises is a logic→`.svelte.ts` extraction, and its Fog section names the anti-pattern this ticket
proposes ("Proliferation of single-consumer tested micro-modules … navigation cost only").

Two constraints any surviving version must respect. `docs/adr/0006-edit-at-locus-spatiotemporal-selectors.md:20-27`
fixes "There is ONE editing-form definition (comment / tags / layers / time + ⌘K cite)", cited at
`NoteEditor.svelte:8`. And the CSS does not partition cleanly: `.wadm label` (:157) supplies eyebrow
typography for both the Reading (:122) and Emphasis (:128) labels, and `.wadm .cite` (:160-167) is
shared between the comment cite button (:97) and the three scope buttons (:114,:115,:117) — so those
rules can neither cleanly move nor cleanly stay. Cross-boundary styling is available
(`App.svelte:3056` already does `:global(.wadm)` on this exact form), so this is a real hazard, not
a disqualifying misconception — but it is unbudgeted work the ticket does not mention. The
`svelte-check` gate will not catch a break: `apps/studio/package.json:15` omits `--fail-on-warnings`
(the viewer has it, `apps/viewer/package.json:18`), and `.wadm label` stays "used" by the surviving
Comment and Tags labels regardless.

**New knowledge.** None required to decide. The decision is whether one-consumer extraction is worth
its navigation cost, and the repo has already answered it twice in writing.

**Readiness: propose close.** Carry forward the three genuinely-useful findings as small items: the
dead `.note-popover` rule and stale `@surface {popover}` docstring (`NoteEditor.svelte:196-198`;
the live host is `.note-editor-region`, `App.svelte:2608`), the byte-identical `fmtMMSS` duplication
(`NoteEditor.svelte:77` and `NarrativeEditor.svelte:112`), and the stale line reference in
`e2e/loop.spec.ts:70-76`.

### Visual/design-system pass (Archie-1244) — **more decided than it looks; rewire, don't research**

**Prior knowledge.** The ticket points at `design/_after-tokens.md`, and that reference is roughly
75% usable: §2 (palette) is transcribed verbatim into `tokens.css:14-22` (parchment #F7F4EC, hunter
#2D5F3A, emerald #3A8C5D, moss #1A3C23, sage #6B7D6A), §8 carries three live contrast rulings, and
only §6's component vocabulary (catalog-stamp, lineup-list, ticket-button) is foreign to Archie.
Its §7 "zero box-shadow" rule reads as contradicted by `tokens.css:118-123`, but the repo
adjudicated that conflict and ruled the *spec* wins.

**That ruling is the critical missing input.** Archie-5c1d (open, same `map:tend-style`) carries a
recorded `## DECISION (2026-07-21): Option C — shadows only on floating surfaces`, naming
`.interface-design/system.md` § Depth as authoritative, classifying all five shadow tokens into four
fates (lift-low/lift-mid restricted and recalibrated; signal-glow, inset-fog, text-haze kept), and
enumerating ~60 offending selectors with `file:line` under "Selectors that MUST change" — across
`atmosphere.css`, `App.svelte` (18 selectors, L2756-L3083), `AvEditor.svelte`, `BulkRightsDialog`,
`CreateExhibitDialog`, `DetailsEditor`, `ExhibitOverview`, `GalleryWall`. It explicitly rejects
amending the spec: "Spec drift becomes precedent." Its own body says "Implementation is a separate
ticket" and names `Archie-5c1d-impl (to be created)` — **that ticket does not exist**, and
Archie-1244 never mentions shadows, `box-shadow`, or Archie-5c1d. A session picking up 1244 today
would do a visual pass unaware the elevation model was decided.

Also missing from the ticket's field of view: `apps/studio/src/atmosphere.css` (149 lines) and
`apps/viewer/src/atmosphere.css` (132 lines) — the other half of the shipped visual layer, whose
header states the identity thesis ("Depth is built from blur + light, never from a hard offset
shadow") and which has drifted 17 lines apart from its declared twin; `ledgers/CLAIMS-composition.md`
(78 lines, the 2026-07-21 claims-vs-reality audit *of* system.md, which warns its component table is
aspirational); and `packages/render-core/src/publish/static-pages.ts:58`, a third hardcoded copy of
the palette in TypeScript, outside both `tokens.css` files, governing published static pages.

A provenance detail worth flagging: `tokens.css:1`, `atmosphere.css:1` (both apps) and
`static-pages.ts:58` all cite `design/design.md v0.4`. That file does not exist — four sites cite a
phantom.

Because this is a QA walk over surfaces the closed implementation tickets *built*, its real reading
list is those close reasons: Archie-c7ef (editor chrome), Archie-606d (library home), Archie-3b03
(selection bar), Archie-51cc (create/import), Archie-f359 (light-table trims), Archie-1921 (Publish
merged), Archie-adae (canvas legend), Archie-c76d (SafetyState app-wide), Archie-ebf4 (Details),
Archie-d7ab and Archie-ba74 (glyph labels), Archie-f260 (a11y patterns). Without them you cannot
tell intended from drifted.

**New knowledge.** Narrow now, and only on the axes 5c1d did not touch: palette, typography and
radius, where `system.md` is still pre-Verdant (`:22-45` dark #181714 with forest #3a6b4c; `:81-87`
Cormorant/Crimson/Work Sans/JetBrains against shipped FOP VHS / Vinque Antique / LARAZ at
`tokens.css:79-89`; `:99` radius 4/8/12 against shipped 10/16/20). Spacing already agrees
(`system.md:95` matches `tokens.css:103-111` exactly). Also unanswerable from code: there is no
visual-regression harness — `scripts/capture-screenshots.mjs` gates on liveness only
(`capture-gate.mjs:17`, `MIN_SHOT_BYTES = 10_000`), and no pixel baseline exists anywhere.

**Readiness: rewrite and rewire.** Weighted toward task, not research: the depth half is now a
mechanical selector list. Fold 5c1d's inventory into 1244's scope (or file the missing impl ticket
and block on it), and split the palette/typography/radius re-baseline into a small grilling ticket.
Its "14 structural changes" figure matches nothing — the map holds 10 decision bullets and the
ticket's own parenthetical names 13.

### Onboarding/tutorial refresh (Archie-99db) — **ready after a path correction and a split**

**Prior knowledge.** The ticket's stated location is wrong: `apps/studio/decks/` does not exist. The
canonical source is `docs/learn/` — seven decks `0001-the-archie-journey.html` through
`0007-publish.html` plus `assets/`, copied into Studio's served assets by
`apps/studio/scripts/sync-learn.mjs`, which runs on both `dev` and `build`. They render in-app
through `TutorialModal.svelte:8-17`, reached from `HelpMenu.svelte:8`.

Three governing artifacts the ticket does not cite. `sd show Archie-66b0` — the deck **is** the help
investment, HelpMenu is its only entry point, and explicitly "NO new contextual-cue system beyond
the already-built first-use cues," which constrains the ticket's empty-state question before it is
asked. `sd show Archie-6595` — the prior refresh (merged 2026-07-19, all seven decks rewritten
against the shipped redesign), carrying the five-screenshot human re-shoot list and scoping facts a
new pass must preserve. And, most importantly,
`.agents/skills/teach/learning-records/0006-teach-the-non-obvious-only.md`, which records a standing
user directive: self-evident UI gets no onboarding; onboarding is for the non-obvious, the
multi-step, and the get-it-wrong-costs-you. That is the acceptance filter for every candidate item —
without it a session pads seven decks with the surface changes from 126 commits, which is exactly
what the directive exists to stop. Companion record `0007-slide-decks-embedded-in-help.md` locks two
format constraints: at most two slides per step, and the deck must fill its *container*, not the
window. A new slide therefore evicts an existing one; `docs/learn/assets/deck.js` also chains the
decks into one continuous tour, so adding, removing or reordering touches cross-file edge flow.

**Verified staleness, so far.** Deck 3 is materially false on desktop: `0003-where-work-lives.html:24,35-36,67`
still teaches "by default it saves only inside this browser … Browser storage is OPFS", which
`b7a747e` (2026-07-20, one day after the refresh) inverted by mounting the native folder as the
resident store on desktop (`resident-store.ts:7,22,56`). Deck 7 has no coverage of the
`unlisted` / "Hide from the public gallery" toggle shipped at `cae20fd`. Two of seven asset PNGs
(`studio-example-card.png`, `studio-home.png`) are referenced by nothing. `SafetyState` is
platform-blind — zero `Tauri` references in `SafetyState.svelte` or `safety-state.svelte.ts` — so
whether its nudge is honest on desktop is a real open question. Deck 2 omits the "From a link"
onramp (`create-exhibit-dialog.ts:51-53`, `offersLink`), but that one must be routed through the
0006 filter first: it is a visible chooser card in the same dialog, and may correctly stay out.

**New knowledge.** Which stale items clear the non-obvious bar, and — needing a real answer — whether
the save nudge should say something different on desktop.

**Readiness: split, then ready.** The prose half (which decks make false claims) can run today. The
screenshot half should not: three live-referenced images are annotated-canvas or chrome shots dated
Jun 20, and both Archie-1244 and cross-map Archie-c59a (marker colours plus drop-shadow removal)
will invalidate them again. Archie-6595 already established the re-shoot cannot be done headlessly.

### NoteEditor snippets (Archie-6be3) — **propose closing as speculative generality**

**Prior knowledge.** The premise holds — 21 props, 13 function-typed — but the beneficiary does not
exist. NoteEditor has exactly one consumer, and the comment directly above that call site states the
opposite design intent: "ONE WADM form definition (ADR-0006) — never forked … a single definition
keeps the edit form identical wherever it hosts." The ticket proposes an override API against a seam
whose stated purpose is preventing variation.

The ticket also contradicts itself internally. Its Design block declares `children: Snippet;`
(non-optional) while its Contract four lines below promises "No caller changes required" — and the
sole caller passes no children. NoteEditor contains no `{@render children}` and no insertion point:
its markup is a closed `<form class="wadm">` from :85 to :139. Its promised API shrinkage is
arithmetically impossible: with default snippets rendering the sub-primitives, every datum and
action those defaults consume must still arrive as a prop, so 21 survive and 4-5 snippet props are
added. And its snippet names only half-match Archie-3547's extraction list (2 of 5 overlap; three
extracted components get no snippet).

The mechanism itself is real — a probe compiled against the repo's own svelte 5.55.9 confirms
optional-Snippet-with-component-local-default works, 0 warnings. The prior art is what settles it:
`anvil/app/src/editor/AnnotationForm.svelte`, Studio's named ancestor (`apps/studio/package.json:6`),
is 632 lines with ~35 flat props in one `$props()` destructure and contains no slot, no Snippet and
no section-override API. Its extraction was a written, executed plan
(`anvil/product-plan/instructions/incremental/08-extract-annotation-form.md`) whose caller shape is
structurally identical to Archie's `App.svelte:2247-2252` today. The experiment already ran: flat
injected props were the terminal shape at three times the size, not a way station.

One correction for anyone acting on the CSS side: Svelte does *not* exempt `:global()` rules from
unused-selector analysis. A probe against 5.55.9 shows `:global(.nope) .missing` **is** warned; only
the ancestor half is unverifiable. `:global(.note-popover) .wadm` escapes the gate because `.wadm`
matches locally, not because `:global()` is exempt.

**New knowledge.** None. If the 21-prop surface still itches, the genuine interface defect is
elsewhere and snippets do not address it: `commentEl = $bindable(null)` (`NoteEditor.svelte:33,56`,
bound at :98) lets App reach through the component into its DOM to splice ⌘K citations at the caret.

**Readiness: propose close.** If the map wants a decomposition target with evidence behind it,
`App.svelte` is 3147 lines — fifteen times NoteEditor, and the file every one of these props threads
through.

---

## Shared reading list

### Tier 1 — every session on this map (~238 lines of prose plus 13 close reasons; ~15 minutes)

The failure mode across every input assessment was not budget. It was skipping these cheap lines and
then reasoning from a single grep.

1. **`sd show Archie-21b1`** — read the **Notes** block, not just Decisions: it carries the merge
   policy (merge each branch once review is clean and gates green, no per-branch ask), the territory
   rule (App.svelte belongs to the nav-implementer until merged), the standing prior-art rule, and
   the skills routing (grilling tickets use `/grill-with-docs`, **user-invoked only** — ask, never
   self-invoke).
2. **The 13 closed grilling close reasons** (`sd list --label map:studio-ux-overhaul --all`, filter
   `wayfinder:grilling`). Six are recorded nowhere else: Archie-d71c, Archie-66b0, Archie-7d9b,
   Archie-beb6, Archie-315e, Archie-2308. Mandatory, not optional.
3. **`CONTEXT.md`** (75 lines, whole file) — the ubiquitous language. Persistence at :9 ("Save"
   names exactly one act; routine persistence is autosave and is never called Save); Surfaces at :26
   (the single-scrim invariant, the dismissal contract, "There are no close-confirmation guards");
   Navigation at :42 ("Modals and drawers are not places").
4. **`ledgers/UX-AUDIT-studio-wireframes.md`** (134 lines) — the map's declared source, findings
   W1–W25. Format warning: findings are inline bold (`- **W1 — …**`), not headings; a heading grep
   returns zero and reads as a missing file.
5. **`docs/agents/issue-tracker.md`** (29 lines) — the `sd` protocol: claim before work, block via
   native deps, post the answer as the close reason **and** append a gist to the map (the step
   skipped six times). `.seeds/` is committed only when the user asks. ISSUES.md is a separate,
   older system — don't mix them.
6. **The prior-art rule and both roots.** `Archie/Prior Art/` holds only `freecut`; the real corpus
   is `/mnt/Ghar/2TA/DevStuff/Annotators/Image/` (~30 codebases). Search it first, via the `fff`
   tools.
7. **The gates**, read from `package.json` rather than memory. Studio:
   `pnpm --filter @archie/studio run check` (baseline 0/0), `cd apps/studio && pnpm typecheck`
   (the only full-strictness gate for `.ts`), `pnpm exec vitest run`, and playwright via
   `--config e2e/playwright.config.ts`. Viewer: `pnpm --filter @archie/viewer run check:svelte`
   (`--fail-on-warnings`, so a new *warning* fails CI) — `astro check` gates `.astro` pages only and
   proves nothing about the 23 islands. Packages carry their own vitest. Always run per-app; the
   root vitest binary fails rune tests with "$state is not defined".

### Tier 2 — any ticket touching Studio code

- **`.claude/rules/svelte-no-typecheck-net.md`** and **`.claude/rules/studio-ts-typecheck-gate.md`** —
  auto-injected, but the operative instruction is easy to miss: `tsc` and `vite build` cannot see
  `.svelte` scripts at all, and `svelte-check`'s tsconfig relaxes `exactOptionalPropertyTypes`, so a
  TS2379 can pass vitest *and* svelte-check and be caught only by `pnpm typecheck`. Optionals use
  conditional spread, `...(x ? { x } : {})`.
- **The `@surface` JSDoc blocks, 30/30 studio components** — the de facto component-convention
  record. Any new or extracted component carries one; extend this idiom rather than inventing a
  parallel doc. The sweep Archie-c1e0 describes is already done on disk (uncommitted).
- **`ledgers/CLAIMS-composition.md` then `.interface-design/system.md`, in that order** — the audit
  warns the component table is aspirational, so reading system.md first produces confident wrong
  beliefs about what components exist.
- **`docs/research/a11y-interactions.md`** (248 lines) — the binding interaction spec behind
  Archie-d90f: APG grid/move-mode reorder, notes-panel-as-listbox for canvas markers, numbered
  readings, roving-tabindex filmstrip. Studio-scoped.
- **`design/_after-tokens.md` + `apps/studio/src/tokens.css`** — plus the awareness that
  `apps/viewer/src/tokens.css` is a separate file and `markers.css` is byte-identical across apps
  with a sync warning at :7, so marker styling is always a two-file edit.

### Tier 3 — ticket-specific

Named inline per ticket above. The expensive reading — ADRs, plans, exploration ledgers, sibling
codebases — is all here, and each item is needed by only one or two tickets.

---

## Sequencing

**Nothing upstream gates this set.** Every implementation ticket the map's decisions named is closed:
Archie-02ae (nav), Archie-696d (beat deep links), Archie-beb6, Archie-b671 and Archie-c7ef (editor
chrome), Archie-f260 (a11y), Archie-ebf4 (Details), Archie-d71c and Archie-90f1 (collab). The
remaining eight are genuinely terminal fog. The consequence: the risk of documenting a surface a
later ticket rewrites comes from *inside* this set, and only from Archie-1244.

**Correct order.**

1. **Decide the callback direction (Archie-07a7).** Not a diff — a call. It gates 07a7 → Archie-3547
   → Archie-6be3, and it names the convention every future component inherits. Both measurements are
   now in hand.
2. **Conflict source (Archie-7e5b)** and **published deep links (Archie-33bf)**, in parallel — they
   share no files with anything else and with each other only through `App.svelte`.
3. **Visual pass (Archie-1244)**, once 5c1d's decision is folded in.
4. **Onboarding prose (Archie-99db, prose half)** any time; **screenshots after step 3** and after
   cross-map Archie-c59a.
5. **Viewer parity (Archie-7aef)** — a scoping conversation, schedulable any time.

**Dependency edges to add.**

- **Archie-07a7 → Archie-3547 (ordering).** They write the same 137 lines of `NoteEditor.svelte`, and
  the asymmetry is sharp: renaming first is a 2-file surface (NoteEditor's Props block plus
  `App.svelte`'s shorthand pass-through); extracting first makes it 7 files, because the props then
  cross five new component boundaries. If Archie-3547 is closed as proposed, this edge dissolves.
- **Archie-1244 → Archie-99db**, and **cross-map Archie-c59a → Archie-99db**. The three live deck
  images (`narrative-led.png`, `grid-led.png`, `gallery.png`, all dated Jun 20) show annotated canvas
  and chrome; both tickets invalidate them. Alternatively split 99db and block only its screenshot
  half.
- **Archie-5c1d → Archie-1244** (or file the missing `Archie-5c1d-impl` and block 1244 on that).

**Edge to cut: Archie-7aef → Archie-33bf.** The map blocks deep links on viewer parity, but the hash
grammar lives in `packages/render-core/src/url/route.ts` and `apps/studio/src/place.ts` and shares no
code or decision surface with note popups, readings display or narrative rendering — which is what
Archie-7aef's body actually asks about. It is a category error, and it is currently the only thing
holding 33bf in a blocked state.

**File territory — do not run concurrently.**

- **`App.svelte` (3147 lines) is the serialization axis.** Archie-07a7 (shorthand prop pass-through
  at :2248-2252), Archie-7e5b (the canvas `onUpdate` at :1617 and both delete loops at :515-524,
  :882-900) and Archie-1244 (18 shadow selectors, L2756-L3083) all write it. The map's territory rule
  assigns it to the nav-implementer, but Archie-02ae is closed, so that assignment is vacated and
  needs re-issuing.
- **`NoteEditor.svelte`** — Archie-07a7 and Archie-3547 both write :85-139.
- **`tokens.css` / `atmosphere.css` / `markers.css`** — Archie-1244 and cross-map Archie-c59a. Note
  each is duplicated across studio and viewer, and both pairs have already drifted.
- **`docs/learn/*.html`** — Archie-99db alone, but the decks chain through `assets/deck.js`, so slide
  edits are not independent per file.

---

## What should change on the map — proposals for approval

These are **proposals**. Nothing below has been applied; the tracker was not modified this session.

**Ticket rewrites**

1. **Rewrite Archie-07a7 from measurement.** Delete the CmdK, SafetyState, three-dialects and
   `createEventDispatcher` claims. Scope to NoteEditor as the sole non-conforming component. State
   out of scope: CmdK, SafetyState, and the five non-callback injected props (`noteCountOf`,
   `countOf`, `getFitOptions`, `signIn`, `persistSession`). Record both measurements — in-repo
   ~140:1 lowercase, prior art annomea 17:11 and anvil 26:1 camelCase — and mark the direction as
   awaiting a user call.
2. **Retarget Archie-33bf as a bug**, retitled to name the real defect: the canonical published URL
   form (`/viewer/<slug>/`, per `sitemap.xml.ts:6`) honours no rung below the exhibit, while
   `[slug].astro:1-8` calls itself the deep-link surface. Add the `place.ts`/`route.ts` encode/decode
   asymmetry as second scope. Drop `wayfinder:grilling`.
3. **Rewrite Archie-7aef as an explicitly-scoped grilling ticket** that names the surface (the
   narrative reading surface plus the shared `NotePopup`), notes that parity has four consumers
   including `packages/render-mount`, and reconciles with the two existing Phase 3 plans instead of
   inventing a parallel table.
4. **Rewrite Archie-1244** to fold in Archie-5c1d's ~60-selector list, add `atmosphere.css` (both
   apps) and `static-pages.ts:58` to scope, and drop the unsourced "14 structural changes" figure.
5. **Correct Archie-99db's path** from `apps/studio/decks/` to `docs/learn/`, and add the three
   governing artifacts it omits: Archie-66b0's decision, Archie-6595's close reason, and the teach
   learning records 0006 (non-obvious-only filter) and 0007 (two-slides-per-step, container-fill).
6. **Copy-edit Archie-7e5b.** Its "Do NOT fork the zip-merge work itself" line reads as a gate; its
   declared blocker Archie-697c closed 2026-07-19. Replace with a pointer to note-heads.ts and
   structure-reconcile.ts as the two in-repo templates.

**Tickets to close or split**

7. **Close Archie-3547** (single-consumer extraction against the repo's own three-consumers bar and
   its own `TEND-EXPLORE-studio` finding), carrying forward three small items: the dead
   `.note-popover` rule and stale `@surface {popover}` docstring, the duplicated `fmtMMSS`, and the
   stale line reference in `e2e/loop.spec.ts`.
8. **Close Archie-6be3** as speculative generality — one consumer, an internally contradictory
   contract, no achievable API reduction, and prior art (anvil's 632-line AnnotationForm) showing
   flat props are the terminal shape.
9. **Split Archie-99db** into a prose half (actionable today) and a screenshot half (blocked on
   Archie-1244 and Archie-c59a).

**Dependency edges**

10. **Add** Archie-5c1d → Archie-1244; Archie-1244 → Archie-99db(screenshots); Archie-c59a →
    Archie-99db(screenshots); Archie-07a7 → Archie-3547 (only if 3547 survives).
11. **Cut** Archie-7aef → Archie-33bf.

**Fog patches that were dropped**

12. **Append the six missing decisions to the map's "Decisions so far"**: Archie-d71c, Archie-66b0,
    Archie-7d9b, Archie-beb6, Archie-315e, Archie-2308. This is the tracker protocol's own required
    step and its omission is the largest single onboarding gap.
13. **File the missing `Archie-5c1d-impl`** that 5c1d's own body promises, or explicitly fold it into
    Archie-1244 — and close Archie-5c1d, whose decision is recorded and whose "Done when" is
    satisfied.
14. **Re-issue the `App.svelte` territory assignment.** The map assigns it to the nav-implementer;
    Archie-02ae is closed, and three open tickets write the file.
15. **Annotate all three Astryx-citing tickets** to mark that provenance UNVERIFIABLE, substituting
    `ledgers/CLAIMS-composition.md`, `ledgers/TEND-EXPLORE-studio-2026-07-20.md` and the in-file
    `@surface` blocks. Do not treat the phantom audit as having settled anything.

**Type-label corrections**

16. Archie-33bf: grilling → bug/task. Archie-1244: weighted to task, with a small grilling ticket
    split off for palette/typography/radius. Archie-7aef: task → grilling (it is scoping, not build).

---

## Unverified claims — read these as open

Honesty over completeness. Each of the following is load-bearing somewhere above and was **not**
proven this session.

- **The callback-convention counts are approximate.** Measured `~140` lowercase `on*` declarations by
  regex over `.svelte` sources, which includes some nested options-object keys; the camelCase side
  was audited individually and is firm at **one** component-prop declaration. A precise lowercase
  figure needs a parse restricted to `interface Props` blocks and inline `$props()` destructure
  types. Two independent passes reported 133, 140 and 147; the direction is not in doubt, the number
  is.
- **No browser drive was run.** Whether the viewer honours the single-scrim invariant, whether
  Annotorious tolerates two annotations sharing an id on the canvas feed, and whether the save nudge
  reads honestly on desktop are all unmeasured. The repo's own precedent
  (`ledgers/PROBE-annotorious-dom-2026-07-19.md`) should be read before commissioning a new one.
- **The claim that no visual-regression harness exists** rests on a grep for
  `pixelmatch|toMatchSnapshot|visual.regression|baseline` across `package.json`, `scripts/` and
  `apps/studio/e2e`. A harness under another name would not have surfaced.
- **`ledgers/PROVENANCE-astryx-tickets-2026-07-20.md` is untracked concurrent output** from a peer
  agent in this session, not repo knowledge. Its narrative checks out where verifiable; three of its
  measurements are off, including a false "fabrication" flag on the `reading-index.js` specifier.
  Treat it as a peer claim.
- **Archie-1244's close-reason reading list was assembled from ticket titles and states**, not from
  reading all eleven close reasons end to end.
- **The six unrecorded map decisions were read once, verbatim, from close reasons.** Their
  *implications* for the open tickets — particularly Archie-66b0's constraint on Archie-99db's
  empty-state half — were inferred, not traced through code.
- **`weavejs` prior art was located, not read.** It is named here because the repo rule requires
  citing prior art for the collaborative-canvas question, not because its content has been assessed
  against Archie-7e5b's specific problem.
