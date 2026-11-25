#!/usr/bin/env python3
"""モーターの船足AI評価（出足・行き足・伸び足 1〜5、総合 S〜D）。build_motors.py から呼ぶ。

使うデータ（今のモーターが使われ始めてからの全出走。data/hist の公式の競走成績）
  ・各艇の進入コース・ST・着順・展示タイム、レースの決まり手（1着の艇のもの）

伸び足（最重要）
  ＋ 直まくり：2〜6コースから「まくり」で1着。内側の艇よりSTが0.03秒以上早かった場合は除く（スリット互角か、
     それより遅れていたのに直線で抜いた＝伸び）。3コースのツケマイも決まり手は「まくり」なので、ここに入る
  ＋ STで大きく先行してのまくり1着（内より0.03秒より早い）は、スタートの差で勝った可能性があるので 0.3回分だけ
  － 伸び負け：外の艇に「まくり」で1着を取られたレースで、自分のSTがその艇と同じかより早かった（先行していた）のに、4着以下
  ※ まくり差しの1着は、伸び足の根拠にしない（出足の根拠に入れる）
  5 は直まくり2回以上、4 は1回以上、1 は伸び負け2回以上、2 は1回以上がないと付けない（1走で極端にしない）
出足
  ＋ ターンの出口で前に出た勝ち：1コースの逃げ、2〜6コースの差し・まくり差しの1着
  － 1コースで差された・まくり差された（ターンの出口で負けた）
行き足
  展示タイム（直線の計測）の6艇の中の順位の平均。STの数字は使わない
評価の付け方
  その場の全モーターの中で比べ、平均からどれだけ離れているか（標準偏差）で 1〜5。出走が少ないと2〜4に収める
総合
  伸び足45%・出足30%・行き足25%で平均し、伸び足5なら上げ、出足1なら下げる
"""
import math

EVEN = 0.03       # スリット互角とみなすST差
MIN_RUNS = 15     # これより少ないと評価を2〜4に収める（データ不足）


def context(es):
    """1レースの各艇に、勝った艇・決まり手・内側の艇のSTを付けるための表を作る"""
    by = {e[2]: e for e in es if isinstance(e[2], int)}
    win = next((e for e in es if e[4] == 1), None)
    return by, win


def num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def features(rs):
    f = dict(n=0, mak=0, makLead=0, lost=0, msashi=0, turn=0, turnLost=0, exn=0, exs=0)
    for x in rs:
        c, pos, st, kim = x['course'], x['pos'], x['st'], x.get('kim')
        if not isinstance(c, int) or not isinstance(pos, int):
            continue
        f['n'] += 1
        if x['exRank']:
            f['exn'] += 1
            f['exs'] += x['exRank']
        if pos == 1:
            if c == 1 and kim == '逃げ':
                f['turn'] += 1
            elif c >= 2 and kim in ('差し', 'まくり差し'):
                f['turn'] += 1
                f['msashi'] += kim == 'まくり差し'
            elif c >= 2 and kim == 'まくり' and num(st):
                inner = x.get('innerSt')
                if num(inner) and inner - st > EVEN:
                    f['makLead'] += 1
                else:
                    f['mak'] += 1
        else:
            wc, wst = x.get('wc'), x.get('wst')
            if kim == 'まくり' and isinstance(wc, int) and wc > c and num(st) and num(wst) and st <= wst and pos >= 4:
                f['lost'] += 1
            if c == 1 and kim in ('差し', 'まくり差し'):
                f['turnLost'] += 1
    return f


def zgrade(z):
    return 5 if z >= 1.3 else 4 if z >= 0.5 else 3 if z > -0.5 else 2 if z > -1.3 else 1


def stats(vals):
    vals = [v for v in vals if v is not None]
    if len(vals) < 5:
        return 0, 1
    m = sum(vals) / len(vals)
    sd = math.sqrt(sum((v - m) ** 2 for v in vals) / len(vals)) or 1
    return m, sd


def evaluate(motor_runs):
    """motor_runs: {モーター番号: [出走]} → {モーター番号: 評価}"""
    F = {m: features(rs) for m, rs in motor_runs.items()}
    nobi = {m: (f['mak'] + 0.3 * f['makLead'] - 0.7 * f['lost']) / f['n'] if f['n'] >= 5 else None for m, f in F.items()}
    de = {m: (f['turn'] - f['turnLost']) / f['n'] if f['n'] >= 5 else None for m, f in F.items()}
    iki = {m: -(f['exs'] / f['exn']) if f['exn'] >= 5 else None for m, f in F.items()}
    S = {k: stats(d.values()) for k, d in (('nobi', nobi), ('de', de), ('iki', iki))}
    out = {}
    for m, f in F.items():
        few = f['n'] < MIN_RUNS
        g = {}
        for k, d in (('nobi', nobi), ('de', de), ('iki', iki)):
            v = d[m]
            if v is None:
                g[k] = 3
                continue
            mu, sd = S[k]
            g[k] = zgrade((v - mu) / sd)
            if few:
                g[k] = min(4, max(2, g[k]))
        # 伸び足は、根拠の回数がないと極端な数字にしない
        g['nobi'] = min(g['nobi'], 3 if f['mak'] == 0 else 4 if f['mak'] < 2 else 5)
        g['nobi'] = max(g['nobi'], 3 if f['lost'] == 0 else 2 if f['lost'] < 2 else 1)
        avg = 0.45 * g['nobi'] + 0.30 * g['de'] + 0.25 * g['iki']
        if g['nobi'] == 5:
            avg += 0.3
        grade = 'S' if avg >= 4.2 and min(g.values()) >= 4 else 'A' if avg >= 3.6 else 'B' if avg >= 2.9 else 'C' if avg >= 2.2 else 'D'
        if g['de'] == 1 and grade in ('S', 'A', 'B'):
            grade = 'C'
        conf = '高' if f['n'] >= 40 else '中' if f['n'] >= MIN_RUNS else '低'
        out[m] = {'de': g['de'], 'iki': g['iki'], 'nobi': g['nobi'], 'g': grade, 'conf': conf, 'f': f}
    return out
