// The kitten's house, shared by her own home page and by visits to a friend's house:
// one fixed layout size, the furniture, the cats walking around, speech bubbles and the chat bar.
import { ITEMS, drawGrid, artGrid, ROOM_WINDOW, kittenGrid } from './pixel.js';
import { get as getState } from './state.js';
import { KittenView, esc, html } from './ui.js';
import { sfx } from './audio.js';

export const HOUSE = { w: 720, roof: 48, room: 600, kitten: 5, decor: 5 };   // kitten 30% smaller than before (was 7)
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
  bench: 'left:9%;bottom:25%',
};

// the furniture standing in one room: [{ id, css, kind: 'curtain' | 'flat' | 'stand' }]
export function roomLayout(s, roomKey, roomOf) {
  const pos = s.decorPos || {};
  return (s.owned || []).filter((id) => ITEMS[id] && ITEMS[id].cat === 'decor' && !(s.decorHidden || []).includes(id) && roomOf(id) === roomKey).map((id) => {
    const it = ITEMS[id], spot = DECOR_POS[it.spot] || 'left:10%;bottom:10%', saved = pos[id];
    // window coverings hang from just above the window to just below it, as wide as the window plus a little
    if (spot === 'curtain') return { id, kind: 'curtain', css: `left:${(ROOM_WINDOW.x0 + ROOM_WINDOW.x1) * 50}%;top:${ROOM_WINDOW.y0 * 100 - 4}%;width:${(ROOM_WINDOW.x1 - ROOM_WINDOW.x0) * 100 + 12}%;height:${(ROOM_WINDOW.y1 - ROOM_WINDOW.y0) * 100 + 7}%;transform:translateX(-50%);z-index:1` };
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
  if (it.playable) wrap.classList.add('playable');
  if (it.seat) wrap.classList.add('seat');
  if (it.power) { wrap.dataset.power = it.power; if (it.power === 'tv') wrap.appendChild(Object.assign(document.createElement('i'), { className: 'tv-screen' })); }
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
  // it grows upwards from above the head; slide it sideways so it stays inside the room (the tail keeps pointing at the kitten)
  const room = wrapEl.closest('.room');
  if (room) {
    const r = b.getBoundingClientRect(), R = room.getBoundingClientRect(), pad = 6;
    let shift = 0;
    if (r.left < R.left + pad) shift = R.left + pad - r.left;
    else if (r.right > R.right - pad) shift = R.right - pad - r.right;
    if (shift) {
      const scale = r.width / (b.offsetWidth || r.width) || 1;          // screen px per bubble px
      b.style.marginLeft = `${shift / scale}px`;
      b.style.setProperty('--tailx', `${-shift / scale}px`);
    }
  }
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
    if (c.dx == null || roomChanged || c.seat || Math.hypot(c.x - c.dx, (c.y - c.dy) * 1.5) > 25) { c.dx = c.x; c.dy = c.y; }   // first sight, new room or a big jump: just appear there
    this.m.set(id, c); this.draw(id); this.go(); return c;
  }
  remove(id) { const c = this.m.get(id); if (c && c.el) c.el.remove(); this.m.delete(id); }
  has(id) { return this.m.has(id); }
  ids() { return [...this.m.keys()]; }
  say(id, text) { const c = this.m.get(id); if (c && c.el) say($w(c.el), text); }
  emote(id, mood) { const c = this.m.get(id); if (c && c.kv && EMOTES.some((e) => e[0] === mood)) { c.kv.flash(mood, 3000); c.kv.jump(); } }
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
    const spot = c.seat && seatSpot(this.roomEl, c.seat, c.slot);
    if (spot) { c.x = c.dx = spot.x; c.y = c.dy = spot.y; }
    c.el.style.left = `${c.dx}%`; c.el.style.bottom = `${c.dy}%`;
    c.el.style.zIndex = spot ? spot.z : 2 + Math.round(100 - c.dy);
    c.el.classList.toggle('lying', !!(spot && spot.lie)); c.el.classList.toggle('seated', !!spot);
    if (c.kv) c.kv.setPose(spot ? spot.pose : null); c.el.dataset.pose = (spot && spot.pose) || '';
    if (c.bedShown && c.bedShown !== (spot && spot.lie && c.seat)) { blanket(this.roomEl, c.bedShown, false); c.bedShown = null; }
    if (spot && spot.lie) { blanket(this.roomEl, c.seat, true); c.bedShown = c.seat; }
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
// six faces she can send with the emoji button
export const EMOTES = [['e-laugh', '😆'], ['e-wow', '😮'], ['e-angry', '😠'], ['e-wink', '😉'], ['e-shy', '☺️'], ['e-cool', '😎']];
export const emoteIcon = (m) => (EMOTES.find((e) => e[0] === m) || [0, ''])[1];
// a kitten's head with an expression (her own fur and hat), as a little picture
export function catFace(mood, px = 4) {
  const k = (getState() || {}).kitten || {};
  const g = kittenGrid(k.fur || 'ginger', mood, k.equipped || {}, 0).slice(5, 25).map((r) => r.slice(2, 31));   // just the head
  const c = document.createElement('canvas'); c.className = 'cat-face';
  drawGrid(c, g, px);
  return c;
}
export function chatBar(onSend, onEmote) {
  const bar = html`<form class="house-chat" autocomplete="off">
      ${onEmote ? `<div class="emote-wrap"><button type="button" class="btn white small emote-btn" aria-label="Faces"></button>
        <div class="emote-pick hidden">${EMOTES.map(([k, e]) => `<button type="button" data-emote="${k}" aria-label="${e}"></button>`).join('')}</div></div>` : ''}
      <input type="text" maxlength="${CHAT_MAX}" placeholder="说点什么… Say something" enterkeyhint="send">
      <button type="submit" class="btn green small">➤ <span class="zh">说</span></button>
    </form>`;
  const inp = bar.querySelector('input');
  bar.onsubmit = (e) => { e.preventDefault(); const t = inp.value.trim(); if (!t) return; inp.value = ''; onSend(t); };
  if (onEmote) {
    const pick = bar.querySelector('.emote-pick');
    bar.querySelector('.emote-btn').appendChild(catFace('happy', 1));
    pick.querySelectorAll('[data-emote]').forEach((b) => b.appendChild(catFace(b.dataset.emote, 1)));
    bar.querySelector('.emote-btn').onclick = () => pick.classList.toggle('hidden');
    pick.addEventListener('click', (e) => { const b = e.target.closest('[data-emote]'); if (!b) return; pick.classList.add('hidden'); onEmote(b.dataset.emote); });
  }
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

// furniture you can play (the piano): tap it for a random note — not while moving furniture
export function wirePlayable(roomEl, onPlay) {
  roomEl.addEventListener('click', (e) => {
    const d = e.target.closest('.decor.playable');
    if (!d || roomEl.classList.contains('arranging')) return;
    const { i, name } = sfx.piano();
    const n = document.createElement('div');
    n.className = 'music-note'; n.textContent = `♪ ${name}`;
    n.style.left = `${d.offsetLeft + d.offsetWidth * (0.25 + Math.random() * 0.5)}px`; n.style.top = `${d.offsetTop}px`;
    roomEl.appendChild(n); setTimeout(() => n.remove(), 1400);
    d.classList.remove('bounce'); void d.offsetWidth; d.classList.add('bounce');
    if (onPlay) onPlay(i, name);
  });
}
// a friend played the piano: we hear the same note, and see it float up if the piano is in this room
export function hearNote(roomEl, i) {
  const { name } = sfx.piano(i);
  const d = roomEl && roomEl.isConnected && roomEl.querySelector('.decor.playable');
  if (!d) return;
  const n = document.createElement('div');
  n.className = 'music-note'; n.textContent = `♪ ${name}`;
  n.style.left = `${d.offsetLeft + d.offsetWidth * (0.25 + Math.random() * 0.5)}px`; n.style.top = `${d.offsetTop}px`;
  roomEl.appendChild(n); setTimeout(() => n.remove(), 1400);
}

// ---------- chat history: who said what while you are in the house ----------
export function chatLog(entries) {
  const el = html`<div class="chat-log"></div>`;
  const line = ({ who, text, mine, at }) => {
    const t = new Date(at), hm = `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`;
    return html`<div class="vl-line ${mine ? 'mine' : ''}"><b>${esc(who)}</b><span class="zh">${esc(String(text).slice(0, CHAT_MAX))}</span><small>${hm}</small></div>`;
  };
  const empty = () => { if (!entries.length) el.innerHTML = '<div class="vl-empty">💬 聊天记录会出现在这里 · Chat shows up here</div>'; };
  entries.forEach((e) => el.appendChild(line(e))); empty();
  setTimeout(() => { el.scrollTop = el.scrollHeight; }, 0);
  return {
    el,
    add(who, text, mine) {
      const e = { who, text, mine, at: Date.now() };
      entries.push(e); while (entries.length > 100) entries.shift();
      const ph = el.querySelector('.vl-empty'); if (ph) ph.remove();
      el.appendChild(line(e)); while (el.children.length > 100) el.firstElementChild.remove();
      el.scrollTop = el.scrollHeight;
    },
  };
}

// ---------- lights and TV ----------
// look: { dark: is the room's ceiling light off, off: { id: true } furniture switched off }
export function applyPower(roomEl, { dark = false, off = {} } = {}) {
  if (!roomEl) return;
  roomEl.querySelectorAll('.decor[data-power]').forEach((d) => d.classList.toggle('off', !!off[d.dataset.id]));
  let shade = roomEl.querySelector('.room-dark');
  if (!shade) { shade = document.createElement('div'); shade.className = 'room-dark'; roomEl.appendChild(shade); }
  roomEl.classList.toggle('lights-off', !!dark);
  // lamps that are still on glow in the dark
  roomEl.querySelectorAll('.lamp-glow').forEach((g) => g.remove());
  if (dark) roomEl.querySelectorAll('.decor[data-power="light"]:not(.off), .decor[data-power="tv"]:not(.off)').forEach((d) => {
    const g = document.createElement('div');
    g.className = `lamp-glow ${d.dataset.power}`;
    g.style.left = `${d.offsetLeft + d.offsetWidth / 2}px`; g.style.top = `${d.offsetTop + d.offsetHeight * (d.dataset.power === 'tv' ? 0.4 : 0.25)}px`;
    roomEl.appendChild(g);
  });
}
// tap a lamp or the TV to switch it (not while moving furniture)
export function wirePower(roomEl, onToggle) {
  roomEl.addEventListener('click', (e) => {
    const d = e.target.closest('.decor[data-power]');
    if (!d || roomEl.classList.contains('arranging')) return;
    sfx.click(); onToggle(d.dataset.id);
  });
}

// ---------- sitting on furniture ----------
// the spot (in room %) where a kitten sits on this piece, and the layer just in front of it
export function seatSpot(roomEl, id, slot = 0) {
  const el = roomEl && roomEl.querySelector(`.decor.seat[data-id="${id}"]`), seat = ITEMS[id] && ITEMS[id].seat;
  if (!el || !seat) return null;
  const W = roomEl.clientWidth, H = roomEl.clientHeight;
  const sx = seat.spots ? seat.spots[Math.min(slot || 0, seat.spots.length - 1)] : seat.x;
  return {
    back: !!seat.back, pose: seat.lie ? 'lie' : seat.back ? 'back' : seat.side ? ((slot || 0) === 0 ? 'side-r' : 'side-l') : null,
    x: ((el.offsetLeft + el.offsetWidth * sx) / W) * 100,
    y: ((H - (el.offsetTop + el.offsetHeight * seat.y)) / H) * 100,
    z: (parseInt(el.style.zIndex, 10) || 50) + 1, lie: !!seat.lie, el,
  };
}
// the bed's blanket drawn over a kitten lying in it
export function blanket(roomEl, id, on) {
  const el = roomEl && roomEl.querySelector(`.decor.seat[data-id="${id}"]`), seat = ITEMS[id] && ITEMS[id].seat;
  let b = roomEl && roomEl.querySelector(`.blanket[data-for="${id}"]`);
  if (!on || !el || !seat || !seat.blanket) { if (b) b.remove(); return; }
  if (!b) {
    const [r0, r1, c0, c1] = seat.blanket, it = ITEMS[id];
    const g = artGrid(it.art, it.pal).map((row, y) => row.map((c, x) => (y >= r0 && y < r1 && x >= c0 && x < c1 ? c : null)));
    b = document.createElement('canvas'); b.className = 'blanket'; b.dataset.for = id;
    drawGrid(b, g, HOUSE.decor);
    roomEl.appendChild(b);
  }
  // laid over the bed, one layer above the kitten in it
  b.style.left = `${el.offsetLeft}px`; b.style.top = `${el.offsetTop}px`;
  b.style.zIndex = (parseInt(el.style.zIndex, 10) || 50) + 2;
}

// the first free place on a piece of furniture (a sofa has two); taken = [{ seat, slot }]
export function freeSlot(id, taken) {
  const seat = ITEMS[id] && ITEMS[id].seat; const n = seat && seat.spots ? seat.spots.length : 1;
  for (let i = 0; i < n; i++) if (!taken.some((t) => t && t.seat === id && (t.slot || 0) === i)) return i;
  return -1;   // full
}
