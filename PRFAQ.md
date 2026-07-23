# PRFAQ — Publish to the web

**Provenance:** DIVERGENCES.md divergence 1 (publish-to-web), probe verdict *pursue* 2026-07-05
(`ledgers/PROBE-publish-to-web.md`), pr-faq interview with the user 2026-07-05. This document is
the spec handed to the build session, together with the probe ledger's "What the build session
inherits" section.

---

## Press release (draft)

**Archie publishes your exhibit to the web — one motion, a URL you own.**

Archie Studio can now put your annotated exhibit on the web in under a minute — published to a
GitHub repository *you* own, with a permanent URL you can cite, share, and embed. No server, no
platform, no terminal.

Until today, the publish dialog's last screen was a chore list: upload this zip to your own site,
a GitHub release, or the Internet Archive; paste the URL back; or leave the app entirely for a
`pnpm build`-commit-Actions ritual. The scholars and curators Archie exists for — people with
primary sources and no server budget — stalled exactly there. Now the dialog does the job it was
describing: connect your GitHub account with a six-digit code, click **Publish to the web**, and
Studio pushes your built exhibit to your repository and hands back the live address. In our
timing run, a 554-file exhibit went from local folder to live URL in 36 seconds.

The exhibit lands as a plain static site in a standard git repository under your account — clone
it, move it, host it anywhere else, or hand the URL to a citation manager. Archie still never runs
a server and never holds your work.

---

## FAQ

**Who is this for?** The no-server scholar/curator — Archie's own adoption-wedge persona
(`README.md:82`, "keep it *yours*, not a platform's"). Their struggling moment is the hosting
step: the exhibit is finished, and nothing they can click makes it public.

**Is it valuable — what's the evidence?** Repo-channel, two vantages: the product's own dialog
narrates the manual workaround (`PublishDialog.svelte:149-150,168`), and the README documents the
terminal ritual it replaces (`README.md:234-243`). Copy that narrates a manual step is a feature
request written in the product's own words.

**Is it usable — what's the aha moment and how fast?** First run: a GitHub device-flow screen (a
six-digit code, entered on github.com — no developer settings, no token pasting), then one button.
Aha = the live URL appearing in under a minute (probe: 0.6 min end-to-end). A paste-a-token field
remains in settings as the fallback for forks, air-gapped setups, and the distrustful.

**Is it feasible?** Probed, not believed (`ledgers/PROBE-publish-to-web.md`): repo create + Pages
enable are two REST calls; the tree upload is a **single git pack push** (per-file REST was
refuted by GitHub's secondary rate limit at ~500 files — never resurrect it). Build = a
`git2`/`gitoxide` deploy module in `src-tauri`, device-flow + keyring auth, a base-path-aware
rebuild of the tree, and the PublishDialog rewrite. Redeploys ride the incremental dirty-tracked
publish that landed with Issue 11 Phase 1.1 (`1ca4733`).

**Is it viable — what does it cost us to run?** Nothing. The user's own GitHub account hosts;
Archie ships no server, holds no credentials centrally, and the registered OAuth `client_id` is a
public identifier, not a secret.

**Isn't publishing to GitHub just swapping one platform for another?** The exhibit is a plain
static tree in a standard git repository you own. GitHub is a *host you can leave* — `git clone`
takes everything, and the same tree serves from any static host — not a format or account that
owns your work. The deploy module is built as *git remote + host adapter*, so GitLab/Codeberg
Pages are follow-up adapters, not rewrites.

**What about forks of Archie?** The canonical build ships its `client_id`; a fork sets its own in
config or simply relies on the PAT field. No fork is dead on arrival.

**Where does my token live?** OS keyring via the Tauri shell; memory-only for the session where a
keyring is unavailable. Never in the library, never in the published tree, never in config files.
(Plaintext-on-disk is a kill for the auth path — see kill criteria.)

**I use Studio in a browser tab, not the desktop app.** The button appears there too, degraded
honestly: the browser can't pack-push, so it prepares everything it can (creates the repo,
builds the tree with the right base path, stages the zip) and walks you through the one step it
can't do for you. The full one-motion experience is the desktop app's.

**What about huge, tile-heavy libraries?** The pack push is one upload regardless of file count —
that's why it was chosen. Redeploys push only the dirty scope.

**Can the exhibit be private?** GitHub Pages on the free tier serves public repositories only.
Launch targets public exhibits (they're for citation); the dialog says so plainly rather than
half-supporting private hosting.

**I already have a repo / a site.** A repo-picker lets you publish into an existing repository
(new repo remains the default); custom domains get guidance in the dialog, not automation.

---

## Appetite

**3–4 weeks** (user-set 2026-07-05). Includes, in build order: (1) core path — button → live URL
on Tauri, device-flow + PAT fallback, keyring storage, base-path rebuild, toast-layer errors;
(2) deploy progress UI; (3) repo-picker; (4) browser-Studio guided path; (5) custom-domain
guidance. If the appetite runs out, cut from the tail: 5 → 4 → 3 → simplify 2. Item 1 is the
feature; it is never cut — if *it* doesn't fit, the bet is re-examined, not stretched.

## Kill criteria (carried forward; fixed)

- Launch acceptance inherits the probe criterion: no terminal step, no proxy server, seed exhibit
  live in well under 10 minutes (probe measured 0.6).
- If device-flow cannot complete from the Tauri shell in practice, ship PAT-first and demote
  device-flow to a follow-up — that demotes a convenience, it does not kill the feature.
- If token storage cannot avoid plaintext-on-disk on a target platform, the auth path ships
  memory-only (re-auth per session) there; shipping plaintext storage is a kill for that path.

## Decided against

- Per-file REST upload — probe-refuted (secondary rate limits); recorded so it isn't re-invented.
- Multi-host (GitLab/Codeberg/self-hosted) at launch — adapter seam instead.
- Automated Internet-Archive zip upload — different job, different guarantees.
- A throttled REST uploader for browser Studio — reintroduces the refuted mechanism.
- Private-repo Pages support beyond an honest sentence in the dialog.

## Status

Divergence 1 Status: **spec'd — PRFAQ.md** (probe verdict *pursue* stands beneath it). Next:
a build session starting from this document + `ledgers/PROBE-publish-to-web.md`; slice reference
on branch `probe/publish-to-web` (never merges).
