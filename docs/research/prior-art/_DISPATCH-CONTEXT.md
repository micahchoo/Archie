# Prior-Art Survey — Shared Dispatch Context

Every axis surveyor reads THIS file + `_FRAMING.md` before working. Do not re-derive; consume.

## Goal

Survey prior art for a planned IIIF tool: **OpenSeadragon + Annotorious viewer; a CMS gallery + exhibit-making UI; a published exhibit viewer; multi-media (audio/video/image) + multi-object exhibits; annotations at project & image level; linkable/navigable annotations; W3C Web Annotation (WADM); web-publishable serverless (GH Pages).**

ROOT = `/mnt/Ghar/2TA/DevStuff/Annotators/Image`. All paths below are relative to ROOT.

The point of the survey is **reuse**: find the *pure-logic* sources (framework-agnostic algorithms/functions we could lift) and the *contexts* they're used in, separated from framework-coupled glue. `_FRAMING.md` tells you what our own projects already tried, ruled out, or left open — hunt accordingly.

## Repo inventory (axis-relevance in brackets — ① deep-zoom-viewer ② annotation-tools ③ data-model/WADM ④ multimedia-AV ⑤ multi-object/collections ⑥ authoring-CMS ⑦ published-read-UI ⑧ linkable/navigable ⑨ web-publishable/serverless ⑩ state-mutation)

External, clean single-project repos:
- `IIIF/openseadragon.github.com` — OpenSeadragon docs/website [①]
- `osd-audio-video` — 3 HTML experiments: `audio-canvas.html`, `video-canvas.html`, `multi-canvas-strip.html` + media assets [④①⑤]
- `IIIF/cozy-iiif` — TS IIIF API library on top of `@iiif/presentation-3`; has `src/` + `test/` [③⑤①] — high pure-logic density
- `IIIF/tiny-iiif` — turn a folder of images into a static IIIF setup [⑨⑤①]
- `IIIF/immarkus` — React image-annotation environment (uses Annotorious); `src/`, woff2 fonts [②③⑥⑨]
- `IIIF/iiif-manifest-editor` — React/lerna monorepo manifest editor (Vault pattern: normalized entity store) [⑥⑤③]
- `IIIF/liiive` — real-time collaborative IIIF annotation; `liiive-client` + `liiive-server`, docker-compose [②⑩⑦]
- `IIIF/iiif-visual-search` — Astro/React visual-search prototype; deps cozy-iiif + browser-visual-search [⑤⑥②]
- `IIIF/browser-visual-search` — FastSAM + CLIP + onnxruntime-web in-browser; TS+py [⑩②] — pure-logic ML region detection
- `juncture` — Vue visual-essay framework (Getty/JSTOR); `components/`, `js/` [⑦⑧⑨]
- `quire` — `@thegetty/quire` multi-format book publishing (web/print/pdf) [⑦⑨]
- `tropy` — Electron research-photo organize/describe; ~398 js, redux-toolkit [⑥⑤]

User's own / active projects (MOST relevant — see `_FRAMING.md`):
- `annomea` — Svelte+TS annotation app; many `*-AUDIT.md` (read-side lessons) [②③⑦⑧]
- `anvil` — the PLANNED product (PRD.md, CONTEXT.md, docs/, ADRs) [all axes — prior decisions]
- `field-studio` — `iiif-field-archive-studio`; `@annotorious/openseadragon` + `cozy-iiif`; largest codebase (729 js); audits present [①②③⑥⑤]

Grab-bags — TRIAGE contents first, do not deep-survey blindly:
- `BIIIF` — zip/folder stash: `annotorious-openseadragon-main.zip`, `biiif-cli`, `biiif-deploy`, `beehive_poster_viewer`, `Videojs`, `appimage.tropy`, BIDRI metadata csv [②④⑨⑤]
- `canvases-annotations-sharing` — `Annotation-sync-mutation-research/` (4 pure-logic pattern docs), `Research-Narratives/` (Svelte narrative-builder app w/ mindmap/spatial-connection), clones: Budibase, FossFLOW, Graphite, Immich, excalidraw, ente, drafft-ink [⑩⑦⑧⑥]
- `iiif-demo` — `IIIF-generator`, `IIIFtoolset`, `bhc-demo-canopy`, `bhc-demo-tropy`, `biiif` [⑨⑤]
- `anvil project 1`/`anvil project 2` — sample project data (annotations/assets/images) — example artifacts only, low priority
- `wadm-roundtrip` — verdict already digested in `_FRAMING.md` [③]; `Archie/` — survey DESTINATION, empty

