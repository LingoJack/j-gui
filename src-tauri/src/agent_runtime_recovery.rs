#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RecoveryAction {
    RetrySameResume,
    RetryWithoutResume,
    Fail,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RecoveryDecision {
    pub action: RecoveryAction,
    pub reason: String,
}

/// 根据启动期错误判断是否继续重试，以及是否需要丢弃 resume 上下文。
pub fn classify_recovery(error: &str, has_resume_context: bool) -> RecoveryDecision {
    let normalized = error.to_ascii_lowercase();

    if has_resume_context
        && (normalized.contains("no conversation found")
            || normalized.contains("conversation not found")
            || normalized.contains("invalid resume")
            || normalized.contains("resume session"))
    {
        return RecoveryDecision {
            action: RecoveryAction::RetryWithoutResume,
            reason: "resume session 无效，切换为无 resume 重试".to_string(),
        };
    }

    if has_resume_context
        && (normalized.contains("thinking signature")
            || normalized.contains("signature")
            || normalized.contains("mismatched thinking"))
    {
        return RecoveryDecision {
            action: RecoveryAction::RetryWithoutResume,
            reason: "thinking signature 不兼容，切换为无 resume 重试".to_string(),
        };
    }

    if normalized.contains("429")
        || normalized.contains("rate limit")
        || normalized.contains("rate_limited")
        || normalized.contains("too many requests")
        || normalized.contains(" 500")
        || normalized.contains(" 502")
        || normalized.contains(" 503")
        || normalized.contains(" 504")
        || normalized.contains("service unavailable")
        || normalized.contains("bad gateway")
        || normalized.contains("gateway timeout")
        || normalized.contains("connection reset")
        || normalized.contains("connection refused")
        || normalized.contains("timed out")
        || normalized.contains("timeout")
        || normalized.contains("network")
        || normalized.contains("socket hang up")
    {
        return RecoveryDecision {
            action: RecoveryAction::RetrySameResume,
            reason: "检测到可重试的瞬时错误".to_string(),
        };
    }

    RecoveryDecision {
        action: RecoveryAction::Fail,
        reason: String::new(),
    }
}
