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
import { APP_VERSION } from './version.js';
import * as Weather from './weather.js';
let pendingNotes = null, notesDismissed = false;   // a newer version is waiting: its "what's new" lines
import * as Auth from './auth.js';
import * as Friends from './friends.js';
import { openPhone, PHONE_ICON } from './phone.js';
import { HOUSE, fitHouse as fitHouseBox, houseK, roomLayout, decorEl, chatBar, say, chatLog, wirePlayable, applyPower, wirePower, emoteIcon, seatSpot, blanket, catFace, freeSlot, compressPhoto, PetLayer, roomArrowsHtml, inPool, stackDecor, studioBarre } from './house.js';
import * as Pets from './pets.js';
import * as Radio from './radio.js';
import * as Visit from './visit.js';
import { randomJoke } from './jokes.js';
import { practiceListScreen, practiceScreen, KINDS } from './practice.js';

const app = $('#app');
let current = null;

// ---------- background ----------
// 6pm to 5am (this device's clock): night sky with stars and the moon
export function isNight(d = new Date()) { return d.getHours() >= 18 || d.getHours() < 5; }
// real weather where she is (parents can switch it off; this phone asks for its location once)
const weatherOn = () => S.get().settings.weatherOff !== true;
const weatherKind = () => (weatherOn() ? Weather.current() : null);
function updateWeather(force) {
  if (!weatherOn() || !Weather.allowed()) return;
  const before = weatherKind();
  Weather.refresh(force).then(() => { if (weatherKind() !== before) { paintSky(true); if (current === 'home') refreshHome(); } });
}
setTimeout(() => updateWeather(), 2500);
setInterval(() => { if (!document.hidden) updateWeather(); }, 30 * 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateWeather(); });
let skyKey = '';
function paintSky(force) {
  const portrait = window.innerHeight > window.innerWidth || window.innerWidth <= 900;
  const wx = weatherKind();
  const key = `${window.innerWidth}x${window.innerHeight}${isNight() ? 'n' : 'd'}${wx || ''}`;
  if (!force && key === skyKey) return;
  skyKey = key;
  drawLandscape($('#sky'), { horizon: portrait ? 0.4 : 0.5, seed: 7, night: isNight(), moonX: window.innerWidth <= 600 ? 0.8 : 0.34, moonY: window.innerWidth <= 600 ? 0.36 : 0.2, weather: wx });
  Weather.paintOverlay(wx);
  document.body.classList.toggle('night', isNight());
}
let nightNow = isNight();
setInterval(() => { if (isNight() !== nightNow) { nightNow = isNight(); paintSky(true); if (current === 'home') refreshHome(); } }, 60000);
window.addEventListener('resize', () => { clearTimeout(paintSky.t); paintSky.t = setTimeout(() => { paintSky(); if (current === 'home') refreshHome(); }, 200); });

