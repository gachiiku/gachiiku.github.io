#!/usr/bin/env python3
"""data/hist に貯めたレース結果から、選手ごとの成績データを作る。

出力: data/racers/s/<登番>.json
  grade   グレード別成績（SG/G1/G2/G3/一般/総合）
  lane    艇番別成績（と、その艇番から実際に入ったコース）
  course  進入コース別成績（決まり手つき）
  venue   競艇場別成績
  finals  優出の一覧
  series  直近12ヵ月の全出走（節ごと）
  c1y / gen1y / inesc1y / local5y  レースページ用のコース別データ
"""
import gzip
import json
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HIST = ROOT / 'data' / 'hist'
OUT = ROOT / 'data' / 'racers' / 's'
POINT = {1: 10, 2: 8, 3: 6, 4: 4, 5: 2, 6: 1}
KIM = ['逃げ', '差し', 'まくり', 'まくり差し', '抜き', '恵まれ']
GRADES = ['SG', 'G1', 'G2', 'G3', '一般']


def d8(s):
    return datetime.strptime(s, '%Y%m%d').date()


class Acc:
    """出走を1件ずつ足していく集計器。"""
    __slots__ = ('n', 'pts', 'p', 'F', 'L', 'K', 'S', 'st', 'stn', 'rk', 'rkn', 'kim', 'finals', 'champs', 'series', 'course')

    def __init__(self):
        self.n = self.pts = self.F = self.L = self.K = self.S = 0
        self.p = [0] * 6
        self.st = self.stn = self.rk = self.rkn = 0
        self.kim = [0] * 6
        self.finals = self.champs = 0
        self.series = set()
        self.course = [0] * 7

    def add(self, x):
        pos = x['pos']
        if pos == 'K' or (isinstance(pos, str) and pos.startswith('K')):
            self.K += 1
            return
        self.n += 1
        if isinstance(pos, int):
            self.p[pos - 1] += 1
            self.pts += POINT[pos]
        elif pos.startswith('F'):
            self.F += 1
        elif pos.startswith('L'):
            self.L += 1
        else:
            self.S += 1
        if x['st'] is not None and x['st'] > 0:
            self.st += x['st']
            self.stn += 1
        if x['strank']:
            self.rk += x['strank']
            self.rkn += 1
        if pos == 1 and x['kim'] in KIM:
            self.kim[KIM.index(x['kim'])] += 1
        if x['final']:
            self.finals += 1
            if pos == 1:
                self.champs += 1
        self.series.add(x['sid'])
        c = x['course']
        self.course[c - 1 if c else 6] += 1

    def out(self, *keys):
        n = self.n
        r = lambda k: round(sum(self.p[:k]) / n * 100, 1) if n else 0.0  # noqa: E731
        d = {
            'n': n, 'series': len(self.series), 'win': round(self.pts / n, 2) if n else 0.0,
            'w1': self.p[0], 'r1': r(1), 'r2': r(2), 'r3': r(3),
            'finals': self.finals, 'champs': self.champs,
            'st': round(self.st / self.stn, 2) if self.stn else None,
            'strank': round(self.rk / self.rkn, 1) if self.rkn else None,
            'p': self.p, 'F': self.F, 'L': self.L, 'K': self.K, 'S': self.S,
            'kim': self.kim, 'course': self.course,
        }
        return {k: d[k] for k in keys} if keys else d


