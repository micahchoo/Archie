# Archie

A static-publishable, multi-media exhibit annotation platform: OSD + Annotorious deep-zoom image annotation, audio/video annotation, W3C WADM-compliant, IIIF Presentation 3 on disk, authored in a browser Studio and published as a static site to GitHub Pages. v4 design doc is the trunk; prior-art survey is cited as evidence.

## Locked frames (user, non-negotiable)

- OSD + Annotorious
- Two surfaces: (CMS Gallery + Exhibit-making UI) = **Studio**; (Exhibit Gallery + published Exhibit UI) = **Viewer**
- Multi-media: audio, video, image
- Multi-object exhibits
- Annotations at **both** project level and image level
- Linkable + navigable annotations
- WADM (W3C Web Annotation Data Model)
- Web-publishable: **GitHub Pages**, standalone, no server

## Language

**Library**:
Top-level container for one project; on disk a directory/zip; IIIF `Collection`. Holds many Exhibits plus project-level metadata and notes.
_Avoid_: Project (v4 uses Library; "project" is overloaded — anvil meant the working dir, the brief means the Library).

**Exhibit**:
One published narrative artifact; IIIF `Manifest`. Self-contained: owns its own Objects, media, annotations, and narrative pages.
_Avoid_: Story, collection.

**Object**:
One media item inside an Exhibit (image / audio / video / external embed); IIIF `Canvas`.
_Avoid_: Item, asset, hotspot.

**Note**:
A single W3C WADM `Annotation`. Targets a Library, Exhibit, Object, image region, or time range.
_Avoid_: Annotation (in UI), comment.

**Layer**:
A curated, named, toggleable grouping of Notes with editorial intent (e.g. "Conservation Notes"); IIIF `AnnotationCollection`. Referenced by AnnotationPages via `partOf`.
_Avoid_: AnnotationCollection (in UI), group.

**Tag**:
A lightweight ad-hoc label on a single Note; a body with `purpose: tagging`.
_Avoid_: Keyword.

**Spatial arrangement** vs **Reading mode**:
The two orthogonal axes a "layout" conflates. *Spatial arrangement* = how objects sit (one / many / side-by-side). *Reading mode* = how the visitor moves (click-driven vs scroll-driven, prose-led vs object-led). Slideshow is a reading-MODE of the Gallery arrangement, not its own template.
_Avoid_: "layout template" as an undifferentiated bucket.

