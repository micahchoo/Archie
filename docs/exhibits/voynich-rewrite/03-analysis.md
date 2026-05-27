# Voynich Rewrite — Analysis (content → Archie structures)

**Wave 2, Phase 2 (Analysis).** Date: 2026-05-27. Status: analysis complete; feeds Phase 3 (Ideation → structure mapping), Phase 4 (Build).
**Governing principle (locked):** content drives features, not the reverse. **Editorial stance (locked):** the three readings are presented **even-handedly** as competing toggles over the *same* regions — MS 408 is genuinely undeciphered; no interpretation is favoured. Per Archie's CLAUDE.md, every interpretive claim cites a source.

**Inputs:** `00-plan.md`, `01-manuscript-foundation.md` (10 folios + factual spine + 3 frameworks), `02-av-and-material-manifest.md` (AV asset). Archie structures: ADR-0005 (Sections), ADR-0006 (spatiotemporal selectors), ADR-0007 (Readings).

## Source tags (carried from `01-manuscript-foundation.md`; do not re-derive)

`[WIKI]` Wikipedia "Voynich manuscript" (indexed `wikipedia-voynich`). `[ZAND]` Zandbergen, *voynich.nu*. `[YALE-IIIF]` Beinecke MS 408 IIIF manifest. Reading-specific primaries (named so Phase 4 may promote): **cipher** → Currier / W. & E. Friedman / Tiltman (`[WIKI — codebreakers]`); **hoax** → Gordon Rugg, Cardan-grille hypothesis, 2003/2004 (`[WIKI — Hoax]`); **abjad / natural-language** → Stephen Bax 2014 partial decoding + Amancio et al. 2013 + Landini 2001 + Currier "Language A/B" (`[WIKI — Natural language]`, `[ZAND — two-system]`).

**Voice rule for the build (load-bearing):** each reading note is written in **declarative curator voice** — "Under the grille reading, this block is …" — never "proponents argue." The hoax reading claims its region as confidently as the other two. Hedging the Rugg reading more than the others *is* the failure mode this stance exists to prevent.

---

## 1. Readings analysis → Archie **Readings** (ADR-0007)

**Mechanism.** Three Readings, each an IIIF `AnnotationPage` per object grouped by an exhibit-level `AnnotationCollection` (`{id, name, colour}`): **`cipher`**, **`hoax`**, **`abjad`**. A region is a Note targeting one folio's canvas with an `xywh=` selector; the *same* region carries one note in each reading's page (mutual exclusivity per ADR-0007 — one note → one reading; the toggle flips between pages). Arrival is **base-only**; the legend is a radio; no camp is privileged. Precise `xywh` pixels come at build — below gives folio + an approximate region description sufficient to author against.

Eight regions are chosen where the three lenses **maximally diverge** — single-word "labels," the opening incipit, and the closing Latin marginalia separate the readings far more cleanly than full prose blocks. Distributed across all 10 folios (two herbal full-page blocks included so the toggle demonstrates on plant pages too, not only labels).

### R1 — f1r, opening incipit (first text paragraph, upper-right beside the plant)
- **cipher:** Under the cipher reading, this is the manuscript's enciphered *incipit* — the opening lines a cryptographer would attack first, since openings often carry a title or invocation whose plaintext is guessable. The professional codebreakers (Currier, the Friedmans, Tiltman) all began here and none recovered it. `[WIKI — codebreakers]`
- **hoax:** Under the grille reading, this paragraph is the first output of a Cardan-grille passed over prefix/stem/suffix tables — front-loaded, fluent-looking, and meaningless; its "opening" feel is an artefact of being generated first, not of any title. `[WIKI — Hoax]`
- **abjad:** Under the abjad reading, these are the genuine first words of a natural-language preface in an invented alphabet; word-entropy here matches Latin/English (Landini), and the line behaves as a real text's opening would. `[WIKI — Natural language]`

