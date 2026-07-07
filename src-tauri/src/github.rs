// GitHub publish handshake — the one thing the webview can't do itself.
//
// `github.com/login/*` sends no CORS headers, so a webview `fetch()` cannot call the device-flow
// endpoints; and the OAuth token must stay off the JS heap (decision Q-12, docs/decisions/archie.md).
// Both constraints put this code in Rust. The JS side (apps/studio/src/deploy/) invokes these
// commands; every payload serializes to the camelCase contract in apps/studio/src/deploy/types.ts.
//
// TOKEN SAFETY: the access token appears only in `DevicePollResult` (returned to the caller once) and
// in the keyring (Q-12). It is never logged, never `Debug`-printed, never written to disk here.

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Duration;

// GitHub device-flow endpoints (constant per the OAuth device-flow spec).
const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const DEVICE_GRANT_TYPE: &str = "urn:ietf:params:oauth:grant-type:device_code";
// A published site is pushed to a public repo the scholar owns; `repo` is the minimum that grants it.
const SCOPE: &str = "repo";

// ---------------------------------------------------------------------------------------------------
// Contract payloads (serialize to apps/studio/src/deploy/types.ts — camelCase).
// ---------------------------------------------------------------------------------------------------

/// The device-flow start response: the code the scholar types into GitHub, plus poll parameters.
/// Mirrors `DeviceStart` in types.ts.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceStart {
    pub user_code: String,
    pub verification_uri: String,
    pub device_code: String,
    pub interval: u64,
    pub expires_in: u64,
}

/// A successful poll. The token is returned exactly once, here (Q-12). No `Debug` derive: the token
/// must never reach a log via `{:?}`. Mirrors `DevicePollResult` in types.ts.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevicePollResult {
    pub token: String,
}

/// A typed, safe-to-serialize failure. Mirrors `DeployError` in types.ts — no token field, ever.
/// Command `Err` values serialize to this shape, so the JS promise rejects with a `DeployError`.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeployError {
    pub kind: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
}

impl DeployError {
    fn new(kind: &str, message: impl Into<String>) -> Self {
        DeployError { kind: kind.into(), message: message.into(), status: None }
    }
}

// ---------------------------------------------------------------------------------------------------
// GitHub wire shapes (snake_case, as GitHub sends them) — kept private to this module.
// ---------------------------------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct GhDeviceCode {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: u64,
}

/// A secret string (the OAuth access token) whose `Debug` is redacted, so a stray `{:?}` on any
/// structure that holds one can never leak it into a log. Deserializes transparently from a JSON
/// string (serde newtype). `expose()` is the single, explicit way to read the underlying value.
#[derive(Clone, PartialEq, Deserialize)]
struct Secret(String);

impl Secret {
    fn expose(self) -> String {
        self.0
    }
}

impl std::fmt::Debug for Secret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Secret(<redacted>)")
    }
}

/// The `/login/oauth/access_token` body: success carries `access_token`; every non-success carries
/// `error` (and often `error_description`); `slow_down` may carry a widened `interval`. `access_token`
/// is a redacting `Secret` so the derived `Debug` on this struct cannot spill the token.
#[derive(Debug, Deserialize)]
struct GhTokenResponse {
    access_token: Option<Secret>,
    error: Option<String>,
    error_description: Option<String>,
    interval: Option<u64>,
}

// ---------------------------------------------------------------------------------------------------
// Pure logic (unit-tested against fixtures — no network).
// ---------------------------------------------------------------------------------------------------

/// One classified poll outcome. Recoverable states (`Pending`, `SlowDown`) keep the loop going;
/// `Terminal` stops it with a typed error; `Authorized` yields the token.
#[derive(Debug, PartialEq)]
enum PollStep {
    Authorized(Secret),
    Pending,
    /// GitHub asked us to back off; the payload is its suggested new interval, if any.
    SlowDown(Option<u64>),
    Terminal(DeployError),
}

