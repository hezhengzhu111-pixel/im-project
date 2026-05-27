//! File drag-and-drop event listener for the main window.

use serde::Serialize;
use tauri::{Emitter, WebviewWindow};

/// Payload emitted when files are dropped onto the window.
#[derive(Debug, Clone, Serialize)]
pub struct DragDropPayload {
    pub paths: Vec<String>,
    pub position: (f64, f64),
}

/// Set up the file drop listener on the given window.
///
/// Emits a `"file-dropped"` event with [`DragDropPayload`] whenever the user
/// drops files onto the window.
pub fn setup_drag_drop(window: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::DragDrop(drag_event) = event {
            if let tauri::DragDropEvent::Drop { paths, position } = drag_event {
                let payload = DragDropPayload {
                    paths: paths.iter().map(|p| p.to_string_lossy().to_string()).collect(),
                    position: (position.x, position.y),
                };
                let _ = window_clone.emit("file-dropped", &payload);
            }
        }
    });
    Ok(())
}
