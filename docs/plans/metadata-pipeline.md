# Metadata pipeline (Dublin Core) — implementation plan (Archie-5a9b)

Decisions are fixed by the closed grill tickets (Archie-c6bf epic); research asset:
`docs/research/dublin-core-vocab.md`. This plan sequences the build only.

## Shape

`RightsFields` gains `metadata?: MetadataEntry[]` — `{ property?; label?; value }`,
dcterms:-only property names, array order = display order, repeats = repeated entries.
Because Library / Exhibit / AObject / Working*Meta / ExhibitsJson.library / PortableExhibit
all extend `RightsFields`, the field exists at every level the moment the model grows it;
the carry sentinels (render-core-data-integrity rule #3) then force every hand-mapper to
acknowledge it.

The projection/recovery seam stays where rights already live: `rightsProps` /
`rightsFromIIIF` (iiif/rights.ts) are spread at Collection, Manifest, and Canvas and at
every reader — so wiring metadata into that one pair covers all three publish levels and
all three round-trip readers with no new call sites.

## Phases

### 1. Model + vocab (render-core, pure data)
- `model/model.ts`: `MetadataEntry` type, `isMetadataEntry` validator +
  `sanitizeMetadataEntries` (read-boundary filter: skip-not-throw, per-item tolerant —
  contract #2), `RightsFields.metadata`, mixin doc-comment update.
- New `model/dcterms.ts`: the 55 dcterms properties (name/label/comment from the research
  inventory), `IMPORT_LABEL_ALIASES` (author→creator + obvious kin),
  `METADATA_EXCLUDED_PROPERTIES` (title, description, abstract, rights, license — the
  native-field collision set), `DEFAULT_METADATA_FIELDS` (library / exhibit / object sets),
  `matchDctermsProperty(label)` case-insensitive label+alias matcher, `dctermsLabel`.
- Barrel exports.

### 2. Carry sentinels + working mappers (render-core)
- `publish/working.ts`: `rightsOf` helper carries `metadata`; all four sentinels gain
  `metadata: "carry"`.
- `iiif/manifest.ts` `_manifestObjectRecover`: `metadata: "carry"` (recovered via
  `rightsFromIIIF`).

### 3. Publish projection + round-trip (render-core)
- New `iiif/metadata.ts` (beside rights.ts): `metadataToIIIF` (label = entry.label ??
  vocab default; values as `none` language maps; same-display-label repeats merged into
  ONE pair with multiple values), `metadataProps` (also emits raw entries as extension
  `archieMetadata`), `metadataFromIIIF` (reads `archieMetadata` back, sanitized).
- `iiif/presentation.ts`: `IIIFRightsProps.archieMetadata?: MetadataEntry[]`.
- `iiif/rights.ts`: `rightsProps` spreads `metadataProps`; `rightsFromIIIF` recovers via
  `metadataFromIIIF`. This lights up toCollection / toManifest / toCanvas and
  objectsFromManifest / readExhibitTree / loadLibrary(exhibit level) at once.
- `iiif/exhibits.ts` `toExhibitsJson` + `publish/site.ts` `loadLibrary`: library-level
  entries pass through exhibits.json exactly as rights/requiredStatement do (sanitized on
  read). No write-ordering change — marker stays LAST.

### 4. Import (studio)
- `iiif-import.ts`: `ManifestPlan` gains `summary` / `rights` / `requiredStatement` /
  `metadata`; `PlannedObject` gains `metadata`. Manifest-level rights (P3 `rights` / P2
  `license`), requiredStatement (P3; P2 `attribution` with default label), summary (P3
  `summary` / P2 `description`) → native fields. Manifest `metadata` → exhibit entries;
  per-canvas `metadata` → object entries. Pair mapping: case-insensitive label match
  against dcterms labels + aliases → `{ property, label: original-when-different, value }`;
  excluded or unmatched → verbatim `{ label, value }`. Language maps: first language's
  values, one entry per array element.
- `ingest-flows.ts` `createExhibitFromPlan`: patch the minted exhibit with the plan's
  summary/rights/requiredStatement/metadata (caller-supplied provenance summary wins).
  Object entries ride the existing `batch.add({ ...o })` spread. `addManifestToExhibit`
  appends objects only — exhibit-level plan fields deliberately NOT stamped onto an
  existing exhibit (commented).

### 5. Hazard audit (studio write-back sites)
- `App.svelte:1749 rightsOf`: dead code (single grep hit = its own definition;
  buildFullLibrary delegates to workingToLibrary) — delete it.
- `App.svelte` setObject/Exhibit/LibraryRights + inline `rights={...}` props,
  `LibraryHome.svelte:250 rightsOf` → DetailsEditor: write-backs are KEYED patches
  (`{ rights, requiredStatement }`) over spread-preserving reducers — metadata is never
  clobbered; comment the deliberate exclusion at the setter block. LibraryHome `rightsOf`
  carries `metadata` (harmless, keeps the projection honest).
- `bulk-rights.ts`: patch is keyed and never includes `metadata` — comment the invariant
  (bulk apply must never clobber entries) + a pinning test.
- `library-meta-reducers.ts`, `publish/merge.ts`: whole-object spreads — safe, no change.

### 6. Tests + gates
- render-core: dcterms vocab (count/exclusions/aliases/default sets), validator,
  iiif/metadata projection (merge repeats, label override, `none` maps, archieMetadata),
  manifest round-trip (publish → objectsFromManifest identical entries), site round-trip
  (publishLibrary → loadLibrary, all three levels), working round-trip carry.
- studio: iiif-import mapping (alias, excluded-label verbatim, unmatched verbatim,
  per-canvas, language-map repeats, P2), ingest exhibit stamping, bulk-rights no-metadata.
- Gates: `cd packages/render-core && pnpm exec vitest run`; `cd apps/studio && pnpm exec
  vitest run && pnpm typecheck`; `pnpm --filter @archie/studio run check` (touching
  .svelte); viewer `astro check` as a safety (core types widened).

Out of scope (separate tickets): editor UI, viewer panel UI, static-pages HTML rendering
of entries.
