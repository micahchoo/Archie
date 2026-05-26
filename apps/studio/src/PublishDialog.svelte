<script lang="ts">
  // Unified Publish dialog (CONTEXT §"Local view loop") — ONE modal, internal steps (no second modal
  // to stack behind the OS picker). Choose a destination, then act:
  //   • Locally → write/extract the site into the ONE folder the Viewer always reads (viewerTree).
  //   • GitHub  → hand off to the GitHub flow (Publish.svelte) via ongithub().
  // The plumbing (save · pickFolder · writeToFolder · downloadProjectZip) lives in App.svelte.
  let {
    open = false,
    canFolder = false,
    viewerTree = "apps/viewer/public/published/",
    onclose,
    onfolder,
    onzip,
    ongithub,
  }: {
    open?: boolean;
    canFolder?: boolean;
    /** The single fixed path the Viewer serves from — the set target for folder-pick / zip-extract. */
    viewerTree?: string;
    onclose: () => void;
    onfolder: () => Promise<string | null>;
    onzip: () => Promise<string>;
    ongithub: () => void;
  } = $props();

  type Phase = "choose" | "local" | "working" | "done-folder" | "done-zip" | "error";
  let phase = $state<Phase>("choose");
  let folderName = $state("");
  let zipName = $state("");
  let errorMsg = $state("");

  // Reset to the chooser whenever the dialog (re)opens.
  $effect(() => { if (open) { phase = "choose"; errorMsg = ""; } });

  async function chooseFolder() {
    phase = "working"; errorMsg = "";
    try {
      const name = await onfolder();
      if (name === null) { phase = "local"; return; } // cancelled the picker
      folderName = name;
      phase = "done-folder";
    } catch (e) { errorMsg = e instanceof Error ? e.message : "Couldn't write to the folder."; phase = "error"; }
  }
  async function saveZip() {
    phase = "working"; errorMsg = "";
    try { zipName = await onzip(); phase = "done-zip"; }
    catch (e) { errorMsg = e instanceof Error ? e.message : "Couldn't save the zip."; phase = "error"; }
  }
  function close() { phase = "choose"; errorMsg = ""; onclose(); }
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={close}></div>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Publish">
    <header>
      <p class="eyebrow">Publish</p>
      {#if phase === "choose"}
        <h2>Where to?</h2>
        <p class="lede">The same published site — choose where it goes.</p>
      {:else}
        <h2>Publish locally</h2>
        <p class="lede">Put the site in the one folder the Viewer reads, then open it — no GitHub.</p>
      {/if}
    </header>

    {#if phase === "choose"}
      <div class="choices">
        <button class="choice" onclick={() => (phase = "local")}>
          <span class="c-title">Locally</span>
          <span class="c-desc">Write the site to the Viewer's folder and preview it. No account.</span>
        </button>
        <button class="choice" onclick={ongithub}>
          <span class="c-title">To GitHub Pages</span>
          <span class="c-desc">Publish to the web on a GitHub Pages branch — standalone, no server.</span>
        </button>
      </div>
      <div class="actions"><button type="button" class="ghost" onclick={close}>Cancel</button></div>

    {:else if phase === "done-folder"}
      <div class="result">
        <p class="ok">Published locally.</p>
        <p class="line">Wrote the site into <code>{folderName}</code>. Start the Viewer and open it:</p>
        <pre class="cmd"><code>pnpm --filter @archie/viewer dev</code></pre>
        <p class="line muted">Then visit <code>http://localhost:4321</code>. Re-publish any time — the write is idempotent.</p>
        <div class="actions"><button class="primary" onclick={close}>Done</button></div>
      </div>

    {:else if phase === "done-zip"}
      <div class="result">
        <p class="ok">Saved <code>{zipName}</code>.</p>
        <p class="line">Unzip its contents into the one folder the Viewer reads, replacing what's there:</p>
        <pre class="cmd"><code>{viewerTree}</code></pre>
        <p class="line">Then start the Viewer:</p>
        <pre class="cmd"><code>pnpm --filter @archie/viewer dev</code></pre>
        <p class="line muted">Open <code>http://localhost:4321</code>.</p>
        <div class="actions"><button class="primary" onclick={close}>Done</button></div>
      </div>

    {:else}
      <!-- phase: local | working | error -->
      <div class="body">
        {#if canFolder}
          <p class="line">Choose the folder the Viewer reads — the one fixed target:</p>
          <pre class="cmd"><code>{viewerTree}</code></pre>
          <p class="line muted">Pick it once; re-publish any time (stale files are cleaned).</p>
        {:else}
          <p class="line">Your browser can't pick a folder, so this saves a <code>.archie.zip</code>. You'll then unzip it into the Viewer's one fixed folder — instructions next.</p>
        {/if}
        {#if phase === "error"}<p class="err">⚠ {errorMsg}</p>{/if}
        <div class="actions">
          <button type="button" class="ghost" onclick={() => (phase = "choose")}>← Back</button>
          {#if canFolder}
            <button class="primary" disabled={phase === "working"} onclick={chooseFolder}>{phase === "working" ? "Writing…" : "Choose folder…"}</button>
          {:else}
            <button class="primary" disabled={phase === "working"} onclick={saveZip}>{phase === "working" ? "Saving…" : "Save .archie.zip"}</button>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; background: rgba(12,11,9,0.62); z-index: 40; }
  .dialog {
    position: fixed; z-index: 41; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(34rem, calc(100vw - var(--space-8))); box-sizing: border-box;
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-lg); padding: var(--space-6);
  }
  header { margin-bottom: var(--space-5); }
  .eyebrow { color: var(--accent); }
  h2 { font-family: var(--font-display); font-size: 1.75rem; font-weight: 600; line-height: 1.1; margin: var(--space-1) 0 var(--space-2); color: var(--ink-paper-primary); }
  .lede { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.45; color: var(--ink-paper-secondary); margin: 0; }

  .choices { display: flex; flex-direction: column; gap: var(--space-3); }
  .choice {
    display: flex; flex-direction: column; gap: var(--space-1); text-align: left; cursor: pointer;
    padding: var(--space-4) var(--space-5);
    background: var(--surface-paper-card); border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-md);
    transition: background 120ms ease, border-color 120ms ease;
  }
  .choice:hover { background: var(--surface-paper-hover); border-color: var(--accent); }
  .c-title { font-family: var(--font-display); font-size: 1.25rem; font-weight: 600; color: var(--ink-paper-primary); }
  .c-desc { font-family: var(--font-ui); font-size: 0.82rem; line-height: 1.45; color: var(--ink-paper-secondary); }

  .body, .result { display: flex; flex-direction: column; gap: var(--space-3); }
  .line { font-family: var(--font-ui); font-size: 0.85rem; line-height: 1.5; color: var(--ink-paper-secondary); margin: 0; }
  .line.muted { color: var(--ink-paper-muted); font-size: 0.78rem; }
  code { font-family: var(--font-mono); font-size: 0.8rem; color: var(--ink-paper-primary); }
  .cmd { margin: 0; padding: var(--space-3) var(--space-4); background: var(--surface-paper-card); border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 0.8rem; color: var(--ink-paper-primary); white-space: pre-wrap; word-break: break-all; }
  .ok { font-family: var(--font-display); font-size: 1.5rem; font-weight: 600; color: var(--semantic-success); margin: 0; }
  .err { font-family: var(--font-ui); font-size: 0.8rem; line-height: 1.5; color: var(--accent); margin: 0; }

  .actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-4); }
  button { font-family: var(--font-ui); font-size: 0.8125rem; font-weight: 500; padding: var(--space-2) var(--space-4); border-radius: var(--radius-sm); cursor: pointer; }
  .ghost { background: none; color: var(--ink-paper-secondary); border: 1px solid var(--border-paper-emphasis); }
  .ghost:hover { color: var(--ink-paper-primary); border-color: var(--ink-paper-secondary); }
  .primary { background: var(--accent); color: var(--ink-on-accent); border: 1px solid var(--accent); }
  .primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
  .primary:disabled { background: var(--accent-muted); color: var(--ink-paper-muted); border-color: transparent; cursor: default; }
</style>
