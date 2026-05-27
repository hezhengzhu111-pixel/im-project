#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod e2ee;
mod plugins;

use tauri::Manager;

#[tokio::main]
async fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .manage(e2ee::E2eeManager::new())
        .setup(|app| {
            // Create system tray
            commands::tray::create_tray(app.handle())
                .expect("failed to create tray icon");

            // Register global shortcuts
            commands::shortcut::register_shortcuts(app.handle())
                .expect("failed to register shortcuts");

            // Set up file drag-and-drop on the main window
            if let Some(window) = app.get_webview_window("main") {
                commands::drag::setup_drag_drop(&window)
                    .expect("failed to set up drag-drop handler");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Storage
            commands::storage::secure_store_get,
            commands::storage::secure_store_set,
            commands::storage::secure_store_remove,
            // Notification
            commands::notification::show_notification,
            // Tray
            commands::tray::tray_update_tooltip,
            // Shortcuts
            commands::shortcut::unregister_all_shortcuts,
            // File dialog
            commands::file::pick_files,
            // E2EE
            commands::e2ee::e2ee_generate_key_bundle,
            commands::e2ee::e2ee_create_outbound_session,
            commands::e2ee::e2ee_create_inbound_session,
            commands::e2ee::e2ee_encrypt,
            commands::e2ee::e2ee_decrypt,
            commands::e2ee::e2ee_export_session,
            commands::e2ee::e2ee_restore_session,
            commands::e2ee::e2ee_remove_session,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
