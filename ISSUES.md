# ISSUES — Archie tend backlog

Generated 2026-07-05 by a tend diagnosis. Commit examined: `2091557` (main).
Evidence gathered by two codebase walks (core packages + apps/ops surface); every
symptom below was verified against files on disk, not inferred. Issues are ordered
by leverage; directions by strength. Each **Run it** block is self-contained —
paste it into a fresh session with no skill loaded.

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

**Status:** running — ledger: ledgers/CLAIMS.md

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

**Status:** queued

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

**Status:** queued

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

**Status:** queued

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

## Directions

### Direction 1 — The collaboration machinery is built, tested, and unreachable

**Status:** queued

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

**Status:** queued

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

**Status:** queued

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

---

## Top recommendation

**Issue 1 — tripwire installation.** The typecheck is red on main and nothing
automated runs the ~1163 tests: that's a burning platform, and every other fix
in this file wants a green gate to land behind. Run Issue 3 (the NUL byte)
immediately after — or fold its App.svelte fix into Issue 1's repair phase —
because until that byte is gone, every grep-based verification in the other
loops silently lies about the studio's largest file.

**Top direction:** Direction 1 — the collaboration machinery. Strong surplus,
already claimed shipped in the README, and its verdict unblocks a row in Issue
2's claims diff. It converges to decisions, not builds — cheap to run whenever
you have verdict energy.
