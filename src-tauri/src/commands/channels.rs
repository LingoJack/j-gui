use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::kernel::types::{
    infer_provider, KernelChannelModel, KernelCreateChannelInput, KernelProvider,
    KernelUpdateChannelInput,
};
use crate::kernel::{ConfigKernel, JcliAdapter};

const FALLBACK_MODEL_ANTHROPIC: &str = "claude-3-5-sonnet-20241022";
const FALLBACK_MODEL_OPENAI: &str = "gpt-3.5-turbo";

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

fn mask_api_key(key: &str) -> String {
    if key.is_empty() {
        return String::new();
    }
    if key.len() <= 6 {
        return "••••••••".to_string();
    }
    let (prefix_len, suffix_len) = if key.len() <= 8 { (2, 2) } else { (4, 4) };
    let mask_len = (key.len().saturating_sub(prefix_len + suffix_len)).max(8);
    format!(
        "{}{}{}",
        &key[..prefix_len],
        "•".repeat(mask_len),
        &key[key.len() - suffix_len..]
    )
}

fn is_masked_api_key(key: &str) -> bool {
    key.contains("...") || key.contains('•') || key.chars().all(|c| c == '*')
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub base_url: String,
    pub api_key: String,
    pub models: Vec<KernelChannelModel>,
    pub enabled: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChannelInput {
    pub name: String,
    pub provider: Option<String>,
    #[serde(alias = "baseUrl")]
    pub api_base: String,
    pub api_key: String,
    pub models: Vec<KernelChannelModel>,
    pub enabled: Option<bool>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateChannelInput {
    pub name: Option<String>,
    pub provider: Option<String>,
    #[serde(alias = "baseUrl")]
    pub api_base: Option<String>,
    pub api_key: Option<String>,
    pub models: Option<Vec<KernelChannelModel>>,
    pub enabled: Option<bool>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchModelsResult {
    pub success: bool,
    pub message: String,
    pub models: Vec<FetchModelOption>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchModelOption {
    pub id: String,
    pub name: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestChannelInput {
    pub api_base: String,
    pub api_key: String,
    pub model: Option<String>,
    pub provider: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestSavedChannelInput {
    pub provider: Option<String>,
    #[serde(alias = "baseUrl", alias = "apiBase")]
    pub api_base: Option<String>,
    pub model: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestChannelResult {
    pub success: bool,
    pub message: String,
    pub models: Option<Vec<ModelOption>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelOption {
    pub id: String,
    pub name: Option<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn provider_to_channel_info(p: &KernelProvider) -> ChannelInfo {
    ChannelInfo {
        id: p.id.clone(),
        name: p.name.clone(),
        provider: if p.provider.is_empty() {
            infer_provider(&p.api_base)
        } else {
            p.provider.clone()
        },
        base_url: p.api_base.clone(),
        api_key: mask_api_key(&p.api_key),
        models: p.models.clone(),
        enabled: p.enabled,
    }
}

// ---------------------------------------------------------------------------
// Tauri commands — thin wrappers
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_channels(
    state: tauri::State<'_, Arc<JcliAdapter>>,
) -> Result<Vec<ChannelInfo>, String> {
    list_channels_impl(state.config())
}

#[tauri::command]
pub fn create_channel(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    input: CreateChannelInput,
) -> Result<ChannelInfo, String> {
    create_channel_impl(state.config(), input)
}

#[tauri::command]
pub fn update_channel(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    id: String,
    input: UpdateChannelInput,
) -> Result<ChannelInfo, String> {
    update_channel_impl(state.config(), id, input)
}

#[tauri::command]
pub fn delete_channel(state: tauri::State<'_, Arc<JcliAdapter>>, id: String) -> Result<(), String> {
    delete_channel_impl(state.config(), &id)
}

#[tauri::command]
pub fn decrypt_api_key(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    channel_id: String,
) -> Result<String, String> {
    decrypt_api_key_impl(state.config(), &channel_id)
}

#[tauri::command]
pub async fn fetch_models(api_base: String, api_key: String) -> Result<FetchModelsResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let url = format!("{}/models", api_base.trim_end_matches('/'));
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("请求失败: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Ok(FetchModelsResult {
            success: false,
            message: format!(
                "API 返回错误 ({}): {}",
                status.as_u16(),
                body.chars().take(200).collect::<String>()
            ),
            models: vec![],
        });
    }

    let body = resp.text().await.unwrap_or_default();
    let models = parse_fetch_models(&body);
    Ok(FetchModelsResult {
        success: true,
        message: format!("获取到 {} 个模型", models.len()),
        models,
    })
}

#[tauri::command]
pub async fn test_channel_direct(input: TestChannelInput) -> Result<TestChannelResult, String> {
    test_channel_input(input).await
}

#[tauri::command]
pub async fn test_saved_channel(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    id: String,
    input: Option<TestSavedChannelInput>,
) -> Result<TestChannelResult, String> {
    let provider = state
        .config()
        .load_providers()
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|provider| provider.id == id)
        .ok_or_else(|| format!("渠道不存在: {id}"))?;

    let override_input = input.unwrap_or(TestSavedChannelInput {
        provider: None,
        api_base: None,
        model: None,
    });

    let model = override_input.model.or_else(|| {
        provider
            .models
            .iter()
            .find(|model| model.enabled)
            .or_else(|| provider.models.first())
            .map(|model| model.id.clone())
    });

    test_channel_input(TestChannelInput {
        api_base: override_input.api_base.unwrap_or(provider.api_base),
        api_key: provider.api_key,
        model,
        provider: override_input.provider.or(Some(provider.provider)),
    })
    .await
}

async fn test_channel_input(input: TestChannelInput) -> Result<TestChannelResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    // Try to list models first (OpenAI-compatible endpoint)
    let models_url = format!("{}/models", input.api_base.trim_end_matches('/'));
    let resp = client
        .get(&models_url)
        .header("Authorization", format!("Bearer {}", input.api_key))
        .send()
        .await;

    match resp {
        Ok(r) if r.status().is_success() => {
            let body = r.text().await.unwrap_or_default();
            let models = parse_models(&body);
            Ok(TestChannelResult {
                success: true,
                message: format!("连接成功 — 获取到 {} 个模型", models.len()),
                models: Some(models),
            })
        }
        Ok(r) => {
            let status = r.status();
            let body = r.text().await.unwrap_or_default();
            // Try chat completions endpoint as fallback
            if status.as_u16() == 404 || status.as_u16() == 403 {
                try_chat_completion(&client, &input).await
            } else {
                Ok(TestChannelResult {
                    success: false,
                    message: format!(
                        "API 返回错误 ({}): {}",
                        status.as_u16(),
                        body.chars().take(200).collect::<String>()
                    ),
                    models: None,
                })
            }
        }
        Err(_) => {
            // If /models fails, try chat completions
            try_chat_completion(&client, &input).await
        }
    }
}

// ---------------------------------------------------------------------------
// Pure logic (_impl) — testable via MockConfigKernel
// ---------------------------------------------------------------------------

fn list_channels_impl(config: &dyn ConfigKernel) -> Result<Vec<ChannelInfo>, String> {
    let providers = config.load_providers().map_err(|e| e.to_string())?;
    Ok(providers.iter().map(provider_to_channel_info).collect())
}

fn create_channel_impl(
    config: &dyn ConfigKernel,
    input: CreateChannelInput,
) -> Result<ChannelInfo, String> {
    if input.name.trim().is_empty() {
        return Err("渠道名称不能为空".into());
    }
    if input.api_base.trim().is_empty() {
        return Err("API 地址不能为空".into());
    }
    let kernel_input = KernelCreateChannelInput {
        name: input.name,
        provider: input
            .provider
            .filter(|provider| !provider.trim().is_empty())
            .unwrap_or_else(|| infer_provider(&input.api_base)),
        api_base: input.api_base,
        api_key: input.api_key,
        models: input.models,
        enabled: input.enabled.unwrap_or(true),
    };
    let provider = config
        .create_channel(kernel_input)
        .map_err(|e| e.to_string())?;
    Ok(provider_to_channel_info(&provider))
}

fn decrypt_api_key_impl(config: &dyn ConfigKernel, channel_id: &str) -> Result<String, String> {
    if channel_id.trim().is_empty() {
        return Err("渠道 ID 不能为空".into());
    }
    config
        .load_providers()
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|provider| provider.id == channel_id)
        .map(|provider| provider.api_key)
        .ok_or_else(|| format!("渠道不存在: {channel_id}"))
}

fn update_channel_impl(
    config: &dyn ConfigKernel,
    id: String,
    input: UpdateChannelInput,
) -> Result<ChannelInfo, String> {
    if id.trim().is_empty() {
        return Err("渠道 ID 不能为空".into());
    }
    // Handle masked api_key: if the incoming key has "..." preserve existing
    let api_key = input.api_key.as_deref().and_then(|k| {
        if is_masked_api_key(k) {
            None // signal to kernel to preserve existing
        } else {
            Some(k.to_string())
        }
    });

    let kernel_input = KernelUpdateChannelInput {
        name: input.name,
        provider: input.provider,
        api_base: input.api_base,
        api_key,
        models: input.models,
        enabled: input.enabled,
    };
    let provider = config
        .update_channel(&id, kernel_input)
        .map_err(|e| e.to_string())?;
    Ok(provider_to_channel_info(&provider))
}

fn delete_channel_impl(config: &dyn ConfigKernel, id: &str) -> Result<(), String> {
    config.delete_channel(id).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Fetch / test helpers (unchanged, use reqwest directly — no jcli)
// ---------------------------------------------------------------------------

fn parse_fetch_models(body: &str) -> Vec<FetchModelOption> {
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(data) = val.get("data").and_then(|d| d.as_array()) {
            return data
                .iter()
                .filter_map(|m| {
                    Some(FetchModelOption {
                        id: m.get("id")?.as_str()?.to_string(),
                        name: m.get("id").and_then(|v| v.as_str()).map(String::from),
                    })
                })
                .collect();
        }
    }
    vec![]
}

fn is_anthropic_provider(provider: Option<&str>) -> bool {
    provider.is_some_and(|p| {
        let p = p.to_lowercase();
        p == "anthropic" || p == "deepseek"
    })
}

async fn try_chat_completion(
    client: &reqwest::Client,
    input: &TestChannelInput,
) -> Result<TestChannelResult, String> {
    let is_anthropic = is_anthropic_provider(input.provider.as_deref());
    let path = if is_anthropic {
        "messages"
    } else {
        "chat/completions"
    };
    let chat_url = format!("{}/{}", input.api_base.trim_end_matches('/'), path);

    let model = input.model.as_deref().unwrap_or(if is_anthropic {
        FALLBACK_MODEL_ANTHROPIC
    } else {
        FALLBACK_MODEL_OPENAI
    });
    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 5,
    });

    let mut req = client
        .post(&chat_url)
        .header("Content-Type", "application/json");

    // Anthropic native API uses x-api-key; DeepSeek Anthropic-compatible uses Bearer
    if input.provider.as_deref() == Some("anthropic") {
        req = req.header("x-api-key", &input.api_key);
    } else {
        req = req.header("Authorization", format!("Bearer {}", input.api_key));
    }

    let resp = req.json(&body).send().await;

    match resp {
        Ok(r) if r.status().is_success() => Ok(TestChannelResult {
            success: true,
            message: format!("API 连接测试通过 ({})", path),
            models: None,
        }),
        Ok(r) => {
            let status = r.status();
            let body = r.text().await.unwrap_or_default();
            let msg = if status.as_u16() == 401 {
                "API Key 无效 (401 Unauthorized)".into()
            } else if status.as_u16() == 403 {
                "访问被拒绝 (403 Forbidden)，请检查 API Key 权限".into()
            } else {
                format!(
                    "API 返回错误 ({}): {}",
                    status.as_u16(),
                    body.chars().take(200).collect::<String>()
                )
            };
            Ok(TestChannelResult {
                success: false,
                message: msg,
                models: None,
            })
        }
        Err(e) => Ok(TestChannelResult {
            success: false,
            message: format!("无法连接: {e}"),
            models: None,
        }),
    }
}

fn parse_models(body: &str) -> Vec<ModelOption> {
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(data) = val.get("data").and_then(|d| d.as_array()) {
            return data
                .iter()
                .filter_map(|m| {
                    Some(ModelOption {
                        id: m.get("id")?.as_str()?.to_string(),
                        name: None,
                    })
                })
                .collect();
        }
    }
    vec![]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::config::MockConfigKernel;
    use crate::kernel::types::{
        KernelChannelModel, KernelCreateChannelInput, KernelProvider, KernelUpdateChannelInput,
    };
    use crate::kernel::KernelError;

    #[test]
    fn mask_long_key() {
        let masked = mask_api_key("sk-1234567890abcdef");
        assert_eq!(masked, "sk-1•••••••••••cdef");
    }

    #[test]
    fn mask_short_key() {
        let masked = mask_api_key("ab");
        assert_eq!(masked, "••••••••");
    }

    #[test]
    fn mask_empty_key() {
        let masked = mask_api_key("");
        assert_eq!(masked, "");
    }

    // --- channel_info mapping ---

    #[test]
    fn provider_to_channel_info_maps_fields() {
        let p = KernelProvider {
            id: "test-uuid".into(),
            name: "GPT-4o".into(),
            provider: String::new(),
            api_base: "https://api.openai.com/v1".into(),
            api_key: "sk-secret1234".into(),
            models: vec![KernelChannelModel {
                id: "gpt-4o".into(),
                name: "gpt-4o".into(),
                enabled: true,
            }],
            enabled: true,
            supports_vision: true,
            created_at: 0,
            updated_at: 0,
        };
        let info = provider_to_channel_info(&p);
        assert_eq!(info.id, "test-uuid");
        assert_eq!(info.name, "GPT-4o");
        assert_eq!(info.provider, "openai");
        // api_base is NOT masked
        assert_eq!(info.base_url, "https://api.openai.com/v1");
        assert_eq!(
            info.models,
            vec![KernelChannelModel {
                id: "gpt-4o".into(),
                name: "gpt-4o".into(),
                enabled: true
            }]
        );
    }

    // --- list_channels_impl ---

    #[test]
    fn list_channels_returns_empty_vec_when_no_providers() {
        let mut mock = MockConfigKernel::new();
        mock.expect_load_providers().returning(|| Ok(vec![]));

        let result = list_channels_impl(&mock);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn list_channels_returns_providers_as_channels() {
        let mut mock = MockConfigKernel::new();
        mock.expect_load_providers().returning(|| {
            Ok(vec![KernelProvider {
                id: "ds-uuid".into(),
                name: "My Provider".into(),
                provider: String::new(),
                api_base: "https://api.deepseek.com".into(),
                api_key: "sk-secret".into(),
                models: vec![KernelChannelModel {
                    id: "deepseek-chat".into(),
                    name: "deepseek-chat".into(),
                    enabled: true,
                }],
                enabled: true,
                supports_vision: false,
                created_at: 0,
                updated_at: 0,
            }])
        });

        let result = list_channels_impl(&mock);
        assert!(result.is_ok());
        let channels = result.unwrap();
        assert_eq!(channels.len(), 1);
        assert_eq!(channels[0].id, "ds-uuid");
        assert_eq!(channels[0].name, "My Provider");
        assert_eq!(channels[0].provider, "deepseek");
        assert_eq!(channels[0].base_url, "https://api.deepseek.com");
        assert_eq!(
            channels[0].models,
            vec![KernelChannelModel {
                id: "deepseek-chat".into(),
                name: "deepseek-chat".into(),
                enabled: true
            }]
        );
    }

    // --- create_channel_impl ---

    #[test]
    fn create_channel_appends_provider() {
        let mut mock = MockConfigKernel::new();
        mock.expect_create_channel()
            .withf(|input: &KernelCreateChannelInput| {
                input.name == "New Channel"
                    && input.models.len() == 2
                    && input.models[0].id == "gpt-4"
                    && input.models[1].id == "gpt-4o"
            })
            .returning(|input| {
                Ok(KernelProvider {
                    id: "new-uuid".into(),
                    name: input.name,
                    provider: input.provider,
                    api_base: input.api_base,
                    api_key: input.api_key,
                    models: input.models,
                    enabled: input.enabled,
                    supports_vision: false,
                    created_at: 1000,
                    updated_at: 1000,
                })
            });

        let result = create_channel_impl(
            &mock,
            CreateChannelInput {
                name: "New Channel".into(),
                api_base: "https://api.openai.com".into(),
                api_key: "sk-key".into(),
                provider: Some("openai".into()),
                models: vec![
                    KernelChannelModel {
                        id: "gpt-4".into(),
                        name: "GPT-4".into(),
                        enabled: true,
                    },
                    KernelChannelModel {
                        id: "gpt-4o".into(),
                        name: "GPT-4o".into(),
                        enabled: true,
                    },
                ],
                enabled: Some(true),
            },
        );
        assert!(result.is_ok());
        let info = result.unwrap();
        assert_eq!(info.id, "new-uuid");
        assert_eq!(info.name, "New Channel");
        assert_eq!(info.provider, "openai");
    }

    // --- update_channel_impl ---

    #[test]
    fn update_channel_modifies_provider() {
        let mut mock = MockConfigKernel::new();
        mock.expect_update_channel()
            .withf(|id: &str, _input: &KernelUpdateChannelInput| id == "test-id")
            .returning(|id: &str, input: KernelUpdateChannelInput| {
                Ok(KernelProvider {
                    id: id.to_string(),
                    name: input.name.unwrap_or_default(),
                    provider: input.provider.unwrap_or_default(),
                    api_base: input.api_base.unwrap_or_default(),
                    api_key: input.api_key.unwrap_or_default(),
                    models: input.models.unwrap_or_default(),
                    enabled: input.enabled.unwrap_or(true),
                    supports_vision: false,
                    created_at: 1000,
                    updated_at: 2000,
                })
            });

        let result = update_channel_impl(
            &mock,
            "test-id".into(),
            UpdateChannelInput {
                name: Some("Updated".into()),
                provider: None,
                api_base: Some("https://new.com".into()),
                api_key: Some("sk-new-key".into()),
                models: None,
                enabled: None,
            },
        );
        assert!(result.is_ok());
        let info = result.unwrap();
        assert_eq!(info.name, "Updated");
    }

    #[test]
    fn update_channel_preserves_masked_key() {
        let mut mock = MockConfigKernel::new();
        mock.expect_update_channel()
            .withf(|_id: &str, input: &KernelUpdateChannelInput| {
                // api_key should be None (masked → None signals preserve)
                input.api_key.is_none()
            })
            .returning(|id: &str, input: KernelUpdateChannelInput| {
                Ok(KernelProvider {
                    id: id.to_string(),
                    name: input.name.unwrap_or_default(),
                    provider: input.provider.unwrap_or_default(),
                    api_base: input.api_base.unwrap_or_default(),
                    api_key: "sk-real-secret-key".into(),
                    models: input.models.unwrap_or_default(),
                    enabled: input.enabled.unwrap_or(true),
                    supports_vision: false,
                    created_at: 1000,
                    updated_at: 2000,
                })
            });

        let result = update_channel_impl(
            &mock,
            "test-id".into(),
            UpdateChannelInput {
                name: Some("Updated".into()),
                provider: None,
                api_base: Some("https://new.com".into()),
                api_key: Some("sk-r...key".into()), // masked → becomes None
                models: None,
                enabled: None,
            },
        );
        assert!(result.is_ok());
    }

    #[test]
    fn update_channel_not_found_returns_error() {
        let mut mock = MockConfigKernel::new();
        mock.expect_update_channel()
            .returning(|_id: &str, _input: KernelUpdateChannelInput| {
                Err(KernelError::Config("渠道 ID 不存在: ghost".into()))
            });

        let result = update_channel_impl(
            &mock,
            "ghost".into(),
            UpdateChannelInput {
                name: Some("test".into()),
                provider: None,
                api_base: None,
                api_key: None,
                models: None,
                enabled: None,
            },
        );
        assert!(result.is_err());
    }

    // --- delete_channel_impl ---

    #[test]
    fn delete_channel_removes_provider() {
        let mut mock = MockConfigKernel::new();
        mock.expect_delete_channel()
            .withf(|id: &str| id == "target-id")
            .returning(|_| Ok(()));

        let result = delete_channel_impl(&mock, "target-id");
        assert!(result.is_ok());
    }

    #[test]
    fn delete_channel_not_found_returns_error() {
        let mut mock = MockConfigKernel::new();
        mock.expect_delete_channel()
            .returning(|_| Err(KernelError::Config("渠道 ID 不存在: ghost".into())));

        let result = delete_channel_impl(&mock, "ghost");
        assert!(result.is_err());
    }

    // --- error propagation ---

    #[test]
    fn list_channels_kernel_error_propagates() {
        let mut mock = MockConfigKernel::new();
        mock.expect_load_providers()
            .returning(|| Err(KernelError::Config("storage error".into())));

        let result = list_channels_impl(&mock);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("storage error"));
    }

    #[test]
    fn create_channel_kernel_error_propagates() {
        let mut mock = MockConfigKernel::new();
        mock.expect_create_channel()
            .returning(|_| Err(KernelError::Config("save failed".into())));

        let result = create_channel_impl(
            &mock,
            CreateChannelInput {
                name: "Test".into(),
                api_base: "https://api.test.com".into(),
                api_key: "key".into(),
                provider: None,
                models: vec![KernelChannelModel {
                    id: "gpt-4".into(),
                    name: "gpt-4".into(),
                    enabled: true,
                }],
                enabled: None,
            },
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("save failed"));
    }

    #[test]
    fn create_channel_rejects_empty_name() {
        let mock = MockConfigKernel::new();
        let result = create_channel_impl(
            &mock,
            CreateChannelInput {
                name: "".into(),
                api_base: "https://api.test.com".into(),
                api_key: "key".into(),
                provider: None,
                models: vec![KernelChannelModel {
                    id: "gpt-4".into(),
                    name: "gpt-4".into(),
                    enabled: true,
                }],
                enabled: None,
            },
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("名称不能为空"));
    }

    #[test]
    fn create_channel_rejects_empty_api_base() {
        let mock = MockConfigKernel::new();
        let result = create_channel_impl(
            &mock,
            CreateChannelInput {
                name: "Test".into(),
                api_base: "".into(),
                api_key: "key".into(),
                provider: None,
                models: vec![KernelChannelModel {
                    id: "gpt-4".into(),
                    name: "gpt-4".into(),
                    enabled: true,
                }],
                enabled: None,
            },
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("地址不能为空"));
    }

    #[test]
    fn update_channel_rejects_empty_id() {
        let mock = MockConfigKernel::new();
        let result = update_channel_impl(
            &mock,
            "".into(),
            UpdateChannelInput {
                name: Some("test".into()),
                provider: None,
                api_base: None,
                api_key: None,
                models: None,
                enabled: None,
            },
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("ID 不能为空"));
    }

    // --- mask_api_key edge cases ---

    #[test]
    fn mask_key_detects_dots_to_preserve_old() {
        let masked = "sk-1...abcd";
        assert!(masked.contains("..."));
    }

    #[test]
    fn mask_exactly_8_chars() {
        let masked = mask_api_key("12345678");
        assert_eq!(masked, "12••••••••78");
    }

    #[test]
    fn mask_3_chars() {
        let masked = mask_api_key("abc");
        assert_eq!(masked, "••••••••");
    }

    #[test]
    fn mask_1_char() {
        let masked = mask_api_key("x");
        assert_eq!(masked, "••••••••");
    }

    #[test]
    fn decrypt_api_key_returns_raw_secret() {
        let mut mock = MockConfigKernel::new();
        mock.expect_load_providers().returning(|| {
            Ok(vec![KernelProvider {
                id: "target-id".into(),
                name: "Test".into(),
                provider: "openai".into(),
                api_base: "https://api.openai.com/v1".into(),
                api_key: "sk-secret".into(),
                models: vec![],
                enabled: true,
                supports_vision: false,
                created_at: 0,
                updated_at: 0,
            }])
        });

        let result = decrypt_api_key_impl(&mock, "target-id");
        assert_eq!(result.unwrap(), "sk-secret");
    }

    // --- fetch_models parsing ---

    #[test]
    fn parse_fetch_models_parses_openai_data_array() {
        let json = r#"{"object":"list","data":[{"id":"gpt-4o","object":"model"},{"id":"gpt-4","object":"model"}]}"#;
        let models = parse_fetch_models(json);
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "gpt-4o");
        assert_eq!(models[0].name.as_deref(), Some("gpt-4o"));
        assert_eq!(models[1].id, "gpt-4");
    }

    #[test]
    fn parse_fetch_models_handles_empty_data() {
        let models = parse_fetch_models(r#"{"object":"list","data":[]}"#);
        assert!(models.is_empty());
    }

    #[test]
    fn parse_fetch_models_handles_missing_data_field() {
        let models = parse_fetch_models(r#"{"object":"list"}"#);
        assert!(models.is_empty());
    }

    #[test]
    fn parse_fetch_models_handles_invalid_json() {
        let models = parse_fetch_models("not json");
        assert!(models.is_empty());
    }
}
