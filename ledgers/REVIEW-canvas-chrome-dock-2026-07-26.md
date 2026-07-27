# Review — the canvas-chrome dock slice (`integrate/dock`, tip `5842087`)

Reviewed at `5842087` (detached in my own worktree; `merge-main` untouched). Dock's own changes read as
`git diff d6ff592...d43155c`. Every number below is copied from output I ran and read; where a number
came from a teammate it is labelled and I re-derived it myself.

**Verdict: APPROVE the code, with two BLOCKER prior-art citations to correct before merge.**
The deletions are sound — I could not find a single live consumer of anything retired. The layout
contract holds at every viewport I drove, including three the author never tested. The gates go red
when I break the thing they watch. What fails review is the *evidence*: two cited corpus files do not
say what the ADR says they say, and one of them (tropy) says the opposite.

---

## 1. The deletions — Priority 1. All clear.

I greped each retired name across the merged tree for definitions, type-level refs, string literals,
barrels and tests separately, excluding `dist/` and `Prior Art/`.

| retired | live consumers found at `5842087` |
| --- | --- |
| `FitOptions.leftInsetW` | **0** — 4 hits, all prose in `fitbounds.ts` / `fitbounds.test.ts` / `gate.test.ts` |
| `containerW`/`sidebarW`/`sidebarIsSheet`/`detailOpen`, `MAX_SIDEBAR_FRACTION` | **0** |
| `getFitOptions` seam | **0** — removed from `Canvas.svelte` props, `mount.ts`, `read-mount.ts`, `App.svelte:2535`, and the `FitOptions` re-export in `render-svelte/src/index.ts` |
| `--strip-h` publisher, `reserveLocatorSpace`, `--archie-locator-h` | **0** — the `$effect` and its `bind:clientHeight` were removed together, no orphan |
| `--topbar-h`/`--scrim-top`/`--pane-top`/`--strip-h`/`--finder-h` | **0** `var()` uses in app source |

Both live fit call sites now pass `{}` (`read-mount.ts:148`, `mount.ts:502`). The only remaining
`--topbar-h` is `prototypes/metadata-panel/styles.css`, which defines its own at `:28` and is
self-contained.

**Test-count reconciliation, from three independent numbers rather than one derived from another:**
`git diff` shows **17** `it(` removed and **1** added (net 16). I measured **191** tests at HEAD.
191 + 16 = 207. The claimed 207 → 191 holds.

**`isWholeObjectFor` — the author was right to stop, and understated it.** It answers ADR-0018's
whole-object question (`coverage.ts:69`: null selector ⇒ whole object; else the ≥75 % coverage
heuristic) and has nothing to do with chrome reservation. Live consumers: `ExhibitView.svelte:458`,
`App.svelte:**1509**`, `e2e/offline.ts:127`, plus a fourth the author did not claim,
`fixtures/fixture-reach.test.ts:134`. Not over-cautious — correct.
*(NIT: the author reported `App.svelte:1504`; it is `:1509` at both `d43155c` and `5842087`.)*

**Deleted occlusion suites V22 / V71** — subject genuinely dead: the finder pill and the filmstrip are
now flow siblings in `ExhibitView`'s `.chrome-dock` (`:706`). V48 and V87 were **rewritten, not
deleted**. The only surviving `position: fixed` is `.arrival` (`:834`), which the ADR names as an
excluded self-dismissing toast.

### The replacements are stronger, not weaker

`.canvas-dock` is a *narrow sibling* of `<main>` (`.reader > .stage > [.canvas-dock, main, …]`), not a
wrapper — so `closest(".canvas-dock")` is a **tighter** claim than the old `closest("main")`, and still
excludes the aside, which was the point. `read.spec.ts` additionally gained a real geometric clearance
assertion. `canvas-keyboard.spec.ts`'s `.reader > main` → `.reader main` was *forced* (main is now a
grandchild) and stays unambiguous: `MediaPlayer`'s `<main>` is an `{#if isAV}` sibling branch, never
inside `.reader`.

