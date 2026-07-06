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

/// The `/login/oauth/access_token` body: success carries `access_token`; every non-success carries
/// `error` (and often `error_description`); `slow_down` may carry a widened `interval`.
#[derive(Debug, Deserialize)]
struct GhTokenResponse {
    access_token: Option<String>,
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
    Authorized(String),
    Pending,
    /// GitHub asked us to back off; the payload is its suggested new interval, if any.
    SlowDown(Option<u64>),
    Terminal(DeployError),
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
        Some("expired_token") => PollStep::Terminal(DeployError::new(
            "expired",
            "The sign-in code expired before you authorized it. Start again to get a new one.",
        )),
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

/// The poll interval after a `slow_down`. Honors GitHub's suggested interval when it is larger than
/// what we're already using; otherwise adds the spec's +5s. Guarantees the interval only ever grows,
/// so the poll loop always backs off (never busy-loops).
fn bumped_interval(current: u64, server: Option<u64>) -> u64 {
    match server {
        Some(i) if i > current => i,
        _ => current + 5,
    }
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
/// `expired_token` / `access_denied` / `device_flow_disabled` — GitHub's own `expired_token`
/// guarantees the loop can never run forever.
#[tauri::command]
pub async fn gh_device_poll(
    client_id: String,
    device_code: String,
    interval: u64,
) -> Result<DevicePollResult, DeployError> {
    let client = reqwest::Client::new();
    let mut wait = interval.max(1);
    loop {
        // GitHub requires waiting `interval` seconds before each poll — sleep first.
        tokio::time::sleep(Duration::from_secs(wait)).await;
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
            PollStep::Authorized(token) => return Ok(DevicePollResult { token }),
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

/// Persist the session token to the OS keyring. Returns `false` when the platform store is
/// unavailable — a truthful "couldn't stay signed in", NOT an error the UI must dialog about.
#[tauri::command]
pub fn gh_token_save(token: String) -> bool {
    match keyring_entry() {
        Ok(entry) => save_to(&entry, &token),
        Err(_) => false,
    }
}

/// Load a previously-saved token. `None` = nothing stored or the store is unavailable (signed out).
#[tauri::command]
pub fn gh_token_load() -> Option<String> {
    keyring_entry().ok().and_then(|entry| load_from(&entry))
}

/// Forget the stored token (sign out). A no-op when nothing is stored.
#[tauri::command]
pub fn gh_token_clear() {
    if let Ok(entry) = keyring_entry() {
        clear_in(&entry);
    }
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
            PollStep::Authorized(t) => assert_eq!(t, "gho_example_test_token"),
            other => panic!("expected authorized, got {other:?}"),
        }
    }

    #[test]
    fn slow_down_interval_only_grows() {
        assert_eq!(bumped_interval(5, Some(10)), 10, "honors a larger server interval");
        assert_eq!(bumped_interval(5, None), 10, "adds +5 when GitHub suggests none");
        assert_eq!(bumped_interval(5, Some(5)), 10, "never shrinks: +5 when server isn't larger");
        assert_eq!(bumped_interval(10, Some(3)), 15, "ignores a smaller server interval");
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
    fn deploy_error_serializes_without_status_when_absent() {
        let err = DeployError::new("network", "offline");
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json.get("kind").unwrap(), "network");
        assert_eq!(json.get("message").unwrap(), "offline");
        assert!(json.get("status").is_none(), "status omitted when None");
    }
}
