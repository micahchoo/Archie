# Studio and Viewer token files: one floor, no copies (Archie-ecf4)

Branch `fix/token-unify`, based on `origin/main` @ `0c0b121`.

Studio carried a byte-copy of the shared token file. It is gone: `apps/studio/src/main.ts` now
imports `@render/core/tokens.css`, the same bytes the viewer's Astro pages import and the same bytes
the `<archie-viewer>` embed reads as text into its shadow root. Three consumers, one file.

The measurement below is what earns that; the ticket's own measurement was a year stale in one
direction and silent about the two divergences that actually mattered.

## What the ticket said, and what is actually there

The ticket (2026-07-26) named two divergences. Re-measured on `0c0b121`:

| the ticket's claim | measured |
| --- | --- |
| studio has `--text-lede` / `--text-note`, the viewer's copy does not | **holds** |
| the viewer's copy has `--topbar-h` / `--scrim-top` / `--pane-top`, studio's does not | **gone** — the dock work (`dfe7ab4`, ADR-0019's layout row) retired all five reservation tokens from BOTH files; neither defines any of them |
| — | **not in the ticket:** the shared floor has `--scrim-dim`, studio's copy did not |
| — | **not in the ticket:** the `.eyebrow` rule's colour differed by VALUE — studio `rgba(26, 60, 35, 0.55)`, the floor `rgba(26, 60, 35, 0.70)` |

The last row is the one worth the ticket. A missing *name* announces itself the first time someone
writes `var(--x)` and gets nothing. A drifted *value* renders — wrongly, quietly, forever. The
viewer's copy got a contrast fix (0.55 alpha forest-on-cream sat around 3:1 at 12px uppercase with
0.26em tracking); studio's copy did not, and studio kept shipping the failing value. Measured on the
running app before this change: studio's exhibit eyebrow computed `rgba(26, 60, 35, 0.55)`.

The rest of both files agreed exactly. 100 shared tokens, **identical values, identical order**, plus
identical `*`, `body` and `.eyebrow` rules. These were never two design systems. They were one file
and a stale copy — which is precisely why the copy survived three reskin sweeps without anyone
noticing it had rotted.

## Genuine vs accidental divergence

The separation the ticket asks for, per token, with the evidence that decided it.

| token | verdict | why |
| --- | --- | --- |
| `--text-lede` (`1.0625rem`) | **accidental** | reads as authoring-only and is not: the READING surface hardcodes this exact size at seven prose sites — `Gallery.svelte:216`, `Reader.svelte:779`, `NarrativeReader.svelte:958` and `:1045`, `NoteLightbox.svelte:117`, `SearchOverlay.svelte:131`, `MediaPlayer.svelte:614`. One prose scale; only one of two apps had a name for it. |
| `--text-note` (`0.95rem`) | **accidental** | same shape, but the honest count is **two** viewer prose sites, not four: `Reader.svelte:799` (`.object-summary`) and `SearchOverlay.svelte:161` (`.finder-empty`). See the correction below. |
| `--scrim-dim` | **accidental** | studio wants it and could not have it: `TutorialModal.svelte:37` reads `var(--scrim-dim, rgba(26, 60, 35, 0.82))` — the token's own value inlined as a fallback because the token was missing from studio's copy. A fallback literal that duplicates the floor's value IS the drift, one step before it diverges. |
| `.eyebrow` colour | **drift, not divergence** | not two tokens; one rule edited on one side. Unification is the fix and the only visible change it makes. |
| the other 100 tokens | identical | nothing to decide. |

**A correction, kept rather than quietly fixed, because the shape recurs.** The first draft of the
`--text-note` row cited four viewer sites. Two of them do not survive being opened:
`SidebarObjectNav.svelte:127` is `.overview .mark`, and `NarrativeReader.svelte:1017` is
`.to-index .grid-mark` — both `line-height: 1` glyph sizing that happens to use the same number, as
is `NotePopup.svelte:194`'s `.np-icon.expand`. I had grepped for the VALUE and written the claim as
if I had grepped for the USE. The conclusion survives on two real sites; the count did not, and
`[[post-review-fixes-are-unreviewed]]`'s rule — reconcile every number you report against a number
you actually read — is what caught it, while writing the report rather than while making the change.
The floor's comment carries the three exclusions explicitly so the eventual literal-conversion pass
does not fold them in.