Proof it is stronger, not merely different — **INJ-1** (`.canvas-dock` given `position:absolute; top:120px`):

```
✘ occlusion.spec.ts:101  .canvas-dock over the canvas: [0,173 1280x53] vs [0,53 924x398]
✘ read.spec.ts:11        the zoom cue [y 182..216] is not clear of the canvas [y 53..]
```

The second is the **new** geometric half. The old `closest("main")` assertion would have stayed green.

---

## 2. BLOCKERS — two citations that do not say what the ADR says

The repo's own rule (`prior-art-citation-discipline.md`) is that a citation must be falsifiable by the
next reader. Both of these name real files and real lines and are wrong about them. A teammate found
them; **I re-opened every file below myself** and confirmed each independently.

### BLOCKER 1 — tropy is cited for the opposite of what it does

ADR-0019 `:141-142`, `ExhibitView.svelte:703-705`, and `ledgers/HANDOFF-viewer-ux-2026-07-26.md:302`
all claim tropy "makes an overlay toolbar **opt-in**, `hasOverlayToolbar` defaulting to `false`" and
that "tropy's default is the same posture … the toolbar lives outside the canvas."

The two cited lines are exact — `container.js:11` is `hasOverlayToolbar = false,`. But that is a React
**default-parameter fallback, and the prop is always passed explicitly.** The chain, each link opened:

- `item/container.js:106` — `hasOverlayToolbar={this.hasOverlayToolbars}`
- `item/container.js:43-46` — `settings.overlayToolbars && settings.layout !== LAYOUT.SIDE_BY_SIDE`
- `reducers/settings.js:38` — `overlayToolbars: ARGS.frameless,`
- `main/tropy.js:59` — `frameless: true,` (the only `frameless: false` is `:398`, the print window)
- `reducers/settings.js:22` — `layout: ITEM.LAYOUT.STACKED,` so the SIDE_BY_SIDE exclusion never fires

**Tropy ships with overlay toolbars ON.** And it is not cosmetic — `_esper.scss:179-184`:

```scss
    .esper.overlay-mode :is(&) {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
```

against `flex: 0 0 auto` in the non-overlay branch. Tropy had exactly this row-vs-overlay choice and
**picked the overlay**, solving contrast with a blurred plate + auto-hide (`_toolbar.scss:139-150`).

This is the `:11`-is-a-default-not-a-decision error, and it is the classic "grep where a thing is
USED, not where it is defined". Suggested honest form, which I think is *stronger* than the current
claim because it stops pretending the corpus is unanimous:

> tropy supports the row-vs-overlay distinction structurally — `_esper.scss:179-184` switches the
> header between a flex row and `position:absolute` — and chose the overlay as its default. That is
> the approach this ruling declines, on a corpus system that had the same choice in front of it.

### BLOCKER 2 — clover's `Main` is not the header's parent

ADR-0019 `:139-141`: "`Viewer.styled.tsx:15-22` is the `Main` container … **that makes the header and
the content COLUMN siblings** — the header is the row above".

`:15-22` really is `Main` with `display:flex, flexDirection:column`. But `Main` is used in exactly one
place — `Content.tsx:128-163` — **inside `ViewerContent`**, wrapping `<Painting>` (`:132`),
`<MediaWrapper>` (`:141`) and `<PanelToggle>` (`:147`). It is the header's *sibling's* interior, never
its parent. The mechanism that actually makes header and content siblings is `Wrapper`
(`Viewer.styled.tsx:125-127`) plus its `"> div"` rule at `:138-141`.

Two things make this worth a BLOCKER rather than a nit:

1. **`git show d43155c` shows this sentence was added by the correction commit** — the very commit
   that fixed `Header.styled.ts:57-73` → `:59`. The author opened the file, confirmed what `Main`
   *is*, and did not grep where it is *used*. Same sweep, same failure mode, one commit later.
