use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

#[tauri::command]
pub async fn show_notification(
    app: AppHandle,
    title: String,
    body: Option<String>,
    _tag: Option<String>,
) -> Result<(), String> {
    let mut builder = app.notification().builder().title(title);
    if let Some(body) = body {
        builder = builder.body(body);
    }
    builder.show().map_err(|e| e.to_string())?;
    Ok(())
}
