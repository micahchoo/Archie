# ISSUES — Archie tend backlog

Generated 2026-07-05 by a tend diagnosis. Commit examined: `2091557` (main).
Evidence gathered by two codebase walks (core packages + apps/ops surface); every
symptom below was verified against files on disk, not inferred. Issues are ordered
by leverage; directions by strength. Each **Run it** block is self-contained —
paste it into a fresh session with no skill loaded.

> **Pruned 2026-07-26.** The per-issue working ledgers for closed issues
> (`ledgers/ARTIFACTS.md`, `CAPABILITY.md`, `CARRY.md`, `COLDSTART.md`, `COVERAGE.md`,
> `DARKDATA.md`, `DEPS.md`, `GATE.md`, `HEADROOM.md`, `METHOD.md`, `PERSIST.md`,
> `READPOLICY.md`, `SHOWROOM.md`, `SILENCE.md`, `STALENESS.md`) were deleted — they were
> dated inventories, not contracts. Links to them below are dead on purpose. Their durable
> conclusions were promoted into `.claude/rules/` (notably `render-core-data-integrity.md`
> for PERSIST/CARRY/READPOLICY/STALENESS) and into CI (`.github/workflows/checks.yml` for
> GATE). Recover any of them from git history if you need the raw evidence.

**Re-run 2026-07-05** (fresh tend diagnosis, this session; commit examined `246550d`, main). A
5-explorer subagent workflow re-walked the codebase and diffed against this backlog; the main loop
verified every load-bearing finding against the files before recording it. Standing state confirmed:
Issues 1–10 `done`, Issue 11 `queued` (its Phase-1 incremental-autosave is green but uncommitted on
`main`), Directions 1–3 `pursue`. Genuinely-new findings are appended as **Issues 12–18** and
**Directions 4–7**, each tagged `[re-run 246550d]`; two synthesis over-claims were corrected on
verification (the collab symptom is sharper than "shows anonymous" — the banner never renders in the
all-anonymous case; the dependency swap clears a subset, not the whole audit). The original **Top
recommendation** (Issue 1 / the NUL byte) is stale — both are `done`; it is refreshed at the foot of
this file.

