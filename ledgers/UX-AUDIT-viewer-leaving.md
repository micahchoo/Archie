# UX audit — Viewer vertical 6: Leaving with something (V100–V110)

Ticket `Archie-18d0`. Index: [UX-AUDIT-viewer.md](UX-AUDIT-viewer.md). Drive date 2026-07-24, real
Chromium at 1280×800 against the running stack, plus request-level probes of the crawler surfaces.

**What this vertical asks:** a reader found something worth keeping. Can they cite it, credit it,
search back to it, or hand it to someone else — and does the wider web see it at all?

**The short answer.** No, mostly — and not because a capability is broken. The address grammar is
built, parsed and frozen as public API (ADR-0021); the rights and metadata components are built and
correct; the archival tree is built and crawlable. What is missing is every *connection* between
them and the reader. Measured: the read surface contains **zero** clipboard or share affordances;
the address bar records the exhibit and nothing below it; the note rung of the five-rung ladder
cannot be expressed in the grammar at all; and the page a crawler is pointed at ships **31
characters** of body text.

Screenshots are `/tmp/leav-*.png` and `/tmp/narr-*.png`; each finding carries its repro.

---

## Can the reader cite it?

The cite ladder has five rungs (CONTEXT §244; `packages/render-core/src/url/route.ts:14-56`). Driven,
each rung twice — once as a hand-built URL, once by trying to make the app produce it:

| Rung | Resolves when hand-built? | Does the app ever *produce* it? |
| --- | --- | --- |
| Exhibit `#/<slug>` | ✅ | ✅ — the only one |
| Object `#/<slug>/o/<id>` | ✅ (drove `#/voynich/o/o1` → f1r, 1/12) | ❌ |
| Note `#/<slug>/a/<id>` | ❌ **cannot be expressed** (V100) | ❌ |
| Region `#/<slug>/a/<id>?xywh=` | ❌ (depends on the note rung) | ❌ |
| Section `#/<slug>/s/<id>` | ✅ (drove `/s/s4`, `/s/s6`; degrades honestly) | ❌ |

Three of five resolve. **Zero of five are ever produced by the reading UI.**

### V100 — The note rung is unsatisfiable: published note ids contain `/`, the route grammar is `/`-delimited *(Severity: high — Feel)*

**Surface:** `route.ts:41-46` (the `/a/<noteId>` tail) against the ids the publish step mints.

**Weakness.** `parseRoute` splits the hash path on `/` and takes `parts[2]` as the whole note id.
Every note id in a published tree is an absolute IRI:

```
https://micahchoo.github.io/Archie/viewer/published/voynich-reading/annotations/000000000BVAEW7XGCKM0KW0XS/v1
```

— seven slashes. Driven, both candidate forms fail identically:

| URL attempted | Result |
| --- | --- |
| `#/voynich-reading/a/000000000BVAEW7XGCKM0KW0XS` (bare ULID) | *"That note isn't here anymore — showing the exhibit instead"* |
| `#/voynich-reading/a/https%3A%2F%2F…%2Fv1` (percent-encoded IRI) | same |

Both resolvers compare exactly (`note-arrival.ts:29`, `narrative-landing.ts:27` — `a.id === noteId`),
the parser never decodes the segment, and no shorter form is carried anywhere in the tree. The same
id shape appears in the **portable** library (`archie-library.archie/screenshots/manifest.json` →
`…/annotations/01KWT0S7NJ8SWVMNNV8P8405H7/v1`), so this is not hosted-only: it is universal to
anything `publish/site.ts` writes.

This is **already known and already documented as broken in the shipped docs**:
`recipes/04-deep-link.html:62-75` labels the object rung "the PRIMARY working deep-link", then
comments its own note example **out**, with the reason inline — *"resolves only when the published
annotations carry a bare logicalId (slash-free); otherwise degrades to the object."* The publish
step never emits a bare logicalId. So the recipe ships a worked example of a feature that cannot
work, disabled, beside a note explaining why.

The consequence for this vertical: **the note — the unit a reader actually wants to keep, the thing
someone wrote about this image — is the one rung of the ladder with no address.** The region rung
falls with it, since it is the note rung plus a query param.

ADR-0021 freezes the address grammar as public API. Two of its five rungs cannot be uttered about
the artifact the tool produces.

