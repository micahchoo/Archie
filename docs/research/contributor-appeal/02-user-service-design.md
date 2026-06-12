# Contributor User Research & Service Design
<!-- thread: CONTRIBUTOR USER RESEARCH + SERVICE DESIGN — personas, JTBD, service blueprint -->
<!-- agent: 02-user-service-design | date: 2026-06-09 -->

---

## 1. Framing

This file covers:
- Contributor persona profiles (9 segments, evidence-ranked)
- Jobs-to-be-done + current tool friction per segment
- Service blueprint: discover → first contribution → collaborate → publish → share/maintain
- Feature-candidate table

All claims cite an online source URL or `relpath:line`. Locked frames from `_SHARED-CONTEXT.md` are respected; server-shaped ideas are flagged **[DEFER]**.

---

## 2. Contributor Personas

Ranked by broadening leverage (evidence strength × distance from current DH-scholar core).

---

### P1 — GLAM Exhibit Creator (Museums / Libraries / Archives)

**Representative:** A mid-career digital initiatives librarian or curator at a small–medium institution. Has collections digitised but no budget for custom dev. Needs to build a contextualised web exhibit from existing digital objects quickly — not in six months.

**Job-to-be-done:** "Publish a curated, rights-attributed, interoperable exhibit from our digitised collection without needing a developer or a server."

**Current tools & friction:**
- *Omeka.net* — good metadata UX, but $35+/yr subscription lock-in, no deep annotation layer, citation artefact at bottom of every item page hard to remove, no offline/local-first mode. (Source: American Archivist Reviews, Aug 2025 — `reviews.americanarchivist.org`)
- *CollectionBuilder* — free, static, but requires GitHub familiarity and WYSIWYG-free spreadsheet workflow; multi-step editing not friendly to non-CS staff. (same source)
- *IIIF Manifest Editor (Getty / digirati)* — server-hosted, no offline, no exhibit narrative layer.

**Technical ceiling:** can manage a GitHub repo with help; comfortable with form-based UIs; not comfortable with JSON editing or build pipelines.

**What would make them choose Archie:** No server, no subscription, IIIF-native output (so Mirador/UV can read it), rights fields (CC licence picker, requiredStatement) already mapped to standard vocabulary, export as `.archie.zip` they can archive, GitHub Pages publish in one click.

**One blocker today:** The "first import" path assumes they already have a IIIF manifest URL. Most small GLAM institutions have image files on disk, not a IIIF server. No in-browser folder→manifest path removes them from the funnel entirely.
(`Prior Art/_GAPS.md:line 1` — "In-browser, server-free folder→static-IIIF generation … NONE generate the static manifest client-side." **BLOCKER**)

---

### P2 — Educator / Classroom Instructor (Higher Ed + Secondary)

**Representative:** An art history, literature, or history instructor using primary-source images in class. Wants students to collaboratively annotate a manuscript, map, or photograph as a semester assignment. Does not want to manage accounts for 30 students on a commercial platform.

**Job-to-be-done:** "Give my students a shared annotation workspace on a visual primary source, collect their contributions, and publish the result without vendor lock-in or per-student pricing."

**Current tools & friction:**
- *Perusall* — strong adoption (0.6% of Canvas courses, 1.6% of users per U Colorado study 2025). Handles text well; weak on deep-zoom images; per-institution pricing; data export limited.
- *Hypothesis* — text-centric; no spatial region annotation on images; requires accounts.
- *Recogito Studio* — closest fit (IIIF image annotation, classroom use case named explicitly); server-hosted (Performant Software); requires sign-up; no offline-first; early 2024 release means still maturing. (Source: `performantsoftware.com/pages/recogito/`)
- Social annotation research (BJET 2024): pre-class annotations improve post-class assessment performance; collaborative annotation promotes inclusive environment for EAL students. Strong pedagogical signal that the format works — just no tool that marries it with IIIF deep-zoom + no-backend.

**Technical ceiling:** comfortable with web apps; cannot self-host; expects LMS-like simplicity.

