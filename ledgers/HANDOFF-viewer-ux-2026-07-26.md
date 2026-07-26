# HANDOFF — Viewer UX, third wave (2026-07-26)

Worktree `.claude/worktrees/chrome-occlusion`. **Everything below is MERGED AND PUSHED to `main`**
(unlike the two prior handoffs, which described unmerged branches). `main` is at **`85c8ba5`**,
CI green.

Supersedes nothing — `HANDOFF-viewer-ux-2026-07-25b.md` stays accurate for the second wave.

## What landed

| merge | what |
| --- | --- |
| `0cf41ba` | the second wave (halo, chrome occlusion, canvas keyboard, embed asset paths) |
| `c22f62e` | **annotations survive a change of base** — `screenshots` 3 → 87 notes |
| `4df71ee` | **Archie-b681** — the embed ships attribution, licence, metadata (V105) |
| `4e21416` | **Archie-67b6** — the note rung resolves (V100) |
| `c903371` | **Archie-99b1** — the address writes every rung (V101/V24/V84/V52) |
| `532ebdc` | **Archie-3ea1** — the cite panel (V102/V106) |
| `85c8ba5` | publish bakes REAL canvas ids; the committed zip re-exported from the repaired tree |

Tickets closed: `b681`, `67b6`, `99b1`, `3ea1`.

## `85c8ba5` — the working-store namespace was being published

`WORKING_IRI_BASE` (`https://archie.demo/`) is the Studio's internal identifier namespace and its
own doc says it is "never published". It was in fact the base **every** publish sink baked, so every
deployed site carried manifest ids, canvas ids and annotation targets on a domain nobody owns, and
ADR-0021's cite ladder resolved to nothing. Nothing caught it because the tree was internally
CONSISTENT — ids matched targets, so every round-trip test passed.

The rule now (`apps/studio/src/deploy/remembered.ts`, `publishBaseFor`): a published id says where
the thing actually lives, or says nothing — never a placeholder.

- **deploying** → `pagesUrlFor(owner, repo)`, computed BEFORE staging and passed explicitly
- **published before** → that library's remembered live URL
- **never deployed** → `""`, i.e. relative ids (`voynich/canvas/o1`)

Relative is the honest answer for a tree with no destination yet: it is self-contained and correct
wherever it lands, and a later deploy re-mints every id — including annotation targets, via
`rebaseCanvasId` — which is what makes changing the base non-destructive at all.

The committed `apps/viewer/libraries/archie-library.archie.zip` was re-exported from the repaired
tree by the new `apps/viewer/scripts/reexport-library-zip.mts`: **3 → 87 inline annotations, 185
records**. A committed artifact does not update itself; the script exists so the next model change
has an inverse to run.

## The big one: publishLibrary was dropping every annotation on a base change

`publishLibrary` grouped heads by EXACT canvas-IRI equality against the base it was publishing to.
A log authored against any other base matched nothing and **every note was dropped, silently, with a
completely healthy-looking publish**. Three real paths hit it: Studio authors targets against
`WORKING_IRI_BASE`, a deploy publishes to a real origin, and `gen-published.mts` loads a dropped zip
and re-publishes it elsewhere.

It shipped. `apps/viewer/libraries/archie-library.archie.zip` carries manifest/canvas ids at the
deploy origin, 182 history records at `https://archie.demo/`, and **zero** inline annotations across
all 21 canvases.

