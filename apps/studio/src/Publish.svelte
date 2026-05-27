<script lang="ts">
  // "Connect to GitHub" publish dialog (Phase-2, strategy §32 — the lightest form of this minor
  // invention; closes the annotate→publish-to-GH-Pages value loop). The git-trees push lives in
  // @render/core `publishToGitHub`; this is the thin form + state machine. The PAT is paste-each-
  // publish and NEVER persisted (CONTEXT: token not stored) — it lives only in this component's
  // local state for the duration of one publish, never written to OPFS/localStorage.
  import type { GitHubTarget, BrokenLink, GitHubPublishResult, PublishProgress } from "@render/core";

  let {
    open = false,
    onclose,
    onpublish,
    brokenLinks = [],
  }: {
    open?: boolean;
    onclose: () => void;
    onpublish: (target: GitHubTarget, opts: { includeOriginals: boolean }, onProgress: (p: PublishProgress) => void) => Promise<GitHubPublishResult>;
    /** Intra-Library links that won't resolve in the published site — they degrade to plain text. */
    brokenLinks?: BrokenLink[];
  } = $props();

  let includeOriginals = $state(false); // opt-in: ship preserved source originals for citation (CONTEXT §89.1)

  // A broken link's target, typed for display (the cited exhibit/note that isn't in this library).
  const tgt = (b: BrokenLink) => b.target as { exhibitSlug?: string; noteLogicalId?: string };

  let owner = $state("");
  let repo = $state("");
  let branch = $state("gh-pages");
  let token = $state("");
  let phase = $state<"idle" | "publishing" | "done" | "error">("idle");
  let commitUrl = $state("");
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

  async function publish() {
    phase = "publishing";
    errorMsg = "";
    progress = null;
    try {
      const target: GitHubTarget = { owner: owner.trim(), repo: repo.trim(), branch: branch.trim() || "gh-pages", token: token.trim() };
      const res = await onpublish(target, { includeOriginals }, (p) => (progress = p));
      commitUrl = res.commitUrl;
      pagesUrl = res.pagesUrl;
      pagesEnabled = res.pagesEnabled;
      phase = "done";
      token = ""; // drop the secret the instant we're done with it
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : "Publish failed — check the repo name and token scope.";
      phase = "error";
      token = ""; // never retain the secret across an error either
    }
  }

  function close() {
    token = "";
    phase = "idle";
    progress = null;
    onclose();
  }
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={close}></div>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Publish to GitHub Pages">
    <header>
      <p class="eyebrow">Publish</p>
      <h2>Connect to GitHub</h2>
      <p class="lede">Publish this whole library — every exhibit — to a GitHub Pages branch. Your token is used once to publish and is never stored.</p>
    </header>

    {#if phase === "done"}
      <div class="result">
        <p class="ok">Published.</p>
        <p class="line">Commit · <a href={commitUrl} target="_blank" rel="noopener">{commitUrl}</a></p>
        {#if pagesEnabled}
          <p class="line">Pages · <a href={pagesUrl} target="_blank" rel="noopener">{pagesUrl}</a> <span class="muted">(may take a minute to go live)</span></p>
        {:else}
          <p class="line">Pushed to the <code>{branch}</code> branch. To serve it on the web, turn on GitHub Pages for this repo:</p>
          <p class="line"><a href={pagesSettingsUrl} target="_blank" rel="noopener">Settings → Pages</a> → <em>Deploy from a branch</em> → <code>{branch}</code>. It then appears at <a href={pagesUrl} target="_blank" rel="noopener">{pagesUrl}</a>.</p>
        {/if}
        <p class="line muted">For editing and the fullest experience, run the apps locally — a published Pages site is read-only.</p>
        <button class="primary" onclick={close}>Done</button>
      </div>
    {:else}
      <form onsubmit={(e) => { e.preventDefault(); if (canPublish) void publish(); }}>
        {#if brokenLinks.length > 0}
          <div class="broken" role="status">
            <p class="b-head">⚠ {brokenLinks.length} cited {brokenLinks.length === 1 ? "link" : "links"} will publish as plain text</p>
            <p class="b-sub">A note or exhibit a link points to isn't in this library, so the link can't resolve. Publishing continues — the link's words stay, the link drops.</p>
            <ul>
              {#each brokenLinks.slice(0, 5) as b}
                <li>in <code>/{b.exhibitSlug}</code>{#if tgt(b).exhibitSlug} → <code>/{tgt(b).exhibitSlug}</code>{/if}{#if tgt(b).noteLogicalId} · note <code>{(tgt(b).noteLogicalId ?? "").slice(0, 8)}</code>{/if}</li>
              {/each}
              {#if brokenLinks.length > 5}<li class="more">…and {brokenLinks.length - 5} more</li>{/if}
            </ul>
          </div>
        {/if}
        <div class="row">
          <label>Owner<input bind:value={owner} placeholder="your-username" autocomplete="off" /></label>
          <label>Repository<input bind:value={repo} placeholder="my-exhibit" autocomplete="off" /></label>
        </div>
        {#if nameError}<p class="err">⚠ {nameError}</p>{/if}
        <label>Branch<input bind:value={branch} placeholder="gh-pages" autocomplete="off" /></label>
        <p class="note">Publishing <strong>replaces everything</strong> on this branch with the current library — use a branch you keep for the published site (<code>gh-pages</code> by default).</p>
        <label>Access token (fine-grained PAT · Contents + Pages, write)
          <input type="password" bind:value={token} placeholder="github_pat_…" autocomplete="off" />
        </label>
        <label class="cb"><input type="checkbox" bind:checked={includeOriginals} /><span class="cb-text">Include source originals for citation <span class="cb-sub">— preserved un-edited uploads, published beside the exhibit</span></span></label>
        <p class="note">The token never leaves this browser except in the publish request to GitHub, and is dropped the moment publishing finishes. Archie does not store it. <strong>Pages</strong> write-access lets Archie turn on GitHub Pages for you; without it the push still works and you enable Pages by hand.</p>
        {#if phase === "publishing"}<p class="note" role="status">{progressText} <span class="muted">Keep this tab open.</span></p>{/if}
        {#if phase === "error"}<p class="err">⚠ {errorMsg}</p>{/if}
        <div class="actions">
          <button type="button" class="ghost" onclick={close}>Cancel</button>
          <button type="submit" class="primary" disabled={!canPublish}>{phase === "publishing" ? "Publishing…" : "Publish"}</button>
        </div>
      </form>
    {/if}
  </div>
{/if}

<style>
  /* A warm-paper dialog floating over the dark studio (system.md elevation: …→dialog). The study's
     lamplit page; the publish action carries the forest-green accent. */
  .scrim { position: fixed; inset: 0; background: rgba(12,11,9,0.62); z-index: 40; }
  .dialog {
    position: fixed; z-index: 41; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(34rem, calc(100vw - var(--space-8))); box-sizing: border-box;
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-lg);
    padding: var(--space-6);
  }
  header { margin-bottom: var(--space-5); }
  .eyebrow { color: var(--accent); }
  h2 { font-family: var(--font-display); font-size: 1.75rem; font-weight: 600; line-height: 1.1; margin: var(--space-1) 0 var(--space-2); color: var(--ink-paper-primary); }
  .lede { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.45; color: var(--ink-paper-secondary); margin: 0; }

  form { display: flex; flex-direction: column; gap: var(--space-3); }
  .row { display: flex; gap: var(--space-3); }
  .row label { flex: 1; }
  label { display: flex; flex-direction: column; gap: var(--space-1); font-family: var(--font-ui); font-size: 0.7rem; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-paper-secondary); }
  input {
    font-family: var(--font-body); font-size: 1rem; padding: var(--space-2) var(--space-3);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-sm);
  }
  input:focus { outline: none; border-color: var(--accent); }
  .note { font-family: var(--font-ui); font-size: 0.72rem; line-height: 1.55; color: var(--ink-paper-muted); margin: 0; }
  /* Citation opt-in (originals ship only when checked — CONTEXT §89.1). */
  .cb { flex-direction: row; align-items: flex-start; gap: var(--space-2); text-transform: none; letter-spacing: 0; font-weight: 400; }
  .cb input { margin-top: 2px; accent-color: var(--accent); }
  .cb-text { font-family: var(--font-ui); font-size: 0.8125rem; color: var(--ink-paper-primary); }
  .cb-sub { color: var(--ink-paper-secondary); }

  /* Broken-link warning — amber (degradation is recoverable by fixing the link, not an error). */
  .broken { padding: var(--space-3) var(--space-4); background: rgba(196,155,54,0.1); border: 1px solid var(--semantic-warning); border-radius: var(--radius-sm); }
  .broken .b-head { margin: 0; font-family: var(--font-ui); font-size: 0.8125rem; font-weight: 600; color: var(--ink-paper-primary); }
  .broken .b-sub { margin: var(--space-1) 0 var(--space-2); font-family: var(--font-ui); font-size: 0.72rem; line-height: 1.5; color: var(--ink-paper-secondary); }
  .broken ul { margin: 0; padding-left: var(--space-4); }
  .broken li { font-family: var(--font-ui); font-size: 0.72rem; line-height: 1.6; color: var(--ink-paper-secondary); }
  .broken code { font-family: var(--font-mono); font-size: 0.68rem; color: var(--ink-paper-primary); }
  .broken .more { list-style: none; color: var(--ink-paper-muted); }
  .err { font-family: var(--font-ui); font-size: 0.8rem; line-height: 1.5; color: var(--accent); margin: 0; }

  .actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-2); }
  button { font-family: var(--font-ui); font-size: 0.8125rem; font-weight: 500; padding: var(--space-2) var(--space-4); border-radius: var(--radius-sm); cursor: pointer; transition: background 120ms ease, border-color 120ms ease, color 120ms ease; }
  .ghost { background: none; color: var(--ink-paper-secondary); border: 1px solid var(--border-paper-emphasis); }
  .ghost:hover { color: var(--ink-paper-primary); border-color: var(--ink-paper-secondary); }
  .primary { background: var(--accent); color: var(--ink-on-accent); border: 1px solid var(--accent); }
  .primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
  .primary:disabled { background: var(--accent-muted); color: var(--ink-paper-muted); border-color: transparent; cursor: default; }

  .result { display: flex; flex-direction: column; gap: var(--space-3); }
  .result .ok { font-family: var(--font-display); font-size: 1.5rem; font-weight: 600; color: var(--semantic-success); margin: 0; }
  .result .line { font-family: var(--font-ui); font-size: 0.85rem; line-height: 1.5; color: var(--ink-paper-secondary); margin: 0; word-break: break-all; }
  .result a { color: var(--accent); }
  .result .muted { color: var(--ink-paper-muted); }
  .result .primary { align-self: flex-end; margin-top: var(--space-2); }
</style>