## Output contract (READ CAREFULLY)

1. Write your axis file to `Archie/Prior Art/NN-<axis-slug>.md` (mind the SPACE in "Prior Art"). Filenames assigned per axis below.
2. This is a **citation matrix, not an essay.** Every capability claim needs a real `relpath:line` reference — a file you actually opened to that line. If you only inferred something without opening to a line, write `inferred: <relpath>` — NEVER fabricate a line number.
3. Tag every extractable: **PURE** (framework-agnostic logic, lift-able) vs **COUPLED(<framework>)** (entangled with React/Vue/Svelte/OSD/Astro/Electron/etc.).
4. Give each extractable a one-line **context**: what the source uses it for + how it maps to OUR axis.
5. Use consistent terminology from `_FRAMING.md` glossary (Sound not Audio, Path not freehand, AnnotationPage, FragmentSelector/SvgSelector, etc.).
6. Routing: you have context-mode MCP. Read large files via `ctx_execute_file`; grep via `ctx_execute(shell)`. Do NOT flood your own context.
7. **Return to me ≤200 words:** file path written · # sources surveyed · # PURE extractables found · top-3 gold `file:line` citations · single biggest gap (a capability NO surveyed repo solves).

## File template (use verbatim structure)

```markdown
# Axis NN — <Axis Name>

## Focused question
<the one question this axis answers for our build>

## Sources surveyed
<repo — relevance — y/n actually opened>

## Findings by source
### <repo> — <one-line relevance>
- **<capability>** — `relpath:line` — PURE | COUPLED(<fw>) — context: <what it does there / how it maps to us>

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Extraction effort | Maps to our need |
|---|---|---|---|---|---|

## Gaps — what NO surveyed repo solves
## Verdict for our build (lift / study / avoid, and why)
```

---

## WAVE 3 ADDENDUM (axes 11–20 — see `11-20-NEW-AXES.md` for axis defs)

**Newly cloned prior art (depth-1 clones, 2026-05-24) — axis-relevance in brackets:**
- `IIIF/annotorious` — full Annotorious monorepo (the canonical SVG-selector source; THE place to study the Ellipse/Path fix) [②③⑭⑳]
- `IIIF/clover-iiif` — Northwestern Clover: modern React IIIF viewer, ships as a web component, A/V support, search UI [④⑦⑪⑫⑱]
- `IIIF/mirador` — multi-window IIIF viewer; strongest a11y + i18next + real `Choice` rendering + virtualization at scale [⑪⑫⑬⑯⑱]
- `IIIF/universalviewer` — UV: read-side viewer, A/V, embed/oEmbed, content-state [④⑦⑱⑪]
- `IIIF/canopy-iiif` — static IIIF site generator. **CAVEAT: Node SSG — it ALSO punts tile generation and runs in a build step, NOT in-browser. It confirms gap A / axis-17; it does NOT close them. Do not let any surveyor claim canopy makes us serverless.** [⑨⑪⑤]
- `IIIF/manifesto` — IIIF-Commons model library: pure IIIF Presentation parsing/traversal logic [③⑤⑭]
- `hyperaudio-lite` — PURE transcript↔audio sync (the exact axis-19/gap-D transcript piece) [④⑲]
- `decap-cms` — backend-less Git-based CMS: OAuth-from-SPA + GitHub push without a server (gap A) [⑨⑳⑥]
- `scrollama` — PURE scroll-driven step trigger (the scroll-sync primitive) [⑦⑧⑪]
- (failed/unavailable publicly: Cogapp/storiiies-editor, digirati-co-uk/exhibit — substituted by UV + Canopy + Manifesto.)

**Redundancy guard:** axes 11,12,13,16,18 all touch mirador/clover/UV. Each agent: scan ONLY your slice (a11y agent → ARIA/keyboard; i18n agent → language maps/Choice; embed agent → web-component/oEmbed; perf agent → virtualization/bundle). One line in your file noting "X covered by axis N" instead of re-deep-diving.

**Honesty over padding:** axes 12 (a11y) and 17 (in-browser tiling) and the demoted theming are corpus-THIN. A short file that says "no repo solves this, here's the closest adjacent code + why it's a gap" is a CORRECT result. Do NOT pad to match the density of files 01–10. Thin is a finding.
