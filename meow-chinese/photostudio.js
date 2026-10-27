// 📸 The mall's Korean-style Photo Studio (L2, left of the Buffet).
// Three photo booths (Floral Cafe · Airplane · Bouncy Castle): 10 coins for a strip of 4 photos, which goes into her
// phone's 🖼️ Gallery. A props rack lends her fun things to wear (party hat, angel wings, signs to hold…) —
// they only exist inside the studio and come off by themselves when she leaves. Phone cameras don't work in here.
import * as S from './state.js';
import * as Auth from './auth.js';
import * as Gallery from './gallery.js';
import { ITEMS, kittenGrid, kittenLyingGrid, drawGrid, spriteCanvas } from './pixel.js';
import { PHOTO_PROPS } from './photoprops.js';
import { html, $, toast, openModal, closeModal, confirmBox, coinI, hydrateIcons, confetti, getProps, setProps, KittenView } from './ui.js';
import { sfx } from './audio.js';

export const ROOM = 'mallphoto', FEE = 10;
export const THEMES = {
  floral: { zh: '花花咖啡馆', en: 'Floral Cafe', icon: '🌸', strip: '#ffd6e6', ink: '#c2185b' },
  airplane: { zh: '飞机', en: 'Airplane', icon: '✈️', strip: '#cfe8ff', ink: '#1f5aa8' },
  castle: { zh: '充气城堡', en: 'Bouncy Castle', icon: '🏰', strip: '#fff1a8', ink: '#c0392b' },
  vintage: { zh: '复古黑白', en: 'Vintage B&W', icon: '🎞️', strip: '#1e1e22', ink: '#f2f2f2', mono: true },
  clouds: { zh: '软软云朵', en: 'Fluffy Clouds', icon: '☁️', strip: '#e6f0ff', ink: '#5a6fc0' },
  fairytale: { zh: '童话世界', en: 'Fairytale', icon: '🧚', strip: '#efe0ff', ink: '#7a3fb0' },
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
  } else if (theme === 'vintage') {
    // an old-time photo studio: a draped curtain, a column with a vase of flowers, a plain floor (made black & white later)
    R(0, 0, W, H, '#8a7a6a');
    for (let xx = 0; xx < W; xx += 6) { R(xx, 0, 3, 46, '#a89684'); R(xx + 3, 0, 1, 46, '#6f6152'); }
    for (let xx = 0; xx < W; xx++) R(xx, 0, 1, 4 + Math.round(2 * Math.abs(Math.sin(xx / 5))), '#5a4e42');   // the swag at the top
    R(6, 22, 9, 24, '#d8d0c4'); R(5, 21, 11, 2, '#efe9df'); R(5, 44, 11, 2, '#efe9df'); for (let yy = 24; yy < 44; yy += 3) R(8, yy, 1, 2, '#bdb3a4');   // the column
    dot(10, 17, 3, '#efe9df'); R(9, 18, 3, 3, '#cfc6b8'); dot(8, 15, 1, '#ffffff'); dot(12, 14, 1, '#ffffff'); dot(10, 13, 1, '#ffffff');   // vase of flowers
    R(66, 30, 8, 16, '#4a4038'); R(64, 30, 12, 2, '#6f6152'); R(69, 26, 2, 4, '#4a4038');   // an old camera on a stand
    R(0, 46, W, H - 46, '#6f6152'); for (let yy = 48; yy < H; yy += 4) R(0, yy, W, 1, '#5a4e42');
  } else if (theme === 'clouds') {
    // a pastel sky full of puffy clouds, a little rainbow and sparkles
    ['#ffd6e6', '#f2dcff', '#dfe6ff', '#cfe8ff', '#cfe8ff'].forEach((col, i) => R(0, i * 9, W, 9, col));
    [[16, 10, 7], [58, 7, 6], [40, 20, 5]].forEach(([cx, cy, r]) => { dot(cx, cy, r, '#ffffff'); dot(cx - r, cy + 2, r - 2, '#ffffff'); dot(cx + r, cy + 2, r - 2, '#ffffff'); R(cx - r * 2 + 2, cy + 2, r * 4 - 4, r - 1, '#ffffff'); });
    ['#ff8aa0', '#ffb86b', '#ffe27a', '#8fe08a', '#7cc8f2', '#c4a3ff'].forEach((col, i) => { for (let a = 0; a <= 180; a += 3) { const rad = a * Math.PI / 180; R(Math.round(66 + (13 - i) * Math.cos(rad)), Math.round(40 - (13 - i) * Math.sin(rad) * 0.8), 1, 1, col); } });   // rainbow
    [[6, 30], [30, 4], [74, 22], [50, 34]].forEach(([sx, sy]) => { R(sx, sy - 1, 1, 3, '#ffffff'); R(sx - 1, sy, 3, 1, '#ffffff'); });
    for (let xx = -4; xx < W + 4; xx += 8) dot(xx, 49, 6, xx % 16 ? '#ffffff' : '#f4f7ff');   // a bank of clouds to stand on
    R(0, 51, W, H - 51, '#ffffff');
  } else if (theme === 'fairytale') {
    // a starry twilight, a pink castle on the hill, toadstools and sparkles
    R(0, 0, W, H, '#3a2f6e'); R(0, 18, W, 12, '#5a3f8a'); R(0, 30, W, 8, '#8a5aa8');
    [[5, 4], [18, 9], [33, 3], [47, 7], [70, 4], [76, 13], [26, 15], [60, 14]].forEach(([sx, sy]) => R(sx, sy, 1, 1, '#fff3a8'));
    dot(66, 7, 4, '#fff3a8'); dot(68, 6, 4, '#3a2f6e');   // crescent moon
    R(26, 18, 28, 20, '#ffc6e6'); [[24, 12], [36, 8], [50, 12]].forEach(([tx, ty]) => { R(tx, ty + 4, 6, 30 - ty, '#ffb3d9'); for (let k = 0; k < 4; k++) R(tx + k, ty + 3 - k, 6 - 2 * k, 1, '#a77be6'); R(tx + 2, ty - 1, 2, 1, '#ffd23f'); });   // castle and towers
    R(37, 28, 6, 10, '#7a3fb0'); dot(40, 28, 3, '#7a3fb0');   // the door
    [[30, 22], [47, 22], [39, 16]].forEach(([wx, wy]) => R(wx, wy, 2, 3, '#fff3a8'));
    R(0, 38, W, H - 38, '#5fae4a'); for (let xx = 0; xx < W; xx += 5) R(xx, 38, 2, 1, '#7cd07a');
    [[8, 44, '#e8384f'], [72, 46, '#ff6f9c']].forEach(([mx, my, col]) => { R(mx - 1, my, 3, 5, '#fff4e8'); dot(mx, my, 3, col); R(mx - 2, my - 1, 1, 1, '#ffffff'); R(mx + 1, my - 2, 1, 1, '#ffffff'); });   // toadstools
    [[14, 30], [64, 32], [20, 50], [58, 52]].forEach(([sx, sy]) => { R(sx, sy - 1, 1, 3, '#fff3a8'); R(sx - 1, sy, 3, 1, '#fff3a8'); });
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
function openProps(onWear, inside = null) {
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
  if (inside) {   // in the booth: a panel over the machine
    const wrap = html`<div class="pb-overlay"></div>`; wrap.append(box); inside.append(wrap);
    $('#ps-done', box).onclick = () => { sfx.click(); wrap.remove(); };
    hydrateIcons(box); return;
  }
  $('#ps-done', box).onclick = () => { sfx.click(); closeModal(); };
  openModal(box); hydrateIcons(box);
}

// ---------- 📸 the photo booth (one, in the middle of the studio): up to 4 cats, walking about until each snap ----------
// Walk in → the inside of the booth: a white photo machine with a glowing top, light bars, sample strips stuck round the
// screen and a tray of props. On its screen: put in 10 coins → pick a theme → the live camera (tap where to stand, pick a
// pose) → Start → 4 photos → the strip slides out of the PHOTO OUTLET. Only the cat who pays (the host) pays; friends in
// the studio can squeeze in free until she presses Start. Everyone gets the strip in their own gallery.
// Over the studio's line (all with booth:'main'): pb-open (host heartbeat, with the theme) · pb-join / pb-pos · pb-start
// · pb-leave · pb-close.
export const MAX_CATS = 4;
// 🤳 poses she can pick in the booth (and change any time, even during the 3-2-1)
export const POSES = {
  smile: { ic: '😊', zh: '微笑', en: 'Smile', mood: 'happy' },
  wink: { ic: '😉', zh: '眨眼', en: 'Wink', mood: 'e-wink' },
  laugh: { ic: '😆', zh: '大笑', en: 'Laugh', mood: 'e-laugh' },
  love: { ic: '😍', zh: '爱心', en: 'Love', mood: 'love' },
  wow: { ic: '😮', zh: '哇', en: 'Wow', mood: 'e-wow' },
  shy: { ic: '☺️', zh: '害羞', en: 'Shy', mood: 'e-shy' },
  cool: { ic: '😎', zh: '酷', en: 'Cool', mood: 'e-cool' },
  sleepy: { ic: '😴', zh: '困了', en: 'Sleepy', mood: 'sleepy' },
  side: { ic: '🐾', zh: '侧身', en: 'Side pose', mood: 'happy', side: true },
  jump: { ic: '🦘', zh: '跳起来', en: 'Jump!', mood: 'e-laugh', lift: 26 },
  lie: { ic: '🛌', zh: '躺下', en: 'Lie down', mood: 'happy', lie: true },
  back: { ic: '🔙', zh: '转过去', en: 'Turn around', mood: 'back' },
};
const poseOf = (k) => POSES[k] || POSES.smile;
const SHOTS = [['smile', '<span class="zh">第一张！摆个姿势！</span> Photo 1 — strike a pose!'], ['wink', '<span class="zh">第二张！换个姿势！</span> Photo 2 — new pose!'], ['laugh', '<span class="zh">第三张！</span> Photo 3!'], ['love', '<span class="zh">最后一张！</span> Last one!']];
const COUNT_MS = 3000, GAP_MS = 900, START_IN = 1200;
let booth = null;   // { sid, host, at, theme, started, members: Map(id → { look, name, x, y, left, pose, seen }) }
let link = null;    // { me, ch, name } while she is in the studio
let mine = null;    // she is in the booth: { sid, paid, view, shooting, ... } — or { welcome: true } before paying
const now = () => Date.now();
const clampX = (x) => Math.max(10, Math.min(90, x)), clampY = (y) => Math.max(0, Math.min(20, y));
const send = (ev, p) => { if (link) link.ch.send(ev, { id: link.me, booth: 'main', ...p }); };
const lookNow = () => myLook();

// ---------- drawing everyone in the booth ----------
const catCache = new Map();
function catCanvas(look, poseKey) {
  const P = poseOf(poseKey), key = `${look.fur}|${poseKey}|${JSON.stringify(look.equipped || {})}`;
  if (!catCache.has(key)) {
    const c = document.createElement('canvas');
    drawGrid(c, P.lie ? kittenLyingGrid(look.fur || 'ginger', P.mood, look.equipped || {}, 0) : kittenGrid(look.fur || 'ginger', P.mood, look.equipped || {}, 0, false, false, !!P.side), 5);
    catCache.set(key, c); if (catCache.size > 80) catCache.delete(catCache.keys().next().value);
  }
  return catCache.get(key);
}
// 🎞️ the vintage theme: black & white, a little film grain and dark corners
function monochrome(c) {
  const x = c.getContext('2d'), img = x.getImageData(0, 0, c.width, c.height), d = img.data, w = c.width, h = c.height;
  for (let i = 0; i < d.length; i += 4) {
    const p = i / 4, px = p % w, py = (p / w) | 0, vx = (px / w - 0.5), vy = (py / h - 0.5);
    let g = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    g = (g - 128) * 1.15 + 128 + ((p * 7919) % 17 - 8) - (vx * vx + vy * vy) * 160;
    d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, g));
  }
  x.putImageData(img, 0, 0); return c;
}
function groupScene(theme, members, names = false, bounce = 1) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 240;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  x.drawImage(backdrop(theme), 0, 0, 320, 240);
  const list = [...members.values()].sort((a, b) => b.y - a.y);
  const base = list.length <= 1 ? 1 : list.length === 2 ? 0.86 : 0.74;
  list.forEach((m) => {
    const P = poseOf(m.pose), cat = catCanvas(m.look, m.pose), k = Math.min(1, 228 / (P.lie ? cat.height * 1.9 : cat.height)) * base * (1 - m.y / 20 * 0.22) * 0.7;   // (v291: 30% smaller in the photos)
    const w = cat.width * k, h = cat.height * k, cx = (m.x / 100) * 320, bottom = 246 - m.y * 2.6 - (P.lift || 0) * bounce;
    x.save();
    if (m.left && P.side) { x.translate(cx, 0); x.scale(-1, 1); x.drawImage(cat, -w / 2, bottom - h, w, h); }   // (only the side pose turns; signs stay readable)
    else x.drawImage(cat, cx - w / 2, bottom - h, w, h);
    x.restore();
  });
  if (THEMES[theme] && THEMES[theme].mono) monochrome(c);
  if (names) list.forEach((m) => { if (!m.name) return; const cx = (m.x / 100) * 320, bottom = 246 - m.y * 2.6; x.font = '700 11px system-ui, sans-serif'; x.textAlign = 'center'; const tw = x.measureText(m.name).width + 8; x.fillStyle = m.me ? '#ff6f9c' : 'rgba(43,33,64,.75)'; x.fillRect(cx - tw / 2, bottom - 2, tw, 14); x.fillStyle = '#fff'; x.fillText(m.name, cx, bottom + 9); });
  return c;
}
const themeThumb = (k) => { const c = groupScene(k, new Map()); c.className = 'pb-thumb'; return c; };

