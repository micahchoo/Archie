---
updated: 2026-08-30
---
# annotorious (`field-studio/node_modules/@annotorious/annotorious`)
> *Does the W3C SVG selector adapter round-trip Ellipse/Line/curved-Path shapes losslessly?*

**No — verified 2026-07-28 by reading BOTH the serialize and parse sides.** This is the same
`@annotorious/*` family Archie's own annotation layer is built on ([[tauri-csp]]); the survey (docs/
research/prior-art/02-annotation-tools.md, _FRAMING.md Spine B) flagged this as a corpus-wide gap —
promoted here with the actual mechanism traced, not just cited.

## Verified claims (line-cited)
- `SVGSelector.ts:171-189` `serializeSVGSelector` wraps EVERY non-polygon shape in an outer `<svg>`:
  Ellipse → `` <svg><ellipse cx="…" cy="…" rx="…" ry="…" /></svg> `` (`:177`); Line →
  `` <svg><line x1="…" y1="…" x2="…" y2="…" /></svg> `` (`:187`).
- `SVG.ts:36-48` `parseSVGXML` returns `sanitize(doc).firstChild` — the **root** node of the parsed
  document. For the wrapped strings above, that root is the outer `<svg>`, never the inner shape.
- `SVGSelector.ts:39-45` `parseSVGEllipse` calls `doc.getAttribute('cx'|'cy'|'rx'|'ry')` **on that
  root** (`:42-45`) — attributes that live on the *child* `<ellipse>`, not the `<svg>` wrapper. Every
  read returns `null`; `parseFloat(null)` is `NaN`. `parseSVGLine` (`:66-72`) has the identical shape
  for `x1/y1/x2/y2`.
- **Only `POLYGON` survives**, because `parseSVGPolygon` (`:26-34`) never touches the DOM at all — it
  regex-scans the raw string (`value.match(/(<polygon points=...)/)`) — a different code path that
  happens to sidestep the bug entirely.
- `pathParser.ts:167` `commandRegex = /([MmLlHhVvCcZz])\s*([^MmLlHhVvCcZz]*)/g` whitelists only
  M/L/H/V/C/Z. A `Q`/`T`/`S`/`A` command letter never starts a match; its numeric args fall into the
  **preceding** recognized command's `argsString` instead (the "Q"/"A" letter itself parses to `NaN`
  and is filtered, but the coordinates that followed it are kept and silently appended as extra
  points on the wrong command).

## Stated absences
- No test in this checkout exercises an Ellipse or Line selector round-trip (serialize → parse →
  compare); the bug is invisible to whatever suite ships with this vendored copy.

## What citations of it may NOT support
- The survey's shorthand "Path → MoveTo-only corruption" **overstates the specific failure**: the
  path is not collapsed to a single M — unhandled command letters are dropped and their numeric args
  get **misattached to the prior command** as bonus points. Cite the mechanism above, not "MoveTo-only",
  if precision matters.
- This is a vendored `node_modules` snapshot inside `field-studio`, not a fresh clone of
  `annotorious/annotorious` — version-pin it before treating this as upstream's current behavior.

## Archie-d73f (2026-08-30): does ANY Archie path emit/consume Ellipse/Line through that serialize/parse?

**Verdict: ABSENT — no corruption.** The upstream bug is live in Archie's own dependency
(`@annotorious/openseadragon@3.8.2`, `dist/annotorious-openseadragon.es.js`) but no Archie code
path reaches it as a serialize→reparse→resave round trip.

### Installed-package verification (2026-08-30 advisory check)

- Version pin: `node_modules/.pnpm/@annotorious+openseadragon@3.8.2_openseadragon@5.0.1/…`
  (`package.json:3` `"version": "3.8.2"`; deps `@annotorious/annotorious` + `@annotorious/core`
  both 3.8.2, `:62-63`). All dist line refs above are from THIS install.
- `ShapeType` enum DOES carry ELLIPSE/LINE (bundle `:692`) — the types and the broken parse/serialize
  machinery ship in the OSD build. But the DRAWING-tool registry has exactly two entries
  (bundle `:5351-5354`): `new Map([["rectangle", …], ["polygon", …]])` — `listDrawingTools` returns
  only those keys. `setDrawingTool("ellipse")` throws `No drawing tool named ellipse`
  (`:7343-7344`, `:37080-37081`). So Ellipse/Line cannot be DRAWN in the OSD build at all — the emit
  path is dead on arrival inside Annotorious too, independent of Archie's own `DrawTool` lock.
