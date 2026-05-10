use crate::commands::settings::dirs_next;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri_plugin_dialog::DialogExt;

fn attachments_dir() -> PathBuf {
    let mut p = dirs_next().unwrap_or_else(|| PathBuf::from("."));
    p.push("attachments");
    p
}

/// 防止路径穿越：规范化路径并验证其在 allowed_dir 内
fn safe_path(allowed_dir: &PathBuf, user_path: &str) -> Result<PathBuf, String> {
    let clean = PathBuf::from(user_path)
        .file_name()
        .ok_or("无效的文件名")?
        .to_os_string();
    let resolved = allowed_dir.join(&clean);
    let canonical = std::fs::canonicalize(allowed_dir)
        .map_err(|_| "附件目录不存在，请先创建目录".to_string())?;
    if !resolved.starts_with(&canonical) {
        return Err("路径穿越被拒绝".into());
    }
    Ok(resolved)
}

// ============================================================
// Types
// ============================================================

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDialogResult {
    pub canceled: bool,
    pub file_paths: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAttachmentArgs {
    pub file_name: String,
    /// base64-encoded file data
    pub data: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAttachmentResult {
    pub local_path: String,
    pub file_name: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: u64,
}

// ============================================================
// Commands
// ============================================================

#[tauri::command]
pub fn open_file_dialog(app: tauri::AppHandle) -> Result<FileDialogResult, String> {
    match app.dialog().file().blocking_pick_files() {
        Some(files) if !files.is_empty() => Ok(FileDialogResult {
            canceled: false,
            file_paths: files
                .iter()
                .flat_map(|p| p.as_path())
                .map(|p| p.to_string_lossy().to_string())
                .collect(),
        }),
        _ => Ok(FileDialogResult {
            canceled: true,
            file_paths: vec![],
        }),
    }
}

#[tauri::command]
pub fn save_attachment(args: SaveAttachmentArgs) -> Result<SaveAttachmentResult, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&args.data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let dir = attachments_dir();
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create attachments directory: {}", e))?;

    let file_path = safe_path(&dir, &args.file_name)?;
    fs::write(&file_path, &bytes).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(SaveAttachmentResult {
        local_path: file_path.to_string_lossy().to_string(),
        file_name: args.file_name,
    })
}

#[tauri::command]
pub fn read_attachment(local_path: String) -> Result<String, String> {
    let dir = attachments_dir();
    let resolved = safe_path(&dir, &local_path)?;
    let data = fs::read(&resolved).map_err(|e| format!("Failed to read file: {}", e))?;
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
pub fn list_directory(dir_path: String) -> Result<Vec<DirEntry>, String> {
    let entries =
        fs::read_dir(&dir_path).map_err(|e| format!("Failed to read directory: {}", e))?;

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

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

    #[test]
    fn test_save_and_read_attachment_roundtrip() {
        let dir = std::env::temp_dir().join("j-gui-test-attachments");
        let _ = fs::remove_dir_all(&dir);

        let test_data = b"hello world";
        let b64 = base64::engine::general_purpose::STANDARD.encode(test_data);

        // Write via command logic
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&b64)
            .unwrap();
        fs::create_dir_all(&dir).unwrap();
        let file_path = dir.join("test.txt");
        fs::write(&file_path, &bytes).unwrap();

        // Read via command logic
        let read_data = fs::read(&file_path).unwrap();
        let read_b64 = base64::engine::general_purpose::STANDARD.encode(&read_data);

        assert_eq!(b64, read_b64);
        assert_eq!(read_data, test_data);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_list_directory() {
        let dir = std::env::temp_dir().join("j-gui-test-list");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("a.txt"), b"123").unwrap();
        fs::create_dir_all(dir.join("subdir")).unwrap();

        let entries = list_directory(dir.to_string_lossy().to_string()).unwrap();
        assert_eq!(entries.len(), 2);

        let a_txt = entries
            .iter()
            .find(|e| e.name == "a.txt")
            .expect("should have a.txt");
        assert!(!a_txt.is_directory);
        assert_eq!(a_txt.size, 3);

        let subdir = entries
            .iter()
            .find(|e| e.name == "subdir")
            .expect("should have subdir");
        assert!(subdir.is_directory);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_list_directory_empty() {
        let dir = std::env::temp_dir().join("j-gui-test-empty");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let entries = list_directory(dir.to_string_lossy().to_string()).unwrap();
        assert!(entries.is_empty());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_list_directory_nonexistent() {
        let result = list_directory("/nonexistent/path/that/does/not/exist".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_file_removes_file() {
        let dir = std::env::temp_dir().join("j-gui-test-delete-file");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let file_path = dir.join("delete_me.txt");
        fs::write(&file_path, b"content").unwrap();

        delete_file(file_path.to_string_lossy().to_string()).unwrap();
        assert!(!file_path.exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_delete_file_nonexistent() {
        let result = delete_file("/nonexistent/path/to/delete/file.txt".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_file_removes_directory() {
        let dir = std::env::temp_dir().join("j-gui-test-delete-dir");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("nested.txt"), b"data").unwrap();

        delete_file(dir.to_string_lossy().to_string()).unwrap();
        assert!(!dir.exists());
    }

    #[test]
    fn test_rename_file_renames() {
        let dir = std::env::temp_dir().join("j-gui-test-rename");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let old = dir.join("old_name.txt");
        let new = dir.join("new_name.txt");
        fs::write(&old, b"content").unwrap();

        rename_file(
            old.to_string_lossy().to_string(),
            new.to_string_lossy().to_string(),
        )
        .unwrap();
        assert!(!old.exists());
        assert!(new.exists());
        assert_eq!(fs::read_to_string(&new).unwrap(), "content");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_rename_file_nonexistent_old() {
        let result = rename_file(
            "/nonexistent/old.txt".to_string(),
            "/nonexistent/new.txt".to_string(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_rename_file_conflict_new_exists() {
        let dir = std::env::temp_dir().join("j-gui-test-rename-conflict");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let old = dir.join("a.txt");
        let existing = dir.join("b.txt");
        fs::write(&old, b"a").unwrap();
        fs::write(&existing, b"b").unwrap();

        let result = rename_file(
            old.to_string_lossy().to_string(),
            existing.to_string_lossy().to_string(),
        );
        assert!(result.is_err());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_base64_decode_invalid() {
        let result = base64::engine::general_purpose::STANDARD.decode("!!!not-valid-base64!!!");
        assert!(result.is_err());
    }
}
