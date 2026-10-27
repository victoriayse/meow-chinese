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

// ---------- 📸 the booths: up to 4 cats in one booth, walking about until each photo is snapped ----------
// The cat who opens a booth is its host; anyone else in the studio can join until the host presses Start.
// Only the cat who opens the booth pays (10 coins, paid back if it never starts); friends join free.
// Everyone in the booth gets the same strip in their own gallery.
// Over the studio's line: pb-open (the host, repeated as a heartbeat) · pb-join / pb-pos (where each cat stands)
// · pb-start (the 4 shots begin) · pb-leave · pb-close.
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
const booths = {};            // theme → { sid, host, at, started, members: Map(id → { look, name, x, y, left, seen }) }
let link = null;              // { me, ch, name } while she is in the studio
let mine = null;              // her own booth session: { theme, sid, paid, view }
const now = () => Date.now();
const clampX = (x) => Math.max(10, Math.min(90, x)), clampY = (y) => Math.max(0, Math.min(20, y));
const send = (ev, p) => { if (link) link.ch.send(ev, { id: link.me, ...p }); };

// draw everyone in the booth: further back = a little smaller and higher; facing the way they last walked
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
function groupScene(theme, members, _unused, names = false, bounce = 1) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 240;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  x.drawImage(backdrop(theme), 0, 0, 320, 240);
  const list = [...members.values()].sort((a, b) => b.y - a.y);
  const base = list.length <= 1 ? 1 : list.length === 2 ? 0.86 : 0.74;
  list.forEach((m) => {
    const P = poseOf(m.pose), cat = catCanvas(m.look, m.pose), k = Math.min(1, 228 / (P.lie ? cat.height * 1.9 : cat.height)) * base * (1 - m.y / 20 * 0.22);
    const w = cat.width * k, h = cat.height * k, cx = (m.x / 100) * 320, bottom = 246 - m.y * 2.6 - (P.lift || 0) * bounce;
    x.save();
    if (m.left && P.side) { x.translate(cx, 0); x.scale(-1, 1); x.drawImage(cat, -w / 2, bottom - h, w, h); }   // (only the side pose turns; signs stay readable)
    else x.drawImage(cat, cx - w / 2, bottom - h, w, h);
    x.restore();
    if (names && m.name) { x.font = '700 11px system-ui, sans-serif'; x.textAlign = 'center'; const tw = x.measureText(m.name).width + 8; x.fillStyle = m.me ? '#ff6f9c' : 'rgba(43,33,64,.75)'; x.fillRect(cx - tw / 2, bottom - 2, tw, 14); x.fillStyle = '#fff'; x.fillText(m.name, cx, bottom + 9); }
  });
  return c;
}

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

// ---------- tapping a booth ----------
async function tapBooth(theme) {
  const T = THEMES[theme], b = booths[theme];
  if (mine) { if (mine.theme === theme) return openView(); return toast('📸 <span class="zh">你已经在另一个照相亭里了</span> You are already in another booth'); }
  if (!canShoot()) return;
  if (b && b.started) return toast(`⏳ <span class="zh">${T.zh}正在拍照，等一下</span> The ${T.en} booth is busy — try again in a moment`, { ms: 2400 });
  if (b && b.members.size >= MAX_CATS) return toast(`<span class="zh">这个照相亭满了（${MAX_CATS}只猫）</span> This booth is full (${MAX_CATS} cats)`);
  const host = b && b.members.get(b.host), joining = !!b;
  const ok = await confirmBox(`${T.icon} <span class="zh">${T.zh}照相亭</span> ${T.en} booth`,
    joining ? `<span class="zh">和 ${host ? host.name : '朋友'} 一起拍！免费加入，照片也会存进你的手机相册。</span><br>Join ${host ? host.name : 'your friend'} in the booth — it's free! You get the photo strip in your 🖼️ Gallery too.<br><small>🎀 <span class="zh">想戴道具？先去道具架！</span> Want props? Visit the props rack first!</small>`
      : `<span class="zh">${FEE}金币拍一条四格照片，会存进手机相册。朋友可以免费进来一起拍（最多${MAX_CATS}只猫）！</span><br>${FEE} coins for a strip of 4 photos — it goes into your phone's 🖼️ Gallery. Friends can join you for free (up to ${MAX_CATS} cats)!<br><small>🎀 <span class="zh">想戴道具？先去道具架！</span> Want props? Visit the props rack first!</small>`,
    joining ? '➕ 加入 Join (free)' : `📸 付 ${FEE} Pay`, '取消 Cancel');
  if (!ok || mine) return;
  const b2 = booths[theme];
  if (joining && (!b2 || b2.started || b2.sid !== b.sid || b2.members.size >= MAX_CATS)) return toast('<span class="zh">来晚了一步！</span> Too late — that booth just closed or filled up');
  if (!joining && b2) return toast('<span class="zh">刚好有人进去了，可以点一下加入！</span> Someone just went in — tap again to join them!');
  if (!joining && !pay()) return;   // only the cat who opens the booth pays
  const me = { look: lookNow(), name: link.name, x: 30 + Math.random() * 40, y: 6, left: false, pose: 'smile', seen: now(), me: true };
  if (joining) {
    mine = { theme, sid: b.sid, paid: false };
    b.members.set(link.me, me); send('pb-join', { theme, sid: b.sid, look: me.look, name: me.name, x: me.x, y: me.y, left: me.left, pose: me.pose });
  } else {
    const sid = S.uid();
    booths[theme] = { sid, host: link.me, at: now(), started: 0, members: new Map([[link.me, me]]) };
    mine = { theme, sid, paid: true };
    heartbeat();
  }
  drawBooths(); openView();
}
const lookNow = () => myLook();

