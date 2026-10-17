// 🛵 Deliveries: MeowMart (groceries, the same things the Supermarket sells) and MeowFood (meals and drinks).
// Order on the phone's 🛵 Delivery app (or choose "home delivery" at the Supermarket kiosk). Everything arrives in
// 1 minute in the living room at home, in one big bag per service; tap the bag to put everything in her bag.
// Prices are the same for everyone: the admin sets them (✏️ Edit prices), saved online with the public places.
import * as S from './state.js';
import * as Places from './places.js';
import { rest } from './cloud.js';
import { SNACKS, GROCERIES, DELIVERY_FOOD, drawGrid, artGrid } from './pixel.js';
import { snackCanvas } from './snacks.js';
import { html, $, toast, coinI, hydrateIcons, esc } from './ui.js';
import { sfx } from './audio.js';

const rpc = (name, body = {}) => rest('rpc/' + name, { method: 'POST', body: JSON.stringify(body) });
export const DELIVERY_MS = 60 * 1000, HOME_DELIVERY_FEE = 15;
export const SERVICES = {
  mart: { zh: '喵喵超市', en: 'MeowMart', icon: '🛒', menu: GROCERIES, color: '#2c9c3a' },
  food: { zh: '喵喵外卖', en: 'MeowFood', icon: '🍱', menu: DELIVERY_FOOD, color: '#ff7a1a' },
};

// ---------- prices (shared; the admin can change them) ----------
let prices = null, loading = null;
export const priceOf = (k) => Math.max(0, Math.round(prices && prices[k] != null ? prices[k] : (SNACKS[k] && SNACKS[k].price) || 0));
export function loadPrices() {
  if (prices) return Promise.resolve(prices);
  return (loading ||= rpc('get_place', { p_key: 'delivery' }).then((l) => { prices = (l && l.prices) || {}; return prices; }).catch(() => { prices = prices || {}; return prices; }).finally(() => { loading = null; }));
}
export async function savePrices(changes) {
  if (!Places.isAdmin()) throw new Error('not allowed');
  const next = { ...(prices || {}), ...changes };
  const ok = await rpc('put_place', { p_key: 'delivery', p_layout: { rooms: {}, open: [], prices: next } });
  if (ok !== true) throw new Error('save failed');
  prices = next; return prices;
}

// ---------- orders on the way ----------
const list = () => (S.get().deliveries ||= []);
export function schedule(kind, items) {
  if (!items.length) return;
  list().push({ id: crypto.randomUUID(), kind, items: items.slice(0, 40), at: Date.now() + DELIVERY_MS });
  S.save();
}
export const onTheWay = () => list().filter((d) => d.at > Date.now());
export const arrived = (kind) => list().filter((d) => d.kind === kind && d.at <= Date.now());
// tap a bag: every item from that service's arrived orders goes into her bag
export function openBag(kind) {
  const got = arrived(kind); if (!got.length) return 0;
  let n = 0;
  got.forEach((d) => d.items.forEach((k) => { if (SNACKS[k]) { S.addSnack(k); n++; } }));
  S.get().deliveries = list().filter((d) => !(d.kind === kind && d.at <= Date.now()));
  S.save(); return n;
}

// the big delivery bags in the living room (and a little "on the way" note)
const BAG = [
  '....oooooooo....', '...o........o...', '..o..........o..', '..o..........o..', 'oooooooooooooooo', 'offffffffffffffo', 'offffffffffffffo',
  'offffwwwwwwffffo', 'offfwwwwwwwwfffo', 'offfwwwwwwwwfffo', 'offffwwwwwwffffo', 'offffffffffffffo', 'offffffffffffffo', 'offffffffffffffo',
  'offffffffffffffo', 'oFFFFFFFFFFFFFFo', 'oooooooooooooooo'];
export function drawBags(room, roomKey, onChanged) {
  if (!room || roomKey !== 'living') return;
  let t = null, seen = false;
  const paint = () => {
    if (!room.isConnected) { if (seen) clearInterval(t); return; }
    seen = true;
    room.querySelectorAll('.dl-bag, .dl-coming').forEach((el) => el.remove());
    ['mart', 'food'].forEach((kind, i) => {
      const got = arrived(kind); if (!got.length) return;
      const n = got.reduce((t, d) => t + d.items.length, 0), sv = SERVICES[kind];
      const b = html`<button type="button" class="dl-bag" style="left:${62 + i * 16}%" aria-label="${sv.en} delivery"><span class="dl-bag-tag">${sv.icon} ${sv.en} · ${n}</span></button>`;
      const c = document.createElement('canvas');
      drawGrid(c, artGrid(BAG, { o: '#2b2140', f: sv.color, F: '#1f5a24', w: '#ffffff' }), 4); b.prepend(c);
      b.onclick = (e) => { e.stopPropagation(); if (room.classList.contains('arranging')) return; const k = openBag(kind); sfx.coin(); toast(`🛍️ <span class="zh">拿到${k}样东西！</span> ${k} item${k === 1 ? '' : 's'} added to your bag (tap them at the bottom)`, { ms: 2600 }); paint(); onChanged(); };
      room.append(b);
    });
    const coming = onTheWay();
    if (coming.length) {
      const s = Math.max(1, Math.ceil((Math.min(...coming.map((d) => d.at)) - Date.now()) / 1000));
      room.append(html`<div class="dl-coming">🛵 <span class="zh">外卖在路上</span> On the way · ${s}s</div>`);
    }
  };
  paint();
  t = setInterval(paint, 1000);
}

