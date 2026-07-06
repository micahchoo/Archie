# DEPLOY-VERIFY — publish-to-web acceptance ledger

**Feature:** one-motion GitHub Pages deploy from Studio (DIVERGENCES.md divergence 1 → PRFAQ.md →
docs/plans/PUBLISH-TO-WEB-PLAN.md). **Branch:** `worktree-publish-to-web` @ `006fb67`.
**Kill criterion carried from the probe (ledgers/PROBE-publish-to-web.md, fixed):** no terminal
step, no proxy server, seed exhibit live in well under 10 minutes.

## Automated acceptance — VERIFIED (2026-07-05, orchestrator-run)

| Check | Result |
|---|---|
| Studio unit/component suite | **270 passed** / 21 files (was 171 pre-feature; +99 across Tasks 8-13) |
| render-core suite (ensureRepo, publish) | **737 passed** |
| Rust `cargo test -p archie` (device flow, keyring, git2 stage/commit) | **13 passed, 1 ignored** (`push_live` = user-run live push) |
| Studio `tsc --noEmit` (CI gate) | **exit 0** |
| render-core `tsc --noEmit` | **exit 0** |
| `vite build` (studio) | exit 0, zero new svelte warnings on Publish/PublishDialog/App |

Note: IDE language-server shows exactOptionalPropertyTypes / W3CTarget errors in App.svelte — these
are PRE-EXISTING phantoms (the studio's CLI tsc config, which CI runs, is exit 0; `.svelte`
templates aren't fully typechecked here per `.claude/rules/svelte-no-typecheck-net.md`). Not
introduced by this feature.

## Code-level acceptance — VERIFIED (integration review w4-integration-review, PASS)

- Every one of the machine's 15 `PublishMachineDeps` is supplied with a correct impl; no runtime
  dep-gap/NPE. Full flow-map wired node-for-node: dialog-chooser → publish-machine → device-auth →
  session-store → tree-stage → repo-ensure → pack-push → pages-enable → success-url.
- `initialSession` confirmed genuinely LIVE via getters (the Task-10 review fix): a session
  restored async after mount is picked up — the Q-12 stay-signed-in return path works.
- 3 backing exports match contracts exactly: `checkRepoExists`→bool, `listRepos`→string[],
  `recheckPages`→bool. Token (Q-12) never reaches localStorage / logs / the published tree.
- `projectSiteFs()` reuses the same projection the normal publish path builds — no duplicated
  tiling. PublishDialog escape hatch (`deployToPages` flag off → old ongithub card) intact.
- git2 transport proven end-to-end in the spike (docs/spikes/2026-07-git2-in-tauri.md): DNS, TLS,
  CA verify, smart-HTTP, credential callback all exercised; system-git probe already put 554 files
  live in 0.6 min (Q-13).

## Live acceptance — BLOCKED ON USER (device + account, cannot be faked)

The one-button device-flow → live-URL demo and the Rust pack-push run in the packaged desktop app
against a real GitHub account. Remaining steps, all yours:

1. **Register a GitHub OAuth App** (github.com/settings/developers → New OAuth App), tick
   **Enable Device Flow**, and put its **public Client ID** in `archie.config.json`
   `githubOAuthClientId` (currently `""`, so `deviceFlowAvailable` is false and the one-button
   path is hidden — the advanced PAT path still works without it). NOTE: the value sent earlier in
   chat was the client **secret** (40-hex) — device flow needs no secret; rotate that secret and
   use the short Client ID instead.
2. **Build the packaged Tauri/Flatpak app** — the deploy path is Rust-only and throws off-Tauri by
   design; the browser dev server can only exercise `web-intro` (honest degrade) + the advanced PAT
   form.
3. **Drive the happy path**: Publish to the web → 6-digit code → name site → watch the stepped
   checklist → click the live URL. Confirm: no terminal step, live in <10 min (kill criterion),
   and the deployed site renders standalone incl. one DZI object + one annotation (Open Q-E1 —
   relative-URL self-viewing tree). Then re-publish (update path), restart (keyring session
   restore), sign out (keyring cleared).
4. **Optional — close `push_live`**: `gh repo create <you>/archie-pages-probe --private` then
   `cd src-tauri && GITHUB_TOKEN=$(gh auth token) cargo test push_live -- --ignored --nocapture`.

## Known limitation (logged, not a defect)

**Same-session re-publish returns to intro/name-site, not update-confirm.** `computeInitial()` and
`deployProps.remembered` key off the next-launch `initialSession`/`remembered` sources (populated
at restore / library-switch), not the machine's live `s.session` or the localStorage write that
`rememberTarget` performs after a deploy. So the one-click "Update {url}?" return visit works on
next launch (via keyring restore — the intended path) but not on a second publish within the same
session. Pre-existing Task-10/12 machine behavior, flagged by both the Task-13 implementer and the
integration review; cheap to make reactive later if same-session update matters. Conscious accept
for v1.

## Status

Build + automated + code-level acceptance COMPLETE. Live acceptance pending the user items above.
Divergence 1 remains `spec'd — PRFAQ.md`; on live confirmation it becomes `committed to build`
(already built) → ready to merge `worktree-publish-to-web` after the live pass.