// the host says "this booth is open" every second and a half; everyone says where they stand
function heartbeat() {
  if (!mine || !link) return;
  const b = booths[mine.theme]; if (!b || b.sid !== mine.sid) return;
  const m = b.members.get(link.me); if (!m) return;
  m.seen = now(); m.look = lookNow();
  if (b.host === link.me) send('pb-open', { theme: mine.theme, sid: b.sid, at: b.at, started: !!b.started, look: m.look, name: m.name, x: m.x, y: m.y, left: m.left, pose: m.pose });
  else send('pb-pos', { theme: mine.theme, sid: b.sid, look: m.look, name: m.name, x: m.x, y: m.y, left: m.left, pose: m.pose });
}
setInterval(() => {
  heartbeat();
  // forget booths whose host went quiet, and cats who left without saying so
  Object.entries(booths).forEach(([theme, b]) => {
    if (!b) return;
    const host = b.members.get(b.host);
    if (b.host !== (link && link.me) && (!host || now() - host.seen > 6000) && !b.started) { closeBooth(theme, '<span class="zh">照相亭关了</span> The booth closed —'); return; }
    b.members.forEach((m, id) => { if (!m.me && id !== b.host && now() - m.seen > 6000 && !b.started) b.members.delete(id); });
  });
  drawBooths();
}, 1500);

function closeBooth(theme, why) {
  const b = booths[theme]; delete booths[theme];
  if (mine && mine.theme === theme && (!b || b.sid === mine.sid)) {
    if (!mine.shooting) { refund(why); if (mine.view) { mine.closing = true; closeModal(); } mine = null; }
  }
  drawBooths();
}
// she walks out of the booth before it starts (or the host cancels it)
function leaveBooth() {
  if (!mine) return;
  const b = booths[mine.theme];
  if (mine.shooting) return;
  if (b && b.sid === mine.sid) {
    if (b.host === link.me) { send('pb-close', { theme: mine.theme, sid: b.sid }); delete booths[mine.theme]; }
    else { b.members.delete(link.me); send('pb-leave', { theme: mine.theme, sid: b.sid }); }
  }
  refund('<span class="zh">离开照相亭</span> Left the booth —');
  mine = null; drawBooths();
}

