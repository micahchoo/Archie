<script lang="ts">
  // THE HOME CARD (Q-15) — what an author sees on every publish after the first.
  //
  // The destination was decided once, in SetupFlow, and remembered (`deploy/remembered.ts`). So this
  // screen does not ask anything: it states where the library lives, when it last went, what the next
  // publish weighs, and offers one primary action. That is the ≤2-click publish the redesign exists
  // for — open, press Publish changes.
  //
  // Changing the home is deliberately a quiet link rather than a control: it is rare, and it is the
  // one action here that throws away a decision.
  import { humanBytes } from "./archive-probe.js";
  import type { ArchiveProbe } from "./archive-probe.js";
  import type { RememberedHome } from "./deploy/remembered.js";

  let {
    home,
    probe = null,
    canPublish = true,
    carriesViewer = true,
    onpublish,
    onviewsite,
    onchangehome,
    onexport,
    onpreview,
    oncancel,
  }: {
    /** Where this library lives. Never null here — the surface routes to SetupFlow when there is no
     *  home, so this component never has to render an "unknown destination" state. */
    home: RememberedHome;
    probe?: ArchiveProbe | null;
    /** False ⇒ something blocks this publish (a preflight finding). The reason is shown by the caller;
     *  the button simply refuses rather than redirecting. */
    canPublish?: boolean;
    /** Whether the tree carries its own reader (Archie-e09d — true for the folder and GitHub sinks). */
    carriesViewer?: boolean;
    onpublish: () => void;
    /** Absent ⇒ no address to visit (a folder home has no URL to open). */
    onviewsite?: () => void;
    onchangehome: () => void;
    onexport?: () => void;
    onpreview?: () => void;
    oncancel: () => void;
  } = $props();

  /** "2 days ago". Absent `publishedAt` renders NOTHING rather than "never": every record written
   *  before Q-15 lacks the field, and an author who has published a dozen times should not be told
   *  they never have. */
  const lastPublished = $derived.by(() => {
    if (typeof home.publishedAt !== "number") return "";
    const ms = Date.now() - home.publishedAt;
    if (ms < 0) return ""; // a clock that moved backwards — say nothing rather than "in 3 hours"
    const mins = Math.floor(ms / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    if (days < 31) return `${days} day${days === 1 ? "" : "s"} ago`;
    const months = Math.floor(days / 30);
    return `${months} month${months === 1 ? "" : "s"} ago`;
  });

  /** The next publish's weight, at the tier the surface is on. One line, stated once. */
  const facts = $derived.by(() => {
    const v = probe?.destinations.find((d) => d.destination === "github-pages");
    if (!v) return "";
    const parts = [humanBytes(v.estimatedBytes), `${v.estimatedFiles.toLocaleString()} files`];
    if (typeof v.estimatedUploadMinutes === "number" && v.estimatedUploadMinutes >= 2) {
      parts.push(`about ${Math.round(v.estimatedUploadMinutes)} minutes to upload`);
    }
    return parts.join(" · ");
  });
</script>

<header>
  <p class="eyebrow">Publish</p>
  <h2>Publish your changes</h2>
</header>

<div class="home" data-home={home.target.repo ? "github-pages" : "folder"}>
  <p class="h-label">Your library lives at</p>
  <p class="h-url" data-home-url={home.url}>{home.url}</p>
  <p class="h-meta">
    {#if lastPublished}<span data-last-published>Last published {lastPublished}</span>{/if}
    {#if facts}<span class="h-facts">{facts}</span>{/if}
    {#if carriesViewer}<span class="h-facts">The site carries its own reader, so it works on any host.</span>{/if}
  </p>
</div>

<div class="actions">
  {#if onpreview}
    <button type="button" class="ghost" onclick={onpreview}>Preview as reader</button>
  {/if}
  {#if onviewsite}
    <button type="button" class="ghost" data-action="view-site" onclick={onviewsite}>View site</button>
  {/if}
  <button type="button" class="ghost" onclick={oncancel}>Cancel</button>
  <button class="primary" data-action="publish-changes" disabled={!canPublish} onclick={onpublish}>Publish changes</button>
</div>

<div class="extras">
  <!-- Rare, and it discards a decision — so a link, not a control competing with the primary action. -->
  <button type="button" class="x-link" data-action="change-home" onclick={onchangehome}>Change where this publishes…</button>
  {#if onexport}
    <button type="button" class="x-link" data-action="open-export-menu" onclick={onexport}>
      Export a copy instead — a working copy, a readable copy, or a deposit copy →
    </button>
  {/if}
</div>

<style>
  .home { padding: var(--space-4); background: var(--surface-paper-card); border: 1px solid var(--border-paper); border-radius: var(--radius-md); box-shadow: var(--shadow-lift-low); }
  .h-label { font-family: var(--font-ui); font-size: 0.68rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-muted); margin: 0 0 var(--space-1); }
  .h-url { font-family: var(--font-mono); font-size: 0.95rem; color: var(--ink-paper-primary); margin: 0 0 var(--space-2); word-break: break-all; }
  .h-meta { display: flex; flex-direction: column; gap: var(--space-1); margin: 0; }
  .h-meta span, .h-facts { font-family: var(--font-body); font-size: 0.82rem; line-height: 1.5; color: var(--ink-paper-secondary); }
  .actions { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-4); }
  .extras { margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--border-paper); display: flex; flex-direction: column; gap: var(--space-1); align-items: flex-start; }
  .x-link { font-family: var(--font-body); font-size: 0.85rem; text-align: left; cursor: pointer; padding: var(--space-1) 0; background: transparent; border: 0; color: var(--ink-paper-secondary); text-decoration: underline; text-underline-offset: 3px; }
  .x-link:hover { color: var(--ink-paper-primary); }
</style>