**Genuine divergence: none.** That is a finding, not a shrug, and it is why there is no app-local
layer file in this change. Studio's genuinely app-local custom properties already exist and are
already in the right place: `--studio-aside-w` and `--studio-inspector-w` (`App.svelte:2286`,
`:3101`) and `--plate-w` / `--plate-intrinsic` (`ExhibitOverview.svelte:776`, `:1080`) are
**per-component runtime channels** written by Svelte `style:` bindings and read with a `clamp()`
fallback at the one selector that uses them. They are not design vocabulary and were never in either
token file. An authoring surface's chrome differs from a reader's in LAYOUT, which lives in
components — not in palette, type, spacing or depth, which is all a token file holds.

So on the ticket's item 4 — "consumes the floor plus a local layer, or wholly separate" — the answer
is a third one it did not list: **consumes the floor, with no local layer, because there is nothing
to put in one.** Creating an empty `tokens.local.css` to hold the place would be speculative
scaffolding, and an empty file invites the next person to fill it rather than ask whether they
should. The rule for when one is genuinely needed is written into the floor's header instead: a new
thin stylesheet imported AFTER the floor, never an edit to the floor for one consumer, and a comment
at the token naming which surface needs it and why the other cannot.

## Prior art

Three decisions needed support: a token file living in a package BELOW the apps; an app that deletes
its copy rather than keeping a layer; and a comment at a token saying why it is app-local. Every
citation below was opened at the line before being written down.

**The shape has one donor, and it is a good one.** `IIIF/canopy-iiif` puts its tokens in a workspace
package and imports them from the app:

- `packages/app/ui/styles/settings/_effects.scss:1-13` — a `:root` block of `--canopy-radius-*` /
  `--canopy-shadow-*`, inside the package whose `packages/app/package.json` `"name"` is
  `@canopy-iiif/app`.
- `app/styles/index.css:2` — `@import "@canopy-iiif/app/ui/styles/index.css";`, the consumer side.

Worth stating more precisely than it was handed to me: the app declares that package as
`"@canopy-iiif/app": "^1.11.1"` (root `package.json:30`), a **semver range**, but the root also
declares `"workspaces": ["packages/*"]` (`:7-9`), so the range resolves to the local package. It is
therefore a donor for the *direction* — design vocabulary lives below its consumers, not inside one
of them — and not for the resolution mechanics, which for us are a pnpm `workspace:*` link plus an
`exports` subpath.

**On deleting the local layer rather than keeping one, the corpus's only data point is weaker
counter-evidence than it first appeared, and checking it mattered.** Canopy does import a local file
after the shared one — `app/styles/index.css:3`, `@import "./custom.css";` — which reads as a
"floor plus thin local layer" that argues against my decision to ship no local file. Opening
`custom.css` changes that: **all eleven lines of its body are inside one `/* … */`** (`:6-13`), under
a header that calls itself "Example custom color variables" (`:1-3`). The file declares nothing. It
is a held-open placeholder, which is exactly the speculative scaffolding I argued against — and the
one instance of it in the corpus is inert. Canopy's app-local tokens that are actually live sit in
the app's own entry stylesheet immediately after the import (`index.css:5-13`, `--font-sans` /
`--font-serif` / `--font-mono`), not in the placeholder.

That correction is worth flagging as a process note, not just a fact: the summary I was handed
attributed those font tokens to `custom.css:1-11` and concluded "not empty, not deleted". It is a
plausible sentence about a real file, and it pointed away from my design. It died on contact with
the source — `[[prior-art-citation-discipline]]`, habit 1.

**The third decision has no precedent, and that is the finding.** Nothing in the corpus documents, at
a token, why that token is app-local rather than shared. Re-run here rather than taken on report:

```
grep -rn --include=*.css --include=*.scss -iE "app-only|app-specific|not shared|local override|stays local" \
  IIIF/canopy-iiif quire tropy field-studio anvil decap-cms
```

