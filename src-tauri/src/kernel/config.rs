#![allow(dead_code)]

use std::collections::HashMap;
use std::path::PathBuf;

use super::error::KernelError;
use super::types::{
    KernelAliasEntry, KernelCreateChannelInput, KernelProvider, KernelUpdateChannelInput,
};

/// 配置、别名、系统提示词、Yaml 配置与系统信息共用的 kernel trait。
#[cfg_attr(test, mockall::automock)]
pub trait ConfigKernel: Send + Sync {
    /// 读取全部已配置的 LLM 渠道条目。
    fn load_providers(&self) -> Result<Vec<KernelProvider>, KernelError>;
    /// 持久化保存全部 LLM 渠道条目。
    fn save_providers(&self, providers: &[KernelProvider]) -> Result<(), KernelError>;

    /// 创建新渠道并返回保存后的提供方配置。
    fn create_channel(
        &self,
        input: KernelCreateChannelInput,
    ) -> Result<KernelProvider, KernelError>;
    /// 按 ID 局部更新已有渠道。
    fn update_channel(
        &self,
        id: &str,
        input: KernelUpdateChannelInput,
    ) -> Result<KernelProvider, KernelError>;
    /// 按 ID 删除渠道。
    fn delete_channel(&self, id: &str) -> Result<(), KernelError>;

    // -- 别名 --

    /// 列出所有配置段中的别名。
    fn list_aliases(&self) -> Result<Vec<KernelAliasEntry>, KernelError>;
    /// 在指定配置段中设置具名别名。
    fn set_alias(&self, section: &str, name: &str, value: &str) -> Result<(), KernelError>;
    /// 从指定配置段中移除具名别名。
    fn remove_alias(&self, section: &str, name: &str) -> Result<(), KernelError>;

    // -- 系统提示词 --

    /// 读取系统提示词；如果未设置则返回空。
    fn load_system_prompt(&self) -> Result<Option<String>, KernelError>;
    /// 持久化保存系统提示词。
    fn save_system_prompt(&self, prompt: &str) -> Result<(), KernelError>;

    // -- Yaml 配置 --

    /// 以键值映射形式获取全部 yaml 配置段。
    fn get_yaml_sections(&self) -> Result<HashMap<String, HashMap<String, String>>, KernelError>;
    /// 设置或删除单个 yaml 配置项。
    fn set_yaml_property(&self, section: &str, key: &str, value: &str) -> Result<(), KernelError>;

    // -- 激活索引 / 主题 --

    /// 读取当前激活的提供方索引。
    fn load_active_index(&self) -> Result<usize, KernelError>;
    /// 持久化保存当前激活的提供方索引。
    fn set_active_index(&self, index: usize) -> Result<(), KernelError>;
    /// 读取主题名。
    fn load_theme_name(&self) -> Result<String, KernelError>;

    // -- 系统信息 --

    /// 返回应用版本字符串。
    fn version(&self) -> String;
    /// 返回应用数据目录路径。
    fn data_dir(&self) -> PathBuf;
    /// 按名称持久化保存主题。
    fn set_theme(&self, theme: &str) -> Result<(), KernelError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trait_is_object_safe() {
        // 编译期检查：trait 能作为 `&dyn ConfigKernel` 使用
        fn _accept(k: &dyn ConfigKernel) {
            let _ = k.version();
        }
    }
}
