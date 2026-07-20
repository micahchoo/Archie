<script lang="ts">
  // The ONE ring spinner (indeterminate wait). Until this file, apps/studio carried five hand-rolled
  // copies (CreateExhibitDialog ×2, Publish, App, ExhibitOverview) that had already drifted: three
  // different track colours against the same accent cap, 0.7s vs 0.8s timing, and only one of the five
  // honouring prefers-reduced-motion. Consolidated settlement:
  //   - track `--accent-muted`: a translucent tint, so it reads on the canvas AND paper surfaces
  //     (Publish) without a per-surface variant, and it matches the determinate bar's track in
  //     ExhibitOverview — spinner and bar are the same signal at two levels of knowledge.
  //   - 0.7s linear (the majority timing), slowed to 2.4s under prefers-reduced-motion for everyone.
  // Always decorative: aria-hidden here, never a role — the accompanying role="status" text carries
  // the announcement (the house pattern; see CreateExhibitDialog's import-progress).
  let { size = 13 }: { /** Diameter in px; ring weight stays 2px at every size. */ size?: number } = $props();
</script>

<span class="spinner" aria-hidden="true" style="width:{size}px;height:{size}px"></span>

<style>
  .spinner {
    display: inline-block;
    flex: none;
    border-radius: 50%;
    border: 2px solid var(--accent-muted);
    border-top-color: var(--accent);
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .spinner { animation-duration: 2.4s; }
  }
</style>
