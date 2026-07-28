# Archie Studio: Author Journey Inventory

## Overview

Archie Studio is a browser-based authoring UI for creating annotated exhibitions of images, audio, and video. The zero→published author journey spans: Library home → Create/Open Exhibit → Add Objects → Annotate (visual + temporal + narrative) → Organize (Readings, Sections, Narratives) → Publish. The exhibit-level narrative "spine" (a sequenced set of beats) is the architectural centerpiece; it flips the published visitor experience from grid-first to narrative-first.

**Key Affordances:** Dark light-table UI; overview-as-canvas (pan/zoom); deep-zoom image annotation via OpenSeadragon + Annotorious; temporal note authoring on audio waveforms & video frames; cross-exhibit linking via ⌘K palette; CSV bulk-import of annotations; GitHub Pages publishing.

---

## Journey Stages

### Stage 1: Library Home (Project Management)

**Screen:** `LibraryHome.svelte`
**Route:** `/` (landing)
**Where in UI:** Main view on boot; "Library · N exhibits" header.

#### 1.1 Create New Exhibit
- **NAME:** "New exhibit" (user terminology: "project" for saved, "playground" for templates)
- **ACTION:** Type title in text field → "Create" button OR drag `.archie.zip` file to create from binding
- **AFFORDANCE:** Text input placeholder: "Name this exhibit"; prominent "Create" button
- **OUTCOME:** New exhibit appears in library grid; user enters Overview scale
- **Source:** LibraryHome.svelte:97-102 (oncreate callback)

#### 1.2 Open Existing Exhibit
- **NAME:** "Open an exhibit"
- **ACTION:** Click exhibit plate in grid → exhibit opens; or use "Open project" button to pick from file system
- **AFFORDANCE:** Clickable plates (light-table metaphor); "Open project" button in PROJECT BAR
- **OUTCOME:** User enters Exhibit Overview; canvas lazy-loads
- **Source:** App.svelte:79-81 (CanvasComp lazy-load on view !== "library")

#### 1.3 Import Image Folder (Contributor-Broadening ①)
- **NAME:** "Import folder of images"
- **ACTION:** "… or import an image folder" link → hidden file input accepts directory
- **AFFORDANCE:** Link in the dashed "new exhibit" tile
- **OUTCOME:** Folder scanned; image objects auto-created; new exhibit opens with media ready
- **Source:** LibraryHome.svelte:48-49 (oncreatefromfolder); ingest-flows.ts:planFolderImportGroups

#### 1.4 Import IIIF Manifest (Contributor-Broadening ②)
- **NAME:** "Import from IIIF"
- **ACTION:** "Paste a IIIF manifest URL" → validated URL creates exhibit from manifest's canvas + metadata
- **AFFORDANCE:** Paste-box UI in library
- **OUTCOME:** Exhibit populated with objects from IIIF manifest
- **Source:** LibraryHome.svelte:50-51 (oncreatefrommanifest); iiif-import.ts

#### 1.5 Save/Bind Library
- **NAME:** "Save to folder" or "Save as .archie.zip"
- **ACTION:** ⌘S or "Save" button in PROJECT BAR → choose location (folder or file)
- **AFFORDANCE:** Unsaved dot indicator; "Save" button visibility
- **OUTCOME:** Library autosaves to bound location; Recent projects list persists session
- **Source:** LibraryHome.svelte:24-32 (binding prop); binding-store.svelte.js (save lifecycle)

#### 1.6 Edit Library Metadata
- **NAME:** "Library details"
- **ACTION:** Click ⓘ info icon in header → DetailsEditor drawer opens (title, description, rights/credit)
- **AFFORDANCE:** Info icon in header; pencil icon on per-card
- **OUTCOME:** Library title/description/rights updated; persists to library.json
- **Source:** LibraryHome.svelte:119-126; DetailsEditor.svelte (showTitle=true by default)

---

### Stage 2: Exhibit Overview (Object Organization & Reading Order)

