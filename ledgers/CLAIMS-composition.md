# Claims-vs-Reality — Component Composition Context

Source: `.interface-design/system.md` (component table + surface descriptions + design decisions)
Date: 2026-07-21

## System.md claims about components

### Component Decomposition table (aspirational — names don't match current codebase)

| Claimed component | Action served | Claimed state | Actual file |
|-------------------|--------------|---------------|-------------|
| StudioHeader | View media + Annotate (toolbar) | tool, mode, layerFilter, dirty, storeReady | Inline in App.svelte |
| ObjectRail | View media (navigation) | objects, currentObjectId, add-object form | Inline in App.svelte |
| NotesSidebar | View annotations | notes, selected, editing, WADM form | Inline in App.svelte |
| NoteCard | View annotations | single note preview (comment + tags + layers) | Not extracted |
| WadmForm | Annotate (edit body) | comment, tags, layers for selected note | NoteEditor.svelte |
| CanvasWorkspace | View media + Annotate | canvas mount, drop zone, drag-over | Inline in App.svelte |
| AnnotationPopup | View annotations (planned) | body preview at region | Not extracted |
| PublishDialog | Publish | GH Pages target form | Publish.svelte |
| MergeReview | Collaborate | conflict summary panel | MergeReview.svelte |

### Surface taxonomy (from system.md)

- **Canvas:** dark, immersive — OSD viewer fills the space. Header + object rail above. Popup at annotation region.
- **Paper:** warm, readable — sidebar. Note list, WADM form, narrative prose pane.
- **Gallery:** neutral, inviting — Library home card grid.
- **Drawer:** slide-in, 3-state (mini/half/full) — for narrative prose + TOC.
- **Popup:** floating at annotation region — body preview + chips.
- **Header:** toolbar + breadcrumb + title.

### Design decision references

- Annotation markers: stroke-over-stroke (1px light + 1px dark). Per-Reading colors.
- Popup is NOT a modal — dismiss on click-away, selection IS popup open-state.
- 3-Action Routing: View media (default), Annotate media (draw creates note), View annotations (sidebar).
- Narrative adds prose drawer (3-state) driving canvas via scroll-spy.
- Creation model (Archie-6d65): selection always on, drawing armed only by note creation.

## Actual components (apps/studio/src/)

| Component | Surface | @composes | @variants | @constraint |
|-----------|---------|-----------|-----------|-------------|
| App.svelte | root | all | library-home, exhibit-workspace | single SPA with hash routing |
| AvEditor.svelte | canvas | App (video annotation mode) | image, video | AV keeps its own creation surface |
| BulkRightsDialog.svelte | dialog | modality helper | open, closed | single-scrim invariant; scrim-click + Esc + focus trap/return |
| CmdK.svelte | dialog | cmd-k link picker | search, browse | scrimmed; list-nav keys stay local |
| CreateExhibitDialog.svelte | dialog | modality helper | step 1 (path cards), validation errors | single-scrim invariant; scrim-click + Esc + focus trap/return |
| DetailsEditor.svelte | paper | standalone (opens from pencil glyph) | per-level scope (library/exhibit/object) | host-agnostic fields; two-step confirm on destructive actions |
| ExhibitOverview.svelte | canvas | App | canvas/list mode, selection mode | light-table plates on warm raised surface |
| GalleryThumb.svelte | gallery | GalleryWall | normal, selected | content-visibility: auto for virtualization |
| GalleryWall.svelte | gallery | GalleryThumb | populated, empty (with/without query) | content-visibility: auto for virtualized off-screen tiles |
| HelpMenu.svelte | popover | standalone (dropdown from ? button) | open, closed | positioned dropdown; click-away dismiss |
| IdentityPrompt.svelte | dialog | modality helper | open, submit, error | single-scrim invariant; scrim-click + Esc + focus trap/return |
| LibraryHome.svelte | gallery | App | project-bound, project-lost, empty-library, selection-mode | gallery wall with card grid; SafetyState in header |
| Marginalia.svelte | canvas | App (note margin cards) | collapsed, expanded | drawn over canvas at marker position; not a dialog |
| MergeReview.svelte | dialog | modality helper | conflict summary, side-by-side review | single-scrim invariant; scrim-click + Esc + focus trap/return |
| MetadataEditor.svelte | paper | standalone (hosted at various levels) | picker-search, row-menu | host-agnostic metadata fields |
| NarrativeEditor.svelte | paper | App (sidebar accordion) | recessed (empty), populated (spine + cards) | narrative beats authored in object editor per ADR-0005 |
| NoteEditor.svelte | popover | App (WADM form) | region scope, whole-object scope, AV time, stacked | popover NOT a modal; dismiss on Done/close; click-away |
| NotePicker.svelte | popover | App (note selection) | search, browse | list-nav keys; click-away dismiss |
| PropsDrawer.svelte | drawer | RightsEditor (via slot) | open, closed | scrim-dismiss + Esc + focus trap/return; not a dialog |
| Publish.svelte | dialog | Spinner, ZipExportFields, publish-machine | step 1 chooser, wizard, working, done-*, error | single-scrim invariant; mounted for app lifetime; in-surface back nav |
| ReadingsEditor.svelte | paper | ReadingsModal | empty, populated | host-agnostic fields; renaming never changes reading id |
| ReadingsModal.svelte | dialog | ReadingsEditor, modality helper | open, closed | single-scrim invariant; scrim-click + Esc + focus trap/return |
| RightsEditor.svelte | paper | standalone (hosted at Library/Exhibit/Object) | collapsed, expanded | host-agnostic fields; curator voice copy |
| SafetyState.svelte | chrome | standalone (mounts in header) | read-only, saved, saving, failed, action-needed | mounts in header; one end-to-end save indicator; Cmd+S owned here |
| SaveZipDialog.svelte | dialog | ZipExportFields, modality helper | step 1 chooser, working, done, error | single-scrim invariant; scrim-click + Esc + focus trap/return |
| ShortcutsHelp.svelte | dialog | modality helper | open, closed | single-scrim invariant; scrim-click + Esc + focus trap/return |
| Spinner.svelte | chrome | standalone (shared) | spinning | pure presentational; no surface of its own |
| StorageBar.svelte | chrome | App (project bar) | bound, unbound, error | project-level storage binding indicator |
| TutorialModal.svelte | dialog | modality helper | open, closed | single-scrim invariant; scrim-click + Esc + focus trap/return |
| ZipExportFields.svelte | paper | SaveZipDialog | filled, empty | host-agnostic export fields; form only, no surface of its own |

## Resolution log

| Component | Claim check | Resolution | Commit |
|-----------|------------|------------|--------|
| All 30 components | system.md component table is pre-refactor (names don't match) | JSDoc composition blocks added to every Svelte file | (this session) |
