use super::*;

static SYSTEM_PROMPT_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

const JCLI_DEFAULT_ID: &str = "jcli-default";

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn system_prompts_config_path() -> PathBuf {
    settings_dir().join("system_prompts.json")
}

fn migrate_system_prompts_config(data_dir: &Path) {
    let new_path = system_prompts_config_path();
    if new_path.exists() {
        return;
    }
    let old_path = data_dir
        .join("agent")
        .join("gui")
        .join("system_prompts.json");
    if old_path.exists() {
        if let Some(parent) = new_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if fs::rename(&old_path, &new_path).is_ok() {
            eprintln!("已迁移系统提示词配置到新路径: {}", new_path.display());
        }
    }
}

fn create_default_system_prompt_config(jcli_system_prompt: Option<&str>) -> SystemPromptConfig {
    let content = jcli_system_prompt.unwrap_or("").to_string();
    let now = now_millis();
    SystemPromptConfig {
        prompts: vec![SystemPromptEntry {
            id: JCLI_DEFAULT_ID.to_string(),
            name: "j-cli 系统提示词".to_string(),
            content,
            builtin: true,
            created_at: now,
            updated_at: now,
        }],
        default_prompt_id: JCLI_DEFAULT_ID.to_string(),
        append_date_time_and_user_name: true,
    }
}

fn load_system_prompts_config_inner(
    jcli_system_prompt: Option<&str>,
) -> Result<SystemPromptConfig, String> {
    let path = system_prompts_config_path();
    if path.exists() {
        let content =
            fs::read_to_string(&path).map_err(|e| format!("读取系统提示词配置失败: {}", e))?;
        match serde_json::from_str(&content) {
            Ok(config) => Ok(config),
            Err(e) => {
                eprintln!("警告: 系统提示词配置已损坏 ({}), 将重置为默认配置", e);
                let config = create_default_system_prompt_config(jcli_system_prompt);
                let _ = save_system_prompts_config_inner(&config);
                Ok(config)
            }
        }
    } else {
        let config = create_default_system_prompt_config(jcli_system_prompt);
        save_system_prompts_config_inner(&config)?;
        Ok(config)
    }
}

