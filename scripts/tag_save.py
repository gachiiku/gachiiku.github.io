#!/usr/bin/env python3
"""AIが映像を見て付けた判定を保存して公開する。

使い方: python3 scripts/tag_save.py 判定.json
判定.json の形:
  {"tags": {"20261120-24-3": {"g": "握"|"差"|"他", "k": 0|1, "z": 0|1}},   # 確信が持てた項目だけ入れる
   "skip": {"20261120-1-10": "ナイターで暗く見分けられない"},             # 判定できなかったレース（次から出さない）
   "kskip": {"20261121-2-5": "スタート前が映らない"}}                     # 3カドだけ見送り（--kado の一覧から外す）
保存先: data/tags/YYYYMM.json（タグ）と data/tags/skip.json（見送り）。そのあと git に記録して push する
（push されると公開作業が動き、数分でサイトの指標に反映される）。
"""
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TAGS = ROOT / 'data' / 'tags'


def dump(path, data):
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace(',"20', ',\n"20') + '\n'
    path.write_text(body, encoding='utf-8')


def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True)


def main(src):
    new = json.loads(Path(src).read_text(encoding='utf-8'))
    at = datetime.now().strftime('%Y-%m-%d %H:%M')
    git('pull', '-q', '--rebase')
    months = {}
    for key, t in (new.get('tags') or {}).items():
        x = {k: t[k] for k in ('g', 'k', 'z') if t.get(k) is not None}
        if x.get('g') not in (None, '握', '差', '他') or any(x.get(k) not in (None, 0, 1) for k in ('k', 'z')):
            print(f'  値がおかしいので飛ばします: {key} {t}', file=sys.stderr)
            continue
        if x:
            months.setdefault(key[:6], {})[key] = {**x, 'at': at, 'by': 'AI判定'}
    for m, add in months.items():
        p = TAGS / f'{m}.json'
        d = json.loads(p.read_text(encoding='utf-8')) if p.exists() else {'tags': {}}
        tags = d.get('tags', {})
        for k, t in add.items():  # すでにある判定（握りなど）は消さずに足す
            tags[k] = {**tags.get(k, {}), **t}
        out = {'updatedAt': at, 'tags': dict(sorted(tags.items()))}
        if d.get('kskip'):
            out['kskip'] = d['kskip']
        dump(p, out)
    for key, why in (new.get('kskip') or {}).items():
        p = TAGS / f'{key[:6]}.json'
        d = json.loads(p.read_text(encoding='utf-8')) if p.exists() else {'tags': {}}
        d['kskip'] = {**d.get('kskip', {}), key: why}
        d['updatedAt'] = at
        dump(p, d)
    if new.get('skip'):
        p = TAGS / 'skip.json'
        d = json.loads(p.read_text(encoding='utf-8')) if p.exists() else {'skip': {}}
        skip = {**d.get('skip', {}), **new['skip']}
        dump(p, {'updatedAt': at, 'skip': dict(sorted(skip.items()))})
    n = sum(len(a) for a in months.values())
    git('add', 'data/tags')
    r = git('commit', '-q', '-m', f'映像タグ: AI判定 {n}レース・見送り {len(new.get("skip") or {})}レース\n\nCo-Authored-By: Claude <noreply@anthropic.com>')
    if r.returncode:
        print('記録するものがありませんでした')
        return
    for _ in range(3):
        if git('push', '-q').returncode == 0:
            print(f'保存して公開しました: 判定 {n}レース・見送り {len(new.get("skip") or {})}レース')
            return
        git('pull', '-q', '--rebase')
    print('push できませんでした。あとで git push してください', file=sys.stderr)
    sys.exit(1)


if __name__ == '__main__':
    main(sys.argv[1])
