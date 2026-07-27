# Prior art: does persistent chrome dock beside the deep-zoom canvas, or float over it?

**Swept 2026-07-26.** Read-only. Four systems, none previously swept: universalviewer, mirador,
annomea, quire. Corpus roots `/mnt/Ghar/2TA/DevStuff/Annotators/Image/` (annomea, quire) and
`/mnt/Ghar/2TA/DevStuff/Annotators/Image/IIIF/` (universalviewer, mirador). All four present.

**Verdict: 2 of 4 dock by default, 1 overlays, 1 abstains (its canvas is an inline page figure; its
one over-canvas surface is unverifiable from this checkout).**

Paths below are relative to each system's root. Every line was opened at the cited line.

## The table

| system | docked or overlay | mechanism that selects it | `path:line` |
| --- | --- | --- | --- |
| **universalviewer** | **DOCKED** (desktop ≥768px); overlay only below that breakpoint | CSS grid — `.mainPanel` is `grid-template-areas: "left center right"`; opening a panel swaps a track-width variable, narrowing the centre column. `Shell.resize()` subtracts header+footer heights from the canvas area. | `.../uv-shared-module/css/styles.less:114-141`, `:196-207`; `.../uv-shared-module/Shell.ts:96-105` |
| **mirador** | **SPLIT — docked for panels, OVERLAY for the canvas control bar** | Panels are MUI flex siblings in a column/row tree; the zoom+nav+info bar is `position:absolute; bottom:0; width:100%; zIndex:50` with a 50%-alpha background, rendered as a *child of* the OSD viewer section (`position:relative`). | `src/components/Window.jsx:96-131`; `src/components/WindowCanvasNavigationControls.jsx:18-31`; `src/components/OpenSeadragonViewer.jsx:18-22` |
| **annomea** | **OVERLAY**, wholesale | No mechanism — there is no docked mode. Every chrome surface is `position:fixed`/`absolute` at z 400–600, mounted to `document.body` (or into the canvas container), and the canvas receives no inset compensation anywhere in `src/`. | `src/viewer/NarrativePane.svelte:254-265`; `src/viewer/Sidebar.svelte:103-115`; `src/viewer/IndexFlyout.svelte:76-82`, `:118-131`; `src/runtime.ts:216-218` |
| **quire** | **ABSTAINS** (docked where verifiable) | The deep-zoom canvas is an inline `<canvas-panel>` in a static page: image, caption, annotations-UI emitted as sequential flow siblings, no positioning. Its one candidate over-canvas surface — the lightbox UI — is styled by a file that is **not in this checkout**. | `_includes/components/figure/image/html.js:44-48`; `_includes/components/lightbox/styles.js:16-21` (the missing stylesheet) |

## universalviewer — docked, and the docking is load-bearing in two independent layers

The JS layer: `Shell.create()` builds `headerPanel`, `mainPanel`, `footerPanel`, `mobileFooterPanel`
as sequential children of the root (`Shell.ts:42-66`), and `Shell.resize()` computes

```
mainHeight = $element.height() - mainPanel paddingTop
           - (headerPanel visible ? its height : 0)
           - (footerPanel visible ? its height : 0)
           - (mobileFooterPanel visible ? its height : 0)
```

(`Shell.ts:96-105`). The canvas area is explicitly *what is left over* after the chrome takes its
height — the antithesis of an overlay, and it is computed in JS, not merely implied by CSS.

The CSS layer: at ≥`@md-min-width` (768px, `variables.less:7`, via the `.md-mediaquery` mixin at
`mixins-extended.less:11-15`) `.mainPanel` becomes `display: grid` with
`grid-template-columns: [left] var(--uv-grid-left-width) [center] var(--uv-grid-main-width) [right]
var(--uv-grid-right-width)` and `grid-template-areas: "left center right"` (`styles.less:114-131`).
Opening a panel sets `--uv-grid-left-width: var(--uv-grid-left-width-open)` (`styles.less:144-150`),
i.e. **30px → 271px** (`styles.less:25-29`), with a transition on `grid-template-columns`. The centre
track is `minmax(0, 1fr)`, so opening the contents strip or the more-info panel *shrinks the canvas*.
`.headerPanel` and `.footerPanel` are both `position: relative` (`styles.less:99-102`, `:302-305`).

The overlay case exists and is **the mobile branch, selected by viewport width alone, never by
config**: below 768px `.leftPanel, .rightPanel` are `position: absolute; inset: calc(5em + 8px) 0 2em;
width: 100%` — full-bleed sheets over the canvas — and the `.md-mediaquery` block at
`styles.less:196-207` flips them back to `position: relative; top/right/bottom/left: 0; width: auto`
to become grid items.

