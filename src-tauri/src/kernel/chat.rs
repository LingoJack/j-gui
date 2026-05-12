#![allow(dead_code)]

use async_trait::async_trait;

use super::error::KernelError;
use super::types::{
    KernelAgentParams, KernelChatMessage, KernelChatRequestOptions, KernelFileAttachment,
    KernelProvider, KernelSessionEvent, KernelSessionSummary,
};

/// LLM 流式请求的只读参数集合，避免在 trait 上堆叠过多位置参数。
pub struct KernelChatStreamRequest<'a> {
    pub provider: &'a KernelProvider,
    pub messages: &'a [KernelChatMessage],
    pub system_prompt: Option<&'a str>,
    pub options: KernelChatRequestOptions,
}

/// LLM 流式回调集合，统一承载文本与 reasoning 增量。
pub struct KernelChatStreamCallbacks<'a> {
    pub on_chunk: &'a mut dyn for<'b> FnMut(&'b str),
    pub on_reasoning: &'a mut dyn for<'b> FnMut(&'b str),
}

/// 待持久化的单条消息参数集合。
pub struct KernelAppendMessage<'a> {
    pub session_id: &'a str,
    pub role: &'a str,
    pub content: &'a str,
    pub reasoning: Option<&'a str>,
    pub attachments: Option<&'a [KernelFileAttachment]>,
}

/// 聊天与会话共用的 kernel trait。
/// 要求实现 `Send + Sync`，这样 `Arc<dyn ChatKernel>` 才能跨线程传递（`thread::spawn` 需要）。
/// `async_trait` 上的 `?Send` 允许流式回调本身不是 `Send`（这是 jcli 的约束）。
#[async_trait(?Send)]
pub trait ChatKernel: Send + Sync {
    /// 流式获取 LLM 响应；每个文本增量都会通过 `on_chunk` 回调返回。
    /// 成功时返回完整响应文本。
    async fn stream_chat(
        &self,
        request: KernelChatStreamRequest<'_>,
        callbacks: KernelChatStreamCallbacks<'_>,
    ) -> Result<String, KernelError>;

    /// 直接通过 kernel 运行 jcli agent loop。
    /// 该循环负责多轮工具调用、流式输出、自动压缩与中断处理。
    /// 事件会通过 `params.on_event` 以 JSON 字符串形式流出。
    async fn run_agent_loop(&self, params: KernelAgentParams) -> Result<(), KernelError>;

    /// 把一条消息事件持久化到会话 transcript 中。
    fn append_message(&self, message: KernelAppendMessage<'_>) -> Result<(), KernelError>;

    // -- 会话读写删改 --

    /// 列出全部会话摘要。
    fn list_sessions(&self) -> Result<Vec<KernelSessionSummary>, KernelError>;
    /// 根据会话 ID 读取会话事件。
    fn get_session(&self, session_id: &str) -> Result<Vec<KernelSessionEvent>, KernelError>;
    /// 创建新会话并返回其 ID。
    fn create_session(&self) -> Result<String, KernelError>;
    /// 按 ID 删除会话。
    fn delete_session(&self, session_id: &str) -> Result<(), KernelError>;
    /// 按索引删除一组 user/assistant 消息。
    fn delete_message(&self, session_id: &str, pair_index: usize) -> Result<(), KernelError>;
    /// 从指定轮次开始截断全部后续 user/assistant 消息。
    fn truncate_messages_from(
        &self,
        session_id: &str,
        pair_index: usize,
        preserve_first_message_attachments: bool,
    ) -> Result<(), KernelError>;
    /// 清空会话中的全部消息。
    fn clear_session(&self, session_id: &str) -> Result<(), KernelError>;

    /// 切换会话置顶状态，并返回更新后的摘要。
    fn toggle_pin(&self, session_id: &str) -> Result<KernelSessionSummary, KernelError>;

    /// 切换会话归档状态，并返回更新后的摘要。
    fn toggle_archive(&self, session_id: &str) -> Result<KernelSessionSummary, KernelError>;
}

// 单元测试
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kernel_error_display() {
        let err = KernelError::Chat("test error".into());
        assert!(format!("{}", err).contains("chat error"));
    }

    #[test]
    fn kernel_error_io_conversion() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let kernel_err: KernelError = io_err.into();
        assert!(format!("{}", kernel_err).contains("io error"));
    }

    #[test]
    fn kernel_error_from_string() {
        let err: KernelError = "config broken".to_string().into();
        assert!(format!("{}", err).contains("config error"));
    }
}
