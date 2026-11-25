/* =========================================================
   GACHIIKU — AI予想（ガチイク侍）
   出走表のデータだけで、各艇の1着の確率を出し、3連単の買い目を作る。
     強さ = log(コース別1着率) + 0.3×全国勝率の差 + 0.1×モーター2連率の差/10
            + 0.6×展示タイムの差×10 + 0.6×平均STの差×10        （差はそのレース6艇の平均との差）
     コース別1着率は、出走数が少ないと全体の平均（1コース55%…6コース3%）に寄せる
     1着の確率 = 強さのソフトマックス、2・3着は残りの艇で同じ計算（ハーヴィル式）
   重みは過去のレース（data/archive の展示ありのレース）で、1着を一番よく当てる値に合わせた。
   ========================================================= */
(() => {
  const PRI = [55, 14, 12, 10, 6, 3]; // コースごとの全体の1着率（%）
  const W = { nat: 0.3, mot: 0.1, ex: 0.6, st: 0.6 };
  // 過去のレースでの成績（scripts で確かめた数字。重みを変えたら測り直す）
  const BT = { n: 496, win: 58.9, base: 56.9, tri5: 31.7, from: '2026/11/22', to: '2026/11/25' };
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mean = (a) => { const xs = a.filter((x) => x != null); return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null; };

  // boats: [{ b, s }]、courseOf(b)：その艇のコース
  function predict(boats, courseOf) {
    const f = boats.map(({ b, s }) => {
      const c = courseOf(b);
      const a = s && s.c1y ? s.c1y[c - 1] : null;
      const n = a ? a.n : 0, r1 = a && a.r1 != null ? a.r1 : PRI[c - 1];
      return { b, s, c, n, r1: (r1 * n + PRI[c - 1] * 15) / (n + 15), nat: b.nat, mot: b.motor2, ex: b.exTime || null, st: b.st };
    });
    const m = { nat: mean(f.map((x) => x.nat)), mot: mean(f.map((x) => x.mot)), ex: mean(f.map((x) => x.ex)), st: mean(f.map((x) => x.st)) };
    const hasEx = f.every((x) => x.ex);
    f.forEach((x) => {
      x.parts = {
        course: Math.log(Math.max(x.r1, 0.5)),
        nat: x.nat != null ? W.nat * (x.nat - m.nat) : 0,
        mot: x.mot != null ? W.mot * (x.mot - m.mot) / 10 : 0,
        ex: hasEx ? W.ex * (m.ex - x.ex) * 10 : 0,
        st: x.st != null ? W.st * (m.st - x.st) * 10 : 0,
      };
      x.z = Object.values(x.parts).reduce((s, v) => s + v, 0);
    });
    const e = f.map((x) => Math.exp(x.z)), tot = e.reduce((s, v) => s + v, 0);
    f.forEach((x, i) => { x.p = e[i] / tot; });
    // 3連単（ハーヴィル式）
    const tri = [];
    f.forEach((a) => f.forEach((b) => f.forEach((c) => {
      if (a === b || b === c || a === c) return;
      tri.push({ k: [a.b.lane, b.b.lane, c.b.lane], p: a.p * (b.p / (1 - a.p)) * (c.p / (1 - a.p - b.p)) });
    })));
    tri.sort((x, y) => y.p - x.p);
    return { f, tri, hasEx, rank: [...f].sort((x, y) => y.p - x.p) };
  }

  // 侍のひとこと（データから組み立てる。決まった言い回しのみ）
  function talk(pr) {
    const [h, t2, t3] = pr.rank;
    const nm = (x) => `${x.b.lane}号艇 ${esc(x.b.name)}`;
    const lines = [];
    const conf = h.p >= 0.6 ? 'kata' : h.p < 0.35 ? 'kon' : 'futsu';
    if (h.c === 1) lines.push(conf === 'kata' ? `${nm(h)}の逃げ、まず揺るがぬでござる。` : `本命は${nm(h)}の逃げでござる。`);
    else lines.push(`イン受難と見た。${h.c}コースの${nm(h)}を本命に推すでござる。`);
    const ex = pr.hasEx ? [...pr.f].sort((a, b) => a.ex - b.ex)[0] : null;
    if (ex && ex !== h) lines.push(`展示タイム一番の${nm(ex)}${ex.c >= 3 ? 'の攻め' : ''}にも用心めされよ。`);
    else if (t2.c > h.c && t2.c >= 3) lines.push(`相手は外から${t2.c}コースで攻める${nm(t2)}でござる。`);
    else lines.push(`相手筆頭は${nm(t2)}、三番手に${nm(t3)}でござる。`);
    if (conf === 'kon') lines.push('されど、ここは混戦。点数を広げて勝負するがよかろう。');
    if (!pr.hasEx) lines.push('※まだ展示前ゆえ、展示のあとに見直すでござる。');
    return { text: lines.join(''), conf };
  }

  function card(boats, courseOf, result) {
    if (boats.length < 6) return '';
    const pr = predict(boats, courseOf);
    const tk = talk(pr);
    const CONF = { kata: ['堅い', 'is-kata'], futsu: ['本線', 'is-futsu'], kon: ['混戦', 'is-kon'] }[tk.conf];
    const mark = ['◎', '○', '▲', '△', '×', ''];
    const bars = pr.rank.map((x, i) => `<li><span class="ai-mk">${mark[i]}</span><span class="ln ln-${x.b.lane}">${x.b.lane}</span>
      <span class="ai-nm">${esc(x.b.name)}<small>${x.c}コース</small></span>
      <span class="ai-bar"><i style="width:${(x.p * 100).toFixed(1)}%"></i></span><b>${(x.p * 100).toFixed(1)}%</b></li>`).join('');
    const top = pr.tri.slice(0, 5);
    const hitKey = result && result.order ? result.order.join('-') : null;
    const tri = top.map((t, i) => `<li class="${hitKey === t.k.join('-') ? 'is-hit' : ''}"><small>${i + 1}</small>${t.k.map((l) => `<span class="ln ln-${l}">${l}</span>`).join('<i>-</i>')}<b>${(t.p * 100).toFixed(1)}%</b>${hitKey === t.k.join('-') ? '<em>的中</em>' : ''}</li>`).join('');
    const sum5 = top.reduce((s, t) => s + t.p, 0);
    const res = result && result.order ? `<p class="ai-res">結果 ${result.order.join('-')}：${hitKey && top.some((t) => t.k.join('-') === hitKey) ? '<b class="is-hit">3連単的中</b>' : result.order[0] === pr.rank[0].b.lane ? '<b>本命1着</b>（3連単は外れ）' : '外れ'}</p>` : '';
    return `<div class="card ai">
      <h4 class="card__h">AI予想 <small>ガチイク侍がデータで斬る</small><span class="ai-conf ${CONF[1]}">${CONF[0]}</span></h4>
      <div class="ai-head"><img class="ai-sam" src="img/samurai.svg?v=2" alt="ガチイク侍" width="96" height="96">
        <div class="ai-say"><b>ガチイク侍</b><p>${tk.text}</p></div></div>
      <div class="ai-grid">
        <div><h5 class="rp-sub">1着の確率</h5><ol class="ai-rank">${bars}</ol></div>
        <div><h5 class="rp-sub">3連単 おすすめ5点 <small>5点で${(sum5 * 100).toFixed(0)}%</small></h5><ol class="ai-tri">${tri}</ol>${res}</div>
      </div>
      <p class="rp-def">コース別1着率（直近1年）・全国勝率・モーター2連率・展示タイム・平均STから計算した確率です${pr.hasEx ? '' : '（展示前なので展示タイムは入っていません）'}。過去${BT.n}レース（${BT.from}〜${BT.to}）で試した成績：本命の1着 ${BT.win}%（1号艇がいつも1着とした場合 ${BT.base}%）、3連単5点の的中 ${BT.tri5}%。当たりを約束するものではありません。舟券は20歳になってから、ご自身の判断で。</p>
    </div>`;
  }

  window.GAI = { predict, card };
})();