/// The one "code expired" error, shared by the `expired_token` server response and the local deadline
/// guard so both surface identical copy.
fn expired_error() -> DeployError {
    DeployError::new(
        "expired",
        "The sign-in code expired before you authorized it. Start again to get a new one.",
    )
}

/// Map a parsed token-endpoint response to the next poll step. Token presence wins; otherwise the
/// `error` code decides. This is the whole poll state machine — the loop below only sleeps and re-asks.
fn classify_poll(resp: &GhTokenResponse) -> PollStep {
    if let Some(token) = &resp.access_token {
        return PollStep::Authorized(token.clone());
    }
    match resp.error.as_deref() {
        Some("authorization_pending") => PollStep::Pending,
        Some("slow_down") => PollStep::SlowDown(resp.interval),
        Some("expired_token") => PollStep::Terminal(expired_error()),
        Some("access_denied") => PollStep::Terminal(DeployError::new(
            "denied",
            "Sign-in was cancelled.",
        )),
        Some("device_flow_disabled") => PollStep::Terminal(DeployError::new(
            "device-flow-disabled",
            "This build isn't configured for GitHub device-flow sign-in.",
        )),
        Some(other) => PollStep::Terminal(DeployError::new(
            "gh",
            resp.error_description.clone().unwrap_or_else(|| other.to_string()),
        )),
        None => PollStep::Terminal(DeployError::new(
            "gh",
            "GitHub returned a response we didn't understand.",
        )),
    }
}

/// The poll interval after a `slow_down`. Adds the spec's +5s to the current interval, and never
/// polls faster than GitHub's suggested interval — so the effective wait is `max(current + 5, server)`.
/// The interval therefore only ever grows and the loop always backs off (never busy-loops).
fn bumped_interval(current: u64, server: Option<u64>) -> u64 {
    (current + 5).max(server.unwrap_or(0))
}

/// Whether the device code's lifetime has elapsed. Once true, polling must stop with `expired` even
/// if GitHub keeps answering `authorization_pending` — a local guarantee the loop can't outlive the
/// code. Pure so the deadline is unit-testable without a real clock.
fn deadline_exceeded(elapsed: Duration, expires_in: u64) -> bool {
    elapsed.as_secs() >= expires_in
}

/// Parse the device-code start body. Success yields a `DeviceStart`; an `error` body (e.g. a
/// misconfigured app returning `device_flow_disabled`) yields the matching typed error.
fn parse_device_start(body: &str, status: u16) -> Result<DeviceStart, DeployError> {
    if let Ok(dc) = serde_json::from_str::<GhDeviceCode>(body) {
        return Ok(DeviceStart {
            user_code: dc.user_code,
            verification_uri: dc.verification_uri,
            device_code: dc.device_code,
            interval: dc.interval,
            expires_in: dc.expires_in,
        });
    }
    if let Ok(err) = serde_json::from_str::<GhTokenResponse>(body) {
        if let Some(code) = err.error.as_deref() {
            return Err(match code {
                "device_flow_disabled" => DeployError::new(
                    "device-flow-disabled",
                    "This build isn't configured for GitHub device-flow sign-in.",
                ),
                other => DeployError {
                    kind: "gh".into(),
                    message: err.error_description.clone().unwrap_or_else(|| other.to_string()),
                    status: Some(status),
                },
            });
        }
    }
    Err(DeployError::new("gh", "GitHub returned a response we didn't understand."))
}

/// Any reqwest transport failure is a `network` DeployError. reqwest errors describe the transport,
/// never a token, so the message is safe to surface.
fn network_err(err: reqwest::Error) -> DeployError {
    DeployError::new("network", err.to_string())
}

// ---------------------------------------------------------------------------------------------------
// Tauri commands.
// ---------------------------------------------------------------------------------------------------

