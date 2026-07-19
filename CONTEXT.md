# Archie — Ubiquitous Language

## Core nouns

- **Library** — everything a user has: all exhibits, bound to browser storage or a folder.
- **Exhibit** — a curated set of media objects with a reading order and an optional narrative. Identified by a stable **slug**.
- **Object** — one media item (image, map, AV) inside an exhibit. Identified by a stable object id. Objects are exhibit-nested (ADR-0001).

## Navigation

- **Place** — a user's addressable position in Studio: the library, an exhibit's
  overview, or one object's editor. A place is named by at most (exhibit slug,
  object id). The hierarchy is strict: every exhibit has a reachable Overview
  regardless of object count — no level is ever skipped. Places are *personal* — a place URL carries no library content and
  is only meaningful on the machine/profile that holds the library. Sharing is
  the published viewer's concern, never a Studio URL's.
- **Transient screen state** — how a screen currently looks beyond its place:
  search text, view toggles, scroll, canvas pan/zoom, selection mode. Never part
  of a place; remembered best-effort within a session so returning to a place
  restores the screen, but reset by a fresh load. Deeper UI state (selected
  note, open panel) is likewise not part of a place.
- A place that no longer resolves (removed object, removed exhibit, different
  library bound) degrades to its **nearest surviving ancestor** — object →
  overview → library — with a notice naming what wasn't found; never an error
  dead-end.
- **Modals and drawers are not places** — they never enter navigation history;
  back never dismisses them. (How they dismiss is the modality rules' domain.)
