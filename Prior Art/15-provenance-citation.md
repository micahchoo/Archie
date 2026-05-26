# Axis 15 — Provenance, citation & versioning

## Focused question
How do prior-art repos handle annotation/exhibit provenance and citability — WADM `creator`/`created`/`modified`/`generator` fields, citable region URLs/DOIs, exhibit version snapshots, edit history, "as-of" views?

## Sources surveyed
- `annomea` — WADM agent/date field emission — **opened**
- `anvil` — content-hash naming + palimpsest versioning ADRs — **opened**
- `quire` — CSL-JSON citation/bibliography generation — **opened**
- `IIIF/manifesto` — `requiredStatement`/`provider`/`rights` parsing — **opened**
- `IIIF/cozy-iiif` — provider/rights metadata — opened (grep, no hits)
- `tropy` — edtf dates + undo/redo history selectors — **opened**

## Findings by source

### annomea — which WADM provenance fields it actually emits
- **`creator` on the AnnotationPage** — `annomea/src/data/wadm.ts:12` — PURE — context: `createAnnotationPage(label, creator)` writes `creator: { type: 'Person', name }`. The exact Agent shape we'd emit per page.
- **`created` timestamp on the Page** — `annomea/src/data/wadm.ts:13` — PURE — context: `created: new Date().toISOString()`. Page-level only; **per-annotation `created` is NOT emitted**.
- **`creator` on the Annotation (settable, clearable)** — `annomea/src/data/annotation-edit.ts:43-45` — PURE — context: `setCreator(a, name)` → `{ type: 'Person', name }` or `undefined` when blank. Immutable spread; lift-able verbatim.
- **`modified` declared but never written** — `annomea/src/shared/types.ts:12` — PURE(type) — context: the Page type has optional `modified?: string`, but no code path sets it. Edit history is an **open hole**, not a feature.
- **Body purpose model (`describing`/`tagging`, purposeless = describing)** — `annomea/src/data/bodies.ts:36-42` — PURE — context: provenance-adjacent; how a body's role is classified for attribution display.

### anvil — content-hash naming as natural versioning + the one real history design
- **Content-hash file naming = natural version key** — `anvil/docs/plans/2026-05-22-v2-multi-image.md:17,61` — PURE — context: `annotations/<hash>.json`, `<hash>` = first 8 chars of `SHA-256(bytes)` via `crypto.subtle.digest`. Same image → same file → idempotent identity. This is "versioning" only in the content-addressed sense.
- **Palimpsest: content-hash-delta version trigger** — `anvil/docs/adr/0026-palimpsest-annotation-versioning.md:31-36` — inferred-design (ADR, not yet code) — context: a new version file is written only when the hash of (title+body+media+geometry) differs from the previous persisted version — decouples autosave cadence from versioning cadence. **Directly answers "what did this annotation say before?"**
- **Per-annotation version files + read-time Page assembly** — `0026:45-52` — inferred-design — context: `<urn-slug>.vN.json` standalone WADM `Annotation` objects; highest N = current; AnnotationPage assembled client-side, no server. The static-host "as-of" mechanism.
- **Annotation-index v2 `versions` map (static-host edit history)** — `0026:68-72` — inferred-design — context: `.anvil/annotation-index.json` gains `versions: [...]` per URN so the reader batch-loads priors without `readdir` (impossible over HTTP). The serverless trick that makes "as-of views" work on GH-Pages.
- **Reader "Layers" toggle = ghosted prior versions** — `0026:58-64` — inferred-design — context: prior versions render as reduced-opacity overlays; lazy-loaded on toggle. The read-side "as-of" UX.
- **Publish derivation registry (Dublin Core export step)** — `anvil/docs/adr/0020-publish-derivation-registry.md:62` (P6, deferred) + `:27-35` (citable "bytes on disk" clause) — inferred-design — context: a registry slot for emitting DC metadata at publish; the hook where citation/provenance export would live.

### quire — citation-string generation (the most reusable citation logic in the corpus)
- **CSL-JSON citation renderer** — `quire/packages/11ty/_plugins/citations/formatCitation.js:40` — COUPLED(citation-js/11ty) — context: `new Cite({...item}).format('bibliography', { format: 'text', template: type, lang })` via `@citation-js/core` + `@citation-js/plugin-csl`. Renders chicago/mla/apa from CSL-JSON. The format engine is a library, not bespoke.
- **Publication → CSL-JSON adapter** — `quire/packages/11ty/_includes/components/citation/publication.js:24-41` — PURE(logic) — context: maps publication data → CSL `book`/`article-journal` (`author`, `editor`, `issued.date-parts`, `publisher`, `URL`). The mapping shape is lift-able; the data source is Quire-specific.
- **Page-level citation adapter** — `quire/packages/11ty/_includes/components/citation/page.js:28-39` — PURE(logic) — context: per-page CSL with `container-author`; the analogue of citing a single exhibit/annotation within an exhibit.
- **Citation dispatch (page vs publication)** — `quire/packages/11ty/_includes/components/citation/index.js:17-26` — COUPLED(11ty) — context: routes context → `citePage`/`citePublication` → `formatCitation`.

