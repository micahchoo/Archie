# Archie core data / publishing audit

Snapshot: 91935b2. Read-only source review. No production files edited. Scope: hubs/data.md and hubs/publishing.md; binding data-integrity / archive-open / path containment rules; annotation MERGE-CONTRACT; fs, spine, session, publish implementations and selected consumers/tests. This is a current-snapshot review, not an introduced-by-diff claim.

## Four strongest findings

### D1 — P1: An edit during autosave is marked persisted without writing its history

Location: `packages/render-core/src/session/session.ts:327-329`; full-save sibling at `:320-322`.

Trigger: a note changes while `save()` awaits its filesystem writes. Full save clears all dirty ids afterwards. Incremental save snapshots only ids, then deletes those ids even if the same note acquired another revision during the wait. The next queued save receives the latest entries but skips that note's history page. A reload reads history, so the new edit disappears even after both saves finish successfully. Creating a new note during a full save similarly risks an index referencing a page never written.

Production reachability: `apps/studio/src/exhibit-session.svelte.ts:69` serializes saves through `enqueueSave`, but authoring remains live. Serializing save calls does not prevent edits during a save.

Focused real-source probe `/tmp/archie-data-probe.ts`: gate the first filesystem access of save, edit while blocked, unblock, finish save, save again, then `AnnotationSession.load`.

Observed output:
- Full save: memory body `latest-during-save`, disk body `v1`; memory 2 versions, disk 1.
- Incremental save: memory body `latest-during-save`, disk body `v2`; memory 3 versions, disk 2.

Fix direction: drain the dirty set before awaiting and restore on failure, or track per-note saved revisions so completion clears only the revision actually persisted. Full save needs the same treatment. Also guard a merge during an in-flight full save from incorrectly setting persistedFully true.

### D2 — P1: Opening a corrupt archive silently adopts only surviving notes

Location: `packages/render-core/src/publish/site.ts:1146`.

`loadLibrary()` calls `readAnnotations()`, whose convenience implementation discards `readAnnotationsReport().corrupt`. A zip/folder with one missing or unparseable committed history page therefore loads as a healthy library with that note absent. Marker validation verifies gallery JSON, not all referenced history. Studio then clears outgoing note stores and persists this partial library in `apps/studio/src/ingest-flows.ts:1218-1221`; subsequent export makes the loss durable. This bypasses the explicit corrupt-not-empty rule at an import/adoption boundary.

Focused real-source probe `/tmp/archie-publish-probe.ts`: publish two notes, remove one referenced history file, call validateArchieMarker then loadLibrary. Marker passes; loadLibrary returns 1 note without error/diagnostic. Calling readAnnotationsReport on the same directory reports the missing page. This is distinct from D3, which concerns valid JSON with wrong shape.

Fix direction: use the reporting reader and either refuse adoption with AnnotationsCorruptError or preserve/surface the corruption in a typed load result before a destructive replace. Do not silently discard it.

### D3 — P2: One wrong-schema history page aborts the entire supposedly tolerant read

Location: `packages/render-core/src/spine/persist.ts:132` and `:139-140`; failure occurs at `spine/deserialize.ts` fromHistoryPage's `for (const item of page.items)`.

The per-page try/catch covers only byte read and JSON.parse. Page-to-record conversion happens later across all pages, outside the catch. Valid JSON such as `{}`, `null`, or a non-array items field therefore throws globally. A single damaged/foreign page prevents recovery of every valid sibling page and bypasses the `CorruptAnnotationPage` diagnostic contract.

Focused probe `/tmp/archie-data-probe.ts`: write two real notes; replace only one history page with `{}`; readAnnotationsReport throws `TypeError: page.items is not iterable` instead of returning the intact note plus one corrupt entry.

Fix direction: validate and deserialize each page inside its individual try/catch, following the existing structure reader (`sectionRecordsFromPage` runs inside its per-page catch). Validate index shape as well; TypeScript casts do not validate parsed JSON.

### D4 — P2: Storage permission/I/O failures are classified as an empty clean log

Location: `packages/render-core/src/spine/persist.ts:103-106`; same flaw at `spine/structure-persist.ts:95-98`. Additional broad-swallow directory lookup in `publish/working.ts:294-301`.

Both reporting readers catch every `getDirectory('history')` failure and return `{ log: [], corrupt: [] }`. A revoked folder grant (`NotAllowedError`), EACCES or another storage fault is not evidence the history does not exist. Session.load then sees a clean empty log; downstream seed/recovery logic loses its corruption guard. These modules already use isNotFound correctly for the index lookup immediately below, so classification is inconsistent within the same reader.

Focused probe `/tmp/archie-data-probe.ts`: inject getDirectory throwing `DOMException('user revoked folder access','NotAllowedError')`. Both annotation and structure readers return the clean-empty result.

Fix direction: only isNotFound may map to empty; propagate or wrap other failures as corruption/failed-read. Apply the same classified traversal at callers so they do not erase the distinction first.

## Additional observations, lower priority / separate from top four

