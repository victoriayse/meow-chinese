// ⚽ The Stadium: a soccer match for 2–8 cats (equal teams).
// The server keeps the match (teams, score, timer) so everyone sees the same thing.
// The ball is simulated on every screen; whoever kicked it last sends its new speed to everyone,
// and any player whose screen sees it cross a goal line reports the goal (the server counts each goal once).
import * as S from './state.js';
import { rest } from './cloud.js';
import { html, $, toast, confirmBox, openModal, closeModal, coinI, hydrateIcons, confetti } from './ui.js';
import { sfx } from './audio.js';
import { drawGrid, artGrid } from './pixel.js';

const rpc = (name, body = {}) => rest('rpc/' + name, { method: 'POST', body: JSON.stringify(body) });
export const FEE = 10, PRIZE = 20, WIN_AT = 10, TEAM_MAX = 4;   // each winner gets 2× their fee back, however many play
// the pitch, in the room's % units (x from the left, y up from the bottom); the room is 720 × 600
export const PITCH = { x0: 3.5, x1: 96.5, y0: 1, y1: 54, mouth: [14, 38], line: 1.5, cx: 50, cy: 26 };
const PX = 7.2, PY = 6;                         // room px per % (x, y)
const KICK = 420, FRICTION = 0.9, BOUNCE = 0.75;
const TEAM = { red: { zh: '红队', en: 'Red', dot: '🔴' }, blue: { zh: '蓝队', en: 'Blue', dot: '🔵' } };
const BALL_ART = ['..oooo..', '.owwkwo.', 'owwkkkwo', 'owwwkwwo', 'okwwwwko', 'okkwwkko', '.owwkko.', '..oooo..'];
const BALL_PAL = { o: '#3a2a35', w: '#ffffff', k: '#3a2a35' };

const errText = (e) => {
  const m = String((e && e.message) || e || '');
  if (/in progress/.test(m)) return '比赛进行中 · A match is already being played — watch from the stands!';
  if (/team full/.test(m)) return '这队满了 · That team is full (4 players)';
  if (/equal/.test(m)) return '两队人数要一样 · Both teams need the same number of players';
  if (/join a team/.test(m)) return '先选一队 · Join a team first';
  return '连不上，再试一次 · Couldn\'t connect — try again';
};

