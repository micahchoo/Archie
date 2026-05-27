# Archie — Implementation Strategy (meta-level)

How to go from the design (`CONTEXT.md` + `docs/adr/` + `docs/spikes/`) to a built v1. This is the *method and sequence*, not a task list — each phase gets its own detailed plan when it starts.

## Three ordering principles (everything below derives from these)

1. **Sources before projections.** The through-line (`CONTEXT.md`) says every boundary is an authoritative source + a thin projection. Build the source first, the projection second — *always*. The append-only log before the heads-page; the `Filesystem` seam before OPFS/FSA/zip backends; the original image before the display-master; `@render/core` before `mount` before adapter; the zip before the host-adapters. A projection built before its source is rework waiting to happen.
2. **Adopted before invented.** The spike (`spikes/0001`) cleared the extraction risk: anvil's logic lifts cleanly. So the *adopted* tier (anvil editor, annomea reader, the pure libs, list-Library, zip) is a near-term, low-risk milestone. The *invented* tier (the 6+2 inventions in `CONTEXT.md`) rides behind it, each on a validation gate. The adopted core is a working tool on its own; a slip on any invention must not block it.
3. **Highest-assumption-load first, within each tier.** In the adopted tier, the data model (ADR-0003) goes first — it's the source everything projects from, and the ADR warns retrofitting the version-DAG is the expensive path. In the invented tier, the validation order is **merge-UI → playground→project → overview-as-canvas → cold-arrival → three-configs → conflict-card-form**.

## Phases

**Phase 0 — Skeleton & seams (Prep; serial; everything depends on it).**
- Monorepo + the `@render` package boundaries from ADR-0002 (`core` / `mount` / `svelte`) + the two apps (`studio`, `viewer`). The boundary *is* the contract; establish it before filling it.
- **The data model first** (ADR-0003): append-only log + version-parent DAG + WADM types (branded). This is the keystone source; build + test it standalone before anything reads it.
- The `Filesystem` seam (Q4/UX-Q2) as an interface, before any of its three backends.
- The URL↔selector serializer, geometry/selector parsing, IIIF resolution — the pure `@render/core` modules the spike rated CLEAN-LIFT.
- Stand up the **test corpus** now: 8-orientation EXIF fixtures, WADM round-trip fixtures (rect+polygon must pass; ellipse/path are the v1.1 svgpath gate), version-DAG merge fixtures (fast-forward / concurrent), and — critical — a **pure-WADM-consumer interop fixture**: a sample Archie heads-page loaded in a real third-party viewer (Mirador / Universal Viewer) renders *current* notes only, not history versions. Until that passes, ADR-0003's three-tier interop contract is hypothetical, not proven.

**Phase 1 — Extract `@render/core` + `@render/mount` (Action; mostly serial; spike-de-risked).**
- Lift anvil's CLEAN-LIFT modules into `core` as plain TS.
- Do the **one delamination** the spike flagged: invert anvil's `$effect`/`$state` selection drivers into an imperative `mount` surface (`fitBounds`, `setSelected`, `destroy`) + an `onSelect` callback the adapter owns; de-dupe the polygon→bbox math currently divergent across components. This is the riskiest extraction piece — do it early, in isolation. **Acceptance criterion (the gate, not a gesture):** anvil's editor mounted via the new `@render/mount` + `@render/svelte` path passes the *same* fitBounds-on-select behavioral test as anvil-stock. If it doesn't, the delamination isn't done.
- Thin `@render/svelte` adapter (<500 LOC budget = leak detector).

**Phase 2 — Adopted-core milestone (the working tool; ZERO inventions).**
The thin end-to-end slice that is a real annotate-and-publish-to-GH-Pages tool:
- Single + Grid layouts, object-led reading default, markers visible (A2 + stroke-over-stroke).
- anvil's editor (canvas+sidebar) + annomea's reader (popup/drawer) via `@render/svelte`.
- list-UI Library, the full fitBounds nav contract.
- **Storage: the `Filesystem` seam + BOTH backends** (FsaFilesystem folder on Chromium, DownloadFilesystem zip elsewhere) via a *plain* "Open folder / Open zip" chooser. The backends are **adopted-tier** (anvil has them; the spike rated the seam cheap), so they belong in Phase 2 — this is what lets the dogfood validate the **folder/git-native on-ramp** that the GH-Pages story leans on, not just zip-shuttling. What's deferred to Phase 3 is the *invented entry-flow*: the Demo/Real-by-door split (UX-Q1) and the "Project"-abstraction-over-three-configs (UX-Q2). Keep that line crisp so dogfood feedback is read right.
- **Phase 2 validates:** the core annotate→publish value, the fitBounds nav, both persistence backends, GH-Pages publish. **Phase 2 does NOT validate:** any invented interaction (playground/project entry, overview-as-canvas, narrative, collaboration) — those are Phase 3. Don't read "users liked Phase 2" as validating the inventions it didn't contain.
- GH-Pages publish via the Contents API (the "Connect to GitHub" walkthrough is a minor invention — its lightest form here).
- **Dogfood this.** It validates the core value with no unproven interaction. **Measure the real bundle here** and pre-commit the response tiers so the number triggers an action, not a re-debate: within ~2× of 240KB → ship + document the real figure; 2–4× → a tree-shake/lazy-load pass (lazy-OSD, manualChunks per axis-16 donors); >4× → escalate (the budget or the dependency set is wrong).

