use tauri::Emitter;

#[tauri::command]
pub fn get_version() -> Result<String, String> {
    Ok(j_cli::constants::VERSION.to_string())
}

#[tauri::command]
pub fn set_theme(app: tauri::AppHandle, theme: String) -> Result<(), String> {
    app.emit("theme-changed", &theme).map_err(|e| e.to_string())
}
