# Showroom Exhibit — Archie annotates Archie

**Goal:** a self-documenting Archie exhibit whose Objects are screenshots of Archie's own
UI, with annotation regions labeling every feature. Functions simultaneously as a feature
list, a tutorial, and a showroom for Studio + Viewer + Web Embed.

**Meta-trick:** the showroom IS a narrative exhibit — the prose spine is the guided tour,
and `readings` are colour-coded feature tracks. The exhibit demonstrates the features it
documents. Built via the real CSV bulk-import path (`apps/studio/src/csv-import.ts`), which
also demonstrates that feature.

## Grounding facts (prior art)

- **Harness:** `scripts/capture-screenshots.mjs`, run `node scripts/capture-screenshots.mjs`.
  Captures 8 fixed states only (viewer-home/voynich/av/bidar; studio-library/overview/editor-image/editor-av)
  at 1440×900 → `docs/screenshots/auto/<name>.desktop.png`. **Must be extended** for dialogs,
  drawn annotations, overlays, embed.
- **CSV schema:** `object,comment,x,y,w,h,tags,reading`. Column order free; unknown columns
  (verify) ignored. Blank x/y/w/h → **pending note** (placed later via "Set area"); all-4 →
  placed at `[x,y,w,h]`; partial → error. `tags` space/pipe sep, `#` stripped. `reading`
  references an existing reading name/id. `emphasis` + `wholeObject` NOT in CSV.
- **Data model:** Library → Exhibit{objects[], sections[], readings[]} → Object{source,label} ;
  Section{objectId,start,prose} ; Reading{id,name,colour,description}.

## Readings (feature tracks — colour-coded passes over the same screenshots)

| Reading | Colour | Purpose |
|---|---|---|
| `studio` | amber | Authoring features (curator-facing) |
| `viewer` | teal | Reading features (visitor-facing) |
| `embed` | violet | Web-embed + mount/tile internals |
| `power` | rose | Keyboard / advanced / invisible-behavior callouts |

## Screenshot inventory

Each screen = one Object (one screenshot). "H" = harness state: **(have)** = already captured,
**(new)** = harness extension required. Annotations listed are the regions to box.

### ACT 1 — STUDIO (authoring)

| # | Screen | H | Annotations (regions) | Stories covered |
|---|---|---|---|---|
| S1 | Library home | have | project-binding bar, save-status pill, recents, create/open, ingest entry | save zip/folder/browser+status; ingest start; open local via OS dialog |
| S2 | Exhibit overview light-table | have | object plates, pan/zoom, enter-object, add-section invite | multi-object arrangement; overview-as-canvas |
| S3 | Image canvas + NoteEditor open | new* | OSD canvas, drawn box, whole-object option, comment, tags, reading dropdown, emphasis toggle, delete | draw/edit regions; note by draw or whole-object; edit comment/tags/reading/emphasis/delete |
| S4 | Readings rail + editor | new | rail eye(visibility)/pen(filter), colour swatch, manage modal rows, description field | define readings+colours+describe; toggle visibility isolate/compare |
| S5 | Narrative/section composer | new | section cards, framing-draw=camera, prose pane, cross-object nav | compose narrative spine framing objects+regions |
| S6 | AV editor (audio + video) | have+new | waveform, in-point drag, time-range marker, video frame-overlay box, markbar | mark moments in AV; box a video frame |
| S7 | Map layer | new | add-map modal, basemap, framed lat/lng extent, geo note | bounded map layer + lat/lng extent |
| S8 | Cite palette (Cmd-K, studio) | new | search field, results, thumbnail browse, insert | cite note/exhibit/object via search or thumbnail |
| S9 | Exhibit metadata / rights | new | title, summary, attribution, license fields | set title/summary/attribution/license |
| S10 | Ingest / IIIF import | new | URL field, picker, ingest progress | paste IIIF manifest URL; ingest media |
| S11 | Publish dialog | new | destination tabs, repo/branch/PAT, status steps, SEO callout | publish GitHub repo/branch/PAT; local folder; zip; SEO metadata |
| S12 | Shortcuts help overlay | new | shortcut groups (save/cite/help/dismiss/object-nav) | keyboard shortcuts |