// ---------- messages from the others in the studio ----------
export function onBroadcast(ev, p) {
  if (!link || !p || !THEMES[p.theme]) return;
  let b = booths[p.theme];
  const member = () => ({ look: p.look || { fur: 'ginger', equipped: {} }, name: String(p.name || '🐱').slice(0, 24), x: clampX(+p.x || 50), y: clampY(+p.y || 0), left: !!p.left, pose: POSES[p.pose] ? p.pose : 'smile', seen: now() });
  if (ev === 'pb-open') {
    if (b && b.sid !== p.sid) {
      // two cats opened the same booth at once: the earlier one keeps it
      const theirs = [+p.at || 0, p.id], ours = [b.at, b.host];
      if (theirs[0] < ours[0] || (theirs[0] === ours[0] && theirs[1] < ours[1])) { closeBooth(p.theme, '<span class="zh">别人先进去了</span> Someone got there first —'); b = null; }
      else return;
    }
    if (!b) b = booths[p.theme] = { sid: p.sid, host: p.id, at: +p.at || now(), started: 0, members: new Map() };
    b.members.set(p.id, member());
    if (p.started && !b.started) b.started = now();
  } else if (ev === 'pb-join' || ev === 'pb-pos') {
    if (!b || b.sid !== p.sid) return;
    if (!b.members.has(p.id) && b.members.size >= MAX_CATS) return;
    b.members.set(p.id, member());
  } else if (ev === 'pb-leave') {
    if (b && b.sid === p.sid) b.members.delete(p.id);
  } else if (ev === 'pb-close') {
    if (b && b.sid === p.sid) closeBooth(p.theme, '<span class="zh">照相亭关了</span> The booth was closed —');
  } else if (ev === 'pb-start') {
    if (!b || b.sid !== p.sid) return;
    b.started = now();
    if (mine && mine.sid === p.sid) runShoot(b, +p.in || START_IN);
  }
  drawBooths();
}

// ---------- inside the booth: walk about (tap / drag where to stand, or the arrow keys) ----------
function openView() {
  const b = booths[mine.theme], T = THEMES[mine.theme];
  if (!b) return;
  const host = b.host === link.me;
  const box = html`<div class="card stack ps-session ps-${mine.theme}">
      <div class="h-title"><span class="zh">${T.icon} ${T.zh}照相亭</span><span class="en">${T.en} booth</span></div>
      <div class="ps-stage"><canvas class="ps-live"></canvas><div class="ps-count"></div><div class="ps-flash"></div></div>
      <div class="ps-thumbs">${[0, 1, 2, 3].map(() => '<i></i>').join('')}</div>
      <p class="ps-tip"></p>
      <div class="ps-poses" role="group" aria-label="Poses">${Object.entries(POSES).map(([k, P]) => `<button type="button" class="ps-pose ${k === 'smile' ? 'on' : ''}" data-pose="${k}" title="${P.en}"><span>${P.ic}</span><small><span class="zh">${P.zh}</span><br>${P.en}</small></button>`).join('')}</div>
      <div class="ps-who"></div>
      <div class="row ps-btns" style="justify-content:center">${host ? '<button type="button" class="btn green" id="ps-start">▶ <span class="zh">开始拍照</span> Start</button>' : ''}<button type="button" class="btn white" id="ps-leave">↩ <span class="zh">离开</span> ${host ? 'Cancel' : 'Leave'}</button></div>
    </div>`;
  mine.view = box; mine.closing = false;
  const live = $('.ps-live', box); live.width = 320; live.height = 240;
  const tip = $('.ps-tip', box);
  const setTip = () => { if (!mine || mine.shooting) return; tip.innerHTML = host ? '<span class="zh">点照片里的地方走过去，再选个姿势。人齐了就按开始！</span><br>Tap where to stand and pick a pose. When everyone is ready, press Start!' : '<span class="zh">点照片里的地方走过去，再选个姿势。等房主按开始！</span><br>Tap where to stand and pick a pose — the host will press Start!'; };
  setTip();
  // where she is heading (tap / drag on the photo); she walks there
  const me = () => (booths[mine && mine.theme] || { members: new Map() }).members.get(link.me);
  let target = null, lastSent = 0, held = null;
  const aim = (e) => { const r = live.getBoundingClientRect(); target = { x: clampX(((e.clientX - r.left) / r.width) * 100), y: clampY((1 - (e.clientY - r.top) / r.height) * 100 * 0.42 - 4) }; };
  live.addEventListener('pointerdown', (e) => { e.preventDefault(); held = e.pointerId; try { live.setPointerCapture(held); } catch {} aim(e); });
  live.addEventListener('pointermove', (e) => { if (e.pointerId === held) aim(e); });
  ['pointerup', 'pointercancel'].forEach((ev) => live.addEventListener(ev, (e) => { if (e.pointerId === held) held = null; }));
  box.querySelectorAll('.ps-pose').forEach((pb) => { pb.onclick = () => {
    const m = me(); if (!m) return;
    m.pose = pb.dataset.pose; sfx.click(); heartbeat();
    box.querySelectorAll('.ps-pose').forEach((x) => x.classList.toggle('on', x === pb));
  }; });
  { const m = me(); if (m) box.querySelectorAll('.ps-pose').forEach((x) => x.classList.toggle('on', x.dataset.pose === (m.pose || 'smile'))); }
  const keys = new Set();
  const kd = (e) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { keys.add(e.key); e.preventDefault(); target = null; } };
  const ku = (e) => keys.delete(e.key);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  let last = 0;
  const frame = (t) => {
    if (!box.isConnected) { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); return; }
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    const m = me(), b2 = booths[mine && mine.theme];
    if (m) {
      let dx = 0, dy = 0;
      if (keys.has('ArrowLeft')) dx -= 1; if (keys.has('ArrowRight')) dx += 1; if (keys.has('ArrowUp')) dy += 1; if (keys.has('ArrowDown')) dy -= 1;
      if (target) { const ex = target.x - m.x, ey = target.y - m.y, d = Math.hypot(ex, ey * 2); if (d < 0.6) target = null; else { dx = ex / d; dy = (ey * 2) / d; } }
      if (dx || dy) {
        m.x = clampX(m.x + dx * 38 * dt); m.y = clampY(m.y + dy * 14 * dt); if (Math.abs(dx) > 0.2) m.left = dx < 0;
        if (now() - lastSent > 140) { lastSent = now(); heartbeat(); }
      }
    }
    if (b2) {
      live.getContext('2d').drawImage(groupScene(mine.theme, b2.members, null, !(mine && mine.snapping), Math.abs(Math.sin(t / 220))), 0, 0);
      const who = $('.ps-who', box), list = [...b2.members.values()].map((x) => x.name + (x.me ? ' (你 you)' : '')).join(' · ');
      if (who.dataset.l !== list) { who.dataset.l = list; who.innerHTML = `🐱 ${b2.members.size}/${MAX_CATS}: ${list}`; }
      const st = $('#ps-start', box); if (st) st.disabled = !!(mine && mine.shooting);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  const st = $('#ps-start', box);
  if (st) st.onclick = () => { const b2 = booths[mine.theme]; if (!b2 || b2.started) return; sfx.click(); b2.started = now(); send('pb-start', { theme: mine.theme, sid: b2.sid, in: START_IN }); runShoot(b2, START_IN); };
  $('#ps-leave', box).onclick = () => { sfx.click(); mine.closing = true; leaveBooth(); closeModal(); };
  openModal(box, { onClose: () => { if (mine && !mine.closing && !mine.shooting) leaveBooth(); } });
}

