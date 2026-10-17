// 🎡 The Carnival's Ferris wheel (a public place on the map: Main Square ▶ Ferris Wheel).
// 1. The ticket booth (furniture the admin places): 10 coins · a 60-second ride, and who is waiting to board.
// 2. Buy a ticket (she confirms first). It stays in her bag until she boards, so changing her mind loses nothing.
// 3. Tap the wheel to board: she walks into the cabin and sits (1/2). Ride alone, or a second cat taps the wheel and
//    walks in to sit beside her (each uses their own ticket); then Start — the door closes.
// 4. The cabin rises: buildings drop away below, clouds drift past, day or night like outside.
// 5. A pause at the very top to enjoy the view. 6. 📷 one souvenir photo per ride (frames can be bought, with a
//    preview) — it goes into the phone's 🖼️ Gallery. 7. Down again; the door opens and the cats step out by the exit.
import * as S from './state.js';
import { KittenView, html, $, openModal, closeModal, toast, coinI, hydrateIcons, confirmBox, esc } from './ui.js';
import { drawGrid, artGrid } from './pixel.js';
import { sfx, carnivalMusic } from './audio.js';
import * as Gallery from './gallery.js';

export const WHEEL_ROOM = 'carnivalwheel', WHEEL_FEE = 10, RIDE_S = 60;
const RISE = 24, TOP = 10, DESC = 24;            // seconds: going up · at the top · coming down (then the door opens)
const tickets = () => S.get().wheelTickets || 0;
const isNight = () => { const h = new Date().getHours(); return h >= 19 || h < 7; };

// 🖼️ souvenir photo frames (bought once, used on any ride)
export const FRAMES = [
  { key: 'plain', zh: '简单', en: 'Simple', price: 0 },
  { key: 'hearts', zh: '爱心', en: 'Hearts', price: 15 },
  { key: 'stars', zh: '星星', en: 'Stars', price: 15 },
  { key: 'lights', zh: '彩灯', en: 'Carnival lights', price: 20 },
  { key: 'gold', zh: '金框', en: 'Gold', price: 25 },
];
const ownsFrame = (k) => k === 'plain' || (S.get().photoFrames || []).includes(k);