/// Begin device-flow sign-in. `client_id` is the public OAuth App id (no secret — device flow needs
/// none). Returns the code the scholar enters at `verification_uri` plus the poll parameters.
#[tauri::command]
pub async fn gh_device_start(client_id: String) -> Result<DeviceStart, DeployError> {
    let client = reqwest::Client::new();
    let resp = client
        .post(DEVICE_CODE_URL)
        .header(reqwest::header::ACCEPT, "application/json")
        .form(&[("client_id", client_id.as_str()), ("scope", SCOPE)])
        .send()
        .await
        .map_err(network_err)?;
    let status = resp.status().as_u16();
    let body = resp.text().await.map_err(network_err)?;
    parse_device_start(&body, status)
}

/// Poll for the token after the scholar authorizes. Sleeps `interval` seconds between requests,
/// widens on `slow_down`, and returns the token exactly once. Terminates with a typed error on
/// `expired_token` / `access_denied` / `device_flow_disabled`. `expires_in` (the lifetime GitHub
/// returned from `gh_device_start`) is a local deadline: once it elapses the loop returns `expired`
/// regardless of what the server says, so the poll can never outlive the code.
#[tauri::command]
pub async fn gh_device_poll(
    client_id: String,
    device_code: String,
    interval: u64,
    expires_in: u64,
) -> Result<DevicePollResult, DeployError> {
    let client = reqwest::Client::new();
    let started = tokio::time::Instant::now();
    let mut wait = interval.max(1);
    loop {
        // GitHub requires waiting `interval` seconds before each poll — sleep first.
        tokio::time::sleep(Duration::from_secs(wait)).await;
        // Stop the moment the code's lifetime is spent, even if GitHub is still saying "pending".
        if deadline_exceeded(started.elapsed(), expires_in) {
            return Err(expired_error());
        }
        let resp = client
            .post(ACCESS_TOKEN_URL)
            .header(reqwest::header::ACCEPT, "application/json")
            .form(&[
                ("client_id", client_id.as_str()),
                ("device_code", device_code.as_str()),
                ("grant_type", DEVICE_GRANT_TYPE),
            ])
            .send()
            .await
            .map_err(network_err)?;
        let body = resp.text().await.map_err(network_err)?;
        let parsed: GhTokenResponse = serde_json::from_str(&body)
            .map_err(|_| DeployError::new("gh", "GitHub returned a response we didn't understand."))?;
        match classify_poll(&parsed) {
            PollStep::Authorized(token) => return Ok(DevicePollResult { token: token.expose() }),
            PollStep::Pending => continue,
            PollStep::SlowDown(server) => wait = bumped_interval(wait, server),
            PollStep::Terminal(err) => return Err(err),
        }
    }
}

// ---------------------------------------------------------------------------------------------------
// Keyring token custody (Q-12) — "stay signed in". The token persists only in the OS keyring, never
// plaintext on disk (a declared kill criterion, PRFAQ). Store is keyed by a fixed service/user pair.
// ---------------------------------------------------------------------------------------------------

const KEYRING_SERVICE: &str = "digital.compost.archie";
const KEYRING_USER: &str = "github";

fn keyring_entry() -> keyring::Result<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
}

// Inner helpers take an `&Entry` so the round-trip is testable against a single mock credential (the
// mock store is per-entry, not a shared map). The commands construct the real entry and delegate.

fn save_to(entry: &keyring::Entry, token: &str) -> bool {
    entry.set_password(token).is_ok()
}

fn load_from(entry: &keyring::Entry) -> Option<String> {
    // A missing entry (never saved) and a store read error both mean "signed out" — not an error.
    entry.get_password().ok()
}

fn clear_in(entry: &keyring::Entry) {
    // Deleting a missing credential is a no-op, not an error (e.g. clear after a save that failed).
    let _ = entry.delete_credential();
}

// These run on the blocking thread pool: a locked GNOME Keyring / KWallet blocks the calling thread
// until the user answers the unlock dialog, so keeping them off the async reactor (the webview's
// event loop) is what stops the window from freezing during that wait.

