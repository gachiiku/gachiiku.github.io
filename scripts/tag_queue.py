#!/usr/bin/env python3
"""映像タグの「まだ判定していないレース」を、新しい日から順に出す（AI判定用）。

使い方: python3 scripts/tag_queue.py [件数=12]
出力: JSON の配列。1件ごとに
  key       "YYYYMMDD-場-R"（保存するときのキー）
  url       公式のレース映像プレーヤー（新しいタブで開いて見る）
  venue     場名
  courses   1〜6コースに入った艇番（勝負服の色: 1白 2黒 3赤 4青 5黄 6緑）
  st        1〜6コースのST
  kim       1着の決まり手（参考。判定には使わない）
  ask       判定する項目: g=2コース握り（1・2コースのST差0.03以内のときだけ）, k=3カド, z=変わり全速（4コースが3コースより0.05以上先行のときだけ）
優先: 変わり全速の対象 → 2コース握りの対象 → そのほか。判定済み（data/tags/YYYYMM.json）と、
見送ったレース（data/tags/skip.json）は出さない。
"""
import glob
import gzip
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEAD, EVEN = 0.05, 0.03
V = ['', '桐生', '戸田', '江戸川', '平和島', '多摩川', '浜名湖', '蒲郡', '常滑', '津', '三国', 'びわこ', '住之江',
     '尼崎', '鳴門', '丸亀', '児島', '宮島', '徳山', '下関', '若松', '芦屋', '福岡', '唐津', '大村']
SLUG = ['', 'kiryu', 'toda', 'edogawa', 'heiwajima', 'tamagawa', 'hamanako', 'gamagori', 'tokoname', 'tsu', 'mikuni',
        'biwako', 'suminoe', 'amagasaki', 'naruto', 'marugame', 'kojima', 'miyajima', 'tokuyama', 'shimonoseki', 'wakamatsu',
        'ashiya', 'fukuoka', 'karatsu', 'omura']


def done_keys():
    keys = set()
    for f in glob.glob(str(ROOT / 'data' / 'tags' / '*.json')):
        d = json.loads(Path(f).read_text(encoding='utf-8'))
        keys |= set(d.get('tags', {})) | set(d.get('skip', {}))
    return keys


def ok(e):
    return isinstance(e[3], (int, float)) and str(e[4])[:1] not in 'FLK'


def main(limit=12):
    done = done_keys()
    out = []
    for f in sorted(glob.glob(str(ROOT / 'data' / 'hist' / '*' / '*.json.gz')), reverse=True):
        d = Path(f).name[:8]
        day = []
        for v in json.load(gzip.open(f))['venues']:
            for r in v['races']:
                key = f"{d}-{v['jcd']}-{r['r']}"
                if key in done:
                    continue
                by = {e[2]: e for e in r['e'] if isinstance(e[2], int)}
                if len(by) < 6:
                    continue
                even = ok(by[1]) and ok(by[2]) and abs(round(by[1][3] - by[2][3], 2)) <= EVEN
                lead = ok(by[3]) and ok(by[4]) and round(by[3][3] - by[4][3], 2) >= LEAD
                ask = (['g'] if even else []) + ['k'] + (['z'] if lead else [])
                day.append((0 if lead else 1 if even else 2, {
                    'key': key, 'venue': f"{V[v['jcd']]} {r['r']}R", 'date': d,
                    'url': f"https://front.player.boatrace-cdn.jp/player/vod?service=boatcast&stadium={v['jcd']:02d}{SLUG[v['jcd']]}"
                           f"&raceType=race&raceDate={d}&raceNumber={r['r']:02d}&autoplay=0&bitrate=high",
                    'courses': [by[c][1] for c in range(1, 7)],
                    'st': [by[c][3] for c in range(1, 7)],
                    'kim': r.get('kim'), 'ask': ask,
                }))
        day.sort(key=lambda x: x[0])
        out += [x for _, x in day]
        if len(out) >= limit:
            break
    print(json.dumps(out[:limit], ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 12)
