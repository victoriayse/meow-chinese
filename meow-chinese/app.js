// 喵喵中文 Meow Chinese — app shell, router, top bar, welcome and home screen.
import * as S from './state.js';
import { drawLandscape, FURS, ITEMS, spriteCanvas, itemEffect } from './pixel.js';
import { $, $$, html, esc, hydrateIcons, coinI, KittenView, burst, toast, openModal, closeModal, tapSound } from './ui.js';
import { sfx } from './audio.js';
import { spellingScreen } from './spell.js';
import { shopScreen, wardrobeScreen } from './shop.js';
import { parentScreen } from './parent.js';

const app = $('#app');
let current = null;

// ---------- background ----------
let skyKey = '';
function paintSky(force) {
  const portrait = window.innerHeight > window.innerWidth || window.innerWidth <= 900;
  const key = `${window.innerWidth}x${window.innerHeight}`;
  if (!force && key === skyKey) return;
  skyKey = key;
  drawLandscape($('#sky'), { horizon: portrait ? 0.4 : 0.5, seed: 7 });
}
window.addEventListener('resize', () => { clearTimeout(paintSky.t); paintSky.t = setTimeout(() => { paintSky(); if (current === 'home') go('home'); }, 200); });

// ---------- router ----------
const screens = {
  welcome: welcomeScreen,
  setup: setupScreen,
  home: homeScreen,
  spell: (p) => spellingScreen({ ...p, go }),
  shop: () => shopScreen({ go }),
  wardrobe: () => wardrobeScreen({ go }),
  parent: (p) => parentScreen({ ...p, go }),
};
export function go(name, params = {}) {
  if (window.speechSynthesis) speechSynthesis.cancel();
  current = name;
  app.innerHTML = '';
  const node = screens[name](params);
  app.appendChild(node);
  hydrateIcons(app);
  renderTopbar();
  if (node._mounted) node._mounted();
}

// ---------- top bar ----------
let lastCoins = null;
function renderTopbar() {
  const s = S.get(), bar = $('#topbar');
  const showGame = s.onboarded && current !== 'welcome' && current !== 'setup';
  bar.innerHTML = `
    <button class="brand" data-go="home" aria-label="Home">
      <span id="logo-kit"></span>
      <span class="brand-text"><span class="logo-zh">喵喵中文</span><span class="logo-en">Meow Chinese</span></span>
    </button>
    <span class="spacer"></span>
    ${showGame ? `
      <span class="pill" title="Streak"><span style="font-size:18px">🔥</span>${s.streak.lastDate && daysSince(s.streak.lastDate) <= 1 ? s.streak.count : 0}<span class="sub">天</span>${s.streak.freezes ? `<span class="sub" title="Streak freezes">❄️${s.streak.freezes}</span>` : ''}</span>
      <span class="pill" id="coin-pill" title="Coins">${coinI(22)}<span id="coin-n">${s.coins}</span></span>
      <button class="icon-btn" data-go="parent" aria-label="Parent area" title="家长 Parent">🔒</button>` : ''}
  `;
  hydrateIcons(bar);
  const kv = new KittenView({ scale: 1.3 });
  kv.canvas.classList.remove('bob');
  $('#logo-kit', bar).replaceWith(kv.canvas);
  bar.onclick = (e) => {
    const b = e.target.closest('[data-go]'); if (!b) return;
    if (b.dataset.go === 'home' && !s.onboarded) return;
    if (current === 'spell' && b.dataset.go !== 'spell' && app.firstElementChild?._leave) { app.firstElementChild._leave(() => go(b.dataset.go)); return; }
    go(b.dataset.go);
  };
  if (lastCoins !== null && s.coins !== lastCoins) { const p = $('#coin-pill'); p && p.classList.add('coin-bump'); }
  lastCoins = s.coins;
}
function daysSince(d) { return Math.round((new Date(S.todayStr()) - new Date(d)) / 86400000); }
S.onChange(() => {
  const n = $('#coin-n');
  if (n && +n.textContent !== S.get().coins) {
    n.textContent = S.get().coins;
    const p = $('#coin-pill'); p.classList.remove('coin-bump'); void p.offsetWidth; p.classList.add('coin-bump');
  }
});

// ---------- welcome ----------
function welcomeScreen() {
  const kv = new KittenView({ scale: 6 });
  kv.setMood('happy');
  const n = html`<section class="screen"><div class="welcome">
      <div class="kicker">START YOUR</div>
      <h1 class="mega">中文大冒险</h1>
      <p class="mega-en">Chinese Adventure</p>
      <p class="tagline">和小猫一起学中文！ Learn Chinese with your kitten friend ✧</p>
      <div id="wk"></div>
      <button class="btn big" id="start"><span class="zh">开始</span> Get started</button>
    </div></section>`;
  $('#wk', n).replaceWith(kv.canvas);
  $('#start', n).onclick = () => { sfx.unlock(); sfx.fanfare(); go('setup'); };
  return n;
}

