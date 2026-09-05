# Review implementation

Status: all thirteen review findings implemented; product and architecture recommendations implemented or prepared as documented below. Source: [review](REVIEW-2026-09-05.md). User authorized the work and invoked codebase-design. No commits, deployment, outreach, or tracker mutations were made.

## Findings closed

| Finding | Change | Regression evidence |
|---|---|---|
| S1 | Serialized save snapshots retain concurrent dirty notes and restore failed writes; queued retry waits for started writes | `session-save.test.ts`, including edits and merges during I/O |
| S2 | Archive/folder adoption refuses reported incomplete annotation history before returning an adoptable library | `publish/site.test.ts`; source bytes remain unchanged |
| S3–S4 | Shared page store validates each page inside recovery; only classified not-found means absence | `history-recovery.test.ts`, paired annotation/structure fixtures |
| S5 | UndoWire automatically separates actions, coalesces typing bursts and groups synchronous imports | Production-wire tests and real Studio Undo/Redo scenarios |
| S6 | An explicit edit after Undo carries the visible revision into a new descendant; restored deletion can be edited | Undo manager tests plus two save/reload browser scenarios |
| S7 | Fake OPFS iterates `FsDirectory.entries()` | Workspace TypeScript passes |
| S8 | Semantic text/accent tokens darkened; storage-footer opacity removed | Actual axe: zero contrast violations on Studio Library, overview and 390px Viewer gallery |
| C1 | One resource policy covers covers, thumbnails, object media, prose, note cards, sheets and narrative; policy change tears down current media | Built embed browser interception observes zero prohibited remote requests |
| C2 | Reading-only targets and same/cross-object search select the owning interpretation | Tests over real published bytes and actual WAV browser fixture |
| C3 | Whole-recording citations open their note without requiring a time cue | Published-byte regression and paused actual media browser check |
| C4 | Every new target/policy invalidates old work; cancellation reaches lazy imports and pending OSD opens | Deferred manifest/import/mount regressions and real built-browser checks |
| C5 | Shell-owned address function retains source on links, citations, prose and locus; source changes reload the library session | Foreign slug-collision fixture survives reload, source change and Back |

## Recommendations delivered

- Save status names the destination; examples explicitly say edits are not kept. Authored titles use two lines; filename/identifier suffix handling remains intact.
- Mobile summary expands according to rendered overflow. At 390×844, the first exhibit title moved from roughly y=819 to y=597, fully visible in the first viewport. This is geometry evidence, not a user-task success rate.
- [Module contracts and decisions](DESIGN-review-modules-2026-09-05.md) record persistence, commands, addresses, resources, lifecycle and writable Adapters. Undo remains session-only; the toolbar now explains reopening behavior.
- [Delivery capability matrix](../docs/CAPABILITIES.md) is linked from README.
- [First-use protocol and feature proposal template](PRODUCT-validation-2026-09-05.md) define activation, storage/undo comprehension, recipient citation success, mobile discovery, and the state combinations a future feature adds. The initial scholar/curator cohort remains a hypothesis.
- Legacy REST publishing has no production caller and is deprecated, with its branch endpoint corrected. Live Pages setup handles transport/body failure without converting a successful push into failure. Mixed-type filesystem writes now have one tested append contract. Note-only publication changes default generation. Empty live stores release stale exhibits.
- Redo now preserves action stops. Browser tests were updated for the already-shipped object-scoped Reading legend and its introduction dialog. The Studio loop fixture uses Playwright's fresh context instead of deleting OPFS during initial app saves.
- Reader payload measurement exposed 223KB raw exhibit arrival against the unchanged 220KB budget. Loading the Reading introduction only when opened reduced it to 185KB. The measurement runner now accepts the build's mounted base via `READER_BASE`.

## Validation

Evidence is copied into [implementation-evidence-2026-09-05](implementation-evidence-2026-09-05/). Commands below use the repo's installed Node/pnpm environment. Browser listeners and subprocess checks required sandbox escalation; approved local runs completed.

| Gate | Result |
|---|---|
| Final `pnpm test` | 3,708 tests pass across 274 files: core 1,623; mount 224; Svelte 15; embed 230; Viewer 285; Studio 1,331 |
| Workspace TypeScript | Pass |
| Studio `check`, Viewer `check:svelte` | Zero errors and warnings |
| Full Studio Playwright gate | 36/36 pass on dedicated local server |
| Full built Viewer Playwright gate | 162/162 pass; final lazy introduction change additionally passes all 30 affected AV/note/source browser cases and 285 Viewer unit tests |
| Built embed recipes | 54/54 smoke assertions plus six new browser contract scenarios pass |
| Contrast | Zero sampled axe contrast violations; screenshots inspected |
| App and embed bundle budgets | Pass without widening baselines; generated embed output synchronized to root `dist/` |
| Reader payload budgets | Gallery 171/200KB; both measured exhibit arrivals 185/220KB; object-open extra 1,161/1,250KB; zero arrival media requests |
| Existing 70-object scale drill | 6/6 pass; all 70 assets survive import/reload; three-card library ~0.6s, 30-object overview ~0.3s on this machine |
| Desktop | Offline locked Rust check; current packaged frontend/native debug build; isolated native boot and initial persistence pass. Exact final refresh in desktop evidence log |
| `git diff --check` | Pass |
| Documentation audit | Index regenerated; links, scopes, pointers, evidence paths, mirrors, accretion and coverage pass. Full audit still reports existing process-hub date, tracker drift, three undated legacy ledgers, and untracked review documents. No allowlist weakened or unrelated history rewritten |

The first broad browser runs exposed stale Reading test expectations and an OPFS setup race, then transient dev-stack boot failures while checks/builds overlapped. Final gates ran on dedicated stable servers. The first reader benchmark used the wrong mounted base; the corrected base exposed the actual payload overage, which was fixed before the passing run. Earlier failures are not counted as clean runs.

## Limits and remaining external work

- The first-use study has not run. It requires consenting participants; no outreach was authorized or sent. A runnable protocol and observation sheet are ready.
- Desktop smoke proves packaged origin and initial native persistence. It does not establish native media import, edit/reopen, keyring authentication, or actual remote publication. No external deployment was performed.
- The 70-object drill is a coarse release exercise, not a large-library memory ceiling. Its optional annotation seeding skipped because its older drawing selector did not resolve; the six media/scale assertions passed. Dedicated Studio browser tests cover note authoring and persistence.
- In-place folder publication remains ordered, not a whole-library atomic snapshot. Corrupt adoption refuses incomplete history; it does not provide a new recovery editor. Existing merge-contract open questions and temporary undo semantics remain explicit constraints.
- This run does not certify Firefox/Safari or all accessibility criteria. It does not invent product-conversion targets or user-study results.

Existing user edits to README, DIVERGENCES and the earlier TEND ledger were preserved. README only gained the capability-matrix link from this implementation.
