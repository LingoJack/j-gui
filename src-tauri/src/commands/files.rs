use crate::commands::settings::dirs_next;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

pub(crate) fn attachments_dir() -> PathBuf {
    let mut p = dirs_next().unwrap_or_else(|| PathBuf::from("."));
    p.push("attachments");
    p
}

fn sanitize_relative_path(user_path: &str) -> Result<PathBuf, String> {
    let path = Path::new(user_path);
    if path.is_absolute() {
        return Err("不允许使用绝对路径".into());
    }

    let mut clean = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::Normal(part) => clean.push(part),
            _ => return Err("路径穿越被拒绝".into()),
        }
    }

    if clean.as_os_str().is_empty() {
        return Err("无效的文件路径".into());
    }
    Ok(clean)
}

pub(crate) fn resolve_attachment_path(local_path: &str) -> Result<PathBuf, String> {
    let clean = sanitize_relative_path(local_path)?;
    Ok(attachments_dir().join(clean))
}

fn file_extension(filename: &str) -> Option<String> {
    Path::new(filename)
        .extension()
        .and_then(|ext| ext.to_str())
        .filter(|ext| !ext.is_empty())
        .map(ToString::to_string)
}

fn infer_media_type(path: &Path) -> String {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        Some("txt") | Some("md") | Some("log") => "text/plain",
        Some("json") => "application/json",
        Some("pdf") => "application/pdf",
        _ => "application/octet-stream",
    }
    .to_string()
}

pub(crate) fn ensure_existing_path(file_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(file_path);
    if !path.exists() {
        return Err(format!("路径不存在: {}", file_path));
    }
    path.canonicalize()
        .map_err(|e| format!("解析路径失败: {}", e))
}

fn spawn_open_command(program: &str, args: &[String]) -> Result<(), String> {
    Command::new(program)
        .args(args)
        .spawn()
        .map_err(|e| format!("启动系统打开命令失败: {}", e))?;
    Ok(())
}

pub(crate) fn validate_workspace_slug(slug: &str) -> Result<(), String> {
    if slug.is_empty() || slug.contains("..") || slug.contains('/') || slug.contains('\\') {
        return Err(format!("非法工作区标识: {}", slug));
    }
    Ok(())
}

pub(crate) fn workspace_dir(workspace_slug: &str) -> Result<PathBuf, String> {
    validate_workspace_slug(workspace_slug)?;
    let base = dirs_next().unwrap_or_else(|| PathBuf::from("."));
    Ok(base.join("agent-workspaces").join(workspace_slug))
}