**What would make them choose Archie:** Playground mode as a class template the instructor hands out (students open the same `.archie.zip`, annotate their own copy, submit back). Async-zip collab maps directly onto "submit your annotated copy" assignment flow. Readings = competing student interpretations of the same folio.

**One blocker today:** Identity model is local display name prompted on first import — this is *exactly right* for classroom (no account creation friction), but the async-zip collaboration loop requires students to manually exchange zips. No "class submission inbox" UX means instructor must manually import each student's zip. **[DEFER — server-shaped]** for centralised collection; the per-pair zip exchange is the v1 ceiling.

---

### P3 — Community / Citizen Archive & Local History Group

**Representative:** A volunteer-run local history society digitising 200 family photos of a historic neighbourhood. No budget, no IT staff, wants a public-facing exhibit. May use a library's scanner or Internet Archive upload. Motivated by legacy and recognition.

**Job-to-be-done:** "Put our neighbourhood photo collection online with contextual captions and credits — and keep it ours, not Google's or Facebook's."

**Current tools & friction:**
- Internet Archive Community Webs (2025 symposium, `blog.archive.org`) — good preservation, poor exhibit narrative.
- NEH Common Heritage grant digitisation days produce scans but no exhibit layer.
- Digital Preservation Coalition's 2024 Community Archives Toolkit — preservation-focused, not exhibit-authoring.
- Geni/WikiTree — genealogy-flavoured, not exhibit-shaped.
- No existing tool combines: local-first, no-cost, visual narrative exhibit, data sovereignty.

**Technical ceiling:** smartphone-comfortable; occasional laptop users; no GitHub; no JSON.

**What would make them choose Archie:** Drag-and-drop local image import (no IIIF server), Playground-to-Project one-click save, publish to GitHub Pages with no CLI. The `?src=<zip-url>` portable viewer path (CONTEXT §224) means they can host the zip on Internet Archive and share a link with zero server.

**One blocker today:** Import path currently expects IIIF URLs or existing IIIF manifests. A local image folder → auto-generated IIIF manifest in-browser is the missing first step. (Same BLOCKER as P1: `Prior Art/_GAPS.md` gap 1.)

---

### P4 — DH Scholar / Manuscript & Paleography Researcher

**Representative:** The current primary user. A postdoc or faculty member studying illuminated manuscripts, papyri, or historical maps. Has IIIF URLs from Beinecke, BnF, Wellcome. Wants competing scholarly interpretations (Readings) to coexist — the Voynich demo use case.

**Job-to-be-done:** "Publish a citable, interoperable scholarly annotation of a digitised primary source that competing researchers can fork and extend, without losing my interpretive layer to a closed platform."

**Current tools & friction:**
- Mirador — powerful viewer, but annotation authoring is minimal; no narrative structure; no exhibit layer.
- Recogito — semantic annotation (named entities, geotagging); limited to single-user or server-side collaboration; no IIIF exhibit narrative.
- Hypothesis — text-centric; no IIIF spatial annotation.
- IIIF Annotations Community Group (iiif.io) confirmed: "the ecosystem of tooling does not yet exist" for scholarly annotation at scale; lack of consistent patterns is the structural gap.

**Technical ceiling:** high — can work with JSON, IIIF manifests, GitHub. Wants standards compliance, not hand-holding.

**What Archie already solves:** Readings = IIIF AnnotationCollections (Mirador reads them free), append-only log (citable, auditable), WADM-native storage, IIIF rights/attribution fields.

**One blocker today:** No CSV import path for bulk-transcribed annotations. Scholars often have existing transcription data (e.g. from Transkribus, FromThePage) they want to layer onto an exhibit. (`_SHARED-CONTEXT.md` §Import paths noted as funnel-wideners: "IIIF pull, CSV, existing annotations.")

---

### P5 — Crowdsourced / Citizen-Science Transcription Volunteer

