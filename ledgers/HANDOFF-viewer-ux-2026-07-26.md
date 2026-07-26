# HANDOFF — Viewer UX, third wave (2026-07-26)

Worktrees `.claude/worktrees/chrome-occlusion` (driver) and `.claude/worktrees/merge-main` (merges).
`HANDOFF-viewer-ux-2026-07-25b.md` stays accurate for the second wave.

> **This file accreted chronologically across one long session.** Sections below the lead are
> in the order they were written, so three of them describe states that are now HISTORY — each is
> labelled as such in its heading. **The lead is the only current statement of state.** Where an
> older section's numbers disagree with the lead, the lead wins.

## CURRENT STATE — read this and nothing else for state

**All five slices are MERGED and PUSHED. `origin/main` = local `main` = `04d38ce`.
CI GREEN — all ten jobs at `04d38ce`**, e2e included, read per-job rather than from a summary line.

Merged: `ux/note-surface`, `ux/offline-canvas`, `ux/embed-parity`, `ux/av-surface`,
`ux/narrative-coupling`.

> **CI trap worth knowing.** The run for the *previous* commit `c34f359` reads `cancelled`, and that
> is not a failure — pushing `04d38ce` while it was still running triggered the workflow's
> concurrency group and killed its e2e job mid-flight. Nine jobs had already succeeded. If you push
> twice in quick succession, check the run for the LATEST sha; the older one's `cancelled` is
> self-inflicted and means nothing.

**Merged-tree gates, all measured locally on `37783df` before the push, not inherited from any
branch — and independently confirmed by CI at `04d38ce`:**

| gate | result |
| --- | --- |
| `pnpm -r run typecheck` | **6/6 Done** — render-core, render-mount, render-svelte, archie-viewer, studio, viewer (read the names, not a count) |
| viewer `check:svelte` | **1521 files, 0 errors, 0 warnings** |
| studio `check` | **1158 files, 0/0** |
| vitest, per app | viewer 176 · studio 931 · render-core 1194 · render-mount 207 · archie-viewer 182 = **2690** |
| viewer e2e | **132 passed, 0 failed**, `astro build` confirmed in the log |
| studio e2e | **8 passed** |
| `recipes/smoke.mjs` | **RESULT: PASS**, 41 labels, **41/41 present**, no phantoms/duplicates/strays |
| `build.mjs --check` | ok — eager 38.9KB (Δ +2.9, allowed +10.0), total 274.9KB (Δ +8.6, allowed +26.6) |
| `dist/` drift | **none** — rebuild + `sync-dist.mjs` left the tree clean, so the committed artifact matches current source |

### The next actions, in order

1. **Thread `onopenfinder`** into both `<MediaPlayerLazy.current …>` instances
   (`ExhibitView.svelte` :570, :592) — see "Post-merge work this created" below for why it was
   deliberately kept off both branches. The fixture note carrying a tag is already in place and
   deliberately unasserted; write the assertion with the wire and red-green it in one pass. Do this
   FIRST and alone: `ExhibitView` is the collision hotspot for two wave-1 slices.
2. **Close `Archie-5185`** as a decision (flip-and-read stays removed — ruling 4 below).
3. **`ecf4` is mechanical, not a judgement call** — measured 2026-07-26: `render-core/src/tokens.css`
   (105 tokens) and `apps/studio/src/tokens.css` (102) share 100 names with **zero value
   disagreements**. The viewer no longer has its own copy at all. Studio-only: `--text-lede`,
   `--text-note`. Core-only: `--finder-h`, `--pane-top`, `--scrim-dim`, `--scrim-top`, `--topbar-h`.
   Move the two up, point studio at core, delete the copy. (Note `--finder-h`/`--topbar-h` may not
   survive the dock work — sequence it after.)
4. **Surface retried-but-passed tests in CI** (ruling 5 below).
5. **Write the three rules the narrative review earned** (below) — none exist yet.
6. Then the waves.

### Tickets

