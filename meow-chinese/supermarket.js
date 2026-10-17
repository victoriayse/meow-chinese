// 🛒 The mall's Supermarket (L1, left of the Lobby). Order at the kiosk: collect it yourself at the counter (the shop
// assistant brings it out), or have it delivered home (+15 coins, arrives in the living room in 1 minute).
// Groceries are hers to keep — they don't stay behind when she leaves the mall. Prices are the shared MeowMart prices.
import * as S from './state.js';
import { SNACKS, GROCERIES, ITEMS } from './pixel.js';
import { snackCanvas, showCounter } from './snacks.js';
import { html, $, openModal, closeModal, toast, coinI, hydrateIcons, esc } from './ui.js';
import { sfx } from './audio.js';
import * as Delivery from './delivery.js';

export const SUPER_ROOM = 'mallsupermarket';
const base = (id) => String(id).split('#')[0];
const orders = () => (S.get().superOrders ||= []);

function openKiosk(onChanged, show) {
  const qty = {};
  const box = html`<div class="card stack kiosk-card"><div class="h-title">🛒 <span class="zh">超市点单</span> Supermarket order</div>
      <div class="kiosk-list"></div><div class="kiosk-total"></div>
      <div class="row" style="justify-content:flex-end;flex-wrap:wrap"><button type="button" class="btn white" id="sk-close">关闭 Close</button>
        <button type="button" class="btn green" id="sk-self" disabled>🧺 <span class="zh">自己取</span> Self collect</button>
        <button type="button" class="btn yellow" id="sk-home" disabled>🛵 <span class="zh">送到家</span> Home delivery (+${Delivery.HOME_DELIVERY_FEE})</button></div></div>`;
  const list = $('.kiosk-list', box);
  const total = () => GROCERIES.reduce((t, k) => t + (qty[k] || 0) * Delivery.priceOf(k), 0), count = () => GROCERIES.reduce((t, k) => t + (qty[k] || 0), 0);
  const draw = () => {
    list.innerHTML = '';
    GROCERIES.forEach((k) => {
      const sn = SNACKS[k]; if (!sn) return;
      const row = html`<div class="kiosk-row"><span class="art"></span><span class="nm"><span class="zh">${esc(sn.zh)}</span><small>${esc(sn.en)}</small></span>
          <span class="pr">${Delivery.priceOf(k)}${coinI(13)}</span><span class="q"><button type="button" class="qty-btn" data-q="-1">−</button><b>${qty[k] || 0}</b><button type="button" class="qty-btn" data-q="1">＋</button></span></div>`;
      $('.art', row).append(snackCanvas(k, 3));
      row.querySelectorAll('.qty-btn').forEach((b) => { b.onclick = () => { qty[k] = Math.max(0, Math.min(9, (qty[k] || 0) + +b.dataset.q)); if (count() > 20) qty[k]--; sfx.click(); draw(); }; });
      list.append(row);
    });
    const t = total(), c = S.get().coins;
    $('.kiosk-total', box).innerHTML = `<b>${count()}</b> <span class="zh">样</span> items · <b>${t}</b>${coinI(14)} <small>(${c} coins)</small>`;
    $('#sk-self', box).disabled = !count() || t > c;
    $('#sk-home', box).disabled = !count() || t + Delivery.HOME_DELIVERY_FEE > c;
    hydrateIcons(box);
  };
  const items = () => GROCERIES.flatMap((k) => Array(qty[k] || 0).fill(k));
  $('#sk-self', box).onclick = () => {
    const t = total(); if (S.get().coins < t || !count()) return;
    S.get().coins -= t;
    const now = Date.now(); let at = Math.max(now, ...orders().map((o) => o.readyAt));
    items().forEach((k) => orders().push({ id: crypto.randomUUID(), item: k, readyAt: (at = Math.max(now + 2500, at + 1200)) }));
    S.save(); sfx.coin(); closeModal();
    toast('🧺 <span class="zh">付好了！去取货柜台拿。</span> Paid — collect your things at the collection counter.', { ms: 2800 });
    onChanged(); show();
  };
  $('#sk-home', box).onclick = () => {
    const t = total() + Delivery.HOME_DELIVERY_FEE; if (S.get().coins < t || !count()) return;
    S.get().coins -= t; Delivery.schedule('mart', items()); S.save(); sfx.coin(); closeModal();
    toast('🛵 <span class="zh">付好了！1分钟后送到你家客厅。</span> Paid — it arrives in your living room at home in 1 minute.', { ms: 3200 });
    onChanged();
  };
  $('#sk-close', box).onclick = closeModal;
  draw(); openModal(box); Delivery.loadPrices().then(() => { if (box.isConnected) draw(); });
}

export function wireSupermarket(room, { onChanged = () => {} } = {}) {
  room.querySelectorAll('.decor').forEach((d) => { const it = ITEMS[base(d.dataset.id)]; if (it && (it.superKiosk || it.superCounter)) d.classList.add('mall-interactive'); });
  const counter = [...room.querySelectorAll('.decor')].find((d) => (ITEMS[base(d.dataset.id)] || {}).superCounter);
  let sig = '';
  function show() {
    if (!room.isConnected || !counter) return;
    const ready = orders().filter((o) => o.readyAt <= Date.now() && SNACKS[o.item]).slice(0, 2);
    const s = ready.map((o) => o.id).join() + '|' + orders().length; if (s === sig) return; sig = s;
    showCounter({ querySelector: () => counter }, { ready, waiting: orders().length }, (o, button) => {
      const i = orders().findIndex((x) => x.id === o.id); if (i < 0) return;
      button.disabled = true; const [got] = orders().splice(i, 1); S.addSnack(got.item); S.save();
      sfx.coin(); toast(`🛍️ <span class="zh">拿到${SNACKS[got.item].zh}了</span> Put in 🎒 My items → 🛒 MeowMart`, { ms: 1800 });
      onChanged(); show();
    }, 'supermarket');
  }
  room.addEventListener('click', (e) => {
    const d = e.target.closest('.decor'); if (!d || e.target.closest('button') || room.classList.contains('arranging')) return;
    const it = ITEMS[base(d.dataset.id)];
    if (it && it.superKiosk) { sfx.click(); openKiosk(onChanged, show); }
  });
  show();
  const t = setInterval(() => { if (!room.isConnected) return clearInterval(t); show(); }, 1000);
}