function setupScreen() {
  const s = S.get();
  let fur = s.kitten.fur;
  const n = html`<section class="screen center"><div class="card stack" style="max-width:720px;width:100%">
      <div class="h-title"><span class="zh">选一只小猫</span><span class="en">Choose your kitten</span></div>
      <div class="fur-pick" id="furs"></div>
      <label class="field"><span><span class="zh">小猫的名字</span> · Kitten's name</span><input id="kname" maxlength="8" value="${esc(s.kitten.name)}"></label>
      <label class="field"><span><span class="zh">你的名字</span> · Your name</span><input id="cname" maxlength="12" value="${esc(s.childName)}" placeholder="e.g. 小美"></label>
      <button class="btn big green" id="go"><span class="zh">出发！</span> Let's go</button>
    </div></section>`;
  const furs = $('#furs', n);
  const draw = () => {
    furs.innerHTML = '';
    Object.entries(FURS).forEach(([k, f]) => {
      const b = html`<button class="fur-opt ${k === fur ? 'on' : ''}"></button>`;
      const kv = new KittenView({ scale: 2.6, fur: k, equipped: {} });
      kv.canvas.classList.remove('bob');
      b.appendChild(kv.canvas);
      b.appendChild(html`<span>${f.name.split(' ')[0]}</span>`);
      b.onclick = () => { fur = k; draw(); };
      furs.appendChild(b);
    });
  };
  draw();
  $('#go', n).onclick = () => {
    const st = S.get();
    st.kitten.fur = fur;
    st.kitten.name = $('#kname', n).value.trim() || '咪咪';
    st.childName = $('#cname', n).value.trim();
    const first = !st.onboarded;
    st.onboarded = true;
    S.save();
    go('home');
    if (first) setTimeout(() => toast(`<span class="zh">你有${S.get().coins}个金币！</span> Coins to start`), 400);
  };
  return n;
}

// ---------- home ----------
const DECOR_POS = {
  'far-left': 'left:2%;bottom:6%',
  left: 'left:12%;bottom:22%',
  right: 'right:5%;bottom:20%',
  'front-left': 'left:27%;bottom:3%',
  'front-right': 'right:24%;bottom:4%',
  back: 'left:50%;bottom:34%;transform:translateX(-50%)',
};