Closed this session on map `Archie-c97e`: `dbbc`, `01a6`, `f90d`, `c314`, `0d6c`, `c5cb` — all six
indexed in Decisions-so-far, which now holds **27** entries. **13 remain open** on the map.
(An earlier "15" in this file and in chat was measured *before* the `f90d`/`c314` closes. 13 is a
filtered read of the full open list, not a `head`-truncated one.)

`Archie-7b86` stays OPEN deliberately: V53 is resolved (full eleven-drop enumeration in its body),
V49 untaken, V50 deferred because the ticket's premise that wavesurfer.js is already a dependency is
**false**.

**The map cannot fully close, and that should be stated rather than finessed:** V103/V104 depend on
`Archie-a5b1`, which lives on `map:dc-metadata` and is open.

## DECISIONS THE HUMAN MADE, 2026-07-26 — these change the shape of the remaining work

Four rulings. Each was put with a recommendation and prior art; two went AGAINST the recommendation,
which is why they are recorded verbatim rather than paraphrased into the tickets that prompted them.

### 1. Canvas chrome DOCKS out of the canvas (chose against the recommendation)

The corpus default wins: chrome becomes a sibling of the canvas in normal flow and never sits over
the image. `clover-iiif` `Viewer.tsx:180-184` — `<ViewerHeader>` and `<ViewerContent>` are flex
siblings, which is *why* the header can be transparent; its one over-canvas control is an **opaque
plate**, contrast sidestepped rather than solved. `tropy` `esper/container.js:11,39` — overlay
toolbar is opt-in, `hasOverlayToolbar` defaults **false**.

Consequences, and they are larger than `de08`'s body suggests:

- **`de08` (V42) and `c30a` (V48) both close as OBVIATED, not fixed.** There is no contrast floor to
  establish and no vertical clearance to reserve if nothing floats.
- **`Archie-40fe`'s reservation model retires** — `--strip-h`/`--finder-h`, `fitBoundsRect`'s
  horizontal reservation, and `isWholeObjectFor`'s coverage rule lose their reason to exist. That is
  shipped, tested `render-core` code, so removing it is a deletion with its own review burden.
- **V80's fix (`9a81`) and the narrative spine's 30px clearance become moot** for the same reason.
- The recommendation had been the opaque plate (smallest change, corpus-cited, keeps `40fe`). It was
  declined in favour of the corpus *default*. Don't relitigate it as "the cheaper option existed" —
  it was on the table and named.

### 2. BOTH consumers dock — it is an ADR-0019 CONTRACT, not a pixel

"The image is never obscured by chrome" is a contract the shell and the embed both honour. So:
ADR-0019 gains a **layout row**, and `recipes/smoke.mjs` gains the assertion that holds it. The cost
was named and accepted: vertical space is scarcest in a small embed, which is exactly where a docked
bar taxes most.

### 3. V50 — waveform peaks are BAKED AT PUBLISH into the manifest (chose against the recommendation)

No runtime dependency. Publish computes a peaks array — the pipeline already bakes thumbnails and
tiles DZI in workers — and the reader draws it on a plain `<canvas>`, so the cues sit on something
visible. **wavesurfer.js is NOT being added**; the recommendation was to add it and was declined.

Two consequences to carry: the **embed can have this too** (no `eagerGzKB` cost, unlike wavesurfer),
and an object that has not been published — the author's working store — **has no peaks until it
is**, so the reader needs an honest no-peaks state rather than an empty canvas.

Adding a third worker path means it gets BOTH of what [[perf-measure-the-flow]] requires: a
process-wide pool (never per-call) and a way for a silent fallback to be seen.

### 4. Flip-and-read stays REMOVED — `Archie-5185` closes as a decision

Stepping is navigation; opening a note is a separate act. Docking strengthens this: a docked bar is
unambiguously persistent navigation. The gated-restore option was declined specifically to avoid a
persistent control that behaves differently on invisible prior state.

### 5. CI keeps `retries: 1`, but a retried-but-passed test is SURFACED

Not silent, not fatal. A test that passed only on retry is reported as a warning carrying its
first-run failure, so the narrative-flake class cannot fold into a green tally again. Infra noise
still does not red the build.

