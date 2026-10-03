// Parent area: PIN gate, spelling lists, progress and settings.
import * as S from './state.js';
import { FURS, ITEMS, spriteCanvas } from './pixel.js';
import { $, $$, html, esc, coinI, hydrateIcons, KittenView, toast, confirmBox, openModal, closeModal } from './ui.js';
import { speak, chineseVoices, sfx } from './audio.js';

let unlockedUntil = 0;

export function parentScreen({ go, tab = 'lists' }) {
  if (Date.now() > unlockedUntil) return pinGate(go, tab);
  const n = html`<section class="screen"><div class="parent stack">
      <div class="row">
        <div class="h-title grow"><span class="zh">家长专区</span><span class="en">Parent area</span></div>
        <button class="btn white small" id="home">← 回家 Home</button>
      </div>
      <div class="tabs" id="tabs">
        <button class="tab" data-tab="lists"><span class="zh">听写词语</span> Lists</button>
        <button class="tab" data-tab="progress"><span class="zh">学习进度</span> Progress</button>
        <button class="tab" data-tab="shop"><span class="zh">商店价格</span> Prices</button>
        <button class="tab" data-tab="settings"><span class="zh">设置</span> Settings</button>
      </div>
      <div class="card" id="body" style="border-top-left-radius:0"></div>
    </div></section>`;
  const body = $('#body', n);
  const show = (t) => {
    tab = t;
    $$('.tab', n).forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    body.innerHTML = '';
    body.appendChild(t === 'lists' ? listsView(rerender) : t === 'progress' ? progressView(rerender) : t === 'shop' ? pricesView(rerender) : settingsView(rerender, go));
    hydrateIcons(body);
  };
  const rerender = () => show(tab);
  $('#tabs', n).onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); };
  $('#home', n).onclick = () => { unlockedUntil = 0; go('home'); };
  n._mounted = () => show(tab);
  return n;
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
  const n = html`<div class="stack">
      <p class="help">The <b>selected</b> list is what your child practises when she taps 开始听写. Add each week's 听写 list here.</p>
      <div class="stack" id="rows"></div>
      <button class="btn green" id="add" style="align-self:flex-start">＋ <span class="zh">新的听写</span> New list</button>
    </div>`;
  const rows = $('#rows', n);
  s.lists.forEach((l) => {
    const on = l.id === s.activeListId;
    const r = html`<div class="list-row ${on ? 'on' : ''}">
        <button class="radio ${on ? 'on' : ''}" aria-label="Use this list"></button>
        <div style="min-width:0"><div class="nm">${esc(l.name)} <span class="en">· ${l.words.length} words</span></div>
          <div class="words">${esc(l.words.map((w) => w.w).join('、'))}</div></div>
        <div class="row" style="gap:6px"><button class="btn white small" data-a="edit">Edit</button><button class="btn white small" data-a="del">🗑</button></div>
      </div>`;
    $('.radio', r).onclick = () => { s.activeListId = l.id; S.save(); rerender(); toast(`<span class="zh">${esc(l.name)}</span> selected`); };
    r.querySelector('[data-a=edit]').onclick = () => editList(l, rerender);
    r.querySelector('[data-a=del]').onclick = async () => {
      if (s.lists.length === 1) return toast('Keep at least one list');
      if (!(await confirmBox('Delete list?', `“${esc(l.name)}” will be removed. Progress on its words is kept.`, 'Delete'))) return;
      s.lists = s.lists.filter((x) => x.id !== l.id);
      if (s.activeListId === l.id) s.activeListId = s.lists[0].id;
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
      <label class="field">List name<input id="nm" value="${esc(list ? list.name : `听写 ${new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`)}"></label>
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
    if (isNew) {
      const l = { id: S.uid(), name, words, createdAt: Date.now() };
      s.lists.unshift(l); s.activeListId = l.id;
    } else { list.name = name; list.words = words; }
    S.save(); closeModal(); rerender();
    toast(isNew ? 'List added and selected ✓' : 'Saved ✓');
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
      <h3>Levels</h3>
      <div class="toggle"><span>Unlock all levels (for you to preview everything)<br><small class="help">Hair, shoes, extras, clothes and Home normally unlock at Lv5 / 10 / 15 / 20 / 25.</small></span><button class="switch ${set.unlockAll ? 'on' : ''}" id="ul"></button></div>
      <h3>Backup</h3>
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
  $('#ul', n).onclick = () => { set.unlockAll = !set.unlockAll; S.save(); rerender(); };
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
      <p class="help">Set how many coins each item costs. Changes apply straight away. For reference, a perfect day earns about ${S.REWARDS.taskSpell + S.REWARDS.taskPerfect + S.REWARDS.taskCare + S.REWARDS.allBonus} coins from tasks, plus ${S.REWARDS.firstTry} per word written right first time.</p>
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
