// The kitten's flip phone: mail, notifications, calculator, clock (time / timer / alarm) and notepad.
import * as S from './state.js';
import { ITEMS, spriteCanvas } from './pixel.js';
import { $, html, esc, toast, openModal, closeModal, confetti, coinI, hydrateIcons } from './ui.js';
import { sfx, speak } from './audio.js';
import { acceptedFriends, refreshFriends, sendLetter, errorText, LETTER_MAX, setActivity, isOnline, doingText, lastSeen } from './friends.js';

const pad2 = (n) => String(n).padStart(2, '0');
const when = (t) => new Date(t).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const NOTI_ICON = { essay: '📝', feed: '🐟', gift: '🎁' };

// a little flip phone drawn in SVG, used on the home screen
export const PHONE_ICON = `<svg viewBox="0 0 32 40" width="34" height="42" aria-hidden="true" shape-rendering="crispEdges">
  <rect x="5" y="1" width="22" height="17" rx="3" fill="#2b2140"/><rect x="7" y="3" width="18" height="13" rx="1" fill="#8fe3ff"/>
  <rect x="9" y="6" width="5" height="1" fill="#fff"/><rect x="9" y="9" width="10" height="1" fill="#fff"/>
  <rect x="4" y="18" width="24" height="3" fill="#c94f7c"/>
  <rect x="5" y="21" width="22" height="18" rx="3" fill="#ff8fb1"/><rect x="5" y="21" width="22" height="18" rx="3" fill="none" stroke="#2b2140" stroke-width="2"/>
  <g fill="#fff"><rect x="9" y="25" width="4" height="3"/><rect x="14" y="25" width="4" height="3"/><rect x="19" y="25" width="4" height="3"/>
  <rect x="9" y="30" width="4" height="3"/><rect x="14" y="30" width="4" height="3"/><rect x="19" y="30" width="4" height="3"/></g>
</svg>`;

const APPS = [
  { key: 'mail', icon: '💬', zh: '信息', en: 'Messages' },
  { key: 'noti', icon: '🔔', zh: '通知', en: 'Alerts' },
  { key: 'calc', icon: '🧮', zh: '计算器', en: 'Calc' },
  { key: 'clock', icon: '⏰', zh: '时钟', en: 'Clock' },
  { key: 'notes', icon: '📒', zh: '记事本', en: 'Notes' },
  { key: 'bank', icon: '🏦', zh: '银行', en: 'Bank' },
  { key: 'ttt', icon: '⭕', zh: '井字棋', en: 'Tic-tac-toe' },
  { key: 'listen', icon: '👂', zh: '听一听', en: 'Listen & pick' },
];
const pinyinOf = (w) => { try { return window.pinyinPro.pinyin(w); } catch { return ''; } };

// ---------- timer & alarms keep running while the phone is closed ----------
const timer = { end: 0, left: 0, running: false, iv: null };
let ringing = null, lastAlarmMinute = '';
function ring(title) {
  if (ringing) return;
  let n = 0;
  ringing = setInterval(() => { sfx.fanfare(); if (++n > 20) stopRing(); }, 1600);
  sfx.fanfare();
  const box = html`<div class="card stack" style="align-items:center;text-align:center">
      <div style="font-size:72px" class="ringing">⏰</div>
      <div class="h-title" style="justify-content:center"><span class="zh">${esc(title)}</span></div>
      <button class="btn big green" id="stop">停止 Stop</button></div>`;
  $('#stop', box).onclick = () => { stopRing(); closeModal(); };
  openModal(box, { onClose: stopRing }).onclick = null;
}
function stopRing() { clearInterval(ringing); ringing = null; }
setInterval(() => {
  if (timer.running && Date.now() >= timer.end) { timer.running = false; timer.left = 0; ring('时间到！ Timer done!'); }
  const d = new Date(), hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (hm !== lastAlarmMinute) {
    lastAlarmMinute = hm;
    const a = (S.get().alarms || []).find((x) => x.on && x.time === hm);
    if (a) ring(`闹钟 ${hm} Alarm`);
  }
}, 500);

