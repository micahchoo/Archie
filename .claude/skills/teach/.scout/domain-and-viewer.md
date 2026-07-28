# Archie Domain Model, Terminology, and Viewer Experience

## PART A: DOMAIN GLOSSARY

### Core Entities (Source-ordered by ownership nesting)

#### **Library**
**Definition:** Top-level container for a published project; IIIF `Collection`. Holds N Exhibits plus project-level metadata (title, summary, rights/attribution).

**Cardinality & Relations:**
- 1:N with Exhibit (a Library contains many Exhibits)
- Carries `RightsFields` (copyright/license/attribution) at project scope
- IIIF projection: `Collection`

**Motivation:** The unit of publication — one Library = one published site (e.g., a GitHub Pages repo); the Gallery landing indexes all Exhibits in a Library.

**Source:** `packages/render-core/src/model/model.ts:174-179`; CONTEXT.md §18-20.

---

#### **Exhibit**
**Definition:** One published narrative artifact; IIIF `Manifest`. Self-contained: owns its Objects, media, annotations (Notes), and Sections (optional). Independently portable.

**Cardinality & Relations:**
- 1:N with Object (an Exhibit owns many Objects; no cross-exhibit reuse)
- 1:N with Section (ordered narrative units; absent = no narrative)
- 1:N with Reading (interpretive lenses; absent = base-only)
- 0:N with Note (via WADM `AnnotationPage` per Object)
- Carries `RightsFields`

**Key Fields:**
- `slug`: URL segment (`/{slug}/`)
- `title`, `summary`, `cover`: metadata + Gallery card image
- `objects[]`: the media Items
- `sections[]`: (optional) narrative spine — present iff narrative exists
- `readings[]`: (optional) interpretive passes — present if any exist
- Layout is **emergent**: `sections.length > 0 ? 'narrative' : 'grid'` (never authored)

**Motivation:** The standalone exhibition unit — scholar authors an Exhibit as a complete scholarly argument about its objects. IIIF Manifests enable reuse in Mirador, other IIIF viewers.

**Source:** `packages/render-core/src/model/model.ts:145-170`; CONTEXT.md §22-24; ADR-0016.

---

#### **Object (AObject)**
**Definition:** One media item inside an Exhibit (image / audio / video / map); IIIF `Canvas`. The atomic unit of deep-zoom annotation.

**Cardinality & Relations:**
- N:1 owned by Exhibit (exhibit-nested, not a shared pool)
- 0:N Note targeting this Object's regions/time-ranges
- 0:1 with TileSourceDescriptor (if a map — geo-annotation extension)

**Key Fields:**
- `id`: ObjectId (exhibit-local)
- `source`: URL (image/IIIF/audio/video/map descriptor)
- `mediaType`: "image" | "sound" | "video" (default: "image")
- `tileSource`: (optional) map basemap descriptor
- `label`, `summary`: caption/description
- `width`, `height`, `duration`: IIIF dimensions/length
- `thumbnail`: optional cached shrink for grid display
- `originalName`: preserved original filename (for citation provenance)

**Motivation:** Objects are the containers for annotation — a scholar marks up regions of images, time-ranges of audio, or geographic regions of maps. Ownership is per-exhibit to keep exhibitions self-contained and independently publishable.

**Source:** `packages/render-core/src/model/model.ts:75-105`; CONTEXT.md §26-32.

---

#### **Map** (Object medium type)
**Definition:** An Object whose surface is a slippy-map basemap (XYZ/raster tiles), mounted on the same OSD deep-zoom Canvas as an image. Medium ≠ editor — a Map reuses the image Canvas (unlike sound/video which route to an AV editor). Carries a `tileSource` descriptor (tile template + zoom range + geographic bounds).

