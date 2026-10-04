// Parent area: PIN gate, spelling lists, progress and settings.
import * as S from './state.js';
import { FURS, ITEMS, spriteCanvas } from './pixel.js';
import { STORIES, storySVG } from './essayart.js';
import { pictureNode } from './essay.js';
import { $, $$, html, esc, coinI, hydrateIcons, KittenView, toast, confirmBox, openModal, closeModal } from './ui.js';
import { speak, chineseVoices, sfx } from './audio.js';
import * as Cloud from './cloud.js';
import * as Auth from './auth.js';
import { parentFriendsView, incomingRequests } from './friends.js';
import { KINDS, parseSet } from './practice.js';

let unlockedUntil = 0;

export function parentScreen(params) {
  const go = params.go; let tab = params.tab || 'lists';
  if (Date.now() > unlockedUntil) return pinGate(go, tab);
  const n = html`<section class="screen"><div class="parent stack">
      <div class="parent-head">
        <div class="h-title"><span class="zh">家长专区</span><span class="en">Parent area</span><small class="acct">👤 ${esc((Auth.user() || {}).email || '')}</small></div>
        <div class="row" style="gap:8px"><button class="btn white small" id="p-logout">🚪 Log out</button><button class="btn white small" id="home">← 回家 Home</button></div>
      </div>
      <div class="tabs" id="tabs">
        <button class="tab" data-tab="lists"><span class="zh">听写词语</span> Lists</button>
        <button class="tab" data-tab="progress"><span class="zh">学习进度</span> Progress</button>
        <button class="tab" data-tab="essays"><span class="zh">作文</span> Essays${S.essays().some((e) => e.status === 'submitted') ? ' 🔴' : ''}</button>
        <button class="tab" data-tab="practice"><span class="zh">练习</span> Practice</button>
        <button class="tab" data-tab="acts"><span class="zh">活动设置</span> 🎯 Activities</button>
        <button class="tab" data-tab="friends"><span class="zh">朋友</span> Friends${incomingRequests().length ? ' 🔴' : ''}</button>
        <button class="tab" data-tab="bank"><span class="zh">银行</span> Bank</button>
        <button class="tab" data-tab="shop"><span class="zh">商店价格</span> Prices</button>
        <button class="tab" data-tab="settings"><span class="zh">设置</span> Settings</button>
      </div>
      <div class="card" id="body" style="border-top-left-radius:0"></div>
    </div></section>`;
  const body = $('#body', n);
  let dirty = false;
  const show = (t) => {
    if (t !== tab) window.scrollTo(0, 0);
    tab = t; params.tab = t; dirty = false;     // remember the tab, so a refresh stays on it
    $$('.tab', n).forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    body.innerHTML = '';
    body.appendChild(t === 'lists' ? listsView(rerender) : t === 'progress' ? progressView(rerender) : t === 'shop' ? pricesView(rerender) : t === 'essays' ? essaysView(rerender) : t === 'friends' ? parentFriendsView(rerender) : t === 'practice' ? practiceView(rerender) : t === 'acts' ? activitiesView(rerender) : t === 'bank' ? bankView(rerender) : settingsView(rerender, go));
    hydrateIcons(body);
  };
  const rerender = () => { const y = window.scrollY; show(tab); window.scrollTo(0, y); };
  $('#tabs', n).onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); };
  $('#home', n).onclick = () => { unlockedUntil = 0; go('home'); };
  $('#p-logout', n).onclick = () => logOut(go);
  n._mounted = () => show(tab);
  // newer data arrived (cloud sync): redraw this tab in place — but never while she's typing or a box is open
  body.addEventListener('input', () => { dirty = true; });
  n._refresh = () => {
    const a = document.activeElement;
    const m = document.querySelector('#modal');
    if (dirty || (a && body.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) || (m && !m.classList.contains('hidden'))) return;
    const y = window.scrollY; show(tab); window.scrollTo(0, y);
  };
  return n;
}

async function logOut(go) {
  if (!(await confirmBox('Log out?', 'Progress is saved in the account. Log back in any time with the same email and password.', 'Log out'))) return;
  await Cloud.backupNow();
  Cloud.stop(); await Auth.signOut();
  S.resetAll();
  unlockedUntil = 0; go('login');
}

// ---------- bank: interest plans ----------
function bankView(rerender) {
  const plans = S.bankPlans();
  const deps = S.bank().deposits;
  const n = html`<div class="stack">
      <p class="help">The 🏦 Bank app on her phone lets her save coins for a set number of days. If she leaves them for the full time she gets interest; taking them out early gives back only what she put in. Set the three plans here. Changes apply to <b>new</b> deposits — money already saved keeps the terms it was saved with.</p>
      <div class="bank-plans">${plans.map((p, i) => `<div class="bank-plan card">
          <b>Plan ${i + 1}</b>
          <label class="field">Interest %<input type="number" min="0" max="500" step="1" inputmode="numeric" data-r="${i}" value="${Math.round(p.rate * 1000) / 10}"></label>
          <label class="field">Days to wait<input type="number" min="1" max="365" inputmode="numeric" data-d="${i}" value="${p.days}"></label>
        </div>`).join('')}</div>
      <div class="row"><button class="btn green" id="save">Save plans</button><button class="btn white" id="reset">Reset to 10% / 15% / 20%</button></div>
      <h3>Her savings</h3>
      <div id="deps" class="stack"></div>
    </div>`;
  $('#save', n).onclick = () => {
    const list = plans.map((_, i) => ({ rate: (+$(`[data-r="${i}"]`, n).value || 0) / 100, days: +$(`[data-d="${i}"]`, n).value || 1 }));
    S.setBankPlans(list); toast('Bank plans saved ✓'); rerender();
  };
  $('#reset', n).onclick = () => { S.setBankPlans(S.BANK_DEFAULTS); toast('Reset ✓'); rerender(); };
  const box = $('#deps', n);
  if (!deps.length) box.innerHTML = '<p class="help" style="margin:0">Nothing saved yet.</p>';
  deps.forEach((d) => {
    const t = S.depositTerms(d), due = S.depositMatures(d), ripe = Date.now() >= due;
    box.appendChild(html`<div class="list-row" style="grid-template-columns:1fr auto"><div><b>${d.amount} coins</b> · ${Math.round(t.rate * 1000) / 10}% for ${t.days} days<div class="help" style="margin:0">Saved ${new Date(d.at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })} · ${ripe ? 'ready now' : 'ready ' + new Date(due).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })} · +${S.depositInterest(d)} interest</div></div><span>${ripe ? '✅' : '⏳'}</span></div>`);
  });
  return n;
}

