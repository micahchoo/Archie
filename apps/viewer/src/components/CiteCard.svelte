<script lang="ts">
  // A typed cite preview for the non-exhibit ladder rungs (object / note / region) — ADR-0018 Phase 4.
  // Sibling to ExhibitCiteCard (which keeps the exhibit cover card). Links via the slug-qualified hash
  // router so a click routes in-app (ViewerShell listens on hashchange): object → #/<slug>/o/<id>,
  // note → #/<slug>/a/<id>, region → #/<slug>/a/<id>?xywh=…. Carries the load-bearing `cite-card` class
  // so it opts OUT of the prose ¶ link-scent (the readers' :not(.cite-card) selectors) like ExhibitCiteCard.
  // A region cite renders the kind badge over an empty cover TODAY; the baked IIIF/preview crop is Phase 4
  // (ADR-0018) — iiifRegionUrl/iiifThumbUrl exist in render-core but no publish/ step emits `crop` yet, so
  // the `crop` prop is forward-compat wiring and is currently always undefined.
  import type { ClassifiedCite, ExhibitsJson } from "@render/core";

  let { cite, label, entry, crop }: {
    cite: ClassifiedCite;
    label: string;
    entry?: ExhibitsJson["exhibits"][number];
    crop?: string;
  } = $props();

  const href = $derived(
    cite.kind === "object" ? `#/${cite.slug}/o/${cite.objectId}`
    : cite.kind === "region" ? `#/${cite.slug}/a/${cite.noteId}?xywh=${cite.xywh}`
    : cite.kind === "note" ? `#/${cite.slug}/a/${cite.noteId}`
    : `#/${cite.slug}`,
  );
  const kindLabel = $derived(cite.kind === "object" ? "Object" : cite.kind === "region" ? "Detail" : "Note");
  const go = $derived(cite.kind === "object" ? "→ open object" : cite.kind === "region" ? "→ open detail" : "→ open note");
  // Region cites show the cropped detail (baked IIIF/preview url); others fall back to the exhibit cover.
  const img = $derived(crop ?? (cite.kind === "region" ? undefined : entry?.cover));
</script>

<a class="cite-card cite-card--{cite.kind}" {href} title={`Open ${label}`}>
  <span class="cc-cover" class:cc-crop={cite.kind === "region"} style={img ? `background-image:url(${img})` : ""} aria-hidden="true">
    <span class="cc-kind">{kindLabel}</span>
  </span>
  <span class="cc-body">
    <span class="cc-title">{label}</span>
    <span class="cc-from">in {entry?.title ?? cite.slug}</span>
    <span class="cc-go">{go}</span>
  </span>
</a>

<style>
  /* Mirrors ExhibitCiteCard's mini-card idiom (warm-paper raised card, cover left / text right). */
  .cite-card {
    display: flex; gap: var(--space-4); align-items: stretch; text-decoration: none;
    margin: var(--space-3) 0; padding: var(--space-3);
    background: var(--surface-canvas-raised); color: var(--ink-paper-primary);
    border-radius: var(--radius-md); box-shadow: var(--shadow-lift-low);
    transition: transform 160ms ease, box-shadow 160ms ease;
  }
  .cite-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lift-mid); }
  .cc-cover {
    position: relative; flex: 0 0 auto; width: 84px; align-self: stretch; min-height: 60px;
    background-color: var(--surface-canvas); background-size: cover; background-position: center;
    border-radius: var(--radius-sm); display: flex; align-items: flex-end; justify-content: flex-start;
  }
  /* A region crop is the load-bearing visual — give it more room and contain (not cover) so the detail reads. */
  .cc-crop { background-size: contain; background-repeat: no-repeat; width: 120px; }
  .cc-kind {
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-xs); letter-spacing: 0.08em;
    text-transform: uppercase; padding: 1px 5px; margin: 4px; border-radius: var(--radius-sm);
    background: var(--accent-2); color: var(--surface-canvas-raised);
  }
  .cc-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .cc-title { font-family: var(--font-display); font-size: 1.1rem; font-weight: 400; line-height: 1.15; color: var(--ink-paper-primary); }
  .cc-from { font-family: var(--font-body); font-size: 0.82rem; color: var(--ink-paper-secondary); }
  .cc-go { margin-top: auto; font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-xs); letter-spacing: 0.1em; color: var(--accent-2); }
</style>
