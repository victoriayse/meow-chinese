// 🏦 v269: the Bank (a pin on the 🗺️ map) and its ATM.
// Her earnings go into the bank; the ATM shows the balance and the last 14 days, moves coins between the bank and
// her wallet, sends coins to friends, and holds her savings (fixed deposits — they used to live in the phone).
import * as S from './state.js';
import * as Auth from './auth.js';
import * as Friends from './friends.js';
import { managing } from './cloud.js';
import { $, html, esc, coinI, hydrateIcons, toast, confirmBox, confetti } from './ui.js';
import { sfx } from './audio.js';

const TX = {
  earn: ['⭐', '赚到', 'Earned'], deposit: ['⬇️', '存入', 'Deposit'], withdraw: ['⬆️', '取出', 'Withdraw'],
  send: ['💸', '转给', 'Sent to'], receive: ['🎁', '收到', 'From'], refund: ['↩️', '退回', 'Returned'],
  save: ['🐷', '定期存款', 'Into savings'], unsave: ['🐷', '定期到期', 'From savings'],
};
const IN = new Set(['earn', 'deposit', 'receive', 'refund', 'unsave']);
const day = (t) => { const d = new Date(t), now = new Date(); const same = (a, b) => a.toDateString() === b.toDateString(); const y = new Date(now); y.setDate(now.getDate() - 1);
  return same(d, now) ? '今天 Today' : same(d, y) ? '昨天 Yesterday' : d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }); };
const hm = (t) => new Date(t).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' });

