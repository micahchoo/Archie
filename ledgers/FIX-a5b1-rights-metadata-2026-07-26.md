# FIX — Archie-a5b1: the rights and metadata surfaces on the read side (V103/V104)

Branch `fix/a5b1-rights-metadata`. Branched from `c10307c`; main moved during the work, so
`879e519` is merged in (clean, no conflicts) and every gate below was re-run after that merge.

---

## 1. The separation, with evidence

The ticket asks the right question and it has a two-part answer, because **"the read side" is not one
surface**. Archie publishes an exhibit to three read surfaces, and they were in three different states:

| surface | exhibit credit | exhibit licence | exhibit DC rows | object credit | object licence | object DC rows |
| --- | --- | --- | --- | --- | --- | --- |
| the SPA (`apps/viewer`) | yes | in the ⓘ | **yes** | yes | in the ⓘ | **yes** (Details tab) |
| the embed (`<archie-viewer>`) | yes | in the ⓘ | yes | yes | in the ⓘ | yes |
| **the archival page** (ADR-0014) | yes | **no** | **no** | **no** | **no** | **no** |

So: **V104 is a RENDER gap on the archival page, and its premise is wrong about the SPA. V103 is BOTH
— a seed gap at the exhibit and library levels, and a render gap on the archival page.**

### V104 — triage first, as the ticket asks

**The data is there.** `readExhibitTree` over the checked-in published tree, projecting through
`metadataRows` exactly as every consumer does:

```
$ ./apps/viewer/node_modules/.bin/vite-node /tmp/a5b1-probe.mjs -- apps/viewer/public/published

EXHIBIT voynich: metaEntries=3 metaROWS=3 ["Subject","Date","Language"]
   obj ex-voynich.o1: metaEntries=10 metaROWS=9 ["Creator","Date","Subject","Type","Language","Identifier","Archive","Shelfmark","Provenance"]
   … 11 folios identical, o12 (sound) 0
EXHIBIT voynich-rosettes: metaEntries=3 metaROWS=3   obj o9: metaROWS=9
EXHIBIT voynich-reading:  metaEntries=3 metaROWS=3   11 folios × 9
EXHIBIT screenshots / language-atlas / geo-map / sampler: metaROWS=0, every object 0
```

**The SPA renders it.** Driven against the BUILT viewer (`astro build` + `astro preview`, own port
4352, not a dev server):

```
PROBE voynich: dl.run .pair count=3
  dl=<div class="pair"><dt>Subject</dt><dd>Beinecke MS 408 — the Voynich manuscript</dd></div>…
PROBE reader tabs=["NOTES · 2","DETAILS · 9"]
PROBE details rows=["CREATOR","DATE","SUBJECT","TYPE","LANGUAGE","IDENTIFIER","ARCHIVE","SHELFMARK","PROVENANCE"]
```

So **"the Dublin Core metadata surfaces render nothing, anywhere in the corpus" is false as stated.**
Three exhibit rows and nine object rows render, in the shipping app, on the flagship seed.

**What IS true is a SEED gap plus a RENDER gap, and they are on different things:**

- *Seed half.* **4 of the 7 exhibits carry no metadata at any level** — `screenshots`,
  `language-atlas`, `geo-map`, `sampler`. Those surfaces correctly render nothing. That is a showroom
  problem, and this ticket does not fix it (see §6).
- *Render half.* The **archival page** — the zero-JS, durable, crawlable per-exhibit page from ADR-0014
  — has **no concept of descriptive metadata at all**:

  ```
  $ grep -n "metadata" packages/render-core/src/publish/static-pages.ts
  grep exit: 1
  ```

  Zero hits. That is V110's exact signature (`grep -n sections` over the same file returned nothing, and
  the fix for that was the same shape). This is almost certainly what the audit actually saw:
  **Archie-c405 was titled "The published tree's public face"**, and V104 sits in its defect list beside
  V107 (empty crawler body) and V110 (missing narrative). The audit was looking at this page.

### V103 — the licence ladder

**Seed half — measured, and unambiguous.** No exhibit and no library sets `rights` anywhere in the corpus:

