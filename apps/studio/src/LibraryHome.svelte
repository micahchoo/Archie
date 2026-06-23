<script lang="ts">
  // Studio Library home (Q-7 "Library" — the authoring index). The curator's table of works in
  // progress: each exhibit is a plate on the dark light table; a dashed tile starts a new one.
  // Authoring counterpart to the Viewer's Gallery (which is the published, visitor-facing wall).
  //
  // The PROJECT BAR (invention #3, CONTEXT three-configs persistence) sits above the plates and answers
  // one question at the Library scale: WHERE does this library live? — only-in-this-browser (unbound) vs
  // a folder it autosaves to (Chromium) vs a .archie.zip file on disk. Capability is hidden; the user sees
  // only the place. Save is habit-forming (prominent + ⌘S + an unsaved dot); Open is as prominent as New;
  // recents survive sessions (the non-Chromium re-open mitigation); a lost binding is surfaced, never silent.
  import type { ExhibitMeta } from "./store.js";
  import type { Binding, RecentProject, RightsFields } from "@render/core";
  import DetailsEditor from "./DetailsEditor.svelte";
  import PropsDrawer from "./PropsDrawer.svelte";
  import HelpMenu from "./HelpMenu.svelte";
  import { saveStatus } from "./save-queue.svelte.js";

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
  }: {
    exhibits: ExhibitMeta[];
    onopen: (slug: string) => void;
    oncreate: (title: string) => void;
    /** A whole media folder (images, audio, video) becomes a new exhibit (contributor-broadening ① — Archie-e1d6). */
    oncreatefromfolder: (files: File[]) => void;
    /** A pasted IIIF manifest URL becomes a new exhibit (contributor-broadening ② — Archie-bc01). */
    oncreatefrommanifest: (url: string) => void;
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
  } = $props();

  let rightsOpen = $state(false);
  const hasRights = $derived(!!(rights.rights || rights.requiredStatement));

  // The exhibit whose per-card pencil drawer is open (Archie-79be) — transient view state, like rightsOpen.
  // Resolves to its full ExhibitMeta so the shared DetailsEditor can read title/description/rights.
  let editingSlug = $state<string | null>(null);
  const editingExhibit = $derived(exhibits.find((e) => e.slug === editingSlug) ?? null);
  const rightsOf = (e: ExhibitMeta): RightsFields => ({
    ...(e.rights ? { rights: e.rights } : {}),
    ...(e.requiredStatement ? { requiredStatement: e.requiredStatement } : {}),
  });

  let newTitle = $state("");
  function create() {
    const t = newTitle.trim();
    if (!t) return;
    oncreate(t);
    newTitle = "";
  }

  // The hidden directory input behind "… or add a media folder".
  let dirEl: HTMLInputElement | null = null;

  // A human "x ago" for a recent project's last-opened stamp.
  function ago(ms: number): string {
    const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return "just now";
    const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`;
    return `${Math.round(h / 24)} days ago`;
  }
</script>

<main class="library">
  <header>
    <p class="eyebrow">Library · {exhibits.length} {exhibits.length === 1 ? "exhibit" : "exhibits"}</p>
    <div class="title-row">
      <h1>{libTitle && libTitle.trim() ? libTitle : "Library"}</h1>
      <div class="hdr-actions">
        <button class="librights" class:set={hasRights} onclick={() => (rightsOpen = true)} title="Title, description, credit & license for the whole library">ⓘ Details{#if hasRights}<span class="dot">●</span>{/if}</button>
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

    <!-- Project bar: where this whole library lives. -->
    <section class="projectbar" class:bound={binding.kind !== "unbound"}>
      <div class="where">
        {#if binding.kind === "unbound"}
          <p class="place">This library lives only in this browser.</p>
          <p class="hint">Save it to disk to keep it safe — and to open it on another machine.</p>
        {:else}
          <p class="place">
            <span class="kind">{binding.kind === "folder" ? "Folder" : "File"}</span>
            <span class="name">{binding.name}</span>
            {#if bindingDirty}<span class="dot" title="Unsaved changes">● unsaved</span>{/if}
          </p>
          <p class="hint">
            {#if binding.kind === "folder"}Saving to this folder automatically as you work.
            {:else}{bindingDirty ? "Unsaved changes — Save (⌘S) to update the file." : "Saved as a file on your computer."}{/if}
          </p>
        {/if}
        {#if saveStatus.health === "error"}
          <!-- Worklist 0.1 (loud saves): a failed write is never silent — the queue's last error, verbatim. -->
          <p class="save-error" role="alert">⚠ {saveStatus.error}</p>
        {/if}
      </div>
      <div class="actions">
        <button class="primary" onclick={onsave} disabled={bindingBusy}>
          {binding.kind === "unbound" ? "Save to disk" : "Save"}
        </button>
        <button class="ghost" onclick={onopenproject} disabled={bindingBusy}>Open a library…</button>
        {#if binding.kind !== "unbound"}
          <button class="ghost subtle" onclick={onclose} disabled={bindingBusy}
            title="Detach from disk — your work stays in this browser">Close</button>
        {/if}
      </div>
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

    {#if recents.length > 0}
      <section class="recents">
        <p class="r-eyebrow">Recent libraries</p>
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

  <ul class="grid">
    {#each exhibits as ex (ex.slug)}
      <li class="card-wrap">
        <button class="card" class:template={isTemplate(ex.slug)} onclick={() => onopen(ex.slug)}>
          {#if isTemplate(ex.slug)}<span class="badge">Example</span>{/if}
          <span class="title">{ex.title}</span>
          <span class="meta">{ex.objects.length} {ex.objects.length === 1 ? "media item" : "media items"} · /{ex.slug}</span>
          {#if isTemplate(ex.slug)}<span class="ex-hint">Explore freely — changes aren't kept. Keep a copy to make it yours.</span>{/if}
        </button>
        <!-- Per-card pencil (Archie-79be): edit this exhibit's title/description/credit + remove, without
             opening it. A SIBLING of the card button (no button-in-button); sits over the top-right corner. -->
        <button class="edit-meta" title="Edit details for {ex.title}" aria-label="Edit details for {ex.title}"
          onclick={() => (editingSlug = ex.slug)}>✎</button>
      </li>
    {/each}
    <li>
      <form class="new" onsubmit={(e) => { e.preventDefault(); create(); }}>
        <span class="plus">+</span>
        <input bind:value={newTitle} placeholder="New exhibit title…" aria-label="New exhibit title" />
        <button type="submit" disabled={newTitle.trim() === ""}>Create</button>
        <!-- Folder → exhibit in one gesture: the folder names the exhibit, its media (images, audio,
             video) become the objects (reading order). webkitdirectory over showDirectoryPicker: cross-browser + testable. -->
        <button type="button" class="alt-create" onclick={() => dirEl?.click()}>… or add a media folder</button>
        <!-- One paste bootstraps from any institutional IIIF collection (50k+ manifests in the wild).
             prompt() matches the app's alert/confirm chrome convention — a quiet escape, not a form. -->
        <button type="button" class="alt-create" onclick={() => { const u = window.prompt("Paste a IIIF manifest link"); if (u) oncreatefrommanifest(u); }}>… or paste a IIIF link</button>
        <input
          bind:this={dirEl}
          type="file"
          webkitdirectory
          style="display:none"
          aria-label="Add a folder of media as a new exhibit"
          onchange={(e) => { const el = e.currentTarget as HTMLInputElement; if (el.files?.length) oncreatefromfolder(Array.from(el.files)); el.value = ""; }}
        />
      </form>
    </li>
  </ul>
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

  /* Project bar — the "where does this library live" label, on warm paper, separated by tone + soft shadow. */
  .projectbar {
    display: flex; align-items: center; justify-content: space-between; gap: var(--space-5); flex-wrap: wrap;
    margin-top: var(--space-6); padding: var(--space-4) var(--space-5);
    background: var(--surface-canvas-raised); border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
  }
  .projectbar.bound { box-shadow: var(--shadow-lift-low), inset 3px 0 0 var(--accent-muted); } /* a bound library is anchored — a quiet accent edge marks it */
  .where { min-width: 16rem; }
  .place { margin: 0; font-family: var(--font-body); font-size: 0.95rem; color: var(--ink-canvas-primary); display: flex; align-items: baseline; gap: var(--space-2); flex-wrap: wrap; }
  .place .kind { font-family: var(--font-mono); font-size: 0.6rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-canvas-secondary); border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); padding: 1px var(--space-2); }
  .place .name { font-family: var(--font-mono); font-size: 0.85rem; color: var(--ink-canvas-primary); }
  .place .dot { font-family: var(--font-ui); font-size: 0.7rem; color: var(--semantic-warning); }
  .hint { margin: var(--space-1) 0 0; font-family: var(--font-body); font-size: var(--text-ui-md, 0.75rem); color: var(--ink-canvas-secondary); }
  .save-error { margin: var(--space-1) 0 0; font-family: var(--font-ui); font-size: var(--text-ui-md, 0.75rem); color: var(--semantic-error); }

  .actions { display: flex; align-items: center; gap: var(--space-3); }
  .actions button { font-family: var(--font-ui); font-size: var(--text-ui-sm, 0.8125rem); font-weight: 600; letter-spacing: 0.02em; padding: var(--space-2) var(--space-4); cursor: pointer; border-radius: var(--radius-sm); transition: background 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease; }
  .actions button:disabled { opacity: 0.5; cursor: default; }
  /* Primary CTA — the ONE rationed signal: signal-orange fill, soft rounded, warm glow. Save is the focal action. */
  .primary { background: var(--accent); color: var(--ink-on-accent); border: 1px solid transparent; box-shadow: var(--shadow-signal-glow); }
  .primary:hover:not(:disabled) { background: var(--accent-hover); box-shadow: var(--shadow-signal-glow), var(--shadow-lift-low); }
  /* Secondary actions — quiet soft-btn: warm paper, soft border, ink text. No orange. */
  .ghost { background: var(--surface-canvas-raised); color: var(--ink-canvas-primary); border: 1px solid var(--border-canvas-emphasis); }
  .ghost:hover:not(:disabled) { background: var(--surface-canvas-overlay); color: var(--ink-canvas-primary); box-shadow: var(--shadow-lift-low); }
  .ghost.subtle { color: var(--ink-canvas-secondary); border-color: var(--border-canvas); }
  .ghost.subtle:hover:not(:disabled) { color: var(--ink-canvas-primary); background: var(--surface-canvas-overlay); border-color: var(--border-canvas-emphasis); }

  /* Lost-binding recovery — warm warning (a missing folder is recoverable, not destructive). */
  .binding-error { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; margin-top: var(--space-3); padding: var(--space-3) var(--space-4); background: var(--surface-canvas-overlay); border-radius: var(--radius-md); box-shadow: var(--shadow-lift-low), inset 3px 0 0 var(--semantic-warning); }
  .binding-error .msg { font-family: var(--font-body); font-size: var(--text-ui-sm, 0.8125rem); color: var(--ink-canvas-primary); }
  .err-actions { display: flex; align-items: center; gap: var(--space-2); }
  .err-actions button { font-family: var(--font-ui); font-size: var(--text-ui-sm, 0.8125rem); letter-spacing: 0.02em; padding: var(--space-1) var(--space-3); cursor: pointer; background: var(--surface-canvas-raised); color: var(--ink-canvas-primary); border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); transition: background 160ms ease, box-shadow 160ms ease; }
  .err-actions button:hover { background: var(--surface-canvas-overlay); box-shadow: var(--shadow-lift-low); }
  .err-actions .x { border: none; background: none; font-size: 1rem; color: var(--ink-canvas-muted); padding: 0 var(--space-2); }
  .err-actions .x:hover { background: none; box-shadow: none; color: var(--ink-canvas-primary); }

  /* Recent libraries — the session-surviving re-open list (CONTEXT mitigation: "metadata, not content"). */
  .recents { margin-top: var(--space-5); }
  .r-eyebrow { margin: 0 0 var(--space-2); font-family: var(--font-ui); font-size: var(--text-ui-md, 0.75rem); font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-canvas-muted); }
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
  .edit-meta {
    position: absolute; top: var(--space-3); right: var(--space-3); z-index: 1;
    display: inline-flex; align-items: center; justify-content: center;
    width: 1.85rem; height: 1.85rem; padding: 0; cursor: pointer; line-height: 1;
    font-family: var(--font-ui); font-size: 0.95rem;
    color: var(--ink-canvas-secondary); background: var(--surface-canvas-raised);
    border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm);
    box-shadow: var(--shadow-lift-low);
    opacity: 0.45; transition: opacity 160ms ease, color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  }
  .card-wrap:hover .edit-meta, .card-wrap:focus-within .edit-meta { opacity: 1; }
  .edit-meta:hover { color: var(--accent); border-color: var(--accent); box-shadow: var(--shadow-lift-mid); }
  .edit-meta:focus-visible { opacity: 1; outline: 2px solid var(--accent); outline-offset: 1px; }
  /* padding-right reserves the top-right pencil's gutter (--space-3 inset + ~1.85rem button) so a long title wraps before it. */
  .title { font-family: var(--font-display); font-size: 1.6rem; font-weight: 400; line-height: 1.15; color: var(--ink-canvas-primary); padding-right: calc(var(--space-3) + 1.85rem); }
  .meta { font-family: var(--font-mono); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-canvas-muted); }
  /* Example (template) marker — a soft warm dashed edge + quiet warning label (transient, not yours-yet). */
  .card.template { box-shadow: var(--shadow-lift-low), inset 0 0 0 1px var(--border-canvas-emphasis); }
  .badge { align-self: flex-start; font-family: var(--font-ui); font-size: 0.6rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--semantic-warning); border: 1px solid var(--semantic-warning); border-radius: var(--radius-sm); padding: 1px var(--space-2); }
  /* Example hint — teaches the consequence of the badge (transient; fork to keep). Quiet body voice, demoted from the gallery lede. */
  .ex-hint { font-family: var(--font-body); font-size: 0.78rem; line-height: 1.5; color: var(--ink-canvas-secondary); }

  /* New-exhibit tile — a soft dashed plate awaiting a work (separated by tone, not a hard rectangle). */
  .new {
    display: flex; flex-direction: column; gap: var(--space-3); align-items: flex-start; min-height: 7.5rem; box-sizing: border-box;
    padding: var(--space-5);
    background: none; border: 1px dashed var(--border-canvas-emphasis); border-radius: var(--radius-md);
  }
  .plus { font-family: var(--font-display); font-weight: 300; font-size: 1.6rem; line-height: 1; color: var(--ink-canvas-muted); }
  .new input {
    width: 100%; box-sizing: border-box; font-family: var(--font-body); font-size: 1rem; padding: var(--space-2) var(--space-3);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-primary);
    border: 1px solid var(--border-canvas); border-radius: var(--radius-sm);
    transition: border-color 160ms ease, box-shadow 160ms ease;
  }
  .new input:focus { outline: none; border-color: var(--border-canvas-emphasis); box-shadow: var(--shadow-inset-fog); }
  /* Create — quiet soft-btn: warm paper, soft border, ink text. Signal-orange is rationed to Save (the focal action). */
  .new button {
    font-family: var(--font-ui); font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.02em; padding: var(--space-2) var(--space-4); cursor: pointer;
    background: var(--surface-canvas-raised); color: var(--ink-canvas-primary); border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm);
    transition: background 160ms ease, color 160ms ease, box-shadow 160ms ease;
  }
  .new button:hover:not(:disabled) { background: var(--surface-canvas-overlay); box-shadow: var(--shadow-lift-low); }
  .new button:disabled { background: none; color: var(--ink-canvas-muted); border-color: var(--border-canvas); box-shadow: none; cursor: default; }
  .new .alt-create { font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.14em; background: none; border: none; box-shadow: none; padding: 6px 0; font-weight: 400; color: var(--ink-canvas-secondary); } /* 6px v-pad -> 24px+ hit box (Fitts) */
  .new .alt-create:hover { background: none; box-shadow: none; color: var(--accent-2); }
</style>
