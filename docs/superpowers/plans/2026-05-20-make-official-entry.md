# Makefile 作为唯一官方入口的迁移计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让仓库对外唯一推荐的入口变成 `make`，同时保留 Bun 作为底层依赖管理和脚本执行器。

**架构：** Makefile 负责入口编排，内部继续调用现有 `bun`、`cargo` 和 `bash` 命令；README、AGENTS、CLAUDE、CI 和 Git hooks 统一改成 `make`；`package.json` 的脚本只保留为兼容别名，不再作为官方文档入口。

**技术栈：** GNU Make、Bash、Bun、GitHub Actions、Rust、TypeScript

---

### 任务 1：收敛文档入口

**文件：**
- 修改：`README.md`
- 修改：`AGENTS.md`
- 修改：`CLAUDE.md`
- 修改：`.codestable/attention.md`

- [ ] **步骤 1：定位仍在对外推荐 Bun 的入口文案**

```bash
rg -n "bun install|bun run tauri dev|bun run test|bun run setup:git-hooks|bash scripts/check_lint.sh" README.md AGENTS.md CLAUDE.md .codestable/attention.md
```

预期：能找到当前的官方入口表述，作为后续替换目标。

- [ ] **步骤 2：把快速开始和运行指引切换到 `make`**

```md
# 安装依赖
make setup

# 启动开发环境
make dev

# 运行默认门禁
make check-lint

# 运行测试
make test

# 构建
make build
```

预期：文档里只把 `make` 作为对外入口，Bun 仅保留为底层实现细节或依赖说明。

- [ ] **步骤 3：写回仓库约定**

```md
- Windows 上运行 `make` 时必须使用 Git Bash。
- `make` 是唯一官方入口。
- `bun` 仍保留在底层，用于 Makefile 内部调用和前端依赖管理。
```

预期：AGENTS/CLAUDE/attention 的叙述一致，不再把 `bun run ...` 写成首选入口。

- [ ] **步骤 4：回查是否还有官方入口残留**

```bash
rg -n "bun install|bun run tauri dev|bun run test|bun run setup:git-hooks" README.md AGENTS.md CLAUDE.md .codestable/attention.md
```

预期：只剩下底层实现说明，不再出现在“如何开发 / 如何构建 / 如何测试”的官方入口段落里。

- [ ] **步骤 5：提交文档改动**

```bash
git add README.md AGENTS.md CLAUDE.md .codestable/attention.md
git commit -m "docs(j-gui): 统一官方入口为 make"
```

---

### 任务 2：把脚本脚手架收口到 Makefile

**文件：**
- 修改：`Makefile`
- 修改：`package.json`

- [ ] **步骤 1：把常用脚本改成 `make` 代理**

```json
{
  "scripts": {
    "dev": "make dev",
    "build": "make build",
    "test": "make test",
    "lint": "make check-lint",
    "lint:fix": "make lint-fix",
    "setup:git-hooks": "make setup"
  }
}
```

预期：即使有人还在敲 `bun run ...`，实际也会落到 `make`，官方入口只有一层。

- [ ] **步骤 2：让 Makefile 明确自己是 Canonical 入口**

```make
help: ## 显示此帮助信息
	@echo "j-gui 官方入口：make <target>"
```

预期：`make help` 会直接告诉使用者仓库入口是 `make`，不是 `bun run`。

- [ ] **步骤 3：补一个 Bash 运行时检查**

```make
check-shell:
	@command -v bash >/dev/null 2>&1 || { echo "请在 Git Bash / bash 中运行 make"; exit 1; }
```

预期：Windows 上如果不是 Git Bash，会给出明确错误，不让 Makefile 假装自己能兼容 PowerShell 语义。

- [ ] **步骤 4：把入口目标挂到同一套检查上**

```make
dev: check-shell
build: check-shell
test: check-shell
check-lint: check-shell
setup: check-shell
```

预期：所有对外入口都走同一条 Bash 约束路径，不再出现一半入口用 make、一半入口绕回 bun 的分裂状态。

- [ ] **步骤 5：验证代理层没有引入行为漂移**

```bash
make -n help
make -n dev
make -n check-lint
```

