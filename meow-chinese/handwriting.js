// Free handwriting: she writes in any stroke order, then the finished character is
// compared with the real character's shape. Stroke order does not matter.

const DATA_URL = (ch) => `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(ch)}.json`;
const cache = new Map();
export function loadChar(ch) {
  if (!cache.has(ch)) cache.set(ch, fetch(DATA_URL(ch)).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }));
  return cache.get(ch);
}

// ---------- geometry ----------
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function resample(pts, step) {
  if (pts.length < 2) return pts.slice();
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = dist(a, b);
    if (d === 0) continue;
    let t = step - carry;
    while (t <= d) { out.push([a[0] + ((b[0] - a[0]) * t) / d, a[1] + ((b[1] - a[1]) * t) / d]); t += step; }
    carry = d - (t - step);
  }
  const last = pts[pts.length - 1];
  if (dist(out[out.length - 1], last) > step * 0.3) out.push(last);
  return out;
}
function bbox(strokes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  strokes.forEach((s) => s.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }));
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
// centre on (0,0) and scale so the larger side is 1
function normalise(strokes) {
  const b = bbox(strokes);
  const size = Math.max(b.w, b.h, 1e-6);
  return { strokes: strokes.map((s) => s.map(([x, y]) => [(x - b.cx) / size, (y - b.cy) / size])), box: b };
}


function arcResample(pts, n) {
  if (pts.length === 1) return Array.from({ length: n }, () => pts[0]);
  const seg = [0];
  for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + dist(pts[i - 1], pts[i]));
  const L = seg[seg.length - 1] || 1e-6, out = [];
  let k = 1;
  for (let i = 0; i < n; i++) {
    const t = (L * i) / (n - 1);
    while (k < seg.length - 1 && seg[k] < t) k++;
    const a = pts[k - 1], b = pts[k], f = (t - seg[k - 1]) / ((seg[k] - seg[k - 1]) || 1e-6);
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}
// separate x / y scaling so a slightly squashed or stretched character still lines up
function normaliseXY(strokes) {
  const b = bbox(strokes), m = Math.max(b.w, b.h, 1e-6);
  const sw = Math.max(b.w, 0.35 * m), sh = Math.max(b.h, 0.35 * m);
  return strokes.map((s) => s.map(([x, y]) => [(x - b.cx) / sw, (y - b.cy) / sh]));
}
function strokeCost(a, b) {
  let f = 0, r = 0;
  for (let i = 0; i < a.length; i++) { f += dist(a[i], b[i]); r += dist(a[i], b[b.length - 1 - i]); }
  return Math.min(f, r) / a.length;
}
// one-to-one match of her strokes to the real strokes, ignoring order
function matchStrokes(drawn, target) {
  const N = 16;
  const A = drawn.map((s) => arcResample(s, N)), B = target.map((s) => arcResample(s, N));
  const pairs = [];
  A.forEach((a, i) => B.forEach((b, j) => pairs.push([strokeCost(a, b), i, j])));
  pairs.sort((x, y) => x[0] - y[0]);
  const ua = new Set(), ub = new Set(), costs = [];
  for (const [c, i, j] of pairs) { if (ua.has(i) || ub.has(j)) continue; ua.add(i); ub.add(j); costs.push(c); }
  return costs;
}


