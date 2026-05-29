# STEP 5 — Extract a `library-meta` store from `App.svelte`

_Plan doc (implementation-ready). Author: planning pass over the thermo-nuclear review. Date: 2026-05-29.
Source of truth confirmed against code at `apps/studio/src/App.svelte` + `store.ts` (line numbers below are verified, not from the review)._

## 1. Objective

Synthesis **step 5** (first concrete cut of POLISH **Q10** god-component decomposition): extract a `library-meta.svelte.ts` store exposing `patchLibrary` / `patchExhibit` / `patchObject` (plus awaitable `addExhibit` / `appendObject` and set-only `setMeta`), collapsing the ~14 hand-rolled `{...exhibits.map(...)}; persistLibrary()` copies in `App.svelte` into thin call sites, removing ~120 lines, and isolating the persist trigger to **one owner**.

## 2. Why this is a deliberate / separate change

The review (`thermo-studio.md §3.1`, synthesis line 132) ranks this as the **lowest-risk** Q10 cut and explicitly orders it **before** `useBinding` / `useNoteEditor`, because `libraryMeta` is **pure authored data** — no OpenSeadragon imperative lifecycle, no Annotorious, no `selected`/`editing`/`rev` rune entanglement. The risk that keeps it separate is narrow and specific:

- **Cross-module rune reactivity.** The current code mutates `libraryMeta` by **reassignment** (`libraryMeta = { ...libraryMeta, ... }`). Svelte 5 **cannot export reassigned `$state` across module boundaries** (verified: `svelte` docs, `$state > Passing state across modules` — "you can only export that state if it's not directly reassigned"). Moving the rune into a `.svelte.ts` module therefore forces a shape change: the store owns a **non-reassigned container** (`export const store = $state({ meta })`) and mutates `store.meta = next` (property write, allowed) so App's `$derived(currentExhibit)`, the child props (`exhibits={…}`), and the publish builders keep seeing live values. Getting this idiom wrong silently breaks reactivity with no test to catch it (studio has zero tests). That is why it is a deliberate cut, not part of the easy delete pass.
- **The `touchBinding` seam.** `persistLibrary()` is `saveLibraryMeta(meta)` **+ `touchBinding()`** (`App.svelte:176`). `touchBinding` mutates `bindingDirty` — **binding state, owned by the NEXT cut (`useBinding`)**. The store must persist (own half 1) but must NOT swallow `touchBinding` (own half 2). This carve-line is the reason the cut is scoped, not greedy.

## 3. Current state (verified)

**Persist mechanism — OPFS** (not IndexedDB, not `handles-db.ts`): `store.ts:106 saveLibraryMeta(meta)` writes `{PROJECT}/library.json` via the OPFS-backed `FsaFilesystem` (`store.ts:15-21, 105-113`). `loadLibraryMeta()` reads it (`store.ts:94-103`). `store.ts` is **rune-free** (pure types + OPFS I/O — confirmed: zero `$state`).

**The owning state (App-local):**
- `App.svelte:68` — `let libraryMeta = $state<LibraryMeta>({ exhibits: DEFAULT_EXHIBITS });`
- `App.svelte:76` — `const currentExhibit = $derived(libraryMeta.exhibits.find(e => e.slug === currentSlug) ?? …);`
- `App.svelte:176` — `async function persistLibrary() { await saveLibraryMeta(libraryMeta); touchBinding(); }`
- `App.svelte:986` — `function touchBinding() { if (binding.kind !== "unbound") bindingDirty = true; }`
- `currentSlug` (`App.svelte:75`) and `currentObjectId` are App-local `$state` — the store does **not** own these; setters pass slug/objId in.

**Mutation sites (verified `file:line` → level):**

| # | `file:line` | Setter | Level | Idiom |
|---|---|---|---|---|
| 1 | `268-269` | `setSections` | exhibit | `exhibits.map(slug===)` patch |
| 2 | `341-342` | `reorderObjects` | exhibit | patch (`{…e, objects: next}`) |
| 3 | `454-455` | `appendObject` | object-add | `objects: [...e.objects, obj]` |
| 4 | `601-602` | `renameObject` | object | nested `objects.map(id===)` patch |
| 5 | `623-624` | `setLayout` | exhibit | patch |
| 6 | `631-632` | `setReadings` | exhibit | patch |
| 7 | `663-664` | `setObjectRights` | object | nested patch |
| 8 | `667-668` | `setExhibitRights` | exhibit | patch |
| 9 | `671-672` | `setLibraryRights` | library | `{…libraryMeta, rights, requiredStatement}` |
| 10 | `678` | `setLibraryTitle` | library | `{…libraryMeta, title}` |
| 11 | `679` | `setLibrarySummary` | library | `{…libraryMeta, summary}` |
| 12 | `681-682` | `setExhibitTitle` | exhibit | patch |
| 13 | `685-686` | `setExhibitSummary` | exhibit | patch |
| 14 | `690-691` | `setObjectSummary` | object | nested patch |

