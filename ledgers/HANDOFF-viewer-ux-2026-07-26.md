# HANDOFF — Viewer UX, third wave (2026-07-26)

Worktrees `.claude/worktrees/chrome-occlusion` (driver) and `.claude/worktrees/merge-main` (merges).
`HANDOFF-viewer-ux-2026-07-25b.md` stays accurate for the second wave.

> **This file accreted chronologically across one long session.** Sections below the lead are
> in the order they were written, so three of them describe states that are now HISTORY — each is
> labelled as such in its heading. **The lead is the only current statement of state.** Where an
> older section's numbers disagree with the lead, the lead wins.

## CURRENT STATE — read this and nothing else for state

**`origin/main` = `ead0ad7`, GREEN on all 10 Checks jobs plus Deploy** (verified against the SHA).
It carries, in order: the studio bundle ratchet's eager/lazy split, and **Archie-a5b1 (V103/V104)**.

| what | state |
| --- | --- |
| studio bundle ratchet | **merged.** `gh-pages-build` passes because the metric changed, not because a baseline moved |
| Archie-a5b1 — rights + metadata on the read side | **merged.** V103 and V104 both closed |
| dock slice | **MERGED** at `dfe7ab4` — all 10 jobs green on `integrate/dock`, fast-forward, no merge commit |
| wave 2 — `1820`, `7b86`/V50, `9eeb`, `ecf4` | **UNBLOCKED.** All four open, genuinely parallel now — no shared files |

**Wave 2, for whoever picks it up.** `ecf4` was the one that had to wait: `--finder-h`/`--topbar-h`
do not survive the dock, so unifying tokens earlier would have unified onto values about to vanish.

| ticket | title |
| --- | --- |
| `Archie-1820` | The embed's four DEFER-tracked capabilities: note media, reading sheet, cite hovercards, search |
| `Archie-7b86` | The AV reading surface (V50 — baked waveform peaks) |
| `Archie-9eeb` | The finder says what it found, not where it is |
| `Archie-ecf4` | Studio and Viewer token files have already drifted — unify onto one floor |

**`main` is checked out in `.claude/worktrees/merge-main`, a peer session's — do not check it out
here, and read the stale-ref warning immediately below before branching off anything.**

### ⚠ THE MAP DISAGREES WITH THE CODE — reconcile before reading `sd ready`

**Measured 2026-07-27, unactioned at time of writing.** `sd list --label map:viewer-ux` reports **10
open**. Four of those entries are stale, so the frontier a reader gets is wrong:

| ticket | what the map says | what is true |
| --- | --- | --- |
| `f4fb`, `b135`, `0cc6` | open | **shipped** — the fixture slice, merged at `8683b02` |
| `4524` | open (blocked) | **unblocked, unbuilt.** Both recorded blockers dissolved: `ExhibitView` is free now the dock landed, and `5252f69` added the reading-bearing AV note it waited for. It is a build, not a blocked ticket — fold it into `7b86`, same surface |
| `d6e9`, `d37d` | open (blocked on the dock) | **unblocked, unmeasured.** Parked for exactly this moment. `d37d` may close as *no longer has a subject* — if `.cite-trigger` moved with the chrome, its occlusion has none |
| `1820`, `7b86`, `9eeb`, `ecf4` | open | genuinely open — wave 2 |

On `map:dc-metadata`: **`a5b1` is merged (`ead0ad7`) and still open.** `aafd` is a live decision for
the human — *should the read boundary reject excluded dcterms properties, or display them?* — a policy
question about what Archie promises, not something to default.

**This is the same failure class the whole effort kept finding, one level up.** A list that claims
coverage it does not have; `sd ready` is a gate whose reference nobody refreshed. The reconciliation
(close with resolution reasons pointing at merge SHAs + ledgers, append gists to the map's
Decisions-so-far) was **recommended and NOT executed** — `.seeds/` writes were not authorised.

**Also unfiled and therefore currently only in prose:** the IIIF MUST-display violation a5b1 found — a
single-object exhibit silently drops its exhibit-level `requiredStatement` for the whole `single`
layout, same for the narrative reader's metadata run. Needs one placement decision in reader chrome at
the *top* of a slice. UV's `CenterPanel.ts:170-174` is the precedent. **It exists in no ticket.**

### Archie-a5b1 — MERGED, and the ticket's premise was half wrong

**V104's "renders nothing, anywhere" is false for the SPA** — driven against the built viewer, the
voynich grid header renders 3 exhibit rows and the reader's Details tab renders 9 object rows. It is
true for the **archival published page**, which is the surface the originating audit (Archie-c405,
*"the published tree's public face"*) was actually looking at: `grep -n metadata static-pages.ts`
returned zero hits. There is also a real seed half — 4 of 7 exhibits carried no metadata at any level.

**V103 fired on both halves at once.** Seed: no exhibit and no library set `rights` anywhere in the
corpus, and three exhibits were lifting only the *credit* half of a rights object while dropping the
licence. Render: even where `rights` was set, the archival page emitted it **only into JSON-LD**, so
no licence URI appeared in any human-readable published page.

**Artifact measurement, counted independently on both sides rather than taken from the report:**

```
main before:  dl class="meta"  0     rel="license"  0
main after:   dl class="meta"  26    rel="license"  40    (216 <dt> rows across 8 pages)
```

Three levels were left **deliberately unlicensed with the reason stated**, because their contents
carry two or three licences and a blanket claim would be false. Six seed URIs still resolve to no
human label — a vocabulary gap in Studio's approved-URI picker, left alone and **pinned by a test**
rather than papered over. Nine others were a one-character `https:`/`http:` mismatch and are fixed.
Full separation evidence: `ledgers/FIX-a5b1-rights-metadata-2026-07-26.md`.

