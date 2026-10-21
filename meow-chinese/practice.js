// Practice activities: 词语选择 (word choice), 词语搭配 (word match) and 排句子 (sentence builder).
import * as S from './state.js';
import { $, html, esc, coinI, toast, confetti, hydrateIcons, KittenView, openModal, closeModal } from './ui.js';
import { speak, sfx } from './audio.js';
import { shadingSheet } from './shade.js';

export const KINDS = {
  choice: { zh: '词语选择', en: 'Word choice', icon: '🔤', how: '选出适当的词语填进句子里。 Pick the right word for the blank.' },
  match: { zh: '词语搭配', en: 'Word match', icon: '🧩', how: '从表中选出能和各题搭配的词语。 Pick the word from the box that goes with each phrase.' },
  order: { zh: '排句子', en: 'Sentence builder', icon: '🧱', how: '把词语排成一个正确的句子。 Drag the words into the right order to make a sentence.' },
};
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const BLANK = /_{2,}|＿{2,}|（\s*）|\(\s*\)/;
const pinyinOf = (w) => { try { return window.pinyinPro.pinyin(w); } catch { return ''; } };
// a word with its Hanyu Pinyin on top (when the parent switched it on for this activity)
const word = (kind, w) => (S.showPinyin(kind) ? `<span class="pyw"><span class="py">${esc(pinyinOf(w))}</span><span class="w">${esc(w)}</span></span>` : esc(w));

// ---------- parsers (also used by the parent editor to check what she typed) ----------
export function parseChoice(text) {
  const items = [], errors = [];
  String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line, n) => {
    const [q, opts] = line.split(/[|｜]/);
    const list = (opts || '').split(/[/／]/).map((o) => o.trim()).filter(Boolean);
    const ans = list.findIndex((o) => o.startsWith('*') || o.startsWith('＊'));
    const clean = list.map((o) => o.replace(/^[*＊]\s*/, ''));
    if (!q || !BLANK.test(q)) errors.push(`Line ${n + 1}: put ____ where the answer goes`);
    else if (clean.length < 2) errors.push(`Line ${n + 1}: add at least 2 choices after |, separated by /`);
    else if (ans < 0) errors.push(`Line ${n + 1}: mark the right choice with *`);
    else items.push({ q: q.trim(), opts: clean, ans });
  });
  return { items, errors };
}
export function parseMatch(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const errors = [];
  const bank = (lines.shift() || '').split(/[\s,，、/／]+/).map((w) => w.replace(/^\d+[.、]\s*/, '').trim()).filter(Boolean);
  const items = [];
  lines.forEach((line, n) => {
    const [p, a] = line.split(/[|｜]/).map((x) => (x || '').trim());
    if (!p || !BLANK.test(p)) errors.push(`Line ${n + 2}: put （ ） where the word goes`);
    else if (!a) errors.push(`Line ${n + 2}: add the answer after |`);
    else if (!bank.includes(a)) errors.push(`Line ${n + 2}: “${a}” isn't in the word box on line 1`);
    else items.push({ p, ans: a });
  });
  if (bank.length < 2) errors.unshift('Line 1: list the words in the box, separated by spaces');
  return { bank, items, errors };
}
// 排句子: "words separated by spaces = correct sentence || another correct sentence"
//         or the words already in order separated by /  (other orders after ||)
function arrange(chunks, sentence) {
  // find an order of the chunks that spells the sentence exactly (backtracking)
  const used = chunks.map(() => false), out = [];
  const go = (pos) => {
    if (pos === sentence.length) return out.length === chunks.length;
    for (let k = 0; k < chunks.length; k++) {
      if (used[k] || !sentence.startsWith(chunks[k], pos)) continue;
      used[k] = true; out.push(chunks[k]);
      if (go(pos + chunks[k].length)) return true;
      used[k] = false; out.pop();
    }
    return false;
  };
  return go(0) ? out.slice() : null;
}
const squash = (t) => t.replace(/\s+/g, '');
export function parseOrder(text) {
  const items = [], errors = [];
  String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line, n) => {
    if (/[=＝]/.test(line)) {
      const [left, right] = line.split(/[=＝]/);
      const chunks = left.split(/[\s/／,，、]+/).map((w) => w.trim()).filter(Boolean);
      const sentences = (right || '').split(/\s*\|\|\s*/).map(squash).filter(Boolean);
      if (chunks.length < 2) { errors.push(`Line ${n + 1}: list the helping words before =, separated by spaces`); return; }
      if (!sentences.length) { errors.push(`Line ${n + 1}: write the correct sentence after =`); return; }
      const orders = sentences.map((t) => arrange(chunks, t));
      const bad = orders.findIndex((o) => !o);
      if (bad >= 0) { errors.push(`Line ${n + 1}: the helping words don't make “${sentences[bad]}” exactly — check every word is used once`); return; }
      items.push({ chunks: orders[0], answers: sentences });
      return;
    }
    const variants = line.split(/\s*\|\|\s*/).map((v) => v.split(/[/／]/).map((w) => w.trim()).filter(Boolean));
    const chunks = variants[0];
    if (chunks.length < 2) { errors.push(`Line ${n + 1}: write the helping words, then = and the correct sentence`); return; }
    const key = (a) => a.slice().sort().join('|');
    if (variants.some((v) => key(v) !== key(chunks))) { errors.push(`Line ${n + 1}: the other order after || must use exactly the same words`); return; }
    items.push({ chunks, answers: [...new Set(variants.map((v) => v.join('')))] });
  });
  return { items, errors };
}
export const parseSet = (kind, text) => (kind === 'choice' ? parseChoice(text) : kind === 'match' ? parseMatch(text) : parseOrder(text));
export const setSize = (kind, text) => parseSet(kind, text).items.length;

