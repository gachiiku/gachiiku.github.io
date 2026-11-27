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

  // ---------- 穴予想（アナ姫） ----------
  // 機力や級だけでなく、選手の特徴から「展開」を読む穴予想。
  //   1) 1コースの崩れやすさ：イン逃げ率と、負け方（差され・捲られ・捲られ差し）の割合（直近1年。SG・G1開催ならSG・G1だけ）
  //      1コースの舟足（出足・伸び足）、2コースよりスタートが遅い、F持ち で増減
  //   2) 攻める艇：2〜6コースの艇の、そのコースでの差し・捲り・捲り差しの割合を、
  //      1コースの負け方と合わせ（捲られやすいイン×捲りの多い艇 など）、舟足（捲り＝伸び足、差し・捲り差し＝出足）と
  //      コース別平均ST（内の艇より早いと捲りやすい。F持ちは遅く見る）で増減
  //   3) 展開の恩恵：内の艇が捲りに行くと、その外の艇の捲り差しが届きやすい
  //   この「展開の確率」を、侍のAIの確率に25%混ぜたものが「アナ姫の1着確率」。
  //   人気の目安（コース別1着率と全国勝率だけ）より1.3倍以上高く、10%以上ある艇を穴とし、その艇の1着から5点。
  const ANA = { minP: 0.10, ratio: 1.3, mix: 0.25 };
  const ABT = { n: 945, cover: 243, hit: 11.1, roi: 99, avg: 4441, from: '2026/11/22', to: '2026/11/27' };
  const shrink = (p, n, prior, k = 10) => (p * n + prior * k) / (n + k);

  function scenario(pr, opt) {
    const by = {};
    pr.f.forEach((x) => { by[x.c] = x; });
    const big = !!opt.big;
    const kimOf = (x) => {
      const k = x.s && x.s.kimt ? (x.s.kimt[big ? 'big' : 'all'] || {})['1y'] : null;
      let r = k ? k[x.c - 1] : null;
      if ((!r || !r[0]) && x.s && x.s.kimt) r = x.s.kimt.all['1y'][x.c - 1];
      return r && r[0] ? r : null;
    };
    const avst = (x) => {
      const a = x.s && x.s.c1y ? x.s.c1y[x.c - 1] : null;
      return (a && a.st ? a.st : (x.b.st || 0.17)) + 0.02 * Math.min(x.b.f || 0, 2);
    };
    const ai = (x) => (opt.motorAi && opt.motorAi(x.b)) || { de: 3, nobi: 3, iki: 3 };
    pr.f.forEach((x) => { x.ast = avst(x); x.ai = ai(x); x.kim = kimOf(x); });
    const inn = by[1];
    if (!inn) return null;
    const ki = inn.kim, n1 = ki ? ki[0] : 0;
    const raw = { esc: ki ? ki[1] : null, sasare: ki ? ki[2] : null, makurare: ki ? ki[3] : null, mksare: ki ? ki[4] : null, n: n1 };
    let esc = shrink(ki ? ki[1] : 55, n1, 55), sasare = shrink(ki ? ki[2] : 14, n1, 14), makurare = shrink(ki ? ki[3] : 13, n1, 13), mksare = shrink(ki ? ki[4] : 8, n1, 8);
    esc *= 1 + 0.08 * (inn.ai.de - 3) + 0.05 * (inn.ai.nobi - 3);
    const late = by[2] ? Math.max(0, inn.ast - by[2].ast - 0.02) : 0;
    esc *= 1 - 3 * late;
    if ((inn.b.f || 0) >= 1) esc *= 0.93;
    esc = Math.min(Math.max(esc, 15), 85) / 100;
    const att = {};
    for (let c = 2; c <= 6; c++) {
      const x = by[c];
      if (!x) continue;
      const k = x.kim, n = k ? k[0] : 0;
      let sashi = shrink(k ? k[2] : 0, n, [0, 0, 10, 4, 3, 2, 1][c]);
      let mak = shrink(k ? k[3] : 0, n, [0, 0, 3, 6, 6, 3, 2][c]);
      let mks = shrink(k ? k[4] : 0, n, [0, 0, 1, 4, 5, 4, 2][c]);
      const gap = by[c - 1] ? by[c - 1].ast - x.ast : 0;
      mak *= (1 + 0.25 * (x.ai.nobi - 3)) * (1 + 6 * Math.max(-0.1, Math.min(gap, 0.08))) * Math.pow(makurare / 13, 0.7);
      sashi *= (1 + 0.15 * (x.ai.de - 3)) * Math.pow(sasare / 14, 0.7);
      mks *= (1 + 0.2 * (x.ai.de - 3)) * Math.pow(mksare / 8, 0.7);
      att[c] = { sashi, mak, mks, gap, boost: 0 };
    }
    for (let c = 4; c <= 6; c++) {
      if (att[c] && att[c - 1]) { const bst = att[c - 1].mak / 15; att[c].mks *= 1 + bst; att[c].boost = bst; }
    }
    const tot = {};
    Object.keys(att).forEach((c) => { tot[c] = att[c].sashi + att[c].mak + att[c].mks; });
    const T = Object.values(tot).reduce((s, v) => s + v, 0) || 1;
    const q = { 1: esc };
    Object.keys(tot).forEach((c) => { q[c] = (1 - esc) * tot[c] / T; });
    let sum = 0;
    pr.f.forEach((x) => { x.sp = ANA.mix * (q[x.c] || 0) + (1 - ANA.mix) * x.p; sum += x.sp; });
    pr.f.forEach((x) => { x.sp /= sum; x.att = att[x.c] || null; });
    // 3連単（ハーヴィル式）
    const tri = [];
    pr.f.forEach((a) => pr.f.forEach((b) => pr.f.forEach((c) => {
      if (a === b || b === c || a === c) return;
      tri.push({ k: [a.b.lane, b.b.lane, c.b.lane], p: a.sp * (b.sp / (1 - a.sp)) * (c.sp / (1 - a.sp - b.sp)) });
    })));
    tri.sort((x, y) => y.p - x.p);
    return { by, inn, esc, raw, tri };
  }

  function ana(pr, opt) {
    const z0 = pr.f.map((x) => x.parts.course + x.parts.nat);
    const e0 = z0.map((v) => Math.exp(v)), t0 = e0.reduce((s, v) => s + v, 0);
    pr.f.forEach((x, i) => { x.q = e0[i] / t0; });
    const sc = scenario(pr, opt);
    if (!sc) return { sc: null, opt };
    const fav = [...pr.f].sort((a, b) => b.sp - a.sp)[0];
    const cand = pr.f.filter((x) => x !== fav && x.sp >= ANA.minP && x.sp / x.q >= ANA.ratio);
    if (!cand.length) return { sc, fav, opt };
    const a = cand.reduce((m, x) => (x.sp / x.q > m.sp / m.q ? x : m));
    return { sc, fav, a, opt, tri: sc.tri.filter((t) => t.k[0] === a.b.lane).slice(0, 5) };
  }

  // 根拠（選手の特徴から読んだ展開）
  function anaReasons(pr, x) {
    const { sc, a } = x;
    const out = [];
    const nm = (y) => `${y.b.lane}号艇 ${esc(y.b.name)}`;
    const p0 = (v) => (v == null ? '—' : `${Math.round(v)}%`);
    const inn = sc.inn, r = sc.raw;
    if (r.n) {
      const lose = [['差され', r.sasare], ['捲られ', r.makurare], ['捲られ差し', r.mksare]].sort((p, q) => q[1] - p[1]);
      out.push(['1コース', `${nm(inn)}のイン逃げ率 ${p0(r.esc)}（${r.n}走）。負け方は${lose[0][0]} ${p0(lose[0][1])}が一番多い`]);
    } else out.push(['1コース', `${nm(inn)}は1コースのデータが少ない`]);
    const flags = [];
    if ((inn.b.f || 0) >= 1) flags.push(`F${inn.b.f}持ちでスタートは慎重になりやすい`);
    if (inn.ai.de <= 2 || inn.ai.nobi <= 2) flags.push(`舟足は出足${inn.ai.de}・伸び足${inn.ai.nobi}と見劣り`);
    if (pr.f.find((y) => y.c === 2) && inn.ast - pr.f.find((y) => y.c === 2).ast > 0.02) flags.push('2コースより平均STが遅い');
    if (flags.length) out.push(['イン不安', flags.join('、')]);
    // 隊形・調整（確率には入れず、読みの材料として出す。過去のレースで確率への効き目が確かめられないため）
    const form = [];
    const moved = pr.f.filter((y) => y.b.exCourse && y.b.exCourse !== y.b.lane);
    if (moved.length) {
      const mv = window.GALERT ? GALERT.moves(pr.f.map((y) => y.b)) : {};
      const mae = moved.filter((y) => mv[y.b.lane] === 'mae').map((y) => `${y.b.lane}号艇が${y.b.exCourse}コースへ前づけ`);
      const outs = moved.filter((y) => mv[y.b.lane] === 'out').map((y) => `${y.b.lane}号艇が${y.b.exCourse}コースに出た`);
      form.push(`展示で進入が変化（${mae.concat(outs).join('・') || moved.map((y) => `${y.b.lane}号艇→${y.b.exCourse}コース`).join('・')}）`);
    }
    const c3 = pr.f.find((y) => y.c === 3);
    if (x.opt.exKado && c3) form.push(`展示で3角：3コースの${nm(c3)}がダッシュに引き、スローは2艇だけ`);
    else if (c3 && window.GTAG && GTAG.kadoCount(c3.b.no)) form.push(`3コースの${nm(c3)}は本番で3角にした歴あり（${GTAG.kadoCount(c3.b.no)}回）`);
    const c2 = pr.f.find((y) => y.c === 2);
    if (c2 && window.GTAG) { const m = GTAG.marks(c2.b.no, 2).find(([l]) => l === '握'); if (m) form.push(`2コースの${nm(c2)}は握る傾向（${m[1].replace(/^2コース握り率 /, '')}）。3・4コースの捲るすき間が狭くなる`); }
    pr.f.filter((y) => y.b.tilt != null && y.b.tilt >= 1.5 && y.c < 6).forEach((y) => {
      const out1 = pr.f.find((z) => z.c === y.c + 1);
      form.push(`${nm(y)}はチルト+${y.b.tilt}で伸び型${out1 ? `。外の${out1.b.lane}号艇はこの艇をマークして捲り差しを狙える` : ''}`);
    });
    if (form.length) out.push(['隊形', form.join('／')]);
    if (a) {
      const t = a.att || {};
      const way = [['差し', t.sashi || 0], ['捲り', t.mak || 0], ['捲り差し', t.mks || 0]].sort((p, q) => q[1] - p[1])[0][0];
      const k = a.kim;
      const rate = k ? { 差し: k[2], 捲り: k[3], 捲り差し: k[4] }[way] : null;
      out.push(['攻め手', `${nm(a)}は${a.c}コースからの${way}が${rate != null ? ` ${p0(rate)}（${k[0]}走）` : '武器'}`]);
      out.push(['舟足', `出足${a.ai.de}・行き足${a.ai.iki}・伸び足${a.ai.nobi}（モーターのAI評価）`]);
      const st = [`${a.c}コースの平均ST .${String(Math.round(a.ast * 100)).padStart(2, '0')}`];
      if (t.gap > 0.01) st.push(`内の艇より ${t.gap.toFixed(2)} 早い`);
      if ((a.b.f || 0) >= 1) st.push(`F${a.b.f}持ち`);
      out.push(['スタート', st.join('・')]);
      if (t.boost > 0.15) {
        const inner = pr.f.find((y) => y.c === a.c - 1);
        out.push(['展開', `内の${nm(inner)}が捲りに行けば、その外から捲り差しが届く形`]);
      }
      out.push(['期待値', `アナ姫の1着確率 ${(a.sp * 100).toFixed(1)}% に対し、コースと勝率だけの人気の目安は ${(a.q * 100).toFixed(1)}%`]);
    }
    return out;
  }

  function anaTalk(pr, x) {
    if (!x.sc) return 'あら、今回はデータが足りませんの。見送りですわ。';
    const r = x.sc.raw;
    const inn = x.sc.inn;
    const lose = r.n ? [['差され', r.sasare], ['捲られ', r.makurare], ['捲られ差し', r.mksare]].sort((p, q) => q[1] - p[1])[0][0] : null;
    if (!x.a) return `${inn.b.lane}号艇 ${esc(inn.b.name)}のイン戦は${Math.round(x.sc.esc * 100)}%ほどと見ますわ。崩れる筋も人気どおりで、わたくしの眼鏡にかなう穴は見当たりませんの。今回は見送りですわ。`;
    const a = x.a, t = a.att || {};
    const way = [['差し', t.sashi || 0], ['捲り', t.mak || 0], ['捲り差し', t.mks || 0]].sort((p, q) => q[1] - p[1])[0][0];
    const lines = [`見つけましたわ！ ${a.b.lane}号艇 ${esc(a.b.name)}（${a.c}コース）の${way}ですの。`];
    if (lose) lines.push(`1号艇 ${esc(inn.b.name)}は${lose}負けが目立ちますから、${way === '差し' || way === '捲り差し' ? '内が空く' : '外から叩かれる'}形がありますわ。`);
    if (t.boost > 0.15) lines.push(`内の艇が捲りに行けば、その外から捲り差しがきれいに決まりますわよ。`);
    else if (way === '捲り' && t.gap > 0.01) lines.push('スタートで内より前に出られる分、伸びで押し切れますわ。');
    lines.push('級や勝率だけでは見過ごされそうな一撃、お狙いあそばせ。');
    if (!pr.hasEx) lines.push('まだ展示前ですから、展示のあとにもう一度見て差し上げますわ。');
    return lines.join('');
  }

  // opt: { big: SG・G1開催か, motorAi: (b) => {de, iki, nobi}, exKado: 展示で3角だったか }
  function anaCard(boats, courseOf, result, opt = {}) {
    if (boats.length < 6) return '';
    const pr = predict(boats, courseOf);
    const x = ana(pr, opt);
    const hitKey = result && result.order ? result.order.join('-') : null;
    const tri = x.a ? x.tri.map((t, i) => `<li class="${hitKey === t.k.join('-') ? 'is-hit' : ''}"><small>${i + 1}</small>${t.k.map((l) => `<span class="ln ln-${l}">${l}</span>`).join('<i>-</i>')}<b>${(t.p * 100).toFixed(1)}%</b>${hitKey === t.k.join('-') ? '<em>的中</em>' : ''}</li>`).join('') : '';
    const res = x.a && hitKey ? `<p class="ai-res">結果 ${hitKey}：${x.tri.some((t) => t.k.join('-') === hitKey) ? '<b class="is-hit">穴的中！</b>' : result.order[0] === x.a.b.lane ? '<b>穴の艇が1着</b>（3連単は外れ）' : '外れ'}</p>` : '';
    const reasons = x.sc ? anaReasons(pr, x) : [];
    const why = reasons.length ? `<dl class="ana-why">${reasons.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` : '';
    const body = x.a ? `<div class="ai-grid">
        <div><h5 class="rp-sub">穴の艇</h5><div class="ana-pick"><span class="ln ln-${x.a.b.lane}">${x.a.b.lane}</span>
          <div><b>${esc(x.a.b.name)}</b><small>${x.a.c}コース</small></div>
          <dl><div><dt>アナ姫の1着確率</dt><dd>${(x.a.sp * 100).toFixed(1)}%</dd></div><div><dt>人気の目安</dt><dd>${(x.a.q * 100).toFixed(1)}%</dd></div><div><dt>差</dt><dd class="is-up">${(x.a.sp / x.a.q).toFixed(1)}倍</dd></div></dl></div>
          <h5 class="rp-sub">展開の読み</h5>${why}</div>
        <div><h5 class="rp-sub">3連単 穴5点 <small>${x.a.b.lane}号艇の1着から</small></h5><ol class="ai-tri">${tri}</ol>${res}</div>
      </div>` : (why ? `<h5 class="rp-sub">展開の読み</h5>${why}` : '');
    return `<div class="card ai ai--ana">
      <h4 class="card__h">穴予想 <small>アナ姫が展開から穴を見つけて差し上げますわ</small><span class="ai-conf ${x.a ? 'is-ana' : 'is-futsu'}">${x.a ? '穴あり' : '見送り'}</span></h4>
      <div class="ai-head"><img class="ai-sam" src="img/anahime.svg?v=1" alt="アナ姫" width="96" height="96">
        <div class="ai-say"><b>アナ姫</b><p>${anaTalk(pr, x)}</p></div></div>
      ${body}
      <p class="rp-def">機力や級だけでなく、選手の特徴から展開を読みます：1コースのイン逃げ率と負け方（差され・捲られ・捲られ差し）、2〜6コースの艇のそのコースでの決まり手、モーターの出足・伸び足（AI評価）、コース別の平均ST（F持ちは遅めに見る）、内の艇が捲ったときの外の捲り差し。展示の進入・3角・2コースの握り・チルトは「隊形」として読みに書きます（確率への効き目がまだ確かめられないため、確率には入れていません）。これを侍のAI予想に25%混ぜて「アナ姫の1着確率」とし、コースと全国勝率だけで見た「人気の目安」より${ANA.ratio}倍以上高く、${ANA.minP * 100}%以上ある艇を穴にします（オッズは見ていません）。過去${ABT.n}レース（${ABT.from}〜${ABT.to}）で試した成績：穴ありは${ABT.cover}レース、穴5点の的中 ${ABT.hit}%、平均配当 ${ABT.avg.toLocaleString()}円、5点ずつ買った場合の回収率 ${ABT.roi}%。数字は大きくぶれます。当たりを約束するものではありません。舟券は20歳になってから、ご自身の判断で。</p>
    </div>`;
  }

  window.GAI = { predict, card, anaCard };
})();
