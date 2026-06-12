# Shared Context — Contributor-Appeal Research

> Every research agent reads THIS first. Do not re-derive; consume. Goal below.

## The goal of this research wave

**Find the features that would make Archie more appealing to a BROADER base of CONTRIBUTORS**
(the people who author exhibits, annotate, and collaborate — not the read-only visitor).
"Broader" = beyond the current narrow DH-scholar bent, into adjacent contributor segments.
Output feeds GOAL.md §5 (user-serving feature test) and caches to mulch domain `product-research`.

Each feature candidate must, per GOAL.md §5, be nameable as: (a) the contributor audience it
serves, (b) researched evidence they want it, (c) why it BROADENS rather than narrows appeal,
and (d) whether it fits Archie's locked frames (below). If it can't, it's a deferred seed, not a build.

## What Archie IS (locked frames — NON-NEGOTIABLE; do not propose violating these)

- Static-publishable, **serverless**: authored in a browser **Studio** SPA, published as a static
  site to **GitHub Pages** (zip is the universal primitive; per-host adapters ~200 LOC).
- **OSD + Annotorious** deep-zoom image annotation + audio/video annotation (WaveSurfer for AV).
- **W3C WADM** (Web Annotation Data Model) compliant; **IIIF Presentation 3** on disk.
- Two surfaces: **Studio** (author: CMS gallery + exhibit-making UI) / **Viewer** (read: exhibit
  gallery + published exhibit UI). Viewer has hosted + portable (.archie.zip) modes.
- **Svelte everywhere** (Studio = Svelte SPA; Viewer = Astro + Svelte islands).
- Storage = **OPFS default + FSA folder opt-in** (Chromium) / zip-as-canonical-file (Firefox/Safari).
- **No runtime server**. Pushing to api.github.com to publish is allowed (talking to a server ≠
  running one). Client-side ASR / heavy ML that needs a backend is OUT.

## Contributor model already decided (CONTEXT.md — build on these, don't relitigate)

- **Append-only log + version DAG** for annotations; **async-zip collaboration**: "Share a copy for
  review" (export zip) / "Import changes" (pick returned zip) → silent DAG fast-forward + summary
  panel ("Synced 42 notes from Alice · 3 need your decision") + inline conflict-card resolution.
- **Identity** = local display name, prompted on first import (not at launch); per-note `lastEditor`.
- **Readings** = competing/collaborative interpretive passes (IIIF AnnotationCollection/AnnotationPage);
  the structural home for scholarly disagreement — rival readings coexist, never force a merge conflict.
- **Contributors** (CONTEXT §182) = derived aggregate of `lastEditor` (auto) + manual additions
  (photographer/translator/funder), projected to IIIF `metadata`. Aggregates UPWARD object→exhibit→library.
- **Rights/metadata** = IIIF-native (requiredStatement / rights URI / provider / metadata).
- First-run = **Playground (try a template, nothing saved)** vs **Project (persisted)** by entry path.
- Import paths noted as funnel-wideners in GOAL.md: IIIF pull, CSV, existing annotations.

## Audiences to weigh (GOAL.md §5) — and ADJACENT ones to investigate

Current/natural: DH scholars (manuscript/codicology/paleography — the Voynich demo bent); GLAM
exhibit creators (galleries/libraries/archives/museums); educators & students building annotated
visual/AV explainers; independent researchers/hobbyists wanting zero-backend no-lock-in publishing.
Investigate ADJACENT contributor segments that would BROADEN the base: community/citizen archives,
crowdsourcing/citizen-science transcription, journalists/storytellers, art/photography portfolios,
biology/medical imaging, map/GIS storytelling, classroom group projects, genealogy/family history.

## On-disk prior art (mine it — cite `relpath:line`)

`Archie/Prior Art/` holds a 20-axis citation matrix (already surveyed): 06-authoring-cms,
10-state-mutation-patterns, 14-import-interop, 15-provenance-citation, 18-embedding-ecosystem,
19-ai-authoring are the most contributor-relevant. `_FRAMING.md`, `_GAPS.md`, `_GAP-ANSWERS.md`
record what was tried/ruled-out/left-open. User's own projects: annomea, anvil, field-studio.
Comparators already cloned: Mirador, Universal Viewer, Clover, Omeka/Canopy, Juncture, Quire,
Recogito/immarkus, decap-cms, tropy, liiive (real-time collab), scrollama, hyperaudio-lite.

## Comparators to research ONLINE (contributor/authoring lens)

Mirador, Universal Viewer, Omeka (Classic + S), Scalar, StoryMapJS / Knight Lab suite, Juncture,
Exhibit.so, Recogito / Recogito-JS, Annotorious tools, Hypothes.is, Storiiies, Canopy IIIF,
ThingLink, Genially, Knight Lab, Zooniverse (crowdsourced transcription), FromThePage (crowd
transcription/GLAM), Transkribus, Pundit, Perusall (social annotation in classrooms), Padlet,
H5P, Twine, Shorthand. Ask of each: what lowers the barrier for NON-technical contributors? how
does onboarding / first-contribution work? collaboration & roles? import paths? what makes a
published artifact shareable/embeddable/discoverable? where do they LOCK users in (and how does
Archie's no-lock-in posture win)?

## Output contract (per agent)

1. Write your thread file to `docs/research/contributor-appeal/<NN-slug>.md`.
2. Evidence-based. Online claims: name the source + URL. Disk claims: `relpath:line`. No fabrication.
3. End each file with a **Feature-candidate table**: | Feature | Contributor audience | Evidence |
   Broadens because… | Fits locked frames? (Y/N/partial — why) | Est. effort | Priority |.
4. Cache 3–7 durable findings to mulch: `ml add product-research` (once, if absent) then
   `ml record product-research --type <reference|pattern|decision> --title "…" --description "…"`.
5. Return to orchestrator ≤200 words: file written · # sources (online/disk) · top-5 feature
   candidates one-line each · single biggest gap or opportunity.