**Phase 3 — Inventions, gated, in priority order (Action; independent increments).**
Each invention is a separate gated increment: build → prototype → run its validation question (in `CONTEXT.md`) with 2–3 users → ship or tune. Order = the validation priority above. They're independent, so they can be parallelized *if* staffed — but each carries its own gate. The narrative layout + collaboration + the playground/project split + overview-as-canvas all live here.

**Continuous — orphan gates & cross-cutting.**
The orphan gaps fire at their *conditions*, not a phase: EXIF-bake-at-ingest before the first phone-photo public exhibit; empty/error/loading states before the public Viewer ships; body sanitization before the first user-authored-HTML exhibit; overlay-contrast adaptive styling before the first institutional pilot. **Schema migration** is the gate most likely to slip — stamping the version field in Phase 0 makes it *feel* done, but the version field is only the down-payment: the migration *runner* is owed before any field is added or renamed (not "someday"). Treat the first schema edit as the trigger.

## Classification & parallelism

- **Phase 0 + the data model** = serial Prep. No parallelizing the keystone.
- **Phase 1 extraction** = mostly serial (`core` → `mount` → `svelte`).
- Once `@render/svelte` exists, **Studio and Viewer proceed in parallel** (Action) — they share the contract, not the code.
- **Phase 3 inventions** = independent, parallelizable increments, each gated.

## The validation-gate mechanism (what a "gate" actually is)

For each invented interaction: a clickable prototype + the *specific* question already written in `CONTEXT.md` (e.g., "does a non-technical author grok the merge summary panel unprompted?"), run with 2–3 representative users. Expected outcome is a *tune* (wording, prominence, timing), not a redesign — the structural choices are robust. The failure mode to watch: validating only the scary invention (merge-UI) and shipping the "simple" ones (playground→project) on faith — that's where the week-8 surprise lives. Budget a round for *each*.

## Tactics & tooling (putting the strategy into effect)

Highest-leverage move: make the strategy's two fragile disciplines — *ordering* and *don't-ship-inventions-ungated* — **mechanical, not vigilance-dependent.**

### Make it mechanical (the backbone)
- **seeds DAG = the phase graph.** Encode Phase 0→3 + the source-before-projection dependencies as `sd` issues with a real dependency graph; the data-model module is the root every projection blocks on. `sd ready` then *enforces* the ordering — you physically can't pick a projection before its source. `sd-next.sh --parallel` surfaces the independent Action work.
- **mulch Q-N = citable decisions.** Mint Q-N IDs (`decision-record.sh`) for ADR-0001..0004 + the source/projection principle, so every plan's §9 and every commit cites the decision it implements; plan↔ADR drift becomes greppable.
- **gate-enforcer = the validation gates, independently.** Each invention's gate + the Phase-0/1 acceptance criteria (the WADM-interop fixture; "mounted-via-new-path passes anvil-stock fitBounds") are verified by the **gate-enforcer agent**, not self-reported. This is what makes "inventions gated" real rather than aspirational.

### Per-phase skill rhythm
- **Phase 0–2 (adopted, locked, low-ambiguity):** `characterization-testing` to PIN anvil's current behavior as a harness *before* extracting (refactor-under-test — exactly its purpose) → `test-driven-development` to write the corpus fixtures as tests first → `writing-plans` → `executing-plans` (follow exactly) → `verification-before-completion` (claims mapped to acceptance criteria). No `brainstorming` — the design is locked; go straight to plan+execute under test.
- **Phase 3 inventions (novel, no donor, High-ambiguity):** `brainstorming` FIRST — the friction loop is where the interaction actually gets designed → clickable prototype → **gate-enforcer runs the validation question** (2–3 users) → `writing-plans` → execute. Skipping brainstorming here is the trap; the inventions are where the design is thinnest.

### Parallelism (Action waves only)
`dispatching-parallel-agents` + the delegation protocol (shared prefix = mulch infra/meta + the locked ADRs + the relevant `@render` contract; small per-worker deltas) at the TWO parallel points: Studio + Viewer once `@render/svelte` exists; independent Phase-3 inventions if staffed. Serial everywhere else — the data model and the extraction do NOT parallelize.

### Continuous discipline
- **Scout before adopting:** `Explore` agents verify each donor module's current shape before the lift (the spike was the first; each module gets a cheap one).
- **Library APIs at code-time:** Docs MCP (`get_docs`) for Svelte/Astro/OSD/Annotorious/Wavesurfer/vitest — don't guess signatures.
- **Coherence + pre-ship:** `strategic-looping` pause-and-reflect at each phase boundary; the **4-Invariables Pre-Ship Gate** before the Phase-2 dogfood and before each invention ships.
- **Capture:** `[SNAG]` inline when a delamination surprises; `record-extractor` at each phase close → mulch (the real bundle number, the WADM-interop result, the gate outcomes are exactly the non-obvious findings worth persisting).
- **Code review = `/thermo-nuclear-code-quality-review`, EVERY leaf task, before commit** (standing rule). It's the code-review tool of record — nothing the (small, least-trustworthy) executor writes reaches a wave unreviewed. This *replaces* the generic `code-reviewer`/`requesting-code-review`/keystone-only-`/ultrareview` references throughout. Cost accepted knowingly: each leaf is execute (small model) → **thermonuclear review** (strong) → commit, ~doubling per-task cost for the guarantee that no small-model code ships unreviewed. Distinct from `gate-enforcer` (which audits *test-meaningfulness + cross-worker seams* at wave close — the interaction concern a per-task review can't see).

