import { wireMall, openMallDirectory } from './mall-play.js';
import { openPoster, openVideo, openRadio, openBoard } from './media.js';
import * as CafeTables from './cafe-tables.js';
import { wireHomeTables, wirePlaceTables } from './home-tables.js';
import { createStadium, joystick, JOYSTICK } from './stadium.js';
import { wireCanteen } from './canteen.js';
import { wireBuffet, leaveBuffet, hasPass, isBlocker, setGate, payHost, BUFFET_ROOM, leaveCinema, hasTicket, payCinema, THEATRES } from './buffet.js';
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
import { drawRoom, drawRoof, ITEMS, SNACKS } from './pixel.js';
import { $, html, esc, toast, KittenView, hydrateIcons, openModal, closeModal } from './ui.js';
import { sfx } from './audio.js';
import { wireDisplays } from './display-racks.js';
import { HOUSE, fitHouse, houseK, roomLayout, decorEl, depthOf, OtherCats, say, chatBar, walker, DPAD, chatLog, wirePlayable, applyPower, emoteIcon, seatSpot, blanket, boothView, freeSlot, hearNote, PetLayer, roomArrowsHtml, inPool, stackDecor, studioBarre, rideFx } from './house.js';
import * as Radio from './radio.js';
import * as Places from './places.js';
import * as Snacks from './snacks.js';