**Queued from it, deliberately not fixed — a single-object exhibit never renders its exhibit-level
credit, licence or metadata anywhere in the SPA.** `MetadataRun` lives only in `ObjectGrid.svelte:50`
and a `single` layout routes straight past it to the Reader; measured `dl.run .pair count=0` against
data carrying 3 rows, with the on-screen credit belonging to the *object*. The exhibit's
`requiredStatement` is a **IIIF MUST-display** and is silently dropped for that whole layout. Same
boundary for the narrative reader (`NarrativeReader.svelte:778` shows the credit, has no metadata
run). The fix is a new prop through `Reader`/`MediaPlayer` plus a **placement decision in reader
chrome** — the dock's territory, so it waits for the dock rather than being decided twice. UV's
`CenterPanel.ts:170-174` is the precedent.

### The note-dismiss reflow — DECIDED by the human: accept it

Dismissing a note removes the docked note row, the canvas grows 416 → **557px** (Δ +141, exactly the
row), OSD re-fits and the image moves. Three options were costed; **option 2, accept the reflow,** was
chosen: *the reader dismissed the note in order to see more image, so giving them more image is
correct, and a permanent 141px reservation is 25% of the canvas paid in the common case — it undoes
the `:empty` gating this slice built to keep the chrome tax proportional.*