\*S3: image-editor state is captured; opening the note popover + a drawn box is the new part.

### ACT 2 — VIEWER (reading)

| # | Screen | H | Annotations (regions) | Stories covered |
|---|---|---|---|---|
| V1 | Gallery | have | cards, cover, note count, order | published cards by order; scan objects |
| V2 | Reader (image + sidebar) | have | canvas markers, sidebar list, note detail, divider, expand button, whole-object thin border | pinned notes click→fit/highlight; note card floats; hover solos; camera centers; whole-object border; resize/collapse divider persists; expand sheet; touch scroll list |
| V3 | Narrative reader | new | spine cards, active highlight, canvas, fit-on-click | prose spine beside canvas; click section switches media |
| V4 | AV player + transcript | have | media, waveform map, transcript lines, active line, controls, sibling carousel | transcript spine; click line seeks; playback highlights; sibling nav; lands t= paused |
| V5 | Search overlay (finder) | new | search field, tag facets, results, jump | Cmd-K/`/` finder; search text; tag filter; jump |
| V6 | Note media lightbox | new | media, arrows, note text, close | thumbnail→fullscreen carousel arrow nav |
| V7 | Reading sheet + legend + cite hovercard | new | centered sheet, dim backdrop, legend toggles+hide-all, cite hovercard | expand long note dimmed; base vs colour readings + hide-all; hover cite rich preview |

### ACT 3 — EMBED + MOUNT (technical)

| # | Screen | H | Annotations (regions) | Stories covered |
|---|---|---|---|---|
| E1 | `<archie-viewer>` embedded on a host page | new | embed custom-element frame, host-page chrome, deep-zoom tiles, attribution | embed on web; offline .archie.zip browse |

**Invisible/mount stories** (no UI of their own) ride as extra annotations on E1, V2, V4:
remote-IIIF deep-zoom anon-CORS+60s-timeout; pre-baked DZI streaming; geo XYZ basemap;
malformed selectors safely skipped; zoom clamp (no unreadable / no past-native); source-string
tile-handler auto-detect. Tagged `power`/`embed`.

## Counts

- **Exhaustive:** ~20 screenshots (S1–S12, V1–V7, E1). Covers all 42 stories.
- **Focused MVP:** ~13 — merge S9→S1, S10→S1, drop S7(map)/S8(cite)/V6(lightbox) to a "more"
  appendix; combine V7 sub-features. Still covers the core arc; defers niche surfaces.
- Annotations per screen: 4–9 regions. Total ~110–140 annotation rows across all CSVs.

## Coverage matrix (42 stories → screens)

Every story maps to ≥1 screen above. Mount/technical stories (last ~9) are annotation-only
callouts on E1/V2/V4, not standalone screens, because they describe invisible behavior.

## Build sequence (proposed, phased ≤5 files each)

1. **Extend harness** — add the `(new)` capture states to `capture-screenshots.mjs` (drive
   Studio dialogs/overlays via Playwright clicks; add a viewer narrative route + overlays;
   add a tiny embed host page). Run → produce all ~20 PNGs.
2. **Author CSVs** — one CSV per Object under `docs/showroom/csv/<screen>.csv`, real schema,
   plus a companion `SHOWROOM-NOTES.md` of extra showoff suggestions per screen.
3. **Assemble exhibit** — screenshots as Objects, readings, narrative sections (the tour),
   import CSVs via the bulk-import path, draw any pending regions with "Set area".
4. **Publish** — run through the publish flow; the showroom becomes a live demo of itself.

## Open decisions (gating)

1. **Coordinate strategy** — coordinate-free CSVs (you draw boxes via "Set area", dogfoods
   import + placement, resilient to UI change) vs pinned pixel boxes (I measure against the
   captured PNGs, finished artifact, brittle).
2. **Scope** — exhaustive ~20 vs focused MVP ~13.
