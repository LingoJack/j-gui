use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::kernel::types::KernelProvider;
use crate::kernel::{ConfigKernel, JcliAdapter};

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelInfo {
    pub id: usize,
    pub name: String,
    pub provider: String,
    pub api_base: String,
    pub models: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChannelInput {
    pub name: String,
    pub api_base: String,
    pub api_key: String,
    pub model: String,
    pub supports_vision: Option<bool>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateChannelInput {
    pub index: usize,
    pub name: String,
    pub api_base: String,
    pub api_key: String,
    pub model: String,
    pub supports_vision: Option<bool>,
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

#[allow(dead_code)]
fn mask_api_key(key: &str) -> String {
    let len = key.len();
    if len > 8 {
        format!("{}...{}", &key[..4], &key[len - 4..])
    } else if len > 2 {
        format!("{}...{}", &key[..2], &key[len - 2..])
    } else if !key.is_empty() {
        format!("...{}", key)
    } else {
        String::new()
    }
}

fn provider_to_channel_info(idx: usize, p: &KernelProvider) -> ChannelInfo {
    ChannelInfo {
        id: idx,
        name: p.name.clone(),
        provider: infer_provider(&p.api_base),
        api_base: p.api_base.clone(),
        models: vec![p.model.clone()],
    }
}

fn infer_provider(api_base: &str) -> String {
    let base = api_base.to_lowercase();
    if base.contains("deepseek") {
        return "deepseek".into();
    }
    if base.contains("openai") {
        return "openai".into();
    }
    if base.contains("anthropic") || base.contains("claude") {
        return "anthropic".into();
    }
    if base.contains("google") || base.contains("gemini") {
        return "google".into();
    }
    if base.contains("moonshot") || base.contains("kimi") {
        return "moonshot".into();
    }
    if base.contains("zhipu") || base.contains("chatglm") {
        return "zhipu".into();
    }
    if base.contains("minimax") {
        return "minimax".into();
    }
    if base.contains("doubao") || base.contains("volc") {
        return "doubao".into();
    }
    if base.contains("qwen") || base.contains("tongyi") {
        return "tongyi".into();
    }
    "custom".into()
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
    input: UpdateChannelInput,
) -> Result<ChannelInfo, String> {
    update_channel_impl(state.config(), input)
}

#[tauri::command]
pub fn delete_channel(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    index: usize,
) -> Result<(), String> {
    delete_channel_impl(state.config(), index)
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
    Ok(providers
        .iter()
        .enumerate()
        .map(|(i, p)| provider_to_channel_info(i, p))
        .collect())
}

fn create_channel_impl(
    config: &dyn ConfigKernel,
    input: CreateChannelInput,
) -> Result<ChannelInfo, String> {
    let mut providers = config.load_providers().map_err(|e| e.to_string())?;
    providers.push(KernelProvider {
        name: input.name,
        api_base: input.api_base,
        api_key: input.api_key,
        model: input.model,
        supports_vision: input.supports_vision.unwrap_or(false),
    });
    let idx = providers.len() - 1;
    config
        .save_providers(&providers)
        .map_err(|e| e.to_string())?;
    Ok(provider_to_channel_info(idx, &providers[idx]))
}

fn update_channel_impl(
    config: &dyn ConfigKernel,
    input: UpdateChannelInput,
) -> Result<ChannelInfo, String> {
    let mut providers = config.load_providers().map_err(|e| e.to_string())?;
    if input.index >= providers.len() {
        return Err(format!(
            "无效的 provider 索引: {}（共 {} 个提供方）",
            input.index,
            providers.len()
        ));
    }

    // If the incoming api_key is masked (contains "..."), preserve the old key
    let api_key = if input.api_key.contains("...") {
        providers[input.index].api_key.clone()
    } else {
        input.api_key.clone()
    };

    providers[input.index] = KernelProvider {
        name: input.name,
        api_base: input.api_base,
        api_key,
        model: input.model,
        supports_vision: input.supports_vision.unwrap_or(false),
    };

    config
        .save_providers(&providers)
        .map_err(|e| e.to_string())?;
    Ok(provider_to_channel_info(
        input.index,
        &providers[input.index],
    ))
}

fn delete_channel_impl(config: &dyn ConfigKernel, index: usize) -> Result<(), String> {
    let mut providers = config.load_providers().map_err(|e| e.to_string())?;
    if index >= providers.len() {
        return Err(format!(
            "无效的 provider 索引: {}（共 {} 个提供方）",
            index,
            providers.len()
        ));
    }
    providers.remove(index);
    config
        .save_providers(&providers)
        .map_err(|e| e.to_string())?;
    Ok(())
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
        "claude-3-5-sonnet-20241022"
    } else {
        "gpt-3.5-turbo"
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
    use crate::kernel::types::KernelProvider;

    // --- mask_api_key ---

    #[test]
    fn mask_long_key() {
        let masked = mask_api_key("sk-1234567890abcdef");
        assert_eq!(masked, "sk-1...cdef");
    }

    #[test]
    fn mask_short_key() {
        let masked = mask_api_key("ab");
        assert_eq!(masked, "...ab");
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
            name: "GPT-4o".into(),
            api_base: "https://api.openai.com/v1".into(),
            api_key: "sk-secret1234".into(),
            model: "gpt-4o".into(),
            supports_vision: true,
        };
        let info = provider_to_channel_info(2, &p);
        assert_eq!(info.id, 2);
        assert_eq!(info.name, "GPT-4o");
        assert_eq!(info.provider, "openai");
        // api_base is NOT masked
        assert_eq!(info.api_base, "https://api.openai.com/v1");
        assert_eq!(info.models, vec!["gpt-4o"]);
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
                name: "My Provider".into(),
                api_base: "https://api.deepseek.com".into(),
                api_key: "sk-secret".into(),
                model: "deepseek-chat".into(),
                supports_vision: false,
            }])
        });

        let result = list_channels_impl(&mock);
        assert!(result.is_ok());
        let channels = result.unwrap();
        assert_eq!(channels.len(), 1);
        assert_eq!(channels[0].name, "My Provider");
        assert_eq!(channels[0].provider, "deepseek");
        assert_eq!(channels[0].api_base, "https://api.deepseek.com");
        assert_eq!(channels[0].models, vec!["deepseek-chat"]);
    }

    // --- create_channel_impl ---

    #[test]
    fn create_channel_appends_provider() {
        let mut mock = MockConfigKernel::new();
        mock.expect_load_providers().returning(|| Ok(vec![]));
        mock.expect_save_providers()
            .withf(|p: &[KernelProvider]| p.len() == 1 && p[0].name == "New Channel")
            .returning(|_| Ok(()));

        let result = create_channel_impl(
            &mock,
            CreateChannelInput {
                name: "New Channel".into(),
                api_base: "https://api.openai.com".into(),
                api_key: "sk-key".into(),
                model: "gpt-4".into(),
                supports_vision: Some(true),
            },
        );
        assert!(result.is_ok());
        let info = result.unwrap();
        assert_eq!(info.name, "New Channel");
        assert_eq!(info.provider, "openai");
    }

    // --- update_channel_impl ---

    #[test]
    fn update_channel_modifies_provider() {
        let mut mock = MockConfigKernel::new();
        mock.expect_load_providers().returning(|| {
            Ok(vec![KernelProvider {
                name: "Old".into(),
                api_base: "https://old.com".into(),
                api_key: "sk-old-key".into(),
                model: "gpt-3.5".into(),
                supports_vision: false,
            }])
        });
        mock.expect_save_providers()
            .withf(|p: &[KernelProvider]| {
                p.len() == 1 && p[0].name == "Updated" && p[0].api_key == "sk-new-key"
            })
            .returning(|_| Ok(()));

        let result = update_channel_impl(
            &mock,
            UpdateChannelInput {
                index: 0,
                name: "Updated".into(),
                api_base: "https://new.com".into(),
                api_key: "sk-new-key".into(),
                model: "gpt-4".into(),
                supports_vision: Some(true),
            },
        );
        assert!(result.is_ok());
        let info = result.unwrap();
        assert_eq!(info.name, "Updated");
    }

    #[test]
    fn update_channel_preserves_masked_key() {
        let mut mock = MockConfigKernel::new();
        mock.expect_load_providers().returning(|| {
            Ok(vec![KernelProvider {
                name: "Old".into(),
                api_base: "https://old.com".into(),
                api_key: "sk-real-secret-key".into(),
                model: "gpt-3.5".into(),
                supports_vision: false,
            }])
        });
        mock.expect_save_providers()
            .withf(|p: &[KernelProvider]| {
                p.len() == 1 && p[0].api_key == "sk-real-secret-key" // preserved
            })
            .returning(|_| Ok(()));

        // frontend sends masked key
        let result = update_channel_impl(
            &mock,
            UpdateChannelInput {
                index: 0,
                name: "Updated".into(),
                api_base: "https://new.com".into(),
                api_key: "sk-r...key".into(), // masked
                model: "gpt-4".into(),
                supports_vision: None,
            },
        );
        assert!(result.is_ok());
    }

    #[test]
    fn update_channel_invalid_index_returns_error() {
        let mut mock = MockConfigKernel::new();
        mock.expect_load_providers().returning(|| Ok(vec![]));

        let result = update_channel_impl(
            &mock,
            UpdateChannelInput {
                index: 999,
                name: "test".into(),
                api_base: "https://example.com".into(),
                api_key: "sk-key".into(),
                model: "model-1".into(),
                supports_vision: None,
            },
        );
        assert!(result.is_err());
    }

    // --- delete_channel_impl ---

    #[test]
    fn delete_channel_removes_provider() {
        let mut mock = MockConfigKernel::new();
        mock.expect_load_providers().returning(|| {
            Ok(vec![
                KernelProvider {
                    name: "First".into(),
                    api_base: "https://a.com".into(),
                    api_key: "k1".into(),
                    model: "m1".into(),
                    supports_vision: false,
                },
                KernelProvider {
                    name: "Second".into(),
                    api_base: "https://b.com".into(),
                    api_key: "k2".into(),
                    model: "m2".into(),
                    supports_vision: false,
                },
            ])
        });
        mock.expect_save_providers()
            .withf(|p: &[KernelProvider]| p.len() == 1 && p[0].name == "Second")
            .returning(|_| Ok(()));

        let result = delete_channel_impl(&mock, 0);
        assert!(result.is_ok());
    }

    #[test]
    fn delete_channel_invalid_index_returns_error() {
        let mut mock = MockConfigKernel::new();
        mock.expect_load_providers().returning(|| Ok(vec![]));

        let result = delete_channel_impl(&mock, 999);
        assert!(result.is_err());
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
        assert_eq!(masked, "12...78");
    }

    #[test]
    fn mask_3_chars() {
        let masked = mask_api_key("abc");
        assert_eq!(masked, "ab...bc");
    }

    #[test]
    fn mask_1_char() {
        let masked = mask_api_key("x");
        assert_eq!(masked, "...x");
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