Defaults traced to literals, not to fallback parameters: `isHeaderPanelEnabled()` /
`isLeftPanelEnabled()` / `isRightPanelEnabled()` / `isFooterPanelEnabled()` all read
`Bools.getBool(config.options.<x>PanelEnabled, true)` (`BaseExtension.ts:1090-1114`) — and the OSD
extension's own shipped config sets all four to `true` explicitly
(`.../uv-openseadragon-extension/config/config.json:8-10, :37`), so the JS default is not the thing
doing the work. `createModules()` consumes them at `Extension.ts:512-538`.

**Stated absence:** universalviewer has no persistent over-canvas chrome on the image path. The only
two `position: absolute` rules in the OSD centre panel's stylesheet are a paging button carrying
`display: none !important` (`uv-openseadragoncenterpanel-module/css/styles.less:30-40`) and a loading
spinner (`:224`). Its dialogues are modal overlays in a separate `.overlays` container that is
`hide()`n at construction (`Shell.ts:68-70`) — transient, not chrome.

## mirador — docked panels, and an overlay control bar that is the sharpest counter-example in the sweep

The panel tree is unambiguously docked. `Window.jsx:96-131` renders `WindowTopBar`, then a
`ContentRow` (`display:flex; flexDirection:row`, `:46-48`) holding a `ContentColumn` (the primary
window plus the bottom companion area) beside right / far-right companion areas, then a far-bottom
companion area — all flex siblings of a `display:flex; flexDirection:column` root (`:31-44`, via
`columnMixin` `:24-29`). `PrimaryWindow.jsx:106-115` puts `WindowSideBar` and the left `CompanionArea`
as flex siblings of the viewer inside a `display:flex` root (`:21-25`). The sidebar is a MUI `Drawer
variant="persistent"` whose Paper is a `Nav` styled `position: relative !important`
(`WindowSideBar.jsx:13-16, :26-35`) — the `!important` exists precisely to pull it out of MUI's
default fixed positioning and into flow. `CompanionArea`'s root is `position: relative; display: flex`
(`CompanionArea.jsx:12-16`); its only absolutely-positioned part is a 23px collapse tab (`:47-49`).

Then `WindowCanvasNavigationControls` — zoom controls, prev/next navigation, and the canvas
info/label — is:

```js
const Root = styled(Paper, …)(({ theme }) => ({
  backgroundColor: alpha(theme.palette.background.paper, 0.5),
  bottom: 0,
  position: 'absolute',
  width: '100%',
  zIndex: 50,
}));
```

(`WindowCanvasNavigationControls.jsx:18-31`). The 50% alpha is the tell: it is translucent because
image is meant to show through it.

**I traced the visibility rather than reading the default parameter** — this is the tropy trap.
`visible = true` at `:37` is a default param, but the container always passes the prop:
`visible: getWorkspace(state).focusedWindowId === windowId` (`containers/WindowCanvasNavigationControls.js:8-11`),
so the bar is shown on the focused window and the default is never reached. Same for
`showZoomControls`, which the container binds to `getShowZoomControlsConfig`
(`state/selectors/config.js:58-68`), resolving to `settings.js:534` `showZoomControls: true` under the
`workspace` key. And the component is passed as a **child of the OSD viewer**
(`WindowViewer.jsx:16-20`), whose container section is `position: relative` (`OpenSeadragonViewer.jsx:18-22`)
and which renders `{ enhancedChildren }` inside itself (`:65-73`, `:140`) — so the absolute
positioning resolves against the canvas, not the window.

So mirador's answer to the question is *both, by surface class*: structural panels dock; the
canvas's own controls float on it. Note also `thumbnailNavigation.defaultPosition: 'off'`
(`settings.js:521`) and `window.sideBarOpen: false` (`settings.js:483`) — mirador's *default* opening
state is a bare canvas with one translucent overlay bar and nothing docked at all.

## annomea — overlay, with no docked mode to select

There is no mechanism here because there is no choice. Every persistent read-side surface is
viewport- or container-anchored:

- `NarrativePane` — `position: fixed; left: 0; top: 0; bottom: 0; z-index: 400`
  (`NarrativePane.svelte:254-262`), width `min(420px, 42vw)` in its default `half` state (`:264`).
