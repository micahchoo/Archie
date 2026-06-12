# Competitor / Comparator Teardown — Contributor Lens
**Thread:** 01 — How platforms acquire, onboard, and retain contributors; where they lock them in; what Archie can win.
**Date:** 2026-06-09
**Sources:** 22 online (web search + ctx_fetch_and_index) · 6 on-disk prior-art files

---

## 1. Platform-by-Platform Teardown

### 1.1 Exhibit.so
| Dimension | Finding |
|-----------|---------|
| **Onboarding / time-to-first-value** | ~3 minutes: visit exhibit.so/exhibits/create, fill one form, paste a IIIF manifest URL, click "Add Item", zoom to region, click "+", type text. No account required for free tier. ([iiif-workshop-exhibit-storiiies]) |
| **Collaboration model** | None in free tier. Custom (paid) instance adds a "My Exhibits" page + Google Analytics. Duplicate/remix button lets others fork a published exhibit. |
| **Import paths** | IIIF manifest URL (primary). Custom/paid tier: direct image + 3D model upload → Exhibit generates IIIF for you. YouTube video embed. No CSV, no annotation import. |
| **Shareability / discoverability** | Shareable URL per exhibit; iframe embed code generated; scrollytelling / slides / kiosk / quiz presentation modes. No oEmbed endpoint, no og-tags surfaced in docs. ([exhibit-so-iiif-docs]) |
| **Lock-in** | All data lives on Exhibit.so's Firebase/Vercel. Free tier = no export, no data portability. Custom instance requires Mnemoscene setup. Exhibits cannot be moved to another host without re-creating. |
| **Broadening feature** | Single URL + paste = instant exhibit from ANY IIIF repository (LoC, V&A, etc.) — zero installation. |
| **Archie win** | Exhibit.so is closer than any comparator (IIIF-native, zero-install) but has zero data portability. Archie's `.archie.zip` as canonical file + GitHub Pages publish = same zero-install appeal with full portability. |

