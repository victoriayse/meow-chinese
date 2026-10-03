// A short spelling challenge in a pop-up: listen to each word and write it. Used to earn more essay time.
import * as S from './state.js';
import { $, html, esc, toast, openModal, closeModal } from './ui.js';
import { speak, sfx } from './audio.js';
import { SnapBox, loadChar } from './handwriting.js';

const isHan = (ch) => /\p{Script=Han}/u.test(ch);
const pinyinOf = (w) => { try { return window.pinyinPro.pinyin(w); } catch { return ''; } };

export function wordChallenge(words, { title = '写对5个词，加15分钟！', sub = 'Write these 5 words to get 15 more minutes.', onDone, onCancel } = {}) {
  let i = 0, cancelled = false;
  const n = html`<div class="card stack challenge">
      <div class="h-title" style="justify-content:center;font-size:24px"><span class="zh">${esc(title)}</span></div>
      <p class="help" style="text-align:center;margin:0">${esc(sub)}</p>
      <div class="ch-dots"></div>
      <div class="row" style="justify-content:center">
        <button class="btn blue" id="say">🔊 <span class="zh">听</span> Listen</button>
        <button class="btn white" id="sent">💬 <span class="zh">句子</span> Sentence</button>
        <button class="btn white" id="hint">💡 <span class="zh">提示</span> Hint</button>
      </div>
      <div class="boxes" id="cb"></div>
      <div class="ch-msg" id="msg"></div>
      <button class="btn white small" id="cancel" style="align-self:center">取消 Cancel</button>
    </div>`;
  const dots = () => { $('.ch-dots', n).innerHTML = words.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'cur' : ''}"></i>`).join(''); };
  let boxes = [], slips = 0;
  async function show() {
    dots();
    const word = words[i];
    const chars = [...word.w].filter(isHan);
    n.dataset.word = word.w;
    const cb = $('#cb', n); cb.innerHTML = ''; boxes = []; slips = 0;
    $('#msg', n).textContent = '';
    $('#sent', n).style.display = word.hint ? '' : 'none';
    const size = Math.max(90, Math.min(150, Math.floor((Math.min(window.innerWidth, 640) - 70) / Math.max(1, chars.length)) - 12));
    let left = chars.length;
    for (const ch of chars) {
      const b = html`<div class="box" style="--s:${size}px"></div>`; cb.appendChild(b);
      const data = await loadChar(ch).catch(() => null);
      if (cancelled || words[i] !== word) return;
      if (!data) { left--; continue; }
      const sb = new SnapBox(b, size - 8, data, {
        outline: false, hintAfter: 3, leniency: 1.35,
        onHit: () => sfx.stroke(), onMiss: () => { slips++; sfx.miss(); }, onHint: () => { slips += 3; },
        onComplete: () => { b.classList.add('ok'); if (--left === 0) next(); },
      });
      boxes.push(sb);
    }
    speak(word.w);
  }
  function next() {
    const word = words[i];
    S.recordWord(word.w, slips >= 3 ? 'retry' : 'first');
    sfx.correct();
    $('#msg', n).innerHTML = `✅ <span class="zh">${esc(word.w)}</span> ${esc(pinyinOf(word.w))}`;
    i++;
    if (i >= words.length) {
      dots();
      setTimeout(() => { if (!cancelled) { closeModal(); onDone && onDone(); } }, 900);
    } else setTimeout(() => { if (!cancelled) show(); }, 900);
  }
  $('#say', n).onclick = () => speak(words[i].w);
  $('#sent', n).onclick = () => words[i].hint && speak(words[i].hint);
  $('#hint', n).onclick = () => { const sb = boxes.find((b) => !b.complete); if (sb) sb.hint(); };
  $('#cancel', n).onclick = () => { cancelled = true; closeModal(); onCancel && onCancel(); };
  const m = openModal(n);
  m.onclick = null;                         // don't close by tapping outside
  $('#modal .card').style.width = 'min(720px, 96vw)';
  show();
}
