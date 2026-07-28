---
scope:
  - "README.md"
  - "PRFAQ.md"
  - "DIVERGENCES.md"
  - "docs/GOAL.md"
  - "docs/adr/**"
  - "docs/decisions/**"
  - "docs/guide/**"
updated: 2026-07-27
---
# product
> *what is Archie and why is it shaped this way?*

Archie is a static-publishable, multi-media exhibit annotation platform (image/map/audio/video)
built on open standards — notes are W3C Web Annotations, exhibits are IIIF Presentation 3
manifests — so the published site is a plain file tree with no server and no lock-in. `README.md`
is the spine (start there); `docs/GOAL.md` is the north-star the `/goal` autonomous loop re-reads
every cycle; `PRFAQ.md` + `DIVERGENCES.md` are the graft-discovery pipeline that turns observed
friction into specced features; `docs/adr/` (0001–0026) are ratified architecture decisions;
`docs/decisions/` holds citable Q-N records. The one gate that matters for any product-shape
change: `docs/GOAL.md` §3's dual gate — Family A regressions (typecheck/tests/build/bundle/a11y/
console/screenshots) must ALL stay green, and ≥1 Family B improvement scalar must move, or the
cycle reverts. Architecture changes additionally require a same-commit ADR or decision record
(§6) — no unattended architecture change ships with no provenance trail.

## Binding rules
- [[prior-art-citation-discipline]] — every divergence/PRFAQ claim cites prior art; a plausible
  citation that nobody re-opens is the recurring failure (7 bad ones caught in one session) —
  open the file and grep usage, don't cite from memory.

## Decisions
- Archie-ebe7 — AV posters: canvas frame-grab now, `mediabunny` deferred until rotation/audio
  bites / dc012e9
- Archie-5fb5 — untrusted-archive import validates marker + structure only, not content
  (`[[untrusted-archive-open-seam]]` is the enforcement seam) / 0efc2a1
- Archie-be3a — desktop CSP cleartext `http://**` grant removed, tightened to `https:`
  (`[[tauri-csp]]` covers the rest of that CSP) / baa86a7
- Archie-3754 — bulk catalogue-spreadsheet metadata import built: columns → Dublin Core, rows →
  objects by filename / c800a83
- Archie-19c5 / Archie-3504 — publish base URL derived from the destination BEFORE projection,
  relative-first (absolute only for `og:url`/JSON-LD/IIIF ids/canonical) / 89a1302
- Archie-babe, Archie-33bf — export ships the read-only embed, not a full Astro viewer; viewer
  links deliberately don't mirror Studio's hash routes — both closed same day, no work / f1378e1
- Q-12/Q-13 (`docs/decisions/archie.md`) — desktop GitHub token persists in the OS keyring
  (ratified in PRFAQ.md interview); deploy upload is single-pack `git2` push, per-blob REST
  demoted to the browser-PAT fallback only (probe-refuted at ~500 files, secondary rate limit)

## Evidence
- DIVERGENCES.md divergence 1 (publish-to-web) — top bet, shipped: `5dc6a93` merges the
  device-flow GitHub Pages deploy; DIVERGENCES.md's "spec'd" status line predates the merge
- DIVERGENCES.md divergence 5 (embed-autogrow) — built `e3766bc`; kill-criterion finding
  recorded: script-stripping hosts strip the parent listener too, fixed-height stays the answer
  for that class
- `docs/adr/0003-annotation-spine-append-only-version-dag.md` — append-only version-DAG spine, called "keystone" (Q-3); `docs/adr/0016-narrative-as-emergent-reading-mode.md` —
  narrative is emergent from content (sections present), never a picked template
- `docs/adr/0019-embeddable-read-only-archie-viewer.md`/`0021` — embed's public surface is 3 frozen attributes (`src`/`target`/
  `offline`); Archie-f90d gave it a capability contract enforced by `recipes/smoke.mjs`

## Open & hazards
- DIVERGENCES.md 2–4 (studio-preview, remix-from-viewer, headless-publish) are still **queued** —
  read the divergence's kill criterion before building; don't re-probe a killed assumption
- GOAL.md §6's locked frames (OSD+Annotorious, Studio/Viewer split, WADM, IIIF,
  static-publishable, no server) are non-negotiable — a cycle that relitigates one is out of
  scope, not a bug fix. (GOAL.md attributes the list to CONTEXT.md, but CONTEXT.md is a pure
  glossary and doesn't contain it — §6 itself is the real source.)
- GOAL.md §4a: after 3 consecutive dry `/goal` cycles the run stops and defers to seeds — a
  report of "no improvement found" is the loop working as designed, not a failure to diagnose
