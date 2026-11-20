#!/usr/bin/env python3
"""全選手のデータを作る。

元データ: 公式サイトの「モーターボートファン手帳」期別成績（半年ごと・固定長テキスト）
  https://www.boatrace.jp/owpc/pc/extra/data/download.html
直近4期分を取得し、最新期で全選手を評価する。直近の出走は data/archive の日次データから集める。

出力:
  data/racers/index.json      一覧・検索用（全選手の要約）
  data/racers/r/<登番>.json   選手ごとの詳細

使い方: python3 scripts/fetch_racers.py
LZH の展開に bsdtar を使う（macOS は標準、Ubuntu は libarchive-tools）。
"""
import json
import subprocess
import sys
import tempfile
import time
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'racers'
URL = 'https://www.boatrace.jp/static_extra/pc_static/download/data/kibetsu/fan{}.lzh'
UA = 'Mozilla/5.0 (compatible; wake-data/1.0)'
PERIODS = 4  # 何期分さかのぼるか

# ---------- 固定長レコード（1行416バイト, Shift_JIS） ----------
HEAD = [('no', 4), ('name', 16), ('kana', 15), ('branch', 4), ('cls', 2), ('era', 1), ('birth', 6),
        ('sex', 1), ('age', 2), ('height', 3), ('weight', 2), ('blood', 2), ('win', 4), ('quin', 4),
        ('w1', 3), ('w2', 3), ('starts', 3), ('finals', 2), ('champs', 2), ('st', 3)]
COURSE = [('n', 3), ('quin', 4), ('st', 3), ('strank', 3)]
MID = [('cls1', 2), ('cls2', 2), ('cls3', 2), ('ability_prev', 4), ('ability', 4), ('year', 4),
       ('term', 1), ('from', 8), ('to', 8), ('grad', 3)]
PLACE = [('p1', 3), ('p2', 3), ('p3', 3), ('p4', 3), ('p5', 3), ('p6', 3), ('F', 2), ('L0', 2),
         ('L1', 2), ('K0', 2), ('K1', 2), ('S0', 2), ('S1', 2), ('S2', 2)]
TAIL = [('nL0', 2), ('nL1', 2), ('nK0', 2), ('nK1', 2), ('home', 6)]


def cut(buf, pos, spec):
    out = {}
    for key, n in spec:
        out[key] = buf[pos:pos + n].decode('cp932', 'replace').strip()
        pos += n
    return out, pos


def num(s, div=1):
    s = s.replace('　', '').strip()
    if not s or not s.lstrip('-').isdigit():
        return None
    return int(s) / div if div != 1 else int(s)


def jp(s):
    """全角スペースで桁揃えされた名前を「姓 名」に整える。
    元データは「高　橋　　二　朗」のように、姓と名の間だけ全角スペースが2つ以上続く。"""
    import re
    s = s.replace(' ', '　').strip('　')
    parts = [p.replace('　', '') for p in re.split('　{2,}', s) if p]
    return ' '.join(parts)


