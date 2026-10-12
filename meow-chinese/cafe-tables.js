// Edible food on cafe tables is shared; decorative pastries remain owner-controlled furniture.
import * as S from './state.js';
import * as Auth from './auth.js';
import { SNACKS, ITEMS } from './pixel.js';
import { rest } from './cloud.js';
import { snackCanvas } from './snacks.js';
import { html, $, openModal, closeModal, toast, KittenView } from './ui.js';

import { cafeTableList } from './cafe.js';
import { say } from './house.js';

const rpc = (name, body = {}) => rest('rpc/' + name, { method: 'POST', body: JSON.stringify(body) });
let dropping = false;
const picking = new Set();
export async function tableItems() { try { return await rpc('cafe_service_tables_now') || []; } catch { return null; } }

// Reserve one snack locally before sending it. A persisted request ID makes retrying safe after a disconnect.
export async function finishDrop(onChanged = () => {}) {
  const st = S.get(), p = st.cafePendingDrop;
  if (dropping || !p || p.owner !== (Auth.user() || {}).id) return;
  dropping = true;
  try {
    const result = await rpc('put_cafe_table_item', { p_token: p.id, p_item: p.item, p_room: p.room, p_table: p.table });
    if (S.get() !== st) return;
    if (!result.accepted) {
      st.snacks = st.snacks || {}; st.snacks[p.item] = (st.snacks[p.item] || 0) + 1;
      toast('桌子满了或被移动了，食物已放回包里 · Table full or moved — food returned to your bag');
    } else toast('放好了，大家都可以拿 · On the table for anyone to pick up');
    delete st.cafePendingDrop; S.save(); onChanged();
  } catch { /* Keep the reserved snack and request ID; reconnecting safely retries it. */ }
  finally { dropping = false; }
}
function putOnTable(item, room, table, onChanged) {
  const st = S.get();
  if (st.cafePendingDrop) { finishDrop(onChanged); return; }
  if (!(S.snacks()[item] > 0)) return;
  st.cafePendingDrop = { id: crypto.randomUUID(), owner: (Auth.user() || {}).id, item, room, table };
  st.snacks[item]--; if (!st.snacks[item]) delete st.snacks[item];
  if (st.holding === item) st.holding = null;
  S.save(); onChanged(); finishDrop(onChanged);
}
function chooseFood(room, table, onChanged) {
  if (S.get().cafePendingDrop) { toast('正在放置食物，联网后会继续 · Placing your food — it will continue when connected'); finishDrop(onChanged); return; }
  const items = Object.keys(S.snacks()).filter((k) => SNACKS[k] && S.snacks()[k] > 0);
  if (!items.length) return toast('先在点餐机买食物并取餐 · Order and collect some food first');
  const box = html`<div class="card stack"><div class="h-title"><span class="zh">放到桌上</span> Share on this table</div><p class="help">放一份，任何人都能拿。<br>Place one item from your bag. Anyone can pick it up.</p><div class="cafe-food-choices"></div><button class="btn white" id="close-table">取消 Cancel</button></div>`;
  items.forEach((k) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn white';
    b.append(snackCanvas(k, 3), document.createTextNode(`${SNACKS[k].zh} ${SNACKS[k].en} ×${S.snacks()[k]}`));
    b.onclick = () => { closeModal(); putOnTable(k, room, table, onChanged); };
    $('.cafe-food-choices', box).appendChild(b);
  });
  $('#close-table', box).onclick = closeModal; openModal(box);
}
export function showTableItems(roomEl, roomKey, rows, layout, onChanged) {
  const pending = S.get().cafePendingDrop;
  let status = roomEl.parentElement.querySelector('.cafe-transfer');
  if (pending) {
    if (!status) { status = document.createElement('div'); status.className = 'cafe-transfer'; status.setAttribute('role', 'status'); roomEl.parentElement.appendChild(status); }
    status.textContent = '正在放食物，联网后会继续 · Placing food; reconnect to finish';
  } else if (status) status.remove();
  const numbers = new Map(cafeTableList(layout).map((t) => [t.id, t.number]));
  roomEl.querySelectorAll('.table-food, .table-place, .cafe-loose-food, .cafe-table-number').forEach((el) => el.remove());
  roomEl.querySelectorAll('.decor').forEach((d) => {
    const surface = ITEMS[d.dataset.id] && ITEMS[d.dataset.id].surface;
    if (!surface || !['cafetable2', 'cafetable4'].includes(d.dataset.id.split('#')[0])) return;
    const label = document.createElement('span'); label.className = 'cafe-table-number'; label.textContent = '#' + numbers.get(d.dataset.id); d.appendChild(label);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'table-place'; b.textContent = '+ 放食物'; b.setAttribute('aria-label', '放食物 · Place food on this table'); b.title = 'Place food or drink from your bag';
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.onclick = (e) => { e.stopPropagation(); chooseFood(roomKey, d.dataset.id, onChanged); };
    d.appendChild(b);
  });
  const furniture = new Set(Object.values(layout.rooms).flat().map((e) => e.id));
  for (const row of rows) {
    if (!SNACKS[row.item]) continue;
    const d = [...roomEl.querySelectorAll('.decor')].find((el) => el.dataset.id === row.furniture);
    const surface = d && ITEMS[row.furniture] && ITEMS[row.furniture].surface;
    let parent = d;
    if (!surface) {
      if (furniture.has(row.furniture) || row.room !== roomKey) continue;
      // Removing a table never destroys food that visitors left on it.
      parent = roomEl.querySelector('.cafe-loose-food');
      if (!parent) { parent = document.createElement('div'); parent.className = 'cafe-loose-food'; parent.title = 'Food from a stored table'; roomEl.appendChild(parent); }
    }
    const b = document.createElement('button'); b.type = 'button'; b.className = 'table-food'; b.title = `拿起 Pick up ${SNACKS[row.item].zh} ${SNACKS[row.item].en}`;
    if (surface) { b.style.left = `${surface.x[row.slot] * 100}%`; b.style.top = `${surface.y * 100}%`; }
    b.appendChild(snackCanvas(row.item, 3)); b.disabled = picking.has(row.id);
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.onclick = async (e) => {
      e.stopPropagation(); if (picking.has(row.id)) return; picking.add(row.id); b.disabled = true;
      try { const got = await rpc('pick_cafe_table_item', { p_id: row.id }); if (got && SNACKS[got]) S.addSnack(got); else toast('已经被拿走了 · Someone already picked it up'); }
      catch { toast('暂时拿不到，请再试一次 · Could not pick up — try again'); }
      finally { picking.delete(row.id); onChanged(); }
    };
    parent.appendChild(b);
    if (surface && row.deliveredAt && Date.now() - Date.parse(row.deliveredAt) < 12000 && !served.has(row.id)) {
      served.add(row.id); deliverCat(roomEl, d, b, row.item);
    }
  }
}

