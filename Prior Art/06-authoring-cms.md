# Axis 06 — Authoring-CMS (gallery + exhibit-making UI, item/metadata management, in-browser persistence)

## Focused question
How do prior-art repos build the AUTHORING side — managing items + metadata, editing annotations/manifests, persisting work in-browser (FSA/OPFS/download) without a server — and which editor-state patterns (normalized entity store, dirty detection, per-property editors) are lift-able?

## Sources surveyed
- `IIIF/iiif-manifest-editor` — THE reference (Vault entity store, per-property editors, dirty tracking, project persistence) — opened
- `field-studio` — Svelte editor; FSA/OPFS/IDB persistence, template + change-discovery services — opened
- `IIIF/immarkus` — folder-based (FSA) image + metadata management, schema system — opened
- `tropy` — Electron item/metadata + template system — opened (COUPLED, flagged)
- `IIIF/tiny-iiif` — Astro admin GUI for folder→IIIF — opened (thin)
- `canvases-annotations-sharing/Budibase` — low-code CMS — triaged (server-coupled, avoid)
- `canvases-annotations-sharing/FossFLOW` — diagram CMS — triaged (not opened deep; lib/app/backend split only)

## Findings by source

### IIIF/iiif-manifest-editor — Vault normalized store + per-property editor API
- **Normalized entity store via `@iiif/helpers/vault`** — `packages/editor-api/src/Editor.ts:1,7` — COUPLED(@iiif/vault) — every Editor holds one `vault`; resources referenced by `{type,id}` Reference, never copied. This is exactly our AnnotationPage/entity normalization target — but the store is the IIIF Vault, not generic.
- **Per-property editor objects** — `packages/editor-api/src/EditorInstance.ts:31-62` — COUPLED(@iiif/vault) — one `EditorInstance` composes `technical / descriptive / metadata / linking / structural / annotation` sub-editors; each is a typed facade over vault mutations. Maps to our AnnotationForm/Sidebar per-field editors.
- **Property-level mutation API** — `packages/editor-api/src/MetadataEditor.ts:44,57,73` — COUPLED — `add/update/remove(atIndex,label,value)` dispatch `entityActions.*Metadata` against vault. The clean shape (indexed add/update/remove of a repeatable property) is liftable as a *pattern*.
- **Dirty/observe detection** — `packages/editor-api/src/PropertyObserver.ts:24-47` — COUPLED(@iiif/vault) — `start()` subscribes to vault, diffs `lastEntity` ref + tracked props, fires `onChange` only when the entity reference actually changed (ref-equality short-circuit). Pattern is liftable; impl bound to vault.subscribe.
- **Required/recommended/notAllowed validation** — `packages/editor-api/src/EditorInstance.ts:104-140`; `BasePropertyEditor.ts:42-56` — PURE-ish — per-type field-requirement metadata + a validator loop producing `{isError,isWarning,problems[]}`. The validation-loop shape is PURE; the property tables are IIIF-specific.
- **Project persistence backend (interface + impl)** — `packages/projects/src/backend/LocalStorageBackend.ts:1-49` — COUPLED(localforage) — `ProjectBackend` interface (`createProject/getAllProjects/deleteProject`) with a project index key, 5 s `saveInterval`. The *interface seam* (pluggable backend) is the liftable idea; our FsaFilesystem/DownloadFilesystem are siblings of this.

### field-studio — Svelte editor; tiered in-browser persistence (closest sibling)
- **OPFS large-file store, marked PURE** — `src/shared/services/opfsStorage.ts:1,18-101` — PURE — `OPFSStorage` class: `isSupported()`, `initialize()`, `storeFile/getFile/deleteFile/hasFile/listFiles/getTotalSize` over `navigator.storage.getDirectory()`. Zero framework deps. Directly liftable as our OPFS persistence primitive.
- **Size-routed storage service (IDB ↔ OPFS)** — `src/shared/services/storage.ts:1-70` — COUPLED(idb,worker) — routes blobs >10 MB (`OPFS_SIZE_THRESHOLD`) to OPFS, else gzip-compressed JSON into IndexedDB via worker. The *routing rule* (size threshold → OPFS vs IDB) is a liftable design decision for our `.anvil/` assets.
- **Annotation template system, marked PURE** — `src/shared/services/annotationTemplateService.ts:1,16-156` — PURE — `AnnotationTemplate {id,name,motivation,tags,bodyFormat,builtin}`; built-in defaults + custom templates persisted in localStorage; `getAnnotationTemplates/applyTemplate/createCustomTemplate`. Directly maps to our metadata-template need (reusable motivation/tag presets in AnnotationForm).
- **Change-discovery (vault mutation → W3C Activity Stream), marked framework-agnostic** — `src/shared/services/changeDiscoveryService.ts:1-45,45-65,234` — PURE(of UI; uses IndexedDB) — `createLocalActivity()` turns a vault mutation into a `LocalActivity`; `exportActivityStream()` emits an `OrderedCollection`. Liftable as our audit/provenance + dirty-history feed; gives undo-history + federation export for free.
- **Reactive scoped store with undo/redo + debounced auto-save** — `src/features/board-design/model/boardVault.svelte.ts:1-55` — COUPLED(svelte $state) — `BoardVaultStore` is a per-view normalized store (`items/connections`) with injected `LabelResolver` to stay decoupled from the main IIIF Vault, undo/redo, and `onSave` debounce. This IS the Svelte-native answer to manifest-editor's Vault — closest template for our editor store. Decoupling-via-injected-resolver is the liftable trick.