### R2 — f18v, herbal text block beside the plant (the AV-anchored folio; see §4)
- **cipher:** Under the cipher reading, this block is enciphered description of the plant beside it — a herbal entry locked under a substitution or steganographic scheme. `[WIKI — codebreakers]`
- **hoax:** Under the grille reading, the block is filler with no relation to the drawing; the apparent "caption" adjacency is the same page-layout habit the forger imitated, not meaning. `[WIKI — Hoax]`
- **abjad:** Under the abjad reading, it is a plaintext herbal note whose statistics are "mostly compatible with natural languages and incompatible with random texts" (Amancio et al. 2013); Bax's method would attack the plant-name label first. `[WIKI — Natural language]`

### R3 — f25v, full-page herbal plant + its text (whole-page region)
- **cipher:** Under the cipher reading, drawing and text are a matched entry — the picture keys the cipher, the way a known herbal's illustration would hint at the enciphered plant-name. `[WIKI — codebreakers]`
- **hoax:** Under the grille reading, the vivid later colour over an earlier outline is decoration added to sell the artefact; the text was generated independently of the plant, which is why no plant here is identifiable. `[WIKI — Hoax] / [WIKI note 7 — crude later colouring]`
- **abjad:** Under the abjad reading, this is a real (possibly stylised or composite) plant with a genuine descriptive paragraph; unidentifiability reflects an unfamiliar regional flora, not absence of content. `[WIKI — Natural language]`

### R4 — f33v, the near-fantastical herbal drawing + caption line
- **cipher:** Under the cipher reading, the "imaginary" plant is a deliberate cover image — the cipher's content need not match the picture, so an invented plant hides rather than reveals. `[WIKI — codebreakers]`
- **hoax:** Under the grille reading, the fantastical plant is exactly what a forger with no botanical source produces; image and text are both invented, independently. `[WIKI — Hoax]`
- **abjad:** Under the abjad reading, the drawing is a schematic of a real plant and the caption names it; Bax's program reads such labels by matching glyph-clusters to known plant names. `[WIKI — Natural language]`

### R5 — f67r, a single star-label in the outer ring of the astronomical diagram
- **cipher:** Under the cipher reading, this one-word label is an enciphered star or month name — a short, high-value crib, which is why cryptanalysts targeted the labelled diagrams. `[WIKI — codebreakers]`
- **hoax:** Under the grille reading, the label is a short grille-drawn token with no referent; its placement on a star is mimicry of real astronomical diagrams, not naming. `[WIKI — Hoax]`
- **abjad:** Under the abjad reading, the label is a real word — plausibly a star or zodiac-figure name — written abjad-style; Bax's 2014 decoding proposed exactly such proper-name readings of Voynichese labels. `[WIKI — Natural language / Stephen Bax]`

### R6 — f78r, a label beside one nymph in the balneological tube-network
- **cipher:** Under the cipher reading, the nymph-label is enciphered — a name or term for the figure or the fluid in the pipes — and the balneological pages, in Currier's "Language B," may use a *different* cipher system than the herbal. `[WIKI — codebreakers] / [ZAND — two-system]`
- **hoax:** Under the grille reading, the label is meaningless filler; the statistical difference Currier found between this section and the herbal is just a *second* grille table, not a second language. `[WIKI — Hoax] / [ZAND]`
- **abjad:** Under the abjad reading, the label is a real word in a genuinely distinct dialect or register (Currier "Language A" vs "B" = two real linguistic states), consistent with natural-language variation across a long manuscript. `[WIKI — Natural language] / [ZAND — Currier A/B]`

