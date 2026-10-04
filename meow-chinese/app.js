// 喵喵中文 Meow Chinese — app shell, router, top bar, welcome and home screen.
import * as S from './state.js';
import { drawLandscape, FURS, ITEMS, spriteCanvas, itemEffect, drawGrid, artGrid, TOMB, drawRoom, drawRoof, ROOM_WINDOW } from './pixel.js';
import { $, $$, html, esc, hydrateIcons, coinI, KittenView, burst, toast, openModal, closeModal, tapSound, confirmBox, confetti } from './ui.js';
import { sfx, meow, startMusic, stopMusic, musicOn, TRACKS, trackIndex, setTrack } from './audio.js';
import { spellingScreen } from './spell.js';
import { shopScreen, wardrobeScreen } from './shop.js';
import { parentScreen } from './parent.js';
import { essayScreen, showEssayReward } from './essay.js';
import * as Cloud from './cloud.js';
import * as Auth from './auth.js';
import * as Friends from './friends.js';
import { openPhone, PHONE_ICON } from './phone.js';
import { randomJoke } from './jokes.js';
import { practiceListScreen, practiceScreen, KINDS } from './practice.js';

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
window.addEventListener('resize', () => { clearTimeout(paintSky.t); paintSky.t = setTimeout(() => { paintSky(); if (current === 'home') refreshHome(); }, 200); });

// ---------- router ----------
const screens = {
  welcome: welcomeScreen,
  login: loginScreen,
  setup: setupScreen,
  home: (p) => homeScreen(p),
  spell: (p) => spellingScreen({ ...p, go }),
  shop: (p) => shopScreen({ go, ...p }),
  wardrobe: () => wardrobeScreen({ go }),
  parent: (p) => parentScreen({ ...p, go }),
  grave: graveScreen,
  essay: (p) => essayScreen({ ...p, go }),
  friends: () => Friends.friendsScreen({ go }),
  tasks: () => tasksScreen(),
  practiceList: (p) => practiceListScreen({ ...p, go }),
  practice: (p) => practiceScreen({ ...p, go }),
  friend: (p) => Friends.friendScreen({ ...p, go }),
};
// a simple history so every page can go Back
const stack = [];
let currentParams = {};
const NO_HISTORY = ['welcome', 'setup', 'grave', 'login'];
export function go(name, params = {}, opts = {}) {
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (!opts.back && !opts.replace && current && !NO_HISTORY.includes(current)) {
    const same = current === name && JSON.stringify(params) === JSON.stringify(currentParams);
    if (name === 'home' && !params.view) stack.length = 0;          // the main page is the bottom of the stack
    else if (!same) { stack.push({ name: current, params: currentParams }); if (stack.length > 20) stack.shift(); }
  }
  if (NO_HISTORY.includes(name)) stack.length = 0;
  current = name; currentParams = params;
  Friends.setActivity({ spell: 'spelling', essay: 'essay', tasks: 'practice', practice: 'practice', practiceList: 'practice', shop: 'shop', wardrobe: 'wardrobe', friends: 'friends', friend: 'friends' }[name] || (name === 'home' && params.view === 'house' ? 'house' : 'online'));
  app.innerHTML = '';
  const node = screens[name](params);
  app.appendChild(node);
  hydrateIcons(app);
  renderTopbar();
  if (node._mounted) node._mounted();
  // soothing music on the calm pages; quiet during spelling so she can hear the words
  if (MUSIC_PAGES.includes(name)) startMusic(); else stopMusic();
}
function refreshHome() { go('home', current === 'home' ? currentParams : {}, { replace: true }); }
export function goBack() {
  const prev = stack.pop() || { name: 'home', params: {} };
  go(prev.name, prev.params, { back: true });
}
const canGoBack = () => current && !['welcome', 'setup', 'grave', 'login'].includes(current) && !(current === 'home' && !currentParams.view);

// ---------- music picker: five cosy tunes, or off ----------
const MUSIC_PAGES = ['home', 'shop', 'wardrobe', 'grave', 'friends', 'friend'];
function openMusicPicker() {
  const draw = () => {
    const on = musicOn(), cur = trackIndex();
    n.innerHTML = `<div class="h-title"><span class="zh">🎵 选音乐</span><span class="en">Choose music</span></div>
      <div class="tracks">${TRACKS.map((t, i) => `<button class="track ${on && i === cur ? 'on' : ''}" data-i="${i}"><span class="ic">${t.icon}</span><span><span class="zh">${t.zh}</span><small>${t.en}</small></span><span class="mark">${on && i === cur ? '▶' : ''}</span></button>`).join('')}
        <button class="track off ${on ? '' : 'on'}" data-i="off"><span class="ic">🔇</span><span><span class="zh">关掉音乐</span><small>Music off</small></span><span class="mark">${on ? '' : '✓'}</span></button></div>
      <button class="btn white" id="close">关闭 Close</button>`;
    $('#close', n).onclick = closeModal;
  };
  const n = html`<div class="card stack music-pick"></div>`;
  n.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    const set = S.get().settings;
    if (b.dataset.i === 'off') { set.music = false; S.save(); stopMusic(); }
    else {
      const i = +b.dataset.i, was = musicOn();
      set.music = true; set.musicTrack = i; S.save();
      if (was) setTrack(i); else startMusic();
    }
    draw(); renderTopbar();
  });
  draw();
  openModal(n);
}

