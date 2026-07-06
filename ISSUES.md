# ISSUES — Archie tend backlog

Generated 2026-07-05 by a tend diagnosis. Commit examined: `2091557` (main).
Evidence gathered by two codebase walks (core packages + apps/ops surface); every
symptom below was verified against files on disk, not inferred. Issues are ordered
by leverage; directions by strength. Each **Run it** block is self-contained —
paste it into a fresh session with no skill loaded.

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

---

## Issue 1 — CI is deploy-only and typecheck is red on main

**Status:** done 2026-07-05 — ledger: ledgers/GATE.md

**Symptom.** `.github/workflows/deploy.yml` is the only workflow; it builds
(`scripts/build-gh-pages.sh`) and deploys Pages — no vitest, no tsc, no
`astro check`. Meanwhile `pnpm typecheck` from root **fails (exit 2)**:
`packages/render-core/src/link/link-object.test.ts:30-31` (TS2339: `objectId`/`noteId`
missing on `ViewerRoute`), `packages/render-core/src/spine/wholeobject.test.ts:48`
(TS2352), and `packages/render-mount/src/mount.ts:251` (TS2345 — HANDOFF said :238,
"pre-existing"), which cascades so `render-mount`, `render-svelte`, and
`archie-viewer` all fail typecheck too. `apps/studio/package.json` has no
`typecheck` script at all. The ~1163-test suite runs only on developer machines.

**Rungs.** L2↔L4: the README promises "both must pass" for PRs while nothing
automated has ever enforced it, and the check is currently failing.

**Why it's high-leverage.** Every other issue's fix wants a green gate to land
behind; today a red typecheck deploys without complaint. *Lesson: continuous
integration — a check that doesn't run automatically will stop running, and a
gate never seen to fail is decoration, not protection.*

**Loop.** Tripwire installation. Ledger `ledgers/GATE.md`. Phase 1 inventory
checks (test, typecheck per package, astro check, build); phase 2 repair each to
green locally (the 4 typecheck failures above, plus adding a studio typecheck
script); phase 3 wire into GitHub Actions on push; phase 4 trip each wire once
with a planted defect on a branch. Done: every check green in CI on main and
each witnessed red once.

**Run it:**

```
Set up CI for this repo (GitHub Actions; a deploy workflow already exists at
.github/workflows/deploy.yml — add checks, don't disturb deploy). Ledger
ledgers/GATE.md: check | command | local result | CI wired | tripped red | commit.
Inventory every check the repo can run: pnpm typecheck (per package — note
apps/studio has no typecheck script; add a minimal one), per-app pnpm exec vitest
(root vitest binary fails rune tests — run per package/app), astro check for
apps/viewer, and the gh-pages build. Known-red right now: render-core
link-object.test.ts:30-31 (ViewerRoute objectId/noteId), spine/wholeobject.test.ts:48
(TS2352), render-mount mount.ts:251 (TS2345, cascades to render-svelte and
archie-viewer). Make each check pass locally first — one fix per commit — then
wire them into a CI job on every push (Node 22+, pnpm 9, LFS checkout), then
prove each wire trips: one deliberate defect per check on a branch, watch it go
red, revert. Done only when every check is green on main AND each has been seen
to fail once.
```

**Strength:** Strong.

---

## Issue 2 — The operational docs actively misdirect

**Status:** done 2026-07-05 — ledger: ledgers/CLAIMS.md (HANDOFF.md rewritten to current state;
README's stale test count fixed; IMPLEMENTATION-STRATEGY.md's deferred-work registry synced —
4 items removed as shipped, 4 stale figures/claims corrected. One row left blocked-on-verdict
[README's Collaboration claim, per this issue's own instruction — see Direction 1] and one
left unconfirmed [a marker-highlight bugfix with no evidence either way]. The doc's own
process/methodology sections, out of this issue's scope, logged as new Issue 10.)

**Symptom.** Three documents contradict the code they describe:
- `HANDOFF.md` (2026-06-21) says the embed feature is UNCOMMITTED on
  `feat/archie-viewer-embed`, `packages/archie-viewer/` untracked, ADRs 0019-0021
  untracked, "commit required" — all of it shipped to main (`c471b93`, v1.1;
  26 tracked files in `packages/archie-viewer/`; ADRs 0019-0022 tracked).
- `docs/IMPLEMENTATION-STRATEGY.md` §"Deferred-work registry" (dated 2026-05-25)
  lists as pending: IIIF Content-State wiring (shipped — ADR-0022, `content-state.ts`),
  viewer empty/error states (shipped — `EmptyHall.svelte` mounted in `ViewerShell`),
  search "out of v1" (shipped — `SearchOverlay.svelte` mounted in `ExhibitView`),
  narrative section-authoring "next phase" (shipped — `NarrativeEditor.svelte`
  lazy-mounted at `App.svelte:88-89`). README calls this file "the canonical
  remaining-work list."
- `README.md:226` advertises "conflict-card resolution" as a shipped Collaboration
  feature; `MergeReview.svelte` is imported by nothing (see Direction 1).

**Rungs.** L1↔L2: the purpose-level documents describe a different product than
the code implements — in both directions.

**Why it's high-leverage.** These are exactly the files a fresh session (or
contributor) reads first; following HANDOFF today risks re-doing or reverting
shipped work. *Lesson: documentation drift — a README that lies is worse than
none; every reader, including the AI next session, builds on the lie.*

**Loop.** Claim-vs-reality diff over `HANDOFF.md`, `README.md`,
`docs/IMPLEMENTATION-STRATEGY.md`. Ledger `ledgers/CLAIMS.md`. Done: re-running
the full diff finds nothing.

**Run it:**

```
Extract every claim HANDOFF.md, README.md ("Features", "Status & roadmap",
"Known limitations"), and docs/IMPLEMENTATION-STRATEGY.md (the deferred-work
registry) make about what this app does or what work remains, and check each
against the code; also list what the code does that these docs never mention.
Known drift to seed the diff: HANDOFF claims the archie-viewer embed is
uncommitted (it shipped in c471b93); the deferred registry lists Content-State
wiring, viewer empty states, search, and narrative section-authoring as pending
(all shipped); README:226 claims conflict-card resolution ships (MergeReview.svelte
is mounted nowhere — log this row as blocked-on-verdict, see ISSUES.md Direction 1,
don't resolve it unilaterally). Ledger ledgers/CLAIMS.md: claim | where claimed |
what the code does | type (claimed-not-implemented / implemented-not-documented /
implemented-differently) | resolution | commit | recheck. Finish the whole diff
before resolving anything; then per row fix the code, fix the docs, or deprecate
(HANDOFF.md is superseded — archiving/rewriting it is a valid resolution) — one
commit each, rechecking the row after its fix. Done when re-running the full
diff finds nothing.
```

