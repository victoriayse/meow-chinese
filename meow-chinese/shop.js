// 喵喵商店 storefront (spend coins) and the wardrobe (dress up / home).
import * as S from './state.js';
import { ITEMS, spriteCanvas, itemEffect, WEAR_SLOTS } from './pixel.js';
import { $, html, esc, coinI, hydrateIcons, KittenView, toast, burst } from './ui.js';
import { sfx } from './audio.js';

const isWear = (slots) => (it) => it.cat === 'wear' && slots.includes(it.slot);
const TABS = [
  { key: 'food', zh: '食物', en: 'Food', icon: '🐟', test: (it) => it.cat === 'food' },
  { key: 'head', zh: '头饰', en: 'Hair', icon: '🎀', test: isWear(['head']) },
  { key: 'body', zh: '衣服', en: 'Clothes', icon: '👕', test: isWear(['body']) },
  { key: 'feet', zh: '鞋子', en: 'Shoes', icon: '👟', test: isWear(['feet']) },
  { key: 'acc', zh: '配饰', en: 'Extras', icon: '👓', test: isWear(['face', 'neck']) },
  { key: 'decor', zh: '家具', en: 'Home', icon: '🛋️', test: (it) => it.cat === 'decor' },
  { key: 'special', zh: '道具', en: 'Special', icon: '❄️', test: (it) => it.cat === 'special' },
  { key: 'pharmacy', zh: '药房', en: 'Pharmacy', icon: '💊', test: (it) => it.cat === 'pharmacy' },
];
const SLOT_NAME = Object.fromEntries(WEAR_SLOTS.map(([k, zh]) => [k, zh]));

export function shopScreen({ go, tab = 'food' }) {
  if (tab === 'wear') tab = 'body';
  let preview = null;
  const n = html`<section class="screen"><div class="store">
      <div class="storefront">
        <div class="awning"></div>
        <div class="signboard"><span class="zh">喵喵商店</span><small>MEOW MART</small></div>
        <div class="front-row">
          <div class="shopwindow">
            <div class="window-label">试衣间 · Fitting room</div>
            <div class="stage-mini" id="mini"><div class="fx-layer" id="fx"></div></div>
          </div>
          <div class="counter">
            <div class="wallet">${coinI(26)}<span id="wallet">${S.get().coins}</span><small>你的金币 Your coins</small></div>
            <p class="help" id="pv-note">点衣服、鞋子、头饰可以先试穿！<br>Tap clothes, shoes or hair things to try them on.</p>
            <button class="btn white block" id="home">← <span class="zh">回家</span> Home</button>
          </div>
        </div>
      </div>
      <div class="aisles" id="tabs"></div>
      <div class="shelves" id="list"></div>
    </div></section>`;
  const mini = $('#mini', n);
  mini.style.position = 'relative';
  let kv;
  const drawKitten = () => {
    const eq = { ...S.get().kitten.equipped };
    if (preview && ITEMS[preview].cat === 'wear') eq[ITEMS[preview].slot] = preview;
    if (kv) kv.canvas.remove();
    kv = new KittenView({ scale: 5, equipped: eq });
    kv.setMood(S.mood().face === 'cry' ? 'normal' : S.mood().face);
    mini.appendChild(kv.canvas);
  };

  function render() {
    const s = S.get();
    $('#wallet', n).textContent = s.coins;
    $('#tabs', n).innerHTML = TABS.map((t) => `<button class="aisle ${t.key === tab ? 'on' : ''}" data-tab="${t.key}"><span class="ic">${t.icon}</span><span class="zh">${t.zh}</span><small>${t.en}</small></button>`).join('');
    const def = TABS.find((t) => t.key === tab) || TABS[0];
    const list = $('#list', n);
    list.innerHTML = '';
    Object.entries(ITEMS).filter(([, it]) => def.test(it)).sort((a, b) => S.price(a[0]) - S.price(b[0])).forEach(([id, it]) => {
      const cost = S.price(id);
      const special = it.cat === 'special';
      const owned = (it.cat === 'wear' || it.cat === 'decor') && s.owned.includes(id);
      const have = it.cat === 'food' ? s.pantry[id] || 0 : special ? s.streak.freezes || 0 : 0;
      const full = special && have >= S.MAX_FREEZES;
      const pharm = it.cat === 'pharmacy';
      const needed = !pharm || S.health() === it.cures;
      const can = s.coins >= cost && !full && needed;
      const eff = it.cat === 'food' ? itemEffect(it) : it.toy ? '可以一起玩 Toy'
        : special ? `漏了一天也不会断连胜 · Keeps your streak if you miss a day${full ? ` (max ${S.MAX_FREEZES})` : ''}`
        : pharm ? (needed ? `治好${it.cures === 'cough' ? '咳嗽' : '头晕'}！Cures ${it.cures === 'cough' ? 'a cough' : 'dizziness'}` : `小猫${it.cures === 'cough' ? '咳嗽' : '头晕'}时才需要 · Only when your kitten ${it.cures === 'cough' ? 'coughs' : 'is dizzy'}`)
        : it.cat === 'wear' ? `${SLOT_NAME[it.slot] || ''}` : '';
      const card = html`<div class="product ${preview === id ? 'sel' : ''} ${owned ? 'is-owned' : ''}">
          ${owned ? '<span class="owned">已有 Owned</span>' : have ? `<span class="count">×${have}</span>` : ''}
          <div class="art"></div>
          <div class="shelf-board"></div>
          <div class="nm">${it.name}</div><div class="nm-en">${it.en}</div>
          ${eff ? `<div class="eff">${eff}</div>` : ''}
          ${owned ? '<span class="tag done">✓ 已买</span>' : `<button class="tag ${can ? '' : 'off'}" ${can ? '' : 'disabled'} data-buy="${id}"><span class="price">${cost}${coinI(16)}</span></button>`}
        </div>`;
      $('.art', card).appendChild(spriteCanvas(id, it.cat === 'decor' ? 76 : 60));
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-buy]')) return buy(id);
        if (it.cat === 'wear') { preview = preview === id ? null : id; drawKitten(); render(); }
      });
      list.appendChild(card);
    });
    hydrateIcons(n);
  }
  function buy(id) {
    const it = ITEMS[id];
    if (it.cat === 'pharmacy') {
      if (!S.buy(id)) { toast('金币不够 · Not enough coins'); return; }
      sfx.fanfare(); preview = null; drawKitten(); kv.flash('happy', 1800); kv.jump();
      burst($('#fx', n), 'heart', 4, '50%', '20%');
      toast(`<span class="zh">${esc(S.get().kitten.name)}吃了药，好多了！</span> All better!`, { ms: 3500 });
      render(); return;
    }
    if (!S.buy(id)) { toast(it.cat === 'special' && (S.get().streak.freezes || 0) >= S.MAX_FREEZES ? `最多${S.MAX_FREEZES}张 · You can hold ${S.MAX_FREEZES} at most` : '金币不够 · Not enough coins'); return; }
    sfx.coin();
    preview = null;
    drawKitten();
    kv.flash('happy', 1500); kv.jump();
    burst($('#fx', n), 'heart', 3, '50%', '20%');
    toast(it.cat === 'special' ? `❄️ <span class="zh">有${S.get().streak.freezes}张冰冻卡了！</span> Streak freeze ready`
      : it.cat === 'food' ? `<span class="zh">买了${it.name}！</span> Feed it at home`
      : it.cat === 'wear' ? `<span class="zh">穿上${it.name}！</span>`
      : `<span class="zh">${it.name}放进家里了！</span> Added to your home`);
    render();
  }
  $('#tabs', n).onclick = (e) => { const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; preview = null; drawKitten(); render(); } };
  $('#home', n).onclick = () => go('home');
  n._mounted = () => { drawKitten(); render(); };
  return n;
}

