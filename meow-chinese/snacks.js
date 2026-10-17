// 🍿 Cinema snacks: order at the self-help kiosk, pick up at the collection counter,
// then hold one in her paw (tap its button at the bottom) and eat it (吃 Eat).
import * as S from './state.js';
import { SNACKS, SNACK_ORDER, CINEMA_SNACK_ORDER, CAFE_SNACK_ORDER, drawGrid, artGrid } from './pixel.js';
import { rest } from './cloud.js';
import { $, html, esc, coinI, toast, openModal, closeModal, hydrateIcons } from './ui.js';
import { sfx } from './audio.js';
import { say } from './house.js';
import { cafeTableList } from './cafe.js';

const rpc = (name, body = {}) => rest('rpc/' + name, { method: 'POST', body: JSON.stringify(body) });
export const priceOf = (kind, prices = {}) => { const v = (prices || {})[kind]; return v != null && v !== '' && Number.isFinite(+v) ? Math.max(0, Math.round(+v)) : SNACKS[kind].price; };
// a drink (more water than food in it) says 喝 Drink instead of 吃 Eat
export const isDrink = (k) => { const s = SNACKS[k] || {}; return (s.water || 0) > (s.hunger || 0); };
export function snackCanvas(kind, scale = 4) { const c = document.createElement('canvas'); c.className = 'snack-art'; drawGrid(c, artGrid(SNACKS[kind].art, SNACKS[kind].pal), scale * (SNACKS[kind].size || 1)); return c; }

// ---------- the buttons at the bottom: tap one to hold it, tap again to put it away; 吃 eats what's held ----------
export function snackBar({ onHold = () => {} } = {}) {
  const bar = document.createElement('div'); bar.className = 'snack-bar';
  const draw = () => {
    const have = S.snacks(), held = S.get().holding;
    bar.innerHTML = '';
    // books / pencil cases put away in her backpack don't sit in the bar (she can still put them on a table)
    SNACK_ORDER.filter((k) => have[k] > 0 && (!SNACKS[k].noEat || held === k || SNACKS[k].grocery)).forEach((k) => {   // (groceries like soap stay in the bar)
      const b = document.createElement('button'); b.type = 'button'; b.className = `snack-btn ${held === k ? 'held' : ''}`; b.title = `${SNACKS[k].zh} ${SNACKS[k].en}`;
      b.appendChild(snackCanvas(k, 3));
      if (have[k] > 1) b.insertAdjacentHTML('beforeend', `<i class="n">${have[k]}</i>`);
      b.onclick = (e) => { e.stopPropagation(); sfx.click(); S.holdSnack(k); onHold(S.get().holding); };
      bar.appendChild(b);
      // a book or pencil case she is holding: put it back in her bag
      if (held === k && SNACKS[k].noEat) {
        const put = document.createElement('button'); put.type = 'button'; put.className = 'snack-eat put-away-held'; put.innerHTML = '🎒 <span class="zh">放进书包</span> Put away';
        put.onclick = (e) => { e.stopPropagation(); sfx.click(); S.holdSnack(null); onHold(null); };
        bar.appendChild(put);
      }
      if (held === k && !SNACKS[k].noEat) {
        const drink = isDrink(k);
        const eat = document.createElement('button'); eat.type = 'button'; eat.className = 'snack-eat'; eat.innerHTML = drink ? '<span class="zh">喝</span> Drink' : '<span class="zh">吃</span> Eat';
        eat.onclick = (e) => {
          e.stopPropagation();
          const got = S.eatSnack(); if (!got) return;
          sfx.coin(); toast(`😋 <span class="zh">${SNACKS[got].zh}真好${isDrink(got) ? '喝' : '吃'}！</span> Yum!`, { ms: 1800 });
          onHold(null);
        };
        bar.appendChild(eat);
      }
    });
    bar.classList.toggle('empty', !bar.children.length);
  };
  draw();
  const off = S.onChange(() => { if (!bar.isConnected) { if (off) off(); return; } draw(); });
  bar.redraw = draw;
  return bar;
}