// ---------- paying (and paying back) ----------
function pay() {
  if (S.get().coins < FEE) { sfx.miss(); toast(`<span class="zh">金币不够</span> You need ${FEE} coins in your wallet`); return false; }
  S.get().coins -= FEE; S.save(); sfx.coin(); return true;
}
function refund(why) {
  if (!mine || !mine.paid) return;
  mine.paid = false; S.get().coins += FEE; S.save();
  toast(`↩️ ${why} <span class="zh">退回${FEE}金币</span> · ${FEE} coins returned`, { coins: FEE, ms: 2600 });
}
const canShoot = () => {
  if (!Auth.user()) { toast('📸 <span class="zh">要先登录</span> Please log in first'); return false; }
  if (Gallery.galleryFull()) { toast(`🖼️ <span class="zh">相册满了（${Gallery.GALLERY_MAX}张）</span> Your gallery is full — delete some photos first`, { ms: 3000 }); return false; }
  return true;
};

// ---------- walking into the booth ----------
function enterBooth() {
  if (mine && mine.view && mine.view.isConnected) return;
  if (mine && mine.sid) return openMachine();
  if (!canShoot()) return;
  const b = booth;
  if (b && b.started) return toast('⏳ <span class="zh">照相亭正在拍照，等一下</span> The photo booth is busy — try again in a moment', { ms: 2400 });
  if (b && b.members.size >= MAX_CATS) return toast(`<span class="zh">照相亭满了（${MAX_CATS}只猫）</span> The booth is full (${MAX_CATS} cats)`);
  if (b) {   // someone is already inside: squeeze in for free
    const me = { look: lookNow(), name: link.name, x: 30 + Math.random() * 40, y: 6, left: false, pose: 'smile', seen: now(), me: true };
    mine = { sid: b.sid, paid: false };
    b.members.set(link.me, me); send('pb-join', { sid: b.sid, look: me.look, name: me.name, x: me.x, y: me.y, left: me.left, pose: me.pose });
    sfx.click(); drawBooth(); openMachine(); return;
  }
  mine = { welcome: true };
  openMachine();
}
// she puts in her 10 coins: the booth is hers (her friends can join until Start)
function claim() {
  if (booth) { sfx.miss(); toast('<span class="zh">刚好有人进来了！你可以免费加入他们。</span> Someone just went in — you can join them for free!'); mine = null; closeModal(); return false; }
  if (!pay()) return false;
  const sid = S.uid(), me = { look: lookNow(), name: link.name, x: 38 + Math.random() * 24, y: 6, left: false, pose: 'smile', seen: now(), me: true };
  booth = { sid, host: link.me, at: now(), theme: null, started: 0, members: new Map([[link.me, me]]) };
  mine = { ...(mine || {}), welcome: false, sid, paid: true };   // (keeps the machine on screen)
  heartbeat(); drawBooth();
  return true;
}
// the host says "the booth is open (with this theme)" every second and a half; everyone says where they stand
function heartbeat() {
  if (!mine || !mine.sid || !link) return;
  const b = booth; if (!b || b.sid !== mine.sid) return;
  const m = b.members.get(link.me); if (!m) return;
  m.seen = now(); m.look = lookNow();
  const pos = { sid: b.sid, look: m.look, name: m.name, x: m.x, y: m.y, left: m.left, pose: m.pose };
  if (b.host === link.me) send('pb-open', { ...pos, at: b.at, theme: b.theme, started: !!b.started }); else send('pb-pos', pos);
}
setInterval(() => {
  heartbeat();
  const b = booth;
  if (b && !b.started) {
    const host = b.members.get(b.host);
    if (b.host !== (link && link.me) && (!host || now() - host.seen > 6000)) closeBooth('<span class="zh">照相亭关了</span> The booth closed —');
    else b.members.forEach((m, id) => { if (!m.me && id !== b.host && now() - m.seen > 6000) b.members.delete(id); });
  }
  drawBooth();
}, 1500);
function closeBooth(why) {
  const b = booth; booth = null;
  if (mine && mine.sid && (!b || b.sid === mine.sid) && !mine.shooting) {
    refund(why);
    if (mine.view && mine.view.isConnected) { mine.closing = true; closeModal(); }
    if (!mine.paid) toast(`🚪 ${why.replace(/—$/, '')}`, { ms: 2200 });
    mine = null;
  }
  drawBooth();
}
// she walks out in the middle of the photos: they stop (no strip for her — the host gets her coins back)
function stopShoot() {
  if (!mine || !mine.shooting) return;
  mine.cancelled = true; mine.shooting = false;
  leaveBooth();
  toast('⏹ <span class="zh">离开了照相亭，拍照停止了</span> You left the booth — the photos stopped', { ms: 2600 });
}
// she walks out before the photos start (or the host cancels)
function leaveBooth() {
  if (!mine || mine.shooting) return;
  const b = booth;
  if (mine.sid && b && b.sid === mine.sid) {
    if (b.host === link.me) { send('pb-close', { sid: b.sid }); booth = null; }
    else { b.members.delete(link.me); send('pb-leave', { sid: b.sid }); }
  }
  refund('<span class="zh">离开照相亭</span> Left the booth —');
  mine = null; drawBooth();
}

