#!/bin/sh
# Prefer an existing supported Node; use Codex's bundled runtime on this machine.
set -eu
cd "$(dirname "$0")/.."
if ! node -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit((major===20&&minor>=19)||(major===22&&minor>=12)||major>=24?0:1)' 2>/dev/null; then
  bundled_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
  if [ -x "$bundled_node/node" ]; then
    PATH="$bundled_node:$PATH"
    export PATH
  else
    echo '请先安装 Node.js 22.12+ 或 24，再运行此脚本。' >&2
    exit 1
  fi
fi
if [ "$#" -eq 0 ]; then
  exec npm run dev
fi
exec npm "$@"