## THE REMAINING 13, GROUPED BY FILE TERRITORY

**Re-grouped below for the rulings above** — the dock decision merges `de08`+`c30a` into one large
slice that touches `packages/archie-viewer`, which now collides with `1820` and pushes it to wave 2.

Territory, not topic — the wave boundaries below are real collisions verified the way the last five
slices were (`comm -12` over `git diff --name-only main...<branch>`), not preference. Three of the
thirteen are **decisions, not implementations**, and an agent cannot take them.

### Do this one FIRST, alone, on `main`

**Thread `onopenfinder`** (`ExhibitView.svelte` :570, :592). Small, and `ExhibitView` is the collision
hotspot for two of the groups below — landing it before any dispatch keeps them disjoint.

### Wave 1 — three disjoint territories, safe in parallel

| slice | tickets | territory |
| --- | --- | --- |
| **dock the chrome** | `de08`, `c30a` (both obviated) | `apps/viewer` chrome components, `packages/archie-viewer/src/`, `packages/render-core` (retire `fitBoundsRect` reservation + `isWholeObjectFor`), `docs/adr/0019`, `recipes/smoke.mjs` |
| **fixtures** | `b135`, `f4fb`, `0cc6`, + the fixture half of `4524` | `apps/viewer/fixtures/`, `apps/studio/src/seed-data*`, `sample-data*`, `gen-published` |
| **small verifications** | `9838`, `d6e9` | `Reader.svelte` (one comment), plus a record-only ticket |

The dock slice is the big one and it reaches `packages/archie-viewer`, so **`1820` moves to wave 2** —
they would collide. It is also a slice with a large *deletion* component, which wants its own review
attention: removing a reservation model is the kind of change where a gate keeps passing because the
thing it measured stopped existing.

Every fixtures ticket is the same shape — *the guard is correct and nothing reaches it*. The
shared-fixture rule governs: **never edit an existing fixture to make one test work; add a new one**
and check all consumers. `4524`'s fixture half belongs here and its control half does not.

`1820` is the biggest single ticket left; note the `eagerGzKB` ratchet bounds it (see
[[archie-viewer-eager-closure]]) — four capabilities added to the embed is exactly the shape that
moves the entry's static closure.

`d6e9` is deliberately **not a fix** — it is `01a6`'s required re-measurement of V23, carried as a
record. Decide whether it closes as-is or graduates into a fix ticket; do not "fix" it blind, which
is the thing it exists to prevent.

### Wave 2 — after wave 1

| slice | tickets | note |
| --- | --- | --- |
| **embed DEFER rows** | `1820` | moved here — collides with the dock slice on `packages/archie-viewer` |
| **baked waveform peaks** | `7b86` V50 | publish-side peaks into the manifest + a reader canvas; NO wavesurfer |
| **finder** | `9eeb` | V106 — the substrate exists, the affordance doesn't |
| **AV** | `7b86` V49, `4524` control half | needs wave 1's fixtures to exist first |

That ordering question is now **answered** — see the decisions section above. The corpus argument
against floating chrome won, so V48's vertical gap disappears rather than being solved and
`c30a`'s structural finding (`fitBoundsRect` never touches `y`/`h`) is moot. Both tickets close as
obviated, and the work is the dock slice in wave 1.

### Wave 3 — last, because it collides with wave 2

**`ecf4`** — `tokens.css` has already drifted between the two apps. Touches both apps' CSS, which
wave 2's chrome work also touches.

### The three that needed the human — ALL ANSWERED 2026-07-26, see the decisions section

1. **`5185` flip-and-read.** A reading decision, not a structural one. `stepIntoReading` was removed
   as a side effect of `01a6`; neither ticket asked for that. Needs someone who actually reads a
   multi-object exhibit end to end. The one test to invert is named in `/tmp/flip-and-read.md`.
2. **`7b86` V50** — whether to add **wavesurfer.js** as a viewer dependency. The ticket's premise
   that it is already one is **false**, so this is a new dep and trips
   [[viewer-optimizedeps-bare-includes]] (needs BOTH a direct dep and an `optimizeDeps.include`
   entry).