**Cardinality & Relations:**
- 1:1 with Object (a Map *is* an Object with `mediaType` context + `tileSource` set)
- Geographic annotations (Box/Outline Regions only — no pins) target its Canvas, anchored by `archie:geo` (lng/lat source-of-truth; pixel selector is re-projected if basemap changes)

**Key Fields (TileSourceDescriptor):**
- `bounds`: [west, south, east, north] — absolute geographic extent
- Tile template + zoom range

**Motivation:** Geo-annotation extension (2026-06-18 grilling). Maps enable annotating geographic regions durably — the pixel representation re-projects if the basemap baseline changes, but `archie:geo` keeps the annotation nailed to Earth coordinates. Bounded extents are bakeable for offline (whole-world maps are unbakeable).

**Source:** CONTEXT.md §30-36; ADR-0015; `packages/render-core/src/model/model.ts:86-88`.

---

#### **Section**
**Definition:** One ordered unit of an Exhibit's narrative spine; IIIF `Range`. A self-contained reading beat `{ objectId, start, prose }` — not a tour of Notes. The spine may switch Objects across Sections (the same Object, or many).

**Cardinality & Relations:**
- N:1 owned by Exhibit (ordered array; present only if narrative exists)
- 1:1 with Object (via `objectId` — can repeat across sections)
- Independent of Note (a Section that references a Note does so via ⌘K link in prose)
- Serializes as IIIF `Range` (canonical) PLUS a derived `supplementing` WADM annotation (ADR-0017)

**Key Fields:**
- `id`, `title`: identity + label
- `objectId`: which Object this section activates
- `start`: media fragment (camera target) — `xywh=…` for image, `t=start,end` for AV
- `prose`: markdown/HTML text for the section's pane

**Motivation:** A narrative is an ordered prose spine through Objects. Sections are authored in the object editor itself (camera framing on the canvas), not as a separate "tour" of existing notes — this keeps the narrative independent and editable without coupling to the annotation layer.

**Source:** `packages/render-core/src/model/model.ts:112-123`; ADR-0005; ADR-0016.

---

#### **Reading**
**Definition:** A curated, mutually-exclusive interpretive pass over an Exhibit's Objects (e.g., a "Cipher" reading vs. a "Hoax" reading of the Voynich). The reader switches Readings (canvas legend radio button); a Note belongs to exactly one Reading (or none = the base). IIIF `AnnotationCollection` per Exhibit; per-Object notes form an `AnnotationPage` whose `partOf` references the Reading's collection.

**Cardinality & Relations:**
- N:1 owned by Exhibit (curated set, ordered for legend display)
- 0:1 with Note (each Note carries optional `reading` id)
- Distinct from reading-*mode* (which is pacing: click vs. scroll)

**Key Fields:**
- `id`: stable identifier (Note.reading references this)
- `name`: display name in legend (e.g., "Cipher")
- `description`: one-line explainer (legibility in legend)
- `colour`: visual identity (swatch + marker accent)

**Motivation:** Readings are the structural home for *competing collaborative interpretations* — scholar A and scholar B's rival readings coexist rather than forcing a merge conflict. IIIF-native: pure IIIF viewers (Mirador) toggle Readings for free. Authorship supported per Note via `lastEditor`.

**Source:** `packages/render-core/src/model/model.ts:126-143`; ADR-0007.

---

#### **Note (WADM Annotation)**
**Definition:** A single W3C WADM `Annotation`. Targets exactly one of: Library, Exhibit, Object (region), time range, or geographic region on a Map. Carries a `logicalId` (stable identifier), version DAG metadata (`version`, `parent`, `modifiedAt`, `lastEditor`), optional `reading` (interpretive membership), optional `emphasis` (per-note visual emphasis), optional `geo` (geographic anchor for map annotations).

**Cardinality & Relations:**
- Targets one scope: Library / Exhibit / Object + region/time selector, or Map + geo-region
- Optional `reading` membership: belongs to exactly one Reading or none (base)
- Optional Tags: additive per-note `purpose:tagging` bodies
- Append-only: edits bump version, keep parent chain (merge-enabled)