## When the implementer is an LLM (the operative case)

This changes the tactics materially. An LLM implementer has no cross-session memory, is confidently-wrong-prone, cannot run human user-tests, but spawns in parallel and works cheaply against tests. Six adjustments:

1. **The durable artifacts ARE the implementer's working memory — not documentation.** `CONTEXT.md` + `docs/adr/` + this strategy + the seeds DAG + mulch are what a fresh LLM session reads to start cold and writes back to at session end (`record-extractor` → mulch; `HANDOFF.md` for the through-line). We front-loaded durability for exactly this reason — it's load-bearing for the *implementer*, not just for audit. Every phase = **read-state → work → write-state-back**; a phase that ends without writing state back is one the next session can't continue.

2. **Split every gate into machine-verifiable vs human-judgment — only the first is LLM-automatable.**
   - *Machine-verifiable* (LLM + `gate-enforcer` self-certify): the WADM-interop fixture passes; "mounted-via-new-path passes anvil-stock fitBounds"; types/tests green; the bundle number. The LLM runs these; gate-enforcer audits them.
   - *Human-judgment* (the LLM builds the prototype and **STOPS for the user**): all six invention comprehension questions ("does a non-technical author grok the merge summary panel?"). An LLM **cannot** substitute for a user-comprehension test — it will confidently rate its own UX as clear. The invention tier is gated by *your* judgment; the LLM's job is to get each prototype gate-ready and hand off.

3. **Tests are the LLM's seatbelt — TDD + characterization are non-optional here.** Because the failure mode is confident-wrong, the corpus-as-tests (Phase 0) and `characterization-testing` pinning anvil's behavior (Phase 1) are the ground-truth oracle the LLM refactors against; without them it produces plausible code that silently breaks behavior. `gate-enforcer` checks the tests are *meaningful*, not gamed to green.

4. **Scope each seeds issue to one context window, fully self-contained.** Each issue names: the ADR/Q-N it implements, the donor module (`file:line` from the spike/Explore), the acceptance criterion, and the test that proves it. That's what lets a cold LLM session pick it up via `sd ready` and finish it without re-deriving context. Parallelism is *real* — spawn parallel agents (delegation protocol) at the Action waves, not "if staffed."

5. **Adopted vs invented = the LLM-reliability split, and it's now the load-bearing one.** Adopted work (transcribe/refactor proven anvil code under characterization tests) is where an LLM is *most* reliable — let it run fast. Invented work (novel UX, no donor) is where LLMs are *least* reliable: they generate plausible-but-wrong interaction designs and rate them confidently. So the invention risk already flagged is **doubled** for an LLM implementer — `brainstorming` first (slow-mode), human gate after, never ship on the LLM's own say-so.

6. **The ADRs' "read this before reversing" framing + Q-N citations are LLM guardrails, not ceremony.** A helpful LLM will re-propose a reversed decision (shared object pool, React, wasm-vips) because each is *locally* reasonable. ADR-0001's explicit "read this before proposing a shared pool," ADR-0004's "don't re-litigate libvips," and Q-N citations are what stop the implementer from "improving" a locked decision. Keep decisions Q-N-cited so the implementer cites, not relitigates.

## Mechanical decomposition: phase → wave → task (small-model-executable)

Requirement: a leaf task must be executable by a *small* model with **no judgment** — it can't infer missing context, can't decompose, can't tell "looks good" from "is correct." That forces a separation of labor and a rigid task schema. The principle: **push all judgment UP into the decomposer so the leaves are dumb-executable.**

### Separation of labor (judgment lives in exactly one place)
- **Decomposer (strong model — Cognition, NOT mechanical):** turns a phase into an ordered DAG of leaf tasks, writes each task spec, and writes **each task's acceptance test first**. All the judgment lives here. Runs once per phase (its own `writing-plans` pass); output encoded into the seeds DAG.
- **Wave-builder (mechanical — no model):** a wave = every task whose deps are met (`sd ready`) AND whose declared `write-targets` are disjoint from the others in the wave. A max-independent-set filter for edit-safety; computable from the DAG, zero judgment.
- **Executor (small model — mechanical):** receives ONE leaf task; makes its pre-written test green by editing only its `write-targets`, using the named donor as reference; runs the acceptance command; reports pass/fail. No decomposition, no design, no scope expansion.
- **gate-enforcer (verify):** at wave/phase close, audits that green tests are *meaningful* (not gamed) and acceptance is real.

