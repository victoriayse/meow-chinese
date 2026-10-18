// 🍣 SushiMeow (mall B1): a conveyor-belt sushi restaurant.
// The host gives her a seat number → she sits at that numbered seat → she takes plates off the moving belt, or orders
// on the tablet (a server cat walks the dish over in about 5 s, going round furniture and other cats) → she pays the
// cashier (tell them the seat number, check the receipt, pay with coins) → she may leave. She can't leave unpaid.
// Everything from SushiMeow is eaten here: it can be held or put on the counter, never kept, and it is gone when she leaves.
// The admin chooses the dishes on the belt and sets the prices (on the tablet).
import * as S from './state.js';
import { ITEMS, SNACKS, SUSHI_MENU } from './pixel.js';
import { snackCanvas } from './snacks.js';
import { html, $, openModal, closeModal, toast, coinI, hydrateIcons, esc, KittenView } from './ui.js';
import { sfx } from './audio.js';
import { say, catZ, HOUSE } from './house.js';
import { rest } from './cloud.js';

// one clock for everyone in the restaurant (the server's), so the belt is in the same place on every screen
let clockOff = 0, clockAsked = 0;
export const now = () => Date.now() + clockOff;
function syncClock() {
  if (Date.now() - clockAsked < 60000) return; clockAsked = Date.now();
  const t0 = Date.now();
  rest('rpc/server_time', { method: 'POST', body: '{}' }).then((ms) => { const t1 = Date.now(); if (+ms > 0 && t1 - t0 < 3000) clockOff = +ms - (t0 + t1) / 2; }).catch(() => {});
}
// she's in SushiMeow with a bill to pay: nothing lets her out until she has paid
let inSushi = false;
export const setInSushi = (v) => { inSushi = !!v; };
export const sushiLocked = () => inSushi && mustPay();

export const SUSHI_ROOM = 'mallsushi';
const base = (id) => String(id).split('#')[0];
const SERVE_MS = 5000, BELT_LOOP_S = 92;   // (the belt is twice as long now: same speed, twice the plates)
const st = () => S.get();
const meal = () => st().sushi || null;
export const mustPay = () => !!(meal() && (meal().bill || []).length);
const isSushiFood = (k) => !!(SNACKS[k] && SNACKS[k].sushi);

// leaving SushiMeow: its food stays behind (and a paid / empty table is given back)
export function leaveSushi() {
  const s = st(), have = s.snacks || {}; let n = 0;
  Object.keys(have).forEach((k) => { if (isSushiFood(k)) { n += have[k]; delete have[k]; } });
  if (s.holding && isSushiFood(s.holding)) s.holding = null;
  if (s.sushi && !mustPay()) delete s.sushi;
  if (n || !s.sushi) S.save();
  return n;
}

// the numbered seats: numbered 1…6 in the order they were bought (so the numbers never jump about)
const seatEls = (room) => [...room.querySelectorAll('.decor')].filter((d) => (ITEMS[base(d.dataset.id)] || {}).sushiSeat).sort((a, b) => (a.dataset.id < b.dataset.id ? -1 : 1)).slice(0, 6);
export const seatNoOf = (room, id) => { const i = seatEls(room).findIndex((d) => d.dataset.id === id); return i < 0 ? 0 : i + 1; };
// may she sit here? (only on her own numbered seat)
export function canSit(room, id) {
  if (!(ITEMS[base(id)] || {}).sushiSeat) return true;
  const m = meal(), n = seatNoOf(room, id);
  if (!m || !m.seat) { toast('🍣 <span class="zh">请先找门口的领位员拿座位号</span> Please see the host at the door for a seat number first', { ms: 2600 }); return false; }
  if (n !== m.seat) { toast(`🍣 <span class="zh">这是${n}号座位，你的座位是${m.seat}号</span> This is seat ${n} — your seat is number ${m.seat}`, { ms: 2400 }); return false; }
  return true;
}

