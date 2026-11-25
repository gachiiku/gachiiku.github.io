#!/bin/bash
# GitHub Actions 上で約5時間40分のあいだ、約3分おきにデータを取得して公開する。
# （GitHub の時刻指定実行が当てにならないため、ループで回し、終わったら次のループを起動する）
#   8:00〜23:59（日本時間）: 本日のデータ取得 → 前日の結果を過去データに追加 → 保存 → サイト更新
set -u
END=$(( $(date +%s) + 340 * 60 ))
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

while [ "$(date +%s)" -lt "$END" ]; do
  START=$(date +%s)
  NEW_HIST=0
  H=$((10#$(date +%H)))
  if [ "$H" -ge 8 ]; then
    echo "=== $(date '+%Y-%m-%d %H:%M:%S')"
    git pull -q --rebase origin main || git rebase --abort 2>/dev/null
    python -u scripts/fetch_today.py || echo 'fetch_today 失敗（次の回に再挑戦）'
    python -u scripts/fetch_comments.py || echo '選手コメントの取得に失敗'
    Y=$(date -d yesterday +%Y)
    D=$(date -d yesterday +%Y%m%d)
    if [ ! -f "data/hist/$Y/$D.json.gz" ]; then
      python -u scripts/fetch_history.py || echo 'fetch_history 失敗（次の回に再挑戦）'
      NEW_HIST=1
    fi
    # 全場のレースが終わったら、明日の出走表を取っておく（取れるまで。空のファイルや、出走表がまだの場があれば取り直す）
    TMR=$(date -d tomorrow +%Y%m%d)
    if python -c 'import sys; sys.path.insert(0, "scripts"); import fetch_today as f; sys.exit(0 if f.all_done() and f.need_fetch("data/archive/'"$TMR"'.json") else 1)'; then
      python -u scripts/fetch_today.py "$TMR" || echo '明日の出走表の取得に失敗'
    fi
    git add data
    if ! git diff --cached --quiet; then
      git commit -q -m "data: $(date '+%Y-%m-%d %H:%M')"
      for i in 1 2 3; do
        git pull -q --rebase -X theirs origin main && git push -q origin HEAD:main && break
        sleep 5
      done
      gh workflow run update.yml --ref main || echo '公開の起動に失敗'
      # 前日の結果が加わったら、選手データを作り直す（1日1回）
      if [ "${NEW_HIST:-0}" = 1 ] && [ -f "data/hist/$Y/$D.json.gz" ]; then
        gh workflow run racers.yml --ref main || echo '選手データ作成の起動に失敗'
      fi
    else
      echo '変更なし'
    fi
  fi
  WAIT=$(( 180 - ($(date +%s) - START) ))
  if [ "$WAIT" -gt 0 ]; then sleep "$WAIT"; fi
done
