<script lang="ts">
  // A rich preview of a cited exhibit (the "mini version of the image/media/map" — dogfood feedback).
  // Cover + title + summary come from the gallery index (exhibits.json), already in memory — no fetch.
  // Links via the hash router (#/<slug>) so a click routes in-app (ViewerShell listens on hashchange).
  // Falls back to the cite's own label when the slug isn't in the gallery (cross-library / pre-load).
  import type { ExhibitsJson } from "@render/core";

  let { slug, label, entry }: { slug: string; label: string; entry?: ExhibitsJson["exhibits"][number] } = $props();
  const title = $derived(entry?.title ?? label);
  const cover = $derived(entry?.cover);
  const desc = $derived(entry?.description);
</script>

<a class="cite-card" href={`#/${slug}`} title={`Open “${title}”`}>
  <span class="cc-cover" style={cover ? `background-image:url(${cover})` : ""} aria-hidden="true"></span>
  <span class="cc-body">
    <span class="cc-title">{title}</span>
    {#if desc}<span class="cc-desc">{desc}</span>{/if}
    <span class="cc-go">→ open exhibit</span>
  </span>
</a>

<style>
  /* Raised warm-paper card, the Gallery card idiom shrunk to a horizontal mini form (cover left, text
     right). text-decoration:none + its own specificity override the prose link underline; the cite-card
     class also opts OUT of the prose ¶ link-scent (see the :not(.cite-card) selectors in the readers). */
  .cite-card {
    display: flex; gap: var(--space-4); align-items: stretch; text-decoration: none;
    margin: var(--space-3) 0; padding: var(--space-3);
    background: var(--surface-canvas-raised); color: var(--ink-paper-primary);
    border-radius: var(--radius-md); box-shadow: var(--shadow-lift-low);
    transition: transform 160ms ease, box-shadow 160ms ease;
  }
  .cite-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lift-mid); }
  .cc-cover {
    flex: 0 0 auto; width: 84px; align-self: stretch; min-height: 60px;
    background-color: var(--surface-canvas); background-size: cover; background-position: center;
    border-radius: var(--radius-sm);
  }
  .cc-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .cc-title { font-family: var(--font-display); font-size: 1.15rem; font-weight: 400; line-height: 1.15; color: var(--ink-paper-primary); }
  .cc-desc {
    font-family: var(--font-body); font-size: 0.9rem; line-height: 1.45; color: var(--ink-paper-secondary);
    overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical;
  }
  .cc-go { margin-top: auto; font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-xs); letter-spacing: 0.1em; color: var(--accent-2); }
</style>
