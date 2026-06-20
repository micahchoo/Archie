# NARRATIVE AS AN ADDITIVE LAYER — Implementation Strategy

**What this is.** The *method + sequence* to retire `LayoutType` as an author-facing arrangement choice and realise narrative as an emergent reading-mode that an exhibit *leads with* the instant it has sections — NOT a task list (each phase gets its own detailed `writing-plans` pass when it starts). Supplements `docs/IMPLEMENTATION-STRATEGY.md`; inherits its standing disciplines (the reducibility classifier, the leaf-task schema, `/thermo-nuclear-code-quality-review` per leaf). Link this from that doc's Deferred-work registry under the narrative items.

**Authority.** Design locked 2026-06-19, user-gated, in a `/grill-with-docs`-style session. The locked decisions are captured here faithfully and are NOT to be relitigated. Rationale → **ADR-0016** (this strategy's decision record; supersedes CONTEXT §105, amends mx-3e9794, corrects the stale mx-39d405).

**Status.** DESIGN LOCKED — not started. Phase 1 mechanical; Phase 2 comprehension-gated.

**Governance disposition (carried from the lock; ADR-0016 records it).**
- **KEEP** mx-41997c / ADR-0005 — *a Section is a self-contained reading beat, NOT a tour of Notes.* UNTOUCHED. The spine is still Section-built; this strategy changes only how a narrative is *born* and *led with*, never what a Section is.
- **SUPERSEDE** CONTEXT §105 — "Layout v1 set = Single + Grid + Narrative." The set is no longer an author-facing menu.
- **AMEND** mx-3e9794 (the two-axes decision): the *arrangement* axis collapses to **grid only**; `'narrative'` is reclassified from a spatial arrangement to an **emergent reading-mode**; CONTEXT §50–52's arrangement⊥reading-mode orthogonality — long declared, never modelled — is now realised in the model.
- **CORRECT** mx-39d405 ("Narrative = Phase-3, not built") — ALREADY STALE; narrative shipped. Note the correction in ADR-0016.

---

## The contract everything keys off (the keystone — read first)

**The Viewer's leading surface is a pure function of `Exhibit.sections.length`.**

- `sections.length === 0` → the **object grid leads** (1 object = the grid's auto-open special-case below).
- `sections.length >= 1` → the **narrative leads** (primary surface); the object grid is reachable *behind* it as an **index**.
- back to `0` → the grid leads again.

"A narrative exists" and "the exhibit leads with it" are **the same fact**. It can NEVER be a separate toggle the author sets. The core already derives this — `layout.ts:16-18`: `sections.length > 0 ? 'narrative' : objects.length > 1 ? 'grid' : 'single'`. This strategy's whole job is to make the rest of the system *project off that derivation* instead of off a persisted, author-pickable `exhibit.layout`.

Two corollaries of the lock that ride on the contract:
- **`'single'` is emergent, not picked** — a 1-object exhibit auto-opens its only object and suppresses the "back" affordance; a grid special-case on `objects.length === 1`.
- **The spine is one unnamed narrative per exhibit** = `Exhibit.sections[]` (today's shape). No new "Flow" entity. (Named-flows considered and rejected: a *Reading* is plural because interpretations intrinsically compete; a reading *path* has no intrinsic plurality.)
- **Spine ⊥ Readings, and they compose (CONTEXT §170, untouched).** A Section (sequence = IIIF Range) carries NO reading ref. The active-Reading radio (base-only on arrival; opt-in Cipher/Hoax, §181/§185) filters notes at whatever object the spine has framed; the Reading legend rides in persistent chrome while reading.

---

## Ordering principles (DERIVED from the design, not invented)

1. **Model/contract before projections — always.** The leading-surface rule (above) is the source; every screen is a projection of it. Make `resolveLayout` the single source (always derive, never read a persisted pick) *before* touching any UI that reads layout. A projection wired to the old persisted `layout` while the model still emits it is rework waiting to happen. This is the project's standing "sources before projections" applied to the layout contract.
2. **Mechanical/adopted before invented UX.** Retiring the union, ungating the editor, removing the picker, rewiring predicates, the 1-object auto-open, the test rewrites — all *mechanical* (donor = today's code; binary "done" test writable now). The staging spec (matched-pair cue, recessed card, overview invitation, dimming explainer, reorder preview, grid-index escape, first-run copy) is *invented* — "does a first-timer grok it" is not a unit test. Ship the mechanical reconciliation first; gate the invented UX on comprehension. The mechanical layer is a coherent, shippable state on its own; a slip on the invented UX must not block it.
3. **Highest-assumption-load first, within each tier.** In the mechanical tier, `resolveLayout`-as-single-source + the `LayoutType` retirement + the `store.ts:83` duplicate-enum reconciliation go FIRST — they are the contract the predicates, the picker-removal, and the auto-open all project from. In the invented tier, the **keystone matched-pair cue** (does the author understand their exhibit's *front door changed* at 0→1?) is the highest-load comprehension question — everything else is wording/prominence/timing around it.

---

## PHASE 1 — Mechanical / adopted (testable, low-risk)

**Builds (the lock's REDUCIBILITY Phase-1 list, verbatim in scope):**
- Retire `LayoutType` `'single'`/`'narrative'` *members* — the union loses both as *picked* values (`model.ts:34`); reconcile the duplicate inline enum at `store.ts:83` (`layout?: "single" | "grid" | "narrative"`) so there is ONE definition.
- Make `resolveLayout` (`layout.ts:15-24`) the single source: **always derive** from `sections`/`objects`; stop honouring a persisted `exhibit.layout`. Legacy stored values are ignored (lossless — see migration).
- **Ungate `NarrativeEditor`** — drop the `{#if currentLayout==='narrative'}` wrapper at `App.svelte:993`; the "Exhibit narrative" panel is ALWAYS present in the object-editor sidebar (mirrors the always-mounted `ReadingsRail` idiom).
- **Remove `LayoutPicker`** + its triggers: mount `App.svelte:1160-1164`, header trigger `App.svelte:908`, overview chip `ExhibitOverview.svelte:159`, `setLayout` `App.svelte:456-459`, `layoutPickerOpen` `App.svelte:436`. Preferred end state: the picker is gone entirely. If any layout chip survives, it **passively reflects reality** ("Narrative" once `sections>0`) — it never offers a contradicting choice.
- **Rewire routing predicates to sections-based:** `App.svelte:185` + `hasOverview` (`App.svelte:445`). Overview trigger = `objects.length > 1` (DROP the "OR narrative" clause — sections do NOT trigger the overview; they're authored in the object editor per §56).
- **1-object auto-open** (the `'single'` special-case): `ExhibitView.svelte:51-54,220` — a 1-object exhibit opens its only object and suppresses "back".
- **Audit the exhaustive `Record<LayoutType, …>` maps:** `ExhibitOverview.svelte:61-66`, the `LayoutPicker` copy map — they must compile after the union shrinks (or be deleted with the picker).
- **Rewrite the tests asserting removed semantics** + add new fixtures: `layout.test.ts:14` (the `layout:'single'` explicit-pick assertion), `:21`; `model.test.ts:17`; new fixtures per the test-fixtures rule (NEW fixtures over editing shared ones where consumers exist).
- **Migration = load-time coercion, no runner.** Stop persisting `'layout'` for narrative/single intent; `resolveLayout` ALWAYS derives. Legacy stored `layout` values are ignored (lossless). `voynich-reading` (`layout:'narrative'` + `sections[]`) → just `sections[]` (spine carries over; narrative emergent). Update `seed-data.ts` + `sample-data.ts`; prefer NEW fixtures over editing shared ones where consumers exist.

**VALIDATES:** the *model* contract — `resolveLayout` is the single source; the union no longer carries `'single'`/`'narrative'`; legacy `layout` values load losslessly and coerce to the derived surface; the editor is mounted unconditionally; the picker and its triggers are gone; routing predicates fire off `sections`/`objects`; a 1-object exhibit auto-opens. All binary, all unit/component-testable now.

**Does NOT validate:** anything about whether a first-time author *understands* the new behaviour. A green Phase 1 means the machine derives correctly and contradicting controls are gone — it says NOTHING about whether the author grasps that authoring a beat changed their exhibit's front door, or that removing the last beat reverts it. That is Phase 2's burden; do not read "Phase 1 tests pass" as "the UX works."

**Crisp boundary:** Phase 1 is everything whose binary "done" test is writable today against the current codebase — it removes a contradicting *choice* and centralises the *derivation*. The moment a task's acceptance becomes "a first-timer reads this copy and understands X," it has crossed into Phase 2.

---

## PHASE 2 — Invented UX (comprehension-gated per philosophy #6)

**Builds (the staging spec below is the spec Phase 2 builds against):**
- The matched-pair leads-now / back-to-grid cues (the keystone).
- The recessed always-present narrative card + its empty-state copy.
- The overview invitation strip + the spine surface on the overview.
- The in-object **object-switcher** (rail / prev-next) — "next object" follows OBJECT order, distinct from "next beat" (spine order).
- The dimming explainer for beats belonging to other objects + "Move here".
- The reorder path preview + the overview drag-legend deferral.
- The **grid-index escape from inside the read** — this breaks today's whole-exhibit takeover at `ExhibitView.svelte:196`; the grid must become reachable *behind* the narrative as an index, not a dead-end takeover.
- Disambiguation copy + the one-time first-run treatment.

**VALIDATES:** comprehension — does a first-time author, unprompted, understand each invented affordance? Specifically the keystone: **does a first-timer understand their exhibit's front door changed** when they add beat #1, and changed back when they remove the last? Plus: do they grok that beats belong to specific objects (the dimming explainer), that reorder defines the visitor's walked path (the path preview), and that the three peers (Narrative / Notes / Readings) are distinct (the orientation line)?

**Does NOT validate:** the model contract (that is Phase 1's, and is a hard prerequisite — Phase 2 builds *on* a green Phase 1, never substitutes for it). Comprehension passing does not re-prove correctness; a tune to wording/prominence/timing is the expected gate outcome, not a model change.

**Crisp boundary:** Phase 2 is every artifact whose "done" test is "a representative author understands it without being told" — it cannot be made mechanical and terminates at a **human comprehension gate**, never at a unit test. Per the project's LLM-implementer rule (IMPLEMENTATION-STRATEGY §"When the implementer is an LLM" #2): an LLM **builds the prototype and STOPS for the user** — it cannot self-certify these; it will confidently rate its own UX as clear.

**Comprehension / prototype checks to run (2–3 representative first-time authors each; clickable prototype):**
1. **Keystone matched-pair (highest load).** Author adds beat #1. *Does the visitor see they have changed the exhibit's front door?* Then they remove the last beat. *Do they understand it reverts to the grid?* Failure mode to watch: they read 0→1 as "added a card to a sidebar," not "my exhibit now opens with a narrative." Tune the cue copy/timing/prominence, not the model.
2. **Recessed card discoverability.** With an empty narrative, does the recessed card read as *an invitation to start a narrative* (not buried under, nor competing with, the object's Notes)?
3. **Beat-belongs-to-object.** On a beat-less object, does the dimming explainer make clear those beats belong to *other items* and stay in the spine?
4. **Reorder = the walked path.** Does the path-preview line ("This is the path visitors walk") land, and does the overview drag-legend successfully demote drag to *fallback grid order only* when a narrative exists?
5. **Grid still reachable.** From inside the read, can they find their way to the object grid (index), and do they understand it is still there?
6. **Three peers.** Where Narrative / Notes / Readings first co-occur, does the one orienting line successfully separate them?

---

## THE FULL STAGING SPEC (the spec Phase 2 builds against)

Progressive disclosure for FIRST-TIME authors. One-time, non-blocking, self-dismissing. No sample, no tutorial gate. Load-bearing copy is verbatim — treat strings as fixtures.

**1 — Land (overview).** Quiet invitation strip. Withhold picker/internals.
- eyebrow: **Exhibit narrative**
- line: **Walk visitors through these in an order, with your writing.**
- button: **＋ Start the narrative**

**2 — The card (inside an object).** Recessed when empty so it doesn't bury the object's Notes. Empty-state:
> **No sections yet. Add one to begin the narrative — each is shown with one media item and the view you frame, the same box you draw for a note. The first will be shown with the item you're viewing now — [label].**
- one button: **＋ Add to the narrative**

**3 — First add (0→1).** Beat card = title · prose · camera row (**Whole item shown** + **Set area** / **Set moment**). Plus THE KEYSTONE MATCHED-PAIR CUE (one-time, inline, non-blocking):
> **This exhibit now opens with your narrative. Visitors see your sections first; the media grid becomes a list they can still reach. (Remove every section to go back to a plain grid.)**
- link: **Preview how it opens**

**4 — Frame + write.** Canvas banner:
> **Draw a box on the image — the same way you place a note — to set what this section shows when a visitor reaches it.**
- **Cancel · Esc**
- settles to: **▭ area set** / **⏱ m:ss–m:ss**
- by the prose: **¶ Cite ⌘K**
- (Show the **— this sets the view, not a note** contrast ONLY for returning authors.)

**5 — Second beat + switch object.** Beats for other objects DIM; the matching beat is lit. A dimmed beat shows **Shown with · [label]** + **Move here**. Switching to a beat-less object shows the explainer:
> **These sections belong to other items in this exhibit — they stay in the spine. Add one here, or move one with 'Move here.'**

> _**[SUPERSEDED 2026-06-19 — narrative card → navigation]:**_ the **Move here** rebind (lines 70, 115–116, 144) was REMOVED. The **Shown with · [label]** line is now the card's *navigation* control: clicking it jumps the rail to that section's object and FOCUSES its framed region on the canvas (App `navigateToSection` → `switchObject` + `canvasFocus` → `Canvas focus=` → `fitRegion`), mirroring the viewer's `NarrativeReader.activate`. A section is bound to its object at creation; the spine is WALKED between objects, never rebound. The beat-less-object cue shipped as: **"These sections belong to other items in this exhibit — they stay in the spine. Click a section to jump to its item, or add a new one here."**
- Reorder arrows are HIDDEN until ≥2 beats (not shown-disabled).

**6 — Reorder.** ▲/▼ + path preview:
> **Reading order: Section 1 → 2 → 3, across [A] → [B]. This is the path visitors walk.**
- Overview drag legend defers when a narrative exists:
> **Visitors follow your section order. Dragging here only sets the fallback grid order, used when there's no narrative.**

**7 — Delete / revert.** Quiet ✕ + Undo. Removing the LAST beat fires the reverse cue:
> **Remove the last section? Your exhibit goes back to opening with the media grid.**
then the empty state:
> **Narrative cleared — this exhibit opens with the media grid again. Add a section to lead with your writing instead.**
- No confirm on non-last deletes.

**THREE PEERS (rung g).** Narrative (sidebar top) · Notes (below, "this object") · Readings (canvas rail) — taught by spatial separation + one orienting line where they first co-occur.

**First-run treatment (cross-cutting).** Every cue above is one-time, non-blocking, self-dismissing. The "— this sets the view, not a note" contrast and other disambiguation appear ONLY for returning authors; first-timers get the plain instruction.

---

## DECEPTIVELY-SIMPLE items — write the test corpus FIRST

These sound like one-liners but each hides an invariant / mode-transition that the binary "done" test needs more than a happy-path case to pin. Per IMPLEMENTATION-STRATEGY's detector, the corpus is where the hidden complexity surfaces — write it before a (small) model touches the code.

| Looks like… | Actually hides | Class | Corpus that surfaces it |
|---|---|---|---|
| **The 0↔1 leading-surface flip** ("show narrative when sections exist") | a **mode/state transition both directions** — 0→1 must flip the leading surface AND fire the keystone cue; 1→0 (remove last beat) must revert AND fire the reverse cue; the grid must stay reachable as index throughout; idempotent re-derivation (no persisted pick can shadow it) | d | flip-up (0→1 leads-narrative), flip-down (last delete → leads-grid), non-last delete (≥1 remains → still narrative), re-derive-after-reload (legacy `layout` present is ignored) |
| **Migration coercion of legacy `layout`** ("ignore the stored field") | a **load-time invariant across all stored shapes** — `layout:'narrative'+sections[]` → sections-only (spine intact); `layout:'single'` → derived from objects; `layout:'grid'` on 1 object → derived single; stored value NEVER shadows the derivation; lossless | a | a fixture per legacy shape → load → assert derived surface matches sections/objects, `layout` had no effect, spine preserved (esp. `voynich-reading`) |
| **"Move here" re-anchors a beat** ~~("change a section's object")~~ **[SUPERSEDED 2026-06-19 — removed; no rebind; card is now navigation]** | ~~a **mode transition that must clear stale framing** — moving a beat to the current object re-anchors `objectId` AND must clear/invalidate the beat's framed `start` (an area drawn on the old object's image is meaningless on the new one); ordering preserved; the dimmed→lit state updates~~ — N/A: sections are bound at creation and the spine is walked, not rebound (see §5 supersession note) | ~~d/a~~ | ~~move-clears-area, move-preserves-order, move-updates-dim-state~~ — obsolete |

These three are exactly where a confident-wrong implementer ships plausible code that silently breaks: a one-direction-only flip, a migration that lets the stored value win on one shape, a re-anchor that keeps a now-meaningless region. The corpus is the only thing that makes them safely mechanical afterward.

---

## First concrete move

Not "write a plan" — that recurses. **What gets typed into real files first:**

**Make `resolveLayout` the single source + retire the `LayoutType` members + reconcile `store.ts`.**
- `layout.ts:15-24` — `resolveLayout` ALWAYS derives from `sections`/`objects`; drop the `exhibit.layout ??` short-circuit so no persisted pick can shadow the derivation.
- `model.ts:34` — `LayoutType` loses `'single'` and `'narrative'` as picked values; reconcile the duplicate inline enum at `store.ts:83` so there is exactly ONE definition.
- Land it **with its tests green against the flip + migration-coercion corpus** above (the deceptively-simple items) — the 0↔1 flip and the legacy-`layout`-ignored cases especially.

It goes first because it is the **contract everything else projects off** (ordering principle 1): the ungated editor, the removed picker, the sections-based predicates, the 1-object auto-open, and the entire Phase-2 staging spec all read the *derived* leading surface. Wire any projection before the source is centralised and you wire it to a `layout` field that is about to stop existing.

This first move is large enough to deserve its **own `writing-plans` pass** before code (strong-model decompose → DAG → the corpus as tests first) — but that plan's *output* is the `resolveLayout`/`LayoutType`/`store.ts` change above with its corpus green, not more strategy. Everything else in Phase 1 waits behind it; Phase 2 waits behind all of Phase 1.

**Standing rule (inherited):** code review = `/thermo-nuclear-code-quality-review` per leaf task, before commit. No executor output ships unreviewed.
