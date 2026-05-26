# @archie/viewer

The **published static site** — Astro with Svelte islands (ADR-0002 / Q-2). Read-only. It renders the static tree that the Studio's publish step emits (WADM heads pages + IIIF Presentation 3), deploys to GitHub Pages, and needs no backend. It depends on `@render/svelte` → `@render/mount` → `@render/core`; it shares no code with `@archie/studio`.

> **Status:** Phase 2 — built and dogfooded on the Voynich and Bidar exhibits; browser-regression verification pending. See the [root README](../../README.md#status--roadmap) for the full status.

## Run it

Run from the repo root with Node ≥ 22:

```bash
pnpm --filter @archie/viewer gen      # generate the published static tree (do this first)
pnpm --filter @archie/viewer dev      # Astro dev server on http://localhost:4321
pnpm --filter @archie/viewer build    # production build (runs gen in prebuild)
```

`gen` runs `gen-published.mts` (via vite-node) to build `public/published/` — the same projection the Studio produces. `dev` and `build` auto-run it in their prebuild step; run it manually if you start Astro directly.

## What it does today

- **Gallery landing** — the library index of exhibits (`index.astro`).
- **Single reading mode** — OSD + a 3-state pane (collapsed / preview / detail).
- **Grid reading mode** — multi-object gallery with read-on-select.
- **Narrative reading mode** — prose spine (Bidar's 25 reflections) + a map canvas; marker click scrolls to the note.
- **Deep-link arrival** — `#/a/<id>` lands on the target note with fading chrome.
- **Markdown notes** — inline photos / audio in the reader.
- **Media player** — `<audio>` / `<video>` + transcript cues with click-to-seek and active-line highlight.

## Key files

| File | Role |
|------|------|
| `src/pages/index.astro` | Gallery landing |
| `src/pages/*.astro` | Per-exhibit pages (`voynich`, `bidar`, `av`) |
| `src/components/ExhibitView.svelte` | Context holder |
| `src/components/Reader.svelte` | Popup/drawer OSD reader |
| `src/components/NarrativeReader.svelte` | Prose-spine layout |
| `src/components/MediaPlayer.svelte` | A/V playback + cues |
| `gen-published.mts` | Builds the static published tree |

## Not yet built

Breadcrumb / zoom-to-fit chrome on deep-link arrival, and IIIF Content-State arrival (`?iiif-content`). See [`docs/IMPLEMENTATION-STRATEGY.md`](../../docs/IMPLEMENTATION-STRATEGY.md).
