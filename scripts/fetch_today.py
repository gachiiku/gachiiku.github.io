#!/usr/bin/env python3
"""
本日の出走表・締切時刻・結果・直前情報を BOAT RACE 公式サイトから取得し、
data/today.json に書き出す。標準ライブラリのみで動く。

  python3 scripts/fetch_today.py            # 今日（2回目以降は結果・直前情報だけ差分更新）
  python3 scripts/fetch_today.py --full     # 出走表から取り直す
  python3 scripts/fetch_today.py 20261026   # 日付指定（明日以降の日付なら出走表だけ取り、data/archive に置く）

公式サイトに負荷をかけないよう、リクエストごとに待ち時間を入れている。
"""
import html
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

BASE = 'https://www.boatrace.jp/owpc/pc/race'
UA = 'Mozilla/5.0 (GACHIIKU data fetcher; personal use)'
WAIT = 0.4  # 秒
WORKERS = 4  # 同時接続数(公式サイトの応答が遅いので少しだけ並列にする)
OUT = Path(__file__).resolve().parent.parent / 'data' / 'today.json'

VENUES = {
    1: '桐生', 2: '戸田', 3: '江戸川', 4: '平和島', 5: '多摩川', 6: '浜名湖', 7: '蒲郡', 8: '常滑',
    9: '津', 10: '三国', 11: 'びわこ', 12: '住之江', 13: '尼崎', 14: '鳴門', 15: '丸亀', 16: '児島',
    17: '宮島', 18: '徳山', 19: '下関', 20: '若松', 21: '芦屋', 22: '福岡', 23: '唐津', 24: '大村',
}
ZEN = str.maketrans('０１２３４５６７８９', '0123456789')


def get(path):
    url = f'{BASE}/{path}'
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                body = r.read().decode('utf-8', 'replace')
            time.sleep(WAIT)
            return body
        except Exception as e:  # 一時的な失敗は数回だけ再試行
            print(f'  retry {i + 1}: {url} ({e})', file=sys.stderr)
            time.sleep(2)
    return ''


def text(s):
    """タグを外して空白を詰める"""
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = re.sub(r'<[^>]+>', '', s)
    return html.unescape(s).replace('　', ' ').strip()


def num(s, default=None):
    m = re.search(r'-?\d+(?:\.\d+)?', s or '')
    return float(m.group()) if m else default


def to_min(hhmm):
    h, m = hhmm.split(':')
    return int(h) * 60 + int(m)


# ---------------------------------------------------------------- 開催一覧
def parse_index(page):
    venues = {}
    for tb in re.findall(r'<tbody>(.*?)</tbody>', page, re.S):
        m = re.search(r'raceindex\?jcd=(\d+)&amp;hd=\d+">(.*?)</a>', tb)
        if not m:
            continue
        jcd = int(m.group(1))
        tds = re.findall(r'<td rowspan="2" class="([^"]*)"', tb)
        cls = ' '.join(tds)
        grade = next((g for g in ('SG', 'G1', 'G2', 'G3') if f'is-{g}' in cls), '一般')
        period = re.search(r'(\d+/\d+-\d+/\d+)<br>(.*?)</td>', tb)
        venues[jcd] = {
            'title': text(m.group(2)),
            'grade': grade,
            'night': 'is-nighter' in cls,
            'morning': 'is-morning' in cls,
            'midnight': 'is-midnight' in cls,
            'period': period.group(1) if period else '',
            'day': text(period.group(2)).translate(ZEN) if period else '',
            'canceled': '中止' in tb,
        }
    return venues