### IIIF/immarkus — folder-based (FSA) image + metadata management with a schema system
- **FSA folder-handle AnnotationStore** — `src/store/Store.ts:1-55` — COUPLED(@annotorious,FSA) — store keyed on `FileSystemDirectoryHandle`; `getFolder/getFolderContents`, `bulkUpsertAnnotation`, `findAnnotation`, image vs metadata annotation split. Folder-as-project model == our Project = directory of plain files.
- **Single-flight debounced JSON writer, PURE** — `src/store/utils.ts:44-74` — PURE — `writeJSONFile(handle,data)` queues one `pendingWrite`, drains after the current write closes (`isWriting` latch). A tiny, dependency-free FSA write-coalescing primitive — directly liftable to FsaFilesystem to avoid concurrent-writable corruption.
- **FSA read/exists/rename helpers, PURE** — `src/store/utils.ts:3,20,88-119` — PURE — `readImageFile/readJSONFile/fileExistsInDirectory/renameFile` over directory handles. Liftable building blocks for FsaFilesystem.
- **Metadata schema system (declarative property definitions)** — `src/store/datamodel/DataModelStore.ts:1-55`; `src/model/MetadataSchema.ts:3-11`; `src/model/PropertyDefinition.ts:1-55` — PURE(types) / COUPLED(store) — `MetadataSchema {name,properties:PropertyDefinition[]}`; `PropertyDefinition` is a tagged union (`text|number|enum|uri|color|geocoordinate|measurement|range|external_authority`) with `required/multiple/inheritedFrom`. Separate folder-schemas vs image-schemas + entity-type inheritance tree. This is a complete, framework-agnostic answer to "metadata template/schema system" — lift the types + drive per-property editors from them.
- **Integrity/repair layer** — `src/store/integrity/` (`annotationIntegrity`, `iiifIntegrity`, `metadataIntegrity`) — inferred: `IIIF/immarkus/src/store/integrity/` — PURE-leaning — load-time repair of malformed annotations/manifest IDs. Relevant given our WADM round-trip corruption risk (Ellipse/Path); study as a pre-parse-repair pattern.

### tropy — Electron research-photo organize/describe (COUPLED, study-only)
- **Template/ontology system** — `src/ontology/template.js`; `src/components/template/{editor,field,field-list,toolbar}.js` — COUPLED(Electron,redux) — full template editor: ordered field lists, per-field config, RDF/ontology-backed. Richest metadata-template UI surveyed, but bound to Electron (sqlite, ipc) and redux. Study the field-list ordering + per-field-type editor UX; do not lift code.
- **Redux item/metadata reducers** — `src/reducers/{items,metadata,...}.js` — COUPLED(redux) — normalized-by-id item store. Conceptual confirmation of normalized entity store, but redux-toolkit + Electron persistence; avoid.

### IIIF/tiny-iiif — Astro admin GUI for folder→IIIF (thin)
- **Folder/manifest metadata hooks** — `tiny/src/hooks/{use-directory,use-manifest-metadata,use-images,use-image-sorting}.ts` — COUPLED(React,nginx/cantaloupe backend) — admin UI reads a server-rendered folder. Server-backed (cantaloupe + nginx), so the persistence model does NOT match our serverless target. Skim only.

### canvases-annotations-sharing/Budibase, FossFLOW — low-code/diagram CMS (triage, avoid)
- **Budibase** — `canvases-annotations-sharing/Budibase/docker-compose.yaml` + two orient `.md`s only — COUPLED(server,docker) — server-hosted low-code app builder; opposite of serverless. Avoid; orient docs already capture the takeaway.
- **FossFLOW** — `packages/{fossflow-lib,fossflow-app,fossflow-backend}` — COUPLED(React) — diagram editor with optional backend. Lib/app/backend split is a clean packaging idea; nothing else axis-relevant. Not deep-surveyed.

