# Axis 10 — State-Mutation Patterns

## Focused question
What concrete state-mutation architectures do prior-art repos ACTUALLY use (not claim) for mutable annotation/canvas state — undo/redo, transactions/batching, optimistic update, conflict resolution, local-first persistence — and which are lift-able as PURE logic?

## Sources surveyed
- `canvases-annotations-sharing/Annotation-sync-mutation-research/` — 4 distillation docs (12-patterns, tech-agnostic, mapping-teams, dev-interviews) — y (all 4 read fully)
- `IIIF/liiive` (liiive-server + liiive-client) — its REAL sync mechanism — y (server + 3 client hooks opened)
- `annomea` — own Svelte annotation app, mutation+undo design — y (Editor.svelte opened)
- `anvil` — own PLANNED product, undo+persist design — y (undo.svelte.ts, annotations.ts opened)
- `canvases-annotations-sharing/excalidraw` — triage — y (store.ts, history.ts opened)
- `.../FossFLOW` — triage — y (useHistory.ts, modelStore.tsx opened)
- `.../Graphite` — triage — y (document_message_handler.rs opened)
- `.../Immich` — triage — y (asset-editor.store.ts opened)
- `papadam` — Yjs CRDT annotation sync (per-media YDoc, offline-first, dual-persistence bridge) — y (coverage-sweep add; crdt/README + ARCHITECTURE.md opened)

## Findings by source

### liiive — real-time collaborative IIIF annotation (the ACTUAL implementation, not a claim)
**HEADLINE — contradicts the research docs.** The 4 distillation docs repeatedly assert "every major collaborative tool rejects CRDTs / uses server-authoritative LWW." liiive — the one IIIF-domain collaborative repo here — **uses a true Yjs CRDT**, via Hocuspocus. Treat the "reject CRDTs" claim as map-team folklore, not a universal.

- **CRDT backend = Yjs + Hocuspocus** — `IIIF/liiive/liiive-server/src/index.ts:1-2,13-18` — PURE-ish(Yjs) — context: the *entire* server is 58 lines. A Hocuspocus `Server` (debounce 5s / maxDebounce 30s) is the whole sync engine; no custom merge/LWW code.
- **Persistence = binary Y.Doc to object storage** — `liiive-server/src/index.ts:20-55` — COUPLED(Supabase) — context: `onLoadDocument` downloads a blob → `Y.applyUpdate`; `onStoreDocument` `Y.encodeStateAsUpdate` → upload. The mutation log lives as one binary blob per document name. **Maps to us:** if we ever go collaborative, this is the minimal serverless-ish shape; but the binary Y.Doc is NOT a WADM `AnnotationPage` — round-trip to our native format is a separate step (see gap).
- **Document shape = nested Y collections, per-property granularity** — `liiive-client/.../use-annotation-store.ts:10-12,63-67` — PURE(Yjs) — context: `Y.Doc → Y.Map('annotations') → Y.Map(canvasId) → Y.Map(annotationId) → Y.Array[target, ...bodies]`. Each annotation is a `Y.Array` whose item 0 is the target/selector and items 1..n are bodies. This is exactly the "fine-grained property LWW" the docs praise — concurrent edits to *different bodies* of the same annotation merge without conflict.
- **Bidirectional Annotorious↔CRDT bridge (THE reusable seam)** — `liiive-client/.../annotation-store-adapter.tsx:74-122` — PURE-pattern (logic), COUPLED(React+Annotorious in this file) — context: `annotoriousStore.observe(fn, {origin: Origin.LOCAL})` pushes local creates/updates/deletes into Yjs; `yjsStore.observeCanvas` pushes REMOTE Yjs changes back via `Origin.REMOTE`. The `Origin.LOCAL`/`Origin.REMOTE` tag is what prevents an infinite echo loop. **Maps to us:** this exact LOCAL/REMOTE origin-tagging is the canonical "don't re-emit your own mutation" pattern — lift the *logic* even for single-user (e.g. programmatic vs user-drawn edits).
- **Granular update diffing** — `use-annotation-store.ts:124-173` — PURE — context: `updateAnnotation` consumes Annotorious's `Update` delta (`targetUpdated`, `bodiesCreated/Updated/Deleted`) and patches only the changed Y.Array slots, not a wholesale replace. This is per-property mutation done by hand.
- **Date (de)serialization across the CRDT boundary** — `use-annotation-store.ts:7` + `utils/serialize-dates.ts` (`reviveDates`/`serializeDates`) — PURE — context: "YJS cannot handle Date objects" (comment at adapter:80). Tiny standalone util; directly reusable since WADM `created`/`modified` are dates.
- **Presence lives in a parallel channel (NOT the document)** — `liiive-client/.../use-awareness.ts:75-82,132-141` — COUPLED(Hocuspocus awareness) — context: cursor (image coords), selection, isTyping, color broadcast via `provider.setAwarenessField`, de-duped per user, never written to the Y.Doc. This is the docs' "presence vs document state" boundary, implemented. Cursor debounced 5ms; dedup by `timestamp`.