**Screen:** `ExhibitOverview.svelte`
**Route:** `/exhibits/{slug}` (overview mode, before entering object editor)
**Where in UI:** Canvas scale; pan/zoom with ± buttons or scroll wheel; read-only narrative spine on the left rail.

#### 2.1 View Overview as Canvas
- **NAME:** "Overview canvas"
- **ACTION:** Auto on exhibit open; drag to PAN, scroll/±buttons to ZOOM; range 0.4–3×
- **AFFORDANCE:** Dark light-table background; object plates arranged in reading order; PAN feels like a light-table; ZOOM centers on viewport
- **OUTCOME:** User sees all objects at once, arranged spatially
- **Source:** ExhibitOverview.svelte:85-100 (pan/zoom state & gesture handlers)

#### 2.2 Switch to List View
- **NAME:** "List view"
- **ACTION:** Toggle button "Canvas ↔ List" → switches from spatial canvas to vertical checklist
- **AFFORDANCE:** Mode toggle at overview header
- **OUTCOME:** Grid becomes a plain table (fallback for accessibility)
- **Source:** ExhibitOverview.svelte:85 (mode state)

#### 2.3 Add Object to Exhibit
- **NAME:** "Add image/audio/video"
- **ACTION:** Click "+" (dashed tile at end of grid) OR "Add an object" in list
- **AFFORDANCE:** Dashed tile; labeled "+" button
- **OUTCOME:** File picker opens; user selects image/audio/video file; object imported to exhibit
- **Source:** ExhibitOverview.svelte:47 (onaddobject callback); ingest-flows.ts (file import)

#### 2.4 Reorder Objects (Narrative Sequence)
- **NAME:** "Reorder objects" / "Set reading order"
- **ACTION:** Drag object plate in canvas OR drag row in list → reorder array; App maps to section walk order
- **AFFORDANCE:** Drag-handle affordance on plates/rows
- **OUTCOME:** Narrative spine walk order updates; reading order persists
- **Source:** ExhibitOverview.svelte:51 (onreorder callback); NarrativeEditor (spine visibility)

#### 2.5 Edit Object Details (Inline)
- **NAME:** "Edit object" (per-card CRUD)
- **ACTION:** Pencil icon on object plate/row → DetailsEditor drawer (title/description/remove)
- **AFFORDANCE:** Pencil icon per plate
- **OUTCOME:** Object title/description updated; or removed from exhibit
- **Source:** ExhibitOverview.svelte:45-47 (oneditobject); DetailsEditor (showTitle=false for objects)

#### 2.6 Open Object Editor
- **NAME:** "Annotate this object"
- **ACTION:** Click object plate/row → enters Editor scale
- **AFFORDANCE:** Clickable plate or row; entire plate is the hotspot
- **OUTCOME:** Canvas loads (lazy), object zooms into deep-zoom surface, annotation UI appears
- **Source:** ExhibitOverview.svelte:43-44 (onopenobject); App.svelte:view="editor"

#### 2.7 View/Edit Narrative Spine (Read-Only)
- **NAME:** "Narrative spine"
- **ACTION:** View spine cards on left rail (non-empty spine); click "Go to [object]" to jump and focus
- **AFFORDANCE:** Card list; dimmed cards for other objects; lit card for current object
- **OUTCOME:** Spine is read-only at overview scale; clicking a card navigates to that section's object
- **Source:** ExhibitOverview.svelte:18-40 (sections prop); NarrativeEditor (read-only view on rail)

#### 2.8 Start Narrative (First-Time Gate)
- **NAME:** "Start the narrative"
- **ACTION:** When spine is empty (0 sections), "Start the narrative" link appears → drops to object editor to author beat 1
- **AFFORDANCE:** Invitation strip; "Start the narrative" CTA
- **OUTCOME:** User enters editor ready to frame first narrative section
- **Source:** ExhibitOverview.svelte:52-54 (onstartnarrative); NarrativeEditor empty-state copy

