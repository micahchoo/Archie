# New-exhibit create/import surface prototype

Throwaway HTML/CSS/JS mockup for **Archie-8482** (W6): today's new-exhibit tile in
`apps/studio/src/LibraryHome.svelte` crams three ingestion paths into one grid cell — a title
field, a hidden `webkitdirectory` input behind "… or add a media folder", and a IIIF import behind
`window.prompt("Paste a IIIF manifest link")` with no validation or preview before the fetch. This
prototype proposes one entry point ("+ New exhibit") that opens a proper three-path chooser with
real validation and preview, in two layout variants. No build step — open `index.html` directly in
a browser. Sample library cards and the IIIF/folder mock data are hardcoded in `app.js`; nothing
here talks to the real app, `sd`, or the network (the IIIF "fetch" is a canned pattern-matcher, not
a real request — see below).

## Decided contracts this embodies

- **Archie-389f** (single-scrim invariant + dismissal contract) — Variant A is the *only* scrimmed
  surface: selecting a path expands it **in place** inside the same dialog rather than opening a
  second dialog on top (no modal-over-modal). Esc closes the dialog; scrim-click closes it; a
  `‹ Back` link returns from an expanded path to the three-card chooser without closing anything.
  Variant B never scrims at all — it's an inline grid expansion, so its dismissal (Esc, or a click
  outside the tile) is the closest floater-like equivalent, not a literal application of the
  scrimmed-surface rule.
- **Archie-3e0a** (one details affordance) — not directly exercised here (this surface *creates*
  exhibits; it doesn't edit an existing one's details), but the pencil/Details convention on the
  library cards behind the dialog is left untouched, so this prototype doesn't introduce a fourth
  affordance for anything details-shaped.
- **This surface is also where Archie-beb6 ("one grammar for adding things") will eventually point
  a future `+Media`** — that ticket is blocked on Archie-8482 and explicitly scopes "the decided
  create surface" as a dependency. Nothing here builds the add-to-an-existing-exhibit case (see
  question 5 below), but the three-path-chooser shape is deliberately generic enough that a later
  "add to this exhibit" entry point could reuse the same folder/IIIF path forms.

## The two variants

Toggle with the **A / B** switch in the dashed prototype-controls header (that switch, and the
"jump to state" demo buttons beside it, are tooling for this review — not part of the proposed
surface).

**Variant A — scrimmed dialog.** The "+ New exhibit" tile is a single trigger; clicking it opens a
centered dialog (same scrim/close-button visual language as `PropsDrawer.svelte`, but centered
rather than a right-edge drawer, since this is a creation chooser rather than a field editor for an
existing thing). Three path cards fill the dialog; picking one swaps the dialog body for that
path's form. Advantage: focus is unambiguous — the grid behind it is inert, and the dialog has room
to breathe for the IIIF preview card. Cost: it's one more click-and-wait than editing in place, and
a scrim over the whole library for what's often just "type a title and go."

**Variant B — inline grid expansion.** The same "+ New exhibit" tile expands in place
(`grid-column: 1 / -1`), pushing the rest of the grid down; no scrim, the library stays fully
interactive around it. Advantage: cheaper-feeling for the common "start empty" case, and the
grid context (existing exhibit titles) stays visible while naming a new one. Cost: no focus trap —
a stray click on an existing exhibit card while the folder dropzone is active would both navigate
away *and* abandon the in-progress import, and the reflow shifts every card below it.

Both variants share the same three-path-chooser and path-form markup and behavior — only the
container (dialog vs. tile) and its dismissal differ.

### The three paths

- **Start empty** — a title field, nothing else. Matches today's default flow with better visual
  weight than a form crammed into a grid cell.
- **From a media folder** — a real drop zone (drag a folder in; this prototype actually walks
  `DataTransferItem.webkitGetAsEntry()` and counts real files) or a `webkitdirectory` file picker,
  same as the app uses today. Once picked, a summary card shows the count by kind ("42 images · 3
  audio · 0 video," mirroring the image/audio/video split `apps/studio/src/folder-import.ts`
  already computes) and prefills the title from the folder's name — editable. An empty-result
  folder (no importable media) shows an inline note and keeps the primary button disabled, per
  `folder-import.ts`'s `isImportableMedia` filter.
- **From a IIIF link** — a URL field that validates live as you type/paste (~500ms debounce, no
  explicit "check" button): a spinner state ("Checking that link…"), then either a green preview
  card (manifest label + canvas count, title prefilled from the label) or a plain-language error.
  Copy for two of the three error states is lifted verbatim from `apps/studio/src/iiif-import.ts`'s
  real `ManifestImportError` messages ("That URL didn't return a IIIF manifest.", "This is a IIIF
  Collection (a list of manifests). Paste the URL of a single manifest instead."); the unreachable-
  host case ("Couldn't reach that link — check the URL and try again.") is new copy for a case that
  module doesn't cover (it's fetch-free; the network failure happens in the caller). The three
  "try:" chips under the field, and the header's "jump to state" buttons, trigger each state
  deterministically for review — typing an arbitrary URL also works and falls into the generic
  "didn't return a manifest" bucket, since there's no real server to check against.

All three paths disable "Create exhibit" until valid (non-empty title; a folder with ≥1 importable
file; a IIIF link that resolved to a preview).

## What works

- Real drag-and-drop folder counting (recursive `webkitGetAsEntry` walk) and a real
  `webkitdirectory` file-picker fallback — not just the mocked "folder picked" demo state.
- Live, debounced IIIF validation with a genuine pending/spinner phase, keyed so a fast retype
  cancels the stale in-flight check.
- Esc and scrim-click close variant A; Esc and outside-click collapse variant B; `‹ Back` returns
  either variant from an expanded path to the chooser without losing the dialog/tile itself.
- "Create exhibit" clears the form, shows a confirmation toast, and returns to the idle "+" tile in
  both variants.
- Verified with a scripted Playwright pass driving both variants, all three IIIF outcomes, the
  folder-summary state, Esc dismissal, and outside-click collapse — zero console/page errors.

## Questions for you to react to

1. **Dialog vs. inline (A vs. B)** — does a "New exhibit" flow warrant locking the whole library
   behind a scrim, or is the inline reflow's loss of a focus trap an acceptable trade for staying
   in context? Does the answer change once folder drag-and-drop is in play (a slip while the grid
   is still live feels riskier)?
2. **Do the three paths need icons?** Right now they're plain monogram-style glyphs (+ / ⌸ / ⇲) —
   is that enough to scan at a glance, or does this need real iconography (a folder glyph, a IIIF
   "cube" mark) to read as three *different kinds* of action rather than three buttons in a row?
3. **Should the IIIF preview auto-start on paste**, as built, or should it wait for an explicit
   "Check link" action? Auto-start feels faster for the common case but means every keystroke of an
   in-progress URL briefly shows an error state before it's finished being typed.
4. **Where does "add to an EXISTING exhibit" relate to this surface?** This prototype only covers
   *creating* a new exhibit from a folder/IIIF link — Archie-beb6 ("one grammar for adding things")
   is blocked on this ticket specifically to reuse whatever shape gets decided here for adding
   media to an exhibit that already exists. Should that be the *same* three-path chooser (minus
   "start empty," since there's nothing to start), or a deliberately different, narrower surface?
5. **Folder grouping isn't surfaced here.** `folder-import.ts` can split one picked folder into
   *multiple* exhibits (one per first-level subfolder) — this prototype's summary always shows a
   single flat count, matching only the "loose files" case. Is multi-exhibit-from-one-folder a
   real path through this surface, or does it stay a bulk-import-only capability accessed
   elsewhere?
