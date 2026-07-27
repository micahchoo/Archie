# Review — `ux/fixture-slice` @ `1cdf706` (parent `49327c0`)

Reviewed in worktree `agent-afc9cdda6410329fa`, detached at `1cdf706`; `git log --format=%p -1` = `49327c0`,
tree clean at start and at finish. The branch itself is checked out at `/tmp/fixture-slice` by another
worktree, so this review ran from a detached HEAD at the same SHA rather than from the branch ref.

**Verdict: one BLOCKER (a negative assertion that cannot be made to fail), three SHOULD-FIX, four NIT.
Everything else red-greened. The published tree is byte-deterministic and the fixtures reached it.**

---

## 1. What I attacked, and what happened

The brief's first priority was whether the new gates can fail. I injected **17** defects/probes. Fifteen
went red on the assertion they targeted. **Two stayed green**, and one of those two is the blocker.

Every e2e injection was run against a **freshly built** server on `VIEWER_E2E_PORT=4347` (port confirmed
free before the first run; the server was killed between every injection and each run's log was checked
for `vite-node gen-published` + `astro build` before its result was believed). No run reused a sibling's
build.

### `apps/viewer/e2e/av-surface.spec.ts` — V49, the contested one

| assertion | injection | result |
| --- | --- | --- |
| map does not overlap `.filmstrip` band | `.player` `padding-bottom: var(--strip-h)` deleted | **RED** — `map [24,676 802x24] vs strip [0,602 1280x118]` |
| map does not overlap `.filmstrip` band | `.player` `box-sizing: content-box` | **RED** — same detail line |
| `.tl-track` `toBeInViewport()` | `.player` `height: 130vh` | **RED** — map at y 772→796, viewport 720 |
| map bottom edge `<= vh` | `.player` `height: 121vh` (straddle) | **RED** — `Received 733`, `Expected <= 720` |
| per-frame overlap loop | — | **not isolated** (see NIT-1) |

The two tests genuinely separate the two defects, which is the author's stated design claim and it holds
under measurement: the overlap injection leaves the arrival test green, and the overflow injection leaves
the overlap test green. That is the property that makes this pair worth having as two tests.

**One correction to the record, found by checking that an injection did what I thought it did.** The
commit's comment says Archie-b135 "asks for the `box-sizing` removal as the red-green". Deleting
`box-sizing: border-box` from `.player` is a **no-op** — `packages/render-core/src/tokens.css:201-203` is
`* { box-sizing: border-box; }`, so the computed style is unchanged. I dumped the geometry to confirm:
with the declaration deleted, `.player` still reports `box-sizing border-box`, `.tl-track` still sits at
y 556→580, and the suite is green *because nothing changed*. The ticket's proposed red-green would have
proved nothing. Forcing `content-box` explicitly is what actually reproduces the defect. The author's
decision to write an outcome assertion instead of the mechanism assertion the ticket asked for is
therefore better-founded than the commit message argues — but the sentence as written credits a
red-green that does not exist.

**Is the V49 assertion outcome-shaped or mechanism-shaped?** Outcome-shaped, and it says so where it
matters. It asserts `.tl-track` intersects the viewport and its bottom edge is on screen, with nothing
scrolled first, and the comment states the claim in words — *"the temporal map has to be ON SCREEN, on
arrival, without scrolling"* — and states explicitly why the mechanism assertion was refused. The only
mechanism-shaped thing left is the selector `.tl-track` itself, which every DOM assertion needs. I
verified the cited replacement mechanism: `git show dca4215:apps/viewer/src/components/MediaPlayer.svelte`
has `.player { height: 100% }` with no `--strip-h` reservation and a comment at the cited range saying
the strip is docked in ExhibitView's chrome bar below the column. The citation is accurate and the test
survives that change of mechanism by construction. I did **not** verify the "ships red on `dca4215`"
claim — that would mean driving another agent's in-flight worktree, which the brief forbade.

### `apps/viewer/e2e/note-surface.spec.ts` — the media route (0cc6)

| injection | image-reader test | AV-reader test | rest of file |
| --- | --- | --- | --- |
| `readingSheet = false` removed from `Reader.svelte:633` | **RED** | green | 9 passed |
| `readingSheet = false` removed from `MediaPlayer.svelte:484` | green | **RED** | 9 passed |
| `readingSheet = false` removed from `NarrativeReader.svelte:877` | green | green | **10 passed — nothing caught it** |

