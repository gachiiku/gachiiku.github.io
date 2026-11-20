#!/usr/bin/env python3
"""過去のレース結果を1日1ファイルで貯める（選手の成績データ・レースページの元データ）。

元データ:
  ・競走成績（公式ダウンロード, 1日1ファイル LZH）
      https://www1.mbrace.or.jp/od2/K/YYYYMM/kYYMMDD.lzh
    着順・艇番・登番・進入コース・ST・決まり手・レース名
  ・グレード（SG/G1/G2/G3/一般）は公式サイトの開催一覧 index?hd= から

出力: data/hist/YYYY/YYYYMMDD.json.gz （一度作った日は作り直さない）
  各出走 e = [登番, 艇番, 進入, ST, 着順, モーター, ボート, 展示タイム]

  python3 scripts/fetch_history.py                 # 保存済みの翌日〜昨日
  python3 scripts/fetch_history.py --since 20211120 # 指定日〜昨日で、まだ無い日を全部
  python3 scripts/fetch_history.py --refresh 20251126 # 指定日〜昨日で、モーター番号の無い日を取り直す
"""
import gzip
import json
import re
import subprocess
import sys
import tempfile
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_today import parse_index, get as get_official  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
HIST = ROOT / 'data' / 'hist'
K_URL = 'https://www1.mbrace.or.jp/od2/K/{ym}/k{ymd}.lzh'
UA = 'Mozilla/5.0 (compatible; wake-data/1.0)'
WORKERS = 4


def path_for(d):
    return HIST / d.strftime('%Y') / f'{d.strftime("%Y%m%d")}.json.gz'


def download_k(d, tmp):
    url = K_URL.format(ym=d.strftime('%Y%m'), ymd=d.strftime('%y%m%d'))
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None  # 開催なし・未公開
            time.sleep(3)
        except Exception:
            time.sleep(3)
    else:
        raise RuntimeError(f'取得失敗 {url}')
    work = Path(tmp) / d.strftime('%Y%m%d')
    work.mkdir()
    (work / 'k.lzh').write_bytes(body)
    subprocess.run(['bsdtar', '-xf', 'k.lzh'], cwd=work, check=True)
    txt = next((p for p in work.iterdir() if p.suffix.lower() == '.txt'), None)
    return txt.read_bytes().decode('cp932', 'replace') if txt else None


ROW = re.compile(r'^\s+(0[1-6]|[FLKS]\d?)\s+([1-6])\s+(\d{4})\s(.*)$')
TAIL = re.compile(r'\s(\d{1,3})\s+(\d{1,3})\s+(\S+)\s+(\S+)\s+(\S+)')
RACE = re.compile(r'^\s+(\d{1,2})R\s+(.+?)\s{2,}.*?H(\d{3,4})m')


def to_st(s):
    m = re.fullmatch(r'([FL]?)(\d?\.\d\d)', s)
    if not m:
        return None
    v = float(m.group(2))
    return -v if m.group(1) == 'F' else v  # フライングはマイナスで持つ


