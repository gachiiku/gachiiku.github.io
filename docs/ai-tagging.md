# 映像タグのAI判定 手順書

GACHIIKU（https://gachiiku.github.io/）の「攻め方指標」は、レース映像を見て付けた判定（タグ）から集計する。
この手順は、AI（Claude）が公式のレース映像プレーヤーを**ブラウザで見て**判定するためのもの。
映像のダウンロード・取り込み・保存はしない（BOATCAST の規約のため）。見るのは公式プレーヤーの画面だけ。

## 1回の流れ

1. `cd /Users/harutomatufuji/競艇web && git pull -q --rebase`
2. `python3 scripts/tag_queue.py 12` で判定待ちのレースを12件出す（新しい日から。判定済み・見送り済みは出ない）
3. 1件ずつ、下の「映像の見方」で見て判定する
4. 判定を JSON にまとめて（下の形）、スクラッチ用のフォルダに書き、`python3 scripts/tag_save.py そのファイル` で保存・公開する
   - 途中で止まっても失わないよう、**4〜6件ごとに保存**する
5. 最後に、判定した件数・見送った件数・気づいたこと（判定しにくい場の傾向など）を日本語で短く報告する

```json
{"tags": {"20261120-24-3": {"g": "差", "z": 1}},
 "skip": {"20261120-1-10": "ナイターで暗く見分けられない"}}
```

- `tags` には**確信が持てた項目だけ**入れる（確信が低い項目は入れない。1項目も入らなければ skip へ）
- `skip` には見たけれど判定できなかったレースと理由（次から出なくなる）

## 判定する項目（tag_queue の ask に入っているものだけ）

勝負服（ジャケット）の色: **1号艇=白 2=黒 3=赤 4=青 5=黄 6=緑**。ヘルメットの色は選手ごとなので使わない。
`courses` は1〜6コースに入った艇番（例 [1,2,4,3,5,6] なら3コースは4号艇＝青）。必ずコースと色を対応させてから見る。

### g：2コース握り（ask に g があるときだけ。1・2コースのST差0.03秒以内＝スリット互角）
- **握** … 2コースの艇が1マークで、1コースの艇の**外側**を握って回った（1コースと並ぶ／前に出て外から回る）
- **差** … 2コースの艇が1コースの艇の**内側・後ろ**に入って回った（ターンマークのそば）
- **他** … どちらでもない（大きく遅れた、転覆、接触で回れない など）
- スタートで1コースが遅れ、2コースがスリットで捲り切ったものは「2コース捲り」。ST差の条件でもともと出ないが、映像でそう見えたら g は付けない

### k：3カド（いつでも）
- **1** … **3コースに入った選手**（号艇は関係ない）が、スタート前に1・2コースより後ろへ引き、4〜6コースと同じダッシュ位置から出た
- **0** … 1〜3コースが横並びのスロー（1〜3が前、4〜6が後ろ）
- スタート前（スリットの5〜10秒前）の場面で、80m・100m・130m などの距離の線に対して艇の前後がはっきり見えるときだけ付ける。見えなければ付けない

### z：変わり全速（ask に z があるときだけ。4コースのSTが3コースより0.05秒以上早い）
- まず **4コースの艇がまくりに行ったか**を見る。4コースが差しに回った、まくりに行かなかったときは z を付けない
- **1** … 3コースの艇が内に差さず、外を全速で回った（4コースの外／1コースの外を回る）
- **0** … 3コースの艇が内に差した（4コースの内側に入った）
- 3コースの艇がスタートで大きく遅れて勝負の場面にいないときは付けない

## 映像の見方（内蔵ブラウザ）

1. tag_queue の `url` を開く（`mcp__Claude_Browser__navigate`）。自動再生はしない
2. 下の JavaScript を `mcp__Claude_Browser__javascript_tool` で実行して `sheet` を用意する。動画のコマを並べた画像を画面に重ねて描くだけで、映像は保存しない
3. まず `await sheet([104, 108, 112, 116, 120, 124]);` → スクリーンショットの上部（`zoom` で 0,0〜800,300）でスタート（「START」の線）と1マークの時刻をつかむ
4. 1マーク付近を `await sheet([t, t+1.5], 1);` で大きく2コマ出してスクリーンショット。必要なら少しずらしてもう2コマ
5. 3カドを見るときは、スタート前の距離の線が映る時刻（例 `[t-8, t-5]`）を `sheet(..., 1)` で見る

```js
window.sheet = async (times, cols = 3) => { const v = document.querySelector('video'); for (let i = 0; i < 60 && !(v && v.duration > 0); i++) { await new Promise(r => setTimeout(r, 250)); } v.muted = true; v.pause(); const W = 420, H = Math.round(W * v.videoHeight / v.videoWidth) || 236, rows = Math.ceil(times.length / cols); let c = document.getElementById('cs'); if (!c) { c = document.createElement('canvas'); c.id = 'cs'; c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#000;width:100vw;height:auto'; document.body.appendChild(c); } c.width = W * cols; c.height = H * rows; const g = c.getContext('2d'); for (let i = 0; i < times.length; i++) { v.currentTime = times[i]; await new Promise(r => { v.addEventListener('seeked', r, { once: true }); setTimeout(r, 4000); }); await new Promise(r => setTimeout(r, 350)); g.drawImage(v, (i % cols) * W, Math.floor(i / cols) * H, W, H); g.fillStyle = '#ff0'; g.font = 'bold 22px sans-serif'; g.fillText(times[i] + 's', (i % cols) * W + 6, Math.floor(i / cols) * H + 24); } return v.duration; }; await new Promise(r=>setTimeout(r,800)); 'ok';
```

### 時刻の目安（動画の先頭からの秒。場や日で数秒ずれる）
- スタート（スリット）はおおむね 110〜116秒、1マークはその 3〜6秒後
- 徳山はやや遅い（1マーク 120〜124秒）、芦屋・戸田・宮島はやや早い（1マーク 114〜117秒）

### 判定しにくい場合
- 桐生のナイター・夕方は暗く、艇が小さいので見送ることが多い
- 福岡はカメラが遠く、内側3艇が重なると見分けにくい
- 逆光（江戸川の夕方など）は色が分かりにくい
- 迷ったら付けない。数より正確さを優先する

## 精度の目安（2026-11-22 の確認）
2コースが勝ったレース20件で答え合わせ: 判定できた18件中17件正解、2件は判定できず。
負けたレースや3カド・変わり全速は答え合わせができないので、確信が持てるものだけ付ける。
