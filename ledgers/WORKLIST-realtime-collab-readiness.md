# WORKLIST — real-time-collab readiness (while staying a static app)

**Provenance:** planning session 2026-07-18 with the user. Sibling target is **Archie+** (a
separate, fullstack, real-time-collaborative product on the same `render-core` spine — Archie itself
keeps its local-first, no-server thesis). This worklist is the envelope-pushing prep that is
**valuable in static Archie today AND de-risks the Archie+ fork** — nothing here requires a server,
a backend, or accounts-with-a-server. Related: [[../DIVERGENCES.md]] (Archie+ is the collab tier
above divergences 1/3), the async merge surplus (Direction 1, `ledgers/CAPABILITY.md`), and the
identity dark-data cluster (Direction 2, `ledgers/DARKDATA.md`).

**Invariant for this worklist (fixed):** every item must ship standalone value in the static,
local-first app. The moment an item needs a server to be worth doing, it belongs to the Archie+
build session, not here. If an item can only be justified by "we'll need it for collab," it is
**cut** — prep that isn't independently valuable is speculative coupling.

---

## Phase A — De-risk the core bet (no new user surface)

### A1. Model→CRDT granularity probe *(riskiest assumption — do first)*
Wire the annotation store to a Yjs doc behind a **local** provider (`y-indexeddb` or in-memory) on
the seed exhibit. **No server** — this is the whole point: the riskiest question is answerable
entirely client-side.
- **Answers:** is the mergeable unit the *annotation* (coarse → a `Y.Map` keyed by annotation id,
  Annotorious wires straight to it) or a *field within* one (geometry/body/emphasis → fine-grained)?
- **Static payoff:** an IndexedDB-backed live store is a legitimate durability/undo upgrade even
  single-player.
- **Kill/gate:** if annotation-granular merge doesn't hold and it forces a model rewrite, **park**
  and record the finding — the coarse path was the bet's feasibility.
- **Ledger:** `ledgers/PROBE-collab-crdt-mapping.md` (assumption | riskiest? | probe | result |
  verdict — same template as `PROBE-publish-to-web.md`).

### A2. Stable-ID audit
Audit the model so **every mergeable unit** (annotation, reading, section, object) carries a stable,
globally-unique id — never an array index or an ephemeral/derived key.
- **Static payoff:** stable deep links, durable embed anchors, citable fragment URLs.
- **De-risks:** a CRDT keys every concurrent edit by id; an unstable id is a silent merge corruption
  waiting to happen. This is a prerequisite for A1's `Y.Map`-keyed hypothesis, so it feeds A1.

---

## Phase B — Prep the model (static value first, collab prereq second)

### B1. Populate the identity dark-data
`creator?: unknown` is modeled but never populated (`wadm/types.ts:142`); Reading has no owner
(`model.ts:144`). Populate authorship/ownership at authoring time.
- **Static payoff:** attribution/provenance shown in published exhibits — a real feature for the
  scholar/curator persona.
- **De-risks:** collab needs "who did this" on every op; retrofitting authorship onto existing data
  is far worse than capturing it from the start.
- **Note:** already handed to a tend loop (Direction 2 DARKDATA / Direction 1 identity cluster) —
  this worklist *cites* that loop, doesn't re-open it. Confirm status before starting.

### B2. Make the merge semantics explicit and tested
Direction 1's async merge UI is built and `resolveConflict` + the `model/carry.ts` carry sentinels
already encode field-level merge decisions. Harden these into an **explicit, test-covered spec** of
"what merges how."
- **Static payoff:** the async zip-round-trip merge (teacher merges student zips) gets a regression
  net it currently lacks.
- **De-risks:** this spec *is* the contract any real-time CRDT must honor. Async merge ≠ live merge,
  but the field-level semantics are the same — write them down once, both products consume them.

---

## Phase C — Prep the seams (static value first, collab prereq second)

### C1. Read-only HTTP `Filesystem` backend (the fourth backend)
Add a read-only HTTP-backed `Filesystem` implementation — the follow-up already flagged in
`untrusted-archive-open-seam.md` and `render-core-data-integrity.md` ("would require a new
`Filesystem` HTTP backend"). Read-only, so it stays fully static/local-first.
- **Static payoff:** the viewer reads a hosted published tree *directly* through the same
  `read`/`spine` stack instead of the current separate hosted-tree validator — folds a duplicated
  seam back into one.
- **De-risks:** this is the exact socket the eventual Archie+ server plugs a *writable* backend into.
  Building the read half now, statically, halves the fork's server work.
- **Guard:** preserve the data-integrity rules across the network boundary — absent-vs-failed must
  survive 5xx/timeout (not just 404); corrupt≠empty per-item tolerance holds over HTTP.

### C2. render-core fork-readiness (prereq 0, without forking yet)
Sharpen render-core's **public API boundary** so Archie+ (a separate repo) could consume it without
copying it. Decide the sharing mechanism (published package / submodule / spanning monorepo) and
tighten exports to a crisp surface. Do **not** fork the repo yet.
- **Static payoff:** a crisper public API is better hygiene for the current apps regardless.
- **De-risks:** prevents the model drift that would otherwise silently defeat `model/carry.ts`'s
  compiler-guarded carries — those guards only protect two products that compile against the *same*
  model, not a copy.

---

## Phase D — Max the envelope without a server

### D1. Local multi-tab live sync (the static-app real-time demo)
Sync two browser tabs (or P2P peers) on one exhibit live, **entirely client-side** — `BroadcastChannel`
/ `y-indexeddb` for same-origin multi-tab, or `y-webrtc` for peer-to-peer (a minimal signaling
server only, no app backend).
- **Static payoff:** Archie becomes *genuinely real-time-collaborative across tabs/peers* while
  shipping zero backend — the envelope pushed as far as it goes without moving off static.
- **De-risks:** exercises A1's CRDT mapping, B2's merge spec, and A2's ids together against real
  concurrent edits — the highest-fidelity rehearsal of Archie+ obtainable without a server.
- **Gate:** only meaningful after A1 verdicts *pursue*; if A1 parks, D1 parks with it.

---

## Decision gate — does the spine become an op-log?

The spine is already an append-only history log (`spine/persist.ts` pages + index) — spiritually
close to a CRDT update stream, but snapshot-versioned, not op-based-concurrent. **Whether to evolve
it toward op-granular is a gate, not a fixed item:** A1's granularity verdict decides it. If
annotation-granular merge holds, the spine likely needs no op-level surgery (the CRDT layer sits
beside it, snapshotting into it). If field-level merge is required, the spine evolves — and that is
a bigger bet that should get its own probe. Do not pre-build op-log machinery before A1 answers.

## Sequencing

A2 → A1 (A1 needs stable ids). A1 gates D1 and the spine decision. B1/B2/C1/C2 are independent of
A1 and can run in parallel — each ships static value on its own, so none waits on the probe. Start
with **A1** (+ the A2 it depends on): it is the riskiest assumption and the cheapest to answer, and
every later item's worth depends on its verdict.
