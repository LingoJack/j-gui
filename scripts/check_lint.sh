#!/usr/bin/env bash
# =============================================================================
# j-gui 代码合规性检查脚本（生产级增强版）
# 用法: bash scripts/check_lint.sh [--fix] [--diff <ref>] [--github-actions]
#   --fix              自动执行 cargo fmt（默认仅报告）
#   --diff <ref>       增量模式，结构性检查只扫描 git diff 的文件
#   --github-actions   输出 GitHub Actions 注解格式
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUST_SRC_DIR="$PROJECT_ROOT/src-tauri/src"
CARGO_MANIFEST="$PROJECT_ROOT/src-tauri/Cargo.toml"
CARGO_LOCK="$PROJECT_ROOT/src-tauri/Cargo.lock"
JCLI_ADAPTER_FILE="$RUST_SRC_DIR/kernel/adapter.rs"

# ── 阈值配置 ──────────────────────────────────────────────────────────────────
MAX_FILE_LINES=600          # 单文件超过此值 WARN
HARD_MAX_FILE_LINES=1000    # 单文件超过此值 FAIL
MAX_FUNCTION_LINES=80       # 单函数超过此值 WARN
MAX_FUNCTION_PARAMS=4       # 函数参数超过此值 WARN

# ── 颜色 ──────────────────────────────────────────────────────────────────────
C_PASS='\033[32m'; C_WARN='\033[33m'; C_FAIL='\033[31m'
C_INFO='\033[36m'; C_BOLD='\033[1m';  C_DIM='\033[2m'; C_RST='\033[0m'

# ── 参数解析 ──────────────────────────────────────────────────────────────────
DO_FIX=false
DO_DIFF=false
DIFF_REF=""
DO_GHA=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --fix)     DO_FIX=true; shift ;;
        --diff)
            DO_DIFF=true
            if [[ $# -ge 2 && "$2" != --* ]]; then
                DIFF_REF="$2"; shift 2
            else
                DIFF_REF="HEAD"; shift
            fi
            ;;
        --github-actions) DO_GHA=true; shift ;;
        *)         shift ;;
    esac
done

# ── 计数器 ────────────────────────────────────────────────────────────────────
FIXED_CHECK_GROUPS=21
N_PASS=0; N_WARN=0; N_FAIL=0

# ── 临时文件统一管理 ──────────────────────────────────────────────────────────
TEMP_FILES=()
cleanup_temp() { rm -f "${TEMP_FILES[@]}" 2>/dev/null || true; }
trap cleanup_temp EXIT

make_temp() {
    local t="$(mktemp)"
    TEMP_FILES+=("$t")
    printf '%s' "$t"
}

# ── 输出函数 ──────────────────────────────────────────────────────────────────
gha_emit() {
    local level="$1"; local msg="$2"; local file="${3:-}" ; local line="${4:-}"
    if $DO_GHA; then
        if [[ -n "$file" && -n "$line" ]]; then
            printf "::%s file=%s,line=%s::%s\n" "$level" "$file" "$line" "$msg"
        elif [[ -n "$file" ]]; then
            printf "::%s file=%s::%s\n" "$level" "$file" "$msg"
        else
            printf "::%s::%s\n" "$level" "$msg"
        fi
    fi
}

pass() {
    ((N_PASS++)) || true
    printf "  ${C_PASS}PASS${C_RST} %s\n" "$*"
    gha_emit "notice" "$*"
}
warn() {
    ((N_WARN++)) || true
    printf "  ${C_WARN}WARN${C_RST} %s\n" "$*"
    gha_emit "warning" "$*"
}
fail() {
    ((N_FAIL++)) || true
    printf "  ${C_FAIL}FAIL${C_RST} %s\n" "$*"
    gha_emit "error" "$*"
}
info()  { printf "  ${C_INFO}INFO${C_RST} %s\n" "$*"; }
hdr()   { printf "\n${C_BOLD}%s${C_RST}\n" "$*"; }