#### 2.9 Edit Exhibit Details & Rights
- **NAME:** "Exhibit properties" / "Credit & license"
- **ACTION:** ⓘ icon in overview header → DetailsEditor (title, description, rights)
- **AFFORDANCE:** Info icon in header
- **OUTCOME:** Exhibit-level metadata updated
- **Source:** ExhibitOverview.svelte:28-31 (rights/ontitle/onsummary props)

#### 2.10 View Annotation Count
- **NAME:** "Annotation count per object"
- **ACTION:** Badge on each plate/row shows count of notes on that object
- **AFFORDANCE:** Small count badge (e.g., "3 notes")
- **OUTCOME:** Visual scan tells which objects are annotated
- **Source:** ExhibitOverview.svelte:20-21 (noteCountOf prop)

---

### Stage 3: Object Editor (Image, Audio, Video Annotation)

**Screen:** `App.svelte` (primary layout) + `Canvas.svelte` (image deep-zoom) or `AvEditor.svelte` (audio/video)
**Route:** `/exhibits/{slug}/objects/{objId}` (editor scale)
**Where in UI:** Full viewport split: left rail (objects + narrative spine), center (canvas), right (note WADM form).

#### 3.1 View Object on Canvas
- **NAME:** "Deep-zoom canvas" (images) or "Audio waveform" / "Video player" (AV)
- **ACTION:** Auto on open; OpenSeadragon deep-zoom for images; WaveSurfer for audio; HTML5 `<video>` for video
- **AFFORDANCE:** Zoomable image (drag/scroll); waveform track; video frame
- **OUTCOME:** User sees full resolution image or temporal timeline
- **Source:** Canvas.svelte (OpenSeadragon mount); AvEditor.svelte (audio/video surface)

#### 3.2 Draw Annotation on Image
- **NAME:** "Draw a note"
- **ACTION:** Select tool (Rectangle, Polygon, Freehand) from toolbar → click+drag on canvas → popover opens with WADM form
- **AFFORDANCE:** Toolbar buttons "▭ Rectangle", "🔺 Polygon", "✏ Freehand"; cursor changes to crosshair
- **OUTCOME:** Drawn box creates new annotation; form opens for comment + tags + reading
- **Source:** Canvas.svelte (Annotorious @annotorious/annotorious); App.svelte:canvas-draw-handler

#### 3.3 Create Audio/Video Timing Note
- **NAME:** "Add time cue" (audio) or "Add time + region note" (video)
- **ACTION:** Audio: drag region on waveform OR click "Mark in/out" → `t=m:ss` cue. Video: click video timeline or drag on frame → `t=` + optional `xywh=percent:` (spatiotemporal)
- **AFFORDANCE:** Audio: waveform regions; buttons "Mark in" / "Mark out"; "Add note" label. Video: timeline bar + frame-draw toggle
- **OUTCOME:** Time-bound annotation created; form opens for comment
- **Source:** AvEditor.svelte:102-145 (waveform regions + video timeline); NoteEditor.svelte:68-70 (time fields)

#### 3.4 Edit Note (WADM Form)
- **NAME:** "Edit note" form
- **ACTION:** Click existing annotation → popover anchors to mark; edit fields:
  - Comment (textarea)
  - Tags (comma-separated)
  - Reading (select dropdown from available readings)
  - Emphasis (Normal / Muted / Strong)
  - Time range (audio/video only, m:ss format)
- **AFFORDANCE:** Form label "Edit note"; save button; delete button
- **OUTCOME:** Changes autosave; note geometry + metadata updated
- **Source:** NoteEditor.svelte (WADM form); App.svelte:applyForm/applyTime

#### 3.4.1 Cite a Note or Exhibit
- **NAME:** "Cite" / "⌘K link picker"
- **ACTION:** While editing note, click "¶ Cite ⌘K" button in comment field → CmdK drawer opens with list of all notes + exhibits
- **AFFORDANCE:** Keyword search input; search by note text or exhibit title/slug
- **OUTCOME:** Chosen note/exhibit inserts as markdown link `[text](#/exhibits/{slug}/notes/{id})` at comment caret
- **Source:** CmdK.svelte; NoteEditor.svelte:62 (requestCite); App.svelte:citeIntoComment