export function wireSushi(room, { house, isAdmin, saveShared, getMine, isSeatedMine, blockedAt, otherCats, send = () => {}, onChanged = () => {} }) {
  syncClock(); inSushi = true;
  // (no cashier and no tablet set up yet: nobody can pay, so nobody may be kept here — the bill is let off)
  if (mustPay() && ![...room.querySelectorAll('.decor')].some((d) => { const it = ITEMS[base(d.dataset.id)] || {}; return it.sushiCashier || it.sushiTablet; })) { meal().bill = []; S.save(); }
  const priceOf = (k) => Math.max(0, Math.round((house.prices || {})[k] ?? (SNACKS[k] || {}).price ?? 0));
  const beltDishes = () => { const b = (house.sushiBelt || []).filter((k) => SUSHI_MENU.includes(k)); return b.length ? b : SUSHI_MENU.slice(0, 10); };
  const seats = seatEls(room);
  const host = [...room.querySelectorAll('.decor')].find((d) => (ITEMS[base(d.dataset.id)] || {}).sushiHost);
  room.querySelectorAll('.decor').forEach((d) => { const it = ITEMS[base(d.dataset.id)]; if (it && (it.sushiHost || it.sushiCashier || it.sushiTablet || it.sushiBelt)) d.classList.add('mall-interactive'); });

  // ---------- seat numbers ----------
  // (a seat tucked in behind the counter shows its number on the counter's front, right in front of it)
  function markSeats() {
    const beltEl = [...room.querySelectorAll('.decor')].find((d) => (ITEMS[base(d.dataset.id)] || {}).sushiBelt);
    room.querySelectorAll('.sushi-seatno').forEach((b) => b.remove());
    seats.forEach((d, i) => {
      const b = document.createElement('div'); b.className = 'sushi-seatno';
      b.textContent = String(i + 1); b.classList.toggle('mine', !!(meal() && meal().seat === i + 1));
      const cx = d.offsetLeft + d.offsetWidth / 2;
      const behind = beltEl && d.offsetTop + d.offsetHeight < beltEl.offsetTop + beltEl.offsetHeight && cx > beltEl.offsetLeft && cx < beltEl.offsetLeft + beltEl.offsetWidth;
      if (behind) { b.classList.add('on-counter'); b.style.left = `${((cx - beltEl.offsetLeft) / beltEl.offsetWidth) * 100}%`; beltEl.appendChild(b); }
      else d.appendChild(b);
    });
  }
  markSeats(); requestAnimationFrame(() => { if (room.isConnected) markSeats(); });

  // ---------- the host gives her a seat when she comes in ----------
  function assignSeat() {
    if (meal() && meal().seat) return;
    if (!seats.length) return;
    const taken = new Set(otherCats().map((c) => seatNoOf(room, c.seat)).filter(Boolean));
    const free = seats.map((_, i) => i + 1).filter((n) => !taken.has(n));
    const n = free.length ? free[Math.floor(Math.random() * free.length)] : 1 + Math.floor(Math.random() * seats.length);
    st().sushi = { seat: n, bill: [], orders: [], at: Date.now() }; S.save(); markSeats();
    if (host && host.tux) { say(host.tux.wrap, `欢迎光临！请坐${n}号 · Seat ${n}, please!`); host.tux.kv.jump(); }
    sfx.coin();
    toast(`🍣 <span class="zh">欢迎来到寿司喵！你的座位是 ${n} 号</span> Welcome to SushiMeow! Your seat is number <b>${n}</b>`, { ms: 3600 });
  }
  setTimeout(() => { if (room.isConnected) assignSeat(); }, 700);

  // ---------- the conveyor belt ----------
  const belt = [...room.querySelectorAll('.decor')].find((d) => (ITEMS[base(d.dataset.id)] || {}).sushiBelt);
  const takenAt = new Map();   // plate number → which trip round the belt she took it on (it comes back next time round)
  if (belt) {
    const ln = ITEMS[base(belt.dataset.id)].sushiBelt.lane;
    const lane = document.createElement('div'); lane.className = 'belt-lane';
    Object.assign(lane.style, { left: `${ln.x * 100}%`, top: `${ln.y * 100}%`, width: `${ln.w * 100}%`, height: `${ln.h * 100}%` });
    belt.appendChild(lane);
    const dishes = beltDishes(), N = Math.max(18, dishes.length);
    const plates = [];
    for (let i = 0; i < N; i++) {
      const k = dishes[i % dishes.length];
      const p = document.createElement('button'); p.type = 'button'; p.className = 'bplate'; p.title = `${SNACKS[k].zh} ${SNACKS[k].en} · ${priceOf(k)}`;
      p.innerHTML = '<i class="bp-plate"></i><i class="bp-dome"></i>';
      const c = snackCanvas(k, 2); c.classList.add('bp-food'); p.insertBefore(c, p.lastChild);
      p.addEventListener('pointerdown', (e) => e.stopPropagation());
      p.onclick = (e) => { e.stopPropagation(); takePlate(i, k); };
      lane.appendChild(p); plates.push(p);
    }
    const lap = (i) => Math.floor(now() / 1000 / BELT_LOOP_S + i / N);
    const tick = () => {
      if (!lane.isConnected) return;
      const t = now() / 1000 / BELT_LOOP_S;
      plates.forEach((p, i) => {
        const f = (t + i / N) % 1;
        p.style.left = `${(f * 1.08 - 0.06) * 100}%`;
        p.classList.toggle('gone', takenAt.get(i) === lap(i));
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    function takePlate(i, k) {
      if (takenAt.get(i) === lap(i)) return;
      if (!isSeatedMine()) { sfx.miss(); return toast(meal() && meal().seat ? `🍣 <span class="zh">请先坐到你的${meal().seat}号座位</span> Sit at your seat (number ${meal().seat}) first` : '🍣 <span class="zh">请先找领位员拿座位号</span> Please get a seat number from the host first', { ms: 2400 }); }
      takenAt.set(i, lap(i)); send('sushitake', { i, lap: lap(i) });
      addToBill(k, 'belt'); S.addSnack(k); S.save(); sfx.coin();
      toast(`🍣 <span class="zh">拿了${SNACKS[k].zh}</span> ${esc(SNACKS[k].en)} · ${priceOf(k)} coins — it's at the bottom left`, { ms: 2000 });
      onChanged();
    }
  }
  function addToBill(k, from) { const m = meal(); if (!m) return; (m.bill ||= []).push({ k, p: priceOf(k), from, at: Date.now() }); S.save(); }

  // ---------- the server cat brings tablet orders to her seat ----------
  let serving = Promise.resolve();
  function serve(order) {
    serving = serving.then(() => walkDish(order)).catch(() => {});
  }
  // a little path finder over the floor: round furniture and other cats
  function findPath(a, b) {
    const sx = 2, sy = 1.5, maxY = S.roomMaxY(SUSHI_ROOM), cols = Math.floor(100 / sx), rows = Math.floor(maxY / sy) + 1;
    const cats = otherCats().concat([getMine()]).filter((c) => c && !c.seat);
    const free = (cx, cy) => {
      const x = cx * sx, y = cy * sy;
      if (x < 2 || x > 98 || y < 0.5 || y > maxY) return false;
      if (blockedAt(x, y)) return false;
      return !cats.some((c) => Math.abs(c.x - x) < 3 && Math.abs(c.y - y) < 2.2);
    };
    const near = (p) => {   // the closest free floor cell to p (the seat itself, or the spot in front of it, may be furniture)
      const c = [Math.round(p.x / sx), Math.round(p.y / sy)];
      for (let r = 0; r <= 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = c[0] + dx, y = c[1] + dy; if (x >= 0 && y >= 0 && x < cols && y < rows && free(x, y)) return [x, y];
      }
      return c;
    };
    const key = (x, y) => y * cols + x, start = near(a), goal = near(b);
    const open = [[start[0], start[1], 0]], from = new Map([[key(...start), null]]), cost = new Map([[key(...start), 0]]);
    let found = null, guard = 0;
    while (open.length && guard++ < 6000) {
      open.sort((p, q) => p[2] - q[2]); const [x, y] = open.shift();
      if (Math.abs(x - goal[0]) <= 1 && Math.abs(y - goal[1]) <= 1) { found = key(x, y); break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || !free(nx, ny)) continue;
        const nk = key(nx, ny), nc = cost.get(key(x, y)) + (dx && dy ? 1.42 : 1);
        if (cost.has(nk) && cost.get(nk) <= nc) continue;
        cost.set(nk, nc); from.set(nk, key(x, y)); open.push([nx, ny, nc + Math.hypot(goal[0] - nx, goal[1] - ny)]);
      }
    }
    if (found == null) return [a, { x: goal[0] * sx, y: goal[1] * sy }];
    const pts = []; for (let k = found; k != null; k = from.get(k)) pts.unshift({ x: (k % cols) * sx, y: Math.floor(k / cols) * sy });
    return [a, ...pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1)];   // ends on the free spot next to her seat
  }
  async function walkDish(order, remote = null) {
    if (!room.isConnected) return;
    let path;
    if (remote) path = remote.path;
    else {
      const m = meal(); const seat = m && seats[m.seat - 1];
      const H = room.clientHeight, W = room.clientWidth;
      const target = seat ? { x: ((seat.offsetLeft + seat.offsetWidth / 2) / W) * 100, y: Math.max(1, ((H - (seat.offsetTop + seat.offsetHeight)) / H) * 100) } : { x: 50, y: 4 };
      const startP = { x: 95, y: Math.min(S.roomMaxY(SUSHI_ROOM), 10) };
      path = findPath(startP, target).map((p) => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1) }));
      send('sushiserve', { k: order.k, path });   // everyone in the restaurant sees the server walk over
    }
    const startP = path[0];
    const el = html`<div class="vcat sushi-server"><div class="kitten-wrap"><div class="kflip"></div><div class="nametag">服务员 Server</div></div></div>`;
    const kv = new KittenView({ scale: HOUSE.kitten, fur: 'white', equipped: { body: 'tuxedo', neck: 'bowtie' } }); kv.setMood('happy'); kv.setHeld(order.k);
    el.querySelector('.kflip').appendChild(kv.canvas); room.appendChild(el);
    const walk = async (pts) => {
      kv.canvas.classList.add('walking');
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1], p1 = pts[i], d = Math.hypot(p1.x - p0.x, (p1.y - p0.y) * 1.4);
        kv.setFacing(p1.x < p0.x - 0.1 ? true : p1.x > p0.x + 0.1 ? false : kv.left);
        el.style.zIndex = catZ(p1.x, p1.y);
        await el.animate([{ left: `${p0.x}%`, bottom: `${p0.y}%` }, { left: `${p1.x}%`, bottom: `${p1.y}%` }], { duration: Math.max(60, d * 40), fill: 'forwards' }).finished;
        if (!room.isConnected) return;
      }
      kv.canvas.classList.remove('walking');
    };
    el.style.left = `${startP.x}%`; el.style.bottom = `${startP.y}%`;
    await walk(path); if (!room.isConnected) return;
    say(el.querySelector('.kitten-wrap'), '请慢用！Enjoy!'); kv.setHeld(null); kv.jump();
    const mm = meal(); const o = !remote && mm && (mm.orders || []).find((x) => x.id === order.id);
    if (o && !o.served) { o.served = true; S.addSnack(order.k); S.save(); sfx.coin(); toast(`🍣 <span class="zh">${SNACKS[order.k].zh}来了！</span> Your ${esc(SNACKS[order.k].en)} is here — bottom left`, { ms: 2200 }); onChanged(); }
    await new Promise((ok) => setTimeout(ok, 700));
    await walk(path.slice().reverse());
    el.remove();
  }
  // orders still on their way (e.g. after the room redrew): send them out again
  (meal() && meal().orders || []).filter((o) => !o.served).forEach((o) => setTimeout(() => { if (room.isConnected) serve(o); }, Math.max(0, o.at - Date.now())));

  // ---------- the tablet: order / my orders / my bill (and, for the admin, prices and the belt) ----------
  function openTablet() {
    const m = meal();
    if (!m || !m.seat) { sfx.miss(); return toast('🍣 <span class="zh">请先找领位员拿座位号</span> Please get a seat number from the host first', { ms: 2400 }); }
    if (!isSeatedMine()) { sfx.miss(); return toast(`🍣 <span class="zh">请先坐到你的${m.seat}号座位</span> Sit at your seat (number ${m.seat}) first`, { ms: 2400 }); }
    let tab = 'menu'; const qty = {};
    const box = html`<div class="card stack sushi-tab"><div class="sushi-tab-head"><b>🍣 寿司喵 SushiMeow</b><span class="seat-pill"><span class="zh">座位</span> Seat ${m.seat}</span></div>
        <div class="sushi-tabs"></div><div class="sushi-body"></div><div class="sushi-foot"></div>
        <button type="button" class="btn white small" id="st-close">关闭 Close</button></div>`;
    const tabs = [['menu', '🍣 <span class="zh">点餐</span> Menu'], ['orders', '🧾 <span class="zh">已点</span> Ordered'], ['bill', '💰 <span class="zh">账单</span> Bill']]
      .concat(isAdmin() ? [['prices', '✏️ Prices'], ['belt', '🎌 Belt']] : []);
    const body = $('.sushi-body', box), foot = $('.sushi-foot', box);
    const total = () => (meal().bill || []).reduce((t, b) => t + b.p, 0);
    function draw() {
      $('.sushi-tabs', box).innerHTML = tabs.map(([k, t]) => `<button type="button" class="${k === tab ? 'on' : ''}" data-t="${k}">${t}</button>`).join('');
      box.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { tab = b.dataset.t; sfx.click(); draw(); }; });
      body.innerHTML = ''; foot.innerHTML = '';
      if (tab === 'menu' || tab === 'prices' || tab === 'belt') {
        const onBelt = new Set(house.sushiBelt && house.sushiBelt.length ? house.sushiBelt : beltDishes());
        SUSHI_MENU.forEach((k) => {
          const sn = SNACKS[k];
          const right = tab === 'menu' ? `<span class="pr">${priceOf(k)}${coinI(12)}</span><span class="q"><button type="button" data-q="-1">−</button><b>${qty[k] || 0}</b><button type="button" data-q="1">＋</button></span>`
            : tab === 'prices' ? `<input type="number" min="0" max="999" value="${priceOf(k)}" data-k="${k}" aria-label="Price">`
            : `<label class="belt-tick"><input type="checkbox" data-b="${k}" ${onBelt.has(k) ? 'checked' : ''}> <span class="zh">上转带</span></label>`;
          const row = html`<div class="dl-row"><span class="art"></span><span class="nm"><span class="zh">${esc(sn.zh)}</span><small>${esc(sn.en)}</small></span>${right}</div>`;
          $('.art', row).append(snackCanvas(k, 2));
          row.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { qty[k] = Math.max(0, Math.min(5, (qty[k] || 0) + +b.dataset.q)); if (count() > 10) qty[k]--; sfx.click(); draw(); }; });
          body.append(row);
        });
        if (tab === 'menu') {
          const t = SUSHI_MENU.reduce((s, k) => s + (qty[k] || 0) * priceOf(k), 0);
          foot.innerHTML = `<span>${count()} · <b>${t}</b>${coinI(14)} <small><span class="zh">吃完到收银台付款</span> pay at the cashier</small></span><button type="button" class="ph-btn green" id="st-order" ${count() ? '' : 'disabled'}>🛎️ <span class="zh">下单</span> Order</button>`;
          $('#st-order', foot).onclick = order;
        } else if (tab === 'prices') {
          foot.innerHTML = '<button type="button" class="ph-btn green" id="st-save">💾 Save prices</button>';
          $('#st-save', foot).onclick = async () => {
            const p = { ...(st().kioskPrices || {}) };
            body.querySelectorAll('input[data-k]').forEach((i) => { const n = Math.round(+i.value); if (n >= 0 && n <= 999) p[i.dataset.k] = n; });
            st().kioskPrices = p; S.save(); house.prices = { ...(house.prices || {}), ...p };
            toast(await saveShared() ? '💾 Prices saved' : 'Could not save — check your connection'); draw();
          };
        } else {
          foot.innerHTML = '<span><small>Choose what goes round on the belt</small></span><button type="button" class="ph-btn green" id="st-belt">💾 Save belt</button>';
          $('#st-belt', foot).onclick = async () => {
            const pick = [...body.querySelectorAll('input[data-b]:checked')].map((i) => i.dataset.b);
            st().sushiBelt = pick; S.save(); house.sushiBelt = pick;
            toast(await saveShared() ? '🎌 Belt saved — it updates when the room redraws' : 'Could not save — check your connection');
          };
        }
      } else if (tab === 'orders') {
        const list = meal().bill || [];
        body.innerHTML = list.length ? '' : '<p class="help"><span class="zh">还没点东西</span> Nothing ordered yet</p>';
        list.forEach((b) => {
          const o = b.from === 'tablet' && (meal().orders || []).find((x) => x.k === b.k && Math.abs(x.at - SERVE_MS - b.at) < 1500);
          const row = html`<div class="dl-row"><span class="art"></span><span class="nm"><span class="zh">${esc(SNACKS[b.k].zh)}</span><small>${esc(SNACKS[b.k].en)} · ${b.from === 'belt' ? '🎌 belt' : '📱 tablet'}</small></span><span class="pr">${o && !o.served ? '🛵 <span class="zh">在路上</span>' : '✓'}</span></div>`;
          $('.art', row).append(snackCanvas(b.k, 2)); body.append(row);
        });
      } else {
        body.innerHTML = receiptHtml(meal());
        const noCashier = ![...room.querySelectorAll('.decor')].some((d) => (ITEMS[base(d.dataset.id)] || {}).sushiCashier);
        foot.innerHTML = noCashier && total() ? `<span><b>${total()}</b>${coinI(14)}</span><button type="button" class="ph-btn green" id="st-pay" ${st().coins >= total() ? '' : 'disabled'}>💳 <span class="zh">付款</span> Pay</button>`
          : `<span><span class="zh">请到收银台付款</span> Please pay at the cashier · <b>${total()}</b>${coinI(14)}</span>`;
        const pb = $('#st-pay', foot); if (pb) pb.onclick = () => { const tt = total(); if (st().coins < tt) return; st().coins -= tt; meal().bill = []; meal().paid = Date.now(); S.save(); sfx.coin(); toast(`💰 Paid ${tt} coins — thank you!`, { ms: 2400 }); onChanged(); draw(); };
      }
      hydrateIcons(box);
    }
    const count = () => SUSHI_MENU.reduce((t, k) => t + (qty[k] || 0), 0);
    function order() {
      const items = SUSHI_MENU.flatMap((k) => Array(qty[k] || 0).fill(k)); if (!items.length) return;
      const mm = meal(); let at = Date.now() + SERVE_MS;
      items.forEach((k, i) => {
        const o = { id: crypto.randomUUID(), k, at: at + i * 600 };
        (mm.orders ||= []).push(o); (mm.bill ||= []).push({ k, p: priceOf(k), from: 'tablet', at: o.at - SERVE_MS });
        setTimeout(() => { if (room.isConnected) serve(o); }, o.at - Date.now());
      });
      S.save(); sfx.coin(); Object.keys(qty).forEach((k) => delete qty[k]);
      toast('🛎️ <span class="zh">下单了！服务员马上送到你的座位。</span> Ordered — the server brings it to your seat in a moment.', { ms: 2600 });
      tab = 'orders'; draw(); onChanged();
    }
    $('#st-close', box).onclick = closeModal;
    draw(); openModal(box);
  }

  // ---------- the cashier ----------
  function receiptHtml(m) {
    const bill = (m && m.bill) || [], total = bill.reduce((t, b) => t + b.p, 0), lines = {};
    bill.forEach((b) => { lines[b.k] ||= { n: 0, p: 0 }; lines[b.k].n++; lines[b.k].p += b.p; });
    return `<div class="receipt"><div class="r-head">🍣 寿司喵 SushiMeow<br><small><span class="zh">座位</span> Seat ${m ? m.seat : '-'} · ${new Date().toLocaleDateString()}</small></div>
      ${Object.entries(lines).map(([k, l]) => `<div class="r-line"><span>${esc(SNACKS[k].zh)} ${esc(SNACKS[k].en)} ×${l.n}</span><b>${l.p}</b></div>`).join('') || '<div class="r-line"><span>—</span><b>0</b></div>'}
      <div class="r-total"><span><span class="zh">合计</span> Total</span><b>${total}${coinI(14)}</b></div></div>`;
  }
  function openCashier(cashierEl) {
    const tux = cashierEl && cashierEl.tux;
    if (tux) { say(tux.wrap, '你坐几号？· Which seat?'); tux.kv.jump(); }
    const box = html`<div class="card stack" style="align-items:stretch;text-align:center"><div class="h-title" style="justify-content:center">💰 <span class="zh">收银台</span> Cashier</div>
        <p style="margin:0"><span class="zh">请告诉我你的座位号</span> Tell me your seat number</p><div class="seat-pick"></div><div class="cash-out"></div>
        <button type="button" class="btn white" id="ca-close">关闭 Close</button></div>`;
    for (let n = 1; n <= Math.max(6, seats.length); n++) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn white'; b.textContent = String(n);
      b.onclick = () => { sfx.click(); showBill(n); };
      $('.seat-pick', box).appendChild(b);
    }
    function showBill(n) {
      const out = $('.cash-out', box), m = meal();
      if (!m || m.seat !== n || !(m.bill || []).length) { out.innerHTML = `<p class="help"><span class="zh">${n}号座位没有你的账单</span> There's no bill of yours for seat ${n}.</p>`; return; }
      const total = m.bill.reduce((t, b) => t + b.p, 0), left = (m.orders || []).some((o) => !o.served);
      out.innerHTML = receiptHtml(m) + `<p class="help" style="margin:4px 0"><span class="zh">你有</span> You have <b>${st().coins}</b>${coinI(13)}</p>
        <button type="button" class="btn green" id="ca-pay" ${st().coins >= total && !left ? '' : 'disabled'}>💳 <span class="zh">付${total}</span> Pay ${total}</button>${left ? '<p class="help"><span class="zh">还有菜在路上</span> Something is still on its way to your seat</p>' : ''}`;
      hydrateIcons(out);
      $('#ca-pay', out).onclick = () => {
        const mm = meal(); const tt = (mm.bill || []).reduce((t, b) => t + b.p, 0); if (st().coins < tt) return;
        st().coins -= tt; mm.bill = []; mm.paid = Date.now(); S.save(); sfx.coin(); closeModal();
        if (tux) { say(tux.wrap, '谢谢光临！· Thank you, come again!'); tux.kv.jump(); }
        toast(`💰 <span class="zh">付好了！谢谢光临寿司喵</span> Paid ${tt} coins — thank you! You may leave whenever you like.`, { ms: 3000 }); onChanged();
      };
    }
    $('#ca-close', box).onclick = closeModal; openModal(box); hydrateIcons(box);
  }

  room.addEventListener('click', (e) => {
    const d = e.target.closest('.decor'); if (!d || e.target.closest('button') || room.classList.contains('arranging')) return;
    const it = ITEMS[base(d.dataset.id)]; if (!it) return;
    if (it.sushiHost) { sfx.click(); if (!(meal() && meal().seat)) return assignSeat(); if (d.tux) { say(d.tux.wrap, `你的座位是${meal().seat}号 · Seat ${meal().seat}`); d.tux.kv.jump(); } return; }
    if (it.sushiTablet) { sfx.click(); return openTablet(); }
    if (it.sushiCashier) { sfx.click(); return openCashier(d); }
  });
  return {
    onBroadcast(ev, p) {
      if (!room.isConnected || !p) return;
      if (ev === 'sushitake' && Number.isInteger(p.i)) takenAt.set(p.i, p.lap);
      if (ev === 'sushiserve' && Array.isArray(p.path) && p.path.length > 1 && SNACKS[p.k] && p.path.length < 200) serving = serving.then(() => walkDish({ k: p.k }, { path: p.path })).catch(() => {});
    },
  };

}