// ---------- the phone ----------
export function openPhone({ start = 'home', after } = {}) {
  S.essayNotifications();
  const n = html`<div class="phone" role="dialog" aria-label="Phone">
      <div class="ph-top">
        <div class="ph-screen">
          <div class="ph-status"><span id="ph-time"></span><span>📶 🔋</span></div>
          <div class="ph-body" id="ph-body"></div>
          <div class="ph-pop hidden" id="ph-pop"></div>
        </div>
      </div>
      <div class="ph-hinge"></div>
      <div class="ph-keys">
        <button class="ph-key" id="k-back">◀ <small>返回</small></button>
        <button class="ph-key round" id="k-home">●</button>
        <button class="ph-key" id="k-off">✕ <small>关</small></button>
        ${'123456789*0#'.split('').map((d) => `<button class="ph-num" data-d="${d}">${d}</button>`).join('')}
      </div>
    </div>`;
  const body = $('#ph-body', n), pop = $('#ph-pop', n);
  const history = [];
  let backFn = null, keyFn = null;
  const clock = () => { const d = new Date(); $('#ph-time', n).textContent = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  clock();
  const tick = setInterval(() => { if (!n.isConnected) return clearInterval(tick); clock(); }, 1000);

  function show(view, ...args) {
    closePop();
    backFn = null; keyFn = null;
    body.classList.remove('chat-mode');
    body.innerHTML = '';
    body.scrollTop = 0;
    VIEWS[view](...args);
    hydrateIcons(body);
  }
  function go(view, ...args) { history.push([view, args]); show(view, ...args); }
  function back() {
    if (!pop.classList.contains('hidden')) return closePop();
    if (backFn) return backFn();
    history.pop();
    const prev = history[history.length - 1];
    if (prev) show(prev[0], ...prev[1]); else { history.length = 0; go('home'); }
  }
  function header(title) {
    const h = html`<div class="ph-head"><button class="ph-back">◀</button><b>${title}</b></div>`;
    $('.ph-back', h).onclick = back;
    body.appendChild(h);
  }
  function popup(node) { pop.innerHTML = ''; pop.appendChild(node); pop.classList.remove('hidden'); hydrateIcons(pop); }
  function closePop() { pop.classList.add('hidden'); pop.innerHTML = ''; }
  // in-phone yes/no question
  function ask(text, yes = '删除 Delete') {
    return new Promise((resolve) => {
      const c = html`<div class="ph-dialog"><p>${text}</p><div class="ph-row"><button class="ph-btn" data-a="no">取消 Cancel</button><button class="ph-btn red" data-a="yes">${yes}</button></div></div>`;
      c.onclick = (e) => { const a = e.target.closest('[data-a]'); if (!a) return; closePop(); resolve(a.dataset.a === 'yes'); };
      popup(c);
    });
  }
  const badge = (k) => {
    const c = k === 'mail' ? S.unreadLetters().length : k === 'noti' ? S.unreadNotifications().length : 0;
    return c ? `<i class="ph-badge">${c}</i>` : '';
  };

  const VIEWS = {
    home() {
      const d = new Date();
      body.appendChild(html`<div class="ph-home">
          <div class="ph-bigtime">${pad2(d.getHours())}:${pad2(d.getMinutes())}</div>
          <div class="ph-date">${d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</div>
          <div class="ph-apps">${APPS.map((a) => `<button class="ph-app" data-app="${a.key}"><span class="ic">${a.icon}${badge(a.key)}</span><span class="zh">${a.zh}</span><small>${a.en}</small></button>`).join('')}</div>
        </div>`);
      body.querySelectorAll('[data-app]').forEach((b) => { b.onclick = () => go(b.dataset.app); });
    },

    // ----- messages: one chat per friend -----
    mail() {
      S.purgeOldMessages();
      header('💬 信息 Messages');
      body.appendChild(html`<div class="ph-tip">⏳ 信息会在 ${S.MESSAGE_DAYS} 天后自动删除。<br>Messages disappear after ${S.MESSAGE_DAYS} days.</div>`);
      const ts = S.threads();
      if (!ts.length) { body.appendChild(html`<p class="ph-empty">还没有信息。<br>No messages yet.</p>`); return; }
      const list = html`<div class="ph-list"></div>`;
      ts.forEach((t) => {
        const last = t.msgs[t.msgs.length - 1];
        const fr = acceptedFriends().find((x) => x.other === t.id), on = isOnline(fr);
        const r = html`<button class="ph-item chat-row ${t.unread ? 'unread' : ''}"><span class="avatar">🐱${on ? '<i class="ph-online" title="Online"></i>' : ''}</span><span class="txt"><b class="zh">${esc(t.name || '朋友')}</b><span class="prev zh">${last.mine ? '你: ' : ''}${esc(last.text)}</span></span><span class="meta"><small>${when(t.last)}</small>${t.unread ? `<i class="ph-badge static">${t.unread}</i>` : ''}</span></button>`;
        r.onclick = () => go('chat', t.id);
        list.appendChild(r);
      });
      body.appendChild(list);
      // fetch who is online, then redraw once
      if (!this._fetched) { this._fetched = true; refreshFriends().then(() => { if (body.isConnected && history[history.length - 1] && history[history.length - 1][0] === 'mail') show('mail'); }); }
    },
    chat(fid) {
      S.purgeOldMessages();
      const t = S.threads().find((x) => x.id === fid);
      const fr = acceptedFriends().find((x) => x.other === fid), on = isOnline(fr);
      const h = html`<div class="ph-head"><button class="ph-back">◀</button><span class="chat-who"><b class="zh">${esc((t && t.name) || '朋友')}</b><small class="${on ? 'on' : ''}">${on ? `<i class="ph-online"></i> ${esc(doingText(fr))}` : (fr && fr.card_updated ? `最后上线 Last seen: ${esc(lastSeen(fr))}` : '不在线 · Offline')}</small></span><button class="ph-x" id="del-chat" aria-label="Delete chat">🗑</button></div>`;
      $('.ph-back', h).onclick = back;
      body.appendChild(h);
      body.classList.add('chat-mode');
      if (!t) { body.appendChild(html`<p class="ph-empty">没有信息。 No messages.</p>`); $('#del-chat', h).remove(); return; }
      S.readThread(fid);
      const log = html`<div class="chat-log"><div class="ph-tip small">⏳ 信息会在 ${S.MESSAGE_DAYS} 天后自动删除 · Messages disappear after ${S.MESSAGE_DAYS} days</div></div>`;
      let lastDay = '';
      t.msgs.forEach((m) => {
        const day = new Date(m.at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
        if (day !== lastDay) { lastDay = day; log.appendChild(html`<div class="chat-day">${day}</div>`); }
        const b = html`<button class="bubble-msg ${m.mine ? 'mine' : 'theirs'}"><span class="zh">${esc(m.text)}</span><small>${new Date(m.at).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' })}</small></button>`;
        b.onclick = async () => {
          if (!(await ask('要删除这条信息吗？<br>Delete this message?'))) return;
          if (!(await ask('真的要删除吗？删除了就找不回来了。<br>Are you sure? It can\'t be brought back.', '确定删除 Yes, delete'))) return;
          if (m.mine) S.deleteSent(m.id); else S.deleteLetter(m.id);
          toast('🗑 已删除 Deleted'); show('chat', fid);
        };
        log.appendChild(b);
      });
      body.appendChild(log);
      const canReply = fid !== 'unknown';
      const bar = html`<div class="chat-input">${canReply ? `<textarea id="tx" rows="1" maxlength="${LETTER_MAX}" placeholder="写信息… Message"></textarea><button class="ph-btn green" id="send">➤</button>` : '<small>不能回复 Can\'t reply</small>'}</div>`;
      body.appendChild(bar);
      $('#del-chat', h).onclick = async () => {
        if (!(await ask('要删除和这个朋友的全部信息吗？<br>Delete this whole chat?'))) return;
        if (!(await ask('真的要删除吗？删除了就找不回来了。<br>Are you sure? It can\'t be brought back.', '确定删除 Yes, delete'))) return;
        S.deleteThread(fid); toast('🗑 已删除 Deleted'); back();
      };
      setTimeout(() => { log.scrollTop = log.scrollHeight; }, 0);
      if (!canReply) return;
      const tx = $('#tx', bar);
      $('#send', bar).onclick = async () => {
        const text = tx.value.trim();
        if (!text) return;
        if (!acceptedFriends().some((x) => x.other === fid)) await refreshFriends();
        if (!acceptedFriends().some((x) => x.other === fid)) return toast('你们现在不是朋友了，不能回信。 You are no longer friends.');
        $('#send', bar).disabled = true;
        try { await sendLetter(fid, text, t.name); sfx.coin(); show('chat', fid); }
        catch (e) { $('#send', bar).disabled = false; toast(errorText(e.message) || '没寄出，请再试。 Could not send — try again.'); }
      };
    },

    // ----- tic-tac-toe against the kitten -----
    ttt() {
      header('⭕ 井字棋 Tic-tac-toe');
      const board = Array(9).fill(''), LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
      let over = false;
      const score = (this._ttt = this._ttt || { me: 0, cat: 0, draw: 0 });
      const ui = html`<div class="ttt"><div class="ttt-score">你 You <b id="sm">${score.me}</b> · 平 Draw <b id="sd">${score.draw}</b> · 🐱 <b id="sc">${score.cat}</b></div>
          <div class="ttt-msg" id="msg">你先走！你是 ❌ · You go first — you are ❌</div>
          <div class="ttt-board">${board.map((_, i) => `<button data-c="${i}"></button>`).join('')}</div>
          <button class="ph-btn green block" id="again">↺ 再来一局 Play again</button></div>`;
      const cells = [...ui.querySelectorAll('[data-c]')];
      const winner = (b) => { for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return { who: b[a], line: [a, c, d] }; return b.every(Boolean) ? { who: 'draw' } : null; };
      const draw = () => cells.forEach((c, i) => { c.textContent = board[i] === 'X' ? '❌' : board[i] === 'O' ? '🐱' : ''; });
      // the kitten: win if it can, block you, take the middle, then a corner (and sometimes just plays for fun)
      const catMove = () => {
        const free = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
        const tryWin = (mark) => free.find((i) => { const b = board.slice(); b[i] = mark; return winner(b) && winner(b).who === mark; });
        let i = tryWin('O');
        if (i === undefined) i = tryWin('X');
        if (i === undefined && Math.random() < 0.25) i = free[Math.floor(Math.random() * free.length)];
        if (i === undefined && !board[4]) i = 4;
        if (i === undefined) i = [0, 2, 6, 8].filter((k) => !board[k])[0];
        if (i === undefined) i = free[0];
        board[i] = 'O';
      };
      const finish = (w) => {
        over = true;
        if (w.line) w.line.forEach((k) => cells[k].classList.add('win'));
        if (w.who === 'X') { score.me++; $('#msg', ui).textContent = '🎉 你赢了！ You win!'; sfx.fanfare(); }
        else if (w.who === 'O') { score.cat++; $('#msg', ui).textContent = '😼 小猫赢了！ The kitten wins!'; sfx.miss(); }
        else { score.draw++; $('#msg', ui).textContent = '🤝 平局！ It\'s a draw!'; }
        $('#sm', ui).textContent = score.me; $('#sc', ui).textContent = score.cat; $('#sd', ui).textContent = score.draw;
      };
      cells.forEach((c, i) => {
        c.onclick = () => {
          if (over || board[i]) return;
          board[i] = 'X'; sfx.click(); draw();
          let w = winner(board); if (w) return finish(w);
          $('#msg', ui).textContent = '🐱 小猫在想… The kitten is thinking…';
          over = true;
          setTimeout(() => { over = false; catMove(); draw(); const w2 = winner(board); if (w2) finish(w2); else $('#msg', ui).textContent = '轮到你了！ Your turn!'; }, 450);
        };
      });
      $('#again', ui).onclick = () => show('ttt');
      keyFn = (d) => { const k = '123456789'.indexOf(d); if (k >= 0) cells[k].click(); };
      body.appendChild(ui);
    },

    // ----- listen and pick the right word -----
    listen() {
      header('👂 听一听 Listen & pick');
      const pool = [...new Set([...S.get().lists.flatMap((l) => l.words.map((x) => x.w)), ...Object.keys(S.get().words)])].filter((w) => /\p{Script=Han}/u.test(w));
      if (pool.length < 4) { body.appendChild(html`<p class="ph-empty">词语不够，先让妈妈加一些听写词语吧！<br>Not enough words yet — ask Mum to add a spelling list.</p>`); return; }
      const ROUNDS = 10;
      let round = 0, right = 0, answer = null, locked = false;
      const ui = html`<div class="listen">
          <div class="ttt-score">第 <b id="rn">1</b>/${ROUNDS} 题 · ✅ <b id="ok">0</b></div>
          <button class="ph-btn big-say" id="say">🔊 听 Listen</button>
          <div class="choices" id="ch"></div>
          <div class="ttt-msg" id="msg">听一听，选出你听到的词语。<br>Listen, then tap the word you hear.</div>
        </div>`;
      const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
      const next = () => {
        if (round >= ROUNDS) {
          const stars = right >= 9 ? 3 : right >= 6 ? 2 : right >= 3 ? 1 : 0;
          ui.innerHTML = `<div class="listen-end"><div style="font-size:44px">${'⭐'.repeat(stars) || '💪'}</div><div class="zh" style="font-size:22px">答对 ${right}/${ROUNDS}</div><div>${right >= 8 ? '太棒了！ Amazing!' : right >= 5 ? '很好！ Good job!' : '多听几次就会了！ Keep practising!'}</div><button class="ph-btn green block" id="again">↺ 再玩一次 Play again</button></div>`;
          if (right >= 8) { sfx.fanfare(); confetti(); }
          $('#again', ui).onclick = () => show('listen');
          return;
        }
        round++; locked = false;
        $('#rn', ui).textContent = round;
        answer = pool[Math.floor(Math.random() * pool.length)];
        // wrong choices: prefer words of the same length so it isn't too easy
        const others = shuffle(pool.filter((w) => w !== answer)).sort((a, b) => Math.abs(a.length - answer.length) - Math.abs(b.length - answer.length)).slice(0, 3);
        const opts = shuffle([answer, ...others]);
        const ch = $('#ch', ui); ch.innerHTML = '';
        opts.forEach((w) => {
          const b = html`<button class="choice zh">${esc(w)}<small></small></button>`;
          b.onclick = () => {
            if (locked) return; locked = true;
            const good = w === answer;
            if (good) { right++; sfx.correct(); b.classList.add('good'); $('#msg', ui).innerHTML = '✅ 对了！ Correct!'; }
            else { sfx.oops(); b.classList.add('bad'); ch.querySelectorAll('.choice').forEach((x) => { if (x.firstChild.textContent === answer) x.classList.add('good'); }); $('#msg', ui).innerHTML = `❌ 是 <b class="zh">${esc(answer)}</b> 哦 · It was ${esc(answer)}`; }
            ch.querySelectorAll('.choice').forEach((x) => { x.querySelector('small').textContent = pinyinOf(x.firstChild.textContent); });
            $('#ok', ui).textContent = right;
            setTimeout(next, good ? 1100 : 2200);
          };
          ch.appendChild(b);
        });
        $('#msg', ui).innerHTML = '听一听，选出你听到的词语。<br>Listen, then tap the word you hear.';
        setTimeout(() => speak(answer), 300);
      };
      $('#say', ui).onclick = () => answer && speak(answer);
      body.appendChild(ui);
      next();
    },

    // ----- bank -----
    bank() {
      header('🏦 喵喵银行 Bank');
      const s = S.get(), deps = S.bank().deposits;
      const saved = deps.reduce((a, d) => a + d.amount, 0);
      body.appendChild(html`<div class="bank-card"><div><small>钱包 Wallet</small><b>${s.coins} ${coinI(18)}</b></div><div><small>存款 Saved</small><b>${saved} ${coinI(18)}</b></div></div>`);
      const form = html`<div class="bank-form">
          <b>存钱 Save coins</b>
          <input type="number" id="amt" min="1" max="${s.coins}" inputmode="numeric" placeholder="多少金币？ How many coins?">
          <div class="plans">${S.bankPlans().map((p, i) => `<button class="plan ${i === 0 ? 'on' : ''}" data-p="${i}"><b>${Math.round(p.rate * 100)}%</b><small>${p.days} 天 days</small></button>`).join('')}</div>
          <div class="help" id="calc"></div>
          <button class="ph-btn green block" id="dep">🐷 存进去 Deposit</button>
          <div class="ph-note">要存够天数才有利息。提早拿出来就没有利息哦！<br>Leave it for the full days to earn interest. Take it out early and you get no interest.</div>
        </div>`;
      let plan = 0;
      const amtIn = $('#amt', form);
      const calc = () => {
        const a = Math.floor(+amtIn.value || 0), p = S.bankPlans()[plan];
        $('#calc', form).innerHTML = a > 0 ? `${p.days} 天后拿回 Get back after ${p.days} days: <b>${a + Math.round(a * p.rate)}</b> ${coinI(14)} (+${Math.round(a * p.rate)})` : '';
        hydrateIcons(form);
      };
      form.querySelector('.plans').onclick = (e) => { const b = e.target.closest('[data-p]'); if (!b) return; plan = +b.dataset.p; form.querySelectorAll('.plan').forEach((x) => x.classList.toggle('on', x === b)); calc(); };
      amtIn.oninput = calc;
      $('#dep', form).onclick = () => {
        const a = Math.floor(+amtIn.value || 0);
        if (a <= 0) return toast('输入金币数量 Type how many coins');
        if (a > S.get().coins) return toast('金币不够 Not enough coins');
        S.deposit(a, plan); sfx.coin(); toast(`🐷 <span class="zh">存了 ${a} 金币！</span> Saved ${a} coins`); show('bank');
      };
      body.appendChild(form);
      if (deps.length) {
        body.appendChild(html`<b class="bank-h">我的存款 My savings</b>`);
        deps.slice().sort((a, b) => S.depositMatures(a) - S.depositMatures(b)).forEach((d) => {
          const p = S.depositTerms(d), ripe = Date.now() >= S.depositMatures(d);
          const leftMs = S.depositMatures(d) - Date.now(), daysLeft = Math.ceil(leftMs / 86400000), hrsLeft = Math.ceil(leftMs / 3600000);
          const r = html`<div class="dep ${ripe ? 'ripe' : ''}">
              <div class="top"><b>${d.amount} ${coinI(16)}</b><span>${Math.round(p.rate * 100)}% · ${p.days} 天</span></div>
              <div class="bar"><i style="width:${Math.min(100, ((Date.now() - d.at) / (p.days * 86400000)) * 100)}%"></i></div>
              <div class="row-s">${ripe ? `✅ 可以拿了！ Ready: <b>${d.amount + S.depositInterest(d)}</b> ${coinI(14)}` : `⏳ 还有 ${daysLeft > 1 ? `${daysLeft} 天 days` : `${hrsLeft} 小时 hours`} · then +${S.depositInterest(d)}`}</div>
              <button class="ph-btn ${ripe ? 'green' : ''} block" data-w>${ripe ? '💰 取出 Withdraw' : '取出 Withdraw early (no interest)'}</button>
            </div>`;
          $('[data-w]', r).onclick = async () => {
            if (!ripe && !(await ask(`现在拿出来就<b>没有利息</b>，只拿回 ${d.amount} 金币。还要拿吗？<br>Taking it out now gives <b>no interest</b> — just your ${d.amount} coins back. Still withdraw?`, '拿出来 Withdraw'))) return;
            const res = S.withdraw(d.id);
            if (!res) return;
            if (res.interest) { sfx.fanfare(); confetti(); toast(`💰 <span class="zh">拿回 ${res.amount + res.interest} 金币！</span> +${res.interest} interest!`, { ms: 3500 }); }
            else { sfx.coin(); toast(`拿回 ${res.amount} 金币 · Got ${res.amount} coins back`); }
            show('bank');
          };
          body.appendChild(r);
        });
      }
    },

    // ----- notifications -----
    noti() {
      S.purgeOldMessages();
      header('🔔 通知 Notifications');
      body.appendChild(html`<div class="ph-tip">⏳ 通知会在 ${S.MESSAGE_DAYS} 天后自动删除。<br>Notifications are cleared after ${S.MESSAGE_DAYS} days.</div>`);
      const list = S.get().notifications || [];
      if (!list.length) { body.appendChild(html`<p class="ph-empty">没有通知。<br>No notifications.</p>`); return; }
      const box = html`<div class="ph-list"></div>`;
      list.forEach((x) => {
        const r = html`<div class="ph-item ${x.read ? '' : 'unread'}"><span class="dot"></span><button class="txt open"><b class="zh">${NOTI_ICON[x.kind] || '🔔'} ${esc(x.title)}</b><span class="prev">${esc(x.body || '')}</span><small>${when(x.at)}</small></button><button class="ph-x" aria-label="Delete">🗑</button></div>`;
        $('.open', r).onclick = () => { openNotification(x); };
        $('.ph-x', r).onclick = async () => { if (!(await ask('删除这个通知？<br>Delete this notification?'))) return; S.deleteNotification(x.id); show('noti'); };
        box.appendChild(r);
      });
      body.appendChild(box);
    },

    // ----- calculator -----
    calc() {
      header('🧮 计算器 Calculator');
      let cur = '0', prev = null, op = null, fresh = false;
      const c = html`<div class="ph-calc"><div class="disp" id="disp">0</div><div class="keys">
          ${['C', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '⌫', '='].map((k) => `<button class="${'÷×−+='.includes(k) ? 'op' : ''}" data-k="${k}">${k}</button>`).join('')}
        </div></div>`;
      const disp = $('#disp', c);
      const fmt = (v) => { if (!Number.isFinite(v)) return '错误 Error'; const r = Math.round(v * 1e9) / 1e9; return String(r).length > 12 ? r.toPrecision(9) : String(r); };
      const calc = (a, b, o) => (o === '+' ? a + b : o === '−' ? a - b : o === '×' ? a * b : o === '÷' ? a / b : b);
      const press = (k) => {
        if (/^[0-9]$/.test(k)) { cur = fresh || cur === '0' ? k : (cur.length < 12 ? cur + k : cur); fresh = false; }
        else if (k === '.') { if (fresh) { cur = '0.'; fresh = false; } else if (!cur.includes('.')) cur += '.'; }
        else if (k === 'C') { cur = '0'; prev = null; op = null; }
        else if (k === '⌫') { cur = cur.length > 1 ? cur.slice(0, -1) : '0'; }
        else if (k === '±') { cur = cur.startsWith('-') ? cur.slice(1) : (cur === '0' ? '0' : '-' + cur); }
        else if (k === '%') { cur = fmt(parseFloat(cur) / 100); }
        else if (k === '=') { if (op != null && prev != null) { cur = fmt(calc(prev, parseFloat(cur), op)); prev = null; op = null; fresh = true; } }
        else { if (op != null && prev != null && !fresh) cur = fmt(calc(prev, parseFloat(cur), op)); prev = parseFloat(cur); op = k; fresh = true; }
        disp.textContent = (prev != null && op ? `${fmt(prev)} ${op} ` : '') + (fresh && op ? '' : cur);
        if (k === '=') disp.textContent = cur;
      };
      c.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => press(b.dataset.k); });
      keyFn = (d) => { if (/[0-9]/.test(d)) press(d); };
      body.appendChild(c);
    },

    // ----- clock -----
    clock(tab = 'time') {
      header('⏰ 时钟 Clock');
      const tabs = html`<div class="ph-tabs">${[['time', '时间 Time'], ['timer', '计时 Timer'], ['alarm', '闹钟 Alarm']].map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-t="${k}">${l}</button>`).join('')}</div>`;
      tabs.onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { history[history.length - 1] = ['clock', [b.dataset.t]]; show('clock', b.dataset.t); } };
      body.appendChild(tabs);
      const area = html`<div class="ph-clock"></div>`;
      body.appendChild(area);
      if (tab === 'time') {
        const draw = () => {
          if (!area.isConnected) return clearInterval(iv);
          const d = new Date();
          area.innerHTML = `<div class="ph-bigtime">${pad2(d.getHours())}:${pad2(d.getMinutes())}<small>:${pad2(d.getSeconds())}</small></div>
            <div class="ph-date">${d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</div>
            <div class="ph-date">${d.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' })}</div>`;
        };
        draw(); const iv = setInterval(draw, 1000);
      } else if (tab === 'timer') {
        const ui = html`<div class="ph-timer">
            <div class="ph-bigtime" id="tt">00:00</div>
            <div class="ph-row set" id="set"><label>分 min<input type="number" id="m" min="0" max="99" value="5" inputmode="numeric"></label><label>秒 sec<input type="number" id="s" min="0" max="59" value="0" inputmode="numeric"></label></div>
            <div class="ph-row"><button class="ph-btn green" id="go">▶ 开始 Start</button><button class="ph-btn" id="reset">↺ 重来 Reset</button></div>
          </div>`;
        const left = () => (timer.running ? Math.max(0, timer.end - Date.now()) : timer.left);
        const draw = () => {
          if (!ui.isConnected) return clearInterval(iv);
          const ms = left(), t = Math.ceil(ms / 1000);
          $('#tt', ui).textContent = `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`;
          $('#go', ui).textContent = timer.running ? '⏸ 暂停 Pause' : (timer.left ? '▶ 继续 Resume' : '▶ 开始 Start');
          $('#set', ui).classList.toggle('hidden', timer.running || timer.left > 0);
        };
        $('#go', ui).onclick = () => {
          if (timer.running) { timer.left = Math.max(0, timer.end - Date.now()); timer.running = false; }
          else {
            const ms = timer.left || ((+$('#m', ui).value || 0) * 60 + (+$('#s', ui).value || 0)) * 1000;
            if (ms <= 0) return toast('先设时间 Set a time first');
            timer.end = Date.now() + ms; timer.left = 0; timer.running = true;
          }
          draw();
        };
        $('#reset', ui).onclick = () => { timer.running = false; timer.left = 0; draw(); };
        area.appendChild(ui);
        draw(); const iv = setInterval(draw, 250);
      } else {
        const list = () => S.get().alarms || [];
        const draw = () => {
          area.innerHTML = '';
          const add = html`<div class="ph-row"><input type="time" id="at" value="07:00"><button class="ph-btn green" id="add">＋ 加闹钟 Add</button></div>`;
          $('#add', add).onclick = () => {
            const t = $('#at', add).value; if (!t) return;
            S.setAlarms([...list(), { id: S.uid(), time: t, on: true }].sort((a, b) => a.time.localeCompare(b.time)));
            draw();
          };
          area.appendChild(add);
          if (!list().length) area.appendChild(html`<p class="ph-empty">还没有闹钟。<br>No alarms yet.</p>`);
          list().forEach((a) => {
            const r = html`<div class="ph-alarm ${a.on ? 'on' : ''}"><span class="t">${esc(a.time)}</span><button class="sw ${a.on ? 'on' : ''}" aria-label="On/off"></button><button class="ph-x">🗑</button></div>`;
            $('.sw', r).onclick = () => { S.setAlarms(list().map((x) => (x.id === a.id ? { ...x, on: !x.on } : x))); draw(); };
            $('.ph-x', r).onclick = async () => { if (!(await ask('删除这个闹钟？ Delete this alarm?'))) return; S.setAlarms(list().filter((x) => x.id !== a.id)); draw(); };
            area.appendChild(r);
          });
          area.appendChild(html`<p class="ph-note">闹钟要打开这个应用才会响。<br>Alarms ring while Meow Chinese is open.</p>`);
        };
        draw();
      }
    },

    // ----- notepad -----
    notes() {
      header('📒 记事本 Notes');
      const add = html`<button class="ph-btn green block">＋ 新的笔记 New note</button>`;
      add.onclick = () => go('note', null);
      body.appendChild(add);
      const notes = S.get().notes || [];
      if (!notes.length) { body.appendChild(html`<p class="ph-empty">还没有笔记。<br>No notes yet.</p>`); return; }
      const list = html`<div class="ph-list"></div>`;
      notes.forEach((x) => {
        const first = (x.text || '').split('\n')[0] || '…';
        const r = html`<button class="ph-item"><span class="txt"><b class="zh">${esc(first.slice(0, 30))}</b><span class="prev zh">${esc((x.text || '').slice(first.length).trim().slice(0, 60))}</span></span><small>${when(x.at)}</small></button>`;
        r.onclick = () => go('note', x.id);
        list.appendChild(r);
      });
      body.appendChild(list);
    },
    note(id) {
      const x = id && (S.get().notes || []).find((y) => y.id === id);
      header(x ? '📒 笔记 Note' : '📒 新的笔记 New note');
      const f = html`<div class="ph-compose"><textarea id="tx" rows="9" maxlength="2000" placeholder="写点什么……">${esc(x ? x.text : '')}</textarea>
          <div class="ph-row"><button class="ph-btn green" id="save">💾 保存 Save</button>${x ? '<button class="ph-btn red" id="del">🗑 删除 Delete</button>' : ''}</div></div>`;
      const tx = $('#tx', f);
      let savedText = x ? x.text : '';
      $('#save', f).onclick = () => {
        const t = tx.value.trim();
        if (!t) return toast('笔记是空的 The note is empty');
        S.saveNote(id, t); savedText = tx.value; toast('💾 已保存 Saved'); back();
      };
      const del = $('#del', f);
      if (del) del.onclick = async () => { if (!(await ask('删除这个笔记？<br>Delete this note?'))) return; S.deleteNote(id); toast('🗑 已删除 Deleted'); backFn = null; back(); };
      // leaving with unsaved changes: keep them
      backFn = () => {
        const t = tx.value.trim();
        if (t && tx.value !== savedText) S.saveNote(id, t);
        backFn = null; back();
      };
      body.appendChild(f);
      setTimeout(() => tx.focus(), 50);
    },
  };

  // a notification opens as a pop-up on the phone; a checked essay shows Mum's stars, coins and comment
  function openNotification(x) {
    S.readNotification(x.id);
    let inner;
    if (x.kind === 'essay') {
      const e = S.essays().find((y) => y.id === x.essayId);
      const r = (e && e.review) || {};
      inner = html`<div class="ph-dialog noti-pop">
          <div class="h">📝 作文批改好了！<br><small>Your writing was checked!</small></div>
          ${e ? `<div class="zh" style="font-size:18px">${esc(e.title)}</div>
          <div class="stars">${[1, 2, 3].map((i) => `<span class="${i <= (r.stars || 0) ? 'on' : ''}">★</span>`).join('')}</div>
          <div class="ph-row" style="justify-content:center;gap:12px">${r.coins ? `<b class="price">+${r.coins} ${coinI(18)}</b>` : ''}${r.xp ? `<b class="xp-gain" style="font-size:18px">+${r.xp} XP ⭐</b>` : ''}</div>
          ${r.comment ? `<div class="parent-note"><small>妈妈说 · Mum says:</small><div class="zh">${esc(r.comment)}</div></div>` : '<div class="help">妈妈没有留言。 No comment from Mum.</div>'}` : '<p>这篇作文已经删除了。 This essay was deleted.</p>'}
          <button class="ph-btn green" data-close>好的！ OK</button>
        </div>`;
      if (e && !x._celebrated) { sfx.fanfare(); confetti(); }
    } else {
      inner = html`<div class="ph-dialog noti-pop">
          <div class="h">${NOTI_ICON[x.kind] || '🔔'} <span class="zh">${esc(x.title)}</span></div>
          ${x.item && ITEMS[x.item] ? '<div class="art"></div>' : ''}
          <p>${esc(x.body || '')}</p>
          <small>${when(x.at)}</small>
          <button class="ph-btn green" data-close>好的 OK</button>
        </div>`;
      const art = $('.art', inner); if (art) art.appendChild(spriteCanvas(x.item, 64));
    }
    $('[data-close]', inner).onclick = () => { closePop(); show('noti'); };
    popup(inner);
  }

  $('#k-back', n).onclick = back;
  $('#k-home', n).onclick = () => { history.length = 0; go('home'); };
  $('#k-off', n).onclick = () => closeModal();
  n.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => { sfx.click(); keyFn && keyFn(b.dataset.d); }; });

  setActivity('phone');
  const m = openModal(n, { onClose: () => { setActivity('online'); after && after(); } });
  m.classList.add('phone-modal');
  const clear = new MutationObserver(() => { if (!n.isConnected) { m.classList.remove('phone-modal'); clear.disconnect(); } });
  clear.observe(m, { childList: true });
  if (start === 'home') go('home'); else { go('home'); go(start); }
}
