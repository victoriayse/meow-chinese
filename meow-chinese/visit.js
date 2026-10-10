// Live visits: a friend's kitten walks around your house (and you around theirs), chatting in speech bubbles.
// Each house is a private realtime channel "house:<owner id>" that only the owner and their friends can join.
//   knock  visitor -> house   { id, look, x, y, room, left }      "I'm here" (the owner answers with the house)
//   house  owner -> visitors  { to?, house, host: { id, look, x, y, room, left } }
//   pos    anyone            { id, look, x, y, room, left }       moves (a few times a second while walking)
//   chat   anyone            { id, text }
//   pets   owner -> visitors  { id, pets: [...] }                where the owner's pets are (pets.js snapshot)
//   radio  owner -> visitors  { id, radio: { on, path, startedAt } }  the owner's radio (friends hear it too)
//   invite friend -> my house  { id, name }                   "come to my house!" (sent to MY house channel)
//   bye    visitor           { id }
import * as S from './state.js';
import * as Auth from './auth.js';
import { managing } from './cloud.js';
import { Channel } from './rt.js';
import { drawRoom, drawRoof } from './pixel.js';
import { $, html, esc, toast, KittenView, hydrateIcons, openModal, closeModal } from './ui.js';
import { sfx } from './audio.js';
import { HOUSE, fitHouse, houseK, roomLayout, decorEl, depthOf, OtherCats, say, chatBar, walker, DPAD, chatLog, wirePlayable, applyPower, emoteIcon, seatSpot, blanket, freeSlot, hearNote, PetLayer, roomArrowsHtml, inPool, stackDecor } from './house.js';
import * as Radio from './radio.js';

const isNight = () => { const h = new Date().getHours(); return h >= 18 || h < 5; };
export function myLook() {
  const s = S.get(), k = s.kitten;
  return { name: s.childName && !String(k.name).includes(s.childName) ? `${s.childName}的${k.name}` : k.name, level: S.level(), fur: k.fur, equipped: { ...(k.equipped || {}) } };
}
const clampPos = (p) => ({ ...p, x: Math.max(6, Math.min(94, p.x)), y: Math.max(1, Math.min(S.roomMaxY(p.room || 'living'), p.y)) });
// send at most ~8 moves a second, and always the last one
function throttle(fn, ms = 120) {
  let last = 0, t = null, pending = null;
  return (arg) => {
    pending = arg; const now = Date.now();
    if (now - last >= ms) { last = now; fn(pending); pending = null; }
    else if (!t) t = setTimeout(() => { t = null; last = Date.now(); if (pending) fn(pending); pending = null; }, ms - (now - last));
  };
}

