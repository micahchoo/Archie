# GitHub Pages publishing UX — redesign for GitHub novices

Status: proposal · Author: product-design + architect · Date: 2026-06-20
Scope: front-of-house + auth redesign of the GitHub-Pages publish path. The push engine is reused unchanged.

## Answer

Yes — there is a near-zero-friction path, and it is **runtime-conditional, desktop-first**. The redesigned experience is a single confident **"Publish to the web"** action that, on the Tauri desktop build, signs the user in with one click via GitHub's **OAuth Device Authorization Grant** (no token, no PAT page, no scope-picking), **creates the repository for them**, pushes, and turns Pages on — showing one input (the site name) with a live **"Your site will live at ___"** address preview, then a clickable live URL. The password/token field is deleted from the happy path and survives only behind an **"I already use GitHub →"** advanced disclosure. In a plain browser the device flow is impossible (the `github.com/login/*` endpoints send no CORS headers) and there is no safe secret store, so the dialog **honestly degrades** to the existing zip + `?src=` shareable-link path and points the user to the desktop app for a permanent owned site. This is a front-of-house + credential redesign: the token-agnostic push engine (`ghpages.ts`) is reused as-is.

The chosen design is candidate 3 ("Publish to the web — one button, progressive disclosure"), grafting the runner-up's guided naming/preview screen and its honest error-recovery copy, and **correcting** two mechanical claims the runners-up got wrong (keychain does not yet exist; the engine's `gh-pages` branch is self-created, so `auto_init` is not needed for branch existence).

## Today friction (interface)

The two dialogs are `apps/studio/src/PublishDialog.svelte` (the chooser) and `apps/studio/src/Publish.svelte` (titled "Connect to GitHub", a flat 5-field form).

- **(A) The PAT field is a wall.** `Publish.svelte:124-126`:
  `Access token (fine-grained, with Contents and Pages write access)` → `<input type="password" placeholder="github_pat_…">`. No link, no walkthrough — a novice cannot produce a fine-grained PAT scoped to Contents+Pages write. This is the #1 blocker.
- **(B) No repo creation.** `Publish.svelte:118-119`: `Owner <input placeholder="your-username">` / `Repository <input placeholder="my-exhibit">`. The form assumes the repo already exists; a wrong/absent name → 404. Nothing creates the repo or links to repo creation.
- **(C) Git jargon.** `Publish.svelte:122-123`: `Branch <input placeholder="gh-pages">` and `Publishing replaces everything on this branch with the current library`. "Branch", "gh-pages", "replaces everything" are unexplained and scary.
- **(D) Invisible site-naming.** `pagesUrlFor()` already distinguishes user-site (`{owner}.github.io`, served at root) from project-site (`/{repo}/`), but the form never surfaces it — a novice cannot deliberately choose their URL.
- **(E) Paste-each-publish.** `Publish.svelte:65,69,74`: `token = ""` after publish/error. Every re-publish re-requires finding and pasting a token (correct per the "token not stored" decision — but punishing).
- **(F) Manual Pages toggle.** `Publish.svelte:97-98` done-screen fallback: `Your files are on the gh-pages branch. One step left… Open Settings, then Pages, choose Deploy from a branch…` — fires whenever `enablePages()` returns false.

Note: the chooser's "Locally" card (`PublishDialog.svelte:154-155`) is itself noob-hostile — `pnpm --filter @archie/viewer dev` then `http://localhost:4321` in a terminal. Out of scope here but flagged.

## What already works

`packages/render-core/src/publish/ghpages.ts` is the solid, **token-agnostic** push engine — this redesign does **not** touch it:

- `publishToGitHub(files, target{owner,repo,branch,token}, onProgress)` (verified `ghpages.ts:154-181`) uploads binaries as base64 git blobs (bounded `BLOB_CONCURRENCY = 6`), builds a full-replacement git tree (no `base_tree`), commits, force-updates the branch ref, then best-effort `enablePages()`.
- **Auth header is type-agnostic:** `Authorization: Bearer ${target.token}` (`ghpages.ts:157`). A device-flow OAuth token (`gho_…`) drops into `target.token` with **zero engine changes**. The header comment still says "fine-grained PAT" — copy to update, not code.
- **Branch is self-created.** `ghpages.ts:174-179`: a missing branch (404 on `git/ref/heads/{branch}`) is fine — the engine `POST`s a new ref. So Pages lands on `gh-pages`, which the engine creates itself. (This corrects the runners-up's `auto_init` reasoning: `auto_init` is **not** needed for a default branch to exist for publishing.)
- `enablePages()` (`ghpages.ts:185-199`) is deliberately conservative: it **never repoints** an existing Pages config (won't hijack a docs site on `main`); returns true only if Pages now serves *our* branch; 201/409 both count as on. False ⇒ the honest manual-steps fallback.
- `pagesUrlFor(owner, repo)` (`ghpages.ts:132-137`) computes user-site vs project-site — this directly powers the new live "your site will live at ___" preview.
- `PublishProgress` union (`uploading{done,total} | committing | enabling-pages`) drives the progress UI.
- Orchestration: `createPublishFlows()` in `apps/studio/src/publish-flows.svelte.ts:203-204` already wraps the engine as `publish(target, opts, onProgress)`; `isTauri()` (`tauri-fs.ts:14`) is the proven runtime branch; the `?src=` zip share-link path (`PublishDialog.svelte:36-53`) is the web fallback.
- Tauri capability `http:default` already allows `https://**` and `http://**` (`capabilities/default.json:9-12`), so `api.github.com` calls and the Rust device-flow `POST`s need **no new HTTP grant**.

## Recommended publishing UX

Runtime-conditional. **Desktop** gets the full one-button experience; **web** gets the honest zip path. Below is the desktop happy path click-by-click, then every state.

### Click by click (desktop, first run)

1. **Studio top bar:** the button reads **"Publish to the web"** (was a generic "Publish"). One click opens the dialog. The recommended path *is* the default — no chooser-of-three gate first.
2. **Intro (signed-out):**
   Headline: **"Put this on the web — free, and it's yours."**
   Subline: *"Archie publishes your library as a real website on GitHub Pages. It's free, permanent, and the address belongs to you."*
   Primary: **[ Continue with GitHub ]**. Quiet links: *"No GitHub account? Make one free"* (opens github.com) and *"I already use GitHub →"* (opens Advanced). **No token field on this screen.**
3. **Device-code / sign-in:** dialog swaps to:
   Headline: **"One quick step to connect."**
   A large monospace code — **`WDJB-MJHT`** — pre-copied to clipboard, with **[ Copy code ]**.
   Primary: **[ Open GitHub to enter it ]** (opens `https://github.com/login/device` in the system browser).
   Helper: *"Paste the code there and click Authorize. We'll pick it up automatically — come back here."*
   Subtle: *"This code works for 15 minutes."* + spinner *"Waiting for you to authorize on GitHub…"*
4. **Auto-advance:** the Rust poller gets the token the instant the user authorizes; the dialog advances itself (no "Next"). The token is **never shown**. One check, default ON: **☑ Stay signed in on this computer**. Brief confirm: *"You're connected as @micah."*
5. **Name your site** (the only novice input):
   Headline: **"Name your site."**
   One field, prefilled with the slugified library title: `voynich-folios`. Help: *"Letters, numbers and dashes. This becomes part of your web address."*
   Live preview line, updating as they type: **"Your site will live at  https://micah.github.io/voynich-folios/"**. If the name equals `micah.github.io` it switches to **"https://micah.github.io/ (your main site)"** with the tip *"name it micah.github.io to publish to your top-level address."*
   One toggle, default ON, plain words: **☑ Anyone with the link can see it** (the public/private choice — never the word "private"; GitHub Pages on free accounts is simplest public).
   Primary: **[ Publish ]**. No branch, no owner, no token visible.
6. **Publishing:** stepped checklist that ticks in order:
   *Creating your site's home on GitHub… → Uploading your library — 12 of 40 images… → Saving everything… → Switching your site on…*
   Footer: *"This usually takes under a minute. You can leave this open."* (Maps `PublishProgress` verbatim, with a new leading `creating-repo` step.)
7. **Success:**
   Headline: **"Your site is live."** The URL is the hero, big and clickable: **`https://micah.github.io/voynich-folios/`** with **[ Open my site ]** (primary) and **[ Copy link ]**.
   Quiet: *"GitHub may take a minute to finish the first build — if it's blank, refresh in a moment."* and *"Made changes? Just hit Publish to the web again — it updates the same site."* A collapsed **▸ Details** reveals the commit link for the curious.
8. **Second publish (signed in, site named):** the dialog skips straight to a one-line confirm — *"Update micah.github.io/voynich-folios with your latest changes?"* — primary **[ Publish update ]**, quiet *"Publish somewhere else…"*. No re-auth, no re-typing.

### Every dialog state

| State | What it shows |
|---|---|
| `intro-desktop` | "Put this on the web — free, and it's yours." · **[Continue with GitHub]** · quiet "make an account" + "I already use GitHub →". No token field. (Shown only when no stored session.) |
| `device-code` | Large copyable `user_code` (pre-copied), **[Open GitHub to enter it]**, 15-min countdown from `expires_in`, "Waiting for you to authorize…" spinner. Auto-advances on poll success; auto-restarts on `expired_token`. |
| `device-code` sub-states | `authorization_pending` → "Waiting…"; `slow_down` → silently widen poll interval +5s, no UI change; success → brief "Connected as @handle" then advance. |
| `auth-cancelled` | "Sign-in was cancelled. No problem — try again when you're ready." · **[Try again]** (must restart — the old code is dead, non-reusable per spec). |
| `auth-config-error` | `device_flow_disabled` → distinct developer-config message (App registration missing device-flow), not shown to end users in normal operation. |
| `name-site` | Site-name field (slug help) + live **"Your site will live at ___"** preview (project- vs user-site aware via `pagesUrlFor`) + "Anyone with the link can see it" toggle (default on) + **[Publish]**. Reuses existing bare-name validation (reject pasted URLs / `owner/repo`). |
| `name-taken` | Inline, post-submit (422 from repo-create): "You already have a site called voynich-folios. Pick another name, or update the existing one." · **[Use a new name]** / **[Update the existing site]**. |
| `publishing` | Stepped checklist: creating-repo → uploading (n of N) → committing → enabling-pages, with "under a minute, you can leave this open." |
| `pages-building` (optional) | If we poll `GET /pages` and status ≠ `built`: "Your files are up — GitHub is building the site…" Degrades to the success note rather than blocking. |
| `success` | "Your site is live." · hero URL · **[Open my site] [Copy link]** · first-build-delay note · "hit Publish again to update" · collapsed ▸ Details (commit link). |
| `update-confirm` (return visit) | One-line "Update {url} with your latest changes?" · **[Publish update]** · "Publish somewhere else…". |
| `manual-pages` (fallback) | Only if `enablePages()` returned false (org policy / private repo): "Almost done — one quick switch on GitHub." Numbered steps + deep link to that repo's Settings › Pages + **[I did it — recheck]** (re-polls). Reuses today's honest copy. |
| `error-publish` | Maps existing `ghError` plain-language strings (401/403/404). **[Try again]** + "Sign in again" escape if the token was rejected (401). |
| `advanced` | Today's `Publish.svelte` form verbatim (owner/repo/branch/token/include-originals + broken-links advisory) behind "I already use GitHub →" — for power, air-gapped, enterprise, and pure-web users. |
| `web-intro` (browser only) | "Share your library." Primary = existing zip + `?src=` shareable-link path (with its durability caveat). Subordinate: "Want a permanent site you own? Open Archie on your desktop to publish straight to GitHub" + one-line reason (GitHub sign-in can't run safely from a browser tab). |

### ASCII wireframes (the three key screens)

```
┌─ Publish to the web ───────────────────────────────┐   ┌─ Publish to the web ───────────────────────────────┐
│                                                     │   │  One quick step to connect.                         │
│   Put this on the web — free, and it's yours.       │   │                                                     │
│                                                     │   │        ┌───────────────────────────┐               │
│   Archie publishes your library as a real website   │   │        │       W D J B - M J H T    │  [ Copy code ]│
│   on GitHub Pages. It's free, permanent, and the    │   │        └───────────────────────────┘               │
│   address belongs to you.                           │   │                                                     │
│                                                     │   │   [ Open GitHub to enter it ]                       │
│        ┌───────────────────────────────┐           │   │   Paste the code there and click Authorize.         │
│        │     Continue with GitHub      │           │   │   We'll pick it up automatically — come back here.  │
│        └───────────────────────────────┘           │   │                                                     │
│                                                     │   │   ⟳ Waiting for you to authorize…   (expires 14:32) │
│   No GitHub account? Make one free                  │   │                                                     │
│   I already use GitHub →                            │   │   Cancel                                            │
└─────────────────────────────────────────────────────┘   └─────────────────────────────────────────────────────┘
        intro-desktop (signed-out)                                   device-code (auth handshake)

┌─ Publish to the web ───────────────── @micah ──────┐
│   Name your site.                                   │
│                                                     │
│   ┌───────────────────────────────────────────┐    │
│   │ voynich-folios                            │    │
│   └───────────────────────────────────────────┘    │
│   Letters, numbers and dashes. Part of your address.│
│                                                     │
│   Your site will live at                            │
│      https://micah.github.io/voynich-folios/        │
│                                                     │
│   ☑ Anyone with the link can see it                 │
│                                                     │
│        ┌───────────────────────────────┐           │
│        │           Publish             │           │
│        └───────────────────────────────┘           │
└─────────────────────────────────────────────────────┘
        name-site (the ONE novice input + live preview)
```

## Verified mechanics

All endpoint facts verified against the research notes' cited GitHub docs; engine facts verified against `ghpages.ts`. Unverified items are flagged.

**Device Authorization Grant (RFC 8628) — the auth replacement.** Two endpoints:
1. `POST https://github.com/login/device/code` with `client_id` (Required) + `scope` (space-delimited) → returns `device_code` (40 ch), `user_code` (8 ch w/ hyphen, e.g. `WDJB-MJHT`), `verification_uri` (constant: `https://github.com/login/device`), `expires_in` (900s), `interval` (5s).
2. `POST https://github.com/login/oauth/access_token` with `client_id` + `device_code` + `grant_type=urn:ietf:params:oauth:grant-type:device_code`, polled until authorized → `access_token=gho_…`.
   Poll handling: `authorization_pending` = keep waiting at `interval`; `slow_down` = add 5s (use returned interval); `expired_token` = code expired, request a fresh one; `access_denied` = user cancelled (code dead, must restart).
   **No `client_secret` needed** — only the public `client_id`, safe to embed in a distributed binary. Device flow must be **enabled** in the App registration or polling returns `device_flow_disabled`; rate limit 50 code submissions/hour/app.
   Docs: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps

**CORS verdict — the single most important mechanic.** The `github.com/login/*` device + token endpoints send **no `Access-Control-Allow-Origin`**, so a browser/WebKit-webview origin is blocked. The device-flow POST + poll loop **MUST run in the Tauri Rust backend** (a `#[tauri::command]` using reqwest), not the webview. This also keeps the token off the JS heap. By contrast, **`api.github.com` DOES send CORS headers**, so repo-create, the git-trees push, and Pages-enable run from the webview unchanged (today's `ghpages.ts` already does, over the global `fetch`). Net: **only the auth handshake is Rust-routed; the push stays in JS.** (CORS verdict is well-reported practical reality; GitHub's docs are silent on it and only ever demo non-browser clients — flagged as doc-silent but operationally certain.)

**Scopes.** For an OAuth App (classic) token, request the single `repo` scope — it covers create-repo + contents-write + pages-write end-to-end. `public_repo` is insufficient because `POST /repos/{owner}/{repo}/pages` explicitly requires `repo`. `repo` reads as "full control of repositories" on GitHub's consent screen (alarming to a novice; soften with our pre-handoff copy — we cannot restyle GitHub's screen). Docs: https://docs.github.com/en/rest/pages/pages#create-a-github-pages-site · https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps

**Repo creation.** `POST /user/repos` with `{ name, private: false }`. Default branch existence is handled by **our own engine** (it self-creates the `gh-pages` ref on 404), so `auto_init` is **not required** — and is mildly counterproductive (it commits a README to `main` while we publish to `gh-pages`). Treat 422 as "name taken" → the `name-taken` choice screen. Docs: https://docs.github.com/en/rest/repos/repos#create-a-repository-for-the-authenticated-user

**Pages enable.** `POST /repos/{owner}/{repo}/pages` with `source.branch = gh-pages`, `path = /` — already done by `enablePages()`. 201 = just live, 409 = already live (both "on"). Pages builds **asynchronously**, so the live URL can 404 on first click — mitigated by load-bearing "refresh in a moment" copy and an optional `GET /pages` status=`built` poll before declaring success. Docs: https://docs.github.com/en/rest/pages/pages#create-a-github-pages-site

**Browser handoff.** Opening `https://github.com/login/device` in the system browser needs a Tauri opener — **`tauri-plugin-opener` is NOT currently a dependency** (verified: `lib.rs` loads only fs/dialog/http; `capabilities/default.json` has no opener/shell grant). This plugin + capability + a Flatpak portal check are new surface, not a test pass. Flagged.

**Keychain.** **No keychain/keyring code exists anywhere** (verified: `Cargo.toml` has only `tauri-plugin-http`; the fs-seam writes plaintext files under `$APPDATA`/`$HOME`). Persisting `gho_…` therefore requires a **real OS-keychain integration built from scratch** (e.g. the `keyring` crate via a `#[tauri::command]`) — it cannot be "reused from the fs-seam", and storing the token as a plaintext fs file would re-violate the token-not-stored decision. Flagged as new surface and the gating decision below.

## Desktop vs web

The behavior branches on the existing `isTauri()` seam (`tauri-fs.ts:14`).

- **Desktop (Tauri / Flatpak — primary target):** full one-button path. Device-flow code request + token poll run in a Rust reqwest `#[tauri::command]` (bypasses the `github.com/login/*` CORS block, keeps the token off the JS heap). Repo-create + push + Pages run from the webview via the existing engine over `https://**` (already permitted). The token is offered to the OS keychain so re-publish never re-auths (frictions A and E fully removed). Owner/repo/branch/token never appear unless "I already use GitHub →" is opened.
- **Pure browser (no Tauri):** the device flow is **impossible** (CORS) and there is no safe secret store, so the dialog does **not** render a "Continue with GitHub" button that would silently fail. It leads with the existing **zip + `?src=` shareable-link** path (kept with its durability caveat) and points to the desktop app for a permanent owned site. The **Advanced paste-a-PAT form remains reachable in both runtimes** — `publishToGitHub` works from the browser when a token is pasted by hand, since `api.github.com` is CORS-clean. So a determined web user can still publish to GitHub Pages via the advanced form; the *frictionless* path is desktop-only, and the design says so honestly.

## Constraints: respected vs revisited

**Respected.**
- *No backend server / self-describing static artifact* (cited across `docs/decisions/`, ADR-0009): device flow uses only the embedded **public** `client_id` (no `client_secret`, no Archie-run relay); auth + repo-create hit GitHub's own endpoints directly from the desktop client. Output stays a static Pages site; the web path stays the self-describing zip + `?src=` link.
- *Publish = zip-primitive + per-host adapters*: "Continue with GitHub" is a new **auth adapter** in front of the unchanged GitHub host adapter (`ghpages.ts`); the zip path stays the host-less adapter.
- *Push engine is solid / don't rebuild plumbing*: `publishToGitHub`, `pagesUrlFor`, `PublishProgress`, `enablePages` all reused untouched. Only credential acquisition + a pre-publish `POST /user/repos` are new.
- *Tauri can route HTTP through Rust to bypass CORS*: leaned on for the device-flow handshake only.
- *PAT fallback preserved*: the legacy token form survives behind Advanced — no one is locked out.

**Revisited — and this is THE ONE DECISION THE USER MUST MAKE.**
- *"Token not stored"* (explicit CONTEXT decision; rationale: a pasted PAT in plaintext is a liability — see `Publish.svelte:5`, `ghpages.ts:61-62`, and the publish contract). This redesign **deliberately revisits it for desktop only**: store the device-flow `gho_…` token in the **OS keychain** (encrypted, OS-scoped — the same posture `gh`/VS Code/GitHub Desktop use), default-ON "Stay signed in on this computer", explicit sign-out. The original rationale targeted **plaintext** PATs; an OS keychain is a categorically different posture (and the very exception the constraint text anticipates). **Web posture is unchanged** (nothing persisted). This kills friction E for the desktop majority. It must be **ratified as a new `Q-N` decision-record before any token is persisted** — not slipped in silently. **If the user declines keychain persistence, the design still ships**: friction E remains (re-run device flow each publish, ~10s — still far better than the PAT paste).
- *Least-privilege vs the `repo` scope*: TENSION, flagged not resolved. v1 ships the single classic `repo` scope with plain consent copy; a GitHub-App migration (fine-grained, single-repo) is the principled follow-up, deferred because its mandatory install/repo-pick step reintroduces novice friction. The engine accepts either token type, so no engine change when we migrate.

## Phased plan

Three phases. Phase 1 ships a real novice win on desktop; Phase 2 removes the last re-paste; Phase 3 is the principled hardening.

### Phase 1 — Device-flow sign-in + auto repo-create (the headline win)

Prerequisite (one-time, off-code): **register an OAuth App** (or GitHub App) under the Archie/maintainer account, **enable device flow**, request scope `repo`, and embed the public `client_id` in the binary (config, not a secret).

- **`src-tauri/Cargo.toml` / `src-tauri/src/lib.rs`** — add `reqwest` (or use `tauri-plugin-http`'s client) + `tauri-plugin-opener`; register two `#[tauri::command]`s: `gh_device_start()` → POST `/login/device/code`, returns `{user_code, verification_uri, device_code, interval, expires_in}`; `gh_device_poll(device_code, interval)` → polls `/login/oauth/access_token`, handling `authorization_pending`/`slow_down`/`expired_token`/`access_denied`, returns the `gho_` token (or a typed error). Wire `opener` for the browser handoff.
- **`src-tauri/capabilities/default.json`** — add the `opener:` (shell-open) permission for `https://github.com/login/device`. (HTTP grant already present.)
- **`packages/render-core/src/publish/ghpages.ts`** — add a tiny `ensureRepo(owner, repo, token)` (POST `/user/repos {name, private:false}`, ignore 422) reusing the existing `ghJson`/`ghError` plumbing; add a leading `creating-repo` phase to `PublishProgress`. Update the stale "fine-grained PAT" header comment. **No engine logic change.**
- **`apps/studio/src/publish-flows.svelte.ts`** — add `signInWithGitHub()` (calls the Rust commands), and have `publish()` call `ensureRepo()` before `publishToGitHub()`.
- **`apps/studio/src/Publish.svelte`** — rebuild into the state machine (`intro` → `device-code` → `name-site` → `publishing` → `success`/`error`); keep the existing form verbatim as the `advanced` state behind "I already use GitHub →". Add the live `pagesUrlFor` preview to `name-site`. Branch on `isTauri()`: web → `web-intro`.
- **`apps/studio/src/PublishDialog.svelte`** — relabel/route so "Publish to the web" leads with the recommended path; keep the zip/`?src=` card as the web primary.

*Outcome:* desktop novice publishes with one button + one field; no PAT, no repo setup, no git words. Token still dropped after publish (friction E intact this phase).

### Phase 2 — Keychain persistence + one-click re-publish

Gated on the user's keychain decision (ratify the `Q-N` first).

- **`src-tauri/Cargo.toml` / `lib.rs`** — add the `keyring` crate; commands `gh_token_save(token)` / `gh_token_load()` / `gh_token_clear()`.
- **`apps/studio/src/publish-flows.svelte.ts`** — on sign-in, offer "Stay signed in" → `gh_token_save`; on open, `gh_token_load` to detect a session.
- **`apps/studio/src/Publish.svelte`** — add `update-confirm` state (one-line "Update {url}?") and a sign-out affordance; `PublishDialog.svelte` flips the GitHub card to "Update my site" when a session exists.
- Optional: `GET /pages` status=`built` poll feeding a `pages-building` state before the success hero.

*Outcome:* desktop re-publish is one click; friction E removed.

### Phase 3 — Hardening + principled least-privilege (deferred)

- Migrate to a **GitHub App** (fine-grained, single publishing repo) once the one-time install/repo-pick UX is designed; the engine is unchanged (token-agnostic).
- Flatpak portal verification for browser-open + keychain in the **packaged** app (not just dev).
- Robust `device_flow_disabled` / rate-limit (50/hr) developer-facing diagnostics.

## Risks & open questions

- **OAuth-App registration burden + single point of failure.** Embedding one maintainer-owned `client_id` means if that app is suspended/rate-limited, everyone's frictionless publish breaks at once — the BYO-PAT model didn't have this. Keep the PAT path a genuine escape, not a vestige. Device flow must be explicitly **enabled** in the registration or polling returns `device_flow_disabled`.
- **Keychain is net-new surface.** No keyring code exists today; a silent save-failure would make the user think they're signed in when they aren't. Needs explicit success/failure feedback on the "Stay signed in" line, and the `Q-N` ratification before any persistence.
- **Opener plugin is net-new.** `tauri-plugin-opener` + capability + Flatpak portal access for `github.com/login/device` — fixable, but it's a missing dependency, not a test pass.
- **Pure-web limits.** Device flow is CORS-blocked and there's no safe web secret store; web users get the zip path or the advanced PAT form. The headline "no token" win is desktop-only — the design must not pretend otherwise.
- **The `repo` consent screen reads "full control of repositories."** Some novices will hesitate at GitHub's own screen, which we cannot restyle. Soften with copy now; GitHub-App migration later.
- **Async Pages builds → 404 on first click.** Load-bearing "refresh in a moment" copy; optionally block the success hero on a `GET /pages` status poll.
- **Private repos / org policy.** `enablePages` can't auto-enable → the honest `manual-pages` deep-linked fallback (friction F reduced, not eliminated).
- **First-ever GitHub account creation is off-app.** We link to github.com but can't automate signup.
- **Rate limit** 50 device-code submissions/hour/app — a scale/config edge case, handled by auto-restart on expiry, but can confuse a very slow first-timer.

## Alternatives considered

- **Guided Token Wizard ("Get a key, then go live").** Keeps BYO-token but turns the password box into a 3-card illustrated walkthrough deep-linking to GitHub's fine-grained-token page. *Rejected as primary* because its marquee promise is structurally undeliverable: GitHub's token page accepts only name/expiry/description URL prefill — it **cannot pre-check permission toggles**, so the single most error-prone novice step (hand-set Contents+Pages+Administration to Read-and-write from a static illustration that drifts when GitHub redesigns) survives intact. Highest constraint-fit of the three (no OAuth app, no maintainer infra), so its naming/preview screen and honest error copy are **grafted** into the chosen design, and it stays the conceptual backup if device-flow registration proves untenable.
- **Sign in with GitHub (device flow) + guided repo creation.** Same core auth idea as the winner. *Rejected in favor of candidate 3* because it leads with the chooser and is less honest about the desktop/web split, and because its feasibility narrative claimed to "reuse the existing fs-seam / OS keychain" (which doesn't exist) and to need `auto_init` for branch existence (the engine self-creates `gh-pages`) — corrected in the chosen design. Its device-code state machine and "your site will live at ___" preview are otherwise sound and carried forward.
- **Pure zero-account hosts (Netlify Drop / Cloudflare direct-upload / Surge).** A genuine account-free escape hatch. *Rejected as primary* because the brief specifically wants **GitHub Pages** (permanent, user-owned address); these give temporary, non-owned URLs. The existing zip + `?src=` path already fills the "no account, instant link" niche on web, so a third host adapter isn't needed now.

## Easier on the web? (browser-only publish)

**Verdict: yes-but — the *only* frictionless browser path costs one small piece of standing infra.** A plain browser tab **cannot** obtain a push-capable GitHub token on its own, today, by any flow. The one way to get the desktop-grade "Sign in with GitHub → auto-create repo → push → Pages-on" experience in a bare tab is a **tiny stateless serverless OAuth broker** the Archie maintainer hosts once (~30 LOC, free tier, holds only the `client_secret`). This **revisits the no-server ethos** — it is the single, deliberate exception. Everything cheaper than that keeps the ethos but keeps friction. There is **no zero-infra frictionless option** because GitHub blocks the only mechanism (browser-side code→token exchange) that would enable one.

### Ranked options (easiest novice → least)

| Option | Novice friction | Infra cost | Respects no-server? |
|---|---|---|---|
| **A. Maintainer-hosted stateless OAuth broker** (Decap/Netlify-CMS pattern: Cloudflare Worker / Netlify Function holds `client_secret`, does code→token, returns token via `postMessage`). Yields real in-browser "Sign in with GitHub" + auto repo-create + push — near-identical to desktop UX. | **Lowest** — one click, no token, no jargon | One free serverless fn, ~30 LOC, maintainer hosts + watches uptime; SPoF for all web users | **No — deliberate exception** (one secret-holding fn) |
| **B. Hand-pasted PAT** (existing Advanced form; `api.github.com` is CORS-clean so the push works once a token is pasted) | High — novice must create a fine-grained PAT scoped Contents+Pages-write, the #1 blocker today | **Zero** | **Yes** |
| **C. Zip + `?src=` share-link** (existing web fallback) | Low to share, but not GitHub Pages — temporary, not owned, not a permanent address | **Zero** | **Yes** |
| **D. Route web users to the desktop app** (device-flow-via-Rust premium path) | Medium — must download/install Archie | **Zero** | **Yes** |

### Decisive mechanical facts (web path)

- **Token-endpoint CORS: BLOCKED.** `POST https://github.com/login/oauth/access_token` sends **no `Access-Control-Allow-Origin`** — a browser `fetch()` cannot call it. GitHub staff confirm CORS on this endpoint is still unimplemented (mid-2025, still open early-2026). [community discussion #15752, GitHub PM Hirsch Singhal 2025-07-15: "We still have to add support for CORS on the token endpoint unfortunately." https://github.com/orgs/community/discussions/15752]
- **PKCE: SUPPORTED, but does NOT enable a secretless browser flow.** GitHub added PKCE (S256 only) on 2025-07-14, but the `client_secret` remains **Required** on the token exchange even with PKCE, because GitHub does not distinguish public from confidential clients. PKCE is a hardening add-on, not a secret-replacement. [GitHub Changelog 2025-07-14: "GitHub is not requiring PKCE for any authentication flow at this time, as GitHub does not distinguish between public and confidential clients." https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/ · docs token-exchange table lists `client_secret` Required, `code_verifier` only "Strongly recommended": https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps]
- **Implicit grant: NOT supported** — no fragment-token shortcut to fall back on. [docs Authorizing OAuth apps: "(The implicit grant type is not supported.)" https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps]
- **Therefore: a secret-holding broker is unavoidable** for a frictionless browser flow until GitHub ships public-client + token-endpoint CORS support. [roadmap "Single page app support for GitHub Apps [Preview]", github/roadmap#1153 — future, no ETA.] The canonical implementation is the Decap CMS / Netlify-CMS serverless OAuth provider, free on Cloudflare Workers (100k req/day, no card). [decapcms.org/docs/external-oauth-clients/ · developers.cloudflare.com/workers/platform/pricing/]
- **`api.github.com` IS CORS-clean** — so once a token exists (broker or pasted PAT), repo-create + git-trees push + Pages-enable all run from the tab via the unchanged `ghpages.ts`.

### Recommendation

Keep desktop device-flow-via-Rust as the premium path and keep B/C/D as honest zero-infra web fallbacks now; only adopt Option A if/when web one-click matters enough to justify hosting (and babysitting) one secret-holding serverless function — the single deliberate break from the no-server ethos. Watch github/roadmap#1153 to drop the broker the moment GitHub enables secretless SPA auth.
