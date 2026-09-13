# Annotation browser baseline

`apps/studio/e2e/user-stories-annotations.spec.ts` attempts STU-ANN-001 with the actual Box tool and pointer drag on `.canvas-plate`, then note text/reload assertions.

Result: initial remote-template attempt was discarded. The corrected local-fixture run reaches a valid Box state and performs an in-image drag. After drag diagnostics: URL `http://localhost:5198/studio/#/voynich-2/o/01M2CBN40R8K6HBR77J1DXMS65`, canvas count 1, note count 0, editor count 0, console errors 0, page errors 0. The note editor never appears. Evidence: `/tmp/archie-ann001-local.log`, `/tmp/archie-ann001-local-box-armed.png`, `/tmp/archie-ann001-local-after-draw.png`, and Playwright error context under `apps/studio/test-results/`. This is a reproducible local-canvas behavior failure after a valid gesture, pending baseline triage.
