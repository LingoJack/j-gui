#![deny(unsafe_code)]
#![deny(unused_imports)]
#![deny(unused_variables)]
#![deny(unused_must_use)]

mod agent_engine;
mod agent_retry;
mod agent_runtime_recovery;
mod agent_session;
mod chat_engine;
mod commands;
mod kernel;

use commands::agent::AgentState;
use std::sync::{Arc, Mutex};
use tauri::menu::{MenuBuilder, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{LogicalPosition, LogicalSize};
use tauri::{Manager, Runtime, WindowEvent};
use tauri_plugin_window_state::Builder as WindowStateBuilder;

const TRAY_SHOW_ID: &str = "tray-show-main-window";
const TRAY_QUIT_ID: &str = "tray-quit-app";
const MAIN_WINDOW_SAFE_MIN_WIDTH: f64 = 800.0;
const MAIN_WINDOW_SAFE_MIN_HEIGHT: f64 = 500.0;
const WINDOW_HIDDEN_POSITION: f64 = -32000.0;

fn show_main_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn should_reset_main_window_state(width: f64, height: f64, x: f64, y: f64) -> bool {
    width < MAIN_WINDOW_SAFE_MIN_WIDTH
        || height < MAIN_WINDOW_SAFE_MIN_HEIGHT
        || x <= WINDOW_HIDDEN_POSITION
        || y <= WINDOW_HIDDEN_POSITION
}

fn normalize_main_window_state<R: Runtime>(window: &tauri::WebviewWindow<R>) {
    let Ok(size) = window.outer_size() else {
        return;
    };
    let Ok(position) = window.outer_position() else {
        return;
    };

    let width = f64::from(size.width);
    let height = f64::from(size.height);
    let x = f64::from(position.x);
    let y = f64::from(position.y);

    if !should_reset_main_window_state(width, height, x, y) {
        return;
    }

    let _ = window.set_size(tauri::Size::Logical(LogicalSize::new(
        MAIN_WINDOW_SAFE_MIN_WIDTH.max(width),
        MAIN_WINDOW_SAFE_MIN_HEIGHT.max(height),
    )));
    let _ = window.set_position(tauri::Position::Logical(LogicalPosition::new(120.0, 120.0)));
    let _ = window.show();
}

fn handle_main_window_event<R: Runtime>(
    window: &tauri::Window<R>,
    event: &WindowEvent,
    tray_available: &std::sync::atomic::AtomicBool,
) {
    if window.label() != "main" {
        return;
    }

    if let WindowEvent::CloseRequested { api, .. } = event {
        if tray_available.load(std::sync::atomic::Ordering::Relaxed) {
            api.prevent_close();
            let _ = window.hide();
        }
    }
}

fn setup_main_tray<R: Runtime>(app: &mut tauri::App<R>) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, TRAY_SHOW_ID, "显示主界面", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, TRAY_QUIT_ID, "退出 J Gui", true, None::<&str>)?;
    let tray_menu = MenuBuilder::new(app)
        .item(&show_item)
        .separator()
        .item(&quit_item)
        .build()?;

    let mut tray_builder = TrayIconBuilder::with_id("main")
        .menu(&tray_menu)
        .tooltip("J Gui")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button,
                button_state,
                ..
            } = event
            {
                if button == MouseButton::Left && button_state == MouseButtonState::Up {
                    show_main_window(tray.app_handle());
                }
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray_builder = tray_builder.icon(icon.clone());
    }

    tray_builder.build(app)?;
    Ok(())
}

fn setup_main_window<R: Runtime>(app: &mut tauri::App<R>) {
    #[cfg(target_os = "windows")]
    {
        if let Some(window) = app.get_webview_window("main") {
            normalize_main_window_state(&window);
            let _ = window.set_decorations(false);
        }
    }
}