def load_runs():
    """全出走を選手ごとに並べる。"""
    runs = defaultdict(list)
    files = sorted(HIST.glob('*/*.json.gz'))
    last = {}  # jcd → (title, 最後の日付, 節の初日)  同じ場・同じタイトルで日付が続けば同じ節
    maxday = {}  # 節ID → 最終日が何日目か
    for f in files:
        day = json.load(gzip.open(f, 'rt', encoding='utf-8'))
        dt = day['date']
        for v in day['venues']:
            prev = last.get(v['jcd'])
            if prev and prev[0] == v['title'] and (d8(dt) - d8(prev[1])).days <= 2:
                start = prev[2]
            else:
                start = dt
            last[v['jcd']] = (v['title'], dt, start)
            v['day'] = (d8(dt) - d8(start)).days + 1
            sid = f"{v['jcd']:02d}{start}"
            maxday[sid] = max(maxday.get(sid, 0), v['day'])
            for race in v['races']:
                sts = sorted(e[3] for e in race['e'] if e[3] is not None and e[3] > 0)
                in_win = any(e[2] == 1 and e[4] == 1 for e in race['e'])
                final = '優勝戦' in race['name'] and '準' not in race['name']
                race['e'] = [e[:5] for e in race['e']]  # モーター等はここでは使わない
                by_course = {e[2]: e for e in race['e'] if e[2]}
                win = next((e for e in race['e'] if e[4] == 1), None)
                order = ''.join(str(e[1]) for e in sorted((e for e in race['e'] if isinstance(e[4], int) and e[4] <= 3), key=lambda e: e[4]))
                for no, lane, course, st, pos in race['e']:
                    nb = None  # 比べる隣の艇のST（内側。1コースは2コース）
                    if course:
                        n = by_course.get(course - 1 if course > 1 else 2)
                        nb = n[3] if n and n[3] is not None and n[3] > 0 else None
                    runs[no].append({
                        'date': dt, 'jcd': v['jcd'], 'title': v['title'], 'grade': v.get('grade') or '一般',
                        'sid': sid, 'day': v.get('day'), 'r': race['r'], 'name': race['name'], 'kim': race['kim'],
                        'lane': lane, 'course': course, 'st': st, 'pos': pos, 'final': final, 'inWin': in_win,
                        'strank': sts.index(st) + 1 if st is not None and st > 0 else None,
                        'wc': win[2] if win else None, 'order': order, 'nbSt': nb,
                    })
    for rs in runs.values():
        for x in rs:
            x['last'] = x['day'] == maxday[x['sid']]
    span = (files[0].name[:8], files[-1].name[:8]) if files else ('', '')
    return runs, span


def course_block(acc):
    o = acc.out('n', 'win', 'r2', 'r3', 'st', 'strank', 'kim', 'r1')
    o['sashi'], o['makuri'], o['msashi'] = o['kim'][1], o['kim'][2], o['kim'][3]
    del o['kim']
    return o


