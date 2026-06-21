# Reach + Reader + Moat Arc — Implementation Strategy

> Compiled from the locked design corpus: `2026-06-20-reach-reader-moat-arc.md` (the plan), decisions Q-3/Q-4/Q-5/Q-7/Q-8/Q-9/Q-10, ADR-0014/0016, and the grilling pass. This is the *method and sequence*, not a task list — each phase's tasks live in the plan.

## Ordering principles (derived, not invented)

1. **Sources before projections.** The search index (`search-index.ts`, headless, testable) is the *source*; the overlay UI (`SearchOverlay.svelte`) is its *projection*. Build the index first — a UI over a non-existent index is rework. Likewise the JSON-LD *field-mapping* (pure) precedes the *head emission* (wiring).
2. **Adopted/specifiable before invented.** SEO emission and the search index are **greenfield-specifiable** (a test corpus defines "done"). The overlay's *interaction* and the a11y *focus model* carry the only real UX judgment — they gate on review, not a unit test. Ship the specifiable cores first; the judgment-bearing surfaces sit on top of them.
3. **Highest-assumption-load first.** The keystone is **`arriveAtNote(noteId)` + reactive re-selection** in `ExhibitView`/`Reader`/`NarrativeReader` — the seam the overlay (Q-4) and keyboard activation (Q-5) both depend on. It's the hardest to retrofit and the thing most code projects off. It is the **first concrete move**.

## Phases (serial at the phase level)

| Phase | Builds | VALIDATES | Does NOT validate | Boundary |
|---|---|---|---|---|
| **A0 — Selection seam** | `arriveAtNote()` extraction + reactive `selected` sync | A note can be selected imperatively (not just on hash-arrival) and the canvas `fitBounds` follows | Any UI that calls it | The seam is callable + tested before overlay/a11y consume it |
| **A1 — Specifiable cores** | SEO head/JSON-LD/sitemap (Task 2); minisearch index builder (Task 3) | Pages carry valid og/JSON-LD; index returns correct docs for query+tags | That a human can *find* anything (no UI yet) | Both have green test corpora |
| **A2 — Judgment surfaces** | Finder overlay (Task 4); a11y/keyboard pass (Task 5) | A reader can discover a note in both modes; keyboard+SR operate the index | Tiling | Overlay drives the A0 seam; a11y review passes |
| **B0 — Tiling spike** | bundle measure + OffscreenCanvas DZI probe (Task 1) | Whether *web* generation is feasible within budget | Tiling-as-feature (desktop/IIIF fill the same descriptor, Q-10) | An explicit GO/NO-GO line |
| **B1 — Gate + build** | go/no-go (Task 6); slicer + `tileSource` wire (Task 7, GO only) | Drop-an-image → in-browser deep-zoom | — | Gated on B0 |

A0–A2 ship as a unit independent of B. B0 can run concurrently with A (no shared files).

## Reducibility classification

| Work | Kind | Donor / corpus | Terminus |
|---|---|---|---|
| JSON-LD field mapping (Task 2) | Greenfield-specifiable | corpus = the field-presence assertions (Step 1) | mechanical after corpus |
| sitemap.xml (Task 2) | Greenfield-specifiable | corpus = URL-list assertion | mechanical |
| minisearch index (Task 3) | Greenfield-specifiable | corpus = query→doc-id assertions | mechanical |
| `arriveAtNote` seam (A0) | Adopted-by-extraction | donor = `ExhibitView:64–89` | mechanical (extract + 1 reactive effect) |
| Finder overlay interaction (Task 4) | **Invented** | no donor — "can a reader discover + jump" | **human/review gate** |
| A11y focus model (Task 5) | **Invented** | no donor — keyboard-walk is a judgment, not a unit assert | **human/review gate** (lightpanda assists) |
| OffscreenCanvas slicer (Task 7) | Greenfield-specifiable *after* spike | corpus = tile-count/descriptor for known size | mechanical after B0 |

**Consequence:** the specifiable items (Task 2, Task 3, A0) are safe to execute fast and verify by test. The two **invented** surfaces (Task 4 overlay, Task 5 a11y) must pass a review gate — green tests alone don't certify "a reader groks it."

## Deceptively-simple items (need a corpus / care before a small model touches them)

- **`arriveAtNote` reactive re-selection (A0).** Sounds like "call the existing handler." It is *not*: `Reader.selected` is `$state(initialSelected)` set once (`Reader.svelte:97`); no effect syncs later changes. Re-selecting an already-mounted note needs a new `$effect` (sync `initialSelected`→`selected` on change) **plus** confirmation that `fitBounds` keys off `selected`, not mount. Corpus: (1) select cross-object → object switches + fits; (2) select within current object → re-fits without remount; (3) select same note twice → idempotent.
- **Search scope across readings (Task 4).** A result in an *inactive* reading must surface and, on select, flip `activeReading` (Q-4) — reuse `ExhibitView:76`'s discovery, don't reimplement. Corpus: a note that exists *only* in a non-active reading is findable and lands correctly.
- **Markdown-strip for the index (Task 3).** Note bodies are markdown; `snarkdown` is render-only. Naive strip can leak `[text](url)` or `#` into the index. Corpus: a note with a link + heading indexes by its *prose*, not its markup.
- **Filter combination (Task 4).** Tags OR, query ANDs the union (Q-4) — off-by-one logic. Corpus is the Task 4 Step-1 test.

## Mechanical execution system

- **Decomposer (this strategy + the plan):** already done — tasks are leaf-sized with pre-written test intent and donor refs.
- **Wave-builder:** A0 (1 file-pair) → A1 (Task 2 ‖ Task 3, disjoint targets) → A2 (Task 4 then Task 5, shared Svelte files → serial) ‖ B0 (disjoint). 
- **Executor:** per-task TDD — write the corpus assertion, red, minimal green, commit.
- **Verifier:** per wave, run the app build + the keyboard-walk; at phase close, the **code-review** gate (the two invented surfaces especially).
- **UI surfaces** (Task 4, Task 5) attach `frontend-design`; the overlay cites the reader's existing token/spacing idiom (match `Reader.svelte`).

## Enumeration strategy (just-in-time)

Enumerable now: A0, Task 2, Task 3 (corpora writable today). Discovered later: Task 7's leaf tasks (only after B0's prototype defines the descriptor shape) and any SNAG from the A0 seam touching `fitBounds`.

## First concrete move

**Extract `arriveAtNote(noteId)` in `ExhibitView` and make `Reader`/`NarrativeReader` re-select reactively (A0).** Everything else — the overlay's `select`, keyboard activation of the index — projects off this seam. Build and test it first; then Task 2 / Task 3 fan out in parallel behind it.