fn unique_attachment_relative_path(
    conversation_id: &str,
    filename: &str,
) -> Result<String, String> {
    let conversation = sanitize_relative_path(conversation_id)?;
    let mut relative = conversation;
    let unique_name = match file_extension(filename) {
        Some(ext) => format!("{}.{}", Uuid::new_v4(), ext),
        None => Uuid::new_v4().to_string(),
    };
    relative.push(unique_name);
    Ok(relative.to_string_lossy().replace('\\', "/"))
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDialogResult {
    pub canceled: bool,
    pub file_paths: Vec<String>,
    pub path: Option<String>,
    #[serde(default)]
    pub files: Vec<SelectedFile>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedFile {
    pub filename: String,
    pub media_type: String,
    pub data: String,
    pub size: u64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAttachmentArgs {
    pub conversation_id: String,
    pub filename: String,
    pub media_type: String,
    pub data: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedAttachment {
    pub id: String,
    pub filename: String,
    pub media_type: String,
    pub local_path: String,
    pub size: u64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAttachmentResult {
    pub attachment: SavedAttachment,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: u64,
}

#[tauri::command]
pub fn open_file_dialog(app: tauri::AppHandle) -> Result<FileDialogResult, String> {
    match app.dialog().file().blocking_pick_files() {
        Some(files) if !files.is_empty() => {
            let mut file_paths = Vec::new();
            let mut selected_files = Vec::new();

            for file in files.iter().flat_map(|item| item.as_path()) {
                let bytes = fs::read(file)
                    .map_err(|e| format!("读取所选文件失败 ({}): {}", file.display(), e))?;
                file_paths.push(file.to_string_lossy().to_string());
                selected_files.push(SelectedFile {
                    filename: file
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    media_type: infer_media_type(file),
                    data: base64::engine::general_purpose::STANDARD.encode(bytes),
                    size: fs::metadata(file)
                        .map_err(|e| format!("读取文件元数据失败 ({}): {}", file.display(), e))?
                        .len(),
                });
            }

            Ok(FileDialogResult {
                canceled: false,
                file_paths,
                path: None,
                files: selected_files,
            })
        }
        _ => Ok(FileDialogResult {
            canceled: true,
            file_paths: vec![],
            path: None,
            files: vec![],
        }),
    }
}

#[tauri::command]
pub fn open_folder_dialog(app: tauri::AppHandle) -> Result<FileDialogResult, String> {
    match app.dialog().file().blocking_pick_folder() {
        Some(folder) => {
            let path = folder
                .as_path()
                .map(|folder_path| folder_path.to_string_lossy().to_string())
                .ok_or_else(|| "无法解析目录路径".to_string())?;
            Ok(FileDialogResult {
                canceled: false,
                file_paths: vec![path.clone()],
                path: Some(path),
                files: vec![],
            })
        }
        None => Ok(FileDialogResult {
            canceled: true,
            file_paths: vec![],
            path: None,
            files: vec![],
        }),
    }
}

#[tauri::command]
pub fn save_attachment(input: SaveAttachmentArgs) -> Result<SaveAttachmentResult, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&input.data)
        .map_err(|e| format!("base64 解码失败: {}", e))?;

    let relative_path = unique_attachment_relative_path(&input.conversation_id, &input.filename)?;
    let file_path = resolve_attachment_path(&relative_path)?;
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建附件目录失败: {}", e))?;
    }
    fs::create_dir_all(attachments_dir()).map_err(|e| format!("创建附件目录失败: {}", e))?;
    fs::write(&file_path, &bytes).map_err(|e| format!("写入文件失败: {}", e))?;

    Ok(SaveAttachmentResult {
        attachment: SavedAttachment {
            id: Uuid::new_v4().to_string(),
            filename: input.filename,
            media_type: input.media_type,
            local_path: relative_path,
            size: bytes.len() as u64,
        },
    })
}

#[tauri::command]
pub fn read_attachment(local_path: String) -> Result<String, String> {
    let resolved = resolve_attachment_path(&local_path)?;
    let data = fs::read(&resolved).map_err(|e| format!("读取文件失败: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&data))
}

#[tauri::command]
pub fn delete_file(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }
    if path.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| format!("删除目录失败: {}", e))?;
    } else {
        fs::remove_file(&path).map_err(|e| format!("删除文件失败: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_attachment(local_path: String) -> Result<(), String> {
    let resolved = resolve_attachment_path(&local_path)?;
    if !resolved.exists() {
        return Ok(());
    }
    fs::remove_file(&resolved).map_err(|e| format!("删除附件失败: {}", e))
}

#[tauri::command]
pub fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    let old = PathBuf::from(&old_path);
    let new = PathBuf::from(&new_path);
    if !old.exists() {
        return Err(format!("文件不存在: {}", old_path));
    }
    if new.exists() {
        return Err(format!("目标文件已存在: {}", new_path));
    }
    fs::rename(&old, &new).map_err(|e| format!("重命名失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn move_file(src: String, dest: String) -> Result<(), String> {
    let source = ensure_existing_path(&src)?;
    let destination_root = ensure_existing_path(&dest)?;
    if !destination_root.is_dir() {
        return Err(format!("目标目录不存在: {}", dest));
    }

    let destination = destination_root.join(
        source
            .file_name()
            .ok_or_else(|| format!("无法解析源文件名: {}", src))?,
    );
    if destination.exists() {
        return Err(format!("目标文件已存在: {}", destination.display()));
    }
    fs::rename(&source, &destination).map_err(|e| format!("移动文件失败: {}", e))
}

#[tauri::command]
pub fn list_directory(dir_path: String) -> Result<Vec<DirEntry>, String> {
    let entries = fs::read_dir(&dir_path).map_err(|e| format!("读取目录失败: {}", e))?;

    let mut result = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        result.push(DirEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_directory: metadata.is_dir(),
            size: metadata.len(),
        });
    }
    Ok(result)
}

#[tauri::command]
pub fn open_file(file_path: String) -> Result<(), String> {
    let path = ensure_existing_path(&file_path)?;
    let path_arg = path.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        spawn_open_command("explorer", &[path_arg])
    }
    #[cfg(target_os = "macos")]
    {
        spawn_open_command("open", &[path_arg])
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        spawn_open_command("xdg-open", &[path_arg])
    }
}

#[tauri::command]
pub fn show_in_folder(file_path: String) -> Result<(), String> {
    let path = ensure_existing_path(&file_path)?;

    #[cfg(target_os = "windows")]
    {
        if path.is_dir() {
            return spawn_open_command("explorer", &[path.to_string_lossy().to_string()]);
        }
        spawn_open_command("explorer", &[format!("/select,{}", path.to_string_lossy())])
    }
    #[cfg(target_os = "macos")]
    {
        spawn_open_command(
            "open",
            &["-R".to_string(), path.to_string_lossy().to_string()],
        )
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let target = if path.is_dir() {
            path
        } else {
            path.parent().map(Path::to_path_buf).unwrap_or(path)
        };
        spawn_open_command("xdg-open", &[target.to_string_lossy().to_string()])
    }
}

#[tauri::command]
pub fn get_agent_session_path(session_id: String) -> Result<String, String> {
    let sessions = crate::agent_session::list_agent_sessions()?;
    let session = sessions
        .into_iter()
        .find(|item| item.id == session_id)
        .ok_or_else(|| "会话不存在".to_string())?;
    if let Some(workspace_id) = session.workspace_id {
        let workspaces = crate::commands::settings::list_agent_workspaces()?;
        if let Some(workspace) = workspaces.into_iter().find(|item| item.id == workspace_id) {
            let path = workspace_dir(&workspace.slug)?;
            fs::create_dir_all(&path).map_err(|e| format!("创建工作区目录失败: {}", e))?;
            return Ok(path.to_string_lossy().to_string());
        }
    }
    crate::agent_session::get_agent_session(&session_id)?;
    Ok(crate::agent_session::agent_sessions_dir()
        .join(session_id)
        .to_string_lossy()
        .to_string())
}

fn session_attached_directories_base_dir(session_id: &str) -> Result<PathBuf, String> {
    let sessions = crate::agent_session::list_agent_sessions()?;
    let session = sessions
        .into_iter()
        .find(|item| item.id == session_id)
        .ok_or_else(|| "会话不存在".to_string())?;
    if let Some(workspace_id) = session.workspace_id {
        let workspaces = crate::commands::settings::list_agent_workspaces()?;
        if let Some(workspace) = workspaces.into_iter().find(|item| item.id == workspace_id) {
            let path = workspace_dir(&workspace.slug)?;
            fs::create_dir_all(&path).map_err(|e| format!("创建工作区目录失败: {}", e))?;
            return Ok(path);
        }
    }
    let session_dir = crate::agent_session::agent_sessions_dir().join(session_id);
    fs::create_dir_all(&session_dir).map_err(|e| format!("创建会话目录失败: {}", e))?;
    Ok(session_dir)
}

#[tauri::command]
pub fn get_workspace_files_path(workspace_slug: String) -> Result<String, String> {
    let path = workspace_dir(&workspace_slug)?.join("files");
    fs::create_dir_all(&path).map_err(|e| format!("创建工作区文件目录失败: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

fn attached_directories_path(base_dir: &Path) -> PathBuf {
    base_dir.join("attached-directories.json")
}

fn load_attached_directories(base_dir: &Path) -> Result<Vec<String>, String> {
    let path = attached_directories_path(base_dir);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取附加目录失败: {}", e))?;
    serde_json::from_str::<Vec<String>>(&content).map_err(|e| format!("解析附加目录失败: {}", e))
}

fn save_attached_directories(base_dir: &Path, directories: &[String]) -> Result<(), String> {
    fs::create_dir_all(base_dir).map_err(|e| format!("创建目录失败: {}", e))?;
    let content = serde_json::to_string_pretty(directories)
        .map_err(|e| format!("序列化附加目录失败: {}", e))?;
    fs::write(attached_directories_path(base_dir), content)
        .map_err(|e| format!("写入附加目录失败: {}", e))
}

fn normalize_directory_path(directory_path: String) -> Result<String, String> {
    let path = PathBuf::from(&directory_path);
    if !path.is_dir() {
        return Err(format!("目录不存在: {}", directory_path));
    }
    path.canonicalize()
        .map(|canonical| canonical.to_string_lossy().to_string())
        .map_err(|e| format!("解析目录失败: {}", e))
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachDirectoryInput {
    pub session_id: String,
    pub directory_path: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachWorkspaceDirectoryInput {
    pub workspace_slug: String,
    pub directory_path: String,
}

#[tauri::command]
pub fn attach_directory(input: AttachDirectoryInput) -> Result<Vec<String>, String> {
    crate::agent_session::get_agent_session(&input.session_id)?;
    let normalized = normalize_directory_path(input.directory_path)?;
    let session_dir = session_attached_directories_base_dir(&input.session_id)?;
    let mut directories = load_attached_directories(&session_dir)?;
    if !directories.iter().any(|entry| entry == &normalized) {
        directories.push(normalized);
    }
    save_attached_directories(&session_dir, &directories)?;
    Ok(directories)
}

#[tauri::command]
pub fn detach_directory(session_id: String, dir_path: String) -> Result<(), String> {
    crate::agent_session::get_agent_session(&session_id)?;
    let session_dir = session_attached_directories_base_dir(&session_id)?;
    let normalized = normalize_directory_path(dir_path)?;
    let mut directories = load_attached_directories(&session_dir)?;
    directories.retain(|entry| entry != &normalized);
    save_attached_directories(&session_dir, &directories)
}

#[tauri::command]
pub fn attach_workspace_directory(
    input: AttachWorkspaceDirectoryInput,
) -> Result<Vec<String>, String> {
    let normalized = normalize_directory_path(input.directory_path)?;
    let workspace_base = workspace_dir(&input.workspace_slug)?;
    let mut directories = load_attached_directories(&workspace_base)?;
    if !directories.iter().any(|entry| entry == &normalized) {
        directories.push(normalized);
    }
    save_attached_directories(&workspace_base, &directories)?;
    Ok(directories)
}

#[tauri::command]
pub fn detach_workspace_directory(workspace_slug: String, dir_path: String) -> Result<(), String> {
    let workspace_base = workspace_dir(&workspace_slug)?;
    let normalized = normalize_directory_path(dir_path)?;
    let mut directories = load_attached_directories(&workspace_base)?;
    directories.retain(|entry| entry != &normalized);
    save_attached_directories(&workspace_base, &directories)
}

#[tauri::command]
pub fn get_workspace_directories(workspace_slug: String) -> Result<Vec<String>, String> {
    let workspace_base = workspace_dir(&workspace_slug)?;
    load_attached_directories(&workspace_base)
}

#[cfg(test)]
#[path = "../tests/commands_files.rs"]
mod files_tests;