- `Sidebar` (the annotation drawer) — `position: fixed; top/right/bottom: 0; z-index: 600`
  (`Sidebar.svelte:103-115`); a bottom-sheet variant on mobile (`:119-131`).
- `IndexFlyout` — a persistent `.edge-tab` at `position: fixed; right: 0; z-index: 590`
  (`IndexFlyout.svelte:76-82`) and the `.flyout` itself at
  `position: fixed; top/bottom/right: 0; width: 300px; z-index: 580` (`:118-131`).
- `NavControl` — `position: absolute; bottom: 16px; left: 50%; z-index: 450`, on a
  `rgba(0,0,0,0.55)` pill with `backdrop-filter: blur(2px)` (`NavControl.svelte:65-81`).

The mounting confirms it rather than merely permitting it. The narrative pane's host is
`document.body.appendChild(paneHost)` (`runtime.ts:216-218`), as is the read-side UX host
(`viewer.ts:364-365`) — *outside* the viewer container entirely. `NavControl` is deliberately the
exception, and the code says so: "Mounted INTO the viewer container (position:absolute) so it travels
with the viewer inside the `<anvil-viewer>` WC — unlike the body-anchored read-side surfaces"
(`viewer.ts:378-381`, mounted at `:385`).

**The check that matters: nothing insets the canvas.** A `position: fixed` pane would still be
"docked in effect" if the canvas were given a compensating margin. It is not — a grep for
`margin-left` / `padding-left` / `marginLeft` / `paddingLeft` across all of `src/` returns exactly one
hit, a 4px gap on a count label (`IndexFlyout.svelte:114`). The canvas is full-bleed and the 420px
pane sits on top of it.

**Default traced to the literal, and a dead function named so nobody cites it later.**
`layout.ts:20-23` exports `defaultLayout(configLayout) => configLayout ?? 'half'`, which *looks* like
the decision — but it is called from nowhere; grep across `src/` finds only its definition and a
re-export in `viewer/index.ts:13`. Both real mount sites inline the same fallback:
`initialState: data.config?.layout ?? 'half'` (`runtime.ts:221`) and
`initialState: exhibitData.config?.layout ?? 'half'` (`main.ts:139`). The default is `'half'` either
way, but cite the mount sites, not `defaultLayout`.

## quire — abstains; and one thing here genuinely cannot be verified

Quire's deep-zoom surface is a `<canvas-panel>` web component emitted into a static publication page
(`_includes/components/figure/image/canvas-panel.js:52-64`, reached from
`_includes/components/figure/image/element.js:47-60`). The figure's assembly is three flow siblings:

```js
return html`
  ${imageElement}
  ${captionElement}
  ${annotationsUIElement}
`
```

(`_includes/components/figure/image/html.js:44-48`). The annotations UI — the only per-figure control
surface — is a plain `<form><fieldset class="annotations-ui"><legend>…` of radio/checkbox inputs
(`_includes/components/figure/annotations-ui/index.js:27-34`), emitted *after* the caption. No
positioning, no z-index, nothing over the canvas. In that sense quire docks maximally: the chrome is
the scholarly page itself, and the canvas is a block in it.

**Quire is nonetheless an abstention, not a vote.** This is the canvas-panel situation again — a
system with essentially no persistent viewer chrome cannot testify about where viewer chrome goes.
Its inline figure has none, and its one candidate is the lightbox, which I could not verify (below).

## One inherited citation, narrowed

The brief handed me tropy as settled: overlay ships on, evidenced partly by "`_esper.scss:179-184`
puts the header at `position: absolute` over the image." I opened it, because a citation an ADR is
about to carry is worth one command. **The conclusion holds; the sentence needs one word.** The base
rule is `position: relative` (`src/stylesheets/components/esper/_esper.scss:175`); the absolute
positioning at `:179-184` is *class-gated* — `.esper.overlay-mode :is(&) { position: absolute; left: 0;
top: 0; width: 100% }`. The gate closes the loop with the brief's own chain: `overlay-mode` is applied
at `src/components/esper/container.js:36-40` from `hasOverlayToolbar`, passed explicitly at
`src/components/item/container.js:106` from `:43-46`
(`settings.overlayToolbars && layout !== SIDE_BY_SIDE`), which resolves to
`reducers/settings.js:38` → `main/tropy.js:59 frameless: true` with `layout: STACKED`. So tropy does
ship overlay on — but write it as *"tropy's esper header goes `position: absolute` under the
`overlay-mode` class (`_esper.scss:179-184`), which its default settings apply
(`esper/container.js:39` ← `item/container.js:43-46`, `:106`)"*, not as an unconditional rule. The
unconditional phrasing would die the moment a reader opened line 175.