### The leaf-task schema (rigid — fill mechanically, execute mechanically)
```
TASK <id>
  implements:    <Q-N / ADR-NNNN>                         # cite, don't relitigate
  blocked-by:    [<task ids>]                              # the DAG edge → wave eligibility
  donor:         <file:line>  |  greenfield-per <ADR>      # exact, from spike/Explore
  write-targets: [<exact paths this task creates/edits>]   # wave-disjointness + edit-safety
  change:        <one precise instruction; no design choice left open>
  acceptance:    RUN `<exact command>` → MUST <binary pass condition>   # pre-written test; green = done
  on-block:      STOP + escalate to <strong model | human>; do NOT improvise, expand scope, or relitigate
```
A task a small model can't execute mechanically is **under-specified** — send it back to the decomposer; never hand it to the executor.

### The reducibility classifier (the elegant part — one line, three meanings)
**"Can this task be written as [pre-test + donor-ref + exact edit + binary acceptance]?"**
- **Yes** → *adopted* work → *small-model-mechanical* → goes in a wave, smallest capable model, parallel.
- **No** (needs design judgment) → *invented* work → *strong model + brainstorming + human gate* → NOT a small-model task.

The reducibility test, the adopted/invented split, and the model-tier are **the same classification**. A task that resists a mechanical spec is a design task in disguise — the signal to route it to a human gate, not to "try harder to spec it for the small model."

### Consequence for model-tiering
Mechanical leaf tasks → smallest capable model, parallel waves. Decomposition + invented design → strong model (slow-mode) + human gate. gate-enforcer → mid-tier verify. The expensive model is spent on *decomposition and invention*; the cheap model executes pre-specified, test-bearing leaves. Cost and reliability both follow the same cut.

## Where skills vs infra attach (phase / wave / task)

Short answer: **skills attach where judgment lives (phases + the decomposer + invented work); infra attaches where execution happens (leaf tasks); waves carry neither.** Same cut as the reducibility classifier, one level up.

### Phases carry skills — and which skill *leads* names the phase's character
| Phase | Dominant skill(s) | Why | Tier |
|---|---|---|---|
| 0 Skeleton + data model | `writing-plans` + `test-driven-development` | keystone source; corpus-as-tests first | strong (decompose) |
| 1 Extraction | **`characterization-testing`** → `executing-plans` | pin anvil's behavior *before* refactor — literally the skill's purpose | strong-decompose / small-execute |
| 2 Adopted-core | `executing-plans` · `dispatching-parallel-agents` · `verification-before-completion` · `requesting-code-review` | follow the spec, fan Studio/Viewer, Pre-Ship Gate | small-execute / strong-review |
| 3 Inventions | **`brainstorming` leads** → `writing-plans` → `gate-enforcer` + human | the design happens here; the skill set INVERTS from execute to design | strong + human |
| Continuous | `systematic-debugging` · `failure-capture` | orphan-gate bugs, `[SNAG]` capture | as needed |

The tell: phases 0–2 are *execution*-skilled (plan/test/verify); phase 3 *inverts* to *design*-skilled (brainstorming first). **Which skill leads tells you whether you're adopting or inventing.**

### Waves carry no skill — they carry an accumulating shared prefix + a worker batch
A wave is a *dispatch unit*, not a kind of work. Across waves within a phase, three things progress mechanically (all computable from the DAG):
- **source → projection:** early waves build the source (often ONE serial task — the model/seam); later waves fan out to its projections/adapters.
- **narrow → wide:** width = count of `sd ready` tasks with disjoint write-targets at that frontier. Source waves are narrow (serial); projection waves are wide (parallel).
- **accumulating prefix:** wave N's outputs "commit to prefix" (delegation protocol) for wave N+1; the shared prefix grows, per-worker deltas stay small.

So waves "do different things" = different DAG frontiers progressing source→projection, narrow→wide — but the *skill* is the phase's, not the wave's.

### Leaf tasks carry INFRA, not skills — that's what makes them small-model-mechanical
A leaf task's powers are all infra, zero judgment:
- the **pre-written test** (TDD) = the oracle + done-signal
- the **donor `file:line`** (spike/Explore) = the reference to adapt
- the **acceptance command** (vitest etc.) = binary done
- **Docs MCP** `get_docs` = exact API signatures (a small model must not guess)
- the **seeds issue** = the work order; **mulch Q-N** = the cited decision; **write-targets** = edit-safety

A leaf task needs **no skill** — skill is judgment, and a leaf has none by construction. **Corollary: a task that "needs a skill" needs judgment → it's not a leaf → it's a design task misfiled.** Kick it back to the decomposer (which spends `brainstorming`/`writing-plans` on it). The reducibility classifier again: skill-needed ⟺ judgment-needed ⟺ invented ⟺ not-small-model.

## Prior-art reference & the ADR→task affordance

### Prior-art attaches by KIND at three different levels
- **Findings / verdicts** (`_FRAMING` locked decisions, `_GAPS` BLOCKERs, the wadm-roundtrip Ellipse/Path verdict, the wasm-vips disproof) → the **DECISION** level (ADRs + Q-N), above phases. The *why / why-not*. Already captured.
- **Donor `file:line`** (svgpath:189, anvil `viewer.ts`, annomea `NarrativePane.svelte:63`, exifr `orientation.mjs:11`, iiif-builder…) → the **TASK**'s `donor:` field. The per-task infra — *copy/adapt from here*.
- **The spike / `Explore`** → the **PREP that bridges them**: it converts a decision's "adopt anvil" into a task's concrete `donor: file:line`. The survey axis files + `_GAP-ANSWERS` are the **donor registry** the decomposer indexes into; **a missing donor is the signal the work is greenfield.**