// ---------- the 4 shots: 3-2-1 (keep moving!) then snap — the same moment on every screen ----------
async function runShoot(b, delay) {
  if (!mine || mine.shooting) return;
  mine.shooting = true; mine.shot = 0;
  const box = mine.view, theme = mine.theme, T = THEMES[theme];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (sel) => box && box.isConnected ? $(sel, box) : null;
  const tip = (h) => { const e = q('.ps-tip'); if (e) e.innerHTML = h; };
  const btns = q('.ps-btns'); if (btns) btns.style.display = 'none';
  tip('<span class="zh">准备好了吗？可以一直走动哦！</span> Get ready — you can keep moving!');
  await wait(delay);
  const shots = [];
  for (let i = 0; i < 4; i++) {
    mine.shot = i; tip(SHOTS[i][1]);
    for (const n of ['3', '2', '1']) { const c = q('.ps-count'); if (c) c.textContent = n; sfx.click(); await wait(COUNT_MS / 3); }
    const c = q('.ps-count'); if (c) c.textContent = '📸';
    mine.snapping = true;
    const shot = groupScene(theme, (booths[theme] || b).members, null, false, 1);
    mine.snapping = false;
    const fl = q('.ps-flash'); if (fl) { fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); }
    sfx.coin(); shots.push(shot);
    const th = box && box.querySelectorAll('.ps-thumbs i')[i]; if (th) { const ti = document.createElement('canvas'); ti.width = 80; ti.height = 60; ti.getContext('2d').drawImage(shot, 0, 0, 80, 60); th.append(ti); }
    await wait(GAP_MS);
    const c2 = q('.ps-count'); if (c2) c2.textContent = '';
  }
  tip('<span class="zh">正在打印…</span> Printing your strip…');
  const pic = strip(theme, shots), size = (booths[theme] || b).members.size;
  const host = b.host === (link && link.me);
  if (host) send('pb-close', { theme, sid: b.sid });
  delete booths[theme];
  try {
    const entry = await Gallery.savePhoto(pic, `📸 ${T.zh} ${T.en}${size > 1 ? ` · ${size} 🐱` : ''} · 喵喵照相馆`);
    mine.paid = false; mine.closing = true; mine = null;
    closeModal(); result(pic, entry); drawBooths();
  } catch (e) {
    mine.shooting = false; refund(e.message === 'full' ? '🖼️ 相册满了 · Your gallery is full —' : '📸 <span class="zh">没存好</span> Could not save the photos —');
    mine.closing = true; mine = null; closeModal(); drawBooths();
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
  openModal(box); hydrateIcons(box); confetti(); sfx.fanfare();
}

