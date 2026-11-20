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
  const q = new URLSearchParams(location.search).get('d');
  window.WAKE_READY = load(/^\d{8}$/.test(q || '') ? q : null);
})();