#### 3.4.2 Cite by Image
- **NAME:** "▦ By image" / visual cite picker
- **ACTION:** Click "▦ By image" button in comment field → MediaPicker grid opens with thumbnail tiles of notes/objects
- **AFFORDANCE:** Grid of image tiles with labels; search filter
- **OUTCOME:** Click tile → inserts markdown link (same format as ⌘K)
- **Source:** MediaPicker.svelte; NoteEditor.svelte:62 (requestVisualCite)

#### 3.5 Delete Note
- **NAME:** "Delete note"
- **ACTION:** While form is open, click "Delete note" button
- **AFFORDANCE:** Red button; inline confirm (no modal)
- **OUTCOME:** Note removed; annotation log updated
- **Source:** NoteEditor.svelte:88 (onDelete callback); App.svelte:deleteAnnotation

#### 3.6 Switch Objects (Rail)
- **NAME:** "Object rail" / object selector
- **ACTION:** Left sidebar shows list of objects in reading order; click to jump
- **AFFORDANCE:** Object thumbnails + labels; current object highlighted
- **OUTCOME:** Canvas switches to selected object; annotation UI clears (previous notes close)
- **Source:** App.svelte (rail component, built from currentExhibit.objects)

#### 3.7 Add Map Annotation (Geo)
- **NAME:** "Add a geo-map note"
- **ACTION:** Use drawing tool to create rectangle on a map object → popover opens; filled with geo-selector (lat/lon bounding box)
- **AFFORDANCE:** "Add a map" button in toolbar OR embedded geo-note form (if map object)
- **OUTCOME:** Geo-bound annotation with WGS84 bounds saved
- **Source:** AddMapModal.svelte; geo-notes.ts (selectorValue math)

#### 3.8 Frame a Narrative Section
- **NAME:** "Frame section camera"
- **ACTION:** In narrative spine (right rail), click "Frame" button on a section OR "Add beat" → canvas arms for drawing; draw the region you want to focus
- **AFFORDANCE:** Button "⊡ Frame this beat"; visible camera indicator on canvas after frame
- **OUTCOME:** Section's `start` field set to spatial (`xywh=`) or temporal (`t=`) fragment; focus locked for visitor
- **Source:** NarrativeEditor.svelte:47 (onframe); App.svelte:frameSectionCamera

---

### Stage 4: Organize & Curate (Readings, Sections, Narratives)

**Screen:** `ReadingsModal.svelte`, `NarrativeEditor.svelte`, `PropsDrawer.svelte`
**Where in UI:** Right sidebar (narrative spine) + modals (readings, overview narrative view).

#### 4.1 Create Reading Category
- **NAME:** "Reading"
- **ACTION:** Open "Readings" panel via ⌘K or PropsDrawer → "Readings" tab → type name (e.g., "Conservation") → "Add" button
- **AFFORDANCE:** Text input + "Add" button; color swatches auto-assign from palette
- **OUTCOME:** New reading appears in dropdown; notes can be tagged with it
- **Source:** ReadingsEditor.svelte:32-39 (add logic); mintId creates stable id

#### 4.2 Assign Note to Reading
- **NAME:** "Reading" (select dropdown in WADM form)
- **ACTION:** While editing note, select a reading from "Reading" dropdown
- **AFFORDANCE:** Dropdown with "— No reading —" + reading names
- **OUTCOME:** Note tagged with reading.id; emphasis color applies to mark
- **Source:** NoteEditor.svelte:73-77 (reading select); App.svelte:setNoteReading