// ---------- the Ferris wheel area ----------
// The ticket booth and the EXIT sign are furniture (the admin places, moves and resizes them).
// The wheel itself is painted in the background: tap it to board.
export function createCarnival({ me, ch, others, getMine, myLook, sendMine, getRoomKey, landAtExit }) {
  let riding = false;
  // the cabin at the platform: { owner, riders: [{ id, look }], heard } — mine (I'm the owner) or one I've heard about
  let cabin = null, board = null, beat = 0;
  const heardCabin = () => (cabin && cabin.owner !== me && Date.now() - cabin.heard < 6000 ? cabin : null);
  const markTicket = () => { const m = getMine(); m.wheelTix = tickets(); sendMine(); };
  const sendCabin = () => { if (cabin && cabin.owner === me) ch.send('wheel-cabin', { id: me, riders: cabin.riders }); };

  function attach(room) {
    if (getRoomKey() !== WHEEL_ROOM) return;
    // the painted wheel: a big tap area over it
    const hit = html`<button type="button" class="carn-wheel-hit" aria-label="Board the Ferris wheel"><span class="carn-hint">🎡 <span class="zh">点摩天轮上车</span> Tap the wheel to board</span></button>`;
    hit.onclick = (e) => { if (room.classList.contains('arranging')) return; e.stopPropagation(); sfx.click(); tapWheel(); };
    room.append(hit);
    room.querySelectorAll('.decor').forEach((d) => { if (/^carnivalbooth/.test(d.dataset.id)) d.classList.add('mall-interactive'); });
    room.addEventListener('click', (e) => {
      const d = e.target.closest('.decor'); if (!d || room.classList.contains('arranging') || e.target.closest('button')) return;
      if (/^carnivalbooth/.test(d.dataset.id)) { sfx.click(); openBooth(); }
    });
    markTicket();
  }

  async function buyTicket() {
    if (S.get().coins < WHEEL_FEE) { toast(`金币不够 · You need ${WHEEL_FEE} coins`); return false; }
    if (!(await confirmBox('买一张摩天轮票？ Buy a ticket?', `${WHEEL_FEE} coins for one ${RIDE_S}-second ride. You can keep the ticket and ride later.`, `🎟️ 买 Buy (${WHEEL_FEE})`))) return false;
    if (S.get().coins < WHEEL_FEE) return false;
    S.get().coins -= WHEEL_FEE; S.get().wheelTickets = tickets() + 1; S.save(); sfx.coin();
    toast('🎟️ <span class="zh">买好了！票在你的包里。</span> Ticket bought — it stays in your bag until you board.', { ms: 2600 });
    markTicket(); return true;
  }

  // 🎟️ the booth: price, ride length, and who's waiting in the cabin
  function openBooth() {
    const box = html`<div class="card stack carn-card">
        <div class="h-title">🎟️ <span class="zh">摩天轮售票处</span> Ferris wheel tickets</div>
        <p class="carn-price"><b>${WHEEL_FEE}</b>${coinI(18)} <span class="zh">一张票</span> a ticket · ⏱ <b>${RIDE_S}</b><span class="zh">秒</span>-second ride · <span class="zh">一个车厢坐两只猫</span> 2 cats a cabin</p>
        <div class="carn-have"></div><div class="carn-wait"></div>
        <div class="carn-buy-row"><button type="button" class="btn yellow" id="cb-buy">🎟️ <span class="zh">买票</span> Buy a ticket · ${WHEEL_FEE}</button></div>
        <p class="help" style="margin:0"><span class="zh">有票就点摩天轮上车。</span> Got a ticket? Tap the Ferris wheel to board.</p>
        <button type="button" class="btn white" id="cb-close">关闭 Close</button></div>`;
    const draw = () => {
      $('.carn-have', box).innerHTML = `<span class="zh">我的票</span> My tickets: <b>🎟️ ${tickets()}</b> · <span class="zh">金币</span> Coins: <b>${S.get().coins}</b>`;
      const c = heardCabin(), waiting = others.ids().map((id) => others.m.get(id)).filter((o) => o && o.room === WHEEL_ROOM && o.wheelTix && !o.riding);
      $('.carn-wait', box).innerHTML = c && c.riders.length === 1
        ? `👫 <b>${esc(c.riders[0].look.name || '🐱')}</b> <span class="zh">在车厢里等人一起坐！</span> is waiting in the cabin — tap the wheel to join!`
        : waiting.length ? `👫 <span class="zh">有票在等：</span> Waiting to board: ${waiting.map((o) => `<b>${esc(o.look.name || '🐱')}</b>`).join(', ')}` : '<small class="help">现在没有人在等 · Nobody is waiting right now</small>';
      $('#cb-buy', box).disabled = S.get().coins < WHEEL_FEE;
      hydrateIcons(box);
    };
    $('#cb-buy', box).onclick = async () => { if (await buyTicket()) openBooth(); else openBooth(); };
    $('#cb-close', box).onclick = closeModal;
    draw(); openModal(box);
  }

  // 🎡 tap the wheel: board the waiting cabin (join the cat already inside), or a new one
  async function tapWheel() {
    if (riding || board) return;
    if (!tickets()) {
      if (!(await buyTicket())) return;
    }
    const c = heardCabin();
    if (c && c.riders.length === 1) {
      ch.send('wheel-join', { id: me, to: c.owner, look: myLook() });
      S.get().wheelTickets = tickets() - 1; S.save(); markTicket();   // my ticket goes in as I step in
      openBoarding({ owner: c.owner, riders: [...c.riders, { id: me, look: myLook() }], walker: me });
      return;
    }
    S.get().wheelTickets = tickets() - 1; S.save(); markTicket();
    cabin = { owner: me, riders: [{ id: me, look: myLook() }], heard: Date.now() };
    sendCabin(); clearInterval(beat); beat = setInterval(sendCabin, 2500);
    openBoarding({ owner: me, riders: cabin.riders, walker: me });
  }
  // stepping out before the ride starts: the ticket comes back
  function getOff() {
    if (!board) return;
    const wasOwner = board.owner === me;
    S.get().wheelTickets = tickets() + 1; S.save(); markTicket();
    if (wasOwner) { clearInterval(beat); ch.send('wheel-cabin', { id: me, riders: [], closed: true }); cabin = null; }
    else ch.send('wheel-leave', { id: me, to: board.owner });
    board.close(); board = null;
  }
  function startNow() {
    if (!board) return;
    const at = Date.now() + 1600;   // the door takes a moment to close
    if (board.owner === me) { clearInterval(beat); ch.send('wheel-start', { id: me, at, riders: board.riders }); cabin = null; }
    else ch.send('wheel-start', { id: me, to: board.owner, at, riders: board.riders });
    go(at, board.riders);
  }
  function go(at, riders) {
    if (!board) return;
    const partner = riders.find((r) => r.id !== me);
    board.closeDoor(() => {
      board = null;
      riding = true; const m = getMine(); m.riding = true; sendMine();
      openRide({ me: myLook(), partner: partner ? partner.look : null, at, onEnd: () => {
        riding = false; const mm = getMine(); mm.riding = false; landAtExit(!!partner); sendMine();
        toast('🎡 <span class="zh">好玩吗？欢迎再来！</span> Hope you enjoyed the ride!', { ms: 2600 });
      } });
    });
  }

  function onBroadcast(ev, p) {
    if (ev === 'wheel-cabin') {       // someone is waiting in the cabin (or got off)
      if (p.closed || !p.riders || !p.riders.length) {
        if (cabin && cabin.owner === p.id) cabin = null;
        if (board && board.owner === p.id) { toast('🚪 <span class="zh">另一只猫下车了</span> The other cat got off'); S.get().wheelTickets = tickets() + 1; S.save(); markTicket(); board.close(); board = null; }
        return;
      }
      if (!cabin || cabin.owner !== me) cabin = { owner: p.id, riders: p.riders.slice(0, 2), heard: Date.now() };
      if (board && board.owner === p.id) board.setRiders(p.riders.slice(0, 2));
      return;
    }
    if (p.to && p.to !== me) return;
    if (ev === 'wheel-join' && board && board.owner === me) {
      if (board.riders.length >= 2) return ch.send('wheel-full', { id: me, to: p.id });
      const riders = [...board.riders, { id: p.id, look: p.look || (others.m.get(p.id) || {}).look || {} }];
      cabin = { owner: me, riders, heard: Date.now() }; board.setRiders(riders, p.id); sendCabin(); sfx.click();
    } else if (ev === 'wheel-leave' && board && board.owner === me) {
      const riders = board.riders.filter((r) => r.id !== p.id); cabin = { owner: me, riders, heard: Date.now() }; board.setRiders(riders); sendCabin();
      toast('🚪 <span class="zh">另一只猫下车了</span> The other cat got off');
    } else if (ev === 'wheel-full' && board) {
      toast('车厢满了 · That cabin is full'); S.get().wheelTickets = tickets() + 1; S.save(); markTicket(); board.close(); board = null;
    } else if (ev === 'wheel-start' && board && (board.owner === p.id || board.owner === me) && board.riders.some((r) => r.id === p.id)) {
      if (board.owner === me) { clearInterval(beat); if (p.to) ch.send('wheel-start', { id: me, at: p.at, riders: board.riders }); cabin = null; }
      go(p.at, board.riders);
    }
  }

  // ---------- boarding: she walks into the cabin and sits; 1/2 cats; ride alone or wait for a friend ----------
  function openBoarding({ owner, riders, walker }) {
    const night = isNight();
    const box = html`<div class="card carn-ride carn-board">
        <div class="carn-ride-top"><span>🎡 <span class="zh">上车啦</span> All aboard!</span><span class="carn-count"></span></div>
        <div class="carn-view"><canvas width="${SCN_W}" height="${SCN_H}"></canvas></div>
        <p class="carn-board-tip"></p>
        <div class="row" style="justify-content:center;flex-wrap:wrap"><button type="button" class="btn white" id="bd-off">🚪 <span class="zh">下车</span> Get off</button><button type="button" class="btn green" id="bd-go"></button></div>
      </div>`;
    const ctx = $('canvas', box).getContext('2d');
    // each rider walks in from the door on the right to a seat (1st on the left, 2nd on the right)
    const seats = new Map();
    const addSeat = (r, i, walking) => { if (!seats.has(r.id)) seats.set(r.id, { c: catCanvas(r.look), seat: i, t0: walking ? performance.now() : -1e9 }); };
    let list = riders.slice(0, 2), alive = true, doorO = 1, closing = null;
    list.forEach((r, i) => addSeat(r, i, r.id === walker));
    const st = {
      owner, get riders() { return list; },
      setRiders(rs, walking = null) {
        list = rs.slice(0, 2);
        [...seats.keys()].forEach((id) => { if (!list.some((r) => r.id === id)) seats.delete(id); });
        list.forEach((r, i) => { addSeat(r, i, r.id === walking); seats.get(r.id).seat = i; });
        hud();
      },
      close() { alive = false; closeModal(); },
      closeDoor(done) { closing = { t0: performance.now(), done }; sfx.click(); hud(); },
    };
    const hud = () => {
      $('.carn-count', box).textContent = `🐱 ${list.length}/2`;
      const two = list.length >= 2;
      $('#bd-go', box).innerHTML = two ? '▶️ <span class="zh">出发！</span> Start the ride' : '▶️ <span class="zh">自己坐</span> Ride alone';
      $('.carn-board-tip', box).innerHTML = two ? '<span class="zh">两只猫都上车了！</span> Both cats are in — start whenever you like.' : '<span class="zh">可以自己坐，或者等一个朋友点摩天轮上车。</span> Ride alone, or wait for a friend to tap the wheel and hop in.';
      $('#bd-go', box).disabled = $('#bd-off', box).disabled = !!closing;
    };
    $('#bd-go', box).onclick = () => { if (!closing) startNow(); };
    $('#bd-off', box).onclick = () => { if (!closing) getOff(); };
    const WALK = 1400;
    const loop = (now) => {
      if (!alive || !box.isConnected) return;
      if (closing) { doorO = Math.max(0, 1 - (now - closing.t0) / 1000); if (doorO <= 0 && closing.done) { const d = closing.done; closing.done = null; alive = false; closeModal(); d(); return; } }
      const placed = [...seats.values()].map((s) => {
        const k = Math.min(1, (now - s.t0) / WALK), target = s.seat === 0 ? -98 : 6;
        // from the doorway (right) to the seat; bob while walking, then settle down a little to sit
        return { c: s.c, x: 120 + (target - 120) * (1 - (1 - k) ** 2), dy: k < 1 ? -Math.abs(Math.sin(k * Math.PI * 4)) * 6 : 6 * Math.min(1, (now - s.t0 - WALK) / 250) };
      });
      drawScene(ctx, 0, night, [], { door: doorO, placed });
      requestAnimationFrame(loop);
    };
    openModal(box, { onClose: () => { if (alive && !closing) { alive = false; if (board === st) { board = null; getOffSilently(); } } } });
    hud(); hydrateIcons(box); requestAnimationFrame(loop);
    board = st;
    return st;
  }
  // closed with ✕ / outside tap while boarding: same as getting off
  function getOffSilently() {
    S.get().wheelTickets = tickets() + 1; S.save(); markTicket();
    if (cabin && cabin.owner === me) { clearInterval(beat); ch.send('wheel-cabin', { id: me, riders: [], closed: true }); cabin = null; }
  }

  // leaving the carnival: step out of a waiting cabin (ticket back) / stop the ride
  function stop() { if (board) getOff(); else if (riding) closeModal(); }
  return { attach, onBroadcast, openBooth, tapWheel, stop };
}

