mod agent_engine;
mod agent_session;
mod chat_engine;
mod commands;

use commands::agent::AgentState;
use std::sync::{Arc, Mutex};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AgentState(Arc::new(Mutex::new(None))))
        .invoke_handler(tauri::generate_handler![
            commands::agent::start_agent,
            commands::agent::send_agent_message,
            commands::agent::stop_agent,
            commands::agent::respond_agent_interrupt,
            commands::agent::create_agent_session,
            commands::agent::list_agent_sessions,
            commands::agent::get_agent_session,
            commands::agent::delete_agent_session,
            commands::alias::list_aliases,
            commands::alias::set_alias,
            commands::alias::remove_alias,
            commands::chat::send_message,
            commands::chat::list_sessions,
            commands::chat::create_session,
            commands::chat::delete_session,
            commands::chat::get_session_messages,
            commands::chat::delete_message,
            commands::chat::clear_session,
            commands::config::get_config,
            commands::config::set_config,
            commands::config::get_agent_config,
            commands::config::set_agent_config,
            commands::config::set_active_provider,
            commands::config::get_system_prompt,
            commands::config::set_system_prompt,
            commands::system::get_version,
            commands::system::set_theme,
            commands::governance::list_skills,
            commands::governance::list_hooks,
            commands::governance::list_mcp_servers,
            commands::governance::save_mcp_servers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