// =====================================================================
// HOST: my own house is open to friends whenever the app is open
// =====================================================================
export const visitors = new OtherCats();      // friends' kittens in my house
let hostCh = null, hostUser = null, api = null;
export function startHosting(hooks) {
  api = hooks;
  const check = () => {
    const u = Auth.user(), want = u && Auth.session() && !managing() && !document.hidden;
    if (want && hostCh && hostUser === u.id) return;
    if (hostCh) { hostCh.close(); hostCh = null; hostUser = null; visitors.ids().forEach((id) => visitors.remove(id)); api.changed && api.changed(); }
    if (!want) return;
    hostUser = u.id;
    hostCh = new Channel(`house:${u.id}`, {
      presenceKey: u.id,
      onStatus: (st) => { if (st === 'joined') hostCh.track({ id: u.id, host: true }); },
      onBroadcast: (ev, p) => {
        if (!p || !p.id || p.id === hostUser) return;
        if (ev === 'knock') {
          const fresh = !visitors.has(p.id);
          visitors.upsert(p.id, { look: p.look, ...clampPos(p) });
          sendHouse(p.id);
          if (fresh) { sfx.coin(); api.arrived && api.arrived(p.id, p.look || {}); }
          api.changed && api.changed();
        } else if (ev === 'pos') {
          visitors.upsert(p.id, { ...(p.look ? { look: p.look } : {}), ...clampPos(p) });
        } else if (ev === 'chat') {
          const c = visitors.m.get(p.id);
          visitors.say(p.id, p.text);
          api.chat && api.chat(p.id, String(p.text || '').slice(0, 60), (c && c.look) || {}, !!(c && c.el));
        } else if (ev === 'typing-stop') {
          stopTyping(p.id);
        } else if (ev === 'typing') {
          typingFrom.set(p.id, Date.now()); typingListeners.forEach((fn) => fn(p.id));
        } else if (ev === 'note') {
          if (api.inHouse && api.inHouse()) hearNote(visitors.roomEl, p.i);
        } else if (ev === 'emote') {
          visitors.emote(p.id, p.mood);
          const c = visitors.m.get(p.id);
          api.chat && api.chat(p.id, emoteIcon(p.mood), (c && c.look) || {}, true);
        } else if (ev === 'invite') {
          api.invited && api.invited(p.id, String(p.name || '').slice(0, 40));
        } else if (ev === 'bye') {
          if (visitors.has(p.id)) { const c = visitors.m.get(p.id); visitors.remove(p.id); api.left && api.left(p.id, (c && c.look) || {}); api.changed && api.changed(); }
        }
      },
      onPresence: (present, joins, leaves) => {
        leaves.forEach((id) => { if (id !== hostUser && visitors.has(id)) { const c = visitors.m.get(id); visitors.remove(id); api.left && api.left(id, (c && c.look) || {}); } });
        if (leaves.length) api.changed && api.changed();
      },
    });
    hostCh.open();
  };
  check();
  setInterval(check, 5000);
  document.addEventListener('visibilitychange', check);
}
function sendHouse(to) {
  if (!hostCh || !api) return;
  hostCh.send('house', { to, house: api.house(), host: { id: hostUser, look: myLook(), ...api.myPos() } });
}
export const hostResendHouse = () => { if (visitors.ids().length) sendHouse(null); };
export const hostMove = throttle((pos) => { if (hostCh && visitors.ids().length) hostCh.send('pos', { id: hostUser, ...pos }); });
// ---------- "typing…" in the phone's Messages ----------
// my friend is typing to me: they send 'typing' to my house channel every couple of seconds
const typingFrom = new Map(), typingListeners = new Set();
export const onTyping = (fn) => { typingListeners.add(fn); return () => typingListeners.delete(fn); };
export const isTyping = (friendId) => Date.now() - (typingFrom.get(friendId) || 0) < 4000;
export const stopTyping = (friendId) => { typingFrom.delete(friendId); typingListeners.forEach((fn) => fn(friendId)); };
// I'm typing to a friend: open a line to their house channel (closed again when I go quiet)
const typingLines = new Map();
let lastTyping = 0;
export function typingTo(friendId) {
  const me = (Auth.user() || {}).id; if (!me || !friendId || managing()) return;
  let line = typingLines.get(friendId);
  if (!line) {
    const ch = new Channel(`house:${friendId}`, { presenceKey: `${me}-typing`, onStatus: (st) => { if (st === 'joined') ch.send('typing', { id: me }); } });
    line = { ch, timer: null }; typingLines.set(friendId, line); ch.open();
  }
  clearTimeout(line.timer); line.timer = setTimeout(() => { line.ch.close(); typingLines.delete(friendId); }, 20000);
  if (Date.now() - lastTyping > 2000) { lastTyping = Date.now(); line.ch.send('typing', { id: me }); }
}
// invite a friend over: knock on their house channel with an 'invite' (they get a pop-up to come to mine)
export function inviteFriend(friendId) {
  const me = (Auth.user() || {}).id; if (!me || !friendId || managing()) return false;
  const ch = new Channel(`house:${friendId}`, { presenceKey: `${me}-invite`, onStatus: (st) => { if (st === 'joined') { ch.send('invite', { id: me, name: myLook().name }); setTimeout(() => ch.close(), 1500); } } });
  ch.open(); setTimeout(() => ch.close(), 8000);
  return true;
}
export function doneTyping(friendId) {
  const me = (Auth.user() || {}).id, line = typingLines.get(friendId);
  if (line && me) line.ch.send('typing-stop', { id: me });
  lastTyping = 0;
}
export function hostRadio(radio) { if (hostCh && visitors.ids().length) hostCh.send('radio', { id: hostUser, radio }); }
export function hostPets(pets) { if (hostCh && visitors.ids().length) hostCh.send('pets', { id: hostUser, pets }); }
export function hostNote(i) { if (hostCh && visitors.ids().length) hostCh.send('note', { id: hostUser, i }); }
export function hostEmote(mood) { if (hostCh && visitors.ids().length) hostCh.send('emote', { id: hostUser, mood }); }
export function hostSay(text) { if (hostCh && visitors.ids().length) hostCh.send('chat', { id: hostUser, text }); }
export const visitorCount = () => visitors.ids().length;

