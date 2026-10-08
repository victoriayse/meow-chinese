// The kitten's house, shared by her own home page and by visits to a friend's house:
// one fixed layout size, the furniture, the cats walking around, speech bubbles and the chat bar.
import { ITEMS, drawGrid, artGrid, ROOM_WINDOW } from './pixel.js';
import { KittenView, esc, html } from './ui.js';

export const HOUSE = { w: 720, roof: 48, room: 600, kitten: 7, decor: 5 };
const ROOM_ARROW = 40;   // screen px kept free on each side for the ◀ ▶ room arrows
export let houseK = 1;

// scale the fixed-size house to fit its box (the arrows sit outside it)
export function fitHouse(box, unit) {
  if (!box || !unit) return;
  const side = box.querySelector('.room-nav') ? (window.innerWidth <= 600 ? 28 : ROOM_ARROW) : 0;
  const k = Math.min((box.clientWidth - 2 * side) / HOUSE.w, box.clientHeight / (HOUSE.roof + HOUSE.room)) || 1;
  houseK = k;
  unit.style.setProperty('--k', k); unit.style.setProperty('--inv', 1 / k);
  box.style.setProperty('--gap', `${Math.max(0, (box.clientWidth - HOUSE.w * k) / 2)}px`);
}

// where each home item sits inside the room (percent of the room box)
export const DECOR_POS = {
  ceiling: 'left:27%;top:0',
  'wall-left': 'left:5%;top:9%',
  'wall-right': 'right:7%;top:5%',
  shelf: 'right:5%;top:24%',
  curtain: 'curtain',
  'back-left': 'left:2%;bottom:30%',
  'back-mid-left': 'left:21%;bottom:31%',
  'back-mid-right': 'right:25%;bottom:31%',
  'back-right': 'right:2%;bottom:29%',
  'front-left': 'left:2%;bottom:3%',
  plant: 'left:21%;bottom:3%',
  'toy-left': 'left:32%;bottom:2%',
  'toy-right': 'right:32%;bottom:2%',
  house: 'right:17%;bottom:3%',
  'front-right': 'right:2%;bottom:3%',
};

// the furniture standing in one room: [{ id, css, kind: 'curtain' | 'flat' | 'stand' }]
export function roomLayout(s, roomKey, roomOf) {
  const pos = s.decorPos || {};
  return (s.owned || []).filter((id) => ITEMS[id] && ITEMS[id].cat === 'decor' && !(s.decorHidden || []).includes(id) && roomOf(id) === roomKey).map((id) => {
    const it = ITEMS[id], spot = DECOR_POS[it.spot] || 'left:10%;bottom:10%', saved = pos[id];
    if (spot === 'curtain') return { id, kind: 'curtain', css: `left:${(ROOM_WINDOW.x0 + ROOM_WINDOW.x1) * 50}%;top:${ROOM_WINDOW.y0 * 100 - 4}%;width:${(ROOM_WINDOW.x1 - ROOM_WINDOW.x0) * 100 + 12}%;transform:translateX(-50%);z-index:1` };
    const flat = it.spot === 'rug' || it.spot === 'under';
    const css = saved ? `left:${saved.x}%;top:${saved.y}%` : flat ? `left:50%;bottom:${it.spot === 'rug' ? 2 : 3}%;transform:translateX(-50%)` : spot;
    return { id, kind: flat ? 'flat' : 'stand', css };
  });
}
// one piece of furniture as a page element
export function decorEl({ id, css, kind }, { putAway = false } = {}) {
  const it = ITEMS[id]; if (!it) return null;
  const c = document.createElement('canvas');
  drawGrid(c, artGrid(it.art, it.pal), HOUSE.decor);
  const wrap = document.createElement('div');
  wrap.className = 'decor';
  wrap.dataset.id = id;
  wrap.style.cssText = css;
  if (kind === 'curtain') wrap.classList.add('curtain');
  else { wrap.classList.add('movable'); if (kind === 'flat') wrap.classList.add('flat'); }
  wrap.appendChild(c);
  if (putAway) { const pa = document.createElement('button'); pa.className = 'put-away'; pa.type = 'button'; pa.title = 'Put away'; pa.textContent = '📦'; wrap.appendChild(pa); }
  return wrap;
}
// things lower down the room stand in front of things further back
export function depthOf(el, room) {
  if (el.classList.contains('flat')) return 1;
  return 2 + Math.round(((el.offsetTop + el.offsetHeight) / room.clientHeight) * 100);
}

