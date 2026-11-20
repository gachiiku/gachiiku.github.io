/* =========================================================
   WAKE — 選手ページ
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
      const res = await fetch(`data/racers/r/${no}.json`);
      if (!res.ok) throw new Error('not found');
      renderRacer(await res.json());
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

  function renderRacer(r) {
    const ev = r.eval || {};
    const total = meta ? meta.active : null;
    $('#rp-meta').innerHTML = `登番 ${r.no}・${r.grad}期・${r.branch}支部`;
    $('#rp-title').innerHTML = `${r.name} <small>${r.kana}</small>`;
    const birth = r.birth ? `${+r.birth.slice(5, 7)}月${+r.birth.slice(8)}日生` : '';

    const head = `<div class="rp-top">
      <div class="rp-grade">
        <span class="grade grade--lg grade--${r.grade === '-' ? 'x' : r.grade}">${r.grade}</span>
        <div><b>WAKE評価 ${r.grade}</b><small>${GRADE_NOTE[r.grade]}${r.rank ? `・能力指数 ${r.rank}位${total ? ` / ${total.toLocaleString()}人` : ''}` : ''}</small></div>
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

    const histCard = `<div class="card"><h4 class="card__h">期別の推移 <small>半年ごと</small></h4>
      <div class="rp-tbl-wrap"><table class="rp-tbl rp-tbl--hist">
        <thead><tr><th>期間</th><th>級別</th><th>勝率</th><th>2連対率</th><th>平均ST</th><th>出走</th><th>1着</th><th>優勝</th><th>能力指数</th></tr></thead>
        <tbody>${r.hist.map((h) => `<tr>
          <td>${h.from ? `${h.from.slice(2, 4)}/${+h.from.slice(4, 6)}〜${h.to.slice(2, 4)}/${+h.to.slice(4, 6)}` : h.term}</td><td><span class="cls cls-${h.cls}">${h.cls}</span></td>
          <td>${f2(h.win)}</td>
          <td>${f1(h.quin)}</td><td>${st2(h.st)}</td><td>${h.starts}</td><td>${h.w1}</td><td>${h.champs}</td><td>${h.ability ?? '—'}</td>
        </tr>`).join('')}</tbody></table></div></div>`;

    const d0 = new Date(), today = `${d0.getFullYear()}${String(d0.getMonth() + 1).padStart(2, '0')}${String(d0.getDate()).padStart(2, '0')}`;
    const posLabel = (x) => (x.canceled ? '中止' : x.pos == null ? (x.date === today ? "出走予定" : "—") : x.pos === 0 ? '4着以下' : x.pos + '着');
    const recentCard = `<div class="card"><h4 class="card__h">最近の出走 <small>WAKEで記録している日から</small></h4>
      ${r.recent.length ? `<ul class="rp-recent">${r.recent.map((x) => `<li class="${x.pos === 1 ? 'is-win' : ''}">
        <span class="rp-recent__d">${+x.date.slice(4, 6)}/${+x.date.slice(6)}</span>
        <span>${x.venue || VENUES[x.jcd]} ${x.r}R<small>${x.name}</small></span>
        <span class="ln ln-${x.lane}">${x.lane}</span>
        <b>${posLabel(x)}</b></li>`).join('')}</ul>` : '<p class="empty">記録がありません</p>'}</div>`;

    $('#rp-body').innerHTML = head + kpis + `<div class="rp-grid"><div>${evalCard}${histCard}</div><div>${courseCard}${recentCard}</div></div>`;
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
