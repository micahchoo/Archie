<script lang="ts">
  // "Publish to the web" dialog (plan Task 10) — the desktop one-button, novice-first GitHub-Pages path
  // that replaces the old 5-field PAT wall. The state machine + all copy live in publish-machine.svelte.ts
  // (owned there so it's typechecked + headlessly testable — see that file's header + Publish.test.ts);
  // THIS file is the thin view that renders each state and wires the real platform seams.
  //
  // The legacy 5-field token form survives VERBATIM as the `advanced` state (the browser GitHub path and
  // the power-user / fork escape hatch), behind "I already use GitHub →". It keeps its own local state and
  // the original `onpublish` prop — nothing about it changed.
  import type { GitHubTarget, BrokenLink, IncompleteCanvas, GitHubPublishResult, PublishProgress } from "@render/core";
  import type { DeploySession, DeployTarget, DeployProgress } from "./deploy/types.js";
  import type { DeployResult } from "./deploy/deploy-flows.svelte.js";
  import { createPublishMachine } from "./publish-machine.svelte.js";
  import { isTauri } from "./tauri-fs.js";

  let {
    open = false,
    onclose,
    // --- desktop device-flow seams (App.svelte wires these from deploy-flows in Task 13) ---
    library = { id: "", title: "" },
    deviceFlowAvailable = false,
    remembered = null,
    initialSession = null,
    signIn,
    persistSession,
    deploy,
    /** Optional: web-intro "share a link instead" → route back to the chooser's zip/?src= path (Task 13). */
    onusezip,
    // --- legacy advanced (token) form — verbatim, unchanged interface ---
    onpublish,
    brokenLinks = [],
    incompleteCanvases = [],
  }: {
    open?: boolean;
    onclose: () => void;
    library?: { id: string; title: string };
    deviceFlowAvailable?: boolean;
    remembered?: { target: DeployTarget; url: string } | null;
    initialSession?: DeploySession | null;
    signIn?: (onCode: (c: { userCode: string; verificationUri: string; expiresIn: number }) => void) => Promise<DeploySession>;
    persistSession?: (s: DeploySession) => Promise<boolean>;
    deploy?: (session: DeploySession, target: DeployTarget, onProgress: (p: DeployProgress) => void) => Promise<DeployResult>;
    onusezip?: () => void;
    onpublish: (target: GitHubTarget, opts: { includeOriginals: boolean }, onProgress: (p: PublishProgress) => void) => Promise<GitHubPublishResult>;
    /** Intra-Library links that won't resolve in the published site — they degrade to plain text. */
    brokenLinks?: BrokenLink[];
    /** Image objects publishing with no width/height (IIIF Pres 3 §5.3) — usually a failed ingest-time probe. */
    incompleteCanvases?: IncompleteCanvas[];
  } = $props();

  const isTauriEnv = isTauri();

  /** Open a URL in the system browser: opener plugin on desktop, a new tab on web. */
  async function defaultOpenUrl(url: string): Promise<void> {
    if (isTauriEnv) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } else if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener");
    }
  }
  async function defaultCopy(text: string): Promise<void> {
    if (typeof navigator !== "undefined" && navigator.clipboard) await navigator.clipboard.writeText(text);
  }

  const machine = createPublishMachine({
    isTauriEnv,
    deviceFlowAvailable,
    library,
    remembered,
    initialSession,
    // Safe fallbacks so the view never throws if a seam is unwired (real ones arrive from App in Task 13).
    signIn: signIn ?? (async () => { throw { kind: "device-flow-disabled", message: "GitHub sign-in isn't available in this build." }; }),
    persistSession: persistSession ?? (async () => false),
    deploy: deploy ?? (async () => { throw { kind: "push", message: "Publishing to the web isn't available here." }; }),
    openUrl: defaultOpenUrl,
    copy: defaultCopy,
  });

  // (Re)compute the opening screen each time the dialog opens.
  $effect(() => { if (open) machine.open(); });
  // Tick the device-code countdown once a second while it's showing.
  $effect(() => {
    if (machine.state !== "device-code") return;
    const id = setInterval(() => machine.tick(), 1000);
    return () => clearInterval(id);
  });

  // The commit link on the success screen (the ▸ Details disclosure).
  const commitUrl = $derived(
    machine.result ? `https://github.com/${machine.owner.trim()}/${machine.repo.trim()}/commit/${machine.result.commitSha}` : "",
  );
  let showDetails = $state(false);

  function close() {
    token = ""; // never retain the advanced-form secret across a close
    onclose();
  }

  // ===========================================================================================
  // Advanced (token) form — VERBATIM from the pre-Task-10 dialog. Its own local state + the legacy
  // `onpublish` prop; the machine above does not touch these. (CONTEXT: token not stored — it lives
  // only here for the duration of one publish and is dropped after.)
  // ===========================================================================================
  let includeOriginals = $state(false); // opt-in: ship preserved source originals for citation (CONTEXT §89.1)

  // A broken link's target, typed for display (the cited exhibit/note that isn't in this library).
  const tgt = (b: BrokenLink) => b.target as { exhibitSlug?: string; noteLogicalId?: string };

  let owner = $state("");
  let repo = $state("");
  let branch = $state("gh-pages");
  let token = $state("");
  let phase = $state<"idle" | "publishing" | "done" | "error">("idle");
  let commitUrlAdv = $state("");
  let pagesUrl = $state("");          // visitor-facing URL, returned by publishToGitHub (project- vs user-site aware)
  let pagesEnabled = $state(false);   // false ⇒ the push landed but Pages must be enabled manually
  let errorMsg = $state("");
  let progress = $state<PublishProgress | null>(null); // live step from publishToGitHub while publishing

  // Human-readable progress for the long push (media upload is one request per asset → show the count).
  const progressText = $derived(
    progress?.phase === "uploading" ? `Uploading media — ${progress.done} of ${progress.total}…`
    : progress?.phase === "committing" ? "Creating the commit…"
    : progress?.phase === "enabling-pages" ? "Turning on GitHub Pages…"
    : "Preparing the library…",
  );

  // Owner/repo are bare names — reject a pasted URL or "owner/repo" before it becomes a confusing 404.
  const nameError = $derived(
    /[/\s]/.test(owner.trim()) || /[/\s]/.test(repo.trim()) ? "Enter just the names — no slashes, spaces, or full URLs." : "",
  );
  const canPublish = $derived(owner.trim() !== "" && repo.trim() !== "" && token.trim() !== "" && nameError === "" && phase !== "publishing");
  // Where the author flips Pages on if we couldn't (private repo / token without Pages scope).
  const pagesSettingsUrl = $derived(`https://github.com/${owner.trim()}/${repo.trim()}/settings/pages`);

  async function advPublish() {
    phase = "publishing";
    errorMsg = "";
    progress = null;
    try {
      const target: GitHubTarget = { owner: owner.trim(), repo: repo.trim(), branch: branch.trim() || "gh-pages", token: token.trim() };
      const res = await onpublish(target, { includeOriginals }, (p) => (progress = p));
      commitUrlAdv = res.commitUrl;
      pagesUrl = res.pagesUrl;
      pagesEnabled = res.pagesEnabled;
      phase = "done";
      token = ""; // drop the secret the instant we're done with it
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : "Couldn't publish. Check the repository name and that your token has Contents and Pages write access.";
      phase = "error";
      token = ""; // never retain the secret across an error either
    }
  }
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={close}></div>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Publish to the web">

    {#if machine.state === "intro-desktop"}
      <header>
        <p class="eyebrow">Publish</p>
        <h2>Put this on the web — free, and it's yours.</h2>
        <p class="lede">Archie publishes your library as a real website on GitHub Pages. It's free, permanent, and the address belongs to you.</p>
      </header>
      <div class="stack">
        {#if machine.canContinueWithGitHub}
          <button class="primary big" onclick={() => machine.continueWithGitHub()}>Continue with GitHub</button>
        {/if}
        <div class="quiet-links">
          <button type="button" class="linkish" onclick={() => defaultOpenUrl("https://github.com/signup")}>No GitHub account? Make one free</button>
          <button type="button" class="linkish" onclick={() => machine.openAdvanced()}>I already use GitHub →</button>
        </div>
      </div>
      <div class="actions"><button type="button" class="ghost" onclick={close}>Cancel</button></div>

    {:else if machine.state === "device-code"}
      <header>
        <p class="eyebrow">Publish</p>
        <h2>One quick step to connect.</h2>
      </header>
      <div class="stack">
        <div class="code-row">
          <span class="code" aria-label="Your one-time code">{machine.code?.userCode}</span>
          <button type="button" class="ghost" onclick={() => machine.copyCode()}>Copy code</button>
        </div>
        <button class="primary" onclick={() => machine.openDevicePage()}>Open GitHub to enter it</button>
        <p class="note">Paste the code there and click Authorize. We'll pick it up automatically — come back here.</p>
        <p class="waiting" role="status">
          <span class="spinner" aria-hidden="true"></span>
          Waiting for you to authorize… <span class="muted">(expires {machine.countdownLabel})</span>
        </p>
      </div>
      <div class="actions"><button type="button" class="ghost" onclick={close}>Cancel</button></div>

    {:else if machine.state === "auth-cancelled"}
      <header>
        <p class="eyebrow">Publish</p>
        <h2>Sign-in was cancelled.</h2>
        <p class="lede">No problem — try again when you're ready.</p>
      </header>
      <div class="actions">
        <button type="button" class="ghost" onclick={close}>Cancel</button>
        <button class="primary" onclick={() => machine.retryAuth()}>Try again</button>
      </div>

    {:else if machine.state === "auth-config-error"}
      <header>
        <p class="eyebrow">Publish</p>
        <h2>GitHub sign-in isn't set up.</h2>
        <p class="lede">{machine.errorCopy.message}</p>
      </header>
      <div class="actions">
        <button type="button" class="ghost" onclick={close}>Cancel</button>
        <button class="primary" onclick={() => machine.openAdvanced()}>I already use GitHub →</button>
      </div>

    {:else if machine.state === "name-site"}
      <header>
        <p class="eyebrow">Publish{#if machine.session}<span class="handle"> · @{machine.session.login}</span>{/if}</p>
        <h2>Name your site.</h2>
      </header>
      <!-- Task 11 seam: this is the minimal target entry. Task 11 adds the live "Your site will live at ___"
           preview (pagesUrlFor), the "Anyone with the link can see it" toggle, and the name-taken path. -->
      <div class="stack">
        <label class="field">Site name<input bind:value={machine.repo} autocomplete="off" spellcheck="false" /></label>
        <p class="note">Letters, numbers and dashes. This becomes part of your web address.</p>
        <label class="cb"><input type="checkbox" bind:checked={machine.staySignedIn} /><span class="cb-text">Stay signed in on this computer</span></label>
      </div>
      <div class="actions">
        <button type="button" class="ghost" onclick={close}>Cancel</button>
        <button class="primary" disabled={machine.repo.trim() === ""} onclick={() => machine.publish()}>Publish</button>
      </div>

    {:else if machine.state === "publishing"}
      <header>
        <p class="eyebrow">Publish</p>
        <h2>Publishing…</h2>
      </header>
      <ul class="checklist">
        {#each machine.steps as step}
          <li class={step.status}>
            <span class="tick" aria-hidden="true">{step.status === "done" ? "✓" : step.status === "active" ? "" : "○"}</span>
            {#if step.status === "active"}<span class="spinner sm" aria-hidden="true"></span>{/if}
            <span class="step-label">{step.label}</span>
          </li>
        {/each}
        {#if machine.buildingPages}
          <li class="active"><span class="spinner sm" aria-hidden="true"></span><span class="step-label">GitHub is building your site…</span></li>
        {/if}
      </ul>
      <p class="note">This usually takes under a minute. You can leave this open.</p>

    {:else if machine.state === "success"}
      <header>
        <p class="eyebrow">Publish</p>
        <h2>Your site is live.</h2>
      </header>
      <div class="stack">
        <a class="hero-url" href={machine.result?.url} target="_blank" rel="noopener">{machine.result?.url}</a>
        <div class="hero-actions">
          <button class="primary" onclick={() => machine.openSite()}>Open my site</button>
          <button type="button" class="ghost" onclick={() => machine.copyLink()}>Copy link</button>
        </div>
        <p class="note">GitHub may take a minute to finish the first build — if it's blank, refresh in a moment.</p>
        <p class="note">Made changes? Just hit <strong>Publish to the web</strong> again — it updates the same site.</p>
        {#if machine.result?.manualPagesNeeded}
          <p class="note warn">Your files are up, but GitHub Pages needs one manual switch for this repository. Open <a href={`https://github.com/${machine.owner.trim()}/${machine.repo.trim()}/settings/pages`} target="_blank" rel="noopener">Settings › Pages</a> and set the source to the <code>gh-pages</code> branch.</p>
        {/if}
        {#if machine.persistFailed}
          <p class="note muted">We couldn't keep you signed in on this computer — you'll sign in again next time.</p>
        {/if}
        <div class="details">
          <button type="button" class="linkish" onclick={() => (showDetails = !showDetails)}>{showDetails ? "▾" : "▸"} Details</button>
          {#if showDetails}
            <p class="note"><a href={commitUrl} target="_blank" rel="noopener">Commit {machine.result?.commitSha.slice(0, 7)}</a></p>
          {/if}
        </div>
      </div>
      <div class="actions"><button type="button" class="ghost" onclick={close}>Done</button></div>

    {:else if machine.state === "error"}
      <header>
        <p class="eyebrow">Publish</p>
        <h2>Something went wrong.</h2>
        <p class="lede">{machine.errorCopy.message}</p>
      </header>
      <div class="actions">
        <button type="button" class="ghost" onclick={close}>Cancel</button>
        {#if machine.errorCopy.offerSignInAgain}
          <button class="primary" onclick={() => machine.signInAgain()}>Sign in again</button>
        {:else}
          <button class="primary" onclick={() => machine.retryPublish()}>Try again</button>
        {/if}
      </div>

    {:else if machine.state === "web-intro"}
      <header>
        <p class="eyebrow">Publish</p>
        <h2>Share your library.</h2>
        <p class="lede">GitHub sign-in can't run safely from a browser tab, so the one-button publish lives in the Archie desktop app. From here you can still share your library as a link.</p>
      </header>
      <div class="stack">
        {#if onusezip}
          <button class="primary" onclick={onusezip}>Share with a link</button>
        {/if}
        <p class="note">Want a permanent site you own? Open Archie on your desktop to publish straight to GitHub Pages.</p>
        <div class="quiet-links">
          <button type="button" class="linkish" onclick={() => machine.openAdvanced()}>I already use GitHub →</button>
        </div>
      </div>
      <div class="actions"><button type="button" class="ghost" onclick={close}>Cancel</button></div>

    {:else if machine.state === "advanced"}
      <!-- ADVANCED (token) form — verbatim pre-Task-10 dialog. -->
      <header>
        <p class="eyebrow">Publish</p>
        <h2>Connect to GitHub</h2>
        <p class="lede">Publish your whole library, every exhibit, to a GitHub Pages branch. Your token is used once to publish and is never stored.</p>
      </header>

      {#if phase === "done"}
        <div class="result">
          <p class="ok">Published to GitHub Pages.</p>
          <p class="line">Commit · <a href={commitUrlAdv} target="_blank" rel="noopener">{commitUrlAdv}</a></p>
          {#if pagesEnabled}
            <p class="line">Pages · <a href={pagesUrl} target="_blank" rel="noopener">{pagesUrl}</a> <span class="muted">(may take a minute to go live)</span></p>
          {:else}
            <p class="line">Your files are on the <code>{branch}</code> branch. One step left to put them on the web: turn on GitHub Pages for this repository.</p>
            <p class="line">Open <a href={pagesSettingsUrl} target="_blank" rel="noopener">Settings, then Pages</a>, choose <em>Deploy from a branch</em>, and pick the <code>{branch}</code> branch. Your site then appears at <a href={pagesUrl} target="_blank" rel="noopener">{pagesUrl}</a>.</p>
          {/if}
          <p class="line muted">A published Pages site is read-only. To keep editing, open your library in Studio.</p>
          <button class="primary" onclick={close}>Done</button>
        </div>
      {:else}
        <form onsubmit={(e) => { e.preventDefault(); if (canPublish) void advPublish(); }}>
          {#if brokenLinks.length > 0}
            <div class="broken" role="status">
              <p class="b-head">{brokenLinks.length} cited {brokenLinks.length === 1 ? "link" : "links"} will publish as plain text</p>
              <p class="b-sub">These links point to a note or exhibit that isn't in this library, so they have nowhere to go. Publishing continues — the words stay readable, just without the link.</p>
              <ul>
                {#each brokenLinks.slice(0, 5) as b}
                  <li>in <code>/{b.exhibitSlug}</code>{#if tgt(b).exhibitSlug} → <code>/{tgt(b).exhibitSlug}</code>{/if}{#if tgt(b).noteLogicalId} · a cited note{/if}</li>
                {/each}
                {#if brokenLinks.length > 5}<li class="more">…and {brokenLinks.length - 5} more</li>{/if}
              </ul>
            </div>
          {/if}
          {#if incompleteCanvases.length > 0}
            <div class="broken" role="status">
              <p class="b-head">{incompleteCanvases.length} {incompleteCanvases.length === 1 ? "image has" : "images have"} no known width/height</p>
              <p class="b-sub">Some IIIF viewers need an image's pixel dimensions to display it — these will still publish, but may not render correctly outside Archie. This usually means the image couldn't be loaded when added; try re-adding it.</p>
              <ul>
                {#each incompleteCanvases.slice(0, 5) as c}
                  <li>{c.label}</li>
                {/each}
                {#if incompleteCanvases.length > 5}<li class="more">…and {incompleteCanvases.length - 5} more</li>{/if}
              </ul>
            </div>
          {/if}
          <div class="row">
            <label>Owner<input bind:value={owner} placeholder="your-username" autocomplete="off" /></label>
            <label>Repository<input bind:value={repo} placeholder="my-exhibit" autocomplete="off" /></label>
          </div>
          {#if nameError}<p class="err">{nameError}</p>{/if}
          <label>Branch<input bind:value={branch} placeholder="gh-pages" autocomplete="off" /></label>
          <p class="note">Publishing <strong>replaces everything</strong> on this branch with the current library — use a branch you keep for the published site (<code>gh-pages</code> by default).</p>
          <label>Access token (fine-grained, with Contents and Pages write access)
            <input type="password" bind:value={token} placeholder="github_pat_…" autocomplete="off" />
          </label>
          <label class="cb"><input type="checkbox" bind:checked={includeOriginals} /><span class="cb-text">Include source originals for citation <span class="cb-sub">— preserved un-edited uploads, published beside the exhibit</span></span></label>
          <p class="note">Your token stays in this browser — it's sent only to GitHub to publish, then dropped the moment it's done. Archie never stores it. Giving the token <strong>Pages</strong> write access lets Archie switch on your live site for you; without it, publishing still works and you flip the switch yourself (we'll show you where).</p>
          {#if phase === "publishing"}<p class="note" role="status">{progressText} <span class="muted">Keep this tab open.</span></p>{/if}
          {#if phase === "error"}<p class="err">{errorMsg}</p>{/if}
          <div class="actions">
            <button type="button" class="ghost" onclick={() => machine.backToIntro()}>← Back</button>
            <button type="submit" class="primary" disabled={!canPublish}>{phase === "publishing" ? "Publishing…" : "Publish"}</button>
          </div>
        </form>
      {/if}
    {/if}
  </div>
{/if}

<style>
  /* Soft Static: warm paper dialog floating on a warm-charcoal scrim — soft lift shadow,
     generous rounded corners, no hard border. The single Publish action carries the
     rationed signal-orange; Cancel and the warning stay quiet. */
  .scrim { position: fixed; inset: 0; background: rgba(59,49,56,0.55); backdrop-filter: blur(2px); z-index: 40; }
  .dialog {
    position: fixed; z-index: 41; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(34rem, calc(100vw - var(--space-8))); box-sizing: border-box;
    background: var(--surface-canvas-raised); color: var(--ink-paper-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lift-mid);
    padding: var(--space-6);
  }
  header { margin-bottom: var(--space-5); }
  .eyebrow { color: var(--ink-paper-muted); }
  .handle { color: var(--ink-paper-secondary); }
  h2 { font-family: var(--font-display); font-size: 1.75rem; font-weight: 400; line-height: 1.15; margin: var(--space-1) 0 var(--space-2); color: var(--ink-paper-primary); text-shadow: var(--shadow-text-haze); }
  .lede { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.6; color: var(--ink-paper-secondary); margin: 0; }

  /* Vertical stack used by the machine states (intro / device-code / name-site / success / web). */
  .stack { display: flex; flex-direction: column; gap: var(--space-3); }
  .quiet-links { display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start; }
  .linkish {
    background: none; border: none; padding: 0; cursor: pointer; text-align: left;
    font-family: var(--font-body); font-size: 0.875rem; color: var(--accent-2);
  }
  .linkish:hover { text-decoration: underline; }

  .field { display: flex; flex-direction: column; gap: var(--space-1); font-family: var(--font-ui); font-size: 0.7rem; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-paper-muted); }

  /* Device-code screen — a large, calm monospace code the user copies to GitHub. */
  .code-row { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .code {
    font-family: var(--font-mono); font-size: 2rem; font-weight: 600; letter-spacing: 0.2em;
    padding: var(--space-3) var(--space-4); color: var(--ink-paper-primary);
    background: var(--surface-canvas-overlay); border-radius: var(--radius-sm); box-shadow: var(--shadow-inset-fog);
  }
  .waiting { display: flex; align-items: center; gap: var(--space-2); font-family: var(--font-body); font-size: 0.9rem; color: var(--ink-paper-secondary); margin: 0; }
  .spinner {
    width: 1rem; height: 1rem; border-radius: 50%; flex: none;
    border: 2px solid var(--border-canvas); border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
  }
  .spinner.sm { width: 0.8rem; height: 0.8rem; border-width: 2px; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Publishing checklist — steps tick in order. */
  .checklist { list-style: none; margin: 0 0 var(--space-4); padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .checklist li { display: flex; align-items: center; gap: var(--space-2); font-family: var(--font-body); font-size: 0.95rem; color: var(--ink-paper-muted); }
  .checklist li.done { color: var(--ink-paper-secondary); }
  .checklist li.active { color: var(--ink-paper-primary); }
  .checklist .tick { width: 1rem; text-align: center; color: var(--semantic-success); }
  .checklist li.pending .tick { color: var(--ink-paper-muted); }

  /* Success hero — the live URL is the focal element. */
  .hero-url { display: block; font-family: var(--font-mono); font-size: 1.15rem; color: var(--accent-2); word-break: break-all; text-decoration: none; }
  .hero-url:hover { text-decoration: underline; }
  .hero-actions { display: flex; gap: var(--space-3); }
  .details { margin-top: var(--space-1); }

  .note { font-family: var(--font-body); font-size: 0.78rem; line-height: 1.6; color: var(--ink-paper-muted); margin: 0; }
  .note.warn { color: var(--ink-paper-secondary); }
  .note a { color: var(--accent-2); }
  /* Checkbox rows (stay-signed-in + citation opt-in). */
  .cb { flex-direction: row; align-items: flex-start; gap: var(--space-2); text-transform: none; letter-spacing: 0; font-weight: 400; }
  .cb input { margin-top: 2px; accent-color: var(--accent-2); }
  .cb-text { font-family: var(--font-body); font-size: 0.8125rem; color: var(--ink-paper-primary); }
  .cb-sub { color: var(--ink-paper-secondary); }

  /* --- advanced (token) form — verbatim styles --- */
  form { display: flex; flex-direction: column; gap: var(--space-3); }
  .row { display: flex; gap: var(--space-3); }
  .row label { flex: 1; }
  label { display: flex; flex-direction: column; gap: var(--space-1); font-family: var(--font-ui); font-size: 0.7rem; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-paper-muted); }
  input {
    font-family: var(--font-body); font-size: 1rem; padding: var(--space-2) var(--space-3);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-canvas); border-radius: var(--radius-sm);
  }
  input:focus { outline: none; border-color: var(--accent-2); }

  /* Broken-link warning — quiet warm tint (degradation is recoverable, not an error). */
  .broken { padding: var(--space-3) var(--space-4); background: var(--surface-canvas-overlay); border-left: 3px solid var(--semantic-warning); border-radius: var(--radius-sm); box-shadow: var(--shadow-lift-low); }
  .broken .b-head { margin: 0; font-family: var(--font-ui); font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-paper-secondary); }
  .broken .b-sub { margin: var(--space-1) 0 var(--space-2); font-family: var(--font-body); font-size: 0.78rem; line-height: 1.6; color: var(--ink-paper-secondary); }
  .broken ul { margin: 0; padding-left: var(--space-4); }
  .broken li { font-family: var(--font-body); font-size: 0.78rem; line-height: 1.6; color: var(--ink-paper-secondary); }
  .broken code { font-family: var(--font-mono); font-size: 0.7rem; color: var(--ink-paper-primary); }
  .broken .more { list-style: none; color: var(--ink-paper-muted); }
  .err { font-family: var(--font-ui); font-size: 0.8rem; line-height: 1.5; color: var(--semantic-error); margin: 0; }

  .actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-2); }
  /* The ONE focal action → rationed signal-orange, soft rounded, signal glow. */
  .primary {
    font-family: var(--font-body); font-size: 0.9rem; font-weight: 600;
    letter-spacing: 0.01em;
    padding: var(--space-2) var(--space-5); border-radius: var(--radius-sm); cursor: pointer;
    background: var(--accent); color: var(--ink-on-accent); border: none;
    box-shadow: var(--shadow-signal-glow);
    transition: background 160ms ease, box-shadow 160ms ease;
  }
  .primary.big { padding: var(--space-3) var(--space-5); font-size: 1rem; }
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

  .result { display: flex; flex-direction: column; gap: var(--space-3); }
  .result .ok { font-family: var(--font-display); font-size: 1.5rem; font-weight: 400; color: var(--semantic-success); margin: 0; }
  .result .line { font-family: var(--font-body); font-size: 0.9rem; line-height: 1.6; color: var(--ink-paper-secondary); margin: 0; word-break: break-all; }
  .result a { color: var(--accent-2); }
  .result .muted { color: var(--ink-paper-muted); }
  .result .primary { align-self: flex-end; margin-top: var(--space-2); }
  code { font-family: var(--font-mono); font-size: 0.8rem; color: var(--ink-paper-primary); }
  .muted { color: var(--ink-paper-muted); }
</style>
