# SCOPE — Linked objects (reference bytes in place, don't copy)

2026-07-19. Follow-up to the source-path trace: Archie today distinguishes owned
vs referenced bytes only by the `source` string convention (`/assets/` prefix =
OPFS/library-owned; any URL = live remote reference, never downloaded). Remote
URLs and IIIF service bases already work manifest-free. The missing capability
is **link a local file in place** — desktop-first — plus the UI that makes
linked-ness legible.

## Prior art (cited per decision)

| Decision | Prior art |
|---|---|
| Copy-vs-link at import, per file | Tropy ("Consolidate photo library" off = reference in place); Lightroom "Add" vs "Copy" import modes |
| Missing-file badge + Relink flow | Lightroom missing-photo `!` badge → "Locate…"; Tropy broken-photo placeholder |
| Materialize references at publish | In-repo: `AObject.bakeTiles` (`model/model.ts:93`) — remote→local DZI at publish, opt-in |
| Deferred whole-file read → blob URL | In-repo: masters-on-demand, `apps/studio/src/asset-urls.svelte.ts:132` |
| New Tauri read path through the seam | In-repo rule: `.claude/rules/tauri-fs-seam.md` |
| Ownership states as explicit algebra | In-repo: `fs/binding.ts` (`unbound`/`folder`/`file`) — library-level precedent for making ownership a typed state, not a string convention |

## What ships (v1)

Desktop (Tauri) only for link-in-place. Browser keeps: remote-URL objects
(already zero-copy) and copy-into-library. FSA persistent-handle links
(IndexedDB + re-permission) are **deferred** — real work, small payoff while
desktop exists.

### 1. Model (render-core)

Add an explicit field — stop inferring ownership from the `source` string:

```ts
/** Present iff this object's bytes live OUTSIDE the library, linked in place.
    v1: only kind "file" (absolute path on the authoring machine). */
link?: { kind: "file"; path: string };
```

- `source` stays the render-resolvable string. For linked files it holds a
  placeholder (`archie-link:` sentinel, never fetched — resolve.ts's disallowed-
  scheme branch already degrades unknown schemes safely); the *studio/viewer
  runtime* mints the real `blob:` URL from the linked path, exactly parallel to
  how `/assets/` objects work via masters-on-demand. `resolve.ts` needs **no
  new branch** (`blob:` → `{kind:"image"}` already).
- Carry sentinels (`model/carry.ts`): new field → every mapper's
  `satisfies Record<keyof …>` sentinel updates or the build breaks. That's the
  point of the rule; budget for touching serialize/deserialize, working
  mappers, `resolveConflict`, `append*`.
- No `width/height/thumbnail` change: probe dimensions at link time same as
  `addObjectFromFile`; thumbnail generation reads the file once (thumb is small,
  owned — Lightroom does the same: previews owned, masters referenced).

### 2. Read path (Tauri)

- `TauriFsBridge` gains `readExternalFile(absPath): Promise<Uint8Array>` (or
  reuse `readFile` if signature fits). Per `tauri-fs-seam.md`: update **both**
  implementers (`apps/studio/src/tauri-fs.ts` + node conformance bridge in
  `tauri.test.ts`) — `tsc --noEmit` is the gate.
- `asset-urls.svelte.ts` `canvasSource`/`ensureMaster`: third branch — object
  has `link` → read via bridge → blob URL, same single-slot cache. Read
  failure → **broken-link state**, never a throw to the canvas (per
  render-core corrupt≠empty policy).
- Tauri capability/scope: plugin-fs read scope must allow user-picked paths
  outside the library root (dialog-granted paths are auto-scoped by the dialog
  plugin; verify — if not, add `fs:allow-read` with `**` read-only, no write).
  CSP unchanged (`blob:` already allowed; no `asset:` protocol needed).

### 3. Ingest UI

- **Add-file flow (desktop):** the file-picker/drop flow gains a per-batch
  choice: **Copy into library** (default, unchanged) vs **Link in place** —
  one segmented control or checkbox on the existing add affordance, with the
  one-line consequence spelled out: *"File stays where it is. If it moves or
  renames, the object breaks until you relink."* No per-file interrogation on
  a multi-drop; the choice applies to the batch (Lightroom import-mode model).
- **Large-file flow:** today `LARGE_MEDIA_BYTES` (~100 MB,
  `ingest-flows.ts:35`) *suggests* linking but can't do it. That suggestion
  becomes a working **"Link instead"** action on the same notice.
- Browser (non-Tauri): the Link option is absent, not disabled-with-tooltip —
  don't advertise what the platform can't do.

### 4. Linked-ness must be legible (ongoing UI)

- **Badge:** linked objects get a small chain glyph on object cards/list rows
  (grid + strip + any picker). Tooltip = the absolute path. Follows the
  existing glyph-label conventions (a11y: real label, not title-only).
