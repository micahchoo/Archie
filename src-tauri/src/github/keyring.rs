// Keyring token custody (Q-12) — "stay signed in". The token persists only in the OS keyring, never
// plaintext on disk (a declared kill criterion, PRFAQ). Store is keyed by a fixed service/user pair.

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

#[cfg(test)]
mod tests {
    use super::*;

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
}
