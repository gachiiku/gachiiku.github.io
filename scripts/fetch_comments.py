#!/usr/bin/env python3
"""各レース場の公式サイトに載っている「選手コメント」を集める。

出している場と出していない場があるので、読み取り方を作った場だけ取る。
出力: data/comments.json
  {"date": "YYYYMMDD", "updatedAt": "...", "venues": {"24": {"source": "...", "url": "...",
     "racers": {"3499": {"c": "コメント", "m": "モーター評価(場の独自)"}}}}}

使い方: python3 scripts/fetch_comments.py   （今日開催している場だけ見に行く）
"""
import html
import json
import re
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'comments.json'
TODAY = ROOT / 'data' / 'today.json'
UA = 'Mozilla/5.0 (compatible; gachiiku-data/1.0)'


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')


def clean(s):
    s = re.sub(r'<br\s*/?>', ' ', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s).replace('　', ' ')
    return re.sub(r'\s+', ' ', s).strip()


# ---------------------------------------------------------------- 場ごとの読み取り
def omura():
    """大村: 全選手コメント・モーター評価一覧（1ページに今節の全選手）"""
    url = 'https://omurakyotei.jp/yosou/comment.php'
    page = get(url)
    racers = {}
    for tr in re.findall(r'<tr>(.*?)</tr>', page, re.S):
        no = re.search(r'profile\?toban=(\d{4})', tr)
        tds = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)
        if not no or len(tds) < 3:
            continue
        comment = clean(tds[1])
        point = re.search(r'motorpoint">\s*(\d+)点', tr)
        if comment:
            racers[no.group(1)] = {'c': comment, 'm': f'{point.group(1)}点（7段階）' if point else ''}
    return {'source': 'ボートレース大村 公式サイト', 'url': url, 'racers': racers}


def ashiya():
    """芦屋: 選手コメント一覧（登録番号つきの表）"""
    url = 'https://www.boatrace-ashiya.com/modules/raceinfo/?page=index_racers_comment'
    page = get(url)
    racers = {}
    for tr in re.findall(r'<tr>(.*?)</tr>', page, re.S):
        no = re.search(r"<td class='col1'>(\d{4})</td>", tr)
        c = re.search(r"class='zComment'>(.*?)</p>", tr, re.S)
        if no and c and clean(c.group(1)):
            racers[no.group(1)] = {'c': clean(c.group(1)), 'm': ''}
    return {'source': 'ボートレース芦屋 公式サイト', 'url': url, 'racers': racers}


def amagasaki():
    """尼崎: 各レースの出走表に「前日」「当日」コメント（取材できた選手だけ）"""
    base = 'https://www.boatrace-amagasaki.jp/modules/yosou/group-syussou.php?day={d}&race={r}&if=1'
    d = datetime.now().strftime('%Y%m%d')
    racers = {}
    for r in range(1, 13):
        req = urllib.request.Request(base.format(d=d, r=r), headers={'User-Agent': UA, 'Referer': 'https://www.boatrace-amagasaki.jp/'})
        try:
            page = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'replace')
        except Exception:
            continue
        parts = page.split("<table class='comment_area'>")
        for i in range(1, len(parts)):
            nos = re.findall(r'(?:toban|racer_no|racerno|no)=(\d{4})', parts[i - 1])
            if not nos:
                continue
            block = parts[i].split('</table>')[0]
            items = []
            for tag, txt in re.findall(r"ico_comment_tag comment_tag_(\w+)'.*?<div class='comment_text'>(.*?)</div>", block, re.S):
                t = clean(txt)
                if t:
                    items.append(('前日' if tag == 'zenjitsu' else '当日' if tag == 'toujitsu' else '') + '：' + t)
            if items:
                racers[nos[-1]] = {'c': ' ／ '.join(dict.fromkeys(items)), 'm': ''}
        time.sleep(0.5)
    return {'source': 'ボートレース尼崎 公式サイト', 'url': 'https://www.boatrace-amagasaki.jp/', 'racers': racers}