// =====================================================================
// VISITOR: walk around a friend's house
// =====================================================================
export function visitScreen({ go, id: hostId, name = '' }) {
  const me = (Auth.user() || {}).id;
  const n = html`<section class="visit-home">
      <div class="visit-top"><button class="btn white small" id="leave">← <span class="zh">回家</span> Leave</button><button class="btn white small visit-phone" id="vphone" title="Meow phone">📱</button>
        <div class="visit-title"><span class="zh">🏠 ${esc(name || '朋友')}的家</span><small id="vt-sub">敲门中… Knocking…</small></div></div>
      <div class="stage in-house"><div class="house" id="house"></div></div>
      <div class="visit-log" id="vlog"></div>
      <div class="visit-chat" id="vchat"></div>
    </section>`;
  const box = $('#house', n), sub = $('#vt-sub', n);
  const others = new OtherCats();
  let house = null, host = null, roomKey = 'living', mine = { x: 30, y: 6, room: 'living', left: false };
  let myWrap = null, myEl = null, myKv = null, gotHouse = false, hostHere = false, petLayer = null;

  const ch = new Channel(`house:${hostId}`, {
    presenceKey: me,
    onStatus: (st, info) => {
      if (st === 'joined') { ch.track({ id: me }); knock(); }
      if (st === 'denied') { sub.textContent = '不能进去 · Can\'t visit this house'; }
    },
    onBroadcast: (ev, p) => {
      if (!p || p.id === me) return;
      if (ev === 'house' && (!p.to || p.to === me)) {
        house = p.house || { rooms: {}, open: ['living'] };
        if (p.host) { host = p.host; others.upsert(host.id, { look: host.look, ...clampPos(host) }); }
        hostHere = true;
        if (!gotHouse) { gotHouse = true; roomKey = (p.host && p.host.room) || 'living'; mine.room = roomKey; sfx.coin(); }
        sub.textContent = '';
        render(); hearRadio();
      } else if (ev === 'pos' || ev === 'knock') {
        others.upsert(p.id, { ...(p.look ? { look: p.look } : {}), ...clampPos(p) });
        if (ev === 'knock' && gotHouse) sendMine();          // a new visitor: let them see me
      } else if (ev === 'chat') {
        others.say(p.id, p.text);
        const c = others.m.get(p.id);
        logLine((c && c.look && c.look.name) || '朋友', p.text, false);
      } else if (ev === 'radio') {
        if (house) house.radio = p.radio || { on: false };
        hearRadio();
      } else if (ev === 'pets') {
        if (house) house.pets = p.pets || [];
        if (petLayer) petLayer.update(house ? house.pets : []);
      } else if (ev === 'note') {
        hearNote($('#room', box), p.i);
      } else if (ev === 'emote') {
        others.emote(p.id, p.mood);
        const c = others.m.get(p.id);
        logLine((c && c.look && c.look.name) || '朋友', emoteIcon(p.mood), false);
      } else if (ev === 'bye') others.remove(p.id);
    },
    onPresence: (present, joins, leaves) => {
      leaves.forEach((id) => {
        if (id === hostId) { hostHere = false; others.remove(id); sub.textContent = '朋友离开了 · Your friend left'; Radio.stop(); }
        else others.remove(id);
      });
      if (joins.includes(hostId) && gotHouse && !hostHere) knock();
    },
  });
  // this visit's chat, newest at the bottom (only kept while you are in the house)
  const vlog = chatLog([]);
  $('#vlog', n).appendChild(vlog.el);
  $('#vlog', n).insertAdjacentHTML('beforeend', DPAD);
  // the arrows (set up once; they move whichever room she is in)
  walker($('.dpad', n), {
    isAlive: () => n.isConnected,
    canWalk: () => !!(myEl && myEl.isConnected),
    onStep: (dx, dy, dt) => {
      if (mine.seat) { mine.seat = null; mine.slot = 0; mine.y = Math.min(mine.y, 28); }   // the arrows make her hop off
      mine.x += dx * 32 * dt; mine.y += dy * 22 * dt;
      if (dx) { mine.left = dx < 0; myKv.setFacing(mine.left); }
      myKv.canvas.classList.add('walking');
      place(); sendMove({ id: me, ...mine });
    },
    onStop: () => { if (myKv) myKv.canvas.classList.remove('walking'); sendMine(); },
  });

  const logLine = (who, text, mine) => vlog.add(who, text, mine);
  const knock = () => ch.send('knock', { id: me, look: myLook(), ...mine });
  const sendMine = () => ch.send('pos', { id: me, look: myLook(), ...mine });
  const sendMove = throttle((p) => ch.send('pos', p));
  ch.open();
  // keep knocking until the friend answers; if nobody is home, say so
  let tries = 0;
  const kt = setInterval(() => {
    if (!n.isConnected) return clearInterval(kt);
    if (gotHouse) return clearInterval(kt);
    tries++; knock();
    if (tries >= 4) { sub.innerHTML = '朋友现在不在家 · Your friend isn\'t home right now<br><small>朋友要打开喵喵中文才可以串门 · They need to have the app open</small>'; }
  }, 3000);

  function render() {
    const info = S.roomInfo(roomKey), open = house.open || ['living'];
    box.innerHTML = `<div class="house-unit ${info.outdoor ? 'outdoor' : ''} ${info.bare || info.noRoof ? 'bare' : ''}" id="hunit"><canvas class="roof" id="roof"></canvas>
        <div class="room-name">${info.icon} <span class="zh">${info.zh}</span> ${info.en}</div>
        <div class="room" id="room" data-room="${roomKey}"><canvas class="room-bg" id="roombg"></canvas></div>
      </div>${roomArrowsHtml(roomKey, (k) => open.includes(k), { showLocked: false })}`;
    const unit = $('#hunit', box), room = $('#room', box);
    (house.rooms[roomKey] || []).forEach((e) => { const el = decorEl(e); if (el) room.appendChild(el); });
    wirePlayable(room, (i) => ch.send('note', { id: me, i }));
    // a friend's photo frame: tap to see the photo bigger
    room.addEventListener('click', (e) => {
      const d = e.target.closest('.decor.frame'); const img = d && d.querySelector('.frame-photo'); if (!img) return;
      const v = html`<div class="card stack" style="align-items:center"><div class="frame-preview big"><img src="${img.src}" alt=""></div><button class="btn white" id="pc">关闭 Close</button></div>`;
      $('#pc', v).onclick = closeModal; openModal(v);
    });
    room.addEventListener('click', (e) => {
      const d = e.target.closest('.decor.seat'); if (!d) return;
      if (mine.seat === d.dataset.id) return;
      const taken = others.ids().map((id) => others.m.get(id)).filter((c) => c && c.room === roomKey);
      const slot = freeSlot(d.dataset.id, taken);
      if (slot < 0) { sfx.miss(); return toast('<span class="zh">坐满了！</span> No room — someone is already there'); }
      mine.seat = d.dataset.id; mine.slot = slot; place(); myKv.jump(); sfx.click(); sendMine();
    });
    // my kitten
    myEl = html`<div class="vcat me"><div class="kitten-wrap"><div class="kflip"></div><div class="nametag">${esc(S.get().kitten.name)}<span class="lv">Lv${S.level()}</span></div></div></div>`;
    myKv = new KittenView({ scale: HOUSE.kitten }); myKv.setMood('happy'); myKv.setFacing(mine.left);
    myEl.querySelector('.kflip').appendChild(myKv.canvas);
    myWrap = myEl.querySelector('.kitten-wrap');
    room.appendChild(myEl);
    others.attach(room, roomKey);
    fitHouse(box, unit);
    drawRoom($('#roombg', box), isNight(), roomKey, (house.styles || {})[roomKey]); drawRoof($('#roof', box));
    room.querySelectorAll('.decor').forEach((el) => { el.style.zIndex = depthOf(el, room); }); stackDecor(room);
    const pw = house.power || {};
    applyPower(room, { dark: !!(pw.dark || {})[roomKey], off: pw.off || {} });
    place();
    // the friend's pets wandering around
    petLayer = new PetLayer(room, roomKey, { onClick: (kind) => { const p = (house.pets || []).find((x) => x.kind === kind); if (p) { sfx.coin(); toast(`🤍 <span class="zh">${esc(p.name)}</span>`, { ms: 1500 }); } } });
    petLayer.update(house.pets || []);
    room.querySelectorAll('.decor.radio').forEach((d) => d.classList.toggle('playing', !!(house.radio || {}).on));
    box.querySelectorAll('.room-nav').forEach((b) => { b.onclick = () => { roomKey = b.dataset.room; mine.room = roomKey; mine.seat = null; sfx.click(); render(); sendMine(); }; });
    hydrateIcons(box);
  }
  // the friend's radio: play it here too (same song, same part of it)
  function hearRadio() {
    const r = (house && house.radio) || { on: false };
    Radio.listen(r);
    box.querySelectorAll('.decor.radio').forEach((d) => d.classList.toggle('playing', !!r.on));
  }
  function place() {
    const room = $('#room', box), spot = mine.seat && seatSpot(room, mine.seat, mine.slot);
    myEl.classList.toggle('lying', !!(spot && spot.lie)); myEl.classList.toggle('seated', !!spot);
    if (myKv) myKv.setPose(spot ? spot.pose : null); myEl.dataset.pose = (spot && spot.pose) || '';
    if (room) room.querySelectorAll('.decor.seat').forEach((d) => { if (!others.ids().some((id) => (others.m.get(id) || {}).seat === d.dataset.id)) blanket(room, d.dataset.id, !!(spot && spot.lie && d.dataset.id === mine.seat)); });
    if (spot) { myEl.classList.remove('swimming'); mine.x = spot.x; mine.y = spot.y; myEl.style.left = `${spot.x}%`; myEl.style.bottom = `${spot.y}%`; myEl.style.zIndex = spot.z; return; }
    Object.assign(mine, clampPos(mine));
    myEl.style.left = `${mine.x}%`; myEl.style.bottom = `${mine.y}%`; myEl.style.zIndex = 2 + Math.round(100 - mine.y);
    myEl.classList.toggle('swimming', inPool(room, mine.x, mine.y));
  }
  // chat
  $('#vchat', n).appendChild(chatBar((text) => {
    if (myWrap) say(myWrap, text);
    logLine(S.get().kitten.name, text, true);
    ch.send('chat', { id: me, text }); sfx.click();
  }, (mood) => {
    if (myKv) { myKv.flash(mood, 3000); myKv.jump(); }
    logLine(S.get().kitten.name, emoteIcon(mood), true);
    ch.send('emote', { id: me, mood });
  }));
  const refit = () => { if (!n.isConnected) { window.removeEventListener('resize', refit); return; } fitHouse(box, $('#hunit', box)); };
  window.addEventListener('resize', refit);
  // leaving: say goodbye and close the line
  const leave = () => { Radio.stop(); clearInterval(kt); ch.send('bye', { id: me }); setTimeout(() => ch.close(), 150); };
  $('#leave', n).onclick = () => { leave(); go('friend', { id: hostId }); };
  $('#vphone', n).onclick = () => import('./phone.js').then((P) => P.openPhone({ start: 'home' }));   // the phone works at a friend's house too
  const gone = setInterval(() => { if (!n.isConnected) { clearInterval(gone); leave(); } }, 1000);
  return n;
}