export function createStadium({ me, ch, others, getMine, getMyEl, teleport }) {
  const ball = { x: PITCH.cx, y: PITCH.cy, vx: 0, vy: 0, owner: null, spin: 0 };
  let room = null, hud = null, ballEl = null, raf = 0, last = 0;
  let match = null, offset = 0, lastKick = 0, lastSync = 0, pendingGoal = 0, busy = false, polling = false, lastScore = -1, lastStatus = null, alive = true;

  const myTicket = () => S.get().stadiumTicket || null;
  const live = () => match && (match.status === 'lobby' || match.status === 'playing');
  const myPlayer = () => live() && (match.players || []).find((p) => p.id === me);
  const playing = () => match && match.status === 'playing';
  const count = (side) => (live() && match.players || []).filter((p) => p.side === side).length;

  // ---------- the ball ----------
  function resetBall() { Object.assign(ball, { x: PITCH.cx, y: PITCH.cy, vx: 0, vy: 0, owner: null }); pendingGoal = 0; drawBall(); }
  function drawBall() {
    if (!ballEl || !ballEl.isConnected) return;
    ballEl.style.left = `${ball.x}%`; ballEl.style.bottom = `${ball.y}%`;
    ballEl.style.zIndex = 2 + Math.round(100 - ball.y);
    ballEl.firstChild.style.transform = `rotate(${ball.spin}deg)`;
  }
  function loop(t) {
    raf = 0; if (!alive) return;
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    if ((ball.vx || ball.vy) && !pendingGoal) {
      const px = ball.x, py = ball.y;
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      const f = Math.exp(-FRICTION * dt); ball.vx *= f; ball.vy *= f;
      if (Math.hypot(ball.vx * PX, ball.vy * PY) < 8) { ball.vx = 0; ball.vy = 0; }
      if (ball.y < PITCH.y0) { ball.y = PITCH.y0; ball.vy = Math.abs(ball.vy) * BOUNCE; }
      if (ball.y > PITCH.y1) { ball.y = PITCH.y1; ball.vy = -Math.abs(ball.vy) * BOUNCE; }
      const inMouth = ball.y >= PITCH.mouth[0] && ball.y <= PITCH.mouth[1];
      if (ball.x < PITCH.x0 || ball.x > 100 - PITCH.x0) {
        if (!inMouth && px >= PITCH.x0 && px <= 100 - PITCH.x0) {   // the side boards: bounce back
          ball.x = Math.max(PITCH.x0, Math.min(100 - PITCH.x0, ball.x)); ball.vx = -ball.vx * BOUNCE;
        } else if (!inMouth) {                                      // inside the goal: the net's sides
          ball.y = Math.max(PITCH.mouth[0], Math.min(PITCH.mouth[1], ball.y)); ball.vy = -ball.vy * BOUNCE;
        }
      }
      if (ball.x < PITCH.line) scored('blue');
      else if (ball.x > 100 - PITCH.line) scored('red');
      ball.spin += (ball.x - px) * 40;
      // the last kicker keeps everyone's ball in step while it rolls
      if (ball.owner === me && Date.now() - lastSync > 500) sendBall();
    }
    if (pendingGoal && Date.now() - pendingGoal > 3500) resetBall();   // nobody counted it: carry on
    drawBall(); paintTeams();
    raf = requestAnimationFrame(loop);
  }
  const start = () => { if (!raf && alive) { last = 0; raf = requestAnimationFrame(loop); } };
  function sendBall() { lastSync = Date.now(); ch.send('ball', { id: me, x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, m: match && match.id }); }

  // her own kicks: walking into the ball pushes it the way she is walking
  // the lower half of the cat's body plus her name tag, as drawn on screen (in screen px)
  function bodyBox(el) {
    const cv = el.querySelector('.kflip canvas'), tag = el.querySelector('.nametag');
    if (!cv) return null;
    const c = cv.getBoundingClientRect(), t = tag ? tag.getBoundingClientRect() : c;
    const ix = c.width * 0.1;                                   // trim the empty edges of the picture
    return { l: Math.min(c.left + ix, t.left), r: Math.max(c.right - ix, t.right), t: c.top + c.height * 0.5, b: Math.max(c.bottom, t.bottom) };   // the lower half of her body + the name tag
  }
  // her own kicks: when her lower body or name tag walks into the ball, it rolls the way she is walking
  function step(dx, dy) {
    const mine = getMine(), el = getMyEl();
    if (!playing() || !myPlayer() || pendingGoal || mine.seat || (!dx && !dy) || !el || !ballEl || !ballEl.isConnected) return;
    if (Date.now() - lastKick < 180) return;
    const box = bodyBox(el), br = ballEl.firstChild.getBoundingClientRect();
    if (!box || !br.width) return;
    const cx = br.left + br.width / 2, cy = br.top + br.height / 2, rad = br.width / 2;
    // the nearest point of her to the ball's centre: touching if it is within the ball
    const nx = Math.max(box.l, Math.min(box.r, cx)), ny = Math.max(box.t, Math.min(box.b, cy));
    if (Math.hypot(cx - nx, cy - ny) > rad + 2) return;
    const mx = dx, my = -dy;                                    // her walking direction on screen (y points down)
    const ax = cx - (box.l + box.r) / 2, ay = cy - (box.t + box.b) / 2;   // from her middle to the ball
    const inside = nx === cx && ny === cy;
    if (!inside && mx * ax + my * ay <= 0) return;              // walking away from it: no kick
    const ml = Math.hypot(mx, my) || 1, al = Math.hypot(ax, ay) || 1;
    let ux = (mx / ml) * 0.75 + (ax / al) * 0.25, uy = (my / ml) * 0.75 + (ay / al) * 0.25;
    const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
    ball.vx = (ux * KICK) / PX; ball.vy = (-uy * KICK) / PY; ball.owner = me;
    lastKick = Date.now(); sendBall(); sfx.click(); start();
  }
  function onBall(p) {
    if (!match || p.m !== match.id || pendingGoal) return;
    Object.assign(ball, { x: +p.x || PITCH.cx, y: +p.y || PITCH.cy, vx: +p.vx || 0, vy: +p.vy || 0, owner: p.id });
    start();
  }

  async function scored(side) {
    if (pendingGoal) return;
    pendingGoal = Date.now(); ball.vx = 0; ball.vy = 0;
    ball.x = side === 'blue' ? PITCH.line : 100 - PITCH.line;
    const m = match;
    if (!m || !myPlayer()) return;      // players report goals; everyone else waits for the score
    try { apply(await rpc('stadium_goal', { p_match: m.id, p_no: m.red + m.blue + 1, p_side: side })); ch.send('match', { id: me }); }
    catch { /* another player's report will count it */ }
  }

  // ---------- the match (from the server) ----------
  async function poll() {
    if (polling || !alive) return; polling = true;
    try { apply(await rpc('stadium_state', { p_ticket: (myTicket() || {}).match || null })); }
    catch { /* keep the last score while offline */ }
    finally { polling = false; }
  }
  function apply(st) {
    if (!st) return;
    if (st.now) offset = Date.parse(st.now) - Date.now();
    const prev = match; match = st.match || null;
    const hadTicket = !!(myTicket() && match && myTicket().match === match.id);
    if (st.ticket !== undefined) settle(st.ticket);
    const score = match ? match.red + match.blue : -1, status = match && match.status;
    const sameMatch = prev && match && prev.id === match.id;
    if (match && status === 'playing' && !(sameMatch && prev.status === 'playing')) { resetBall(); kickoff(); if (sameMatch) { sfx.fanfare(); toast('⚽ <span class="zh">比赛开始！</span> Kick-off! First to 10 goals wins', { ms: 2600 }); } }
    else if (sameMatch && score !== lastScore && score > 0 && status !== 'lobby') {
      const side = match.red > prev.red ? 'red' : 'blue';
      sfx.correct(); toast(`⚽ <span class="zh">进球！</span> GOAL for ${TEAM[side].dot} ${TEAM[side].en}! ${match.red} : ${match.blue}`, { ms: 2200 });
      resetBall(); if (status === 'playing') kickoff();
    }
    if (sameMatch && status === 'done' && lastStatus === 'playing' && !hadTicket) {
      toast(`🏆 ${TEAM[match.winner].dot} <span class="zh">${TEAM[match.winner].zh}赢了！</span> ${TEAM[match.winner].en} team wins ${match.red} : ${match.blue}`, { ms: 4000 });
    }
    if (sameMatch && status === 'cancelled' && lastStatus === 'playing' && !hadTicket) {
      toast('⏹ <span class="zh">比赛结束了</span> The match was ended early — no winner this time', { ms: 3000 });
    }
    if (!match || status !== 'playing') { if (!sameMatch || prev.status === 'playing') resetBall(); }
    lastScore = score; lastStatus = status;
    drawHud();
  }
  // at kick-off each player goes back to their own half
  function kickoff() {
    const p = myPlayer(); if (!p) return;
    teleport(p.side === 'red' ? 30 : 70, PITCH.cy - 3 + Math.random() * 6);
  }
  // pay-out: each winner gets their coins back doubled (FEE → PRIZE); a cancelled match refunds everyone
  function settle(t) {
    const tk = myTicket(); if (!tk) return;
    if (!t || t.id !== tk.match) return;
    const finish = (coins) => { delete S.get().stadiumTicket; if (coins) S.get().coins += coins; S.save(); };
    if (t.status === 'done') {
      const won = t.winner === tk.side; finish(won ? PRIZE : 0);
      showResult(t, tk.side, won);
    } else if (t.status === 'cancelled' || (t.status === 'lobby' && !t.side)) {
      finish(FEE); toast(`⏹ <span class="zh">比赛结束，退回${FEE}金币</span> Match ended with no winner — ${FEE} coins returned`, { coins: FEE });
    }
  }
  function showResult(t, side, won) {
    const w = TEAM[t.winner];
    const box = html`<div class="card stack stadium-result"><div class="h-title">${won ? '🏆 <span class="zh">恭喜！你们赢了！</span> Congratulations!' : '⚽ <span class="zh">比赛结束</span> Full time'}</div>
      <div class="stadium-final"><span class="red">🔴 ${t.red}</span> : <span class="blue">${t.blue} 🔵</span></div>
      <p>${w.dot} <b><span class="zh">${w.zh}</span> ${w.en} team</b> wins!</p>
      <p class="help">${won ? `<b>+${PRIZE}</b>${coinI(18)} <span class="zh">你的${FEE}金币回来了，还多赢了${PRIZE - FEE}个！</span><br>You get your ${FEE} coins back plus ${PRIZE - FEE} more.` : '<span class="zh">下次加油！</span> Good game — try again next time!'}</p>
      <button class="btn green sr-ok">好 OK</button></div>`;
    $('.sr-ok', box).onclick = closeModal; openModal(box); hydrateIcons(box);
    if (won) { confetti(); sfx.fanfare(); }
  }

  // ---------- buttons ----------
  async function join(side) {
    if (busy) return;
    if (S.get().tennisTicket) return toast('🎾 <span class="zh">先打完网球赛</span> Finish your tennis match first');
    const tk = myTicket();
    if (tk && (!match || tk.match !== match.id)) { poll(); return toast('正在结算上一场 · Finishing your last match — try again in a moment'); }
    const p = myPlayer();
    if (p && p.side === side) return;
    if (!p) {
      if (S.get().coins < FEE) return toast(`金币不够 · You need ${FEE} coins to play`);
      const ok = await confirmBox(`${TEAM[side].dot} <span class="zh">加入${TEAM[side].zh}？</span> Join ${TEAM[side].en}?`,
        `<span class="zh">每场比赛要付 ${FEE} 金币。赢的队每人拿回 ${PRIZE} 金币！</span><br>A match costs ${FEE} coins. Each winner gets ${PRIZE} coins back (your ${FEE} + ${PRIZE - FEE} more).`, `付 ${FEE} Pay`, '取消 Cancel');
      if (!ok) return;
      if (S.get().coins < FEE) return;
    }
    busy = true;
    try {
      const st = await rpc('stadium_join', { p_side: side, p_name: S.get().kitten.name || '' });
      if (!p && st && st.match) { S.get().coins -= FEE; S.get().stadiumTicket = { match: st.match.id, side }; S.save(); sfx.coin(); }
      else if (st && st.match && myTicket()) { S.get().stadiumTicket.side = side; S.save(); }
      apply({ ...st, ticket: undefined }); ch.send('match', { id: me });
    } catch (e) { toast(errText(e)); }
    finally { busy = false; drawHud(); }
  }
  async function leave() {
    if (busy) return; busy = true;
    try {
      const r = await rpc('stadium_leave');
      const tk = myTicket();
      if (r && r.left && tk && tk.match === r.match) { delete S.get().stadiumTicket; S.get().coins += FEE; S.save(); toast(`↩️ <span class="zh">退回${FEE}金币</span> ${FEE} coins returned`, { coins: FEE }); }
      ch.send('match', { id: me }); await poll();
    } catch (e) { toast(errText(e)); }
    finally { busy = false; drawHud(); }
  }
  async function begin() {
    if (busy) return; busy = true;
    try { apply({ ...(await rpc('stadium_start')), ticket: undefined }); ch.send('match', { id: me }); }
    catch (e) { toast(errText(e)); }
    finally { busy = false; drawHud(); }
  }

  // any player can stop a match early: nobody wins and everyone gets their coins back
  async function end() {
    if (busy || !playing() || !myPlayer()) return;
    const ok = await confirmBox('⏹ <span class="zh">结束比赛？</span> End the match?',
      `<span class="zh">比赛会停止，没有赢家。每个人拿回 ${FEE} 金币。</span><br>The match stops with no winner. Everyone gets their ${FEE} coins back.`, '结束 End', '继续踢 Keep playing');
    if (!ok || !playing()) return;
    busy = true;
    try { apply(await rpc('stadium_end', { p_match: match.id })); ch.send('match', { id: me }); }
    catch (e) { toast(errText(e)); }
    finally { busy = false; drawHud(); }
  }

  // ---------- the scoreboard and team buttons ----------
  function clock() {
    if (!match || !match.startedAt) return '00:00';
    const end = match.endedAt ? Date.parse(match.endedAt) : Date.now() + offset;
    const s = Math.max(0, Math.floor((end - Date.parse(match.startedAt)) / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  function drawHud() {
    if (!hud || !hud.isConnected) return;
    const m = match, st = m ? m.status : 'none', p = myPlayer(), r = count('red'), b = count('blue');
    $('.sb-red', hud).textContent = m && st !== 'lobby' ? m.red : 0;
    $('.sb-blue', hud).textContent = m && st !== 'lobby' ? m.blue : 0;
    $('.sb-clock', hud).textContent = st === 'playing' || st === 'done' ? clock() : '00:00';
    const lobby = $('.st-lobby', hud), info = $('.st-info', hud);
    const open = !m || st !== 'playing';
    lobby.classList.toggle('hidden', !open);
    $('.st-red', hud).innerHTML = `🔴 <span class="zh">红队</span> Red ${r}/${TEAM_MAX}${p && p.side === 'red' ? ' ✓' : ''}`;
    $('.st-blue', hud).innerHTML = `🔵 <span class="zh">蓝队</span> Blue ${b}/${TEAM_MAX}${p && p.side === 'blue' ? ' ✓' : ''}`;
    $('.st-red', hud).disabled = busy || (r >= TEAM_MAX && !(p && p.side === 'red'));
    $('.st-blue', hud).disabled = busy || (b >= TEAM_MAX && !(p && p.side === 'blue'));
    const can = !!p && st === 'lobby' && r === b && r >= 1;
    const go = $('.st-start', hud); go.disabled = !can || busy; go.classList.toggle('hidden', !p);
    $('.st-leave', hud).classList.toggle('hidden', !p || st !== 'lobby');
    const stop = $('.st-end', hud); stop.classList.toggle('hidden', !(p && st === 'playing')); stop.disabled = busy;
    const names = (side) => (m && m.players || []).filter((x) => x.side === side).map((x) => x.name || '🐱').join(', ');
    if (st === 'playing') info.textContent = p ? `⚽ ${TEAM[p.side].dot} 你在${TEAM[p.side].zh} · You're ${TEAM[p.side].en}: score in the ${p.side === 'red' ? 'right ▶' : '◀ left'} goal!` : '⚽ 比赛中 · Match on — cheer from the side!';
    else if (!p) info.textContent = `选一队，付 ${FEE} 金币 · Pick a team (${FEE} coins). 2–8 players, equal teams.`;
    else if (r !== b || r < 1) info.textContent = `等人… 两队人数一样才能开始 · Waiting — teams must be equal to start (🔴${r} : 🔵${b})`;
    else info.textContent = '人齐了！按开始 · Teams are ready — tap Start!';
    const roster = $('.st-roster', hud);
    roster.innerHTML = '';
    if (live() && m.players && m.players.length) ['red', 'blue'].forEach((side) => { const s = document.createElement('span'); s.className = `st-${side}-names`; s.textContent = `${TEAM[side].dot} ${names(side) || '—'}`; roster.append(s); });
  }
  function paintTeams() {
    if (!room || !room.isConnected) return;   // over on the tennis court: the tennis match colours the name tags there
    const team = new Map(((match && match.status !== 'done' && match.status !== 'cancelled' && match.players) || []).map((p) => [p.id, p.side]));
    others.ids().forEach((id) => { const c = others.m.get(id); if (c && c.el) { const t = team.get(id) || ''; if (c.el.dataset.team !== t) c.el.dataset.team = t; } });
    const mine = getMyEl(); if (mine) { const t = team.get(me) || ''; if (mine.dataset.team !== t) mine.dataset.team = t; }
    if (hud && hud.isConnected) { const txt = match && (match.status === 'playing' || match.status === 'done') ? clock() : '00:00'; const el = $('.sb-clock', hud); if (el.textContent !== txt) el.textContent = txt; }
  }

  // ---------- put it in the room (called every time the room is drawn) ----------
  function attach(roomEl) {
    room = roomEl;
    hud = html`<div class="stadium-hud">
      <div class="scoreboard"><span class="sb-team red">🔴 RED</span><b class="sb-red">0</b><span class="sb-colon">:</span><b class="sb-blue">0</b><span class="sb-team blue">BLUE 🔵</span><span class="sb-clock">00:00</span></div>
      <div class="st-panel"><div class="st-lobby"><button type="button" class="btn small st-red"></button><button type="button" class="btn small st-blue"></button>
        <button type="button" class="btn green small st-start">▶ <span class="zh">开始</span> Start</button><button type="button" class="btn white small st-leave">↩ <span class="zh">离开</span> Leave</button></div>
      <div class="st-info"></div><button type="button" class="btn white small st-end hidden">⏹ <span class="zh">结束比赛</span> End game</button><div class="st-roster"></div></div></div>`;
    hud.addEventListener('pointerdown', (e) => e.stopPropagation());
    hud.addEventListener('click', (e) => e.stopPropagation());
    $('.st-red', hud).onclick = () => join('red');
    $('.st-blue', hud).onclick = () => join('blue');
    $('.st-start', hud).onclick = begin;
    $('.st-leave', hud).onclick = leave;
    $('.st-end', hud).onclick = end;
    room.append(hud);
    ballEl = document.createElement('div'); ballEl.className = 'stadium-ball';
    const c = document.createElement('canvas'); drawGrid(c, artGrid(BALL_ART, BALL_PAL), 3.5); ballEl.append(c);
    room.append(ballEl);
    drawHud(); drawBall(); start();
  }
  poll();
  const pt = setInterval(() => { if (!alive) return clearInterval(pt); if (!document.hidden) poll(); }, 2000);
  function stop() { alive = false; clearInterval(pt); if (raf) cancelAnimationFrame(raf); raf = 0; }
  return { attach, step, stop, onBroadcast: (ev, p) => { if (ev === 'ball') onBall(p); else if (ev === 'match') poll(); }, poll };
}

// 🕹️ the stadium's joystick: push the knob any way and she walks that way (further = faster)
export const JOYSTICK = '<div class="joystick" aria-label="Joystick"><div class="joy-knob"></div></div>';
export function joystick(base, { onStep, onStop, canWalk = () => true, isAlive }) {
  const knob = base.querySelector('.joy-knob');
  let vx = 0, vy = 0, raf = 0, lastT = 0, pid = null;
  const loop = (t) => {
    if (!isAlive()) { raf = 0; onStop(); return; }
    const dt = Math.min(0.05, (t - (lastT || t)) / 1000); lastT = t;
    if (vx || vy) { onStep(vx, vy, dt); raf = requestAnimationFrame(loop); }
    else { raf = 0; lastT = 0; onStop(); }
  };
  const aim = (e) => {
    const r = base.getBoundingClientRect(), R = r.width / 2;
    let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R;
    const d = Math.hypot(x, y); if (d > 1) { x /= d; y /= d; }
    const dz = Math.hypot(x, y) < 0.18;                 // a little dead zone in the middle
    vx = dz ? 0 : x; vy = dz ? 0 : -y;
    knob.style.transform = `translate(${x * R * 0.55}px, ${y * R * 0.55}px)`;
    if ((vx || vy) && !raf && canWalk()) raf = requestAnimationFrame(loop);
  };
  const release = () => { pid = null; vx = 0; vy = 0; knob.style.transform = ''; base.classList.remove('down'); };
  base.addEventListener('pointerdown', (e) => {
    if (!canWalk()) return;
    e.preventDefault(); e.stopPropagation(); pid = e.pointerId;
    try { base.setPointerCapture(e.pointerId); } catch {}
    base.classList.add('down'); aim(e);
  });
  base.addEventListener('pointermove', (e) => { if (e.pointerId === pid) { e.preventDefault(); aim(e); } });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => base.addEventListener(ev, (e) => { if (e.pointerId === pid) release(); }));
  base.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  base.addEventListener('contextmenu', (e) => e.preventDefault());
}
