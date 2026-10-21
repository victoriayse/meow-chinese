// 🎾 The Tennis Court (right of the soccer pitch): 2–4 cats, up to 2 a side. First to 7 points wins.
// The server keeps the match (sides, score) so everyone sees the same thing.
// The ball never "drifts": every hit is sent once as a whole flight (where from, where to, how high, how long, and
// whether it will clear the net, land in or land out). Every screen draws the ball from that same flight, so it is in
// the same place for everyone and can't jitter on the net or on a cat. The cat who hit last reports the point.
import * as S from './state.js';
import { rest } from './cloud.js';
import { html, $, toast, confirmBox, openModal, closeModal, coinI, hydrateIcons, confetti } from './ui.js';
import { sfx } from './audio.js';
import { drawGrid, artGrid, FURS } from './pixel.js';

const rpc = (name, body = {}) => rest('rpc/' + name, { method: 'POST', body: JSON.stringify(body) });
export const FEE = 10, PRIZE = 20, WIN_AT = 7, SIDE_MAX = 2;
// the court, in room % (x from the left, y up from the bottom); the room is 720 × 600 (7.2 px per % across, 6 px per % up)
export const COURT = { x0: 8.3, x1: 91.7, y0: 4, y1: 46, net: 50 };
const PY = 6;                                      // room px per % up (heights are in room px)
const NET_H = 30;                                  // the net is this high (room px)
const REACH_X = 11, REACH_Y = 10, REACH_Z = 80;    // how far a cat can reach with her racket
const TEAM = { red: { zh: '红队', en: 'Red', dot: '🔴', half: '◀ left' }, blue: { zh: '蓝队', en: 'Blue', dot: '🔵', half: 'right ▶' } };
const BALL_ART = ['.oooo.', 'oyyywo', 'oyyyyo', 'owyyyo', 'oyyyyo', '.oooo.'];
const BALL_PAL = { o: '#5a6a1a', y: '#d8f040', w: '#ffffff' };
// a racket held in her paw: an oval head with strings, the throat, and her white paw wrapped round the handle
const RACKET_ART = ['..ooooo..', '.oswswso.', 'oswswswso', 'oswswswso', 'oswswswso', '.oswswso.', '..ooooo..', '...oko...', '....o....', '..ooooo..', '.owwwwwo.', '.owpwpwo.', '.owwwwwo.', '..ooooo..', '...ohho..', '....oo...'];
const RACKET_PAL = { o: '#3a2a35', s: '#ffffff', w: '#e8384f', k: '#e8384f', h: '#2b2b44', p: '#f4b8c8' };
const other = (side) => (side === 'red' ? 'blue' : 'red');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);

const errText = (e) => {
  const m = String((e && e.message) || e || '');
  if (/in progress/.test(m)) return '比赛进行中 · A match is being played — watch from the side!';
  if (/team full/.test(m)) return '这边满了 · That side is full (2 players)';
  if (/each side/.test(m)) return '两边都要有人 · Both sides need a player';
  if (/join a team/.test(m)) return '先选一边 · Pick a side first';
  return '连不上，再试一次 · Couldn\'t connect — try again';
};

