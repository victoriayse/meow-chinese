// 🏀 The arcade's basketball machine and 🎟️ prize counter.
// Basketball: 5 coins a game, 30 seconds, as many shots as she can. The hoop slides left and right; every 3 goals is
// the next level (5 levels), and the hoop gets faster. Tap the ball to shoot it straight up — no aiming lines.
// Every ball through the hoop is 1 point. Tickets (kept on the server, can't be traded), by goals in one game:
// 5 → 1 · 8 → 3 · 15 → 4 · 25 → 6.
// Prizes are bought with tickets only, at the prize counter / kiosk. The admin can change each prize's ticket cost there.
import * as S from './state.js';
import * as Places from './places.js';
import { ITEMS, spriteCanvas, ARCADE_PRIZES } from './pixel.js';
import { rest } from './cloud.js';
import { html, $, esc, openModal, closeModal, toast, coinI, hydrateIcons, confetti } from './ui.js';
import { sfx } from './audio.js';

const rpc = (name, body = {}) => rest('rpc/' + name, { method: 'POST', body: JSON.stringify(body) });
export const BASKET_COST = 5;
const TIME = 30, LEVELS = 5, PER_LEVEL = 3;
export const TIERS = [[5, 1], [8, 3], [15, 4], [25, 6]];   // goals in one game → tickets (the server decides)
const SPEED = [16, 24, 33, 44, 56];        // how fast the hoop slides at each level (% of the court a second)
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
  say(`<span class="zh">投币开始！点一下篮球就投篮。</span> Put a coin in, then tap the ball to shoot.<br><small>${TIME}s · <span class="zh">每进${PER_LEVEL}球升一级</span> every ${PER_LEVEL} goals = next level (up to ${LEVELS})</small>`);
  const hud = () => {
    $('.bb-level', box).textContent = `LV ${level}`; $('.bb-time', box).textContent = `⏱ ${Math.max(0, Math.ceil(timeLeft))}`;
    $('.bb-score', box).textContent = `🏀 ${score}`;
    $('.bb-left', box).innerHTML = TIERS.map(([g, t]) => `<span class="${score >= g ? 'got' : ''}">${g}🏀 → ${TICKET}${t}</span>`).join('');
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
  // a shot: the ball rises above the rim, then drops. It only counts if its middle is inside the rim when it comes
  // down to rim height — then it falls through the net (moving with the hoop). Otherwise it clips the rim or drops past.
  const animate = (ms, step) => new Promise((done) => { const t0 = performance.now(); const f = (t) => { const k = Math.min(1, (t - t0) / ms); step(k); if (k < 1 && alive) requestAnimationFrame(f); else done(); }; requestAnimationFrame(f); });
  ball.onclick = async () => {
    if (state !== 'playing' || flying || timeLeft <= 0) return;
    flying = true; shots++; hud(); sfx.click();
    const W = court.clientWidth, H = court.clientHeight, R0 = ball.offsetWidth / 2;
    const x0 = W / 2, y0 = H - 14 - R0;                                  // ball centre at rest
    const rim = $('.bb-rim', hoop), rimY = hoop.offsetTop + rim.offsetTop + rim.offsetHeight / 2, rimHalf = rim.offsetWidth / 2;
    const rimX = () => (hoopX / 100) * W;
    const S1 = 0.6, peakY = rimY - 48;
    let bx = x0, by = y0, sc = 1;
    const draw = () => { ball.style.transform = `translate(calc(-50% + ${bx - x0}px), ${by - y0}px) scale(${sc})`; };
    ball.classList.add('flying'); ball.style.zIndex = '';
    await animate(300, (k) => { const e = 1 - (1 - k) ** 2; by = y0 + (peakY - y0) * e; sc = 1 + (S1 - 1) * e; draw(); });
    await animate(110, (k) => { by = peakY + (rimY - peakY) * k * k; draw(); });
    const r = R0 * S1, dx = bx - rimX(), clean = Math.abs(dx) <= rimHalf - r * 0.8, onRim = !clean && Math.abs(dx) <= rimHalf + r;
    if (clean) {
      ball.style.zIndex = '1';                                            // behind the net now
      const sx = bx;
      await animate(300, (k) => { bx = sx + (rimX() - sx) * Math.min(1, k * 1.6); by = rimY + 46 * k; sc = S1 - 0.08 * k; ball.style.opacity = k > 0.75 ? String(1 - (k - 0.75) * 4) : '1'; draw(); });
      score++; sfx.coin(); flash('✨ <b>NICE!</b>'); hud();
    } else if (onRim) {
      sfx.miss(); flash('😮 <span class="zh">碰到篮框了</span> Off the rim!');
      const dir = dx >= 0 ? 1 : -1, sx = bx, sy = by;
      await animate(480, (k) => { bx = sx + dir * 80 * k; by = sy - 34 * Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k) + (y0 - sy) * k * k; sc = S1 + (0.85 - S1) * k; ball.style.opacity = k > 0.8 ? String(1 - (k - 0.8) * 5) : '1'; draw(); });
    } else {
      sfx.miss(); flash('😮 <span class="zh">没进</span> Miss');
      const sy = by;
      await animate(380, (k) => { by = sy + (y0 - sy) * k * k; sc = S1 + (0.85 - S1) * k; ball.style.opacity = k > 0.8 ? String(1 - (k - 0.8) * 5) : '1'; draw(); });
    }
    if (!alive) return;
    ball.style.transform = ''; ball.style.opacity = ''; ball.style.zIndex = ''; ball.classList.remove('flying'); flying = false;
    const nl = Math.min(LEVELS, Math.floor(score / PER_LEVEL) + 1);
    if (nl !== level) { level = nl; hud(); flash(`⬆️ <b>LEVEL ${level}</b>`); sfx.correct && sfx.correct(); }
    if (state === 'playing' && timeLeft <= 0) finish();
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
      if (won) { sfx.fanfare(); if (won >= 4) confetti(); }
      say(`🏀 <b>${score}</b> <span class="zh">个球进了！</span> goals!` +
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
      <div class="row prize-top"><div class="prize-have"></div>${admin ? '<button type="button" class="btn small yellow prize-edit">✏️ <span class="zh">改价钱</span> Edit costs</button>' : ''}</div>
      <div class="prize-list"><p class="help">…</p></div>
      <p class="help" style="margin:0"><span class="zh">奖券只能在游戏厅赢，不能送人，也不能用金币买。</span><br>Tickets are won at the arcade only (basketball: 5 goals = 1, 8 = 3, 15 = 4, 25 = 6). They can't be given away or bought with coins.</p>
      <button type="button" class="btn white prize-close">关闭 Close</button></div>`;
  $('.prize-close', box).onclick = closeModal;
  openModal(box);
  const list = $('.prize-list', box), editBtn = $('.prize-edit', box);
  let editing = false, costs = {};
  // ✏️ the admin: one tap turns every cost into a number box, one more tap saves them all
  if (editBtn) editBtn.onclick = async () => {
    if (!editing) { editing = true; draw(); return; }
    const changes = [...list.querySelectorAll('.prize-row input')].map((i) => [i.dataset.id, Math.round(+i.value)]).filter(([id, v]) => v !== costs[id]);
    if (changes.some(([, v]) => !(v >= 1 && v <= 9999))) return toast('1–9999 tickets');
    editBtn.disabled = true;
    try { for (const [id, v] of changes) await rpc('arcade_set_cost', { p_item: id, p_cost: v }); if (changes.length) toast(`💾 ${changes.length} cost${changes.length > 1 ? 's' : ''} saved`); }
    catch { toast('Could not save'); }
    editBtn.disabled = false; editing = false; load();
  };
  let have = 0;
  function draw() {
    if (editBtn) editBtn.innerHTML = editing ? '💾 <span class="zh">保存</span> Save' : '✏️ <span class="zh">改价钱</span> Edit costs';
    list.innerHTML = '';
    ARCADE_PRIZES.filter((id) => costs[id] != null && ITEMS[id]).forEach((id) => {
      const it = ITEMS[id], cost = costs[id];
      const row = html`<div class="prize-row"><span class="art"></span><span class="nm"><span class="zh">${it.name}</span><small>${it.en}</small></span>
          ${editing ? `<span class="cost">${TICKET} <input type="number" min="1" max="9999" value="${cost}" data-id="${id}" aria-label="Ticket cost"></span>` : `<span class="cost">${TICKET} <b>${cost}</b></span>`}
          <button type="button" class="btn small green p-get" ${have >= cost && !editing ? '' : 'disabled'}><span class="zh">兑换</span> Get</button></div>`;
      $('.art', row).append(spriteCanvas(id, 60));
      $('.p-get', row).onclick = async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try {
          const r = await rpc('arcade_redeem', { p_item: id });
          if (r && r.item === id) { S.grantItem(id); S.save(); sfx.fanfare(); toast(`🎁 <span class="zh">${it.name}</span> ${it.en} — in your storage box 储物箱里`, { ms: 3000 }); }
        } catch { toast('奖券不够或连不上 · Not enough tickets, or no connection'); }
        load();
      };
      list.append(row);
    });
    hydrateIcons(box);
  }
  async function load() {
    let d = null;
    try { d = await rpc('arcade_prizes'); } catch { list.innerHTML = '<p class="help">连不上 · Could not load the prizes — check your connection.</p>'; return; }
    if (!box.isConnected) return;
    have = d.tickets || 0; costs = d.prizes || {};
    $('.prize-have', box).innerHTML = `<span class="zh">我的奖券</span> My tickets: <b>${TICKET} ${have}</b>`;
    draw();
  }
  load();
}
