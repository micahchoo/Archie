# Archie — Interface Design System

## Intent

**Who:** A curator, scholar, or educator examining visual material closely. Hours spent with the image, marking regions, writing interpretive notes, building layered arguments. Precision matters. Not a casual user.

**What they must do:**
1. **View media** — deep-zoom pan/scan, switch between objects, inspect details
2. **Annotate media** — draw regions on images, write notes, tag, assign to layers
3. **View annotations** — browse the note list, filter by layer/tag, read and edit bodies
4. _(Phase 3)_ **Create narrative** — sequence sections, link prose to objects
5. _(Phase 3)_ **View narrative** — read prose-driven exhibits with scroll-sync

**What this should feel like:** A well-lit study carrel at dusk. The image is the star — dark, focused, immersive. Notes live on warm paper beside it. Tools are reachable but recede. The annotation shape on the image IS the primary UI element; everything else orbits it. Never a dashboard. Never a consumer app.

## Palette

**Foundation:** The study at dusk — dark canvas, warm paper, stone walls.
**Accent (primary):** Forest green — the scholar's ink, a precise cool green. Selection states, active-layer/reading indicator, drawing tool cursor, link affordances, the "active" object in the rail.
**Accent (secondary):** Golden amber — the study's lamplight / gilt frame, the warm counter to the cool ink. A *deliberate two-accent system* (not accent sprawl): amber carries emphasis **only where forest green fails contrast** — green-on-grey is unreadable (e.g. accent text/icons on the dark grey overlay `#252420` or against the muted inks). It must never read as the green "active/selection" state, and it is **not** the `warning` semantic. Added 2026-05-29 from a human-smoke contrast finding (green on grey not readable).

```
Canvas (dark light-table):
  surface: #181714 (bg), #1e1d19 (raised), #252420 (overlay)
  ink: #e8e4db (primary), #a09b8e (secondary), #5c584e (muted)
  border: rgba(160,155,142,0.15) / rgba(160,155,142,0.3) (emphasis)

Paper (notes sidebar, forms, prose pane):
  surface: #f5f0e6 (bg), #fcf9f2 (card), #ede7d8 (hover)
  ink: #2c2618 (primary), #6b6250 (secondary), #a09880 (muted)
  ink-on-accent: #fff
  border: rgba(107,98,80,0.15) / rgba(107,98,80,0.32) (emphasis)

Gallery wall: #ebdfce

Accent (primary) — forest green:
  primary: #3a6b4c
  hover: #2d553d
  muted: rgba(58,107,76,0.12)

Accent (secondary) — golden amber (lamplight / gilt frame):
  on canvas (dark):  #d6a23e (primary), #e3b65a (hover), rgba(214,162,62,0.14) (muted)
  on paper (light):  #9a6f1e (primary), #835d16 (hover), rgba(154,111,30,0.12) (muted)
  ROLE: contrast rescue + secondary emphasis ONLY. Reach for it when forest green sits on a grey
  surface (overlay #252420, muted inks) and the pair is unreadable. Never for active/selection
  (that stays green). Distinct hue/role from `warning` below.

Semantic:
  success: #5a8f4a
  warning: #c49b36 (caution — NOT an accent; close to amber by hue, separated by meaning + usage)
  error: #c44536 (vermillion — only for destructive/danger, never accent)
```

> **Contrast rule (2026-05-29):** forest-green-on-grey is the known low-contrast failure. Any
> green accent rendered on a grey/dark-grey surface must either move to a higher-contrast surface
> or switch to the golden-amber secondary accent. Audit: legend swatches, active-object ring on the
> dark rail, link affordances on the canvas overlay.

## Depth

Shallow. Elevation is conveyed through:
- 1px borders on raised surfaces (not heavy shadows)
- `border-left: 3px solid var(--accent)` on active notes
- 1–2px subtle shadows only where a surface floats above the canvas (popup, drawer)
- No heavy card shadows, no material-style elevation ramps

