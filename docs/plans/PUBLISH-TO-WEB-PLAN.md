# Publish to the Web — Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-07-05 · **Branch:** `worktree-publish-to-web` (worktree; merged with local main @ `144fe9e` — includes Issue 11 Phase 1.1 dirty-tracking)
**Spec:** `PRFAQ.md` (appetite **3–4 weeks**, user-set; cut order at the tail) + `ledgers/PROBE-publish-to-web.md` (probe verdict *pursue*)
**Prior art (binding):** `docs/plans/GHPAGES-PUBLISH-UX.md` (2026-06-20) — supplies the dialog state machine, verified device-flow mechanics, the CORS verdict, and the keychain gate. This plan implements that design, amended by probe evidence (Q-13).

**Goal:** A signed-out scholar on the Tauri desktop app clicks "Publish to the web," authorizes GitHub with a 6-digit code, names their site once, and gets a live URL they own in under a minute — re-publishing is one click.

**Architecture:** Auth handshake (device flow) and token custody (keyring) live in Rust `#[tauri::command]`s — the `github.com/login/*` endpoints send no CORS headers and the token stays off the JS heap. The tree upload is a **single git pack push** via `git2` in Rust (Q-13; probe-proven at 0.6 min for 554 files). Repo-create and Pages-enable stay in the webview via the existing token-agnostic `ghpages.ts` REST helpers (`api.github.com` is CORS-clean). The UI is a rebuilt `Publish.svelte` state machine per GHPAGES-PUBLISH-UX; today's PAT form survives verbatim as the `advanced` state and remains the browser's GitHub path.

**Tech stack:** Tauri 2 (first custom commands in this repo), `reqwest`, `git2` (vendored openssl if needed — spike), `keyring` crate, Svelte 5 runes, vitest, cargo test (new).

---

## Flow Map

```
Deploy flow (desktop): dialog-chooser → publish-machine → device-auth → session-store
                        → tree-stage → repo-ensure → pack-push → pages-enable → success-url
Browser flow:          dialog-chooser → web-intro (zip + ?src= primary; advanced PAT form unchanged)
```

Node → owner: `dialog-chooser` = `PublishDialog.svelte` · `publish-machine`/`success-url` = `Publish.svelte` · `device-auth`/`session-store` = `src-tauri` commands + JS wrapper · `tree-stage`/`repo-ensure`/`pages-enable` = `apps/studio/src/deploy/deploy-flows.svelte.ts` + `ghpages.ts` · `pack-push` = `src-tauri` `gh_push_tree`.

**Concurrent-session hazard (Issue 11 executes on main):** `App.svelte`, `publish-flows.svelte.ts`, `binding-store.svelte.ts` are hot. This plan therefore **creates a new `apps/studio/src/deploy/` module** instead of growing `publish-flows.svelte.ts`, and touches `App.svelte` in exactly one place (dialog wiring). `PublishDialog.svelte`/`Publish.svelte` are cold (verified via git log 2026-07-05).

## File Structure

| File | Responsibility |
|---|---|
| `apps/studio/src/deploy/types.ts` (create) | Contracts: `DeploySession`, `DeployTarget`, `DeployProgress`, device-flow payloads, typed errors |
| `src-tauri/src/github.rs` (create) | `gh_device_start`, `gh_device_poll`, `gh_token_save/load/clear`, `gh_push_tree` |
| `src-tauri/src/lib.rs` (modify) | Register `generate_handler![…]` + opener plugin |
| `src-tauri/Cargo.toml` (modify) | `reqwest`, `git2`, `keyring`, `tauri-plugin-opener`, serde derive |
| `src-tauri/capabilities/default.json` (modify) | `core:event`, opener permission for `https://github.com/login/device` |
| `packages/render-core/src/publish/ghpages.ts` (modify) | Add `ensureRepo()`; extend `PublishProgress` with `creating-repo`/`pushing`; fix stale "fine-grained PAT" comment; Q-13 note on `publishToGitHub` |
| `apps/studio/src/deploy/deploy-flows.svelte.ts` (create) | Orchestration: session, sign-in, `deployToPages()` (stage → ensure → push → enable), remembered targets |
| `apps/studio/src/Publish.svelte` (rewrite) | State machine: `intro-desktop`/`device-code`/`name-site`/`publishing`/`success`/`update-confirm`/`manual-pages`/`error`/`advanced`/`web-intro` |
| `apps/studio/src/PublishDialog.svelte` (modify) | "Publish to the web" leads; routes into the machine; zip/share card kept |
| `archie.config.json` (modify) | `githubOAuthClientId` (empty in repo — fork-safe), `deployToPages` flag |
| Tests | `apps/studio/src/deploy/*.test.ts`, `packages/render-core/src/publish/ghpages.test.ts` (extend), `src-tauri/src/github.rs` `#[cfg(test)]` |

