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
**Accent:** Forest green — the scholar's ink, a precise cool green. Used singly: selection states, active-layer indicator, drawing tool cursor, link affordances, the "active" object in the rail.

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

Accent — forest green:
  primary: #3a6b4c
  hover: #2d553d
  muted: rgba(58,107,76,0.12)

Semantic:
  success: #5a8f4a
  warning: #c49b36
  error: #c44536 (vermillion — only for destructive/danger, never accent)
```

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

---

## Craft Notes

- Annotation shapes on the canvas use **stroke-over-stroke** (1px light inner + 1px dark outer) for cross-background legibility. No image analysis needed for v1.
- The popup is NOT a modal — it dismisses on click-away or selecting a different annotation. Selection state IS popup open-state.
- Long annotation bodies: popup caps at `max-height: 78vh; overflow-y: auto`. Sidebar note cards clamp to 3 lines with `line-clamp`. Full body visible in the WADM form (sidebar) or drawer detail (Viewer).
- "Lots of annotations" means the sidebar list needs to be fast-scannable: note count eyebrow, layer/tag chips in each card, search/filter planned for v1.1.
- The Library-level Gallery and the published Gallery share one data source (`exhibits.json`) but render differently: Studio = dark table, Viewer = warm wall.
