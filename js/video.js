/* =========================================================
   GACHIIKU — レース映像（公式 BOATCAST のリプレイを埋め込んで再生）
   WAKE_VIDEO(場コード, 'YYYYMMDD', レース番号) で開く
   ========================================================= */
(() => {
  const SLUG = ['', 'kiryu', 'toda', 'edogawa', 'heiwajima', 'tamagawa', 'hamanako', 'gamagori', 'tokoname', 'tsu', 'mikuni',
    'biwako', 'suminoe', 'amagasaki', 'naruto', 'marugame', 'kojima', 'miyajima', 'tokuyama', 'shimonoseki', 'wakamatsu',
    'ashiya', 'fukuoka', 'karatsu', 'omura'];
  const VEN = ['', '桐生', '戸田', '江戸川', '平和島', '多摩川', '浜名湖', '蒲郡', '常滑', '津', '三国', 'びわこ', '住之江',
    '尼崎', '鳴門', '丸亀', '児島', '宮島', '徳山', '下関', '若松', '芦屋', '福岡', '唐津', '大村'];
  const pad = (n) => String(n).padStart(2, '0');

  const box = document.createElement('div');
  box.className = 'vmodal';
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = `<div class="vmodal__scrim" data-vclose></div>
    <div class="vmodal__panel" role="dialog" aria-modal="true" aria-label="レース映像">
      <header class="vmodal__head"><b id="vm-title"></b><button class="vmodal__close" data-vclose aria-label="閉じる">✕</button></header>
      <div class="vmodal__frame"><iframe id="vm-frame" allow="autoplay; fullscreen" allowfullscreen title="レース映像"></iframe></div>
      <p class="vmodal__note">映像：BOAT RACE 公式「BOATCAST」　<a id="vm-link" target="_blank" rel="noopener">BOATCASTで開く ↗</a></p>
    </div>`;
  document.body.appendChild(box);

  function open(jcd, d, r) {
    jcd = +jcd; r = +r;
    const src = `https://front.player.boatrace-cdn.jp/player/vod?service=boatcast&stadium=${pad(jcd)}${SLUG[jcd]}`
      + `&raceType=race&raceDate=${d}&raceNumber=${pad(r)}&autoplay=0&bitrate=low`;
    box.querySelector('#vm-title').textContent = `${VEN[jcd]} ${+d.slice(4, 6)}/${+d.slice(6, 8)} ${r}R のレース映像`;
    box.querySelector('#vm-frame').src = src;
    box.querySelector('#vm-link').href = `https://race.boatcast.jp/replay?jo=${pad(jcd)}`;
    box.classList.add('is-open');
    box.setAttribute('aria-hidden', 'false');
  }
  function close() {
    box.classList.remove('is-open');
    box.setAttribute('aria-hidden', 'true');
    box.querySelector('#vm-frame').src = 'about:blank';
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-video]');
    if (b) {
      e.preventDefault();
      const [j, d, r] = b.dataset.video.split('-');
      open(j, d, r);
      return;
    }
    if (e.target.closest('[data-vclose]')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && box.classList.contains('is-open')) { e.stopImmediatePropagation(); close(); }
  }, true);
  window.WAKE_VIDEO = open;
})();
