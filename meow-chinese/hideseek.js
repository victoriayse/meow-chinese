// 🕹️ The Game Center (a public place on the 🗺️ map): a hall with three doors.
//   🙈 Hide & Seek ▸ Waiting Lobby ▸ Room 1 Fun Ball Pit ▸ Room 2 Toy Store ▸ Room 3 Castle ▸ Room 4 Pet Store
//   the other two doors are being renovated (blocked).
// The server keeps the game (who's in, who hides, the clock, who was found) so every screen agrees:
//   lobby (up to 8) → play: 90 s to hide (seekers wait in the lobby) → START! 300 s to seek → done (results).
// Half the players (rounded down) hide; the host picks them (or volunteers / random fill the rest).
// Everything here is in English only.
import * as S from './state.js';
import { rest } from './cloud.js';
import { ITEMS } from './pixel.js';
import { roomLayout } from './house.js';
import { $, html, esc, toast, confirmBox, openModal, closeModal, coinI, hydrateIcons, confetti } from './ui.js';
import { sfx } from './audio.js';

const rpc = (name, body = {}) => rest('rpc/' + name, { method: 'POST', body: JSON.stringify(body) });
export const PLACE = 'gamecenter', HALL = 'gchall', LOBBY = 'hslobby';
export const PLAY_ROOMS = ['hsroom1', 'hsroom2', 'hsroom3', 'hsroom4'];
export const HS_ROOMS = [LOBBY, ...PLAY_ROOMS];
export const MAX = 8, HIDE_S = 90, SEEK_S = 300, MEOW_GAP = 45, DAILY_REWARDS = 5;
export const PRIZE_HIDE = 10, PRIZE_FIND = 5, PRIZE_FIND_MAX = 20;
export const hidersFor = (n) => Math.floor(n / 2);   // 2→1, 3→1, 4→2, 5→2, 6→3, 7→3, 8→4
export const isHsRoom = (k) => HS_ROOMS.includes(k);

// the three doors in the hall (room %: x across, the door's foot is the back wall)
export const DOORS = [
  { key: 'hs', x0: 12, x1: 32, to: LOBBY, label: '🙈 HIDE & SEEK' },
  { key: 'reno1', x0: 40, x1: 60, reno: true, label: '❓ COMING SOON' },
  { key: 'reno2', x0: 68, x1: 88, reno: true, label: '❓ COMING SOON' },
];
// the lobby's door into Room 1 (on the right of the back wall)
export const LOBBY_DOOR = { x0: 78, x1: 94, to: 'hsroom1' };

