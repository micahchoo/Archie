# STALENESS — Issue 24 (publish-generation staleness) + Issue 25b (marker = commit point)

**Branch:** `tend/read-staleness`. **Probes:** `apps/viewer/src/probe-staleness.test.ts`,
`packages/render-core/src/publish/probe-readpolicy.test.ts` (marker ordering) — run green.

## The failure class

A published tree is a set of independently-fetched files (`archie.json`, `exhibits.json`, `images.json`,
per-exhibit `manifest.json`). A republish rewrites them; a caching layer (browser HTTP cache, CDN, the
in-memory `hostedCache`) can serve **generation A of one file next to generation B of another** — a
mixed-generation render. Nothing today ties the reads to one generation.

## Chosen fix

**A generation id, stamped LAST, keyed into every hosted fetch.**
- **Write (site.ts):** `archie.json` carries a `generation` string and is moved to the **LAST** write in
  `publishLibrary` (after `images.json`). It becomes the tree's **commit point** (Issue 25b): a torn/partial
  tree — interrupted mid-publish — has no current marker to validate against, so a consumer rejects it
  instead of rendering an incomplete tree that a first-written marker would have blessed. `generation`
  defaults to a **deterministic djb2 hash** of the two library-level projections (`exhibits.json` +
  `images.json`) plus `publishedAt` — deterministic so an incremental publish and a full republish of
  identical content stamp the SAME id (the byte-stable-republish contract the oracle test pins), while
  folding in the `publishedAt` timestamp makes each real publish unique (busts caches on any republish,
  note-only included). Overridable via `opts.generation`; self-contained — no caller MUST supply anything,
  and the bake agent can consume/override the field it finds.
- **Read (published.ts):** the hosted path reads `archie.json` first (also the ADR-0020 gate, READPOLICY),
  captures its `generation`, and appends `?g=<generation>` to every subsequent hosted fetch
  (`exhibits.json`, `images.json`, `{slug}/manifest.json`, sidecars). Within a session all reads pin ONE
  generation → a consistent snapshot even if the origin republishes mid-session; a republish changes the
  generation on the next probe → caches bust. `hostedCache` is keyed by generation and **cleared when the
  generation changes**, so it can never serve gen A after B is live.

## Matrix

| case | actual (probe) | verdict | fix commit | retest |
|---|---|---|---|---|
| stale images.json → wall tile dead-ends (gallery-view.ts:29) | hosted fetches carry **no `?g=`**; images.json + exhibits.json + manifests fetched independently, no consistency | fix: generation-key all hosted fetches → one-generation snapshot; a within-generation tree can't skew | `st1`,`st2` | pass |
| stale exhibits.json → card for a 404 manifest | same — no generation consistency between the card index and the manifest | fix: same generation keying; ExhibitView already degrades a 404 manifest to the gallery fallback | `st1`,`st2` | pass |
| hostedCache serving gen A after B exists (published.ts:271) | **confirmed**: 2nd load served from cache, no generation check (manifest fetches after-1st/after-2nd = 1/1) | fix: key hostedCache by generation, clear on mismatch | `st2` | pass |
| live-source wall omission + live/hosted slug-collision dead-link (published.ts:253 vs 220) | loadImageIndex **never merges live images**; mergeGalleries **fronts live exhibits** — a colliding-slug wall tile routes to the LIVE exhibit with a HOSTED object id → dead-link | fix: **merge** — front live images (read images.json from the live projection), drop hosted wall entries for live-fronted slugs (mirrors mergeGalleries) | `st3` | pass |
| hostedRebase note-body `${BASE}` cite on a re-host (published.ts:34-53) | note transform is **identity** (line 52) — `${BASE}` image cites in note bodies are NOT rebased → 404 on a fork/localhost re-host | see row decision below | `st4` | pass |
| **25b** marker written FIRST (site.ts:254) | **confirmed**: `archie.json = {format,version,generator}` written first, no `generation` | fix: add `generation`, move to LAST write = commit point | `st1` | pass |

## hostedRebase note-body row — decision

The object-media portability break (object `source`/`thumbnail`/`tileSource`) is already rebased by the
`hostedRebase.object` transform; the residual is `${BASE}`-absolute image URLs embedded *inside note-body
text* (markdown/HTML), which the identity `note` transform leaves untouched. Fixing it well means parsing
note-body markup and rewriting only same-origin-canonical image URLs — a non-trivial, separately-testable
transform. **Decision recorded in-row (fix, minimal + safe):** `hostedRebase.note` rewrites `${BASE}`
occurrences in each textual body's `value` to the serving origin via the same `toServingOrigin` used for
object media — a plain string replacement over the already-canonical BASE prefix, no markup parsing (the
BASE prefix is an unambiguous absolute-URL token). Remote/data/blob URLs (not BASE-prefixed) pass through
untouched, exactly like the object path. Keeps the two rebases symmetric and closes the re-host 404.
