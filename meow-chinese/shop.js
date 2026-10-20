// 喵喵商店 storefront (spend coins) and the wardrobe (dress up / home).
import * as S from './state.js';
import { ITEMS, SNACKS, SNACK_ORDER, spriteCanvas, itemEffect, WEAR_SLOTS } from './pixel.js';
import { snackCanvas, isDrink } from './snacks.js';
import { $, html, esc, coinI, hydrateIcons, KittenView, toast, burst, confirmBox } from './ui.js';
import { sfx } from './audio.js';
import * as Auth from './auth.js';
import { managing } from './cloud.js';
import * as Sales from './sales.js';
import { isAdmin } from './places.js';

// things she can buy for a friend (not medicine); needs her own logged-in account
const giftable = (it) => ['food', 'toiletry', 'wear', 'decor'].includes(it.cat) && !it.petBowl && !it.special && !it.retired && Auth.session() && !managing();
const openRooms = () => S.ROOMS.filter((r) => S.roomOpen(r.key)).map((r) => r.key);
const isWear = (slots) => (it) => it.cat === 'wear' && !it.special && slots.includes(it.slot);
export const TABS = [
  { key: 'sale', zh: '特卖', en: 'Sale', icon: '🏷️', test: () => false },
  { key: 'food', zh: '食物', en: 'Food', icon: '🐟', test: (it) => it.cat === 'food' },
  { key: 'toiletry', zh: '洗护用品', en: 'Toiletries', icon: '🧴', test: (it) => it.cat === 'toiletry' },
  { key: 'head', lock: 'head', zh: '头饰', en: 'Hair', icon: '🎀', test: isWear(['head']) },
  { key: 'body', lock: 'body', zh: '衣服', en: 'Clothes', icon: '👕', test: isWear(['body', 'skirt']) },
  { key: 'feet', lock: 'feet', zh: '鞋子', en: 'Shoes', icon: '👟', test: isWear(['feet']) },
  { key: 'acc', lock: 'acc', zh: '配饰', en: 'Extras', icon: '👓', test: isWear(['face', 'neck']) },
  { key: 'bags', lock: 'acc', zh: '包包', en: 'Bags', icon: '👜', test: isWear(['bag', 'back']) },
  { key: 'decor', lock: 'decor', zh: '家具', en: 'Home', icon: '🛋️', test: (it) => it.cat === 'decor' && !it.petacc && !it.petBowl && !it.retired && !it.special },
  { key: 'pets', lock: 'decor', zh: '领养宠物', en: 'Adopt a Pet', icon: '🐶', test: (it) => it.cat === 'pet', order: 27 },
  { key: 'petshop', lock: 'decor', zh: '宠物', en: 'Pets', icon: '🐾', test: (it) => it.cat === 'petfood' || !!it.petBowl, order: 27.5 },
  { key: 'petacc', lock: 'decor', zh: '宠物用品', en: 'Pet Accessories', icon: '🦴', test: (it) => (it.petacc || it.cat === 'petacc') && !it.petBowl && !it.retired, order: 28 },
  { key: 'reno', lock: 'decor', zh: '装修', en: 'Renovate', icon: '🎨', test: (it) => it.cat === 'reno', order: 26 },
  { key: 'pharmacy', zh: '药房', en: 'Pharmacy', icon: '💊', test: (it) => it.cat === 'pharmacy', order: 90 },
];
// the furniture aisle's sub-aisles
const DECOR_GROUPS = [
  { key: 'mall', icon: '🛍️', zh: '购物中心', en: 'Shopping Mall' },
  { key: 'all', icon: '✨', zh: '全部', en: 'All' },
  { key: 'living', icon: '🛋️', zh: '客厅', en: 'Living room' },
  { key: 'bedroom', icon: '🛏️', zh: '卧室', en: 'Bedroom' },
  { key: 'kitchen', icon: '🍳', zh: '厨房', en: 'Kitchen' },
  { key: 'toilet', icon: '🚽', zh: '浴室', en: 'Bathroom' },
  { key: 'garden', icon: '🌳', zh: '花园', en: 'Garden' },
  { key: 'playground', icon: '🛝', zh: '游乐场', en: 'Playground' },
  { key: 'pool', icon: '🏊', zh: '泳池天台', en: 'Pool & rooftop' },
  { key: 'studio', icon: '🏋️', zh: '健身房', en: 'Gym & studio' },
  { key: 'lounge', icon: '☕', zh: '休息区', en: 'Lounging area' },
  { key: 'changing', icon: '👗', zh: '更衣室', en: 'Changing room' },
  { key: 'cafe', icon: '☕', zh: '咖啡馆', en: 'Cafe' },
  { key: 'cinema', icon: '🎬', zh: '电影院', en: 'Cinema' },
  { key: 'school', icon: '🏫', zh: '学校', en: 'School' },
  { key: 'carnival', icon: '🎡', zh: '嘉年华', en: 'Carnival' },
  { key: 'food', icon: '🍰', zh: '小吃', en: 'Food & snacks' },
  { key: 'lights', icon: '💡', zh: '灯', en: 'Lights' },
  { key: 'windows', icon: '🪟', zh: '窗帘', en: 'Curtains' },
  { key: 'toys', icon: '🧶', zh: '玩具', en: 'Toys' },
];
// 🐾 the Pets aisle's sub-aisles
const PET_GROUPS = [
  { key: 'food', icon: '🍖', zh: '食物', en: 'Food', test: (it) => it.cat === 'petfood' },
  { key: 'drink', icon: '💧', zh: '饮料', en: 'Drinks', test: () => false },
  { key: 'items', icon: '🥣', zh: '宠物用品', en: 'Pet Items', test: (it) => !!it.petBowl },
];
const PET_ORDER = { dog: 0, rabbit: 1, hamster: 2, guineapig: 3 };
const POOLSIDE = ['bbq', 'lounger', 'umbrella', 'cocktails', 'towels', 'loungesofa', 'loungesofanavy'];
export function decorGroup(it) {
  const id = Object.keys(ITEMS).find((k) => ITEMS[k] === it);
  if (POOLSIDE.includes(id)) return 'pool';
  if (it.group) return it.group;
  if (it.toy) return 'toys';
  if (it.spot === 'curtain') return 'windows';
  if (it.garland || (it.power === 'light' && !it.room)) return 'lights';   // room lamps (bedside table, garden lamp) stay with their room
  return it.room || 'living';
}
const SLOT_NAME = Object.fromEntries(WEAR_SLOTS.map(([k, zh]) => [k, zh]));
// tab order: everyday things first (food, toiletries), then what she has unlocked (by level), locked ones last
export function orderTabs(tabs) {
  const daily = ['sale', 'food', 'meals', 'drinks', 'grocery', 'toiletry'], lv = (t) => t.order ?? (t.lock ? S.UNLOCKS[t.lock] : 0);
  const locked = (t) => t.lock && !S.unlocked(t.lock);
  const rest = tabs.filter((t) => !daily.includes(t.key));
  return [...daily.map((k) => tabs.find((t) => t.key === k)).filter(Boolean),
    ...rest.filter((t) => !locked(t)).sort((a, b) => lv(a) - lv(b)), ...rest.filter(locked).sort((a, b) => lv(a) - lv(b))];
}