// ---------- the furniture she starts with (the admin can move, store or add to it) ----------
// [item, left %, foot % (up from the floor's front edge)]
const SEED = {
  hslobby: [['hsarcade', 3, 27], ['hsarcade', 15, 27], ['hsbench', 8, 4], ['hsbench', 56, 4], ['hsbigball', 44, 22]],
  hsroom1: [['hsslidetower', 3, 22], ['hsclimbnet', 74, 22], ['hsbouncy', 44, 26], ['hsballpit', 34, 12], ['hsfoamblocks', 14, 7], ['hsbigball', 80, 4],
    ['hsbigball', 24, 23], ['hsfoamblocks', 62, 18], ['trampoline', 58, 2], ['ballpit', 4, 2]],
  hsroom2: [['hstoyshelf', 2, 26], ['hstoyshelf', 22, 26], ['hsdollhouse', 76, 24], ['hstoyrocket', 60, 22], ['hsgiantteddy', 40, 12],
    ['hsabcblocks', 6, 7], ['hsgifts', 82, 6], ['hstoychest', 60, 2], ['rockingunicorn', 24, 2], ['hsgifts', 44, 26], ['hsabcblocks', 30, 17]],
  hsroom3: [['hspillar', 3, 26], ['hspillar', 88, 26], ['hstapestry', 15, 26], ['hsthrone', 44, 24], ['hsarmour', 33, 21], ['hsarmour', 62, 21],
    ['hsturret', 72, 10], ['hscrates', 8, 6], ['hstreasure', 46, 3], ['hstapestry', 70, 27], ['hscrates', 86, 3]],
  hsroom4: [['hsaquarium', 2, 25], ['hspetfood', 28, 25], ['hscattree', 52, 22], ['hspetcounter', 68, 26], ['hsbirdcage', 89, 14],
    ['hsdoghouse', 64, 6], ['hshutch', 6, 5], ['hspetfood', 34, 7], ['hscattree', 14, 18], ['hshutch', 40, 15]],
};
const W_PCT = 5 / 720 * 100, H_PCT = 5 / 600 * 100;   // one art pixel of furniture, in room %
const posOf = (id, x, foot) => { const it = ITEMS[id]; const h = it.art.length * H_PCT * (it.size || 1); return { x, y: Math.round((100 - foot - h) * 10) / 10 }; };
// fake furniture state for the seed (used to show the rooms before the admin has published her own layout)
function seedState() {
  const st = { owned: [], decorRoom: {}, decorPos: {}, decorHidden: [], roomStyle: {} }, n = {};
  Object.entries(SEED).forEach(([room, list]) => list.forEach(([id, x, foot]) => {
    if (!ITEMS[id]) return;
    n[id] = (n[id] || 0) + 1; const key = n[id] > 1 ? `${id}#${n[id]}` : id;
    st.owned.push(key); st.decorRoom[key] = room; st.decorPos[key] = posOf(id, x, foot);
  }));
  return st;
}
// rooms the saved layout doesn't have yet are filled with the starting furniture
export function fillSeed(layout) {
  const st = seedState();
  HS_ROOMS.forEach((k) => { if (!layout.rooms[k]) layout.rooms[k] = roomLayout(st, k, (id) => st.decorRoom[id]); });
  return layout;
}
// the admin: put the starting furniture into her own rooms once (she can then move it, store it, add more)
export function applySeed() {
  const st = S.get(); if (st.hsSeeded) return false;
  Object.entries(SEED).forEach(([room, list]) => list.forEach(([id, x, foot]) => {
    if (!ITEMS[id]) return;
    const got = S.newCopyId(id); st.owned.push(got); st.decorRoom[got] = room; st.decorPos[got] = posOf(id, x, foot);
    st.decorHidden = st.decorHidden.filter((o) => o !== got);
  }));
  st.hsSeeded = true; S.save(); return true;
}
// the admin: one more piece of Hide & Seek furniture into this room
function adminAddFurniture(room, done) {
  const ids = Object.keys(ITEMS).filter((id) => ITEMS[id].hs && !id.includes('#'));
  const m = html`<div class="card stack hs-add"><div class="h-title">🛋 Add furniture to this room</div>
      <div class="hs-add-grid">${ids.map((id) => `<button type="button" class="hs-add-it" data-id="${id}"><span data-icon="${id}"></span><small>${esc(ITEMS[id].en)}</small></button>`).join('')}</div>
      <button type="button" class="btn white" id="hs-add-close">Close</button></div>`;
  hydrateIcons(m);
  m.querySelectorAll('.hs-add-it').forEach((b) => { b.onclick = () => {
    const st = S.get(), got = S.newCopyId(b.dataset.id); st.owned.push(got); st.decorRoom[got] = room; st.decorPos[got] = { x: 40, y: 55 };
    st.decorHidden = st.decorHidden.filter((o) => o !== got); S.save(); sfx.coin();
    toast(`🛋 Added ${esc(ITEMS[b.dataset.id].en)} — use 🛠 to move it`, { ms: 2000 }); done && done();
  }; });
  $('#hs-add-close', m).onclick = closeModal; openModal(m);
}

