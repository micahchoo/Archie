// OAuth device-flow sign-in — the "enter this code on github.com" flow. The webview can't do this
// itself (`github.com/login/*` sends no CORS headers) and the token must stay off the JS heap
// (Q-12). This module owns the whole handshake: start (fetch the code), poll (sleep + re-ask until
// the scholar authorizes), and the token-endpoint wire shapes.
//
// The poll loop is a pure timing state machine over an injected `PollIo` — the same pure/impure
// split video.rs uses. The tauri command wires the real tokio clock + reqwest; the unit tests
// substitute a manual clock and a fixture queue, so the backoff/deadline decisions run headlessly.

use serde::{Deserialize, Serialize};
use std::time::Duration;

use super::DeployError;

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

/// The first poll wait: the server-suggested interval, floored at 1s so a zero/malformed interval
/// never busy-polls the endpoint.
fn initial_wait(interval: u64) -> u64 {
    interval.max(1)
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
// The poll loop — pure timing policy over injected I/O.
// ---------------------------------------------------------------------------------------------------

/// The poll loop's injectable I/O, i.e. the seam that lets the loop's timing decisions run headless.
/// The command wires the real tokio clock + reqwest (`LiveIo` below); tests substitute a manual
/// clock and a fixture queue (`FixtureIo` in the tests module).
trait PollIo {
    /// Elapsed time since the loop started.
    fn elapsed(&self) -> Duration;
    /// Wait before the next poll. Real: tokio sleep. Test: recorded, never actually awaited.
    async fn sleep(&mut self, secs: u64);
    /// Ask the token endpoint. Real: reqwest POST. Test: serve the next fixture.
    async fn post(&mut self) -> Result<GhTokenResponse, DeployError>;
}

/// The poll loop itself. Sleeps `interval` seconds before each request, widens the wait on
/// `slow_down`, stops at the local deadline, and returns the token exactly once. Every timing
/// decision is a plain function of the injected I/O's answers, so the whole loop is unit-testable
/// without a network or a real clock.
async fn poll_loop<Io: PollIo>(
    io: &mut Io,
    interval: u64,
    expires_in: u64,
) -> Result<DevicePollResult, DeployError> {
    let mut wait = initial_wait(interval);
    loop {
        // GitHub requires waiting `interval` seconds before each poll — sleep first.
        io.sleep(wait).await;
        // Stop the moment the code's lifetime is spent, even if GitHub is still saying "pending".
        if deadline_exceeded(io.elapsed(), expires_in) {
            return Err(expired_error());
        }
        let parsed = io.post().await?;
        match classify_poll(&parsed) {
            PollStep::Authorized(token) => return Ok(DevicePollResult { token: token.expose() }),
            PollStep::Pending => {}
            PollStep::SlowDown(server) => wait = bumped_interval(wait, server),
            PollStep::Terminal(err) => return Err(err),
        }
    }
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

/// The real `PollIo`: the started instant (deadline clock), the reqwest client, and the poll's own
/// request parameters.
struct LiveIo {
    started: tokio::time::Instant,
    client: reqwest::Client,
    client_id: String,
    device_code: String,
}

impl PollIo for LiveIo {
    fn elapsed(&self) -> Duration {
        self.started.elapsed()
    }

    async fn sleep(&mut self, secs: u64) {
        tokio::time::sleep(Duration::from_secs(secs)).await;
    }

    async fn post(&mut self) -> Result<GhTokenResponse, DeployError> {
        let resp = self
            .client
            .post(ACCESS_TOKEN_URL)
            .header(reqwest::header::ACCEPT, "application/json")
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("device_code", self.device_code.as_str()),
                ("grant_type", DEVICE_GRANT_TYPE),
            ])
            .send()
            .await
            .map_err(network_err)?;
        let body = resp.text().await.map_err(network_err)?;
        serde_json::from_str(&body)
            .map_err(|_| DeployError::new("gh", "GitHub returned a response we didn't understand."))
    }
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
    let mut io = LiveIo {
        started: tokio::time::Instant::now(),
        client: reqwest::Client::new(),
        client_id,
        device_code,
    };
    poll_loop(&mut io, interval, expires_in).await
}