// ---------- the ball's flight (the same sums on every screen) ----------
// A shot: { seq, by, side, t0 (server ms), x0, y0, z0, x1, y1, T (s), H (room px), kind: 'in' | 'out' | 'net', serve }
// at(shot, t) → where the ball is t seconds after it was hit: { x, y, z }
export function at(s, t) {
  const vx = (s.x1 - s.x0) / s.T, vy = (s.y1 - s.y0) / s.T;
  const fly = (u) => s.z0 * (1 - u) + 4 * s.H * u * (1 - u);
  if (s.kind === 'net') {
    // it flies up to the net, stops dead against it and drops straight down on the hitter's side
    const tn = netTime(s);
    if (t <= tn) return { x: s.x0 + vx * t, y: s.y0 + vy * t, z: fly(t / s.T) };
    const zn = Math.max(0, fly(tn / s.T)), d = t - tn, G = 900, tf = Math.sqrt((2 * zn) / G);
    const xs = COURT.net - Math.sign(vx) * 0.9, ys = s.y0 + vy * tn;
    if (d <= tf) return { x: xs, y: ys, z: zn - 0.5 * G * d * d };
    const h = d - tf, hop = 0.28;                                   // one little hop back off the net, then it rests
    if (h <= hop) { const u = h / hop; return { x: xs - Math.sign(vx) * 1.6 * u, y: ys, z: 4 * Math.min(10, zn * 0.3) * u * (1 - u) }; }
    return { x: xs - Math.sign(vx) * 1.6, y: ys, z: 0 };
  }
  if (t <= s.T) return { x: s.x0 + vx * t, y: s.y0 + vy * t, z: fly(t / s.T) };
  // after it lands it bounces on (lower, slower), then a little hop, then it rolls to a stop
  const T2 = s.T * 0.62, H2 = Math.max(16, s.H * 0.45), T3 = s.T * 0.3, H3 = H2 * 0.3;
  let x = s.x1, y = s.y1, d = t - s.T, z = 0;
  const seg = (dur, k, hh) => { const u = Math.min(d, dur); x += vx * k * u; y += vy * k * u; if (d < dur) z = 4 * hh * (u / dur) * (1 - u / dur); d -= dur; };
  seg(T2, 0.8, H2);
  if (d > 0) seg(T3, 0.55, H3);
  if (d > 0) { const roll = Math.min(d, 0.8); x += vx * 0.3 * (roll - (roll * roll) / 1.6); y += vy * 0.3 * (roll - (roll * roll) / 1.6); z = 0; }
  return { x: clamp(x, 1, 99), y: clamp(y, 0.5, 52), z: Math.max(0, z) };
}
// when it reaches the net (s after the hit)
export const netTime = (s) => s.T * clamp((COURT.net - s.x0) / ((s.x1 - s.x0) || 1e-6), 0, 1);
// what happens and when: the point is over at `at` seconds, won by `winner`
export function outcome(s) {
  if (s.kind === 'net') {
    const tn = netTime(s), zn = Math.max(0, s.z0 * (1 - tn / s.T) + 4 * s.H * (tn / s.T) * (1 - tn / s.T));
    return { at: tn + Math.sqrt((2 * zn) / 900) + 0.15, winner: other(s.side), call: 'net' };
  }
  if (s.kind === 'out') return { at: s.T, winner: other(s.side), call: 'out' };
  return { at: s.T + s.T * 0.62, winner: s.side, call: 'point' };        // in, and nobody got to it before its second bounce
}
// is (x, y) inside the half of the court that `side` plays on?
const inHalf = (side, x, y) => y >= COURT.y0 && y <= COURT.y1 && (side === 'red' ? x >= COURT.x0 && x < COURT.net : x > COURT.net && x <= COURT.x1);

// plan a shot from where the ball is now (`p`) to the other side. `q` is how well she hit it (0 = perfect … 1 = only just reached)
export function planShot({ side, by, seq, t0, p, q = 0, serve = false, aimY = 0 }) {
  const dir = side === 'red' ? 1 : -1, far = other(side);
  const fault = serve ? 0 : (q < 0.55 ? 0.03 : 0.03 + (q - 0.55) * 0.45);   // at most about 1 in 4, at full stretch   // a stretch for the ball goes wrong more often
  const roll = Math.random();
  let kind = roll < fault ? (Math.random() < 0.55 ? 'net' : 'out') : 'in';
  const x0 = clamp(p.x, 2, 98), y0 = clamp(p.y, 1, 50), z0 = clamp(p.z, 14, 90);
  let x1, y1;
  if (serve) {                                   // into the service box on the far side, diagonally across
    x1 = COURT.net + dir * rnd(6, 19); y1 = y0 > (COURT.y0 + COURT.y1) / 2 ? rnd(9, 22) : rnd(28, 41);
  } else if (kind === 'out') {                   // long (past the far baseline) or wide (past a side line)
    if (Math.random() < 0.6) { x1 = far === 'blue' ? rnd(93.5, 97.5) : rnd(2.5, 6.5); y1 = rnd(8, 42); }
    else { x1 = COURT.net + dir * rnd(10, 36); y1 = Math.random() < 0.5 ? rnd(47.5, 51) : rnd(0.8, 2.5); }
  } else {
    x1 = COURT.net + dir * rnd(9, 37);
    y1 = clamp(rnd(9, 41) + aimY * 9, 7, 43);
  }
  const T = (serve ? 1.25 : 1.15) + (Math.abs(x1 - x0) / 100) * 0.9;
  const un = clamp((COURT.net - x0) / ((x1 - x0) || 1e-6), 0.05, 0.95), k = 4 * un * (1 - un);
  let H;
  if (kind === 'net') H = Math.max(0, (NET_H * 0.45 - z0 * (1 - un)) / k);                         // too low: into the net
  else H = Math.max(rnd(55, 80), (NET_H + 14 - z0 * (1 - un)) / k);                                // well over the net
  if (kind === 'in' && !inHalf(far, x1, y1)) kind = 'out';
  return { seq, by, side, t0: Math.round(t0), x0, y0, z0, x1, y1, T, H, kind, serve: !!serve };
}

