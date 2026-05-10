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
    /// Load all configured LLM provider/channel entries.
    fn load_providers(&self) -> Result<Vec<KernelProvider>, KernelError>;
    /// Persist all LLM provider/channel entries.
    fn save_providers(&self, providers: &[KernelProvider]) -> Result<(), KernelError>;

    /// Create a new channel and return the persisted provider.
    fn create_channel(
        &self,
        input: KernelCreateChannelInput,
    ) -> Result<KernelProvider, KernelError>;
    /// Partially update an existing channel by ID.
    fn update_channel(
        &self,
        id: &str,
        input: KernelUpdateChannelInput,
    ) -> Result<KernelProvider, KernelError>;
    /// Remove a channel by ID.
    fn delete_channel(&self, id: &str) -> Result<(), KernelError>;

    // -- Alias --

    /// List all configured aliases across all sections.
    fn list_aliases(&self) -> Result<Vec<KernelAliasEntry>, KernelError>;
    /// Set a named alias within a section.
    fn set_alias(&self, section: &str, name: &str, value: &str) -> Result<(), KernelError>;
    /// Remove a named alias from a section.
    fn remove_alias(&self, section: &str, name: &str) -> Result<(), KernelError>;

    // -- System Prompt --

    /// Load the system prompt, if one is set.
    fn load_system_prompt(&self) -> Result<Option<String>, KernelError>;
    /// Persist the system prompt.
    fn save_system_prompt(&self, prompt: &str) -> Result<(), KernelError>;

    // -- YamlConfig --

    /// Get all yaml config sections as key-value maps.
    fn get_yaml_sections(&self) -> Result<HashMap<String, HashMap<String, String>>, KernelError>;
    /// Set or remove a single yaml config property.
    fn set_yaml_property(&self, section: &str, key: &str, value: &str) -> Result<(), KernelError>;

    // -- Active index / theme --

    /// Load the active provider index.
    fn load_active_index(&self) -> Result<usize, KernelError>;
    /// Persist the active provider index.
    fn set_active_index(&self, index: usize) -> Result<(), KernelError>;
    /// Load the theme name.
    fn load_theme_name(&self) -> Result<String, KernelError>;

    // -- System --

    /// Return the application version string.
    fn version(&self) -> String;
    /// Return the application data directory path.
    fn data_dir(&self) -> PathBuf;
    /// Persist the theme by name.
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
