<script lang="ts">
  // The shared rights/credit form (CONTEXT "Exhibit / Library rights & metadata"; rights grill Q6).
  // ONE component, rendered at THREE levels (Library / Exhibit / Object) — host-agnostic: it renders
  // only the FIELDS; the host supplies the chrome (a slide-in drawer for Library + Exhibit, an inline
  // panel for the Object editor). Core-first = credit + license; provider/metadata/contributors/inherit
  // are the additive "More fields" phase. Copy is CURATOR voice — no "requiredStatement"/"metadata" jargon.
  import { LICENSES, type RightsFields } from "@render/core";

  let {
    value,
    scope,
    onchange,
  }: {
    /** The level's current rights (credit + license). */
    value: RightsFields;
    /** Curator-facing noun for THIS level, used in the helper copy (e.g. "object", "exhibit", "library"). */
    scope: string;
    /** Emit the next RightsFields whenever a field changes — the host merges it into the meta + persists. */
    onchange: (next: RightsFields) => void;
  } = $props();

  // The credit's displayed VALUE; the label stays "Attribution" by default but PRESERVES a custom label
  // already on the record (e.g. an imported "Source"/"Held by") — custom-label editing is the additive phase.
  const creditValue = $derived(value.requiredStatement?.value ?? "");
  const creditLabel = $derived(value.requiredStatement?.label ?? "Attribution");
  const license = $derived(value.rights ?? "");

  function setCredit(text: string) {
    const next: RightsFields = { ...value };
    if (text.trim() === "") delete next.requiredStatement;
    else next.requiredStatement = { label: creditLabel, value: text };
    onchange(next);
  }
  function setLicense(uri: string) {
    const next: RightsFields = { ...value };
    if (uri === "") delete next.rights;
    else next.rights = uri;
    onchange(next);
  }
</script>

<div class="rights">
  <label class="field">
    <span class="field-head">Attribution / credit</span>
    <textarea
      rows="2"
      placeholder="Who to credit when this {scope} is shown or shared"
      value={creditValue}
      oninput={(e) => setCredit((e.currentTarget as HTMLTextAreaElement).value)}
    ></textarea>
  </label>

  <label class="field">
    <span class="field-head">License</span>
    <select value={license} onchange={(e) => setLicense((e.currentTarget as HTMLSelectElement).value)}>
      {#each LICENSES as opt (opt.uri)}
        <option value={opt.uri}>{opt.label}</option>
      {/each}
    </select>
  </label>

  <p class="hint">Shown to anyone who views or reuses this {scope}. A pure IIIF viewer displays the credit too.</p>
</div>

<style>
  .rights { display: flex; flex-direction: column; gap: var(--space-3); }
  .field { display: flex; flex-direction: column; gap: var(--space-1); }
  .field-head {
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-xs, 0.7rem); font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.18em; color: var(--ink-paper-muted, var(--ink-paper-secondary));
    opacity: 0.6;
  }
  textarea, select {
    font-family: var(--font-body), serif; font-size: 0.85rem; color: var(--ink-paper-primary);
    background: var(--surface-paper-card); border: 1px solid var(--border-paper);
    border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); width: 100%; box-sizing: border-box;
  }
  textarea { resize: vertical; min-height: 2.4rem; }
  select { font-family: var(--font-ui), sans-serif; cursor: pointer; }
  textarea:focus, select:focus { outline: none; border-color: var(--accent); }
  .hint {
    margin: 0; font-family: var(--font-body), serif; font-size: 0.75rem; line-height: 1.6;
    color: var(--ink-paper-muted, var(--ink-paper-secondary));
  }
</style>
