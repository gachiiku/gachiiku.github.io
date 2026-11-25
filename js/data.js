/* =========================================================
   データ読み込み
   scripts/fetch_today.py が書き出した data/today.json を読む。
   ========================================================= */
(function () {
  // 予想指数: 枠の有利さ・勝率・モーター・展示・平均STを合成した簡易スコア
  const LANE_ADV = [34, 16, 13, 11, 8, 5];
  function indexOf(b) {
    let v = LANE_ADV[b.lane - 1] + (b.nat || 0) * 4 + ((b.motor2 || 35) - 35) * 0.4;
    if (b.st) v += (0.16 - b.st) * 80;
    if (b.exTime) v += (6.8 - b.exTime) * 60;
    return Math.round(v * 10) / 10;
  }

  // d を渡すとその日の保存データ（data/archive/YYYYMMDD.json）を読む
  const load = (d) => fetch(d ? `data/archive/${d}.json` : 'data/today.json', { cache: 'no-store' })
    .then((r) => {
      if (!r.ok) throw new Error('data/today.json が見つかりません');
      return r.json();
    })
    .then((data) => {
      data.venues.forEach((v) => {
        v.races.forEach((race) => race.boats.forEach((b) => { b.index = indexOf(b); }));
      });
      return data;
    });

  window.WAKE_LOAD = load;

  // 表示する日を決める
  //   ?d=YYYYMMDD … その日（保存データ）
  //   ?today=1    … 今日（全レースが終わっていても今日のまま）
  //   指定なし    … 今日。ただし全場のレースが終わっていて明日の出走表があれば明日
  const params = new URLSearchParams(location.search);
  const q = params.get('d');
  const pad = (n) => String(n).padStart(2, '0');
  const t = new Date();
  const realToday = `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}`;
  async function ready() {
    const days = await fetch('data/days.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { dates: [] })).catch(() => ({ dates: [] }));
    const view = { days: days.dates || [], today: realToday, auto: false, live: false };
    if (/^\d{8}$/.test(q || '')) {
      const d = await load(q);
      view.live = false;
      return Object.assign(d, { view });
    }
    const d = await load(null);
    view.today = d.date || realToday;
    const races = d.venues.filter((v) => v.open).flatMap((v) => v.races);
    const allDone = races.length > 0 && races.every((r) => r.result);
    const next = view.days.find((x) => x > d.date);
    // 全場のレースが終わったら、トップもレースページも明日の出走表に切り替える（?today=1 で今日のまま）
    if (!params.has('today') && allDone && next) {
      const n = await load(next).catch(() => null);
      // 明日の出走表がまだ出ていない（開催場がない）ときは、今日のまま
      if (n && n.venues.some((v) => v.open && v.races.length)) {
        view.auto = true;
        return Object.assign(n, { view });
      }
    }
    view.live = true;
    return Object.assign(d, { view });
  }
  window.WAKE_READY = ready();
})();