// ---------- router ----------
const screens = {
  welcome: welcomeScreen,
  login: loginScreen,
  setup: setupScreen,
  home: (p) => homeScreen(p),
  spell: (p) => spellingScreen({ ...p, go }),
  shop: (p) => shopScreen({ go, ...p }),
  wardrobe: (p) => wardrobeScreen({ ...p, go }),
  visit: (p) => Visit.visitScreen({ ...p, go }),
  parent: (p) => { p.go = go; return parentScreen(p); },
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
  if (!(name === 'home' && params.view === 'house')) Radio.stop();   // the radio plays only while she's in her house
  // leaving the parent area while looking after a child's account: switch back to her own account first
  if (Cloud.managing() && name !== 'parent') { app.style.opacity = '.5'; Cloud.stopManaging().finally(() => { app.style.opacity = ''; go(name, params, opts); }); return; }
  if (!opts.back && !opts.replace && current && !NO_HISTORY.includes(current)) {
    const same = current === name && JSON.stringify(params) === JSON.stringify(currentParams);
    if (name === 'home' && !params.view) stack.length = 0;          // the main page is the bottom of the stack
    else if (!same) { stack.push({ name: current, params: currentParams }); if (stack.length > 20) stack.shift(); }
  }
  if (NO_HISTORY.includes(name)) stack.length = 0;
  if (!(name === 'home' && params.view === 'house')) houseChat.length = 0;   // left the house: its chat history goes
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
  if (name === 'home' && pendingNotes && !notesDismissed) setTimeout(() => { if (current === 'home') showUpdateNotice(); }, 1500);
}
function refreshHome() { if (homeRedrawWaits()) return; go('home', current === 'home' ? currentParams : {}, { replace: true }); }
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
// while she walks the kitten (or drags furniture), redraws of the home page wait until she lets go
let homeBusy = false, homeRedrawLater = false, hostRoomNow = 'living', roomPower = null;
// chat in my own house: kept while I stay in the house (redraws keep it), cleared when I leave
const houseChat = []; let houseLog = null;
function homeRedrawWaits() { if (homeBusy && current === 'home') { homeRedrawLater = true; return true; } return false; }
function setHomeBusy(b) {
  homeBusy = b;
  if (!b && homeRedrawLater) { homeRedrawLater = false; setTimeout(() => { if (!homeBusy && current === 'home') go('home', currentParams, { replace: true }); }, 50); }
}

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
    const icon = st === 'done-today' || st === 'day-limit' ? '✅' : st === 'locked' ? '🔒' : l.id === cur.id ? '⭐' : '📝';
    const note = st === 'done-today' ? ' · 今天写过了' : st === 'day-limit' ? ' · 明天再写' : st === 'locked' ? ' · 先写新的' : l.id === cur.id ? (l.done ? '' : ' · 新!') : '';
    return `${icon} ${l.name} (${date(l)})${note}`;
  };
  const st = S.listStatus(sel);
  const ok = st === 'open';
  return `<div class="spell-pick card">
      <label class="pick-label"><span class="zh">选听写</span> Choose a list
        <select id="list-pick">${lists.map((l) => `<option value="${l.id}" ${l.id === sel.id ? 'selected' : ''}>${esc(label(l))}</option>`).join('')}</select></label>
      <button class="btn big block col ${ok ? '' : 'dim'}" id="b-spell"><span class="zh">${ok ? '✏️ 开始听写' : st === 'done-today' ? '✅ 今天写过了' : st === 'day-limit' ? '✅ 今天的听写做完了' : '🔒 先写新的听写'}</span><span class="en">${ok ? `Start · ${esc(sel.name)}` : st === 'done-today' ? 'Done today — come back tomorrow' : st === 'day-limit' ? 'All done for today — come back tomorrow' : `Finish “${esc(cur.name)}” first`}</span></button>
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
    if (st === 'day-limit') return toast('<span class="zh">今天的听写做完了！</span> That\'s all the spelling for today — come back tomorrow', { ms: 3500 });
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

// home page buttons (parents choose the order)
function menuButton(b, { reviewN, inHouse }) {
  const out = S.outstandingEssays().length, req = Friends.incomingRequests().length;
  switch (b) {
    case 'tasks': return `<button class="btn ${out ? 'pink has-badge' : 'green'}" id="b-tasks"><span class="zh">📋 功课</span><span class="en">Tasks</span>${out ? `<i class="badge">${out}</i>` : ''}</button>`;
    case 'review': return `<button class="btn pink" id="b-review" ${reviewN ? '' : 'disabled'}><span class="zh">错词本</span><span class="en">Mistakes (${reviewN})</span></button>`;
    case 'shop': return '<button class="btn blue" id="b-shop"><span class="zh">商店</span><span class="en">Shop</span></button>';
    case 'dress': return '<button class="btn white" id="b-dress"><span class="zh">🎒 我的物品</span><span class="en">My items</span></button>';
    case 'house': return S.unlocked('decor')
      ? (inHouse ? '<button class="btn green" id="b-house"><span class="zh">🌳 去草地</span><span class="en">Go outside</span></button>'
                 : '<button class="btn green" id="b-house"><span class="zh">🏠 我的家</span><span class="en">Go to Home</span></button>')
      : `<button class="btn white" disabled><span class="zh">🔒 我的家</span><span class="en">Home · Lv${S.UNLOCKS.decor}</span></button>`;
    case 'friends': return `<button class="btn blue ${req ? 'has-badge' : ''}" id="b-friends"><span class="zh">👫 朋友</span><span class="en">Friends</span>${req ? `<i class="badge">${req}</i>` : ''}</button>`;
    default: return '';
  }
}
// ---------- pets: tap a pet or a cage ----------
let homePets = null;
const PET_ICON = { dog: '🐶', guineapig: '🐾', hamster: '🐹', rabbit: '🐰', parrot: '🦜' };
export function petArtCanvas(kind, scale = 5) { const c = document.createElement('canvas'); drawGrid(c, artGrid(ITEMS[kind].art, ITEMS[kind].pal), scale); return c; }
function petMenu(kind) {
  const p = S.petOf(kind); if (!p) return;
  const it = ITEMS[kind], caged = !!it.cage, cage = caged && S.petCage(kind);
  sfx.click();
  const box = html`<div class="card stack pet-card" style="align-items:center;text-align:center">
      <div class="h-title" style="justify-content:center"><span class="zh">${PET_ICON[kind]} ${esc(p.name)}</span><span class="en">${esc(it.en)}</span></div>
      <div class="pet-art" id="pa"><div class="fx-layer" id="pfx"></div></div>
      <div class="row" style="flex-wrap:wrap;justify-content:center">
        <button class="btn pink" id="pat">🤍 <span class="zh">摸摸</span> Pat</button>
        ${caged && cage && !it.stayIn ? '<button class="btn blue" id="back">🏠 <span class="zh">放回笼子</span> Put back in cage</button>' : ''}
        <button class="btn white" id="ren">✏️ <span class="zh">改名字</span> Rename</button>
      </div>
      ${caged && !cage ? '<p class="help" style="margin:0">把笼子摆进房间，就可以把它放回去。<br>Put its cage in a room to keep it in there.</p>' : ''}
      <button class="btn white" id="pc">关闭 Close</button>
    </div>`;
  $('#pa', box).appendChild(petArtCanvas(kind, 6));
  $('#pat', box).onclick = () => { sfx.coin(); burst($('#pfx', box), 'heart', 3, '50%', '30%'); };
  const back = $('#back', box);
  if (back) back.onclick = () => { Pets.putBack(kind); closeModal(); toast(`🏠 <span class="zh">${esc(p.name)}回到笼子里了</span> Back in the cage`); refreshHome(); Visit.hostResendHouse(); };
  $('#ren', box).onclick = () => { closeModal(); askPetName(kind, p.name).then((nm) => { if (nm) { S.renamePet(kind, nm); Pets.refreshPets(); toast(`✏️ ${esc(nm)}`); } }); };
  $('#pc', box).onclick = closeModal;
  openModal(box);
}
// 📻 the radio's song: choose an mp3 from this device (kept on this device only)
async function radioMenu() {
  await Radio.moveOldSong();
  const song = Radio.mySong();
  sfx.click();
  const box = html`<div class="card stack" style="align-items:center;text-align:center">
      <div class="h-title" style="justify-content:center"><span class="zh">📻 收音机</span><span class="en">Radio</span></div>
      <p class="help" style="margin:0" id="rs">${song ? `🎵 <b>${esc(song.name)}</b>` : '还没有歌。选一首你喜欢的歌吧！<br>No song yet — pick one you like.'}</p>
      <label class="btn blue">🎵 <span class="zh">${song ? '换一首歌' : '选一首歌'}</span> ${song ? 'Change song' : 'Choose a song'}<input type="file" accept="audio/*,.mp3" hidden></label>
      <div class="row">${song ? `<button class="btn green" id="rp">${Radio.isPlaying() ? '⏹ <span class="zh">停</span> Stop' : '▶️ <span class="zh">播放</span> Play'}</button><button class="btn white" id="rx">🗑 <span class="zh">删掉</span> Remove</button>` : ''}</div>
      <p class="help" style="margin:0;font-size:13px">最多 10MB。你的所有设备都能放，来串门的朋友也听得到。点收音机就能开关音乐。<br>Up to 10 MB. It plays on all your devices, and friends visiting can hear it. Tap the radio to switch it on and off.</p>
      <button class="btn white" id="rc">关闭 Close</button>
    </div>`;
  const msg = $('#rs', box);
  box.querySelector('input[type=file]').onchange = async (ev) => {
    const f = ev.target.files && ev.target.files[0]; if (!f) return;
    msg.textContent = '上传中… Uploading…';
    try {
      await Radio.setSong(f); await Radio.play(); sfx.coin(); closeModal();
      toast(`📻 <span class="zh">正在播放</span> ${esc(f.name.replace(/\.[^.]+$/, ''))}`, { ms: 2500 });
    } catch (x) {
      msg.innerHTML = x.message === 'too big' ? '这首歌太大了（最多 10MB）。<br>That song is too big (10 MB at most).' : x.message === 'signed out' ? '要先登录才能放歌。<br>Please log in first.' : '这个文件放不了，换一首试试。<br>That file didn\'t work — try another song.';
    }
  };
  const rp = $('#rp', box); if (rp) rp.onclick = async () => { await Radio.toggle(); closeModal(); };
  const rx = $('#rx', box); if (rx) rx.onclick = async () => { await Radio.removeSong(); closeModal(); toast('🗑 <span class="zh">歌删掉了</span> Song removed'); };
  $('#rc', box).onclick = closeModal;
  openModal(box);
}
function cageMenu(kind) {
  const p = S.petOf(kind), it = ITEMS[kind];
  const things = S.get().owned.filter((id) => ITEMS[id] && ITEMS[id].cat === 'petacc' && (ITEMS[id].cageFor || []).includes(kind));
  sfx.click();
  const box = html`<div class="card stack pet-card" style="align-items:center;text-align:center">
      <div class="h-title" style="justify-content:center"><span class="zh">${PET_ICON[kind]} ${p ? esc(p.name) : '空笼子'}</span><span class="en">${p ? (p.out ? 'Out exploring the house' : 'In the cage') : 'An empty cage'}</span></div>
      ${p && it.stayIn ? '<p class="help" style="margin:0">小鸟一直住在笼子里。<br>Your bird stays in its cage.</p>' : p ? (p.out ? '<button class="btn blue" id="back">🏠 <span class="zh">放回笼子</span> Put back in cage</button>'
        : '<button class="btn green" id="open">🚪 <span class="zh">打开笼门</span> Open the door</button>')
        : `<p class="help" style="margin:0">去商店领养一只${it.name}吧！<br>Adopt a ${it.en.toLowerCase()} in the shop to live here.</p><button class="btn blue" id="adopt">🛍️ <span class="zh">去领养</span> Adopt a pet</button>`}
      ${things.length ? `<div class="cage-things"><div class="help" style="margin:0">笼子里的东西 · Things in the cage (tap to take out / put in)</div>
        <div class="row" style="flex-wrap:wrap;justify-content:center">${things.map((id) => `<button class="cage-chip ${S.inCage(id) ? 'on' : ''}" data-id="${id}"><span class="art"></span><small>${ITEMS[id].name}</small><b>${S.inCage(id) ? '✓' : '—'}</b></button>`).join('')}</div></div>` : ''}
      <button class="btn white" id="pc">关闭 Close</button>
    </div>`;
  box.querySelectorAll('.cage-chip').forEach((c) => {
    c.querySelector('.art').appendChild(spriteCanvas(c.dataset.id, 36));
    c.onclick = () => { const now = S.toggleCageThing(c.dataset.id); sfx.click(); c.classList.toggle('on', now); c.querySelector('b').textContent = now ? '✓' : '—'; changedThings = true; };
  });
  let changedThings = false;
  const done = () => { closeModal(); if (changedThings) { refreshHome(); Visit.hostResendHouse(); } };
  const o = $('#open', box), b = $('#back', box), a = $('#adopt', box);
  if (o) o.onclick = () => { Pets.letOut(kind); sfx.coin(); closeModal(); toast(`🚪 <span class="zh">${esc(p.name)}跑出来玩了！</span> Tap it to put it back`, { ms: 3000 }); refreshHome(); Visit.hostResendHouse(); };
  if (b) b.onclick = () => { Pets.putBack(kind); closeModal(); refreshHome(); Visit.hostResendHouse(); };
  if (a) a.onclick = () => { closeModal(); go('shop', { tab: 'pets' }); };
  $('#pc', box).onclick = done;
  openModal(box);
}
// type a name for a pet (resolves to the name, or null)
export function askPetName(kind, current = '') {
  return new Promise((resolve) => {
    const it = ITEMS[kind];
    const box = html`<form class="card stack pet-card" style="align-items:center;text-align:center">
        <div class="h-title" style="justify-content:center"><span class="zh">${PET_ICON[kind]} 给${it.name}取个名字</span><span class="en">Name your ${it.en.toLowerCase()}</span></div>
        <div class="pet-art" id="pa"></div>
        <label class="field" style="width:100%;max-width:280px"><span><span class="zh">名字</span> · Name</span><input id="pn" maxlength="12" placeholder="${it.name}" value="${esc(current)}" autocomplete="off"></label>
        <div class="row"><button class="btn white" type="button" id="pc">取消 Cancel</button><button class="btn green" type="submit">✓ <span class="zh">好了</span> OK</button></div>
      </form>`;
    $('#pa', box).appendChild(petArtCanvas(kind, 6));
    let done = false;
    const finish = (v) => { if (done) return; done = true; closeModal(); resolve(v); };
    box.onsubmit = (e) => { e.preventDefault(); const v = $('#pn', box).value.trim(); finish(v || current || it.name); };
    $('#pc', box).onclick = () => finish(null);
    openModal(box);
    setTimeout(() => { const i = $('#pn', box); if (i) i.focus(); }, 50);
  });
}
function homeScreen(params = {}) {
  S.tick();
  S.essayNotifications();
  S.purgeOldMessages();
  const inHouse = params.view === 'house' && S.unlocked('decor');
  const roomKey = inHouse && S.roomOpen(params.room) ? S.roomInfo(params.room).key : 'living';
  const roomRI = S.roomInfo(roomKey);
  if (S.health() === 'dead') return graveScreen();
  if (S.get().needsSetup) return setupScreen();
  S.maybeBored();
  const s = S.get(), k = s.kitten, md = S.mood();
  const list = S.activeList();
  const reviewN = S.reviewWords().length;
  const d = s.daily;
  const portrait = window.innerHeight > window.innerWidth || window.innerWidth <= 900;
  // size the kitten to the room: the room is most of the stage under the roof
  const scale = inHouse
    ? HOUSE.kitten                                   // the house is drawn at one fixed size and shrunk/grown to fit, so it looks the same on every screen
    : (portrait ? Math.max(4, Math.min(7, Math.floor((window.innerHeight * 0.36) / 38))) : Math.max(5, Math.min(9, Math.floor((window.innerHeight * 0.5) / 38))));

  const task = (done, zh, en, coins, prog = '', key = '') => `
    <button type="button" class="task ${done ? 'done' : ''}" data-task="${key}">
      <span class="check">${done ? '✓' : ''}</span>
      <span><div class="t-zh">${zh}${prog ? ` <span class="prog">${prog}</span>` : ''}</div><div class="t-en">${en}</div></span>
      <span class="reward">+${coins}${coinI(18)}<i class="go">›</i></span>
    </button>`;

  const n = html`<section class="home ${inHouse ? 'house-view' : ''}">
    <div class="stage ${inHouse ? 'in-house' : ''}" id="stage">
      ${inHouse ? `<div class="house" id="house"><div class="house-unit ${roomRI.outdoor ? 'outdoor' : ''} ${roomRI.bare || roomRI.noRoof ? 'bare' : ''}" id="hunit">
        <canvas class="roof" id="roof"></canvas>
        <div class="room-name">${S.roomInfo(roomKey).icon} <span class="zh">${S.roomInfo(roomKey).zh}</span> ${S.roomInfo(roomKey).en}</div>
        <div class="room" id="room" data-room="${roomKey}">
          <canvas class="room-bg" id="roombg"></canvas>

          <div class="ground" id="ground"><div class="kitten-wrap" id="kwrap"><div class="fx-layer" id="fx"></div></div></div>
        </div>
      </div>${roomArrowsHtml(roomKey, S.roomOpen)}</div><div class="house-tools" id="htools">
          <button class="tool-btn store-btn" id="b-store" title="Storage">📦<b id="store-n"></b></button>
          <button class="tool-btn reno-btn" id="b-reno" title="Renovate">🎨</button>
          <button class="tool-btn" id="b-arrange" title="Move furniture">🪑</button>
          <button class="tool-btn light-switch ${S.roomDark(roomKey) ? 'off' : ''}" id="b-light" title="Lights" aria-label="Lights">💡</button>
          <button class="tool-btn" id="b-invite" title="Invite a friend" aria-label="Invite a friend">📨</button>
        </div><div class="house-log-wrap" id="hlog"><div class="dpad" id="dpad">
            <button data-d="up" aria-label="Up">▲</button><button data-d="left" aria-label="Left">◀</button><button data-d="down" aria-label="Down">▼</button><button data-d="right" aria-label="Right">▶</button>
          </div></div><div class="house-chat-wrap" id="hchat"></div>` : `<div class="ground" id="ground"><div class="kitten-wrap" id="kwrap"><div class="fx-layer" id="fx"></div></div></div>`}
    </div>
    <div class="side">
      <div id="alert"></div>
      <div class="card stack" style="gap:8px">
        <div class="stat"><span><i data-icon="fish" data-size="22"></i></span><span>饱饱 <span class="en">Food</span></span><div class="bar segmented"><i style="width:${k.hunger}%;--c:#f59b2a"></i></div></div>
        <div class="stat"><span style="font-size:20px;text-align:center">💧</span><span>喝水 <span class="en">Water</span></span><div class="bar segmented"><i style="width:${k.water ?? 75}%;--c:#4fb3ef"></i></div></div>
        <button type="button" class="stat stat-btn" data-info="happy" aria-label="What makes the kitten happy"><span>${'<i data-icon="heart" data-size="22"></i>'}</span><span>开心 <span class="en">Happy</span></span><div class="bar segmented"><i style="width:${k.happy}%;--c:#ff6f9c"></i></div><b class="info-i">i</b></button>
        <button type="button" class="stat stat-btn" data-info="hygiene" aria-label="What keeps the kitten clean"><span style="font-size:20px;text-align:center">🛁</span><span>干净 <span class="en">Hygiene</span></span><div class="bar segmented"><i style="width:${k.hygiene ?? 100}%;--c:#9b7bea"></i></div><b class="info-i">i</b></button>
        <div class="stat"><span style="font-family:var(--px);font-weight:700">Lv</span><span>等级 ${S.level()}</span><div class="bar xp-bar"><i style="width:${S.levelProgress() * 100}%;--c:#6cb6f2"></i><b>${S.xpIntoLevel()}/${S.xpPerLevel()} XP</b></div></div>
        ${S.nextUnlock() ? `<div class="next-unlock">🔓 Lv${S.nextUnlock().level} 解锁 ${S.nextUnlock().name}</div>` : ''}
      </div>
      <div class="card">
        <div class="h-title" style="font-size:22px;margin-bottom:8px"><span class="zh">今日任务</span><span class="en">Daily tasks</span></div>
        <div class="tasks">
          ${S.dailyTasks().map((t) => task(t.done, esc(t.zh), esc(t.en), t.coins, t.key === 'perfect' ? `写了${d.tried} · 对${d.right}` : '', t.key)).join('') || '<p class="help" style="margin:0">今天没有任务，好好玩吧！ No tasks today.</p>'}
        </div>
        ${S.dailyTasks().length ? `<div class="bonus-line" style="margin-top:8px">${d.paid.bonus ? '🎉 全部完成！All done today!' : S.dailyBonus() ? `全部完成再得 +${S.dailyBonus()} 🪙 bonus` : '全部完成吧！ Finish them all!'}</div>` : ''}
      </div>
      ${S.homeActs().length ? `<div class="home-acts">${S.homeActs().map((k) => (k === 'spelling' ? spellPicker() : activityButton(k))).join('')}</div>` : ''}
      <div class="menu-grid">
        ${S.menuOrder().map((b) => menuButton(b, { reviewN, inHouse })).join('')}
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
  else if (inHouse) { /* in the house she only talks when you type something to say */ }
  else if (greetNow()) { const g = greetNow(); kwrap.appendChild(html`<div class="bubble greet">${g.icon} ${esc(g.zh)}<br><small>${esc(g.en)}</small></div>`); }
  else if (md.face === 'dizzy') kwrap.appendChild(html`<div class="bubble sad">😵‍💫 ${esc(md.text)}</div>`);
  else if (md.face === 'cough') kwrap.appendChild(html`<div class="bubble sad">🤒 ${esc(md.text)}</div>`);
  else if (S.phoneBadge()) kwrap.appendChild(html`<div class="bubble">📱 你有新消息！<br><small>You have a new message!</small></div>`);
  else if (md.dirty) kwrap.appendChild(html`<div class="bubble ${(k.hygiene ?? 100) < 20 ? 'sad' : ''}">🛁 ${esc(md.text)}</div>`);
  else if (md.essay) kwrap.appendChild(html`<div class="bubble">✍️ ${esc(md.text)}</div>`);
  else if (md.face === 'bored') kwrap.appendChild(html`<div class="bubble">🥱 ${esc(md.text)}</div>`);
  else if (md.face === 'cry') kwrap.appendChild(html`<div class="bubble sad">😿 ${esc(md.text)}</div>`);
  else if (md.face === 'thirsty') kwrap.appendChild(html`<div class="bubble">💧 ${esc(md.text)}</div>`);
  else if (md.face === 'hungry') kwrap.appendChild(html`<div class="bubble">🐟 ${esc(md.text)}</div>`);
  else if (md.face === 'sleepy') kwrap.appendChild(html`<div class="zzz">z Z z</div>`);
  else if (['rain', 'storm'].includes(weatherKind()) && Math.random() < 0.5) kwrap.appendChild(html`<div class="bubble">🌧️ 下雨了…我们在家学中文吧！</div>`);
  else if (weatherKind() === 'sun' && !isNight() && Math.random() < 0.4) kwrap.appendChild(html`<div class="bubble">☀️ 今天天气真好！</div>`);
  else if (Math.random() < 0.35) kwrap.appendChild(html`<div class="bubble joke">😹 ${esc(randomJoke())}</div>`);
  else if (s.childName && Math.random() < 0.6) kwrap.appendChild(html`<div class="bubble">${esc(s.childName)}，喵～</div>`);
  if (md.needs.length) kwrap.appendChild(html`<div class="needs">${md.needs.includes('hungry') ? '<span>🐟 饿了 Hungry</span>' : ''}${md.needs.includes('thirsty') ? '<span>💧 口渴 Thirsty</span>' : ''}${md.needs.includes('dirty') ? '<span>🛁 要洗澡 Bath time</span>' : ''}</div>`);
  const lvNow = S.level();
  if ((s.lastLevel || 1) < lvNow) {
    const from = s.lastLevel || 1; s.lastLevel = lvNow; S.save();
    const opened = Object.entries(S.UNLOCKS).filter(([, l]) => l > from && l <= lvNow);
    setTimeout(() => { sfx.fanfare(); toast(`⭐ <span class="zh">升级了！</span> Level ${lvNow}!`, { ms: 3500 }); }, 400);
    opened.forEach(([k], i) => setTimeout(() => toast(`🔓 <span class="zh">解锁：</span>${S.UNLOCK_NAMES[k]}`, { ms: 4500 }), 1300 + i * 900));
  } else if (!s.lastLevel) { s.lastLevel = lvNow; S.save(); }
  if (s.freezeUsed) { delete s.freezeUsed; S.save(); }   // streak freezes left from before still work, quietly

  renderAlert($('#alert', n), md, k);
  if (!$('#alert', n) && weatherOn() && Weather.supported() && !Weather.asked() && window.isSecureContext) {
    const box = document.createElement('div'); $('.side', n).prepend(box);
    box.innerHTML = `<div class="card alert wx-ask"><div class="h-title" style="font-size:21px">🌦️ <span class="zh">看看外面的天气？</span></div>
      <p class="help" style="margin:4px 0 10px">Let ${esc(k.name)} show the real weather outside — rain, sunshine or clouds. Your phone will ask to use your location.</p>
      <div class="row"><button class="btn green" id="wx-yes">好！ Yes</button><button class="btn white" id="wx-no">不用了 No thanks</button></div></div>`;
    $('#wx-yes', box).onclick = async () => { Weather.setAllowed(true); box.innerHTML = ''; toast('🌦️ <span class="zh">正在看天气…</span> Checking the weather…'); const kind = await Weather.refresh(true); paintSky(true); if (kind) refreshHome(); else if (!Weather.allowed()) toast('Location was not allowed — you can turn it on later in the Parent area', { ms: 4000 }); };
    $('#wx-no', box).onclick = () => { Weather.setAllowed(false); box.innerHTML = ''; };
  }

  // presents and letters from friends wait on the stage until she opens them
  // the flip phone (mail, notifications, tools) is always there; presents wait beside it
  {
    const gifts = S.unopenedGifts(), pb = S.phoneBadge();
    const tray = html`<div class="stage-tray">
        <button class="tray-btn phone-btn ${pb ? 'new' : ''}" id="t-phone" title="Phone">${PHONE_ICON}${pb ? `<i class="badge">${pb}</i>` : ''}</button>
        ${gifts.length ? `<button class="tray-btn gift" id="t-gift" title="Gifts">🎁<i class="badge">${gifts.length}</i></button>` : ''}
        <button class="tray-btn ${S.checkinStatus().claimed ? '' : 'gift'}" id="t-ck" title="Daily check-in">📅${S.checkinStatus().claimed ? '' : '<i class="badge">!</i>'}</button>
        <button class="tray-btn" id="t-shop" title="Shop" aria-label="Shop">🛍️</button>
        <button class="tray-btn" id="t-bag" title="My items" aria-label="My items">🎒</button>
      </div>`;
    $('#stage', n).appendChild(tray);
    const tg = $('#t-gift', tray); if (tg) tg.onclick = () => Friends.openGiftBox(S.unopenedGifts()[0], refreshHome);
    $('#t-ck', tray).onclick = () => openCheckin(refreshHome);
    $('#t-shop', tray).onclick = () => go('shop');
    $('#t-bag', tray).onclick = () => go('wardrobe');
    if (!S.checkinStatus().claimed && !checkinShown && S.get().onboarded) { checkinShown = true; setTimeout(() => { if (current === 'home' && $('#modal').classList.contains('hidden')) openCheckin(refreshHome); }, 1200); }
    $('#t-phone', tray).onclick = () => openPhone({ start: S.unreadNotifications().length ? 'noti' : S.unreadLetters().length ? 'mail' : 'home', after: refreshHome });
  }

  const room = $('#room', n);
  const decorEls = [];
  if (room) {
  roomLayout(s, roomKey, S.roomOf).forEach((e) => {
    const wrap = decorEl(e, { putAway: true }); if (!wrap) return;
    if (e.kind !== 'curtain') decorEls.push(wrap);
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
  let cat = { x: 50, y: (s.owned.includes('rug') && !s.decorHidden.includes('rug') && S.roomOf('rug') === roomKey) ? 4 : 3, ...(s.catPos || {}) };
  const seatNow = () => { const st = S.get().catSeat; return st && st.room === roomKey && room && room.querySelector(`.decor.seat[data-id="${st.id}"]`) ? st : null; };
  const placeCat = () => {
    if (!room) return;
    // sitting on the sofa / a chair, or lying in bed
    const st = seatNow(), spot = st && seatSpot(room, st.id, st.slot);
    ground.classList.toggle('lying', !!(spot && spot.lie)); ground.classList.toggle('seated', !!spot);
    kv.setPose(spot ? spot.pose : null); ground.dataset.pose = (spot && spot.pose) || '';
    if (spot && spot.run) { kv.setFacing(spot.flip); kv.canvas.classList.add('walking'); }   // running on the treadmill
    else if (spot) kv.canvas.classList.remove('walking');
    room.querySelectorAll('.decor.seat').forEach((d) => blanket(room, d.dataset.id, !!(spot && spot.lie && d.dataset.id === st.id)));
    if (spot) {
      ground.classList.remove('swimming');
      cat.x = spot.x; cat.y = spot.y;
      ground.style.left = cat.x + '%'; ground.style.bottom = cat.y + '%'; ground.style.zIndex = spot.z;
      return;
    }
    const halfW = room.clientWidth ? (kflip.offsetWidth / 2 / room.clientWidth) * 100 : 10;
    cat.x = Math.max(halfW, Math.min(100 - halfW, cat.x));
    cat.y = Math.max(1, Math.min(S.roomMaxY(roomKey), cat.y));
    ground.classList.toggle('swimming', inPool(room, cat.x, cat.y));   // in the pool: she swims
    ground.style.left = cat.x + '%';
    ground.style.bottom = cat.y + '%';
    ground.style.zIndex = 2 + Math.round(100 - cat.y);
  };
  const hostPos = () => ({ x: +cat.x.toFixed(1), y: +cat.y.toFixed(1), room: roomKey, left: !!kv.left, seat: (seatNow() || {}).id || null, slot: (seatNow() || {}).slot || 0 });
  // tap the sofa, a chair, the piano bench or the bed: she hops on (the arrows make her hop off)
  const sitOn = (id) => {
    // a free place: friends visiting may already be sitting there
    const taken = Visit.visitors.ids().map((v) => Visit.visitors.m.get(v)).filter((c) => c && c.room === roomKey).concat(Pets.seatedIn(roomKey));
    const mineNow = seatNow();
    if (mineNow && mineNow.id === id) return;
    const slot = freeSlot(id, taken);
    if (slot < 0) { sfx.miss(); return toast('<span class="zh">坐满了！</span> No room — someone is already there'); }
    S.get().catSeat = { id, room: roomKey, slot }; S.save();
    placeCat(); kv.jump(); sfx.click(); Visit.hostMove(hostPos());
    if (ITEMS[id].seat.lie) kv.flash('sleepy', 2500);
  };
  const standUp = () => {
    if (!seatNow()) return;
    S.get().catSeat = null;
    cat.y = Math.min(cat.y, 28);
    ground.classList.remove('lying', 'seated'); kv.setPose(null); ground.dataset.pose = ''; kv.canvas.classList.remove('walking');
    room.querySelectorAll('.blanket').forEach((b) => b.remove());
  };
  const held = new Set();
  let raf = 0, lastT = 0;
  const walk = (t) => {
    if (!ground.isConnected) { held.clear(); raf = 0; setHomeBusy(false); return; }
    const dt = Math.min(0.05, (t - (lastT || t)) / 1000); lastT = t;
    let dx = 0, dy = 0;
    if (held.has('left')) dx -= 1; if (held.has('right')) dx += 1;
    if (held.has('up')) dy += 1; if (held.has('down')) dy -= 1;
    cat.x += dx * 32 * dt; cat.y += dy * 22 * dt;
    if (dx) kv.setFacing(dx < 0);
    placeCat();
    S.get().catPos = { x: +cat.x.toFixed(1), y: +cat.y.toFixed(1) };   // remembered as she goes (saved when she stops)
    Visit.hostMove(hostPos());
    if (held.size) raf = requestAnimationFrame(walk);
    else { raf = 0; lastT = 0; kv.canvas.classList.remove('walking'); S.save(); setHomeBusy(false); Visit.hostMove(hostPos()); }
  };
  const press = (d) => {
    if (md.face === 'faint') return;          // a fainted kitten can't walk
    standUp();
    held.add(d); kv.canvas.classList.add('walking'); setHomeBusy(true);
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
      const down = () => { b.classList.add('down'); press(d); };
      const up = () => { b.classList.remove('down'); release(d); };
      // fingers: plain touch events, so the iPhone's "touch and hold" can't cancel the press half-way
      b.addEventListener('touchstart', (e) => { e.preventDefault(); down(); }, { passive: false });
      b.addEventListener('touchend', (e) => { e.preventDefault(); up(); }, { passive: false });
      b.addEventListener('touchcancel', up);
      // mouse / pen
      b.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') return; e.preventDefault(); b.setPointerCapture(e.pointerId); down(); });
      b.addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch') up(); });
      b.addEventListener('pointercancel', (e) => { if (e.pointerType !== 'touch') up(); });
      b.addEventListener('lostpointercapture', (e) => { if (e.pointerType !== 'touch') up(); });
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    // ----- next room: the arrows beside the house -----
    n.querySelectorAll('.room-nav').forEach((b) => {
      b.onclick = () => {
        const r = S.roomInfo(b.dataset.room);
        if (!S.roomOpen(r.key)) { sfx.miss(); return toast(`🔒 <span class="zh">${r.zh}要到 Lv${S.UNLOCKS[r.lock]} 才解锁</span> The ${r.en.toLowerCase()} opens at level ${S.UNLOCKS[r.lock]}`, { ms: 3000 }); }
        sfx.click();
        go('home', { ...currentParams, view: 'house', room: r.key }, { replace: true });
      };
    });

    // ----- move furniture: tap the button, then drag things around -----
    let arranging = false;
    const ab = $('#b-arrange', n), sb = $('#b-store', n);
    const hasFurniture = s.owned.some((id) => ITEMS[id] && ITEMS[id].cat === 'decor');
    const tools = $('#htools', n);
    if (!hasFurniture && !S.ownedRenovations().length) { ab.style.display = 'none'; }
    const countStore = () => { const c = S.storedDecor().length; $('#store-n', n).textContent = c ? c : ''; };
    countStore();
    const setArranging = (on, quiet) => {
      arranging = on;
      room.classList.toggle('arranging', arranging); tools.classList.toggle('arranging', arranging);
      ab.innerHTML = arranging ? '✅' : '🪑'; ab.title = arranging ? 'Done' : 'Move furniture';
      if (arranging) { if (!quiet) { sfx.click(); toast('<span class="zh">按住家具拖一拖！点 📦 收起来。</span> Drag furniture to move it · tap 📦 to put it away'); } }
      else { S.save(); if (!quiet) sfx.coin(); }
    };
    ab.onclick = () => setArranging(!arranging);
    if (currentParams.arrange) setArranging(true, true);                 // came back after placing / putting away
    const redrawArranging = () => { setHomeBusy(false); go('home', { ...currentParams, view: 'house', room: roomKey, arrange: true }, { replace: true }); };
    const leaveArrange = () => { if (currentParams.arrange) { delete currentParams.arrange; } };
    ab.addEventListener('click', () => { if (!arranging) leaveArrange(); });
    // 📦 storage box: furniture she owns that isn't in a room — tap one to stand it in this room
    sb.onclick = () => {
      const ids = S.storedDecor();
      const ri = S.roomInfo(roomKey);
      const box = html`<div class="card stack">
          <div class="h-title"><span class="zh">📦 收纳箱</span><span class="en">Storage box</span></div>
          <p class="help" style="margin:0">点一件家具，放进${ri.zh}。<br>Tap a piece to put it in the ${ri.en.toLowerCase()}.</p>
          <div class="store-grid">${ids.length ? ids.map((id) => `<button class="store-item" data-id="${id}"><span class="art"></span><span class="zh">${ITEMS[id].name}</span><small>${esc(ITEMS[id].en)}</small></button>`).join('')
            : '<p class="help">收纳箱是空的。去商店买家具吧！<br>Storage is empty — buy furniture in the shop.</p>'}</div>
          <button class="btn white" id="c">关闭 Close</button>
        </div>`;
      box.querySelectorAll('.store-item').forEach((b) => b.querySelector('.art').appendChild(spriteCanvas(b.dataset.id, 56)));
      box.querySelectorAll('.store-item').forEach((b) => { b.onclick = () => {
        S.placeDecor(b.dataset.id, roomKey); sfx.coin(); closeModal();
        toast(`<span class="zh">${ITEMS[b.dataset.id].name}放进${ri.zh}了！</span> Drag it where you like`);
        redrawArranging();
      }; });
      $('#c', box).onclick = closeModal;
      openModal(box);
    };
    // 📨 invite a friend who is online to come over
    $('#b-invite', n).onclick = () => {
      sfx.click();
      const fr = Friends.acceptedFriends(), on = fr.filter((f) => Friends.isOnline(f));
      const box = html`<div class="card stack">
          <div class="h-title"><span class="zh">📨 邀请朋友来我家</span><span class="en">Invite a friend over</span></div>
          ${on.length ? on.map((f) => `<button class="btn white block invite-row" data-id="${f.other}">🟢 <span class="zh">${esc(Friends.friendName(f))}</span> <small>· 邀请 Invite</small></button>`).join('')
            : `<p class="help" style="margin:0">${fr.length ? '现在没有朋友在线。朋友上线时会提醒你！<br>No friends are online right now — you\'ll get a pop-up when one comes online.' : '还没有朋友。在 📱 手机里加朋友吧！<br>No friends yet — add one in the 📱 phone.'}</p>`}
          <button class="btn white" id="ic">关闭 Close</button>
        </div>`;
      box.querySelectorAll('.invite-row').forEach((b) => { b.onclick = () => { closeModal(); const f = fr.find((x) => x.other === b.dataset.id); inviteOver(b.dataset.id, Friends.friendName(f)); }; });
      $('#ic', box).onclick = closeModal;
      openModal(box);
    };
    // 🎨 renovate: pick a wallpaper and a floor for this room from the ones she has bought
    $('#b-reno', n).onclick = () => {
      const ri = S.roomInfo(roomKey), owned = S.ownedRenovations();
      const plain = !ri.outdoor && !ri.bare;      // only indoor rooms with walls get wallpaper and floors
      const draw = () => {
        const cur = S.roomStyle(roomKey);
        const opts = (kind) => [`<button class="reno-opt ${!cur[kind] ? 'on' : ''}" data-kind="${kind}" data-id=""><span class="art">${kind === 'pool' ? '✖' : '↺'}</span><small>${kind === 'pool' ? '没有 None' : '原来的 Original'}</small></button>`,
          ...owned.filter((id) => ITEMS[id].kind === kind).map((id) => `<button class="reno-opt ${cur[kind] === id ? 'on' : ''}" data-kind="${kind}" data-id="${id}"><span class="art"></span><small class="zh">${ITEMS[id].name}</small></button>`)].join('');
        box.innerHTML = `<div class="h-title"><span class="zh">🎨 装修${ri.zh}</span><span class="en">Renovate the ${ri.en.toLowerCase()}</span></div>
          ${owned.length ? '' : '<p class="help">还没有墙纸或地板。去商店的 🎨 装修 看看吧！<br>Nothing yet — find wallpaper, floors and the pool in the shop\'s 🎨 Renovate aisle.</p>'}
          ${plain ? `<h4>🧱 墙纸 Wallpaper</h4><div class="reno-grid">${opts('wall')}</div>
          <h4>🟫 地板 Floor</h4><div class="reno-grid">${opts('floor')}</div>` : ''}
          <h4>🏊 泳池 Swimming pool</h4><div class="reno-grid">${opts('pool')}</div>
          <div class="row" style="justify-content:space-between">${owned.length ? '' : '<button class="btn blue" id="r-shop">🛍️ <span class="zh">去商店</span> Shop</button>'}<button class="btn white" id="r-close">好了 Done</button></div>`;
        box.querySelectorAll('.reno-opt[data-id]:not([data-id=""]) .art').forEach((a) => a.appendChild(spriteCanvas(a.parentElement.dataset.id, 52)));
        box.querySelectorAll('.reno-opt').forEach((b) => { b.onclick = () => {
          S.setRoomStyle(roomKey, b.dataset.kind, b.dataset.id || null); sfx.coin();
          drawRoom($('#roombg', n), isNight(), roomKey, S.roomStyle(roomKey)); Visit.hostResendHouse(); draw();
          if (b.dataset.kind === 'pool') { closeModal(); go('home', { ...currentParams, view: 'house', room: roomKey }, { replace: true }); }   // put in / take out the pool
        }; });
        $('#r-close', box).onclick = closeModal;
        const rs = $('#r-shop', box); if (rs) rs.onclick = () => { closeModal(); go('shop', { tab: 'reno' }); };
      };
      const box = html`<div class="card stack reno-box"></div>`;
      openModal(box); draw();
    };
    // ⬆ ⬇ on a piece of furniture: put it in front of / behind the things it overlaps
    room.querySelectorAll('.decor .layer-btn').forEach((b) => {
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.onclick = (e) => {
        e.stopPropagation();
        const d = b.closest('.decor'), id = d.dataset.id, front = b.classList.contains('up');
        s.decorLayer = s.decorLayer || {}; s.decorLayer[id] = front ? Date.now() : -Date.now(); d.dataset.layer = s.decorLayer[id];
        decorEls.forEach((x) => { x.style.zIndex = depth(x); }); stackDecor(room);
        S.saveQuiet(); sfx.click(); Visit.hostResendHouse();
        toast(front ? '⬆ <span class="zh">放到前面</span> In front' : '⬇ <span class="zh">放到后面</span> Behind', { ms: 1200 });
      };
    });
    // 🔄 on the study chair / laptop: turn it to face the front or the back
    room.querySelectorAll('.decor .turn-btn').forEach((b) => {
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.onclick = (e) => {
        e.stopPropagation();
        const id = b.closest('.decor').dataset.id, it = ITEMS[id];
        const way = it.frames && it.frames.front ? S.cycleFacing(id) : S.toggleFacing(id); sfx.click();
        const say = way === 'front' ? ['面向前面', 'Facing you'] : it.flip ? (way === 'back' ? ['转到另一边', 'Turned the other way'] : ['侧放', 'Sideways']) : way === 'back' ? ['转向后面', 'Facing the back'] : ['转向前面', 'Facing the front'];
        toast(`🔄 <span class="zh">${it.name}${say[0]}</span> ${say[1]}`);
        Visit.hostResendHouse(); redrawArranging();
      };
    });
    // 📦 on a piece of furniture: put it back in storage
    room.querySelectorAll('.decor .put-away').forEach((b) => {
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.onclick = (e) => {
        e.stopPropagation();
        const id = b.closest('.decor').dataset.id;
        S.storeDecor(id); sfx.click();
        toast(`📦 <span class="zh">${ITEMS[id].name}收进收纳箱了</span> Put away`);
        redrawArranging();
      };
    });
    decorEls.forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        if (!arranging) return;
        e.preventDefault(); el.setPointerCapture(e.pointerId);
        pin(el);
        const W = room.clientWidth, H = room.clientHeight;
        const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop;
        el.classList.add('dragging'); el.style.zIndex = 200;
        setHomeBusy(true);
        const mv = (ev) => {
          const x = Math.max(0, Math.min(W - el.offsetWidth, ox + (ev.clientX - sx) / houseK));
          const y = Math.max(0, Math.min(H - el.offsetHeight, oy + (ev.clientY - sy) / houseK));
          el.style.left = (x / W) * 100 + '%'; el.style.top = (y / H) * 100 + '%';
        };
        const end = () => {
          el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', end); el.removeEventListener('pointercancel', end);
          el.classList.remove('dragging');
          s.decorPos[el.dataset.id] = pin(el);
          s.decorLayer = s.decorLayer || {}; s.decorLayer[el.dataset.id] = Date.now(); el.dataset.layer = s.decorLayer[el.dataset.id];   // the one moved last goes in front
          decorEls.forEach((d) => { d.style.zIndex = depth(d); }); stackDecor(room); placeCat();
          S.saveQuiet(); setHomeBusy(false); Visit.hostResendHouse();
        };
        el.addEventListener('pointermove', mv); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
      });
    });
  }

  function petKitten() {
    const face = md.face;
    meow(face);
    // a touch always makes her smitten for 3 seconds — unless she is ill
    const sad = ['faint', 'dizzy', 'cough'].includes(face);
    if (!sad) { kv.flash('love', 3000); kv.jump(); }   // smitten: heart eyes and blushing for 3 seconds
    const EMO = { happy: ['😊', '喵～最喜欢你了！'], normal: ['😺', '喵～'], cry: ['😿', '喵呜…快做任务吧'], hungry: ['😿', '喵…好饿'], thirsty: ['🥵', '喵…想喝水'],
      cough: ['🤒', '喵…咳咳'], dizzy: ['😵‍💫', '喵…头好晕'], faint: ['😵', '……'], bored: ['🥱', '喵～陪我玩'], sleepy: ['😴', '喵…困了'] };
    const [emoji, words] = sad ? EMO[face] : ['😻', ['喵～最喜欢你了！', '好幸福～', '喵～再摸摸我！'][Math.floor(Math.random() * 3)]];
    const pop = document.createElement('div');
    pop.className = 'emo-pop'; pop.innerHTML = `<span class="e">${emoji}</span><span class="w">${esc(words)}</span>`;
    fx.appendChild(pop);
    const bubbles = [...kwrap.querySelectorAll('.bubble')]; bubbles.forEach((b) => { b.style.visibility = 'hidden'; });
    setTimeout(() => { pop.remove(); bubbles.forEach((b) => { b.style.visibility = ''; }); }, sad ? 1800 : 3000);
    burst(fx, 'heart', sad ? 2 : 4, '50%', '30%');
    if (!sad) {   // hearts keep floating around her for 3 seconds
      [500, 1000, 1500, 2000, 2500].forEach((t, i) => setTimeout(() => burst(fx, 'heart', 2, `${[25, 75, 35, 65, 50][i]}%`, `${[35, 30, 20, 25, 15][i]}%`), t));
    }
    S.pet();
    afterCare();
  }
  function afterCare() {
    const got = S.checkDaily();
    got.forEach((g, i) => setTimeout(() => toast(g.label, { coins: g.coins }), i * 700));
    if (got.length) setTimeout(() => refreshHome(), 3000);
  }

  wireActivities(n, refreshHome);
  $('#b-tasks', n).onclick = () => go('tasks');
  $('#b-review', n).onclick = () => { sfx.unlock(); go('spell', { mode: 'review' }); };
  $('#b-shop', n).onclick = () => go('shop');
  $('#b-dress', n).onclick = () => go('wardrobe');

  // a parent has checked a composition: show the stars, coins and comment once
  // (a checked composition now arrives as a phone notification instead of a pop-up)
  const bh = $('#b-house', n); if (bh) bh.onclick = () => (inHouse ? goBack() : go('home', { view: 'house' }));
  // something chosen in My items (feed / bath / play)
  const care = S.takePendingCare();
  if (care) setTimeout(() => doCare(care, kv, fx, afterCare), 450);
  n.querySelectorAll('[data-info]').forEach((b) => { b.onclick = () => openStatInfo(b.dataset.info); });
  requestAnimationFrame(() => fitBubbles(n)); setTimeout(() => fitBubbles(n), 300);
  // daily tasks: tap one to go straight to it
  n.querySelectorAll('[data-task]').forEach((b) => { b.onclick = () => { sfx.unlock(); openTask(b.dataset.task); }; });
  function openTask(key) {
    if (key === 'spell' || key === 'perfect') {
      const l = S.activeList();
      if (!S.releasedLists().length) return toast('<span class="zh">还没有听写</span> No spelling yet — ask Mum', { ms: 3000 });
      const st = S.listStatus(l);
      if (st === 'open') return go('spell', { mode: 'list' });
      const open = S.releasedLists().find((x) => S.listStatus(x) === 'open');
      if (open) { S.get().activeListId = open.id; S.saveQuiet(); return go('spell', { mode: 'list' }); }
      return toast(st === 'day-limit' ? '<span class="zh">今天的听写做完了！</span> That\'s all the spelling for today' : '<span class="zh">今天写过了！</span> No spelling left today — come back tomorrow', { ms: 3500 });
    }
    if (key === 'care') return go('wardrobe', { tab: 'food' });
    if (key === 'choice' || key === 'match' || key === 'order') return go('practiceList', { kind: key });
    if (key === 'essay') return S.outstandingEssays().length ? go('essay') : toast('<span class="zh">现在没有作文要写</span> No picture writing to do right now', { ms: 3000 });
    if (key === 'review') return S.reviewWords().length ? go('spell', { mode: 'review' }) : toast('<span class="zh">错词本是空的！</span> No mistakes to practise — great job!', { ms: 3000 });
    if (key === 'listen') return openPhone({ start: 'listen', after: refreshHome });
  }
  $('#b-friends', n).onclick = () => go('friends');
  if (inHouse) {
    const refit = () => { if (!n.isConnected) return window.removeEventListener('resize', refit); fitHouseBox($('#house', n), $('#hunit', n)); };
    window.addEventListener('resize', refit);
  }
  if (inHouse) {
    hostRoomNow = roomKey;
    houseLog = chatLog(houseChat);
    $('#hlog', n).prepend(houseLog.el);
    wirePlayable(room, (i) => Visit.hostNote(i));
    // changing cubicle: tap to pull the curtain open / closed
    room.addEventListener('click', (e) => {
      const d = e.target.closest('.decor.tap-open');
      if (!d || room.classList.contains('arranging') || e.target.closest('button')) return;
      S.toggleOpen(d.dataset.id); sfx.click();
      const entry = roomLayout(S.get(), roomKey, S.roomOf).find((x) => x.id === d.dataset.id);
      const ne = entry && decorEl(entry, { putAway: true }); if (ne) { ne.style.zIndex = d.style.zIndex; d.replaceWith(ne); }
      Visit.hostResendHouse();
    });
    // curtains and blinds: tap to draw them shut, tap again to open
    room.addEventListener('click', (e) => {
      const d = e.target.closest('.decor.curtain');
      if (!d || room.classList.contains('arranging') || e.target.closest('.put-away')) return;
      const shut = S.toggleCurtain(d.dataset.id); sfx.click();
      const entry = roomLayout(S.get(), roomKey, S.roomOf).find((x) => x.id === d.dataset.id);
      const ne = entry && decorEl(entry, { putAway: true }); if (ne) d.replaceWith(ne);
      toast(shut ? '🌙 <span class="zh">拉上窗帘</span> Curtains closed' : '☀️ <span class="zh">拉开窗帘</span> Curtains open', { ms: 1400 });
      Visit.hostResendHouse();
    });
    // photo frames: tap to put a photo in (it is shrunk to 50 KB)
    room.addEventListener('click', (e) => {
      const d = e.target.closest('.decor.frame');
      if (!d || room.classList.contains('arranging')) return;
      const id = d.dataset.id, it = ITEMS[id], cur = (S.get().framePhotos || {})[id];
      const box = html`<div class="card stack" style="align-items:center;text-align:center">
          <div class="h-title" style="justify-content:center"><span class="zh">🖼️ ${it.name}</span><span class="en">${esc(it.en)}</span></div>
          <div class="frame-preview">${cur ? `<img src="${cur}" alt="">` : '<span class="help">还没有照片 · No photo yet</span>'}</div>
          <label class="btn blue">📷 <span class="zh">${cur ? '换照片' : '选照片'}</span> ${cur ? 'Change photo' : 'Choose a photo'}<input type="file" accept="image/*" hidden></label>
          <p class="help" id="pmsg" style="margin:0">照片会缩小到 ${it.maxKB || 50}KB 以内。来家里玩的朋友也看得到。<br>Photos are made small (under ${it.maxKB || 50} KB). Friends visiting your house can see them.</p>
          <div class="row">${cur ? '<button class="btn white" id="prm">🗑 <span class="zh">拿掉</span> Remove</button>' : ''}<button class="btn white" id="pc">关闭 Close</button></div>
        </div>`;
      const msg = $('#pmsg', box);
      box.querySelector('input[type=file]').onchange = async (ev) => {
        const f = ev.target.files && ev.target.files[0]; if (!f) return;
        msg.textContent = '处理中… Making it small…';
        try {
          const url = await compressPhoto(f, (it.maxKB || 50) * 1024);   // posters: 10 KB
          S.setFramePhoto(id, url); sfx.coin(); closeModal();
          toast(`🖼️ <span class="zh">照片放好了！</span> Photo added (${Math.round((url.length * 3) / 4 / 1024)} KB)`);
          Visit.hostResendHouse(); refreshHome();
        } catch (x) { msg.textContent = '这张照片用不了，换一张试试。 That photo didn\'t work — try another one.'; }
      };
      const rm = $('#prm', box); if (rm) rm.onclick = () => { S.setFramePhoto(id, null); closeModal(); Visit.hostResendHouse(); refreshHome(); };
      $('#pc', box).onclick = closeModal;
      openModal(box);
    });
    room.addEventListener('click', (e) => {
      const d = e.target.closest('.decor.seat');
      if (!d || room.classList.contains('arranging') || md.face === 'faint') return;
      sitOn(d.dataset.id);
    });
    // lights: the 💡 switch darkens the room; lamps and the TV switch on and off when tapped
    const power = () => applyPower(room, { dark: S.roomDark(roomKey), off: S.get().powerOff || {} });
    $('#b-light', n).onclick = () => {
      const on = S.toggleRoomLight(roomKey); sfx.click();
      $('#b-light', n).classList.toggle('off', !on); power(); Visit.hostResendHouse();
    };
    wirePower(room, (id) => { S.togglePower(id); power(); Visit.hostResendHouse(); });
    roomPower = power;
    $('#hchat', n).appendChild(chatBar((text) => {
      say(kwrap, text); sfx.click();
      houseLog.add(k.name, text, true);
      Visit.hostSay(text);
    }, (mood) => {
      kv.flash(mood, 3000); kv.jump(); sfx.click();
      houseLog.add(k.name, emoteIcon(mood), true);
      Visit.hostEmote(mood);
    }));
    // ----- the radio: tap to play / stop her song (🎵 picks the song) -----
    const markRadio = () => room.querySelectorAll('.decor.radio').forEach((d) => d.classList.toggle('playing', Radio.isPlaying()));
    const unRadio = Radio.onRadio(() => { if (!room.isConnected) { unRadio(); return; } markRadio(); });
    markRadio();
    room.addEventListener('click', async (e) => {
      const d = e.target.closest('.decor.radio');
      if (!d || room.classList.contains('arranging') || e.target.closest('.put-away')) return;
      e.stopPropagation();
      if (!e.target.closest('.radio-song')) await Radio.moveOldSong();
      if (e.target.closest('.radio-song') || !Radio.mySong()) { radioMenu(); return; }
      const on = await Radio.toggle(); sfx.click();
      toast(on ? '📻 <span class="zh">音乐响起来啦！</span> Radio on' : '📻 <span class="zh">关掉收音机</span> Radio off', { ms: 1500 });
    });
    // ----- pets: the puppy roams, the hamster / guinea pig live in their cage until she opens the door -----
    const petLayer = new PetLayer(room, roomKey, { onClick: (kind, el) => petMenu(kind, el), onSpot: Pets.noteSpot });
    const unPets = Pets.onPets((snap) => { if (!room.isConnected) { unPets(); return; } petLayer.update(snap); });
    homePets = () => petLayer.update(Pets.snapshot());
    room.addEventListener('click', (e) => {
      const d = e.target.closest('.decor.cage');
      if (!d || room.classList.contains('arranging') || e.target.closest('.put-away') || e.target.closest('.pet:not(.in-cage)')) return;
      cageMenu(d.dataset.cage);
    });
  } else { hostRoomNow = 'living'; roomPower = null; homePets = null; Radio.stop(); }
  n._mounted = () => { Visit.visitors.attach(inHouse ? room : null, roomKey); if (inHouse) { Visit.hostResendHouse(); Visit.hostMove(hostPos()); requestAnimationFrame(() => roomPower && roomPower()); fitHouseBox($('#house', n), $('#hunit', n)); drawRoom($('#roombg', n), isNight(), roomKey, S.roomStyle(roomKey)); drawRoof($('#roof', n)); studioBarre(room, roomKey === 'basement'); decorEls.forEach((el) => { el.style.zIndex = depth(el); }); stackDecor(room); placeCat(); if (homePets) homePets(); } };
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
      S.rewardText(S.playReward()) ? `复习10个以前的词语，写对8个得${S.rewardText(S.playReward(), false)}！<br>Revise 10 old words — get 8 right to win ${S.rewardText(S.playReward())}!` : `复习10个以前的词语，陪${name}玩一玩！<br>Revise 10 old words to cheer ${name} up!`,
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

