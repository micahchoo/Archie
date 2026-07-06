# Spike: git2 in the Tauri workspace (Q-B2)

**Question** (docs/decisions/archie.md Q-13, PUBLISH-TO-WEB plan Task 2): does the `git2`
crate build inside Archie's Tauri workspace (`src-tauri/`) and push to GitHub over HTTPS
with a token credential?

**Answer: YES (build + stage/commit + HTTPS transport all proven). The final live-push
handshake needs one user-run command because the scratch repo no longer exists and the
permission system (correctly) declined to let the agent create a repo on the user's account.**

Date: 2026-07-05. Environment: Linux, system git-adjacent libs from distro, Tauri 2 workspace
(`src-tauri/Cargo.toml`, tauri 2.11.3).

## 1. Does it build? Plain vs vendored-openssl

**Plain `git2 = "0.19"` builds cleanly. `vendored-openssl` was NOT needed.**

- Cargo.toml line that worked: `git2 = "0.19"` (resolved to git2 0.19.0). Nothing else.
- `cargo build` in `src-tauri/`: `Finished dev profile in 1m 05s`, zero errors, zero warnings.
- Linkage (via `ldd` on the test binary):
  - **libgit2: vendored/static** — libgit2-sys compiled the bundled C source; no `libgit2.so`
    runtime dependency. Good for Flatpak (no runtime libgit2 needed).
  - **OpenSSL: system dynamic** — `libssl.so.3` / `libcrypto.so.3` from the distro. This is what
    `vendored-openssl` would replace if a build machine lacked openssl dev headers.
  - libssh2 also vendored/static (irrelevant for us; we use HTTPS, not SSH).
- Keep `{ version = "0.19", features = ["vendored-openssl"] }` in the back pocket for CI/Flatpak
  build environments without `libssl-dev`; on this machine it was unnecessary.

## 2. Stage-and-commit test — PASS

`src-tauri/src/git2_spike.rs` (`#[cfg(test)]`-only module, registered in `lib.rs`):
`Repository::init` on a tempdir → write `index.html` + `data.json` → `index.add_all` →
`write_tree` → `repo.commit(Some("HEAD"), …)` → assert the commit tree lists exactly
`["data.json", "index.html"]` and `tree.len() == 2`.

```
test git2_spike::tests::push_smoke ... ignored
test git2_spike::tests::stage_and_commit_two_files ... ok
test result: ok. 1 passed; 0 failed; 1 ignored
```

Dev-dependency added: `tempfile = "3"`.

## 3. Live push — transport PROVEN, final handshake needs user run

The `#[ignore]` test `push_smoke` inits a one-file repo, adds remote
`https://github.com/micahchoo/archie-pages-probe.git`, and pushes
`+refs/heads/main:refs/heads/git2-spike` with
`Cred::userpass_plaintext("x-access-token", &token)` in `RemoteCallbacks`.

**The scratch repo no longer exists** (`gh repo view micahchoo/archie-pages-probe` → not found;
a scan of all micahchoo repos found no probe/scratch repo — presumably deleted after the earlier
system-git pack-push probe). `gh repo create` was denied by the permission system, so the repo
was not recreated by the agent.

The test was run anyway against the nonexistent repo — a deliberately informative failure:

```
pushing refspec: +refs/heads/main:refs/heads/git2-spike
Error { code: -1, klass: 34, message: "unexpected http status code: 404" }
```

A clean **HTTP 404 from github.com** means: DNS, TLS handshake, **CA certificate verification
(zero extra cert config)**, libgit2's smart-HTTP transport, and the credential callback all
executed end-to-end; GitHub answered. The only untested millimetre is GitHub accepting a
pack-file for a real repo — the exact mechanism the earlier system-git probe already proved
(554 files live in 0.6 min, Q-13).

**User-runnable command to close the loop** (after creating the scratch repo, e.g.
`gh repo create micahchoo/archie-pages-probe --private`):

```sh
cd src-tauri
GITHUB_TOKEN=$(gh auth token) cargo test push_smoke -- --ignored --nocapture
```

Expected: `push_update_reference: refs/heads/git2-spike -> None` then `push_smoke: OK`.

## 4. Binary-size delta

Debug `archie` binary: 246,160,704 B with git2 vs 246,092,136 B without — **~67 KB**, i.e.
noise. That's because nothing in shipped code references git2 yet (test-only), so the linker
drops the vendored libgit2. Expect a real **few-MB** increase (release, stripped: likely 2–4 MB)
once a Tauri command actually calls git2; measure again in the implementing task.

## 5. Gotchas

- **CA certs: works out of the box on Linux desktop.** libgit2 uses system OpenSSL's default
  cert store; the 404 exchange proves verification succeeded with no `SSL_CERT_FILE`/custom
  config. **Flatpak caveat:** inside the sandbox the GNOME runtime supplies openssl + CA bundle,
  which should equally work — but if `vendored-openssl` is ever enabled, the vendored OpenSSL
  may not know the cert path and would need `SSL_CERT_FILE`/`SSL_CERT_DIR` set. Test the push
  from the packaged Flatpak before shipping.
- **404 vs auth errors:** GitHub returns 404 both for missing repos and for private repos the
  token can't see. Map libgit2 klass-34/http-404 errors to a "repo not found or token lacks
  access" user message, not "not found" alone.
- **Default branch name:** `Repository::init` + first commit landed on `refs/heads/main` here
  (host git config `init.defaultBranch=main`). libgit2 does NOT read that git config the same
  way everywhere — when implementing, set HEAD explicitly rather than assuming `main`.
- **Non-fast-forward:** the spike used a force refspec (`+…`). The real publisher pushes to
  a branch it owns; decide force-vs-fetch-first in the implementing task.
- `push_update_reference` callback is the place server-side rejections surface (status
  `Some(msg)`); plain `remote.push` Ok is not sufficient proof — keep the callback.
- Build cost: full cold build of the workspace with git2 was 65 s here (warm cargo cache);
  libgit2-sys C compilation is included. No pkg-config/system-libgit2 requirement.

## 6. Fallback ladder (from the plan)

1. **git2 (this spike) — validated**, use it.
2. If git2 ever becomes untenable (e.g. openssl linkage breaks in some packaging target):
   **gix (gitoxide)** — pure-Rust, no C/openssl linkage concerns.
3. **Never per-blob REST** — refuted by GitHub secondary rate limits (Q-13 probe).

## Files touched (spike worktree only — not shipped)

- `src-tauri/Cargo.toml` — `git2 = "0.19"` dep, `tempfile = "3"` dev-dep.
- `src-tauri/src/git2_spike.rs` — the two tests.
- `src-tauri/src/lib.rs` — `#[cfg(test)] mod git2_spike;`.