3. **`ecf4`** — unify the token files onto one floor, or record why they must stay separate. Either
   is a valid answer; drifting silently is not.

### The three rules the narrative review earned — none written yet

- `test.use({ reducedMotion })` **silently does not apply** describe-scoped in Playwright 1.60 under
  this config: `matchMedia` reads `false` and the test then fails for an unrelated reason. Assert the
  emulation took.
- **Chromium swallows a synthetic wheel outright during a programmatic smooth scroll**, so such a
  test must run under reduced motion or it is measuring Chromium's animation policy.
- **A wall-clock quiet heuristic over `scroll` events is a load-sensitive gate.** This is the general
  form of the wedge the review found, and the one worth having.

### An open question, not a task

CI runs `retries: 1`. That is what would have hidden the narrative flake — the reviewer caught it
only because its first run was under load and it read the *failure* rather than the final tally.
Worth deciding whether a retried-but-passed test should be surfaced. Untouched; leaning yes.

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

## HISTORY — state mid-session: wave 1 two-thirds landed locally, wave 2 running

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

## HISTORY — state at the AV merge (superseded by the lead; kept for its gate numbers and CI note)

**`origin/main` was at `5574fec`+.** Wave 1 (all three slices) and the AV half of wave 2 merged and
pushed. `ux/narrative-coupling` (`6731987`) the only thing left unmerged, awaiting its review.

Merged-tree gates, re-measured after the AV merge: typecheck **6/6** (see the gates block — "7/7"
was reported all session and was wrong; `grep -c "typecheck: Done"` also matches `apps/viewer
pre**typecheck**`, the `astro sync` step) · svelte-check **1520 files 0/0** ·
studio vitest **931 / 70 files** · viewer vitest **176 / 21** · viewer e2e **110 passed, 0 skipped** ·
smoke **42/42, 41 labels, no phantoms/duplicates/strays** · bundle ratchet ok · astro build 8 pages.

### Two jobs waiting on `main` after the narrative merge

1. **Thread `onopenfinder` into both `<MediaPlayerLazy.current …>` instances** (`ExhibitView.svelte`
   :570, :592). `MediaPlayer` declares the prop and passes tag chips to `NotePopup`/`ReadingSheet`
   **only when wired** — deliberate, since `NotePopup.svelte:127` renders every tag as a `<button>`
   calling `onopenfinder?.(t)`, so tags with no handler ship the dead-door defect the slice exists to
   close. **The fixture note carrying a tag is already in place and deliberately unasserted** — write
   the assertion together with the wire and red-green it in one pass.
2. **`ReadingLegend` on AV** — filed as `Archie-4524`. Needs five props threaded AND a fixture AV note
   carrying a `reading`; fixture FIRST, then the control, then revert the fixture and watch it fail.

### Tickets

Closed: `Archie-dbbc`, `Archie-01a6`. **`Archie-7b86` stays OPEN** — V53 resolved (full eleven-drop
enumeration in its body), V49 untaken, V50 deferred because the ticket's premise that wavesurfer.js
is already a dependency is **false**. Open on the map: 15 + `Archie-4524`.

### CI note that cost a diagnosis

The V48 sweep opens all 67 halo notes in ONE test (~31s local) against the suite's 60s default, and
CI overran it. It failed as **"the deep-zoom canvas never painted"** — a true statement about a false
cause. Ruled out the canvas rather than assuming: `openPaintedNote` is the same helper
`selection.spec.ts` calls five times and `canvas-offline.spec.ts` twice, all green in the same run.
Fixed by budget (`test.setTimeout(240_000)`), never by narrowing the sweep — the sweep width is
explicitly not a tuning knob. A per-iteration guard now trips first and reports
notes-done/total/elapsed.

## HISTORY — the first push (`5de64d2`; `origin/main` has since moved to `ef7ef59`)

