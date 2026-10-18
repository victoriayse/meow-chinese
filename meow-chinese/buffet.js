// 🍱 The mall Buffet (L2, left of the Fashion Store).
// Pay the host cat 100 coins to get a buffet pass; the gate only lets pass-holders through (it opens for them and shuts
// right behind them). Inside, the order kiosk is free; food comes out at the Food counter and drinks at the Drinks counter.
// Anything from the buffet is gone when she leaves the buffet (and the pass ends, so coming back means paying again).
// Orders are kept on her own device (like shopping bags); food put on a buffet table is shared through the server.
import * as S from './state.js';
import { ITEMS, SNACKS, BUFFET_FOOD, BUFFET_DRINKS, drawGrid, artGrid } from './pixel.js';
import { snackCanvas, showCounter } from './snacks.js';
import { html, $, openModal, closeModal, toast, coinI, hydrateIcons } from './ui.js';
import { sfx } from './audio.js';
import { say } from './house.js';

export const BUFFET_ROOM = 'mallbuffet', BUFFET_FEE = 100;
const base = (id) => String(id).split('#')[0];
export const hasPass = () => !!S.get().buffetPass;
const orders = () => (S.get().buffetOrders ||= []);

// furniture can't be walked through — except things lying flat on the floor (rugs, mats, pools), curtains,
// doorways, and the stage (she climbs onto that)
export function isBlocker(id, el) {
  const b = base(id), it = ITEMS[b];
  if (!it || it.cat !== 'decor' || it.walkOver || it.walldoor) return false;
  if (el && (el.classList.contains('flat') || el.classList.contains('curtain') || el.classList.contains('pool-el'))) return false;
  if (it.door || it.spot === 'rug' || it.spot === 'under' || it.spot === 'curtain' || it.panel === 'door' || (it.seat && it.seat.walk)) return false;
  return true;
}

// leaving the buffet: its food and drinks stay behind, and the pass ends
export function leaveBuffet() {
  const st = S.get(), have = st.snacks || {}; let n = 0;
  Object.keys(have).forEach((k) => { if (SNACKS[k] && SNACKS[k].buffet) { n += have[k]; delete have[k]; } });
  if (st.holding && SNACKS[st.holding] && SNACKS[st.holding].buffet) st.holding = null;
  const had = !!st.buffetPass;
  delete st.buffetPass; st.buffetOrders = [];
  if (n || had) S.save();
  return n;
}

export function setGate(el, open) {
  if (!el || el.classList.contains('gate-open') === !!open) return;
  if (!open && el.classList.contains('gate-held')) return;   // the admin is holding it open
  const it = ITEMS[base(el.dataset.id)], c = el.querySelector('canvas');
  el.classList.toggle('gate-open', !!open);
  if (c && it && it.frames && it.frames.open) {
    const scale = parseFloat(c.style.width) / (it.art[0].length || 1);   // drawGrid adds the screen's pixel ratio itself
    drawGrid(c, artGrid(open ? it.frames.open : it.art, it.pal), scale);
  }
}

export function payHost(onChanged) {
  if (hasPass()) { toast('🍱 <span class="zh">已经付过了，请进！</span> You\'ve paid — go on in and enjoy!', { ms: 2200 }); return; }
  const box = html`<div class="card stack" style="align-items:center;text-align:center">
      <div style="font-size:44px">🍱</div>
      <div class="h-title" style="justify-content:center"><span class="zh">欢迎来到自助餐厅！</span></div>
      <p style="margin:0">Welcome to the Buffet! <b>${BUFFET_FEE}</b>${coinI(16)} <span class="zh">一位</span> per person.<br><small class="help">Then order as much food and drink as you like — free! Food and drinks stay here when you leave.</small></p>
      <p class="help" style="margin:0"><span class="zh">你有</span> You have <b>${S.get().coins}</b>${coinI(14)}</p>
      <div class="row" style="justify-content:center"><button type="button" class="btn white" id="bf-no">不用了 No thanks</button><button type="button" class="btn green" id="bf-pay" ${S.get().coins >= BUFFET_FEE ? '' : 'disabled'}>💳 <span class="zh">付${BUFFET_FEE}</span> Pay</button></div>
    </div>`;
  $('#bf-no', box).onclick = closeModal;
  $('#bf-pay', box).onclick = () => {
    if (hasPass() || S.get().coins < BUFFET_FEE) return closeModal();
    S.get().coins -= BUFFET_FEE; S.get().buffetPass = { at: Date.now() }; S.save(); sfx.coin(); closeModal();
    toast('🎟️ <span class="zh">付好了！闸门会为你打开。</span> Paid! Walk through the gate — it opens just for you.', { ms: 3200 });
    onChanged();
  };
  openModal(box); hydrateIcons(box);
}