// the kitten eats (or drinks) for about 2.5 seconds: a dish appears at her feet, she nibbles, the food gets smaller
function eatAnimation(kv, fx, id) {
  const it = ITEMS[id], drink = !!it.water && !it.hunger;
  const c = kv.canvas, fr = fx.getBoundingClientRect(), cr = c.getBoundingClientRect();
  if (!cr.width) return;
  const size = Math.max(34, Math.round(cr.width * 0.3));
  const side = kv.left ? -1 : 1;   // the dish goes on the side she is facing
  const bowl = document.createElement('div');
  bowl.className = `eat-bowl${drink ? ' drink' : ''}`;
  bowl.style.cssText = `left:${cr.left - fr.left + cr.width / 2 + side * cr.width * 0.3 - size / 2}px;top:${cr.bottom - fr.top - size * 0.95}px;width:${size}px;height:${size}px`;
  const food = spriteCanvas(id, size); food.classList.add('eat-food'); bowl.appendChild(food);
  bowl.appendChild(Object.assign(document.createElement('i'), { className: 'eat-dish' }));
  if (drink) for (let k = 0; k < 3; k++) { const r = document.createElement('i'); r.className = 'eat-ripple'; r.style.animationDelay = `${k * 0.3}s`; bowl.appendChild(r); }
  else for (let k = 0; k < 4; k++) { const r = document.createElement('i'); r.className = 'eat-crumb'; r.style.left = `${20 + k * 20}%`; r.style.animationDelay = `${0.2 + k * 0.45}s`; bowl.appendChild(r); }
  const say = document.createElement('div');
  say.className = 'eat-say zh'; say.textContent = drink ? '咕噜咕噜～' : '啊呜啊呜～';
  say.style.cssText = `left:${cr.left - fr.left + cr.width / 2}px;top:${Math.max(0, cr.top - fr.top - 8)}px`;
  fx.append(bowl, say);
  const bubbles = [...(fx.parentElement || fx).querySelectorAll('.bubble')]; bubbles.forEach((b) => { b.style.visibility = 'hidden'; });
  setTimeout(() => bubbles.forEach((b) => { b.style.visibility = ''; }), 2600);
  kv.flash('eat', 2600);
  c.classList.add('eating');
  const munch = setInterval(() => sfx.stroke(), drink ? 300 : 420);
  setTimeout(() => { clearInterval(munch); sfx.yum(); }, 2300);
  setTimeout(() => { c.classList.remove('eating'); bowl.classList.add('gone'); say.remove(); setTimeout(() => bowl.remove(), 300); }, 2600);
}
// shampoo: bubbles and foam for 3 seconds; comb: the comb brushes her fur with sparkles
function groomAnimation(kv, fx, id) {
  const c = kv.canvas, fr = fx.getBoundingClientRect(), cr = c.getBoundingClientRect();
  if (!cr.width) return;
  const box = document.createElement('div');
  box.className = `groom ${id}`;
  box.style.cssText = `left:${cr.left - fr.left}px;top:${cr.top - fr.top}px;width:${cr.width}px;height:${cr.height}px`;
  const tool = spriteCanvas(id, Math.max(30, Math.round(cr.width * (id === 'comb' ? 0.32 : 0.26))));
  tool.classList.add('groom-tool');
  box.appendChild(tool);
  if (id === 'shampoo') {
    for (let k = 0; k < 14; k++) {
      const b = document.createElement('i'); b.className = 'groom-bubble';
      const sz = 8 + Math.random() * 16;
      b.style.cssText = `left:${10 + Math.random() * 80}%;top:${25 + Math.random() * 55}%;width:${sz}px;height:${sz}px;animation-delay:${(Math.random() * 2).toFixed(2)}s`;
      box.appendChild(b);
    }
    box.appendChild(Object.assign(document.createElement('i'), { className: 'groom-foam' }));
  } else {
    for (let k = 0; k < 6; k++) {
      const sp = document.createElement('i'); sp.className = 'groom-spark'; sp.textContent = '✨';
      sp.style.cssText = `left:${15 + Math.random() * 70}%;top:${30 + Math.random() * 50}%;animation-delay:${(0.3 + Math.random() * 2.2).toFixed(2)}s`;
      box.appendChild(sp);
    }
  }
  const say = document.createElement('div');
  say.className = 'eat-say zh'; say.textContent = id === 'shampoo' ? '洗白白～' : '好舒服～';
  say.style.cssText = `left:${cr.left - fr.left + cr.width / 2}px;top:${Math.max(0, cr.top - fr.top - 8)}px`;
  fx.append(box, say);
  const bubbles = [...(fx.parentElement || fx).querySelectorAll('.bubble')]; bubbles.forEach((b) => { b.style.visibility = 'hidden'; });
  kv.flash('happy', 3000);
  c.classList.add(id === 'shampoo' ? 'washing' : 'combing');
  setTimeout(() => {
    c.classList.remove('washing', 'combing'); box.classList.add('gone'); say.remove();
    bubbles.forEach((b) => { b.style.visibility = ''; });
    setTimeout(() => box.remove(), 300);
  }, 3000);
}