**Key Fields (in WADM context):**
- `archie:logicalId`: durable identity across versions
- `archie:version`: version number (merged-head state)
- `archie:parent`: prior version id
- `archie:lastEditor`: clientId of author
- `archie:reading`: (optional) Reading id for mutual exclusivity
- `archie:emphasis`: (optional) "normal" | "strong" for visual weight
- `archie:geo`: (optional) {lng, lat} geographic anchor (Maps only)
- `target`: W3CSpecificResource (selector: `xywh=…` for image rect, `t=…` for time, `<polygon>` for shape)
- `body`: W3CTextualBody (comment/alt-text/transcript cue) OR W3CExternalBody (media link)

**Motivation:** WADM is the W3C standard for web annotations — Archie's spine. Append-only log + version DAG enables async multi-author collaboration without a server. Linkable (deep-link URLs land in context). Serializes as heads projection + history sidecar (pure WADM consumers see current state; Archie sees full DAG for merge conflict detection).

**Source:** `packages/render-core/src/wadm/types.ts`; ADR-0003; CONTEXT.md §38-39, §97-99.

---

#### **Tag**
**Definition:** A lightweight ad-hoc label on a single Note; WADM body with `purpose:tagging`. Visitor payoff = cross-cutting discovery/retrieval (flat filter chip "show only notes tagged `signature`"). Additive — stack freely. Now also the home for apparatus/reference strata (paleography, codicology, material) under Frame C.

**Cardinality & Relations:**
- N:1 with Note (multiple tags per note, not exclusive like Readings)
- Never a canvas legend, only a note-pane chip filter