---

### Task 1: Contracts — deploy/types.ts [Wave 0]

**Orient:** Every later task consumes these shapes; writing them first prevents hallucinated interfaces between Rust and Svelte.
**Flow position:** Wave-0 skeleton for all nodes (no runtime behavior).
**Skill:** `none`
**Files:**
- Create: `apps/studio/src/deploy/types.ts`

<contracts>
**Produced (consumed by Tasks 3,4,6,8,9,10):**
- `type DeviceStart = { userCode: string; verificationUri: string; deviceCode: string; interval: number; expiresIn: number }`
- `type DevicePollResult = { token: string } // success` — errors arrive as typed `DeployError`
- `type DeployError = { kind: 'auth-pending'|'slow-down'|'expired'|'denied'|'device-flow-disabled'|'network'|'rate-limited'|'push'|'gh'; message: string; status?: number }`
- `type DeploySession = { login: string; token: string; persisted: boolean }`
- `type DeployTarget = { owner: string; repo: string; branch: 'gh-pages' }` — branch fixed; matches engine default (`ghpages.ts:57-64` GitHubTarget minus token)
- `type DeployProgress = { phase: 'creating-repo'|'staging'|'pushing'|'enabling-pages'|'pages-building' ; detail?: string }`
- Behavioral invariant: **tokens never appear in `DeployTarget` or any persisted/logged structure**; they live in `DeploySession` (memory) and the keyring (Q-12).
</contracts>

- [ ] **Step 1:** Write `types.ts` with the shapes above + JSDoc citing Q-12/Q-13.
- [ ] **Step 2:** Run: `pnpm --filter @archie/studio exec tsc --noEmit 2>&1 | tail -3` · Expected: no new errors.
- [ ] **Step 3:** Commit: `feat(deploy): contract types for publish-to-web (Q-12, Q-13)`

### Task 2: [SPIKE] git2 pack push from the Tauri shell [Wave 1]

**Orient:** Q-13's mechanism assumes `git2` builds inside this Tauri env and pushes to GitHub over HTTPS with a token — the plan's riskiest unverified assumption (probe used system git).
**Flow position:** Unblocks `pack-push` (Task 6). Answer is yes/no + notes, not shipped code.
**Skill:** `hybrid-research`
**Files:** throwaway under `src-tauri/` (delete before commit) · Write answer to `docs/spikes/2026-07-git2-in-tauri.md`

- [ ] **Step 1:** Add `git2 = "0.19"` to `src-tauri/Cargo.toml`; `cargo build` in `src-tauri/`. If openssl linkage fails, retry `git2 = { version = "0.19", features = ["vendored-openssl"] }`. Record which.
- [ ] **Step 2:** Temp `#[tauri::command]` (or `#[cfg(test)]` integration test): init temp repo, one file, commit, push `refs/heads/gh-pages` to a scratch GitHub repo using `Cred::userpass_plaintext("x-access-token", token)` with a token from env. Run: `GITHUB_TOKEN=… cargo test push_smoke -- --ignored --nocapture` · Expected: push succeeds; note wall time.
- [ ] **Step 3:** Write `docs/spikes/2026-07-git2-in-tauri.md`: builds? vendored-openssl needed? push OK? binary-size delta? **Fallback if NO:** shell out to system `git` in the Tauri sidecar is NOT acceptable (Flatpak); fallback is Rust `gix` (gitoxide) push, and if that also fails, escalate — do not fall back to per-blob REST (Q-13).
- [ ] **Step 4:** Commit spike doc only: `docs(spike): git2-in-tauri answer (plan Task 2)`

### Task 3: device-auth — Rust commands [Wave 1]