**Strength:** Strong.

---

## Issue 3 — Tracked artifacts that lie: a NUL byte, a `--output` file, twin bundles, stale reports

**Status:** done 2026-07-05 — ledger: ledgers/ARTIFACTS.md

**Symptom.**
- `apps/studio/src/App.svelte` (2147 lines, the studio's central component)
  contains exactly **one NUL byte** — present in the committed blob. grep,
  git grep, ripgrep, and the fff tools all treat the file as binary and silently
  return zero matches; every "grep is unreliable in this repo" experience traces
  to this byte. Verified: `tr -d -c '\000' < apps/studio/src/App.svelte | wc -c` → 1.
- A file literally named `--output` (113 KB, shell-redirect residue) is tracked
  at repo root (committed in `5d5bf50`).
- `dist/` at root duplicates `packages/archie-viewer/dist/` (same bundle files,
  hand-synced for the jsDelivr `@v1/dist` URL per `a656cda`) — two copies that
  can silently diverge.
- `anti-pattern-report.txt` (40 KB, 2026-06-22) is a committed one-shot lint dump
  that drifts the moment code changes; `node-compile-cache/` and
  `v8-compile-cache-1000/` sit at repo root.

**Rungs.** L3↔L4: repository structure that misleads both tools and readers about
what is source.

**Why it's high-leverage.** The NUL byte alone silently defeats every grep-based
tool — reviews, audits, and agents have been reporting false "0 matches" on the
most important studio file. *Lesson: dead-code elimination extends to artifacts —
tracked junk isn't free; it's text your tools reread, misparse, or silently skip.*

**Loop.** Deletion sweep adapted to tracked artifacts. Ledger
`ledgers/ARTIFACTS.md`. Done: zero accidental rows remain; every deliberate
artifact (root `dist/`) carries its reason and a sync-check.

**Run it:**

```
Audit every tracked file/directory at the Archie repo root that is not source or
docs: --output (shell-redirect residue, tracked), anti-pattern-report.txt
(committed one-shot lint dump), dist/ (hand-synced twin of
packages/archie-viewer/dist/ for the jsDelivr @v1/dist URL — deliberate, verify
the two copies are byte-identical), node-compile-cache/, v8-compile-cache-1000/,
gh-pages-dist/, plus the single NUL byte inside apps/studio/src/App.svelte
(verify with: tr -d -c '\000' < apps/studio/src/App.svelte | wc -c; it makes
grep/ripgrep/git-grep treat the file as binary). Ledger ledgers/ARTIFACTS.md:
artifact | tracked? | why it exists | class (accident / generated / deliberate) |
action | commit | verified. Classify everything before deleting anything; check
.gitignore covers the generated classes. For the NUL byte: locate it (grep -abo
$'\0' apps/studio/src/App.svelte), remove it with a byte-exact edit, then prove
the fix by grepping App.svelte for a known string (e.g. MergeReview should now
be findable-or-absent honestly) and run the studio tests (pnpm --filter
@archie/studio exec vitest run). One action per commit. For root dist/: keep or
replace with a build step, but record the sync rule either way. Done at zero
accident rows and every deliberate row carrying its reason.
```

**Strength:** Strong.

---

## Issue 4 — Silent failure on the persistence path

**Status:** done 2026-07-05 — ledger: ledgers/SILENCE.md

**Symptom.** Bare or degrading catches sit exactly where a local-first tool can
least afford them: `apps/studio/src/binding.ts:95`, `save-queue.svelte.ts:47`,
`store.ts:298` (bare catch-alls, no rethrow/log/surface — the "did my work
save?" path); `packages/archie-viewer/src/element.ts:254-261` renders an
**empty exhibit** on any open failure with only a console.error;
`apps/studio/src/ingest-flows.ts:446` catches every zip-open failure into one
generic alert, discarding the real reason (zip-bomb cap hit? marker mismatch?).
`apps/viewer/src/published.ts` probes degrade to null on any throw. Repo-wide
the 2026-06-22 anti-pattern report counted 24 catch-alls and 301 fire-and-forget
promises; the ones above were re-verified live.

**Rungs.** L2↔L4: the product promises "your work autosaves"; the implementation
can fail that promise without anyone finding out.

**Why it's high-leverage.** A swallowed save error in a no-server tool is data
loss with no support channel. *Lesson: observability — a swallowed failure still
happens; you've just agreed to learn about it from your users.*

**Loop.** Silence audit, blast-radius-ordered (save/binding first, ingest second,
viewer degrades last). Ledger `ledgers/SILENCE.md`. Done: every row surfaced or
reported, every forced failure observed landing.

**Run it:**

```
Find every error-handling site in the Archie studio and the archie-viewer element
— catch/except blocks, rejection callbacks, external calls with no failure branch.
Start from these verified sites but inventory exhaustively: apps/studio/src/
binding.ts:95, save-queue.svelte.ts:47, store.ts:298 (bare catch-alls on the
persistence path), ingest-flows.ts:446 (generic alert discards the real zip-open
reason — zip-bomb cap vs marker mismatch should read differently),
packages/archie-viewer/src/element.ts:254-261 (open failure renders an empty
exhibit, console-only), apps/viewer/src/published.ts fetchJsonOptional/
initLiveSource (degrade-to-null probes — some are by design; record the design
intent in-row rather than assuming). Ledger ledgers/SILENCE.md: site | trigger |
disposal today | should be | fix commit | forced check. Classify each — unhandled /
swallowed / logged-and-lost / surfaced / reported — fixing nothing; then fix so
every failure reaches a message the user sees or a log a human reads, persistence
(save-queue/binding/store) first. There is a toast layer in the studio (shipped
in e45f38b) — surface through it. Then force each fixed site's failure in a dev
run — a simulated fault (injected exception, corrupt zip fixture, unreachable
URL) counts; never fire real failures at live services — and confirm it lands
where the row says. Run per-app tests (pnpm --filter <app> exec vitest run) after
each fix. Done when every row reads surfaced or reported (or by-design, with the
design cited) and every forced failure was observed.
```

**Strength:** Strong.

---

## Issue 5 — The untrusted-zip open path exists twice

**Status:** done 2026-07-05 — ledger: ledgers/CANON.md

**Symptom.** `packages/archie-viewer/src/load.ts` (251 lines) and
`apps/viewer/src/published.ts` (318 lines) both define near-verbatim:
`openError()`, `openZipBytes()`, `openLibraryFromFile()`,
`SRC_MAX_BYTES = 256*1024*1024`, `openLibraryFromSrc()` (same cap logic, same
user-facing strings), and an HTTP-JSON source with the identical degrade comment.
Each file's header names the other as "donor." HANDOFF logged it as "tech debt —
not blocking." The divergence (instance-scoped vs module-global) is real but
bounded.

**Additional evidence (2026-07-05, from the Issue 4 silence audit, `ledgers/SILENCE.md`):**
a THIRD studio-side open path — `apps/studio/src/ingest-flows.ts`'s `openZip` — calls
`loadLibrary` (`render-core/publish/site.ts`) directly and never calls
`validateArchieMarker` at all, unlike the viewer's twin (`published.ts`'s
`openZipBytes` explicitly calls it after `ZipFilesystem.fromZip`). A wrong-schema
`.archie.zip` opened via the Studio's drag-drop gets whatever generic/parse error
`exhibits.json` produces instead of `NotAnArchieLibraryError`'s specific "different
version of Archie" message. Also: comparing the two `openError`-shaped functions
during that audit found they've already drifted in one more way — the viewer's
version passes `e.message` through for `instanceof Error`; the studio's did not
(now fixed locally in Issue 4's ledger, `a587471`, without merging the paths —
that's this issue's job).

**Rungs.** L3↔L4: one security-relevant concern (opening untrusted zips, with its
size caps and marker validation) implemented twice — a fix to one copy can
silently skip the other.

**Why it's high-leverage.** This is the trust boundary for hostile input; a
future hardening (cap change, marker rule) has to be remembered twice or it's a
vulnerability in one consumer. *Lesson: canonicalization — every second way to do
the same job doubles the ways the next change can go wrong; for security seams
it doubles the attack surface too.*

**Loop.** Canonicalization: pick the winner (likely a shared module in
`@render/core` or a new small package both consumers import, instance-scoped as
load.ts already is), enumerate every losing call site first, migrate under
tests, lock the rule. Ledger `ledgers/CANON.md`. Done: zero losing call sites
and the lock recorded.

**Run it:**

```
This codebase opens untrusted .archie.zip / published-tree sources two ways:
packages/archie-viewer/src/load.ts (instance-scoped) and apps/viewer/src/
published.ts (module-global) duplicate openError, openZipBytes,
openLibraryFromFile, SRC_MAX_BYTES, openLibraryFromSrc, and the HTTP-JSON source
near-verbatim (each header names the other as donor). Pick the winner with
reasons — note apps/viewer and packages/archie-viewer must not depend on each
other (README architecture contract: apps share only @render/* packages), so the
canonical copy likely lives in render-core or a shared package; the
instance-scoped shape (load.ts) is the more general of the two. Ledger
ledgers/CANON.md: losing call site | file | migrated commit | tests green.
Enumerate every losing call site BEFORE migrating any (beware: grep undercounts
until ISSUES.md Issue 3's NUL-byte fix lands); then migrate them all under tests
(pnpm --filter @archie/viewer exec vitest run and pnpm --filter archie-viewer
exec vitest run), committing as you go. Keep behavior identical — same caps,
same user-facing strings, marker validation still asserted before open. At zero
losing call sites, add the rule to CLAUDE.md: the untrusted-source open path
lives in one module; never copy it. Done at zero call sites and the lock recorded.
```

**Strength:** Strong.

---

## Issue 6 — The IIIF projection core is untested

**Status:** done 2026-07-05 — ledger: ledgers/COVERAGE.md (2 of the 4 flagged files were
false positives, already covered by `gallery.test.ts`; the real gaps — `presentation.ts`,
`query/body.ts` — got direct tests. Prior-art research also surfaced one real cross-scope
finding pursued to a tested fix: Canvas dimensions missing on a failed ingest-time probe,
IIIF Pres 3 §5.3 — see the ledger's "Row 1 resolution".)

**Symptom.** In `render-core`, the files with no test sibling include
`iiif/presentation.ts` (148 lines — the Presentation-3 Manifest/Collection
projection, the product's interop claim), `iiif/exhibits.ts` (89),
`iiif/collection.ts` (29), `query/body.ts` (10). render-core has 67 test files
overall — coverage is strong elsewhere (spine, fs, publish) which makes this
hole specific, not systemic.

**Rungs.** L2↔L4: "third-party IIIF tools can read your work directly" is a
headline behavior resting on the largest untested core file.

**Why it's high-leverage.** IIIF output is consumed by external viewers (Mirador,
UV) that fail silently on malformed manifests; regressions here are invisible to
Archie's own UI. *Lesson: test coverage — tests are executable memory; they let
you change code you no longer remember without re-understanding it first.*

**Loop.** Story-driven coverage climb scoped to `packages/render-core/src/iiif/`.
Ledger `ledgers/COVERAGE.md`. Done: every iiif/ file has behavior-asserting
tests and every exposed bug's row reads pass.

**Run it:**

```
In packages/render-core, the iiif/ projection files lack test siblings:
iiif/presentation.ts (148 lines — IIIF Presentation 3 Manifest/Collection
projection), iiif/exhibits.ts (89), iiif/collection.ts (29), query/body.ts (10).
Rank by how much the app depends on them (presentation.ts first — the published
manifests at apps/viewer/public/published/*/manifest.json are its output and
serve as reference fixtures for what correct output looks like). Ledger
ledgers/COVERAGE.md: file | behavior under test | before | after | bug exposed |
fix commit | retest. Write tests that assert what the code should do — valid P3
structure (type, items, annotation pages, Ranges for sections, requiredStatement/
rights passthrough, the archie:geo anchor) — never tests that merely touch lines;
follow the existing test idiom (*.test.ts alongside source, run via pnpm
--filter @render/core exec vitest run). When a test exposes a real bug, give it
its own row and its own fix commit. Done when every iiif/ file has a
behavior-asserting test sibling and every bug row reads pass.
```

**Strength:** Worth exploring.

---

## Issue 7 — The ingest boundary's negative space

**Status:** done 2026-07-05 — ledger: ledgers/NEGSPACE.md (8 real fail rows found across the six
ingest flows' 36-row matrix, all fixed: transcript import's silent no-op on unparseable/empty input,
a mid-flow exhibit-switch that could misdirect objects/notes to the wrong exhibit, and no byte cap
on 4 vectors including the IIIF-fetch gap this issue named. A 9th apparent fail — zip-open's leaked
"invalid zip data" string — turned out to be an already-decided Issue 4 row on recheck, not reopened.)

**Symptom.** The zip path is capped (`ZIP_LIMITS` 512 MB / 50k entries / 100×
ratio, `fs/zip.ts:29`) and `?src=` is capped (`SRC_MAX_BYTES`), but the remote
IIIF manifest fetch (`fetchManifest`, caller of `apps/studio/src/iiif-import.ts`)
has **no byte cap** — the one remote-input vector without a guard. The other
ingest flows (folder import, CSV import at `App.svelte:1585`, WADM import at
`:1591`) have alert-on-error but their invalid/empty/huge cases are unprobed.

**Rungs.** L2↔L4: user-facing import promises vs unguarded inputs at the trust
boundary.

**Why it's high-leverage.** Ingest is where hostile or merely broken input meets
the app; each unhandled case is a hang, a flood, or a silent wrong result.
*Lesson: negative testing — the happy path is the demo, the failure paths are
the product.*

**Loop.** Negative-space matrix over the studio's ingest flows. Ledger
`ledgers/NEGSPACE.md`. Done: every row passes — a clear error message passes, a
stack trace or hang doesn't.

**Run it:**

```
For every ingest flow in the Archie studio — IIIF manifest URL import
(apps/studio/src/iiif-import.ts + its fetchManifest caller), image-folder
import, .archie.zip open (ingest-flows.ts), CSV notes import (csv-import.ts),
WADM import, VTT/SRT transcript import — probe the cases it does NOT handle:
invalid input (malformed JSON/CSV, wrong file type), empty data, huge input
(note: fetchManifest has NO byte cap today, unlike the zip path's ZIP_LIMITS —
probe with a simulated oversized response, never a real one), remote service
down/404/non-JSON 200, double-submit, mid-flow interruption. Probe a local dev
run (node scripts/start.mjs both) with test fixtures — never the live deployment;
simulate dependency failures rather than causing them. Ledger
ledgers/NEGSPACE.md: item | case | actual | verdict | fix commit | retest. Fill
every actual before fixing anything — a clear error message passes; a stack
trace, hang, or silent wrong result fails. Then fix row by row, one commit each,
running the studio tests per fix. Done when every row reads pass.
```

**Strength:** Worth exploring.

---

## Issue 8 — Fresh-clone setup silently loses LFS

**Status:** done 2026-07-05 — ledger: ledgers/COLDSTART.md (sharper than originally framed: a plain
fresh clone actually gets working LFS hooks, auto-installed by git-lfs itself into `.git/hooks` — it's
running the repo's own `qa/hooks/install.sh` that silently regresses them, by pointing `core.hooksPath`
at a directory missing the untracked LFS hook files. Fixed by tracking those hooks, documenting
git-lfs as a prerequisite, and having `install.sh` confirm instead of staying silent. Re-rehearsed
from a second fresh clone end to end.)

**Symptom.** `core.hooksPath` is set to `qa/hooks` locally. The four untracked
files there (`post-checkout`, `post-commit`, `post-merge`, `pre-push`) are the
stock Git-LFS hooks that `git lfs install` dropped into the active hooksPath —
untracked, so they vanish on a fresh clone even after `qa/hooks/install.sh`
runs, while `deploy.yml` and the `libraries/*.archie.zip` assets depend on LFS
(a broken deploy from exactly this — missing LFS in checkout — was fixed in
`a0b6dc0`). Separately, the `qa/` gate (`gate.mjs`, `features.jsonl`) is wired
to nothing in CI.

**Rungs.** L2↔L4: the repo runs on this machine because of state the repo
doesn't contain.

**Why it's high-leverage.** The next clone (or contributor) gets a repo whose
pushes silently skip LFS objects — the class of failure that already broke a
deploy once. *Lesson: reproducible environments — if the app only runs on your
machine, you own a machine, not software; every setup step lives in the repo,
as automation before prose.*

**Loop.** Cold-start rehearsal scoped to clone→hooks→LFS→dev-servers. Ledger
`ledgers/COLDSTART.md`. Done: a fresh clone in a clean directory reaches working
dev servers and LFS-correct pushes with zero undocumented steps.

**Run it:**

```
In a clean directory, get Archie running from a fresh git clone — never a copy
of the working folder. Ledger ledgers/COLDSTART.md: prerequisite | where
consumed | documented? | stumble | fix commit | clean rerun. First inventory
every prerequisite the repo consumes: Node 22+ (README), pnpm 9+, git-lfs
(libraries/*.archie.zip are LFS-tracked; deploy.yml checks out with lfs:true),
core.hooksPath=qa/hooks (set by qa/hooks/install.sh — but the stock LFS hooks
post-checkout/post-commit/post-merge/pre-push in qa/hooks are UNTRACKED in the
original repo, so a fresh clone loses LFS hook wiring even after install.sh;
this is the known bug to fix — either track LFS-invoking hooks in qa/hooks or
have install.sh run git lfs install --hookspath-aware), and any seed/gen steps
(vite-node apps/viewer/scripts/gen-published.mts). Then rehearse: clone, follow
only committed files + README, reach node scripts/start.mjs both serving studio
and viewer, and verify git lfs status is functional — logging every stumble
verbatim and fixing nothing. Then fix per row — automation over prose — commit
per row (in the real repo, not the rehearsal clone), and re-rehearse from
scratch until a full run needs zero undocumented steps.
```

**Strength:** Worth exploring.

---

## Issue 9 — The showroom exhibit is stranded at ~80%

**Status:** done 2026-07-05 — ledger: ledgers/SHOWROOM.md (was actually ~95% done — a prior session
had already built most of it via Studio, exported to `apps/viewer/libraries/archie-library.archie.zip`,
but never finished or published it. Added the one missing object, its notes, the 21-section narrative,
and metadata, then published it. Along the way found and fixed 3 real pre-existing bugs the assembly
exposed: a broken source screenshot, `loadLibrary` silently dropping sections/readings on any round
trip, and `gen-published.mts` never wiring `getAsset` — the drop-folder publish mechanism had never
actually worked for a locally-authored image. One open item flagged, not resolved unilaterally: the
same zip's unrelated `assets` test-fixture exhibit will now also appear in the live gallery.)

**Symptom.** `docs/showroom/` holds the full prep — `exhibit.md` (4 readings,
21-section tour), 21 coordinate-free CSVs (87 rows, verified by `verify.mjs`),
`ASSEMBLE.md`, `SHOWROOM-NOTES.md` — and 21/21 screenshots exist in
`docs/screenshots/auto/`. But the ASSEMBLE step never ran: no `showroom/` in
`apps/viewer/public/published/`, no showroom fixture, and
`docs/plans/SHOWROOM-EXHIBIT-PLAN.md:104-110` still ends on "Open decisions
(gating)" that HANDOFF claims were decided.

**Rungs.** L1↔L2: a documented deliverable ("Archie annotates Archie" — feature
list, tutorial, and showroom in one) exists as prep but not as product.

**Why it's high-leverage.** It's the highest-value marketing/onboarding artifact
the project has designed, and it dogfoods CSV import + region placement — the
assembly is itself a product test. *Lesson: end-to-end journeys — the assembly
was deliberately designed as a human-in-Studio session (coordinate-free CSVs so
the curator draws boxes); an 80%-done deliverable with no tracking row quietly
becomes 0%.*

**Loop.** Journey walk riding `docs/showroom/ASSEMBLE.md`, with you as the hands
for the draw-boxes steps. Ledger `ledgers/SHOWROOM.md`. Done: the showroom
exhibit is published in the viewer tree (or the deliverable is explicitly parked
with its reason in the plan doc).

**Run it:**

```
Assemble the Archie showroom exhibit per docs/showroom/ASSEMBLE.md: build the
exhibit from the 21 PNGs in docs/screenshots/auto/ (21 objects), create the 4
readings (studio/viewer/embed/power — colours in docs/showroom/exhibit.md),
import the 21 CSVs from docs/showroom/csv/ via the Studio CSV import (each row
becomes a pending note; verify counts against node --experimental-strip-types
docs/showroom/verify.mjs → 87 rows), then the region-drawing pass ("Set area")
— this step needs a human curator: run the studio locally (node scripts/start.mjs
both), drive everything scriptable, and recruit me as the hands for drawing,
telling me exactly which object/note/region is next and logging what I report.
Wire the 21-section narrative tour, set metadata, publish into the viewer tree.
Ledger ledgers/SHOWROOM.md: step | expected | actual | friction 0-3 | fix commit
| re-walk. Every stumble in the CSV-import/pending-notes/Set-area flow is
product feedback — log it with a friction score; out-of-scope bugs go to
ISSUES.md as queued candidates, not fixed mid-walk. First, resolve the plan's
open decision: does the showroom live as a permanent seed fixture or a
hand-built published exhibit — ask me before building. Done when the showroom
exhibit is published and the walk log is complete, or the deliverable is
explicitly parked with its reason recorded in docs/plans/SHOWROOM-EXHIBIT-PLAN.md.
```

**Strength:** Worth exploring (needs the user in the loop by design).

---

## Issue 10 — The implementation-strategy doc describes a methodology that no longer exists

**Status:** done 2026-07-05 — ledger: ledgers/METHOD.md (every named dead tool renamed to its current
equivalent — `code-review`, `verify`, `tdd`, the Agent/Workflow tools — or, where nothing replaced it
(`sd`/seeds DAG enforcement, `mulch`, `qmd`, `foxhound`, `record-extractor`), rewritten to describe the
underlying idea honestly instead of a tool that isn't there. The three ordering principles, phase
definitions, and reducibility classifier — the doc's actual load-bearing content — are untouched.)

**Symptom.** `docs/IMPLEMENTATION-STRATEGY.md` lines 1-261 (everything above its "Deferred-work
registry") describe an entire operating methodology — a decomposer/wave/leaf-task schema, a
skill-routing table, and named tooling: `sd`/seeds DAG, `mulch`, `gate-enforcer`, `qmd`, `foxhound`,
`record-extractor`, `decision-record.sh`, `dispatching-parallel-agents`, `strategic-looping`,
`failure-capture`, `requesting-code-review`, `verification-before-completion`,
`/thermo-nuclear-code-quality-review`. None of these exist in the current skill/tool set (found
2026-07-05, ISSUES.md Issue 2's claim-diff, out of that issue's stated scope). The actual current
methodology is the `tend` skill plus the `ISSUES.md`/`ledgers/` convention this backlog itself uses —
an entirely different operating model than the one this document prescribes.

**Rungs.** L1↔L3: a purpose-level document (how work should be organized here) describes a structural
reality — named tools, a DAG-based task system — that isn't there to invoke.

**Why it's high-leverage.** `README.md`'s Documentation table links this file as "Phasing, sequencing,
validation gates, deferred work" — a fresh session or contributor following it would try `sd ready` or
`mulch prime` and find nothing. *Lesson: documentation drift extends to methodology docs, not just
feature-status docs — a process doc describing dead tooling is as misleading as a feature doc
describing dead features.*

**Loop.** Claim-vs-reality diff, scoped to lines 1-261 only (the Deferred-work registry at 262-307 is
Issue 2's territory, already resolved there). Ledger `ledgers/METHOD.md`. Done: every named tool/skill
in the document is either confirmed live, replaced with the tool that actually does that job today, or
the passage is removed.

**Run it:**

```
docs/IMPLEMENTATION-STRATEGY.md lines 1-261 (stop before "## Deferred-work registry" — that section
is ISSUES.md Issue 2's territory, already resolved) describe a decomposer/wave/leaf-task methodology
built on tooling that doesn't exist in this session's skill/tool set: sd/seeds DAG, mulch,
gate-enforcer, qmd, foxhound, record-extractor, decision-record.sh, dispatching-parallel-agents,
strategic-looping, failure-capture, requesting-code-review, verification-before-completion,
/thermo-nuclear-code-quality-review. Check each named tool/skill against the CURRENT available skill
list (visible in your own system context) and this repo's actual working convention (the `tend` skill,
ISSUES.md, ledgers/) — for each, record whether something else now does that job (e.g. `tend`'s ledger
convention plausibly replaces `mulch`'s citable-decision role; `writing-plans`/`executing-plans` still
exist and may be accurate) or whether it's simply gone. Ledger ledgers/METHOD.md: passage | claimed
tool/skill | current replacement (if any) | resolution | commit | recheck. Finish the whole diff before
resolving anything. Then per passage: rewrite it to name the current tool, or delete it if nothing
replaced it and the passage is pure ceremony. Preserve the document's actual load-bearing content (the
three ordering principles, the phase definitions, the reducibility classifier) — this is a methodology
refresh, not a deletion sweep; only the passages naming dead tooling change. Done when every named
tool/skill is confirmed live, replaced, or removed, and the doc no longer sends a reader chasing a
command that doesn't exist.
```

**Strength:** Worth exploring.

---

## Issue 11 — Both apps degrade past ~20 images (perf + UX); plan exists, untracked until now

**Status:** queued (plan: `docs/plans/SCALE-GALLERY-PLAN.md`, grilled + user-confirmed 2026-07-05)

**Symptom.** At 20+ Objects in an Exhibit / 50+ across the Library, Studio and Viewer both turn
clunky — user-reported, in performance AND interaction design. Mechanics (verified 2026-07-05):
folder-bound autosave reruns the FULL publish pipeline (all manifests, assets, thumbnails, DZI
re-tiling) on every save (`apps/studio/src/binding-store.svelte.ts:176` →
`publish-flows.svelte.ts:165`); `App.svelte:114-142` mints blob URLs for every Object's master at
exhibit open; `ExhibitOverview.svelte` renders all plates eagerly with no virtualization (:238,
:304) while the Viewer's `ObjectGrid.svelte:69-73` already has it; the Viewer loads all objects +
all annotations before first paint (`render-core/src/publish/read.ts:59-103`); and the UI offers
no search, no sort, no multi-select, no bulk ops, no library-level image view anywhere.

**Rungs.** L1↔L2: the product's purpose (annotate real collections) outgrew a structure designed
around a handful-of-folios mental model — nothing in either app acknowledges collection size.

**Why it's high-leverage.** Collection size only grows; every session in a real library pays the
O(whole-library) save tax and the wall-of-plates scroll. The plan converts one user complaint
into four independently-shippable phases, perf first. *Lesson: scale pain was invisible to every
diagnosis pass because the seed data is small — synthetic-scale fixtures (30+ objects) are the
only way this class of issue surfaces before a user hits it.*

**Loop.** Execute `docs/plans/SCALE-GALLERY-PLAN.md` phase-by-phase (perf slate → Studio overview
toolkit → Library Gallery + ADR-0023 index → Viewer navigation), verifying each phase against the
plan's Verification section before starting the next. Ledger `ledgers/SCALE.md`. Done: all four
phases verified on a synthetic 2×30+1×10 library, ADR-0023 accepted or amended.

**Run it:**

```
Read docs/plans/SCALE-GALLERY-PLAN.md and docs/adr/0023-library-level-image-index.md. Execute the
plan ONE PHASE at a time, in order (Phase 1 perf slate first — incremental folder autosave with
dirty-tracking, lazy master blob-URL minting, content-visibility virtualization of the Studio
overview list). Before each phase: re-verify the plan's file:line anchors still hold (code moves).
After each phase: run the plan's Verification section for that phase on a synthetic library of
2 exhibits × 30 objects + 1 × 10 (build via Studio ingest or a seed script), and record evidence
in ledgers/SCALE.md (phase | change | verification observed | commit). Decisions already grilled
and user-confirmed 2026-07-05 — do not relitigate scope (no grouping concept, no audience
in-exhibit search, bulk move-between-exhibits deferred); flag genuine blockers instead. Stop for
user review after each phase.
```

---

## Issue 12 — Studio's typecheck is Svelte-blind: no `svelte-check` anywhere, so CI is green while App.svelte's type errors go ungated `[re-run 246550d]`

**Status:** running (2026-07-05) — branch `tend/issue-12-svelte-check` (off `1704e83`), ledger `ledgers/GATE.md` §Issue-12. Inventory + infra DONE: `svelte-check@4.7.1` + `svelte.config.js` + `check` script added; baseline = **43 errors (13 exactOptionalPropertyTypes strictness + 30 real, ALL in App.svelte)** incl. a real silent-data-loss bug (`layers` dropped on exhibit copy, App.svelte:522) + DZI-union unsoundness. **Fix + CI-wire DEFERRED** — App.svelte is being concurrently rewritten (Issue 11 Phase-2, adding errors); fixing here would collide and a red CI gate would break every push. Resume after the studio rewrite settles: re-run `check`, fix, wire CI, trip red.

**Symptom.** `apps/studio/package.json`'s `typecheck` is bare `tsc --noEmit`, which treats `.svelte`
files as opaque — it never checks the script/template inside a component. `svelte-check` is **not a
dependency anywhere** in the monorepo (verified: grep across every package.json). CI
(`.github/workflows/checks.yml:34` `pnpm typecheck` + `:80` `astro check`, the latter for
`apps/viewer` only) therefore type-checks studio's `.ts` but NONE of its 66 `.svelte` files. Result:
`tsc --noEmit` exits 0 for `@archie/studio` while the Svelte language server reports 30+ type errors
in `App.svelte` alone (`currentExhibit` possibly-undefined, `W3CTarget[]` not assignable to
`W3CTarget`, `setAssetUrl` not on `IngestContext` at :1210, `exactOptionalPropertyTypes` violations
on component props). CI's green check asserts type-safety over the studio's largest, most-edited
surface and delivers none of it.

**Rungs.** L4↔L3 friction: the implementation gate (typecheck) structurally can't see the component
structure it is meant to guard; the studio's whole `.svelte` layer is unchecked.

**Why it's high-leverage.** Issue 1 wired CI to *run* the checks, but this check is Svelte-blind, so
every type error in every studio component — including regressions in the in-flight Issue 11 work —
lands green. Installing `svelte-check` in studio's gate (as `apps/viewer` already has `astro check`)
closes the single largest hole in the tripwire, and would have surfaced the App.svelte flood long
ago. Honest scope: turning it on surfaces a backlog of existing errors (some real bugs, some
LSP-strictness noise) to triage, and the tsconfig to tune, before the gate goes green-and-stays —
real work, not a one-line add. *Lesson: continuous integration — a gate that can't see a file type
isn't guarding it; a green check over an unchecked surface is worse than none, because it's trusted.*

**Loop.** Tripwire installation scoped to the studio Svelte typecheck. Ledger `ledgers/GATE.md` (new
section — Svelte typecheck; Issue 1's GATE covered CI wiring).

**Run it:**

```
Add svelte-check to apps/studio and make its type-checking a real gate. Ledger ledgers/GATE.md (new
section): check | command | local result | CI wired | tripped red | commit. Install svelte-check as a
studio devDep, add a `check` script (svelte-check --tsconfig ./tsconfig.json), run it, and inventory
EVERY error without fixing (App.svelte alone has 30+). Triage each by CATEGORY, not per line: a true
type bug (fix it, own commit) vs LSP-strictness noise the app's tsconfig should relax (e.g.
exactOptionalPropertyTypes on generated component props). Do NOT fold in the uncommitted Issue 11
WIP's own errors — flag them for that loop. Once the studio check passes (or passes with documented,
narrow suppressions), wire it into .github/workflows/checks.yml beside the existing tsc typecheck,
then plant one deliberate .svelte type error on a branch, watch CI go red, revert. Done when
svelte-check is green on main, wired in CI, and seen to fail once on a planted defect.
```

**Strength:** Strong (two independent verified signals — svelte-check absent everywhere + studio
typecheck is bare `tsc --noEmit`; and `tsc --noEmit` exits 0 while the Svelte LSP reports 30+
App.svelte errors the gate never sees).

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

---

## Issue 15 — No dependency audit has ever run; `isomorphic-dompurify` is a stale runtime dep dragging jsdom into a no-backend tool `[re-run 246550d]`

**Status:** done 2026-07-05 — ledger: `ledgers/DEPS.md` (scope A + undici override: `astro`→6.4.8, `isomorphic-dompurify`→3.18, `undici`→7.28 via `pnpm-workspace.yaml` override; **audit 19→8**, all 8 residual dev/build-only + reasoned-in-row; zero unused. Corrected mid-loop: prior Dependabot overrides already existed in `pnpm-workspace.yaml`. Scope-B toolchain-major bumps queued in the ledger.)

**Symptom.** `pnpm audit` reports **19 findings** (1 critical, 6 high, 8 moderate, 4 low) — the audit
lens has no ledger, so this surface was never triaged. A distinct, correctable slice:
`isomorphic-dompurify` `^2.16.0` (resolved `2.36.0`) is a **runtime** dependency of BOTH
`packages/render-core/package.json:20` and `apps/viewer/package.json:26`, is a **full major behind**
(latest `3.18.0`), and pulls `jsdom`→`undici` into a local-first no-backend tool that never needs a
Node DOM in the shipped bundle (`sanitize.ts` notes the browser uses ambient `window`, tests use
happy-dom). **Correction to the explorer's first pass:** NOT all 19 advisories route through this dep
— the list also includes dev-tooling advisories (Vitest UI critical, Vite `fs.deny`, Astro SSRF,
esbuild, launch-editor, JS-YAML) that a dompurify swap does not touch. The swap clears the
jsdom/undici subset, not the whole audit.

**Rungs.** L1↔L4 friction: the stated purpose (local-first, no backend, minimal surface) vs an
implementation carrying a server-DOM lib + a stale-major advisory surface on the core engine's
runtime deps.

**Why it's high-leverage.** The dependency list has never been made a decision here. Swapping
`isomorphic-dompurify` → plain `dompurify` (the browser has a real DOM; tests already run under
happy-dom) drops `jsdom`+`undici` from render-core and viewer runtime deps and clears their advisory
subset — shrinking the shipped surface to what the tool actually needs. The rest of the 19 (dev
tooling) get triaged in the same pass, class by class. *Lesson: dependency hygiene — every dependency
you don't update is a decision someone else eventually makes for you, usually a disclosure at the
worst time.*

**Loop.** Dependency triage over both runtime manifests, extended to dev deps. Ledger
`ledgers/DEPS.md`. Floor: fix or reason-in-row every advisory at moderate+.

**Run it:**

```
Audit every dependency in packages/render-core/package.json and apps/viewer/package.json (and the
other manifests). Ledger ledgers/DEPS.md: dependency | used by | installed → latest | advisories |
class (unused/vulnerable/stale/healthy) | action | commit | retest. Inventory and classify everything
before touching anything — "used by" includes config, manifest scripts, and tool configs, not just
imports. Headline row (verified): isomorphic-dompurify ^2.16 is a RUNTIME dep of render-core + viewer,
a full major behind (3.18), pulling jsdom→undici into a no-backend tool; swap it for plain dompurify
(browser has a real DOM; tests run under happy-dom) and re-run pnpm audit to confirm the jsdom/undici
subset clears. The other audit findings are dev tooling (Vitest/Vite/Astro/esbuild/launch-editor) —
separate rows; majors get a changelog read and a written plan, not a blind bump. Per row run the
fullest check (typecheck + tests + a build), commit per dependency. Done at zero unused, every
moderate+ advisory fixed or carrying its reason in-row, and a fresh pnpm audit adding no new rows.
```

**Strength:** Worth exploring (single lens, first run; the runtime-dep swap is verified and clean,
the broader audit is real but mixed).

---

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

## Directions

### Direction 1 — The collaboration machinery is built, tested, and unreachable

**Status:** done 2026-07-05 — ledger: ledgers/CAPABILITY.md (verdict: pursue, all three clusters —
DAG-classification functions, import-merge path, merge-UI components. User-directed pursue; each
cluster carries a commissioned next step — a spec interview for the conflict-resolution UI trigger
and contract, a prototype brief for running MergeReview.svelte's own unrun comprehension test before
wiring it in. No code built or changed; this resolves README.md:226's inaccurate "shipped" claim,
already flagged blocked-on-verdict in ledgers/CLAIMS.md:40.)

**Surplus.** `apps/studio/src/MergeReview.svelte` (conflict cards; its own header
calls it the "#1 validation-priority invention") and `IdentityPrompt.svelte` are
imported by no component — `App.svelte` (2147 lines) mounts neither.
`AnnotationSession.importChanges()` (`session.ts:147`) has no app caller. The
spine's DAG-classification layer — `lineage`, `ancestors`, `commonAncestor`,
`classifyMerge`, `classifyLogical`, `conflictTiebreak` in `spine/merge.ts` — has
zero callers outside its own file and tests. The only live "collaboration" path
(`ingest-flows.ts:454`) **replaces** the project on zip open; it never merges.
Meanwhile `README.md:226` claims "Silent DAG merge; conflict-card resolution;
identity prompt" as shipped.

**Rungs.** L3/L4 → L2: a whole subsystem out-provides a product surface that
doesn't exist.

**Who feels it.** The educator/collaborator personas the README courts: a
teacher receiving 30 student zips today opens each one and watches it *overwrite*
their library — the workaround is manual, one-browser-profile-per-student.
*Lesson: product discovery — a capability no user can reach doesn't exist for
them; the cheapest item on any roadmap is one the backend already does.*

**Intent.** Forgotten-latent, most likely: the README and
`IMPLEMENTATION-STRATEGY.md:266` both claim it shipped — this reads as work that
fell out of the mount tree, not deliberate deferral. `unknown` on the deeper
DAG-classification functions.

**Loop.** Capability-reach diff scoped to collaboration/merge. Ledger
`ledgers/CAPABILITY.md`. Done: every gated/orphaned operation verdicted with
reason — nothing built.

**Run it:**

```
List every operation the Archie collaboration/merge subsystem exposes — start
from packages/render-core/src/spine/merge.ts (lineage, ancestors, commonAncestor,
classifyMerge, classifyLogical, conflictTiebreak, resolveConflict, headsOf),
session.ts (importChanges:147, resolveConflict path), and the studio components
MergeReview.svelte and IdentityPrompt.svelte — and record each one's user path
and gate. Read paths from code only — note apps/studio/src/App.svelte contains
a NUL byte that makes grep report false zero-matches; use grep -a or Read
(see ISSUES.md Issue 3). Known evidence: MergeReview/IdentityPrompt are mounted
nowhere; importChanges has no app caller; opening a colleague's zip
(ingest-flows.ts openZip → replaceProjectFrom) REPLACES rather than merges; yet
README.md:226 claims conflict-card resolution shipped. Ledger
ledgers/CAPABILITY.md: operation | defined at | user path | gate | intent |
class (reachable / gated / orphaned) | verdict | commissioned as. Inventory
everything before judging anything — a second full pass must add no rows; read
each orphaned row's intent from comments and git history (when did MergeReview
last change, was a mount ever removed?). Then bring me the orphaned rows for
verdicts in clusters (merge-UI, import-merge path, DAG-classification functions)
— pursue / park / reject, my reason logged in-row. Build nothing, open no gate:
a pursue only commissions a spec interview, pre-mortem, or prototype brief, its
prompt written into the row; a reject on the DAG functions queues a deletion
sweep, and either verdict resolves the README claim row from ledgers/CLAIMS.md
(Issue 2). Done when every orphaned row holds a verdict and its reason.
```

**Strength:** Strong.

### Direction 2 — Version history is written forever and shown never

**Status:** done 2026-07-05 — ledger: ledgers/DARKDATA.md (verdict: pursue, all three clusters —
provenance/history values, timestamp values, identity values. User-directed pursue; corrected the
direction's own framing along the way — `lastEditor` is partially surfaced already, via `collab.ts`'s
aggregate per-editor banner, not only the unmounted MergeReview.svelte. Each cluster carries a
commissioned next step: a spec interview for a note History panel, and two smaller prototype briefs
for surfacing `modifiedAt` and per-note `lastEditor` standalone. No code built or changed.)

**Surplus.** The annotation spine persists full provenance: `mergeParents`
serialized as `archie:mergeParents` (`spine/serialize.ts:112`, read back at
`deserialize.ts:62`) with zero display consumers; `lastEditor` written on every
append (`session.ts:98/116/191`) whose only display site is the unmounted
`MergeReview.svelte:51`. The append-only version-parent DAG — the README's
"core innovation" — has no version-history view in studio or viewer.

**Rungs.** L4 → L2: the data model's most distinctive stored value never reaches
a user's eyes.

**Who feels it.** The DH-scholar persona: "notes are versioned" is a citability
promise, but a scholar wanting to see or cite an earlier version of a note has
no surface — the workaround is keeping dated zip exports by hand.
*Lesson: dark data — every value stored but never shown is a feature you already
paid for and forgot to ship; surfacing beats greenfield.*

**Intent.** Designed-latent at the spine level (ADR-0003 chose append-only
deliberately, non-destructive edits are load-bearing for merge); `unknown`
whether a history *view* was ever scoped — no ADR or deferred-registry row
mentions one.

**Loop.** Dark-data census scoped to the spine's persisted values. Ledger
`ledgers/DARKDATA.md`. Done: every dark row verdicted — nothing built.

**Run it:**

```
Inventory every value the Archie annotation spine stores or computes and keeps —
walk packages/render-core/src/spine/ (log, heads, serialize: note
archie:mergeParents at serialize.ts:112) and session.ts (lastEditor written at
:98/116/191), plus what publish/site.ts projects into the published tree — and
trace which ever reach a user through a studio screen, viewer surface, published
IIIF output, or export. Evidence from code and git only; name fields, not data.
No grep hits is not yet dark — check wildcard serialization paths (the IIIF
projection may carry values into manifest.json that no viewer displays: that is
surfaced-to-IIIF-but-dark-in-app, record it as its own class note). Known
candidates: mergeParents (zero display consumers), lastEditor (only display
site is the unmounted MergeReview.svelte:51), full version-parent lineage
(append-only log per ADR-0003 — read that ADR for intent before classifying).
Ledger ledgers/DARKDATA.md: value | written at | surfaced at | class (surfaced /
internal / dark) | intent | verdict | commissioned as. Classify everything
before judging anything — a second full pass must add no rows. Then bring me
the dark rows for verdicts in clusters sharing an intent (provenance/history
values together) — pursue / park / reject, my reason logged in-row. Build and
delete nothing: a pursue only commissions a spec interview, pre-mortem, or
prototype brief (e.g. "a note's History panel" spec interview), its prompt
written into the row. Done when every dark row holds a verdict and its reason.
```

**Strength:** Strong.

### Direction 3 — The embed element outgrew its snippet generator

**Status:** done 2026-07-05 — ledger: ledgers/CAPABILITY.md (new section, verdict: pursue on
`target`/`iiif-content`/`offline`/iframe-parity, `currentContentState()` logged orphaned-by-category
with no commission. User-directed pursue; git-history check found the gap reads as deliberate v1
scoping rather than staleness — target/iiif-content/offline were already in element.ts's
observedAttributes in the same commit that shipped the src-only dialog. Confirmed the Studio's
⌘K citation flow already computes the exact route values `target=` needs, unwired to Publish.
Commissioned: two prototype briefs [target, offline], two spec interviews [iiif-content,
iframe-path parity]. No code built or changed.)

**Surplus.** `packages/archie-viewer/src/element.ts:74` observes four attributes
— `src`, `target`, `iiif-content`, `offline` — all shipped, ADR-blessed
(0021/0022), and documented in `recipes/`. The one UI that hands users their
embed code, `apps/studio/src/PublishDialog.svelte:73-74`, emits only
`<archie-viewer src="…">`. Deep-linking, offline/kiosk mode, and IIIF
Content-State are reachable only by hand-editing HTML against the recipes.

**Rungs.** L2 (element capability) → L2 (studio surface): one feature's own
halves out of step.

**Who feels it.** The educator or curator embedding an exhibit: to deep-link a
specific note into a course page they must find `recipes/EMBED.md` and hand-write
the cite-ladder hash. The Cmd+K citation UI already computes these routes
in-app. *Lesson: product discovery — the cheapest roadmap item is one the
backend already does; here even the UI for composing the value (Cmd+K) already
exists, just not connected to the snippet.*

**Intent.** Designed-latent for the attributes themselves (recipes document them
deliberately); `unknown` for the dialog gap — likely just sequencing
(PublishDialog's snippet shipped in the same wave the attributes were landing).

**Loop.** Capability-reach diff, small scope. Ledger `ledgers/CAPABILITY.md`
(same ledger as Direction 1, separate cluster). Done: each unexposed attribute
verdicted.

**Run it:**

```
List every capability the <archie-viewer> element exposes (packages/
archie-viewer/src/element.ts:74 — observedAttributes src, target, iiif-content,
offline; plus behaviors each unlocks per docs/adr/0021 and 0022 and recipes/)
and record which the Studio's embed-snippet generator
(apps/studio/src/PublishDialog.svelte:73-74 — currently emits src only, plus an
iframe fallback) lets an author reach. Also record adjacent in-app sources of
the values (the Cmd+K citation flow already computes cite-ladder routes usable
as target). Ledger ledgers/CAPABILITY.md, new section "embed-snippet": operation
| defined at | user path | gate | intent | class | verdict | commissioned as.
Inventory before judging; read intent from the ADRs and recipes (documented =
deliberate capability; absent from the dialog may be sequencing, check git
history of PublishDialog.svelte). Then bring me the rows for verdicts —
pursue / park / reject with my reason in-row. Build nothing: a pursue
commissions a spec interview or prototype brief (e.g. "snippet builder with
target picker and offline toggle"), its prompt written into the row. Done when
every non-reachable capability holds a verdict and its reason.
```

**Strength:** Worth exploring.

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

---

## Top recommendation

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
