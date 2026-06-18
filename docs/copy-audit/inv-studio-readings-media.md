# Copy audit — bucket: studio-readings-media

Scope: user-visible runtime copy only (labels, headings, placeholders, `title=`, `aria-label=`,
empty states, error/UI strings). Out of scope: comments, console logging, identifiers, CSS.

Convention enforced: sentence case; no blame; no oops/forced cheer; no raw internal vocab; specific
verb+object CTAs; consistent terminology vs the ARCHIE glossary and sibling strings.

Files audited:
- apps/studio/src/ReadingsRail.svelte
- apps/studio/src/ReadingsEditor.svelte
- apps/studio/src/ReadingsModal.svelte
- apps/studio/src/MediaPicker.svelte
- apps/studio/src/AvEditor.svelte
- apps/studio/src/AddMapModal.svelte
- apps/studio/src/CmdK.svelte
- apps/studio/src/ShortcutsHelp.svelte

## Fixes

| File | Line | Current | Issue | Proposed | Severity | Category |
|------|------|---------|-------|----------|----------|----------|
| apps/studio/src/AddMapModal.svelte | 154 | `Region shown — the map is bounded to this (ADR-0015)` | Internal design-doc reference "(ADR-0015)" leaked into a user-visible `<legend>`. Raw internal vocab. | `Region shown — the map is bounded to this` | high | internal-vocab |
| apps/studio/src/AvEditor.svelte | 331 | `Couldn't load audio (${wsError}) — an external URL may block decoding; import a local file.` | Interpolates the raw WaveSurfer/decode error (`wsError`) straight into UI — leaks library/technical text the curator can't act on. "decoding" is internal vocab; the em-dash + semicolon are punctuation tells for a short string. | `Couldn't load this audio. A file hosted elsewhere may block playback — try importing a local copy.` | high | error-quality |
| apps/studio/src/AvEditor.svelte | 326 | `Now annotating` | "annotating" is the avoided term; glossary says use "Note" not "Annotation" in UI. Sibling AV/image surfaces say "note". | `Adding notes to` (terminology call — align to whatever the team settles on for the "Note" verb) | medium | terminology |
| apps/studio/src/AvEditor.svelte | 312 | `aria-label="Annotation timeline — focus a bar, then ← → step between notes"` | "Annotation timeline" uses the avoided "Annotation" term; rest of the string already says "notes". Inconsistent within one string. | `aria-label="Notes timeline — focus a bar, then ← → step between notes"` | medium | terminology |
| apps/studio/src/AvEditor.svelte | 310-311 | `<!-- Annotation timeline (videojs affordance) ... -->` (comment) AND surrounding UI calls it the same | The visible track has no heading, but the only user-facing name for it ("Annotation timeline") sits in the aria-label (line 312) — keep that the single name and make it "Notes timeline" for consistency with line 322 "Notes you add appear here". | Use "Notes timeline" consistently. | low | inconsistency |
| apps/studio/src/AvEditor.svelte | 308 | `Marking a region — drag a box on the video` | Clear, but pairs awkwardly with the markbar toggle (line 344) which uses different wording for the same action ("Drawing… drag on the video" / "Draw a box on the video"). Two phrasings for one gesture. | Align both to one verb: `Drawing a box — drag on the video` | low | inconsistency |
| apps/studio/src/AvEditor.svelte | 344 | `title="Pause the video, then drag a box on it to mark WHERE on the picture — it pairs with the moment in time"` | "WHERE" shouted in caps reads like dev emphasis; "the picture" vs "the video" mixes nouns. | `title="Pause the video, then drag a box on it to mark where on the frame — it pairs with the moment in time."` | low | other |
| apps/studio/src/AvEditor.svelte | 346 | `title="Mark the START of this moment — then "Add note" ends it at the current time. Skip it to note just the current moment."` | "START" shouted in caps. Otherwise good plain language. | `title="Mark the start of this moment — then Add note ends it at the current time. Skip it to note just the current moment."` | low | other |
| apps/studio/src/AvEditor.svelte | 322 | `Notes you add appear here as bars on the timeline.` | Clean empty state but does not point to the primary action (how to add a note). Mildly decorative vs guiding. | `No notes yet. Mark a moment, then add a note — it appears here as a bar.` | low | empty-state |
| apps/studio/src/ReadingsRail.svelte | 32 | `title={`Show "${r.name}" notes (canvas and margin)`}` | "canvas" is internal vocab (the IIIF/render surface term) shown to the user. | `title={`Show "${r.name}" notes (on the image and in the margin)`}` | high | internal-vocab |
| apps/studio/src/ReadingsRail.svelte | 27 | `title="Two or more readings visible — marks show as outlines so colours never blend"` | Long em-dash tooltip; reads fine but "marks" is borderline jargon for the curator (sibling copy elsewhere says "notes"). | `title="Two or more readings are visible, so notes show as outlines and their colours stay distinct."` | low | terminology |
| apps/studio/src/ReadingsRail.svelte | 37 | `title={`New notes file into "${r.name}" — independent of what's visible`}` | "file into" is slightly opaque verbing; otherwise OK. | `title={`New notes go into "${r.name}", whatever is currently visible.`}` | low | other |
| apps/studio/src/ReadingsEditor.svelte | 55 | `title="Remove this reading — its notes stay, shown under "All notes""` | Good copy; nested straight quotes inside an em-dash title. Confirm "All notes" matches the actual label shown elsewhere (consistency check). | Keep wording; verify "All notes" is the exact sibling label. | low | inconsistency |
| apps/studio/src/ReadingsEditor.svelte | 57 | `placeholder="Describe this reading — one or two sentences, shown under its name in the published legend"` | Long placeholder with em-dash; placeholders should be short (they vanish on type). The "shown under its name…" guidance belongs in helper text, not the placeholder. | `placeholder="Describe this reading in a sentence or two"` (move the "shown in the published legend" note to visible help text) | low | redundant |
| apps/studio/src/ReadingsEditor.svelte | 63 | `placeholder="New reading — e.g. Cipher"` | Fine; em-dash in a short placeholder is the only nit and matches the modal's "Cipher" example, so it is consistent. | (no change needed; consistent with modal example) | low | punctuation |
| apps/studio/src/ReadingsModal.svelte | 28-32 | `A reading is one way of interpreting this source — a *Cipher* reading beside a *Hoax* reading. Rival readings sit side by side; they are never merged. ...` | Long-form prose with em-dash + semicolon. Acceptable in a teaching lede, but "never merged" hints at the internal merge/DAG model. Reads fine to a user. | Keep; optionally `Rival readings sit side by side and stay separate.` to avoid the merge framing. | low | other |
| apps/studio/src/MediaPicker.svelte | 57 | `Nothing to show here yet — add media to this exhibit, or use ⌘K to cite by text.` | Strong empty state. "media" is fine; verify "add media" matches the actual add-media affordance label for consistency. | Keep; confirm the add-media CTA wording matches. | low | inconsistency |
| apps/studio/src/MediaPicker.svelte | 73 | `Click a tile to cite it · or press <kbd>esc</kbd> and use <kbd>⌘K</kbd> to cite by text` | "Click" is fine for a desktop authoring tool; consistent with CmdK hint idiom. No blame, specific verb+object. | (no change) | low | other |
| apps/studio/src/CmdK.svelte | 76 | `No notes or exhibits match — refine the text, or write the link by hand.` | Clear, no blame, gives next step. Em-dash only. | (no change) | low | other |
| apps/studio/src/CmdK.svelte | 94 | `↑↓ move · ↵ cite · the reference auto-resolves to its published URL when you publish` | "published URL" is user-facing and fine; "auto-resolves" is mild jargon but understandable in context. | Optionally: `the link resolves to its published address when you publish` | low | other |

## Notes / open questions

- ShortcutsHelp.svelte itself is clean. Its visible labels come from `apps/studio/src/shortcuts.ts`
  (the `SHORTCUTS[].label` strings), which is OUT of this bucket. Those labels are good curator voice;
  no fix needed there.
- The "Note" vs "Annotation" terminology decision is unresolved per the glossary. AvEditor still says
  "annotating"/"Annotation timeline"; flagged as `terminology`, not resolved here.
- British spelling ("colour") is consistent across the bucket — intentional, not a fix.
- AvEditor line 331 is the one true error-quality risk: it interpolates a raw library error into
  user-visible copy. High priority regardless of the terminology decision.
