/**
 * WAKE モーター評価の受け付け（Cloudflare Workers）
 *
 * 入力ページ（admin.html）から合言葉つきで送られた評価を受け取り、
 * GitHub の data/motor_eval.json に書き込む。書き込むとサイトが自動で公開し直される。
 *
 * Worker の「設定 → 変数とシークレット」に次の2つを「シークレット」で登録する:
 *   GITHUB_TOKEN … wake リポジトリの Contents を Read and write にした Fine-grained token
 *   PASSCODE     … 入力する人に伝える合言葉
 */
const REPO = 'harutos7428-alt/wake';
const PATH = 'data/motor_eval.json';
const API = `https://api.github.com/repos/${REPO}/contents/${PATH}`;
const ORIGIN = 'https://harutos7428-alt.github.io';

const cors = (req) => {
  const o = req.headers.get('Origin') || '';
  const ok = o === ORIGIN || o.startsWith('http://localhost');
  return {
    'Access-Control-Allow-Origin': ok ? o : ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
};
const json = (req, obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(req) } });

// UTF-8 ⇔ base64
const b64enc = (str) => {
  const bytes = new TextEncoder().encode(str);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const b64dec = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

async function gh(env, method, body) {
  return fetch(method === 'GET' ? `${API}?ref=main` : API, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'wake-motor-eval',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const passOk = (env, p) => !!env.PASSCODE && String(p || '') === env.PASSCODE;

function jstNow() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

async function save(env, changes) {
  // 同時に保存されて衝突したら、読み直して数回やり直す
  for (let i = 0; i < 3; i++) {
    const cur = await gh(env, 'GET');
    let data = { motors: {} }, sha;
    if (cur.status === 200) {
      const j = await cur.json();
      data = JSON.parse(b64dec(j.content));
      sha = j.sha;
    } else if (cur.status !== 404) {
      throw new Error(`GitHubから読めませんでした（${cur.status}）`);
    }
    const motors = data.motors || {};
    const at = jstNow();
    const n = (x) => (+x >= 1 && +x <= 5 ? +x : 0);
    let count = 0;
    for (const [key, c] of Object.entries(changes || {})) {
      if (!/^\d{1,2}-\d{1,3}$/.test(key)) continue;
      const clean = { nobi: n(c.nobi), iki: n(c.iki), de: n(c.de), memo: String(c.memo || '').slice(0, 60), at };
      if (!clean.nobi && !clean.iki && !clean.de && !clean.memo) delete motors[key];
      else motors[key] = clean;
      count++;
    }
    const text = JSON.stringify({ updatedAt: at, motors }, null, 1) + '\n';
    const res = await gh(env, 'PUT', { message: `モーター評価を更新（${count}件）`, content: b64enc(text), sha, branch: 'main' });
    if (res.status === 200 || res.status === 201) return { at, motors };
    if (res.status !== 409 && res.status !== 422) throw new Error(`GitHubに保存できませんでした（${res.status}）`);
  }
  throw new Error('保存が混み合っています。少し待ってもう一度保存してください');
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
    const url = new URL(req.url);
    if (req.method === 'GET') return json(req, { ok: passOk(env, url.searchParams.get('pass')) });
    if (req.method !== 'POST') return json(req, { ok: false, error: '使えない操作です' }, 405);
    let body;
    try { body = await req.json(); } catch (e) { return json(req, { ok: false, error: '送られた内容が読めませんでした' }, 400); }
    if (!passOk(env, body.pass)) return json(req, { ok: false, error: '合言葉が違います' }, 403);
    try {
      const r = await save(env, body.changes);
      return json(req, { ok: true, ...r });
    } catch (e) {
      return json(req, { ok: false, error: e.message }, 500);
    }
  },
};