// ---------- messages from the others in the studio ----------
export function onBroadcast(ev, p) {
  if (!link || !p || p.booth !== 'main') return;
  const b = booth;
  const member = () => ({ look: p.look || { fur: 'ginger', equipped: {} }, name: String(p.name || '🐱').slice(0, 24), x: clampX(+p.x || 50), y: clampY(+p.y || 0), left: !!p.left, pose: POSES[p.pose] ? p.pose : 'smile', seen: now() });
  if (ev === 'pb-open') {
    if (b && b.sid !== p.sid) {
      // two cats paid at the same moment: the earlier one keeps the booth (the other gets her coins back)
      const theirs = [+p.at || 0, p.id], ours = [b.at, b.host];
      if (theirs[0] < ours[0] || (theirs[0] === ours[0] && theirs[1] < ours[1])) closeBooth('<span class="zh">别人先进去了</span> Someone got there first —');
      else return;
    }
    if (!booth) booth = { sid: p.sid, host: p.id, at: +p.at || now(), theme: null, started: 0, members: new Map() };
    booth.theme = THEMES[p.theme] ? p.theme : null;
    booth.members.set(p.id, member());
    if (p.started && !booth.started) booth.started = now();
  } else if (ev === 'pb-join' || ev === 'pb-pos') {
    if (!b || b.sid !== p.sid) return;
    if (!b.members.has(p.id) && b.members.size >= MAX_CATS) return;
    b.members.set(p.id, member());
  } else if (ev === 'pb-leave') {
    if (b && b.sid === p.sid) b.members.delete(p.id);
  } else if (ev === 'pb-close') {
    if (b && b.sid === p.sid) closeBooth('<span class="zh">照相亭关了</span> The booth was closed —');
  } else if (ev === 'pb-start') {
    if (!b || b.sid !== p.sid) return;
    b.started = now(); if (THEMES[p.theme]) b.theme = p.theme;
    if (mine && mine.sid === p.sid) runShoot(+p.in || START_IN);
  }
  drawBooth();
}

