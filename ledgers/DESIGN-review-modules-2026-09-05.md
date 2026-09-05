# Review implementation: Modules and contracts

Status: implemented; final validation record in [implementation ledger](IMPLEMENT-review-2026-09-05.md). Uses the codebase-design vocabulary.

| Module | Interface callers learn | Implementation it owns | Leverage / Locality |
|---|---|---|---|
| AnnotationSession save | Await `save(dir)`; rejection means retry is required | Serialized write snapshots; dirty restoration; concurrent edit and merge acknowledgement | Callers no longer infer that all current edits became durable during an await |
| Internal history page store | Read with a domain codec and index error; write pages and optional dirty set | Classified absence, per-page recovery, revision deduplication, settling writes, index ordering | Annotation and structure stores share actual mechanics while keeping distinct codecs |
| Studio UndoWire | Ordinary mutations; synchronous `batch`; undo/redo; read visible notes | Action stops, 800ms body-typing bursts, grouping imports, visible-revision edits, session switching | UI handlers need no manual marks or overlay repair; tests use the same Interface |
| Viewer address | One address function over a route or local hash | Source inheritance and route serialization | Gallery, breadcrumbs, citations, prose and reader locus retain library identity |
| Embed resource policy | Ask for a usable URL under the current policy | Offline checks before remote resource sinks; media stripped from blocked prose | Covers and note surfaces obey the same policy as primary media |
| Embed navigation owner | Set target or policy; dispose | Request invalidation, lazy continuation checks, AbortSignal through pending image mount, teardown | A newer gallery or offline transition cannot be overwritten by an older reader |
| Buffered writable | Sequential `write` calls, then `close` | Ordered mixed-type byte accumulation and snapshotting | Memory, Zip, Node and Tauri satisfy the same append contract as browser and streaming Adapters |

The Svelte address context is an Adapter supplying the shell's active source. It does not duplicate route grammar. Changing source reloads the complete library session: a deliberate coarse operation that discards stale readers and makes Back identical to a fresh source-qualified arrival. Opening a local file clears the previous remote address.

## Undo decision

Retain session-only undo. Undo and redo change the visible projection without rewriting append-only history. Reopening restores the saved history; the toolbar states this explicitly.

An explicit edit after Undo uses the visible revision as its content basis and appends a new revision whose parent is the current durable head. Editing a visibly restored deletion therefore creates a live descendant of its tombstone. Historical records remain immutable. Deleting that temporary restoration hides it again without appending a duplicate tombstone. Redo preserves individual action stops.

This is an explicit authoring rule for the post-undo case, not durable undo. Multihead conflicts still require resolution. Structural object deletion remains separate from note undo. No accepted merge-contract open question was silently redesigned.

## Publication and compatibility

History pages precede discovery indexes; the generation marker remains last. Default generation includes authored metadata and note history, so note-only republishes invalidate cached reads. In-place page replacement still cannot provide whole-library snapshot isolation. A partial write rejects only after all started writes settle, preventing a queued retry from racing residual work.

`enablePagesFor` is a live desktop caller and treats Pages configuration as best effort after a successful push. Transport/body failure returns the manual-setup result. The unused production REST publisher remains a deprecated compatibility export; its branch creation route is corrected and its initialized-repository requirement documented. Removing an exported Interface without a migration would add unnecessary compatibility risk.

Historical prose was shortened where it obscured the operative undo contract. No broad utility collection, plugin framework, or shared renderer was introduced. The shared reader fixtures exercise published bytes and expected semantics; presentation remains owned by each reader.

## Known limits

Corrupt archive adoption now refuses incomplete annotation history. Recovery diagnostics remain available through the report reader; this work does not add a recovery editor. Folder publication is ordered, not transactional. Performance stays incremental per note, but a representative large-library memory envelope still requires explicit benchmarking. User-study results require participants.
