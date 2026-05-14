use serde::Serialize;
use std::sync::Arc;

use crate::kernel::{ConfigKernel, JcliAdapter};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// 别名配置列表项。
pub struct AliasEntry {
    pub section: String,
    pub name: String,
    pub value: String,
}

#[tauri::command]
/// 列出全部别名配置。
pub fn list_aliases(state: tauri::State<'_, Arc<JcliAdapter>>) -> Result<Vec<AliasEntry>, String> {
    list_aliases_impl(state.config())
}

fn list_aliases_impl(config: &dyn ConfigKernel) -> Result<Vec<AliasEntry>, String> {
    let mut entries: Vec<AliasEntry> = config
        .list_aliases()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|e| AliasEntry {
            section: e.section,
            name: e.name,
            value: e.value,
        })
        .collect();
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

#[tauri::command]
/// 新增或更新一条别名配置。
pub fn set_alias(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    section: String,
    name: String,
    value: String,
) -> Result<(), String> {
    set_alias_impl(state.config(), &section, &name, &value)
}

fn set_alias_impl(
    config: &dyn ConfigKernel,
    section: &str,
    name: &str,
    value: &str,
) -> Result<(), String> {
    config
        .set_alias(section, name, value)
        .map_err(|e| e.to_string())
}

#[tauri::command]
/// 删除一条别名配置。
pub fn remove_alias(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    section: String,
    name: String,
) -> Result<(), String> {
    remove_alias_impl(state.config(), &section, &name)
}

fn remove_alias_impl(config: &dyn ConfigKernel, section: &str, name: &str) -> Result<(), String> {
    config
        .remove_alias(section, name)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::config::MockConfigKernel;
    use crate::kernel::types::KernelAliasEntry;

    #[test]
    fn list_aliases_empty() {
        let mut mock = MockConfigKernel::new();
        mock.expect_list_aliases().returning(|| Ok(vec![]));

        let result = list_aliases_impl(&mock);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 0);
    }

    #[test]
    fn list_aliases_sorts_by_name() {
        let mut mock = MockConfigKernel::new();
        mock.expect_list_aliases().returning(|| {
            Ok(vec![
                KernelAliasEntry {
                    section: "path".into(),
                    name: "z_alias".into(),
                    value: "/tmp/z".into(),
                },
                KernelAliasEntry {
                    section: "path".into(),
                    name: "a_alias".into(),
                    value: "/tmp/a".into(),
                },
            ])
        });

        let result = list_aliases_impl(&mock);
        assert!(result.is_ok());
        let entries = result.unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "a_alias");
        assert_eq!(entries[1].name, "z_alias");
    }

    #[test]
    fn list_aliases_kernel_error_propagates() {
        let mut mock = MockConfigKernel::new();
        mock.expect_list_aliases()
            .returning(|| Err(crate::kernel::KernelError::Config("db error".into())));

        let result = list_aliases_impl(&mock);
        assert!(result.is_err());
    }

    #[test]
    fn set_alias_delegates_to_kernel() {
        let mut mock = MockConfigKernel::new();
        mock.expect_set_alias()
            .with(
                mockall::predicate::eq("path"),
                mockall::predicate::eq("my_alias"),
                mockall::predicate::eq("my_value"),
            )
            .returning(|_, _, _| Ok(()));

        let result = set_alias_impl(&mock, "path", "my_alias", "my_value");
        assert!(result.is_ok());
    }

    #[test]
    fn set_alias_kernel_error_propagates() {
        let mut mock = MockConfigKernel::new();
        mock.expect_set_alias()
            .returning(|_, _, _| Err(crate::kernel::KernelError::Config("fail".into())));

        let result = set_alias_impl(&mock, "s", "n", "v");
        assert!(result.is_err());
    }

    #[test]
    fn remove_alias_delegates_to_kernel() {
        let mut mock = MockConfigKernel::new();
        mock.expect_remove_alias()
            .with(
                mockall::predicate::eq("path"),
                mockall::predicate::eq("my_alias"),
            )
            .returning(|_, _| Ok(()));

        let result = remove_alias_impl(&mock, "path", "my_alias");
        assert!(result.is_ok());
    }

    #[test]
    fn remove_alias_kernel_error_propagates() {
        let mut mock = MockConfigKernel::new();
        mock.expect_remove_alias()
            .returning(|_, _| Err(crate::kernel::KernelError::Config("fail".into())));

        let result = remove_alias_impl(&mock, "s", "n");
        assert!(result.is_err());
    }

    #[test]
    fn list_aliases_maps_kernel_entry_fields() {
        let mut mock = MockConfigKernel::new();
        mock.expect_list_aliases().returning(|| {
            Ok(vec![KernelAliasEntry {
                section: "script".into(),
                name: "hello".into(),
                value: "echo hi".into(),
            }])
        });

        let result = list_aliases_impl(&mock);
        assert!(result.is_ok());
        let entry = result.unwrap().into_iter().next().unwrap();
        assert_eq!(entry.section, "script");
        assert_eq!(entry.name, "hello");
        assert_eq!(entry.value, "echo hi");
    }
}