function orderFood(onChanged, isInside) {
  const qty = {}, all = [...BUFFET_FOOD, ...BUFFET_DRINKS];
  const box = html`<div class="card stack kiosk-card"><div class="h-title">🍱 <span class="zh">自助餐点餐</span> Buffet order <small>· <span class="zh">免费</span> Free</small></div>
      <div class="kiosk-list"></div><div class="kiosk-total"></div>
      <p class="help" style="margin:0"><span class="zh">食物在 🍱 食物柜台拿，饮料在 🥤 饮料柜台拿。</span><br>Collect food at the 🍱 Food counter and drinks at the 🥤 Drinks counter.</p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn white" id="bk-close">关闭 Close</button><button type="button" class="btn green" id="bk-order" disabled>🧾 <span class="zh">下单</span> Order</button></div></div>`;
  const list = $('.kiosk-list', box), go = $('#bk-order', box);
  const count = () => all.reduce((t, k) => t + (qty[k] || 0), 0);
  const head = (t) => { const h = document.createElement('div'); h.className = 'kiosk-head'; h.innerHTML = t; list.append(h); };
  function draw() {
    list.innerHTML = '';
    [[BUFFET_FOOD, '🍱 <span class="zh">食物</span> Food'], [BUFFET_DRINKS, '🥤 <span class="zh">饮料</span> Drinks']].forEach(([menu, title]) => {
      head(title);
      menu.forEach((k) => {
        const sn = SNACKS[k];
        const row = html`<div class="kiosk-row"><span class="art"></span><span class="nm"><span class="zh">${sn.zh}</span><small>${sn.en}</small></span>
            <span class="pr"><span class="zh">免费</span> Free</span><span class="q"><button type="button" class="qty-btn" data-q="-1">−</button><b>${qty[k] || 0}</b><button type="button" class="qty-btn" data-q="1">＋</button></span></div>`;
        $('.art', row).append(snackCanvas(k, 3));
        row.querySelectorAll('.qty-btn').forEach((b) => { b.onclick = () => { qty[k] = Math.max(0, Math.min(4, (qty[k] || 0) + +b.dataset.q)); if (count() > 8) qty[k]--; sfx.click(); draw(); }; });
        list.append(row);
      });
    });
    $('.kiosk-total', box).innerHTML = `<span class="zh">一次最多点8样</span> Up to 8 items at a time · <b>${count()}</b>`;
    go.disabled = !count();
  }
  $('#bk-close', box).onclick = closeModal;
  go.onclick = () => {
    if (!isInside()) { closeModal(); return toast('请先走进闸门 · Walk in through the gate first'); }
    const now = Date.now(), list2 = orders();
    let tf = Math.max(now, ...list2.filter((o) => o.kind === 'food').map((o) => o.readyAt)), td = Math.max(now, ...list2.filter((o) => o.kind === 'drink').map((o) => o.readyAt));
    all.forEach((k) => { for (let i = 0; i < (qty[k] || 0); i++) {
      const kind = BUFFET_DRINKS.includes(k) ? 'drink' : 'food';
      const at = kind === 'food' ? (tf = Math.max(now + 3000, tf + 1500)) : (td = Math.max(now + 2000, td + 1200));
      list2.push({ id: crypto.randomUUID(), item: k, kind, readyAt: at });
    } });
    S.save(); sfx.coin(); closeModal();
    toast('🧾 <span class="zh">点好了！去柜台拿</span> Ordered — collect it at the Food / Drinks counters', { ms: 3000 });
    onChanged();
  };
  draw(); openModal(box); hydrateIcons(box);
}

