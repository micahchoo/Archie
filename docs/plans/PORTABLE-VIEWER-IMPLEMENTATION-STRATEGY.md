# Portable Viewer — Implementation Strategy (feature-level, meta)

How to build the **portable Viewer** (open a `.archie.zip` directly — ADR-0008) from the locked design. Method + sequence, not a task list; each phase gets its own detailed plan when it starts.

**Slots into the master plan.** This is a *feature* downstream of `docs/IMPLEMENTATION-STRATEGY.md` — it presupposes that plan's adopted-core milestone (the one-shell Viewer, `@render/core`, and `apps/viewer/src/published.ts` as the data seam) already exists. It does not re-derive them.

**Design corpus (sole inputs):** CONTEXT.md decision dated 2026-05-27 ("Portable Viewer") + widened **Viewer** term · ADR-0008 (dual-mode shell) · ADR-0009 (canonical `?src=` instance + untrusted-content boundary) · ADR-0010 (read seam = data-provider + blob URLs) · the spike `spikes/portable-viewer-seam/` (16 tests green, recommendation P).

---

## Ordering principles (derived from the design)

1. **Sources before projections.** The `ZipFilesystem` is the source; the read provider (`loadPortableExhibit`) is its projection; the entry-vector UI feeds the source; the chrome projects the result. Build inward-out: seam → vectors → chrome. A chrome built before the seam resolves is rework.
2. **Adopted before invented.** The **read seam is adopted** — the spike already built and node-tested it (`ZipFilesystem.fromZip` + core readers + blob layer all exist). The **entry UX is invented** — "does a recipient with no Studio grok the empty hall?" is not a unit test. Ship the proven data path before gating the invented chrome behind it; a slip on the chrome must not block the seam.
3. **Highest-assumption-load first.** Two pieces are hardest to retrofit: (a) the **canonical deploy target** — a durability commitment (minted `?src=` links break if it moves), so it must be pinned *before any link mints*; (b) the **blob-URL paint + RAM/revoke** behavior — the spike proved bytes+mime in node but flagged real-browser paint, OSD blob tile-sources, and the memory ceiling as owed. These lead their tiers.

---

## Phases (serial at the phase level; each names what it does NOT validate)

**PV-0 — Prerequisites (Prep; serial; blocks link-minting).**
- **Pin the canonical instance deploy target** (the §-committed URL `?src=` links resolve against — ADR-0009). VALIDATES: *where* shared links permanently resolve. Does NOT validate: that the shell works. **Gate: no `?src=` link may be minted/published before this URL is fixed** (durability commitment).
- Confirms the master-plan dependency is met (one-shell Viewer + `published.ts` exist).

**PV-1 — The read seam (Action; adopted; spike-proven).**
- Promote the spike's `loadPortableExhibit(fs, slug)` into the real package as the **portable branch of `published.ts`** (hosted→`fetch`; portable→provider). Includes the ~30 LOC readings re-read core's `readPublishedExhibit` omits, and the blob-URL layer (rewrite `object.source` AND `/assets/` tokens in note-body markdown) + `revoke()`.
- VALIDATES: a `ZipFilesystem` yields the same `PublishedExhibit` the hosted path fetches; embedded `/assets/` media resolves to usable blob URLs with zero component change. Does NOT validate: the entry UX, deep-links, the canonical deploy, **real-browser blob paint**.
- Boundary: the spike's 16 tests pass *in the real package* + the **browser-verify-owed checklist is run by a human** (blob `<img>/<video>/<audio>` paints; OSD `type:'image'` accepts a blob tile source; RAM peak + `revoke()` fires on nav/close before the next mint).

**PV-2 — Entry vectors + mode detection (Action; mostly adopted).**
- Auto-detect mode (hosted vs portable). File pick/drop → `ZipFilesystem.fromZip`. `?src=` route `#/open?src=<url>` → fetch + `ZipFilesystem` (+ content-size cap). Folder-open (FSA) → `FsaFilesystem` (overlaps §224).
- VALIDATES: all three vectors feed the PV-1 seam; the shell self-selects mode. Does NOT validate: empty-hall comprehension, error/orientation copy (PV-3).

**PV-3 — Portable chrome (Invented; human-gated UX → interface-design skill leads).**
- Empty hall (open affordance, curator voice — memory: name the action + what it produces, no dev jargon). "Open another library" (portable-only, persistent chrome, anti-collapse-trap). Version-stamp degrade message. Media degrade + open-time "some images need an internet connection". §96 cold-arrival orientation for a bare deep-link with no `?src=`.
- VALIDATES: a recipient with no Studio groks open→read. Does NOT validate: nothing downstream (last surface). INVENTED → comprehension prototype + human gate, not a unit test.