2. The premise it supports **survives** — `Viewer.tsx:180-184` genuinely does render `<ViewerHeader>`
   and `<ViewerContent>` as flex column siblings. Only the mechanism cited is wrong.

There is a better citation sitting unused: inside `Main`, `<Painting>` (canvas) and `<MediaWrapper>`
(item strip) are themselves flow siblings in a column — clover docking a strip *below* the canvas,
which is nearer to what this slice does than the header citation is.

---

## 3. SHOULD-FIX

**S1 — "THE VIEWER NEVER PASSED IT" is false, and was false the day it was written.**
`occlusion.spec.ts:196` justifies deleting the `getFitOptions` seam with that claim. But at `d6ff592`
the viewer *did* pass it: `Reader.svelte:375` defines it, `:406` passes it, `:392` sets `leftInsetW`;
`NarrativeReader.svelte:647/:695/:662` likewise. I checked the comment's own commit — at `b66732a`,
`Reader.svelte:382` passes `{getFitOptions}`. The wiring commit `75bc949` (Archie-40fe) is an
**ancestor** of `b66732a`, so the claim was untrue when authored. The dock edited that exact line
(`is` → `was`) without re-opening it.
*This does not make the deletion wrong* — nothing overlays the canvas now, so the plain fit is right.
But the deletion is a real behaviour change (viewer fits used to be slid by `leftInsetW`), and the
prose says it is a no-op. Reword to "the reservation is retired because nothing floats", not "it was
never used".

**S2 — the occlusion suite's non-emptiness guard is a threshold, not a per-selector requirement.**
**INJ-2**: I renamed `.canvas-dock` → `.canvas-dockZ` in `Reader.svelte` (markup + CSS). Result:

```
✓ occlusion.spec.ts:101  no docked chrome overlaps the canvas, with a note open      <-- STILL GREEN
✓ occlusion.spec.ts:195  every halo note fits inside the canvas box                  <-- STILL GREEN
✘ read.spec.ts:11        closest(".canvas-dock")
✘ object-nav.spec.ts:53  closest(".canvas-dock")
```

The injection is confirmed effective — `closest(".canvas-dock")` returning false proves the class left
the DOM. `:101`'s `boxes.length >= 3` guard was satisfied by the *other* named selectors, so a named
docked surface dropped out of the measured set unnoticed. `smoke.mjs` has the identical shape
(`boxes.length >= 2` over a 5-element named set). Suggest asserting the named set resolves
**completely** (or naming which members are optional), not just that ≥N of it did.
Mitigating: `read.spec`/`object-nav` do catch this rename, so the class is covered in aggregate.

