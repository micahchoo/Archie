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
    { type: "single", name: "Single", stance: "Keep visitors on one media item.", consequence: "It fills the view, with your notes alongside it." },
    { type: "grid", name: "Grid", stance: "Lay out the whole collection to browse.", consequence: "Visitors scan the media and pick what to look at." },
    { type: "narrative", name: "Narrative", stance: "Let your writing lead the way through.", consequence: "Your sections move from one media item to the next, in the order you set." },
  ];
  const FAMILIES: { family: ReadingFamily; label: string; clause: string; future: string }[] = [
    { family: "object-led", label: "Media first", clause: "the media is what visitors came to see", future: "More arrangements are coming for this group, such as comparing two items side by side." },
    { family: "prose-led", label: "Writing first", clause: "your writing leads and the media follows along", future: "More ways to pace your writing are coming for this group, such as advancing it by scroll." },
  ];
  const optionsIn = (f: ReadingFamily) => OPTIONS.filter((o) => readingFamily(o.type) === f);
</script>

<div class="scrim" role="presentation" onclick={() => onclose()}>
  <div class="sheet" role="dialog" aria-label="Choose how this exhibit is read" onclick={(e) => e.stopPropagation()}>
    <header>
      <h2>How should this exhibit be read?</h2>
      <p>Each option changes how visitors move through the published exhibit — what they see first and how your writing fits around it. This only affects the published exhibit, not how you edit it here.</p>
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
                    <svg viewBox="0 0 64 44"><rect class="frame fill" x="10" y="6" width="44" height="32" /></svg>
                  {:else if o.type === "grid"}
                    <svg viewBox="0 0 64 44"><rect class="frame fill" x="8" y="6" width="22" height="14" /><rect class="frame" x="34" y="6" width="22" height="14" /><rect class="frame" x="8" y="24" width="22" height="14" /><rect class="frame fill" x="34" y="24" width="22" height="14" /></svg>
                  {:else}
                    <svg viewBox="0 0 64 44"><rect class="frame fill" x="6" y="6" width="30" height="32" /><line class="rule" x1="42" y1="11" x2="58" y2="11" /><line class="rule" x1="42" y1="18" x2="58" y2="18" /><line class="rule accent" x1="42" y1="25" x2="54" y2="25" /><line class="rule" x1="42" y1="32" x2="58" y2="32" /></svg>
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
        <p class="future" title="Coming soon to this group">{fam.future}</p>
      </section>
    {/each}

    {#if current === "narrative"}
      <p class="note">Narrative is built from your sections — short passages you write, each paired with a media item. Add and order them in the narrative panel beside your notes.</p>
    {/if}
  </div>
</div>

<style>
  /* Soft Static intent sheet floating on a warm scrim — choosing the form of a finished publication.
     The active choice + its diagram region carry a quiet accent-muted tint (active state). */
  .scrim { position: fixed; inset: 0; z-index: 60; display: flex; justify-content: center; align-items: flex-start; padding-top: 10vh; background: rgba(59, 49, 56, 0.42); }
  .sheet {
    width: min(540px, 92vw); max-height: 80vh; overflow: auto; box-sizing: border-box;
    background: var(--surface-canvas-raised); color: var(--ink-paper-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lift-mid);
    padding: var(--space-5);
  }
  header { margin-bottom: var(--space-4); }
  header h2 { font-family: var(--font-display); font-size: 1.5rem; font-weight: 300; line-height: 1.2; margin: 0 0 var(--space-2); color: var(--ink-paper-primary); text-shadow: var(--shadow-text-haze); }
  header p { font-family: var(--font-body); font-size: 0.9rem; line-height: 1.6; color: var(--ink-paper-secondary); margin: 0; }

  /* Each reading family is a group (the §43 reading-mode axis), so the choice reads as "what kind of
     reading" rather than a flat row of templates. */
  .group { margin-bottom: var(--space-5); }
  .group:last-of-type { margin-bottom: 0; }
  .fam { display: flex; align-items: baseline; gap: var(--space-2); margin: 0 0 var(--space-2); }
  .fam-name { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-paper-secondary); opacity: 0.62; }
  .fam-clause { font-family: var(--font-body); font-style: italic; font-size: 0.9rem; color: var(--ink-paper-muted); }
  /* The additive future, made legible: where v1.1 reading modes attach to THIS family. */
  .future { margin: var(--space-2) 0 0; font-family: var(--font-ui); font-size: var(--text-ui-xs); line-height: 1.6; color: var(--ink-paper-muted); padding-left: var(--space-3); border-left: 2px solid var(--accent-3-muted); }

  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  button {
    display: flex; align-items: center; gap: var(--space-4); width: 100%; text-align: left; cursor: pointer;
    padding: var(--space-3) var(--space-4);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: none; border-left: 3px solid transparent; border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
    transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  }
  button:hover { background: var(--surface-paper-hover); border-left-color: var(--accent-2); box-shadow: var(--shadow-lift-mid); }
  button.active { background: var(--accent-muted); border-left-color: var(--accent); }

  .diagram { flex-shrink: 0; width: 64px; height: 44px; }
  .diagram svg { width: 64px; height: 44px; }
  .frame { fill: none; stroke: var(--accent-3); stroke-width: 2; stroke-linejoin: round; }
  .frame.fill { fill: var(--accent-3-muted); }
  .rule { stroke: var(--ink-paper-muted); stroke-width: 2; stroke-linecap: round; }
  button.active .frame { stroke: var(--clay-line); }
  button.active .frame.fill { fill: var(--accent-muted); }
  .rule.accent { stroke: var(--accent); }

  .text { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
  .name { font-family: var(--font-display); font-size: 1.2rem; font-weight: 400; line-height: 1.1; display: flex; align-items: baseline; gap: var(--space-2); }
  .now { font-family: var(--font-mono); font-size: 0.6rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent); opacity: 0.8; }
  .stance { font-family: var(--font-body); font-size: 1.02rem; font-weight: 600; line-height: 1.4; color: var(--ink-paper-primary); }
  .consequence { font-family: var(--font-body); font-size: 0.92rem; line-height: 1.6; color: var(--ink-paper-secondary); }

  .note { margin: var(--space-4) 0 0; padding: var(--space-3) var(--space-4); background: var(--surface-canvas-overlay); border-radius: var(--radius-md); box-shadow: var(--shadow-inset-fog); font-family: var(--font-body); font-size: 0.85rem; line-height: 1.6; color: var(--ink-paper-secondary); }
</style>