// ---------- choosing a set ----------
export function practiceListScreen({ go, kind }) {
  const K = KINDS[kind];
  const sets = S.visibleSets(kind);
  const n = html`<section class="screen"><div class="practice stack">
      <div class="card stack">
        <div class="h-title"><span class="zh">${K.icon} ${K.zh}</span><span class="en">${K.en}</span></div>
        <p class="help" style="margin:0">${K.how}</p>
        <div class="set-grid"></div>
      </div></div></section>`;
  const grid = $('.set-grid', n);
  if (!sets.length) grid.innerHTML = '<p class="help">还没有练习。请妈妈在 🔒 家长专区加一些！ No sets yet — ask Mum to add some in the 🔒 Parent area.</p>';
  const dayLim = S.canDo(kind);
  if (!dayLim.ok) grid.insertAdjacentHTML('beforebegin', `<div class="limit-note">${S.limitText(dayLim, 'sets')}</div>`);
  sets.forEach((x) => {
    const done = x.lastDone === S.todayStr(), lim = S.canDo(kind, x);
    const b = html`<button class="set-tile ${done ? 'done' : ''} ${lim.ok ? '' : 'blocked'}"><b class="zh">${esc(x.name)}</b><small>${setSize(kind, x.text)} 题 questions</small>${x.best != null ? `<span class="best">${x.best >= 100 ? '⭐ ' : ''}${x.best}%</span>` : '<span class="new">新 New</span>'}${done ? '<i class="tick">✓</i>' : ''}</button>`;
    b.onclick = () => (lim.ok ? go('practice', { kind, id: x.id }) : toast(S.limitText(lim, 'sets'), { ms: 3500 }));
    grid.appendChild(b);
  });
  return n;
}

