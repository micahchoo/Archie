# @archie/studio

The **authoring app** — a Svelte SPA built with Vite (ADR-0002 / Q-2). This is where an author creates a Library, builds Exhibits, draws regions, attaches notes and media, resolves merges, and publishes. It depends on `@render/svelte` → `@render/mount` → `@render/core`; it shares no code with `@archie/viewer`, only the published render contract.

> **Status:** Phase 2 — built and dogfooded on the Voynich and Bidar exhibits; browser-regression verification pending. See the [root README](../../README.md#status--roadmap) for the full status.

## Run it

Run from the repo root with Node ≥ 22:

```bash
pnpm --filter @archie/studio dev      # Vite dev server on http://localhost:5173
pnpm --filter @archie/studio build    # production build
```

## What it does today

- **Library home** — browse and create exhibits (Voynich + Bidar ship as fixtures); rename objects.
- **Canvas editor** — OSD + Annotorious draw/select/create/edit/delete loop → WADM notes; thumbnail rail, layer/tag filtering.
- **Image import** — file picker or drag-drop; binaries persisted to OPFS.
- **A/V editor** — temporal OSD + "Set in" → "Add note" time-range marking; transcript cues.
- **Persistence (three configs)** — UNBOUND (OPFS only), FOLDER (Chromium File System Access autosave), FILE (`.archie.zip`). Autosave + load-on-mount.
- **Merge review** — import changes → summary → conflict cards.
- **Publish** — whole library → `.archie.zip` download, or GitHub Pages push via base64-blob Contents API.
- **Cite (`⌘K`)** — link notes across the library.

## Key files

| File | Role |
|------|------|
| `src/App.svelte` | Main app shell + editor logic |
| `src/store.ts` | OPFS persistence |
| `src/binding.ts` | Folder / zip binding |
| `src/handles-db.ts` | IndexedDB-backed File System Access handles |
| `src/lib/` components | `LibraryHome`, `Canvas`, `AvEditor`, `CmdK`, `MergeReview`, `LayoutPicker`, `Publish` |

## Not yet built

Grid slideshow sub-mode, narrative section-authoring UI, styled A/V scrubber + `mm:ss` inputs, publish-originals opt-in, broken-links surface, and the gated Phase-3 inventions (overview-as-canvas, identity prompt). See [`docs/IMPLEMENTATION-STRATEGY.md`](../../docs/IMPLEMENTATION-STRATEGY.md).
