# Geo-Annotation Extension — Implementation Strategy

**What this is:** the method and sequence for building the geo-annotation extension from the locked design corpus. NOT a task list (each phase gets its own decomposition when it starts). It IS the meta-level: ordering principles, phases with validate/does-not-validate contracts, reducibility classification, the mechanical execution system, deceptively-simple flags, and the first concrete move.

**Design corpus (the sole inputs):**
- `CONTEXT.md` → **Language** (Map medium, Map extent, Note) + **Geo-annotation extension UX** subsection (Q1–Q8 verdicts).
- `docs/adr/0015-map-medium-bounded-extent.md` (the extent + offline coupling).
- `docs/geo-annotation/DESIGN.md` (technical design — **pin-centric; superseded on the pin/point question by the grilling**; still authoritative on the OSD/WADM/publish seams, risks R1–R8, and borrow-vs-skip).
- The existing **prototype** (a partial spike on `feat/soft-static-reskin`): pin-based, pixel-truth, whole-world — to be reconciled, not extended as-is.

**Status:** PROPOSED. Authored 2026-06-18 after the UI/UX grilling. The prototype is a spike; this strategy reworks it to the locked design (Box/Outline + geo-truth + bounded extent) and completes the deferred plumbing.

---

## 0. The grilling's net effect on the prototype (read first)

The grilling **changed the shape** the prototype assumed. Before building, internalize the deltas:

| Prototype built | Grilling locked | Consequence |
|---|---|---|
| 📍 Pin tool (single-click → tiny rect), pin glyph (T8), `DrawTool 'pin'`, canvas-click gesture in `mount.ts` | **No pins.** Geo-Notes are **Box/Outline only** (Q4) | **DELETE** the entire pin surface; reuse the unchanged ADR-0011 Box/Outline draw |
| Pixel selector = truth; lng/lat derived (`geoLabelOf`) | **Geo (lng/lat) = truth**, pixel = derived (Q4) | **INVERT**: persist `archie:geo` through the spine; derive pixel via `lngLatToPixel` |
| Whole-world basemap (no bounds) | **Bounded extent** `tileSource.bounds` (Q2, ADR-0015) | **REPLACE** the whole-world tile builder with the bounded-pyramid (the hard R8) |
| `tileSource` threaded via live-source only | Viewer reads the **published** path | **ADD** manifest emit/readback so a *published* map carries `tileSource` |
| Map added by hand-seeded JSON | **Curated-provider + draw-box modal** (Q3) | **BUILD** the add-map modal (invented UX → gate) |

**Keep from the prototype (adopted, correct):** the `Map` medium concept, the `XyzTileSource` descriptor shape, `geo.ts`'s spherical-mercator formulas (as the *reference* for the bounded version), the `Canvas`/`Reader`/`NarrativeReader` `tileSource` prop threading, the attribution/locator chrome direction, the geo unit tests' *structure*.

---

## 1. Ordering principles (derived from the design, not invented)

1. **Source before projection.** The architectural through-line (`CONTEXT.md`: "define the authoritative source, project thin") plus Q4 (geo is truth, pixel is projection) ⇒ build and **persist the geo-truth coordinate space first**; the pixel-selector render, the readout, and publish are all projections of it. A render built before geo-truth exists is rework.
2. **Adopted before invented.** Philosophy #6 (`adopted ships clean; inventions get gates`). The **adopted** core — Box/Outline draw (ADR-0011), OSD mount, WADM log, the ADR-0006 popover — ships first and works on a hand-seeded map. The **invented** surfaces — the add-map modal (Q3), the bounded basemap bake — are gated behind it; a slip on an invention must not block the working core.
3. **Highest-assumption-load first.** Within the adopted tier, the **bounded-extent coordinate math (R8)** and **geo-truth persistence** are the keystone — they are the data model + coordinate space, hardest to retrofit. Everything (render, readout, publish, offline) projects off them.

If these three don't hold for a proposed task order, the order is wrong — re-derive from here.

---

## 2. Phases (serial at the phase level; validate / does-not-validate contracts)

