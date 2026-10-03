// 看图作文: she looks at the pictures and helping words in the app, writes on paper,
// then taps "Submit to Mum". The parent reviews it in the parent area.
import * as S from './state.js';
import * as Cloud from './cloud.js';
import { storyById, storySVG } from './essayart.js';
import { $, html, esc, KittenView, toast, confirmBox, openModal, closeModal, confetti, coinI, hydrateIcons } from './ui.js';
import { speak, sfx } from './audio.js';
import { SnapBox, loadChar } from './handwriting.js';

const pinyinOf = (w) => { try { return window.pinyinPro.pinyin(w); } catch { return ''; } };
const isHan = (ch) => /\p{Script=Han}/u.test(ch);

// the essay's pictures: a built-in story or the parent's uploaded photo
export function pictureNode(e, { zoom = true } = {}) {
  const box = html`<div class="essay-pic"></div>`;
  const story = e.storyId && storyById(e.storyId);
  if (story) box.innerHTML = storySVG(story);
  else if (e.image) {
    box.innerHTML = '<div class="pic-loading">图片加载中… Loading picture…</div>';
    Cloud.essayImageURL(e.image).then((u) => { box.innerHTML = ''; const img = new Image(); img.src = u; img.alt = e.title; box.appendChild(img); })
      .catch(() => { box.innerHTML = '<div class="pic-loading">图片加载不了，请检查网络 · Could not load the picture — check the internet.</div>'; });
  } else box.innerHTML = '<div class="pic-loading">没有图片 · No picture</div>';
  if (zoom) box.onclick = () => {
    const big = html`<div class="card stack" style="width:min(1100px,96vw);max-height:94vh"><div class="zoom-pic"></div><button class="btn white" id="close">关闭 Close</button></div>`;
    $('.zoom-pic', big).appendChild(box.cloneNode(true));
    $('#close', big).onclick = closeModal;
    openModal(big);
    $('#modal .card').style.width = 'min(1100px, 96vw)';
  };
  return box;
}

// help with one word: pinyin, meaning, sound, stroke order, tracing
function wordHelper(word) {
  const chars = [...word.w].filter(isHan);
  const n = html`<div class="card stack" style="align-items:center;text-align:center">
      <div class="wh-py">${esc(pinyinOf(word.w))}</div>
      <div class="wh-word zh">${esc(word.w)}</div>
      ${word.meaning ? `<div class="wh-mean">${esc(word.meaning)}</div>` : ''}
      <div class="row" style="justify-content:center"><button class="btn blue" id="say">🔊 <span class="zh">听</span> Listen</button><button class="btn white" id="again">▶ <span class="zh">笔顺</span> Strokes</button><button class="btn white" id="trace">✍️ <span class="zh">描一描</span> Trace</button></div>
      <div class="boxes" id="wb" style="margin-top:6px"></div>
      <button class="btn white" id="close">关闭 Close</button>
    </div>`;
  const wb = $('#wb', n);
  const size = Math.min(150, Math.floor((Math.min(window.innerWidth, 640) - 80) / Math.max(1, chars.length)) - 10);
  const writers = chars.map((ch) => {
    const b = html`<div class="box" style="--s:${size}px"></div>`; wb.appendChild(b);
    return { ch, box: b, w: HanziWriter.create(b, ch, { width: size - 8, height: size - 8, padding: Math.round(size * 0.07), showOutline: true, strokeColor: '#2b2140', outlineColor: '#e4d9c6', strokeAnimationSpeed: 1.2, delayBetweenStrokes: 200 }) };
  });
  const animate = async () => { for (const x of writers) { x.w.hideCharacter(); await new Promise((r) => x.w.animateCharacter({ onComplete: r })); } };
  $('#say', n).onclick = () => speak(word.w);
  $('#again', n).onclick = animate;
  $('#trace', n).onclick = async () => {
    for (const x of writers) {
      x.w.hideCharacter();
      const data = await loadChar(x.ch).catch(() => null);
      if (!data) continue;
      x.box.classList.add('active');
      await new Promise((done) => new SnapBox(x.box, size - 8, data, { outline: false, hintAfter: 2, leniency: 1.4, onHit: () => sfx.stroke(), onMiss: () => sfx.miss(), onComplete: done }));
      x.box.classList.remove('active');
    }
    sfx.correct(); toast('<span class="zh">描得好！</span> Nice!');
  };
  $('#close', n).onclick = closeModal;
  openModal(n);
  speak(word.w);
  setTimeout(animate, 300);
}

const TIPS = [
  ['开头 Beginning · 图1', ['什么时候？ When?', '在哪里？ Where?', '有谁？ Who?', '他们在做什么？ What are they doing?'], ['一个阳光明媚的早上，……', '星期六下午，……']],
  ['经过 Middle · 图2–3', ['发生了什么事？ What happened?', '他们说了什么？ What did they say?', '他们觉得怎么样？ How did they feel?'], ['突然，……', '这时候，……', '于是，……']],
  ['结尾 Ending · 图4', ['结果怎么样？ How did it end?', '心情怎么样？ How did they feel?', '学到了什么？ What did they learn?'], ['最后，……', '……高兴极了。', '我明白了……']],
];

