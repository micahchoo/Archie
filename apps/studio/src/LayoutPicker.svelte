<script lang="ts">
  // Layout picker (CONTEXT §142 minor invention; principle #1 "respect user intent declarations").
  // PROTOTYPE for review. The load-bearing requirement (§122): make the reading-intent declaration
  // LEGIBLE — a sentence per layout — "or the layout system feels like interchangeable templates."
  // So this is NOT a <select>: each option is an intent card (a diagram of the READING + a sentence).
  // Layout is published intent (how VISITORS read the exhibit); it doesn't change the Studio edit surface.
  import { readingFamily, type LayoutType, type ReadingFamily } from "@render/core";

  let {
    current,
    onpick,
    onclose,
  }: {
    current: LayoutType;
    onpick: (layout: LayoutType) => void;
    onclose: () => void;
  } = $props();

  // Each option names the READING RELATIONSHIP the author is declaring — the stance leads, appearance
  // is only the consequence. The options are GROUPED by reading family (§43's reading-MODE axis), and
  // each family shows where v1.1 modes attach — so the structure visibly anticipates the additive
  // future (slideshow/scrollytelling/compare arrive as VARIANTS, never as new flat templates). This
  // two-axis shape is what keeps the picker from sprawling into a template menu (§122/§129/§142).
  const OPTIONS: { type: LayoutType; name: string; stance: string; consequence: string }[] = [
    { type: "single", name: "Single", stance: "Hold the visitor on a single object.", consequence: "It fills the view; your notes read alongside it." },
    { type: "grid", name: "Grid", stance: "Set out a collection to wander.", consequence: "Visitors browse the objects and choose where to look." },
    { type: "narrative", name: "Narrative", stance: "Lead the reading with your own prose.", consequence: "Your sections carry the object to each passage, in the order you set." },
  ];
  const FAMILIES: { family: ReadingFamily; label: string; clause: string; future: string }[] = [
    { family: "object-led", label: "Object-led", clause: "the work is what they came for", future: "Later: Compare (two objects side by side) joins here as a new arrangement; Slideshow paces a Grid — as a variant, not a new template." },
    { family: "prose-led", label: "Prose-led", clause: "your writing leads; the work follows", future: "Later: Scrollytelling joins here — the same prose reading, paced by scroll rather than click." },
  ];
  const optionsIn = (f: ReadingFamily) => OPTIONS.filter((o) => readingFamily(o.type) === f);
</script>

