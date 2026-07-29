<script lang="ts">
  // "Export a copy…" — the ARTIFACT half of the publish surface (Q-15).
  //
  // WHY THIS IS ITS OWN COMPONENT. The c367 wall answered two different questions in one column:
  // "where does my site live?" (a place that stays updated) and "give me a file of this shape" (an
  // artifact you hand someone). Those are different verbs with different follow-through, and
  // interleaving them is what made the wall unreadable. The site half is SetupFlow/PublishSheet; this
  // is everything you can walk away with as a file.
  //
  // Every row here routes to a handler that ALREADY EXISTED on the wall — this component moved the
  // choosing, not the doing. The sinks (publish-flows' downloadProjectZip / exportSelfContained /
  // writeToFolder / depositBag) are untouched.
  import { humanBytes } from "./archive-probe.js";
  import type { ArchiveProbe } from "./archive-probe.js";
  import { SINGLE_FILE_MAX_BYTES } from "./publish-flows.svelte.js";

  /** Stated in the row rather than discovered on refusal — the cap is a fact about the format, and
   *  the author can plan around it. ONE definition (publish-flows), never a copied literal. */
  const SINGLE_FILE_CAP_MB = Math.round(SINGLE_FILE_MAX_BYTES / (1024 * 1024));

  let {
    probe = null,
    canFolder = false,
    depositing = false,
    onzip,
    onsinglefile,
    onfolderviewer,
    ondeposit,
    onback,
  }: {
    /** What the library weighs, for the facts on each row. Null ⇒ facts are simply not shown; a row
     *  never invents a number. */
    probe?: ArchiveProbe | null;
    /** Whether this browser can write to a folder at all (folder-backend's `folderSinkSupported`). */
    canFolder?: boolean;
    /** True while the deposit bag is being built (the only row with a long in-place action). */
    depositing?: boolean;
    onzip: () => void;
    /** Absent ⇒ the host cannot build one, so the row is not offered at all (never a broken button). */
    onsinglefile?: () => void;
    onfolderviewer?: () => void;
    ondeposit?: () => void;
    onback: () => void;
  } = $props();

  /* WHY THE SINGLE-FILE ROW IS NEVER PRE-GREYED.
   *
   * The obvious move is to grey it once the library is past the export's cap. It was written that
   * way and the drive caught it: the only size a probe has is the PUBLISHED tree's
   * (`tiers.archival.publishedBytes`, which includes tiles and derivatives), while the guard measures
   * RAW ASSET BYTES on disk (`publish-flows` estimateLibraryBytes). The published figure is the
   * larger one, so the row greyed for a fixture the guard would have accepted — a refusal the author
   * could not act on and could not appeal.
   *
   * `probe.folder.mediaBytes` is closer but still not the same set (it counts media the guard skips).
   * Two measures that disagree is exactly how a greyed row comes to contradict the guard behind it,
   * so this row stays ENABLED and the export's own guard answers with its own number. Its refusal
   * names this row's sibling — "export the folder with the reader built in" — so the author lands on
   * the route that works rather than on a dead end (R6).
   *
   * The folder row IS greyed, and that is not the same call: `canFolder` is a capability
   * (`folderSinkSupported()`), not an estimate. It cannot be wrong about itself.
   */
  const totalBytes = $derived(probe?.tiers?.archival?.publishedBytes ?? null);
</script>

<header>
  <p class="eyebrow">Export</p>
  <h2>Export a copy</h2>
  <p class="lede">A file you keep or hand to someone. None of these changes where your library is published.</p>
</header>

<div class="rows">
  <!-- The working copy. First because it is the only one that carries your ORIGINAL files, which is
       what "a copy of my work" usually means. -->
  <button type="button" class="x-btn" data-export="zip" onclick={onzip}>
    <span class="x-title">A working copy — one <code>.archie.zip</code></span>
    <span class="x-desc">The whole library plus your original files, in one file you can keep, send, or open again in Archie.</span>
    {#if totalBytes !== null}<span class="x-facts">about {humanBytes(totalBytes)}</span>{/if}
  </button>

  <!-- THE VIEWABLE PAIR — one thing in two sizes, deliberately adjacent. Both carry the same reader
       (Archie-e09d deduped them onto one bundle); they differ only in whether it comes back as a file
       you double-click or a folder you serve. Presenting them apart is how an author who hits the
       single-file size refusal concludes Archie simply cannot do it. -->
  {#if onsinglefile || onfolderviewer}
    <div class="pair">
      <p class="p-head">A copy someone can read — the library and a reader together</p>
      {#if onsinglefile}
        <button type="button" class="x-btn" data-export="single-file" data-available="true" onclick={onsinglefile}>
          <span class="x-title">One <code>.html</code> file</span>
          <span class="x-desc">Opens by double-click — no server, no account, no internet. Best for a USB stick or an attachment. Search isn't in it. Past about {SINGLE_FILE_CAP_MB} MB Archie will point you at the folder below instead.</span>
        </button>
      {/if}
      {#if onfolderviewer}
        <button type="button" class="x-btn" class:unavailable={!canFolder} data-export="folder-viewer"
          data-available={canFolder} disabled={!canFolder} onclick={onfolderviewer}>
          <span class="x-title">A folder with the reader built in</span>
          <span class="x-desc">The finished site, written to a folder you pick, carrying its own reader. No size limit. Put it on any web host or hand over the whole folder.</span>
          {#if !canFolder}
            <span class="x-reason">Not available in this browser — writing to a folder needs the desktop app or Chrome.</span>
          {/if}
        </button>
      {/if}
    </div>
  {/if}

  {#if ondeposit}
    <button type="button" class="x-btn" data-export="deposit" disabled={depositing} onclick={ondeposit}>
      <span class="x-title">{depositing ? "Building the deposit copy…" : "A deposit copy for a repository"}</span>
      <span class="x-desc">Every published file with a checksum beside it, in the BagIt layout repositories ask for. What you hand an archive when they need to prove nothing changed.</span>
    </button>
  {/if}
</div>

<div class="actions">
  <button type="button" class="ghost" onclick={onback}>← Back</button>
</div>

<style>
  /* Tokens match Publish.svelte's paper surface — this component draws inside that scrim. */
  .rows { display: flex; flex-direction: column; gap: var(--space-3); }
  .pair { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--border-paper); border-radius: var(--radius-md); }
  .p-head { font-family: var(--font-ui); font-size: 0.68rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-muted); margin: 0; }
  .x-btn { display: flex; flex-direction: column; gap: var(--space-1); text-align: left; cursor: pointer; padding: var(--space-3) var(--space-4); background: transparent; border: 1px solid var(--border-paper); border-radius: var(--radius-md); }
  .x-btn:hover:not(:disabled) { background: var(--surface-paper-hover); }
  .x-btn:disabled { cursor: default; }
  /* Unavailable stays VISIBLE and QUIET — muted, never red, never shouting (spec LD5). The reason is
     the row's own sentence, so an author who cannot take a route still learns what it was. */
  .x-btn.unavailable { opacity: 0.6; }
  .x-title { font-family: var(--font-display); font-size: 1rem; color: var(--ink-paper-primary); }
  .x-desc { font-family: var(--font-body); font-size: 0.82rem; line-height: 1.5; color: var(--ink-paper-secondary); }
  .x-facts { font-family: var(--font-ui); font-size: 0.75rem; color: var(--ink-paper-muted); }
  .x-reason { font-family: var(--font-body); font-size: 0.8rem; line-height: 1.45; color: var(--ink-paper-muted); }
  .actions { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-4); }
</style>
