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
  /* Summary panel — one calm line answering "am I done?" on raised navy, hard pixel shadow. */
  .summary {
    display: flex; align-items: center; gap: var(--space-4);
    margin-bottom: var(--space-4); padding: var(--space-3) var(--space-4);
    background: var(--surface-paper-card); border: var(--border-pixel) solid var(--border-paper-emphasis);
    border-left: var(--border-pixel-bold) solid var(--accent); border-radius: 0;
    box-shadow: var(--shadow-pixel);
  }
  .msg { font-family: var(--font-body); font-size: 1rem; line-height: 1.4; color: var(--ink-paper-primary); }
  .actions { margin-left: auto; display: flex; gap: var(--space-2); flex-shrink: 0; }
  .actions button { font-size: 0.75rem; padding: var(--space-2) var(--space-3); border-radius: 0; cursor: pointer; text-transform: uppercase; }
  /* Primary CTA — pixel-btn: Tektur, accent fill, navy text, cascade shadow, press-down hover. */
  .actions .primary {
    font-family: var(--font-display); font-weight: 700; letter-spacing: 0.08em;
    background: var(--accent); color: var(--ink-on-accent);
    border: var(--border-pixel) solid var(--accent); box-shadow: var(--shadow-pixel-btn);
  }
  .actions .primary:hover { transform: translate(2px, 2px); box-shadow: var(--shadow-pixel-btn-active); }
  /* Ghost / secondary — square, transparent, 2px cyan border, Space Mono uppercase. */
  .actions .ghost {
    font-family: var(--font-ui); font-weight: 500; letter-spacing: 0.1em;
    background: none; color: var(--accent); border: var(--border-pixel) solid var(--accent);
  }
  .actions .ghost:hover { background: var(--accent-muted); }

  /* Conflict card — the WADM-form variant: both sides, pick one. Square + hard pixel shadow. */
  .card { margin-bottom: var(--space-4); padding: var(--space-4); background: var(--surface-paper-card); border: var(--border-pixel) solid var(--border-paper-emphasis); border-radius: 0; box-shadow: var(--shadow-pixel); display: flex; flex-direction: column; gap: var(--space-2); }
  .card .eyebrow { margin: 0; }
  .card h3 { margin: 0; font-family: var(--font-display); font-size: 1.35rem; font-weight: 800; color: var(--ink-paper-primary); }
  .lead { margin: 0 0 var(--space-2); font-family: var(--font-body); font-size: 0.95rem; line-height: 1.6; color: var(--ink-paper-secondary); }
  .side { text-align: left; cursor: pointer; padding: var(--space-3); border: var(--border-pixel) solid var(--border-paper); border-left: var(--border-pixel-bold) solid transparent; border-radius: 0; background: var(--surface-paper); display: flex; flex-direction: column; gap: var(--space-1); }
  .side:hover { border-left-color: var(--accent); background: var(--surface-paper-hover); box-shadow: var(--shadow-pixel); }
  .who { font-family: var(--font-ui); font-size: 0.65rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); }
  .text { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.6; color: var(--ink-paper-primary); }
</style>