**Section**:
One ordered unit of an Exhibit's narrative; an IIIF `Range`. A **Single**-template Exhibit = one Section; a **Narrative**-template Exhibit = N ordered Sections (prose is the spine). Keeps Single ≠ "narrative with one section."
A Section is a **self-contained reading beat** (resolved 2026-05-25, the "third layer" model — Q-N below): `{ objectId, start, prose }`. `start` = the camera target on that object, a **media fragment** — `xywh=…` for an image object, `t=start,end` for an AV object (same grammar as a Note's selector). The spine may **switch objects** across sections (map → photo → recording); single-object is the degenerate case where every Section shares one `objectId`. A Section is **independent of Notes** — Notes are a separate annotation layer; a Section that wants to point at a Note does so via a ⌘K **link in its prose** (the linkability mechanism), NOT a structural reference. While a Section is active the Viewer shows that object's markers (progressive-reveal §122 deferred to v1.1, redefined as "markers whose region the narrative has passed"). Authoring convenience: "**add section from a Note**" seeds a new Section's `start` + prose from an existing Note (gives a note-walk's ease inside the third-layer model).
_Avoid_: chapter, stop, scene. Do NOT model a Section as a reference to a Note (the rejected "tour-of-notes" model — it couples the narrative layer to the annotation layer and can't focus a non-Note region).

**Studio**:
The authoring app. Browser SPA. Writes working state, exports zips, runs the publish build.

**Viewer**:
The published static site built by the Studio's publish step. Read-only.

**Gallery**:
The **Library-level** published index of Exhibits — the published site's landing ("exhibit gallery") and the Studio's library-browse ("cms gallery"), one data source / two renders. Source = a generated `exhibits.json` (a build-time projection of the Library; the survey's MAJOR greenfield gap — nobody emits a multi-exhibit index). Distinct from an IIIF Collection (rendered browse surface, multi-exhibit).
_Avoid_: using "Gallery" for the within-exhibit object grid (that is **Grid**).

**Grid**:
A within-Exhibit **layout** showing an Exhibit's Objects as a browsable thumbnail grid. (Was misnamed "Gallery" in v4's layout set.) Slideshow is a *mode* of Grid.
_Avoid_: Gallery (reserved for the Library-level index).

## Relationships

- A **Library** contains one or more **Exhibits** (1→N)
- An **Exhibit** owns one or more **Objects** (1→N) — objects are NOT shared across Exhibits (see Flagged ambiguities)
- A **Note** targets exactly one of: Library, Exhibit, Object, region, or time range
- A **Layer** groups many **Notes** across Objects within an Exhibit (cross-cutting)
- A **Tag** belongs to one **Note**
- The **Studio** writes what the **Viewer** reads; both consume the same on-disk WADM/IIIF files

## Decisions (resolved in grilling; ADRs pending — user deferred writing them to end)

- **Object ownership = exhibit-nested** (2026-05-24). Objects + their Notes live inside each Exhibit; no cross-exhibit reuse. See Flagged ambiguities.
- **Shape vocabulary = rect + polygon only in v1** (2026-05-24). The two that round-trip losslessly through stock `W3CImageFormat`. Ellipse/freehand deferred to v1.1 behind a custom svgpath parse/sanitize/serialize module that intercepts non-rect `SvgSelector` before the broken adapter branch. Evidence: `wadm-roundtrip` verdict — Ellipse→NaN, Path→curves-stripped, silent, in real Chrome. Donor: svgpath (runtime-verified), points-on-path.
- **`@render` = 3 layers** (2026-05-24). `@render/core` (pure TS: selector types, URL serialization, IIIF resolution, geometry/hit-test, OPFS adapter, scroll-sync controller — donor logic adopted/laundered) → `@render/mount` (vanilla mount fns wiring OSD + Annotorious-core + Wavesurfer) → thin per-framework adapters (<500 LOC each; budget doubles as logic-leak detector). Premise rejected: the valuable shared things are logic, not components.
- **Framework = Svelte everywhere** (2026-05-24). Studio = Svelte SPA (adopts anvil's editor shell/AnnotationForm/List/NarrativeEditor/PublishDialog/keyboard-registry/lifecycle as RUNNING code). Viewer = Astro + Svelte islands (adopts annomea's 3-state pane + popup+drawer). One adapter `@render/svelte`, zero `@render/react`. Read-UI donors are all Svelte; Juncture is Vue → its value is PURE (→ core), neutral on the choice. Rejected React-islands split: would re-derive every Svelte read-side donor + pay an unpaid-for two-adapter + hiring/third-surface tax.
- **Storage = OPFS default + FSA folder opt-in** (2026-05-24). Zero-friction OPFS working store by default; power users "link to a folder" (FSA, Chromium) for a git-native, visible copy. zip is the universal bridge. Two backends behind the Filesystem seam.
- **Tiling = single-JPEG + external IIIF (v1); OffscreenCanvas DZI slicer (v1.1)** (2026-05-24). v1: OSD `type:'image'` single responsive JPEG (~6000–8000px); giant images via pasted external `info.json`. NO wasm-vips (empirically has no `dzsave`; ~13–20MB binary blows the 240KB budget). v1.1 in-browser tiling = OffscreenCanvas worker pyramid, NOT libvips-WASM.
- **AV transcripts = WADM `supplementing` body, import-only v1** (2026-05-24). Author supplies WebVTT/SRT; each cue → Note with `motivation:supplementing` at `t=start,end`. No client-side ASR (Whisper is server-side). Build the VTT→`TextualBody` adapter. Time Notes = `FragmentSelector t=start,end` / `PointSelector t=`; AV source typed `Sound`/`Video`.
- **Navigation contract = full in v1** (2026-05-24). `fitBounds` on EVERY select (sidebar, narrative-prose link, `#/a/<id>` deep-link); polygon→bbox to feed OSD `fitBounds` (`goToTarget` is rect-only); popup/drawer re-anchors live on pan/zoom. Closes annomea's documented root-cause (fitBounds called zero times). Adopts anvil's fitBounds wiring into `@render/core`.
- **Annotation mutability = append-only + version DAG, BOTH provenance (A) and async-zip collab merge UI (B) in v1** (2026-05-24, user override of strip-it recommendation, confirmed intentional). Driver: scholarly citation integrity + genuine async multi-author workflow.
- **Merge = version-DAG causality, three-way-without-git** (2026-05-24). Each Note carries `{logicalId, version:int, parent, modifiedAt, lastEditor:clientId}`; edit bumps version, append-only keeps the parent chain. Merge per logicalId: same version → no card; one side fast-forwarded (parent matches) → no card; both advanced from common ancestor → manual conflict card. Wall-clock `modifiedAt` is ONLY an in-card tiebreaker (clock skew makes timestamp-LWW a data-loss bug). Merge-base computed by walking the parent DAG → three-way merge UX (ancestor + per-side diff) without git.
- **WADM serialization = heads-projection + history sidecar (log + projection)** (2026-05-24). Canvas AnnotationPage that viewers load holds ONLY head version(s) — plural after unresolved concurrent merge (both overlays = honest degradation). Full version chain persists per-logicalId as WADM AnnotationPages at `annotations/history/{logicalId}.json`, indexed by `annotations/history/index.json` (logicalId→URL; merge's load target; per-note pages are citation-dereference targets). Head links out via `archie:hasHistory` (→ history page) + `prov:wasRevisionOf` (→ prior version id); pure consumers ignore both. Versioned id = `{logicalId}/v{n}` (resolvable path, static-host-friendly). **Three-tier interop contract:** pure WADM consumer → current state; PROV-aware consumer → history; Archie viewer → full DAG; none broken. A "compile heads page" step in the Studio publish pipeline (alongside tiling) is a pure idempotent function of the append-only log. This is the unifying SPINE: append-only log → version-DAG merge → heads projection, one pattern at three boundaries.

- **Publish = zip-primitive + per-host adapters** (2026-05-24). Build produces a zip (the architectural primitive); each host is a thin adapter over the zip contents. GH Pages adapter (~200 LOC) uses the **GitHub Contents API** (not isomorphic-git — "replace this tree" matches), fine-grained PAT (contents:write + pages:write, 90-day). Token NOT persisted initially (paste-each-publish; WebCrypto PBKDF2→AES-GCM only if requested). First-class "Connect to GitHub" walkthrough opens the token page pre-filled with scopes. zip is the universal zero-auth default. "No server" lock = published artifact has no runtime; pushing to api.github.com is talking to a server, not running one (same category as fetching museum IIIF).

- **Orphan gaps (2026-05-24).** Scheduled by GATE not dependency. (1) **EXIF orientation = original-source + display-master-projection, v1.** Keep original untouched (provenance); ingest generates a normalized display-master derivative (derived bucket alongside tiles, regeneratable, lives under `.archie/cache/`-style path, doesn't ship to GH Pages unless "include source for citation" opted in). Annotations target the display master — ZERO orientation-awareness in the coord layer (this is why it beats non-destructive forever). Lossless rotation for pure rotation/flip (all 8 orientations qualify), re-encode PNG/HEIC. Provenance metadata per object: original path+SHA+EXIF, master path+SHA, transform applied. Gate: **8-orientation test-fixture set on every build before first public exhibit.** Fits the spine (source/projection/build/consumer). (2) **Empty/error/loading states = v1** (public exhibit can't ship blank; genuinely resists the spine — UI judgment). Gate: audited before public Viewer ships. (3) **Schema migration = v1.1 runner, but stamp a version field in v1** so v1 files are migratable (tldraw named-migration pattern; fits spine as versioned-files→migrated projection). Gate: discipline established before first schema change ships. (4) **Overlay contrast = v1.1** (perceptual, resists the spine). Gate: before first institutional pilot.

- **Layers = per-note membership, v1** (2026-05-24). A Note declares Layer membership directly (extension property / `partOf` on the annotation, NOT `AnnotationCollection` grouping pages — v4's model was wrong granularity: it groups canvases, not cross-object notes). Toggle = filter notes by membership across objects. Three-tier degradation (Archie filters; pure viewers show all). Tags (`purpose:tagging` → filter sidebar) also v1, unaffected.
- **Layout v1 set = Single + Grid + Narrative** (2026-05-24). Slideshow = a **Grid** *mode* (not a template). Narrative = prose-spine + N ordered Sections (IIIF Ranges), click-activated via the Q8 nav contract (the *navigable* narrative; nav engine already v1). Cheap = prose pane (Svelte island + Q8 link contract) + canvas pane (same OSD mount) + Range→section binding + click-to-activate. v1.1 = Scrollytelling (passive scroll-spy/pinning half, inherits Narrative) + Compare (synced dual-canvas, different spatial arrangement). Honest: narrative-in-v1 ADDS UI scope (not a free swap), but matches the locked "exhibit = narrative." a11y disposition accepted as-is: keyboard nav + alt-text-as-WADM-body + focus mgmt v1; overlay-contrast v1.1.
- **Library-level Gallery + `exhibits.json` = v1** (2026-05-24). The Library is the unit of publication: one Library → one published site = a Gallery landing + N Exhibits. `exhibits.json` is a generated build artifact (projection of the Library) — the survey's MAJOR greenfield gap, ours to build. Studio library-browse and the published Gallery share this source. Required by the locked "exhibit gallery + published exhibit ui" and assumed by intra-Library linking (needs the Library-wide index).

- **Linkability = intra-Library structured + cross-Library deep-link** (2026-05-24; closes the under-grilled half of locked frame "linkable"). "Linkable" has two scopes v4 conflated. **Intra-Library:** Note links target any Note/region/Exhibit in the same Library; ⌘K stores a structured reference `{libraryId, exhibitLogicalId, noteLogicalId|rangeId|xywh}` + a display-URL projected at publish (author-time resolvable, publish-time validatable, auto-updating if target path changes). **Cross-Library:** a link IS a Q8 deep-link URL someone else's Viewer serves — reuse the deep-link contract, do NOT build a separate system; ⌘K offers "paste URL" + recent-targets (no search); durability = open web's (repairable via stored logicalId, never self-healing); NO link-checking/federation/registry (server-shaped, ruled out). **Anno-index = BOTH per-Exhibit (Viewer read-time) AND Library-wide (Studio author-time)** — both projections of the log. Pin a stable published URL grammar (`/{exhibitSlug}/` + deep-link fragments) so cross-Library links are repairable. New Viewer UI: deep-link for a non-loaded Exhibit → "open it?" affordance, not silent same-exhibit treatment.

## Architectural through-line (page one of the arch doc)

**Rule: define the authoritative source, project thin.** Every major decision resolved to source-of-truth + thin derived projection/adapter:

| Boundary | Source of truth | Thin projection / adapter |
|---|---|---|
| Rendering | `@render/core` (pure TS) | per-framework adapters (<500 LOC) |
| Storage | Filesystem seam | OPFS / FSA backends |
| Annotations | append-only log | projected head version(s) |
| Merge | version-parent DAG | conflict-card view (computed merge-base) — **interactive/stateful: the one row where "thin" strains hardest, highest impl-risk-per-line** |
| WADM export | the log | heads page + history sidecar |
| Publish | the zip | per-host adapters (~200 LOC) |
| Deep-zoom | source image | tile pyramid (build step) |

**Orphan gaps resist this pattern** (correctness/polish/durability/perception, not data-flow) → schedule by GATE not dependency (see Decisions). **Collaboration's non-spine UI/workflow cost** (~4–6 weeks) is the dominant remaining cost and is not derivable from locked frames.

## UX decisions (end-to-end journey grill)

- **First-run = Demo/Real split by entry path, NOT a storage prompt** (2026-05-24). Landing has two doors. **"Try a template"** → explicit *Playground* mode, honest banner "Playground — nothing is saved. Start a project to keep your work." (ephemeral OPFS; preserves 60s-to-first-annotation). **"Start a project"** → a real, persisted Project. Conversion: one-click "Save this playground as a project" at first-value (first export/publish, ~5 min). Kills the nudge strategy (nudges = symptom of a default mismatching intent).
- **Persistence = three configs behind the Q4 Filesystem seam, selected by capability+intent; user-facing model is ONLY Playground vs Project** (2026-05-24). Never expose browser capability to the user. **Chromium Project** → `FsaFilesystem` (pick a folder once, autosave in place — the git/GH-Pages on-ramp). **Non-Chromium Project** (Firefox/Safari lack writable FSA) → `DownloadFilesystem` (OPFS working copy + the **zip IS the canonical file**: explicit Save = download `.archie.zip`, Open = pick it — the "Word-doc 2003" model). **Both browsers' Try** → ephemeral OPFS. This REFINES Q4: real-project default is the folder (Chromium) / zip-as-file (else); OPFS demoted to playground + non-Chromium working store. Capability ceiling as high as the browser allows, graceful floor everywhere. **Gate/validate:** non-Chromium users must grok zip-as-canonical-file — the failure mode is "Start a project again" instead of "Open"; mitigations = Open as prominent as Start on landing + a **recent-projects list surviving sessions** (metadata in OPFS/localStorage — a fine use of invisible storage; it's metadata, not content) + prominent habit-forming Save (keyboard shortcut + "unsaved changes" indicator).

- **Authoring workspace = Library screen + Exhibit canvas-workspace (two scales)** (2026-05-24). **Library** = the Project's home, a list/grid screen for project-level work (browse/organize/pick Exhibits, metadata, publish, export) — deliberately list-UI, visually distinct from canvas. **Exhibit** = anvil's canvas-centric workspace (ADR-0008) at TWO scales sharing the canvas+sidebar pattern: **overview** (object thumbnails in reading order + section dividers; sidebar = exhibit-level props/sections/narrative) ↔ **object** (anvil deep-zoom annotation surface; sidebar = WADM form). Same zoom metaphor both scales (1a). **Media = a cross-cutting panel** accessible from both scales + inline attachment in the WADM form — NOT a separate screen (media is always in service of something else). **Breadcrumb** `Project › Exhibit › [Object N]`, always shown + clickable — the most-traveled nav. **Validate:** does overview-as-canvas feel like a canvas vs a list-pretending-to-be-one? Fallback = 1b (explicit overview/object mode toggle). Honest retreat path, not v1 commitment to the clever version sight-unseen.

- **Collaboration UX = silent DAG-merge + summary panel + inline resolution** (2026-05-24). Author flow: "Share a copy for review" (export zip + message) / "Import changes" (pick returned zip). On Import, the Q10 version-DAG silently fast-forwards everything mergeable; a **summary panel** ("Synced 42 notes from Alice · 3 need your decision · [Review][Later]") answers "am I done?" + "what happened?" in one line. **Review** drops into the first conflicted note *in the normal workspace* — a conflict-card variant of anvil's WADM form (ancestor + per-side, your Q10 three-way), "Next" advances. **Later** → conflict badges on notes + a persistent "N unresolved" chrome indicator. Zero new *editing* surfaces; novelty = just the summary panel + conflict-card form variant. **Identity** = local display name, prompted on first Import ("what should Alice see as your name?"), not at launch; skip → "Anonymous"/clientId, gentle re-prompt. Validation gate: does a non-technical author grok the SUMMARY PANEL unprompted (conflict cards are well-trodden — Git/Word/Figma)?

- **Reading default = layout-dependent** (2026-05-24). Rests on the load-bearing principle **"layout = the author's declaration of reading intent"** (recurs across Q1/Q3/Q4/Q5 — a published Exhibit should look like what the author chose to make). **Object-led (Single/Grid):** markers visible at LOW visual weight (sub-option A2 — subtle outlines, full styling on hover/focus), layer-toggle defaults "show all," **stroke-over-stroke** (1px light + 1px dark) for cross-background legibility. **Prose-led (Narrative):** progressive reveal — markers appear with their active Section, accumulated markers persist (faded) so the end-state is fully annotated; toggle defaults "progressive" + show-all/hide-all alternates; click-ahead surfaces annotations on demand (not forced-linear). **Both:** annomea popup/drawer on marker click. **Overlay-contrast orphan:** v1 = A2 + stroke-over-stroke (no image analysis); v1.5 = image-aware adaptive styling; unreadable-over-this-photo failure = toggle off (layer-toggle = double duty). **Validate:** progressive-reveal comprehension (do visitors grok markers accumulate, or feel surprised? fix = tie marker-appearance to active-section highlight). Object-led default is well-trodden (Genius/Hypothesis/annomea) — no gate. **FLAG (not v1-blocker):** the authoring layout-PICKER must make the reading-intent declaration legible (a sentence per layout), or the layout system feels like interchangeable templates.

- **Deep-link cold arrival = land-in-context + fading orientation chrome** (2026-05-24). Land at EXACTLY the deep-linked state (honor the link's precision absolutely — no animate-past, no interstitial; destructive for time-based media). Cold-arrival chrome on first paint: **clickable breadcrumb** (`Project›Exhibit›Section›Object`, each level navigates to that level's natural start — `Project` = the Gallery, doubling as the "what else is here" affordance), prominent **zoom-to-fit** ("see the whole image"), a one-line "you followed a link to this note", and for **Narrative** a position indicator ("Section 3 of 7") + "read from beginning." Chrome **fades to normal viewer state** after first interaction / a few seconds. Cross-Library: same chrome carries "from [Library A] · viewing [Library B]"; **transparent, no confirmation gate** (a gate is platform-anxiety); honest loading state only if nontrivial new resources load. Trigger: `referrer` empty/external OR URL has a fragment beyond exhibit root. **Adopted-plus-styling, NOT invention** (breadcrumb/zoom-to-fit/one-liner are table stakes); quick prototype check on chrome subtlety + fade timing, not the overview-as-canvas/merge risk tier.

### UX design philosophies (cross-cutting — the real synthesis; test future UX decisions against these)

Six principles emerged across UX-Q1–Q7 and now bind the decisions. Write them in the design doc *separate from per-feature specs* — they're what makes the decisions cohere rather than read as independent picks. A future decision that **violates** one is a signal to argue the violation explicitly or reconsider.
1. **Respect user intent declarations** (Q1 playground-vs-project · Q3 author's layout choice · Q5 reading-default-by-layout · Q7 Library framing). A published Exhibit looks like what the author *chose to make*; defaults honor declared intent, never override. → the layout-picker must make reading-intent legible (a sentence per layout).
2. **Surface decisions at the moment they acquire meaning** (Q1 storage-at-first-value · Q4 identity-at-first-send-back). Not as up-front setup tax.
3. **Precision in, escape out** (Q6 deep-link land-in-context · Q2 zip-as-file portability). Meet the user where they arrived; give ways *out* to context. Anti-pattern: orient-first / wrap-everything-in-onboarding.
4. **Inverse for top-level entry points: invite in, don't escape** (Q7 Gallery — the top context has no precision to respect; the move is to draw the visitor down into exhibits).
5. **One mental model exposed; configurations hidden** (Q2 "Project" over three persistence configs; never expose browser capability).
6. **Adopted patterns ship clean; inventions get prototype gates** (the Q4-onward discipline).

### Gallery (Library landing) UX (2026-05-24)

- **Auto-grid v1 + explicit phasing** (UX-Q7). Gallery = `exhibits.json` projected to a uniform card grid (author controls per-Exhibit order, cover, title, short description + a Library title/intro blurb). **Schema designed forward** so v1.1 curation is additive, not a migration: top-level `library` object (not flat array), explicit ordering, first-class cover/title/description, reserved `presentation` namespace. **Single-Exhibit collapse = THRESHOLD:** skip Gallery only if exactly one exhibit AND no Library title/intro set; else render it ("part of [Library]" only if there's something to link back to). **Invite-in styling:** uniform ≠ flat — cards as invitations (cover weight, draw-you-in copy), Library intro as framing, hierarchy via layout (first-card prominence) not authored curation. **Cross-Library arrival:** referrer-aware "Library by [author]" one-liner (Q6's honest-about-arrival principle at the top level). **Adopted-tier, no gate** (card grid + collapse switch); brief check that the collapse threshold matches author expectations. **v1.1 named milestone:** curated landing (hero/sections/featured/grouped) as a gated invention.

### Invention-pile completeness check (UX pass close)

**6 major + 2 minor v1 inventions; nothing major hiding.** Major (each needs a prototype gate; priority order for validation rounds = **merge UI > playground→project > overview-as-canvas > cold-arrival chrome > three-configs-as-Project > conflict-card-as-WADM-variant**): the six in the inventory below. Minor (touched, lighter gate): **layout-picker** (sentence-per-layout, per principle #1) and the **"Connect to GitHub" pre-filled-scopes walkthrough** (Q13). **Deferred → NOT v1 inventions:** embedding/oEmbed (v1.2), AI-authoring/mask→SvgSelector (v1.2/v2), search/minisearch (v1.1). The big deferred surfaces genuinely aren't v1, so "ask-the-question-find-an-invention" surfaced nothing major beyond the inventory.

### v1 invention inventory (each needs a prototype-validation gate — adopted patterns do not)

The schedule risk lives entirely here. Validate ALL up front; do not validate only the scariest. **Adopted (ship on adoption, no gate):** anvil canvas+sidebar editor, annomea 3-state pane + popup/drawer, list-UI Library, the pure libs. **Invented (each gated by "does a real user get it?"):** (1) exhibit-overview-as-canvas (1a; fallback 1b); (2) playground→project conversion — *the likely week-8 surprise time-sink, sounds simple, encodes heavy mental-model work*; (3) three-persistence-configs-as-one-"Project" (never expose browser capability); (4) collaboration summary panel; (5) conflict-card-in-WADM-form; (6) identity-prompt timing. ~5–6 inventions — probably the right amount for what the product is, but budget a validation round for each.

## Named cuts (deferred + gated, NOT silent — per "every cut is explicit")

- **Bundle budget (240 KB gz)** — an *aspirational* figure inherited from v4 NFR1, **never validated** against cumulative v1. OSD + Annotorious + plugin-tools ≈ 250 KB *before* any Archie code; anvil's measured baseline is 328 KB. Likely already breached. A real measurement against a v1 prototype replaces this figure; the decision (drop / raise / treat-as-gate) is deferred to that measurement. Do NOT cite 240 KB as binding in the interim — it was never real.
- **Body sanitization (XSS)** — Markdown/HTML Note bodies render with no sanitization decision yet. Donor: field-studio `sanitizeSvg`/`sanitizeIIIFResource`. **Gate: before the first published exhibit with user-authored HTML.**
- **Media-upload UX** — AV *annotation* is grilled; AV *ingest* (codec/size/format/duration handling) is unscoped. Donors: ffmpeg.wasm or browser MediaRecorder constraints. **Gate: before the first AV-bearing exhibit.**

## ADRs & the arch-doc cut

Four ADRs written (`docs/adr/`): 0001 exhibit-nested objects (reverses our own shared-pool principle), 0002 rendering+framework (one ADR, two non-independently-reversible questions), 0003 the annotation spine (the keystone data-model decision), 0004 no-wasm-vips (empirical "don't re-litigate the obvious tool"). Everything else is an **application of the source+projection pattern** and belongs in the arch doc under the through-line table, not as separate ADRs (decoration dilutes the real ones). Applications to frame there: storage backends, tiling pyramid, EXIF display-master, publish host-adapters, intra-Library linking, the two anno-indices, the heads-projection — each is "define the source, project thin."

## Flagged ambiguities

- **Object ownership — RESOLVED 2026-05-24:** Objects (and their Notes) are **exhibit-nested**, not a shared project pool. Consequence the user accepted: no reuse across Exhibits (same painting in two Exhibits = two copies that drift); "project-level annotation" therefore means a Note targeting the Library (`Collection` URI) or Exhibit (`Manifest` URI) — curatorial/about prose — never a reusable Object. Reverses the original "shaky-ideas" reuse principle.
- **"Project"** was used to mean both the whole Library and (in anvil) a working directory. Canonical term is **Library**.
