// ✏️ Shading sheet (涂卡): an answer sheet of numbered rows with oval bubbles, like a school OMR sheet.
// She taps an oval to see it big and shades it with a few pencil strokes (an eraser rubs marks out).
// "Filled" is measured by how much of the oval is covered — not by how long she presses.
import { html, $ } from './ui.js';
import { sfx } from './audio.js';

// ---------- the shading surface ----------
// An oval is a G×G grid over [-SPAN, SPAN]² in "oval units": the oval is the unit circle there, stretched sideways
// when drawn. Cells inside count towards "filled"; cells well outside count as "outside the oval".
const G = 36, SPAN = 1.3, BRUSH = 0.24;
export const FULL = 0.82, MARKED = 0.12, TOO_MUCH_OUT = 0.3;
const cellXY = (i) => [((i % G) + 0.5) / G * 2 * SPAN - SPAN, (Math.floor(i / G) + 0.5) / G * 2 * SPAN - SPAN];
const INSIDE = [], RING = [];
for (let i = 0; i < G * G; i++) { const [x, y] = cellXY(i), d = Math.hypot(x, y); if (d <= 0.97) INSIDE.push(i); else if (d > 1.15) RING.push(i); }
// (going a little over the line is fine; only shading well outside the oval counts as "outside")
export const newGrid = () => new Uint8Array(G * G);
export function coverage(g) { let n = 0; INSIDE.forEach((i) => { n += g[i]; }); return n / INSIDE.length; }
export function outside(g) { let n = 0; RING.forEach((i) => { n += g[i]; }); return n / INSIDE.length; }
// paint (or rub out) a round brush along a line between two points (unit coordinates)
function brushLine(g, x0, y0, x1, y1, value) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (BRUSH / 3)));
  const r = Math.ceil(BRUSH / (2 * SPAN) * G) + 1;
  for (let s = 0; s <= steps; s++) {
    const x = x0 + (x1 - x0) * s / steps, y = y0 + (y1 - y0) * s / steps;
    const cx = Math.floor((x + SPAN) / (2 * SPAN) * G), cy = Math.floor((y + SPAN) / (2 * SPAN) * G);
    for (let gy = cy - r; gy <= cy + r; gy++) for (let gx = cx - r; gx <= cx + r; gx++) {
      if (gx < 0 || gy < 0 || gx >= G || gy >= G) continue;
      const i = gy * G + gx, [px, py] = cellXY(i);
      if (Math.hypot(px - x, py - y) <= BRUSH) g[i] = value;
    }
  }
}
// draw an oval (its outline, its number and the pencil marks) onto a w×h canvas
export function drawOval(c, g, label, { w = 46, h = 24 } = {}) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + 'px'; c.style.height = h + 'px';
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  const rx = w / (2 * SPAN), ry = h / (2 * SPAN), cx = w / 2, cy = h / 2, lw = Math.max(1, h / 22);
  x.fillStyle = '#fff'; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); x.fill();
  if (label) { x.fillStyle = '#26305a'; x.font = `600 ${Math.round(ry * 1.25)}px system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, cx, cy + ry * 0.06); }
  const cw = w / G, ch = h / G;
  x.fillStyle = 'rgba(40, 40, 52, .9)';
  for (let i = 0; i < g.length; i++) if (g[i]) { const gx = i % G, gy = Math.floor(i / G); x.fillRect(gx * cw, gy * ch, cw + 0.4, ch + 0.4); }
  x.strokeStyle = '#26305a'; x.lineWidth = lw;
  x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); x.stroke();
}

// ---------- the big oval: shade it with a few strokes ----------
// It always opens the oval she tapped — even if it's the wrong one — so the label is her chance to notice.
function openOval(g, { title, label, onBack }) {
  const big = html`<div class="sh-zoom" role="dialog" aria-label="Shade the oval"><div class="sh-zoom-card">
      <div class="sh-zoom-label">${title}</div>
      <canvas class="sh-zoom-canvas"></canvas>
      <div class="sh-zoom-tools"><button type="button" class="btn small sh-pencil on">✏️ <span class="zh">铅笔</span> Pencil</button><button type="button" class="btn small sh-eraser">🧽 <span class="zh">橡皮</span> Eraser</button></div>
      <button type="button" class="btn green sh-back">↩ <span class="zh">回到涂卡</span> Back</button>
    </div></div>`;
  if (big.ownerDocument !== document) document.adoptNode(big);
  const cv = $('.sh-zoom-canvas', big);
  const w = Math.min(380, Math.round(window.innerWidth * 0.84)), h = Math.round(Math.min(w * 0.55, window.innerHeight * 0.4));
  const draw = () => drawOval(cv, g, label, { w, h });
  draw();
  let erase = false, last = null, pid = null;
  const pencil = $('.sh-pencil', big), eraser = $('.sh-eraser', big);
  pencil.onclick = () => { erase = false; pencil.classList.add('on'); eraser.classList.remove('on'); };
  eraser.onclick = () => { erase = true; eraser.classList.add('on'); pencil.classList.remove('on'); };
  const toUnit = (e) => { const rc = cv.getBoundingClientRect(); return [((e.clientX - rc.left) / rc.width) * 2 * SPAN - SPAN, ((e.clientY - rc.top) / rc.height) * 2 * SPAN - SPAN]; };
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); pid = e.pointerId; try { cv.setPointerCapture(pid); } catch {} last = toUnit(e); brushLine(g, ...last, ...last, erase ? 0 : 1); draw(); });
  cv.addEventListener('pointermove', (e) => { if (e.pointerId !== pid) return; const p = toUnit(e); brushLine(g, ...last, ...p, erase ? 0 : 1); last = p; draw(); });
  ['pointerup', 'pointercancel'].forEach((ev) => cv.addEventListener(ev, (e) => { if (e.pointerId === pid) { pid = null; last = null; } }));
  cv.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  const close = () => { big.remove(); onBack(); };
  $('.sh-back', big).onclick = close;
  big.addEventListener('click', (e) => { if (e.target === big) close(); });
  document.body.append(big);
}

// The whole sheet: counts[r] = how many options question r has.
// problems(answers) lists what still needs fixing, row by row:
//   'none' (nothing shaded) · 'multi' (more than one oval) · 'wrong' (not the answer) · 'thin' (not filled) · 'messy' (too much outside)
export function shadingSheet(counts, { onChange = () => {} } = {}) {
  const grids = counts.map((n) => Array.from({ length: n }, newGrid));
  const el = html`<div class="omr"></div>`;
  if (el.ownerDocument !== document) document.adoptNode(el);   // canvases can only draw their numbers inside the real page
  const paint = (r, o) => drawOval(el.querySelector(`.omr-oval[data-k="${r}-${o}"] canvas`), grids[r][o], String(o + 1));
  counts.forEach((n, r) => {
    const num = document.createElement('b'); num.className = 'omr-n'; num.textContent = r + 1; num.dataset.row = r;
    const cells = document.createElement('div'); cells.className = 'omr-cells'; cells.dataset.row = r;
    if (r === 0) cells.classList.add('first'); if (r === counts.length - 1) cells.classList.add('last');
    for (let o = 0; o < n; o++) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'omr-oval'; b.dataset.k = `${r}-${o}`;
      b.setAttribute('aria-label', `Question ${r + 1} option ${o + 1}`);
      b.append(document.createElement('canvas'));
      b.onclick = () => {
        if (el.classList.contains('locked')) return;
        sfx.click();
        openOval(grids[r][o], { title: `<span class="zh">第${r + 1}题 · 选项${o + 1}</span><br>Question ${r + 1} · Option ${o + 1}`, label: String(o + 1), onBack: () => { paint(r, o); onChange(); } });
      };
      cells.append(b);
    }
    el.append(num, cells);
  });
  counts.forEach((n, r) => { for (let o = 0; o < n; o++) paint(r, o); });
  return {
    el,
    problems(answers) {
      const out = [];
      answers.forEach((ans, r) => {
        const m = grids[r].map((g, o) => (coverage(g) >= MARKED ? o : -1)).filter((o) => o >= 0);
        const kind = !m.length ? 'none' : m.length > 1 ? 'multi' : m[0] !== ans ? 'wrong' : coverage(grids[r][ans]) < FULL ? 'thin' : outside(grids[r][ans]) > TOO_MUCH_OUT ? 'messy' : null;
        if (kind) out.push({ r, kind });
      });
      return out;
    },
    flash(r) {
      el.querySelectorAll('.omr-flash').forEach((x) => x.classList.remove('omr-flash'));
      el.querySelectorAll(`[data-row="${r}"]`).forEach((x) => { void x.offsetWidth; x.classList.add('omr-flash'); });
      el.querySelector(`.omr-cells[data-row="${r}"]`).scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    lock() { el.classList.add('locked'); },
    get locked() { return el.classList.contains('locked'); },
  };
}