### R7 — f85v–86r (Rosettes), label inside the central medallion (marquee object)
- **cipher:** Under the cipher reading, the central rosette's label is the key to the whole foldout — a place-name or cosmological term whose decryption would unlock the map's geography. `[WIKI — codebreakers]`
- **hoax:** Under the grille reading, the label is decorative gibberish; the causeways and castles are an impressive *visual* forgery, and the text laid over them carries no place-names because it carries nothing. `[WIKI — Hoax]`
- **abjad:** Under the abjad reading, the label names a real place or region; the abjad hypothesis is what motivates reading the Rosettes as an actual (if stylised) geographic or cosmographic diagram. `[WIKI — Natural language]`

### R8 — f116v, the later Latin-script marginalia (NOT Voynichese — a different hand)
- **cipher:** Under the cipher reading, this Latin line is a later owner's attempted **key or crib** — someone who believed the book was enciphered and jotted a decryption hint. `[WIKI]`
- **hoax:** Under the grille reading, the Latin is a later reader's **failed gloss**: proof that even early owners could extract no meaning, so they annotated around the void. `[WIKI — Hoax]`
- **abjad:** Under the abjad reading, the Latin hand is a later scribe **glossing the abjad text** — treating it as a real language worth translating, which presupposes it has content. `[WIKI — Natural language]`

> Note on f68r, f75r, f99r: each also carries authorable per-reading notes (star-cluster on f68r; pool-and-tube cluster on f75r; apothecary-jar label on f99r) following the same three-paragraph pattern. Eight detailed regions above are the floor for build; these three are the natural next regions so the toggle is live on **all ten** image folios per the locked "across ALL objects" requirement.

---

## 2. Tags analysis → Archie **Tags** (`purpose:tagging`)

Tags are **additive per-note discovery** labels (ADR-0007), distinct from the mutually-exclusive Readings. They are also the home for **apparatus/reference strata** (paleography, codicology, material). Kept to a small, usable vocabulary — a discovery filter, not noise. A visitor filtering `nymphs` should land on exactly the balneological pages; filtering `foldout` should surface the unusually wide objects.

| Tag (`purpose:tagging`) | Meaning | Folios / regions carrying it |
|---|---|---|
| `botanical` | plant drawing (real or imaginary) | f1r, f18v, f25v, f33v; pharmaceutical plant-parts on f99r |
| `astronomical-symbol` | star, Sun/Moon, zodiac, cosmological ring | f67r, f68r; cosmological medallions f85v–86r |
| `nymphs` (balneological) | small nude figures, pools, tube networks | f75r, f78r |
| `apothecary` | labelled jars / containers | f99r |
| `foldout` | larger-than-standard fold-out leaf | f67r, f68r, f85v–86r |
| `marginalia` | non-Voynichese later hand / inscription | f1r (faded erased ownership inscription, top margin), f116v (Latin) |
| `currier-hand-A` | Currier "Language A" statistical system | herbal: f1r, f18v, f25v, f33v `[ZAND]` |
| `currier-hand-B` | Currier "Language B" statistical system | balneological / "biological": f75r, f78r `[ZAND]` |
| `label-word` | isolated single "word" beside an illustration element | f67r star-label, f78r nymph-label, f85v–86r rosette label, f99r jar label |
| `provenance` | object bears ownership / chain-of-custody evidence | f1r (erased inscription), f116v (Latin marginalia) |

**Design notes.** (1) `currier-hand-A/B` is an *apparatus* tag (codicology), deliberately a Tag not a Reading — it is a measured property of the script, not an interpretation of meaning, and a note can carry it *alongside* any of the three readings. (2) `label-word` cross-cuts sections and is the discovery handle for "show me the single-word labels" — the regions where the readings diverge most (§1). (3) `foldout` is both a tag and an exhibit feature (multi-panel deep-zoom). Tag chips render in the note pane, never as a canvas legend (ADR-0007).

---

## 3. Sections analysis → Archie **Sections** (ADR-0005)

A Section is a **self-contained reading beat** (ADR-0005, model A): `{ objectId, start, prose }` — its own camera target (`start` = `xywh=` for an image, `t=start,end` for the AV object) and its own curator prose, independent of the Note layer. The spine **switches objects** across sections. Ordered to follow the manuscript's real divisions (`[ZAND]` / `[WIKI]`). Prose is curator voice — names what the visitor sees, no dev jargon, no "playhead/Set in/frame."