export function essayScreen({ go, id }) {
  let list = S.essays().filter((e) => e.status === 'assigned');
  let e = id ? S.essays().find((x) => x.id === id) : (list.length === 1 ? list[0] : null);
  const n = html`<section class="screen"><div class="essay"></div></section>`;
  const root = $('.essay', n);
  const kv = new KittenView({ scale: 3 }); kv.canvas.classList.remove('bob');

  if (!e) {
    // more than one assignment: let her pick
    root.appendChild(html`<div class="card stack">
        <div class="h-title"><span class="zh">看图作文</span><span class="en">Picture writing</span></div>
        <div class="essay-list"></div></div>`);
    const box = $('.essay-list', root);
    if (!list.length) box.innerHTML = '<p class="help">现在没有作文要写。 No writing to do right now.</p>';
    list.forEach((x) => {
      const b = html`<button class="essay-pick"><span class="zh">${esc(x.title)}</span><small>${new Date(x.createdAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</small></button>`;
      b.onclick = () => go('essay', { id: x.id });
      box.appendChild(b);
    });
    return n;
  }

  const submitted = e.status !== 'assigned';
  root.appendChild(html`<div class="card stack essay-head">
      <div class="teacher"><div class="kv"></div><div class="say">
        <div class="line1">${submitted ? '已经交给妈妈了！' : '我们一起写作文！'}</div>
        <div class="line2">${submitted ? 'Waiting for Mum to check it.' : `Look at the pictures and write at least ${e.minChars} characters on paper.`}</div>
      </div></div>
      <div class="h-title" style="justify-content:center;font-size:28px"><span class="zh">${esc(e.title)}</span></div>
      <p class="help" style="text-align:center;margin:0">仔细看每一张图，写一篇 <b>${e.minChars}</b> 字以上的短文。<br>Look carefully at each picture and write at least ${e.minChars} characters. Tap the pictures to make them bigger.</p>
    </div>`);
  $('.kv', root).replaceWith(kv.canvas);
  kv.setMood(submitted ? 'happy' : 'normal');
  const picCard = html`<div class="card"></div>`;
  picCard.appendChild(pictureNode(e));
  root.appendChild(picCard);

  if (e.words && e.words.length) {
    const wc = html`<div class="card stack"><div class="h-title" style="font-size:22px"><span class="zh">参考词语</span><span class="en">Helping words — tap a word to hear it and see how to write it</span></div><div class="word-tiles"></div></div>`;
    const tiles = $('.word-tiles', wc);
    e.words.forEach((w) => {
      const t = html`<button class="word-tile"><span class="py">${esc(pinyinOf(w.w))}</span><span class="w zh">${esc(w.w)}</span>${w.meaning ? `<span class="m">${esc(w.meaning)}</span>` : ''}</button>`;
      t.onclick = () => wordHelper(w);
      tiles.appendChild(t);
    });
    root.appendChild(wc);
  }

  const tips = html`<details class="card tips"><summary class="h-title" style="font-size:22px"><span class="zh">💡 写作小提示</span><span class="en">Writing tips</span></summary>
      <div class="tip-grid">${TIPS.map(([h, qs, starters]) => `<div class="tip"><b>${h}</b><ul>${qs.map((q) => `<li>${q}</li>`).join('')}</ul><div class="starters">${starters.map((x) => `<span>${x}</span>`).join('')}</div></div>`).join('')}</div></details>`;
  root.appendChild(tips);

  if (!submitted) {
    const act = html`<div class="spell-actions"><button class="btn big green" id="submit">📮 <span class="zh">交给妈妈</span> Submit to Mum</button></div>`;
    $('#submit', act).onclick = async () => {
      if (!(await confirmBox('写好了吗？ Finished?', '你已经在纸上写完作文了吗？写完了就交给妈妈看吧！<br>Have you finished writing on paper? Then give it to Mum!', '交了 Submit', '还没 Not yet'))) return;
      S.submitEssay(e.id);
      sfx.fanfare(); confetti(); kv.setMood('happy'); kv.jump();
      toast('📮 <span class="zh">交给妈妈了！</span> Sent to Mum', { ms: 3500 });
      setTimeout(() => go('home'), 1600);
    };
    root.appendChild(act);
  } else {
    root.appendChild(html`<div class="card" style="text-align:center"><b>📮 已交 ${new Date(e.submittedAt).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</b><p class="help" style="margin:4px 0 0">妈妈看完以后会给你星星和金币哦！ Mum will give you stars and coins after reading it.</p></div>`);
  }
  hydrateIcons(root);
  return n;
}

// the kitten shows the parent's stars, coins and comment once
export function showEssayReward(e, kitten) {
  const r = e.review || {};
  const n = html`<div class="card stack" style="align-items:center;text-align:center">
      <div class="h-title" style="justify-content:center"><span class="zh">作文批改好了！</span><span class="en">Your writing was checked!</span></div>
      <div class="zh" style="font-size:22px">${esc(e.title)}</div>
      <div class="stars">${[1, 2, 3].map((i) => `<span class="${i <= (r.stars || 0) ? 'on' : ''}">★</span>`).join('')}</div>
      ${r.coins ? `<div class="price" style="font-size:28px">+${r.coins} ${coinI(26)}</div>` : ''}
      ${r.comment ? `<div class="parent-note"><small>妈妈说 · Mum says:</small><div class="zh">${esc(r.comment)}</div></div>` : ''}
      <button class="btn big green" id="ok">好的！ Yay!</button>
    </div>`;
  $('#ok', n).onclick = closeModal;
  openModal(n, { onClose: () => S.markEssaySeen(e.id) });
  hydrateIcons(n);
  sfx.fanfare(); confetti();
  if (kitten) { kitten.flash('happy', 2500); kitten.jump(); }
}
