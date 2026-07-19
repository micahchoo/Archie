# ADR-0026 — Library-unique object ids

**Status:** accepted (2026-07-19, grill — user-gated) · **Decides:** seeds `Archie-8a45`
(build tracked by `Archie-9ea8` → `Archie-8c10` → `Archie-8439`) · **Reaffirms (untouched):**
ADR-0001 — Objects stay owned by their Exhibit; this decision changes only the id *grammar*,
not who owns an Object. See "Note on ADR-0001" below.

## Context

An Object id (the canvas-id stem: `${base}${slug}/canvas/${objectId}`) was, historically, an
exhibit-**local** ordinal — `o1`, `o2`, … — minted by `nextObjectId`, a len+1 probe over the
exhibit's current objects. Two problems surfaced under grilling (Archie-8a45, retrospective on
the ADR-0001 drift already flagged when that ADR was written):

- **Only unique within one exhibit.** ADR-0001 kept Objects exhibit-nested deliberately (no
  shared pool — self-contained, portable Exhibits), but nothing stopped a *future* shared-pool
  or cross-exhibit-linking feature from needing ids that don't collide the moment two exhibits
  are viewed together. An exhibit-local id is a wall the day that need arrives.
- **`nextObjectId` could reuse a deleted object's ordinal.** Remove `o3` from `[o1, o2, o3]`,
  add a new object → it becomes `o3` again. A tombstoned Note or a stale `archie:` link that
  still names `o3` now resolves onto the *new* object — a silent resurrection onto the wrong
  target, not a crash. This was the concrete bug that forced the question past "someday."

The grilling session (2026-07-19) also had to answer a harder question than "what shape should
new ids have": the library already contains objects minted under the old scheme, and there is no
clean way to change the *shape* of an id without deciding what happens to everything that already
points at the old shape — annotation targets, link references, section pointers, pending notes,
and citation URLs that may already be circulating outside the library entirely.

## Decision

**Two id regimes, split by how the id comes to exist, not by object type:**