export function shopScreen({ go, tab = null }) {
  // 🏷️ the Sale aisle opens first while something is on sale
  if (!tab) tab = Object.keys(ITEMS).some((id) => !id.includes('#') && S.activeSale(id)) ? 'sale' : 'food';
  if (tab === 'wear') tab = 'body';
  // try-on: one item per slot, so hair + clothes + shoes can all be tried together
  let tryOn = { ...S.get().kitten.equipped };
  const tryingSomething = () => Object.keys(tryOn).some((k) => tryOn[k] !== S.get().kitten.equipped[k]);
  // the top (kitten + coins + aisles) stays pinned while the shelves scroll, so try-ons are always in view
  const n = html`<section class="screen"><div class="store compact">
      <div class="store-top">
        <div class="storefront">
          <div class="awning"></div>
          <div class="front-row">
            <div class="shopwindow">
              <div class="stage-mini" id="mini"><div class="fx-layer" id="fx"></div></div>
            </div>
            <div class="counter"><div class="wallet">${coinI(26)}<span id="wallet">${S.get().coins}</span></div>
              <button class="btn white small reset-try hidden" id="reset">↺ <span class="zh">换回</span> Reset</button></div>
          </div>
        </div>
        <div class="aisles" id="tabs"></div>
        <div class="shop-find"><input type="search" id="q" placeholder="🔍 搜索 Search the shop…" autocomplete="off"><div class="subcats" id="subcats"></div><div class="subcats subrooms" id="subrooms"></div></div>
      </div>
      <div class="shelves" id="list"></div>
    </div></section>`;
  let subcat = 'all', subroom = 'all';
  // 🛍️ Shopping Mall / 🎬 Cinema / ☕ Cafe / 🏫 School: a second row of chips, one per room of that place
  const PLACE_GROUPS = ['mall', 'cinema', 'cafe', 'school', 'carnival'];
  const ROOM_ORDER = Object.values(S.PLACE_ROOMS).flat(), order = (k) => (k === 'other' ? 1e3 : ROOM_ORDER.indexOf(k));
  const roomOfItem = (it) => (it.room && S.roomInfo(it.room).key === it.room ? it.room : 'other');
  const mini = $('#mini', n);
  mini.style.position = 'relative';
  let kv;
  const drawKitten = () => {
    if (kv) kv.canvas.remove();
    kv = new KittenView({ scale: 5, equipped: { ...tryOn } });
    $('#reset', n).classList.toggle('hidden', !tryingSomething());
    kv.setMood(S.mood().face === 'cry' ? 'normal' : S.mood().face);
    mini.appendChild(kv.canvas);
  };

  function render() {
    const s = S.get();
    $('#wallet', n).textContent = s.coins;
    $('#tabs', n).innerHTML = orderTabs(TABS).map((t) => {
      const locked = t.lock && !S.unlocked(t.lock);
      return `<button class="aisle ${t.key === tab ? 'on' : ''} ${locked ? 'locked' : ''}" data-tab="${t.key}"><span class="ic">${locked ? '🔒' : t.icon}</span><span class="zh">${t.zh}</span><small>${locked ? `Lv${S.UNLOCKS[t.lock]}` : t.en}</small></button>`;
    }).join('');
    const def = TABS.find((t) => t.key === tab) || TABS[0];
    const list = $('#list', n);
    list.innerHTML = '';
    const query = ($('#q', n).value || '').trim().toLowerCase();
    // furniture aisle: little sub-aisles by room (living room, bedroom, kitchen…)
    if (def.key === 'petshop' && !PET_GROUPS.some((g) => g.key === subcat)) subcat = 'food';
    const subs = !query && def.key === 'decor' ? DECOR_GROUPS.filter((g) => g.key === 'all' || Object.values(ITEMS).some((it) => def.test(it) && decorGroup(it) === g.key)) : !query && def.key === 'petshop' ? PET_GROUPS : [];
    const inGroup = (it) => def.test(it) && decorGroup(it) === subcat;
    const rooms = subs.length && PLACE_GROUPS.includes(subcat) ? [...new Set(Object.values(ITEMS).filter(inGroup).map(roomOfItem))] : [];
    if (rooms.length < 2) subroom = 'all';
    const roomChip = (k) => { const r = k === 'other' ? { icon: '✨', zh: '其他', en: 'Other' } : S.roomInfo(k); return `<button class="subcat room ${k === subroom ? 'on' : ''}" data-room="${k}">${r.icon} <span class="zh">${r.zh}</span> <small>${r.en}</small></button>`; };
    $('#subcats', n).innerHTML = subs.map((g) => `<button class="subcat ${g.key === subcat ? 'on' : ''}" data-sub="${g.key}">${g.icon} <span class="zh">${g.zh}</span> <small>${g.en}</small></button>`).join('');
    $('#subrooms', n).innerHTML = (rooms.length > 1 ? `${[`<button class="subcat room ${subroom === 'all' ? 'on' : ''}" data-room="all">✨ <span class="zh">全部</span> <small>All</small></button>`, ...rooms.sort((a, b) => order(a) - order(b)).map(roomChip)].join('')}` : '');
    if (query) {
      // searching: everything in the shop she can buy (any aisle that's open), matching the Chinese or English name
      const found = Object.entries(ITEMS).filter(([, it]) => TABS.some((t) => t.test(it) && !(t.lock && !S.unlocked(t.lock)))
        && `${it.name} ${it.en}`.toLowerCase().includes(query));
      if (!found.length) { list.innerHTML = `<div class="locked-shelf"><div class="big">🔍</div><p class="help">没找到“${esc(query)}”。<br>Nothing called “${esc(query)}” — try another word.</p></div>`; return; }
      shelf(found.sort((a, b) => S.price(a[0]) - S.price(b[0])));
      return;
    }
    if (def.key === 'sale') { saleAisle(list); return; }
    if (def.lock && !S.unlocked(def.lock)) {
      const need = S.UNLOCKS[def.lock], lv = S.level();
      list.innerHTML = `<div class="locked-shelf"><div class="big">🔒</div>
        <div class="h-title" style="justify-content:center"><span class="zh">${def.zh}要到 Lv${need} 才解锁</span></div>
        <p class="help">你现在是 Lv${lv}，还差 ${need - lv} 级。每写对一个词就离升级更近一步！<br>${def.en} unlock at level ${need}. You're level ${lv} — every word you get right helps you level up.</p>
        <div class="bar" style="max-width:320px;margin:0 auto"><i style="width:${Math.min(100, (lv / need) * 100)}%;--c:#6cb6f2"></i></div></div>`;
      return;
    }
    if (def.key === 'petshop' && subcat === 'drink') {
      list.innerHTML = '<div class="locked-shelf"><div class="big">💧</div><p class="help">水是免费的！在家里点一下宠物的水碗就能加满水。<br>Water is free! At home, tap your pet\'s water bowl to fill it up. A full bowl lasts 24 hours.</p></div>';
      return;
    }
    const petG = def.key === 'petshop' && PET_GROUPS.find((g) => g.key === subcat);
    if (petG) { shelf(Object.entries(ITEMS).filter(([id, it]) => !id.includes('#') && petG.test(it)).sort((a, b) => (PET_ORDER[a[1].pet || a[1].petBowl] - PET_ORDER[b[1].pet || b[1].petBowl]) || (a[1].kind === 'main' ? -1 : 0) - (b[1].kind === 'main' ? -1 : 0))); return; }
    shelf(Object.entries(ITEMS).filter(([, it]) => def.test(it) && (def.key !== 'decor' || subcat === 'all' || decorGroup(it) === subcat && (subroom === 'all' || roomOfItem(it) === subroom))).sort((a, b) => S.price(a[0]) - S.price(b[0])));
  }
  function shelf(entries) {
    const s = S.get(), list = $('#list', n);
    entries.forEach(([id, it]) => {
      const cost = S.price(id);
      const special = it.cat === 'special';
      const isPet = it.cat === 'pet', adopted = isPet && S.petOf(id);
      const needCage = isPet && it.cage && !S.ownsCage(id);
      const needBowl = isPet && !needCage && S.needsFeeding(id) && !S.ownsBowl(id);
      const owned = (it.cat === 'wear' || it.cat === 'reno' || it.cat === 'petacc') && s.owned.includes(id) || !!adopted || (it.petBowl && S.ownsBowl(it.petBowl));
      const have = it.cat === 'petfood' ? S.petFoodLeft(id) : it.cat === 'food' || it.cat === 'toiletry' ? s.pantry[id] || 0 : special ? s.streak.freezes || 0 : it.cat === 'decor' ? S.ownedCount(id) : 0;
      const full = special && have >= S.MAX_FREEZES;
      const pharm = it.cat === 'pharmacy';
      const needed = !pharm || S.health() === it.cures;
      const roomShut = it.cat === 'decor' && it.room && !S.roomInfo(it.room).place && !S.roomOpen(it.room);   // cinema things: anyone may buy them (they go home)
      const onlyOne = it.one && S.ownedCount(id) >= 1;   // e.g. the collection counter
      const can = s.coins >= cost && !full && needed && !roomShut && !needCage && !needBowl && !onlyOne;
      const cageOf = (k) => ({ hamster: '🐹 仓鼠 hamster', guineapig: '🐾 豚鼠 guinea pig', parrot: '🐦 玄凤鹦鹉 cockatiel' }[k] || k);
      const petNm = (k) => ({ dog: '🐶 狗狗 Dog', rabbit: '🐰 兔兔 Bunny', hamster: '🐹 仓鼠 Hamster', guineapig: '🐾 豚鼠 Guinea pig' }[k] || k);
      const eff = isPet ? (adopted ? `💕 ${esc(adopted.name)}` : needCage ? '要先买笼子 · Buy its cage first (🦴 Pet Accessories)' : needBowl ? '要先买食物和水碗 · Buy its food & water bowl first (🐾 Pets → Pet Items)' : it.hops ? '在家里蹦蹦跳 · Hops around the house' : it.roam ? '在家里到处跑 · Roams around the house' : '住在笼子里 · Lives in its cage')
        : it.cat === 'petfood' ? `${petNm(it.pet)} · ${it.kind === 'main' ? `${it.servings}份 servings · 每份 +5格 Food` : `${it.servings}次 treats · 每次 +1格 (每3小时一次 1 per 3h)`}`
        : it.petBowl ? `${petNm(it.petBowl)} · ${it.cat === 'decor' ? '放在家里 Goes in your home' : '放在笼子里 Goes in its cage'} · 领养前要先买 Needed before adopting`
        : it.cat === 'petacc' ? `放在笼子里 · Goes in the cage: ${(it.cageFor || []).map(cageOf).join(' / ')}`
        : it.cage ? `${cageOf(it.cage)} 的家 · A home for a ${{ hamster: 'hamster', guineapig: 'guinea pig', parrot: 'cockatiel' }[it.cage]}`
        : it.cat === 'food' || it.cat === 'toiletry' ? itemEffect(it) : it.toy ? '可以一起玩 Toy'
        : special ? `漏了一天也不会断连胜 · Keeps your streak if you miss a day${full ? ` (max ${S.MAX_FREEZES})` : ''}`
        : pharm ? (needed ? `治好${it.cures === 'cough' ? '咳嗽' : '头晕'}！Cures ${it.cures === 'cough' ? 'a cough' : 'dizziness'}` : `小猫${it.cures === 'cough' ? '咳嗽' : '头晕'}时才需要 · Only when your kitten ${it.cures === 'cough' ? 'coughs' : 'is dizzy'}`)
        : it.cat === 'wear' ? `${SLOT_NAME[it.slot] || ''}`
        : it.cat === 'reno' ? (it.kind === 'wall' ? '🧱 墙纸 Wallpaper' : it.kind === 'pool' ? '🏊 在家里游泳！Swim at home' : '🟫 地板 Floor')
        : it.cat === 'decor' ? (() => { const g = DECOR_GROUPS.find((x) => x.key === decorGroup(it)) || DECOR_GROUPS[1]; return `${g.icon} ${g.zh} ${g.en}${roomShut ? ` · 🔒 Lv${S.UNLOCKS[it.room]}` : ''}${it.one ? ' · 只能买一个 Only one' : ''}`; })() : '';
      const trying = it.cat === 'wear' && tryOn[it.slot] === id && S.get().kitten.equipped[it.slot] !== id;
      const sale = S.activeSale(id), was = S.basePrice(id);
      const card = html`<div class="product ${trying ? 'sel' : ''} ${owned ? 'is-owned' : ''} ${sale ? 'on-sale' : ''}">
          ${sale ? `<span class="sale-badge"><b>${sale.pct}%</b>OFF</span>` : ''}
          ${owned ? `<span class="owned">${isPet ? '已领养 Adopted' : '已有 Owned'}</span>` : have ? `<span class="count">×${have}</span>` : ''}
          <div class="art"></div>
          <div class="shelf-board"></div>
          <div class="nm">${it.name}</div><div class="nm-en">${it.en}</div>
          ${eff ? `<div class="eff">${eff}</div>` : ''}
          ${owned ? `<span class="tag done">✓ ${isPet ? '我的 Mine' : '已买'}</span>` : `<button class="tag ${can ? '' : 'off'}" ${can ? '' : 'disabled'} data-buy="${id}">${isPet ? '<span class="zh">领养</span> ' : ''}<span class="price">${sale ? `<s>${was}</s> ` : ''}${cost}${coinI(16)}</span></button>`}
          ${sale && !owned ? `<div class="sale-left">⏳ <span data-ends="${sale.end}">${Sales.left(sale.end - Date.now())}</span></div>` : ''}
          ${giftable(it) ? `<button class="gift-tag" data-gift="${id}" ${s.coins >= cost ? '' : 'disabled'} title="Buy as a gift for a friend">🎁 <span class="zh">送朋友</span></button>` : ''}
        </div>`;
      $('.art', card).appendChild(spriteCanvas(id, it.petBowl ? 110 : it.cat === 'decor' || isPet ? 76 : 60));
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-buy]')) return isPet ? adopt(id) : askBuy(id);
        if (e.target.closest('[data-gift]')) return import('./friends.js').then((F) => F.giftFromShop(id, render));
        if (it.cat === 'wear') {
          const eq = S.get().kitten.equipped;
          tryOn[it.slot] = tryOn[it.slot] === id ? (eq[it.slot] === id ? null : eq[it.slot]) : id;
          drawKitten(); render();
        }
      });
      list.appendChild(card);
    });
    hydrateIcons(n);
  }
  // ---------- 🏷️ the Sale aisle: what's on sale now (with a countdown), and the admin's sale settings ----------
  function saleAisle(list) {
    const now = Date.now(), sales = S.allSales();
    const items = [...new Set(sales.filter((r) => now >= r.start && now < r.end).map((r) => r.item))].filter((id) => ITEMS[id]);
    const soonest = Math.min(...items.map((id) => S.activeSale(id).end));
    const next = sales.filter((r) => r.start > now && ITEMS[r.item]).sort((a, b) => a.start - b.start)[0];
    list.appendChild(html`<div class="sale-banner"><span class="sb-tag">🏷️ <span class="zh">限时特卖</span> SALE</span>
        ${items.length ? `<span class="sb-time">⏳ <span class="zh">还剩</span> Ends in <b data-ends="${soonest}">${Sales.left(soonest - now)}</b></span>` : `<span class="sb-time">${next ? `<span class="zh">下一个特卖</span> Next sale in <b data-ends="${next.start}">${Sales.left(next.start - now)}</b>` : '<span class="zh">现在没有特卖</span> No sale right now — check back soon!'}</span>`}</div>`);
    if (items.length) shelf(items.map((id) => [id, ITEMS[id]]).sort((a, b) => S.price(a[0]) - S.price(b[0])));
    if (isAdmin()) list.appendChild(saleAdmin());
  }
  const toInput = (ms) => { const d = new Date(ms), p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const buyable = () => Object.entries(ITEMS).filter(([id, it]) => !id.includes('#') && it.price > 0 && !it.retired && !it.special && TABS.some((t) => t.key !== 'sale' && t.test(it)));
  function saleAdmin() {
    const now = Date.now(), sales = S.allSales().slice().sort((a, b) => a.start - b.start);
    const status = (r) => (now < r.start ? ['sched', '⏰ 预定 Scheduled'] : now < r.end ? ['live', '🔴 进行中 On now'] : ['done', '已结束 Ended']);
    const box = html`<div class="card stack sale-admin">
        <div class="h-title"><span class="zh">🛠️ 特卖设置</span><span class="en">Sale settings (admin only)</span></div>
        <div class="sa-form">
          <label class="field sa-item"><span>商品 Item</span><input id="sa-item" list="sa-items" placeholder="Type to search… e.g. Sofa" autocomplete="off"><datalist id="sa-items">${buyable().map(([id, it]) => `<option value="${esc(it.en)} · ${esc(it.name)} [${id}]"></option>`).join('')}</datalist></label>
          <label class="field sa-pct"><span>折扣 % off</span><input id="sa-pct" type="number" min="1" max="90" value="20" inputmode="numeric"></label>
          <label class="field"><span>开始 Starts</span><input id="sa-start" type="datetime-local" value="${toInput(now)}"></label>
          <label class="field"><span>结束 Ends</span><input id="sa-end" type="datetime-local" value="${toInput(now + 7 * 864e5)}"></label>
          <div class="sa-dur"><small>时长 Length:</small>${[1, 3, 7, 14].map((d) => `<button type="button" class="btn white small" data-dur="${d}">${d} 天 days</button>`).join('')}</div>
          <button type="button" class="btn green" id="sa-add">➕ <span class="zh">加入特卖</span> Add sale</button>
        </div>
        <div class="sa-list">${sales.length ? sales.map((r) => { const [cls, lbl] = status(r), it = ITEMS[r.item];
          return `<div class="sa-row ${cls}" data-id="${r.id}"><span class="sa-art" data-art="${it ? r.item : ''}"></span>
            <span class="sa-nm"><b class="zh">${it ? it.name : esc(r.item)}</b><small>${it ? esc(it.en) : 'unknown item'} · ${lbl}</small></span>
            <span class="sa-pp"><input type="number" class="sa-p" min="1" max="90" value="${r.pct}" aria-label="% off"><small>%</small></span>
            <input type="datetime-local" class="sa-s" value="${toInput(r.start)}" aria-label="Starts">
            <input type="datetime-local" class="sa-e" value="${toInput(r.end)}" aria-label="Ends">
            <span class="sa-btns"><button type="button" class="btn white small" data-save title="Save">💾</button><button type="button" class="btn white small" data-del title="Remove">🗑</button></span></div>`; }).join('')
          : '<p class="help" style="margin:0">还没有特卖。 No sales set up yet.</p>'}</div>
        <p class="help" style="margin:0">特卖对所有人都一样；到了开始时间自动开始，结束时间自动结束。<br>Sales are the same for everyone. They start and end by themselves at the times you set (shown in your time zone).</p>
      </div>`;
    box.querySelectorAll('[data-art]').forEach((a) => { if (a.dataset.art) a.appendChild(spriteCanvas(a.dataset.art, 34)); });
    box.querySelectorAll('[data-dur]').forEach((b) => { b.onclick = () => { const st = Date.parse($('#sa-start', box).value) || Date.now(); $('#sa-end', box).value = toInput(st + +b.dataset.dur * 864e5); sfx.click(); }; });
    const read = (pctEl, sEl, eEl) => {
      const pct = Math.round(+pctEl.value), start = Date.parse(sEl.value), end = Date.parse(eEl.value);
      if (!(pct >= 1 && pct <= 90)) { toast('折扣要在 1–90% 之间 · % off must be 1 to 90'); return null; }
      if (!start || !end || end <= start) { toast('结束时间要在开始之后 · The end must be after the start'); return null; }
      return { pct, start, end };
    };
    $('#sa-add', box).onclick = async () => {
      const m = /\[([^\]]+)\]\s*$/.exec($('#sa-item', box).value.trim()), id = m && m[1];
      if (!id || !ITEMS[id]) return toast('从列表里选一个商品 · Pick an item from the list');
      const v = read($('#sa-pct', box), $('#sa-start', box), $('#sa-end', box)); if (!v) return;
      try { await Sales.addSale({ item: id, ...v }); sfx.coin(); toast(`🏷️ ${esc(ITEMS[id].en)} · ${v.pct}% off`); render(); }
      catch (e) { toast('没保存成功 · Could not save the sale'); console.warn(e); }
    };
    box.querySelectorAll('.sa-row').forEach((row) => {
      $('[data-save]', row).onclick = async () => {
        const v = read($('.sa-p', row), $('.sa-s', row), $('.sa-e', row)); if (!v) return;
        try { await Sales.updateSale(row.dataset.id, v); sfx.click(); toast('💾 Saved'); render(); } catch (e) { toast('没保存成功 · Could not save'); }
      };
      $('[data-del]', row).onclick = async () => {
        if (!(await confirmBox('删除这个特卖？ Remove this sale?', 'The item goes back to its normal price.', '删除 Remove', '取消 Cancel'))) return;
        try { await Sales.removeSale(row.dataset.id); render(); } catch (e) { toast('没删除成功 · Could not remove'); }
      };
    });
    return box;
  }
  // countdowns tick every second; when a sale starts or ends, the shelves are redrawn with the new prices
  const tick = setInterval(() => {
    if (!n.isConnected) { clearInterval(tick); return; }
    let flip = false;
    n.querySelectorAll('[data-ends]').forEach((el) => { const ms = +el.dataset.ends - Date.now(); el.textContent = Sales.left(ms); if (ms <= 0) flip = true; });
    if (flip && !n.querySelector('.sale-admin input:focus')) render();
  }, 1000);
  // new sales arrived from the server: redraw (unless the admin is in the middle of typing one)
  const unSales = Sales.onSales(() => { if (!n.isConnected) { unSales(); return; } if (!n.querySelector('.sale-admin input:focus')) { const y = window.scrollY; render(); window.scrollTo(0, y); } });

  // always ask first, so nothing is bought by a stray tap
  async function askBuy(id) {
    const it = ITEMS[id], cost = S.price(id), coins = S.get().coins;
    // furniture, food and toiletries can be bought several at once
    const multi = ['decor', 'food', 'toiletry', 'petfood'].includes(it.cat) && !it.one, most = multi ? Math.max(1, Math.min(20, Math.floor(coins / cost))) : 1;
    let qty = 1;
    sfx.click();
    const asking = confirmBox(`买${esc(it.name)}吗？ Buy ${esc(it.en)}?`,
      `<span class="buy-ask"><span class="art"></span><span><span class="nowrap">${coinI(18)} <b id="bq-total">${cost}</b> 金币 coins</span><br><small id="bq-left">买了以后还剩 ${coins - cost} · You'll have ${coins - cost} left</small></span></span>
       ${multi && most > 1 ? `<span class="qty-row"><span class="zh">数量</span> How many: <button type="button" class="qty-btn" data-q="-1" aria-label="Fewer">−</button><b id="bq-n">1</b><button type="button" class="qty-btn" data-q="1" aria-label="More">＋</button><small>(${cost}${coinI(14)} 每个 each)</small></span>` : ''}`,
      '🛒 买 Buy', '取消 Cancel');
    const modal = document.querySelector('#modal');
    const art = modal.querySelector('.buy-ask .art'); if (art) art.appendChild(spriteCanvas(id, 56));
    modal.querySelectorAll('.qty-btn').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        qty = Math.max(1, Math.min(most, qty + +b.dataset.q)); sfx.click();
        const total = cost * qty;
        modal.querySelector('#bq-n').textContent = qty;
        modal.querySelector('#bq-total').textContent = total;
        modal.querySelector('#bq-left').textContent = `买了以后还剩 ${coins - total} · You'll have ${coins - total} left`;
      };
    });
    hydrateIcons(modal);
    if (!(await asking)) return;
    if (qty === 1) return buy(id);
    let got = 0;
    for (let i = 0; i < qty; i++) { if (!S.buy(id)) break; got++; }
    if (!got) { toast('金币不够 · Not enough coins'); return; }
    sfx.coin(); drawKitten(); kv.flash('happy', 1500); kv.jump(); burst($('#fx', n), 'heart', 4, '50%', '20%');
    toast(it.cat === 'petfood' ? `🐾 <span class="zh">买了${got}包${it.name}！</span> ${got} × ${esc(it.en)} — tap the pet's bowl at home to feed it`
      : it.cat === 'decor' ? `📦 <span class="zh">买了${got}个${it.name}！</span> ${got} × ${esc(it.en)} in your storage box — place them with 🪑 Move furniture`
      : `<span class="zh">买了${got}个${it.name}！</span> ${got} × ${esc(it.en)} — find them in 🎒 My items`, { ms: 3500 });
    render();
  }
  // adopting a pet: say yes, then give it a name
  async function adopt(id) {
    const it = ITEMS[id], cost = S.price(id), left = S.get().coins - cost;
    sfx.click();
    const asking = confirmBox(`领养${esc(it.name)}吗？ Adopt a ${esc(it.en.toLowerCase())}?`,
      `<span class="buy-ask"><span class="art"></span><span><span class="nowrap">${coinI(18)} <b>${cost}</b> 金币 coins</span><br><small>领养以后还剩 ${left} · You'll have ${left} left</small></span></span>`,
      '🐾 领养 Adopt', '取消 Cancel');
    const art = document.querySelector('#modal .buy-ask .art'); if (art) art.appendChild(spriteCanvas(id, 56));
    hydrateIcons(document.querySelector('#modal'));
    if (!(await asking)) return;
    const A = await import('./app.js');
    const name = await A.askPetName(id, '');
    if (!name) return;
    if (!S.adoptPet(id, name)) { toast('金币不够 · Not enough coins'); return; }
    sfx.fanfare(); kv.flash('happy', 1800); kv.jump(); burst($('#fx', n), 'heart', 5, '50%', '20%');
    toast(`🏠 <span class="zh">${esc(name)}来到你家了！</span> ${it.stayIn ? 'It\'s in its bird cage at home' : it.cage ? 'It\'s in its cage — tap the cage at home to open the door' : 'Go home to see it run around'}`, { ms: 4500 });
    import('./pets.js').then((P) => P.refreshPets());
    render();
  }
  function buy(id) {
    const it = ITEMS[id];
    if (it.cat === 'pharmacy') {
      if (!S.buy(id)) { toast('金币不够 · Not enough coins'); return; }
      sfx.fanfare(); drawKitten(); kv.flash('happy', 1800); kv.jump();
      burst($('#fx', n), 'heart', 4, '50%', '20%');
      toast(`<span class="zh">${esc(S.get().kitten.name)}吃了药，好多了！</span> All better!`, { ms: 3500 });
      render(); return;
    }
    if (!S.buy(id)) { toast(it.cat === 'special' && (S.get().streak.freezes || 0) >= S.MAX_FREEZES ? `最多${S.MAX_FREEZES}张 · You can hold ${S.MAX_FREEZES} at most` : '金币不够 · Not enough coins'); return; }
    sfx.coin();
    if (it.cat === 'wear') tryOn[it.slot] = id;   // keep trying on the rest
    drawKitten();
    kv.flash('happy', 1500); kv.jump();
    burst($('#fx', n), 'heart', 3, '50%', '20%');
    toast(it.cat === 'special' ? `❄️ <span class="zh">有${S.get().streak.freezes}张冰冻卡了！</span> Streak freeze ready`
      : it.cat === 'food' || it.cat === 'toiletry' ? `<span class="zh">买了${it.name}！</span> Find it in 🎒 My items`
      : it.cat === 'wear' ? `<span class="zh">穿上${it.name}！</span>`
      : it.cat === 'reno' ? `🎨 <span class="zh">买了${it.name}！</span> At home tap 🪑 then 🎨 to use it`
      : it.cat === 'petfood' ? `🐾 <span class="zh">买了${it.name}！</span> Tap your pet's bowl at home to feed it`
      : it.petBowl ? `🥣 <span class="zh">${it.name}${it.cat === 'decor' ? '放在客厅了' : '放进笼子里了'}！</span> ${it.cat === 'decor' ? 'It\'s in your living room' : 'It\'s in the cage'} — it comes full of water`
      : it.cat === 'petacc' ? `🐾 <span class="zh">${it.name}放进笼子里了！</span> It's in the cage now`
      : `📦 <span class="zh">${it.name}放进收纳箱了！</span> In your storage box — place it in your home with 🪑 Move furniture`);
    render();
  }
  $('#tabs', n).onclick = (e) => { const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; subcat = 'all'; subroom = 'all'; $('#q', n).value = ''; render(); } };
  $('#subrooms', n).onclick = (e) => { const r = e.target.closest('[data-room]'); if (r) { subroom = r.dataset.room; sfx.click(); render(); } };
  $('#subcats', n).onclick = (e) => { const b = e.target.closest('[data-sub]'); if (b) { subcat = b.dataset.sub; subroom = 'all'; sfx.click(); render(); } };
  $('#q', n).addEventListener('input', () => render());
  $('#reset', n).onclick = () => { tryOn = { ...S.get().kitten.equipped }; drawKitten(); render(); };
  n._mounted = () => { drawKitten(); render(); Sales.loadSales(); };
  n._refresh = () => { const y = window.scrollY; render(); window.scrollTo(0, y); };   // new data arrived: redraw in place, same aisle
  return n;
}

