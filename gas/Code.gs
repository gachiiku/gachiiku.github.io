/**
 * WAKE モーター評価の受け付け（Google Apps Script）
 *
 * 入力ページ（admin.html）から合言葉つきで送られた評価を受け取り、
 * GitHub の data/motor_eval.json に書き込む。書き込むとサイトが自動で公開し直される。
 *
 * スクリプト プロパティ（プロジェクトの設定 → スクリプト プロパティ）に次の2つを入れる:
 *   GITHUB_TOKEN … wake リポジトリの Contents を Read and write にした Fine-grained token
 *   PASSCODE     … 入力する人に伝える合言葉
 */
const REPO = 'harutos7428-alt/wake';
const PATH = 'data/motor_eval.json';
const API = 'https://api.github.com/repos/' + REPO + '/contents/' + PATH;

function prop_(k) {
  return PropertiesService.getScriptProperties().getProperty(k) || '';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function gh_(method, payload) {
  const opt = {
    method: method,
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + prop_('GITHUB_TOKEN'), Accept: 'application/vnd.github+json' },
  };
  if (payload) {
    opt.contentType = 'application/json';
    opt.payload = JSON.stringify(payload);
  }
  return UrlFetchApp.fetch(method === 'get' ? API + '?ref=main' : API, opt);
}

function readFile_() {
  const res = gh_('get');
  if (res.getResponseCode() === 404) return { data: { motors: {} }, sha: null };
  if (res.getResponseCode() !== 200) throw new Error('GitHubから読めませんでした（' + res.getResponseCode() + '）');
  const j = JSON.parse(res.getContentText());
  const text = Utilities.newBlob(Utilities.base64Decode(j.content.replace(/\n/g, ''))).getDataAsString('UTF-8');
  return { data: JSON.parse(text), sha: j.sha };
}

function checkPass_(p) {
  const want = prop_('PASSCODE');
  return want && String(p || '') === want;
}

// 合言葉の確認（入力ページを開いたとき）
function doGet(e) {
  const p = e && e.parameter ? e.parameter.pass : '';
  return json_({ ok: checkPass_(p) });
}

// 評価の保存
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: '送られた内容が読めませんでした' });
  }
  if (!checkPass_(body.pass)) return json_({ ok: false, error: '合言葉が違います' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000); // 同時に保存されても順番に処理する
  try {
    const cur = readFile_();
    const motors = cur.data.motors || {};
    const at = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    const n = function (x) { x = Number(x); return x >= 1 && x <= 5 ? x : 0; };
    let count = 0;
    Object.keys(body.changes || {}).forEach(function (key) {
      if (!/^\d{1,2}-\d{1,3}$/.test(key)) return;
      const c = body.changes[key] || {};
      const clean = { nobi: n(c.nobi), iki: n(c.iki), de: n(c.de), memo: String(c.memo || '').slice(0, 60), at: at };
      if (!clean.nobi && !clean.iki && !clean.de && !clean.memo) delete motors[key];
      else motors[key] = clean;
      count++;
    });
    const text = JSON.stringify({ updatedAt: at, motors: motors }, null, 1) + '\n';
    const res = gh_('put', {
      message: 'モーター評価を更新（' + count + '件）',
      content: Utilities.base64Encode(text, Utilities.Charset.UTF_8),
      sha: cur.sha || undefined,
      branch: 'main',
    });
    if (res.getResponseCode() >= 300) return json_({ ok: false, error: 'GitHubに保存できませんでした（' + res.getResponseCode() + '）' });
    return json_({ ok: true, at: at, motors: motors });
  } finally {
    lock.releaseLock();
  }
}