**PV-4 — Untrusted-content hardening + accepted known-limitations.**
- **CSP directive set** on the canonical deploy — and it MUST include `img-src 'self' blob:` + `media-src 'self' blob:` (ADR-0010 paints media via blob URLs; a bare `default-src 'self'` silently breaks every image/AV — the one CSP fact that bites). `script-src` without `'unsafe-inline'`. Plus DOMPurify (already in place, §151) + the `?src=` size cap from PV-2.
- VALIDATES: the canonical host renders strangers' zips without script-injection or cross-render breakage.

**Continuous / separate track (NOT a phase here):** the **export-side media-embedding** dependency (Studio publish must embed media for offline-complete zips, §89.1). v1 of the portable Viewer **ships with partial durability as an accepted, surfaced known-limitation** — remote-IIIF exhibits need the network — rather than blocking on the Studio change. File as a seeds issue; it fires at its own gate.

---

## Reducibility classification (drives model-tiering + gating)

| Work | Kind | Terminus |
|---|---|---|
| PV-1 read seam | **Adopted** (spike donor exists, tests written) | Small-model mechanical — promote + green the spike tests |
| PV-2 mode-detect, `?src=` route, FSA open | **Greenfield-specifiable** (write corpus first) | Small-model mechanical AFTER corpus |
| PV-4 CSP directives, size cap | **Greenfield-specifiable** | Mechanical after the directive set is written down |
| PV-3 empty hall, copy, cold-arrival, "open another" | **Invented** ("does a recipient grok it" ≠ unit test) | **Human gate** + interface-design |
| PV-0 canonical deploy target | one-time ops decision | **Human** |

## Deceptively-simple items (write the corpus BEFORE a small model touches them)

- **Mode-detect signal** — a 404 on `exhibits.json` is NOT the same as a network error or a malformed/empty body. Pick the exact signal; corpus must cover {present, 404, network-fail, malformed JSON}.
- **`?src=` + in-library deep-link composition** — `#/open?src=<url>` and `#/voynich/a/note3` must coexist; the parser round-trips both (and the `?src=` value may itself contain encoded chars). Corpus, not a happy path. (Today's `parseRoute` already tolerates a `?` tail — extend, don't fork.)
- **Blob `revoke()` lifecycle** across navigate + "Open another library" — the spike flagged this for browser-verify; capture it as a corpus item (every mint is freed; no use-after-revoke on fast nav).
- **CSP policy** — "strict CSP" is not a binary test; the acceptance is the explicit directive set (incl. the `blob:` allow-list above).

## Enumeration strategy (just-in-time, not waterfall)

