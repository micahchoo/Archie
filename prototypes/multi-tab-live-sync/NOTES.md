# D1 — Local multi-tab live sync (THROWAWAY prototype)

Ticket `Archie-a66d` (map `Archie-f849`). Delete this whole dir once the D1 ledger is written;
the *answer* below is the only thing worth keeping.

## Question answered

Can two browser tabs edit ONE exhibit's annotations live, entirely client-side (no server), on the
already-decided **Model B** design — and does Archie's EXISTING DAG merge (heads / resolveConflict)
correctly surface concurrent same-annotation edits as reviewable branches across tabs?

**Yes.** The real render-core spine reconciles live multi-tab edits over a Yjs rev-log transport
with zero merge code written here. Verified end-to-end in two real Chromium tabs (see below).

## What it is

Model B, exactly as `ledgers/PROBE-collab-crdt-mapping.md` decided: Yjs is a **transport** for the
append-only rev-log — a grow-only `Y.Map<rev, AnnotationRecord>`. Archie's own version-DAG merge does
ALL reconciliation. Model A (mapping annotation fields into a Y.Map) is NOT built.

- `src/rev-log.ts` — the transport. `Y.Map<rev, AnnotationRecord>`, cross-tab sync over
  BroadcastChannel (full-state rebroadcast on every local update; grow-only + tiny, so idempotent
  applyUpdate needs no delta protocol). A `pause()/resume()` gate simulates a tab going offline.
- `src/app.ts` — the UI, and the ONLY place render-core is called. Imports **real** `appendNew`,
  `appendEdit`, `headsOf`, `resolveConflict`, `projectHeads`. Add/edit/resolve all go through them.
- `src/seed.ts` — 2–3 hardcoded Voynich-style seed annotations, shared identically across tabs.
- `index.html` — crude surface. Per-annotation: revs count, heads count, body, edit box; a red
  CONFLICT panel showing each branch (body + lastEditor + rev) with a "pick this one" button.
- `verify-two-tab.mjs` — Playwright driver (repo-root playwright + chromium).

## Real vs stubbed

**Everything merge-related is REAL — nothing stubbed.** Imported verbatim from
`packages/render-core/src` via relative `.js` specifiers (bun resolves `.js` -> `.ts`):

| Import | Module | Role in the demo |
|---|---|---|
| `appendNew`, `appendEdit` | `spine/log.ts` | add / edit an annotation (mints rev, builds the DAG child) |
| `headsOf`, `resolveConflict` | `spine/merge.ts` | detect plural heads; append the multi-parent merge node |
| `projectHeads` | `spine/heads.ts` | project the live annotation list from the log |
| `AnnotationRecord`, `W3CBody`, `LogicalId`, `ClientId` | `wadm/types.ts`, `wadm/brand.ts` | types |

Deliberately NOT imported: the `spine/index.ts` barrel (it re-exports serialize/deserialize/persist,
which pull fflate/dompurify/the Filesystem seam — none needed for a transport+merge demo). Importing
the three leaf modules directly pulls only pure TS (`brand`, `types`, `model/carry`). Bundle = 44
modules, ~187 KB (mostly yjs/lib0). No stub was required anywhere.

## Verified vs unverified

**Verified** (`node verify-two-tab.mjs`, two real Chromium tabs in one context, ALL 12 checks pass):
- Server: `bun build ./index.html` bundles clean (exit 0); `bun dev` serves at `http://localhost:3001/`.
- Both tabs render the 3 seed annotations.
- **T1 live propagation:** edit in tab A appears in tab B's projected head.
- **T2 concurrent conflict:** both tabs pause, each edits the SAME annotation, both resume => the log
  holds both sibling revs and `headsOf` returns **2 heads in BOTH tabs**; both render the conflict
  panel with both branch bodies.
- **T3 resolve:** clicking "pick this one" in tab A appends a real `resolveConflict` merge node =>
  conflict clears to 1 head in BOTH tabs; both converge to the same resolved body.
- **Grow-only:** after the round trip LID0 holds exactly 5 revs (seed + A-edit + 2 siblings + merge
  node) — nothing overwritten.

**Unverified / out of scope:** real network (BroadcastChannel is same-origin same-browser only —
production wants y-webrtc/y-websocket); y-indexeddb persistence (nice-to-have, skipped); the real
seed library / authored structure (sections/readings) — annotations only, per spec.

## Findings for the ledger

1. **The existing merge machinery holds over a live transport, unchanged.** `appendNew/appendEdit/
   headsOf/resolveConflict/projectHeads` ran verbatim against a log materialized live from Yjs. Model
   B is confirmed at browser/multi-tab scale, not just terminal scale.
