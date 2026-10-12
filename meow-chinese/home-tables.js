// 🍽️ The 4 Seater Home Dining Table: anyone in the house (the owner or a visiting friend)
// can put food from their bag on it, and anyone can pick it up. Works like the Cafe's tables.
import * as S from './state.js';
import * as Auth from './auth.js';
import { SNACKS, ITEMS } from './pixel.js';
import { rest } from './cloud.js';
import { snackCanvas } from './snacks.js';
import { html, $, openModal, closeModal, toast } from './ui.js';

const rpc = (name, body = {}) => rest('rpc/' + name, { method: 'POST', body: JSON.stringify(body) });
const isTable = (id) => String(id).split('#')[0] === 'homedining4';
const picking = new Set();
let dropping = false;

async function finishDrop(onChanged) {
  const st = S.get(), p = st.homePendingDrop;
  if (dropping || !p || p.owner !== (Auth.user() || {}).id) return;
  dropping = true;
  try {
    const r = await rpc('put_home_table_item', { p_host: p.host, p_token: p.id, p_item: p.item, p_table: p.table });
    if (S.get() !== st) return;
    if (!r || !r.accepted) { S.addSnack(p.item); toast('桌子满了，食物放回包里 · The table is full — food returned to your bag'); }
    else toast('放好了，大家都可以拿 · On the table for anyone to pick up');
    delete st.homePendingDrop; S.save(); onChanged();
  } catch { /* keep the reserved food; the next poll retries with the same request ID */ }
  finally { dropping = false; }
}
function chooseFood(host, table, onChanged) {
  if (S.get().homePendingDrop) { toast('正在放食物… · Placing your food…'); finishDrop(onChanged); return; }
  const have = S.snacks(), items = Object.keys(have).filter((k) => SNACKS[k] && have[k] > 0 && k !== 'shopbag');
  if (!items.length) return toast('包里没有食物 · No food in your bag yet — buy some at the Cafe, Cinema or Mall');
  const box = html`<div class="card stack"><div class="h-title"><span class="zh">放到餐桌上</span> Put food on the table</div><p class="help">放一份，大家都能拿。<br>Place one item from your bag. Anyone here can pick it up.</p><div class="cafe-food-choices"></div><button class="btn white" id="close-table">取消 Cancel</button></div>`;
  items.forEach((k) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn white';
    b.append(snackCanvas(k, 3), document.createTextNode(`${SNACKS[k].zh} ${SNACKS[k].en} ×${have[k]}`));
    b.onclick = () => {
      closeModal(); const st = S.get();
      if (!(S.snacks()[k] > 0)) return;
      st.snacks[k]--; if (!st.snacks[k]) delete st.snacks[k];
      if (st.holding === k) st.holding = null;
      st.homePendingDrop = { id: crypto.randomUUID(), owner: (Auth.user() || {}).id, host, item: k, table };
      S.save(); onChanged(); finishDrop(onChanged);
    };
    $('.cafe-food-choices', box).appendChild(b);
  });
  $('#close-table', box).onclick = closeModal; openModal(box);
}

function draw(roomEl, host, rows, onChanged) {
  roomEl.querySelectorAll('.home-table-food, .home-table-place').forEach((el) => el.remove());
  const tables = [...roomEl.querySelectorAll('.decor')].filter((d) => isTable(d.dataset.id));
  tables.forEach((d) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'table-place home-table-place'; b.textContent = '+ 放食物';
    b.title = 'Place food from your bag'; b.setAttribute('aria-label', '放食物 · Place food on this table');
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.onclick = (e) => { e.stopPropagation(); chooseFood(host, d.dataset.id, onChanged); };
    d.appendChild(b);
  });
  for (const row of rows || []) {
    const d = tables.find((el) => el.dataset.id === row.furniture), surface = ITEMS.homedining4.surface;
    if (!d || !SNACKS[row.item]) continue;   // a stored table keeps its food until it comes back out
    const b = document.createElement('button'); b.type = 'button'; b.className = 'table-food home-table-food';
    b.title = `拿起 Pick up ${SNACKS[row.item].zh} ${SNACKS[row.item].en}`;
    b.style.left = `${surface.x[row.slot] * 100}%`; b.style.top = `${surface.y * 100}%`;
    b.appendChild(snackCanvas(row.item, 3)); b.disabled = picking.has(row.id);
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.onclick = async (e) => {
      e.stopPropagation(); if (picking.has(row.id)) return; picking.add(row.id); b.disabled = true;
      try { const got = await rpc('pick_home_table_item', { p_host: host, p_id: row.id }); if (got && SNACKS[got]) { S.addSnack(got); toast(`😋 <span class="zh">拿到${SNACKS[got].zh}了</span> Tap it at the bottom to hold it`, { ms: 2200 }); } else toast('已经被拿走了 · Someone already picked it up'); }
      catch { toast('暂时拿不到，请再试一次 · Could not pick up — try again'); }
      finally { picking.delete(row.id); onChanged(); }
    };
    d.appendChild(b);
  }
}

// Call after the room is drawn. Polls while the room is on screen.
export function wireHomeTables(roomEl, host, onChanged = () => {}) {
  if (!roomEl || !host || !Auth.session()) return;
  if (![...roomEl.querySelectorAll('.decor')].some((d) => isTable(d.dataset.id))) return;
  let busy = false, last = null;
  const changed = () => { onChanged(); refresh(); };
  async function refresh() {
    if (busy || !roomEl.isConnected) return; busy = true;
    try { await finishDrop(changed); const rows = await rpc('home_table_items', { p_host: host }); last = rows || []; }
    catch { /* keep the last food shown */ }
    finally { busy = false; }
    if (roomEl.isConnected && last) draw(roomEl, host, last, changed);
  }
  draw(roomEl, host, last || [], changed); refresh();
  const t = setInterval(() => { if (!roomEl.isConnected) return clearInterval(t); if (!document.hidden) refresh(); }, 4000);
}
