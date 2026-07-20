import { describe, it, expect } from "vitest";
import {
  DCTERMS_PROPERTIES,
  DEFAULT_METADATA_FIELDS,
  IMPORT_LABEL_ALIASES,
  METADATA_EXCLUDED_PROPERTIES,
  dctermsLabel,
  dctermsProperty,
  matchDctermsProperty,
} from "./dcterms.js";
import { isMetadataEntry, sanitizeMetadataEntries } from "./model.js";

describe("dcterms vocabulary data", () => {
  it("carries exactly the 55 dcterms properties, dcterms:-prefixed and unique", () => {
    expect(DCTERMS_PROPERTIES).toHaveLength(55);
    const names = DCTERMS_PROPERTIES.map((p) => p.property);
    expect(new Set(names).size).toBe(55);
    for (const p of DCTERMS_PROPERTIES) {
      expect(p.property.startsWith("dcterms:")).toBe(true);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.comment.length).toBeGreaterThan(0);
    }
  });

  it("looks up a property record and its preferred label", () => {
    expect(dctermsProperty("dcterms:creator")?.label).toBe("Creator");
    expect(dctermsLabel("dcterms:spatial")).toBe("Spatial Coverage");
    expect(dctermsLabel("dcterms:nope")).toBeUndefined();
  });

  it("excludes exactly the native-field collision set", () => {
    expect([...METADATA_EXCLUDED_PROPERTIES].sort()).toEqual([
      "dcterms:abstract", "dcterms:description", "dcterms:license", "dcterms:rights", "dcterms:title",
    ]);
    // every excluded property is a real vocabulary member
    for (const p of METADATA_EXCLUDED_PROPERTIES) expect(dctermsProperty(p)).toBeDefined();
  });

  it("default field sets are the fixed per-level sets, all valid + non-excluded", () => {
    expect(DEFAULT_METADATA_FIELDS.library).toEqual(["dcterms:creator", "dcterms:publisher", "dcterms:date", "dcterms:identifier"]);
    expect(DEFAULT_METADATA_FIELDS.exhibit).toEqual(["dcterms:creator", "dcterms:date", "dcterms:subject"]);
    expect(DEFAULT_METADATA_FIELDS.object).toEqual(["dcterms:creator", "dcterms:date", "dcterms:subject", "dcterms:type", "dcterms:identifier", "dcterms:source"]);
    for (const set of Object.values(DEFAULT_METADATA_FIELDS)) {
      for (const p of set) {
        expect(dctermsProperty(p)).toBeDefined();
        expect(METADATA_EXCLUDED_PROPERTIES.has(p)).toBe(false);
      }
    }
  });
});

describe("matchDctermsProperty — case-insensitive label + alias matching", () => {
  it("matches preferred labels case-insensitively", () => {
    expect(matchDctermsProperty("Creator")).toBe("dcterms:creator");
    expect(matchDctermsProperty("creator")).toBe("dcterms:creator");
    expect(matchDctermsProperty("  DATE CREATED ")).toBe("dcterms:created");
  });
  it("matches the alias table (author → dcterms:creator and kin)", () => {
    expect(matchDctermsProperty("Author")).toBe("dcterms:creator");
    expect(matchDctermsProperty("keywords")).toBe("dcterms:subject");
    expect(matchDctermsProperty("Call Number")).toBe("dcterms:identifier");
    for (const [alias, prop] of Object.entries(IMPORT_LABEL_ALIASES)) {
      expect(alias).toBe(alias.toLowerCase()); // matcher lowercases — keys must be lowercase
      expect(dctermsProperty(prop)).toBeDefined();
    }
  });
  it("still MATCHES an excluded property's label (exclusion is the caller's check)", () => {
    expect(matchDctermsProperty("Title")).toBe("dcterms:title");
  });
  it("returns undefined for unknown / blank labels", () => {
    expect(matchDctermsProperty("Shelfmark of the west wing")).toBeUndefined();
    expect(matchDctermsProperty("   ")).toBeUndefined();
  });
});

describe("isMetadataEntry / sanitizeMetadataEntries — the read-boundary validator", () => {
  it("accepts property-only, label-only, and both", () => {
    expect(isMetadataEntry({ property: "dcterms:creator", value: "Ada" })).toBe(true);
    expect(isMetadataEntry({ label: "Shelfmark", value: "MS 408" })).toBe(true);
    expect(isMetadataEntry({ property: "dcterms:creator", label: "Author", value: "Ada" })).toBe(true);
  });
  it("rejects entries with neither property nor a non-blank label", () => {
    expect(isMetadataEntry({ value: "orphan" })).toBe(false);
    expect(isMetadataEntry({ label: "   ", value: "orphan" })).toBe(false);
  });
  it("rejects non-dcterms properties (dc: legacy prefix included) and non-string values", () => {
    expect(isMetadataEntry({ property: "dc:creator", value: "Ada" })).toBe(false);
    expect(isMetadataEntry({ property: "dcterms:", value: "Ada" })).toBe(false);
    expect(isMetadataEntry({ property: "dcterms:creator", value: 7 })).toBe(false);
    expect(isMetadataEntry(null)).toBe(false);
    expect(isMetadataEntry("dcterms:creator=Ada")).toBe(false);
  });
  it("sanitize keeps valid entries in order, SKIPS malformed ones (per-item tolerant, contract #2)", () => {
    expect(sanitizeMetadataEntries([
      { property: "dcterms:creator", value: "Ada" },
      { property: "dc:creator", value: "legacy — dropped" },
      { label: "Shelfmark", value: "MS 408", stray: "ignored" },
      "garbage",
    ])).toEqual([
      { property: "dcterms:creator", value: "Ada" },
      { label: "Shelfmark", value: "MS 408" }, // rebuilt to the known fields only
    ]);
  });
  it("sanitize returns undefined for non-arrays and all-invalid arrays (absent stays absent)", () => {
    expect(sanitizeMetadataEntries(undefined)).toBeUndefined();
    expect(sanitizeMetadataEntries("nope")).toBeUndefined();
    expect(sanitizeMetadataEntries([{ value: "no key" }])).toBeUndefined();
    expect(sanitizeMetadataEntries([])).toBeUndefined();
  });
});
