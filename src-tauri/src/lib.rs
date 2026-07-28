// The webview host. App behaviour lives in the Studio/Viewer bundles, driven through the standard
// fs + dialog plugins (see apps/studio/src/tauri-fs.ts → @render/core TauriFilesystem). The Rust side
// adds ONE thing the web origin can't give a chromeless webview: a native menu to navigate between
// the two same-origin apps (Studio at /, Viewer at /viewer/), since there is no URL bar.

use tauri::menu::{MenuBuilder, SubmenuBuilder};
use tauri::Manager;

// GitHub publish handshake — device-flow sign-in + keyring token custody. See github.rs; the token
// stays in Rust (Q-12) and the endpoints have no CORS, so the webview can't call them itself.
mod github;

// Native video transcode (Archie-7e6f) — the web quality tier's desktop encoder. WebKitGTK has no
// WebCodecs, so the webview cannot transcode video itself; this shells out to the runtime's ffmpeg.
// See video.rs for the measured GNOME 49 codec findings (H.264 needs the codecs-extra extension).
mod video;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single-instance FIRST (the plugin requires it): a second launch of the app fires this
        // callback in the ALREADY-RUNNING process instead of standing up a second webview. We focus
        // the existing "main" window rather than open a second writer over the native library folder
        // (Archie-623e Phase 5 — the desktop analogue of OPFS's cross-tab navigator.locks serialization,
        // which does NOT cross OS processes). The on-disk generation-token guard is the defence-in-depth
        // sibling of this and rides the Phase-2 resident-store mount (deferred).
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            github::gh_device_start,
            github::gh_device_poll,
            github::gh_token_save,
            github::gh_token_load,
            github::gh_token_clear,
            github::gh_push_tree,
            video::video_probe_encoders,
            video::video_transcode,
        ])
        .setup(|app| {
            let file = SubmenuBuilder::new(app, "File").quit().build()?;
            let view = SubmenuBuilder::new(app, "View")
                .text("nav_studio", "Studio")
                .text("nav_viewer", "Viewer")
                .separator()
                .text("reload", "Reload")
                .build()?;
            let menu = MenuBuilder::new(app).items(&[&file, &view]).build()?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            // Same-origin navigation within the single "main" webview. location.replace keeps the
            // history clean; the OPFS working store is shared across both paths.
            let js = match event.id().as_ref() {
                "nav_studio" => "window.location.replace('/index.html')",
                "nav_viewer" => "window.location.replace('/viewer/index.html')",
                "reload" => "window.location.reload()",
                _ => return,
            };
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.eval(js);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
