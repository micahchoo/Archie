# UX audit — Studio wireframes (2026-07-18)

Source: wireframes on tldraw board `archie-studio-wireframes`, derived from the real
markup (App.svelte view switch, LibraryHome, ExhibitOverview, editor branch, modal
mounts). Each finding names the surface, the weakness, and the principle it strains.
Numbers (W1…) match the ⚠ callout boxes on the board.

## Global / navigation model

- **W1 — No addressable navigation.** One `view` state variable, no router, no URLs.
  Browser back, refresh, deep-linking, and "send a colleague this object" all break;
  the only way back is the in-app `←` buttons. *(User control; recognition of place.)*
- **W2 — Unpredictable hierarchy.** Library → Overview → Editor, but single-object
  exhibits silently skip Overview. The same click ("open exhibit") lands users on
  different screens, and the editor's back button changes meaning ("← Overview" vs
  "← Exhibits"). Users can't form a stable spatial model. *(Consistency.)*
- **W3 — Same editor, three affordances.** DetailsEditor is reached via ⓘ chips
  (library/exhibit headers), ✎ pencils (cards, plates, rows), and accordion "Detail"
  panels — three icons for one action, and ⓘ conventionally means "read about",
  not "edit". *(Consistency; match to convention.)*
- **W4 — Surface stacking.** Drawers, scrimmed modals, popovers, floating rails, and
  banners can coexist. Focus order, escape behavior, and z-priority among a pinned
  inspector + readings rail + toast + writer-lock banner are undefined in the UI
  expression. *(Modality discipline; a11y.)*

## Screen 1 — Library Home

- **W5 — Storage plumbing in the primary bar.** "Where the library lives"
  (browser vs folder), a dirty dot, and save errors sit above the content. This
  exposes the OPFS/FSA implementation as the user's second-most-prominent concern,
  and the tiny dirty dot is a weak signifier for the app's highest-stakes state
  (unsaved work). *(Match system to real world; visibility of critical state.)*
- **W6 — Three ingestion paths buried in one grid cell.** "New exhibit" = title
  input + hidden folder input + IIIF via `window.prompt`. A raw prompt gives no
  validation, no preview, no paste help — for the flow that onboards every new
  user. First-run success hinges on the weakest control in the app. *(Error
  prevention; onboarding.)*
- **W7 — Mode-dependent search.** The Exhibits/All-images toggle silently changes
  what the adjacent search box searches (only the placeholder changes). Easy to
  search the wrong corpus without noticing. *(Visibility of system status.)*
- **W8 — Templates mixed with user work.** "Example" exhibits sit in the same grid
  as the user's own; the "keep a copy" guard only appears later, inside the editor
  (playground banner). Clutter now, surprise later. *(Recognition; error prevention.)*

## Screen 2 — Exhibit Overview