Zero hits. Everywhere the boundary exists it is implicit in file location alone. So the rule this
change writes into the floor's header — *a genuinely app-local token goes in a new thin stylesheet
imported after the floor, with a comment at the token naming which surface needs it and why the other
cannot* — claims no precedent. It is original design.

**And no corpus project has our problem at all.** Two independently deployed apps plus a
framework-free embed, all pulling one `:root` floor, is not a shape the corpus contains: `tropy`
(`src/stylesheets/themes/_tropy.scss`, imported only by siblings in the same app), `juncture`,
`one.compost.digital`, `quire`, `field-studio` and `anvil` are all single-deliverable. Two of those
deserve a line so nobody re-checks them as evidence for per-app copies: `anvil`'s
`product-plan/design-system/tokens.css:1-2` is a **planning snippet**, not live code — its header
reads *"Append to app/src/app.css after the existing --accent-ring token (L60)"*, and the file is
bare declarations with no selector; `field-studio` is single-app. Neither kept a copy; neither ever
faced the problem.

One citation was offered and is **deliberately not used**: tldraw's `packages/editor/editor.css` and
`packages/tldraw/src/lib/ui.css` are concatenated by a build script and consumers import only the
merged output — a build-time merge inside one package, not an import-time share across apps. Cited
for our case it would be wrong in exactly the way `[[prior-art-citation-discipline]]` catalogues.

What none of this supports: it is evidence about the twelve-odd projects in this corpus, checked by
opening files and tracing importers. It is not a claim about open source at large.

## What moved

- `packages/render-core/src/tokens.css` — `--text-lede` / `--text-note` promoted, carrying the
  viewer call sites that prove they are not authoring-only. Header rewritten: three consumers named
  with their import mechanism, the two drift directions recorded as the reason the copy is gone, and
  the where-an-app-local-token-goes rule. `--scrim-dim` and `.eyebrow` gained the studio half of
  their story at the declaration.
- `apps/studio/src/tokens.css` — **deleted**.
- `apps/studio/src/main.ts` — `import "@render/core/tokens.css"` as the first stylesheet, with a note
  that FIRST is load-bearing (`markers.css` and `atmosphere.css` resolve its `var()`s and source
  order is the cascade here).
- `apps/studio/src/css-modules.d.ts` — the comment's example specifier was `./tokens.css`, which no
  longer exists. It also now records that the `*.css` ambient pattern covers the package-subpath
  specifier, which is why this change needed no work here.
- `apps/studio/src/tokens.test.ts` — new; the anti-copy invariant, below.

## The gate

The question worth gating is not *do the two agree*. That framing is what let the copy survive: two
files that agree today are a diff away from not agreeing, and nobody re-runs the diff. The question
is **is there a second file at all** — and its sharper form, is any floor token redeclared anywhere
under `apps/studio/src`, whether as a restored `tokens.css` or as one shadowed value in a component.

`apps/studio/src/tokens.test.ts` asserts that by WALKING both sources and comparing. There is no
hand-maintained token list to fall out of date — the reference is derived, which is the first of the
three fixes in `[[post-review-fixes-are-unreviewed]]` ("derive the reference instead of storing it,
so there is nothing to move"). A token added to the floor tomorrow is automatically protected.

Five assertions; each was red-greened by injecting the defect it claims to catch, and **each probe
took down exactly one assertion** — no assertion is quietly doing another's job, and none is broad
enough to fire on an unrelated edit:

| injected defect | assertion that went red | collateral |
| --- | --- | --- |
| `main.ts` import reverted to `"./tokens.css"` | the entry imports the shared layer | 0 of 4 others |
| `.probe { --accent: #ff0000 }` appended to `markers.css` | declares no floor token of its own | 0 of 4 |
| `--text-lede: 1.0625rem` → `1.06rem` | the floor carries the prose scale, at studio's values | 0 of 4 |
| `--scrim-dim` renamed away | the floor carries the modal scrim | 0 of 4 |
| `.eyebrow` colour reverted to `0.55` | the global `.eyebrow` keeps the 0.70 contrast fix | 0 of 4 |

Probe method: files copied to `/tmp` and restored from there — never `git checkout --` / `git
restore`, per `[[drive-must-not-recreate-the-thing-under-test]]`; the code was committed before the
first injection. Every anchor asserted `count(old) == 1` before replacing rather than merely present,
per `[[post-review-fixes-are-unreviewed]]`'s worked example. Script: `.tok-redgreen.py` (throwaway,
not committed).