The first two rows confirm the author's claim that reverting one implementation leaves the other's test
green, which is the whole justification for writing two tests instead of one. They also confirm the claim
that the pre-existing tests — including `never two aria-modal elements, on any route out of the sheet` —
do not catch either revert. That test's name did promise a route its body never took, and renaming/
annotating it rather than deleting it was the right call.

The third row is SHOULD-FIX-1.

**Vacuity patterns: clean.** There is no `test.skip` and no `if (n < …) return` in the new code.
`openSheetOnAMediaNote` exhausts its loop into a `throw`, which is the correct idiom. The one
`await notes.count()` is preceded by `await expect(notes.first()).toBeVisible()`, so it is the *safe*
form the rule carves out, not the dangerous post-`goto` form. The two inner `count()` calls
(`button.tile`, `button.expand`) can only fail *toward* the `throw`, never toward a false green. The
full viewer suite reports **137 passed** with **zero skipped** — I read the total, not just the word
"passed".

### `apps/viewer/fixtures/fixture-reach.test.ts` (8 assertions) and `apps/studio/src/seed-carry.test.ts` (3)

| injection | went red |
| --- | --- |
| viewer bake's polygon loop disabled | 4 of 8 fixture-reach |
| one vertex removed from the points | `yields all twelve vertices` |
| polygon markup emptied (still literally `<polygon`) | `parseable geometry`, `v1 shape gate` |
| polygon expanded to cover the whole canvas | `drawn as a REGION` |
| `reading` removed from the AV note | `exactly one AV note carries a reading`, `four base AV notes` |
| reading-bearing AV note dropped from the bake | `publishes as a time-ranged note` |
| whole `voynichAvNotes` array emptied | 2 of 8 |
| studio polygon loop disabled | `IDENTICAL selector value` |
| studio mints different markup (` />` → `/>`) | `IDENTICAL selector value` |
| studio AV loop's `reading` spread dropped | `seeds the AV note's reading` |
| **viewer polygon loop's `keep()` filter removed** | **nothing — 8/8 passed** |
| **studio polygon loop's `keep()` filter removed** | **nothing — 3/3 passed** |

The `A LITERAL 1, deliberately, and not voynichPolygonNotes.length` comment is well earned — that is
precisely the trap, and the author avoided it. The `expect(voynichPolygonNotes).toHaveLength(1)` line
beside it closes the loop properly.

---

## BLOCKER-1 — `fixture-reach.test.ts` `is absent from the exhibits that do not carry o9` cannot be made to fail

Two independent probes, neither of which reddened it:

1. **The defect its own comment names.** The comment says *"A polygon leaking into the atlas or the
   sampler would mean the object filter stopped filtering."* I removed the filter — `if (!keep(n.objectId))
   continue;` → `if (false) continue;` in `apps/viewer/fixtures/sample-data.ts`'s polygon loop. Result:
   `Tests  8 passed (8)`. The same injection in `apps/studio/src/seed-data.ts` gave `Tests  3 passed (3)`.

   The reason is structural and it is worth stating because the same mistake is available anywhere in this
   fixture set. `ex-atlas`, `ex-geo` and `ex-sampler` are built by `buildAtlasLog` / `buildGeoLog` /
   `buildSamplerLog` (`sample-data.ts:63`, `:83`, `:102`) — three functions that never reference
   `voynichPolygonNotes`. Only `buildVoynichLog` does. **No change to `keep()` can put a polygon in those
   exhibits**, so the assertion is over data the filter cannot reach. The seed-carry twin has the same
   shape (`seededAtlas` is a different function from `seededVoynich`) and its comment reasons its way into
   the same hole: it correctly notices that rosettes and the grid cannot serve as the negative case, then
   picks the atlas — which is not a negative case for this filter either, it is unrelated data.

   Compounding it: of the three exhibits `buildVoynichLog` produces, the only object-restricted one
   (`voynich-rosettes`, o9-only) *carries* o9. There is currently no exhibit in which the polygon should
   be filtered out, so the `keep()` line in both new polygon loops is an untested branch with no test that
   could ever cover it.

2. **The rename probe.** Pointing the loop at `["ex-atlas-RENAMED", "ex-geo-RENAMED",
   "ex-sampler-RENAMED"]` also gave `Tests  8 passed (8)`. `getLog` is
   `logsById[exhibitId] ?? []` (`sample-data.ts:277`) — an unknown id silently yields an empty log, the
   filter yields an empty array, and `toHaveLength(0)` passes. This is the 33-assertions-to-6 shape
   exactly. The positive test is safe from it (I checked: renaming one id there gives
   `ex-voynich-RENAMED publishes no polygon region`, 1 failed), so the exposure is confined to the
   negative test — but it is the same file.

**The donor fix is already in this commit.** `seed-carry.test.ts`'s `notesOf` asserts
`expect(make, `no seed factory for ${slug}`).not.toBeNull()`, and that guard works: both rename probes
against seed-carry went red with `no seed factory for language-atlas-RENAMED`. `selectorsOf` needs the
same one line, and the negative case needs to be built from an exhibit `buildVoynichLog` actually
produces with o9 excluded — or the assertion should be deleted and replaced with a comment saying no
negative case exists, which is a real finding and worth more than a decorative test.

**Bounded consequence, stated so the grading can be weighed.** No live regression escapes today because
of this — the polygon genuinely does not appear in those exhibits and cannot. It is graded BLOCKER on the
brief's own rule (*"if you inject a defect and the gate stays green, that is a BLOCKER"*) and because a
test that cannot fail is worse than an absent one: it makes the `keep()` branch look covered.

---

## SHOULD-FIX-1 — the guard is implemented **three** times, not twice, and the third is ungated

The commit message and the spec comment both say *"the guard is implemented TWICE (`Reader.svelte` and
the AV reader), and one passing says nothing about the other."* The reasoning is right and the count is
wrong. There are three identical `onmedia={(idx) => { readingSheet = false; … }}` sheet handlers:

- `apps/viewer/src/components/Reader.svelte:633` — gated by the new image-reader test
- `apps/viewer/src/components/MediaPlayer.svelte:484` — gated by the new AV-reader test
- `apps/viewer/src/components/NarrativeReader.svelte:877` — **ungated**

Reverting the third gives `10 passed` on `note-surface.spec.ts` and `137 passed` on the full suite. The
argument the commit makes for writing two tests applies with identical force to a third.

There is a reason it was missed, and it is the same reason this slice exists. `grep -rn '!\[' apps/viewer/fixtures/*.ts`
returns exactly two hits, both in `sampler.ts` (`:135`, `:151`) — and the sampler is not a narrative
exhibit. **No fixture anywhere can reach the narrative reader's sheet-media route.** That is precisely an
unreachable path whose guard is correct and touched by nothing, which is the category the slice was
opened to close. Either the count is corrected to three and a narrative media note is added with a third
test, or the omission is named explicitly as out of scope. What should not stand is a comment asserting a
count that is off by one in the direction that hides a gap.

## SHOULD-FIX-2 — the corrected prior-art claim is flagged but not corrected

The new comment establishes, correctly, that this repo says *"`hyperaudio-lite` ships no test directory
at all"* in two places and that the claim is false — then cites
`.claude/rules/prior-art-citation-discipline.md` as saying to correct it rather than leave it, and leaves
it. Both stale sentences are still in the tree (`apps/viewer/e2e/av-surface.spec.ts` header,
`apps/viewer/e2e/offline.ts` header), untouched by this diff. A correction that names the rule requiring
the fix, and then does not make the fix, is the weakest possible form. Two one-line edits.

## SHOULD-FIX-3 — the `box-sizing` red-green the commit message credits does not exist

Detailed in §1. The commit message says the ticket "asks for the `box-sizing` removal as the red-green"
and the surrounding prose reads as though that path was considered on its merits. It is a no-op against
`tokens.css:201-203`'s global `* { box-sizing: border-box }`. Since the commit message is the durable
record of why the outcome assertion was chosen, it should say the mechanism red-green was **unavailable**,
not merely superseded — that is a stronger argument for the choice actually made. Separately,
`MediaPlayer.svelte:502`'s `box-sizing: border-box` (pre-existing, not this commit) is redundant with the
reset and its explanatory comment overstates it as load-bearing.

---

## NIT-1 — the per-frame overlap loop was never reached under either injection

In both overlap injections the band-level assertion fires first and aborts the test, so
`for (i…) expect(overlaps(map, f))` was never the thing that went red. It is guarded against vacuity by
`expect(n, "no filmstrip frames — this assertion would be vacuous").toBeGreaterThan(0)` — which is the
right guard and it did evaluate — and it is a strict superset of the band check, so this is a coverage
gap in my review rather than a defect. Recording it because "I could not make this fail" is the thing the
brief asked to be reported.

## NIT-2 — `publishes as a time-ranged note` checks the `t=` prefix, not that the range parses

`t: "165,205"` → `t: "999"` (a malformed range, no comma) leaves the suite at `Tests 8 passed (8)`,
because the published value is still `t=`-prefixed. The assertion **is** red-greenable against the defect
it actually names — dropping the reading-bearing note from the bake gives `expected 4 to be 5` — so this
is a narrowing, not a hole. If it is worth closing, assert `parseTimeFragment`-style parseability rather
than `startsWith("t=")`.

## NIT-3 — the arrival assertion checks the bottom edge but not the top

`toBeInViewport()` defaults to `ratio: 0` (any intersection), and the explicit second check is
`map.y + map.height <= vh`. A map whose top edge was above 0 with its bottom on screen would pass both.
Nothing scrolls in this test so it cannot happen today; a symmetrical `expect(map.y).toBeGreaterThanOrEqual(0)`
costs one line and makes the "on arrival, on screen" claim complete.

## NIT-4 — `fixture-reach.test.ts` asserts the in-memory log, not the published artifact

The file header describes itself as the gate on "the published bake", and the first sentence of the
Archie-f4fb block reads as though `public/published/**` is the subject. `getLog` is a lookup into
`logsById` (`sample-data.ts:277`) — the in-memory log the generator consumes, one step upstream of the
committed tree. Nothing in the suite goes red if someone edits a fixture and forgets `pnpm gen`. I
verified the tree is currently correct by other means (below), so this is wording, not a defect — but it
is the exact distinction `.claude/rules/svelte-no-typecheck-net.md` warns about, in a file whose whole
subject is assertions that answer a narrower question than they appear to.

---

## 2. Published tree — determinism and reach (brief §3): **clean**

`cd apps/viewer && pnpm run gen` →

```
Wrote 539 published files → …/apps/viewer/public/published
```

`git status --porcelain` afterwards: **empty**. The committed tree is exactly what this tree's code
produces.

The fixtures reached the artifact — grepped, not inferred from the generator:

- `grep -rl "polygon points" apps/viewer/public/published/` → 9 files: `manifest.json`,
  `canvas/ex-voynich.o9/annotations.json` and one history page for each of `voynich`,
  `voynich-rosettes`, `voynich-reading`. That is all three o9-carrying exhibits and no others.
- `grep -rn "t=165,205" apps/viewer/public/published/` → 6 files, in `voynich` and `voynich-reading`
  only, including `canvas/ex-voynich.o12/annotations-abjad.json` — i.e. the note is published on the
  **abjad reading channel**, not the base channel, which is what the fixture claims and what keeps
  `.cues li` at 4.

## 3. 0cc6's premise (brief §5): **independently confirmed FALSE**

`grep -rn '!\[' apps/viewer/fixtures/*.ts` returns exactly two hits, both `sampler.ts`:

- `:151` — `samplerMediaNotes[0]`, on `ex-sampler.si1`, a whole-object note; prose plus the image, so
  `splitNoteMedia` leaves text behind and the ⤢ renders.
- `:135` — the `t=240,270` cue on `ex-sampler.sa1`, added by the V53 AV slice.

Both predate this commit. The ticket's *"no note in the fixture is both expandable and media-bearing"* is
false, and it is stated as a finding in the commit message with the likely explanation (the measurement
was taken on `voynich`, which has none). No fixture was added, correctly.

The tests over that pre-existing data are **not** tautologies: both go red on their own reader's guard
revert and stay green on the other's, which is proof they consume the app's behaviour rather than
restating the fixture.

## 4. Prior art (brief §6): **every citation I opened checks out**

Opened at the cited lines, not recalled:

| citation | verified |
| --- | --- |
| `anvil/template/exhibits/voynich-manuscript/annotations/88fc0925.json:38` — 5-vertex region | ✓ 5 coordinate pairs, `SvgSelector`, `<svg><polygon points="…" /></svg>`, in `template/` (shipped) not the editor |
| same file `:91` — 11-vertex traced outline | ✓ counted 11 pairs |
| `hyperaudio-lite/__TEST__/test.mp3` is 289 KB | ✓ 289,644 bytes |
| `__TEST__/hyperaudio-lite.test.js:2` is `@jest-environment jsdom` | ✓ verbatim |
| "311 lines of jest" | ✓ `wc -l` = 311 |
| `hyperaudio-lite.js:648-664` re-homes the spoken word to `document.title` | ✓ the `minimizedMode` branch, `document.title = currentWord` |
| `render-svelte/src/index.ts:12`, `:23` — "needn't depend on `@render/mount` directly" | ✓ both, near-verbatim |
| `render-core geometry/selector.ts:32` — `parsePolygonPoints` matches that markup | ✓ `:32` is the `<polygon … points=` regex itself |
| `geometry/mediafragment.ts:20` — `fragmentSelector` | ✓ exact line |
| "render-core exports no `SvgSelector` constructor" | ✓ grep for a definition returns nothing |
| `offline.ts:112-124` — the restated-classifier lesson | ✓ that is the passage |
| `ExhibitView annotationsOf :388-392` — base notes alone while `activeReading === null` | ✓ |
| "the AV surface has no control that can set `activeReading`" | ✓ `ReadingLegend` is imported only by `Reader.svelte:12` and `NarrativeReader.svelte:14`; `MediaPlayer.svelte` renders no legend |
| `sampler.ts:84-90` — the `SamplerTimeNote.tags` carry contract | ✓ |
| `fixtures/voynich.ts:99` — o9 at 7925×7268 | ✓ exact line |
| `dca4215 MediaPlayer.svelte:485-488` — strip docked below the column | ✓ read out of the object store without touching that worktree |

Arithmetic in the fixture comment also checks: x range 935–3030 = 2095, y range 740–2880 = 2140,
2095×2140 ÷ (7925×7268) = **7.78%**, under the 75% whole-object threshold — and the `drawn as a REGION`
test independently confirms it by calling `isWholeObjectFor`.

Two citation nits, both minor. `hyperaudio-lite.test.js:183` is `const src = …querySelector('#hyperplayer').src;`
and the assertion is at `:184`; describing it as asserting "the `data-media-src` STRING" is a paraphrase
of the mechanism rather than of the line. The substance — jsdom never decodes the 289 KB file, only a
string is compared — is correct and is the whole point of the citation.

## 5. Gates I ran (numbers copied from output)

| gate | result |
| --- | --- |
| `apps/viewer` full e2e, `VIEWER_E2E_PORT=4347`, fresh build | `137 passed (1.8m)` — 0 skipped |
| `av-surface.spec.ts` + `note-surface.spec.ts` | `23 passed (25.0s)` |
| `apps/viewer` vitest | `Test Files  22 passed (22)` / `Tests  184 passed (184)` |
| `apps/studio` vitest | `Test Files  71 passed (71)` / `Tests  934 passed (934)` |
| `pnpm -r typecheck` | every package printed `Done`; no error. Tail showed `render-mount`, `render-svelte`, `archie-viewer`, `apps/studio`, `apps/viewer` |
| `pnpm run gen` + `git status` | 539 files written, no diff |

Not re-run: both `svelte-check` invocations. This commit changes no `.svelte` file, so they have nothing
new to say; I did not verify the author's 1522/1159 figures and am not reporting them as confirmed.

## 6. What is good here, and worth keeping as a pattern

Three things in this slice are better than the norm and should survive review intact.

**Importing the app's own predicates instead of restating them.** `shapeLabel`, `selectorBBox`,
`isV1Shape`, `parsePolygonPoints`, `isWholeObjectFor` all come from `@render/core`, with the
`offline.ts:112-124` incident cited as the reason. The `drawn as a REGION, not routed to the whole-object
frame` test is the payoff: it is the one assertion that would catch a polygon that publishes perfectly
and draws nothing, and it exists only because the author went looking for that failure mode before it
happened.

**Refusing a derived expected-count, in writing.** The comment recording that the first draft derived the
expected count from the fixture under test — and that emptying the fixture made it assert `0 === 0` —
is the single most useful sentence in the diff. BLOCKER-1 is the same class, one step further out.

**Reporting two ticket premises as false.** 0cc6 and b135 were both filed on measurements that did not
hold, both are stated as findings rather than quietly worked around, and I confirmed both independently.
That is the outcome the prior-art rule is asking for.
