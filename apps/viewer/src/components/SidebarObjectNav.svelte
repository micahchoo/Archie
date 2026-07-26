<script lang="ts">
  // Sidebar bottom footer: the way UP, pinned to the foot of a reader sidebar for multi-object exhibits.
  //
  // It USED to also hold the object stepper (R4: annomea shipped stepping keyboard-only/invisible —
  // Prior Art 07 "surface stepping visibly" — and this surfaced it). Archie-01a6 moved that stepper to
  // the canvas chrome and this is why: a stepper living inside the COLLAPSIBLE aside disappears with it,
  // and the gap it left had already been filled by a stepper growing inside the note card, which stepped
  // objects from inside a note (V65). Stepping is still visible — more visible, in fact, since the canvas
  // nav survives collapse — it is simply anchored to the canvas it acts on. Keeping a second copy here
  // would put two object steppers in view at once, which is the disagreement V23 measured, not its fix.
  //
  // What every host still gets is the thing the canvas chrome does NOT carry: the step UP to the object
  // overview. The stepper is now OPT-IN, and the condition for opting in is precise: **a surface with no
  // canvas chrome to put it in.** `MediaPlayer` is that surface — an AV object has a waveform and a
  // transcript, not an OSD canvas, so 01a6's "put it where the thing it navigates lives" has nowhere
  // else to land there and removing it would strand an AV reader mid-exhibit. `Reader` passes only
  // `onoverview`, because its canvas nav is the object stepper and a second one in the aside is exactly
  // the duplication V23 measured.
  //
  // A NOTE ON WHAT 01a6 DID AND DID NOT CHANGE HERE, because an earlier version of this comment got it
  // wrong: this component's two channels never disagreed. Its visible `.pos` already read "Object 2 of
  // 12" (via `positionLabel`) and its buttons already announced "Previous object: <label>". The V65
  // channel disagreement was `NotePopup`'s `np-stepper`, which showed a bare "2 / 12" while announcing
  // the noun — and that component is deleted, not relabelled. What changed here is the FORM (the
  // literal "Prev"/"Next" words became arrows; see the markup) and the SOURCE of the wording (now
  // `product-copy`, shared with the canvas nav, so the two steppers cannot drift apart).
  //
  // Pure presentational: the host (ExhibitView, via the reader component) owns navigation.
  import { navPosition, navRegionName, navStepName } from "../product-copy.js";

  let { siblings, currentId, onstep, onoverview }: {
    /** Opt into the stepper: supply all three. Omit them for a host whose canvas chrome carries it. */
    siblings?: { id: string; label: string }[];
    currentId?: string;
    onstep?: (id: string) => void;
    onoverview: () => void;
  } = $props();

  const stepper = $derived(!!siblings && siblings.length > 1 && !!currentId && !!onstep);
  const idx = $derived(siblings ? siblings.findIndex((s) => s.id === currentId) : -1);
  const prev = $derived(siblings && idx > 0 ? siblings[idx - 1] : undefined);
  const next = $derived(siblings && idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : undefined);
</script>

<!-- LANDMARKS HERE ARE A DECISION, NOT AN OVERSIGHT. Measured on the built bundle: "Back to Exhibit"
     has NO `<nav>` ancestor on either path — image or AV — and that is intended. Written out because
     it looks like a regression from base and is not, and because two reviewers and a coordinator each
     read it wrong before it was measured.
     Base (85c8ba5:24) made this component's ROOT `<nav aria-label="Objects in this exhibit">`, with the
     stepper a plain `<div>` inside it. That was right when this was the only object nav. Archie-01a6
     moved the stepper to the canvas chrome, and the NAME went with the control: `.canvas-nav` carries
     "Objects in this exhibit" in both readers, in both sidebar states.
     So restoring base's shape would not restore anything — it would put TWO landmarks with the SAME
     accessible name in the Reader, and a screen-reader user rotoring by landmark would have to visit
     both to learn which one steps objects. Base did not have that problem; base had no canvas nav.
     Base was also arguably wrong in a smaller way this replaces: it wrapped escape-out AND stepping in
     one landmark named for stepping only. The split names each thing for what it is.
     What is left unwrapped is a single "Back to Exhibit" link. A landmark around one link is rotor
     noise, and the way up is ALREADY inside a landmark — ViewerShell's `nav[aria-label="Breadcrumb"]`,
     whose exhibit crumb performs the same reset. That is asserted in e2e/object-nav.spec.ts, so the
     claim "it is covered elsewhere" is gated rather than assumed.
     If a future change decides escape-out does deserve its own landmark, give it its OWN name — never
     "Objects in this exhibit", which is spoken for.
     The AV path is the exception, below: with no canvas chrome there, the stepper in this footer IS
     that surface's object nav, so it takes the `<nav>` and the name — and is the only one there. -->