- **Inspector / object detail:** a Source row: path (middle-truncated),
  **Reveal in file manager** (Tauri opener plugin), and **Copy into library**
  (materialize: read → `saveAssetFile` → clear `link`, rewrite `source` to
  `/assets/…` — the exact inverse guarantee `bakeTiles` gives for remote).
  No "convert owned → linked" in v1 (destructive-ish, no demonstrated need).
- **Broken link state:** file unreadable → object renders a placeholder card
  (canvas + rows): filename, last-known path, actions **Relink…** (file
  picker; on pick, verify dimensions match or warn), **Copy into library**
  (disabled — no bytes), **Remove object**. Annotations are retained
  untouched while broken — the whole point of relink.

### 5. Publish / export

- **Publish to web:** linked bytes are on one machine; a published site can't
  reference them. Policy: publish **materializes** linked objects — copies
  bytes into the published tree (or bakes to DZI if `bakeTiles`), same as
  `/assets/` objects. The publish dialog **lists them first**: "N linked files
  will be copied into the published site" with the paths. Broken links block
  publish with a per-object list (refuse-whole vs skip-and-flag: refuse, with
  the list — publishing a hole silently violates the stale-or-refused
  ordering ethos of `render-core-data-integrity`).
- **`.archie.zip` export:** same materialization (an archive that needs your
  home directory isn't an archive). Export dialog shows the same notice.
- **Security note (untrusted archives):** an opened `.archie.zip` could carry
  `link.path: /home/…/.ssh/id_rsa`-style entries. v1 rule: `link` entries in a
  library the user did not author on this machine render as **broken** until
  explicitly relinked (cheap heuristic: path unreadable → broken anyway;
  path readable → the publish/export listing is the exfiltration gate, since
  display-to-local-user is what any file manager does). The listing in §5 is
  therefore load-bearing, not cosmetic — note this in the untrusted-archive
  rule when implementing.

## Phases (≤5 files each, verify between)

1. **Model:** `link` field + carry sentinels + serialize/deserialize + tests
   (render-core only; `pnpm typecheck` + vitest).
2. **Read path:** bridge method (both implementers) + `asset-urls` branch +
   broken-state signal + Tauri fs scope; targeted tests beside
   `tauri.test.ts` hardening block.
3. **Ingest:** copy-vs-link control + large-file "Link instead" +
   `addObjectFromLink` flow (probe dims, thumb, set `link`); studio vitest +
   `pnpm typecheck` + svelte-check.
4. **Legibility:** badge, inspector Source row + Reveal + Copy-into-library,
   broken-link card + Relink. svelte-check baseline stays 0/0.
5. **Publish/export:** materialization + dialog listing + broken-link block;
   update `untrusted-archive-open-seam` rule note.

## Companion scope — remote DZI from a static HTTP server

Clarified 2026-07-19: "server" means a dumb static file server, no IIIF Image
API service. That case is mostly served today (`addObject(url)` → OSD
simple-image, whole-file at view time; IIIF **Level-0 static** info.json+tiles
also works — OSD only GETs). The one gap: the `dzi` tileSource kind
(`iiif/resolve.ts:42`) renders fine but is only ever produced by the local bake
worker (`dzi-slicer.ts`) — there is no ingest path for an already-baked remote
`.dzi`, and `resolve.ts` would misclassify a pasted `.dzi` URL as an IIIF base.

Ship as an independent mini-feature (no dependency on phases above):
- Detect `.dzi` in the add-by-URL flow; fetch+parse the XML (capped fetch, à la
  `IIIF_MANIFEST_MAX_BYTES`; geometry math already in `geometry/dzi.ts`);
  build the existing dzi descriptor with a remote base URL.
- UI: none beyond a hint in the add-by-URL help text ("image URL, IIIF, or
  .dzi"). It's just another remote reference — no badge, no model change, no
  publish complication (remote sources already handled; `bakeTiles` applies).
- Round-trip note: bake+publish already emits a static DZI tree — bake in
  Archie, upload to any file server, re-add by `.dzi` URL.

## Out of scope (named, not silent)

- FSA persistent-handle links in the browser (deferred, see above).
- Folder-watch / auto-relink on move (Tropy has neither; Lightroom's is a
  different product tier).
- Linking remote files "as owned" (already covered by URL objects + bakeTiles).
- HTTP range/partial reads — orthogonal; the seam stays whole-buffer.

## Open questions (defaults proposed)

- Default for the add-flow control: **Copy** (safest; Tropy defaults to
  reference, Lightroom to Add — but Archie's publish story leans owned).
- Remember last copy-vs-link choice per library? Default **yes** (sticky,
  shown each time — a mode, not a hidden preference).