export function bankScreen({ go }) {
  const n = html`<section class="screen bank-screen">
      <div class="bank-hall">
        <div class="bank-sign"><span class="zh">🏦 喵喵银行</span><span class="en">Meow Bank</span></div>
        <div class="atm" id="atm">
          <div class="atm-top"><span class="atm-logo">🐾 ATM</span><span class="atm-light"></span></div>
          <div class="atm-screen" id="scr"></div>
          <div class="atm-mid">
            <div class="atm-keys" id="keys">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => `<button type="button" data-k="${k}" class="${k === 'C' ? 'red' : k === '⌫' ? 'yel' : ''}">${k}</button>`).join('')}
              <button type="button" data-k="ok" class="green wide">确认 Enter</button></div>
            <div class="atm-slots"><div class="card-slot"><i></i><span class="atm-card" id="card">🐾 MEOW</span></div><div class="cash-slot" id="cash"><i></i></div><small>出钞口 Cash</small></div>
          </div>
        </div>
        <div class="bank-floor"></div>
      </div>
      <div class="row" style="justify-content:center"><button class="btn white" id="home">← <span class="zh">回地图</span> Back to map</button></div>
    </section>`;
  const scr = $('#scr', n);
  let view = 'start', amount = '', onEnter = null, sel = null, plan = 0, msg = '';
  const st = () => S.get();
  const setAmount = (v) => { amount = String(v).replace(/\D/g, '').replace(/^0+/, '').slice(0, 6); const a = $('#amt', scr); if (a) a.textContent = amount || '0'; afterAmount(); };
  let afterAmount = () => {};
  // the coins tumble out of (or into) the cash slot
  const cashFx = (out) => {
    const c = $('#cash', n); c.querySelectorAll('.fly').forEach((x) => x.remove());
    for (let i = 0; i < 6; i++) { const f = document.createElement('span'); f.className = `fly ${out ? 'out' : 'in'}`; f.innerHTML = coinI(18); f.style.left = `${18 + i * 12}%`; f.style.animationDelay = `${i * 0.08}s`; c.appendChild(f); }
    hydrateIcons(c); setTimeout(() => c.querySelectorAll('.fly').forEach((x) => x.remove()), 1600);
  };
  const head = (zh, en) => `<div class="atm-h"><b class="zh">${zh}</b> ${en}</div>`;
  const back = '<button type="button" class="atm-btn grey" data-go="menu">← <span class="zh">返回</span> Back</button>';
  const amountBox = (label, max) => `<div class="atm-amt"><small>${label}</small><div><span id="amt">${amount || '0'}</span> ${coinI(18)}</div>${max != null ? `<small>最多 Max ${max}</small>` : ''}</div>
      <div class="atm-quick">${[10, 50, 100].filter((q) => max == null || q <= max).map((q) => `<button type="button" data-q="${q}">${q}</button>`).join('')}${max ? `<button type="button" data-q="${max}">全部 All</button>` : ''}</div>`;

  function render() {
    const s = st(), bal = S.bankBalance();
    onEnter = null; afterAmount = () => {};
    if (view === 'start') {
      scr.innerHTML = `<div class="atm-welcome"><div class="big">🏦</div><b class="zh">欢迎来到喵喵银行</b><span>Welcome to Meow Bank</span>
        <button type="button" class="atm-btn green" data-go="insert">💳 <span class="zh">插卡</span> Insert card</button></div>`;
    } else if (view === 'menu') {
      scr.innerHTML = `${head(`你好，${esc(s.childName || s.kitten.name)}！`, 'Hello!')}
        <div class="atm-bal"><small>银行余额 Bank balance</small><b>${bal} ${coinI(22)}</b><small>钱包 Wallet: ${s.coins} · 定期 Savings: ${S.savedTotal()}</small></div>
        <div class="atm-menu">
          <button type="button" class="atm-btn" data-go="history">📜 <span class="zh">余额和记录</span> Balance & history</button>
          <button type="button" class="atm-btn" data-go="deposit">⬇️ <span class="zh">存钱</span> Deposit</button>
          <button type="button" class="atm-btn" data-go="withdraw">⬆️ <span class="zh">取钱</span> Withdraw</button>
          <button type="button" class="atm-btn" data-go="transfer">💸 <span class="zh">转账给朋友</span> Transfer</button>
          <button type="button" class="atm-btn" data-go="savings">🐷 <span class="zh">定期存款</span> Savings</button>
          <button type="button" class="atm-btn grey" data-go="eject">⏏️ <span class="zh">取卡</span> Take card</button>
        </div>`;
    } else if (view === 'history') {
      const list = S.bankHistory();
      let lastDay = '';
      scr.innerHTML = `${head('余额和记录', 'Balance & history')}
        <div class="atm-bal small"><small>银行余额 Balance</small><b>${bal} ${coinI(20)}</b></div>
        <div class="atm-tx">${list.length ? list.map((t) => {
          const [ic, zh, en] = TX[t.kind] || ['•', t.kind, t.kind], d = day(t.at), sep = d !== lastDay ? `<div class="tx-day">${d}</div>` : ''; lastDay = d;
          return `${sep}<div class="tx"><span class="ic">${ic}</span><span class="what"><b class="zh">${zh}</b> ${en}${t.note ? ` · <small>${esc(t.note)}</small>` : ''}<small class="t">${hm(t.at)}</small></span><span class="amt ${IN.has(t.kind) ? 'in' : 'out'}">${IN.has(t.kind) ? '+' : '−'}${t.amount}</span><span class="bal">${t.bal}</span></div>`;
        }).join('') : '<p class="atm-empty">最近14天没有记录。<br>No transactions in the last 14 days.</p>'}</div>
        <div class="atm-foot"><small>只显示最近${S.TX_DAYS}天 · Last ${S.TX_DAYS} days</small>${back}</div>`;
    } else if (view === 'deposit' || view === 'withdraw') {
      const dep = view === 'deposit', max = dep ? s.coins : bal;
      scr.innerHTML = `${head(dep ? '存钱' : '取钱', dep ? 'Deposit — wallet ➜ bank' : 'Withdraw — bank ➜ wallet')}
        ${amountBox(dep ? `钱包里有 Wallet: ${s.coins}` : `银行里有 Bank: ${bal}`, max)}
        <div class="atm-foot">${back}<button type="button" class="atm-btn green" data-do="ok">✅ <span class="zh">确认</span> Enter</button></div>`;
      onEnter = async () => {
        const a = +amount || 0;
        if (a <= 0) return toast('输入金币数量 · Type how many coins');
        if (a > max) { sfx.miss(); return toast(dep ? '钱包里没有那么多 · Not that many coins in your wallet' : '银行里没有那么多 · Not that many coins in the bank'); }
        if (!(dep ? S.atmDeposit(a) : S.atmWithdraw(a))) return;
        sfx.coin(); cashFx(!dep);
        toast(dep ? `⬇️ <span class="zh">存了 ${a} 金币</span> Deposited ${a} coins` : `⬆️ <span class="zh">取了 ${a} 金币</span> ${a} coins are in your wallet`, { ms: 2400 });
        amount = ''; done(dep ? `存好了！ Deposited ${a}` : `取好了！ Withdrew ${a}`);
      };
    } else if (view === 'transfer') {
      if (!Auth.session() || managing()) {
        scr.innerHTML = `${head('转账给朋友', 'Transfer')}<p class="atm-empty">要先登录自己的账号才能转账。<br>Log in to your own account to send coins to friends.</p><div class="atm-foot">${back}</div>`;
      } else {
        const fs = Friends.acceptedFriends();
        scr.innerHTML = `${head('转账给朋友', 'Transfer to a friend')}
          ${fs.length ? `<div class="atm-friends">${fs.map((f) => `<button type="button" class="${sel === f.other ? 'on' : ''}" data-f="${f.other}">${esc(Friends.friendName(f))}</button>`).join('')}</div>` : '<p class="atm-empty">还没有朋友。先在 👫 朋友 加朋友吧！<br>No friends yet — add one in 👫 Friends first.</p>'}
          ${fs.length ? `${amountBox(`银行里有 Bank: ${bal}`, bal)}<input class="atm-msg" id="tmsg" maxlength="${Friends.LETTER_MAX}" placeholder="写几句话 Message (optional)" value="${esc(msg)}">` : ''}
          <div class="atm-foot">${back}${fs.length ? '<button type="button" class="atm-btn green" data-do="ok">💸 <span class="zh">转账</span> Send</button>' : ''}</div>`;
        const m = $('#tmsg', scr); if (m) m.oninput = () => { msg = m.value; };
        onEnter = async () => {
          const f = Friends.acceptedFriends().find((x) => x.other === sel), a = +amount || 0;
          if (!f) return toast('先选一个朋友 · Pick a friend first');
          if (a <= 0) return toast('输入金币数量 · Type how many coins');
          if (a > S.bankBalance()) { sfx.miss(); return toast('银行里没有那么多 · Not that many coins in the bank'); }
          const who = Friends.friendName(f);
          if (!(await confirmBox(`转 ${a} 金币给 ${esc(who)}？`, `Send ${a} coins to ${esc(who)}? They go straight into their bank account.`, '💸 转账 Send', '取消 Cancel'))) return;
          if (!S.transferOut(a, who)) return;
          try { await Friends.sendTransfer(f.other, a, msg); }
          catch (e) { S.transferUndo(a, who); sfx.miss(); render(); return toast('没转成功，钱退回来了。 Could not send — your coins are back.'); }
          sfx.fanfare(); confetti(); toast(`💸 <span class="zh">转给${esc(who)} ${a} 金币！</span> Sent!`, { ms: 3000 });
          amount = ''; msg = ''; sel = null; done(`转好了！ Sent ${a} to ${esc(who)}`);
        };
      }
    } else if (view === 'savings') {
      const deps = S.bank().deposits.slice().sort((a, b) => S.depositMatures(a) - S.depositMatures(b)), plans = S.bankPlans();
      const p = plans[plan] || plans[0], a = +amount || 0;
      scr.innerHTML = `${head('定期存款', 'Savings — earn interest')}
        <div class="atm-plans">${plans.map((x, i) => `<button type="button" class="${i === plan ? 'on' : ''}" data-p="${i}"><b>${Math.round(x.rate * 100)}%</b><small>${x.days} 天 days</small></button>`).join('')}</div>
        ${amountBox(`银行里有 Bank: ${bal}`, bal)}
        <div class="atm-calc" id="calc">${a > 0 ? `${p.days} 天后拿回 Back after ${p.days} days: <b>${a + Math.round(a * p.rate)}</b> ${coinI(14)} (+${Math.round(a * p.rate)})` : '要存够天数才有利息。Leave it for the full days to earn interest.'}</div>
        <div class="atm-foot">${back}<button type="button" class="atm-btn green" data-do="ok">🐷 <span class="zh">存定期</span> Save</button></div>
        ${deps.length ? `<div class="atm-h sub"><b class="zh">我的定期</b> My savings</div><div class="atm-deps">${deps.map((d) => {
          const t = S.depositTerms(d), ripe = Date.now() >= S.depositMatures(d), left = S.depositMatures(d) - Date.now();
          const dl = Math.ceil(left / 864e5), hl = Math.ceil(left / 36e5);
          return `<div class="dep ${ripe ? 'ripe' : ''}"><div class="top"><b>${d.amount} ${coinI(14)}</b><span>${Math.round(t.rate * 100)}% · ${t.days} 天</span></div>
            <div class="bar"><i style="width:${Math.min(100, ((Date.now() - d.at) / (t.days * 864e5)) * 100)}%"></i></div>
            <div class="row-s">${ripe ? `✅ 可以拿了 Ready: <b>${d.amount + S.depositInterest(d)}</b>` : `⏳ ${dl > 1 ? `${dl} 天 days` : `${hl} 小时 hours`} · then +${S.depositInterest(d)}`}</div>
            <button type="button" class="atm-btn ${ripe ? 'green' : 'grey'}" data-w="${d.id}">${ripe ? '💰 取出 Collect' : '取出 Take out early (no interest)'}</button></div>`;
        }).join('')}</div>` : ''}`;
      afterAmount = () => { const c = $('#calc', scr), v = +amount || 0, pp = S.bankPlans()[plan]; if (c) { c.innerHTML = v > 0 ? `${pp.days} 天后拿回 Back after ${pp.days} days: <b>${v + Math.round(v * pp.rate)}</b> ${coinI(14)} (+${Math.round(v * pp.rate)})` : '要存够天数才有利息。Leave it for the full days to earn interest.'; hydrateIcons(c); } };
      onEnter = async () => {
        const v = +amount || 0;
        if (v <= 0) return toast('输入金币数量 · Type how many coins');
        if (v > S.bankBalance()) { sfx.miss(); return toast('银行里没有那么多 · Not that many coins in the bank'); }
        if (!S.deposit(v, plan)) return;
        sfx.coin(); toast(`🐷 <span class="zh">存了 ${v} 金币定期！</span> Saved ${v} coins`, { ms: 2400 });
        amount = ''; render();
      };
    } else if (view === 'done') {
      scr.innerHTML = `<div class="atm-welcome"><div class="big">✅</div><b>${sel || ''}</b><span>银行余额 Balance: <b>${bal}</b> ${coinI(18)}</span><span>钱包 Wallet: <b>${s.coins}</b> ${coinI(18)}</span>
        <div class="atm-foot"><button type="button" class="atm-btn" data-go="menu">↩️ <span class="zh">还要别的</span> Something else</button><button type="button" class="atm-btn grey" data-go="eject">⏏️ <span class="zh">取卡</span> Take card</button></div></div>`;
    }
    hydrateIcons(scr);
  }
  const done = (text) => { view = 'done'; sel = text; render(); };
  scr.addEventListener('click', async (e) => {
    const g = e.target.closest('[data-go]'), q = e.target.closest('[data-q]'), f = e.target.closest('[data-f]'), pl = e.target.closest('[data-p]'), w = e.target.closest('[data-w]'), ok = e.target.closest('[data-do]');
    if (g) {
      sfx.click(); const to = g.dataset.go;
      if (to === 'insert') { $('#card', n).classList.add('in'); setTimeout(() => { view = 'menu'; render(); }, 650); return; }
      if (to === 'eject') { $('#card', n).classList.remove('in'); view = 'start'; amount = ''; sel = null; render(); return; }
      if (to === 'transfer' && Auth.session()) Friends.refreshFriends().then(() => { if (view === 'transfer') render(); }).catch(() => {});
      view = to; amount = ''; if (to !== 'transfer') sel = null; render(); return;
    }
    if (q) { sfx.click(); setAmount(q.dataset.q); return; }
    if (f) { sfx.click(); sel = f.dataset.f; render(); return; }
    if (pl) { sfx.click(); plan = +pl.dataset.p; render(); return; }
    if (ok && onEnter) { await onEnter(); return; }
    if (w) {
      const d = S.bank().deposits.find((x) => x.id === w.dataset.w); if (!d) return;
      const ripe = Date.now() >= S.depositMatures(d);
      if (!ripe && !(await confirmBox('现在拿出来？ Take it out now?', `现在拿出来就<b>没有利息</b>，只拿回 ${d.amount} 金币。<br>Taking it out now gives <b>no interest</b> — just your ${d.amount} coins back.`, '拿出来 Take out', '取消 Cancel'))) return;
      const res = S.withdraw(d.id); if (!res) return;
      if (res.interest) { sfx.fanfare(); confetti(); toast(`💰 <span class="zh">拿回 ${res.amount + res.interest} 金币！</span> +${res.interest} interest — in your bank`, { ms: 3500 }); }
      else { sfx.coin(); toast(`🐷 ${res.amount} 金币回到银行 · ${res.amount} coins back in your bank`); }
      render();
    }
  });
  $('#keys', n).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k; sfx.click();
    if (k === 'ok') { if (onEnter) await onEnter(); return; }
    if (!$('#amt', scr)) return;                      // no amount on this screen
    if (k === 'C') setAmount(''); else if (k === '⌫') setAmount(amount.slice(0, -1)); else setAmount(amount + k);
  });
  // number keys on a keyboard too
  const onKey = (e) => {
    if (!n.isConnected) { window.removeEventListener('keydown', onKey); return; }
    if (/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || '')) return;
    if (/^[0-9]$/.test(e.key) && $('#amt', scr)) setAmount(amount + e.key);
    else if (e.key === 'Backspace' && $('#amt', scr)) setAmount(amount.slice(0, -1));
    else if (e.key === 'Enter' && onEnter) onEnter();
  };
  window.addEventListener('keydown', onKey);
  const un = S.onChange(() => { if (!n.isConnected) { un && un(); return; } if (['menu', 'history', 'done'].includes(view)) render(); });
  $('#home', n).onclick = () => go('map');
  render();
  return n;
}