## Surfaces

**Canvas** (dark, immersive): The OSD viewer fills the space. Header + object rail sit above as thin bars. The popup floats over the annotation region (not a modal, not a dialog — selection state IS popup open-state).

**Paper** (warm, readable): The sidebar. Note list, WADM form, narrative prose pane. Feels like a notebook laid beside the light table.

**Gallery** (neutral, inviting): The Library home. Card grid of exhibits on a warm stone wall. Exhibits are invitations to enter, not admin rows.

**Drawer** (slide-in, Phase 3): For narrative prose + TOC. 3 states: mini (28px edge tab) / half / full. Slides over the canvas; canvas remains live behind it.

**Popup** (floating, planned): Appears at the annotation region on the canvas. `max-height: 78vh; overflow-y: auto` (liiive contract). Shows body preview + layer/tag chips. Click-through to open full detail in sidebar/drawer.

## Typography

**Display:** Cormorant Garamond or Georgia — exhibit titles, section headings. Serif, sharp, scholarly but warm.
**Body:** Crimson Text or Georgia — note bodies, prose, long-form reading. Serif, high legibility at text sizes.
**UI:** Work Sans or system-ui — buttons, labels, chrome, form fields. Sans-serif, clear at small sizes.
**Mono:** JetBrains Mono or ui-monospace — tags, technical identifiers, revision hashes.

Font stack: `--font-display: "Cormorant Garamond", Georgia, serif; --font-body: "Crimson Text", Georgia, serif; --font-ui: "Work Sans", system-ui, sans-serif; --font-mono: "JetBrains Mono", ui-monospace, monospace;`

**Type scale tokens** (UI — not body/display text):
- `--text-ui-sm: 0.8125rem` (13px) — buttons, chrome labels
- `--text-ui-md: 0.75rem` (12px) — section headers, hints, eyebrow
- `--text-ui-xs: 0.7rem` (11px) — captions, tiny labels

## Spacing

4px base unit. Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48.

## Radius

`--radius-sm: 4px` (buttons, inputs), `--radius-md: 8px` (cards, panels), `--radius-lg: 12px` (modals, large surfaces).

---

## Layout Anatomy — Studio

The Studio is a single SPA with two scales:

### Library Home
`Library › exhibits grid` — card grid on gallery-wall background. Each card: cover thumbnail, title, object count, slug. New-exhibit affordance as a dashed tile.

### Exhibit Workspace
Three zones, left-to-right:

```
┌─ Header ───────────────────────────────────────────────┐
│ ← Exhibits  │  Title  │  Tools  │  Layer ▾  │  Save…   │
├─ Object Rail ──────────────────────────────────────────┤
│ [obj1] [obj2] [obj3] …                            +Obj │
├─ Canvas ───────────────────────┬─ Sidebar ─────────────┤
│                                │  Object title         │
│     OSD Deep-Zoom Viewer       │  N notes (eyebrow)    │
│     (image fills the space)    │  ┌──────────────────┐ │
│                                │  │ Note card · tags  │ │
│     [popup at region on        │  │ 3-line preview    │ │
│      annotation select]        │  └──────────────────┘ │
│                                │  ┌──────────────────┐ │
│                                │  │ Note card · tags  │ │
│                                │  └──────────────────┘ │
│                                │  ── WADM Form ──────  │
│                                │  Comment [textarea]   │
│                                │  Tags [input]         │
│                                │  Layers [checkboxes]  │
│                                │  [Delete]             │
└────────────────────────────────┴───────────────────────┘
```

**Header:** Breadcrumb back to Library, exhibit title (wordmark), tool palette (Select | Rect | Polygon), layer filter dropdown, save state + action buttons (Save, Import, Download, Publish).

**Object rail:** Horizontal scroll of object thumbnails with labels + note counts. Active object gets the accent border. "+ Object" dashed affordance at the end. Drop zone for image files.

