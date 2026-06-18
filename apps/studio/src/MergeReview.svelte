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
      <span class="msg"><strong>Added {synced} {synced === 1 ? "note" : "notes"} from a colleague's copy.</strong> {conflicts.length} {conflicts.length === 1 ? "needs" : "need"} your decision.</span>
      <span class="actions">
        <button class="primary" onclick={() => (reviewing = true)}>Review</button>
        <button class="ghost" onclick={() => (synced = 0)}>Not now</button>
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
  /* Summary panel — one calm line answering "am I done?" on warm paper, soft lift, a quiet signal edge. */
  .summary {
    display: flex; align-items: center; gap: var(--space-4);
    margin-bottom: var(--space-4); padding: var(--space-3) var(--space-4);
    background: var(--surface-canvas-raised); border-radius: var(--radius-md);
    border-left: 3px solid var(--accent-muted);
    box-shadow: var(--shadow-lift-low);
  }
  .msg { font-family: var(--font-body); font-size: 1rem; line-height: 1.5; color: var(--ink-paper-primary); }
  .actions { margin-left: auto; display: flex; gap: var(--space-2); flex-shrink: 0; }
  .actions button { font-size: 0.875rem; padding: var(--space-2) var(--space-4); border-radius: var(--radius-sm); cursor: pointer; }
  /* Primary CTA — the one rationed signal action: accent fill, paper ink, soft glow. */
  .actions .primary {
    font-family: var(--font-body); font-weight: 600; letter-spacing: 0.01em;
    background: var(--accent); color: var(--ink-on-accent);
    border: none; box-shadow: var(--shadow-signal-glow);
    transition: background 0.2s ease, box-shadow 0.2s ease;
  }
  .actions .primary:hover { background: var(--accent-hover); box-shadow: var(--shadow-lift-mid); }
  /* Later / secondary — quiet soft button: warm paper, soft border, ink text. */
  .actions .ghost {
    font-family: var(--font-body); font-weight: 500; letter-spacing: 0.01em;
    background: var(--surface-canvas-raised); color: var(--ink-paper-secondary);
    border: 1px solid var(--border-canvas);
    transition: background 0.2s ease, color 0.2s ease;
  }
  .actions .ghost:hover { background: var(--surface-paper-hover); color: var(--ink-paper-primary); }

  /* Conflict card — the WADM-form variant: both sides, pick one. Warm paper, rounded, soft lift. */
  .card { margin-bottom: var(--space-4); padding: var(--space-4); background: var(--surface-canvas-raised); border-radius: var(--radius-md); box-shadow: var(--shadow-lift-low); display: flex; flex-direction: column; gap: var(--space-2); }
  .card .eyebrow { margin: 0; }
  .card h3 { margin: 0; font-family: var(--font-display); font-size: 1.5rem; font-weight: 400; line-height: 1.3; color: var(--ink-paper-primary); }
  .lead { margin: 0 0 var(--space-2); font-family: var(--font-body); font-size: 0.95rem; line-height: 1.6; color: var(--ink-paper-secondary); }
  .side { text-align: left; cursor: pointer; padding: var(--space-3); border: 1px solid var(--border-canvas); border-left: 3px solid transparent; border-radius: var(--radius-sm); background: var(--surface-paper); display: flex; flex-direction: column; gap: var(--space-1); transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease; }
  .side:hover { border-left-color: var(--accent); background: var(--surface-paper-hover); box-shadow: var(--shadow-lift-low); }
  .who { font-family: var(--font-ui); font-size: 0.65rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-muted); }
  .text { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.6; color: var(--ink-paper-primary); }
</style>
