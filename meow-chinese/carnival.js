// 🎡 The Carnival's Ferris wheel (a public place on the map: Main Square ▶ Ferris Wheel).
// 1. Tap the ticket booth: 10 coins · a 60-second ride, and who nearby already has a ticket.
// 2. Buy a ticket (she confirms first). It stays in her bag until she boards, so changing her mind loses nothing.
// 3. Ride alone, or invite a cat nearby — each rider uses their own ticket and both say yes before it starts.
// 4. The cabin rises: buildings drop away below, clouds drift past, day or night like outside.
// 5. A pause at the very top to enjoy the view. 6. 📷 one souvenir photo per ride (frames can be bought, with a
//    preview) — it goes into the phone's 🖼️ Gallery. 7. Down again; the door opens and the cats step out by the exit.
import * as S from './state.js';
import { KittenView, html, $, openModal, closeModal, toast, coinI, hydrateIcons, confirmBox, esc } from './ui.js';
import { drawGrid, artGrid } from './pixel.js';
import { sfx } from './audio.js';
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

// ---------- the ticket booth and exit sign (built into the Ferris Wheel area) ----------
const BOOTH = [
  '..oooooooooooooooooooo..', '.orrwwrrwwrrwwrrwwrrwwo.', 'orrwwrrwwrrwwrrwwrrwwrro', 'oooooooooooooooooooooooo',
  '.oyyyyyyyyyyyyyyyyyyyyo.', '.oyyyyyyyyyyyyyyyyyyyyo.', '.oyyyyyyyyyyyyyyyyyyyyo.', '.oooooooooooooooooooooo.',
  '.osssssssssssssssssssso.', '.osgggggggggggggggggggso.', '.osgggggggggggggggggggso.', '.osgggggggggggggggggggso.',
  '.osgggggggggggggggggggso.', '.osssssssssssssssssssso.', '.obbbbbbbbbbbbbbbbbbbbbo.', '.orrrrrrrrrrrrrrrrrrrrro.',
  '.orrwwrrrrrrrrrrrrrwwrro.', '.orrrrrrrrrrrrrrrrrrrrro.', '.orrrrrrrrrrrrrrrrrrrrro.', '.orrwwrrrrrrrrrrrrrwwrro.',
  '.orrrrrrrrrrrrrrrrrrrrro.', '.oooooooooooooooooooooo.',
];
const BPAL = { o: '#2b2140', r: '#e8384f', w: '#ffffff', y: '#ffd23f', s: '#c9d3de', g: '#a8dcff', b: '#8a5a32' };

