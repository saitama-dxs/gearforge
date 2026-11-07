#!/bin/sh
# GearForge 起動スクリプト（macOS / Linux）。起動してブラウザーを開く。止めるには Ctrl+C。
# ポートを変えるとき：./start.sh 8780
cd "$(dirname "$0")" || exit 1
PORT="${1:-8767}"
URL="http://127.0.0.1:$PORT/"
open_url() {
  if [ "$(uname)" = "Darwin" ]; then open "$1"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1
  else echo "ブラウザーで $1 を開いてください"; fi
}
# Node.js 22 以上を探す：PATH の node → nvm / fnm で入れた版（一番新しいもの。いつもの版は切り替えない）
NODE=""
ok() { "$1" -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)" >/dev/null 2>&1; }
if command -v node >/dev/null 2>&1 && ok node; then NODE=node; fi
if [ -z "$NODE" ]; then
  for n in "${NVM_DIR:-$HOME/.nvm}"/versions/node/v*/bin/node "${FNM_DIR:-$HOME/.local/share/fnm}"/node-versions/v*/installation/bin/node "$HOME/Library/Application Support/fnm"/node-versions/v*/installation/bin/node; do
    [ -x "$n" ] && ok "$n" && NODE="$n"
  done
fi
if [ -z "$NODE" ]; then
  echo "Node.js 22 以上が必要です。"
  command -v node >/dev/null 2>&1 && echo "今の Node： $(node -v)"
  if [ -d "${NVM_DIR:-$HOME/.nvm}" ]; then echo "nvm が入っているので「nvm install 22」を実行してから、もう一度開いてください（nvm use は不要）。"
  else echo "https://nodejs.org/ から LTS 版を入れてから、もう一度開いてください。"; fi
  exit 1
fi
if curl -s -o /dev/null --max-time 1 "$URL" 2>/dev/null; then
  echo "GearForge はすでに起動しています → $URL"; open_url "$URL"; exit 0
fi
echo "GearForge を起動します → $URL（止めるには Ctrl+C）"
(sleep 2; open_url "$URL") &
PORT="$PORT" exec "$NODE" server.mjs
