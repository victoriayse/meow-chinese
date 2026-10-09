// The radio at home plays one song she chose (an mp3 from her device).
// The song is kept on this device only (in the browser's IndexedDB) — it's too big to sync.
// While the radio plays, the game's own music is muted.
import { hushMusic } from './audio.js';

const DB = 'meow-radio', STORE = 'song', KEY = 'current';
const MAX_BYTES = 25 * 1024 * 1024;
let audio = null, url = null, playing = false;
const listeners = new Set();
export const onRadio = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const tell = () => listeners.forEach((fn) => { try { fn(playing); } catch (e) { console.warn(e); } });

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
// { name, size, blob } or null
export async function getSong() { try { return (await idb('readonly', (st) => st.get(KEY))) || null; } catch { return null; } }
export async function setSong(file) {
  if (!file) throw new Error('no file');
  if (file.size > MAX_BYTES) throw new Error('too big');
  if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|aac|wav|ogg)$/i.test(file.name)) throw new Error('not audio');
  const wasPlaying = playing; stop();
  await idb('readwrite', (st) => st.put({ name: file.name.replace(/\.[^.]+$/, ''), size: file.size, blob: file }, KEY));
  if (url) { URL.revokeObjectURL(url); url = null; }
  if (audio) { audio.src = ''; audio = null; }
  if (wasPlaying) await play();
}
export async function removeSong() { stop(); await idb('readwrite', (st) => st.delete(KEY)); if (url) { URL.revokeObjectURL(url); url = null; } audio = null; }

export const isPlaying = () => playing;
export async function play() {
  if (!audio) {
    const s = await getSong(); if (!s) return false;
    url = URL.createObjectURL(s.blob);
    audio = new Audio(url); audio.loop = true;
    audio.addEventListener('pause', () => { if (playing) { playing = false; hushMusic(false); tell(); } });
  }
  try { await audio.play(); } catch (e) { console.warn('radio', e); return false; }
  playing = true; hushMusic(true); tell();
  return true;
}
export function stop() {
  if (!playing && !(audio && !audio.paused)) return;
  playing = false;
  if (audio) audio.pause();
  hushMusic(false); tell();
}
export async function toggle() { if (playing) { stop(); return false; } return play(); }
