use std::sync::Arc;
use tauri::Emitter;

use crate::kernel::{ConfigKernel, JcliAdapter};

#[tauri::command]
pub fn get_version(state: tauri::State<'_, Arc<JcliAdapter>>) -> Result<String, String> {
    Ok(get_version_impl(state.config()))
}

fn get_version_impl(config: &dyn ConfigKernel) -> String {
    config.version()
}

#[tauri::command]
pub fn set_theme(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    app: tauri::AppHandle,
    theme: String,
) -> Result<(), String> {
    set_theme_impl(state.config(), &theme)?;
    app.emit("theme-changed", &theme).map_err(|e| e.to_string())
}

fn set_theme_impl(config: &dyn ConfigKernel, theme: &str) -> Result<(), String> {
    config.set_theme(theme).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::config::MockConfigKernel;

    #[test]
    fn get_version_calls_kernel_version() {
        let mut mock = MockConfigKernel::new();
        mock.expect_version().returning(|| "2.0.0".to_string());

        let result = get_version_impl(&mock);
        assert_eq!(result, "2.0.0");
    }

    #[test]
    fn set_theme_delegates_to_kernel() {
        let mut mock = MockConfigKernel::new();
        mock.expect_set_theme()
            .with(mockall::predicate::eq("dark"))
            .returning(|_| Ok(()));

        let result = set_theme_impl(&mock, "dark");
        assert!(result.is_ok());
    }

    #[test]
    fn set_theme_kernel_error_propagates() {
        let mut mock = MockConfigKernel::new();
        mock.expect_set_theme()
            .returning(|_| Err(crate::kernel::KernelError::Config("theme error".into())));

        let result = set_theme_impl(&mock, "invalid");
        assert!(result.is_err());
    }
}
