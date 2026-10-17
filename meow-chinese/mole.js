// 🔨 The arcade's mole machine ("打地鼠 Mole Bop").
// 5 coins a game, 45 seconds. Moles pop up out of 9 holes; tap one to bop it with the red mallet (1 point) and it ducks
// back down. Every 10 moles is the next level: moles come up faster, stay up for less time, more pop up at once, and the
// music speeds up. Tickets (kept on the server, 5 at most a game): 30 moles → 1 · 50 → 2 · 80 → 3 · 100 → 4 · 120 → 5.
import * as S from './state.js';
import { rest } from './cloud.js';
import { drawGrid, artGrid } from './pixel.js';
import { html, $, openModal, closeModal, toast, coinI, hydrateIcons, confetti } from './ui.js';
import { sfx, moleMusic, bonk } from './audio.js';
import { boardHtml } from './arcade.js';

const rpc = (name, body = {}) => rest('rpc/' + name, { method: 'POST', body: JSON.stringify(body) });
export const MOLE_COST = 5;
const TIME = 45, PER_LEVEL = 10, HOLES = 9, TICKET = '🎟️';
// per level: how long a mole stays up (ms), how many can be up at once, how many pop up together, and the gap
// between pop-ups (ms). Every level is harder: shorter, more moles at once, bigger bursts (it tops out at level 8).
const lv = (n) => { const L = Math.min(8, Math.max(1, n));
  return { up: Math.max(480, 1300 - 115 * (L - 1)), max: Math.min(7, L), burst: Math.min(4, 1 + Math.floor((L - 1) / 2)), gap: Math.max(260, 900 - 90 * (L - 1)) }; };
// tickets for one game (5 at most): 30 moles → 1 · 50 → 2 · 80 → 3 · 100 → 4 · 120 → 5 (the server decides)
export const MOLE_TIERS = [[30, 1], [50, 2], [80, 3], [100, 4], [120, 5]];
const ticketsFor = (score) => MOLE_TIERS.reduce((t, [g, n]) => (score >= g ? n : t), 0);

// pixel art: a mole (normal and bopped), and the red mallet
const PAL = { o: '#1e1a28', b: '#8c5634', B: '#6a3f24', l: '#c48a5c', w: '#ffffff', k: '#1e1a28', p: '#ff9ec4', n: '#3a2418', y: '#ffd23f',
  r: '#e8384f', R: '#a3202f', h: '#ffd0d6', t: '#c98f58', T: '#8a5a32' };
const MOLE = [
  '.....oooooo.....',
  '...oobbbbbboo...',
  '..obbbbbbbbbbo..',
  '.obbbbbbbbbbbbo.',
  '.obbwwbbbbwwbbo.',
  'obbbwkbbbbwkbbbo',
  'obbbbbbbbbbbbbbo',
  'obbllllnnllllbbo',
  'obllllnnnnllllbo',
  'obllllwwwwllllbo',
  'obbllllwwllllbbo',
  'obbbllllllllbbbo',
  'obbbbbbbbbbbbbbo',
  'obbbbbbbbbbbbbbo',
];
const BOPPED = MOLE.map((r, i) => (i === 4 ? '.obbkbkbbkbkbbo.' : i === 5 ? 'obbbbkbbbbkbbbbo' : r));
const MALLET = [
  '.oooooooooo.....',
  'orrrrrrrrrro....',
  'orhhrrrrrrRo....',
  'orrrrrrrrrRo....',
  'orrrrrrrrrRo....',
  '.oooooTToooo....',
  '......otto......',
  '......otto......',
  '......otto......',
  '......otto......',
  '......otto......',
  '......oTTo......',
  '......oooo......',
];
const sprite = (art, px) => { const c = document.createElement('canvas'); drawGrid(c, artGrid(art, PAL), px); c.className = 'px'; return c; };

let boardCache = null;
export async function loadMoleBoard() { try { boardCache = await rpc('arcade_mole_board'); } catch { /* offline */ } return boardCache; }

