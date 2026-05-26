<script lang="ts">
  // Merge-review UI (CONTEXT collaboration UX — the #1 validation-priority invention). Drives the
  // headless-tested AnnotationSession.importChanges/conflicts/resolve. Summary panel answers
  // "am I done?" + "what happened?"; Review steps through conflict cards (a WADM-form variant
  // showing both sides). BROWSER + HUMAN-GATED (§83): build the prototype, the user runs the
  // comprehension test ("does a non-technical author grok the summary panel unprompted?").
  import type { AnnotationSession, LogicalId, AnnotationRecord, W3CBody } from "@render/core";

  let { session, conflicts, synced, onchange }: {
    session: AnnotationSession;
    conflicts: string[];
    synced: number;
    onchange: () => void;
  } = $props();

  let reviewing = $state(false);
  const current = $derived(conflicts[0]);
  const heads = $derived<AnnotationRecord[]>(current ? session.conflictHeads(current as LogicalId) : []);

  const bodyText = (r: AnnotationRecord): string => {
    const bs: W3CBody[] = Array.isArray(r.body) ? r.body : r.body ? [r.body] : [];
    const c = bs.find((b) => { const p = (b as { purpose?: string }).purpose; return p === undefined || p === "commenting"; });
    return (c as { value?: string } | undefined)?.value ?? "(empty)";
  };

  function keep(head: AnnotationRecord) {
    session.resolve(current as LogicalId, { body: head.body, target: head.target, ...(head.layers ? { layers: head.layers } : {}) });
    onchange();
    if (conflicts.length === 0) reviewing = false; // parent recomputed; nothing left
  }
</script>

{#if conflicts.length > 0}
  {#if !reviewing}
    <div class="summary" role="status">
      <span class="msg"><strong>Synced {synced} {synced === 1 ? "note" : "notes"} from a colleague.</strong> {conflicts.length} {conflicts.length === 1 ? "needs" : "need"} your decision.</span>
      <span class="actions">
        <button class="primary" onclick={() => (reviewing = true)}>Review</button>
        <button class="ghost" onclick={() => (synced = 0)}>Later</button>
      </span>
    </div>
  {:else if current}
    <div class="card">
      <p class="eyebrow">Resolve · {conflicts.length} left</p>
      <h3>Two people edited this note</h3>
      <p class="lead">Keep one version. The other stays in history.</p>
      {#each heads as h (h.rev)}
        <button class="side" onclick={() => keep(h)}>
          <span class="who">{h.lastEditor}</span>
          <span class="text">{bodyText(h)}</span>
        </button>
      {/each}
    </div>
  {/if}
{/if}

<style>
  /* Summary panel — one calm line answering "am I done?" on warm paper, forest-green accent. */
  .summary {
    display: flex; align-items: center; gap: var(--space-4);
    margin-bottom: var(--space-4); padding: var(--space-3) var(--space-4);
    background: var(--surface-paper-card); border: 1px solid var(--border-paper);
    border-left: 3px solid var(--accent); border-radius: var(--radius-md);
  }
  .msg { font-family: var(--font-body); font-size: 1rem; line-height: 1.4; color: var(--ink-paper-primary); }
  .actions { margin-left: auto; display: flex; gap: var(--space-2); flex-shrink: 0; }
  .actions button { font-family: var(--font-ui); font-size: 0.75rem; font-weight: 500; padding: var(--space-1) var(--space-3); border-radius: var(--radius-sm); cursor: pointer; }
  .actions .primary { background: var(--accent); color: var(--ink-on-accent); border: 1px solid var(--accent); }
  .actions .ghost { background: none; color: var(--ink-paper-secondary); border: 1px solid var(--border-paper); }

  /* Conflict card — the WADM-form variant: both sides, pick one. */
  .card { margin-bottom: var(--space-4); padding: var(--space-4); background: var(--surface-paper-card); border: 1px solid var(--border-paper); border-radius: var(--radius-md); display: flex; flex-direction: column; gap: var(--space-2); }
  .card .eyebrow { color: var(--accent); margin: 0; }
  .card h3 { margin: 0; font-family: var(--font-display); font-size: 1.35rem; font-weight: 600; color: var(--ink-paper-primary); }
  .lead { margin: 0 0 var(--space-2); font-family: var(--font-body); font-size: 0.95rem; color: var(--ink-paper-secondary); }
  .side { text-align: left; cursor: pointer; padding: var(--space-3); border: 1px solid var(--border-paper); border-left: 3px solid transparent; border-radius: var(--radius-sm); background: var(--surface-paper-card); display: flex; flex-direction: column; gap: var(--space-1); }
  .side:hover { border-left-color: var(--accent); background: var(--surface-paper-hover); }
  .who { font-family: var(--font-ui); font-size: 0.65rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent); }
  .text { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.45; color: var(--ink-paper-primary); }
</style>
