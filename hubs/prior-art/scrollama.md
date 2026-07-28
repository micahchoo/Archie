---
updated: 2026-07-27
---
# scrollama
> *Can scrollama be cited as prior art for the scroll-sync reentrancy guard?*

Source: `.claude/rules/prior-art-citation-discipline.md`, `ledgers/HANDOFF-viewer-ux-2026-07-26.md`.

## Verified claims (line-cited)
- None beyond the API-choice support below — this is a thin, deliberately narrow entry.

## Stated absences
- **No reentrancy guard.** `grep scrollIntoView src/` is empty, and the library only ever *reads*
  `scrollTop` — verified independently on two separate passes (a coordinator's correction, then
  re-confirmed by a reviewer). It has no two-directions problem because it never writes scroll
  position at all.
- No corpus system — scrollama included — solves the programmatic-vs-reader scroll-fight problem;
  every one dodges it architecturally rather than resolving it (see [[quire]] for the sharpest
  counter-example: quire's `canvas-panel.js:259` *demonstrates* the hazard this guard exists to stop).

## What citations of it may NOT support
- Scrollama supports exactly one claim: **"use IntersectionObserver, don't hand-roll scroll math."**
  It is no donor for suppression, reentrancy, or the guard itself — Archie's guard is acknowledged
  original design with no corpus precedent claimed.
