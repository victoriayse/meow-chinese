// Cloud backup & sync of the game, tied to the logged-in account.
import * as S from './state.js';
import * as Auth from './auth.js';
import { mergeSaves, sameSave } from './merge.js';

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

// the last copy this device and the cloud agreed on (used to merge changes from both sides)
const ANC_KEY = 'meow-chinese-synced';
const loadAnc = () => { try { const t = localStorage.getItem(ANC_KEY); return t ? JSON.parse(t) : undefined; } catch { return undefined; } };
const saveAnc = (d) => { try { localStorage.setItem(ANC_KEY, JSON.stringify(d)); } catch {} };
export const clearAnc = () => { try { localStorage.removeItem(ANC_KEY); } catch {} };

let ready = false, timer = null, onReplaced = () => {}, running = null, again = false;
function useCopy(data) {
  // put a merged/cloud copy on this device without counting it as a new change
  const owner = Auth.user() && Auth.user().id;
  const keep = sync();
  S.replaceQuiet(data);
  const s = S.get();
  s.ownerId = owner; s.sync = keep;
  S.saveQuiet();
}
// write only if the cloud still has the copy we read (otherwise read again and merge)
async function write(data, expected) {
  const stamp = Math.max(Date.now(), (expected || 0) + 1);
  const r = await rest('rpc/put_my_save2', { method: 'POST', body: JSON.stringify({ p_data: data, p_client_updated: stamp, p_expected: expected }) });
  return r && r.ok ? stamp : null;
}

// Read the cloud copy, merge it with this device, and write back whatever is new. Safe to call any time.
async function syncNow() {
  if (!Auth.session()) return;
  setStatus('syncing');
  for (let tries = 0; tries < 4; tries++) {
    const remote = await getRemote();
    lastRemoteStamp = remote ? remote.client_updated : null;
    const local = payload();
    if (!remote || !remote.data) {
      const st = await write(local, null);
      if (st == null) continue;
      lastRemoteStamp = st;
      saveAnc(local); sync().lastSynced = local.updatedAt; S.saveQuiet(); setStatus('ok'); return;
    }
    const anc = loadAnc();
    // a device that was never set up just takes the account's copy
    const merged = (!anc && !local.onboarded) ? remote.data : mergeSaves(anc, local, remote.data);
    if (!sameSave(merged, local)) { useCopy(merged); onReplaced(); }
    if (!sameSave(merged, remote.data)) {
      const st = await write(payload(), remote.client_updated);
      if (st == null) continue;                    // someone else saved in between: read and merge again
      lastRemoteStamp = st;
    }
    saveAnc(payload()); sync().lastSynced = S.get().updatedAt; S.saveQuiet();
    setStatus('ok'); return;
  }
  setStatus('offline', 'busy — will try again');
}
function runSync() {
  if (running) { again = true; return running; }
  running = syncNow().catch((e) => setStatus('offline', String(e.message || e))).finally(() => {
    running = null;
    if (again) { again = false; runSync(); }
  });
  return running;
}

// Right after logging in: load the account's progress, or move this device's progress into a new account.
export async function afterLogin() {
  const me = Auth.user();
  const remote = await getRemote();
  const s = S.get();
  clearAnc();
  if (remote && remote.data) {
    useCopy(remote.data);
    saveAnc(payload());
  } else if (s.ownerId && s.ownerId !== me.id) {
    S.resetAll();                                   // this device had someone else's game
    S.get().ownerId = me.id; S.saveQuiet();
  } else {
    s.ownerId = me.id; s.sync = { lastSynced: 0 }; S.saveQuiet();
  }
  ready = true;
  await runSync();
}
export async function pull() { if (!Auth.session()) return; ready = true; await runSync(); }
export async function push() { if (!ready) return; await runSync(); }
function schedule() { if (!ready) return; clearTimeout(timer); timer = setTimeout(runSync, 800); }
// cheap check: has the cloud copy changed since we last synced? (only the timestamp is downloaded)
let lastRemoteStamp = null;
async function quickCheck() {
  if (!ready || !Auth.session() || document.hidden || running) return;
  try {
    const r = (await rest('user_saves?select=client_updated'))[0];
    const stamp = r ? r.client_updated : null;
    if (stamp !== lastRemoteStamp) runSync();
  } catch (e) { /* offline: the next check will try again */ }
}

let started = false;
export function init(replacedCallback) {
  onReplaced = replacedCallback || onReplaced;
  if (started) return; started = true;
  S.onChange(schedule);
  setInterval(quickCheck, 4000);   // pick up changes from her other devices within a few seconds
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
  window.addEventListener('online', () => pull());
}
export function stop() { ready = false; clearTimeout(timer); clearAnc(); setStatus('idle'); }
export const backupNow = () => runSync();

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