// ---------- inside the booth: the photo machine ----------
function openMachine() {
  const samples = ['floral', 'clouds', 'fairytale', 'vintage', 'castle', 'airplane'];
  const box = html`<div class="pb-machine" role="dialog" aria-label="Photo booth">
      <div class="pb-top"><b>📸 MEOW 4-CUT</b><small><span class="zh">喵喵四格照相亭</span></small></div>
      <div class="pb-body">
        <i class="pb-light l"></i><i class="pb-light r"></i>
        <div class="pb-stick l"></div><div class="pb-stick r"></div>
        <div class="pb-screen"><div class="pb-screen-in"></div></div>
      </div>
      <div class="pb-panel"></div>
      <div class="pb-tray"><span class="pb-props" title="Props"></span><div class="pb-outlet"><b>PHOTO OUTLET</b><span class="pb-slot"></span></div></div>
      <button type="button" class="pb-exit">↩ <span class="zh">离开照相亭</span> Leave the booth</button>
    </div>`;
  // little sample strips stuck around the screen (like a real booth)
  ['l', 'r'].forEach((side, si) => { const st = $(`.pb-stick.${side}`, box); [0, 1].forEach((k) => { const strip2 = document.createElement('div'); strip2.className = 'pb-sample'; for (let j = 0; j < 3; j++) { const t = themeThumb(samples[(si * 2 + k + j) % samples.length]); strip2.append(t); } st.append(strip2); }); });
  // the props on the tray: tap them to try some on
  ['ppartyhat', 'pbunnyears', 'pheartboppers', 'psignheart', 'pstarglasses'].forEach((id) => $('.pb-props', box).append(spriteCanvas(id, 34)));
  $('.pb-props', box).onclick = () => { sfx.click(); openProps(() => { link && link.onWear && link.onWear(); }, box); };
  $('.pb-exit', box).onclick = () => { sfx.click(); if (mine) mine.closing = true; if (mine && mine.shooting) stopShoot(); else leaveBooth(); closeModal(); };
  if (!mine) return;
  mine.view = box; mine.closing = false;
  openModal(box, { onClose: () => { if (!mine || mine.closing) return; if (mine.shooting) stopShoot(); else leaveBooth(); } });
  box.closest('#modal') && box.closest('#modal').classList.add('pb-modal');
  hydrateIcons(box);
  screen();
}
// what the machine's screen shows now
function screen() {
  if (!mine || !mine.view || !mine.view.isConnected) return;
  const box = mine.view, scr = $('.pb-screen-in', box), panel = $('.pb-panel', box), b = booth;
  const host = b && b.host === link.me;
  scr.innerHTML = ''; panel.innerHTML = '';
  if (mine.welcome) {
    scr.append(html`<div class="pb-welcome"><div class="pb-big">👋 <span class="zh">欢迎光临！</span></div><p>Welcome to MEOW 4-CUT!</p><p class="pb-small"><span class="zh">投${FEE}金币，拍一条四格照片</span><br>${FEE} coins · a strip of 4 photos · friends can join free</p></div>`);
    const btn = html`<button type="button" class="pb-coin">🪙 <span class="zh">投币</span> Insert ${FEE} coins</button>`;
    btn.onclick = () => { if (!claim()) return; screen(); };
    panel.append(btn); return;
  }
  if (!b || b.sid !== mine.sid) return;
  if (!b.theme) {
    if (host) {
      scr.append(html`<div class="pb-themes-title">🎨 <span class="zh">选一个主题</span> Pick a theme</div>`);
      const grid = html`<div class="pb-themes"></div>`;
      Object.entries(THEMES).forEach(([k, T]) => { const t = html`<button type="button" class="pb-theme" data-theme="${k}"><span class="pb-tname">${T.icon} <span class="zh">${T.zh}</span><small>${T.en}</small></span></button>`; t.prepend(themeThumb(k)); t.onclick = () => { sfx.click(); b.theme = k; heartbeat(); screen(); }; grid.append(t); });
      scr.append(grid);
    } else scr.append(html`<div class="pb-welcome"><div class="pb-big">⏳</div><p><span class="zh">房主正在选主题…</span><br>The host is picking a theme…</p></div>`);
    return;
  }
  liveView(scr, panel, host);
}
// the live camera: tap where to stand, pick a pose; the host presses Start
function liveView(scr, panel, host) {
  const box = mine.view, T = THEMES[booth.theme];
  scr.append(html`<div class="ps-stage"><canvas class="ps-live"></canvas><div class="ps-count"></div><div class="ps-flash"></div><span class="pb-theme-tag">${T.icon} ${T.en}</span></div>`);
  scr.append(html`<div class="ps-thumbs">${[0, 1, 2, 3].map(() => '<i></i>').join('')}</div>`);
  panel.append(html`<p class="ps-tip">${host ? '<span class="zh">点屏幕走过去，再选个姿势。人齐了就按开始！</span><br>Tap the screen to walk, pick a pose — press Start when everyone is ready!' : '<span class="zh">点屏幕走过去，再选个姿势。等房主按开始！</span><br>Tap the screen to walk and pick a pose — the host will press Start!'}</p>`);
  panel.append(html`<div class="ps-poses" role="group" aria-label="Poses">${Object.entries(POSES).map(([k, P]) => `<button type="button" class="ps-pose" data-pose="${k}" title="${P.en}"><span>${P.ic}</span><small><span class="zh">${P.zh}</span><br>${P.en}</small></button>`).join('')}</div>`);
  panel.append(html`<div class="ps-who"></div>`);
  panel.append(html`<div class="row ps-btns" style="justify-content:center">${host ? '<button type="button" class="btn green" id="ps-start">▶ <span class="zh">开始拍照</span> Start</button><button type="button" class="btn white" id="ps-theme">🎨 <span class="zh">换主题</span> Theme</button>' : ''}</div>`);
  const live = $('.ps-live', box); live.width = 320; live.height = 240;
  const me = () => (booth || { members: new Map() }).members.get(link.me);
  const markPose = () => { const m = me(); box.querySelectorAll('.ps-pose').forEach((x) => x.classList.toggle('on', !!m && x.dataset.pose === (m.pose || 'smile'))); };
  box.querySelectorAll('.ps-pose').forEach((pb) => { pb.onclick = () => { const m = me(); if (!m) return; m.pose = pb.dataset.pose; sfx.click(); heartbeat(); markPose(); }; });
  markPose();
  let target = null, lastSent = 0, held = null;
  const aim = (e) => { const r = live.getBoundingClientRect(); target = { x: clampX(((e.clientX - r.left) / r.width) * 100), y: clampY((1 - (e.clientY - r.top) / r.height) * 100 * 0.42 - 4) }; };
  live.addEventListener('pointerdown', (e) => { e.preventDefault(); held = e.pointerId; try { live.setPointerCapture(held); } catch {} aim(e); });
  live.addEventListener('pointermove', (e) => { if (e.pointerId === held) aim(e); });
  ['pointerup', 'pointercancel'].forEach((ev) => live.addEventListener(ev, (e) => { if (e.pointerId === held) held = null; }));
  const keys = new Set();
  const kd = (e) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { keys.add(e.key); e.preventDefault(); target = null; } };
  const ku = (e) => keys.delete(e.key);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  let last = 0;
  const frame = (t) => {
    if (!live.isConnected) { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); return; }
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    const m = me(), b2 = booth;
    if (m) {
      let dx = 0, dy = 0;
      if (keys.has('ArrowLeft')) dx -= 1; if (keys.has('ArrowRight')) dx += 1; if (keys.has('ArrowUp')) dy += 1; if (keys.has('ArrowDown')) dy -= 1;
      if (target) { const ex = target.x - m.x, ey = target.y - m.y, d = Math.hypot(ex, ey * 2); if (d < 0.6) target = null; else { dx = ex / d; dy = (ey * 2) / d; } }
      if (dx || dy) { m.x = clampX(m.x + dx * 38 * dt); m.y = clampY(m.y + dy * 14 * dt); if (Math.abs(dx) > 0.2) m.left = dx < 0; if (now() - lastSent > 140) { lastSent = now(); heartbeat(); } }
    }
    if (b2 && b2.theme) {
      live.getContext('2d').drawImage(groupScene(b2.theme, b2.members, !(mine && mine.snapping), Math.abs(Math.sin(t / 220))), 0, 0);
      const who = $('.ps-who', box), list = [...b2.members.values()].map((x) => x.name + (x.me ? ' (你 you)' : '')).join(' · ');
      if (who && who.dataset.l !== list) { who.dataset.l = list; who.innerHTML = `🐱 ${b2.members.size}/${MAX_CATS}: ${list}`; }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  const st = $('#ps-start', box);
  if (st) st.onclick = () => { const b2 = booth; if (!b2 || b2.started) return; sfx.click(); b2.started = now(); send('pb-start', { sid: b2.sid, theme: b2.theme, in: START_IN }); runShoot(START_IN); };
  const th = $('#ps-theme', box);
  if (th) th.onclick = () => { sfx.click(); booth.theme = null; heartbeat(); screen(); };
  // a guest whose host changes the theme: redraw with the new one
  mine.shownTheme = booth.theme;
}