def parse(buf):
    h, p = cut(buf, 0, HEAD)
    courses = []
    for _ in range(6):
        c, p = cut(buf, p, COURSE)
        courses.append(c)
    m, p = cut(buf, p, MID)
    for c in courses:
        d, p = cut(buf, p, PLACE)
        c.update(d)
    t, p = cut(buf, p, TAIL)

    era = {'S': 1925, 'H': 1988, 'R': 2018}.get(h['era'], 0)
    b = h['birth']
    birth = f'{era + int(b[:2])}-{b[2:4]}-{b[4:6]}' if era and b.isdigit() else None
    cs = []
    for c in courses:
        n = num(c['n']) or 0
        places = [num(c[f'p{i}']) or 0 for i in range(1, 7)]
        cs.append({
            'n': n, 'places': places,
            'r1': round(places[0] / n * 100, 1) if n else None,
            'r2': num(c['quin'], 10) if n else None,
            'r3': round(sum(places[:3]) / n * 100, 1) if n else None,
            'st': num(c['st'], 100) if n else None,
            'strank': num(c['strank'], 100) if n else None,
            'F': num(c['F']) or 0, 'L': (num(c['L0']) or 0) + (num(c['L1']) or 0),
        })
    return {
        'no': num(h['no']), 'name': jp(h['name']), 'kana': h['kana'], 'branch': h['branch'],
        'home': t['home'].replace('\u3000', '').replace(' ', ''), 'cls': h['cls'], 'birth': birth, 'sex': num(h['sex']),
        'age': num(h['age']), 'height': num(h['height']), 'weight': num(h['weight']),
        'blood': h['blood'], 'grad': num(m['grad']),
        'win': num(h['win'], 100), 'quin': num(h['quin'], 10),
        'w1': num(h['w1']), 'w2': num(h['w2']), 'starts': num(h['starts']),
        'finals': num(h['finals']), 'champs': num(h['champs']), 'st': num(h['st'], 100),
        'clsHist': [m['cls1'], m['cls2'], m['cls3']],
        'ability': num(m['ability'], 100), 'abilityPrev': num(m['ability_prev'], 100),
        'term': f"{m['year']}-{m['term']}", 'from': m['from'], 'to': m['to'],
        'courses': cs,
    }


# ---------- 取得 ----------
def candidates():
    """新しい順にファイル名候補（yyMM, MM=04/10）を返す。"""
    y = datetime.now().year % 100
    for yy in range(y, y - 6, -1):
        for mm in ('10', '04'):
            yield f'{yy:02d}{mm}'