```
$ ./apps/viewer/node_modules/.bin/vite-node /tmp/a5b1-unanimity.mjs

LIBRARY rights=undefined reqStmt=- metadata=0
voynich-rosettes   objects= 1  exhibit.rights=null  distinct object licences=1
voynich            objects=12  exhibit.rights=null  distinct object licences=2
voynich-reading    objects=12  exhibit.rights=null  distinct object licences=2
language-atlas     objects= 8  exhibit.rights=null  distinct object licences=1
geo-map            objects= 1  exhibit.rights=null  distinct object licences=1
sampler            objects= 3  exhibit.rights=null  distinct object licences=3
```

Three exhibits (`language-atlas`, `geo-map`, and the atlas/geo pattern generally) were **lifting only
the credit half of a rights object to the exhibit and dropping the licence half** — the seed literally
wrote `requiredStatement: atlasRights.requiredStatement` where it spread `...atlasRights` onto every
object. That is the inverted ladder, in one line, three times.

**Render half.** Even where `rights` IS set — on all 40 licensed items — the archival page emitted the
URI **only into schema.org JSON-LD** (`static-pages.ts:148` / `:255`, `...(rights ? { license } : {})`)
and never as text a human reads. Both halves fired at once, which is why the page measured zero:

```
$ grep -o -c "creativecommons\|rightsstatements\|opendatacommons" apps/viewer/public/published/*/index.html
voynich/index.html:0   language-atlas/index.html:0   geo-map/index.html:0   index.html:0
```

Not one licence URI, anywhere in the published tree's human-readable pages.

### A third defect, found while writing the tests

Only **25 of the seed's 40 licensed items resolved to a human label**; the other 15 rendered the raw
URI at the reader. Two unrelated causes:

```
OK   http://creativecommons.org/publicdomain/mark/1.0/   -> "Public Domain Mark 1.0"      25 uses
RAW  https://creativecommons.org/licenses/by-sa/4.0/     -> the bare URI                   9 uses  (atlas)
RAW  http://creativecommons.org/licenses/by-nc-sa/3.0/   -> the bare URI                   3 uses
RAW  https://opendatacommons.org/licenses/odbl/          -> the bare URI                   2 uses
RAW  https://creativecommons.org/licenses/by/3.0/        -> the bare URI                   1 use
```

The atlas row is a **seed bug** — one character. `LICENSES` (`iiif/rights.ts:26-37`) keys every entry on
`http:`, the atlas declared `https:`, so `licenseLabel` fell through to its raw-URI fallback for all
nine of that exhibit's licensed levels. Fixed. The remaining six are a **vocabulary gap**, not a bug —
CC 3.0 and ODbL are not in `LICENSES` at all — and are deliberately left alone (§6).

---

## 2. What changed, and why

**`packages/render-core/src/publish/static-pages.ts`** — one `rightsHtml(fields)` builder, used at all
three levels: the library page, the exhibit page, and **each object under its own heading**. It emits
the MUST-display credit, the licence as a visible `rel="license"` link, and the `metadataRows`
projection as a `<dl class="meta">`.

Three deliberate choices:

- **The same `metadataRows` projection the Viewer panel and the embed use.** Excluded properties, blank
  values, credit echoes and repeat-merging all resolve identically, so the three surfaces cannot
  disagree about what a level says. A test pins this (§4, injection I5).
- **No disclosure.** The SPA and the embed hide the licence and rows behind an ⓘ. This page ships zero
  JavaScript and is read by crawlers and from saved copies, so everything is in the document.
- **Per-object blocks under the object's own heading**, not hoisted into one block at the top. On a
  citation surface the reader must know *which item* a rights statement is about. An object with
  neither notes nor rights still emits nothing.

**`apps/viewer/fixtures/sample-data.ts` + `voynich.ts` + `atlas.ts`** — the exhibit level now states its
licence wherever the objects agree on one: `voynich-rosettes` (1 folio, Public Domain Mark),
`language-atlas` (8 pages, CC BY-SA 4.0), `geo-map` (ODbL). The atlas URI is corrected to the `http:`
form the vocabulary keys on.

