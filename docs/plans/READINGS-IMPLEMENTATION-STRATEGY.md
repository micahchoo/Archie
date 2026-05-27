# READINGS — Implementation Strategy

_Compiled 2026-05-27 from the `/grill-with-docs` design (CONTEXT.md → "Readings & Tags", Q1–Q17). The **method + sequence** to build the Reading model and the Voynich plural-Readings exercise — NOT a task list (each phase gets its own detailed plan when it starts). Supplements `docs/IMPLEMENTATION-STRATEGY.md` — link this from its Deferred-work registry._

## Design corpus (sole inputs)
- `CONTEXT.md` → **"Readings & Tags"** (Q1–Q17) — authoritative.
- `HANDOFF.md` → ▶ RESUME "LAYERS→READINGS" block — build/rename debt + grounded Voynich inputs.
- The spine (CONTEXT §86, ADR-0003): append-only log → projection.
- Grounded research: Beinecke IIIF manifest `collections.library.yale.edu/manifests/2002046`; competing readings (Cipher/Hoax/…); sections; apparatus facts.

## What this builds (one line)
"Layer" was one word doing two jobs; it splits into **Reading** (a mutually-exclusive interpretive pass = an IIIF `AnnotationPage` per Object under an `AnnotationCollection` per Exhibit) and **Tag** (additive per-note discovery, now carrying apparatus). The Voynich demo is re-authored as a real Studio project — competing Cipher/Hoax readings of real Beinecke folios — and shipped as a template.

## Ordering principles (DERIVED from the design, not invented)
1. **Source before projection.** A reading lives on the append-only log (the `reading` field on a record) BEFORE it projects to an IIIF `AnnotationPage` BEFORE it projects to the viewer legend. Build in that order; a projection built before its source is rework.
2. **Mechanical/adopted before invented.** The model rename + partitioned heads-compiler are *greenfield-specifiable* (corpus → green). The legend, active-reading authoring, and the Voynich content are *invented* (human-gated "does a reader/curator grok it"). Ship the mechanical spine before gating on the inventions.
3. **Highest-assumption-load first.** The single `reading` field + the partitioned projection is the keystone everything assumes and the hardest to retrofit (it changes serialization + manifest + mount). Build it first.

## Phases (serial at the phase level)

### Phase 1 — Reading data model (SOURCE / keystone)
- **Builds:** `record.reading?: string` (replaces `layers: string[]`, single-valued); `archie:reading` (replaces `archie:layers`); `query/filter.ts` reading equivalents; `Exhibit.readings: {id,name,description,colour}[]` registry (the AnnotationCollection identities).
- **VALIDATES:** the source-of-truth shape + mutual-exclusivity + registry resolution.
- **Does NOT validate:** rendering, toggling, authoring.
- **Boundary:** the log round-trips a single reading per record; the registry resolves id→identity.
- **Reducibility:** greenfield-specifiable — corpus FIRST.

### Phase 2 — Heads-projection partitioning (PROJECTION)
- **Builds:** heads compiler (`publish/site.ts:175–187`) → **N `AnnotationPage`s per Object partitioned by `reading` + a base page**; each reading-page `partOf` → its `AnnotationCollection`; emit the AnnotationCollections into the tree; `Canvas.annotations` (`iiif/manifest.ts:57`) → multi-element array.
- **VALIDATES:** IIIF-native serialization; **pure-viewer toggles (Mirador) for free**.
- **Does NOT validate:** Archie viewer UX, authoring.
- **Boundary:** a published exhibit opens in Mirador with toggleable reading-pages.
- **Reducibility:** greenfield-specifiable — corpus FIRST. **DECEPTIVELY SIMPLE** (see below).

### Phase 3 — Viewer Reading legend + flip (READER projection) [INVENTED]
- **Builds:** canvas legend (radio: base + readings; base-only arrival; flip swaps the active page; base always visible); Tag chip row in the note pane (never built); mount per-page toggle (`mount.ts:150` flattens today).
- **VALIDATES:** the reader experience (Q16) — "does flip-between-readings read."
- **Does NOT validate:** authoring.
- **Boundary:** a reader flips Cipher↔Hoax on one region and watches it reinterpret in place.
- **Reducibility:** invented (human gate) + adopted mount. **interface-design** skill ("curator's study") attaches at the decomposer.

### Phase 4 — Studio Reading authoring (active-reading context) [INVENTED]
- **Builds:** overarching **Readings panel** (create/name/describe/colour at exhibit level); per-note single-select defaulting to the active reading; the **active-reading context**; Tag input carries apparatus; the publish-time description **soft-warning** (Q17 — join the `brokenLinks` advisory strip).
- **VALIDATES:** authoring (Q3/Q13) — "does the curator grok active-reading + overarching readings."
- **Does NOT validate:** collaboration-specific flows (those ride the existing merge/import UI — Readings already proven orthogonal, Q12).
- **Boundary:** a curator creates a reading, sets it active, authors notes into it, switches to author the rival pass.
- **Reducibility:** invented (human gate) + interface-design.