### Do the ADRs afford decomposition to task level? No — by design. Here's where it's developed.
ADRs afford the **decision layer, not the task layer** (an ADR carrying leaf-tasks would conflate decision with execution-plan). The ADR→task affordance is **developed in the decomposer's per-phase `writing-plans` pass**, which JOINS: the ADR (why/what) + the survey/spike (donor `file:line`) + `CONTEXT.md` (glossary, through-line) → leaf-task specs + pre-written tests + the seeds DAG.

What the ADRs *do* afford — and must — is **routing**: which work is adopted vs greenfield vs invented. Affordance strength then tracks donor availability:

| Work kind | Donor? | Binary "done" test possible? | Affordance development | Terminus |
|---|---|---|---|---|
| **Adopted** (anvil/annomea/pure-libs) | yes (survey/spike) | yes | *already developed* — fill `donor:`, write the test | small-model mechanical |
| **Greenfield-specifiable** (ADR-0003 log/DAG/heads-projection, merge semantics) | **no** | **yes** (a data structure HAS binary tests) | **write the test corpus FIRST** — that converts greenfield → make-test-green | small-model mechanical *after* the corpus |
| **Invented-UX** (the 6 comprehension gates) | no | **no** ("does a user grok it" isn't a unit test) | can't be developed to mechanical | **human gate** |

**The line is: can you write a binary "done" test?** Data model → yes → developable to mechanical by writing the corpus. UX comprehension → no → terminates at a human gate. (This is the reducibility classifier made precise — the earlier "needs design" splits into "needs a test-corpus design pass, then mechanical" vs "needs human judgment, never mechanical.")

### The consequence to act on
**ADR-0003 (the data-model spine) has the WEAKEST native task-affordance — it's greenfield, no donor — yet the HIGHEST importance.** So it earns the most affordance-development: a strong-model design pass that fixes the module shape and **writes the test corpus first**, manufacturing the mechanical affordance the ADR can't carry. That's exactly why Phase 0 is strong-model `writing-plans`+TDD, not dispatch. Cheap affordance-development worth doing once, up front: a **consolidated donor index** (module → `file:line` → confirmed-status) distilled from the survey axis files + `_GAP-ANSWERS` + spike, so the decomposer fills `donor:` fields by lookup instead of re-reading the corpus per task.

## Pre/post review per task / wave / phase

Review attaches at **every** level (with `/thermo-nuclear-code-quality-review` per leaf — see Tactics); each level **adds a distinct concern** (it is not that lower levels are unreviewed). PRE = *readiness* (spec/prefix/plan ready, test RED), POST = *completion + capture* (reviewed, coherent, externalized).

**TASK (executor self-check + per-leaf thermonuclear review):**
- *Pre:* spec complete (donor `file:line` resolves · write-targets declared · acceptance command runnable) AND **the pre-written test is RED**. A test that isn't red means the task isn't real or isn't ready → kick back to decomposer.
- *Post:* acceptance command → **GREEN**; types/lint pass; **only write-targets touched** (scope-creep check); Q-N cited; **`/thermo-nuclear-code-quality-review` passes before commit** (every leaf — the executor's output never ships unreviewed). Execution is small-model; the per-leaf review is the strong-model guard.

**WAVE (cross-worker coherence — `gate-enforcer`):**
- *Pre:* shared prefix built + **fresh** (delegation protocol: rebuild if >30 min or a prior wave touched files this wave depends on); **write-target disjointness** verified across the batch; every task's pre-test red + spec complete.
- *Post:* **seam verification** — each parallel output checked against the shared prefix AND every other worker's output (same-file / renamed-symbol / moved-module conflicts are the parallelism failure mode); **full suite green** (not just per-task tests — did a sibling break?); `gate-enforcer` audits tests are *meaningful, not gamed*; **commit-to-prefix** (wave outputs join the prefix for the next wave). A worker failure is a prefix-level event — propagate before the next wave.

**PHASE (milestone — Pre-Ship + capture + human):**
- *Pre:* the decomposer's `writing-plans` pass is done (DAG + specs + **test corpus** exist; for greenfield, corpus written); prior phase's Post passed (hard gate: Phase 1 can't start before Phase 0's corpus is green); brownfield flow context if touching anvil.
- *Post:* the **4-Invariables Pre-Ship Gate** (state ownership / observability / blast-radius / timing); `code-reviewer` against the plan + ADRs; `/ultrareview` on the keystones (data model, Phase 2); bundle measurement + response-tier action (Phase 2); **`record-extractor` → mulch + `HANDOFF.md` write-back** (mandatory for the LLM implementer — no write-back = next session can't continue); the **human comprehension gate** for invention phases; an **ADR-amendment / new-Q-N check** (did the phase surface a decision?).

The shape — each level **adds** a concern: TASK = "test green, stayed in lane, **thermonuclear review passed**" · WAVE = "+ do the parallel outputs cohere at the seams?" · PHASE = "+ is the milestone shippable (Pre-Ship Gate) and is state externalized for the next session?"

## Deceptively-simple items that need a spec + corpus before a (small) model touches them

**Detector:** it sounds like a one-liner but hides one of — (a) an **invariant that must hold across operations**, (b) a **cross-browser/capability divergence**, (c) a **distributed-systems subtlety**, (d) a **mode/state transition with edge cases**. Operational test: **does the binary "done" test need more than a happy-path case?** If yes → it's deceptively simple → write the corpus (the spec) first; the corpus is where the hidden complexity surfaces.

| Looks like… | Actually hides | Class |
|---|---|---|
| Version-DAG **merge** ("compare versions") | parent-chain walk · common-ancestor · what counts as *concurrent* (no causal order) · tombstones · **plural heads** | c |
| **Heads-projection** ("filter to latest") | plural heads after unresolved merge · `hasHistory`/`wasRevisionOf` linking · index.json · idempotency | c/a |
| **EXIF orientation** ("rotate the image") | all 8 incl. **transpose/transverse (5/7) nobody tests** · lossless-when-possible vs re-encode · SHA provenance chain · orientation-1 no-op | d/a |
| **WADM serialization** ("write JSON") | AnnotationPage-not-array · `pixel:` normalization · SpecificResource wrap · `@context` never mixed · extension-opacity — **this is where the roundtrip verdict found silent corruption** | a |
| **ID scheme** ("generate an id") | ULID · `{logicalId}/v{n}` · never-reuse · tombstones · `urn:`→`https:` rewrite at publish | a |
| **playground→project conversion** ("copy to a folder") | mode transition · in-flight state · three-config mapping · identity — **the flagged week-8 trap** | d |
| **three-config persistence** ("a Filesystem with 3 backends") | capability detection · folder-autosave vs zip-Save/Open divergence · recent-projects survival · one-model-many-configs | b/d |
| **fitBounds** ("zoom to the region") | SvgSelector→bbox (goToTarget is rect-only) · live-anchor recompute · popup re-anchor · de-dup divergent bbox math | a |
| **autosave / Save / dirty** ("trivial") | OPFS debounce · non-Chromium "unsaved" indicator · crash-recovery (rubric: reopen→intact) | b/d |
| **layer toggle** ("show/hide by group") | per-note membership (not AnnotationCollection-of-pages) · cross-object filter · default-position-by-layout | a |

**These concentrate in the data-model spine (ADR-0003)** — merge, heads-projection, IDs, WADM serialization are all (a)/(c). That's the deeper reason Phase 0 is strong-model with the heaviest corpus: it's where the deceptive simplicity lives, and the corpus is the only thing that makes it safely mechanical afterward.

## Are all tasks enumerated up front? No — gated, just-in-time discovery

**The shape is known up front; the leaves are discovered at controlled boundaries.** Not waterfall (you cannot enumerate an undesigned invention's tasks), not free-for-all (discovery happens only at named moments, each attributed).

**The line is the same classifier: a task is enumerable *now* iff its binary "done" test is writable *now*.**
- **Enumerable now** = mechanical = adopted (donor-defined) or greenfield-specifiable (corpus-defined). For greenfield, **the test corpus IS the enumeration** — one test ⇄ one task — so the task graph is exactly as complete as the corpus. The spike already enumerated anvil's adopted modules; writing ADR-0003's corpus enumerates the data-model tasks.
- **Discovered later** = everything whose "done" test can't be written until something happens first.

**Discovery happens ONLY at three boundaries (bounded + attributed, never chaotic):**
1. **A per-phase decomposer pass** (`writing-plans`, just-ahead) — enumerates *that phase's* mechanical tasks against current state. You don't enumerate Phase 3 now; it's un-writable (inventions undesigned) and would churn.
2. **A design pass + human gate** (per invention) — enumerates the invention's implementation tasks *after* its shape is validated. You can't enumerate "build the merge-UI" into leaves until the prototype passes the comprehension gate; then the tweaks/tasks are knowable.
3. **A failure / measurement / `[SNAG]` event** — spawns a *bounded* remediation task: a gate-failure tweak (rename "Synced"→"Added"), a bundle-measurement response (>2× → a tree-shake task), a cross-worker seam conflict, an edge case the corpus-writing surfaced (the EXIF transpose orientation, a new concurrent-merge case).

**Cadence: decompose just-ahead, per phase — never all up front.** This also matches the LLM-memory constraint: enumerate against *current* state, not a stale graph written months earlier. The seeds DAG is **append-mostly** — it grows at those three boundaries, and each new task cites the decomposer pass / gate / `[SNAG]` that birthed it (attribution via `append-attribution.sh`). `sd ready` is always the live frontier; **you never need the whole graph enumerated — only the next wave + the phase skeleton.**

So: **enumerated-vs-discovered is the same cut as mechanical-vs-human-gated is binary-test-writable-now-or-not.** The enumerable tasks are exactly the mechanical ones; the discovered ones are exactly those downstream of a Cognition pass (decomposer / design) or an execution event. Discovery is a *Cognition-phase* activity; execution stays mechanical against a set frozen for that wave.

## Context-load per step + next-step decision (with qmd + fff as the retrieval layer)

**Governing principle: context breadth is *inverse* to step depth — and tracks where judgment lives.** The decomposer (top, strong model) reads broad (all relevant ADRs + survey + CONTEXT); the leaf executor (bottom, small model) reads narrow (one task spec + one donor + one test). Loading the whole design into a leaf step would blow a small model's context *and* invite it to "improve" locked decisions. So each step loads **precisely what its level needs, no more.**

**Use `qmd` and `fff` extensively as the retrieval layer** — never re-read whole files to find something:
- **`qmd`** = "*what did we decide / where's the finding*" over the **markdown design corpus** (CONTEXT.md, the ADRs, this strategy, the survey axis files). Query it to recall a decision instead of re-reading the doc. (CLAUDE.md routing: project markdown → qmd.)
- **`fff`** = "*where is the file / the donor source / the code*" over the **repo** (frecency-ranked; `grep`/`multi_grep` for identifiers). This is how the `donor: file:line` fields get found and how the leaf executor locates the exact donor lines. (CLAUDE.md routing: file location → fff.)

| Step (level) | Context to LOAD (breadth) | Retrieval | Next-step decision |
|---|---|---|---|
| **Cold session boot** | CONTEXT.md + the relevant ADRs + this strategy + `sd prime` + `mulch prime` | `qmd` to recall decisions (don't re-read) · `fff` to locate | `sd ready` → the live frontier |
| **Decomposer pass** (phase) — BROAD | the phase's ADR(s) + survey axis files + spike/donor-index + CONTEXT through-line | `qmd` over ADRs/CONTEXT/survey · `fff`/grep over donor source | enumerate *this* phase vs current state; classify each task by reducibility |
| **Wave dispatch** — MIDDLE | the shared prefix (mulch infra/meta + locked ADRs + the relevant `@render` contract + donor-index slice + a foxhound envelope), built **once** per wave | `mulch-prime-cache` + foxhound; `qmd`/`fff` feed the prefix | `sd ready` ∩ disjoint-write-targets = the wave |
| **Leaf execution** — NARROW | ONLY: the task spec + the donor file content + the pre-test + Docs MCP for any library API | `fff` to locate the donor · Docs MCP (`get_docs`) for signatures | none — single task; done→review→commit, block→escalate |
| **Per-leaf review** (thermonuclear) | the diff + the task spec + the cited ADR/Q-N | `qmd` to pull the exact decision text to check conformance | pass→commit · fail→spawn remediation task |
| **Wave POST** | all wave outputs + the shared prefix | — | seams ok → commit-to-prefix → next wave |
| **Phase POST** | the milestone + ADRs + the Pre-Ship checklist | `qmd` over ADRs | Pre-Ship + human gate → **write-back** (`record-extractor`→mulch + `HANDOFF`) → next phase's decomposer pass |

**How "decide next" works mechanically:** `sd ready` (the DAG frontier — enforces sources-before-projections) → the wave-builder filters to disjoint write-targets → the reducibility classifier routes each task (mechanical→small-model executor; needs-design→strong-model design pass + human gate) → at boundaries, the trigger fires (phase done → decomposer pass; gate fail / `[SNAG]` / measurement → bounded remediation task). No step requires the implementer to *infer* what's next — the DAG + the classifier + the boundary triggers decide it. qmd/fff are what make each step's precise context retrievable without holding the whole design in working memory — they are the retrieval half of "the durable docs are the implementer's memory."

## First concrete move

Not "write a plan" — that just recurses. **What gets typed into real files first:** the monorepo scaffold (the ADR-0002 package boundaries) and the `@render/core` **data-model module** — WADM branded types + the append-only log + the version-parent DAG + the heads/history projection (ADR-0003) — *with its tests green against the Phase-0 corpus* (the merge fixtures and the pure-WADM-consumer interop fixture especially). It goes first because it's the source every other projection depends on and the one thing ADR-0003 says you cannot cheaply retrofit.

Phase 0 is large enough to deserve **its own `writing-plans` pass** before code — but that plan's *output* is the scaffold + data-model module above, not more strategy. Everything else waits behind it.

## Deferred-work registry (live frontier — snapshot 2026-05-25)

Not a waterfall backlog — the **just-in-time discovery** rule above still holds (`sd ready` is the live frontier; this grows append-mostly). This is the *current* discovered set as of the build state below, classified by **the same reducibility cut** that routes everything else: can a binary "done" test be written *now*? → mechanical (enumerable, small-model) vs needs-a-design/corpus-pass vs terminates-at-a-human-gate vs fires-at-a-condition (orphan) vs out-of-v1.

**Build state at snapshot:** Phases 0–2 complete; **all 6 v1 inventions built** (three-configs + overview-as-canvas + playground→project gate-approved; identity-prompt + merge-summary + conflict-card shipped). 292 tests green; both apps build. The remaining frontier:

> **▶ MAJOR NEW FRONTIER (2026-05-27): the Layers→Readings reframe.** The v1 "Layer" feature is being reframed — "Layer" was one word doing two jobs (a stroad) and is retired, splitting into **Reading** (a mutually-exclusive interpretive pass = an IIIF `AnnotationPage` per Object) + **Tag** (additive per-note discovery, now carrying apparatus). Full method + sequence (5 phases, reducibility cut, **migration as a Phase-1 prerequisite**, first move) → **`docs/plans/READINGS-IMPLEMENTATION-STRATEGY.md`**; rationale → **`docs/adr/0007-readings-as-annotationpages.md`**; design → CONTEXT "Readings & Tags". This SUPERSEDES the v1 per-note-`layers` model — treat any `layers`-related item below as folded into that strategy.

### A. Mechanical now (adopted-donor / greenfield-corpus → small-model-executable, enumerable this phase)
| Item | Route | Donor / source | Trigger |
|---|---|---|---|
| **Narrative Studio section-authoring** (`NarrativeEditor`: sequence Sections, bind prose↔object, region `start`) | adopted | anvil `NarrativeEditor` (ADR-0002 decision) | next decomposer pass; **also unlocks the overview's section dividers** |
| **Sections round-trip via manifest Ranges** (`sectionsFromManifest` parser; `toRanges` already built) | greenfield-corpus | self (`toRanges` is the inverse) | so Viewer sections come from the published tree, not `sample-data` |
| **Overview section dividers** | adopted | self (overview) | blocked-by narrative section-authoring (needs section data) |
| **IIIF Content-State (`?iiif-content`) arrival** wiring (`encode/decodeContentState` built in core) | adopted | self (core `url/deeplink.ts`) | cross-Library arrival follow-up |
| **Cold-arrival chrome**: breadcrumb + zoom-to-fit (§124); referrer-based trigger | adopted | annomea / self | deep-link arrival + wax-seal already shipped |
| **Progressive marker reveal** (§122, narrative read-side) | greenfield-corpus | self (NarrativeReader) | with narrative polish |
| **Marker highlight drops per edit** (P2-5 sibling bug) | greenfield-corpus | self (`mount`/markers) | bugfix — `systematic-debugging` |
| **Styled AV scrubber** (mm:ss inputs already shipped) | adopted | Wavesurfer / native | cosmetic — lowest priority |

### B. Deceptively-simple → corpus/spec pass FIRST, then mechanical (per the §"Deceptively-simple" detector)
| Item | Class | Why it's not a one-liner |
|---|---|---|
| **In-memory publish/zip scaling gap** (OPFS→Uint8Array→fflate holds the whole library in memory) → streaming/chunked write | (c) | memory ceiling on large libraries; needs a streaming corpus (big-fixture + memory assertion) before a small model touches it |
| **v1.1 in-browser tiling** (OffscreenCanvas DZI pyramid; NOT libvips-WASM) | (c)/(d) | worker pyramid + pan/zoom levels; v1.1, big |

### C. Human-gate / browser-verify owed (LLM cannot self-certify — `STOP for the user`)
- **Browser-verify built prototypes:** identity-prompt (first-Import name → merge panel) · overview pan/zoom (Voynich) · AV player (Viewer `/av`) · Studio AV hand-annotation · layout-picker. *(EXIF · ⌘K · deep-link · narrative map · markers · open-zip · publish round-trip · three-configs · playground → already user-verified.)*
- **Phase-1 real-OSD visual equivalence** vs anvil-stock (the headless gate proves the logic; pixels are human).
- **Real third-party WADM interop** — Mirador / Universal Viewer renders the heads-page as *current notes only* (the unit interop surrogate passes; the real-viewer check is owed — until it passes, ADR-0003's three-tier contract stays "proven by surrogate").
- **GH-Pages publish end-to-end** with a real repo + fine-grained PAT (the Contents-API fetch sequence is built; the network round-trip is browser/human).

### D. Orphan gates (fire at a CONDITION, not a phase — schedule by gate)
| Gate | Condition (trigger) | Status |
|---|---|---|
| Empty / error / loading states | before the public Viewer ships | **not built** (v1) |
| Overlay-contrast adaptive styling | before the first institutional pilot | not built (v1 = A2 + stroke-over-stroke, shipped) |
| Schema-migration **runner** exercised | the first time a schema field is added/renamed | `migrate`/`stamp` built; runner in place — owed = first real migration |
| Body sanitization | before first user-authored-HTML exhibit | **satisfied** (`sanitizeHtml`, 12 tests) |
| EXIF-bake-at-ingest | before first phone-photo public exhibit | **satisfied** (shipped) |
| Bundle measurement → response tier | at Phase-2 dogfood | **measured** (~327 KB gz studio; >240KB aspirational figure, never binding — treat-as-gate decision still open) |

### E. Out of v1 (named cuts — explicitly NOT this milestone; the `mode`/§43 axis is reserved for them)
Ellipse / freehand shapes (svgpath module) · Slideshow (a Grid *mode*) · Scrollytelling + Compare (layout *modes*) · AV ingest / media-upload UX (codec/size — gate before first AV-bearing *uploaded* exhibit; current `/av` uses an external URL) · curated Gallery landing (hero/featured — v1.1 gated invention) · search (minisearch, v1.1) · embedding/oEmbed (v1.2) · AI-authoring / mask→SvgSelector (v1.2/v2).

**Next mechanical phase (by value, A-tier):** **narrative Studio section-authoring** — it's adopted (anvil donor), it closes the one real *authoring* gap (the narrative layout is pickable but not yet authorable), and it unlocks two dependents (overview section dividers, sections-from-manifest round-trip). Decompose it next (per-phase `writing-plans` pass → DAG → waves).