// A delivery uses the same tuxedo outfit as the collection-counter waiter.
const served = new Set();
export function deliverCat(room, table, food, item, staff = {}) {
  const waiter = document.createElement('div'); waiter.className = 'cafe-waiter kitten-wrap';
  const cat = new KittenView({ scale: 4, fur: staff.fur || 'white', equipped: { body: 'tuxedo', neck: 'bowtie' } });
  cat.setMood('happy'); cat.setHeld(item); waiter.appendChild(cat.canvas); room.appendChild(waiter);
  const x = table.offsetLeft + table.offsetWidth / 2 - waiter.offsetWidth / 2;
  const dining = room.dataset.room === 'cafedining1' || room.dataset.room === 'cafedining2';
  const y = table.offsetTop + table.offsetHeight * (dining ? 0.12 : 0.45) - waiter.offsetHeight;
  waiter.style.left = x + 'px'; waiter.style.top = y + 'px';
  food.style.visibility = 'hidden';
  const fromLeft = room.dataset.room === 'cafedining2';
  cat.setFacing(!fromLeft);
  const startX = dining ? (fromLeft ? -waiter.offsetWidth : room.clientWidth) : room.clientWidth / 2;
  const startY = dining ? y : room.clientHeight;
  const arrival = waiter.animate([{ transform: `translate(${startX - x}px, ${startY - y}px)` }, { transform: 'translate(0, 0)' }], { duration: 3000, easing: 'linear', fill: 'forwards' });
  arrival.finished.then(() => {
    food.style.visibility = ''; cat.setHeld(null); say(waiter, 'Enjoy!');
    const departure = waiter.animate([{ transform: 'translate(0, 0)' }, { transform: `translate(${startX - x}px, ${startY - y}px)` }], { duration: 3000, delay: 2000, easing: 'linear', fill: 'forwards' });
    setTimeout(() => { if (waiter.isConnected) cat.setFacing(fromLeft); }, 2000);
    departure.finished.then(() => waiter.remove()).catch(() => waiter.remove());
  }).catch(() => { food.style.visibility = ''; waiter.remove(); });
}