fn build_app<R: Runtime>(
    builder: tauri::Builder<R>,
    tray_available_for_setup: Arc<std::sync::atomic::AtomicBool>,
    tray_available_for_events: Arc<std::sync::atomic::AtomicBool>,
) -> tauri::Builder<R> {
    builder
        .plugin(WindowStateBuilder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(move |window, event| {
            handle_main_window_event(window, event, tray_available_for_events.as_ref());
        })
        .setup(move |app| {
            if let Err(error) = setup_main_tray(app) {
                eprintln!("tray initialization failed, continue without tray: {error}");
                tray_available_for_setup.store(false, std::sync::atomic::Ordering::Relaxed);
            } else {
                tray_available_for_setup.store(true, std::sync::atomic::Ordering::Relaxed);
            }

            setup_main_window(app);
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id() == TRAY_SHOW_ID {
                show_main_window(app);
            } else if event.id() == TRAY_QUIT_ID {
                app.exit(0);
            }
        })
        .manage(AgentState(Arc::new(Mutex::new(
            std::collections::HashMap::new(),
        ))))
        .manage(Arc::new(kernel::JcliAdapter::new()))
}

macro_rules! register_invoke_handler {
    ($builder:expr) => {
        $builder.invoke_handler(tauri::generate_handler![
            commands::agent::start_agent,
            commands::agent::send_agent_message,
            commands::agent::stop_agent,
            commands::agent::respond_agent_interrupt,
            commands::agent::create_agent_session,
            commands::agent::list_agent_sessions,
            commands::agent::get_agent_session,
            commands::agent::get_agent_session_sdk_messages,
            commands::agent::search_agent_session_messages,
            commands::agent::delete_agent_session,
            commands::agent::move_agent_session_to_workspace,
            commands::agent::fork_agent_session,
            commands::agent::rewind_session,
            commands::agent::generate_agent_title,
            commands::agent::update_agent_session_title,
            commands::agent::respond_permission,
            commands::agent::respond_ask_user,
            commands::agent::update_session_permission_mode,
            commands::agent::toggle_pin_agent_session,
            commands::agent::toggle_archive_agent_session,
            commands::agent::toggle_manual_working_agent_session,
            commands::alias::list_aliases,
            commands::alias::set_alias,
            commands::alias::remove_alias,
            commands::chat::send_message,
            commands::chat::list_sessions,
            commands::chat::create_session,
            commands::chat::delete_session,
            commands::chat::get_session_messages,
            commands::chat::search_conversation_messages,
            commands::chat::build_chat_reference_context,
            commands::chat::delete_message,
            commands::chat::truncate_messages_from,
            commands::chat::clear_session,
            commands::chat::update_conversation_title,
            commands::chat::update_conversation_model,
            commands::chat::update_context_dividers,
            commands::chat::stop_generation,
            commands::chat::toggle_pin_conversation,
            commands::chat::toggle_archive_conversation,
            commands::config::get_config,
            commands::config::set_config,
            commands::config::get_agent_config,
            commands::config::set_agent_config,
            commands::config::set_active_provider,
            commands::config::get_system_prompt,
            commands::config::set_system_prompt,
            commands::files::open_file_dialog,
            commands::files::open_folder_dialog,
            commands::files::move_file,
            commands::files::open_file,
            commands::files_workspace::preview_file,
            commands::files::save_attachment,
            commands::files_workspace::save_files_to_agent_session,
            commands::files_workspace::save_files_to_workspace_files,
            commands::files::read_attachment,
            commands::files_workspace::read_attached_file,
            commands::files::delete_attachment,
            commands::files::list_directory,
            commands::files_workspace::list_attached_directory,
            commands::files::delete_file,
            commands::files::rename_file,
            commands::files_workspace::rename_attached_file,
            commands::files_workspace::move_attached_file,
            commands::files_workspace::open_attached_file,
            commands::files::show_in_folder,
            commands::files_workspace::show_attached_in_folder,
            commands::files_workspace::check_paths_type,
            commands::files_workspace::search_workspace_files,
            commands::files::attach_directory,
            commands::files::detach_directory,
            commands::files::attach_workspace_directory,
            commands::files::detach_workspace_directory,
            commands::files::get_workspace_directories,
            commands::files::get_agent_session_path,
            commands::files::get_workspace_files_path,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::get_user_profile,
            commands::settings::update_user_profile,
            commands::settings::list_agent_workspaces,
            commands::settings::create_agent_workspace,
            commands::settings::update_agent_workspace,
            commands::settings::delete_agent_workspace,
            commands::settings::reorder_agent_workspaces,
            commands::settings::check_environment,
            commands::settings::get_runtime_status,
            commands::settings::reinit_runtime,
            commands::settings::get_storage_stats,
            commands::settings::get_system_prompts,
            commands::settings::get_system_prompt_config,
            commands::settings::create_system_prompt,
            commands::settings::update_system_prompt,
            commands::settings::delete_system_prompt,
            commands::settings::set_default_prompt,
            commands::settings::update_append_setting,
            commands::system::get_version,
            commands::system::get_kernel_info,
            commands::system::check_kernel_update,
            commands::system::check_app_update,
            commands::system::set_theme,
            commands::system::get_claude_cli_status,
            commands::channels::test_channel_direct,
            commands::channels::test_saved_channel,
            commands::channels::list_channels,
            commands::channels::create_channel,
            commands::channels::update_channel,
            commands::channels::delete_channel,
            commands::channels::decrypt_api_key,
            commands::channels::fetch_models,
            commands::governance::list_skills,
            commands::governance::list_hooks,
            commands::governance::list_mcp_servers,
            commands::governance::save_mcp_servers,
            commands::governance::list_chat_tools,
            commands::governance::set_tool_enabled,
            commands::governance::scan_global_skills,
            commands::governance::copy_skill_to_workspace,
            commands::governance::toggle_hook,
            commands::governance::read_skill_content,
            commands::governance::write_skill_content,
            commands::governance::toggle_workspace_skill,
            commands::governance::delete_workspace_skill,
            commands::governance::get_workspace_skills,
            commands::governance::get_workspace_skills_dir,
            commands::governance::get_other_workspace_skills,
            commands::governance::import_skill_from_workspace,
            commands::governance::get_workspace_capabilities,
            commands::governance::test_mcp_server,
            commands::governance::get_workspace_mcp_config,
            commands::governance::save_workspace_mcp_config,
            commands::governance::import_cc_sdk_hooks,
            commands::governance::import_cc_sdk_mcp,
        ])
    };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// 启动 Tauri 应用，注册命令、托盘、窗口事件与全局状态。
pub fn run() {
    let tray_available = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let tray_available_for_setup = Arc::clone(&tray_available);
    let tray_available_for_events = Arc::clone(&tray_available);

    let app = register_invoke_handler!(build_app(
        tauri::Builder::default(),
        tray_available_for_setup,
        tray_available_for_events
    ));

    if let Err(err) = app.run(tauri::generate_context!()) {
        panic!("error while running tauri application: {err}");
    }
}

#[cfg(test)]
mod tests {
    use super::should_reset_main_window_state;

    #[test]
    fn malformed_window_state_requires_reset() {
        assert!(should_reset_main_window_state(
            252.0, 23.0, -32000.0, -32000.0
        ));
    }

    #[test]
    fn healthy_window_state_is_preserved() {
        assert!(!should_reset_main_window_state(1200.0, 800.0, 100.0, 100.0));
    }

    #[test]
    fn undecorated_window_state_is_not_reset_by_itself() {
        assert!(!should_reset_main_window_state(1200.0, 800.0, 100.0, 100.0));
    }
}