- `publish/ghpages.ts:280,286`: enablePagesFor explicitly promises never to throw after a successful push, but both fetch calls can reject with no catch. The live desktop path calls it after pushTree (`apps/studio/src/deploy/deploy-flows.svelte.ts:163-172`); a transport failure converts an already-pushed deployment to an error, skips rememberTarget and bypasses manualPagesNeeded. Direct code proof; no focused transport probe run. P2 candidate.
- `publish/ghpages.ts:248-251` uses POST `/git/refs/heads/{branch}` to create a missing branch. GitHub documents POST `/repos/{owner}/{repo}/git/refs`; existing-branch PATCH is the shape with `/{ref}`. Its mocked tests accept the incorrect route. This is a concrete dormant/legacy browser adapter bug; current desktop path uses Rust push and appears to be the live UI path, so do not present as current primary publish failure. Official source: https://docs.github.com/en/rest/git/refs#create-a-reference (verified by browsing). Empty repositories also require initialization before git-database operations; ensureRepo intentionally creates an empty repo. Treat these as legacy surface debt unless reachability is re-established.
- `publish/site.ts:1000`: default generation hashes gallery/image projections, not annotation bytes. Real-source note-only republish with no publishedAt/generation keeps `generation: ueefxq`. App callers are documented to provide publishedAt, so this is a public-core footgun rather than a proven current UI caching failure.
- `fs/node.ts` and `fs/tauri.ts` maintain separate buffered string/ArrayBuffer and streamed Blob legs; close discards the buffered leg whenever a Blob opened a handle. Mixed write types silently lose bytes. Memory/Zip overwrite instead of append on repeated write calls, so the FsWritable multi-write contract is itself unspecified/inconsistent. Current main call sites appear to issue one write per file. Prefer an explicit seam contract before promoting to a user-impact finding.
- `publish/site.ts:823` writes annotation history index before pages, contrary to the local index-last rule. Global marker-last does not provide snapshot isolation during overwrite. This should be covered by failure-injection tests, but the republish old-marker residue is already documented; do not misreport as a wholly new discovery.

## Documented gaps / excluded from new-defect count

- MERGE-CONTRACT OQ-2 rev collision local-wins silently, OQ-3 tombstone-primary live empty-body resolution, OQ-5 duplicate explicit logical id forks, OQ-6 deleted conflict head hidden from pure viewer. All explicitly pinned behavior.
- `ledgers/DESTNEG.md:30` explicitly accepts the old marker surviving an object-storage republish, permitting mixed-generation reads until pass two. A killed in-place publish has the same underlying limitation; existing comments claiming marker-last guarantees atomic completeness overstate the protection.
- Zip-open ceilings deliberately allow large memory use. Do not call the documented ~4 GiB bound a new unboundedness finding without a cap-bypass proof.
- The data hub's old list of open archive bugs is stale: ledger closure notes and source show the name lookup gate, friendly decode errors, short-STORED validation and torn marker refusal already landed.
- Undo persistence is deliberately session-scoped. No findings here for undo not surviving reload.

## Three architecture / complexity recommendations

1. Deepen the durable-log boundary. Put dirty revision acknowledgement, full-vs-incremental state, failure restoration and per-page corruption reporting behind one persistence operation. The session currently knows storage optimization state while callers separately decide whether partial reads are safe. A result that carries committed revision and corruption would prevent D1/D2 by construction.
2. Share page-store mechanics between annotation and structure persistence with typed per-page codecs. The two implementations duplicate directory/index lookup, write ordering and error classification, and already diverge exactly at schema validation. Keep annotation/section semantics separate; share discovery, classified errors, page-level tolerance and commit discipline. Test fault cases on the seam instead of duplicating only happy-path round trips.
3. Split publish planning from committing to a sink. site.ts combines media extraction/transcoding decisions, manifest projection, history persistence, fixity, cleanup, static pages and commit ordering. An explicit publish plan/snapshot plus a sink executor can state which files belong to a generation and centralize transactional limitations. Folder/object-store executors can implement generation directories or a safe incomplete state; zip/Git can retain their natural all-at-once visibility.

## Reproduction commands

From repository root, separate command lines:

```sh
node_modules/.pnpm/esbuild@0.27.7/node_modules/esbuild/bin/esbuild /tmp/archie-data-probe.ts --bundle --platform=node --format=esm --outfile=/tmp/archie-data-probe.mjs
/home/micah/.local/share/fnm/node-versions/v24.16.0/installation/bin/node /tmp/archie-data-probe.mjs
node_modules/.pnpm/esbuild@0.27.7/node_modules/esbuild/bin/esbuild /tmp/archie-publish-probe.ts --bundle --platform=node --format=esm --outfile=/tmp/archie-publish-probe.mjs
/home/micah/.local/share/fnm/node-versions/v24.16.0/installation/bin/node /tmp/archie-publish-probe.mjs
```

Full suite intentionally not run by this agent; root owns it. Probe files/bundles are only in /tmp. Existing worktree changes DIVERGENCES.md, README.md, ledgers/TEND-rerun-2026-08-22.md were not touched.