const isNight = () => { const h = new Date().getHours(); return h >= 18 || h < 5; };
export function myLook() {
  const s = S.get(), k = s.kitten;
  return { name: s.childName && !String(k.name).includes(s.childName) ? `${s.childName}的${k.name}` : k.name, level: S.level(), fur: k.fur, equipped: { ...(k.equipped || {}) }, hold: s.holding || null };
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
          if (fresh && S.get().settings.houseLocked && !(Date.now() - (invited.get(p.id) || 0) < 15 * 60000)) { hostCh.send('locked', { id: hostUser, to: p.id }); return; }
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
  // a friend whose app closed without saying goodbye: once she's gone from the line twice in a row, she leaves the house
  const missing = new Map();
  setInterval(() => {
    if (!hostCh || !hostCh.joined || !hostCh.present.size) return;
    visitors.ids().forEach((id) => {
      if (hostCh.present.has(id)) { missing.delete(id); return; }
      const n = (missing.get(id) || 0) + 1; missing.set(id, n);
      if (n >= 2) { const c = visitors.m.get(id); visitors.remove(id); missing.delete(id); api.left && api.left(id, (c && c.look) || {}); api.changed && api.changed(); }
    });
  }, 8000);
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
const invited = new Map();   // friends I invited (they may come in even when my house is locked)
export function inviteFriend(friendId) {
  const me = (Auth.user() || {}).id; if (!me || !friendId || managing()) return false;
  invited.set(friendId, Date.now());
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
export function visitScreen({ go, id: hostId, name = '', place: placeKey = null, returnRoom = null }) {
  // place: a public place on the map (the cinema) — no host, everyone signed in can be there
  const me = (Auth.user() || {}).id, P = placeKey && Places.PLACES[placeKey];
  const startRoom = P ? (Places.isAdmin() && P.rooms.includes(returnRoom) ? returnRoom : P.start) : 'living';
  const n = html`<section class="visit-home">
      <div class="visit-top"><button class="btn white small" id="leave">← ${P ? '<span class="zh">地图</span> Map' : '<span class="zh">回家</span> Leave'}</button><button class="btn white small visit-phone" id="vphone" title="Meow phone">📱</button>
        ${P && Places.isAdmin() ? '<button class="btn yellow small" id="vdeco" title="Decorate">🛠 <span class="zh">布置</span></button>' : ''}
        <div class="visit-title">${P ? `<span class="zh">${P.icon} ${P.zh}</span> ${P.en}<small id="vt-sub">加载中… Loading…</small>` : `<span class="zh">🏠 ${esc(name || '朋友')}的家</span><small id="vt-sub">敲门中… Knocking…</small>`}</div></div>
      <div class="stage in-house"><div class="house" id="house"></div></div>
      <div class="visit-log" id="vlog"></div>
      <div class="visit-chat" id="vchat"></div>
    </section>`;
  const box = $('#house', n), sub = $('#vt-sub', n);
  const others = new OtherCats();
  let house = null, host = null, roomKey = startRoom, mine = { x: 30, y: 6, room: startRoom, left: false }, lockedOut = false;
  let myWrap = null, myEl = null, myKv = null, gotHouse = false, hostHere = false, petLayer = null, stadium = null;

  let refreshingPlace = false, welcomed = false;
  async function refreshPlace() {
    if (!P || !gotHouse || refreshingPlace || !n.isConnected) return;
    refreshingPlace = true;
    try { const h = await Places.loadPlace(placeKey); if (n.isConnected) { house = h; render(); } }
    catch (e) { /* keep the last saved layout while offline */ }
    finally { refreshingPlace = false; }
  }
  const ch = new Channel(P ? `place:${placeKey}` : `house:${hostId}`, {
    presenceKey: me,
    onStatus: (st, info) => {
      if (st === 'joined') { ch.track({ id: me }); knock(); if (P && gotHouse) refreshPlace(); }

      if (st === 'denied') { sub.textContent = '不能进去 · Can\'t visit this house'; }
    },
    onBroadcast: (ev, p) => {
      if (!p || p.id === me) return;
      if (stadium && (ev === 'ball' || ev === 'match')) { stadium.onBroadcast(ev, p); return; }
      if (ev === 'locked' && p.to === me && !gotHouse) {
        clearInterval(kt); lockedOut = true;
        sub.innerHTML = '🔒 朋友的家锁上了 · Your friend\'s house is locked<br><small>下次再来吧 · Try again another time</small>';
        return;
      }
      if (ev === 'house' && (!p.to || p.to === me)) {
        if (P) { refreshPlace(); return; }   // only trust the layout saved by the server's admin-only function
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
      } else if (ev === 'table-food' && placeKey === 'cafe') { refreshTables();
      } else if (ev === 'counter') { refreshCounter();
      } else if (ev === 'gate' && P && p.room === roomKey) { const g = [...($('#room', box) || document).querySelectorAll('.decor')].find((x) => x.dataset.id === p.gate); if (g) { setGate(g, true); clearTimeout(g.shutT); g.shutT = setTimeout(() => setGate(g, false), 1300); }
      } else if (ev === 'ctl' && P && p.c) { takeCtl(p.c);
      } else if (ev === 'ctl?' && P) { const all = Object.values(shared); if (all.length) ch.send('ctl-state', { id: me, to: p.id, all });
      } else if (ev === 'ctl-state' && P && p.to === me) { (p.all || []).forEach(takeCtl);
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
  $('#vlog', n).insertAdjacentHTML('beforeend', placeKey === 'stadium' ? JOYSTICK : DPAD);
  // the arrows (set up once; they move whichever room she is in); the stadium uses a joystick instead
  (placeKey === 'stadium' ? (el, o) => { joystick(el, o); walker(document.createElement('div'), o); } : walker)($(placeKey === 'stadium' ? '.joystick' : '.dpad', n), {
    isAlive: () => n.isConnected,
    canWalk: () => !!(myEl && myEl.isConnected && !myEl.dataset.sliding),
    onStep: (dx, dy, dt) => {
      const room0 = $('#room', box), st = mine.seat && stageOf(mine.seat);
      if (st && dy >= 0) {
        // 🎭 on the stage: walk left / right along it (down steps off the front)
        const d = room0 && room0.querySelector(`.decor.seat[data-id="${mine.seat}"]`), w = st.walk;
        const span = d ? (d.offsetWidth * (w.x1 - w.x0) / room0.clientWidth) * 100 : 50;
        mine.slot = Math.max(0, Math.min(1, (+mine.slot || 0) + (dx * 32 * dt) / Math.max(5, span)));
        if (Math.abs(dx) > 0.2) { mine.left = dx < 0; myKv.setFacing(mine.left); }
        myKv.canvas.classList.add('walking'); place(); sendMove({ id: me, ...mine });
        return;
      }
      if (st) { const sp = seatSpot(room0, mine.seat, mine.slot); mine.seat = null; mine.slot = 0; if (sp) { mine.x = sp.x; mine.y = Math.max(1, sp.y - (sp.el.offsetHeight / room0.clientHeight) * 100 * 0.3); } }
      else if (mine.seat) { mine.seat = null; mine.slot = 0; mine.y = Math.min(mine.y, 28); }   // the arrows make her hop off
      {
        // 🚧 counters, kiosks, queue poles and the buffet gate can't be walked through (slide along them instead)
        let nx = mine.x + dx * 32 * dt, ny = mine.y + dy * 22 * dt;
        if (!blockedAt(mine.x, mine.y) && blockedAt(nx, ny)) {
          if (!blockedAt(nx, mine.y)) ny = mine.y; else if (!blockedAt(mine.x, ny)) nx = mine.x; else { nx = mine.x; ny = mine.y; }
        }
        mine.x = nx; mine.y = ny; gateWatch();
        // just came through a door and still holding ▲: don't bounce straight back (re-arm once she lets go or turns)
        const now = Date.now(); if (!doorArmed && (dy <= 0 || now - lastStepAt > 400)) doorArmed = true; lastStepAt = now;
        if (dy > 0 && doorArmed && placeKey === 'cinema' && room0 && walkIntoDoor(room0)) return;
      }
      if (dy > 0 && room0) {   // walking up into the front of a stage: climb on
        const H = room0.clientHeight, W = room0.clientWidth;
        for (const d of room0.querySelectorAll('.decor.seat')) {
          const it = stageOf(d.dataset.id); if (!it) continue;
          const w = it.walk, left = ((d.offsetLeft + d.offsetWidth * w.x0) / W) * 100, right = ((d.offsetLeft + d.offsetWidth * w.x1) / W) * 100;
          const front = ((H - (d.offsetTop + d.offsetHeight)) / H) * 100;
          const top = Math.min(front, S.roomMaxY(roomKey)) - 1;   // the floor may end before the stage's front edge
          if (mine.x >= left && mine.x <= right && mine.y >= top && mine.y <= front + 6) { mine.seat = d.dataset.id; mine.slot = (mine.x - left) / Math.max(1, right - left); break; }
        }
      }
      if (Math.abs(dx) > 0.2) { mine.left = dx < 0; myKv.setFacing(mine.left); }
      myKv.canvas.classList.add('walking');
      place(); sendMove({ id: me, ...mine });
      if (stadium) stadium.step(dx, dy);
    },
    onStop: () => { if (myKv) myKv.canvas.classList.remove('walking'); sendMine(); },
  });

  const logLine = (who, text, mine) => vlog.add(who, text, mine);
  const knock = () => ch.send('knock', { id: me, look: myLook(), ...mine });
  const sendMine = () => ch.send('pos', { id: me, look: myLook(), ...mine });
  const sendMove = throttle((p) => ch.send('pos', p));
  // ⚽ the stadium's soccer match
  stadium = placeKey === 'stadium' ? createStadium({ me, ch, others, getMine: () => mine, getMyEl: () => myEl,
    teleport: (x, y) => { if (!myEl) return; mine.seat = null; mine.x = x; mine.y = y; place(); sendMine(); } }) : null;
  ch.open();
  // a public place: its furniture is saved online (people there say hello over the channel)
  if (P) Places.loadPlace(placeKey).then((h) => {
    if (gotHouse || !n.isConnected) return;
    house = h; gotHouse = true; roomKey = startRoom; mine.room = roomKey; sub.textContent = ''; sfx.coin(); render(); sendMine();
    setTimeout(() => { if (n.isConnected) ch.send('ctl?', { id: me }); }, 1200);   // what have the others switched on / off?
  }).catch(() => { if (n.isConnected) sub.textContent = '加载不了，请返回地图重试 · Could not load — return to the map and try again'; });
  // cats whose app closed without saying goodbye: gone from the line twice in a row → gone from here
  const gone2 = new Map();
  const sweep = setInterval(() => {
    if (!n.isConnected) return clearInterval(sweep);
    if (!ch.joined || !ch.present.size) return;
    others.ids().forEach((id) => {
      if (ch.present.has(id)) { gone2.delete(id); return; }
      const k = (gone2.get(id) || 0) + 1; gone2.set(id, k);
      if (k >= 2) { others.remove(id); gone2.delete(id); if (id === hostId) hostHere = false; }
    });
  }, 8000);
  // keep knocking until the friend answers; if nobody is home, say so
  let tries = 0;
  const kt = setInterval(() => {
    if (!n.isConnected) return clearInterval(kt);
    if (gotHouse || lockedOut) return clearInterval(kt);
    tries++; knock();
    if (tries >= 4 && !P) { sub.innerHTML = '朋友现在不在家 · Your friend isn\'t home right now<br><small>朋友要打开喵喵中文才可以串门 · They need to have the app open</small>'; }
  }, 3000);

  let lastRoom = null;
  function render() {
    if (P && lastRoom === BUFFET_ROOM && roomKey !== BUFFET_ROOM) { const n2 = leaveBuffet(); if (n2) toast('🍱 <span class="zh">自助餐的食物留在餐厅里</span> Buffet food stays at the buffet', { ms: 2400 }); if (myKv) myKv.draw(); }
    const justEntered = P && roomKey === BUFFET_ROOM && lastRoom !== BUFFET_ROOM;
    if (justEntered) leaveBuffet();   // a fresh visit: any old pass (or buffet food) from an earlier visit is gone — pay again
    if (P && placeKey === 'cinema' && lastRoom === null) leaveCinema();   // 🎟️ a new trip to the cinema: buy new tickets
    lastRoom = roomKey;
    const info = S.roomInfo(roomKey), open = house.open || ['living'];
    box.innerHTML = `<div class="house-unit ${info.outdoor ? 'outdoor' : ''} ${info.bare || info.noRoof ? 'bare' : ''}" id="hunit"><canvas class="roof" id="roof"></canvas>
        <div class="room-name">${info.icon} <span class="zh">${info.zh}</span> ${info.en}${P ? `<button class="room-light ${((house.power || {}).dark || {})[roomKey] ? 'off' : ''}" id="v-light" title="Lights" aria-label="Lights">💡</button>` : ''}${placeKey === 'mall' ? '<button class="room-light mall-directory" title="Mall directory" aria-label="Mall directory">▦</button>' : ''}</div>
        <div class="room" id="room" data-room="${roomKey}"><canvas class="room-bg" id="roombg"></canvas></div>
      </div>${roomArrowsHtml(roomKey, (k) => open.includes(k), { showLocked: false })}`;
    const unit = $('#hunit', box), room = $('#room', box);
    if (P) reapplyShared();
    (house.rooms[roomKey] || []).forEach((e) => { const el = decorEl(e, { videoPick: !!(P && Places.isAdmin()), videoOwner: !!P }); if (el) room.appendChild(el); });
    const saveMedia = async () => {
      if (!await Places.savePlace(placeKey)) throw new Error('Could not save the shared layout');
      await refreshPlace();
    };
    if (P && Places.isAdmin()) room.addEventListener('panel-toggle', (e) => { const {id,opened} = e.detail; const st = S.get(); st.openThings ||= {}; if (opened) st.openThings[id] = true; else delete st.openThings[id]; S.save(); Places.savePlace(placeKey).then(saved => { if (!saved) toast('Please reconnect to save this change.'); }); });
    wireDisplays(room, { edit: !!(P && Places.isAdmin()), changed: saveMedia });
    if (P && Places.isAdmin()) room.addEventListener('click', (e) => {
      const d = e.target.closest('.decor.board'); if (!d) return;
      openBoard(d.dataset.id, saveMedia, d.querySelector('.board-text').textContent);
    });
    if (P && Places.isAdmin()) room.addEventListener('screen-video', (e) => openVideo(e.detail.id, saveMedia));
    // the cinema owner can switch a projector screen's film on / off from here too (everyone sees it)
    // ▶️ / ⏸ on a screen, or a tap on a TV: on / off for everyone in this place
    if (P) room.addEventListener('screen-power', (e) => {
      const id = e.detail.id, on = !!((house.power || {}).off || {})[id]; sfx.click();
      setCtl('power', id, on);
      toast(on ? '▶️ <span class="zh">开始播放</span> Playing for everyone' : '⏹ <span class="zh">停了</span> Stopped for everyone', { ms: 1400 });
    });
    if (P) room.addEventListener('click', (e) => {
      if (e.target.closest('button') || room.classList.contains('arranging')) return;
      const tv = e.target.closest('.decor[data-power="tv"]');
      const tvIt = tv && ITEMS[tv.dataset.id.split('#')[0]];
      if (tv && tvIt && !tvIt.noVideo && !/kiosk/.test(tv.dataset.id) && !tv.classList.contains('has-film') && !tv.dataset.panel) { tv.dispatchEvent(new CustomEvent('screen-power', { bubbles: true, detail: { id: tv.dataset.id } })); return; }
      const rd = e.target.closest('.decor.radio');
      if (rd && !Places.isAdmin()) {
        const r = (house.radios || {})[rd.dataset.id];
        if (!r) return toast('📻 <span class="zh">这个收音机还没有歌</span> No song on this radio yet', { ms: 1600 });
        sfx.click(); setCtl('radio', rd.dataset.id, !r.on);
        toast(!r.on ? '⏹ <span class="zh">音乐停了</span> Music off for everyone' : `🎵 <span class="zh">放音乐</span> Playing ${esc(r.name || '')}`, { ms: 1600 });
      }
    });
    // curtains / pull-down screens: everyone sees them open or close (the 🎭 stage too)
    if (P) room.addEventListener('panel-toggle', (e) => { setCtl('panel', e.detail.id, e.detail.opened, { dom: false }); });
    // Public-place uploads use the admin's existing private radio library.
    if (P && Places.isAdmin()) {
      room.querySelectorAll('.decor.radio').forEach((d) => d.classList.add('radio-editable'));
      room.addEventListener('click', (e) => {
        const d = e.target.closest('.decor.radio'); if (!d) return;
        e.stopPropagation(); openRadio(d.dataset.id, { shared: placeKey === 'cafe', changed: saveMedia });
      });
      const markRadio = () => room.querySelectorAll('.decor.radio').forEach((d) => d.classList.toggle('playing', Radio.isPlaying(d.dataset.id)));
      const unRadio = Radio.onRadio(() => { if (!room.isConnected) { unRadio(); return; } markRadio(); });
      markRadio();
    }
    wirePlayable(room, (i) => ch.send('note', { id: me, i }));
    // a friend's photo frame: tap to see the photo bigger
    room.addEventListener('click', (e) => {
      const d = e.target.closest('.decor.frame');
      if (d && P && Places.isAdmin()) { openPoster(d.dataset.id, saveMedia); return; }
      const img = d && d.querySelector('.frame-photo'); if (!img) return;
      const v = html`<div class="card stack" style="align-items:center"><div class="frame-preview big"><img src="${img.src}" alt=""></div><button class="btn white" id="pc">关闭 Close</button></div>`;
      $('#pc', v).onclick = closeModal; openModal(v);
    });
    // the slide: up to the top, then down we go
    room.addEventListener('click', (e) => {
      const d = e.target.closest('.decor.slidey'), sl = d && ITEMS[d.dataset.id] && ITEMS[d.dataset.id].slide; if (!sl || myEl.dataset.sliding) return;
      const flip = d.dataset.facing === 'flip', W = room.clientWidth, H = room.clientHeight;
      const pt = (p) => ({ x: ((d.offsetLeft + d.offsetWidth * (flip ? 1 - p.x : p.x)) / W) * 100, y: ((H - (d.offsetTop + d.offsetHeight * p.y)) / H) * 100 });
      const a = pt(sl.top), b = pt(sl.end), floor = ((H - (d.offsetTop + d.offsetHeight)) / H) * 100;
      mine.seat = null; myEl.dataset.sliding = '1'; myEl.classList.add('seated'); myKv.setPose(null); myKv.setFacing(flip);
      Object.assign(mine, { x: a.x, y: a.y, left: flip }); myEl.style.left = `${a.x}%`; myEl.style.bottom = `${a.y}%`; myEl.style.zIndex = (parseInt(d.style.zIndex, 10) || 50) + 1;
      rideFx(room, myEl, null); myKv.jump(); sfx.click(); sendMine();
      setTimeout(() => {
        const an = myEl.animate([{ left: `${a.x}%`, bottom: `${a.y}%` }, { left: `${b.x}%`, bottom: `${b.y}%` }], { duration: 800, easing: 'ease-in', fill: 'forwards' });
        an.onfinish = () => { an.cancel(); delete myEl.dataset.sliding; myEl.classList.remove('seated'); mine.x = b.x; mine.y = Math.max(1, floor - 1); place(); myKv.jump(); sendMine(); };
      }, 500);
    });
    room.addEventListener('click', (e) => {
      const d = e.target.closest('.decor.seat'); if (!d || e.target.closest('button')) return;
      if (mine.seat === d.dataset.id) return;
      if (roomKey === BUFFET_ROOM && !insideBuffet()) { sfx.miss(); return toast(hasPass() ? '🚪 <span class="zh">请先走进闸门</span> Walk in through the gate first' : '🎟️ <span class="zh">请先在门口付款</span> Please pay the host at the entrance first', { ms: 2200 }); }
      const taken = others.ids().map((id) => others.m.get(id)).filter((c) => c && c.room === roomKey);
      let slot = freeSlot(d.dataset.id, taken);
      const stg = stageOf(d.dataset.id);
      if (stg) { const r = d.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width; slot = Math.max(0, Math.min(1, (fx - stg.walk.x0) / (stg.walk.x1 - stg.walk.x0))); }
      if (slot < 0) { sfx.miss(); return toast('<span class="zh">坐满了！</span> No room — someone is already there'); }
      mine.seat = d.dataset.id; mine.slot = slot; mine.boothClosed = false; place(); myKv.jump(); sfx.click(); sendMine();
    });
    // my kitten
    myEl = html`<div class="vcat me"><div class="kitten-wrap"><div class="kflip"></div><div class="nametag">${esc(S.get().kitten.name)}<span class="lv">Lv${S.level()}</span></div></div></div>`;
    myKv = new KittenView({ scale: HOUSE.kitten }); myKv.setMood('happy'); myKv.setFacing(mine.left);
    myEl.querySelector('.kflip').appendChild(myKv.canvas);
    myWrap = myEl.querySelector('.kitten-wrap');
    room.appendChild(myEl);
    others.attach(room, roomKey);
    if (stadium && roomKey === 'stadium') stadium.attach(room);
    sizeCols(); fitHouse(box, unit); requestAnimationFrame(() => { if (unit.isConnected) { sizeCols(); fitHouse(box, unit); } });
    drawRoom($('#roombg', box), isNight(), roomKey, (house.styles || {})[roomKey]); drawRoof($('#roof', box)); studioBarre(room, roomKey === 'basement');
    room.querySelectorAll('.decor').forEach((el) => { el.style.zIndex = depthOf(el, room); }); stackDecor(room);
    const pw = house.power || {};
    applyPower(room, { dark: !!(pw.dark || {})[roomKey], off: pw.off || {} });
    // 💡 in a public place: the owner switches the room's lights for everyone; anyone else just for their own screen
    const vl = $('#v-light', box);
    if (vl) vl.onclick = () => {
      house.power = house.power || {}; house.power.dark = { ...(house.power.dark || {}) };
      const dark = !house.power.dark[roomKey];
      if (dark) house.power.dark[roomKey] = true; else delete house.power.dark[roomKey];
      if (Places.isAdmin() && S.roomDark(roomKey) !== dark) S.toggleRoomLight(roomKey);
      sfx.click(); vl.classList.toggle('off', dark);
      applyPower(room, { dark, off: house.power.off || {} });
    };
    place();
    // the friend's pets wandering around
    petLayer = new PetLayer(room, roomKey, { onClick: (kind) => { const p = (house.pets || []).find((x) => x.kind === kind); if (p) { sfx.coin(); toast(`🤍 <span class="zh">${esc(p.name)}</span>`, { ms: 1500 }); } } });
    petLayer.update(house.pets || []);
    hearRadio();
    box.querySelector('.mall-directory')?.addEventListener('click', () => openMallDirectory(roomKey, (key) => { roomKey=key; mine.room=key; mine.seat=null; mine.boothClosed=false; mine.x=30; mine.y=6; render(); sendMine(); }));
    // 🚪 the cinema: a Left door / Right door takes the place of that side's arrow (walk into the door to go through)
    if (placeKey === 'cinema') box.querySelectorAll('.room-nav.left, .room-nav.right').forEach((b) => { const side = b.classList.contains('left') ? 'left' : 'right'; if (doorEl(room, side)) b.remove(); });
    box.querySelectorAll('.room-nav').forEach((b) => { b.onclick = () => { roomKey = b.dataset.room; mine.room = roomKey; mine.seat = null; sfx.click(); render(); sendMine(); }; });
    // Each arrival gets one greeting sequence, even if the layout refreshes.
    if (placeKey === 'cafe' && roomKey === 'cafeentrance' && !welcomed && room.querySelector('.cafe-greeter')) {
      welcomed = true;
      ['Welcome to Meow Cafe!', 'Please try our new Matcha Latte!', 'Please order from our self ordering kiosk!'].forEach((line, i) => {
        setTimeout(() => {
          if (!n.isConnected || roomKey !== 'cafeentrance') return;
          say(box.querySelector('.cafe-greeter'), line);
        }, 500 + i * 4500);
      });
    }
    // 🍿 her snacks: hold one, eat it
    box.appendChild(Snacks.snackBar({ onHold: () => { if (myKv) myKv.draw(); sendMine(); } }));
    if (P) {
      // each public place has its own kiosk menu and order queue: order snacks
      room.addEventListener('click', (e) => {
        const d = e.target.closest(placeKey === 'cafe' ? '.decor[data-id^="cafekiosk"]' : '.decor[data-id^="kiosk"]'); if (!d) return;
        sfx.click();
        // 🎟️ the cinema's kiosk sells movie tickets (10 coins a theatre) as well as snacks
        if (placeKey === 'cinema') return kioskChoice(() => openSnacks());
        openSnacks();
      });
      const kioskChoice = (snacks) => {
        const c = html`<div class="card stack" style="align-items:stretch;text-align:center"><div class="h-title" style="justify-content:center">🎬 <span class="zh">自助售票机</span> Self-help kiosk</div>
            <button type="button" class="btn green" id="kc-tix">🎟️ <span class="zh">买电影票</span> Movie tickets</button>
            <button type="button" class="btn green" id="kc-snack">🍿 <span class="zh">点小吃</span> Order snacks</button>
            <button type="button" class="btn white" id="kc-close">关闭 Close</button></div>`;
        $('#kc-tix', c).onclick = () => { closeModal(); payCinema(() => sendMine()); };
        $('#kc-snack', c).onclick = () => { closeModal(); snacks(); };
        $('#kc-close', c).onclick = closeModal; openModal(c);
      };
      const openSnacks = () => {
        Snacks.openKiosk({ place: placeKey, layout: house, prices: house.prices || {}, admin: Places.isAdmin(),
          onPaid: () => { ch.send('counter', { id: me }); setTimeout(() => { refreshCounter(); ch.send('counter', { id: me }); }, 3300); },
          onPrices: (p) => { S.get()[placeKey === 'cafe' ? 'cafePrices' : 'kioskPrices'] = p; S.save(); house.prices = p; } });
      };
      refreshCounter();
    }
    if (placeKey === 'cafe') refreshTables();
    if (!P) wireHomeTables(room, hostId, () => { if (myKv) myKv.draw(); sendMine(); });
    else if (!['cafe', 'mall'].includes(placeKey) || roomKey === BUFFET_ROOM) wirePlaceTables(room, placeKey, roomKey, () => { if (myKv) myKv.draw(); sendMine(); });
    if (P && roomKey === BUFFET_ROOM) wireBuffet(room, { onChanged: () => { if (myKv) myKv.draw(); sendMine(); }, isInside: insideBuffet });
    // 🚪 the admin can hold the buffet gate open (anyone may walk through) or close it again — for everyone
    if (P && (roomKey === BUFFET_ROOM || placeKey === 'cinema') && Places.isAdmin()) room.addEventListener('click', (e) => {
      const g = e.target.closest('.decor.buffet-gate'); if (!g || e.target.closest('button')) return;
      const open = !g.classList.contains('gate-held'), st = S.get(); st.openThings ||= {};
      if (open) st.openThings[g.dataset.id] = true; else delete st.openThings[g.dataset.id];
      S.save(); sfx.click(); setCtl('gate', g.dataset.id, open);
      toast(open ? '🚪 <span class="zh">闸门打开了（所有人都能进）</span> Gate held open for everyone' : '🚪 <span class="zh">闸门关上了</span> Gate closed — only paid guests can pass', { ms: 2200 });
    });
    measureBlockers(room);
    requestAnimationFrame(() => {
      measureBlockers(room);
      // 🍱 coming into the buffet: she starts just in front of the gate (on the entrance side)
      const g = justEntered && foot.find((f) => f.gate);
      if (g && myEl) { mine.seat = null; mine.x = (g.x0 + g.x1) / 2; mine.y = Math.max(1, g.y0 - 6); place(); sendMine(); }
      // 🚪 came through a door: she steps out in front of the matching door on this side (left door → arrive at the right door)
      if (arriveBy && myEl) {
        const d = doorEl(room, arriveBy === 'left' ? 'right' : 'left'); arriveBy = null;
        if (d) { const r = doorRect(room, d); mine.seat = null; mine.x = (r.x0 + r.x1) / 2; mine.y = Math.max(1, Math.min(r.bottom, S.roomMaxY(roomKey)) - 6); place(); sendMine(); }
      }
      // …and the host asks her to pay (the admin walks in for free)
      if (justEntered && !Places.isAdmin() && room.querySelector('.decor[data-id^="buffethost"]')) setTimeout(() => { if (room.isConnected && !hasPass()) payHost(() => { if (myKv) myKv.draw(); sendMine(); }); }, 500);
    });
    if (placeKey === 'mall') wireMall(room, roomKey, house, go, () => { if (myKv) myKv.draw(); sendMine(); });
    if (placeKey === 'school' && roomKey === 'schoolcanteen') wireCanteen(room);
    hydrateIcons(box);
  }
  // 🧾 the collection counter (public places): the first two orders that are ready; anyone can pick them up
  let counterBusy = false;
  async function refreshCounter() {
    const room = $('#room', box);
    if (!P || placeKey === 'mall' || placeKey === 'school' || !room || !room.querySelector('.decor[data-counter]') || counterBusy) return;
    counterBusy = true;
    const data = await Snacks.counterNow(placeKey); counterBusy = false;
    if (!data || !room.isConnected) return;
    Snacks.showCounter(room, data, async (o, btn) => {
      btn.disabled = true;
      const got = await Snacks.pickUp(o.id, placeKey);
      if (got) { S.addSnack(got); sfx.coin(); toast(`🍿 <span class="zh">拿到${SNACKS[got].zh}了！</span> Tap it at the bottom to hold it`, { ms: 2500 }); }
      else { sfx.miss(); toast('<span class="zh">被拿走了</span> Someone already took it', { ms: 1800 }); }
      ch.send('counter', { id: me }); refreshCounter();
    }, placeKey);
  }
  if (P) { const ct = setInterval(() => { if (!n.isConnected) return clearInterval(ct); if (!document.hidden) refreshCounter(); }, 4000); }
  let tableBusy = false;
  function tableChanged() {
    if (myKv) myKv.draw(); sendMine();
    ch.send('table-food', { id: me }); refreshTables();
  }
  async function refreshTables() {
    if (placeKey !== 'cafe' || !house || tableBusy) return;
    tableBusy = true;
    const rows = await CafeTables.tableItems(); tableBusy = false;
    const room = $('#room', box);
    if (rows && room && n.isConnected) CafeTables.showTableItems(room, roomKey, rows, house, tableChanged);
  }
  if (placeKey === 'cafe') {
    const tt = setInterval(() => {
      if (!n.isConnected) return clearInterval(tt);
      if (!document.hidden) { refreshTables(); CafeTables.finishDrop(tableChanged); }
    }, 4000);
  }
  // the friend's radio: play it here too (same song, same part of it)
  function hearRadio() {
    let r = (house && house.radio) || { on: false };
    if (P) {
      // One soundtrack per room, chosen deterministically from its placed radios.
      const entry = Object.entries(house.radios || {}).filter(([, song]) => song.room === roomKey && song.on).sort(([a], [b]) => a.localeCompare(b))[0];
      r = entry ? { ...entry[1], radioId: entry[0] } : { on: false };
    }
    box.querySelector('.radio-listen')?.remove();
    if (P && r.on) {
      const button = document.createElement('button'); button.className = 'btn small radio-listen'; button.textContent = '🔊 Tap to hear music';
      button.onclick = async () => { if (await Radio.listen(r)) button.remove(); else button.textContent = '🔊 Tap to retry music'; };
      box.appendChild(button);
      Radio.listen(r).then((ok) => { if (ok) button.remove(); });
    } else Radio.listen(r);
    box.querySelectorAll('.decor.radio').forEach((d) => d.classList.toggle('playing', !!r.on && (!r.radioId || r.radioId === d.dataset.id)));
  }
  // ---------- 🎛 shared controls in a public place: screens, TVs, radios, curtains ----------
  // Anyone can switch them; everyone in the place sees / hears the change at once. A newcomer asks the others
  // what has been changed. The admin's changes are also saved, so they last after everyone leaves.
  const shared = {};
  const stageOf = (id) => { const it = ITEMS[String(id).split('#')[0]]; return it && it.seat && it.seat.walk ? it.seat : null; };
  function ctlData(c) {
    if (!house) return;
    if (c.kind === 'power') { house.power = house.power || {}; house.power.off = { ...(house.power.off || {}) }; if (c.val) delete house.power.off[c.id]; else house.power.off[c.id] = true; }
    else if (c.kind === 'panel' || c.kind === 'gate') Object.values(house.rooms || {}).forEach((list) => (list || []).forEach((e) => { if (e.id === c.id) e.opened = !!c.val; }));
    else if (c.kind === 'radio') { const r = (house.radios || {})[c.id]; if (r) { r.on = !!c.val; if (c.val) r.startedAt = c.at || r.startedAt || Date.now(); } }
  }
  function ctlShow(c, { dom = true } = {}) {
    const room = $('#room', box); if (!room) return;
    if (c.kind === 'power') applyPower(room, { dark: !!(((house.power || {}).dark || {})[roomKey]), off: (house.power || {}).off || {} });
    else if (c.kind === 'radio') hearRadio();
    else if (c.kind === 'gate') {
      const g = [...room.querySelectorAll('.decor')].find((x) => x.dataset.id === c.id);
      if (g) { g.classList.toggle('gate-held', !!c.val); if (c.val) setGate(g, true); else { g.classList.remove('gate-held'); setGate(g, false); } }
      measureBlockers(room);
    }
    else if (c.kind === 'panel') {
      const d = [...room.querySelectorAll('.decor')].find((x) => x.dataset.id === c.id);
      if (dom && d && d.classList.contains('panel-open') !== !!c.val) {
        const entry = (house.rooms[roomKey] || []).find((x) => x.id === c.id);
        const ne = entry && decorEl(entry, { videoPick: !!(P && Places.isAdmin()), videoOwner: !!P });
        if (ne) { ne.style.cssText = d.style.cssText; d.replaceWith(ne); }
      }
      place(); others.m.forEach((o) => { if (o.el && o.room === roomKey) others.place(o); });
    }
  }
  function setCtl(kind, id, val, opts = {}) {
    const c = { kind, id, val: !!val, t: Date.now(), at: Date.now() };
    shared[`${kind}:${id}`] = c; ctlData(c); ctlShow(c, opts);
    ch.send('ctl', { id: me, c });
    if (Places.isAdmin()) {   // the admin's switches are kept in the saved layout too
      if (kind === 'power' && !!(S.get().powerOff || {})[id] === !!val) S.togglePower(id);
      if (kind === 'radio') Radio.setSharedOn(id, !!val);
      if (kind !== 'panel') Places.savePlace(placeKey);
    }
  }
  function takeCtl(c) {
    const k = `${c.kind}:${c.id}`; if (shared[k] && shared[k].t >= c.t) return;
    shared[k] = c; ctlData(c); ctlShow(c);
  }
  const reapplyShared = () => Object.values(shared).forEach(ctlData);

  // ---------- 🚧 things you can't walk through ----------
  // Each counter / kiosk / pole / gate blocks a strip of floor at its base (in room %: x from its left to right edge,
  // y from its bottom edge a little way back). The buffet gate lets a pass-holder through — it opens for her and
  // closes again right behind her (and the others see it open as she goes through).
  let foot = [], myGate = null, arriveBy = null, doorToastAt = 0, doorArmed = true, lastStepAt = 0;
  // ---------- 🚪 cinema doors: walking up into the Left door / Right door takes her to the room on that side ----------
  const doorEl = (room, side) => room && [...room.querySelectorAll('.decor')].find((d) => { const it = ITEMS[d.dataset.id.split('#')[0]]; return it && it.door === side; });
  function doorRect(room, d) {
    const W = room.clientWidth, H = room.clientHeight;
    return { x0: (d.offsetLeft / W) * 100, x1: ((d.offsetLeft + d.offsetWidth) / W) * 100, bottom: ((H - (d.offsetTop + d.offsetHeight)) / H) * 100 };
  }
  function walkIntoDoor(room) {
    for (const side of ['left', 'right']) {
      const d = doorEl(room, side); if (!d) continue;
      const r = doorRect(room, d), pad = -1.5;   // anywhere across the doorway (a little either side counts)
      if (mine.x < r.x0 + pad || mine.x > r.x1 - pad || mine.y < Math.min(r.bottom, S.roomMaxY(roomKey)) - 1.5) continue;
      const nb = S.roomNeighbors(roomKey)[side], to = nb && (nb.key || nb); if (!to) continue;
      // into a theatre: she needs that theatre's ticket (once the cinema has a ticket host; the admin goes in free)
      if (THEATRES.includes(to) && !Places.isAdmin() && !hasTicket(to)) {
        mine.y -= 3; place();
        if (Date.now() - doorToastAt > 3000) { doorToastAt = Date.now(); sfx.miss(); const info = S.roomInfo(to); toast(`🎟️ <span class="zh">请先买${info.zh}的票</span> You need a ${info.en} ticket — buy one at the kiosk`, { ms: 2600 }); }
        return true;
      }
      sfx.click(); arriveBy = side; doorArmed = false; roomKey = to; mine.room = to; mine.seat = null; render(); sendMine();
      return true;
    }
    return false;
  }
  function measureBlockers(room) {
    foot = [];
    if (!room || stadium) return;
    const W = room.clientWidth, H = room.clientHeight; if (!W || !H) return;
    room.querySelectorAll('.decor').forEach((d) => {
      if (!isBlocker(d.dataset.id, d)) return;
      const it = ITEMS[d.dataset.id.split('#')[0]], x0 = (d.offsetLeft / W) * 100, x1 = ((d.offsetLeft + d.offsetWidth) / W) * 100;
      const bottom = ((H - (d.offsetTop + d.offsetHeight)) / H) * 100, hPct = (d.offsetHeight / H) * 100;
      const turned = d.dataset.facing === 'back' && it.blockDepthTurned;
      const depth = turned ? hPct * it.blockDepthTurned : it.blockDepth || Math.max(3, Math.min(10, hPct * 0.3));
      // a turned queue pole is a rope running diagonally from its front pole (left) back to its far pole (right):
      // only that diagonal line blocks, not the whole box around it (so she can walk past its far end into a gate)
      const flip = getComputedStyle(d).transform.startsWith('matrix(-1');
      const diag = turned ? (flip ? { f: 1 - 2.5 / 22, b: 1 - 16 / 22 } : { f: 2.5 / 22, b: 16 / 22 }) : null;
      foot.push({ el: d, gate: !!it.gate, venue: it.gate ? it.gateFor || gateVenue(room, x0, x1) : null, x0, x1, y0: bottom - 1, y1: bottom + depth, diag });
    });
  }
  const inFoot = (f, x, y) => {
    if (y < f.y0 || y > f.y1) return false;
    if (f.diag) { const t = (y - f.y0) / Math.max(0.1, f.y1 - f.y0), xc = f.x0 + (f.x1 - f.x0) * (f.diag.f + (f.diag.b - f.diag.f) * t); return Math.abs(x - xc) < 2.5; }
    return x >= f.x0 - 2 && x <= f.x1 + 2;
  };
  // the buffet gate wants a buffet pass; a cinema gate wants a ticket for its own theatre (the admin goes through free)
  const gatePass = (f) => Places.isAdmin() || (f && f.venue ? hasTicket(f.venue) : hasPass());
  // which theatre a cinema gate guards: the theatre it stands in, else the room behind the nearest door, else by side
  function gateVenue(room, x0, x1) {
    if (placeKey !== 'cinema') return null;
    if (THEATRES.includes(roomKey)) return roomKey;
    const nb = S.roomNeighbors(roomKey), cx = (x0 + x1) / 2;
    const doors = ['left', 'right'].map((side) => { const d = doorEl(room, side); return d && { side, r: doorRect(room, d) }; }).filter(Boolean);
    const near = doors.sort((a, b) => Math.abs((a.r.x0 + a.r.x1) / 2 - cx) - Math.abs((b.r.x0 + b.r.x1) / 2 - cx))[0];
    const side = near ? near.side : cx < 50 ? 'left' : 'right', r = nb[side];
    return (r && (r.key || r)) || null;
  }
  let gateToastAt = 0;
  function blockedAt(x, y) { return foot.some((f) => inFoot(f, x, y) && !(f.gate && (gatePass(f) || f.el.classList.contains('gate-held')))); }
  // the food side of the buffet: behind the gate's line (no gate in the room: having paid is enough)
  function insideBuffet() {
    const g = foot.find((f) => f.gate);
    if (mine.seat) return true;
    return g ? mine.y > (g.y0 + g.y1) / 2 : gatePass(g);
  }
  // the gate "sees" a paid guest coming (a little before she reaches it), opens, and shuts once she's through
  const nearGate = (f, x, y) => x >= f.x0 - 3 && x <= f.x1 + 3 && y >= f.y0 - 5 && y <= f.y1 + 5;
  function gateWatch() {
    const g = foot.find((f) => f.gate && gatePass(f) && nearGate(f, mine.x, mine.y));
    // bumping into a theatre gate without its ticket: the host sells them
    const shut = !g && foot.find((f) => f.gate && f.venue && !gatePass(f) && !f.el.classList.contains('gate-held') && nearGate(f, mine.x, mine.y));
    if (shut && Date.now() - gateToastAt > 4000) { gateToastAt = Date.now(); const info = S.roomInfo(shut.venue); toast(`🎟️ <span class="zh">这是${info.zh}的闸门，请先在售票机买票</span> This gate is for ${info.en} — buy a ticket at the kiosk (10 coins)`, { ms: 2800 }); }
    if (g && myGate !== g.el) { myGate = g.el; clearTimeout(g.el.shutT); setGate(g.el, true); sfx.click(); ch.send('gate', { id: me, room: roomKey, gate: g.el.dataset.id }); }
    if (!g && myGate) { const el = myGate; myGate = null; clearTimeout(el.shutT); el.shutT = setTimeout(() => setGate(el, false), 250); }   // shut right behind her
  }

  function place() {
    const room = $('#room', box), spot = mine.seat && seatSpot(room, mine.seat, mine.slot);
    boothView(room, myEl, spot && mine.seat, mine.boothClosed, (action) => {
      if (action === 'exit') { mine.seat = null; mine.y = Math.min(mine.y, 28); mine.boothClosed = false; }
      else mine.boothClosed = !mine.boothClosed;
      place(); sendMine();
    });
    myEl.classList.toggle('lying', !!(spot && spot.lie)); myEl.classList.toggle('seated', !!(spot && !spot.walk));
    if (myKv) myKv.setPose(spot ? spot.pose : null); myEl.dataset.pose = (spot && spot.pose) || '';
    if (room) room.querySelectorAll('.decor.seat').forEach((d) => { if (!others.ids().some((id) => (others.m.get(id) || {}).seat === d.dataset.id)) blanket(room, d.dataset.id, !!(spot && spot.lie && d.dataset.id === mine.seat)); });
    if (spot) { myEl.classList.remove('swimming'); mine.x = spot.x; mine.y = spot.y; myEl.style.left = `${spot.x}%`; myEl.style.bottom = `${spot.y}%`; myEl.style.zIndex = spot.z; rideFx(room, myEl, mine.seat); return; }
    rideFx(room, myEl, null);
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
  // the room's column is only as wide as the room (so the chat sits right beside it, not across a big gap)
  const sizeCols = () => { const st = box.closest('.stage'); if (st && st.clientHeight) n.style.setProperty('--hw', `${Math.round(st.clientHeight * HOUSE.w / (HOUSE.roof + HOUSE.room) + 90)}px`); };
  const refit = () => { if (!n.isConnected) { window.removeEventListener('resize', refit); return; } sizeCols(); fitHouse(box, $('#hunit', box)); };
  window.addEventListener('resize', refit);
  // leaving: say goodbye and close the line
  let left = false;
  const leave = () => {
    if (left) return; left = true;
    if (P) { leaveBuffet(); if (placeKey === 'cinema') leaveCinema(); }
    if (P && S.dropPlaceFood()) toast('🍽️ <span class="zh">吃的喝的不能带走哦</span> Food and drinks stay behind when you leave', { ms: 2600 });
    Radio.stop(); clearInterval(kt); if (stadium) stadium.stop(); ch.send('bye', { id: me }); setTimeout(() => ch.close(), 150); };
  $('#leave', n).onclick = () => { leave(); if (P) go('map'); else go('friend', { id: hostId }); };
  const deco = $('#vdeco', n); if (deco) deco.onclick = () => { if (!gotHouse) return; leave(); go('home', { view: 'house', room: roomKey, arrange: true, openStorage: true }); };   // the admin: furnish this room
  $('#vphone', n).onclick = () => import('./phone.js').then((P) => P.openPhone({ start: 'home' }));   // the phone works at a friend's house too
  const gone = setInterval(() => { if (!n.isConnected) { clearInterval(gone); leave(); } }, 1000);
  return n;
}
