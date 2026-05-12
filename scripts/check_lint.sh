#!/usr/bin/env bash
# =============================================================================
# j-gui 代码合规性检查脚本
# 用法: bash scripts/check_lint.sh [--fix]
#   --fix  自动执行 cargo fmt（默认仅报告）
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUST_SRC_DIR="$PROJECT_ROOT/src-tauri/src"
CARGO_MANIFEST="$PROJECT_ROOT/src-tauri/Cargo.toml"
JCLI_ADAPTER_FILE="$RUST_SRC_DIR/kernel/adapter.rs"

# ── 阈值配置 ──────────────────────────────────────────────────────────────────
MAX_FILE_LINES=600          # 单文件超过此值 WARN
HARD_MAX_FILE_LINES=1000    # 单文件超过此值 FAIL
MAX_FUNCTION_LINES=80       # 单函数超过此值 WARN
MAX_FUNCTION_PARAMS=4       # 函数参数超过此值 WARN

# ── 颜色 ──────────────────────────────────────────────────────────────────────
C_PASS='\033[32m'; C_WARN='\033[33m'; C_FAIL='\033[31m'
C_INFO='\033[36m'; C_BOLD='\033[1m';  C_DIM='\033[2m'; C_RST='\033[0m'

DO_FIX=false
[[ "${1:-}" == "--fix" ]] && DO_FIX=true

# ── 计数器 ────────────────────────────────────────────────────────────────────
FIXED_CHECK_GROUPS=16
N_TOTAL=0; N_PASS=0; N_WARN=0; N_FAIL=0

pass()  { ((N_PASS++))  || true; ((N_TOTAL++)) || true; printf "  ${C_PASS}PASS${C_RST} %s\n" "$*"; }
warn()  { ((N_WARN++))  || true; ((N_TOTAL++)) || true; printf "  ${C_WARN}WARN${C_RST} %s\n" "$*"; }
fail()  { ((N_FAIL++))  || true; ((N_TOTAL++)) || true; printf "  ${C_FAIL}FAIL${C_RST} %s\n" "$*"; }
info()  { printf "  ${C_INFO}INFO${C_RST} %s\n" "$*"; }
hdr()   { printf "\n${C_BOLD}%s${C_RST}\n" "$*"; }

# ── 辅助：查找全部 .rs 源文件 ────────────────────────────────────────────────
all_rs() { find "$RUST_SRC_DIR" -name '*.rs' -not -path '*/target/*'; }

