/* =========================================================
   GACHIIKU — 攻め方指標（映像タグから集計した 2コース握り率・3カド率・変わり全速率）
   data/tagstats.json（scripts/build_tags.py が作る）を読み、選手ページとレースページで使う
   ========================================================= */
(() => {
  const MIN = 20; // これより少ないときは「参考値」
  const PERIODS = [['3m', '3ヶ月'], ['6m', '半年'], ['1y', '1年'], ['all', '全期間']];
  let data = null, loading = null;
  const load = () => loading || (loading = fetch('data/tagstats.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null)).then((d) => { data = d; return d; }).catch(() => null));

  const rate = (x, n) => (n ? (x / n) * 100 : null);
  const p1 = (v) => (v == null ? '—' : `${v.toFixed(1)}%`);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const lead = () => (data && data.lead ? data.lead : 0.05).toFixed(2);
  const DEFS = [
    ['g2', '2コース握り率', '2コースのとき',
      () => '2コースのとき、1マークで内に差さず、1コースの外を握って回った割合。分母＝2コースの判定を付けたレース、分子＝「握り」と判定したレース。', ['握り率', '2コース時']],
    ['k3', '3コース3カド率', '3コースのとき',
      () => '3コースのとき、1・2コースだけがスローで、3コースからダッシュ（3〜6コースがダッシュ）の隊形になった割合。分母＝3カドの判定を付けたレース、分子＝「3カドあり」のレース。', ['3カド率', '3コース時']],
    ['z3', '変わり全速率', '3コース・4コース先行時',
      () => `3コースのとき、4コースにスリットで先行された（4コースのSTが3コースより${lead()}秒以上早い）レースで、内に差さず外を全速で回った割合。分母＝その条件で判定を付けたレース、分子＝「変わり全速あり」のレース。`, ['変わり全速', '3コース・4先行時']],
  ];
  const get = (no, p) => (data && data.racers[String(no)] ? data.racers[String(no)][p] : null);
  const tip = (t) => `<button type="button" class="tip" aria-label="説明" data-tip="${esc(t)}">?</button>`;

  // 発生時の内訳（その指標が起きたレースだけで数える）
  function detail(k, a) {
    if (!a || !a.x) return '';
    const it = (l, x) => `<span>${l} <b>${p1(rate(x, a.x))}</b></span>`;
    if (k === 'g2') return `<p class="tgx__sub">握ったとき（${a.x}回）：${it('3コース4着以下', a.bad3)}</p>`;
    if (k === 'k3') return `<p class="tgx__sub">3カドのとき（${a.x}回）：${it('1着', a.w1)}${it('2連対', a.w2)}${it('3連対', a.w3)}${it('まくり勝ち', a.mak)}</p>`;
    const dist = a.p5.slice(0, 6).map((n, i) => `${i + 1}着${n}`).join('・') + (a.p5[6] ? `・他${a.p5[6]}` : '');
    return `<p class="tgx__sub">変わり全速のとき（${a.x}回）：${it('6コース3連対', a.c6)}${it('1コース連対', a.c1)}${it('2コース連対', a.c2)}<span>5コース着順 <b>${dist}</b></span></p>`;
  }

  // 選手ページのカード。period は '3m' | '6m' | '1y' | 'all'、seg は期間切替のボタン
  function card(no, period, seg) {
    if (!data) return '';
    const s = get(no, period), tot = data.total ? data.total[period] : null;
    const rows = DEFS.map(([k, name, cond, def]) => {
      const a = s ? s[k] : null, n = a ? a.n : 0, r = a ? rate(a.x, n) : null;
      const avg = tot && tot[k] ? rate(tot[k].x, tot[k].n) : null;
      return `<div class="tgx__row">
        <div class="tgx__name"><b>${name}</b>${tip(def())}<small>${cond}</small></div>
        <div class="tgx__val">${n ? `<b>${p1(r)}</b>${n < MIN ? '<span class="tgx__few">参考値</span>' : ''}` : '<span class="tgx__none">データなし</span>'}</div>
        <div class="tgx__bar" aria-hidden="true"><i style="width:${r == null ? 0 : Math.min(r, 100)}%"></i>${avg != null ? `<em style="left:${Math.min(avg, 100)}%" title="全体 ${p1(avg)}"></em>` : ''}</div>
        <div class="tgx__n">${n ? `${a.x}回 / ${n}走` : '0走'}<small>全体 ${p1(avg)}</small></div>
        ${detail(k, a)}</div>`;
    }).join('');
    return `<div class="card tgx"><h4 class="card__h">攻め方指標 <small>映像タグから集計</small>${seg || ''}</h4>
      ${rows}
      <p class="rp-def">GACHIIKUの担当者がレース映像（スタート〜1周目1マーク）を見て付けた判定だけで数えています。判定のないレースは分母に入りません。${MIN}走未満は「参考値」。棒の縦線は全選手の平均。集計の基準日 ${data.base ? `${data.base.slice(0, 4)}/${+data.base.slice(4, 6)}/${+data.base.slice(6)}` : '—'}・判定済み ${data.races}レース。</p></div>`;
  }

  // レースページの1マス（その選手の直近1年）
  function cell(no, k) {
    const s = get(no, '1y'), a = s ? s[k] : null;
    if (!a || !a.n) return '—';
    return `<b>${p1(rate(a.x, a.n))}</b><small>${a.x}/${a.n}走${a.n < MIN ? '・参考' : ''}</small>`;
  }
  const has = (nos) => !!data && nos.some((no) => { const s = get(no, '1y'); return s && DEFS.some(([k]) => s[k].n); });

  // 「?」を押す（またはマウスを乗せる）と説明を出す。表の中でも切れないよう、画面に固定した吹き出しにする
  let pop = null, shownAt = 0;
  const hide = () => { if (pop) { pop.remove(); pop = null; } };
  const show = (el) => {
    hide();
    shownAt = Date.now();
    pop = document.createElement('div');
    pop.className = 'tip-pop';
    pop.textContent = el.dataset.tip;
    document.body.appendChild(pop);
    const r = el.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = `${Math.max(12, Math.min(r.left - 8, window.innerWidth - w - 12))}px`;
    pop.style.top = `${r.bottom + 6 + h > window.innerHeight ? r.top - h - 6 : r.bottom + 6}px`;
  };
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tip]');
    if (t) { e.preventDefault(); e.stopPropagation(); if (pop && pop.textContent === t.dataset.tip) hide(); else show(t); return; }
    hide();
  }, true);
  document.addEventListener('mouseover', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t && matchMedia('(hover: hover)').matches) show(t); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest && e.target.closest('[data-tip]') && matchMedia('(hover: hover)').matches) hide(); });
  window.addEventListener('scroll', () => { if (Date.now() - shownAt > 400) hide(); }, true);

  // レースページの選手名の横に付けるマーク（そのコースに入りそうなときに出やすい動き。直近1年・映像タグ）
  //   握＝2コースに入りそうで 2コース握り率50%以上（10走以上）
  //   3角＝3コースに入りそうで 3カド率40%以上（10走以上）… 3コースに入った選手がダッシュに引く
  //   変全＝3コースに入りそうで 変わり全速率50%以上（5走以上）
  const MARKS = [['g2', 2, '握', 10, 50, '2コース握り率'], ['k3', 3, '3角', 10, 40, '3カド率'], ['z3', 3, '変全', 5, 50, '変わり全速率']];
  function marks(no, course) {
    const s = get(no, '1y');
    if (!s) return [];
    return MARKS.filter(([k, c, , min, th]) => course === c && s[k].n >= min && rate(s[k].x, s[k].n) >= th)
      .map(([k, , label, , , name]) => [label, `${name} ${p1(rate(s[k].x, s[k].n))}（${s[k].x}/${s[k].n}走・直近1年）`]);
  }

  window.GTAG = { load, card, cell, has, marks, DEFS, PERIODS, tip };
})();