**S3 — the V48 sweep is narrower than the prose around it.** The claim is that occlusion now asserts
"no chrome touches the canvas at all". That is `:101`/`:145`. The `:195` sweep measures halo-vs-chrome,
not chrome-vs-canvas — under INJ-1, with `.canvas-dock` demonstrably sitting on the canvas, **it passed
(29.2 s)**. The sweep is genuine (I counted **67** halo notes myself against the served manifest —
the comment's number is exactly right, and the `>20` guard is real), it just answers a different
question than the sentence above it implies.

**S4 — one contracted label is recorded at two sites**, so the completeness check can be satisfied by
either. `"ADR-0019 MUST · the AV player and its note list mount (AV)"` appears at 2 `record()` sites.
`auditOwnSource` checks for duplicate *array entries* (there are none) and does not see this.
**Pre-existing** — 3 occurrences at both `d6ff592` and HEAD; not the dock's doing.

**S5 — stale token prose in both `tokens.css` headers.** `render-core/src/tokens.css:17-18` and
`apps/studio/src/tokens.css:10-11` both still say render-core "has `--topbar-h`/`--scrim-top`/
`--pane-top` that studio does not". After this slice **neither file defines any of the three**
(verified by grep for definitions in both). The divergence note is now false in that half.

---

## 4. Priority 2 — repeat runs. No flakes in the slice's own work.

Every changed assertion, ten times or more. Tallies copied from output:

| suite | runs | result |
| --- | --- | --- |
| `render-mount` vitest | 10 | **191 passed** every run |
| `read` + `object-nav` + `canvas-keyboard` e2e | 10 | **32 passed** every run |
| `occlusion` e2e | 10 | **5 passed** every run (`grep -c '5 passed'` = 10) |
| `inert-a11y` + `av-surface` + `note-surface` e2e | 10 | **28 passed** every run, zero flaky |

Full sweep once: render-core 1194, render-mount 191, render-svelte 7, archie-viewer 185, viewer 184,
full viewer e2e **141 passed**. Gates: `pnpm -r typecheck` exit 0; studio svelte-check
**1179 FILES 0 ERRORS 0 WARNINGS**; viewer svelte-check **1523 FILES 0 ERRORS 0 WARNINGS**.

### One genuinely flaky test — pre-existing on main, NOT this slice

`apps/studio/src/seed-carry.test.ts` › "seeds the polygon region on both o9 exhibits, with the
IDENTICAL selector value" fails intermittently. Measured 12 runs at each SHA:

| tree | tally |
| --- | --- |
| `8683b02` (main at merge time) | **PASS 7 / FAIL 5** |
| `5842087` (`integrate/dock`) | **PASS 8 / FAIL 4** |

Indistinguishable — the merge neither caused nor worsened it. **Root cause**, which makes it fixable:
the two arrays hold the same two elements in different order, and `toEqual` on an array is
order-sensitive. `notes()` → `projectHeads` sorts by `logicalId` (`heads.ts:59`), and `mintLogicalId`
(`wadm/brand.ts:77`) takes `rng = Math.random`. Both seed notes are minted in the same millisecond, so
the ULID random suffix decides the order — a coin flip, matching the ~33-42 % rate measured. This is
exactly the "order-sensitive `toEqual` on a derived array" shape the brief warned about. Fix is to
compare as sets, or sort both sides. **`integrate/dock` is currently red on this test ~1 run in 3** —
worth knowing before merging even though it is inherited.

---

## 5. Priority 3 — geometry. Author's numbers reproduced; three untested viewports clean.

Driven by me against my own verified build (server PID cwd confirmed as this worktree; log shows fresh
`vite-node gen-published` + `astro build`). Offline route-abort, as the specs do.

| viewport | route | document / viewport | any ratio < 1 |
| --- | --- | --- | --- |
| 1280×720 | image | 720 / 720 | none |
| 1280×720 | AV | 720 / 720 | none |
| **900×600** | image | 600 / 600 | none |
| **900×600** | AV | 600 / 600 | none |
| **900×1400** | image | 1400 / 1400 | none |
| **900×1400** | AV | 1400 / 1400 | none |
| **1280×500** | image | 500 / 500 | none |
| **1280×500** | AV | 500 / 500 | none |

The author's headline reproduces: `.filmstrip` y 603 → bottom 712 ratio 1; `.player` y 53 → 594;
document 720/720. No box was zero or negative anywhere. **The narrow/tall/short cases the author never
tested are clean** — the `height: 100dvh` + `overflow: auto` chain holds; `.route` resolves to exactly
`innerHeight − 53` at every size, and `.chrome-dock` stays pinned at the bottom without growing the
document. I did not capture `.tl-track` (it needs an AV note list open); that one number of the
author's five is unconfirmed by me.

---

## 6. Priority 4 — smoke and its self-audit. Verified mechanically, and red-green by my own hand.

I wrote an **independent** parser (not `auditOwnSource`, which is the thing under review) over
`smoke.mjs`: **44 CONTRACTED_LABELS entries, 0 phantoms, 0 duplicate array entries**, the three new
dock labels each recorded at exactly **1** site, 6 strays all legitimately non-contracted (fixture
guards, the completeness check, a section header).

Smoke run through the full CI sequence (`build` → `sync-dist` → `smoke`): **hard assertions 45/45**,
**44/44 contracted present**, `RESULT: PASS`. Those are two different numbers that reconcile with my
static parse (45 record sites carrying contracted labels, 44 unique, one label twice — see S4). Detail
lines read, not just PASS: *"5 docked element(s): .reader-dock, .rc-legend, .reader-note,
.archie-note-card, .reader-aside"* — the whole named set resolved, so the ≥2 guard was met by 5.

**The stale-artifact trap is not present here.** I did not take the author's word that its injections
post-dated the `sync-dist` correction — I ran my own. **INJ-3**: `.reader-dock` given
`position:absolute` in `element.ts`, rebuilt, `sync-dist`, smoke:

```
FAIL  ADR-0019 MUST · no docked chrome overlaps the canvas box (layout)
      — .reader-dock [0,157,1280,44] overlaps 41677px² | .rc-legend [16,165,1248,27] overlaps 25142px²
hard assertions : 44/45 passed
RESULT: FAIL
```

Separately, **the committed `dist/` is a genuine rebuild of current source, not a stale mirror**: a
fresh `pnpm --filter @render/archie-viewer build` + `sync-dist` reproduced md5 `3ef2c9cb…` byte for
byte with `git status` clean, twice (before and after my injection was reverted). `eagerGzKB` reports
**39.3 KB** with `baseline unchanged`, so the ratchet was not silently moved.

---

## 7. Other citation findings (SHOULD-FIX / NIT)

- **SHOULD-FIX** — `read-mount.ts:245` `navigatorPosition: "BOTTOM_RIGHT"` is at **`:241`** (checked at
  `d43155c` and HEAD).
- **SHOULD-FIX** — "canvas-panel paints no chrome over the image at all" is literally true and
  evidentially empty: it has essentially no chrome to dock (one `<button>` in the package). It is not a
  system that *chose* docking. State it as an absence.
- **NIT** — `Viewer.styled.tsx:41-` lost the end bound `:41-82` it previously had.
- **NIT** — the clover paths are the doubled `src/components/Viewer/Viewer/…`; `Header.styled.ts`
  disambiguation matters (a second one exists at `src/components/Slider/Header/`).
- **Verified TRUE**, for the record: clover `Viewer.tsx:180-184` (siblings), `Header.styled.ts:59`
  (`backgroundColor: "transparent !important"`), `Viewer.styled.tsx:41` PanelToggle opaque plate;
  anvil `EmbeddedReader.svelte:314-337` `fitForSidebar` (`:332` the 0.85 `Math.min`, `:335`
  `w/(1-f)`) — and anvil's `Sidebar.svelte:168` is `position: fixed`, so anvil's reservation existed
  *because* its chrome floated, which makes this slice's deletion rationale coherent rather than
  convenient.
- **Gap worth naming:** the ADR asserts a *corpus default*. That rests on clover (supports), tropy
  (contradicts, once read properly) and canvas-panel (abstains). universalviewer, mirador, annomea and
  quire were not swept. Either sweep them or narrow the claim.

---

## Process notes

- Two teammates assisted: a citation verifier and a geometry driver. **Every citation finding I
  report above I re-opened and confirmed myself** — the tropy chain through all six files, and clover's
  `Main` usage via `grep -rn '\bMain\b'`. The geometry table is entirely my own driving. The citation
  agent flagged that it could not verify who dispatched it; that dispatch was mine.
- My injections took port 4381 down twice while the geometry teammate was driving it; I told it to
  discard everything measured in that window and re-run. Flagging it because it is exactly the
  shared-port hazard `viewer-e2e-shared-port.md` describes, and it was mine.
- All three injections were reverted with `git restore --source=HEAD`, never `git checkout --`. Final
  state verified clean, including rebuilding `dist/` back to its committed checksum. Post-revert
  confirmation run: **37 passed**.
- I did not re-merge `main`. `pnpm bundle:check`'s known pre-existing failure (studio dist) was not
  investigated per the brief; the embed's own `eagerGzKB` is fine at 39.3 KB.