// ---------------------------------------------------------------------------------------------------
// Tests — fixture parsing + the injected-clock poll loop (no network). GitHub's response bodies are
// stable and documented.
// ---------------------------------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

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
    fn first_wait_floors_at_one_second() {
        assert_eq!(initial_wait(5), 5, "keeps a sane server interval");
        assert_eq!(initial_wait(0), 1, "a zero interval must not busy-poll");
    }

    // -----------------------------------------------------------------------------------------------
    // The poll loop, driven by a manual clock + fixture queue — the injected I/O seam (PollIo).
    // -----------------------------------------------------------------------------------------------

    /// Manual-clock I/O for the loop tests: serves fixture responses in order, records every sleep,
    /// and counts each sleep as real elapsed time (sleeping `wait` seconds is what advances the
    /// deadline clock). The loop therefore runs headlessly — no tokio timer, no network.
    struct FixtureIo {
        elapsed: Duration,
        sleeps: Vec<u64>,
        responses: VecDeque<Result<GhTokenResponse, DeployError>>,
    }

    impl FixtureIo {
        fn serving(responses: Vec<Result<GhTokenResponse, DeployError>>) -> Self {
            FixtureIo { elapsed: Duration::ZERO, sleeps: Vec::new(), responses: responses.into() }
        }
    }

    impl PollIo for FixtureIo {
        fn elapsed(&self) -> Duration {
            self.elapsed
        }

        async fn sleep(&mut self, secs: u64) {
            self.sleeps.push(secs);
            self.elapsed += Duration::from_secs(secs);
        }

        async fn post(&mut self) -> Result<GhTokenResponse, DeployError> {
            // An exhausted queue panics the test — a loop that polls when it shouldn't fails loudly.
            self.responses.pop_front().expect("fixture queue exhausted")
        }
    }

    /// A fixture server response. GitHub's error bodies ({"error":"expired_token",…}) are SUCCESSFUL
    /// HTTP responses carrying an error field — the loop's `classify_poll` maps them Terminal, exactly
    /// like the real `post()`. `Result::Err` is reserved for TRANSPORT failures (network_err), which
    /// no fixture exercises, so every fixture is `Ok(parsed)`. Deserializing `GhTokenResponse` (not
    /// `Result<_, DeployError>` — DeployError has no Deserialize, and the wire shape isn't a serde
    /// Result) is what the pre-split fixture did.
    fn token(body: &str) -> Result<GhTokenResponse, DeployError> {
        Ok(serde_json::from_str::<GhTokenResponse>(body).expect("valid fixture"))
    }

    #[tokio::test(flavor = "current_thread")]
    async fn loop_returns_the_token_after_pending_reentry() {
        let mut io = FixtureIo::serving(vec![
            token(r#"{"error":"authorization_pending","error_description":"pending"}"#),
            token(r#"{"access_token":"gho_reentry"}"#),
        ]);
        let result = poll_loop(&mut io, 5, 900).await.expect("authorizes");
        assert_eq!(result.token, "gho_reentry");
        assert_eq!(io.sleeps, vec![5, 5], "waits the interval before every poll");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn loop_widens_the_wait_on_slow_down() {
        let mut io = FixtureIo::serving(vec![
            token(r#"{"error":"slow_down","error_description":"too fast","interval":10}"#),
            token(r#"{"access_token":"gho_slow"}"#),
        ]);
        let result = poll_loop(&mut io, 5, 900).await.expect("authorizes");
        assert_eq!(result.token, "gho_slow");
        assert_eq!(io.sleeps, vec![5, 10], "backed off to the bumped interval");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn loop_stops_at_the_deadline_even_when_server_keeps_pending() {
        // GitHub answers `authorization_pending` four times, but the local deadline (expires_in=5)
        // fires on the fifth sleep — the loop must stop even though the server never said to.
        let mut io = FixtureIo::serving(vec![
            token(r#"{"error":"authorization_pending"}"#),
            token(r#"{"error":"authorization_pending"}"#),
            token(r#"{"error":"authorization_pending"}"#),
            token(r#"{"error":"authorization_pending"}"#),
        ]);
        let result = poll_loop(&mut io, 1, 5).await;
        match result {
            Err(e) => assert_eq!(e.kind, "expired"),
            Ok(r) => panic!("expected expired, got token {}", r.token),
        }
        assert_eq!(io.sleeps, vec![1, 1, 1, 1, 1], "one sleep per poll, then the deadline stopped it");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn loop_never_polls_after_the_code_is_already_spent() {
        // expires_in=0: the code is dead on arrival. The loop must stop at the first deadline check
        // without asking the server — an empty fixture queue would panic if it did.
        let mut io = FixtureIo::serving(Vec::new());
        let result = poll_loop(&mut io, 5, 0).await;
        match result {
            Err(e) => assert_eq!(e.kind, "expired"),
            Ok(r) => panic!("expected expired, got token {}", r.token),
        }
        assert_eq!(io.sleeps, vec![5], "one sleep, then the deadline stopped it");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn loop_stops_on_a_terminal_server_error() {
        let mut io = FixtureIo::serving(vec![token(r#"{"error":"expired_token"}"#)]);
        let result = poll_loop(&mut io, 5, 900).await;
        match result {
            Err(e) => assert_eq!(e.kind, "expired"),
            Ok(r) => panic!("expected expired, got token {}", r.token),
        }
        assert_eq!(io.sleeps, vec![5], "one poll, then the terminal error stopped it");
    }
}