**Representative:** A retired teacher contributing 2–4 hours/week to a historical document transcription project (Shakespeare's World, Smithsonian Transcription Center model). Motivated by connection to content, not by technical tools.

**Job-to-be-done:** "Contribute to transcribing or contextualising historical documents in a way that feels meaningful, with immediate visible impact, without needing to understand the infrastructure."

**Current tools & friction:**
- FromThePage + Transkribus AI Assist (2024 collaboration) — strong transcription UX; locked to their platform; data goes to the institution's CMS with known integration friction (metadata field character limits, bulk import problems). (Source: `startwords.cdh.princeton.edu/issues/2/datas-destinations/`)
- Zooniverse — page-level granularity; volunteers can transcribe as little as a line (proven to increase participation). But annotation is task-defined, not exhibit-narrative.
- Key research finding: "Be up front with volunteers about ambitions for the data and current limitations" — volunteers disengage when their work disappears into institutional black boxes. (Princeton Startwords 2021)

**Technical ceiling:** web-comfortable; expects near-zero onboarding friction; needs social/community signal that their work matters.

**What would make them choose Archie:** A template-based "transcription exhibit" that lets a GLAM coordinator set up the project (P1 use case) and share a Playground link for volunteers to annotate one folio at a time. Their annotation zip comes back to the coordinator via async-zip import.

**One blocker today:** No "task queue" or "claim a page" UX — the async-zip model assumes peer collaboration between known contributors, not a volunteer pool. The coordinator flow for managing 50 volunteers' submissions has no UX. **[DEFER — server-shaped for the queue management]**; the first-contribution zip exchange is v1-viable for small projects.

---

### P6 — Journalist / Visual Storyteller

**Representative:** An investigative journalist or documentary photographer creating a visual essay that contextualises archival images with reporting notes — annotating historic photos with present-day evidence.

**Job-to-be-done:** "Annotate a set of archival images with my reporting, publish as a shareable interactive essay, and maintain control over my data and credentials."

**Current tools & friction:**
- ThingLink — proprietary; exports to vendor platform; subscription pricing.
- StoryMapJS / Knight Lab — map-centric; no deep-zoom image annotation.
- Panel-truck — IIIF + image storytelling, static JSON; no authoring UI (developer tool only).
- Shorthand — polished narrative; no spatial annotation layer; SaaS lock-in (ToS: company can use/modify your content, per American Archivist Reviews 2025).
- No existing tool combines: deep-zoom spatial annotation + narrative exhibit + data ownership + shareable URL.

**Technical ceiling:** comfortable with web apps; moderate with file management; not comfortable with JSON or CLI.

**What would make them choose Archie:** `?src=<zip-url>` portable viewer (share exhibit via hosted zip link, no server needed), data sovereignty (zip-as-canonical-file = journalist keeps their archive), narrative layout with Section/prose spine telling the story alongside annotated images.

**One blocker today:** No mechanism to load IIIF objects from arbitrary external URLs without a IIIF server — a photo journalist's images are JPEGs on disk or in cloud storage, not IIIF manifests. Same local-image import blocker as P1/P3.

---

### P7 — Genealogy / Family History Researcher

**Representative:** A semi-retired person building a documented family history around digitised photos, letters, and census documents. Wants to create an exhibit-style narrative to share with relatives — more story than database.

**Job-to-be-done:** "Build a richly annotated family photo exhibit — who is in each photo, what year, what the context was — and share it with family members who aren't on Ancestry."

**Current tools & friction:**
- Ancestry — subscription; proprietary lock-in; photo annotation limited to face-tagging; data not exportable in open formats.
- Family Tree Maker 2024 — desktop app; photo repair tools; no exhibit layer; not web-publishable.
- Geneanet / WikiTree — genealogy-tree model, not exhibit-narrative model.
- No tool lets them annotate photo regions ("this person is Aunt Rosa"), structure a narrative, and publish a standalone site with zero subscription.

**Technical ceiling:** smartphone and laptop user; comfortable with email and cloud storage; not comfortable with GitHub.

**What would make them choose Archie:** Local image import (drag photos from desktop), simple region-annotation with name/date/note, narrative layout to tell the story, publish as `?src=<zip-url>` link to share with family. The no-account, no-subscription, data-sovereignty posture is the differentiator.

**One blocker today:** GitHub Pages publish requires a GitHub account and basic git familiarity — too high a ceiling. The `?src=<zip-url>` path (hosting zip on Google Drive/Dropbox and sharing URL) is the viable v1 path for this segment; no CLI required.

---

### P8 — Art / Photography Portfolio Creator

**Representative:** An emerging photographer or visual artist wanting to publish a contextualised portfolio — not just a gallery grid, but images with artist statements, process notes, or curated series narratives.

**Job-to-be-done:** "Present my work with my own voice and context, structured as a curated exhibit I own — not locked into Squarespace's templates or Instagram's algorithm."

**Current tools & friction:**
- Squarespace/Cargo/Format — strong visual design; no deep annotation layer; subscription lock-in; data not portable.
- Behance/Adobe Portfolio — platform-dependent; no spatial annotation.
- Custom Notion/Squarespace hybrid — common workaround; no interoperability; no annotation.

**Technical ceiling:** design-savvy; file-management comfortable; not GitHub-comfortable; expects visual authoring.

**What would make them choose Archie:** WYSIWYG exhibit builder, narrative layout, ability to annotate regions of a photo with process notes, and publish as a shareable zip-link (data stays theirs). The "no lock-in" and IIIF-interoperability are table stakes for sophisticated users who've been burned before.

**One blocker today:** Studio UI must be visually polished enough to meet a designer's standards — a rough or dense UI is a rejection signal for this audience. Currently an unvalidated risk (see v1 invention inventory in CONTEXT.md: "prototype-validation gate" for all invented patterns).

---

### P9 — Map / GIS Storytelling

**Representative:** A geographer, urban planner, or local historian wanting to annotate historic maps — overlaying present geography on past cartography, marking sites of events, building a map-narrative exhibit.

**Job-to-be-done:** "Annotate a digitised historic map with spatial markers and a narrative, and publish it without an ArcGIS licence or a GIS background."

**Current tools & friction:**
- ArcGIS StoryMaps — powerful; requires Esri subscription ($500+/yr for organisations); steep learning curve; vendor lock-in.
- StoryMapJS (Knight Lab) — free; limited to modern map tiles + media pins; no deep-zoom historic map annotation.
- Panel-truck — IIIF-aware, supports tiled web maps; developer-only (JSON config, no authoring UI).
- Odyssey (Carto) — narrative maps; server-dependent; no deep-zoom annotation.

**Technical ceiling:** GIS-adjacent but not GIS-expert; can use web apps; not comfortable with CLI or JSON config.

**What would make them choose Archie:** Historic maps are already served via IIIF (BnF, David Rumsey, NYPL) — Archie can ingest them directly. Region annotation (xywh= selector) + narrative Sections + the Summary Panel = a working map-narrative exhibit. No additional geo tooling needed for the basic case.

**One blocker today:** No geo-coordinate metadata for annotations (field-studio's `PropertyDefinition` includes `geocoordinate` type — `Prior Art/06-authoring-cms.md:36` — but Archie has not adopted it). Map storytelling is viable without it for IIIF-served maps, but the advanced use case (linking annotations to lat/lon) is deferred.

---

## 3. Service Blueprint — Non-Specialist Contributor Journey

Stages: **Discover → First Contribution → Collaborate → Publish → Share / Maintain**

For each stage: what happens, where Archie's current decisions help or hurt, friction points, and drop-off risks.

---

### Stage 1 — Discover

| Touchpoint | What happens | Archie helps | Archie hurts / gap |
|---|---|---|---|
| Web search / social share | Contributor finds Archie via a shared `?src=<zip-url>` exhibit link | Portable Viewer (`?src=`) is a passive discovery vector — every shared exhibit is a funnel entry | No SEO for the concept "make a free annotated exhibit" — discoverability is entirely word-of-mouth |
| Peer recommendation | DH librarian mentions it at a workshop | IIIF-native = credible in GLAM/DH circles | Unknown to non-DH segments (educators, genealogists, journalists) |
| Landing page | Visitor arrives at Archie landing | "Try a template" Playground door → 60 seconds to first annotation (locked frame) | If templates are DH-flavour only (manuscripts), P3/P6/P7/P8 don't recognise themselves |
| **Drop-off risk** | Segment-misaligned template | — | **HIGH: If the only Playground template is a Voynich manuscript, educators and genealogists leave immediately.** |

**Archie decision that helps:** Two-door landing (Playground vs Project) removes the "sign up before you see anything" barrier that drops non-specialists on every competing platform.

**Feature gap:** Multiple Playground templates by segment (family photos, classroom exercise, map exhibit, photo essay) — each is just a different pre-loaded `.archie.zip` with guidance notes baked in.

---

### Stage 2 — First Contribution

| Touchpoint | What happens | Archie helps | Archie hurts / gap |
|---|---|---|---|
| Template load | Contributor opens Playground template | Ephemeral OPFS — nothing to configure | Template loads a manuscript. P3/P6/P7 see content they can't relate to |
| First annotation | Draws a region, types a note | Annotorious rect tool (adopted pattern) + popover form | Identity prompt on first import: correct timing (not at launch), but "first import" implies importing a file — in Playground mode there is no import yet |
| Import own content | Wants to annotate their own image | IIIF pull path works for GLAM-sourced objects | **LOCAL IMAGE IMPORT MISSING.** P1/P3/P6/P7/P8/P9 all hit this wall. No in-browser folder→IIIF generation. `Prior Art/_GAPS.md:1` — BLOCKER. |
| Understanding the model | Contributor encounters "Reading", "Section", "Note" | Vocabulary grounded in real concepts (not annotation-ese) | "Reading" as a concept requires 1–2 sentences to explain to non-DH users; tooltip/onboarding note needed |
| **Drop-off risk** | Local image import failure | — | **CRITICAL: The single largest non-specialist drop-off. 6 of 9 personas cannot contribute their own content without local image import.** |

**Archie decision that helps:** Playground mode + "nothing is saved" honest banner eliminates commitment anxiety. 60-seconds-to-first-annotation target.

**Archie decision that hurts:** Identity prompt fires "on first import" — in Playground mode where there may be no import, the timing needs rethinking for pure-Playground contributors.

---

### Stage 3 — Collaborate

| Touchpoint | What happens | Archie helps | Archie hurts / gap |
|---|---|---|---|
| Share for review | Contributor exports `.archie.zip`, emails to collaborator | Async-zip model (locked decision) — works offline, no server, no accounts | Collaborator must know to open the zip in Archie — no discoverable "open in Archie" handler |
| Import returned zip | Receives annotated zip back, imports | Silent DAG fast-forward + summary panel ("Synced 42 notes from Alice") | Summary panel is an invention (CONTEXT.md: "prototype-validation gate required") — does a non-specialist understand what "3 need your decision" means? |
| Conflict resolution | Conflict card appears for divergent notes | Inline conflict-card in WADM form (locked decision) | Conflict card is an invention — the hardest mental model for non-specialists who expect "overwrite" not "merge" |
| Multi-contributor (>2 people) | Classroom instructor collects 30 student zips | — | **NO BATCH IMPORT UX.** Each zip must be manually imported. Classroom and crowdsourcing segments (P2, P5) hit a hard ceiling at ~5 contributors. |
| **Drop-off risk** | Collaboration ceiling at ~3–4 zip exchanges | — | **HIGH for P2/P5; manageable for P1/P4.** |

**Archie decision that helps:** Async-zip collab is the right primitive for small peer groups — no server, no accounts, no version-lock-in. Works for P1 (GLAM peer review), P4 (scholarly collab), P6 (editor/photographer pair), P7 (family member pair).

**Archie decision that hurts (at scale):** No batch import for classroom/crowdsourcing use. Deferred as server-shaped, correctly — but the v1 ceiling must be communicated in UI ("designed for teams of 2–6").

---

### Stage 4 — Publish

| Touchpoint | What happens | Archie helps | Archie hurts / gap |
|---|---|---|---|
| Rights & attribution | Contributor fills in rights fields before publishing | License picker (CC/RightsStatements.org), requiredStatement, provider fields (locked decision) | Fields are at Library + Exhibit + Object level — non-specialists may not understand the three-level cascade; "use parent's value" opt-in helps but needs a clear explanation |
| GitHub Pages publish | "Publish to GitHub Pages" action | One-click push via browser OAuth (locked) | GitHub account required — hard ceiling for P3, P7, P8. Not all non-specialists have or want a GitHub account. |
| Portable share | "Publish locally" → download `.archie.zip` → host on GDrive/Dropbox → share `?src=<url>` | `?src=<zip-url>` path (CONTEXT §224) — the zero-GitHub publish path | `?src=<zip-url>` is "cite-with-caveats" (CONTEXT §224): link breaks if host moves. Non-specialists won't understand this risk. Needs a clear warning. |
| **Drop-off risk** | GitHub publish ceiling for non-technical users | — | **MEDIUM: `?src=` path is the real v1 publish path for P3/P7/P8; GitHub path is the v1 path for P1/P4.** UI must foreground `?src=` equally, not as an afterthought. |

**Archie decision that helps:** Three persistence configs presented as one "Project" model — contributor never sees browser capability difference. Keeps mental model simple.

---

### Stage 5 — Share / Maintain

| Touchpoint | What happens | Archie helps | Archie hurts / gap |
|---|---|---|---|
| Sharing the exhibit | Sends `?src=<url>` link or GitHub Pages URL | Portable Viewer works for both paths | `?src=` link fragility: link breaks if contributor moves the zip. Non-specialist won't proactively re-share. |
| Embedding | Embeds exhibit in another site | IIIF interoperability — Mirador can consume the published manifest | No `<iframe>` embed code generated by Studio today; embedding requires knowing the manifest URL |
| Updating | Makes new annotations, re-publishes | Append-only log + re-publish | No "what changed since last publish" diff surface; re-publishing is opaque to non-specialists |
| Discovering others | Finds other Archie exhibits | — | **No Library discovery beyond the Library owner's own published site.** Cross-library discovery is explicitly deferred (multi-library = NO, locked). Isolation is a feature for data sovereignty but a barrier for community discovery. |
| **Drop-off risk** | Link rot on `?src=` exhibits | — | **LOW-MEDIUM: Risk is real but manageable. Core issue is communicating durability expectations clearly at publish time.** |

---

## 4. Feature-Candidate Table

| Feature | Contributor audience | Evidence | Broadens because… | Fits locked frames? | Est. effort | Priority |
|---|---|---|---|---|---|---|
| **Local image folder → in-browser IIIF manifest generation** | P1 GLAM, P3 Community, P6 Journalist, P7 Genealogy, P8 Portfolio | `Prior Art/_GAPS.md:1` — confirmed BLOCKER, no prior art; `_SHARED-CONTEXT.md` import paths as funnel-wideners | Removes the single largest non-specialist drop-off (6/9 personas blocked by IIIF-URL-only import); opens the tool to everyone who has image files on disk | **Y** — server-free, client-side (FSA/OPFS); aligns with locked "no backend" | Large (confirmed prior art gap — biiif algorithm must be reimplemented against FSA) | **P0 — gate-blocker** |
| **Segment-diverse Playground templates** (family photos, map exhibit, classroom exercise, photo essay) | P2 Educator, P3 Community, P6 Journalist, P7 Genealogy, P8 Portfolio | Landing-page templates are the difference between "I see myself here" and "this is for specialists" — direct evidence from every platform comparison (Omeka, Scalar, Recogito all suffer from DH-first framing) | Replaces single-segment (DH/manuscript) signal with multi-segment welcome; templates are low-effort, high-leverage first impressions | **Y** — templates are pre-loaded `.archie.zip` files; no new architecture | Small (content authoring + zip packaging) | **P1 — high leverage, low cost** |
| **`?src=<zip-url>` publish path surfaced as primary for non-GitHub users** | P3 Community, P7 Genealogy, P8 Portfolio, P6 Journalist | GitHub account required for GH Pages publish creates hard ceiling for non-technical users (CONTEXT §224 already has the mechanism); American Archivist Reviews 2025: none of the compared platforms offer zero-CLI publishing | Opens Archie to the majority of non-specialist contributors who will never create a GitHub account; the mechanism exists — just needs UX elevation | **Y** — `?src=` path already in CONTEXT (§224); needs UI work, not new architecture | Small–Medium (UX elevation + durability warning copy) | **P1 — mechanism exists, needs surfacing** |
| **Annotation template presets by task type** (transcription note, identification label, provenance citation, reading interpretation) | P1 GLAM, P2 Educator, P4 DH Scholar, P5 Transcription volunteer | `Prior Art/06-authoring-cms.md:28` — field-studio's `AnnotationTemplateService` is PURE and liftable; Zooniverse granular transcription increases participation breadth; IIIF Annotations Community Group: "UX implementation cookbooks" are an explicit gap | Lowers cognitive load for first-time contributors who don't know what a "WADM TextualBody" is; maps onto task-specific language each segment already uses | **Y** — annotation template system is planned; field-studio donor confirmed | Medium (WADM form integration + preset authoring) | **P2 — high DX value across segments** |
| **Async-zip collaboration summary panel onboarding copy** (explains "Synced 42 notes · 3 need your decision" to non-specialists) | P1 GLAM, P2 Educator, P3 Community | Collaboration summary panel is a confirmed invention (CONTEXT.md v1 invention inventory) requiring prototype validation; non-specialists expect "overwrite", not "merge" — mismatch is a confidence killer | The async-zip model is the right primitive for non-server collab; clear onboarding copy + an approachable conflict UI is the difference between "I get it" and "I broke it" | **Y** — copy + UI framing, not architecture | Small (copy + conflict card language; no new architecture) | **P2 — low effort, high trust-building value** |
| **CSV import for bulk annotations** (tab/comma-separated: image URL or manifest + region + text + reading) | P4 DH Scholar, P5 Transcription volunteer, P1 GLAM | `_SHARED-CONTEXT.md` import paths named as funnel-wideners; FromThePage/Transkribus produce exportable transcription data; Princeton Startwords 2021: institutional CMS integration of crowdsourced data is a known friction point | Opens Archie as the "final-mile exhibit layer" on top of existing crowdsourcing workflows (FromThePage → CSV → Archie exhibit) — a new use case with zero overlap with current functionality | **Y** — import transforms to WADM append-only log; no server needed | Medium–Large (CSV→WADM mapping + conflict resolution for bulk) | **P3 — high value for DH+GLAM; deferred pending P0** |
| **Embed code generator** (`<iframe>` snippet for the portable viewer pointed at `?src=` URL) | P1 GLAM, P6 Journalist, P8 Portfolio | Omeka, Scalar, Exhibit.so all offer embeddability as a feature (American Archivist Reviews 2025); journalists embed interactive content in articles; no surveyed IIIF exhibit tool generates embed code | Makes Archie exhibits linkable from institutional websites, news articles, and portfolio pages without the reader needing to know IIIF — massive multiplier on discoverability | **Y** — a static iframe snippet; no server; the viewer already works via `?src=` | Small (one-line snippet generator in publish UI) | **P3 — discoverability multiplier** |

---

## 5. Key Tension: What Archie Already Gets Right for Broadening

The async-zip collaboration model, the Playground/Project split, and the no-account identity prompt are each genuinely contributor-friendly design decisions that no competing tool makes. The **bottleneck is not the collaboration model but the import funnel**: the majority of non-specialist contributors arrive with image files, not IIIF manifests. Until local image import exists, the "IIIF-only" entry requirement silently filters out the six broadest-base personas before they reach the annotation canvas.

**The single biggest service-design gap:** No local image import → in-browser IIIF manifest path. Every non-specialist contributor hits this wall before the Playground tour is even over. (`Prior Art/_GAPS.md:1` — confirmed BLOCKER, zero prior art, biiif algorithm must be reimplemented client-side.)

---

## 6. Deferred Seeds (server-shaped — flag only, do not build in v1)

- **Classroom submission inbox** — centralised collection of student annotation zips. Requires a server to receive uploads. P2 Educator ceiling.
- **Volunteer task queue** ("claim a folio", track completion) — crowdsourcing at scale (P5). Requires server state.
- **Cross-library discovery / exhibit index** — explicitly locked out by "one Library = one site" frame. Correct for data sovereignty; revisit post-v1.
- **Batch zip import** — 30 student submissions at once. Technically feasible client-side (zip-of-zips) but UX complexity is high; treat as v1.1.

---

## Sources

**Online:**
1. IIIF Annotations Community Group — https://iiif.io/community/groups/annotations/
2. American Archivist Reviews: Free and Low-Cost Online Exhibit Platforms (Aug 2025) — https://reviews.americanarchivist.org/2025/08/06/technology-roundup-free-and-low-cost-online-exhibit-platforms/
3. Princeton Startwords: Data's Destinations — Crowdsourced Transcription Data Management (2021) — https://startwords.cdh.princeton.edu/issues/2/datas-destinations/
4. Performant Software: Recogito Studio — Collaborative IIIF Annotation for the Classroom (2024) — https://www.performantsoftware.com/pages/recogito/
5. Wiley BJET 2024: Social annotation tool improving student engagement — https://bera-journals.onlinelibrary.wiley.com/doi/10.1111/bjet.13403
6. U Colorado OIT: Assessment of Social Annotation Tools Hypothesis and Perusall (2025) — https://oit.colorado.edu/services/consulting-professional-services/academic-technology-initiatives-team/needs-assessments/social-annotation-tools
7. Internet Archive Community Webs — https://blog.archive.org/tag/community-archives/
8. Digital Preservation Coalition Toolkit for Community Archives (Nov 2024) — https://www.dpconline.org/news/launch-dp-toolkit-community-archives
9. IIIF: Activating Digital Assets for Accessibility and Creativity (2024 PDF) — https://agnes.queensu.ca/site/uploads/2024/12/IIIF_-Activating-Digital-Assets-for-Accessibility-and-Creativity_FINAL.pdf
10. Transkribus + FromThePage AI Assist partnership — https://blog.transkribus.org/en/fromthepage-enhanced-transcription-platform-with-transkribus-api
11. OAH: Crowdsourcing Digital Public History — https://www.oah.org/tah/extras/crowdsourcing-digital-public-history/
12. Reviews in DH: Recogito review — https://reviewsindh.pubpub.org/pub/recogito
13. Panel-truck (IIIF map storytelling) — https://www.allthatgeo.com/story-map-knight-lab/
14. AVAnnotate (AV annotation for educators, Fall 2025 workshops) — https://guides.lib.utexas.edu/digital-humanities-workshops/fall-2025

**On-disk (cited):**
15. `Prior Art/_GAPS.md:1` — BLOCKER: in-browser server-free folder→static-IIIF generation, no prior art
16. `Prior Art/_GAPS.md` gap 2 — GitHub OAuth push from static SPA, zero prior art
17. `Prior Art/12-accessibility.md` — screen-reader semantics for zoom regions: pure greenfield; alt-text as WADM body: unbuilt anywhere
18. `Prior Art/06-authoring-cms.md:28` — field-studio `AnnotationTemplateService` PURE and liftable
19. `Prior Art/06-authoring-cms.md:36` — field-studio `PropertyDefinition` includes `geocoordinate` type
20. `Prior Art/06-authoring-cms.md:68` — Gaps: dual-mode serverless filesystem abstraction unsolved
21. `Prior Art/10-state-mutation-patterns.md` — no serverless local-first sync engine for WADM, zip/OAuth-push model has zero precedent
22. `CONTEXT.md §182` — Contributors = derived aggregate of lastEditor + manual additions
23. `CONTEXT.md §224` — `?src=<zip-url>` portable viewer: "cite-with-caveats"; Publish stays citation gold path
24. `_SHARED-CONTEXT.md` — locked frames, output contract, import paths as funnel-wideners
