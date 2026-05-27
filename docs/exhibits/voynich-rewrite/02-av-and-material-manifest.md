# Voynich Rewrite — AV Asset + Consolidated Material Manifest

**Wave 1, Agent B.** Date: 2026-05-27. Status: research complete, recommendation made, pending human review gate (see `HANDOFF.md`).
**Governing principle:** content-first; every asset cites a source + license. Prior art for the AV shape is the **already-published `av` exhibit** ("A Field Recording from Bidar", `apps/viewer/public/published/av/`) — a `Sound` canvas (`audio/mpeg`) with `t=start,end` FragmentSelector annotations per stanza (verified: `canvas/o1/annotations.json` carries `t=0,20`, `t=20,50`, …). The Voynich AV object follows that data shape (WADM `Sound`/`Video` target + `t=` selector per ADR-0006) but must be **shape-distinct in content** so it demonstrates something the existing `av` exhibit does not.

---

## 1. AV object candidates

All candidates sourced from the Internet Archive (license is explicit per-item; verified via `archive.org/metadata/<id>`). Wikimedia Commons `Category:Voynich manuscript` holds **no** audio/video — only images + a 209-page PDF — so it is not an AV source. YouTube's standard license is non-reusable and was excluded; the only CC-marked IA "movies" items mirrored from YouTube were verified individually.

| # | Title / asset | Source URL | Length | Format | License (verbatim) | Demonstrates (via `t=` notes) |
|---|---|---|---|---|---|---|
| **1 ★** | **Kryptogramm — track `04-f18v`** (Elias Schwerdtfeger). Mechanical speech-synthesis of the manuscript's text; tracks are named for real folios (`04-f18v` = folio 18v) and Voynichese classifications (`05-currier-language-a` = Currier "Language A"). | https://archive.org/details/kryptogramm — media: `https://archive.org/download/kryptogramm/04-f18v.mp3` (also `.ogg`) | 4:57 (296.96s) | VBR MP3 + Ogg Vorbis (`audio/mpeg`, `audio/ogg`) | `http://creativecommons.org/licenses/by-nc-sa/3.0/` (CC BY-NC-SA 3.0) | Sonified Voynichese as time-anchored *evidence* in the cipher / hoax / natural-language debate: notes anchored at `t=` ranges argue "this stretch sounds language-like / sounds like gibberish." Track name ties it to a specific folio → harmonizes with Agent A's folio selection. |
| 2 | **"Decoding the Voynich Manuscript — Tête-à-Tête with MS 408"** (Alisa Gladyseva), promo documentary. | https://archive.org/details/voynich_manuscript_alisa_gladyseva — media: `.../voynich_manuscript_alisa_gladyseva.mp4` (also `.ogv`) | 1:41 (101.01s) | MPEG4 480×360 + Ogg Video (`video/mp4`, `video/ogg`) | `https://creativecommons.org/licenses/by-nc-nd/4.0/` (CC BY-NC-ND 4.0) | Chapter-anchored argument: `t=` ranges segment the documentary's claims (provenance, sections, decipherment attempts). Distinct from `bidar/av`'s line-transcript shape. Also exercises the **`Video`** spatio-temporal path (ADR-0006) the `Sound` exhibit doesn't. |
| 3 | **m1dy — "Voynich Tracks"** (gabber/hardstyle album). | https://archive.org/details/m1dy-voynich-tracks | per-track 3–6 min | VBR MP3 | `https://creativecommons.org/publicdomain/zero/1.0/` (CC0 — public domain) | **Listed for completeness only — do not use.** Cleanest license, but tracks ("Cherish", "Criminal") are only thematically named; no manuscript content. Off-topic. |

### Recommendation: **Candidate 1 — Kryptogramm, track `04-f18v`** (CC BY-NC-SA 3.0)

Why this one wins on the discriminating constraint (does the `t=` feature get *demonstrated*, not just mentioned):
- **Conceptually exact.** It literally turns the undeciphered text *into sound* and asks "can you understand it?" — that *is* the exhibit's cipher/natural-language thesis, made audible. Time-anchored notes become interpretive evidence, the highest-value use of the AV feature.
- **Folio-linked.** Track is named for folio 18v (and sibling `05-currier-language-a` for a real Voynichese dialect class), so the AV object cross-references the image folios Agent A selects — not a free-floating clip.
- **Length supports the feature.** ~5 min holds several distinct `t=` annotations + a guided tour; the 1:41 documentary (Candidate 2) would feel contrived past 3–4 notes.
- **License permits derivatives** (SA), unlike Candidate 2's ND — no defensive "we did not modify" copy needed; trim/segment is allowed under share-alike.
- **Use the most-clearly-Voynichese track.** `04-f18v` or `05-currier-language-a` (both folio/dialect-named) over the album's `01-intro` — the intro may be conventional album music with no sonified text. License is identical across all tracks. **A human should listen-confirm the chosen track before build** (I sourced metadata, not audio).

**Alternate:** Candidate 2 (Gladyseva documentary). If NC turns out to block (see §3), an unmodified, attributed embed of a BY-NC-ND scholarly documentary is the next-cleanest option *and* it exercises the `Video` selector path. Keep it on the bench, not as primary — too short to demo the feature richly.

---

## 2. Consolidated new-material manifest