<div class="object-nav">
  <!-- "Back to Exhibit" is the LOCKED canonical term for returning to the object overview (system.md
       Archie-dba2 / Archie-2cc1: action-named, not the category-named "All objects") — matches the
       breadcrumb + the Reader's exhibit-back so one phrase means "go up a level" everywhere. -->
  <button type="button" class="overview" onclick={onoverview}>
    <span class="mark" aria-hidden="true">▦</span>Back to Exhibit
  </button>
  {#if stepper && siblings}
    <!-- FORM: `‹  Object 2 of 12  ›` — arrows only, the noun carried by the position label between
         them. This is 01a6 item 3's specified form, adopted here rather than argued around, so the
         viewer has ONE stepper form across both surfaces (the canvas-chrome nav in Reader and
         NarrativeReader renders the identical shape).
         It is also what the corpus does at both sizes, which is what killed the "words read better in
         a roomy bar" case: universalviewer's paging header is a full-width persistent bar and its
         prev/next are still ICON-ONLY — `PagingHeaderPanel.ts:99-105` builds
         `<button class="btn imageBtn prev" title="Previous Image">` with the words in a `.sr-only`
         span and an icon in view — beside its visible `Image [3] of 40`. Mirador's compact canvas
         overlay is likewise icon-only. Nobody in the corpus renders "Prev"/"Next" as visible words.
         The words are not lost, they moved channel: `navStepName` puts them in `aria-label` AND
         `title`, and unlike the old literals it names the DESTINATION ("Previous object: f11r"),
         which a bare "Prev" never did. -->
    <!-- The landmark lives HERE, on the opt-in path only. On that path (MediaPlayer) there is no
         canvas chrome and so no `.canvas-nav`, which makes this the surface's only object nav — it
         should be findable by landmark, under the same name every other object nav uses. On the
         opted-out path this block does not render, so the Reader never gets a second one. -->
    <nav class="stepper" aria-label={navRegionName("object")}>
      <button type="button" class="step" disabled={!prev}
        onclick={() => { if (prev) onstep?.(prev.id); }}
        aria-label={navStepName("object", "prev", prev?.label)}
        title={navStepName("object", "prev", prev?.label)}><span aria-hidden="true">‹</span></button>
      <span class="pos">{idx >= 0 ? navPosition(idx, siblings.length, "object") : `– of ${siblings.length}`}</span>
      <button type="button" class="step" disabled={!next}
        onclick={() => { if (next) onstep?.(next.id); }}
        aria-label={navStepName("object", "next", next?.label)}
        title={navStepName("object", "next", next?.label)}><span aria-hidden="true">›</span></button>
    </nav>
  {/if}
</div>

<style>
  /* Pinned to the foot of the (scrolling) sidebar via sticky — content scrolls UNDER it, so the nav is
     always reachable without scrolling to the end. Negative margins bleed it full-width across the
     aside's padding and flush to its bottom edge; the paper fill + hairline rule set it off from the
     list above (the sibling of the list's own warm-paper cards). */
  .object-nav {
    position: sticky; bottom: 0; z-index: 1;
    margin: var(--space-5) calc(-1 * var(--space-5)) calc(-1 * var(--space-6));
    padding: var(--space-3) var(--space-5) var(--space-4);
    display: flex; flex-direction: column; gap: var(--space-2);
    background: var(--surface-paper);
    border-top: 1px solid var(--border-canvas);
  }
  /* "All objects" — quiet mono label (the way back to the overview), connector-blue on hover. */
  .overview {
    display: inline-flex; align-items: center; gap: var(--space-2); align-self: start;
    background: none; border: none; padding: var(--space-1) 0; cursor: pointer;
    font-family: var(--font-ui), monospace; font-size: var(--text-ui-xs); font-weight: 500;
    letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-secondary);
    transition: color 160ms ease;
  }
  .overview:hover { color: var(--accent-2); }
  .overview .mark { font-size: 0.95rem; line-height: 1; color: var(--ink-paper-muted); transition: color 160ms ease; }
  .overview:hover .mark { color: var(--accent-2); }

  /* ‹ · Object N of M · › — the opt-in stepper (canvas-less hosts only, see the header). Dropping the
     "Prev"/"Next" words shrinks the buttons' ink, so the hit target is set explicitly rather than left
     to a glyph's own box (Fitts) — the same 28px floor the canvas nav uses. The position reads in
     tabular numerals so it doesn't reflow as it changes. */
  .stepper { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
  .step {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 28px; min-height: 28px;
    background: none; border: none; padding: 0; cursor: pointer;
    border-radius: var(--radius-sm);
    color: var(--ink-paper-secondary); transition: color 160ms ease;
  }
  .step:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 1px; }
  .step span[aria-hidden] { font-size: 1.05rem; line-height: 1; }
  .step:hover:not(:disabled) { color: var(--accent-2); }
  .step:disabled { opacity: 0.32; cursor: default; }
  .pos {
    font-family: var(--font-ui), sans-serif; font-variant-numeric: tabular-nums;
    font-size: var(--text-ui-sm); letter-spacing: 0.04em; color: var(--ink-paper-muted);
    white-space: nowrap;
  }
</style>