**Three levels stay deliberately unlicensed, and the seed now says why in a comment.** `voynich` and
`voynich-reading` hold 11 public-domain folios *plus* a CC BY-NC-SA 3.0 recording; `sampler` holds three
objects under three licences by design; the library aggregates Beinecke, the Internet Archive and
OpenStreetMap. A blanket statement at those levels would be **false**, and a false licence is worse than
an absent one. Each is reachable per-object on the archival page now.

### Every fixture entry touched, by name — for the dock-slice integration

`apps/viewer/fixtures/*` overlaps the dock slice (`ux/dock-chrome-recovered`). Every edit here is
**additive to an existing entry**. No entry added, removed, reordered, renamed or re-indented; no object
array touched.

| file | entry | change |
| --- | --- | --- |
| `voynich.ts:39` | `BEINECKE_RIGHTS` | `const` → `export const`. Value unchanged. |
| `sample-data.ts:6` | the `./voynich.js` import | one name appended: `BEINECKE_RIGHTS` |
| `sample-data.ts` | exhibit `ex-voynich-rosettes` | **added** `rights: BEINECKE_RIGHTS` between `readings` and `requiredStatement` |
| `sample-data.ts` | exhibit `ex-atlas` | `requiredStatement: atlasRights.requiredStatement` → `...atlasRights` — net effect is **adding** `rights`; `requiredStatement` is the same object |
| `sample-data.ts` | exhibit `ex-geo` | `requiredStatement: geoRights.requiredStatement` → `...geoRights` — same shape, net **adds** `rights` |
| `atlas.ts:23` | `atlasRights.rights` | value `https:` → `http:` (same licence; see §1) |

Plus comment blocks in all three files. The shape the dock's positional specs address is unmoved:

```
exhibits: 6  order: voynich-rosettes, voynich, voynich-reading, language-atlas, geo-map, sampler
  voynich-rosettes  objects= 1  sections=0 readings=3 unlisted=false
  voynich           objects=12  sections=0 readings=3 unlisted=false
  voynich-reading   objects=12  sections=6 readings=3 unlisted=false
  language-atlas    objects= 8  sections=0 readings=2 unlisted=false
  geo-map           objects= 1  sections=0 readings=0 unlisted=false
  sampler           objects= 3  sections=0 readings=0 unlisted=true
```

`apps/viewer/public/published/**`, `dist/**` and `dist-single/**` are **generated**. At integration
regenerate them from the merged source (`vite-node apps/viewer/scripts/gen-published.mts`, then
`pnpm --filter @render/archie-viewer build && pnpm sync-dist`); never resolve them by picking a side.

---

## 3. The artifact measurement

Not the test result — the built pages, after `vite-node scripts/gen-published.mts`:

```
page                        <dl class=meta>  <dt> rows  rel=license
geo-map/index.html                  0           0           2
index.html                          0           0           0
language-atlas/index.html           0           0           9
sampler/index.html                  0           0           3
screenshots/index.html              0           0           0
voynich-reading/index.html         12         102          12
voynich-rosettes/index.html         2          12           2
voynich/index.html                 12         102          12
TOTAL                              26         216          40      (all three were 0 before)
```

The strings V104 said were absent everywhere, counted in `voynich/index.html`:

```
"Beinecke MS 408 — the Voynich manuscript"  = 1     "Shelfmark"   = 11
"ca. 1404–1438"                             = 12    "Provenance"  = 11
"Undeciphered script"                       = 12
```

And the licence, now visible rather than JSON-LD-only:

```
<p class="credit">License: <a rel="license" href="http://creativecommons.org/publicdomain/mark/1.0/">Public Domain Mark 1.0</a></p>
<dl class="meta"><dt>Subject</dt><dd>Beinecke MS 408 — the Voynich manuscript</dd><dt>Date</dt><dd>ca. 1404–1438</dd>…
```

The seed fix, visible in the artifact — atlas resolves, geo-map takes the documented fallback:

```
language-atlas: <a rel="license" href="http://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>
geo-map:        <a rel="license" href="https://opendatacommons.org/licenses/odbl/">https://opendatacommons.org/licenses/odbl/</a>
```

`index.html` (library) and `screenshots` stay at 0/0/0. That is correct, not a gap: neither carries any
rights, and the honest output for no data is no block.

**The published tree was NOT stale before this.** A full `pnpm build` regenerated it and produced zero
git diff, so the checked-in artifact matched its generator; it is stale only *because* the generator
changed here, and it is regenerated in `cc45f46`.

---

## 4. Red-green, per assertion, with denominators

Eight new assertions in `packages/render-core/src/publish/static-pages.test.ts`. Their own fixture —
the file's shared `fixture()` feeds a byte-identical-idempotency assertion and
`.claude/rules/test-fixtures.md` forbids reshaping a shared fixture for one test.

Seven injections, each reproducing one way the fix could be undone. Every injection asserted its anchor
was **unique** before replacing (`post-review-fixes-are-unreviewed` habit 1 — existence is not
uniqueness). The file was copied to `/tmp` first and restored from there; no `git checkout --`.

| injection | result | assertions that went RED |
| --- | --- | --- |
| I1 rows never emitted (the pre-fix state) | 5 failed / 23 passed | DC rows · object rows · projection · escaping · library page |
| I2 licence back to JSON-LD only | 3 failed / 25 passed | visible licence · unknown-licence fallback · library page |
| I3 object-level block dropped | 2 failed / 26 passed | object rows · visible licence |
| I4 library level loses its block | 1 failed / 27 passed | library page |
| I5 rows bypass `metadataRows` | 1 failed / 27 passed | projection |
| I6 values interpolated unescaped | 1 failed / 27 passed | escaping |
| I7 empty-object guard dropped | 1 failed / 27 passed | stays silent for a bare object |

**All 8 assertions go red under at least one injection.** I7 exists because after the first six, the
one *negative* assertion had never been exercised — a test that cannot be made to fail is not a gate.
Restoration verified by `git status` returning clean after each harness run.

**Repeat runs:** `20/20` runs of the static-pages suite matched `Tests  28 passed (28)` exactly. No
flake.

### Full gate set

| gate | result |
| --- | --- |
| render-core vitest | **1202 / 1202** (96 files; was 1194 before the 8 new) |
| render-core typecheck (TS 7 native) | clean |
| apps/viewer vitest | **184 / 184** |
| apps/viewer typecheck | clean |
| apps/viewer `check:svelte` | **1522 files, 0 errors, 0 warnings** (1523 pre-merge; main deleted spent prototypes) |
| apps/viewer e2e (chromium, `VIEWER_E2E_PORT=4352`, port verified free first) | **138 / 138** |
| apps/studio vitest | **945 / 945** |
| packages/archie-viewer vitest + typecheck | **185 / 185**, clean |
| packages/render-mount vitest | **207 / 207** |
| packages/render-svelte vitest | **7 / 7** |
| `recipes/smoke.mjs` | **42/42 hard assertions, 41/41 contracted labels, RESULT: PASS** |
| `pnpm sync-dist:check` | root `dist/` matches |

### The `dist/` rebuild — what reached the embed, measured from the metafile

A render-core edit moved the embed bundle, and `dist/` is a byte-enforced committed artifact. The
alternative explanation — a rights/metadata projection landing on the embed's **eager** path — would be
a page-load regression for every embed host, so it was measured rather than absorbed.

**The ratchet, run explicitly:**

```
$ cd packages/archie-viewer && node build.mjs --check
ok   eager (page load)     38.9KB → 38.9KB gz (Δ +0KB, allowed +10.0KB)
ok   total (object open)  274.9KB → 274.9KB gz (Δ +0KB, allowed +27.5KB)
ok   single-file (offline) 274.5KB → 274.5KB gz (Δ +0KB, allowed +27.5KB)
EXIT: 0
```