**Repro:** `/viewer/#/voynich-reading/a/000000000BVAEW7XGCKM0KW0XS` *(`/tmp/narr-60-bare-ulid.png`)*
and the percent-encoded form *(`/tmp/narr-61-full-iri.png`)*.

*(Principle: match between system and the real world; a public API that the producer cannot satisfy is not one.)*

**INDEPENDENTLY VERIFIED 2026-07-24**, by a second session, because this is the most structurally
serious finding in the audit and it asserts that an ADR-frozen contract is unsatisfiable. Both halves
hold.

*Code path, four links, no escape:*
1. **Id shape.** All **144 of 144** published note ids across the seeded corpus are full IRIs, e.g.
   `https://micahchoo.github.io/Archie/viewer/published/geo-map/annotations/0000000001Q1E2RFF58H62PFSW/v1`
   — six-plus `/`-separated segments.
2. **Parse.** `packages/render-core/src/url/route.ts:42-44` takes `parts[2]` from
   `path.split("/")` — exactly ONE segment. Everything after the next `/` is discarded.
3. **Comparison.** `apps/viewer/src/note-arrival.ts:29,33` matches with `a.id === noteId` — exact
   string equality, no normalization, no suffix match.
4. **No decoding.** `route.ts` contains no `decodeURIComponent` on that segment (only
   `encodeURIComponent` for `src`, `:80`), so a percent-encoded IRI stays encoded and fails equality
   too. Browsers do not decode `%2F` in `location.hash` on the app's behalf.

*Empirical, against a REAL id from the published `geo-map` manifest — every plausible spelling was
tried and every one lands on the degrade notice:*

| Spelling attempted | Note opens? |
| --- | --- |
| last segment only (`v1`) | no — degrades |
| bare ULID (`0000000001Q1E2RFF58H62PFSW`) | no — degrades |
| two segments (`ULID/v1`) | no — degrades |
| full IRI, percent-encoded | no — degrades |
| full IRI, raw | no — degrades |

The rung is not merely awkward to use: **there is no string that satisfies it** for a note that
actually exists. Every note deep link that has ever been shared resolves to the degrade path, which is
also why the degrade path is so well-developed on this rung — it is the only path ever taken.

### V101 — The address bar stops at the exhibit: five reader states, one URL *(Severity: high — Feel)*

**Surface:** `ViewerShell`'s hash router and every view below it.

**Weakness.** Driven as one continuous session, recording `location.hash` after each act of reading:

| What the reader did | Address bar |
| --- | --- |
| opened the gallery | `#/` |
| clicked an exhibit card | `#/voynich` |
| opened an object from the grid | `#/voynich` |
| selected a note in that object | `#/voynich` |
| switched to the **Cipher** reading | `#/voynich` |
| deep-zoomed into a detail | `#/voynich` |

Six states, two addresses. Everything that makes the visit *this* visit — which folio, which note,
which interpretive reading, how far in — is invisible to the URL. The same holds in the narrative
(vertical 5, V84): activating a section, opening the object index, and stepping the spine all leave
the hash untouched.

The grammar to express four of those six already exists and is already parsed. Nothing writes to it.
The practical result is that the browser's own share mechanism — copy the address bar, the only one
the reader has (see V102) — returns them to the exhibit's front door every time, and reload loses the
place.

**Repro:** the ledger above is `/tmp/leav-01-object.png` → `-02-note.png` → `-03-zoomed.png`, hash
read after each.

*(Principle: visibility of system status; consistency between address and view. This is the reader-side evidence bearing on `Archie-33bf` — see the resolution note.)*

### V102 — There is no way to copy anything: zero clipboard or share affordances in the entire read surface *(Severity: high — Feel)*

**Surface:** all three read packages.

**Weakness.** Grepped exhaustively for `clipboard`, `navigator.share`, "copy link", "cite" across
`apps/viewer/src/`, `packages/archie-viewer/src/` and `packages/render-mount/src/`: **zero matches**
outside comments. Studio has five (`Publish.svelte:140, 200-225`, `publish-machine.svelte.ts:82`) —
copy the share link, copy the web-component snippet, copy the embed snippet. Confirmed by drive: with
a note open in the Reader, the complete set of controls offered is *previous / next object, previous
/ next item, the four reading layers, Hide all, Hide notes, About & rights, Back to Exhibit, Hide the
item strip*. Nothing that produces text the reader can take away.

