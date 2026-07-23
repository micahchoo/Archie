# TEND EXPLORE — render-core — 2026-07-20

Subsystem: `packages/render-core` (model + model/carry, wadm, spine/persist+history, publish
site/open, fs backends FSA/OPFS/zip/http/tauri, limits, IIIF import). Adjacent apps are context;
every observation below roots in render-core.

Method: tend ladder (L1 Purpose · L2 Behavior · L3 Structure · L4 Implementation), friction +
surplus per rung, evidence at file:line. This subsystem has been tended hard — DARKDATA.md,
PROBE-structure-revlog.md, NEGSPACE.md, SCALE.md, CANON.md and ~40 other ledgers already exhaust
most cells. The honest yield is a small, high-quality set concentrated on the identity/interop
seam the two seeded leads pointed at, not a padded six.

## Seeded-lead verification

**Lead 1 — `creator?: unknown` (wadm/types.ts:148) never populated; Reading has no owner
(model.ts:207).** VERIFIED and distinct from DARKDATA. `grep -a creator` across
render-core src (non-test) returns only the type declaration at `wadm/types.ts:148` and the
dcterms *authoring-metadata* vocabulary (a different thing) — **zero write sites**. The WADM
projection `recordToAnnotation` (`spine/serialize.ts:108-119`) emits `id/type/target/modified`
(+ optional body/motivation) and **neither `created` nor `creator`**. Meanwhile the app DOES
hold a human author identity: `apps/studio/src/App.svelte:113`
`const author = $derived(asClientId(identity || "anonymous"))`, and
`apps/studio/src/collab-attribution.ts:23` — "The stamp IS the chosen display name
(author = asClientId(name))". That name flows only into `lastEditor` → `archie:lastEditor`, which
DARKDATA established rides on **history pages only** (heads page stays consumer-minimal). Net:
the pure-WADM/IIIF surface (the heads-page AnnotationPage a Mirador loads) carries a `modified`
timestamp and **no authorship or creation-time at all**. DARKDATA censused `lastEditor`
(app-facing, "no UI shows last-edited") and `modifiedAt`; it did NOT census the standard
`creator`/`created` **interop emission** — a genuinely new corner.

**Lead 2 — history restore/view census, unexposed corners.** VERIFIED: none found beyond what is
already tracked. Annotation history is DARKDATA's pursued cluster (spec interview commissioned).
Structure history (`spine/structure*.ts`, the parallel SectionRecord version-DAG) IS read back on
reload/merge (`apps/studio/src/structure-import.ts:104`, `structure-session.svelte.ts:127`) — same
dark-but-live status as annotation history, covered by the "version-history dark data" decided
exclusion. PROBE-structure-revlog.md already promoted and probed it. The only "restore" verb that
exists is `appendUndeleteSection` (`spine/visibility.ts`, structure-level un-delete); annotations
have no restore/checkout/revert verb (`grep -a` for restore/checkout/revert/rollback = none in
spine/migrate). That absence is exactly what DARKDATA's pursue verdict already targets. No new
ticket.

## Rung ledger

### L1 — Purpose (why it exists)

**Friction.** The three-tier interop *purpose* — stated at `wadm/types.ts:3-8` and throughout
(`serialize.ts:3-5`: "A pure WADM consumer assigns these to W3CAnnotation and ignores [the archie:
keys]") — is that **standard fields work for a pure consumer for free**, archie: extensions are
additive. That promise is unmet for authorship: the two WADM-standard fields a pure consumer reads
to answer "who made this, when" (`creator`, `created`) are never emitted, while the data to fill
them exists. The stated purpose ("free credit for a Mirador viewer" — echoed in model.ts:116-122
for rights) drifts from what the annotation projection actually ships. → Issue 1.

**Surplus.** `creator?: unknown` (wadm/types.ts:148) is a domain concept the code models (the WADM
authorship slot) that the emission path never mentions — a field declared, typed as the loosest
possible `unknown`, never written or read. Adjacent: `Reading` (model.ts:207, a first-class
curated interpretive PASS, published as its own AnnotationCollection) carries name/description/
colour but **no owner/creator** — an authored, publishable artifact with no attribution slot at
all. Both point past the note-level gap to an un-modeled "authorship as a first-class concept."
→ Direction 1. (Excluded reserved fields `Exhibit.mode`/`layout`/`ReadingFamily` are Direction
4 / bakeTiles territory — not re-counted.)

### L2 — Behavior (what it does)

**Friction.** `av/transcript.ts:1` — "import-only v1." `importTranscript`/`cuesToNotes` turn a
WebVTT/SRT into time-ranged `supplementing` Notes, but there is **no inverse**: `grep -a` for
toVtt/toSrt/notesToCues/exportTranscript across render-core = none. An author who imports and
CORRECTS a transcript inside Archie cannot get a caption `.vtt`/`.srt` back out — the journey
stops one step short of the evident goal (a `<track>` file / re-usable captions), even though a
supplementing Note with a `t=start,end` FragmentSelector IS a transcript cue. → Issue 2.

**Surplus.** The full version-parent DAG is computed and persisted whole into every published tree
(annotation + structure history) yet has no restore/view — DARKDATA-pursued, not re-ticketed here.
The identity data (author display name) is captured and stamped on every append but the only
operation that consumes it publicly (the WADM projection) drops it — folded into Issue 1.

### L3 — Structure (how organized)

