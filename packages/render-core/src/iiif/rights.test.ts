import { describe, it, expect } from "vitest";
import { rightsProps, rightsFromIIIF, DEFAULT_ATTRIBUTION_LABEL } from "./rights.js";
import { toCollection } from "./collection.js";
import { toManifest, objectsFromManifest } from "./manifest.js";
import { toExhibitsJson } from "./exhibits.js";
import { publishLibrary, loadLibrary } from "../publish/site.js";
import { MemoryFilesystem } from "../fs/memory.js";
import type { Library, Exhibit, AObject, RightsFields } from "../model/model.js";
import { asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";

const CC_BY = "http://creativecommons.org/licenses/by/4.0/";

describe("rightsProps — model RightsFields → IIIF rights props (forward)", () => {
  it("emits nothing for undefined / empty fields", () => {
    expect(rightsProps(undefined)).toEqual({});
    expect(rightsProps({})).toEqual({});
  });

  it("emits a bare license URI as `rights`", () => {
    expect(rightsProps({ rights: CC_BY })).toEqual({ rights: CC_BY });
  });

  it("emits requiredStatement as a dual language-map pair", () => {
    expect(rightsProps({ requiredStatement: { label: "Source", value: "Beinecke MS 408" } })).toEqual({
      requiredStatement: { label: { none: ["Source"] }, value: { none: ["Beinecke MS 408"] } },
    });
  });

  it("defaults a blank requiredStatement label to 'Attribution'", () => {
    expect(rightsProps({ requiredStatement: { label: "", value: "Beinecke" } })).toEqual({
      requiredStatement: { label: { none: [DEFAULT_ATTRIBUTION_LABEL] }, value: { none: ["Beinecke"] } },
    });
  });

  it("omits a requiredStatement whose value is blank (no empty MUST-display statement)", () => {
    expect(rightsProps({ requiredStatement: { label: "Attribution", value: "   " } })).toEqual({});
  });

  it("omits an empty-string license", () => {
    expect(rightsProps({ rights: "" })).toEqual({});
  });

  it("emits both rights and requiredStatement together", () => {
    expect(rightsProps({ rights: CC_BY, requiredStatement: { label: "Source", value: "Beinecke" } })).toEqual({
      rights: CC_BY,
      requiredStatement: { label: { none: ["Source"] }, value: { none: ["Beinecke"] } },
    });
  });
});

describe("rightsFromIIIF — IIIF rights props → model RightsFields (reverse)", () => {
  it("recovers nothing from undefined / empty", () => {
    expect(rightsFromIIIF(undefined)).toEqual({});
    expect(rightsFromIIIF({})).toEqual({});
  });

  it("unwraps the requiredStatement language maps", () => {
    expect(rightsFromIIIF({ requiredStatement: { label: { none: ["Source"] }, value: { none: ["Beinecke"] } } })).toEqual({
      requiredStatement: { label: "Source", value: "Beinecke" },
    });
  });

  it("round-trips a canonical RightsFields exactly (label set, value set)", () => {
    const x: RightsFields = { rights: CC_BY, requiredStatement: { label: "Source", value: "Beinecke MS 408" } };
    expect(rightsFromIIIF(rightsProps(x))).toEqual(x);
  });

  it("round-trips the default-label case (blank label resolves to 'Attribution' and stays stable)", () => {
    const projected = rightsProps({ rights: CC_BY, requiredStatement: { label: "", value: "Beinecke" } });
    expect(rightsFromIIIF(projected)).toEqual({
      rights: CC_BY,
      requiredStatement: { label: DEFAULT_ATTRIBUTION_LABEL, value: "Beinecke" },
    });
  });
});

describe("the three IIIF projections carry rights at every level", () => {
  const obj: AObject = {
    id: asObjectId("o1"),
    source: "https://img/o1.jpg",
    label: "Folio 1r",
    rights: "http://rightsstatements.org/vocab/InC/1.0/",
    requiredStatement: { label: "Held by", value: "Beinecke Rare Book Library" },
  };
  const exhibit: Exhibit = {
    id: asExhibitId("ex"),
    slug: "voynich",
    title: "Voynich",
    objects: [obj],
    rights: CC_BY,
    requiredStatement: { label: "", value: "Compiled by the curator" }, // blank label → "Attribution"
  };
  const library: Library = {
    id: asLibraryId("lib"),
    title: "Archie",
    exhibits: [exhibit],
    rights: "http://creativecommons.org/publicdomain/zero/1.0/",
    requiredStatement: { label: "Collection", value: "The Archie Library" },
  };

  it("toCollection emits Library rights", () => {
    const c = toCollection(library);
    expect(c.rights).toBe("http://creativecommons.org/publicdomain/zero/1.0/");
    expect(c.requiredStatement).toEqual({ label: { none: ["Collection"] }, value: { none: ["The Archie Library"] } });
  });

  it("toManifest emits Exhibit rights (with the default-label fallback)", () => {
    const m = toManifest(exhibit);
    expect(m.rights).toBe(CC_BY);
    expect(m.requiredStatement).toEqual({ label: { none: [DEFAULT_ATTRIBUTION_LABEL] }, value: { none: ["Compiled by the curator"] } });
  });

  it("toManifest's canvas emits Object rights", () => {
    const canvas = toManifest(exhibit).items[0]!;
    expect(canvas.rights).toBe("http://rightsstatements.org/vocab/InC/1.0/");
    expect(canvas.requiredStatement).toEqual({ label: { none: ["Held by"] }, value: { none: ["Beinecke Rare Book Library"] } });
  });

  it("objectsFromManifest recovers Object rights (canvas round-trip)", () => {
    const recovered = objectsFromManifest(toManifest(exhibit))[0]!;
    expect(recovered.rights).toBe("http://rightsstatements.org/vocab/InC/1.0/");
    expect(recovered.requiredStatement).toEqual({ label: "Held by", value: "Beinecke Rare Book Library" });
  });

  it("toExhibitsJson carries Library rights in the friendly model shape (the Gallery source)", () => {
    const ej = toExhibitsJson(library);
    expect(ej.library.rights).toBe("http://creativecommons.org/publicdomain/zero/1.0/");
    expect(ej.library.requiredStatement).toEqual({ label: "Collection", value: "The Archie Library" });
  });
});

describe("object summary (description) projects to + recovers from the Canvas (Phase 4)", () => {
  const exhibit: Exhibit = {
    id: asExhibitId("ex"), slug: "voynich", title: "Voynich",
    objects: [{ id: asObjectId("o1"), source: "https://img/o1.jpg", label: "Folio 1r", summary: "The opening herbal page." }],
  };
  it("toManifest emits the Canvas summary as a language map", () => {
    const canvas = toManifest(exhibit).items[0]!;
    expect(canvas.summary).toEqual({ none: ["The opening herbal page."] });
  });
  it("objectsFromManifest recovers the object summary", () => {
    expect(objectsFromManifest(toManifest(exhibit))[0]!.summary).toBe("The opening herbal page.");
  });
  it("omits the Canvas summary when absent or empty", () => {
    const noSummary: Exhibit = { id: asExhibitId("ex"), slug: "s", title: "T", objects: [{ id: asObjectId("o1"), source: "x", label: "L", summary: "" }] };
    expect(toManifest(noSummary).items[0]!.summary).toBeUndefined();
  });
});

describe("publish ↔ load round-trip preserves rights at all three levels", () => {
  it("loadLibrary restores library / exhibit / object rights", async () => {
    const library: Library = {
      id: asLibraryId("lib"),
      title: "Archie",
      rights: "http://creativecommons.org/publicdomain/zero/1.0/",
      requiredStatement: { label: "Collection", value: "The Archie Library" },
      exhibits: [
        {
          id: asExhibitId("ex-voynich"),
          slug: "voynich",
          title: "Voynich",
          rights: CC_BY,
          requiredStatement: { label: "Source", value: "Beinecke MS 408" },
          objects: [
            {
              id: asObjectId("o1"),
              source: "https://img/o1.jpg",
              label: "Folio 1r",
              rights: "http://rightsstatements.org/vocab/InC/1.0/",
              requiredStatement: { label: "Held by", value: "Beinecke" },
            },
          ],
        },
      ],
    };
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, library, () => [], { baseUrl: "https://u.gh.io/lib/" });
    const { library: back } = await loadLibrary(fs);

    expect(back.rights).toBe("http://creativecommons.org/publicdomain/zero/1.0/");
    expect(back.requiredStatement).toEqual({ label: "Collection", value: "The Archie Library" });

    const ex = back.exhibits[0]!;
    expect(ex.rights).toBe(CC_BY);
    expect(ex.requiredStatement).toEqual({ label: "Source", value: "Beinecke MS 408" });

    const o = ex.objects[0]!;
    expect(o.rights).toBe("http://rightsstatements.org/vocab/InC/1.0/");
    expect(o.requiredStatement).toEqual({ label: "Held by", value: "Beinecke" });
  });
});
