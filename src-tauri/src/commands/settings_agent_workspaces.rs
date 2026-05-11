use crate::commands::settings::{
    load_workspaces, save_workspaces, AgentWorkspaceInfo, UpdateAgentWorkspaceInput,
};

pub(crate) fn list_agent_workspaces() -> Result<Vec<AgentWorkspaceInfo>, String> {
    Ok(load_workspaces())
}

pub(crate) fn create_agent_workspace(name: String) -> Result<AgentWorkspaceInfo, String> {
    let mut workspaces = load_workspaces();
    let slug = name.to_lowercase().replace(' ', "-");
    let id = uuid::Uuid::new_v4().to_string();
    let ws = AgentWorkspaceInfo { id, name, slug };
    workspaces.push(ws.clone());
    save_workspaces(&workspaces)?;
    Ok(ws)
}

pub(crate) fn update_agent_workspace(
    id: String,
    updates: UpdateAgentWorkspaceInput,
) -> Result<AgentWorkspaceInfo, String> {
    let trimmed_name = updates.name.trim().to_string();
    if trimmed_name.is_empty() {
        return Err("工作区名称不能为空".to_string());
    }

    let mut workspaces = load_workspaces();
    let workspace = workspaces
        .iter_mut()
        .find(|workspace| workspace.id == id)
        .ok_or_else(|| format!("工作区不存在: {}", id))?;
    workspace.name = trimmed_name;
    workspace.slug = workspace.name.to_lowercase().replace(' ', "-");
    let updated = workspace.clone();
    save_workspaces(&workspaces)?;
    Ok(updated)
}

pub(crate) fn delete_agent_workspace(id: String) -> Result<(), String> {
    let mut workspaces = load_workspaces();
    workspaces.retain(|w| w.id != id);
    save_workspaces(&workspaces)
}

pub(crate) fn reorder_agent_workspaces(
    ordered_ids: Vec<String>,
) -> Result<Vec<AgentWorkspaceInfo>, String> {
    let workspaces = load_workspaces();
    if ordered_ids.len() != workspaces.len() {
        return Err("工作区排序数量不匹配".to_string());
    }

    let mut workspace_map = workspaces
        .into_iter()
        .map(|workspace| (workspace.id.clone(), workspace))
        .collect::<std::collections::HashMap<_, _>>();
    let mut reordered = Vec::with_capacity(ordered_ids.len());
    for workspace_id in ordered_ids {
        let workspace = workspace_map
            .remove(&workspace_id)
            .ok_or_else(|| format!("未知工作区 ID: {}", workspace_id))?;
        reordered.push(workspace);
    }
    if !workspace_map.is_empty() {
        return Err("工作区排序包含未处理条目".to_string());
    }

    save_workspaces(&reordered)?;
    Ok(reordered)
}
