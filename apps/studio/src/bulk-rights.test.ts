import { describe, it, expect } from "vitest";
import type { RightsFields } from "@render/core";
import { patchExhibitsIn } from "./library-meta-reducers.js";
import type { LibraryMeta } from "./store.js";
import {
  EMPTY_BULK_RIGHTS_FORM,
  buildBulkRightsPatch,
  bulkRightsFormDirty,
  summarizeLicenses,
  summarizeCredits,
  type BulkRightsForm,
} from "./bulk-rights.js";

// The pure mixed-state → patch logic behind the bulk rights dialog (Archie-d2cc). Load-bearing property:
// an UNGATED field never appears in the patch (so it can't blank a per-exhibit value), while a GATED field
// always carries its key (a gated-blank field is a deliberate clear-for-all).
const form = (over: Partial<BulkRightsForm>): BulkRightsForm => ({ ...EMPTY_BULK_RIGHTS_FORM, ...over });

describe("bulk-rights", () => {
  it("buildBulkRightsPatch includes ONLY gated fields — an unchecked field is absent from the patch", () => {
    const patch = buildBulkRightsPatch(form({ changeLicense: true, license: "http://cc/by" }));
    expect(patch).toEqual({ rights: "http://cc/by" });
    expect("requiredStatement" in patch).toBe(false); // credit ungated → never touched
  });

  it("buildBulkRightsPatch sets a gated credit with the default Attribution label", () => {
    const patch = buildBulkRightsPatch(form({ changeCredit: true, credit: "  Held by the Beinecke  " }));
    expect(patch).toEqual({ requiredStatement: { label: "Attribution", value: "Held by the Beinecke" } });
    expect("rights" in patch).toBe(false);
  });

  it("buildBulkRightsPatch: a gated-but-blank field is a deliberate clear (key present, value undefined)", () => {
    const patch = buildBulkRightsPatch(form({ changeLicense: true, license: "", changeCredit: true, credit: "   " }));
    expect("rights" in patch).toBe(true);
    expect(patch.rights).toBeUndefined();
    expect("requiredStatement" in patch).toBe(true);
    expect(patch.requiredStatement).toBeUndefined();
  });

  it("buildBulkRightsPatch on the empty form is a no-op patch ({})", () => {
    expect(buildBulkRightsPatch(EMPTY_BULK_RIGHTS_FORM)).toEqual({});
  });

  it("bulkRightsFormDirty is true iff at least one field is gated", () => {
    expect(bulkRightsFormDirty(EMPTY_BULK_RIGHTS_FORM)).toBe(false);
    expect(bulkRightsFormDirty(form({ changeLicense: true }))).toBe(true);
    expect(bulkRightsFormDirty(form({ changeCredit: true }))).toBe(true);
  });

  // The full chain, so the ""-sentinel ↔ present-undefined ↔ key-dropped links can't break one side at a
  // time: buildBulkRightsPatch's output fed straight into the reducer the store calls.
  describe("buildBulkRightsPatch → patchExhibitsIn (end to end)", () => {
    const meta = (): LibraryMeta => ({
      title: "L",
      exhibits: [
        { id: "e1", slug: "a", title: "A", rights: "http://old", requiredStatement: { label: "Source", value: "Old" }, objects: [] },
        { id: "e2", slug: "b", title: "B", objects: [] },
      ],
    });

    it("a gated-blank credit DROPS requiredStatement on every selected exhibit", () => {
      const patch = buildBulkRightsPatch(form({ changeCredit: true, credit: "   " })); // { requiredStatement: undefined }
      const next = patchExhibitsIn(meta(), ["a", "b"], patch);
      expect("requiredStatement" in next.exhibits[0]!).toBe(false); // present-undefined → key dropped
      expect(next.exhibits[0]!.rights).toBe("http://old"); // ungated field left untouched
    });

    it("a gated license SETS rights across the selection; a gated credit SETS a uniform Attribution stamp", () => {
      const patch = buildBulkRightsPatch(form({ changeLicense: true, license: "http://cc/by", changeCredit: true, credit: "Held by X" }));
      const next = patchExhibitsIn(meta(), ["a", "b"], patch);
      expect(next.exhibits.map((e) => e.rights)).toEqual(["http://cc/by", "http://cc/by"]);
      // Uniform bulk stamp: the default "Attribution" label REPLACES exhibit a's custom "Source" label.
      expect(next.exhibits[0]!.requiredStatement).toEqual({ label: "Attribution", value: "Held by X" });
      expect(next.exhibits[1]!.requiredStatement).toEqual({ label: "Attribution", value: "Held by X" });
    });
  });

  describe("spread summaries (current-value hints)", () => {
    const withLicense = (uri?: string): RightsFields => (uri ? { rights: uri } : {});
    const withCredit = (value?: string): RightsFields => (value ? { requiredStatement: { label: "Attribution", value } } : {});

    it("none — no selected exhibit has the field set", () => {
      expect(summarizeLicenses([withLicense(), withLicense()])).toEqual({ kind: "none" });
      expect(summarizeCredits([withCredit(), withCredit()])).toEqual({ kind: "none" });
    });

    it("same — every exhibit is set AND agrees", () => {
      expect(summarizeLicenses([withLicense("http://cc/by"), withLicense("http://cc/by")])).toEqual({ kind: "same", value: "http://cc/by" });
      expect(summarizeCredits([withCredit("Beinecke"), withCredit("Beinecke")])).toEqual({ kind: "same", value: "Beinecke" });
    });

    it("mixed — values differ", () => {
      expect(summarizeLicenses([withLicense("http://cc/by"), withLicense("http://cc/by-sa")])).toEqual({ kind: "mixed" });
    });

    it("mixed — some set, some unset (a partial spread is not 'same')", () => {
      expect(summarizeLicenses([withLicense("http://cc/by"), withLicense()])).toEqual({ kind: "mixed" });
      expect(summarizeCredits([withCredit("Beinecke"), withCredit()])).toEqual({ kind: "mixed" });
    });
  });
});

describe("bulk rights never touches Dublin Core metadata (Archie-5a9b invariant)", () => {
  it("a fully-gated patch carries ONLY the rights/credit keys — no `metadata` key to clobber entries", () => {
    const patch = buildBulkRightsPatch({ changeLicense: true, license: "http://creativecommons.org/licenses/by/4.0/", changeCredit: true, credit: "Someone" });
    expect(Object.keys(patch).sort()).toEqual(["requiredStatement", "rights"]);
    expect("metadata" in patch).toBe(false);
  });
});
