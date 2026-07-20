import { describe, it, expect } from "vitest";
import { metadataDisplayLabel, metadataToIIIF, metadataProps, metadataFromIIIF } from "./metadata.js";
import { rightsProps, rightsFromIIIF } from "./rights.js";
import { toCollection } from "./collection.js";
import { toManifest, objectsFromManifest } from "./manifest.js";
import { toExhibitsJson } from "./exhibits.js";
import { publishLibrary, loadLibrary } from "../publish/site.js";
import { workingToLibrary, libraryToWorking, type WorkingLibraryMeta } from "../publish/working.js";
import { MemoryFilesystem } from "../fs/memory.js";
import type { Exhibit, Library, MetadataEntry } from "../model/model.js";
import { asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";

const ENTRIES: MetadataEntry[] = [
  { property: "dcterms:creator", value: "Ada Lovelace" },
  { property: "dcterms:creator", label: "Author", value: "Charles Babbage" }, // repeat, own label
  { property: "dcterms:date", value: "1843" },
  { label: "Shelfmark", value: "MS 408" }, // verbatim (no property)
];

describe("metadataDisplayLabel", () => {
  it("prefers the per-entry override, then the vocab label, then the bare name", () => {
    expect(metadataDisplayLabel({ property: "dcterms:creator", label: "Author", value: "x" })).toBe("Author");
    expect(metadataDisplayLabel({ property: "dcterms:creator", value: "x" })).toBe("Creator");
    expect(metadataDisplayLabel({ property: "dcterms:futureTerm", value: "x" })).toBe("futureTerm");
    expect(metadataDisplayLabel({ label: "Shelfmark", value: "x" })).toBe("Shelfmark");
  });
});

describe("metadataToIIIF — display pairs", () => {
  it("emits `none` language maps in entry order, vocab labels defaulted", () => {
    expect(metadataToIIIF([{ property: "dcterms:date", value: "1843" }, { label: "Shelfmark", value: "MS 408" }])).toEqual([
      { label: { none: ["Date"] }, value: { none: ["1843"] } },
      { label: { none: ["Shelfmark"] }, value: { none: ["MS 408"] } },
    ]);
  });
  it("merges same-display-label repeats into ONE pair with multiple values", () => {
    expect(metadataToIIIF([
      { property: "dcterms:creator", value: "Ada" },
      { property: "dcterms:date", value: "1843" },
      { property: "dcterms:creator", value: "Babbage" },
    ])).toEqual([
      { label: { none: ["Creator"] }, value: { none: ["Ada", "Babbage"] } },
      { label: { none: ["Date"] }, value: { none: ["1843"] } },
    ]);
  });
  it("does NOT merge a repeat whose per-entry label differs (different display labels)", () => {
    expect(metadataToIIIF(ENTRIES).map((p) => p.label.none![0])).toEqual(["Creator", "Author", "Date", "Shelfmark"]);
  });
});

describe("metadataProps / metadataFromIIIF — the lossless extension", () => {
  it("emits nothing for absent/empty entries (byte-stable output)", () => {
    expect(metadataProps(undefined)).toEqual({});
    expect(metadataProps({})).toEqual({});
    expect(metadataProps({ metadata: [] })).toEqual({});
  });
  it("emits display pairs AND the raw archieMetadata; reading back is identity", () => {
    const props = metadataProps({ metadata: ENTRIES });
    expect(props.archieMetadata).toEqual(ENTRIES);
    expect(props.metadata).toHaveLength(4);
    expect(metadataFromIIIF(props)).toEqual(ENTRIES);
  });
  it("read-back sanitizes (a hostile archieMetadata is filtered per-item, not thrown)", () => {
    expect(metadataFromIIIF({ archieMetadata: [{ property: "dc:creator", value: "legacy" }, { label: "Kept", value: "v" }] }))
      .toEqual([{ label: "Kept", value: "v" }]);
    expect(metadataFromIIIF({ archieMetadata: "garbage" })).toBeUndefined();
    expect(metadataFromIIIF(undefined)).toBeUndefined();
  });
  it("rides rightsProps/rightsFromIIIF (the one seam all levels project through)", () => {
    const projected = rightsProps({ metadata: ENTRIES });
    expect(projected.archieMetadata).toEqual(ENTRIES);
    expect(rightsFromIIIF(projected)).toEqual({ metadata: ENTRIES });
  });
});

describe("metadata carries at every level (Collection / Manifest / Canvas) and round-trips", () => {
  const library: Library = {
    id: asLibraryId("lib"),
    title: "Archie",
    metadata: [{ property: "dcterms:publisher", value: "Compost Press" }],
    exhibits: [{
      id: asExhibitId("ex-voynich"),
      slug: "voynich",
      title: "Voynich",
      metadata: [{ property: "dcterms:subject", value: "Cryptography" }, { property: "dcterms:subject", value: "Botany" }],
      objects: [{
        id: asObjectId("o1"),
        source: "https://img/o1.jpg",
        label: "Folio 1r",
        width: 10, height: 10,
        metadata: ENTRIES,
      }],
    }],
  };
  const exhibit: Exhibit = library.exhibits[0]!;

  it("toCollection / toManifest / toCanvas emit metadata + archieMetadata", () => {
    expect(toCollection(library).archieMetadata).toEqual(library.metadata);
    const m = toManifest(exhibit);
    expect(m.metadata).toEqual([{ label: { none: ["Subject"] }, value: { none: ["Cryptography", "Botany"] } }]);
    expect(m.archieMetadata).toEqual(exhibit.metadata);
    expect(m.items[0]!.archieMetadata).toEqual(ENTRIES);
  });

  it("objectsFromManifest recovers the object's entries identically", () => {
    expect(objectsFromManifest(toManifest(exhibit))[0]!.metadata).toEqual(ENTRIES);
  });

  it("toExhibitsJson passes the library entries through in the model shape", () => {
    expect(toExhibitsJson(library).library.metadata).toEqual(library.metadata);
  });

  it("publishLibrary → loadLibrary round-trips entries at all three levels", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, library, () => [], { baseUrl: "https://u.gh.io/lib/" });
    const { library: back } = await loadLibrary(fs);
    expect(back.metadata).toEqual(library.metadata);
    expect(back.exhibits[0]!.metadata).toEqual(exhibit.metadata);
    expect(back.exhibits[0]!.objects[0]!.metadata).toEqual(ENTRIES);
  });

  it("a metadata-free library publishes with no metadata/archieMetadata keys (byte-stable)", () => {
    const bare: Exhibit = { id: asExhibitId("e"), slug: "s", title: "T", objects: [{ id: asObjectId("o"), source: "s.jpg", label: "L" }] };
    const m = toManifest(bare);
    expect("metadata" in m).toBe(false);
    expect("archieMetadata" in m).toBe(false);
    expect("archieMetadata" in m.items[0]!).toBe(false);
  });
});

