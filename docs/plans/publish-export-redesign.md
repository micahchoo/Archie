# Publish/Export redesign — home card + export menu

> Design spec (brainstormed 2026-07-28). Successor to the Archie-c367 one-flow surface.
> Status: approved direction; implementation not started.

## Intent

The c367 Publish dialog shows every destination, every quality tier, and every side artifact at
once, every time — ~15 text blocks before the button, with the two *unavailable* destinations
shouting loudest (red caps). It glues two different jobs together: publishing a **site** (a place
that stays updated) and exporting a **file** (a thing you hand someone). Redesign ground-up around
author intent: publishing becomes one click against a remembered home; exports become small
focused sheets.

## Requirements

- R1. An author whose library has a home publishes changes in ≤2 clicks from the editor, without
  re-choosing destination or quality.
- R2. A first-time publish walks one question per screen — where → auth (if needed) → quality (only
  if it matters there) — and remembers the result as the library's home.
- R3. Producing a file copy (.archie.zip / single .html / deposit bag) is reachable from the same
  entry point but never interleaved with site publishing.
- R4. Unavailable options stay visible with their concrete reason (c367's greyed-with-reason
  principle), styled quiet — never red, never all-caps.
- R5. Each fact (size, file count, upload estimate) appears once per surface.
- R6. The two viewable-copy exports present as siblings — one choice, two sizes: single .html for
  small libraries, folder-with-built-in-viewer for large (both carry the same deduped viewer,
  Archie-e09d wiring 64c8f62). The single-file size refusal routes to its sibling, not to a
  dead end.
- R7. Existing sub-flows keep working unchanged in behaviour: GitHub device auth, repo-picker /
  name-taken, the publish progress checklist, preview-as-reader, zip name/subset fields
  (`ZipExportFields`).

## Constraints

- Svelte 5 runes; the single-scrim invariant (`Publish.svelte` header `@constraint`) holds — one
  scrimmed surface, machine state survives close, in-surface "← Back".
- `export-surface.ts` (probe → `rowsFor`/`factsFor`/`chooseInitial`) stays the data source for any
  list of destinations; no second verdict path.
- `deploy/remembered.ts` is the memory of the home — extend it, don't build a parallel store.
- `publish-machine.svelte.ts` screens (auth, repo-picker, publishing checklist) are reused, not
  rewritten.
- Gates: `pnpm --filter @archie/studio run check` (0/0), `pnpm typecheck`, studio vitest, and a
  real-browser drive for any prop-wiring claim ([[svelte-no-typecheck-net]]).
- Copy in sentence case, product-copy voice; no all-caps body text.

## Locked decisions

| # | Decision | Rules out | Serves |
|---|---|---|---|
| LD1 | Two surfaces: Publish sheet vs Export menu | the one-wall dialog | R3 |
| LD2 | Destination is a remembered **home**; setup runs once | per-run destination choice | R1, R2 |
| LD3 | Quality tier lives inside destination setup/detail, only where the destination makes it matter | a global setting; an always-on top-level control | R1, R5 |
| LD4 | One header entry point: `Publish ▾` — primary action + menu holding "Export a copy…" | two sibling header buttons | R1, R3 |
| LD5 | Greyed-with-reason retained wherever options are listed | hiding unavailable options | R4 |

## The shape

```
[Publish ▾]
│
├─ no home yet → SETUP, one question per screen:
│    1. Where should this library live?   ← rowsFor(): 4 destinations,
│       probe recommends, greyed-with-reason, facts inline once
│    2. auth / folder pick, if the choice needs it
│    3. quality, only if it matters here (e.g. GitHub 1 GB)
│    → publishes, remembers home
│
├─ home set → PUBLISH SHEET:
│    site URL · last published · size + upload estimate · "carries its own viewer"
│    [Publish changes] [View site] [Preview as reader]  Change where this publishes…
│    → existing progress checklist
│
└─ Export a copy… →
     .archie.zip (name/subset sheet, carries originals)
     A VIEWABLE copy — two sizes of the same thing (both ship the viewer, deduped per e09d):
       · Single .html — small libraries; opens by double-click, no server
       · Folder with built-in viewer — large libraries; opens from any static
         host / USB-served folder (greyed-with-reason where folder access is
         unavailable). One-off handoff, distinct from setting the folder as home.
     Deposit copy (BagIt)
```

The single-file size refusal cross-links its sibling: "too big for one file → export the folder
with built-in viewer instead" (R6).

## Not doing

- Ambient status pill in the header (Approach 3) — a 58-minute upload is not an ambient act;
  possible later graft on top of this design.
- Headless publish (DIVERGENCES.md divergence 4 — still queued; read its kill criterion first).
- Any change to sink capabilities, probes, or publish mechanics — this is surface reorganization.
- Making folder/R2 available in more browsers.

## Open questions

- Blocking: none.
- Exploratory: exact copy (product-copy pass at build time); whether "Change where this
  publishes…" needs a confirm step when the old home has already been deployed to; whether the zip
  sheet should surface an "include originals" choice or keep it implicit.

## Approaches considered

1. **Home card + export menu** — chosen (deploy-tool pattern for the site half, writing-app export
   menu for artifacts). The repo's IIIF prior-art corpus (clover/mirador/UV) contains no
   publish-dialog precedent; pattern donors are external (Netlify/Vercel deploy model; iA
   Writer/Obsidian export menus) and are named as such rather than corpus-cited.
2. One dialog, two tabs — weaker separation, feature-bleed risk.
3. Ambient status pill — rejected as foundation (upload consent/progress), deferred as graft.
