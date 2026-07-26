# HANDOFF — Viewer UX, third wave (2026-07-26)

Worktree `.claude/worktrees/chrome-occlusion`. **Everything below is MERGED AND PUSHED to `main`**
(unlike the two prior handoffs, which described unmerged branches). CI green through `4e21416`;
`c903371` was still running at write time.

Supersedes nothing — `HANDOFF-viewer-ux-2026-07-25b.md` stays accurate for the second wave.

## What landed

| merge | what |
| --- | --- |
| `0cf41ba` | the second wave (halo, chrome occlusion, canvas keyboard, embed asset paths) |
| `c22f62e` | **annotations survive a change of base** — `screenshots` 3 → 87 notes |
| `4df71ee` | **Archie-b681** — the embed ships attribution, licence, metadata (V105) |
| `4e21416` | **Archie-67b6** — the note rung resolves (V100) |
| `c903371` | **Archie-99b1** — the address writes every rung (V101/V24/V84/V52) |

Tickets closed: `b681`, `67b6`, `99b1`.

## The big one: publishLibrary was dropping every annotation on a base change

`publishLibrary` grouped heads by EXACT canvas-IRI equality against the base it was publishing to.
A log authored against any other base matched nothing and **every note was dropped, silently, with a
completely healthy-looking publish**. Three real paths hit it: Studio authors targets against
`WORKING_IRI_BASE`, a deploy publishes to a real origin, and `gen-published.mts` loads a dropped zip
and re-publishes it elsewhere.

It shipped. `apps/viewer/libraries/archie-library.archie.zip` carries manifest/canvas ids at the
deploy origin, 182 history records at `https://archie.demo/`, and **zero** inline annotations across
all 21 canvases.

The tell was an asymmetry: `loadLibrary` already recovers ASSET sources across exactly this base
change (`recoverAssetSources`, deriving the base from the manifest's own id). Annotation targets had
no equivalent. `rebaseCanvasId` (beside `canvasIdFor`, the ONE minter) closes it — narrowly: it
re-mints only when the slug segment AND the object-id tail both match, because prior art is
unanimous that the canvas IRI **is** the identity (cozy-iiif's `importAnnotationsToManifest` keys
`bySource[canvas.id]`; clover's `Painting.tsx` compares `canvas.id === target.source.id`; immarkus
reads the baked id back through cozy-iiif). None of them rebases, and neither does this — a foreign
IIIF canvas is returned untouched.

`site-geo.test.ts`'s second case used to PIN the drop. It now asserts survival, which is strictly
stronger. Inverted deliberately, not loosened.

## The `screenshots` mystery, fully resolved

Two causes, and the earlier handoff's framing was wrong on both counts:

1. The base mismatch above (the real bug).
2. `screenshots` opens in **NARRATIVE** mode (21 sections). The "0 notes" reading had been taken
   from the wrong surface.

All 87 notes live on **READING** pages — the base page is legitimately empty for every canvas until
a reading is enabled. Nothing wrong there.

**The keystone claim HOLDS, and this is the useful part.** Measured offline against the built
viewer: `screenshots` serves all 21 object images from **localhost**, with **zero** blocked remote
requests and no 404s, and **OSD paints**. It is the one exhibit that can carry canvas assertions in
the hermetic offline suite. `note-address.spec.ts` already uses it; the halo / canvas-keyboard / AV
assertions that are still hand-driven online can move there next.

## Cite ladder: the note rung had never resolved, and it was three bugs

`route.ts` parses ONE path segment out of `#/<slug>/a/<id>`; a published id is the full IRI
`{base}{slug}/annotations/{ULID}/v{n}`; they were compared with `===`. `logicalIdOf` (in `brand.ts`,
which already owned the split) normalises both sides. The audit the ticket asked for found two more
shipping halves:

- `narrative-landing.ts` `ownerObjectOf` had the identical defect, so `arrivalSectionIndex` always
  fell back to section 0 — every deep-linked note in a narrative landed at the top of the spine
  instead of its own beat. A plausible-looking wrong answer, which is why nobody caught it.
- `ExhibitView` passed the raw URL segment into `Reader`'s `initialSelected`, which is matched
  against `annotation.id` — the same `===` gap one layer down. `resolveNoteArrival` now returns the
  note's PUBLISHED id (`NoteArrival.noteId`) and callers carry that.

**Why the unit suites were green:** both fixtures used the same synthetic string (`"n-base"`) for
the queried id AND the annotation id. With both sides identical, raw `===` passes — the suites were
structurally incapable of modelling the bug. Rewritten to real shapes.

## The address now writes every rung

ONE writer in `ExhibitView`, fed by an `onlocus` seam the three reader islands report through. The
islands stay ignorant of the address grammar; `ExhibitView` alone decides precedence and builds via
`routeToHash`. `replaceState`, never `pushState`. The AV rung reports the CUE'S START, not
`currentTime`.

One interaction to preserve: the writer **yields** to V4's honest-degrade path. While the arrival
chrome explains a missing target, `normalizeAddressToExhibit` owns the bar.

## Next

1. **`Archie-3ea1`** — the cite panel (link / citation / Content State at equal weight). Now
   unblocked and the audit's headline finding. Its link grain must READ `location.hash`, never
   re-derive it. Must be a DIALOG (`ReadingSheet` shape, `dialog-a11y.ts`) — a floating panel over
   the canvas is V48 again under a new name. Prior art to read first: `quire`
   `packages/11ty/_includes/components/citation/`; `encodeContentState`/`decodeContentState` already
   exist unused in `url/deeplink.ts`.
2. `Archie-dbbc`/`01a6` (one note surface), then `0d6c`/`c5cb` (narrative scroll coupling).
3. `Archie-f90d` before `c314` (embed contract, then parity).
4. `Archie-7b86`'s remainder: V50 (waveform-as-canvas — a NEW dependency, so it trips
   `.claude/rules/viewer-optimizedeps-bare-includes.md`) and V53's six.
5. Move the hand-driven canvas assertions onto `screenshots` now that it's proven offline-capable.

## Gates

```
pnpm --filter @archie/viewer run check:svelte     # 0/0
pnpm --filter @archie/studio run check            # 0/0
pnpm -r run typecheck                             # TS7; never bare `tsc`
cd apps/viewer && pnpm exec vitest run            # 157
cd apps/studio && pnpm exec vitest run            # 925
cd packages/render-core && pnpm exec vitest run   # 1178
cd packages/render-mount && pnpm exec vitest run  # 207
cd packages/archie-viewer && pnpm exec vitest run # 138
node recipes/smoke.mjs                            # 15/15
pnpm --filter @archie/viewer run e2e              # 53
cd packages/archie-viewer && node build.mjs --check   # eager 36KB gz
```

**Two traps that each cost a wrong measurement this session:**

- `recipes/try.html` loads the **root** `/dist/archie-viewer.js`, not `packages/archie-viewer/dist/`.
  Rebuilding the package alone leaves the smoke driving the OLD bundle — it reported a working fix as
  broken. Run `node scripts/sync-dist.mjs` after every embed build.
- Worktree branches are cut from a **stale** `main` snapshot, not current HEAD. `test/viewer-e2e` was
  18 files behind; the merge absorbed it cleanly, but branch from `main` BY NAME and verify before
  building on it.
