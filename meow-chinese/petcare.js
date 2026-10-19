// 🐾 v263: feeding pets — the bowls at home (food %, water %), adding food, refilling water, treats,
// the pets' Food / Water bars on the home screen, and the sad news when a pet has died.
import * as S from './state.js';
import { ITEMS, bowlGrid, bowlOf, drawGrid, spriteCanvas, artGrid } from './pixel.js';
import { $, html, esc, toast, openModal, closeModal } from './ui.js';
import { sfx } from './audio.js';

const ICON = { dog: '🐶', rabbit: '🐰', hamster: '🐹', guineapig: '🐾' };
const pct = (v) => Math.round(Math.max(0, Math.min(100, v || 0)));
const hm = (ms) => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };

// redraw every bowl in this room (the puppy's floor bowl and the bowls inside cages) to show what's left
export function paintBowls(root) {
  if (!root) return;
  const cs = [...root.querySelectorAll('.decor[data-id^="petbowl"]')].map((d) => d.querySelector(':scope > canvas')).concat([...root.querySelectorAll('canvas.cage-thing[data-id^="petbowl"]')]);
  cs.forEach((c) => {
    if (!c) return;
    const id = (c.dataset.id || c.parentElement.dataset.id || '').split('#')[0], it = ITEMS[id];
    if (!it || !it.petBowl) return;
    const g = bowlGrid(id, S.bowlFood(it.petBowl), S.bowlWater(it.petBowl));
    drawGrid(c, g, (parseFloat(c.style.width) || c.offsetWidth || g[0].length * 4) / g[0].length);
  });
}

// the two bars for each pet on the home screen (10 sections each, like the kitten's)
let petsOpen = false;
try { petsOpen = localStorage.getItem('meow-pets-open') === '1'; } catch {}
const barsOf = (p) => `
    <div class="pet-head">${ICON[p.kind] || '🐾'} ${esc(p.name)}</div>
    <div class="stat pet-stat"><span style="font-size:19px;text-align:center">🍖</span><span>饱饱 <span class="en">Food</span></span><div class="bar segmented"><i style="width:${pct(p.food)}%;--c:#f59b2a"></i></div></div>
    <div class="stat pet-stat"><span style="font-size:19px;text-align:center">💧</span><span>喝水 <span class="en">Water</span></span><div class="bar segmented"><i style="width:${pct(p.water)}%;--c:#4fb3ef"></i></div></div>`;
// one pet: its bars. More than one: a 🐾 button that opens / closes all their bars (a ⚠️ when one is low)
export function petBarsHtml() {
  S.petCareTick();
  const ps = S.fedPets();
  if (ps.length < 2) return ps.map(barsOf).join('');
  const low = ps.filter((p) => pct(p.food) < S.PET_LOW || pct(p.water) < S.PET_LOW);
  return `<button type="button" class="pet-toggle ${petsOpen ? 'open' : ''}" data-pet-toggle aria-expanded="${petsOpen}">
      <span class="pt-ic">🐾</span><span class="pt-nm">宠物 <span class="en">Pets</span></span>
      <span class="pt-who">${ps.map((p) => `<span class="${low.includes(p) ? 'low' : ''}" title="${esc(p.name)}">${ICON[p.kind] || '🐾'}</span>`).join('')}</span>
      ${low.length ? `<span class="pt-warn">⚠️ ${low.map((p) => esc(p.name)).join(', ')}</span>` : ''}
      <b class="pt-arrow">${petsOpen ? '▲' : '▼'}</b></button>
    ${petsOpen ? ps.map(barsOf).join('') : ''}`;
}
// the 🐾 button opens / closes the pets' bars (remembered on this device)
export function wirePetBars(box) {
  if (!box || box._wired) return; box._wired = true;
  box.addEventListener('click', (e) => {
    if (!e.target.closest('[data-pet-toggle]')) return;
    petsOpen = !petsOpen; try { localStorage.setItem('meow-pets-open', petsOpen ? '1' : '0'); } catch {}
    sfx.click(); box.innerHTML = petBarsHtml();
  });
}

