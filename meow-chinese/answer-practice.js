// ✏️ 答题练习 Answer Practice — sit at a practice desk in the classroom and work through a short paper.
// The question paper and the answer sheet are separate: she finds the question number, then shades that row's bubble.
// Each bubble keeps its own pencil marks; "filled" is measured by how much of the circle is covered, not by time.
// Everything (unfinished sheets, rounds done, unlocks) is kept in her own save. Nothing is shown to other players.
import * as S from './state.js';
import { html, $, toast, coinI, hydrateIcons, KittenView, confetti } from './ui.js';
import { sfx, speak, canSpeak } from './audio.js';

// ---------- the shading surface ----------
// A bubble is a G×G grid over [-1.5, 1.5]²; the circle is radius 1. Cells inside the circle count towards "filled",
// cells in the ring just outside count as "outside the circle".
const G = 36, BRUSH = 0.28, FULL = 0.82, MARKED = 0.12, TOO_MUCH_OUT = 0.3;
const cellXY = (i) => [((i % G) + 0.5) / G * 3 - 1.5, (Math.floor(i / G) + 0.5) / G * 3 - 1.5];
const INSIDE = [], RING = [];
for (let i = 0; i < G * G; i++) { const [x, y] = cellXY(i), d = Math.hypot(x, y); if (d <= 0.97) INSIDE.push(i); else if (d > 1.2 && d <= 1.5) RING.push(i); }
// (going a little over the line is fine; only shading well outside the circle counts as "outside")
const newGrid = () => new Uint8Array(G * G);
const pack = (g) => { let s = ''; for (let i = 0; i < g.length; i += 8) { let b = 0; for (let k = 0; k < 8; k++) if (g[i + k]) b |= 1 << k; s += String.fromCharCode(b); } return btoa(s); };
const unpack = (str) => { const g = newGrid(); if (!str) return g; const s = atob(str); for (let i = 0; i < s.length; i++) { const b = s.charCodeAt(i); for (let k = 0; k < 8; k++) if (b & (1 << k)) g[i * 8 + k] = 1; } return g; };
export function coverage(g) { let n = 0; INSIDE.forEach((i) => { n += g[i]; }); return n / INSIDE.length; }
export function outside(g) { let n = 0; RING.forEach((i) => { n += g[i]; }); return n / INSIDE.length; }
// paint (or rub out) a round brush along a line between two points (unit coordinates)
function brushLine(g, x0, y0, x1, y1, value) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (BRUSH / 3)));
  const r = Math.ceil(BRUSH / 3 * G) + 1;
  for (let s = 0; s <= steps; s++) {
    const x = x0 + (x1 - x0) * s / steps, y = y0 + (y1 - y0) * s / steps;
    const cx = Math.floor((x + 1.5) / 3 * G), cy = Math.floor((y + 1.5) / 3 * G);
    for (let gy = cy - r; gy <= cy + r; gy++) for (let gx = cx - r; gx <= cx + r; gx++) {
      if (gx < 0 || gy < 0 || gx >= G || gy >= G) continue;
      const i = gy * G + gx, [px, py] = cellXY(i);
      if (Math.hypot(px - x, py - y) <= BRUSH) g[i] = value;
    }
  }
}
// draw a bubble (its outline, its label and the pencil marks) onto a canvas
function drawBubble(c, g, label, { size = 40, ring = false } = {}) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  c.width = size * dpr; c.height = size * dpr; c.style.width = size + 'px'; c.style.height = size + 'px';
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, size, size);
  const R = size / 3, cx = size / 2, cy = size / 2;
  x.fillStyle = '#fff'; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();
  if (label) { x.fillStyle = '#c9a6ff'; x.font = `700 ${Math.round(R * 1.05)}px system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, cx, cy + 1); }
  const cs = size / G;
  x.fillStyle = 'rgba(58, 58, 74, .88)';
  for (let i = 0; i < g.length; i++) if (g[i]) { const gx = i % G, gy = Math.floor(i / G); x.fillRect(gx * cs, gy * cs, cs + 0.4, cs + 0.4); }
  x.strokeStyle = ring ? '#e8384f' : '#9b7bea'; x.lineWidth = ring ? 3 : Math.max(1.5, size / 30);
  x.beginPath(); x.arc(cx, cy, R, 0, 7); x.stroke();
}

// ---------- the lessons ----------
const HOW = {
  shade: ['把三个圆圈都涂满。点一个圆圈，把它放大来涂。', 'Fill all three circles. Tap a circle to make it big, then colour it in.'],
  find: ['题目纸上已经写好答案了。找到答题纸上同一个题号，把那个答案涂好。', 'Each question already shows its answer. Find the same number on the answer sheet and shade that bubble.'],
  checker: ['① 把答案涂到答题纸上。② 当检查员：每一行都和题目纸对一对，对了就勾「查过」。③ 按检查。', '① Shade each answer on the answer sheet. ② Be the checker: compare every row with the paper and tick "Checked". ③ Tap Check.'],
  quiz: ['先在题目纸上圈出答案，再到答题纸上涂同一个答案。', 'Circle your answer on the paper first, then shade the same answer on the answer sheet.'],
};
const FOLDERS = {
  shade: { zh: '涂一涂', en: 'Shade carefully', icon: '🖍️', about: 'Three big bubbles to fill in neatly. No matching.', sizes: [3] },
  find: { zh: '找一找', en: 'Find and transfer', icon: '🔎', about: 'Copy the answers from the paper onto the answer sheet.', sizes: [3, 5, 8, 10] },
  checker: { zh: '检查员', en: 'Answer checker', icon: '🕵️', about: 'Fill a sheet, then inspect every row before you hand it in.', sizes: [3, 5, 8] },
  quiz: { zh: '中文小测验', en: 'Chinese mini-quiz', icon: '📝', about: 'Answer easy Chinese questions, then shade your choices.', sizes: [3, 5, 8] },
};
// longer sheets open up after some rounds; the short ones stay available
const UNLOCK = { 8: 3, 10: 6 };
const THEMES = [
  { key: 'animals', icon: '🐾', zh: '动物', en: 'Animals', bg: '#fff3e0' },
  { key: 'snacks', icon: '🍪', zh: '零食', en: 'Snacks', bg: '#fdeef4' },
  { key: 'school', icon: '✏️', zh: '文具', en: 'School supplies', bg: '#eef6ff' },
];
const OPT = ['①', '②', '③', '④'];
// easy Chinese questions (picture, vocabulary, sentence; then measure words, opposites and short reading)
const BANK = {
  pic: [['🐱', '这是什么？', ['狗', '猫', '鸟', '鱼'], 1], ['🐶', '这是什么？', ['狗', '猫', '牛', '羊'], 0], ['🐟', '这是什么？', ['鸟', '马', '鱼', '猪'], 2],
    ['🍎', '这是什么？', ['香蕉', '西瓜', '葡萄', '苹果'], 3], ['☀️', '这是什么？', ['月亮', '太阳', '星星', '云'], 1], ['🚗', '这是什么？', ['飞机', '火车', '汽车', '轮船'], 2],
    ['📚', '这是什么？', ['书', '笔', '尺', '包'], 0], ['🐦', '这是什么？', ['鸟', '鸡', '鸭', '鹅'], 0], ['🌸', '这是什么？', ['草', '树', '花', '叶'], 2]],
  vocab: [['哪一个是水果？', ['椅子', '铅笔', '苹果', '鞋子'], 2], ['哪一个是动物？', ['桌子', '小狗', '书包', '杯子'], 1], ['哪一个可以喝？', ['牛奶', '面包', '米饭', '饼干'], 0],
    ['哪一个是颜色？', ['红色', '大象', '学校', '老师'], 0], ['哪一个是文具？', ['苹果', '小猫', '铅笔', '衣服'], 2], ['下雨了，出门要带什么？', ['枕头', '雨伞', '饭碗', '被子'], 1],
    ['我们用什么写字？', ['筷子', '牙刷', '杯子', '铅笔'], 3], ['哪一个是交通工具？', ['帽子', '汽车', '苹果', '桌子'], 1]],
  sentence: [['我口渴了，想喝（　）。', ['书', '球', '水', '花'], 2], ['我饿了，想吃（　）。', ['饭', '鞋', '笔', '门'], 0], ['天黑了，我要（　）觉。', ['吃', '睡', '跑', '看'], 1],
    ['我用眼睛（　）书。', ['听', '吃', '看', '走'], 2], ['我每天去（　）上学。', ['医院', '学校', '商店', '公园'], 1], ['妈妈在厨房（　）饭。', ['写', '唱', '做', '看'], 2]],
  measure: [['一（　）猫', ['本', '杯', '辆', '只'], 3], ['一（　）书', ['本', '只', '条', '杯'], 0], ['一（　）水', ['只', '杯', '本', '辆'], 1], ['一（　）汽车', ['只', '本', '辆', '张'], 2], ['一（　）纸', ['张', '只', '杯', '辆'], 0]],
  opposite: [['"大"的反义词是什么？', ['小', '多', '长', '高'], 0], ['"高"的反义词是什么？', ['大', '矮', '快', '多'], 1], ['"多"的反义词是什么？', ['大', '长', '少', '快'], 2], ['"快"的反义词是什么？', ['慢', '小', '高', '少'], 0], ['"开"的反义词是什么？', ['走', '来', '关', '大'], 2]],
  reading: [['小美把书放进书包。书在哪里？', ['桌上', '椅子下', '床上', '书包里'], 3], ['小明有三个苹果，吃了一个。还有几个？', ['一个', '两个', '三个', '四个'], 1],
    ['猫在睡觉，狗在跑步。谁在睡觉？', ['狗', '猫', '鸟', '鱼'], 1], ['今天下雨，小红带了雨伞。今天天气怎么样？', ['晴天', '下雨', '下雪', '刮风'], 1]],
};
const pick = (arr, n) => arr.slice().sort(() => Math.random() - 0.5).slice(0, n);
function quizQuestions(size, rounds) {
  // her first rounds: 2 pictures, 2 vocabulary, 1 sentence (scaled to the sheet's size); later rounds add the harder kinds
  const mix = rounds < 3 ? { 3: ['pic', 'vocab', 'sentence'], 5: ['pic', 'pic', 'vocab', 'vocab', 'sentence'] }[size] || ['pic', 'pic', 'vocab', 'vocab', 'sentence']
    : ['pic', 'vocab', 'sentence', 'measure', 'opposite', 'reading', 'vocab', 'measure'].slice(0, size);
  const used = {};
  return mix.slice(0, size).map((kind) => {
    const pool = BANK[kind].filter((q) => !(used[kind] || []).includes(q));
    const q = pool[Math.floor(Math.random() * pool.length)] || BANK[kind][0];
    (used[kind] ||= []).push(q);
    const [pic, prompt, opts, ans] = kind === 'pic' ? q : [null, ...q];
    // shuffle the options so the right one isn't always in the same place
    const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    return { kind, pic, prompt, options: order.map((i) => opts[i]), answer: order.indexOf(ans) };
  });
}
function newSheet(folder, size) {
  const prog = progress(), rounds = prog.done[folder] || 0;
  const theme = THEMES[Math.floor(Math.random() * THEMES.length)].key;
  let questions;
  if (folder === 'shade') questions = [0, 1, 2].map(() => ({ answer: 0 }));
  else if (folder === 'quiz') questions = quizQuestions(size, rounds);
  else { questions = []; for (let i = 0; i < size; i++) { let a; do { a = Math.floor(Math.random() * 4); } while (i && a === questions[i - 1].answer && Math.random() < 0.6); questions.push({ answer: a }); } }
  return { id: `${Date.now()}`, folder, size: questions.length, theme, beginner: folder === 'shade' || (folder !== 'checker' && size <= 5 && rounds < 3),
    questions, bubbles: {}, choice: {}, inspected: {}, done: false };
}
const progress = () => { const st = S.get(); st.answerPractice ||= { done: {}, paused: null, rewarded: [] }; st.answerPractice.done ||= {}; st.answerPractice.rewarded ||= []; return st.answerPractice; };
const rewardFor = (sh) => (sh.folder === 'shade' ? 6 : sh.folder === 'quiz' ? sh.size * 3 : sh.size * 2 + (sh.folder === 'checker' ? 3 : 0));
const bubbleCount = (sh) => (sh.folder === 'shade' ? 1 : 4);

// ---------- the window ----------
// onBusy(true/false): tells the classroom she is working (other visitors only see a pencil — never her answers)
export function openAnswerPractice({ onBusy = () => {} } = {}) {
  const ov = html`<div class="ap-overlay" role="dialog" aria-label="Answer practice"><div class="ap-wrap">
      <div class="ap-top"><div class="ap-teacher"></div><div class="ap-say"></div>
        <div class="ap-tools"><button type="button" class="btn white small ap-lessons" hidden>📚 <span class="zh">换练习</span> Lessons</button><button type="button" class="btn white small ap-hint">💡 <span class="zh">提示</span> Hint</button><button type="button" class="btn yellow small ap-pause">⏸ <span class="zh">暂停，稍后继续</span> Pause</button></div></div>
      <div class="ap-body"></div>
    </div></div>`;
  document.body.append(ov);
  const body = $('.ap-body', ov), sayEl = $('.ap-say', ov);
  const teacher = new KittenView({ scale: 2.4, fur: 'grey', equipped: { face: 'glasses', neck: 'scarf' } });
  teacher.setMood('happy'); $('.ap-teacher', ov).append(teacher.canvas);
  const say = (zh, en) => { sayEl.innerHTML = `<span class="zh">${zh}</span><small>${en}</small>`; teacher.jump && teacher.jump(); };
  let sheet = null, grids = {}, focusRow = null, tab = 'paper', scrolls = { paper: 0, sheet: 0 };
  onBusy(true);
  const close = () => { onBusy(false); ov.remove(); };

  // the sheet in progress is saved as she goes, so closing or pausing never loses work
  function save() {
    if (!sheet || sheet.done) return;
    sheet.bubbles = Object.fromEntries(Object.entries(grids).filter(([, g]) => g.some((v) => v)).map(([k, g]) => [k, pack(g)]));
    progress().paused = sheet; S.save();
  }
  $('.ap-pause', ov).onclick = () => {
    if (sheet && !sheet.done) { save(); toast('⏸ <span class="zh">保存好了，下次继续</span> Saved — carry on any time', { ms: 2200 }); }
    close();
  };
  // back to the lesson list: the sheet is kept as a paused sheet, so nothing is lost
  $('.ap-lessons', ov).onclick = () => { sfx.click(); if (sheet && !sheet.done) save(); chooser(); };
  $('.ap-hint', ov).onclick = () => {
    if (!sheet) return say('先选一个练习。', 'Pick a lesson to start.');
    if (sheet.folder === 'shade') return say('把整个圆圈涂满，小空隙没关系。', 'Fill the whole circle — tiny gaps are okay.');
    if (sheet.folder === 'checker' && sheet.questions.some((q, r) => !sheet.inspected[r]) && Object.keys(grids).length >= sheet.size) return say('每一行都和题目纸对一对，对了就勾「查过」。', 'Compare each row with the paper. If it matches, tick "Checked".');
    if (focusRow != null) return say(`你在涂第${focusRow + 1}题。回去看看题目纸上的第${focusRow + 1}题。`, `You're shading question ${focusRow + 1}. Look back at question ${focusRow + 1} on your paper.`);
    say('先看题号，再涂答案。', 'Check the question number before shading.');
  };

  // ---------- 1. choose a lesson ----------
  function chooser() {
    sheet = null; body.innerHTML = ''; $('.ap-lessons', ov).hidden = true;
    say('选一个练习吧！', 'Choose a lesson folder.');
    const prog = progress();
    const box = html`<div class="ap-choose"></div>`;
    if (prog.paused && !prog.paused.done) {
      const p = prog.paused, f = FOLDERS[p.folder];
      const c = html`<div class="ap-continue"><b>⏸ <span class="zh">继续上次的练习</span> Continue your paused sheet</b><span>${f.icon} ${f.zh} ${f.en} · ${p.size} 题</span>
        <div class="row" style="gap:8px;justify-content:flex-end"><button type="button" class="btn white small ap-fresh">新的一张 New sheet</button><button type="button" class="btn green small ap-resume">▶ <span class="zh">继续</span> Continue</button></div></div>`;
      $('.ap-resume', c).onclick = () => start(p);
      $('.ap-fresh', c).onclick = () => { prog.paused = null; S.save(); chooser(); };
      box.append(c);
    }
    Object.entries(FOLDERS).forEach(([key, f]) => {
      const done = prog.done[key] || 0;
      const card = html`<div class="ap-folder"><div class="ap-folder-title">${f.icon} <span class="zh">${f.zh}</span> ${f.en}</div><p>${f.about}</p><div class="ap-sizes"></div><small class="help">${done ? `完成了 ${done} 次 · Done ${done}×` : ''}</small></div>`;
      f.sizes.forEach((n) => {
        const need = UNLOCK[n] || 0, open = done >= need;
        const b = html`<button type="button" class="btn ${open ? 'white' : 'white locked'} small">${key === 'shade' ? '3 个圆圈 3 bubbles' : `${n} 题`}${open ? '' : ` 🔒`}</button>`;
        b.onclick = () => { if (!open) return toast(`🔒 先完成 ${need} 次 · Finish ${need} rounds of ${f.en} to open ${n} questions`); start(newSheet(key, n)); };
        $('.ap-sizes', card).append(b);
      });
      box.append(card);
    });
    body.append(box);
  }

  // ---------- 2. the paper and the answer sheet ----------
  function start(sh) {
    sheet = sh; grids = {};
    Object.entries(sh.bubbles || {}).forEach(([k, v]) => { grids[k] = unpack(v); });
    focusRow = null; tab = 'paper'; scrolls = { paper: 0, sheet: 0 };
    if (sh.folder === 'shade') say(...HOW.shade); else say('先看题号，再涂答案。', 'Check the question number before shading.');
    $('.ap-lessons', ov).hidden = false;
    if (sh.folder === 'shade') tab = 'sheet';
    layout(); save();
  }
  const th = () => THEMES.find((t) => t.key === sheet.theme) || THEMES[0];
  function layout() {
    body.innerHTML = '';
    const t = th();
    const view = html`<div class="ap-desk">
        <div class="ap-tabs"><button type="button" data-tab="paper">📄 <span class="zh">题目</span> Paper</button><button type="button" data-tab="sheet">📝 <span class="zh">答题纸</span> Answer Sheet</button></div>
        <div class="ap-papers">
          <div class="ap-paper" style="background:${t.bg}"><div class="ap-paper-head">${t.icon} <span class="zh">${FOLDERS[sheet.folder].zh}</span> · ${t.en}</div><p class="ap-how"></p><div class="ap-qs"></div></div>
          <div class="ap-sheet"><div class="ap-paper-head">📝 <span class="zh">答题纸</span> Answer sheet</div><div class="ap-rows"></div></div>
        </div>
        <div class="ap-foot"><button type="button" class="btn green ap-check">✅ <span class="zh">检查</span> Check my sheet</button></div>
      </div>`;
    $('.ap-how', view).innerHTML = `<span class="zh">${HOW[sheet.folder][0]}</span><br>${HOW[sheet.folder][1]}`;
    if (sheet.folder === 'shade') $('.ap-rows', view).before($('.ap-how', view));   // no question paper here
    if (sheet.folder === 'shade') { $('.ap-tabs', view).style.display = 'none'; $('.ap-paper', view).style.display = 'none'; view.classList.add('only-sheet'); }
    // the question paper
    const qs = $('.ap-qs', view);
    sheet.questions.forEach((q, r) => {
      const row = html`<div class="ap-q" data-q="${r}"><b class="ap-qn">${r + 1}.</b><div class="ap-qbody"></div></div>`;
      const qb = $('.ap-qbody', row);
      if (sheet.folder === 'quiz') {
        qb.innerHTML = `${q.pic ? `<span class="ap-pic">${q.pic}</span>` : ''}<span class="zh ap-prompt"></span> ${canSpeak() ? '<button type="button" class="ap-say-q" aria-label="Read aloud">🔊</button>' : ''}<div class="ap-opts"></div>`;
        $('.ap-prompt', qb).textContent = q.prompt;
        const sq = $('.ap-say-q', qb); if (sq) sq.onclick = () => speak(q.prompt.replace(/（　）/g, '什么'));
        q.options.forEach((o, i) => {
          const b = html`<button type="button" class="ap-opt ${sheet.choice[r] === i ? 'circled' : ''}">${OPT[i]} <span class="zh"></span></button>`;
          $('span', b).textContent = o;
          b.onclick = () => { sheet.choice[r] = i; focusRow = r; sfx.click(); qb.querySelectorAll('.ap-opt').forEach((x, k) => x.classList.toggle('circled', k === i)); save(); };
          $('.ap-opts', qb).append(b);
        });
      } else qb.innerHTML = `<span class="zh">答案</span> Answer <b class="ap-given">${OPT[q.answer]}</b>`;
      row.onclick = (e) => { if (!e.target.closest('button')) focusRow = r; };
      qs.append(row);
    });
    // the answer sheet: numbered rows of bubbles (it never fills anything in by itself)
    const rows = $('.ap-rows', view);
    sheet.questions.forEach((q, r) => {
      const row = html`<div class="ap-row" data-row="${r}"><b class="ap-rn">${r + 1}</b><div class="ap-bubbles"></div>${sheet.folder === 'checker' ? `<label class="ap-inspect"><input type="checkbox" ${sheet.inspected[r] ? 'checked' : ''}> <span class="zh">查过</span> Checked</label>` : ''}</div>`;
      for (let o = 0; o < bubbleCount(sheet); o++) {
        const key = `${r}-${o}`, b = document.createElement('button'); b.type = 'button'; b.className = 'ap-bubble'; b.dataset.key = key;
        b.setAttribute('aria-label', `Question ${r + 1} option ${o + 1}`);
        const c = document.createElement('canvas'); b.append(c);
        drawBubble(c, grids[key] || newGrid(), sheet.folder === 'shade' ? '' : String(o + 1), { size: sheet.folder === 'shade' ? 84 : 42 });
        b.onclick = () => { focusRow = r; shadeView(r, o); };
        $('.ap-bubbles', row).append(b);
      }
      const ins = $('.ap-inspect input', row); if (ins) ins.onchange = () => { sheet.inspected[r] = ins.checked; save(); };
      rows.append(row);
    });
    // phone: two big tabs (the scroll position of each paper is kept); tablet: side by side
    const paperEl = $('.ap-paper', view), sheetEl = $('.ap-sheet', view);
    const showTab = (name) => {
      scrolls[tab] = (tab === 'paper' ? paperEl : sheetEl).scrollTop;
      tab = name; view.dataset.tab = name;
      view.querySelectorAll('.ap-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
      requestAnimationFrame(() => { (name === 'paper' ? paperEl : sheetEl).scrollTop = scrolls[name] || 0; });
    };
    view.querySelectorAll('.ap-tabs button').forEach((b) => { b.onclick = () => { sfx.click(); showTab(b.dataset.tab); }; });
    view.dataset.tab = tab; view.querySelectorAll('.ap-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $('.ap-check', view).onclick = check;
    body.append(view);
    requestAnimationFrame(() => { paperEl.scrollTop = scrolls.paper; sheetEl.scrollTop = scrolls.sheet; });
    hydrateIcons(view);
  }
  const redrawBubble = (r, o) => {
    const b = body.querySelector(`.ap-bubble[data-key="${r}-${o}"] canvas`);
    if (b) drawBubble(b, grids[`${r}-${o}`] || newGrid(), sheet.folder === 'shade' ? '' : String(o + 1), { size: sheet.folder === 'shade' ? 84 : 42 });
  };

  // ---------- 3. the enlarged bubble: shade it with a few strokes ----------
  // It always opens the bubble she tapped — even if it's the wrong one.
  function shadeView(r, o) {
    const key = `${r}-${o}`, g = grids[key] || (grids[key] = newGrid());
    const big = html`<div class="ap-zoom"><div class="ap-zoom-card">
        <div class="ap-zoom-label">${sheet.folder === 'shade' ? `<span class="zh">第${r + 1}个圆圈</span> Bubble ${r + 1}` : `<span class="zh">第${r + 1}题 · 选项${OPT[o]}</span><br>Question ${r + 1} · Option ${o + 1}`}</div>
        <canvas class="ap-zoom-canvas"></canvas>
        <div class="ap-zoom-tools"><button type="button" class="btn small ap-pencil on">✏️ <span class="zh">铅笔</span> Pencil</button><button type="button" class="btn small ap-eraser">🧽 <span class="zh">橡皮</span> Eraser</button></div>
        <button type="button" class="btn green ap-back">↩ <span class="zh">回到答题纸</span> Back to sheet</button>
      </div></div>`;
    const cv = $('.ap-zoom-canvas', big), size = Math.min(300, Math.round(window.innerWidth * 0.72), Math.round(window.innerHeight * 0.45));
    const draw = () => drawBubble(cv, g, sheet.folder === 'shade' ? '' : String(o + 1), { size });
    draw();
    let erase = false, last = null, pid = null;
    const pencil = $('.ap-pencil', big), eraser = $('.ap-eraser', big);
    pencil.onclick = () => { erase = false; pencil.classList.add('on'); eraser.classList.remove('on'); };
    eraser.onclick = () => { erase = true; eraser.classList.add('on'); pencil.classList.remove('on'); };
    const toUnit = (e) => { const rc = cv.getBoundingClientRect(); return [((e.clientX - rc.left) / rc.width) * 3 - 1.5, ((e.clientY - rc.top) / rc.height) * 3 - 1.5]; };
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); pid = e.pointerId; try { cv.setPointerCapture(pid); } catch {} last = toUnit(e); brushLine(g, ...last, ...last, erase ? 0 : 1); draw(); });
    cv.addEventListener('pointermove', (e) => { if (e.pointerId !== pid) return; const p = toUnit(e); brushLine(g, ...last, ...p, erase ? 0 : 1); last = p; draw(); });
    ['pointerup', 'pointercancel'].forEach((ev) => cv.addEventListener(ev, (e) => { if (e.pointerId === pid) { pid = null; last = null; save(); } }));
    cv.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    $('.ap-back', big).onclick = () => {
      big.remove(); redrawBubble(r, o); save();
      const cov = coverage(g);
      // beginners get a gentle nudge; later lessons wait until checking
      if (sheet.beginner && cov > MARKED && cov < FULL) say('还有一点空白的地方哦。', "There's still an empty patch.");
      else if (sheet.beginner && outside(g) > TOO_MUCH_OUT) say('有一些涂到圆圈外面了。', 'Some shading went outside the circle.');
    };
    ov.append(big);
  }

  // ---------- 4. checking: one row at a time ----------
  function problems() {
    const out = [];
    sheet.questions.forEach((q, r) => {
      const marked = [];
      for (let o = 0; o < bubbleCount(sheet); o++) { const g = grids[`${r}-${o}`]; if (g && coverage(g) >= MARKED) marked.push(o); }
      const add = (zh, en, toPaper = false) => out.push({ r, zh, en, toPaper });
      if (sheet.folder === 'shade') {
        const g = grids[`${r}-0`] || newGrid();
        if (coverage(g) < FULL) return add(`第${r + 1}个圆圈还有空白的地方。`, `Bubble ${r + 1} still has an empty patch.`);
        if (outside(g) > TOO_MUCH_OUT) return add(`第${r + 1}个圆圈外面涂太多了，擦一擦。`, `Bubble ${r + 1} has shading outside the circle — rub it out.`);
        return;
      }
      if (!marked.length) return add(`第${r + 1}题还没有涂答案。`, `Question ${r + 1} doesn't have an answer yet.`);
      if (marked.length > 1) return add(`第${r + 1}题涂了不止一个答案，擦掉多的。`, `Question ${r + 1} has more than one bubble shaded — erase the extra one.`);
      const o = marked[0], g = grids[`${r}-${o}`], full = coverage(g) >= FULL, outOk = outside(g) <= TOO_MUCH_OUT;
      if (sheet.folder === 'quiz') {
        const chose = sheet.choice[r];
        if (chose == null) return add(`先在题目纸上圈出第${r + 1}题的答案。`, `First circle your answer for question ${r + 1} on the paper.`, true);
        if (o !== chose) return add(`第${r + 1}题：题目纸上圈的是${OPT[chose]}，答题纸上涂的是${OPT[o]}。再对一对。`, `Question ${r + 1}: you circled ${OPT[chose]} on the paper but shaded ${OPT[o]}. Check them again.`);
        if (o !== q.answer) return add('你找对题号，也涂对位置了！我们再看看这道题。', `You matched the number and shaded the right place! Let's look at question ${r + 1} again.`, true);
      } else if (o !== q.answer) {
        const other = sheet.questions.findIndex((x, k) => k !== r && x.answer === o && Math.abs(k - r) === 1);
        return add(full ? '涂得很完整！' + (other >= 0 ? `看看这个答案是第${r + 1}题的，还是第${other + 1}题的？` : `再看看题目纸上第${r + 1}题的答案。`) : `再看看题目纸上第${r + 1}题的答案。`,
          (full ? 'Your shading is complete. ' : '') + (other >= 0 ? `Check whether this belongs in question ${r + 1} or question ${other + 1}.` : `Look again at question ${r + 1}'s answer on your paper.`));
      }
      if (!full) return add('答案选对了！这个圆圈再涂满一点。', `You chose the correct answer for question ${r + 1}. This bubble just needs a little more shading.`);
      if (!outOk) return add('答案对了！圆圈外面涂多了一点，擦一擦。', `Question ${r + 1} is right! A bit of shading went outside the circle — rub it out.`);
    });
    return out;
  }
  function check() {
    if (sheet.folder === 'checker') {
      const notYet = sheet.questions.findIndex((q, r) => !sheet.inspected[r]);
      if (notYet >= 0) { say('检查员要先查每一行，再交卷。', `An answer checker inspects every row first — tick "Checked" on row ${notYet + 1}.`); flash(notYet, false); return; }
    }
    say('我们一起来检查答题纸吧。', "Let's check your sheet together.");
    const list = problems();
    setTimeout(() => {
      if (!list.length) return complete();
      const p = list[0];                     // one row at a time
      say(p.zh, p.en); sfx.oops();
      flash(p.r, p.toPaper);
    }, 700);
  }
  function flash(r, toPaper) {
    const view = body.querySelector('.ap-desk'); if (!view) return;
    const target = toPaper ? body.querySelector(`.ap-q[data-q="${r}"]`) : body.querySelector(`.ap-row[data-row="${r}"]`);
    if (view.dataset.tab !== (toPaper ? 'paper' : 'sheet') && getComputedStyle(body.querySelector('.ap-tabs')).display !== 'none') body.querySelector(`.ap-tabs button[data-tab="${toPaper ? 'paper' : 'sheet'}"]`).click();
    setTimeout(() => { if (!target) return; target.scrollIntoView({ block: 'center', behavior: 'smooth' }); target.classList.remove('ap-flash'); void target.offsetWidth; target.classList.add('ap-flash'); }, 120);
  }
  function complete() {
    const prog = progress(), first = !prog.rewarded.includes(sheet.id), coins = rewardFor(sheet);
    sheet.done = true; prog.paused = null;
    if (first) { prog.rewarded.push(sheet.id); prog.rewarded = prog.rewarded.slice(-50); prog.done[sheet.folder] = (prog.done[sheet.folder] || 0) + 1; S.addCoins(coins); }
    S.save(); sfx.fanfare(); confetti(); $('.ap-lessons', ov).hidden = true;
    say('全部都对了，涂得也很整齐！', 'Every row is right and neatly shaded — well done!');
    const f = FOLDERS[sheet.folder];
    body.innerHTML = '';
    const done = html`<div class="ap-done"><div class="ap-done-big">🎉</div><b><span class="zh">完成了！</span> Sheet complete!</b>
        <p>${f.icon} ${f.zh} ${f.en} · ${sheet.size} ${sheet.folder === 'shade' ? 'bubbles' : '题'}</p>
        ${first ? `<p class="ap-coins">+${coins}${coinI(22)}</p>` : ''}
        <div class="row" style="justify-content:center;gap:10px;flex-wrap:wrap"><button type="button" class="btn white ap-more">🔁 <span class="zh">再来一张</span> Another sheet</button><button type="button" class="btn green ap-seat">🪑 <span class="zh">回到座位</span> Back to my seat</button></div></div>`;
    $('.ap-more', done).onclick = chooser;
    $('.ap-seat', done).onclick = close;
    body.append(done); hydrateIcons(done);
  }

  chooser();   // a paused sheet shows at the top of the chooser
  return { close };
}

