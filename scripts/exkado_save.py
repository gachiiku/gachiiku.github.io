#!/usr/bin/env python3
"""スタート展示を映像で見て付けた3角（3カド）の判定を data/exkado.json に保存して公開する。

使い方: python3 scripts/exkado_save.py 判定.json
判定.json の形:
  {"24-5": 1, "13-7": 0, "1-9": "暗くて見分けられない"}
    1 = 3角あり（3コースの艇がダッシュに引いた） / 0 = 3角なし / 文字 = 判定できなかった理由（見送り）
保存先: data/exkado.json  {"date": "YYYYMMDD", "races": {"24-5": {"k": 1, "at": "HH:MM"}, "1-9": {"skip": "理由", "at": ...}}}
日付が変わったら前日の分は消える。push すると公開作業が動き、1〜2分で出走表に出る。
"""
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'exkado.json'


def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True)


def main(src):
    new = json.loads(Path(src).read_text(encoding='utf-8'))
    git('pull', '-q', '--rebase')
    date = json.loads((ROOT / 'data' / 'today.json').read_text(encoding='utf-8'))['date']
    cur = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    races = cur.get('races', {}) if cur.get('date') == date else {}
    at = datetime.now().strftime('%H:%M')
    n = {'あり': 0, 'なし': 0, '見送り': 0}
    for key, val in new.items():
        if val in (0, 1) and not isinstance(val, bool):
            races[key] = {'k': val, 'at': at}
            n['あり' if val else 'なし'] += 1
        elif isinstance(val, str) and val:
            races[key] = {'skip': val, 'at': at}
            n['見送り'] += 1
    OUT.write_text(json.dumps({'date': date, 'updatedAt': at, 'races': races}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    git('add', 'data/exkado.json')
    if git('commit', '-q', '-m', f'展示3角: あり{n["あり"]} なし{n["なし"]} 見送り{n["見送り"]}\n\nCo-Authored-By: Claude <noreply@anthropic.com>').returncode:
        print('記録するものがありませんでした')
        return
    for _ in range(3):
        if git('push', '-q').returncode == 0:
            print(f'保存して公開しました: 3角あり {n["あり"]} / なし {n["なし"]} / 見送り {n["見送り"]}')
            return
        git('pull', '-q', '--rebase')
    print('push できませんでした', file=sys.stderr)
    sys.exit(1)


if __name__ == '__main__':
    main(sys.argv[1])