The tell was an asymmetry: `loadLibrary` already recovers ASSET sources across exactly this base
change (`recoverAssetSources`, deriving the base from the manifest's own id). Annotation targets had
no equivalent. `rebaseCanvasId` (beside `canvasIdFor`, the ONE minter) closes it — narrowly: it
re-mints only when the slug segment AND the object-id tail both match, because prior art is
unanimous that the canvas IRI **is** the identity (cozy-iiif's `importAnnotationsToManifest` keys
`bySource[canvas.id]`; clover's `Painting.tsx` compares `canvas.id === target.source.id`; immarkus
reads the baked id back through cozy-iiif). None of them rebases, and neither does this — a foreign
IIIF canvas is returned untouched.

`site-geo.test.ts`'s second case used to PIN the drop. It now asserts survival, which is strictly
stronger. Inverted deliberately, not loosened.

## The `screenshots` mystery, fully resolved

Two causes, and the earlier handoff's framing was wrong on both counts:

1. The base mismatch above (the real bug).
2. `screenshots` opens in **NARRATIVE** mode (21 sections). The "0 notes" reading had been taken
   from the wrong surface.

All 87 notes live on **READING** pages — the base page is legitimately empty for every canvas until
a reading is enabled. Nothing wrong there.

**The keystone claim HOLDS, and this is the useful part.** Measured offline against the built
viewer: `screenshots` serves all 21 object images from **localhost**, with **zero** blocked remote
requests and no 404s, and **OSD paints**. It is the one exhibit that can carry canvas assertions in
the hermetic offline suite. `note-address.spec.ts` already uses it; the halo / canvas-keyboard / AV
assertions that are still hand-driven online can move there next.

## Cite ladder: the note rung had never resolved, and it was three bugs

`route.ts` parses ONE path segment out of `#/<slug>/a/<id>`; a published id is the full IRI
`{base}{slug}/annotations/{ULID}/v{n}`; they were compared with `===`. `logicalIdOf` (in `brand.ts`,
which already owned the split) normalises both sides. The audit the ticket asked for found two more
shipping halves:

- `narrative-landing.ts` `ownerObjectOf` had the identical defect, so `arrivalSectionIndex` always
  fell back to section 0 — every deep-linked note in a narrative landed at the top of the spine
  instead of its own beat. A plausible-looking wrong answer, which is why nobody caught it.
- `ExhibitView` passed the raw URL segment into `Reader`'s `initialSelected`, which is matched
  against `annotation.id` — the same `===` gap one layer down. `resolveNoteArrival` now returns the
  note's PUBLISHED id (`NoteArrival.noteId`) and callers carry that.

**Why the unit suites were green:** both fixtures used the same synthetic string (`"n-base"`) for
the queried id AND the annotation id. With both sides identical, raw `===` passes — the suites were
structurally incapable of modelling the bug. Rewritten to real shapes.

## The address now writes every rung

ONE writer in `ExhibitView`, fed by an `onlocus` seam the three reader islands report through. The
islands stay ignorant of the address grammar; `ExhibitView` alone decides precedence and builds via
`routeToHash`. `replaceState`, never `pushState`. The AV rung reports the CUE'S START, not
`currentTime`.

One interaction to preserve: the writer **yields** to V4's honest-degrade path. While the arrival
chrome explains a missing target, `normalizeAddressToExhibit` owns the bar.

## STATE — wave 1 two-thirds LANDED (local `main`, NOT pushed), wave 2 running

Local `main` is at **`c4d14d5`**, three commits past `origin/main` (`85c8ba5`). **Nothing is pushed.**

| commit | what |
| --- | --- |
| `1c131c9` | three measurement rules + this ledger |
| `273bea7` | merge `ux/note-surface` (`cd9b33f`) — `Archie-dbbc` + `Archie-01a6` |
| `c4d14d5` | merge `ux/offline-canvas` (`109d394`) — verification debt, V48 gap pinned |

**Gates on the MERGED tree — the combination neither branch had ever been tested in:**
typecheck clean · viewer vitest **176 / 21 files** · svelte-check **1519 files 0/0** ·
viewer e2e **100 passed / 0 failed / 0 skipped** (port 4371).

Tickets closed with full resolutions appended to their bodies: **`Archie-dbbc`**, **`Archie-01a6`**.
Map open count 18 → **16**.

### Two wrong ticket ids in those merge commit messages

`273bea7` says flip-and-read was recorded as `Archie-c30a`; it is **`Archie-5185`**. `c4d14d5` says
the V48 horizontal-only gap was filed as `Archie-b135`; it is **`Archie-c30a`**. (`Archie-b135` is
"the seed has no local audio/video".) Not rewritten because all three in-flight agents are based on
`c4d14d5` and moving `main` under them would orphan their base. The correct ids are here and in the
closed tickets' resolution text.

### `ux/embed-parity` (`8e949c8`, 5 commits) — still UNMERGED and now UNDER REVIEW

Gates as reported by its impl agent: archie-viewer 180/180 · render-core 1194/1194 · smoke 36/36 with
35/35 contracted labels · typecheck 7/7 · check:svelte 1513 0/0 · eager 36 → 38.9KB gz (Δ+2.9/+10.0).

Verified here, do not redo: merges clean, **zero** file overlap with the other two slices (12 / 5 / 56
files, empty pairwise intersections), and `bundle-size.json` is blob **`6acd6b6`** — byte-identical to
`85c8ba5`'s, so the pre-branch floor was carried forward rather than re-anchored. That is the check
that matters most on this branch, because of the trapdoor below.

**REVIEWED — findings at `/tmp/rev-embed-parity-findings.md`. No blocking findings; both blockers
reproduced red-green by a second party.**

- **B2 holds.** `CONTRACTED_LABELS` (`smoke.mjs:842-881`) is a **hand-maintained literal array of 35
  strings** compared against labels derived from `results` — the two sides share no code, so it is
  not a tautology. Renaming one slug in `exhibits.json` produced `RESULT: FAIL`, `7/11`, and a
  completeness line naming exactly **28 NEVER RAN**. Asserted on the success path too (`35/35
  present` on the green run).
- **B3 holds, strongly.** The stepped block clicks Next with **no re-pick** — pick-then-step, the
  broken order. Reverting gave the exact reported red. The decisive detail: on the reverted build the
  *older* pick-only assertion **still passed**, so only the new stepped one catches V56.
- S2's two sides are independently derived (raw published JSON vs in-memory model). S3's needles fire
  on `reader-JVWCTVE3.js` (804KB) and nothing else. S4 is non-circular — all seven canvas-dependent
  labels are literals in the hand-written list. All eight gates matched the claimed numbers exactly.
- **Item 5:** current raw is **103KB** against the 200KB ceiling (~1.94x headroom), and the engine
  chunk is 804KB raw — so the ceiling sits ~8x below the leak class it exists to catch.

**Two should-fixes sent back to the implementer (a new SHA is expected):**

1. The `#activeReading` docblock's last sentence — "Cleared only by opening a new library" — is still
   **false**; `#teardownSurface` clears seven fields and not that one. Benign, but this is the same
   docblock whose falseness hid V56.
2. **S1 is 4/5.** Driven in real Chromium, row [1] seeks `0 → 45` and shows its own body — the door
   works. But the **uncued whole-recording row [4] marks itself current while displaying row [1]'s
   body**: `selectCue` returns `false` (correct design — it keeps "no door" and "opened it"
   distinguishable), the caller treats that as *nothing happened* when what happened is *the
   selection moved with no cue to seek to*, and on the AV branch `#noteCard` is never created.
   **Why it outweighs its size:** AV playback is the **only one of ten MUST rows with no smoke
   label**, so B2's completeness check structurally cannot cover it — the one documented hole in the
   contract is exactly where the residual defect sits. Either give AV playback a label or record it
   in the ADR as knowingly uncovered; not implied-covered.

Two incidentals: `.claude/rules/viewer-e2e-shared-port.md` does not exist at `8e949c8` (moot — smoke
stands up its own server on an ephemeral port), and the `voynich*` fixtures are **not committed**, so
`pnpm gen` in `apps/viewer` is a precondition for smoke finding them at all. The rebuilt bundle was
confirmed byte-identical to the committed `dist/`, so the smoke drive does test current source.

## The embed slice IS MERGED — and verifying it caught a defect all gates were green through

Merged at **`39e2902`** (from `72f26adc2530c61201bddf67702f1d08a9eef223`, 7 commits). Then fixed at
**`eee2f41`**.

**What was wrong.** Five string literals meant for `CONTRACTED_LABELS` had been spliced into the
middle of the stepped-reading `record(...)` argument list, ~135 lines from the array. Introduced by
`72f26ad` — the commit made in response to the coordinator's should-fix message, i.e. **after** the
independent review passed at `8e949c8`, which was clean.

1. The completeness check covered **35 labels, not 40**. All four AV playback labels were absent from
   it — so the one MUST row with no label, **exactly where S1's residual defect sat**, was still
   uncovered by the commit that claimed to cover it.
2. `record(ok, label, detail)` bound the first stray as its `detail`, replacing the V56 stepped
   assertion's diagnostic (the string that prints *"legend says ON, canvas says base: the V56
   symptom"*) with a label. The assertion still worked; its failure message stopped explaining
   anything. That was the branch's own B3 diagnostic, disabled.

Nothing was invented by the fix — all five are genuinely recorded at lines 922/925, 933, 943, 948,
955, so it moves them.

**Red-green**, with the AV block made to record *nothing* (both branches unreachable — the
fixture-collapse case, NOT the skip case, which `record(false)` already caught):

```
before:  35/35 present,  RESULT: PASS      <- the hole
after:   FAIL, "4 NEVER RAN" naming all four AV labels
clean:   40/40 present,  41/41,  RESULT: PASS
```

**How it was found, which is the transferable part:** the agent's report said "contracted labels
41/41"; the merged tree printed **35/35**. Chasing the one number that did not reconcile was the only
route in — smoke was `RESULT: PASS` either way and every other gate was green. Two lessons worth
keeping: **a fix made after the review is unreviewed**, and the natural moment to relax is exactly
when the hard part has been signed off.

One coordinator misstep on the way, recorded because it is the same class: the first injection used
`if (false)`, which routes to the `else` branch where all four records live — so it forced the
*normal* path and came back green. Reporting that as "the gate is broken" would have been the exact
false conclusion this session keeps cataloguing.

**Merged-tree gates with all three slices in:** typecheck 7/7 · svelte-check **1519 files 0/0** ·
vitest **176 + 182 + 1194** · bundle ratchet ok (eager 36 → 38.9 gz, Δ+2.9/+10.0; total 266.3 → 274.9)
and `--check` provably did **not** rewrite the baseline · `sync-dist:check` matching · smoke **41/41,
40/40 contracted** · `astro build` 8 pages.

**Precondition worth knowing:** the `voynich*` fixtures are not committed — `pnpm gen` in `apps/viewer`
must run before smoke will find them. Their absence used to yield a silent `6/6 PASS`.

## Post-merge work this created — NOT yet done

1. **Thread `onopenfinder` into both `<MediaPlayerLazy.current …>` instances** (`ExhibitView.svelte`
   :570 and :592). `MediaPlayer.svelte` now declares the optional prop and passes tag chips to
   `NotePopup`/`ReadingSheet` **only when it is wired** — deliberate: `NotePopup.svelte:127` renders
   every tag as a `<button>` calling `onopenfinder?.(t)`, so handing it tags with no handler ships the
   dead-door defect the slice exists to close. Today an AV note's tags are honestly *absent* rather
   than dishonestly inert; keep that.
   Do the wire on `main` AFTER both wave-2 branches merge, not on either branch — the path is only
   provable once a fixture AV note carries a tag, and splitting prop and fixture across branches
   leaves a window where the assertion is vacuous or failing. The AV agent is adding the fixture note
   (a NEW one — the shared-fixture rule forbids editing an existing one) and deliberately NOT the
   assertion; write that with the wire and red-green it in one pass.
2. **File `ReadingLegend` on the AV surface** as its own ticket. A real enumerated V53 gap, correctly
   not built: it needs `readings`/`activeReading`/`onreading`/`styleOf`/`readingCount` threaded, and
   **no fixture AV note carries a `reading`**, so a legend over nothing would be unfalsifiable in the
   same way as `Archie-0cc6`.

## Wave 2 — DISPATCHED, running now

Both branch from `c4d14d5`, disjoint territory, impl agents in flight:

| branch | tickets | exclusive territory | port |
| --- | --- | --- | --- |
| `ux/narrative-coupling` | `0d6c` + `c5cb` | `NarrativeReader` `ExhibitView` `aside-persistence` `narrative-landing` + spine e2e | 4361 |
| `ux/av-surface` | `7b86` **V53 only** | `MediaPlayer` AV player modules + AV e2e | 4362 |

`ExhibitView.svelte` is the one plausible collision and belongs to the narrative slice; the AV agent
was told to **escalate rather than edit it**. Both were told `packages/archie-viewer/**` and
`recipes/**` are off limits while embed-parity is unmerged.

Two corrections were baked into the briefs so they are not rediscovered:

- `0d6c` cites **scrollama** for the IntersectionObserver choice. That supports *"use
  IntersectionObserver, don't hand-roll scroll math"* and nothing else — scrollama has **no
  reentrancy guard**, and no corpus system solves the two-directions-fight problem (they all dodge it
  architecturally). The instruction: keep IntersectionObserver, port quire's `goToFigureState`
  one-function shape, and build the guard as **acknowledged original design** with no citation
  claimed.
- `7b86` claims **wavesurfer.js is already a dependency**. It is **not**. V50 is deferred; adding it
  trips `.claude/rules/viewer-optimizedeps-bare-includes.md` (needs BOTH a direct dep and an
  `optimizeDeps.include` entry). The AV agent was also told not to take the ticket's "four dropped
  affordances" on faith but to enumerate them against the *newly reshaped* `Reader.svelte`.

## Still uncommitted / on branches

`ux/embed-parity` carries its own `vitest-css-id-empty-string.md` and an eager-closure rule
amendment; those land with that merge.

## The trapdoor found this session — read before touching the bundle ratchet

`packages/archie-viewer/build.mjs` wrote `bundle-size.json` **unconditionally at the end of every
non-`--check` run**. `--check` itself is innocent. Proved red-green-red:

```
A. leak + committed baseline:  FAIL eager 36 → 270.5KB (Δ +234.5, allowed +10.0)  exit 1
B. node build.mjs            → baseline silently rewritten to 270.5
C. same leak, same command:    ok   eager 270.5 → 270.5KB (Δ +0, allowed +27.1)   exit 0
```

The trigger is `pnpm build` at the repo root (`pnpm -r build` reaches it), and `dist/` is a committed
CDN artifact CI enforces — so the rebuild is *mandatory*, i.e. the bypass sat on the happy path. Note
C's allowance is **looser** than A's: `allowed = max(base * 0.1, 10)`, so a rewritten baseline raises
the ceiling it is measured against. Fixed on `ux/embed-parity` (write gated behind `--update`, exposed
as `pnpm bundle:baseline`); allowance held at +10.0. Repo-wide sweep found exactly one instance — the
root ratchet and `sync-dist:check` are clean, so don't redo that sweep.

## Wave 2 — not started, unblocks the moment wave 1 merges

- `0d6c` + `c5cb` — narrative scroll coupling. Collides with `note-surface` on `NarrativeReader` and
  `ExhibitView`. `c5cb` must land WITH `0d6c`: once the spine is an input device, hiding it silently
  removes the interaction the mode is named for. **Open design question, never ruled on by the user:**
  prior art does not support the ticket's premise — scrollama has no reentrancy guard, and all three
  corpus systems dodge the problem architecturally rather than solving it. Recommendation on the table
  was: keep IntersectionObserver, port quire's `goToFigureState` one-function shape, and build the
  guard as **acknowledged original design** with no corpus precedent claimed.
- `7b86`'s V53 — the AV reader's six dropped affordances. Collides with `note-surface` on
  `NotePopup`/`ReadingSheet`, which it must consume in their NEW shape. Brief backbone at
  `/tmp/av-surface-prior-art.md`. **V50 deferred** — the ticket's premise that wavesurfer.js is
  already a dependency is FALSE, so it is a new viewer dep and trips
  `.claude/rules/viewer-optimizedeps-bare-includes.md`.

## Ticket arithmetic — the map cannot close

Started at **7** open, now **18**. Eleven were filed this session; every one is a thing that was
already true and unrecorded, not new scope: `9eeb`, `de08`, `f4fb`, `ecf4`, `b135`, `1820`, `d6e9`,
`9838`, `5185`, `c30a`, `0cc6`. Four are ready to close on merge (`dbbc`, `01a6`, `f90d`, `c314`).

Three filed findings have full write-ups on disk: `/tmp/b1-media-route.md` (the `onmedia` guard is
correct, unfalsifiable, and on a route **no fixture can reach** — no note is both expandable and
media-bearing, since a note needs `text` to show the ⤢), `/tmp/v48-tall-regions.md` (chrome-clearance
reservation is horizontal-only and **structurally** cannot clear a height-constrained region;
`fitBoundsRect` never touches `y`/`h`; 2 of 67 halo notes offend, ratcheted at today's two),
`/tmp/flip-and-read.md` (`stepIntoReading` removal recorded as a decision, with the one test to invert
if it should be reversed).

Independent of all that, **viewer-ux cannot fully close**: V103/V104 depend on `Archie-a5b1`, which
lives on `map:dc-metadata` and is open. State that plainly at close time rather than counting it done.

## The session's dominant lesson, for whoever picks this up

Nearly every wrong turn was **a measurement that looked valid and wasn't**, and the false-*green*
direction is the dangerous one because nothing prompts you to investigate a pass. Catalogued: e2e runs
reusing a sibling worktree's server (both directions); a reviewer's own leftover `astro preview`
reporting an **injected** assertion as passing; `Locator.count()` after `goto` skipping two tests into
silent green while the fixture was fine; a sweep at `slice(0,10)` tuned only against a false green;
five bad prior-art citations; a landmark assertion **I** wrote that was green pre-fix because two
different `<nav>`s carried the same accessible name.

Two standards adopted mid-session and worth keeping: verify a file with `git hash-object` against
HEAD's blob rather than trusting `git status` clean, and prefer **self-validating measurements** —
values only producible against the intended code.

## Gates

## Gates

```
pnpm --filter @archie/viewer run check:svelte     # 0/0
pnpm --filter @archie/studio run check            # 0/0
pnpm -r run typecheck                             # TS7; never bare `tsc`
cd apps/viewer && pnpm exec vitest run            # per-app; the ROOT binary fails rune tests
cd apps/studio && pnpm exec vitest run
cd packages/render-core && pnpm exec vitest run
cd packages/render-mount && pnpm exec vitest run
cd packages/archie-viewer && pnpm exec vitest run
node recipes/smoke.mjs                            # 15/15
pnpm --filter @archie/viewer run e2e              # 59
pnpm --filter @archie/studio run e2e              # 8; needs --config e2e/playwright.config.ts
cd packages/archie-viewer && node build.mjs --check   # eager 36.1KB / total 266.4KB gz
```

At `85c8ba5`: **2621+ unit tests**, 59 viewer e2e, 8 studio e2e, smoke 15/15, svelte-check 0/0 in
both apps, TS7 clean.

**Two traps that each cost a wrong measurement this session:**

- `recipes/try.html` loads the **root** `/dist/archie-viewer.js`, not `packages/archie-viewer/dist/`.
  Rebuilding the package alone leaves the smoke driving the OLD bundle — it reported a working fix as
  broken. Run `node scripts/sync-dist.mjs` after every embed build.
- Worktree branches are cut from a **stale** `main` snapshot, not current HEAD. `test/viewer-e2e` was
  18 files behind; the merge absorbed it cleanly, but branch from `main` BY NAME and verify before
  building on it.
