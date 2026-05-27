# Polish & Optimization backlog — perf · security · code-quality

_Compiled 2026-05-27 from three read-only scouts (performance · security · polish/a11y) + this session's
in-flight notes. A candidate list, NOT a commitment — each item is right-sized "polish," not a feature. Verify
a finding's `file:line` before acting (the codebase moves). Effort = S/M/L; priority = high/med/low._

**Honest framing:** Archie v1 + the memory arc are done; these are the seams worth tightening before (or
alongside) the B. reading-experience arc. Nothing here is a v1 ship-blocker.

**▶ PROGRESS (2026-05-27):** **✅ DONE** — S3 (media-src scheme allowlist) · S5 (link-slug validation) · S6 (IIIF
scheme guard) — all three corpus-backed (core 355 green); **P6** (double-decode eliminated — new
`bake.downscaleIfNeeded` decodes once). **PLAN written** for code-splitting → `docs/plans/STUDIO-CODE-SPLITTING.md`
(P1–P3, do NOT freehand — follow the phased plan; OSD lazy-load is the risky keystone, last). The App.svelte
monolith (Q10) needs its OWN plan (deferred). **NEXT phases:** a11y/copy/dedup quick wins (Q4–Q9, Q11, Q1–Q3) ·
execute the code-split plan · dep re-scan (S7). S3/S5/S6/P6 are build/test-verified; P6's canvas path is browser-verify-owed.

---

## ★ Highest-ROI shortlist (if you only do a few)

1. **Code-split the Studio main chunk** (perf P1–P3) — the 1.15 MB / 349 KB-gz bundle is the biggest single win.
2. **Kill the double image-decode at import** (perf P6) — halves peak + latency on the hot import path; small fix.
3. **Note-media `src=` scheme allowlist** (sec S3) — the one *medium* real-exposure security item.
4. **Keyboard path for drag-to-reorder** (a11y Q4) — a control that announces itself but keyboard users can't operate.
5. **Surface autosave-to-folder failures** (polish Q7) — silent write-failure can lose a curator's session.
6. **Consolidate the 4 duplicated app assets** (polish Q1–Q3) — markers/tokens/voynich/bidar drift risk.

---

## A. Performance

| # | Item | Location | Why | Effort | Pri |
|---|------|----------|-----|--------|-----|
| P1 | OSD + Annotorious eagerly in the main chunk (no `manualChunks`) | `render-mount/src/mount.ts:13-16`; `apps/studio/vite.config.ts` (no rollupOptions) | dominant contributor to the 1.15 MB chunk; dynamic-import in `createMount()` + a `manualChunks` split est. −30–50% initial parse | M | **high** |
| P2 | All view components static-imported (LibraryHome, ExhibitOverview, NarrativeEditor, MergeReview, Publish, ShortcutsHelp) | `apps/studio/src/App.svelte:8-18` | mutually-exclusive surfaces eagerly parsed; async components cut the main chunk | M | **high** |
| P3 | `AvEditor` shell static-imported (WaveSurfer inside is already lazy) | `apps/studio/src/App.svelte:13` | every user pays AvEditor parse cost even with no AV object; lazy behind `{#if isAvCurrent}` | S | med |
| P6 | Double image decode on import — `imageDims()` `<img>` probe then `createImageBitmap()` re-decodes | `apps/studio/src/App.svelte` (probe) + `apps/studio/src/bake.ts:38` | two full decodes of a large photo; `createImageBitmap` already yields w/h → drop the probe, halve peak | S | **high** |
| P5 | `heads.filter(...)` linear scan per canvas at publish — O(objects×heads) | `render-core/src/publish/site.ts:181` (the 31-hit anti-pattern hotspot) | 50 obj × 500 ann ≈ 25k comparisons; pre-group into `Map<canvasId, records[]>` → O(n+m) | S | med |
| P4 | `noteCountOf` re-filters `allNotes` per object row per render | `apps/studio/src/App.svelte:~660,~1164` | unmemoized; a `$derived` count-Map keyed by canvasId computes once per `allNotes` change | S | med |
| P8 | `surface.setAnnotations(a, true)` replaces the whole Annotorious store on every `annotations` change | `render-svelte/src/Canvas.svelte:85`; `render-mount/src/mount.ts:150-152` | every keystroke in a note body redraws all shapes; debounce/diff before replacing | M | med |
| P7 | `filter: drop-shadow()` per marker (just added for §123 overlay-contrast) | `apps/studio/src/markers.css`, `apps/viewer/src/markers.css` | per-element GPU filter at 100+ markers; try moving the filter to the parent layer — **profile before acting** | M | low |
| P9 | voynich/bidar fixtures bundled unconditionally | `apps/studio/src/App.svelte:34-35` | ~15 KB only used on first run; dynamic-import after `exhibits.length===0` | S | low |