def parse_k(txt):
    venues = []
    v = race = None
    lines = txt.splitlines()
    for i, line in enumerate(lines):
        m = re.match(r'^(\d\d)KBGN', line)
        if m:
            v = {'jcd': int(m.group(1)), 'title': '', 'day': None, 'races': []}
            venues.append(v)
            race = None
            continue
        if v is None:
            continue
        if re.match(r'^\d\dKEND', line):
            v = None
            continue
        if not v['title'] and '競走成績' in line:
            for nxt in lines[i + 1:i + 6]:
                if nxt.strip():
                    v['title'] = nxt.strip().replace('　', ' ').strip()
                    break
            continue
        if v['day'] is None:
            m = re.search(r'第\s*(\d+)日\s+\d{4}/\d\d/\d\d', line)
            if m:
                v['day'] = int(m.group(1))
                continue
        m = RACE.match(line)
        if m:
            race = {'r': int(m.group(1)), 'name': m.group(2).replace('　', '').strip(), 'kim': '', 'e': []}
            v['races'].append(race)
            continue
        if race is not None and line.startswith('  着 艇'):
            tail = line.split('ﾚｰｽﾀｲﾑ')[-1].replace('　', ' ').strip()
            race['kim'] = tail
            continue
        m = ROW.match(line)
        if m and race is not None:
            pos_s, lane, no, rest = m.groups()
            t = TAIL.search(rest)
            course = st = motor = boat = ex = None
            if t:
                motor, boat = int(t.group(1)), int(t.group(2))
                ex = float(t.group(3)) if re.fullmatch(r'\d\.\d\d', t.group(3)) else None
                course = int(t.group(4)) if t.group(4).isdigit() else None
                st = to_st(t.group(5))
            pos = int(pos_s) if pos_s.isdigit() else pos_s  # F/L/K/S は文字のまま
            race['e'].append([int(no), int(lane), course, st, pos, motor, boat, ex])
    return [v for v in venues if v['races']]


def has_motor(p):
    try:
        d = json.load(gzip.open(p, 'rt', encoding='utf-8'))
        e = d['venues'][0]['races'][0]['e'][0]
        return len(e) >= 8
    except Exception:
        return False


def fetch_day(d, refresh=False):
    out = path_for(d)
    old = None
    if out.exists():
        if not refresh or has_motor(out):
            return d, 'skip'
        old = json.load(gzip.open(out, 'rt', encoding='utf-8'))
    with tempfile.TemporaryDirectory() as tmp:
        txt = download_k(d, tmp)
    if txt is None:
        return d, 'none'
    venues = parse_k(txt)
    if old:  # 取り直し: グレードは保存済みのものを使う（公式サイトへのアクセスを減らす）
        grades = {v['jcd']: v.get('grade', '') for v in old['venues']}
        for v in venues:
            v['grade'] = grades.get(v['jcd'], '')
    else:
        idx = parse_index(get_official(f'index?hd={d.strftime("%Y%m%d")}'))
        for v in venues:
            info = idx.get(v['jcd'])
            v['grade'] = info['grade'] if info else ''
    out.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps({'date': d.strftime('%Y%m%d'), 'venues': venues}, ensure_ascii=False, separators=(',', ':'))
    tmp = out.with_suffix('.tmp')
    with gzip.open(tmp, 'wt', encoding='utf-8') as f:
        f.write(body)
    tmp.replace(out)
    return d, f'{len(venues)}場 {sum(len(v["races"]) for v in venues)}R'


def main():
    args = sys.argv[1:]
    end = date.today() - timedelta(days=1)
    refresh = '--refresh' in args
    if refresh:
        start = datetime.strptime(args[args.index('--refresh') + 1], '%Y%m%d').date()
        days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
        days = [d for d in days if path_for(d).exists() and not has_motor(path_for(d))]
        print(f'取り直し {len(days)}日', flush=True)
        with ThreadPoolExecutor(WORKERS) as pool:
            for i, (d, msg) in enumerate(pool.map(lambda d: fetch_day(d, True), reversed(days)), 1):
                print(f'[{i}/{len(days)}] {d} {msg}', flush=True)
        return
    if '--since' in args:
        start = datetime.strptime(args[args.index('--since') + 1], '%Y%m%d').date()
    else:
        have = sorted(HIST.glob('*/*.json.gz'))
        start = (datetime.strptime(have[-1].name[:8], '%Y%m%d').date() + timedelta(days=1)) if have else end
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    days = [d for d in days if not path_for(d).exists()]
    print(f'対象 {len(days)}日 ({start}〜{end})', flush=True)
    done = 0
    with ThreadPoolExecutor(WORKERS) as pool:
        for d, msg in pool.map(fetch_day, reversed(days)):  # 新しい日から
            done += 1
            print(f'[{done}/{len(days)}] {d} {msg}', flush=True)


if __name__ == '__main__':
    main()
