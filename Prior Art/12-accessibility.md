# Axis 12 — Accessibility & keyboard navigation

> **Corpus is THIN for true deep-zoom a11y.** Keyboard pan/zoom and generic ARIA/focus are well-covered (OSD core, mirador, annotorious). But **screen-reader semantics for zoom regions** and **alt-text-as-a-WADM-body** are solved by NO surveyed repo. Short file = correct result. Not padded.

## Focused question
How does prior art make a deep-zoom + annotation interface accessible — SR semantics for zoom/regions, keyboard-only pan/zoom/annotate, alt-text as a WADM body, focus management for popup/drawer, reduced-motion?

## Sources surveyed
- `IIIF/openseadragon.github.com` (bundled OSD source) — keyboard/aria options — y
- `IIIF/mirador` — strongest IIIF a11y (ARIA, focus, i18n labels) — y
- `IIIF/annotorious` — keyboard commands + SVG-layer region roles — y
- `IIIF/immarkus` — Annotorious keyboard plugin in annotation UI — y
- `IIIF/clover-iiif` — ARIA attribute density — y
- `IIIF/universalviewer` — keyboard shortcuts — y (shallow)
- `field-studio` — ARIA in annotation UI — y (shallow)

## Findings by source

### OpenSeadragon (bundled `openseadragon.js`) — the built-in keyboard/a11y layer
- **Viewer is focusable** — `openseadragon.js:8141` `this.canvas.tabIndex = (options.tabIndex===undefined ? 0 : ...)`; option doc `:120`. Navigator omitted from tab order (`:12058` `tabIndex:-1`). PURE — config, not framework.
- **Full keyboard pan/zoom/rotate on the canvas** — `openseadragon.js:10785` `onCanvasKeyDown` switch: arrows pan, shift+arrow zooms, `=`/`-` zoom, `0` home, `w/a/s/d` pan, `r` rotate, `f` flip, `j/k` prev/next source. PURE — lift the keymap wholesale; it's our keyboard-only pan/zoom/annotate baseline.
- **Pluggable key hooks** — `keyDownHandler`/`keyHandler` options `:3635,:3720`, wired `:8178`. PURE — gives us a hook to add annotate-by-keyboard without forking OSD.
- *Gap:* OSD ships NO `ariaLabel`/`role` on the canvas and NO `prefers-reduced-motion` gate on its animated `panBy`/`zoomBy` springs — both absent in source.

### mirador — generic ARIA/focus reference (NOT region-level a11y)
- **ARIA roles inventory** — `status`, `menuitemradio`, `menubar`, `menu`, `gridcell`, `button`, `presentation` across `src/components/*`. COUPLED(React/MUI) — study the role choices, not the code.
- **Nav buttons labelled + i18n** — `ViewerNavigation.jsx:44,52` `aria-label={t('previousCanvas')}`. COUPLED — pattern: every icon button gets a translated label.
- **Roving keyboard nav** — `ThumbnailNavigation.jsx:72` `ArrowRight/ArrowLeft`, `:186` `onKeyDown={handleKeyDown}`. COUPLED(React) — focus-roving over a thumbnail list; maps to our v2 multi-image switcher.
- **Annotation list is plain focusable rows** — `CanvasAnnotations.jsx:58` only `&:focus` styling; no `role`, no region-to-SR mapping. Confirms the gap below.
- *No `prefers-reduced-motion` anywhere in `src` (grep empty).*

### annotorious — keyboard annotate + the one region-role signal
- **Undo/redo keyboard commands** — `packages/annotorious/src/keyboardCommands.ts:9` `initKeyboardCommands(undoStack, container)`; ctrl/cmd+z, ctrl+y / cmd+shift+z, Mac-aware. **PURE** — framework-agnostic, takes an `Element`; lift directly.
- **SVG annotation layer announces as `role="application"`** — `SVGAnnotationLayer.svelte:151`. Drag handles are `role="button"` — `editors/Handle.svelte:37,58`. COUPLED(Svelte) — the *closest* thing to region SR semantics in the corpus, but `application` role suppresses SR browse mode rather than describing regions.
- **Escape cancels drawing** — immarkus `AnnotoriousKeyboardPlugin.tsx` (full file): `Escape → anno.cancelDrawing()`. COUPLED(React) but trivially PURE-able — the focus-escape pattern for our draw mode.

### clover-iiif — ARIA density, no deep-zoom region a11y
- 33 `aria-label`, `aria-checked`, `aria-roledescription`, `aria-controls` across `src/web-components/clover-image.tsx` etc. COUPLED(React/web-component). Good label-coverage model; nothing region/zoom-specific. *(web-component embed covered by axis 18.)*