_Already mitigated: WaveSurfer dynamic-imported in AvEditor; streaming-zip + `libraryToZipFs` (#3); import downscale (#4); folder asset-streaming (#5)._

---

## B. Security (defensive — published exhibits are public; bodies are author/collaborator-authored)

| # | Item | Location | Risk | Sev | Fix |
|---|------|----------|------|-----|-----|
| S3 | Note-media `src=` URLs extracted from markdown but **not scheme-validated** | `render-core/src/note/media.ts:31-55`; `NoteMedia.svelte:25,28`; `NoteLightbox.svelte:43,46` | a crafted `<img/video src>` (`data:`, tracking pixel, odd scheme) loads → unintended external request / visitor-IP leak; relevant if a desktop build ever lands | **med** | S — allowlist `blob:`/`data:image`/relative/`http(s)` only |
| S5 | `archie:` link `exhibitSlug` not validated before becoming an `<a href>` | `render-core/src/link/link.ts:88-111` → `site.ts:183` | attribute-injection IF DOMPurify were removed/misconfigured (currently DOMPurify blocks it) — defence-in-depth gap | low | S — `parseLinkRef` reject slug not `^[a-z0-9_-]+$/i` |
| S6 | IIIF `info.json` source URL not scheme-checked before passing to OSD | `render-core/src/iiif/resolve.ts:22-25` | author pastes a malicious `https://` (or `file:`/`javascript:`) info.json → OSD cross-origin fetch / minor client SSRF/tracking | low | S — require `^https?://` (or relative) |
| S2 | `snarkdown` passes raw HTML through to DOMPurify (no pre-escape) | `render-svelte/src/sanitize.ts:22` | XSS currently blocked ONLY by the DOMPurify backstop; no defence-in-depth before the renderer | low | S — pre-strip HTML or use an escaping md lib |
| S7 | Dependabot: **vite** `GHSA-4w7w-66w2-5vf9` (≤6.4.1) + **esbuild** `GHSA-67mh-4wv8-2f99` (≤0.24.2), both medium | lockfile / Dependabot | **dev-server/build-time only — NOT in the published static site.** Installed are vite 7/8 + esbuild 0.27.7 (above the ranges) → alerts look **stale pending a lockfile re-scan**. **fflate is 0.8.3 = already patched (NOT a vuln).** | low | S — `pnpm update` + re-push so Dependabot re-scans/closes; verify via GitHub Security tab |

_Well-handled (leave alone): GitHub PAT held only in transient `$state`, zeroed on success/error/close, never logged or persisted (`Publish.svelte`, `ghpages.ts:74`); all four `{@html}` paths route through `renderMarkdown`→DOMPurify (`Reader`/`NarrativeReader`/`NoteLightbox`); transcript cues render as text nodes; `localStorage` holds only identity name + recent-project metadata._

---

## C. Polish / code-quality / a11y

| # | Item | Location | Why | Effort | Pri |
|---|------|----------|-----|--------|-----|
| Q4 | Drag-to-reorder is mouse-only — grip announces itself but no keyboard path | `apps/studio/src/ExhibitOverview.svelte:195` | `aria-label="Reorder …"` with no `onkeydown`/Arrow handling — keyboard users can't reorder | M | **high** |
| Q7 | `autosaveToFolder` swallows write failures silently | `apps/studio/src/App.svelte:~1060` (`catch { /* keep dirty */ }`) | a curator who never clicks Save can lose work with no warning; add a status badge / toast | M | **high** |
| Q1–Q3 | Duplicated app assets across studio↔viewer: `markers.css` (known), `tokens.css`, `voynich.ts`, `bidar.ts` (byte-identical); `@keyframes pulse` twice in viewer (`ExhibitView.svelte:125`+`ViewerShell.svelte:89`) | both apps' `src/` | drift risk; move shared design assets/fixtures into a shared package (or `packages/render-core`) | S–M | med |
| Q8 | `window.alert` for 4 destructive-path errors (inconsistent with `bindingError` inline pattern) | `apps/studio/src/App.svelte:~379,382,1002,1003` | blocks the thread, unstyled, inconsistent | S | med |
| Q5 | `<video>` has no `<track kind="captions">` (lint suppressed, not fixed) | `apps/studio/src/AvEditor.svelte:~299`; `NoteLightbox.svelte:46` | user-supplied captioned video gets no caption path | S | med |
| Q6 | Object-plate `<img alt="">` where `obj.label` is in scope | `apps/viewer/src/components/ObjectGrid.svelte:46` | screen-reader users hear nothing on an image-primary button | S | med |
| Q9 | "waveform" jargon in user copy (curator-voice rule) | `apps/studio/src/AvEditor.svelte:~331` ("Drag across the waveform…") | "waveform" is audio-software jargon → "Drag across the audio…" | S | low |
| Q10 | `App.svelte` monolith — ~1578 lines, ~75 top-level fns (binding, notes, publish, import, keyboard, 3 view states) | `apps/studio/src/App.svelte` | extract `useBinding` (save/autosave/binding) + `useNoteEditor` (onCreate/applyForm/…) + finish LibraryHome split per `.interface-design/system.md` decomposition table | L | med |
| Q11 | Lone `[NOTE]` marker in shipped source (invariant says zero) | `packages/render-mount/src/fitbounds.ts:10` | doc inconsistency vs `docs/architecture/infrastructure.md:79` | S | low |

---

## Notes on scope / threat model

- Archie's published artifact is **static HTML/JSON** with no server runtime — so the build-time dep CVEs (S7)
  don't reach end-users; they matter only to the author's dev machine. The real public-facing exposure is the
  **author/collaborator-authored body content** (S2/S3/S5) — sanitization is the load-bearing defense, and it
  currently holds (DOMPurify), so these are defence-in-depth, not open holes.
- The perf wins concentrate in **bundle splitting** (P1–P3) and the **import/publish hot paths** (P5/P6); the
  render-perf items (P7/P8) want a profile before investment.
- Several items are **shared-asset duplication** (Q1–Q3) — the cleanest single structural cleanup, and it would
  also let §123 overlay-contrast live in one place instead of two.