- **W9 — Spatial canvas fights the ordered model.** The tableau lets users pan,
  zoom, marquee, and drag plates anywhere, but the domain object is a *reading
  order* (numbered). Two orderings are visible at once — spatial position and the
  order badge — and it's unclear whether dragging re-orders or just re-arranges.
  High interaction cost (zoom cluster, legend, fit) for collections of ~10 items.
  List mode already serves the real task. *(Match to task; minimalism.)*
  **CORRECTION (2026-07-18, resolved as seeds Archie-a9fc):** the core claim was
  wrong — reading the component shows plates are laid out *in* reading order
  (position derives from order, they can't disagree), plate-drag *is* a real
  reorder, and drag is deliberately disabled under sort/filter. What survives of
  W9 is the chrome tax (zoom cluster, permanent legend, hints) and the cost of
  maintaining two modes. Decision: keep both modes, canvas primary, trim chrome.
- **W10 — Destructive bulk actions live in the sort toolbar.** "Select" morphs the
  search/sort row into "N selected · Remove N · Clear". Remove sits beside Size
  and Sort; the two-step confirm is the only guard. *(Error prevention; grouping.)*
- **W11 — Narrative is read-only here, editable elsewhere.** The spine strip
  invites ("＋ Start the narrative") but editing requires entering the editor of
  some object — the overview is where the whole-exhibit story is visible, yet it
  can't be edited there. *(Task/tool locality.)*
  **RESOLUTION NOTE (2026-07-18, seeds Archie-da38):** the read-only overview
  spine is a decided design (ADR-0016 §56 — beats are camera+prose, authored on
  the canvas), not an oversight. Upheld; the friction is addressed with
  beat-level deep links from spine rows instead of a second authoring surface.
- **W12 — Density slider at top level.** "Size" is a rarely-touched preference
  occupying permanent toolbar space. *(Minimalism.)*

## Screen 3 — Annotation Editor

- **W13 — Occlusion economy.** Readings rail (top-right), note popover, mode
  banners, and toasts all float *over* the image being annotated — the artifact is
  the thing the floating chrome hides. *(Content primacy.)*
- **W14 — The note form has two homes.** Same NoteEditor floats (popover) or docks
  (inspector), toggled by ⤢/⤡ glyphs. Position whiplash mid-task, and the pin
  affordance is a cryptic arrow with no label. *(Consistency; recognition over
  recall.)*
- **W15 — Mixed scopes in one accordion.** Narrative (exhibit-wide) stacks above
  Notes / To place / Detail (object-local) with no visual scope boundary. Editing
  the wrong level is one panel away, and "which object do these notes belong to"
  depends on rail state above. *(Structure mirrors model.)*
- **W16 — Three parallel navigation schemes.** Object rail filmstrip, narrative
  section "Go to" buttons, and reading order all navigate objects differently.
  *(One model per task.)*
- **W17 — Scattered creation verbs.** "+ Media / + Map" (rail), "▭ ⬠ ▣" note
  buttons (panel), "＋ Add a section" (narrative), add-media plate (overview) — no
  unified add model; each has its own placement and grammar. *(Consistency.)*
- **W18 — Glyphs carry load-bearing meaning.** ⠿ ⤢ ⬠ ▭ ▣ ¶ ⌘K appear without
  labels; "¶ Cite ⌘K" is the only entry to the citation flow. Power-user
  affordances are the *only* affordances. *(Recognition over recall; discoverability.)*
- **W19 — Ambiguous save semantics.** "Saved ✓" indicator *and* a Save button
  coexist — if state is saved, what does the button do? Plus a separate
  "Save to disk" concept on the Library screen. Two save vocabularies. *(Status clarity.)*

## Modals & flows

- **W20 — Nested modality in the cite flow.** CmdK opens MediaPicker (image tab):
  modal-over-modal, each with its own dismissal. *(Modality discipline.)*
- **W21 — Publish is a three-surface chain.** Button → PublishDialog → wizard →
  leave the app for device-code auth → return. Each hop is a drop-off point; the
  wizard's error/finish-on-github branches put failure recovery outside the app.
  *(Flow continuity.)*
- **W22 — Help is fragmented and non-contextual.** HelpMenu → tutorial (iframe
  deck) or shortcuts sheet; no in-context help at the moment of confusion (e.g.
  first time in framing mode, first To-place worklist). *(Help & documentation.)*
- **W23 — Collaboration UI is unreachable.** A collab toast exists on Library, and
  a writer-lock banner in the shell, but IdentityPrompt and MergeReview are built
  and unmounted — conflicts have no resolution surface. Either wire them or remove
  the collab signals that promise them. *(No dead ends.)*

## Accessibility cross-cut

- **W24 — Drag-first interactions without visible keyboard equivalents**: plate
  dragging, marquee select, popover drag-grip, list ⠿ handles. Reorder exists via
  ▲/▼ only in NarrativeEditor. Readings are identified by colour swatch alone
  (W25 — colour-only coding). Studio already carries 11 standing a11y warnings.

## If I could fix only five

1. W6 — replace the New-exhibit cell with a proper create/import surface (first-run).
2. W1/W2 — routable views + never skip Overview (stable mental model).
3. W13/W14 — one docked note editor; stop floating chrome over the artifact.
4. W15/W16 — split exhibit-scope from object-scope UI; pick one object-nav scheme.
5. W19/W5 — one save vocabulary with one prominent state indicator.