**Baseline reconciliation** (the number I was asked to check against was 39.3 KB): `git show
main:packages/archie-viewer/bundle-size.json` reads **`"eagerGzKB": 38.9`**, and `git diff main --
packages/archie-viewer/bundle-size.json` is **empty** — my tree's baseline is byte-identical to main's
and was never rewritten (the build printed `baseline unchanged`, as `--update` gating requires). 39.3 KB
is the dock branch's own measurement, not main's.

**Which module the embed reaches — the module set is IDENTICAL, before and after.** From esbuild's
metafile inputs, built twice from the same entry with only `static-pages.ts` swapped:

```
PRE : 121 total inputs, 82 from render-core
POST: 121 total inputs, 82 from render-core
modules ADDED to the embed graph:   (none)
modules REMOVED from the embed graph: (none)
static-pages.ts present in embed graph: true      ← and it was ALREADY true before
  src/model/metadata-display.ts: PRE=true POST=true
  src/iiif/rights.ts:            PRE=true POST=true
```

Worth stating precisely, because the loose version of this claim is wrong: **`static-pages.ts` is in the
embed's module graph and always was** — it is reached through the shared `@render/core` barrel, the exact
mechanism `[[archie-viewer-eager-closure]]` documents. What is tree-shaken is its *exports*, not the
module edge. `metadata-display.ts` and `iiif/rights.ts` were likewise already there, because
`element.ts:35` imports `licenseLabel` and `metadataRows` for the embed's own credit chrome.

So my change **added no module to the embed**. It added an import edge between three modules already in
the graph, and that reordered esbuild's symbol allocation. Confirmed independently:

- rebuilt from the **pre-change** source, `dist/` comes back byte-identical to HEAD — so the move is
  mine, not pre-existing staleness;
- the entry is **29910 bytes before and after**, and with chunk hashes normalised the only difference is
  the export letters (`B as x, C as z, D as w` → `B as z, C as x, D as q`);
- `dist-single/` — the whole payload, no chunks — contains **none** of `exhibitPageHtml`,
  `libraryPageHtml`, `dl class="meta"`. Nothing new ships.

---

## 5. Prior art

**The strongest donor is in this repo.** `packages/archie-viewer/src/element.ts:958-976` — `creditHtml`,
the embed's fix for V105 (Archie-b681). Its own header says it: *"`<archie-viewer>` showed NO
attribution, licence or metadata at any level … an embed that strips a required statement is legal
exposure, not a missing feature."* It renders credit + `licenseLabel` + `metadataRows` and is called at
**all three levels** — `:820` library, `:871` exhibit, `:900` object. The archival page had the identical
defect and was the last surface still carrying it; this fix is that fix, re-targeted.

**quire** (the donor Archie-c405 itself names for static scholarly publishing):

- `packages/11ty/_plugins/shortcodes/tombstone.js:72-83` — per-object descriptive metadata as a
  `<section class="quire-entry__tombstone">` containing `<table>`, with `tableRow` at `:45-54` emitting
  `<tr><th>${titleCase(property)}</th><td>${markdownify(…)}</td></tr>`. `:84` maps it over every object;
  `:43` `const properties = objects.object_display_order` is a **collection-level field-order list**.
  Placed at `_layouts/entry.liquid:60`, immediately after the entry `<header>`. This is the closest
  structural analogue to what was built: a per-object key/value block under the object's own heading,
  driven by one shared projection.
  *What it does not support:* the markup. quire uses `<table>`; this fix uses `<dl>/<dt>/<dd>` to match
  Archie's own `MetadataRun.svelte:19-25`. Consistency inside Archie decided that, not quire.
- `packages/11ty/_includes/components/copyright/licensing.js:24-27` — the licence as **visible prose**
  with a `rel="license"` anchor: `This work is licensed under a <a rel="license" href=…>NAME</a>.` The
  `rel="license"` relation is taken from here.
  *Caveat, so this is not over-claimed:* within this package `{% copyright %}` has one call site,
  `_layouts/pdf-cover-page.liquid:53`. The component has an `is-screen-only` branch
  (`copyright/index.js:48-50`) so it is built for HTML too, but the screen call site lives in quire's
  starter content, which is not in this corpus. The markup and the intent are cited; a shipped HTML page
  carrying it is not.
