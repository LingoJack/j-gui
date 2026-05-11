use super::{
    load_attachment_images, model_id, KernelChatMessage, KernelChatRequestOptions,
    KernelChatStreamCallbacks, KernelChatStreamRequest, KernelError, KernelProvider,
};
use serde_json::{json, Value};

pub(super) struct HttpStreamRequest {
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Value,
}

pub(super) fn build_chat_request_extra(
    provider: &KernelProvider,
    options: KernelChatRequestOptions,
) -> serde_json::Map<String, serde_json::Value> {
    let mut extra = serde_json::Map::new();
    let Some(thinking_enabled) = options.thinking_enabled else {
        return extra;
    };

    let model_id = model_id(provider).to_ascii_lowercase();
    let api_base = provider.api_base.to_ascii_lowercase();
    let provider_type = provider.provider.to_ascii_lowercase();
    let is_deepseek_v4 = model_id.starts_with("deepseek-v4")
        || provider_type == "deepseek"
        || api_base.contains("deepseek");

    if is_deepseek_v4 {
        extra.insert(
            "thinking".to_string(),
            serde_json::json!({
                "type": if thinking_enabled { "enabled" } else { "disabled" }
            }),
        );
        if thinking_enabled {
            extra.insert(
                "output_config".to_string(),
                serde_json::json!({ "effort": "max" }),
            );
        }
    }

    extra
}

pub(super) fn build_anthropic_stream_request(
    provider: &KernelProvider,
    messages: &[KernelChatMessage],
    system_prompt: Option<&str>,
    options: KernelChatRequestOptions,
) -> Result<HttpStreamRequest, KernelError> {
    let payload_messages = messages
        .iter()
        .filter(|message| message.role != "system")
        .map(|message| {
            let role = if message.role == "assistant" {
                "assistant"
            } else {
                "user"
            };
            Ok(json!({
                "role": role,
                "content": build_anthropic_content(message)?,
            }))
        })
        .collect::<Result<Vec<_>, KernelError>>()?;

    let mut body = json!({
        "model": model_id(provider),
        "messages": payload_messages,
        "stream": true,
        "max_tokens": 32000,
    });
    if let Some(prompt) = system_prompt.map(str::trim).filter(|text| !text.is_empty()) {
        body["system"] = Value::String(prompt.to_string());
    }
    for (key, value) in build_chat_request_extra(provider, options) {
        body[&key] = value;
    }
    if provider.provider == "anthropic"
        && options.thinking_enabled == Some(true)
        && body.get("thinking").is_none()
    {
        body["thinking"] = json!({
            "type": "enabled",
            "budget_tokens": 4096
        });
    }

    Ok(HttpStreamRequest {
        url: format!("{}/messages", provider.api_base.trim_end_matches('/')),
        headers: anthropic_headers(provider),
        body,
    })
}

pub(super) fn build_openai_responses_request(
    provider: &KernelProvider,
    messages: &[KernelChatMessage],
    system_prompt: Option<&str>,
    options: KernelChatRequestOptions,
) -> Result<HttpStreamRequest, KernelError> {
    let input = messages
        .iter()
        .filter(|message| message.role != "system")
        .map(|message| {
            let role = if message.role == "assistant" {
                "assistant"
            } else {
                "user"
            };
            Ok(json!({
                "type": "message",
                "role": role,
                "content": build_responses_content(message)?,
            }))
        })
        .collect::<Result<Vec<_>, KernelError>>()?;

    let mut body = json!({
        "model": model_id(provider),
        "input": input,
        "stream": true,
        "max_output_tokens": 32000,
    });
    if let Some(prompt) = system_prompt.map(str::trim).filter(|text| !text.is_empty()) {
        body["instructions"] = Value::String(prompt.to_string());
    }
    if options.thinking_enabled == Some(true) {
        body["reasoning"] = json!({
            "effort": "medium",
            "summary": "auto"
        });
    }

    Ok(HttpStreamRequest {
        url: format!("{}/responses", provider.api_base.trim_end_matches('/')),
        headers: vec![
            ("content-type".to_string(), "application/json".to_string()),
            (
                "Authorization".to_string(),
                format!("Bearer {}", provider.api_key),
            ),
        ],
        body,
    })
}

pub(super) async fn stream_anthropic_messages(
    request: KernelChatStreamRequest<'_>,
    callbacks: KernelChatStreamCallbacks<'_>,
) -> Result<String, KernelError> {
    let KernelChatStreamRequest {
        provider,
        messages,
        system_prompt,
        options,
    } = request;
    let KernelChatStreamCallbacks {
        on_chunk,
        on_reasoning,
    } = callbacks;
    let request = build_anthropic_stream_request(provider, messages, system_prompt, options)?;
    let response = send_stream_request(&request).await?;
    let mut full_content = String::new();
    stream_sse_json_lines(response, |data| {
        let event: Value = serde_json::from_str(data)
            .map_err(|err| KernelError::Chat(Box::new(std::io::Error::other(err.to_string()))))?;
        match event["type"].as_str() {
            Some("content_block_delta") => {
                if let Some(text) = event["delta"]["text"].as_str() {
                    full_content.push_str(text);
                    on_chunk(text);
                }
                if let Some(reasoning) = event["delta"]["thinking"].as_str() {
                    on_reasoning(reasoning);
                }
            }
            Some("error") => return stream_error("Anthropic stream failed", &event["error"]),
            _ => {}
        }
        Ok(())
    })
    .await?;
    Ok(full_content)
}