export function createCarnival({ me, ch, others, getMine, myLook, sendMine, getRoomKey, landAtExit }) {
  let invite = null, riding = false;          // invite: { to, name, t } that I sent, waiting for an answer
  const nearby = () => others.ids().map((id) => ({ id, c: others.m.get(id) })).filter(({ c }) => c && c.room === WHEEL_ROOM && c.look && !c.riding);
  const markTicket = () => { const m = getMine(); m.wheelTix = tickets(); sendMine(); };

  function attach(room) {
    if (getRoomKey() !== WHEEL_ROOM) return;
    const booth = html`<button type="button" class="carn-booth" aria-label="Ferris wheel tickets"><span class="carn-sign">🎟️ <span class="zh">售票处</span> Tickets</span></button>`;
    const c = document.createElement('canvas'); drawGrid(c, artGrid(BOOTH, BPAL), 4); booth.prepend(c);
    booth.onclick = (e) => { e.stopPropagation(); sfx.click(); openBooth(); };
    const exit = html`<div class="carn-exit">🚪 <span class="zh">出口</span> EXIT</div>`;
    room.append(booth, exit);
    markTicket();
  }

  // ---------- 1–3: the booth ----------
  function openBooth() {
    const box = html`<div class="card stack carn-card">
        <div class="h-title">🎡 <span class="zh">摩天轮</span> Ferris wheel</div>
        <p class="carn-price"><b>${WHEEL_FEE}</b>${coinI(18)} <span class="zh">一张票</span> a ticket · ⏱ <b>${RIDE_S}</b><span class="zh">秒</span>-second ride · <span class="zh">一个车厢坐两只猫</span> 2 cats a cabin</p>
        <div class="carn-have"></div>
        <div class="carn-buy-row"></div>
        <div class="h-sub">👫 <span class="zh">附近的猫</span> Cats nearby</div>
        <div class="carn-near"></div>
        <button type="button" class="btn white" id="cb-close">关闭 Close</button></div>`;
    const draw = () => {
      const n = tickets();
      $('.carn-have', box).innerHTML = `<span class="zh">我的票</span> My tickets: <b>🎟️ ${n}</b> · <span class="zh">金币</span> Coins: <b>${S.get().coins}</b>`;
      $('.carn-buy-row', box).innerHTML = `<button type="button" class="btn yellow" id="cb-buy" ${S.get().coins >= WHEEL_FEE ? '' : 'disabled'}>🎟️ <span class="zh">买票</span> Buy a ticket · ${WHEEL_FEE}</button>
          <button type="button" class="btn green" id="cb-alone" ${n ? '' : 'disabled'}>🎡 <span class="zh">自己坐</span> Ride alone</button>`;
      $('#cb-buy', box).onclick = buy;
      $('#cb-alone', box).onclick = () => { closeModal(); startRide(null); };
      const list = $('.carn-near', box), ppl = nearby();
      list.innerHTML = ppl.length ? '' : '<p class="help" style="margin:0">附近还没有别的猫。 No other cats by the wheel right now.</p>';
      ppl.forEach(({ id, c }) => {
        const row = html`<div class="carn-person"><span><b>${esc(c.look.name || '🐱')}</b> ${c.wheelTix ? '<small class="carn-waiting">🎟️ <span class="zh">有票，在等</span> has a ticket — waiting to board</small>' : '<small>没有票 · no ticket yet</small>'}</span>
            <button type="button" class="btn small green" ${n ? '' : 'disabled'}>📨 <span class="zh">一起坐</span> Invite</button></div>`;
        $('button', row).onclick = () => sendInvite(id, c.look.name || '朋友', box);
        list.append(row);
      });
      hydrateIcons(box);
    };
    async function buy() {
      if (S.get().coins < WHEEL_FEE) return toast(`金币不够 · You need ${WHEEL_FEE} coins`);
      if (!(await confirmBox('买一张摩天轮票？ Buy a ticket?', `${WHEEL_FEE} coins for one 60-second ride. You can keep the ticket and ride later.`, `🎟️ 买 Buy (${WHEEL_FEE})`))) return openBooth();
      if (S.get().coins < WHEEL_FEE) return;
      S.get().coins -= WHEEL_FEE; S.get().wheelTickets = tickets() + 1; S.save(); sfx.coin();
      toast('🎟️ <span class="zh">买好了！票在你的包里。</span> Ticket bought — it stays in your bag until you board.', { ms: 2600 });
      markTicket(); openBooth();
    }
    $('#cb-close', box).onclick = closeModal;
    draw(); openModal(box);
  }

  // ---------- inviting someone nearby (both need a ticket; both say yes) ----------
  function sendInvite(id, name, box) {
    if (!tickets()) return toast('先买票 · Buy a ticket first');
    invite = { to: id, name, t: Date.now() };
    ch.send('wheel-invite', { id: me, to: id, name: myLook().name });
    closeModal();
    const w = html`<div class="card stack carn-card" style="text-align:center"><div class="h-title" style="justify-content:center">📨 <span class="zh">等${esc(name)}回答…</span></div>
        <p class="help" style="margin:0">Waiting for <b>${esc(name)}</b> to say yes (they use their own ticket).</p>
        <button type="button" class="btn white" id="cw-cancel">取消 Cancel</button></div>`;
    $('#cw-cancel', w).onclick = () => { if (invite) ch.send('wheel-answer', { id: me, to: id, ok: false, cancel: true }); invite = null; closeModal(); };
    openModal(w, { onClose: () => {} });
    setTimeout(() => { if (invite && invite.to === id && Date.now() - invite.t >= 29000) { invite = null; closeModal(); toast(`${esc(name)} 没有回答 · No answer — try again later`); } }, 30000);
  }
  function onBroadcast(ev, p) {
    if (p.to !== me) return;
    if (ev === 'wheel-invite') {
      if (riding) return ch.send('wheel-answer', { id: me, to: p.id, ok: false, busy: true });
      const from = others.m.get(p.id), name = String(p.name || (from && from.look && from.look.name) || '朋友').slice(0, 30);
      const box = html`<div class="card stack carn-card" style="text-align:center"><div class="h-title" style="justify-content:center">🎡 <span class="zh">${esc(name)}请你一起坐摩天轮！</span></div>
          <p style="margin:0"><b>${esc(name)}</b> invites you to ride the Ferris wheel together.<br><small class="help">You use one of your own tickets (${WHEEL_FEE} coins). You have 🎟️ <b>${tickets()}</b>.</small></p>
          <div class="row" style="justify-content:center"><button type="button" class="btn white" id="ci-no">不了 No thanks</button>
            <button type="button" class="btn green" id="ci-yes">${tickets() ? '🎟️ <span class="zh">用一张票</span> Use my ticket' : `🎟️ <span class="zh">买票一起坐</span> Buy one (${WHEEL_FEE}) & ride`}</button></div></div>`;
      $('#ci-no', box).onclick = () => { ch.send('wheel-answer', { id: me, to: p.id, ok: false }); closeModal(); };
      $('#ci-yes', box).onclick = () => {
        if (!tickets()) {
          if (S.get().coins < WHEEL_FEE) { toast(`金币不够 · You need ${WHEEL_FEE} coins`); return; }
          S.get().coins -= WHEEL_FEE; S.get().wheelTickets = 1; S.save(); sfx.coin();
        }
        ch.send('wheel-answer', { id: me, to: p.id, ok: true, look: myLook() }); closeModal();
        const w = html`<div class="card stack carn-card" style="text-align:center"><p>⏳ <span class="zh">等${esc(name)}开始…</span> Waiting for ${esc(name)} to start…</p></div>`;
        openModal(w);
        setTimeout(() => { if (!riding && w.isConnected) closeModal(); }, 20000);
      };
      openModal(box); sfx.click();
    } else if (ev === 'wheel-answer') {
      if (p.cancel) { closeModal(); return toast('邀请取消了 · The invite was cancelled'); }
      if (!invite || invite.to !== p.id) return;
      const name = invite.name; invite = null; closeModal();
      if (!p.ok) return toast(p.busy ? `${esc(name)}正在坐摩天轮 · ${esc(name)} is riding right now` : `${esc(name)}说不了 · ${esc(name)} said no thanks`);
      if (!tickets()) return toast('你的票不见了 · You have no ticket');
      const at = Date.now() + 1500;
      ch.send('wheel-go', { id: me, to: p.id, at, look: myLook() });
      startRide({ id: p.id, look: p.look || (others.m.get(p.id) || {}).look }, at);
    } else if (ev === 'wheel-go') {
      closeModal();
      startRide({ id: p.id, look: p.look || (others.m.get(p.id) || {}).look }, p.at);
    }
  }

  // ---------- 4–7: the ride ----------
  function startRide(partner, at = Date.now() + 600) {
    if (riding) return;
    if (!tickets()) return toast('先买票 · Buy a ticket first');
    S.get().wheelTickets = tickets() - 1; S.save();           // the ticket is used when the ride starts
    riding = true; const m = getMine(); m.riding = true; m.wheelTix = tickets(); sendMine();
    openRide({ me: myLook(), partner: partner && partner.look ? partner.look : null, at, onEnd: () => {
      riding = false; const mm = getMine(); mm.riding = false; landAtExit(!!partner); sendMine();
      toast('🎡 <span class="zh">好玩吗？欢迎再来！</span> Hope you enjoyed the ride!', { ms: 2600 });
    } });
  }

  return { attach, onBroadcast, openBooth };
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
function drawScene(ctx, t, night, cats, { door = 0 } = {}) {
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
  // the cats, sitting side by side on the bench
  const n = cats.filter(Boolean).length, cs = 92;
  cats.filter(Boolean).forEach((c, i) => {
    const px = n === 1 ? -cs / 2 : (i === 0 ? -cs - 6 : 6);
    const ar = c.height / c.width || 1;
    ctx.drawImage(c, px, wy + wh - cs * ar + 22, cs, cs * ar);
  });
  ctx.fillStyle = '#8a5a32'; ctx.fillRect(wx, wy + wh - 16, ww, 16);                             // the bench back
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(wx + 12, wy + 8, 6, wh - 30); ctx.fillRect(wx + 24, wy + 8, 3, wh - 50);   // glass shine
  // the door (opens at the end)
  if (door > 0) { ctx.fillStyle = '#c62a3e'; ctx.fillRect(x0 + cw - 46 * (1 - door) - 46, y0 + 30, 46, chh - 40); ctx.fillStyle = '#2b2140'; ctx.fillRect(x0 + cw - 46, y0 + 30, 46 * door, chh - 40); }
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
    if (done) return; done = true; alive = false;
    closeModal(); onEnd();
  }
  openModal(box, { onClose: () => { if (!done) { done = true; alive = false; onEnd(); } } });
  hydrateIcons(box);
  requestAnimationFrame(loop);
}