def miyajima():
    """宮島: 今のレース前後の選手コメント（取りに行くたびに増えていくので、前回分と合わせて使う）"""
    url = 'https://www.boatrace-miyajima.com/race_common/require/kaisai_reload.php'
    req = urllib.request.Request(url, data=b'', headers={'User-Agent': UA, 'Referer': 'https://www.boatrace-miyajima.com/'})
    page = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'replace')
    racers = {}
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', page, re.S):
        no = re.search(r'profile\?toban=(\d{4})', tr)
        c = re.search(r'class="table_txt_comment">(.*?)</td>', tr, re.S)
        if no and c:
            t = clean(re.sub(r'<span.*$', '', c.group(1), flags=re.S))
            upd = re.search(r'(\d{1,2}:\d{2})更新', c.group(1))
            if t:
                racers[no.group(1)] = {'c': t + (f'（{upd.group(1)}）' if upd else ''), 'm': ''}
    return {'source': 'ボートレース宮島 公式サイト', 'url': 'https://www.boatrace-miyajima.com/', 'racers': racers, 'merge': True}


def suminoe():
    """住之江: 関西スポーツ新聞5社の選手コメントサイト（レースごとにJSON）"""
    base = 'https://boatrace-sp.jp/suminoe_yosou_comment/get_data.php?target=&race_no={r}&date=&open='
    racers, paper = {}, ''
    for r in range(1, 13):
        try:
            d = json.loads(get(base.format(r=r)))
        except Exception:
            continue
        paper = d.get('paper') or paper
        for boats in d.get('program') or []:
            for b in boats:
                t = clean(b.get('comment') or '')
                if b.get('racer_id') and t:
                    racers[str(b['racer_id'])] = {'c': t, 'm': ''}
        time.sleep(0.3)
    src = f'関西スポーツ新聞5社（{paper}）・ボートレース住之江' if paper else '関西スポーツ新聞5社・ボートレース住之江'
    return {'source': src, 'url': 'https://boatrace-sp.jp/suminoe_yosou_comment/', 'racers': racers}


FETCHERS = {12: suminoe, 13: amagasaki, 17: miyajima, 21: ashiya, 24: omura}


def main():
    try:
        today = json.loads(TODAY.read_text(encoding='utf-8'))
        open_ids = {v['id'] for v in today['venues'] if v['open']}
        date = today['date']
    except Exception:
        open_ids, date = set(FETCHERS), datetime.now().strftime('%Y%m%d')
    prev = {}
    if OUT.exists():
        try:
            p = json.loads(OUT.read_text(encoding='utf-8'))
            if p.get('date') == date:
                prev = p.get('venues', {})
        except Exception:
            pass
    venues = dict(prev)
    now = time.time()
    for jcd, fn in FETCHERS.items():
        if jcd not in open_ids:
            continue
        old = prev.get(str(jcd))
        if old and now - old.get('fetched', 0) < 600:  # 同じ場を見に行くのは10分に1回まで
            continue
        try:
            got = fn()
            got['fetched'] = now
            if got.pop('merge', False) and old:  # 一部ずつしか出ない場は、前回までの分と合わせる
                got['racers'] = {**old.get('racers', {}), **got['racers']}
            if got['racers']:
                venues[str(jcd)] = got
                print(f'  {got["source"]}: {len(got["racers"])}人')
        except Exception as e:  # 1つの場が失敗してもほかは続ける
            print(f'  {jcd}: 取得失敗 {e}', file=sys.stderr)
        time.sleep(1)
    data = {'date': date, 'updatedAt': datetime.now().strftime('%Y-%m-%d %H:%M'), 'venues': venues}
    tmp = OUT.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    tmp.replace(OUT)
    print(f'選手コメント: {len(venues)}場')


if __name__ == '__main__':
    main()