// ---------- speech bubbles (chat) ----------
export const CHAT_MAX = 60;
export function say(wrapEl, text) {
  if (!wrapEl) return;
  wrapEl.querySelectorAll('.bubble').forEach((b) => b.remove());
  const b = html`<div class="bubble chat-bubble">${esc(String(text).slice(0, CHAT_MAX))}</div>`;
  wrapEl.appendChild(b);
  const ms = Math.min(12000, 5000 + String(text).length * 150);
  setTimeout(() => b.remove(), ms);
}

// ---------- other cats in the room (friends visiting, or the friend whose house it is) ----------
// look: { name, level, fur, equipped }  ·  where: { x, y, room, left }
export class OtherCats {
  constructor() { this.m = new Map(); this.roomEl = null; this.roomKey = null; this.raf = 0; }
  attach(roomEl, roomKey) { this.roomEl = roomEl; this.roomKey = roomKey; this.m.forEach((c) => { c.el = null; }); this.m.forEach((_, id) => this.draw(id)); }
  // the latest place we heard about is the target; the cat walks there smoothly (updates arrive in uneven bursts)
  upsert(id, data) {
    const c = this.m.get(id) || { x: 30, y: 6, room: 'living' };
    const roomChanged = data.room && data.room !== c.room;
    Object.assign(c, data);
    if (c.dx == null || roomChanged || Math.hypot(c.x - c.dx, (c.y - c.dy) * 1.5) > 25) { c.dx = c.x; c.dy = c.y; }   // first sight, new room or a big jump: just appear there
    this.m.set(id, c); this.draw(id); this.go(); return c;
  }
  remove(id) { const c = this.m.get(id); if (c && c.el) c.el.remove(); this.m.delete(id); }
  has(id) { return this.m.has(id); }
  ids() { return [...this.m.keys()]; }
  say(id, text) { const c = this.m.get(id); if (c && c.el) say($w(c.el), text); }
  go() { if (!this.raf) { this.last = 0; this.raf = requestAnimationFrame((t) => this.tick(t)); } }
  tick(t) {
    const dt = Math.min(0.05, (t - (this.last || t)) / 1000); this.last = t;
    let moving = false;
    this.m.forEach((c, id) => {
      const ex = c.x - c.dx, ey = c.y - c.dy;
      const walking = Math.abs(ex) > 0.15 || Math.abs(ey) > 0.15;
      if (walking) {
        // same speed as walking with the arrows, a little faster if it has fallen behind
        const boost = 1 + Math.min(2, Math.hypot(ex, ey) / 12);
        const sx = 32 * boost * dt, sy = 22 * boost * dt;
        c.dx += Math.max(-sx, Math.min(sx, ex)); c.dy += Math.max(-sy, Math.min(sy, ey));
        moving = true;
      } else { c.dx = c.x; c.dy = c.y; }
      if (c.kv) { c.kv.canvas.classList.toggle('walking', walking); if (Math.abs(ex) > 0.15) c.kv.setFacing(ex < 0); else c.kv.setFacing(!!c.left); }
      this.place(c);
    });
    this.raf = moving ? requestAnimationFrame((tt) => this.tick(tt)) : 0;
  }
  place(c) {
    if (!c.el) return;
    c.el.style.left = `${c.dx}%`; c.el.style.bottom = `${c.dy}%`;
    c.el.style.zIndex = 2 + Math.round(100 - c.dy);
  }
  draw(id) {
    const c = this.m.get(id); if (!c) return;
    const here = this.roomEl && this.roomEl.isConnected && c.room === this.roomKey && c.look;
    if (!here) { if (c.el) { c.el.remove(); c.el = null; } return; }
    if (!c.el || !c.el.isConnected) {
      const el = html`<div class="vcat"><div class="kitten-wrap"><div class="kflip"></div><div class="nametag">${esc(c.look.name || '🐱')}<span class="lv">Lv${c.look.level || 1}</span></div></div></div>`;
      const kv = new KittenView({ scale: HOUSE.kitten, fur: c.look.fur || 'ginger', equipped: { ...(c.look.equipped || {}) } });
      kv.setMood('happy'); kv.setFacing(!!c.left);
      el.querySelector('.kflip').appendChild(kv.canvas);
      c.kv = kv; c.el = el;
      this.roomEl.appendChild(el);
    }
    this.place(c);
  }
}
const $w = (el) => el.querySelector('.kitten-wrap');

