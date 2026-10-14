// 🕹️ The arcade's claw machine: 5 coins a go. Move the claw with the joystick, press 抓 Catch.
// It catches the prize under it 1 time in 5 — and sometimes the claw opens at the top and drops it.
import * as S from './state.js';
import { ITEMS, spriteCanvas, CLAW_PRIZES } from './pixel.js';
import { html, $, openModal, closeModal, toast, coinI, hydrateIcons } from './ui.js';
import { sfx } from './audio.js';

export const CLAW_COST = 5, CLAW_CHANCE = 0.35;
// the claw moves left/right (x, % of the glass) and back/front (z: 0 = back, 1 = front)
const HOME = { x: 12, z: 1 }, X_MIN = 8, X_MAX = 92, SPEED_X = 36, SPEED_Z = 0.7;
const STACK = 26;                                   // px each layer of toys sits above the one below
const baseOf = (z) => 8 + (1 - z) * 78;             // px from the bottom of the glass to a toy's feet on the floor
const sizeOf = (z) => 0.74 + 0.26 * z;              // toys (and the claw) look smaller further back
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function anim(ms, step) {
  return new Promise((done) => {
    const t0 = performance.now();
    const f = (t) => { const k = Math.min(1, (t - t0) / ms); step(k); if (k < 1) requestAnimationFrame(f); else done(); };
    requestAnimationFrame(f);
  });
}
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