| Regime | Shape | Where it applies |
|---|---|---|
| **Migrated** | Deterministic, composed: `<exhibitId>.<oldOrdinal>` (e.g. `ex-voynich.o1`) | Objects that existed under the old exhibit-local scheme, rewritten in place by the migration |
| **New mint** | Random, ULID-family (`mintObjectId`, the same `mintUlid` core the annotation spine's `logicalId` uses) | Every object created from this point forward |

**Why the split, not one scheme for both cases:**

- **Migration requires determinism.** A user may have independently-migrated copies of the same
  library (two devices that opened the same `.archie.zip` and each ran the migration locally,
  before either syncs with the other). If migration picked a *random* new id per copy, the two
  copies would disagree about what the same object is called, and the merge layer — which
  reconciles logs by id — would see two different objects instead of one. Composing the id from
  data already present (`exhibitId` + the old ordinal) means every independent migration of the
  same object produces the *same* new id, so copies converge under merge without a
  reconciliation step.
- **Minting forbids determinism.** The inverse holds for new objects: if new mints were
  deterministic (e.g. "next ordinal"), two concurrent adds — two exhibits, two devices, two
  sessions — race to mint the same id and collide. Randomness (ULID) is what makes concurrent,
  uncoordinated minting safe. This is also why `nextObjectId` was retired outright rather than
  patched: its "highest ordinal + 1" mechanism is exactly the deterministic-mint shape that both
  the reuse bug and the concurrent-mint hazard trace back to. `render-core`'s object-id module
  (`packages/render-core/src/object-id.ts`) is the only mint/compose site now; a caller does not
  hand-roll either shape.

**Both shapes are opaque everywhere.** No consumer — annotation code, link resolution, the
Studio UI, the Viewer — inspects an id's structure to decide anything. The **one** place that
parses an id is `isLegacyObjectId` (`object-id.ts`), a single `/^o\d+$/` test that the migration
uses to recognize what still needs rewriting. Composed ids and ULIDs both fail that test (a
composed id contains a `.`; a ULID is 26-char Crockford base32) and are treated as already
global. A future consumer that thinks it needs to parse an id shape is almost certainly trying to
route around this module — the fix is to add a query function here, not to regex elsewhere.

**The migration is an in-place rewrite across five classes**, run once per library, that turns
every legacy `o<n>` reference into its composed form:

1. object metas (the Object's own record)
2. annotation targets (the canvas-IRI tail every Note's selector points at)
3. `archie:` link refs inside prose bodies — resolved through `parseLinkRef`
   (`packages/render-core/src/link/link.ts`), never through a hand-rolled regex over the body
   text, so a link embedded in arbitrary prose is found the same way link resolution already
   finds it
4. section object refs — in **both** places sections persist: `exhibits[].sections[]` inside
   `library.json` (the shipping default — the structure rev-log ships flag-OFF, so library.json
   is the section source of truth) and the structure-log history pages (flag-ON). In each,
   `objectId` composes under the owning exhibit and section `prose` is swept for `archie:` refs
   like any other body (class 3 mechanics). Framing this as "through the structure logs" alone
   was the original draft's error — the engine's review caught the default-OFF path as a miss
5. the pending-notes sidecar

Full annotation history is rewritten, including tombstones — a tombstone still names an object,
and a stale reference in a tombstone is exactly the kind of "invisible until it resurrects" bug
that motivated this ADR in the first place. **The version DAG's shape is untouched** — the
rewrite changes the *id a revision refers to*, not the graph of revisions. **Assets and
thumbnails never move**; they are name-keyed on disk, not id-keyed, so nothing about this
migration touches asset paths.

**Safety: snapshot-then-rewrite, marker written last.** Before rewriting, the migration copies
the pre-migration tree into `pre-migration/` inside the library, kept until the user deletes it —
an escape hatch if the rewrite is ever wrong. The rewrite then follows the repo's standing
multi-file-write convention (`.claude/rules/render-core-data-integrity.md`, rule 1: content
first, marker/index last — the same ordering `spine/persist.ts` and `publish/site.ts` already
use): every content file is rewritten before an `idScheme: 2` marker is written, and the marker
is the **last** file touched. A crash mid-migration therefore leaves a tree that still reads as
un-migrated (no marker → still `idScheme: 1` behavior), so a torn migration is safe to detect and
simply re-run — the rewrite is idempotent because composing an id from the same
`(exhibitId, ordinal)` pair always produces the same output, so re-running it over
already-migrated content is a no-op on those entries.

**Exactly three triggers**, chosen so the two schemes never coexist in a live store:

1. **Studio open** of the resident store — checked before the session boots.
2. **The untrusted-archive open seam** (`packages/render-core/src/publish/open.ts`,
   `openArchieLibrary` / `openArchieLibraryFromUrl` — the one composed decode-then-validate path,
   see `.claude/rules/untrusted-archive-open-seam.md`) — an incoming `.archie.zip` is migrated
   before it is adopted or merged.
3. **Merge ingestion** — an incoming old-scheme log is migrated before `mergeLogs` runs, so both
   sides of a merge carry ids in the same scheme and compare correctly.

**The Viewer needs zero migration code.** Published trees are self-consistent: whatever scheme
produced a given published tree is the scheme every file in that tree already uses end to end, so
a reader never needs to translate.

## Note on ADR-0001

This ADR does not reopen ADR-0001. Objects and their Notes remain owned by the Exhibit that
contains them — no shared Library-level pool is introduced, and nothing here changes who may
reference an Object or how an Exhibit is packaged. What changes is only the **grammar** of the
id itself: today's ids already carry the owning exhibit inside them via composition
(`<exhibitId>.<ordinal>`), and new ids are library-unique by construction (a ULID cannot collide
with another exhibit's ids even though nothing currently checks that). The practical effect is
narrow but real: if a future decision *does* introduce a shared object pool or cross-exhibit
linking (the reversal ADR-0001 warns any future contributor to weigh carefully), it becomes a
**projection change** — reindexing what already-unique ids mean — rather than an **id rewrite
through annotation targets**, which is the expensive, error-prone version of that migration this
ADR's own rewrite (the five classes above) demonstrates the cost of. This ADR exists so that cost
is paid once, now, while the reason is fresh, instead of being owed again later under time
pressure.

## Consequences

- **Circulated citation links break at republish**, and there is no permanent shim to prevent
  it. An `archie:` link or a bookmarked citation URL that names a legacy `o<n>` id, shared outside
  the library before migration, resolves to nothing once the library migrates and republishes
  under composed ids. This is an accepted loss, not an oversight: at decision time the outside-
  reader base for such links was judged to be effectively zero (Archie ships to individual
  scholars/curators working locally; wide external circulation of citation URLs was not yet
  happening). **The condition is explicit, not a blanket permanent judgment** — if outside
  circulation grows materially before this ships, that changes the cost side of the trade and the
  decision should be revisited, not silently honored past its premise.
- **localStorage per-object preferences are lost** across migration — anything keyed on the old
  `o<n>` id in browser-local storage (not part of the library's own files) has no migration path
  and is not recovered. Documented here as a known, accepted loss rather than a bug to chase.
- **The migration is a one-way door once it writes the `idScheme: 2` marker.** Rerunning it is
  safe (idempotent), but there is no "un-migrate" beyond manually restoring from `pre-migration/`.
- **`nextObjectId` and its concurrent-session ordinal-reservation registry are deleted outright**,
  not deprecated. ULID minting removes the root cause (id reuse, concurrent-mint collision) that
  the reservation registry existed to paper over, so nothing is left needing it.
- **A caller that needs to know whether an id is pre- or post-migration asks `isLegacyObjectId`**,
  never a local regex — this is now an enforced single-parser contract, matching the shape of the
  existing single-composition-site contracts elsewhere in `render-core` (e.g. the untrusted-
  archive open seam, the `archie:` link parser).

## Alternatives rejected

- **One id scheme for both migration and new mints.** Either all-deterministic (composed ids for
  everything, including new objects) or all-random (ULIDs for everything, including migrated
  objects). All-deterministic new mints reintroduces the concurrent-collision hazard `nextObjectId`
  already had. All-random migration breaks convergence across independently-migrated copies of
  the same library, defeating the merge layer. The two constraints are in direct tension, which is
  why the regime is split by *how the id was created* rather than unified.
- **Patch `nextObjectId` instead of retiring it** (e.g. track deleted ordinals to avoid reuse).
  Rejected: still deterministic, so the concurrent-mint collision hazard survives; and it adds a
  second piece of state (a tombstoned-ordinal set) whose own persistence and merge behavior would
  need the same scrutiny this whole ADR is about, to fix a problem ULIDs remove structurally.
- **A shim/redirect for broken citation links** (e.g. keep a legacy-id → new-id lookup table
  published alongside the migrated tree, so old links still resolve). Rejected: the Viewer's
  zero-migration-code guarantee is a deliberate simplicity the shim would spend, permanently, to
  serve a near-zero outside-reader base at decision time; revisit if that base changes (see
  Consequences) rather than paying the cost pre-emptively.
- **Introduce a shared Library-level object pool now, instead of just unique ids.** Would reopen
  ADR-0001, which was a deliberate, previously-grilled trade-off (self-contained portable Exhibits
  over cross-exhibit reuse). Out of scope here — this ADR's entire point is to make that reopening
  *cheaper if it ever happens*, not to force it now.
