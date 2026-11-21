/* =========================================================
   GACHIIKU — ヘッダーの「次の締切」カウントダウン
   全場の中で、次に締切が来るレースまでの残り時間を出す（どのページでも共通）
   ========================================================= */
(() => {
  const el = document.getElementById('next-dl');
  const base = (document.currentScript && document.currentScript.dataset.base) || '';  // サブフォルダのページ用
  if (!el) return;
  const pad = (n) => String(n).padStart(2, '0');
  let races = [];  // [{name, jcd, no, deadline(分)}]
  let day = '';

  async function load() {
    try {
      const d = await fetch(base + 'data/today.json', { cache: 'no-store' }).then((r) => r.json());
      const t = new Date();
      day = d.date;
      const today = `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}`;
      races = d.date !== today ? [] : d.venues.filter((v) => v.open).flatMap((v) => v.races
        .filter((r) => !r.result && r.deadline != null)
        .map((r) => ({ name: v.name, jcd: v.id, no: r.no, deadline: r.deadline })));
    } catch (e) { /* 次の回に */ }
  }

  function tick() {
    const d = new Date();
    const now = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    const next = races.filter((r) => r.deadline * 60 > now).sort((a, b) => a.deadline - b.deadline)[0];
    if (!next) { el.hidden = true; return; }
    const left = next.deadline * 60 - now;
    const h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60), s = left % 60;
    el.hidden = false;
    el.href = `${base}race.html?j=${next.jcd}&r=${next.no}`;
    el.classList.toggle('is-hot', left < 300);
    el.innerHTML = `<small>次の締切</small><span class="hdr__nrace">${next.name} ${next.no}R</span>`
      + `<b>${h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`}</b>`;
  }

  load().then(tick);
  setInterval(tick, 1000);
  setInterval(load, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load().then(tick); });
})();