**Motivation:** Tags are the inverse of Readings — Readings are curated/framed/exclusive (the author's "here's one way to read this"), while Tags are per-note, discoverable hints (the author's "this note is about paleography"). They fix the apparatus-strata home — apparatus notes are *additive note-pane filters*, not exclusive canvas Readings.

**Source:** CONTEXT.md §46-48; ADR-0007.

---

#### **Studio**
**Definition:** The authoring app. Browser-based SPA. Writes working state (OPFS or FSA folder), exports zips, runs publish build. Two entry paths: "Try a template" (ephemeral Playground) or "Start a project" (persisted Project).

**Cardinality & Relations:**
- N:1 with Filesystem backends (OPFS, FSA, DownloadFilesystem)
- Writes working tree that Viewer reads (same-origin live source)
- Exports `.archie.zip` (portable, no-server format)

**Motivation:** Lowers authoring friction — Studio lives in the browser, no build tools needed. Playground vs. Project split respects user intent: try-first with zero commitment, save-when-ready for real work. Publish is a thin adapter over the zip (GH Pages, etc.).

**Source:** CONTEXT.md §60-61; ADR-0008.

---

#### **Viewer**
**Definition:** The read-only exhibit shell. ONE build; its data source is auto-detected at runtime: hosted (published tree over HTTP) or portable (opened `.archie.zip`). Includes optional live source (same-origin Studio working store). Exhibits annotations, Sections (prose spine), Readings (interpretive legend), and deep-zoom navigation.

**Cardinality & Relations:**
- 1:N with Exhibit (loads one or many exhibits from a Library)
- Reads: published tree OR .archie.zip OR live Studio working state
- Displays: deep-zoom image (OSD), audio waveform (WaveSurfer), video timeline, map basemap, prose panes, annotation markers

**Two modes (not two apps):**
- **Hosted:** published tree at a URL (standard deployment)
- **Portable:** opens a `.archie.zip` in-browser (no server, recipient-reads)

**Motivation:** One Viewer codebase handles all data sources (published/portable/live), avoiding drift. Portable mode closes the "recipient receives a zip, how do they read it?" gap. Live mode enables author preview without publish.

**Source:** CONTEXT.md §63-68; `apps/viewer/src/published.ts`; ADR-0008, ADR-0010.

---

#### **Gallery**
**Definition:** The Library-level published index of Exhibits. The published site's landing page and the Studio's library-browse screen share one data source: a generated `exhibits.json` (a build-time projection of the Library). One Library → one Gallery (unless the Library has one Exhibit and no intro text, in which case the Gallery collapses straight to that Exhibit).

**Cardinality & Relations:**
- 1:1 with Library (each Library projects to one Gallery)
- N:1 with Exhibit (the Gallery indexes all Exhibits in the Library)

**Motivation:** The survey's major greenfield gap — nobody emits a multi-exhibit index. Archie builds it at publish time so multi-exhibit sites have a navigable landing page.

**Source:** CONTEXT.md §70-72; `docs/decisions/archie.md` §107; `packages/render-core/src/iiif/exhibits.ts`.

---

#### **Grid**
**Definition:** Within-Exhibit spatial layout showing Objects as a browsable thumbnail grid. The sole spatial arrangement (v1). Slideshow is a reading-mode of Grid, not a separate template. When a narrative exists (sections > 0) the grid recedes to a reachable index behind the narrative; with zero sections it is the leading surface.

**Cardinality & Relations:**
- 1:1 with Exhibit (Grid is the arrangement for all exhibits)
- Recedes to index when narrative exists (sections > 0)
- Auto-opens its sole Object when exhibits.length === 1

**Motivation:** Simplicity — one spatial arrangement, no template picker. Reading mode is orthogonal (click vs. scroll, object-led vs. prose-led). The 1-object auto-open is a special case of grid, not a template.

**Source:** CONTEXT.md §74-76; ADR-0016.

---

### Architectural Concepts

#### **Playground vs. Project**
**Definition (UX):** Two entry paths in Studio. Playground is an ephemeral, unsaved try-first sandbox (OPFS working store, reset on browser close). Project is a persisted exhibit (Chromium: FSA folder; non-Chromium: zip-as-file with OPFS working copy).

**Motivation:** Respects user intent. New users land in Playground ("try a template") with zero friction; when they hit first value (export/publish) a one-click "Save this as a project" promotes it. Kills the nudge strategy (nudges = symptom of a default mismatching intent).

**Source:** CONTEXT.md §129; ADR-0008.

---

#### **Map Extent**
**Definition:** A Map Object's bounded geographic region (`bounds = [west, south, east, north]`). The extent *is* the map — the OSD pixel raster is the world sub-rectangle covering those bounds. Absolute frame (the reader cannot pan past it).

**Motivation:** Makes a basemap bakeable for offline (whole-world maps are unbakeable). The extent is the Map's finite pixel dimensions (the geographic analogue of an image's width/height).

**Source:** CONTEXT.md §34-36; ADR-0015.

---

#### **Overview-as-Canvas** (Exhibit view, two scales)
**Definition (UX):** The authoring workspace exists at two scales sharing canvas+sidebar pattern. **Overview:** Object thumbnails in reading order + Section dividers; sidebar = exhibit-level props/sections/narrative. **Object:** deep-zoom annotation surface; sidebar = WADM form. Same zoom metaphor both scales.

**Motivation:** The Studio's authoring gesture is framed on the canvas itself (draw a region, set in/out time for sections) rather than on a separate overview screen. Mirrors the Viewer's experience: the author sees what the reader will see.

**Source:** CONTEXT.md §132; ADR-0008; ADR-0006.

---

#### **Progressive Reveal** (Viewer reading mode)
**Definition:** When a narrative exists, markers (annotations) appear with their active Section; accumulated markers persist (faded) so the end-state is fully annotated. Toggle defaults "progressive" + show-all/hide-all alternates.

**Motivation:** Guides the reader through the narrative without overwhelming them up-front. Object-led exhibits (no narrative) show markers at low visual weight always.

