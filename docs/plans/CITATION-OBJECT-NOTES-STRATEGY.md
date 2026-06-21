# Implementation Strategy — Object-level Notes + Rich Citation Rendering

**Scope:** feature-level; sibling to the project-wide `docs/IMPLEMENTATION-STRATEGY.md`. **Compiled** 2026-06-20 from the grilling corpus. **Inputs (sole):** ADR-0018 (keystone identity), CONTEXT.md §"Object-level Notes + rich citation rendering", the §109/Q-1 linkability decisions, ADR-0003 (append-only spine), ADR-0007 (Readings), ADR-0011 (gesture creation), ADR-0014 (self-describing artifact), ADR-0015 (map extent), ADR-0017 (section-as-annotation). Prior art cited inline in ADR-0018.

This is the **method and sequence**, not a task list — each phase earns its own detailed plan (leaf tasks + pre-written tests) when it starts.

---

## 1. Ordering principles (derived from the design, not invented)

1. **Sources before projections** (the through-line, CONTEXT §113). The append-only log + `AnnotationRecord` is the source; heads projection, viewer render, static page, and cite previews are all projections. → the data-model contract is built and frozen first; everything reads off it.
2. **Read-path before write-path.** The visible bug is the *viewer* renders a bare-IRI note invisible (`isWholeObject(0, undefined) → false`). Fix rendering before Studio can author one — so authoring never produces an invisible artifact, and each authoring phase has a working viewer to round-trip against.
3. **Adopted before invented.** Mechanical/adopted (the `isWholeObject` branch, the const/field/serializer, the existing frame-border, `ExhibitCiteCard` as a donor) ships before the gated inventions (whole-object toggle, hovercard, inline-crop card, AV track band, Browse view, build-time preview generation). A slip on any invention must not block the data-model fix that makes whole-object notes *correct*.
4. **Highest-assumption-load first.** The keystone is the **bare-IRI `AnnotationRecord` + `isWholeObject` semantics** — hardest to retrofit (serialization round-trip, merge target-compare, every `selectorOf`/`spatialCoverage` call site). Freeze that contract before any projection depends on it.

---

## 2. Phase decomposition (serial at the phase level)

### Phase 0 — Data-model keystone *(render-core, pure)*
- **Builds:** `isWholeObject()` no-selector branch (`coverage.ts:56`); `ARCHIE_WHOLE_OBJECT` const + `AnnotationRecord.wholeObject?` field as the **region-override** + serialize/deserialize; confirm a bare-IRI `target: string` round-trips through log → heads → history → importer (`recordFromHistoryAnnotation`).
- **Validates:** a bare-IRI note and a flag-overridden region note both project to the heads page and read back losslessly; `isWholeObject` true for no-selector; existing snapshots byte-stable (flag emitted only when set, mirroring `archie:emphasis`).
- **Does NOT validate:** any UI; any citation work.
- **Boundary:** render-core test suite green; zero app code touched.

### Phase 1 — Viewer renders whole-object Notes *(viewer; closes the visible bug)*
- **Builds:** image/map **frame border** wired to the new `isWholeObject` signal (`ExhibitView.svelte:206`); **AV full-width track band** (new, AV player/AvEditor render); linear-index reachability (Q-5) for zero-geometry notes.
- **Validates:** a hand-authored bare-IRI note is visible + clickable across image / map / audio / video; the invisible-note bug is dead.
- **Does NOT validate:** Studio authoring; citation rendering.
- **Boundary:** the viewer renders a fixture bare-IRI note in every medium.

### Phase 2 — Studio authors whole-object + exhibit Notes *(studio; closes the loop)*
- **Builds:** medium-agnostic **whole-object toggle** in every editor (image/map draw toolbar + AvEditor); bare-IRI target on create (`App.svelte` `onCreate` ~843); **convert** (toggle drops selector) + **redraw** (adds selector), both versioned `target` edits; **exhibit-level note** in the exhibit properties drawer (bare Manifest IRI, own logicalId/DAG — *not* a metadata field).
- **Validates:** author creates/converts whole-object + exhibit notes that round-trip to Phase-1 rendering.
- **Does NOT validate:** citation.
- **Boundary:** full author→view loop for the Object + Exhibit rungs.

### Phase 3 — Cite ladder + picker merge *(render-core + studio)*
- **Builds:** `LinkTarget.objectId` + `#/{slug}/o/<id>` route (parse/encode/resolve/validate in `link.ts`; `route.ts`/`deeplink.ts`); merge "¶ Cite" + "▦ By image" (`NoteEditor.svelte:62`) into one picker with **Search / Browse** views over the identical target set.
- **Validates:** an Object is citeable directly; all existing `archie:` refs still resolve (grammar *extended*, never changed); the picker inserts every ladder target.
- **Does NOT validate:** rich rendering of those cites.
- **Boundary:** every ladder cite resolves and navigates.

### Phase 4 — Rich cite rendering + build-time previews *(render-core/publish + viewer; heaviest)*
- **Builds:** type→mode router (hovercard / inline-block / plain link); hovercard component; inline cropped-region block card; map coord line; AV media chip + segment excerpt; **build-time preview generation** in `publish/` (image/map crop PNG, IIIF Image API URL branch, audio waveform snippet, video poster, native media-fragment); static-page parity (`ExhibitCiteCard` generalized to all types).
- **Validates:** each cite type renders per the mapping in the live viewer AND the durable static page; previews are real files.
- **Does NOT validate:** (terminal phase).
- **Boundary:** ship.