**Stability: 20 / 20 passing runs**, 5 tests each, no flakes.

## Gate results

| gate | result |
| --- | --- |
| `apps/studio` vitest | **968 / 968** in 76 files (5 of them new) |
| `apps/viewer` vitest | 184 / 184 in 22 files |
| `packages/render-core` vitest | 1202 / 1202 in 96 files |
| `packages/archie-viewer` vitest | 185 / 185 in 12 files |
| `pnpm --filter @archie/studio run check` | 1184 files, **0 errors / 0 warnings** |
| `pnpm --filter @archie/viewer run check:svelte` | 1523 files, **0 / 0** (`--fail-on-warnings`) |
| `pnpm -r run typecheck` | all 6 packages Done |
| `node recipes/smoke.mjs` | **RESULT: PASS**, 45/45 hard assertions, 44/44 contracted labels present |
| `apps/viewer` e2e, `VIEWER_E2E_PORT=4363` | **142 / 142 passed** in 1.7m, 0 skipped |
| `packages/archie-viewer` `node build.mjs --check` | ok — eager 38.9 → **39.3KB gz** (Δ +0.4, allowed +10.0) |

The two smoke numbers reconcile: 45 hard assertions, 44 contracted labels, the difference being the
completeness check itself, which is recorded and deliberately excluded from `CONTRACTED_LABELS`.

Smoke is the gate that matters most for a change to the floor — its
`the shadow root's tokens ARE the shell's tokens.css` assertion fetches
`packages/render-core/src/tokens.css` over the wire and compares COMPUTED values inside the embed's
shadow root against it, so it would catch a floor edit the embed failed to follow. It reported
`--ink-canvas-primary=#1A3C23, --surface-canvas=#F7F4EC, --accent=#3A8C5D, --radius-md=16px`.

e2e port ownership was verified rather than assumed, per `[[viewer-e2e-shared-port]]`: `ss -ltnp`
gave pid 2750840 on 4363, whose `/proc/<pid>/cwd` is this worktree's `apps/viewer`, and the log opens
with a fresh `vite-node gen-published` + `astro build`. Ports 5173 / 5174 / 4321 were all bound by a
sibling agent's dev stack when this started, so nothing here ever touched the front door.

## Artifact measurements

Exit codes were not trusted; the built files were read.

| artifact | measured |
| --- | --- |
| `apps/studio/dist/assets/index-*.css` | `.eyebrow{…color:#1a3c23b3}` — `0xb3/255 = 0.702`, i.e. the 0.70 fix. The old copy would have emitted `#1a3c238c` (0.549). |
| same | `--text-lede: 1.0625rem`, `--scrim-dim: rgba(26, 60, 35, .82)` present — studio's build carries the floor |
| `packages/archie-viewer/dist/archie-viewer.js` | `--ink-canvas-primary` ×4; `--text-lede`, `--text-note`, `--scrim-dim` ×1 each — the promotion reached the published embed bundle |
| `dist/archie-viewer.js` | re-synced (`node scripts/sync-dist.mjs`) so `sync-dist:check` stays byte-equal |

The embed's `dist/` and `dist-single/` are committed with the code, because they are CDN-published
artifacts CI enforces and the token text is inlined into them.

## The driven look

Both surfaces were driven in a real browser before and after, on private ports (studio Vite 5991,
viewer Astro 4991), with computed values read off `document.documentElement` rather than inferred.
Screenshots at `/tmp/tok-{before,after}-{studio,viewer,studio-exhibit}.png`.

