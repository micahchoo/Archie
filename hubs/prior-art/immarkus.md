---
updated: 2026-07-28
---
# immarkus
> *Does immarkus have a real single-flight, debounced FSA (File System Access) writer?*

Verified 2026-07-28 against `IIIF/immarkus/` on disk (survey: `docs/research/prior-art/06-authoring-cms.md`).

## Verified claims (line-cited)
- `src/store/utils.ts:44-74` `writeJSONFile` — a module-level `pendingWrite`/`isWriting` pair
  implements single-flight coalescing: a write while one is in-flight just overwrites `pendingWrite`
  (last-write-wins) rather than queuing a second `createWritable()`; on completion, `finally` checks
  `pendingWrite` again and re-runs `performWrite` if a newer write arrived meanwhile. Confirms the
  survey's "single-flight debounced FSA writer" claim exactly — the mechanism is genuinely there, not
  a paraphrase.

## Stated absences
- None recorded.

## What citations of it may NOT support
- The write path swallows `createWritable()` rejection into a `console.error` only (`:57-59`) — it
  does not surface failure to any caller. Don't cite this as a donor for error-propagating writes;
  it's a donor for the coalescing shape only.
