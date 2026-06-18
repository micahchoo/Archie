# Copy audit — bucket: packages

Scope: user-visible runtime copy only (visible text, labels, placeholders, titles, aria-labels,
alts, toasts, thrown Errors that REACH the UI, confirm/alert text, empty states, tooltips).
Out of scope: console.* dev logging, comments, JSDoc, type names, code identifiers.

These are mostly pure-logic packages (render-core, render-mount). Most thrown `Error`s here are
internal-invariant guards that are caught-and-replaced by curated app copy and never surface, OR
documented as "not a user-facing flow". Those are out of scope and not flagged. The one exception:
`mount.ts`'s open-failure rejection is rendered VERBATIM by `Canvas.svelte` (`e.message` → overlay),
so it is in scope.

## Files audited

- packages/render-svelte/src/Canvas.svelte
- packages/render-svelte/src/MarginColumn.svelte
- packages/render-svelte/src/controller.ts — no in-scope strings (pure adapter logic)
- packages/render-mount/src/mount.ts
- packages/render-mount/src/surface.ts — no in-scope strings (interface/type contract only)
- packages/render-mount/src/gesture-guard.ts — no in-scope strings (pure decision core)
- packages/render-core/src/publish/site.ts — no in-scope strings (data-tree assembly; `"Base"` label is IIIF JSON, see notes)
- packages/render-core/src/session/session.ts — thrown errors are documented non-user-facing invariant guards (out of scope)
- packages/render-core/src/fs/zip.ts — thrown errors caught + replaced by app curated copy (out of scope)
- packages/render-core/src/iiif/resolve.ts — pure classification; no hardcoded user-visible strings
- packages/render-core/src/spine/merge.ts — thrown errors are internal invariant guards (out of scope)

## Fixes

| File | Line | Current | Issue | Proposed | Severity | Category |
|------|------|---------|-------|----------|----------|----------|
| packages/render-mount/src/mount.ts | 86 | `OpenSeadragon failed to open image: ${e.message ?? "unknown"}` | Raw library/internal vocab ("OpenSeadragon") + raw underlying message rendered verbatim to the user via Canvas.svelte overlay (`e.message`). Leaks the rendering engine name and unfiltered technical detail. The `"unknown"` fallback is also bare. | `Couldn't load this object.` (and keep the engine detail to a separate console.* log, not the thrown message). If a cause is useful, append a user-framed reason, not the library name. | high | internal-vocab |
| packages/render-svelte/src/Canvas.svelte | 140 | `Loading the object…` | Uses glossary term "object" — correct per glossary, but inconsistent with the sibling fallback on line 114 which says "image". Same media item named two ways across two states of the same component. | Pick one term consistently. If "object" is the user-facing word, the fallback should also say object. (terminology — defer to the object/image decision.) | low | terminology |
| packages/render-svelte/src/Canvas.svelte | 114 | `Could not load the image` | Fallback error text says "image"; the loading state (line 140) and the engine error (proposed) say "object". The same failure should read consistently, and a Map/AV object isn't an "image". | `Couldn't load this object.` — matches the loading-state noun and covers map/AV objects, not just images. ("Couldn't" matches the app's existing contraction voice seen in apps/* alerts.) | medium | inconsistency |
| packages/render-svelte/src/MarginColumn.svelte | 81 | `{layout.above.length} more ↑` | Inline arrow glyph (↑) inside the label and a count + bare "more" — terse, and the arrow is the only directional cue (no text affordance for what clicking does). Borderline directional/decorative; meaning is "scroll up to N notes above the view". | `{n} above` or `{n} notes above` (drop the inline arrow into an aria-hidden icon, or keep the arrow but make the label a clear noun). Keep sentence case. | low | directional |
| packages/render-svelte/src/MarginColumn.svelte | 102 | `{layout.below.length} more ↓` | Same as line 81 (the down sibling). Count + "more" + bare glyph; "more" is a vague label for "N notes below the current view". | `{n} below` or `{n} notes below` — symmetric with the up-gutter fix. | low | directional |

## Notes / non-findings

- **site.ts line 246** `langMap("Base")` and the per-reading `langMap(r.name)` write the IIIF
  AnnotationPage `label`. "Base" is the internal base/base-only concept (unread/unlayered notes) and
  it IS written into the published manifest, where a pure-IIIF viewer could surface it as a toggle
  label. This is a borderline leak, but the Archie Viewer reads `readings.json` for its own labels
  (per the comment) and this label is consumed by external IIIF viewers, not Archie's own UI. Treated
  as out of scope for the Archie UI bucket; flag to whoever owns the published-manifest labels if
  "Base" is ever shown in Archie's own reader chrome. (terminology)
- **resolve.ts** the `attribution` JSDoc example `"© OpenStreetMap contributors"` is a comment
  describing a data field the surface displays; the string itself is author/data-supplied, not
  hardcoded UI copy here. No fix.
- **session.ts / merge.ts / zip.ts** thrown Error strings are either documented invariant violations
  ("not a user-facing flow", session.ts) or caught and replaced by curated app messages
  (App.svelte: "Couldn't read that file as an .archie.zip."). Verified the call sites — these raw
  messages do not reach the UI. Out of scope.