预期：输出仍然只展开为现有的 bun/cargo/bash 组合命令，没有新增重复逻辑。

- [ ] **步骤 6：提交脚本收口改动**

```bash
git add Makefile package.json
git commit -m "refactor(j-gui): 收口脚本入口到 make"
```

---

### 任务 3：把 hooks 和 CI 切到 make

**文件：**
- 修改：`.githooks/pre-push`
- 修改：`.github/workflows/desktop-ci.yml`

- [ ] **步骤 1：把 pre-push 门禁切到 `make check-lint`**

```bash
echo "[j-gui pre-push] 运行默认门禁: make check-lint"
make check-lint
```

预期：Git push 前的门禁入口只剩 `make`，不再要求开发者记住 `bash scripts/check_lint.sh`。

- [ ] **步骤 2：把 CI 的默认门禁改成 `make check-lint`**

```yaml
- name: Run default gate
  env:
    CHECK_COMMIT_REF: ${{ github.event_name == 'pull_request' && 'refs/remotes/origin/pr-head' || 'HEAD' }}
  run: make check-lint
```

预期：CI 对外展示的门禁入口和本地一致，都是 `make`。

- [ ] **步骤 3：把构建步骤切成 `make build`**

```yaml
- name: Build Tauri desktop bundle
  run: make build
```

预期：CI 的构建入口不再直接引用 `bun run tauri build`，但仍然保留 Bun 作为 Makefile 内部执行器。

- [ ] **步骤 4：保留 Bun 安装步骤但降级为底层依赖准备**

```yaml
- name: Install frontend dependencies
  run: bun install --frozen-lockfile
```

预期：CI 仍然装 Bun，因为它是底层工具链的一部分，不是官方入口。

- [ ] **步骤 5：验证 CI / hook 文案不再推荐 Bun 作为入口**

```bash
rg -n "bun run tauri dev|bun run test|bash scripts/check_lint.sh" .githooks/pre-push .github/workflows/desktop-ci.yml
```

预期：这些文件里只保留必要的底层调用，不再把 Bun 或脚本门禁写成对外入口。

- [ ] **步骤 6：提交 hooks 与 CI 改动**

```bash
git add .githooks/pre-push .github/workflows/desktop-ci.yml
git commit -m "ci(j-gui): 统一门禁入口为 make"
```

---

### 任务 4：做最终回归校验并清理残留入口

**文件：**
- 修改：`README.md`
- 修改：`AGENTS.md`
- 修改：`CLAUDE.md`
- 修改：`.codestable/attention.md`
- 修改：`package.json`
- 修改：`Makefile`
- 修改：`.githooks/pre-push`
- 修改：`.github/workflows/desktop-ci.yml`

- [ ] **步骤 1：全局搜索官方入口残留**

```bash
rg -n "bun install|bun run tauri dev|bun run test|bun run setup:git-hooks|bash scripts/check_lint.sh" README.md AGENTS.md CLAUDE.md .codestable/attention.md package.json Makefile .githooks/pre-push .github/workflows/desktop-ci.yml
```

预期：只剩下 Makefile 内部实现、底层依赖准备和门禁脚本本身，不再有“官方入口”的旧表述。

- [ ] **步骤 2：运行 `make` 官方入口自检**

```bash
make help
make check-lint
```

预期：`make help` 能正确列出入口；`make check-lint` 成功，并且行为等价于当前仓库默认门禁。

- [ ] **步骤 3：保留底层脚本回归**

```bash
bash scripts/check_lint.sh
```

预期：底层门禁本身仍然正常，证明“入口迁移”没有破坏现有 gate。

- [ ] **步骤 4：记录结论并提交最终整理**

```bash
git add README.md AGENTS.md CLAUDE.md .codestable/attention.md package.json Makefile .githooks/pre-push .github/workflows/desktop-ci.yml
git commit -m "docs(j-gui): 完成 make 官方入口迁移"
```

---

**验收标准：**
- 对外文档只推荐 `make`。
- `package.json` 脚本可以继续存在，但只作为 `make` 代理。
- Windows 只要求 Git Bash，不承诺 PowerShell 直跑。
- `make check-lint`、`make test`、`make dev`、`make build` 都能覆盖原有入口。
