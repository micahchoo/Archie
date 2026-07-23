# Agent Drive Harness Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An agent can boot the real studio in Chromium, act on it with app-level verbs, and read semantic app state back as JSON — one command, no per-check boot tax.

**Architecture:** Three layers over the existing `scripts/lib/driver.mjs` plumbing (launch ladder, server discovery, settle): a dev-only `window.__archie` observation seam inside the studio app; a verb library (`scripts/lib/verbs.mjs`) whose functions **act through the real UI** (Playwright clicks on the same selectors users hit) and **observe through the seam** (semantic JSON, not pixels); and a drive entry (`scripts/drive.mjs`) with one-shot and REPL modes that holds the browser + dev server open across commands. Existing scripts (`seed-fixture.mjs`) migrate onto the verbs so there is one selector vocabulary, not N.

**Why browser, not a Node CLI:** this repo has proven three times that Node-green ≠ browser-works (`.claude/rules/bound-fetch-defaults.md` — Illegal invocation invisible to all vitest suites; the `$effect`-invisible-to-vitest hazard; the Tauri CSP/PixiJS failure). The harness must exercise the runtime where the bugs live.

**Tech Stack:** Playwright (already a devDep; launch via `scripts/lib/driver.mjs` ladder), Svelte 5 runes (seam reads `vs`/`lib` stores in `App.svelte`), Node built-in test runner (`node --test`, donor: `scripts/lib/capture-gate.test.mjs`), plain ESM `.mjs` (root `package.json` has `"type": "module"`).

**Non-goals (v1):** migrating `capture-screenshots.mjs` (591 lines of screenshot-specific selectors — follow-up), a viewer-side seam (viewer verbs observe via DOM), driving the Tauri webview, wiring drive into CI.

---

## Flow Map

```
agent command (stdin JSONL / argv)
  → drive entry        scripts/drive.mjs          [session lifecycle: server + persistent browser]
  → protocol parse     scripts/lib/drive-protocol.mjs   [pure: line → {verb, args}]
  → verb dispatch      scripts/lib/verbs.mjs      [ACT: Playwright on real UI selectors]
  → studio app         apps/studio (dev server, real Chromium)
  → observation seam   window.__archie            [OBSERVE: semantic snapshot from runes]
  → protocol format    scripts/lib/drive-protocol.mjs   [pure: result → one-line JSON]
  → stdout
```

Discipline (Q-14, minted with this plan): verbs **act** only through the UI; the seam is **observe-only**. A verb that mutates app state via the seam would prove nothing about the UI it bypassed.

## File Structure

| File | Responsibility |
|---|---|
| `apps/studio/src/debug-seam.ts` (create) | Build + install `window.__archie` from accessor callbacks; owns the snapshot type and the `declare global` Window augmentation. DEV-only. |
| `apps/studio/src/App.svelte` (modify) | One call: `installDebugSeam({...})` after `vs`/`lib` creation (~line 191), passing closures over the runes. |
| `apps/studio/e2e/seam.spec.ts` (create) | e2e proof the seam exists in dev and tracks UI actions. |
| `scripts/lib/verbs.mjs` (create) | The verb vocabulary + `VERBS` registry (name → `{fn, doc, params}`). Imports `driver.mjs` helpers; single home for app-level selectors. |
| `scripts/lib/verbs.test.mjs` (create) | Registry-integrity unit test (no Playwright). |
| `scripts/lib/drive-protocol.mjs` (create) | Pure parse/format for the JSONL protocol. |
| `scripts/lib/drive-protocol.test.mjs` (create) | Unit tests for parse/format. |
| `scripts/drive.mjs` (create) | Entry: one-shot + `--repl`; boots/discovers server (`ensureStudioServer`), holds `launchPersistentProfile(".drive/profile")`, drains console/page errors into every reply. |
| `scripts/seed-fixture.mjs` (modify) | Consume `ingestFolder`/`openObject` from verbs.mjs; delete its local copies. CLI contract unchanged (`scale-check.mjs` spawns it). |
| `docs/agents/DRIVE.md` (create) | Agent-facing manual: protocol, verb table, "adding a verb" recipe, the act/observe discipline. |
| `.claude/rules/drive-harness.md` (create) | Path-scoped rule: new driving scripts import verbs, never hand-roll selectors; seam is observe-only. |
| `package.json` (modify) | `"drive": "node scripts/drive.mjs"`. |
| `.gitignore` (modify) | `.drive/` (persistent profile + screenshots). |
| `docs/decisions/archie.md` (modify) | Mint Q-14 row. |

