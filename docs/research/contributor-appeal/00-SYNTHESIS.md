# Contributor-Appeal Research — Synthesis & Prioritized Roadmap

**Question (user, 2026-06-09):** what features would make Archie more appealing to a broader base of
**contributors** (authors / annotators / collaborators — not the read-only visitor)?

**Method:** three parallel research threads, each mining BOTH online sources AND the on-disk 20-axis
Prior-Art citation matrix, grounded in `CONTEXT.md` locked frames + `GOAL.md` §5 user-serving test.
- `01-competitor-contributor.md` — 21-tool teardown through the contributor lens (22 online + 6 disk).
- `02-user-service-design.md` — 9 contributor personas + a discover→maintain service blueprint (14 online + 10 disk).
- `03-system-design.md` — every capability classified fits-the-frame vs server-shaped (8 online + 11 disk).

Findings cached to mulch domain `product-research` (19 records across the three threads).

---

## 1. The one finding all three threads reached independently

> **Archie's import funnel assumes a IIIF manifest URL. The broader contributor base arrives with
> image files on disk. Local-image → in-browser IIIF is the single gate that decides whether Archie
> is a DH niche tool or a broad contributor platform.**

Six of nine researched personas (GLAM, community archive, journalist, genealogy, photography, map)
hit this wall **before the Playground tour is even over** — they cannot annotate their own content.
It is a confirmed prior-art gap (`Prior Art/_GAPS.md:1` — "in-browser, server-free folder→static-IIIF
generation … NONE generate the static manifest client-side"), so it is real build work (the biiif
algorithm reimplemented against FSA/OPFS), not a wiring task. Every other broadening feature is
secondary to this — they widen a funnel whose mouth is currently closed to non-IIIF contributors.

## 2. What Archie already gets right (don't relitigate — these ARE the differentiators)

The teardown found Archie's *contributor model* is already ahead of the field; the gap is reach, not design:
- **No-lock-in by construction.** The 21-tool survey found three lock-in shapes (server-data,
  account/ecosystem, subscription/credit). `.archie.zip`-as-canonical-file breaks all three at once.
  Every competitor that's easy to start (Storiiies, Exhibit.so, ThingLink) traps your data.
- **Server-free async peer collaboration** (share-zip → import → DAG merge + conflict card) is
  **genuinely novel** — no surveyed tool offers peer annotation exchange without a shared server/account.
- **Readings as competing interpretations** (rival scholarly readings coexist as IIIF AnnotationPages,
  never force a merge) is **structurally absent from all 21 tools** — consensus tools can't represent disagreement.

**The unoccupied territory Archie should own (biggest competitor gap):** server-free async peer
annotation on IIIF material, with portable WADM output AND competing-interpretation support. No
comparator + frame combination covers it. This is the positioning, not just a feature.

## 3. The broadening insight: court the segments the import gate currently blocks

Personas ranked by broadening leverage (evidence × distance from the current DH-scholar core):

