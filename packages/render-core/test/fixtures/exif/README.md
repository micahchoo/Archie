# EXIF orientation fixture set

The 8-orientation test corpus stood up in **Phase 0** (per `IMPLEMENTATION-STRATEGY.md` §18).

**The consumer test is deliberately NOT wired in Phase 0.** EXIF-bake-at-ingest is an
*orphan gate* (CONTEXT.md / strategy §39) — it fires at its *condition* ("before the first
phone-photo public exhibit"), not at a phase. So Phase 0 owns the **spec** (`manifest.json`),
and the test that consumes the fixtures lands with the EXIF normalize code.

## What the spec captures (`manifest.json`)

- All **8** EXIF orientations, including **5 (transpose)** and **7 (transverse)** — the two
  "nobody tests" per CONTEXT.md. They swap axes and are the usual silent-bug source.
- Orientation **1** is a no-op (assert the original is untouched).
- The model (ADR-0003 / Q-5 source-before-projection): keep the **original** untouched
  (provenance: path + SHA + EXIF), generate a normalized **display-master** derivative
  (regeneratable, under a `.archie/cache/`-style path), annotations target the master →
  **zero orientation-awareness in the coordinate layer**.

## Fixture binaries owed

`exif-1.jpg … exif-8.jpg` are not committed yet — authoring real EXIF-tagged JPEGs needs
image-encode tooling not run in Phase 0. The manifest is the contract; the binaries + the
consumer assertion (`normalize(source) → expectedNormalizedWxH, top-left pixel preserved`)
arrive together when the normalize code is written.