// ---------- the self-help kiosk: pick snacks, see the total, pay ----------
export function openKiosk({ menuOverride = null, tablesOverride = null, orderFn = null, place = 'cinema', layout = null, service = null, tableNumber = null, prices = {}, admin = false, confirmPay = false, onPaid = () => {}, onPrices = () => {} } = {}) {
  if ((place === 'cafe' || orderFn) && !service) {
    const tables = tablesOverride || cafeTableList(layout || {});
    const choice = html`<div class="card stack"><div class="h-title">取餐方式 · Order type</div>
      <button class="btn green" id="service-pickup">自取 Pick up</button>
      <button class="btn blue" id="service-table" ${tables.length ? '' : 'disabled'}>送到桌上 Table service</button>
      <div id="service-number" class="hidden"><label>桌号 Table number <input id="table-number" type="number" min="1" max="${tables.length}" inputmode="numeric"></label>
      <p class="help">${tables.map((t) => `#${t.number}`).join(' · ')}</p><button class="btn green" id="service-next">继续 Continue</button></div>
      <p class="help">自取：在取餐柜台拿。送餐：礼服猫送到桌上。<br>Pick up at the counter, or let the tuxedo cat deliver to your table. Full tables wait for space. If a table is removed, collect at the counter.</p>
      <button class="btn white" id="service-close">关闭 Close</button></div>`;
    const next = (mode, number) => openKiosk({ menuOverride, tablesOverride, orderFn, place, layout, service: mode, tableNumber: number, prices, admin, confirmPay, onPaid, onPrices });
    $('#service-pickup', choice).onclick = () => next('pickup', null);
    $('#service-table', choice).onclick = () => { $('#service-number', choice).classList.remove('hidden'); $('#table-number', choice).focus(); };
    $('#service-next', choice).onclick = () => {
      const num = Number($('#table-number', choice).value);
      if (!tables.some((t) => t.number === num)) return toast('请输入桌上的号码 · Enter a number shown on a table');
      next('table', num);
    };
    $('#service-close', choice).onclick = closeModal; openModal(choice); return;
  }
  const menu = menuOverride || (place === 'cafe' ? CAFE_SNACK_ORDER : CINEMA_SNACK_ORDER);
  const qty = {};
  const box = html`<div class="card stack kiosk-card">
      <div class="h-title"><span class="zh">🍿 自助点餐</span><span class="en">Order snacks</span></div>
      <div class="kiosk-list"></div>
      <div class="kiosk-total"></div>
      <p class="help" style="margin:0">${service === 'table' ? `礼服猫会送到 <b>${tableNumber} 号桌</b>。` : '付钱以后，去 <b>取餐柜台</b> 拿。'}<br>${service === 'table' ? `Delivery to table #${tableNumber}. The tuxedo cat will bring your food.` : 'After you pay, pick it up at the <b>collection counter</b>.'}</p>
      <div class="row" style="justify-content:flex-end;flex-wrap:wrap">
        ${admin ? '<button class="btn white" id="k-edit">✏️ <span class="zh">改价格</span> Prices</button>' : ''}
        <button class="btn white" id="k-close">关闭 Close</button><button class="btn green" id="k-pay" disabled>💳 <span class="zh">付钱</span> Pay</button></div>
    </div>`;
  const list = $('.kiosk-list', box), totalEl = $('.kiosk-total', box), pay = $('#k-pay', box);
  let editing = false;
  const total = () => menu.reduce((t, k) => t + (qty[k] || 0) * priceOf(k, prices), 0);
  const count = () => menu.reduce((t, k) => t + (qty[k] || 0), 0);
  const draw = () => {
    list.innerHTML = '';
    menu.forEach((k) => {
      const sn = SNACKS[k];
      const row = html`<div class="kiosk-row"><span class="art"></span><span class="nm"><span class="zh">${sn.zh}</span><small>${sn.en}</small></span>
          ${editing ? `<input type="number" min="0" max="999" class="k-price" value="${priceOf(k, prices)}">` : `<span class="pr">${priceOf(k, prices)}${coinI(14)}</span>
          <span class="q"><button type="button" class="qty-btn" data-q="-1">−</button><b>${qty[k] || 0}</b><button type="button" class="qty-btn" data-q="1">＋</button></span>`}</div>`;
      $('.art', row).appendChild(snackCanvas(k, 3));
      row.querySelectorAll('.qty-btn').forEach((b) => { b.onclick = () => { qty[k] = Math.max(0, Math.min(6, (qty[k] || 0) + +b.dataset.q)); if (count() > 12) qty[k]--; sfx.click(); draw(); }; });
      const pin = $('.k-price', row); if (pin) pin.oninput = () => { prices[k] = Math.max(0, Math.min(999, Math.round(+pin.value || 0))); };
      list.appendChild(row);
    });
    const t = total(), coins = S.get().coins;
    totalEl.innerHTML = editing ? '<span class="help">改好了点 ✓ 保存 · Change the prices, then tap ✓ Save</span>'
      : `<span class="zh">合计</span> Total: <b>${t}</b>${coinI(18)} <small>· 你有 You have ${coins}${coinI(14)}</small>${t > coins ? '<br><small class="bad">金币不够 · Not enough coins</small>' : ''}`;
    pay.disabled = editing || !count() || t > coins;
    pay.style.display = editing ? 'none' : '';
    const ed = $('#k-edit', box); if (ed) ed.innerHTML = editing ? '✓ <span class="zh">保存</span> Save' : '✏️ <span class="zh">改价格</span> Prices';
    hydrateIcons(box);
  };
  const ed = $('#k-edit', box);
  if (ed) ed.onclick = () => { if (editing) { onPrices({ ...prices }); toast('✓ <span class="zh">价格改好了</span> Prices saved', { ms: 1500 }); } editing = !editing; draw(); };
  $('#k-close', box).onclick = closeModal;
  pay.onclick = async () => {
    const t = total(), items = menu.flatMap((k) => Array(qty[k] || 0).fill(k));
    if (!items.length || S.get().coins < t) return;
    if (confirmPay && !(await kioskConfirm(box, items, t))) return;
    const payLabel = pay.innerHTML;
    pay.disabled = true; pay.textContent = '…';
    try {
      if (orderFn) await orderFn(items, service, tableNumber);
      else await rpc(service === 'table' && place === 'cafe' ? 'place_cafe_table_order' : place === 'cafe' ? 'place_cafe_order' : 'place_cinema_order', { p_items: items, ...(service === 'table' && place === 'cafe' ? { p_number: tableNumber } : {}) });
      S.get().coins -= t; S.save();
      sfx.coin(); closeModal();
      toast(service === 'table' ? `🧾 Paid ${t} — 送到桌号 Table #${tableNumber}` : `🧾 <span class="zh">点好了！3秒后去取餐柜台拿</span> Paid ${t} — pick it up at the collection counter`, { ms: 3500 });
      onPaid(items);
    } catch (e) { pay.innerHTML = payLabel; toast('点不了，再试一次 · Couldn\'t order — try again'); draw(); }   // put the Pay button back
  };
  draw();
  openModal(box);
}

