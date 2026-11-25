#!/usr/bin/env python3
"""検索エンジン向けの静的ページを作る（公開のたびに実行）。

  _site/r/<登番>.html  選手ごとのページ（タイトル・説明文・主要な成績を最初から HTML に書く）
  _site/sitemap.xml     全ページの一覧

使い方: python3 scripts/build_pages.py [出力先(既定: _site)]
"""
import html
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAC = ROOT / 'data' / 'racers'
BASE = 'https://gachiikuboat.com/'
VEN = ['', '桐生', '戸田', '江戸川', '平和島', '多摩川', '浜名湖', '蒲郡', '常滑', '津', '三国', 'びわこ', '住之江',
       '尼崎', '鳴門', '丸亀', '児島', '宮島', '徳山', '下関', '若松', '芦屋', '福岡', '唐津', '大村']
KS = {'まくり': '捲り', 'まくり差し': '捲り差し'}
e = html.escape


def f2(x):
    return '—' if x is None else f'{x:.2f}'


def f1(x):
    return '—' if x is None else f'{x:.1f}'


def st2(x):
    return '—' if x is None else f'{x:.2f}'.lstrip('0')


def kana(s):
    import unicodedata
    return unicodedata.normalize('NFKC', s or '')


def ym(d):
    return f'{d[2:4]}/{int(d[4:6])}' if d else ''