**Re-run 2026-07-17** (fresh tend pass, user-scoped to **data integrity** — "bug and corruption free
across studio, viewer, different types of exhibits — baked, loaded, etc."; commit examined `332798b`,
main). Four parallel explorers walked the spine round trip, the publish/bake pipeline, Studio
persistence, and every viewer load path; the main loop re-verified each load-bearing finding against
the files before recording it (persist.ts write order, the committed images.json 2-of-8 drift,
working.ts's own carry-drop admission, the absent locks/guards greps). New findings appended as
**Issues 19–26** and **Directions 8–9**, tagged `[re-run 332798b]`. **Clean cells recorded** (checked,
nothing found): serialize→deserialize history round trip carries all 15 record fields; merge never
loses a DAG head; the deploy/device-flow push re-projects the full library in memory so it cannot push
a torn or mid-autosave tree; the binding-store dirty-set take/restore has no dirt-drop path; the
offline attribute refuses cleanly; the portable blob-revoke race is guarded; delete→dependent-note
tombstoning is coherent; the NEGSPACE exhibit-switch race has no surviving relative. **Gate note:
Issues 19 and 20 are data-loss / live-wrong-data findings — per SHARED.md, growth is gated until they
are resolved.** *(Gate cleared same day: all eight issues fixed and merged 2026-07-17, merges
`1cb5440`/`c55d056`/`516962e`/`847c6a8`, full gates green post-merge — 1,250 tests, typecheck,
svelte-check, astro check.)*

---

## Issue 13 — The shipped ⑧ collaboration summary is inert: no UI can ever set an editor identity `[re-run 246550d]`

**Status:** queued (new evidence corrects `ledgers/CAPABILITY.md` row 33's assumption; sharpens
Direction 1)

**Symptom.** The ⑧ "who wrote what" banner IS mounted and reachable
(`apps/studio/src/ingest-flows.ts:514` → `App.svelte` `setCollabNote`; confirmed *reachable* in
`ledgers/CAPABILITY.md` row 35), but its input is dead. `identity` is only ever READ
(`App.svelte:59-60`, `loadIdentity()` from localStorage key `archie.displayName.v1`) — grep finds
ZERO writers of that key in `apps/studio/src`; its intended setter `IdentityPrompt.svelte` is
imported nowhere (only a dead-CSS comment at `App.svelte:1880` name-drops it) and does not write the
key itself. `asClientId` (`render-core/src/wadm/brand.ts:115`) is a pass-through brand — it returns
its argument verbatim — so `author = asClientId(identity || "anonymous")` (`App.svelte:71`) is the
literal string `"anonymous"` on every install, forever. `collabBreakdown` (`collab.ts:15-28`) keys
on `note.lastEditor` and subtracts `you`; with every editor === `you` === `"anonymous"`, `others` is
always empty and `collabSummaryText` returns null (`collab.ts:34`) — so in the common all-anonymous
case **the banner never renders at all**; the only path that shows it is notes with a *missing*
`lastEditor`, labelled generically "a collaborator." The feature can never attribute a note to a
named person.

**Rungs.** L1↔L2 friction: a shipped, reachable behavior (collaboration attribution — README:226's
"identity prompt") is hollowed because its L2 input surface was never mounted.

**Why it's high-leverage.** This is the ONE collaboration surface Archie actually ships live, and it
is silently inert — worse than missing, because the code path renders "success." `ledgers/CAPABILITY.md`
(Direction 1) row 33 characterized App.svelte's identity path as "a separate, simpler identity
mechanism → author," assuming it functions; it does not. The minimal fix — mount any identity capture
(the existing `IdentityPrompt`, or a one-field prompt) so `identity` gets a writer — is far narrower
than Direction 1's full MergeReview conflict-card pursue, and it makes the already-live banner AND
Direction 2's `lastEditor` dark data real in one wire. *Lesson: audit whether a shipped feature's
INPUTS are reachable, not just whether it renders — a feature whose only data-source is unmounted
passes every render test and still shows nothing true.*

**Loop.** Journey-walk the collaboration-attribution path, confirm the always-anonymous collapse,
then wire the minimal identity capture, guarded by a test. Cross-references Direction 1 (this is the
narrow, do-it-now half of its pursue). Ledger `ledgers/COLLAB-IDENTITY.md`.

**Run it:**

```
Walk the Archie collaboration-attribution journey on a LOCAL studio run (never live): author a note
under one identity, export the .archie.zip, open it in a fresh session, read the ⑧ banner. Ledger
ledgers/COLLAB-IDENTITY.md: step | expected | actual | friction 0-3 | fix commit | re-walk. Confirm
the verified root — identity (App.svelte:59-71) has no writer, IdentityPrompt.svelte is unmounted,
asClientId is pass-through, so author is always "anonymous" and collabBreakdown collapses every
editor into `you` (collab.ts:15-34). Fix nothing mid-walk. Then wire the minimal identity capture
(mount the existing IdentityPrompt at its specified first-Import trigger, OR a one-field name prompt)
so `identity` gets a write path persisting to archie.displayName.v1; add a test that a note authored
after naming carries that name as lastEditor and the ⑧ banner attributes two distinct names to two
buckets. Do NOT build the MergeReview conflict-card UI — that is Direction 1's separate pursue; this
is only the identity-input half. Done when the banner attributes a named editor and the test passes.
```

**Strength:** Strong (three independent verified signals: no identity writer exists; `asClientId` is
pass-through so the fallback is a shared literal; the reachable banner consumes `lastEditor` and
collapses `you`). Overlaps Direction 1's territory — recorded as the friction that *sharpens* Dir1's
pursue, not a re-report of its surplus.

---

## Issue 14 — The note target-scope ladder: README claims 6 rungs, the Studio authors 4 `[re-run 246550d]`

**Status:** queued (outside `ledgers/CLAIMS.md`'s audited scope)

**Symptom.** README:47 and :202 claim a 6-rung note ladder (library, exhibit, object, region,
time-range, geo). Reality: every `createNote` in `App.svelte` (526, 917, 946, 959, 997, 1008) targets
a canvas IRI or canvas-region/geo selector; the only scope affordance (`NoteEditor.svelte:98` "▣ Make
whole-object") drops a region to a bare CANVAS IRI (object-level). Two rungs have no authoring path:
- **Exhibit rung — modeled AND rendered, but no UI (latent surplus).** `session.createNote` accepts
  an arbitrary `W3CTarget`; the append-only log/serialize/deserialize carry it byte-for-byte;
  `publish/static-pages.ts:206-216` renders any non-canvas-IRI record into a dedicated
  `<h2>Exhibit notes</h2>` bucket. Yet no `createNote` site passes a manifest IRI and `NoteEditor`
  has no exhibit-scope option. ADR-0018:8 claims "This round ships the Object and Exhibit rungs" —
  the Exhibit rung has full model+publish support with **zero authoring UI**. A cheap build on a done
  stack.
- **Library rung — not modeled (graft handoff).** ADR-0018 explicitly DEFERS the Library
  (collection-IRI) rung; nothing authors OR models it. Closing the README claim here requires
  BUILDING the write/render path → **handed-to-graft: note-ladder library rung**.

(Note: `DetailsEditor scope=library|exhibit` at LibraryHome is a rights/metadata editor, a different
feature — not W3C notes.)

**Rungs.** L1↔L2 friction (docs claim rungs with no authoring path) over an L4 surplus (the Exhibit
rung's persist+serialize+render stack is built and tested).

**Why it's high-leverage.** "Notes at every level, library→region" is an L1 promise a scholar
evaluates Archie on; two of six rungs are unreachable and one is falsely claimed shipped by an ADR.
Resolution is a claim-vs-reality reconciliation: correct the docs, wire the cheap Exhibit-note UI
(surplus already built), hand the Library rung to graft. `ledgers/CLAIMS.md` never audited this — its
README pass scoped only Features/Status/Known-limitations, and README:47/:202 live in "What it
is"/"Core concepts." *Lesson: documentation drift — a README that claims a concept the authoring
surface can't produce is a promise every reader, including the next AI session, builds on.*

**Loop.** Claim-vs-reality diff scoped to the note target-scope concept sections + the
createNote/NoteEditor authoring surface. Ledger `ledgers/CLAIMS.md` (new section — concept-definition
scope).

**Run it:**

```
Extract every claim README.md's "What it is" (:47) and "Core concepts" (:202) note-ladder sections
make about note target scopes, plus ADR-0018's "ships the Object and Exhibit rungs," and check each
against what createNote/NoteEditor can actually target (App.svelte createNote sites 526/917/946/959/
997/1008; NoteEditor.svelte scope affordance; publish/static-pages.ts:206-216 render path). Ledger
ledgers/CLAIMS.md (new "concept-definition" section): claim | where | what the code does | type
(claimed-not-implemented / implemented-not-authorable / implemented-differently) | resolution |
commit | recheck. Finish the diff before resolving. Per row: correct the docs, OR wire the Exhibit-
note authoring toggle (the model+serialize+render stack already exists — a small build), OR record
the Library rung as handed-to-graft (nothing models it). Done when re-running the diff finds nothing.
```

**Strength:** Worth exploring (verified drift + verified latent Exhibit-rung stack; the Library rung
is a build, not a tend).

## Issue 16 — The sole gh-pages bake path (`gen-published.mts` getAsset glue) has no test and silently dropped assets once `[re-run 246550d]`

**Status:** queued

**Symptom.** `apps/viewer/scripts/gen-published.mts` is the only script baking
`libraries/*.archie.zip` into `public/published/`, and its `getAsset` wiring (`:62-103`) +
baked-absolute→relative baseUrl recovery (`:82-84`) are untested glue (`apps/viewer` has 9 test
files, none for this script). Commit `a025485` ("gen-published.mts never wired getAsset, silently
dropping local assets") fixed a data-loss bug on exactly this path with a code change and NO
regression test; the fix note says it went unnoticed because every bundled sample referenced external
URLs — caught only by hand-assembling the showroom. `publishLibrary` itself is heavily covered, but
those unit tests inject `getAsset` directly, so they structurally cannot catch the outermost glue
that WIRES it.

**Rungs.** L2↔L4 friction: the product's whole output (the published static tree) rides one untested
glue module that regresses silently.

**Why it's high-leverage.** The published tree is the deliverable; the one module that round-trips
user-authored image bytes into it just regressed silently with no guard, on a path the heavily-covered
`publishLibrary` unit tests cannot reach. A characterization test over `getAsset` + base-recovery
guards the silent-asset-drop category permanently. *Lesson: regression testing — a fix without a test
closes the instance and schedules the recurrence; the test turns a one-time fix into a permanent
fact.*

**Loop.** Regression-ratchet on commit `a025485`. Ledger `ledgers/REGRESSIONS.md`.

**Run it:**

```
Guard the gen-published.mts silent-asset-drop regression (fixed in a025485, no test added). Ledger
ledgers/REGRESSIONS.md: fix commit | bug | guarded? | guard added | fails-on-revert | pass. Write a
characterization test that bakes a tiny library whose object references a LOCAL asset (not an external
URL) through gen-published.mts's getAsset + base-recovery path and asserts the asset lands in
public/published/**/assets/; verify it FAILS against the pre-a025485 code (revert the getAsset wiring
on a scratch branch) and passes on current. Commit on the working branch; delete the scratch branch.
Then add to CLAUDE.md: no bake-path fix without a local-asset round-trip test. Done when the row reads
guarded and fails-on-revert is verified.
```

**Strength:** Worth exploring (one concrete past silent regression with no guard; the fix category is
well-defined).

---

## Issue 17 — The embed reader silently drops every whole-object note past the first `[re-run 246550d]`

**Status:** queued

**Symptom.** `packages/render-mount/src/read-mount.ts:264-268` `partitionWholeObject` collects ALL
whole-object notes but `applyAnnotations` draws only `const whole = wholeObjects[0]` as a clickable
frame (the code comment at :266 asserts "an object carries at most one whole-object note"); indices
1..n get neither a region shape (`:86-96`) nor a frame → unreachable. But a whole-object note is a
bare-canvas-IRI target OR a ≥75%/flagged region (ADR-0018), so an object can legitimately carry 2+
(two bare-canvas comments, or a bare note plus a large highlighted region). The `<archie-viewer>`
reader (`element.ts` #renderReader) renders only the reader surface + topbar — NO note list — so a
frame click is the only path to a note. The full viewer does NOT lose them (`Reader.svelte:181` keeps
the whole array in list/detail). Net: any object with 2+ whole-object notes silently loses all but
one, only in the embed.

**Rungs.** L1↔L2 friction: an ordinary authored state (multiple whole-object notes) the embed read
path never handles; the embed lacks the full viewer's note-index safety net.

**Why it's high-leverage.** The embed is a distribution surface (Direction 3, ADRs 0019-0022); a
reader embedding an exhibit loses annotations with no error and no second path. Either cycle the frame
through `wholeObjects` or give the embed a minimal note list. Distinct from Direction 3 (which is
about the SNIPPET emitting only `src`) — this is note *reachability inside* the embed reader.
*Lesson: negative testing — the multiplicity case (`length > 1`) is an ordinary state the happy path
skips; the demo has one note per object, the product doesn't.*

**Loop.** Negative-space over the embed read path's note-multiplicity cases. Ledger
`ledgers/NEGSPACE.md` (new section — Issue 7's NEGSPACE covered the six INGEST flows; this is the
embed READ path, a different surface).

**Run it:**

```
For the <archie-viewer> embed read path, probe the note cases it does NOT handle: an object with 2
bare-canvas whole-object notes, a bare note + a ≥75% region note, and confirm what the full viewer
does with the same tree. Ledger ledgers/NEGSPACE.md (embed-read section): case | actual (embed) |
actual (full viewer) | verdict | fix commit | retest. Probe a LOCAL build with a synthetic exhibit —
never live. Fill every actual before fixing — silently dropping notes is a fail; a visible way to
reach every whole-object note is a pass. Then fix (cycle the frame through wholeObjects, or give the
embed reader a minimal note list) — read-mount.ts:264-268. Done when every whole-object note is
reachable in the embed and the retest passes.
```

**Strength:** Worth exploring (specific, file:line-anchored; narrow but real silent data loss).

---

## Issue 18 — `App.svelte` (2179 lines) remains a god-orchestrator; the persisted-pref localStorage idiom is copy-pasted `[re-run 246550d]`

**Status:** queued (untracked; Issue 11 explicitly does not own App.svelte structure)

**Symptom.** `apps/studio/src/App.svelte` is 2179 lines with 11 raw `localStorage` get/set calls.
Five prior store extractions (exhibit-session, binding-store, publish-flows, ingest-flows,
library-meta) left App still directly implementing several self-contained concerns: the
persisted-UI-pref localStorage try/catch idiom recurs across `:70` (narrative-first-add), `:462-463`
(aside width/collapsed), `:477` (editor panel), `:497` (note-pinned) — each a hand-rolled
getItem/setItem+catch cluster; the whole ⌘K cite-into-note flow
(`requestCite/insertCite/citeIntoComment/requestVisualCite/pickVisualCite` ~1103-1150); note-drag
popover positioning (`noteDragDown/Move/Up` ~425-452); and marker-style computation (`markerStyleOf`
~846-918). Template+styles run ~1290-2179.

**Rungs.** L2↔L3 friction: a god-module fusing several nameable, self-contained concerns; the
localStorage idiom is one concern implemented several ways (a canonicalization target).

**Why it's high-leverage.** The repeated localStorage try/catch is a clean canonicalization (one
`persistedPref(key)` helper); the cite-flow and note-drag clusters each read a small nameable slice
of state — natural next extractions on the exact DOMINO-cut pattern the codebase's own comments
already anticipate ("worklist 0.3 cut 1/2", "DOMINO cut"). Honest caveat: this confirms/prioritizes
an implied direction the code foresees rather than discovering an unknown — but there is NO tracked
issue for it, and Issue 11 (scale/perf) explicitly does not own App.svelte's structure. *Lesson:
canonicalization — every second way to do the same job (here, persist a UI pref) doubles the ways the
next change can go wrong.*

**Loop.** Canonicalization of the localStorage idiom first (lowest-risk, highest-repetition), then
peel the cite-flow and note-drag clusters into owning modules under tests. Ledger `ledgers/CANON.md`
(new section — App.svelte persisted-pref idiom; Issue 5's CANON covered the archive-open seam).
Depends on Issue 12 (svelte-check) landing first, so the extractions have a real type gate.

**Run it:**

```
App.svelte does UI-pref persistence several ways. Pick the winner: one persistedPref(key) helper
(get/set/remove with the try/catch idiom once). Ledger ledgers/CANON.md (App-pref section): losing
call site | file | migrated commit | tests green. Enumerate every localStorage cluster BEFORE
migrating any (App.svelte :70, :462-463, :477, :497); then migrate them all under the studio test
suite, committing as you go. At zero losing call sites, optionally peel the ⌘K cite-flow (~1103-1150)
and note-drag positioning (~425-452) into owning modules — each its own phase, ≤1 concern per commit,
verify then stop. Done at zero raw-localStorage-idiom call sites and the persistedPref helper the one
way to persist a studio UI pref.
```

**Strength:** Worth exploring (verified: 2179 lines, repeated localStorage idiom; but self-anticipated
by inline comments — prioritization, not discovery).

---

## Issue 22 — Two Studio tabs on one library: zero cross-tab write coordination, last-writer-wins silently `[re-run 332798b]`

**Status:** done 2026-07-17 — merged to main `847c6a8`; ledger: ledgers/TABS.md. Cross-tab rows remain needs-manual-verify (human two-tab walk; steps in the ledger). Single-writer via
`writer-lock.svelte.ts` (navigator.locks, BroadcastChannel fallback) gating `enqueueSave` — second
tab gets a read-only banner + "Take over editing", auto-promotes when the writer closes (`e81f38a`);
recents lost-update fixed via storage-event reconcile (`5a672b5`). 284 studio tests, svelte-check
0 errors.

**Symptom.** OPFS is origin-shared across tabs; the working store writes the fixed path
`archie-demo-project` (`apps/studio/src/store.ts:23`). The save-queue serializes per TAB (module
singleton, `save-queue.svelte.ts:13`); grep-verified this run: no `navigator.locks` anywhere in
apps/studio, and the only `BroadcastChannel` is the viewer live-preview signal
(`library-meta.svelte.ts:17-18`) — no write coordination. Two tabs editing the same library
interleave full-projection writes over the same files: last-writer-wins at file granularity, no lock,
no generation counter, no detection, no warning. Same family one level down: `saveRecents`/
`saveLastBinding` (`binding.ts:124-150`) overwrite whole localStorage keys from a boot-time snapshot —
a recent added in tab B is dropped when tab A next saves.

**Rungs.** L1↔L2: a local-first tool whose implicit promise is "your files are safe on your machine"
silently eats edits in an ordinary browser situation (two tabs).

**Why it's high-leverage.** Silent, cause-invisible loss with a standard fix: a Web Lock held by the
writing tab plus a second-tab read-only/take-over UX (or a BroadcastChannel generation signal).
*Lesson: single-writer discipline — shared storage without a lock is a race you've already lost; the
browser ships the primitive (navigator.locks).*

**Loop.** Negative-space probe, then fix. Ledger `ledgers/TABS.md`.

**Run it:**

```
Probe Archie Studio's two-tab behavior on a LOCAL dev run (node scripts/start.mjs): open the same
OPFS library in two tabs, edit different exhibits in each, then the same exhibit; observe file-level
clobbering (store.ts:23 fixed path; per-tab save-queue save-queue.svelte.ts:13; no navigator.locks,
no coordinating BroadcastChannel — verified). Ledger ledgers/TABS.md: case | actual | verdict | fix
commit | retest. Fill every actual before fixing. Then implement single-writer discipline: acquire a
navigator.locks lock per library at open; a second tab gets read-only or a take-over prompt (pick
with reasons; note the Tauri webview and FSA folder bindings in the matrix — a folder can also be
bound in two windows). Include the localStorage recents lost-update (binding.ts:124-150) as its own
row (read-merge or storage-event reconcile). One fix per commit, studio tests per fix. Done when
every row reads pass and a second tab can no longer silently overwrite the first's edits.
```

**Strength:** Strong (structural evidence grep-verified; the clobber follows from verified facts —
probe confirms rather than discovers).

---

## Issue 25 — The folder mirror trusts disk it never verifies: torn-manifest asymmetry, no cross-file ordering, external changes overwritten blind `[re-run 332798b]`

**Status:** done 2026-07-17 — rows c/d/e merged via `847c6a8` (ledger ledgers/MIRROR.md), rows a/b via `516962e`: (c) mirror generation stamp `.archie-mirror.json` — external
change pauses autosave with "changed outside Archie" (`957a541`); (d) folderFs invalidated on write
failure + "reopen the folder" guidance (`2ec1275`); (e) not-reachable — asset names are
per-exhibit-unique; a false "ids minted fresh" premise corrected in comments, optional monotonic
nextObjectId hardening handed back for render-core (`c60b4f4`). Rows a/b fixed on branch
`tend/read-staleness`: (a) buildImageIndex now propagates a torn manifest instead of silently
omitting the exhibit, reconciled with loadLibrary under the absent-vs-failed policy (`8baf503`);
(b) the marker/generation is the LAST write — a torn publish has no current marker and is refused
(`cf72c9e`). All five rows of this issue now have fixes on branches.

**Symptom.** (a) `fsJsonSource.getOptional` swallows ALL errors to null (`publish/read.ts:44-48`), so
`buildImageIndex` (`iiif/image-index.ts`) silently drops a torn `manifest.json`'s exhibit from
images.json, while `loadLibrary` reads the same file with `src.get` and hard-throws (`site.ts:582`) —
one corrupt file, two policies: invisible omission vs total library-open failure ("isn't an Archie
library"). (b) `publishLibrary` has per-file atomicity but no cross-file ordering discipline: the
marker `archie.json` is written FIRST (`site.ts:254`), so a torn tree still passes marker validation;
`images.json` lands last (:543). Bounded: the OPFS working copy is source of truth and the next
session's first autosave forces a full folder resync (`binding-store.svelte.ts:107-116`) — the
exposure is the window until it, and any reader (gen-published, a colleague opening the folder)
inside that window. (c) Once `folderResynced`, the incremental mirror rewrites only dirty exhibits
and trusts the on-disk manifest (`publish-flows.svelte.ts:179-182`) with no mtime/generation check —
an external writer mid-session (git pull, Dropbox, another app) yields a mixed tree: dirty parts from
memory, the rest from the external writer, no reconciliation. (d) The cached `folderFs` handle is
never invalidated on failure (`binding-store.svelte.ts:85-90` unconditional short-circuit) — write
failures do reach saveStatus via the queue, but every retry hits the dead handle and nothing tells
the user the only recovery is close/reopen. (e) Conditional, unconfirmed: the removed-objects prune
deletes `{slug}/assets/{assetName}` (`site.ts:287-293`) — if two objects could share an asset name
and one is removed while the exhibit's write skips the asset pass, the surviving manifest points at
a deleted file; whether imports can ever mint a shared name needs checking.

**Rungs.** L3↔L4: the mirror's consistency model exists only as an unchecked assumption.

**Why it's high-leverage.** The bound folder is the format users point OTHER tools at (git, sync,
gen-published) — exactly where torn/mixed trees escape the app's self-healing. A tree-generation
marker written LAST (not first) + one read policy for torn manifests + a cheap external-change check
closes all four windows. *Lesson: mirrors need fences — a replica you never verify is a second source
of truth you didn't ask for.*

**Loop.** Negative-space matrix over the mirror. Ledger `ledgers/MIRROR.md`.

**Run it:**

```
Probe the Studio folder mirror's consistency windows on a LOCAL run with a scratch folder. Ledger
ledgers/MIRROR.md: case | actual | verdict | fix commit | retest. Rows: (a) torn {slug}/manifest.json
→ buildImageIndex silently omits the exhibit (read.ts:44-48 getOptional swallows all errors) while
loadLibrary hard-throws on the same file (site.ts:582) — pick ONE policy (surface the corruption,
name the file); (b) interrupted publish → marker archie.json written first (site.ts:254) means a torn
tree still validates — move the marker (or a generation stamp) to LAST write; (c) external change
between autosaves → incremental mirror (publish-flows.svelte.ts:179-182) overwrites blind — add a
cheap generation/mtime check and a "folder changed outside Archie" prompt; (d) revoked/moved folder →
cached folderFs never invalidated (binding-store.svelte.ts:85-90) — null it on write failure and say
"reopen the folder" in the surfaced error; (e) determine whether two objects can share an asset name
(import naming in ingest-flows) — if yes, the prune (site.ts:287-293) vs skip-asset-pass interaction
leaves a manifest pointing at a deleted file; if no, record not-reachable. Fill every actual before
fixing; simulate faults (kill the
tab mid-write via a delaying fs wrapper, edit the folder externally) — never live data. One fix per
commit; studio + render-core tests per fix. Done when every row reads pass and a torn or externally
modified tree is detected, named, and recoverable instead of silently mixed.
```

**Strength:** Worth exploring (each window verified in-file; severity bounded by the resync
self-heal, which is itself now recorded).

## Directions

### Direction 4 — The reading-MODE axis is fully scaffolded and read by nothing `[re-run 246550d]`

**Status:** queued

**Surplus.** `packages/render-core/src/model/model.ts:43` `readingFamily(layout)`, `:53`
`isValidMode(_layout, mode)` — whose body is literally `return mode === undefined` and whose
`_layout` param is prefixed-unused. Repo-wide, `isValidMode`/`readingFamily`/`ReadingFamily` appear
ONLY in `model.ts` + tests — no production caller. `Exhibit.mode` (documented `:179` "Unused in v1")
is written through serialization (`publish/working.ts:145,:183`) but never READ to change any
projection or render. `model.ts:141` names it "the §42 reading-MODE axis."

**Rungs.** L1↔L4 surplus: a whole authoring axis (pacing/mode — slideshow, scrollytelling) modeled +
validated + serialized at L4, exposed by nothing at L2, absent from the v1 purpose at L1.

**Who feels it.** A curator wanting pacing control over how an exhibit reads; a maintainer carrying a
validator whose `_layout` param encodes a v1.1 family-binding rule its body ignores.

**Intent.** Designed-latent — `model.ts:179` "Unused in v1 (no mode is set)" and the §42 section
comment show the axis was deliberately pre-built and green, awaiting a consumer. Disjoint from
Direction 2 (spine provenance) and Issue 11 (scale).

**Loop.** Headroom audit scoped to the reading-mode axis (a pinned/unconstructed dimension). Ledger
`ledgers/HEADROOM.md`. Done: the axis's intent verdicted (build a consumer, or prune the dead
`_layout` and demote `mode`) — nothing built or pruned in-loop.

**Run it:**

```
Find every dimension the reading-mode axis declares but the product pins/omits: model.ts:43
readingFamily, :53 isValidMode (body ignores _layout), :179 Exhibit.mode (written at working.ts:145/
:183, read nowhere). Ledger ledgers/HEADROOM.md: dimension | declared | reached | pinned/omitted at |
intent | verdict | commissioned as. Fill declared-vs-reached with grep evidence — a second full pass
must add no rows; read intent from model.ts's §42 comments, ADR-0005 (narrative-section model), and
git history. Build, unpin, and prune nothing. Then bring the axis for a verdict: pursue (commission a
spec interview for a mode consumer), park, or reject (queue the validator/field for a deletion sweep).
Done when the row holds a verdict and its reason.
```

**Strength:** Worth exploring.

### Direction 5 — A no-eval read-only mount exists but is confined to the embed; the flagship viewer still ships the eval-requiring editor mount for pure reading `[re-run 246550d]`

**Status:** queued

**Surplus.** Two implementations of "render regions over OpenSeadragon read-only + hit-test" coexist:
(1) `createMount` (`render-mount/src/mount.ts:74` — Annotorious/PixiJS/`new Function` eval) and (2)
`createReadOnlyMount` (`read-mount.ts`, exported at `index.ts:18` — explicitly "NO Annotorious/PixiJS,
NO unsafe-eval," DOM-SVG). The flagship `apps/viewer` (`published.ts` "the real deployed-consumer
path") mounts `createMount` via `Canvas.svelte:122` with drawing NEVER enabled; only the embed
(`archie-viewer/src/reader.ts`) uses the no-eval mount. `index.ts:17` even labels the split "Phase 0
boundary … the editor createMount seam above is untouched."

**Rungs.** L3↔L4 surplus: the clean no-eval seam (ADR-0019) is built and shipping, but the split was
drawn so the flagship inherits the heavyweight eval-requiring mount for a canvas it never lets the
reader edit.

**Who feels it.** The published static site, which per `.claude/rules/tauri-csp.md` carries
`script-src 'unsafe-eval'` + the PixiJS bundle solely for an editor canvas the reader can't use;
widening the read-only surface would let the flagship shed eval and collapse two render impls to one.

**Intent.** Designed-latent — ADR-0019 drew the seam and it ships in the embed. Straddles
direction/handoff: the capability is BUILT, but the flagship can't drop-in adopt it —
`ReadOnlyMountSurface` (`read-mount.ts:31-42`) omits `setStyle/setFrame/markerScreenRects/fitRegion`
that `Reader.svelte` relies on. Realizing the win requires BUILDING those four methods →
**handed-to-graft: flagship no-eval migration**.

**Loop.** Capability-reach diff over the two mount implementations (which surfaces each read path
uses, what the read-only surface would need). Ledger `ledgers/CAPABILITY.md` (new "mount-seams"
section). Done: the migration's reach + the four missing methods verdicted — nothing built.

**Run it:**

```
List every read-render path the two mounts serve: createMount (mount.ts:74, eval/PixiJS) via
Canvas.svelte:122 in apps/viewer, and createReadOnlyMount (read-mount.ts, no-eval) via
archie-viewer/reader.ts. Ledger ledgers/CAPABILITY.md (mount-seams section): operation | defined at |
user path | gate | intent | class (reachable / redundant-impl / orphaned) | verdict | commissioned
as. Record what ReadOnlyMountSurface (read-mount.ts:31-42) omits vs what Reader.svelte needs
(styleOf/frame/markerScreenRects/focus→fitRegion). Read intent from ADR-0019 and index.ts:17's "Phase
0 boundary" comment. Build nothing. Then verdict the flagship migration: pursue (commission a graft
build brief for the four presentation methods + re-point Canvas.svelte, to drop unsafe-eval + PixiJS
from the published site), or park (accept the eval cost, record why). Done when the seam holds a
verdict and its reason.
```

**Strength:** Worth exploring (verified two-impl split + verified CSP/bundle cost; the flagship
migration is a build, handed to graft).

### Direction 6 — `shouldRenderGallery(Library)`: a tested author-shape twin of a wired rule, zero production callers `[re-run 246550d]`

**Status:** queued

**Surplus.** `packages/render-core/src/iiif/exhibits.ts:74` `shouldRenderGallery(library: Library)`
and `:85` `shouldRenderGalleryFromJson(ex: ExhibitsJson)` encode the identical collapse rule
`!(single && !hasFraming)` on two shapes. The FromJson twin has 3 live call sites (all
`ViewerShell.svelte`); the Library-shape twin has ZERO production callers (only a `model.ts:194`
prose mention + its own def/tests). The rule is duplicated across two shapes, not shared, so the dead
twin can silently drift from the live one.

**Rungs.** L2↔L3 surplus: a decision rule pre-wired in an author-shape variant whose only consumer
(an in-Studio gallery/preview) is not built.

**Who feels it.** An in-Studio preview that would decide gallery-vs-single before publish — the
author-shape half was pre-wired for it. Its consumer (in-studio preview) is already a graft handoff
in `DIVERGENCES.md`, so the latent code waits on a not-yet-built view.

**Intent.** Designed-latent (author-shape + published-shape twins shipped, only the published half
mounted) — but the more actionable framing is the drift risk of a duplicated rule with a dead half.

**Loop.** Fold into Direction 4's headroom audit as one extra row, OR a small deletion-sweep decision
(a feature-shaped dead export → verdict before touching). Ledger `ledgers/HEADROOM.md` (shared).
Done: the twin classified — share the rule across both shapes (kill the drift), delete it until its
consumer is built, or keep-for-handed-off-preview — with the reason recorded.

**Strength:** Speculative (its only consumer is an already-handed-off build; drift-risk is the real
hook).

### Direction 7 — Marginalia engine + `MarginColumn`: built, headless-tested, publicly exported, reverted, zero consumers `[re-run 246550d]`

**Status:** queued (already tracked inline, not in the named backlog)

**Surplus.** `packages/render-svelte/src/MarginColumn.svelte` (138 LOC) is in render-svelte's
package.json exports map but has ZERO importers (the only three "MarginColumn" hits are prose
comments). Its solver `render-core layoutMarginalia` has only headless tests, zero live callers.
`App.svelte:734-737` documents why: "Marginalia cuts D+E reverted 2026-06-11 on user review — does
not look good. The ENGINE survives headless-tested for a future presentation redesign." Sibling
export `ResizeDivider` is used in 4+ places — `MarginColumn` is the odd one out.

**Rungs.** L2↔L4 surplus: a built+tested presentation feature, reverted at the UI, kept as a live
PUBLIC export (a stability/maintenance cost for zero delivered behavior).

**Who feels it.** A maintainer paying public-API-stability + maintenance on ~140 LOC + a headless
solver + Canvas/mount plumbing (rectIds/markerScreenRects) for a reverted feature.

**Intent.** Designed-latent but explicitly reverted on user review; already tracked inline as
"IMPROVEMENT-WORKLIST ledger + marginalia-redesign seeds issue" — KNOWN, just not in ISSUES.md.
Decision is binary: wire back for the redesign, or demote from render-svelte's public exports and
archive.

**Loop.** Deletion-sweep decision (a feature-shaped dead export → verdict before deleting): wire-back
vs demote-and-archive, with the redesign timeline read. Ledger `ledgers/DEADWOOD.md`. Done: the
export's fate verdicted — nothing deleted in-loop.

**Strength:** Speculative (already inline-tracked; recorded here so the named backlog reflects it).

## Top recommendation

**(Re-run 332798b, 2026-07-17 — data-integrity pass; supersedes the 246550d recommendation below.)**
Gate: **this pass found data-loss and live-wrong-data findings** — Issues 19 and 20 — so per
SHARED.md the platform is burning until they close; no growth recommendation until then.
*(Resolved same day: Issues 19–26 all done and merged; gate clear. The standing recommendation is now
the two commissioned pursue specs — Direction 9's embed-parity spec first (must-ship attribution),
Direction 8's bakeTiles toggle second — plus the human manual-verify walks in ledgers/TABS.md and
ledgers/MIRROR.md.)*

**Top recommendation → Issue 19 (annotation persistence: torn page silently empties an exhibit).**
It is the single worst corruption seam found: index-before-pages write order, all-or-nothing read,
and a catch that renders corruption as "nothing authored yet" — with a compounding second save that
orphans every old page. Two explorers converged on it independently; the fix is small, local, and
testable (pages first, index last, per-page-tolerant read, corrupt ≠ empty).

**Quickest live-defect kill → Issue 20 (images.json merge drift).** Confirmed wrong in the committed
tree right now (wall indexes 2 of 8 exhibits); one merge fix, one regression test, one tree regen.

**Root-cause structural fix → Issue 21 (unguarded field-carry boundaries).** The recurring bug class
behind four past incidents and three live drops; closing it moves the whole category to compile time.
Issues 19→20→21 in that order is the recommended sequence.

**Top direction:** none Strong this pass; both new directions (8, 9) are Worth exploring and gated
behind the Issue 19/20 fixes anyway.

---

## Top recommendation (prior, re-run 246550d — superseded)

**(Re-run 246550d.)** Gate: **not** a burning platform — all suites green (render-core 723 tests +
`tsc --noEmit`; studio 157 tests + `tsc --noEmit`), no open security finding, no data-loss risk. The
original Top recommendation (Issue 1 tripwire / the NUL byte) is `done`.

**Top recommendation → Issue 12 (svelte-check gate hole).** It is the tripwire-completion of Issue 1
and the platform-health item every other studio fix wants behind it: today CI's green check asserts
type-safety over `apps/studio`'s 66 `.svelte` files and delivers none, so App.svelte's 30+ type
errors — and any regression in the in-flight Issue 11 WIP — land unseen. Closing it protects
everything downstream, including the uncommitted Phase-1 work.

**Strongest new user-facing fix → Issue 13 (collaboration summary is inert).** The one Strong
friction touching a shipped feature: the ⑧ banner can never attribute a named editor because
`identity` has no writer. Narrow fix (mount identity capture); sharpens Direction 1's pursue and makes
Direction 2's `lastEditor` dark data real in the same wire. **Largest open improvement overall
remains Issue 11** (scale/perf) — already mid-execution, Phase-1 green-but-uncommitted on `main`.

**Top direction:** no NEW direction is Strong (Directions 4–7 are Worth-exploring/Speculative); the
standing Strong directions (1–3) are already verdicted **pursue**. Among new surplus, **Direction 5**
(the no-eval mount confined to the embed) carries the most weight — a real CSP/bundle cost the
flagship pays for a capability it already half-owns — but its payoff is a graft build.

---

## Decided

Terminal rows, collapsed after their lessons were stored (SHARED.md backlog compaction; full text in
git history). Do-not-resurrect set for fresh re-runs.

- Issue 1 CI gate — done — 2026-07-05 — ledgers/GATE.md
- Issue 2 operational docs drift — done — 2026-07-05 — ledgers/CLAIMS.md
- Issue 3 tracked artifacts / NUL byte — done — 2026-07-05 — ledgers/ARTIFACTS.md
- Issue 4 silent persistence failures — done — 2026-07-05 — ledgers/SILENCE.md
- Issue 5 untrusted-zip open path ×2 — done — 2026-07-05 — ledgers/CANON.md
- Issue 6 IIIF projection untested — done — 2026-07-05 — ledgers/COVERAGE.md
- Issue 7 ingest negative space — done — 2026-07-05 — ledgers/NEGSPACE.md
- Issue 8 fresh-clone LFS loss — done — 2026-07-05 — ledgers/COLDSTART.md
- Issue 9 showroom stranded — done — 2026-07-05 — ledgers/SHOWROOM.md
- Issue 10 methodology doc drift — done — 2026-07-05 — ledgers/METHOD.md
- Issue 11 scale/gallery degradation — done — 2026-07-06 — ledgers/SCALE.md
- Issue 12 svelte-check gate hole — done — 2026-07-06 — ledgers/GATE.md §Issue-12
- Issue 15 dependency audit — done — 2026-07-05 — ledgers/DEPS.md
- Issue 19 annotation-store torn-page loss — done — 2026-07-17 — ledgers/PERSIST.md (merge 1cb5440)
- Issue 20 images.json merge drift — done — 2026-07-17 — ledgers/BAKE-INDEX.md (merge c55d056)
- Issue 21 unguarded field carries — done — 2026-07-17 — ledgers/CARRY.md (merge 1cb5440)
- Issue 23 read-policy incoherence — done — 2026-07-17 — ledgers/READPOLICY.md (merge 516962e)
- Issue 24 publish-generation staleness — done — 2026-07-17 — ledgers/STALENESS.md (merge 516962e)
- Issue 26 assets bypass save-queue — done — 2026-07-17 — ledgers/ASSETQ.md (merge 847c6a8)
- Direction 1 collaboration machinery — done (pursue) — 2026-07-05 — ledgers/CAPABILITY.md
- Direction 2 version-history dark data — done (pursue) — 2026-07-05 — ledgers/DARKDATA.md
- Direction 3 embed snippet generator — done (pursue) — 2026-07-05 — ledgers/CAPABILITY.md
- Direction 8 bakeTiles toggle — done (pursue) — 2026-07-17 — ledgers/HEADROOM.md
- Direction 9 embed parity (incl. must-ship attribution) — done (pursue) — 2026-07-17 — ledgers/CAPABILITY.md §embed-parity

Left live deliberately: Issues 22 and 25 (fixes merged 847c6a8/516962e but needs-manual-verify rows
outstanding — two-tab walk, folder-changed-outside prompts; steps in ledgers/TABS.md and
ledgers/MIRROR.md); Issues 13, 14, 16, 17, 18 and Directions 4–7 (queued, untouched this run).