**Orient:** The 6-digit-code sign-in must run in Rust: `github.com/login/*` sends no CORS headers, and this keeps the token off the JS heap (GHPAGES-PUBLISH-UX §Verified mechanics).
**Flow position:** `publish-machine` → **device-auth** → `session-store`.
**Skill:** `tdd`
**Files:**
- Create: `src-tauri/src/github.rs` · Modify: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`
- Test: `#[cfg(test)]` in `github.rs`

<contracts>
**Upstream (JS invoke):** `invoke('gh_device_start', { clientId })` → `DeviceStart` (serde camelCase) · `invoke('gh_device_poll', { clientId, deviceCode, interval })` → resolves `{ token }` or rejects with a `DeployError`-shaped string.
**Behavioral invariants:** poll honors `interval`, adds +5s on `slow_down`, returns `expired` after `expires_in` (never loops forever); the token is returned once and never logged.
</contracts>

- [ ] **Step 1:** Failing tests first: parse fixtures of GitHub's four poll responses (`authorization_pending`, `slow_down`, `expired_token`, `access_denied`) + success into the typed result. Run: `cargo test -p archie github::` · Expected: FAIL (module missing).
- [ ] **Step 2:** Implement `github.rs`: `reqwest` POST `https://github.com/login/device/code` and `/login/oauth/access_token` (`grant_type=urn:ietf:params:oauth:grant-type:device_code`), `Accept: application/json`; poll loop with the invariants above. Register both commands in `lib.rs` `generate_handler!`.
- [ ] **Step 3:** Run: `cargo test -p archie github::` · Expected: PASS. Then `cargo build` · Expected: clean.
- [ ] **Step 4:** Commit: `feat(tauri): GitHub device-flow commands (gh_device_start/gh_device_poll)`

### Task 4: session-store — keyring commands [Wave 1]

**Orient:** "Stay signed in" (Q-12) — the token persists in the OS keyring only; plaintext-on-disk is a declared kill (PRFAQ).
**Flow position:** `device-auth` → **session-store** → `publish-machine`.
**Skill:** `tdd`
**Files:** Modify: `src-tauri/src/github.rs`, `src-tauri/Cargo.toml` (add `keyring = "3"`), `src-tauri/src/lib.rs`

<contracts>
**Upstream (JS invoke):** `invoke('gh_token_save', { token })` → `boolean` (false = store unavailable, NOT an error) · `invoke('gh_token_load')` → `string | null` · `invoke('gh_token_clear')` → `void`.
**Invariants:** service `"digital.compost.archie"`, user `"github"`; the token is never logged; `clear` after `save(false)` is a no-op, not an error.
</contracts>