- **Enumerable now:** PV-1 (the spike's tests ARE the enumeration). 
- **Enumerable after a corpus pass:** PV-2, PV-4.
- **Discovered after a design pass + human gate:** PV-3 (interface-design produces the surfaces; comprehension gate births follow-on tasks).
Each new task cites what birthed it; the live frontier is the next wave + the phase skeleton, never the whole graph.

## Mechanical execution system

Standard: **decomposer** (strong model, once per phase, writes each leaf's acceptance test first — and for PV-3 invokes `interface-design` so UI leaves cite the design system like an ADR) → **wave-builder** (groups ready leaves with disjoint write-targets) → **executor** (small model, one leaf, make its pre-written test green) → **verifier** (wave/phase close: tests meaningful + seams cohere + Pre-Ship Gate). Leaf-task schema per the master strategy (`implements / blocked-by / donor / write-targets / change / acceptance / on-block`). A leaf a small model can't execute mechanically is under-specified → back to the decomposer.

---

## First concrete move

**Promote `spikes/portable-viewer-seam/approach-p/portable.ts` + its 6 data-layer tests into the real package as the portable branch of `apps/viewer/src/published.ts`** — the keystone every entry vector depends on, already proven at the data layer. In parallel (PV-0, independent), **pin the canonical instance deploy URL**, since it gates any `?src=` link minting and carries the durability commitment. Everything else waits behind these two.

## Progress

- **PV-1 reader: DONE + verified 2026-05-27.** Landed at `packages/render-core/src/publish/portable.ts` (`loadPortableExhibit` + `loadPortableGallery`) with `portable.test.ts` (6 tests green) + barrel export. Full `@render/core` suite 395/395, `portable.ts` typechecks clean.
  - **Placement refinement vs the literal plan:** the reader lives in **`@render/core`** (beside its siblings `readPublishedExhibit`/`loadLibrary`), NOT inside `apps/viewer/src/published.ts`. Reasons: `apps/viewer` has no test runner; the logic is pure data-over-a-`Filesystem` (core's job); dependency direction is app→core. It returns `PortableExhibit extends PublishedExhibitData` + the readings fields core's `readPublishedExhibit` omits. **PV-2 is the wiring**: `published.ts` gains the hosted/portable branch that calls this, and its `PublishedExhibit` type aligns to `PortableExhibit`.
  - **Owed (PV-1 boundary):** the browser-verify checklist (blob `<img>/<video>/<audio>` paint; OSD `type:'image'` blob tile source; RAM peak + `revoke()` on nav/close) — human, per memory (no lightpanda here).
- **PV-2a data seam: DONE 2026-05-27.** `apps/viewer/src/published.ts` rewritten — unified `PublishedExhibit = PortableExhibit` (one source of truth, no drift); added `openPortableLibrary(fs)` / `closePortableLibrary()` / `isPortable()` + a hosted/portable branch in `loadGallery`/`loadPublishedExhibit` (portable → core's `loadPortableExhibit`, with prev-exhibit blob revoke before the next mint). Consumer signatures unchanged (ViewerShell/ExhibitView untouched). **Correct-by-construction but NOT runner-verified** — the viewer app has no test/typecheck tooling (`astro check` absent). Build/browser-verify owed.
- **PV-2b route grammar: DONE + verified 2026-05-27.** `render-core/src/url/route.ts` — `?src=` is now a query that COMPOSES with any route (gallery, exhibit, deep-link), percent-encoded round-trip; refines ADR-0009's `#/open?src=` shorthand (avoids slug collision, solves `?src=`+deep-link composition). `route.test.ts` +6 cases; full suite **401/401**, typecheck clean.
- **PV-2 remaining (browser-glue, NOT yet built):** mode auto-detect signal wiring in ViewerShell (the 404-vs-network-vs-malformed corpus → a core helper), file pick/drop + FSA folder entry, and the empty-hall chrome (PV-3). These are viewer-app `.svelte` — unverifiable here without viewer tooling (see the decision below).
- **PV-0 (canonical deploy URL): OPEN — needs a human/ops decision** before any `?src=` link mints.
- **Verification infra: ADDED + working 2026-05-27** (user chose "check + viewer vitest"). `apps/viewer` now has `tsconfig.json` (extends `astro/tsconfigs/strict` + the workspace's extra strict flags) + scripts `test` (vitest, hoisted), `check` (`astro check`), `typecheck` (`tsc`). Added devDeps `@astrojs/check` + `typescript`. **This retroactively verified PV-2a:** `apps/viewer/src/published.test.ts` (3 tests green — open/close/portable-read seam) + `astro check` **0 errors across all 12 viewer files** (first-ever viewer typecheck; the unified `PublishedExhibit` type + all consumers are clean). The viewer is now a fully verifiable package.
- **PV-2 mode-detect + entry helpers: DONE + verified 2026-05-27.** In `published.ts`: `modeFromProbe` (pure classifier — 404=portable, everything-else-non-ok=error, never silently portable) + `probeViewerMode` (fetch + classify); `openLibraryFromFile` (file/drop) + `openLibraryFromSrc` (the `?src=` vector, with a 256 MB cap per ADR-0009). `published.test.ts` now **13 tests** (PV-2a seam + the mode-detect corpus + entry vectors w/ mocked fetch); `astro check` 0 errors.
- **PV-2/PV-3 UI: BUILT + statically verified 2026-05-27** (via `interface-design` skill + `system.md`). `EmptyHall.svelte` (new) — the vacant gallery wall + dashed empty-frame invitation, file-pick + whole-window drag-drop, cold-arrival (§96) variant, curator voice. `ViewerShell.svelte` rewritten — boot state machine (`probing → ready | empty | error`): try `loadGallery`; on failure `probeViewerMode` distinguishes 404-empty-hall from error; `?src=` opens first; file-open → `loadAndShow`; portable-only **"Open another library"** chrome (§223 swap, anti-trap). `astro check` **0 errors**, vitest **13/13** unaffected. New surface documented in `system.md`.
  - **BROWSER-VERIFY OWED (the only thing left for this slice — needs the human / a Chromium run):** does the empty hall render + drag-drop actually open a file; mode auto-detect routes correctly on a real deploy; blob media paints (img/video/OSD); `?src=` fetch+CORS on the canonical host; RAM/revoke on "Open another". Static checks (types + logic units) all green; runtime is unproven (lightpanda wedges here — memory).
  - **FSA folder-open vector: NOT built** (browser-only glue, lower priority; `openLibraryFromFile`/`FromSrc` cover the primary recipient flows).
- **PV-0 (canonical deploy URL): OPEN — needs a human/ops decision** before any `?src=` link mints.
- **PV-0 (canonical deploy URL): OPEN — needs a human/ops decision** before any `?src=` link mints.