is_test_file() {
    [[ "$1" == */tests/* ]]
}

resolve_bin() {
    local name="$1"
    local path=""
    path="$(command -v "$name" 2>/dev/null || true)"
    if [[ -z "$path" && "$name" != *.exe ]]; then
        path="$(command -v "${name}.exe" 2>/dev/null || true)"
    fi
    if [[ -z "$path" && -x /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe ]]; then
        path="$(/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -Command "(Get-Command ${name}.exe -ErrorAction SilentlyContinue).Path" 2>/dev/null | tr -d '\r' | tail -n 1)"
    fi
    printf '%s' "$path"
}

to_host_path() {
    local path="$1"
    if [[ "$path" == /mnt/* ]] && command -v wslpath >/dev/null 2>&1; then
        wslpath -w "$path"
    elif command -v cygpath >/dev/null 2>&1; then
        cygpath -w "$path"
    else
        printf '%s' "$path"
    fi
}

CARGO_BIN="$(resolve_bin cargo)"
BUN_BIN="$(resolve_bin bun)"
CARGO_MANIFEST_NATIVE="$(to_host_path "$CARGO_MANIFEST")"

run_ts_check() {
    local dir="$1"
    local label="$2"
    if (
        cd "$dir"
        "$BUN_BIN" run typecheck
    ) 2>&1; then
        pass "$label 类型检查通过"
    else
        fail "$label 类型检查存在错误"
    fi
}

run_root_ts_check() {
    if "$BUN_BIN" x tsc --noEmit 2>&1; then
        pass "root 类型检查通过"
    else
        fail "root 类型检查存在错误"
    fi
}

# =============================================================================
# 1. cargo fmt 格式检查
# =============================================================================
hdr "=== 1. Rust 代码格式 (cargo fmt) ==="
if $DO_FIX; then
    "$CARGO_BIN" fmt --manifest-path "$CARGO_MANIFEST_NATIVE"
    pass "cargo fmt — 已自动格式化"
else
    if "$CARGO_BIN" fmt --manifest-path "$CARGO_MANIFEST_NATIVE" -- --check 2>/dev/null; then
        pass "cargo fmt 检查通过"
    else
        fail "cargo fmt 未通过，运行 'cargo fmt' 或 'bash scripts/check_lint.sh --fix'"
    fi
fi

# =============================================================================
# 2. cargo clippy 静态分析
# =============================================================================
hdr "=== 2. Clippy 静态分析 (-D warnings) ==="
if "$CARGO_BIN" clippy --manifest-path "$CARGO_MANIFEST_NATIVE" -- -D warnings 2>&1; then
    pass "clippy 零告警"
else
    fail "clippy 存在告警，详见上方输出"
fi

# =============================================================================
# 3. TypeScript 类型检查
# =============================================================================
hdr "=== 3. TypeScript 类型检查 (root + workspaces) ==="
if [[ -n "$BUN_BIN" ]]; then
    run_root_ts_check
    run_ts_check "$PROJECT_ROOT/packages/core" "packages/core"
    run_ts_check "$PROJECT_ROOT/packages/shared" "packages/shared"
    run_ts_check "$PROJECT_ROOT/packages/ui" "packages/ui"
else
    warn "bun 未找到，跳过 TypeScript 类型检查"
fi

# =============================================================================
# 4. j_cli:: 单入口约束
# =============================================================================
hdr "=== 4. j_cli:: 导入边界 (仅允许 src-tauri/src/kernel/adapter.rs) ==="
jcli_import_violation=0
while IFS= read -r f; do
    [[ "$f" == "$JCLI_ADAPTER_FILE" ]] && continue
    rel="${f#$PROJECT_ROOT/}"
    hits=$(grep -n 'j_cli::' "$f" 2>/dev/null || true)
    if [[ -n "$hits" ]]; then
        fail "$rel — 发现越界 j_cli:: 导入，必须收敛回 kernel/adapter.rs:"
        echo "$hits" | sed 's/^/      /'
        ((jcli_import_violation++)) || true
    fi
done < <(all_rs)
if (( jcli_import_violation == 0 )); then
    pass "j_cli:: 导入边界合规"
fi

# =============================================================================
# 5. 前端测试
# =============================================================================
hdr "=== 5. 前端测试 (bun run test) ==="
frontend_test_log="$(mktemp)"
if "$BUN_BIN" run test >"$frontend_test_log" 2>&1; then
    pass "前端测试全部通过"
else
    cat "$frontend_test_log"
    fail "前端测试存在失败"
fi
rm -f "$frontend_test_log"

# =============================================================================
# 6. Rust 测试
# =============================================================================
hdr "=== 6. Rust 测试 (cargo test) ==="
runs_test_log="$(mktemp)"
if "$CARGO_BIN" test --manifest-path "$CARGO_MANIFEST_NATIVE" >"$runs_test_log" 2>&1; then
    pass "Rust 测试全部通过"
else
    cat "$runs_test_log"
    fail "Rust 测试存在失败"
fi
rm -f "$runs_test_log"

# =============================================================================
# 7. 单文件行数
# =============================================================================
hdr "=== 7. 单文件行数 (WARN > $MAX_FILE_LINES | FAIL >= $HARD_MAX_FILE_LINES) ==="
oversized=0
while IFS= read -r f; do
    lines=$(wc -l < "$f")
    rel="${f#$PROJECT_ROOT/}"
    if (( lines >= HARD_MAX_FILE_LINES )); then
        fail "$rel — ${lines} 行 (>= ${HARD_MAX_FILE_LINES})"
        ((oversized++)) || true
    elif (( lines > MAX_FILE_LINES )); then
        warn "$rel — ${lines} 行 (> ${MAX_FILE_LINES})"
        ((oversized++)) || true
    fi
done < <(all_rs)
if (( oversized == 0 )); then
    pass "所有文件 <= ${MAX_FILE_LINES} 行"
fi

# =============================================================================
# 8. 单函数行数
# =============================================================================
hdr "=== 8. 单函数行数 (> $MAX_FUNCTION_LINES 行 → WARN) ==="
fn_warn=0
while IFS= read -r f; do
    if is_test_file "$f"; then
        continue
    fi
    rel="${f#$PROJECT_ROOT/}"
    result=$(awk -v file="$rel" -v max="$MAX_FUNCTION_LINES" '
    function brace_delta(line,   chars, i, c, delta) {
        chars = line
        gsub(/[^\{\}]/, "", chars)
        delta = 0
        for (i = 1; i <= length(chars); i++) {
            c = substr(chars, i, 1)
            if (c == "{") delta++
            else if (c == "}") delta--
        }
        return delta
    }

    /^[[:space:]]*#\[cfg\(test\)\]/ {
        pending_test_attr = 1
        next
    }

    /^[[:space:]]*#\[tauri::command\]/ {
        pending_tauri_attr = 1
        next
    }

    pending_test_attr && /^[[:space:]]*mod[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]*\{/ {
        in_test = 1
        test_depth = brace_delta($0)
        pending_test_attr = 0
        pending_tauri_attr = 0
        next
    }

    pending_test_attr && /^[[:space:]]*mod[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]*;/ {
        pending_test_attr = 0
        pending_tauri_attr = 0
        next
    }

    in_test {
        test_depth += brace_delta($0)
        if (test_depth <= 0) {
            in_test = 0
            test_depth = 0
        }
        next
    }

    {
        pending_test_attr = 0
    }

    /^[[:space:]]*(pub\s+)?(async\s+)?fn\s+[a-zA-Z_]/ && !/test/ {
        start = NR
        name = $0
        sub(/^[[:space:]]+/, "", name)
        sub(/\{.*$/, "", name)
        depth = 0; opened = 0
        do {
            line = $0
            gsub(/[^\{\}]/, "", line)
            for (i = 1; i <= length(line); i++) {
                c = substr(line, i, 1)
                if (c == "{") { depth++; opened = 1 }
                if (c == "}") { depth-- }
            }
            if (opened && depth <= 0) {
                len = NR - start + 1
                if (len > max) printf "  WARN %s — %s (%d 行)\n", file, name, len
                next
            }
        } while (getline > 0)
    }
    ' "$f")
    if [[ -n "$result" ]]; then
        echo "$result"
        ((fn_warn++)) || true
    fi
done < <(all_rs)
if (( fn_warn == 0 )); then
    pass "所有函数 <= ${MAX_FUNCTION_LINES} 行"
else
    ((N_WARN+=fn_warn)) || true
    ((N_TOTAL+=fn_warn)) || true
fi

# =============================================================================
# 9. 函数参数数量
# =============================================================================
hdr "=== 9. 函数参数数量 (> $MAX_FUNCTION_PARAMS → WARN) ==="
param_warn=0
while IFS= read -r f; do
    if is_test_file "$f"; then
        continue
    fi
    rel="${f#$PROJECT_ROOT/}"
    result=$(awk -v file="$rel" -v max="$MAX_FUNCTION_PARAMS" '
    function brace_delta(line,   chars, i, c, delta) {
        chars = line
        gsub(/[^\{\}]/, "", chars)
        delta = 0
        for (i = 1; i <= length(chars); i++) {
            c = substr(chars, i, 1)
            if (c == "{") delta++
            else if (c == "}") delta--
        }
        return delta
    }

    /^[[:space:]]*#\[cfg\(test\)\]/ {
        pending_test_attr = 1
        next
    }

    pending_test_attr && /^[[:space:]]*mod[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]*\{/ {
        in_test = 1
        test_depth = brace_delta($0)
        pending_test_attr = 0
        next
    }

    pending_test_attr && /^[[:space:]]*mod[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]*;/ {
        pending_test_attr = 0
        next
    }

    in_test {
        test_depth += brace_delta($0)
        if (test_depth <= 0) {
            in_test = 0
            test_depth = 0
        }
        next
    }

    /^[[:space:]]*(pub([[:space:]]|\([^)]*\)[[:space:]])+)?(async[[:space:]]+)?fn[[:space:]]+\w+/ {
        sig = $0
        while (index(sig, ")") == 0 && getline > 0) sig = sig " " $0
        if (sig ~ /;[[:space:]]*$/) next
        lparen = index(sig, "(")
        rparen = index(sig, ")")
        if (lparen > 0 && rparen > lparen) {
            params = substr(sig, lparen + 1, rparen - lparen - 1)
            gsub(/[[:space:]]+/, " ", params)
            if (length(params) == 0) next
            n = 0; depth = 0; current = ""
            for (i = 1; i <= length(params); i++) {
                c = substr(params, i, 1)
                if (c == "<" || c == "[" || c == "(") depth++
                if (c == ">" || c == "]" || c == ")") depth--
                if (c == "," && depth == 0) {
                    if (current !~ /^[[:space:]]*$/) {
                        gsub(/^[[:space:]]+|[[:space:]]+$/, "", current)
                        if (current !~ /^(&[[:space:]]*mut[[:space:]]+self|&[[:space:]]*self|self)$/ && current !~ /Fn(Mut|Once)?[[:space:]]*\(/) n++
                    }
                    current = ""
                    continue
                }
                current = current c
            }
            if (current !~ /^[[:space:]]*$/) {
                gsub(/^[[:space:]]+|[[:space:]]+$/, "", current)
                if (current !~ /^(&[[:space:]]*mut[[:space:]]+self|&[[:space:]]*self|self)$/ && current !~ /Fn(Mut|Once)?[[:space:]]*\(/) n++
            }
            if (n > max) {
                line_copy = $0; sub(/^[[:space:]]+/, "", line_copy); sub(/\{.*$/, "", line_copy)
                printf "  WARN %s:%d — %s (%d 个参数)\n", file, NR, line_copy, n
            }
        }
        pending_tauri_attr = 0
        next
    }

    {
        pending_test_attr = 0
        if ($0 !~ /^[[:space:]]*#\[/) pending_tauri_attr = 0
    }
    ' "$f")
    if [[ -n "$result" ]]; then
        echo "$result"
        ((param_warn++)) || true
    fi
done < <(all_rs)
if (( param_warn == 0 )); then
    pass "所有函数参数 <= ${MAX_FUNCTION_PARAMS} 个"
else
    ((N_WARN+=param_warn)) || true
    ((N_TOTAL+=param_warn)) || true
fi

# =============================================================================
# 10. unwrap/expect 使用（非测试代码）
# =============================================================================
hdr "=== 10. unwrap/expect 使用 (非 test 代码应避免) ==="
unwrap_warn=0
while IFS= read -r f; do
    if [[ "$f" == */tests/* ]]; then
        continue
    fi
    rel="${f#$PROJECT_ROOT/}"
    hits=$(awk '
    function brace_delta(line,   chars, i, c, delta) {
        chars = line
        gsub(/[^\{\}]/, "", chars)
        delta = 0
        for (i = 1; i <= length(chars); i++) {
            c = substr(chars, i, 1)
            if (c == "{") delta++
            else if (c == "}") delta--
        }
        return delta
    }

    /^[[:space:]]*#\[cfg\(test\)\]/ {
        pending_test_attr = 1
        next
    }

    pending_test_attr && /^[[:space:]]*mod[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]*\{/ {
        in_test = 1
        test_depth = brace_delta($0)
        pending_test_attr = 0
        next
    }

    pending_test_attr && /^[[:space:]]*mod[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]*;/ {
        pending_test_attr = 0
        next
    }

    in_test {
        test_depth += brace_delta($0)
        if (test_depth <= 0) {
            in_test = 0
            test_depth = 0
        }
        next
    }

    {
        pending_test_attr = 0
    }

    /\.unwrap\(\)/ || /\.expect\(/ {
        if (/Mutex::lock\(\)\.unwrap\(\)/ || /RwLock::.*\.unwrap\(\)/) next
        printf "      %d: %s\n", NR, $0
    }
    ' "$f")
    if [[ -n "$hits" ]]; then
        warn "$rel:"
        echo "$hits"
        ((unwrap_warn++)) || true
    fi
done < <(all_rs)
if (( unwrap_warn == 0 )); then
    pass "非 test 代码未发现 unwrap/expect"
fi

# =============================================================================
# 11. mod.rs 检查
# =============================================================================
hdr "=== 11. mod.rs 检查 (严格禁止 — 必须使用 name.rs + name/ 模式) ==="
mod_rs_found=false
while IFS= read -r f; do
    rel="${f#$PROJECT_ROOT/}"
    fail "发现 mod.rs: $rel — 必须改为 name.rs + name/ 子目录模式"
    mod_rs_found=true
done < <(find "$RUST_SRC_DIR" -name 'mod.rs')
if ! $mod_rs_found; then
    pass "未发现 mod.rs 文件，模块组织合规"
fi

# =============================================================================
# 12. super::super:: 过度层级引用检查
# =============================================================================
hdr "=== 12. super::super:: 过度层级引用 ==="
super_warn=0
while IFS= read -r f; do
    rel="${f#$PROJECT_ROOT/}"
    hits=$(grep -n 'super::super::' "$f" 2>/dev/null || true)
    if [[ -n "$hits" ]]; then
        warn "$rel — 发现 super::super:: 引用，应通过 use 导入简化:"
        echo "$hits" | sed 's/^/      /'
        ((super_warn++)) || true
    fi
done < <(all_rs)
if (( super_warn == 0 )); then
    pass "未发现 super::super:: 过度层级引用"
fi

# =============================================================================
# 13. 公共 API 文档注释
# =============================================================================
hdr "=== 13. 公共 API 文档注释 (pub fn/struct/enum/trait 需要 ///) ==="
undoc_count=0
while IFS= read -r f; do
    rel="${f#$PROJECT_ROOT/}"
    undoc=$(awk '
    /\/\/\// { prev_doc=1; next }
    /^#\[/   { prev_attr=1; next }
    /^[[:space:]]*(pub\s+)(async\s+)?(fn|struct|enum|trait)\s+/ {
        if (!prev_doc && !prev_attr) {
            line = $0; sub(/^[[:space:]]+/, "", line)
            printf "      %d: %s\n", NR, line
        }
    }
    { prev_doc=0; prev_attr=0 }
    ' "$f")
    if [[ -n "$undoc" ]]; then
        warn "$rel — 缺少文档注释:"
        echo "$undoc"
        ((undoc_count++)) || true
    fi
done < <(all_rs)
if (( undoc_count == 0 )); then
    pass "所有公共 API 均有文档注释"
fi

# =============================================================================
# 14. unsafe 块 SAFETY 注释
# =============================================================================
hdr "=== 14. unsafe 块 SAFETY 注释 ==="
unsafe_warn=0
while IFS= read -r f; do
    rel="${f#$PROJECT_ROOT/}"
    hits=$(awk '
    /unsafe\s*\{/ && !/SAFETY/ {
        if (prev !~ /\/\/\s*SAFETY:/ && prev !~ /\/\*\s*SAFETY:/) {
            printf "      %d: %s\n", NR, $0
        }
    }
    { prev = $0 }
    ' "$f")
    if [[ -n "$hits" ]]; then
        warn "$rel — unsafe 块缺少 SAFETY 注释:"
        echo "$hits"
        ((unsafe_warn++)) || true
    fi
done < <(all_rs)
if (( unsafe_warn == 0 )); then
    pass "所有 unsafe 块均有 SAFETY 注释（或无 unsafe 代码）"
fi

# =============================================================================
# 15. 占位符/假实现检查
# =============================================================================
hdr "=== 15. 占位符/假实现检查 (TODO/FIXME/TBD 等) ==="
placeholder_warn=0
while IFS= read -r f; do
    rel="${f#$PROJECT_ROOT/}"
    if [[ "$f" == *.rs ]]; then
        hits=$(awk '
        function brace_delta(line,   chars, i, c, delta) {
            chars = line
            gsub(/[^\{\}]/, "", chars)
            delta = 0
            for (i = 1; i <= length(chars); i++) {
                c = substr(chars, i, 1)
                if (c == "{") delta++
                else if (c == "}") delta--
            }
            return delta
        }

        /^[[:space:]]*#\[cfg\(test\)\]/ {
            pending_test_attr = 1
            next
        }

        pending_test_attr && /^[[:space:]]*mod[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]*\{/ {
            in_test = 1
            test_depth = brace_delta($0)
            pending_test_attr = 0
            next
        }

        pending_test_attr && /^[[:space:]]*mod[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]*;/ {
            pending_test_attr = 0
            next
        }

        in_test {
            test_depth += brace_delta($0)
            if (test_depth <= 0) {
                in_test = 0
                test_depth = 0
            }
            next
        }

        {
            pending_test_attr = 0
            lc = tolower($0)
            if ($0 ~ /TODO|FIXME|TBD|待实现|未实现|临时实现/ || lc ~ /todo!\(|unimplemented!\(/) {
                printf "      %d: %s\n", NR, $0
            }
        }
        ' "$f" 2>/dev/null || true)
    else
        hits=$(grep -n -I -E 'TODO|FIXME|TBD|待实现|未实现|临时实现|todo!\(|unimplemented!\(' "$f" 2>/dev/null || true)
    fi
    if [[ -n "$hits" ]]; then
        fail "$rel — 发现占位符/假实现标记:"
        echo "$hits" | sed 's/^/      /'
        ((placeholder_warn++)) || true
    fi
done < <(
    find "$PROJECT_ROOT/src" "$PROJECT_ROOT/src-tauri/src" "$PROJECT_ROOT/packages" \
        -type f \
        \( -name '*.rs' -o -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \) \
        -not -path '*/target/*' \
        -not -path '*/tests/*' \
        -not -path '*/__tests__/*' \
        -not -path '*/dist/*'
)
if (( placeholder_warn == 0 )); then
    pass "未发现 TODO/FIXME 等占位符或假实现标记"
fi

# =============================================================================
# 16. Phase D 关键闭环门
# =============================================================================
hdr "=== 16. Phase D 关键闭环门 (replay/search/toolsettings) ==="

phase_d_gate_fail=0

if grep -Fq "getAgentSessionSDKMessages surfaces backend replay failures instead of synthesizing fallback" \
    "$PROJECT_ROOT/src/__tests__/ipc.test.ts"; then
    pass "Agent history replay 错误显式化锚点已纳入默认前端测试"
else
    fail "缺少 Agent history replay 错误显式化锚点测试"
    ((phase_d_gate_fail++)) || true
fi

if grep -Fq "shows explicit content-search error instead of empty results when backend search fails" \
    "$PROJECT_ROOT/src/__tests__/search-dialog.test.tsx"; then
    pass "message-content search 错误表面锚点已纳入默认前端测试"
else
    fail "缺少 message-content search 错误表面锚点测试"
    ((phase_d_gate_fail++)) || true
fi

if grep -Fq "sendMessage no longer forwards enabledToolIds that backend does not consume" \
    "$PROJECT_ROOT/src/__tests__/ipc.test.ts"; then
    pass "ToolSettings runtime 发送链路锚点已纳入默认前端测试"
else
    fail "缺少 ToolSettings runtime 发送链路锚点测试"
    ((phase_d_gate_fail++)) || true
fi

if grep -Fq "fn ensure_runtime_idle_rejects_running_session()" \
    "$PROJECT_ROOT/src-tauri/src/tests/commands_agent.rs" && \
   grep -Fq "fn resolve_cli_resume_state_uses_source_session_for_forks()" \
    "$PROJECT_ROOT/src-tauri/src/tests/commands_agent.rs"; then
    pass "Agent history replay Rust 回归锚点已纳入默认后端测试"
else
    fail "缺少 Agent history replay Rust 回归锚点测试"
    ((phase_d_gate_fail++)) || true
fi

if (( phase_d_gate_fail == 0 )); then
    info "Phase D 三个高风险域的关键锚点均已被默认门禁覆盖。"
fi

# =============================================================================
# 汇总
# =============================================================================
hdr "=== 汇总 ==="
printf "  固定检查段: ${C_BOLD}%d${C_RST}  |  输出结果项: ${C_BOLD}%d${C_RST}\n" \
    "$FIXED_CHECK_GROUPS" "$N_TOTAL"
printf "  说明: 输出结果项统计的是本次打印出的 PASS/WARN/FAIL 行数，因此会随告警数量变化而变化。\n\n"

if (( N_FAIL > 0 )); then
    printf "${C_FAIL}存在 FAIL 项，请修复后重新检查。${C_RST}\n"
    exit 1
elif (( N_WARN > 0 )); then
    printf "${C_WARN}存在 WARN 项，建议优化。${C_RST}\n"
    exit 0
else
    printf "${C_PASS}全部检查通过。${C_RST}\n"
    exit 0
fi
