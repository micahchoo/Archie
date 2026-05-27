# Audit — Publish to GitHub (Studio), end to end

**Date:** 2026-05-26 | **Scope:** the "Publish… → To GitHub Pages" flow inside Studio | **Original verdict: NOT robust yet.** Four common-case failures produced wrong outcomes (Tier 1). **Status (2026-05-26): all tiers fixed — see Resolution.**

> ## Resolution (2026-05-26)
> All Tier-1/2/3 findings below are addressed. Verified: 378 render-core tests pass (incl. 17 new for the network sequence + error mapping, mocked fetch); `@render/core` typecheck clean for publish files; `@archie/studio` builds.
> - **#1** `ghpages.ts` — `ghJson` ok-checks every step and throws `GitHubPublishError` with a status-mapped, actionable cause (token / scope / repo). No more `undefined.sha`.
> - **#2** `publishToGitHub` best-effort enables Pages (`enablePages`, deploy-from-branch) and returns `pagesEnabled`; the form requests `Pages: write` and the success screen is honest (enabled → live URL; not → "enable Pages → Settings → Pages → {branch}"). **Guarantee:** `enablePages` never modifies an existing Pages config — if the repo already serves Pages from a different branch (e.g. a docs site on `main`), it's left untouched and we report `pagesEnabled: false`. We only *create* Pages when none exists.
> - **#3** Blob uploads bounded by `BLOB_CONCURRENCY` (6) via `mapWithConcurrency`.
> - **#4** `App.svelte` `publishSizeOk()` mirrors the download path's `zipSizeOk` threshold before the push.
> - **#5** `publishToGitHub → GitHubPublishResult { commitUrl, pagesUrl, pagesEnabled }`; `contracts.md` updated to match.
> - **#6** `pagesUrlFor(owner, repo)` handles the `{owner}.github.io` user-site case (unit-tested).
> - **#7** `openPublish` projects ONCE and caches the tree; a no-originals publish reuses it (no double projection, no discard-only asset reads).
> - **#8** Force-push is now stated in the form ("Publishing replaces everything on this branch").
> - **#9** Real progress: `publishToGitHub` takes an `onProgress` callback emitting `PublishProgress` (`uploading {done,total}` → `committing` → `enabling-pages`); the dialog shows "Uploading media — n of N…" etc. (unit-tested). **#10** owner/repo validation (`nameError`). **#12** dialog opens immediately, broken-links populate after (no invisible gap).
> - **#11 (token re-paste on error):** intentionally kept — the security stance (drop the secret on every exit) outweighs retry convenience; the now-actionable error messages make the retry purposeful.
> **Not verified by a real publish:** the live GitHub round-trip needs a real repo + PAT (can't run headless). The sequence + error mapping are covered with a mocked `fetch`; a real browser publish remains the final check (per HANDOFF).

The findings below are the **original** audit (all resolved above; kept for provenance). The HANDOFF's "Publish logic-complete" was optimistic — the pure tree-builder was complete; the network adapter and its UX were not.

## The flow, end to end

```
[Publish… button]  App.svelte:1137  publishDialogOpen = true
   → PublishDialog.svelte  "Where to?"  → onclick=ongithub
   → App.svelte:1332  publishDialogOpen=false; openPublish()
       openPublish()  App.svelte:869   ── projects the WHOLE library into a throwaway
                                           MemoryFilesystem just to compute brokenLinks,
                                           then publishOpen = true   [BLOCKING, no feedback]
   → Publish.svelte  "Connect to GitHub"  form: owner / repo / branch / PAT / includeOriginals
       publish()  Publish.svelte:39  phase="publishing"
         → onpublish = App.svelte:866 publish()
             → collectSiteFiles()  App.svelte:858  ── projects the library AGAIN into a
                                                       second MemoryFilesystem, base64s all assets
             → publishToGitHub(files, target)  ghpages.ts:71
                 blobs (Promise.all, unbounded) → git/ref → git/trees → git/commits → git/refs
         → phase="done"  shows commit URL + computed pagesUrl  (token dropped)
```

State: PAT lives only in `Publish.svelte` local state, dropped on done/error/close. That part is correct and matches CONTEXT (never persisted).

## Tier 1 — Blocking (architecture is not robust)

1. **No `res.ok` checks in `publishToGitHub`** (`ghpages.ts:80–99`). Only the base-ref GET tolerates failure (`refRes.ok`, line 88). Every other fetch — blob POST, tree POST, commit POST, ref PATCH/POST — does `await res.json()` and reads `.sha` blindly. On the *most common* real failures (401 bad token, 403 wrong scope / secondary rate-limit, 404 repo not found, 422 validation) the error body has no `.sha`, so `treeSha`/`commit.sha` become `undefined` and the next request sends garbage. The user sees `Cannot read properties of undefined (reading 'sha')` or a downstream 404 — never "bad token" or "repo not found". `Publish.svelte:49` faithfully renders that cryptic `e.message`. **The two most likely user errors produce the least intelligible message.**

2. **GitHub Pages is never enabled, and the requested scope can't enable it.** The flow pushes commits to a `gh-pages` branch but never calls the Pages API (`PUT /repos/{owner}/{repo}/pages`). The success screen (`Publish.svelte:75`) presents `https://{owner}.github.io/{repo}/` as live ("may take a minute to go live"). If the repo has never had Pages configured to deploy-from-branch `gh-pages`, that URL **404s forever** — the push succeeds, the promised site never appears. Worse: enabling Pages via API needs the fine-grained PAT "Pages" permission, but the form label (`Publish.svelte:97`) asks only for `contents:write`. So auto-enable is not merely absent — it's *unreachable* with the scope the UI requests. The comment at `ghpages.ts:61` claims `contents:write + pages:write`; the UI and the code both contradict it.

3. **No concurrency cap on blob uploads** (`ghpages.ts:77–84`). Binary assets upload via `Promise.all(...map(fetch))` — one parallel POST per asset, unbounded. A library with N images fires N simultaneous requests. GitHub's secondary rate limit (403) trips at modest concurrency; a real photo library publish will likely fail partway, landing in Tier-1 issue #1's cryptic-error path.

4. **No size guard on the publish path** — and the download path *has one*. `download()` (`App.svelte:845`) gates on `supportsFileStreamSave() || zipSizeOk()`. `collectSiteFiles()` → `publishToGitHub` (the publish path) has **neither** the size guard nor a streaming fallback. It base64-encodes every asset into one in-memory map and holds it alongside the request payloads. **Most actionable framing: the fix is "port the download path's guards over," not "design from scratch."**

## Tier 2 — Correctness drift (will mislead future work)

5. **Contract spec ≠ impl.** `subsystems/publish/contracts.md:32` declares `publishToGitHub(files, target) → { commitSha, pagesUrl }`. The impl returns `{ commitUrl }` (`ghpages.ts:71,100`); the dialog computes `pagesUrl` itself. The contract doc is stale.

6. **`pagesUrl` assumes a project site.** `Publish.svelte:37` hardcodes `https://{owner}.github.io/{repo}/`. For a repo literally named `{owner}.github.io` (user/org site), the live URL is the root, not `/{repo}/` — the shown link is wrong.

7. **The library is projected twice per publish.** `openPublish()` runs `publishLibrary` into a throwaway FS only to read `brokenLinks`; `collectSiteFiles()` runs it again to actually collect. For a large library that's double the projection cost. The preview pass even passes `getAsset` (`App.svelte:871`), reading and decoding every asset blob purely to discard them — broken-link detection needs the link graph, not the bytes.

8. **Force-push with no warning.** `ghpages.ts:99` does `force: true` (no `base_tree` → full tree replacement). Intentional ("the site IS the library"), but the user is never told publishing **replaces everything** on the target branch. Pointing it at a branch with unrelated content silently destroys it.

## Tier 3 — Polish (iteration fodder)

9. **No progress feedback.** "Publishing…" is the only signal across project → base64 → N blob uploads → tree → commit → ref. A large media library is a long, opaque wait; users will think it hung.
10. **No owner/repo format validation.** Pasting `github.com/foo/bar` or `owner/repo` into one field yields a malformed API URL → confusing 404 (compounds #1).
11. **Token dropped on error forces full re-paste.** `Publish.svelte:51` drops the PAT on error (good security). But transient failures (network, rate-limit) then require re-entering the whole token — rough retry loop, especially paired with #1's cryptic errors.
12. **Invisible gap between menu click and dialog.** `openPublish()` (#7) blocks on a full library projection before `publishOpen = true`; the GitHub dialog appears only after. No "Working…" between the two modals.

## Prior-art context (Gap 2)

`Prior Art/09-web-publishable-serverless.md` Gap 2: browser-only push to a GH-Pages repo from a static SPA has **no prior art** — Archie is doing the unsolved thing. Anvil's own design parked OAuth-push as a "later UX optimization" and relied on GH-Actions `deploy-pages` for *enablement*. The current Studio impl skipped both halves: no OAuth (PAT paste, fine for now), and no enablement step to replace what `deploy-pages` did. Tier-1 #2 is the direct consequence of dropping the enablement half.

## What's solid (don't touch)

- `collectFiles` / `buildGitTree` are pure and tested (chunked base64, deterministic sort, text/binary split) — the foundation is sound.
- PAT lifecycle (paste-each-publish, dropped on every exit) is correct.
- Broken-link surfacing in the dialog (amber, "degrades to plain text") is good honest UX — the right idea, just computed wastefully (#7).
- "Publish = same projection, different sink" (zip / folder / GH share `publishLibrary`) is the right architecture.
