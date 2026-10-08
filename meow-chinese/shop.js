// 喵喵商店 storefront (spend coins) and the wardrobe (dress up / home).
import * as S from './state.js';
import { ITEMS, spriteCanvas, itemEffect, WEAR_SLOTS } from './pixel.js';
import { $, html, esc, coinI, hydrateIcons, KittenView, toast, burst, confirmBox } from './ui.js';
import { sfx } from './audio.js';
import * as Auth from './auth.js';
import { managing } from './cloud.js';

// things she can buy for a friend (not medicine); needs her own logged-in account
const giftable = (it) => ['food', 'toiletry', 'wear', 'decor'].includes(it.cat) && !it.special && Auth.session() && !managing();
const openRooms = () => S.ROOMS.filter((r) => S.roomOpen(r.key)).map((r) => r.key);
const isWear = (slots) => (it) => it.cat === 'wear' && !it.special && slots.includes(it.slot);
export const TABS = [
  { key: 'food', zh: '食物', en: 'Food', icon: '🐟', test: (it) => it.cat === 'food' },
  { key: 'toiletry', zh: '洗护用品', en: 'Toiletries', icon: '🧴', test: (it) => it.cat === 'toiletry' },
  { key: 'head', lock: 'head', zh: '头饰', en: 'Hair', icon: '🎀', test: isWear(['head']) },
  { key: 'body', lock: 'body', zh: '衣服', en: 'Clothes', icon: '👕', test: isWear(['body']) },
  { key: 'feet', lock: 'feet', zh: '鞋子', en: 'Shoes', icon: '👟', test: isWear(['feet']) },
  { key: 'acc', lock: 'acc', zh: '配饰', en: 'Extras', icon: '👓', test: isWear(['face', 'neck']) },
  { key: 'decor', lock: 'decor', zh: '家具', en: 'Home', icon: '🛋️', test: (it) => it.cat === 'decor' },
  { key: 'pharmacy', zh: '药房', en: 'Pharmacy', icon: '💊', test: (it) => it.cat === 'pharmacy', order: 90 },
];
const SLOT_NAME = Object.fromEntries(WEAR_SLOTS.map(([k, zh]) => [k, zh]));
// tab order: everyday things first (food, toiletries), then what she has unlocked (by level), locked ones last
export function orderTabs(tabs) {
  const daily = ['food', 'toiletry'], lv = (t) => t.order ?? (t.lock ? S.UNLOCKS[t.lock] : 0);
  const locked = (t) => t.lock && !S.unlocked(t.lock);
  const rest = tabs.filter((t) => !daily.includes(t.key));
  return [...daily.map((k) => tabs.find((t) => t.key === k)).filter(Boolean),
    ...rest.filter((t) => !locked(t)).sort((a, b) => lv(a) - lv(b)), ...rest.filter(locked).sort((a, b) => lv(a) - lv(b))];
}

