/* =========================================================
   GACHIIKU — レースページ（race.html?j=場コード&r=レース番号[&d=日付]）
   出走表を「艇ごとの縦の列」で並べ、コース別データ・今節成績を載せる。
   ========================================================= */
window.WAKE_READY.then((first) => {
  let { venues, date, updatedAt } = first;
  const $ = (s, el = document) => el.querySelector(s);
  const pad = (n) => String(n).padStart(2, '0');
  const hm = (m) => (m == null ? '--:--' : `${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  const f2 = (n) => (n == null ? '—' : n.toFixed(2));
  const f1 = (n) => (n == null ? '—' : n.toFixed(1));
  const st2 = (n) => (n == null ? '—' : n.toFixed(2).replace(/^0/, ''));
  const yen = (n) => n.toLocaleString('ja-JP') + '円';
  const q = new URLSearchParams(location.search);
  const isToday = !q.get('d');
  let jcd = +q.get('j') || 0;
  let rno = +q.get('r') || 0;

  // 選手データ（成績 s / 期別 r）は登番ごとに1回だけ読む
  const cache = {};
  const getJSON = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  function racer(no) {
    if (!cache[no]) cache[no] = Promise.all([getJSON(`data/racers/s/${no}.json`), getJSON(`data/racers/r/${no}.json`)]);
    return cache[no];
  }

  const nextRace = (v) => v.races.find((r) => !r.result) || null;
  function pickDefault() {
    const open = venues.filter((v) => v.open);
    if (!open.find((v) => v.id === jcd)) jcd = (open.find((v) => nextRace(v)) || open[0] || {}).id;
    const v = venues.find((x) => x.id === jcd);
    if (v && !v.races.find((r) => r.no === rno)) rno = (nextRace(v) || v.races[v.races.length - 1]).no;
  }
  function syncUrl() {
    const p = new URLSearchParams(location.search);
    p.set('j', jcd); p.set('r', rno);
    history.replaceState(null, '', `?${p.toString()}${location.hash}`);
  }

  // ---------- 時計・カウントダウン ----------
  function tick() {
    const d = new Date();
    $('#clock').innerHTML = `<small>現在</small>${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const t = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    document.querySelectorAll('[data-deadline]').forEach((el) => {
      const left = +el.dataset.deadline * 60 - t;
      el.textContent = !isToday ? '' : left <= -300 ? '結果待ち' : left <= 0 ? 'レース中' : left >= 3600 ? `あと${Math.floor(left / 3600)}時間${Math.floor(left % 3600 / 60)}分` : `締切まで ${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
      el.classList.toggle('is-hot', left > 0 && left < 300);
    });
  }

  // ---------- 上部: 開催場・レース切り替え ----------
  function renderNav(v, r) {
    $('#rc-venues').innerHTML = venues.filter((x) => x.open).map((x) => {
      const n = nextRace(x);
      return `<a href="?${isToday ? '' : `d=${date}&`}j=${x.id}" class="${x.id === v.id ? 'is-on' : ''}">
        <b>${x.name}</b><small>${n ? `${n.no}R ${hm(n.deadline)}` : '終了'}</small></a>`;
    }).join('');
    $('#rc-meta').innerHTML = `<span class="tag tag--g ${v.grade === 'SG' || v.grade === 'G1' ? 'is-big' : ''}">${v.grade}</span>${v.night ? '<span class="tag tag--night">ナイター</span>' : ''} ${v.title}・${v.day}`;
    $('#rc-title').innerHTML = `${v.name} <span>${r.no}R</span> <small>${r.name}${r.dist ? `・${r.dist}m` : ''}</small>
      <em class="rc-dl">締切 ${hm(r.deadline)} <i data-deadline="${r.result ? '' : r.deadline}"></i></em>`;
    $('#rc-tabs').innerHTML = v.races.map((x) =>
      `<a href="?${isToday ? '' : `d=${date}&`}j=${v.id}&r=${x.no}" class="${x.no === r.no ? 'is-on' : ''} ${x.result ? 'is-done' : ''}">${x.no}R<small>${hm(x.deadline)}</small></a>`).join('');
    const on = $('#rc-tabs .is-on');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    document.title = `${v.name} ${r.no}R 出走表｜GACHIIKU`;
  }

  // ---------- 今節成績 ----------
  // 過去の日は data/hist から作った s.series、今日の分は today.json の結果から
  function todaysRuns(v, no) {
    return v.races.filter((x) => x.boats.some((b) => b.no === no)).map((x) => {
      const b = x.boats.find((y) => y.no === no);
      const ord = x.result && x.result.order ? x.result.order.indexOf(b.lane) : -1;
      return { r: x.no, lane: b.lane, course: null, st: null,
        pos: x.result ? (x.result.canceled ? '中' : ord >= 0 ? ord + 1 : '4-') : null };
    });
  }
  function seriesRuns(s, v) {
    if (!s) return [];
    const ser = s.series.find((x) => x.jcd === v.id && x.to >= shift(date, -3) && x.to < date);
    return ser ? ser.runs : [];
  }
  function shift(d, n) {
    const t = new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8) + n);
    return `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}`;
  }

  // ---------- モーター評価（admin.html で入力 → data/motor_eval.json） ----------
  const MEV_AXES = [['nobi', '伸び足'], ['iki', '行き足'], ['de', '出足']];
  let mev = {};
  const loadMev = () => fetch('data/motor_eval.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).then((d) => { mev = d.motors || {}; }).catch(() => {});
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function mevCell(jcd, motorNo, k) {
    const e = mev[`${jcd}-${motorNo}`];
    const n = e && +e[k];
    return n >= 1 && n <= 5 ? `<span class="mnum mnum--${n}"><b>${n}</b><i style="--w:${n * 20}%"></i></span>` : '<small>未評価</small>';
  }
  // 総合: 3項目の平均 → S/A/B/C/E
  function mevTotal(jcd, motorNo) {
    const e = mev[`${jcd}-${motorNo}`];
    if (!e) return '<small>未評価</small>';
    const xs = MEV_AXES.map(([k]) => +e[k]).filter((x) => x >= 1 && x <= 5);
    if (!xs.length) return '<small>未評価</small>';
    const a = xs.reduce((p, q) => p + q, 0) / xs.length;
    const g = a >= 4.5 ? 'S' : a >= 3.5 ? 'A' : a >= 2.5 ? 'B' : a >= 1.5 ? 'C' : 'E';
    return `<span class="mgrade mgrade--${g}">${g}</span>`;
  }

  // ---------- モーター機歴（data/motors） ----------
  const motorSum = {};
  const loadMotors = (j) => (motorSum[j] ? Promise.resolve() : getJSON(`data/motors/${j}.json`).then((d) => { motorSum[j] = d || { motors: {} }; }));
  const mstat = (j, m) => ((motorSum[j] || {}).motors || {})[m] || null;

  // ---------- 本体 ----------
  let seq = 0;
  async function render() {
    pickDefault();
    const v = venues.find((x) => x.id === jcd);
    if (!v) { $('#rc-title').textContent = 'この日の開催はありません'; return; }
    const r = v.races.find((x) => x.no === rno);
    syncUrl();
    renderNav(v, r);
    const my = ++seq;
    const [data] = await Promise.all([Promise.all(r.boats.map((b) => racer(b.no))), loadMev(), loadMotors(v.id)]);
    if (my !== seq) return; // 途中で別のレースに切り替わった
    const boats = r.boats.map((b, i) => ({ b, s: data[i][0], p: data[i][1] }));
    $('#rc-body').innerHTML = renderBody(v, r, boats);
    tick();
  }

  function renderBody(v, r, boats) {
    const wx = v.weather || {};
    const cond = `<div class="cond-row">
      <div><span>締切</span><b>${hm(r.deadline)}</b></div>
      <div><span>天候${wx.at ? `（${wx.at}時点）` : ''}</span><b>${wx.weather || '—'}</b></div>
      <div><span>風</span><b>${wx.wind != null ? `${wx.windDir || ''} ${wx.wind}m` : '—'}</b></div>
      <div><span>波高</span><b>${wx.wave != null ? wx.wave + 'cm' : '—'}</b></div>
      <div><span>気温 / 水温</span><b>${wx.temp != null ? `${wx.temp}℃ / ${wx.waterTemp}℃` : '—'}</b></div></div>`;
    const result = r.result && r.result.canceled
      ? '<div class="result result--cancel"><span class="result__l">レース中止</span><span class="result__note">舟券は返還されます</span></div>'
      : r.result ? `<div class="result"><span class="result__l">結果</span>
        <div class="result__o">${r.result.order.map((l) => `<span class="ln ln-${l}">${l}</span>`).join('<i>-</i>')}</div>
        <span class="result__p ${r.result.payout >= 10000 ? 'is-man' : ''}">3連単 ${yen(r.result.payout)}</span>
        <button class="vbtn" data-video="${v.id}-${date}-${r.no}">▶ レース映像</button></div>` : '';

    const col = (fn, cls = '') => boats.map((x) => `<td class="${cls}">${fn(x)}</td>`).join('');
    const sec = (title, note) => `<tr class="rc-sec"><th colspan="7">${title}${note ? `<small>${note}</small>` : ''}</th></tr>`;
    const row = (label, fn, cls = '') => `<tr><th>${label}</th>${col(fn, cls)}</tr>`;
    const best = (vals, low) => { const xs = vals.filter((x) => x != null); return xs.length ? (low ? Math.min(...xs) : Math.max(...xs)) : null; };
    const hi = (val, b) => (val != null && val === b ? ' class="is-best"' : '');
    const num = (val, fmt, b) => `<b${hi(val, b)}>${fmt(val)}</b>`;

    // コース別（この艇が枠なりで入ったとき）
    const cs = (x, key) => { const s = x.s; const c = s && s[key] ? s[key][x.b.lane - 1] : null; return c && c.n ? c : null; };
    const loc = (x) => { const s = x.s; const a = s && s.local5y ? s.local5y[String(v.id)] : null; const c = a ? a[x.b.lane - 1] : null; return c && c.n ? c : null; };
    const kim = (c) => (c ? `${c.sashi}/${c.makuri}/${c.msashi}` : '—');
    const c1 = boats.map((x) => cs(x, 'c1y'));
    const gen = boats.map((x) => cs(x, 'gen1y'));
    const lc = boats.map(loc);
    const block = (arr, withSt) => [
      withSt ? row('平均ST<br><small>ST順</small>', (x) => { const c = arr[x.i]; return c ? `${num(c.st, st2, best(arr.map((a) => a && a.st), true))}<small>${c.strank ?? '—'}</small>` : '—'; }) : row('出走数', (x) => (arr[x.i] ? arr[x.i].n : '—')),
      row('勝率', (x) => (arr[x.i] ? num(arr[x.i].win, f2, best(arr.map((a) => a && a.win))) : '—')),
      row('決まり手<br><small>差/捲/捲差</small>', (x) => kim(arr[x.i]), 'is-sm'),
      row('2着内率', (x) => (arr[x.i] ? num(arr[x.i].r2, f1, best(arr.map((a) => a && a.r2))) : '—')),
      row('3着内率', (x) => (arr[x.i] ? num(arr[x.i].r3, f1, best(arr.map((a) => a && a.r3))) : '—')),
    ].join('');
    boats.forEach((x, i) => { x.i = i; });

    const bestNat = best(boats.map((x) => x.b.nat));
    const bestLoc = best(boats.map((x) => x.b.local || null));
    const bestMot = best(boats.map((x) => x.b.motor2));
    const bestEx = best(boats.map((x) => x.b.exTime), true);
    const bestSt = best(boats.map((x) => x.b.st), true);

    // 今節平均ST・平均ST順
    const ser = boats.map((x) => seriesRuns(x.s, v));
    const serSt = ser.map((runs) => { const a = runs.filter((u) => u[5] > 0); return a.length ? a.reduce((s, u) => s + u[5], 0) / a.length : null; });

    // 今節成績（日ごと）
    const days = Math.max(1, ...ser.map((runs) => (runs.length ? runs[runs.length - 1][1] : 0))) + (isToday ? 1 : 0);
    const posCls = (p) => (p === 1 ? 'is-win' : typeof p === 'number' && p <= 3 ? 'is-in' : '');
    const dayRows = [];
    for (let d = 1; d <= days; d++) {
      const label = d === days && isToday ? '本日' : `${d}日目`;
      dayRows.push(`<tr class="rc-days"><th>${label}</th>${boats.map((x, i) => {
        const runs = d === days && isToday ? todaysRuns(v, x.b.no) : ser[i].filter((u) => u[1] === d).map((u) => ({ r: u[2], lane: u[3], course: u[4], st: u[5], pos: u[6] }));
        return `<td>${runs.map((u) => `<span class="rc-run ${d === days && isToday && u.r === r.no ? 'is-now' : ''}">
          <small>${u.r}R</small><i class="ln ln-${u.lane}">${u.lane}</i>
          <b class="${posCls(u.pos)}">${u.pos == null ? '' : typeof u.pos === 'string' ? u.pos.replace(/\d/, '') : u.pos}${u.course ? `<small>(${u.course})</small>` : ''}</b>
          ${u.st != null ? `<small>${u.st < 0 ? 'F' : ''}${st2(Math.abs(u.st))}</small>` : ''}</span>`).join('')}</td>`;
      }).join('')}</tr>`);
    }

    // イン逃げ時（2〜6コース）
    const inesc = boats.map((x) => (x.s && x.b.lane > 1 ? x.s.inesc1y[x.b.lane - 1] : null));

    // 勝ち筋・負け筋（1コースは 逃げ/差され/捲られ/捲られ差、2〜6コースは 逃し/差し/捲り/捲り差し）
    const KN = [['逃げ', '逃し'], ['差され', '差し'], ['捲られ', '捲り'], ['捲られ差', '捲り差し']];
    const KS = { 'まくり': '捲り', 'まくり差し': '捲り差し' };
    const kimOf = (x) => (x.s && x.s.kimt ? x.s.kimt.all['1y'][x.b.lane - 1] : null);
    const kimRows = KN.map(([l1, l2], i) => `<tr><th>${l1} / ${l2}</th>${boats.map((x) => {
      const k = kimOf(x);
      const lose = (x.b.lane === 1 && i > 0) || (x.b.lane > 1 && i === 0);
      return `<td class="${lose ? 'k-lose-c' : 'k-gain-c'}">${k && k[0] ? `<small>${x.b.lane === 1 ? l1 : l2}</small><b>${f1(k[i + 1])}</b>` : '—'}</td>`;
    }).join('')}</tr>`).join('')

    const table = `<div class="rc-scroll"><table class="rc-tbl">
      <thead><tr><th>枠</th>${boats.map(({ b }) => `<th><span class="ln ln-${b.lane}">${b.lane}</span></th>`).join('')}</tr></thead>
      <tbody>
        ${row('選手', ({ b, p }) => `<a class="rc-name" href="#r/${b.no}"><b>${b.name}</b><small>${b.no}${p ? `・${p.grad}期` : ''}</small></a>`, 'rc-who')}
        ${row('級別<br><small>年齢・支部</small>', ({ b, p }) => `<span class="cls cls-${b.cls}">${b.cls}</span><small>${b.age}歳・${b.branch}</small>`)}
        ${row('体重', ({ b }) => `${b.weight ?? '—'}<small>kg</small>`)}
        ${row('F / L', ({ b }) => `<span class="${b.f ? 'is-warn' : ''}">F${b.f || 0}</span> / L${b.l || 0}`)}
        ${row('全国<br><small>勝率 / 2連率</small>', ({ b }) => `${num(b.nat, f2, bestNat)}<small>${f1(b.nat2)}%</small>`)}
        ${row('当地<br><small>勝率 / 2連率</small>', ({ b }) => (b.local ? `${num(b.local, f2, bestLoc)}<small>${f1(b.local2)}%</small>` : '—'))}
        ${row('モーター<br><small>No / 2連率</small>', ({ b }) => `<small>#${b.motorNo}</small>${num(b.motor2, f1, bestMot)}`)}
        ${sec('モーター機歴', motorSum[v.id] && motorSum[v.id].start ? `${+motorSum[v.id].start.slice(4, 6)}/${+motorSum[v.id].start.slice(6)}の使用開始から` : '使用開始から')}
        ${row('ランク<br><small>2連率順</small>', ({ b }) => { const s = mstat(v.id, b.motorNo); return s && s.all.n ? `<b>${s.all.rank}</b><small>/ ${motorSum[v.id].count}機</small>` : '—'; })}
        ${row('2連率<br><small>出走数</small>', ({ b }) => { const s = mstat(v.id, b.motorNo); return s && s.all.n ? `${num(s.all.r2, f1, best(boats.map((x) => (mstat(v.id, x.b.motorNo) || { all: {} }).all.r2)))}<small>${s.all.n}走</small>` : '—'; })}
        ${row('直近1ヶ月<br><small>2連率</small>', ({ b }) => { const s = mstat(v.id, b.motorNo); return s && s.m1.n ? `${f1(s.m1.r2)}<small>${s.m1.n}走</small>` : '—'; })}
        ${row('貢献P', ({ b }) => { const s = mstat(v.id, b.motorNo); return s && s.all.kp != null ? `<b class="${s.all.kp > 0 ? 'is-plus' : 'is-minus'}">${s.all.kp > 0 ? '+' : ''}${s.all.kp.toFixed(2)}</b>` : '—'; })}
        ${row('展示順位<br><small>平均</small>', ({ b }) => { const s = mstat(v.id, b.motorNo); return s && s.all.exRank ? f2(s.all.exRank) : '—'; })}
        ${row('履歴', ({ b }) => `<a class="mbtn" href="#m/${b.motorNo}"><b>#${b.motorNo}</b><span>履歴 ›</span></a>`)}
        ${sec('モーター評価', 'GACHIIKU独自の評価')}
        ${row('総合', ({ b }) => mevTotal(v.id, b.motorNo))}
        ${MEV_AXES.map(([k, l]) => row(`${l}<br><small>5点満点</small>`, ({ b }) => mevCell(v.id, b.motorNo, k))).join('')}
        ${boats.some(({ b }) => (mev[`${v.id}-${b.motorNo}`] || {}).memo) ? row('メモ', ({ b }) => `<span class="mev-memo">${esc((mev[`${v.id}-${b.motorNo}`] || {}).memo || '')}</span>`, 'is-memo') : ''}
        ${row('ボート<br><small>No / 2連率</small>', ({ b }) => `<small>#${b.boatNo}</small>${f1(b.boat2)}`)}
        ${row('展示<br><small>タイム / チルト</small>', ({ b }) => (b.exTime ? `${num(b.exTime, f2, bestEx)}<small>${b.tilt ?? ''}</small>` : '—'))}
        ${sec('勝ち筋・負け筋', '直近1年・枠なり進入のとき')}
        ${kimRows}
        ${sec('スタートデータ')}
        ${row('平均ST<br><small>全国</small>', ({ b }) => num(b.st, st2, bestSt))}
        ${row('今節平均ST', (x) => num(serSt[x.i], st2, best(serSt, true)))}
        ${sec('コース別データ', '直近1年・枠なり進入のとき')}
        ${block(c1, true)}
        ${sec(`当地コース別データ`, `${v.name}・直近5年`)}
        ${block(lc, false)}
        ${sec('一般戦コース別データ', 'SG・G1以外・直近1年')}
        ${block(gen, false)}
        ${sec('イン逃げ時のコース別データ', '1コースが逃げたレースで・直近1年')}
        ${row('2着内率', (x) => (inesc[x.i] && inesc[x.i].n ? num(inesc[x.i].r2, f1, best(inesc.map((a) => a && a.n ? a.r2 : null))) : '—'))}
        ${row('3着内率', (x) => (inesc[x.i] && inesc[x.i].n ? num(inesc[x.i].r3, f1, best(inesc.map((a) => a && a.n ? a.r3 : null))) : '—'))}
        ${sec('今節成績', 'レース・艇番・着順(進入)・ST')}
        ${dayRows.join('')}
        ${isToday ? row('早見', ({ b }) => v.races.filter((x) => x.no !== r.no && !x.result && x.boats.some((y) => y.no === b.no)).map((x) => `<a href="?j=${v.id}&r=${x.no}">${x.no}R</a>`).join(' ') || '—', 'rc-hayami') : ''}
      </tbody></table></div>`;

    const hasStats = boats.some((x) => x.s);
    return cond + result + table
      + `<p class="rc-note">赤字はそのレースの6艇で一番良い数字。コース別データは各選手が枠番どおりのコースに入ったときの成績です${hasStats ? `（集計 ${boats.find((x) => x.s).s.histSpan.map((d) => `${d.slice(0, 4)}/${+d.slice(4, 6)}/${+d.slice(6)}`).join('〜')}）` : ''}。</p>`;
  }

  // ---------- モーター機歴ページ（#m/番号） ----------
  const VN = ['', '桐生', '戸田', '江戸川', '平和島', '多摩川', '浜名湖', '蒲郡', '常滑', '津', '三国', 'びわこ', '住之江',
    '尼崎', '鳴門', '丸亀', '児島', '宮島', '徳山', '下関', '若松', '芦屋', '福岡', '唐津', '大村'];
  const mo = document.createElement('div');
  mo.className = 'racer';
  mo.id = 'motor';
  mo.setAttribute('aria-hidden', 'true');
  mo.innerHTML = `<div class="racer__panel" role="dialog" aria-modal="true" aria-labelledby="mo-title">
    <header class="racer__head"><button class="racer__back" data-mclose>‹ 戻る</button>
      <div><p class="drawer__meta" id="mo-meta"></p><h3 class="racer__title" id="mo-title"></h3></div></header>
    <div class="racer__body" id="mo-body"></div></div>`;
  document.body.appendChild(mo);
  let moIn = false;
  async function openMotor(m) {
    mo.classList.add('is-open'); mo.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    $('#mo-title').textContent = `${VN[jcd]} ${m}号機`;
    $('#mo-meta').textContent = 'モーター機歴';
    $('#mo-body').innerHTML = '<p class="empty">読み込み中…</p>';
    const d = await getJSON(`data/motors/${jcd}/${m}.json`);
    if (!d) { $('#mo-body').innerHTML = '<p class="empty">このモーターの機歴はまだありません。</p>'; return; }
    $('#mo-body').innerHTML = motorBody(d);
    $('#mo-body').scrollTop = 0;
  }
  function closeMotor() {
    mo.classList.remove('is-open'); mo.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('#racer.is-open')) document.body.style.overflow = '';
  }
  const ymdS = (x) => `${x.slice(0, 4)}/${+x.slice(4, 6)}/${+x.slice(6, 8)}`;
  const posS = (p) => (typeof p === 'number' ? p : String(p || '—').replace(/\d/, ''));
  function motorBody(d) {
    const A = d.summary.all, M1 = d.summary.m1;
    const e = mev[`${d.jcd}-${d.motor}`];
    const card = (t, a) => `<div class="mo-sum"><h5>${t}</h5><dl>
      <div><dt>ランク</dt><dd>${a.rank ? `${a.rank}<small>位</small>` : '—'}</dd></div>
      <div><dt>2連率</dt><dd>${f1(a.r2)}<small>%</small></dd></div>
      <div><dt>3連率</dt><dd>${f1(a.r3)}<small>%</small></dd></div>
      <div><dt>1着率</dt><dd>${f1(a.r1)}<small>%</small></dd></div>
      <div><dt>勝率</dt><dd>${f2(a.win)}</dd></div>
      <div><dt>貢献P</dt><dd class="${a.kp > 0 ? 'is-plus' : 'is-minus'}">${a.kp == null ? '—' : (a.kp > 0 ? '+' : '') + a.kp.toFixed(2)}</dd></div>
      <div><dt>展示順位</dt><dd>${f2(a.exRank)}</dd></div>
      <div><dt>出走</dt><dd>${a.n}<small>走</small></dd></div>
      <div><dt>優出 / 優勝</dt><dd>${a.finals} / ${a.champs}</dd></div></dl></div>`;
    const evalHtml = e ? `<div class="mo-eval"><b>GACHIIKU評価</b>${MEV_AXES.map(([k, l]) => `<span>${l} <b>${e[k] || '—'}</b></span>`).join('')}<span>総合 ${mevTotal(d.jcd, d.motor)}</span>${e.memo ? `<em>${esc(e.memo)}</em>` : ''}</div>` : '';
    const ser = d.series.map((s) => `<div class="card mo-ser">
      <h4 class="card__h"><span class="tag tag--g ${s.grade === 'SG' || s.grade === 'G1' ? 'is-big' : ''}">${s.grade}</span>${s.title}
        <small>${+s.from.slice(4, 6)}/${+s.from.slice(6)}〜${+s.to.slice(4, 6)}/${+s.to.slice(6)}</small></h4>
      <p class="mo-who"><a href="players.html#r/${s.no}">${s.name || s.no}</a> <small>${s.no}${s.cls ? '・' + s.cls : ''}</small></p>
      <div class="rp-tbl-wrap"><table class="rp-tbl mo-tbl"><thead><tr><th>日付</th><th>R</th><th>レース</th><th>枠</th><th>進入</th><th>ST</th><th>展示</th><th>着</th><th>映像</th></tr></thead>
      <tbody>${s.runs.map(([dt, rr, nm, ln, c, st, pos, ex, exr]) => `<tr class="${pos === 1 ? 'is-win' : ''}">
        <td>${+dt.slice(4, 6)}/${+dt.slice(6)}</td><td>${rr}R</td><td class="mo-rn">${nm}</td>
        <td><span class="ln ln-${ln}">${ln}</span></td><td>${c || '—'}</td>
        <td>${st == null ? '—' : st < 0 ? 'F' + st2(-st) : st2(st)}</td>
        <td>${ex ? ex.toFixed(2) : '—'}<small>${exr ? exr + '位' : ''}</small></td>
        <td>${typeof pos === "number" ? `<span class="pos pos--${pos}">${pos}</span>` : `<span class="pos pos--x">${posS(pos)}</span>`}</td>
        <td><button class="vbtn vbtn--sm" data-video="${d.jcd}-${dt}-${rr}" aria-label="映像">▶</button></td></tr>`).join('')}</tbody></table></div></div>`).join('');
    return `${evalHtml}<p class="rp-span">使用開始 ${ymdS(d.start)} 〜 ${ymdS(d.last)} の全出走（${d.series.length}節）。貢献P＝そのモーターで取った得点と、乗った選手のふだんの勝率との差（プラスほど選手の実力以上に走っている）。</p>
      <div class="mo-sums">${card('使用開始から', A)}${card('直近1ヶ月', M1)}</div>${ser || '<p class="empty">出走記録がありません</p>'}`;
  }
  function routeMotor() {
    const m = location.hash.match(/^#m\/(\d{1,3})$/);
    if (m) openMotor(+m[1]);
    else if (mo.classList.contains('is-open')) closeMotor();
  }
  window.addEventListener('hashchange', () => { moIn = /^#m\//.test(location.hash) || moIn; routeMotor(); });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-mclose]')) return;
    if (moIn) history.back();
    else { history.replaceState(null, '', location.pathname + location.search); closeMotor(); }
    moIn = false;
  });

  // ---------- 操作 ----------
  document.addEventListener('click', (e) => {
    const a = e.target.closest('#rc-tabs a, #rc-venues a, .rc-hayami a');
    if (!a) return;
    e.preventDefault();
    const p = new URLSearchParams(a.getAttribute('href').slice(1));
    jcd = +p.get('j'); rno = +p.get('r') || 0;
    if (!p.get('r')) { const v = venues.find((x) => x.id === jcd); rno = v && nextRace(v) ? nextRace(v).no : 0; }
    render();
    window.scrollTo({ top: 0 });
  });

  render().then(routeMotor);
  setInterval(tick, 1000);

  // 今日のレースは30秒ごとに結果・展示を取り直す
  if (isToday) {
    setInterval(async () => {
      try {
        const data = await window.WAKE_LOAD();
        if (data.updatedAt === updatedAt) return;
        ({ venues, date, updatedAt } = data);
        render();
      } catch (e) { /* 次の回に */ }
    }, 30 * 1000);
  }
}).catch((err) => {
  document.querySelector('#rc-title').textContent = `データを読み込めませんでした（${err.message}）`;
});