#### 4.3 Edit Reading (Color, Name, Description)
- **NAME:** "Edit reading"
- **ACTION:** In Readings modal, click a reading row → inline edit name + description; swatches toggle color
- **AFFORDANCE:** Editable name field; color swatches; description textarea
- **OUTCOME:** Reading metadata updated; all notes with that reading re-render
- **Source:** ReadingsEditor.svelte:45-60 (inline edit per reading)

#### 4.4 Remove Reading
- **NAME:** "Remove reading"
- **ACTION:** Click ✕ button on reading row
- **AFFORDANCE:** ✕ icon; notes stay, untagged
- **OUTCOME:** Reading deleted; notes remain (shown under "General notes")
- **Source:** ReadingsEditor.svelte:55 (onchange filter)

#### 4.5 Create Narrative Section (Beat)
- **NAME:** "Add a beat" / "Section"
- **ACTION:** In narrative spine rail (right side of editor), click "Add a beat" → new section card appears
- **AFFORDANCE:** Card with prose textarea + "Frame" button + object label
- **OUTCOME:** Empty section appended to spine; ready for prose writing
- **Source:** NarrativeEditor.svelte:85 (update function adds section); App.svelte:addSection

#### 4.6 Author Section Prose
- **NAME:** "Section prose"
- **ACTION:** In narrative section card, type prose (markdown allowed); autosaves
- **AFFORDANCE:** Prose textarea in the card
- **OUTCOME:** Section prose persists; on publish, visitor sees this text sequentially
- **Source:** NarrativeEditor.svelte:85 (update patches prose field)

#### 4.7 Frame Section Camera
- **NAME:** "Frame this beat"
- **ACTION:** Click "Frame" button in section card → canvas arms for drawing; draw region or mark time → captures frame
- **AFFORDANCE:** Button "⊡ Frame"; shows status "area set" or "0:12–0:42"
- **OUTCOME:** `start` field set to spatial (`xywh=`) or temporal (`t=`) fragment
- **Source:** NarrativeEditor.svelte:47 (onframe); App.svelte:frameSectionCamera

#### 4.8 Navigate Via Section
- **NAME:** "Go to [object]" navigation
- **ACTION:** Click section card's "Go to [object]" link → rail jumps to that object; canvas focuses framed region
- **AFFORDANCE:** Link text "Go to [Object name]"
- **OUTCOME:** User jumps to section's target object and frame
- **Source:** NarrativeEditor.svelte:50-51 (onnavigate); App.svelte:navigateToSection

#### 4.9 Cite Note in Section Prose
- **NAME:** "Cite from prose"
- **ACTION:** While editing section prose, click "¶ Cite" button (same as notes) → ⌘K modal or visual picker → inserts link
- **AFFORDANCE:** Button in section textarea header
- **OUTCOME:** Prose includes markdown link to note/exhibit
- **Source:** NarrativeEditor.svelte:55 (onrequestcite); App.svelte:citeIntoComment (shared palette)

#### 4.10 Reorder Sections
- **NAME:** "Reorder beats"
- **ACTION:** In narrative spine, drag section card up/down OR use ↑↓ buttons
- **AFFORDANCE:** Drag handle; arrow buttons
- **OUTCOME:** Spine order changes; visitor experience reordered
- **Source:** NarrativeEditor.svelte:87-93 (move/remove functions)

#### 4.11 Delete Section
- **NAME:** "Remove beat"
- **ACTION:** Click ✕ on section card
- **AFFORDANCE:** ✕ icon
- **OUTCOME:** Section removed; if last section, narrative "cleared" (cue appears briefly)
- **Source:** NarrativeEditor.svelte:86 (remove function)

#### 4.12 View Narrative Effect
- **NAME:** "How narrative changes the front door"
- **ACTION:** Overview → narrative spine non-empty → first-time cue: "Your visitors will see a guided sequence…"
- **AFFORDANCE:** One-time message (per slug); keystone gate
- **OUTCOME:** Author understands spine flips the layout from grid to narrative
- **Source:** App.svelte:65-67 (FIRST_ADD_KEY / firstAddSeen; keystone cue)

---