def page(r, s, same_branch, css_v):
    no, name = r['no'], r['name']
    plain = name.replace(' ', '')
    title = f'{plain}（{no}）の成績・コース別データ・負け筋｜GACHIIKU'
    desc = (f'{plain}選手（{r["branch"]}支部・{r["cls"]}・{r["age"]}歳）の勝率{f2(r["win"])}・2連対率{f1(r["quin"])}%・平均ST{st2(r["st"])}。'
            f'コース別の1着率や決まり手・負け筋、期別成績、優出履歴をまとめて掲載。')
    url = f'{BASE}r/{no}.html'
    courses = (s or {}).get('course') or []
    lose = (s or {}).get('lose1y') or []

    # コース別成績（過去データがあればそれ、なければ期別データ）
    rows = []
    for i in range(6):
        c = courses[i] if i < len(courses) else None
        if not c or not c.get('n'):
            c0 = r['courses'][i]
            rows.append(f'<tr><th><span class="ln ln-{i+1}">{i+1}</span></th><td>{c0["n"]}</td><td>{f1(c0["r1"])}</td>'
                        f'<td>{f1(c0["r2"])}</td><td>{f1(c0["r3"])}</td><td>{st2(c0["st"])}</td></tr>')
        else:
            rows.append(f'<tr><th><span class="ln ln-{i+1}">{i+1}</span></th><td>{c["n"]}</td><td>{f1(c["r1"])}</td>'
                        f'<td>{f1(c["r2"])}</td><td>{f1(c["r3"])}</td><td>{st2(c["st"])}</td></tr>')

    # 負け筋（文章）
    lose_items = []
    for i, a in enumerate(lose):
        if not a.get('n') or not a.get('by'):
            continue
        top = a['by'][:2]
        parts = '、'.join(f'{c}コースの{KS.get(k, k)}（{n / a["n"] * 100:.0f}%）' for c, k, n in top)
        lose_items.append(f'<li><b>{i+1}コース</b>：{a["n"]}走中{a["lost"]}回負け。主な負け方は{parts}</li>')

    hist = ''.join(f'<tr><td>{ym(h.get("from"))}〜{ym(h.get("to"))}</td><td>{e(h["cls"])}</td><td>{f2(h["win"])}</td>'
                   f'<td>{f1(h["quin"])}</td><td>{st2(h["st"])}</td><td>{h["starts"]}</td><td>{h["champs"]}</td></tr>'
                   for h in r['hist'][:10])
    finals = (s or {}).get('finals') or []
    fin = ''.join(f'<li>{f[0][:4]}/{int(f[0][4:6])}/{int(f[0][6:])} {VEN[f[1]]} {e(f[3])} {e(f[2])}：'
                  f'{"優勝" if f[7] == 1 else (str(f[7]) + "着" if isinstance(f[7], int) else e(str(f[7])))}</li>'
                  for f in finals[:8])
    peers = ''.join(f'<a href="{p["no"]}.html">{e(p["name"])}</a>' for p in same_branch)

    ld = {'@context': 'https://schema.org', '@type': 'Person', 'name': plain, 'alternateName': kana(r['kana']),
          'jobTitle': 'ボートレーサー', 'identifier': str(no), 'url': url,
          'memberOf': {'@type': 'SportsOrganization', 'name': f'{r["branch"]}支部'}}
    crumbs = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'GACHIIKU', 'item': BASE},
        {'@type': 'ListItem', 'position': 2, 'name': '選手データ', 'item': BASE + 'players.html'},
        {'@type': 'ListItem', 'position': 3, 'name': plain, 'item': url}]}

    return f'''<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#12305f">
  <title>{e(title)}</title>
  <meta name="description" content="{e(desc)}">
  <link rel="canonical" href="{url}">
  <link rel="icon" href="../favicon.svg" type="image/svg+xml">
  <meta property="og:type" content="profile">
  <meta property="og:site_name" content="GACHIIKU">
  <meta property="og:title" content="{e(title)}">
  <meta property="og:description" content="{e(desc)}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="{BASE}ogp.png">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
  <script type="application/ld+json">{json.dumps(crumbs, ensure_ascii=False)}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=Noto+Sans+JP:wght@400;500;700;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/style.css?v={css_v}">
</head>
<body>
  <header class="hdr"><div class="hdr__inner">
    <a class="logo" href="../index.html" aria-label="GACHIIKU トップ"><span class="logo__mark">G</span><span class="logo__txt">GACHIIKU<small>ボートレース データ</small></span></a>
    <nav class="nav" aria-label="メイン"><a href="../index.html#venues">出走表</a><a href="../index.html#ranking">場傾向</a><a href="../index.html#finder">レース検索</a><a href="../players.html" class="is-active">選手</a></nav>
    <a class="hdr__next" id="next-dl" hidden></a>
  </div></header>
  <main class="sp">
    <nav class="sp-crumb" aria-label="パンくず"><a href="../index.html">トップ</a> › <a href="../players.html">選手データ</a> › {e(plain)}</nav>
    <h1 class="sp-h1">{e(name)}<small>{e(kana(r["kana"]))}・登番{no}</small></h1>
    <p class="sp-lead">{e(r["branch"])}支部・{e(r["cls"])}級・{r["age"]}歳・{r["grad"]}期・出身{e(r.get("home") or "—")}・{r["height"]}cm / {r["weight"]}kg</p>
    <dl class="rp-kpis">
      <div><dt>勝率</dt><dd>{f2(r["win"])}</dd></div><div><dt>2連対率</dt><dd>{f1(r["quin"])}%</dd></div>
      <div><dt>平均ST</dt><dd>{st2(r["st"])}</dd></div><div><dt>1着</dt><dd>{r["w1"]}回</dd></div>
      <div><dt>優出 / 優勝</dt><dd>{r["finals"]} / {r["champs"]}</dd></div><div><dt>能力指数</dt><dd>{r["ability"] if r["ability"] is not None else "—"}</dd></div>
    </dl>
    <p class="rp-note">{ym(r["from"])}〜{ym(r["to"])}の期別成績（出走{r["starts"]}回）</p>
    <a class="sp-cta" href="../players.html#r/{no}">負け筋・全出走・映像をくわしく見る →</a>

    <section class="card sp-sec"><h2 class="card__h">{e(plain)}のコース別成績</h2>
      <div class="rp-tbl-wrap"><table class="rp-tbl sp-tbl"><thead><tr><th>コース</th><th>出走</th><th>1着率</th><th>2連対率</th><th>3連対率</th><th>平均ST</th></tr></thead>
      <tbody>{''.join(rows)}</tbody></table></div></section>

    {f'<section class="card sp-sec"><h2 class="card__h">{e(plain)}の負け筋（直近1年）</h2><ul class="sp-list">{"".join(lose_items)}</ul></section>' if lose_items else ''}

    <section class="card sp-sec"><h2 class="card__h">{e(plain)}の期別成績</h2>
      <div class="rp-tbl-wrap"><table class="rp-tbl sp-tbl"><thead><tr><th>期間</th><th>級別</th><th>勝率</th><th>2連対率</th><th>平均ST</th><th>出走</th><th>優勝</th></tr></thead>
      <tbody>{hist}</tbody></table></div></section>

    {f'<section class="card sp-sec"><h2 class="card__h">{e(plain)}の優出履歴</h2><ul class="sp-list">{fin}</ul></section>' if fin else ''}

    <section class="card sp-sec"><h2 class="card__h">{e(r["branch"])}支部の選手</h2><div class="sp-peers">{peers}</div></section>
  </main>
  <footer class="ftr"><div class="ftr__inner">
    <div class="logo"><span class="logo__mark">G</span><span class="logo__txt">GACHIIKU<small>ボートレース データ</small></span></div>
    <nav class="ftr__nav"><a href="../index.html">出走表</a><a href="../players.html">選手</a><a href="../terms.html#terms">利用規約</a><a href="../terms.html#privacy">プライバシーポリシー</a><a href="../terms.html#contact">お問い合わせ</a></nav>
    <p class="ftr__note">※ GACHIIKUは非公式のファンサイトです。成績データの出典：BOAT RACE オフィシャルウェブサイト（独自に集計）。舟券の購入は20歳になってから。</p>
  </div></footer>
  <script src="../js/nextdl.js?v={css_v}" data-base="../"></script>
</body>
</html>
'''


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / '_site'
    idx = json.loads((RAC / 'index.json').read_text(encoding='utf-8'))
    cols = idx['cols']
    rows = [dict(zip(cols, r)) for r in idx['rows']]
    by_branch = {}
    for r in sorted(rows, key=lambda x: -(x['ability'] or 0)):
        by_branch.setdefault(r['branch'], []).append(r)
    css_v = datetime.now().strftime('%Y%m%d%H')
    (out / 'r').mkdir(parents=True, exist_ok=True)
    n = 0
    for row in rows:
        no = row['no']
        rp = RAC / 'r' / f'{no}.json'
        if not rp.exists():
            continue
        r = json.loads(rp.read_text(encoding='utf-8'))
        sp = RAC / 's' / f'{no}.json'
        s = json.loads(sp.read_text(encoding='utf-8')) if sp.exists() else None
        peers = [p for p in by_branch.get(r['branch'], []) if p['no'] != no][:12]
        (out / 'r' / f'{no}.html').write_text(page(r, s, peers, css_v), encoding='utf-8')
        n += 1

    today = datetime.now().strftime('%Y-%m-%d')
    urls = [(BASE, 'hourly', '1.0'), (BASE + 'players.html', 'daily', '0.8'), (BASE + 'race.html', 'hourly', '0.5'),
            (BASE + 'terms.html', 'monthly', '0.2')]
    urls += [(f'{BASE}r/{r["no"]}.html', 'daily', '0.6') for r in rows]
    body = ''.join(f'  <url><loc>{u}</loc><lastmod>{today}</lastmod><changefreq>{c}</changefreq><priority>{p}</priority></url>\n'
                   for u, c, p in urls)
    (out / 'sitemap.xml').write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}</urlset>\n', encoding='utf-8')
    print(f'選手ページ: {n}件、サイトマップ: {len(urls)}件')


if __name__ == '__main__':
    main()
