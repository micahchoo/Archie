# Archie — External-Facing Documentation Plan

How the captured screenshots become a cohesive user guide. The screenshots are
*figures inside a narrative*, not the narrative itself. This plan defines that
narrative: who it's for, how it's organized, what each figure does, and the
voice it speaks in.

> Capture tooling: `scripts/capture-screenshots.mjs` (one-shot, re-runnable).
> Output: `docs/screenshots/auto/<name>.<viewport>.png` + `manifest.json`.
> This plan is the design; the capture is the supply.

---

## 1. Audience & goal

**Reader:** a curator, scholar, archivist, or teacher — *not* a developer. Someone
who has high-resolution media (a manuscript folio, a field recording, a map) and
wants to annotate it and put it online without a server or a database.

**Their question, in order:** *"What is this? → How do I get my media in? → How do I
annotate it? → How do I shape the story? → How do I publish it?"*

The doc layer answers that exact sequence. Each answer is a short page anchored by
one or two screenshots. The three bundled exhibits — the **Voynich** folio set
(a Grid of images), the **Bidar** map (a single deep-zoom image), and the
**Field Recording from Bidar** (audio) — are the *walked examples* throughout.

**Non-goal:** internal architecture, IIIF spec detail, code. Those live in
`docs/architecture/` and `docs/adr/` and are for contributors, not users.

---

## 2. Voice & vocabulary (non-negotiable)

Use the **curator vocabulary** from `CONTEXT.md §Language`, never internal
view-names or media-editing jargon:

| Say this (user-facing) | Never say (internal / jargon) |
|---|---|
| Your library | LibraryHome, CMS |
| An exhibit | manifest, ExhibitOverview, project |
| An object (image / audio / video) | canvas, asset, item, hotspot |
| A note | annotation, comment |
| A reading | layer, lens |
| A tag | keyword |
| A section / the narrative spine | chapter, stop, scene |
| Region / time-window | bounding box, selector, fragment |
| Publish | export, build, deploy |

Caption style: **name the action and what it produces, for a curator** — not the
mechanism. "Draw a region on the folio and attach a note" — not "create a WADM
annotation with an xywh selector." (See memory: *Archie UI copy = curator voice*.)

---

## 3. Information architecture — the user-task spine

A linear guide. Each step is one page; each page carries the screenshot(s) named
in the **Figure** column. The order *is* the onboarding path.

| # | Page (user task) | Figure(s) | Walked example | Closes loop with |
|---|---|---|---|---|
| 0 | **What is Archie?** | `viewer-voynich` | A finished, published exhibit | step 6 |
| 1 | **Your library** | `studio-library` | The three bundled exhibits | — |
| 2 | **Inside an exhibit** | `studio-overview` | Voynich — every folio on one canvas | — |
| 3 | **Annotate an image** | `studio-editor-image` | Bidar map / Voynich folio | — |
| 4 | **Annotate audio & video** | `studio-editor-av` | The Field Recording | — |
| 5 | **Shape the story** *(readings, tags, sections)* | `studio-overview` (+narrative if reachable) | Voynich competing readings | — |
| 6 | **Publish** | `viewer-home`, `viewer-bidar`, `viewer-av` | Same three exhibits, now public | steps 0–4 |

**The loop that makes it cohesive:** steps 1–5 are authoring (Studio); step 6 is
the *same three exhibits* rendered as the public Viewer site. Pairing the Studio
shot with its Viewer counterpart for each demo exhibit shows the reader that what
they author is exactly what their visitors get. That author→publish pairing is
the spine of the whole guide — it is why both apps exist (CONTEXT.md §Locked
frames: two surfaces, one data source).

---

## 4. Figure inventory & captions

Captures are **desktop only** (1440×900) — Archie's apps are not optimized for
mobile, so a phone-width shot would misrepresent the product. Draft captions,
curator voice:

- **`viewer-voynich`** — *"A published exhibit. Visitors zoom into each folio and
  read your notes in place — no app to install, just a web page."*
- **`studio-library`** — *"Your library. Every exhibit you're building lives here.
  Open one to keep working, or start a new one."*
- **`studio-overview`** — *"Inside an exhibit: every object on one zoomable canvas.
  Drag to arrange the order visitors will follow."*
- **`studio-editor-image`** — *"Annotating an image. Draw a region on the object,
  then write the note that appears when a visitor finds it."*
- **`studio-editor-av`** — *"Annotating sound. Mark a time-window on the waveform
  and attach a note to that moment."*
- **`viewer-home`** — *"Your published gallery — the front page of your site,
  listing every exhibit."*
- **`viewer-bidar` / `viewer-av`** — *"The same map and recording you annotated,
  now live for visitors."*

If a Studio figure comes back `skipped` in the manifest (the SPA has no URL
routing, so deep states depend on click-driving holding up), the page still
stands on its prose; capture that one figure manually and drop it in by name.

---

## 5. Where the docs live

Recommended, in priority order:

1. **`docs/guide/NN-title.md`** — one markdown file per step above, screenshots
   referenced from `docs/screenshots/auto/`. Renders on GitHub today, zero build.
   This is the cohesive layer; the existing `README.md` becomes its front door
   (the "What you can build" table → "Full guide →" link to `docs/guide/`).
2. **Later: a `/guide` route in the Viewer (Astro).** Since Archie *is* a static-
   site publisher, dogfooding the guide as Viewer pages is the honest end state —
   the docs ship the same way exhibits do. Defer until the markdown guide proves
   the structure.

Keep the 5 legacy hand-captured PNGs in `docs/screenshots/` until the `auto/`
set covers their content, then retire them so there's one source of truth.

---

## 6. Next steps (when capture finishes)

1. Read `docs/screenshots/auto/manifest.json` — confirm which figures captured vs
   skipped.
2. Write `docs/guide/00`…`06` from the §3 spine, embedding figures with the §4
   captions.
3. Repoint `README.md`'s screenshot section at the new `auto/` figures and add the
   "Full guide →" link.
4. For any `skipped` Studio figure: either capture manually, or (iteration 2) add a
   dev-only `window.__archie.setView()` hook gated on `import.meta.env.DEV` so the
   script can jump straight to a view instead of click-driving (advisor's note —
   invasive, do only if click-driving stays flaky).

---

*Plan authored 2026-05-27. Supply (screenshots) produced by
`scripts/capture-screenshots.mjs`. Voice per `CONTEXT.md §Language` + memory
`archie-ui-copy-curator-voice`.*