// ---------- the 4 shots: 3-2-1 (keep moving!) then snap — the same moment on every screen ----------
async function runShoot(delay) {
  if (!mine || mine.shooting) return;
  const b = booth; if (!b || !b.theme) return;
  mine.shooting = true; mine.shot = 0;
  if (!$('.ps-live', mine.view || document.createElement('div'))) screen();   // make sure the camera is showing
  const run = mine, box = mine.view, theme = b.theme, T = THEMES[theme];
  const gone = () => run.cancelled || mine !== run || !box || !box.isConnected;   // she walked out: stop
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)).then(() => { if (gone()) throw new Error('left'); });
  const q = (sel) => box && box.isConnected ? $(sel, box) : null;
  const tip = (h) => { const e = q('.ps-tip'); if (e) e.innerHTML = h; };
  const btns = q('.ps-btns'); if (btns) btns.style.display = 'none';
  tip('<span class="zh">准备好了吗？可以一直走动、换姿势哦！</span> Get ready — keep moving and changing poses!');
  try { await wait(delay); } catch { return; }
  const shots = [];
  try {
  for (let i = 0; i < 4; i++) {
    mine.shot = i; tip(SHOTS[i][1]);
    for (const n of ['3', '2', '1']) { const c = q('.ps-count'); if (c) c.textContent = n; sfx.click(); await wait(COUNT_MS / 3); }
    const c = q('.ps-count'); if (c) c.textContent = '📸';
    mine.snapping = true; const shot = groupScene(theme, (booth || b).members, false, 1); mine.snapping = false;
    const fl = q('.ps-flash'); if (fl) { fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); }
    sfx.coin(); shots.push(shot);
    const th = box && box.querySelectorAll('.ps-thumbs i')[i]; if (th) { const ti = document.createElement('canvas'); ti.width = 80; ti.height = 60; ti.getContext('2d').drawImage(shot, 0, 0, 80, 60); th.append(ti); }
    await wait(GAP_MS);
    const c2 = q('.ps-count'); if (c2) c2.textContent = '';
  }
  } catch { return; }   // she left the booth part-way: no more photos, nothing saved
  tip('<span class="zh">正在打印…看看出相口！</span> Printing… look at the photo outlet!');
  const pic = strip(theme, shots), size = (booth || b).members.size;
  if (b.host === (link && link.me)) send('pb-close', { sid: b.sid });
  booth = null; drawBooth();
  // the strip slides out of the PHOTO OUTLET
  const slot = q('.pb-slot');
  if (slot) { const im = document.createElement('img'); im.className = 'pb-printed'; im.src = pic.toDataURL('image/jpeg', 0.85); slot.append(im); sfx.fanfare(); }
  try {
    const entry = await Gallery.savePhoto(pic, `📸 ${T.zh} ${T.en}${size > 1 ? ` · ${size} 🐱` : ''} · 喵喵照相馆`);
    await new Promise((r) => setTimeout(r, 1800));
    if (mine === run) { mine.paid = false; mine.closing = true; mine = null; }
    closeModal(); result(pic, entry);
  } catch (e) {
    mine.shooting = false; refund(e.message === 'full' ? '🖼️ 相册满了 · Your gallery is full —' : '📸 <span class="zh">没存好</span> Could not save the photos —');
    mine.closing = true; mine = null; closeModal();
  }
}
function result(pic, entry) {
  const box = html`<div class="card stack ps-result"><div class="h-title">🎉 <span class="zh">拍好了！</span> Your photo strip!</div>
      <img class="ps-strip" alt="Photo strip">
      <p class="help" style="margin:0;text-align:center">✅ <span class="zh">已经存进手机相册</span> Saved to your phone's 🖼️ Gallery</p>
      <div class="row" style="justify-content:center"><button type="button" class="btn green" id="ps-send">💬 <span class="zh">发给朋友</span> Send to a friend</button><button type="button" class="btn white" id="ps-ok">好 Done</button></div></div>`;
  $('.ps-strip', box).src = pic.toDataURL('image/jpeg', 0.85);
  $('#ps-ok', box).onclick = () => { sfx.click(); closeModal(); };
  $('#ps-send', box).onclick = async () => { sfx.click(); closeModal(); const Phone = await import('./phone.js'); Phone.openPhone({ start: 'sendphoto', args: [entry.path] }); };
  openModal(box); hydrateIcons(box); confetti();
}