| measurement | before | after |
| --- | --- | --- |
| studio `--scrim-dim` | `""` (undefined) | `rgba(26, 60, 35, 0.82)` |
| viewer `--text-lede` / `--text-note` | `""` / `""` | `1.0625rem` / `0.95rem` |
| **studio exhibit `.eyebrow`** | **`rgba(26, 60, 35, 0.55)`** | **`rgba(26, 60, 35, 0.7)`** |
| viewer gallery `.eyebrow` | `rgba(26, 60, 35, 0.7)` | unchanged |
| both: `--ink-canvas-primary`, `--accent`, `--accent-2`, `--surface-canvas`, `--radius-md`, `--space-4`, `--font-body`, `--shadow-lift-low` | — | unchanged |

One thing the pixels taught that the file diff could not: **studio's Library home was the wrong place
to look.** `LibraryHome.svelte:768` overrides `.eyebrow`'s colour component-locally, so that eyebrow
computes `rgba(26, 60, 35, 0.45)` both before and after and the home screenshots are identical. A
"driven look" that stopped at the first screen would have concluded the change was invisible and
missed the one visual delta it makes. The exhibit view (`ExhibitOverview.svelte:1041` sets only
`margin`) is where the global rule actually lands — that is the screenshot pair to compare.

Everything else is pixel-identical, which is the intended result: 100 of 103 tokens were already
byte-equal.

## Found, not fixed

Each of these is real, each was measured, and each is outside this slice's territory or size.

1. **`--text-lede` is referenced by nothing, in either app, and `--text-note` exactly once**
   (`App.svelte:3135`). Counted: `1.0625rem` appears 7× in the viewer and 7× in studio; `0.95rem`
   5× in the viewer (2 of them prose) and 19× in studio. The tokens are now on the
   floor, which is the prerequisite; converting the literals is a mechanical pass over ~20 `.svelte`
   files in two apps and belongs in its own reviewable ticket. Deleting `--text-lede` instead was
   considered and rejected: it names a real, repeatedly-used size, and concurrent slices are editing
   several of those files.
2. **Four phantom token names in studio, each with the real value inlined as a `var()` fallback** —
   `--rule` (`ViewerPreview.svelte:91`, `#d9cfc4`), `--ink-warn` (`:95`, `#8a2f22`), `--scrim`
   (`Settings.svelte:119`, `rgba(26, 60, 35, 0.28)`), `--shadow-lift-high` (`:125`). None is declared
   anywhere in the repo, so every one of them always renders its fallback. Two are pre-Verdant
   palette leftovers (`#d9cfc4` sandy grey, `#8a2f22` rust) that the reskin never reached because
   they are not spelled like tokens. This is the same shape as `--scrim-dim`'s fallback, one stage
   further along: the name has stopped even pretending to resolve. Either declare them on the floor
   or delete the name and keep the literal — but that is a component decision, and components are
   another slice's territory this week.
3. **`apps/viewer` has no anti-copy test.** The invariant added here walks `apps/studio/src` only.
   The viewer has no token file today so there is nothing to catch, but the asymmetry is worth
   knowing about; the cheapest fix is to lift the walk into a shared helper when a second consumer
   needs it.
4. **Stale paths in docs**, all pre-existing: `docs/learn/assets/lesson.css:6` cites
   `apps/viewer/src/tokens.css`, which `Archie-c314` moved to render-core;
   `docs/architecture/subsystems/studio/components.md:66` and `viewer/components.md:72` both describe
   the tokens as `--accent #3a6b4c` "forest-green scholar's ink", two reskins ago (`--accent` is
   `#3A8C5D`), and the viewer one says "Same tokens as Studio", which was the false claim this ticket
   existed to make true. Left alone because subsystem docs are being rewritten by the dock and
   fixture slices concurrently.
5. **`astro sync` re-optimises `apps/viewer/node_modules/.vite/deps`** and printed
   `Re-optimizing dependencies because vite config has changed` during `pnpm -r run typecheck`. That
   is the wedge `[[viewer-optimizedeps-bare-includes]]` describes, and it fires from an ordinary
   repo-wide typecheck while sibling agents hold long-running Astro servers. Not caused by this
   change and not fixable from here, but it means a repo-wide typecheck is not a read-only act while
   a fleet is running.
