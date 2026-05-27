# Voynich Manuscript — Manuscript Foundation (sourced)

**Exhibit subject:** Beinecke Rare Book & Manuscript Library, Yale University — **MS 408**, the Voynich Manuscript. Fully digitized, public domain, IIIF-native.

**Purpose of this doc:** the factual + sourcing spine for the rewrite. Every factual claim below carries an inline source marker. This is Phase 1 (foundation). Per-region note analysis is Phase 2; image download is Phase 4.

## Sources (cited inline by short tag)

- **[YALE-IIIF]** Beinecke MS 408 IIIF Presentation 3 manifest — `https://collections.library.yale.edu/manifests/2002046` (verified resolves, `type: Manifest`, IIIF Presentation API 3 context, 213 canvases; image services are IIIF Image API 2 `level2`). Catalog record: `https://collections.library.yale.edu/catalog/2002046`.
- **[WIKI]** "Voynich manuscript", Wikipedia (indexed 2026-05-26; source label `wikipedia-voynich`). Used for spine facts that Wikipedia in turn cites to primary/secondary literature (cite numbers preserved where load-bearing).
- **[ZAND]** René Zandbergen, *Voynich MS — Description of the MS*, `https://www.voynich.nu/descr.html` (indexed 2026-05-26; source label `voynich-nu-zandbergen`). The standard reference site by the leading Voynich researcher; used for codicology and the conventional section scheme (which Zandbergen traces Newbold → D'Imperio).
- **[ARIZONA-2009]** University of Arizona AMS radiocarbon dating (2009), reported via PhysOrg 2011-02-10 — cited through **[WIKI]** note [2].
- **[YORK-2014]** University of York parchment identification (2014) — cited through **[ZAND]** note (2).

> **Sourcing posture:** [WIKI] and [ZAND] are tertiary/secondary. Where a fact originates in primary literature (carbon date, parchment species, Currier's analysis), the originating authority is named so Phase 2 can promote to primary if desired. The IIIF manifest [YALE-IIIF] is primary and is the source of truth for every folio→image mapping in §3.

---

## 1. Factual spine

**Identity & dating.** MS 408 is a parchment codex in an unknown script, held at the Beinecke. **[WIKI]** In 2009 University of Arizona researchers AMS-radiocarbon-dated the vellum to **between 1404 and 1438**. **[ARIZONA-2009 via WIKI note 2]** McCrone Associates found the paints consistent with that period of European history; reports that the ink was dated are not supported by McCrone's official report. **[WIKI note 7]**

**Physical description.** Measures ≈ **23.5 × 16.2 × 5 cm** (Zandbergen: ≈ 225 × 160 mm, ~5 cm thick). **[WIKI] / [ZAND]** Written on **vellum** (calfskin — identified by a University of York team in 2014). **[ZAND note 2 — YORK-2014]** The text block survives as **102 folios** (≈ **240 pages**) in **18 quires/gatherings**; originally probably ~116 folios (272 pages) in 20 quires, of which ~14 folios / 2 quires are missing — so roughly **88% survives**. **[WIKI] / [ZAND]** Recto corners are foliated 1–116 in a later numeral style; quire marks (older numerals) run 1–20. Strong evidence exists that many bifolios were reordered over the manuscript's history; today's order is not the original. **[WIKI note 7/8] / [ZAND]** A number of folios are larger than standard and **fold out** (the source of the f67–f72 and f85–f86 multi-panel pages). **[ZAND]**

**Script — "Voynichese".** An elegant but otherwise unknown, apparently **alphabetic** script; no other document in the same script is known. Text runs left-to-right, top-to-bottom, in words separated by spaces, with a word-frequency distribution typical of natural language; some words occur throughout, others only once. Single words ("labels") appear next to illustration elements. **[ZAND]** The modern transcription standard is EVA (European Voynich Alphabet); paleographic work (Lisa Fagin Davis, 2020, *Manuscript Studies*) argues for multiple scribal hands. **[WIKI note 29/31]**

**Currier hands / "Languages" A and B.** Cryptanalyst **Prescott Currier** identified that the text is written in (at least) **two statistically distinct systems**, conventionally called **Currier Language A** and **Language B**, correlating with different scribal hands and with different sections of the manuscript (broadly, much of the herbal is "A"; the balneological/biological and "Language B" pages differ in character-frequency statistics). **[WIKI — Currier among the named WWI/WWII codebreakers] / [ZAND — two-system / multi-hand discussion]**
> *Sourcing note:* [WIKI]/[ZAND] confirm Currier and the multi-system/multi-hand fact; the explicit "Language A / Language B" labels and their per-section mapping are Currier's own (1976 seminar) and D'Imperio's *Elegant Enigma* (1978). Phase 2 should cite those primaries directly if Language A/B is foregrounded in a reading.

**Provenance chain.** Early provenance unknown, but text and illustration are characteristically European. **[WIKI]** First confirmed owner: **Georg Baresch**, 17th-c. Prague alchemist, who twice sent copied pages to **Athanasius Kircher** in Rome; passed to **Jan Marek Marci** (who sent it to Kircher, 1665/66, with the attribution-to-Rudolf-II letter); stored at the **Collegio Romano**; acquired by **Wilfrid Voynich** at Frascati in **1912**; later owned by **Ethel Voynich**, then **Hans P. Kraus**, who donated it to the **Beinecke (Yale)** in 1969. **[WIKI — Timeline of ownership]**

---

## 2. The real sections

Conventional division (Newbold → D'Imperio, summarized by **[ZAND]**; page counts and illustration detail from **[WIKI — Description > Illustrations]**). Folio ranges below are the long-established D'Imperio/Zandbergen conventional ranges; they are approximate because reordering and foldouts blur boundaries.

| Section | Approx. folios | Illustrations characterizing it |
|---|---|---|
| **Herbal / botanical** | ff. 1r–66v (largest block; some herbal also recurs near the end) | One (sometimes two) page-filling plant drawings per page with paragraphs of text that avoid the drawing; ~126 pages. None of the plants are unambiguously identifiable; some realistic, some apparently imaginary. **[WIKI] / [ZAND]** |
| **Astronomical / astrological** | ff. 67r–73v | Circular diagrams with Sun, Moon, stars; a 12-diagram **zodiac** series using conventional symbols (two fish = Pisces, bull = Taurus, crossbowman = Sagittarius). Each zodiac diagram surrounds ~30 mostly-nude female figures, each holding/tethered to a labelled star. Aquarius & Capricornus (the section's last two) are lost; Aries & Taurus are each split into paired diagrams of 15 women/15 stars. Several are foldouts. ~17 pages. **[WIKI]** |
| **Balneological / "biological"** | ff. 75r–84v | Dense continuous text interspersed with drawings of small nude female figures ("nymphs"), mostly immersed in or connected by networks of **tubes/pipes** carrying liquids; pools and basins. ~20 pages. **[WIKI] / [ZAND]** |
| **Cosmological** | ff. 85r–86v (incl. the multi-panel **Rosettes** foldout) | Circular/cosmological medallion diagrams; the famous **nine-medallion "Rosettes"** six-panel foldout (the largest spread in the MS), with castle-like and geographic-looking motifs connected by causeways. **[ZAND]** |
| **Pharmaceutical** | ff. 87r–102v | Rows of labelled **apothecary jars / containers** alongside isolated plant parts (roots, leaves) — many are cleaner copies of sketches from the herbal section. **[WIKI]** |
| **Recipes / "stars"** | ff. 103r–116v | Short text paragraphs each preceded by a **star** (or flower) in the left margin — hence "recipes" / "starred paragraphs"; almost no illustration otherwise. Ends at f116v, which bears later "extraneous" Latin-script marginalia. **[WIKI] / [ZAND]** |

---

## 3. Selected folios for the exhibit (deep-zoom showcase)

Each folio below was verified against the live IIIF manifest **[YALE-IIIF]**. Image services are IIIF Image API **level2** (`info.json` + arbitrary region/size requests confirmed 200 OK), so deep-zoom/OpenSeadragon tiling works directly from Yale — Phase 4 can download `full/full` masters or request tiles.

**URL construction (verified against [YALE-IIIF]):**
- Image service base: `https://collections.library.yale.edu/iiif/2/{imageId}`
- Full master image: `{base}/full/full/0/default.jpg`
- Sized/region (deep-zoom): `{base}/{region}/{size}/0/default.jpg`, e.g. `/full/1024,/0/default.jpg`
- `info.json`: `{base}/info.json`
- The `{imageId}` is the numeric canvas tail. Canvas URI: `https://collections.library.yale.edu/manifests/oid/2002046/canvas/{imageId}`.

| Folio (label) | Section | imageId | Native px (W×H) | Why it's a compelling showcase |
|---|---|---|---|---|
| **f1r** | Herbal | `1006076` | 2972×3766 | The manuscript's opening page — a single herbal plant + text, plus a faded erased ownership inscription in the top margin (provenance interest). Sets the visual grammar of the whole book. **[YALE-IIIF] / [WIKI]** |
| **f25v** | Herbal | `1006123` | 2863×3769 | A vivid, often-reproduced herbal plant with strong color — good for showing the "crude later coloring over earlier outline" point. **[YALE-IIIF] / [WIKI note 7]** |
| **f33v** | Herbal | `1006139` | 2871×3769 | A striking, near-fantastical herbal drawing; ideal deep-zoom subject for paint vs. ink layering. **[YALE-IIIF]** |
| **f67r** *(foldout part)* | Astronomical | `1006194` | 4972×3738 | Sun/Moon cosmo-astronomical circular diagrams; a foldout, so unusually wide — demonstrates the foldout mechanic and rewards deep zoom into the rings of star-labels. **[YALE-IIIF] / [WIKI]** |
| **f68r** *(foldout)* | Astronomical | `1006196` | 7993×3828 | A large foldout star-chart diagram (a "celestial"/Pleiades-like cluster among the famous astronomical pages); very high pixel width = excellent deep-zoom. **[YALE-IIIF] / [WIKI]** |
| **f75r** | Balneological | `1006208` | 2852×3759 | Classic "nymphs in tubes/pools" balneological page — the section's signature imagery; many small figures reward zoom. **[YALE-IIIF] / [WIKI]** |
| **f78r** | Balneological | `1006214` | 2793×3761 | The most-reproduced balneological page (Wikipedia uses a detail of its nymphs); networks of green tubes and bathing figures. **[YALE-IIIF] / [WIKI — "Detail of the nymphs on page 141; f78r"]** |
| **f85v and 86r (foldout)** | Cosmological | `1006231` | 7925×7268 | **The Rosettes** — the nine-medallion six-panel foldout, the single most famous and largest spread in the MS (~7925×7268 px). The marquee deep-zoom object: castles, causeways, cosmological medallions. **[YALE-IIIF] / [ZAND]** |
| **f99r** | Pharmaceutical | `1006246` | 2702×3765 | Rows of labelled apothecary jars + plant parts — the clearest example of the pharmaceutical visual type (Wikipedia illustrates the section with f99r). **[YALE-IIIF] / [WIKI — "Page 175; f99r, of the pharmaceutical section"]** |
| **f116v** | Recipes / final | `1006277` | 2686×3697 | The manuscript's last page, bearing the enigmatic later "extraneous" Latin marginalia — a strong closing object and a provenance/paleography talking point. **[YALE-IIIF] / [WIKI]** |

*(10 folios spanning all six sections. f67r and f85v–86r are foldouts; their multi-panel nature is itself an exhibit feature.)*

---

## 4. Interpretive frameworks (high level only — Phase 2 does per-region analysis)

Three competing readings of what Voynichese *is*. One sourced sentence each.

1. **Meaningful cipher / encoded text.** The text encodes real language via a cipher or steganographic scheme — the historical assumption of the professional cryptanalysts who studied it (Prescott Currier, William & Elizebeth Friedman, John Tiltman), none of whom succeeded in breaking it. **[WIKI — named codebreakers; "never demonstrably deciphered"]**

2. **Hoax / meaningless gibberish.** The text carries no real content; in 2003 computer scientist **Gordon Rugg** showed that Voynich-like text could be mechanically generated from tables of prefixes/stems/suffixes selected with a perforated overlay (a **Cardan grille**) — though critics note the grille predates the MS's carbon date by ~100 years and the resemblance may be superficial. **[WIKI — Hoax section]**

3. **Natural-language / abjad (under an invented alphabet).** The text is an actual natural language written plaintext in an invented alphabet — supported by statistical work showing the text is "mostly compatible with natural languages and incompatible with random texts" (Amancio et al. 2013; word-entropy ≈ that of English/Latin, Landini 2001), and exemplified by linguist **Stephen Bax**'s 2014 "provisional, partial decoding" proposing a Near-Eastern/Asian-language reading (abjad-like, using hieroglyph-decipherment techniques). **[WIKI — Natural language & Stephen Bax sections]**

> Phase 2 anchors specific Notes/regions to these frameworks. This doc deliberately stops at naming them.
