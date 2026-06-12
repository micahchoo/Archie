# What makes Archie Archie — and what I'd have done differently

*Retrospective review, 2026-06-11. Sources: CONTEXT.md (full read), docs/adr/0001–0013, architecture + affordance exploration of packages/* and apps/*. Cites decisions by their CONTEXT/ADR anchors.*

---

## Part 1 — The identity: what makes Archie Archie

### 1. One pattern at every boundary: "define the authoritative source, project thin"

This is the genuine architectural signature, and it's unusually disciplined. The through-line table (CONTEXT §102–116) isn't aspirational — it's verifiably implemented:

- **Annotations**: append-only log → version DAG → heads projection (`render-core/src/spine/`, ADR-0003). The heads compiler is a pure idempotent function; merge classification (`merge.ts`) walks parent chains, never trusts wall-clock.
- **Publish**: zip is the primitive; GitHub Pages is a ~200 LOC adapter over the Contents API; "local view" is a sibling adapter writing the same tree to an FSA folder. Hosted vs portable Viewer is *one* shell whose data source is detected in one file (`apps/viewer/src/published.ts`, ADR-0008/0010).
- **Rendering**: `@render/core` (pure TS, no DOM) → `@render/mount` (vanilla wiring) → `@render/svelte` (<500 LOC budget that doubles as a logic-leak detector). Dependency edges verified one-directional, no cycles, no app→package-internal reaches.
- **Storage**: one Filesystem seam, three backends (OPFS / FSA folder / zip-as-file), capability-selected and *hidden* — the user sees only Playground vs Project.

The few places that resist the pattern (empty states, overlay contrast, EXIF) are explicitly named as "orphan gaps" and scheduled by gate, not dependency. That honesty is itself part of the identity.

### 2. Standards as load-bearing structure, not compliance theater

WADM and IIIF Presentation 3 are the actual on-disk model, not an export format. The payoff compounds: a Reading IS an `AnnotationPage` grouped by an `AnnotationCollection` (ADR-0007), so Mirador gets toggleable readings for free; rights are `requiredStatement`/`rights`/`provider`, so pure viewers show credit for free; the three-tier interop contract (pure WADM consumer → heads; PROV-aware → history; Archie → full DAG) means nobody is broken. The §96 reversal — abandoning the per-note `archie:layers` string for the IIIF-native model *because pure viewers could only "show all"* — shows the standard actively steering design, the rare direction of travel.

### 3. A maintained domain language that affordances obey

CONTEXT.md's Language section, with avoid-lists, is the rarest artifact here. "Layer" was diagnosed as a *stroad* (one word, two jobs) and split into **Reading** (exclusive, curated, canvas legend, visual identity) and **Tag** (additive, per-note, note-pane chip, no identity) — and the UI's information architecture *enforces* the split: legend on the canvas, chips in the pane, ordered list vs unordered toggles as the visual tell for Section-vs-Reading. Vocabulary discipline becoming IA discipline is what makes the affordances coherent rather than a feature pile.

### 4. Affordance philosophy: declared intent, honored

The six UX principles (§133–141) actually bind: layout = the author's declaration of reading intent (markers low-weight in object-led, progressive-reveal in prose-led); Playground vs Project split at the entry door, conversion offered at first value, never a storage prompt up front; editing happens *at the locus* with selector dimensionality matching the medium (`xywh=` / `t=` / both, ADR-0006); deep-links land exactly where pointed with fading orientation chrome. "Adopted patterns ship clean; inventions get prototype gates" is a real risk-budgeting discipline — the invention inventory (§201) names all six and orders the validation rounds.

### 5. The original synthesis: merge vs Readings

The cleanest idea in the project (§164): the merge spine reconciles **accidental** divergence (same note, edited twice → conflict card); Readings preserve **essential** divergence (competing interpretations are different notes that never conflict). Scholarly disagreement gets a structural home instead of a merge-conflict workaround. "Fork into a separate Reading" as a conflict resolution is the kind of move only this architecture could offer.

### 6. No-server, radically

Not "serverless" marketing — an actual constraint that shaped everything: in-browser tiling decisions (ADR-0004), browser-side data bridges (OPFS can't be read by node, §214), hash routing, PAT-paste-each-publish, the portable `.archie.zip` reader. The lock is doing enormous design work, mostly for the better.

---

## Part 2 — What I would have done differently

Seven items, roughly ordered by how much I'd fight for them.

### 1. I would not have shipped the merge UI in v1

The append-only log is cheap and right (citation integrity falls out of it). But the user-facing collaboration surface — conflict cards, summary panel, identity prompts, import-changed-zip review flow — was flagged in CONTEXT itself as "the dominant remaining cost" (~4–6 weeks) and "the one row where thin strains hardest, highest impl-risk-per-line." It shipped before a single real second author existed, on an overridden strip-it recommendation (§88). I'd have kept the DAG *format* (so history is never lost and merge is buildable later from the same bytes) and deferred the entire merge UX to a v1.1 gated on an actual collaboration pilot. The Readings-absorb-disagreement insight (§164) retroactively weakens the merge UI's case further: the scenario that most needs v1 collaboration — rival interpretations — explicitly *doesn't* need merge.

### 2. I would have given the apps the same budget discipline as the packages

`@render/svelte` has a <500 LOC logic-leak budget; `App.svelte` is **2,013 lines** owning the root state machine, OPFS/binding persistence, publish orchestration, the WADM form, the keyboard registry, and three view states. The asymmetry is the architecture's one blind spot: the source-projection rule was applied to data boundaries but not to UI state. From day one I'd have mirrored the spine in the Studio: one canonical app store (the log + library meta), components as pure projections, side-effects (persist, publish) in named modules. The decomposition is now scheduled debt; it would have been near-free at the start.

### 3. I would have made the log the *only* writer — no dual annotation state

Studio currently has two sources of truth for annotation state: Annotorious's internal `state.store` (undocumented, guarded at `mount.ts:81`) and the append-only log, synced by `onSelect`/`setSelected` callbacks with **no reconciliation path**. If OSD/Annotorious crashes mid-edit they diverge silently — in the hottest path of the product, violating the project's own "one source of truth" rule. I'd have wrapped Annotorious as a pure renderer of heads: every gesture appends to the log first, Annotorious re-renders from the projection. Slightly more latency ceremony, structurally impossible to diverge.

### 4. I would have treated save failure as a first-class UX event from the start

150 fire-and-forget findings cluster on persistence: `void persistLibrary()` in `library-meta.svelte.ts`, five-plus unhandled async save methods in `store.ts`. For a product whose entire persistence pitch is "your work is safe and you never think about storage," a *silent* save failure is the worst possible failure mode — it converts the invisible-storage virtue into invisible data loss. A serialized write queue with success/failure surfaced in the existing save indicator (which already exists in the project bar) is small, and retrofitting error paths onto 150 call sites is not.

### 5. I would have shipped one layout, then closed the loop

Single + Grid + Narrative all landed in v1 (§97, acknowledged as "ADDS UI scope, not a free swap") while the Viewer could only render three hardcoded sample routes — the demo-harness finding (§212) blocked publishing *any* real authored Library for weeks. The generic `exhibits.json`-driven shell was the actual product loop, and breadth shipped before it. I'd have shipped Single only, pushed one real exhibit through author→publish→read→cite with outside readers, then added Grid and Narrative against observed need. The team's own "adopted ships clean, inventions get gates" rule argues for this — the *loop* was the ungated invention.

### 6. I would have measured the bundle before letting a budget make decisions

The 240 KB gz budget was inherited from v4, never validated, and almost certainly breached before any Archie code ran (OSD + Annotorious ≈ 250 KB; anvil baseline 328 KB). CONTEXT now admits it "was never real" (§231) — but it had already served as a stated reason in ADR-0004's wasm-vips rejection. The rejection survives on its other leg (no `dzsave`), so no harm done in outcome, but a fictional constraint participated in a real decision. Rule I'd adopt: a numeric budget may not appear in an ADR until it has a measurement baseline next to it. (docs/bundle-size.json exists now; it should have existed first.)

### 7. I would have aimed the tests at the inventions, not the certainties

237 tests sit densely on `render-core` — pure functions (geometry, serialize, merge) that are the *least* likely code to regress — while the six gated inventions (playground→project conversion, three-configs binding, merge review, overview-as-canvas) have prototype gates but near-zero regression coverage, and the persistence binding in Studio is effectively untested. The 30+ `playwright-artifacts-*` / `playwright_chromiumdev_profile-*` directories littering the repo root say browser testing happens ad-hoc and isn't harvested into a gate. Inverting the pyramid — characterization tests on the binding seam and a small always-green browser suite on the publish loop — would protect the things the project itself identified as "the schedule risk lives entirely here."

### Honorable mentions (would relitigate, wouldn't fight)

- **Exhibit-nested Objects (ADR-0001):** accepted same-painting-twice drift. Defensible v1 cut, but I'd have kept Object IDs *library-scoped* even while nesting, so a later shared-pool migration is a projection change, not an ID rewrite through every annotation target.
- **Hash routing + client-only rendering vs the citation mission:** `#/a/<id>` deep links are invisible to crawlers and the Wayback Machine. For a tool whose stated driver is *scholarly citation integrity*, archivability of published exhibits deserves a named decision (even if the answer is "accepted cost of zero-config hosting").
- **CONTEXT.md as both glossary and ledger:** 245 dense lines, every decision amends it, superseded sections kept inline. The project's own stroad diagnosis applies — split the stable Language from the append-only decision ledger (docs/decisions/ already exists) before the file becomes the merge conflict it warns about.

---

## Compression check (caveman)

Archie: one truth, many thin views — log makes pages, zip makes sites, core makes adapters. Words mean one thing each; UI obeys the words. I change: merge UI too early; app blob too big; two annotation truths, keep one; saves fail silent, make loud; three layouts before one real reader; fake number made real choice; tests guard safe code, not risky code.
