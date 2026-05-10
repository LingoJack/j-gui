#![allow(dead_code)]

use std::collections::HashMap;
use std::path::PathBuf;

use super::error::KernelError;
use super::types::{
    KernelAliasEntry, KernelCreateChannelInput, KernelProvider, KernelUpdateChannelInput,
};

/// Config + Alias + System Prompt + YamlConfig + System kernel trait.
#[cfg_attr(test, mockall::automock)]
pub trait ConfigKernel: Send + Sync {
    // -- Provider/Channel --

    fn load_providers(&self) -> Result<Vec<KernelProvider>, KernelError>;
    fn save_providers(&self, providers: &[KernelProvider]) -> Result<(), KernelError>;

    fn create_channel(
        &self,
        input: KernelCreateChannelInput,
    ) -> Result<KernelProvider, KernelError>;
    fn update_channel(
        &self,
        id: &str,
        input: KernelUpdateChannelInput,
    ) -> Result<KernelProvider, KernelError>;
    fn delete_channel(&self, id: &str) -> Result<(), KernelError>;

    // -- Alias --

    fn list_aliases(&self) -> Result<Vec<KernelAliasEntry>, KernelError>;
    fn set_alias(&self, section: &str, name: &str, value: &str) -> Result<(), KernelError>;
    fn remove_alias(&self, section: &str, name: &str) -> Result<(), KernelError>;

    // -- System Prompt --

    fn load_system_prompt(&self) -> Result<Option<String>, KernelError>;
    fn save_system_prompt(&self, prompt: &str) -> Result<(), KernelError>;

    // -- YamlConfig --

    fn get_yaml_sections(&self) -> Result<HashMap<String, HashMap<String, String>>, KernelError>;
    fn set_yaml_property(&self, section: &str, key: &str, value: &str) -> Result<(), KernelError>;

    // -- Active index / theme --

    fn load_active_index(&self) -> Result<usize, KernelError>;
    fn set_active_index(&self, index: usize) -> Result<(), KernelError>;
    fn load_theme_name(&self) -> Result<String, KernelError>;

    // -- System --

    fn version(&self) -> String;
    fn data_dir(&self) -> PathBuf;
    fn set_theme(&self, theme: &str) -> Result<(), KernelError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trait_is_object_safe() {
        // Compile-time check: trait can be used as &dyn ConfigKernel
        fn _accept(k: &dyn ConfigKernel) {
            let _ = k.version();
        }
    }
}