fn save_system_prompts_config_inner(config: &SystemPromptConfig) -> Result<(), String> {
    let path = system_prompts_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

fn modify_system_prompts_config<T>(
    f: impl FnOnce(&mut SystemPromptConfig) -> Result<T, String>,
    data_dir: &Path,
    jcli_system_prompt: Option<&str>,
) -> Result<T, String> {
    let _lock = SYSTEM_PROMPT_LOCK
        .lock()
        .map_err(|e| format!("锁定系统提示词配置失败: {}", e))?;
    migrate_system_prompts_config(data_dir);
    let mut config = load_system_prompts_config_inner(jcli_system_prompt)?;
    let result = f(&mut config)?;
    save_system_prompts_config_inner(&config)?;
    Ok(result)
}

fn read_system_prompts_config<T>(
    f: impl FnOnce(&SystemPromptConfig) -> T,
    data_dir: &Path,
    jcli_system_prompt: Option<&str>,
) -> Result<T, String> {
    let _lock = SYSTEM_PROMPT_LOCK
        .lock()
        .map_err(|e| format!("锁定系统提示词配置失败: {}", e))?;
    migrate_system_prompts_config(data_dir);
    let config = load_system_prompts_config_inner(jcli_system_prompt)?;
    Ok(f(&config))
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
/// 系统提示词配置文件的完整结构。
pub struct SystemPromptConfig {
    pub prompts: Vec<SystemPromptEntry>,
    pub default_prompt_id: String,
    pub append_date_time_and_user_name: bool,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
/// 单个系统提示词条目。
pub struct SystemPromptEntry {
    pub id: String,
    pub name: String,
    pub content: String,
    #[serde(rename = "isBuiltin")]
    pub builtin: bool,
    #[serde(default)]
    pub created_at: u64,
    #[serde(default)]
    pub updated_at: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
/// 创建系统提示词时的请求体。
pub struct CreateSystemPromptInput {
    pub name: String,
    pub content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
/// 更新系统提示词时的请求体。
pub struct UpdateSystemPromptInput {
    pub name: Option<String>,
    pub content: Option<String>,
}

/// 读取当前系统提示词列表。
pub fn get_system_prompts(
    state: tauri::State<'_, Arc<JcliAdapter>>,
) -> Result<Vec<SystemPromptEntry>, String> {
    let data_dir = state.config().data_dir();
    let jcli_prompt = state
        .config()
        .load_system_prompt()
        .map_err(|e| e.to_string())?;
    read_system_prompts_config(|c| c.prompts.clone(), &data_dir, jcli_prompt.as_deref())
}

/// 读取系统提示词配置与默认项。
pub fn get_system_prompt_config(
    state: tauri::State<'_, Arc<JcliAdapter>>,
) -> Result<SystemPromptConfig, String> {
    let data_dir = state.config().data_dir();
    let jcli_prompt = state
        .config()
        .load_system_prompt()
        .map_err(|e| e.to_string())?;
    read_system_prompts_config(|c| c.clone(), &data_dir, jcli_prompt.as_deref())
}

/// 创建一个新的自定义系统提示词。
pub fn create_system_prompt(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    input: CreateSystemPromptInput,
) -> Result<SystemPromptEntry, String> {
    let data_dir = state.config().data_dir();
    let jcli_prompt = state
        .config()
        .load_system_prompt()
        .map_err(|e| e.to_string())?;
    modify_system_prompts_config(
        |config| {
            let now = now_millis();
            let entry = SystemPromptEntry {
                id: uuid::Uuid::new_v4().to_string(),
                name: input.name.clone(),
                content: input.content.clone(),
                builtin: false,
                created_at: now,
                updated_at: now,
            };
            config.prompts.push(entry.clone());
            Ok(entry)
        },
        &data_dir,
        jcli_prompt.as_deref(),
    )
}

/// 更新指定的自定义系统提示词。
pub fn update_system_prompt(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    id: String,
    input: UpdateSystemPromptInput,
) -> Result<SystemPromptEntry, String> {
    let data_dir = state.config().data_dir();
    let jcli_prompt = state
        .config()
        .load_system_prompt()
        .map_err(|e| e.to_string())?;
    modify_system_prompts_config(
        |config| {
            let entry = config
                .prompts
                .iter_mut()
                .find(|p| p.id == id)
                .ok_or_else(|| format!("提示词 '{}' 未找到", id))?;
            if entry.builtin {
                return Err("内置提示词不可编辑".to_string());
            }
            if let Some(name) = &input.name {
                entry.name = name.clone();
            }
            if let Some(content) = &input.content {
                entry.content = content.clone();
            }
            entry.updated_at = now_millis();
            Ok(entry.clone())
        },
        &data_dir,
        jcli_prompt.as_deref(),
    )
}

/// 删除指定的自定义系统提示词。
pub fn delete_system_prompt(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    id: String,
) -> Result<(), String> {
    let data_dir = state.config().data_dir();
    let jcli_prompt = state
        .config()
        .load_system_prompt()
        .map_err(|e| e.to_string())?;
    modify_system_prompts_config(
        |config| {
            let idx = config
                .prompts
                .iter()
                .position(|p| p.id == id)
                .ok_or_else(|| format!("提示词 '{}' 未找到", id))?;
            if config.prompts[idx].builtin {
                return Err("内置提示词不可删除".to_string());
            }
            config.prompts.remove(idx);
            // 如果删除的是当前默认项，则回退到 jcli-default
            if config.default_prompt_id == id {
                config.default_prompt_id = JCLI_DEFAULT_ID.to_string();
            }
            Ok(())
        },
        &data_dir,
        jcli_prompt.as_deref(),
    )
}

/// 设置默认启用的系统提示词。
pub fn set_default_prompt(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    prompt_id: String,
) -> Result<(), String> {
    let data_dir = state.config().data_dir();
    let jcli_prompt = state
        .config()
        .load_system_prompt()
        .map_err(|e| e.to_string())?;
    modify_system_prompts_config(
        |config| {
            if !config.prompts.iter().any(|p| p.id == prompt_id) {
                return Err(format!("提示词 '{}' 未找到", prompt_id));
            }
            config.default_prompt_id = prompt_id;
            Ok(())
        },
        &data_dir,
        jcli_prompt.as_deref(),
    )
}

/// 更新是否自动追加时间与用户名设置。
pub fn update_append_setting(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    append_date_time_and_user_name: bool,
) -> Result<(), String> {
    let data_dir = state.config().data_dir();
    let jcli_prompt = state
        .config()
        .load_system_prompt()
        .map_err(|e| e.to_string())?;
    modify_system_prompts_config(
        |config| {
            config.append_date_time_and_user_name = append_date_time_and_user_name;
            Ok(())
        },
        &data_dir,
        jcli_prompt.as_deref(),
    )
}