// what the teacher cat says when tapped in the classroom
export function teacherIntro() {
  const box = html`<div class="ap-overlay ap-intro-wrap"><div class="card stack ap-intro">
      <div class="ap-intro-top"><div class="ap-teacher"></div><div><b>🐱 <span class="zh">老师</span> Teacher</b><p class="zh">欢迎来上课！坐到答题练习桌，按 ✏️ 开始练习。</p></div></div>
      <p>Welcome to class! Sit at an <b>Answer Practice desk</b> and tap <b>✏️ 开始练习 Start</b>.</p>
      <ul class="ap-intro-list">
        <li>📄 <b>Paper</b> shows the questions and answers.</li>
        <li>📝 <b>Answer sheet</b> has numbered rows. Find the row, tap the bubble and shade it in.</li>
        <li><span class="zh">先看题号，再涂答案。</span> Check the question number before shading.</li>
        <li>⏸ You can pause any time and carry on later.</li>
      </ul>
      <button type="button" class="btn green ap-ok">好的！ Okay!</button></div></div>`;
  const kv = new KittenView({ scale: 2.4, fur: 'grey', equipped: { face: 'glasses', neck: 'scarf' } }); kv.setMood('happy');
  $('.ap-teacher', box).append(kv.canvas);
  $('.ap-ok', box).onclick = () => box.remove();
  box.addEventListener('click', (e) => { if (e.target === box) box.remove(); });
  document.body.append(box);
}