---

## 3. Reducibility classification (drives model-tiering + gating)

| Work | Class | Terminus |
|---|---|---|
| `isWholeObject` no-selector branch; `ARCHIE_WHOLE_OBJECT` const/field/serialize; bare-IRI round-trip | **Greenfield-specifiable** — corpus first (truth table + round-trip) | Small-model mechanical after corpus |
| `LinkTarget.objectId` + `#/o/<id>` parse/encode/resolve/validate | **Greenfield-specifiable** — corpus first (symmetry + round-trip, like `link.test.ts`) | Small-model mechanical after corpus |
| Build-time preview generation (per medium); IIIF Image API URL builder | **Greenfield-specifiable** per medium (one bake = one test); donor `field-studio/src/shared/lib/iiif-image-api.ts` | Small-model mechanical after corpus |
| Frame border (exists); `ExhibitCiteCard` plumbing; serialize wiring | **Adopted** — donor in-repo | Small-model mechanical |
| Whole-object toggle UX; AV track band; hovercard; inline-crop card; Browse view | **Invented** — "does a user grok it?" is not a unit test | **Human gate** (prototype-validation, philosophy #6) |

---

## 4. Surface audit (which phases produce UI → where judgment + design-system attach)

- **Pure infrastructure:** Phase 0 (all), Phase 3's route/grammar half, Phase 4's preview-generation half.
- **UI (invoke `/interface-design` at the decomposer; invented interactions get human gates):** Phase 1 (AV track band), Phase 2 (whole-object toggle in 3 editors; exhibit-note drawer), Phase 3 (Search/Browse picker), Phase 4 (hovercard, inline-crop card, type router).
- A UI leaf task without a design-system reference is under-specified (cites tokens the way it cites ADR-0018).

---

## 5. Deceptively-simple items (earn a corpus before a small model touches them)

1. **Bare-IRI round-trip through serialize / deserialize / merge.** Sounds like "allow a string target"; hides the heads projection, history sidecar, the importer, merge `target`-compare, and the `W3CTarget = string | SpecificResource` branch at *every* `selectorOf`/`spatialCoverage` call site. Corpus: round-trip + null-selector handling at each call site.
2. **Frozen `archie:` grammar extension (`#/o/<id>`).** link.ts says "never change it" — adding a form must round-trip AND not collide with `#/a/` (note) or `#/s/` (section). Corpus: parse/encode symmetry for all 4 forms + reject malformed (slug-hardening S5 path).
3. **Conversion region↔whole-object.** A mode transition on `target` under append-only: must bump `version`, preserve `logicalId`, not orphan the prior selector. Corpus: convert both directions + merge a converted note.
4. **Build-time preview scan.** Must find cited targets in prose (reuse the link-index pass), branch remote-IIIF vs local, and skip a target that no longer exists (broken cite → plain text + warning). Corpus per medium + broken-target case.

---

## 6. Mechanical execution system

- **Decomposer** (strong model, once per phase): phase → ordered DAG of leaf tasks, each with its acceptance test written first. All judgment here. UI phases invoke `/interface-design`.
- **Wave-builder** (mechanical): groups ready tasks with disjoint `write-targets` into parallel waves.
- **Executor** (small model): one leaf task → make its pre-written test green; no design, no scope expansion.
- **Verifier** (mid-tier): wave/phase close — green tests meaningful (not gamed), cross-worker seams cohere, Pre-Ship Gate at phase end.

Leaf-task schema: `implements` (cite ADR-0018 / Q-1, don't relitigate) · `blocked-by` · `donor` (file:line) · `write-targets` · `change` · `acceptance` (RUN cmd → binary) · `on-block` (STOP + escalate).

**Skills lead by phase character:** P0 = TDD/characterization (pure, corpus-first); P1/P2/P4-UI = brainstorming → interface-design → gate-enforcer + human (invented); P3 = mixed (TDD for grammar, brainstorming for Browse).

---

## 7. Enumeration strategy (just-in-time, not waterfall)

Enumerate a phase's leaf tasks only when its acceptance tests are writable. Phase 0, Phase 3-grammar, and Phase 4-previews are **enumerable now** (greenfield-specifiable — the corpus IS the enumeration). The invented UI surfaces (toggle, hovercard, inline-card, Browse, AV band) are **discovered after** their design pass + human gate. The live frontier is always the next wave + the phase skeleton — never the whole graph up front. Each discovered task cites what birthed it.

---

## 8. First concrete move

**Write the Phase-0 test corpus in render-core** — the keystone every projection depends on, most expensive to retrofit:
1. `isWholeObject` truth table, incl. **no-selector ⇒ true** (the bug fix) plus the existing override/coverage rows.
2. Bare-IRI `AnnotationRecord` (`target: "<canvasIRI>"`) round-trip: log → heads → history → `recordFromHistoryAnnotation` → identity.
3. `ARCHIE_WHOLE_OBJECT` serialize/deserialize: emitted only when set (byte-stable when absent, like `archie:emphasis`); read back as the region-override.

That corpus IS the Phase-0 enumeration. Everything else projects off the contract it pins.
