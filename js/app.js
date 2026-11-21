/* =========================================================
   GACHIIKU — 画面描画
   ========================================================= */
window.WAKE_READY.then((first) => {
  let { venues, date, updatedAt } = first;
  const view = first.view || { live: true, days: [], today: date };
  const live = view.live;
  const dq = live ? '' : `&d=${date}`;  // レースページへ渡す日付
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(2, '0');
  const yen = (n) => n.toLocaleString('ja-JP') + '円';
  const hm = (m) => (m == null ? '--:--' : `${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  const f2 = (n) => (n == null ? '—' : n.toFixed(2));
  const nowSec = () => { const d = new Date(); return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(); };

  // ---- 場ごとの集計
  function stats(v) {
    // 中止レースは確定扱いにするが、配当などの集計には入れない
    const done = v.races.filter((r) => r.result && !r.result.canceled);
    const canceled = v.races.filter((r) => r.result && r.result.canceled).length;
    const nextRace = v.races.find((r) => !r.result) || null;
    const avg = done.length ? Math.round(done.reduce((s, r) => s + r.result.payout, 0) / done.length) : 0;
    const inWin = done.length ? done.filter((r) => r.result.order[0] === 1).length / done.length * 100 : 0;
    const manshu = done.length ? done.filter((r) => r.result.payout >= 10000).length / done.length * 100 : 0;
    return { done, nextRace, avg, inWin, manshu, canceled };
  }
  let openVenues = [];
  function prepare() {
    venues.forEach((v) => { v.s = stats(v); });
    openVenues = venues.filter((v) => v.open);
  }
  prepare();
  const status = (v) => (!v.open ? 'off' : v.s.nextRace ? 'live' : 'done');

  // ---- 時計 & 締切カウントダウン
  function fmtLeft(sec) {
    if (sec <= -300) return '結果待ち';
    if (sec <= 0) return 'レース中';
    const m = Math.floor(sec / 60), s = sec % 60;
    return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60}分` : `${pad(m)}:${pad(s)}`;
  }
  function tick() {
    const d = new Date();
    $('#clock').innerHTML = `<small>現在</small>${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const t = nowSec();
    $$('[data-deadline]').forEach((el) => {
      if (!live) { el.textContent = ''; return; }  // 今日以外はカウントダウンしない
      const left = +el.dataset.deadline * 60 - t;
      el.textContent = fmtLeft(left);
      el.classList.toggle('is-hot', left > 0 && left < 300);
    });
  }

  // ---- ヘッダー: ティッカー
  function renderTicker() {
    const items = openVenues.filter((v) => v.s.nextRace)
      .sort((a, b) => a.s.nextRace.deadline - b.s.nextRace.deadline)
      .map((v) => `<span class="tk"><b>${v.name}</b> ${v.s.nextRace.no}R <i data-deadline="${v.s.nextRace.deadline}"></i></span>`)
      .join('');
    $('#ticker').innerHTML = items + items; // ループ用に2回
    document.querySelector('.ticker').style.display = !live || !items ? 'none' : '';
  }

  // ---- 日付の切り替え
  const md = (x) => { const t = new Date(+x.slice(0, 4), +x.slice(4, 6) - 1, +x.slice(6, 8)); return `${t.getMonth() + 1}/${t.getDate()}（${'日月火水木金土'[t.getDay()]}）`; };
  const dayName = (x) => (x === view.today ? '今日' : x > view.today ? (x === view.days.find((y) => y > view.today) ? '明日' : '') : '');
  const hrefOf = (x) => (x === view.today ? '?today=1' : `?d=${x}`);
  function renderDateNav() {
    const days = view.days.includes(date) ? view.days : [...view.days, date].sort();
    const i = days.indexOf(date), prev = days[i - 1], next = days[i + 1];
    $('#date-nav').innerHTML = `
      ${prev ? `<a class="datenav__btn" href="${hrefOf(prev)}">‹ ${md(prev).replace(/（.）/, '')}</a>` : '<span class="datenav__btn is-off">‹</span>'}
      <select class="datenav__sel" aria-label="日付を選ぶ">${[...days].reverse().map((x) =>
        `<option value="${hrefOf(x)}" ${x === date ? 'selected' : ''}>${md(x)}${dayName(x) ? ' ' + dayName(x) : ''}</option>`).join('')}</select>
      ${next ? `<a class="datenav__btn" href="${hrefOf(next)}">${md(next).replace(/（.）/, '')} ›</a>` : '<span class="datenav__btn is-off">›</span>'}
      ${date !== view.today ? `<a class="datenav__today" href="?today=1">今日に戻る</a>` : ''}`;
    $('#date-nav select').onchange = (e) => { location.href = e.target.value; };
    $('#auto-note').hidden = !view.auto;
    if (view.auto) $('#auto-note').innerHTML = `本日（${md(view.today)}）の全レースが終わったので、明日の出走表を表示しています。<a href="?today=1">今日の結果を見る</a>`;
  }

  // ---- ヒーロー KPI
  function renderHero() {
    const d = new Date(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8));
    const w = '日月火水木金土'[d.getDay()];
    const kind = date > view.today ? '出走表' : date < view.today ? 'レース結果' : '開催状況';
    $('#today-label').innerHTML = `${d.getMonth() + 1}月${d.getDate()}日<small>（${w}）</small>の${kind}<span class="summary__upd">${updatedAt.slice(11)} 更新</span>`;
    renderDateNav();
    $('#venues .sec__title').textContent = date === view.today ? '本日の開催場' : `${+date.slice(4, 6)}/${+date.slice(6)}の開催場`;
    const allDone = openVenues.flatMap((v) => v.s.done);
    const man = allDone.filter((r) => r.result.payout >= 10000).length;
    const inRate = allDone.length ? Math.round(allDone.filter((r) => r.result.order[0] === 1).length / allDone.length * 100) : 0;
    const top = allDone.reduce((m, r) => Math.max(m, r.result.payout), 0);
    const kpi = [
      ['開催場', openVenues.length, '場'],
      ['イン逃げ率', inRate, '%'],
      ['万舟発生', man, '本'],
      ['本日最高配当', top.toLocaleString(), '円'],
    ];
    $('#kpis').innerHTML = kpi.map(([l, n, u]) =>
      `<div class="kpi"><dt>${l}</dt><dd>${n}<small>${u}</small></dd></div>`).join('');
  }

  // ---- 開催場グリッド
  let venueFilter = 'all';
  function renderVenues() {
    // 開催中 → 本日終了 → 非開催 の順に並べる
    const order = { live: 0, done: 1, off: 2 };
    const list = [...venues].sort((a, b) => order[status(a)] - order[status(b)] || a.id - b.id).filter((v) => {
      const st = status(v);
      if (venueFilter === 'live') return st === 'live';
      if (venueFilter === 'night') return v.open && v.night;
      if (venueFilter === 'done') return st === 'done';
      return true;
    });
    $('#venue-grid').innerHTML = list.map((v) => {
      const st = status(v);
      if (st === 'off') {
        return `<div class="vc vc--off"><div class="vc__top"><span class="vc__no">${pad(v.id)}</span></div>
          <div class="vc__name">${v.name}</div><div class="vc__foot">本日開催なし</div></div>`;
      }
      const nr = v.s.nextRace;
      const prog = v.races.map((r) => `<i class="${r.result ? (r.result.canceled ? 'is-cancel' : r.result.payout >= 10000 ? 'is-man' : 'is-done') : r === nr ? 'is-next' : ''}"></i>`).join('');
      const al = window.GALERT ? GALERT.upcoming(v, date) : [];  // 展示の前づけ・3角（まだ終わっていないレース）
      const alert = al.length ? `<div class="vc__al ${al.some((x) => x.a.kado) ? 'is-kado' : ''}">${al.slice(0, 3).map((x) => `<span>${x.r.no}R ${x.a.label}</span>`).join('')}</div>` : '';
      const badge = v.s.done.length >= 3
        ? (v.s.avg >= 6000 ? '<span class="tag tag--hot">荒れ</span>' : v.s.avg <= 2500 ? '<span class="tag tag--cool">固い</span>' : '')
        : '';
      return `<button class="vc vc--${st} ${al.length ? GALERT.cls(al[0].a) : ''}" data-venue="${v.id}">
        <div class="vc__top"><span class="vc__no">${pad(v.id)}</span><span class="vc__en"></span>
          ${v.night ? '<span class="tag tag--night">ナイター</span>' : ''}${v.morning ? '<span class="tag">モーニング</span>' : ''}${v.midnight ? '<span class="tag tag--night">ミッドナイト</span>' : ''}<span class="tag tag--g ${v.grade === 'SG' || v.grade === 'G1' ? 'is-big' : ''}">${v.grade}</span></div>
        <div class="vc__name">${v.name}${badge}${v.s.canceled ? `<span class="tag tag--cancel">中止${v.s.canceled}R</span>` : ''}</div>
        <div class="vc__day">${v.day}・${v.title}</div>
        <div class="vc__next">${nr
          ? `<span class="vc__r">${nr.no}<small>R</small></span><span class="vc__t">締切 ${hm(nr.deadline)}<b data-deadline="${nr.deadline}"></b></span>`
          : `<span class="vc__fin">${v.s.canceled === v.races.length ? '本日中止' : '本日終了'}</span>`}</div>
        ${alert}<div class="prog">${prog}</div>
      </button>`;
    }).join('') || '<p class="empty">該当する場はありません</p>';
    if (live && window.GALERT) GALERT.notify(venues, date, (vv, rr) => `race.html?j=${vv.id}&r=${rr.no}`);
  }
  if (window.GALERT) GALERT.onChange(() => renderVenues());

  // ---- 場傾向ランキング
  function renderRanks() {
    const pool = openVenues.filter((v) => v.s.done.length >= 2);
    const defs = [
      { t: '固い場', en: 'SOLID', key: (v) => v.s.avg, asc: true, fmt: yen, unit: '平均配当' },
      { t: '荒れている場', en: 'UPSET', key: (v) => v.s.avg, asc: false, fmt: yen, unit: '平均配当' },
      { t: 'イン逃げ率', en: 'IN ESCAPE', key: (v) => v.s.inWin, asc: false, fmt: (n) => n.toFixed(1) + '%', unit: '1着率' },
      { t: '万舟率', en: '10K+ PAYOUT', key: (v) => v.s.manshu, asc: false, fmt: (n) => n.toFixed(1) + '%', unit: '万舟率' },
    ];
    $('#ranks').innerHTML = defs.map((d) => {
      const rows = [...pool].sort((a, b) => (d.asc ? 1 : -1) * (d.key(a) - d.key(b))).slice(0, 5);
      const max = Math.max(...rows.map(d.key), 1);
      return `<article class="rk">
        <header class="rk__h"><h3>${d.t}</h3><span class="rk__u">${d.unit}</span></header>
        <ol>${rows.map((v, i) => `<li data-venue="${v.id}">
          <span class="rk__pos">${i + 1}</span>
          <span class="rk__name">${v.name}<small>${v.day} ${v.s.nextRace ? v.s.nextRace.no + 'R' : '終了'}</small></span>
          <span class="rk__bar"><i style="--w:${(d.key(v) / max) * 100}%"></i></span>
          <span class="rk__val">${d.fmt(d.key(v))}</span></li>`).join('')}</ol>
      </article>`;
    }).join('');
  }

  // ---- レース検索
  const others = (r) => r.boats.slice(1);
  const maxOther = (r) => Math.max(...others(r).map((b) => b.nat || 0));
  const FINDERS = {
    solid: {
      desc: '1号艇の全国勝率が高く、他の5艇との差が大きいレース。本命党向け。',
      opts: [['1号艇 全国勝率', 'a', [6.0, 6.5, 7.0, 7.5], '以上', 6.5], ['他艇トップとの勝率差', 'b', [0, 0.5, 1.0, 1.5], '以上', 0.5]],
      test: (r, c) => (r.boats[0].nat || 0) >= c.a && (r.boats[0].nat || 0) - maxOther(r) >= c.b,
      tag: (r) => `1号艇 ${f2(r.boats[0].nat)}`,
    },
    upset: {
      desc: '1号艇の勝率が低く、外枠に格上の選手がいるレース。高配当狙い。',
      opts: [['1号艇 全国勝率', 'a', [6.0, 5.5, 5.0, 4.5], '以下', 5.5], ['1号艇より勝率が高い選手', 'b', [1, 2, 3], '人以上', 2]],
      test: (r, c) => (r.boats[0].nat || 0) <= c.a && others(r).filter((b) => (b.nat || 0) > (r.boats[0].nat || 0)).length >= c.b,
      tag: (r) => `1号艇 ${r.boats[0].cls} ${f2(r.boats[0].nat)}`,
    },
    makuri: {
      desc: '展示タイムが内側の艇より明確に速い選手がいるレース。展示後に更新。',
      opts: [['展示タイム差', 'a', [0.07, 0.08, 0.09, 0.10], '秒以上', 0.07]],
      test: (r, c) => r.exhibited && r.boats.some((b, i) => i > 0 && r.boats.slice(0, i).every((x) => x.exTime - b.exTime >= c.a)),
      tag: (r) => {
        const b = r.boats.find((b, i) => i > 0 && r.boats.slice(0, i).every((x) => x.exTime - b.exTime >= 0.07));
        return b ? `${b.lane}号艇 ${b.exTime}` : '展示済';
      },
    },
    st: {
      desc: '平均STの差が大きいレース。スタートで隊形が崩れやすい。',
      opts: [['平均ST差', 'a', [0.05, 0.07, 0.08, 0.09], '以上', 0.07]],
      test: (r, c) => r.stGap >= c.a,
      tag: (r) => `差 ${r.stGap.toFixed(2)}`,
    },
  };
  let finderMode = 'solid';
  const finderCond = {};
  function renderFinder() {
    const f = FINDERS[finderMode];
    if (!finderCond[finderMode]) finderCond[finderMode] = Object.fromEntries(f.opts.map((o) => [o[1], o[4]]));
    const c = finderCond[finderMode];
    $('#finder-cond').innerHTML = `<p class="finder__desc">${f.desc}</p>` + f.opts.map(([label, key, vals, unit]) =>
      `<div class="cond"><span class="cond__l">${label}</span><div class="chips">${vals.map((v) =>
        `<button class="chip ${c[key] === v ? 'is-on' : ''}" data-k="${key}" data-v="${v}">${v}<small>${unit}</small></button>`).join('')}</div></div>`).join('');
    const hits = openVenues.flatMap((v) => v.races.filter((r) => !r.result && f.test(r, c)).map((r) => ({ v, r })))
      .sort((a, b) => a.r.deadline - b.r.deadline);
    $('#finder-count').textContent = hits.length;
    $('#finder-hits').innerHTML = hits.slice(0, 18).map(({ v, r }) => `
      <li><button data-venue="${v.id}" data-race="${r.no}">
        <span class="hit__v">${v.name}</span><span class="hit__r">${r.no}R</span>
        <span class="hit__t">${hm(r.deadline)}</span><span class="hit__tag">${f.tag(r)}</span><span class="hit__go">→</span>
      </button></li>`).join('') || '<li class="empty">条件に合うレースはありません</li>';
  }

  // ---- レース詳細ドロワー
  let cur = { v: null, r: 1 };
  function openDrawer(vid, rno) {
    const v = venues.find((x) => x.id === +vid);
    if (!v || !v.open) return;
    // レースはレースページ（race.html）で見せる
    location.href = `race.html?j=${v.id}${rno ? `&r=${rno}` : ''}${dq}`;
    return;
    cur = { v, r: rno || (v.s.nextRace ? v.s.nextRace.no : 12) };
    $('#drawer').classList.add('is-open');
    $('#drawer').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    renderDrawer();
  }
  function closeDrawer() {
    $('#drawer').classList.remove('is-open');
    $('#drawer').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  function renderDrawer() {
    const { v } = cur;
    const r = v.races.find((x) => x.no === cur.r) || v.races[0];
    $('#dr-meta').innerHTML = `<span class="tag tag--g">${v.grade}</span> ${v.title}・${v.day}`;
    $('#dr-title').innerHTML = `${v.name} <span>${r.no}R</span> <small>${r.name}</small>`;
    $('#race-tabs').innerHTML = v.races.map((x) =>
      `<button class="${x.no === cur.r ? 'is-on' : ''} ${x.result ? 'is-done' : ''}" data-r="${x.no}">${x.no}R<small>${hm(x.deadline)}</small></button>`).join('');

    const maxIdx = Math.max(...r.boats.map((b) => b.index));
    const ranked = [...r.boats].sort((a, b) => b.index - a.index);
    const bestEx = Math.min(...r.boats.map((b) => b.exTime || 99));
    const bestSt = Math.min(...r.boats.map((b) => b.st || 99));
    const wx = v.weather || {};
    const mark = ['◎', '○', '▲', '△'];

    const cond = `<div class="cond-row">
      <div><span>締切</span><b>${hm(r.deadline)}</b>${r.result ? '' : `<em data-deadline="${r.deadline}"></em>`}</div>
      <div><span>天候${wx.at ? `（${wx.at}時点）` : ''}</span><b>${wx.weather || '—'}</b></div>
      <div><span>風</span><b>${wx.wind != null ? `${wx.windDir || ''} ${wx.wind}m` : '—'}</b></div>
      <div><span>波高</span><b>${wx.wave != null ? wx.wave + 'cm' : '—'}</b></div>
      <div><span>気温 / 水温</span><b>${wx.temp != null ? `${wx.temp}℃ / ${wx.waterTemp}℃` : '—'}</b></div></div>`;

    const result = r.result && r.result.canceled ? '<div class="result result--cancel"><span class="result__l">レース中止</span><span class="result__note">舟券は返還されます</span></div>'
      : r.result ? `<div class="result">
      <span class="result__l">結果</span>
      <div class="result__o">${r.result.order.map((l) => `<span class="ln ln-${l}">${l}</span>`).join('<i>-</i>')}</div>
      <span class="result__p ${r.result.payout >= 10000 ? 'is-man' : ''}">3連単 ${yen(r.result.payout)}</span></div>` : '';

    const table = `<div class="card"><h4 class="card__h">出走表</h4>
      <div class="entry">${r.boats.map((b) => `
        <div class="en">
          <span class="ln ln-${b.lane}">${b.lane}</span>
          <a class="en__who" href="#r/${b.no}"><b>${b.name}</b><small>${b.no}・${b.branch}・${b.age}歳・${b.weight}kg</small></a>
          <span class="cls cls-${b.cls}">${b.cls}</span>
          <div class="en__num"><span>全国</span><b>${f2(b.nat)}</b></div>
          <div class="en__num"><span>当地</span><b>${b.local ? f2(b.local) : '—'}</b></div>
          <div class="en__num"><span>平均ST</span><b class="${b.st === bestSt ? 'is-best' : ''}">${f2(b.st)}</b></div>
          <div class="en__num"><span>モーター</span><b>${b.motor2 ?? '—'}%</b><small>#${b.motorNo}</small></div>
          <div class="en__num"><span>展示</span><b class="${b.exTime === bestEx ? 'is-best' : ''}">${f2(b.exTime)}</b>${b.tilt != null ? `<small>チルト ${b.tilt}</small>` : ''}</div>
          ${b.f ? `<span class="flag">F${b.f}</span>` : ''}
        </div>`).join('')}</div></div>`;

    const rate = `<div class="card"><h4 class="card__h">2連対率 <small>全国 / 当地</small></h4>
      <div class="course">${r.boats.map((b) => `<div class="co"><span class="ln ln-${b.lane}">${b.lane}</span>
        ${[['全国', b.nat2], ['当地', b.local2]].map(([l, n]) =>
          `<div class="co__bar"><span>${l}</span><div class="bar"><i style="--w:${n || 0}%"></i></div><b>${n != null ? n.toFixed(1) : '—'}%</b></div>`).join('')}</div>`).join('')}</div></div>`;

    const pred = `<div class="card card--pred"><h4 class="card__h">予想指数</h4>
      <ol class="pred">${ranked.map((b, i) => `<li>
        <span class="pred__m">${mark[i] || ''}</span><span class="ln ln-${b.lane}">${b.lane}</span>
        <span class="pred__n">${b.name}</span>
        <div class="bar bar--idx"><i style="--w:${(b.index / maxIdx) * 100}%"></i></div><b>${b.index.toFixed(1)}</b></li>`).join('')}</ol>
      <p class="pred__buy">推奨買い目 <b>${ranked[0].lane}-${ranked[1].lane}-${ranked[2].lane}</b> / ${ranked[0].lane}-${ranked[2].lane}-${ranked[1].lane} / ${ranked[0].lane}-${ranked[1].lane}-${ranked[3].lane}</p>
      <p class="pred__note">枠の有利さ・全国勝率・モーター・平均ST・展示タイムから算出した参考値です</p></div>`;

    $('#dr-body').innerHTML = cond + result + `<div class="dr-grid">${table}<div class="dr-side">${pred}${rate}</div></div>`;
    $('#dr-body').scrollTop = 0;
    // スマホ用: 前後のレースへ移動するボタン
    const i = v.races.indexOf(r), prev = v.races[i - 1], next = v.races[i + 1];
    $('#race-pager').innerHTML =
      `<button data-r="${prev ? prev.no : ''}" ${prev ? '' : 'disabled'}>‹ ${prev ? prev.no + 'R' : ''}</button>
       <span>${r.no}R <small>${hm(r.deadline)}</small></span>
       <button data-r="${next ? next.no : ''}" ${next ? '' : 'disabled'}>${next ? next.no + 'R' : ''} ›</button>`;
    const tab = $('#race-tabs .is-on');
    if (tab) tab.scrollIntoView({ block: 'nearest', inline: 'center' });
    tick();
  }

  // ---- イベント
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-venue]');
    if (t) { openDrawer(t.dataset.venue, t.dataset.race ? +t.dataset.race : null); return; }
    if (e.target.closest('[data-close]')) { closeDrawer(); return; }
    const rt = e.target.closest('#race-tabs [data-r], #race-pager [data-r]');
    if (rt) { cur.r = +rt.dataset.r; renderDrawer(); return; }
    const vf = e.target.closest('#venue-filter button');
    if (vf) {
      venueFilter = vf.dataset.f;
      $$('#venue-filter button').forEach((b) => b.classList.toggle('is-on', b === vf));
      renderVenues(); tick(); return;
    }
    const ft = e.target.closest('#finder-tabs button');
    if (ft) {
      finderMode = ft.dataset.mode;
      $$('#finder-tabs button').forEach((b) => b.classList.toggle('is-on', b === ft));
      renderFinder(); return;
    }
    const chip = e.target.closest('.chip');
    if (chip) { finderCond[finderMode][chip.dataset.k] = +chip.dataset.v; renderFinder(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  // スマホ: レース詳細を左右にスワイプして前後のレースへ
  let touch = null;
  $('#dr-body').addEventListener('touchstart', (e) => { touch = e.touches[0]; }, { passive: true });
  $('#dr-body').addEventListener('touchend', (e) => {
    if (!touch || !cur.v) return;
    const t = e.changedTouches[0], dx = t.clientX - touch.clientX, dy = t.clientY - touch.clientY;
    touch = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 50) return;
    const i = cur.v.races.findIndex((x) => x.no === cur.r);
    const to = cur.v.races[i + (dx < 0 ? 1 : -1)];
    if (to) { cur.r = to.no; renderDrawer(); }
  }, { passive: true });

  // ナビのアクティブ表示
  const io = new IntersectionObserver((ents) => ents.forEach((en) => {
    if (en.isIntersecting) $$('.nav a, .tabbar a').forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id));
  }), { rootMargin: '-40% 0px -55% 0px' });
  $$('main .sec').forEach((s) => io.observe(s));

  function renderAll() {
    renderTicker(); renderHero(); renderVenues(); renderRanks(); renderFinder();
    tick();
  }
  renderAll();
  setInterval(tick, 1000);

  // ---- 自動更新: 30秒ごとに today.json を見て、更新されていれば描き直す
  async function refresh() {
    try {
      const data = await window.WAKE_LOAD();
      if (data.updatedAt === updatedAt && data.date === date) return;
      ({ venues, date, updatedAt } = data);
      prepare();
      renderAll();
      if (cur.v && $('#drawer').classList.contains('is-open')) {
        cur.v = venues.find((v) => v.id === cur.v.id) || cur.v;
        const keep = $('#dr-body').scrollTop;
        renderDrawer();
        $('#dr-body').scrollTop = keep;
      }
    } catch (e) { /* 取得中などで読めなければ次の回に */ }
  }
  if (live) {  // 今日を見ているときだけ自動で取り直す
    setInterval(refresh, 30 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }
}).catch((err) => {
  document.querySelector('#venue-grid').innerHTML =
    `<p class="empty">データを読み込めませんでした（${err.message}）。<br>python3 scripts/fetch_today.py を実行してください。</p>`;
});