// ---------- structural check (tolerant of a child's proportions) ----------
const ang = (v) => Math.atan2(v[1], v[0]);
const angDiff = (a, b) => { let d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
function feats(s) {
  const r = arcResample(s, 9);
  const c = r.reduce((a, p) => [a[0] + p[0] / 9, a[1] + p[1] / 9], [0, 0]);
  const len = s.length < 2 ? 0 : s.slice(1).reduce((a, p, i) => a + dist(p, s[i]), 0);
  const v1 = [r[4][0] - r[0][0], r[4][1] - r[0][1]], v2 = [r[8][0] - r[4][0], r[8][1] - r[4][1]];
  return { c, len, a1: ang(v1), a2: ang(v2), rev1: ang([-v2[0], -v2[1]]), rev2: ang([-v1[0], -v1[1]]) };
}
function pairCost(d, t) {
  const cd = dist(d.c, t.c);
  let ad = 0;
  if (d.len > 0.1 && t.len > 0.1) {
    const fwd = (angDiff(d.a1, t.a1) + angDiff(d.a2, t.a2)) / 2;
    const rev = (angDiff(d.rev1, t.a1) + angDiff(d.rev2, t.a2)) / 2;
    ad = Math.min(fwd, rev);
  }
  return { cd, ad, cost: cd + ad * 0.25 };
}
function structural(drawn, target, opts = {}) {
  const D = drawn.map(feats), T = target.map(feats);
  const pairs = [];
  D.forEach((d, i) => T.forEach((t, j) => pairs.push({ i, j, ...pairCost(d, t) })));
  pairs.sort((a, b) => a.cost - b.cost);
  const ui = new Set(), uj = new Set(), m = new Array(T.length);
  for (const p of pairs) { if (ui.has(p.i) || uj.has(p.j)) continue; ui.add(p.i); uj.add(p.j); m[p.j] = p; }
  const deg = Math.PI / 180;
  const strokesOk = m.every((p) => p && p.cd < (opts.cd ?? 0.25) && p.ad < (opts.ad ?? 38) * deg);
  // the strokes must keep their layout: what is left/above in the real character stays left/above
  let flips = 0;
  for (let j = 0; j < T.length; j++) for (let k = j + 1; k < T.length; k++) {
    const dj = D[m[j].i].c, dk = D[m[k].i].c, tj = T[j].c, tk = T[k].c;
    for (const ax of [0, 1]) {
      const td = tk[ax] - tj[ax];
      if (Math.abs(td) > (opts.rel ?? 0.15) && Math.sign(dk[ax] - dj[ax]) !== Math.sign(td)) flips++;
    }
  }
  return { ok: strokesOk && flips === 0, flips, worstCd: Math.max(...m.map((p) => p.cd)), worstAd: Math.max(...m.map((p) => p.ad)) / deg };
}

// ---------- judging ----------
// drawn: array of strokes, each an array of [x, y] in screen pixels (y down)
// data: hanzi-writer-data JSON for the target character
export function judge(drawn, data, { tol = 0.09, cov = 0.75, prec = 0.8, maxStroke = 0.13, sopts = {} } = {}) {
  const ink = drawn.filter((s) => s.length > 0);
  if (!ink.length) return { ok: false, reason: 'empty' };
  const target = data.medians.map((m) => m.map(([x, y]) => [x, 900 - y]));
  const T = normalise(target), D = normalise(ink);

  // aspect ratio sanity (a tall character shouldn't match a flat scribble)
  const ar = (b) => Math.max(b.w, 1) / Math.max(b.h, 1);
  const arT = ar(T.box), arD = ar(D.box);
  const aspectOk = Math.abs(Math.log(arT) - Math.log(arD)) < 0.7 || Math.max(T.box.w, T.box.h) < 1;

  const tPts = T.strokes.map((s) => resample(s, 0.02));
  const dPts = D.strokes.map((s) => (s.length === 1 ? s : resample(s, 0.01)));
  const flatT = []; tPts.forEach((s, j) => s.forEach((p, k) => flatT.push({ p, j, k })));
  const covered = tPts.map((s) => new Array(s.length).fill(false));

  // each point of her ink "votes" for the closest point on the real character
  const precise = dPts.map((s) => {
    let good = 0;
    s.forEach((p) => {
      let best = null, bd = Infinity;
      for (const t of flatT) { const d = (p[0] - t.p[0]) ** 2 + (p[1] - t.p[1]) ** 2; if (d < bd) { bd = d; best = t; } }
      if (Math.sqrt(bd) < tol) {
        good++;
        const row = covered[best.j];
        for (let k = best.k - 1; k <= best.k + 1; k++) if (k >= 0 && k < row.length) row[k] = true;
      }
    });
    return good / s.length;
  });
  // every real stroke must be (mostly) drawn over
  const cover = covered.map((row) => row.filter(Boolean).length / row.length);

  const minCover = Math.min(...cover), minPrecise = Math.min(...precise);

  // Same number of strokes: match stroke to stroke (any order, either direction).
  // Different number (strokes joined or split): fall back to a stricter shape overlap.
  let ok, worst = null, struct = null;
  if (ink.length === target.length) {
    const nI = normaliseXY(ink), nT = normaliseXY(target);
    worst = Math.max(...matchStrokes(nI, nT));
    struct = structural(nI, nT, sopts);
    ok = aspectOk && (struct.ok || worst < maxStroke || (minCover >= cov && minPrecise >= prec && worst < maxStroke * 1.4));
  } else {
    // fewer strokes is OK (she may join two strokes); extra strokes are not
    const countOk = ink.length < target.length && target.length - ink.length <= Math.max(1, Math.round(target.length * 0.25));
    ok = aspectOk && countOk && minCover >= cov && minPrecise >= prec;
  }
  return { ok, worst, struct, minCover, minPrecise, strokes: ink.length, expected: target.length, aspectOk };
}

// ---------- drawing pad ----------
export class InkPad {
  constructor(box, size, { width = 8, color = '#2f62d6', onStroke } = {}) {
    this.box = box; this.size = size; this.strokes = []; this.cur = null; this.onStroke = onStroke;
    const c = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr; c.height = size * dpr;
    c.style.cssText = `width:${size}px;height:${size}px;display:block;position:relative;touch-action:none`;
    this.ctx = c.getContext('2d'); this.ctx.scale(dpr, dpr);
    this.ctx.lineCap = 'round'; this.ctx.lineJoin = 'round'; this.ctx.lineWidth = width; this.ctx.strokeStyle = color;
    this.canvas = c; this.color = color; this.enabled = true;
    const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault(); c.setPointerCapture(e.pointerId);
      this.cur = [pos(e)]; this.strokes.push(this.cur); this.redraw();
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.cur) return;
      e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      evs.forEach((ev) => this.cur.push(pos(ev)));
      this.redraw();
    });
    const up = () => { if (this.cur) { this.cur = null; this.onStroke && this.onStroke(this); } };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    box.appendChild(c);
  }
  redraw(color) {
    const ctx = this.ctx; ctx.clearRect(0, 0, this.size, this.size);
    ctx.strokeStyle = color || this.color; ctx.fillStyle = color || this.color;
    this.strokes.forEach((s) => {
      if (s.length === 1) { ctx.beginPath(); ctx.arc(s[0][0], s[0][1], ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return; }
      ctx.beginPath(); ctx.moveTo(...s[0]);
      for (let i = 1; i < s.length; i++) ctx.lineTo(...s[i]);
      ctx.stroke();
    });
  }
  undo() { this.strokes.pop(); this.redraw(); }
  clear() { this.strokes = []; this.redraw(); }
  get empty() { return this.strokes.length === 0; }
  tint(color) { this.color = color; this.redraw(); }
}
