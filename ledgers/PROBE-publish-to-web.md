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
| A6 | A single-pack `git push` over HTTPS (one upload, no per-file limit; product analogue = `git2`/`gitoxide` in the Tauri shell — still no terminal, no proxy) + one Pages API call goes live within budget | **RISKIEST (revised)** | `scripts/probe-deploy-pages-v2.mjs`, run by the user 2026-07-05 | Pack push of 554 files: 4.3s. Pages enabled at 5.0s. Root URL live at **35.3s** — 0.6 min against a 10-min budget | **confirmed** |
| A3 | The seed published tree is within API rate/size budgets | no | Measured on main | 554 files / 34 MB; largest dirs are annotation-history JSONs, not DZI tiles. 554 blob creates ≪ 5,000 req/hr authenticated limit | **confirmed** |
| A4 | Published-to-live < 10 min (upload + Pages build latency) | no (rides A2/A6) | Timed end-to-end by the A6 script, including the Pages-build poll | **0.6 min** end-to-end (`https://micahchoo.github.io/archie-pages-probe/` live at 35.3s) | **confirmed** |
| A5 | Token can be held safely (keyring / memory-only, never in library or published tree) | no | Not probed — build-phase concern; noted so the build session inherits it | — | deferred-to-build |

**A2/A4 run instructions (for the user — the probe needs your GitHub account):** `gh` is already
authenticated in this environment (account `micahchoo`, `repo` scope — sufficient; no PAT needed).
The agent-side run was denied by the sandbox (bulk push of the tree to a new public repo with a
live token — correct call for auto mode), so fire it yourself from the repo root:

```
GITHUB_TOKEN=$(gh auth token) node "$(git worktree list | awk '/probe-publish-to-web/{print $1}')/scripts/probe-deploy-pages-v2.mjs" --dir gh-pages-dist --repo archie-pages-probe
```

(v1 was run 2026-07-05 and refuted A2 — see the row above; v2 tests A6, the single-pack push.
The repo may already exist from the v1 attempt; v2 tolerates that and force-pushes.) It prints
per-step timing and the live URL, and exits 2 with a KILL line if not live within 12 min. Cleanup
is manual (`delete_repo` scope absent): delete `micahchoo/archie-pages-probe` on github.com when
the probe is verdicted.

**Caveat for reading the result:** `gh-pages-dist` was built with this repo's own base path, so
the probe site's assets may 404 under `/archie-pages-probe/` — irrelevant to A2/A4, which judge
deploy mechanics and latency (root `index.html` returning 200), not asset resolution. The real
feature would build with the target repo's base path.

## Verdict

**pursue** (2026-07-05). Kill criterion tested and not met: no terminal step in the product flow,
no proxy, 0.6 min to a live URL — 16× inside the 10-minute budget. Two probe runs; the first
refuted the naive mechanism (A2, per-blob REST) and the revision (A6, single-pack push) confirmed
decisively.

**What the build session inherits (with this ledger):**
- Upload mechanism: single-pack git push — embed `git2`/`gitoxide` in `src-tauri` (Rust side has
  unrestricted network; webview CSP untouched). REST is still right for repo-create + Pages-enable
  (2 calls). Never per-file REST uploads (A2).
- Auth: PAT-paste works today with zero registration; device flow is nicer UX but needs a
  registered OAuth `client_id` — a central artifact for a forkable product. Product decision.
- Token storage: keyring / memory-only, never in the library or published tree (A5, deferred here).
- Base path: the flow must rebuild the tree with the target repo's base path — the probe site's
  asset 404s are this, not a deploy failure.
- Flag `archie.deployToPages` in `PublishDialog.svelte`; the dialog's "To GitHub Pages" copy
  (README.md:234-243 ritual) is what this replaces.

**Cleanup:** delete `micahchoo/archie-pages-probe` on github.com (token here lacks `delete_repo`).
Branch `probe/publish-to-web` is handed onward with the slice, per the loop (deleted only on kill).
