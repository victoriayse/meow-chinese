// 🍽️ The 4 Seater Home Dining Table: anyone in the house (the owner or a visiting friend)
// can put food from their bag on it, and anyone can pick it up. Works like the Cafe's tables.
import * as S from './state.js';
import * as Auth from './auth.js';
import { SNACKS, ITEMS } from './pixel.js';
import { rest } from './cloud.js';
import { snackCanvas } from './snacks.js';
import { html, $, openModal, closeModal, toast } from './ui.js';

const rpc = (name, body = {}) => rest('rpc/' + name, { method: 'POST', body: JSON.stringify(body) });
// tables you can share things on: the home dining table (4 spaces) and the children's desk (2 spaces)
const isTable = (id) => ['homedining4', 'schooldesk', 'canteentable', 'buffettable4', 'picnicmat'].includes(String(id).split('#')[0]);
const surfaceOf = (id) => ITEMS[String(id).split('#')[0]].surface;
// where the table is: a friend's / my house, or a public place on the map (the school)
const api = (scope) => scope.k === 'place'
  ? { put: (p) => rpc('put_place_table_item', { p_place: scope.place, p_room: scope.room, p_token: p.id, p_item: p.item, p_table: p.table }),
      list: async () => ((await rpc('place_table_items', { p_place: scope.place })) || []).filter((r) => r.room === scope.room),
      pick: (id) => rpc('pick_place_table_item', { p_id: id }) }
  : { put: (p) => rpc('put_home_table_item', { p_host: scope.host, p_token: p.id, p_item: p.item, p_table: p.table }),
      list: () => rpc('home_table_items', { p_host: scope.host }),
      pick: (id) => rpc('pick_home_table_item', { p_host: scope.host, p_id: id }) };
const picking = new Set();
let dropping = false;

async function finishDrop(onChanged) {
  const st = S.get(), p = st.homePendingDrop;
  if (dropping || !p || p.owner !== (Auth.user() || {}).id) return;
  dropping = true;
  try {
    const r = await api(p.scope || { k: 'home', host: p.host }).put(p);
    if (S.get() !== st) return;
    if (!r || !r.accepted) { S.addSnack(p.item); toast('桌子满了，食物放回包里 · The table is full — food returned to your bag'); }
    else toast('放好了，大家都可以拿 · On the table for anyone to pick up');
    delete st.homePendingDrop; S.save(); onChanged();
  } catch { /* keep the reserved food; the next poll retries with the same request ID */ }
  finally { dropping = false; }
}
function chooseFood(scope, table, onChanged) {
  if (S.get().homePendingDrop) { toast('正在放食物… · Placing your food…'); finishDrop(onChanged); return; }
  const have = S.snacks(), items = Object.keys(have).filter((k) => SNACKS[k] && have[k] > 0 && k !== 'shopbag');
  if (!items.length) return toast('包里没有东西 · Nothing in your bag yet — get food at the Cafe, Cinema or Mall, or tap a textbook or pencil case');
  const box = html`<div class="card stack"><div class="h-title"><span class="zh">放到桌上</span> Put something on the table</div><p class="help">放一份，大家都能拿。<br>Place one item from your bag. Anyone here can pick it up.</p><div class="cafe-food-choices"></div><button class="btn white" id="close-table">取消 Cancel</button></div>`;
  items.forEach((k) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn white';
    b.append(snackCanvas(k, 3), document.createTextNode(`${SNACKS[k].zh} ${SNACKS[k].en} ×${have[k]}`));
    b.onclick = () => {
      closeModal(); const st = S.get();
      if (!(S.snacks()[k] > 0)) return;
      st.snacks[k]--; if (!st.snacks[k]) delete st.snacks[k];
      if (st.holding === k) st.holding = null;
      st.homePendingDrop = { id: crypto.randomUUID(), owner: (Auth.user() || {}).id, scope, item: k, table };
      S.save(); onChanged(); finishDrop(onChanged);
    };
    $('.cafe-food-choices', box).appendChild(b);
  });
  $('#close-table', box).onclick = closeModal; openModal(box);
}

function draw(roomEl, scope, rows, onChanged) {
  roomEl.querySelectorAll('.home-table-food, .home-table-place').forEach((el) => el.remove());
  const tables = [...roomEl.querySelectorAll('.decor')].filter((d) => isTable(d.dataset.id));
  tables.forEach((d) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'table-place home-table-place'; b.textContent = d.dataset.id.startsWith('schooldesk') ? '+ 放东西' : '+ 放食物';
    b.title = 'Place something from your bag'; b.setAttribute('aria-label', '放东西 · Place something on this table');
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.onclick = (e) => { e.stopPropagation(); chooseFood(scope, d.dataset.id, onChanged); };
    d.appendChild(b);
  });
  for (const row of rows || []) {
    const d = tables.find((el) => el.dataset.id === row.furniture), surface = d && surfaceOf(row.furniture);
    if (!d || !SNACKS[row.item] || !surface || surface.x[row.slot] == null) continue;   // a stored table keeps its food until it comes back out
    const b = document.createElement('button'); b.type = 'button'; b.className = 'table-food home-table-food';
    b.title = `拿起 Pick up ${SNACKS[row.item].zh} ${SNACKS[row.item].en}`;
    b.style.left = `${surface.x[row.slot] * 100}%`; b.style.top = `${(Array.isArray(surface.y) ? surface.y[row.slot] : surface.y) * 100}%`;
    b.appendChild(snackCanvas(row.item, 3)); b.disabled = picking.has(row.id);
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.onclick = async (e) => {
      e.stopPropagation(); if (picking.has(row.id)) return; picking.add(row.id); b.disabled = true;
      try { const got = await api(scope).pick(row.id); if (got && SNACKS[got]) { S.addSnack(got); S.get().holding = got; S.save(); toast(`😋 <span class="zh">拿着${SNACKS[got].zh}</span> In your paw — tap ${SNACKS[got].noEat ? 'Put away' : 'Eat'} at the bottom`, { ms: 2200 }); } else toast('已经被拿走了 · Someone already picked it up'); }
      catch { toast('暂时拿不到，请再试一次 · Could not pick up — try again'); }
      finally { picking.delete(row.id); onChanged(); }
    };
    d.appendChild(b);
  }
}

// Call after the room is drawn. Polls while the room is on screen.
export const wireHomeTables = (roomEl, host, onChanged) => host && wireTables(roomEl, { k: 'home', host }, onChanged);
export const wirePlaceTables = (roomEl, place, room, onChanged) => wireTables(roomEl, { k: 'place', place, room }, onChanged);
function wireTables(roomEl, scope, onChanged = () => {}) {
  if (!roomEl || !Auth.session()) return;
  if (![...roomEl.querySelectorAll('.decor')].some((d) => isTable(d.dataset.id))) return;
  let busy = false, last = null;
  const changed = () => { onChanged(); refresh(); };
  async function refresh() {
    if (busy || !roomEl.isConnected) return; busy = true;
    try { await finishDrop(changed); const rows = await api(scope).list(); last = rows || []; }
    catch { /* keep the last food shown */ }
    finally { busy = false; }
    if (roomEl.isConnected && last) draw(roomEl, scope, last, changed);
  }
  draw(roomEl, scope, last || [], changed); refresh();
  const t = setInterval(() => { if (!roomEl.isConnected) return clearInterval(t); if (!document.hidden) refresh(); }, 4000);
}
