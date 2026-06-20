<script lang="ts">
  // The narrative SPINE, authored in the EDITOR sidebar beside the object-local notes — NOT a separate
  // overview screen (placement correction 2026-05-25: a section's camera must be framed on the object's
  // canvas, and the rail already gives multi-object movement, so the spine belongs where the canvas is).
  // A Section is a self-contained reading beat (ADR-0005 / archie-narrative Q-1): { objectId, start, prose },
  // independent of Notes; note cross-refs are ⌘K links in the prose, not a structural ref. Its camera
  // (`start`) is FRAMED on the canvas (a drawn box → xywh / AV in-out → t=), the same gesture as a note's
  // geometry — so this panel asks App to enter "framing" mode (onframe) rather than taking a typed fragment.
  //
  // SURFACE THE SCALE (the IA the rework exists for): this is the EXHIBIT-level spine — it PERSISTS as you
  // switch objects on the rail, while the object-local notes SWAP. Each card NAMES its target object; the
  // card(s) targeting the object you're viewing are lit, the rest dimmed — teaching that sections reach
  // across the whole exhibit. Re-binding a section to a different object is explicit ("Move to this object",
  // shown only when it targets another object), never an implicit side effect of framing.
  import { parseTimeFragment } from "@render/core";
  import type { Section } from "@render/core";

  let {
    sections,
    objects,
    currentObjectId,
    framingId = null,
    notes = [],
    cleared = false,
    onchange,
    onframe,
    oncancelframe,
    onrequestcite,
  }: {
    sections: Section[];
    objects: ReadonlyArray<{ id: string; label: string; mediaType?: "image" | "sound" | "video" }>;
    /** The object the editor canvas is currently showing — sections targeting it are lit, the rest dimmed. */
    currentObjectId: string;
    /** The section whose camera is being framed right now (null = not framing). */
    framingId?: string | null;
    /** The exhibit's notes, for the "add a section from a Note" shortcut (ADR-0005 mitigation). */
    notes?: ReadonlyArray<{ id: string; objectId: string; start?: string; lead: string }>;
    /** True when the narrative was JUST cleared (last beat removed) — swaps the empty-state copy to the
     *  reverse-cue "Narrative cleared…" message (staging spec §7), distinct from the never-started copy. */
    cleared?: boolean;
    onchange: (sections: Section[]) => void;
    /** Ask App to frame this section's camera: rail-jumps to its object, then arms the canvas draw. */
    onframe: (sectionId: string) => void;
    /** Exit framing without capturing (the visible counterpart to Esc). */
    oncancelframe: () => void;
    /** Open App's cite palette (⌘K) with an insert closure that splices the chosen link into a prose field
     *  — the SAME palette notes use; a Section's only structural link to a Note is this prose link (ADR-0005). */
    onrequestcite: (insert: (md: string) => void) => void;
  } = $props();

  // Per-section prose <textarea> refs, so the ⌘K palette / ¶Cite button can splice a link at the caret of
  // the right card's prose (the spine→note bridge — a Section references a Note via a prose link, never a
  // structural ref; ADR-0005 / CONTEXT §48).
  let proseEls = $state<Record<string, HTMLTextAreaElement | null>>({});
  function citeInto(i: number, id: string) {
    const el = proseEls[id];
    if (!el) return;
    onrequestcite((md) => {
      const full = el.value;
      const start = el.selectionStart ?? full.length;
      const end = el.selectionEnd ?? full.length;
      update(i, { prose: full.slice(0, start) + md + full.slice(end) });
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + md.length, start + md.length); });
    });
  }

  const newId = () => `s-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
  const objectLabel = (id: string) => objects.find((o) => o.id === id)?.label ?? id;
  // AV-bound section → its camera is a MOMENT (`t=`), not a spatial region (`xywh=`).
  const avBound = (id: string) => { const m = objects.find((o) => o.id === id)?.mediaType; return m === "sound" || m === "video"; };
  const fmtMMSS = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  // A human label for a section's framed camera. Empty string = not yet framed.
  function cameraLabel(s: Section): string {
    if (!s.start) return "";
    if (avBound(s.objectId)) { const t = parseTimeFragment(s.start); return t ? `${fmtMMSS(t.start)}–${fmtMMSS(t.end ?? t.start)}` : "moment"; }
    return "area set";
  }

  // A new section is anchored to the object you're looking at (currentObjectId) — you then frame its camera.
  function add() {
    if (!currentObjectId) return;
    onchange([...sections, { id: newId(), title: `Section ${sections.length + 1}`, objectId: currentObjectId }]);
  }
  // Seed a section's object + camera + prose from an existing Note (the model-(A) mitigation — the note
  // stays its own marker; this COPIES it into a beat).
  function addFromNote(n: { objectId: string; start?: string; lead: string }) {
    onchange([...sections, { id: newId(), title: `Section ${sections.length + 1}`, objectId: n.objectId, ...(n.start ? { start: n.start } : {}), prose: n.lead }]);
  }
  function update(i: number, patch: Partial<Section>) { onchange(sections.map((s, j) => (j === i ? { ...s, ...patch } : s))); }
  function remove(i: number) { onchange(sections.filter((_, j) => j !== i)); }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const next = sections.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    onchange(next);
  }
  // Re-bind a section to the object now in view. The old camera was framed on a DIFFERENT object, so it's
  // meaningless here — drop `start`; the author reframes on the new object.
  function moveHere(i: number) {
    const { start: _drop, ...rest } = sections[i]!;
    onchange(sections.map((s, j) => (j === i ? { ...rest, objectId: currentObjectId } : s)));
  }

  // Empty (0-beat) spine → render RECESSED: a quiet strip subordinate to the object Notes list below, so the
  // not-yet-started narrative never buries the notes the author is actually working in (staging spec §2).
  // Non-empty → full card weight. `cleared` swaps the strip to the reverse-cue copy (last beat just removed).
  const isEmpty = $derived(sections.length === 0 && objects.length > 0);
  // Item-switch cue (staging spec §5): the author is on an object with NO beats of its own, while the spine
  // DOES hold beats (anchored to OTHER objects). All its cards are dimmed — teach that those beats belong to
  // other items and stay in the spine, and how to bring one here. Only meaningful when the spine is non-empty.
  const onBeatlessObject = $derived(
    sections.length > 0 && !sections.some((s) => s.objectId === currentObjectId),
  );
  // Reorder path preview (staging spec §6): with ≥2 beats, name the walked path so the author grasps that
  // reorder = the visitor's route. "Section 1 → 2 → 3" is the ordinals; "[A] → [B]" the DISTINCT objects in
  // spine order (consecutive dupes collapsed — two beats on the same item are one stop on the walk).
  const canReorder = $derived(sections.length >= 2);
  const sectionPath = $derived(sections.map((_, i) => i + 1).join(" → "));
  const objectPath = $derived(
    sections
      .map((s) => objectLabel(s.objectId))
      .filter((lbl, i, arr) => i === 0 || lbl !== arr[i - 1])
      .join(" → "),
  );
</script>

<section class="spine" class:recessed={isEmpty}>
  {#if isEmpty}
    <!-- Recessed empty state (staging spec §2): eyebrow + ONE teaching line + ONE button. Quiet, low weight,
         sits ABOVE the Notes list but visually subordinate to it (no card shadow, hairline frame). -->
    <p class="eyebrow">Exhibit narrative</p>
    {#if cleared}
      <p class="empty">Narrative cleared — this exhibit opens with the media grid again. Add a section to lead with your writing instead.</p>
    {:else}
      <p class="empty">No sections yet. Add one to begin the narrative — each is shown with one media item and the view you frame, the same box you draw for a note. The first will be shown with the item you're viewing now — {objectLabel(currentObjectId)}.</p>
    {/if}
    <button class="add" onclick={add} disabled={objects.length === 0}>＋ Add to the narrative</button>
  {:else}
  <header>
    <p class="eyebrow">Exhibit narrative</p>
    <p class="lede">A section is one passage in this exhibit's narrative, shown with one media item. Sections flow in order, carrying the reader from one to the next — and stay put as you switch between media items.</p>
  </header>

  {#if objects.length === 0}
    <p class="empty">Add a media item to the exhibit first — every section is shown with one.</p>
  {:else if onBeatlessObject}
    <!-- Item-switch cue (staging spec §5): every card below is dimmed because none belong to the item now in
         view. Teach that the spine reaches across items, and how to bring a beat here. -->
    <p class="item-switch-cue">These sections belong to other items in this exhibit — they stay in the spine. Add one here, or move one with “Move here.”</p>
  {/if}

  <ol class="cards">
    {#each sections as s, i (s.id)}
      {@const here = s.objectId === currentObjectId}
      {@const cam = cameraLabel(s)}
      <li class="card" class:here class:framing={framingId === s.id}>
        <div class="ord">
          <span class="n">{i + 1}</span>
          <!-- Reorder arrows are HIDDEN (not shown-disabled) until ≥2 beats — a single beat has no order to set
               (staging spec §6). -->
          {#if canReorder}
            <div class="mv">
              <button onclick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">▲</button>
              <button onclick={() => move(i, 1)} disabled={i === sections.length - 1} aria-label="Move down" title="Move down">▼</button>
            </div>
          {/if}
        </div>
        <div class="fields">
          <input class="title" value={s.title} placeholder="Section title" aria-label="Section title"
            onchange={(e) => update(i, { title: (e.currentTarget as HTMLInputElement).value })} />
          <p class="shows">
            <span class="on-obj">{here ? "Shown with this item" : "Shown with"} · {objectLabel(s.objectId)}</span>
            {#if !here}<button class="move-here" onclick={() => moveHere(i)} title="Show this section with the media item you're viewing now (clears the area it currently highlights)">Move here</button>{/if}
          </p>
          <div class="prose-wrap">
            <button type="button" class="cite" onclick={() => citeInto(i, s.id)} title="Cite a note or exhibit (⌘K)">¶ Cite <kbd>⌘K</kbd></button>
            <textarea class="prose" rows="2" bind:this={proseEls[s.id]} value={s.prose ?? ""} placeholder="Write this section…" aria-label="Section prose"
              onkeydown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); citeInto(i, s.id); } }}
              onchange={(e) => update(i, { prose: (e.currentTarget as HTMLTextAreaElement).value })}></textarea>
          </div>
          <div class="camera">
            {#if framingId === s.id}
              <span class="framing-now">{avBound(s.objectId) ? "Set the moment — scrub to it on the recording" : "Set the area — draw a box on the image"}</span>
              <button class="cancel" onclick={oncancelframe}>Cancel</button>
            {:else}
              <span class="cam" class:set={!!cam}>{cam ? (avBound(s.objectId) ? `⏱ ${cam}` : `▭ ${cam}`) : "Whole item shown"}</span>
              <button class="set-cam" onclick={() => onframe(s.id)}>{cam ? "Change view" : avBound(s.objectId) ? "Set moment" : "Set area"}</button>
            {/if}
          </div>
        </div>
        <button class="del" onclick={() => remove(i)} aria-label="Remove section" title="Remove section">✕</button>
      </li>
    {/each}
  </ol>

  {#if canReorder}
    <!-- Path preview (staging spec §6): the reorder defines the visitor's WALKED route. Naming it teaches
         that ▲/▼ aren't cosmetic ordering but the path through the exhibit. -->
    <p class="path-preview">Reading order: Section {sectionPath}{#if objectPath}, across {objectPath}{/if}. This is the path visitors walk.</p>
  {/if}

  <div class="add-row">
    <button class="add" onclick={add} disabled={objects.length === 0}>＋ Add to the narrative</button>
    {#if notes.length > 0}
      <select class="from-note" aria-label="Add a section from an existing note"
        onchange={(e) => { const el = e.currentTarget as HTMLSelectElement; const n = notes.find((x) => x.id === el.value); if (n) addFromNote(n); el.selectedIndex = 0; }}>
        <option value="">＋ from a note…</option>
        {#each notes as n (n.id)}<option value={n.id}>{n.lead.slice(0, 40)}</option>{/each}
      </select>
    {/if}
  </div>
  {/if}
</section>

<style>
  /* The spine reads as an EXHIBIT-level region inside the object-local paper notebook: a warm paper card
     lifted by a soft shadow, distinct from the per-object note list below it (Soft Static paper side). */
  .spine { display: flex; flex-direction: column; gap: var(--space-3); margin: 0 0 var(--space-4); padding: var(--space-3); background: var(--surface-canvas-raised); border: none; border-radius: var(--radius-lg); box-shadow: var(--shadow-lift-low); }
  /* Recessed (empty) spine: NOT a lifted card — a quiet hairline strip with tighter padding + a smaller CTA,
     so a not-yet-started narrative stays subordinate to the object Notes list below (staging spec §2). */
  .spine.recessed { background: transparent; box-shadow: none; border: 1px solid var(--border-paper); padding: var(--space-2) var(--space-3); gap: var(--space-2); }
  .spine.recessed .eyebrow { margin: 0; font-family: var(--font-ui); font-size: var(--text-ui-xs, 0.7rem); font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.55; color: var(--ink-paper-secondary); }
  .spine.recessed .empty { font-size: 0.82rem; line-height: 1.55; opacity: 0.9; }
  /* The recessed CTA is quieter than the full-weight signal-orange Add — a soft outline, not a filled signal,
     to stay below the Notes list in the hierarchy. */
  .spine.recessed .add { align-self: flex-start; background: var(--surface-paper); color: var(--accent); border: 1px solid var(--border-paper-emphasis); box-shadow: none; font-weight: 500; }
  .spine.recessed .add:hover:not(:disabled) { background: var(--surface-paper-hover); border-color: var(--accent); }
  .spine > header .eyebrow { margin: 0; font-family: var(--font-ui); font-size: var(--text-ui-xs, 0.7rem); font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.6; color: var(--ink-paper-secondary); }
  .spine > header .lede { margin: var(--space-1) 0 0; font-family: var(--font-body); font-size: 0.85rem; line-height: 1.6; color: var(--ink-paper-secondary); }
  .empty { font-family: var(--font-body); font-size: 0.9rem; line-height: 1.6; color: var(--ink-paper-secondary); margin: 0; }
  /* Item-switch cue — a quiet teaching line above the (all-dimmed) cards; reads as guidance, not an error.
     The accent left-rule ties it to the spine without shouting. */
  .item-switch-cue { margin: 0; padding: var(--space-2) var(--space-3); font-family: var(--font-body); font-size: 0.82rem; line-height: 1.55; color: var(--ink-paper-secondary); background: var(--surface-paper); border-left: 2px solid var(--accent-2); border-radius: var(--radius-sm); }
  /* Path preview — a quiet caption under the cards naming the walked route; mono ordinals read as a sequence. */
  .path-preview { margin: 0; font-family: var(--font-ui); font-size: var(--text-ui-xs, 0.7rem); line-height: 1.6; letter-spacing: 0.03em; color: var(--ink-paper-muted); }

  /* The spine scrolls inside the panel (max 50vh) so a long narrative never pushes the notes + WADM form
     below the fold of the sidebar. Raised from 40vh → 50vh to give the section list more room as the aside widens. */
  .cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); max-height: 50vh; overflow-y: auto; }
  /* A beat dims when it targets another object; lights when it targets the one you're viewing (scale cue).
     The lit state is a quiet signal: a subtle accent left-rule + full opacity, not a loud fill. */
  .card { display: flex; gap: var(--space-2); padding: var(--space-2); background: var(--surface-paper); border: none; border-left: 2px solid transparent; border-radius: var(--radius-md); opacity: 0.55; transition: opacity 160ms ease, border-color 160ms ease, box-shadow 160ms ease; }
  .card.here { opacity: 1; border-left-color: var(--accent); box-shadow: var(--shadow-lift-low); }
  .card.framing { opacity: 1; border-left-color: var(--accent); box-shadow: var(--shadow-lift-mid); }

  .ord { display: flex; flex-direction: column; align-items: center; gap: var(--space-1); }
  .ord .n { font-family: var(--font-display); font-weight: 400; font-size: 0.95rem; color: var(--accent-2); }
  .mv { display: flex; flex-direction: column; gap: 2px; }
  .mv button { cursor: pointer; font-size: 0.55rem; line-height: 1; padding: 2px 5px; background: none; border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); color: var(--ink-paper-secondary); transition: color 120ms ease, border-color 120ms ease; }
  .mv button:disabled { opacity: 0.3; cursor: default; }
  .mv button:hover:not(:disabled) { color: var(--accent-2); border-color: var(--accent-2); }

  .fields { flex: 1; display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
  .title { font-family: var(--font-display); font-size: 1.1rem; font-weight: 400; line-height: 1.3; padding: var(--space-1) var(--space-2); background: var(--surface-canvas-raised); color: var(--ink-paper-primary); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); }
  .shows { margin: 0; display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .on-obj { font-family: var(--font-ui); font-size: var(--text-ui-xs, 0.7rem); font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.58; color: var(--ink-paper-secondary); }
  /* Re-bind — a secondary action; quiet soft-btn treatment, never orange. */
  .move-here { cursor: pointer; font-family: var(--font-ui); font-size: 0.65rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 2px var(--space-2); background: var(--surface-canvas-raised); color: var(--accent-2); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); transition: color 120ms ease, border-color 120ms ease; }
  .move-here:hover { border-color: var(--accent-2); color: var(--accent-2); }
  .prose-wrap { display: flex; flex-direction: column; gap: var(--space-1); }
  /* ¶ Cite — the SAME affordance the note Comment has; cites a note/exhibit into the prose (ADR-0005 bridge). */
  .prose-wrap .cite { align-self: flex-end; display: inline-flex; align-items: center; gap: var(--space-1); cursor: pointer; background: none; border: none; padding: 0; font-family: var(--font-ui); font-size: var(--text-ui-xs, 0.7rem); font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.7; color: var(--accent-2); transition: opacity 120ms ease, color 120ms ease; }
  .prose-wrap .cite:hover { opacity: 1; color: var(--accent-2); }
  .prose-wrap .cite kbd { font-family: var(--font-mono); font-size: 0.6rem; color: var(--ink-paper-muted); background: var(--surface-paper-hover); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); padding: 0 var(--space-1); }
  .prose { font-family: var(--font-body); font-size: 0.9rem; line-height: 1.6; padding: var(--space-2); background: var(--surface-canvas-raised); color: var(--ink-paper-primary); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); resize: vertical; }
  .title:focus, .prose:focus { outline: none; border-color: var(--accent-2); box-shadow: 0 0 0 3px var(--accent-2-muted); }

  .camera { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .cam { font-family: var(--font-mono); font-size: 0.7rem; letter-spacing: 0.06em; opacity: 0.62; color: var(--ink-paper-muted); }
  .cam.set { opacity: 1; color: var(--ink-paper-secondary); }
  .framing-now { font-family: var(--font-ui); font-size: var(--text-ui-xs, 0.7rem); font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent-2); }
  /* Frame / Cancel — both quiet secondary controls (the rationed orange is reserved for Add). */
  .set-cam, .cancel { cursor: pointer; font-family: var(--font-ui); font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 3px var(--space-2); border-radius: var(--radius-sm); transition: color 120ms ease, border-color 120ms ease; }
  .set-cam { background: var(--surface-canvas-raised); color: var(--accent-2); border: 1px solid var(--border-canvas); }
  .set-cam:hover { border-color: var(--accent-2); color: var(--accent-2); }
  .cancel { background: var(--surface-canvas-raised); color: var(--ink-paper-secondary); border: 1px solid var(--border-canvas); }
  .cancel:hover { color: var(--ink-paper-primary); border-color: var(--ink-paper-secondary); }

  .del { align-self: flex-start; cursor: pointer; font-size: 0.8rem; padding: 2px var(--space-1); background: none; border: none; border-radius: var(--radius-sm); color: var(--ink-paper-muted); transition: color 120ms ease; }
  .del:hover { color: var(--semantic-error); }

  .add-row { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  /* Primary CTA — the ONE rationed signal on this surface: warm body text, signal-orange fill, paper ink,
     soft warm glow (no hard pixel cascade, no press-down). Everything else here stays quiet. */
  .add { align-self: flex-start; cursor: pointer; font-family: var(--font-body); font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.01em; padding: var(--space-2) var(--space-3); background: var(--accent); color: var(--ink-on-accent); border: none; border-radius: var(--radius-sm); box-shadow: var(--shadow-signal-glow); transition: background 140ms ease, box-shadow 140ms ease; }
  .add:hover:not(:disabled) { background: var(--accent-hover); }
  .add:disabled { background: var(--accent-muted); color: var(--ink-paper-muted); box-shadow: none; cursor: default; }
  .from-note { font-family: var(--font-ui); font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase; padding: var(--space-2) var(--space-2); cursor: pointer; background: var(--surface-canvas-raised); color: var(--ink-paper-secondary); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); transition: color 120ms ease, border-color 120ms ease; }
  .from-note:hover { border-color: var(--accent-2); color: var(--accent-2); }
</style>