**Source:** CONTEXT.md §137.

---

#### **Heads Projection**
**Definition:** The canonical heads projection of the append-only log. For Notes: a single heads version(s) per logicalId. For Sections: a supplementing annotation collection. Full version chain persists in history sidecar (`annotations/history/{logicalId}.json`).

**Motivation:** Heads are what the reader sees (current state). History is what Archie sees for merge conflict detection. This three-tier interop (pure WADM / PROV-aware / Archie) lets each consumer read at its level.

**Source:** CONTEXT.md §99; ADR-0003; ADR-0017.

---

#### **Version DAG + Merge**
**Definition:** Each Note carries `{ logicalId, version, parent, modifiedAt, lastEditor }`. Edit bumps version, append-only keeps parent chain. Two clients editing v1→v2 concurrently both produce {logicalId}/v2; merge detects this via parent DAG walk and offers a conflict card (three-way: ancestor + per-side diff) without git.

**Motivation:** Enables async multi-author workflow (Share-a-copy→Import-changes) without a server. Append-only guarantees data is never lost; version DAG makes merge conflict detection reliable.

**Source:** CONTEXT.md §98-99; ADR-0003.

---

## PART B: VIEWER READING EXPERIENCE + FEATURE MOTIVATIONS

### The Published Viewer Flow (apps/viewer)

#### **Arrival: Deep-Link Land-in-Context**
When a reader arrives at a deep-linked exhibit state (e.g., `/voynich/?#/object/folio-42/note-cipher-001`):
1. **Land exactly at the state:** honor the link's precision absolutely (no navigate-past, no interstitial)
2. **Cold-arrival chrome** (fades after first interaction):
   - Clickable breadcrumb: `Gallery › Exhibit › Object/Section`, each navigates to that level's start
   - Prominent "zoom-to-fit" button (whole-image view)
   - "You followed a link to this note" one-liner
   - For Narrative: position indicator ("Section 3 of 7") + "read from beginning"
3. **Cross-Library arrival:** transparent "from [Library A] · viewing [Library B]" one-liner

**Why:** Respects reading-intent declarations. Precision in, escape out — meet the user where they arrived; give ways *out* to context.

**Source:** CONTEXT.md §142; UX philosophy #3.

---

#### **Object-Led Exhibits (no narrative: sections = 0)**
- **Primary surface:** Object grid (thumbnail browsable cards)
- **Markers:** visible at LOW visual weight (subtle outlines, full styling on hover/focus)
- **Marker rendering:** stroke-over-stroke (1px light + 1px dark) for cross-background legibility
- **Layer toggle:** defaults "show all"
- **Readings legend:** canvas-corner compact radio (name + color swatch + one-line description)

**Why:** Objects are the subject; annotations are supporting context. Markers don't dominate; Readings are optional (no default privileged camp).

**Source:** CONTEXT.md §137.

---

#### **Prose-Led Exhibits (has narrative: sections > 0)**
- **Primary surface:** Narrative column (prose spine, ordered Sections with ⌘K linkable text)
- **Canvas pane:** (right) shows the object framed by the active Section
- **Markers:** progressive-reveal — appear as their Section passes, accumulate (faded) to the end
- **Layer toggle:** defaults "progressive" (marked sections are accumulated); show-all/hide-all alternates
- **Readings legend:** canvas-corner radio (same as object-led)
- **Grid access:** back-door "index" reachable behind narrative (click/tap the grid icon)

**Motivation:** Prose is the spine; Objects anchor the prose. Readers move through Sections in order (or jump via ⌘K links); markers accumulate so they see the full annotated picture by the end.

**Source:** CONTEXT.md §137, §139.

---

#### **Annotation Interaction (both modes)**
- **Click a marker:** popover/drawer opens at the marker, showing the Note's full text, Tags (chip filter), Reading (radio context)
- **Click a ⌘K link in prose:** fitBounds to the linked region (same gesture as sidebar click)
- **Readings radio (legend):** toggle between interpretive passes in real-time (base always visible beneath active reading)
- **Tag chip (note pane):** filter notes by tag in real-time (shows only notes with that tag)

