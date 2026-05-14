#[derive(Clone, Debug, PartialEq, Eq)]
/// Agent CLI 启动失败后的重试策略。
pub struct RetryPolicy {
    pub max_attempts: u32,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self { max_attempts: 3 }
    }
}

impl RetryPolicy {
    /// 返回当前尝试序号是否仍允许继续重试。
    pub fn can_retry(&self, attempt: u32) -> bool {
        attempt < self.max_attempts
    }

    /// 返回当前尝试对应的指数退避秒数。
    pub fn delay_seconds_for(&self, attempt: u32) -> u32 {
        match attempt {
            0 | 1 => 1,
            2 => 2,
            _ => 4,
        }
    }
}
