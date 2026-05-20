SHELL := /bin/bash

# ============================================
# 变量定义
# ============================================
REPO := LingoJack/jgui
VERSION := $(shell grep '"version"' package.json | head -1 | sed 's/.*"\(.*\)".*/\1/')
RUST_VERSION := $(shell grep '^version' src-tauri/Cargo.toml | head -1 | sed 's/.*"\(.*\)".*/\1/')
GIT_BRANCH := $(shell git rev-parse --abbrev-ref HEAD)
CARGO_MANIFEST := src-tauri/Cargo.toml

# ============================================
# 伪目标声明
# ============================================
.PHONY: help \
        current_dir push push-non-ai commit pull status \
        dev dev-frontend build build-frontend build-rust \
        test test-frontend test-rust test-all \
        fmt fmt-rust fmt-frontend \
        lint lint-fix check clippy check-lint \
        clean clean-all clean-rust clean-frontend \
        setup \
        pre-commit \
        deps update-deps

# ============================================
# 帮助信息
# ============================================
help: ## 显示此帮助信息
	@echo "j-gui 官方入口: make <target>"
	@echo "============================================"
	@echo "版本: $(VERSION) | Rust: $(RUST_VERSION) | 分支: $(GIT_BRANCH)"
	@echo "============================================"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "常用命令:"
	@echo "  make dev          # 启动开发环境"
	@echo "  make dev-frontend # 启动前端开发环境"
	@echo "  make build        # 构建生产版本"
	@echo "  make check-lint   # 运行完整合规性检查"
	@echo "  make test         # 运行全部测试"
	@echo "  make setup        # 首次安装依赖 + Git Hooks"

check-shell:
	@command -v bash >/dev/null 2>&1 || { echo "请在 Git Bash / bash 中运行 make"; exit 1; }

# ============================================
# 目录和 Git 操作
# ============================================
current_dir: ## 显示当前目录信息
	@echo "当前目录信息:"
	@echo "======================================"
	@echo "目录: $$(pwd)"
	@echo "版本: $(VERSION)"
	@echo "Rust 版本: $(RUST_VERSION)"
	@echo "分支: $(GIT_BRANCH)"
	@echo "======================================"

push: current_dir fmt ## AI 生成 commit message 并推送
	@echo "AI 生成变更说明..."
	@diff_stat="$$(git diff --stat 2>/dev/null)"; \
	if [ -z "$$diff_stat" ]; then \
		diff_stat="$$(git diff --cached --stat 2>/dev/null)"; \
	fi; \
	if [ -z "$$diff_stat" ]; then \
		echo "没有检测到本地变更，直接 push 已有 commits..."; \
		git push origin $(GIT_BRANCH); \
		echo "已 push"; \
		exit 0; \
	fi; \
	prompt_file=$$(mktemp); \
	stat_file=$$(mktemp); \
	diff_file=$$(mktemp); \
	trap 'rm -f "$$prompt_file" "$$stat_file" "$$diff_file"' EXIT; \
	printf '%s\n' "$$diff_stat" > "$$stat_file"; \
	(git diff 2>/dev/null || git diff --cached 2>/dev/null) | head -200 > "$$diff_file"; \
	awk -v stat_file="$$stat_file" -v diff_file="$$diff_file" '\
		/\{\{diff_stat\}\}/ { while ((getline l < stat_file) > 0) print l; close(stat_file); next } \
		/\{\{diff\}\}/      { while ((getline l < diff_file) > 0) print l; close(diff_file); next } \
		{ print }' prompts/commit-message.md > "$$prompt_file"; \
	ai_out=$$(mktemp); \
	j ai --bypass --no-render -- "$$(cat "$$prompt_file")" > "$$ai_out" 2>/dev/null; \
	echo ""; \
	echo "AI 原始输出:"; \
	echo "----------------------------------------"; \
	cat "$$ai_out"; \
	echo "----------------------------------------"; \
	msg=$$(perl -0777 -pe 's/<\s*\/\s*result\s*>/<\/result>/g' "$$ai_out" | awk '/<result>/{in_r=1;gsub(/.*<result>/,"")}/<\/result>/{gsub(/<\/result>.*/,"");in_r=0;print;next}in_r{print}'); \
	rm -f "$$ai_out"; \
	if [ -z "$$msg" ]; then msg="更新: $$(date +'%Y-%m-%d %H:%M:%S')"; fi; \
	git add . && git commit -m "$$msg" && git push origin $(GIT_BRANCH); \
	echo "已推送: $$msg"

push-non-ai: current_dir fmt ## 提交并推送代码（手动 commit message）
	@echo "推送代码到远程仓库..."
	@git add .\
	&& (git commit -m "更新: $$(date +'%Y-%m-%d %H:%M:%S')" || exit 0) \
	&& git push origin $(GIT_BRANCH)
	@echo "代码已推送"

