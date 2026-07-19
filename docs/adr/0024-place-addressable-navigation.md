# ADR-0024 — Place-addressable navigation in Studio

**Status:** accepted (2026-07-18) · *(briefly misnumbered 0004 — cited as ADR-0004 in two seeds close reasons)* · **Decides:** seeds `Archie-02ae` (wayfinder map
`Archie-21b1`, audit findings W1+W2) · **Terms:** see CONTEXT.md → Navigation.
**Amends:** ADR-0016's *single-emergent auto-open* clause ("a 1-object exhibit
auto-opens its only object, back affordance suppressed") — superseded by
Decision 2 below, confirmed 2026-07-18 with the prior art on the table.
ADR-0016's layout-emergence machinery (`resolveLayout`, no picker, narrative as
derived reading-mode) is untouched; only the navigation side-effect changes.

## Context

Studio had no router — one `view` state variable in App.svelte. Refresh lost your
position, browser back exited the app, nothing was bookmarkable, and single-object
exhibits skipped the Overview screen entirely, so identical clicks landed on
different screens (UX audit W1, W2). Studio ships to a static host (GitHub Pages
under `/studio/`), a dev proxy, and a Tauri webview. The library is local
(OPFS/folder), so a Studio URL can never carry content to another person —
sharing belongs to the published viewer.

## Decision

1. **Places, not states, are addressable.** A URL names a *place*: Library Home,
   an exhibit's Overview (`slug`), or one object's editor (`slug` + object id).
   Selected notes, panels, viewports, toggles are never in the URL.
2. **Overview is mandatory.** The single-object skip is removed. An exhibit's URL
   always means its Overview; the editor is always one explicit step deeper.
   (Single-object exhibits still need Overview's narrative strip, details, and
   add-media surface — the skip stranded those.)
3. **Every place change pushes a history entry** — including switching objects via
   the editor filmstrip. Back means "where I just was"; the header's `← Overview`
   is the "up" control. No replace special-cases.
4. **Unresolvable places degrade to the nearest surviving ancestor** (object →
   overview → library) with a dismissible notice naming what wasn't found. Same
   philosophy as render-core's absent-vs-failed per-item tolerance; never a
   dead-end screen.
5. **Launch is platform-split.** Web: the URL is authoritative; a bare URL is
   Library Home. Desktop (Tauri, no address bar): launch restores the last place
   through the same resolution path (so a stale remembered place degrades per #4).
   Alt+←/→ and mouse back/forward work against webview history.
6. **Back restores place plus best-effort transient screen state** (search,
   toggles, scroll, canvas pan/zoom) from session memory only; a fresh load honors
   the URL exactly and resets transients. **Modals and drawers never enter
   history** — dismissal rules belong to the modality-rules ticket (`Archie-389f`).

## Consequences

- The routing *mechanism* (hash vs history API vs library) is deliberately not
  chosen here — resolved by seeds `Archie-7153` under the static-host constraint.
- Bookmark grammar (`slug`, object id) becomes a compatibility surface: renaming
  a slug breaks that exhibit's bookmarks. Acceptable — degradation lands on
  Library Home with a notice (#4).
- The published viewer's URL scheme should eventually mirror place grammar
  (map fog item); nothing here forecloses that.
- Removing the overview skip changes first-click behavior for single-object
  exhibits; screenshots/tutorial flows that assumed the skip need updating.
- **Amendment (2026-07-18, seeds `Archie-a9fc`):** view-*mode* toggles (overview
  Canvas/List, library Exhibits/All-images) are reclassified as persisted **view
  preferences**, not session transients. Point 6's transient set now means only
  what-you-were-just-doing state (search, scroll, pan/zoom, selection).
  CONTEXT.md → Navigation holds the split.
