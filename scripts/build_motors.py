#!/usr/bin/env python3
"""モーター機歴を作る（今のモーターが使われ始めてからの全出走）。

元データ:
  ・data/hist の競走成績（各出走のモーター番号・展示タイム・着順）
  ・モーターの使用開始日: BOATCAST（公式映像サービス）の bc_mst_<場>.txt

出力:
  data/motors/<場>.json        その場の全モーターの成績まとめ（ランク・貢献P など）
  data/motors/<場>/<番号>.json  そのモーターの機歴（節ごと・乗った選手・全レース）
"""
import gzip
import json
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HIST = ROOT / 'data' / 'hist'
OUT = ROOT / 'data' / 'motors'
MST = 'https://race.boatcast.jp/hp_txt/{j:02d}/bc_mst_{j:02d}.txt'
UA = 'Mozilla/5.0 (compatible; wake-data/1.0)'
POINT = {1: 10, 2: 8, 3: 6, 4: 4, 5: 2, 6: 1}


def start_dates():
    """場ごとのモーター使用開始日。取れなければ前回の値を使う。"""
    prev_path = OUT / 'start.json'
    prev = json.loads(prev_path.read_text()) if prev_path.exists() else {}
    out = {}
    for j in range(1, 25):
        try:
            req = urllib.request.Request(MST.format(j=j), headers={'User-Agent': UA})
            s = urllib.request.urlopen(req, timeout=30).read().decode('ascii', 'ignore').strip()
            if len(s) == 8 and s.isdigit():
                out[str(j)] = s
                continue
        except Exception:
            pass
        if str(j) in prev:
            out[str(j)] = prev[str(j)]
    return out


def racer_table():
    p = ROOT / 'data' / 'racers' / 'index.json'
    if not p.exists():
        return {}
    d = json.loads(p.read_text(encoding='utf-8'))
    cols = d['cols']
    return {r[0]: dict(zip(cols, r)) for r in d['rows']}


class Acc:
    def __init__(self):
        self.n = self.pts = self.finals = self.champs = 0
        self.p = [0] * 6
        self.exr = self.exn = 0
        self.kp = self.kn = 0

    def add(self, x, racer_win):
        pos = x['pos']
        if isinstance(pos, str) and pos.startswith('K'):
            return
        self.n += 1
        pt = POINT.get(pos, 0) if isinstance(pos, int) else 0
        if isinstance(pos, int):
            self.p[pos - 1] += 1
        self.pts += pt
        if x['exRank']:
            self.exr += x['exRank']
            self.exn += 1
        if racer_win:  # 貢献P: 実際の得点 − その選手の勝率（＝ふつうに走ったときの期待得点）
            self.kp += pt - racer_win
            self.kn += 1
        if x['final']:
            self.finals += 1
            self.champs += pos == 1

    def out(self):
        n = self.n
        r = lambda k: round(sum(self.p[:k]) / n * 100, 1) if n else None  # noqa: E731
        return {'n': n, 'win': round(self.pts / n, 2) if n else None, 'r1': r(1), 'r2': r(2), 'r3': r(3),
                'w': self.p[:3], 'finals': self.finals, 'champs': self.champs,
                'exRank': round(self.exr / self.exn, 2) if self.exn else None,
                'kp': round(self.kp / self.kn, 2) if self.kn else None}


def main():
    starts = start_dates()
    racers = racer_table()
    win = {no: r.get('win') for no, r in racers.items()}
    first = min(starts.values()) if starts else '99999999'
    runs = defaultdict(lambda: defaultdict(list))  # jcd → motor → [出走]
    last_day = ''
    for f in sorted(HIST.glob('*/*.json.gz')):
        if f.name[:8] < first:
            continue
        day = json.load(gzip.open(f, 'rt', encoding='utf-8'))
        dt = day['date']
        last_day = dt
        for v in day['venues']:
            st0 = starts.get(str(v['jcd']))
            if not st0 or dt < st0:
                continue
            for race in v['races']:
                es = race['e']
                if not es or len(es[0]) < 8:
                    continue
                exs = sorted(e[7] for e in es if e[7])
                final = '優勝戦' in race['name'] and '準' not in race['name']
                for no, lane, course, st, pos, motor, boat, ex in es:
                    if motor is None:
                        continue
                    runs[v['jcd']][motor].append({
                        'date': dt, 'day': v.get('day'), 'title': v['title'], 'grade': v.get('grade') or '一般',
                        'r': race['r'], 'name': race['name'], 'no': no, 'lane': lane, 'course': course,
                        'st': st, 'pos': pos, 'ex': ex, 'exRank': exs.index(ex) + 1 if ex else None,
                        'final': final, 'boat': boat,
                    })

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'start.json').write_text(json.dumps(starts))
    m1 = (datetime.strptime(last_day, '%Y%m%d') - timedelta(days=30)).strftime('%Y%m%d') if last_day else ''
    total = 0
    for jcd, motors in runs.items():
        vdir = OUT / str(jcd)
        vdir.mkdir(exist_ok=True)
        summary = {}
        series_of = {}
        for m, rs in motors.items():
            rs.sort(key=lambda x: (x['date'], x['r']))
            a, b = Acc(), Acc()
            for x in rs:
                a.add(x, win.get(x['no']))
                if x['date'] >= m1:
                    b.add(x, win.get(x['no']))
            summary[m] = {'all': a.out(), 'm1': b.out()}
            # 機歴: 節ごと → 乗った選手ごと
            ser = {}
            for x in rs:
                key = (x['title'], x['date'][:6] if x['day'] is None else x['date'], x['no'])
                sid = f"{x['title']}|{x['no']}"
                s = ser.get(sid)
                if not s or (datetime.strptime(x['date'], '%Y%m%d') - datetime.strptime(s['to'], '%Y%m%d')).days > 2:
                    sid = f"{sid}|{x['date']}"
                    s = ser.setdefault(sid, {'title': x['title'], 'grade': x['grade'], 'from': x['date'], 'to': x['date'],
                                             'no': x['no'], 'name': (racers.get(x['no']) or {}).get('name', ''),
                                             'cls': (racers.get(x['no']) or {}).get('cls', ''), 'runs': []})
                    ser[f"{x['title']}|{x['no']}"] = s
                s['to'] = x['date']
                s['runs'].append([x['date'], x['r'], x['name'], x['lane'], x['course'], x['st'], x['pos'], x['ex'], x['exRank']])
                del key
            series = sorted({id(s): s for s in ser.values()}.values(), key=lambda s: s['from'], reverse=True)
            series_of[m] = series
        # 場の中での順位（取得後の2連対率・直近1ヶ月の2連対率）
        for key in ('all', 'm1'):
            order = sorted((m for m in summary if summary[m][key]['n']), key=lambda m: -(summary[m][key]['r2'] or 0))
            for i, m in enumerate(order, 1):
                summary[m][key]['rank'] = i
        for m, series in series_of.items():
            (vdir / f'{m}.json').write_text(json.dumps({'jcd': jcd, 'motor': m, 'start': starts[str(jcd)], 'last': last_day,
                                                        'count': len(summary), 'summary': summary[m], 'series': series},
                                                       ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        (OUT / f'{jcd}.json').write_text(json.dumps({'jcd': jcd, 'start': starts[str(jcd)], 'last': last_day,
                                                     'count': len(summary), 'motors': summary},
                                                    ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        total += len(summary)
    print(f'モーター機歴: {len(runs)}場 {total}機（〜{last_day}）')


if __name__ == '__main__':
    main()
