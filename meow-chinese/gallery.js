// 🖼️ The phone's Gallery: every photo taken in the game (e.g. a Ferris-wheel souvenir) is kept here.
// 100 photos at most, each squeezed to a JPEG of 50 KB or less. The pictures live online in her own folder of the
// private "gallery" store — only she, her friends and her parents can open them — so a photo can be sent to a
// friend in a message (the message just carries the photo's name).
import * as S from './state.js';
import * as Auth from './auth.js';

export const GALLERY_MAX = 100, PHOTO_KB = 50;
const objUrl = (path) => `${Auth.API}/storage/v1/object/gallery/${path}`;
export const photos = () => (S.get().gallery ||= []);
export const galleryFull = () => photos().length >= GALLERY_MAX;

// a canvas → a JPEG blob of at most 50 KB (lower quality first, then smaller)
export async function squeeze(canvas, maxBytes = PHOTO_KB * 1024) {
  let src = canvas;
  for (let shrink = 0; shrink < 6; shrink++) {
    for (const q of [0.85, 0.75, 0.65, 0.55, 0.45, 0.35]) {
      const b = await new Promise((ok) => src.toBlob(ok, 'image/jpeg', q));
      if (b && b.size <= maxBytes) return b;
    }
    const c = document.createElement('canvas'); c.width = Math.max(64, Math.round(src.width * 0.8)); c.height = Math.max(48, Math.round(src.height * 0.8));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); src = c;
  }
  throw new Error('too big');
}

// save a photo (a canvas) into her gallery; returns the saved entry
export async function savePhoto(canvas, title = '') {
  if (galleryFull()) throw new Error('full');
  const u = Auth.user(); if (!u) throw new Error('signed out');
  const blob = await squeeze(canvas);
  const path = `${u.id}/${crypto.randomUUID()}.jpg`;
  const t = await Auth.token();
  const r = await fetch(objUrl(path), { method: 'POST', headers: { apikey: Auth.KEY, Authorization: `Bearer ${t}`, 'content-type': 'image/jpeg' }, body: blob });
  if (!r.ok) { const txt = await r.text().catch(() => ''); throw new Error(/row-level|policy/i.test(txt) ? 'full' : `upload ${r.status}`); }
  const entry = { path, at: Date.now(), title: String(title).slice(0, 60) };
  photos().unshift(entry); S.get().gallery = photos().slice(0, GALLERY_MAX); S.save();
  cache.set(path, URL.createObjectURL(blob));
  return entry;
}

export async function deletePhoto(path) {
  S.get().gallery = photos().filter((p) => p.path !== path); S.save();
  const t = await Auth.token().catch(() => null);
  if (t) fetch(objUrl(path), { method: 'DELETE', headers: { apikey: Auth.KEY, Authorization: `Bearer ${t}` } }).catch(() => {});
}

// the picture itself (private store: fetched with her sign-in, then shown from memory)
const cache = new Map();
export async function photoSrc(path) {
  if (cache.has(path)) return cache.get(path);
  const t = await Auth.token();
  const r = await fetch(objUrl(path), { headers: { apikey: Auth.KEY, Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new Error(`photo ${r.status}`);
  const url = URL.createObjectURL(await r.blob());
  cache.set(path, url); return url;
}
// fill an <img> with a stored photo (a grey "📷" until it arrives; "gone" if it was deleted)
export function fillImg(img, path) {
  img.alt = '📷'; img.classList.add('loading');
  photoSrc(path).then((u) => { img.src = u; img.classList.remove('loading'); }).catch(() => { img.classList.remove('loading'); img.classList.add('gone'); img.alt = '照片不见了 · Photo removed'; });
  return img;
}
