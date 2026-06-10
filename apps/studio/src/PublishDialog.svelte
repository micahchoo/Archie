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
    ondownload,
  }: {
    open?: boolean;
    canFolder?: boolean;
    /** The single fixed path the Viewer serves from — the set target for folder-pick / zip-extract. */
    viewerTree?: string;
    onclose: () => void;
    onfolder: () => Promise<string | null>;
    onzip: () => Promise<string>;
    ongithub: () => void;
    /** Save the whole library as a portable .archie.zip — a copy to keep, re-open, or hand to someone.
     *  Resolves true only if a save actually happened (false = size-guard declined / picker cancelled). */
    ondownload: () => Promise<boolean>;
  } = $props();

  type Phase = "choose" | "local" | "working" | "done-folder" | "done-zip" | "done-download" | "error";
  let phase = $state<Phase>("choose");
  let folderName = $state("");
  let zipName = $state("");
  let errorMsg = $state("");

  // ?src= share path (contributor-broadening ④, Archie-fd32): the zero-GitHub publish — host the
  // .archie.zip anywhere public, share one link into the canonical Viewer instance (ADR-0009).
  // Cite-with-caveats by design: the durability warning below is load-bearing, don't drop it.
  // ONE config source (ADR-0013 amendment): archie.config.json — build-gh-pages.sh reads the
  // same file via node -p, so the minted links and the deploy can't drift apart.
  import archieConfig from "../../../archie.config.json";
  const CANONICAL_VIEWER = `${archieConfig.canonicalOrigin}${archieConfig.viewerPath}`;
  const CANONICAL_HOST = new URL(CANONICAL_VIEWER).host;
  let zipUrl = $state("");
  let copied = $state(false);
  const shareLink = $derived.by(() => {
    const u = zipUrl.trim();
    if (!u) return "";
    try {
      const p = new URL(u);
      if (p.protocol !== "https:" && p.protocol !== "http:") return ""; // a junk string composes a junk link
    } catch { return ""; }
    return `${CANONICAL_VIEWER}?src=${encodeURIComponent(u)}`;
  });
  const canCopy = typeof navigator !== "undefined" && !!navigator.clipboard;
  function copyShareLink() {
    navigator.clipboard.writeText(shareLink)
      .then(() => { copied = true; setTimeout(() => (copied = false), 1500); })
      .catch(() => { copied = false; }); // permission denied — the link is still selectable above
  }
  // Embed snippet (contributor-broadening ⑩ slice A): the same ?src= link as an <iframe>, for
  // blogs / LMS pages / Omeka-style sites. The custom <archie-viewer> element is a later slice.
  const embedSnippet = $derived(shareLink === "" ? "" : `<iframe src="${shareLink}" width="100%" height="600" style="border:0" allowfullscreen loading="lazy" referrerpolicy="no-referrer" title="Archie exhibit"></iframe>`);
  let copiedEmbed = $state(false);
  function copyEmbed() {
    navigator.clipboard.writeText(embedSnippet)
      .then(() => { copiedEmbed = true; setTimeout(() => (copiedEmbed = false), 1500); })
      .catch(() => { copiedEmbed = false; });
  }

  // Reset to the chooser whenever the dialog (re)opens.
  $effect(() => { if (open) { phase = "choose"; errorMsg = ""; zipUrl = ""; copied = false; } });

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
      {:else if phase === "done-download"}
        <h2>Save a copy</h2>
        <p class="lede">A portable <code>.archie.zip</code> — and, if you host it, a shareable link.</p>
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
        <!-- Stay on the chooser until the save actually happens (the OS picker is modal anyway) —
             done-download must never claim a save the user cancelled. -->
        <button class="choice" onclick={async () => { if (await ondownload().catch(() => false)) phase = "done-download"; }}>
          <span class="c-title">Save a copy — or share a link</span>
          <span class="c-desc">Pack the whole library into one <code>.archie.zip</code> to keep, re-open, hand to a colleague — or host it and share a link that opens in any browser.</span>
        </button>
      </div>
      <div class="actions"><button type="button" class="ghost" onclick={close}>Cancel</button></div>

    {:else if phase === "done-download"}
      <div class="result">
        <p class="ok">Saved your <code>.archie.zip</code>.</p>
        <p class="line">Keep it, re-open it here any time, or hand it to a colleague. <strong>Working with someone?</strong> They open your zip in their Studio, annotate their pass, and send it back — opening their copy here shows who added what.</p>
        <p class="line"><strong>Share it as a link (no install for the reader):</strong> upload the zip anywhere public — your site, a GitHub release, the Internet Archive — then paste its URL:</p>
        <input class="share-url" type="url" placeholder="https://…/my-library.archie.zip" bind:value={zipUrl} aria-label="Public URL of the uploaded .archie.zip" />
        {#if shareLink}
          <pre class="cmd"><code>{shareLink}</code></pre>
          <p class="line">Or embed the exhibit in a blog, LMS page, or site <span class="muted">(some platforms strip iframes — paste into an HTML/embed block)</span>:</p>
          <pre class="cmd"><code>{embedSnippet}</code></pre>
          {#if canCopy}
            <div class="actions share-actions">
              <button type="button" class="ghost" onclick={copyShareLink}>{copied ? "Copied ✓" : "Copy link"}</button>
              <button type="button" class="ghost" onclick={copyEmbed}>{copiedEmbed ? "Copied ✓" : "Copy embed code"}</button>
            </div>
          {:else}
            <p class="line muted">Select the link or embed code above to copy it.</p>
          {/if}
        {/if}
        <p class="line muted">A <code>?src=</code> link works while both hosts stay up — the zip’s and <code>{CANONICAL_HOST}</code> (the Viewer). Moving either breaks shared links. For a durable, citable publication, publish the full site instead.</p>
        <div class="actions"><button class="primary" onclick={close}>Done</button></div>
      </div>

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
  .share-url {
    width: 100%; box-sizing: border-box; font-family: var(--font-mono); font-size: 0.8rem;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-sm);
  }
  .share-url:focus { outline: none; border-color: var(--accent); }
  .share-actions { justify-content: flex-start; margin: 0; }
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