---

### Task 1: Observation seam — `window.__archie` [CHANGE SITE]

**Orient:** The harness can only be cheaper than screenshot-diffing if the app exposes semantic state; this task creates the one observe-only window into the studio's runes.
**Flow position:** Step 5 of 7 in drive flow (studio app → **observation seam** → protocol format). Everything downstream (verbs `state`, drive replies) consumes this shape.
**Skill:** `tdd`

<contracts>
**Downstream (seam → verbs.mjs `state` verb):**
- `window.__archie: { v: 1, state(): ArchieDebugSnapshot } | undefined` (undefined in prod builds and on viewer pages)
- `ArchieDebugSnapshot = { v: 1; view: string; currentSlug: string | null; currentObjectId: string | null; exhibits: Array<{ id: string; slug: string; title: string; objectCount: number }> }`
- Behavioral invariants: `state()` is a fresh plain-object snapshot per call (JSON-serializable, no live rune/proxy references leaked); reading it never mutates app state; installed only under `import.meta.env.DEV`.
</contracts>

**Files:**
- Create: `apps/studio/src/debug-seam.ts`
- Modify: `apps/studio/src/App.svelte` (one `installDebugSeam(...)` call after `const vs = createViewState({...})` at ~line 191)
- Test: `apps/studio/e2e/seam.spec.ts`

- [ ] **Step 1: Read the accessor ground truth.** Open `apps/studio/src/view-state.svelte.ts` and confirm the public names for view/slug/object cursor (App.svelte:186-188 comment and call sites `vs.currentSlug` is implied, `vs.currentObjectId` / `vs.currentExhibit` are confirmed at App.svelte:320,445,528). Open `apps/studio/src/store.ts` and confirm `ExhibitMeta` field names for id/slug/title/objects (imported at App.svelte:57). Adjust the snapshot mapping — not the snapshot shape — to what exists.

- [ ] **Step 2: Write the failing e2e spec** (`apps/studio/e2e/seam.spec.ts`, mirroring `navigation.spec.ts` locator idiom — role/label locators, no hardcoded ULIDs):

```ts
test("dev seam exists and tracks the UI", async ({ page }) => {
  await page.goto("");                       // baseURL = http://localhost:5198/studio/
  const snap = await page.evaluate(() => (window as any).__archie?.state());
  expect(snap?.v).toBe(1);
  expect(Array.isArray(snap.exhibits)).toBe(true);
  expect(snap.exhibits.length).toBeGreaterThan(0);    // default seed exhibits
  // act through the UI, observe through the seam:
  // open first exhibit card, then first object plate; assert currentObjectId went non-null
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd apps/studio && pnpm exec playwright test --config e2e/playwright.config.ts e2e/seam.spec.ts`
Expected: FAIL — `snap` is undefined (`__archie` not installed)

- [ ] **Step 4: Implement `debug-seam.ts`** — `export function installDebugSeam(acc: { view(): string; currentSlug(): string | null; currentObjectId(): string | null; exhibits(): ExhibitMeta[] }): void`, which no-ops unless `import.meta.env.DEV`, else assigns `window.__archie = { v: 1, state: () => ({ v: 1, view: acc.view(), ... , exhibits: acc.exhibits().map(e => ({ id, slug, title, objectCount: e.objects.length })) }) }`. Include the `declare global { interface Window { __archie?: ... } }` here. Wire the one call in App.svelte with arrow closures over `vs`/`lib`.

- [ ] **Step 5: Run to verify it passes**

Run: `cd apps/studio && pnpm exec playwright test --config e2e/playwright.config.ts e2e/seam.spec.ts`
Expected: PASS (e2e webServer is bare `vite --port 5198` → dev mode → DEV guard true)