### Stage 5: Bulk Import (CSV, WADM)

#### 5.1 Download CSV Template
- **NAME:** "CSV bulk-import template"
- **ACTION:** In an exhibit, click menu → "Import annotations" → "Download template"
- **AFFORDANCE:** Link in context menu or add-object panel
- **OUTCOME:** .csv file with header + example rows (object, x, y, w, h, comment, tags, reading)
- **Source:** csv-import.ts:54-70 (buildCsvTemplate function)

#### 5.2 Fill CSV Spreadsheet
- **NAME:** "Bulk-import spreadsheet"
- **ACTION:** Author opens template in Excel/Sheets; fills rows: object name/id, coordinates (optional), comment, tags, reading
- **AFFORDANCE:** Standard CSV format with fixed columns
- **OUTCOME:** Completed spreadsheet saved as .csv
- **Source:** csv-import.ts:6-21 (dialect spec in comments)

#### 5.3 Import CSV to Exhibit
- **NAME:** "Import annotations"
- **ACTION:** In object editor, "… more" menu → "Import annotations" → select .csv file
- **AFFORDANCE:** Menu option "Import notes from CSV"
- **OUTCOME:** Rows parsed; coordinate-full rows added to annotation log; coordinate-free rows staged in "pending notes" drawer
- **Source:** ingest-flows.ts (importNotesCsv); csv-import.ts:planCsvImport

#### 5.4 Set Area for Pending Notes
- **NAME:** "Set area" / coordinate-free note placement
- **ACTION:** Pending notes drawer shows text-only rows; for each, user draws region on canvas (same gesture as manual notes)
- **AFFORDANCE:** Drawer listing pending notes with draw button per row
- **OUTCOME:** Note geometry captured; note moved from pending to annotation log
- **Source:** ingest-flows.ts (pendingNotesDrawer); App.svelte (Set area button)

#### 5.5 Import WADM Transcript
- **NAME:** "Import WADM transcript"
- **ACTION:** Select .wadm.txt file (FromThePage/Transkribus export) → parsed as bulk notes
- **AFFORDANCE:** File picker in import dialog
- **OUTCOME:** Transcript rows imported as notes
- **Source:** wadm-import.ts (planWadmImport)

---

### Stage 6: Publish (GitHub Pages)

**Screen:** `PublishDialog.svelte`, `Publish.svelte`, `PublishProgress.svelte`
**Route:** Triggered via menu → "Publish" button.

#### 6.1 Open Publish Dialog
- **NAME:** "Publish to GitHub"
- **ACTION:** Library view → menu → "Publish to GitHub Pages" OR editor → "Publish" button
- **AFFORDANCE:** Button in toolbar; menu item
- **OUTCOME:** PublishDialog opens (GitHub authentication form)
- **Source:** App.svelte:195+ (ensurePub lazy-load); PublishDialog.svelte

#### 6.2 Enter GitHub Credentials
- **NAME:** "Connect to GitHub"
- **ACTION:** Form fields: owner, repo, branch, token (Personal Access Token, pasted fresh each publish)
- **AFFORDANCE:** Text inputs; explanatory help text; "⚠ Token never stored" note
- **OUTCOME:** Fields validated (owner/repo bare names, not URLs)
- **Source:** Publish.svelte:27-30 (fields); nameError validation

#### 6.3 Opt-In Preserve Originals
- **NAME:** "Include original files"
- **ACTION:** Checkbox "Ship source originals for citation"
- **AFFORDANCE:** Checkbox; explains CONTEXT §89.1 (preservation rationale)
- **OUTCOME:** If checked, original images included in publish; larger archive but enables citation to source
- **Source:** Publish.svelte:22 (includeOriginals state)

#### 6.4 Publish (Long-Running)
- **NAME:** "Publish"
- **ACTION:** Click "Publish" button → progress indicator shows phases:
  - "Preparing the library…"
  - "Uploading media — N of M…" (per-asset upload)
  - "Creating the commit…"
  - "Turning on GitHub Pages…"