export function shopScreen({ go, tab = 'food' }) {
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
      </div>
      <div class="shelves" id="list"></div>
    </div></section>`;
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
    if (def.lock && !S.unlocked(def.lock)) {
      const need = S.UNLOCKS[def.lock], lv = S.level();
      list.innerHTML = `<div class="locked-shelf"><div class="big">🔒</div>
        <div class="h-title" style="justify-content:center"><span class="zh">${def.zh}要到 Lv${need} 才解锁</span></div>
        <p class="help">你现在是 Lv${lv}，还差 ${need - lv} 级。每写对一个词就离升级更近一步！<br>${def.en} unlock at level ${need}. You're level ${lv} — every word you get right helps you level up.</p>
        <div class="bar" style="max-width:320px;margin:0 auto"><i style="width:${Math.min(100, (lv / need) * 100)}%;--c:#6cb6f2"></i></div></div>`;
      return;
    }
    Object.entries(ITEMS).filter(([, it]) => def.test(it)).sort((a, b) => S.price(a[0]) - S.price(b[0])).forEach(([id, it]) => {
      const cost = S.price(id);
      const special = it.cat === 'special';
      const owned = (it.cat === 'wear' || it.cat === 'decor') && s.owned.includes(id);
      const have = it.cat === 'food' || it.cat === 'toiletry' ? s.pantry[id] || 0 : special ? s.streak.freezes || 0 : 0;
      const full = special && have >= S.MAX_FREEZES;
      const pharm = it.cat === 'pharmacy';
      const needed = !pharm || S.health() === it.cures;
      const roomShut = it.cat === 'decor' && it.room && !S.roomOpen(it.room);
      const can = s.coins >= cost && !full && needed && !roomShut;
      const eff = it.cat === 'food' || it.cat === 'toiletry' ? itemEffect(it) : it.toy ? '可以一起玩 Toy'
        : special ? `漏了一天也不会断连胜 · Keeps your streak if you miss a day${full ? ` (max ${S.MAX_FREEZES})` : ''}`
        : pharm ? (needed ? `治好${it.cures === 'cough' ? '咳嗽' : '头晕'}！Cures ${it.cures === 'cough' ? 'a cough' : 'dizziness'}` : `小猫${it.cures === 'cough' ? '咳嗽' : '头晕'}时才需要 · Only when your kitten ${it.cures === 'cough' ? 'coughs' : 'is dizzy'}`)
        : it.cat === 'wear' ? `${SLOT_NAME[it.slot] || ''}`
        : it.cat === 'decor' ? `${S.roomInfo(it.room || 'living').icon} ${S.roomInfo(it.room || 'living').zh} ${S.roomInfo(it.room || 'living').en}${roomShut ? ` · 🔒 Lv${S.UNLOCKS[it.room]}` : ''}` : '';
      const trying = it.cat === 'wear' && tryOn[it.slot] === id && S.get().kitten.equipped[it.slot] !== id;
      const card = html`<div class="product ${trying ? 'sel' : ''} ${owned ? 'is-owned' : ''}">
          ${owned ? '<span class="owned">已有 Owned</span>' : have ? `<span class="count">×${have}</span>` : ''}
          <div class="art"></div>
          <div class="shelf-board"></div>
          <div class="nm">${it.name}</div><div class="nm-en">${it.en}</div>
          ${eff ? `<div class="eff">${eff}</div>` : ''}
          ${owned ? '<span class="tag done">✓ 已买</span>' : `<button class="tag ${can ? '' : 'off'}" ${can ? '' : 'disabled'} data-buy="${id}"><span class="price">${cost}${coinI(16)}</span></button>`}
          ${giftable(it) ? `<button class="gift-tag" data-gift="${id}" ${s.coins >= cost ? '' : 'disabled'} title="Buy as a gift for a friend">🎁 <span class="zh">送朋友</span></button>` : ''}
        </div>`;
      $('.art', card).appendChild(spriteCanvas(id, it.cat === 'decor' ? 76 : 60));
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-buy]')) return askBuy(id);
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
  // always ask first, so nothing is bought by a stray tap
  async function askBuy(id) {
    const it = ITEMS[id], cost = S.price(id), left = S.get().coins - cost;
    sfx.click();
    const asking = confirmBox(`买${esc(it.name)}吗？ Buy ${esc(it.en)}?`,
      `<span class="buy-ask"><span class="art"></span><span><span class="nowrap">${coinI(18)} <b>${cost}</b> 金币 coins</span><br><small>买了以后还剩 ${left} · You'll have ${left} left</small></span></span>`,
      '🛒 买 Buy', '取消 Cancel');
    const art = document.querySelector('#modal .buy-ask .art'); if (art) art.appendChild(spriteCanvas(id, 56));
    hydrateIcons(document.querySelector('#modal'));
    if (await asking) buy(id);
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
      : `📦 <span class="zh">${it.name}放进收纳箱了！</span> In your storage box — place it in your home with 🪑 Move furniture`);
    render();
  }
  $('#tabs', n).onclick = (e) => { const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; render(); } };
  $('#reset', n).onclick = () => { tryOn = { ...S.get().kitten.equipped }; drawKitten(); render(); };
  n._mounted = () => { drawKitten(); render(); };
  n._refresh = () => { const y = window.scrollY; render(); window.scrollTo(0, y); };   // new data arrived: redraw in place, same aisle
  return n;
}

