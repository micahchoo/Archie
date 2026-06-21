// The webview host. App behaviour lives in the Studio/Viewer bundles, driven through the standard
// fs + dialog plugins (see apps/studio/src/tauri-fs.ts → @render/core TauriFilesystem). The Rust side
// adds ONE thing the web origin can't give a chromeless webview: a native menu to navigate between
// the two same-origin apps (Studio at /, Viewer at /viewer/), since there is no URL bar.

use tauri::menu::{MenuBuilder, SubmenuBuilder};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
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
