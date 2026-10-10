// 🍿 Cinema snacks: order at the self-help kiosk, pick up at the collection counter,
// then hold one in her paw (tap its button at the bottom) and eat it (吃 Eat).
import * as S from './state.js';
import { SNACKS, SNACK_ORDER, drawGrid, artGrid } from './pixel.js';
import { rest } from './cloud.js';
import { $, html, esc, coinI, toast, openModal, closeModal, hydrateIcons } from './ui.js';
import { sfx } from './audio.js';

const rpc = (name, body = {}) => rest('rpc/' + name, { method: 'POST', body: JSON.stringify(body) });
export const priceOf = (kind, prices = {}) => { const v = (prices || {})[kind]; return v != null && v !== '' && Number.isFinite(+v) ? Math.max(0, Math.round(+v)) : SNACKS[kind].price; };
export function snackCanvas(kind, scale = 4) { const c = document.createElement('canvas'); c.className = 'snack-art'; drawGrid(c, artGrid(SNACKS[kind].art, SNACKS[kind].pal), scale); return c; }

// ---------- the buttons at the bottom: tap one to hold it, tap again to put it away; 吃 eats what's held ----------
export function snackBar({ onHold = () => {} } = {}) {
  const bar = document.createElement('div'); bar.className = 'snack-bar';
  const draw = () => {
    const have = S.snacks(), held = S.get().holding;
    bar.innerHTML = '';
    SNACK_ORDER.filter((k) => have[k] > 0).forEach((k) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = `snack-btn ${held === k ? 'held' : ''}`; b.title = `${SNACKS[k].zh} ${SNACKS[k].en}`;
      b.appendChild(snackCanvas(k, 3));
      if (have[k] > 1) b.insertAdjacentHTML('beforeend', `<i class="n">${have[k]}</i>`);
      b.onclick = (e) => { e.stopPropagation(); sfx.click(); S.holdSnack(k); onHold(S.get().holding); };
      bar.appendChild(b);
      if (held === k) {
        const eat = document.createElement('button'); eat.type = 'button'; eat.className = 'snack-eat'; eat.innerHTML = '<span class="zh">吃</span> Eat';
        eat.onclick = (e) => {
          e.stopPropagation();
          const got = S.eatSnack(); if (!got) return;
          sfx.coin(); toast(`😋 <span class="zh">${SNACKS[got].zh}真好${SNACKS[got].water ? '喝' : '吃'}！</span> Yum!`, { ms: 1800 });
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
export function openKiosk({ prices = {}, admin = false, onPaid = () => {}, onPrices = () => {} } = {}) {
  const qty = {};
  const box = html`<div class="card stack kiosk-card">
      <div class="h-title"><span class="zh">🍿 自助点餐</span><span class="en">Order snacks</span></div>
      <div class="kiosk-list"></div>
      <div class="kiosk-total"></div>
      <p class="help" style="margin:0">付钱以后，去 <b>取餐柜台</b> 拿。<br>After you pay, pick it up at the <b>collection counter</b>.</p>
      <div class="row" style="justify-content:flex-end;flex-wrap:wrap">
        ${admin ? '<button class="btn white" id="k-edit">✏️ <span class="zh">改价格</span> Prices</button>' : ''}
        <button class="btn white" id="k-close">关闭 Close</button><button class="btn green" id="k-pay" disabled>💳 <span class="zh">付钱</span> Pay</button></div>
    </div>`;
  const list = $('.kiosk-list', box), totalEl = $('.kiosk-total', box), pay = $('#k-pay', box);
  let editing = false;
  const total = () => SNACK_ORDER.reduce((t, k) => t + (qty[k] || 0) * priceOf(k, prices), 0);
  const count = () => SNACK_ORDER.reduce((t, k) => t + (qty[k] || 0), 0);
  const draw = () => {
    list.innerHTML = '';
    SNACK_ORDER.forEach((k) => {
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
    const t = total(), items = SNACK_ORDER.flatMap((k) => Array(qty[k] || 0).fill(k));
    if (!items.length || S.get().coins < t) return;
    pay.disabled = true; pay.textContent = '…';
    try {
      await rpc('place_cinema_order', { p_items: items });
      S.get().coins -= t; S.save();
      sfx.coin(); closeModal();
      toast(`🧾 <span class="zh">点好了！3秒后去取餐柜台拿</span> Paid ${t} — pick it up at the collection counter`, { ms: 3500 });
      onPaid(items);
    } catch (e) { toast('点不了，再试一次 · Couldn\'t order — try again'); draw(); }
  };
  draw();
  openModal(box);
}

// ---------- the collection counter: two orders at a time, anyone can pick them up ----------
export async function counterNow() { try { return (await rpc('cinema_counter')) || { ready: [] }; } catch { return null; } }
export async function pickUp(id) { try { return await rpc('pick_cinema_order', { p_id: id }); } catch { return null; } }
// draw what's ready onto the counter in this room
export function showCounter(roomEl, data, onPick) {
  const d = roomEl && roomEl.querySelector('.decor[data-id^="collectcounter"]'); if (!d) return;
  d.querySelectorAll('.pickup').forEach((x) => x.remove());
  const slots = [0.28, 0.72];
  ((data && data.ready) || []).slice(0, 2).forEach((o, i) => {
    if (!SNACKS[o.item]) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pickup'; b.title = `${SNACKS[o.item].zh} ${SNACKS[o.item].en}`;
    b.style.left = `${slots[i] * 100}%`;
    b.appendChild(snackCanvas(o.item, 4));
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.onclick = (e) => { e.stopPropagation(); onPick(o, b); };
    d.appendChild(b);
  });
  const waiting = Math.max(0, ((data && data.waiting) || 0) - ((data && data.ready) || []).length);
  let w = d.querySelector('.counter-wait');
  if (waiting) { if (!w) { w = document.createElement('i'); w.className = 'counter-wait'; d.appendChild(w); } w.textContent = `+${waiting}`; } else if (w) w.remove();
}
export { esc };
