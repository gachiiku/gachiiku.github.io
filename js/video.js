/* =========================================================
   GACHIIKU — レース映像
   ▶ を押すと、BOAT RACE 公式の映像プレーヤーを別のタブで開く。
   （公式のサイトポリシーに合わせ、GACHIIKU の画面の中には埋め込まない）
   data-video="場コード-YYYYMMDD-レース番号"
   ========================================================= */
(() => {
  const SLUG = ['', 'kiryu', 'toda', 'edogawa', 'heiwajima', 'tamagawa', 'hamanako', 'gamagori', 'tokoname', 'tsu', 'mikuni',
    'biwako', 'suminoe', 'amagasaki', 'naruto', 'marugame', 'kojima', 'miyajima', 'tokuyama', 'shimonoseki', 'wakamatsu',
    'ashiya', 'fukuoka', 'karatsu', 'omura'];
  const pad = (n) => String(n).padStart(2, '0');

  const urlOf = (jcd, d, r) => `https://front.player.boatrace-cdn.jp/player/vod?service=boatcast&stadium=${pad(jcd)}${SLUG[jcd]}`
    + `&raceType=race&raceDate=${d}&raceNumber=${pad(r)}&autoplay=0&bitrate=low`;

  function open(jcd, d, r) {
    window.open(urlOf(+jcd, d, +r), '_blank', 'noopener');
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-video]');
    if (!b) return;
    e.preventDefault();
    const [j, d, r] = b.dataset.video.split('-');
    open(j, d, r);
  });
  window.WAKE_VIDEO = open;
})();
