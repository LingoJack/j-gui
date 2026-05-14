use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::kernel::types::{
    canonical_provider_key, infer_provider, KernelChannelModel, KernelCreateChannelInput,
    KernelProvider, KernelUpdateChannelInput,
};
use crate::kernel::{protocol::resolve_chat_transport_route, ConfigKernel, JcliAdapter};

const FALLBACK_MODEL_ANTHROPIC: &str = "claude-3-5-sonnet-20241022";
const FALLBACK_MODEL_OPENAI: &str = "gpt-3.5-turbo";

struct ProbeRequest {
    route: crate::kernel::types::ChatTransportRoute,
    path: &'static str,
    body: serde_json::Value,
}

// ---------------------------------------------------------------------------
// 请求与响应类型
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
/// 渠道列表项。
pub struct ChannelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub protocol_hint: Option<String>,
    pub base_url: String,
    pub api_key: String,
    pub models: Vec<KernelChannelModel>,
    pub enabled: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// 创建渠道时的请求体。
pub struct CreateChannelInput {
    pub name: String,
    pub provider: Option<String>,
    pub protocol_hint: Option<String>,
    #[serde(alias = "baseUrl")]
    pub api_base: String,
    pub api_key: String,
    pub models: Vec<KernelChannelModel>,
    pub enabled: Option<bool>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// 更新渠道时的请求体。
pub struct UpdateChannelInput {
    pub name: Option<String>,
    pub provider: Option<String>,
    pub protocol_hint: Option<String>,
    #[serde(alias = "baseUrl")]
    pub api_base: Option<String>,
    pub api_key: Option<String>,
    pub models: Option<Vec<KernelChannelModel>>,
    pub enabled: Option<bool>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// 拉取模型列表时的统一返回结构。
pub struct FetchModelsResult {
    pub success: bool,
    pub message: String,
    pub models: Vec<FetchModelOption>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// 模型列表中的单个选项。
pub struct FetchModelOption {
    pub id: String,
    pub name: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// 直接测试未保存渠道时的请求体。
pub struct TestChannelInput {
    pub api_base: String,
    pub api_key: String,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub protocol_hint: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
/// 测试已保存渠道时允许覆盖的输入项。
pub struct TestSavedChannelInput {
    pub provider: Option<String>,
    #[serde(alias = "baseUrl", alias = "apiBase")]
    pub api_base: Option<String>,
    pub model: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// 渠道连通性测试结果。
pub struct TestChannelResult {
    pub success: bool,
    pub message: String,
    pub models: Option<Vec<ModelOption>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// 供测试结果返回的模型选项。
pub struct ModelOption {
    pub id: String,
    pub name: Option<String>,
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

fn provider_to_channel_info(p: &KernelProvider) -> ChannelInfo {
    ChannelInfo {
        id: p.id.clone(),
        name: p.name.clone(),
        provider: if p.provider.is_empty() {
            infer_provider(&p.api_base)
        } else {
            canonical_provider_key(&p.provider)
        },
        protocol_hint: p.protocol_hint.clone(),
        base_url: p.api_base.clone(),
        api_key: mask_api_key(&p.api_key),
        models: p.models.clone(),
        enabled: p.enabled,
    }
}

// ---------------------------------------------------------------------------
// Tauri 命令层薄封装
// ---------------------------------------------------------------------------

#[tauri::command]
/// 列出全部渠道配置。
pub fn list_channels(
    state: tauri::State<'_, Arc<JcliAdapter>>,
) -> Result<Vec<ChannelInfo>, String> {
    list_channels_impl(state.config())
}

#[tauri::command]
/// 创建一条新的渠道配置。
pub fn create_channel(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    input: CreateChannelInput,
) -> Result<ChannelInfo, String> {
    create_channel_impl(state.config(), input)
}

#[tauri::command]
/// 更新指定渠道配置。
pub fn update_channel(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    id: String,
    input: UpdateChannelInput,
) -> Result<ChannelInfo, String> {
    update_channel_impl(state.config(), id, input)
}

#[tauri::command]
/// 删除指定渠道配置。
pub fn delete_channel(state: tauri::State<'_, Arc<JcliAdapter>>, id: String) -> Result<(), String> {
    delete_channel_impl(state.config(), &id)
}

#[tauri::command]
/// 解密并返回指定渠道的原始 API Key。
pub fn decrypt_api_key(
    state: tauri::State<'_, Arc<JcliAdapter>>,
    channel_id: String,
) -> Result<String, String> {
    decrypt_api_key_impl(state.config(), &channel_id)
}

#[tauri::command]
/// 直接请求远端 `/models` 接口以拉取模型列表。
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
/// 直接测试一条临时渠道配置是否可用。
pub async fn test_channel_direct(input: TestChannelInput) -> Result<TestChannelResult, String> {
    test_channel_input(input).await
}

#[tauri::command]
/// 测试一条已保存渠道配置是否可用。
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
        protocol_hint: None,
    })
    .await
}

async fn test_channel_input(input: TestChannelInput) -> Result<TestChannelResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let probe_result = try_chat_completion(&client, &input).await?;
    if !probe_result.success {
        return Ok(probe_result);
    }

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
                message: format!("连接成功 — 协议探测通过，获取到 {} 个模型", models.len()),
                models: Some(models),
            })
        }
        _ => Ok(probe_result),
    }
}

