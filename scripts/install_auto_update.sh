#!/bin/bash
# 自動更新(launchd)の登録・解除
#   bash scripts/install_auto_update.sh          登録（5分おきに取得）
#   bash scripts/install_auto_update.sh remove   解除
LABEL=com.wake.boatrace-fetch
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
if [ "$1" = "remove" ]; then
  rm -f "$PLIST"
  echo "自動更新を解除しました"
  exit 0
fi

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$ROOT/scripts/auto_update.sh</string></array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/wake-fetch.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/wake-fetch.log</string>
</dict>
</plist>
PLIST
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "自動更新を登録しました（5分おき / ログ: ~/Library/Logs/wake-fetch.log）"
