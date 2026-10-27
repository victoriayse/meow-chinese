// 📸 The mall's Korean-style Photo Studio (L2, left of the Buffet).
// Three photo booths (Floral Cafe · Airplane · Bouncy Castle): 10 coins for a strip of 4 photos, which goes into her
// phone's 🖼️ Gallery. A props rack lends her fun things to wear (party hat, angel wings, signs to hold…) —
// they only exist inside the studio and come off by themselves when she leaves. Phone cameras don't work in here.
import * as S from './state.js';
import * as Auth from './auth.js';
import * as Gallery from './gallery.js';
import { ITEMS, kittenGrid, drawGrid, spriteCanvas } from './pixel.js';
import { PHOTO_PROPS } from './photoprops.js';
import { html, $, toast, openModal, closeModal, confirmBox, coinI, hydrateIcons, confetti, getProps, setProps, KittenView } from './ui.js';
import { sfx } from './audio.js';

export const ROOM = 'mallphoto', FEE = 10;
export const THEMES = {
  floral: { zh: '花花咖啡馆', en: 'Floral Cafe', icon: '🌸', strip: '#ffd6e6', ink: '#c2185b' },
  airplane: { zh: '飞机', en: 'Airplane', icon: '✈️', strip: '#cfe8ff', ink: '#1f5aa8' },
  castle: { zh: '充气城堡', en: 'Bouncy Castle', icon: '🏰', strip: '#fff1a8', ink: '#c0392b' },
};
const SLOTS = [['head', '🎉 头上 Head'], ['face', '🕶️ 脸上 Face'], ['back', '🪽 翅膀 Wings'], ['bag', '🪧 拿着 Hold'], ['neck', '📿 脖子 Neck']];