| Asset class | Specific item | Source | License | Status / owner |
|---|---|---|---|---|
| **Folio images** (deep-zoom OSD objects) | ~6–10 real Beinecke MS 408 folios spanning the manuscript's sections (herbal, astronomical, balneological, cosmological, pharmaceutical, recipes). **Selection is Agent A's — see `01-manuscript-foundation.md`; not duplicated here.** | Beinecke Rare Book & Manuscript Library, Yale (MS 408); IIIF service per Agent A's doc | **Public domain** (Yale releases MS 408 as PD; matches the library blurb already in `apps/viewer/public/published/exhibits.json`) | Sourced by Agent A → `01-manuscript-foundation.md` |
| **AV object** | Kryptogramm track `04-f18v` (sonified folio 18v) — §1 recommendation | Internet Archive `archive.org/details/kryptogramm` | **CC BY-NC-SA 3.0** | Recommended (this doc). Human listen-confirm + re-host (§3) before build. |
| **Text / scholarship — captions & section prose** | Factual spine for object captions and section descriptions | Yale Beinecke catalog page for MS 408; René Zandbergen, *voynich.nu* (the standard reference site); Mary D'Imperio, *The Voynich Manuscript: An Elegant Enigma* (NSA, 1978 — public domain US-gov work); Clemens (ed.), *The Voynich Manuscript* (Yale UP facsimile, 2016) | Mixed — cite per use; D'Imperio is PD; Zandbergen/Yale are prose *sources* (facts not copyrightable, paraphrase) | To author in Phase 2 (Analysis). Cross-check with Agent A's spine. |
| **Text / scholarship — the 3 readings** (cipher / hoax / natural-language) | Three rival interpretive frameworks over the same regions (ADR-0007 readings) | Cipher: William F. Friedman / Reeds transcription work (IA `jimreedsfriedman`); Hoax: Gordon Rugg's grille/Cardan-grille hypothesis (peer-reviewed papers); Natural-language: Stephen Bax's partial-decipherment + Currier "Language A/B" dialect classification | Underlying *ideas* are citable scholarship; quote sparingly, attribute. No asset to license — these are sourced prose positions. | To author in Phase 2. |
| **Reusable as-is — cross-exhibit link target** | `bidar` exhibit ("Techno-Futures from Bidar"), already published with stable IDs (`https://archie.demo/bidar/...`). ⌘K `archie://` cross-link target. | `apps/viewer/public/published/bidar/` (in-repo) | n/a — already published, owned | **No new material.** Link only. |
| **(Context) existing `av` exhibit** | "A Field Recording from Bidar" — the AV-feature precedent the Voynich AV object must out-distinguish | `apps/viewer/public/published/av/` (in-repo) | n/a — already published | No new material; reference for AV data shape only. |

---

## 3. Risks / gaps

- **NC license compatibility (Candidate 1 & 2 are both `-NC-`).** Both the recommended Kryptogramm and the alternate Gladyseva clip are **non-commercial-only**. This is fine **only if Archie itself stays non-commercial** (open-source, no paid tier, no ads). **Assumption stated for the reviewer to confirm or veto.** If Archie goes commercial, the exhibit-content layer being NC is arguably still defensible (the AV is *exhibit content*, not the product) — but this must be an explicit decision, not buried. **If NC is rejected outright, the only clean CC0/PD AV found is m1dy (off-topic music) — meaning the honest fallback is to *commission/record* a short bespoke AV asset (e.g. a recorded reading of a Voynichese transcription, or a narrated section walkthrough), not ship an off-topic or unclear-license pick.**
- **Share-Alike reach onto annotation bodies (Candidate 1).** CC BY-NC-SA's SA *could* be argued to attach to time-anchored notes authored *about* the audio. The conservative/standard read is that annotations are independent commentary, not a derivative of the recording — but flag it; if uncomfortable, Candidate 2 (ND, no SA) sidesteps it (at the cost of no-derivatives).
- **Track-content unverified by ear.** I sourced IA *metadata* (track names, durations, formats, licenses) — I did **not** listen. `04-f18v` is named for a folio and the album description states the audio is mechanically generated from a Voynich transcription, so the inference is strong; still, a human should listen-confirm the chosen track actually contains the sonification before build.
- **Hosting / stable URL.** The existing `av` asset is hosted on `one.compost.digital`. The new AV asset needs a stable URL for the published manifest. Either re-host the IA file on `one.compost.digital` (clean, controllable) or hot-link `archive.org/download/...` (simpler, but IA URLs and availability can drift). **Re-hosting is recommended** — and CC BY-NC-SA permits it with attribution. Not a selection blocker; a build-phase task.
- **Folio image IIIF specifics deferred to Agent A.** This doc deliberately does not duplicate folio selection or IIIF endpoints — that is `01-manuscript-foundation.md`'s scope (which may not yet exist at this doc's write time; forward-referenced by filename per dispatch instructions).
- **Scholarship sources are prose, not licensed assets.** The Phase-2 readings/captions draw on Zandbergen, D'Imperio, Friedman/Reeds, Rugg, Bax, Currier. Facts aren't copyrightable; paraphrase + attribute, quote sparingly. No licensing blocker, but cite each claim per Archie's "cite prior art for every decision" rule.
