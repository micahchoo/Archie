// Bulk rights edit (collection-import Phase 2, plan §9 / Archie-d2cc): apply ONE license + credit patch
// across a SELECTION of exhibits — the field an institutional bulk import actually needs to set uniformly.
// Title/description are deliberately NOT bulk-editable (bulk title is nonsense; bulk description would
// stomp per-exhibit provenance — plan §9). Pure so the mixed-state → patch logic is testable headless; the
// chrome is BulkRightsDialog.svelte, the write is the library store's patchExhibits.
//
// MIXED-STATE POLICY (plan §9 "keep it simple but never silently erase"): each of the two fields is gated
// by an EXPLICIT "change this field" flag.
//   - An UNGATED field contributes NOTHING to the patch — every selected exhibit keeps its OWN value
//     (a field the curator never touched can never be blanked).
//   - A GATED field always contributes its KEY (possibly `undefined`): a gated-but-blank field is a
//     DELIBERATE clear-for-all, mirroring the single-exhibit RightsEditor (blank credit / "Unspecified"
//     license clears the field). This is why the dialog disables each input until its flag is checked —
//     you cannot edit-and-forget, and you cannot blank a field you never opened.
import { DEFAULT_ATTRIBUTION_LABEL, type RightsFields } from "@render/core";

export interface BulkRightsForm {
  /** Apply the license to every selected exhibit (false = leave each exhibit's own license untouched). */
  changeLicense: boolean;
  /** The license URI to set when `changeLicense` ("" = the Unspecified sentinel → clears `rights`). */
  license: string;
  /** Apply the attribution/credit to every selected exhibit (false = leave each exhibit's own credit). */
  changeCredit: boolean;
  /** The credit text to set when `changeCredit` (blank → clears `requiredStatement`). */
  credit: string;
}

export const EMPTY_BULK_RIGHTS_FORM: BulkRightsForm = {
  changeLicense: false,
  license: "",
  changeCredit: false,
  credit: "",
};

/** A rights patch where a field may be SET or explicitly CLEARED — the `RightsFields` projection of
 *  library-meta-reducers' `ExhibitMetaPatch` (a present key with an `undefined` value is a deliberate
 *  clear, legal under `exactOptionalPropertyTypes`; assignable to `ExhibitMetaPatch` when threaded to
 *  lib.patchExhibits). */
export type RightsFieldsPatch = { [K in keyof RightsFields]?: RightsFields[K] | undefined };

/** The patch a submit builds — ONLY the gated fields, each carrying its KEY (present-with-`undefined` = a
 *  deliberate clear; absent = leave unchanged). Fed straight to patchExhibitsIn / lib.patchExhibits, where
 *  `{ ...e, ...patch }` overwrites exactly the present keys and leaves the rest alone.
 *  INVARIANT (Archie-5a9b metadata audit): the patch NEVER carries a `metadata` key — a bulk license/credit
 *  stamp must never clobber an exhibit's Dublin Core entries. If bulk metadata editing ever ships, it gets
 *  its own gated field here; do not fold it into the rights/credit gates. */
export function buildBulkRightsPatch(form: BulkRightsForm): RightsFieldsPatch {
  const patch: RightsFieldsPatch = {};
  if (form.changeLicense) patch.rights = form.license || undefined;
  if (form.changeCredit) {
    const value = form.credit.trim();
    // DELIBERATE DIVERGENCE from the single-exhibit path: a bulk stamp always writes the DEFAULT
    // "Attribution" label, whereas RightsEditor.setCredit (RightsEditor.svelte:24-31) PRESERVES a record's
    // existing custom `requiredStatement.label`. Bulk edit sets ONE uniform credit across N exhibits, so a
    // single shared label is the correct outcome — a per-exhibit custom label can't survive a uniform stamp
    // (and would be non-deterministic across a mixed selection). The dialog's credit hint says so.
    patch.requiredStatement = value ? { label: DEFAULT_ATTRIBUTION_LABEL, value } : undefined;
  }
  return patch;
}

/** Would this form write anything? Nothing gated = nothing to apply — the dialog disables Apply on false. */
export function bulkRightsFormDirty(form: BulkRightsForm): boolean {
  return form.changeLicense || form.changeCredit;
}

/** The current spread of ONE field across the selection, so the dialog can name what an apply would
 *  overwrite: `none` (no selected exhibit has it set), `same` (all set AND agree — a uniform value), or
 *  `mixed` (values differ, or some set + some unset). */
export type RightsSpread = { kind: "none" } | { kind: "same"; value: string } | { kind: "mixed" };

function spreadOf(values: readonly (string | undefined)[]): RightsSpread {
  const present = values.filter((v): v is string => !!v && v.trim() !== "");
  if (present.length === 0) return { kind: "none" };
  const allPresent = present.length === values.length;
  const uniform = present.every((v) => v === present[0]);
  return allPresent && uniform ? { kind: "same", value: present[0]! } : { kind: "mixed" };
}

export function summarizeLicenses(list: readonly RightsFields[]): RightsSpread {
  return spreadOf(list.map((r) => r.rights));
}
export function summarizeCredits(list: readonly RightsFields[]): RightsSpread {
  return spreadOf(list.map((r) => r.requiredStatement?.value));
}
