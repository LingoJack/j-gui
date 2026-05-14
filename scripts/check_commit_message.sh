#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'EOF'
用法:
  bash scripts/check_commit_message.sh --message-file <path>
  bash scripts/check_commit_message.sh --message "<title>"
  bash scripts/check_commit_message.sh --ref <git-ref>

规则:
  1. 遵循 Conventional Commits: <type>(<scope>): <description>
  2. type 使用英文小写关键字
  3. scope 和 description 必须包含中文
EOF
}

MESSAGE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --message-file)
            MESSAGE="$(head -n 1 "$2" | tr -d '\r')"
            shift 2
            ;;
        --message)
            MESSAGE="$2"
            shift 2
            ;;
        --ref)
            MESSAGE="$(git log -1 --format=%s "$2" | tr -d '\r')"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "未知参数: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

if [[ -z "$MESSAGE" ]]; then
    echo "缺少提交信息输入。" >&2
    usage >&2
    exit 2
fi

if [[ ! "$MESSAGE" =~ ^(feat|fix|refactor|docs|style|test|build|ci|chore|perf|revert)\(([^()]+)\):[[:space:]](.+)$ ]]; then
    cat >&2 <<EOF
提交文案不符合格式:
  $MESSAGE

期望格式:
  <type>(<scope>): <description>

示例:
  fix(桌面壳层): 收口窗口控件宿主并稳定全局快捷键链路
EOF
    exit 1
fi

SCOPE="${BASH_REMATCH[2]}"
DESCRIPTION="${BASH_REMATCH[3]}"

contains_non_ascii() {
    LC_ALL=C grep -q '[^ -~]' <<<"$1"
}

if ! contains_non_ascii "$SCOPE"; then
    echo "提交 scope 需要包含中文，当前为: $SCOPE" >&2
    exit 1
fi

if ! contains_non_ascii "$DESCRIPTION"; then
    echo "提交 description 需要包含中文，当前为: $DESCRIPTION" >&2
    exit 1
fi

echo "commit message 校验通过: $MESSAGE"