// ---------- the booth backdrops (drawn on a little 80 × 60 grid, then made big) ----------
function backdrop(theme) {
  const W = 80, H = 60, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), R = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
  const dot = (cx, cy, r, col) => { for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r + r) R(cx + xx, cy + yy, 1, 1, col); };
  if (theme === 'floral') {
    R(0, 0, W, H, '#fff4e8');
    const cols = ['#ff9ec4', '#ffffff', '#ffc6a8', '#ff6f9c', '#ffe0ec'];
    for (let y = 2, i = 0; y < 40; y += 5) for (let xx = (y % 10 ? 2 : 5); xx < W; xx += 6, i++) { dot(xx, y, 2, cols[(i * 7 + y) % 5]); R(xx, y, 1, 1, '#ffe27a'); }
    for (let xx = 0; xx < W; xx += 7) R(xx + 3, 36 + (xx % 3), 2, 3, '#6fc26a');   // leaves
    R(0, 42, W, H - 42, '#e8c9a0'); for (let yy = 45; yy < H; yy += 4) R(0, yy, W, 1, '#d2a878');
    R(60, 38, 16, 2, '#ffffff'); R(66, 40, 2, 12, '#c98f58'); R(62, 51, 10, 1, '#c98f58');   // a little cafe table
    R(62, 34, 4, 4, '#ffffff'); R(63, 33, 2, 1, '#c98f58'); R(66, 35, 1, 2, '#ffffff');      // a cup
    R(69, 33, 6, 5, '#ffd6e6'); R(69, 33, 6, 1, '#ff6f9c'); R(71, 32, 2, 1, '#e8384f');      // a slice of strawberry cake
  } else if (theme === 'airplane') {
    R(0, 0, W, H, '#eef1f6'); R(0, 0, W, 8, '#d6dbe4'); R(0, 8, W, 1, '#aab3c2');            // overhead bins
    for (let xx = 4; xx < W; xx += 19) R(xx, 2, 12, 4, '#c9d0db');
    [[8, 14], [58, 14]].forEach(([wx, wy]) => {                                                // two round windows
      for (let yy = 0; yy < 18; yy++) for (let xx = 0; xx < 14; xx++) { const dx = (xx - 6.5) / 7, dy = (yy - 8.5) / 9; const d = dx * dx + dy * dy; if (d <= 1) R(wx + xx, wy + yy, 1, 1, d > 0.78 ? '#9aa4b4' : yy > 12 ? '#ffffff' : '#7cc4ec'); }
      R(wx + 3, wy + 6, 6, 2, '#ffffff'); R(wx + 4, wy + 5, 3, 1, '#ffffff');                  // a cloud
    });
    R(58 + 5, 14 + 10, 9, 2, '#c9d3de');                                                        // the wing, through the window
    R(0, 44, W, H - 44, '#4a5a7a'); for (let xx = 0; xx < W; xx += 6) R(xx, 44, 3, H - 44, '#56688c');   // aisle carpet
    R(24, 18, 32, 30, '#3d6fc4'); R(24, 18, 32, 3, '#5a8ae0'); R(28, 14, 24, 6, '#3d6fc4'); R(30, 15, 20, 3, '#ffffff');   // her seat (headrest cover)
    R(22, 44, 36, 4, '#2a4f8f');
  } else {
    R(0, 0, W, H, '#9fd6f7'); R(0, 0, W, 10, '#7cc2f2');
    [[8, 10, '#ff6f9c'], [70, 6, '#ffd23f'], [16, 4, '#7cd07a'], [62, 16, '#c4a3ff']].forEach(([bx, by, col]) => { dot(bx, by, 3, col); R(bx, by + 4, 1, 8, '#ffffff'); });   // balloons
    const st = (i) => ['#e8384f', '#ffd23f', '#3d8be0', '#7cd07a'][i % 4];
    for (let i = 0; i < 4; i++) { const tx = 4 + i * 22; for (let yy = 12; yy < 44; yy++) R(tx, yy, 8, 1, st(i + (yy >> 2))); dot(tx + 4, 11, 4, st(i + 1)); }   // inflatable turrets
    R(0, 28, W, 16, '#ff9ec4'); for (let xx = 0; xx < W; xx += 8) R(xx, 28, 4, 16, '#ffb3d1');   // the castle wall
    for (let xx = 2; xx < W; xx += 10) R(xx, 26, 6, 2, '#ffffff');
    R(0, 44, W, H - 44, '#ffd23f'); for (let xx = 0; xx < W; xx += 10) R(xx, 44, 5, H - 44, '#ffe27a');   // the bouncy floor
  }
  return c;
}
// one photo: the backdrop with her in front (props and all)
export function scene(theme, { fur, equipped }, mood = 'happy', side = false, shift = 0, noCat = false) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 240;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  x.drawImage(backdrop(theme), 0, 0, 320, 240);
  if (noCat) return c;
  const cat = document.createElement('canvas'); drawGrid(cat, kittenGrid(fur || 'ginger', mood, equipped || {}, 0, false, false, side), 5);
  const w = cat.width, h = cat.height, k = Math.min(1, 228 / h);
  x.drawImage(cat, 160 - (w * k) / 2 + shift, 240 - h * k + 6, w * k, h * k);
  return c;
}
const myLook = () => { const k = S.get().kitten; return { fur: k.fur, equipped: { ...(k.equipped || {}), ...(getProps() || {}) } }; };

// ---------- the strip: 4 photos down a coloured strip, with the studio's name and the date ----------
function strip(theme, shots) {
  const T = THEMES[theme], fw = 240, fh = 180, m = 16, gap = 10, foot = 64;
  const c = document.createElement('canvas'); c.width = fw + 2 * m; c.height = m + 4 * fh + 3 * gap + foot;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  x.fillStyle = T.strip; x.fillRect(0, 0, c.width, c.height);
  shots.forEach((s, i) => { const y = m + i * (fh + gap); x.fillStyle = '#ffffff'; x.fillRect(m - 3, y - 3, fw + 6, fh + 6); x.drawImage(s, m, y, fw, fh); });
  const y0 = m + 4 * fh + 3 * gap;
  x.fillStyle = T.ink; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '800 18px system-ui, sans-serif'; x.fillText(`${T.icon} 喵喵照相馆 MEOW STUDIO`, c.width / 2, y0 + 22);
  const d = new Date(); x.font = '700 12px ui-monospace, monospace';
  x.fillText(`${T.en.toUpperCase()} · ${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`, c.width / 2, y0 + 44);
  return c;
}