# ── 辅助：查找全部 .rs 源文件 ────────────────────────────────────────────────
all_rs() {
    if $DO_DIFF && [[ -n "$DIFF_REF" ]]; then
        git diff --name-only "$DIFF_REF" -- '*.rs' 2>/dev/null | \
            while IFS= read -r f; do [[ -f "$PROJECT_ROOT/$f" ]] && printf '%s\n' "$PROJECT_ROOT/$f"; done
    else
        find "$RUST_SRC_DIR" -name '*.rs' -not -path '*/target/*'
    fi
}

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
CARGO_LOCK_NATIVE="$(to_host_path "$CARGO_LOCK")"
IPC_CONTRACT_SCRIPT_NATIVE="$(to_host_path "$PROJECT_ROOT/scripts/check_ipc_contract.ts")"

# ── 超时包装（Linux/Mac 可用 timeout，Windows 用 fallback）──────────────────
run_with_timeout() {
    local timeout_sec="${1:-300}"
    shift
    if command -v timeout >/dev/null 2>&1 && timeout --version 2>/dev/null | grep -q 'GNU coreutils'; then
        timeout "$timeout_sec" "$@"
    else
        "$@"
    fi
}

# ── 日志截断显示（只显示最后 N 行）───────────────────────────────────────────
show_log_tail() {
    local log="$1"
    local lines="${2:-30}"
    tail -n "$lines" "$log"
}

run_ts_check() {
    local dir="$1"
    local label="$2"
    local log="$(make_temp)"
    if ( cd "$dir" && "$BUN_BIN" run typecheck ) >"$log" 2>&1; then
        pass "$label 类型检查通过"
    else
        show_log_tail "$log"
        fail "$label 类型检查存在错误"
    fi
}

run_root_ts_check() {
    local log="$(make_temp)"
    if "$BUN_BIN" x tsc --noEmit >"$log" 2>&1; then
        pass "root 类型检查通过"
    else
        show_log_tail "$log"
        fail "root 类型检查存在错误"
    fi
}

# =============================================================================
# A 组：Rust 工具链（fmt → clippy → audit，串行）
# =============================================================================
hdr "=== A 组：Rust 工具链 ==="

# A1. cargo fmt 格式检查
hdr "=== A1. Rust 代码格式 (cargo fmt) ==="
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

# A2. cargo clippy 静态分析
hdr "=== A2. Clippy 静态分析 (-D warnings) ==="
clippy_log="$(make_temp)"
if run_with_timeout 300 "$CARGO_BIN" clippy --manifest-path "$CARGO_MANIFEST_NATIVE" -- -D warnings >"$clippy_log" 2>&1; then
    pass "clippy 零告警"
else
    show_log_tail "$clippy_log" 50
    fail "clippy 存在告警，详见上方输出"
fi

# A3. cargo audit 安全审计
hdr "=== A3. 依赖安全审计 (cargo audit) ==="
if [[ -n "$CARGO_BIN" ]] && "$CARGO_BIN" audit --version >/dev/null 2>&1; then
    audit_log="$(make_temp)"
    audit_exit=0
    "$CARGO_BIN" audit -f "$CARGO_LOCK_NATIVE" >"$audit_log" 2>&1 || audit_exit=$?
    # 以 cargo audit 退出码为准；退出码为 0 时，允许把已放行的上游告警记为 WARN。
    if [[ "$audit_exit" -ne 0 ]]; then
        show_log_tail "$audit_log"
        fail "cargo audit 发现已知漏洞"
    elif grep -qE 'warning: .*allowed warnings found|Warning:|unmaintained|unsound|yanked' "$audit_log" 2>/dev/null; then
        show_log_tail "$audit_log" 15
        warn "cargo audit 发现 unmaintained/informational 告警（上游依赖，非直接可控）"
    else
        pass "cargo audit 无已知漏洞"
    fi
else
    warn "cargo audit 不可用，跳过（安装: cargo install cargo-audit）"
fi

# =============================================================================
# B 组：前端工具链（lockfile → TypeScript → ESLint，串行）
# =============================================================================
hdr "=== B 组：前端工具链 ==="