| # | Section | Frames (objectId → start region) | Prose angle (curator voice) |
|---|---|---|---|
| 1 | **Herbal** | f1r (opening page) → whole page; beat continues to f18v, f25v, f33v | The book opens as a herbal: a plant to a page, text flowing around the drawing. None of these plants can be named with certainty — some look observed, some invented — and the writing has never been read. |
| 2 | **Astronomical** | f67r (foldout) → the circular diagram; then f68r → the star-cluster | The pages widen into fold-out wheels of Sun, Moon, and stars, each star tied to a small labelled word. Conventional zodiac figures appear, but the labels around them stay closed to us. |
| 3 | **Balneological** | f75r → the pool-and-tube cluster; then f78r → the nymph network | Small bathing figures move through green networks of pipes and basins. The script shifts character here — measurably a different system than the herbal — as if a second voice took up the pen. |
| 4 | **Cosmological** | f85v–86r (Rosettes foldout) → the central medallion | The largest spread in the book unfolds into nine medallions joined by causeways, with castle-like and map-like forms. Whether it charts real places or imagined ones is part of what the page refuses to settle. |
| 5 | **Pharmaceutical** | f99r → the rows of jars | Rows of labelled containers sit beside isolated roots and leaves — many of them tidier copies of plants from the opening herbal, as if assembled into a working reference. |
| 6 | **Recipes / final** | f116v (last page) → the Latin marginalia in the margin | The book closes on short starred paragraphs and, on its very last page, a few lines in ordinary Latin script — a later hand reaching in from outside the manuscript's silence. |

The narrative spine is single-pass and object-switching; markers shown while a section is active are that object's (ADR-0005). Section prose may ⌘K-cite a specific Note where useful (e.g. §4's Rosettes prose linking the R7 region), satisfying "this beat is about that region" through a link, not a structural field (ADR-0005).

---

## 4. AV integration → **AV object** + time-anchored notes (ADR-0006)

**The gap.** The locked AV asset is Kryptogramm track `04-f18v` = **folio 18v**, which is **not** in the 10-folio selection.

**Recommendation: add f18v as an 11th object.** Verified against the live IIIF manifest `[YALE-IIIF]`: folio **18v** exists, **imageId `1006109`**, native **2846×3781 px**, **herbal** section (folio 18 sits inside the ff.1r–66v herbal block). Adding it costs nothing structurally — it is another deep-zoom image object in the herbal section — and it lets the audio **map to a visible folio**: the sonification of f18v plays *against the very page it sonifies*. This is strictly better than the alternative (mapping the audio to an unrelated existing folio, which would break the track-name↔folio tie that made Kryptogramm the chosen asset in the first place, per `02-av-and-material-manifest.md` §1). The image f18v also gets its own readings region (R2, §1), so the page is annotated *both* visually and audibly.

**The AV object shape** follows the published `av` exhibit precedent (verified): a `Sound` canvas, body `audio/mpeg` (+ `audio/ogg`), per-segment annotations with `purpose:supplementing` and a `FragmentSelector` `t=start,end` (ADR-0006 — audio is 1-D temporal; locus = a region on the waveform). Track length 4:57 (296.96 s) supports several distinct notes.

**Time-anchored notes carry the three-readings logic** — the AV notes become a fourth, audible row of the same toggle. Concrete `t=` ranges to author (curator voice; exact boundaries set after the human listen-confirms the track, per `02` §3):