## What I could NOT verify, and why

**1. Quire's lightbox UI placement — the stylesheet is not in this checkout.** The lightbox is a
shadow-DOM web component whose template is `.q-lightbox > [ .q-lightbox-slides > slot[slides] ,
slot[ui] ]` (`_includes/web-components/lightbox/index.js:307-316`), with the UI slot filled by a
`.q-lightbox-ui` div holding zoom/fullscreen, counter, and prev/next nav
(`_includes/components/lightbox/ui.js:54-65`). Whether that UI floats over the slide or sits beside it
is decided entirely by `content/_assets/styles/components/q-lightbox.scss`, which
`_includes/components/lightbox/styles.js:16-21` resolves at build time from the *publication
project's* cwd and warns about if absent. That file does not exist anywhere in the corpus checkout —
`find . -name "*.scss"` across the whole quire tree returns nothing, because `packages/11ty` is the
engine, not a publication. The BEM names (`q-lightbox-ui__navigation-button--previous`) suggest an
overlay; **that is a guess from a class name and I am not counting it**. To settle it, open a quire
starter/theme repo, not this one.

**2. Universalviewer's compiled CSS.** I read the `.less` sources, not compiled output. The
`@screen-md` identifier referenced at `mixins.less:750-770` is undefined in this tree, but those are
unreferenced Bootstrap `.make-md-column-*` mixins; the live breakpoint is `@md-min-width: 768px`
(`variables.less:7`) via `.md-mediaquery` (`mixins-extended.less:11-15`), which is what every layout
rule I cite actually uses. I did not compile the Less to confirm cascade order.

**3. Neither system was driven in a browser.** Everything above is source reading. Computed styles
under real content — especially mirador's abspos-grid-item interaction at
`styles.less:164-172`, where `.centerPanel` is `position: absolute` but takes `grid-area: center` at
md+ — were not measured. The claim I rest UV's docking on is the *track-width change*
(`styles.less:144-150` vs `:25-29`) and `Shell.resize()`'s height arithmetic, both of which are
unambiguous without a browser.

## Can ADR-0019 claim a corpus default?

**Not the one it currently claims.** Across seven systems now swept, the count is: universalviewer
docks, clover-iiif docks, quire has no chrome to place, canvas-panel has no chrome to place, mirador
docks its panels but floats the canvas's own control bar, tropy ships overlay on, and annomea is
overlay end to end. That is two clear votes for docking, two abstentions, and three systems that put
something persistent over the canvas — one of them totally. "The corpus docks" is not true.

What *is* true, and is a sharper observation than the original claim, is that the corpus splits by
**what the chrome is for**, not by taste. Structural navigation — a contents strip, a metadata panel,
a top bar, a sibling-window sidebar — docks wherever a system has one: UV's grid tracks, clover's flex
column, mirador's persistent Drawer and CompanionAreas. What floats is the *canvas's own instrument
panel*: mirador's translucent zoom/nav bar, annomea's `◀ N of M ▶` pill, tropy's frameless header. The
line falls between chrome that navigates the collection and chrome that operates the image. Annomea is
the real dissent — it floats its narrative pane, which is structural by any reading.

The sentence I would put in the ADR:

> Across the swept corpus the placement rule is not uniform, but it is not arbitrary either:
> **structural navigation chrome docks out of the canvas wherever a system has any** — universalviewer
> resizes the centre grid track when its contents or metadata panel opens
> (`css/styles.less:114-131`, `:144-150`), clover-iiif renders header and content as flex-column
> siblings (`Viewer.tsx:180-184`), and mirador's sidebar and companion areas are flex siblings of the
> OpenSeadragon section (`Window.jsx:96-131`, `PrimaryWindow.jsx:106-115`) — while the canvas's own
> *instrument* controls are routinely floated on it (mirador's translucent zoom/nav bar,
> `WindowCanvasNavigationControls.jsx:18-31`; tropy's esper header under its default-on `overlay-mode`
> class, `_esper.scss:179-184`). Archie docks both classes. The first half follows the corpus; the second is
> a deliberate departure, taken because [reason], and it is contradicted outright by annomea, which
> floats even its structural narrative pane over the canvas at z-index 400 with no inset compensation
> (`NarrativePane.svelte`, `runtime.ts:216-218`).

That is defensible on re-reading, names its own counter-example, and — unlike a bare "corpus default"
— tells the next reader exactly which half of the ruling is convention and which half Archie owns.
