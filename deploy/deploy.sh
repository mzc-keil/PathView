#!/usr/bin/env bash
#
# PathView 一键部署：本地构建 → 打包 → 上传 → 远程装依赖构建 → 重启服务
#
# 用法：
#   ./deploy/deploy.sh user@1.2.3.4
#   ./deploy/deploy.sh user@1.2.3.4 /opt/pathview 3001
#
# 前置条件：
#   1. 本地能 ssh/scp 免密登录目标机
#   2. 目标机已装 Node 22.13+（推荐 24 LTS）
#   3. 目标机已装 pm2，或已安装 deploy/pathview.service
#   4. 首次部署需先在目标机建好数据目录（见 DEPLOY.md）
#
# 脚本是幂等的：重复执行即完成一次发布。

set -euo pipefail

REMOTE="${1:-}"
REMOTE_DIR="${2:-/opt/pathview}"
PORT="${3:-3001}"

if [[ -z "$REMOTE" ]]; then
  cat <<'USAGE'
用法: deploy.sh <user@host> [远程目录] [端口]

  user@host   目标服务器，需已配置 SSH 免密
  远程目录    默认 /opt/pathview
  端口        默认 3001

示例:
  ./deploy/deploy.sh root@1.2.3.4
  ./deploy/deploy.sh ubuntu@10.0.0.5 /srv/pathview 8080
USAGE
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=============================================="
echo " 目标   $REMOTE:$REMOTE_DIR  (端口 $PORT)"
echo "=============================================="

# ---------- 1 本地校验 ----------
echo ""
echo "==> [1/5] 本地类型检查"
npm run typecheck

# ---------- 2 打包 ----------
echo ""
echo "==> [2/5] 打包源码"
TARBALL="$(mktemp -t pathview-src-XXXXXX.tgz)"
trap 'rm -f "$TARBALL"' EXIT

# 用 git 跟踪的文件清单打包最干净；没有 git 时退回 exclude 策略
if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "     依据 git 文件清单打包"
  git -C "$ROOT" ls-files -z \
    | tar --null -czf "$TARBALL" -T -
else
  echo "     未检测到 git，按规则排除生成物"
  tar \
    --exclude='./node_modules' \
    --exclude='./client/node_modules' \
    --exclude='./server/node_modules' \
    --exclude='./client/dist' \
    --exclude='./server/data' \
    --exclude='./.tmp' \
    --exclude='./.git' \
    --exclude='./.workbuddy' \
    --exclude='*.log' \
    -czf "$TARBALL" .
fi
echo "     包大小 $(du -h "$TARBALL" | cut -f1)"

# ---------- 3 上传 ----------
echo ""
echo "==> [3/5] 上传到 $REMOTE"
ssh "$REMOTE" "mkdir -p '$REMOTE_DIR'"
scp -q "$TARBALL" "$REMOTE:/tmp/pathview-src.tgz"

# ---------- 4 远程安装与构建 ----------
echo ""
echo "==> [4/5] 远程安装依赖并构建前端"
ssh "$REMOTE" "REMOTE_DIR='$REMOTE_DIR' bash -s" <<'REMOTE_SCRIPT'
set -euo pipefail
cd "$REMOTE_DIR"

# 解包（覆盖旧文件，不删除已移除的文件；需要绝对干净就先手动清目录）
tar -xzf /tmp/pathview-src.tgz -C "$REMOTE_DIR"
rm -f /tmp/pathview-src.tgz

node -v

# 后端只需生产依赖；前端需要 devDependencies 才能构建
npm --prefix server ci --omit=dev
npm --prefix client ci
npm --prefix client run build

# 确认数据目录存在且可写
DATA_DIR="${PV_DATA_DIR:-$REMOTE_DIR/data}"
mkdir -p "$DATA_DIR"
echo "数据目录: $DATA_DIR"
REMOTE_SCRIPT

# ---------- 5 重启 ----------
echo ""
echo "==> [5/5] 重启服务"
ssh "$REMOTE" "REMOTE_DIR='$REMOTE_DIR' PORT='$PORT' bash -s" <<'RESTART_SCRIPT'
set -euo pipefail
cd "$REMOTE_DIR"

if command -v pm2 >/dev/null 2>&1; then
  echo "     使用 pm2 重启"
  if pm2 describe pathview >/dev/null 2>&1; then
    pm2 restart pathview --update-env
  else
    pm2 start "$REMOTE_DIR/deploy/ecosystem.config.cjs"
  fi
  pm2 save
elif systemctl list-unit-files 2>/dev/null | grep -q '^pathview\.service'; then
  echo "     使用 systemd 重启"
  sudo systemctl restart pathview
else
  echo "     ✗ 未找到 pm2 也未找到 pathview.service，请先按 DEPLOY.md 配置进程托管" >&2
  exit 1
fi

echo "     等待服务就绪…"
for i in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    echo "     ✓ 健康检查通过:"
    curl -fsS "http://127.0.0.1:$PORT/api/health"
    echo ""
    exit 0
  fi
  sleep 1
done

echo "     ✗ 15 秒内健康检查未通过，最近日志：" >&2
if command -v pm2 >/dev/null 2>&1; then pm2 logs pathview --lines 30 --nostream >&2 || true
else sudo journalctl -u pathview -n 30 --no-pager >&2 || true; fi
exit 1
RESTART_SCRIPT

echo ""
echo "=============================================="
echo " 部署完成"
echo "=============================================="
