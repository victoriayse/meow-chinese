// 听写 spelling practice: listen, handwrite, check, learn, retry.
import * as S from './state.js';
import { $, $$, html, esc, coinI, hydrateIcons, KittenView, toast, confetti, confirmBox, burst } from './ui.js';
import { speak, stopSpeaking, sfx, canSpeak } from './audio.js';
import { InkPad, judge, loadChar } from './handwriting.js';

const isHan = (ch) => /\p{Script=Han}/u.test(ch);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pinyinOf = (w) => { try { return window.pinyinPro.pinyin(w); } catch { return ''; } };

const WRITER_STYLE = {
  strokeColor: '#2b2140',
  radicalColor: '#2b2140',
  outlineColor: '#e4d9c6',
  drawingColor: '#2f62d6',
  highlightColor: '#ffb020',
  drawingWidth: 9,
  strokeAnimationSpeed: 1.1,
  delayBetweenStrokes: 220,
  charDataLoader: (ch, onLoad, onError) => {
    fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(ch)}.json`)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(onLoad).catch(onError);
  },
};

export function spellingScreen({ mode = 'list', go }) {
  const st = S.get();
  const list = S.activeList();
  let source = mode === 'review' ? S.reviewWords() : (list ? list.words.map((x) => ({ ...x })) : []);
  if (st.settings.shuffle !== false) source = shuffle(source.slice());
  const items = source.map((x, i) => ({ ...x, i, attempt: 0 }));
  const status = items.map(() => null);           // per original item: 'first' | 'retry' | 'wrong'
  const queue = items.slice();
  let roundCoins = 0, cur = null, done = false;

  const root = html`<section class="screen"><div class="spell">
      <div class="spell-top">
        <button class="btn white small" id="back">← <span class="zh">回家</span></button>
        <div class="dots" id="dots"></div>
        <div class="round-coins">${coinI(20)}<span id="rc">0</span></div>
      </div>
      <div class="card stack" id="main"></div>
    </div></section>`;
  const main = $('#main', root);

  if (!items.length) {
    main.innerHTML = `<div class="feedback"><div class="big-msg">${mode === 'review' ? '错词本是空的！' : '还没有词语'}</div>
      <div class="sub">${mode === 'review' ? 'No mistakes to practise — great job!' : 'Ask a parent to add this week\'s 听写 words (🔒 button).'}</div>
      <button class="btn" id="home">回家 Home</button></div>`;
    $('#home', main).onclick = () => go('home');
    $('#back', root).onclick = () => go('home');
    return root;
  }

  const leave = (cb) => {
    if (done) return cb();
    confirmBox('要离开吗？ Leave this round?', '已经写完的词会保存。 Words you finished are saved.', '离开 Leave', '继续写 Stay').then((ok) => { if (ok) { stopSpeaking(); cb(); } });
  };
  root._leave = leave;
  $('#back', root).onclick = () => leave(() => go('home'));

  const kv = new KittenView({ scale: 3 });
  kv.canvas.classList.remove('bob');

  function drawDots() {
    $('#dots', root).innerHTML = items.map((it, i) => `<i class="${status[i] || ''} ${cur && cur.i === i && !status[i] ? 'cur' : ''}" title="${i + 1}"></i>`).join('');
  }
  function addCoins(n) {
    if (!n) return;
    roundCoins += n; S.addCoins(n);
    $('#rc', root).textContent = roundCoins;
  }
  function boxSize(n) {
    const avail = Math.min(main.clientWidth || 900, 940) - 40;
    const perRow = Math.min(n, 4);
    const maxS = Math.min(280, Math.floor((window.innerHeight - 360) * 0.9));
    return Math.max(120, Math.min(maxS, Math.floor((avail - 14 * (perRow - 1)) / perRow)));
  }

  async function sayWord(item, { slow = false, sentence = false } = {}) {
    if (!canSpeak()) { toast('这个设备不能朗读 · No speech on this device'); return; }
    root.querySelector('.teacher')?.classList.add('speaking');
    if (sentence && item.hint) { await speak(item.hint, { slow }); await new Promise((r) => setTimeout(r, 350)); }
    await speak(item.w, { slow });
    root.querySelector('.teacher')?.classList.remove('speaking');
  }

  // ---------- one word ----------
  function next() {
    stopSpeaking();
    cur = queue.shift();
    if (!cur) return finish();
    drawDots();
    showWord(cur);
  }

  function showWord(item) {
    const chars = [...item.w];
    const retry = item.attempt > 0;
    main.innerHTML = '';
    const teacher = html`<div class="teacher">
        <div class="kv"></div>
        <div class="say">
          <div class="line1">${retry ? '再写一次，你可以的！' : '听一听，写下来'}</div>
          <div class="line2">${retry ? 'Try this one again from memory' : 'Listen, then write the word'} · ${chars.length} 个字</div>
          <div class="listen-row">
            <button class="btn blue small" data-say="normal">🔊 <span class="zh">再听</span> Again</button>
            <button class="btn white small" data-say="slow">🐢 <span class="zh">慢慢</span> Slow</button>
            ${item.hint ? '<button class="btn white small" data-say="sentence">💬 <span class="zh">句子</span> Sentence</button>' : ''}
          </div>
        </div>
      </div>`;
    $('.kv', teacher).replaceWith(kv.canvas);
    kv.setMood('normal');
    teacher.addEventListener('click', (e) => {
      const b = e.target.closest('[data-say]'); if (!b) return;
      sayWord(item, { slow: b.dataset.say === 'slow', sentence: b.dataset.say === 'sentence' });
    });
    main.appendChild(teacher);

    const s = boxSize(chars.length);
    const boxes = html`<div class="boxes" style="margin-top:22px"></div>`;
    const charState = chars.map((ch) => ({ ch, han: isHan(ch), wrong: false }));
    let lastPad = null;
    chars.forEach((ch, i) => {
      const c = charState[i];
      const b = html`<div class="box ${c.han ? '' : 'fixed'}" style="--s:${s}px"></div>`;
      if (!c.han) b.textContent = ch;
      else {
        c.pad = new InkPad(b, s - 8, { width: Math.max(5, Math.round(s / 24)), onStroke: (p) => { lastPad = p; sfx.stroke(); } });
        c.data = loadChar(ch).catch(() => null);   // fetch the real character while she writes
      }
      boxes.appendChild(b);
      c.box = b;
    });
    main.appendChild(boxes);
    const actions = html`<div class="spell-actions">
        <button class="btn white" id="undo">↶ <span class="zh">撤销</span> Undo</button>
        <button class="btn white" id="clr">🧽 <span class="zh">擦掉</span> Clear</button>
        <button class="btn big green" id="chk">✓ <span class="zh">写好了</span> Check</button>
        <button class="btn white" id="idk">🤔 <span class="zh">不会写</span> I don't know</button>
      </div>`;
    main.appendChild(actions);
    hydrateIcons(main);

    const pads = charState.filter((c) => c.han);
    $('#undo', actions).onclick = () => { if (lastPad) lastPad.undo(); };
    $('#clr', actions).onclick = () => {
      const target = lastPad || pads.find((c) => !c.pad.empty)?.pad;
      if (target) target.clear();
    };

    let finished = false;
    async function check() {
      if (finished) return;
      const blank = pads.find((c) => c.pad.empty);
      if (blank) { toast('<span class="zh">每个格子都要写哦</span> Write in every box'); blank.box.classList.add('active'); setTimeout(() => blank.box.classList.remove('active'), 900); return; }
      $('#chk', actions).disabled = true;
      for (const c of pads) {
        const data = await c.data;
        c.wrong = data ? !judge(c.pad.strokes, data).ok : false; // no data (offline) → can't check, so accept
      }
      $('#chk', actions).disabled = false;
      const wrongIdx = charState.map((c, i) => (c.wrong ? i : -1)).filter((i) => i >= 0);
      if (!wrongIdx.length) return endWord(false);
      // show which boxes are wrong, and give one chance to fix them
      charState.forEach((c) => { if (c.han) { c.box.classList.toggle('bad', c.wrong); c.box.classList.toggle('ok', !c.wrong); } });
      if (item.fixUsed) return endWord(false);
      sfx.oops();
      const fix = html`<div class="feedback">
          <div class="big-msg bad">有${wrongIdx.length > 1 ? '几' : '一'}个字不太对哦 <span class="en">Not quite right</span></div>
          <div class="sub">红色格子里的字再看看 · Check the red box${wrongIdx.length > 1 ? 'es' : ''}</div>
          <div class="row" style="justify-content:center">
            <button class="btn big" id="fix">✏️ <span class="zh">改一改</span> Fix it</button>
            <button class="btn white" id="show">📖 <span class="zh">教我</span> Show me</button>
          </div>
        </div>`;
      actions.replaceWith(fix);
      $('#fix', fix).onclick = () => {
        item.fixUsed = true;
        charState.forEach((c) => { if (c.wrong) { c.pad.clear(); c.box.classList.remove('bad'); } });
        fix.replaceWith(actions);
      };
      $('#show', fix).onclick = () => endWord(false);
    }
    function endWord(gaveUp) {
      if (finished) return; finished = true;
      if (gaveUp) charState.forEach((c) => { if (c.han) c.wrong = true; });
      pads.forEach((c) => { c.pad.enabled = false; c.pad.tint(c.wrong ? '#ef5d73' : '#2f8f45'); });
      const wrongIdx = charState.map((c, i) => (c.wrong ? i : -1)).filter((i) => i >= 0);
      if (!wrongIdx.length) onCorrect(item, charState);
      else onWrong(item, charState, wrongIdx, s);
    }
    $('#chk', actions).onclick = check;
    $('#idk', actions).onclick = () => endWord(true);
    setTimeout(() => sayWord(item), 450);
  }

  function onCorrect(item, charState) {
    const result = item.attempt === 0 && !item.fixUsed ? 'first' : 'retry';
    status[item.i] = result;
    S.recordWord(item.w, result);
    const coins = result === 'first' ? S.REWARDS.firstTry : S.REWARDS.retry;
    addCoins(coins);
    drawDots();
    sfx.correct();
    kv.setMood('happy');
    charState.forEach((c) => { if (c.han) { c.box.classList.add('ok'); } });
    const praise = ['太棒了！', '写对了！', '真厉害！', '好极了！', '你真棒！'][Math.floor(Math.random() * 5)];
    const actions = $('.spell-actions, .feedback', main);
    actions.replaceWith(html`<div class="feedback">
        <div class="big-msg good">${praise} <span class="en">${result === 'first' ? 'Correct!' : item.fixUsed ? 'You fixed it!' : 'You remembered it!'}</span></div>
        <div class="answer"><div class="py">${esc(pinyinOf(item.w))}</div></div>
        <div class="row" style="justify-content:center"><span class="price" style="font-size:22px">+${coins} ${coinI(22)}</span></div>
        <button class="btn big green" id="nx">${queue.length ? '下一个 Next ➜' : '完成 Finish ★'}</button>
      </div>`);
    hydrateIcons(main);
    burst($('.boxes', main), 'coin', 3, '50%', '40%');
    $('#nx', main).onclick = next;
  }

  function onWrong(item, charState, wrongIdx, s) {
    S.recordWord(item.w, 'wrong');
    const willRetry = item.attempt === 0;
    if (!willRetry) { status[item.i] = 'wrong'; drawDots(); }
    sfx.oops();
    kv.setMood('normal');
    stopSpeaking();

    // Rebuild the area as a lesson
    const chars = charState.map((c) => c.ch);
    const py = pinyinOf(item.w).split(' ');
    main.querySelector('.boxes').remove();
    $('.spell-actions, .feedback', main)?.remove();
    $('.line1', main).textContent = '没关系，我们一起学！';
    $('.line2', main).textContent = "That's OK — let's learn it together";

    const hintHtml = item.hint ? esc(item.hint).split(esc(item.w)).join(`<b>${esc(item.w)}</b>`) : '';
    const lesson = html`<div class="stack" style="align-items:center">
        <div class="steps"><span class="on" id="st1">① 看 Watch</span><span id="st2">② 描 Trace</span><span id="st3">③ 记 Remember</span></div>
        <div class="boxes" id="tboxes" style="margin-top:34px"></div>
        <div class="answer">${hintHtml ? `<div class="hint">${hintHtml}</div>` : ''}</div>
        <div class="spell-actions" id="tact"></div>
      </div>`;
    main.appendChild(lesson);
    const tboxes = $('#tboxes', lesson), tact = $('#tact', lesson);
    const tw = [];
    const tsize = Math.min(s, 200);
    chars.forEach((ch, i) => {
      const c = charState[i];
      const bad = wrongIdx.includes(i);
      const b = html`<div class="box ${c.han ? (bad ? 'bad' : 'ok') : 'fixed'}" style="--s:${tsize}px">
          <div class="pinyin">${esc(py[i] || '')}</div>
          ${c.han ? `<span class="box-tag" style="top:auto;bottom:-14px">${bad ? '要练习 Practise' : '写对了 ✓'}</span>` : ''}
        </div>`;
      if (!c.han) b.append(ch);
      tboxes.appendChild(b);
      if (c.han) tw[i] = HanziWriter.create(b, ch, { ...WRITER_STYLE, width: tsize - 8, height: tsize - 8, padding: Math.round(tsize * 0.07), showCharacter: false, showOutline: true });
    });

    async function watch() {
      $('#st1', lesson).className = 'on'; $('#st2', lesson).className = ''; $('#st3', lesson).className = '';
      tact.innerHTML = '';
      speak(item.w);
      for (let i = 0; i < chars.length; i++) {
        if (!tw[i]) continue;
        tw[i].hideCharacter();
        await new Promise((r) => tw[i].animateCharacter({ onComplete: r }));
      }
      $('#st1', lesson).className = 'done';
      tact.innerHTML = `<button class="btn white" id="again">▶ <span class="zh">再看一次</span> Watch again</button>
        <button class="btn big" id="trace">✍️ <span class="zh">我来描</span> Trace it</button>`;
      $('#again', tact).onclick = watch;
      $('#trace', tact).onclick = trace;
    }
    async function trace() {
      $('#st2', lesson).className = 'on';
      tact.innerHTML = '<div class="sub" style="font-weight:800;color:var(--ink-2)">沿着灰色的字描一遍 · Trace over the grey character</div>';
      for (const i of wrongIdx) {
        if (!tw[i]) continue;
        tw[i].hideCharacter();
        const box = tboxes.children[i];
        box.classList.add('active');
        const pad = new InkPad(box, tsize - 8, { width: Math.max(5, Math.round(tsize / 24)), onStroke: () => sfx.stroke() });
        pad.canvas.style.position = 'absolute'; pad.canvas.style.left = '0'; pad.canvas.style.top = '0';
        const data = await loadChar(chars[i]).catch(() => null);
        await new Promise((done) => {
          const bar = html`<div class="row" style="justify-content:center">
              <button class="btn white" data-a="clr">🧽 <span class="zh">擦掉</span> Clear</button>
              <button class="btn green" data-a="ok">✓ <span class="zh">描好了</span> Done</button></div>`;
          tact.appendChild(bar);
          bar.onclick = (e) => {
            const a = e.target.closest('[data-a]'); if (!a) return;
            if (a.dataset.a === 'clr') return pad.clear();
            if (pad.empty) return;
            if (data && !judge(pad.strokes, data, { maxStroke: 0.17, tol: 0.12, cov: 0.6, prec: 0.65 }).ok) {
              toast('<span class="zh">再描一次</span> Try tracing it again'); sfx.miss(); pad.clear(); return;
            }
            pad.enabled = false; pad.tint('#2f8f45'); bar.remove(); done();
          };
        });
        box.classList.remove('active');
      }
      $('#st2', lesson).className = 'done'; $('#st3', lesson).className = 'on';
      sfx.correct(); kv.setMood('happy');
      tact.innerHTML = `<div class="feedback">
          <div class="big-msg good">描得好！<span class="en">Nice tracing!</span></div>
          <div class="sub">${willRetry ? '记住它，等一下我再考你一次 · Remember it — I\'ll ask you again soon!' : '它会留在错词本里，明天再练 · It stays in your Mistakes book to practise again.'}</div>
          <button class="btn big green" id="nx">${queue.length || willRetry ? '下一个 Next ➜' : '完成 Finish ★'}</button>
        </div>`;
      $('#nx', tact).onclick = () => {
        if (willRetry) {
          const back = { ...item, attempt: 1 };
          // put it a couple of words later so it's from memory, not copying
          queue.splice(Math.min(2, queue.length), 0, back);
        }
        next();
      };
    }
    watch();
  }

  // ---------- end of round ----------
  function finish() {
    done = true; stopSpeaking();
    const total = items.length;
    const first = status.filter((x) => x === 'first').length;
    const retry = status.filter((x) => x === 'retry').length;
    const wrong = status.filter((x) => x === 'wrong').length;
    const d = S.get().daily;
    d.spell = true; S.save();
    S.logSession({ mode, listName: mode === 'review' ? '错词本 Mistakes' : (list ? list.name : ''), total, firstTry: first, retry, wrong, coins: roundCoins });
    const rewards = S.checkDaily();
    const great = first / total >= 0.8;
    kv.setMood('happy');
    main.innerHTML = '';
    const n = html`<div class="summary stack" style="align-items:center">
        <div class="kv"></div>
        <div class="big-msg" style="font-family:var(--zh);font-size:38px">${great ? '太厉害了！🎉' : first / total >= 0.5 ? '做得好！' : '继续加油！'}</div>
        <div class="sub" style="font-weight:800;color:var(--ink-2)">${great ? 'Amazing work!' : first / total >= 0.5 ? 'Good job!' : 'Keep going — practice makes perfect!'}</div>
        <div class="kpis" style="width:100%">
          <div class="kpi"><b style="color:var(--green-d)">${first}/${total}</b><span>一次写对 First try</span></div>
          <div class="kpi"><b style="color:var(--blue-d)">${retry}</b><span>学会了 Learned</span></div>
          <div class="kpi"><b style="color:var(--red-d)">${wrong}</b><span>再练习 To practise</span></div>
          <div class="kpi"><b>${roundCoins + rewards.reduce((a, r) => a + r.coins, 0)}</b><span>金币 Coins earned</span></div>
        </div>
        <div class="result-list" style="width:100%">${items.map((it, i) => `<div>${esc(it.w)}<span class="tag ${status[i]}">${status[i] === 'first' ? '✓' : status[i] === 'retry' ? '学会' : '再练'}</span></div>`).join('')}</div>
        <div class="row" style="justify-content:center">
          ${wrong ? '<button class="btn pink" id="rv"><span class="zh">练习错词</span> Mistakes</button>' : ''}
          <button class="btn white" id="ag"><span class="zh">再来一次</span> Again</button>
          <button class="btn big" id="hm"><span class="zh">回家喂${esc(S.get().kitten.name)}</span> Home</button>
        </div>
      </div>`;
    $('.kv', n).replaceWith(kv.canvas);
    kv.canvas.classList.add('bob');
    main.appendChild(n);
    hydrateIcons(main);
    sfx.fanfare();
    if (great) confetti();
    rewards.forEach((r, i) => setTimeout(() => toast(r.label, { coins: r.coins }), 800 + i * 800));
    $('#hm', n).onclick = () => go('home');
    $('#ag', n).onclick = () => go('spell', { mode });
    const rv = $('#rv', n); if (rv) rv.onclick = () => go('spell', { mode: 'review' });
    $('#back', root).onclick = () => go('home');
    drawDots();
  }

  root._mounted = () => next();
  return root;
}
