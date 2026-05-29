# STEP-6 — Fix the ADR-0007 readings drift in `readPublishedExhibit` (`site.ts`)

> Implementation-ready plan. Synthesis landing-order **step 6**. NOT step 4 (the domino).
> Every claim below was verified against code on 2026-05-28; `file:line` are real.

## 1. Objective

Make `readPublishedExhibit` (`packages/render-core/src/publish/site.ts:329`) read and return the
Readings registry + per-reading annotation pages it currently omits, **aligning the in-memory
PREVIEW read path with ADR-0007** (which made Readings first-class) and with the two live readers
(`portable.ts`, viewer `published.ts`) that already read them. Synthesis step 6.

## 2. Why this is a deliberate / separate change

This is a **behavior change to the published-output read path**, not a refactor, and it is held
apart from the step-4 domino for one specific reason the reviewers baked in:

- The domino (step 4) is **behavior-preserving by contract** — it unifies the three readers behind
  `readExhibitTree(source, transform?)` while keeping `site.ts`'s adapter *ignoring* readings exactly
  as today, so the preview path does **no new I/O** (`thermo-render-core.md:74-79`, synthesis:46-48).
- This step is the opposite: it **adds new I/O and new failure modes** to a path that previously had
  none (reading `readings.json` + N per-reading `annotations-{rid}.json` files per object). New code
  paths, new "file absent" branches — exactly the risk profile the easy pass excludes.

Smuggling (b) into (a) would make the domino non-behavior-preserving and break its guard
(`published.test.ts:54`). The synthesis is explicit: "do not smuggle it into the refactor"
(synthesis:46-48), and lists it "**Separately, on its own change**" (synthesis:133).

## 3. Current state (verified)

**The reader that drifts** — `readPublishedExhibit` (`site.ts:329-346`). It reads `manifest.json`,
derives `objects`/`canvasIdByObject`/`sections`, loops objects reading **only** `annotations.json`
(the base page) into `annotationsByObject`, and returns `PublishedExhibitData`. It never opens
`readings.json` and never reads any `annotations-{rid}.json`. The omission is self-documented:
`portable.ts:5-9,26,132` ("the field `readPublishedExhibit` omits").

**Result type** — `PublishedExhibitData` (`site.ts:310-321`): `{slug,title,summary?,objects,
annotationsByObject,sections,canvasIdByObject}` + `RightsFields`. **No** `readings` /
`readingAnnotationsByObject`.

**The two non-drifting siblings (the ~30 LOC to mirror):**
- `portable.ts` — `PortableExhibit extends PublishedExhibitData` adds exactly
  `{ readings: Reading[]; readingAnnotationsByObject: Record<string,Record<string,W3CAnnotation[]>> }`
  (`portable.ts:27-30`). Read logic at `portable.ts:148,150-165`:
  `readings = readJsonOptional<Reading[]>(exDir,"readings.json") ?? []`; then per object, if
  `readings.length>0`, loop readings reading `annotations-{r.id}.json` via `readJsonOptional`,
  `perReading[r.id] = page?.items ?? []`. (Portable additionally blob-rewrites bodies — NOT part of
  this step.)
- viewer `published.ts:139-176` (HTTP) — identical algorithm over `fetch`: `readings` via
  `fetchJsonOptional` (`:154`), per-reading pages via `fetchJsonOptional` (`:161-168`). The viewer's
  `PublishedExhibit = PortableExhibit` (`published.ts:18`).

**The on-disk shape this reads back** (written by `publishLibrary`, `site.ts:186-237`) — confirms the
read contract:
- `{slug}/readings.json` — the raw `Reading[]` registry, written **only when `readings.length>0`**
  (`site.ts:189,192`). Absent on a base-only exhibit → optional read returns `[]`.
- `{slug}/canvas/{objId}/annotations.json` — base page (always written, `site.ts:225`).
- `{slug}/canvas/{objId}/annotations-{rid}.json` — one per registry reading, **always written when
  readings exist**, possibly empty-items (`site.ts:230-235`). So when `readings.length>0` every
  `annotations-{rid}.json` is present; `readJsonOptional` tolerates absence regardless.

**`Reading` type** — `model/model.ts:121-130` `{id,name,description?,colour?}`; re-exported from
`@render/core` (viewer imports it `published.ts:11`).

**Consumers of `readPublishedExhibit` / `PublishedExhibitData`** — searched `apps/` + `packages/`:
the **only** caller is `preview.test.ts:28,53`. **Zero production consumers** (Studio's Preview does
not call it today — grep of `apps/studio/src` finds no reference). This is why the drift is *latent*
(`thermo-render-core.md:104`): the field is never produced, so nothing renders a preview legend yet.