**Option 3 was measured and FAILED — worse than doing nothing.** Same instrument, same N, quiet
machine, fresh build each: baseline **17/20** passing; `preserveImageSizeOnResize: true` **9/20**.
15% → 55% failure. The option preserves *size* and says nothing about *anchor*, so holding on-screen
size across a 141px growth forces a zoom change and the mark moves further. Reverted. The grep that
made the try worthwhile: we set no `autoResize`, no `preserveImageSizeOnResize`, and drive no fit on
container change (`mount.ts:429`'s only resize handler is `renderNavDots`) — the behaviour was pure
OSD default.

**The underlying reflow is deterministic, not flaky.** The suite's intermittency was only whether the
mark stays big enough to catch the remembered pixel. `selection.spec.ts:96` is now **two assertions**,
both shipped:

- **A** — keeps the real-mouse hit test, re-derives the mark's box after dismissal from
  `#archie-object-frame` (image-anchored, survives deselection; presence asserted, not skipped on).
  Red at **4 failed/10** with re-derivation disabled; green at **20/20**, up from the 17/20 baseline.
- **B** — pins the decision: the dismissed row's height goes back to the image. Red at **3/3**, message
  `the canvas grew by 71px but the note row was 141px`.

**Two invariants were INVENTED and killed by repeat-running — both are documented in the test as
explicitly NOT asserted, with denominators.** My brief asserted "the mark's screen position
consequently moves"; that was my generalisation from one observation and it is false. Measured on the
note `aHaloNote` actually returns: translation **0px, 20/20**; no-rescale false **5-in-20** (frame
width 1841 → 1975). Whether growing the viewport re-centres, rescales or does neither depends on
**which dimension binds the fit** — so neither is a property of the design, and asserting either would
have gone red on correct code. This is why A *derives* the position rather than computing an offset.

**Why B took six attempts, and the finding is bigger than B.** Five injections went into
`Reader.svelte`. The fixture exhibit is a **narrative** one, so the test drives
`NarrativeReader.svelte` — a component that route never renders. They compiled, shipped, and `grep`
found them in the built JS every time. Recorded as habit **1a-bis** in
`[[post-review-fixes-are-unreviewed]]`: *"it's in the build" is not "it ran."* Also from that
falsification: at `flex: 1000` the canvas starves and the run dies on a **precondition** failure
(*"the deep-zoom canvas never painted"*), which proves nothing — `flex: 1` is what falsifies the claim.

### ⚠ BRANCH FROM `origin/main`, NEVER `main` — the local ref is STALE

Local `main` sits at **`879e519`**; `origin/main` is at `ead0ad7` — **five commits ahead.** The merges in this effort were pushed
with `git push origin HEAD:main`, **which does not move the local ref**, and local `main` is checked
out in `.claude/worktrees/merge-main` (a peer session's), so it cannot be safely fast-forwarded from
here — advancing a ref under a checked-out worktree leaves that worktree's files inconsistent with it.

So `git checkout -b <branch> main` silently gives you a base two or more commits behind. Measured
2026-07-26: `integrate/a5b1` was cut that way and came out **without the ratchet fix that had already
been merged**. It was caught only because the editor flagged files as "modified" that showed my own
committed work missing — not by any check.

```
git fetch origin && git checkout -b <branch> origin/main     # correct
git checkout -b <branch> main                                # STALE base
```

Same for merging: `git merge origin/main`, not `git merge main`. Resolve properly by advancing local
`main` once the `merge-main` worktree is free.

**`main` = `1f9ae8b` and is GREEN — the red ratchet is merged.** All 10 Checks jobs plus Deploy
pass at that SHA (verified against the SHA, not just the top of the run list). `gh-pages-build`,
the job that was red, passes because the metric changed — **not** because its baseline was moved to
accommodate it.

`main` moved twice under this work. The sequence, because the next reader will otherwise mistrust
the merge: built off local `main@c10307c` → branch green at `f9aa11e` → `origin/main` had advanced
to `879e519` (a peer's prototype/doc deletions) → merged that in, file sets disjoint asserted by
`comm -12` (empty) → **re-ran the ratchet and the scripts suite after the merge** rather than
assuming deletions were inert → fast-forwarded. `fix/studio-eager-ratchet` still exists and is
identical to `main`; it can be deleted.

**Dispatched and in flight:** `rights-metadata-a5b1` (worktree-isolated, branch
`fix/a5b1-rights-metadata`) on Archie-a5b1 — V103/V104. Its first job is diagnostic: separate the
SEED gap from the RENDER gap, which the ticket notes nobody has done and which have opposite fixes.
Territory-fenced away from canvas chrome, `smoke.mjs`, `bundle-size.mjs`, studio's vite config and
`checks.yml`.

**Corpus sweep landed:** `ledgers/PRIORART-chrome-placement-2026-07-26.md`. See below — it changes
what ADR-0019 is allowed to claim.

The fixture slice is MERGED; the dock slice is under review and NOT merged.

| sha | what |
| --- | --- |
| `cb1bbfe` | `5185` closed, `d37d` filed, `d6e9`+`d37d` blocked on the dock decision |
| *(≈20 commits)* | **a CONCURRENT SESSION's studio work** — Settings phase 1, preview/export lane, `previewTree`, single-file IIFE viewer target. Not ours; see the red ratchet below |
| `24733fd` | `de08`, `c30a`, `9838` closed (written by `sd` to the CANONICAL checkout, copied across) |
| `0637a05` | the fixture-slice review report, preserved off its subagent worktree |
| `8683b02` | **merge: the fixture slice** — f4fb, 4524, 0cc6, b135 |
| `a440721` | the flake fix that merge shipped (see below) |
| `6dec59b`, `7ee0b82` | `a-green-run-is-one-sample.md` + the counting-trap sharpenings |

### ✅ RESOLVED — the ratchet now measures the load path (was: `main` IS RED)

**Fixed on `fix/studio-eager-ratchet`; the section below is the diagnosis, kept because it is the
evidence.** The eager/lazy split was taken, not the baseline raise. What shipped:

- `apps/studio/vite.config.ts` gains `build.manifest: true` — nothing serves or reads it; it exists
  so the ratchet can walk the entry's static closure.
- `scripts/lib/eager-closure.mjs` walks Vite's manifest from every `isEntry` following `imports` and
  **never `dynamicImports`** — the same boundary `packages/archie-viewer/build.mjs:139` draws off
  esbuild's metafile (`kind === "import-statement"`). Extracted to `scripts/lib/` so it is testable
  without a dist; seven cases, including "the lazy chunk's static subtree stays out" and "one static
  edge brings the whole subtree in".
- Both metrics ratchet per app. Studio: **454.3 KB eager / 875.1 KB total** — 420.8 KB of the dist
  is lazy. Viewer is Astro and multi-page, emits no manifest, keeps totals only (a stated gap).
- A baseline that exists with **no measurement beside it** is a FAILURE, not a skip — otherwise
  deleting `build.manifest` would silently retire the gate.
- The total baseline moved 558.8 → 875.1 **deliberately, in that commit**, and only because the
  metric that constrains the load path now exists beside it.

**Red-green, measured, not asserted.** A static `import "@render/archie-viewer/single?raw"` in
`main.ts`, rebuilt:

```
ok    apps/studio dist (js+css gz) [total]     875.1KB → 875KB   (Δ -0.1KB, allowed +87.5KB)
FAIL  apps/studio dist (js+css gz) [eager]     454.3KB → 729.1KB (Δ +274.8KB, allowed +45.4KB)
```

**Total moved −0.1 KB while 274.8 KB landed on the load path.** That is the blindness, in this
repo's own numbers, in the direction that matters. Exit 1 confirmed directly — the first reading was
`exit=0` because `$?` after a pipe is `tail`'s status, which is the same "name the question the
probe answers" trap the rules describe. Removing the manifest also correctly fails. Restored, green
again, from a full `scripts/build-gh-pages.sh` (the exact CI build path).

**A second gate was found switched off while doing this.** `node --test` on a glob matching
**nothing** prints `tests 0` and **exits 0**. CI's `unit-scripts` job ran
`node --test scripts/lib/*.test.mjs` bare, so renaming that directory would have left the job green
under a name that still read as enforcement. It now refuses an empty match and echoes the files it
runs; the floor is *derived* (>0 files found), never a stored count. Found the honest way: my own
first run of the new suite reported 0 tests / exit 0 because my shell was in `apps/studio`.

### ⚠ HISTORY — the diagnosis that led there

```
FAIL  apps/studio dist (js+css gz)  558.8KB → 875.1KB (Δ +316.3KB, allowed +55.9KB)
ok    apps/viewer dist (js+css gz)  368.1KB → 388.9KB (Δ +20.8KB, allowed +36.8KB)
```

`d620093 feat(studio): export a self-contained viewer + library` (the concurrent session's) embeds the
IIFE viewer bundle. It surfaced only at `8683b02` because **their own rapid pushes cancelled every
Checks run on their commits** — ours was the first to complete.

**The bytes are NOT on the startup path**, measured rather than inferred: `archie-viewer.single-*.js`
is 936K and referenced **zero** times from `index.html`; `publish-flows.svelte.ts:401` reaches it via
`import("./single-file-export.js")`. So the feature is correctly lazy. **The root ratchet measures
`apps/studio dist` as a TOTAL and cannot tell eager from lazy** — the same blindness
`[[archie-viewer-eager-closure]]` documents from the other side, which is exactly why the embed grew a
separate `eagerGzKB`.

Three options, put to the human, undecided at time of writing: raise the studio baseline (fast, and
the move the rules warn about — a gate satisfied by moving its own reference); give studio's ratchet
an **eager/lazy split** like the embed's (recommended — passes honestly and makes the metric answer
the question people think it asks); or leave it red (not viable, it blocks the dock merge).
**Taken: the split.** One correction to the diagnosis above, since a reader will otherwise carry the
wrong file: the lazy reach is `publish-flows.svelte.ts:402`,
`import("@render/archie-viewer/single?raw")` — a direct dynamic import of the package subpath, not
`import("./single-file-export.js")`. And it is not the only lazy weight: `import("utif2")`
(`tiff-transcode.ts:36`) is another 39 KB gz. Together ~319 KB of the +316.3 KB.

### PRIOR ART — ADR-0019 cannot claim a "corpus default"

`ledgers/PRIORART-chrome-placement-2026-07-26.md` (universalviewer, mirador, annomea, quire; none
previously swept, every line opened at the cited line). Across seven systems the count is **2 dock /
3 place something over the canvas / 2 abstain**.

The result worth knowing is **mirador**, which splits by chrome *class* rather than taste:
structural navigation docks (`Window.jsx:96-131`, a persistent Drawer at `position: relative
!important`) while the canvas's own zoom/nav bar floats (`WindowCanvasNavigationControls.jsx:18-31`,
`position:absolute; bottom:0; z-index:50` at 50% alpha, a child of the OSD section).

So the claim that survives: **structural chrome docks wherever a system has any; instrument chrome
routinely floats** — which makes Archie's second half a deliberate departure, not a convention.
The ledger carries the exact ADR sentence. **annomea is the honest counter-example even to the
narrowed form** — it floats a 420 px narrative pane with zero inset compensation, and that belongs
in the ADR too.

The sweep also corrects **BLOCKER 1 by one word**: `_esper.scss:175` is `position: relative`; the
`absolute` at `:179-184` is gated on `.esper.overlay-mode` (applied at `esper/container.js:39`). The
tropy citation is right about the mechanism and dies on contact with line 175 if phrased
unconditionally. Corrected sentence is in the ledger.

### The flake that reached `main`, and the rule it earned

`8683b02` shipped a test failing **9 times in 20** against a correct tree. Fixed in `a440721`
(verified independently here at 25/25 and 20/20; the author's own tallies 30/30). Cause, read from
source: `AnnotationSession.createNote` mints through `newRecord` with **no seeded rng** — the viewer's
bake threads `seededRng(slugSeed)` for ADR-0014 durable anchors — so two notes minted in the same
millisecond are ordered by `Math.random` under `projectHeads`' `(logicalId, rev)` sort.

It reached `main` past four people, each of whom ran it exactly once. New rule:
`.claude/rules/a-green-run-is-one-sample.md`. **The reviewer's injections and the author's green run
answer different questions, and neither answers the other's.**

**Next-actions 1–5 from the previous lead are all DONE.** Only `ecf4` (tokens) is outstanding, still
sequenced AFTER the dock work because `--finder-h`/`--topbar-h` do not survive it — the dock retires
both.

### THE DOCK SLICE — review items ALL CLOSED at `e956e10`; one NEW defect open

**Both blockers and all should-fixes are done** on `ux/dock-chrome-recovered` (worktree
`.claude/worktrees/dock-chrome-solo`), gates at `e956e10`: typecheck 6/6 · viewer `check:svelte`
1523 0/0 · studio `check` 1179 0/0 · vitest viewer 184 / render-mount 191 / archie-viewer 185 ·
smoke **PASS 45/45, 44/44 labels** · viewer e2e **139/1** · `dist/` clean after rebuild+sync.

B1 (tropy) and B2 (clover's `Main`) were both re-verified from source by the author, who also
diagnosed B2's own cause in the ADR rather than quietly correcting it: *opened the file, confirmed
what `Main` is, did not grep where it is used* — inside the commit that was fixing the previous bad
citation. S2 is the one worth carrying: `boxes.length >= N` is now a **named REQUIRED set** in both
`occlusion.spec.ts` and `smoke.mjs`, red-greened (renaming `.canvas-dock` now FAILS with
`docked chrome that MUST be on screen is absent: .canvas-dock`; it was green before).

**⚠ NEW DEFECT, open, and it is a design call — not a test bug.** The 1 failure in 139 is
`selection.spec.ts:96` "a REAL mouse click on a mark opens its note", sampled at **2 failures in 8**.
Measured at 1280×720 on the painted `screenshots` canvas:

```
with the note open   .openseadragon-canvas  y 114  h 416     .note-dock 141px
after Escape         .openseadragon-canvas  y 114  h 557     .note-dock gone
                                             Δ h  +141
```

Dismissing the note grows the canvas by the note row's height, **OSD re-fits, and the image moves**.
The test measures a halo's screen box, presses Escape, then clicks that same pixel cold — its
premise ("dismiss, leaving the image exactly where it is") was true pre-dock, when the card floated.
The dock invalidates it. Three options: reserve the row permanently (canvas pays ~141px always,
contradicting the `:empty` gating); accept the reflow (the camera shifts under the cursor); or give
the space back without re-fitting (`preserveImageSizeOnResize`).

**Author is measuring the third under a scope grant to `@render/mount` OSD config.** The decision
rule given: *if the fix is right, the test becomes true again on its own terms and needs no edit* —
its premise is a statement about what the reader experiences, not a test artifact. Acceptance
criterion is the **halo's** screen box unchanged (±1px) while the canvas grows, sampled ≥20×;
`preserveImageSizeOnResize` preserves *size* and says nothing about *anchor*, so a re-center would
move the halo by half the delta and means option 3 failed. If it fails, options 1 and 2 go to the
human — that one is not the fleet's to call.

**Also worth a grep before trusting the OSD option:** check whether the resize path here is
`autoResize`, or whether `read-mount`/`createMount` drives its own `fitBounds` on container change.
If we re-fit ourselves, the OSD option never reaches it and the fix is in our code.

### ⚠ HISTORY — the review as delivered (two citation BLOCKERs, since closed)

Report: `ledgers/REVIEW-canvas-chrome-dock-2026-07-26.md` (preserved on `main` at `cac7605`).
**Verdict: approve the code, fix the evidence.**

Passed: **zero live consumers** of anything retired (per-name, across definitions, type refs, string
literals, barrels and tests); 207→191 reconciled **three independent ways**; replacements proven
*stronger* by injection; geometry clean at **eight** viewports including 900×600 / 900×1400 / 1280×500,
none of which the author tested; ten-times runs on every changed assertion, zero flakes. The reviewer
re-ran the author's smoke injections rather than trusting them, and confirmed `dist/` reproduces
byte-for-byte with `eagerGzKB` unmoved at 39.3 KB.

**BLOCKER 1 — tropy is cited for the opposite of what it does** (ADR-0019 `:141-142`,
`ExhibitView.svelte:703-705`, and this file `:365`, since fixed). See the corrected paragraph below.
**BLOCKER 2 — clover's `Main` is not the header's parent**, and the false sentence was added by
`d43155c`, *the commit that fixed the previous bad citation*: the author opened the file, confirmed
what `Main` is, and did not grep where it is used. The premise survives (`Viewer.tsx:180-184` really
does make them siblings); only the mechanism is wrong. A better unused citation exists — inside `Main`,
`<Painting>` and `<MediaWrapper>` are flow siblings, i.e. clover docking a strip *below* the canvas.

**SHOULD-FIX worth carrying:** `occlusion.spec.ts`'s `boxes.length >= N` is a **threshold, not a
per-selector requirement** — renaming `.canvas-dock` left both suites green, and `smoke.mjs` has the
identical shape. Also `occlusion.spec.ts:196`'s "THE VIEWER NEVER PASSED IT" is false and was false
when written (`Reader.svelte:375/:406/:392` at `d6ff592`); the deletion is still right, the rationale
is not.

**Do not re-derive this:** the reviewer measured `seed-carry.test.ts` red ~1-in-3 on `integrate/dock`
and ~5-in-12 on `8683b02`. That is the flake fixed by `a440721`, which postdates the merge base — it
arrives when `main` is re-merged. Not the dock's doing, not still open.

### Integration state

`integrate/dock` = **`5842087`** = `main@8683b02` + dock's `d43155c`, nine conflicts resolved (all
duplicate-content from the `-A` sweep; all taken from main's reviewed side, then verified
byte-identical). **It is now well behind `main` and must be re-cut after the citation fixes land** —
one integration merge, not two.

`integrate/dock` = **`5842087`** = `main@8683b02` + dock's `d43155c`, nine conflicts resolved (all
duplicate-content from the `-A` sweep; all taken from main's reviewed side, then verified
byte-identical). **It is now behind `main` by four commits and must be re-merged before it lands.**

Dock's own tip is `d43155c` on `ux/dock-chrome-recovered`, worktree `.claude/worktrees/dock-chrome-solo`.
`ux/dock-chrome` is an **empty label at `49327c0`** — it never advanced, and three separate false
"my work was destroyed" conclusions were drawn from reading it.

**V49 is fixed.** Author's numbers at 1280×720, `#/voynich` → Kryptogramm, offline: `.tl-track`
y 550→574 **ratio 1** (was ratio 0), `.filmstrip` y 603→712 ratio 1, `.player` y 53→594, document
**720/720** (was 1045/720). Image / image+note-open / narrative / gallery all 720/720. Cause was
`.shell { min-height: 100dvh }` — `min-height` lets percentage heights below resolve to `auto`, so any
route with intrinsic height grew the document. Fix: `height: 100dvh` + `overflow: auto` on `.route`.

**The 35 failures were ONE cause.** Suite now 140/0. Five assertions genuinely changed subject and
were **replaced, not deleted** — `read.spec.ts:11,24` and `object-nav.spec.ts:53,69` moved from
`closest("main")` to `closest(".canvas-dock")` plus geometric clearance (V40/V80's fix was moving
chrome INTO `main`, so containment there would now mean chrome is back on the image);
`canvas-keyboard.spec.ts:95` `.reader > main` → `.reader main`.

**One finding AGAINST the brief, and the agent was right to stop.** `isWholeObjectFor` is **not** part
of the reservation model — it answers ADR-0018's whole-object-frame question and has three live
consumers (`ExhibitView.svelte:458`, studio `App.svelte:1504`, `e2e/offline.ts:127`). My dispatch brief
listed it for retirement; deleting it would have removed the whole-object border from both apps.

### ⚠ HISTORY — WAVE 1 RAN WITH THE TWO AGENTS SHARING ONE WORKING TREE

`impl-dock-chrome` (de08 + c30a + 9838) and `impl-fixture-reach` (b135, f4fb, 0cc6, 4524-fixture-half)
were dispatched **without worktree isolation**. Both are operating in
`.claude/worktrees/chrome-occlusion`. The reflog shows them checking out over each other:

```
49327c0 HEAD@{14:12}: checkout: moving from ux/dock-chrome to ux/fixture-reach
49327c0 HEAD@{14:11}: checkout: moving from probe/rev-narrative-arrival to ux/dock-chrome
```

**Consequence: the dock agent's commits are landing on `ux/fixture-reach`.** `e8cef6f "wip: retire
the fitBounds chrome reservation"` is dock work sitting on the fixture branch; `ux/dock-chrome` is
still at the base `49327c0`. This is recoverable — the commits are linear from `49327c0`, so the
branch LABEL can be re-pointed afterwards — and both agents have been told, mid-run:

- do not `checkout` / `switch` / `branch -f` / `reset` / `stash` for any reason (a checkout now would
  strand commits and could destroy the other's uncommitted edits in the same tree);
- never `git add -A` or `commit -a` — that sweeps the sibling's in-flight work into your commit;
- never `git checkout -- <file>` to undo a red-green probe.

**Whoever picks this up: sort the branch topology yourself, do not ask the agents to.** And a
snapshot of the dock work as it stood at 14:21 is at `/tmp/dock-wip-142149/` (patch + the deleted
`zz-probe.spec.ts`), taken before any of this was understood.

The lesson, which belongs in the fleet's habits and not just here: **`isolation: "worktree"` is a
parameter, not a default.** Two agents briefed to work on disjoint file territory are still not
disjoint if they share a checkout — territory separates their *edits*, nothing separates their *git
state*. Verify the worktree list after dispatch, not the brief.

**REVERSED, 14:5x — the fixture slice is being extracted and merges to `main` FIRST.** The paragraph
below is what I decided an hour earlier on the information then available; the reversal is recorded
rather than overwritten because the *reason* is the useful part. What changed was a measurement, made
by the fixture agent in a clean worktree cut at `49327c0` with only its own paths applied:

| tree | result |
| --- | --- |
| base `49327c0` alone | 36/36 pass |
| base + fixture paths only | **85/85 pass** — both V49 tests and both media-route tests included |
| `ux/fixture-reach` HEAD (dock's WIP in it) | **~35 failures** across eight spec files |

A slice that is finished, isolated and provably green does not wait behind an unfinished slice with a
known regression — and the ordering is independently right, because those fixtures are the
**dependency** of the V49 gate that measures the dock work. Branch `ux/fixture-slice`, cut from
`49327c0`, carrying only: `apps/studio/src/seed-carry.test.ts`, `apps/studio/src/seed-data.ts`,
`apps/viewer/fixtures/`, `apps/viewer/public/published/`, `apps/viewer/e2e/av-surface.spec.ts`,
`apps/viewer/e2e/note-surface.spec.ts`.

Known consequence, mine to resolve at merge time and nobody else's: `note-surface.spec.ts` also
exists inside dock's `dca4215`, so the wave-1 branch will conflict on duplicate content when `main`
is merged into it.

**Superseded — kept for its reasoning: `ux/fixture-reach` IS wave 1, and merges as one unit.** The `-A` hazard fired — dock's
`dca4215` swept two of the fixture agent's in-progress files (`e2e/av-surface.spec.ts`,
`fixtures/fixture-reach.test.ts`) into a dock commit. Nothing was lost, but splitting the branch back
into two clean slices would be per-file surgery on two agents' in-flight work, which is more risk
than the separation buys. So dock + fixture merge and get reviewed together, and `ux/dock-chrome`
stays an empty label. Both agents are now adding explicit paths only. The fixture agent will name,
in its report, which of its files landed inside `dca4215`, so a reviewer of that commit knows two
hands are in it.

### REVIEW OF THE FIXTURE SLICE — 1 BLOCKER, 3 SHOULD-FIX, 4 NIT

Report: `ledgers/REVIEW-ux-fixture-slice-2026-07-26.md` in worktree `agent-afc9cdda6410329fa`
(**not on any branch** — copy it before that worktree is reaped). **17 injections, 15 went red.**
Fix commit `1d3e33a` landed at 15:34; its red-greens are not yet reported and it has a possible
`pnpm typecheck` error at `seed-carry.test.ts:36` that is unconfirmed at time of writing.

**BLOCKER — a negative assertion that cannot fail.** `fixture-reach.test.ts` `is absent from the
exhibits that do not carry o9`: deleting the object filter outright (`if (!keep(…)) continue` →
`if (false) continue`) left it at `8 passed`, and the studio twin at `3 passed`. Structural, and the
shape generalises: `ex-atlas`/`ex-geo`/`ex-sampler` come from three builder functions that never
reference `voynichPolygonNotes`, so **no change to the filter can reach them**. Worse, of the exhibits
`buildVoynichLog` does produce, the only object-restricted one (`voynich-rosettes`) *carries* o9 — so
no exhibit exists in which the polygon should be filtered out, and `keep()` is an untested branch with
no test that could cover it. A second probe renaming the ids also passed, because `getLog` is
`logsById[id] ?? []` and an unknown id yields `[]` → `toHaveLength(0)` → green. The donor fix was
already in the same commit: `seed-carry.test.ts`'s `expect(make, \`no seed factory for ${slug}\`)
.not.toBeNull()`, which *did* redden under the rename probe.

**SHOULD-FIX 1 — the guard is implemented THREE times, not two.** `NarrativeReader.svelte:877` is
ungated; reverting it leaves `note-surface.spec.ts` at `10 passed` and the full suite at `137`. The
reason it was missed is the slice's own subject: `grep -rn '!\[' apps/viewer/fixtures/*.ts` returns two
hits, both in `sampler.ts`, and the sampler is not a narrative exhibit — **no fixture can reach the
narrative reader's sheet-media route at all.**

**SHOULD-FIX 3 — `Archie-b135`'s own proposed red-green is a NO-OP, and this is worth carrying past
this slice.** The ticket asks the V49 fix be proven by deleting `box-sizing: border-box` from
`.player`. `packages/render-core/src/tokens.css:201-203` is `* { box-sizing: border-box; }`, so
deleting the declaration changes no computed style: the reviewer dumped the geometry and `.player`
still reports `border-box`, `.tl-track` still sits at y 556→580, and the suite stays green **because
nothing happened**. Forcing `content-box` explicitly is what reproduces it. So the author's choice of
an outcome assertion over the mechanism assertion is better-founded than their commit message argues —
the mechanism red-green was *unavailable*, not merely superseded. **A ticket that prescribes its own
red-green is prescribing an untested probe.**

**Verified clean by the reviewer:** published tree regenerates byte-identical (539 files, empty `git
status`); the fixtures reached the artifact, grepped rather than inferred (polygon in exactly the 9
o9-carrying files, `t=165,205` on the abjad reading channel only); zero vacuity patterns, zero skipped
tests; and **all sixteen prior-art citations opened at their cited lines and confirmed.** It did not
re-run either `svelte-check` (no `.svelte` file changed) and says so rather than inheriting the
author's figures.

### The fixture slice — FINISHED, and its report exists nowhere but here

`ux/fixture-slice` = **`1cdf706`**, parent `49327c0`, not merged, not pushed. The agent's operating
instructions forbid writing report files, so its findings came back as chat text only — which is why
they are transcribed here rather than linked. **A sweep of the repo for a report file is correct and
will find nothing.** Worth knowing before dispatching: an agent that cannot write files has a report
with the lifetime of a conversation.

Path set verified independently by the lead (`git diff --name-only 49327c0..ux/fixture-slice`), not
taken from the agent: 36 paths, **0 outside the allowed set**. Gates, all run in its own worktree on
port **4355** (confirmed free first, both runs logging `vite-node gen-published` + `astro build`,
server killed after): `pnpm -r typecheck` 6/6 · viewer `check:svelte` 1522 files 0/0 · studio `check`
1159 files 0/0 · viewer vitest 184/184 · studio vitest 934/934 · **viewer e2e 137/137**. `git status`
empty after the e2e prebuild's regen, so the committed published tree matches a fresh generation.

**The file partition, which is the thing a reviewer of the tangled branch needs:**

| dock commit | fixture files swept into it |
| --- | --- |
| `dca4215` | `e2e/av-surface.spec.ts` (+82, the V49 gate), `fixtures/fixture-reach.test.ts` (+8) |
| `96f3933` | `e2e/note-surface.spec.ts` (+85, both media-route tests) |
| `b93785b` | none |

Converse: **11 of dock's files** inside the fixture agent's `5252f69`.

**`Archie-0cc6`'s premise is FALSE, and that is the finding.** The ticket says no fixture note is both
expandable and media-bearing. Driving every object and every note in both readers, offline, against
the built bundle: the sampler already had **two** — `si1`'s whole-object note (original sampler
content, predating the ticket) and V53's `t=240,270` cue — each rendering a tile inside the open
sheet. The voynich sweep found none, which is almost certainly the exhibit the ticket's own
measurement was taken on. The route was reachable; only the assertion was missing. So: **no fixture
added, two assertions added**, one per reader, because the guard is implemented twice.

The set-difference check was **broken twice before it worked**, and the agent reported that rather
than only the clean run: the first fed `comm` unsorted input; the second derived the allowed list's
directory prefixes from the commit under test, which is tautologically empty for the prefixes holding
32 of 36 paths. The run that counts states the allowed set independently — four literal filenames,
two literal directory prefixes.

### ⚠ V49 HAS REGRESSED ON THE DOCKED BUILD — found by the gate `b135` asked for

The best thing wave 1 has produced so far, and it is a *finding*, not a deliverable. `Archie-b135`
asked for a gate that the AV temporal map is not covered by the item strip, red-greened by removing
`box-sizing: border-box` from `.player`. **That fix no longer exists** — dock retired the `--strip-h`
reservation and moved the strip into ExhibitView's chrome bar. So the agent rewrote the assertion
against the OUTCOME rather than the mechanism, and it went red. Measured on `dca4215`, offline,
1280×720, `#/voynich` → Kryptogramm, real decoded duration:

```
viewport      720
.player       y 53  → bottom 917  (h 864)   ← 197px past the fold
.tl-track     y 873 → bottom 897             ← starts 153px BELOW the fold
.filmstrip    y 926 → bottom 1037            ← also entirely below the fold
document      scrollHeight 1045 vs clientHeight 720
ancestors     overflow-y: visible            ← the whole PAGE scrolls now
```

`toBeInViewport()` on `.tl-track` reports **viewport ratio 0** on arrival.

**Ruled a real regression, not a new baseline.** The no-overlap assertion passes — the strip no longer
covers the map — but the map is now off the bottom of the page instead. The dock ruling's entire
justification was that floating chrome kept *covering* things (the drift badge and the degrade notice
had each been evicted from two corners for stealing clicks); satisfying it by pushing the transport
controls below the fold is the same defect in different clothes, and worse, since an overlapped
control is at least visibly present. b135 named this failure mode in advance — "a different defect
wearing the fix's clothes, which a strip-overlap-only test calls fixed" — and the gate caught exactly
it.

**The gate ships RED.** It is not being re-scoped to "reachable by scroll"; that would be lowering a
bar to accommodate unreviewed WIP.

Suspected mechanism, handed to dock to verify rather than to accept: `.shell` is `min-height: 100dvh`,
which *permits* document growth where the pre-dock shell was viewport-bounded because the chrome was
`position: fixed` and contributed no height. And `.route > :global(*) { flex: 1 1 auto; min-height: 0 }`
reaches only the route's DIRECT child — if ExhibitView's internals don't carry `min-height: 0` down to
the player column, the flex constraint stops one level in and everything below sizes intrinsically.
**The image route has not been checked for the same growth**, and must be: a deep-zoom canvas inside a
growable document resizes itself forever.

Merged: `ux/note-surface`, `ux/offline-canvas`, `ux/embed-parity`, `ux/av-surface`,
`ux/narrative-coupling`.

> **CI trap worth knowing.** The run for the *previous* commit `c34f359` reads `cancelled`, and that
> is not a failure — pushing `04d38ce` while it was still running triggered the workflow's
> concurrency group and killed its e2e job mid-flight. Nine jobs had already succeeded. If you push
> twice in quick succession, check the run for the LATEST sha; the older one's `cancelled` is
> self-inflicted and means nothing.

**Merged-tree gates as of `04d38ce`** — measured locally on `37783df` before the push, not inherited
from any branch, and independently confirmed by CI at `04d38ce`. The four commits since are docs,
one small viewer wire, one CI reporter and three rules; **nothing since has re-run the full set**, so
treat these as the last full measurement rather than as current:

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

**Items 1, 2, 4 and 5 are DONE** (`49327c0`, `cb1bbfe`, `bbd3ea5`) — kept here because each records
*why* it was sequenced where it was, which the commits don't.

1. ~~**Thread `onopenfinder`**~~ — DONE in `49327c0`. Both `<MediaPlayerLazy.current …>` instances
   (`ExhibitView.svelte` :570, :592). Doing it first and alone was right: `ExhibitView` is the
   collision hotspot for two wave-1 slices. The new assertion drove the second tag chip deliberately,
   and that routed around a real defect — **`Archie-d37d`**, the cite trigger occluding the FIRST
   chip (`.cite-trigger` x 20–100 vs `#cadence` x 38–122; `elementFromPoint` at the chip centre
   returns `SPAN.lbl`; 62px overlap). Filed and blocked on the dock work rather than fixed twice.
2. ~~**Close `Archie-5185`**~~ — DONE in `cb1bbfe` (flip-and-read stays removed — ruling 4 below).
3. **`ecf4` is mechanical, not a judgement call** — measured 2026-07-26: `render-core/src/tokens.css`
   (105 tokens) and `apps/studio/src/tokens.css` (102) share 100 names with **zero value
   disagreements**. The viewer no longer has its own copy at all. Studio-only: `--text-lede`,
   `--text-note`. Core-only: `--finder-h`, `--pane-top`, `--scrim-dim`, `--scrim-top`, `--topbar-h`.
   Move the two up, point studio at core, delete the copy. (Note `--finder-h`/`--topbar-h` may not
   survive the dock work — sequence it after.)
4. ~~**Surface retried-but-passed tests in CI**~~ — DONE in `bbd3ea5` (ruling 5 below).
   `scripts/flaky-reporter.mjs`, shared by both apps' Playwright configs, wired only under `CI`.
   Red-greened **both** directions, which for a reporter is the half people skip: a planted
   fail-then-pass produced `1 flaky`, one `::warning::` carrying the FIRST run's error, and a job
   summary; a clean run produced **zero** warnings and **no** summary file. A reporter that annotates
   every green run is worse than none. It deliberately does not fail the build — that was put to the
   human and declined, and the file names the one line to change if it ever reverses.
5. ~~**Write the three rules the narrative review earned**~~ — DONE in `bbd3ea5`:
   `wall-clock-quiet-is-a-load-sensitive-gate` (end on ARRIVAL, and a deadline only a callback can
   notice cannot bound a wedge defined by that callback not arriving),
   `stop-the-machine-not-just-the-token` (three of the four cancel inputs were correct **by luck**,
   relying on undocumented Chromium smooth-scroll cancellation), and
   `playwright-emulation-and-scroll-traps`.
6. Then the waves. **Wave 1 is running now — see the shared-worktree warning above before you touch
   either branch.**

### Tickets

Closed this session on map `Archie-c97e`: `dbbc`, `01a6`, `f90d`, `c314`, `0d6c`, `c5cb`, and then
`5185` in `cb1bbfe` — all seven indexed in Decisions-so-far. **13 remain open** on the map.
(An earlier "15" in this file and in chat was measured *before* the `f90d`/`c314` closes. 13 is a
filtered read of the full open list, not a `head`-truncated one. The count survived `cb1bbfe`
unchanged because that commit closed one — `5185` — and filed one — `d37d`.)

**Two are blocked on the dock decision** (`cb1bbfe`): `d6e9` and `d37d`. Both remainders change
shape depending on where the chrome lands, so both are to be **re-measured after docking, not fixed
blind** — the same rule `01a6` imposed on `d6e9`, applied one level out. For `d37d` specifically, the
question docking answers is whether `.cite-trigger` is even in its scope; the AV surface is what
decides it, since an AV object has no canvas chrome at all.

`Archie-7b86` stays OPEN deliberately: V53 is resolved (full eleven-drop enumeration in its body),
V49 untaken, V50 deferred because the ticket's premise that wavesurfer.js is already a dependency is
**false**.

**The map cannot fully close, and that should be stated rather than finessed:** V103/V104 depend on
`Archie-a5b1`, which lives on `map:dc-metadata` and is open.

## DECISIONS THE HUMAN MADE, 2026-07-26 — these change the shape of the remaining work

Four rulings. Each was put with a recommendation and prior art; two went AGAINST the recommendation,
which is why they are recorded verbatim rather than paraphrased into the tickets that prompted them.

### 1. Canvas chrome DOCKS out of the canvas (chose against the recommendation)

Chrome becomes a sibling of the canvas in normal flow and never sits over the image. `clover-iiif`
`Viewer.tsx:180-184` — `<ViewerHeader>` and `<ViewerContent>` are flex siblings, which is *why* the
header can be transparent; its one over-canvas control is an **opaque plate**, contrast sidestepped
rather than solved.

> **CORRECTED 2026-07-26, and the correction inverts the claim.** This paragraph used to open "the
> corpus default wins" and cite `tropy` `esper/container.js:11,39` as "overlay toolbar is opt-in,
> `hasOverlayToolbar` defaults **false**". **Tropy ships overlay toolbars ON.** `:11` is a React
> default-parameter fallback and the prop is always passed explicitly; the chain runs
> `item/container.js:106` → `:43-46` → `reducers/settings.js:38` → `main/tropy.js:59 frameless: true`
> (the only `false` is `:398`, the print window), and `reducers/settings.js:22` sets `layout: STACKED`
> so the `SIDE_BY_SIDE` exclusion never fires. Not cosmetic either: `_esper.scss:179-184` puts the
> header at `position: absolute` over the image, against `flex: 0 0 auto` in the non-overlay branch.
>
> So tropy had exactly this row-vs-overlay choice and **picked the overlay**, solving contrast with a
> blurred plate plus auto-hide (`_toolbar.scss:139-150`). The honest form is stronger than the claim it
> replaces, because it stops pretending the corpus is unanimous: tropy supports the row-vs-overlay
> *distinction* structurally, and chose the side this ruling declines.
>
> **There is no established "corpus default".** The claim rested on clover (supports), tropy
> (contradicts) and canvas-panel (abstains — it has essentially no chrome to dock, one `<button>`).
> universalviewer, mirador, annomea and quire were never swept. The human's ruling stands on its own
> merits and needs no corpus consensus; it should not claim one it does not have.

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
