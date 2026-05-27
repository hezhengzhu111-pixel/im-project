use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
}

#[tauri::command]
pub async fn pick_files(_app: tauri::AppHandle) -> Result<Vec<FileInfo>, String> {
    let files = rfd::FileDialog::new()
        .add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp"])
        .add_filter("Documents", &["pdf", "doc", "docx", "txt"])
        .add_filter("All Files", &["*"])
        .pick_files();

    match files {
        Some(paths) => {
            let mut result = Vec::new();
            for path in paths {
                let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
                result.push(FileInfo {
                    name: path.file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string(),
                    path: path.to_string_lossy().to_string(),
                    size: metadata.len(),
                });
            }
            Ok(result)
        }
        None => Ok(Vec::new()),
    }
}
