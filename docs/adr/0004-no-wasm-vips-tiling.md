---
status: accepted
date: 2026-05-24
---

# Deep-zoom tiling does not use wasm-vips

wasm-vips was specified in v4 §7.2 as the in-browser tiling solution. Investigation found: **no `dzsave` binding exists** (only `tiffsaveBuffer`, which produces a pyramidal TIFF that OpenSeadragon cannot read natively); the real binary is **~13–20 MB**, exceeding the 240 KB bundle budget by 50–80× (v4 cited ~4.6 MB, which was incorrect). The decision is: **v1** — single responsive JPEG via OSD `type:'image'` (smooth to ~6000–8000px, well within GitHub Pages' 100 MB/file limit), with an external IIIF `info.json` paste as the escape hatch for genuinely giant institutional images. **v1.1** — an OffscreenCanvas DZI/level-0 slicer as a Studio publish-time build step. **Not** libvips-WASM, at any version.

This ADR exists to stop the obvious suggestion from recurring: in v1.1, "just use libvips, it's the standard tiling tool" will sound right — it isn't, for the reasons above, and re-running the investigation would waste the work already done here. External IIIF for the high end is also the domain-standard pattern (Juncture, Mirador, Universal Viewer all consume institutional image servers rather than generating pyramids).
