// Shop (spend coins) and wardrobe (dress up / garden).
import * as S from './state.js';
import { ITEMS, spriteCanvas, itemEffect } from './pixel.js';
import { $, html, esc, coinI, hydrateIcons, KittenView, toast, burst } from './ui.js';
import { sfx } from './audio.js';

const TABS = [
  { key: 'food', zh: '食物', en: 'Food' },
  { key: 'wear', zh: '衣服', en: 'Clothes' },
  { key: 'decor', zh: '花园', en: 'Garden' },
  { key: 'special', zh: '道具', en: 'Special' },
];

export function shopScreen({ go }) {
  let tab = 'food', preview = null;
  const n = html`<section class="screen"><div class="shop">
      <div class="preview card">
        <div class="h-title" style="font-size:24px"><span class="zh">喵喵商店</span><span class="en">Shop</span></div>
        <div class="stage-mini" id="mini"><div class="fx-layer" id="fx"></div></div>
        <div class="help" id="pv-note" style="text-align:center">点衣服可以先试穿！<br>Tap clothes to try them on.</div>
        <button class="btn white block" id="home">← <span class="zh">回家</span> Home</button>
      </div>
      <div>
        <div class="tabs" id="tabs"></div>
        <div class="card" style="border-top-left-radius:0"><div class="shop-list" id="list"></div></div>
      </div>
    </div></section>`;
  const mini = $('#mini', n);
  mini.style.position = 'relative';
  let kv;
  const drawKitten = () => {
    const eq = { ...S.get().kitten.equipped };
    if (preview && ITEMS[preview].cat === 'wear') eq[ITEMS[preview].slot] = preview;
    if (kv) kv.canvas.remove();
    kv = new KittenView({ scale: 5, equipped: eq });
    mini.appendChild(kv.canvas);
  };

  function render() {
    const s = S.get();
    $('#tabs', n).innerHTML = TABS.map((t) => `<button class="tab ${t.key === tab ? 'on' : ''}" data-tab="${t.key}"><span class="zh">${t.zh}</span> ${t.en}</button>`).join('');
    const list = $('#list', n);
    list.innerHTML = '';
    Object.entries(ITEMS).filter(([, it]) => it.cat === tab).sort((a, b) => S.price(a[0]) - S.price(b[0])).forEach(([id, it]) => {
      const cost = S.price(id);
      const special = it.cat === 'special';
      const owned = (it.cat === 'wear' || it.cat === 'decor') && s.owned.includes(id);
      const have = it.cat === 'food' ? s.pantry[id] || 0 : special ? s.streak.freezes || 0 : 0;
      const full = special && have >= S.MAX_FREEZES;
      const can = s.coins >= cost && !full;
      const eff = it.cat === 'food' ? itemEffect(it) : it.toy ? '可以一起玩 Toy'
        : special ? `漏了一天也不会断连胜 · Keeps your streak if you miss a day${full ? ` (max ${S.MAX_FREEZES})` : ''}` : '';
      const card = html`<div class="item ${preview === id ? 'sel' : ''}">
          ${owned ? '<span class="owned">已有 Owned</span>' : have ? `<span class="count">×${have}</span>` : ''}
          <div class="art"></div>
          <div class="nm">${it.name}</div><div class="nm-en">${it.en}</div>
          ${eff ? `<div class="eff">${eff}</div>` : ''}
          ${owned ? '<button class="btn white small" disabled>✓</button>' : `<button class="btn small ${can ? 'green' : ''}" ${can ? '' : 'disabled'} data-buy="${id}"><span class="price">${cost}${coinI(16)}</span></button>`}
        </div>`;
      $('.art', card).appendChild(spriteCanvas(id, 64));
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
    if (!S.buy(id)) { toast(it.cat === 'special' && (S.get().streak.freezes || 0) >= S.MAX_FREEZES ? `最多${S.MAX_FREEZES}张 · You can hold ${S.MAX_FREEZES} at most` : '金币不够 · Not enough coins'); return; }
    sfx.coin();
    preview = null;
    drawKitten();
    kv.flash('happy', 1500); kv.jump();
    burst($('#fx', n), 'heart', 3, '50%', '20%');
    toast(it.cat === 'special' ? `❄️ <span class="zh">有${S.get().streak.freezes}张冰冻卡了！</span> Streak freeze ready` : it.cat === 'food' ? `<span class="zh">买了${it.name}！</span> Feed it at home` : it.cat === 'wear' ? `<span class="zh">穿上${it.name}！</span>` : `<span class="zh">${it.name}放在花园里了！</span>`);
    render();
  }
  $('#tabs', n).onclick = (e) => { const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; render(); } };
  $('#home', n).onclick = () => go('home');
  n._mounted = () => { drawKitten(); render(); };
  return n;
}

export function wardrobeScreen({ go }) {
  const n = html`<section class="screen"><div class="shop">
      <div class="preview card">
        <div class="h-title" style="font-size:24px"><span class="zh">打扮</span><span class="en">Dress up</span></div>
        <div class="stage-mini" id="mini"></div>
        <button class="btn white block" id="home">← <span class="zh">回家</span> Home</button>
      </div>
      <div class="stack">
        <div class="card"><div class="h-title" style="font-size:22px"><span class="zh">我的衣服</span><span class="en">My clothes — tap to wear / take off</span></div><div class="shop-list" id="wear"></div></div>
        <div class="card"><div class="h-title" style="font-size:22px"><span class="zh">我的花园</span><span class="en">My garden — tap to show / hide</span></div><div class="shop-list" id="decor"></div></div>
      </div>
    </div></section>`;
  const mini = $('#mini', n);
  let kv;
  function render() {
    const s = S.get();
    if (kv) kv.canvas.remove();
    kv = new KittenView({ scale: 5 }); mini.appendChild(kv.canvas);
    const fill = (el, cat, isOn, toggle, empty) => {
      el.innerHTML = '';
      const ids = s.owned.filter((id) => ITEMS[id].cat === cat);
      if (!ids.length) { el.innerHTML = `<p class="help">${empty}</p>`; return; }
      ids.forEach((id) => {
        const it = ITEMS[id];
        const on = isOn(id);
        const c = html`<button class="item ${on ? 'sel' : ''}">${on ? '<span class="owned">✓</span>' : ''}<div class="art"></div><div class="nm">${it.name}</div><div class="nm-en">${it.en}</div></button>`;
        $('.art', c).appendChild(spriteCanvas(id, 60));
        c.onclick = () => { toggle(id); sfx.click(); render(); kv.flash('happy', 900); };
        el.appendChild(c);
      });
    };
    fill($('#wear', n), 'wear', (id) => Object.values(s.kitten.equipped).includes(id), S.toggleWear, '还没有衣服，去商店看看吧！ No clothes yet — visit the shop.');
    fill($('#decor', n), 'decor', (id) => !s.decorHidden.includes(id), S.toggleDecor, '花园还是空的。 Your garden is empty — buy something in the shop.');
  }
  $('#home', n).onclick = () => go('home');
  n._mounted = render;
  return n;
}