- [ ] **Step 6: Repo gates** (rules: svelte-check after .svelte edits; `pnpm typecheck` after studio .ts edits)

Run: `pnpm --filter @archie/studio run check && cd apps/studio && pnpm typecheck`
Expected: 0 errors / 0 warnings (studio baseline is 0/0 — a new warning is a regression)

- [ ] **Step 7: Prove prod absence**

Run: `cd apps/studio && pnpm exec vite build && ! grep -ra "__archie" dist/assets`
Expected: build succeeds, grep finds nothing (DEV branch tree-shaken). (`grep -a` per the NUL-bytes-recur hazard.)

- [ ] **Step 8: Commit** — `git add apps/studio/src/debug-seam.ts apps/studio/src/App.svelte apps/studio/e2e/seam.spec.ts && git commit -m "feat(studio): dev-only window.__archie observation seam"`

---

### Task 2: Verb library — `scripts/lib/verbs.mjs`

**Orient:** One shared vocabulary of app-level actions so every driving script (and the agent) clicks the same selectors — today `capture-screenshots.mjs`, `seed-fixture.mjs`, and both e2e specs each hand-roll their own.
**Flow position:** Step 4 of 7 in drive flow (protocol parse → **verb dispatch** → studio app). Consumes Task 1's seam shape; consumed by Task 4's entry and Task 5's migration.
**Skill:** `tdd`

<contracts>
**Downstream (verbs.mjs → drive.mjs / any script):**
- `export const VERBS: Record<string, { fn(ctx, args): Promise<any>, doc: string, params: Record<string, string> }>`
- `ctx = { page, log }` — verbs never launch browsers or servers (that's drive.mjs's job); donors that need `settle`/`PLATE_SELECTOR` import them from `./driver.mjs`.
- `export function trackErrors(page): () => string[]` — installs `console`/`pageerror` listeners, returns a drain function (donor: `recipes/smoke.mjs` error capture).
- Behavioral invariant: verbs act via UI only; the sole seam read is the `state` verb.
</contracts>

**Files:**
- Create: `scripts/lib/verbs.mjs`
- Test: `scripts/lib/verbs.test.mjs`

- [ ] **Step 1: Write the failing registry test** (`node:test` + `assert/strict`, donor: `capture-gate.test.mjs`): every `VERBS` entry has a callable `fn`, non-empty `doc`, `params` object; names are lowercase-kebab; `state`, `goto`, `shot`, `open-exhibit`, `open-object`, `ingest-folder`, `errors` all present.

Run: `node --test scripts/lib/verbs.test.mjs`
Expected: FAIL (module not found)

- [ ] **Step 2: Implement the v1 verbs**, each lifted from its named donor — do not invent selectors:
  - `goto {route}` — `page.goto(new URL(route, ctx.baseUrl))` + `settle(page)` (driver.mjs:23)
  - `state {}` — `page.evaluate(() => window.__archie?.state())`; throw a labeled error if undefined ("no seam: prod build or non-studio page")
  - `shot {name?}` — screenshot to `.drive/shots/<name|ts>.png`, return the path
  - `open-exhibit {title}` — donor: `clickExhibitCard` in `capture-screenshots.mjs` (exact `getByText`)
  - `open-object {index=0}` — donor: `PLATE_SELECTOR` click (driver.mjs:19)
  - `ingest-folder {dir, title?}` — donor: `seed-fixture.mjs` CreateExhibitDialog flow ("New exhibit" → `button.path-card` "From a media folder" → `page.setInputFiles` on the hidden `<input webkitdirectory>` → `.dialog .path-actions button.btn-primary`)
  - `errors {}` — drain `trackErrors` buffer

- [ ] **Step 3: Run to verify it passes**

Run: `node --test scripts/lib/verbs.test.mjs`
Expected: PASS (integration proof of the verbs themselves lands in Tasks 4-5)

- [ ] **Step 4: Commit** — `git commit -m "feat(scripts): shared app-level verb library for drive harness"`

---

### Task 3: Protocol — `scripts/lib/drive-protocol.mjs`