- [ ] **Step 1:** Failing test: round-trip save/load/clear against a mock store (`keyring`'s `mock` feature in `#[cfg(test)]`). Run: `cargo test -p archie keyring_roundtrip` · Expected: FAIL.
- [ ] **Step 2:** Implement `gh_token_save(token)/gh_token_load()/gh_token_clear()` — service `"digital.compost.archie"`, user `"github"`. `save` returns `Ok(false)` (not an error) when the platform store is unavailable, so the UI can show "couldn't stay signed in" honestly (GHPAGES-PUBLISH-UX risk: silent save-failure).
- [ ] **Step 3:** Run: `cargo test -p archie keyring_roundtrip` · Expected: PASS.
- [ ] **Step 4:** Commit: `feat(tauri): keyring token persistence (Q-12)`

### Task 5: opener plugin + capability [Wave 1]

**Orient:** The device-code screen's "[Open GitHub to enter it]" needs a system-browser opener; `tauri-plugin-opener` is net-new surface (GHPAGES-PUBLISH-UX flags it).
**Flow position:** Support for `device-auth`'s UI.
**Skill:** `none`
**Files:** Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `apps/studio/package.json` (`@tauri-apps/plugin-opener`)

- [ ] **Step 1:** Add plugin (Rust + JS), register in `lib.rs`, add capability entry permitting `https://github.com/login/device`.
- [ ] **Step 2:** Run: `cargo build` and `pnpm --filter @archie/studio exec tsc --noEmit` · Expected: both clean.
- [ ] **Step 3:** Commit: `feat(tauri): opener plugin for device-flow browser handoff`

### Task 6: pack-push — `gh_push_tree` [Wave 2, depends: Task 2]

**Orient:** The upload is ONE pack push (Q-13) — per-blob REST is forbidden here; this is what makes tile-heavy libraries deployable in seconds.
**Flow position:** `tree-stage` → **pack-push** → `pages-enable`.
**Skill:** `tdd`
**Files:** Modify: `src-tauri/src/github.rs`, `src-tauri/src/lib.rs`

<contracts>
**Upstream:** `invoke('gh_push_tree', { dir, owner, repo, branch, token })` — `dir` is an absolute temp-dir path the webview staged via the Tauri fs plugin; contents are the complete site tree (relative URLs — see Open Q-E1).
**Downstream:** returns `{ commitSha: string }`; the remote `gh-pages` ref afterward points at a commit whose tree exactly mirrors `dir` (full replacement, matching the JS engine's no-base_tree semantics, `ghpages.ts:154-181`).
**Invariant:** token used only for the push credential callback; never written into `.git/config` inside `dir`.
</contracts>

- [ ] **Step 1:** Failing test (local): `gh_push_tree`-internal `stage_and_commit(dir)` produces a commit whose tree lists exactly the files in a fixture dir (push itself mocked/`--ignored`). Run: `cargo test -p archie stage_and_commit` · Expected: FAIL → implement → PASS.
- [ ] **Step 2:** Implement: `git2` init in `dir` (or `git2::Repository::init` on a temp clone-less repo), add-all, commit (author `Archie <publish@archie.local>`), push `+refs/heads/gh-pages:refs/heads/gh-pages` with `Cred::userpass_plaintext("x-access-token", token)`; map git2 errors → `DeployError{kind:'push'}`.
- [ ] **Step 3:** Live check (user-run, mirrors the probe): `GITHUB_TOKEN=$(gh auth token) cargo test push_live -- --ignored` against the scratch repo · Expected: pushed; note seconds.
- [ ] **Step 4:** Commit: `feat(tauri): gh_push_tree single-pack deploy upload (Q-13)`

### Task 7: repo-ensure + progress phases in ghpages.ts [Wave 2]

**Orient:** Auto repo-create removes friction B ("form assumes the repo exists") — one REST call, reusing the engine's existing `ghJson`/`ghError` plumbing; the engine's upload path is NOT touched (Q-13).
**Flow position:** `tree-stage` → **repo-ensure** → `pack-push`.
**Skill:** `tdd`
**Files:** Modify: `packages/render-core/src/publish/ghpages.ts` · Test: extend the package's existing vitest suite next to it

<contracts>
**Produced (consumed by Task 8):** `ensureRepo(owner: string, repo: string, token: string): Promise<'created' | 'exists'>` — POST `/user/repos {name, private:false}`, NO `auto_init`; 201→'created', 422→'exists', anything else throws via the module's existing `ghError`.
**Invariant:** never repoints or mutates an existing repo — creation only.
</contracts>

- [ ] **Step 1:** Failing vitest (fetch mocked): `ensureRepo(owner, repo, token)` POSTs `/user/repos {name, private:false}` (NO `auto_init` — the engine self-creates the branch ref, GHPAGES-PUBLISH-UX correction); 201 → `created`, 422 → `exists`, else throws `ghError`. Run: `pnpm --filter @render/core exec vitest run -t ensureRepo` · Expected: FAIL → implement → PASS.
- [ ] **Step 2:** Extend the `PublishProgress` union with `creating-repo` and `pushing` variants; update the stale "fine-grained PAT" header comment; add the Q-13 note above `publishToGitHub` ("legacy browser-PAT path — do not extend; see docs/decisions/archie.md Q-13").
- [ ] **Step 3:** Run: `pnpm --filter @render/core exec vitest run` · Expected: full suite PASS (union extension may touch exhaustive switches — fix them).
- [ ] **Step 4:** Commit: `feat(render-core): ensureRepo + creating-repo/pushing progress phases`

### Task 8: tree-stage + orchestration — deploy-flows [Wave 2, depends: 1,6,7]

**Orient:** The one function the Publish button calls: stage the published tree to a temp dir, ensure the repo, pack-push, enable Pages, return the live URL.
**Flow position:** `publish-machine` → **tree-stage → repo-ensure → pack-push → pages-enable** → `success-url`. NEW module — deliberately not in `publish-flows.svelte.ts` (Issue 11 churn).
**Skill:** `tdd`
**Files:**
- Create: `apps/studio/src/deploy/deploy-flows.svelte.ts` · Test: `apps/studio/src/deploy/deploy-flows.test.ts`

<contracts>
**Upstream:** reuses `projectSite()`-equivalent via `publishLibrary` → `MemoryFilesystem` exactly as `publish-flows.svelte.ts:152-159` does (import from `@render/core`, don't import the churny flows module); writes to a temp dir via the Tauri fs plugin path APIs.
**Downstream:** `deployToPages(session: DeploySession, target: DeployTarget, onProgress: (p: DeployProgress) => void): Promise<{ url: string; commitSha: string }>` — `url` from `pagesUrlFor(owner, repo)` (`ghpages.ts:132-137`). `enablePages()` false → resolve with `{url, commitSha, manualPagesNeeded: true}` (drives the `manual-pages` state; never throws for that case).
</contracts>

- [ ] **Step 1:** Failing vitest with `invoke`, fetch, and fs mocked: happy path emits progress phases in order `staging → creating-repo → pushing → enabling-pages`; 422-exists path skips nothing; enablePages-false sets `manualPagesNeeded`. Run: `pnpm --filter @archie/studio exec vitest run deploy-flows` · Expected: FAIL → implement → PASS.
- [ ] **Step 2:** Implement, including remembered target per library (`localStorage` key `archie:deploy:<libraryId>` storing `DeployTarget` + url — never the token) for the `update-confirm` return visit.
- [ ] **Step 3:** Run: `pnpm --filter @archie/studio exec vitest run` · Expected: suite PASS.
- [ ] **Step 4:** Commit: `feat(studio): deployToPages orchestration (stage→ensure→push→enable)`

### Task 9: sign-in flow + session state [Wave 3, depends: 1,3,4]

**Orient:** Wraps the Rust auth commands into one `signInWithGitHub()` the UI can await, with "stay signed in" (Q-12) and fork-safe config.
**Flow position:** `publish-machine` → **device-auth/session-store** wrapper.
**Skill:** `tdd`
**Files:** Modify: `apps/studio/src/deploy/deploy-flows.svelte.ts` (same module; session half), `archie.config.json` (+`githubOAuthClientId: ""`, `deployToPages: true`) · Test: extend `deploy-flows.test.ts`

<contracts>
**Produced (consumed by Tasks 10–13):** `deviceFlowAvailable: boolean` (false when `githubOAuthClientId` is empty) · `signInWithGitHub(onCode: (c: {userCode: string; verificationUri: string; expiresIn: number}) => void): Promise<DeploySession>` · `persistSession(s: DeploySession): Promise<boolean>` (false = keyring unavailable, surface honestly) · `restoreSession(): Promise<DeploySession | null>` (401 → clears and returns null, never throws) · `signOut(): Promise<void>`.
**Invariant:** `DeploySession.token` stays in memory; only `persistSession` touches the keyring (Q-12).
</contracts>

- [ ] **Step 1:** Failing vitest (invoke mocked): `signInWithGitHub(onCode)` calls `gh_device_start`, surfaces `{userCode, verificationUri}` via `onCode`, polls to a session with `login` fetched from `GET /user`; `persistSession()` calls `gh_token_save` and reports `false` honestly; empty `githubOAuthClientId` → `deviceFlowAvailable === false`. Run/Expected: FAIL → implement → PASS.
- [ ] **Step 2:** Startup path: `restoreSession()` tries `gh_token_load`, validates with `GET /user` (401 → clear + signed-out, never an error dialog).
- [ ] **Step 3:** Run: `pnpm --filter @archie/studio exec vitest run` · Expected: PASS.
- [ ] **Step 4:** Commit: `feat(studio): GitHub sign-in + session (device flow, keyring, fork-safe client_id)`

### Task 10: publish-machine — Publish.svelte core states [Wave 4, depends: 8,9]

**Orient:** The user-visible feature: replace the 5-field PAT wall with the GHPAGES-PUBLISH-UX state machine; today's form survives verbatim as `advanced`.
**Flow position:** `dialog-chooser` → **publish-machine** → flows.
**Skill:** `interface-design` (dialog copy: follow `product-copy` voice — these tasks are copy-heavy)
**Files:** Rewrite: `apps/studio/src/Publish.svelte` · Test: `apps/studio/src/Publish.test.ts` (state transitions; render smoke via existing component-test pattern)

- [ ] **Step 1:** State machine + copy EXACTLY per GHPAGES-PUBLISH-UX §Every-dialog-state for: `intro-desktop`, `device-code` (pre-copied code, countdown from `expiresIn`, auto-advance, `auth-cancelled` restart), `publishing` (stepped checklist mapping `DeployProgress`), `success` (hero URL + first-build note + "hit Publish again to update"), `error` (plain-language 401/403/404 + "Sign in again" on 401), `advanced` (today's form, verbatim), `web-intro` (`!isTauri()` — zip/`?src=` primary + advanced link + desktop pointer).
- [ ] **Step 2:** Failing component tests for transitions: intro→device-code→(poll success)→name-site; poll `denied`→auth-cancelled; `!isTauri()`→web-intro; `deviceFlowAvailable=false`→advanced-only intro. Run: `pnpm --filter @archie/studio exec vitest run Publish` · Expected: FAIL → implement → PASS.
- [ ] **Step 3:** Commit: `feat(studio): Publish.svelte state machine (device-flow happy path + honest web degrade)`

### Task 11: name-site + live preview + name-taken + repo-picker [Wave 4, depends: 10]

**Orient:** The one novice input — site name with a live "Your site will live at ___" preview; PRFAQ item 3 adds publishing into an existing repo.
**Flow position:** inside **publish-machine**, before `tree-stage`.
**Skill:** `interface-design` (dialog copy: follow `product-copy` voice — these tasks are copy-heavy)
**Files:** Modify: `apps/studio/src/Publish.svelte` · Test: extend `Publish.test.ts`

- [ ] **Step 1:** `name-site` state: field prefilled with slugified library title; live preview via `pagesUrlFor` (user-site vs project-site aware, incl. the `{login}.github.io` tip); bare-name validation (reject URLs/`owner/repo`); "Anyone with the link can see it" toggle (public only at launch — PRFAQ).
- [ ] **Step 2:** `name-taken`: on 422 from `ensureRepo` when the user chose "new site", offer **[Use a new name] / [Update the existing site]** (the picker: a `GET /user/repos?per_page=100` list filtered client-side, shown only from "Publish somewhere else…" / name-taken — not on the happy path).
- [ ] **Step 3:** Tests for: slug validation, preview switching at `login.github.io`, 422 branch. Run: `pnpm --filter @archie/studio exec vitest run Publish` · Expected: PASS.
- [ ] **Step 4:** Commit: `feat(studio): name-your-site screen with live URL preview + existing-repo path`

### Task 12: update-confirm, sign-out, manual-pages, custom-domain guidance [Wave 4, depends: 10,11]

**Orient:** The return visit is the retention loop: "Update {url} with your latest changes?" — one click, no re-auth (Q-12); plus the honest fallbacks.
**Flow position:** inside **publish-machine**; consumes remembered target from Task 8.
**Skill:** `interface-design` (dialog copy: follow `product-copy` voice — these tasks are copy-heavy)
**Files:** Modify: `apps/studio/src/Publish.svelte` · Test: extend `Publish.test.ts`

- [ ] **Step 1:** `update-confirm` (session + remembered target → one-line confirm, **[Publish update]**, quiet "Publish somewhere else…"); sign-out affordance ("Signed in as @login · Sign out" → `gh_token_clear`).
- [ ] **Step 2:** `manual-pages` (only when `manualPagesNeeded`): numbered steps + deep link `https://github.com/{owner}/{repo}/settings/pages` + **[I did it — recheck]** re-calling `enablePages`.
- [ ] **Step 3:** Custom-domain guidance (PRFAQ item 5 — LAST cut line): a collapsed "▸ Use your own domain" note on `success` linking GitHub's CNAME docs; copy only, no automation.
- [ ] **Step 4:** Tests: update-confirm renders when target remembered; sign-out clears and returns to intro. Run/Expected: PASS. Commit: `feat(studio): re-publish, sign-out, manual-pages fallback, domain guidance`

### Task 13: dialog-chooser rewiring + flag [Wave 4, depends: 10]

**Orient:** "Publish to the web" becomes the headline action; the zip/share path stays for drafts (Q-3: publish = durability, share-link = draft).
**Flow position:** **dialog-chooser** → `publish-machine`.
**Skill:** `interface-design` (dialog copy: follow `product-copy` voice — these tasks are copy-heavy)
**Files:** Modify: `apps/studio/src/PublishDialog.svelte` (chooser `:126-142`, keep share card `:145-170`), `apps/studio/src/App.svelte` (ONE wiring site — coordinate: hot file)
**Codebooks:** none

- [ ] **Step 1:** Chooser: primary card **"Publish to the web"** (routes to the machine, desktop and web — the machine itself degrades honestly); keep Locally + Save-a-copy cards with current behavior; gate the new card on `deployToPages` from `archie.config.json` (false → today's `ongithub` behavior, the escape hatch).
- [ ] **Step 2:** `App.svelte`: pass the new machine's props at the existing `<Publish…>` mount — smallest possible diff; re-verify anchors against main before editing (Issue 11 churn).
- [ ] **Step 3:** Run: `pnpm --filter @archie/studio exec vitest run && pnpm --filter @archie/studio exec tsc --noEmit` · Expected: PASS/clean. Commit: `feat(studio): "Publish to the web" leads the publish chooser (flag: deployToPages)`

### Task 14: End-to-end verification [Wave 5, depends: all]

**Orient:** PRFAQ's launch-acceptance inherits the probe's kill criterion — no terminal step, no proxy, live well under 10 minutes — verified on the real app, not just tests.
**Flow position:** whole flow.
**Skill:** `verify` (drive the app; user-in-loop for the live GitHub leg)
**Files:** none (evidence → `ledgers/SCALE.md`-style rows in a new `ledgers/DEPLOY-VERIFY.md`)

- [ ] **Step 1:** Full suites: per-package vitest, `cargo test -p archie`, `pnpm --filter @archie/studio exec tsc --noEmit`, `bash scripts/build-gh-pages.sh` (CI parity). Expected: all green.
- [ ] **Step 2:** Dev Tauri app, signed-out → live URL: time it; verify the deployed site **renders standalone** (relative URLs — Open Q-E1) including one DZI object and one annotation popup; record minutes in the ledger.
- [ ] **Step 3:** Re-publish after an edit → `update-confirm` one-click; restart app → session restored from keyring; sign out → keyring empty (`gh_token_load` returns none).
- [ ] **Step 4:** Browser build (`pnpm --filter @archie/studio dev` in Firefox): chooser leads honest (`web-intro`), advanced PAT form still publishes a small tree. Record. Commit ledger: `docs: DEPLOY-VERIFY ledger — publish-to-web acceptance`

---

## Execution Waves

- **Wave 0:** Task 1 — contracts. *(serial)*
- **Wave 1:** Tasks 2 [SPIKE], 3, 4, 5 *(parallel)* — depends on Wave 0.
- **Wave 2:** Tasks 6 (needs spike 2), 7 *(parallel)*, then 8 — depends on Wave 1.
- **Wave 3:** Task 9 — depends on Tasks 3, 4 (can overlap Wave 2 after they land).
- **Wave 4:** Tasks 10 → 11 → 12; 13 after 10 *(11/12/13 partially parallel)* — depends on Waves 2–3.
- **Wave 5:** Task 14 — depends on all.

Appetite fit: Waves 0–2 ≈ week 1; Wave 3 + Task 10 ≈ week 2; Tasks 11–13 ≈ week 3; Task 14 + slack ≈ week 4. PRFAQ cut order if over (5→4→3→simplify 2, fixed in PRFAQ §Appetite): Task 12 Step 3 (item 5, domain guidance) → web-intro polish in Task 10 (item 4 — the honest degrade copy itself is never cut, only its polish) → Task 11 Step 2's picker (item 3, keep name-taken minimal) → simplify the Task 10 progress checklist (item 2). **Task 10's core path is never cut** (PRFAQ).

## Open Questions

### Blocking
- **Q-B1 (Task 3/9): OAuth App registration.** The user must register an OAuth app (device flow ENABLED, scope `repo`) and provide the `client_id` for `archie.config.json`. Until then: dev/test via mocks + the PAT `advanced` path; the demo of the full happy path waits on this. *(Owner: user; 10 minutes on github.com/settings/developers.)*
- **Q-B2 (Task 2 → 6): does `git2` build & push inside this Tauri env?** Spike answers; fallback `gix`, never per-blob REST (Q-13).

### Exploratory
- **Q-E1 (Task 8/14):** Is the `publishLibrary` tree fully self-viewing when served from `https://{login}.github.io/{repo}/` (relative URLs only — `astro.config.mjs:6` bakes base only for the *apps*, and the existing GitHub path shipped, so assumed yes)? Verified live in Task 14 Step 2. **Deliberate de-scope of PRFAQ's 'base-path rebuild' line:** the architecture recon showed base is baked only into the Astro *apps* builds (scripts/build-gh-pages.sh), not the publishLibrary tree, and the existing project-site GitHub path shipped working. Contingency if false: one added Wave-2 task fixing the projection's URL emission in render-core (bounded — the projection has one URL-writing seam per ADR-0013/0014); fits the appetite.
- **Q-E2 (Task 8):** Temp-dir staging cost for a large library (tile-heavy) — if copying `MemoryFilesystem`→disk dominates, stage directly from the folder-bound library dir when available (dirty-tracked by Phase 1.1).
- **Q-E3 (Task 12):** Is a `GET /repos/{o}/{r}/pages` status=`built` poll worth a `pages-building` state, or does the "refresh in a moment" copy suffice? (Prior art: optional.)
- **Q-E4 (packaging, deferred):** Flatpak — keyring via Secret portal, opener portal, git2/openssl in the sandbox (`docs/plans/tauri-port.md` territory; explicitly out of this plan, noted for the packaging pass.)
- **Q-E5 (Task 3):** device-code rate limit is 50/hr/app — surface `device_flow_disabled`/rate-limit as developer-facing diagnostics only.

## Artifact Manifest

<!-- PLAN_MANIFEST_START -->
| File | Action | Marker |
|------|--------|--------|
| `apps/studio/src/deploy/types.ts` | create | `DeploySession` |
| `src-tauri/src/github.rs` | create | `gh_device_start` |
| `src-tauri/src/lib.rs` | patch | `gh_push_tree` |
| `src-tauri/Cargo.toml` | patch | `keyring` |
| `src-tauri/capabilities/default.json` | patch | `opener` |
| `packages/render-core/src/publish/ghpages.ts` | patch | `ensureRepo` |
| `apps/studio/src/deploy/deploy-flows.svelte.ts` | create | `deployToPages` |
| `apps/studio/src/Publish.svelte` | patch | `device-code` |
| `apps/studio/src/PublishDialog.svelte` | patch | `Publish to the web` |
| `archie.config.json` | patch | `githubOAuthClientId` |
| `docs/spikes/2026-07-git2-in-tauri.md` | create | `vendored-openssl` |
| `ledgers/DEPLOY-VERIFY.md` | create | `kill criterion` |
<!-- PLAN_MANIFEST_END -->

## Q-Reference Summary

| Decision ID | Title (short) | Applied in |
|-------------|---------------|------------|
| Q-12 | Desktop token persists in OS keyring (supersedes token-not-stored, desktop only) | Task 1, Task 4, Task 9, Task 12 (Wave 1/3/4) |
| Q-13 | Desktop upload = single-pack git2 push; per-blob REST legacy browser-PAT only | Task 1, Task 2, Task 6, Task 7 (Wave 1/2), Open Q-B2 |
| Q-3 | Publish = durability only; share-link = draft | Task 13 chooser copy (Wave 4) |

## Shape Changes Summary

| Date | Role | Finding | Summary |
|---|---|---|---|
| 2026-07-05 | author | — | Initial plan from PRFAQ.md + probe ledger + GHPAGES-PUBLISH-UX prior art |
| 2026-07-05 | author | plan-review | Skill annotation fixed (frontend-design→interface-design ×4); cut order re-aligned to PRFAQ 5→4→3→simplify-2; Q-E1 de-scope made explicit with contingency; contracts blocks added to Tasks 4/7/9 |
