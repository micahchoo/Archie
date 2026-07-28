# Two readers (Simple ⇄ Advanced), text-judo, and a CSS collision caught

Audience clarified 2026-06-20 (the "understand what the user might already know" prompt):
the tutorial serves **two readers at once** — a general app user with media to annotate
(Simple) AND a GLAM scholar (Advanced) — via a per-lesson **Simple ⇄ Advanced toggle**. Simple
is the shared plain-language baseline; Advanced is purely additive depth (IIIF/WADM mapping,
citation, file:line/ADR source refs). Publish will lead with the no-account portable
`.archie.zip`; GitHub Pages is the Advanced route. (Updates [[MISSION.md]]; supersedes the
single-"newcomer" floor implied in [[0004-newcomer-voice]] — newcomer voice still governs the
Simple layer.)

Also locked the **"text judo"** directive: prefer one interactive model / infographic over
prose. Built the hero `.flow` transformation infographic (media → Archie → live exhibit) and cut
the surrounding copy to captions.

**Failure caught by verification (worth remembering):** the level toggle first set
`<body class="adv">`, but the content depth class is also `.adv` — so the rule `.adv{display:none}`
matched the body itself and set the ENTIRE PAGE to `display:none` in Advanced mode. Headless
check showed body height collapsing while computed display read "block" on the child (offsetParent
null + height 0 was the tell). Fix: body uses `data-level="advanced"`, never a class colliding
with a content selector. Lesson: when a state class toggles on a container, make sure its name
can't match a content rule — and always verify the *rendered height*, not just computed display.
