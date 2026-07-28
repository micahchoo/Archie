# Prior-Art Survey — Framing Brief

Derived from the user's own projects (anvil, annomea, field-studio, canvases-annotations-sharing, wadm-roundtrip). These encode hard-won decisions. Axis surveyors: use this terminology, and hunt for what these projects already tried, ruled out, or left open.

## WADM round-trip verdict (LOAD-BEARING — read first)

Source: `wadm-roundtrip/README.md`, verdict 2026-05-18 (Annotorious 3.8.2 + `@annotorious/plugin-tools`, built-in `W3CImageFormat` adapter; run in Chrome + lightpanda).

- **Rectangle + Polygon: PASS** (cosmetic-only normalizations: body wrapped in array; `xywh=` → `xywh=pixel:`; `target` gains `type: SpecificResource`; SVG `xmlns` dropped — all WADM-valid, semantically lossless).
- **Ellipse + Path: FAIL — silent geometry corruption in a REAL browser.** Not a catchable throw. Chrome: Ellipse `cx/cy/rx/ry` → `NaN` (renders invisible); Path `d="M…Q…T…"` → only the initial `M` MoveTo survives (Q/T curves stripped). lightpanda throws `lookupPrefix is not a function` instead. Root cause: the adapter's SVG parser expects a DOM Node and gets a string.
- **Only the PARSE direction (WADM→Annotorious) was tested. The SERIALIZE direction (Annotorious→WADM for user-drawn Ellipse/Path) is UNTESTED — an open hole, not a closed verdict.**
- Recommended mitigation (not yet built): pre-parse SVG ourselves for Ellipse/Path on load, bypassing the broken adapter branch.

**Implication for surveyors:** do NOT assume `W3CImageFormat` is the canonical lossless adapter. Hunt for repos that (a) wrap/extend `W3CImageFormat` to handle non-rect `SvgSelector`, (b) parse WADM SVG selectors to shapes themselves, or (c) avoid the round-trip entirely.

## Annotation data model decision (locked)

Native format = **W3C Web Annotation Data Model (WADM)** (anvil ADR-0001). Export top-level is an **`AnnotationPage`** (not a bare array — required for IIIF Presentation 3.0). Two selector types only: **`FragmentSelector`** (`xywh=` for axis-aligned rects) and **`SvgSelector`** (embedded `<svg>` for circle/point/polygon/path). Bodies: **`TextualBody`** (markdown/plain/HTML + `language`), external **`Image`/`Sound`/`Video`** (WADM spells it **`Sound`, not Audio**), multiple bodies per annotation (array), multi-language via **`Choice`**. One AnnotationPage per source image, named by content-hash. Source: `anvil/PRD.md §8`, `anvil/CONTEXT.md` glossary.

## Project vs image-level scope

**Project** = author's working-state directory: `images/`, one `AnnotationPage` per image in `annotations/`, shared media in `assets/`, optional `narrative.md`, regenerable `.anvil/manifest.json` + editor state `.anvil/project.json`. **Exhibit** = a published Project at a public URL. Annotations are image-level (per-AnnotationPage); project-level structure lives in the manifest + `narrative.md`. v1 = single-image; v2 = multi-image switcher (`anvil/CONTEXT.md`, ADR-0012).

## Storage / serverless

Project on disk = directory of plain files. Filesystem abstraction: `FsaFilesystem` (File System Access API, Chromium, in-place save) vs `DownloadFilesystem` (Firefox/Safari, `.anvil.zip`). Publish = zip download (universal, zero-auth default) OR GitHub OAuth push (GH-Pages opt-in). **Gallery** = root index page reading CI-regenerated `exhibits.json`. Distribution: PWA-only, Svelte SPA, no Electron/Tauri (ADR-0003). Bundle ~240 KB gz (OSD 150 + Annotorious 80 + plugin-tools 20).

## Glossary (use these exact terms)

Project · Exhibit · Gallery · AnnotationPage · FragmentSelector · SvgSelector · TextualBody · **Sound** (not Audio) · Choice (multi-lang) · Region (informal = drawn shape) · Narrative · Author / Author-Publisher / Consumer · single-image vs tiled mode · `.anvil/` folder · `exhibits.json`. Avoid "hotspot," "freehand" (deprecated → **Path**), "audio."

