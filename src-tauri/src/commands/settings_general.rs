use super::{save_settings, save_user_profile, GuiSettings, UserProfile};
use tauri::Emitter;

macro_rules! set_str {
    ($val:expr, $settings:expr, $field:ident) => {
        if let Some(v) = $val.as_str() {
            $settings.$field = v.to_string();
        }
    };
}

macro_rules! set_bool {
    ($val:expr, $settings:expr, $field:ident) => {
        if let Some(v) = $val.as_bool() {
            $settings.$field = v;
        }
    };
}

macro_rules! set_u64 {
    ($val:expr, $settings:expr, $field:ident) => {
        if let Some(v) = $val.as_u64() {
            $settings.$field = v as u32;
        }
    };
}

macro_rules! set_opt_str {
    ($val:expr, $settings:expr, $field:ident) => {
        if $val.is_null() {
            $settings.$field = None;
        } else if let Some(v) = $val.as_str() {
            $settings.$field = Some(v.to_string());
        }
    };
}

macro_rules! set_opt_val {
    ($val:expr, $settings:expr, $field:ident) => {
        if $val.is_null() {
            $settings.$field = None;
        } else {
            $settings.$field = Some($val.clone());
        }
    };
}

macro_rules! set_opt_u64 {
    ($val:expr, $settings:expr, $field:ident) => {
        if $val.is_null() {
            $settings.$field = None;
        } else if let Some(v) = $val.as_u64() {
            $settings.$field = Some(v as u32);
        }
    };
}

macro_rules! set_opt_f64 {
    ($val:expr, $settings:expr, $field:ident) => {
        if $val.is_null() {
            $settings.$field = None;
        } else if let Some(v) = $val.as_f64() {
            $settings.$field = Some(v);
        }
    };
}

macro_rules! set_arr_str {
    ($val:expr, $settings:expr, $field:ident) => {
        if let Some(arr) = $val.as_array() {
            $settings.$field = arr
                .iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect();
        }
    };
}

pub(crate) fn apply_settings_updates(
    app: tauri::AppHandle,
    mut settings: GuiSettings,
    updates: serde_json::Value,
) -> Result<GuiSettings, String> {
    let mut theme_changed = false;

    if let Some(obj) = updates.as_object() {
        for (key, value) in obj {
            match key.as_str() {
                "themeMode" => {
                    set_str!(value, settings, theme_mode);
                    theme_changed = true;
                }
                "themeStyle" => {
                    set_str!(value, settings, theme_style);
                    theme_changed = true;
                }
                "onboardingCompleted" => set_bool!(value, settings, onboarding_completed),
                "agentChannelId" => set_opt_str!(value, settings, agent_channel_id),
                "agentModelId" => set_opt_str!(value, settings, agent_model_id),
                "agentBackendMode" => set_opt_str!(value, settings, agent_backend_mode),
                "agentChannelIds" => set_arr_str!(value, settings, agent_channel_ids),
                "agentWorkspaceId" => set_opt_str!(value, settings, agent_workspace_id),
                "chatWorkspaceId" => set_opt_str!(value, settings, chat_workspace_id),
                "notificationsEnabled" => set_bool!(value, settings, notifications_enabled),
                "notificationSoundEnabled" => {
                    set_bool!(value, settings, notification_sound_enabled)
                }
                "tutorialBannerDismissed" => set_bool!(value, settings, tutorial_banner_dismissed),
                "archiveAfterDays" => set_u64!(value, settings, archive_after_days),
                "sendWithCmdEnter" => set_bool!(value, settings, send_with_cmd_enter),
                "stickyUserMessageEnabled" => {
                    set_bool!(value, settings, sticky_user_message_enabled)
                }
                "agentThinking" => set_opt_val!(value, settings, agent_thinking),
                "agentEffort" => set_opt_str!(value, settings, agent_effort),
                "agentMaxBudgetUsd" => set_opt_f64!(value, settings, agent_max_budget_usd),
                "agentMaxTurns" => set_opt_u64!(value, settings, agent_max_turns),
                "tabState" => set_opt_val!(value, settings, tab_state),
                "shortcutOverrides" => set_opt_val!(value, settings, shortcut_overrides),
                "appIconVariant" => set_opt_str!(value, settings, app_icon_variant),
                "environmentCheckSkipped" => set_bool!(value, settings, environment_check_skipped),
                "lastEnvironmentCheck" => set_opt_val!(value, settings, last_environment_check),
                "notificationSounds" => set_opt_val!(value, settings, notification_sounds),
                "voiceDictation" => set_opt_val!(value, settings, voice_dictation),
                _ => {}
            }
        }
    }

    save_settings(&settings)?;
    if theme_changed {
        app.emit(
            "theme-changed",
            serde_json::json!({
                "themeMode": settings.theme_mode,
                "themeStyle": settings.theme_style,
            }),
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(settings)
}

pub(crate) fn apply_user_profile_updates(
    mut profile: UserProfile,
    updates: serde_json::Value,
) -> Result<UserProfile, String> {
    if let Some(obj) = updates.as_object() {
        if let Some(v) = obj.get("userName").and_then(|v| v.as_str()) {
            profile.user_name = v.to_string();
        }
        if let Some(v) = obj.get("avatar").and_then(|v| v.as_str()) {
            profile.avatar = v.to_string();
        }
    }

    save_user_profile(&profile)?;
    Ok(profile)
}