# ---------------------------------------------------------------- 出走表
def parse_racelist(page):
    deadlines = []
    m = re.search(r'締切予定時刻</td>(.*?)</tr>', page, re.S)
    if m:
        deadlines = [to_min(t) for t in re.findall(r'(\d{1,2}:\d{2})', m.group(1))]
    title = re.search(r'title16_titleDetail__add2020">(.*?)</h3>', page, re.S)
    race_name, dist = '', 1800
    if title:
        parts = text(title.group(1)).split()
        race_name = parts[0] if parts else ''
        dist = int(num(parts[-1], 1800)) if parts else 1800

    boats = []
    for tb in re.findall(r'<tbody class=" is-fs12">(.*?)</tbody>', page, re.S):
        lane = re.search(r'is-boatColor(\d) is-fs14', tb)
        if not lane:
            continue
        toban = re.search(r'toban=(\d+)', tb)
        cls = re.search(r'<span class="[^"]*">\s*(A1|A2|B1|B2)\s*</span>', tb)
        name = re.search(r'is-fs18 is-fBold"><a[^>]*>(.*?)</a>', tb, re.S)
        prof = re.search(r'<div class="is-fs11">([^<]*)\s*<br />\s*(\d+)歳/([\d.]+)kg', tb)
        cols = [[x.strip() for x in text(c).split('\n') if x.strip()] for c in re.findall(r'<td class="\s*is-lineH2" rowspan="4">(.*?)</td>', tb, re.S)]
        # cols: [F/L/ST], [全国 勝率/2連/3連], [当地 ...], [モーター No/2連/3連], [ボート ...]
        def c(i, j, d=None):
            try:
                return num(cols[i][j], d)
            except IndexError:
                return d
        fl = cols[0] if cols else []
        boats.append({
            'lane': int(lane.group(1)),
            'no': int(toban.group(1)) if toban else 0,
            'name': re.sub(r'\s+', ' ', text(name.group(1))) if name else '',
            'cls': cls.group(1) if cls else '',
            'branch': text(prof.group(1)).split('/')[0] if prof else '',
            'age': int(prof.group(2)) if prof else None,
            'weight': float(prof.group(3)) if prof else None,
            'f': int(num(fl[0], 0)) if fl else 0,
            'l': int(num(fl[1], 0)) if len(fl) > 1 else 0,
            'st': c(0, 2),
            'nat': c(1, 0), 'nat2': c(1, 1), 'nat3': c(1, 2),
            'local': c(2, 0), 'local2': c(2, 1), 'local3': c(2, 2),
            'motorNo': int(c(3, 0, 0)), 'motor2': c(3, 1), 'motor3': c(3, 2),
            'boatNo': int(c(4, 0, 0)), 'boat2': c(4, 1), 'boat3': c(4, 2),
            'exTime': None, 'tilt': None,
        })
    boats.sort(key=lambda b: b['lane'])
    return deadlines, race_name, dist, boats


# ---------------------------------------------------------------- 結果一覧
def parse_resultlist(page):
    results = {}
    for tb in re.findall(r'<tbody>(.*?)</tbody>', page, re.S):
        r = re.search(r'raceresult\?rno=(\d+)&amp;jcd=\d+&amp;hd=\d+">\d+R</a>', tb)
        if not r:
            continue
        if 'レース中止' in tb:
            results[int(r.group(1))] = {'canceled': True, 'order': [], 'payout': 0}
            continue
        cells = re.findall(r'<td class="is-p10-7">(.*?)</td>\s*<td><span class="is-payout1">(.*?)</span>', tb, re.S)
        if not cells:
            continue
        order = [int(x) for x in re.findall(r'numberSet1_number is-type\d">(\d)', cells[0][0])]
        payout = num(text(cells[0][1]).replace(',', ''))
        if len(order) >= 3 and payout:
            results[int(r.group(1))] = {'order': order[:3], 'payout': int(payout)}
    return results


# ---------------------------------------------------------------- 直前情報
WIND_DIR = {i: d for i, d in enumerate(
    ['', '北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東',
     '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'])}