// ---------------------------------------------------------------------------
// 纯逻辑（_impl）—— 可通过 MockConfigKernel 做测试
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
            .map(|provider| canonical_provider_key(&provider))
            .unwrap_or_else(|| infer_provider(&input.api_base)),
        protocol_hint: input
            .protocol_hint
            .filter(|hint| !matches!(hint.trim(), "" | "auto")),
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
    // 处理脱敏后的 api_key：如果传入值含有 "..."，就沿用原有密钥
    let api_key = input.api_key.as_deref().and_then(|k| {
        if is_masked_api_key(k) {
            None // 用 None 告知 kernel 保留当前值
        } else {
            Some(k.to_string())
        }
    });

    let kernel_input = KernelUpdateChannelInput {
        name: input.name,
        provider: input.provider,
        protocol_hint: input.protocol_hint.map(|hint| {
            if matches!(hint.trim(), "" | "auto") {
                String::new()
            } else {
                hint
            }
        }),
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
// 获取/测试辅助函数（保持直连 reqwest，不经 jcli）
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

async fn try_chat_completion(
    client: &reqwest::Client,
    input: &TestChannelInput,
) -> Result<TestChannelResult, String> {
    let probe = build_probe_request(input);
    let path = probe.path;
    let route = &probe.route;
    let chat_url = format!("{}/{}", route.base_url, path);

    let mut req = client
        .post(&chat_url)
        .header("Content-Type", "application/json");

    if matches!(
        route.family,
        crate::kernel::types::ChatProtocolFamily::AnthropicMessages
    ) {
        if route.provider_key == "kimi-coding" {
            req = req
                .header("Authorization", format!("Bearer {}", input.api_key))
                .header("User-Agent", "KimiCLI/1.3");
        } else {
            req = req
                .header("x-api-key", &input.api_key)
                .header("Authorization", format!("Bearer {}", input.api_key))
                .header("anthropic-version", "2023-06-01");
        }
    } else {
        req = req.header("Authorization", format!("Bearer {}", input.api_key));
    }

    let resp = req.json(&probe.body).send().await;

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

fn build_probe_request(input: &TestChannelInput) -> ProbeRequest {
    let route = resolve_chat_transport_route(
        &input.api_base,
        input.provider.as_deref(),
        input.model.as_deref(),
        input.protocol_hint.as_deref(),
    );
    let is_anthropic = matches!(
        route.family,
        crate::kernel::types::ChatProtocolFamily::AnthropicMessages
    );
    let model = input.model.as_deref().unwrap_or(if is_anthropic {
        FALLBACK_MODEL_ANTHROPIC
    } else {
        FALLBACK_MODEL_OPENAI
    });

    let (path, body) = match route.family {
        crate::kernel::types::ChatProtocolFamily::AnthropicMessages => (
            "messages",
            serde_json::json!({
                "model": model,
                "messages": [{"role": "user", "content": "hi"}],
                "max_tokens": 5,
            }),
        ),
        crate::kernel::types::ChatProtocolFamily::OpenAiResponses => (
            "responses",
            serde_json::json!({
                "model": model,
                "input": [{
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": "hi"}]
                }],
                "stream": false,
                "max_output_tokens": 5,
            }),
        ),
        crate::kernel::types::ChatProtocolFamily::OpenAiChatCompletions => (
            "chat/completions",
            serde_json::json!({
                "model": model,
                "messages": [{"role": "user", "content": "hi"}],
                "max_tokens": 5,
            }),
        ),
    };

    ProbeRequest { route, path, body }
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
// 测试
// ---------------------------------------------------------------------------

#[cfg(test)]
#[path = "../tests/commands_channels.rs"]
mod tests;
