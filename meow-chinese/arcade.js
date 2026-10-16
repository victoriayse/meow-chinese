// 🏀 The arcade's basketball machine and 🎟️ prize counter.
// Basketball: 5 coins a game, 30 seconds, 5 levels × 3 balls. The hoop slides left and right (faster each level);
// tap the ball to shoot it straight up — no aiming lines. Every ball through the hoop is 1 point.
// Tickets (kept on the server, can't be traded): 5+ goals in a game = 1 ticket; taking 1st place on the leaderboard = 5 tickets.
// Prizes are bought with tickets only, at the prize counter / kiosk. The admin can change each prize's ticket cost there.
import * as S from './state.js';
import * as Places from './places.js';
import { ITEMS, spriteCanvas, ARCADE_PRIZES } from './pixel.js';
import { rest } from './cloud.js';
import { html, $, esc, openModal, closeModal, toast, coinI, hydrateIcons, confetti } from './ui.js';
import { sfx } from './audio.js';

const rpc = (name, body = {}) => rest('rpc/' + name, { method: 'POST', body: JSON.stringify(body) });
export const BASKET_COST = 5;
const TIME = 30, LEVELS = 5, PER_LEVEL = 3, BALLS = LEVELS * PER_LEVEL;
const SPEED = [16, 24, 33, 44, 56];        // how fast the hoop slides at each level (% of the court a second)
const RIM = 9;                             // the ball goes in when it is this close to the middle of the hoop (% of the court)
const FLY_MS = 380;
const TICKET = '🎟️';

// the little leaderboard shown on the machine itself in the arcade
let boardCache = null;
export async function loadBoard() { try { boardCache = await rpc('arcade_board'); } catch { /* offline: keep the last one */ } return boardCache; }
export function machineBoard(el) {
  if (!el) return;
  const paint = () => {
    let b = el.querySelector('.bb-mini');
    if (!b) { b = document.createElement('div'); b.className = 'bb-mini'; el.appendChild(b); }
    const top = ((boardCache && boardCache.board) || []).slice(0, 3);
    b.innerHTML = `<b>🏆 TOP</b>${top.length ? top.map((r, i) => `<span>${i + 1}. ${esc(r.name || '—')} <i>${r.best}</i></span>`).join('') : '<span>—</span>'}`;
  };
  paint(); loadBoard().then(paint);
}
function boardHtml(d) {
  const rows = (d && d.board) || [];
  return `<div class="bb-board-title">🏆 <span class="zh">排行榜</span> Leaderboard</div>
    ${rows.length ? `<ol>${rows.map((r) => `<li class="${r.me ? 'me' : ''}"><span>${esc(r.name || '—')}</span><b>${r.best}</b></li>`).join('')}</ol>` : '<p class="help" style="margin:4px 0">还没有人上榜 · No scores yet — be the first!</p>'}
    <div class="bb-mine">${d ? `<span class="zh">我的最高分</span> My best: <b>${d.mine || 0}</b> · ${TICKET} <b>${d.tickets || 0}</b> <span class="zh">张</span> tickets` : ''}</div>`;
}