<div class="scrim" role="presentation" onclick={() => onclose()}>
  <div class="sheet" role="dialog" aria-label="Choose how this exhibit is read" onclick={(e) => e.stopPropagation()}>
    <header>
      <h2>How should this exhibit be read?</h2>
      <p>Each choice sets a different relationship between the visitor, the work, and your voice — not a skin on the same page. It shapes the published exhibit, not this editing view.</p>
    </header>

    {#each FAMILIES as fam (fam.family)}
      <section class="group">
        <h3 class="fam"><span class="fam-name">{fam.label}</span><span class="fam-clause">— {fam.clause}</span></h3>
        <ul>
          {#each optionsIn(fam.family) as o (o.type)}
            <li>
              <button class:active={o.type === current} onclick={() => onpick(o.type)}>
                <span class="diagram" aria-hidden="true">
                  {#if o.type === "single"}
                    <svg viewBox="0 0 64 44"><rect class="frame fill" x="10" y="6" width="44" height="32" rx="2" /></svg>
                  {:else if o.type === "grid"}
                    <svg viewBox="0 0 64 44"><rect class="frame fill" x="8" y="6" width="22" height="14" rx="2" /><rect class="frame" x="34" y="6" width="22" height="14" rx="2" /><rect class="frame" x="8" y="24" width="22" height="14" rx="2" /><rect class="frame fill" x="34" y="24" width="22" height="14" rx="2" /></svg>
                  {:else}
                    <svg viewBox="0 0 64 44"><rect class="frame fill" x="6" y="6" width="30" height="32" rx="2" /><line class="rule" x1="42" y1="11" x2="58" y2="11" /><line class="rule" x1="42" y1="18" x2="58" y2="18" /><line class="rule accent" x1="42" y1="25" x2="54" y2="25" /><line class="rule" x1="42" y1="32" x2="58" y2="32" /></svg>
                  {/if}
                </span>
                <span class="text">
                  <span class="name">{o.name}{#if o.type === current}<span class="now">current</span>{/if}</span>
                  <span class="stance">{o.stance}</span>
                  <span class="consequence">{o.consequence}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
        <p class="future" title="How v1.1 reading modes attach to this family">{fam.future}</p>
      </section>
    {/each}

    {#if current === "narrative"}
      <p class="note">Narrative reads its prose from the exhibit's Sections — authoring the section spine in the Studio is a separate, not-yet-built step, so a Narrative exhibit publishes its intent but needs sections to read fully.</p>
    {/if}
  </div>
</div>

<style>
  /* Warm-paper editorial sheet over the dark header — choosing the form of a finished publication.
     The active choice + its diagram region are inked forest-green (system.md §19 active state). */
  .scrim { position: fixed; inset: 0; z-index: 60; display: flex; justify-content: center; align-items: flex-start; padding-top: 10vh; background: rgba(12, 11, 9, 0.42); }
  .sheet {
    width: min(540px, 92vw); max-height: 80vh; overflow: auto; box-sizing: border-box;
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-lg);
    box-shadow: 0 8px 28px rgba(12, 11, 9, 0.38);
    padding: var(--space-5);
  }
  header { margin-bottom: var(--space-4); }
  header h2 { font-family: var(--font-display); font-size: 1.5rem; font-weight: 600; margin: 0 0 var(--space-2); color: var(--ink-paper-primary); }
  header p { font-family: var(--font-ui); font-size: 0.82rem; line-height: 1.6; color: var(--ink-paper-muted); margin: 0; }

  /* Each reading family is a group (the §43 reading-mode axis), so the choice reads as "what kind of
     reading" rather than a flat row of templates. */
  .group { margin-bottom: var(--space-5); }
  .group:last-of-type { margin-bottom: 0; }
  .fam { display: flex; align-items: baseline; gap: var(--space-2); margin: 0 0 var(--space-2); }
  .fam-name { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); }
  .fam-clause { font-family: var(--font-body); font-style: italic; font-size: 0.9rem; color: var(--ink-paper-muted); }
  /* The additive future, made legible: where v1.1 reading modes attach to THIS family. */
  .future { margin: var(--space-2) 0 0; font-family: var(--font-ui); font-size: var(--text-ui-xs); line-height: 1.6; color: var(--ink-paper-muted); padding-left: var(--space-3); border-left: 1px solid var(--border-paper); }

  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  button {
    display: flex; align-items: center; gap: var(--space-4); width: 100%; text-align: left; cursor: pointer;
    padding: var(--space-3) var(--space-4);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-paper); border-left: 3px solid transparent; border-radius: var(--radius-md);
    transition: background 120ms ease, border-color 120ms ease;
  }
  button:hover { background: var(--surface-paper-hover); border-left-color: var(--accent); }
  button.active { background: var(--accent-muted); border-left-color: var(--accent); }

  .diagram { flex-shrink: 0; width: 64px; height: 44px; }
  .diagram svg { width: 64px; height: 44px; }
  .frame { fill: none; stroke: var(--ink-paper-muted); stroke-width: 1.5; }
  .frame.fill { fill: rgba(107, 98, 80, 0.08); }
  .rule { stroke: var(--ink-paper-muted); stroke-width: 1.5; stroke-linecap: round; }
  button.active .frame { stroke: var(--accent); }
  button.active .frame.fill { fill: var(--accent-muted); }
  .rule.accent { stroke: var(--accent); }

  .text { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
  .name { font-family: var(--font-display); font-size: 1.2rem; font-weight: 600; line-height: 1; display: flex; align-items: baseline; gap: var(--space-2); }
  .now { font-family: var(--font-mono); font-size: 0.6rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-paper-muted); }
  .stance { font-family: var(--font-body); font-size: 1.02rem; font-weight: 600; line-height: 1.35; color: var(--ink-paper-primary); }
  .consequence { font-family: var(--font-body); font-size: 0.92rem; line-height: 1.45; color: var(--ink-paper-secondary); }

  .note { margin: var(--space-4) 0 0; padding: var(--space-3) var(--space-4); border: 1px dashed var(--border-paper-emphasis); border-radius: var(--radius-md); font-family: var(--font-ui); font-size: 0.78rem; line-height: 1.6; color: var(--ink-paper-muted); }
</style>
