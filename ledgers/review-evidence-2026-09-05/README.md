# Review evidence

Supports [the review](../REVIEW-2026-09-05.md) at commit `91935b2`.

- `archie-*-review.md`: delegated reviews, with known limitations separated from findings.
- `archie-*-probe.*`, `archie-undo-review.ts`, `archie-reader-entry.ts`: temporary fault/controller probes retained as evidence. These are not production tests.
- `archie-review-*-results.log`: observed probe results. `source-results.log` confirms the source-preservation candidate in the reader appendix using Chromium.
- Other `.log` files: workspace verification and browser observations.
- `.png` files: inspected screenshots of the running app.

Probes use absolute imports into the original checkout. Change those imports if reproducing in another checkout. Generated bundles are omitted. Run with the installed Node 24 toolchain. The core review lists the data/publish bundling commands; substitute this directory for `/tmp` to use the retained sources.

For the undo probe, bundle `archie-undo-review.ts` with esbuild's `--bundle --platform=node --format=esm` options, then run the resulting `.mjs` with Node.

For the reader probe, bundle `archie-reader-entry.ts` with `--bundle --platform=browser --format=esm --loader:.css=text` and `--alias:virtual:archie-tokens=/absolute/checkout/packages/render-core/src/tokens.css` into `archie-reader-bundle.mjs` beside a copy of `archie-reader-probe.mjs`, then run the latter with Node. It installs happy-dom before importing the bundle. The browser-platform build selects browser dependency branches. The alias supplies the canonical token CSS for the embed's virtual module. This does not turn the probe into a browser network test.

The initial delegated reader probe substituted an empty token stylesheet. The root reviewer rebuilt it with the canonical CSS alias above and reran it; the retained results were identical. Neither happy-dom run establishes visual layout correctness. The separate Chromium screenshots and axe results cover the app surfaces actually driven.

The Playwright scripts require the standard dev stack at localhost:5173 and installed Chromium. They use fresh browser contexts. The source/reload script intercepts a local fixture URL and changes its title; it does not create or modify a hosted publication.

The initial recursive unit log contains a core failure caused by sandbox denial of a git subprocess. The core rerun log records the successful unrestricted rerun. The TypeScript error remains unresolved. No production code was changed.