22 commits, `85c8ba5..5de64d2`. Deploy-to-Pages green; Checks was still running at the time of
writing (4m39s against a 2m31s baseline — expected, the suite grew).

Unrelated but surfaced by the push: GitHub reports **14 Dependabot vulnerabilities** on the default
branch (6 high, 4 moderate, 4 low). Pre-existing, untouched by this work. Remember this repo pins
security overrides in `pnpm-workspace.yaml`, NOT `package.json` — pnpm 11 ignores the latter.

## Wave 2 — the two slices, their findings and their citations (AV has since MERGED)

Both branch from `c4d14d5` (which is now on `origin/main`, so neither is orphaned by the push).

| branch | SHA | tickets | e2e | review port |
| --- | --- | --- | --- | --- |
| `ux/narrative-coupling` | `6731987` | `0d6c` + `c5cb` | **117 pass / 0 fail / 0 skip** | 4364 |
| `ux/av-surface` | `df5038f` | `7b86` V53 only | **109 pass / 0 fail / 0 skip** | 4363 |

Both report check:svelte 1520 files 0/0 (baseline 1519 + one new spec each), typecheck 7/7, vitest 176.

`ExhibitView.svelte` was the one plausible collision and belonged to the narrative slice; the AV agent
escalated rather than editing it, and the narrative agent's only edit there is one line
(`slug={slug}`). Territory held.

### What the narrative slice found

**The guard is original and the corpus actively demonstrates the hazard.** `scrollToBeat` records an
intent (index + deadline); the observer is inert while one is live; the intent ends when the column
goes **quiet** (last `scroll` + 150 ms) rather than on a fixed timer, since smooth-scroll duration is
UA-defined. A wheel/touch/key cancels it outright — otherwise a reader's own gesture re-arms the
suppression it is trying to escape.

Citations, with what each does and does not support:
- **scrollama** — the API choice ONLY. Independently verified: `grep scrollIntoView src/` is empty and
  it only ever *reads* `scrollTop`, so it has no two-directions problem and is no donor for the guard.
  The coordinator's correction confirmed.
- **quire `canvas-panel.js:259`** — calls `goToFigureState` *and* `scrollToHash` straight from an
  IntersectionObserver callback **with no suppression at all**. quire demonstrates the hazard rather
  than solving it. (Under review — this inverts the ticket's framing and is the strongest claim.)
- **quire `intersection-observer-factory.js`** — the observer's shape, ported (root = the scrolling
  column, `rootMargin: '-50% 0% -50% 0%'`, `threshold: 0`, act on `isIntersecting`).
- **anvil `read/Sidebar.svelte` + `editor/Sidebar.svelte`** — persist **width only**, flat global key,
  **no collapse at all**. The corpus says nothing about persisting a hidden panel, so the
  sessionStorage decision is stated as ours.

**Two red-green injections came back GREEN and forced better tests** — the discipline working:
- The cite-landing test did not gate the guard at all. Deleting `if (intentActive()) return;` left it
  passing, because the arrival scroll is instant so the observer's first delivery already sees a
  settled column. The guard's real subject is the **journey**, not the resting place: a smooth
  multi-beat sweep fires a full section change for every beat it passes (note closes, canvas swaps
  object). Replaced with a MutationObserver test recording every `aria-current` transition.
- The first unscoped-key injection only unscoped the **read**, not the write, so the global key was
  never written and the test passed.

**A measured hole, not assumed:** a pure centre-line rule is broken at *both* ends of this column —
the spine header and the V87 foot reservation each exceed half of it, so at `scrollTop 0` no beat
crosses the line and at max scroll the line sits on beat 4 of 6. `beatAtColumnEnd` is checked first in
**both** the scroll handler and the observer; checking only the handler lost to the observer's
callback one frame later.

**`c5cb`:** collapsed flag keyed by slug in **sessionStorage**, width stays global in localStorage —
reading measure is a taste, hiding *this* narrative's spine is not, and a new session always gets the
driving surface back. Collapsed state renders a visible, named **"Show sections"**. V80 re-measured,
not re-fixed (chrome right edge 1247 vs spine left 870).

