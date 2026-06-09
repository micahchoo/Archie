# GOAL — the Archie product-management north-star

> The durable spec the `/goal` loop reads at the start of every cycle. The loop
> (`.claude/commands/goal.md`) is the *mechanism*; this file is the *source of truth*.
> Edit this file to steer the product. Do not encode steering in the command.

---

## 1. North-star

> **A first-time visitor opening a published Archie exhibit — and a first-time author
> opening Studio — finds it fast, beautiful, obviously trustworthy, and immediately
> usable, enough that they choose Archie over a generic image viewer or a heavyweight CMS.**

There are **no users yet**. So success is not analytics — it is the *product itself*,
measured by an agent driving a real browser and reading build artifacts. Every claim of
"better" must be a number this repo's tooling can produce. "I think it looks nicer" is
not admissible; "heuristic-violation count fell 6 → 3, screenshots unchanged" is.

## 2. Priorities (ranked — ties break upward)

1. **Look** — visual craft, hierarchy, polish of Studio and the published Viewer.
2. **Feel** — interaction quality, responsiveness, no jank, clear states, accessibility.
3. **Performance** — bundle size, first render, deep-zoom tile loading, no regressions.
4. **Good features** — only those that *broaden appeal to real users of such tools*
   (§5). A feature that doesn't serve a researched user need is overambition, not progress.
   The research is **done**: draw features from the ranked contributor-broadening backlog
   (§5a) in tier order — don't invent ad-hoc features while the backlog has unbuilt items.

Look and feel outrank features. A cycle spent making the existing surface better beats a
cycle adding a surface nobody asked for.

---

## 3. The gate — two metric families

A cycle **ships only if BOTH hold**. This is the single safety mechanism that makes
auto-merge safe: a green build means *didn't break*, not *good*. The improvement family
is what makes it *good*.

### Family A — Regression gates (binary; ALL must stay green)

Measured before and after. Any one going red ⇒ **revert the cycle, do not merge.**

| Gate | Command / method | Pass condition |
|------|------------------|----------------|
| Typecheck | `npx --yes pnpm@11 -r typecheck` | error count **≤ baseline** (now: 0 — see §8) |
| Tests | `npx --yes pnpm@11 -r --no-bail test` | all pass |
| Build | `npx --yes pnpm@11 -r build` | all packages build clean |
| Viewer check | `npx --yes pnpm@11 --filter viewer check` | `astro check` clean |
| Bundle budget | `node scripts/bundle-size.mjs` | OSD+Annotorious gz **≤ 240 KB** |
| IIIF validity | parse `apps/viewer/public/published/*/manifest.json` | valid JSON, Presentation-3 shape intact |
| Console clean | Playwright + Chromium on published Viewer + Studio dev | **no new** console errors vs baseline |
| Visual integrity | Playwright + Chromium screenshots vs `docs/screenshots/auto/` | no *unintended* visual break |

### Family B — Improvement scalars (at least ONE must move the right way; none may regress)

The cycle must measurably *improve* the product on ≥1 of these, regressing none:

| Scalar | Measured by | Direction |
|--------|-------------|-----------|
| Typecheck error count | `pnpm@11 -r typecheck` | ↓ (first target: 4 → 0) |
| Bundle size (gz KB) | `node scripts/bundle-size.mjs` | ↓ |
| UX heuristic-violation count | `page-ux-tuning` Tier-A on a Viewer/Studio route | ↓ |
| Accessibility issue count | Playwright + axe-core on the same route | ↓ |
| First-render / interaction timing | Playwright + Chromium (performance trace) | ↓ |
| Broken-link count | Playwright link-integrity sweep of published site | ↓ |
| Roadmap feature coverage | a researched, user-serving feature lands (§5) | ↑ |

> **Browser measurement uses Playwright + Chromium (Tier 3), not lightpanda.** lightpanda
> has no renderer — it cannot measure paint, layout, or pixels. Real look/feel/perf numbers
> require a real engine. Use the `reliable-test-loop` Tier-3 path (Playwright + Chromium).

### Honesty about "feel"

Performance and correctness are genuinely measurable. **"Feel" is measured only by proxies**:
heuristic-violation counts, axe a11y issues, semantic structure, and screenshot *regression*
detection (did something visibly break — not "is it prettier"). The scorecard does not claim
to measure beauty; it measures structure, accessibility, and non-regression. Treat a falling
heuristic count as evidence, not proof, and keep the screenshots for human spot-check.

---

## 4. One continuous run, atomic cycles

`/goal` is a **single long-running invocation that runs cycles back-to-back, indefinitely**,
until the work is dry (§4a) or the user interrupts. Do **not** ask the user to re-run it, and
do **not** schedule the next cycle on a guessed interval. Rely on auto-compaction to keep the
session going; after a compaction, re-read this file and continue.

The **cycle** — not the invocation — is the atom: **one improvement, start to finish, on its
own branch, one atomic revertable commit.** Never batch two improvements into one cycle. When
a cycle finishes (merged or reverted), immediately start the next: re-read this file, re-measure
the live baseline, pick the next single improvement.