// Call after the buffet room is drawn.
// isInside(): is she on the food side of the gate? (ordering, collecting and sitting only work in there)
export function wireBuffet(room, { onChanged = () => {}, isInside = hasPass } = {}) {
  room.querySelectorAll('.decor').forEach((d) => { const it = ITEMS[base(d.dataset.id)]; if (it && (it.buffetHost || it.buffetKiosk || it.buffetCounter)) d.classList.add('mall-interactive'); });
  room.addEventListener('click', (e) => {
    const d = e.target.closest('.decor'); if (!d || e.target.closest('button') || room.classList.contains('arranging')) return;
    const it = ITEMS[base(d.dataset.id)]; if (!it) return;
    if (it.buffetHost) { sfx.click(); if (d.tux) { say(d.tux.wrap, hasPass() ? '请慢用！Enjoy!' : `${BUFFET_FEE}金币一位 · ${BUFFET_FEE} coins each`); d.tux.kv.jump(); } return payHost(onChanged); }
    if (it.buffetKiosk) { sfx.click(); if (!isInside()) return toast(hasPass() ? '🚪 <span class="zh">请先走进闸门</span> Walk in through the gate first' : '🎟️ <span class="zh">请先在门口付款</span> Please pay the host at the entrance first', { ms: 2200 }); return orderFood(() => { onChanged(); show(); }, isInside); }
  });
  // the two collection counters: up to 2 ready orders each
  const counters = { food: null, drink: null };
  room.querySelectorAll('.decor').forEach((d) => { const it = ITEMS[base(d.dataset.id)]; if (it && it.buffetCounter && !counters[it.buffetCounter]) counters[it.buffetCounter] = d; });
  const sig = {};
  function show() {
    if (!room.isConnected) return;
    ['food', 'drink'].forEach((kind) => {
      const counter = counters[kind]; if (!counter) return;
      const mine = orders().filter((o) => o.kind === kind && SNACKS[o.item]);
      const ready = mine.filter((o) => o.readyAt <= Date.now()).slice(0, 2).map((o) => ({ id: o.id, item: o.item }));
      const s = ready.map((o) => o.id).join() + '|' + mine.length; if (sig[kind] === s) return; sig[kind] = s;
      showCounter({ querySelector: () => counter }, { ready, waiting: mine.length }, (o, button) => {
        if (!isInside()) return toast(hasPass() ? '请先走进闸门 · Walk in through the gate first' : '请先在门口付款 · Please pay the host first');
        const list = orders(), i = list.findIndex((x) => x.id === o.id); if (i < 0) return;
        button.disabled = true; const [got] = list.splice(i, 1); S.addSnack(got.item); S.save();
        sfx.coin(); toast(`😋 <span class="zh">拿到${SNACKS[got.item].zh}了</span> Tap it at the bottom to hold it`, { ms: 1800 });
        onChanged(); show();
      }, `buffet-${kind}`);
    });
  }
  show();
  const t = setInterval(() => { if (!room.isConnected) return clearInterval(t); show(); }, 1000);
}

// ---------- 🎬 the cinema: a ticket for each theatre (10 coins each — a Theatre 1 ticket doesn't open Theatre 2) ----------
export const CINEMA_FEE = 10, THEATRES = ['theatre1', 'theatre2'];
const tickets = () => (S.get().cinemaTickets ||= {});
// 'cinema' = a ticket for either theatre (what a theatre gate looks for); a theatre door wants that theatre's own ticket
export const hasTicket = (theatre) => (theatre === 'cinema' ? THEATRES.some((k) => tickets()[k]) : !!tickets()[theatre]);
export function leaveCinema() { if (Object.keys(S.get().cinemaTickets || {}).length) { S.get().cinemaTickets = {}; S.save(); } }

export function payCinema(onChanged, want) {
  const nm = (k) => S.roomInfo(k);
  const box = html`<div class="card stack" style="align-items:center;text-align:center">
      <div style="font-size:44px">🎟️</div>
      <div class="h-title" style="justify-content:center"><span class="zh">买电影票</span> Movie tickets</div>
      <p style="margin:0"><span class="zh">每个影厅${CINEMA_FEE}金币</span><br>Tickets are <b>${CINEMA_FEE} coins</b> for each theatre.<br><small class="help">With a ticket the gate opens for you — and the door only lets you into the theatre on your ticket.</small></p>
      <p class="help" style="margin:0"><span class="zh">你有</span> You have <b class="cn-coins">${S.get().coins}</b> coins</p>
      <div class="stack cn-list" style="width:100%"></div>
      <div class="row" style="justify-content:center"><button type="button" class="btn white" id="cn-close">关闭 Close</button></div>
    </div>`;
  const list = $('.cn-list', box);
  function draw() {
    list.innerHTML = '';
    THEATRES.forEach((k) => {
      const info = nm(k), got = hasTicket(k);
      const b = html`<button type="button" class="btn ${got ? 'white' : 'green'}" ${got || S.get().coins < CINEMA_FEE ? 'disabled' : ''}>${info.icon} <span class="zh">${info.zh}</span> ${info.en} · ${got ? '✅ <span class="zh">已买票</span> Got ticket' : `💳 ${CINEMA_FEE}`}</button>`;
      if (!got) b.onclick = () => {
        if (hasTicket(k) || S.get().coins < CINEMA_FEE) return;
        S.get().coins -= CINEMA_FEE; tickets()[k] = Date.now(); S.save(); sfx.coin();
        toast(`🎟️ <span class="zh">${info.zh}的票买好了！</span> Ticket for ${info.en} — walk through the gate`, { ms: 2800 });
        $('.cn-coins', box).textContent = S.get().coins; onChanged(); draw(); hydrateIcons(list);
      };
      list.append(b);
    });
  }
  $('#cn-close', box).onclick = closeModal;
  draw(); openModal(box); hydrateIcons(box);
}

