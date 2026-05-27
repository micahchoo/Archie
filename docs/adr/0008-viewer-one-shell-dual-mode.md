# Viewer is one shell with two auto-detected data-source modes

Status: accepted (2026-05-27)

The Viewer is the single client-routed "one smart hall" shell (ADR-0002 / CONTEXT §216). Rather than build a separate app to read an exported `.archie.zip`, the **same shell auto-detects its data source at runtime**: a baked published tree present → **hosted mode** (the deployed published site, current behaviour, no file-opener chrome); absent → **portable mode** (an empty hall that opens a `.archie.zip` a recipient was handed — no Studio, no server). The driver is the *recipient-reads gap*: someone with no Studio is handed a library and reads it — which neither Publish nor the local-view bridge (§224) serves.

## Considered options

- **Separate portable-viewer build** — rejected: §216 already commits to one runtime-data shell, the data seam is a single file (`apps/viewer/src/published.ts`), and a second build would duplicate routing/chrome and fork the term "Viewer."
- **Explicit mode flag/route** — rejected: adds a config surface and a way to be in the "wrong" mode; data-presence is the honest signal.

## Consequences

- Widens the CONTEXT "Viewer" definition from "the published static site built by the publish step" to "the read-only shell, fed by EITHER a published tree (hosted) OR an opened `.archie.zip` (portable)."
- Portable mode adds the empty-hall open affordance (hosted mode, having a baked tree, never shows it). **"Open another library"** (the §223 swap-to-change, anchored in persistent chrome so a single-exhibit collapse can't trap the reader) was originally portable-only but is now shown whenever a library is loaded — hosted OR portable (**revised 2026-05-27, user override** of the portable-only rule; in hosted mode it drops to the empty hall, from which a `.archie.zip` can be opened).
