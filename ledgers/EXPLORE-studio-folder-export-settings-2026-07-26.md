# Explore: folder-streaming, viewer-with-library export, open-in-viewer, settings panel

**Date** 2026-07-26 · **Worktree** `.claude/worktrees/studio-explore` off `d2e4f63`
(branch `explore/studio-folder-export-settings`) · **Method** read the shipped code, not the plans;
every claim below cites a file. Prior art consulted per `Annotators/Image/CLAUDE.md`:
`Prior Art/freecut` (clone @ `a3ecfce`), distilled in `docs/research/freecut-lessons.md` +
`freecut-unverified-claims.md`; the existing plan `docs/plans/native-canonical-store.md`.

Four questions, four independent verdicts. Nothing here was built — this is a read.

---

## 1. Does the freecut-style stream-to-and-from-a-folder work in Archie?

**FreeCut's model** (`Prior Art/freecut/README.md:143`, `PRODUCT.md:21`, `headless/README.md:22`):
the user picks a workspace folder through the File System Access API and that folder *is* the
project — `project.json` + `media/<id>/` are authored onto disk directly. OPFS holds only
regenerable caches (`waveform-opfs-storage.ts`), IndexedDB holds only FSA handles
(`handles-db.ts`), and a Node CLI reads the identical tree with no app involved. One durable
location, no copy step, no export.

Archie splits into two answers.

### Desktop: this is already built, and unverified

Archie-623e Phases 1–6 are in the tree at `d2e4f63`, not just planned:

| piece | file |
|---|---|
| the mount switch | `apps/studio/src/resident-store.ts:113` — `isTauri() ? desktopResidentFs() : opfsRootFs()` |
| folder root IS the project | `resident-store.ts:119` `residentProjectAtRoot()` |
| metadata + assets both route through it | `store.ts:28`, `asset-store.ts` → `residentProjectDir` |
| one-time OPFS→folder copy, marker LAST | `opfs-to-folder.ts:54` |
| atomic write, name containment | `packages/render-core/src/fs/tauri.ts` (`.claude/rules/tauri-fs-seam.md`) |
| AV streams from disk, not heap | Phase 4 `resolveUrl()` → `convertFileSrc` |
| derived caches hidden | `resident-store.ts:142` `.archie-cache/peaks/{slug}` |
| second-writer defence | single-instance plugin + `mirror-stamp.ts` token guard (`resident-store.ts:79`) |

So on desktop Archie is *more* folder-native than freecut: freecut keeps OPFS as a cache tier
because OPFS `SyncAccessHandle` is fast; on native disk that tier has no reason to exist, and
Archie dropped it.

The honest caveat is the whole a09d checklist in `docs/plans/native-canonical-store.md:316-326`:
**all seven "only the packaged app proves" rows are still `☐ pending build`.** Bounded-memory
multi-GB write, migration of a real OPFS library, `convertFileSrc` under WebKitGTK, single-instance
focus — none observed. The mechanism exists; the field evidence does not.

### Web: not the freecut model, and the gap is one function

Web is OPFS-canonical. A bound folder is a **write-only incremental mirror** — `binding-store`'s
`mirrorToFolder` rewrites dirty exhibits and stamps `.archie-mirror.json` (`mirror-stamp.ts:22`);
opening a folder is a **one-shot copy in** through `replaceProjectFrom` (`binding-store.svelte.ts:292`).
Both directions are copies. That is sync-to-a-folder, not stream-to-a-folder.

What makes this tractable: `residentRootFs()` is a two-line switch, and `FsaFilesystem` already
satisfies the seam. A web folder-canonical spike is *literally* returning
`new FsaFilesystem(boundHandle)` from that function with `residentProjectAtRoot()` true — the
store.ts/asset-store.ts rewrite that blocked Phase 2 in the old STOP report
(`native-canonical-store.md:403-420`) is **already paid for**; the seam extension landed.

The blockers that remain are web-specific and real:

1. **Write cost.** Every non-OPFS FSA save pays a full temp-copy — no in-place streaming to user
   folders (`freecut-unverified-claims.md` item 3). Archie autosaves on an 800 ms debounce
   (`exhibit-session.svelte.ts:74`); freecut saves on a **minutes** interval
   (`use-auto-save.ts:21-44`), which is precisely why it can afford this. Copying the freecut
   storage model without copying its save cadence is the trap.
2. **Permission lifecycle.** `reopenFolderBinding` (`folder-backend.ts:52`) needs a user gesture
   every session; a declined or lost handle means *no store at all*, where OPFS always exists.
   Desktop has no equivalent problem (`folder-backend.ts:54` — Tauri needs no gesture).
3. **Main-thread async writes.** `fs/fsa.ts` uses `createWritable`; freecut's fast path is
   `SyncAccessHandle` in a dedicated worker (`opfs-worker.ts`, lesson 10).

