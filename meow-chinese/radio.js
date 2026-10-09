// The radio at home plays one song she chose (an mp3 from her device).
// The song is uploaded to her account (private storage: only she and her friends can play it),
// so it plays on all her devices, and friends visiting her house hear it too.
// Each device keeps a copy (IndexedDB) so it isn't downloaded every time.
// While the radio plays, the game's own music is muted.
import { hushMusic } from './audio.js';
import * as Auth from './auth.js';
import * as S from './state.js';

const DB = 'meow-radio', STORE = 'song';
const MAX_BYTES = 10 * 1024 * 1024;   // 10 MB at most
let audio = null, loaded = null, playing = false, startedAt = 0;
const listeners = new Set();
export const onRadio = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const tell = () => listeners.forEach((fn) => { try { fn(playing); } catch (e) { console.warn(e); } });

// ---------- this device's copies ----------
function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function idb(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode), st = tx.objectStore(STORE), req = fn(st);
    tx.oncomplete = () => resolve(req && req.result); tx.onerror = () => reject(tx.error);
  });
}
const cacheGet = (key) => idb('readonly', (st) => st.get(key)).catch(() => null);
async function cachePut(key, blob) {
  try {
    const keys = (await idb('readonly', (st) => st.getAllKeys())) || [];
    // keep only a few songs (mine and the friends' houses she visits)
    for (const k of keys.filter((k) => k !== key && k !== 'current').slice(0, Math.max(0, keys.length - 3))) await idb('readwrite', (st) => st.delete(k));
    await idb('readwrite', (st) => st.put(blob, key));
  } catch (e) { console.warn('radio cache', e); }
}

// ---------- the song in her account ----------
const objUrl = (path) => `${Auth.API}/storage/v1/object/radio/${path.split('/').map(encodeURIComponent).join('/')}`;
async function headers(extra = {}) { const t = await Auth.token(); if (!t) throw new Error('signed out'); return { apikey: Auth.KEY, Authorization: `Bearer ${t}`, ...extra }; }
// { path, name } of my radio song (saved with the rest of the game, so all her devices know it)
export const mySong = () => S.get().radioSong || null;
async function download(path) {
  const cached = await cacheGet(path); if (cached) return cached;
  const r = await fetch(`${Auth.API}/storage/v1/object/authenticated/radio/${path.split('/').map(encodeURIComponent).join('/')}`, { headers: await headers() });
  if (!r.ok) throw new Error(`download ${r.status}`);
  const blob = await r.blob();
  await cachePut(path, blob);
  return blob;
}
export async function setSong(file) {
  if (!file) throw new Error('no file');
  if (file.size > MAX_BYTES) throw new Error('too big');
  if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|aac|wav|ogg)$/i.test(file.name)) throw new Error('not audio');
  const me = Auth.user(); if (!me) throw new Error('signed out');
  stop();
  const ext = ((file.name.match(/\.([a-z0-9]{2,4})$/i) || [])[1] || 'mp3').toLowerCase();
  const type = file.type || (ext === 'mp3' ? 'audio/mpeg' : `audio/${ext}`);
  const path = `${me.id}/song-${Date.now()}.${ext}`;
  const r = await fetch(objUrl(path), { method: 'POST', headers: await headers({ 'content-type': type, 'x-upsert': 'true' }), body: file });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(/too large|exceeded/i.test(t) ? 'too big' : `upload ${r.status}`); }
  const old = mySong();
  S.get().radioSong = { path, name: file.name.replace(/\.[^.]+$/, '').slice(0, 60) }; S.save();
  await cachePut(path, file);
  if (old && old.path && old.path !== path) fetch(objUrl(old.path), { method: 'DELETE', headers: await headers() }).catch(() => {});
  loaded = null;
}
export async function removeSong() {
  stop();
  const old = mySong();
  S.get().radioSong = null; S.save();
  if (old && old.path) fetch(objUrl(old.path), { method: 'DELETE', headers: await headers() }).catch(() => {});
  loaded = null;
}
// a song added on this device before songs were saved online: upload it now
export async function moveOldSong() {
  if (mySong() || !Auth.user()) return;
  const old = await cacheGet('current');
  if (old && old.blob) { try { await setSong(new File([old.blob], `${old.name || 'song'}.mp3`, { type: old.blob.type || 'audio/mpeg' })); await idb('readwrite', (st) => st.delete('current')); } catch (e) { console.warn('radio move', e); } }
}

// ---------- playing ----------
// browsers only let sound start from a tap: the first tap anywhere "unlocks" the radio's player
function player() { if (!audio) { audio = new Audio(); audio.loop = true; audio.addEventListener('pause', () => { if (playing) { playing = false; hushMusic(false); tell(); } }); } return audio; }
window.addEventListener('pointerdown', function unlock() {
  window.removeEventListener('pointerdown', unlock, true);
  const a = player(); if (a.src) return;
  a.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  a.play().then(() => a.pause()).catch(() => {});
}, true);
async function load(path) {
  if (loaded === path) return true;
  const blob = await download(path);
  const a = player();
  if (a.src && a.src.startsWith('blob:')) URL.revokeObjectURL(a.src);
  a.src = URL.createObjectURL(blob); loaded = path;
  return true;
}
// start the song (from `at` seconds in, so friends hear the same part)
async function start(path, at = 0) {
  try { await load(path); } catch (e) { console.warn('radio load', e); return false; }
  const a = player();
  try { if (at > 0 && Number.isFinite(a.duration) && a.duration > 0) a.currentTime = at % a.duration; } catch {}
  try { await a.play(); } catch (e) { console.warn('radio play', e); return false; }
  if (at > 0 && !(Number.isFinite(a.duration) && a.duration > 0)) a.addEventListener('loadedmetadata', () => { try { a.currentTime = at % a.duration; } catch {} }, { once: true });
  playing = true; startedAt = Date.now() - (at || 0) * 1000; hushMusic(true); tell();
  return true;
}
export const isPlaying = () => playing;
// what friends in my house need to hear it too
export const status = () => { const s = mySong(); return playing && s && loaded === s.path ? { on: true, path: s.path, name: s.name, startedAt } : { on: false }; };
export async function play() { await moveOldSong(); const s = mySong(); if (!s) return false; return start(s.path); }
export function stop() {
  if (!playing && !(audio && !audio.paused)) return;
  playing = false;
  if (audio) audio.pause();
  hushMusic(false); tell();
}
export async function toggle() { if (playing) { stop(); return false; } return play(); }
// a friend's radio, while I'm visiting their house
export async function listen(r) {
  if (!r || !r.on || !r.path) { stop(); return; }
  if (playing && loaded === r.path) return;
  await start(r.path, Math.max(0, (Date.now() - (r.startedAt || Date.now())) / 1000));
}