**NOT the patch idiom (do not force-fit — these are bulk rebuilds / array-adds, handled separately):**
- `App.svelte:208` (onMount reconcile), `App.svelte:412-421` (`replaceProjectFrom` full meta rebuild) — **whole-meta replacement** → `setMeta(next)`.
- `App.svelte:359` (`keepCopy` append), `App.svelte:380` (`newExhibit` append) — **array add** → `addExhibit(exhibit)`.
- `App.svelte:210, 212, 368, 381, 422` — bare `persistLibrary()` calls after the above; fold into the new methods (which persist internally) or keep one explicit `store.persist()` where the mutation already happened inline.

**Consumers of `libraryMeta` (reactivity must survive):** `$derived` at `76`; child props at `1153` (`exhibits={libraryMeta.exhibits}`), `1169/1171/1172` (rights/title/summary); non-reactive publish readers `buildFullLibrary`/`loadAllLogs` at `797, 872-874, 896, 1004` (read `.exhibits`/`.title` directly — confirm no top-level destructuring snapshots `meta`; current code reads `libraryMeta.x` each time, so a getter is safe).

## 4. Target design

A new **sibling** module `apps/studio/src/library-meta.svelte.ts` (NOT an extension of `store.ts`).

**Seam discriminator — why sibling, not extend `store.ts`:** the two have ≥2 real, opposed variants on the rune axis. `store.ts` is **framework-free** (pure types + OPFS I/O, zero runes) — the exact property the review credits when it calls it "a deep module that earns its keep" (`thermo-studio.md §4`). The new store is **rune-bearing** (owns reactive `$state`). Folding the rune into `store.ts` would contaminate the framework-free module. Correct layering: `library-meta.svelte.ts` (reactive owner) **consumes** `store.ts`'s `saveLibraryMeta`/`loadLibraryMeta`. In-repo precedent for a deliberate rune-module: `docs/spikes/0001-anvil-render-core-extraction.md:39,85` names `lib/undo.svelte.ts` as "a Svelte-5 rune module on purpose… the store, not core logic." Same pattern, same `.svelte.ts` marker.

**Shape (cross-module-safe rune idiom — the load-bearing constraint from §2):**

```ts
// library-meta.svelte.ts
import { saveLibraryMeta, type LibraryMeta, type ExhibitMeta, type ObjectMeta } from "./store";

export function createLibraryStore(opts: { onAfterPersist?: () => void }) {
  // container is NEVER reassigned → exportable/reactive across modules (svelte $state rule)
  const s = $state<{ meta: LibraryMeta }>({ meta: { exhibits: [] } });
  async function persist() { await saveLibraryMeta(s.meta); opts.onAfterPersist?.(); }

  return {
    get meta() { return s.meta; },               // read path for $derived + props + publish builders
    persist,                                       // explicit persist for the await-callers (set-only mutators below)

    // --- AUTO-PERSIST (fire-and-forget) — exactly mirrors the 13 `void persistLibrary()` patch sites ---
    patchLibrary(fields: Partial<LibraryMeta>) { s.meta = { ...s.meta, ...fields }; void persist(); },
    patchExhibit(slug: string, fields: Partial<ExhibitMeta>) {
      s.meta = { ...s.meta, exhibits: s.meta.exhibits.map((e) => (e.slug === slug ? { ...e, ...fields } : e)) }; void persist();
    },
    patchObject(slug: string, objId: string, fields: Partial<ObjectMeta>) {
      s.meta = { ...s.meta, exhibits: s.meta.exhibits.map((e) =>
        e.slug === slug ? { ...e, objects: e.objects.map((o) => (o.id === objId ? { ...o, ...fields } : o)) } : e) }; void persist();
    },

    // --- AWAITABLE — for the 4 sites that `await persistLibrary()` BEFORE navigating (455/368/381/422) ---
    async appendObject(slug: string, obj: ObjectMeta) {  // slug-keyed (null-safe like the map idiom — no currentExhibit deref)
      s.meta = { ...s.meta, exhibits: s.meta.exhibits.map((e) => (e.slug === slug ? { ...e, objects: [...e.objects, obj] } : e)) };
      await persist();
    },
    async addExhibit(ex: ExhibitMeta) { s.meta = { ...s.meta, exhibits: [...s.meta.exhibits, ex] }; await persist(); },

    // --- SET-ONLY (no persist) — preserves onMount's CONDITIONAL persist verbatim; caller persists explicitly ---
    setMeta(next: LibraryMeta) { s.meta = next; },       // bulk rebuild (reconcile / replaceProjectFrom)
  };
}
export type LibraryStore = ReturnType<typeof createLibraryStore>;
```