### The bug in Archie's own bundle (confirmed, minified line refs)
- `Sy` (serializeSVGSelector, `:1164-1203`): ELLIPSE → `<svg><ellipse …/></svg>` (`:1182-1186`),
  LINE → `<svg><line …/></svg>` (`:1192-1196`); POLYGON → `<svg><polygon …/></svg>` (`:1177-1181`).
  Call site `:2020`: unrotated RECTANGLE takes the FragmentSelector branch (`fy`) instead —
  `i.type === vt.RECTANGLE && !i.geometry.rot ? fy(i.geometry) : Sy(i)`.
- `ds` (parseSVGXML, `:957-959`) returns `…firstChild` — the OUTER `<svg>` root.
- `vy` (parseSVGEllipse, `:1060-1076`) and `by` (parseSVGLine, `:1077-1091`) call
  `getAttribute(…)` on that root → `null` → `NaN`. Matches the field-studio finding exactly.
- RECT survives (`wy :1102-1134` re-queries `querySelectorAll("rect")`); POLYGON survives via the
  `_y` regex (`:1051-1060`), tried first in `Ty` (`:1149-1163`).

### Emit side (tool modes → save): UNREACHABLE
- `DrawTool = "rectangle" | "polygon"` only — `packages/render-mount/src/surface.ts:13`.
  No `ellipse`/`line` tool string exists in studio/render-mount/render-svelte.
- Sole arm sites: `apps/studio/src/App.svelte:2408-2409` (Box/Outline → `vs.creating` is
  rectangle|polygon only), `:1139` `drawShape = vs.creating ?? "rectangle"`, `:1483`.
  Wiring `App.svelte:2455` → `packages/render-svelte/src/Canvas.svelte:158,191`
  `surface.setDrawingTool(t)` → `packages/render-mount/src/mount.ts:395-397`.
- Save appends the W3C annotation's selector verbatim into the append-only log; spine round-trip
  pinned by `packages/render-core/src/spine/serialize.test.ts:23-34`. Archie therefore only ever
  serializes unrotated-rect (FragmentSelector) + polygon (regex path) through `Sy` — both survive.

### Consume side (import → parse): display-only degradation, NOT data corruption
- `sanitizeSelector` (`apps/studio/src/wadm-import.ts:92-98`) whitelists by UNSAFETY, not shape:
  a foreign `<svg><ellipse …/></svg>` passes and lands verbatim in the log
  (`apps/studio/src/ingest-flows.ts:1174`). This is the one path that ever puts Ellipse/Line
  SVG values into an Archie session.
- Editor canvas: `packages/render-mount/src/mount.ts:327-340` → adapter parse (`Ty` → `vy`/`by`)
  → NaN geometry → broken/invisible marker. The LOG IS UNTOUCHED — `setAnnotations` writes
  Origin.REMOTE and never echoes (`packages/render-mount/src/gesture-guard.ts:8-9`), and even a
  hypothetical NaN re-serialization is blocked by the `\bNaN\b` guard
  (`packages/render-core/src/geometry/selector.ts:94`, applied at `mount.ts:188,198,333`).
- Published viewer never runs Annotorious: `overlayShapeFor` gates on `isV1Shape`
  (`packages/render-mount/src/overlay-shape.ts:29-30`; `selector.ts:124-128`) → ellipse/line are
  skipped LOUDLY (`packages/render-mount/src/read-overlay.ts:107-108`).
  Publish rescale scales ellipse/line attributes correctly anyway
  (`packages/render-core/src/geometry/rescale.ts:118-123`, tested `rescale.test.ts:133-144`);
  `apps/studio/src/publish-tier.ts:46-49` already documents non-v1 imported shapes as
  counted-not-silent.

So the ticket's failure shape — serialize on save, reparse on load, NaN geometry written back —
requires an Ellipse/Line creator, and Archie has none; its editor vocabulary is rect+polygon
(Q-1). An imported foreign ellipse degrades the studio canvas DISPLAY ONLY; the stored selector,
the published tree, and the viewer are all either verbatim or loud.