// tap a bowl (or Feed in the pet's menu): see what's left, add food, refill water, give a treat
export function openBowl(kind, { onChange = () => {}, go = null } = {}) {
  const it = ITEMS[kind], p = S.petOf(kind);
  if (!S.ownsBowl(kind)) { toast('🥣 <span class="zh">先去商店买食物和水碗</span> Buy a food & water bowl in the shop first (🐾 Pets → Pet Items)', { ms: 3200 }); return; }
  sfx.click();
  const box = html`<div class="card stack bowl-card" style="align-items:center;text-align:center">
      <div class="h-title" style="justify-content:center"><span class="zh">${ICON[kind]} ${p ? esc(p.name) + '的碗' : ITEMS[bowlOf(kind)].name}</span><span class="en">${p ? `${esc(p.name)}'s bowls` : esc(ITEMS[bowlOf(kind)].en)}</span></div>
      <div class="bowl-view" id="bv"><div class="kibble-drop" id="kd"></div></div>
      <div class="bowl-levels" id="lv"></div>
      <div class="bowl-sec"><div class="bowl-h">🍖 <span class="zh">加食物</span> Add food <small>(每份 +5格 · each serving +5 bars)</small></div><div class="row bowl-foods" id="foods"></div></div>
      <button class="btn blue" id="water">💧 <span class="zh">加满水</span> Refill water (free)</button>
      ${p ? `<p class="help" style="margin:0">🦴 零食：直接点一下${esc(p.name)}就能喂 · Treats: tap ${esc(p.name)} to give one</p>` : ''}
      <div class="row" style="justify-content:center"><button class="btn white" id="shop">🛍️ <span class="zh">买宠物食物</span> Buy pet food</button><button class="btn white" id="bc">关闭 Close</button></div>
    </div>`;
  const draw = () => {
    S.petCareTick();
    const f = pct(S.bowlFood(kind)), w = pct(S.bowlWater(kind)), b = S.bowl(kind), p2 = S.petOf(kind);
    const bv = $('#bv', box); bv.querySelectorAll('canvas').forEach((c) => c.remove());
    const c = document.createElement('canvas'); drawGrid(c, bowlGrid(bowlOf(kind), f, w), 9); bv.appendChild(c);
    const left = b.waterAt && w > 0 ? Math.max(0, b.waterAt + S.BOWL_WATER_HOURS * 3600000 - Date.now()) : 0;
    $('#lv', box).innerHTML = `
      <div class="stat"><span>🍖</span><span>碗里的食物 <span class="en">Food bowl</span></span><div class="bar"><i style="width:${f}%;--c:#f59b2a"></i></div><b class="pctn">${f}%</b></div>
      <div class="stat"><span>💧</span><span>碗里的水 <span class="en">Water bowl</span></span><div class="bar"><i style="width:${w}%;--c:#4fb3ef"></i></div><b class="pctn">${w}%</b></div>
      <p class="help" style="margin:0">${w > 0 ? `💧 还能喝 ${hm(left)} · Water lasts ${hm(left)} more` : '💧 水碗空了！快加水 · The water bowl is empty — refill it!'}${p2 ? `<br>${ICON[kind]} ${esc(p2.name)}: 饱 Food ${pct(p2.food)}% · 水 Water ${pct(p2.water)}%` : ''}</p>`;
    const foods = $('#foods', box), mains = S.petFoods(kind, 'main');
    foods.innerHTML = mains.map((id) => `<button class="food-chip ${S.petFoodLeft(id) ? '' : 'off'}" data-id="${id}" ${S.petFoodLeft(id) && f <= 50 ? '' : 'disabled'}><span class="art"></span><small>${ITEMS[id].name}</small><b>×${S.petFoodLeft(id)}</b></button>`).join('')
      + (f > 50 ? '<p class="help" style="margin:0;width:100%">碗快满了，等它吃一点再加 · The bowl is nearly full — add more once it has eaten some</p>' : '');
    box.querySelectorAll('.food-chip').forEach((ch) => { const a = ch.querySelector('.art'); if (a && !a.firstChild) a.appendChild(spriteCanvas(ch.dataset.id, 34)); });
  };
  const drop = (cls) => {   // 🍖 kibble tumbling into the bowl / 💧 water pouring in
    const kd = $('#kd', box); kd.className = `kibble-drop ${cls}`; void kd.offsetWidth; kd.classList.add('go');
  };
  box.addEventListener('click', (e) => {
    const fc = e.target.closest('[data-id].food-chip');
    if (fc && !fc.disabled) {
      const why = S.fillBowl(kind, fc.dataset.id);
      if (why === 'full') return toast('🥣 <span class="zh">碗快满了</span> The bowl is nearly full');
      if (why) return;
      sfx.coin(); drop('food'); setTimeout(draw, 650); onChange();
      toast(`🍖 <span class="zh">加了一份${ITEMS[fc.dataset.id].name}</span> Food added to the bowl`, { ms: 1800 });
    }
  });
  $('#water', box).onclick = () => { S.refillWater(kind); sfx.coin(); drop('water'); setTimeout(draw, 650); onChange(); toast('💧 <span class="zh">水加满了！</span> Water bowl filled — it lasts 24 hours', { ms: 2000 }); };
  $('#shop', box).onclick = () => { closeModal(); if (go) go('shop', { tab: 'petshop' }); };
  $('#bc', box).onclick = closeModal;
  draw();
  openModal(box);
}

// a pet has died (no food or water for 3 days): tell her once
export function showPetDeaths() {
  const ds = S.unseenPetDeaths(); if (!ds.length) return false;
  const box = html`<div class="card stack" style="align-items:center;text-align:center">
      <div class="h-title" style="justify-content:center"><span class="zh">😢 很难过的消息</span><span class="en">Some sad news</span></div>
      ${ds.map((d) => `<p style="margin:0">${ICON[d.kind] || '🐾'} <b>${esc(d.name)}</b> <span class="zh">因为${d.why === 'water' ? '没有水喝' : '没有东西吃'}，去世了。</span><br><small>${esc(d.name)} has unfortunately died because it had nothing to ${d.why === 'water' ? 'drink' : 'eat'} for more than 3 days.</small></p>`).join('')}
      <p class="help" style="margin:0">记得每天给宠物加食物和水哦。<br>Remember to give your pets food and water every day.</p>
      <button class="btn white" id="ok">知道了 OK</button>
    </div>`;
  $('#ok', box).onclick = closeModal;
  S.seePetDeaths();
  openModal(box);
  return true;
}

// 🦴 treats: only from the pet itself (tap the pet → its card). '' html when it doesn't need feeding
export function treatPickerHtml(kind) {
  if (!S.needsFeeding(kind)) return '';
  const wait = S.treatWait(kind), have = S.petFoods(kind, 'treat').filter((id) => S.petFoodLeft(id));
  return `<div class="bowl-sec treat-sec"><div class="bowl-h">🦴 <span class="zh">喂零食</span> Give a treat <small>(+1格 · 每3小时一次 · 1 every 3 hours)</small></div>
    <div class="row bowl-foods">${have.length ? have.map((id) => `<button class="food-chip treat-chip" data-treat="${id}" ${wait ? 'disabled' : ''}><span class="t-emo">${ITEMS[id].emoji}</span><small>${ITEMS[id].name}</small><b>×${S.petFoodLeft(id)}</b></button>`).join('')
      : '<p class="help" style="margin:0">还没有零食 · No treats yet — buy some in the shop (🐾 Pets → Food)</p>'}
    ${wait && have.length ? `<p class="help" style="margin:0;width:100%">⏳ ${hm(wait)}后才能再吃零食 · Next treat in ${hm(wait)}</p>` : ''}</div></div>`;
}