- `packages/11ty/_includes/components/head-tags/dublin-core.js:19-42` — dcterms as
  `<meta name="dcterms.*">`, at **publication level only**. Not adopted here (§6).
- The three channels coexist: visible prose, JSON-LD (`head-tags/jsonld.js:122` `license:`), and dcterms
  head tags. **JSON-LD alone — which is what Archie had — is not treated as sufficient by any corpus
  system.**

**A correction worth recording, because it is the failure mode `[[prior-art-citation-discipline]]`
describes.** I first recorded a stated absence: *"quire has no visible descriptive-metadata component"*,
from `grep -rn '<dl\|<dt\|<dd' packages/11ty/_includes/` → empty and `grep -rl metadata _includes/` →
empty. Both greps were correct. **Both were scoped to `_includes/`, and I read them as "anywhere."** The
tombstone lives in `_plugins/` and uses `<table>`, so both halves of the probe missed it — and the
absence I would have published is the opposite of the truth. A reviewer caught it by widening the same
grep. *A single-directory grep answers "is it in this directory", and was read as "is it anywhere."*

**IIIF viewers — does a one-canvas manifest still show manifest-level rights?** Yes, and **not one of
them gates rights chrome on canvas count**:

- `IIIF/clover-iiif/src/components/Viewer/InformationPanel/About/About.tsx:83-85` —
  `<Metadata metadata={manifest.metadata} />`, `<RequiredStatement requiredStatement={manifest.requiredStatement} />`,
  `<Rights rights={manifest.rights} />`, read off `vault.get(activeManifest)` at `:40`. `grep -n
  "items\|length\|canvas"` over that file returns only the four `homepage/seeAlso/rendering/thumbnail`
  presence checks — **no canvas-count branch exists**. The only count condition in the layout,
  `Viewer/Content.tsx:141` `sequence[1].length > 1`, hides the *thumbnail strip*.
  `Properties/Rights.tsx:12-15` renders the licence as a visible `<a href={rights}>` — a second
  independent instance of the QB answer.
- `IIIF/universalviewer/…/uv-shared-module/CenterPanel.ts:170-174` — `if (!requiredStatement ||
  !requiredStatement.value || !enabled) { return; } this.openAttribution();`. UV **auto-opens** a
  persistent attribution box whenever a statement resolves. Nothing consults canvas count. This is the
  strongest precedent for the single-object gap in §6.
- `IIIF/mirador/src/containers/AttributionPanel.js:18-19` — `requiredStatement` and `rights` both come
  from manifest-scoped selectors, canvas-blind.
  *What these do not support:* none of these viewers has Archie's exhibit/object split, so none is direct
  evidence about a *single-object exhibit*. The transferable claim is narrower — **canvas count is never
  the thing that decides whether container-level rights appear.** And Mirador's panel is a tab the user
  opens (`src/config/settings.js:487`), not always-visible chrome; only UV's box is unconditional.

**Stated absences, with the commands that came back empty:**

- `grep -rn 'rights' canopy-iiif/packages/app/ui/src/iiif/` → nothing. Canopy renders `Metadata` and
  `RequiredStatement` on its static work page but **never the `rights` URI**.
- `wax` renders no rights at all; only `_includes/item_metadata.html` matches `<dl`.
- `rg -ln 'requiredStatement' annomea quire juncture anvil tropy` → nothing.
- **A per-object licence URI rendered as visible text has no corpus precedent.** quire's licence is a
  single publication-level value with `scope` variants (`licensing.js:15-27`), and a quire figure has a
  `credit` field and **no** licence field (`_plugins/figures/schema.json:99-100`). The per-object
  licence line in this fix is original design and claims no precedent — it follows from Archie's model,
  where `RightsFields` exists at all three levels.

---

## 6. Found, and deliberately not fixed