Merge discipline (reconciles "full-auto" with safety): **scratch branch → measure → gate →
fast-forward `main` only on pass.** A failed cycle never touches `main`. On any Family-A
regression or zero Family-B improvement → revert the commit to the clean baseline ref, then
move to the next cycle.

### 4a. When to stop the run

Keep a **dry-streak counter**. A cycle is "dry" if it shipped nothing (reverted, or found no
gateable, user-serving improvement). After **3 consecutive dry cycles**, stop the run and
report: the backlog of worthwhile work is exhausted; surface what was deferred to seeds and
let the user decide what's next. Also stop on repeated identical failures (same gate red 2×
in a row on the same target → file a seed, don't keep retrying).

---

## 5. "Good for the product" — user research drives feature choice

With no users to ask, feature choice is grounded in **what real users of tools like Archie
actually want, and what broadens its appeal**. That research is now **done** (2026-06-09): a
three-thread competitor + service-design + system-design study lives in
`docs/research/contributor-appeal/` (read `00-SYNTHESIS.md` first), cached to mulch domain
`product-research`, and distilled into a **ranked, frame-checked backlog of ~30 contributor-
broadening features**. The loop's job is now to **work through that backlog** — not to
re-research from scratch each cycle.

### 5a. The researched backlog (the feature queue — work it in tier order)

Source of truth = the `contributor-appeal`-labelled seeds (`sd ready | grep -i contributor`);
`00-SYNTHESIS.md` fills in the rest with audience/evidence/effort per item. Take the
**highest-priority unblocked** item; do not skip a tier for a lower-leverage one. The headline
finding governs ordering: **the import funnel is the gate** — Tier 0 opens it, the rest widen it.

- **Tier 0 (open the funnel):** ① local image folder → in-browser IIIF manifest · ② IIIF-manifest-URL
  paste import · ③ segment-diverse Playground templates · ④ surface `?src=<zip-url>` publish ·
  ⑤ build-time SEO/og/JSON-LD/sitemap.
- **Tier 1 (widen it):** ⑥ CSV→annotation import · ⑦ WADM/Recogito/Hypothes.is import · ⑧ collaborative-
  pass UX + summary-panel copy · ⑨ annotation template presets · ⑩ embed-code + `<archie-viewer>` ·
  ⑪ static IIIF Change Discovery pages · ⑫ EXIF→metadata auto-fill · ⑬ Readings UI · ⑭ static oEmbed.
- **Tier 2 (depth/reach):** GitHub-OAuth identity bridge · OffscreenCanvas DZI tiling (v1.1) ·
  tablet-responsive Studio · ONNX FastSAM region-suggest (lazy) · GitHub-Issues intake ·
  Tropy/Omeka ingest · ALTO/HTR import · VTT/SRT import · touch authoring · geo-coords.
- **Deferred — server-shaped (do NOT build; the seed records the serverless approximation):** live
  co-editing · classroom submission inbox · volunteer task queue · cross-library discovery · DID signing.

Each backlog item is **already §5-qualified by construction** (its seed names audience + evidence +
why-it-broadens + frame-fit). A *new* idea **outside** the backlog must still pass the user-serving
test below before it earns a cycle.

### 5b. Feature-cycle procedure (research → build → code-review → gate)

A feature cycle is still ONE atomic, gateable improvement, but it carries two obligations the
look/feel/perf cycles don't:

1. **Pre-build research (targeted — not a re-survey).** Open the seed; scout the **specific donor +
   prior-art `relpath:line`** it cites (e.g. `cozy-iiif parseURL`, `field-studio` exceljs/
   `AnnotationTemplateService`, biiif `Directory.ts`) and the relevant `Prior Art/NN-*.md` axis. If
   the donor's API is a library in `.claude/rules/deps-index.md`, query
   `mcp__context__get_docs(<pkg@ref>, <topic>)` before writing code. Cache anything durable to mulch
   `product-research`. This is Prep — it precedes the first edit.
2. **Build** the one change, matching surrounding code. The locked frames in `CONTEXT.md` are inviolable.
3. **Code-review before the gate.** Dispatch the `code-reviewer` subagent (or the
   `requesting-code-review` skill) on the diff against the plan + the perfectionist-dev bar; fix what
   it flags. A feature cycle does **not** reach the gate un-reviewed — this is what separates "builds"
   from "good".
4. **Gate** exactly as §3 (both metric families). A feature scores its Family-B win via the
   *Roadmap-feature-coverage* scalar and must **regress none** of look/feel/perf/a11y/bundle.

### 5c. Features bigger than one cycle → decompose, don't defer wholesale

Tier-0 ① (local image import, effort **L**) and other large items will **not** fit one gateable
cycle. Do **not** push the whole feature to a dry cycle. **Decompose it into gateable sub-cycles**,
each a shippable improvement on its own (e.g. ① → [FSA folder-pick + image read] → [single image →
IIIF Canvas] → [multi-image → Manifest] → [wire into Studio import UI]). Track sub-cycles under the
parent seed (`sd`); the parent closes when the last sub-cycle lands. The §6 "one gateable cycle"
rule is satisfied **per sub-cycle**, not per feature — so a large feature never counts as a dry cycle.