## 4. Target design

Make `readPublishedExhibit` return the **superset** type and read readings, mirroring `portable.ts`
minus the blob rewrite. Two viable shapes — recommend **(A)**:

**(A) Return `PortableExhibit` directly (recommended).** `PublishedExhibitData` stays the base
interface; `readPublishedExhibit` returns `PortableExhibit` (already `extends PublishedExhibitData`,
`portable.ts:27`). One canonical superset, no third name. After step 4 lands, `site.ts` and
`portable.ts` both become adapters over `readExhibitTree` returning this same superset — so choosing
the superset now **reduces** step-4 rework (see §sequencing).
- Import via **`import type`** (literal — not a value import): `import type { Reading } from
  "../model/model.js"` and `import type { PortableExhibit } from "./portable.js"`. This matters:
  `portable.ts` already imports `PublishedExhibitData` from `site.ts` (`portable.ts:23`), so a *value*
  import back from `portable.ts` would create a **real runtime cycle**. `import type` is erased at
  compile (TS `verbatimModuleSyntax`/ESM-safe) → type-only cycle, harmless. If the bundler still
  rejects it, fall to (B).

**(B) Define the fields inline on `site.ts` (fallback if cycle bites).** Add
`readings: Reading[]; readingAnnotationsByObject: Record<string,Record<string,W3CAnnotation[]>>` to
`PublishedExhibitData` itself (or a new `PublishedExhibitWithReadings`). Avoids importing from
`portable.ts`. Costs one more type name.

This is **not introducing an abstraction** — no new seam, no ≥2-variant discriminator needed. It is
copying ~12 lines of read logic that already exist twice, into the third reader, to conform to
ADR-0007. (The *de-duplication* of those copies is step 4's job, explicitly — not this step's.)

**New read logic inside `readPublishedExhibit` (mirror of `portable.ts:148,157-164`):**
```
const readings = (await readJsonOptional<Reading[]>(exDir, "readings.json")) ?? [];
// in the per-object loop, after reading base annotations.json:
if (readings.length > 0) {
  const perReading: Record<string, W3CAnnotation[]> = {};
  for (const r of readings) {
    const page = await readJsonOptional<{ items?: W3CAnnotation[] }>(objDir, `annotations-${r.id}.json`);
    perReading[r.id] = page?.items ?? [];
  }
  readingAnnotationsByObject[obj.id] = perReading;
}
```
`site.ts` has **no `readJsonOptional` today** — add the 5-line helper mirroring `portable.ts:48-54`
(try `readJson`, catch → null). Return `{ ...existing, readings, readingAnnotationsByObject }`.

## 5. Behavior changes

**One intended behavior change** (NOT behavior-preserving):

1. `readPublishedExhibit` now performs **additional file reads** (`readings.json` + one
   `annotations-{rid}.json` per object per registry reading) and returns two new populated fields
   (`readings`, `readingAnnotationsByObject`). On a base-only exhibit both reduce to `[]` / `{}` (no
   new files exist → optional reads return null/empty), so base-only output is structurally
   unchanged except the two new empty fields appear. On a readings-bearing exhibit, the preview path
   now surfaces the legend data it silently dropped before.

**New failure modes introduced** (flag, per Pre-Ship gate): a malformed `readings.json` or
`annotations-{rid}.json` now throws inside `readPublishedExhibit` where previously those files were
never opened. Mitigation: `readJsonOptional` swallows *absence* (catch→null) but a *present-but-
corrupt* file still throws on `JSON.parse` — this matches `portable.ts`/viewer behavior exactly
(intentional parity, not a new hazard relative to the live readers).

No write-path change. `publishLibrary` is untouched.

## 6. Blast radius & test impact

**⚠️ DISCREPANCY WITH THE BRIEF/SYNTHESIS — verified and corrected.** The task prompt and
synthesis (`THERMO-NUCLEAR-SYNTHESIS.md:150`) predict this breaks `site.test.ts` and
`voynich-readings.test.ts`. **Code says otherwise.** Both of those files test **`publishLibrary`
(the WRITE path) only** — `site.test.ts` imports `{publishLibrary, libraryToZip, loadLibrary}`
(`:2`, never `readPublishedExhibit`); `voynich-readings.test.ts` imports `{publishLibrary}` (`:2`)
and asserts on-disk written files. This step changes only the **READ** path. **Neither file will
break.** The actual guard on `readPublishedExhibit` is **`preview.test.ts`** (the sole caller,
`:3,28,53`) — that is the file whose assertions this step touches.