**a. A single-object exhibit never shows its exhibit-level credit, licence or metadata — anywhere in
the SPA.** Measured against the built viewer: `voynich-rosettes` renders `dl.run .pair count=0` and
`dl=(none)` while its data carries three rows, and the credit on screen is the **object's**
(`"Beinecke … MS 408 (public domain)"`), not the exhibit's (`"Voynich folios courtesy of …"`). The
mechanism: `MetadataRun` is rendered **only** inside `ObjectGrid.svelte:50`, and `ExhibitView.svelte`
routes a `single` layout straight to the Reader with `rights={objectRightsOf(…)}`
(`ExhibitView.svelte:670`), so `ObjectGrid` never mounts. The exhibit's `requiredStatement` — a IIIF
MUST-display — is silently dropped for that whole layout. **Not fixed here:** the fix is a new prop
threaded through `Reader`/`MediaPlayer` and a decision about where it sits in the reader chrome, which
is the canvas-chrome/dock territory another slice currently owns. UV's `CenterPanel.ts:170-174` is the
precedent for the shape when someone takes it.

**b. The narrative reader shows the exhibit credit but not its metadata.** `NarrativeReader.svelte:778`
renders `<Credit {rights} …>` with `exhibitRights`, but has no `MetadataRun`, so on a narrative exhibit
the exhibit's DC rows are reachable only via the index side-trip (`ExhibitView.svelte:620`). Same
territory boundary as (a) — the narrative spine header is a busy surface with slices in flight.

**c. Six of the seed's 40 licensed items still render a raw URI.** CC BY 3.0, CC BY-NC-SA 3.0 and ODbL
are not in `LICENSES` at all. That list is **Studio's approved-URI picker** — authoring vocabulary, not
display — so extending it is a different change with a different blast radius. The fallback is the
designed behaviour and is now pinned by a test, so a reader always gets a resolvable link rather than
silence.

**d. `iiif/rights.ts:18-19` says "CC = canonical https; RightsStatements.org = canonical http" while
every one of the eleven `LICENSES` entries is `http:`.** The comment contradicts the data it documents,
and that contradiction is what produced (c)'s atlas half — nine sites rendering a bare URI. The data was
treated as the contract and the seed aligned to it; the stale comment is left for whoever owns the
vocabulary, since fixing it the other way (moving `LICENSES` to `https:`) would invalidate authored
values in existing published trees.

**e. Library-level descriptive metadata has no SPA surface at all.** `Gallery.svelte:71` renders
`<Credit rights={gallery.library} …>` but no `MetadataRun`; `metadataRows` is never called there. Moot
today — no library in the corpus carries metadata — but it is a real asymmetry with the other two
levels, and it is now the only level whose metadata the archival page shows and the app does not.

**f. The archival page emits no `<meta name="dcterms.*">` head tags.** quire does
(`head-tags/dublin-core.js:19-42`). The gap this ticket names is the *visible* surface, so the
machine-readable channel was left alone rather than expanded on the way past.

**g. Four of seven exhibits still carry no descriptive metadata at any level** (`screenshots`,
`language-atlas`, `geo-map`, `sampler`). This is the seed half of V104 and it is a showroom problem: the
render path is now proven on the three exhibits that have data, and the other four render nothing
because there is nothing. Authoring metadata for them is content work, not a fix.

**h. `Archie-aafd` was not waited on.** The ticket says to land it first *if the triage says the render
path is at fault*. The triage says the SPA render path is **not** at fault, and aafd decides whether the
read boundary rejects or displays excluded `dcterms` properties — a question about `metadataRows`, which
this fix consumes unchanged rather than re-implementing. Whatever aafd decides propagates to the
archival page for free, and injection I5 is what guarantees that (it fails if anyone bypasses the
projection).

---

## Commits

```
58f1cc3  fix(a5b1): the archival page shows every level's credit, licence and Dublin Core rows
662fdad  test(a5b1): the rights ladder and DC rows on the archival page; seed licence URI aligned
cc45f46  chore(a5b1): regenerate the published tree
3d8acf2  chore(a5b1): rebuild the embed's committed dist/ mirror
fb87cc8  Merge branch 'main' (879e519) — clean; generated artifacts re-verified current after it
```

Every gate in §4 was re-run at `fb87cc8`. `gen-published` after the merge produced **zero git diff**
and `sync-dist:check` still matches, so both generated trees are current against merged source.