# B1. bun lockfile 一致性
hdr "=== B1. bun 锁文件一致性 ==="
lockfile_log="$(make_temp)"
if "$BUN_BIN" install --frozen-lockfile >"$lockfile_log" 2>&1; then
    pass "bun lockfile 一致"
else
    show_log_tail "$lockfile_log"
    fail "bun lockfile 不一致，运行 'bun install' 更新"
fi

# B2. TypeScript 类型检查
hdr "=== B2. TypeScript 类型检查 (root + workspaces) ==="
if [[ -n "$BUN_BIN" ]]; then
    run_root_ts_check
    run_ts_check "$PROJECT_ROOT/packages/core" "packages/core"
    run_ts_check "$PROJECT_ROOT/packages/shared" "packages/shared"
    run_ts_check "$PROJECT_ROOT/packages/ui" "packages/ui"
else
    warn "bun 未找到，跳过 TypeScript 类型检查"
fi

# B3. ESLint 前端静态分析
hdr "=== B3. ESLint (前端静态分析) ==="
eslint_log="$(make_temp)"
if [[ -n "$BUN_BIN" ]]; then
    if "$BUN_BIN" run lint:eslint >"$eslint_log" 2>&1; then
        pass "ESLint 零告警"
    else
        show_log_tail "$eslint_log" 50
        fail "ESLint 存在告警或错误"
    fi
else
    warn "bun 未找到，跳过 ESLint"
fi

# =============================================================================
# C 组：测试（前端测试、Rust 测试，可并行）
# =============================================================================
hdr "=== C 组：测试 ==="

# C1. 前端测试
hdr "=== C1. 前端测试 (bun run test) ==="
frontend_test_log="$(make_temp)"
if "$BUN_BIN" run test >"$frontend_test_log" 2>&1; then
    pass "前端测试全部通过"
else
    show_log_tail "$frontend_test_log"
    fail "前端测试存在失败"
fi

# C2. Rust 测试
hdr "=== C2. Rust 测试 (cargo test) ==="
rust_test_log="$(make_temp)"
if run_with_timeout 300 "$CARGO_BIN" test --manifest-path "$CARGO_MANIFEST_NATIVE" >"$rust_test_log" 2>&1; then
    pass "Rust 测试全部通过"
else
    show_log_tail "$rust_test_log"
    fail "Rust 测试存在失败"
fi

# =============================================================================
# D 组：结构性扫描（纯文本扫描，快）
# =============================================================================
hdr "=== D 组：结构性扫描 ==="

# D1. j_cli:: 单入口约束
hdr "=== D1. j_cli:: 导入边界 (仅允许 src-tauri/src/kernel/adapter.rs) ==="
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

# D2. 单文件行数
hdr "=== D2. 单文件行数 (WARN > $MAX_FILE_LINES | FAIL >= $HARD_MAX_FILE_LINES) ==="
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

