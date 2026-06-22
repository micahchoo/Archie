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
  // Embed snippet (contributor-broadening ⑩ slice A): TWO ways to embed, per the locked v1
  // contract (ADR-0021) and the iframe floor (anvil ADR-0006).
  //  • Web Component — the canonical embed: a pinned-tag CDN <script type="module"> + an
  //    <archie-viewer src=…> element. src points DIRECTLY at the hosted .archie.zip (the
  //    src grammar in recipes/README.md §"src — which library" / recipe 02). No ?src= wrapper:
  //    the element fetches the zip itself.
  //  • iframe — the fallback for hosts that strip <script>/custom elements (Notion, Substack,
  //    Squarespace, locked-down WP). Wraps the SAME ?src= canonical-viewer link the dialog mints.
  const CDN_RUNTIME = "https://cdn.jsdelivr.net/gh/micahchoo/Archie@v1/dist/archie-viewer.js";
  // The closing script tag is split (`</scr" + "ipt>`) so the literal doesn't terminate THIS
  // Svelte <script> block — the snippet text is identical to recipes/README.md §1.
  const wcSnippet = $derived(zipUrl.trim() === "" ? "" :
`<script type="module" src="${CDN_RUNTIME}" crossorigin="anonymous"></scr` + `ipt>
<archie-viewer src="${zipUrl.trim()}"></archie-viewer>`);
  const embedSnippet = $derived(shareLink === "" ? "" : `<iframe src="${shareLink}" width="100%" height="600" style="border:0" allowfullscreen loading="lazy" referrerpolicy="no-referrer" title="Archie exhibit"></iframe>`);
  let copiedWc = $state(false);
  let copiedEmbed = $state(false);
  function copyWc() {
    navigator.clipboard.writeText(wcSnippet)
      .then(() => { copiedWc = true; setTimeout(() => (copiedWc = false), 1500); })
      .catch(() => { copiedWc = false; });
  }
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
        <h2>Where should this go?</h2>
        <p class="lede">Archie builds the same finished site each way — pick where to put it.</p>
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
          <span class="c-desc">Keep a copy, share a link, or hand it to a colleague — packed into one <code>.archie.zip</code>.</span>
        </button>
      </div>
      <div class="actions"><button type="button" class="ghost" onclick={close}>Cancel</button></div>

    {:else if phase === "done-download"}
      <div class="result">
        <p class="ok">Saved your <code>.archie.zip</code>.</p>
        <p class="line">Keep it, re-open it here any time, or hand it to a colleague. <strong>Working with someone?</strong> They open your zip in their Studio, add their own notes, and send the file back — when you open their copy here, Archie shows who added what.</p>
        <p class="line"><strong>Share it as a link (no install for the reader):</strong> upload the zip anywhere public — your site, a GitHub release, the Internet Archive — then paste its URL:</p>
        <input class="share-url" type="url" placeholder="https://…/my-library.archie.zip" bind:value={zipUrl} aria-label="Public URL of the uploaded .archie.zip" />
        {#if shareLink}
          <pre class="cmd"><code>{shareLink}</code></pre>
          <p class="line">Or embed the exhibit in a blog, LMS page, or site. Two ways:</p>
          <p class="line"><strong>Web Component</strong> <span class="muted">— the recommended embed: a one-time script tag plus an <code>&lt;archie-viewer&gt;</code> element. Paste both into an HTML/code block.</span></p>
          <pre class="cmd"><code>{wcSnippet}</code></pre>
          <p class="line"><strong>iframe</strong> <span class="muted">— the fallback for hosts that strip scripts / custom elements (Notion, Substack, Squarespace, locked-down WordPress).</span></p>
          <pre class="cmd"><code>{embedSnippet}</code></pre>
          {#if canCopy}
            <div class="actions share-actions">
              <button type="button" class="ghost" onclick={copyShareLink}>{copied ? "Copied" : "Copy link"}</button>
              <button type="button" class="ghost" onclick={copyWc}>{copiedWc ? "Copied" : "Copy Web Component"}</button>
              <button type="button" class="ghost" onclick={copyEmbed}>{copiedEmbed ? "Copied" : "Copy iframe"}</button>
            </div>
          {:else}
            <p class="line muted">Select the link or embed code above to copy it.</p>
          {/if}
        {/if}
        <p class="line muted">This link depends on two things staying online: the place you uploaded the zip, and the Archie viewer at <code>{CANONICAL_HOST}</code>. If either moves or goes away, the link stops working — so it's best for sharing a draft, not for a permanent citation. To publish something that stands on its own, use "To GitHub Pages" instead.</p>
        <div class="actions"><button class="primary" onclick={close}>Done</button></div>
      </div>

    {:else if phase === "done-folder"}
      <div class="result">
        <p class="ok">Published locally.</p>
        <p class="line">Wrote the site into <code>{folderName}</code>. Start the Viewer and open it:</p>
        <pre class="cmd"><code>pnpm --filter @archie/viewer dev</code></pre>
        <p class="line muted">Then visit <code>http://localhost:4321</code>. Re-publish any time — it safely replaces what's there.</p>
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
          <p class="line">Choose the folder the Viewer reads from:</p>
          <pre class="cmd"><code>{viewerTree}</code></pre>
          <p class="line muted">Pick it once, then re-publish any time — Archie clears out old files for you.</p>
        {:else}
          <p class="line">Your browser can't pick a folder, so this saves a <code>.archie.zip</code> instead. You'll then unzip it into the folder the Viewer reads from — instructions next.</p>
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
  /* Soft Static: warm paper modal floating on a warm-charcoal scrim, soft lift shadow,
     generous rounded corners, no hard border. The single publish action carries the
     rationed signal-orange; everything else stays quiet. */
  .scrim { position: fixed; inset: 0; background: rgba(59,49,56,0.55); backdrop-filter: blur(2px); z-index: 40; }
  .dialog {
    position: fixed; z-index: 41; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(34rem, calc(100vw - var(--space-8))); box-sizing: border-box;
    background: var(--surface-canvas-raised); color: var(--ink-paper-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lift-mid); padding: var(--space-6);
  }
  header { margin-bottom: var(--space-5); }
  .eyebrow { color: var(--ink-paper-muted); }
  h2 { font-family: var(--font-display); font-size: 1.75rem; font-weight: 400; line-height: 1.15; margin: var(--space-1) 0 var(--space-2); color: var(--ink-paper-primary); text-shadow: var(--shadow-text-haze); }
  .lede { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.6; color: var(--ink-paper-secondary); margin: 0; }

  .choices { display: flex; flex-direction: column; gap: var(--space-3); }
  .choice {
    display: flex; flex-direction: column; gap: var(--space-1); text-align: left; cursor: pointer;
    padding: var(--space-4) var(--space-5);
    background: var(--surface-paper-card); border: none; border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
    transition: background 160ms ease, transform 160ms ease, box-shadow 160ms ease;
  }
  .choice:hover { background: var(--surface-paper-hover); transform: translateY(-1px); box-shadow: var(--shadow-lift-mid); }
  .c-title { font-family: var(--font-display); font-size: 1.25rem; font-weight: 400; color: var(--ink-paper-primary); }
  .c-desc { font-family: var(--font-body); font-size: 0.875rem; line-height: 1.5; color: var(--ink-paper-secondary); }

  .body, .result { display: flex; flex-direction: column; gap: var(--space-3); }
  .share-url {
    width: 100%; box-sizing: border-box; font-family: var(--font-mono); font-size: 0.8rem;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-canvas); border-radius: var(--radius-sm);
  }
  .share-url:focus { outline: none; border-color: var(--accent-2); }
  .share-actions { justify-content: flex-start; margin: 0; }
  .line { font-family: var(--font-body); font-size: 0.9rem; line-height: 1.6; color: var(--ink-paper-secondary); margin: 0; }
  .line.muted { color: var(--ink-paper-muted); font-size: 0.82rem; }
  code { font-family: var(--font-mono); font-size: 0.8rem; color: var(--ink-paper-primary); }
  .cmd { margin: 0; padding: var(--space-3) var(--space-4); background: var(--surface-canvas-overlay); border-radius: var(--radius-sm); box-shadow: var(--shadow-inset-fog); font-family: var(--font-mono); font-size: 0.8rem; color: var(--ink-paper-primary); white-space: pre-wrap; word-break: break-all; }
  .ok { font-family: var(--font-display); font-size: 1.5rem; font-weight: 400; color: var(--semantic-success); margin: 0; }
  .err { font-family: var(--font-ui); font-size: 0.8rem; line-height: 1.5; color: var(--semantic-error); margin: 0; }

  .actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-4); }
  /* The ONE focal action → rationed signal-orange, soft rounded, signal glow. */
  .primary {
    font-family: var(--font-body); font-size: 0.9rem; font-weight: 600;
    letter-spacing: 0.01em;
    padding: var(--space-2) var(--space-5); border-radius: var(--radius-sm); cursor: pointer;
    background: var(--accent); color: var(--ink-on-accent); border: none;
    box-shadow: var(--shadow-signal-glow);
    transition: background 160ms ease, box-shadow 160ms ease;
  }
  .primary:hover { background: var(--accent-hover); box-shadow: var(--shadow-lift-mid); }
  .primary:disabled { background: var(--accent-muted); color: var(--ink-paper-muted); box-shadow: none; cursor: default; }
  /* Quiet secondary → warm paper, soft border, ink text (the .soft-btn shape). */
  .ghost {
    font-family: var(--font-body); font-size: 0.9rem; font-weight: 500;
    letter-spacing: 0.01em;
    padding: var(--space-2) var(--space-5); border-radius: var(--radius-sm); cursor: pointer;
    background: var(--surface-paper-card); color: var(--ink-paper-primary); border: 1px solid var(--border-canvas);
    transition: background 160ms ease, border-color 160ms ease;
  }
  .ghost:hover { background: var(--surface-paper-hover); border-color: var(--border-canvas-emphasis); }
</style>