### Phase 5 — Voynich plural exercise (INTEGRATION / dogfood) [INVENTED content]
- **Builds:** the source Library — real Beinecke IIIF folios (Herbal · Voynichese script · Rosettes · …), genuine **Cipher + Hoax** reading notes, the **keystone shared-region pair** (one glyph-block annotated under both), apparatus **Tags** (Currier A/B · radiocarbon · codicology); freeze as a **template** (`DEFAULT_EXHIBITS`; canonical form = committed source Library); **retire `voynich.ts` + `import-voynich.mjs`**; publish → committed tree.
- **VALIDATES:** the WHOLE stack end-to-end (dogfood) + "does plurality read to a DH practitioner."
- **Does NOT validate:** nothing new — it is the integration gate.
- **Boundary:** opening the Voynich template shows base; entering Cipher/Hoax flips the contested region.
- **Reducibility:** invented *content* (scholarship-grade annotation = human authoring) on mechanical scaffolding.
- **First Phase-5 task (sanity check, before authoring any content):** verify the editor allows **two notes on the same region with different `logicalId`s** — the keystone (rival Cipher/Hoax notes co-located on one glyph-block) depends on it. Almost certainly true by construction (different logicalIds = different notes), but confirm in 5 min before authoring ~30 notes against a false assumption.

**Phase 1 DEPLOYMENT PREREQUISITE — migration (NOT a side-channel).** v1 has shipped + is user-verified, so real Libraries in OPFS already carry `record.layers: string[]`. The instant Phase 1's `reading?` code reads that data it fails at load — so Phase 1 **cannot ship** without migration. The v1.1 migration runner (§90.3) is itself unbuilt, so don't depend on it. **Chosen approach (b): inline migration on read** — `load()` transforms the old shape when it sees it, version-stamped, no runner needed. **Collapse rule (lossless): legacy `layers: string[]` → Tags, NOT a `reading`.** Rationale: a Reading is exclusive (one) and would force data-loss on a multi-value `layers`; Tags are additive (many) and absorb `string[]` losslessly — and the old undifferentiated "layer" maps most safely onto the additive side of the split. The user re-curates Readings deliberately in the new model (promoting a tag to a reading is a manual act). Mechanically: `record.layers[]` → `purpose:tagging` bodies; stamp version; drop `archie:layers`. **A migration round-trip corpus is a Phase 1 leaf task** (old-shape Library → loads → layers became tags → no reading set). The Voynich authors fresh → no legacy data there, but every other v1 Library hits this.

## Reducibility classification → model-tiering & gating
| Phase | Kind | Terminus |
|---|---|---|
| 1 model | greenfield-specifiable | small-model mechanical AFTER corpus |
| 2 projection | greenfield-specifiable (deceptively simple) | corpus FIRST, then mechanical |
| 3 legend/flip | invented | human gate + interface-design |
| 4 authoring | invented | human gate + interface-design |
| 5 Voynich | invented content | human authoring + gate |

Phases 1–2 → small-model executors after a strong model writes the corpus. Phases 3–5 → design-skilled, human-gated.

## Deceptively-simple items (corpus before any executor touches them)
- **Phase 2 partitioning** sounds like "group notes by reading" but hides: the **base page** (no-reading notes), **readings with zero notes on a canvas** (emit nothing — no empty page), the **`partOf` collection chain**, **mutual-exclusivity at the boundary**, and the **multi-element `Canvas.annotations`** ordering. Write the corpus (`log → expected {N reading-pages + base + partOf}`) FIRST — that is where these surface.
- **Migration collapse rule** — legacy `layers: string[]` with >1 value → which single `reading`? Corpus the rule before the runner.

## Mechanical execution system
- **Decomposer** (strong model, once per phase): phase → ordered leaf-task DAG, each with a pre-written acceptance test. Phases 3–5 invoke `/interface-design:interface-design` at the decomposer; UI leaf tasks cite `.interface-design/system.md` ("curator's study") the way they cite ADRs.
- **Wave-builder** (mechanical): group ready tasks with disjoint write-targets.
- **Executor** (small model): make one pre-written test green; no scope expansion.
- **Verifier** (mid): tests meaningful + cross-worker seams cohere — the **layers→reading rename is the cross-cutting seam** (touches `query/filter.ts`, `spine/serialize.ts`, `publish/site.ts`, `iiif/manifest.ts`, both apps); coordinate it via the shared prefix.

## Enumeration strategy
- **Enumerable now:** Phases 1–2 (the corpus IS the enumeration — one test per task).
- **Discovered later:** Phases 3–5 leaf tasks emerge from each phase's decomposer pass + the human gate on the inventions.

## ADRs to write (grill deferred them)
- **ADR-0007 (proposed): "Reading = IIIF AnnotationPage/AnnotationCollection; mutually-exclusive membership v1"** — reverses §92's per-note-string layer model; amends ADR-0003 (the spine: heads projection now partitions by reading). Provenance already in CONTEXT §92.

## First concrete move
**Phase 1 / Task 1 — write the `reading` test corpus, then rename.** In `@render/core`: a failing corpus for (a) `record.reading` round-trips through the log + heads; (b) at most one reading per record (mutual exclusivity); (c) `Exhibit.readings` resolves id→{name,description,colour}; (d) a no-reading record = base. THEN make it green: `layers: string[]`→`reading?: string`, `archie:layers`→`archie:reading`, `layersOf`/`filterByLayer`/`allLayers`→reading equivalents. This is the keystone source the entire build hangs off; nothing else can be built before it.