### annomea — own Svelte annotation app (read-side lessons known; here = mutation)
- **Mutation = immutable array replace by index, no store abstraction** — `annomea/src/editor/Editor.svelte:95-97,99-103` — COUPLED(Svelte runes) — context: `updateAnnotation` = `annotations.map((a,i)=> i===index? updated : a)`; `deleteAnnotation` = `filter`. Driven directly by Annotorious `a.on('updateAnnotation', …)` (Editor.svelte:254). **No undo stack, no command/transaction, no batching.** Confirms the framing's "drawer/read-side never ported" thinning — write-side is deliberately minimal.

### anvil — the PLANNED product (its real current state-mutation design)
- **Undo = field-level text value stack ONLY** — `anvil/app/src/lib/undo.svelte.ts:20-53` — PURE — context: `createUndoStack(max=50)` holds `{field,value}` string entries; `pop(field)`/`popAny()`. Comment (line 1-2): "Extracted from App.svelte's inline per-annotation undo … annotation, narrative, config editors." **This is text-field undo, NOT geometry/document undo** — drawing a region or moving a shape is currently un-undoable. Genuinely PURE (no framework imports beyond `$state`), lift-able as-is.
- **Persistence = full `AnnotationPage` snapshot to disk** — `anvil/app/src/lib/storage/annotations.ts:67-90` — PURE-logic, COUPLED(filesystem at edges) — context: `saveAnnotations` wraps annotations in `{type:'AnnotationPage'}` and writes; `validateAnnotationPage` (line 38) + `isDegenerateSelector` (line 19) are pure validators. Mutation model = whole-page serialize (snapshot), not deltas.
- State store = `nanostores` (atoms/maps) — `anvil/app/node_modules/nanostores` present; signal-style reactive store (the docs' "signals" layer), but no transaction/rollback wrapper exists.

### excalidraw — clone triage → REAL mechanism = command/delta inverse-entry undo
- **Store + Delta with CaptureUpdateAction enum** — `excalidraw/packages/excalidraw/store.ts:40-73` — PURE-algorithm, COUPLED(React app) — context: `IMMEDIATELY | EVENTUALLY | NEVER` gate whether a mutation is captured into history (matches docs §9). `NEVER` = remote/init updates excluded from undo.
- **History = inverse-entry stacks** — `excalidraw/packages/excalidraw/history.ts:21-22,40-48` — PURE-algorithm — context: `undoStack.push(entry.inverse())`; redo cleared on new record. Delta-based command pattern (not snapshots).

### FossFLOW — clone triage → REAL mechanism = snapshot undo in zustand
- **`past/present` snapshot history** — `FossFLOW/packages/fossflow-lib/src/stores/modelStore.tsx:7-8,57-60` + `hooks/useHistory.ts:66-95` — COUPLED(zustand/React) — context: each mutation pushes the *whole* `Model` onto `past[]` (capped by `maxHistorySize`); undo pops. iD-editor immutable-snapshot pattern. `useHistory` undoes model then scene.

### Graphite — clone triage → REAL mechanism = full-document snapshot stacks
- **`VecDeque<NodeNetworkInterface>` undo/redo** — `Graphite/editor/src/messages/portfolio/document/document_message_handler.rs:124-129,1097-1116` — COUPLED(Rust/internal graph) — context: pushes a clone of the entire document network per history step (cap `MAX_UNDO_HISTORY_LEN`), `pop_front` on overflow. Pure snapshot pattern; not lift-able (Rust + bespoke node-graph type) but confirms snapshot-undo is viable at scale.

### Immich — clone triage → NOT a collaborative-annotation precedent
- **Edit state = plain Svelte `writable` settings, no undo** — `canvases-annotations-sharing/Immich/immich/web/src/lib/stores/asset-editor.store.ts:5-19` — COUPLED(Svelte) — context: `cropSettings`, `rotateDegrees`, `cropSettingsChanged` writables for an image crop/rotate editor. No annotation mutation, no history. Not relevant beyond ruling it out.

### papadam — Yjs CRDT per-media-item document with field-level merge semantics (the most complete CRDT design present)
- **One Y.js doc per media item, keyed `media:{uuid}`; field-level CRDT types** — `papadam/ARCHITECTURE.md:195-223` — COUPLED(Yjs) — context: `annotations: Y.Map<uuid, Y.Map>` where `annotation_text` is `Y.Text` (char-level merge), `media_target` is plain-string LWW, `tags` is `Y.Array` (append-only, dedup-on-read), metadata `tags` use OR-Set semantics. A real per-field conflict-resolution policy, not a blanket last-write-wins — directly informs how a WADM `TextualBody` vs `FragmentSelector` vs body-array would merge under concurrent edits.
- **Dual-representation persistence bridge (normalized rows + binary Y.js state, one transaction)** — `papadam/ARCHITECTURE.md:225-232` — COUPLED(Django) — context: stores both the normalized `Annotation` rows (for search/filter/export/API) AND `YDocState.binary_state` bytes (for sync/offline recovery), written together; if the normalized write fails the binary is not written. The pattern for keeping a queryable export-shape in sync with the CRDT source-of-truth — our `AnnotationPage`-on-disk would face the same dual-shape problem.
- **Offline-first flow: optimistic local apply → reconnect → merge → no-data-loss** — `papadam/ARCHITECTURE.md:234-244` + `papadam/crdt/README.md:8-15` — COUPLED(y-websocket/IndexedDB) — context: writes apply to local YDoc + IndexedDB immediately (optimistic UI), y-websocket sends the pending update vector on reconnect, server merges and fans out, conflicts resolved by CRDT semantics. Server is a JWT-authed group-membership-gated relay that debounces persistence 2 s after last write (`crdt/README.md`). The serverless-vs-relay tension: this needs a running WebSocket server — STUDY the merge model, AVOID the server dependency for our PWA target.
- **Provenance: hard fork of PLASMA/papad (external), NOT one of `_FRAMING.md`'s five target projects** — `papadam/README.md:6` — context: legitimately external prior art, not own survey-subject; its CRDT layer is the single most complete collaborative-annotation precedent in the tree alongside liiive.

### papadam — BEST CRDT donor: production Y.js with a server persistence bridge
- **Per-media `Y.Doc` schema** — `papadam/ARCHITECTURE.md:193-223` — design — `annotations: Y.Map<uuid,Y.Map>`; `Y.Text` char-level merge on body, **LWW** on `media_target`, **OR-Set** tags, awareness = playback cursor (ephemeral, never persisted). Concrete schema to compare against the distilled tldraw/Figma/Linear research.
- **Persistence bridge (CRDT blob ↔ Django)** — `papadam/crdt/src/index.ts:105-165` — PURE(adapter logic) / COUPLED(y-websocket) — `setPersistence` `bindState` GETs binary state, `writeState` **debounced 2s** PUTs `Y.encodeStateAsUpdate` as `application/octet-stream`. Richer than liiive's Yjs: adds binary persistence + server-authoritative split.
- **Server-authoritative carve-out** — `papadam/api/papadapi/crdt/views.py:73`; ARCHITECTURE.md "What is NOT CRDT" — COUPLED(Django) — membership, moderation flags (`is_instance_admin_withheld`), upload kept OUT of CRDT. The exact "CRDT for document, server for authority" split our research recommends.

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Extraction effort | Maps to our need |
|---|---|---|---|---|---|
| Field-level undo stack | `anvil/app/src/lib/undo.svelte.ts:20-53` | PURE | Svelte `$state` only | trivial (already ours) | Text-field undo for AnnotationForm/Narrative; extend to geometry |
| Origin LOCAL/REMOTE echo-suppression bridge | `liiive .../annotation-store-adapter.tsx:81-111` | PURE (logic) | Annotorious store event shape | low — copy logic, drop Yjs | Don't re-emit own mutations (single- or multi-user) |
| Per-property `Update`-diff patching | `liiive .../use-annotation-store.ts:124-173` | PURE | Annotorious `Update` type | low | Patch only changed target/body, not whole annotation → cheap saves + future merge |
| Date (de)serialize across store boundary | `liiive .../utils/serialize-dates.ts` (`reviveDates`/`serializeDates`) | PURE | none | trivial | WADM `created`/`modified` survive JSON/CRDT/IndexedDB round-trip |
| Nested per-canvas/per-annotation/per-body collection shape | `liiive .../use-annotation-store.ts:10-12,63-67` | PURE (pattern) | Yjs (or any nested map) | medium | Mirrors our per-image `AnnotationPage`; fine-grained merge granularity if collaboration is added |
| Presence-in-parallel-channel split | `liiive .../use-awareness.ts:75-141` | PURE (pattern) | Hocuspocus awareness API | n/a unless collab | Keep cursor/selection OUT of the document — even our local selection state |
| CaptureUpdateAction history gate (IMMEDIATELY/EVENTUALLY/NEVER) | `excalidraw store.ts:40-73` | PURE (algorithm) | none | medium | Exclude remote/programmatic edits from undo; coalesce drag |
| Inverse-entry command undo | `excalidraw history.ts:40-48` | PURE (algorithm) | a `Delta.inverse()` | medium-high | Geometry/document undo anvil currently LACKS |

## Gaps — what NO surveyed repo solves
1. **No repo round-trips a CRDT/delta store ↔ WADM `AnnotationPage`.** liiive stores a binary Y.Doc blob, NOT a WADM page; on the wire its bodies are even crosswalked to TipTap JSON (`annotation-store-adapter.tsx:38-52`), diverging from WADM `TextualBody`. annomea/anvil store WADM but have no delta/CRDT layer. The bridge "mutable delta store → serialize-as-AnnotationPage on save" is unsolved here.
2. **No repo has geometry/document-level undo over WADM annotations in our stack.** anvil undo is text-field-only; excalidraw/Graphite/FossFLOW have document undo but over their *own* element models, not WADM `FragmentSelector`/`SvgSelector`. The Ellipse/Path SVG-corruption hazard (framing) means a naive inverse-entry undo could re-serialize a corrupted selector — undo must operate on validated WADM, untested anywhere.
3. **No serverless local-first sync engine for WADM.** The docs survey Electric/PowerSync/Triplit/cr-sqlite/Linear, but no surveyed *repo* ships one for annotations; liiive needs a running Hocuspocus+Supabase server (not GH-Pages-publishable). Our zip/OAuth-push model has zero precedent here.

## Verdict for our build (lift / study / avoid, and why)
- **LIFT (now, single-user):** `anvil/undo.svelte.ts` field stack (already ours); liiive's **Origin LOCAL/REMOTE echo-suppression** + **per-property `Update` diff** + **serialize-dates** util — all PURE, framework-light, useful even without collaboration (programmatic-vs-user edits, cheap incremental saves).
- **STUDY (v2+ if collaboration):** liiive's full Yjs+Hocuspocus shape is the *only* IIIF-domain working precedent — but it is **server-required, not serverless**, and stores binary Y.Doc, not WADM. Its real lesson is the **nested-collection granularity** + **presence-in-parallel-channel** boundary, not the transport. Excalidraw's **CaptureUpdateAction + inverse-entry** is the model to copy if we build real geometry undo.
- **AVOID / DON'T BELIEVE:** the distillation docs' blanket "production rejects CRDTs" — liiive falsifies it in our exact domain. Also avoid assuming a CRDT/delta store is WADM-native; budget an explicit serialize-to-`AnnotationPage` step. Immich is not a precedent (crop-tool writables, no annotation mutation).
