// Cloud backup & sync of the game, tied to the logged-in account.
import * as S from './state.js';
import * as Auth from './auth.js';

export const status = { state: 'idle', at: null, error: null };
const listeners = new Set();
export const onStatus = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const setStatus = (state, error = null) => { status.state = state; status.error = error; if (state === 'ok') status.at = Date.now(); listeners.forEach((f) => f(status)); };

async function rest(path, opts = {}) {
  const t = await Auth.token();
  if (!t) throw new Error('not signed in');
  const r = await fetch(`${Auth.API}/rest/v1/${path}`, { ...opts, headers: { 'Content-Type': 'application/json', apikey: Auth.KEY, Authorization: `Bearer ${t}`, ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
const getRemote = async () => (await rest('user_saves?select=data,client_updated'))[0] || null;
function payload() {
  const data = JSON.parse(JSON.stringify(S.get()));
  delete data.sync;
  return data;
}
const sync = () => { const s = S.get(); if (!s.sync) s.sync = { lastSynced: 0 }; return s.sync; };

let ready = false, timer = null, onReplaced = () => {};
function adopt(remote) {
  const owner = Auth.user() && Auth.user().id;
  S.replaceAll(remote.data);
  const s = S.get();
  s.ownerId = owner; s.sync = { lastSynced: remote.client_updated };
  S.saveQuiet();
}

// Right after logging in: load the account's progress, or move this device's progress into a new account.
export async function afterLogin() {
  const me = Auth.user();
  const remote = await getRemote();
  const s = S.get();
  if (remote && remote.data) {
    adopt(remote);
  } else if (s.ownerId && s.ownerId !== me.id) {
    S.resetAll();                                   // this device had someone else's game
    S.get().ownerId = me.id; S.saveQuiet();
  } else {
    s.ownerId = me.id; s.sync = { lastSynced: 0 }; S.saveQuiet();
  }
  ready = true;
  await push(true);
}
export async function pull() {
  if (!Auth.session()) return;
  setStatus('syncing');
  try {
    const remote = await getRemote();
    if (remote && remote.data && remote.client_updated > (sync().lastSynced || 0)) { adopt(remote); onReplaced(); }
    ready = true;
    await push();
  } catch (e) { setStatus('offline', String(e.message || e)); }
}
export async function push(force = false) {
  if (!ready || !Auth.session()) return;
  const s = S.get(), stamp = s.updatedAt;
  if (!force && stamp <= (sync().lastSynced || 0)) { setStatus('ok'); return; }
  setStatus('syncing');
  try {
    const r = await rest('rpc/put_my_save', { method: 'POST', body: JSON.stringify({ p_data: payload(), p_client_updated: stamp }) });
    if (r.ok) { sync().lastSynced = stamp; S.saveQuiet(); setStatus('ok'); }
    else if (r.newer) await pull();
  } catch (e) { setStatus('offline', String(e.message || e)); }
}
function schedule() { if (!ready) return; clearTimeout(timer); timer = setTimeout(push, 4000); }

let started = false;
export function init(replacedCallback) {
  onReplaced = replacedCallback || onReplaced;
  if (started) return; started = true;
  S.onChange(schedule);
  setInterval(() => { if (status.state === 'offline' || !ready) pull(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
  window.addEventListener('online', () => pull());
}
export function stop() { ready = false; clearTimeout(timer); setStatus('idle'); }
export const backupNow = () => push(true);

// ---------- photos for picture compositions (private storage, per account) ----------
const BUCKET = 'essay-images';
const imgCache = new Map();
// shrink a phone photo so it uploads quickly but stays readable
async function compress(file, max = 1600, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
  } finally { URL.revokeObjectURL(url); }
}
export async function uploadEssayImage(file) {
  const t = await Auth.token(), me = Auth.user();
  if (!t || !me) throw new Error('Please log in first');
  const blob = await compress(file);
  const path = `${me.id}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
  const r = await fetch(`${Auth.API}/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', headers: { apikey: Auth.KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'image/jpeg' }, body: blob });
  if (!r.ok) throw new Error(`Upload failed (${r.status})`);
  imgCache.set(path, URL.createObjectURL(blob));
  return path;
}
export async function essayImageURL(path) {
  if (imgCache.has(path)) return imgCache.get(path);
  const t = await Auth.token();
  const r = await fetch(`${Auth.API}/storage/v1/object/authenticated/${BUCKET}/${path}`, { headers: { apikey: Auth.KEY, Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new Error(`Could not load picture (${r.status})`);
  const u = URL.createObjectURL(await r.blob());
  imgCache.set(path, u);
  return u;
}
export async function deleteEssayImage(path) {
  const t = await Auth.token();
  await fetch(`${Auth.API}/storage/v1/object/${BUCKET}/${path}`, { method: 'DELETE', headers: { apikey: Auth.KEY, Authorization: `Bearer ${t}` } }).catch(() => {});
  imgCache.delete(path);
}