**Orient:** The agent talks to the daemon over stdin/stdout; this pure module makes that conversation parseable and testable without a browser.
**Flow position:** Steps 3 and 6 of 7 in drive flow (drive entry → **parse** → verb dispatch; verb result → **format** → stdout). No dependency on Tasks 1-2 — parallel with Task 2.
**Skill:** `tdd`

<contracts>
**Downstream (protocol → drive.mjs):**
- `parseLine(line: string): { verb: string, args: object }` — accepts bare `state` or JSON `{"verb":"open-object","args":{"index":1}}`; throws with a usage message on malformed input.
- `formatOk(result, extra): string` / `formatErr(error, extra): string` — always exactly one line of JSON (`{"ok":true,"result":...}` / `{"ok":false,"error":"..."}`), `extra` merges fields like drained `errors`.
- Behavioral invariant: output is newline-free single-line JSON (the agent's parse contract).
</contracts>

**Files:**
- Create: `scripts/lib/drive-protocol.mjs`
- Test: `scripts/lib/drive-protocol.test.mjs`

- [ ] **Step 1: Failing tests** — bare-verb parse, JSON parse with args, malformed JSON throws, result with embedded newlines still formats to one line, `extra.errors` merged.

Run: `node --test scripts/lib/drive-protocol.test.mjs`
Expected: FAIL

- [ ] **Step 2: Implement (pure functions, no I/O)** → **Step 3: Run to PASS** (same command) → **Step 4: Commit** `"feat(scripts): drive JSONL protocol (pure parse/format)"`

---

### Task 4: Drive entry — `scripts/drive.mjs` [CHANGE SITE]

**Orient:** This is what turns "verification exists" into "verification is the default move" — boot once, hold the session, answer verb commands in ~1s each.
**Flow position:** Steps 1-2 of 7 (agent command → **drive entry** → protocol parse). Depends on Tasks 2 + 3.
**Skill:** `none` (integration script; verified by scripted smoke below)

**Files:**
- Create: `scripts/drive.mjs`
- Modify: `.gitignore` (add `.drive/`), root `package.json` (`"drive": "node scripts/drive.mjs"`)

- [ ] **Step 1: Implement lifecycle** — `ensureStudioServer({repo, log})` (driver.mjs:72 — probes running servers first, boots `pnpm --filter @archie/studio dev` only if none; returns `{url, stop}`) + `launchPersistentProfile(".drive/profile")` (driver.mjs:42 — OPFS survives runs, so seeded fixtures persist). Install `trackErrors(page)` once; every reply carries `errors` drained since the last command. On exit call `stop()` (no-op when the server was pre-existing — never kill a server another session is using).

- [ ] **Step 2: Implement modes.**
  - One-shot: `node scripts/drive.mjs <verb> ['{"json":"args"}']` → one reply line, exit 0/1 on ok/error.
  - REPL: `node scripts/drive.mjs --repl` → JSONL loop on stdin; built-ins `help` (render `VERBS` docs) and `quit`. Ready signal: print `{"ok":true,"result":"ready","url":...}` once booted, so a driving agent knows when to start writing.
  - Every reply line is Task 3's wire shape (restated for this task's implementer): `{"ok":true,"result":...,"errors":[...]}` or `{"ok":false,"error":"...","errors":[...]}` — one line, via `formatOk`/`formatErr` from `./lib/drive-protocol.mjs`, never hand-built JSON.