### papadam — BEST server-backed multi-user authoring CMS (vs local-first donors)
- **Exhibit builder data model** — `papadam/api/papadapi/exhibit/models.py:15-86` — COUPLED(Django) — `Exhibit` + ordered `ExhibitBlock` (`block_type: media|annotation`, `order`, `is_public`). The curated-ordered-block authoring shape (immarkus/field-studio are local-first single-user; papadam is the server-multi-user shape).
- **Threaded-reply authoring + archive picker** — `papadam/api/papadapi/media_relation/views.py:27-115`; `papadam/ui/src/routes/exhibits/[uuid]/edit/+page.svelte` — COUPLED(Django/Svelte) — reply-to-annotation creation, `media_ref` cross-media links, server-side paginated picker (mediaType + free-text search). NOT in-browser FSA/OPFS — opposite persistence model from anvil; study the *workflow*, not the storage.

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Extraction effort | Maps to our need |
|---|---|---|---|---|---|
| OPFS file store (CRUD + size/list) | `field-studio/src/shared/services/opfsStorage.ts:18-101` | PURE | `navigator.storage` only | Low (copy class) | In-browser asset persistence for `.anvil/` (OPFS branch) |
| Annotation template service (presets + localStorage) | `field-studio/src/shared/services/annotationTemplateService.ts:16-156` | PURE | localStorage | Low | Reusable motivation/tag/body presets in AnnotationForm |
| Single-flight debounced FSA JSON writer | `IIIF/immarkus/src/store/utils.ts:44-74` | PURE | FileSystemFileHandle | Trivial | FsaFilesystem in-place save without write races |
| FSA read/exists/rename helpers | `IIIF/immarkus/src/store/utils.ts:3,20,88-119` | PURE | FSA handles | Trivial | FsaFilesystem primitives |
| Metadata schema + PropertyDefinition union | `IIIF/immarkus/src/model/{MetadataSchema.ts:3,PropertyDefinition.ts:1-55}` | PURE | none (types) | Low | Declarative metadata template/schema driving per-property editors |
| Change-discovery: mutation→Activity Stream | `field-studio/src/shared/services/changeDiscoveryService.ts:45-65,234` | PURE(uses IDB) | IndexedDB | Medium | Dirty/undo history + provenance + federation export |
| Validator loop → `{isError,isWarning,problems[]}` | `IIIF/iiif-manifest-editor/packages/editor-api/src/EditorInstance.ts:104-140` | PURE (shape) | none | Low | Per-resource validation surface in the editor |
| Size-routed persistence rule (>10 MB → OPFS) | `field-studio/src/shared/services/storage.ts:25,60-70` | PURE (rule) | idb (impl) | Low (rule only) | Decide asset routing for FsaFilesystem/Download |
| Decoupled scoped store via injected LabelResolver | `field-studio/src/features/board-design/model/boardVault.svelte.ts:46-55` | COUPLED(svelte) but pattern PURE | $state | Medium | Keep editor store decoupled from IIIF Vault |
| Pluggable persistence backend interface | `IIIF/iiif-manifest-editor/packages/projects/src/backend/LocalStorageBackend.ts:1-13` | PURE (interface) | localforage (impl) | Low | FsaFilesystem/DownloadFilesystem as swappable backends |

## Gaps — what NO surveyed repo solves
- **Dual-mode serverless filesystem abstraction (FSA in-place save *for Chromium* AND `.zip` download *for Firefox/Safari*) behind one interface.** field-studio uses IDB+OPFS (not user-visible files); immarkus uses FSA directory handles (Chromium-only, no Firefox fallback); manifest-editor uses localforage. **No surveyed repo presents a single `Filesystem` interface with FsaFilesystem and DownloadFilesystem implementations** — exactly our planned seam. We build this; immarkus utils + field-studio OPFSStorage are the FSA-side ingredients, but the Download/zip branch and the unifying interface are unsolved.
- **Gallery / `exhibits.json` root index** is not addressed by any authoring repo (manifest-editor stops at single-project; immarkus stops at single-folder). That's a publish-axis concern, flagged here as absent from authoring prior art.

## Verdict for our build (lift / study / avoid, and why)
- **LIFT:** `OPFSStorage` (field-studio) and immarkus `utils.ts` FSA helpers (esp. the single-flight `writeJSONFile`) — both PURE, near-zero deps, directly feed FsaFilesystem/OPFS. `annotationTemplateService` (PURE) for our metadata-template system. immarkus `MetadataSchema`/`PropertyDefinition` types as the declarative schema that drives per-property editors.
- **STUDY (don't copy):** manifest-editor's `EditorInstance` per-property-editor + `PropertyObserver` dirty-detection architecture — the *shape* (one entity store, typed per-property facades, ref-equality dirty short-circuit, validator loop) is the blueprint for our Sidebar/AnnotationForm, but it is COUPLED to `@iiif/helpers/vault`; reimplement against our WADM store. field-studio `boardVault.svelte.ts` is the closest Svelte-native realization (undo/redo + injected resolver + debounced save) — use as the structural template. tropy's template field-list UX for the editor surface only.
- **AVOID:** tropy (Electron/redux/sqlite — COUPLED per framing), tiny-iiif (cantaloupe/nginx server-backed, not serverless), Budibase (server-hosted, docker). FossFLOW not axis-relevant beyond its package split.
