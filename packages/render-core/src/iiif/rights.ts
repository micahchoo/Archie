// Project a model `RightsFields` → the IIIF rights properties spread onto a Collection (Library) /
// Manifest (Exhibit) / Canvas (Object). Core-first: emits `rights` (a license URI) + `requiredStatement`
// (the MUST-display credit). One helper, used by toCollection + toManifest + toCanvas, so the three
// levels project identically (the "same fields at every level" design). CONTEXT "Exhibit / Library
// rights & metadata"; Q1–Q3. NB: Phase 1 emits each level's OWN values — the opt-in cascade
// (child borrows parent) resolves in the later `inherit` phase, not here.

import type { RightsFields } from "../model/model.js";
import { langMap, type IIIFRightsProps } from "./presentation.js";

/** Default `requiredStatement` label when the author leaves it blank (CONTEXT Q3). */
export const DEFAULT_ATTRIBUTION_LABEL = "Attribution";

/** A selectable license (the Studio picker is an approved-URI list, not free text — IIIF `rights`
 *  must be a CC / RightsStatements.org URI; CONTEXT Q3). One source of truth for the Studio picker
 *  AND the Viewer's URI→label display. CC = canonical https; RightsStatements.org = canonical http. */
export interface LicenseOption {
  /** The IIIF `rights` URI, or "" for the no-license sentinel. */
  uri: string;
  /** Curator-facing label. */
  label: string;
}

export const LICENSES: readonly LicenseOption[] = [
  { uri: "", label: "Unspecified" },
  { uri: "http://creativecommons.org/publicdomain/zero/1.0/", label: "CC0 1.0 — Public Domain Dedication" },
  { uri: "http://creativecommons.org/publicdomain/mark/1.0/", label: "Public Domain Mark 1.0" },
  { uri: "http://creativecommons.org/licenses/by/4.0/", label: "CC BY 4.0" },
  { uri: "http://creativecommons.org/licenses/by-sa/4.0/", label: "CC BY-SA 4.0" },
  { uri: "http://creativecommons.org/licenses/by-nc/4.0/", label: "CC BY-NC 4.0" },
  { uri: "http://creativecommons.org/licenses/by-nc-sa/4.0/", label: "CC BY-NC-SA 4.0" },
  { uri: "http://creativecommons.org/licenses/by-nd/4.0/", label: "CC BY-ND 4.0" },
  { uri: "http://rightsstatements.org/vocab/InC/1.0/", label: "In Copyright" },
  { uri: "http://rightsstatements.org/vocab/InC-EDU/1.0/", label: "In Copyright — Educational Use Permitted" },
  { uri: "http://rightsstatements.org/vocab/CNE/1.0/", label: "Copyright Not Evaluated" },
] as const;

/** Human label for a license URI (the Viewer's credit/ⓘ display). Unknown URI → the URI itself;
 *  empty/undefined → undefined (no license set). */
export function licenseLabel(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  return LICENSES.find((l) => l.uri === uri)?.label ?? uri;
}

/**
 * The IIIF rights spread for a level. Absent / blank fields emit nothing (clean IIIF — no empty
 * `requiredStatement`). `requiredStatement` is emitted only when its `value` is non-blank; its `label`
 * falls back to "Attribution". `rights` is emitted only when a (truthy) license URI is set.
 */
export function rightsProps(fields: RightsFields | undefined): IIIFRightsProps {
  if (!fields) return {};
  const out: IIIFRightsProps = {};
  if (fields.rights) out.rights = fields.rights;
  const rs = fields.requiredStatement;
  if (rs && rs.value.trim() !== "") {
    out.requiredStatement = {
      label: langMap(rs.label.trim() !== "" ? rs.label : DEFAULT_ATTRIBUTION_LABEL),
      value: langMap(rs.value),
    };
  }
  return out;
}

/** First value of a IIIF language map (Archie writes single-language `none` maps). */
function unLang(m: { [k: string]: string[] }): string {
  return Object.values(m)[0]?.[0] ?? "";
}

/**
 * Inverse of `rightsProps`: recover the model `RightsFields` from an IIIF resource's rights props
 * (the load path — Studio re-open + the Viewer's published read). Round-trip-exact for what
 * `rightsProps` emits. Returns `{}` (no fields) when the resource carries none.
 */
export function rightsFromIIIF(res: IIIFRightsProps | undefined): RightsFields {
  if (!res) return {};
  const out: RightsFields = {};
  if (res.rights) out.rights = res.rights;
  if (res.requiredStatement) {
    out.requiredStatement = {
      label: unLang(res.requiredStatement.label),
      value: unLang(res.requiredStatement.value),
    };
  }
  return out;
}
