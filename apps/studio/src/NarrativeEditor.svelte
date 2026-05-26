<script lang="ts">
  // Narrative section-authoring (CONTEXT §92 Narrative layout + §118 "overview sidebar = sections/narrative").
  // GREENFIELD — no anvil donor (ADR-0002 assumed one; this anvil checkout has none). The authoring half of
  // the narrative spine: an ordered list of Sections, each a story beat bound to an Object, with prose + an
  // optional region. Sequence / bind / write / reorder / remove. Pure-ish: every mutation emits the new
  // Section[] via onchange; App persists to ExhibitMeta.sections → publishes as IIIF Ranges (toRanges).
  import type { Section } from "@render/core";

  let {
    sections,
    objects,
    notes = [],
    onchange,
  }: {
    sections: Section[];
    objects: ReadonlyArray<{ id: string; label: string; mediaType?: "image" | "sound" | "video" }>;
    /** The exhibit's notes, for the "add section from a Note" shortcut (ADR-0005 — the model-(A) mitigation). */
    notes?: ReadonlyArray<{ id: string; objectId: string; start?: string; lead: string }>;
    onchange: (sections: Section[]) => void;
  } = $props();

  const newId = () => `s-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
  // Is the object a section binds an AV object? → its `start` focuses a MOMENT (`t=`), not a region (`xywh=`).
  const avBound = (objectId: string) => {
    const m = objects.find((x) => x.id === objectId)?.mediaType;
    return m === "sound" || m === "video";
  };

  function add() {
    const objectId = objects[0]?.id ?? "";
    onchange([...sections, { id: newId(), title: `Section ${sections.length + 1}`, objectId }]);
  }
  // The grilling's mitigation: seed a Section's object + camera (`start`) + prose from an existing Note,
  // so a note-walk is one click inside the third-layer model (the note stays its own marker; this COPIES it).
  function addFromNote(n: { objectId: string; start?: string; lead: string }) {
    onchange([...sections, { id: newId(), title: `Section ${sections.length + 1}`, objectId: n.objectId, ...(n.start ? { start: n.start } : {}), prose: n.lead }]);
  }
  function update(i: number, patch: Partial<Section>) {
    onchange(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
  function remove(i: number) {
    onchange(sections.filter((_, j) => j !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const next = sections.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    onchange(next);
  }
  // The camera target (ADR-0005 `start`) is optional + advanced: a media fragment — `xywh=…` for an image
  // object, `t=start,end` for AV. Whole object when empty. (Step-4 will make this AV-aware with a time field.)
  function setStart(i: number, raw: string) {
    const v = raw.trim();
    const { start: _drop, ...rest } = sections[i]!;
    onchange(sections.map((s, j) => (j === i ? (v ? { ...rest, start: v } : rest) : s)));
  }
</script>

<section class="narr">
  <header>
    <p class="eyebrow">Narrative · {sections.length} {sections.length === 1 ? "section" : "sections"}</p>
    <p class="lede">The reading spine — each section is a beat bound to an object, shown in order. Visitors scroll the prose; the canvas follows.</p>
  </header>

  {#if objects.length === 0}
    <p class="empty">Add an object to the exhibit first — a section points at one.</p>
  {/if}

  <ol class="sections">
    {#each sections as s, i (s.id)}
      <li class="card">
        <div class="ord">
          <span class="n">{i + 1}</span>
          <div class="move">
            <button onclick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">▲</button>
            <button onclick={() => move(i, 1)} disabled={i === sections.length - 1} aria-label="Move down" title="Move down">▼</button>
          </div>
        </div>
        <div class="fields">
          <input class="title" value={s.title} placeholder="Section title" aria-label="Section title"
            onchange={(e) => update(i, { title: (e.currentTarget as HTMLInputElement).value })} />
          <label class="bind">Shows
            <select value={s.objectId} onchange={(e) => update(i, { objectId: (e.currentTarget as HTMLSelectElement).value })}>
              {#each objects as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
            </select>
          </label>
          <textarea class="prose" rows="3" value={s.prose ?? ""} placeholder="Prose for this beat…" aria-label="Section prose"
            onchange={(e) => update(i, { prose: (e.currentTarget as HTMLTextAreaElement).value })}></textarea>
          <details class="region">
            <summary>{avBound(s.objectId) ? "Moment" : "Focus"} <span class="hint">(optional · {avBound(s.objectId) ? "t=start,end seconds" : "a region · xywh=…"})</span></summary>
            <input value={s.start ?? ""} placeholder={avBound(s.objectId) ? "t=12,48" : "xywh=pixel:200,120,640,480"} aria-label="Section focus fragment"
              onchange={(e) => setStart(i, (e.currentTarget as HTMLInputElement).value)} />
          </details>
        </div>
        <button class="del" onclick={() => remove(i)} aria-label="Remove section" title="Remove section">✕</button>
      </li>
    {/each}
  </ol>

  <div class="add-row">
    <button class="add" onclick={add} disabled={objects.length === 0}>+ Add section</button>
    {#if notes.length > 0}
      <select class="from-note" aria-label="Add a section from an existing note"
        onchange={(e) => { const el = e.currentTarget as HTMLSelectElement; const n = notes.find((x) => x.id === el.value); if (n) addFromNote(n); el.selectedIndex = 0; }}>
        <option value="">＋ from a note…</option>
        {#each notes as n (n.id)}<option value={n.id}>{n.lead.slice(0, 48)}</option>{/each}
      </select>
    {/if}
  </div>
</section>

<style>
  /* The narrative spine on warm paper — index cards beside the dark tableau (system.md paper side). */
  .narr { display: flex; flex-direction: column; gap: var(--space-4); height: 100%; box-sizing: border-box; overflow-y: auto; padding: var(--space-5); background: var(--surface-paper); color: var(--ink-paper-primary); }
  header .eyebrow { margin: 0; font-family: var(--font-ui); font-size: var(--text-ui-xs, 0.7rem); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
  header .lede { margin: var(--space-1) 0 0; font-family: var(--font-body); font-size: 0.95rem; line-height: 1.45; color: var(--ink-paper-secondary); }
  .empty { font-family: var(--font-body); font-size: 0.95rem; color: var(--ink-paper-secondary); margin: 0; }

  .sections { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
  .card { display: flex; gap: var(--space-3); padding: var(--space-3); background: var(--surface-paper-card); border: 1px solid var(--border-paper); border-left: 3px solid var(--accent); border-radius: var(--radius-sm); }
  .ord { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); }
  .ord .n { font-family: var(--font-mono); font-size: 0.85rem; color: var(--accent); }
  .move { display: flex; flex-direction: column; gap: 2px; }
  .move button { cursor: pointer; font-size: 0.6rem; line-height: 1; padding: 2px 4px; background: none; border: 1px solid var(--border-paper-emphasis); border-radius: 3px; color: var(--ink-paper-secondary); }
  .move button:disabled { opacity: 0.3; cursor: default; }
  .move button:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }

  .fields { flex: 1; display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
  .title { font-family: var(--font-display); font-size: 1.2rem; font-weight: 600; padding: var(--space-1) var(--space-2); background: var(--surface-paper); color: var(--ink-paper-primary); border: 1px solid var(--border-paper); border-radius: var(--radius-sm); }
  .bind { font-family: var(--font-ui); font-size: var(--text-ui-xs, 0.7rem); text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-paper-secondary); display: flex; align-items: center; gap: var(--space-2); }
  .bind select { font-family: var(--font-ui); font-size: 0.8125rem; text-transform: none; letter-spacing: 0; padding: 2px var(--space-2); background: var(--surface-paper); color: var(--ink-paper-primary); border: 1px solid var(--border-paper); border-radius: var(--radius-sm); }
  .prose { font-family: var(--font-body); font-size: 0.95rem; line-height: 1.5; padding: var(--space-2); background: var(--surface-paper); color: var(--ink-paper-primary); border: 1px solid var(--border-paper); border-radius: var(--radius-sm); resize: vertical; }
  .title:focus, .prose:focus, .bind select:focus, .region input:focus { outline: none; border-color: var(--accent); }
  .region summary { font-family: var(--font-ui); font-size: var(--text-ui-xs, 0.7rem); color: var(--ink-paper-muted); cursor: pointer; }
  .region .hint { color: var(--ink-paper-muted); }
  .region input { width: 100%; box-sizing: border-box; margin-top: var(--space-1); font-family: var(--font-mono); font-size: 0.8rem; padding: var(--space-1) var(--space-2); background: var(--surface-paper); color: var(--ink-paper-primary); border: 1px solid var(--border-paper); border-radius: var(--radius-sm); }

  .del { align-self: flex-start; cursor: pointer; font-size: 0.8rem; padding: 2px var(--space-2); background: none; border: none; color: var(--ink-paper-muted); }
  .del:hover { color: var(--semantic-error); }
  .add { align-self: flex-start; cursor: pointer; font-family: var(--font-ui); font-size: 0.8125rem; font-weight: 500; padding: var(--space-2) var(--space-4); background: var(--accent); color: var(--ink-on-accent); border: 1px solid var(--accent); border-radius: var(--radius-sm); }
  .add:disabled { background: var(--accent-muted); color: var(--ink-paper-muted); border-color: transparent; cursor: default; }
  .add-row { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .from-note { font-family: var(--font-ui); font-size: 0.8125rem; padding: var(--space-2) var(--space-3); cursor: pointer; background: var(--surface-paper-card); color: var(--ink-paper-secondary); border: 1px dashed var(--border-paper-emphasis); border-radius: var(--radius-sm); }
  .from-note:hover { border-color: var(--accent); color: var(--accent); }
</style>