So the tool that exists to let a scholar write about an image gives the reader of that writing no
means to reference it — no "cite this", no "copy link", no permalink control, not even on the
one rung (exhibit) the URL does track.

The author-side half of this is built and good: `ProseCites`/`CiteCard` render an author's `archie:`
cite as a typed card with a thumbnail and a working in-app link (driven: the card in section 1 of
`voynich-reading` navigates to `#/voynich/o/o1` and lands on f1r). Citation in Archie is a thing
authors do to each other's exhibits, never a thing a reader does.

Prior art, directly on point: **`quire`** ships a citations plugin (`packages/11ty/_plugins/citations`,
`simple-cite` + CSL-JSON, MLA and Chicago fullnote bundled) with a `citation` component at both
**page** and **publication** scope — a formatted, copyable citation on every page of a scholarly
static site. It is the single closest donor in the corpus to this vertical's question, and Archie
has no equivalent at any level.

*(Principle: user control and freedom; the ratified reader is a scholar's audience.)*

---

## Can the reader credit it?

### V103 — The license ladder is inverted: the object is licensed, the exhibit isn't, the library has nothing at all *(Severity: medium — Feel/trust)*

**Surface:** `Credit.svelte` at each of its three scopes, against the published corpus.

**Weakness.** `Credit` is correct — one quiet line plus an ⓘ "About & rights" disclosure, and it
honours the IIIF MUST-display rule for `requiredStatement` without shouting. What it is given
differs by level. Driven, ⓘ opened at each:

| Level | Credit line | ⓘ panel |
| --- | --- | --- |
| Gallery (`#/`) | **none — the ⓘ button does not exist** | — |
| Exhibit (`#/voynich-reading`) | "Voynich folios courtesy of the Beinecke… CC BY-NC-SA 3.0." | **Source** only — no License row |
| Object (`#/voynich/o/o1`) | "Beinecke… MS 408 (public domain)" | **Source** + **License: Public Domain Mark 1.0** ✅ |

Measured against the data: every published `manifest.json` carries a `requiredStatement` and **no
`rights`** (license URI); `collection.json` carries neither. So the row is omitted, not broken — the
corpus never sets it above the object.

The effect on the reader is precisely backwards. The **exhibit** is the unit they will cite and the
unit the OG card, the sitemap and the static page are all built around; it states no terms. The
**library** — the first screen a first-time visitor meets, `GOAL.md:11-13` — states neither who
assembled it nor under what licence, which is the vertical-1 V12 observation with a measurement
attached: it isn't that the description field is unset, it's that the whole rights structure is empty
at library level.

Recorded as a corpus finding, not a component defect: `Credit` will render all three rows the moment
the data carries them. But the corpus **is** what the visitor meets, and a scholarly tool whose
flagship demo declines to state its own licence is making a claim about itself.

**Repro:** `/tmp/leav-10-credit-gallery.png`, `-exhibit.png`, `-object.png`.

*(Principle: trust and provenance; `GOAL.md`'s "obviously trustworthy".)*

### V104 — The Dublin Core metadata surfaces render nothing, anywhere in the corpus *(Severity: medium — coverage)*

**Surface:** `MetadataList.svelte` (91 lines), `MetadataRun.svelte` (40 lines) — the read half of the
Dublin Core work (map `Archie-c6bf`).

**Weakness.** Measured `document.querySelectorAll('[class*=metadata], dl').length` at gallery,
exhibit and object level: **0, 0, 0**. Measured in the data: `metadata` entry counts are `0` on every
published exhibit (`voynich`, `voynich-reading`, `language-atlas`, `sampler`), `0` on every one of
their 35 objects, and `0` on `collection.json`.

Two consequences. First, the reader's answer to "what *is* this, formally — who, when, what medium?"
is nowhere on any screen, in a tool whose donors (`tropy`, `quire`) treat exactly that as the payload.
Second, and more actionable: 131 lines of display code across two components have **never been
exercised against real published data** by anything a drive can reach. Whatever these components do
with a long value, a URI value, an RTL value or forty entries is unknown, and a UX audit cannot
answer it without a fixture. Cross-reference `Archie-c6bf`; don't fork the write side.

*(Principle: don't ship a surface with no specimen. Flagged as owed work, not as a defect in the components.)*

### V105 — The embed displays no attribution, no licence and no metadata at all *(Severity: high — Feel/legal)*

**Surface:** `packages/archie-viewer` (embed), same published tree as the shell.

**Weakness.** Driven at both gallery and object level, measured inside the shadow root: `credit: []`,
`metadata: 0`, `search: false`. Zero elements matching credit / rights / attribution. Compare the
shell at the same object, which shows both the credit line and "License: Public Domain Mark 1.0".

The embed is the consumer that renders on **someone else's website** — the context where attribution
matters most and where the host institution's requirement travels least well. IIIF makes
`requiredStatement` a MUST-display, and `Credit.svelte`'s own header comment says so. The embed reads
the same `manifest.json`, has the value in hand, and drops it.

This is the same shape as V88 (the embed discards the narrative) and V9 (the embed is a different
product): `element.ts:9-10`'s ported-not-imported markup means every read-side component added to the
shell has to be added twice, and the second time keeps not happening.

**Repro:** `/tmp/leav-20-embed-gallery.png`, `/tmp/leav-21-embed-object.png`.

*(Principle: consistency; ADR-0019's "one engine, not a fork"; IIIF's display requirement.)*

---

## Can the reader search back to it?

### V106 — The finder returns text with no address, no locus and no count *(Severity: medium — Feel)*

**Surface:** `SearchOverlay.svelte`.

**Weakness.** The finder works well mechanically — ⌘K, live results, tag facets, and the jump lands
correctly (driven: a hit on f116v lands the narrative on section 6 with the note open). What a result
*shows* is the note's text and its tag chips, and nothing else. Driven on `#/voynich` with the query
`plant`, the first five results read:

> "Under the cipher reading, the 'imaginary' plant is a deliberate cover image…"
> "Under the abjad reading, the drawing is a schematic of a real plant…"
> "Under the grille reading, the vivid later colour over an earlier outline…"
> "Under the cipher reading, this block is enciphered description of the plant beside it…"
> "Under the grille reading, the fantastical plant is exactly what a…"

Across a 12-folio exhibit with four reading layers, no result names its **folio**, its **reading
layer**, or its **section**. The layer names visible above are an authorial accident — those notes
happen to begin with the phrase. There is also no result count and no end-of-list marker, so the
reader cannot tell whether they are seeing three matches or thirty.

"Search back to it" is this vertical's own question, and the answer is: you can find the words again,
but the finder will not tell you where they live, and having found them you still cannot address them
(V100/V101).

**Repro:** `/viewer/#/voynich` → ⌘K → "plant" *(`/tmp/leav-11-search.png`)*.

*(Principle: recognition over recall; visibility of system status.)*

---

## Does the wider web see it?

### V107 — The page the crawler is sent to ships 31 characters of body text *(Severity: high — Look/reach)*

**Surface:** `apps/viewer/src/pages/[slug].astro:147-148` — `<ExhibitView client:only="svelte" />`.

**Weakness.** `robots.txt` → `/viewer/sitemap.xml` → seven exhibit pages, all 200. Measured, with
`<script>`/`<style>` stripped:

| URL | crawlable body characters |
| --- | --- |
| `/viewer/voynich-reading/` | **31** ("Reading the Unreadable — Archie") |
| `/viewer/geo-map/` | **45** |
| `/viewer/sampler/` | **25** |

`client:only` is correct and load-bearing — OpenSeadragon touches `document` at import, and the
comment at `:147` says so. But the consequence is that the six sections of prose, the 22 notes, the
object labels and the credit line of `voynich-reading` are invisible to every crawler, reader-mode,
translation tool, archive-crawler and AI ingestion path. What survives is the `<title>`, four OG tags
and a `CreativeWork` JSON-LD block carrying the same one-sentence description — a good unfurl card
wrapped around an empty page.

For a static-publishing tool whose two nearest donors are static-HTML publishers — `quire` builds an
11ty book that is *entirely* crawlable HTML, `juncture` renders visual essays as server-delivered
text — this is the structural gap in "does the wider web see it".

**Repro:** `curl`-equivalent request probes in the drive; see `.audit-narr-leaving-21.mjs`'s output.

*(Principle: Look/reach; ADR-0013 and ADR-0014's purpose.)*

### V108 — Every exhibit has two web faces, and neither points at the other *(Severity: medium — Feel/trust)*

**Surface:** `/viewer/<slug>/` (the Astro app page) vs `/viewer/published/<slug>/index.html` (the
ADR-0014 archival page). Both live, both 200.

**Weakness.** Measured for `voynich-reading`:

| | `/viewer/voynich-reading/` | `/viewer/published/voynich-reading/index.html` |
| --- | --- | --- |
| crawlable body | **31 chars** | **13 491 chars** |
| `rel=canonical` | **absent** | present — **pointing at itself** |
| OG card | full set + JSON-LD | own set |
| what it is | the real reading experience | "archival text" |

So the same exhibit exists twice, the richer copy declares itself canonical, the interactive copy
declares nothing, and the sitemap `robots.txt` advertises lists only the *thin* one. A reader
deciding which URL to put in a footnote has two candidates and no signal; a search engine has
duplicate content with a canonical tag pointing away from the page a human should land on.

The fix is a policy decision, not a defect hunt — pick which URL is the citable one and make both
pages say so — which is why it is stated here as evidence rather than a prescription.

*(Principle: consistency; citation stability. Bears on `Archie-33bf`.)*

### V109 — The published tree's own sitemap enumerates 2 of its 7 exhibits *(Severity: medium — reach)*

**Surface:** `apps/viewer/public/published/sitemap.xml` (and its `sitemap.txt` twin), served live at
`/viewer/published/sitemap.xml`.

**Weakness.** The tree contains seven exhibit directories, each with a real `index.html` (all 200).
Its sitemap lists **two**: `published/index.html` and `published/screenshots/index.html`. Missing:
`voynich`, `voynich-reading`, `voynich-rosettes`, `language-atlas`, `geo-map`, `sampler`.

The generator is not at fault — `static-pages.ts:102-114` enumerates `library.exhibits` faithfully.
The cause is the repo's **two seed sources**: the checked-in tree was written by a publish of a
two-exhibit library, and the other five exhibits were laid into the same directory by a different
generator that rewrites manifests but not the library-level projections. `site.ts:351` explicitly
describes those projections (`index.html`, sitemaps) as the *last* barrier write — a guarantee that
only holds when one writer owns the tree.

This is I-V1's lesson (*derive every enumeration of a set from one source, or they drift silently
behind a green build*) recurring one layer down, in the artifact a curator hosts themselves — the
layer where it costs the most, because there is no Astro build to compensate.

**Repro:** `GET /viewer/published/sitemap.xml` vs `ls apps/viewer/public/published/*/index.html`.

*(Principle: consistency; single source for any enumeration.)*

### V110 — The archival page omits the narrative entirely *(Severity: high — reach)*

**Surface:** `packages/render-core/src/publish/static-pages.ts` `exhibitPageHtml`.

**Weakness.** `grep -n sections static-pages.ts` returns **nothing**. The ADR-0014 archival page is
built from the exhibit's title, description, credit and per-object note texts, and has no concept of
a section. Measured on the seed: `published/voynich-reading/index.html` carries 13 491 characters of
body text and **zero** of the six sections' prose (probed for the literal string "herbal: a plant to
a page" — absent).

So for the one exhibit type whose content *is* the writing, the durable, crawlable,
"self-describing published artifact" contains the notes and drops the argument. Combined with V107
(the app page is empty) and V88 (the embed drops the sections too), the narrative of
`voynich-reading` exists in exactly **one** place a reader can reach: the live shell's spine. Three
of four consumers hold the data and render none of it.

*(Principle: ADR-0014's own claim — "self-describing" must describe the thing that was authored.)*

---

## Checked and cleared — do not re-report

- **I-V1 is fixed; verified, not assumed.** `ledgers/TEND-EXPLORE-viewer-2026-07-20.md` I-V1 reported
  two disagreeing enumerations of the exhibit route-set, `sitemap.xml` 404s for `geo-map/` and
  `screenshots/`, and no page for a cloner's dropped-zip exhibits. Driven: `robots.txt` → sitemap →
  **all seven `<loc>`s return 200, `geo-map/` included**. `[slug].astro:86` now maps
  `exhibitsJson.exhibits` (ALL cards) with `META[card.slug] ?? card`-derived defaults, and its header
  documents the remaining split as **deliberate**: every slug builds a page, only the non-`unlisted`
  subset is advertised (`og-image.ts:19`, `Archie-77b2`). `sampler` being absent from the sitemap
  while `/viewer/sampler/` returns 200 is that lever working, not a regression. V109 is a *different*
  sitemap in a *different* tree; don't merge them.
- **`robots.txt`.** Correct — derives its `Sitemap:` line from `CANONICAL_BASE`, no hardcoded origin,
  `Allow: /`. No finding.
- **`ProseCites` / `CiteCard` / `ExhibitCiteCard`.** These work. An author's `archie:` cite renders as
  a typed card with a kind badge, a cover thumbnail and a "→ open object" link, and clicking it routes
  in-app to `#/voynich/o/o1` and lands on the right folio (driven). The `¶` link-scent for intra-library
  cites is a nice touch. The only defect near them is cosmetic and belongs to vertical 5 (V87 — the
  floating finder button occludes the card's link).
- **The section rung's degrade.** Announces itself honestly for both unknown and out-of-range ids —
  cleared in detail in [the narrative ledger](UX-AUDIT-viewer-narrative.md).
- **OG tags and JSON-LD.** Present, correct and non-duplicated on every exhibit page, with a
  build-time HEAD probe guarding the IIIF `/full/1200,/` upsize against level-0 hosts
  (`og-image.ts:20-42`). The unfurl is the healthiest part of this vertical.
- **Astro dev toolbar links.** Filtered from every DOM query.

## Overlap declared, not resolved: `Archie-33bf`

`Archie-33bf` ("Published-site deep links: should viewer URLs mirror Studio place grammar?") sits on
the Studio UX map and owns the URL-grammar **decision**. This vertical audited the reader's
experience and did not pre-empt it.

**It should move under this map.** The evidence: the reader-side symptoms (V100, V101, V108) are not
about whether the viewer's grammar *matches Studio's* — that is a tidiness question — but about
whether the viewer's grammar can be *uttered at all* about a published artifact, and whether anything
ever utters it. Those are read-surface questions with read-surface evidence, and 33bf as currently
framed would be decided on Studio's `place.ts` without any of it. Two concrete inputs 33bf needs
before it can be decided:

1. **V100 is a publish-step question, not a routing question.** The note rung needs `site.ts` to emit
   a slash-free `logicalId` alongside the IRI, or the grammar needs a rung that addresses what the
   tree actually contains. `route.ts` cannot be fixed alone. `recipes/04-deep-link.html:62-75` already
   states the constraint.
2. **V108 forces a canonicality choice** — app page or archival page — that 33bf's framing doesn't
   currently include, and that ADR-0013/ADR-0014 together imply but don't settle.

If the map owners prefer to leave 33bf where it is, it should at minimum take V100/V101/V108 as its
primary evidence rather than reasoning from `place.ts`.

## Not reached, and why

| Not reached | Why |
| --- | --- |
| metadata display under real Dublin Core data | no `metadata` entry exists anywhere in the corpus (V104) — needs a fixture, not a drive |
| a licensed exhibit or library | no `rights` URI above object level (V103) — same |
| the portable library's cite surfaces beyond id form | the test zip holds two exhibits (`assets`, `screenshots`) with no narrative and minimal notes; its note ids were inspected and match the hosted form (V100), which is the finding that mattered here |
| region-rung (`?xywh=`) behaviour | unreachable — it composes on the note rung, which does not resolve (V100). Not separately reportable until V100 moves. |

## Provenance caveat on the embed finding (V105)

Driven against `dist/archie-viewer.js` dated **Jul 24 19:52** while a concurrent session was editing
`packages/archie-viewer/src/`. V105 is a *negative* observation (no credit element exists in the
shadow root) and is corroborated by source — the embed has no `Credit` analogue in
`packages/archie-viewer/src/` — but **re-verify against the current build** before opening a fix
ticket, per the arrival ledger's standing form.

Scripts: `.audit-narr-leaving-20/21/22/23.mjs` and `.audit-embed-driver.html` (repo root, deleted
after the drive). The embed was served by a plain `python3 -m http.server` on port 8909 — no Vite
instance was started and `apps/viewer/node_modules/.vite/deps` was never touched.

## Consumer coverage

| Consumer | Driven | Findings |
| --- | --- | --- |
| `apps/viewer` hosted | yes | V100–V104, V106–V110 |
| `apps/viewer` portable | partially — id form inspected, no citable corpus in the test zip | V100 (confirmed universal) |
| `packages/archie-viewer` embed | yes, local `dist/` (Jul 24 19:52) | V105 |
| `packages/render-mount` | no surface in this vertical | none |
| the published static tree | yes, request-level | V107–V110 |