**Canvas:** The OSD viewer. Fills available space. Dark background. Drawing mode overlays the annotation tool (crosshair cursor in accent color). Annotation shapes render as stroke-over-stroke outlines (1px light + 1px dark). Selected annotation shows accent outline + popup at region.

**Sidebar:** Fixed 352px width (88× 4px grid) on the right. Same width in Studio and Viewer — the notes panel is a deliberate secondary surface, not a cramped margin. Warm paper background. Scrollable independently from canvas. Contains: editable object label, note count eyebrow, scrollable note list, WADM edit form for selected note.

### Component Decomposition (from current monolith)

App.svelte (663 lines) decomposes into:

| Component | Action served | State |
|-----------|--------------|-------|
| `StudioHeader.svelte` | View media + Annotate (toolbar) | tool, mode, layerFilter, dirty, storeReady |
| `ObjectRail.svelte` | View media (navigation) | objects, currentObjectId, add-object form |
| `NotesSidebar.svelte` | View annotations | notes, selected, editing, WADM form |
| `NoteCard.svelte` | View annotations | single note preview (comment + tags + layers) |
| `WadmForm.svelte` | Annotate (edit body) | comment, tags, layers for selected note |
| `CanvasWorkspace.svelte` | View media + Annotate | canvas mount, drop zone, drag-over |
| `AnnotationPopup.svelte` _(planned)_ | View annotations | body preview at region, opens detail |
| `PublishDialog.svelte` | Publish | GH Pages target form |
| `MergeReview.svelte` | Collaborate | conflict summary panel |

### 3-Action Routing

Within the Exhibit Workspace, the three actions coexist as modes on the same surface — no page transitions:

- **View media:** Default state. Select tool active. Click a note → fitBounds to its region. Object rail to switch objects.
- **Annotate media:** Draw tool active (Rect or Polygon). Draw on canvas → creates note → switches to Select mode, selects the new note, opens WADM form in sidebar.
- **View annotations:** Sidebar shows the note list. Click a note → fitBounds to its region on canvas, highlight its shape, show popup. WADM form opens for the selected note for editing body/tags/layers.

Narrative (Phase 3) adds a prose pane (drawer, 3-state: mini/half/full) that drives the canvas via scroll-spy + click-to-activate section links, reusing the same OSD mount + fitBounds contract.

---

## Layout Anatomy — Viewer

The Viewer is a published static site (Astro + Svelte islands). Same palette, different posture: read-only, the author's choices are locked.

### Exhibit View (Single/Grid layouts)
```
┌─ Header ───────────────────────────────────┐
│  Exhibit title · Author · Back to Gallery   │
├─ Object Grid / Single Object ──────────────┤
│                                             │
│   OSD Viewer (full-width)                   │
│                                             │
│   [popup on annotation click]               │
│                                             │
├─ Footer: object nav / layer toggle ────────┤
└─────────────────────────────────────────────┘
```

### Narrative View (Phase 3)
```
┌─ Prose Pane (mini/half/full) ───┬─ Canvas ─┐
│ Section 1: Introduction          │           │
│ ...prose text with [refs]...     │  OSD      │
│ Section 2: The hands             │  pans to  │
│ ...more prose...                 │  region   │
│                                  │           │
└──────────────────────────────────┴───────────┘
```

3-state pane: mini (28px edge tab with TOC hint), half (shared screen), full (prose-led reading). Scroll-spy drives canvas pan; click on [ref] → fitBounds. Active section highlighted in prose. Popup on annotation click.

### Empty Hall (portable mode — ADR-0008)