// ---------- 🎀 the props rack: borrow things to wear (one per slot) ----------
function openProps(onWear) {
  const box = html`<div class="card stack ps-propbox">
      <div class="h-title"><span class="zh">🎀 照相道具</span><span class="en">Photo props</span></div>
      <p class="help" style="margin:0"><span class="zh">免费试戴！离开照相馆就会自动拿掉。</span> Free to try on! They come off when you leave the studio.</p>
      <div class="ps-preview"></div>
      <div class="ps-slots"></div>
      <div class="row" style="justify-content:center"><button type="button" class="btn white" id="ps-off">🧺 <span class="zh">全部拿掉</span> Take all off</button><button type="button" class="btn green" id="ps-done">✔ <span class="zh">好了</span> Done</button></div>
    </div>`;
  const kv = new KittenView({ scale: 5 }); kv.canvas.classList.remove('bob'); kv.setMood('happy'); $('.ps-preview', box).append(kv.canvas);
  const draw = () => {
    const on = getProps() || {};
    $('.ps-slots', box).innerHTML = SLOTS.map(([slot, label]) => `<div class="ps-slot"><b>${label}</b><div class="ps-grid">${PHOTO_PROPS.filter((id) => ITEMS[id].slot === slot).map((id) => `<button type="button" class="ps-prop ${on[slot] === id ? 'on' : ''}" data-id="${id}" title="${ITEMS[id].en}"><span class="ps-pic" data-art="${id}"></span><small><span class="zh">${ITEMS[id].name}</span><br>${ITEMS[id].en}</small></button>`).join('')}</div></div>`).join('');
    box.querySelectorAll('[data-art]').forEach((a) => a.append(spriteCanvas(a.dataset.art, 44)));
    box.querySelectorAll('.ps-prop').forEach((b) => { b.onclick = () => {
      const id = b.dataset.id, slot = ITEMS[id].slot, p = { ...(getProps() || {}) };
      if (p[slot] === id) delete p[slot]; else p[slot] = id;
      setProps(p); sfx.click(); kv.draw(); onWear(); draw();
    }; });
  };
  draw();
  $('#ps-off', box).onclick = () => { setProps(null); sfx.click(); kv.draw(); onWear(); draw(); };
  $('#ps-done', box).onclick = () => { sfx.click(); closeModal(); };
  openModal(box); hydrateIcons(box);
}

