# UX copy audit — bucket: viewer

Scope: user-visible runtime copy in the VIEWER app (read-only published reader). Paths relative to repo root.

Conventions noted: sentence case for labels/buttons; copy hardcoded in components (no i18n). Em-dash / semicolon in short UI strings and decorative emoji are punctuation/voice tells per the product-copy skill.

## Domain / internal terms appearing in user-visible copy

| Term | Count | Sample surface |
|------|-------|----------------|
| library | many | "Open a library" (EmptyHall) |
| exhibit / Exhibit | many | "← Back to Exhibit" (Reader) |
| Notes / note | many | "Notes · {n}" (Reader) |
| Readings / Reading | several | "Readings" legend title (ReadingLegend) |
| Base | 1 | "Base" radio in legend (ReadingLegend) |
| Section / sections | several | "Narrative · {n} sections" (NarrativeReader) |
| Transcript | 2 | "Transcript · {n} lines" (MediaPlayer) |
| Local | 1 | "Local" badge on a working-store card (Gallery) |
| Studio working store | 1 | "...it lives in this browser's Studio working store..." (Gallery local-badge tooltip) |
| Object / objects | 1 | "Exhibit · {n} objects" (ObjectGrid) |
| Gallery | 1 | breadcrumb fallback label "Gallery" (ViewerShell) |
| HTTP | 1 | "Couldn't open the library (HTTP {status})." (published.ts) |
| .archie.zip | 2 | "Open the library's .archie.zip file..." (EmptyHall) |

## Fixes