Shown when the Viewer holds no library yet (a deployed shell with no baked tree, or before a `.archie.zip` is opened). The **vacant gallery wall** (`--surface-gallery`) with ONE centered invitation: a **dashed empty picture frame** (no fill, `1.5px dashed --border-paper-emphasis`, `--radius-lg`) — the signature, rhyming with the Studio's `+Object` dashed affordance ("bring something in"). Inside: eyebrow `Archie` · display `h1` "Open a library" · body lede · one **forest-green** action "Open a library…". The whole window is a drop target — dragging anywhere lifts an accent wash (`--accent-muted` + dashed accent border, "Release to open the library"). **Cold-arrival variant** (§96): a warning-toned line when a deep-link landed with no library open. **Voice:** name the action + the artifact the recipient holds, so they know what to open — "Open a library" + its `.archie.zip` file (2026-05-27: the filename IS named, for findability; what's still avoided is imperative tech-speak like "import ZIP" / "upload"). Component: `EmptyHall.svelte` (presentation + file capture; open logic is `published.ts`). The **"Open another library"** swap (CONTEXT §223) lives as quiet top-right chrome in `ViewerShell`, shown whenever a library is loaded (hosted or portable — revised 2026-05-27), present even when a single exhibit collapses the gallery (anti-trap); it drops to the empty hall.

---

## Craft Notes

- Annotation shapes on the canvas use **stroke-over-stroke** (1px light inner + 1px dark outer) for cross-background legibility. No image analysis needed for v1.
- The popup is NOT a modal — it dismisses on click-away or selecting a different annotation. Selection state IS popup open-state.
- Long annotation bodies: popup caps at `max-height: 78vh; overflow-y: auto`. Sidebar note cards clamp to 3 lines with `line-clamp`. Full body visible in the WADM form (sidebar) or drawer detail (Viewer).
- "Lots of annotations" means the sidebar list needs to be fast-scannable: note count eyebrow, layer/tag chips in each card, search/filter planned for v1.1.
- The Library-level Gallery and the published Gallery share one data source (`exhibits.json`) but render differently: Studio = dark table, Viewer = warm wall.

---

## Design Decisions — 2026-05-29 human-smoke

Recorded design intent for findings filed as seeds issues. These are **design-system commitments**.
Author all copy in **curator voice** (name the action + what it produces; no media-editing/dev jargon).

> **BUILT 2026-05-29.** All six decided features below are implemented + gate-green (studio build +
> 13 tests · viewer build + astro check 0/0/0 + 13 tests · render-core 435 / mount 17 / svelte 17).
> ADR-0011 filed (gesture-initiated creation). Contracts: `docs/reviews/plans/CONTRACTS-smoke-build.md`.
> **Carried-forward TODOs (not regressions — scoped deferrals):**
> - **7e1f contrast (0045):** the whole-object frame draws over the near-black canvas `#181714` where
>   forest-green is the established normal, so the amber-rescue was NOT applied (a raw WCAG check would
>   wrongly flip *every* frame to amber). A surface-aware amber rescue is a TODO in viewer `frameColour`.
> - **7e1f AV frame:** image/OSD only (the frame is an OSD-container overlay; AV is MediaPlayer, not OSD).
>   AV coverage *detection* exists (`temporalCoverage`) but no AV frame render.
> - **ea50 scope:** the visual MediaPicker cites THIS exhibit's notes by image (the resolvable +
>   thumbnail-bearing set; `LinkTarget` resolves exhibits + notes only, not objects). ⌘K stays the
>   cross-exhibit text path. The NarrativeEditor "from a note" `<select>` was left as-is (works), not
>   re-skinned to tiles.
> - **1489 reading-colour:** a swatch picker on reading *creation* (auto-cycle default); no edit-colour-
>   after-creation surface yet. Runtime smoke owed on all (no browser here): emphasis modulation visible,
>   coverage-frame click-targets, MediaPicker thumbnails, swatch pick.

