// Simple email + password login (Supabase Auth). The session is remembered on this
// device so she stays logged in; tokens refresh quietly in the background.
export const API = 'https://xwtqvzmxixuqbehgkaob.supabase.co';
export const KEY = 'sb_publishable_dWfYo39ROla6C1_y1cZ4qw_LZGA1N0_';
const SKEY = 'meow-chinese-session';

export function session() {
  try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch { return null; }
}
export const user = () => (session() || {}).user || null;
function store(r) {
  const s = { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Date.now() + (r.expires_in || 3600) * 1000, user: { id: r.user.id, email: r.user.email } };
  try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch {}
  return s;
}

const FRIENDLY = [
  [/invalid login credentials/i, '邮箱或密码不对 · Wrong email or password'],
  [/already (been )?registered|already exists/i, '这个邮箱已经注册了，请登录 · This email already has an account — please log in'],
  [/password should be at least|weak password/i, '密码至少要6个字 · Password needs at least 6 characters'],
  [/unable to validate email|invalid email|email address .* invalid/i, '邮箱格式不对 · That email address looks wrong'],
  [/rate limit|too many/i, '试太多次了，请等一下 · Too many tries — wait a minute'],
  [/failed to fetch|network/i, '连不上网络 · No internet connection'],
];
const friendly = (msg) => (FRIENDLY.find(([re]) => re.test(msg)) || [null, msg])[1];

async function call(path, body) {
  let r;
  try {
    r = await fetch(`${API}/auth/v1/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY }, body: JSON.stringify(body) });
  } catch (e) { throw new Error(friendly('failed to fetch')); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(friendly(j.msg || j.error_description || j.message || j.error || `Error ${r.status}`)), { status: r.status });
  return j;
}

export async function signUp(email, password) {
  const r = await call('signup', { email: email.trim(), password });
  if (r.access_token) return store(r);
  return signIn(email, password);   // just in case the project asks to sign in separately
}
export async function signIn(email, password) {
  return store(await call('token?grant_type=password', { email: email.trim(), password }));
}
let refreshing = null;
// a valid access token, refreshed if needed (null when logged out)
export async function token() {
  const s = session();
  if (!s) return null;
  if (Date.now() < s.expires_at - 60000) return s.access_token;
  if (!refreshing) {
    refreshing = call('token?grant_type=refresh_token', { refresh_token: s.refresh_token })
      .then(store)
      .catch((e) => { if (e.status === 400 || e.status === 401) signOutLocal(); throw e; })
      .finally(() => { refreshing = null; });
  }
  return (await refreshing).access_token;
}
function signOutLocal() { try { localStorage.removeItem(SKEY); } catch {} }
export async function signOut() {
  const s = session();
  signOutLocal();
  if (s) fetch(`${API}/auth/v1/logout`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${s.access_token}` } }).catch(() => {});
}
