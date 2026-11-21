#!/usr/bin/env python3
"""今日のレースのうち、スタート展示が終わって、まだ3角（3カド）を判定していないものを、締切が近い順に出す。

使い方: python3 scripts/exkado_queue.py [件数=6]
出力: JSON の配列。1件ごとに
  key       "場-R"（data/exkado.json に保存するときのキー）
  url       公式の展示映像プレーヤー（raceType=exhibition）
  venue     場名とレース番号、deadline 締切（HH:MM）、left 締切まであと何分
  courses   スタート展示で1〜6コースに入った艇番（勝負服の色: 1白 2黒 3赤 4青 5黄 6緑）
  three     3コースに入った艇番と選手名
判定済み・見送り済み（data/exkado.json）と、締切を過ぎたレースは出さない。
"""
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SLUG = ['', 'kiryu', 'toda', 'edogawa', 'heiwajima', 'tamagawa', 'hamanako', 'gamagori', 'tokoname', 'tsu', 'mikuni',
        'biwako', 'suminoe', 'amagasaki', 'naruto', 'marugame', 'kojima', 'miyajima', 'tokuyama', 'shimonoseki', 'wakamatsu',
        'ashiya', 'fukuoka', 'karatsu', 'omura']


def main(limit=6):
    today = json.loads((ROOT / 'data' / 'today.json').read_text(encoding='utf-8'))
    d = today['date']
    p = ROOT / 'data' / 'exkado.json'
    done = {}
    if p.exists():
        x = json.loads(p.read_text(encoding='utf-8'))
        if x.get('date') == d:
            done = x.get('races', {})
    now = datetime.now()
    now_min = now.hour * 60 + now.minute if now.strftime('%Y%m%d') == d else -1
    out = []
    for v in today['venues']:
        if not v.get('open'):
            continue
        for r in v['races']:
            key = f"{v['id']}-{r['no']}"
            if key in done or r.get('result') or not r.get('deadline'):
                continue
            bs = [b for b in r['boats'] if b.get('exCourse')]
            if len(bs) < 6:
                continue  # スタート展示の並びがまだ出ていない
            left = r['deadline'] - now_min
            if left < 0:
                continue
            order = sorted(bs, key=lambda b: b['exCourse'])
            out.append({
                'key': key, 'venue': f"{v['name']} {r['no']}R",
                'deadline': f"{r['deadline'] // 60:02d}:{r['deadline'] % 60:02d}", 'left': left,
                'url': f"https://front.player.boatrace-cdn.jp/player/vod?service=boatcast&stadium={v['id']:02d}{SLUG[v['id']]}"
                       f"&raceType=exhibition&raceDate={d}&raceNumber={r['no']:02d}&autoplay=0&bitrate=high",
                'courses': [b['lane'] for b in order],
                'three': f"{order[2]['lane']}号艇 {order[2]['name']}",
            })
    out.sort(key=lambda x: x['left'])
    print(json.dumps(out[:limit], ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 6)