**Why:** Locus-based editing (ADR-0006) — the marker/link is the pivot. Readers interact where the annotation anchors, not in a separate sidebar.

**Source:** ADR-0006; CONTEXT.md §136.

---

#### **Viewer Data Sources (all behind one API)**

1. **Hosted (default):** Fetch published tree over HTTP (`/{baseUrl}/published/…`)
   - Standard deployment path (GH Pages, any static host)

2. **Portable:** Opened `.archie.zip` in-browser
   - No server needed
   - Recipient receives zip from author, opens in Viewer, reads
   - Media blob-URLs auto-revoked on close

3. **Live (same-origin):** Studio working store (OPFS) projected in-memory
   - Author preview without publish (author-only badge "Browser")
   - Probe fails silently on cross-origin (security)

**Why (ADR-0010):** One Viewer codebase, multiple sources. Portable closes the "recipient-reads-zip" gap. Live enables zero-friction preview.

**Source:** `apps/viewer/src/published.ts`; ADR-0008, ADR-0010.

---

### Feature Motivations

#### **Deep-Zoom + OSD (OpenSeadragon)**
**Motivation:** Scholarly use case demands zoomable high-resolution images (manuscripts, artworks, archaeological surveys). OSD is the de facto deep-zoom library; Annotorious (Recogito's annotation layer) integrates tightly.

**Source:** CONTEXT §11 locked frame; prior-art survey.

---

#### **Sections (Narrative Spine)**
**Motivation:** Allow scholars to author an *ordered prose argument* through Objects without coupling to Notes. Author points to regions/moments via Section.start (camera frame); prose is the spine. Solves the "tour-of-notes problem" — a Section is not a reference to a Note, it's an independent beat.

**Source:** ADR-0005; CONTEXT.md §54-58.

---

#### **Readings (Competing Interpretations)**
**Motivation:** Enable coexisting scholarly disagreement. Cipher reading AND Hoax reading of the same Voynich folio can live in one exhibit rather than requiring two separate exhibits or a merge conflict. IIIF-native (pure IIIF viewers toggle Readings for free).

**Source:** ADR-0007; CONTEXT.md §158-171.

---

#### **Tags (Apparatus Strata)**
**Motivation:** Apparatus/reference notes (paleography, codicology, material) are per-note additive hints, not exclusive canvas-framing Readings. Tag chips in the note pane let visitors filter by strata without overwhelming the canvas.

**Source:** ADR-0007; CONTEXT.md §46-48.

---

#### **Append-Only Log + Version DAG**
**Motivation:** Preserve scholarly citation integrity. A Note's logicalId is stable across edits; version chain is visible to Archie (not destroyed). Enables async multi-author "Share a zip → Import changes" workflow without a server. Pure WADM consumers see heads; Archie reconstructs the DAG for merge.

**Source:** ADR-0003; CONTEXT.md §97-99.

---

#### **Linkability (Intra- & Cross-Library)**
**Motivation:** Scholar A's note should link to Scholar B's exhibit (intra-Library via structured ref; cross-Library via URL). Intra-Library links are validated at publish, auto-update if target path changes. Cross-Library are durable URLs (open web's durability).

**Source:** CONTEXT.md §109; ADR-0011.

---

#### **Portable Mode (.archie.zip)**
**Motivation:** Close the "recipient receives an export, how do they read it?" gap. No server required — the zip is the artifact. Solves the dependency problem: the author sends the recipient one file that opens in any browser with a Viewer.

**Source:** ADR-0010; CONTEXT.md §65-68.

---

#### **Gallery + exhibits.json**
**Motivation:** Multi-exhibit sites need a navigable landing page. `exhibits.json` is a generated build artifact (projection of the Library) — not hand-authored. Studio and published Gallery share this source so curated order is consistent.

**Source:** CONTEXT.md §70-72, §107.

---

#### **Reading Intent Declaration (Narrative Emergent)**
**Motivation:** UX principle #1: "Respect user intent declarations." By authoring Sections, the author declares "this exhibit leads with a narrative" — it's not a separate template choice. No picker. Narrative existence is a pure function of `sections.length > 0`.

**Source:** ADR-0016; CONTEXT.md §50-52, §137-140.

---

#### **Geo-Annotation Extension (Maps)**
**Motivation:** Allow geographic annotation (Box/Outline regions) on slippy-map canvases. Anchored by lng/lat (source-of-truth) but rendered as pixel selectors. If the basemap baseline changes, re-projection keeps regions nailed to Earth (not pixel-precise but durable).

**Source:** ADR-0015; CONTEXT.md §30-36.

---

## Terminology Alignment

| Term | Definition | IIIF Projection | Motivation |
|------|-----------|-----------------|-----------|
| **Library** | Top-level project container | Collection | Unit of publication |
| **Exhibit** | One narrative artifact | Manifest | Self-contained exhibition |
| **Object** | Media item (image/audio/video/map) | Canvas | Annotation container |
| **Section** | Narrative beat (prose spine unit) | Range (+ supplementing annotation) | Ordered prose argument |
| **Note** | WADM annotation | Annotation (in AnnotationPage) | Scholarly comment, linkable |
| **Reading** | Interpretive pass (exclusive) | AnnotationCollection + AnnotationPage(s) | Competing interpretations coexist |
| **Tag** | Per-note label (additive) | TextualBody (purpose:tagging) | Cross-cutting discovery |
| **Playground** | Ephemeral try-first | (UX only; not IIIF) | Respects user intent |
| **Project** | Persisted exhibit | (UX only; not IIIF) | Real work with saved state |
| **Grid** | Thumbnail layout (sole arrangement) | (implicit in Manifest structure) | Browse Objects |
| **Gallery** | Library index landing | (index.html rendered from exhibits.json) | Multi-exhibit navigation |

---

## Reader's Journey (Prose-Led Exhibit Example)

1. **Arrives at a deep-linked note** → lands in context (breadcrumb, zoom-to-fit, cold-arrival chrome)
2. **Sees Section title + prose in left pane** → reads the narrative spine
3. **Canvas right pane shows** the Object framed by Section.start (e.g., a detail zoom of a manuscript page)
4. **Markers accumulate** as Sections pass (progressive-reveal; faded older ones show full annotation state)
5. **Clicks a marker** → popover shows the Note, Tags, Reading membership
6. **Clicks a ⌘K link in prose** → fitBounds to that region, can jump between Objects
7. **Toggles Readings radio** (legend corner) → filters markers to one interpretive lens
8. **Tags chip in note pane** → filters notes by apparatus (paleography, codicology)
9. **Clicks back to grid** → index of all Objects in reading order
10. **Exits to Gallery** → browses other Exhibits in the Library

**Why this flow:** Prose-led exhibits guide readers through Objects in order (narrative spine), then offer depth (markers, links, Readings) on demand. Object-led exhibits invert: Objects are primary, annotations are discovery.

---

## Archie's Commitment to Standards + Openness

- **WADM (W3C Web Annotation Data Model):** All annotations round-trip. Pure WADM consumers see current state; Archie sees full DAG.
- **IIIF Presentation 3:** Manifests + Collections are standard. Pure IIIF viewers (Mirador) can display exhibits, toggle Readings, see deep-zoom.
- **No proprietary lock-in:** Exhibits export to zip (portable); JSON on disk (Git-friendly); standard WADM/IIIF (reusable).

**Source:** CONTEXT.md §11-14 (locked frames); §113-125 (architectural through-line).

