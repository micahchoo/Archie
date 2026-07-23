---
scope: apps/studio/src/**
tags: [data-integrity, rights, metadata, coupling]
priority: high
source: Archie-5a9b audit + Archie-893f scoped rule
---

# RightsFields write-backs MUST be keyed partial patches

The AObject/AExhibit/ALibrary `rights` field carries three independent properties:
`rights` (license URI), `requiredStatement` (credit label + value), and
`metadata` (Dublin Core entries, Archie-c6bf). A write-back that reconstructs
a whole `RightsFields` object in a UI handler **clobbers** properties other
write-backs set. The `Archie-5a9b` audit proved this class is real — every
clobber site was fixed to keyed patches. This rule prevents regression.

## Rule

### 1. RightsEditor.onchange spreads, never reconstructs

```ts
// CORRECT — spread + set one field
function setCredit(text: string) {
  const next: RightsFields = { ...value };
  if (text.trim() === "") delete next.requiredStatement;
  else next.requiredStatement = { label: creditLabel, value: text };
  onchange(next);
}
```

NEVER: `onchange({ rights: "http://...", requiredStatement: { ... } })` —
this drops `metadata`.

### 2. Host-level onrights callbacks patch keyed properties ONLY

```ts
// CORRECT — keyed patch of rights + requiredStatement only
function setObjectRights(next: RightsFields) {
  lib.patchObject(slug, objId, {
    rights: next.rights,
    requiredStatement: next.requiredStatement,
  });
}
```

NEVER: `lib.patchObject(slug, objId, next)` — a whole-RightsFields spread
would carry `metadata` into a rights patch and vice versa.

### 3. Metadata has its OWN write-back callback

Do NOT fold metadata into `onrights`. Every surface that carries metadata
(DetailsEditor, ExhibitOverview, LibraryHome) has a SEPARATE `onmetadata`
callback — the contract at DetailsEditor.svelte:48-51, ExhibitOverview.svelte:122-124,
and LibraryHome.svelte:141-143.

### 4. Bulk rights edits are explicitly keyed

`bulk-rights.ts` `buildBulkRightsPatch` returns a `RightsFieldsPatch` — only
the gated (checked) fields appear. An unchecked field is absent from the patch
(never blanked). The test at `bulk-rights.test.ts:21` asserts this: "an
unchecked field is absent from the patch."

## Binding sites

| File | Site | Contract |
|---|---|---|
| `RightsEditor.svelte` | `setCredit`, `setLicense` | `{ ...value }` spread mutates one field |
| `App.svelte` | `setObjectRights`, `setExhibitRights`, `setLibraryRights` | Keyed `{ rights, requiredStatement }` patch |
| `DetailsEditor.svelte` | `onrights` callback | Comment at :48-51 forbids whole-RightsFields replace |
| `ExhibitOverview.svelte` | `onrights` callback | Comment at :123 |
| `LibraryHome.svelte` | `onrights` callback | Comment at :141-142 |
| `LibraryHome.svelte` | `rightsOf` projection | Comment at :261-264: projection drops nothing |
| `bulk-rights.ts` | `buildBulkRightsPatch` | Only gated fields in patch |
| `bulk-rights.test.ts` | `buildBulkRightsPatch includes ONLY gated fields` | Test enforces the contract |

## Violation detection

A new UI handler that constructs `{ rights: ..., requiredStatement: ..., metadata: ... }`
as a whole object and passes it to a rights setter is a violation. The
sentinel: any `RightsFields` literal with 3+ properties in a Studio component
that isn't `rightsOf` or `RightsEditor`'s spread-from-value pattern.
