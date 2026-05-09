#![deny(unsafe_code)]
#![deny(unused_imports)]
#![deny(unused_variables)]
#![deny(unused_must_use)]

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
            commands::agent::generate_agent_title,
            commands::agent::update_agent_session_title,
            commands::agent::respond_permission,
            commands::agent::respond_ask_user,
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
            commands::chat::stop_generation,
            commands::config::get_config,
            commands::config::set_config,
            commands::config::get_agent_config,
            commands::config::set_agent_config,
            commands::config::set_active_provider,
            commands::config::get_system_prompt,
            commands::config::set_system_prompt,
            commands::files::open_file_dialog,
            commands::files::save_attachment,
            commands::files::read_attachment,
            commands::files::list_directory,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::get_user_profile,
            commands::settings::update_user_profile,
            commands::settings::list_agent_workspaces,
            commands::settings::create_agent_workspace,
            commands::settings::delete_agent_workspace,
            commands::settings::check_environment,
            commands::system::get_version,
            commands::system::set_theme,
            commands::channels::test_channel_direct,
            commands::channels::list_channels,
            commands::channels::create_channel,
            commands::channels::update_channel,
            commands::channels::delete_channel,
            commands::channels::fetch_models,
            commands::governance::list_skills,
            commands::governance::list_hooks,
            commands::governance::list_mcp_servers,
            commands::governance::save_mcp_servers,
            commands::governance::list_chat_tools,
            commands::governance::set_tool_enabled,
            commands::governance::scan_global_skills,
            commands::governance::copy_skill_to_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