// ---------- 📸 a booth session: pay, 3-2-1 four times, then the strip goes into the gallery ----------
let busy = false;
async function shoot(theme, onDone) {
  if (busy) return;
  const T = THEMES[theme];
  if (!Auth.user()) return toast('📸 <span class="zh">要先登录</span> Please log in first');
  if (Gallery.galleryFull()) return toast(`🖼️ <span class="zh">相册满了（${Gallery.GALLERY_MAX}张）</span> Your gallery is full — delete some photos first`, { ms: 3000 });
  if (S.get().coins < FEE) { sfx.miss(); return toast(`<span class="zh">金币不够</span> You need ${FEE} coins in your wallet`); }
  const ok = await confirmBox(`${T.icon} <span class="zh">${T.zh}照相亭</span> ${T.en} booth`,
    `<span class="zh">${FEE}金币拍一条四格照片，会存进手机相册。</span><br>${FEE} coins for a strip of 4 photos — it goes into your phone's 🖼️ Gallery.<br><small>🎀 <span class="zh">想戴道具？先去道具架！</span> Want props? Visit the props rack first!</small>`, `📸 付 ${FEE} Pay`, '取消 Cancel');
  if (!ok || S.get().coins < FEE) return;
  busy = true;
  S.get().coins -= FEE; S.save(); sfx.coin();
  const look = myLook();
  const box = html`<div class="card stack ps-session ps-${theme}"><div class="h-title"><span class="zh">${T.icon} ${T.zh}</span><span class="en">${T.en}</span></div>
      <div class="ps-stage"><canvas class="ps-live"></canvas><div class="ps-count"></div><div class="ps-flash"></div></div>
      <div class="ps-thumbs">${[0, 1, 2, 3].map(() => '<i></i>').join('')}</div>
      <p class="ps-tip"><span class="zh">看镜头！</span> Look at the camera!</p></div>`;
  openModal(box);
  const live = $('.ps-live', box), POSES = [['happy', false, 0], ['e-wink', false, -24], ['e-laugh', true, 18], ['love', false, 0]];
  const shots = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    for (let i = 0; i < 4; i++) {
      const [mood, side, shift] = POSES[i];
      const shot = scene(theme, look, mood, side, shift);
      live.width = 320; live.height = 240; live.getContext('2d').drawImage(shot, 0, 0);
      $('.ps-tip', box).innerHTML = ['<span class="zh">笑一个！</span> Big smile!', '<span class="zh">眨眨眼！</span> Wink!', '<span class="zh">哈哈哈！</span> Laugh!', '<span class="zh">比个心！</span> Love it!'][i];
      for (const n of ['3', '2', '1']) { if (!box.isConnected) throw new Error('closed'); $('.ps-count', box).textContent = n; sfx.click(); await wait(650); }
      $('.ps-count', box).textContent = '📸';
      const fl = $('.ps-flash', box); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); sfx.coin();
      shots.push(shot);
      const th = box.querySelectorAll('.ps-thumbs i')[i]; const ti = document.createElement('canvas'); ti.width = 80; ti.height = 60; ti.getContext('2d').drawImage(shot, 0, 0, 80, 60); th.append(ti);
      await wait(500);
    }
    $('.ps-count', box).textContent = ''; $('.ps-tip', box).innerHTML = '<span class="zh">正在打印…</span> Printing your strip…';
    const pic = strip(theme, shots);
    const entry = await Gallery.savePhoto(pic, `📸 ${T.zh} ${T.en} · 喵喵照相馆`);
    busy = false;
    result(pic, entry, T); onDone && onDone();
  } catch (e) {
    busy = false;
    S.get().coins += FEE; S.save();   // nothing was saved: her coins come back
    if (e.message !== 'closed') toast(e.message === 'full' ? '🖼️ 相册满了 · Your gallery is full — your coins were returned' : `📸 没拍好，退回${FEE}金币 · Could not save the photos — ${FEE} coins returned`, { ms: 3000, coins: FEE });
    else toast(`↩️ <span class="zh">退回${FEE}金币</span> ${FEE} coins returned`, { coins: FEE });
  }
}
function result(pic, entry, T) {
  const box = html`<div class="card stack ps-result"><div class="h-title">🎉 <span class="zh">拍好了！</span> Your photo strip!</div>
      <img class="ps-strip" alt="Photo strip">
      <p class="help" style="margin:0;text-align:center">✅ <span class="zh">已经存进手机相册</span> Saved to your phone's 🖼️ Gallery</p>
      <div class="row" style="justify-content:center"><button type="button" class="btn green" id="ps-send">💬 <span class="zh">发给朋友</span> Send to a friend</button><button type="button" class="btn white" id="ps-ok">好 Done</button></div></div>`;
  $('.ps-strip', box).src = pic.toDataURL('image/jpeg', 0.85);
  $('#ps-ok', box).onclick = () => { sfx.click(); closeModal(); };
  $('#ps-send', box).onclick = async () => { sfx.click(); closeModal(); const Phone = await import('./phone.js'); Phone.openPhone({ start: 'sendphoto', args: [entry.path] }); };
  openModal(box); hydrateIcons(box); confetti(); sfx.fanfare();
}

// ---------- in the room: the studio sign, three booths and the props rack ----------
export function attach(room, { onWear }) {
  const hud = html`<div class="ps-hud">
      <div class="ps-sign">📸 <span class="zh">喵喵照相馆</span> Photo Studio · <b>${FEE}</b>${coinI(14)}<small>/ strip</small></div>
      <div class="ps-booths">${Object.entries(THEMES).map(([k, T]) => `<button type="button" class="ps-booth ps-${k}" data-theme="${k}"><span class="ps-bname">${T.icon} <span class="zh">${T.zh}</span><small>${T.en}</small></span><span class="ps-window"></span><span class="ps-curtain"></span><span class="ps-go">📸 ${FEE}${coinI(12)}</span></button>`).join('')}</div>
      <button type="button" class="ps-rack">🎀 <span class="zh">道具</span><small>Props</small></button>
    </div>`;
  hud.querySelectorAll('.ps-booth').forEach((b) => {
    const cv = scene(b.dataset.theme, myLook(), 'happy', false, 0, true); cv.className = 'ps-peek'; $('.ps-window', b).append(cv);
    b.onclick = (e) => { e.stopPropagation(); sfx.click(); shoot(b.dataset.theme); };
  });
  $('.ps-rack', hud).onclick = (e) => { e.stopPropagation(); sfx.click(); openProps(() => { onWear && onWear(); }); };
  hud.addEventListener('pointerdown', (e) => e.stopPropagation());
  room.append(hud); hydrateIcons(hud);
}
// leaving the studio: the props go back on the rack
export function leaveStudio() {
  if (!getProps()) return false;
  setProps(null);
  toast('🎀 <span class="zh">道具留在照相馆了</span> The props stay at the Photo Studio', { ms: 2200 });
  return true;
}