/// Persist the session token to the OS keyring. Returns `false` when the platform store is
/// unavailable — a truthful "couldn't stay signed in", NOT an error the UI must dialog about.
#[tauri::command]
pub async fn gh_token_save(token: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || match keyring_entry() {
        Ok(entry) => save_to(&entry, &token),
        Err(_) => false,
    })
    .await
    .unwrap_or(false)
}

/// Load a previously-saved token. `None` = nothing stored or the store is unavailable (signed out).
#[tauri::command]
pub async fn gh_token_load() -> Option<String> {
    tauri::async_runtime::spawn_blocking(|| keyring_entry().ok().and_then(|entry| load_from(&entry)))
        .await
        .unwrap_or(None)
}

/// Forget the stored token (sign out). A no-op when nothing is stored.
#[tauri::command]
pub async fn gh_token_clear() {
    let _ = tauri::async_runtime::spawn_blocking(|| {
        if let Ok(entry) = keyring_entry() {
            clear_in(&entry);
        }
    })
    .await;
}

// ---------------------------------------------------------------------------------------------------
// Single-pack deploy upload (Q-13) — stage the site tree into a throwaway repo, one root commit, then
// force-push it to `gh-pages`. ONE pack push replaces the whole ref (no base_tree), which is what lets
// a tile-heavy library deploy in seconds instead of thousands of per-blob REST calls. git2 mechanics
// and gotchas are from docs/spikes/2026-07-git2-in-tauri.md.
// ---------------------------------------------------------------------------------------------------

// The commit is a publish artifact, not authored work — a fixed, non-personal identity.
const COMMIT_NAME: &str = "Archie";
const COMMIT_EMAIL: &str = "publish@archie.local";
const COMMIT_MESSAGE: &str = "Publish to the web";
// We name the local ref explicitly rather than trusting `Repository::init`'s default branch, which the
// spike found is NOT reliably `main`/`master` across libgit2 builds.
const LOCAL_PUSH_REF: &str = "refs/heads/gh-pages";

/// The push outcome. Mirrors the Task 6 contract `{ commitSha }`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushResult {
    pub commit_sha: String,
}

/// Any git2 failure becomes a `push` DeployError. A libgit2 HTTP 404 means either the repo doesn't
/// exist yet or the token can't see it (GitHub returns 404 for both) — say so, don't just echo "404".
fn push_err(err: git2::Error) -> DeployError {
    let message = if err.message().contains("404") {
        "GitHub returned 404 — the repository doesn't exist yet, or the sign-in doesn't have access to it."
            .to_string()
    } else {
        err.message().to_string()
    };
    DeployError::new("push", message)
}

/// Stage every file under `dir` into a fresh repo and record it as a single parent-less commit on the
/// local `gh-pages` ref. Returns the repo (so the caller can push it) and the new commit's oid. The
/// `.git` directory libgit2 creates inside `dir` is never itself added to the tree (libgit2 skips it).
fn stage_and_commit(dir: &Path) -> Result<(git2::Repository, git2::Oid), DeployError> {
    let repo = git2::Repository::init(dir).map_err(push_err)?;

    // Scope the repo-borrowing handles (index, tree) so they drop before `repo` is moved out.
    let commit_oid = {
        let mut index = repo.index().map_err(push_err)?;
        // `*` stages every path under the work tree recursively; libgit2 never adds the `.git` dir.
        index
            .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
            .map_err(push_err)?;
        index.write().map_err(push_err)?;
        let tree_oid = index.write_tree().map_err(push_err)?;
        let tree = repo.find_tree(tree_oid).map_err(push_err)?;

        let sig = git2::Signature::now(COMMIT_NAME, COMMIT_EMAIL).map_err(push_err)?;
        // No parents + an explicit ref name: a full-replacement root commit on a deterministic
        // `gh-pages` ref (not HEAD's default branch, which the spike found unreliable).
        repo.commit(Some(LOCAL_PUSH_REF), &sig, &sig, COMMIT_MESSAGE, &tree, &[])
            .map_err(push_err)?
    };

    Ok((repo, commit_oid))
}