// ---------- chat bar at the bottom of the house ----------
export function chatBar(onSend) {
  const bar = html`<form class="house-chat" autocomplete="off">
      <input type="text" maxlength="${CHAT_MAX}" placeholder="说点什么… Say something" enterkeyhint="send">
      <button type="submit" class="btn green small">➤ <span class="zh">说</span></button>
    </form>`;
  const inp = bar.querySelector('input');
  bar.onsubmit = (e) => { e.preventDefault(); const t = inp.value.trim(); if (!t) return; inp.value = ''; onSend(t); };
  return bar;
}

// ---------- walking: arrow keys and the on-screen arrows ----------
// onStep(dx, dy, dt) is called every frame while a direction is held; onStop() when she lets go
export function walker(dpad, { onStep, onStop, canWalk = () => true, isAlive }) {
  const held = new Set();
  let raf = 0, lastT = 0;
  const loop = (t) => {
    if (!isAlive()) { held.clear(); raf = 0; onStop(); return; }
    const dt = Math.min(0.05, (t - (lastT || t)) / 1000); lastT = t;
    let dx = 0, dy = 0;
    if (held.has('left')) dx -= 1; if (held.has('right')) dx += 1;
    if (held.has('up')) dy += 1; if (held.has('down')) dy -= 1;
    onStep(dx, dy, dt);
    if (held.size) raf = requestAnimationFrame(loop);
    else { raf = 0; lastT = 0; onStop(); }
  };
  const press = (d) => { if (!canWalk()) return; held.add(d); if (!raf) raf = requestAnimationFrame(loop); };
  const release = (d) => held.delete(d);
  const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  const kd = (e) => {
    if (!isAlive()) { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); return; }
    const d = KEYS[e.key];
    if (!d || /INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || '') || !document.querySelector('#modal').classList.contains('hidden')) return;
    e.preventDefault(); press(d);
  };
  const ku = (e) => { const d = KEYS[e.key]; if (d) release(d); };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  window.addEventListener('blur', () => held.clear(), { once: true });
  dpad.querySelectorAll('button').forEach((b) => {
    const d = b.dataset.d;
    const down = () => { b.classList.add('down'); press(d); };
    const up = () => { b.classList.remove('down'); release(d); };
    b.addEventListener('touchstart', (e) => { e.preventDefault(); down(); }, { passive: false });
    b.addEventListener('touchend', (e) => { e.preventDefault(); up(); }, { passive: false });
    b.addEventListener('touchcancel', up);
    b.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') return; e.preventDefault(); b.setPointerCapture(e.pointerId); down(); });
    b.addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch') up(); });
    b.addEventListener('pointercancel', (e) => { if (e.pointerType !== 'touch') up(); });
    b.addEventListener('lostpointercapture', (e) => { if (e.pointerType !== 'touch') up(); });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  return { held };
}
export const DPAD = `<div class="dpad"><button data-d="up" aria-label="Up">▲</button><button data-d="left" aria-label="Left">◀</button><button data-d="down" aria-label="Down">▼</button><button data-d="right" aria-label="Right">▶</button></div>`;
