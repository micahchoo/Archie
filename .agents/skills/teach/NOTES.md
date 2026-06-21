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

## SLIDE-DECK FORMAT + EMBED IN APP HELP (user directive 2026-06-20)
Lessons are **slide decks**, not long-scroll docs. Rules:
- **Each step = a deck of AT MOST 2 slides**, one idea per slide. Hard cap forces real cuts
  (Step 1 dropped the journey pipeline + layers to fit two slides).
- **Embeds in the app's help section** → must fill its CONTAINER, never assume the full window.
  `body.deck-mode` + `.deck{height:100%}` fills an iframe/panel; `min-height:24rem` fallback for
  auto-height embeds. Self-contained HTML per step = drop into an iframe in help.
- Framework: `assets/deck.js` + deck CSS in `lesson.css`. Markup: `.deck[data-prev][data-next]`
  › `.deck-top` (eyebrow + level-toggle) › `.deck-stage` › `.slide`(.active) › `.deck-nav`
  (`.dnav.prev`, `.dots`, `.dnav.next`). Back/Next + ←/→ keys + dots; at the deck edge Back/Next
  flow to the prev/next STEP file (so the 7 steps read as one continuous tour).
- Per-slide chrome: `.slide-inner` (max-width measure, centered). Slides scroll internally if a
  slide overflows the panel. Drop long ask-blocks; use a compact `.callout` "Try it" on last slide.
- Reused inside slides unchanged: `.flow`/`.pipeline`/`.layers` infographics, `.model.drill`,
  glossary `.term` popovers, Simple/Advanced toggle, `figure.real` screenshots.

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
- **Studio also has a prebuilt static dist** at `apps/studio/dist` — base is `/studio/`, so mount
  it under that path (symlink `/tmp/sroot/studio -> apps/studio/dist`, serve `/tmp/sroot`, open
  `/studio/`). No dev server needed. It ships the seed EXAMPLE exhibits, so the Library home renders
  fully. Captured `studio-home.png`, `studio-create-tile.png` this way. (Dev server `pnpm dev`
  :5173/studio/ only needed for live-author flows, not screenshots.)

## Planned spine — RE-SCOPED to "non-obvious only" (CONFIRMED by user 2026-06-20)
Old plan was feature-by-feature; much of it was discoverable. Leaner, denser steps:
1. ✅ Orientation — the model (four nouns) + the path  *(shipped: 0001)*
2. ✅ Get media in — THREE real create onramps: blank title / image folder / IIIF link
     (CSV is annotation-import inside an exhibit, NOT a create path — corrected). *(shipped: 0002)*
3. ✅ Where your work lives — autosave + three homes (browser/folder/zip), Playground vs
     Project. Grounded in studio-projectbar + studio-example-card screenshots. *(shipped: 0003)*
4. ✅ Reading layers — Readings (exclusive) vs Tags (additive), cite ⌘K, emphasis. *(0004)*
5. ✅ Narrative — the grid⇄narrative flip demo + what a Section is. *(0005)*
6. ✅ Bulk import — CSV columns → notes; pending-notes "Set area" pipeline. *(0006)*
7. ✅ Publish — portable `.archie.zip` first, then GitHub Pages (real gallery). *(0007)*
SPINE COMPLETE 2026-06-20. Discoverable mechanics (pan/zoom, drag-reorder, click-to-open) are NOT steps.

## SIMPLE REGISTER DROPPED 2026-06-20 (user directive "drop the simple version")
No more Simple/Advanced toggle. Single register — the fuller depth is shown to everyone:
`.adv`/`.adv-inline` are now always visible (CSS), `.level-toggle` removed from all decks.
The old depth asides (IIIF/WADM mapping, async collaboration, durable citation) are now just
inline "deeper note" callouts (`.aside-adv`), always on. (Supersedes the dual-register plan in
LR-0005; newcomer voice from LR-0004 still governs the single register.)

(Old feature-by-feature list retired 2026-06-20 per LR-0006.)

## Open follow-ups
- Consider a `docs/learn/index.html` landing once 3–4 lessons exist.
- Screenshots: a later pass could embed real Studio captures (run skill + lightpanda).
