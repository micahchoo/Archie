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

  let {
    exhibits,
    onopen,
    oncreate,
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
  }: {
    exhibits: ExhibitMeta[];
    onopen: (slug: string) => void;
    oncreate: (title: string) => void;
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
  } = $props();

  let rightsOpen = $state(false);
  const hasRights = $derived(!!(rights.rights || rights.requiredStatement));

  let newTitle = $state("");
  function create() {
    const t = newTitle.trim();
    if (!t) return;
    oncreate(t);
    newTitle = "";
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

<main class="library">
  <header>
    <p class="eyebrow">Library · {exhibits.length} {exhibits.length === 1 ? "exhibit" : "exhibits"}</p>
    <div class="title-row">
      <h1>{libTitle && libTitle.trim() ? libTitle : "Library"}</h1>
      <button class="librights" class:set={hasRights} onclick={() => (rightsOpen = true)} title="Title, description, credit & license for the whole library">ⓘ Details{#if hasRights}<span class="dot">●</span>{/if}</button>
    </div>
    <p class="lede">Exhibits marked <span class="ex-word">Example</span> are templates — open one to explore (nothing's saved), keep a copy to make it yours. Your own exhibits save as you work. Start a new one any time.</p>

    <PropsDrawer open={rightsOpen} title="Library details" onclose={() => (rightsOpen = false)}>
      <DetailsEditor title={libTitle ?? ""} summary={librarySummary ?? ""} rights={rights} scope="library" ontitle={ontitle} onsummary={onsummary} onrights={onrights} />
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
          <button onclick={onrecover} disabled={bindingBusy}>Save as a new project</button>
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
      <li>
        <button class="card" class:template={isTemplate(ex.slug)} onclick={() => onopen(ex.slug)}>
          {#if isTemplate(ex.slug)}<span class="badge">Example</span>{/if}
          <span class="title">{ex.title}</span>
          <span class="meta">{ex.objects.length} {ex.objects.length === 1 ? "object" : "objects"} · /{ex.slug}</span>
        </button>
      </li>
    {/each}
    <li>
      <form class="new" onsubmit={(e) => { e.preventDefault(); create(); }}>
        <span class="plus">+</span>
        <input bind:value={newTitle} placeholder="New exhibit title…" aria-label="New exhibit title" />
        <button type="submit" disabled={newTitle.trim() === ""}>Create</button>
      </form>
    </li>
  </ul>
</main>

<style>
  /* The curator's table — exhibits as plates under lamplight (system.md dark light-table side). */
  .library { min-height: 100vh; box-sizing: border-box; background: var(--surface-canvas); color: var(--ink-canvas-primary); padding: var(--space-12) var(--space-8); }
  header { max-width: 60rem; margin: 0 auto var(--space-10); }
  .eyebrow { color: var(--accent); }
  .title-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-4); }
  .librights {
    flex: none; align-self: center; display: inline-flex; align-items: center; gap: var(--space-1);
    font-family: var(--font-ui); font-size: var(--text-ui-sm); cursor: pointer;
    padding: var(--space-1) var(--space-3); border-radius: var(--radius-sm);
    background: var(--surface-canvas-overlay); color: var(--ink-canvas-primary); border: 1px solid var(--border-canvas);
  }
  .librights:hover { border-color: var(--accent); }
  .librights.set { border-color: var(--accent); }
  .librights .dot { color: var(--accent); font-size: 0.55rem; }
  h1 { font-family: var(--font-display); font-weight: 600; font-size: 3rem; line-height: 1.05; margin: var(--space-2) 0 var(--space-3); color: var(--ink-canvas-primary); }
  .lede { font-family: var(--font-body); font-size: 1.25rem; line-height: 1.5; color: var(--ink-canvas-secondary); margin: 0; max-width: 42rem; }

  /* Project bar — the "where does this library live" label on the table's edge. Quiet, 1px, no shadow. */
  .projectbar {
    display: flex; align-items: center; justify-content: space-between; gap: var(--space-5); flex-wrap: wrap;
    margin-top: var(--space-6); padding: var(--space-4) var(--space-5);
    background: var(--surface-canvas-raised); border: 1px solid var(--border-canvas); border-radius: var(--radius-md);
  }
  .projectbar.bound { border-left: 3px solid var(--accent); } /* a bound library is anchored — the accent marks it */
  .where { min-width: 16rem; }
  .place { margin: 0; font-family: var(--font-ui); font-size: 0.95rem; color: var(--ink-canvas-primary); display: flex; align-items: baseline; gap: var(--space-2); flex-wrap: wrap; }
  .place .kind { font-family: var(--font-mono); font-size: 0.6rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); border: 1px solid var(--accent); border-radius: 999px; padding: 1px var(--space-2); }
  .place .name { font-family: var(--font-mono); font-size: 0.85rem; color: var(--ink-canvas-primary); }
  .place .dot { font-family: var(--font-ui); font-size: 0.7rem; color: var(--semantic-warning); }
  .hint { margin: var(--space-1) 0 0; font-family: var(--font-ui); font-size: var(--text-ui-md, 0.75rem); color: var(--ink-canvas-secondary); }

  .actions { display: flex; align-items: center; gap: var(--space-2); }
  .actions button { font-family: var(--font-ui); font-size: var(--text-ui-sm, 0.8125rem); font-weight: 500; padding: var(--space-2) var(--space-4); cursor: pointer; border-radius: var(--radius-sm); transition: background 120ms ease, border-color 120ms ease, color 120ms ease; }
  .actions button:disabled { opacity: 0.5; cursor: default; }
  .primary { background: var(--accent); color: var(--ink-on-accent); border: 1px solid var(--accent); }
  .primary:hover:not(:disabled) { background: var(--accent-hover, #2d553d); }
  .ghost { background: transparent; color: var(--ink-canvas-primary); border: 1px solid var(--border-canvas-emphasis); }
  .ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .ghost.subtle { color: var(--ink-canvas-secondary); border-color: transparent; }
  .ghost.subtle:hover:not(:disabled) { color: var(--ink-canvas-primary); border-color: var(--border-canvas-emphasis); }

  /* Lost-binding recovery — amber warning (a missing folder is recoverable, not destructive → not vermillion). */
  .binding-error { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; margin-top: var(--space-3); padding: var(--space-3) var(--space-4); background: rgba(196,155,54,0.1); border: 1px solid var(--semantic-warning); border-radius: var(--radius-sm); }
  .binding-error .msg { font-family: var(--font-ui); font-size: var(--text-ui-sm, 0.8125rem); color: var(--ink-canvas-primary); }
  .err-actions { display: flex; align-items: center; gap: var(--space-2); }
  .err-actions button { font-family: var(--font-ui); font-size: var(--text-ui-sm, 0.8125rem); padding: var(--space-1) var(--space-3); cursor: pointer; background: transparent; color: var(--ink-canvas-primary); border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); }
  .err-actions button:hover { border-color: var(--accent); color: var(--accent); }
  .err-actions .x { border: none; font-size: 1rem; color: var(--ink-canvas-muted); padding: 0 var(--space-2); }

  /* Recent libraries — the session-surviving re-open list (CONTEXT mitigation: "metadata, not content"). */
  .recents { margin-top: var(--space-5); }
  .r-eyebrow { margin: 0 0 var(--space-2); font-family: var(--font-ui); font-size: var(--text-ui-md, 0.75rem); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-canvas-muted); }
  .recents ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .recents li { display: flex; align-items: stretch; }
  .recent { display: flex; flex-direction: column; gap: 2px; text-align: left; cursor: pointer; padding: var(--space-2) var(--space-3); background: var(--surface-canvas-raised); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm) 0 0 var(--radius-sm); }
  .recent:hover:not(:disabled) { border-color: var(--accent); }
  .recent:disabled { opacity: 0.5; cursor: default; }
  .r-name { font-family: var(--font-mono); font-size: 0.8rem; color: var(--ink-canvas-primary); }
  .r-meta { font-family: var(--font-ui); font-size: var(--text-ui-xs, 0.7rem); color: var(--ink-canvas-secondary); }
  .forget { cursor: pointer; padding: 0 var(--space-2); background: var(--surface-canvas-raised); color: var(--ink-canvas-muted); border: 1px solid var(--border-canvas); border-left: none; border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
  .forget:hover { color: var(--semantic-error); }

  .grid { list-style: none; margin: 0 auto; padding: 0; max-width: 60rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--space-5); }

  .card {
    display: flex; flex-direction: column; gap: var(--space-2); width: 100%; min-height: 7.5rem; cursor: pointer; text-align: left;
    padding: var(--space-5);
    background: var(--surface-canvas-raised); color: inherit;
    border: 1px solid var(--border-canvas); border-radius: var(--radius-lg);
    transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
  }
  .card:hover { background: var(--surface-canvas-overlay); border-color: var(--border-canvas-emphasis); transform: translateY(-2px); }
  .title { font-family: var(--font-display); font-size: 1.6rem; font-weight: 600; line-height: 1.1; color: var(--ink-canvas-primary); }
  .meta { font-family: var(--font-mono); font-size: 0.72rem; color: var(--accent); }
  /* Example (template) marker — amber, matching the in-editor playground banner (transient, not yours-yet). */
  .card.template { border-style: dashed; }
  .badge { align-self: flex-start; font-family: var(--font-ui); font-size: 0.6rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--semantic-warning); border: 1px solid var(--semantic-warning); border-radius: 999px; padding: 1px var(--space-2); }
  .ex-word { color: var(--semantic-warning); font-weight: 600; }

  /* New-exhibit tile — a dashed plate awaiting a work. */
  .new {
    display: flex; flex-direction: column; gap: var(--space-3); align-items: flex-start; min-height: 7.5rem; box-sizing: border-box;
    padding: var(--space-5);
    background: none; border: 1px dashed var(--border-canvas-emphasis); border-radius: var(--radius-lg);
  }
  .plus { font-family: var(--font-display); font-size: 1.6rem; line-height: 1; color: var(--ink-canvas-muted); }
  .new input {
    width: 100%; box-sizing: border-box; font-family: var(--font-body); font-size: 1rem; padding: var(--space-2) var(--space-3);
    background: var(--surface-canvas-overlay); color: var(--ink-canvas-primary);
    border: 1px solid var(--border-canvas); border-radius: var(--radius-sm);
  }
  .new input:focus { outline: none; border-color: var(--accent); }
  .new button {
    font-family: var(--font-ui); font-size: 0.8125rem; font-weight: 500; padding: var(--space-2) var(--space-4); cursor: pointer;
    background: var(--accent); color: var(--ink-on-accent); border: 1px solid var(--accent); border-radius: var(--radius-sm);
  }
  .new button:disabled { background: var(--accent-muted); color: var(--ink-canvas-muted); border-color: transparent; cursor: default; }
</style>
