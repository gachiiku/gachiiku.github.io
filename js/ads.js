/* =========================================================
   GACHIIKU — 広告（Google アドセンス）
   アドセンスの審査に通ったら、下の CLIENT と SLOTS に、アドセンスの画面に出る番号を入れる。
     CLIENT … 「ca-pub-」で始まる番号（サイト運営者ID）
     SLOTS  … 広告ユニットを作ると出る「data-ad-slot」の数字（枠ごと）
   CLIENT が空のあいだは、広告枠は画面に出ない（空の枠は見せない）。
   あわせて、サイトの一番上に ads.txt を置く（中身はアドセンスの画面に出る1行）。
   ========================================================= */
(() => {
  const CLIENT = 'ca-pub-4046510253561094'; // サイト運営者ID（アドセンスのコードは各ページの<head>に直接入れてある）
  const SLOTS = {
    top: '',                   // トップページ：開催場と場傾向の間
    race: '',                  // レースページ：出走表と水面の状況の間
  };
  if (!CLIENT) return;

  if (!document.querySelector('script[src*="adsbygoogle.js"]')) {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
  }
  // 広告ユニットの番号（SLOTS）が入るまでは、枠は出さない
  if (!Object.values(SLOTS).some(Boolean)) { document.querySelectorAll('.ad-slot').forEach((el) => el.remove()); return; }

  document.documentElement.classList.add('ads-on');
  document.querySelectorAll('.ad-slot[data-ad]').forEach((el) => {
    const slot = SLOTS[el.dataset.ad];
    if (!slot) { el.remove(); return; }
    el.innerHTML = `<ins class="adsbygoogle" style="display:block" data-ad-client="${CLIENT}" data-ad-slot="${slot}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  });
})();