// ---------- 🎒 My items: food, toiletries, toys, clothes and home — one tab per kind, like the shop ----------
const MY_TABS = [
  { key: 'food', zh: '食物', en: 'Food', icon: '🐟', use: 'feed', shop: 'food', test: (it) => it.cat === 'food' },
  { key: 'toiletry', zh: '洗护用品', en: 'Toiletries', icon: '🧴', use: 'groom', shop: 'toiletry', test: (it) => it.cat === 'toiletry' },
  { key: 'toys', lock: 'decor', zh: '玩具', en: 'Toys', icon: '🧶', use: 'play', shop: 'decor', test: (it) => !!it.toy },
  { key: 'head', lock: 'head', zh: '头饰', en: 'Hair', icon: '🎀', shop: 'head', test: (it) => it.cat === 'wear' && it.slot === 'head' },
  { key: 'body', lock: 'body', zh: '衣服', en: 'Clothes', icon: '👕', shop: 'body', test: (it) => it.cat === 'wear' && it.slot === 'body' },
  { key: 'feet', lock: 'feet', zh: '鞋子', en: 'Shoes', icon: '👟', shop: 'feet', test: (it) => it.cat === 'wear' && it.slot === 'feet' },
  { key: 'acc', lock: 'acc', zh: '配饰', en: 'Extras', icon: '👓', shop: 'acc', test: (it) => it.cat === 'wear' && ['face', 'neck'].includes(it.slot) },
  { key: 'decor', lock: 'decor', zh: '家具', en: 'Home', icon: '🛋️', shop: 'decor', test: (it) => it.cat === 'decor' },
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
    $('#my-note', n).innerHTML = def.use === 'feed' ? '点食物喂小猫！<br>Tap food to feed your kitten.'
      : def.use === 'groom' ? '点洗发水或梳子帮小猫洗澡！<br>Tap to bath or brush your kitten.'
      : def.use === 'play' ? '点玩具一起玩！<br>Tap a toy to play together.'
      : def.key === 'decor' ? '点家具放进房间或收进收纳箱。<br>Tap to put it in a room or back in storage.'
      : '点一下穿上或脱下。每类一件。<br>Tap to wear or take off — one of each.';
    const list = $('#list', n);
    list.innerHTML = '';
    if (def.lock && !S.unlocked(def.lock)) {
      const need = S.UNLOCKS[def.lock], lv = S.level();
      list.innerHTML = `<div class="locked-shelf"><div class="big">🔒</div><div class="h-title" style="justify-content:center"><span class="zh">${def.zh}要到 Lv${need} 才解锁</span></div><p class="help">${def.en} unlock at level ${need}. You're level ${lv}.</p></div>`;
      return;
    }
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
      const on = def.key === 'decor' ? !s.decorHidden.includes(id) : it.cat === 'wear' ? s.kitten.equipped[it.slot] === id : false;
      const eff = counted ? itemEffect(it) : def.use === 'play' ? '+6 ❤' : '';
      const action = def.use === 'feed' ? (it.water && !it.hunger ? '💧 喝 Drink' : '🍽️ 喂 Feed') : def.use === 'groom' ? '🛁 用 Use' : def.use === 'play' ? '🎾 玩 Play'
        : def.key === 'decor' ? (on ? '🏠 摆着 In a room' : '📦 收纳中 In storage') : (on ? '✓ 穿着 Wearing' : '穿上 Wear');
      const card = html`<button type="button" class="product ${on ? 'sel' : ''}">
          ${counted ? `<span class="count">×${s.pantry[id]}</span>` : ''}
          <div class="art"></div><div class="shelf-board"></div>
          <div class="nm">${it.name}</div><div class="nm-en">${it.en}</div>
          ${eff ? `<div class="eff">${eff}</div>` : ''}
          <span class="tag ${on ? 'done' : ''}">${action}</span>
          ${def.key === 'decor' && openRooms().length > 1 ? `<span class="room-pick" role="button" tabindex="0" title="Which room it goes in">📍 ${S.roomInfo(S.roomOf(id)).icon} <span class="zh">${S.roomInfo(S.roomOf(id)).zh}</span> ⇄</span>` : ''}
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
      card.onclick = () => {
        sfx.click();
        // eating, bathing and playing happen at home, so she can watch her kitten
        if (def.use) { S.setPendingCare({ kind: def.use, id }); go('home'); return; }
        if (def.key === 'decor') S.toggleDecor(id); else S.toggleWear(id);
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