// =====================================================================
// the game, for one visit to the Game Center
// =====================================================================
export function createHideSeek({ me, ch, others, host, getMine, getRoomKey, teleport, getMyWrap, isAdmin, say, refreshRoom }) {
  let game = null, offset = 0, lastPhase = null, lastId = null, busy = false, stopped = false, roomEl = null, joinedId = null;
  let meowAt = 0, missAt = 0, endShownFor = null, startShownFor = null, foundShown = new Set(), resultsOpen = false;
  const now = () => Date.now() + offset;
  const t = (s) => (s ? Date.parse(s) : 0);
  const players = () => (game && game.players) || [];
  const active = () => players().filter((p) => p.active);
  const meP = () => players().find((p) => p.id === me) || null;
  const inGame = () => { const p = meP(); return !!(p && p.active && (game.status !== 'play' || p.role)); };
  const nameOf = (id) => { const p = players().find((x) => x.id === id); return p ? p.name || 'Cat' : 'Cat'; };
  function phase() {
    if (!game) return 'none';
    if (game.status !== 'play') return game.status;
    return now() < t(game.hide_ends) ? 'hide' : now() < t(game.seek_ends) ? 'seek' : 'over';
  }
  const myRole = () => { const p = meP(); return game && game.status === 'play' && p && p.active ? p.role : null; };
  const amFound = () => { const p = meP(); return !!(p && p.found_by); };

  // ---------- talking to the server ----------
  async function call(name, body) {
    try { const r = await rpc(name, body); apply(r); return r; }
    catch (e) { const msg = String(e && e.message || e); if (/only the host/.test(msg)) toast('Only the host can do that'); else if (/need 2/.test(msg)) toast('You need at least 2 players'); else console.warn('hs', e); return null; }
  }
  const poll = () => (busy ? null : (busy = true, call('hs_state').finally(() => { busy = false; })));
  const ping = () => ch.send('hs', { id: me, kind: 'sync' });
  function apply(r) {
    if (!r || stopped) return;
    if (r.now) offset = Date.parse(r.now) - Date.now();
    const prev = game; game = r.game || null;
    if (r.full) toast(`This game is full (${MAX} players) — wait for the next round`, { ms: 2600 });
    changed(prev);
  }

  // ---------- reacting to what happened ----------
  function changed(prev) {
    const p = meP(), g = game;
    if (g && prev && prev.id === g.id && prev.status === 'lobby' && g.status === 'play' && p && p.role) gameStarted();
    if (g && g.status === 'play' && p && p.role && startShownFor !== g.id && (!prev || prev.id !== g.id || prev.status !== 'play')) gameStarted();
    // someone was found
    if (g && g.status === 'play') players().forEach((x) => {
      if (!x.found_by || foundShown.has(g.id + x.id)) return; foundShown.add(g.id + x.id);
      if (x.id === me) { sfx.miss(); banner(`😹 Found!`, `${esc(nameOf(x.found_by))} found you`, 'found'); if (!isAdmin() && getRoomKey() !== LOBBY) setTimeout(() => toLobby(), 1600); }
      else if (x.found_by === me) { sfx.coin(); banner(`🎉 Found ${esc(x.name)}!`, 'Nice seeking!', 'found'); }
      else toast(`🔍 ${esc(nameOf(x.found_by))} found ${esc(x.name)}!`, { ms: 2200 });
    });
    if (g && g.status === 'done' && prev && prev.id === g.id && prev.status === 'play') gameOver();
    if (g && g.status === 'done' && endShownFor !== g.id && players().some((x) => x.id === me && x.role) && (!prev || prev.id !== g.id)) { endShownFor = g.id; }   // finished while I was away: no fanfare
    draw();
  }
  function gameStarted() {
    const g = game, p = meP(); if (!p || !p.role || startShownFor === g.id) return;
    startShownFor = g.id; lastPhase = phase();
    sfx.coin();
    if (p.role === 'hider') banner('🙈 You are a HIDER!', `Go and hide in Room 1–4 — you have ${HIDE_S} seconds`, 'hider');
    else banner('🔍 You are a SEEKER!', `Wait in the lobby — the door opens in ${HIDE_S} seconds`, 'seeker');
    if (getRoomKey() !== LOBBY && !isAdmin()) toLobby();
  }
  function gameOver() {
    const g = game; if (endShownFor === g.id) return; endShownFor = g.id;
    const lost = players().filter((x) => x.role === 'hider' && !x.found_by && x.active);
    const hiders = players().filter((x) => x.role === 'hider');
    if (!lost.length && hiders.some((x) => x.found_by)) banner('🎉 Congratulations!', 'All hiders have been found!', 'end');
    else if (lost.length) banner(`😮 Ah! ${esc(listNames(lost.map((x) => x.name || 'Cat')))} ${lost.length > 1 ? 'have' : 'has'} not been found!`, lost.length > 1 ? 'The hiders win!' : 'The hider wins!', 'end');
    else banner('⏹ Game over', 'The game ended', 'end');
    if (lost.length || hiders.some((x) => x.found_by)) confetti && confetti();
    reward();
    setTimeout(() => { if (stopped) return; if (PLAY_ROOMS.includes(getRoomKey()) && !isAdmin()) toLobby(); showResults(); }, 3200);
  }
  const listNames = (a) => (a.length <= 1 ? a[0] || '' : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
  function toLobby() { teleport(LOBBY, 30 + Math.random() * 30, 8 + Math.random() * 8); }
  // 🪙 a few coins for playing (up to 5 rewarded games a day)
  function reward() {
    const g = game, p = meP(); if (!p || !p.role) return;
    const st = S.get(), day = new Date().toDateString(); st.hsRewards = st.hsRewards && st.hsRewards.day === day ? st.hsRewards : { day, n: 0, games: [] };
    const rw = st.hsRewards; if (rw.games.includes(g.id)) return;
    let n = 0, why = '';
    if (p.role === 'hider' && !p.found_by && p.active) { n = PRIZE_HIDE; why = 'never found'; }
    if (p.role === 'seeker') { const f = players().filter((x) => x.found_by === me).length; n = Math.min(PRIZE_FIND_MAX, f * PRIZE_FIND); why = `found ${f}`; }
    rw.games.push(g.id); rw.games = rw.games.slice(-20);
    if (!n) { S.save(); return; }
    if (rw.n >= DAILY_REWARDS) { S.save(); return toast(`🙈 Great game! (Coin prizes are for ${DAILY_REWARDS} games a day — come back tomorrow)`, { ms: 3000 }); }
    rw.n++; S.earn(n, `🙈 Hide & Seek (${why})`); S.save();
    setTimeout(() => toast(`🪙 +${n} coins into your bank — Hide & Seek (${why})`, { coins: n, ms: 3000 }), 2600);
  }

  // ---------- big animated words in the middle of the screen ----------
  function banner(title, sub = '', kind = '') {
    document.querySelectorAll('.hs-banner').forEach((b) => b.remove());
    const b = html`<div class="hs-banner ${kind}"><div class="hs-b-in"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
    host.appendChild(b); setTimeout(() => b.classList.add('out'), kind === 'start' ? 2400 : 2900); setTimeout(() => b.remove(), kind === 'start' ? 2900 : 3400);
  }

  // ---------- the clock (top of the screen) and phase changes ----------
  const timerEl = html`<div class="hs-timer hidden"><span class="hs-t-ic"></span><b class="hs-t-txt"></b><span class="hs-t-left"></span></div>`;
  host.appendChild(timerEl);
  // phones: the lobby panel and the seeker buttons sit under the room (the room is too small to read them in)
  const mslot = html`<div class="hs-mslot"></div>`;
  host.insertBefore(mslot, host.querySelector('#vlog') || null);
  const narrow = () => window.innerWidth <= 600;
  const slot = () => (narrow() ? mslot : roomEl);
  const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function tick() {
    if (stopped) return;
    const ph = phase(), g = game, rk = getRoomKey();
    const show = g && g.status === 'play' && (inGame() || isHsRoom(rk));
    timerEl.classList.toggle('hidden', !show);
    if (show) {
      const tb = document.querySelector('.topbar'); timerEl.style.top = `${Math.max(4, tb ? tb.getBoundingClientRect().bottom + 6 : 8)}px`;
      const left = ph === 'hide' ? t(g.hide_ends) - now() : t(g.seek_ends) - now();
      const hid = players().filter((x) => x.role === 'hider'), un = hid.filter((x) => !x.found_by && x.active).length;
      timerEl.className = `hs-timer ${ph === 'hide' ? 'hide' : 'seek'} ${left < 10500 ? 'urgent' : ''}`;
      $('.hs-t-ic', timerEl).textContent = ph === 'hide' ? '🙈' : '🔍';
      $('.hs-t-txt', timerEl).textContent = `${ph === 'hide' ? 'Hide time' : 'Seek time'} ${fmt(left)}`;
      $('.hs-t-left', timerEl).textContent = `Hiders left ${un}/${hid.length}`;
    }
    if (g && lastId === g.id && lastPhase === 'hide' && ph === 'seek' && meP() && meP().role) {
      sfx.coin(); banner('START!', 'Time to Find!', 'start');
      if (myRole() === 'hider' && !amFound()) setTimeout(() => toast('🤫 The seekers are coming — stay still!', { ms: 2400 }), 2600);
    }
    if (g && g.status === 'play' && ph === 'over' && !busy) poll();
    if (g && (ph !== lastPhase || lastId !== g.id)) { lastPhase = ph; lastId = g.id; draw(); }
    seekButtons();
  }
  const tickT = setInterval(tick, 250);
  const pollT = setInterval(() => { if (stopped || document.hidden) return; const rk = getRoomKey(); if (isHsRoom(rk) || inGame() || (rk === HALL && Date.now() % 6000 < 2100)) poll(); }, 2000);

  // ---------- who may go where ----------
  let lockToastAt = 0;
  const say1 = (msg) => { if (Date.now() - lockToastAt > 2500) { lockToastAt = Date.now(); sfx.miss(); toast(msg, { ms: 2600 }); } };
  function canGo(to) {
    if (!PLAY_ROOMS.includes(to)) return true;
    const ph = phase(), p = meP(), role = myRole();
    if (role === 'seeker' && ph === 'hide') { say1(`🙈 Seekers wait in the lobby until START! (${fmt(t(game.hide_ends) - now())})`); return false; }
    if (isAdmin()) return true;
    if (!game || game.status !== 'play') { say1('🔒 The rooms open when a game starts — wait in the lobby'); return false; }
    if (!p || !p.role || !p.active) { say1('🔒 A game is going on — join the next round in the lobby'); return false; }
    if (p.found_by) { say1('😹 You were found — wait in the lobby for the next round'); return false; }
    return true;
  }
  async function entered(to, from) {
    if (stopped) return;
    if (to === LOBBY && from !== LOBBY && !isHsRoom(from)) {   // walking in from the hall: join the lobby
      const r = await call('hs_join', { p_name: S.get().kitten.name || 'Cat' }); ping();
      const g = r && r.game;
      if (g && g.status === 'lobby') { joinedId = g.id; sfx.click(); toast(`🙈 Welcome to Hide & Seek! ${g.players.filter((x) => x.active).length}/${MAX} players`, { ms: 2200 }); }
      else if (g && g.status === 'play' && !meP()) toast('⏳ A game is going on — wait here for the next round', { ms: 2600 });
    }
    if (to === HALL && isHsRoom(from)) leaveGame();
    draw();
  }
  async function leaveGame() {
    const p = meP(); if (!p || !p.active) return;
    await call('hs_leave'); ping();
  }

  // ---------- walking into a door ----------
  function walkDoor(room) {
    const mine = getMine(), rk = getRoomKey(), maxY = S.roomMaxY(rk);
    if (mine.y < maxY - 1.5) return false;
    if (rk === HALL) {
      const d = DOORS.find((x) => mine.x >= x.x0 && mine.x <= x.x1); if (!d) return false;
      if (d.reno) { say1('🚧 Sorry — this room is being renovated. Coming soon!'); mine.y -= 3; return true; }
      teleport(d.to, 50, 6); return true;
    }
    if (rk === LOBBY && mine.x >= LOBBY_DOOR.x0 && mine.x <= LOBBY_DOOR.x1) {
      if (!canGo(LOBBY_DOOR.to)) { mine.y -= 3; return true; }
      teleport(LOBBY_DOOR.to, 10, 8); return true;
    }
    return false;
  }

  // ---------- 🔍 finding ----------
  const REACH_X = 13, REACH_Y = 11;
  function hiderCats() {
    const rk = getRoomKey();
    return players().filter((x) => x.role === 'hider' && !x.found_by && x.active && others.m.has(x.id))
      .map((x) => ({ p: x, c: others.m.get(x.id) })).filter(({ c }) => c && c.room === rk && c.el);
  }
  async function tryFind(target) {
    if (myRole() !== 'seeker' || phase() !== 'seek' || amFound()) return;
    if (Date.now() - missAt < 1200) return;
    const mine = getMine();
    const near = hiderCats().map((h) => ({ ...h, d: Math.hypot((h.c.dx ?? h.c.x) - mine.x, ((h.c.dy ?? h.c.y) - mine.y) * 1.2) }))
      .filter((h) => (!target || h.p.id === target) && Math.abs((h.c.dx ?? h.c.x) - mine.x) <= REACH_X && Math.abs((h.c.dy ?? h.c.y) - mine.y) <= REACH_Y)
      .sort((a, b) => a.d - b.d)[0];
    if (!near) { missAt = Date.now(); sfx.miss(); toast(target ? '👣 Get closer to catch them!' : '🤔 Nobody here… keep looking!', { ms: 1400 }); return; }
    const r = await call('hs_found', { p_hider: near.p.id });
    const got = r && r.game && r.game.players.find((x) => x.id === near.p.id);
    if (got && got.found_by === me) ch.send('hs', { id: me, kind: 'found', hider: near.p.id });
    else if (got && got.found_by) toast(`${esc(nameOf(got.found_by))} got there first!`);
  }
  // tap on a hiding cat (even through the furniture in front of her)
  function roomTap(e) {
    if (myRole() !== 'seeker' || phase() !== 'seek') return;
    const hit = hiderCats().find(({ c }) => { const r = c.el.querySelector('canvas').getBoundingClientRect(); return e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6; });
    if (!hit) return;
    e.stopPropagation(); e.preventDefault(); tryFind(hit.p.id);
  }
  // 🔔 make the hiders meow: shows which rooms they're in (and pops a "Meow!" over the ones in this room)
  function meow() {
    if (myRole() !== 'seeker' || phase() !== 'seek') return;
    const wait = MEOW_GAP * 1000 - (Date.now() - meowAt); if (wait > 0) return toast(`🔔 Ready again in ${Math.ceil(wait / 1000)}s`, { ms: 1400 });
    meowAt = Date.now(); sfx.click(); ch.send('hs', { id: me, kind: 'meow' });
    const rooms = new Map();
    players().filter((x) => x.role === 'hider' && !x.found_by && x.active).forEach((x) => { const c = others.m.get(x.id); if (c && c.room) rooms.set(c.room, (rooms.get(c.room) || 0) + 1); });
    const rk = getRoomKey();
    hiderCats().forEach(({ p }) => others.say(p.id, 'Meow!'));
    const names = [...rooms.keys()].map((k) => S.roomInfo(k).en.split(' · ')[0]);
    toast(names.length ? `🔔 You hear meows from ${listNames(names)}!${rooms.has(rk) ? ' (one is in here!)' : ''}` : '🔔 …silence. Hmm!', { ms: 3200 });
  }
  const keyH = (e) => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (e.key === 'f' || e.key === 'F') tryFind(); else if (e.key === 'm' || e.key === 'M') meow();
  };
  document.addEventListener('keydown', keyH);
  function seekButtons() {
    if (!roomEl || !roomEl.isConnected) return;
    const on = myRole() === 'seeker' && phase() === 'seek' && !amFound() && PLAY_ROOMS.includes(getRoomKey());
    let box = host.querySelector('.hs-seekbtns');
    if (box && box.parentElement !== slot()) { box.remove(); box = null; }
    if (!on) { if (box) box.remove(); return; }
    if (!box) {
      box = html`<div class="hs-seekbtns"><button type="button" class="hs-find">🔍 <b>Found you!</b><small>⌨ F</small></button><button type="button" class="hs-meow">🔔 <b>Meow!</b><small class="hs-meow-t">⌨ M</small></button></div>`;
      $('.hs-find', box).onclick = (e) => { e.stopPropagation(); tryFind(); };
      $('.hs-meow', box).onclick = (e) => { e.stopPropagation(); meow(); };
      box.addEventListener('pointerdown', (e) => e.stopPropagation());
      slot().appendChild(box);
    }
    const wait = Math.ceil((MEOW_GAP * 1000 - (Date.now() - meowAt)) / 1000);
    $('.hs-meow', box).classList.toggle('cool', wait > 0); $('.hs-meow-t', box).textContent = wait > 0 ? `${wait}s` : '⌨ M';
  }

  // ---------- messages from the others in the Game Center ----------
  function onBroadcast(p) {
    if (!p || stopped) return;
    if (p.kind === 'meow' && myRole() === 'hider' && !amFound()) {
      const w = getMyWrap(); if (w) say(w, 'Meow!'); sfx.click();
      toast('🔔 A seeker made you meow!', { ms: 1800 });
    }
    poll();
  }

  // ---------- drawing: the hall's doors, the lobby's panel, the rooms ----------
  function attach(room, rk) {
    roomEl = room; mslot.innerHTML = '';
    const g = game, playing = g && g.status === 'play';
    room.classList.toggle('hs-game', !!(playing && PLAY_ROOMS.includes(rk)));
    room.classList.toggle('hs-area', isHsRoom(rk) || rk === HALL);
    room.addEventListener('click', roomTap, true);
    if (rk === HALL) {
      const hud = html`<div class="gc-hud">${DOORS.map((d) => `<button type="button" class="gc-door ${d.reno ? 'reno' : ''}" data-door="${d.key}" style="left:${d.x0}%;width:${d.x1 - d.x0}%">
          <span class="gc-dsign">${d.label}</span>${d.reno ? '<span class="gc-tape"></span><span class="gc-renosign">🚧 RENOVATING 🚧<small>Sorry, we are fixing this room!</small></span><span class="gc-cone l"></span><span class="gc-cone r"></span>' : '<span class="gc-dstatus"></span>'}</button>`).join('')}
          <div class="gc-title">🕹️ GAME CENTER</div></div>`;
      hud.querySelectorAll('.gc-door').forEach((b) => { b.onclick = (e) => {
        e.stopPropagation(); const d = DOORS.find((x) => x.key === b.dataset.door);
        if (d.reno) return say1('🚧 Sorry — this room is being renovated. Coming soon!');
        sfx.click(); teleport(d.to, 50, 6);
      }; });
      room.appendChild(hud);
    }
    if (rk === LOBBY) {
      const hud = html`<div class="hs-hud"><button type="button" class="hs-ldoor" style="left:${LOBBY_DOOR.x0}%;width:${LOBBY_DOOR.x1 - LOBBY_DOOR.x0}%"><span class="gc-dsign">Room 1 ▶</span><span class="hs-lock">🔒</span></button></div>`;
      $('.hs-ldoor', hud).onclick = (e) => { e.stopPropagation(); if (canGo(LOBBY_DOOR.to)) { sfx.click(); teleport(LOBBY_DOOR.to, 10, 8); } };
      room.appendChild(hud);
      const pn = html`<div class="hs-panel"></div>`; pn.addEventListener('pointerdown', (e) => e.stopPropagation()); pn.addEventListener('click', (e) => e.stopPropagation());
      (narrow() ? mslot : hud).appendChild(pn);
    }
    if (isHsRoom(rk) && isAdmin()) {
      const b = html`<button type="button" class="hs-admin-add" title="Add furniture">🛋＋</button>`;
      b.onclick = (e) => { e.stopPropagation(); adminAddFurniture(rk, refreshRoom); };
      room.appendChild(b);
    }
    draw();
    if (!game || isHsRoom(rk)) poll();
  }
  function draw() {
    if (!roomEl || !roomEl.isConnected) return;
    const rk = getRoomKey(), g = game, ph = phase();
    roomEl.classList.toggle('hs-game', !!(g && g.status === 'play' && PLAY_ROOMS.includes(rk)));
    if (rk === HALL) {
      const st = roomEl.querySelector('.gc-door[data-door="hs"] .gc-dstatus'); if (!st) return;
      const n = g && g.status !== 'done' ? g.players.filter((x) => x.active).length : 0;
      st.textContent = !g || g.status === 'done' ? 'Walk in to play!' : g.status === 'play' ? `Game on · ${fmt(t(ph === 'hide' ? g.hide_ends : g.seek_ends) - now())}` : `${n}/${MAX} waiting`;
      return;
    }
    if (rk !== LOBBY) { seekButtons(); return; }
    const lock = roomEl.querySelector('.hs-lock');
    if (lock) { const open = isAdmin() && myRole() !== 'seeker' || (g && g.status === 'play' && ph === 'seek' && inGame() && !amFound()) || (myRole() === 'hider' && !amFound()); lock.textContent = open ? '' : '🔒'; lock.closest('.hs-ldoor').classList.toggle('open', !!open); }
    const panel = host.querySelector('.hs-panel'); if (!panel) return;
    panel.innerHTML = panelHtml(); hydrateIcons(panel); wirePanel(panel);
  }
  function panelHtml() {
    const g = game, p = meP(), ph = phase();
    if (!g || (g.status === 'done' && !p)) return `<div class="hs-ph"><b>🙈 Hide &amp; Seek</b></div><p>No game yet.</p><button type="button" class="btn green small" data-act="join">🙋 Join a game</button>`;
    if (g.status === 'done') {
      const hiders = players().filter((x) => x.role === 'hider'), seekers = players().filter((x) => x.role === 'seeker');
      return `<div class="hs-ph"><b>🏁 Results</b><button type="button" class="hs-x" data-act="dismiss" aria-label="Close">✕</button></div>
        <div class="hs-res"><div><b>🙈 Hiders</b>${hiders.map((x) => `<div class="hs-row ${x.found_by ? 'lost' : 'win'}">${x.found_by ? '😹' : '🏆'} ${esc(x.name || 'Cat')} <small>${x.found_by ? `found by ${esc(nameOf(x.found_by))} after ${fmt(t(x.found_at) - t(g.hide_ends))}` : 'never found!'}</small></div>`).join('')}</div>
        <div><b>🔍 Seekers</b>${seekers.map((x) => { const f = players().filter((y) => y.found_by === x.id).length; return `<div class="hs-row">${f ? '⭐'.repeat(Math.min(4, f)) : '🔍'} ${esc(x.name || 'Cat')} <small>found ${f}</small></div>`; }).join('')}</div></div>
        <button type="button" class="btn green small" data-act="join">🔁 Play again</button>`;
    }
    const act = active(), n = act.length, k = hidersFor(n), isHost = g.host === me;
    if (g.status === 'play') {
      const hid = players().filter((x) => x.role === 'hider');
      return `<div class="hs-ph"><b>🙈 Game on!</b><span>${ph === 'hide' ? 'Hiding' : 'Seeking'}</span></div>
        ${p && p.role ? `<p class="hs-me">${p.found_by ? '😹 You were found! Cheer on the others.' : p.role === 'hider' ? '🙈 You are a <b>hider</b> — go through the door ▶ and hide!' : ph === 'hide' ? '🔍 You are a <b>seeker</b> — wait here until START!' : '🔍 You are a <b>seeker</b> — go find them! ▶'}</p>` : '<p class="hs-me">⏳ A game is going on — you can play in the next round.</p>'}
        <div class="hs-list">${hid.map((x) => `<span class="hs-chip ${x.found_by ? 'lost' : ''}">${x.found_by ? '😹' : '🙈'} ${esc(x.name || 'Cat')}</span>`).join('')}</div>
        ${isHost || isAdmin() ? '<button type="button" class="btn white small" data-act="end">⏹ End game</button>' : ''}`;
    }
    // the lobby
    if (!p || !p.active) return `<div class="hs-ph"><b>🙈 Hide &amp; Seek</b><span>${n}/${MAX}</span></div><p>${n >= MAX ? 'This game is full.' : 'Join the game!'}</p>${n < MAX ? '<button type="button" class="btn green small" data-act="join">🙋 Join</button>' : ''}`;
    const picks = act.filter((x) => x.pick).length, hostName = nameOf(g.host);
    const wantIc = { hide: '🙈', seek: '🔍', any: '🎲' };
    return `<div class="hs-ph"><b>🙈 Hide &amp; Seek</b><span>${n}/${MAX} players</span></div>
      <p class="hs-rule">${n < 2 ? 'Waiting for at least 2 players…' : `${n} players → <b>${k} hider${k > 1 ? 's' : ''}</b>, ${n - k} seeker${n - k > 1 ? 's' : ''}`}</p>
      <div class="hs-list">${act.map((x) => `<div class="hs-row ${x.pick ? 'picked' : ''}"><span>${x.id === g.host ? '👑' : ''}${esc(x.name || 'Cat')}${x.id === me ? ' (you)' : ''} <small title="wants to">${wantIc[x.want] || '🎲'}</small></span>
        ${isHost ? `<button type="button" class="hs-pick ${x.pick ? 'on' : ''}" data-act="pick" data-id="${x.id}" ${!x.pick && picks >= k ? 'disabled' : ''}>${x.pick ? '🙈 Hider' : 'Make hider'}</button>` : x.pick ? '<span class="hs-pick on">🙈 Hider</span>' : ''}</div>`).join('')}</div>
      <div class="hs-want"><span>I want to:</span>${['hide', 'seek', 'any'].map((w) => `<button type="button" class="${p.want === w ? 'on' : ''}" data-act="want" data-w="${w}">${wantIc[w]} ${w === 'any' ? 'Either' : w[0].toUpperCase() + w.slice(1)}</button>`).join('')}</div>
      ${isHost ? `<p class="hs-tip">👑 You're the host: choose ${k || 1} hider${k > 1 ? 's' : ''} (or leave it — we'll pick for you), then start.</p>
        <div class="hs-btns"><button type="button" class="btn white small" data-act="random">🎲 Random</button><button type="button" class="btn green small" data-act="start" ${n < 2 ? 'disabled' : ''}>▶ Start game</button></div>`
        : `<p class="hs-tip">Waiting for 👑 ${esc(hostName)} to start…</p>`}`;
  }
  function wirePanel(panel) {
    panel.querySelectorAll('[data-act]').forEach((b) => { b.onclick = async (e) => {
      e.stopPropagation(); if (b.disabled) return; sfx.click();
      const a = b.dataset.act;
      if (a === 'join') { const r = await call('hs_join', { p_name: S.get().kitten.name || 'Cat' }); ping(); if (r && r.game && r.game.status === 'lobby') joinedId = r.game.id; }
      else if (a === 'want') { await call('hs_want', { p_want: b.dataset.w }); ping(); }
      else if (a === 'pick') { const x = players().find((y) => y.id === b.dataset.id); await call('hs_pick', { p_user: b.dataset.id, p_on: !(x && x.pick) }); ping(); }
      else if (a === 'random') { await Promise.all(active().filter((x) => x.pick).map((x) => rpc('hs_pick', { p_user: x.id, p_on: false }).catch(() => {}))); await poll(); ping(); toast('🎲 Hiders will be picked at random (volunteers first)', { ms: 2000 }); }
      else if (a === 'start') {
        const n = active().length, k = hidersFor(n);
        const ok = await confirmBox('▶ Start Hide & Seek?', `${n} players: ${k} hider${k > 1 ? 's' : ''} and ${n - k} seeker${n - k > 1 ? 's' : ''}.<br>Hiders get ${HIDE_S} seconds to hide, then seekers get ${SEEK_S / 60} minutes to find them.`, 'Start!', 'Not yet');
        if (!ok) return;
        await call('hs_start'); ping();
      }
      else if (a === 'end') { const ok = await confirmBox('⏹ End this game?', 'Everyone goes back to the lobby.', 'End game', 'Keep playing'); if (ok) { await call('hs_end'); ping(); } }
      else if (a === 'dismiss') { game = null; draw(); }
    }; });
  }
  function showResults() { draw(); }

  function stop() {
    if (stopped) return;
    const p = meP(); if (p && p.active) rpc('hs_leave').catch(() => {});
    stopped = true; clearInterval(tickT); clearInterval(pollT); document.removeEventListener('keydown', keyH);
    timerEl.remove(); mslot.remove(); document.querySelectorAll('.hs-banner').forEach((b) => b.remove());
  }
  return { attach, canGo, entered, walkDoor, onBroadcast, stop, poll, _debug: () => ({ game, phase: phase(), offset }), _apply: apply };
}
