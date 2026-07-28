# Axis 07 — Published-Read-UI (consumer/exhibit viewer)

## Focused question
How do prior-art repos present a FINISHED exhibit to a reader — narrative pane + canvas, scroll-sync between prose and image regions, popup vs drawer for annotation display, and embed/iframe contracts?

## Sources surveyed
- `juncture` — Vue visual-essay; prose drives the OSD viewer — **yes** (VisualEssay.vue, Image.vue, Default.vue)
- `annomea` — read-side audits (ADR-0007 popup+drawer; 3 flows; embed) — **yes** (5 audits + NarrativePane.svelte)
- `IIIF/liiive` — collaborative IIIF read/view room — **yes** (annotation-popup.tsx)
- `canvases-annotations-sharing/Research-Narratives` — Svelte narrative-builder read view — **yes** (App.svelte, Main.svelte)
- `quire` — static publication read-side (figures + annotations) — **yes** (getAnnotation.js, plugins listed)

## Findings by source

### juncture — prose-driven visual essay (the scroll-sync gold)
- **Scroll-spy: scroll position → active segment** — `juncture/components/VisualEssay.vue:232-245` — PURE — context: `scrollTop` watcher walks `.segment` offsets, sets `active` to the segment under the fold (−200px); maps to our narrative→canvas scroll-spy (the annomea Flow-3 "beyond anvil" gap).
- **Active segment → emit (drives viewer)** — `VisualEssay.vue:216-225` — PURE — context: `active` watcher toggles `.active` class + `$emit('set-active')`; the decoupled prose→viewer wire.
- **`zoomto` prose directive → `fitBounds`** — `juncture/components/Image.vue:586-629` — COUPLED(Vue/OSD) — context: prose link action `zoomto` resolves region/annotation/page and pans viewer; the exact narrative-link→pan pattern annomea learned it was MISSING (Framing lesson: anvil calls `fitBounds`, annomea called it zero times).
- **`parseRegionString` (xywh/pct → OSD Rect)** — `Image.vue:567-585` — PURE — context: parses `px:`/`pct:` region strings to `imageToViewportRectangle`; maps to our FragmentSelector `xywh=` → viewport anchor.
- **`fitBounds` on region, else fit cover/contain** — `Image.vue:393-394,552-556` — COUPLED(OSD) — context: animated region focus (zoomSpring); our fitBounds-on-select.
- **Split layout shell (essay col + media col)** — `juncture/components/Default.vue:534-537,940-943` — COUPLED(Vue/CSS-grid) — context: CSS-grid two-pane; study only.
- **tippy entity popup w/ lazy fetch** — `VisualEssay.vue:102-137` — COUPLED(Vue/tippy) — context: hover-popup hydrates from md/Wikipedia; popup-content pattern, not our model.

### annomea — read-side audits (encode what NOT to do)
- **ADR-0007 popup+drawer: drawer DROPPED silently** — `annomea/READ-SIDE-AUDIT.md:11,27-28` — context: popup survived (→`viewer/popup.ts`); the drawer (`Sidebar` shell + `AnnotationDetail` content) never ported though ADR-0007 is *locked*. Lesson: ship BOTH popup (quick peek) and drawer (full detail); track the pair.
- **Popup has NO max-height/overflow → off-screen** — `annomea/READ-SIDE-POLISH-AUDIT.md:47` (A1) / `READ-SIDE-UX-COMPARISON.md:31` — context: functional regression; long body grows popup unrecoverably. Fix = `max-height:78vh; overflow-y:auto` (liiive ships exactly this — see below).
- **Sync is one-shot, image→narrative only; no scroll-spy, no active-ref highlight** — `annomea/READ-SIDE-UX-FLOW-AUDIT.md:49-52` — context: BOTH anvil+annomea lack narrative→image scroll-spy and lack `.active` highlight on matched ref. The two highest-value read fixes are *beyond* either reference. juncture's `scrollTop` watcher is the missing scroll-spy.
- **Stepping works but invisible (keyboard-only)** — `READ-SIDE-UX-FLOW-AUDIT.md:27-29` — context: `nextAnnotation`/`prevAnnotation` exist, wired to Tab; no Prev/Next buttons or "N of M" counter. Surface visibly.
- **Index hidden behind 28px edge-tab, no count/hint** — `READ-SIDE-UX-FLOW-AUDIT.md:38-41` — context: discoverability gap; add count badge + first-run hint.
- **3-state narrative pane (mini|half|full) + TOC** — `annomea/src/viewer/NarrativePane.svelte:63,66-69` — COUPLED(Svelte) — context: `paneState` $state + state-button group; `scrollToRef` no-op in mini (`:141-142`). Our 3-state pane primary source.
- **Embed Channel-3 split: iframe DONE-by-being-standalone-HTML; Web-Component ABSENT** — `annomea/EMBED-AUDIT.md:11,25-31` — context: self-contained exhibit `index.html` boots from inlined `#annomea-data` (no network) → iframeable for free; but no `<anvil-viewer>` custom element registered (locked ADR-0006 half-built). Naming drift: architecture says `<anvil-viewer src= annotations=>`, code shipped `<annotated-image project=>`. Lesson: pick ONE element name; self-contained HTML satisfies the iframe contract; the WC is a separate, registerable surface.
- **`embed-snippets.ts` pure P1/P2 snippet gen + `share-url.ts` IIIF Content-State deep-link** — `EMBED-AUDIT.md:28-29` — PURE — context: copy-paste embed snippet + deep-link string-gen, near-zero coupling.