export function openMole(onDone = () => {}) {
  const box = html`<div class="card bb-card mole-card">
      <div class="bb-marquee mole-marquee">🔨 <span class="zh">打地鼠</span> <b>MOLE BOP!</b> 🔨</div>
      <div class="bb-hud"><span class="bb-level">LV 1</span><span class="bb-time">⏱ ${TIME}</span><span class="bb-score">🐹 0</span></div>
      <div class="mole-field"><div class="mole-holes"></div><div class="mole-mallet"></div><div class="bb-flash"></div></div>
      <div class="bb-left mole-tiers"></div>
      <div class="bb-msg"></div>
      <div class="row bb-actions"><button type="button" class="btn yellow bb-coin">🪙 <b>${MOLE_COST}</b>${coinI(16)} <span class="zh">投币开始</span> Play</button><button type="button" class="btn white small bb-close">关闭 Close</button></div>
      <div class="bb-boardbox"></div>
    </div>`;
  const field = $('.mole-field', box), holesEl = $('.mole-holes', box), mallet = $('.mole-mallet', box), msg = $('.bb-msg', box);
  const coinBtn = $('.bb-coin', box), boardBox = $('.bb-boardbox', box);
  mallet.append(sprite(MALLET, 4));
  const holes = [];
  for (let i = 0; i < HOLES; i++) {
    const h = html`<div class="mole-hole"><div class="mole-pit"><div class="mole"></div></div><div class="mole-lip"></div></div>`;
    const m = $('.mole', h); m.append(sprite(MOLE, 5)); const hit = sprite(BOPPED, 5); hit.classList.add('bopped'); m.append(hit);
    holesEl.append(h);
    const hole = { el: h, mole: m, up: false, hit: false, downT: 0 };
    // pointerdown, not click: a quick tap on a phone counts straight away
    h.addEventListener('pointerdown', (e) => { e.preventDefault(); whack(hole, i); });
    holes.push(hole);
  }
  let state = 'idle', score = 0, level = 1, endT = 0, alive = true, spawnT = 0, clockT = 0;
  const music = moleMusic();
  const say = (t) => { msg.innerHTML = t; hydrateIcons(msg); };
  const showBoard = (d) => { boardBox.innerHTML = boardHtml(d); };
  showBoard(boardCache); loadMoleBoard().then((d) => { if (alive) showBoard(d); });
  say(`<span class="zh">投币开始！地鼠出来就点它。</span> Put a coin in, then tap the moles when they pop up!<br><small>${TIME}s · <span class="zh">每打${PER_LEVEL}只升一级，越来越快！</span> every ${PER_LEVEL} moles = next level — faster and more moles!</small>`);
  const hud = () => {
    $('.bb-level', box).textContent = `LV ${level}`;
    $('.bb-score', box).textContent = `🐹 ${score}`;
    $('.mole-tiers', box).innerHTML = MOLE_TIERS.map(([g, n]) => `<span class="${score >= g ? 'got' : ''}">${g}🐹 → ${TICKET}${n}</span>`).join('');
  };
  hud();
  function flash(t) { const f = $('.bb-flash', box); f.innerHTML = t; f.classList.remove('show'); void f.offsetWidth; f.classList.add('show'); }

  // a mole comes up out of a free hole, stays a moment, then ducks back down (unless she bops it first)
  function popUp() {
    const L = lv(level), free = holes.filter((h) => !h.up);
    if (!free.length || holes.filter((h) => h.up).length >= L.max) return;
    const h = free[Math.floor(Math.random() * free.length)];
    h.up = true; h.hit = false; h.el.classList.remove('hit'); h.el.classList.add('up');
    h.mole.style.transitionDuration = `${Math.max(110, 200 - level * 15)}ms`;
    clearTimeout(h.downT); h.downT = setTimeout(() => goDown(h), L.up);
  }
  function goDown(h, delay = 0) {
    clearTimeout(h.downT);
    h.downT = setTimeout(() => { h.el.classList.remove('up'); setTimeout(() => { h.up = false; h.el.classList.remove('hit'); }, 220); }, delay);
  }
  function whack(h, i) {
    if (state !== 'playing') return;
    swing(i);
    if (!h.up || h.hit || !h.el.classList.contains('up')) return;
    h.hit = true; h.el.classList.add('hit'); bonk();
    score++; hud(); goDown(h, 260);
    const nl = Math.floor(score / PER_LEVEL) + 1;
    if (nl !== level) { level = nl; music.setLevel(level); hud(); flash(`⬆️ <b>LEVEL ${level}</b>`); sfx.correct && sfx.correct(); }
  }
  // 🔨 the red mallet swings down onto the hole she tapped
  let swingT = 0;
  function swing(i) {
    const hEl = holes[i].el, fr = field.getBoundingClientRect(), r = hEl.getBoundingClientRect();
    // the mallet pivots on the end of its handle (bottom middle); swung down it lands its head on the mole
    const px = r.left - fr.left + r.width / 2 + 40, py = r.top - fr.top + r.height * 0.42 + 22;
    mallet.style.left = `${px - mallet.offsetWidth / 2}px`; mallet.style.top = `${py - mallet.offsetHeight}px`;
    mallet.classList.remove('swing'); void mallet.offsetWidth; mallet.classList.add('swing', 'shown');
    clearTimeout(swingT); swingT = setTimeout(() => mallet.classList.remove('shown'), 420);
  }

  function tickClock() {
    if (!alive || state !== 'playing') return;
    const left = Math.max(0, (endT - performance.now()) / 1000);
    $('.bb-time', box).textContent = `⏱ ${Math.ceil(left)}`;
    if (left <= 0) return finish();
    clockT = setTimeout(tickClock, 200);
  }
  function spawnLoop() {
    if (!alive || state !== 'playing') return;
    popUp();
    // higher levels: several moles burst out together
    for (let k = 1; k < lv(level).burst; k++) setTimeout(() => state === 'playing' && popUp(), 90 * k);
    spawnT = setTimeout(spawnLoop, lv(level).gap * (0.75 + Math.random() * 0.5));
  }

  coinBtn.onclick = () => {
    if (state !== 'idle') return;
    if (S.get().coins < MOLE_COST) return toast(`金币不够 · You need ${MOLE_COST} coins`);
    S.get().coins -= MOLE_COST; S.save(); sfx.coin && sfx.coin();
    state = 'playing'; score = 0; level = 1; music.setLevel(1); endT = performance.now() + TIME * 1000;
    holes.forEach((h) => { clearTimeout(h.downT); h.up = false; h.hit = false; h.el.classList.remove('up', 'hit'); });
    coinBtn.disabled = true; field.classList.add('on');
    say('<span class="zh">快！打地鼠！</span> Bop those moles!'); hud(); flash('🔨 <b>GO!</b>');
    tickClock(); spawnT = setTimeout(spawnLoop, 600);
  };

  async function finish() {
    if (state !== 'playing') return;
    state = 'done'; clearTimeout(spawnT); clearTimeout(clockT); field.classList.remove('on');
    holes.forEach((h) => goDown(h));
    say(`⏱ <span class="zh">时间到！</span> Time's up — <b>${score}</b> mole${score === 1 ? '' : 's'}! <small>Saving…</small>`);
    let res = null;
    try { res = await rpc('arcade_mole_submit', { p_score: score, p_name: S.get().kitten.name || '' }); } catch { /* shown below */ }
    if (!alive) return;
    if (res) {
      boardCache = res; showBoard(res);
      const won = res.awarded || 0;
      if (won) { sfx.fanfare(); if (won >= 4) confetti(); }
      say(`🐹 <b>${score}</b> <span class="zh">只地鼠！</span> moles bopped!` +
        (won ? `<br>${TICKET} <b>+${won}</b> <span class="zh">张奖券</span> ticket${won > 1 ? 's' : ''} — swap them for prizes at the prize counter.` : `<br><small>${TICKET} <span class="zh">打到30只就有奖券</span> Bop 30+ moles to win a ticket.</small>`));
    } else say(`🐹 <b>${score}</b> moles! <small>(Couldn't reach the leaderboard — tickets need an internet connection.)</small>`);
    coinBtn.disabled = false; state = 'idle'; level = 1; music.setLevel(1);
    onDone();
  }
  const shut = () => { alive = false; clearTimeout(spawnT); clearTimeout(clockT); holes.forEach((h) => clearTimeout(h.downT)); music.stop(); };
  $('.bb-close', box).onclick = () => { if (state === 'playing') { toast('游戏进行中 · Finish this game first'); return; } shut(); closeModal(); };
  openModal(box, { onClose: shut }); hydrateIcons(box);
}