**Verdict.** It works, and mostly already does — on desktop. On web it is a real project whose
answer is a measurement, not an argument: point `scripts/perf/fsrun.mjs` at a real FSA folder and
compare autosave write cost against OPFS. Per `.claude/rules/perf-measure-the-flow.md`, that number
decides it; if a debounced save costs a full temp-copy of every rewritten JSON, web folder-canonical
needs a save-cadence change first, and that is a UX decision, not a storage one.

---

## 2. Can export ship the viewer app alongside the library?

Today publish emits **data + a zero-JS archival surface**: `static-pages.ts:1-8` builds a landing
page, per-exhibit pages with durable `note-<logicalId>` anchors, and `sitemap.txt` — explicitly
"NOT a second exhibit UI", linking out to a hosted viewer when `viewerBase` is known. Nothing
interactive travels with the library.

There are two candidate vehicles, and only one of them can work.

**`apps/viewer` (the Astro app) cannot be shipped with a library.** Its routes are baked at build
time: `src/pages/[slug].astro:13` imports `public/published/exhibits.json` and `getStaticPaths`
enumerates every card from it. Its ID base is likewise frozen at build
(`published-base.ts:16-21`). Copying `dist/` next to a different library gives you pages for the
wrong exhibits. Shipping it with a library means running a build per export.

**`packages/archie-viewer` (the embed) is exactly this vehicle.** `<archie-viewer>` is
runtime-generic — it loads any `.archie.zip` or published tree from `src`, renders gallery →
exhibit → reader, and has an `offline` attribute that blocks remote fetch
(`element.ts:15-30`). Weight: 32.9 KB gz on the gallery path, 261.8 KB gz total with the reader
chunk (`bundle-size.json`). So a self-contained export is `index.html` + the bundle + the library.

Two things to settle before building it:

- **`file://` breaks the current build.** `build.mjs:53` sets `splitting: true`, so the output is
  ESM with a lazy `import()` of the reader chunk. Browsers refuse ESM module scripts from
  `file://` (opaque origin), and a `fetch` of a sibling `.archie.zip` fails the same way. A
  double-clickable export therefore needs a **second build target**: IIFE, no splitting, one
  `<script>` inlined into the HTML, and the library inlined as base64 rather than fetched. That
  costs the code-split saving — irrelevant offline, since a reader-less export is pointless.
- **The eager-closure ratchet must not be weakened for it.**
  `.claude/rules/archie-viewer-eager-closure.md` exists because a static edge to `reader.ts`
  silently shipped 225 KB gz onto the gallery path. A single-file target is a *different entry*
  with its own budget, never a relaxation of `eagerGzKB` on the CDN entry.

**Verdict.** Buildable and worth it. The shape is a new `--single-file` target in
`packages/archie-viewer/build.mjs` plus an export flow in `Publish.svelte` that writes
`index.html` (bundle + library inlined) beside the existing tree. Estimated payload: the library's
own bytes plus ~700 KB raw of viewer. Prior art for the "one HTML file holds everything" move is
the portable seam Archie already has — `publish/portable.ts:1-13` resolves `{slug}/assets/{name}`
to blob URLs precisely because the portable viewer has no server.

---

## 3. An "Open in viewer" button

There is none today — no `preview` route, no viewer link anywhere in Studio (grep over
`apps/studio/src/*.svelte`). But the two mechanisms it needs both exist and are unused from Studio.

**Mechanism A — hand the bytes directly (works everywhere, no server, no URL).**
`element.ts:225` exposes `async openFile(file: Blob)`. Studio already produces the exact Blob:
`toZip`. So a preview panel is: mount `<archie-viewer offline>`, call `.openFile(zipBlob)`. This
gives the author the *literal* read path a published visitor gets — same `openArchieLibrary`
trust boundary (`.claude/rules/untrusted-archive-open-seam.md`), same reader, same note cards. No
CSP change, no publish step, works identically on web and desktop.

**Mechanism B — deep-link the hosted viewer (works once published).**
`url/route.ts:33` already parses `?src=<zip-url>` composed with any route, and the route grammar
carries `/o/<objectId>`, `/a/<noteId>`, `/s/<sectionId>` tails. `archie.config.json` holds the
canonical origin. So "open this exhibit where my readers will see it" is a URL mint:
`{canonicalOrigin}{viewerPath}#/<slug>?src=<published-zip-url>`. This is the right button *after*
a successful publish/deploy.

Two traps worth recording:

- A `blob:` URL as `src` is tempting (Studio and Viewer are same-origin behind the one front door)
  but **is refused on desktop**: `.claude/rules/tauri-csp.md` notes `connect-src` allows `https:`
  and not `blob:`, which is why IIIF `info.json` is fetched as parsed JSON rather than through the
  blob trick. Mechanism A sidesteps this entirely by never minting a URL.