**Tests that guard `readPublishedExhibit` and what changes:**

- `preview.test.ts` (`packages/render-core/src/publish/preview.test.ts`) — **the file to update.**
  Both existing `it` blocks (`:25,38`) assert on `title/objects/canvasIdByObject/annotationsByObject`
  only. Those assertions **still pass unchanged** (the new fields are additive). The correct update
  is to **ADD assertions** proving the new behavior, NOT to change existing ones. New expected
  behavior to pin (using a readings-bearing fixture like `voynich-readings.test.ts`'s `exV`):
  - `expect(ex.readings.map(r => r.id)).toEqual(["cipher","hoax"])` — registry surfaced.
  - `expect(ex.readingAnnotationsByObject.o1?.cipher?.length).toBe(1)` — per-reading page read back.
  - `expect(ex.readingAnnotationsByObject.o1?.hoax?.length).toBe(0)` — empty page tolerated.
  - On the existing base-only fixtures: `expect(ex.readings).toEqual([])` and
    `expect(ex.readingAnnotationsByObject).toEqual({})` — base-only reduces cleanly.
  This is a **correct test update** (the behavior intentionally changed), **not fixture-masking**:
  no shared fixture is edited; the new fixture is local to `preview.test.ts` (or a small literal),
  mirroring how `voynich-readings.test.ts` builds its own `exV`/`logV` inline.

- `portable.test.ts:67` (render-core) contains a **comment** asserting the field
  "`readPublishedExhibit` omits". After this step it is **stale**. Update it (and the
  `portable.ts:5-9,26,132` doc comments) to "mirrors" rather than "omits" — comment-only, no
  assertion change; `portable.test.ts` tests `portable`, not `site`.
- **`apps/viewer/src/published.test.ts:54` is CROSS-SUBSYSTEM (stay-in-lane flag).** Its `:54`
  comment also says "the readings field core's `readPublishedExhibit` omits" and is now stale, but it
  lives in `apps/viewer` — outside this render-core change's scope. **Do not silently edit it here.**
  Either coordinate the one-line comment fix with the viewer reviewer/owner, or defer it as a noted
  follow-up. The viewer *assertion* (`Array.isArray(ex.readings)`) is unaffected; only the comment is
  stale, so deferral is safe.

**Fixture rule check (project rule, `_PLAN-BRIEF.md:20`):** no shared fixture is modified. The new
preview assertions use a fixture local to `preview.test.ts`. Rule **not triggered**. (Contrast: the
forbidden move would be silently editing a shared `voynich.ts`/`sample-data.ts` to hide a regression
— we do neither.)

**No coverage:** the in-Studio visual Preview panel (LV-C2, the human gate per `preview.test.ts:11`)
is browser-verify-owed and has no automated test — but since no production code calls
`readPublishedExhibit` yet, there is no runtime consumer to regress this session.

**Verification commands** (use **fnm-managed Node v24** — system v20 breaks pnpm/corepack in this
workspace, per project memory; `fnm use 24` first):
```
pnpm --filter @render/core test src/publish/preview.test.ts   # the one that changes
pnpm --filter @render/core test src/publish                   # all 6 publish tests stay green
pnpm --filter @render/core typecheck                          # superset-return type check (cycle)
pnpm --filter @render/core test                               # full 402-test sweep
```

## 7. ADR alignment

- **ADR-0007** (`docs/adr/0007-readings-as-annotationpages.md`) — this step **conforms**, does not
  contradict. ADR-0007 makes a Reading a first-class IIIF `AnnotationPage` grouped by an
  `AnnotationCollection`, and the heads projection emits "N pages per Object partitioned by reading +
  a base page" (Consequences §"The spine holds"). `publishLibrary` already WRITES that shape
  (`site.ts:186-237`, guarded by `voynich-readings.test.ts`); `readPublishedExhibit` was the one
  reader that did not READ it back. Closing the gap **completes** ADR-0007's read↔write symmetry for
  the preview path. This is the **intended drift-correction** the review flagged
  (`thermo-render-core.md:97-109` Finding 2), not new design.
- **ADR-0010** — explicitly *acknowledges* this drift as owed debt ("the portable reader
  re-implements the readings read ~30 LOC", synthesis:36). Fixing the omission here is paying down
  that sanctioned debt on the third reader; the full de-duplication is step 4's `readExhibitTree`.
- No ADR is contradicted. No ADR requires `readPublishedExhibit` to *omit* readings — the omission
  was never a decision, only an unfinished read path.

## 8. Implementation steps

Single phase (one source file + one test file; ≤5 files). Verify gate at the end.

**Phase 1 — surface readings in the preview reader.**
1. `site.ts` — add `readJsonOptional<T>` helper (mirror `portable.ts:48-54`).
2. `site.ts` — choose return shape (A: import `PortableExhibit` type from `./portable.js`,
   `Reading` from `../model/model.js`, return `Promise<PortableExhibit>`; or B fallback: extend
   `PublishedExhibitData` inline). Read `readings.json` (optional) before the object loop; inside the
   loop, after the base page read, populate `readingAnnotationsByObject` when `readings.length>0`
   (mirror `portable.ts:157-164`, **no** blob rewrite). Add `readings, readingAnnotationsByObject` to
   the return literal.
3. `site.ts` / `portable.ts` doc comments — change "omits" → "mirrors" (`site.ts:323-328`,
   `portable.ts:5-9,26,132`).
4. `preview.test.ts` — add the new assertions from §6 (registry surfaced, per-reading pages read,
   base-only reduces to empty). Keep existing assertions intact.
5. `portable.test.ts:67` / viewer `published.test.ts:54` — update the stale "omits" comments.

**Verify gate:** run all four commands in §6. All 6 publish tests + full sweep green; typecheck
clean (resolve the type-only cycle — fall to shape B if the bundler rejects A).

## 9. Acceptance criteria

- `readPublishedExhibit` returns populated `readings` + `readingAnnotationsByObject` for a
  readings-bearing exhibit, and `[]` / `{}` for a base-only one.
- The values **structurally match** what `loadPortableExhibit` returns for the same library minus the
  blob-URL rewrite (parity with the live reader).
- `pnpm --filter @render/core test src/publish` — all 6 files green; `preview.test.ts` carries the
  new assertions.
- `pnpm --filter @render/core typecheck` clean.
- No shared fixture modified; no `publishLibrary` write-path change.
- Doc comments and stale test comments no longer claim the field is "omitted".

## 10. Rollback

Self-contained — revert the `site.ts` diff (the helper + the readings read + the return-type change)
and the `preview.test.ts` additions. `git revert <commit>` or `git checkout -- packages/render-core/
src/publish/site.ts packages/render-core/src/publish/preview.test.ts` (plus the comment edits).
Because there are **zero production consumers** of `readPublishedExhibit`, rollback has no runtime
blast radius. If step 4 has since landed on top, rollback is the `readExhibitTree` adapter wiring
instead — sequence rollback after step 4's, not before.

---

## Sequencing — #6 vs #4 (recommended: **land #6 BEFORE #4**)

The synthesis lists #6 last but does not fix the order relative to #4. The decisive constraint is in
**#4's own design signature**, not a line count:

- **The domino's unified reader returns the superset unconditionally.** The review specifies
  `readExhibitTree(src, slug, transform?) → PublishedExhibitData & {readings,
  readingAnnotationsByObject}` (`thermo-render-core.md:47`). There is **no "skip readings"
  parameter** — the reader always reads readings. Therefore routing `site.ts` through it
  *necessarily* makes the site/preview path read readings.
- **Consequence — #4 cannot be honestly behavior-preserving for site unless #6 has already landed.**
  #4's contract is "(a) consolidation is behavior-preserving; (b) the ADR-0007 fix is separate"
  (`thermo-render-core.md:74-79`, synthesis:46-48). If site *today* omits readings and #4 runs first,
  then either #4's unified reader silently starts surfacing readings on the preview path (that IS
  behavior change (b), smuggled into (a) — the exact thing the reviewers forbid), **or** #4 must bolt
  a site-only "ignore readings" carve-out onto its otherwise-uniform reader (defeating the
  consolidation). Both violate the (a)/(b) separation.
- **#6-first dissolves the conflict.** Once #6 lands, all three readers already read readings, so
  #4's unconditional-superset reader *preserves* site's (now-readings-bearing) behavior — (a) is
  genuinely behavior-preserving and (b) is already done as its own flagged change. The (a)/(b) split
  the reviewers demanded only holds in this order.
- **Type choice reinforces it:** §4 option (A) returns the superset now — exactly the type
  `readExhibitTree` will return — so #6 pre-aligns #4's type surface.

**Recommendation: land #6 first.** It is the only ordering under which #4 is honestly
behavior-preserving for site (the reviewers' own (a)/(b) constraint forces this; churn is secondary).
The ~12 lines #6 adds to `site.ts` are deleted by #4 when site becomes a `readExhibitTree` adapter —
expected and trivial. (If scheduling forces #4 first, #4 must carry a site-only "ignore readings"
branch to stay behavior-preserving, and #6 then deletes it — correct but it muddies #4's clean
consolidation.)