def download(tag, tmp):
    req = urllib.request.Request(URL.format(tag), headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read()
    except Exception:
        return None
    lzh = Path(tmp) / f'fan{tag}.lzh'
    lzh.write_bytes(body)
    subprocess.run(['bsdtar', '-xf', str(lzh), '-C', tmp], check=True)
    txt = next(Path(tmp).glob(f'fan{tag}.*[tT][xX][tT]'), None)
    if not txt:
        return None
    rows = [l for l in txt.read_bytes().split(b'\r\n') if len(l) >= 400]
    return [parse(l) for l in rows]


# ---------- 評価 ----------
def pct_rank(values, higher_better=True):
    """値 → 全選手中の位置(0〜100)。Noneは対象外。"""
    xs = sorted(v for v in values if v is not None)
    n = len(xs)
    if not n:
        return lambda v: None

    import bisect

    def f(v):
        if v is None:
            return None
        lo, hi = bisect.bisect_left(xs, v), bisect.bisect_right(xs, v)
        p = (lo + hi) / 2 / n * 100
        return round(p if higher_better else 100 - p)
    return f


def course_rate(r, idx, key):
    n = sum(r['courses'][i]['n'] for i in idx)
    if n < 6:
        return None
    if key == 'r1':
        return sum(r['courses'][i]['places'][0] for i in idx) / n * 100
    return sum(sum(r['courses'][i]['places'][:3]) for i in idx) / n * 100


def evaluate(racers):
    active = [r for r in racers if (r['starts'] or 0) >= 30]
    axes = {
        'win': (lambda r: r['win'], True),
        'quin': (lambda r: r['quin'], True),
        'start': (lambda r: r['st'] if r['st'] else None, False),
        'in': (lambda r: course_rate(r, [0], 'r1'), True),
        'out': (lambda r: course_rate(r, [3, 4, 5], 'r3'), True),
        'big': (lambda r: (r['finals'] or 0) + 2 * (r['champs'] or 0), True),
    }
    ranks = {k: pct_rank([f(r) for r in active], hb) for k, (f, hb) in axes.items()}
    ab = sorted((r['ability'] or 0 for r in active), reverse=True)
    for r in racers:
        r['eval'] = {k: ranks[k](f(r)) if (r['starts'] or 0) >= 30 else None for k, (f, _) in axes.items()}
        a = r['ability'] or 0
        if (r['starts'] or 0) < 30 or not a:
            r['grade'] = '-'
            r['rank'] = None
            continue
        rank = sum(1 for x in ab if x > a) + 1
        top = rank / len(ab)
        r['rank'] = rank
        r['grade'] = 'S' if top <= .05 else 'A' if top <= .2 else 'B' if top <= .5 else 'C' if top <= .8 else 'D'
    return len(active)


# ---------- 直近の出走（日次アーカイブから） ----------
def recent_runs():
    runs = {}
    files = sorted((ROOT / 'data' / 'archive').glob('*.json'))
    for f in files:
        try:
            d = json.loads(f.read_text(encoding='utf-8'))
        except Exception:
            continue
        for v in d.get('venues', []):
            for race in v.get('races', []):
                res = race.get('result') or {}
                order = res.get('order') or []
                for b in race.get('boats', []):
                    if not b.get('no'):
                        continue
                    pos = order.index(b['lane']) + 1 if b['lane'] in order else (0 if order else None)
                    runs.setdefault(b['no'], []).append({
                        'date': d['date'], 'jcd': v['id'], 'venue': v['name'], 'r': race['no'],
                        'name': race.get('name', ''), 'lane': b['lane'], 'pos': pos,
                        'ex': b.get('exTime'), 'canceled': bool(res.get('canceled')),
                    })
    for k in runs:
        runs[k] = sorted(runs[k], key=lambda x: (x['date'], x['r']), reverse=True)[:30]
    return runs


def main():
    periods = []
    with tempfile.TemporaryDirectory() as tmp:
        for tag in candidates():
            rows = download(tag, tmp)
            time.sleep(1)
            if rows:
                print(f'fan{tag}: {len(rows)}人')
                periods.append(rows)
                if len(periods) >= PERIODS:
                    break
    if not periods:
        sys.exit('選手データを取得できませんでした')

    cur = periods[0]
    n_active = evaluate(cur)
    past = [{r['no']: r for r in p} for p in periods[1:]]
    runs = recent_runs()

    detail_dir = OUT / 'r'
    detail_dir.mkdir(parents=True, exist_ok=True)
    index = []
    keep = set()
    for r in cur:
        hist = [{'term': r['term'], 'cls': r['cls'], 'win': r['win'], 'quin': r['quin'],
                 'st': r['st'], 'ability': r['ability'], 'starts': r['starts'],
                 'w1': r['w1'], 'champs': r['champs'], 'from': r['from'], 'to': r['to']}]
        for p in past:
            o = p.get(r['no'])
            if o:
                hist.append({'term': o['term'], 'cls': o['cls'], 'win': o['win'], 'quin': o['quin'],
                             'st': o['st'], 'ability': o['ability'], 'starts': o['starts'],
                             'w1': o['w1'], 'champs': o['champs'], 'from': o['from'], 'to': o['to']})
        detail = dict(r, hist=hist, recent=runs.get(r['no'], []))
        path = detail_dir / f"{r['no']}.json"
        path.write_text(json.dumps(detail, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        keep.add(path.name)
        index.append([r['no'], r['name'], r['kana'], r['branch'], r['cls'], r['age'], r['sex'],
                      r['win'], r['quin'], r['st'], r['ability'], r['grade'], r['rank'], r['starts'],
                      r['champs']])
    for f in detail_dir.glob('*.json'):  # 引退などで載らなくなった選手のファイルを片付ける
        if f.name not in keep:
            f.unlink()

    meta = {'term': cur[0]['term'], 'from': cur[0]['from'], 'to': cur[0]['to'], 'active': n_active,
            'updatedAt': datetime.now().strftime('%Y-%m-%d %H:%M'),
            'cols': ['no', 'name', 'kana', 'branch', 'cls', 'age', 'sex', 'win', 'quin', 'st',
                     'ability', 'grade', 'rank', 'starts', 'champs'],
            'rows': index}
    (OUT / 'index.json').write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'書き出し: {len(index)}人（評価対象 {n_active}人） 期間 {meta["from"]}〜{meta["to"]}')


if __name__ == '__main__':
    main()
