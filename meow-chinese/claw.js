// 🕹️ The arcade's claw machine: 5 coins a go. Move the claw with the joystick, press 抓 Catch.
// It catches the prize under it 1 time in 5 — and sometimes the claw opens at the top and drops it.
import * as S from './state.js';
import { ITEMS, spriteCanvas, CLAW_PRIZES } from './pixel.js';
import { html, $, openModal, closeModal, toast, coinI, hydrateIcons } from './ui.js';
import { sfx } from './audio.js';

export const CLAW_COST = 5, CLAW_CHANCE = 0.2;
const HOME_X = 12, X_MIN = 10, X_MAX = 90, SPEED = 38;   // % of the glass; % per second
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
        <div class="claw" style="left:${HOME_X}%"><div class="claw-cable"></div><div class="claw-hub"></div><i class="claw-prong l"></i><i class="claw-prong r"></i><div class="claw-grip"></div></div>
        <div class="claw-pile"></div>
        <div class="claw-chute"><span>PRIZE</span></div>
        <div class="claw-timer hidden"></div>
      </div>
      <div class="claw-panel">
        <div class="claw-joy" aria-label="Joystick"><div class="claw-knob"></div></div>
        <button type="button" class="claw-go" disabled><span class="zh">抓</span><small>START / CATCH</small></button>
        <button type="button" class="claw-coin"><span class="claw-slot"></span><b>${CLAW_COST}</b>${coinI(16)}<small>投币 Coin</small></button>
      </div>
      <div class="claw-msg">投币开始 · Put a coin in to play! <small>(${CLAW_COST} coins a go)</small></div>
      <div class="row" style="justify-content:space-between;align-items:center"><span class="claw-wallet"></span><button type="button" class="btn white small claw-close">关闭 Close</button></div>
    </div>`;
  const glass = $('.claw-glass', box), claw = $('.claw', box), cable = $('.claw-cable', box), grip = $('.claw-grip', box);
  const pile = $('.claw-pile', box), msg = $('.claw-msg', box), go = $('.claw-go', box), coinBtn = $('.claw-coin', box);
  const knob = $('.claw-knob', box), joy = $('.claw-joy', box), timerEl = $('.claw-timer', box);
  let x = HOME_X, depth = 0, dir = 0, phase = 'idle', credit = 0, left = 0, raf = 0, last = 0, tick = null, alive = true;

  const wallet = () => { $('.claw-wallet', box).innerHTML = `你有 You have <b>${S.get().coins}</b>${coinI(16)}`; hydrateIcons(box); };
  const say = (t) => { msg.innerHTML = t; };
  const setOpen = (open) => claw.classList.toggle('closed', !open);
  const draw = () => { claw.style.left = `${x}%`; cable.style.height = `${8 + depth}px`; };

  // ---------- the prizes in the machine ----------
  const prizes = [];
  const SPOTS = [[26, 52], [40, 50], [54, 54], [68, 50], [83, 52], [33, 8], [47, 10], [61, 6], [75, 10], [89, 8]];   // [x %, bottom px]
  const pick = () => CLAW_PRIZES[Math.floor(Math.random() * CLAW_PRIZES.length)];
  function place(spot, id = pick()) {
    const el = document.createElement('div'); el.className = 'claw-prize';
    el.append(spriteCanvas(id, 46)); el.title = ITEMS[id].en;
    el.style.left = `${spot[0]}%`; el.style.bottom = `${spot[1]}px`; el.style.zIndex = spot[1] > 30 ? 1 : 2;
    pile.append(el);
    const p = { id, el, spot }; prizes.push(p); return p;
  }
  SPOTS.forEach((s) => place(s));

  // ---------- moving the claw ----------
  const loop = (t) => {
    raf = 0; if (!alive) return;
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    if (phase === 'ready' && dir) { x = Math.max(X_MIN, Math.min(X_MAX, x + dir * SPEED * dt)); draw(); }
    if (phase === 'ready' && dir) raf = requestAnimationFrame(loop); else last = 0;
  };
  const steer = (d) => { dir = d; knob.style.transform = `translate(${d * 22}px, 0) rotate(${d * 18}deg)`; if (d && !raf) raf = requestAnimationFrame(loop); };
  let pid = null;
  const aim = (e) => { const r = joy.getBoundingClientRect(); const d = (e.clientX - r.left - r.width / 2) / (r.width / 2); steer(Math.abs(d) < 0.2 ? 0 : Math.max(-1, Math.min(1, d))); };
  joy.addEventListener('pointerdown', (e) => { e.preventDefault(); pid = e.pointerId; try { joy.setPointerCapture(pid); } catch {} joy.classList.add('down'); aim(e); });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === pid) aim(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => joy.addEventListener(ev, (e) => { if (e.pointerId === pid) { pid = null; joy.classList.remove('down'); steer(0); } }));
  joy.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  const kd = (e) => { if (!alive) return; if (e.key === 'ArrowLeft') { e.preventDefault(); steer(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); steer(1); } else if ((e.key === ' ' || e.key === 'Enter') && phase === 'ready') { e.preventDefault(); drop(); } };
  const ku = (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') steer(0); };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);

  // ---------- coin in ----------
  coinBtn.onclick = () => {
    if (phase !== 'idle') return;
    if (S.get().coins < CLAW_COST) { sfx.miss(); return toast(`金币不够 · You need ${CLAW_COST} coins`); }
    S.get().coins -= CLAW_COST; S.save(); credit = 1; wallet();
    coinBtn.classList.remove('drop'); void coinBtn.offsetWidth; coinBtn.classList.add('drop');
    sfx.coin(); setTimeout(() => sfx.arcade(), 250);
    box.classList.add('lit');
    phase = 'ready'; go.disabled = false; coinBtn.disabled = true;
    say('🕹️ 用摇杆移动，按 <b>抓</b>！ Move with the joystick, then press <b>Catch</b>!');
    left = 20; timerEl.classList.remove('hidden'); timerEl.textContent = left;
    clearInterval(tick);
    tick = setInterval(() => { if (!alive || phase !== 'ready') return clearInterval(tick); left--; timerEl.textContent = left; if (left <= 0) drop(); }, 1000);
  };
  go.onclick = () => { if (phase === 'ready') drop(); };

  // ---------- the catch ----------
  async function drop() {
    if (phase !== 'ready') return;
    phase = 'busy'; credit = 0; clearInterval(tick); timerEl.classList.add('hidden'); steer(0);
    go.disabled = true; sfx.click();
    const H = glass.clientHeight;
    // the prize under the claw (front row first)
    const under = prizes.filter((p) => Math.abs(p.spot[0] - x) < 7).sort((a, b) => a.spot[1] - b.spot[1] || Math.abs(a.spot[0] - x) - Math.abs(b.spot[0] - x))[0];
    const won = !!under && Math.random() < CLAW_CHANCE;
    const slipTop = !won && !!under && Math.random() < 0.5;    // it grabs it, then the claw opens at the top
    const floor = H - 44 - (under ? under.spot[1] + 30 : 4);
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
      if (slipTop && held && k > 0.82) { setOpen(true); fall(held); held = null; }
    });
    if (held) {
      sfx.whirr(Math.abs(x - HOME_X) * 20);
      const from = x; await anim(Math.max(300, Math.abs(x - HOME_X) * 18), (k) => { x = from + (HOME_X - from) * ease(k); draw(); });
      setOpen(true);
      const el = held.el; el.classList.remove('held'); el.classList.add('into-chute');
      await wait(550); el.remove();
      celebrate(held.id);
      place(held.spot);   // a new prize fills the gap
    } else {
      const from = x; await anim(Math.max(300, Math.abs(x - HOME_X) * 18), (k) => { x = from + (HOME_X - from) * ease(k); draw(); });
      setOpen(true);
      if (!slipTop) { sfx.oops(); say(under ? '哎呀，没抓住！ So close — the claw slipped. Try again!' : '哎呀，下面没有娃娃！ Nothing under the claw — aim for a prize!'); }
    }
    if (!alive) return;
    phase = 'idle'; coinBtn.disabled = false; box.classList.remove('lit');
  }
  function fall(p) {
    // the claw opened at the top: the prize drops back into the pile
    const el = p.el; el.classList.remove('held');
    const gr = el.getBoundingClientRect();
    pile.append(el);
    const spot = [Math.max(24, Math.min(90, x)), p.spot[1]];
    el.style.left = `${spot[0]}%`; el.style.bottom = `${spot[1]}px`;
    const nr = el.getBoundingClientRect();
    el.animate([{ transform: `translate(-50%, ${gr.top - nr.top}px)` }, { transform: 'translate(-50%, 0)' }], { duration: 450, easing: 'cubic-bezier(.5,0,1,1)' });
    p.spot = spot; prizes.push(p);
    sfx.oops(); say('😮 哎呀！爪子松开了！ Oh no — the claw opened and dropped it!');
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
  openModal(box, { onClose: () => {
    alive = false; clearInterval(tick); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
    if (credit) { S.get().coins += CLAW_COST; S.save(); toast(`↩️ ${CLAW_COST} coins returned`, { coins: CLAW_COST }); }   // paid but never played
  } });
}