commit: current_dir fmt ## AI 生成 commit message 并提交（不推送）
	@echo "AI 生成变更说明..."
	@diff_stat="$$(git diff --stat 2>/dev/null)"; \
	if [ -z "$$diff_stat" ]; then \
		diff_stat="$$(git diff --cached --stat 2>/dev/null)"; \
	fi; \
	if [ -z "$$diff_stat" ]; then \
		echo "没有检测到变更，无需提交"; \
		exit 0; \
	fi; \
	prompt_file=$$(mktemp); \
	stat_file=$$(mktemp); \
	diff_file=$$(mktemp); \
	trap 'rm -f "$$prompt_file" "$$stat_file" "$$diff_file"' EXIT; \
	printf '%s\n' "$$diff_stat" > "$$stat_file"; \
	(git diff 2>/dev/null || git diff --cached 2>/dev/null) | head -200 > "$$diff_file"; \
	awk -v stat_file="$$stat_file" -v diff_file="$$diff_file" '\
		/\{\{diff_stat\}\}/ { while ((getline l < stat_file) > 0) print l; close(stat_file); next } \
		/\{\{diff\}\}/      { while ((getline l < diff_file) > 0) print l; close(diff_file); next } \
		{ print }' prompts/commit-message.md > "$$prompt_file"; \
	ai_out=$$(mktemp); \
	j ai --bypass --no-render -- "$$(cat "$$prompt_file")" > "$$ai_out" 2>/dev/null; \
	echo ""; \
	echo "AI 原始输出:"; \
	echo "----------------------------------------"; \
	cat "$$ai_out"; \
	echo "----------------------------------------"; \
	msg=$$(perl -0777 -pe 's/<\s*\/\s*result\s*>/<\/result>/g' "$$ai_out" | awk '/<result>/{in_r=1;gsub(/.*<result>/,"")}/<\/result>/{gsub(/<\/result>.*/,"");in_r=0;print;next}in_r{print}'); \
	rm -f "$$ai_out"; \
	if [ -z "$$msg" ]; then msg="更新: $$(date +'%Y-%m-%d %H:%M:%S')"; fi; \
	git add . && git commit -m "$$msg"; \
	echo "已提交: $$msg"

pull: current_dir ## 拉取最新代码
	@echo "拉取最新代码..."
	@git pull origin $(GIT_BRANCH)
	@echo "代码已更新"

status: current_dir ## 查看 Git 状态
	@git status

# ============================================
# 初始化与依赖
# ============================================
setup: check-shell ## 首次安装依赖 + 设置 Git Hooks
	@echo "安装前端依赖..."
	@bun install
	@echo "设置 Git Hooks..."
	@git config core.hooksPath .githooks
	@echo "安装完成。运行 'make dev' 启动开发环境"

deps: ## 安装前端依赖
	@echo "安装前端依赖..."
	@bun install
	@echo "依赖安装完成"

update-deps: ## 更新依赖
	@echo "更新前端依赖..."
	@bun update
	@echo "更新 Rust 依赖..."
	@cargo update --manifest-path $(CARGO_MANIFEST)
	@echo "依赖更新完成"

# ============================================
# 开发与构建
# ============================================
dev: check-shell ## 启动 Tauri 开发环境（前端 + Rust 热重载）
	@echo "启动 Tauri 开发环境..."
	@bun run tauri dev

dev-frontend: check-shell ## 启动前端开发环境
	@echo "启动前端开发环境..."
	@bun run dev

build: check-shell build-frontend build-rust ## 构建生产版本（前端 + Rust）
	@echo "生产版本构建完成"

build-frontend: check-shell ## 构建前端
	@echo "构建前端..."
	@bun run build
	@echo "前端构建完成"

build-rust: check-shell ## 构建 Rust 后端（release）
	@echo "构建 Rust 后端 (release)..."
	@cargo build --manifest-path $(CARGO_MANIFEST) --release
	@echo "Rust 后端构建完成"

# ============================================
# 测试
# ============================================
test: check-shell test-frontend test-rust ## 运行全部测试
	@echo "全部测试完成"

test-frontend: check-shell ## 运行前端测试
	@echo "运行前端测试..."
	@bun run test
	@echo "前端测试完成"

test-rust: check-shell ## 运行 Rust 测试
	@echo "运行 Rust 测试..."
	@cargo test --manifest-path $(CARGO_MANIFEST)
	@echo "Rust 测试完成"

test-all: check-shell ## 运行所有测试（含 Rust 全特性）
	@echo "运行全部测试（含全特性）..."
	@bun run test
	@cargo test --manifest-path $(CARGO_MANIFEST) --all-features
	@echo "全部测试完成"

# ============================================
# 代码质量
# ============================================
fmt: check-shell fmt-rust fmt-frontend ## 格式化全部代码
	@echo "代码格式化完成"

fmt-rust: check-shell ## 格式化 Rust 代码
	@echo "格式化 Rust 代码..."
	@cargo fmt --manifest-path $(CARGO_MANIFEST)
	@echo "Rust 代码格式化完成"

fmt-frontend: ## 格式化前端代码（暂无自动格式化，预留）
	@echo "前端代码格式化（暂无自动格式化工具，跳过）"

lint: check-shell ## 运行 clippy 检查
	@echo "运行 clippy 检查..."
	@cargo clippy --manifest-path $(CARGO_MANIFEST) -- -D warnings
	@echo "clippy 检查完成"

lint-fix: check-shell ## 运行合规性检查并自动修复
	@bash scripts/check_lint.sh --fix

check: check-shell ## 检查 Rust 代码（不构建）
	@echo "检查 Rust 代码..."
	@cargo check --manifest-path $(CARGO_MANIFEST)
	@echo "代码检查完成"

clippy: lint ## clippy 别名

check-lint: check-shell ## 运行完整合规性检查脚本
	@bash scripts/check_lint.sh

pre-commit: fmt lint test ## 提交前检查
	@echo "所有检查通过，可以提交"

# ============================================
# 清理
# ============================================
clean: clean-rust clean-frontend ## 清理全部构建产物
	@echo "全部清理完成"

clean-rust: ## 清理 Rust 构建产物
	@echo "清理 Rust 构建产物..."
	@cargo clean --manifest-path $(CARGO_MANIFEST)
	@echo "Rust 构建产物已清理"

clean-frontend: ## 清理前端构建产物
	@echo "清理前端构建产物..."
	@rm -rf dist node_modules/.cache
	@echo "前端构建产物已清理"

clean-all: clean ## 清理全部（含 node_modules）
	@echo "清理 node_modules..."
	@rm -rf node_modules
	@rm -rf packages/*/node_modules
	@echo "全部清理完成"
