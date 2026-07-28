---
updated: 2026-07-28
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