### Phase 1 — Keystone: bounded geo coordinate space + geo-truth persistence *(the source)*
- **Builds:** `geo.ts` bounded projection (lng/lat ↔ pixel *within* `bounds`, not the whole-world square); `xyz.ts` bounded-pyramid OSD tile source (local tiles → world tile indices offset to the region); `tileSource.bounds` on the descriptor; `GeoAnchor = bbox | polygon`; `archie:geo` persisted through the spine (`NewNote → AnnotationRecord → appendNew/appendEdit carry-forward → serialize emit → deserialize`), mirroring the `ARCHIE_EMPHASIS` byte-stable extension pattern.
- **Validates:** a Box/Outline's **geography is the durable truth** — it round-trips through the append-only log, and a re-frame of the extent re-derives correct pixels (regions stay nailed to the Earth).
- **Does NOT validate:** any UI, the add-map modal, publish, the Viewer, offline.
- **Boundary:** ends when the headless corpus (R8 + geo-truth round-trip + re-frame) is green; no Svelte touched.

### Phase 2 — Adopted render + Studio authoring *(the projection + the reuse)*
- **Builds:** **delete** the pin surface (DrawTool `pin`, the canvas-click gesture, the 📍 button, pin feedback copy, seeded pins); wire **Box/Outline on a map** (draw → pixel region → `pixelToLngLat` → store `archie:geo` truth → render via derived pixel); the **coordinate readout** (display-only: bounds in the popover, center chip in the list — Q5); the **attribution chrome** (bottom-left, always-on — Q7); **locator on** (Q7); the **re-frame warning** (Q8).
- **Validates:** an author draws Box/Outline on a *hand-seeded* bounded map, sees coordinates + attribution, and re-framing warns about off-frame notes.
- **Does NOT validate:** the add-map modal (still hand-seeded), publish round-trip, the Viewer, offline.
- **Boundary:** ends when Studio authoring works end-to-end on a seeded map descriptor.

