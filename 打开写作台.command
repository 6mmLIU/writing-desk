#!/bin/bash
# 双击这个文件：启动本地服务，并用默认浏览器打开写作台。关掉这个终端窗口就停止。
cd "$(dirname "$0")" || exit 1
PORT=4877
if ! command -v python3 >/dev/null 2>&1; then
  echo "没有找到 python3。先在终端里运行：xcode-select --install"
  read -r -p "按回车关闭" _
  exit 1
fi
python3 dev-server.py "$PORT" &
SERVER=$!
sleep 1
open "http://localhost:$PORT"
echo "写作台已经在浏览器里打开：http://localhost:$PORT"
echo "关掉这个窗口就会停止。"
wait "$SERVER"