- Whatever renders the preview must be the **read-only** mount. `HANDOFF.md:38-62` measures
  `createMount` at 268 KB gz against `createReadOnlyMount` at 70 KB, and the embed already uses the
  latter — embedding `<archie-viewer>` gets that for free, where a Studio-side "preview mode" on
  `Canvas.svelte` would not.

**Verdict.** Cheapest genuinely-useful version is Mechanism A, and it is small: one panel, one
`openFile` call. It also doubles as the acceptance test for §2 — if the embed can render the
current library from a Blob in Studio, the self-contained export is the same bytes with an
`index.html` around them.

---

## 4. What a Studio settings panel should hold

There is no settings surface. Preferences are ~20 loose `localStorage` keys read through
`persisted.ts`'s `safeGet`, and exactly one feature flag exists — `feature-flags.ts:12`
`archie.structureRevlog`, default-on, documented as an *emergency kill-switch* set from the
console. That is the honest starting point: a settings panel is mostly **surfacing state that is
already persisted and currently unreachable**, not inventing new state.

What exists and is already per-user (from a sweep of `archie.*` keys):

- **Identity** — `archie.displayName.v1` (attribution on every note).
- **Layout** — `editorDockWidth`, `editorInspectorWidth`, `editorRailCollapsed`,
  `readerAsideWidth/Collapsed`, `narrativeAsideWidth/Collapsed`, `notesAsideWidth/Collapsed`.
- **View defaults** — `overviewMode`, `overviewDensity`, `libraryGalleryView`, `mode.v1`.
- **Session/history** — `lastPlace.v1`, `recentProjects.v1`, `activeBinding.v1`,
  `canvasHintSeen.v1`, `importFreshness.v1.*`.

What the panel should *add*, ranked by whether a real user is currently stuck without it:

1. **Storage & location.** Where this library actually lives (OPFS / bound folder / native folder
   path), how big it is, and the two operations that matter — reveal the folder, and clear the
   retained OPFS copy after desktop migration. That last one is an explicitly deferred ticket:
   `native-canonical-store.md:304` records Micah's answer "keep until manual clear… a *reclaim
   space* affordance is a later ticket." The panel is that affordance.
2. **Autosave cadence.** The 800 ms debounce is hardcoded. It is also the single variable that
   decides whether web folder-canonical (§1) is viable, and freecut's equivalent is user-facing
   with an explicit `0 = off` (`use-auto-save.ts:21-44`). Expose it and §1 gets cheaper.
3. **Publish defaults.** Canonical origin / `viewerBase`, deploy-to-Pages on-off, GitHub sign-in
   state. These live in `archie.config.json` (build-time, fork-level) but the *user-facing* half —
   which viewer URL my cites point at — belongs in settings.
4. **Identity & attribution.** `displayName` currently has an ad-hoc prompt (`IdentityPrompt.svelte`)
   and no way to change it afterwards.
5. **Performance knobs, read-only by default.** Worker pool width (`bake-async.ts:20` `POOL_MAX = 6`,
   `dzi-slice-pool.ts:25` `POOL_MAX = 8`), DZI tile size/quality. These should be *visible*
   (with the fallback counter `bakeFallbackCount()`) before they are editable —
   `.claude/rules/perf-measure-the-flow.md` records that both worker paths degrade **silently**, so
   a diagnostics readout is worth more than a slider.
6. **Kill-switches, in one place.** `structureRevlog` today; any future flag by the same idiom. The
   rule this must preserve is in `feature-flags.ts:1-6`: **callers cache the flag once at boot**, so
   a settings toggle must say "applies on reload" and never flip mid-session.

What should **not** go in it: anything that is authored content (rights, metadata, readings — those
have keyed write-backs per `.claude/rules/metadata-rights-keyed-writebacks.md`), and per-library
state masquerading as preference. A useful split is *this browser/app* (identity, layout, cadence,
flags) vs *this library* (publish target, unlisted defaults) — the latter arguably belongs in
Library settings, not app settings.

**Verdict.** The panel is small and mostly assembly. The one genuinely new thing it should carry is
the storage/diagnostics readout — it is the only place that makes two silent failure modes
(worker-pool fallback, retained-OPFS bloat after migration) visible to the person who can act on them.

---

## What to do next, if anything

- **§3 first.** The preview panel is hours, not days, and it de-risks §2 by proving the embed
  renders the current library.
- **§2 next**, as a `--single-file` build target; it is §3's output written to disk.
- **§4 next**, as assembly over existing keys plus the storage readout.
- **§1 last, and only after a measurement** — desktop is done-but-unproven (needs the a09d packaged
  run, not more code), and web needs `fsrun.mjs` against a real FSA folder before anyone writes a line.
