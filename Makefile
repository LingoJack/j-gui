SHELL := /bin/bash

# ============================================
# 变量定义
# ============================================
VERSION := $(shell grep '^version' src-tauri/Cargo.toml 2>/dev/null | head -1 | sed 's/.*"\(.*\)".*/\1/' || echo "0.0.0")
GIT_BRANCH := $(shell git rev-parse --abbrev-ref HEAD)

# ============================================
# 伪目标声明
# ============================================
.PHONY: current_dir push pull clean

# ============================================
# 目录信息
# ============================================
current_dir: ## 显示当前目录信息
	@echo "当前目录信息:"
	@echo "======================================"
	@echo "目录: $$(pwd)"
	@echo "版本: $(VERSION)"
	@echo "分支: $(GIT_BRANCH)"
	@echo "======================================"

# ============================================
# Git 操作
# ============================================
push: current_dir ## 提交并推送代码
	@echo "推送代码到远程仓库..."
	@git add .\
	&& (git commit -m "更新: $(shell date +'%Y-%m-%d %H:%M:%S')" || exit 0) \
	&& git push origin $(GIT_BRANCH)
	@echo "代码已推送"

pull: current_dir ## 拉取最新代码
	@echo "拉取最新代码..."
	@git pull origin $(GIT_BRANCH)
	@echo "代码已更新"

# ============================================
# 清理
# ============================================
clean: ## 清理构建产物
	@echo "清理构建产物..."
	@cargo clean --manifest-path src-tauri/Cargo.toml 2>/dev/null || cargo clean
	@echo "清理完成"