def parse_beforeinfo(page):
    ex = {}
    for tb in re.findall(r'<tbody class="is-fs12 ">(.*?)</tbody>', page, re.S):
        lane = re.search(r'is-boatColor(\d) is-fs14', tb)
        if not lane:
            continue
        tds = re.findall(r'<td rowspan="4">([^<]*)</td>', tb)
        # [展示タイム, チルト, プロペラ]
        if len(tds) >= 2:
            ex[int(lane.group(1))] = {'exTime': num(tds[0]), 'tilt': num(tds[1])}
    w = {}
    for key, label in (('temp', '気温'), ('wind', '風速'), ('waterTemp', '水温'), ('wave', '波高')):
        m = re.search(label + r'</span>\s*<span class="weather1_bodyUnitLabelData">([^<]*)<', page)
        if m:
            w[key] = num(m.group(1))
    m = re.search(r'is-weather\d*"></p>\s*<div class="weather1_bodyUnitLabel">\s*<span class="weather1_bodyUnitLabelTitle">([^<]*)<', page)
    if m:
        w['weather'] = m.group(1).strip()
    # 公式の風アイコン（is-wind1〜16）は、コース図（スタンドが下、スタートは右向き）の上で
    # 風が吹いていく向きを、上から時計回りに22.5度ずつで表す。is-direction1〜16 は同じ図の上での北の向き。
    m = re.search(r'is-wind(\d+)"></p>', page)
    d = re.search(r'is-direction(\d+)"></p>', page)
    if m:
        wi = int(m.group(1))
        to_screen = (wi - 1) * 22.5                      # 図の上で風が吹いていく向き（上=0, 右=90）
        w['windAngle'] = to_screen
        rel = (to_screen - 90 + 360) % 360               # スタート方向（右）からのずれ
        diff = min(rel, 360 - rel)
        w['windRel'] = '追い風' if diff <= 45 else '向かい風' if diff >= 135 else '横風'
        if d:
            north = (int(d.group(1)) - 1) * 22.5         # 図の上での北の向き
            w['northAngle'] = north
            frm = (to_screen - north + 180) % 360        # 風が吹いてくる方角（北=0, 東=90）
            w['windDir'] = WIND_DIR.get(int(round(frm / 22.5)) % 16 + 1, '')
    m = re.search(r'水面気象情報\s*(\d+R)?', page)
    w['at'] = (m.group(1) or '') if m else ''
    return ex, w


# ---------------------------------------------------------------- main
def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    hd = args[0] if args else datetime.now().strftime('%Y%m%d')
    now = datetime.now()
    now_min = now.hour * 60 + now.minute if hd == now.strftime('%Y%m%d') else 24 * 60
    future = hd > now.strftime('%Y%m%d')
    prev = None if future else load_previous(hd)
    if prev and '--full' not in sys.argv:
        # 差分更新: 出走表は1日変わらないので、結果と直前情報だけ取り直す
        print(f'[{hd}] 差分更新（結果・直前情報）')
        venues = prev['venues']
        # 前の晩に取った時点で出走表が出ていなかった場（ナイター等）を、公式の開催一覧と照らして追加する
        held = parse_index(get(f'index?hd={hd}'))
        for v in venues:
            if v['id'] in held and (not v['open'] or not v['races']):
                print(f'  追加: {v["name"]}')
                v.update(held[v['id']])
                v['open'] = True
                fetch_racelists(v, hd)
        with ThreadPoolExecutor(WORKERS) as pool:
            list(pool.map(lambda v: update_live(v, hd, now_min), [v for v in venues if v['open']]))
    else:
        print(f'[{hd}] 開催一覧を取得中...')
        held = parse_index(get(f'index?hd={hd}'))
        print(f'  開催場: {", ".join(VENUES[j] for j in held) or "なし"}')
        venues = []
        for jcd, name in VENUES.items():
            v = {'id': jcd, 'name': name, 'open': jcd in held, 'races': []}
            if jcd in held:
                v.update(held[jcd])
                fetch_racelists(v, hd)
                if not future:  # 明日以降はまだ結果も直前情報もない
                    update_live(v, hd, now_min)
            venues.append(v)

    data = {'date': hd, 'updatedAt': datetime.now().strftime('%Y-%m-%d %H:%M'), 'venues': venues}
    save(data, main_file=not future)


def load_previous(hd):
    """同じ日の保存済みデータ（今日のファイル、なければ前の晩に取った控え）"""
    for p in (OUT, OUT.parent / 'archive' / f'{hd}.json'):
        try:
            data = json.loads(p.read_text(encoding='utf-8'))
        except Exception:
            continue
        if data.get('date') == hd and data.get('venues'):
            return data
    return None