- **AFFORDANCE:** Progress bar; phase text
- **OUTCOME:** Full library pushed to GitHub; commit URL returned
- **Source:** Publish.svelte:54-71 (publish flow); @render/core publishToGitHub

#### 6.5 View Publish Result
- **NAME:** "Publish success"
- **ACTION:** After publish, dialog shows:
  - Commit URL (link to GitHub)
  - Pages URL (link to live site)
  - If Pages not yet enabled: instructions to enable in repo settings
- **AFFORDANCE:** Links; instructions as fallback
- **OUTCOME:** User can visit live site or re-edit locally
- **Source:** Publish.svelte:90-100 (done phase)

#### 6.6 Handle Broken Links
- **NAME:** "Broken link report"
- **ACTION:** Publish warns of intra-library links that won't resolve (exhibit not in library)
- **AFFORDANCE:** Warning section in dialog before publish
- **OUTCOME:** Links degrade to plain text on live site
- **Source:** Publish.svelte (brokenLinks prop)

---

### Stage 7: Project Lifecycle & Persistence

#### 7.1 Exhibit Auto-Save
- **NAME:** "Autosave"
- **ACTION:** Every change (note creation, prose edit, etc.) triggers autosave after debounce
- **AFFORDANCE:** Unsaved dot indicator (if unbound project)
- **OUTCOME:** Changes persisted to OPFS (browser storage) or bound folder
- **Source:** App.svelte:save-queue.svelte.js (enqueueSave); binding-store.svelte.js (autosaveToFolder)

#### 7.2 Undo/Redo
- **NAME:** "Undo" / "Redo"
- **ACTION:** Not yet implemented; sketch mentions "future work"
- **AFFORDANCE:** Would be ⌘Z / ⌘⇧Z
- **OUTCOME:** Revert recent changes
- **Source:** App.svelte (comment: "undo/redo pending")

#### 7.3 Merge DAG (Collaboration)
- **NAME:** "Collaboration / merge log"
- **ACTION:** Editor identity (display name) captured on first import; last-editor stamped on every action
- **AFFORDANCE:** Identity prompt on first import (IdentityPrompt.svelte)
- **OUTCOME:** Merge DAG tracks authorship; future collaboration-aware merge
- **Source:** App.svelte:52-68 (identity lifecycle); exhibit-session.svelte.js (collab tracking)

#### 7.4 Recover Lost Binding
- **NAME:** "Binding recovery"
- **ACTION:** If a bound folder/file is lost, error shown; user can "Recover" (detach + save as fresh project)
- **AFFORDANCE:** Error banner + button
- **OUTCOME:** Data preserved; user can re-bind elsewhere
- **Source:** LibraryHome.svelte (bindingError handling); binding-store.svelte.js

#### 7.5 Export Project as .zip
- **NAME:** "Save as .archie.zip"
- **ACTION:** "Save" button → choose location → creates .archie.zip file
- **AFFORDANCE:** File picker interface
- **OUTCOME:** Complete library + annotations exported; portable across machines
- **Source:** binding-store.svelte.js (saveProjectToFile)

#### 7.6 Open Recent Project
- **NAME:** "Recents"
- **ACTION:** Library home shows recent projects (non-Chromium mitigation); click to reopen
- **AFFORDANCE:** "Recent projects" section with timestamps (e.g., "3 min ago")
- **OUTCOME:** Session context restored; user back to last exhibit
- **Source:** LibraryHome.svelte:107-113 (ago function); recents prop

---

### Stage 8: Keyboard Shortcuts & Accessibility

#### 8.1 Keyboard Navigation
- **NAME:** "Shortcuts"
- **ACTION:** `?` key or menu → ShortcutsHelp.svelte displays all shortcuts
- **AFFORDANCE:** Help dialog; modal table of keys + actions
- **OUTCOME:** User learns keyboard affordances
- **Source:** ShortcutsHelp.svelte; shortcuts.js (key bindings)