### liiive — IIIF read/view room popup
- **Popup card: `max-h-[80vh] overflow-y-auto`** — `IIIF/liiive/.../annotation-popup/annotation-popup.tsx:64` — COUPLED(React/Annotorious) but CSS contract PURE — context: the exact overflow cap annomea's popup is missing, encoded as a Tailwind one-liner.
- **`memo` body-equality bail-out** — `annotation-popup.tsx:76-77` — PURE pattern — context: re-render only when `bodies` JSON or user changes; cheap popup perf.
- **`setSelected(undefined)` to dismiss** — `annotation-popup.tsx:25-27` — COUPLED(Annotorious) — context: selection-state IS popup open-state (one source of truth).

### Research-Narratives — Svelte narrative read view
- **Read shell = router gate on data-load** — `Research-Narratives/src/App.svelte:49-72` — COUPLED(Svelte/svelte-routing) — context: `/demo/RenderedStory`→`Template` (read), `/demo`→`Main` (build); blocks render until stores hydrate from DB. Study: read-mode is a route, not a flag.
- **Annotation/connection display = right Drawer (fly) + trigger button** — `src/routes/Main.svelte:90-116` — COUPLED(Svelte/flowbite `Drawer`) — context: spatial "research map" (mindmap connections) opens in a slide-in drawer over the map canvas; left sidebar = accordion of Filter/Appearance/Sources. The drawer-for-detail pattern annomea dropped.

### quire — static publication read-side
- **`getAnnotation` filter: figures.yaml lookup by id** — `quire/packages/11ty/_plugins/filters/getAnnotation.js:7-15` — PURE — context: flat-maps `figure.annotations[].items` → finds by id at build time; renders annotations into static figure components (no client JS). Maps to our static GH-Pages publish: annotation data resolved at build, not runtime.
- **Figure/TOC/navigation as 11ty layouts** — `quire/packages/11ty/_layouts/table-of-contents.11ty.js`, `_includes/components/navigation.js`, `_plugins/figures/index.js` — COUPLED(11ty) — context: server-rendered TOC + figure components; study for static-publish structure, not liftable.

### papadam — server-rendered public exhibit read view (vs static narrative donors)
- **Public exhibit read route + media player** — `papadam/ui/src/routes/exhibits/[uuid]/+page.svelte`; `papadam/api/papadapi/exhibit/models.py:19` (`is_public`) — COUPLED(Svelte/Django) — renders ordered blocks (media + annotations) with caption-track playback. Server-backed, NOT a static GH-Pages exhibit — confirms the server-vs-static split. No scroll-sync prose pane (juncture/scrollama still own that); no fitBounds (not spatial).

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Extraction effort | Maps to our need |
|---|---|---|---|---|---|
| Scroll-spy: scroll-pos → active segment | `juncture/components/VisualEssay.vue:232-245` | PURE | DOM `.segment` offsets | S | narrative→image scroll-spy (the missing Flow-3 direction) |
| `parseRegionString` (xywh/pct→Rect) | `juncture/components/Image.vue:567-585` | PURE | OSD `imageToViewportRectangle` | S | FragmentSelector `xywh=` → viewport bounds |
| Embed snippet gen (P1 WC / P2 iframe) | annomea `lib/embed-snippets.ts` (`EMBED-AUDIT.md:28`) | PURE | none | S | consumer copy-paste embed |
| IIIF Content-State deep-link | annomea `lib/share-url.ts` (`EMBED-AUDIT.md:29`) | PURE | clipboard | S | linkable region/exhibit URL |
| Popup overflow contract (`max-height:78vh; overflow-y:auto`) | `liiive .../annotation-popup.tsx:64` | PURE(css) | none | trivial | the popup fix annomea lacks |
| Static annotation resolve-by-id at build | `quire .../getAnnotation.js:7-15` | PURE | figures.yaml shape | S | build-time annotation render for GH-Pages |
| 3-state pane state machine (mini/half/full) | annomea `NarrativePane.svelte:63,66-69` | PURE(logic) | Svelte runes (port-able) | M | our narrative pane control |

## Gaps — what NO surveyed repo solves
**Bidirectional scroll-sync with active-ref *highlight*.** Every repo does ONE direction: juncture & annomea/anvil do image/scroll→narrative scroll; none does narrative-scroll→image-pan (scroll-spy) AND none applies a visible `.active` highlight to the matched prose ref (`READ-SIDE-UX-FLOW-AUDIT.md:49-52`). juncture has the scroll-spy *mechanism* (VisualEssay.vue:232-245) but uses it for prose-self-highlight, never to drive the canvas. We must compose juncture's scroll-spy + a fitBounds call + an active-ref class — no repo ships the whole loop. Secondary gap: a registered, named Web-Component embed (`<anvil-viewer>`) exists in no surveyed read UI (annomea ABSENT, locked ADR-0006).

## Verdict for our build (lift / study / avoid)
- **LIFT:** juncture `VisualEssay.vue:232-245` scroll-spy + `Image.vue:567-585` region parser (both PURE); liiive's popup overflow CSS contract; quire's `getAnnotation` build-time resolve for static publish.
- **STUDY:** annomea ADR-0007 popup+drawer pairing and the 3-state `NarrativePane` — they are OUR model's reference impl; the audits tell us exactly which pieces drop silently (drawer, WC, active-highlight, scroll-spy) — build the checklist FROM them.
- **AVOID:** juncture's `zoomto`-via-`innerHTML`-string-parse coupling and tippy entity hydration; Research-Narratives' DB-gated router (server/Supabase-coupled, wrong for serverless single-file). Heed Framing: **navigable annotations = fitBounds + live anchor recompute**, not selection wiring alone (annomea's root-cause failure).