**Audiences** (the product's natural and adjacent markets) — for grounding *new* ideas beyond the backlog:
- Digital-humanities scholars; manuscript / codicology / paleography researchers (the Voynich demo's bent).
- GLAM exhibit creators (galleries, libraries, archives, museums) — IIIF's home turf.
- Educators and students building annotated visual/AV explainers.
- Independent researchers and hobbyists who want zero-backend, no-lock-in publishing.

**Comparators to research** (what they offer that broadens appeal):
Mirador, Universal Viewer, Omeka (S), Scalar, StoryMapJS, Juncture, Exhibit.so, Recogito,
Annotorious-based tools. Ask: what lowers the barrier for non-technical authors? what makes a
*published* exhibit more shareable / embeddable / discoverable (SEO, og-tags, oEmbed)? what
accessibility and mobile gaps lock out audiences? what import paths (IIIF pull, CSV, existing
annotations) widen the funnel?

A feature passes the **user-serving test** only if the loop can name: (a) the audience it
serves, (b) the researched evidence they want it, (c) why it broadens rather than narrows
appeal. If it can't, it's overambition — **file a seed and defer**, don't build.

---

## 6. Anti-overambition rails

- **Small by default.** Bias every cycle to a look / feel / performance win shippable and
  gateable in one cycle.
- **Bigger is allowed when genuinely user-serving** — including a small new feature or even an
  architecture change — but only if it passes §5's user-serving test **and** its scope still
  fits one gateable cycle.
- **Architecture changes carry their own provenance.** Any cycle that changes architecture
  MUST write its `docs/adr/NNNN-*.md` (next number) **or** a mulch `decision` record
  *in the same commit*. Per the publish-or-audit posture, an unattended architecture change
  with no provenance trail is forbidden — the archive must stay reconstructable cold.
- **Respect the locked frames** in `CONTEXT.md` (OSD+Annotorious, Studio/Viewer split, WADM,
  IIIF, static-publishable, no server). These are non-negotiable; do not relitigate them.
- **Anything not finishable + gateable in one cycle → file a seed (`sd create`) and defer** —
  EXCEPT a feature already on the researched backlog (§5a) that is merely *large*: that is
  **decomposed into gateable sub-cycles** (§5c), not deferred wholesale. The backlog is where
  ambition is parked; a backlog item too big for one cycle is split, not shelved.
- **Never weaken a gate to make a cycle pass.** Lowering a threshold to ship is a regression
  disguised as progress.

---

## 7. Environment (runner)

- **Canonical runner (updated 2026-06-09, user-approved): `npx --yes pnpm@11` on Node ≥22.12** —
  `PATH=$HOME/.nvm/versions/node/v22.22.2/bin:$PATH` in this shell (nvm; fnm has 24.x too).
  Astro requires Node ≥22.12 and the lockfile is pnpm-11-flavored.
- Node 20 (the shell default) still runs vitest/typecheck but CANNOT build the viewer, and
  **pnpm@9 must not be used**: its `--frozen-lockfile` rejects the pnpm-11 lockfile AFTER
  purging node_modules (observed 2026-06-09 — recover with a clean `pnpm@11 install`).

---

## 8. Baseline scorecard — measured 2026-06-09 end-of-run (commit `cca6d0a`, `main`, deployed)

| Metric | Value | Note |
|--------|-------|------|
| Typecheck | **GREEN — 0 errors** | was 4 at run start |
| Tests | **GREEN — 526** | render-core 435 · mount 17 · svelte 17 · viewer 13 · studio 59 |
| Bundle — OSD+Annotorious | 790.4 KB min / **223.7 KB gz** | ≤240 KB budget; meter = esbuild 0.27 (222.7 under 0.21 — same code, meter drift) |
| axe violations | **0** | 4 published routes + studio library/overview/editor/AV |
| Console errors / broken links / tap targets <24px | **0 / 0 / 0** | published dist + studio dev |
| FCP (published home, localhost median) | **84 ms** | was 232 ms; fonts self-hosted (ADR-0012) |
| Canonical origin | `https://micahchoo.github.io/Archie/` | ADR-0013 — one config source, observable drift (wiring pending) |

**Standing notes:** any viewer build regenerates `apps/viewer/public/published/` with fresh
ULIDs (Archie-dcde) — restore before committing. Measurement harness conventions live in
HANDOFF.md §"/goal LOOP RUN".

## 9. How to run

- **Start the run:** `/goal` — runs cycles back-to-back until dry (§4a) or you interrupt.
  One invocation; no re-running, no interval to guess. Auto-compaction keeps it alive.
- **Stop:** interrupt the session, or let it stop itself after 3 dry cycles.

Each cycle ends by reporting (kept short so the run stays legible across compactions): what it
measured, what it changed, the before/after scalars, the gate verdict (merged / reverted), and
what it deferred to seeds. Then it begins the next cycle automatically.