// ---------- top bar ----------
let lastCoins = null;
function renderTopbar() {
  const s = S.get(), bar = $('#topbar');
  const showGame = s.onboarded && !['welcome', 'setup', 'login'].includes(current);
  bar.innerHTML = `
    <button class="icon-btn music ${musicOn() ? '' : 'off'}" id="music-btn" aria-label="Music" title="音乐 Music">${musicOn() ? '🎵' : '🔇'}</button>
    ${showGame && canGoBack() ? '<button class="icon-btn back" id="back-btn" aria-label="Back" title="返回 Back">←</button>' : ''}
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
    if (e.target.closest('#music-btn')) { openMusicPicker(); return; }
    if (e.target.closest('#back-btn')) {
      if (current === 'spell' && app.firstElementChild?._leave) { app.firstElementChild._leave(() => goBack()); return; }
      goBack(); return;
    }
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

// ---------- login ----------
function loginScreen() {
  let mode = 'login';
  const kv = new KittenView({ scale: 5 });
  kv.setMood('happy');
  const n = html`<section class="screen"><div class="welcome login">
      <h1 class="mega" style="font-size:clamp(52px,9vw,104px)">喵喵中文</h1>
      <p class="mega-en" style="font-size:clamp(22px,3.4vw,40px)">Meow Chinese</p>
      <div id="lk"></div>
      <form class="card stack login-card" id="form" autocomplete="on">
        <div class="seg"><button type="button" data-m="login" class="on">登录 Log in</button><button type="button" data-m="signup">注册 New account</button></div>
        <label class="field">邮箱 Email<input type="email" id="em" autocomplete="username" inputmode="email" autocapitalize="off" required></label>
        <label class="field">密码 Password
          <span class="pw"><input type="password" id="pw" autocomplete="current-password" minlength="6" required><button type="button" id="eye" aria-label="Show password">👁</button></span>
          <small id="pw-hint" class="hidden">至少6个字 · At least 6 characters. Parents and kids use the same account.</small>
        </label>
        <div class="login-err hidden" id="err"></div>
        <button class="btn big green block" id="submit" type="submit"><span class="zh">登录</span> Log in</button>
      </form>
    </div></section>`;
  $('#lk', n).replaceWith(kv.canvas);
  const setMode = (m) => {
    mode = m;
    $$('.seg button', n).forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    $('#submit', n).innerHTML = m === 'login' ? '<span class="zh">登录</span> Log in' : '<span class="zh">注册</span> Create account';
    $('#pw', n).autocomplete = m === 'login' ? 'current-password' : 'new-password';
    $('#pw-hint', n).classList.toggle('hidden', m === 'login');
    $('#err', n).classList.add('hidden');
  };
  $('.seg', n).onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) setMode(b.dataset.m); };
  $('#eye', n).onclick = () => { const i = $('#pw', n); i.type = i.type === 'password' ? 'text' : 'password'; };
  $('#form', n).onsubmit = async (e) => {
    e.preventDefault(); sfx.unlock();
    const email = $('#em', n).value, pw = $('#pw', n).value, err = $('#err', n), btn = $('#submit', n);
    err.classList.add('hidden'); btn.disabled = true;
    try {
      if (mode === 'login') await Auth.signIn(email, pw); else await Auth.signUp(email, pw);
      try { await Cloud.afterLogin(); } catch (x) { console.warn('first sync failed', x); }
      sfx.fanfare();
      go(S.get().onboarded ? 'home' : 'setup');
      if (mode === 'signup') setTimeout(() => toast('<span class="zh">账号建好了！</span> Account created'), 400);
    } catch (x) {
      err.textContent = x.message; err.classList.remove('hidden'); sfx.oops();
    } finally { btn.disabled = false; }
  };
  return n;
}

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
    delete st.needsSetup;
    S.save();
    go('home');
    if (first) setTimeout(() => toast(`<span class="zh">你有${S.get().coins}个金币！</span> Coins to start`), 400);
  };
  return n;
}

// ---------- home ----------
// where each home item sits inside the room (percent of the room box)
const DECOR_POS = {
  ceiling: 'left:27%;top:0',
  'wall-left': 'left:5%;top:9%',
  'wall-right': 'right:7%;top:5%',
  shelf: 'right:5%;top:24%',
  curtain: 'curtain',
  'back-left': 'left:2%;bottom:30%',
  'back-mid-left': 'left:21%;bottom:31%',
  'back-mid-right': 'right:25%;bottom:31%',
  'back-right': 'right:2%;bottom:29%',
  'front-left': 'left:2%;bottom:3%',
  plant: 'left:21%;bottom:3%',
  'toy-left': 'left:32%;bottom:2%',
  'toy-right': 'right:32%;bottom:2%',
  house: 'right:17%;bottom:3%',
  'front-right': 'right:2%;bottom:3%',
};

// ----- first visit of the day: greeting, check-in rewards; jokes now and then -----
let greet = null, greetUntil = 0, checkinShown = false;
function greetNow() {
  const g = S.takeGreeting();
  if (g) { greet = g; greetUntil = Date.now() + 90000; setTimeout(() => meow('happy'), 500); }
  return greet && Date.now() < greetUntil ? greet : null;
}
function openCheckin(after) {
  const st = S.checkinStatus();
  const n = html`<div class="card stack checkin" style="align-items:center;text-align:center">
      <div class="h-title" style="justify-content:center"><span class="zh">📅 每日签到</span><span class="en">Daily check-in</span></div>
      <p class="help" style="margin:0">每天来签到领奖励！漏了一天就从第1天重新开始哦。<br>Come every day for a reward. Miss a day and it starts again from Day 1.</p>
      <div class="ck-grid">${Array.from({ length: S.CHECKIN_DAYS }, (_, i) => {
        const d = i + 1, done = d < st.day || (st.claimed && d === st.day), today = d === st.day && !st.claimed;
        const prize = d === S.CHECKIN_DAYS ? '<span class="mystery">🎁<b>?</b></span>' : `<span class="coins">${coinI(22)}<b>${S.checkinCoins(d)}</b></span>`;
        return `<div class="ck ${done ? 'done' : ''} ${today ? 'today' : ''} ${d === S.CHECKIN_DAYS ? 'big' : ''}"><small>第${d}天 Day ${d}</small>${prize}${done ? '<i class="tick">✓</i>' : ''}${today ? '<em>今天 Today</em>' : ''}</div>`;
      }).join('')}</div>
      <div id="ck-result"></div>
      ${st.claimed ? '<p class="help" style="margin:0">今天已经领过了，明天再来！ Already collected today — come back tomorrow!</p><button class="btn white" id="ck-close">关闭 Close</button>'
        : `<button class="btn big green" id="ck-go">🎉 <span class="zh">领取第${st.day}天奖励</span> Collect</button>`}
    </div>`;
  const go = $('#ck-go', n);
  if (go) go.onclick = () => {
    const r = S.claimCheckin(); if (!r) return;
    const box = $('#ck-result', n);
    $('.ck.today', n)?.classList.add('done');
    if (r.item) {
      box.innerHTML = `<div class="ck-reveal"><div class="giftbox opened">🎁</div><div class="zh" style="font-size:22px">神秘礼物是… ${ITEMS[r.item].name}！</div><div class="en">${ITEMS[r.item].en} — find it in My Items</div></div>`;
      const kvp = new KittenView({ scale: 4, equipped: { ...S.get().kitten.equipped, body: r.item } }); kvp.canvas.classList.remove('bob');
      box.firstChild.insertBefore(kvp.canvas, box.firstChild.children[1]);
      sfx.fanfare(); confetti();
    } else {
      box.innerHTML = `<div class="ck-reveal"><div class="price" style="font-size:30px">+${r.coins} ${coinI(28)}</div>${r.dup ? '<div class="help">你已经有公主裙了，换成金币！ You already have the gown, so here are coins!</div>' : ''}</div>`;
      sfx.coin(); burst(box, 'coin', 4, '50%', '20%');
    }
    hydrateIcons(n);
    go.outerHTML = '<button class="btn green" id="ck-close">好的！ Yay!</button>';
    $('#ck-close', n).onclick = () => { closeModal(); };
    renderTopbar();
  };
  const c = $('#ck-close', n); if (c) c.onclick = closeModal;
  openModal(n, { onClose: () => after && after() });
}

let pickedByHand = false;
// the spelling list picker: newest first; old lists stay locked until the newest one is finished
function spellPicker() {
  const s = S.get(), lists = S.releasedLists(), cur = S.currentList();
  if (!lists.length) return `<button class="btn big block col" id="b-spell" disabled><span class="zh">✏️ 开始听写</span><span class="en">No spelling yet — ask Mum</span></button>`;
  let sel = S.activeList();
  if (!lists.includes(sel)) sel = cur;
  // unless she just picked one herself, start on the first list she can do now
  if (!pickedByHand && S.listStatus(sel) !== 'open') sel = lists.find((l) => S.listStatus(l) === 'open') || sel;
  pickedByHand = false;
  if (s.activeListId !== sel.id) { s.activeListId = sel.id; S.saveQuiet(); }
  const date = (l) => new Date(S.listDate(l) + 'T00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
  const label = (l) => {
    const st = S.listStatus(l);
    const icon = st === 'done-today' ? '✅' : st === 'locked' ? '🔒' : l.id === cur.id ? '⭐' : '📝';
    const note = st === 'done-today' ? ' · 今天写过了' : st === 'locked' ? ' · 先写新的' : l.id === cur.id ? (l.done ? '' : ' · 新!') : '';
    return `${icon} ${l.name} (${date(l)})${note}`;
  };
  const st = S.listStatus(sel);
  const ok = st === 'open';
  return `<div class="spell-pick card">
      <label class="pick-label"><span class="zh">选听写</span> Choose a list
        <select id="list-pick">${lists.map((l) => `<option value="${l.id}" ${l.id === sel.id ? 'selected' : ''}>${esc(label(l))}</option>`).join('')}</select></label>
      <button class="btn big block col ${ok ? '' : 'dim'}" id="b-spell"><span class="zh">${ok ? '✏️ 开始听写' : st === 'done-today' ? '✅ 今天写过了' : '🔒 先写新的听写'}</span><span class="en">${ok ? `Start · ${esc(sel.name)}` : st === 'done-today' ? 'Done today — come back tomorrow' : `Finish “${esc(cur.name)}” first`}</span></button>
    </div>`;
}

// ----- learning activities: shortcuts on the home page (parents choose) and all of them under Tasks -----
const ACT_INFO = { essay: { zh: '看图作文', en: 'Picture writing', icon: '✍️' }, ...KINDS };
function activityButton(k) {
  if (k === 'essay') {
    const out = S.outstandingEssays().length, waiting = S.essays().some((e) => e.status === 'submitted');
    return out ? `<button class="btn big block col pink has-badge act-btn" data-act="essay"><span class="zh">✍️ 看图作文</span><span class="en">Picture writing — tap to start</span><i class="badge">${out}</i></button>`
      : `<button class="btn big block col white act-btn" disabled><span class="zh">✍️ 看图作文</span><span class="en">${waiting ? '等妈妈批改 Waiting for Mum' : '还没有作文 No writing yet'}</span></button>`;
  }
  const K = ACT_INFO[k], sets = S.visibleSets(k), left = sets.filter((x) => x.lastDone !== S.todayStr()).length;
  return `<button class="btn big block col blue act-btn ${sets.length ? '' : 'dim'}" data-act="${k}" ${sets.length ? '' : 'disabled'}><span class="zh">${K.icon} ${K.zh}</span><span class="en">${K.en} · ${sets.length ? `${left} of ${sets.length} sets to do today` : 'no sets yet'}</span></button>`;
}
function wireActivities(root, refresh) {
  const s = S.get();
  const pick = $('#list-pick', root);
  if (pick) pick.onchange = () => { pickedByHand = true; s.activeListId = pick.value; S.saveQuiet(); refresh(); };
  const bs = $('#b-spell', root);
  if (bs) bs.onclick = () => {
    sfx.unlock();
    const st = S.listStatus(S.activeList());
    if (st === 'done-today') return toast('<span class="zh">这个今天写过了！</span> Done today — pick another list or come back tomorrow', { ms: 3500 });
    if (st === 'locked') return toast(`<span class="zh">先完成「${esc(S.currentList().name)}」</span> Finish the newest list first`, { ms: 3500 });
    go('spell', { mode: 'list' });
  };
  root.querySelectorAll('[data-act]').forEach((b) => { b.onclick = () => { sfx.unlock(); b.dataset.act === 'essay' ? go('essay') : go('practiceList', { kind: b.dataset.act }); }; });
}
function tasksScreen() {
  const n = html`<section class="screen"><div class="tasks-hub stack">
      <div class="card stack">
        <div class="h-title"><span class="zh">📋 我的功课</span><span class="en">My tasks</span></div>
        <p class="help" style="margin:0">选一个来练习吧！ Pick something to practise.</p>
        <div class="h-title" style="font-size:20px;margin-top:6px"><span class="zh">✏️ 听写</span><span class="en">Spelling</span></div>
        ${spellPicker()}
        ${['essay', 'choice', 'match', 'order'].map(activityButton).join('')}
      </div></div></section>`;
  wireActivities(n, () => go('tasks', {}, { replace: true }));
  return n;
}

function homeScreen(params = {}) {
  S.tick();
  S.essayNotifications();
  S.purgeOldMessages();
  const inHouse = params.view === 'house' && S.unlocked('decor');
  if (S.health() === 'dead') return graveScreen();
  if (S.get().needsSetup) return setupScreen();
  S.maybeBored();
  const s = S.get(), k = s.kitten, md = S.mood();
  const list = S.activeList();
  const reviewN = S.reviewWords().length;
  const d = s.daily;
  const portrait = window.innerHeight > window.innerWidth || window.innerWidth <= 900;
  // size the kitten to the room: the room is most of the stage under the roof
  const stageH = (window.innerHeight - 70) * (portrait ? 0.54 : 1);
  const roomH = stageH * 0.92 * 0.84;
  const scale = inHouse
    ? Math.max(3, Math.min(9, Math.floor((roomH * 0.5) / 38)))
    : (portrait ? Math.max(4, Math.min(7, Math.floor((window.innerHeight * 0.36) / 38))) : Math.max(5, Math.min(9, Math.floor((window.innerHeight * 0.5) / 38))));

  const task = (done, zh, en, coins, prog = '') => `
    <div class="task ${done ? 'done' : ''}">
      <span class="check">${done ? '✓' : ''}</span>
      <span><div class="t-zh">${zh}${prog ? ` <span class="prog">${prog}</span>` : ''}</div><div class="t-en">${en}</div></span>
      <span class="reward">+${coins}${coinI(18)}</span>
    </div>`;

  const n = html`<section class="home">
    <div class="stage ${inHouse ? 'in-house' : ''}" id="stage">
      ${inHouse ? `<div class="house">
        <canvas class="roof" id="roof"></canvas>
        <div class="room" id="room">
          <canvas class="room-bg" id="roombg"></canvas>
          <div class="ground" id="ground"><div class="kitten-wrap" id="kwrap"><div class="fx-layer" id="fx"></div></div></div>
          <button class="arrange-btn" id="b-arrange"><span class="zh">🪑 摆家具</span> Move furniture</button>
          <div class="dpad" id="dpad">
            <button data-d="up" aria-label="Up">▲</button><button data-d="left" aria-label="Left">◀</button><button data-d="down" aria-label="Down">▼</button><button data-d="right" aria-label="Right">▶</button>
          </div>
        </div>
      </div>` : `<div class="ground" id="ground"><div class="kitten-wrap" id="kwrap"><div class="fx-layer" id="fx"></div></div></div>`}
    </div>
    <div class="side">
      <div id="alert"></div>
      <div class="card stack" style="gap:8px">
        <div class="stat"><span><i data-icon="fish" data-size="22"></i></span><span>饱饱 <span class="en">Food</span></span><div class="bar segmented"><i style="width:${k.hunger}%;--c:#f59b2a"></i></div></div>
        <div class="stat"><span style="font-size:20px;text-align:center">💧</span><span>喝水 <span class="en">Water</span></span><div class="bar segmented"><i style="width:${k.water ?? 75}%;--c:#4fb3ef"></i></div></div>
        <div class="stat"><span>${'<i data-icon="heart" data-size="22"></i>'}</span><span>开心 <span class="en">Happy</span></span><div class="bar segmented"><i style="width:${k.happy}%;--c:#ff6f9c"></i></div></div>
        <div class="stat"><span style="font-family:var(--px);font-weight:700">Lv</span><span>等级 ${S.level()}</span><div class="bar xp-bar"><i style="width:${S.levelProgress() * 100}%;--c:#6cb6f2"></i><b>${S.xpIntoLevel()}/${S.xpPerLevel()} XP</b></div></div>
        ${S.nextUnlock() ? `<div class="next-unlock">🔓 Lv${S.nextUnlock().level} 解锁 ${S.nextUnlock().name}</div>` : ''}
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
      ${S.homeActs().length ? `<div class="home-acts">${S.homeActs().map((k) => (k === 'spelling' ? spellPicker() : activityButton(k))).join('')}</div>` : ''}
      <div class="menu-grid">
        <button class="btn pink" id="b-review" ${reviewN ? '' : 'disabled'}><span class="zh">错词本</span><span class="en">Mistakes (${reviewN})</span></button>
        <button class="btn white" id="b-feed"><span class="zh">喂食喝水</span><span class="en">Food &amp; water</span></button>
        <button class="btn blue" id="b-shop"><span class="zh">商店</span><span class="en">Shop</span></button>
        <button class="btn white" id="b-dress"><span class="zh">我的物品</span><span class="en">My Items</span></button>
        ${S.unlocked('decor')
          ? (inHouse ? '<button class="btn green" id="b-house"><span class="zh">🌳 去草地</span><span class="en">Go outside</span></button>'
                     : '<button class="btn green" id="b-house"><span class="zh">🏠 我的家</span><span class="en">Go to Home</span></button>')
          : `<button class="btn white" disabled><span class="zh">🔒 我的家</span><span class="en">Home · Lv${S.UNLOCKS.decor}</span></button>`}
        <button class="btn blue ${Friends.incomingRequests().length ? 'has-badge' : ''}" id="b-friends"><span class="zh">👫 朋友</span><span class="en">Friends</span>${Friends.incomingRequests().length ? `<i class="badge">${Friends.incomingRequests().length}</i>` : ''}</button>
        <button class="btn ${S.outstandingEssays().length ? 'pink has-badge' : ''}" id="b-tasks"><span class="zh">📋 功课</span><span class="en">Tasks</span>${S.outstandingEssays().length ? `<i class="badge">${S.outstandingEssays().length}</i>` : ''}</button>
      </div>
    </div>
  </section>`;

  // kitten + decorations
  const kv = new KittenView({ scale, interactive: true, onTap: () => petKitten() });
  kv.setMood(md.face);
  const kwrap = $('#kwrap', n), fx = $('#fx', n);
  kv.canvas.style.position = 'relative'; kv.canvas.style.zIndex = 1;
  const kflip = document.createElement('div'); kflip.className = 'kflip';
  kflip.appendChild(kv.canvas);
  kwrap.appendChild(kflip);
  kwrap.appendChild(html`<div class="nametag">${esc(k.name)}<span class="lv">Lv${S.level()}</span></div>`);
  if (md.face === 'faint') { kv.canvas.classList.add('fainted'); kwrap.appendChild(html`<div class="zzz" style="left:60%;top:30%">@ @ @</div>`); }
  else if (greetNow()) { const g = greetNow(); kwrap.appendChild(html`<div class="bubble greet">${g.icon} ${esc(g.zh)}<br><small>${esc(g.en)}</small></div>`); }
  else if (md.face === 'dizzy') kwrap.appendChild(html`<div class="bubble sad">😵‍💫 ${esc(md.text)}</div>`);
  else if (md.face === 'cough') kwrap.appendChild(html`<div class="bubble sad">🤒 ${esc(md.text)}</div>`);
  else if (S.phoneBadge()) kwrap.appendChild(html`<div class="bubble">📱 你有新消息！<br><small>You have a new message!</small></div>`);
  else if (md.essay) kwrap.appendChild(html`<div class="bubble">✍️ ${esc(md.text)}</div>`);
  else if (md.face === 'bored') kwrap.appendChild(html`<div class="bubble">🥱 ${esc(md.text)}</div>`);
  else if (md.face === 'cry') kwrap.appendChild(html`<div class="bubble sad">😿 ${esc(md.text)}</div>`);
  else if (md.face === 'thirsty') kwrap.appendChild(html`<div class="bubble">💧 ${esc(md.text)}</div>`);
  else if (md.face === 'hungry') kwrap.appendChild(html`<div class="bubble">🐟 ${esc(md.text)}</div>`);
  else if (md.face === 'sleepy') kwrap.appendChild(html`<div class="zzz">z Z z</div>`);
  else if (Math.random() < 0.35) kwrap.appendChild(html`<div class="bubble joke">😹 ${esc(randomJoke())}</div>`);
  else if (s.childName && Math.random() < 0.6) kwrap.appendChild(html`<div class="bubble">${esc(s.childName)}，喵～</div>`);
  if (md.needs.length) kwrap.appendChild(html`<div class="needs">${md.needs.includes('hungry') ? '<span>🐟 饿了 Hungry</span>' : ''}${md.needs.includes('thirsty') ? '<span>💧 口渴 Thirsty</span>' : ''}</div>`);
  const lvNow = S.level();
  if ((s.lastLevel || 1) < lvNow) {
    const from = s.lastLevel || 1; s.lastLevel = lvNow; S.save();
    const opened = Object.entries(S.UNLOCKS).filter(([, l]) => l > from && l <= lvNow);
    setTimeout(() => { sfx.fanfare(); toast(`⭐ <span class="zh">升级了！</span> Level ${lvNow}!`, { ms: 3500 }); }, 400);
    opened.forEach(([k], i) => setTimeout(() => toast(`🔓 <span class="zh">解锁：</span>${S.UNLOCK_NAMES[k]}`, { ms: 4500 }), 1300 + i * 900));
  } else if (!s.lastLevel) { s.lastLevel = lvNow; S.save(); }
  if (s.freezeUsed) {
    const n = s.freezeUsed; delete s.freezeUsed; S.save();
    setTimeout(() => toast(`❄️ <span class="zh">冰冻卡保护了你的连胜！</span> Streak freeze used${n > 1 ? ` ×${n}` : ''}`, { ms: 4000 }), 500);
  }

  renderAlert($('#alert', n), md, k);

  // presents and letters from friends wait on the stage until she opens them
  // the flip phone (mail, notifications, tools) is always there; presents wait beside it
  {
    const gifts = S.unopenedGifts(), pb = S.phoneBadge();
    const tray = html`<div class="stage-tray">
        <button class="tray-btn phone-btn ${pb ? 'new' : ''}" id="t-phone" title="Phone">${PHONE_ICON}${pb ? `<i class="badge">${pb}</i>` : ''}</button>
        ${gifts.length ? `<button class="tray-btn gift" id="t-gift" title="Gifts">🎁<i class="badge">${gifts.length}</i></button>` : ''}
        <button class="tray-btn ${S.checkinStatus().claimed ? '' : 'gift'}" id="t-ck" title="Daily check-in">📅${S.checkinStatus().claimed ? '' : '<i class="badge">!</i>'}</button>
      </div>`;
    $('#stage', n).appendChild(tray);
    const tg = $('#t-gift', tray); if (tg) tg.onclick = () => Friends.openGiftBox(S.unopenedGifts()[0], refreshHome);
    $('#t-ck', tray).onclick = () => openCheckin(refreshHome);
    if (!S.checkinStatus().claimed && !checkinShown && S.get().onboarded) { checkinShown = true; setTimeout(() => { if (current === 'home' && $('#modal').classList.contains('hidden')) openCheckin(refreshHome); }, 1200); }
    $('#t-phone', tray).onclick = () => openPhone({ start: S.unreadNotifications().length ? 'noti' : S.unreadLetters().length ? 'mail' : 'home', after: refreshHome });
  }

  const room = $('#room', n);
  const decorEls = [];
  if (room) {
  const dscale = Math.max(2, Math.round(scale * 0.72));
  s.decorPos = s.decorPos || {};
  s.owned.filter((id) => ITEMS[id] && ITEMS[id].cat === 'decor' && !s.decorHidden.includes(id)).forEach((id) => {
    const it = ITEMS[id];
    const c = document.createElement('canvas');
    drawGrid(c, artGrid(it.art, it.pal), dscale);
    const wrap = document.createElement('div');
    wrap.className = 'decor';
    wrap.dataset.id = id;
    const pos = DECOR_POS[it.spot] || 'left:10%;bottom:10%';
    const saved = s.decorPos[id];
    if (pos === 'curtain') {
      // the curtains hang on the window and are sized to it
      wrap.classList.add('curtain');
      wrap.style.cssText = `left:${(ROOM_WINDOW.x0 + ROOM_WINDOW.x1) * 50}%;top:${ROOM_WINDOW.y0 * 100 - 4}%;width:${(ROOM_WINDOW.x1 - ROOM_WINDOW.x0) * 100 + 12}%;transform:translateX(-50%);z-index:1`;
    } else {
      wrap.classList.add('movable');
      if (saved) wrap.style.cssText = `left:${saved.x}%;top:${saved.y}%`;
      else if (it.spot === 'rug' || it.spot === 'under') wrap.style.cssText = `left:50%;bottom:${it.spot === 'rug' ? 2 : 3}%;transform:translateX(-50%)`;
      else wrap.style.cssText = pos;
      if (it.spot === 'rug' || it.spot === 'under') wrap.classList.add('flat');
      decorEls.push(wrap);
    }
    wrap.appendChild(c);
    room.appendChild(wrap);
  });
  }

  // things lower down the room stand in front of things further back
  const depth = (el) => {
    if (el.classList.contains('flat')) return 1;
    return 2 + Math.round(((el.offsetTop + el.offsetHeight) / room.clientHeight) * 100);
  };
  // turn the starting spot into left/top percentages, kept inside the room
  const pin = (el) => {
    const W = room.clientWidth, H = room.clientHeight;
    const x = Math.max(0, Math.min(W - el.offsetWidth, el.offsetLeft));
    const y = Math.max(0, Math.min(H - el.offsetHeight, el.offsetTop));
    el.style.cssText = `left:${(x / W) * 100}%;top:${(y / H) * 100}%`;
    el.style.zIndex = depth(el);
    return { x: +((x / W) * 100).toFixed(2), y: +((y / H) * 100).toFixed(2) };
  };

  // ----- the kitten walks around the house (arrow keys or the on-screen arrows) -----
  const ground = $('#ground', n);
  let cat = { x: 50, y: (s.owned.includes('rug') && !s.decorHidden.includes('rug')) ? 4 : 3, ...(s.catPos || {}) };
  const placeCat = () => {
    if (!room) return;
    const halfW = room.clientWidth ? (kflip.offsetWidth / 2 / room.clientWidth) * 100 : 10;
    cat.x = Math.max(halfW, Math.min(100 - halfW, cat.x));
    cat.y = Math.max(1, Math.min(30, cat.y));
    ground.style.left = cat.x + '%';
    ground.style.bottom = cat.y + '%';
    ground.style.zIndex = 2 + Math.round(100 - cat.y);
  };
  const held = new Set();
  let raf = 0, lastT = 0;
  const walk = (t) => {
    if (!ground.isConnected) { held.clear(); raf = 0; return; }
    const dt = Math.min(0.05, (t - (lastT || t)) / 1000); lastT = t;
    let dx = 0, dy = 0;
    if (held.has('left')) dx -= 1; if (held.has('right')) dx += 1;
    if (held.has('up')) dy += 1; if (held.has('down')) dy -= 1;
    cat.x += dx * 32 * dt; cat.y += dy * 22 * dt;
    if (dx) kv.setFacing(dx < 0);
    placeCat();
    if (held.size) raf = requestAnimationFrame(walk);
    else { raf = 0; lastT = 0; kv.canvas.classList.remove('walking'); s.catPos = { x: +cat.x.toFixed(1), y: +cat.y.toFixed(1) }; S.save(); }
  };
  const press = (d) => {
    if (md.face === 'faint') return;          // a fainted kitten can't walk
    held.add(d); kv.canvas.classList.add('walking');
    if (!raf) raf = requestAnimationFrame(walk);
  };
  const release = (d) => held.delete(d);
  const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  if (room) {
    const kd = (e) => {
      if (!ground.isConnected) { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); return; }
      const d = KEYS[e.key]; if (!d || !document.querySelector('#modal').classList.contains('hidden')) return;
      e.preventDefault(); press(d);
    };
    const ku = (e) => { const d = KEYS[e.key]; if (d) release(d); };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    window.addEventListener('blur', () => held.clear(), { once: true });
    $('#dpad', n).querySelectorAll('button').forEach((b) => {
      const d = b.dataset.d;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('down'); press(d); });
      const up = () => { b.classList.remove('down'); release(d); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    // ----- move furniture: tap the button, then drag things around -----
    let arranging = false;
    const ab = $('#b-arrange', n);
    if (!decorEls.length) ab.style.display = 'none';
    ab.onclick = () => {
      arranging = !arranging;
      room.classList.toggle('arranging', arranging);
      ab.innerHTML = arranging ? '<span class="zh">✅ 摆好了</span> Done' : '<span class="zh">🪑 摆家具</span> Move furniture';
      if (arranging) { sfx.click(); toast('<span class="zh">按住家具拖一拖！</span> Drag the furniture to move it'); }
      else { S.save(); sfx.coin(); }
    };
    decorEls.forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        if (!arranging) return;
        e.preventDefault(); el.setPointerCapture(e.pointerId);
        pin(el);
        const W = room.clientWidth, H = room.clientHeight;
        const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop;
        el.classList.add('dragging'); el.style.zIndex = 200;
        const mv = (ev) => {
          const x = Math.max(0, Math.min(W - el.offsetWidth, ox + ev.clientX - sx));
          const y = Math.max(0, Math.min(H - el.offsetHeight, oy + ev.clientY - sy));
          el.style.left = (x / W) * 100 + '%'; el.style.top = (y / H) * 100 + '%';
        };
        const end = () => {
          el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', end); el.removeEventListener('pointercancel', end);
          el.classList.remove('dragging');
          s.decorPos[el.dataset.id] = pin(el);
          S.saveQuiet();
        };
        el.addEventListener('pointermove', mv); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
      });
    });
  }

  function petKitten() {
    const face = md.face;
    meow(face);
    const sad = ['faint', 'dizzy', 'cough', 'cry', 'hungry', 'thirsty', 'bored', 'sleepy'].includes(face);
    if (!sad) { kv.flash('happy', 1400); kv.jump(); }
    const EMO = { happy: ['😊', '喵～最喜欢你了！'], normal: ['😺', '喵～'], cry: ['😿', '喵呜…快做任务吧'], hungry: ['😿', '喵…好饿'], thirsty: ['🥵', '喵…想喝水'],
      cough: ['🤒', '喵…咳咳'], dizzy: ['😵‍💫', '喵…头好晕'], faint: ['😵', '……'], bored: ['🥱', '喵～陪我玩'], sleepy: ['😴', '喵…困了'] };
    const [emoji, words] = EMO[face] || EMO.normal;
    const pop = document.createElement('div');
    pop.className = 'emo-pop'; pop.innerHTML = `<span class="e">${emoji}</span><span class="w">${esc(words)}</span>`;
    fx.appendChild(pop);
    const bubbles = [...kwrap.querySelectorAll('.bubble')]; bubbles.forEach((b) => { b.style.visibility = 'hidden'; });
    setTimeout(() => { pop.remove(); bubbles.forEach((b) => { b.style.visibility = ''; }); }, 1800);
    burst(fx, 'heart', sad ? 2 : 4, '50%', '30%');
    S.pet();
    afterCare();
  }
  function afterCare() {
    const got = S.checkDaily();
    got.forEach((g, i) => setTimeout(() => toast(g.label, { coins: g.coins }), i * 700));
    if (got.length) setTimeout(() => refreshHome(), 1600);
  }

  wireActivities(n, refreshHome);
  $('#b-tasks', n).onclick = () => go('tasks');
  $('#b-review', n).onclick = () => { sfx.unlock(); go('spell', { mode: 'review' }); };
  $('#b-shop', n).onclick = () => go('shop');
  $('#b-dress', n).onclick = () => go('wardrobe');

  // a parent has checked a composition: show the stars, coins and comment once
  // (a checked composition now arrives as a phone notification instead of a pop-up)
  const bh = $('#b-house', n); if (bh) bh.onclick = () => (inHouse ? goBack() : go('home', { view: 'house' }));
  $('#b-feed', n).onclick = () => openFeed(kv, fx, afterCare);
  $('#b-friends', n).onclick = () => go('friends');
  n._mounted = () => { if (inHouse) { drawRoom($('#roombg', n)); drawRoof($('#roof', n)); decorEls.forEach((el) => { el.style.zIndex = depth(el); }); placeCat(); } };
  return n;
}

// warnings / sickness / play prompt at the top of the side panel
function renderAlert(box, md, k) {
  const name = esc(k.name), missed = S.missedDays();
  const card = (cls, title, body, btn) => {
    box.innerHTML = `<div class="card alert ${cls}"><div class="h-title" style="font-size:21px">${title}</div><p class="help" style="margin:4px 0 10px">${body}</p>${btn}</div>`;
    hydrateIcons(box);
  };
  const daysLeft = (stage) => S.SICK_AFTER[stage] - missed;
  if (md.face === 'faint') {
    const cost = S.price('hospital'), can = S.get().coins >= cost, left = Math.max(1, daysLeft('dead'));
    card('danger', `😵 ${name}晕倒了！<span class="en">Fainted</span>`,
      `${name}已经${missed}天没有人照顾了。快送去医院！再过${left}天就救不回来了。<br>Your kitten fainted after ${missed} days without tasks. Take it to the hospital — only ${left} day${left > 1 ? 's' : ''} left!`,
      `<button class="btn big red block" id="hosp" ${can ? '' : 'disabled'}>🏥 <span class="zh">送医院</span> Hospital · ${cost}${coinI(20)}</button>${can ? '' : `<p class="help" style="margin:8px 0 0">金币不够：做听写赚金币 · Not enough coins — do spelling to earn ${cost - S.get().coins} more.</p>`}`);
    const b = $('#hosp', box);
    if (b) b.onclick = async () => {
      if (!(await confirmBox(`送${name}去医院？`, `Spend ${cost} coins to make ${name} better?`, '送医院 Go', '取消 Cancel'))) return;
      if (S.treat('hospital')) { sfx.fanfare(); confetti(); toast(`<span class="zh">${name}康复了！</span> Back to health!`, { ms: 3500 }); refreshHome(); }
    };
  } else if (md.face === 'dizzy' || md.face === 'cough') {
    const med = md.face === 'dizzy' ? 'panadol' : 'syrup', it = ITEMS[med];
    card('warn', md.face === 'dizzy' ? `😵‍💫 ${name}头晕了 <span class="en">Dizzy</span>` : `🤒 ${name}咳嗽了 <span class="en">Coughing</span>`,
      `${name}已经${missed}天没做任务，生病了。去药房买${it.name}，再每天做任务！<br>Missed ${missed} days of tasks. Buy ${it.en.toLowerCase()} from the pharmacy, and do your daily tasks to keep ${name} well.`,
      `<button class="btn big block" id="med">💊 <span class="zh">去药房</span> Pharmacy · ${S.price(med)}${coinI(20)}</button>`);
    $('#med', box).onclick = () => go('shop', { tab: 'pharmacy' });
  } else if (md.face === 'bored') {
    card('play', `🎮 ${name}好无聊！<span class="en">Bored</span>`,
      `复习10个以前的词语，写对8个得${S.PLAY_REWARD}金币！<br>Revise 10 old words — get 8 right to win ${S.PLAY_REWARD} coins!`,
      `<button class="btn big green block" id="play">🎮 Play with Me!</button>`);
    $('#play', box).onclick = () => { sfx.unlock(); go('spell', { mode: 'play' }); };
  } else if (missed >= 1) {
    const left = daysLeft('cough');
    card('warn', `⚠️ <span class="zh">${missed}天没做任务了</span>`,
      `再过${left}天不做任务，${name}会生病哦！<br>${missed} day${missed > 1 ? 's' : ''} without tasks — ${name} gets ill after ${S.SICK_AFTER.cough}. Do a task today!`, '');
  } else box.remove();
}

// ---------- graveyard ----------
function graveScreen() {
  const s = S.get(), k = s.kitten;
  const n = html`<section class="screen"><div class="grave">
      <div class="night"></div>
      <div class="stone" id="stone"></div>
      <div class="card stack" style="max-width:560px;text-align:center;align-items:center">
        <div class="h-title" style="justify-content:center"><span class="zh">${esc(k.name)}回到喵星了…</span></div>
        <p class="help">${S.SICK_AFTER.dead}天没有人照顾，${esc(k.name)}离开了。<br>After ${S.SICK_AFTER.dead} days without any tasks, ${esc(k.name)} has gone back to the cat stars.</p>
        <p class="help">每天做任务，好好照顾新的小猫吧！<br>Look after your next kitten by doing your daily tasks.</p>
        <button class="btn big" id="restart">↻ Restart · <span class="zh">重新开始</span></button>
      </div>
    </div></section>`;
  const t = document.createElement('canvas');
  drawGrid(t, artGrid(TOMB.art, TOMB.pal), Math.max(7, Math.min(15, Math.floor(window.innerHeight / 60))));
  $('#stone', n).appendChild(t);
  $('#stone', n).appendChild(html`<div class="stone-name">${esc(k.name)}</div>`);
  $('#restart', n).onclick = () => { S.restartKitten(); go('setup'); };
  return n;
}

function openFeed(kv, fx, afterCare) {
  const s = S.get();
  const foods = Object.entries(s.pantry).filter(([id, c]) => c > 0 && ITEMS[id]);
  const toys = s.owned.filter((id) => ITEMS[id] && ITEMS[id].toy);
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
      setTimeout(() => refreshHome(), 1700);
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
// browsers only allow sound after the first touch
document.addEventListener('pointerdown', () => sfx.unlock(), { once: true, capture: true });
paintSky(true);
S.tick();
setInterval(() => S.tick(), 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { S.tick(); if (current === 'home') refreshHome(); } });
// the kitten tells a joke now and then while she's on the home page
setInterval(() => {
  if (current !== 'home' || document.hidden || !$('#modal').classList.contains('hidden') || Math.random() < 0.4) return;
  const kw = $('#kwrap'); if (!kw || kw.querySelector('.bubble.joke-pop')) return;
  const old = [...kw.querySelectorAll('.bubble')]; old.forEach((b) => { b.style.visibility = 'hidden'; });
  const j = html`<div class="bubble joke joke-pop">😹 ${esc(randomJoke())}</div>`;
  kw.appendChild(j);
  setTimeout(() => { j.remove(); old.forEach((b) => { b.style.visibility = ''; }); }, 9000);
}, 45000);
// friends: show what arrived, and keep the home page badges fresh
Friends.startFriends((news) => {
  news.forEach((x, i) => setTimeout(() => {
    if (x.kind === 'feed') toast(`🐟 <span class="zh">${esc(x.fromName)}喂了你的小猫！</span> A friend fed your kitten`, { ms: 3500 });
    if (x.kind === 'letter') toast(`✉️ <span class="zh">${esc(x.fromName)}给你写了信！</span> You got a letter`, { ms: 3500 });
    if (x.kind === 'gift') toast(`🎁 <span class="zh">${esc(x.fromName)}送你礼物！</span> You got a gift`, { ms: 3500 });
  }, i * 900));
  if (current === 'home') setTimeout(refreshHome, 400);
});
let lastReq = 0;
Friends.onFriends(() => { const r = Friends.incomingRequests().length; if (r !== lastReq) { lastReq = r; if (current === 'home') refreshHome(); } });
// another tab changed the game: show the new state on calm pages
S.onExternalChange(() => {
  if (['home', 'shop', 'wardrobe'].includes(current) && !document.querySelector('.room.arranging')) go(current, currentParams, { replace: true });
});
// cloud backup & sync: if another device saved newer progress, show it
Cloud.init(() => {
  if (current === 'spell' || current === 'login') return;   // don't interrupt a spelling round
  go(S.get().onboarded ? (current === 'welcome' || current === 'setup' ? 'home' : current) : 'welcome', currentParams, { replace: true });
});
if (!Auth.session()) go('login');
else { go(S.get().onboarded ? 'home' : 'welcome'); Cloud.pull(); }

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// prevent iOS double-tap zoom & pinch
document.addEventListener('gesturestart', (e) => e.preventDefault());
