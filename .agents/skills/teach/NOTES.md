# Notes — teaching the Archie docs spine

## What this workspace is
A teaching workspace repurposed as a **documentation spine**: the "learner" is a future
Archie *user*, and the lessons we ship ARE the project's interactive docs. Control-plane
files (mission, resources, glossary, records, this file) live in the teach workspace;
the user-facing lessons + assets ship to the repo at **`docs/learn/`**.

## User preferences (stated 2026-06-20)
- **This is an ONBOARDING TUTORIAL, not a course.** Frame every step as guiding a brand-new
  user through getting started — second person, "your first move", numbered steps.
- **Interactive models over text.** Favour small manipulable sandboxes (drive it, see it
  change) over prose explanation. NO QUIZZES (removed 2026-06-20). The learner builds
  intuition by doing, not by being tested.
- **Skimmable above all.** Each step ~one screen, completable fast, one tangible win.
- Lead with the *motivation* (why) before the *mechanics* (how).
- **Newcomer voice — never assume the reader knows or cares about a concept yet.** Lead with
  what the *visitor or author experiences/wants*, then name the Archie term gently and defer the
  jargon ("you'll meet it later"). Avoid insider framing like "the rule that surprises everyone"
  or "there is no X switch" — a beginner never held that assumption. Component names
  (prose spine, deep-zoom canvas, Readings legend) wait until the step that teaches them.
- **Grounded, never guessed** — every affordance traces to the codebase / ADRs / CONTEXT.
- Primary learner: the **author** (Studio), zero→published. Reader/Viewer comes later.
- Output location: **`docs/learn/`** (discoverable, ships with the project).

## Conventions established
- Shared stylesheet: `docs/learn/assets/lesson.css` (Tufte-leaning, prints clean). Every
  lesson links it — do not inline styles a second lesson would duplicate.
- Reusable interactive models: `docs/learn/assets/models.js` (markup-driven, no deps).
  Three so far: `.model.drill` (drill-down containment; data in inline `<script class="drill-data">`),
  `.model.flip` (a state→layout flipper; `data-max`, `+/−` buttons), `.spine.interactive`
  (click a step to expand its "why"). Add new models here, never inline a one-off a future
  step would duplicate. Verified live in lightpanda before shipping.
- Glossary is canonical and **popover-only — NO separate glossary page** (deleted 2026-06-20).
  Single source of truth: `docs/learn/assets/glossary.js` (a `window.ARCHIE_GLOSSARY` map +
  self-wiring popovers). Mark a term inline as `<span class="term" data-term="slug">Word</span>`;
  hover/focus/tap shows the definition. Edit ONLY the map to update a definition everywhere.
- **Teach the non-obvious, not the discoverable** (governing filter, LR-0006). If a user finds
  it by clicking around or by doing the obvious thing, the app teaches it — not onboarding.
  Spend words only on what's non-obvious or multi-step to learn. (Removed grid⇄narrative from
  Step 1 on this basis; flip model + grid-led/narrative-led.png reserved for the Sections step.)
- Each step ends with: a hands-on "your first move" block + an "I'm your guide" nudge.
- **Simple ⇄ Advanced toggle** (component in `models.js` + `lesson.css`): every lesson carries a
  `.level-toggle` in the masthead. Simple is the default baseline everyone reads. Advanced is
  PURELY ADDITIVE depth for the GLAM scholar — wrap extras in `.adv` (block) or `.adv-inline`,
  and use `.aside-adv` for a standards/citation aside. Source/code refs (file:line, ADRs) live
  in `.adv` so Simple stays clean. The body carries `data-level="simple|advanced"` (NEVER a class
  named `adv` — that collides with the `.adv` content selector and hides the whole page; learned
  the hard way, see LR-0005). Choice persists in localStorage across steps.
