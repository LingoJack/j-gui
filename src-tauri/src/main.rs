// 防止 Windows 发布版构建额外弹出控制台窗口，不要删除。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    j_gui_lib::run()
}