**Friction.** None new worth a ticket. `publish/site.ts` is the largest module (789 lines) and is
an orchestration god-module, but it is a cohesive publish pipeline with per-concern helpers
(iiif/manifest, publish/read, publish/portable) factored out — not a "same concern three ways."
The two parallel version-DAG systems (`spine/log` annotations, `spine/structure` sections) are a
deliberate, documented parallelism (`spine/index.ts:6-8`: "content helpers are parallel to (not
shared with) the annotation ones"), not accidental duplication. The trust-boundary seam is
canonicalized (untrusted-archive-open-seam rule; `fs/http.ts` re-establishes assertSafeName + caps
+ absent-vs-failed cleanly, well-tested). NONE-FOUND.

**Surplus.** `creator?: unknown` (wadm/types.ts:148) is a field NO caller passes — the L3 shape of
the L1 surplus (a slot in the type with zero writers). `W3CExternalBody` (types.ts:95-101) models
an external-media-IRI body; the authored path only ever produces `W3CTextualBody` (media in a note
is markdown in a TextualBody, parsed by note/media.ts) — a body variant present in the type union
with no producer. Low-leverage; noted, not ticketed.

### L4 — Implementation (how built)

**Friction.** `recordToAnnotation` (serialize.ts:108-119) is the WADM boundary and it under-emits:
only `modified`, no `created` — even though `created` is derivable (the DAG-root record's
`modifiedAt` for that logicalId). Combined with the absent `creator`, the pure-consumer surface is
authorship-blind. The `creator?: unknown` type means that even IF someone populated it there is no
schema — an un-designed field, not just an unwritten one. → Issue 1. `limits.ts` SRC_MAX_BYTES is
one 1 GiB cap shared by the whole-zip decode AND every single HTTP-backend response — the comment
(limits.ts:16-18) owns this as "a loose per-response ceiling," so a hostile static host could serve
a 1 GiB `manifest.json` the HttpFilesystem buffers whole; acknowledged, low-severity → fog only.

**Surplus.** The author identity is written on every append (session.ts:110-112 `stamp()`) and
serialized (`archie:lastEditor`) but only ever read back by the merge UI + collab banner
(DARKDATA), never by the standard projection that a pure consumer or the app's own "who/when" would
read — a value faithfully computed and persisted, then dropped at the one boundary that would give
it public meaning. Folded into Issue 1.

## Issues generated

1. **WADM projection omits standard authorship/creation (`creator`, `created`)** — Strong,
   L1↔L4. The interop purpose promises pure consumers get standard fields for free; the two the
   author identity + creation time would fill are never emitted, though the data exists.
2. **Transcript is import-only — no VTT/SRT export from time-ranged notes** — Worth exploring,
   L2↔L3. `cuesToNotes` has no inverse; a corrected transcript can't leave Archie as captions.

## Directions generated

1. **Authorship as a first-class concept (creator + Reading/exhibit ownership)** — Worth
   exploring. The model has an untyped-empty `creator` slot and Readings/Library/Exhibit with no
   owner; a multi-author or attributed-scholarship library cannot credit who authored a reading or
   an annotation set at any layer. Broader than Issue 1's mechanical emit — a modeling decision.

## Fog

- SRC_MAX_BYTES (1 GiB) is a single cap for both whole-zip-decode and per-HTTP-response; a hostile
  static host could serve a 1 GiB JSON the HttpFilesystem buffers whole. Acknowledged loose ceiling
  (limits.ts:16-18) — is a tighter per-JSON-response cap worth a second constant?
- `W3CExternalBody` body variant has no producer in the authoring path — dead union arm, or a
  reserved slot for an external-resource note type that was never built?
- merge.ts:6-9's comment ("loadLibrary→publishLibrary drops readings/sections") is now STALE —
  site.ts:730-738 recovers both. Comment drift only (excluded category), flagged so a future reader
  doesn't trust the warning.

## Adversarial verification — 2026-07-20 (workflow wf_19aab265-c48; one independent skeptic per finding)

- issues[0] "WADM projection omits standard authorship/creation fields (creator, created) despite capturing the data" — confirmed (Strong) → seeds Archie-3452. Corrections: Minor citation drift only: (1) "serialize.ts:3-5" — there is no wadm/serialize.ts; the log+projection purpose comment is packages/render-core/src/spine/serialize.ts:1-10. (2) session.ts is packages/render-core/src/session/session.ts (stamp() at :110, lastEditor stamped at appends :148/:167/:183/:241; carry-sentinel drop entry at :74). Substance of every claim holds.
- issues[1] "Transcript is import-only — no VTT/SRT export from time-ranged supplementing notes" — confirmed (Strong) → seeds Archie-bd0a.
- directions[0] "Authorship as a first-class concept — creator plus Reading/exhibit ownership" — corrected (Worth exploring) → seeds Archie-5323. Corrections: 1) RightsFields is not credit/license-only: it carries `metadata?: MetadataEntry[]`, and DEFAULT_METADATA_FIELDS (model/dcterms.ts:145) defaults `dcterms:creator` for library, exhibit, and object — a structured per-artifact author field exists at those layers, contradicting "the workaround is free-text prose or requiredStatement, where it isn't structured." The real gap narrows to: Reading has no metadata/owner field at all, and nothing ties annotation identity (lastEditor) to any layer's credits or the WADM creator slot. 2) The DARKDATA "pursue" verdict on per-note lastEditor is stale as evidence of a live gap: apps/studio/src/collab-attribution.ts (Archie-90f1) already implements per-note attribution chips. It remains valid only as prior-interest context.