Factory (not module-level singleton) so `touchBinding` is **injected**, not swallowed — keeping the binding seam on the App side for the next cut.

**Persist timing is preserved per-site by mirroring the code's own `void` vs `await` distinction** (verified in the grep):
- The **13** patch sites that do `void persistLibrary()` → `patch*` methods auto-persist fire-and-forget. ✓
- The **4** sites that `await persistLibrary()` before navigating (`appendObject:455`, `keepCopy:368`, `newExhibit:381`, `replaceProjectFrom:422`) → **awaitable** `appendObject`/`addExhibit` (await the write before `openExhibit`), or `setMeta(next)` immediately followed by the caller's existing `await lib.persist()`.
- The **onMount reconcile** (`:210` persists ONLY `if (stale.length)`, `:212` first-run only) → `setMeta` is **set-only (no auto-persist)** precisely so boot does NOT write `library.json` unconditionally; the caller keeps the existing conditional `await lib.persist()`. This is why `setMeta` must not auto-persist.

**In App:** `const lib = createLibraryStore({ onAfterPersist: touchBinding });` then replace every `libraryMeta` read with `lib.meta` and every setter body with one `lib.patch*` / `lib.setMeta` / `lib.addExhibit` call. `currentExhibit` becomes `$derived(lib.meta.exhibits.find(…))`.

**Mapping — each site → new method:**

| Site | New call |
|---|---|
| `setSections`, `setLayout`, `setReadings`, `setExhibitRights`, `setExhibitTitle`, `setExhibitSummary`, `reorderObjects` (1,2,5,6,8,12,13) | `lib.patchExhibit(currentSlug, { … })` |
| `renameObject`, `setObjectRights`, `setObjectSummary` (4,7,14) | `lib.patchObject(currentSlug, objId, { … })` |
| `setLibraryRights`, `setLibraryTitle`, `setLibrarySummary` (9,10,11) | `lib.patchLibrary({ … })` |
| `appendObject` (3) — array push within exhibit, **awaits** persist before navigation | `await lib.appendObject(currentSlug, obj)` (slug-keyed, null-safe) |
| `newExhibit`, `keepCopy` adds (`380`, `359`) — **await** persist before `openExhibit` | `await lib.addExhibit(ex)` |
| onMount reconcile (`208/210/212`), `replaceProjectFrom` (`412/422`) — persist is **conditional / explicit** | `lib.setMeta(next)` (set-only) **then keep the existing** `if (stale.length) await lib.persist()` / `await lib.persist()` |

This yields **7 store methods** absorbing all 14 patch sites + 2 adds + 2 rebuilds. `void persistLibrary()` repetition (and the `persistLibrary` function itself) is **deleted** — `persist()` (= `saveLibraryMeta` + injected `touchBinding`) lives in **one owner**; the auto-persist methods call it internally, the set-only/await methods let the caller keep the code's existing persist timing.

## 5. Behavior changes