- **Annotation marker styling** (seeds `Archie-1489`). **Scope decided 2026-05-29 (grill): A+C, not B.**
  - **Colour is reading-driven only** (ADR-0007: `colour` identifies a Reading; the viewer legend is a
    radio that depends on colour = which-reading). The curator *picks* a reading's colour where readings
    are created/edited (dovetails with the `Archie-455a` reading modal). **No per-note colour override** —
    it was rejected because it creates two competing colour sources and breaks the legend contract.
  - **Per-note styling is emphasis only** — opacity / stroke-weight, **never hue** — so a mark can be
    pushed forward/back without lying about which reading it belongs to.
  - **Base (reading-less) notes** get one neutral default style (forest-green ink) so they aren't invisible.
  - Keep the stroke-over-stroke legibility treatment under any colour. Today's `readingStyleOf`
    (`ExhibitView.svelte`, `fillOpacity 0.18 / strokeOpacity 0.95 / strokeWidth 2`) is the donor shape.
- **Large-annotation affordance** (seeds `Archie-7e1f`). **Decided 2026-05-29 (grill): A+B.** When a mark
  covers **>~75%** of the media (threshold tunable), the overlay rectangle becomes noise — instead draw an
  **overarching border** framing the whole media, clickable from **any of the four corners** (corner
  hit-targets; media center stays unobstructed). This is the gilt-frame metaphor literalised.
  - **Detection is automatic** by default — computed from the selector geometry (image: bbox area ÷
    canvas; AV: time-range ÷ duration with no spatial box). Self-corrects on resize; no data change for
    the common case.
  - **Plus an authored override** — a per-note "applies to the whole object" flag (small ADR-0006
    annotation-level hint) for cases the geometry misses (e.g. a curator who *means* whole-media at 60%).
  - Border inherits its **reading colour** (per the `Archie-1489` A+C decision), switching to the
    **golden-amber secondary accent only if green fails contrast** on that media (per the `0045` rule).
- **"Exhibit layout" control + per-layout copy** (seeds `Archie-1f0e`). The layout chip
  (`ExhibitOverview.svelte`, currently "▦ {layout}") gets the explicit label **"Exhibit layout"**, and
  each layout (single / grid / narrative) carries one line of curator copy naming its *reading intent*
  ("one object, full attention" / "a wall of objects to scan" / "a guided sequence with prose"). Not
  feature names — what the visitor experiences.
- **"Add a reading" educational modal** (seeds `Archie-455a`). First use opens a teaching modal: what a
  Reading **is** (an interpretive pass — ADR-0007), that a note sits in at most one reading or the
  always-visible base, and that readings get colours (ties to marker styling above). Curator voice,
  warm-paper surface, dismissible-and-remembered.
- **Viewer top bar** (seeds `Archie-dba2`). **Decided 2026-05-29 (grill): A — one three-zone bar, carousel
  moves IN.** A single thin persistent top bar (`ViewerShell` owns it; ADR-0008 one shell): **left** =
  breadcrumb / "Back to Exhibit"; **center** = the object carousel (‹ prev · *i/n* · next ›); **right** =
  "Open another library" (quiet chrome, per the Empty Hall note). The carousel **moves out of the canvas
  overlay** (today it floats top-center over the image in `Reader.svelte`, matching `.popup`/`.legend`)
  **into the bar** — one persistent home, more discoverable, and it stops occluding the image top-center.