export function openClaw() {
  const box = html`<div class="card claw-card">
      <div class="claw-marquee"><span>✦</span> 抓娃娃 <b>CLAW</b> <span>✦</span></div>
      <div class="claw-glass">
        <div class="claw-rail"></div>
        <div class="claw-pile"></div>
        <div class="claw-aim"></div>
        <div class="claw" style="left:${HOME.x}%"><div class="claw-cable"></div><div class="claw-head"><div class="claw-hub"></div><i class="claw-prong l"></i><i class="claw-prong r"></i><div class="claw-grip"></div></div></div>
        <div class="claw-chute"><span>PRIZE</span></div>
        <div class="claw-timer hidden"></div>
      </div>
      <div class="claw-panel">
        <div class="claw-joy" aria-label="Joystick"><i class="claw-joy-arrows">▲<br>◀ &nbsp; ▶<br>▼</i><div class="claw-knob"></div></div>
        <button type="button" class="claw-go" disabled><span class="zh">抓</span><small>START / CATCH</small></button>
        <button type="button" class="claw-coin"><span class="claw-slot"></span><b>${CLAW_COST}</b>${coinI(16)}<small>投币 Coin</small></button>
      </div>
      <div class="claw-msg">投币开始 · Put a coin in to play! <small>(${CLAW_COST} coins a go)</small></div>
      <div class="row" style="justify-content:space-between;align-items:center"><span class="claw-wallet"></span><button type="button" class="btn white small claw-close">关闭 Close</button></div>
    </div>`;
  const glass = $('.claw-glass', box), claw = $('.claw', box), cable = $('.claw-cable', box), head = $('.claw-head', box), grip = $('.claw-grip', box);
  const pile = $('.claw-pile', box), msg = $('.claw-msg', box), go = $('.claw-go', box), coinBtn = $('.claw-coin', box), aimEl = $('.claw-aim', box);
  const knob = $('.claw-knob', box), joy = $('.claw-joy', box), timerEl = $('.claw-timer', box);
  let x = HOME.x, z = HOME.z, depth = 0, vx = 0, vz = 0, phase = 'idle', credit = 0, left = 0, raf = 0, last = 0, tick = null, alive = true;

  const wallet = () => { $('.claw-wallet', box).innerHTML = `你有 You have <b>${S.get().coins}</b>${coinI(16)}`; hydrateIcons(box); };
  const say = (t) => { msg.innerHTML = t; };
  const setOpen = (open) => claw.classList.toggle('closed', !open);

  // ---------- the toys: a random heap that fills the machine (the same toy can be in there more than once) ----------
  const prizes = [];
  const pick = () => CLAW_PRIZES[Math.floor(Math.random() * CLAW_PRIZES.length)];
  function put(p) {
    const s = sizeOf(p.z);
    p.el.style.left = `${p.x}%`; p.el.style.bottom = `${baseOf(p.z) + p.layer * STACK * s}px`;
    p.el.style.setProperty('--s', s);
    p.el.style.zIndex = Math.round(p.z * 10) * 10 + p.layer;      // front rows and upper layers in front
  }
  function add(x0, z0, layer, id = pick()) {
    const el = document.createElement('div'); el.className = 'claw-prize';
    el.append(spriteCanvas(id, 52)); el.title = ITEMS[id].en;
    const p = { id, el, x: x0, z: z0, layer };
    put(p); pile.append(el); prizes.push(p); return p;
  }
  const topAt = (x0, z0) => prizes.filter((p) => Math.abs(p.x - x0) < 6 && Math.abs(p.z - z0) < 0.2).reduce((m, p) => Math.max(m, p.layer + 1), 0);
  function fill() {
    // three rows (back, middle, front), piled higher in the middle of the machine; the front-left corner is the prize chute
    [[0, 10], [0.5, 25], [1, 27]].forEach(([z0, from]) => {
      for (let x0 = from; x0 <= 92; x0 += 9.5) {
        const mid = 1 - Math.abs(x0 - 55) / 50;                         // 1 in the middle, ~0.3 at the sides
        // the front row is one layer (so the claw can always reach it); the heap rises towards the back
        const layers = z0 === 1 ? 1 : 1 + (Math.random() < 0.35 + mid * 0.45 ? 1 : 0) + (z0 === 0 && Math.random() < 0.3 + mid * 0.4 ? 1 : 0);
        for (let l = 0; l < layers; l++) add(x0 + (Math.random() * 5 - 2.5), Math.max(0, Math.min(1, z0 + (z0 === 1 ? -Math.random() * 0.07 : Math.random() * 0.14 - 0.07))), l);
      }
    });
  }
  fill();

  // ---------- drawing the claw and where it will drop ----------
  // the toy the claw would grab: the top one right under it
  const bottomOf = (p) => baseOf(p.z) + p.layer * STACK * sizeOf(p.z);      // px from the glass bottom to that toy's feet
  function targetAt(x0, z0) {
    const near = prizes.filter((p) => Math.abs(p.x - x0) < 6 && Math.abs(p.z - z0) < 0.22);
    return near.sort((a, b) => b.layer - a.layer || (Math.abs(a.x - x0) + Math.abs(a.z - z0) * 30) - (Math.abs(b.x - x0) + Math.abs(b.z - z0) * 30))[0] || null;
  }
  function draw() {
    const s = sizeOf(z);
    claw.style.left = `${x}%`; cable.style.height = `${8 + depth}px`;
    head.style.transform = `scale(${s})`;
    claw.style.zIndex = Math.round(z * 10) * 10 + 9;
    // the ring sits on the toy that would be grabbed (or on the floor if there's none)
    const t = targetAt(x, z), ringB = t ? bottomOf(t) + 22 * sizeOf(t.z) : baseOf(z) + 2;
    aimEl.style.left = `${x}%`; aimEl.style.bottom = `${ringB}px`; aimEl.style.setProperty('--s', s);
    aimEl.classList.toggle('hidden', phase !== 'ready');
    // a dotted line from the claw down to the ring
    const H = glass.clientHeight, ringTop = H - ringB - 20, clawBottom = 10 + 8 + depth + 44 * s;
    aimEl.style.setProperty('--line', `${Math.max(0, ringTop - clawBottom)}px`);
  }

  // ---------- the round joystick: left/right moves the claw across, up/down moves it to the back/front ----------
  const loop = (t) => {
    raf = 0; if (!alive) return;
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    if (phase === 'ready' && (vx || vz)) {
      x = Math.max(X_MIN, Math.min(X_MAX, x + vx * SPEED_X * dt));
      z = Math.max(0, Math.min(1, z + vz * SPEED_Z * dt));
      draw(); raf = requestAnimationFrame(loop);
    } else last = 0;
  };
  const steer = (dx, dy) => {
    vx = dx; vz = dy;                 // pushing up (dy < 0) goes to the back (z gets smaller)
    const R = joy.clientWidth / 2 - knob.clientWidth / 2 - 4;
    knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
    if ((dx || dy) && !raf) raf = requestAnimationFrame(loop);
  };
  let pid = null;
  const aim = (e) => {
    const r = joy.getBoundingClientRect(), R = r.width / 2;
    let dx = (e.clientX - r.left - R) / R, dy = (e.clientY - r.top - R) / R;
    const d = Math.hypot(dx, dy); if (d > 1) { dx /= d; dy /= d; }
    if (Math.hypot(dx, dy) < 0.2) { dx = 0; dy = 0; }
    steer(dx, dy);
  };
  joy.addEventListener('pointerdown', (e) => { e.preventDefault(); pid = e.pointerId; try { joy.setPointerCapture(pid); } catch {} joy.classList.add('down'); aim(e); });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === pid) aim(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => joy.addEventListener(ev, (e) => { if (e.pointerId === pid) { pid = null; joy.classList.remove('down'); steer(0, 0); } }));
  joy.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  const keys = new Set();
  const keySteer = () => steer((keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0), (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0));
  const kd = (e) => {
    if (!alive) return;
    if (e.key.startsWith('Arrow')) { e.preventDefault(); keys.add(e.key); keySteer(); }
    else if ((e.key === ' ' || e.key === 'Enter') && phase === 'ready') { e.preventDefault(); drop(); }
  };
  const ku = (e) => { if (keys.delete(e.key)) keySteer(); };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  // ---------- coin in ----------
  coinBtn.onclick = () => {
    if (phase !== 'idle') return;
    if (S.get().coins < CLAW_COST) { sfx.miss(); return toast(`金币不够 · You need ${CLAW_COST} coins`); }
    S.get().coins -= CLAW_COST; S.save(); credit = 1; wallet();
    coinBtn.classList.remove('drop'); void coinBtn.offsetWidth; coinBtn.classList.add('drop');
    sfx.coin(); setTimeout(() => sfx.arcade(), 250);
    box.classList.add('lit');
    phase = 'ready'; go.disabled = false; coinBtn.disabled = true; draw();
    say('🕹️ 用摇杆移动，按 <b>抓</b>！ Move with the joystick, then press <b>Catch</b>!');
    left = 20; timerEl.classList.remove('hidden'); timerEl.textContent = left;
    clearInterval(tick);
    tick = setInterval(() => { if (!alive || phase !== 'ready') return clearInterval(tick); left--; timerEl.textContent = left; if (left <= 0) drop(); }, 1000);
  };
  go.onclick = () => { if (phase === 'ready') drop(); };

  // ---------- the catch ----------
  async function drop() {
    if (phase !== 'ready') return;
    phase = 'busy'; credit = 0; clearInterval(tick); timerEl.classList.add('hidden'); steer(0, 0); draw();
    go.disabled = true; sfx.click();
    const H = glass.clientHeight, s = sizeOf(z);
    // the toy on top of the heap right under the claw
    const under = targetAt(x, z);
    const won = !!under && Math.random() < CLAW_CHANCE;
    const slipTop = !won && !!under && Math.random() < 0.5;    // it grabs it, carries it almost to the prize hole… then the claw opens
    // go all the way down: the claw's prongs close around the middle of the toy (or touch the floor)
    const aimAt = under ? bottomOf(under) + 20 * sizeOf(under.z) : baseOf(z);
    const floor = Math.max(10, H - aimAt - 18 - 40 * s);
    say('⬇️ …');
    sfx.whirr(1100);
    await anim(1100, (k) => { depth = floor * ease(k); draw(); });
    setOpen(false); await wait(350);
    let held = null;
    if (under && (won || slipTop)) {
      held = under;
      prizes.splice(prizes.indexOf(under), 1);
      under.el.remove(); grip.append(under.el); under.el.classList.add('held');
    } else if (under) { under.el.classList.add('wiggle'); setTimeout(() => under.el.classList.remove('wiggle'), 500); }
    // a win is counted the moment it is caught (closing the window can't lose it)
    if (won) award(held.id);
    sfx.whirr(1100);
    await anim(1100, (k) => {
      depth = floor * (1 - ease(k)); draw();
    });
    // back to the prize chute (front-left), slowly while carrying a toy… a slipping claw lets go just before it gets there
    const fx = x, fz = z, dist = Math.abs(x - HOME.x) + Math.abs(z - HOME.z) * 40;
    const letGo = slipTop ? 0.72 + Math.random() * 0.2 : 2;
    if (held) sfx.whirr(dist * 26);
    await anim(held ? Math.max(1200, dist * 26) : Math.max(300, dist * 18), (k) => {
      x = fx + (HOME.x - fx) * ease(k); z = fz + (HOME.z - fz) * ease(k); draw();
      if (held && k >= letGo) { setOpen(true); fall(held); held = null; }
    });
    if (held) {
      setOpen(true);
      const el = held.el; el.classList.remove('held'); el.classList.add('into-chute');
      await wait(550); el.remove();
      celebrate(held.id);
      add(held.x, held.z, topAt(held.x, held.z));    // a new toy is put in the machine
    } else {
      setOpen(true);
      if (!slipTop) { sfx.oops(); say(under ? '哎呀，没抓住！ So close — the claw slipped. Try again!' : '哎呀，下面没有娃娃！ Nothing under the claw — aim for a toy!'); }
    }
    if (!alive) return;
    phase = 'idle'; coinBtn.disabled = false; box.classList.remove('lit'); draw();
  }
  function fall(p) {
    // the claw opened at the top: the toy drops back onto the heap under the claw
    const el = p.el; el.classList.remove('held');
    const gr = el.getBoundingClientRect();
    p.x = Math.max(24, Math.min(92, x)); p.z = z; p.layer = topAt(p.x, p.z);
    pile.append(el); put(p);
    const nr = el.getBoundingClientRect();
    el.animate([{ translate: `0 ${gr.top - nr.top}px` }, { translate: '0 0' }], { duration: 450, easing: 'cubic-bezier(.5,0,1,1)' });
    prizes.push(p);
    sfx.oops(); say('😮 哎呀！差一点点！ Oh no — it dropped just before the prize hole! So close!');
  }
  function award(id) {
    const it = ITEMS[id];
    if (it.cat === 'wear' && S.get().owned.includes(id)) { S.get().coins += 10; S.save(); return; }   // already has it: 10 coins instead
    S.grantItem(id);
  }
  function celebrate(id) {
    const it = ITEMS[id];
    sfx.fanfare();
    const where = it.cat === 'wear' ? '在衣柜里 · in your wardrobe' : '在储物箱里 · in your storage box';
    msg.innerHTML = '';
    const win = html`<div class="claw-win"><div class="claw-win-art"></div><div><b>🎉 <span class="zh">抓到了！</span> You won!</b><br><span class="zh">${it.name}</span> ${it.en}<br><small>${where}</small></div></div>`;
    $('.claw-win-art', win).append(spriteCanvas(id, 56)); msg.append(win); wallet();
  }

  $('.claw-close', box).onclick = closeModal;
  wallet(); setOpen(true); draw();
  requestAnimationFrame(draw);
  openModal(box, { onClose: () => {
    alive = false; clearInterval(tick); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
    if (credit) { S.get().coins += CLAW_COST; S.save(); toast(`↩️ ${CLAW_COST} coins returned`, { coins: CLAW_COST }); }   // paid but never played
  } });
}