// ---------- 🎒 My items: food, toiletries, toys, clothes and home — one tab per kind, like the shop ----------
const MY_TABS = [
  { key: 'food', zh: '猫粮', en: 'Kitten food', icon: '🐟', use: 'feed', shop: 'food', test: (it) => it.cat === 'food' },
  // v226: groceries and deliveries she has kept (Supermarket / MeowMart / MeowFood / the coffee machine)
  { key: 'meals', zh: '食物', en: 'Food', icon: '🍱', snack: 'food', shop: 'food' },
  { key: 'drinks', zh: '饮料', en: 'Drinks', icon: '🥤', snack: 'drink', shop: 'food' },
  { key: 'grocery', zh: '超市', en: 'MeowMart', icon: '🛒', snack: 'grocery', shop: 'food' },
  { key: 'toiletry', zh: '洗护用品', en: 'Toiletries', icon: '🧴', use: 'groom', shop: 'toiletry', test: (it) => it.cat === 'toiletry' },
  { key: 'toys', lock: 'decor', zh: '玩具', en: 'Toys', icon: '🧶', use: 'play', shop: 'decor', test: (it) => !!it.toy },
  { key: 'head', lock: 'head', zh: '头饰', en: 'Hair', icon: '🎀', shop: 'head', test: (it) => it.cat === 'wear' && it.slot === 'head' },
  { key: 'body', lock: 'body', zh: '衣服', en: 'Clothes', icon: '👕', shop: 'body', test: (it) => it.cat === 'wear' && (it.slot === 'body' || it.slot === 'skirt') },
  { key: 'feet', lock: 'feet', zh: '鞋子', en: 'Shoes', icon: '👟', shop: 'feet', test: (it) => it.cat === 'wear' && it.slot === 'feet' },
  { key: 'acc', lock: 'acc', zh: '配饰', en: 'Extras', icon: '👓', shop: 'acc', test: (it) => it.cat === 'wear' && ['face', 'neck'].includes(it.slot) },
  { key: 'bags', lock: 'acc', zh: '包包', en: 'Bags', icon: '👜', shop: 'bags', test: (it) => it.cat === 'wear' && ['bag', 'back'].includes(it.slot) },
  { key: 'decor', lock: 'decor', zh: '家具', en: 'Home', icon: '🛋️', shop: 'decor', test: (it) => it.cat === 'decor' && !it.petacc && !it.retired },
  { key: 'petacc', lock: 'decor', zh: '宠物用品', en: 'Pet things', icon: '🦴', shop: 'petacc', test: (it) => it.cat === 'petacc' || !!it.petacc, order: 28 },
  { key: 'reno', lock: 'decor', zh: '装修', en: 'Renovate', icon: '🎨', shop: 'reno', test: (it) => it.cat === 'reno', order: 26 },
];
export function wardrobeScreen({ go, tab }) {
  const tabs = orderTabs(MY_TABS);
  if (!tab || !tabs.some((t) => t.key === tab)) tab = tabs[0].key;
  const n = html`<section class="screen"><div class="store mine">
      <div class="storefront">
        <div class="signboard"><span class="zh">🎒 我的物品</span><small>MY ITEMS</small></div>
        <div class="front-row">
          <div class="shopwindow"><div class="stage-mini" id="mini"></div></div>
          <div class="counter">
            <p class="help" id="my-note"></p>
            <button class="btn blue block" id="to-shop">🛍️ <span class="zh">去商店</span> Shop</button>
            <button class="btn white block" id="home">← <span class="zh">回家</span> Home</button>
          </div>
        </div>
      </div>
      <div class="aisles" id="tabs"></div>
      <div class="shelves" id="list"></div>
    </div></section>`;
  const mini = $('#mini', n);
  let kv;
  const drawKitten = () => { if (kv) kv.canvas.remove(); kv = new KittenView({ scale: 5 }); kv.setMood(S.mood().face === 'cry' ? 'normal' : S.mood().face); mini.appendChild(kv.canvas); };
  function render() {
    const s = S.get();
    drawKitten();
    $('#tabs', n).innerHTML = tabs.map((t) => {
      const locked = t.lock && !S.unlocked(t.lock);
      return `<button class="aisle ${t.key === tab ? 'on' : ''} ${locked ? 'locked' : ''}" data-tab="${t.key}"><span class="ic">${locked ? '🔒' : t.icon}</span><span class="zh">${t.zh}</span><small>${locked ? `Lv${S.UNLOCKS[t.lock]}` : t.en}</small></button>`;
    }).join('');
    const def = tabs.find((t) => t.key === tab);
    $('#my-note', n).innerHTML = def.snack === 'food' ? '外卖送来的饭菜。点一下就吃！<br>Meals from MeowFood and more — tap to eat.'
      : def.snack === 'drink' ? '外卖送来的饮料和你做的咖啡。点一下就喝！<br>Drinks from MeowFood and your coffee machine — tap to drink.'
      : def.snack === 'grocery' ? '超市和喵喵超市买的东西。吃、喝或者拿着！<br>Things from the Supermarket and MeowMart — eat, drink or hold them.'
      : def.use === 'feed' ? '点食物喂小猫！<br>Tap food to feed your kitten.'
      : def.use === 'groom' ? '点洗发水或梳子帮小猫洗澡！<br>Tap to bath or brush your kitten.'
      : def.use === 'play' ? '点玩具一起玩！<br>Tap a toy to play together.'
      : def.key === 'decor' ? '点家具放进房间或收进收纳箱。点 💰 卖回商店。<br>Tap to put it in a room or in storage · 💰 sells it back.'
      : def.key === 'petacc' ? '点一下放进笼子或拿出来。<br>Tap to put it in the cage or take it out.'
      : def.key === 'reno' ? '你买的墙纸和地板。点 💰 卖回商店。<br>Your wallpapers and floors · 💰 sells one back.'
      : '点一下穿上或脱下。每类一件。<br>Tap to wear or take off — one of each.';
    const list = $('#list', n);
    list.innerHTML = '';
    if (def.lock && !S.unlocked(def.lock)) {
      const need = S.UNLOCKS[def.lock], lv = S.level();
      list.innerHTML = `<div class="locked-shelf"><div class="big">🔒</div><div class="h-title" style="justify-content:center"><span class="zh">${def.zh}要到 Lv${need} 才解锁</span></div><p class="help">${def.en} unlock at level ${need}. You're level ${lv}.</p></div>`;
      return;
    }
    if (def.snack) return renderKept(def, list);
    const counted = def.use === 'feed' || def.use === 'groom';
    const ids = counted ? Object.keys(s.pantry).filter((id) => s.pantry[id] > 0 && ITEMS[id] && def.test(ITEMS[id]))
      : s.owned.filter((id) => ITEMS[id] && def.test(ITEMS[id]));
    if (!ids.length) {
      list.innerHTML = `<div class="locked-shelf"><div class="big">${def.icon}</div><p class="help">还没有${def.zh}。去商店看看吧！<br>No ${def.en.toLowerCase()} yet — visit the shop.</p><button class="btn blue" id="empty-shop">🛍️ <span class="zh">去商店</span> Shop</button></div>`;
      $('#empty-shop', list).onclick = () => go('shop', { tab: def.shop });
      return;
    }
    ids.forEach((id) => {
      const it = ITEMS[id];
      const cageThing = it.cat === 'petacc', placeable = it.cat === 'decor';
      const on = cageThing ? S.inCage(id) : placeable ? !s.decorHidden.includes(id) : it.cat === 'wear' ? s.kitten.equipped[it.slot] === id : false;
      const sellable = !counted && !it.special && s.owned.includes(id);
      const eff = counted ? itemEffect(it) : def.use === 'play' ? '+6 ❤' : '';
      const action = def.use === 'feed' ? (it.water && !it.hunger ? '💧 喝 Drink' : '🍽️ 喂 Feed') : def.use === 'groom' ? '🛁 用 Use' : def.use === 'play' ? '🎾 玩 Play'
        : cageThing ? (on ? '✓ 笼子里 In cage' : '📦 拿出来 Out')
        : placeable ? (on ? '🏠 摆着 In a room' : '📦 收纳中 In storage')
        : it.cat === 'reno' ? '🎨 装修用 For renovating' : (on ? '✓ 穿着 Wearing' : '穿上 Wear');
      const card = html`<button type="button" class="product ${on ? 'sel' : ''}">
          ${counted ? `<span class="count">×${s.pantry[id]}</span>` : ''}
          <div class="art"></div><div class="shelf-board"></div>
          <div class="nm">${it.name}${id.includes('#') ? ` ${id.split('#')[1]}` : ''}</div><div class="nm-en">${it.en}</div>
          ${eff ? `<div class="eff">${eff}</div>` : ''}
          <span class="tag ${on ? 'done' : ''}">${action}</span>
          ${sellable ? `<span class="sell-tag" role="button" tabindex="0" title="Sell it back to the shop">💰 <span class="zh">卖</span> +${S.sellPrice(id)}${coinI(13)}</span>` : ''}
          ${placeable && openRooms().length > 1 ? `<span class="room-pick" role="button" tabindex="0" title="Which room it goes in">📍 ${S.roomInfo(S.roomOf(id)).icon} <span class="zh">${S.roomInfo(S.roomOf(id)).zh}</span> ⇄</span>` : ''}
        </button>`;
      $('.art', card).appendChild(spriteCanvas(id, it.cat === 'decor' ? 76 : 60));
      const rp = $('.room-pick', card);
      if (rp) rp.onclick = (e) => {      // move it to the next open room
        e.stopPropagation();
        const rooms = openRooms(), i = rooms.indexOf(S.roomOf(id)), to = rooms[(i + 1) % rooms.length];
        S.setDecorRoom(id, to); sfx.click();
        toast(`${it.name} → ${S.roomInfo(to).icon} <span class="zh">${S.roomInfo(to).zh}</span> ${S.roomInfo(to).en}`);
        render();
      };
      const sell = $('.sell-tag', card);
      if (sell) sell.onclick = async (e) => {     // sell it back for 30% of the price
        e.stopPropagation(); sfx.click();
        const got = S.sellPrice(id);
        const asking = confirmBox(`卖掉${esc(it.name)}吗？ Sell ${esc(it.en)}?`,
          `<span class="buy-ask"><span class="art"></span><span>商店会给你 <b>${got}</b> ${coinI(16)}<br><small>That's 30% of the price. It will be gone from your things.</small></span></span>`, '💰 卖 Sell', '取消 Cancel');
        const art = document.querySelector('#modal .buy-ask .art'); if (art) art.appendChild(spriteCanvas(id, 56));
        hydrateIcons(document.querySelector('#modal'));
        if (!(await asking)) return;
        const n = S.sellItem(id);
        if (n) { sfx.coin(); toast(`💰 <span class="zh">卖掉${it.name}</span> +${n} coins`); import('./pets.js').then((P) => P.refreshPets()).catch(() => {}); }
        render();
      };
      card.onclick = () => {
        sfx.click();
        if (cageThing) { S.toggleCageThing(id); render(); kv.flash('happy', 900); return; }
        if (it.cat === 'reno') { toast('🎨 <span class="zh">在家里点 🪑 再点 🎨 来装修</span> At home tap 🪑 then 🎨 to use it'); return; }
        // eating, bathing and playing happen at home, so she can watch her kitten
        if (def.use) { S.setPendingCare({ kind: def.use, id }); go('home'); return; }
        if (placeable) S.toggleDecor(id); else S.toggleWear(id);
        render(); kv.flash('happy', 900);
      };
      list.appendChild(card);
    });
    hydrateIcons(n);
  }
  // 🍱 / 🥤 the groceries and deliveries she kept: tap food or a drink to have it now; other things (soap, tissues…) she can hold
  function renderKept(def, list) {
    const have = S.snacks(), held = S.get().holding;
    const kept = (k) => { const sn = SNACKS[k]; return sn && have[k] > 0 && (sn.keep || sn.grocery || sn.delivery); };
    const ks = SNACK_ORDER.filter((k, i, a) => a.indexOf(k) === i && kept(k) && (def.snack === 'grocery' ? !!SNACKS[k].grocery : !SNACKS[k].grocery && !SNACKS[k].noEat && (def.snack === 'drink') === isDrink(k)))
      .sort((a, b) => (SNACKS[a].noEat ? 1 : 0) - (SNACKS[b].noEat ? 1 : 0));
    if (!ks.length) {
      list.innerHTML = `<div class="locked-shelf"><div class="big">${def.icon}</div><p class="help">还没有${def.zh}。去超市买，或者用手机点外卖吧！<br>No ${def.en.toLowerCase()} yet — shop at the Supermarket or order on the phone's 🛵 Delivery app.</p></div>`;
      return;
    }
    ks.forEach((k) => {
      const sn = SNACKS[k], drink = isDrink(k), on = held === k;
      const eff = sn.noEat ? '' : [sn.hunger ? `+${sn.hunger} 🍗` : '', sn.water ? `+${sn.water} 💧` : '', sn.happy ? `+${sn.happy} ❤` : ''].filter(Boolean).join(' ');
      const action = sn.noEat ? (on ? '✋ 放下 Put away' : '✋ 拿着 Hold') : drink ? '💧 喝 Drink' : '🍽️ 吃 Eat';
      const card = html`<button type="button" class="product ${on ? 'sel' : ''}"><span class="count">×${have[k]}</span>
          <div class="art"></div><div class="shelf-board"></div>
          <div class="nm">${esc(sn.zh)}</div><div class="nm-en">${esc(sn.en)}</div>
          ${eff ? `<div class="eff">${eff}</div>` : ''}<span class="tag ${on && sn.noEat ? 'done' : ''}">${action}</span>
          ${sn.noEat ? '' : `<span class="sell-tag hold-tag" role="button" tabindex="0" title="Hold it in her paw">✋ <span class="zh">${on ? '放下' : '拿着'}</span> ${on ? 'Put away' : 'Hold'}</span>`}</button>`;
      $('.art', card).appendChild(snackCanvas(k, 5));
      const hold = $('.hold-tag', card);
      if (hold) hold.onclick = (e) => { e.stopPropagation(); sfx.click(); S.holdSnack(on ? null : k); render(); kv.flash('happy', 600); toast(on ? '🎒 <span class="zh">放回书包了</span> Put back in your bag' : `✋ <span class="zh">拿着${esc(sn.zh)}</span> Holding it — eat it any time from the bar at the bottom`, { ms: 2000 }); };
      card.onclick = () => {
        sfx.click();
        if (sn.noEat) { S.holdSnack(on ? null : k); render(); return; }
        if (S.get().holding !== k) S.holdSnack(k);
        const got = S.eatSnack(); if (!got) return render();
        sfx.coin(); toast(`😋 <span class="zh">${esc(sn.zh)}真好${drink ? '喝' : '吃'}！</span> Yum!`, { ms: 1800 });
        render(); kv.flash('happy', 900);
      };
      list.appendChild(card);
    });
    hydrateIcons(n);
  }
  $('#tabs', n).onclick = (e) => { const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; render(); } };
  $('#home', n).onclick = () => go('home');
  $('#to-shop', n).onclick = () => go('shop', { tab: tabs.find((t) => t.key === tab).shop });
  n._mounted = render;
  n._refresh = () => { const y = window.scrollY; render(); window.scrollTo(0, y); };
  return n;
}
