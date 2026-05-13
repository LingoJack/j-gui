use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use crate::commands::files::move_file as move_base_file;
use crate::commands::files::{
    ensure_existing_path, get_agent_session_path, open_file, show_in_folder,
    validate_workspace_slug, workspace_dir,
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileIndexEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub entry_type: String,
    pub source: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSaveFileItem {
    pub filename: String,
    pub data: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFilesToAgentSessionInput {
    pub workspace_slug: String,
    pub session_id: String,
    pub files: Vec<AgentSaveFileItem>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedAgentFile {
    pub filename: String,
    pub target_path: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFilesToWorkspaceInput {
    pub workspace_slug: String,
    pub files: Vec<AgentSaveFileItem>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListAttachedDirectoryInput {
    pub dir_path: String,
    pub session_id: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameAttachedFileInput {
    pub file_path: String,
    pub new_name: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveAttachedFileInput {
    pub file_path: String,
    pub new_dir_path: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckPathsTypeResult {
    pub directories: Vec<String>,
    pub files: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchWorkspaceFilesInput {
    pub workspace_path: String,
    pub query: String,
    pub limit: Option<usize>,
    pub additional_paths: Option<Vec<String>>,
    pub session_additional_paths: Option<Vec<String>>,
}

fn sanitize_filename(filename: &str) -> Result<String, String> {
    let trimmed = filename.trim();
    if trimmed.is_empty() {
        return Err("文件名不能为空".into());
    }
    let normalized = Path::new(trimmed)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "文件名无效".to_string())?;
    if normalized != trimmed || normalized.contains('/') || normalized.contains('\\') {
        return Err("文件名不能包含路径分隔符".into());
    }
    Ok(normalized.to_string())
}

fn decode_base64_file(data: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("base64 解码失败: {}", e))
}

fn unique_destination_path(base_dir: &Path, filename: &str) -> PathBuf {
    let first = base_dir.join(filename);
    if !first.exists() {
        return first;
    }

    let path = Path::new(filename);
    let stem = path
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or(filename);
    let ext = path.extension().and_then(|name| name.to_str());

    for index in 1.. {
        let candidate_name = match ext {
            Some(ext) => format!("{stem}-{index}.{ext}"),
            None => format!("{stem}-{index}"),
        };
        let candidate = base_dir.join(candidate_name);
        if !candidate.exists() {
            return candidate;
        }
    }

    first
}

fn save_files_into_dir(
    target_dir: &Path,
    files: &[AgentSaveFileItem],
) -> Result<Vec<SavedAgentFile>, String> {
    fs::create_dir_all(target_dir).map_err(|e| format!("创建目标目录失败: {}", e))?;

    let mut saved = Vec::new();
    for file in files {
        let filename = sanitize_filename(&file.filename)?;
        let bytes = decode_base64_file(&file.data)?;
        let destination = unique_destination_path(target_dir, &filename);
        fs::write(&destination, &bytes).map_err(|e| format!("写入文件失败: {}", e))?;
        saved.push(SavedAgentFile {
            filename,
            target_path: destination.to_string_lossy().to_string(),
        });
    }

    Ok(saved)
}

fn path_to_file_entry(path: PathBuf) -> Result<FileEntry, String> {
    let metadata = path
        .metadata()
        .map_err(|e| format!("读取文件元数据失败: {}", e))?;
    Ok(FileEntry {
        name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_string(),
        path: path.to_string_lossy().to_string(),
        is_directory: metadata.is_dir(),
    })
}

fn list_directory_entries(dir_path: &Path) -> Result<Vec<FileEntry>, String> {
    let entries = fs::read_dir(dir_path).map_err(|e| format!("读取目录失败: {}", e))?;
    let mut result = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        result.push(path_to_file_entry(entry.path())?);
    }
    result.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(result)
}

fn collect_index_entries(
    root_dir: &Path,
    root_prefix: Option<&str>,
    source: &str,
) -> Result<Vec<FileIndexEntry>, String> {
    let mut result = Vec::new();
    if !root_dir.exists() {
        return Ok(result);
    }

    let prefix = root_prefix.unwrap_or("").replace('\\', "/");
    let mut stack = vec![root_dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        let entries = fs::read_dir(&current)
            .map_err(|e| format!("读取目录失败 ({}): {}", current.display(), e))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
            let path = entry.path();
            let metadata = entry
                .metadata()
                .map_err(|e| format!("读取文件元数据失败: {}", e))?;
            let relative = path
                .strip_prefix(root_dir)
                .map_err(|e| format!("构建相对路径失败: {}", e))?
                .to_string_lossy()
                .replace('\\', "/");
            let display_path = if prefix.is_empty() {
                relative.clone()
            } else if relative.is_empty() {
                prefix.clone()
            } else {
                format!("{prefix}/{relative}")
            };
            result.push(FileIndexEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: display_path,
                entry_type: if metadata.is_dir() {
                    "dir".to_string()
                } else {
                    "file".to_string()
                },
                source: source.to_string(),
            });
            if metadata.is_dir() {
                stack.push(path);
            }
        }
    }

    result.sort_by(
        |a, b| match (a.entry_type.as_str(), b.entry_type.as_str()) {
            ("dir", "file") => std::cmp::Ordering::Less,
            ("file", "dir") => std::cmp::Ordering::Greater,
            _ => a.path.cmp(&b.path),
        },
    );
    Ok(result)
}

fn filter_index_entries(
    entries: Vec<FileIndexEntry>,
    query: &str,
    limit: usize,
) -> Vec<FileIndexEntry> {
    if query.trim().is_empty() {
        return entries.into_iter().take(limit).collect();
    }

    let query_lower = query.to_lowercase();
    let by_path: HashMap<String, FileIndexEntry> = entries
        .iter()
        .cloned()
        .map(|entry| (entry.path.clone(), entry))
        .collect();
    let mut included_paths = HashSet::new();
    let mut ordered_paths = Vec::new();

    for entry in entries.iter().filter(|entry| {
        entry.name.to_lowercase().contains(&query_lower)
            || entry.path.to_lowercase().contains(&query_lower)
    }) {
        let mut current = Some(entry.path.as_str());
        while let Some(path) = current {
            if included_paths.insert(path.to_string()) {
                ordered_paths.push(path.to_string());
            }
            current = path.rfind('/').and_then(|index| {
                if index == 0 {
                    None
                } else {
                    Some(&path[..index])
                }
            });
        }
    }

    let mut filtered = ordered_paths
        .into_iter()
        .filter_map(|path| by_path.get(&path).cloned())
        .collect::<Vec<_>>();
    filtered.sort_by(
        |a, b| match (a.entry_type.as_str(), b.entry_type.as_str()) {
            ("dir", "file") => std::cmp::Ordering::Less,
            ("file", "dir") => std::cmp::Ordering::Greater,
            _ => a.path.cmp(&b.path),
        },
    );
    filtered.truncate(limit);
    filtered
}

#[tauri::command]
pub fn save_files_to_agent_session(
    input: SaveFilesToAgentSessionInput,
) -> Result<Vec<SavedAgentFile>, String> {
    validate_workspace_slug(&input.workspace_slug)?;
    crate::agent_session::get_agent_session(&input.session_id)?;
    let target_dir = PathBuf::from(get_agent_session_path(input.session_id.clone())?);
    save_files_into_dir(&target_dir, &input.files)
}

#[tauri::command]
pub fn save_files_to_workspace_files(
    input: SaveFilesToWorkspaceInput,
) -> Result<Vec<String>, String> {
    let target_dir = workspace_dir(&input.workspace_slug)?.join("files");
    let saved = save_files_into_dir(&target_dir, &input.files)?;
    Ok(saved.into_iter().map(|file| file.target_path).collect())
}

#[tauri::command]
pub fn preview_file(file_path: String) -> Result<(), String> {
    open_file(file_path)
}

#[tauri::command]
pub fn list_attached_directory(
    input: ListAttachedDirectoryInput,
) -> Result<Vec<FileEntry>, String> {
    if let Some(session_id) = input.session_id {
        crate::agent_session::get_agent_session(&session_id)?;
    }
    let dir_path = ensure_existing_path(&input.dir_path)?;
    if !dir_path.is_dir() {
        return Err(format!("目录不存在: {}", input.dir_path));
    }
    list_directory_entries(&dir_path)
}

#[tauri::command]
pub fn open_attached_file(file_path: String) -> Result<(), String> {
    open_file(file_path)
}

#[tauri::command]
pub fn read_attached_file(file_path: String) -> Result<String, String> {
    let path = ensure_existing_path(&file_path)?;
    let bytes = fs::read(&path).map_err(|e| format!("读取文件失败: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
pub fn show_attached_in_folder(file_path: String) -> Result<(), String> {
    show_in_folder(file_path)
}

#[tauri::command]
pub fn rename_attached_file(input: RenameAttachedFileInput) -> Result<(), String> {
    let source = ensure_existing_path(&input.file_path)?;
    let new_name = sanitize_filename(&input.new_name)?;
    let destination = source
        .parent()
        .ok_or_else(|| format!("无法解析父目录: {}", input.file_path))?
        .join(new_name);
    if destination.exists() {
        return Err(format!("目标文件已存在: {}", destination.display()));
    }
    fs::rename(&source, &destination).map_err(|e| format!("重命名失败: {}", e))
}

#[tauri::command]
pub fn move_attached_file(input: MoveAttachedFileInput) -> Result<(), String> {
    move_base_file(input.file_path, input.new_dir_path)
}

#[tauri::command]
pub fn check_paths_type(paths: Vec<String>) -> Result<CheckPathsTypeResult, String> {
    let mut directories = Vec::new();
    let mut files = Vec::new();

    for raw_path in paths {
        let path = PathBuf::from(&raw_path);
        if path.exists() {
            let canonical = path
                .canonicalize()
                .map_err(|e| format!("解析路径失败 ({}): {}", raw_path, e))?;
            if canonical.is_dir() {
                directories.push(canonical.to_string_lossy().to_string());
            } else {
                files.push(canonical.to_string_lossy().to_string());
            }
        } else {
            files.push(raw_path);
        }
    }

    Ok(CheckPathsTypeResult { directories, files })
}

#[tauri::command]
pub fn search_workspace_files(
    input: SearchWorkspaceFilesInput,
) -> Result<Vec<FileIndexEntry>, String> {
    let mut entries = collect_index_entries(Path::new(&input.workspace_path), None, "workspace")?;

    if let Some(paths) = input.additional_paths.as_ref() {
        for dir in paths {
            let root_name = Path::new(dir)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("workspace");
            entries.extend(collect_index_entries(
                Path::new(dir),
                Some(root_name),
                "workspace",
            )?);
        }
    }

    if let Some(paths) = input.session_additional_paths.as_ref() {
        for dir in paths {
            let root_name = Path::new(dir)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("session");
            entries.extend(collect_index_entries(
                Path::new(dir),
                Some(root_name),
                "session",
            )?);
        }
    }

    Ok(filter_index_entries(
        entries,
        &input.query,
        input.limit.unwrap_or(200),
    ))
}
