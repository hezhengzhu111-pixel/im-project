#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod e2ee;
mod plugins;

#[tokio::main]
async fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Create system tray
            commands::tray::create_tray(app.handle())
                .expect("failed to create tray icon");

            // Register global shortcuts
            commands::shortcut::register_shortcuts(app.handle())
                .expect("failed to register shortcuts");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::storage::secure_store_get,
            commands::storage::secure_store_set,
            commands::storage::secure_store_remove,
            commands::notification::show_notification,
            commands::tray::tray_update_tooltip,
            commands::shortcut::unregister_all_shortcuts,
            commands::file::pick_files,
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
