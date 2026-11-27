/* =========================================================
   GACHIIKU — 選手ページ
   一覧・検索（#players）と、選手ごとの評価ページ（#r/<登番>）
   ========================================================= */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const f2 = (n) => (n == null ? '—' : n.toFixed(2));
  const f1 = (n) => (n == null ? '—' : n.toFixed(1));
  const st2 = (n) => (n == null ? '—' : n.toFixed(2).replace(/^0/, ''));
  const VENUES = ['', '桐生', '戸田', '江戸川', '平和島', '多摩川', '浜名湖', '蒲郡', '常滑', '津', '三国', 'びわこ', '住之江',
    '尼崎', '鳴門', '丸亀', '児島', '宮島', '徳山', '下関', '若松', '芦屋', '福岡', '唐津', '大村'];
  const AXES = [
    ['win', '勝率'], ['quin', '連対率'], ['start', 'スタート'], ['in', 'イン'], ['out', 'アウト'], ['big', '実績'],
  ];
  const GRADE_NOTE = { S: '上位5%', A: '上位20%', B: '上位50%', C: '上位80%', D: '下位20%', '-': '出走数不足' };

  let list = null; // [{no,name,...}]
  let meta = null;
  const state = { q: '', cls: 'all', branch: '', sort: 'ability', shown: 30 };

  async function loadIndex() {
    if (list) return list;
    const res = await fetch('data/racers/index.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    meta = await res.json();
    list = meta.rows.map((row) => Object.fromEntries(meta.cols.map((c, i) => [c, row[i]])));
    return list;
  }
  const termLabel = (m) => `${m.from.slice(0, 4)}/${+m.from.slice(4, 6)}〜${m.to.slice(0, 4)}/${+m.to.slice(4, 6)}`;
  // 半角カナ → 全角カナ（検索用）
  const toFull = (s) => s.normalize('NFKC');
  const hira2kata = (s) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

  // ---------- 一覧 ----------
  function filtered() {
    const q = hira2kata(state.q.trim()).replace(/\s/g, '');
    let xs = list.filter((r) => {
      if (state.cls !== 'all' && r.cls !== state.cls) return false;
      if (state.branch && r.branch !== state.branch) return false;
      if (!q) return true;
      return String(r.no).startsWith(q) || r.name.replace(/\s/g, '').includes(q) || toFull(r.kana).replace(/\s/g, '').includes(q);
    });
    const key = {
      ability: (r) => -(r.ability || 0), win: (r) => -(r.win || 0), quin: (r) => -(r.quin || 0),
      st: (r) => (r.st || 9), champs: (r) => -(r.champs || 0) * 100 - (r.ability || 0) / 100,
    }[state.sort];
    return xs.sort((a, b) => key(a) - key(b) || a.no - b.no);
  }

  function renderList() {
    const xs = filtered();
    $('#pl-count').textContent = xs.length.toLocaleString();
    $('#pl-list').innerHTML = xs.slice(0, state.shown).map((r) => `
      <li><a class="pl" href="#r/${r.no}">
        <span class="grade grade--${r.grade === '-' ? 'x' : r.grade}">${r.grade}</span>
        <span class="pl__who"><b>${r.name}</b><small>${r.no}・${r.branch}・${r.age}歳${r.sex === 2 ? '・女子' : ''}</small></span>
        <span class="cls cls-${r.cls}">${r.cls}</span>
        <span class="pl__n"><small>勝率</small>${f2(r.win)}</span>
        <span class="pl__n pl__n--q"><small>連対率</small>${f1(r.quin)}</span>
        <span class="pl__n pl__n--st"><small>ST</small>${st2(r.st)}</span>
        <span class="pl__n pl__n--ab"><small>能力指数</small>${r.ability ? r.ability.toFixed(0) : '—'}</span>
      </a></li>`).join('') || '<li class="empty">該当する選手はいません</li>';
    $('#pl-more').hidden = xs.length <= state.shown;
  }

  function setupList() {
    const branches = [...new Set(list.map((r) => r.branch))].sort((a, b) => a.localeCompare(b, 'ja'));
    $('#pl-branch').innerHTML = '<option value="">全支部</option>' + branches.map((b) => `<option>${b}</option>`).join('');
    $('#pl-term').textContent = `${termLabel(meta)}の成績（${meta.rows.length.toLocaleString()}人）`;
    $('#pl-q').addEventListener('input', (e) => { state.q = e.target.value; state.shown = 30; renderList(); });
    $('#pl-branch').addEventListener('change', (e) => { state.branch = e.target.value; state.shown = 30; renderList(); });
    $('#pl-sort').addEventListener('change', (e) => { state.sort = e.target.value; renderList(); });
    $('#pl-cls').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      state.cls = b.dataset.c; state.shown = 30;
      [...$('#pl-cls').children].forEach((x) => x.classList.toggle('is-on', x === b));
      renderList();
    });
    $('#pl-more').addEventListener('click', () => { state.shown += 50; renderList(); });
    renderList();
  }

  // ---------- 評価チャート（6角形） ----------
  function radar(ev) {
    const cx = 120, cy = 112, R = 84;
    const pt = (i, v) => {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 6;
      return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v];
    };
    const ring = (v) => AXES.map((_, i) => pt(i, v).join(',')).join(' ');
    const vals = AXES.map(([k]) => (ev[k] == null ? 0 : ev[k] / 100));
    const poly = vals.map((v, i) => pt(i, Math.max(v, 0.03)).join(',')).join(' ');
    const labels = AXES.map(([k, l], i) => {
      const [x, y] = pt(i, 1.24);
      return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" class="rd__l">${l}<tspan class="rd__v" x="${x}" dy="14">${ev[k] ?? '—'}</tspan></text>`;
    }).join('');
    return `<svg class="rd" viewBox="0 0 240 236" role="img" aria-label="6項目の評価">
      ${[0.25, 0.5, 0.75, 1].map((v) => `<polygon points="${ring(v)}" class="rd__ring"/>`).join('')}
      ${AXES.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, 1)[0]}" y2="${pt(i, 1)[1]}" class="rd__ax"/>`).join('')}
      <polygon points="${ring(0.5)}" class="rd__mid"/>
      <polygon points="${poly}" class="rd__val"/>
      ${labels}
    </svg>`;
  }

  // ---------- 選手ページ ----------
  async function openRacer(no) {
    const page = $('#racer');
    page.classList.add('is-open');
    page.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    $('#rp-body').innerHTML = '<p class="empty">読み込み中…</p>';
    $('#rp-title').textContent = '';
    try {
      await loadIndex().catch(() => null);
      const [res, sres] = await Promise.all([fetch(`data/racers/r/${no}.json`), fetch(`data/racers/s/${no}.json`).catch(() => null), window.GTAG ? GTAG.load() : null]);
      if (!res.ok) throw new Error('not found');
      const stats = sres && sres.ok ? await sres.json() : null;
      if (+no !== curNo) rpTab = 'top';
      curNo = +no;
      renderRacer(await res.json(), stats);
    } catch (e) {
      $('#rp-body').innerHTML = `<p class="empty">登番 ${no} の選手データが見つかりません。</p>`;
    }
    $('#rp-body').scrollTop = 0;
  }
  function closeRacer() {
    $('#racer').classList.remove('is-open');
    $('#racer').setAttribute('aria-hidden', 'true');
    if (!$('#drawer.is-open')) document.body.style.overflow = '';
  }

  function strengths(r) {
    const ev = r.eval || {};
    const notes = [];
    const best = [...r.courses.keys()].filter((i) => r.courses[i].n >= 6).sort((a, b) => r.courses[b].r3 - r.courses[a].r3)[0];
    if (ev.start >= 80) notes.push(`スタートが速い（平均ST ${st2(r.st)}・全選手で上位${100 - ev.start}%）`);
    else if (ev.start != null && ev.start <= 25) notes.push(`スタートは遅め（平均ST ${st2(r.st)}）`);
    if (ev.in >= 80) notes.push(`1コースの1着率 ${f1(r.courses[0].r1)}%。インで逃げ切る力が高い`);
    else if (ev.in != null && ev.in <= 25 && r.courses[0].n >= 6) notes.push(`1コースでも1着率 ${f1(r.courses[0].r1)}%と取りこぼしが多い`);
    if (ev.out >= 80) notes.push('4〜6コースからでも舟券に絡む。外枠でも軽視できない');
    if (best != null && best >= 1 && r.courses[best].n >= 10) notes.push(`得意コースは${best + 1}コース（3連対率 ${f1(r.courses[best].r3)}%）`);
    const f = r.courses.reduce((s, c) => s + c.F, 0);
    if (f) notes.push(`期間中にフライング${f}回`);
    if (r.hist[1] && r.win != null && r.hist[1].win != null) {
      const d = r.win - r.hist[1].win;
      if (d >= 0.5) notes.push(`前期から勝率が ${d.toFixed(2)} 上昇。調子を上げている`);
      if (d <= -0.5) notes.push(`前期から勝率が ${Math.abs(d).toFixed(2)} 低下`);
    }
    return notes.length ? notes : ['目立った特徴はありません'];
  }

  let rpTab = 'top', curNo = 0;
  function renderRacer(r, s) {
    const ev = r.eval || {};
    const total = meta ? meta.active : null;
    const base = location.pathname.includes('/r/') ? '' : 'r/';
    $('#rp-meta').innerHTML = `登番 ${r.no}・${r.grad}期・${r.branch}支部　<a class="rp-share" href="${base}${r.no}.html">この選手のページ</a>`;
    $('#rp-title').innerHTML = `${r.name} <small>${r.kana}</small>`;
    const birth = r.birth ? `${+r.birth.slice(5, 7)}月${+r.birth.slice(8)}日生` : '';

    const head = `<div class="rp-top">
      <div class="rp-grade">
        <span class="grade grade--lg grade--${r.grade === '-' ? 'x' : r.grade}">${r.grade}</span>
        <div><b>GACHIIKU評価 ${r.grade}</b><small>${GRADE_NOTE[r.grade]}${r.rank ? `・能力指数 ${r.rank}位${total ? ` / ${total.toLocaleString()}人` : ''}` : ''}</small></div>
      </div>
      <dl class="rp-prof">
        <div><dt>級別</dt><dd><span class="cls cls-${r.cls}">${r.cls}</span></dd></div>
        <div><dt>年齢</dt><dd>${r.age}歳<small>${birth}</small></dd></div>
        <div><dt>出身</dt><dd>${r.home || '—'}</dd></div>
        <div><dt>身長 / 体重</dt><dd>${r.height}cm / ${r.weight}kg</dd></div>
        <div><dt>血液型</dt><dd>${r.blood || '—'}</dd></div>
      </dl></div>`;

    const kpi = [
      ['勝率', f2(r.win)], ['2連対率', f1(r.quin) + '%'], ['平均ST', st2(r.st)],
      ['1着', (r.w1 ?? 0) + '回'], ['優出 / 優勝', `${r.finals ?? 0} / ${r.champs ?? 0}`], ['能力指数', r.ability ?? '—'],
    ];
    const kpis = `<dl class="rp-kpis">${kpi.map(([l, v]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <p class="rp-note">${meta ? termLabel(meta) : ''}の成績・出走${r.starts}回</p>`;

    const evalCard = `<div class="card"><h4 class="card__h">評価 <small>全選手の中での位置（100が最高・50が平均）</small></h4>
      <div class="rp-eval">${radar(ev)}
        <ul class="rp-pts">${strengths(r).map((s) => `<li>${s}</li>`).join('')}</ul></div></div>`;

    const maxN = Math.max(...r.courses.map((c) => c.n), 1);
    const courseCard = `<div class="card"><h4 class="card__h">コース別成績 <small>進入コースごと</small></h4>
      <div class="rp-tbl-wrap"><table class="rp-tbl">
        <thead><tr><th>コース</th><th>進入</th><th>1着率</th><th>2連対率</th><th>3連対率</th><th>平均ST</th><th>ST順位</th><th>着順の内訳</th></tr></thead>
        <tbody>${r.courses.map((c, i) => `<tr>
          <td><span class="ln ln-${i + 1}">${i + 1}</span></td>
          <td>${c.n}</td>
          <td class="${c.n && c.r1 >= 50 ? 'is-hi' : ''}">${c.n ? f1(c.r1) : '—'}</td>
          <td>${c.n ? f1(c.r2) : '—'}</td>
          <td>${c.n ? f1(c.r3) : '—'}</td>
          <td>${c.n ? st2(c.st) : '—'}</td>
          <td>${c.n ? f2(c.strank) : '—'}</td>
          <td>${c.n ? `<span class="stack">${c.places.map((p, k) => `<i class="p${k + 1}" style="--w:${(p / c.n) * 100}%" title="${k + 1}着 ${p}回"></i>`).join('')}</span>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>
      <p class="rp-legend"><i class="p1"></i>1着 <i class="p2"></i>2着 <i class="p3"></i>3着 <i class="p4"></i>4着以下</p></div>`;

    const histCard = `<div class="card"><h4 class="card__h">期別成績 <small>半年ごと・${r.hist.length}期分</small></h4>
      <div class="rp-tbl-wrap rp-tbl-wrap--tall"><table class="rp-tbl rp-tbl--hist">
        <thead><tr><th>期間</th><th>級別</th><th>勝率</th><th>2連対率</th><th>平均ST</th><th>出走</th><th>1着</th><th>優勝</th><th>能力指数</th></tr></thead>
        <tbody>${r.hist.map((h) => `<tr>
          <td>${h.from ? `${h.from.slice(2, 4)}/${+h.from.slice(4, 6)}〜${h.to.slice(2, 4)}/${+h.to.slice(4, 6)}` : h.term}</td><td><span class="cls cls-${h.cls}">${h.cls}</span></td>
          <td>${f2(h.win)}</td>
          <td>${f1(h.quin)}</td><td>${st2(h.st)}</td><td>${h.starts}</td><td>${h.w1}</td><td>${h.champs}</td><td>${h.ability ?? '—'}</td>
        </tr>`).join('')}</tbody></table></div></div>`;

    const d0 = new Date(), today = `${d0.getFullYear()}${String(d0.getMonth() + 1).padStart(2, '0')}${String(d0.getDate()).padStart(2, '0')}`;
    const posLabel = (x) => (x.canceled ? '中止' : x.pos == null ? (x.date === today ? "出走予定" : "—") : x.pos === 0 ? '4着以下' : x.pos + '着');
    const recentCard = `<div class="card"><h4 class="card__h">最近の出走 <small>GACHIIKUで記録している日から</small></h4>
      ${r.recent.length ? `<ul class="rp-recent">${r.recent.map((x) => `<li class="${x.pos === 1 ? 'is-win' : ''}">
        <span class="rp-recent__d">${+x.date.slice(4, 6)}/${+x.date.slice(6)}</span>
        <span>${x.venue || VENUES[x.jcd]} ${x.r}R<small>${x.name}</small></span>
        <span class="ln ln-${x.lane}">${x.lane}</span>
        <b>${posLabel(x)}</b></li>`).join('')}</ul>` : '<p class="empty">記録がありません</p>'}</div>`;

    const TABS = [['top', '評価・概要'], ['course', '決まり手・コース'], ['stats', '成績データ'], ['venue', '場別'], ['finals', '優出'], ['races', '全出走']];
    const tabs = `<div class="rp-tabs" role="tablist">${TABS.map(([k, l]) =>
      `<button data-rtab="${k}" class="${rpTab === k ? 'is-on' : ''}">${l}</button>`).join('')}</div>`;
    const top = (s ? `<div class="rp-pair">${kimCard(s)}${loseCard(s)}</div>` : '')
      + `<div class="rp-grid"><div>${evalCard}${histCard}</div><div>${courseCard}${recentCard}</div></div>`;
    const body = rpTab === 'top' ? top : !s ? '<p class="empty">成績データを準備中です。</p>'
      : rpTab === 'stats' ? statsTab(s) : rpTab === 'course' ? courseTab(s) : rpTab === 'venue' ? venueTab(s)
        : rpTab === 'finals' ? finalsTab(s) : racesTab(s);
    $('#rp-body').innerHTML = head + kpis + tabs + `<div class="rp-pane">${body}</div>`;
    rerender = () => renderRacer(r, s);
  }
  let rerender = null;
  document.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-ropt]');
    if (opt && rerender) {
      const [k, v] = opt.dataset.ropt.split(':');
      ropt[k] = v;
      const keep = $('#rp-body').scrollTop;
      rerender();
      $('#rp-body').scrollTop = keep;
      return;
    }
    const b = e.target.closest('[data-rtab]');
    if (!b || !rerender) return;
    rpTab = b.dataset.rtab;
    const keep = $('#rp-body').scrollTop;
    rerender();
    $('#rp-body').scrollTop = Math.min(keep, $('.rp-tabs').offsetTop - 8);
  });

  // ---------- 成績データ（過去のレース結果から集計） ----------
  const ymd = (d) => `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}`;
  const md = (d) => `${+d.slice(4, 6)}/${+d.slice(6, 8)}`;
  const pct = (n) => (n == null ? '—' : n.toFixed(1));
  const posTxt = (p) => (typeof p === 'number' ? p : p ? p.replace(/\d/, '') : '—');
  // 着順バッジ（1着=赤、2着=紺、3着=薄紺、4〜6着=灰、F・Lなど=文字）
  const posBadge = (p) => (typeof p === 'number' ? `<span class="pos pos--${p}">${p}</span>` : `<span class="pos pos--x">${p ? ({ F: 'F', L: 'L', K: '欠', S: '失' }[String(p)[0]] || p) : '—'}</span>`);
  const KIMS = ['逃げ', '差し', 'まくり', 'まくり差し', '抜き', '恵まれ'];
  const spanNote = (s) => `<p class="rp-span">集計期間：${ymd(s.histSpan[0])} 〜 ${ymd(s.histSpan[1])}（GACHIIKUが記録しているレース）</p>`;
  const tbl = (head, rows, cls = '') => `<div class="rp-tbl-wrap"><table class="rp-tbl rp-tbl--stat ${cls}">
    <thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;

  function statsTab(s) {
    const G = ['SG', 'G1', 'G2', 'G3', '一般', '総合'];
    const grade = tbl(['グレード', '節数', '出走', '勝率', '1着', '1着率', '2連対率', '3連対率', '優出', '優勝', '平均ST', 'ST順', '2着', '3着', '4着', '5着', '6着', 'F', 'L', 'K', 'S'],
      G.map((g) => { const a = s.grade[g]; return `<tr class="${g === '総合' ? 'is-total' : ''}"><td>${g}</td><td>${a.series}</td><td>${a.n}</td><td>${f2(a.win)}</td><td>${a.w1}</td><td>${pct(a.r1)}</td><td>${pct(a.r2)}</td><td>${pct(a.r3)}</td><td>${a.finals}</td><td class="${a.champs ? 'is-hi' : ''}">${a.champs}</td><td>${st2(a.st)}</td><td>${a.strank ?? '—'}</td>${a.p.slice(1).map((x) => `<td>${x}</td>`).join('')}<td>${a.F}</td><td>${a.L}</td><td>${a.K}</td><td>${a.S}</td></tr>`; }));
    const lane = tbl(['艇番', '出走', '優出', '優勝', '1着率', '2連対率', '3連対率', '1着', '進入1', '進入2', '進入3', '進入4', '進入5', '進入6', 'その他'],
      s.lane.map((a, i) => `<tr><td><span class="ln ln-${i + 1}">${i + 1}</span></td><td>${a.n}</td><td>${a.finals}</td><td>${a.champs}</td><td class="${a.r1 >= 40 ? 'is-hi' : ''}">${pct(a.r1)}</td><td>${pct(a.r2)}</td><td>${pct(a.r3)}</td><td>${a.w1}</td>${a.course.map((c, k) => `<td class="${k === i && c ? 'is-same' : ''}">${c}</td>`).join('')}</tr>`));
    const course = tbl(['コース', '出走', '1着', '1着率', '2連対率', '3連対率', '平均ST', 'ST順', ...KIMS],
      s.course.map((a, i) => `<tr><td><span class="ln ln-${i + 1}">${i + 1}</span></td><td>${a.n}</td><td>${a.w1}</td><td class="${a.r1 >= 40 ? 'is-hi' : ''}">${pct(a.r1)}</td><td>${pct(a.r2)}</td><td>${pct(a.r3)}</td><td>${st2(a.st)}</td><td>${a.strank ?? '—'}</td>${a.kim.map((k) => `<td>${k || ''}</td>`).join('')}</tr>`));
    const vs = Object.entries(s.venue).sort((a, b) => a[0] - b[0]);
    const venue = tbl(['競艇場', '節数', '出走', '優出', '優勝', '勝率', '1着', '1着率', '2連対率', '3連対率', '平均ST'],
      vs.map(([j, a]) => `<tr><td>${VENUES[j]}</td><td>${a.series}</td><td>${a.n}</td><td>${a.finals}</td><td class="${a.champs ? 'is-hi' : ''}">${a.champs}</td><td>${f2(a.win)}</td><td>${a.w1}</td><td>${pct(a.r1)}</td><td>${pct(a.r2)}</td><td>${pct(a.r3)}</td><td>${st2(a.st)}</td></tr>`));
    return spanNote(s) + `<div class="rp-stack">
      <div class="card"><h4 class="card__h">グレード別成績</h4>${grade}</div>
      <div class="card"><h4 class="card__h">艇番別成績 <small>枠番ごとの成績と、実際に入ったコース</small></h4>${lane}</div>
      <div class="card"><h4 class="card__h">進入コース別成績 <small>決まり手は1着になったときの数</small></h4>${course}</div>
      </div>`;
  }

  // ---------- コース別（期間別成績・ST・勝ち方/負け方・前づけ） ----------
  const ropt = { metric: 'r1', scope: 'all', course: '1', tp: '1y' };
  const seg = (key, items) => `<div class="seg seg--sm">${items.map(([v, l]) =>
    `<button data-ropt="${key}:${v}" class="${ropt[key] === v ? 'is-on' : ''}">${l}</button>`).join('')}</div>`;
  const C6 = [1, 2, 3, 4, 5, 6];
  const cHead = (first) => `<thead><tr><th>${first}</th>${C6.map((c) => `<th><span class="ln ln-${c}">${c}</span></th>`).join('')}</tr></thead>`;
  const heat = (v, max) => (v == null ? '' : ` style="--h:${Math.min(v / max, 1).toFixed(2)}"`);

  function courseTab(s) {
    const P = s.period;
    const names = ['今期', '直近1年', '直近6ヶ月', '直近3ヶ月', '直近1ヶ月', '一般戦', 'SG・G1'];
    const m = ropt.metric;
    const rate = `<div class="card"><h4 class="card__h">コース別成績 <small>（ ）は出走数</small>${seg('metric', [['r1', '1着率'], ['r2', '2連対率'], ['r3', '3連対率']])}</h4>
      <div class="rp-tbl-wrap"><table class="rp-tbl rp-ctbl">${cHead('期間')}<tbody>${names.map((n) => `<tr><th>${n}</th>${P[n].map((a) =>
        `<td class="heat"${heat(a.n ? a[m] : null, m === 'r1' ? 80 : 100)}>${a.n ? `${a[m].toFixed(1)}<small>(${a.n})</small>` : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
    const lanes = s.lane;
    const mae = `<div class="card"><h4 class="card__h">前づけデータ <small>枠番ごとに実際に入ったコース</small></h4>
      <div class="rp-tbl-wrap"><table class="rp-tbl rp-ctbl">${cHead('枠＼コース')}<tbody>${lanes.map((a, i) => {
        const tot = a.course.slice(0, 6).reduce((x, y) => x + y, 0);
        return `<tr><th><span class="ln ln-${i + 1}">${i + 1}</span></th>${a.course.slice(0, 6).map((n, k) =>
          `<td class="heat ${k === i ? 'is-same' : ''}"${heat(tot ? n / tot * 100 : null, 100)}>${tot ? Math.round(n / tot * 1000) / 10 + '%' : '—'}</td>`).join('')}</tr>`;
      }).join('')}</tbody></table></div></div>`;
    const stNames = [...names, '初日', '最終日'];
    const st = `<div class="card"><h4 class="card__h">平均ST・ST順位</h4>
      <div class="rp-tbl-wrap"><table class="rp-tbl rp-ctbl">${cHead('期間')}<tbody>${stNames.map((n) => `<tr><th>${n}</th>${P[n].map((a) =>
        `<td>${a.n && a.st != null ? `${st2(a.st)}<small>${a.strank != null ? a.strank.toFixed(1) + '位' : ''}</small>` : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <h5 class="rp-sub">ST考察 <small>直近1年</small></h5>
      <div class="rp-tbl-wrap"><table class="rp-tbl rp-ctbl">${cHead('')}<tbody>
        <tr><th>安定率</th>${s.sta.map((a) => `<td>${pct(a.stable)}</td>`).join('')}</tr>
        <tr><th>抜出率</th>${s.sta.map((a) => `<td>${a.jump == null ? '—' : pct(a.jump)}</td>`).join('')}</tr>
        <tr><th>出遅率</th>${s.sta.map((a) => `<td class="${a.late >= 20 ? 'is-hi' : ''}">${pct(a.late)}</td>`).join('')}</tr>
      </tbody></table></div>
      <p class="rp-def">安定率＝そのコースの平均STから±0.03以内　抜出率＝内側の艇より0.05以上早い　出遅率＝内側の艇（1コースは2コース）より0.05以上遅い</p></div>`;

    return spanNote(s) + `<div class="rp-stack">${kimCard(s)}${loseCard(s)}${window.GTAG ? GTAG.card(curNo, ropt.tp, seg('tp', GTAG.PERIODS)) : ''}${courseRaces(s)}${rate}${st}${mae}</div>`;
  }

  // コースを選ぶと、そのコースで走った直近1年のレースを一覧（結果・映像つき）
  function courseRaces(s) {
    const c = +ropt.course;
    const rows = s.series.flatMap((x) => x.runs.filter((u) => u[4] === c).map((u) => ({ jcd: x.jcd, grade: x.grade, u })))
      .sort((a, b) => (b.u[0] + String(b.u[2]).padStart(2, '0')).localeCompare(a.u[0] + String(a.u[2]).padStart(2, '0')));
    const fin = rows.filter((x) => typeof x.u[6] === 'number');
    const rate = (k) => (rows.length ? (fin.filter((x) => x.u[6] <= k).length / rows.length * 100).toFixed(1) : '—');
    const tabs = `<div class="seg seg--sm seg--course">${C6.map((k) =>
      `<button data-ropt="course:${k}" class="${+ropt.course === k ? 'is-on' : ''}"><span class="ln ln-${k}">${k}</span></button>`).join('')}</div>`;
    const list = rows.map(({ jcd, grade, u: [d, day, r, lane, , st, pos, name, strank, kim, order] }) => `<tr class="${pos === 1 ? 'is-win' : ''}">
        <td>${+d.slice(4, 6)}/${+d.slice(6)}</td>
        <td class="cr-v">${VENUES[jcd]} ${r}R${c === 3 && window.GTAG && GTAG.isKado(`${d}-${jcd}-${r}`) ? '<span class="cr-kado">3角</span>' : ''}<small>${grade !== '一般' ? grade + '・' : ''}${name}</small></td>
        <td><span class="ln ln-${lane}">${lane}</span></td>
        <td>${st == null ? '—' : st < 0 ? 'F' + st2(-st) : st2(st)}<small>${strank ? strank + '位' : ''}</small></td>
        <td>${posBadge(pos)}</td>
        <td class="cr-k">${pos === 1 ? `<span class="k-gain">${kim}</span>` : kim ? `<span class="k-lose">${kim}</span>` : ''}</td>
        <td class="cr-o">${order ? order.split('').join('-') : ''}</td>
        <td><button class="vbtn vbtn--sm" data-video="${jcd}-${d}-${r}" aria-label="映像">▶</button></td></tr>`).join('');
    return `<div class="card"><h4 class="card__h">コース別のレース <small>直近1年・結果と映像</small>${tabs}</h4>
      <p class="cr-sum"><span>${c}コース <b>${rows.length}</b>走</span><span>1着率 <b>${rate(1)}</b>%</span><span>2連対率 <b>${rate(2)}</b>%</span><span>3連対率 <b>${rate(3)}</b>%</span></p>
      ${rows.length ? `<div class="rp-tbl-wrap cr-wrap"><table class="rp-tbl mo-tbl cr-tbl"><thead><tr><th>日付</th><th>レース</th><th>枠</th><th>ST</th><th>着</th><th>決まり手</th><th>3連単</th><th>映像</th></tr></thead>
      <tbody>${list}</tbody></table></div>` : '<p class="empty">このコースで走ったレースはありません</p>'}
      <p class="rp-def">決まり手は1着になった艇のもの（<b class="k-gain">青</b>＝自分の勝ち、<b class="k-lose">赤</b>＝負けたときの相手）。<span class="cr-kado">3角</span>＝レース映像で、3コースからダッシュに引いた（3カド）と確認したレース。</p></div>`;
  }

  function kimCard(s) {
    const K = s.kimt[ropt.scope];
    const labels = [['逃げ', '逃し'], ['差され', '差し'], ['捲られ', '捲り'], ['捲られ差', '捲り差し']];
    const kim = `<div class="card"><h4 class="card__h">枠別決まり手 <small>勝ち方・負け方</small>${seg('scope', [['all', '総合'], ['gen', '一般戦'], ['big', 'SG・G1']])}</h4>
      <div class="rp-tbl-wrap"><table class="rp-tbl rp-ctbl rp-kim">${cHead('')}<tbody>${labels.map(([l1, l2], i) => `<tr>
        <th>${l1}<small>${l2}</small></th>${C6.map((c) => {
          const y = K['1y'][c - 1], h = K['6m'][c - 1];
          const lose = (c === 1 && i > 0) || (c > 1 && i === 0);
          const cnt = (a) => Math.round(a[i + 1] * a[0] / 100);  // ％×出走数＝回数
          return `<td class="${lose ? 'is-lose' : 'is-gain'}"><b>${y[0] ? pct(y[i + 1]) : '—'}</b>${y[0] ? `<small class="kc">${cnt(y)}/${y[0]}</small>` : ''}<small>${h[0] ? `${pct(h[i + 1])}<i class="kc">${cnt(h)}/${h[0]}</i>` : '—'}</small></td>`;
        }).join('')}</tr>`).join('')}
        <tr class="rp-kim__n"><th>出走数</th>${C6.map((c) => { const n = K['1y'][c - 1][0]; return `<td class="${n && n < 10 ? 'is-few' : ''}">${n}${n && n < 10 ? '<em>少</em>' : ''}<small>${K['6m'][c - 1][0]}</small></td>`; }).join('')}</tr>
      </tbody></table></div>
      <p class="rp-def">上：直近1年／下：直近6ヶ月（%）。％の下の「回数/出走数」は、そのコースで何走中何回か（出走数10走未満は「少」）。行の左の名前は1コース、右の名前は2〜6コースのとき。<b class="k-lose">赤</b>は負け方（1コースで差され・捲られ、2〜6コースで1コースに逃げられた）、<b class="k-gain">青</b>は自分が1着になった決まり手。</p></div>`;
    return kim;
  }

  // 負け筋: 1着を逃したとき、何コースの艇にどの決まり手で勝たれたか
  const KS = { 'まくり': '捲り', 'まくり差し': '捲り差し' };
  function loseCard(s) {
    const rows = s.lose1y.map((a, i) => {
      if (!a.n) return `<li><span class="ln ln-${i + 1}">${i + 1}</span><span class="lose__n">出走なし</span></li>`;
      const lostPct = a.lost / a.n * 100;
      return `<li><span class="ln ln-${i + 1}">${i + 1}</span>
        <span class="lose__n"><b>${a.n}</b>走中 <b class="k-lose">${a.lost}</b>回負け<small>（${lostPct.toFixed(0)}%）</small></span>
        <span class="lose__by">${a.by.length ? a.by.map(([c, k, n]) => `<span class="lose__chip" style="--w:${(n / a.n * 100).toFixed(1)}%">
          <i class="ln ln-${c}">${c}</i>${KS[k] || k}<b>${(n / a.n * 100).toFixed(1)}%</b><small>${n}回</small></span>`).join('') : '<small>負けなし</small>'}</span></li>`;
    }).join('');
    return `<div class="card card--lose"><h4 class="card__h">負け筋 <small>コースごとに、1着を取られた相手のコースと決まり手（直近1年）</small></h4>
      <ul class="lose">${rows}</ul>
      <p class="rp-def">％はそのコースの出走数に対する割合。例：「1 逃げ 80%」＝そのコースで走ったレースの80%で、1コースに逃げ切られた。</p></div>`;
  }

  // ---------- 場別 ----------
  function venueTab(s) {
    const vs = Object.entries(s.venue).sort((a, b) => a[0] - b[0]);
    const sum = tbl(['競艇場', '節数', '出走', '優出', '優勝', '勝率', '1着率', '2連対率', '3連対率', '平均ST'],
      vs.map(([j, a]) => `<tr><td><a href="#" data-vjump="${j}">${VENUES[j]}</a></td><td>${a.series}</td><td>${a.n}</td><td>${a.finals}</td><td class="${a.champs ? 'is-hi' : ''}">${a.champs}</td><td>${f2(a.win)}</td><td>${pct(a.r1)}</td><td>${pct(a.r2)}</td><td>${pct(a.r3)}</td><td>${st2(a.st)}</td></tr>`));
    const cards = vs.filter(([j]) => s.local5y[j]).map(([j]) => {
      const L = s.local5y[j];
      return `<div class="card rp-vcard" id="rv${j}"><h4 class="card__h">ボートレース${VENUES[j]} <small>コース別・直近5年</small></h4>
        <div class="rp-tbl-wrap"><table class="rp-tbl rp-ctbl">${cHead('')}<tbody>
          <tr><th>進入</th>${L.map((a) => `<td>${a.n || '—'}</td>`).join('')}</tr>
          <tr><th>平均ST</th>${L.map((a) => `<td>${a.n ? st2(a.st) : '—'}</td>`).join('')}</tr>
          <tr><th>1着率</th>${L.map((a) => `<td class="heat"${heat(a.n ? a.r1 : null, 80)}>${a.n ? pct(a.r1) : '—'}</td>`).join('')}</tr>
          <tr><th>2連対率</th>${L.map((a) => `<td>${a.n ? pct(a.r2) : '—'}</td>`).join('')}</tr>
          <tr><th>3連対率</th>${L.map((a) => `<td>${a.n ? pct(a.r3) : '—'}</td>`).join('')}</tr>
        </tbody></table></div></div>`;
    }).join('');
    return spanNote(s) + `<div class="rp-stack"><div class="card"><h4 class="card__h">場別成績 <small>場名を押すとコース別へ</small></h4>${sum}</div>
      <div class="rp-vgrid">${cards}</div></div>`;
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-vjump]');
    if (!a) return;
    e.preventDefault();
    const el = document.getElementById('rv' + a.dataset.vjump);
    if (el) $('#rp-body').scrollTop = el.offsetTop - $('.rp-tabs').offsetHeight - 12;
  });

  function finalsTab(s) {
    if (!s.finals.length) return spanNote(s) + '<p class="empty">集計期間内の優出はありません</p>';
    return spanNote(s) + `<div class="card"><h4 class="card__h">優出データ <small>${s.finals.length}回・優勝${s.finals.filter((f) => f[7] === 1).length}回</small></h4>
      <ul class="rp-fin">${s.finals.map(([d, j, title, g, r, lane, c, pos, kim, order]) => `<li class="${pos === 1 ? 'is-win' : ''}">
        <span class="rp-fin__d">${ymd(d)}</span>
        <span class="rp-fin__t"><span class="tag tag--g ${g === 'SG' || g === 'G1' ? 'is-big' : ''}">${g}</span>${title}<small>${VENUES[j]} ${r}R</small></span>
        <span class="rp-fin__l"><span class="ln ln-${lane}">${lane}</span><small>${c ? `(${c})` : ''}</small></span>
        <b>${pos === 1 ? '優勝' : posTxt(pos) + (typeof pos === 'number' ? '着' : '')}<small>${kim || ''}${order ? `<i>${order.split('').join('-')}</i>` : ''}</small></b></li>`).join('')}</ul></div>`;
  }

  function racesTab(s) {
    if (!s.series.length) return spanNote(s) + '<p class="empty">直近12ヵ月の出走はありません</p>';
    return `<p class="rp-span">直近12ヵ月の全出走（上から 艇番・ST・(進入)・着順・3連単）</p>` + s.series.map((x) => `
      <div class="card rp-ser"><h4 class="card__h"><span class="tag tag--g ${x.grade === 'SG' || x.grade === 'G1' ? 'is-big' : ''}">${x.grade}</span>${x.title}
        <small>${VENUES[x.jcd]}・${md(x.from)}〜${md(x.to)}</small></h4>
        <ol class="rp-runs">${x.runs.map(([d, day, r, lane, c, st, pos, name, , , order]) => `<li class="${pos === 1 ? 'is-win' : ''} ${name.includes('優勝戦') && !name.includes('準') ? 'is-final' : ''}" title="${name}">
          <span class="rp-runs__d">${md(d)} ${r}R</span>
          <span class="ln ln-${lane}">${lane}</span>
          <span class="rp-runs__st">${st == null ? '—' : st < 0 ? 'F' + st2(-st) : st2(st)}</span>
          <span class="rp-runs__c">${c ? `(${c})` : ''}</span>
          ${posBadge(pos)}
          <span class="rp-runs__o" title="3連単">${order ? String(order).split('').map((l) => (+l === lane ? `<b>${l}</b>` : l)).join('-') : '—'}</span>
          <button class="vbtn vbtn--sm" data-video="${x.jcd}-${d}-${r}" aria-label="映像">▶</button></li>`).join('')}</ol></div>`).join('');
  }

  // ---------- 画面遷移（URLの #r/登番 で選手ページを開く） ----------
  let lastHash = '', cameIn = false; // cameIn: このページ内のリンクから選手ページを開いたか
  function route() {
    const m = location.hash.match(/^#r\/(\d{4})$/);
    if (m) openRacer(m[1]);
    else {
      if ($('#racer').classList.contains('is-open')) closeRacer();
      if (location.hash) lastHash = location.hash;
    }
  }
  window.addEventListener('hashchange', () => { cameIn = /^#r\//.test(location.hash); route(); });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-rclose]')) {
      e.preventDefault();
      if (cameIn) history.back();
      else { history.replaceState(null, '', lastHash || location.pathname); closeRacer(); }
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#racer').classList.contains('is-open')) {
      e.stopImmediatePropagation();
      $('[data-rclose]').click();
    }
  }, true);

  if ($('#pl-list')) {
    loadIndex().then(setupList).catch((err) => {
      $('#pl-list').innerHTML = `<li class="empty">選手データを読み込めませんでした（${err.message}）</li>`;
    });
  }
  route();
})();
