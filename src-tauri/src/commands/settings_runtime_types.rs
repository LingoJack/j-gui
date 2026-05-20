use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
/// 设置页基础环境检查结果。
pub struct EnvCheckResult {
    pub nodejs: EnvToolStatus,
    pub git: EnvToolStatus,
    pub platform: String,
}

/// 基础环境检查里单个工具的状态。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvToolStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub meets_minimum: bool,
    pub meets_recommended: bool,
    pub meets_requirement: bool,
    pub download_url: Option<String>,
    pub error: Option<String>,
}

/// Node/Git 这类运行时的统一状态结构。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeBinaryStatus {
    /// 运行时是否可用。
    pub available: bool,
    /// 运行时版本号。
    pub version: Option<String>,
    /// 可执行文件路径。
    pub path: Option<String>,
    /// 错误信息。
    pub error: Option<String>,
}

/// Bun 运行时状态。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BunRuntimeStatus {
    /// 运行时是否可用。
    pub available: bool,
    /// Bun 版本号。
    pub version: Option<String>,
    /// 可执行文件路径。
    pub path: Option<String>,
    /// Bun 来源，当前仅区分 system 或未知。
    pub source: Option<String>,
    /// 错误信息。
    pub error: Option<String>,
}

/// 单个 shell 候选项状态。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellCandidateStatus {
    /// shell 家族。
    pub family: String,
    /// shell 是否可用。
    pub available: bool,
    /// 可执行文件路径。
    pub path: Option<String>,
    /// 版本号。
    pub version: Option<String>,
    /// 探测来源。
    pub source: String,
    /// 错误信息。
    pub error: Option<String>,
}

/// Windows 下 WSL 的探测结果。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WslStatus {
    /// WSL 是否可用。
    pub available: bool,
    /// 默认发行版的 WSL 主版本，仅支持 1/2。
    pub version: Option<u8>,
    /// 默认发行版名称。
    pub default_distro: Option<String>,
    /// 已探测到的发行版列表。
    pub distros: Vec<String>,
    /// 错误信息。
    pub error: Option<String>,
}

/// POSIX shell 环境状态。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PosixShellStatus {
    /// 当前默认 shell。
    pub current: Option<ShellCandidateStatus>,
    /// 候选 shell 列表。
    pub candidates: Vec<ShellCandidateStatus>,
    /// 推荐使用的 shell。
    pub recommended: Option<String>,
}

/// Windows shell 环境状态。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsShellStatus {
    /// PowerShell 状态。
    pub powershell: ShellCandidateStatus,
    /// CMD 状态。
    pub cmd: ShellCandidateStatus,
    /// Git Bash 状态。
    pub git_bash: ShellCandidateStatus,
    /// WSL 状态。
    pub wsl: WslStatus,
    /// 推荐使用的 shell。
    pub recommended: Option<String>,
}

/// Shell 环境状态。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellEnvironmentStatus {
    /// 当前平台。
    pub platform: String,
    /// 当前默认 shell。
    pub current: Option<ShellCandidateStatus>,
    /// 推荐使用的 shell。
    pub recommended: Option<String>,
    /// fallback 顺序。
    pub fallback_order: Vec<String>,
    /// Windows 平台明细。
    pub windows: Option<WindowsShellStatus>,
    /// POSIX 平台明细。
    pub posix: Option<PosixShellStatus>,
}

/// 完整运行时状态。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    /// Node.js 状态。
    pub node: RuntimeBinaryStatus,
    /// Bun 状态。
    pub bun: BunRuntimeStatus,
    /// Git 状态。
    pub git: RuntimeBinaryStatus,
    /// Shell 状态。
    pub shell: ShellEnvironmentStatus,
    /// 是否完成额外 shell 环境加载；Tauri 当前恒为 false。
    pub env_loaded: bool,
    /// 本次探测时间戳。
    pub initialized_at: u64,
}

/// 单类存储目录的只读统计结果。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageBucketStats {
    /// 统计目标路径。
    pub path: String,
    /// 路径当前是否存在。
    pub exists: bool,
    /// 递归统计到的文件数。
    pub file_count: u64,
    /// 递归统计到的目录数（不含根目录自身）。
    pub directory_count: u64,
    /// 递归累计的字节数。
    pub total_bytes: u64,
}

/// 设置页使用的只读存储统计。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStats {
    /// Agent session 落盘目录统计。
    pub agent_sessions: StorageBucketStats,
    /// GUI 附件目录统计。
    pub attachments: StorageBucketStats,
    /// GUI 工作区目录统计。
    pub workspaces: StorageBucketStats,
    /// GUI 临时目录统计。
    pub temp_files: StorageBucketStats,
    /// 本次统计时间戳。
    pub checked_at: u64,
}
