// GitHub publish handshake — the one thing the webview can't do itself.
//
// `github.com/login/*` sends no CORS headers, so a webview `fetch()` cannot call the device-flow
// endpoints; and the OAuth token must stay off the JS heap (decision Q-12, docs/decisions/archie.md).
// Both constraints put this code in Rust. The JS side (apps/studio/src/deploy/) invokes these
// commands; every payload serializes to the camelCase contract in apps/studio/src/deploy/types.ts.
//
// Three subsystems, one error contract:
//   - device_flow: the OAuth device-flow handshake + the poll loop (pure timing over injected I/O)
//   - keyring:     OS-keyring token custody (Q-12)
//   - pack_push:   single-pack force-push of the staged site tree (Q-13)
// The tauri commands are re-exported here so lib.rs registers the `github::gh_*` surface unchanged.
//
// TOKEN SAFETY: the access token appears only in `DevicePollResult` (returned to the caller once) and
// in the keyring (Q-12). It is never logged, never `Debug`-printed, never written to disk here.

use serde::Serialize;

mod device_flow;
mod keyring;
mod pack_push;

// Tauri 2's `#[tauri::command]` macro generates `__cmd__<name>` / `__tauri_command_name_<name>`
// items IN THE MODULE WHERE THE FN IS DEFINED. lib.rs's `generate_handler![github::gh_*]` resolves
// them at the `github::` path, so each `pub use` below must re-export the macro-generated siblings
// alongside the command fn — a plain `pub use` of only the fn breaks the handler's path resolution
// (E0433: could not find `__cmd__gh_*` in `github`).
pub use device_flow::{
    gh_device_poll, gh_device_start,
    __cmd__gh_device_poll, __cmd__gh_device_start,
    __tauri_command_name_gh_device_poll, __tauri_command_name_gh_device_start,
};
pub use keyring::{
    gh_token_clear, gh_token_load, gh_token_save,
    __cmd__gh_token_clear, __cmd__gh_token_load, __cmd__gh_token_save,
    __tauri_command_name_gh_token_clear, __tauri_command_name_gh_token_load, __tauri_command_name_gh_token_save,
};
pub use pack_push::{
    gh_push_tree,
    __cmd__gh_push_tree,
    __tauri_command_name_gh_push_tree,
};

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deploy_error_serializes_without_status_when_absent() {
        let err = DeployError::new("network", "offline");
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json.get("kind").unwrap(), "network");
        assert_eq!(json.get("message").unwrap(), "offline");
        assert!(json.get("status").is_none(), "status omitted when None");
    }
}