### Two new measurement traps, rule material if the review confirms them

- **`test.use({ reducedMotion: "reduce" })` silently did not apply** (Playwright 1.60,
  describe-scoped, this config). `matchMedia(...).matches` read `false`, the component took the smooth
  branch, and the test failed for a reason unrelated to the code. Now `page.emulateMedia(...)` **and
  the spec asserts the emulation took**.
- **Chromium swallows a synthetic wheel outright during a programmatic smooth scroll** — the column
  continued to its target as if the wheel never happened. That test therefore runs under reduced
  motion; the smooth variant would have been measuring Chromium's animation-interruption policy.

### What the AV slice found

Ticket said **four** dropped affordances; the prior-art backbone said six; the measured answer is
**ten** — six restored, four enumerated-and-not-built, **three missed by both** (the Escape ladder,
the Details/metadata tab, `object.summary`). Nine red-green injections, all red.

**Stated absence:** nothing in the corpus drives an AV annotation surface in a browser
(`videojs-annotation` is jsdom unit tests, `hyperaudio-lite` ships no tests, `clover-iiif` neuters
canvas in `setupTests.ts`). The hermetic-media approach is `offline.ts`'s own idea applied to a media
element — claimed as original rather than stretched into a citation.

**A FALSE FAILURE, which is rarer here than the false greens:** `route.fulfill` without range support
yields `loadedmetadata`, a correct duration and playback from zero — everything looks healthy — but
Chromium will not seek a resource not advertised as range-capable. `currentTime = 120` left the
playhead crawling up from 0 (measured 14.87 s). The spec now serves **206**. Without it, a seek test
reports the *app* broken when the *fixture* is.

**Reported, not fixed (pre-existing):** the sticky object nav covers **77%** of the first transcript
line at rest (1280×720: aside header 464px, nav y488–576, row 0 spans 464–570). `SidebarObjectNav` is
`position: sticky; bottom: 0` by design.

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

## HISTORY — wave 2 as briefed, before either slice was built

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

Started at **7** open. This paragraph counted **18** mid-session; after the wave-1 and AV closes it
is **16** (15 on the map plus `Archie-4524`) — and `0d6c`/`c5cb` close on the narrative merge,
taking it to 14. Eleven were filed this session; every one is a thing that was
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

```
pnpm --filter @archie/viewer run check:svelte     # 1520 files, 0/0
pnpm --filter @archie/studio run check            # 0/0
pnpm -r run typecheck                             # SIX packages, not seven; TS7; never bare `tsc`
cd apps/viewer && pnpm exec vitest run            # per-app; the ROOT binary fails rune tests
cd apps/studio && pnpm exec vitest run
cd packages/render-core && pnpm exec vitest run
cd packages/render-mount && pnpm exec vitest run
cd packages/archie-viewer && pnpm exec vitest run
node recipes/smoke.mjs                            # 42/42; 41 contracted labels, no phantoms/dupes/strays
pnpm --filter @archie/viewer run e2e              # 110 passed, 0 skipped
pnpm --filter @archie/studio run e2e              # 8; needs --config e2e/playwright.config.ts
cd packages/archie-viewer && node build.mjs --check   # eager 36.1KB / total 266.4KB gz
```

The counts in the comments above are the ones measured at **`ef7ef59`** (current `origin/main`).
`85c8ba5`, the start of this session, was **2621+ unit tests**, 59 viewer e2e, 8 studio e2e, smoke
15/15 — the deltas are what this session added, not drift.

**Two traps that each cost a wrong measurement this session:**

- `recipes/try.html` loads the **root** `/dist/archie-viewer.js`, not `packages/archie-viewer/dist/`.
  Rebuilding the package alone leaves the smoke driving the OLD bundle — it reported a working fix as
  broken. Run `node scripts/sync-dist.mjs` after every embed build.
- Worktree branches are cut from a **stale** `main` snapshot, not current HEAD. `test/viewer-e2e` was
  18 files behind; the merge absorbed it cleanly, but branch from `main` BY NAME and verify before
  building on it.