def _unused_load_previous(hd):
    """同じ日付の today.json があれば返す"""
    try:
        data = json.loads(OUT.read_text(encoding='utf-8'))
        return data if data.get('date') == hd and data.get('venues') else None
    except (OSError, ValueError):
        return None


def fetch_racelists(v, hd):
    jcd = v['id']
    with ThreadPoolExecutor(WORKERS) as pool:
        pages = list(pool.map(lambda rno: get(f'racelist?rno={rno}&jcd={jcd:02d}&hd={hd}'), range(1, 13)))
    deadlines = []
    for rno, page in enumerate(pages, 1):
        dl, race_name, dist, boats = parse_racelist(page)
        deadlines = deadlines or dl
        if not boats:
            continue
        sts = [b['st'] for b in boats if b['st']]
        v['races'].append({
            'no': rno,
            'deadline': deadlines[rno - 1] if len(deadlines) >= rno else None,
            'name': race_name, 'dist': dist, 'boats': boats,
            'stGap': round(max(sts) - min(sts), 2) if sts else 0,
            'exhibited': False, 'result': None,
        })
    print(f'  {v["name"]}: 出走表 {len(v["races"])}R', flush=True)


def update_live(v, hd, now_min):
    """結果と、これから締切を迎えるレースの直前情報を取り直す"""
    if v['races'] and all(r['result'] for r in v['races']):
        return  # 全レース確定済み
    jcd = v['id']
    results = parse_resultlist(get(f'resultlist?jcd={jcd:02d}&hd={hd}'))
    for race in v['races']:
        race['result'] = results.get(race['no']) or race.get('result')

    # 展示は締切の20分前ごろに出るので、30分以内のレースだけ見に行く
    upcoming = [r for r in v['races'] if not r['result'] and r['deadline'] and r['deadline'] - now_min <= 30]
    for race in upcoming[:2]:
        ex, w = parse_beforeinfo(get(f'beforeinfo?rno={race["no"]}&jcd={jcd:02d}&hd={hd}'))
        for b in race['boats']:
            if b['lane'] in ex and ex[b['lane']]['exTime']:
                b.update(ex[b['lane']])
                race['exhibited'] = True
        if w.get('temp') is not None:
            v['weather'] = w  # 新しい水面気象で上書き
    done = sum(1 for r in v['races'] if r['result'])
    print(f'  {v["name"]}: 結果 {done}/{len(v["races"])}R' + (f' 直前 {upcoming[0]["no"]}R' if upcoming else ''), flush=True)


def save(data, main_file=True):
    """書きかけのファイルを画面が読まないよう、一時ファイルに書いてから置き換える"""
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    OUT.parent.mkdir(exist_ok=True)
    if main_file:
        tmp = OUT.with_suffix('.tmp')
        tmp.write_text(body, encoding='utf-8')
        tmp.replace(OUT)
    # 日付ごとの控え（ホームの日付切り替え・過去データの分析用）
    archive = OUT.parent / 'archive' / f'{data["date"]}.json'
    archive.parent.mkdir(exist_ok=True)
    tmp = archive.with_suffix('.tmp')
    tmp.write_text(body, encoding='utf-8')
    tmp.replace(archive)
    write_days()
    print(f'書き出し: {OUT if main_file else archive} ({len(body) // 1024}KB) {data["updatedAt"]}')


def write_days():
    """見られる日付の一覧（data/days.json）"""
    dates = sorted(p.stem for p in (OUT.parent / 'archive').glob('*.json') if p.stem.isdigit())
    (OUT.parent / 'days.json').write_text(json.dumps({'dates': dates}), encoding='utf-8')


def all_done(path=OUT):
    """その日の全場の全レースが確定（中止含む）したか"""
    try:
        d = json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return False
    races = [r for v in d['venues'] if v['open'] for r in v['races']]
    return bool(races) and all(r.get('result') for r in races)


if __name__ == '__main__':
    main()
