# ADR-0007 — Readings as IIIF AnnotationPages (the "Layer" reframe)

- **Status:** Accepted (2026-05-27).
- **Amends:** ADR-0003 (the annotation spine — the heads projection now partitions by reading).
- **Reverses:** CONTEXT §92 (the per-note `archie:layers: string[]` model). Provenance for the reversal lives in CONTEXT §92 + the "Readings & Tags" section (grill Q1–Q17).
- **Source:** `/grill-with-docs` + `/simplify`, 2026-05-26/27. Design: CONTEXT.md → "Readings & Tags". Strategy: `docs/plans/READINGS-IMPLEMENTATION-STRATEGY.md`.

## Context

v1 shipped a "Layer" feature: a per-note `record.layers: string[]` filtered in Studio and the Viewer. It was **underused, and its purpose was unclear** to authors and visitors. Grilling found the root cause: **"Layer" was one word doing two incompatible jobs** — an exclusive "way to read this" *and* an additive "kind of note" — a stroad. Each prior fix (per-note membership, then namespaces) preserved the conflation. No prior-art donor has a working layer/tag filter surface; this is invented UX.

## Decision

Retire "Layer." Split it into two single-job concepts:

- **Reading** — a curated, **mutually-exclusive interpretive pass** over an Object (the author's "here is one way to read this"). A Reading **is an IIIF `AnnotationPage`** (per Object) grouped by an **`AnnotationCollection`** (per Exhibit — the reading's identity `{id, name, description, colour}`). A Note carries **one optional `reading` id** (or none → the always-visible *base*).
- **Tag** — an **additive, per-note discovery** label (`purpose:tagging`), now also the home for **apparatus/reference strata** (paleography, codicology, material). Note-pane chip; never a canvas legend.

Supporting decisions (grill):
- **Mutual exclusivity in v1** (one note → one reading) — required because IIIF puts an annotation in exactly one page's `items`; multi-membership = a deliberate v1.1 step (pays the duplication/hybrid + ⌘K-link-grammar tax knowingly).
- **Viewer:** legend = radio; **base-only arrival** (no camp privileged); **flip** between readings in v1 (synced *compare* → v1.1 Compare layout); base always visible under the active reading.
- **Authoring:** a Reading is a **shared named thread** (attribution per-note via `lastEditor`), authored via an overarching exhibit-level **Readings panel** + an **active-reading context** (new notes default into the selected reading).
- **Migration:** inline-on-read; legacy `layers: string[]` → **Tags** (lossless; a Reading would force data-loss on multi-value layers).

## Consequences

- **Standards win:** pure IIIF viewers (Mirador) get **real toggleable readings for free** (three-tier degradation rises from "show all" to "real layers"). The codebase already reserved the hook (`W3CAnnotationPage.partOf`).
- **Collaboration synergy:** Readings are the structural home for *competing collaborative interpretations* — rival readings **coexist** instead of forcing a merge conflict. Clean division: **merge reconciles *accidental* divergence (per-logicalId); Readings preserve *essential* divergence.** Authorship already supported (`lastEditor: ClientId`).
- **The spine holds:** the heads projection changes from "one page per Object" to "**N pages per Object partitioned by reading + a base page**" — still a pure idempotent function of the append-only log; only the projection partitions.
- **Build debt:** `record.layers`→`reading` · `archie:layers`→`archie:reading` · `query/filter.ts` · heads compiler (`publish/site.ts`) · `Canvas.annotations` multi-element (`iiif/manifest.ts`) · mount per-page toggle (`mount.ts`) · Studio Readings panel + Viewer legend/Tag-chips (Tag viewer UI was never built). Sequence + phases: see the strategy doc.
- **Demo:** the Voynich is re-authored as a real Studio project (competing Cipher/Hoax readings of real Beinecke folios) shipped as a template — the dogfood that proves the model.