// ---------- in the studio: one big photo booth, its sign, and the props rack ----------
let hudEl = null;
function drawBooth() {
  // a guest sees the host's theme choice as it happens
  if (mine && mine.view && mine.view.isConnected && !mine.shooting && booth && mine.sid === booth.sid && (booth.theme || null) !== (mine.shownTheme || null)) { mine.shownTheme = booth.theme; screen(); }
  if (!hudEl || !hudEl.isConnected) return;
  const el = $('.pb-booth', hudEl), go = $('.ps-go', el), b = booth;
  const inside = mine && mine.sid && b && mine.sid === b.sid;
  const h = inside ? '🐱 <span class="zh">你在里面</span> You\'re inside' : !b ? `📸 <span class="zh">进去拍照</span> Walk in · ${FEE}${coinI(12)}` : b.started ? '⏳ <span class="zh">拍照中</span> Busy' : b.members.size >= MAX_CATS ? '<span class="zh">满了</span> Full' : `➕ <span class="zh">免费加入</span> Join free ${b.members.size}/${MAX_CATS}`;
  if (go.dataset.h !== h) { go.dataset.h = h; go.innerHTML = h; hydrateIcons(go); }
  el.classList.toggle('busy', !!(b && (b.started || b.members.size >= MAX_CATS)) && !inside);
  el.classList.toggle('joinable', !!(b && !b.started && b.members.size < MAX_CATS) && !inside);
}
export function attach(room, { me, ch, name, onWear }) {
  link = { me, ch, name: String(name || S.get().kitten.name || '🐱').slice(0, 24), onWear };
  const hud = html`<div class="ps-hud">
      <div class="ps-sign">📸 <span class="zh">喵喵照相馆</span> Photo Studio · <b>${FEE}</b>${coinI(14)}<small>/ strip · <span class="zh">朋友免费</span> friends free</small></div>
      <button type="button" class="pb-booth" aria-label="Photo booth"><span class="pb-btop">📸 MEOW 4-CUT</span><span class="pb-bdoor"><span class="pb-bcurtain"></span><span class="pb-bpeek"></span></span><span class="ps-go"></span></button>
      <button type="button" class="ps-rack">🎀 <span class="zh">道具</span><small>Props</small></button>
    </div>`;
  $('.pb-bpeek', hud).append(themeThumb('floral'));
  $('.pb-booth', hud).onclick = (e) => { e.stopPropagation(); sfx.click(); enterBooth(); };
  $('.ps-rack', hud).onclick = (e) => { e.stopPropagation(); sfx.click(); openProps(() => { onWear && onWear(); }); };
  hud.addEventListener('pointerdown', (e) => e.stopPropagation());
  room.append(hud); hydrateIcons(hud); hudEl = hud; drawBooth();
}
// leaving the studio: out of the booth (coins back if it hadn't started), and the props go back on the rack
export function leaveStudio() {
  if (mine) { if (mine.shooting) stopShoot(); else leaveBooth(); }
  booth = null; link = null; hudEl = null;
  if (!getProps()) return false;
  setProps(null);
  toast('🎀 <span class="zh">道具留在照相馆了</span> The props stay at the Photo Studio', { ms: 2200 });
  return true;
}
export const _debug = () => ({ booth, mine });