export function openBasket(onDone = () => {}) {
  const box = html`<div class="card bb-card">
      <div class="bb-marquee">🏀 <span class="zh">投篮机</span> <b>BASKETBALL</b> 🏀</div>
      <div class="bb-hud"><span class="bb-level">LV 1</span><span class="bb-time">⏱ ${TIME}</span><span class="bb-score">🏀 0</span></div>
      <div class="bb-court">
        <div class="bb-hoop" style="left:50%"><div class="bb-board"></div><div class="bb-rim"></div><div class="bb-net"></div></div>
        <div class="bb-flash"></div>
        <button type="button" class="bb-ball" aria-label="Shoot" disabled></button>
        <div class="bb-left"></div>
      </div>
      <div class="bb-msg"></div>
      <div class="row bb-actions"><button type="button" class="btn yellow bb-coin">🪙 <b>${BASKET_COST}</b>${coinI(16)} <span class="zh">投币开始</span> Play</button><button type="button" class="btn white small bb-close">关闭 Close</button></div>
      <div class="bb-boardbox"></div>
    </div>`;
  const court = $('.bb-court', box), hoop = $('.bb-hoop', box), ball = $('.bb-ball', box), msg = $('.bb-msg', box);
  const coinBtn = $('.bb-coin', box), boardBox = $('.bb-boardbox', box);
  let state = 'idle', hoopX = 50, dir = 1, score = 0, shots = 0, level = 1, flying = false, timeLeft = TIME, raf = 0, last = 0, alive = true, endT = 0;
  const say = (t) => { msg.innerHTML = t; hydrateIcons(msg); };
  const showBoard = (d) => { boardBox.innerHTML = boardHtml(d); };
  showBoard(boardCache); loadBoard().then((d) => { if (alive) showBoard(d); });
  say(`<span class="zh">投币开始！点一下篮球就投篮。</span> Put a coin in, then tap the ball to shoot.<br><small>${TIME}s · ${LEVELS} levels × ${PER_LEVEL} balls · ${TICKET} 5+ goals = 1 ticket · 🥇 new No.1 = 5 tickets</small>`);
  const hud = () => {
    $('.bb-level', box).textContent = `LV ${level}`; $('.bb-time', box).textContent = `⏱ ${Math.max(0, Math.ceil(timeLeft))}`;
    $('.bb-score', box).textContent = `🏀 ${score}`;
    $('.bb-left', box).innerHTML = Array.from({ length: BALLS }, (_, i) => `<i class="${i < shots ? 'used' : ''}"></i>`).join('');
  };
  hud();

  function loop(t) {
    if (!alive || !box.isConnected) { alive = false; return; }
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    if (state === 'playing') {
      hoopX += dir * SPEED[level - 1] * dt;
      if (hoopX > 84) { hoopX = 84; dir = -1; } else if (hoopX < 16) { hoopX = 16; dir = 1; }
      hoop.style.left = `${hoopX}%`;
      timeLeft = Math.max(0, (endT - performance.now()) / 1000);
      $('.bb-time', box).textContent = `⏱ ${Math.ceil(timeLeft)}`;
      if (timeLeft <= 0 && !flying) return finish();
    }
    raf = requestAnimationFrame(loop);
  }

  coinBtn.onclick = () => {
    if (state !== 'idle') return;
    if (S.get().coins < BASKET_COST) return toast(`金币不够 · You need ${BASKET_COST} coins`);
    S.get().coins -= BASKET_COST; S.save(); sfx.arcade && sfx.arcade();
    state = 'playing'; score = 0; shots = 0; level = 1; timeLeft = TIME; flying = false; dir = Math.random() < 0.5 ? 1 : -1; hoopX = 50;
    endT = performance.now() + TIME * 1000; last = 0;
    coinBtn.disabled = true; ball.disabled = false; court.classList.add('on');
    say('<span class="zh">看准了再投！</span> Watch the hoop… tap the ball to shoot!'); hud();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  };
  ball.onclick = () => {
    if (state !== 'playing' || flying || shots >= BALLS) return;
    flying = true; shots++; hud(); sfx.click();
    const start = court.clientHeight - ball.offsetHeight - 14, top = hoop.offsetTop + 8;
    ball.classList.add('flying');
    ball.animate([{ transform: 'translate(-50%, 0) scale(1)' }, { transform: `translate(-50%, ${-(start - top)}px) scale(.62)` }], { duration: FLY_MS, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
    setTimeout(() => {
      const made = Math.abs(hoopX - 50) <= RIM;
      if (made) {
        score++; sfx.coin(); flash('✨ <b>NICE!</b>');
        ball.animate([{ transform: `translate(-50%, ${-(start - top)}px) scale(.62)` }, { transform: `translate(-50%, ${-(start - top) + 46}px) scale(.55)`, opacity: 0 }], { duration: 260, fill: 'forwards' });
      } else {
        sfx.miss(); flash('😮 <span class="zh">差一点</span> Miss');
        const side = hoopX > 50 ? -1 : 1;
        ball.animate([{ transform: `translate(-50%, ${-(start - top)}px) scale(.62)` }, { transform: `translate(calc(-50% + ${side * 70}px), 0px) scale(.8)`, opacity: 0 }], { duration: 420, fill: 'forwards' });
      }
      hud();
      setTimeout(() => {
        ball.getAnimations().forEach((a) => a.cancel()); ball.classList.remove('flying'); flying = false;
        if (shots >= BALLS) return finish();
        const nl = Math.min(LEVELS, Math.floor(shots / PER_LEVEL) + 1);
        if (nl !== level) { level = nl; hud(); flash(`⬆️ <b>LEVEL ${level}</b>`); sfx.correct && sfx.correct(); }
        if (state === 'playing' && timeLeft <= 0) finish();
      }, made ? 280 : 440);
    }, FLY_MS);
  };
  function flash(t) { const f = $('.bb-flash', box); f.innerHTML = t; f.classList.remove('show'); void f.offsetWidth; f.classList.add('show'); }

  async function finish() {
    if (state !== 'playing') return;
    state = 'done'; cancelAnimationFrame(raf); ball.disabled = true; court.classList.remove('on');
    say(`⏱ <span class="zh">时间到！</span> Time's up — <b>${score}</b> goal${score === 1 ? '' : 's'}. <small>Saving…</small>`);
    let res = null;
    try { res = await rpc('arcade_basket_submit', { p_score: score, p_name: S.get().kitten.name || '' }); } catch { /* shown below */ }
    if (!alive) return;
    if (res) {
      boardCache = res; showBoard(res);
      const won = res.awarded || 0;
      if (won) { sfx.fanfare(); if (res.first) confetti(); }
      say(`🏀 <b>${score}</b> <span class="zh">个球进了！</span> goals!` +
        (res.first ? `<br>🥇 <span class="zh">你是第一名！</span> You're No.1 on the leaderboard!` : '') +
        (won ? `<br>${TICKET} <b>+${won}</b> <span class="zh">张奖券</span> ticket${won > 1 ? 's' : ''} — swap them for prizes at the prize counter.` : `<br><small>${TICKET} <span class="zh">进5个球就有奖券</span> Score 5+ goals to win a ticket.</small>`));
    } else say(`🏀 <b>${score}</b> goals! <small>(Couldn't reach the leaderboard — tickets need an internet connection.)</small>`);
    coinBtn.disabled = false; state = 'idle'; hoop.style.left = '50%';
    onDone();
  }
  $('.bb-close', box).onclick = () => { if (state === 'playing') { toast('游戏进行中 · Finish this game first'); return; } alive = false; cancelAnimationFrame(raf); closeModal(); };
  openModal(box); hydrateIcons(box);
}

// ---------- 🎟️ the prize counter: swap tickets for prizes (the admin can change the costs here) ----------
export async function openPrizes() {
  const admin = Places.isAdmin();
  const box = html`<div class="card stack prize-card"><div class="h-title">🎟️ <span class="zh">兑奖处</span> Prize counter</div>
      <div class="prize-have"></div><div class="prize-list"><p class="help">…</p></div>
      <p class="help" style="margin:0"><span class="zh">奖券只能在游戏厅赢，不能送人，也不能用金币买。</span><br>Tickets are won at the arcade only (5+ basketball goals, or taking 1st place). They can't be given away or bought with coins.</p>
      <button type="button" class="btn white prize-close">关闭 Close</button></div>`;
  $('.prize-close', box).onclick = closeModal;
  openModal(box);
  const list = $('.prize-list', box);
  async function load() {
    let d = null;
    try { d = await rpc('arcade_prizes'); } catch { list.innerHTML = '<p class="help">连不上 · Could not load the prizes — check your connection.</p>'; return; }
    if (!box.isConnected) return;
    const have = d.tickets || 0, costs = d.prizes || {};
    $('.prize-have', box).innerHTML = `<span class="zh">我的奖券</span> My tickets: <b>${TICKET} ${have}</b>`;
    list.innerHTML = '';
    ARCADE_PRIZES.filter((id) => costs[id] != null && ITEMS[id]).forEach((id) => {
      const it = ITEMS[id], cost = costs[id];
      const row = html`<div class="prize-row"><span class="art"></span><span class="nm"><span class="zh">${it.name}</span><small>${it.en}</small></span>
          <span class="cost">${TICKET} <b>${cost}</b></span>
          ${admin ? `<span class="prize-admin"><input type="number" min="1" max="9999" value="${cost}" aria-label="Ticket cost"><button type="button" class="btn small white p-save">💾</button></span>` : ''}
          <button type="button" class="btn small green p-get" ${have >= cost ? '' : 'disabled'}><span class="zh">兑换</span> Get</button></div>`;
      $('.art', row).append(spriteCanvas(id, 60));
      $('.p-get', row).onclick = async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try {
          const r = await rpc('arcade_redeem', { p_item: id });
          if (r && r.item === id) { S.grantItem(id); S.save(); sfx.fanfare(); toast(`🎁 <span class="zh">${it.name}</span> ${it.en} — in your storage box 储物箱里`, { ms: 3000 }); }
        } catch { toast('奖券不够或连不上 · Not enough tickets, or no connection'); }
        load();
      };
      const sv = $('.p-save', row);
      if (sv) sv.onclick = async () => {
        const v = Math.round(+$('input', row).value);
        if (!(v >= 1 && v <= 9999)) return toast('1–9999 tickets');
        try { await rpc('arcade_set_cost', { p_item: id, p_cost: v }); toast(`💾 ${it.en}: ${v} tickets`); } catch { toast('Could not save'); }
        load();
      };
      list.append(row);
    });
    hydrateIcons(box);
  }
  load();
}
