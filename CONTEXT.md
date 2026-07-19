# Archie — Ubiquitous Language

## Core nouns

- **Library** — everything a user has: all exhibits, bound to browser storage or a folder.
- **Exhibit** — a curated set of media objects with a reading order and an optional narrative. Identified by a stable **slug**.
- **Object** — one media item (image, map, AV) inside an exhibit. Identified by a stable object id. Objects are exhibit-nested (ADR-0001).

## Persistence

- **Safety state** — the single user-facing answer to "will my work survive?":
  Saved · Saving… · Action needed · Failed (precedence: Failed > Action needed >
  Saving > Saved). It reports the *whole* pipeline (edits into the working store
  AND the mirror to the bound disk location); "Saved" is claimed only when both
  are clean. Shown identically at every place; it is the only save UI.
- **Binding** — where the library lives on disk: `unbound` (browser storage
  only), `folder` (auto-mirrored as you work), or `file` (mirrored on explicit
  flush). Binding kind determines whether the mirror stage can auto-complete.
- The word **"Save"** names exactly one act: completing whatever pipeline stage
  cannot auto-complete (flushing a stale file binding, or first-binding an
  unbound library). Routine persistence is autosave and is never called "Save."
  An unbound library with real user work is *Action needed*, never an error.
  A flush request (⌘S) while everything is clean performs no write and briefly
  affirms *Saved* — the reflex is honored, never punished.

## Surfaces

- **Scrimmed surface** — a dialog or drawer that dims and locks the screen
  behind it. **The single-scrim invariant:** at most one may exist at a time;
  opening one from inside another *replaces* it (in-surface back affordance if
  the flow is nested). Drawers are scrimmed surfaces — the distinction from
  dialogs is presentational, never semantic.
- **Floater** — an unscrimmed element over a still-usable page (note popover,
  readings control, toasts, the safety indicator). Floaters never lock anything.
- **Dismissal contract** — Esc closes the topmost floater, else the one scrimmed
  surface; scrim-click = Esc; a scrimmed surface traps focus and returns it to
  its opener on close. There are no close-confirmation guards — autosave makes
  dismissal lossless. (Two-step confirms guard destructive *acts*, not closing.)
  Toasts expire on their own; banners are page content — neither is a dismissal
  target.

## Navigation

- **Place** — a user's addressable position in Studio: the library, an exhibit's
  overview, or one object's editor. A place is named by at most (exhibit slug,
  object id). The hierarchy is strict: every exhibit has a reachable Overview
  regardless of object count — no level is ever skipped. Places are *personal* — a place URL carries no library content and
  is only meaningful on the machine/profile that holds the library. Sharing is
  the published viewer's concern, never a Studio URL's.
- **Transient screen state** — what a user was *just doing* on a screen: search
  text, scroll, canvas pan/zoom, selection mode. Never part of a place;
  remembered best-effort within a session so returning to a place restores the
  screen, but reset by a fresh load.
- **View preference** — how a user *likes to look at things*: the overview's
  Canvas/List mode, the library's Exhibits/All-images lens. Persists across
  sessions (last choice = new default); still never part of a place. (Amends the
  original transient definition, which lumped view toggles in with transients.) Deeper UI state (selected
  note, open panel) is likewise not part of a place.
- A place that no longer resolves (removed object, removed exhibit, different
  library bound) degrades to its **nearest surviving ancestor** — object →
  overview → library — with a notice naming what wasn't found; never an error
  dead-end.
- **Modals and drawers are not places** — they never enter navigation history;
  back never dismisses them. (How they dismiss is the modality rules' domain.)

## Ingest

- **Collection unpacking** — a pasted IIIF Collection is *unpacked* into
  Exhibits (one per member Manifest, in collection order, nested collections
  flattened); a Collection is never a thing inside Archie. The Library remains
  the only grouping, and it stays flat. Sub-collection names survive only as
  searchable provenance on each unpacked exhibit, never as structure.
- **Import batch** — the set of exhibits one unpacking created, remembered just
  long enough to be undone as one act. Undo of a batch is removal, not rollback:
  a cancelled or partial import keeps what was committed.
