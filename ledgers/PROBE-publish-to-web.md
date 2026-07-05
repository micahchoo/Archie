# PROBE — publish-to-web (DIVERGENCES.md divergence 1)

**Run:** 2026-07-05 · branch `probe/publish-to-web` (isolated worktree; never merges) · flag
`archie.deployToPages` (slice code only; nothing wired into apps this run).

**Kill criterion (declared before any probe code; does not move):** the flow requires a terminal
step or a third-party proxy server (breaking local-first), **or** published-to-live exceeds ~10
minutes on the seed exhibit. Meeting it → Status `killed`, branch deleted, slice deleted.

## Assumption ledger

| # | assumption | riskiest? | probe | result | verdict |
|---|---|---|---|---|---|
| A1 | Auth to GitHub needs no terminal and no proxy: either device-flow from the app, or a pasted fine-grained PAT (created on github.com in a browser — not a terminal step) | co-riskiest | Deps check + endpoint CORS knowledge; in-app device-flow check deferred to build phase | `@tauri-apps/plugin-http` already shipped (`apps/studio/src/../package.json:24`, `src-tauri/Cargo.toml`) — bypasses CORS for `github.com/login/*` device-flow endpoints, which send no CORS headers; `api.github.com` itself is CORS-enabled so the PAT path works even in browser Studio. Device flow needs a registered OAuth `client_id` — a central artifact for a forkable product; product decision, not a blocker (PAT path exists) | **confirmed** (PAT path); device-flow-from-webview rechecked at build |
| A2 | The GitHub REST API alone (repo create → Git Data blobs/tree/commit/ref → enable Pages) can take a built tree to a live Pages URL | **RISKIEST** | `scripts/probe-deploy-pages.mjs` on the probe branch: given `GITHUB_TOKEN`, pushes `gh-pages-dist/` as one commit to a fresh repo, enables Pages, polls to first 200, prints elapsed | pending — needs the user's PAT (repo + pages scopes) and a run | pending |
| A3 | The seed published tree is within API rate/size budgets | no | Measured on main | 554 files / 34 MB; largest dirs are annotation-history JSONs, not DZI tiles. 554 blob creates ≪ 5,000 req/hr authenticated limit | **confirmed** |
| A4 | Published-to-live < 10 min (upload + Pages build latency) | no (rides A2) | Timed end-to-end by the A2 script, including the Pages-build poll | pending | pending |
| A5 | Token can be held safely (keyring / memory-only, never in library or published tree) | no | Not probed — build-phase concern; noted so the build session inherits it | — | deferred-to-build |

**A2/A4 run instructions (for the user — the probe needs your GitHub account):** create a
fine-grained PAT at github.com/settings/personal-access-tokens (repo administration + contents +
pages write, on a throwaway account or scoped to new repos), then in this session type:
`! GITHUB_TOKEN=<token> node scripts/probe-deploy-pages.mjs --dir gh-pages-dist --repo archie-pages-probe`
(script lives on branch `probe/publish-to-web`; run it from that worktree or `git show` it onto a
scratch copy). It creates `archie-pages-probe` on your account, prints the live URL and the elapsed
time, and cleans nothing up — delete the repo afterwards.

## Verdict

Pending A2/A4. On confirm → divergence Status `probing → pursue`, hand to a build session with this
ledger. On kill → branch deleted, Status `killed <date, criterion met>`.