### Phase 3 — The add-map modal *(invented UX → human gate)*
- **Builds:** "Map" as a medium choice on the add menu → modal: curated **provider list** (attribution baked in; resolves D6 by construction) → **draw-box extent** on a world locator (the ADR-0011 gesture *is* setting `bounds`) → zoom inferred; an "advanced: custom tile URL" escape (tier c). Descriptor stays hidden (philosophy #5).
- **Validates:** an author adds + frames a map without touching JSON. **Comprehension question (gate):** does a non-technical author grok "pick a basemap, then draw your region"? Prototype-validation gate before lock (philosophy #6).
- **Does NOT validate:** publish, Viewer, offline.

### Phase 4 — Publish + Viewer *(the manifest plumbing)*
- **Builds:** `tileSource` **manifest emit/readback** (`toCanvas` emit-when-present → byte-stable; `objectsFromManifest` readback; round-trip test — DESIGN.md (e)); `archie:geo` rides the byte-stable annotation publish path; Viewer renders the published map + geo-regions; reader coordinates in the opened note (Q7).
- **Validates:** a *published, static* exhibit renders a bounded map with geo-regions, no server (live external tiles).
- **Does NOT validate:** offline `.archie.zip`.

### Phase 5 — Offline / baked basemap *(D1 / DESIGN.md Phase 3)*
- **Builds:** bake the **bounded** basemap — Option A (lightest): one stitched static raster on the `getAsset` `/assets/` rail (ADR-0004 ~8000px cap); Option B (defer): a `.pmtiles` file + the `pmtiles` npm reader fed into the OSD tile source (NOT MapLibre).
- **Validates:** a handed `.archie.zip` renders the map offline (ADR-0010 invariant restored).

### Continuous concerns (fire at their condition, not a phase)
- **Attribution-compliance gate** — the curated provider list may contain only static-embedding-permitted basemaps (D6); adding a provider triggers a terms check.
- **R8 corpus** — any change to the bounded-pyramid mapping re-runs the corpus.
- **Append-only invariant** — re-frame (Q8) and merge-on-geography never destroy a record.

---

## 3. Reducibility classification (drives model-tiering, parallelism, gating)

| Work | Kind | Donor / corpus | Terminus |
|---|---|---|---|
| Delete pin surface; wire Box/Outline on a map | **Adopted** | existing Box/Outline + draw gesture | small-model mechanical |
| Attribution chrome, locator, list chip | **Adopted** | prototype + existing marker chrome | small-model mechanical |
| `geo.ts` bounded projection | **Greenfield-specifiable** | R8 corpus (write first) | mechanical AFTER corpus |
| `xyz.ts` bounded-pyramid tile source | **Greenfield-specifiable** | R8 corpus (write first) | mechanical AFTER corpus |
| `archie:geo` spine serialization | **Greenfield-specifiable** | round-trip corpus (ARCHIE_EMPHASIS donor) | mechanical AFTER corpus |
| manifest emit/readback | **Greenfield-specifiable** | round-trip corpus | mechanical AFTER corpus |
| re-frame off-frame warning (Q8) | **Greenfield-specifiable** | mode corpus (append-only edge) | mechanical AFTER corpus |
| **add-map modal** (provider list + draw-box extent) | **Invented** | no donor — "does an author grok it" | **human gate** |
| coordinate-readout *placement* / warning *copy* | **Invented** | comprehension, not a unit test | **human gate** (+ `product-copy` for the strings) |

**Consequence:** Phase 1 + Phase 4 are corpus-first greenfield (strong-model decomposer writes the corpus; small-model executors make it green). Phase 2 is mostly adopted (mechanical). Phase 3 is invented (design-skilled lead + human gate). The UI phases (2, 3) cite `interface-design:interface-design` tokens; UI strings cite `product-copy`.

---

## 4. Deceptively-simple items (corpus BEFORE a small model touches)

Each sounds like a one-liner; each hides an invariant or mode interaction. Flagged so they earn a test corpus, not a happy-path guess:

1. **Bounded-pyramid R8** — OSD level/tile ↔ *world* slippy tile index, offset to `bounds`, with partial edge tiles. The genuine hard part (DESIGN.md R8). Corpus: a known lng/lat lands on the correct tile pixel at zoom N and is still there at N+2, *within bounds*.
2. **Geo-truth ↔ pixel across a re-frame** — re-deriving pixels when `bounds` change; pins must not drift. Corpus: region's lng/lat constant, pixels recompute correctly after a re-frame.
3. **`archie:geo` serialization** — byte-stable (emit only when present), pure-consumer-ignored (Q-3 three-tier), and **merge reconciles on geography** (the merge key changes from pixel to lng/lat). Corpus: round-trip + a merge case.
4. **manifest emit/readback** — arbitrary `archie:*` is NOT passed through `toCanvas`/`objectsFromManifest` today (DESIGN.md (e)); naive code drops it silently on reload/publish. Corpus: descriptor in → manifest → descriptor out, identical.
5. **Re-frame off-frame (Q8)** — a mode interaction with append-only: narrow past a region → persist + warn, never delete. Corpus: the warning fires, the record survives.

---

## 5. Mechanical execution system

- **Decomposer** (strong model, once per phase): turns a phase into a DAG of leaf tasks; **for greenfield phases, writes the test corpus first** (Section 4). All judgment here.
- **Wave-builder** (mechanical): groups ready tasks with disjoint `write-targets` into parallel waves.
- **Executor** (small model, per leaf): makes one pre-written test green; no design, no scope expansion.
- **Verifier** (mid-tier, per wave/phase): green tests are meaningful (not gamed); cross-worker seams cohere; Pre-Ship Gate at phase close.

**Leaf-task schema:**
```
TASK <id>
  implements:    <ADR-0015 | CONTEXT Q-N | DESIGN.md §>
  blocked-by:    [<task ids>]
  donor:         <file:line> | greenfield-per <corpus id>
  write-targets: [<exact paths>]
  change:        <one precise instruction; no open design choice>
  acceptance:    RUN <cmd> → MUST <binary pass>
  on-block:      STOP + escalate; do NOT improvise or relitigate
```
A task a small model can't execute mechanically is under-specified → back to the decomposer. **UI leaf tasks** cite the design system (`interface-design`) + `product-copy` for strings, the way others cite ADRs.

---

## 6. Skills / review / context mapping

- **Skills attach where judgment lives.** Phase 1 + 4 (greenfield): `test-driven-development` / `characterization-testing` (corpus-first). Phase 2 (adopted): `executing-plans`. Phase 3 (invented): `brainstorming` → `interface-design` → `product-copy`, then **gate-enforcer + human**. The pin-removal reconcile: `simplify` (delete-before-build).
- **Review at every level.** TASK: test green + stayed in lane. WAVE: parallel outputs cohere at the seams (esp. the geo.ts ↔ xyz.ts ↔ render seam). PHASE: Pre-Ship Gate + state externalized (HANDOFF).
- **Context-load.** Decomposer reads broad (CONTEXT geo-UX + ADR-0015 + DESIGN.md + the relevant code). Leaf executor reads narrow (one task + one donor + one test).

---

## 7. Enumeration strategy (just-in-time)

- **Enumerable now:** Phase 1 + Phase 4 leaf tasks (corpus-defined) and Phase 2 adopted tasks (donor-defined).
- **Discovered later:** Phase 3 leaves (downstream of the modal design pass + human gate); Phase 5 leaves (downstream of the bake-format choice, Option A vs B). Each new task cites what birthed it. Frontier = next wave + phase skeleton, never the whole graph up front.

---

## 8. First concrete move

**Write the R8 corpus for the bounded coordinate space, then make `geo.ts` + `xyz.ts` bounded.** This is the keystone (principle 3) — the coordinate space every projection (render, readout, publish, offline) depends on, and the one piece most expensive to retrofit. Concretely:

1. Author `geo.test.ts` + `xyz.test.ts` **bounded** cases (extend the prototype's whole-world tests): a region at a known lng/lat maps to the right pixel *within* `bounds` and is stable across zoom and across a re-frame.
2. Make `geo.ts` (`lngLatToPixel`/`pixelToLngLat` take `bounds`) and `xyz.ts` (bounded-pyramid `getTileUrl` offset) green.

Everything else — the pin-removal reconcile, geo-truth persistence, the modal, publish, offline — waits behind a correct, tested coordinate space. Do **not** start the add-map modal (the most visible piece) first: it's invented, gated, and projects off the keystone that doesn't exist yet.

**Status — 2026-06-18 (Phase 1: DONE — both parts).**
- *Part 1 — bounded coordinate space:* `tileSource.bounds`, `regionPixelRect`, `tileRangeForBounds`, `geoInBounds` (`render-core/geometry/geo.ts`); R8 corpus green (`geo.test.ts`, 21 tests). **R8 dissolved** — pixel space stays bounds-independent (world pixels), the extent is a rectangle (see ADR-0015 Update).
- *Part 2 — geo-truth persistence:* `GeoAnchor = bbox | polygon`; `archie:geo` (lng/lat = truth) threaded through `NewNote/NoteEdit → AnnotationRecord → log (new + edit carry-forward) → serialize (heads `withGeo` + history `withDagMeta`) → deserialize → session.workingAnnotations`, plus the `geoOf` consumer reader — mirroring `ARCHIE_EMPHASIS` exactly (byte-stable when absent, round-trips heads+history, pure consumers ignore it). Corpus: `geo-persist.test.ts` (6 tests). Verified: render-core 518 tests, all packages typecheck, viewer astro-check 0 errors, both apps build.
- *Pixel selector is still derived in Phase 1 — nothing populates `geo` yet.* That wiring (draw Box/Outline → compute geo → store as truth → derive pixel on render) is **Phase 2** (the Studio authoring reconcile), which also resolves the **A/B OSD bounding fork** — (A) whole-world tiles + viewport pan-constraint, world-pixel annotations (recommended, R8-free) vs (B) region-local raster + offset remap (re-introduces R8). Reversible under geo-truth.