// tap the Happy / Hygiene bar: what makes it go up and down
const STAT_INFO = {
  happy: { title: '❤ 开心 Happy', intro: 'Goes down by itself about 1 point an hour (about 24 a day), never below 8. Below 30 the kitten looks sleepy and says “好无聊… Play with me?”.',
    rows: [['Pet the kitten', '+2 each time (up to 10 times a day)'], ['Play with a toy (🎒 My items → Toys)', '+6'], ['Finish a “Play with me” round', '+15'], ['Shampoo or comb', '+2'], ['A friend feeds her kitten', 'the food’s amount +3'],
      ['🍶 Fresh water', '+2'], ['🐟 Fish snack', '+3'], ['🥟 Steamed bun', '+4'], ['🥛 Milk · 🥫 Tuna can', '+8'], ['🍪 Paw cookie', '+15'], ['🥮 Mooncake', '+18'], ['🍦 Ice cream', '+25'], ['🍰 Strawberry cake', '+30']] },
  hygiene: { title: '🛁 干净 Hygiene', intro: 'A full bar lasts about 24 hours (it goes down about 4 points an hour). Below 50% the kitten says “哎呀该帮我洗澡了”, and below 20% “我好臭啊！快帮我洗澡!”.',
    rows: [['🧴 Shampoo', '+50'], ['🪮 Comb', '+20']],
    shop: 'Buy shampoo and combs in the shop → 🧴 Toiletries, then use them in 🎒 My items.' },
};
function openStatInfo(key) {
  const d = STAT_INFO[key]; if (!d) return;
  const n = html`<div class="card stack stat-info">
      <div class="h-title" style="font-size:24px">${d.title}</div>
      <p class="help" style="margin:0">${d.intro}</p>
      <table class="info-table"><thead><tr><th>What she does</th><th>${key === 'happy' ? 'Happy' : 'Hygiene'}</th></tr></thead>
        <tbody>${d.rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</tbody></table>
      ${d.shop ? `<p class="help" style="margin:0">${esc(d.shop)}</p>` : ''}
      <div class="row" style="justify-content:flex-end">${d.shop ? '<button class="btn blue" id="si-shop">🧴 <span class="zh">去买</span> Shop</button>' : ''}<button class="btn white" id="si-close">好的 OK</button></div>
    </div>`;
  $('#si-close', n).onclick = closeModal;
  const sh = $('#si-shop', n); if (sh) sh.onclick = () => { closeModal(); go('shop', { tab: 'toiletry' }); };
  openModal(n);
}
// keep the kitten's speech bubbles inside the screen (long ones on a phone)
function fitBubbles(root) {
  root.querySelectorAll('.kitten-wrap .bubble').forEach((b) => {
    b.style.marginLeft = '0px';
    const r = b.getBoundingClientRect(), vw = document.documentElement.clientWidth, pad = 8;
    let shift = 0;
    if (r.right > vw - pad) shift = vw - pad - r.right;
    if (r.left + shift < pad) shift = pad - r.left;
    if (shift) { b.style.marginLeft = `${Math.round(shift)}px`; b.style.setProperty('--tail', `${Math.max(10, Math.min(r.width - 24, 14 - shift))}px`); }
  });
}
// feed / bath / play — chosen in 🎒 My items, done at home so she can watch her kitten
function doCare({ kind, id }, kv, fx, afterCare) {
  const it = ITEMS[id]; if (!it) return;
  if (kind === 'feed') {
    if (!S.feed(id)) return;
    sfx.yum();
    eatAnimation(kv, fx, id);
    setTimeout(() => burst(fx, 'heart', 3, '50%', '25%'), 2300);
    setTimeout(() => {   // after she has finished eating
      toast(it.water && !it.hunger ? `<span class="zh">好解渴！</span> Ahh, refreshing!` : `<span class="zh">好吃！</span> Yum, ${esc(it.en)}!`);
      afterCare();
    }, 2600);
    setTimeout(() => refreshHome(), 3000);
  } else if (kind === 'groom') {
    if (!S.groom(id)) return;
    sfx.purr();
    groomAnimation(kv, fx, id);
    setTimeout(() => { toast(id === 'shampoo' ? '<span class="zh">洗得香喷喷！</span> Squeaky clean!' : '<span class="zh">毛毛好顺！</span> So fluffy!'); afterCare(); }, 3000);
    setTimeout(() => refreshHome(), 3300);
  } else if (kind === 'play') {
    S.play(); sfx.purr(); kv.flash('love', 1800); kv.jump(); setTimeout(() => kv.jump(), 600);
    burst(fx, 'heart', 4, '50%', '25%');
    afterCare();
  }
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
  if (current !== 'home' || currentParams.view === 'house' || document.hidden || !$('#modal').classList.contains('hidden') || Math.random() < 0.4) return;
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
// pets wander around the house all the time (friends visiting see them too)
Pets.startPets();
Pets.onPets((snap) => Visit.hostPets(snap));
Radio.onRadio(() => Visit.hostRadio(Radio.status()));
// live visits: friends' kittens can walk into my house while the app is open
Visit.startHosting({
  inHouse: () => current === 'home' && currentParams.view === 'house',
  house: () => {
    const st = S.get(), rooms = {}, open = S.ROOMS.filter((r) => S.roomOpen(r.key) && S.unlocked('decor')).map((r) => r.key);
    (open.length ? open : ['living']).forEach((k) => { rooms[k] = roomLayout(st, k, S.roomOf); });
    return { rooms, pets: Pets.snapshot(), radio: Radio.status(), open: open.length ? open : ['living'], power: { dark: { ...(st.lightsOff || {}) }, off: { ...(st.powerOff || {}) } }, styles: JSON.parse(JSON.stringify(st.roomStyle || {})) };
  },
  myPos: () => { const p = S.get().catPos || {}; return { x: p.x ?? 50, y: p.y ?? 3, room: hostRoomNow, left: false }; },
  arrived: (id, look) => {
    const inHouseNow = current === 'home' && currentParams.view === 'house';
    if (inHouseNow) return toast(`🏠 <span class="zh">${esc(look.name || '朋友')}来你家玩了！</span> Say hi!`, { ms: 4500 });
    // tap it to go straight home and say hi
    toast(`🏠 <span class="zh">${esc(look.name || '朋友')}来你家玩了！</span> A friend is at your house — come and say hi!`, { ms: 9000, onClick: goMyHouse, actions: [{ label: '🏠 <span class="zh">回家</span> Go home', fn: goMyHouse }] });
  },
  // a friend invited me to their house
  invited: (id, name) => {
    sfx.coin();
    toast(`📨 <span class="zh">${esc(name || '朋友')}邀请你去TA家玩！</span> ${esc(name || 'A friend')} invited you over`, { ms: 12000,
      actions: [{ label: '🏠 <span class="zh">去串门</span> Visit', fn: () => go('visit', { id, name }) }, { label: '等一下 Later', fn: () => {} }] });
  },
  left: (id, look) => toast(`👋 <span class="zh">${esc(look.name || '朋友')}回家了</span> Your friend went home`, { ms: 2500 }),
  chat: (id, text, look, seen) => {
    const inHouseNow = current === 'home' && currentParams.view === 'house';
    if (inHouseNow && houseLog && houseLog.el.isConnected) houseLog.add(look.name || '朋友', text, false);
    if (!seen && !inHouseNow) toast(`💬 ${esc(look.name || '朋友')}：${esc(text)}`, { ms: 5000, onClick: goMyHouse });
  },
});
function goMyHouse() { if (!(current === 'home' && currentParams.view === 'house')) go('home', { view: 'house' }); }
// 🟢 a friend just came online: pop up (visit them, or invite them to my house)
let onlineBefore = null;
Friends.onFriends(() => {
  const now = new Set(Friends.acceptedFriends().filter((f) => Friends.isOnline(f)).map((f) => f.other));
  if (onlineBefore) now.forEach((id) => {
    if (onlineBefore.has(id)) return;
    const f = Friends.acceptedFriends().find((x) => x.other === id), name = Friends.friendName(f);
    toast(`🟢 <span class="zh">${esc(name)}上线了！</span> ${esc(name)} is online`, { ms: 9000,
      actions: [{ label: '🏠 <span class="zh">去串门</span> Visit', fn: () => go('visit', { id, name }) },
        { label: '📨 <span class="zh">邀请来我家</span> Invite', fn: () => inviteOver(id, name) }] });
  });
  onlineBefore = now;
});
export function inviteOver(id, name) {
  if (!Visit.inviteFriend(id)) return toast('要先登录 · Please log in first');
  sfx.click();
  toast(`📨 <span class="zh">邀请发出去了！</span> Invite sent to ${esc(name || 'your friend')}`, { ms: 3000 });
  if (!(current === 'home' && currentParams.view === 'house')) go('home', { view: 'house' });   // wait for them at home
}
let lastReq = 0;
Friends.onFriends(() => { const r = Friends.incomingRequests().length; if (r !== lastReq) { lastReq = r; if (current === 'home') refreshHome(); } });
// another tab changed the game: show the new state on calm pages
S.onExternalChange(() => {
  if (homeRedrawWaits()) return;
  if (['shop', 'wardrobe'].includes(current)) { const el = app.firstElementChild; if (el && el._refresh) el._refresh(); return; }
  if (current === 'home' && !document.querySelector('.room.arranging')) go(current, currentParams, { replace: true });
});
// cloud backup & sync: if another device saved newer progress, show it
const REDRAW_PAGES = ['home', 'shop', 'wardrobe', 'tasks', 'practiceList', 'friends', 'grave'];
Cloud.init(() => {
  // pages that can redraw themselves in place (parent area, shop, my items) stay on the same tab
  if (['parent', 'shop', 'wardrobe'].includes(current)) { const el = app.firstElementChild; if (el && el._refresh) el._refresh(); return; }
  if (!S.get().onboarded) { if (current !== 'login') go('welcome', {}, { replace: true }); return; }
  if (current === 'welcome' || current === 'setup') { go('home', {}, { replace: true }); return; }
  // only redraw "resting" pages — never restart an activity she is doing (spelling, practice, essay, a friend's page)
  const m = document.querySelector('#modal');
  if (!REDRAW_PAGES.includes(current) || (m && !m.classList.contains('hidden')) || document.querySelector('.room.arranging') || homeRedrawWaits()) return;
  go(current, currentParams, { replace: true });
});
if (!Auth.session()) go('login');
else { go(S.get().onboarded ? 'home' : 'welcome'); Cloud.pull(); }

// ---------- "New version — tap to update" ----------
// every minute (and whenever the app comes back to the front) look at the live version number
let updateShown = false;
const verNum = (v) => Number(String(v || '').replace(/\D/g, '')) || 0;
async function checkForUpdate() {
  if (updateShown || document.hidden || !navigator.onLine) return;
  try {
    // ask for version.js exactly the way a reload would get it (same address, same caches): only offer the update once
    // the new files can actually arrive — otherwise tapping Update reloads the old version and asks again
    const t = await (await fetch('version.js', { cache: 'no-cache' })).text();
    const live = (t.match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1];
    if (live && live !== APP_VERSION) {
      updateShown = true;
      // the notes for every version she hasn't got yet, all in one list
      let items = [];
      try {
        const mod = await import(`./changelog.js?v=${encodeURIComponent(live)}`);
        const from = verNum(APP_VERSION), to = verNum(live);
        items = (mod.CHANGES || []).filter((c) => c.v > from && c.v <= to).flatMap((c) => c.items);
      } catch { /* notes unavailable: a plain notice is fine */ }
      pendingNotes = items;
      if (current === 'home' && !notesDismissed) showUpdateNotice(); else showUpdateBar();
    }
  } catch { /* offline: try again later */ }
}
async function updateNow(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) await reg.update(); } catch {}
  try { await Cloud.backupNow(); } catch {}
  location.reload();
}
// the pop-up on the home page: what's new + Update now
function showUpdateNotice() {
  if (!$('#modal')?.classList.contains('hidden')) { showUpdateBar(); return; }   // something else is open: just the small bar
  document.querySelector('.update-bar')?.remove();
  const items = pendingNotes || [];
  const n = html`<div class="card stack update-notice">
      <div class="un-head"><span class="un-star">✨</span><div><b>A new update is ready!</b><small>Here’s what’s new:</small></div></div>
      ${items.length ? `<ul class="un-list">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="help" style="margin:0">Some improvements and fixes.</p>'}
      <button class="btn big green block" id="un-go">🔄 Update now</button>
      <button class="btn white small" id="un-later" style="align-self:center">Later</button>
    </div>`;
  $('#un-go', n).onclick = (e) => updateNow(e.currentTarget);
  $('#un-later', n).onclick = () => { notesDismissed = true; closeModal(); showUpdateBar(); };
  openModal(n);
}
function showUpdateBar() {
  if (document.querySelector('.update-bar')) return;
  const bar = html`<div class="update-bar" role="status">
      <button class="go" type="button">✨ <span class="zh">新版本</span> New version — tap to update</button>
      <button class="x" type="button" aria-label="Later">✕</button>
    </div>`;
  $('.go', bar).onclick = () => (pendingNotes && pendingNotes.length ? (bar.remove(), notesDismissed = false, showUpdateNotice()) : updateNow($('.go', bar)));
  $('.x', bar).onclick = () => { bar.remove(); setTimeout(() => { updateShown = false; }, 30 * 60000); };   // ask again in 30 minutes
  document.body.appendChild(bar);
}
if (location.protocol === 'https:' || location.hostname === 'localhost') {
  setTimeout(checkForUpdate, 5000);
  setInterval(checkForUpdate, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// prevent iOS double-tap zoom & pinch
document.addEventListener('gesturestart', (e) => e.preventDefault());