### universalviewer — keyboard in dialogues/panels
- `keydown`/`tabindex` in share/settings/download dialogues + `OpenSeadragonCenterPanel.ts`. COUPLED(UV/jQuery). Confirms UV defers canvas keyboard to OSD core (above); its own additions are dialogue focus only.

### field-studio — generic component ARIA
- `aria-label`/`role`/`onKeyDown` in shared molecules (`CanvasThumbnailCard`, `FacetPill`, `LanguageMapEditor`). COUPLED(Svelte). Component-hygiene level; no annotation-region SR semantics.

### papadam — high-contrast profile + caption track (full WCAG deferred)
- **High-contrast UIConfig profile + caption track + live-region alert** — `papadam/ui/src/lib/components/MediaPlayer.svelte:200` (`role="alert"` on error); `:166` (`<track kind="captions">`); high-contrast CSS profile (ARCHITECTURE.md UIConfig) — COUPLED(Svelte) — shipped high-contrast theme + captions + one live region; full WCAG AA audit explicitly deferred to Phase 5. Real but partial; the SR-semantics-for-regions gap this axis flags is still open.

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Extraction effort | Maps to our need |
|---|---|---|---|---|---|
| Keyboard pan/zoom/rotate keymap | `openseadragon.github.com/openseadragon/openseadragon.js:10785` | PURE | OSD viewport (we already ship OSD) | Trivial — already in our 150 KB OSD | Keyboard-only pan/zoom baseline |
| Focusable viewer + `tabIndex` option | `…/openseadragon.js:8141` | PURE | OSD | Trivial — set option | Tab-into-the-canvas |
| Pluggable `keyDownHandler` hook | `…/openseadragon.js:3635,8178` | PURE | OSD | Trivial | Add keyboard-annotate without forking |
| `initKeyboardCommands` undo/redo | `annotorious/packages/annotorious/src/keyboardCommands.ts:9` | PURE | `@annotorious/core` UndoStack | Low — generic `Element` arg | Keyboard annotate/undo |
| Escape-cancels-draw pattern | `immarkus/.../AnnotoriousKeyboardPlugin.tsx` | COUPLED→easily-PURE | annotator instance | Trivial reimpl | Focus-safe exit from draw mode |

## Gaps — what NO surveyed repo solves
1. **Screen-reader semantics for zoom regions / annotations.** No repo exposes a drawn Region or its viewport position to a screen reader. annotorious uses `role="application"` (`SVGAnnotationLayer.svelte:151`), which *suppresses* SR browse mode; mirador's annotation rows are plain focusable `<li>`s (`CanvasAnnotations.jsx:58`) with no spatial description. A blind user cannot perceive "where" a region is. **Pure greenfield.**
2. **Alt-text as a WADM body.** No repo sources an `alt`/description from an annotation body. mirador's thumbnail `alt` is the empty string (`IIIFThumbnail.jsx:127` `alt={failed ? '...' : ''}`). A `TextualBody` with `purpose:"describing"` rendered into `aria-label`/`alt` is unbuilt anywhere — ties to anvil's TextualBody model; we'd be first.
3. **`prefers-reduced-motion`.** Zero hits across OSD source, mirador `src`, clover, field-studio. OSD's spring-animated pan/zoom has no reduced-motion gate. We must add `OpenSeadragon({ animationTime: 0 })` (or media-query toggle) ourselves.
4. **Popup/drawer focus trap for the *read-side* annotation UI** — mirador traps focus in *dialogs* (`WorkspaceAdd`, `ChangeThemeDialog`), but our ADR-0007 popup+drawer pattern has no prior-art focus-management analog; mirador's dialog FocusTrap is the closest study target, not a lift.

## Verdict for our build (lift / study / avoid)
- **LIFT (free, already shipped):** OSD's built-in keyboard keymap + `tabIndex` + `keyDownHandler` hook — `openseadragon.js:10785/8141/3635`. This single-handedly delivers keyboard-only pan/zoom; just enable it and document the keys.
- **LIFT (small):** annotorious `keyboardCommands.ts` for undo/redo; reimplement the Escape-cancel from immarkus.
- **STUDY (don't lift):** mirador's ARIA role choices + i18n-labelled buttons + dialog FocusTrap — copy the *decisions* into our Svelte components; the React/MUI code doesn't transfer.
- **BUILD ourselves (greenfield, no prior art):** SR semantics for regions, alt-text-as-WADM-body, reduced-motion gate on OSD animation, read-side popup/drawer focus management. These are the WCAG gates institutional adoption needs and the corpus does not provide them.
- **Cross-ref:** clover web-component a11y → axis 18; i18n-of-labels mechanics → axis 13.
