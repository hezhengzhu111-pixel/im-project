use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

pub fn register_shortcuts(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let toggle_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyM);
    app.global_shortcut().on_shortcut(toggle_shortcut, |app, _shortcut, event| {
        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
            if let Some(window) = app.get_webview_window("main") {
                if window.is_visible().unwrap_or(false) {
                    let _ = window.hide();
                } else {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }
    })?;
    Ok(())
}

#[tauri::command]
pub async fn unregister_all_shortcuts(app: AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())
}