- **Remove from library / remove from exhibit** (seeds `Archie-3f4c`). **Decided 2026-05-29 (grill).**
  Destructive remove buttons in the scoped `DetailsEditor` (+ new `onremove` prop): `scope="exhibit"` →
  "Remove from library"; `scope="object"` → "Remove from exhibit".
  - **Confirm = inline two-step** (NOT `window.confirm`): the button morphs in place to a vermillion
    (`--error`) "Confirm — this can't be undone"; the second click is the guard. On-brand for the study.
  - **Object removal tombstones its notes** via `session.deleteNote` (append-only, ADR-0003 — recoverable
    through history; orphaned tombstones simply don't project). NOT a hard drop; `clearExhibitAnnotations`
    is per-exhibit, too broad. Removing an exhibit = `clearExhibitAnnotations(slug)` + drop from `exhibits[]`.
  - **Last-item edges:** removing the **last exhibit** → a **truly-empty library** ("no exhibits yet —
    create one", rhyming with the Empty Hall); **do NOT reseed `DEFAULT_EXHIBITS`** (would resurrect demo
    content after a deliberate wipe). Removing the **last object** → empty exhibit, already valid
    post-`Archie-e5c0` (lands at the overview with the Add-object plate).
- **Viewer breadcrumb relabels** (seeds `Archie-2cc1`). "All objects" → **"Back to Exhibit"**; "All
  Notes" → **"See all notes"** — action-named, not category-named (curator voice).
- **Exhibit-page canvas vertical rhythm** (seeds `Archie-48ee`). The exhibit-page pan/zoom canvas (and
  the grid) read too narrow — give the canvas viewport more height. The image is the star (Intent §);
  the canvas should dominate the exhibit page's vertical space, chrome staying thin.
- **Creation model — drawing is note-initiated; selection is ambient** (seeds `Archie-6d65`).
  **Decided 2026-05-29 (grill): B, made canonical.** Retires the persistent Select|Rect|Polygon tool
  palette (an adopted-from-anvil toolbar). New model:
  - **Selection is always on** — clicking a mark selects/inspects it; there is no "select tool" to pick.
  - **Drawing is armed only by creating a note** — a "New note" affordance (the notes pane is the entry,
    fork B) lets you choose the shape (rect / polygon), draw the region, and the note is created at that
    locus (ADR-0006 edit-at-locus). There is **no other creation surface** that needs the draw tools.
  - **Consequence:** the header tool palette + persistent `tool`/`mode` state is removed; the
    "3-Action Routing" + "Layout Anatomy — Studio › Header (Tools)" sections **below are superseded** on
    this point (Annotate = note-creation, not a sticky draw mode). **ADR-worthy** (retires an adopted
    pattern; surprising to a future reader; real trade-off vs anvil's mode toolbar) — offered to the user.
  - **Refined model (2026-05-29):** the **gesture is universal** — *choose-shape → draw* — and is the only
    way drawing ever starts. It's initiated by an explicit CREATE act, of which there are two: **note
    creation** and **narrative camera framing**. What the gesture *produces* differs (a note vs a section
    camera, ADR-0005); the gesture and the absence of a sticky tool-mode are identical. So framing is **not**
    an exception — same primitive, different product.
  - **Caveats still to honor when building:**
    2. **AV creation is a different gesture** (`AvEditor.svelte`: waveform-drag / video frame-box), never
       rect/polygon — so the create-arms-drawing model is image-only; AV keeps its own surface.
    3. `R`/`P` keyboard shortcuts (`App.svelte:860-1`) die with the palette — remove/repurpose.
    4. Reshaping an existing mark depends on Annotorious select-mode edit handles
       (`mount.ts setDrawingEnabled(false)`) — must survive palette removal (verify).
- **Cite + media picker** (seeds `Archie-ea50`). **Decided 2026-05-29 (grill): A (two complementary
  pickers, not one).** Research corrected the premise: "Cite" is the **⌘K text palette** (`CmdK.svelte`)
  — fuzzy search over notes+exhibits, inserts a markdown link `[label](ref)` (`encodeLinkRef`) at the
  caret, field-agnostic; "from a note" is a `<select>` (`NarrativeEditor.svelte:157`). Decision: **keep
  the ⌘K text-cite** (fast keyboard fuzzy-cite is a distinct, good interaction — do not collapse it into a
  grid) **and add a visual picker only where the user wants tiles** — scope = {exhibit **objects**, a
  note's **media**}. The two pickers **share one result shape** (a chosen ref/media item) so downstream
  insert logic is single-sourced. Do NOT retire ⌘K.
