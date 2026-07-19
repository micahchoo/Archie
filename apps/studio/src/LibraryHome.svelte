<script lang="ts">
  // Studio Library home (Q-7 "Library" — the authoring index). The curator's table of works in
  // progress: each exhibit is a plate on the dark light table; a dashed tile starts a new one.
  // Authoring counterpart to the Viewer's Gallery (which is the published, visitor-facing wall).
  //
  // The library HEADER mounts SafetyState (CONTEXT.md → Persistence; Archie-0b7b "one save vocabulary") —
  // the single shared save-state control, same slot the editor header mounts, answering "will my work
  // survive?" (Saved / Saving… / Action needed / Failed). It is the only save UI anywhere in this file.
  //
  // The PROJECT BAR (invention #3, CONTEXT three-configs persistence) sits below and answers a SEPARATE,
  // quieter question at the Library scale: WHERE does this library live? — only-in-this-browser (unbound)
  // vs a folder it autosaves to (Chromium) vs a .archie.zip file on disk. Capability is hidden; the user
  // sees only the place. Demoted to one line (Archie-2308): now that SafetyState carries all save state,
  // the bar states location only — Open/Close/Recents as quiet inline actions, no dots, no Save buttons.
  // Recents survive sessions (the non-Chromium re-open mitigation) behind a small disclosure, not a
  // permanent list; a lost binding is still surfaced on its own line, never silent.
  import type { ExhibitMeta } from "./store.js";
  import type { Binding, RecentProject, RightsFields } from "@render/core";
  import DetailsEditor from "./DetailsEditor.svelte";
  import PropsDrawer from "./PropsDrawer.svelte";
  import CreateExhibitDialog from "./CreateExhibitDialog.svelte";
  import HelpMenu from "./HelpMenu.svelte";
  import GalleryThumb from "./GalleryThumb.svelte";
  import GalleryWall from "./GalleryWall.svelte";
  import SafetyState from "./SafetyState.svelte";
  import { untrack } from "svelte";
  import { flattenLibraryImages, coverOf, filterExhibits, filterImages } from "./gallery-data.js";
  import { bindingLocationLabel, examplesDefaultOpen, partitionExhibits } from "./library-home.js";
  import { saveStatus } from "./save-queue.svelte.js";
  import { hasRealWorkIn } from "./safety-state.svelte.js";
  import { viewPrefs } from "./view-prefs.svelte.js";
  import { readDroppedFolderFiles } from "./folder-drop.js";

  let {
    exhibits,
    onopen,
    oncreate,
    oncreatefromfolder,
    oncreatefrommanifest,
    isTemplate,
    binding,
    bindingDirty,
    bindingBusy,
    bindingError,
    recents,
    onsave,
    onopenproject,
    onopenrecent,
    onforgetrecent,
    onclose,
    onrecover,
    ondismisserror,
    rights,
    onrights,
    libTitle,
    librarySummary,
    ontitle,
    onsummary,
    onpatchexhibit,
    onremoveexhibit,
    ontutorial,
    onshortcuts,
    onopenobject,
    gallerySearch = $bindable(""),
  }: {
    exhibits: ExhibitMeta[];
    onopen: (slug: string) => void;
    oncreate: (title: string) => void;
    /** A whole media folder (images, audio, video) becomes a new exhibit (contributor-broadening ① — Archie-e1d6).
     *  `title` (Archie-46bf) is the create dialog's optional editable-title override, passed through unchanged. */
    oncreatefromfolder: (files: File[], title?: string) => void;
    /** A pasted IIIF manifest URL becomes a new exhibit (contributor-broadening ② — Archie-bc01).
     *  `title` (Archie-46bf) is the create dialog's optional editable-title override, passed through unchanged. */
    oncreatefrommanifest: (url: string, title?: string) => void;
    /** Is this exhibit a bundled example (a template — playground, not saved)? Marks it in the grid. */
    isTemplate: (slug: string) => boolean;
    /** Where this library's canonical bytes live (unbound / folder / file). */
    binding: Binding;
    /** Unsaved-to-disk at the Library scale (only meaningful once bound). */
    bindingDirty: boolean;
    /** A Save/Open is in flight — disable the chrome. */
    bindingBusy: boolean;
    /** A bound location couldn't be reopened (lost-binding recovery), or null. */
    bindingError: string | null;
    recents: RecentProject[];
    onsave: () => void;
    onopenproject: () => void;
    onopenrecent: (r: RecentProject) => void;
    onforgetrecent: (r: RecentProject) => void;
    onclose: () => void;
    /** Recover from a lost binding: detach + save as a fresh project. */
    onrecover: () => void;
    ondismisserror: () => void;
    /** Library-level credit/license (rights grill Q6) — edited via the header → drawer. */
    rights: RightsFields;
    onrights: (next: RightsFields) => void;
    /** Library identity (Phase 4): title + description, editable in the same drawer. */
    libTitle?: string;
    librarySummary?: string;
    ontitle: (v: string) => void;
    onsummary: (v: string) => void;
    /** Per-card pencil CRUD (Archie-79be): patch any exhibit's metadata, or remove it, without opening it. */
    onpatchexhibit: (slug: string, fields: Partial<ExhibitMeta>) => void;
    onremoveexhibit: (slug: string) => void;
    /** Help menu actions (threaded from App): open the onboarding tutorial / the shortcuts cheat-sheet. */
    ontutorial: () => void;
    onshortcuts: () => void;
    /** All-images wall click-through (Phase 3.2): open an object in ITS exhibit's editor. App owns the
     *  cross-exhibit navigation (openExhibit → object → editor); this only signals which object. */
    onopenobject: (slug: string, objId: string) => void;
    // --- Transient screen state (ADR-0024 #6). The search text is bindable so App remembers it within the
    // session (the library is one place; App-level state survives this component's remount, resets on load).
    // (The Exhibits/All-images lens is a PERSISTED view preference owned elsewhere — not bindable here.) ---
    /** The shared search box text (filters the active view). */
    gallerySearch?: string;
  } = $props();

  let rightsOpen = $state(false);
  const hasRights = $derived(!!(rights.rights || rights.requiredStatement));
  // SafetyState's unbound "Action needed" input (CONTEXT.md — never for untouched seed/template content).
  // Archie-c76d (d): library-level meta edits (title/summary/credit) count as real work too, so binding an
  // unbound library that has only a title set is still surfaced as Action needed.
  const hasRealWork = $derived(hasRealWorkIn(exhibits, isTemplate, {
    ...(libTitle !== undefined ? { title: libTitle } : {}),
    ...(librarySummary !== undefined ? { summary: librarySummary } : {}),
    ...(rights.rights !== undefined ? { rights: rights.rights } : {}),
    ...(rights.requiredStatement !== undefined ? { requiredStatement: rights.requiredStatement } : {}),
  }));

  // Archie-2308: own exhibits + the New-exhibit cell lead the browsing grid; bundled Examples sit in their
  // own collapsible shelf below (pure split lives in library-home.ts, same reasoning as gallery-data.ts —
  // headless-testable, one definition). A typed search (below) renders one flat "Exhibits (n)" group
  // instead — splitting matches by shelf would fragment a query's results across two headers for no gain.
  const { own: ownExhibits, examples: exampleExhibits } = $derived(partitionExhibits(exhibits, isTemplate));
  // Seeded once from the pure predicate (library-home.ts) — expanded while the user owns nothing, so the
  // playground is what they see first. A later manual toggle is the user's own call from then on, never
  // silently re-decided by a render some unrelated prop change triggers — `untrack` says that on purpose
  // (else Svelte's state_referenced_locally check flags the intentional one-time read as a likely bug).
  let examplesOpen = $state(untrack(() => examplesDefaultOpen(exhibits.filter((e) => !isTemplate(e.slug)).length)));

  // Recents is a small disclosure now (Archie-2308), not a permanent list — collapsed by default.
  let recentsOpen = $state(false);

  // Unified search (Archie-2308): the box always filters BOTH corpora — filterExhibits/filterImages via
  // the shared matchesTitle primitive. The lens (below) governs BROWSING only, while the query is empty;
  // a non-empty query renders BOTH result groups regardless of lens (W7's silent scope switch eliminated —
  // Archie-2308 resolution), so the lens toggle itself is hidden while a search is live (nothing left for
  // it to govern). The lens is a persisted VIEW PREFERENCE (Archie-a9fc / CONTEXT.md Navigation § "View
  // preference") — last choice wins and survives app restarts, read through the same shared store as
  // ExhibitOverview's Canvas/List toggle. `gallerySearch` is a bindable prop (transient screen state,
  // ADR-0024 #6 — see $props above), never persisted. The wall reads the library LIVE (flatten OPFS meta)
  // — never the baked images.json (unpublished edits would make it stale).
  //
  // GUARD (code review, Archie-a9fc follow-up): persistence made "wall" reachable with nothing to show it —
  // on the pre-persistence base, galleryView reset to "exhibits" every mount, so a bound-but-empty library
  // (0 exhibits) could never land on "wall". Now the last-picked lens survives across libraries/restarts,
  // so a fresh/emptied library opened while "wall" is persisted would hide BOTH the gallery-bar toggle
  // (gated on exhibits.length > 0) AND the {:else} create-exhibit form (gated on galleryView !== "wall") —
  // stranding the user with no way back to "exhibits" or to create one. Read is guarded to fall back to
  // "exhibits" whenever there's no media to show ("wall" with nothing to browse is never a real choice);
  // writes still go to viewPrefs.setGalleryView unguarded, so the true preference is preserved for when
  // there IS something to show again. allImages.length > 0 implies exhibits.length > 0, so this single
  // check covers both the dead-end and the toggle-hidden case.
  const allImages = $derived(flattenLibraryImages(exhibits));
  const galleryView = $derived(allImages.length > 0 ? viewPrefs.galleryView : "exhibits");
  const shownExhibits = $derived(filterExhibits(exhibits, gallerySearch));
  const shownImages = $derived(filterImages(allImages, gallerySearch));
  // Unified search (Archie-2308): a non-empty query switches BOTH the bar (hides the now-moot lens) and
  // the body (renders both result groups) into "search results" mode, regardless of the persisted lens.
  const hasQuery = $derived(gallerySearch.trim() !== "");

  // The exhibit whose per-card pencil drawer is open (Archie-79be) — transient view state, like rightsOpen.
  // Resolves to its full ExhibitMeta so the shared DetailsEditor can read title/description/rights.
  let editingSlug = $state<string | null>(null);
  const editingExhibit = $derived(exhibits.find((e) => e.slug === editingSlug) ?? null);
  const rightsOf = (e: ExhibitMeta): RightsFields => ({
    ...(e.rights ? { rights: e.rights } : {}),
    ...(e.requiredStatement ? { requiredStatement: e.requiredStatement } : {}),
  });

  // The create/import dialog (Archie-51cc, decided by Archie-8482/Archie-beb6) — replaces the old
  // New-exhibit cell's cramped title-field/hidden-folder-input/window.prompt trio with ONE scrimmed
  // surface. `createPrefillFolder` carries a page-level folder drop's files straight into the
  // dialog's folder path (Variant B's grafted trait); openCreate() clears it for a plain button-open.
  let createOpen = $state(false);
  let createPrefillFolder = $state<File[] | null>(null);
  // Single-scrim invariant (CONTEXT.md → Surfaces): just open the dialog — the modality helper's
  // `presentScrim` REPLACES any open PropsDrawer on mount, so no opener hand-closes the other surface.
  // (Archie-5968: this is the ONE mechanism now; the old rightsOpen=false/editingSlug=null belt-and-
  // braces here — and the reverse createOpen=false on the drawer openers — were removed as redundant,
  // and dropping them is what lets a page-opened dialog return focus to the page, not the drawer's opener.)
  function openCreate(prefill: File[] | null = null) {
    createPrefillFolder = prefill;
    createOpen = true;
  }

  // Page-level folder drop (Archie-8482 "B's best trait grafted"): dropping a folder anywhere on
  // the Library scale opens the create dialog pre-populated on the folder path, skipping the
  // in-dialog dropzone step. Lives here (not App.svelte) — this is a Library-scale affordance, not
  // an editor one.
  let libraryDragOver = $state(false);
  async function onLibraryDrop(e: DragEvent) {
    e.preventDefault();
    libraryDragOver = false;
    const items = e.dataTransfer?.items;
    if (!items || items.length === 0) return;
    // The walker is itself per-entry tolerant (folder-drop.ts); this catch is the belt-and-braces
    // half (code review S1) — a rejection here must surface a plain-language message, not an
    // unhandled promise rejection and a silently dead drop.
    try {
      const files = await readDroppedFolderFiles(Array.from(items));
      if (files.length > 0) openCreate(files);
    } catch (err) {
      console.error("Folder drop failed", err);
      window.alert("Couldn't read that folder.");
    }
  }

  // A human "x ago" for a recent project's last-opened stamp.
  function ago(ms: number): string {
    const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return "just now";
    const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`;
    return `${Math.round(h / 24)} days ago`;
  }
</script>

<main
  class="library"
  class:drag-over={libraryDragOver}
  ondragover={(e) => { e.preventDefault(); libraryDragOver = true; }}
  ondragleave={(e) => { if (e.target === e.currentTarget) libraryDragOver = false; }}
  ondrop={onLibraryDrop}
>
  <header>
    <p class="eyebrow">Library · {exhibits.length} {exhibits.length === 1 ? "exhibit" : "exhibits"}</p>
    <div class="title-row">
      <h1>{libTitle && libTitle.trim() ? libTitle : "Library"}</h1>
      <div class="hdr-actions">
        <!-- The one save UI (CONTEXT.md → Persistence; Archie-0b7b) — inert text when Saved/Saving, the
             control itself when Action needed/Failed. Archie-2308: moved here from the project bar, the
             library HEADER's action row — the same slot the editor header mounts it in. -->
        <SafetyState
          saveHealth={saveStatus.health}
          bindingKind={binding.kind}
          {bindingDirty}
          {bindingBusy}
          {bindingError}
          {hasRealWork}
          onflush={onsave}
        />
        <!-- The ONE "Details" affordance (decision Archie-3e0a, ticket Archie-ebf4): word + ✎, never
             the retired ⓘ (which promised read-only info; this opens an editor). Title leads with
             "Details" per the copy rule, then names the scope it opens; aria-label mirrors it in the
             APG label-in-name shape (starts with the visible word, then names the library) so it reads
             distinctly from the per-card pencils' accessible names below. -->
        <button class="librights" class:set={hasRights} onclick={() => (rightsOpen = true)}
          title="Details — title, description, credit & license for the whole library"
          aria-label={`Details — ${libTitle && libTitle.trim() ? libTitle : "Library"}`}
          >✎ Details{#if hasRights}<span class="dot">●</span>{/if}</button>
        <HelpMenu {ontutorial} {onshortcuts} />
      </div>
    </div>
    <p class="lede">An exhibit is a collection of annotated media — images, audio, video, or maps you mark up with notes. Create one any time; your work saves as you go.</p>

    <PropsDrawer open={rightsOpen} title="Library details" onclose={() => (rightsOpen = false)}>
      <DetailsEditor title={libTitle ?? ""} summary={librarySummary ?? ""} rights={rights} scope="library" ontitle={ontitle} onsummary={onsummary} onrights={onrights} />
    </PropsDrawer>

    <!-- Per-card exhibit pencil drawer (Archie-79be): the shared DetailsEditor targeted at the picked card by
         slug. onremove threads removeExhibitById up to App; closing before removing avoids a stale-field flash. -->
    <PropsDrawer open={!!editingExhibit} title="Exhibit details" onclose={() => (editingSlug = null)}>
      {#if editingExhibit}
        <DetailsEditor
          title={editingExhibit.title}
          summary={editingExhibit.summary ?? ""}
          rights={rightsOf(editingExhibit)}
          scope="exhibit"
          ontitle={(v) => onpatchexhibit(editingExhibit!.slug, { title: v })}
          onsummary={(v) => onpatchexhibit(editingExhibit!.slug, { summary: v })}
          onrights={(next) => onpatchexhibit(editingExhibit!.slug, { rights: next.rights, requiredStatement: next.requiredStatement })}
          onremove={isTemplate(editingExhibit.slug)
            ? undefined
            : () => { const s = editingExhibit!.slug; editingSlug = null; onremoveexhibit(s); }}
        />
      {/if}
    </PropsDrawer>

    <!-- The create/import dialog (Archie-51cc) — its own scrimmed surface; see openCreate() above
         for the single-scrim handoff with the two PropsDrawers. Scope is fixed to "new-exhibit" here —
         the "add-to-exhibit" scope (Archie-56cf) is a separate instance, mounted globally by App.svelte. -->
    <CreateExhibitDialog
      open={createOpen}
      prefillFolderFiles={createPrefillFolder}
      {oncreate}
      {oncreatefromfolder}
      {oncreatefrommanifest}
      onclose={() => { createOpen = false; createPrefillFolder = null; }}
    />

    <!-- Project bar (Archie-2308): demoted to ONE quiet line — SafetyState above already carries every
         save-state word, so this only ever answers "where does this library live". -->
    <section class="projectbar">
      <p class="line">
        Living in {bindingLocationLabel(binding)}
        <span class="sep">·</span>
        <button class="link" onclick={onopenproject} disabled={bindingBusy}>Open a library…</button>
        {#if binding.kind !== "unbound"}
          <span class="sep">·</span>
          <button class="link" onclick={onclose} disabled={bindingBusy}
            title="Detach from disk — your work stays in this browser">Close</button>
        {/if}
        {#if recents.length > 0}
          <span class="sep">·</span>
          <button class="link" onclick={() => (recentsOpen = !recentsOpen)} aria-expanded={recentsOpen}>
            Recents <span aria-hidden="true">{recentsOpen ? "▴" : "▾"}</span>
          </button>
        {/if}
      </p>
      {#if saveStatus.health === "error"}
        <!-- Worklist 0.1 (loud saves): a failed write is never silent — the queue's last error, verbatim.
             SafetyState (header) already flips to "Failed"/"⚠ Retry save"; this is the one place the
             actual message text still surfaces. -->
        <p class="save-error" role="alert"><span aria-hidden="true">⚠</span> {saveStatus.error}</p>
      {/if}
    </section>

    {#if bindingError}
      <div class="binding-error" role="alert">
        <span class="msg">{bindingError}</span>
        <span class="err-actions">
          <button onclick={onopenproject} disabled={bindingBusy}>Open…</button>
          <button onclick={onrecover} disabled={bindingBusy}>Save as a new library</button>
          <button class="x" onclick={ondismisserror} aria-label="Dismiss">×</button>
        </span>
      </div>
    {/if}

    {#if recentsOpen && recents.length > 0}
      <section class="recents">
        <ul>
          {#each recents as r (r.id)}
            <li>
              <button class="recent" onclick={() => onopenrecent(r)} disabled={bindingBusy}>
                <span class="r-name">{r.name}</span>
                <span class="r-meta">{r.kind} · {ago(r.lastOpened)}{r.reopenable ? "" : " · re-pick to open"}</span>
              </button>
              <button class="forget" onclick={() => onforgetrecent(r)} aria-label="Forget {r.name}" title="Remove from recents">×</button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </header>

  <!-- Exhibit card + per-card pencil (Archie-79be), shared by every grid below (own shelf, Examples
       shelf, search results) so the three lists can never quietly drift apart. -->
  {#snippet exhibitCard(ex: ExhibitMeta)}
    {@const cover = coverOf(ex)}
    <li class="card-wrap">
      <button class="card" class:template={isTemplate(ex.slug)} onclick={() => onopen(ex.slug)}>
        {#if isTemplate(ex.slug)}<span class="badge">Example</span>{/if}
        {#if cover}
          <span class="cover"><GalleryThumb slug={cover.slug} source={cover.source} mediaType={cover.mediaType} alt="" /></span>
        {/if}
        <span class="title">{ex.title}</span>
        <span class="meta">{ex.objects.length} {ex.objects.length === 1 ? "media item" : "media items"} · /{ex.slug}</span>
        {#if isTemplate(ex.slug)}<span class="ex-hint">Explore freely — changes aren't kept. Keep a copy to make it yours.</span>{/if}
      </button>
      <!-- Per-card pencil (Archie-79be): edit this exhibit's title/description/credit + remove, without
           opening it. A SIBLING of the card button (no button-in-button); sits over the top-right corner.
           The ONE "Details" affordance (Archie-3e0a / Archie-ebf4): tight space, so pencil-alone, visible
           tooltip always "Details" for the uniform hover presentation — but the accessible name carries
           the per-item scope (APG label-in-name: starts with the visible word "Details", then the item),
           so screen-reader users tabbing a grid of cards can still tell them apart. -->
      <button class="edit-meta details-pencil" title="Details" aria-label={`Details — ${ex.title}`}
        onclick={() => (editingSlug = ex.slug)}>✎</button>
    </li>
  {/snippet}

  {#snippet newExhibitCell()}
    <li>
      <!-- ONE entry point (Archie-51cc/Archie-8482) — the old title-field/hidden-folder-input/
           window.prompt trio now lives entirely in CreateExhibitDialog, mounted once below. -->
      <button type="button" class="new" onclick={() => openCreate()}>
        <span class="plus" aria-hidden="true">+</span>
        <span class="label">New exhibit</span>
      </button>
    </li>
  {/snippet}

  <!-- Unified search bar (Archie-2308): always visible once there's any exhibit; the box always filters
       BOTH corpora. The Exhibits/All-images lens governs BROWSING only — hidden while a query is live,
       since search already shows both groups regardless of lens (nothing left for it to govern). -->
  {#if exhibits.length > 0}
    <div class="gallery-bar">
      {#if !hasQuery}
        <div class="views" role="group" aria-label="Library view">
          <button type="button" class:on={galleryView === "exhibits"} aria-pressed={galleryView === "exhibits"} onclick={() => viewPrefs.setGalleryView("exhibits")}>Exhibits</button>
          {#if allImages.length > 0}
            <button type="button" class:on={galleryView === "wall"} aria-pressed={galleryView === "wall"} onclick={() => viewPrefs.setGalleryView("wall")}>All images</button>
          {/if}
        </div>
      {/if}
      <label class="g-search">
        <span class="glass" aria-hidden="true">⌕</span>
        <input type="search" bind:value={gallerySearch}
          placeholder="Search your library"
          aria-label="Search exhibits and media" />
      </label>
    </div>
  {/if}

  {#if hasQuery}
    <!-- Unified search results (Archie-2308): both corpora, always, regardless of lens — the old silent
         scope switch (search only reaching the active view) is gone. -->
    <section class="results">
      <h2 class="group-head">Exhibits ({shownExhibits.length})</h2>
      {#if shownExhibits.length === 0}
        <p class="no-match">No exhibits match “{gallerySearch.trim()}”.</p>
      {:else}
        <ul class="grid">
          {#each shownExhibits as ex (ex.slug)}{@render exhibitCard(ex)}{/each}
        </ul>
      {/if}
      <h2 class="group-head">Media ({shownImages.length})</h2>
      <GalleryWall images={shownImages} query={gallerySearch} {onopenobject} />
    </section>
  {:else if galleryView === "wall"}
    <GalleryWall images={allImages} query="" {onopenobject} />
  {:else}
    <!-- Browsing (Archie-2308 item 4): the user's own exhibits + the New-exhibit cell lead the grid. -->
    <ul class="grid">
      {#each ownExhibits as ex (ex.slug)}{@render exhibitCard(ex)}{/each}
      {@render newExhibitCell()}
    </ul>

    {#if exampleExhibits.length > 0}
      <!-- Examples shelf (Archie-2308 item 4): a bundled playground, separated from the user's own work.
           Expanded while the user owns nothing (examplesDefaultOpen); collapses to this header line once
           they have their own exhibit to look at instead — still expandable any time. -->
      <section class="examples">
        <button type="button" class="examples-head" onclick={() => (examplesOpen = !examplesOpen)} aria-expanded={examplesOpen}>
          Examples ({exampleExhibits.length}) <span class="chevron" aria-hidden="true">{examplesOpen ? "▴" : "▾"}</span>
        </button>
        {#if examplesOpen}
          <p class="examples-contract">Explore how exhibits work — edits here aren't saved unless you keep a copy.</p>
          <ul class="grid">
            {#each exampleExhibits as ex (ex.slug)}{@render exhibitCard(ex)}{/each}
          </ul>
        {/if}
      </section>
    {/if}
  {/if}
</main>

<style>
  /* The curator's table — exhibits as warm paper plates on the gradient ground (Soft Static). */
  /* flex-shrink:0 — .library is a flex child of the fixed-height (.app { height:100vh }) shell. Without it,
     the flex parent clamps .library to the viewport, so a grid taller than the screen overflows the warm box
     and the last rows spill onto the fixed green ground. Keeping full content height makes the warm surface
     cover every row (solid warm page, no green bleed). */
  .library { min-height: 100vh; flex-shrink: 0; box-sizing: border-box; background: var(--surface-canvas); color: var(--ink-canvas-primary); padding: var(--space-12) var(--space-8); }
  header { max-width: 60rem; margin: 0 auto var(--space-10); }
  /* Eyebrow: the quiet tracked-mono signal-chrome (composes the global .eyebrow). */
  .eyebrow { color: var(--ink-canvas-muted); }
  .title-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-4); }
  .hdr-actions { display: inline-flex; align-items: center; gap: var(--space-2); flex: none; }
  .librights {
    flex: none; align-self: center; display: inline-flex; align-items: center; gap: var(--space-1);
    font-family: var(--font-ui); font-size: var(--text-ui-sm); text-transform: uppercase; letter-spacing: 0.14em; cursor: pointer;
    padding: var(--space-1) var(--space-3); border-radius: var(--radius-sm);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-secondary); border: 1px solid var(--border-canvas);
    transition: border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
  }
  .librights:hover { border-color: var(--border-canvas-emphasis); color: var(--ink-canvas-primary); box-shadow: var(--shadow-lift-low); }
  .librights.set { border-color: var(--border-canvas-emphasis); }
  .librights .dot { color: var(--accent); font-size: 0.55rem; }
  h1 { font-family: var(--font-display); font-weight: 300; font-size: 3rem; line-height: 1.1; margin: var(--space-2) 0 var(--space-3); color: var(--ink-canvas-primary); text-shadow: var(--shadow-text-haze); }
  .lede { font-family: var(--font-body); font-size: 1.25rem; line-height: 1.6; color: var(--ink-canvas-secondary); margin: 0; max-width: 42rem; }

  /* Project bar (Archie-2308): demoted to ONE quiet line — SafetyState (header, above) now carries every
     save-state word, so this line only ever answers "where does this library live", plus Open/Close/
     Recents as inline text actions. No card chrome, no button-scale prominence. */
  .projectbar { max-width: 60rem; margin: var(--space-4) auto 0; }
  .line { margin: 0; font-family: var(--font-body); font-size: 0.85rem; color: var(--ink-canvas-secondary); display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2); }
  .sep { color: var(--ink-canvas-muted); }
  .link {
    font-family: var(--font-ui); font-size: 0.8rem; font-weight: 600; letter-spacing: 0.02em;
    color: var(--ink-canvas-secondary); background: none; border: none; padding: 0; cursor: pointer;
    transition: color 160ms ease;
  }
  .link:hover:not(:disabled) { color: var(--ink-canvas-primary); text-decoration: underline; }
  .link:disabled { opacity: 0.5; cursor: default; text-decoration: none; }
  .save-error { margin: var(--space-2) 0 0; font-family: var(--font-ui); font-size: var(--text-ui-md, 0.75rem); color: var(--semantic-error); }

  /* Lost-binding recovery — warm warning (a missing folder is recoverable, not destructive). */
  .binding-error { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; margin-top: var(--space-3); padding: var(--space-3) var(--space-4); background: var(--surface-canvas-overlay); border-radius: var(--radius-md); box-shadow: var(--shadow-lift-low), inset 3px 0 0 var(--semantic-warning); }
  .binding-error .msg { font-family: var(--font-body); font-size: var(--text-ui-sm, 0.8125rem); color: var(--ink-canvas-primary); }
  .err-actions { display: flex; align-items: center; gap: var(--space-2); }
  .err-actions button { font-family: var(--font-ui); font-size: var(--text-ui-sm, 0.8125rem); letter-spacing: 0.02em; padding: var(--space-1) var(--space-3); cursor: pointer; background: var(--surface-canvas-raised); color: var(--ink-canvas-primary); border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); transition: background 160ms ease, box-shadow 160ms ease; }
  .err-actions button:hover { background: var(--surface-canvas-overlay); box-shadow: var(--shadow-lift-low); }
  .err-actions .x { border: none; background: none; font-size: 1rem; color: var(--ink-canvas-muted); padding: 0 var(--space-2); }
  .err-actions .x:hover { background: none; box-shadow: none; color: var(--ink-canvas-primary); }

  /* Recent libraries — a small disclosure now (Archie-2308), not a permanent list (CONTEXT mitigation:
     "metadata, not content" still applies to what's stored, just not to how much is always shown). */
  .recents { max-width: 60rem; margin: var(--space-2) auto 0; }
  .recents ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .recents li { display: flex; align-items: stretch; }
  .recent { display: flex; flex-direction: column; gap: 2px; text-align: left; cursor: pointer; padding: var(--space-2) var(--space-3); background: var(--surface-canvas-raised); border-radius: var(--radius-sm) 0 0 var(--radius-sm); box-shadow: var(--shadow-lift-low); transition: background 160ms ease, box-shadow 160ms ease; }
  .recent:hover:not(:disabled) { background: var(--surface-canvas-overlay); box-shadow: var(--shadow-lift-mid); }
  .recent:disabled { opacity: 0.5; cursor: default; }
  .r-name { font-family: var(--font-body); font-size: 0.8rem; color: var(--ink-canvas-primary); }
  .r-meta { font-family: var(--font-mono); font-size: var(--text-ui-xs, 0.7rem); color: var(--ink-canvas-secondary); }
  .forget { cursor: pointer; padding: 0 var(--space-2); background: var(--surface-canvas-raised); color: var(--ink-canvas-muted); border: none; border-radius: 0 var(--radius-sm) var(--radius-sm) 0; box-shadow: var(--shadow-lift-low); transition: color 160ms ease; }
  .forget:hover { color: var(--semantic-error); }

  .grid { list-style: none; margin: 0 auto; padding: 0; max-width: 60rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--space-5); }

  .card {
    display: flex; flex-direction: column; gap: var(--space-2); width: 100%; min-height: 7.5rem; cursor: pointer; text-align: left;
    padding: var(--space-5);
    background: var(--surface-canvas-raised); color: inherit;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
    transition: background 160ms ease, transform 160ms ease, box-shadow 160ms ease;
  }
  .card:hover { background: var(--surface-canvas-overlay); transform: translateY(-2px); box-shadow: var(--shadow-lift-mid); }
  /* Per-card pencil (Archie-79be): a quiet glyph button over the card's top-right corner. Faint at rest so
     the grid stays calm (and still visible on touch, where there's no hover), brightening on hover/focus. */
  .card-wrap { position: relative; }
  /* Position + idle-visibility only — the pencil's own look (size/color/border/shadow/hover/focus) is
     the shared .details-pencil (atmosphere.css), so it's identical to every other Details pencil. */
  .edit-meta {
    position: absolute; top: var(--space-3); right: var(--space-3); z-index: 1;
    opacity: 0.5;
  }
  .card-wrap:hover .edit-meta, .card-wrap:focus-within .edit-meta { opacity: 1; }
  .edit-meta:focus-visible { opacity: 1; }
  /* padding-right reserves the top-right pencil's gutter (--space-3 inset + ~1.85rem button) so a long title wraps before it. */
  .title { font-family: var(--font-display); font-size: 1.6rem; font-weight: 400; line-height: 1.15; color: var(--ink-canvas-primary); padding-right: calc(var(--space-3) + 1.85rem); }
  .meta { font-family: var(--font-mono); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-canvas-muted); }
  /* Example (template) marker — a soft warm dashed edge + quiet warning label (transient, not yours-yet). */
  .card.template { box-shadow: var(--shadow-lift-low), inset 0 0 0 1px var(--border-canvas-emphasis); }
  .badge { align-self: flex-start; font-family: var(--font-ui); font-size: 0.6rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--semantic-warning); border: 1px solid var(--semantic-warning); border-radius: var(--radius-sm); padding: 1px var(--space-2); }
  /* Example hint — teaches the consequence of the badge (transient; fork to keep). Quiet body voice, demoted from the gallery lede. */
  .ex-hint { font-family: var(--font-body); font-size: 0.78rem; line-height: 1.5; color: var(--ink-canvas-secondary); }

  /* New-exhibit tile (Archie-51cc) — ONE button that opens the create dialog; a soft dashed plate,
     same footprint as an exhibit card. Page-level folder drop (onLibraryDrop) highlights the whole
     .library surface (below), not just this tile — a drop anywhere on the Library scale works. */
  .new {
    display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start; justify-content: center;
    width: 100%; min-height: 7.5rem; box-sizing: border-box;
    padding: var(--space-5); text-align: left; cursor: pointer;
    background: none; border: 1px dashed var(--border-canvas-emphasis); border-radius: var(--radius-md);
    transition: border-color 160ms ease, background 160ms ease;
  }
  .new:hover, .new:focus-visible { border-color: var(--border-canvas-emphasis); background: var(--surface-canvas-overlay); }
  .plus { font-family: var(--font-display); font-weight: 300; font-size: 1.6rem; line-height: 1; color: var(--ink-canvas-muted); }
  .new .label { font-family: var(--font-body); font-size: 1rem; color: var(--ink-canvas-secondary); }

  /* Page-level folder drop (Archie-8482 "B's best trait grafted"): a folder dragged anywhere over
     the Library opens the create dialog pre-populated — this is the whole-surface affordance for it. */
  .library.drag-over { box-shadow: inset 0 0 0 2px var(--accent); background: var(--accent-muted); }

  /* --- Two-views-one-search bar (Phase 3.2): a quiet row between the header and the grid/wall. --- */
  .gallery-bar { max-width: 60rem; margin: 0 auto var(--space-5); display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }
  .views { display: inline-flex; border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); overflow: hidden; }
  .views button { font-family: var(--font-ui); font-size: var(--text-ui-sm); text-transform: uppercase; letter-spacing: 0.14em; cursor: pointer; padding: 6px var(--space-4); background: transparent; color: var(--ink-canvas-muted); border: none; transition: color 160ms ease, background 160ms ease; }
  .views button.on { background: var(--accent-muted); color: var(--ink-canvas-primary); box-shadow: inset 0 -2px 0 var(--accent); }
  .g-search { display: inline-flex; align-items: center; gap: var(--space-2); padding: 4px var(--space-3); background: var(--surface-canvas-raised); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); }
  .g-search .glass { color: var(--ink-canvas-muted); font-size: 0.9rem; }
  .g-search input { background: none; border: none; outline: none; color: var(--ink-canvas-primary); font-family: var(--font-ui); font-size: var(--text-ui-sm); width: 12rem; }
  .g-search input::placeholder { color: var(--ink-canvas-muted); }

  /* Card cover thumbnail (Phase 3.2) — a full-width plate above the title; the card becomes a real visual card. */
  .cover { display: block; width: 100%; margin-bottom: var(--space-1); }
  /* Filtered-to-nothing note (cards view) — quiet, above the grid (which still offers the new-exhibit tile). */
  .no-match { max-width: 60rem; margin: 0 auto var(--space-4); font-family: var(--font-body); font-size: 1rem; color: var(--ink-canvas-secondary); }

  /* Examples shelf (Archie-2308 item 4) — the bundled playground, visually separated below the user's own
     work: a plain disclosure header (not a card), expandable any time. */
  .examples { max-width: 60rem; margin: var(--space-10) auto 0; }
  .examples-head {
    display: inline-flex; align-items: center; gap: var(--space-2);
    font-family: var(--font-ui); font-size: var(--text-ui-sm, 0.8125rem); font-weight: 600;
    letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-canvas-secondary);
    background: none; border: none; padding: 0; cursor: pointer; transition: color 160ms ease;
  }
  .examples-head:hover { color: var(--ink-canvas-primary); }
  .chevron { font-size: 0.7rem; }
  .examples-contract { margin: var(--space-2) 0 var(--space-4); font-family: var(--font-body); font-size: 0.85rem; line-height: 1.5; color: var(--ink-canvas-secondary); }

  /* Unified search results (Archie-2308 item 3) — both corpora, labeled, regardless of the browsing lens. */
  .results { max-width: 60rem; margin: 0 auto; }
  .group-head { margin: 0 0 var(--space-4); font-family: var(--font-ui); font-size: var(--text-ui-sm, 0.8125rem); font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-canvas-muted); }
  .results .group-head:not(:first-child) { margin-top: var(--space-10); }
</style>
