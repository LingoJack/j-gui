use crate::commands::files::attachments_dir;
use crate::commands::settings::{dirs_next, StorageBucketStats, StorageStats};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Default)]
struct DirCounters {
    file_count: u64,
    directory_count: u64,
    total_bytes: u64,
}

fn current_timestamp_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn settings_root_dir() -> PathBuf {
    dirs_next().unwrap_or_else(|| PathBuf::from("."))
}

fn workspaces_root_dir() -> PathBuf {
    settings_root_dir().join("agent-workspaces")
}

fn temp_files_root_dir() -> PathBuf {
    settings_root_dir().join("temp")
}

fn walk_directory(path: &Path, counters: &mut DirCounters) {
    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(error) => {
            eprintln!(
                "[settings_storage] 读取目录失败，按 best-effort 跳过: {} ({})",
                path.display(),
                error
            );
            return;
        }
    };
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                eprintln!(
                    "[settings_storage] 遍历目录失败，按 best-effort 跳过: {} ({})",
                    path.display(),
                    error
                );
                continue;
            }
        };
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) => {
                eprintln!(
                    "[settings_storage] 读取文件类型失败，按 best-effort 跳过: {} ({})",
                    entry.path().display(),
                    error
                );
                continue;
            }
        };
        if file_type.is_dir() {
            counters.directory_count += 1;
            walk_directory(&entry.path(), counters);
            continue;
        }

        if file_type.is_file() {
            counters.file_count += 1;
            match entry.metadata() {
                Ok(metadata) => {
                    counters.total_bytes += metadata.len();
                }
                Err(error) => {
                    eprintln!(
                        "[settings_storage] 读取文件元数据失败，按 best-effort 跳过: {} ({})",
                        entry.path().display(),
                        error
                    );
                }
            }
        }
    }
}

fn collect_bucket(path: PathBuf) -> Result<StorageBucketStats, String> {
    if !path.exists() {
        return Ok(StorageBucketStats {
            path: path.to_string_lossy().to_string(),
            exists: false,
            file_count: 0,
            directory_count: 0,
            total_bytes: 0,
        });
    }

    let mut counters = DirCounters::default();
    if path.is_dir() {
        walk_directory(&path, &mut counters);
    } else {
        match fs::metadata(&path) {
            Ok(metadata) => {
                counters.file_count = 1;
                counters.total_bytes = metadata.len();
            }
            Err(error) => {
                eprintln!(
                    "[settings_storage] 读取文件元数据失败，按 best-effort 跳过: {} ({})",
                    path.display(),
                    error
                );
            }
        }
    }

    Ok(StorageBucketStats {
        path: path.to_string_lossy().to_string(),
        exists: true,
        file_count: counters.file_count,
        directory_count: counters.directory_count,
        total_bytes: counters.total_bytes,
    })
}

/// 统计 GUI 自管目录（会话、附件、工作区、临时目录）的存储占用。
pub(crate) fn get_storage_stats() -> Result<StorageStats, String> {
    Ok(StorageStats {
        agent_sessions: collect_bucket(crate::agent_session::agent_sessions_dir())?,
        attachments: collect_bucket(attachments_dir())?,
        workspaces: collect_bucket(workspaces_root_dir())?,
        temp_files: collect_bucket(temp_files_root_dir())?,
        checked_at: current_timestamp_millis(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_test_root() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "j-gui-settings-storage-{}-{}",
            std::process::id(),
            unique
        ))
    }

    fn create_file(path: &Path, content: &[u8]) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }

    #[test]
    fn collect_bucket_summarizes_nested_directory_tree() {
        let root = unique_test_root();
        let _ = fs::remove_dir_all(&root);
        let bucket_root = root.join("bucket");

        create_file(
            &bucket_root.join("session-a").join("meta.json"),
            br#"{"title":"a"}"#,
        );
        create_file(
            &bucket_root.join("session-a").join("transcript.jsonl"),
            b"{\"kind\":\"user_message\"}\n",
        );
        create_file(&bucket_root.join("nested").join("image.png"), b"pngdata");

        let stats = collect_bucket(bucket_root.clone()).expect("collect bucket");

        assert_eq!(stats.path, bucket_root.to_string_lossy().to_string());
        assert!(stats.exists);
        assert_eq!(stats.file_count, 3);
        assert!(stats.directory_count >= 2);
        assert!(stats.total_bytes >= 7);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn collect_bucket_reports_missing_roots_as_empty() {
        let root = unique_test_root();
        let _ = fs::remove_dir_all(&root);
        let missing = root.join("missing");
        let stats = collect_bucket(missing.clone()).expect("collect missing bucket");

        assert_eq!(stats.path, missing.to_string_lossy().to_string());
        assert!(!stats.exists);
        assert_eq!(stats.file_count, 0);
        assert_eq!(stats.directory_count, 0);
        assert_eq!(stats.total_bytes, 0);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn collect_bucket_tolerates_dangling_symlink_when_supported() {
        let root = unique_test_root();
        let _ = fs::remove_dir_all(&root);
        let bucket_root = root.join("bucket");
        fs::create_dir_all(&bucket_root).unwrap();
        create_file(&bucket_root.join("ok.txt"), b"ok");

        #[cfg(unix)]
        {
            let dangling = bucket_root.join("dangling-link");
            std::os::unix::fs::symlink(bucket_root.join("missing-target"), &dangling).unwrap();
        }

        #[cfg(windows)]
        {
            let dangling = bucket_root.join("dangling-link");
            let _ =
                std::os::windows::fs::symlink_file(bucket_root.join("missing-target"), &dangling);
        }

        let stats =
            collect_bucket(bucket_root.clone()).expect("collect bucket with dangling entry");
        assert_eq!(stats.path, bucket_root.to_string_lossy().to_string());
        assert!(stats.exists);
        assert!(stats.file_count >= 1);

        let _ = fs::remove_dir_all(&root);
    }
}