// ---------- practice sets: 词语选择 / 词语搭配 / 排句子 ----------
let practiceKind = 'choice';
const FORMAT_HELP = {
  choice: `One question per line: the sentence with ____ for the blank, then | and the choices separated by /. Put * before the right answer.<br><code>____今天不下雨，我们就去踢足球。 | 结果 / *如果 / 果然</code>`,
  match: `Line 1: the words in the box, separated by spaces. Then one line per question: the phrase with （ ） for the blank, then | and the answer (it must be one of the box words). Add an extra box word that isn't used, to make it harder.<br><code>急忙 小猫 发抖 时间 废物 生病<br>全身（ ） | 发抖<br>（ ）离开 | 急忙</code>`,
  order: `One question per line: the helping words separated by spaces, then = and the correct sentence. The app mixes up the words for her. If another sentence is also correct, add it after ||.<br><code>肚子 小明 很痛 带他 医生 看 所以 去 妈妈 = 小明肚子很痛所以妈妈带他去看医生</code>`,
};
function practiceView(rerender) {
  const kind = practiceKind, K = KINDS[kind];
  const sets = S.practiceSets(kind).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
  const n = html`<div class="stack">
      <div class="seg">${Object.entries(KINDS).map(([k, v]) => `<button type="button" data-k="${k}" class="${k === kind ? 'on' : ''}">${v.icon} ${v.zh} ${v.en}</button>`).join('')}</div>
      <p class="help" style="margin:0">${K.how} Sets work like spelling lists: each has a date (she sees it from that day), and you can hide, edit or delete it. Ready-made sets are included; you can edit them, hide them, or write your own. She earns 1 coin and XP for each question right first time (once a day per set).</p>
      <div class="row"><button class="btn green" id="new">＋ New set</button><button class="btn white" id="restore">↺ Restore ready-made sets</button></div>
      <div class="stack" id="rows"></div>
    </div>`;
  n.querySelector('.seg').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) { practiceKind = b.dataset.k; rerender(); } };
  const rows = $('#rows', n);
  if (!sets.length) rows.innerHTML = '<p class="help">No sets yet.</p>';
  sets.forEach((x) => {
    const p = parseSet(kind, x.text), future = (x.date || '') > S.todayStr();
    const r = html`<div class="list-row dated">
        <label class="field" style="margin:0;font-size:12px">Date<input type="date" class="date-in" value="${x.date || S.todayStr()}"></label>
        <div style="min-width:0"><div class="nm">${esc(x.name)} <span class="en">· ${p.items.length} questions</span>${x.builtin ? '<span class="list-badge sched">ready-made</span>' : ''}${x.hidden ? '<span class="list-badge lock">🙈 hidden</span>' : ''}${future ? '<span class="list-badge sched">📅 later</span>' : ''}${x.best != null ? `<span class="list-badge done">best ${x.best}%</span>` : ''}${p.errors.length ? '<span class="list-badge" style="background:#ffc9cf">⚠ check</span>' : ''}</div>
          <div class="words">${esc(kind === 'match' ? p.items.map((it) => it.p.replace(/（\s*）|\(\s*\)/, `（${it.ans}）`)).join('、') : kind === 'choice' ? p.items.map((it) => it.opts[it.ans]).join('、') : p.items.map((it) => it.answers[0]).join(' '))}</div></div>
        <div class="row" style="gap:6px"><button class="btn white small" data-a="hide">${x.hidden ? '🙈 Hidden' : '👁 Shown'}</button><button class="btn white small" data-a="edit">Edit</button><button class="btn white small" data-a="del">🗑</button></div>
      </div>`;
    $('.date-in', r).onchange = (e) => { if (e.target.value) { S.savePracticeSet(kind, x.id, { date: e.target.value }); rerender(); } };
    r.querySelector('[data-a=hide]').onclick = () => { S.savePracticeSet(kind, x.id, { hidden: !x.hidden }); rerender(); };
    r.querySelector('[data-a=edit]').onclick = () => editPracticeSet(kind, x, rerender);
    r.querySelector('[data-a=del]').onclick = async () => {
      if (!(await confirmBox('Delete this set?', `“${esc(x.name)}” will be removed.${x.builtin ? ' (You can bring ready-made sets back with “Restore ready-made sets”.)' : ''}`, 'Delete'))) return;
      S.deletePracticeSet(kind, x.id); rerender();
    };
    rows.appendChild(r);
  });
  $('#new', n).onclick = () => editPracticeSet(kind, null, rerender);
  $('#restore', n).onclick = () => { const c = S.restoreBuiltins(kind); toast(c ? `Restored ${c} set${c > 1 ? 's' : ''} ✓` : 'All ready-made sets are already there'); rerender(); };
  return n;
}
function editPracticeSet(kind, x, rerender) {
  const K = KINDS[kind];
  const box = html`<div class="card stack">
      <h3>${x ? 'Edit' : 'New'} ${K.zh} ${K.en} set</h3>
      <div class="name-date"><label class="field">Name<input id="nm" value="${esc(x ? x.name : `${K.zh} ${new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`)}"></label>
        <label class="field">Date<input type="date" id="dt" value="${x ? x.date || S.todayStr() : S.todayStr()}"></label></div>
      <div class="help" style="margin:0">${FORMAT_HELP[kind]}</div>
      <textarea id="tx" style="min-height:200px;font-size:18px">${esc(x ? x.text : '')}</textarea>
      <div id="pv" class="help" style="margin:0"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn white" id="c">Cancel</button><button class="btn green" id="ok">Save</button></div>
    </div>`;
  const pv = () => {
    const p = parseSet(kind, $('#tx', box).value);
    $('#pv', box).innerHTML = (p.items.length ? `✅ ${p.items.length} question${p.items.length > 1 ? 's' : ''} ready.` : '') + (p.errors.length ? `<div style="color:#c0392b">${p.errors.map(esc).join('<br>')}</div>` : '');
  };
  $('#tx', box).oninput = pv; pv();
  $('#c', box).onclick = closeModal;
  $('#ok', box).onclick = () => {
    const text = $('#tx', box).value.trim(), p = parseSet(kind, text);
    if (!p.items.length) return toast('Add at least one question');
    if (p.errors.length) return toast('Please fix the lines marked in red');
    S.savePracticeSet(kind, x ? x.id : null, { name: $('#nm', box).value.trim() || K.zh, date: $('#dt', box).value || S.todayStr(), text });
    closeModal(); toast('Saved ✓'); rerender();
  };
  openModal(box);
  $('#modal .card').style.width = 'min(820px, 96vw)';
}

// ---------- PIN ----------
function pinGate(go, tab) {
  const s = S.get();
  const setting = !s.settings.pin;
  let first = null, entry = '', busy = false;
  const n = html`<section class="screen center"><div class="card stack" style="max-width:420px;width:100%;text-align:center">
      <div class="h-title" style="justify-content:center"><span class="zh">家长专区</span><span class="en">Parents only</span></div>
      <p class="help" id="msg">${setting ? 'Create a 4-digit PIN so only you can change the word lists and settings.' : 'Enter your 4-digit PIN.'}</p>
      <div class="pin-dots" id="dots">${'<i></i>'.repeat(4)}</div>
      <div class="keypad" id="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button class="btn white" data-k="${d}">${d}</button>`).join('')}
        <button class="btn white" data-k="back">⌫</button><button class="btn white" data-k="0">0</button><button class="btn white" data-k="x">✕</button></div>
      ${setting ? '' : '<button class="btn white small" id="forgot" style="align-self:center">Forgot PIN?</button>'}
    </div></section>`;
  const dots = () => $$('#dots i', n).forEach((d, i) => d.classList.toggle('on', i < entry.length));
  const msg = (t) => { $('#msg', n).textContent = t; };
  $('#pad', n).onclick = (e) => {
    const k = e.target.closest('[data-k]'); if (!k || busy) return;
    const v = k.dataset.k;
    if (v === 'x') return go('home');
    if (v === 'back') entry = entry.slice(0, -1); else if (entry.length < 4) entry += v;
    dots();
    if (entry.length < 4) return;
    busy = true;
    setTimeout(() => {
      busy = false;
      if (setting) {
        if (!first) { first = entry; entry = ''; dots(); msg('Type the same PIN again to confirm.'); return; }
        if (entry !== first) { first = null; entry = ''; dots(); msg("PINs didn't match — start again."); return; }
        S.get().settings.pin = entry; S.save();
      } else if (entry !== s.settings.pin) { entry = ''; dots(); msg('Wrong PIN, try again.'); sfx.oops(); return; }
      unlockedUntil = Date.now() + 15 * 60000;
      go('parent', { tab }, { replace: true });
    }, 150);
  };
  const f = $('#forgot', n);
  if (f) f.onclick = () => {
    const a = 12 + Math.floor(Math.random() * 20), b = 13 + Math.floor(Math.random() * 20);
    const box = html`<div class="card stack"><h3>Reset PIN</h3><p class="help">Answer to clear the PIN: <b>${a} × ${b} = ?</b></p>
      <label class="field"><input id="ans" inputmode="numeric"></label>
      <div class="row" style="justify-content:flex-end"><button class="btn white" id="c">Cancel</button><button class="btn" id="ok">Reset</button></div></div>`;
    $('#c', box).onclick = closeModal;
    $('#ok', box).onclick = () => {
      if (+$('#ans', box).value === a * b) { S.get().settings.pin = null; S.save(); closeModal(); go('parent', { tab }); }
      else toast('Not quite');
    };
    openModal(box);
  };
  return n;
}

// ---------- lists ----------
function listsView(rerender) {
  const s = S.get();
  const today = S.todayStr();
  const cur = S.currentList();
  const n = html`<div class="stack">
      <p class="help">Each list has a <b>spelling date</b>. A list appears for her on that date, and the newest one becomes the current spelling.
        She must finish the current list before she can redo older ones. Each list can be done <b>once a day</b>.</p>
      <div class="stack" id="rows"></div>
      <button class="btn green" id="add" style="align-self:flex-start">＋ <span class="zh">新的听写</span> New list</button>
    </div>`;
  const rows = $('#rows', n);
  const sorted = s.lists.slice().sort((a, b) => S.listDate(b).localeCompare(S.listDate(a)) || (b.createdAt || 0) - (a.createdAt || 0));
  sorted.forEach((l) => {
    const st = S.listStatus(l), isCur = cur && cur.id === l.id;
    const badges = [
      l.hidden ? '<span class="list-badge lock">🙈 hidden from her</span>' : '',
      st === 'future' ? `<span class="list-badge sched">📅 Shows on ${new Date(S.listDate(l) + 'T00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</span>` : '',
      isCur ? `<span class="list-badge cur">⭐ Current${l.done ? ' · done' : ' · not done yet'}</span>` : '',
      st === 'locked' ? '<span class="list-badge lock">🔒 after current</span>' : '',
      S.itemCount(l) ? `<span class="list-badge done">✅ done today${S.itemCount(l) > 1 ? ` ×${S.itemCount(l)}` : ''}</span>` : '',
    ].join('');
    const r = html`<div class="list-row dated ${isCur ? 'on' : ''}">
        <label class="field" style="margin:0;font-size:12px">Date<input type="date" class="date-in" value="${S.listDate(l)}"></label>
        <div style="min-width:0"><div class="nm">${esc(l.name)} <span class="en">· ${l.words.length} words</span>${badges}</div>
          <div class="words">${esc(l.words.map((w) => w.w).join('、'))}</div></div>
        <div class="row" style="gap:6px"><button class="btn white small" data-a="hide" title="Show / hide for her">${l.hidden ? '🙈 Hidden' : '👁 Shown'}</button><button class="btn white small" data-a="edit">Edit</button><button class="btn white small" data-a="del">🗑</button></div>
      </div>`;
    $('.date-in', r).onchange = (e) => { if (!e.target.value) return; l.date = e.target.value; S.save(); rerender(); toast('Date saved ✓'); };
    r.querySelector('[data-a=edit]').onclick = () => editList(l, rerender);
    r.querySelector('[data-a=hide]').onclick = () => { l.hidden = !l.hidden; S.save(); rerender(); toast(l.hidden ? 'Hidden from her' : 'Shown to her ✓'); };
    r.querySelector('[data-a=del]').onclick = async () => {
      if (s.lists.length === 1) return toast('Keep at least one list');
      if (!(await confirmBox('Delete list?', `“${esc(l.name)}” will be removed. Progress on its words is kept.`, 'Delete'))) return;
      s.lists = s.lists.filter((x) => x.id !== l.id);
      if (s.activeListId === l.id) s.activeListId = (S.currentList() || s.lists[0]).id;
      S.save(); rerender();
    };
    rows.appendChild(r);
  });
  $('#add', n).onclick = () => editList(null, rerender);
  return n;
}