function homeScreen() {
  S.tick();
  const s = S.get(), k = s.kitten, md = S.mood();
  const list = S.activeList();
  const reviewN = S.reviewWords().length;
  const d = s.daily;
  const portrait = window.innerHeight > window.innerWidth || window.innerWidth <= 900;
  const scale = portrait ? Math.max(4, Math.min(7, Math.floor((window.innerHeight * 0.36) / 38))) : Math.max(5, Math.min(9, Math.floor((window.innerHeight * 0.5) / 38)));

  const task = (done, zh, en, coins, prog = '') => `
    <div class="task ${done ? 'done' : ''}">
      <span class="check">${done ? '✓' : ''}</span>
      <span><div class="t-zh">${zh}${prog ? ` <span class="prog">${prog}</span>` : ''}</div><div class="t-en">${en}</div></span>
      <span class="reward">+${coins}${coinI(18)}</span>
    </div>`;

  const n = html`<section class="home">
    <div class="stage" id="stage">
      <div class="ground" id="ground">
        <div class="kitten-wrap" id="kwrap">
          <div class="fx-layer" id="fx"></div>
        </div>
      </div>
    </div>
    <div class="side">
      <div class="card stack" style="gap:8px">
        <div class="stat"><span><i data-icon="fish" data-size="22"></i></span><span>饱饱 <span class="en">Food</span></span><div class="bar segmented"><i style="width:${k.hunger}%;--c:#f59b2a"></i></div></div>
        <div class="stat"><span style="font-size:20px;text-align:center">💧</span><span>喝水 <span class="en">Water</span></span><div class="bar segmented"><i style="width:${k.water ?? 75}%;--c:#4fb3ef"></i></div></div>
        <div class="stat"><span>${'<i data-icon="heart" data-size="22"></i>'}</span><span>开心 <span class="en">Happy</span></span><div class="bar segmented"><i style="width:${k.happy}%;--c:#ff6f9c"></i></div></div>
        <div class="stat"><span style="font-family:var(--px);font-weight:700">Lv</span><span>等级 ${S.level()}</span><div class="bar"><i style="width:${S.levelProgress() * 100}%;--c:#6cb6f2"></i></div></div>
      </div>
      <div class="card">
        <div class="h-title" style="font-size:22px;margin-bottom:8px"><span class="zh">今日任务</span><span class="en">Daily tasks</span></div>
        <div class="tasks">
          ${task(d.spell, '完成一次听写', 'Finish one spelling round', S.REWARDS.taskSpell)}
          ${task(S.perfectDone(), `今天写对 ${S.RIGHT_TARGET}/${S.WORDS_TARGET}`, `Write ${S.WORDS_TARGET}+ words, get ${S.RIGHT_TARGET} in ${S.WORDS_TARGET} right`, S.REWARDS.taskPerfect, `写了${d.tried} · 对${d.right}`)}
          ${task(d.care, `照顾${esc(k.name)}`, 'Feed or pet your kitten', S.REWARDS.taskCare)}
        </div>
        <div class="bonus-line" style="margin-top:8px">${d.paid.bonus ? '🎉 全部完成！All done today!' : `全部完成再得 +${S.REWARDS.allBonus} 🪙 bonus`}</div>
      </div>
      <button class="btn big block col" id="b-spell"><span class="zh">✏️ 开始听写</span><span class="en">Start · ${esc(list ? list.name : '')}</span></button>
      <div class="menu-grid">
        <button class="btn pink" id="b-review" ${reviewN ? '' : 'disabled'}><span class="zh">错词本</span><span class="en">Mistakes (${reviewN})</span></button>
        <button class="btn white" id="b-feed"><span class="zh">喂食喝水</span><span class="en">Food &amp; water</span></button>
        <button class="btn blue" id="b-shop"><span class="zh">商店</span><span class="en">Shop</span></button>
        <button class="btn white" id="b-dress"><span class="zh">打扮</span><span class="en">Dress up</span></button>
        <button class="btn white soon" disabled><span class="zh">好词好句</span><span class="en">Vocab</span></button>
        <button class="btn white soon" disabled><span class="zh">看图作文</span><span class="en">Writing</span></button>
      </div>
    </div>
  </section>`;

  // kitten + decorations
  const kv = new KittenView({ scale, interactive: true, onTap: () => petKitten() });
  kv.setMood(md.face);
  const kwrap = $('#kwrap', n), fx = $('#fx', n);
  if (s.owned.includes('cushion') && !s.decorHidden.includes('cushion')) {
    const c = spriteCanvas('cushion', 26 * Math.round(scale * 0.9));
    c.style.cssText = `position:absolute;left:50%;bottom:${Math.round(scale * 4)}px;transform:translateX(-50%);z-index:0`;
    kwrap.appendChild(c);
  }
  kv.canvas.style.position = 'relative'; kv.canvas.style.zIndex = 1;
  kwrap.appendChild(kv.canvas);
  kwrap.appendChild(html`<div class="nametag">${esc(k.name)}<span class="lv">Lv${S.level()}</span></div>`);
  if (md.face === 'cry') kwrap.appendChild(html`<div class="bubble sad">😿 ${esc(md.text)}</div>`);
  else if (md.face === 'thirsty') kwrap.appendChild(html`<div class="bubble">💧 ${esc(md.text)}</div>`);
  else if (md.face === 'hungry') kwrap.appendChild(html`<div class="bubble">🐟 ${esc(md.text)}</div>`);
  else if (md.face === 'sleepy') kwrap.appendChild(html`<div class="zzz">z Z z</div>`);
  else if (s.childName && Math.random() < 0.6) kwrap.appendChild(html`<div class="bubble">${esc(s.childName)}，喵～</div>`);
  if (md.needs.length) kwrap.appendChild(html`<div class="needs">${md.needs.includes('hungry') ? '<span>🐟 饿了 Hungry</span>' : ''}${md.needs.includes('thirsty') ? '<span>💧 口渴 Thirsty</span>' : ''}</div>`);
  if (s.freezeUsed) {
    const n = s.freezeUsed; delete s.freezeUsed; S.save();
    setTimeout(() => toast(`❄️ <span class="zh">冰冻卡保护了你的连胜！</span> Streak freeze used${n > 1 ? ` ×${n}` : ''}`, { ms: 4000 }), 500);
  }

  const stage = $('#stage', n);
  s.owned.filter((id) => ITEMS[id].cat === 'decor' && id !== 'cushion' && !s.decorHidden.includes(id)).forEach((id) => {
    const it = ITEMS[id];
    const w = Math.max(...it.art.map((r) => r.length)), h = it.art.length;
    const px = Math.max(3, Math.round(scale * 0.8)) * Math.max(w, h);
    const c = spriteCanvas(id, px);
    const wrap = document.createElement('div');
    wrap.className = 'decor'; wrap.style.cssText = DECOR_POS[it.spot] || 'left:10%;bottom:10%';
    if (it.spot === 'back') wrap.style.zIndex = 0;
    wrap.appendChild(c);
    stage.insertBefore(wrap, stage.firstChild);
  });

  function petKitten() {
    sfx.purr(); kv.flash('happy', 1400); kv.jump();
    burst(fx, 'heart', 3, '50%', '25%');
    const before = S.get().daily.paid.care;
    S.pet();
    afterCare(before);
  }
  function afterCare() {
    const got = S.checkDaily();
    got.forEach((g, i) => setTimeout(() => toast(g.label, { coins: g.coins }), i * 700));
    if (got.length) setTimeout(() => go('home'), 1600);
  }

  $('#b-spell', n).onclick = () => { sfx.unlock(); go('spell', { mode: 'list' }); };
  $('#b-review', n).onclick = () => { sfx.unlock(); go('spell', { mode: 'review' }); };
  $('#b-shop', n).onclick = () => go('shop');
  $('#b-dress', n).onclick = () => go('wardrobe');
  $('#b-feed', n).onclick = () => openFeed(kv, fx, afterCare);
  return n;
}

