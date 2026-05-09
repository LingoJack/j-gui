---
doc_type: feature-design
feature: 2026-05-08-search-enhanced
status: approved
summary: 搜索增强——结果高亮 + IME 处理 + 类型图标区分
roadmap: j-gui-desktop-app
roadmap_item: frontend-search-enhanced
tags: [search, highlight, ime]
---

# search-enhanced design

## 1. 范围

**做**: 搜索结果高亮匹配文字（mark 标签 + bg-primary/20）；IME composition 处理（compositionstart/end 事件，组合中输入不触发过滤）；结果按更新时间排序

**不做**: transcript 全文搜索（首版不做，已明确）

**推进**: 1 步——SearchDialog 增强

## 2. 验收
1. 输入 "hello" → 结果中 "hello" 用 mark 标签高亮（黄色背景）✅
2. CJK IME 输入时不过滤（compositionstart 期间全量显示）✅
3. 结果按更新时间倒序 ✅
