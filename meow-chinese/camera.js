// 📷 The phone's Camera: a viewfinder over the screen she is on (her room, a place, the kitten's corner),
// a big shutter button, and the photo goes into the phone's 🖼️ Gallery. Camera photos clear themselves after
// 10 days (souvenir photos from the Ferris wheel are kept). From the photo she can send it to a friend's chat.
// The game is drawn on <canvas> elements, so a photo is made by drawing those canvases onto one picture,
// in the same place, size, order and facing as on screen.
import * as S from './state.js';
import * as Auth from './auth.js';
import * as Gallery from './gallery.js';
import { html, $, toast } from './ui.js';
import { sfx } from './audio.js';

export const PHOTO_DAYS = 10;
// what the camera looks at: the room (home or a place), or the kitten's corner on the home screen
function target() {
  const cands = ['#room', '.stage', '#app'];
  for (const sel of cands) {
    const el = document.querySelector(sel);
    if (el && el.offsetParent !== null) { const r = el.getBoundingClientRect(); if (r.width > 60 && r.height > 60) return el; }
  }
  return document.body;
}
// does anything between this canvas and the frame flip it sideways (transform: scaleX(-1))?
function flipped(el, stop) {
  let f = false;
  for (let e = el; e && e !== stop.parentElement; e = e.parentElement) {
    const t = getComputedStyle(e).transform;
    const m = /^matrix\(([^,]+)/.exec(t || ''); if (m && parseFloat(m[1]) < 0) f = !f;
    const sc = getComputedStyle(e).scale; if (sc && sc !== 'none' && parseFloat(sc) < 0) f = !f;
  }
  return f;
}
// how high it stacks: the z-index of its outermost positioned ancestor inside the frame
function layerOf(el, stop) {
  let z = 0;
  for (let e = el; e && e !== stop; e = e.parentElement) { const v = parseInt(getComputedStyle(e).zIndex, 10); if (Number.isFinite(v)) z = v; }
  return z;
}
const hiddenIn = (el, stop) => { for (let e = el; e && e !== stop; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return true; } return false; };

// draw what is inside `frame` (a screen rectangle) into a canvas
export function snap(root, frame) {
  const k = Math.min(2, 900 / frame.width);
  const c = document.createElement('canvas'); c.width = Math.round(frame.width * k); c.height = Math.round(frame.height * k);
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  x.fillStyle = getComputedStyle(document.body).backgroundColor || '#9fd6f7'; x.fillRect(0, 0, c.width, c.height);
  const list = [...root.querySelectorAll('canvas')].map((cv, i) => ({ cv, i, z: layerOf(cv, root) }))
    .filter(({ cv }) => cv.width && cv.height && !hiddenIn(cv, root) && !cv.closest('.cam-ui'));
  list.sort((a, b) => a.z - b.z || a.i - b.i);
  list.forEach(({ cv }) => {
    const r = cv.getBoundingClientRect(); if (!r.width || !r.height) return;
    if (r.right < frame.left || r.left > frame.right || r.bottom < frame.top || r.top > frame.bottom) return;
    const dx = (r.left - frame.left) * k, dy = (r.top - frame.top) * k, w = r.width * k, h = r.height * k;
    x.save(); x.globalAlpha = +getComputedStyle(cv).opacity || 1;
    if (flipped(cv, root)) { x.translate(dx + w, dy); x.scale(-1, 1); x.drawImage(cv, 0, 0, w, h); }
    else x.drawImage(cv, dx, dy, w, h);
    x.restore();
  });
  // a little date stamp in the corner, like a real camera
  const d = new Date(), stamp = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  x.font = `700 ${Math.round(12 * k)}px ui-monospace, monospace`; x.textAlign = 'right'; x.textBaseline = 'bottom';
  x.fillStyle = 'rgba(0,0,0,.45)'; x.fillText(stamp, c.width - 7 * k, c.height - 5 * k);
  x.fillStyle = '#ffb347'; x.fillText(stamp, c.width - 8 * k, c.height - 6 * k);
  return c;
}

// camera photos older than 10 days are cleared from the gallery (and from the online store)
export function purgeOld() {
  const old = Gallery.photos().filter((p) => p.cam && Date.now() - p.at > PHOTO_DAYS * 864e5);
  old.forEach((p) => Gallery.deletePhoto(p.path));
  return old.length;
}

// the viewfinder: brackets round what the camera sees, a shutter button, and ✕ to put the camera away
export function openCamera({ onSaved, onSend } = {}) {
  if (!Auth.user()) { toast('📷 <span class="zh">要先登录才能拍照</span> Please log in to take photos'); return; }
  const root = target(), R = () => root.getBoundingClientRect();
  const ui = html`<div class="cam-ui" role="dialog" aria-label="Camera">
      <div class="cam-frame"><i class="cb tl"></i><i class="cb tr"></i><i class="cb bl"></i><i class="cb br"></i><span class="cam-rec">● 📷 <span class="zh">相机</span> Camera</span></div>
      <div class="cam-bar"><button type="button" class="cam-x" aria-label="Close camera">✕</button>
        <button type="button" class="cam-shutter" aria-label="Take photo"><i></i></button>
        <span class="cam-count"></span></div>
      <div class="cam-flash"></div>
    </div>`;
  const frame = $('.cam-frame', ui);
  const place = () => { const r = R(); Object.assign(frame.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` }); };
  const count = () => { $('.cam-count', ui).innerHTML = `🖼️ ${Gallery.photos().length}/${Gallery.GALLERY_MAX}`; };
  place(); count();
  const onResize = () => { if (!ui.isConnected) return window.removeEventListener('resize', onResize); place(); };
  window.addEventListener('resize', onResize);
  const close = () => { ui.remove(); window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onKey);
  $('.cam-x', ui).onclick = () => { sfx.click(); close(); };
  let busy = false;
  $('.cam-shutter', ui).onclick = async () => {
    if (busy) return;
    if (Gallery.galleryFull()) { sfx.miss(); return toast(`🖼️ <span class="zh">相册满了（${Gallery.GALLERY_MAX}张）</span> Your gallery is full — delete some photos first`, { ms: 3000 }); }
    busy = true; sfx.click();
    const r = R(), shot = snap(root, r);
    const fl = $('.cam-flash', ui); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
    try {
      const rn = document.querySelector('.room-name'), rc = rn && rn.cloneNode(true); if (rc) rc.querySelectorAll('button').forEach((b) => b.remove());
      const where = rc ? rc.textContent : '';
      const entry = await Gallery.savePhoto(shot, `📷 ${where.trim().slice(0, 40) || S.get().kitten.name || ''}`);
      entry.cam = true; S.save();
      count(); review(shot, entry);
      onSaved && onSaved(entry);
    } catch (e) { sfx.miss(); toast(e.message === 'full' ? `🖼️ 相册满了 · Your gallery is full — delete some photos first` : '📷 没拍好，再试一次 · Could not save the photo — try again', { ms: 2600 }); }
    finally { busy = false; }
  };
  // the photo she just took: keep shooting, look at it, or send it to a friend
  function review(shot, entry) {
    const old = $('.cam-review', ui); if (old) old.remove();
    const box = html`<div class="cam-review"><img alt="Photo"><div class="cam-rv-txt">✅ <span class="zh">存进相册了！</span> Saved to your gallery<small>⏳ <span class="zh">${PHOTO_DAYS}天后自动删除</span> Clears after ${PHOTO_DAYS} days</small></div>
        <div class="cam-rv-btns"><button type="button" class="btn small green cam-send">💬 <span class="zh">发给朋友</span> Send to a friend</button><button type="button" class="btn small white cam-more">📷 <span class="zh">再拍</span> Take another</button></div></div>`;
    $('img', box).src = shot.toDataURL('image/jpeg', 0.8);
    $('.cam-more', box).onclick = () => { sfx.click(); box.remove(); };
    $('.cam-send', box).onclick = () => { sfx.click(); close(); onSend && onSend(entry); };
    ui.append(box);
  }
  document.body.append(ui);
  sfx.click();
  return { close };
}
