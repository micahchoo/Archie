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
| A2 | The GitHub REST API alone (repo create → Git Data blobs/tree/commit/ref → enable Pages) can take a built tree to a live Pages URL | **RISKIEST** | `scripts/probe-deploy-pages.mjs` (v1), run by the user 2026-07-05 | **Refuted as stated**: secondary rate limit (HTTP 403) killed the run at ~500 blobs in ~11s — GitHub caps content-generating POSTs (~180/min); per-blob upload is structurally wrong for tile-heavy libraries (thousands of files). Repo create, auth, tree/commit/ref, and Pages APIs themselves all fine | **refuted → superseded by A6** |
| A6 | A single-pack `git push` over HTTPS (one upload, no per-file limit; product analogue = `git2`/`gitoxide` in the Tauri shell — still no terminal, no proxy) + one Pages API call goes live within budget | **RISKIEST (revised)** | `scripts/probe-deploy-pages-v2.mjs`: stages `gh-pages-dist/` into a temp git repo, force-pushes `main` in one pack, enables Pages, polls to 200, prints elapsed | pending user run (see below) | pending |
| A3 | The seed published tree is within API rate/size budgets | no | Measured on main | 554 files / 34 MB; largest dirs are annotation-history JSONs, not DZI tiles. 554 blob creates ≪ 5,000 req/hr authenticated limit | **confirmed** |
| A4 | Published-to-live < 10 min (upload + Pages build latency) | no (rides A2) | Timed end-to-end by the A2 script, including the Pages-build poll | pending | pending |
| A5 | Token can be held safely (keyring / memory-only, never in library or published tree) | no | Not probed — build-phase concern; noted so the build session inherits it | — | deferred-to-build |

**A2/A4 run instructions (for the user — the probe needs your GitHub account):** `gh` is already
authenticated in this environment (account `micahchoo`, `repo` scope — sufficient; no PAT needed).
The agent-side run was denied by the sandbox (bulk push of the tree to a new public repo with a
live token — correct call for auto mode), so fire it yourself from the repo root:

```
GITHUB_TOKEN=$(gh auth token) node "$(git worktree list | awk '/probe-publish-to-web/{print $1}')/scripts/probe-deploy-pages.mjs" --dir gh-pages-dist --repo archie-pages-probe
```

It creates public repo `micahchoo/archie-pages-probe`, prints per-step timing and the live URL,
and exits 2 with a KILL line if not live within 12 min. Cleanup is manual (`delete_repo` scope
absent): delete the repo on github.com afterwards.

**Caveat for reading the result:** `gh-pages-dist` was built with this repo's own base path, so
the probe site's assets may 404 under `/archie-pages-probe/` — irrelevant to A2/A4, which judge
deploy mechanics and latency (root `index.html` returning 200), not asset resolution. The real
feature would build with the target repo's base path.

## Verdict

Pending A2/A4. On confirm → divergence Status `probing → pursue`, hand to a build session with this
ledger. On kill → branch deleted, Status `killed <date, criterion met>`.