Sources: [exhibit.so/docs/iiif](https://exhibit.so/docs/iiif), [nebulousflynn.substack.com intro](https://nebulousflynn.substack.com/p/a-short-introduction-to-exhibitso), [IIIF workshop](https://training.iiif.io/dhsi/day-three/exhibit.html)

---

### 1.2 Storiiies Editor (Cogapp)
| Dimension | Finding |
|-----------|---------|
| **Onboarding / time-to-first-value** | ~2 minutes: go to storiiies-editor.cogapp.com, fill a title form, zoom viewer to region, click "Add new", type annotation, click share. No account. ([iiif-workshop-exhibit-storiiies]) |
| **Collaboration** | None. Single-author, single-session. No saved state between sessions — stories are server-stored at a URL. |
| **Import paths** | IIIF manifest URL only. One manifest, one story. |
| **Shareability** | Shareable viewer URL; iframe embed. No oEmbed. |
| **Lock-in** | Storiiies server stores the story. URL is opaque. No JSON/WADM export available to contributor. Full platform lock-in. |
| **Broadening feature** | Fastest IIIF story path in the ecosystem — no account, no install, sub-5-minute first story. |
| **Archie win** | Same speed, but Archie produces portable WADM-on-disk output. Storiiies contributor who returns after server goes down loses everything; Archie contributor owns the zip. |

Sources: [cogapp.com/r-d/storiiies](https://www.cogapp.com/r-d/storiiies), [IIIF workshop](https://training.iiif.io/dhsi/day-three/exhibit.html)

---

### 1.3 Omeka S
| Dimension | Finding |
|-----------|---------|
| **Onboarding / time-to-first-value** | High friction: requires server install (PHP/MySQL) or hosted plan (~$30/mo), admin account, site creation, then item/media upload before any exhibit can be built. Institutional or developer-gated. ([omeka.org/s](https://omeka.org/s/)) |
| **Collaboration** | Multi-user with role hierarchy: Global Admin, Site Admin, Editor, Reviewer, Author. Per-site roles. Strong for institutions, opaque for small teams. |
| **Import paths** | CSV Import module, Zotero import, file upload, API. No native IIIF manifest drag-in to date. |
| **Shareability** | Standard HTML pages; institution controls SEO/og-tags. No oEmbed. Embeddable only via iframe. |
| **Lock-in** | Server + MySQL database. Export path = ZIP of media + CSV of metadata. Data is theoretically portable but practically institution-bound. |
| **Broadening feature** | Module ecosystem (50+ modules) means librarians/archivists can extend without coding. Training specialist added Oct 2024 signals push to widen non-developer base. ([omeka.org newsletter Oct 2024](https://omeka.org/news/2024/10/29/newsletter-v1-4/)) |
| **Archie win** | No server. No sysadmin. Single-person research group viable on day 1. |

---

### 1.4 Scalar (USC)
| Dimension | Finding |
|-----------|---------|
| **Onboarding / time-to-first-value** | Medium: free account at scalar.me, create a "book", import media via URL or file upload, add a page. ~15 minutes to first published page. |
| **Collaboration** | Multi-author: owner invites co-authors; version history per-page; blog-style threaded comments (anonymous or attributed, auto-approve or moderated). Entire class can co-author. ([scalar.me](https://scalar.me/anvc/scalar/)) |
| **Import paths** | Zotero, Internet Archive, Flickr, YouTube, Vimeo via media adapters. No IIIF. CSV import not native. |
| **Shareability** | Full HTML pages with SEO. Public URL. No oEmbed endpoint. Embed via iframe. |
| **Lock-in** | USC-hosted server; data stored in MySQL. JSON-LD export exists but requires developer interpretation. Migrating away is non-trivial. |
| **Broadening feature** | "Every page is a node" non-linear narrative model + threaded reader commentary = broadens to humanists who think in essays rather than slideshows. |
| **Archie win** | IIIF-native (Scalar has zero IIIF). Annotations are portable WADM, not proprietary. Multi-media depth (OSD deep-zoom vs Scalar's flat image viewer). |

Sources: [scalar.me](https://scalar.me/anvc/scalar/), [Digital Rhetoric Collaborative](https://www.digitalrhetoriccollaborative.org/2017/11/27/scalar-open-source-authoring-for-born-digital-scholarship/)

---

### 1.5 Knight Lab StoryMapJS / Timeline / Juxtapose
| Dimension | Finding |
|-----------|---------|
| **Onboarding / time-to-first-value** | StoryMapJS: ~5 min with Google account (Google Sheets-backed). Without Google account: must hand-edit JSON config + self-host. Very accessible for Google users; wall for everyone else. |
| **Collaboration** | Google Sheets = any collaborator with sheet access can edit. No role permissions — edit = admin. |
| **Import paths** | Google Sheets for StoryMap. No IIIF. Juxtapose = two image URLs. Timeline = Google Sheets. |
| **Shareability** | iframe embed code generated; shareable URL. No oEmbed. No og-tags auto-generated. |
| **Lock-in** | Google account + Google Sheets. Knight Lab servers host the rendering JS. JSON can be extracted but viewer depends on Knight Lab CDN. |
| **Broadening feature** | Zero-install for Google users; template-based JSON for advanced users wanting custom map tiles. |
| **Archie win** | No Google dependency. IIIF deep-zoom vs static map tiles. WADM export vs proprietary JSON. |

Sources: [storymap.knightlab.com](https://storymap.knightlab.com/), [knightlab.zendesk.com](https://knightlab.zendesk.com/hc/en-us/articles/211633926-Can-I-use-StoryMapJS-on-Wordpress)

---

### 1.6 Juncture (JSTOR Labs)
| Dimension | Finding |
|-----------|---------|
| **Onboarding / time-to-first-value** | ~10 min: create GitHub account + repo, write Markdown with Juncture tags, point juncture-digital.org at the file. Drag-and-drop image insertion available. Git-native but not zero-git-knowledge. |
| **Collaboration** | GitHub collaboration model: PR-based, branch-based. No bespoke role system. |
| **Import paths** | IIIF images via tag; Wikidata entities; Flickr/JSTOR images via helper service. No annotation import. |
| **Shareability** | GitHub Pages publish; public URL. Zero-build client-side render → **poor SEO** (no static HTML per essay). ([Prior Art/09: `juncture/index.html:1-30`]) |
| **Lock-in** | GitHub dependency for storage. Juncture CDN (jsdelivr) for rendering engine. No offline mode. |
| **Broadening feature** | Any Markdown file in any GitHub repo becomes a visual essay with zero extra hosting. |
| **Archie win** | Archie produces pre-rendered static HTML (Astro SSG) → good SEO. Archie annotations are WADM on disk, not invisible JS state. |

Sources: [github.com/juncture-digital/juncture](https://github.com/juncture-digital/juncture), Prior Art `09-web-publishable-serverless.md:juncture`

---

### 1.7 Recogito / Recogito Studio
| Dimension | Finding |
|-----------|---------|
| **Onboarding / time-to-first-value** | ~5 min: free account at recogito.pelagios.org, upload document/image, click-drag to annotate text or mark regions, invite collaborators via username search. ([recogito.pelagios.org/help/tutorial](https://recogito.pelagios.org/help/tutorial)) |
| **Collaboration** | Write access (annotate + view) or Admin access (invite + metadata edit). Strong peer-scholar model. Recogito Studio (2025) extends to IIIF + TEI. |
| **Import paths** | Upload images/PDFs/TEI; IIIF in Studio version. Named-entity reconciliation with Wikidata/Pleiades. No CSV annotation import. |
| **Shareability** | Public project URL; download annotations as CSV/JSON-LD/RDF. No iframe embed code. |
| **Lock-in** | Pelagios server (original); self-hostable. Annotations are downloadable W3C JSON-LD — **best export story in class**. But original Recogito sun-setting; Studio is separate product. |
| **Broadening feature** | Named-entity tagging → linked data output. Broadens to historians/geographers doing semantic annotation without Linked Data expertise. |
| **Archie win** | Deep-zoom image annotation (OSD) + audio/video annotation — Recogito targets text primarily. Archie's Readings model (competing scholarly interpretations coexist as IIIF AnnotationPages) is structurally absent from Recogito. |

Sources: [recogito.pelagios.org](https://recogito.pelagios.org/), [recogitostudio.org](https://recogitostudio.org/), [Carleton tutorial 2025](https://hh2025f.amason.sites.carleton.edu/blog/interactive-annotations-with-recogito-tutorial/)

---

### 1.8 Hypothes.is
| Dimension | Finding |
|-----------|---------|
| **Onboarding / time-to-first-value** | ~2 min: install browser extension or use via.hypothes.is proxy URL → annotate any web page. For LMS: instructor activates plugin, students annotate in-course with no extra login. |
| **Collaboration** | Public / private groups; per-annotation visibility. LMS gradebook integration (Canvas/D2L/Moodle). No image annotation — text + PDF only. |
| **Import paths** | Any URL (text/PDF). No IIIF, no image, no CSV. |
| **Shareability** | LMS embed (iframe). Annotation permalink. No oEmbed. |
| **Lock-in** | Hypothes.is server stores all annotations. No export path for annotation text without API access. Full vendor lock-in; institutional licensing. |
| **Broadening feature** | Browser extension + LMS plugin = broadest non-specialist reach in the ecosystem. Zero workflow change for students/instructors. |
| **Archie win** | Image annotation (Hypothesis doesn't do images). IIIF portability. No LMS dependency — works in any static page. |

Sources: [web.hypothes.is](https://web.hypothes.is/), [hypothes.is LMS FAQ](https://web.hypothes.is/help/lms-faq/)

---

### 1.9 Canopy IIIF
| Dimension | Finding |
|-----------|---------|
| **Onboarding / time-to-first-value** | ~30 min: clone repo, edit `config/canopy.json` with a IIIF Collection URL, run `npm install && npm run dev`. Markdown files for editorial context. GitHub Pages deploy via Actions. No-code path exists via StackBlitz fork. ([canopy-iiif.github.io](https://canopy-iiif.github.io/docs/)) |
| **Collaboration** | Git/GitHub PR model. No bespoke authoring UI. |
| **Import paths** | IIIF Collection as data source — entire collection auto-browseable. Markdown for editorial layers. |
| **Shareability** | Static site (Next.js); full SEO; og-tags; good first-paint. Deployed to any static host. |
| **Lock-in** | None — entirely open source, static output. IIIF standard data. |
| **Broadening feature** | Librarians/archivists can spin up a browseable digital collection site from an existing IIIF Collection in one config line — no custom dev required. |
| **Archie win** | Archie adds per-region annotation authoring, WADM output, audio/video annotation — Canopy is read-only browse/search. Archie and Canopy could be complementary: Canopy for gallery, Archie for annotated exhibit layer. |

Sources: [canopy-iiif.github.io/docs](https://canopy-iiif.github.io/docs/), [zenodo.org Canopy](https://zenodo.org/records/12579368)

---

### 1.10 Mirador (annotation editing)
| Dimension | Finding |
|-----------|---------|
| **Onboarding / time-to-first-value** | High friction for annotation authoring: requires mirador-annotation-editor plugin installation + a storage backend (SimpleAnnotationServer or similar). No zero-config annotation save. |
| **Collaboration** | Mirador Multi-User (MMU) extension: real-time annotation sharing; per-user assignment of annotations; 4 roles (Owner/Editor/Transcriber/Reader pattern). Requires server. |
| **Import paths** | External IIIF P2/P3 manifests; W3C annotation lists loaded from URLs. |
| **Shareability** | Content State URL (base64 encoded IIIF viewer state). Embed via config-object mount. No custom element. ([Prior Art 18: `universalviewer` embed pattern]) |
| **Lock-in** | Plugin-dependent. Annotation storage is backend-determined. No portable single-file output. |
| **Broadening feature** | mirador-annotation-editor quill editor + tag autocompletion + comment templates — broadens to non-technical scholars who need structured annotation. |
| **Archie win** | Archie has the annotation editor built-in with no backend. OPFS/FSA storage is serverless-native. WADM on disk with no extra infrastructure. |

Sources: [projectmirador.org](https://projectmirador.org/), [mirador-multi-user.com](https://www.mirador-multi-user.com/), Prior Art `18-embedding-ecosystem.md`

---

### 1.11 Universal Viewer
| Dimension | Finding |
|-----------|---------|
| **Onboarding / time-to-first-value** | Viewer only — not an authoring tool. Embed via iframe + embed-script builder. ([Prior Art `18-embedding-ecosystem.md`: `BaseExtension.ts:830-852`]) |
| **Import paths** | IIIF Content State URL as single entry point — one attribute carries manifest or content-state blob. |
| **Shareability** | iframe embed code generated in-viewer; Content-State deep-link URL. |
| **Lock-in** | None — open source, self-hostable. |
| **Broadening feature** | `<uv-app iiif-content="…">` custom element — any CMS/HTML page can embed with one tag. |
| **Archie win** | Archie is an authoring+viewing stack. UV only views. Archie's Viewer can adopt the same `<archie-viewer iiif-content="…">` custom-element pattern (Axis 18 prior art confirms this). |

Source: Prior Art `18-embedding-ecosystem.md:uv-shared-module/BaseExtension.ts:830-852`

---

### 1.12 FromThePage (crowd transcription)
| Dimension | Finding |
|-----------|---------|
| **Onboarding / time-to-first-value** | ~10 min for volunteer: browse project, click a page image, type transcription in side-by-side panel, save. No image annotation. Institution admin has higher setup overhead. |
| **Collaboration** | Page-level locking; reviewer workflow; notes per page. GLAM institutions (Harvard, Stanford, V&A) as clients. |
| **Import paths** | IIIF manifest import for subject images. CSV/TSV export of transcriptions. |
| **Shareability** | Public project URLs. No embed. |
| **Lock-in** | SaaS platform — subscription pricing. Data exportable as CSV. No WADM output. |
| **Broadening feature** | Dictation support for transcription; side-by-side original + transcription panel — broadens to volunteers with low typing speed or motor difficulties. |
| **Archie win** | Archie's async-zip collaboration (share copy → return with annotations → DAG merge) is a lighter-weight peer model that doesn't require a SaaS subscription. WADM output vs proprietary CSV. |

Sources: [fromthepage.com](https://fromthepage.com/), [content.fromthepage.com](https://content.fromthepage.com/)

---

### 1.13 Zooniverse (crowdsourcing)
| Dimension | Finding |
|-----------|---------|
| **Onboarding / time-to-first-value** | Volunteer: ~2 min (browse project, click, classify/draw/transcribe a subject, submit). Project builder: higher overhead — upload subject sets, design workflow tasks, publish. |
| **Collaboration** | Volunteer (classifier) vs project owner vs researcher. Consensus aggregation built in. IIIF annotation export tooling exists ([zooniverse.github.io/iiif-annotations](https://zooniverse.github.io/iiif-annotations/)). |
| **Import paths** | Subject image upload (bulk). IIIF source supported in newer projects. |
| **Shareability** | Public project page. Classification data exportable as CSV/JSON. |
| **Lock-in** | Zooniverse platform; hosted. Data exportable but viewer not portable. |
| **Broadening feature** | Tutorial + mini-course system within classification interface — the best non-specialist volunteer briefing in the survey. |
| **Archie win** | Archie's Reading model (competing scholarly interpretations) vs Zooniverse's consensus aggregation — different audiences. Archie targets interpretation, Zooniverse targets classification. Portable zip output vs platform-bound data. |

Sources: [zooniverse.org](https://www.zooniverse.org/), [help.zooniverse.org](https://help.zooniverse.org/getting-started/)

---

### 1.14 Transkribus
| Dimension | Finding |
|-----------|---------|
| **Onboarding / time-to-first-value** | ~20 min: account, create document set, upload images, run HTR model, review + correct transcription. Credit-based (50 free/mo). |
| **Collaboration** | 4 roles: Owner, Editor, Transcriber, Reader. Teams to 100+ volunteers. Smooth onboarding improvements in Feb 2025 release. |
| **Import paths** | Image upload (bulk); PDF; IIIF (partial). Export: TEI/XML, ALTO, PDF, DOCX. |
| **Shareability** | Transkribus app platform. No iframe embed. |
| **Lock-in** | Credit system (AI recognition uses credits) creates consumable lock-in. Data exportable but HTR models are platform-trained. |
| **Broadening feature** | AI HTR (handwriting recognition) as first-class citizen — broadens to historians who couldn't read historical scripts. |
| **Archie win** | Archie's domain is image annotation + narrative exhibit, not OCR/HTR. Complementary, not competing. Archie could **import** Transkribus TEI/ALTO outputs as pre-existing annotations. |

Sources: [transkribus.org](https://www.transkribus.org/), [transkribus.org/plans](https://www.transkribus.org/plans)

---

### 1.15 Perusall (classroom social annotation)
| Dimension | Finding |
|-----------|---------|
| **Onboarding / time-to-first-value** | Instructor: activate in Canvas/D2L, upload PDF/reading, create assignment. Student: follow LMS link, annotate inline. No extra login for students. "Getting Started" intro assignment included. ([support.perusall.com](https://support.perusall.com/hc/en-us/articles/360034534193-Getting-started-for-instructors)) |
| **Collaboration** | Class-scoped annotation threads; instructor sees all; grade-linked. No cross-class or public collaboration. |
| **Import paths** | PDF, website URL, video. No IIIF, no image region annotation. |
| **Shareability** | LMS-embedded only. No public share URL. Annotation not exportable by students. |
| **Lock-in** | Per-course licensing; annotations locked in LMS context; not portable. Full institutional lock-in. |
| **Broadening feature** | Gradebook integration + AI engagement scoring — broadens to instructors who need accountability metrics, not just collaboration. |
| **Archie win** | Image region annotation (Perusall = text/PDF only). IIIF-native. No LMS dependency — Archie exhibits live on any web page. |

Sources: [perusall.com](https://www.perusall.com/), [Cornell Perusall guide](https://teaching.cornell.edu/learning-technologies/collaboration-tools/social-annotation/perusall)

---

### 1.16 ThingLink
| Dimension | Finding |
|-----------|---------|
| **Onboarding / time-to-first-value** | ~5 min: sign up (free tier), upload image/360/video, click to add hotspot, type content, publish link. No IIIF. ([thinglink.com](https://www.thinglink.com/)) |
| **Collaboration** | Teams feature (paid). Shared workspace. No role differentiation in free tier. |
| **Import paths** | Direct upload. No IIIF, no annotation import. |
| **Shareability** | Public shareable URL; iframe embed code; og-tags generated. LMS integration. |
| **Lock-in** | All data on ThingLink servers. No export. Pure platform lock-in. |
| **Broadening feature** | 360° image + VR support — broadens to museum/education teams doing virtual tours. |
| **Archie win** | IIIF provenance (institutional images usable without re-upload). WADM output. No subscription. |

Sources: [thinglink.com](https://www.thinglink.com/), [getapp.com comparison](https://www.getapp.com/collaboration-software/a/genially/compare/thinglink/)

---

### 1.17 Genially
| Dimension | Finding |
|-----------|---------|
| **Onboarding / time-to-first-value** | ~5 min: account, choose template, drag-drop content, publish. No-code. AI creation assistance (2025). |
| **Collaboration** | Team workspaces (paid). Co-editing. Template sharing. |
| **Import paths** | Image upload, embed codes from external tools. No IIIF. |
| **Shareability** | Public URL; iframe embed; og-tags. Analytics dashboard (paid). |
| **Lock-in** | Genially servers. No export of source. Template vendor lock-in. |
| **Broadening feature** | AI content generation — broadens to educators who can't write from scratch. |
| **Archie win** | IIIF + WADM provenance. Portable zip. Institutional-quality metadata vs Genially's consumer framing. |

Sources: [getapp.com Genially](https://www.getapp.com/collaboration-software/a/genially/compare/thinglink/)

---

### 1.18 Padlet + H5P
| Dimension | Finding |
|-----------|---------|
| **Onboarding** | Padlet: ~2 min, free board, drag-drop media. H5P: create interactive content types (quiz, timeline, image hotspot); self-host or H5P.com. Both clean iframe embeds. |
| **Lock-in** | Padlet: subscription; no export of board as standard format. H5P: `.h5p` zip is portable (open format) but proprietary player dependency. |
| **Broadening feature** | Padlet = zero-friction collaborative pinboard for groups. H5P = 40+ interactive content types (Interactive Video, Image Hotspot, Timeline) for instructional designers. |
| **Archie win** | H5P Image Hotspot is the closest functional analogue — but H5P has no IIIF, no WADM, no deep-zoom. Archie = scholarly version of what H5P Image Hotspot does educationally. |

Sources: [h5p.com](https://h5p.com/), [padlet.help](https://padlet.help/l/en/category/tb8lfa31h8-padlet-features)

---

### 1.19 Shorthand
| Dimension | Finding |
|-----------|---------|
| **Onboarding** | ~10 min: account, choose scrollytelling template, add sections with images/video/text. Journalism/comms-oriented. |
| **Collaboration** | Team workspaces (paid). Review workflow. |
| **Lock-in** | Shorthand platform hosting. No IIIF, no WADM. Export as static HTML (paid plans). |
| **Broadening feature** | Professional-grade scrollytelling templates — broadens to communications teams and journalists who want editorial polish without developers. |
| **Archie win** | IIIF deep-zoom vs Shorthand's flat image panels. Scholarly annotation vs decorative captions. |

---

## 2. Cross-Cutting Patterns

### 2.1 Lock-in taxonomy
Three lock-in shapes dominate the field:
1. **Server-data lock-in** (Exhibit.so, Storiiies, ThingLink, Genially, Padlet, Perusall, Hypothes.is): data lives on the platform's server with no export or a lossy one. Vendor goes dark → contributor loses everything.
2. **Account/ecosystem lock-in** (StoryMapJS/Google, Juncture/GitHub, Perusall/LMS): free to use but chained to a third-party account infrastructure.
3. **Subscription/credit lock-in** (Transkribus credits, Perusall per-course, ThingLink paid export): usage itself becomes a recurring cost even for already-created content.

**Archie's structural win:** `.archie.zip` = the contributor owns the artifact from first save. No account required to create; GitHub account optional at publish time. Zip-as-canonical-file breaks all three lock-in shapes simultaneously.

### 2.2 The IIIF funnel gap
No comparator in the survey combines: (a) paste-a-IIIF-manifest-URL as the primary on-ramp AND (b) portable, exportable WADM annotations AND (c) multi-object narrative sequencing AND (d) zero server dependency AND (e) audio/video annotation. Exhibit.so does (a); Storiiies does (a) with an even lower bar; Recogito does (b) for text; Canopy IIIF does collection browsing; Mirador MMU does multi-user annotation — but no single tool does all five.

### 2.3 Onboarding speed ranking (time-to-first-value, no prior setup)
1. Storiiies — ~2 min, no account
2. Hypothes.is (browser ext) — ~2 min, free account
3. Exhibit.so — ~3 min, no account
4. Padlet — ~2 min, free account
5. ThingLink / Genially — ~5 min, free account
6. StoryMapJS — ~5 min, Google account
7. Recogito — ~5 min, free account
8. Zooniverse volunteer — ~2 min (but requires existing project)
9. Juncture — ~10 min, GitHub account
10. Scalar — ~15 min, free account
11. Canopy IIIF — ~30 min, GitHub + Node
12. Omeka S — hours to days (server install)

Archie's target: match Exhibit.so's ~3 min path. The Playground (try a template, nothing saved) entry point from CONTEXT.md §UX directly addresses this.

### 2.4 The collaboration gap
No tool in the survey combines IIIF-native annotation authoring with an async merge/conflict-resolution workflow that doesn't require a shared server. Recogito (closest peer model) requires a Pelagios account and server. Mirador MMU requires a WebSocket server. FromThePage/Zooniverse require platform hosting.

Archie's async-zip collaboration ("Share a copy for review" → "Import changes" → DAG merge + conflict-card resolution, CONTEXT.md §182) is **genuinely novel** in this space.

---

## 3. Feature-Candidate Table

| Feature | Contributor audience | Evidence | Broadens because | Fits locked frames? | Est. effort | Priority |
|---------|---------------------|----------|-----------------|---------------------|------------|----------|
| **Playground → first exhibit in <3 min** (no account, try template) | Complete newcomers, workshop participants, classroom learners | Storiiies/Exhibit.so prove <3 min is the bar; Archie CONTEXT.md §UX already decides Playground entry | Removes all pre-work; first value before any commitment | **Y** — already in CONTEXT.md UX decisions | S (already designed; implement Playground flow) | P0 |
| **IIIF manifest URL paste as primary import** | Librarians, archivists, digital humanists with existing IIIF collections | Exhibit.so/Storiiies prove this is the lowest-friction IIIF on-ramp; Prior Art 14: `cozy-iiif` `parseURL` is the donor | 50,000+ institutional IIIF collections instantly accessible without re-upload | **Y** — IIIF Presentation 3 is a locked frame; cozy-iiif donor confirmed (`Prior Art/14-import-interop.md`) | M (cozy-iiif integration for manifest-URL→Exhibit scaffolding) | P0 |
| **Async-zip collaboration** (share copy → import → DAG merge + conflict card) | Peer scholars, research teams without shared servers | No comparator offers server-free peer annotation exchange; CONTEXT.md §182 decides this | Enables 2-person scholarly collaboration with zero shared infrastructure | **Y** — decided in CONTEXT.md; append-only DAG is locked | L (DAG merge + conflict-card UI — major invention, already in v1 plan) | P0 |
| **Readings as competing interpretations** (IIIF AnnotationCollection/AnnotationPage, rival scholarly readings coexist) | Academic scholars, grad students, educators running comparative exercises | No comparator offers structured rival-interpretation coexistence; CONTEXT.md Language §"Reading"; Mirador can consume toggleable AnnotationPages | Broadens to scholarly disagreement use cases — makes Archie structurally different from consensus tools | **Y** — WADM + IIIF Presentation 3 is locked frame | M (UI for reading management — already in design) | P1 |
| **EXIF → IIIF/WADM metadata ingest** (camera GPS/capture-date → navDate/metadata auto-populated) | Photographers, field researchers, photojournalists | Prior Art `_GAPS.md`: "EXIF → IIIF/WADM metadata ingest is unsolved" — no comparator does this; field-studio `ingest.worker.ts:351` is a stub | Opens contributor base to photographic practitioners — first-time creators don't start from blank | **Y** — IIIF metadata fields (`navDate`) + WADM bodies in locked frame; client-side EXIF read is serverless-safe | M (exifreader → navDate + provider metadata auto-fill; Prior Art gap-answer confirms `tiff.js`/`exifreader` donors) | P1 |
| **oEmbed / `<archie-viewer>` custom element embed** | Blog authors, CMS editors, Wikipedia-adjacent publishers, instructors embedding in LMS | Prior Art 18: clover-iiif custom element pattern (`clover-viewer.tsx:42`) is PURE lift; UV embed-script generator (`BaseExtension.ts:830-852`); CONTEXT.md marks oEmbed as deferred v1.2 | Exhibit reaches audiences the author doesn't control; multiplies discoverability without SEO expertise | **Partial** — oEmbed deferred to v1.2; custom element fits static/serverless frame; no server needed | M (Svelte → custom element wrapper, attribute→prop sync PURE from prior art) | P2 (v1.2) |
| **Transkribus / OCR-ALTO import as annotation pre-population** | Manuscript scholars, historians working with digitized handwritten docs | Transkribus TEI/ALTO export is standard; Prior Art 14: ALTO noted in Tropy ingest; Transkribus Feb 2025 release; no comparator bridges HTR output to WADM | Scholars with pre-existing Transkribus projects can migrate annotations into Archie exhibits | **Y** — WADM TextualBody import is standards-compliant; client-side XML parse is serverless-safe | M (ALTO XML → WADM TextualBody adapter) | P2 |
| **CSV/spreadsheet annotation import** | Citizen scholars, educators with pre-existing spreadsheet workflows | Prior Art 14: field-studio exceljs donor; FromThePage CSV export; Zooniverse CSV export; gap noted explicitly | Meets non-technical contributors where their data already lives | **Y** — client-side CSV parse → WADM bodies; no server needed | S–M (CSV → TextualBody normalizer; field-studio exceljs pattern available) | P2 |

---

## 4. Biggest Gap No Comparator Combination Covers

**Server-free async peer annotation collaboration on IIIF material with portable WADM output and competing-interpretation support.**

Every peer annotation tool (Recogito, Mirador MMU, Hypothes.is, Perusall) requires a shared server or platform account. Every IIIF storytelling tool (Exhibit.so, Storiiies, Juncture, Canopy) is read-only or single-author. No tool structures scholarly disagreement as first-class data (rival readings coexisting, not merged). Archie's combination of: async-zip DAG collaboration + Readings model + IIIF Presentation 3 output + serverless publish — has **no comparator** in the 21-tool survey. This is the gap worth owning.

---

## 5. On-Disk Prior Art Citations

- `Prior Art/06-authoring-cms.md` — CMS onboarding patterns, papadam multi-user model
- `Prior Art/14-import-interop.md:cozy-iiif/Cozy.ts:31,89` — IIIF manifest URL parse (PURE donor)
- `Prior Art/14-import-interop.md:field-studio/ingest.worker.ts:351` — EXIF stub (gap confirmed)
- `Prior Art/18-embedding-ecosystem.md:clover-viewer.tsx:42` — custom element registration (PURE lift)
- `Prior Art/18-embedding-ecosystem.md:uv-shared-module/BaseExtension.ts:830-852` — embed-script builder
- `Prior Art/_GAPS.md` — EXIF→IIIF/WADM ingest: "unsolved", no comparator
- `Prior Art/_GAPS.md` — browser-only OAuth push to GH Pages: "no prior art"
- `Prior Art/09-web-publishable-serverless.md:juncture/index.html:1-30` — zero-build client-render (bad SEO path)
- `CONTEXT.md §182` — Contributors aggregate, async-zip collaboration decided
- `CONTEXT.md §UX` — Playground entry point, layout-picker, deferred oEmbed (v1.2)
