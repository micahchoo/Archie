---
status: accepted
date: 2026-06-20
---

# A Section also ships as a WADM annotation — an additive `supplementing` view beside the canonical IIIF Range

- **Builds on:** ADR-0005 / mx-41997c (Section = a self-contained reading beat `{ objectId, start, prose }`, **not** a tour of Notes) and ADR-0016 (a narrative exists iff `sections.length > 0`). The Section model and the `structures[]` Range transport are untouched; this only *adds* a second, derived serialization.
- **Reaffirms (untouched):** mx-9fa770 (WADM `@context` only at the AnnotationPage/Collection level) and ADR-0003's three-tier interop (a pure consumer ignores all `archie:` keys). The section-annotation carries NO archie DAG fields, so the reload importer (`recordFromHistoryAnnotation`) ignores it — there is no double-count with the Range round-trip.
- **Prior art (cited — directory mandate):**
  - IIIF Presentation 3.0 §5.4 — a Range links to an `AnnotationCollection` via **`supplementary`** (`Image/iiif-demo/IIIF-generator/Presentation API 3.0.md`). The ecosystem does NOT sanction "a Range *is* an annotation"; `supplementary` is the blessed Range↔annotation bridge.
  - annomea (`Archie/Prior Art/03-annotation-data-model.md`) — `motivation: "describing"` + `TextualBody` is the sanctioned way to carry prose; `FragmentSelector` for region targeting.
  - cozy-iiif (`Image/IIIF/cozy-iiif/.../fetch-annotations.ts`) — ordered annotation sets live in an `AnnotationCollection` (item order / paging); WADM has no per-annotation order, so order is also baked in (`archie:order`).
- **Source:** user request 2026-06-20 ("sections should have compat as an annotation as well with the affordances of ranges baked in"), grilled to "most non-invasive + all-round compatible." Code anchors: `iiif/manifest.ts` (`sectionToAnnotation`, `sectionsToAnnotationCollection`, `toRanges` supplementary), `wadm/types.ts` (`SectionAnnotation`, `W3CAnnotationCollection`, `ARCHIE_ROLE`/`ARCHIE_ORDER`), `iiif/presentation.ts` (`IIIFRange.supplementary`), `publish/site.ts` (writes `{slug}/annotations/narrative.json`). Tests: `iiif/manifest.test.ts`, `publish/read.test.ts`.

## Context

A Section serialized to exactly one place: an IIIF `Range` in `manifest.structures[]`. That round-trips Archie↔Archie cleanly (verified: `sectionsFromManifest(toRanges(x)) === x`, 593 render-core tests green). But a *pure WADM/IIIF annotation tool* — Annotorious, Recogito, Mirador's annotation panel — reads `AnnotationPage`s, never `structures[]`. So such a tool saw the Notes and was **blind to the narrative**. The ask was to make a Section *also* expressible as a WADM annotation, with the Range's affordances carried in the annotation, **most non-invasively and all-round compatibly**.

Those two adjectives picked the design over the obvious alternatives. "All-round compatible" ruled out Archie-only carriers (a custom `archie:title`, a guess-which-`TextualBody` title scheme) in favour of constructs every tool already understands; "non-invasive" ruled out making the annotation canonical or touching the read path.

## Decision

A Section ships **twice**: the IIIF `Range` stays canonical (Archie reads it), and a derived, additive **`supplementing` annotation** is emitted for ecosystem consumers. Concretely:

- **`sectionToAnnotation`** projects a Section to a WADM `Annotation` with the Range affordances baked in:
  - `motivation: "supplementing"` — the IIIF semantics for annotations a Range references, and valid plain WADM.
  - title → a IIIF **`label`** (not a custom extension): IIIF tools render it; a pure-WADM/JSON-LD consumer harmlessly ignores the unknown term — strictly more compatible than `archie:title` or a second `TextualBody`.
  - active region → a `SpecificResource` `target` with a `FragmentSelector` (`xywh=…`/`t=…`, verbatim from `section.start`) — the single most universally-read WADM construct.
  - prose → a `describing` `TextualBody`.
  - spine position → `archie:order` (ordering is also carried by the collection's item order; the field is belt-and-suspenders since WADM has no native per-annotation order).
  - `archie:role: "section"` — advisory marker; the load-bearing distinction is the **absence of the DAG fields**.
- **`sectionsToAnnotationCollection`** groups the section-annotations into one self-contained, ordered `AnnotationCollection` per exhibit, published at `{slug}/annotations/narrative.json`, with the items embedded inline in the `first` AnnotationPage (a static export has no server to dereference a bare page id). `@context` at the collection level only.
- **`toRanges`** adds `supplementary` → that collection on every Range — the one property added to existing manifest output; everything else is net-new files. This is what makes it *all-round*: IIIF clients follow `supplementary`, pure-WADM clients fetch the collection directly.
- **Non-invasive guarantees:** the in-memory `Section` model, the read path, and the canonical Range serialization are unchanged. `sectionsFromManifest` ignores `supplementary`; `readExhibitTree` never reads `narrative.json`; and because the section-annotations omit `archie:logicalId`/`rev`/`version`/`lastEditor`, even a consumer that fed them to the importer would have them dropped. Pinned by `read.test.ts` ("does NOT double-count section-annotations as notes").

## Rejected alternatives

- **(a) Inline section-annotations into each canvas's existing AnnotationPage, beside Notes.** Fewer files, but it co-mingles the narrative layer with the note layer on one page — a pure-WADM viewer would render Sections as if they were Notes, and it violates the ADR-0005 orthogonality (Section is independent of Notes). Rejected for a separate collection linked via `supplementary`.
- **(b) `archie:title` extension for the title.** Matches house `archie:*` style but is Archie-only — defeats "all-round compatible." A plain IIIF `label` reaches strictly more consumers for the same byte cost.
- **(c) Make the annotation canonical / drop the Range.** Maximally compatible with annotation tools but invasive: it would break the verified Archie↔Archie Range round-trip and the `structures[]`-based reader, and lose IIIF Range navigation for IIIF viewers. Rejected — the ask was "as well," i.e. additive.
- **(d) Standalone collection with no `supplementary` back-link (truly zero manifest touch).** Most non-invasive, but the collection is then an orphan: a viewer loading the manifest can't discover it. The one-property `supplementary` link buys ecosystem discovery — worth it.