// ---------- in the room: the studio sign, three booths (free / join / busy) and the props rack ----------
let hudEl = null;
function drawBooths() {
  if (!hudEl || !hudEl.isConnected) return;
  hudEl.querySelectorAll('.ps-booth').forEach((el) => {
    const b = booths[el.dataset.theme], go = $('.ps-go', el);
    const mineHere = mine && mine.theme === el.dataset.theme;
    const html2 = mineHere ? '🐱 <span class="zh">你在这里</span> You' : !b ? `📸 ${FEE}${coinI(12)}` : b.started ? '⏳ <span class="zh">拍照中</span> Busy' : b.members.size >= MAX_CATS ? `<span class="zh">满了</span> Full` : `➕ <span class="zh">免费加入</span> Join free ${b.members.size}/${MAX_CATS}`;
    if (go.dataset.h !== html2) { go.dataset.h = html2; go.innerHTML = html2; hydrateIcons(go); }
    el.classList.toggle('busy', !!(b && (b.started || b.members.size >= MAX_CATS)) && !mineHere);
    el.classList.toggle('joinable', !!(b && !b.started && b.members.size < MAX_CATS) && !mineHere);
  });
}
export function attach(room, { me, ch, name, onWear }) {
  link = { me, ch, name: String(name || S.get().kitten.name || '🐱').slice(0, 24) };
  const hud = html`<div class="ps-hud">
      <div class="ps-sign">📸 <span class="zh">喵喵照相馆</span> Photo Studio · <b>${FEE}</b>${coinI(14)}<small>/ strip · <span class="zh">朋友免费</span> friends free</small></div>
      <div class="ps-booths">${Object.entries(THEMES).map(([k, T]) => `<button type="button" class="ps-booth ps-${k}" data-theme="${k}"><span class="ps-bname">${T.icon} <span class="zh">${T.zh}</span><small>${T.en}</small></span><span class="ps-window"></span><span class="ps-curtain"></span><span class="ps-go"></span></button>`).join('')}</div>
      <button type="button" class="ps-rack">🎀 <span class="zh">道具</span><small>Props</small></button>
    </div>`;
  hud.querySelectorAll('.ps-booth').forEach((b) => {
    const cv = scene(b.dataset.theme, myLook(), 'happy', false, 0, true); cv.className = 'ps-peek'; $('.ps-window', b).append(cv);
    b.onclick = (e) => { e.stopPropagation(); sfx.click(); tapBooth(b.dataset.theme); };
  });
  $('.ps-rack', hud).onclick = (e) => { e.stopPropagation(); sfx.click(); openProps(() => { onWear && onWear(); }); };
  hud.addEventListener('pointerdown', (e) => e.stopPropagation());
  room.append(hud); hydrateIcons(hud); hudEl = hud; drawBooths();
}
// leaving the studio: out of any booth (coins back if it hadn't started), and the props go back on the rack
export function leaveStudio() {
  if (mine && !mine.shooting) leaveBooth();
  Object.keys(booths).forEach((k) => delete booths[k]);
  link = null; hudEl = null;
  if (!getProps()) return false;
  setProps(null);
  toast('🎀 <span class="zh">道具留在照相馆了</span> The props stay at the Photo Studio', { ms: 2200 });
  return true;
}
export const _debug = () => ({ booths, mine });