describe("Working ↔ Library round trip carries metadata (carry sentinels honored)", () => {
  const meta: WorkingLibraryMeta = {
    title: "Archie",
    metadata: [{ property: "dcterms:publisher", value: "Compost Press" }],
    exhibits: [{
      id: "ex1", slug: "voynich", title: "Voynich",
      metadata: [{ property: "dcterms:subject", value: "Cryptography" }],
      objects: [{ id: "o1", source: "https://img/o1.jpg", label: "Folio 1r", metadata: ENTRIES }],
    }],
  };
  it("workingToLibrary carries entries at all three levels", () => {
    const lib = workingToLibrary(meta);
    expect(lib.metadata).toEqual(meta.metadata);
    expect(lib.exhibits[0]!.metadata).toEqual(meta.exhibits[0]!.metadata);
    expect(lib.exhibits[0]!.objects[0]!.metadata).toEqual(ENTRIES);
  });
  it("libraryToWorking is the faithful inverse (import → republish is lossless)", () => {
    const round = libraryToWorking(workingToLibrary(meta));
    expect(round.metadata).toEqual(meta.metadata);
    expect(round.exhibits[0]!.metadata).toEqual(meta.exhibits[0]!.metadata);
    expect(round.exhibits[0]!.objects[0]!.metadata).toEqual(ENTRIES);
  });
});
