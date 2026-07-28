# Format: slide decks (≤2 slides/step), embedded in the app's help section

User directive 2026-06-20: "think of these as slides, where 1 page gets a maximum of 2 slides,
and redesign" — plus the note "this is also going to be embedded in the help section of the app."

Two locked constraints (see [[NOTES.md]] "SLIDE-DECK FORMAT"):
1. **Each step = at most 2 slides**, one idea per slide. A hard cap that forces prioritisation —
   Step 1 dropped the journey pipeline and the layers infographic to fit (value-prop slide +
   nesting slide). This compounds the "non-obvious only" filter ([[0006-teach-the-non-obvious-only]]):
   not just which steps, but which TWO ideas per step earn a slide.
2. **Embeds in the app help section** → the deck must fill its CONTAINER, not the window. Built
   `body.deck-mode` + `.deck{height:100%; min-height:24rem}` so it works in an iframe/panel and
   standalone. Each step stays a self-contained HTML file (drop into an iframe).

Framework: `assets/deck.js` + deck CSS. Click-through (the recommended mechanic; user didn't pick
an option but the embed note implied "proceed"). Back/Next + ←/→ + dots; at a deck edge the
buttons flow to the prev/next step file, so the 7 short decks read as one continuous tour.
Verified the deck fills a constrained panel and navigates/animates correctly before rolling it to
all three built steps. All prior components (infographics, drill, popovers, Simple/Advanced
toggle) drop into slides unchanged.

Open question for later: the help section may want a landing/index (the old journey pipeline
could live there as a table of contents) — revisit once more steps exist.
