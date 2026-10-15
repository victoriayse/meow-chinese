// ✏️ Answer-sheet shading: an optional row of bubbles under a multiple-choice question.
// She taps a bubble to see it big and shades it with a few pencil strokes (an eraser rubs marks out).
// "Filled" is measured by how much of the circle is covered — not by how long she presses.
import { html, $ } from './ui.js';
import { sfx } from './audio.js';

// ---------- the shading surface ----------
// A bubble is a G×G grid over [-1.5, 1.5]²; the circle is radius 1. Cells inside the circle count towards "filled",
// cells in the ring just outside count as "outside the circle".
const G = 36, BRUSH = 0.28;
export const FULL = 0.82, MARKED = 0.12, TOO_MUCH_OUT = 0.3;
const cellXY = (i) => [((i % G) + 0.5) / G * 3 - 1.5, (Math.floor(i / G) + 0.5) / G * 3 - 1.5];
const INSIDE = [], RING = [];
for (let i = 0; i < G * G; i++) { const [x, y] = cellXY(i), d = Math.hypot(x, y); if (d <= 0.97) INSIDE.push(i); else if (d > 1.2 && d <= 1.5) RING.push(i); }
// (going a little over the line is fine; only shading well outside the circle counts as "outside")
export const newGrid = () => new Uint8Array(G * G);
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
export function drawBubble(c, g, label, { size = 40, ring = false } = {}) {
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

// ---------- the big bubble: shade it with a few strokes ----------
// It always opens the bubble she tapped — even if it's the wrong one — so the label is her chance to notice.
function openBubble(g, { title, label, onBack }) {
  const big = html`<div class="sh-zoom" role="dialog" aria-label="Shade the bubble"><div class="sh-zoom-card">
      <div class="sh-zoom-label">${title}</div>
      <canvas class="sh-zoom-canvas"></canvas>
      <div class="sh-zoom-tools"><button type="button" class="btn small sh-pencil on">✏️ <span class="zh">铅笔</span> Pencil</button><button type="button" class="btn small sh-eraser">🧽 <span class="zh">橡皮</span> Eraser</button></div>
      <button type="button" class="btn green sh-back">↩ <span class="zh">回到题目</span> Back</button>
    </div></div>`;
  const cv = $('.sh-zoom-canvas', big), size = Math.min(300, Math.round(window.innerWidth * 0.72), Math.round(window.innerHeight * 0.45));
  const draw = () => drawBubble(cv, g, label, { size });
  draw();
  let erase = false, last = null, pid = null;
  const pencil = $('.sh-pencil', big), eraser = $('.sh-eraser', big);
  pencil.onclick = () => { erase = false; pencil.classList.add('on'); eraser.classList.remove('on'); };
  eraser.onclick = () => { erase = true; eraser.classList.add('on'); pencil.classList.remove('on'); };
  const toUnit = (e) => { const rc = cv.getBoundingClientRect(); return [((e.clientX - rc.left) / rc.width) * 3 - 1.5, ((e.clientY - rc.top) / rc.height) * 3 - 1.5]; };
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); pid = e.pointerId; try { cv.setPointerCapture(pid); } catch {} last = toUnit(e); brushLine(g, ...last, ...last, erase ? 0 : 1); draw(); });
  cv.addEventListener('pointermove', (e) => { if (e.pointerId !== pid) return; const p = toUnit(e); brushLine(g, ...last, ...p, erase ? 0 : 1); last = p; draw(); });
  ['pointerup', 'pointercancel'].forEach((ev) => cv.addEventListener(ev, (e) => { if (e.pointerId === pid) { pid = null; last = null; } }));
  cv.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  const close = () => { big.remove(); onBack(); };
  $('.sh-back', big).onclick = close;
  big.addEventListener('click', (e) => { if (e.target === big) close(); });
  document.body.append(big);
}

// The answer-sheet row for one question: number + one bubble per option.
// check(ans) says how her shading went once she has answered:
//   'none'  — she didn't shade (that's fine, it's optional)
//   'good'  — only the right bubble, filled in, not much outside the circle
//   'wrong' / 'multi' / 'thin' / 'messy' — shaded, but not quite
export function answerRow(qNo, count, { note = '' } = {}) {
  const grids = Array.from({ length: count }, newGrid);
  const el = html`<div class="sh-sheet">
      <div class="sh-head"><b>📝 <span class="zh">答题纸</span> Answer sheet</b><small>${note}</small></div>
      <div class="sh-row"><b class="sh-qn">${qNo}</b><div class="sh-bubbles"></div></div>
      <div class="sh-msg" aria-live="polite"></div>
    </div>`;
  if (el.ownerDocument !== document) document.adoptNode(el);   // canvases can only draw their numbers inside the real page
  const row = $('.sh-bubbles', el);
  const paint = (o) => drawBubble(row.children[o].firstChild, grids[o], String(o + 1), { size: 40 });
  for (let o = 0; o < count; o++) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sh-bubble';
    b.setAttribute('aria-label', `Question ${qNo} option ${o + 1}`);
    b.append(document.createElement('canvas')); row.append(b); paint(o);
    b.onclick = () => {
      if (el.classList.contains('locked')) return;
      sfx.click();
      openBubble(grids[o], { title: `<span class="zh">第${qNo}题 · 选项${o + 1}</span><br>Question ${qNo} · Option ${o + 1}`, label: String(o + 1), onBack: () => paint(o) });
    };
  }
  const marked = () => grids.map((g, o) => (coverage(g) >= MARKED ? o : -1)).filter((o) => o >= 0);
  return {
    el,
    check(ans) {
      const m = marked();
      if (!m.length) return 'none';
      if (m.length > 1) return 'multi';
      if (m[0] !== ans) return 'wrong';
      if (coverage(grids[ans]) < FULL) return 'thin';
      if (outside(grids[ans]) > TOO_MUCH_OUT) return 'messy';
      return 'good';
    },
    say(text, good) { const msg = $('.sh-msg', el); msg.innerHTML = text; msg.className = `sh-msg ${good ? 'good' : 'meh'}`; },
    lock() { el.classList.add('locked'); },
  };
}