| Note | `t=start,end` | Curator prose (the toggle, made audible) |
|---|---|---|
| AV-1 | `t=0,30` | The machine reads the page aloud, letter for letter. Under the cipher reading you are hearing enciphered speech; under the grille reading you are hearing the rhythm a table-and-overlay produces; under the abjad reading you are hearing a real language you simply don't know. Same sound, three claims. |
| AV-2 | `t=45,80` | A repeated cadence surfaces. Under the abjad reading this resembles a root-and-pattern morphology (Bax); under the grille reading it is the predictable repetition the prefix/stem/suffix tables force; under the cipher reading it is enciphered structure showing through. `[WIKI — Natural language / Hoax]` |
| AV-3 | `t=120,160` | Here the "words" cluster like labels. Cryptanalysts attacked exactly such short tokens as cribs (cipher); Rugg's tables emit them just as readily (grille); Bax read them as proper names (abjad). |
| AV-4 | `t=250,296` | The reading ends without resolving. That the ear can't decide between language and noise is the manuscript's whole condition — undeciphered, even when sounded. |

**Cross-link AV → image (⌘K cite).** AV-1's prose ⌘K-cites the visual region **R2 on f18v** — pressing it jumps the viewer to the herbal text block the audio is reading aloud, binding the `Sound` object to the `Image` object at the moment they describe the same content. This exercises the intra-Library link grammar across two media types (ADR-0006).

**Tags on the AV object:** `currier-language` apparatus context — the sibling track `05-currier-language-a` names a real Voynichese dialect class; if a second AV note references it, tag it `currier-hand-A` for consistency with §2.

---

## 5. Cross-exhibit links → ⌘K `archie://` into `bidar`

Target verified in-repo: `bidar` is published with stable IDs on a single canvas `https://archie.demo/bidar/canvas/o1` (image; `xywh=pixel:` selectors), exhibit "Techno-Futures from Bidar" — a condensed **map of the Bidar mesh network**: places and people as nodes joined by network links.

**Link 1 (strong — recommended).** From the **Rosettes** central-region note (R7, f85v–86r) → `bidar`'s mesh-map canvas. **Angle: comparative diagrammatics.** Both objects render *geography as a network of nodes joined by causeways/links* — the Voynich Rosettes' castles-and-causeways and bidar's places-and-mesh-links are the same visual grammar five centuries apart. The link reads: *"A network rendered as a map — compare the mesh of Bidar."* Concrete `archie://` form points at the bidar canvas region; if a specific bidar node-annotation is wanted as the landing target, R7 can cite a bidar note id (e.g. `…/bidar/annotations/000000000EY4VPF7E19E4NGZ2Z/v1`, a "collective process / platform" reflection) — Phase 3 picks the exact target.

**Link 2 (candidate — flagged, not forced).** From the **f1r erased ownership inscription** / **f116v Latin marginalia** (the `provenance` + `marginalia` regions) → a `bidar` field-note, on the angle *"a hand from outside the work, reaching in."* This is **weaker**: bidar is not a paleography exhibit, so the paleographic comparison is thin. **Recommendation: ship Link 1; carry Link 2 to Phase 3 as a candidate pending review** rather than force a weak second link (per the locked content-first principle — a link earns its place or it doesn't ship).

---

## 6. Gaps / flags for Phase 3–4

- **Precise `xywh` for all R1–R8 regions** is deferred to build (per dispatch); the descriptions above are authorable but not pixel-exact.
- **AV `t=` boundaries** (AV-1…4) are provisional — a human must **listen-confirm** track `04-f18v` before finalising ranges (`02` §3 risk: track-content unverified by ear). The three-readings prose holds regardless of exact boundaries.
- **f18v as 11th object** raises the selection from 10→11 folios; the `exhibits.json` description ("Five folios…") is already stale and must be rewritten at build to "Eleven folios… read through three rival interpretations" (or similar) — flag for the publish step.
- **Cross-link 2 unresolved** by design (§5) — Phase 3 decision.
- **NC-license + Share-Alike** carry-over from `02` §3 (Kryptogramm is CC BY-NC-SA 3.0) is a build/legal gate, not an analysis gap; restated here so it isn't lost.
