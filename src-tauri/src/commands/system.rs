use j_cli::command::chat::storage::{load_agent_config, save_agent_config};
use j_cli::theme::ThemeName;
use tauri::Emitter;

#[tauri::command]
pub fn get_version() -> Result<String, String> {
    Ok(j_cli::constants::VERSION.to_string())
}

#[tauri::command]
pub fn set_theme(app: tauri::AppHandle, theme: String) -> Result<(), String> {
    let mut config = load_agent_config();
    config.theme = ThemeName::parse(&theme);
    if !save_agent_config(&config) {
        return Err("保存主题配置失败".to_string());
    }
    app.emit("theme-changed", &theme).map_err(|e| e.to_string())
}