function editList(list, rerender) {
  const s = S.get();
  const isNew = !list;
  const text = list ? list.words.map((w) => (w.hint ? `${w.w} | ${w.hint}` : w.w)).join('\n') : '';
  const box = html`<div class="card stack">
      <h3>${isNew ? 'New spelling list' : 'Edit list'}</h3>
      <div class="name-date">
        <label class="field">List name<input id="nm" value="${esc(list ? list.name : `听写 ${new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`)}"></label>
        <label class="field">Spelling date<input type="date" id="dt" value="${list ? S.listDate(list) : S.todayStr()}"></label>
      </div>
      <p class="help" style="margin:0">She sees the list from this date. Set a future date to schedule it.</p>
      <label class="field">Words — one per line (or separated by spaces / commas)
        <textarea id="tx" placeholder="公园 | 我们去公园玩&#10;朋友&#10;高兴 | 我今天很高兴">${esc(text)}</textarea>
        <small>Optional: after a <b>|</b> add a short sentence. The kitten reads it when she taps 💬 Sentence, which helps with words that sound alike (e.g. 公园 vs 公元).</small>
      </label>
      <div class="chips" id="pv"></div>
      <div class="row" style="justify-content:space-between">
        <button class="btn white" id="test">🔊 Test voice</button>
        <span class="row"><button class="btn white" id="c">Cancel</button><button class="btn green" id="ok">Save</button></span>
      </div>
    </div>`;
  const preview = () => {
    const words = S.parseWords($('#tx', box).value);
    $('#pv', box).innerHTML = words.map((w) => {
      const bad = ![...w.w].some((ch) => /\p{Script=Han}/u.test(ch));
      return `<span class="chip ${bad ? 'warn' : ''}" title="${esc(w.hint)}">${esc(w.w)}${w.hint ? ' 💬' : ''}</span>`;
    }).join('') || '<span class="help">Preview appears here</span>';
  };
  $('#tx', box).oninput = preview;
  preview();
  $('#test', box).onclick = async () => { const w = S.parseWords($('#tx', box).value); for (const x of w.slice(0, 3)) await speak(x.w); };
  $('#c', box).onclick = closeModal;
  $('#ok', box).onclick = () => {
    const words = S.parseWords($('#tx', box).value);
    if (!words.length) return toast('Add at least one word');
    const name = $('#nm', box).value.trim() || 'Spelling list';
    const date = $('#dt', box).value || S.todayStr();
    if (isNew) {
      const l = { id: S.uid(), name, words, date, createdAt: Date.now() };
      s.lists.unshift(l);
      if (date <= S.todayStr()) s.activeListId = l.id;
    } else { list.name = name; list.words = words; list.date = date; }
    S.save(); closeModal(); rerender();
    toast(isNew ? (date > S.todayStr() ? 'List scheduled ✓' : 'List added ✓') : 'Saved ✓');
  };
  openModal(box);
  setTimeout(() => $('#tx', box).focus(), 50);
}

// ---------- progress ----------
function progressView(rerender) {
  const s = S.get();
  const entries = Object.entries(s.words);
  const attempts = entries.reduce((a, [, w]) => a + w.attempts, 0);
  const firsts = entries.reduce((a, [, w]) => a + w.firstTry, 0);
  const week = Date.now() - 7 * 86400000;
  const weekSessions = s.sessions.filter((x) => x.at > week);
  const days = new Set(weekSessions.map((x) => S.todayStr(new Date(x.at)))).size;
  const weak = entries.filter(([, w]) => w.wrong > 0 || w.review).sort((a, b) => (b[1].review - a[1].review) || (b[1].wrong - a[1].wrong)).slice(0, 40);
  const n = html`<div class="stack">
      <div class="kpis">
        <div class="kpi"><b>${days}/7</b><span>Days practised this week</span></div>
        <div class="kpi"><b>${weekSessions.length}</b><span>Rounds this week</span></div>
        <div class="kpi"><b>${entries.length}</b><span>Different words tried</span></div>
        <div class="kpi"><b>${attempts ? Math.round((firsts / attempts) * 100) : 0}%</b><span>Right on first try</span></div>
      </div>
      <h3>Words to work on</h3>
      ${weak.length ? `<table class="stats-table"><thead><tr><th>Word</th><th>Tries</th><th>Missed</th><th>In mistakes book</th><th></th></tr></thead><tbody>
        ${weak.map(([w, x]) => `<tr><td class="w">${esc(w)}</td><td>${x.attempts}</td><td>${x.wrong}</td><td>${x.review ? '✓' : '—'}</td><td>${x.review ? `<button class="btn white small" data-clear="${esc(w)}">Mark learned</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : '<p class="help">Nothing yet — words she misses will show up here.</p>'}
      <p class="help">A word leaves the mistakes book after she writes it right on the first try twice in a row.</p>
      <h3>Recent rounds</h3>
      ${s.sessions.length ? `<table class="stats-table"><thead><tr><th>When</th><th>List</th><th>First try</th><th>Coins</th></tr></thead><tbody>
        ${s.sessions.slice(0, 15).map((x) => `<tr><td>${new Date(x.at).toLocaleString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td><td class="w" style="font-size:16px">${esc(x.listName)}</td><td>${x.firstTry}/${x.total}</td><td>${x.coins}</td></tr>`).join('')}
      </tbody></table>` : '<p class="help">No rounds yet.</p>'}
    </div>`;
  n.addEventListener('click', (e) => {
    const b = e.target.closest('[data-clear]'); if (!b) return;
    const w = s.words[b.dataset.clear]; if (w) { w.review = false; S.save(); rerender(); }
  });
  return n;
}

// ---------- settings ----------
// ---------- 🎯 Activities: home page, daily tasks, rewards, daily limits, pinyin ----------
const ACT_NAMES = { spelling: '✏️ 听写 Spelling', essay: '✍️ 看图作文 Picture writing', choice: '🔤 词语选择 Word choice', match: '🧩 词语搭配 Word match', order: '🧱 排句子 Sentence builder' };
const MENU_NAMES = { tasks: '📋 功课 Tasks', review: '📕 错词本 Mistakes', feed: '🐟 喂食喝水 Food & water', shop: '🛍️ 商店 Shop', dress: '👗 我的物品 My Items', house: '🏠 我的家 Home', friends: '👫 朋友 Friends' };
function activitiesView(rerender) {
  const shown = S.homeActs(), acts = [...shown, ...S.HOME_ACTS.filter((k) => !shown.includes(k))];
  const menu = S.menuOrder();
  const arrows = (i, len, grp) => `<span class="mv"><button class="btn small white" data-mv="${grp}" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">▲</button><button class="btn small white" data-mv="${grp}" data-i="${i}" data-d="1" ${i === len - 1 ? 'disabled' : ''} aria-label="Move down">▼</button></span>`;
  const n = html`<div class="stack acts-set">
      <p class="help" style="margin:0">Everything about her activities in one place. Changes apply straight away.</p>
      <h3>🏠 Home page — activity shortcuts</h3>
      <p class="help" style="margin:0">Tick what shows on her home page, and use ▲▼ to put them in order. Everything is always in the 📋 Tasks button too.</p>
      <div class="order-list">${acts.map((k, i) => `<div class="order-row ${shown.includes(k) ? '' : 'off'}"><label class="chk"><input type="checkbox" data-ha="${k}" ${shown.includes(k) ? 'checked' : ''}> ${ACT_NAMES[k]}</label>${shown.includes(k) ? arrows(shown.indexOf(k), shown.length, 'ha') : ''}</div>`).join('')}</div>
      <h3>🔘 Home page — button order</h3>
      <p class="help" style="margin:0">The buttons under her daily tasks. Use ▲▼ to change the order.</p>
      <div class="order-list">${menu.map((k, i) => `<div class="order-row"><span class="nm">${i + 1}. ${esc(MENU_NAMES[k])}</span>${arrows(i, menu.length, 'menu')}</div>`).join('')}</div>
      <h3>📋 Daily tasks</h3>
      <p class="help" style="margin:0">Choose her daily tasks and the coins for each. When she finishes all of them she gets the bonus and her streak goes up. (If a day has no tasks done, the kitten feels it — same as before.)</p>
      <div class="rw-list">${Object.entries(S.DAILY_TASKS).map(([k, t]) => { const r = S.dailyTaskSetting(k); return `<div class="rw-row dt-row" data-dt="${k}">
          <div class="rw-name"><b><span class="zh">${esc(k === 'care' ? '照顾小猫' : t.zh)}</span></b><small class="help">${esc(t.en)}</small></div>
          <div class="rw-ctl"><button class="switch small ${r.on ? 'on' : ''}" data-f="on" aria-label="On/off"></button><span>🪙 Coins</span><input type="number" min="0" max="9999" inputmode="numeric" data-f="coins" value="${r.coins}" ${r.on ? '' : 'disabled'}></div>
        </div>`; }).join('')}
        <div class="rw-row dt-row"><div class="rw-name"><b>🎉 全部完成 All-done bonus</b><small class="help">extra coins when every task above is done</small></div><div class="rw-ctl"><span>🪙 Coins</span><input type="number" min="0" max="9999" inputmode="numeric" id="dt-bonus" value="${S.dailyBonus()}"></div></div>
      </div>
      <h3>🎁 Rewards for activities</h3>
      <p class="help" style="margin:0">For each activity, choose whether she gets coins, XP, or both — and how much.</p>
      <div class="rw-list">${Object.entries(S.REWARD_ACTS).map(([k, a]) => { const r = S.rewardSetting(k); return `<div class="rw-row" data-rw="${k}">
          <div class="rw-name"><b><span class="zh">${a.zh}</span> ${a.en}</b><small class="help">for ${a.per}</small></div>
          <div class="rw-ctl"><button class="switch small ${r.coinsOn ? 'on' : ''}" data-f="coinsOn" aria-label="Coins on/off"></button><span>🪙 Coins</span><input type="number" min="0" max="9999" inputmode="numeric" data-f="coins" value="${r.coins}" ${r.coinsOn ? '' : 'disabled'}></div>
          <div class="rw-ctl"><button class="switch small ${r.xpOn ? 'on' : ''}" data-f="xpOn" aria-label="XP on/off"></button><span>⭐ XP</span><input type="number" min="0" max="9999" inputmode="numeric" data-f="xp" value="${r.xp}" ${r.xpOn ? '' : 'disabled'}></div>
        </div>`; }).join('')}</div>
      <h3>⏰ Times a day</h3>
      <p class="help" style="margin:0">How many times a day she can do each activity. <b>0 = no limit.</b> “Whole activity” counts every round she finishes; “each list / set” stops her repeating the same one. The Mistakes book and Play with me are never limited.</p>
      <div class="rw-list">${Object.entries(S.LIMIT_ACTS).map(([k, a]) => { const l = S.limitSetting(k); return `<div class="rw-row lim-row" data-lim="${k}">
          <div class="rw-name"><b><span class="zh">${a.zh}</span> ${a.en}</b><small class="help">done today: ${S.todayCount(k)} ${a.unit}</small></div>
          <div class="rw-ctl"><span>Whole activity</span><input type="number" min="0" max="99" inputmode="numeric" data-f="perDay" value="${l.perDay}"></div>
          ${l.perItem !== null ? `<div class="rw-ctl"><span>${a.item === 'each list' ? 'Each list' : 'Each set'}</span><input type="number" min="0" max="99" inputmode="numeric" data-f="perItem" value="${l.perItem}"></div>` : '<div></div>'}
        </div>`; }).join('')}</div>
      <h3>🔤 Hanyu Pinyin</h3>
      <p class="help" style="margin:0">Show pinyin above the words she picks from.</p>
      ${Object.entries(S.PINYIN_ACTS).map(([k, nm]) => `<div class="toggle"><span>${nm}</span><button class="switch ${S.showPinyin(k) ? 'on' : ''}" data-py="${k}"></button></div>`).join('')}
    </div>`;
  // home shortcuts + order
  const saveActs = () => { S.setHomeActs([...n.querySelectorAll('[data-ha]')].filter((x) => x.checked).map((x) => x.dataset.ha)); toast('Home page updated ✓'); rerender(); };
  n.querySelectorAll('[data-ha]').forEach((c) => { c.onchange = saveActs; });
  n.querySelectorAll('[data-mv]').forEach((b) => { b.onclick = () => {
    const i = +b.dataset.i, d = +b.dataset.d;
    const list = b.dataset.mv === 'ha' ? S.homeActs().slice() : S.menuOrder().slice();
    [list[i], list[i + d]] = [list[i + d], list[i]];
    if (b.dataset.mv === 'ha') S.setHomeActs(list); else S.setMenuOrder(list);
    toast('Order saved ✓'); rerender();
  }; });
  // daily tasks
  n.querySelectorAll('[data-dt]').forEach((row) => {
    const k = row.dataset.dt;
    $('.switch', row).onclick = (e) => { const on = !e.currentTarget.classList.contains('on'); S.setDailyTask(k, 'on', on); e.currentTarget.classList.toggle('on', on); $('input', row).disabled = !on; toast(on ? 'Task added ✓' : 'Task removed ✓'); };
    $('input', row).onchange = (e) => { S.setDailyTask(k, 'coins', e.target.value); e.target.value = S.dailyTaskSetting(k).coins; toast('Saved ✓'); };
  });
  $('#dt-bonus', n).onchange = (e) => { S.setDailyTask('bonus', null, e.target.value); e.target.value = S.dailyBonus(); toast('Saved ✓'); };
  // rewards per activity
  n.querySelectorAll('[data-rw]').forEach((row) => {
    const k = row.dataset.rw;
    row.querySelectorAll('.switch[data-f]').forEach((b) => { b.onclick = () => {
      const on = !b.classList.contains('on'); S.setReward(k, b.dataset.f, on);
      b.classList.toggle('on', on); row.querySelector(`input[data-f=${b.dataset.f === 'coinsOn' ? 'coins' : 'xp'}]`).disabled = !on;
      toast(on ? 'Turned on ✓' : 'Turned off ✓');
    }; });
    row.querySelectorAll('input[data-f]').forEach((i) => { i.onchange = () => { S.setReward(k, i.dataset.f, i.value); i.value = S.rewardSetting(k)[i.dataset.f]; toast('Saved ✓'); }; });
  });
  // limits
  n.querySelectorAll('[data-lim]').forEach((row) => {
    const k = row.dataset.lim;
    row.querySelectorAll('input[data-f]').forEach((i) => { i.onchange = () => { S.setLimit(k, i.dataset.f, i.value); i.value = S.limitSetting(k)[i.dataset.f]; toast(+i.value ? `Saved ✓ — ${i.value} a day` : 'Saved ✓ — no limit'); }; });
  });
  // pinyin
  n.querySelectorAll('[data-py]').forEach((b) => { b.onclick = () => { const on = !b.classList.contains('on'); S.setPinyin(b.dataset.py, on); b.classList.toggle('on', on); toast(on ? 'Pinyin on ✓' : 'Pinyin off ✓'); }; });
  return n;
}

function settingsView(rerender, go) {
  const s = S.get(), set = s.settings;
  const voices = chineseVoices();
  const n = html`<div class="stack">
      <div class="row" style="align-items:flex-start;gap:18px">
        <div id="kv"></div>
        <div class="stack grow">
          <label class="field">Child's name<input id="cn" value="${esc(s.childName)}"></label>
          <label class="field">Kitten's name<input id="kn" value="${esc(s.kitten.name)}"></label>
          <label class="field">Kitten colour<select id="fur">${Object.entries(FURS).map(([k, f]) => `<option value="${k}" ${k === s.kitten.fur ? 'selected' : ''}>${f.name}</option>`).join('')}</select></label>
        </div>
      </div>
      <h3>Voice</h3>
      <label class="field">Speaking speed <input type="range" id="rate" min="0.4" max="1.1" step="0.05" value="${set.rate}"></label>
      <label class="field">Chinese voice
        <select id="voice"><option value="">Automatic (best Mandarin voice)</option>${voices.map((v) => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === set.voiceURI ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select>
        <small>${voices.length ? 'On iPad you can download nicer voices in Settings → Accessibility → Spoken Content → Voices → Chinese (China mainland).' : 'No Chinese voice found on this device. On iPad: Settings → Accessibility → Spoken Content → Voices → Chinese.'}</small>
      </label>
      <button class="btn white" id="tv" style="align-self:flex-start">🔊 Test: 我们去公园玩</button>
      <h3>Practice</h3>
      <div class="toggle">Shuffle word order<button class="switch ${set.shuffle !== false ? 'on' : ''}" id="sh"></button></div>
      <div class="toggle">Sound effects<button class="switch ${set.sound !== false ? 'on' : ''}" id="sd"></button></div>
      <h3>Coins</h3>
      <p class="help">Reward extra effort (e.g. a good score at school). She has <b id="have">${s.coins}</b> coins.</p>
      <div class="row coin-box">
        <label class="field" style="flex:1;min-width:140px">How many coins?<input type="number" id="coin-amt" min="1" max="9999" inputmode="numeric" placeholder="e.g. 20"></label>
        <button class="btn green" id="coin-add">＋ <span class="zh">奖励</span> Award</button>
        <button class="btn white" id="coin-sub">－ <span class="zh">扣除</span> Remove</button>
      </div>
      <div class="row"><span class="help" style="margin:0">Quick:</span>${[5, 10, 20, 50, 100].map((v) => `<button class="btn small white" data-q="${v}">${v}</button>`).join('')}</div>
      <h3>Levels &amp; XP</h3>
      <p class="help">She is <b>Lv<span id="lv-now">${S.level()}</span></b> with <b id="xp-have">${S.xp()}</b> XP. How much XP each activity gives is set in the 🎯 Activities tab → 🎁 Rewards.</p>
      <div class="xp-grid">
        <label class="field">XP needed for each level<input type="number" id="xp-level" min="1" max="9999" inputmode="numeric" value="${S.xpPerLevel()}"></label>
      </div>
      <p class="help" id="xp-plan"></p>
      <div class="row coin-box">
        <label class="field" style="flex:1;min-width:140px">Give or take away XP<input type="number" id="xp-amt" min="1" max="9999" inputmode="numeric" placeholder="e.g. 10"></label>
        <button class="btn green" id="xp-add">＋ <span class="zh">加</span> Add XP</button>
        <button class="btn white" id="xp-sub">－ <span class="zh">减</span> Remove XP</button>
      </div>
      <div class="row"><span class="help" style="margin:0">Quick:</span>${[5, 10, 20, 50, 100].map((v) => `<button class="btn small white" data-xq="${v}">${v}</button>`).join('')}</div>
      <div class="toggle"><span>Unlock all levels (for you to preview everything)<br><small class="help">Hair, shoes, extras, clothes and Home normally unlock at Lv5 / 10 / 15 / 20 / 25.</small></span><button class="switch ${set.unlockAll ? 'on' : ''}" id="ul"></button></div>
      <h3>🛡️ God mode</h3>
      <div class="toggle"><span>God mode — the kitten never gets hungry, thirsty, sick or dies<br><small class="help">Use it for holidays, exam weeks or sick days. Food, Water and Happy stay topped up, and missed days don't count. Turning it on also cures and brings back the kitten. Daily tasks and coins still work as usual.</small></span><button class="switch ${S.godMode() ? 'on' : ''}" id="god"></button></div>
      <h3>☁️ Account &amp; cloud backup</h3>
      <div class="sync-box">
        <div><small>Logged in as</small><div class="sync-code" style="font-size:20px;letter-spacing:0">${esc((Auth.user() || {}).email || '—')}</div></div>
        <div class="sync-status" id="sync-status"></div>
      </div>
      <p class="help">Progress is saved to this account automatically. Log in with the same email and password on any device (iPad, phone, laptop) to carry on there.</p>
      <div class="row"><button class="btn white small" id="sync-now">↻ Back up now</button><button class="btn white small" id="logout">Log out</button></div>
      <h3>Backup file</h3>
      <p class="help">Everything is saved on this iPad. Download a backup file now and then, so nothing is lost if Safari data is cleared.</p>
      <div class="row"><button class="btn blue" id="exp">⬇ Download backup</button><label class="btn white">⬆ Restore backup<input type="file" id="imp" accept="application/json,.json" hidden></label></div>
      <h3>Security</h3>
      <div class="row"><button class="btn white" id="pin">Change PIN</button><button class="btn red" id="reset">Reset everything</button></div>
    </div>`;
  const kv = new KittenView({ scale: 3 }); $('#kv', n).replaceWith(kv.canvas);
  const saveField = (sel, fn) => { $(sel, n).onchange = (e) => { fn(e.target.value); S.save(); kv.draw(); }; };
  saveField('#cn', (v) => { s.childName = v.trim(); });
  saveField('#kn', (v) => { s.kitten.name = v.trim() || '咪咪'; });
  saveField('#fur', (v) => { s.kitten.fur = v; });
  saveField('#rate', (v) => { set.rate = +v; });
  saveField('#voice', (v) => { set.voiceURI = v || null; });
  $('#rate', n).oninput = (e) => { set.rate = +e.target.value; };
  $('#tv', n).onclick = () => speak('我们去公园玩');
  $('#sh', n).onclick = () => { set.shuffle = set.shuffle === false; S.save(); rerender(); };
  $('#sd', n).onclick = () => { set.sound = set.sound === false; S.save(); rerender(); };
  const amt = () => Math.round(Math.abs(Number($('#coin-amt', n).value)));
  n.addEventListener('click', (e) => { const q = e.target.closest('[data-q]'); if (q) $('#coin-amt', n).value = q.dataset.q; });
  $('#coin-add', n).onclick = () => {
    const v = amt(); if (!v) return toast('Type how many coins first');
    s.coins += v; S.save(); $('#have', n).textContent = s.coins; $('#coin-amt', n).value = '';
    toast(`Awarded +${v} coins ✓`, { coins: 0 });
  };
  $('#coin-sub', n).onclick = () => {
    const v = amt(); if (!v) return toast('Type how many coins first');
    s.coins = Math.max(0, s.coins - v); S.save(); $('#have', n).textContent = s.coins; $('#coin-amt', n).value = '';
    toast(`Removed ${v} coins`);
  };
  // XP settings
  const xpPlan = () => {
    const per = S.xpPerLevel(), w = S.xpPerWord();
    const words = (lv) => (w ? Math.ceil(((lv - 1) * per) / w) : '—');
    $('#xp-plan', n).innerHTML = w
      ? `With these numbers, unlocks need about: Lv5 hair <b>${words(5)}</b> words · Lv10 shoes <b>${words(10)}</b> · Lv15 extras <b>${words(15)}</b> · Lv20 clothes <b>${words(20)}</b> · Lv25 Home <b>${words(25)}</b> correct words (compositions make it quicker).`
      : 'Spelling gives no XP right now, so she will only level up from the other activities and XP you add.';
    $('#lv-now', n).textContent = S.level(); $('#xp-have', n).textContent = S.xp();
  };
  xpPlan();
  $('#xp-level', n).onchange = (e) => { S.setXpSetting('level', e.target.value); e.target.value = S.xpPerLevel(); xpPlan(); toast('Saved ✓'); };
  const xamt = () => Math.round(Math.abs(Number($('#xp-amt', n).value)));
  n.addEventListener('click', (e) => { const q = e.target.closest('[data-xq]'); if (q) $('#xp-amt', n).value = q.dataset.xq; });
  $('#xp-add', n).onclick = () => {
    const v = xamt(); if (!v) return toast('Type how much XP first');
    S.addXp(v); S.save(); $('#xp-amt', n).value = ''; xpPlan(); toast(`Added +${v} XP ✓`);
  };
  $('#xp-sub', n).onclick = () => {
    const v = xamt(); if (!v) return toast('Type how much XP first');
    S.addXp(-v); S.save(); $('#xp-amt', n).value = ''; xpPlan(); toast(`Removed ${v} XP`);
  };
  $('#god', n).onclick = () => { S.setGodMode(!S.godMode()); toast(S.godMode() ? '🛡️ God mode on' : 'God mode off'); rerender(); };
  $('#ul', n).onclick = () => { set.unlockAll = !set.unlockAll; S.save(); rerender(); };
  const showStatus = () => {
    const st = Cloud.status, el = $('#sync-status', n); if (!el) return;
    el.className = 'sync-status ' + st.state;
    el.textContent = st.state === 'ok' ? `✓ Backed up ${st.at ? new Date(st.at).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' }) : ''}`
      : st.state === 'syncing' ? 'Syncing…' : st.state === 'offline' ? 'Offline — will retry' : 'Waiting…';
  };
  showStatus(); const off = Cloud.onStatus(() => { if (!n.isConnected) return off(); showStatus(); });
  $('#sync-now', n).onclick = () => Cloud.backupNow();
  $('#logout', n).onclick = () => logOut(go);
  $('#exp', n).onclick = () => {
    const blob = new Blob([JSON.stringify(S.get(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `meow-chinese-backup-${S.todayStr()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
  };
  $('#imp', n).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      if (!obj || !obj.kitten || !obj.lists) throw new Error('bad');
      if (!(await confirmBox('Restore backup?', 'This replaces everything on this iPad with the backup file.', 'Restore'))) return;
      S.replaceAll(obj); toast('Restored ✓'); rerender();
    } catch { toast('That file is not a Meow Chinese backup'); }
  };
  $('#pin', n).onclick = () => { s.settings.pin = null; S.save(); unlockedUntil = 0; go('parent', { tab: 'settings' }); };
  $('#reset', n).onclick = async () => {
    if (!(await confirmBox('Reset everything?', 'Coins, kitten, lists and progress will all be deleted. Download a backup first if unsure.', 'Reset'))) return;
    S.resetAll(); unlockedUntil = 0; go('welcome');
  };
  return n;
}

// ---------- shop prices ----------
function pricesView(rerender) {
  const groups = [['food', '食物 Food & drink'], ['special', '道具 Special'], ['pharmacy', '药房 Pharmacy'], ['service', '医院 Hospital'], ['wear', '衣服 Clothes'], ['decor', '花园 Garden']];
  const n = html`<div class="stack">
      <p class="help">Set how many coins each item costs. Changes apply straight away. For reference, a perfect day earns about ${S.dailyTasks().reduce((a, t) => a + t.coins, 0) + (S.dailyTasks().length ? S.dailyBonus() : 0)} coins from daily tasks, plus ${S.rewardFor('spelling').coins} per word written right first time (change this in 🎯 Activities → 🎁 Rewards).</p>
      <div id="groups" class="stack"></div>
      <button class="btn white" id="reset" style="align-self:flex-start">↺ Reset all to default prices</button>
    </div>`;
  const box = $('#groups', n);
  groups.forEach(([cat, label]) => {
    const g = html`<div><h3>${label}</h3><div class="price-grid"></div></div>`;
    const grid = $('.price-grid', g);
    Object.entries(ITEMS).filter(([, it]) => it.cat === cat).forEach(([id, it]) => {
      const changed = S.price(id) !== it.price;
      const row = html`<label class="price-row ${changed ? 'changed' : ''}">
          <span class="ico"></span>
          <span class="nm"><span class="zh">${it.name}</span><small>${it.en} · default ${it.price}</small></span>
          <input type="number" min="0" max="9999" inputmode="numeric" value="${S.price(id)}">
        </label>`;
      $('.ico', row).appendChild(spriteCanvas(id, 32));
      $('input', row).onchange = (e) => { S.setPrice(id, e.target.value); row.classList.toggle('changed', S.price(id) !== it.price); e.target.value = S.price(id); toast('Price saved ✓'); };
      grid.appendChild(row);
    });
    box.appendChild(g);
  });
  $('#reset', n).onclick = async () => {
    if (!(await confirmBox('Reset prices?', 'All items go back to their original prices.', 'Reset'))) return;
    S.get().prices = {}; S.save(); rerender();
  };
  return n;
}

// ---------- 看图作文: set up, review and reward ----------
function essaysView(rerender) {
  const list = S.essays();
  const n = html`<div class="stack">
      <p class="help">Set up a picture composition here. The 看图作文 button on her home screen lights up and the kitten says <b>我们一起写作文！</b>
        She looks at the pictures and helping words in the app, writes on paper, then taps <b>Submit to Mum</b>. Read her paper and give stars, coins, XP and a comment here.</p>
      <button class="btn green" id="new" style="align-self:flex-start">＋ <span class="zh">新作文</span> New essay</button>
      <div class="stack" id="rows"></div>
    </div>`;
  const rows = $('#rows', n);
  if (!list.length) rows.innerHTML = '<p class="help">No essays yet.</p>';
  const chip = { assigned: ['待写', 'To write', 'warn'], submitted: ['已交 · 请批改', 'Submitted — please review', 'hot'], reviewed: ['已批改', 'Reviewed', 'ok'] };
  list.forEach((e) => {
    const [zh, en, cls] = chip[e.status];
    const r = html`<div class="essay-row card">
        <div class="essay-thumb"></div>
        <div class="stack" style="gap:6px;min-width:0">
          <div class="row" style="justify-content:space-between"><div class="nm zh" style="font-size:22px">${esc(e.title)}</div><span class="status-chip ${cls}">${zh} · ${en}</span></div>
          <div class="help" style="margin:0">Set ${new Date(e.createdAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })} · ${e.minChars}+ characters · ${e.words.length} helping words${e.timeLimit ? ` · ⏱ ${e.timeLimit} min${e.allowExtend === false ? '' : ' (extend allowed)'}` : ''}${e.startedAt && e.timeLimit ? ` · started ${new Date(e.startedAt).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' })}` : ''}${e.extensions ? ` · extended ${e.extensions}× (+${e.extensions * S.EXTEND_MIN} min)` : ''}${e.submittedAt && e.startedAt ? ` · took ${Math.max(1, Math.round((e.submittedAt - e.startedAt) / 60000))} min` : ''}${e.submittedAt ? ` · submitted ${new Date(e.submittedAt).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}</div>
          <div class="chips">${e.words.map((w) => `<span class="chip">${esc(w.w)}</span>`).join('')}</div>
          <div class="review"></div>
          <div class="row"><button class="btn white small" data-a="edit">✏️ Edit / change picture</button><button class="btn white small" data-a="del">🗑 Delete</button></div>
        </div>
      </div>`;
    $('.essay-thumb', r).appendChild(pictureNode(e));
    r.querySelector('[data-a=edit]').onclick = () => newEssay(rerender, e);
    const rv = $('.review', r);
    if (e.status === 'submitted') {
      let stars = 3;
      rv.innerHTML = `<div class="review-box stack">
          <b>Review her composition</b>
          <div class="star-pick">${[1, 2, 3].map((i) => `<button type="button" data-s="${i}" class="on">★</button>`).join('')}</div>
          <label class="field" style="width:150px">Coins to award<input type="number" min="0" max="999" inputmode="numeric" value="${S.rewardFor('essay').coins}" class="coins"></label>
          <div class="row" style="gap:6px"><span class="help" style="margin:0">Quick:</span>${[10, 20, 30, 50].map((v) => `<button class="btn small white" data-q="${v}">${v}</button>`).join('')}</div>
          <label class="field" style="width:150px">XP to award<input type="number" min="0" max="999" inputmode="numeric" value="${S.xpPerEssay()}" class="xp"></label>
          <label class="field">Comment for her (optional)<textarea class="comment" rows="2" style="min-height:70px;font-size:18px" placeholder="例如：写得很好！下次用多一点好词。"></textarea></label>
          <button class="btn green" data-a="reward">🎁 Send stars, coins &amp; XP</button>
        </div>`;
      rv.addEventListener('click', (ev) => {
        const st = ev.target.closest('[data-s]'); if (st) { stars = +st.dataset.s; rv.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', +b.dataset.s <= stars)); }
        const q = ev.target.closest('[data-q]'); if (q) rv.querySelector('.coins').value = q.dataset.q;
      });
      rv.querySelector('[data-a=reward]').onclick = () => {
        S.reviewEssay(e.id, { stars, coins: rv.querySelector('.coins').value, xp: rv.querySelector('.xp').value, comment: rv.querySelector('.comment').value });
        toast('Sent ✓ She will see it on her home screen'); rerender();
      };
    } else if (e.status === 'reviewed' && e.review) {
      rv.innerHTML = `<div class="review-box"><span style="color:#e0a524;font-size:22px">${'★'.repeat(e.review.stars)}${'☆'.repeat(3 - e.review.stars)}</span> · +${e.review.coins} coins${e.review.xp ? ` · +${e.review.xp} XP` : ''}${e.review.comment ? `<div class="zh" style="margin-top:4px">“${esc(e.review.comment)}”</div>` : ''}<div class="row" style="margin-top:6px;align-items:center"><button class="btn white small" data-a="resend">🔔 Resend notification</button><span class="help" style="margin:0">${e.seen ? 'She has opened it.' : 'She hasn’t opened it yet.'}</span></div></div>`;
      rv.querySelector('[data-a=resend]').onclick = () => { if (S.resendEssayNotification(e.id)) { toast('🔔 Sent to her phone again ✓'); rerender(); } };
    }
    r.querySelector('[data-a=del]').onclick = async () => {
      if (!(await confirmBox('Delete this essay?', `“${esc(e.title)}” will be removed.`, 'Delete'))) return;
      if (e.image) Cloud.deleteEssayImage(e.image);
      S.deleteEssay(e.id); rerender();
    };
    rows.appendChild(r);
  });
  $('#new', n).onclick = () => newEssay(rerender);
  return n;
}

function newEssay(rerender, edit = null) {
  // edit: an existing essay to change (title, words, timer, and the picture: keep / replace / remove / switch)
  let source = edit ? (edit.image ? 'upload' : edit.storyId ? 'builtin' : 'none') : 'builtin';
  let storyId = (edit && edit.storyId) || STORIES[0].id, file = null, removePhoto = false;
  const box = html`<div class="card stack">
      <h3>${edit ? 'Edit picture composition' : 'New picture composition'}</h3>
      <div class="seg"><button type="button" data-src="builtin">用内置图 Built-in pictures</button><button type="button" data-src="upload">上传照片 Upload a photo</button></div>
      <div id="src-builtin" class="story-picks"></div>
      <div id="src-upload" class="hidden stack">
        <div id="cur-photo" class="cur-photo hidden"></div>
        <div class="row">
          <label class="btn white" style="align-self:flex-start"><span id="pick-lbl">📷 Choose or take a photo</span><input type="file" id="file" accept="image/*" hidden></label>
          <button type="button" class="btn white hidden" id="rm-photo">🗑 Remove photo</button>
        </div>
        <div class="help" style="margin:0">Photograph the pictures from her worksheet or assessment book. They are kept privately in your account.</div>
        <img id="preview" class="hidden" style="max-width:100%;border:3px solid var(--ink);border-radius:6px" alt="">
      </div>
      <label class="field">Title<input id="title" placeholder="例如：下雨天"></label>
      <label class="field"><span>参考词语 Helping words — <b>one word or phrase per line</b></span>
        <textarea id="words" style="min-height:120px" placeholder="着急&#10;雨伞 | umbrella&#10;一边……一边……&#10;Locked In"></textarea>
        <small>Each line is one helping word, even with spaces in it. Optional: add “| English meaning” after it. Pinyin and sound are added automatically.</small>
      </label>
      <div class="chips" id="wprev"></div>
      <div class="row" style="align-items:flex-end;gap:14px">
        <label class="field" style="width:200px">At least how many characters?<input type="number" id="min" value="80" min="20" max="600" inputmode="numeric"></label>
        <label class="field" style="width:200px">Time limit (minutes)<input type="number" id="tlim" value="40" min="0" max="240" inputmode="numeric"><small class="help" style="margin:0">0 = no timer</small></label>
      </div>
      <div class="toggle"><span>Allow “Extend Timer”<br><small class="help">When time is up she can write ${S.EXTEND_WORDS} words from her mistakes to get ${S.EXTEND_MIN} more minutes.</small></span><button type="button" class="switch on" id="ext"></button></div>
      <div class="row" style="justify-content:flex-end"><button class="btn white" id="c">Cancel</button><button class="btn green" id="ok">${edit ? 'Save changes' : 'Set this essay'}</button></div>
    </div>`;
  const picks = $('#src-builtin', box);
  const fillFromStory = (st) => { $('#title', box).value = st.title; $('#words', box).value = st.words.join('\n'); };
  STORIES.forEach((st) => {
    const b = html`<button type="button" class="story-pick ${st.id === storyId ? 'on' : ''}" data-id="${st.id}">${storySVG(st)}<span class="zh">${st.title}</span><small>${st.en}</small></button>`;
    b.onclick = () => { storyId = st.id; picks.querySelectorAll('.story-pick').forEach((x) => x.classList.toggle('on', x.dataset.id === st.id)); if (!edit) fillFromStory(st); };
    picks.appendChild(b);
  });
  const showSource = () => {
    box.querySelectorAll('[data-src]').forEach((x) => x.classList.toggle('on', x.dataset.src === source));
    $('#src-builtin', box).classList.toggle('hidden', source !== 'builtin');
    $('#src-upload', box).classList.toggle('hidden', source === 'builtin');
    // the photo already saved with this essay
    const hasOld = edit && edit.image && !removePhoto && !file;
    const cur = $('#cur-photo', box);
    cur.classList.toggle('hidden', !hasOld);
    if (hasOld && !cur.firstChild) { cur.appendChild(html`<small class="help" style="margin:0">Current photo:</small>`); cur.appendChild(pictureNode({ ...edit, storyId: null }, { zoom: false })); }
    $('#rm-photo', box).classList.toggle('hidden', !(hasOld || file));
    $('#pick-lbl', box).textContent = hasOld || file ? '🔄 Replace photo' : '📷 Choose or take a photo';
  };
  if (edit) {
    $('#title', box).value = edit.title; $('#words', box).value = edit.words.map((w) => (w.meaning ? `${w.w} | ${w.meaning}` : w.w)).join('\n');
    $('#min', box).value = edit.minChars; $('#tlim', box).value = edit.timeLimit || 0;
    $('#ext', box).classList.toggle('on', edit.allowExtend !== false);
    if (source === 'none') source = 'upload';
  } else fillFromStory(STORIES[0]);
  showSource();
  box.querySelector('.seg').onclick = (ev) => {
    const b = ev.target.closest('[data-src]'); if (!b) return;
    source = b.dataset.src;
    if (!edit) { if (source === 'upload') { $('#title', box).value = ''; $('#words', box).value = ''; } else fillFromStory(STORIES.find((x) => x.id === storyId)); }
    showSource();
  };
  $('#file', box).onchange = (ev) => {
    file = ev.target.files[0]; if (!file) return;
    removePhoto = false;
    const img = $('#preview', box); img.src = URL.createObjectURL(file); img.classList.remove('hidden');
    showSource();
  };
  $('#rm-photo', box).onclick = () => {
    if (file) { file = null; $('#file', box).value = ''; $('#preview', box).classList.add('hidden'); }
    else removePhoto = true;
    showSource();
  };
  // live preview: one chip per line, so she sees exactly what the helping words will be
  const wprev = () => {
    const ws = S.parseLines($('#words', box).value);
    $('#wprev', box).innerHTML = ws.length ? `<small class="help" style="margin:0;width:100%">${ws.length} helping word${ws.length === 1 ? '' : 's'}:</small>` + ws.map((x) => `<span class="chip">${esc(x.w)}${x.hint ? ` <small>· ${esc(x.hint)}</small>` : ''}</span>`).join('') : '';
  };
  $('#words', box).addEventListener('input', wprev);
  wprev();
  box.addEventListener('click', (ev) => { if (ev.target.closest('.story-pick, [data-src]')) setTimeout(wprev, 0); });
  $('#ext', box).onclick = (ev) => ev.currentTarget.classList.toggle('on');
  $('#c', box).onclick = closeModal;
  $('#ok', box).onclick = async () => {
    const title = $('#title', box).value.trim();
    const timeLimit = Math.max(0, Math.min(240, Math.round(+$('#tlim', box).value || 0)));
    const allowExtend = $('#ext', box).classList.contains('on');
    const words = S.parseLines($('#words', box).value).map((x) => ({ w: x.w, meaning: x.hint }));
    const minChars = Math.max(20, Math.round(+$('#min', box).value || 80));
    if (!title) return toast('Give it a title');
    const btn = $('#ok', box);
    let image = edit ? edit.image || null : null;
    if (source === 'upload') {
      if (file) {
        btn.disabled = true; btn.textContent = 'Uploading…';
        try { image = await Cloud.uploadEssayImage(file); } catch (err) { btn.disabled = false; btn.textContent = edit ? 'Save changes' : 'Set this essay'; return toast(err.message || 'Upload failed'); }
      } else if (removePhoto) image = null;
      else if (!image && !edit) return toast('Choose a photo first');
    } else image = null;
    if (edit) {
      if (edit.image && edit.image !== image) Cloud.deleteEssayImage(edit.image);       // replaced or removed: tidy up the old photo
      S.updateEssay(edit.id, { title, storyId: source === 'builtin' ? storyId : null, image, words, minChars, timeLimit, allowExtend });
      closeModal(); toast('Saved ✓'); rerender();
    } else {
      S.addEssay({ title, storyId: source === 'builtin' ? storyId : null, image, words, minChars, timeLimit, allowExtend });
      closeModal(); toast('Essay set ✓ The kitten will tell her'); rerender();
    }
  };
  openModal(box);
  $('#modal .card').style.width = 'min(860px, 96vw)';
}