- [ ] **Step 3: Scripted smoke (the task's verification)**

Run: `printf 'state\nhelp\nquit\n' | node scripts/drive.mjs --repl`
Expected: three `{"ok":true,...}` lines; the `state` line contains `"v":1` and a non-empty `exhibits` array; process exits 0. Then one-shot: `pnpm drive state` → same single state line.

- [ ] **Step 4: Commit** — `git commit -m "feat(scripts): drive.mjs — one-shot + REPL browser drive harness"`

---

### Task 5: Migrate `seed-fixture.mjs` onto the verbs

**Orient:** Proves the verbs are real (an existing consumer runs on them) and deletes the first duplicated selector flow — the harness's whole point is one vocabulary.
**Flow position:** Consumer of verb-dispatch node; parallel with Task 6 after Wave 2.
**Skill:** `none` (behavioral characterization: its own success output is the test)

**Files:**
- Modify: `scripts/seed-fixture.mjs` (replace local ingest + plate-open code with `ingest-folder` / `open-object` verb fns imported from `./lib/verbs.mjs`)

- [ ] **Step 1: Record current behavior** — run `node scripts/seed-fixture.mjs` against a dev server; save its success output lines as the characterization baseline.
- [ ] **Step 2: Swap the duplicated flows for verb imports.** Keep the CLI contract byte-compatible: `scale-check.mjs` spawns this file as a child process (`runSeeder`) — argv, env, exit codes, and stdout markers must not change.
- [ ] **Step 3: Verify**

Run: `node scripts/seed-fixture.mjs` then `node --test scripts/lib/*.test.mjs`
Expected: same success markers as Step 1's baseline; all unit tests green. (This run is also the integration proof of `ingest-folder`.)

- [ ] **Step 4: Commit** — `git commit -m "refactor(scripts): seed-fixture consumes shared verbs"`

---

### Task 6: Discoverability + decision record

**Orient:** The tweet's leverage clause is "the agent can update the CLI itself" — that only happens if a future agent can *find* the harness and knows the extension rule.
**Flow position:** Meta-node — documents the whole flow; parallel with Task 5.
**Skill:** `none`

**Files:**
- Create: `docs/agents/DRIVE.md` (beside the existing `issue-tracker.md`)
- Create: `.claude/rules/drive-harness.md`
- Modify: `docs/decisions/archie.md` (Q-14 row inside `DECISIONS_INDEX` markers, if not already minted during planning)

- [ ] **Step 1: Write `docs/agents/DRIVE.md`** — protocol examples (one-shot + REPL with `printf` pipe and `run_in_background` patterns), the generated verb table (from `VERBS` docs), "adding a verb" recipe (donor selectors from existing scripts, registry entry, registry test updates itself), and the Q-14 discipline with its one honest cost: asserting seam state doesn't prove the button worked — *act* via UI, *observe* via seam.
- [ ] **Step 2: Write `.claude/rules/drive-harness.md`** — scope: `scripts/**`, `apps/studio/src/debug-seam.ts`. Content: new driving scripts import verbs.mjs (never hand-roll selectors — cite the driver.mjs:1-7 "one home" precedent); the seam is observe-only; `capture-screenshots.mjs` is grandfathered until its own migration.
- [ ] **Step 3: Verify**

Run: `grep -c "ingest-folder" docs/agents/DRIVE.md && grep '"drive"' package.json && grep "Q-14" docs/decisions/archie.md`
Expected: all three non-zero/matching.

- [ ] **Step 4: Commit** — `git commit -m "docs: DRIVE.md agent manual + drive-harness rule + Q-14"`

---

## Execution Waves

- **Wave 0:** Task 1 — the seam contract everything downstream consumes.
- **Wave 1:** Tasks 2, 3 (parallel) — verbs consume Wave 0's *shape* (the `state` verb reads it); protocol is independent.
- **Wave 2:** Task 4 — depends on Tasks 2 + 3.
- **Wave 3:** Tasks 5, 6 (parallel) — depend on Wave 2 (Task 5's run is the integration proof; Task 6 documents the finished surface).

**Execution notes:** (a) This repo has heavy uncommitted WIP across `apps/studio/src/*` from concurrent sessions — check `git status` / `git branch --show-current` before each commit, and prefer executing on the live tree over an isolation worktree (worktrees here spawn from stale snapshots). (b) When the project's `.seeds/` tracker is used, materialize these six tasks via `sd create "<title>" --label plan:drive-harness,wave:<N>` + `sd dep`/`sd block` per the wave edges above — do this at execution start, not before, to avoid tangling concurrent-session tracker state.

## Open Questions

### Flow Contracts
- Q: Does `vs` expose `view` and `currentSlug` under exactly those names? **RESOLVED (plan review, 2026-07-22):** yes — `view-state.svelte.ts:44-46,91-94`; `vs.view`, `vs.currentSlug`, `vs.currentObjectId`, `vs.currentExhibit` all confirmed real accessors. Task 1 Step 1 becomes a confirmation glance, not a discovery step.
- Q: `ExhibitMeta` field names for slug/title, and is `objects` always an array? **RESOLVED (plan review, 2026-07-22):** `WorkingExhibitMeta` (`packages/render-core/src/publish/working.ts:90-116`) has exactly `id`, `slug`, `title`, `objects: WorkingObjectMeta[]` — non-optional array. The Task 1 snapshot mapping stands as written.

### Wave 0
- **Task 1:**
  - Q: Should the snapshot carry a save-status field from `save-queue.svelte.ts`? (Exploratory — include only if the module exposes a clean boolean; otherwise omit from v1 rather than invent an accessor.)
  - Q: Do the default seed exhibits render plates in the e2e profile without prior seeding? (Assumed yes — `navigation.spec.ts` already clicks plates on the same config.)

### Wave 2
- **Task 4:**
  - Q: `ensureStudioServer` boots `pnpm --filter @archie/studio dev` — under the viewer-optimizeDeps wedge hazard, is a second sibling boot ever possible from drive.mjs? (Exploratory — studio is plain Vite, not the Astro viewer, so the wedge class shouldn't apply; confirm no viewer server is booted.)

### Wave 3
- **Task 5:**
  - Q: Where does seed-fixture get its input folder — generated fixture or checked-in dir? (Exploratory — read `seed-fixture.mjs` header before migrating; the `ingest-folder` verb takes `dir` as an arg either way.)
- **Task 6:** (none — fully specified)

## Artifact Manifest

<!-- PLAN_MANIFEST_START -->
| File | Action | Marker |
|------|--------|--------|
| `apps/studio/src/debug-seam.ts` | create | `installDebugSeam` |
| `apps/studio/src/App.svelte` | patch | `installDebugSeam(` |
| `apps/studio/e2e/seam.spec.ts` | create | `__archie` |
| `scripts/lib/verbs.mjs` | create | `export const VERBS` |
| `scripts/lib/verbs.test.mjs` | create | `VERBS` |
| `scripts/lib/drive-protocol.mjs` | create | `parseLine` |
| `scripts/lib/drive-protocol.test.mjs` | create | `parseLine` |
| `scripts/drive.mjs` | create | `--repl` |
| `scripts/seed-fixture.mjs` | patch | `from "./lib/verbs.mjs"` |
| `package.json` | wire | `"drive": "node scripts/drive.mjs"` |
| `.gitignore` | patch | `.drive/` |
| `docs/agents/DRIVE.md` | create | `ingest-folder` |
| `.claude/rules/drive-harness.md` | create | `observe-only` |
| `docs/decisions/archie.md` | patch | `Q-14` |
<!-- PLAN_MANIFEST_END -->

## Q-Reference Summary

| Decision ID | Title (short) | Applied in |
|-------------|---------------|------------|
| Q-5 | Source-before-projection: authoritative source + thin derived projection | Task 1 (the seam is a thin read-only projection over the authoritative runes state — it derives, never owns) |
| Q-14 | Drive harness acts through the UI, observes through the seam (minted with this plan) | Tasks 1, 2, 4, 6; Flow Map discipline note |

Repo rules applied (stable named handles, not Q-N): `bound-fetch-defaults` (browser-vs-Node epistemics — the plan's reason to exist), `svelte-no-typecheck-net` + `studio-ts-typecheck-gate` (Task 1 Step 6 gates), `viewer-optimizedeps-bare-includes` (Wave 2 open question).

## Shape Changes Summary

| Date | Role | Finding | Summary |
|------|------|---------|---------|
| 2026-07-22 | resolver | plan review (approved) | Both Flow Contract open questions resolved against source: `vs.view`/`vs.currentSlug` confirmed (`view-state.svelte.ts:44-46,91-94`); `WorkingExhibitMeta` = `{id, slug, title, objects[]}` non-optional (`working.ts:90-116`). |
| 2026-07-22 | author | reviewer advisory | Task 4 Step 2 now restates the wire reply shape inline (subagents read one task at a time). |