- **Text judo**: lead with an interactive model or infographic; prose is captioning. Ask "can a
  visual show this?" before writing a paragraph. Infographic component family in `lesson.css`
  (all share the white-card/rounded/emerald-arrow look):
  - `.flow` — input → engine → output transformation (the hero; user's favourite).
  - `.pipeline` — a numbered start→steps→end journey; tap a `.pstep` → `.pdetail` shows its purpose.
  - `.layers` — a base bar + additive option cards (used for Sections/Readings/Tags).
  - `.model.drill` / `.model.flip` — the interactive containment + screenshot-swap models.
  Reuse these in later steps; add new ones to the same family rather than inlining one-offs.
- **Publish step leads with the portable `.archie.zip`** (no accounts); GitHub Pages is Advanced.
- **Verify interactivity before declaring done**: serve `docs/learn/`, drive the models in
  Playwright/lightpanda (click → assert DOM changed). Quizzes are gone — interactivity is the product.

## GROUND DEMOS IN THE REAL UI (user directive 2026-06-20)
Demos must reflect Archie's actual interface, not abstractions. Two ways, both used:
1. **Real screenshots** of the running Viewer, embedded in `docs/learn/assets/img/`.
2. **Real theme tokens** — `lesson.css` `:root` mirrors `apps/viewer/src/tokens.css`
   ("Verdant Clearing": ink `#1a3c23`, paper `#f7f4ec`, accent emerald `#3a8c5d`, link amber `#9a7b39`).

### How to (re)capture real screenshots — reproducible pipeline
- A **prebuilt static Viewer** lives at `apps/viewer/dist/` (root-based; no dev server needed).
  Real demo exhibits: `#/voynich` = **grid-led**, `#/voynich-reading` = **narrative-led**,
  Library Gallery at `/`. (If dist is stale, rebuild: `cd apps/viewer && pnpm gen && pnpm build`.)
- Playwright 1.60 + Chromium are installed. Capture in ONE shell (background servers die between
  Bash calls — serve + screenshot + kill in the same invocation):
  `cd apps/viewer/dist && python3 -m http.server PORT & ; node <playwright screenshot script>`
- Reference capture script: `.claude/skills/teach/.scout/shoot.mjs` (point it at the live port).
- Screenshots used so far: `gallery.png`, `grid-led.png`, `narrative-led.png` (1280×820 @2x).
- The `.model.flip` widget now swaps `<figure class="shot" data-mode="grid|narr">` real images;
  `figure.real` is a plain captioned real screenshot for hero/illustration use.
- TODO for later steps: capture real **Studio** screens (Overview light-table, Object editor
  3-pane, draw-a-Note, Readings rail) — Studio needs the Vite dev server (`pnpm dev`, :5173/studio/),
  not the static dist.

## Planned spine — RE-SCOPED to "non-obvious only" (CONFIRMED by user 2026-06-20)
Old plan was feature-by-feature; much of it was discoverable. Leaner, denser steps:
1. ✅ Orientation — the model (four nouns) + the path  *(shipped)*
2. ☐ Get media in — the four onramps (folder / IIIF / CSV / blank). Non-obvious you even can.
3. ☐ Where your work lives — Playground vs Project, browser storage, autosave, export zip.
     (Anxiety-reducing; getting it wrong loses work.)
4. ☐ Annotation that isn't obvious — Readings vs Tags, emphasis, citing/links.
     (NOT "how to draw a box on an image" — that's discoverable.)
5. ☐ Narrative — Sections + the emergent grid⇄narrative point (reuse the flip demo + screenshots here).
6. ☐ Bulk import done right — CSV + the pending-notes placement workflow.
7. ☐ Publish — portable `.archie.zip` first; GitHub Pages as Advanced.
Advanced-layer asides thread through: IIIF/WADM mapping, async collaboration (share-zip/merge),
durable citation. Discoverable mechanics (pan/zoom, drag-reorder, click-to-open) are NOT steps.

(Old feature-by-feature list retired 2026-06-20 per LR-0006.)

## Open follow-ups
- Consider a `docs/learn/index.html` landing once 3–4 lessons exist.
- Screenshots: a later pass could embed real Studio captures (run skill + lightpanda).