**Key bindings:**
- `⌘S` — Save project
- `⌘K` — Open cite palette (from note comment field)
- `?` — Show shortcuts help
- `Esc` — Close dialogs
- `←` `→` — Step between AV notes (video/audio editor)

#### 8.2 Mark In/Out (Audio)
- **NAME:** "Mark in" / "Mark out"
- **ACTION:** While playing audio, press `I` to mark start; `O` to mark end
- **AFFORDANCE:** Keyboard shortcut buttons on waveform
- **OUTCOME:** Time range captured; "Add note" button enabled
- **Source:** AvEditor.svelte (mark in/out logic)

---

## Affordances Not Yet Implemented

- **Undo/Redo:** Architecture prepared (ADR mentions); UI deferred
- **Visual Search (reverse image lookup):** Sketch; requires external API
- **Collaborative Real-Time Sync:** Merge DAG prepared; sync deferred
- **Accessibility Audit Trail:** WCAG compliance not yet verified

---

## Summary Table

| Feature | UI Element | Action | Source File |
|---------|-----------|--------|-------------|
| Create exhibit | Text input + button | Type title → Create | LibraryHome.svelte:97–102 |
| Import folder | Link in tile | Click → choose folder | LibraryHome.svelte:48–49 |
| Open exhibit | Clickable plate | Click plate | ExhibitOverview.svelte:43–44 |
| Draw annotation | Toolbar button | Select tool → drag | Canvas.svelte + Annotorious |
| Edit note | WADM form | Popover on mark click | NoteEditor.svelte:59–90 |
| Cite note | ⌘K button | Click → search → insert | CmdK.svelte + App.svelte |
| Create reading | Input + button | Type name → Add | ReadingsEditor.svelte:32–39 |
| Add section | Button in spine | Click "Add a beat" | NarrativeEditor.svelte:85 |
| Frame section | Frame button | Click → draw region | NarrativeEditor.svelte:47 |
| Import CSV | Menu option | Select .csv → parse | csv-import.ts + ingest-flows.ts |
| Publish | Menu → button | Enter GitHub → publish | Publish.svelte:54–71 |

---

## Key Discoveries

1. **Narrative Spine as Center:** The exhibit-level "section" (beat) is NOT authored at the overview scale; it lives in the editor sidebar (right rail of Editor view). This is a deliberate architectural choice (2026-05-25 placement correction) so the camera frame is always shown on the object's canvas while being authored.

2. **Overview-as-Canvas (Invention #1):** Objects are spatially arranged as plates on a dark light-table, pan-able and zoom-able, NOT a list. Contrast with List fallback (1b) is intentional.

3. **CSV Bulk-Import with Pending Notes (Sub-Cycle B):** Rows with text but no region coordinates are staged in a "pending notes" drawer; author places them by drawing on canvas (Set area). Preserves log-boundary invariant.

4. **Wide Contributor Onramps:** Three zero-annotation-UI paths (folder import, IIIF manifest, CSV) to serve non-annotation-tool users (spreadsheet authors, IIIF aggregators, folder organizers).

5. **Two Cite Modes:** ⌘K (text-search, keyboard-first) and visual picker (image tiles, eyes-first). Both insert same markdown link format.

6. **Namespace Clarity:** "Exhibit" is authored whole; "Playground" (template) vs "Project" (saved). Affects persistence & UI signaling.

7. **Geo Annotation Support:** Geo-note selector math lives in geo-notes.ts; annotation UI baked into tools (AddMapModal for explicit map add).

8. **AV Temporal + Spatial (Video):** Video notes can be `t=` only (timeline marker) or `t=…&xywh=percent:` (spatiotemporal, frame region + time span).

9. **Drawing Tool Persistence:** OpenSeadragon + Annotorious handle image annotation; WaveSurfer handles audio; HTML5 video + overlay canvas handle video.

10. **Identity Stamping:** displayName localStorage persists; every session action stamped with asClientId for merge DAG tracking.