## Lessons learned

- **Read-side linking root cause** (`annomea/READ-SIDE-LINKING-NARRATIVE-AUDIT.md`): clicking a narrative link selects+opens popup but NEVER pans/zooms canvas. anvil calls `annotator.fitBounds(urn)` on every selection; annomea called it zero times. Static one-shot popup anchor (no viewport-change recompute) is the other half. Lesson: **navigable annotations require fitBounds + live anchor recompute**, not just selection wiring.
- **Locked-ADR drift** (`annomea/READ-SIDE-AUDIT.md`): the read-side drawer (ADR-0007) was never ported; popup survived, drawer didn't, nothing tracked it.
- **W3CImageFormat is documented for built-in shapes only** (anvil R7); plugin-tools shapes are the risk surface (see verdict).
- **field-studio** (`AUDIT-DESPAGHETTIFICATION.md`, `NAMING-AUDIT.md`): viewer carries 70+ `as any` because OSD+Annotorious lack types; Annotorious↔W3C is a *semantic* (not structural) type mismatch bridged by `W3CImageAdapter`.

## Per-axis "look for" hints

1. **deep-zoom-viewer** — own: OpenSeadragon (BSD-3), single-image v1 / tiled-DZI-or-IIIF-Image-API v2. Hunt: serverless OSD setups, IIIF Image API tile sources, viewport-event→annotation-anchor sync.
2. **annotation-tools** — own: `@annotorious/openseadragon` + `@annotorious/plugin-tools` (Ellipse/Path, 1-author/10-star risk per R6). Hunt: repos wrapping/extending `W3CImageFormat` for non-rect SVG; alternatives if plugin-tools can't be mitigated.
3. **annotation-data-model (WADM/scope)** — own: WADM native, AnnotationPage, FragmentSelector+SvgSelector, Choice, per-image scope. Hunt: lossless SVG-selector handling, IIIF Presentation 3.0 AnnotationPage conformance, multi-lang Choice rendering.
4. **multimedia-AV** — own: `Sound`/`Video`/`Image` bodies, multiple-bodies-per-annotation (Bidar pattern). Hunt: WADM AV-body renderers, captions/transcripts as first-class, time-based media selectors.
5. **multi-object/collections** — own: per-image AnnotationPage + manifest index + Gallery/`exhibits.json`. Hunt: IIIF Collection handling, cross-object navigation, multi-manifest exhibits.
6. **authoring-CMS** — own: Svelte editor (Sidebar, AnnotationForm/List, NarrativeEditor, PublishDialog), `iiif-manifest-editor` Vault pattern (normalized entity store, per-property editors, dirty detection). Hunt: serverless IIIF authoring UIs, manifest editors, in-browser FSA/OPFS persistence.
7. **published-read-UI** — own: popup + drawer (ADR-0007), 3-state narrative pane + TOC. Hunt: read-only IIIF exhibit viewers, narrative↔canvas scroll-sync, embed/iframe contracts.
8. **linkable/navigable** — own: `anvil://` URI scheme, parseAnvilUri delegation, **fitBounds on select** (the lesson). Hunt: deep-linkable annotations, URL-state for region focus, fig-chip/glyph link scent in prose.
9. **web-publishable/serverless** — own: GH-Pages template repo, zip + OAuth-push, CI-regenerated manifests, PWA. Hunt: static-host IIIF publishing, GH Actions exhibit builds, zero-build-on-consumer embeds.
10. **state-mutation-patterns** — own research (`canvases-annotations-sharing/Annotation-sync-mutation-research/`) distilled: signals+Immer+transactions (tldraw), GoF command pattern (JOSM), CRDT-LWW-per-property (Figma/Linear, server-authoritative > true CRDT), R-tree spatial index, batching via marks/`run()`, optimistic versioning (OSM 409). Hunt: which pattern a candidate repo *actually uses* (not claims); undo-as-presence-vs-document; local-first sync engines.
