/* =========================================================
   GACHIIKU — 広告（Google アドセンス）
   アドセンスの審査に通ったら、下の CLIENT と SLOTS に、アドセンスの画面に出る番号を入れる。
     CLIENT … 「ca-pub-」で始まる番号（サイト運営者ID）
     SLOTS  … 広告ユニットを作ると出る「data-ad-slot」の数字（枠ごと）
   CLIENT が空のあいだは、広告枠は画面に出ない（空の枠は見せない）。
   あわせて、サイトの一番上に ads.txt を置く（中身はアドセンスの画面に出る1行）。
   ========================================================= */
(() => {
  const CLIENT = '';           // 例：'ca-pub-1234567890123456'
  const SLOTS = {
    top: '',                   // トップページ：開催場と場傾向の間
    race: '',                  // レースページ：出走表と水面の状況の間
  };
  if (!CLIENT) return;

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;
  s.crossOrigin = 'anonymous';
  document.head.appendChild(s);

  document.documentElement.classList.add('ads-on');
  document.querySelectorAll('.ad-slot[data-ad]').forEach((el) => {
    const slot = SLOTS[el.dataset.ad];
    if (!slot) { el.remove(); return; }
    el.innerHTML = `<ins class="adsbygoogle" style="display:block" data-ad-client="${CLIENT}" data-ad-slot="${slot}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  });
})();