// ---------- playing a set ----------
export function practiceScreen({ go, kind, id }) {
  const K = KINDS[kind];
  const set = S.practiceSets(kind).find((x) => x.id === id);
  const n = html`<section class="screen"><div class="practice stack"><div class="card stack"><div class="pr-tabs" hidden><button type="button" data-t="q" class="on">📝 <span class="zh">题目</span> Questions</button><button type="button" data-t="s">✏️ <span class="zh">涂卡</span> Shading</button></div><div class="stack" id="main"></div><div class="stack" id="spane" hidden></div></div></div></section>`;
  const main = $('#main', n);
  if (!set) { main.innerHTML = '<p class="help">找不到这个练习。 This set is gone.</p>'; return n; }
  const parsed = parseSet(kind, set.text);
  // 🔀 mix up the choices every time she plays (parents usually type the right answer first)
  // the answer's place is dealt from a shuffled "bag" of places, so they spread out evenly and never repeat back-to-back
  if (kind === 'choice') {
    let bag = [], prev = -1;
    parsed.items = parsed.items.map((it) => {
      const n = it.opts.length;
      if (!bag.length || bag.some((x) => x >= n)) bag = shuffle([...Array(n).keys()]);
      let k = bag.findIndex((x) => x !== prev && x < n); if (k < 0) k = 0;
      const slot = bag.splice(k, 1)[0]; prev = slot;
      const others = shuffle(it.opts.filter((_, x) => x !== it.ans));
      const opts = others.slice(0, slot).concat([it.opts[it.ans]], others.slice(slot));
      return { ...it, opts, ans: slot };
    });
  }
  if (kind === 'match' && parsed.bank) parsed.bank = shuffle(parsed.bank);
  if (!parsed.items.length) { main.innerHTML = '<p class="help">这个练习是空的。 This set has no questions.</p>'; return n; }
  const lim = S.canDo(kind, set);
  if (!lim.ok) {
    main.innerHTML = `<div class="feedback" style="text-align:center"><div class="big-msg" style="font-size:28px">⏰</div><p style="font-weight:800">${S.limitText(lim, 'sets')}</p><button class="btn green" id="more">${K.icon} <span class="zh">别的练习</span> More sets</button></div>`;
    $('#more', main).onclick = () => go('practiceList', { kind }, { replace: true });
    return n;
  }
  const total = parsed.items.length;
  let i = 0, right = 0, tries = 0;
  const firstTry = [];   // which questions she got right first time (the shading bonus needs that too)
  const kv = new KittenView({ scale: 3 }); kv.canvas.classList.remove('bob');

  const head = () => `<div class="pr-head"><span class="zh">${K.icon} ${esc(set.name)}</span><div class="dots">${parsed.items.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'cur' : ''}"></i>`).join('')}</div></div>`;
  // right answer: move on only after the sentence has been read out in full (and at least 1 second)
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const good = (after, reading) => {
    sfx.correct(); if (tries === 0) right++; firstTry[i] = tries === 0; kv.flash('happy', 900);
    const here = i;
    Promise.all([Promise.resolve(reading).catch(() => {}), wait(1000)]).then(() => wait(reading ? 400 : 0)).then(() => { if (i === here && n.isConnected) after(); });
  };
  const bad = (el) => { sfx.oops(); tries++; if (el) { el.classList.add('shake', 'wrong'); setTimeout(() => el.classList.remove('shake'), 500); } };
  const next = () => { i++; tries = 0; if (i >= total) { if (mcq) tabs.hidden = false; finish(); } else render(); };

  // ✏️ 涂卡 Shading tab (Word choice / Word match): an answer sheet of oval bubbles, one row per question.
  // She shades once every question is done; when she checks (or hands in), every row that is shaded neatly on the right answer AND was
  // answered right first time earns the bonus (parents set how much). Paid once a day per set.
  const mcq = kind === 'choice' || kind === 'match';
  const answers = parsed.items.map((it) => (kind === 'choice' ? it.ans : kind === 'match' ? parsed.bank.indexOf(it.ans) : -1));
  const counts = parsed.items.map((it) => (kind === 'choice' ? it.opts.length : parsed.bank ? parsed.bank.length : 0));
  const per = () => S.rewardFor('shadeq').coins;
  const tabs = $('.pr-tabs', n), spane = $('#spane', n);
  let sheet = null, sheetDone = false, summaryReady = false, shadeRes = null;
  const showTab = (t) => {
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    main.hidden = t !== 'q'; spane.hidden = t !== 's';
    if (t === 's') spane.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  if (mcq) {
    tabs.hidden = true;   // ✏️ the shading sheet opens once every question is done
    tabs.querySelectorAll('button').forEach((b) => { b.onclick = () => { sfx.click(); showTab(b.dataset.t); }; });
    sheet = shadingSheet(counts, { onChange: () => { if (!sheetDone) say(''); } });
    spane.innerHTML = `<div class="sp-head"><b>✏️ <span class="zh">涂卡</span> Shading sheet</b>${per() && S.shadeBonusOpen(kind, set.id) ? `<span class="sp-bonus">BONUS +${per()}${coinI(14)} <small>/ <span class="zh">题</span></small></span>` : ''}</div>
      <p class="help" style="margin:0"><span class="zh">把每一题的答案涂在答题纸上。点一下椭圆形来涂。</span><br>Shade each question's answer on the sheet. Tap an oval to shade it.</p>`;
    spane.appendChild(sheet.el);
    spane.insertAdjacentHTML('beforeend', `<div class="sp-msg" aria-live="polite"></div><div class="row sp-actions" style="justify-content:center"><button type="button" class="btn green sp-check">✔ <span class="zh">检查涂卡</span> Check my shading</button><button type="button" class="btn white sp-hand" hidden>📤 <span class="zh">交卷</span> Hand in as it is</button></div>`);
    $('.sp-check', spane).onclick = checkSheet;
    $('.sp-hand', spane).onclick = () => handIn();
    hydrateIcons(spane);
  }
  function say(html2, good = true) { const m = $('.sp-msg', spane); m.innerHTML = html2; m.className = `sp-msg ${good ? 'good' : 'meh'}`; hydrateIcons(m); }
  const WHY = {
    none: (r) => [`第${r}题还没有涂。`, `Question ${r} isn't shaded yet.`],
    multi: (r) => [`第${r}题涂了不止一个，擦掉多的。`, `Question ${r} has more than one oval shaded — rub out the extra.`],
    wrong: (r) => [`第${r}题涂的不是答案，看看题目再涂。`, `Question ${r}: that oval isn't the answer — check the Questions tab.`],
    thin: (r) => [`第${r}题还没涂满。`, `Question ${r} needs more shading.`],
    messy: (r) => [`第${r}题涂到外面太多了，擦一擦。`, `Question ${r} has too much shading outside the oval — rub it out.`],
  };
  function checkSheet() {
    if (sheetDone) return;
    if (i < total) { sfx.miss(); showTab('q'); return; }
    const list = sheet.problems(answers);
    if (!list.length) return handIn();
    const p = list[0], [zh, en] = WHY[p.kind](p.r + 1);
    sfx.oops(); sheet.flash(p.r);
    say(`<span class="zh">${zh}</span> ${en}${list.length > 1 ? ` <small>(${list.length} <span class="zh">题要改</span> to fix)</small>` : ''}`, false);
    $('.sp-hand', spane).hidden = false;
  }
  // finish the sheet: pay for every row that is shaded right AND was answered right first time
  function handIn() {
    if (sheetDone || i < total) return;
    const bad = new Set(sheet.problems(answers).map((p) => p.r));
    const good = answers.filter((_, r) => !bad.has(r) && firstTry[r]).length;
    const res = shadeRes = S.payShadeBonus(kind, set.id, good);
    sheetDone = true; sheet.lock();
    $('.sp-actions', spane).style.display = 'none';
    const home = html`<div class="row" style="justify-content:center"><button type="button" class="btn blue">🏠 <span class="zh">回到主页</span> Home</button></div>`;
    $('button', home).onclick = () => { sfx.click(); go('home'); };
    spane.appendChild(home);
    setTimeout(() => { if (n.isConnected) toResults(); }, 2200);   // then the results page (on the Questions tab)
    const all = !bad.size;
    if (all) { sfx.fanfare(); confetti(); } else sfx.coin();
    say(`${all ? '🎉 <span class="zh">全部涂对了！</span> All shaded correctly!' : `✏️ <span class="zh">涂对 ${total - bad.size}/${total} 题</span> ${total - bad.size}/${total} shaded correctly.`}
      ${res.coins ? `<b>BONUS +${res.coins}${coinI(16)}</b>` : res.paid === false && per() ? '<small><span class="zh">今天这一组的涂卡奖励已经领过了。</span> Today\'s shading bonus for this set was already given.</small>' : ''}
      ${good < total - bad.size ? '<br><small><span class="zh">第一次就答对的题目才有 BONUS。</span> Only questions answered right first time earn the bonus.</small>' : ''}`, true);
  }
  // after the last question: offer the shading sheet
  function offerShading() {
    if (!mcq || sheetDone || summaryReady) return;
    const c = per(), open = S.shadeBonusOpen(kind, set.id);
    const box = html`<div class="card stack" style="align-items:center;text-align:center">
        <div style="font-size:44px">✏️</div>
        <div class="h-title" style="justify-content:center"><span class="zh">完成涂卡练习，多得金币？</span></div>
        <p style="margin:0;font-weight:700">Complete your shading exercise for extra coins?</p>
        ${c && open ? `<p class="help" style="margin:0"><span class="zh">每题涂对（答案也第一次就对）</span> Each question shaded right (and answered right first time): <b class="sp-bonus">BONUS +${c}${coinI(16)}</b></p>` : ''}
        <div class="row" style="justify-content:center"><button type="button" class="btn white" id="sh-skip">⏭ <span class="zh">跳过</span> Skip</button><button type="button" class="btn green" id="sh-now">✏️ <span class="zh">现在涂</span> Shade Now</button></div>
      </div>`;
    $('#sh-now', box).onclick = () => { closeModal(); showTab('s'); };
    $('#sh-skip', box).onclick = () => { closeModal(); toResults(); };
    openModal(box); hydrateIcons(box);
  }

  function render() {
    main.innerHTML = head();
    if (kind === 'choice') renderChoice(); else if (kind === 'match') renderMatch(); else renderOrder();
    if (mcq && i > 0) main.appendChild(navRow(() => review(i - 1), null));
    hydrateIcons(main);
  }
  // ◀ looking back at questions she has already finished: the right answer shows in green, nothing is read out,
  // and nothing changes her score. Handy while shading the answer sheet.
  function navRow(back, fwd, fwdLabel = '下一题</span> Next ▶') {
    const r = html`<div class="row pr-nav"></div>`;
    if (back) { const b = html`<button type="button" class="btn white small">◀ <span class="zh">上一题</span> Back</button>`; b.onclick = () => { sfx.click(); back(); }; r.appendChild(b); }
    if (fwd) { const b = html`<button type="button" class="btn white small"><span class="zh">${fwdLabel}</button>`; b.onclick = () => { sfx.click(); fwd(); }; r.appendChild(b); }
    return r;
  }
  function review(k) {
    const it = parsed.items[k];
    main.innerHTML = `<div class="pr-head"><span class="zh">${K.icon} ${esc(set.name)}</span><div class="dots">${parsed.items.map((_, x) => `<i class="${x === k ? 'cur' : x < i ? 'done' : ''}"></i>`).join('')}</div></div>
      <div class="pr-reviewing">👀 <span class="zh">回顾第${k + 1}题</span> Looking back at question ${k + 1}</div>`;
    if (kind === 'choice') {
      const [before, after] = it.q.split(BLANK);
      main.appendChild(html`<div class="pr-q zh">${esc(before)}<span class="pr-blank filled">${esc(it.opts[it.ans])}</span>${esc(after || '')}</div>`);
      main.appendChild(html`<div class="pr-opts">${it.opts.map((o, x) => `<button class="pr-opt zh ${x === it.ans ? 'right' : ''}" disabled><small>${x + 1}.</small> ${word('choice', o)}</button>`).join('')}</div>`);
    } else {
      main.appendChild(html`<div class="pr-wordbox">${parsed.bank.map((w, x) => `<button class="pr-word zh ${w === it.ans ? 'right' : ''}" disabled><small>${x + 1}.</small> ${word('match', w)}</button>`).join('')}</div>`);
      const [before, after] = it.p.split(BLANK);
      main.appendChild(html`<div class="pr-q zh">${esc(before)}<span class="pr-blank paren filled">（${esc(it.ans)}）</span>${esc(after || '')}</div>`);
    }
    // forward: the next finished question, then back to where she was (the current question, or the results)
    // (after the last question the results only show once the shading is handed in or skipped)
    const fwd = k + 1 < i ? () => review(k + 1) : i < total ? () => render() : summaryReady ? () => showSummary() : sheetDone ? null : () => offerShading();
    main.appendChild(navRow(k > 0 ? () => review(k - 1) : null, fwd, k + 1 < i ? '下一题</span> Next ▶' : i < total ? '继续做题</span> Continue ▶' : summaryReady ? '回到成绩</span> Results ▶' : '完成</span> Finish ▶'));
    hydrateIcons(main);
  }

  function renderChoice() {
    const it = parsed.items[i];
    const [before, after] = it.q.split(BLANK);
    const q = html`<div class="pr-q zh">${esc(before)}<span class="pr-blank" id="blank"></span>${esc(after || '')}</div>`;
    const opts = html`<div class="pr-opts">${it.opts.map((o, k) => `<button class="pr-opt zh" data-k="${k}"><small>${k + 1}.</small> ${word('choice', o)}</button>`).join('')}</div>`;
    opts.onclick = (e) => {
      const b = e.target.closest('[data-k]'); if (!b || b.disabled) return;
      if (+b.dataset.k === it.ans) {
        $('#blank', q).textContent = it.opts[it.ans]; $('#blank', q).classList.add('filled');
        b.classList.add('right'); opts.querySelectorAll('button').forEach((x) => { x.disabled = true; });
        good(next, speak(it.q.replace(BLANK, it.opts[it.ans])));
      } else { bad(b); b.disabled = true; }
    };
    main.appendChild(q); main.appendChild(opts);
  }

  // word match: the word box stays on top; one phrase at a time
  const usedWords = new Set();
  function renderMatch() {
    const it = parsed.items[i];
    const box = html`<div class="pr-wordbox">${parsed.bank.map((w, k) => `<button class="pr-word zh ${usedWords.has(w) ? 'used' : ''}" data-w="${esc(w)}"><small>${k + 1}.</small> ${word('match', w)}</button>`).join('')}</div>`;
    const [before, after] = it.p.split(BLANK);
    const q = html`<div class="pr-q zh">${esc(before)}<span class="pr-blank paren" id="blank">（　　）</span>${esc(after || '')}</div>`;
    box.onclick = (e) => {
      const b = e.target.closest('[data-w]'); if (!b || b.disabled || b.classList.contains('used')) return;
      if (b.dataset.w === it.ans) {
        $('#blank', q).textContent = `（${it.ans}）`; $('#blank', q).classList.add('filled');
        b.classList.add('right'); usedWords.add(it.ans);
        box.querySelectorAll('button').forEach((x) => { x.disabled = true; });
        good(next, speak((before || '') + it.ans + (after || '')));
      } else { bad(b); b.disabled = true; }
    };
    main.appendChild(html`<p class="help" style="margin:0">从表中选出能和这一题搭配的词语。 Pick the word that goes with it.</p>`);
    main.appendChild(box); main.appendChild(q);
  }

  // sentence builder: drag (or tap) the words into the sentence line; they can be moved around or put back
  function renderOrder() {
    const it = parsed.items[i];
    let order = shuffle(it.chunks.map((w, k) => ({ w, k })));
    if (order.map((x) => x.w).join('') === it.chunks.join('') && order.length > 1) order = order.slice(1).concat(order[0]);
    const ui = html`<div class="ord">
        <p class="help" style="margin:0">把词语拖到上面，排成一个正确的句子。也可以点一下词语。<br>Drag the words up to make a sentence (or tap them). You can move them around or drag them back.</p>
        <div class="ord-line" id="line"><span class="ord-ph">把词语放在这里 · Put the words here</span></div>
        <div class="ord-cap">参考词语 Helping words</div>
        <div class="ord-bank" id="bank">${order.map((x) => `<span class="ord-chip zh" data-k="${x.k}" data-w="${esc(x.w)}">${word('order', x.w)}</span>`).join('')}</div>
        <div class="row" style="justify-content:center"><button class="btn white" id="reset">↺ <span class="zh">重来</span> Reset</button><button class="btn green" id="check">✔ <span class="zh">检查</span> Check</button></div>
        <div class="ord-msg" id="msg"></div>
      </div>`;
    const line = $('#line', ui), bank = $('#bank', ui), msg = $('#msg', ui);
    const ph = () => { $('.ord-ph', ui).style.display = line.querySelector('.ord-chip') ? 'none' : ''; };
    const chips = () => [...ui.querySelectorAll('.ord-chip')];
    const current = () => [...line.querySelectorAll('.ord-chip')].map((c) => c.dataset.w).join('');
    chips().forEach((c) => attachDrag(c, ui, [line, bank], () => { ph(); msg.textContent = ''; line.classList.remove('wrong'); }));
    $('#reset', ui).onclick = () => { chips().forEach((c) => bank.appendChild(c)); ph(); msg.textContent = ''; };
    $('#check', ui).onclick = () => {
      if (bank.querySelector('.ord-chip')) { msg.innerHTML = '还有词语没用上哦！ Use all the words.'; sfx.miss(); return; }
      if (it.answers.includes(current())) {
        line.classList.add('right'); msg.innerHTML = `✅ 对了！ <span class="zh">${esc(current())}</span>${S.showPinyin('order') ? `<br><small class="py">${esc(pinyinOf(current()))}</small>` : ''}`;
        chips().forEach((c) => { c.classList.add('locked'); });
        $('#check', ui).disabled = true; $('#reset', ui).disabled = true;
        good(next, speak(current()));
      } else {
        bad(line); msg.innerHTML = tries >= 2 ? `再试试！ Try again. <button class="btn small white" id="show">👀 看答案 Show answer</button>` : '再试试！ Not quite — try again.';
        const sh = $('#show', ui); if (sh) sh.onclick = () => {
          // put the words in the right order (no point for this one)
          it.chunks.forEach((w, k) => { const c = chips().find((x) => +x.dataset.k === k); line.appendChild(c); });
          ph(); line.classList.add('right'); msg.innerHTML = `<span class="zh">${esc(it.answers[0])}</span>${S.showPinyin('order') ? `<br><small class="py">${esc(pinyinOf(it.answers[0]))}</small>` : ''}`;
          tries = 9; sh.disabled = true; $('#check', ui).disabled = true;
          Promise.all([speak(it.answers[0]).catch(() => {}), wait(2000)]).then(() => wait(400)).then(() => { if (n.isConnected) next(); });
        };
      }
    };
    main.appendChild(ui);
  }

  let res = null;
  function finish() {
    res = S.finishPracticeSet(kind, set.id, right, total);
    S.checkDaily().forEach((g, k) => setTimeout(() => toast(g.label, { coins: g.coins }), 1200 + k * 700));
    if (!mcq) { summaryReady = true; showSummary(true); return; }
    // Word choice / Word match: stay on the last question (answer in green) and offer the shading sheet first
    review(total - 1);
    setTimeout(() => { if (n.isConnected) offerShading(); }, 900);
  }
  // the results page: after the shading is handed in, or skipped
  function toResults() { summaryReady = true; showTab('q'); showSummary(true); }
  function showSummary(first = false) {
    const great = right === total;
    main.innerHTML = `<div class="summary stack" style="align-items:center;text-align:center">
        <div class="kv"></div>
        <div class="big-msg" style="font-family:var(--zh);font-size:34px">${great ? '全对了！🎉' : right / total >= 0.6 ? '做得好！' : '继续加油！'}</div>
        <div class="kpis"><div class="kpi"><b style="color:var(--green-d)">${right}/${total}</b><span>一次做对 Right first time</span></div></div>
        ${!res.paid ? '<p class="help" style="margin:0">今天这一组的奖励已经领过了。 Today\'s reward for this set was already given.</p>' : res.coins || res.xp ? `<div class="price" style="font-size:24px">${res.coins ? `+${res.coins} ${coinI(22)}` : ''}${res.coins && res.xp ? ' · ' : ''}${res.xp ? `+${res.xp} XP` : ''}</div>` : ''}
        ${shadeRes && shadeRes.coins ? `<div class="price" style="font-size:20px">✏️ <span class="zh">涂卡</span> BONUS +${shadeRes.coins} ${coinI(20)}</div>` : ''}
        ${mcq ? `<div class="pr-review"><b>📋 <span class="zh">答案</span> Answers</b>${parsed.items.map((it, k) => `<div><b>${k + 1}.</b> <span class="zh">${esc(kind === 'choice' ? it.q.replace(BLANK, `【${it.opts[it.ans]}】`) : it.p.replace(BLANK, `【${it.ans}】`))}</span> → <b>${answers[k] + 1}</b></div>`).join('')}</div>` : ''}
        <div class="row" style="justify-content:center">${mcq && !sheetDone ? '<button class="btn yellow" id="goshade">✏️ <span class="zh">涂卡</span> Shading</button>' : ''}${S.canDo(kind, set).ok ? '<button class="btn white" id="again">↺ <span class="zh">再做一次</span> Again</button>' : ''}<button class="btn green" id="more">${K.icon} <span class="zh">别的练习</span> More sets</button><button class="btn blue" id="home">🏠 <span class="zh">回到主页</span> Home</button></div>
      </div>`;
    $('.kv', main).replaceWith(kv.canvas); kv.setMood('happy');
    if (great && first) { sfx.fanfare(); confetti(); }
    const ag = $('#again', main); if (ag) ag.onclick = () => go('practice', { kind, id }, { replace: true });
    $('#more', main).onclick = () => go('practiceList', { kind }, { replace: true });
    $('#home', main).onclick = () => go('home');
    const gs = $('#goshade', main); if (gs) gs.onclick = () => { sfx.click(); showTab('s'); gs.remove(); };
    if (mcq) main.appendChild(navRow(() => review(total - 1), null));
    hydrateIcons(main);
  }
  render();
  return n;
}