def build(no, rs, today):
    y1 = (today - timedelta(days=365)).strftime('%Y%m%d')
    y5 = (today - timedelta(days=365 * 5)).strftime('%Y%m%d')
    grade = defaultdict(Acc)
    lane = [Acc() for _ in range(6)]
    course = [Acc() for _ in range(6)]
    venue = defaultdict(Acc)
    c1y = [Acc() for _ in range(6)]
    gen1y = [Acc() for _ in range(6)]
    inesc = [[0, 0, 0] for _ in range(6)]  # n, 2着内, 3着内（1コースが逃げたレース）
    local = defaultdict(lambda: [Acc() for _ in range(6)])
    finals = []
    for x in rs:
        grade[x['grade'] if x['grade'] in GRADES else '一般'].add(x)
        grade['総合'].add(x)
        lane[x['lane'] - 1].add(x)
        venue[x['jcd']].add(x)
        c = x['course']
        if c:
            course[c - 1].add(x)
            if x['date'] >= y1:
                c1y[c - 1].add(x)
                if x['grade'] not in ('SG', 'G1'):
                    gen1y[c - 1].add(x)
                if x['inWin'] and c > 1 and x['kim'] == '逃げ':
                    inesc[c - 1][0] += 1
                    if isinstance(x['pos'], int):
                        inesc[c - 1][1] += x['pos'] <= 2
                        inesc[c - 1][2] += x['pos'] <= 3
            if x['date'] >= y5:
                local[x['jcd']][c - 1].add(x)
        if x['final']:
            finals.append([x['date'], x['jcd'], x['title'], x['grade'], x['r'], x['lane'], c, x['pos'], x['kim'], x['order']])

    # 直近12ヵ月の全出走を節ごとに
    series = {}
    for x in rs:
        if x['date'] < y1:
            continue
        s = series.setdefault(x['sid'], {'jcd': x['jcd'], 'title': x['title'], 'grade': x['grade'],
                                         'from': x['date'], 'to': x['date'], 'runs': []})
        s['to'] = max(s['to'], x['date'])
        s['from'] = min(s['from'], x['date'])
        s['runs'].append([x['date'], x['day'], x['r'], x['lane'], x['course'], x['st'], x['pos'], x['name'], x['strank'], x['kim'], x['order']])
    series = sorted(series.values(), key=lambda s: s['from'], reverse=True)
    for s in series:
        s['runs'].sort(key=lambda r: (r[0], r[2]))

    # ---- 期間別のコース別成績（ボートレース日和の「コース別成績」「平均ST」） ----
    t = today
    k0 = date(t.year, 11, 1) if t.month >= 11 else date(t.year, 5, 1) if t.month >= 5 else date(t.year - 1, 11, 1)
    ago = lambda n: (today - timedelta(days=n)).strftime('%Y%m%d')  # noqa: E731
    big = lambda x: x['grade'] in ('SG', 'G1')  # noqa: E731
    windows = [
        ('今期', lambda x: x['date'] >= k0.strftime('%Y%m%d')),
        ('直近1年', lambda x: x['date'] >= y1),
        ('直近6ヶ月', lambda x: x['date'] >= ago(182)),
        ('直近3ヶ月', lambda x: x['date'] >= ago(91)),
        ('直近1ヶ月', lambda x: x['date'] >= ago(30)),
        ('一般戦', lambda x: x['date'] >= y1 and not big(x)),
        ('SG・G1', lambda x: x['date'] >= y1 and big(x)),
        ('初日', lambda x: x['date'] >= y1 and x['day'] == 1),
        ('最終日', lambda x: x['date'] >= y1 and x['last'] and x['day'] > 1),
    ]
    period = {name: [Acc() for _ in range(6)] for name, _ in windows}
    # ---- 枠別決まり手（勝ち方・負け方）: 範囲 × 期間 × コース → [出走, a, b, c, d]
    #   1コース: 逃げ / 差され / 捲られ / 捲られ差
    #   2〜6コース: 逃し(1コースに逃げられた) / 差し / 捲り / 捲り差し
    kimt = {sc: {w: [[0] * 5 for _ in range(6)] for w in ('1y', '6m')} for sc in ('all', 'gen', 'big')}
    # ---- ST考察（直近1年）: [STのある出走, 安定, 抜出の対象, 抜出, 出遅]
    sta = [[0] * 5 for _ in range(6)]
    lose = [[0, 0, {}] for _ in range(6)]  # 出走, 負け, {勝った艇のコース+決まり手: 回数}
    for x in rs:
        c = x['course']
        if not c or (isinstance(x['pos'], str) and x['pos'].startswith('K')):
            continue
        for name, f in windows:
            if f(x):
                period[name][c - 1].add(x)
        if x['date'] < y1:
            continue
        mine = x['pos'] == 1
        if c == 1:
            hit = [mine and x['kim'] == '逃げ', not mine and x['kim'] == '差し',
                   not mine and x['kim'] == 'まくり', not mine and x['kim'] == 'まくり差し']
        else:
            hit = [x['wc'] == 1 and x['kim'] == '逃げ', mine and x['kim'] == '差し',
                   mine and x['kim'] == 'まくり', mine and x['kim'] == 'まくり差し']
        # 負け筋: 1着になれなかったとき、何コースの艇にどの決まり手で勝たれたか
        lose[c - 1][0] += 1
        if not mine and x['wc'] and x['kim']:
            lose[c - 1][1] += 1
            key = f"{x['wc']}{x['kim']}"
            lose[c - 1][2][key] = lose[c - 1][2].get(key, 0) + 1
        for sc in ('all', 'big' if big(x) else 'gen'):
            for w in ('1y', '6m') if x['date'] >= ago(182) else ('1y',):
                row = kimt[sc][w][c - 1]
                row[0] += 1
                for i, h in enumerate(hit):
                    row[i + 1] += h
        st = x['st']
        if st is not None and st > 0:
            avg = course[c - 1].st / course[c - 1].stn if course[c - 1].stn else st
            a = sta[c - 1]
            a[0] += 1
            a[1] += abs(st - avg) <= 0.03
            if x['nbSt'] is not None:
                if c > 1:
                    a[2] += 1
                    a[3] += x['nbSt'] - st >= 0.05
                a[4] += st - x['nbSt'] >= 0.05

    def kim_out(rows):
        return [[r[0]] + [round(v / r[0] * 100, 1) if r[0] else None for v in r[1:]] for r in rows]

    full = ('n', 'series', 'win', 'w1', 'r1', 'r2', 'r3', 'finals', 'champs', 'st', 'strank', 'p', 'F', 'L', 'K', 'S')
    return {
        'period': {name: [a.out('n', 'r1', 'r2', 'r3', 'st', 'strank') for a in accs] for name, accs in period.items()},
        'kimt': {sc: {w: kim_out(v) for w, v in d.items()} for sc, d in kimt.items()},
        'lose1y': [{'n': n, 'lost': l, 'by': [[int(k[0]), k[1:], v] for k, v in sorted(by.items(), key=lambda kv: -kv[1])[:6]]}
                   for n, l, by in lose],
        'sta': [{'n': a[0], 'stable': round(a[1] / a[0] * 100, 1) if a[0] else None,
                 'jump': round(a[3] / a[2] * 100, 1) if a[2] else None,
                 'late': round(a[4] / a[0] * 100, 1) if a[0] else None} for a in sta],
        'no': no,
        'grade': {g: grade[g].out(*full) for g in GRADES + ['総合']},
        'lane': [a.out('n', 'finals', 'champs', 'r1', 'r2', 'r3', 'w1', 'course') for a in lane],
        'course': [a.out('n', 'w1', 'r1', 'r2', 'r3', 'st', 'strank', 'kim') for a in course],
        'venue': {str(j): venue[j].out('series', 'n', 'finals', 'champs', 'win', 'w1', 'r1', 'r2', 'r3', 'st') for j in sorted(venue)},
        'finals': sorted(finals, reverse=True),
        'series': series,
        'c1y': [course_block(a) for a in c1y],
        'gen1y': [course_block(a) for a in gen1y],
        'inesc1y': [{'n': a, 'r2': round(b / a * 100, 1) if a else None, 'r3': round(c / a * 100, 1) if a else None} for a, b, c in inesc],
        'local5y': {str(j): [course_block(a) for a in local[j]] for j in sorted(local)},
    }


def main():
    runs, span = load_runs()
    if not runs:
        sys.exit('data/hist にデータがありません')
    today = d8(span[1]) + timedelta(days=1)
    OUT.mkdir(parents=True, exist_ok=True)
    keep = set()
    for no, rs in runs.items():
        rs.sort(key=lambda x: (x['date'], x['r']))
        d = build(no, rs, today)
        d['span'] = [rs[0]['date'], rs[-1]['date']]
        d['histSpan'] = list(span)
        p = OUT / f'{no}.json'
        p.write_text(json.dumps(d, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        keep.add(p.name)
    for f in OUT.glob('*.json'):
        if f.name not in keep:
            f.unlink()
    print(f'成績データ: {len(keep)}人 期間 {span[0]}〜{span[1]}')


if __name__ == '__main__':
    main()