export function wardrobeScreen({ go }) {
  const n = html`<section class="screen"><div class="shop">
      <div class="preview card">
        <div class="h-title" style="font-size:24px"><span class="zh">打扮</span><span class="en">Dress up</span></div>
        <div class="stage-mini" id="mini"></div>
        <p class="help" style="text-align:center;margin:0">每类可以穿一件：头饰、衣服、鞋子…<br>One of each: hair, clothes, shoes…</p>
        <button class="btn white block" id="home">← <span class="zh">回家</span> Home</button>
      </div>
      <div class="stack" id="groups"></div>
    </div></section>`;
  const mini = $('#mini', n);
  let kv;
  function render() {
    const s = S.get();
    if (kv) kv.canvas.remove();
    kv = new KittenView({ scale: 5 }); mini.appendChild(kv.canvas);
    const groups = $('#groups', n);
    groups.innerHTML = '';
    const section = (zh, en, ids, isOn, toggle, empty) => {
      const card = html`<div class="card"><div class="h-title" style="font-size:22px"><span class="zh">${zh}</span><span class="en">${en}</span></div><div class="shop-list"></div></div>`;
      const el = $('.shop-list', card);
      if (!ids.length) el.innerHTML = `<p class="help">${empty}</p>`;
      ids.forEach((id) => {
        const it = ITEMS[id], on = isOn(id);
        const c = html`<button class="item ${on ? 'sel' : ''}">${on ? '<span class="owned">✓</span>' : ''}<div class="art"></div><div class="nm">${it.name}</div><div class="nm-en">${it.en}</div></button>`;
        $('.art', c).appendChild(spriteCanvas(id, 56));
        c.onclick = () => { toggle(id); sfx.click(); render(); kv.flash('happy', 900); };
        el.appendChild(c);
      });
      groups.appendChild(card);
    };
    const ownedWear = (slot) => s.owned.filter((id) => ITEMS[id] && ITEMS[id].cat === 'wear' && ITEMS[id].slot === slot);
    const anyWear = WEAR_SLOTS.some(([slot]) => ownedWear(slot).length);
    WEAR_SLOTS.forEach(([slot, zh, en]) => {
      const ids = ownedWear(slot);
      if (ids.length) section(zh, `${en} — tap to wear / take off`, ids, (id) => s.kitten.equipped[slot] === id, S.toggleWear, '');
    });
    if (!anyWear) section('我的衣柜', 'My wardrobe', [], () => false, () => {}, '还没有衣服，去商店看看吧！ No clothes yet — visit the shop.');
    section('我的家', 'My home — tap to show / hide', s.owned.filter((id) => ITEMS[id] && ITEMS[id].cat === 'decor'), (id) => !s.decorHidden.includes(id), S.toggleDecor, '家里还是空的。 Your home is empty — buy furniture in the shop.');
  }
  $('#home', n).onclick = () => go('home');
  n._mounted = render;
  return n;
}