/// Stage, commit, and force-push `dir` to `owner/repo`'s `branch`. Blocking (libgit2 C + network), so
/// the command runs it off the async reactor. The token is used ONLY as the push credential — it is
/// never written into the repo's `.git/config` (the remote is anonymous/in-memory, and its URL carries
/// no token).
fn push_tree_blocking(
    dir: &str,
    owner: &str,
    repo: &str,
    branch: &str,
    token: &str,
) -> Result<PushResult, DeployError> {
    let (git_repo, commit_oid) = stage_and_commit(Path::new(dir))?;

    // Anonymous remote: not persisted to .git/config, so nothing about this push touches disk state.
    let url = format!("https://github.com/{owner}/{repo}.git");
    let mut remote = git_repo.remote_anonymous(&url).map_err(push_err)?;

    let mut callbacks = git2::RemoteCallbacks::new();
    // GitHub token auth over HTTPS: username "x-access-token", token as password (spike-proven).
    callbacks.credentials(move |_url, _username, _allowed| {
        git2::Cred::userpass_plaintext("x-access-token", token)
    });
    // Server-side rejections surface here, not from `remote.push`'s Ok (spike gotcha #5).
    let rejection = std::rc::Rc::new(std::cell::RefCell::new(None::<String>));
    let sink = rejection.clone();
    callbacks.push_update_reference(move |refname, status| {
        if let Some(msg) = status {
            *sink.borrow_mut() = Some(format!("{refname}: {msg}"));
        }
        Ok(())
    });

    let mut opts = git2::PushOptions::new();
    opts.remote_callbacks(callbacks);
    // Force (`+`): the publisher fully owns gh-pages, and a publish is a full replacement of the ref.
    let refspec = format!("+{LOCAL_PUSH_REF}:refs/heads/{branch}");
    remote.push(&[refspec.as_str()], Some(&mut opts)).map_err(push_err)?;

    if let Some(msg) = rejection.borrow().clone() {
        return Err(DeployError::new("push", format!("GitHub rejected the upload ({msg}).")));
    }
    Ok(PushResult { commit_sha: commit_oid.to_string() })
}

/// Push the staged site tree at `dir` to `owner/repo`'s `branch` as one pack (Q-13). `dir` is an
/// absolute path the webview staged via the Tauri fs plugin; its contents become the deployed site.
#[tauri::command]
pub async fn gh_push_tree(
    dir: String,
    owner: String,
    repo: String,
    branch: String,
    token: String,
) -> Result<PushResult, DeployError> {
    tauri::async_runtime::spawn_blocking(move || {
        push_tree_blocking(&dir, &owner, &repo, &branch, &token)
    })
    .await
    .unwrap_or_else(|_| Err(DeployError::new("push", "The upload task did not complete.")))
}