pub(super) async fn stream_openai_responses(
    request: KernelChatStreamRequest<'_>,
    callbacks: KernelChatStreamCallbacks<'_>,
) -> Result<String, KernelError> {
    let KernelChatStreamRequest {
        provider,
        messages,
        system_prompt,
        options,
    } = request;
    let KernelChatStreamCallbacks {
        on_chunk,
        on_reasoning,
    } = callbacks;
    let request = build_openai_responses_request(provider, messages, system_prompt, options)?;
    let response = send_stream_request(&request).await?;
    let mut full_content = String::new();
    stream_sse_json_lines(response, |data| {
        let event: Value = serde_json::from_str(data)
            .map_err(|err| KernelError::Chat(Box::new(std::io::Error::other(err.to_string()))))?;
        match event["type"].as_str() {
            Some("response.output_text.delta") => {
                if let Some(text) = event["delta"].as_str() {
                    full_content.push_str(text);
                    on_chunk(text);
                }
            }
            Some("response.reasoning_text.delta")
            | Some("response.reasoning_summary_text.delta") => {
                if let Some(reasoning) = event["delta"].as_str() {
                    on_reasoning(reasoning);
                }
            }
            Some("response.failed") | Some("response.incomplete") | Some("error") => {
                return stream_error(
                    "Responses stream failed",
                    event.get("error").unwrap_or(&event["response"]["error"]),
                );
            }
            _ => {}
        }
        Ok(())
    })
    .await?;
    Ok(full_content)
}

fn build_anthropic_content(message: &KernelChatMessage) -> Result<Value, KernelError> {
    let Some(attachments) = message
        .attachments
        .as_ref()
        .filter(|items| !items.is_empty())
    else {
        return Ok(Value::String(message.content.clone()));
    };

    let mut content = load_attachment_images(attachments)?
        .into_iter()
        .map(|image| {
            json!({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": image.media_type,
                    "data": image.base64,
                }
            })
        })
        .collect::<Vec<_>>();
    if !message.content.is_empty() {
        content.push(json!({
            "type": "text",
            "text": message.content,
        }));
    }
    Ok(Value::Array(content))
}

fn build_responses_content(message: &KernelChatMessage) -> Result<Value, KernelError> {
    let Some(attachments) = message
        .attachments
        .as_ref()
        .filter(|items| !items.is_empty())
    else {
        return Ok(Value::Array(vec![json!({
            "type": "input_text",
            "text": message.content,
        })]));
    };

    let mut content = load_attachment_images(attachments)?
        .into_iter()
        .map(|image| {
            json!({
                "type": "input_image",
                "image_url": format!("data:{};base64,{}", image.media_type, image.base64),
            })
        })
        .collect::<Vec<_>>();
    if !message.content.is_empty() {
        content.push(json!({
            "type": "input_text",
            "text": message.content,
        }));
    }
    Ok(Value::Array(content))
}

fn anthropic_headers(provider: &KernelProvider) -> Vec<(String, String)> {
    let mut headers = vec![
        ("content-type".to_string(), "application/json".to_string()),
        ("anthropic-version".to_string(), "2023-06-01".to_string()),
    ];
    if provider.provider == "kimi-coding" {
        headers.push((
            "Authorization".to_string(),
            format!("Bearer {}", provider.api_key),
        ));
        headers.push(("User-Agent".to_string(), "KimiCLI/1.3".to_string()));
    } else {
        headers.push(("x-api-key".to_string(), provider.api_key.clone()));
        headers.push((
            "Authorization".to_string(),
            format!("Bearer {}", provider.api_key),
        ));
    }
    headers
}

async fn send_stream_request(
    request: &HttpStreamRequest,
) -> Result<reqwest::Response, KernelError> {
    let client = reqwest::Client::new();
    let response = apply_headers(client.post(&request.url), &request.headers)
        .json(&request.body)
        .send()
        .await
        .map_err(|err| KernelError::Chat(Box::new(std::io::Error::other(err.to_string()))))?;
    if response.status().is_success() {
        Ok(response)
    } else {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        Err(KernelError::Chat(Box::new(std::io::Error::other(format!(
            "Stream API error ({}): {}",
            status.as_u16(),
            body
        )))))
    }
}

fn apply_headers(
    builder: reqwest::RequestBuilder,
    headers: &[(String, String)],
) -> reqwest::RequestBuilder {
    headers.iter().fold(builder, |request, (name, value)| {
        request.header(name, value)
    })
}

async fn stream_sse_json_lines(
    mut response: reqwest::Response,
    mut on_data_line: impl FnMut(&str) -> Result<(), KernelError>,
) -> Result<(), KernelError> {
    let mut buffer = String::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|err| KernelError::Chat(Box::new(std::io::Error::other(err.to_string()))))?
    {
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buffer.find('\n') {
            let mut line = buffer[..pos].to_string();
            buffer.drain(..=pos);
            if line.ends_with('\r') {
                line.pop();
            }
            let Some(data) = line.strip_prefix("data:") else {
                continue;
            };
            let data = data.trim();
            if data.is_empty() || data == "[DONE]" {
                continue;
            }
            on_data_line(data)?;
        }
    }
    Ok(())
}

fn stream_error(default_message: &str, error_value: &Value) -> Result<(), KernelError> {
    let message = error_value["message"]
        .as_str()
        .unwrap_or(default_message)
        .to_string();
    Err(KernelError::Chat(Box::new(std::io::Error::other(message))))
}