| # | Persona | Why they broaden the base | The ONE thing blocking them today |
|---|---------|---------------------------|-----------------------------------|
| **P1** | **GLAM exhibit creator** | Largest institutional audience, already IIIF-aware, actively fleeing Omeka subscription lock-in | Local image import (many have files, not a IIIF server) |
| **P3** | **Community / citizen archive** | Huge latent demand (NEH Common Heritage, IA Community Webs); data-sovereignty motive == Archie's posture | Local image import + no-GitHub publish |
| **P2** | **Educator / classroom** | Strong pedagogical evidence (BJET 2024); async-zip == "submit your annotated copy"; Readings == rival student takes | Manual zip-per-student ceiling (batch is server-shaped) + DH-only templates |
| **P6** | **Journalist / visual storyteller** | Differentiated on data sovereignty (Shorthand's ToS claims your content) | Local image import + `?src=` publish |
| P4 | DH scholar (current core) | Already served | CSV/Transkribus annotation import (bulk pre-existing data) |
| P7/P8/P9 | Genealogy / photography / map | Each a distinct adjacent base | Local image import; P9 also wants geo-coords (deferred) |

First impression matters as much as capability: **if the only Playground template is a Voynich
manuscript, 6 of 9 personas leave at the landing page** before discovering anything else.

---

## 4. Prioritized feature roadmap (deduplicated across all three threads)

Ranked by `(broadening leverage × evidence strength) ÷ effort`, honoring GOAL.md §2 (look→feel→perf→features)
and §5 (every feature names audience + evidence + why-it-broadens + frame-fit). All are **fits-the-frame**
unless marked. Items already decided in CONTEXT.md are flagged — they need *building/surfacing*, not deciding.

### Tier 0 — open the funnel (do these first; highest leverage)

| Feature | Audience | Broadens because | Frame | Effort | Status |
|---|---|---|---|---|---|
| **① Local image folder → in-browser IIIF manifest** | P1,P3,P6,P7,P8,P9 | Unblocks 6/9 personas; removes the single largest drop-off | Fits (FSA/OPFS; biiif reimplemented client-side) | **L** | Gap — build |
| **② IIIF manifest URL paste import** | P1,P2,P4 | One paste bootstraps from 50k+ institutional collections | Fits (`cozy-iiif parseURL` PURE donor) | **S–M** | Gap — build |
| **③ Segment-diverse Playground templates** (family photos, map, classroom, photo essay) | P2,P3,P6,P7,P8 | Replaces "this is for manuscript scholars" first impression; each is just a pre-loaded `.archie.zip` | Fits (content, no new arch) | **S** | Gap — author |
| **④ Surface `?src=<zip-url>` as a first-class publish path** (host zip on Drive/IA, share link) | P3,P7,P8,P6 | The zero-GitHub publish path; most non-specialists won't make a GitHub account | Fits (mechanism exists, CONTEXT §224) | **S–M** | Surface + warn |
| **⑤ Build-time SEO / og-tags / JSON-LD / sitemap** | all authors | Every published exhibit becomes findable + social-unfurls; pure word-of-mouth today | Fits (Astro build step) | **S** | Gap — build |

### Tier 1 — widen the mouth further & make collaboration legible

| Feature | Audience | Broadens because | Frame | Effort |
|---|---|---|---|---|
| **⑥ CSV / spreadsheet → annotation bulk import** | P4,P5,P1 GLAM, educators, genealogists | Author in Excel/Sheets; zero annotation-UI learning curve; "final-mile exhibit layer" on FromThePage/Transkribus output | Fits (papaparse/exceljs, pure) | M |
| **⑦ WADM / Recogito / Hypothes.is annotation import** | migrators from existing annotation tools | Zero migration cost from the primary GLAM annotation comparator (Recogito) | Fits (`cozy-iiif importAnnotations` PURE) | M |
| **⑧ "Collaborative pass" UX + summary-panel onboarding copy** | P1,P2,P3 collaborators | Makes async-zip feel like *intentional peer review*, not degraded real-time; "Synced 42 · 3 need you" is an invention needing comprehension-gating for non-specialists | Fits (copy + framing) | S |
| **⑨ Annotation template presets by task** (transcription / identification / provenance / reading) | P1,P2,P4,P5 | Lowers first-contribution load; speaks each segment's task language | Fits (`field-studio AnnotationTemplateService` PURE donor) | M |
| **⑩ Embed-code generator + `<archie-viewer>` custom element** | P1,P6,P8 + LMS/CMS embedders | Exhibits embed in Canvas/Moodle/WordPress/Substack; every embed is a new contributor surface | Fits (static iframe + CDN element; clover-iiif pattern) | M |
| **⑪ Static IIIF Change Discovery (ActivityStreams) pages** | GLAM institutions | Aggregator visibility (OCLC/Europeana/DPLA); institutional credibility signal | Fits (static JSON at publish) | M |
| **⑫ EXIF → IIIF/WADM metadata auto-fill** (GPS/date → navDate/metadata) | P6,P8 photographers/field researchers | Unsolved in all 21 tools; first-timers don't start from blank | Fits (client-side exifreader) | M |

### Tier 2 — depth & reach (after the funnel is open)

GitHub OAuth PKCE identity bridge (local name → citable GitHub author on publish; Decap-CMS pattern) ·
OffscreenCanvas DZI worker tiling (already v1.1 — unlocks microscopy/maps/fine-art large images) ·
tablet-responsive Studio · ONNX FastSAM region-suggestion (lazy worker, static `.onnx` asset) ·
GitHub-Issues-as-contribution-queue · Tropy/Omeka JSON-LD ingest · WebVTT/SRT import (already v1).

### Deferred — genuinely server-shaped (seed, don't build; honest about the boundary)

- **Live real-time co-editing** (liiive/Google-Docs model) — the single most-requested feature in
  analogous tools, but WebRTC needs a signaling server + Hocuspocus relay. **Closest serverless
  approximation = async-zip DAG + Readings-as-isolated-passes + a "12 notes since your last import"
  indicator** — makes async feel intentional. (Reference if a server is ever added: liiive's 58-line Hocuspocus.)
- **Classroom submission inbox / batch zip import** — centralized collection of N student zips (P2 ceiling).
- **Volunteer task queue** ("claim a folio", track completion) — crowdsourcing at scale (P5).
- **Cross-library discovery / exhibit index** — locked out by "one Library = one site"; correct for
  data sovereignty, revisit post-v1.

---

## 5. The recommendation in one line (caveman)

**Contributor arrives → has image files, not IIIF URL → can't start → leaves.** Build local-image
import first (①), greet them with templates that look like *their* work (③), let them publish without
GitHub (④), and make every published exhibit findable (⑤). Archie's collaboration model and no-lock-in
are already best-in-field — the job is reach, not redesign.

## 6. Provenance

Thread files + this synthesis live in `docs/research/contributor-appeal/`. Shared grounding:
`_SHARED-CONTEXT.md`. Durable findings cached to mulch `product-research`. Top broadening candidates
filed as seeds (this wave) for the `/goal` loop's §5 user-serving feature pipeline. No code changed;
no locked frame relitigated. All claims trace to an online URL or a `relpath:line` in the thread files.