// ---------------------------------------------------------------------------------------------------
// Tests — fixture parsing only (no network). GitHub's response bodies are stable and documented.
// ---------------------------------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_token(body: &str) -> PollStep {
        classify_poll(&serde_json::from_str::<GhTokenResponse>(body).expect("valid fixture"))
    }

    #[test]
    fn device_start_success_parses_to_camelcase_shape() {
        // GitHub sends snake_case; we surface a DeviceStart that serializes camelCase for JS.
        let body = r#"{
            "device_code": "3584d83530557fdd1f46af8289938c8ef79f9dc5",
            "user_code": "WDJB-MJHT",
            "verification_uri": "https://github.com/login/device",
            "expires_in": 900,
            "interval": 5
        }"#;
        let start = parse_device_start(body, 200).expect("parses");
        assert_eq!(start.user_code, "WDJB-MJHT");
        assert_eq!(start.verification_uri, "https://github.com/login/device");
        assert_eq!(start.device_code, "3584d83530557fdd1f46af8289938c8ef79f9dc5");
        assert_eq!(start.interval, 5);
        assert_eq!(start.expires_in, 900);

        let json = serde_json::to_value(&start).unwrap();
        assert!(json.get("userCode").is_some(), "serializes camelCase for the JS contract");
        assert!(json.get("verificationUri").is_some());
        assert!(json.get("deviceCode").is_some());
        assert!(json.get("expiresIn").is_some());
    }

    #[test]
    fn device_start_disabled_is_typed_error() {
        let body = r#"{"error":"device_flow_disabled","error_description":"Device flow is not enabled"}"#;
        let err = parse_device_start(body, 400).expect_err("is an error");
        assert_eq!(err.kind, "device-flow-disabled");
    }

    #[test]
    fn poll_authorization_pending_keeps_waiting() {
        let body = r#"{"error":"authorization_pending","error_description":"pending"}"#;
        assert_eq!(parse_token(body), PollStep::Pending);
    }

    #[test]
    fn poll_slow_down_carries_server_interval() {
        let body = r#"{"error":"slow_down","error_description":"too fast","interval":10}"#;
        assert_eq!(parse_token(body), PollStep::SlowDown(Some(10)));
    }

    #[test]
    fn poll_expired_token_is_terminal_expired() {
        let body = r#"{"error":"expired_token","error_description":"expired"}"#;
        match parse_token(body) {
            PollStep::Terminal(e) => assert_eq!(e.kind, "expired"),
            other => panic!("expected terminal expired, got {other:?}"),
        }
    }

    #[test]
    fn poll_access_denied_is_terminal_denied() {
        let body = r#"{"error":"access_denied","error_description":"denied"}"#;
        match parse_token(body) {
            PollStep::Terminal(e) => assert_eq!(e.kind, "denied"),
            other => panic!("expected terminal denied, got {other:?}"),
        }
    }

    #[test]
    fn poll_success_yields_token_once() {
        let body = r#"{"access_token":"gho_example_test_token","token_type":"bearer","scope":"repo"}"#;
        match parse_token(body) {
            PollStep::Authorized(t) => assert_eq!(t.expose(), "gho_example_test_token"),
            other => panic!("expected authorized, got {other:?}"),
        }
    }

    #[test]
    fn authorized_token_debug_is_redacted() {
        // A stray `{:?}` on the poll step (or anything holding the Secret) must not spill the token.
        let step = parse_token(r#"{"access_token":"gho_example_test_token"}"#);
        let rendered = format!("{step:?}");
        assert!(rendered.contains("<redacted>"), "Debug redacts: {rendered}");
        assert!(!rendered.contains("gho_example_test_token"), "token absent from Debug: {rendered}");
    }

    #[test]
    fn slow_down_interval_only_grows() {
        assert_eq!(bumped_interval(5, Some(10)), 10, "honors a larger server interval");
        assert_eq!(bumped_interval(5, None), 10, "adds +5 when GitHub suggests none");
        assert_eq!(bumped_interval(5, Some(5)), 10, "never shrinks: +5 when server isn't larger");
        assert_eq!(bumped_interval(10, Some(3)), 15, "ignores a smaller server interval");
        assert_eq!(bumped_interval(5, Some(8)), 10, "floors at current+5 even when server is lower");
        assert_eq!(bumped_interval(5, Some(20)), 20, "honors a much larger server interval");
    }

    #[test]
    fn poll_deadline_stops_after_expiry() {
        assert!(!deadline_exceeded(Duration::from_secs(30), 900), "still within the code's lifetime");
        assert!(deadline_exceeded(Duration::from_secs(900), 900), "at the deadline");
        assert!(deadline_exceeded(Duration::from_secs(901), 900), "past the deadline");
    }

    #[test]
    fn keyring_roundtrip() {
        // Route the keyring through the in-memory mock store so the test needs no OS keychain.
        // Safe to ignore a second-call error: only this test installs a builder, and it does so once.
        let _ = keyring::set_default_credential_builder(keyring::mock::default_credential_builder());
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).expect("mock entry");

        // Nothing stored yet → load is None; clear on an empty store is a no-op, not an error.
        assert_eq!(load_from(&entry), None, "empty store reads as signed-out");
        clear_in(&entry);

        // Save then load round-trips the exact token.
        assert!(save_to(&entry, "gho_roundtrip"), "mock store accepts the save");
        assert_eq!(load_from(&entry).as_deref(), Some("gho_roundtrip"));

        // Clear forgets it; clearing again stays a no-op.
        clear_in(&entry);
        assert_eq!(load_from(&entry), None, "cleared store reads as signed-out");
        clear_in(&entry);
    }

    #[test]
    fn stage_and_commit_tree_mirrors_the_dir_exactly() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("index.html"), b"<h1>hi</h1>").unwrap();
        std::fs::write(dir.path().join("data.json"), b"{}").unwrap();
        std::fs::create_dir(dir.path().join("assets")).unwrap();
        std::fs::write(dir.path().join("assets").join("app.js"), b"//x").unwrap();

        let (repo, oid) = stage_and_commit(dir.path()).expect("commits");
        let commit = repo.find_commit(oid).expect("commit exists");
        let tree = commit.tree().expect("tree");

        // Top level lists exactly the staged entries — and never the .git dir libgit2 created in `dir`.
        let mut names: Vec<String> =
            tree.iter().map(|e| e.name().unwrap_or_default().to_string()).collect();
        names.sort();
        assert_eq!(names, vec!["assets", "data.json", "index.html"]);

        // Nested files are committed too (recursive stage).
        let assets = tree
            .get_name("assets")
            .and_then(|e| e.to_object(&repo).ok())
            .and_then(|o| o.peel_to_tree().ok())
            .expect("assets subtree");
        assert!(assets.get_name("app.js").is_some(), "nested file is in the tree");

        // It's a root commit (no parents) with the fixed publish identity.
        assert_eq!(commit.parent_count(), 0, "single-pack full replacement is a parent-less commit");
        assert_eq!(commit.author().name(), Some(COMMIT_NAME));
        assert_eq!(commit.author().email(), Some(COMMIT_EMAIL));

        // commitSha is the oid we return to JS.
        assert_eq!(PushResult { commit_sha: oid.to_string() }.commit_sha, oid.to_string());
    }

    /// Live push — user-run (needs a real token + scratch repo). Mirrors the spike's `push_smoke`.
    /// Create the scratch repo first, e.g. `gh repo create <owner>/<repo> --private`, then:
    ///   GITHUB_TOKEN=$(gh auth token) cargo test -p archie push_live -- --ignored --nocapture
    #[test]
    #[ignore = "requires GITHUB_TOKEN + a scratch repo; run manually (plan Task 6 Step 3)"]
    fn push_live() {
        let token = std::env::var("GITHUB_TOKEN").expect("set GITHUB_TOKEN");
        let owner = std::env::var("ARCHIE_PUSH_OWNER").unwrap_or_else(|_| "micahchoo".into());
        let repo = std::env::var("ARCHIE_PUSH_REPO").unwrap_or_else(|_| "archie-pages-probe".into());

        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("index.html"), b"<h1>archie push_live</h1>").unwrap();

        let started = std::time::Instant::now();
        let result = push_tree_blocking(dir.path().to_str().unwrap(), &owner, &repo, "gh-pages", &token)
            .expect("push succeeds");
        eprintln!("push_live: commit {} in {:?}", result.commit_sha, started.elapsed());
    }

    #[test]
    fn deploy_error_serializes_without_status_when_absent() {
        let err = DeployError::new("network", "offline");
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json.get("kind").unwrap(), "network");
        assert_eq!(json.get("message").unwrap(), "offline");
        assert!(json.get("status").is_none(), "status omitted when None");
    }
}
