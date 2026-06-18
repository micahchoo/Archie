# Copy audit — bucket: studio-core

Files audited (relative to repo root):
- apps/studio/src/App.svelte
- apps/studio/src/LibraryHome.svelte
- apps/studio/src/ExhibitOverview.svelte
- apps/studio/src/NarrativeEditor.svelte
- apps/studio/src/DetailsEditor.svelte
- apps/studio/src/PropsDrawer.svelte
- apps/studio/src/LayoutPicker.svelte
- apps/studio/src/RightsEditor.svelte

Conventions: sentence case for labels/buttons; copy hardcoded in components (no i18n). Curly quotes/apostrophes are the dominant convention in this bucket; straight-quote strings are flagged as inconsistencies.

## Fixes

| File | Line | Current | Issue | Proposed | Severity | Category |
|------|------|---------|-------|----------|----------|----------|
| apps/studio/src/App.svelte | 561 | `Couldn't fetch that URL (HTTP ${resp.status}).` | Leaks raw `HTTP` + status code (internal/network vocab) and blames the URL without a next step. | `Couldn't open that link — the server returned an error. Check the address and try again.` | high | internal-vocab |
| apps/studio/src/App.svelte | 564 | `Couldn't fetch that URL — check it's reachable (most IIIF servers allow cross-origin reads).` | "fetch", "cross-origin reads" are dev terms; em-dash + parenthetical aside in an alert. | `Couldn't open that link. Check the address is correct and reachable.` | medium | internal-vocab |
| apps/studio/src/App.svelte | 571 | `Couldn't read that manifest: ${String(e)}` | "manifest" is IIIF/schema vocab; `String(e)` dumps a raw error object to the user. | `Couldn't read that IIIF link — it doesn't look like a valid manifest.` (keep "IIIF manifest" pending terminology) | high | error-quality |
| apps/studio/src/App.svelte | 199 | `Paste a IIIF manifest URL (Presentation 2 or 3):` | "manifest", "Presentation 2 or 3" is raw IIIF spec vocab in a prompt visitors see. | `Paste a IIIF manifest link` (drop the spec-version aside; or move it to a tooltip) — terminology call on "IIIF manifest". | medium | terminology |
| apps/studio/src/App.svelte | 1316 | `Manifest import failed: ${String(e)}` | "Manifest" leaks IIIF; "import" violates the team rule against "import" in UI; raw error dump. | `Couldn't add an exhibit from that IIIF link.` (terminology: "import"/"manifest"). | high | internal-vocab |
| apps/studio/src/App.svelte | 1565 | `… or import W3C annotations (JSON)` | "W3C annotations" + "JSON" are schema/format vocab; team says avoid "Annotation"; "import" disallowed. | `… or add notes from a file` (terminology: import + Annotation + WADM). | high | internal-vocab |
| apps/studio/src/App.svelte | 1565 | title: `A W3C AnnotationPage (or Annotation array) — targets matching this exhibit's /canvas/<id> land on their objects.` | Leaks `AnnotationPage`, `Annotation array`, `/canvas/<id>` — heavy schema/IIIF jargon in a tooltip. | `Add notes exported from Archie or another annotation tool. Notes attach to the matching object in this exhibit.` | high | internal-vocab |
| apps/studio/src/App.svelte | 1567 | aria-label: `Import W3C annotations from a JSON file` | "W3C annotations"/"JSON" in an aria-label users hear. | `Add notes from a file` (terminology: import/Annotation). | medium | internal-vocab |
| apps/studio/src/App.svelte | 1567 | `Annotation import failed: ${String(e)}` | "Annotation" (avoid in UI) + "import" + raw error dump. | `Couldn't add those notes.` (terminology). | high | internal-vocab |
| apps/studio/src/App.svelte | 645 | `Imported ${imported} annotation${imported === 1 ? "" : "s"}.` | "annotation" — team says avoid "Annotation" in UI (use Note); "Imported" leaks the disallowed "import" verb. | `Added ${imported} note${...}.` (terminology). | medium | terminology |
| apps/studio/src/App.svelte | 648 | `Skipped ${plan.skipped.length}: ... #${s.index} — ${s.reason}` | Per-skip reasons are raw planner output; em-dash; `#index` is dev-ish. May surface untranslated reason strings. | `Skipped ${n}: ${human reasons}` — verify each `s.reason` is user-facing prose, not a code token. | medium | error-quality |
| apps/studio/src/App.svelte | 630 | `"${file.name}" isn't valid JSON.` | "JSON" leaks the format name + straight quotes (rest of file uses curly). | `Couldn't read "${file.name}" — it isn't a valid annotations file.` (terminology on file type wording). | medium | internal-vocab |
| apps/studio/src/App.svelte | 521 | `Created the exhibit, but this browser can't persist imported files (private window, or storage unavailable) — import stopped.` | "persist", "storage unavailable" are dev terms; long parenthetical; em-dash; "import" disallowed. | `Made the exhibit, but this browser can't save files — you may be in a private window. Adding files stopped.` | medium | internal-vocab |
| apps/studio/src/App.svelte | 541 | `Imported ${imported} file${...} into ${groups.length} exhibit${...}.${failed > 0 ? ` ${failed} couldn't be imported.` : ""}` | "Imported"/"imported" disallowed verb; otherwise clear. | `Added ${n} file${...} to ${m} exhibit${...}.${failed>0 ? ` ${failed} couldn't be added.` : ""}` (terminology). | low | terminology |
| apps/studio/src/App.svelte | 512 | `No images, audio, or video found in that folder.` | Clear and correct. No fix — listed for completeness. | (none) | low | other |
| apps/studio/src/App.svelte | 618 | `Imported ${imported} note${...} from CSV.` | "Imported" disallowed; "CSV" is acceptable (it's the file format the user chose) but verify. | `Added ${n} note${...} from your CSV.` (terminology on import). | low | terminology |
| apps/studio/src/App.svelte | 621 | `${head}${dupNote} Skipped ${plan.skipped.length}: ... line ${s.row} — ${s.reason}` | Raw skip reasons + em-dash; ensure `s.reason` reads as prose. | Verify `s.reason` strings are user-facing; keep "line N: reason" with colon not em-dash. | low | error-quality |
| apps/studio/src/App.svelte | 619 | `${dup} already imported.` | "imported" disallowed verb. | `${dup} already added.` | low | terminology |
| apps/studio/src/App.svelte | 660 | `Couldn't read that file as an .archie.zip.` | ".archie.zip" is the real file extension (acceptable), but blames format obliquely; OK. Minor: could name the next step. | `Couldn't open that file — choose a published .archie.zip.` | low | error-quality |
| apps/studio/src/App.svelte | 663 | `That archive has no exhibits.` | "archive" — the team term is "library"; mild internal-vocab. | `That file has no exhibits to open.` (terminology: archive vs library). | low | terminology |
| apps/studio/src/App.svelte | 664 | `Open this archive as your project? Your current project will be replaced.` | "archive" + "project"; the team model says a .archie.zip "opens a Library", and "project" is a persistence-model word, not the noun. | `Open this library? Your current library will be replaced.` (terminology: archive/project vs library). | medium | terminology |
| apps/studio/src/App.svelte | 779 | `Imported "${file.name}" (${MB} MB). For very large recordings, pasting a source URL keeps your library light — the archive links it instead of bundling the bytes.` | "Imported" disallowed; "the archive links it instead of bundling the bytes" leaks implementation; em-dash. | `Added "${file.name}" (${MB} MB). For very large recordings, paste a link instead — it keeps your library small.` (terminology: import/archive). | medium | internal-vocab |
| apps/studio/src/App.svelte | 784 | `Archie can't read "${file.name}" — add an image, audio, or video file.` | Good shape (says what + next step). Minor: em-dash in short string. | `Archie can't read "${file.name}". Add an image, audio, or video file.` | low | punctuation |
| apps/studio/src/App.svelte | 1315 | `Folder import failed: ${String(e)}` | "import" disallowed; raw error dump. | `Couldn't add that folder.` (terminology). | medium | error-quality |
| apps/studio/src/App.svelte | 1459 | `Edit note` (WADM form `<h3>`) | Fine as a heading. No fix. | (none) | low | other |
| apps/studio/src/App.svelte | 1466 | `Time (m:ss)` legend | Clear. No fix. | (none) | low | other |
| apps/studio/src/App.svelte | 1471 | `Tags (comma-separated)` | Clear; matches Tag glossary. No fix. | (none) | low | other |
| apps/studio/src/App.svelte | 1474 | `— None (base) —` | "base" leaks the internal base/base-only vocab; em-dashes as decoration around the option. | `None` (or `No reading`). | medium | internal-vocab |
| apps/studio/src/App.svelte | 1480-1482 | `Muted — recede` / `Normal` / `Strong — stand out` | Em-dash inside a `<select>` option; otherwise meaning is clear. | `Muted (recede)` / `Normal` / `Strong (stand out)` — or drop the gloss. | low | punctuation |
| apps/studio/src/App.svelte | 1486 | `Save` (note popover button) | Vague-ish but standard for a form; acceptable. No fix. | (none) | low | other |
| apps/studio/src/App.svelte | 1487 | `Delete note` | Clear, specific. No fix. | (none) | low | other |
| apps/studio/src/App.svelte | 1461 | `▦ Browse` (cite-by-image button) | "Browse" is a vague CTA; the title says "Cite a note by its image". | `▦ By image` or `Find by image`. | low | vague-cta |
| apps/studio/src/App.svelte | 1369 | `▦ {currentLayout}` (layout trigger) | Renders the raw layout id (single/grid/narrative) lowercased — terse, but the ExhibitOverview chip uses "Exhibit layout · Grid". Inconsistent surfacing of the same control. | `▦ Layout · {LAYOUT_NAME[currentLayout]}` to match the overview chip. | medium | inconsistency |
| apps/studio/src/App.svelte | 1375 | `Publish & Share…` | Uses Title Case ("Share") against the sentence-case convention; ampersand. | `Publish & share…` (sentence case). | low | punctuation |
| apps/studio/src/App.svelte | 1372 | `⚠ Save failed` / `● Unsaved` / `Saved` | Clear states. `⚠` warning glyph is fine. No fix. | (none) | low | other |
| apps/studio/src/App.svelte | 1387 | `This is a template — your changes here aren't saved. Keep a copy to make it your own.` | Good voice; em-dash in a banner (acceptable as prose). Minor only. | (consider: `This is a template, so your changes here aren't saved...`) | low | punctuation |
| apps/studio/src/App.svelte | 1395 | `No objects yet — add one below to start annotating.` | "annotating" leans on the Annotation verb the team avoids; otherwise good empty state. | `No objects yet — add one below to start adding notes.` (terminology). | low | terminology |
| apps/studio/src/App.svelte | 1410 | placeholder `Source URL or /path (image / audio / video)` | "/path" is dev-ish; otherwise serviceable. | `Link to an image, audio, or video` | low | internal-vocab |
| apps/studio/src/App.svelte | 1410 | title `Best for LARGE media: a URL links the file (the archive references it, never bundles the bytes) — keeps your .archie.zip small.` | "the archive references it, never bundles the bytes" leaks implementation; "LARGE" all-caps; em-dash. | `Best for large files: a link points to the file instead of copying it into your library — keeps your .archie.zip small.` | medium | internal-vocab |
| apps/studio/src/App.svelte | 1416-1417 | `+ Object` / `+ Map` | Terse but consistent with glossary (Object, Map). OK. | (none) | low | other |
| apps/studio/src/App.svelte | 1423 | `Importing "${importStatus.name}"…{...} ({index} of {total})` | "Importing" disallowed verb in a status. | `Adding "${name}"… ({i} of {n})` (terminology). | low | terminology |
| apps/studio/src/App.svelte | 1435 | `Use "Set in" on the recording to mark this section's moment.` | References a control label "Set in" — but the section camera button (NarrativeEditor:143) says "Set moment", and App:1604 AvEditor uses "Set in". Possible label mismatch the user can't reconcile. | Make the referenced label match the actual AV control exactly (verify AvEditor's button text). | medium | inconsistency |
| apps/studio/src/App.svelte | 1443 | `Draw the {box/outline} on the {map/image} — it becomes your note's place, anchored to its longitude/latitude. Drag pans again once you've drawn.` | Clear and on-voice. Em-dash in prose is fine. No fix. | (none) | low | other |
| apps/studio/src/App.svelte | 1527 | `Draw the {box/outline} on the {map/image}` | Clear. No fix. | (none) | low | other |
| apps/studio/src/App.svelte | 1540 | `No notes on this recording yet. Play it, then "Set in" → "Add note" to mark a moment.` | "Set in" / "Add note" referenced labels — verify they match AvEditor's actual buttons (cross-component label drift risk). | Confirm referenced labels match AvEditor verbatim. | medium | inconsistency |
| apps/studio/src/App.svelte | 1540 | `Notes here are hidden — show their readings in the rail on the canvas.` | "the rail on the canvas" / "the canvas" — "canvas" is on the internal-leak watchlist; "rail" is internal layout vocab not in the glossary. | `Notes here are hidden — turn their readings on in the panel beside the image.` (terminology: canvas/rail). | medium | internal-vocab |
| apps/studio/src/App.svelte | 1540 | `No notes on this object yet. Start a note above — choose Box or Outline, then draw the region.` | Good empty state with next step. No fix. | (none) | low | other |
| apps/studio/src/App.svelte | 1547 | `(untitled)` | Clear placeholder for an empty note. OK. | (none) | low | other |
| apps/studio/src/App.svelte | 1549 | title `Longitude / latitude — the region's centre on the basemap` | "basemap" is map/internal vocab (glossary: Map / Map extent). | `Longitude and latitude — the centre of this region on the map.` (terminology: basemap). | low | terminology |
| apps/studio/src/App.svelte | 1560 | `… or import notes from a CSV` | "import" disallowed verb. | `… or add notes from a CSV` (terminology). | low | terminology |
| apps/studio/src/App.svelte | 1560 | title `Columns: object, x, y, w, h, comment — optional tags, reading. Header row required; object may be an id, a label, or blank for this object.` | `x, y, w, h`, "id", "Header row" are technical but this is a CSV-format help tooltip for spreadsheet authors — borderline acceptable. Em-dash + semicolon. | Keep columns; soften: `Columns: object, x, y, w, h, comment (tags and reading optional). First row must be headers. Object can be a name, an id, or left blank for this object.` | low | internal-vocab |
| apps/studio/src/App.svelte | 1561 | aria-label `Import notes from a CSV file` | "Import" disallowed verb. | `Add notes from a CSV file` (terminology). | low | terminology |
| apps/studio/src/App.svelte | 1568 | hint (AV) `Play it · "Set in" → "Add note" marks a moment (video: "+ Region on frame" adds a box) · click a note to seek + edit it in the popover.` | "the popover" leaks UI-component vocab; references several control labels (verify they match AvEditor); dense. | `Play it · "Set in" → "Add note" marks a moment (video: "+ Region on frame" adds a box) · click a note to jump to it and edit.` (drop "popover"; verify labels). | medium | internal-vocab |
| apps/studio/src/App.svelte | 1568 | hint (image) `Start a new note → choose a shape → draw the region · click a marker to edit it right there · its editor follows it as you pan/zoom.` | Clear and on-voice. No fix. | (none) | low | other |
| apps/studio/src/App.svelte | 1577 | summary `Details & rights` | Clear. No fix. | (none) | low | other |
| apps/studio/src/App.svelte | 1604 | AvEditor `label`/etc — passes through; not literal copy here. | n/a | (none) | low | other |
| apps/studio/src/App.svelte | 1614 | `{currentTileSource.attribution}` (e.g. "© OpenStreetMap contributors") | Required attribution string — correct to show verbatim. No fix. | (none) | low | other |
| apps/studio/src/App.svelte | 1617 | `Loading…` | Standard. No fix. | (none) | low | other |
| apps/studio/src/App.svelte | 1619 | `Add an object — drop an image here, or use "+ Object" on the rail.` | "the rail" leaks layout vocab; otherwise a good empty state. | `Add an object — drop an image here, or use "+ Object" above.` (terminology: rail). | low | internal-vocab |
| apps/studio/src/App.svelte | 1657 | MediaPicker title `Cite a note by its image` | Clear. No fix. | (none) | low | other |
| apps/studio/src/App.svelte | 1305 | aria-label `Dismiss` (collab note ✕) | Fine. No fix. | (none) | low | other |
| apps/studio/src/App.svelte | 1309 | `Archie` / `Studio` wordmark | Brand. No fix. | (none) | low | other |
| apps/studio/src/App.svelte | 1360 | `← Overview` / `← Exhibits` back button | Clear; matches glossary. No fix. | (none) | low | other |
| apps/studio/src/App.svelte | 1521 | `{notes.length} notes` | Not pluralized (always "notes" even for 1) — sibling code at 206/257 pluralizes "note/notes". Inconsistent. | `{notes.length} {notes.length === 1 ? "note" : "notes"}` | low | inconsistency |
| apps/studio/src/LibraryHome.svelte | 108 | `ⓘ Details` (+ unsaved dot) | Fine. No fix. | (none) | low | other |
| apps/studio/src/LibraryHome.svelte | 108 | title `Title, description, credit & license for the whole library` | Clear; ampersand acceptable in a tooltip. Minor. | (none) | low | other |
| apps/studio/src/LibraryHome.svelte | 110 | `Exhibits marked Example are templates — open one to explore (nothing's saved), keep a copy to make it yours. Your own exhibits save as you work. Start a new one any time.` | Good lede prose; em-dash + parenthetical OK in body copy. No fix. | (none) | low | other |
| apps/studio/src/LibraryHome.svelte | 120 | `This library lives only in this browser.` | Clear. No fix. | (none) | low | other |
| apps/studio/src/LibraryHome.svelte | 121 | `Save it to disk to keep it safe — and to open it on another machine.` | Clear, on-voice. No fix. | (none) | low | other |
| apps/studio/src/LibraryHome.svelte | 124 | `Folder` / `File` (binding kind chip) | Clear. No fix. | (none) | low | other |
| apps/studio/src/LibraryHome.svelte | 126 | `● unsaved` (+ title `Unsaved changes`) | Clear. No fix. | (none) | low | other |
| apps/studio/src/LibraryHome.svelte | 129-130 | `Saving to this folder automatically as you work.` / `Unsaved changes — Save (⌘S) to update the file.` / `Saved as a file on your computer.` | Clear. No fix. | (none) | low | other |
| apps/studio/src/LibraryHome.svelte | 135 | `⚠ {saveStatus.error}` | Surfaces `saveStatus.error` verbatim — risk it contains dev/store error text (e.g. OPFS/quota). Out of this file but flag to verify the source string is user-facing. | Verify save-queue error strings are plain-language. | medium | error-quality |
| apps/studio/src/LibraryHome.svelte | 140 | `Save to disk` / `Save` | Clear, specific. No fix. | (none) | low | other |
| apps/studio/src/LibraryHome.svelte | 142 | `Open a library…` | Clear; matches "opens a Library" rule (not "import"). Good. No fix. | (none) | low | other |
| apps/studio/src/LibraryHome.svelte | 145 | `Close` (+ title `Detach from disk — your work stays in this browser`) | Clear. No fix. | (none) | low | other |
| apps/studio/src/LibraryHome.svelte | 154-155 | `Open…` / `Save as a new project` | "project" appears here but the surrounding UI calls the thing a "library"; "Open a library…" elsewhere. Concept named two ways on the same screen. | `Open…` / `Save as a new library` (terminology: project vs library). | medium | inconsistency |
| apps/studio/src/LibraryHome.svelte | 156 | aria-label `Dismiss` | Fine. No fix. | (none) | low | other |
| apps/studio/src/LibraryHome.svelte | 163 | `Recent libraries` | Clear; matches library noun. No fix. | (none) | low | other |
| apps/studio/src/LibraryHome.svelte | 169 | `{r.kind} · {ago} · re-pick to open` | `r.kind` is "folder"/"file" lowercase — fine. "re-pick to open" is slightly jargony but clear enough. Minor. | `{r.kind} · {ago} · pick again to open` | low | other |
| apps/studio/src/LibraryHome.svelte | 171 | aria-label `Forget {r.name}` / title `Remove from recents` | Clear. No fix. | (none) | low | other |
| apps/studio/src/LibraryHome.svelte | 105 | `Library · {n} {exhibit/exhibits}` | Clear; matches glossary. No fix. | (none) | low | other |
| apps/studio/src/LibraryHome.svelte | 107 | `Library` (h1 fallback) | Clear. No fix. | (none) | low | other |
| apps/studio/src/LibraryHome.svelte | 112 | drawer title `Library details` | Clear. No fix. | (none) | low | other |
| apps/studio/src/LibraryHome.svelte | 183 | `Example` (badge) | Clear; matches the lede. No fix. | (none) | low | other |
| apps/studio/src/LibraryHome.svelte | 185 | `{n} {object/objects} · /{ex.slug}` | Shows the raw `/{slug}` (e.g. `/voynich`) — "slug" is internal vocab; the path string is dev-facing. | Show the slug only if it adds value; otherwise drop it, or label it (`at /voynich`). Terminology: slug. | medium | internal-vocab |
| apps/studio/src/LibraryHome.svelte | 192 | placeholder `New exhibit title…` / aria-label `New exhibit title` | Clear; matches glossary. No fix. | (none) | low | other |
| apps/studio/src/LibraryHome.svelte | 193 | `Create` | Slightly generic but paired with the titled "New exhibit" form; acceptable. Could be `Create exhibit`. | `Create exhibit` (optional, clearer). | low | vague-cta |
| apps/studio/src/LibraryHome.svelte | 196 | `… or import an image folder` | "import" disallowed verb in UI. | `… or add an image folder` (terminology: import). | medium | terminology |
| apps/studio/src/LibraryHome.svelte | 199 | `… or paste a IIIF manifest URL` | "manifest"/"IIIF manifest" raw spec vocab as a button label. | `… or paste a IIIF link` (terminology: IIIF manifest). | medium | terminology |
| apps/studio/src/LibraryHome.svelte | 205 | aria-label `Import a folder of images as a new exhibit` | "Import" disallowed verb. | `Add a folder of images as a new exhibit` (terminology). | low | terminology |
| apps/studio/src/ExhibitOverview.svelte | 152 | `← Exhibits` | Clear; matches glossary. No fix. | (none) | low | other |
| apps/studio/src/ExhibitOverview.svelte | 154 | `Exhibit · {n} {object/objects} · reading order` | Clear; matches glossary. No fix. | (none) | low | other |
| apps/studio/src/ExhibitOverview.svelte | 159 | `▦ Exhibit layout · {LAYOUT_NAME}` (+ title `How visitors read this exhibit (reading intent)`) | Clear; "reading intent" is borderline jargon but glossed. OK. Note label format differs from App.svelte:1369. | (see App:1369 inconsistency fix). | low | other |
| apps/studio/src/ExhibitOverview.svelte | 160 | `ⓘ Details` (+ title) | Clear. No fix. | (none) | low | other |
| apps/studio/src/ExhibitOverview.svelte | 161 | aria-label `Overview mode` | Clear. No fix. | (none) | low | other |
| apps/studio/src/ExhibitOverview.svelte | 162-163 | `Canvas` / `List` (+ titles `Spatial canvas (pan + zoom)` / `Plain list`) | "Canvas" is a user-facing toggle label here AND an internal-leak watchword. As a view-mode name ("spatial canvas") it's arguably a real product concept — terminology call. | Confirm "Canvas" is the intended user-facing name for the spatial view (vs leaking the IIIF Canvas concept). Terminology. | medium | terminology |
| apps/studio/src/ExhibitOverview.svelte | 167 | drawer title `Exhibit details` | Clear. No fix. | (none) | low | other |
| apps/studio/src/ExhibitOverview.svelte | 181 | aria-label `Exhibit canvas — drag to pan, scroll to zoom` | Same "canvas" question as above; otherwise good. | (terminology: canvas). | low | terminology |
| apps/studio/src/ExhibitOverview.svelte | 206/257 | `{n} {note/notes}` | Correctly pluralized — note App:1521 does NOT (inconsistency lives there). No fix here. | (none) | low | other |
| apps/studio/src/ExhibitOverview.svelte | 216 | `Move to end` / `Add object` | Clear; matches glossary. No fix. | (none) | low | other |
| apps/studio/src/ExhibitOverview.svelte | 224 | `Drag a plate to set reading order` | "plate" is the curator-metaphor word (also used for the Object cards). Not in the glossary; could confuse vs "object". | Verify "plate" is intentional product language, else `Drag an object to set the reading order`. Terminology. | medium | terminology |
| apps/studio/src/ExhibitOverview.svelte | 226 | `Drag the canvas to pan` | "canvas" again — gesture legend. | (terminology: canvas). | low | terminology |
| apps/studio/src/ExhibitOverview.svelte | 228 | `Scroll to zoom` | Clear. No fix. | (none) | low | other |
| apps/studio/src/ExhibitOverview.svelte | 231-234 | aria `Zoom out`/`Zoom in`, `Fit` (+ title `Reset to 100%`) | Clear. No fix. | (none) | low | other |
| apps/studio/src/ExhibitOverview.svelte | 236 | `Click a plate to annotate it up close` | "plate" terminology (see 224) + "annotate" leans on the avoided verb. | `Click an object to add notes up close.` (terminology: plate/annotate). | medium | terminology |
| apps/studio/src/ExhibitOverview.svelte | 241 | `Drag a row by its ⠿ handle to set the reading order.` | Clear; "⠿ handle" is a visible glyph reference, acceptable. No fix. | (none) | low | other |
| apps/studio/src/ExhibitOverview.svelte | 252 | title `Drag to reorder` / aria-label `Reorder {o.label}` | Clear. No fix. | (none) | low | other |
| apps/studio/src/ExhibitOverview.svelte | 262 | `↧ Move to end` / `+ Add object` | Clear. No fix. | (none) | low | other |
| apps/studio/src/NarrativeEditor.svelte | 104 | `Exhibit narrative` (eyebrow) | Clear; matches glossary. No fix. | (none) | low | other |
| apps/studio/src/NarrativeEditor.svelte | 105 | `The reading spine — beats shown in order, each framed on one object. Spans the whole exhibit; it stays as you move along the rail.` | "the rail" leaks layout vocab; "reading spine"/"beats" are product metaphors (probably intended); semicolon + em-dash in a lede (body copy, tolerable). | `The reading spine — beats shown in order, each framed on one object. It spans the whole exhibit and stays as you move between objects.` (terminology: rail). | medium | internal-vocab |
| apps/studio/src/NarrativeEditor.svelte | 109 | `Add an object to the exhibit first — a section is framed on one.` | Clear empty-state with next step. No fix. | (none) | low | other |
| apps/studio/src/NarrativeEditor.svelte | 120-121 | aria `Move up`/`Move down` (+ titles) | Clear. No fix. | (none) | low | other |
| apps/studio/src/NarrativeEditor.svelte | 125 | placeholder/aria `Section title` | Clear; matches glossary. No fix. | (none) | low | other |
| apps/studio/src/NarrativeEditor.svelte | 128 | `On this object` / `On` · {label} | Terse "On" reads oddly as a standalone label; pairs with the object name. | `Shows` / `Shows {label}` or `On {label}` consistently. | low | redundant |
| apps/studio/src/NarrativeEditor.svelte | 129 | `Move here` (+ title `Re-bind this section to the object you're viewing (clears its camera)`) | "Re-bind" is dev/jargon in the tooltip; "camera" is product metaphor used elsewhere (OK). | title: `Attach this section to the object you're viewing (clears its framed view).` | low | internal-vocab |
| apps/studio/src/NarrativeEditor.svelte | 132 | `¶ Cite` (+ title `Cite a note or exhibit (⌘K)`) | Clear; "Cite" is intentional product verb. No fix. | (none) | low | other |
| apps/studio/src/NarrativeEditor.svelte | 133 | placeholder `Prose for this beat…` / aria `Section prose` | Clear. No fix. | (none) | low | other |
| apps/studio/src/NarrativeEditor.svelte | 139 | `Framing… {set the moment on the recording / draw a box on the canvas}` | "the canvas" leaks watchword; rest is clear. | `Framing… {set the moment on the recording / draw a box on the image}` (terminology: canvas). | low | internal-vocab |
| apps/studio/src/NarrativeEditor.svelte | 142 | `▭ {cam}` / `⏱ {cam}` / `No camera framed` / "framed region" / "moment" | "camera"/"framed region"/"framed view" is a consistent product metaphor for a section's view; acceptable if intentional. `cameraLabel` returns "framed region" (line 72) and "moment" (71). | Confirm "camera" metaphor is the intended user vocabulary across the app. Terminology. | low | terminology |
| apps/studio/src/NarrativeEditor.svelte | 143 | `Reframe` / `Set moment` / `Frame camera` | "Set moment" vs App's referenced "Set in" (App:1435,1540,1568) — possible cross-component label mismatch for the AV case. | Align the AV-camera button label with the AvEditor control the hint text names. | medium | inconsistency |
| apps/studio/src/NarrativeEditor.svelte | 147 | aria/title `Remove section` | Clear. No fix. | (none) | low | other |
| apps/studio/src/NarrativeEditor.svelte | 153 | `＋ Add to the narrative` | Clear, specific CTA. No fix. | (none) | low | other |
| apps/studio/src/NarrativeEditor.svelte | 155 | aria `Add a section from an existing note` | Clear. No fix. | (none) | low | other |
| apps/studio/src/NarrativeEditor.svelte | 157 | `＋ from a note…` | Clear. No fix. | (none) | low | other |
| apps/studio/src/NarrativeEditor.svelte | 78/83 | default title `Section ${n}` | Clear default. No fix. | (none) | low | other |
| apps/studio/src/DetailsEditor.svelte | 48 | placeholder `Name this {scope}` | {scope} is "object"/"exhibit"/"library" — all glossary nouns, reads naturally. No fix. | (none) | low | other |
| apps/studio/src/DetailsEditor.svelte | 47 | `Title` (field head) | Clear. No fix. | (none) | low | other |
| apps/studio/src/DetailsEditor.svelte | 52 | `Description` | Clear. No fix. | (none) | low | other |
| apps/studio/src/DetailsEditor.svelte | 53 | placeholder `A short description of this {scope}` | Clear. No fix. | (none) | low | other |
| apps/studio/src/DetailsEditor.svelte | 36 | `Remove from exhibit` / `Remove from library` | Clear, specific destructive labels. No fix. | (none) | low | other |
| apps/studio/src/DetailsEditor.svelte | 59 | `Confirm — this can't be undone` | Good guard copy; em-dash in a short button label. Minor. | `Confirm — this can't be undone` is acceptable as a warning; optionally `Click again to remove — can't be undone`. | low | punctuation |
| apps/studio/src/PropsDrawer.svelte | 13 | `{title}` (drawer h2 — passed in) | Pass-through; sources are "Library details"/"Exhibit details". No fix here. | (none) | low | other |
| apps/studio/src/PropsDrawer.svelte | 14 | aria-label `Close` | Clear. No fix. | (none) | low | other |
| apps/studio/src/LayoutPicker.svelte | 37 | aria-label `Choose how this exhibit is read` | Clear. No fix. | (none) | low | other |
| apps/studio/src/LayoutPicker.svelte | 39 | `How should this exhibit be read?` | Clear, on-voice heading. No fix. | (none) | low | other |
| apps/studio/src/LayoutPicker.svelte | 40 | `Each choice sets a different relationship between the visitor, the work, and your voice — not a skin on the same page. It shapes the published exhibit, not this editing view.` | On-voice; em-dash in body copy fine. No fix. | (none) | low | other |
| apps/studio/src/LayoutPicker.svelte | 25-27 | `Single`/`Grid`/`Narrative` + stance/consequence sentences | Clear, well-written; matches glossary. No fix. | (none) | low | other |
| apps/studio/src/LayoutPicker.svelte | 30-31 | `Object-led`/`Prose-led` + clauses + `Later: …` future notes | On-voice; the "Later:" notes describe unbuilt features (Compare/Slideshow/Scrollytelling) to users — acceptable as roadmap framing, but verify it's intended to ship. | Confirm the "Later:" roadmap copy is intended for end users. | low | other |
| apps/studio/src/LayoutPicker.svelte | 60 | `current` (badge on active option) | Clear. No fix. | (none) | low | other |
| apps/studio/src/LayoutPicker.svelte | 73 | `Narrative reads its prose from the exhibit's Sections — authoring the section spine in the Studio is a separate, not-yet-built step, so a Narrative exhibit publishes its intent but needs sections to read fully.` | STALE/CONTRADICTORY: says authoring the section spine is "not-yet-built", but NarrativeEditor.svelte IS that surface and ships in this same app. Misleads the user into thinking they can't author sections. | `Narrative reads its prose from the exhibit's sections — author them in the spine panel beside your notes.` (factual correction). | high | inconsistency |
| apps/studio/src/RightsEditor.svelte | 44 | `Attribution / credit` (field head) | Clear; curator voice. No fix. | (none) | low | other |
| apps/studio/src/RightsEditor.svelte | 47 | placeholder `Who to credit when this {scope} is shown or shared` | Clear, on-voice. No fix. | (none) | low | other |
| apps/studio/src/RightsEditor.svelte | 54 | `License` | Clear. No fix. | (none) | low | other |
| apps/studio/src/RightsEditor.svelte | 62 | `Shown to anyone who views or reuses this {scope}. A pure IIIF viewer displays the credit too.` | "A pure IIIF viewer" is institutional jargon for general curators; the second sentence may confuse non-IIIF users. | `Shown to anyone who views or reuses this {scope}.` (drop or move the IIIF aside to a tooltip). Terminology: IIIF. | medium | internal-vocab |

## Notes / open questions
- Several `${String(e)}` error dumps (App:571, 1315, 1316, 1567) put raw exception objects in `window.alert` — these are the highest-value error-quality fixes; replace with plain-language messages.
- "import" appears as a user-facing verb in many strings despite the team rule to never call opening a library/folder "import". This spans both the library-open path (correctly says "Open a library…") and the add-content paths (folder/IIIF/CSV/WADM) which all say "import". Needs a terminology decision on whether "add" should replace "import" for content ingestion too.
- "Annotation"/"W3C annotations"/"AnnotationPage" leak in the WADM/JSON import path — the team says avoid "Annotation" in UI (use Note).
- "canvas", "rail", "popover", "plate", "basemap", "slug", "archive", "manifest" all appear in user copy — confirm which are intentional product metaphors vs leaks.
- Verify `saveStatus.error` (save-queue.svelte.ts) and skip `reason` strings (csv-import / wadm-import) are plain-language before they reach LibraryHome:135 and App:621/648.
- Cross-component AV label drift: "Set in" (App hints) vs "Set moment" (NarrativeEditor) vs whatever AvEditor actually renders — reconcile.