export function createTennis({ me, ch, others, getMine, getMyEl, getMyKv, teleport, getRoomKey }) {
  let room = null, hud = null, ballEl = null, shadowEl = null, markEl = null, netEl = null, callEl = null, hitBtn = null, raf = 0;
  let match = null, offset = 0, busy = false, polling = false, lastScore = -1, lastStatus = null, alive = true, lastSwing = 0;
  let rally = null;   // { no, seq, shot, readyAt, called, reported, reportedAt }
  let aim = 0, aimAt = 0;   // which way she was pushing the joystick (up = aim deep, down = aim short)

  const now = () => Date.now() + offset;
  const myTicket = () => S.get().tennisTicket || null;
  const live = () => match && (match.status === 'lobby' || match.status === 'playing');
  const players = () => (live() && match.players) || [];
  const myPlayer = () => players().find((p) => p.id === me);
  const playing = () => match && match.status === 'playing';
  const count = (side) => players().filter((p) => p.side === side).length;
  const here = () => getRoomKey() === 'tennis' && room && room.isConnected;

  // ---------- whose serve (it changes every 2 points, like a tie-break; partners take turns) ----------
  function server(no) {
    const side = Math.floor((no + 1) / 2) % 2 === 0 ? 'red' : 'blue';
    const team = players().filter((p) => p.side === side);
    return team.length ? { side, id: team[Math.floor(no / 4) % team.length].id } : null;
  }
  // where everyone stands for the start of a point
  function spots(no) {
    const sv = server(no); if (!sv) return {};
    const deuce = no % 2 === 0, out = {};
    ['red', 'blue'].forEach((side) => {
      const team = players().filter((p) => p.side === side), back = side === 'red' ? 11 : 89, front = side === 'red' ? 36 : 64;
      const lead = side === sv.side ? team.find((p) => p.id === sv.id) || team[0] : team[0];
      const rest = team.filter((p) => p !== lead);
      const ly = side === sv.side ? (deuce ? 15 : 35) : (deuce ? 35 : 15);
      if (lead) out[lead.id] = { x: back, y: ly };
      rest.forEach((p) => { out[p.id] = { x: front, y: ly > 25 ? 16 : 34 }; });
    });
    return out;
  }
  function newRally(no) {
    rally = { no, seq: 0, shot: null, readyAt: now() + 1800, called: false, reported: false, reportedAt: 0 };
    const p = myPlayer(), sp = spots(no)[me];
    if (p && sp && here()) teleport(sp.x, sp.y, p.side === 'blue');
  }

  // ---------- the cats' positions ----------
  function catAt(id) {
    if (id === me) { const m = getMine(); return { x: m.x, y: m.y, left: !!m.left }; }
    const c = others.m.get(id); if (!c) return null;
    return { x: c.dx != null ? c.dx : c.x, y: c.dy != null ? c.dy : c.y, left: c.kv ? !!c.kv.left : !!c.left };
  }
  // keep a player on her own half while a match is on
  function keepIn(mine, dy = 0) {
    if (dy) { aim = dy; aimAt = Date.now(); }
    const p = myPlayer(); if (!playing() || !p || !here()) return;
    if (p.side === 'red') mine.x = clamp(mine.x, 6, COURT.net - 3.5); else mine.x = clamp(mine.x, COURT.net + 3.5, 94);
  }

  // ---------- hitting ----------
  function swingAnim(el, left) {
    if (!el) return; const r = el.querySelector('.t-racket'); if (!r) return;
    r.classList.toggle('l', !!left); r.classList.remove('swing'); void r.offsetWidth; r.classList.add('swing');
  }
  function hit() {
    const p = myPlayer(), mine = getMine();
    if (!playing() || !p || !here() || !rally || mine.seat) return;
    const t = now(); if (t - lastSwing < 350) return; lastSwing = t;
    const left = p.side === 'blue';
    swingAnim(getMyEl(), left); const kv = getMyKv(); if (kv) kv.setFacing(left);
    ch.send('tswing', { id: me, left });
    // the serve: the server tosses it up and hits it over
    if (rally.seq === 0) {
      const sv = server(rally.no);
      if (!sv || sv.id !== me) return sfx.click();
      if (t < rally.readyAt) return;
      serve(me);
      return;
    }
    const s = rally.shot; if (!s || s.side === p.side || s.kind === 'net' || rally.called) { sfx.click(); return; }
    const dt = (t - s.t0) / 1000, oc = outcome(s);
    if (dt >= oc.at || (s.kind === 'in' && dt >= s.T + s.T * 0.62)) { sfx.click(); return; }
    const b = at(s, dt);
    if (!inMyHalfForHit(p.side, b.x)) { sfx.click(); return; }
    const reachX = mine.x + (left ? -3 : 3);
    const qx = Math.abs(b.x - reachX) / REACH_X, qy = Math.abs(b.y - mine.y) / REACH_Y;
    if (qx > 1 || qy > 1 || b.z > REACH_Z) { sfx.click(); return; }          // missed it: a swing at thin air
    const aimY = Date.now() - aimAt < 400 ? clamp(aim, -1, 1) : 0;
    const shot = planShot({ side: p.side, by: me, seq: rally.seq + 1, t0: t, p: b, q: Math.hypot(qx, qy) / Math.SQRT2, aimY });
    take(shot); ch.send('tshot', { id: me, m: match.id, no: rally.no, shot }); sfx.coin();
  }
  const inMyHalfForHit = (side, x) => (side === 'red' ? x < COURT.net - 0.5 : x > COURT.net + 0.5);
  function serve(id) {
    const sv = server(rally.no), c = catAt(id); if (!sv || !c) return;
    const dir = sv.side === 'red' ? 1 : -1;
    const shot = planShot({ side: sv.side, by: id, seq: 1, t0: now(), p: { x: c.x + dir * 4, y: c.y, z: 96 }, serve: true });
    take(shot); ch.send('tshot', { id: me, m: match.id, no: rally.no, shot });
    if (id === me) sfx.coin();
  }
  // a shot (mine or someone else's): the next one in the rally, or the earlier of two hits at the same moment
  function take(s) {
    if (!rally || !s) return false;
    const cur = rally.shot;
    if (s.seq === rally.seq + 1) {
      if (cur && rally.called) { const oc = outcome(cur); if ((s.t0 - cur.t0) / 1000 > oc.at + 0.6) return false; }   // too late: the point was over
      rally.seq = s.seq; rally.shot = s; rally.called = false; rally.reported = false;
    } else if (cur && s.seq === rally.seq && (s.t0 < cur.t0 || (s.t0 === cur.t0 && s.by < cur.by))) {
      rally.shot = s; rally.called = false; rally.reported = false;
    } else return false;
    if (s.by !== me) { const c = others.m.get(s.by); if (c && c.el) swingAnim(c.el, s.side === 'blue'); }
    start(); return true;
  }
  function onShot(p) {
    if (!match || p.m !== match.id || !rally || p.no !== rally.no || !p.shot) return;
    const s = p.shot; if (!['in', 'out', 'net'].includes(s.kind) || !(s.T > 0)) return;
    if (take(s) && s.by !== me) sfx.click();
  }

  // ---------- the point is over ----------
  function call(kind, s) {
    rally.called = true;
    const txt = { net: '🥅 <span class="zh">下网！</span> NET!', out: '🚫 <span class="zh">出界！</span> OUT!', point: '🎾 <span class="zh">得分！</span> POINT!' }[kind];
    const b = at(s, (now() - s.t0) / 1000);
    if (callEl && callEl.isConnected) {
      callEl.innerHTML = txt; callEl.className = `tn-call ${kind}`; callEl.style.left = `${clamp(b.x, 14, 86)}%`; callEl.style.bottom = `${clamp(b.y + 12, 14, 70)}%`;
      void callEl.offsetWidth; callEl.classList.add('show');
    }
    if (kind === 'net' && netEl) { netEl.classList.remove('shake'); void netEl.offsetWidth; netEl.classList.add('shake'); }
    if (myPlayer()) (outcome(s).winner === myPlayer().side ? sfx.correct : sfx.miss)();
  }
  async function report() {
    const s = rally.shot, m = match, no = rally.no; if (!s || !m) return;
    rally.reported = true; rally.reportedAt = now();
    try { apply(await rpc('tennis_point', { p_match: m.id, p_no: no + 1, p_side: outcome(s).winner })); ch.send('tmatch', { id: me }); }
    catch { /* another player's report will count it */ }
  }

  // ---------- every frame: the ball, the cats' rackets, the referee ----------
  function loop() {
    raf = 0; if (!alive) return;
    const t = now();
    if (playing() && rally) {
      const s = rally.shot;
      if (s) {
        const oc = outcome(s), dt = (t - s.t0) / 1000;
        if (!rally.called && dt >= oc.at) call(oc.call, s);
        const p = myPlayer();
        if (rally.called && !rally.reported && p) {
          if ((s.by === me && dt >= oc.at + 0.6) || dt >= oc.at + 3.5) report();   // the hitter reports; anyone else if she can't
        }
        if (rally.reported && t - rally.reportedAt > 2500 && match.red + match.blue === rally.no) rally.reported = false;   // not counted yet: try again
      } else if (myPlayer()) {
        // nobody served: the server's screen serves for her after a while (or anyone's, if she has gone quiet)
        const sv = server(rally.no);
        if (sv && ((sv.id === me && t > rally.readyAt + 9000) || t > rally.readyAt + 16000)) serve(sv.id);
      }
    }
    draw(t); rackets();
    raf = requestAnimationFrame(loop);
  }
  const start = () => { if (!raf && alive) raf = requestAnimationFrame(loop); };
  function draw(t) {
    if (!ballEl || !ballEl.isConnected) return;
    let b = null, mark = null;
    if (playing() && rally) {
      if (rally.shot) {
        const s = rally.shot; b = at(s, (t - s.t0) / 1000);
        const p = myPlayer();
        if (p && s.side !== p.side && s.kind !== 'net' && (t - s.t0) / 1000 < s.T) mark = { x: s.x1, y: s.y1 };   // where it will land
      } else {
        const sv = server(rally.no), c = sv && catAt(sv.id);
        if (c) b = { x: c.x + (sv.side === 'red' ? 4 : -4), y: c.y, z: 96 + 10 * Math.abs(Math.sin(t / 260)) };   // bouncing it, ready to serve
      }
    }
    const show = !!b;
    ballEl.classList.toggle('hidden', !show); shadowEl.classList.toggle('hidden', !show);
    if (show) {
      ballEl.style.left = `${b.x}%`; ballEl.style.bottom = `${b.y + b.z / PY}%`;
      shadowEl.style.left = `${b.x}%`; shadowEl.style.bottom = `${b.y}%`;
      const k = clamp(1 - b.z / 180, 0.5, 1); shadowEl.style.transform = `translate(-50%, 50%) scale(${k})`; shadowEl.style.opacity = String(0.55 + 0.45 * k);
    }
    markEl.classList.toggle('hidden', !mark);
    if (mark) { markEl.style.left = `${mark.x}%`; markEl.style.bottom = `${mark.y}%`; }
    // HIT lights up when the ball is coming her way and in reach (or it is her serve)
    if (hitBtn) {
      const p = myPlayer(), on = playing() && !!p && here();
      hitBtn.classList.toggle('hidden', !on);
      let ready = false;
      if (on && rally) {
        const mine = getMine();
        if (!rally.shot) { const sv = server(rally.no); ready = !!sv && sv.id === me && t >= rally.readyAt; }
        else if (b && rally.shot.side !== p.side && !rally.called && rally.shot.kind !== 'net' && inMyHalfForHit(p.side, b.x)) {
          const rx = mine.x + (p.side === 'blue' ? -3 : 3);
          ready = Math.abs(b.x - rx) <= REACH_X && Math.abs(b.y - mine.y) <= REACH_Y && b.z <= REACH_Z;
        }
      }
      hitBtn.classList.toggle('ready', ready);
    }
  }
  const pawFur = (id) => { const look = id === me ? { fur: S.get().kitten.fur } : ((others.m.get(id) || {}).look || {}); return (FURS[look.fur] || FURS.ginger).w; };   // the same colour as her paws
  // the players hold rackets (and wear their side's colour on their name tags)
  function rackets() {
    if (!here()) return;
    const team = new Map(((match && (match.status === 'lobby' || match.status === 'playing') && match.players) || []).map((p) => [p.id, p.side]));
    const dress = (el, id, left) => {
      if (!el) return;
      const t = team.get(id) || ''; if (el.dataset.team !== t) el.dataset.team = t;
      const wrap = el.querySelector('.kflip'); if (!wrap) return;   // inside the picture, so it is scaled with her
      let r = wrap.querySelector('.t-racket');
      if (t && playing() && !r) { r = document.createElement('div'); r.className = 't-racket'; const c = document.createElement('canvas'); drawGrid(c, artGrid(RACKET_ART.map((row, y) => (y >= 9 && y <= 13 ? row.replace(/w/g, 'f') : row)), { ...RACKET_PAL, f: pawFur(id) }), 4); r.append(c); wrap.append(r); }
      if (r && !(t && playing())) { r.remove(); r = null; }
      if (r && !r.classList.contains('swing')) r.classList.toggle('l', !!left);
    };
    others.ids().forEach((id) => { const c = others.m.get(id); if (c && c.el) dress(c.el, id, c.kv ? c.kv.left : c.left); });
    dress(getMyEl(), me, getMine().left);
  }

  // ---------- the match (from the server) ----------
  async function poll() {
    if (polling || !alive) return; polling = true;
    try { apply(await rpc('tennis_state', { p_ticket: (myTicket() || {}).match || null })); }
    catch { /* keep the last score while offline */ }
    finally { polling = false; }
  }
  function apply(st) {
    if (!st) return;
    if (st.now) offset = Date.parse(st.now) - Date.now();
    const prev = match; match = st.match || null;
    const hadTicket = !!(myTicket() && match && myTicket().match === match.id);
    if (st.ticket !== undefined) settle(st.ticket);
    const score = match ? match.red + match.blue : -1, status = match && match.status;
    const sameMatch = prev && match && prev.id === match.id;
    if (match && status === 'playing' && !(sameMatch && prev.status === 'playing')) {
      newRally(score); if (sameMatch || myPlayer()) { sfx.fanfare(); toast(`🎾 <span class="zh">比赛开始！</span> Play! First to ${WIN_AT} points wins`, { ms: 2600 }); }
    } else if (sameMatch && status === 'playing' && score !== lastScore) {
      const side = match.red > prev.red ? 'red' : 'blue';
      toast(`🎾 ${TEAM[side].dot} <span class="zh">${TEAM[side].zh}得分</span> Point to ${TEAM[side].en}! ${match.red} : ${match.blue}`, { ms: 1800 });
      setTimeout(() => { if (alive && match && match.status === 'playing' && match.red + match.blue === score) newRally(score); }, 900);
    }
    if (sameMatch && status === 'done' && lastStatus === 'playing' && !hadTicket) {
      toast(`🏆 ${TEAM[match.winner].dot} <span class="zh">${TEAM[match.winner].zh}赢了！</span> ${TEAM[match.winner].en} wins ${match.red} : ${match.blue}`, { ms: 4000 });
    }
    if (sameMatch && status === 'cancelled' && lastStatus === 'playing' && !hadTicket) toast('⏹ <span class="zh">比赛结束了</span> The match was ended early — no winner this time', { ms: 3000 });
    if (!match || status !== 'playing') rally = null;
    lastScore = score; lastStatus = status;
    drawHud(); start();
  }
  // pay-out: each winner gets 20 coins (her 10 back + 10 more, into the bank); a cancelled match gives everyone their 10 back
  function settle(t) {
    const tk = myTicket(); if (!tk) return;
    if (!t || t.id !== tk.match) return;
    if (t.status === 'done') {
      const won = t.winner === tk.side;
      delete S.get().tennisTicket; if (won) S.earn(PRIZE, '🎾 网球赢了 Tennis win'); S.save();
      showResult(t, tk.side, won);
    } else if (t.status === 'cancelled' || (t.status === 'lobby' && !t.side)) {
      delete S.get().tennisTicket; S.get().coins += FEE; S.save();
      toast(`⏹ <span class="zh">比赛结束，退回${FEE}金币</span> Match ended with no winner — ${FEE} coins returned`, { coins: FEE });
    }
  }
  function showResult(t, side, won) {
    const w = TEAM[t.winner];
    const box = html`<div class="card stack stadium-result"><div class="h-title">${won ? '🏆 <span class="zh">恭喜！你们赢了！</span> Game, set and match!' : '🎾 <span class="zh">比赛结束</span> Match over'}</div>
      <div class="stadium-final"><span class="red">🔴 ${t.red}</span> : <span class="blue">${t.blue} 🔵</span></div>
      <p>${w.dot} <b><span class="zh">${w.zh}</span> ${w.en}</b> wins!</p>
      <p class="help">${won ? `<b>+${PRIZE}</b>${coinI(18)} <span class="zh">${PRIZE}金币存进了银行！</span><br>${PRIZE} coins went into your bank (your ${FEE} back + ${PRIZE - FEE} more).` : '<span class="zh">下次加油！</span> Good game — try again next time!'}</p>
      <button class="btn green sr-ok">好 OK</button></div>`;
    $('.sr-ok', box).onclick = closeModal; openModal(box); hydrateIcons(box);
    if (won) { confetti(); sfx.fanfare(); }
  }

  // ---------- buttons ----------
  async function join(side) {
    if (busy) return;
    if (S.get().stadiumTicket) return toast('⚽ <span class="zh">先踢完足球赛</span> Finish your soccer match first');
    const tk = myTicket();
    if (tk && (!match || tk.match !== match.id)) { poll(); return toast('正在结算上一场 · Finishing your last match — try again in a moment'); }
    const p = myPlayer();
    if (p && p.side === side) return;
    if (!p) {
      if (S.get().coins < FEE) return toast(`金币不够 · You need ${FEE} coins in your wallet to play`);
      const ok = await confirmBox(`${TEAM[side].dot} <span class="zh">加入${TEAM[side].zh}？</span> Join ${TEAM[side].en}?`,
        `<span class="zh">每场比赛要付 ${FEE} 金币。赢的一边每人拿 ${PRIZE} 金币！</span><br>A match costs ${FEE} coins. Each winner gets ${PRIZE} coins (your ${FEE} + ${PRIZE - FEE} more).`, `付 ${FEE} Pay`, '取消 Cancel');
      if (!ok || S.get().coins < FEE) return;
    }
    busy = true;
    try {
      const st = await rpc('tennis_join', { p_side: side, p_name: S.get().kitten.name || '' });
      if (!p && st && st.match) { S.get().coins -= FEE; S.get().tennisTicket = { match: st.match.id, side }; S.save(); sfx.coin(); }
      else if (st && st.match && myTicket()) { S.get().tennisTicket.side = side; S.save(); }
      apply({ ...st, ticket: undefined }); ch.send('tmatch', { id: me });
    } catch (e) { toast(errText(e)); }
    finally { busy = false; drawHud(); }
  }
  async function leave() {
    if (busy) return; busy = true;
    try {
      const r = await rpc('tennis_leave'), tk = myTicket();
      if (r && r.left && tk && tk.match === r.match) { delete S.get().tennisTicket; S.get().coins += FEE; S.save(); toast(`↩️ <span class="zh">退回${FEE}金币</span> ${FEE} coins returned`, { coins: FEE }); }
      ch.send('tmatch', { id: me }); await poll();
    } catch (e) { toast(errText(e)); }
    finally { busy = false; drawHud(); }
  }
  async function begin() {
    if (busy) return; busy = true;
    try { apply({ ...(await rpc('tennis_start')), ticket: undefined }); ch.send('tmatch', { id: me }); }
    catch (e) { toast(errText(e)); }
    finally { busy = false; drawHud(); }
  }
  async function end() {
    if (busy || !playing() || !myPlayer()) return;
    const ok = await confirmBox('⏹ <span class="zh">结束比赛？</span> End the match?',
      `<span class="zh">比赛会停止，没有赢家。每个人拿回 ${FEE} 金币。</span><br>The match stops with no winner. Everyone gets their ${FEE} coins back.`, '结束 End', '继续打 Keep playing');
    if (!ok || !playing()) return;
    busy = true;
    try { apply(await rpc('tennis_end', { p_match: match.id })); ch.send('tmatch', { id: me }); }
    catch (e) { toast(errText(e)); }
    finally { busy = false; drawHud(); }
  }

  // ---------- the scoreboard and side buttons ----------
  function drawHud() {
    if (!hud || !hud.isConnected) return;
    const m = match, st = m ? m.status : 'none', p = myPlayer(), r = count('red'), b = count('blue');
    $('.sb-red', hud).textContent = m && st !== 'lobby' ? m.red : 0;
    $('.sb-blue', hud).textContent = m && st !== 'lobby' ? m.blue : 0;
    const sv = playing() && rally ? server(rally.no) : null;
    $('.sb-clock', hud).textContent = sv ? `🎾 ${TEAM[sv.side].dot}` : `→${WIN_AT}`;
    const open = !m || st !== 'playing';
    $('.st-lobby', hud).classList.toggle('hidden', !open);
    $('.st-red', hud).innerHTML = `🔴 <span class="zh">红队</span> Red ${r}/${SIDE_MAX}${p && p.side === 'red' ? ' ✓' : ''}`;
    $('.st-blue', hud).innerHTML = `🔵 <span class="zh">蓝队</span> Blue ${b}/${SIDE_MAX}${p && p.side === 'blue' ? ' ✓' : ''}`;
    $('.st-red', hud).disabled = busy || (r >= SIDE_MAX && !(p && p.side === 'red'));
    $('.st-blue', hud).disabled = busy || (b >= SIDE_MAX && !(p && p.side === 'blue'));
    const can = !!p && st === 'lobby' && r >= 1 && b >= 1;
    const go = $('.st-start', hud); go.disabled = !can || busy; go.classList.toggle('hidden', !p);
    $('.st-leave', hud).classList.toggle('hidden', !p || st !== 'lobby');
    const stop = $('.st-end', hud); stop.classList.toggle('hidden', !(p && st === 'playing')); stop.disabled = busy;
    const info = $('.st-info', hud);
    if (st === 'playing') info.textContent = p ? (sv && sv.id === me && rally && !rally.shot ? '🎾 你发球！按“击球” · Your serve — press HIT!' : `🎾 ${TEAM[p.side].dot} 球来了就按“击球” · You're ${TEAM[p.side].en} (${TEAM[p.side].half}). Press HIT when the ball comes!`) : '🎾 比赛中 · Match on — cheer from the side!';
    else if (!p) info.textContent = `选一边，付 ${FEE} 金币 · Pick a side (${FEE} coins). 2–4 players, up to 2 a side.`;
    else if (r < 1 || b < 1) info.textContent = `等人… 两边都要有人 · Waiting for a player on the other side (🔴${r} : 🔵${b})`;
    else info.textContent = '可以开始了！按开始 · Ready — tap Start!';
    const roster = $('.st-roster', hud); roster.innerHTML = '';
    if (live() && players().length) ['red', 'blue'].forEach((side) => { const s = document.createElement('span'); s.textContent = `${TEAM[side].dot} ${players().filter((x) => x.side === side).map((x) => x.name || '🐱').join(', ') || '—'}`; roster.append(s); });
  }

  // ---------- put it in the room (every time the tennis court is drawn) ----------
  function attach(roomEl) {
    room = roomEl;
    hud = html`<div class="stadium-hud tennis-hud">
      <div class="scoreboard"><span class="sb-team red">🔴 RED</span><b class="sb-red">0</b><span class="sb-colon">:</span><b class="sb-blue">0</b><span class="sb-team blue">BLUE 🔵</span><span class="sb-clock"></span></div>
      <div class="st-panel"><div class="st-lobby"><button type="button" class="btn small st-red"></button><button type="button" class="btn small st-blue"></button>
        <button type="button" class="btn green small st-start">▶ <span class="zh">开始</span> Start</button><button type="button" class="btn white small st-leave">↩ <span class="zh">离开</span> Leave</button></div>
      <div class="st-info"></div><button type="button" class="btn white small st-end hidden">⏹ <span class="zh">结束比赛</span> End game</button><div class="st-roster"></div></div></div>`;
    hud.addEventListener('pointerdown', (e) => e.stopPropagation());
    hud.addEventListener('click', (e) => e.stopPropagation());
    $('.st-red', hud).onclick = () => join('red');
    $('.st-blue', hud).onclick = () => join('blue');
    $('.st-start', hud).onclick = begin;
    $('.st-leave', hud).onclick = leave;
    $('.st-end', hud).onclick = end;
    netEl = html`<div class="tn-net" aria-hidden="true"><i class="post far"></i><i class="post near"></i></div>`;
    shadowEl = html`<div class="tn-shadow hidden"></div>`;
    markEl = html`<div class="tn-mark hidden"></div>`;
    ballEl = document.createElement('div'); ballEl.className = 'tn-ball hidden';
    const c = document.createElement('canvas'); drawGrid(c, artGrid(BALL_ART, BALL_PAL), 3.6); ballEl.append(c);
    callEl = html`<div class="tn-call"></div>`;
    room.append(netEl, markEl, shadowEl, ballEl, callEl, hud);
    drawHud(); start();
  }
  // the HIT button (beside the joystick)
  function mountButton(btn) {
    hitBtn = btn;
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); hit(); });
    btn.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  }
  const onKey = (e) => { if (!alive) return; if ((e.key === 'h' || e.key === 'H' || e.key === 'x' || e.key === 'X' || e.key === 'Enter') && !/INPUT|TEXTAREA/.test((e.target && e.target.tagName) || '')) { if (playing() && myPlayer() && here()) { e.preventDefault(); hit(); } } };
  window.addEventListener('keydown', onKey);
  poll();
  const pt = setInterval(() => { if (!alive) return clearInterval(pt); if (!document.hidden) poll(); }, 2000);
  function stop() { alive = false; clearInterval(pt); window.removeEventListener('keydown', onKey); if (raf) cancelAnimationFrame(raf); raf = 0; }
  return {
    attach, mountButton, keepIn, stop, poll, hit,
    busyHere: () => !!(playing() && myPlayer()),
    onBroadcast: (ev, p) => {
      if (ev === 'tshot') onShot(p);
      else if (ev === 'tmatch') poll();
      else if (ev === 'tswing') { const c = others.m.get(p.id); if (c && c.el) swingAnim(c.el, p.left); }
    },
    _debug: () => ({ match, rally, offset }),
  };
}