| # | File | Line | Current | Issue | Proposed | Severity | Category |
|---|------|------|---------|-------|----------|----------|----------|
| 1 | apps/viewer/src/components/ViewerShell.svelte | 158 | `⚠ origin drift` | Internal jargon ("origin drift") shown to the reader; this is a publisher/config concept, not reader-facing. Emoji warning glyph. | `Site address mismatch` (or hide from non-author readers); drop the emoji or pair with accessible text | medium | internal-vocab |
| 2 | apps/viewer/src/components/ViewerShell.svelte | 158 | `title="This canonical build expects {expectedBase} — minted share/og/sitemap URLs are broken. Update archie.config.json and redeploy."` | Leaks "canonical build", "og", "sitemap", "minted", a config filename, and an em-dash. Aimed at a developer, surfaced to anyone. | `title="This site is being served from a different web address than it was published for, so share links and previews won't work. Re-publish from the address shown."` | high | internal-vocab |
| 3 | apps/viewer/src/components/ViewerShell.svelte | 189 | `Opening…` | Vague — what is opening? Acceptable but could orient. Low. | `Opening the library…` | low | vague-cta |
| 4 | apps/viewer/src/components/ViewerShell.svelte | 193 | `{errorMsg}` ("Could not reach the library." line 73) | Error states what happened but offers no next step. | `Couldn't reach the library. Check your connection and reload.` | medium | error-quality |
| 5 | apps/viewer/src/components/ViewerShell.svelte | 176 | `title={cPrev ? `Previous: ${cPrev.label}` : "No previous object"}` | "object" is internal glossary noun surfaced in a tooltip; reader sees "object". Colon in short string. | `title={cPrev ? `Previous: ${cPrev.label}` : "This is the first item"}` (terminology: settle Object→reader noun) | low | terminology |
| 6 | apps/viewer/src/components/ViewerShell.svelte | 178 | `title={cNext ? `Next: ${cNext.label}` : "No next object"}` | Same "object" leak as above. | `title={cNext ? `Next: ${cNext.label}` : "This is the last item"}` (terminology) | low | terminology |
| 7 | apps/viewer/src/components/ViewerShell.svelte | 175 | `aria-label="Objects in this exhibit"` | "Objects" internal noun in aria-label. | terminology: align with chosen reader-facing noun for Object | low | terminology |
| 8 | apps/viewer/src/components/ViewerShell.svelte | 62,87 | `"Couldn’t open that library."` / `"That library couldn’t be read."` | Two different strings for adjacent open failures; no next step. Inconsistent with EmptyHall's "That file isn't an Archie library." | Unify: `"That library couldn't be opened. Make sure it's an Archie .archie.zip file."` | medium | inconsistency |
| 9 | apps/viewer/src/components/EmptyHall.svelte | 51 | `Open a library` (h1) | Fine. "library" is the glossary term — confirm it's the reader-facing word (it is, per "Open another library"). | keep (terminology note only) | low | terminology |
| 10 | apps/viewer/src/components/EmptyHall.svelte | 53 | `You followed a link into a library that isn’t open here. Open its <code>.archie.zip</code> file to follow the link.` | `.archie.zip` is a filename, acceptable. Slightly wordy/repetitive ("follow the link" twice). | `You followed a link into a library that isn't open here. Open its .archie.zip file to continue.` | low | redundant |
| 11 | apps/viewer/src/components/EmptyHall.svelte | 55 | `Open the library’s <code>.archie.zip</code> file to read its exhibits — drag it onto the page, or choose it below.` | Em-dash in body lede (borderline — this is prose, not a short label, so lower severity). "below" is a directional ref. | `Open the library's .archie.zip file to read its exhibits. Drag it onto the page or use the button.` | low | directional |
| 12 | apps/viewer/src/components/EmptyHall.svelte | 56 | `Open a library…` (button) | Duplicates the h1 verbatim ("Open a library"). Two identical CTAs stacked. | Differentiate: button `Choose a file…` (heading carries the intent) | low | redundant |
| 13 | apps/viewer/src/components/EmptyHall.svelte | 57 | `⚠ {error}` | Emoji warning glyph prefixed to an alert string. | Drop the `⚠` glyph; let role="alert" + error styling carry it (or keep but ensure it's decorative) | low | punctuation |
| 14 | apps/viewer/src/components/EmptyHall.svelte | 62 | `Release to open the library` | Good. | keep | low | other |
| 15 | apps/viewer/src/components/Gallery.svelte | 12 | `"Exhibition gallery"` (fallback title) + line 17 eyebrow | "Exhibition gallery" vs glossary "Gallery" — fallback title differs from the eyebrow label "Exhibition gallery". Acceptable, but confirm the reader-facing name. | terminology: confirm "Exhibition gallery" vs "Gallery" | low | terminology |
| 16 | apps/viewer/src/components/Gallery.svelte | 24 | `No exhibits published yet.` | Empty state states the fact but doesn't guide. For a reader there may be no action; acceptable. | keep (or `No exhibits here yet.`) | low | empty-state |
| 17 | apps/viewer/src/components/Gallery.svelte | 32 | `title="Only you can see this — it lives in this browser's Studio working store. Publish puts it on the web."` | Leaks "Studio working store" (internal persistence term). Em-dash. | `title="Only you can see this — it's saved in this browser. Publish it to put it on the web."` → settle wording; remove "working store" | medium | internal-vocab |
| 18 | apps/viewer/src/components/Gallery.svelte | 32 | `Local` badge text | "Local" is an internal persistence-model word; reader may not parse it. (terminology) | terminology: confirm reader-facing badge word (e.g. "Only you" / "Private" / "Draft") | medium | terminology |
| 19 | apps/viewer/src/components/Reader.svelte | 115 | `← Back to Exhibit` | "Exhibit" Title-cased mid-label — breaks sentence-case convention ("Add map", "Edit note"). | `← Back to exhibit` | medium | terminology |
| 20 | apps/viewer/src/components/Reader.svelte | 119 | `← See all notes` | Good, matches voice. | keep | low | other |
| 21 | apps/viewer/src/components/Reader.svelte | 124 | `📍 {geoCoord}` with `title="Longitude / latitude"` | Pin emoji in reader copy. Title uses "Longitude / latitude" — fine. | Drop the 📍 emoji or replace with a quiet label; keep coords | low | punctuation |
| 22 | apps/viewer/src/components/Reader.svelte | 133 | `Notes · {annotations.length}` | "Notes" matches glossary. Middot separator is a stylistic eyebrow form, consistent across the app. | keep | low | other |
| 23 | apps/viewer/src/components/Reader.svelte | 136 | `No notes on this object yet.` | "object" internal noun in reader empty state; "yet" implies it may change, but this is a published read-only view (it won't). | `No notes on this image yet.` → terminology: reader noun for Object; consider dropping "yet" in read-only context | medium | terminology |
| 24 | apps/viewer/src/components/Reader.svelte | 142 | `Click a note or a marker on the image. Markers re-anchor as you pan/zoom; selecting one zooms to it (the full nav contract).` | "the full nav contract" is internal/dev jargon meaningless to a reader. Semicolon in UI hint. "Click" assumes mouse (touch readers). | `Select a note, or a marker on the image. Markers stay pinned as you pan and zoom, and selecting one zooms in.` | high | internal-vocab |
| 25 | apps/viewer/src/components/Reader.svelte | 148 | `<strong>Selected</strong> · {... || `${noteParts.media.length} media`}` | "Selected" label is terse but ok. `{n} media` reads oddly ("3 media"). | `{n} media items` / `{n} attachments` for the count fallback | low | other |
| 26 | apps/viewer/src/components/NarrativeReader.svelte | 111 | `Narrative · {n} {section/sections}` | "Narrative" is fine as a layout eyebrow; matches glossary "Section". Good pluralization. | keep | low | other |
| 27 | apps/viewer/src/components/NarrativeReader.svelte | 113 | `Read down the spine — the canvas travels to each section's focus{, moving between objects}.` | "spine", "canvas", "objects" are internal terms; em-dash. Reader-facing hint laden with model words. | `Read down the page — the view moves to each section's focus{, across the items}.` → terminology for canvas/object | medium | internal-vocab |
| 28 | apps/viewer/src/components/NarrativeReader.svelte | 130 | `aria-label="Close note"` | Good, specific. | keep | low | other |
| 29 | apps/viewer/src/components/NarrativeReader.svelte | 133 | `📍 {geoCoord}` `title="Longitude / latitude"` | Pin emoji (same as Reader). | Drop 📍 or replace with quiet text label | low | punctuation |
| 30 | apps/viewer/src/components/ExhibitView.svelte | 197 | `Loading the exhibit…` | Good. | keep | low | other |
| 31 | apps/viewer/src/components/ExhibitView.svelte | 77,199 | `"Could not load the exhibit."` | States what happened, no next step. Inconsistent verb with ViewerShell's "Could not reach the library." | `Couldn't load this exhibit. Reload to try again.` | medium | error-quality |
| 32 | apps/viewer/src/components/ExhibitView.svelte | 247 | `You followed a link to this note` with seal `↪` and `Dismiss` | "↪" decorative glyph; copy itself is good. Inconsistent with EmptyHall's cold-arrival wording ("You followed a link into a library..."). | keep copy; ensure glyph is aria-hidden; align tone with EmptyHall cold-arrival | low | inconsistency |
| 33 | apps/viewer/src/components/ObjectGrid.svelte | 34 | `Exhibit · {n} objects` | "objects" internal noun shown to reader. | terminology: reader noun for Object (e.g. "items", "works") | medium | terminology |
| 34 | apps/viewer/src/components/ObjectGrid.svelte | 42 | `No objects in this exhibit yet.` | "objects" leak + "yet" in read-only published view. | `Nothing in this exhibit yet.` → terminology | medium | terminology |
| 35 | apps/viewer/src/components/ObjectGrid.svelte | 49 | `couldn’t load this image` | Lowercase fragment, no leading cap — quiet by design but inconsistent with sentence-case labels and with MediaPlayer's full-sentence fallback. | `Couldn't load this image` | low | error-quality |
| 36 | apps/viewer/src/components/ObjectGrid.svelte | 56 | `{n} notes` | Always plural — "1 notes" when count is 1. | `{n} {n === 1 ? "note" : "notes"}` | low | other |
| 37 | apps/viewer/src/components/ReadingLegend.svelte | 21 | `Readings` (title) | Matches glossary "Reading". Good. | keep | low | other |
| 38 | apps/viewer/src/components/ReadingLegend.svelte | 22 | `aria-label="Readings of this source"` | "source" is a mild internal term; acceptable in aria. | terminology (low): "source" → "this image/exhibit" | low | terminology |
| 39 | apps/viewer/src/components/ReadingLegend.svelte | 24 | `Base` | "Base" / "base-only" is an internal term (unread/unlayered notes) flagged in the glossary as a leak risk. Reader sees a radio labeled "Base" with no explanation. | terminology: a reader-facing label for the base pass (e.g. "All notes" / "Everyone's notes" / "Overview") | high | terminology |
| 40 | apps/viewer/src/components/NoteMedia.svelte | 21 | `aria-label={`Open ${m.kind}`}` | `m.kind` is a code enum ("image"/"video"/"audio") interpolated into an aria-label — yields "Open image" (ok) but it's raw kind value, fragile. | `aria-label={`Open ${kindLabel(m.kind)}`}` mapping kind→reader word; verify "audio"/"video"/"image" read naturally | low | internal-vocab |
| 41 | apps/viewer/src/components/NoteMedia.svelte | 23 | `couldn’t load` | Lowercase fragment, terse. Consistent with ObjectGrid's lowercase but inconsistent with sentence-case convention. | `Couldn't load` (and align casing decision across all media fallbacks) | low | error-quality |
| 42 | apps/viewer/src/components/MediaPlayer.svelte | 81 | `This recording couldn’t be loaded — the file may be missing or in a format this browser can’t play.` | Em-dash in a (longish) error; "format this browser can't play" is decent user-terms. Borderline length ok. | `This recording couldn't be loaded. The file may be missing, or its format isn't supported by this browser.` | low | punctuation |
| 43 | apps/viewer/src/components/MediaPlayer.svelte | 93 | `Now playing` | Fine. | keep | low | other |
| 44 | apps/viewer/src/components/MediaPlayer.svelte | 122 | `Transcript · {cues.length} lines` | Always "lines" — "1 lines" when count is 1. | `{n} {n === 1 ? "line" : "lines"}` | low | other |
| 45 | apps/viewer/src/components/MediaPlayer.svelte | 124 | `Read down the transcript — the recording travels to each line. The line now playing is inked.` | Em-dash. "is inked" is design jargon (refers to ink color) — a reader won't know "inked" means highlighted. | `Read down the transcript and the recording moves to each line. The line now playing is highlighted.` | medium | internal-vocab |
| 46 | apps/viewer/src/components/MediaPlayer.svelte | 127 | `No transcript for this recording.` | Clear. | keep | low | other |
| 47 | apps/viewer/src/components/MediaPlayer.svelte | 154 | `Where the notes fall in the recording` (tl-label) | Clear and nicely plain. | keep | low | other |
| 48 | apps/viewer/src/components/MediaPlayer.svelte | 111-112 | `title={`${fmt(start)} · ${c.text}`}` / `aria-label={`Note at ${fmt(start)}: ${c.text}`}` | Good. | keep | low | other |
| 49 | apps/viewer/src/components/NoteLightbox.svelte | 35 | `aria-label="Note"` | Dialog labeled just "Note" — terse but ok. | keep (or "Note detail") | low | other |
| 50 | apps/viewer/src/components/NoteLightbox.svelte | 51 | `♪ Audio` | Musical-note emoji + "Audio". | `Audio` (drop the ♪ glyph or mark it aria-hidden) | low | punctuation |
| 51 | apps/viewer/src/components/Credit.svelte | 14 | `?? "Attribution"` (creditLabel fallback) | "Attribution" is fine, standard. | keep | low | other |
| 52 | apps/viewer/src/components/Credit.svelte | 25 | `aria-label="About and rights"` `title="About & rights"` | aria-label uses "and", title uses "&" — inconsistent between the two on the same control. | Make consistent: both `About & rights` or both "About and rights" | low | inconsistency |
| 53 | apps/viewer/src/components/Credit.svelte | 29 | `License` (panel key) | Fine. | keep | low | other |
| 54 | apps/viewer/src/pages/index.astro | 25 | `<title>Archie</title>` | Bare brand title; no descriptor of the page. Acceptable for the landing gallery. | `The Archie Library` (matches og:title) for consistency | low | inconsistency |
| 55 | apps/viewer/src/pages/index.astro | 31 | `og:title "The Archie Library"` | Inconsistent with `<title>Archie</title>` on the same page. | Align <title> and og:title | low | inconsistency |
| 56 | apps/viewer/src/pages/index.astro | 28,32 | `description "A contested manuscript read more than one way — Beinecke MS 408..."` | Em-dash in meta description (prose, lower severity); "Beinecke MS 408" is fine. Sample-data marketing copy, demo-specific. | keep (demo content); note em-dash style | low | punctuation |
| 57 | apps/viewer/src/pages/voynich.astro | 20 | `<title>Voynich manuscript — Archie</title>` | Em-dash in title — but " — Archie" suffix is a conventional title separator; consistent across all pages. | keep (consistent pattern) | low | punctuation |
| 58 | apps/viewer/src/pages/voynich.astro | 23,27 | description with em-dashes + section list | Demo prose; em-dashes. Lower severity (long-form description, not a label). | keep (demo content) | low | punctuation |
| 59 | apps/viewer/src/pages/language-atlas.astro | 27 vs 32 | og:description differs from JSON-LD description | og:description ("...read two ways: a linguist's census, and what the quiet means...") differs from the JSON-LD description ("...annotated with a linguist's reading and a community reading."). | Align the two descriptions (or accept JSON-LD as a terser variant intentionally) | low | inconsistency |
| 60 | apps/viewer/src/published.ts | 164 | `throw new Error(\`Couldn't open the library (HTTP ${res.status}).\`)` | Raw HTTP status code leaked to the UI (this message reaches EmptyHall's error display via openError). | `throw new Error("Couldn't open the library. The link may be broken or the file unavailable.")` | high | error-quality |
| 61 | apps/viewer/src/published.ts | 166,168 | `throw new Error("That library is too large to open here.")` | Good, user-terms, no jargon. | keep | low | other |
| 62 | apps/viewer/src/published.ts | 209 | `throw new Error(\`${path}: HTTP ${res.status}\`)` | Raw "exhibits.json: HTTP 404" style — leaks filename + HTTP code. Reaches ExhibitView errorMsg → UI. | User-facing message should not carry the path/status; surface `"Couldn't load this exhibit."` to UI and keep technical detail in console only | high | error-quality |
| 63 | apps/viewer/src/og-image.ts | — | (no user-visible runtime strings) | URL/asset minting only; not reader-facing copy. | n/a | low | other |
| 64 | apps/viewer/src/published-base.ts | — | (no user-visible runtime strings) | Constants/IRIs only. | n/a | low | other |

## Open questions / terminology to settle (not resolved here)
- Reader-facing noun for **Object** (currently "object"/"objects" leaks in ObjectGrid, ViewerShell carousel tooltips, Reader empty state). Glossary says avoid Item/asset/hotspot — needs a decision.
- Reader-facing label for **Base** reading (legend radio). Glossary flags "base/base-only" as an internal leak.
- Reader-facing word for the **Local** badge (Gallery) and whether to expose "Studio working store" at all.
- Whether "canvas"/"spine" in NarrativeReader hint should be reader-facing or replaced.
- Casing decision for the broken-media fallbacks ("couldn't load this image" vs sentence case) — standardize across ObjectGrid, NoteMedia, MediaPlayer.
- Whether the origin-drift badge should render for ordinary readers at all, or only authors.
