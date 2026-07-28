---
updated: 2026-07-28
---
# liiive (`IIIF/liiive/liiive-client`)
> *Does liiive's Yjs bridge actually suppress echo when syncing local Annotorious edits to a CRDT?*

Verified 2026-07-28 against `IIIF/liiive/liiive-client/` on disk (survey:
`docs/research/prior-art/10-state-mutation-patterns.md`). ADR-0002 separately credits liiive as
"the lone React donor, contributes only a PURE CSS one-liner" — that claim is about a different file
and not re-checked here.

## Verified claims (line-cited)
- `.../room-ui/annotation-store-adapter/annotation-store-adapter.tsx:81-111` — a bidirectional bridge:
  `annotoriousStore.observe(onAnnotoriousChange, { origin: Origin.LOCAL })` (`:94`) tags every local
  edit's origin, and the reverse direction (`yjsStore.observeCanvas`, `:97-110`) re-applies remote
  changes to Annotorious tagged `Origin.REMOTE`. This is a genuine, real origin-echo-suppression
  pattern (each side can tell "did I cause this change" and skip re-emitting it) — confirms the
  survey's claim exactly.

## Stated absences
- None recorded.

## What citations of it may NOT support
- This file is React (`.tsx`) — a donor for the *pattern*, not for component code Archie's
  Svelte-everywhere stack (`docs/adr/0002`) could lift directly.