**None intended (behavior-preserving refactor).** Same JSON written to the same OPFS path, same `touchBinding` side-effect. **Persist timing is preserved per-site, not flattened** (this is the trap §4 guards against): the 13 `void` setters stay fire-and-forget; the 4 `await` setters (`appendObject`/`keepCopy`/`newExhibit`/`replaceProjectFrom`) stay awaited via the awaitable store methods (write completes before navigation); the onMount reconcile stays **conditional** (set-only `setMeta` + the caller's existing `if (stale.length) await lib.persist()`), so a clean boot does NOT gain an unconditional `library.json` write. The object-identity pattern is preserved exactly (`{ ...s.meta, exhibits: …map… }` produces new references — identical to today, so `$derived`/props invalidate the same way).

**One latent-risk to verify, not a deliberate change:** the cross-module rune wiring must reproduce today's reactivity. If a consumer ends up reading a stale snapshot (destructured `const { exhibits } = lib.meta` at module scope), that is a **regression to fix in this PR**, not an accepted change. Acceptance criteria (§9) pin this.

## 6. Blast radius & test impact

- **Studio has ZERO test files** — no test can break, and **no automated guard exists**. Verification is **manual smoke** (§ checklist below) plus a **type/build gate** (`svelte-check` + `vite build`).
- **No shared fixture touched** — the project fixture rule ("never modify a fixture to fix one test") is **not triggered**.
- **No render-core / viewer test touched** — this is studio-internal; `packages/render-core/src/publish/*.test.ts` and `apps/viewer/src/published.test.ts` are unaffected (they read the published tree, not studio's `library.json` writer).

**Verification commands:**
- Type/compile gate: `pnpm --filter @archie/studio check` (svelte-check) — must be clean (catches a broken rune export at compile time, e.g. exporting reassigned state).
- Build gate: `node node_modules/vite/bin/vite.js build` in `apps/studio` (node22 / fnm Node v24 per project memory) — must succeed.
- Run gate: launch studio (`pnpm --filter @archie/studio dev`) and run the manual smoke checklist below. **Build-green ≠ run-green** (project memory: studio & viewer seed separately; run it).

**Manual smoke checklist (the safety net — persistence + reactivity, since there is no test):**
1. **Create exhibit** ("New exhibit") → appears in Library list. (`addExhibit`)
2. **Rename exhibit** (title edit) → label updates live in the UI. (`patchExhibit` + reactivity)
3. **Delete / fork** — "Keep a copy" of an example → copy appears, carries notes. (`addExhibit`)
4. **Edit object metadata** — rename an object, set its summary/rights → updates show immediately. (`patchObject`)
5. **Edit exhibit metadata** — change layout, add a reading, set exhibit rights/summary → reflected live. (`patchExhibit` / `patchLibrary`)
6. **Reorder objects** in the overview → order persists. (`patchExhibit`)
7. **Reload the page** → every change above survives (library.json round-trips through OPFS). **This is the core persistence assertion.**
8. **Binding chip** — after an edit, the "unsaved to disk" / bound-location dirty indicator still arms (confirms `touchBinding` injection survived). 

**Recommendation — add a minimal vitest harness for the store (YES, do it as part of this work).** The store is **plain data + an injected persist callback** → headless-testable, unlike the Svelte shell (which needs OSD/OPFS, hence "manual only"). A small `library-meta.test.ts` mocking `saveLibraryMeta` and asserting: (a) `patchExhibit` updates only the matched slug, (b) `patchObject` updates only the matched object, (c) `patchLibrary` merges top-level fields, (d) each method calls persist exactly once and fires `onAfterPersist`. This converts studio's first slice of "zero coverage" into a guarded module and pins the reducer semantics for the later `useBinding`/`useNoteEditor` cuts. NOTE: a `.svelte.ts` file under test needs the vitest svelte plugin / `vite-node` rune transform — confirm the studio vitest config resolves `$state` (it may need `@sveltejs/vite-plugin-svelte`'s test mode); if the harness can't run runes headlessly within this cut's budget, **factor the pure reducers** (`patchExhibitIn(meta, slug, fields)` etc.) into a plain `.ts` and have the `.svelte.ts` store call them — test the plain reducers, leave the rune container to manual smoke. Prefer the plain-reducer split if rune-in-vitest is non-trivial.

## 7. ADR alignment

- **No ADR governs studio-internal state composition** — the cut is consistent with all of: ADR-0001 (objects nested in exhibits — the `patchObject(slug, objId)` shape mirrors this nesting exactly), ADR-0007 (readings on `ExhibitMeta` — `setReadings` → `patchExhibit`), and the rights model (`RightsFields` on all three levels — `patchLibrary`/`patchExhibit`/`patchObject` map 1:1 to the three rights setters).
- **ADR-0002 (rendering & framework boundary) — do NOT mis-cite.** ADR-0002 governs `@render/core` node-importability / framework-free-ness. `store.ts` is already browser-only (OPFS), so ADR-0002's *core* boundary is not the reason to keep the rune out of it. The actual rule cited is the in-repo **rune-module convention** from `docs/spikes/0001-anvil-render-core-extraction.md:39,85` (`*.svelte.ts` = deliberate rune store, kept out of framework-free modules). Cite the spike, not ADR-0002.
- **No contradiction with `STUDIO-CODE-SPLITTING.md`** — that plan scopes the Q10 monolith refactor **OUT** of bundle-splitting (`:55`) and names this exact decomposition as the separate larger effort. This cut is the first step of that effort; it does not touch the chunk-splitting phases.

## 8. Implementation steps

**Phase 1 — create the store (1 file, no App change yet).** Write `apps/studio/src/library-meta.svelte.ts` per §4 (factory, `patch*`/`setMeta`/`addExhibit`/`get meta`/`persist`, injected `onAfterPersist`). If taking the plain-reducer split (§6), also add the pure reducers (same file or `library-meta-reducers.ts`).
**Verify gate:** `pnpm --filter @archie/studio check` clean. (Store compiles; rune export not reassigned.)

**Phase 2 — wire App to the store (1 file: `App.svelte`).** Replace `let libraryMeta = $state(…)` (`:68`) + `persistLibrary` (`:176`) with `const lib = createLibraryStore({ onAfterPersist: touchBinding });`. Rewrite `currentExhibit` (`:76`) to read `lib.meta`. Convert the 14 patch setters (table §4) to single `lib.patch*` calls; convert `appendObject`/`newExhibit`/`keepCopy` to `addExhibit`; convert onMount reconcile + `replaceProjectFrom` to `setMeta`. Update the ~8 read sites (`797, 872-874, 896, 1004, 1153, 1169-1172`) from `libraryMeta.x` → `lib.meta.x`. Delete the now-dead `persistLibrary` function and all `void persistLibrary()` lines. **≤1 file, but it is large — do it in one focused pass, then verify; do not interleave with other edits.**
**Verify gate:** `check` clean → `vite build` succeeds → run studio → **full manual smoke checklist (§6)**. The reload step (7) is mandatory.

**Phase 3 — store test harness (1-2 files).** Add `library-meta.test.ts` (or test the plain reducers) per §6 recommendation. **Verify gate:** `pnpm --filter @archie/studio test` (or the repo's vitest invocation) green.

**Phase 4 — plan-drift housekeeping (docs only, optional within this cut).** None required for this step specifically (the `STUDIO-CODE-SPLITTING.md:10` `MergeReview` drift is owned by landing-order step 1, not this one) — note it, do not fix here.

## 9. Acceptance criteria

- [ ] `apps/studio/src/library-meta.svelte.ts` exists; exports `createLibraryStore` returning `get meta` + `patchLibrary`/`patchExhibit`/`patchObject`/`addExhibit`/`setMeta`/`persist`.
- [ ] `App.svelte` no longer contains the string `persistLibrary` and no longer contains a bare `libraryMeta = { ...` reassignment (grep returns zero in `App.svelte`).
- [ ] All 14 patch sites + 2 adds + 2 rebuilds route through the store (mapping table §4 fully applied).
- [ ] `App.svelte` script shrinks by ~100-120 lines.
- [ ] `pnpm --filter @archie/studio check` clean; `vite build` succeeds.
- [ ] Manual smoke checklist §6 all pass — **especially reload-survives-persistence (step 7) and the binding-dirty chip (step 8, proves `touchBinding` injection intact).**
- [ ] Reactivity intact: renaming an exhibit/object updates the UI **without a manual refresh** (proves the cross-module rune idiom).
- [ ] Store unit test (or pure-reducer test) green: per-slug / per-object isolation, top-level merge, persist-called-once + `onAfterPersist` fired.

## 10. Rollback

Single-commit, single-new-file, single-edited-file change → `git revert <sha>` (or `git checkout -- apps/studio/src/App.svelte && git rm apps/studio/src/library-meta.svelte.ts library-meta.test.ts`) fully restores the prior monolithic state; no migration, no schema change (the OPFS `library.json` format is byte-identical), no other module depends on the new store. If only reactivity regresses (UI stale after edit) but persistence works, the fault is the rune idiom — fix forward by ensuring reads go through `get meta` (never a destructured snapshot) before reverting.
