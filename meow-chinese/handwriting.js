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
  const C = A.map((a) => B.map((b) => strokeCost(a, b)));
  const rowFor = assign(C);
  const costs = B.map((b, j) => C[rowFor[j]][j]);
  return costs;
}



// optimal one-to-one assignment (Hungarian algorithm); cost[i][j], n x n
function assign(cost) {
  const n = cost.length, INF = 1e9;
  const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0), p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0;
    const minv = new Array(n + 1).fill(INF), used = new Array(n + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const rowFor = new Array(n); for (let j = 1; j <= n; j++) rowFor[j - 1] = p[j] - 1; // target j -> drawn row
  return rowFor;
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
  const C = D.map((d) => T.map((t) => pairCost(d, t)));
  const rowFor = assign(C.map((r) => r.map((x) => x.cost)));
  const m = T.map((t, j) => ({ i: rowFor[j], ...C[rowFor[j]][j] }));
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
    // judge the overlap more loosely here, since joined strokes change the shape a little
    const loose = (() => {
      const t2 = tol * 1.25;
      const covered = tPts.map((s) => new Array(s.length).fill(false));
      let worstP = 1;
      dPts.forEach((s) => {
        let good = 0;
        s.forEach((p) => {
          let best = null, bd = Infinity;
          for (const t of flatT) { const d = (p[0] - t.p[0]) ** 2 + (p[1] - t.p[1]) ** 2; if (d < bd) { bd = d; best = t; } }
          if (Math.sqrt(bd) < t2) { good++; const row = covered[best.j]; for (let k = best.k - 2; k <= best.k + 2; k++) if (k >= 0 && k < row.length) row[k] = true; }
        });
        worstP = Math.min(worstP, good / s.length);
      });
      const worstC = Math.min(...covered.map((r) => r.filter(Boolean).length / r.length));
      return worstC >= 0.65 && worstP >= 0.7;
    })();
    ok = aspectOk && countOk && ((minCover >= cov && minPrecise >= prec) || loose);
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

// ---------- snap writing: each stroke she draws snaps into the real stroke, in any order ----------
const SVGNS = 'http://www.w3.org/2000/svg';
function polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]); return L; }
function distToPoly(p, poly) {
  let m = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-6;
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t));
    m = Math.min(m, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return poly.length === 1 ? dist(p, poly[0]) : m;
}
// how well a drawn stroke (char coords) fits one real stroke median; lower is better, Infinity = no match
export function strokeFit(drawn, median, leniency = 1) {
  const d = arcResample(drawn, 16), t = arcResample(median, 16);
  const Ld = polyLen(drawn), Lt = polyLen(median);
  const avgDT = d.reduce((a, p) => a + distToPoly(p, median), 0) / d.length;
  const avgTD = t.reduce((a, p) => a + distToPoly(p, drawn), 0) / t.length;
  const fwdEnds = (dist(d[0], t[0]) + dist(d[15], t[15])) / 2, revEnds = (dist(d[0], t[15]) + dist(d[15], t[0])) / 2;
  const ends = Math.min(fwdEnds, revEnds);
  const tiny = Lt < 120; // dots: just need to be in the right place
  const ratio = Ld / Math.max(Lt, 1);
  if (avgDT > 150 * leniency || avgTD > 170 * leniency) return Infinity;
  if (!tiny && ends > 230 * leniency) return Infinity;
  if (!tiny && (ratio < 0.35 / leniency || ratio > 2.6 * leniency)) return Infinity;
  if (!tiny) {
    const vd = [d[15][0] - d[0][0], d[15][1] - d[0][1]], vt = [t[15][0] - t[0][0], t[15][1] - t[0][1]];
    const cos = Math.abs(vd[0] * vt[0] + vd[1] * vt[1]) / ((Math.hypot(...vd) * Math.hypot(...vt)) || 1);
    if (Lt > 250 && Math.hypot(...vt) > 150 && cos < 0.55) return Infinity; // clearly the wrong direction
  }
  return avgDT + avgTD + ends * 0.5;
}

