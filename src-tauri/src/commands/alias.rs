use j_cli::config::YamlConfig;
use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AliasEntry {
    pub section: String,
    pub name: String,
    pub value: String,
}

#[tauri::command]
pub fn list_aliases() -> Result<Vec<AliasEntry>, String> {
    let config = YamlConfig::load();
    let alias_sections = &["path", "inner_url", "outer_url", "script"];
    let mut entries = Vec::new();
    for &s in alias_sections {
        if let Some(map) = config.get_section(s) {
            for (name, value) in map {
                entries.push(AliasEntry {
                    section: s.to_string(),
                    name: name.clone(),
                    value: value.clone(),
                });
            }
        }
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

#[tauri::command]
pub fn set_alias(section: String, name: String, value: String) -> Result<(), String> {
    let mut config = YamlConfig::load();
    config.set_property(&section, &name, &value)
}

#[tauri::command]
pub fn remove_alias(section: String, name: String) -> Result<(), String> {
    let mut config = YamlConfig::load();
    config.remove_property(&section, &name)
}
