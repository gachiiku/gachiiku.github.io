#!/bin/bash
# launchd から5分おきに呼ばれる。レースのある時間帯だけ fetch_today.py を動かす。
#   その日の初回 … 出走表から全部取得
#   2回目以降   … 結果・直前情報だけ差分更新
cd "$(dirname "$0")/.." || exit 1

HOUR=$(date +%H)
# 8時〜23時台のみ（モーニング〜ミッドナイトまでカバー）
if [ "$HOUR" -lt 8 ]; then exit 0; fi

# 前回の取得がまだ終わっていなければ重ねて動かさない
LOCK=data/.fetch.lock
mkdir -p data
if ! mkdir "$LOCK" 2>/dev/null; then
  # 20分以上残っているロックは異常終了の残骸とみなして消す
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +20)" ]; then rm -rf "$LOCK"; mkdir "$LOCK"; else exit 0; fi
fi
trap 'rm -rf "$LOCK"' EXIT

echo "=== $(date '+%Y-%m-%d %H:%M:%S')"
/usr/bin/python3 -u scripts/fetch_today.py