export class SnapBox {
  // box: element; size: px; data: hanzi-writer-data JSON
  constructor(box, size, data, { padding = Math.round(size * 0.07), outline = false, leniency = 1.25, hintAfter = 3, onHit, onMiss, onComplete, onHint } = {}) {
    Object.assign(this, { box, size, data, padding, leniency, hintAfter, onHit, onMiss, onComplete, onHint });
    this.scale = (size - 2 * padding) / 1024;
    this.done = new Set(); this.misses = 0; this.hinted = false; this.complete = false;
    this.ink = []; // her accepted strokes so far, in character coordinates
    this.medians = data.medians.map((m) => m.map(([x, y]) => [x, y]));
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('width', size); svg.setAttribute('height', size);
    svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('transform', `translate(${padding}, ${padding + 900 * this.scale}) scale(${this.scale}, ${-this.scale})`);
    svg.appendChild(g);
    this.paths = data.strokes.map((d) => {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', outline ? '#e4d9c6' : 'transparent');
      p.style.transition = 'fill .25s';
      g.appendChild(p);
      return p;
    });
    this.outline = outline;
    box.appendChild(svg);
    this.svg = svg;
    this.pad = new InkPad(box, size, { width: Math.max(5, Math.round(size / 24)), onStroke: (pad) => this.stroke(pad) });
    this.pad.canvas.style.position = 'absolute'; this.pad.canvas.style.left = '0'; this.pad.canvas.style.top = '0';
  }
  toChar([x, y]) { return [(x - this.padding) / this.scale, 900 - (y - this.padding) / this.scale]; }
  // learn how her writing is shifted / squashed compared with the real character
  fitFrom(assignments) {
    const P = [];
    assignments.forEach(([i, j]) => {
      const d = arcResample(this.ink[i], 8), t = arcResample(this.medians[j], 8);
      const fwd = dist(d[0], t[0]) + dist(d[7], t[7]), rev = dist(d[0], t[7]) + dist(d[7], t[0]);
      const tt = fwd <= rev ? t : t.slice().reverse();
      d.forEach((p, k) => P.push([p, tt[k]]));
    });
    if (!P.length) return { ax: 1, bx: 0, ay: 1, by: 0 };
    const axis = (k) => {
      const n = P.length, mx = P.reduce((a, q) => a + q[0][k], 0) / n, my = P.reduce((a, q) => a + q[1][k], 0) / n;
      let sxy = 0, sxx = 0;
      P.forEach(([d, t]) => { sxy += (d[k] - mx) * (t[k] - my); sxx += (d[k] - mx) ** 2; });
      let a = sxx > 250 * n ? sxy / sxx : 1;   // need some spread before trusting a scale
      a = Math.max(0.65, Math.min(1.6, a));
      return [a, my - a * mx];
    };
    const [ax, bx] = axis(0), [ay, by] = axis(1);
    return { ax, bx, ay, by };
  }
  // match ALL her strokes so far to the real strokes at once, so an early wrong guess gets corrected
  solve() {
    const nI = this.ink.length, nT = this.medians.length, N = Math.max(nI, nT), BIG = 1e6;
    let fit = { ax: 1, bx: 0, ay: 1, by: 0 }, result = [];
    for (let iter = 0; iter < 3; iter++) {
      const L = this.leniency * (iter === 0 && nI <= 2 ? 1.2 : 1);
      const cost = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => {
        if (i >= nI || j >= nT) return BIG / 2;               // dummy: stroke left unmatched
        const raw = this.ink[i], adj = raw.map(([x, y]) => [fit.ax * x + fit.bx, fit.ay * y + fit.by]);
        const c = Math.min(strokeFit(adj, this.medians[j], L), iter === 0 ? strokeFit(raw, this.medians[j], L) : Infinity);
        return Number.isFinite(c) ? c : BIG;
      }));
      const rowFor = assign(cost);
      result = [];
      rowFor.forEach((i, j) => { if (i < nI && j < nT && cost[i][j] < BIG / 2) result.push([i, j]); });
      fit = this.fitFrom(result);
    }
    return result;
  }
  stroke(pad) {
    const raw = pad.strokes[pad.strokes.length - 1];
    pad.clear();
    if (this.complete || !raw) return;
    this.ink.push(raw.map((p) => this.toChar(p)));
    const result = this.solve();
    const newIdx = this.ink.length - 1;
    if (!result.some(([i]) => i === newIdx)) {
      this.ink.pop();                                          // didn't match anything: let it fade
      this.misses++;
      this.onMiss && this.onMiss(this);
      if (this.misses >= this.hintAfter) this.hint();
      return;
    }
    // keep only strokes that are still matched (rarely one gets pushed out), then redraw
    const keep = new Set(result.map(([i]) => i));
    const remap = new Map(); const ink2 = [];
    this.ink.forEach((s, i) => { if (keep.has(i)) { remap.set(i, ink2.length); ink2.push(s); } });
    this.ink = ink2;
    this.done = new Set(result.map(([, j]) => j));
    this.misses = 0;
    this.paths.forEach((p, j) => p.setAttribute('fill', this.done.has(j) ? '#2b2140' : (this.outline ? '#e4d9c6' : 'transparent')));
    this.onHit && this.onHit(this);
    if (this.done.size === this.paths.length) { this.complete = true; this.onComplete && this.onComplete(this); }
  }
  hint() {
    const j = this.medians.findIndex((_, k) => !this.done.has(k));
    if (j < 0) return;
    this.hinted = true; this.misses = 0;
    const p = this.paths[j], back = this.outline ? '#e4d9c6' : 'transparent';
    p.setAttribute('fill', '#ffb020');
    setTimeout(() => { if (!this.done.has(j)) p.setAttribute('fill', back); }, 900);
    this.onHint && this.onHint(this);
  }
  set enabled(v) { this.pad.enabled = v; }
  showAll(color = '#2b2140') { this.paths.forEach((p) => p.setAttribute('fill', color)); }
}
