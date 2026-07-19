<script lang="ts">
  // Merge-review UI (CONTEXT collaboration UX — the #1 validation-priority invention; decision
  // Archie-d71c: MergeReview NON-BLOCKING). Drives the headless-tested AnnotationSession.conflicts/
  // conflictHeads/resolve. The "am I done? what happened?" summary now lives in App's status strip
  // (absent-when-idle) — this component is ONLY the "Review steps conflict cards at leisure" half: a
  // scrimmed surface (the shared modality contract, same as ShortcutsHelp/Publish) opened from that
  // strip's "Review" action, source-agnostic over however `conflicts` got populated (a merged zip
  // import or a live-sync session — this component reads nothing but the session/conflicts it's given).
  // KEEP-BOTH CUT: `keep()` calls session.resolve, which appends a keep-one-head merge node — the DAG
  // preserves the loser in history (MERGE-CONTRACT.md C12); there is no field-level merge here.
  import type { AnnotationSession, LogicalId, AnnotationRecord, W3CBody } from "@render/core";
  import { scrimmed, trapFocus, modality } from "./modality.svelte.js";

  let { open, onclose, session, conflicts, onchange }: {
    open: boolean;
    onclose: () => void;
    session: AnnotationSession;
    conflicts: string[];
    onchange: () => void;
  } = $props();

  const current = $derived(conflicts[0]);
  const heads = $derived<AnnotationRecord[]>(current ? session.conflictHeads(current as LogicalId) : []);

  const bodyText = (r: AnnotationRecord): string => {
    const bs: W3CBody[] = Array.isArray(r.body) ? r.body : r.body ? [r.body] : [];
    const c = bs.find((b) => { const p = (b as { purpose?: string }).purpose; return p === undefined || p === "commenting"; });
    return (c as { value?: string } | undefined)?.value ?? "(empty)";
  };

  function keep(head: AnnotationRecord) {
    // ADR-0007: tags (including legacy layers, folded into purpose:tagging bodies at load) ride on
    // `head.body`, so resolving with body+target preserves them — no separate `layers` arg needed.
    session.resolve(current as LogicalId, { body: head.body, target: head.target });
    onchange();
    if (conflicts.length <= 1) onclose(); // parent recomputed; this was the last one — nothing left to review
  }
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={() => modality.dismiss()}></div>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Review conflicting notes" tabindex="-1"
    use:scrimmed={{ onClose: onclose }} onkeydown={trapFocus} onclick={(e) => e.stopPropagation()}>
    <button class="close" onclick={onclose} aria-label="Close">✕</button>
    {#if current}
      <p class="eyebrow">Resolve · {conflicts.length} left</p>
      <h2>Two people edited this note</h2>
      <p class="lead">Keep one version. The other stays in history.</p>
      {#each heads as h (h.rev)}
        <button class="side" onclick={() => keep(h)}>
          <span class="who">{h.lastEditor}</span>
          <span class="text">{bodyText(h)}</span>
        </button>
      {/each}
    {:else}
      <p class="lead">Nothing left to review.</p>
    {/if}
  </div>
{/if}

<style>
  /* Soft Static dialog — warm paper card floating over a hazy warm scrim (matches ShortcutsHelp/IdentityPrompt). */
  .scrim { position: fixed; inset: 0; background: rgba(59, 49, 56, 0.55); z-index: 40; }
  .dialog {
    position: fixed; z-index: 41; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(34rem, calc(100vw - var(--space-8))); box-sizing: border-box;
    background: var(--surface-canvas-raised); color: var(--ink-paper-primary);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-lift-mid); padding: var(--space-6);
    display: flex; flex-direction: column; gap: var(--space-2);
  }
  .close { position: absolute; top: var(--space-4); right: var(--space-4); cursor: pointer; background: none; border: none; font-size: 1rem; color: var(--ink-paper-muted); padding: 0 var(--space-1); border-radius: var(--radius-sm); transition: color 160ms ease; }
  .close:hover { color: var(--ink-paper-primary); }
  .eyebrow { margin: 0; }
  h2 { margin: 0; font-family: var(--font-display); font-size: 1.5rem; font-weight: 400; line-height: 1.3; color: var(--ink-paper-primary); }
  .lead { margin: 0 0 var(--space-2); font-family: var(--font-body); font-size: 0.95rem; line-height: 1.6; color: var(--ink-paper-secondary); }
  .side { text-align: left; cursor: pointer; padding: var(--space-3); border: 1px solid var(--border-canvas); border-left: 3px solid transparent; border-radius: var(--radius-sm); background: var(--surface-paper); display: flex; flex-direction: column; gap: var(--space-1); transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease; }
  .side:hover { border-left-color: var(--accent); background: var(--surface-paper-hover); box-shadow: var(--shadow-lift-low); }
  .who { font-family: var(--font-ui); font-size: 0.65rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-muted); }
  .text { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.6; color: var(--ink-paper-primary); }
</style>