### IIIF/manifesto — `requiredStatement`/`provider`/`rights` handling (read-side attribution)
- **`getRequiredStatement()`** — `IIIF/manifesto/src/ManifestResource.ts:105-115` — COUPLED(manifesto) — context: parses IIIF `requiredStatement` into a localized `LabelValuePair` (the attribution string a viewer must display). Supersedes deprecated `getAttribution` (`IIIFResource.ts:41`).
- **`provider` agent + logo extraction** — `IIIF/manifesto/src/IIIFResource.ts:98-109` — COUPLED(manifesto) — context: pulls the first `provider` Agent carrying a `logo` — the institutional-provenance display.
- **`getRights()` normalization** — `IIIF/manifesto/src/IIIFResource.ts:132-137` — PURE(logic) — context: returns rights as a single string whether stored as string or array. Tiny, lift-able normalizer for a license URI.
- **`getMetadata()` label/value pairs** — `IIIF/manifesto/src/ManifestResource.ts:45` — COUPLED(manifesto) — context: the generic metadata-pair channel where provenance lines surface.

### tropy — edtf dates + undo/redo history (in-memory, not document versioning)
- **EDTF date format/parse** — `tropy/src/format.js:1,11,17` — PURE — context: wraps the `edtf` library — `edtf(value)` parse + `edtfFormat(date, locale, options)`. Extended Date/Time Format for fuzzy/uncertain scholarly dates (`created`/`modified` candidates). The one corpus source treating dates as first-class scholarly data.
- **Undo/redo history selectors** — `tropy/src/selectors/history.js:3-17` — COUPLED(redux) — context: `past`/`future` stacks, `getUndo`/`getRedo`. This is *session* undo (command history), NOT persisted document version history — does not survive reload/export. Confirms: no corpus repo persists annotation edit history to disk except anvil's (deferred) palimpsest design.

### papadam — immutable author/timestamp provenance + server-authoritative moderation
- **Immutable `created_by`/`created_at` per annotation + moderation withholding** — `papadam/ARCHITECTURE.md:209-211` (CRDT schema: `created_by`/`created_at` immutable, `is_delete` server-authoritative); `is_instance_admin_withheld`/`is_instance_group_withheld` flags — COUPLED(Django/CRDT) — every annotation carries immutable authorship; moderation state is kept server-authoritative (deliberately OUT of CRDT). Real authorship provenance, but NOT citation/manifest provenance (no `seeAlso`/`rights`/`partOf`).

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Extraction effort | Maps to our need |
|---|---|---|---|---|---|
| WADM `creator`/`created` Page builder | `annomea/src/data/wadm.ts:12-13` | PURE | WADM types | trivial (copy) | Emit Agent + ISO timestamp on every AnnotationPage |
| `setCreator` immutable patch (Person Agent) | `annomea/src/data/annotation-edit.ts:43-45` | PURE | WADM types | trivial | Per-annotation author attribution |
| Content-hash file identity (SHA-256→8hex) | `anvil/...v2-multi-image.md:61` | PURE | `crypto.subtle` | trivial | Idempotent content-addressed naming = natural version key |
| Content-hash-DELTA version trigger | `anvil/docs/adr/0026...:31-36` | PURE (design) | hash fn | medium (build) | "what changed since last save" → write a version only on real change |
| CSL-JSON adapter mapping | `quire/.../citation/publication.js:24-41` | PURE | CSL schema | low | Shape exhibit/annotation data into a citable record |
| `getRights()` string-or-array normalizer | `IIIF/manifesto/src/IIIFResource.ts:132-137` | PURE | none | trivial | Normalize a rights/license URI for display |
| EDTF parse/format | `tropy/src/format.js:11-17` | PURE | `edtf` npm | trivial (dep) | Fuzzy scholarly dates in provenance fields |

## Gaps — what NO surveyed repo solves
- **DOIs / persistent citable identifiers** — nobody mints or resolves a DOI. anvil's `urn:anvil:annotation:<hash>:<index>` (`annomea/src/data/wadm.ts:55`) is a *local* URN, not a globally-resolvable citable identifier; no repo bridges URN→DOI/PURL.
- **Citation-string generation FOR AN ANNOTATION/REGION** — quire cites *pages/publications*, not a single annotated region. "Cite this region" (region URL → formatted citation) is unbuilt anywhere in the corpus.
- **Shipped, persisted annotation edit history** — anvil's palimpsest (`0026`) is **accepted-but-deferred (design only, no code)**; tropy's history is in-memory redux (lost on reload); annomea declares `modified?` but never writes it. No repo *ships* persisted per-annotation "as-of" history today.
- **`generator` field** — NOT emitted by any surveyed repo (annomea writes `creator`/`created` only; no tool-provenance `generator` Agent).
- **`modified` timestamp maintenance** — declared in annomea's type, written nowhere.

## Verdict for our build (lift / study / avoid, and why)
- **LIFT** `annomea/src/data/wadm.ts:12-13` + `annotation-edit.ts:43-45` verbatim — the canonical pure `creator`/`created`/Person-Agent builders; already our own house style. Add the un-written `modified` set and a `generator` Agent (gap) ourselves.
- **LIFT** the content-hash naming (`crypto.subtle` SHA-256→8hex) as identity + the **content-hash-DELTA version trigger** from ADR-0026 — it is the single coherent on-disk-history design in the corpus and is serverless-compatible (index-`versions` map sidesteps HTTP `readdir`). It is *design, not code* — budget to build, not copy.
- **STUDY** quire's `@citation-js/core` + CSL approach (`formatCitation.js:40`) rather than hand-rolling citation strings — but note it cites books/pages, not regions; we'd write the region→CSL-JSON adapter ourselves (gap).
- **LIFT** manifesto's `getRights()` normalizer + **STUDY** `getRequiredStatement`/`provider` parsing for read-side attribution display (axis 22 overlaps; rights covered there).
- **AVOID** tropy's redux history as a versioning model — it's session-undo, not persisted provenance; the ADR-0026 file-per-version approach is the right shape for a static host.
