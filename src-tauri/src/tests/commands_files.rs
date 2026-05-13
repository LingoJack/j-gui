use crate::agent_session::TestEnvGuard;
use crate::commands::files::{delete_file, list_directory, rename_file};
use crate::commands::files_workspace::{
    check_paths_type, list_attached_directory, save_files_to_agent_session,
    save_files_to_workspace_files, search_workspace_files, AgentSaveFileItem, CheckPathsTypeResult,
    ListAttachedDirectoryInput, SaveFilesToAgentSessionInput, SaveFilesToWorkspaceInput,
    SearchWorkspaceFilesInput,
};
use base64::Engine;
use std::fs;

#[test]
fn test_save_and_read_attachment_roundtrip() {
    let dir = std::env::temp_dir().join("j-gui-test-attachments");
    let _ = fs::remove_dir_all(&dir);

    let test_data = b"hello world";
    let b64 = base64::engine::general_purpose::STANDARD.encode(test_data);

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&b64)
        .unwrap();
    fs::create_dir_all(&dir).unwrap();
    let file_path = dir.join("test.txt");
    fs::write(&file_path, &bytes).unwrap();

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

#[test]
fn test_save_files_to_workspace_files_writes_into_workspace_dir() {
    let guard = TestEnvGuard::new("save-workspace-files");
    let result = save_files_to_workspace_files(SaveFilesToWorkspaceInput {
        workspace_slug: "demo".to_string(),
        files: vec![AgentSaveFileItem {
            filename: "note.txt".to_string(),
            data: base64::engine::general_purpose::STANDARD.encode("hello workspace"),
        }],
    })
    .expect("workspace save should succeed");

    assert_eq!(result.len(), 1);
    let written = std::path::PathBuf::from(&result[0]);
    assert!(written.exists());
    assert_eq!(fs::read_to_string(&written).unwrap(), "hello workspace");

    drop(guard);
}

#[test]
fn test_save_files_to_agent_session_uses_session_dir() {
    let _guard = TestEnvGuard::new("save-session-files");
    let session_id = crate::agent_session::create_agent_session().expect("session should exist");
    let saved = save_files_to_agent_session(SaveFilesToAgentSessionInput {
        workspace_slug: "demo".to_string(),
        session_id: session_id.clone(),
        files: vec![AgentSaveFileItem {
            filename: "draft.md".to_string(),
            data: base64::engine::general_purpose::STANDARD.encode("# title"),
        }],
    })
    .expect("session save should succeed");

    assert_eq!(saved.len(), 1);
    let written = std::path::PathBuf::from(&saved[0].target_path);
    assert!(written.exists());
    assert_eq!(fs::read_to_string(&written).unwrap(), "# title");
    assert!(written.to_string_lossy().contains(&session_id));
}

#[test]
fn test_list_attached_directory_reads_children() {
    let dir = std::env::temp_dir().join("j-gui-test-attached-dir");
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(dir.join("nested")).unwrap();
    fs::write(dir.join("a.txt"), b"123").unwrap();

    let entries = list_attached_directory(ListAttachedDirectoryInput {
        dir_path: dir.to_string_lossy().to_string(),
        session_id: None,
    })
    .expect("attached dir listing should succeed");

    assert_eq!(entries.len(), 2);
    assert!(entries
        .iter()
        .any(|entry| entry.name == "a.txt" && !entry.is_directory));
    assert!(entries
        .iter()
        .any(|entry| entry.name == "nested" && entry.is_directory));

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn test_check_paths_type_splits_files_and_directories() {
    let dir = std::env::temp_dir().join("j-gui-test-check-paths");
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(dir.join("folder")).unwrap();
    fs::write(dir.join("file.txt"), b"x").unwrap();

    let result: CheckPathsTypeResult = check_paths_type(vec![
        dir.join("folder").to_string_lossy().to_string(),
        dir.join("file.txt").to_string_lossy().to_string(),
    ])
    .expect("path type check should succeed");

    assert_eq!(result.directories.len(), 1);
    assert_eq!(result.files.len(), 1);

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn test_search_workspace_files_includes_session_and_workspace_sources() {
    let workspace = std::env::temp_dir().join("j-gui-test-search-workspace");
    let session_extra = std::env::temp_dir().join("j-gui-test-search-session");
    let _ = fs::remove_dir_all(&workspace);
    let _ = fs::remove_dir_all(&session_extra);
    fs::create_dir_all(workspace.join("docs")).unwrap();
    fs::create_dir_all(&session_extra).unwrap();
    fs::write(workspace.join("docs").join("guide.md"), b"guide").unwrap();
    fs::write(session_extra.join("trace.log"), b"log").unwrap();

    let result = search_workspace_files(SearchWorkspaceFilesInput {
        workspace_path: workspace.to_string_lossy().to_string(),
        query: "g".to_string(),
        limit: Some(20),
        additional_paths: None,
        session_additional_paths: Some(vec![session_extra.to_string_lossy().to_string()]),
    })
    .expect("search should succeed");

    assert!(result
        .iter()
        .any(|entry| entry.path == "docs" && entry.entry_type == "dir"));
    assert!(result
        .iter()
        .any(|entry| entry.path == "docs/guide.md" && entry.source == "workspace"));

    let session_all = search_workspace_files(SearchWorkspaceFilesInput {
        workspace_path: workspace.to_string_lossy().to_string(),
        query: "trace".to_string(),
        limit: Some(20),
        additional_paths: None,
        session_additional_paths: Some(vec![session_extra.to_string_lossy().to_string()]),
    })
    .expect("session search should succeed");
    assert!(session_all
        .iter()
        .any(|entry| entry.path.ends_with("trace.log") && entry.source == "session"));

    let _ = fs::remove_dir_all(&workspace);
    let _ = fs::remove_dir_all(&session_extra);
}