// ---------- the phone app ----------
// mountApp(body, { back }) draws the Delivery app into the phone's screen
export function mountApp(body, { header, go }) {
  header('🛵 外卖 Delivery');
  const v = html`<div class="dl-pick">
      ${Object.entries(SERVICES).map(([k, s]) => `<button type="button" class="dl-svc" data-svc="${k}" style="--c:${s.color}"><span class="ic">${s.icon}</span><b><span class="zh">${s.zh}</span> ${s.en}</b><small>${k === 'mart' ? '<span class="zh">超市的食物和用品</span> Groceries from the supermarket' : '<span class="zh">饭菜和饮料</span> Meals & drinks'}</small></button>`).join('')}
      <p class="ph-tip">⏱ <span class="zh">1分钟送到家里的客厅。</span> Arrives in 1 minute in your living room.</p>
      <div class="dl-way"></div></div>`;
  const way = onTheWay(); if (way.length) $('.dl-way', v).innerHTML = way.map((d) => `🛵 ${SERVICES[d.kind].en} · ${d.items.length} · ${Math.max(1, Math.ceil((d.at - Date.now()) / 1000))}s`).join('<br>');
  v.querySelectorAll('[data-svc]').forEach((b) => { b.onclick = () => go('dlmenu', b.dataset.svc); });
  body.appendChild(v);
}
export function mountMenu(body, kind, { header, back, ask }) {
  const sv = SERVICES[kind];
  header(`${sv.icon} ${sv.en}`);
  const qty = {}; let editing = false;
  const v = html`<div class="dl-menu"><div class="dl-list"></div>
      <div class="dl-foot"><span class="dl-total"></span>${Places.isAdmin() ? '<button type="button" class="ph-btn" id="dl-edit">✏️ Prices</button>' : ''}<button type="button" class="ph-btn green" id="dl-order" disabled>🛵 Order</button></div></div>`;
  const listEl = $('.dl-list', v), go = $('#dl-order', v), ed = $('#dl-edit', v);
  const total = () => sv.menu.reduce((t, k) => t + (qty[k] || 0) * priceOf(k), 0), count = () => sv.menu.reduce((t, k) => t + (qty[k] || 0), 0);
  const draw = () => {
    listEl.innerHTML = '';
    sv.menu.forEach((k) => {
      const sn = SNACKS[k]; if (!sn) return;
      const row = html`<div class="dl-row"><span class="art"></span><span class="nm"><span class="zh">${esc(sn.zh)}</span><small>${esc(sn.en)}</small></span>
          ${editing ? `<input type="number" min="0" max="999" value="${priceOf(k)}" data-k="${k}" aria-label="Price">` : `<span class="pr">${priceOf(k)}${coinI(12)}</span><span class="q"><button type="button" data-q="-1">−</button><b>${qty[k] || 0}</b><button type="button" data-q="1">＋</button></span>`}</div>`;
      $('.art', row).append(snackCanvas(k, 2));
      row.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { qty[k] = Math.max(0, Math.min(9, (qty[k] || 0) + +b.dataset.q)); if (count() > 20) qty[k]--; sfx.click(); draw(); }; });
      listEl.append(row);
    });
    const t = total();
    $('.dl-total', v).innerHTML = editing ? '<small>改好了点 💾 Save</small>' : `${count()} · <b>${t}</b>${coinI(14)} <small>/ ${S.get().coins}</small>`;
    go.disabled = editing || !count() || t > S.get().coins; go.style.display = editing ? 'none' : '';
    if (ed) ed.innerHTML = editing ? '💾 Save' : '✏️ Prices';
    hydrateIcons(v);
  };
  if (ed) ed.onclick = async () => {
    if (!editing) { editing = true; return draw(); }
    const changes = {};
    listEl.querySelectorAll('input[data-k]').forEach((i) => { const n = Math.round(+i.value); if (n >= 0 && n <= 999 && n !== priceOf(i.dataset.k)) changes[i.dataset.k] = n; });
    ed.disabled = true;
    try { if (Object.keys(changes).length) { await savePrices(changes); toast(`💾 ${Object.keys(changes).length} price${Object.keys(changes).length > 1 ? 's' : ''} saved`); } editing = false; }
    catch { toast('Could not save — check your connection'); }
    ed.disabled = false; draw();
  };
  go.onclick = async () => {
    const t = total(), items = sv.menu.flatMap((k) => Array(qty[k] || 0).fill(k));
    if (!items.length) return;
    if (S.get().coins < t) return toast(`金币不够 · You need ${t} coins`);
    if (!(await ask(`下单 ${items.length} 样，共 ${t} 金币？<br>Order ${items.length} item${items.length > 1 ? 's' : ''} for ${t} coins? It arrives at home in 1 minute.`, '🛵 下单 Order'))) return;
    if (S.get().coins < t) return;
    S.get().coins -= t; schedule(kind, items); sfx.coin();
    toast(`🛵 <span class="zh">下单了！1分钟后送到客厅。</span> Ordered — it arrives in your living room in 1 minute.`, { ms: 3000 });
    back();
  };
  body.appendChild(v);
  draw(); loadPrices().then(() => { if (v.isConnected) draw(); });
}
