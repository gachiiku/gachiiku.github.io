#!/usr/bin/env python3
"""映像タグ（tag.html で人が付けた判定）から「攻め方指標」を集計する。

入力: data/tags/YYYYMM.json   {"tags": {"YYYYMMDD-場-R": {"g": "握|差|他", "k": 1|0, "z": 1|0, ...}}}
      data/hist/YYYY/YYYYMMDD.json.gz  （進入コース・ST・着順・決まり手）
出力: data/tagstats.json

指標（分母・分子）
  2コース握り率   分母: 1・2コースのST差が EVEN 秒以内で、2コースの判定(g)が入ったレース   分子: g=握
                  付随: 握ったとき 3コースが4着以下になった割合（3コース不利）
  3コース3カド率  分母: 3カドの判定(k)が入ったレース          分子: k=1
                  付随: 3カドのときの 3コース 1着・2連対・3連対・まくり（3コース1着かつ決まり手まくり）
  変わり全速率    分母: 4コースがスリットで3コースより LEAD 秒以上早く、変わり全速の判定(z)が入ったレース
                  分子: z=1
                  付随: 変わり全速のときの 6コース3着内・1コース連対・2コース連対・5コースの着順
選手ごとの数字は「その選手がそのコースにいたレース」だけで数える。
"""
import glob
import gzip
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEAD = 0.05  # スリットで先行したとみなすST差（tag.html と同じ値）
EVEN = 0.03  # 2コース握り率は、1・2コースのST差がこれ以内（スリットで差がほとんどない）レースだけで数える
PERIODS = {'3m': 91, '6m': 182, '1y': 365, 'all': None}


def lead_of(by):
    """4コースが3コースより LEAD 秒以上早いか。F・欠場などで分からなければ None"""
    a, b = by.get(3), by.get(4)
    if not a or not b or not isinstance(a[3], (int, float)) or not isinstance(b[3], (int, float)):
        return None
    if str(a[4])[:1] in 'FLK' or str(b[4])[:1] in 'FLK':
        return None
    return round(a[3] - b[3], 2) >= LEAD


def even_of(by):
    """1コースと2コースのSTの差が EVEN 秒以内か。F・欠場などで分からなければ None"""
    a, b = by.get(1), by.get(2)
    if not a or not b or not isinstance(a[3], (int, float)) or not isinstance(b[3], (int, float)):
        return None
    if str(a[4])[:1] in 'FLK' or str(b[4])[:1] in 'FLK':
        return None
    return abs(round(a[3] - b[3], 2)) <= EVEN


def top(by, c, n):
    e = by.get(c)
    return bool(e) and isinstance(e[4], int) and e[4] <= n


def empty():
    return {
        'g2': {'n': 0, 'x': 0, 'bad3': 0},
        'k3': {'n': 0, 'x': 0, 'w1': 0, 'w2': 0, 'w3': 0, 'mak': 0},
        'z3': {'n': 0, 'x': 0, 'c6': 0, 'c1': 0, 'c2': 0, 'p5': [0] * 7},  # p5: 1〜6着, その他
    }


def add(acc, race, by, t):
    g, k, z = t.get('g'), t.get('k'), t.get('z')
    if g in ('握', '差', '他') and by.get(2) and even_of(by):
        a = acc(by[2][0])['g2']
        a['n'] += 1
        if g == '握':
            a['x'] += 1
            a['bad3'] += not top(by, 3, 3)
    if k in (0, 1) and by.get(3):
        a = acc(by[3][0])['k3']
        a['n'] += 1
        if k == 1:
            a['x'] += 1
            a['w1'] += top(by, 3, 1)
            a['w2'] += top(by, 3, 2)
            a['w3'] += top(by, 3, 3)
            a['mak'] += top(by, 3, 1) and race.get('kim') == 'まくり'
    if z in (0, 1) and by.get(3) and lead_of(by):
        a = acc(by[3][0])['z3']
        a['n'] += 1
        if z == 1:
            a['x'] += 1
            a['c6'] += top(by, 6, 3)
            a['c1'] += top(by, 1, 2)
            a['c2'] += top(by, 2, 2)
            p = by[5][4] if by.get(5) else None
            a['p5'][p - 1 if isinstance(p, int) and 1 <= p <= 6 else 6] += 1


def merge(dst, src):
    for k, v in src.items():
        for f, x in v.items():
            if isinstance(x, list):
                dst[k][f] = [p + q for p, q in zip(dst[k][f], x)]
            else:
                dst[k][f] += x


def main(out_dir=ROOT):
    tags = {}
    for f in sorted(glob.glob(str(ROOT / 'data' / 'tags' / '*.json'))):
        try:
            tags.update(json.loads(Path(f).read_text(encoding='utf-8')).get('tags', {}))
        except Exception as e:
            print(f'  {f}: 読めません {e}', file=sys.stderr)
    days = {}
    for key in tags:
        days.setdefault(key.split('-')[0], []).append(key)
    hist_files = sorted(glob.glob(str(ROOT / 'data' / 'hist' / '*' / '*.json.gz')))
    last = Path(hist_files[-1]).name[:8] if hist_files else datetime.now().strftime('%Y%m%d')
    base = datetime.strptime(last, '%Y%m%d')
    cut = {p: (base - timedelta(days=d)).strftime('%Y%m%d') if d else '' for p, d in PERIODS.items()}

    racers = {}   # no -> period -> stats
    total = {p: empty() for p in PERIODS}
    used = 0
    for d, keys in sorted(days.items()):
        path = ROOT / 'data' / 'hist' / d[:4] / f'{d}.json.gz'
        if not path.exists():
            continue
        races = {}
        for v in json.load(gzip.open(path))['venues']:
            for r in v['races']:
                races[f"{d}-{v['jcd']}-{r['r']}"] = r
        for key in keys:
            race = races.get(key)
            if not race:
                continue
            by = {e[2]: e for e in race['e'] if isinstance(e[2], int)}
            one = {}

            def acc(no):
                return one.setdefault(str(no), empty())
            add(acc, race, by, tags[key])
            if not one:
                continue
            used += 1
            for p, c in cut.items():
                if d < c:
                    continue
                for no, st in one.items():
                    merge(racers.setdefault(no, {}).setdefault(p, empty()), st)
                    merge(total[p], st)
    data = {
        'updatedAt': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'base': last, 'lead': LEAD, 'even': EVEN, 'races': used, 'tagged': len(tags),
        'total': total,  # 全選手の合計（各指標は1レースにつき1人だけに入るので、合計＝レース数）
        'racers': racers,
    }
    out = Path(out_dir) / 'data' / 'tagstats.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'攻め方指標: タグ {len(tags)}件 → 集計 {used}レース・{len(racers)}人')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT)