function openFeed(kv, fx, afterCare) {
  const s = S.get();
  const foods = Object.entries(s.pantry).filter(([id, c]) => c > 0 && ITEMS[id]);
  const toys = s.owned.filter((id) => ITEMS[id].toy);
  const n = html`<div class="card stack">
      <div class="h-title"><span class="zh">喂${esc(s.kitten.name)}吃东西</span><span class="en">Feed your kitten</span></div>
      ${foods.length ? '<div class="pantry" id="pantry"></div>' : `<p class="help">冰箱空空的！Your pantry is empty — buy food in the shop.</p>`}
      ${toys.length ? `<div class="h-title" style="font-size:20px"><span class="zh">一起玩</span><span class="en">Play together</span></div><div class="pantry" id="toys"></div>` : ''}
      <div class="row" style="justify-content:space-between">
        <button class="btn blue" id="to-shop"><span class="zh">去商店</span> Shop</button>
        <button class="btn white" id="close">关闭 Close</button>
      </div>
    </div>`;
  const pantry = $('#pantry', n);
  foods.forEach(([id, count]) => {
    const it = ITEMS[id];
    const b = html`<button class="item"><span class="count">×${count}</span><div class="art"></div><div class="nm">${it.name}</div><div class="eff">${itemEffect(it)}</div></button>`;
    $('.art', b).appendChild(spriteCanvas(id, 56));
    b.onclick = () => {
      if (!S.feed(id)) return;
      closeModal(); sfx.yum(); kv.flash('eat', 1600);
      burst(fx, 'heart', 3, '50%', '25%');
      toast(it.water && !it.hunger ? `<span class="zh">好解渴！</span> Ahh, refreshing!` : `<span class="zh">好吃！</span> Yum, ${esc(it.en)}!`);
      afterCare();
      setTimeout(() => go('home'), 1700);
    };
    pantry.appendChild(b);
  });
  const toyBox = $('#toys', n);
  toys.forEach((id) => {
    const it = ITEMS[id];
    const b = html`<button class="item"><div class="art"></div><div class="nm">${it.name}</div><div class="eff">+6 ❤</div></button>`;
    $('.art', b).appendChild(spriteCanvas(id, 56));
    b.onclick = () => {
      closeModal(); S.play(); sfx.purr(); kv.flash('happy', 1800); kv.jump(); setTimeout(() => kv.jump(), 600);
      burst(fx, 'heart', 4, '50%', '25%');
      afterCare();
    };
    toyBox.appendChild(b);
  });
  $('#close', n).onclick = closeModal;
  $('#to-shop', n).onclick = () => { closeModal(); go('shop'); };
  openModal(n);
}

// ---------- boot ----------
window.addEventListener('speech-stuck', () => {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  toast(`<span><span class="zh">听不到声音？</span> No sound? ${ios ? 'Turn up the volume and check silent mode is off, then tap 再听 again.' : 'Fully quit the browser (⌘Q), reopen it and check the volume.'}</span>`, { ms: 7000 });
});
tapSound(document.body);
paintSky(true);
S.tick();
setInterval(() => S.tick(), 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { S.tick(); if (current === 'home') go('home'); } });
go(S.get().onboarded ? 'home' : 'welcome');

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// prevent iOS double-tap zoom & pinch
document.addEventListener('gesturestart', (e) => e.preventDefault());