// a confirm step shown inside the kiosk card, so the basket is kept if she says no
export function kioskConfirm(box, items, total, art = snackCanvas, name = (k) => SNACKS[k]) {
  return new Promise((resolve) => {
    const counts = {}; items.forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
    const panel = html`<div class="kiosk-confirm"><div class="h-title"><span class="zh">确定要买吗？</span><span class="en">Confirm purchase?</span></div>
      <div class="kiosk-confirm-list"></div>
      <p><span class="zh">合计</span> Total: <b>${total}</b>${coinI(18)}</p>
      <div class="row" style="justify-content:flex-end"><button class="btn white" data-a="no">取消 Cancel</button><button class="btn green" data-a="yes">✓ <span class="zh">确定</span> Buy</button></div></div>`;
    Object.entries(counts).forEach(([k, n]) => { const r = document.createElement('div'); r.className = 'kiosk-confirm-row'; r.append(art(k), document.createTextNode(`${name(k).en} × ${n}`)); $('.kiosk-confirm-list', panel).append(r); });
    panel.addEventListener('click', (e) => { const a = e.target.closest('[data-a]'); if (!a) return; e.stopPropagation(); panel.remove(); resolve(a.dataset.a === 'yes'); });
    box.append(panel); hydrateIcons(panel);
  });
}

// ---------- the collection counter: two orders at a time, anyone can pick them up ----------
export async function counterNow(place = 'cinema') { try { return (await rpc(place === 'cafe' ? 'cafe_counter' : 'cinema_counter')) || { ready: [] }; } catch { return null; } }
export async function pickUp(id, place = 'cinema') { try { return await rpc(place === 'cafe' ? 'pick_cafe_order' : 'pick_cinema_order', { p_id: id }); } catch { return null; } }
// draw what's ready onto the counter in this room.
// The tuxedo cat behind it brings each new order out (holds it up, then puts it down), and says thank you when one is picked up.
const seenOrders = new Set();
const lastShown = new Map();
let serving = Promise.resolve();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export function showCounter(roomEl, data, onPick, place = 'cinema') {
  const d = roomEl && roomEl.querySelector('.decor[data-counter]'); if (!d) return;
  const tux = d.tux;
  const ready = ((data && data.ready) || []).slice(0, 2).filter((o) => SNACKS[o.item]);
  const ids = new Set(ready.map((o) => o.id));
  // someone picked one up: thank you!
  if ([...(lastShown.get(place) || [])].some((id) => !ids.has(id)) && tux) { say(tux.wrap, '谢谢！Thank you!'); tux.kv.jump(); }
  lastShown.set(place, ids);
  d.querySelectorAll('.pickup').forEach((x) => x.remove());
  const slots = [0.28, 0.72];
  ready.forEach((o, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pickup'; b.title = `${SNACKS[o.item].zh} ${SNACKS[o.item].en}`;
    b.style.left = `${slots[i] * 100}%`;
    b.appendChild(snackCanvas(o.item, 4));
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.onclick = (e) => { e.stopPropagation(); onPick(o, b); };
    d.appendChild(b);
    const key = `${place}:${o.id}`;
    if (!seenOrders.has(key)) {
      seenOrders.add(key);
      if (tux) {
        // a new order: the waiter brings it out first
        b.classList.add('coming');
        serving = serving.then(async () => {
          if (!b.isConnected) return;
          tux.kv.setHeld(o.item); tux.kv.jump();
          await wait(900);
          tux.kv.setHeld(null);
          b.classList.remove('coming');
          if (Math.random() < 0.6) say(tux.wrap, ['请慢用！Enjoy!', '好了！Here you go!', '来啦！Ready!'][Math.floor(Math.random() * 3)]);
          await wait(250);
        });
      }
    }
  });
  const waiting = Math.max(0, ((data && data.waiting) || 0) - ready.length);
  let w = d.querySelector('.counter-wait');
  if (waiting) { if (!w) { w = document.createElement('i'); w.className = 'counter-wait'; d.appendChild(w); } w.textContent = `+${waiting}`; } else if (w) w.remove();
}
export { esc };
