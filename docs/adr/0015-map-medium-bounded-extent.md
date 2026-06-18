---
status: accepted
date: 2026-06-18
---

# A Map Object is a bounded geographic region, not the whole world

The geo-annotation extension (DESIGN.md) adds **Map** as a fourth Object medium (a slippy-map basemap on the OSD Canvas). The question was whether a Map presents the whole Web-Mercator world (the Phase-1 prototype) with the author framing only a *camera* over it, or whether the author frames a **hard extent** — `tileSource.bounds = [west, south, east, north]` — that *is* the map. The decision is the **hard extent**: a Map Object carries an authored bounded region; the OSD pixel raster is the sub-rectangle of the world covering those bounds; the reader cannot pan past it (the frame is absolute). The author sizes the frame to whatever context they want — a city block, a country, or the globe — by choosing the bounds.

The deciding factor is **portability, not aesthetics**. ADR-0010 wants a `.archie.zip` to read offline, and ADR-0004 forbids in-browser tile generation. A whole-world basemap is unbakeable (millions of tiles); a **bounded** region is bakeable — a few thousand pre-made tiles, or a single stitched static raster within the ADR-0004 ~8000px cap. So "the map is a bounded region" is the lever that lets a map honor the offline-portable invariant; a whole-world map with a camera leaves the basemap unbakeable and the offline path closed. It also matches curatorial intent (a map of Soho is *about* Soho — UX philosophy #1, respect intent declarations) and the IIIF Canvas model (a Canvas has finite `width`/`height`; bounds give the Map a finite pixel extent, like an image's dimensions).

**Considered and rejected:** *whole-world basemap + ADR-0005 camera only* — thinner coordinate math (the prototype's verified whole-world case) and lets the reader zoom out for global context, but cannot be baked for offline and dilutes curatorial framing. The ADR-0005 camera is still **reused inside** the extent for finer/narrative framing (a Section can frame a sub-region of the map), so that expressiveness is not lost — it just operates within the bounds rather than over an unbounded world.

**Consequences.** (1) The `tileSource` descriptor gains `bounds` (pulled forward from DESIGN.md Phase 2 into the core medium). (2) The custom OSD tile source must map its local tiles to the *world* tile indices offset to the region — the bounded-pyramid version of risk **R8** (the prototype only verified the whole-world mapping); this needs its own test corpus before a small model touches it. (3) `render-core/geometry/geo.ts` must project lng/lat into the bounded raster's pixel space, not the full-world square. (4) Offline-baked maps (D1 / Phase 3) become tractable; live external XYZ stays the Phase-1 default.
