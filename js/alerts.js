/* =========================================================
   GACHIIKU — 展示の特殊アラート（前づけ・3角）
   スタート展示で前づけ（枠より内のコースに入った）や、3角（3コースの艇がダッシュに引いた）が出たレースを
   ・レース番号や場の枠の色を変える（cls / badge）
   ・新しく出たときに画面の上にお知らせを出す（notify）
   3角は data/exkado.json（展示映像を見て判定したもの）、前づけは today.json の展示コース（exCourse）から。
   ========================================================= */
(() => {
  let exk = { races: {} };
  const subs = [];
  const load = () => fetch('data/exkado.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d) { const changed = JSON.stringify(d) !== JSON.stringify(exk); exk = d; if (changed) subs.forEach((f) => f()); } })
    .catch(() => {});

  // そのレースのアラート。なければ null
  function info(v, r, date) {
    const mae = (r.boats || []).filter((b) => b.exCourse && b.exCourse < b.lane);
    const ek = exk.date === date ? exk.races[`${v.id}-${r.no}`] : null;
    const kado = !!(ek && ek.k === 1);
    if (!mae.length && !kado) return null;
    const three = (r.boats || []).find((b) => b.exCourse === 3);
    const text = [
      kado ? `3コース${three ? `の${three.lane}号艇` : ''}がダッシュに引いて3角` : '',
      ...mae.map((b) => `${b.lane}号艇が${b.exCourse}コースへ前づけ`),
    ].filter(Boolean).join('・');
    return { kado, mae: mae.length > 0, label: kado && mae.length ? '3角・前づけ' : kado ? '3角' : '前づけ', text };
  }
  const cls = (a) => (a ? (a.kado ? 'is-al is-al-kado' : 'is-al is-al-mae') : '');
  const badge = (a) => (a ? `<span class="al-badge ${a.kado ? 'al-badge--kado' : ''}">${a.kado && a.mae ? '3角・前' : a.kado ? '3角' : '前'}</span>` : '');
  // その場で、まだ終わっていないレースのアラート（締切が近い順）
  const upcoming = (v, date) => v.races.filter((r) => !r.result).map((r) => ({ r, a: info(v, r, date) })).filter((x) => x.a);

  // ---- お知らせ（新しく出たものだけ。同じものは1日1回）
  function toast(v, r, a, href) {
    let box = document.getElementById('al-toasts');
    if (!box) { box = document.createElement('div'); box.id = 'al-toasts'; document.body.appendChild(box); }
    const el = document.createElement('a');
    el.className = `al-toast ${a.kado ? 'al-toast--kado' : ''}`;
    el.href = href;
    el.innerHTML = `<b>展示で${a.label}　${v.name} ${r.no}R</b><span>${a.text}</span><i role="button" aria-label="閉じる">×</i>`;
    el.querySelector('i').addEventListener('click', (e) => { e.preventDefault(); el.remove(); });
    box.appendChild(el);
    setTimeout(() => el.remove(), 20000);
  }
  function notify(venues, date, link) {
    const key = `gachiiku_alert_seen_${date}`;
    let seen;
    try { seen = new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch (e) { seen = new Set(); }
    const fresh = [];
    venues.filter((v) => v.open).forEach((v) => upcoming(v, date).forEach(({ r, a }) => {
      const id = `${v.id}-${r.no}-${a.label}`;
      if (!seen.has(id)) { seen.add(id); fresh.push({ v, r, a }); }
    }));
    try { localStorage.setItem(key, JSON.stringify([...seen])); } catch (e) { /* 保存できなくても表示はする */ }
    fresh.slice(0, 3).forEach(({ v, r, a }) => toast(v, r, a, link(v, r)));
  }

  window.GALERT = { load, info, cls, badge, upcoming, notify, onChange: (f) => subs.push(f) };
  load();
  setInterval(load, 60 * 1000);
})();