2. **No serialization / brand-type friction.** `AnnotationRecord` round-trips through Yjs (lib0
   encoding) as a plain object with no custom codec; branded ids (`LogicalId`/`RevId`/`ClientId`) are
   plain strings at runtime and survive transparently. A `target` that is a string or a
   `SpecificResource` object both encode fine.
3. **`Object.freeze` is a non-issue.** lib0 only reads properties when encoding, so freezing records
   before transport is safe; the decoded copy on the peer side is a fresh mutable object.
4. **Keying the Y.Map by `rev` (not `logicalId`) is what makes it grow-only and idempotent.** Each
   append is a new immutable entry; the same rev arriving from two tabs converges to one entry. Keying
   by logicalId would have re-created Model A's last-writer-wins overwrite. Keep the key = `rev`.
5. **`appendEdit` correctly REFUSES a plural-head note** (`linearHead` throws) — so the UI must gate
   editing while a conflict is open and route the user to resolve first. The prototype surfaces the
   throw as a status message; a real client shows the conflict panel instead of an edit box. This is a
   feature (no blind edit on an unresolved branch), not a rough edge.
6. **A sync gate is needed to demonstrate TRUE concurrency.** BroadcastChannel delivers so fast that
   an un-paused second edit becomes a fast-forward child, not a sibling. The pause/resume ("offline")
   gate is how you reproduce a genuine 2-head conflict — and mirrors the real UX (two tabs editing
   within the same tick / one briefly offline).

### What downstream tickets inherit
- **Spine gate (`Archie-494c`):** annotations need NO spine surgery for live collab — confirmed a
  second time, now in-browser. The transport sits entirely beside the log. The gate's real question
  stays *authored structure* (sections/readings ordering + id-keyed merge), which this prototype does
  not touch.
- **Merge-spec (`Archie-697c`) / MergeReview UI (`d71c`):** the live path uses the SAME merge contract
  as the async-zip path (`resolveConflict` merge node, `mergeParents`, deterministic primary =
  lexicographically-first head). Do not fork a second merge contract for the live path. The conflict
  panel here is a crude preview of what MergeReview surfaces; the branch data it needs (body +
  lastEditor + rev per head) is exactly `headsOf`'s output.
- **Transport choice for real collab:** BroadcastChannel proved the logic but is same-browser only.
  The production transport (y-webrtc / y-websocket relay) swaps in behind the same `RevLogTransport`
  seam without touching the merge layer.

## render-core API friction (C2 evidence — first out-of-workspace consumer)

Each point bun-built for evidence, not recalled.

1. **No build artifact — ships raw `src/*.ts`.** `render-core/package.json` `main`/`types` =
   `./src/index.ts`, no `dist/`, build is only `tsc --noEmit`. An outside consumer MUST use a
   TS-native bundler/runtime (bun/vite/tsx). Plain `node`/`require` or a non-TS bundler gets nothing.
   Biggest fork gap.
2. **`.js` specifiers resolve to `.ts` (NodeNext).** Zero friction under bun; a non-TS toolchain
   needs `allowImportingTsExtensions`/resolution config.
3. **`exports` map is only `.` and `./spine`.** Everything else (`wadm`, `model`, `fs`…) is
   private-by-omission. This prototype consumes render-core by **relative filesystem path**, which
   sidesteps the gate; a **package-name** consumer is limited to those two subpaths.
4. **Brand-id constructors only reachable via the root barrel.** `asClientId`/`asLogicalId`/
   `asRevId` (`wadm/brand.ts`) are exported only via `.` — no `./wadm`/`./ids` subpath. To call
   `appendNew`/`appendEdit` from outside you need a branded `ClientId`; this prototype casts literals.
5. **Correction (vs an earlier assumption):** the `@render/core/spine` barrel **does** bundle
   browser-clean for the merge path — importing only `{headsOf, resolveConflict, projectHeads}`
   tree-shakes to **11 modules / 3.35 KB** (bun drops `persist.ts`'s Filesystem import and
   `serialize.ts`; dompurify lives in `text/sanitize.ts`, unreachable from merge). The leaf imports
   this prototype uses are defensible (explicit, don't rely on tree-shaking) but were NOT necessary.
   The **root `.` barrel** is the heavy one: a single `headsOf` import pulls **67 modules / 120 KB**
   (still browser-buildable, no hard node-only break). Net: `./spine` is fine, `.` is not, and there
   is no id-constructor subpath.

## Run

```
cd prototypes/multi-tab-live-sync
bun install           # isolated; never touches the pnpm workspace root/lockfile
bun run dev           # serves http://localhost:3001/  (open in TWO tabs)
node verify-two-tab.mjs   # optional: automated two-tab check (repo-root playwright)
```