# D3. 单函数行数（改进版 awk：跳过注释、字符串、raw string、属性）
hdr "=== D3. 单函数行数 (> $MAX_FUNCTION_LINES 行 → WARN) ==="
fn_warn=0
while IFS= read -r f; do
    if is_test_file "$f"; then continue; fi
    rel="${f#$PROJECT_ROOT/}"
    result=$(awk -v file="$rel" -v max="$MAX_FUNCTION_LINES" '
    # 跳过注释和字符串的预处理
    function preprocess_line(line,    result, in_string, in_raw_string) {
        result = line
        # 移除 // 注释
        gsub(/\/\/.*$/, "", result)
        # 移除 /* */ 块注释（简化处理单行内的）
        # 移除字符串内容（简化启发式）
        gsub(/"[^"]*"/, "", result)
        # 移除 raw string r#"..."# （简化）
        gsub(/r#"[^"]*"#/, "", result)
        return result
    }

    function brace_delta(line,    chars, i, c, delta, cleaned) {
        cleaned = preprocess_line(line)
        chars = cleaned
        gsub(/[^\{\}]/, "", chars)
        delta = 0
        for (i = 1; i <= length(chars); i++) {
            c = substr(chars, i, 1)
            if (c == "{") delta++
            else if (c == "}") delta--
        }
        return delta
    }

    # 特定属性规则必须在通配规则之前（awk 按顺序匹配）
    /^[[:space:]]*#\[cfg\(test\)\]/ { pending_test_attr = 1; next }
    /^[[:space:]]*#\[tauri::command\]/ { pending_tauri_attr = 1; next }
    /^[[:space:]]*#\[/ { pending_attr = 1; next }

    pending_test_attr && /^[[:space:]]*mod[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]*\{/ {
        in_test = 1
        test_depth = brace_delta($0)
        pending_test_attr = 0
        pending_tauri_attr = 0
        pending_attr = 0
        next
    }

    pending_test_attr && /^[[:space:]]*mod[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]*;/ {
        pending_test_attr = 0
        pending_tauri_attr = 0
        pending_attr = 0
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

    # 跳过属性行后的下一行可能是函数签名，继续处理
    pending_attr && /^[[:space:]]*(pub\s+)?(async\s+)?fn\s+/ { pending_attr = 0 }

    { pending_test_attr = 0; pending_attr = 0 }

    /^[[:space:]]*(pub\s+)?(async\s+)?fn\s+[a-zA-Z_]/ && !/test/ {
        start = NR
        name = $0
        sub(/^[[:space:]]+/, "", name)
        sub(/\{.*$/, "", name)
        depth = 0; opened = 0
        do {
            line = preprocess_line($0)
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
    info "发现 ${fn_warn} 个函数超过 ${MAX_FUNCTION_LINES} 行"
fi

# D4. 函数参数数量（改进版 awk）
hdr "=== D4. 函数参数数量 (> $MAX_FUNCTION_PARAMS → WARN) ==="
param_warn=0
while IFS= read -r f; do
    if is_test_file "$f"; then continue; fi
    rel="${f#$PROJECT_ROOT/}"
    result=$(awk -v file="$rel" -v max="$MAX_FUNCTION_PARAMS" '
    function preprocess_line(line) {
        result = line
        gsub(/\/\/.*$/, "", result)
        gsub(/"[^"]*"/, "", result)
        gsub(/r#"[^"]*"#/, "", result)
        return result
    }

    function brace_delta(line) {
        cleaned = preprocess_line(line)
        chars = cleaned
        gsub(/[^\{\}]/, "", chars)
        delta = 0
        for (i = 1; i <= length(chars); i++) {
            c = substr(chars, i, 1)
            if (c == "{") delta++
            else if (c == "}") delta--
        }
        return delta
    }

    /^[[:space:]]*#\[cfg\(test\)\]/ { pending_test_attr = 1; next }

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

    { pending_test_attr = 0 }
    ' "$f")
    if [[ -n "$result" ]]; then
        echo "$result"
        ((param_warn++)) || true
    fi
done < <(all_rs)
if (( param_warn == 0 )); then
    pass "所有函数参数 <= ${MAX_FUNCTION_PARAMS} 个"
else
    info "发现 ${param_warn} 个函数参数过多"
fi

# D5. unwrap/expect 使用（非测试代码，扩展白名单）
hdr "=== D5. unwrap/expect 使用 (非 test 代码应避免) ==="
unwrap_warn=0
while IFS= read -r f; do
    if [[ "$f" == */tests/* ]]; then continue; fi
    rel="${f#$PROJECT_ROOT/}"
    hits=$(awk '
    function preprocess_line(line) {
        result = line
        gsub(/\/\/.*$/, "", result)
        gsub(/"[^"]*"/, "", result)
        gsub(/r#"[^"]*"#/, "", result)
        return result
    }

    function brace_delta(line) {
        cleaned = preprocess_line(line)
        chars = cleaned
        gsub(/[^\{\}]/, "", chars)
        delta = 0
        for (i = 1; i <= length(chars); i++) {
            c = substr(chars, i, 1)
            if (c == "{") delta++
            else if (c == "}") delta--
        }
        return delta
    }

    /^[[:space:]]*#\[cfg\(test\)\]/ { pending_test_attr = 1; next }

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

    { pending_test_attr = 0 }

    /\.unwrap\(\)/ || /\.expect\(/ {
        # 先过滤注释行，避免误报 // .unwrap() 等
        cleaned = $0
        gsub(/\/\/.*$/, "", cleaned)
        if (cleaned !~ /\.unwrap\(\)/ && cleaned !~ /\.expect\(/) next
        # 扩展白名单：Mutex/RwLock lock、JoinHandle、catch_unwind 上下文、assert 宏内
        if (/Mutex::lock\(\)\.unwrap\(\)/) next
        if (/RwLock::.*\.unwrap\(\)/) next
        if (/JoinHandle.*\.unwrap\(\)/) next
        if (/thread::spawn.*\.unwrap\(\)/) next
        if (/\.join\(\)\.unwrap\(\)/) next
        if (/catch_unwind/) next
        if (/assert!/ || /assert_eq!/ || /assert_ne!/) next
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
else
    info "发现 ${unwrap_warn} 处 unwrap/expect 使用"
fi

# D6. mod.rs 检查
hdr "=== D6. mod.rs 检查 (严格禁止 — 必须使用 name.rs + name/ 模式) ==="
mod_rs_found=false
while IFS= read -r f; do
    rel="${f#$PROJECT_ROOT/}"
    fail "发现 mod.rs: $rel — 必须改为 name.rs + name/ 子目录模式"
    mod_rs_found=true
done < <(find "$RUST_SRC_DIR" -name 'mod.rs')
if ! $mod_rs_found; then
    pass "未发现 mod.rs 文件，模块组织合规"
fi

# D7. super::super:: 过度层级引用检查
hdr "=== D7. super::super:: 过度层级引用 ==="
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

# D8. 公共 API 文档注释
hdr "=== D8. 公共 API 文档注释 (pub fn/struct/enum/trait 需要 ///) ==="
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

# D9. unsafe 块 SAFETY 注释
hdr "=== D9. unsafe 块 SAFETY 注释 ==="
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

# D10. 占位符/假实现检查（保持 FAIL 级别，约束 AI）
hdr "=== D10. 占位符/假实现检查 (TODO/FIXME/TBD 等 — FAIL 级别) ==="
placeholder_fail=0
while IFS= read -r f; do
    rel="${f#$PROJECT_ROOT/}"
    if [[ "$f" == *.rs ]]; then
        hits=$(awk '
        function brace_delta(line) {
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

        /^[[:space:]]*#\[cfg\(test\)\]/ { pending_test_attr = 1; next }

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

        { pending_test_attr = 0 }
        lc = tolower($0)
        if ($0 ~ /TODO|FIXME|TBD|待实现|未实现|临时实现/ || lc ~ /todo!\(|unimplemented!\(/) {
            printf "      %d: %s\n", NR, $0
        }
        ' "$f" 2>/dev/null || true)
    else
        hits=$(grep -n -I -E 'TODO|FIXME|TBD|待实现|未实现|临时实现|todo!\(|unimplemented!\(' "$f" 2>/dev/null || true)
    fi
    if [[ -n "$hits" ]]; then
        fail "$rel — 发现占位符/假实现标记:"
        echo "$hits" | sed 's/^/      /'
        ((placeholder_fail++)) || true
    fi
done < <(
    if $DO_DIFF && [[ -n "$DIFF_REF" ]]; then
        git diff --name-only "$DIFF_REF" 2>/dev/null | \
            while IFS= read -r f; do
                [[ -f "$PROJECT_ROOT/$f" ]] && printf '%s\n' "$PROJECT_ROOT/$f"
            done | grep -E '\.(rs|ts|tsx|js|jsx)$' || true
    else
        find "$PROJECT_ROOT/src" "$PROJECT_ROOT/src-tauri/src" "$PROJECT_ROOT/packages" \
            -type f \
            \( -name '*.rs' -o -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \) \
            -not -path '*/target/*' \
            -not -path '*/tests/*' \
            -not -path '*/__tests__/*' \
            -not -path '*/dist/*'
    fi
)
if (( placeholder_fail == 0 )); then
    pass "未发现 TODO/FIXME 等占位符或假实现标记"
fi

# D11. 最新提交文案检查
hdr "=== D11. 最新提交文案检查 (中文 Conventional Commits) ==="
commit_msg_log="$(make_temp)"
if bash "$PROJECT_ROOT/scripts/check_commit_message.sh" --ref HEAD >"$commit_msg_log" 2>&1; then
    pass "最新提交文案符合中文 Conventional Commits 约束"
else
    show_log_tail "$commit_msg_log" 20
    fail "最新提交文案不符合中文 Conventional Commits 约束"
fi

# D12. 前后端 IPC 命令面对账
hdr "=== D12. IPC 命令注册面对账 (前端 invoke/tryInvoke vs Rust generate_handler) ==="
ipc_contract_log="$(make_temp)"
if [[ -z "$BUN_BIN" ]]; then
    fail "未找到 bun，无法执行 IPC 命令注册面对账"
elif "$BUN_BIN" "$IPC_CONTRACT_SCRIPT_NATIVE" >"$ipc_contract_log" 2>&1; then
    pass "前后端 IPC 命令注册面对账通过"
else
    show_log_tail "$ipc_contract_log" 30
    fail "发现前端 IPC 命令未在 Rust generate_handler 注册"
fi

# =============================================================================
# E 组：Phase D 关键闭环门（正则匹配加固）
# =============================================================================
hdr "=== E 组：Phase D 关键闭环门 ==="

phase_d_gate_fail=0

# 改为正则匹配函数名/描述关键词，而非精确字符串
if grep -Eq "getAgentSessionSDKMessages.*replay.*fail|replay.*error.*surface" \
    "$PROJECT_ROOT/src/__tests__/ipc.test.ts" 2>/dev/null; then
    pass "Agent history replay 错误显式化锚点已纳入默认前端测试"
else
    fail "缺少 Agent history replay 错误显式化锚点测试"
    ((phase_d_gate_fail++)) || true
fi

if grep -Eq "search.*error.*empty|content-search.*error" \
    "$PROJECT_ROOT/src/__tests__/search-dialog.test.tsx" 2>/dev/null; then
    pass "message-content search 错误表面锚点已纳入默认前端测试"
else
    fail "缺少 message-content search 错误表面锚点测试"
    ((phase_d_gate_fail++)) || true
fi

if grep -Eq "enabledToolIds.*backend.*consume|ToolSettings.*runtime" \
    "$PROJECT_ROOT/src/__tests__/ipc.test.ts" 2>/dev/null; then
    pass "ToolSettings runtime 发送链路锚点已纳入默认前端测试"
else
    fail "缺少 ToolSettings runtime 发送链路锚点测试"
    ((phase_d_gate_fail++)) || true
fi

if grep -Eq "fn ensure_runtime_idle|fn resolve_cli_resume_state" \
    "$RUST_SRC_DIR/tests/commands_agent.rs" 2>/dev/null || \
   grep -Eq "fn ensure_runtime_idle|fn resolve_cli_resume_state" \
    "$RUST_SRC_DIR/tests/agent_engine.rs" 2>/dev/null; then
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
printf "  固定检查段: ${C_BOLD}%d${C_RST}  |  PASS: ${C_BOLD}%d${C_RST}  WARN: ${C_BOLD}%d${C_RST}  FAIL: ${C_BOLD}%d${C_RST}\n" \
    "$FIXED_CHECK_GROUPS" "$N_PASS" "$N_WARN" "$N_FAIL"

if $DO_DIFF; then
    info "增量模式：仅检查 diff $DIFF_REF 范围内的文件（工具链检查仍全量）"
fi

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