// ---------- the ride scene (a canvas, so the souvenir photo is exactly what she sees) ----------
const SCN_W = 360, SCN_H = 480, SPAN = 560;
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const r0 = rng(42);
const FAR = Array.from({ length: 16 }, (_, i) => ({ x: i * 24 - 6 + r0() * 6, w: 18 + r0() * 14, h: 70 + r0() * 130, c: ['#8fa6c9', '#9fb3d4', '#7f96bd'][i % 3] }));
const NEAR = Array.from({ length: 10 }, (_, i) => ({ x: i * 40 - 10 + r0() * 10, w: 30 + r0() * 16, h: 50 + r0() * 90, c: ['#5b6a8f', '#6b5a7f', '#4f6a7f', '#7a5a5a'][i % 4] }));
const CLOUDS = Array.from({ length: 9 }, () => ({ x: r0() * SCN_W, alt: 120 + r0() * 620, w: 50 + r0() * 50, v: 4 + r0() * 8 }));
const STARS = Array.from({ length: 60 }, () => ({ x: r0() * SCN_W, y: r0() * SCN_H * 0.8, b: r0() }));

function height(t) {   // 0 (ground) … 1 (the top), from seconds into the ride
  if (t <= 0) return 0;
  if (t < RISE) { const k = t / RISE; return k * k * (3 - 2 * k); }
  if (t < RISE + TOP) return 1;
  if (t < RISE + TOP + DESC) { const k = (t - RISE - TOP) / DESC; return 1 - k * k * (3 - 2 * k); }
  return 0;
}
function drawScene(ctx, t, night, cats, { door = 0, placed = null } = {}) {
  const W = SCN_W, H = SCN_H, h = height(t), cam = h * SPAN, groundY = H * 0.86 + cam;
  ctx.imageSmoothingEnabled = false;
  // sky (a little deeper higher up)
  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (night) { g.addColorStop(0, '#070b2e'); g.addColorStop(1, '#2a2f7a'); } else { g.addColorStop(0, h > 0.6 ? '#4aa3e8' : '#6cb6f2'); g.addColorStop(1, '#d4f0ff'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (night) {
    STARS.forEach((s) => { ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + s.b * 9))})`; ctx.fillRect(s.x | 0, s.y | 0, 2, 2); });
    ctx.fillStyle = '#fff4c2'; ctx.beginPath(); ctx.arc(W - 60, 70, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#070b2e'; ctx.beginPath(); ctx.arc(W - 50, 64, 20, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(W - 60, 70, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,224,102,.35)'; ctx.beginPath(); ctx.arc(W - 60, 70, 38, 0, Math.PI * 2); ctx.fill();
  }
  // clouds: they live at different heights, so they slide down past the cabin as it rises
  CLOUDS.forEach((c) => {
    const y = groundY - c.alt - H * 0.3, x = ((c.x + t * c.v) % (W + c.w * 2)) - c.w;
    if (y < -40 || y > H + 40) return;
    ctx.fillStyle = night ? 'rgba(200,210,255,.35)' : 'rgba(255,255,255,.92)';
    ctx.fillRect(x | 0, y | 0, c.w | 0, 14); ctx.fillRect((x + c.w * 0.2) | 0, (y - 8) | 0, (c.w * 0.5) | 0, 10); ctx.fillRect((x + c.w * 0.55) | 0, (y - 5) | 0, (c.w * 0.3) | 0, 8);
  });
  // the far city (moves half as fast — it stays on the horizon longer) and the near town
  const skyline = (list, par, lit) => list.forEach((b) => {
    const base = H * 0.86 + cam * par, top = base - b.h;
    if (top > H) return;
    ctx.fillStyle = night ? '#2b2f55' : b.c; ctx.fillRect(b.x | 0, top | 0, b.w | 0, b.h + 4);
    ctx.fillStyle = night ? (lit ? '#ffe08a' : '#c9b86a') : 'rgba(255,255,255,.55)';
    for (let wy = top + 6; wy < base - 6; wy += 10) for (let wx = b.x + 4; wx < b.x + b.w - 4; wx += 7) if (((wx * 7 + wy * 3) | 0) % 5) ctx.fillRect(wx | 0, wy | 0, 3, 4);
  });
  skyline(FAR, 0.18, false); skyline(NEAR, 0.55, true);   // the far city stays on the horizon — that's the view from the top
  // the carnival ground and tents right below
  if (groundY < H + 80) {
    ctx.fillStyle = night ? '#4a3f5a' : '#e3c9a3'; ctx.fillRect(0, groundY, W, H);
    [[30, '#e8384f'], [150, '#6cb6f2'], [270, '#ffb020']].forEach(([x, c]) => {
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, groundY - 50); ctx.lineTo(x + 34, groundY - 22); ctx.lineTo(x - 34, groundY - 22); ctx.closePath(); ctx.fill();
      for (let i = -30; i < 30; i += 12) { ctx.fillStyle = c; ctx.fillRect(x + i, groundY - 22, 6, 22); ctx.fillStyle = '#fff'; ctx.fillRect(x + i + 6, groundY - 22, 6, 22); }
    });
  }
  // the wheel: the rim and spokes it hangs from (they turn slowly behind the cabin)
  const cx = W / 2, cy = H * 0.5;
  ctx.save(); ctx.translate(cx, cy - 175 + (1 - h) * 40); ctx.rotate(t * 0.05);
  ctx.strokeStyle = night ? '#ffd23f' : '#e8384f'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 160, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = night ? 'rgba(201,184,240,.8)' : '#c9d3de'; ctx.lineWidth = 3;
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 160, Math.sin(a) * 160); ctx.stroke(); }
  if (night) for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12; ctx.fillStyle = ['#ff6f9c', '#ffd23f', '#6cb6f2'][k % 3]; ctx.fillRect(Math.cos(a) * 160 - 3, Math.sin(a) * 160 - 3, 6, 6); }
  ctx.restore();
  // the cabin (swinging a little) with the two cats inside
  const sway = Math.sin(t * 1.3) * 0.035;
  ctx.save(); ctx.translate(cx, cy - 40); ctx.rotate(sway);
  ctx.fillStyle = '#5b6170'; ctx.fillRect(-4, -110, 8, 70);                                     // the hanger
  const cw = 230, chh = 190, x0 = -cw / 2, y0 = -40;
  ctx.fillStyle = '#2b2140'; roundRect(ctx, x0 - 4, y0 - 4, cw + 8, chh + 8, 22); ctx.fill();
  ctx.fillStyle = '#e8384f'; roundRect(ctx, x0, y0, cw, chh, 18); ctx.fill();
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(x0, y0 + 18, cw, 6); ctx.fillRect(x0, y0 + chh - 30, cw, 6);   // gold trim
  // the big window
  const wx = x0 + 16, wy = y0 + 32, ww = cw - 32, wh = chh - 70;
  ctx.fillStyle = night ? '#232a62' : '#cfeeff'; roundRect(ctx, wx, wy, ww, wh, 12); ctx.fill();
  ctx.save(); roundRect(ctx, wx, wy, ww, wh, 12); ctx.clip();
  ctx.fillStyle = night ? 'rgba(255,224,138,.18)' : 'rgba(255,255,255,.35)'; ctx.fillRect(wx, wy, ww, wh);
  // the cats, sitting side by side on the bench (1st on the left, 2nd on the right) — or walking in (placed)
  const cs = 92;
  if (door > 0) { ctx.fillStyle = '#1a1230'; ctx.fillRect(x0 + cw - 54, y0 + 30, 48, chh - 36); }   // the open doorway (behind the cats walking in)
  const list = placed || cats.filter(Boolean).map((c, i) => ({ c, x: i === 0 ? -cs - 6 : 6, dy: 6 }));
  list.forEach(({ c, x, dy }) => { const ar = c.height / c.width || 1; ctx.drawImage(c, x, wy + wh - cs * ar + 22 + (dy || 0), cs, cs * ar); });
  ctx.fillStyle = '#8a5a32'; ctx.fillRect(wx, wy + wh - 16, ww, 16);                             // the bench back
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(wx + 12, wy + 8, 6, wh - 30); ctx.fillRect(wx + 24, wy + 8, 3, wh - 50);   // glass shine
  // the door on the right: closed (0) … open (1) — it slides out and leaves a dark doorway
  { const dw = 48, dx = x0 + cw - dw - 6, dy0 = y0 + 30, dh = chh - 36;
    ctx.fillStyle = '#c62a3e'; ctx.fillRect(dx + dw * door, dy0, dw, dh);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(dx + dw * door + 6, dy0 + dh / 2 - 3, 6, 6);
    ctx.fillStyle = 'rgba(207,238,255,.55)'; ctx.fillRect(dx + dw * door + 8, dy0 + 10, dw - 16, 36); }
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// a frame drawn over the souvenir photo
export function drawFrame(ctx, key, W, H) {
  ctx.save();
  if (key === 'plain') { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 14; ctx.strokeRect(7, 7, W - 14, H - 14); }
  else if (key === 'gold') {
    ctx.strokeStyle = '#a8862e'; ctx.lineWidth = 26; ctx.strokeRect(13, 13, W - 26, H - 26);
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 12; ctx.strokeRect(13, 13, W - 26, H - 26);
    ctx.strokeStyle = '#fff2b8'; ctx.lineWidth = 2; ctx.strokeRect(26, 26, W - 52, H - 52);
  } else {
    ctx.strokeStyle = key === 'hearts' ? '#ff9ec4' : key === 'stars' ? '#6b3fa0' : '#2b2140'; ctx.lineWidth = 22; ctx.strokeRect(11, 11, W - 22, H - 22);
    const edge = [];
    for (let x = 22; x < W - 10; x += 34) edge.push([x, 11], [x, H - 11]);
    for (let y = 45; y < H - 30; y += 34) edge.push([11, y], [W - 11, y]);
    edge.forEach(([x, y], i) => {
      if (key === 'hearts') { ctx.fillStyle = i % 2 ? '#e8384f' : '#ffffff'; heart(ctx, x, y, 8); }
      else if (key === 'stars') { ctx.fillStyle = i % 2 ? '#ffd23f' : '#ffffff'; star(ctx, x, y, 9); }
      else { ctx.fillStyle = ['#ff6f9c', '#ffd23f', '#6cb6f2', '#7cbd52'][i % 4]; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); }
    });
  }
  ctx.restore();
}
function heart(ctx, x, y, r) { ctx.beginPath(); ctx.moveTo(x, y + r); ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.4, x, y - r * 0.4); ctx.bezierCurveTo(x + r * 0.6, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r); ctx.fill(); }
function star(ctx, x, y, r) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }

function catCanvas(look) {
  const kv = new KittenView({ scale: 6, fur: (look && look.fur) || 'ginger', equipped: { ...((look && look.equipped) || {}) } });
  kv.setMood('happy'); clearInterval(kv.timer); return kv.canvas;
}

export function openRide({ me, partner, at, onEnd }) {
  const night = isNight();
  const cats = [catCanvas(me), partner ? catCanvas(partner) : null];
  const box = html`<div class="card carn-ride">
      <div class="carn-ride-top"><span class="carn-phase">🎡 <span class="zh">准备出发…</span> Getting ready…</span><span class="carn-clock"></span></div>
      <div class="carn-view"><canvas width="${SCN_W}" height="${SCN_H}"></canvas><div class="carn-flash"></div></div>
      <div class="carn-bar"><i></i></div>
      <div class="carn-photo-row">
        <div class="carn-frames"></div>
        <button type="button" class="btn yellow carn-snap">📷 <span class="zh">拍纪念照</span> Souvenir photo <small>(1 free)</small></button>
      </div>
    </div>`;
  const cv = $('canvas', box), ctx = cv.getContext('2d'), bar = $('.carn-bar i', box), snap = $('.carn-snap', box);
  const stopMusic = carnivalMusic();   // 🎵 a cheerful carnival tune while the wheel turns (stops when she gets off)
  let frame = 'plain', preview = null, photoTaken = false, alive = true, done = false;
  const drawFrames = () => {
    const fr = $('.carn-frames', box);
    fr.innerHTML = FRAMES.map((f) => `<button type="button" class="carn-fchip ${frame === f.key ? 'on' : ''} ${ownsFrame(f.key) ? '' : 'locked'}" data-f="${f.key}">${f.key === 'plain' ? '⬜' : f.key === 'hearts' ? '💗' : f.key === 'stars' ? '⭐' : f.key === 'lights' ? '💡' : '🟨'} <span class="zh">${f.zh}</span>${ownsFrame(f.key) ? '' : ` · ${f.price}🪙`}</button>`).join('')
      + (preview && !ownsFrame(preview) ? `<button type="button" class="btn small green carn-fbuy">🛒 <span class="zh">买这个框</span> Buy frame · ${FRAMES.find((f) => f.key === preview).price}</button>` : '');
    fr.querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { const k = b.dataset.f; sfx.click(); if (ownsFrame(k)) { frame = k; preview = null; } else preview = k; drawFrames(); }; });
    const fb = $('.carn-fbuy', fr);
    if (fb) fb.onclick = () => {
      const f = FRAMES.find((x) => x.key === preview);
      if (S.get().coins < f.price) return toast(`金币不够 · You need ${f.price} coins`);
      S.get().coins -= f.price; S.get().photoFrames = [...(S.get().photoFrames || []), f.key]; S.save(); sfx.coin();
      frame = f.key; preview = null; toast(`🖼️ <span class="zh">${f.zh}框是你的了</span> ${f.en} frame is yours`); drawFrames();
    };
  };
  drawFrames();
  snap.onclick = async () => {
    if (photoTaken) return;
    if (Gallery.galleryFull()) return toast(`相册满了（${Gallery.GALLERY_MAX}张）· Gallery is full — delete some photos in the phone first`, { ms: 3000 });
    photoTaken = true; snap.disabled = true; sfx.click();
    const f = $('.carn-flash', box); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    const pc = document.createElement('canvas'); pc.width = SCN_W; pc.height = SCN_H;
    const p = pc.getContext('2d');
    drawScene(p, (Date.now() - at) / 1000, night, cats);
    drawFrame(p, frame, SCN_W, SCN_H);
    p.fillStyle = 'rgba(43,33,64,.75)'; p.fillRect(28, SCN_H - 58, SCN_W - 56, 28);
    p.fillStyle = '#fff'; p.font = 'bold 14px system-ui, sans-serif'; p.textAlign = 'center';
    p.fillText(`🎡 嘉年华 Carnival · ${new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}`, SCN_W / 2, SCN_H - 39);
    try { await Gallery.savePhoto(pc, '🎡 摩天轮纪念照 Ferris wheel photo'); toast('📷 <span class="zh">照片存到手机的相册了！</span> Saved to your phone’s 🖼️ Gallery', { ms: 2800 }); snap.innerHTML = '✅ <span class="zh">拍好了</span> Photo saved'; }
    catch (e) { photoTaken = false; snap.disabled = false; toast(e.message === 'full' ? 'Gallery is full' : '没存好，请再试 · Could not save — try again'); }
  };
  const PH = [[0, '⬆️ <span class="zh">慢慢上升…</span> Going up…'], [RISE, '🌟 <span class="zh">到顶了！看看风景</span> The top! Enjoy the view'], [RISE + TOP, '⬇️ <span class="zh">慢慢下降…</span> Coming down…'], [RISE + TOP + DESC, '🚪 <span class="zh">到了！开门</span> Here we are — doors opening']];
  let lastPh = -1;
  const loop = () => {
    if (!alive) return;
    const t = (Date.now() - at) / 1000;
    const door = t > RISE + TOP + DESC ? Math.min(1, (t - RISE - TOP - DESC) / 1.5) : 0;
    drawScene(ctx, Math.max(0, t), night, cats, { door });
    // the view behind the souvenir-frame preview
    if (preview || frame !== 'plain') { ctx.globalAlpha = preview ? 0.9 : 0.5; drawFrame(ctx, preview || frame, SCN_W, SCN_H); ctx.globalAlpha = 1; }
    const ph = t < 0 ? -1 : PH.filter(([s]) => t >= s).length - 1;
    if (ph !== lastPh && ph >= 0) { lastPh = ph; $('.carn-phase', box).innerHTML = `🎡 ${PH[ph][1]}`; if (ph === 1) sfx.fanfare && sfx.fanfare(); }
    $('.carn-clock', box).textContent = t < 0 ? '' : `⏱ ${Math.max(0, Math.ceil(RIDE_S - t))}`;
    bar.style.width = `${Math.min(100, Math.max(0, t / RIDE_S * 100))}%`;
    if (t >= RIDE_S) return finish();
    requestAnimationFrame(loop);
  };
  function finish() {
    if (done) return; done = true; alive = false; stopMusic();
    closeModal(); onEnd();
  }
  openModal(box, { onClose: () => { stopMusic(); if (!done) { done = true; alive = false; onEnd(); } } });
  hydrateIcons(box);
  requestAnimationFrame(loop);
}
