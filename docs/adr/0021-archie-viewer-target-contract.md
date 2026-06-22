# ADR-0021 — `<archie-viewer>` target contract: full cite-ladder address + degrade-upward

**Status:** accepted (2026-06-21, grill — user-gated)

## Context

`<archie-viewer>` (ADR-0019) loads a Library (a `.archie.zip` or a hosted tree) and may open to a
specific location. The cite-target ladder (CONTEXT §244) has five rungs — Exhibit / Object / Note /
sub-region (`xywh`) / Section. The embedder needs a way to say "open here," and the moment a curator
pastes the attribute into real pages it is frozen (annomea shipped an inconsistent element name +
attribute set — its `EMBED-AUDIT.md`). A deep-link verification (2026-06-21, `deeplink-verify`)
mapped what the current viewer already does vs what is new.

## Decision

`<archie-viewer>` accepts three attributes:

- **`src`** — a hosted `.archie.zip` URL *or* a published-tree base URL; absent → the local drop
  screen. (Cross-origin requires CORS + HTTPS; remote-zip reuses `openLibraryFromSrc`, remote-tree
  generalizes the hosted-mode fetch to an arbitrary base.)
- **`target`** — a **native-route address** carrying the **full cite ladder**: Exhibit `#/{slug}`,
  Object `#/{slug}/o/<id>`, Note `#/{slug}/a/<id>`, region `?xywh=`, **Section `#/{slug}/s/<id>`
  (NEW route grammar)**. It is the same string the viewer shows in its address bar, so a curator
  copies it verbatim. (IIIF Content State `iiif-content` MAY be accepted later for cross-viewer
  interop — the codec already exists in `@render/core` `deeplink.ts` — but the native route is the
  primary contract.)
- **`offline`** — block remote tile/media fetch (network-egress mitigation, ADR-0020 hardening).

A **target that cannot be resolved DEGRADES UPWARD**, never errors: missing note → its exhibit;
missing region → the whole object; out-of-range section → nearest valid section; missing exhibit →
the library Gallery (or the lone exhibit if the library has one). No blank/error screen.

## Consequences

- The attribute names + route grammar are a frozen public API once embedders use them (the
  hard-to-reverse part). `src` / `target` / `offline` are the whole surface; adding is allowed,
  renaming/removing is not.
- **Reused free** (deeplink-verify): a note deep-link auto-activates the note's Reading so its marker
  shows (`ExhibitView.arriveAtNote` → `resolveNoteArrival`); a deep-link into a narrative exhibit
  lands at the target, not a forced section-1 intro; "target set before the zip loads" works for the
  `src=` path; 4 of 5 route rungs already parse.
- **New work the contract implies** (full list in `docs/plans/EMBED-VIEWER-IMPLEMENTATION-STRATEGY.md`):
  the Section route grammar; widen the route→reader seam (it drops `xywh`/`t=`/section today);
  slug-level degrade-upward (a missing exhibit currently throws a full-screen error — only the note
  rung degrades today); region out-of-bounds clamp; AV `t=` seek-paused-at-offset (must NOT reuse the
  play-coupled `seekTo`, §142); and fix the §258 duplicate-logicalId seed bug (mis-routes note
  deep-links across exhibits).
- The `target`-before-`src` (drop-screen) case needs an explicit pending-target state for the
  attribute-driven element (today it works only incidentally via module-level route state).

## Alternatives rejected

- **Typed attributes** (`exhibit=` `object=` `note=` `section=`): more readable but a larger frozen
  surface for no new capability — the native route already addresses every rung.
- **IIIF Content State as the *primary* target:** deferred to an additive interop layer; the native
  route is free (already in the address bar) and covers the full ladder.
- **Error on not-found:** rejected — a hand-editable format guarantees target drift; degrade-upward is
  the only humane behavior.