// drag a chip between/within containers; a tap moves it to the other container
function attachDrag(chip, root, zones, changed) {
  chip.addEventListener('pointerdown', (e) => {
    if (chip.classList.contains('locked')) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    let ghost = null;
    const move = (ev) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        const r = chip.getBoundingClientRect();
        ghost = chip.cloneNode(true); ghost.classList.add('ghost');
        ghost.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;pointer-events:none;z-index:999`;
        ghost._dx = sx - r.left; ghost._dy = sy - r.top;
        document.body.appendChild(ghost);
        chip.classList.add('placeholder');
      }
      ghost.style.left = `${ev.clientX - ghost._dx}px`; ghost.style.top = `${ev.clientY - ghost._dy}px`;
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const zone = under && zones.find((z) => z.contains(under) || z === under);
      if (!zone) return;
      // insert before the first chip that is after the pointer (reading order)
      const others = [...zone.querySelectorAll('.ord-chip')].filter((c) => c !== chip);
      const before = others.find((c) => { const r = c.getBoundingClientRect(); return ev.clientY < r.top || (ev.clientY <= r.bottom && ev.clientX < r.left + r.width / 2); });
      if (before) zone.insertBefore(chip, before); else zone.appendChild(chip);
      changed();
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (ghost) { ghost.remove(); chip.classList.remove('placeholder'); sfx.click(); }
      else {
        // tap: send it to the other place
        const [line, bank] = zones;
        (line.contains(chip) ? bank : line).appendChild(chip); sfx.click();
      }
      changed();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  });
}
