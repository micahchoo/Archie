# DARKDATA — dark-data census (ISSUES.md Direction 2)

Direction loop: inventory every persisted/computed value in the annotation spine, classify
surfaced/internal/dark, bring clusters to the user for a verdict (pursue/park/reject), log
the reason, and — for a pursue — commission a spec interview or prototype brief. No building
happens in this ledger.

Inventory taken 2026-07-05. Scope note: the spine's record shape (`AnnotationRecord`) lives in
`packages/render-core/src/wadm/types.ts:210-246`, not `model.ts` (that file holds the unrelated
Exhibit/Object authoring model — checked, no spine fields there; its own latent fields
— `Exhibit.mode`, deprecated `layout`, reserved `ReadingFamily` — are v1.1-reserved template
fields, not provenance data, and are out of this census's scope).

| value | written at | surfaced at | class | intent | cluster |
|---|---|---|---|---|---|
| `modifiedAt` (→ WADM `modified`) | `spine/log.ts:90,144,175` (every append/edit/delete); `merge.ts:210` | Ships in **manifest.json** (embedded heads page, `serialize.ts:88`, unconditional) and every `annotations/history/*.json`; read back only by `deserialize.ts:78` for round-trip. No Studio/Viewer surface renders it. | **surfaced-to-IIIF-but-dark-in-app** | designed-latent — ADR-0003: "wall-clock `modifiedAt` is only an in-card tiebreaker" (a merge-UI use, excluded here); its unconditional public emission is a byproduct of that design | timestamp values |
| `lastEditor` (ClientId) | `spine/log.ts:91,145,176`; `session.ts:98,116,131` | Per-note attribution: nowhere outside the excluded merge UI (`MergeReview.svelte:51`). **Aggregate** form (per-editor counts) IS shown live: `collab.ts:19` → `App.svelte:1279-1284`'s dismissible banner on zip-open. | **surfaced (aggregate) / dark (per-note)** | designed-latent — `collab.ts` calls the banner "live co-editing's entire serverless approximation," a deliberate secondary consumer of the same field | identity values |
| `rev` (RevId, DAG node id) | `spine/log.ts:87,141,172`; `merge.ts:206` | Used only as a Svelte list key (`App.svelte:1625`) and in merge classification (excluded). Never rendered as a value. | internal | designed-latent — ADR-0003: "git's model exactly: commit hash = rev" | provenance/history |
| `parent` (RevId \| null) | `spine/log.ts:89,143` | Read by DAG walks + `deserialize.ts:60` only. No UI reads it. | internal (but the lineage it encodes is dark — next row) | designed-latent — ADR-0003: "the version-parent DAG" is the core mechanism | provenance/history |
| **Full version-parent lineage** (every rev's chain, `parent`+`mergeParents`) | Persisted whole in every `annotations/history/{logicalId}.json` (`site.ts:415-418`) | Nothing dereferences `archie:hasHistory`/`prov:wasRevisionOf` anywhere in `apps/viewer` or `packages/archie-viewer` (zero grep hits) — no version-history UI exists in the codebase | **dark** | designed-latent — ADR-0003 names history pages "citation-dereference targets" for an external **PROV-aware consumer** — a scholar-facing history view was architected for, never built in Archie itself | provenance/history |
| `mergeParents` (RevId[]) | `merge.ts:209` (`resolveConflict`); `serialize.ts:112` (`archie:mergeParents`); read `deserialize.ts:61-62` | Zero display consumers anywhere | **dark** | designed-latent — ADR-0003 §Q-7: "additional parents of a merge-resolution node — the other branch heads it reconciles," never exposed as "this note merged branches X and Y" | provenance/history |
| `version` (citation ordinal) | `spine/log.ts:88,142,173`; `merge.ts:207` | Embedded only in history pages (`archie:version`); confirmed absent from the bare manifest/heads embed (`manifest.test.ts:157`). No "v3"-style label shown per note. | **dark** | designed-latent — ADR-0003: "retained as the citation projection," built for external `{logicalId}/v{n}` citation IRIs, never surfaced in-app | provenance/history |
| `deleted` (tombstone flag) | `spine/log.ts:177` (`appendDelete`) | Filtered everywhere it's read (`heads.ts:25`, four `App.svelte` sites) to *hide* tombstoned records — its only function is invisibility. Serialized to history (`archie:deleted`) but never shown as "deleted on [date] by [editor]." | internal | designed-latent — ADR-0003: "a delete is a tombstone version… not a removal," for provenance preservation, with no audit/show-deleted view consuming that fact | provenance/history |

### Cluster summaries

**Provenance/history values** (`rev`, `parent`, `mergeParents`, `version`, `deleted`, and the
lineage they jointly encode) — the README's "core innovation," comprehensively dark. Written
faithfully on every mutation, serialized whole into every published tree's `annotations/history/*.json`,
read by nothing but Archie's own reload/merge machinery. ADR-0003 names this outcome
deliberately (citation-dereference targets, a PROV-aware-consumer tier) — designed-latent, built
to support a future history/citation view that was never built.

**Timestamp values** (`modifiedAt`) — the one value that reaches the *public* IIIF `manifest.json`
directly (not just an internal sidecar) via the standard WADM `modified` property, on every note,
yet no in-app UI displays "last edited." The clearest surfaced-to-IIIF-but-dark-in-app case: a
third-party WADM/IIIF tool could show it; Archie's own viewer cannot, because nothing reads it
back for display.

**Identity values** (`lastEditor`) — partially surfaced, correcting the direction's original
framing (which assumed the only display site was the unmounted `MergeReview.svelte:51`): a second,
currently-live consumer exists — `collab.ts`'s post-open banner, showing aggregate per-editor
counts library-wide. Per-note attribution ("who wrote *this* note") stays dark outside the
excluded merge UI.

### Verdicts

| cluster | verdict | reason | commissioned as |
|---|---|---|---|
| Provenance/history values (`rev`/`parent`/`mergeParents`/`version`/`deleted` and the lineage) | **pursue** | User's direct instruction 2026-07-05. This is the single most on-brand dark-data finding possible: the README's own "core innovation" has no view. Every field needed for a history panel is already computed and shipped in every published archive — this is a display-layer build on top of data that already exists, not new modeling. | Spec interview. **Prompt:** "Read `docs/adr/0003-annotation-spine.md` in full, plus `packages/render-core/src/spine/serialize.ts`'s `toHistory` function and its output shape (`archie:hasHistory`, `archie:version`, `archie:mergeParents`, `prov:wasRevisionOf`). Write a spec interview for a note 'History' panel in apps/studio and/or a read-only history view in the Viewer/archie-viewer: what triggers it (a button on a note?), what it shows per version (author, timestamp, a diff of the content, the merge-parent branches if any), whether it needs to render deleted (tombstoned) versions, and whether the Viewer's copy is read-only while Studio's could support restore. Interview the user on scope before designing — ADR-0003 scoped the DATA for this but explicitly left the VIEW undesigned." |
| Timestamp values (`modifiedAt` surfaced-to-IIIF-but-dark-in-app) | **pursue** | Same instruction. Smaller and cheaper than the full history panel — the value already ships to every manifest; this is "read one field back" not "design a data flow." Could be delivered standalone or folded into the History panel above as its simplest slice. | Prototype brief. **Prompt:** "`modifiedAt` already ships unconditionally in every published note's `manifest.json` heads-page embed (WADM `modified` property, see `packages/render-core/src/spine/serialize.ts:88`) but no Studio or Viewer surface displays it. Prototype the smallest possible surface — e.g. a relative-time label ('edited 3 days ago') on a note card or in the note detail popover — and confirm it round-trips correctly through a real published exhibit before wiring it in generally." |
| Identity values (per-note `lastEditor`) | **pursue** | Same instruction. The aggregate form already exists and works (`collab.ts`) — pursuing here means extending an already-shipped, already-validated UI pattern to the per-note case, the lowest-risk of the three clusters. | Prototype brief. **Prompt:** "`collab.ts`'s `collabBreakdown`/`collabSummaryText` already surfaces aggregate per-editor counts in a dismissible banner (`App.svelte:1279-1284`) — a validated UI pattern for showing `lastEditor` data. Prototype the per-note extension: a small attribution label ('last edited by Bob') on an individual note card or detail view, sourced from the same `lastEditor` field already serialized per-record. Check whether this should be folded into the History-panel spec interview above (per-note attribution is one row of a history view) or shipped standalone first as a smaller, faster win." |

**Status: done 2026-07-05.** Every stored/computed spine value classified; all three clusters carry
a pursue verdict with reason and a commissioned next step. No code changed — the spine, its
serialization, and `collab.ts` remain exactly as they were; the commissioned spec interview and
two prototype briefs are separate follow-on work, not run in this ledger.
