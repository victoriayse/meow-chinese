// Pixel art: kitten generator, item sprites and the meadow landscape.
// Everything is drawn at low resolution and scaled up with smoothing off.

export const FURS = {
  ginger: { name: '橘猫 Ginger', f: '#f4a65a', s: '#d9813c', w: '#fff5e8', o: '#4a2c2a' },
  grey:   { name: '灰猫 Grey',   f: '#aab6c6', s: '#7f8ba0', w: '#f4f6fa', o: '#2f3442' },
  white:  { name: '白猫 White',  f: '#fbf6ee', s: '#e2d6c6', w: '#ffffff', o: '#5b4848' },
  black:  { name: '黑猫 Black',  f: '#45435a', s: '#2e2c3f', w: '#ece6f3', o: '#16151f' },
  calico: { name: '三花 Calico', f: '#fbf3e6', s: '#e8964e', w: '#ffffff', o: '#4a2c2a', patch: '#3f3a3a' },
};

const PINK = '#f6a3b7', NOSE = '#e8708c', EYE = '#2b2140', BLUSH = '#ffbfd0';

// ---------- helpers ----------
const KW = 32, KH = 38, OY = 6; // kitten grid; OY = headroom for hats

function grid(w, h) { return Array.from({ length: h }, () => Array(w).fill(null)); }
function inEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; return dx * dx + dy * dy <= 1;
}
function inTri(px, py, a, b, c) {
  const s = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const p = [px + 0.5, py + 0.5];
  const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// ---------- kitten ----------
// mood: 'normal' | 'happy' | 'sleepy' | 'blink' | 'eat'
export function kittenGrid(fur = 'ginger', mood = 'normal', equipped = {}, frame = 0, mirrorPatch = false, headOnly = false) {
  const P = FURS[fur] || FURS.ginger;
  const g = grid(KW, KH), region = grid(KW, KH);
  const set = (x, y, c, r) => { if (x >= 0 && y >= 0 && x < KW && y < KH) { g[y][x] = c; if (r) region[y][x] = r; } };
  const fillShape = (test, c, r) => { for (let y = 0; y < KH; y++) for (let x = 0; x < KW; x++) if (test(x, y)) set(x, y, c, r); };
  const Y = (v) => v + OY;
  const tailSway = frame % 2 === 0 ? 0 : 1;
  const back = mood === 'back';   // seen from behind (sitting at the piano)

  // tail (behind body; in front of it when we see her from behind)
  const drawTail = () => { for (let t = 0; t <= 1; t += 0.02) {
    const x0 = 22, y0 = Y(28), cx = 30 + tailSway, cy = Y(26), x1 = 27 + tailSway, y1 = Y(17);
    const bx = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1;
    const by = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1;
    fillShape((x, y) => inEllipse(x, y, bx, by, 1.7, 1.7), t > 0.82 ? P.s : P.f, 'tail');
  } };
  if (!headOnly && !back) drawTail();
  // body
  if (!headOnly) {
    fillShape((x, y) => inEllipse(x, y, 16, Y(24.5), 7.6, 6.6), P.f, 'body');
    if (!back) fillShape((x, y) => inEllipse(x, y, 16, Y(25.5), 4.2, 4.6), P.w, 'body');
    else for (let y = Y(19); y <= Y(28); y++) set(16, y, P.s);   // a stripe down her back
    // paws
    fillShape((x, y) => inEllipse(x, y, 12.2, Y(30.2), 2.6, 1.7), P.w, 'paw');
    fillShape((x, y) => inEllipse(x, y, 19.8, Y(30.2), 2.6, 1.7), P.w, 'paw');
  }
  // ears
  const earL = [[5, Y(10)], [7.5, Y(0.5)], [14, Y(5)]], earR = [[27, Y(10)], [24.5, Y(0.5)], [18, Y(5)]];
  fillShape((x, y) => inTri(x, y, ...earL), P.f, 'head');
  fillShape((x, y) => inTri(x, y, ...earR), P.f, 'head');
  if (!back) {
    fillShape((x, y) => inTri(x, y, [7.6, Y(8)], [8.3, Y(3)], [12, Y(6)]), PINK, 'head');
    fillShape((x, y) => inTri(x, y, [24.4, Y(8)], [23.7, Y(3)], [20, Y(6)]), PINK, 'head');
  }
  // head
  fillShape((x, y) => inEllipse(x, y, 16, Y(11.5), 11.2, 8.4), P.f, 'head');
  if (P.patch) {
    // when the kitten turns round, the patches are drawn on the other side so they stay put after the flip
    const px = (x) => (mirrorPatch ? KW - x : x);
    fillShape((x, y) => region[y][x] === 'head' && inEllipse(x, y, px(9), Y(6), 5, 4), P.patch);
    fillShape((x, y) => region[y][x] === 'head' && inEllipse(x, y, px(24), Y(7), 3.5, 3), P.s);
    fillShape((x, y) => region[y][x] === 'tail', P.s);
  }
  // forehead stripes
  if (!P.patch) {
    [[13, 4], [16, 4], [19, 4]].forEach(([x, y]) => { set(x, Y(y), P.s); set(x, Y(y + 1), P.s); });
    set(16, Y(6), P.s);
  }
  if (!back) {   // the face (not seen from behind)
  // muzzle
  fillShape((x, y) => inEllipse(x, y, 16, Y(15.2), 4.6, 2.9), P.w, 'head');
  // cheeks blush (rosier when she is smitten)
  [[7, 14], [8, 14], [24, 14], [23, 14]].forEach(([x, y]) => set(x, Y(y), BLUSH));
  if (mood === 'love') [[6, 14], [7, 15], [8, 15], [25, 14], [24, 15], [23, 15]].forEach(([x, y]) => set(x, Y(y), BLUSH));
  // nose + mouth
  set(15, Y(13), NOSE); set(16, Y(13), NOSE);
  if (mood === 'eat') {
    set(15, Y(15), EYE); set(16, Y(15), EYE); set(15, Y(16), NOSE); set(16, Y(16), NOSE);
  } else if (mood === 'cough') {
    // open "ko!" mouth
    set(15, Y(15), EYE); set(16, Y(15), EYE); set(15, Y(16), EYE); set(16, Y(16), EYE);
  } else if (mood === 'bored') {
    set(14, Y(15), P.o); set(15, Y(15), P.o); set(16, Y(15), P.o); set(17, Y(15), P.o);
  } else if (mood === 'dizzy' || mood === 'faint') {
    // wobbly mouth
    set(13, Y(16), P.o); set(14, Y(15), P.o); set(15, Y(16), P.o); set(16, Y(15), P.o); set(17, Y(16), P.o); set(18, Y(15), P.o);
  } else if (mood === 'cry' || mood === 'hungry') {
    // frown
    set(14, Y(16), P.o); set(15, Y(15), P.o); set(16, Y(15), P.o); set(17, Y(16), P.o);
  } else if (mood === 'thirsty') {
    // open mouth, tongue out
    set(14, Y(15), P.o); set(15, Y(15), P.o); set(16, Y(15), P.o); set(17, Y(15), P.o);
    set(15, Y(16), '#ff7f9f'); set(16, Y(16), '#ff7f9f'); set(15, Y(17), '#ff7f9f'); set(16, Y(17), '#e8607f');
  } else if (mood === 'love' || mood === 'e-wink') {
    // big happy smile
    set(13, Y(14), P.o); set(14, Y(15), P.o); set(15, Y(15), P.o); set(16, Y(15), P.o); set(17, Y(15), P.o); set(18, Y(14), P.o);
    set(15, Y(16), '#ff7f9f'); set(16, Y(16), '#ff7f9f');
  } else if (mood === 'e-laugh') {
    // wide-open laughing mouth
    set(13, Y(14), P.o); set(18, Y(14), P.o);
    for (let x = 14; x <= 17; x++) set(x, Y(15), P.o);
    set(14, Y(16), P.o); set(15, Y(16), '#ff7f9f'); set(16, Y(16), '#ff7f9f'); set(17, Y(16), P.o);
    set(15, Y(17), P.o); set(16, Y(17), P.o);
  } else if (mood === 'e-wow') {
    // little round "o"
    set(15, Y(15), P.o); set(16, Y(15), P.o); set(14, Y(16), P.o); set(17, Y(16), P.o); set(15, Y(17), P.o); set(16, Y(17), P.o);
    set(15, Y(16), '#5a2d3c'); set(16, Y(16), '#5a2d3c');
  } else if (mood === 'e-angry') {
    set(14, Y(16), P.o); set(15, Y(15), P.o); set(16, Y(15), P.o); set(17, Y(16), P.o);
  } else if (mood === 'e-shy') {
    // small wavy mouth
    set(14, Y(15), P.o); set(15, Y(16), P.o); set(16, Y(15), P.o); set(17, Y(16), P.o);
  } else if (mood === 'e-cool') {
    // smirk
    set(14, Y(15), P.o); set(15, Y(15), P.o); set(16, Y(15), P.o); set(17, Y(14), P.o);
  } else {
    set(14, Y(15), P.o); set(15, Y(14), P.o); set(16, Y(14), P.o); set(17, Y(15), P.o);
  }
  // eyes
  const eyes = (ex) => {
    const left = ex < 16;
    if (mood === 'e-laugh' || mood === 'e-shy') {
      // squeezed  > <  eyes (laugh) or happy ^ ^ (shy)
      if (mood === 'e-shy') { set(ex - 1, Y(12), EYE); set(ex, Y(11), EYE); set(ex + 1, Y(11), EYE); set(ex + 2, Y(12), EYE); return; }
      if (left) [[-1, 10], [0, 10], [1, 11], [0, 12], [-1, 12]].forEach(([dx, y]) => set(ex + dx, Y(y), EYE));
      else [[2, 10], [1, 10], [0, 11], [1, 12], [2, 12]].forEach(([dx, y]) => set(ex + dx, Y(y), EYE));
      return;
    }
    if (mood === 'e-wow') {
      // big round eyes
      for (let dx = -1; dx <= 2; dx++) { set(ex + dx, Y(9), EYE); set(ex + dx, Y(12), EYE); }
      for (let y = 10; y <= 11; y++) { set(ex - 1, Y(y), EYE); set(ex + 2, Y(y), EYE); set(ex, Y(y), '#ffffff'); set(ex + 1, Y(y), '#ffffff'); }
      set(ex, Y(11), EYE);
      return;
    }
    if (mood === 'e-angry') {
      for (let yy = 10; yy <= 12; yy++) { set(ex, Y(yy), EYE); set(ex + 1, Y(yy), EYE); }
      // brows slanting down to the middle
      if (left) { set(ex - 1, Y(8), P.o); set(ex, Y(8), P.o); set(ex + 1, Y(9), P.o); set(ex + 2, Y(9), P.o); }
      else { set(ex + 2, Y(8), P.o); set(ex + 1, Y(8), P.o); set(ex, Y(9), P.o); set(ex - 1, Y(9), P.o); }
      return;
    }
    if (mood === 'e-wink') {
      if (left) { for (let yy = 10; yy <= 12; yy++) { set(ex, Y(yy), EYE); set(ex + 1, Y(yy), EYE); } set(ex, Y(10), '#ffffff'); }
      else { set(ex - 1, Y(12), EYE); set(ex, Y(11), EYE); set(ex + 1, Y(11), EYE); set(ex + 2, Y(12), EYE); }
      return;
    }
    if (mood === 'e-cool') {
      // sunglasses
      for (let dx = -2; dx <= 3; dx++) for (let y = 10; y <= 12; y++) set(ex + dx, Y(y), '#1f1a2e');
      set(ex - 1, Y(10), '#9aa6c8'); set(ex, Y(10), '#9aa6c8');
      return;
    }
    if (mood === 'love') {
      // heart eyes
      const HEART = '#ff3f74';
      [[0, 9], [2, 9], [-1, 10], [0, 10], [1, 10], [2, 10], [3, 10], [0, 11], [1, 11], [2, 11], [1, 12]].forEach(([dx, y]) => set(ex + dx, Y(y), HEART));
      set(ex - 1, Y(10), '#ffb3c8');
    } else if (mood === 'happy' || mood === 'eat') {
      set(ex - 1, Y(12), EYE); set(ex, Y(11), EYE); set(ex + 1, Y(11), EYE); set(ex + 2, Y(12), EYE);
    } else if (mood === 'sleepy' || mood === 'blink') {
      for (let i = -1; i <= 2; i++) set(ex + i, Y(12), EYE);
    } else if (mood === 'dizzy') {
      // spiral eyes
      [[0, 10], [1, 10], [-1, 11], [2, 11], [0, 12], [1, 12]].forEach(([dx, y]) => set(ex + dx, Y(y), EYE));
    } else if (mood === 'faint') {
      // X eyes
      [[-1, 10], [2, 10], [0, 11], [1, 11], [-1, 12], [2, 12]].forEach(([dx, y]) => set(ex + dx, Y(y), EYE));
    } else if (mood === 'bored') {
      for (let i = -1; i <= 2; i++) set(ex + i, Y(11), P.o);
      set(ex, Y(12), EYE); set(ex + 1, Y(12), EYE);
    } else if (mood === 'cough') {
      set(ex - 1, Y(11), EYE); set(ex, Y(12), EYE); set(ex + 1, Y(12), EYE); set(ex + 2, Y(11), EYE);
    } else if (mood === 'cry') {
      // squeezed-shut eyes
      set(ex - 1, Y(11), EYE); set(ex, Y(12), EYE); set(ex + 1, Y(12), EYE); set(ex + 2, Y(11), EYE);
    } else if (mood === 'hungry' || mood === 'thirsty') {
      // tired, half-closed eyes with a worried brow
      set(ex - 1, Y(11), EYE); set(ex, Y(11), EYE); set(ex + 1, Y(11), EYE); set(ex + 2, Y(11), EYE);
      set(ex, Y(12), EYE); set(ex + 1, Y(12), EYE);
      if (ex < 16) { set(ex - 1, Y(9), P.o); set(ex, Y(8), P.o); } else { set(ex + 2, Y(9), P.o); set(ex + 1, Y(8), P.o); }
    } else {
      for (let yy = 10; yy <= 12; yy++) { set(ex, Y(yy), EYE); set(ex + 1, Y(yy), EYE); }
      set(ex, Y(10), '#ffffff');
    }
  };
  eyes(10); eyes(20);
  // whiskers
  [[3, 13], [4, 13], [3, 15], [4, 15], [27, 13], [28, 13], [27, 15], [28, 15]].forEach(([x, y]) => { if (!g[Y(y)][x]) set(x, Y(y), P.o); });
  }
  if (back && !headOnly) drawTail();

  // outline pass
  const out = g.map((r) => r.slice());
  for (let y = 0; y < KH; y++) for (let x = 0; x < KW; x++) {
    if (g[y][x]) continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy] && g[y + dy][x + dx] && g[y + dy][x + dx] !== P.o);
    if (n) out[y][x] = P.o;
  }
  // inner outlines: body/paw/tail touching head, paws touching body
  for (let y = 0; y < KH; y++) for (let x = 0; x < KW; x++) {
    const r = region[y][x];
    const up = region[y - 1] ? region[y - 1][x] : null;
    if ((r === 'body' || r === 'tail') && up === 'head') out[y][x] = P.o;
    if (r === 'paw' && (up === 'body')) out[y][x] = P.o;
    if (r === 'paw' && (region[y][x - 1] === 'body' || region[y][x + 1] === 'body') && y < Y(30)) out[y][x] = P.o;
    if (r === 'tail' && (region[y][x - 1] === 'body' || region[y + 1]?.[x] === 'body')) out[y][x] = P.o;
  }
  // tears / sweat drop (drawn on top, after outlines)
  const T1 = '#7ec8f5', T2 = '#bfe6ff';
  if (mood === 'cry') {
    const drop = frame % 2;
    [[9, 13], [9, 14], [9, 15 + drop], [22, 13], [22, 14], [22, 15 + drop]].forEach(([x, y]) => { out[Y(y)][x] = T1; });
    [[10, 13], [21, 13]].forEach(([x, y]) => { out[Y(y)][x] = T2; });
  }
  if (mood === 'cough') {
    const f = frame % 2, C1 = '#ffffff', C2 = '#cfd6e0';
    const puff = f ? [[20, 16], [21, 16], [21, 15], [22, 15], [22, 16], [23, 15], [21, 17], [22, 17]] : [[19, 16], [20, 16], [20, 17], [21, 16]];
    puff.forEach(([x, y], i) => { if (out[Y(y)] && x < KW) out[Y(y)][x] = i % 3 ? C1 : C2; });
    // pale, greenish cheeks
    [[7, 14], [8, 14], [24, 14], [23, 14]].forEach(([x, y]) => { out[Y(y)][x] = '#b9dca8'; });
  }
  if (mood === 'dizzy') {
    const pos = [[7, -4], [16, -6], [25, -4], [12, -5], [21, -5]];
    const S = '#ffd23f', D = '#e0a524';
    [0, 1, 2].forEach((k) => {
      const [x, y] = pos[(k * 2 + frame) % pos.length];
      [[0, 0, S], [1, 0, D], [-1, 0, D], [0, 1, D], [0, -1, D]].forEach(([dx, dy, c]) => { const yy = Y(y) + dy; if (yy >= 0 && out[yy] && x + dx >= 0 && x + dx < KW) out[yy][x + dx] = c; });
    });
  }
  if (mood === 'e-cool') for (let x = 13; x <= 18; x++) out[Y(10)][x] = '#1f1a2e';
  if (mood === 'e-angry') [[26, 4], [28, 4], [27, 5], [26, 6], [28, 6], [25, 5], [29, 5]].forEach(([x, y]) => { if (out[Y(y)] && x < KW) out[Y(y)][x] = '#e8384f'; });
  if (mood === 'e-shy') [[6, 14], [7, 15], [8, 14], [9, 15], [22, 14], [23, 15], [24, 14], [25, 15]].forEach(([x, y]) => { out[Y(y)][x] = '#ff5d8a'; });
  if (mood === 'e-wow') [[27, 3], [27, 4], [27, 6]].forEach(([x, y]) => { if (out[Y(y)] && x < KW) out[Y(y)][x] = '#ffd23f'; });
  if (mood === 'thirsty' || mood === 'hungry') {
    [[27, 5], [26, 6], [27, 6], [28, 6], [26, 7], [27, 7], [28, 7], [27, 8]].forEach(([x, y]) => { out[Y(y)][x] = mood === 'thirsty' ? T1 : T2; });
    out[Y(6)][27] = '#ffffff';
  }
  // clothes: recolour the body; shoes: recolour the paws
  const body = equipped.body && ITEMS[equipped.body];
  if (body && body.paint) {
    for (let y = 0; y < KH; y++) for (let x = 0; x < KW; x++) {
      if (region[y][x] !== 'body' || out[y][x] === P.o) continue;
      const c = body.paint(x - 16, y - OY - 18, body.pal);
      if (c) out[y][x] = c;
    }
  }
  const feet = equipped.feet && ITEMS[equipped.feet];
  if (feet && feet.pal) {
    for (let y = 0; y < KH; y++) for (let x = 0; x < KW; x++) {
      if (region[y][x] !== 'paw' || out[y][x] === P.o) continue;
      const sole = !region[y + 1] || region[y + 1][x] !== 'paw';
      const top = !region[y - 1] || region[y - 1][x] !== 'paw';
      out[y][x] = sole ? feet.pal.b : (top && (x === 11 || x === 19) ? feet.pal.l : feet.pal.a);
    }
  }
  // accessories
  ['neck', 'face', 'head'].forEach((slot) => {
    const id = equipped[slot];
    const item = id && ITEMS[id];
    if (item && item.wear) stamp(out, item.art, item.pal, item.wear.x, item.wear.y);
  });
  return out;
}

function stamp(g, art, pal, ox, oy) {
  art.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.' || ch === ' ') return;
    const gy = oy + y, gx = ox + x;
    if (g[gy] && gx >= 0 && gx < g[gy].length) g[gy][gx] = pal[ch];
  }));
}

export function drawGrid(canvas, g, scale) {
  const h = g.length, w = g[0].length, dpr = window.devicePixelRatio || 1;
  canvas.width = w * scale * dpr; canvas.height = h * scale * dpr;
  canvas.style.width = w * scale + 'px'; canvas.style.height = h * scale + 'px';
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const s = scale * dpr;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!g[y][x]) continue;
    ctx.fillStyle = g[y][x];
    ctx.fillRect(Math.floor(x * s), Math.floor(y * s), Math.ceil(s), Math.ceil(s));
  }
}

export function artGrid(art, pal) {
  const w = Math.max(...art.map((r) => r.length));
  const g = grid(w, art.length);
  stamp(g, art, pal, 0, 0);
  return g;
}

// Render a sprite into a fresh <canvas> element sized `px` CSS pixels tall (approx)
export function spriteCanvas(id, px = 48) {
  const it = ITEMS[id];
  const c = document.createElement('canvas');
  c.className = 'sprite';
  const g = artGrid(it.art, it.pal);
  drawGrid(c, g, Math.max(1, Math.min(6, Math.floor(px / Math.max(g.length, g[0].length)))));
  return c;
}

// ---------- items ----------
const O = '#3a2a35';
export const ITEMS = {
  // ---- food (consumed) ----
  fish: { cat: 'food', name: '小鱼干', en: 'Fish snack', price: 8, hunger: 20, happy: 3,
    pal: { o: O, b: '#7ec3e8', d: '#4f97c7', w: '#fff', e: '#2b2140' },
    art: [
      '.....oooo.....',
      '...oobbbboo.oo',
      '..obbwebbbbobo',
      '.obbbbbbbbbbdo',
      '..obbddddbbobo',
      '...oobbbboo.oo',
      '.....oooo.....',
    ] },
  milk: { cat: 'food', name: '牛奶', en: 'Milk', price: 10, hunger: 15, water: 25, happy: 8,
    pal: { o: O, w: '#ffffff', g: '#dfe7f0', b: '#5fa8e8', r: '#f27a8f' },
    art: [
      '...oooo...',
      '...orro...',
      '..oowwoo..',
      '.owwwwwwo.',
      '.obbbbbbo.',
      '.obwwwwbo.',
      '.obwbbwbo.',
      '.obwwwwbo.',
      '.obbbbbbo.',
      '.owwwwwgo.',
      '..oooooo..',
    ] },
  bun: { cat: 'food', name: '包子', en: 'Steamed bun', price: 12, hunger: 28, happy: 4,
    pal: { o: O, w: '#fffaf0', s: '#ead9bf', p: '#f4a9b8' },
    art: [
      '....oooo....',
      '...owsswo...',
      '..owwswwwo..',
      '.owwwwwwwwo.',
      'owwpwwwwpwwo',
      'owwwwwwwwwso',
      'oswwwwwwwsso',
      '.oossssssoo.',
      '...oooooo...',
    ] },
  tuna: { cat: 'food', name: '金枪鱼罐头', en: 'Tuna can', price: 18, hunger: 40, happy: 8,
    pal: { o: O, g: '#c7ced8', l: '#e9edf2', r: '#e8576b', y: '#ffd35a', b: '#7ec3e8' },
    art: [
      '..oooooooo..',
      '.ollllllllo.',
      'oggggggggggo',
      'orrrrrrrrrro',
      'orrybbbbyrro',
      'orrbbbbbbrro',
      'orrybbbbyrro',
      'oggggggggggo',
      '.oooooooooo.',
    ] },
  cookie: { cat: 'food', name: '猫爪饼干', en: 'Paw cookie', price: 9, hunger: 8, happy: 15,
    pal: { o: O, c: '#e8b46a', d: '#b97a3a', p: '#7a4a2a' },
    art: [
      '...oooooo...',
      '..occccccо..'.replace('о', 'o'),
      '.occpccpcco.',
      'occccccccсco'.replace('с', 'c'),
      'occcppppccco',
      'occppppppcco',
      'occcppppccco',
      '.occcccccdo.',
      '..odddddddo.',
      '...oooooo...',
    ] },
  icecream: { cat: 'food', name: '冰淇淋', en: 'Ice cream', price: 14, hunger: 6, happy: 25,
    pal: { o: O, p: '#f7a6c4', w: '#fff3f7', r: '#e8576b', c: '#e8b46a', d: '#c08a45' },
    art: [
      '....oo....',
      '...orro...',
      '..oppppo..',
      '.opwppppo.',
      '.oppppppo.',
      '.oppppppo.',
      'oooooooooo',
      '.occdcdco.',
      '..ocdcdo..',
      '..odcdco..',
      '...ocdo...',
      '....oo....',
    ] },
  cake: { cat: 'food', name: '草莓蛋糕', en: 'Strawberry cake', price: 25, hunger: 30, happy: 30,
    pal: { o: O, w: '#fffaf3', p: '#f9c3d3', r: '#e8576b', g: '#6cbf5a', y: '#f3d29a' },
    art: [
      '.....og.....',
      '....orro....',
      '...orrrro...',
      '.oooooooooo.',
      'owwwwwwwwwwo',
      'oppppppppppo',
      'oyyyyyyyyyyo',
      'owwwwwwwwwwo',
      'oyyyyyyyyyyo',
      '.oooooooooo.',
    ] },
  mooncake: { cat: 'food', name: '月饼', en: 'Mooncake', price: 20, hunger: 30, happy: 18,
    pal: { o: O, c: '#d99a4a', l: '#f0c27a', d: '#a8682c' },
    art: [
      '...oooooo...',
      '..ollllllo..',
      '.olcccccclo.',
      'olccdccdccco'.slice(0, 12),
      'olcdccccdcco',
      'olccccccccdo',
      'olcdccccdcdo',
      'olccdccdccdo',
      '.occcccccdo.',
      '..odddddddo.',
      '...oooooo...',
    ] },

  water: { cat: 'food', name: '清水', en: 'Fresh water', price: 3, hunger: 0, water: 35, happy: 2,
    pal: { o: O, b: '#7ec8f5', l: '#d6f0ff', g: '#c7ced8', d: '#9aa4b2' },
    art: [
      '............',
      '.oooooooooo.',
      'olllbbbbbblo',
      'obbbbbbbbbbo',
      'oggggggggggo',
      '.odddddddddo',
      '..oooooooo..',
    ] },

  // ---- toiletries (used up) ----
  shampoo: { cat: 'toiletry', name: '洗发水', en: 'Shampoo', price: 12, hygiene: 50,
    pal: { o: O, p: '#ff9ec7', d: '#e86fa3', w: '#ffffff', b: '#7ec8f5' },
    art: [
      '...oooo...',
      '...owwo...',
      '....oo....',
      '..oooooo..',
      '.oppppppo.',
      '.opwwwwdo.',
      '.opwbbwdo.',
      '.opwwwwdo.',
      '.oppppppo.',
      '.oppppddo.',
      '..oooooo..',
    ] },
  comb: { cat: 'toiletry', name: '梳子', en: 'Comb', price: 5, hygiene: 20,
    pal: { o: O, b: '#c58bf0', l: '#e3c4fa' },
    art: [
      '..oooooooooo..',
      '.obbbbbbbbbbo.',
      '.obllllllllbo.',
      '.oooooooooooo.',
      '.o.o.o.o.o.o..',
      '.o.o.o.o.o.o..',
    ] },

  // ---- pharmacy (only when the kitten is ill) ----
  syrup: { cat: 'pharmacy', cures: 'cough', name: '止咳糖浆', en: 'Cough syrup', price: 30,
    pal: { o: O, r: '#d94a6a', p: '#f28aa3', w: '#ffffff', g: '#e8e0d0', b: '#7a4a2a' },
    art: [
      '...oooo...',
      '...obbo...',
      '...oooo...',
      '..owwwwo..',
      '.orrrrrro.',
      '.orpwwrro.',
      '.orwrrwro.',
      '.orpwwrro.',
      '.orrrrrro.',
      '.orrrrrpo.',
      '..oooooo..',
    ] },
  panadol: { cat: 'pharmacy', cures: 'dizzy', name: '头痛药 Panadol', en: 'Headache pills', price: 40,
    pal: { o: O, b: '#3f7fc0', l: '#9fd0ff', w: '#ffffff', r: '#e8576b' },
    art: [
      '.oooooooooo.',
      'obbbbbbbbbbo',
      'obwwwwwwwwbo',
      'obwowwwwowbo',
      'obwwwwwwwwbo',
      'obwowwwwowbo',
      'obwwwwwwwwbo',
      'obbbrrbbbbbo',
      '.oooooooooo.',
    ] },
  hospital: { cat: 'service', cures: 'faint', name: '送医院', en: 'Kitty hospital', price: 200,
    pal: { o: O, w: '#ffffff', g: '#dfe6ee', r: '#e8576b', b: '#7ec8f5' },
    art: [
      '....oooooo....',
      '....owrrwo....',
      '....orrrro....',
      '....owrrwo....',
      'oooooooooooooo',
      'owwwwwwwwwwwwo',
      'owbbwwbbwwbbwo',
      'owbbwwbbwwbbwo',
      'owwwwwwwwwwwwo',
      'owbbwwoowwbbwo',
      'owbbwwoowwbbwo',
      'oggggggggggggo',
      'oooooooooooooo',
    ] },

  // ---- special ----
  freeze: { cat: 'special', name: '连胜冰冻卡', en: 'Streak freeze', price: 60,
    pal: { o: '#2b4a7a', b: '#9fd8ff', l: '#e3f5ff', d: '#5aa8e8', w: '#ffffff' },
    art: [
      '....oooo....',
      '..oollbboo..',
      '.olwllbbbdo.',
      '.olllbbbbdo.',
      'olllbbwbbbdo',
      'ollbbbbwbbdo',
      'olbbbbwwbbdo',
      'obbbbbbbbbdo',
      '.obbbbbbbdo.',
      '.odbbbbbddo.',
      '..ooddddoo..',
      '....oooo....',
    ] },

  // ---- clothes (worn, kept) ----
  bow: { cat: 'wear', slot: 'head', name: '粉红蝴蝶结', en: 'Pink bow', price: 40,
    pal: { o: O, p: '#ff8fb3', d: '#e0628c', w: '#ffd3e2' },
    art: [
      'oo.....oo',
      'opoo.oopo',
      'opwpodppo',
      'oppodopdo',
      'opoo.oopo',
      'oo.....oo',
    ], wear: { x: 4, y: 3 } },
  crown: { cat: 'wear', slot: 'head', name: '小皇冠', en: 'Little crown', price: 120,
    pal: { o: O, y: '#ffd23f', d: '#e0a524', r: '#e8576b', b: '#5fa8e8' },
    art: [
      'o...o...o',
      'oyo.oyo.oyo'.slice(0, 9),
      'oyyoyyyoyo'.slice(0, 9),
      'oyyyyyyyo',
      'oyrybyryo',
      'oddddddd o'.replace(' ', '').slice(0, 9),
      'ooooooooo',
    ], wear: { x: 11, y: 0 } },
  flowers: { cat: 'wear', slot: 'head', name: '花环', en: 'Flower crown', price: 80,
    pal: { o: O, p: '#ff9ec4', y: '#ffd23f', w: '#ffffff', g: '#6cbf5a', b: '#8fc7ff' },
    art: [
      '.ooo...ooo...ooo..',
      'opypo.owywo.obybo.',
      '.opoggggoggggopogg'.slice(0, 18),
      '..ogg....g....ggo.',
    ], wear: { x: 7, y: 5 } },
  party: { cat: 'wear', slot: 'head', name: '派对帽', en: 'Party hat', price: 60,
    pal: { o: O, b: '#6fb8f0', y: '#ffd23f', p: '#ff8fb3', w: '#ffffff' },
    art: [
      '....ooo....',
      '....oyo....',
      '.....o.....',
      '....obo....',
      '...obbpo...',
      '...obpbo...',
      '..obybbbo..',
      '..obbbypo..',
      '.obpbbbbbo.',
      '.ooooooooo.',
    ], wear: { x: 16, y: -1 } },
  beret: { cat: 'wear', slot: 'head', name: '画家帽', en: 'Artist beret', price: 90,
    pal: { o: O, r: '#e8576b', d: '#b83a4e' },
    art: [
      '.......oo.......',
      '....ooorroooo...',
      '..oorrrrrrrrroo.',
      '.orrrrrrrrrrrrro',
      'oddrrrrrrrrrddo.',
      '.ooddddddddooo..',
    ], wear: { x: 8, y: 4 } },
  scarf: { cat: 'wear', slot: 'neck', name: '红围巾', en: 'Red scarf', price: 50,
    pal: { o: O, r: '#e8576b', d: '#b83a4e', w: '#ffffff' },
    art: [
      '.oooooooooooooo.',
      'orrwrrwrrwrrwrro',
      'oddddddddddrrrdo',
      '.oooooooooorrro.',
      '..........orwro.',
      '..........orrro.',
      '..........owwwo.',
      '...........ooo..',
    ], wear: { x: 8, y: 23 } },
  bell: { cat: 'wear', slot: 'neck', name: '铃铛项圈', en: 'Bell collar', price: 45,
    pal: { o: O, b: '#5fa8e8', d: '#3f7fc0', y: '#ffd23f', l: '#fff3a8' },
    art: [
      '.oooooooooooooo.',
      'obbbbbbbbbbbbbbo',
      '.oddddoyyoddddo.',
      '.......oyly.....'.replace('oyly', 'oyly').slice(0, 16),
      '.......oyyo.....',
      '........oo......',
    ], wear: { x: 8, y: 23 } },
  bowtie: { cat: 'wear', slot: 'neck', name: '领结', en: 'Bow tie', price: 35,
    pal: { o: O, b: '#e8576b', l: '#ff9aa8', k: '#b83a4e' },
    art: [
      'oo.....oo',
      'olbo.oblo',
      'olbbkbblo',
      'olbo.oblo',
      'oo.....oo',
    ], wear: { x: 12, y: 24 } },
  glasses: { cat: 'wear', slot: 'face', name: '圆眼镜', en: 'Round glasses', price: 55,
    pal: { o: '#2b2140', g: '#cfe9ff' },
    art: [
      '.oooo....oooo.',
      'o....oooo....o',
      'o....o..o....o',
      '.oooo....oooo.',
    ], wear: { x: 8, y: 15 } },
  hearts: { cat: 'wear', slot: 'face', name: '爱心墨镜', en: 'Heart shades', price: 75,
    pal: { o: '#2b2140', r: '#ff5c8a', l: '#ffb3c9' },
    art: [
      'oooo.oo..oooo.oo'.slice(0, 16),
      'orlroorooorlroor'.slice(0, 16),
      'orrrrrrooorrrrrr'.slice(0, 16),
      '.orrrro....orrro',
      '..orro......oro.',
      '...oo........o..',
    ], wear: { x: 8, y: 15 } },

  // ---- garden decorations (kept) ----
  cushion: { cat: 'decor', name: '软垫床', en: 'Cushion bed', price: 70, spot: 'under',
    pal: { o: O, p: '#f7a6c4', d: '#d9799e', w: '#ffe1ec' },
    art: [
      '.....oooooooooooooooooooo.....',
      '...oowwwwwwwwwwwwwwwwwwwwoo...',
      '.oowwppppppppppppppppppppwwoo.',
      'owwppppppppppppppppppppppppwwo',
      'oppppppppppppppppppppppppppppo',
      'odppppppppppppppppppppppppppdo',
      '.oddppppppppppppppppppppppddo.',
      '..oooddddddddddddddddddddooo..',
      '.....oooooooooooooooooooo.....',
    ] },
  yarn: { cat: 'decor', name: '毛线球', en: 'Yarn ball', price: 60, spot: 'toy-right', toy: true,
    pal: { o: O, b: '#7ab8f5', d: '#4f8fd4', l: '#c7e3ff' },
    art: [
      '...oooo....',
      '.oobbbboo..',
      'obldbbdbbo.',
      'obbldbbdbo.',
      'obdbldbbdo.',
      'obbdbbldbo.',
      '.obbdbbdo..',
      '..oooooo.ooo',
      '..........o',
    ] },
  sunflower: { cat: 'decor', name: '向日葵盆栽', en: 'Sunflower pot', price: 80, spot: 'plant',
    pal: { o: O, y: '#ffd23f', d: '#e0a524', b: '#7a4a2a', g: '#5aa84a', l: '#8fd17a', r: '#c8643a', p: '#e08a5a' },
    art: [
      '...o.ooo.o...',
      '..oyoyyyoyo..',
      '.oyyyyyyyyyo.',
      'oyyybbbbbyyyo',
      '.oyybbbbbyyo.',
      'oyyybbbbbyyyo',
      '.oyyyyyyyyyo.',
      '..oyoyoyoyo..',
      '...o.ogo.o...',
      '.....ogo.....',
      '..oo.ogo.....',
      '.olloogo.....',
      '..ooogo......',
      '.....ogo.oo..',
      '.....ogoollo.',
      '.....ogooo...',
      '...ooooooo...',
      '...orppppro..'.slice(0, 13),
      '...orrrrrro..'.slice(0, 13),
      '....orrrro...',
      '....oooooo...',
    ] },
  cathouse: { cat: 'decor', name: '小猫屋', en: 'Kitty house', price: 160, spot: 'house',
    pal: { o: O, r: '#e8576b', d: '#b83a4e', w: '#f6e7cf', s: '#dcc6a4', k: '#3a2a35', y: '#ffd23f' },
    art: [
      '..........oo..........',
      '........oorroo........',
      '......oorrrrrroo......',
      '....oorrrrrrrrrroo....',
      '..oorrrrrrrrrrrrrroo..',
      'oorrrrrrrrrrrrrrrrrroo',
      'oddddddddddddddddddddo',
      '.owwwwwwwwwwwwwwwwwwo.',
      '.owwwwwwwoooowwwwwwwo.',
      '.owwyywwokkkkowwwwwwo.',
      '.owwyywwokkkkowwwwwwo.',
      '.owwwwwwokkkkowwwwwwo.',
      '.owwwwwwokkkkowwwwwwo.',
      '.osssssskkkkkksssssso.'.slice(0, 22),
      '.oooooooooooooooooooo.',
    ] },
  lantern: { cat: 'decor', name: '中秋灯笼', en: 'Lantern', price: 90, spot: 'ceiling',
    pal: { o: O, r: '#e8576b', d: '#b83a4e', y: '#ffd23f', b: '#7a4a2a', l: '#ffe58a' },
    art: [
      '......o......',
      '......o......',
      '....ooooo....',
      '...oyyyyyo...',
      '.oorrrrrrroo.',
      'orrryrrryrrro',
      'orrlyrrrylrro',
      'orrlyrrrylrro',
      'orrryrrryrrro',
      '.oorrrrrrroo.',
      '...oyyyyyo...',
      '....ooooo....',
      '.....oyo.....',
      '.....oyo.....',
      '......o......',
    ] },
  mouse: { cat: 'decor', name: '玩具老鼠', en: 'Toy mouse', price: 50, spot: 'toy-left', toy: true,
    pal: { o: O, g: '#b8bcc8', p: '#f6a3b7', e: '#2b2140' },
    art: [
      '.....oo......',
      '....ogpo.....',
      '..oooggooo...',
      '.oegggggggo..',
      'opggggggggo..',
      '.oggggggggo.o',
      '..oooooooo.o.',
      '..........o..',
    ] },
};

// coin icon
export const COIN = {
  pal: { o: '#7a4a12', y: '#ffd23f', d: '#e0a524', w: '#fff3a8' },
  art: [
    '..oooo..',
    '.oyyyyo.',
    'oywyyddo',
    'oywyddyo'.replace('ddy', 'dyy'),
    'oyyyyydo',
    'oyyyyddo',
    '.odddo'.padEnd(7, 'o') + '.',
    '..oooo..',
  ],
};
export const HEART = {
  pal: { o: '#7a1f3a', r: '#ff5c8a', w: '#ffd0de' },
  art: ['.oo.oo.', 'orworro', 'orrrrro', '.orrro.', '..oro..', '...o...'],
};
export const FISHBONE = {
  pal: { o: '#7a4a12', y: '#ffb347', w: '#fff' },
  art: ['.oo..o..o..', 'oyyoooooooo', 'oyyoyyyyyyo'.slice(0, 11), '.oo..o..o..'],
};

// ---------- landscape ----------
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export function drawLandscape(canvas, opts = {}) {
  const cssW = canvas.clientWidth || window.innerWidth, cssH = canvas.clientHeight || window.innerHeight;
  const H = 150, W = Math.max(150, Math.round(H * cssW / cssH));
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const ctx = off.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;
  const R = rng(opts.seed || 7);
  const put = (x, y, c) => {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4, rgb = typeof c === 'string' ? hex(c) : c; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
    skyPix[y * W + x] = paintingSky ? 1 : 0;
  };
  const horizon = Math.round(H * (opts.horizon || 0.56));
  const night = !!opts.night;
  const skyPix = new Uint8Array(W * H);   // which pixels are sky (at night everything else gets darker)
  let paintingSky = true;
  const putT = put;

  // sky bands with dithering
  const wx = opts.weather || null, wet = wx === 'rain' || wx === 'storm', grey = wx === 'cloud' || wx === 'snow';
  const sky = night
    ? (wet ? ['#0a0d1e', '#0e1226', '#12172e', '#171d37', '#1c2340', '#222a4a'] : ['#0b1035', '#10174a', '#161f5a', '#1d286a', '#25337a', '#2f3f8a'])
    : wet ? ['#56637a', '#5f6d84', '#69788e', '#748399', '#7f8ea3', '#8b9aae']
    : grey ? ['#5a83bd', '#6891c6', '#779fcf', '#87add7', '#98bbde', '#aac9e4']
    : ['#3a78d4', '#4a8ade', '#5c9de6', '#73b2ec', '#8cc6f0', '#a6d8f3'];
  const band = Math.ceil(horizon / sky.length);
  for (let y = 0; y < horizon + 10; y++) for (let x = 0; x < W; x++) {
    let b = Math.min(sky.length - 1, Math.floor(y / band));
    const into = y % band;
    if (into < 2 && b > 0 && (x + y) % 2 === 0) b -= 1;
    putT(x, y, sky[b]);
  }
  if (night) {
    // stars (some twinkle brighter) and a crescent moon
    const S = rng(31);
    for (let i = 0; i < W * (wet ? 0 : grey ? 0.25 : 0.6); i++) {
      const x = Math.floor(S() * W), y = Math.floor(S() * horizon * 0.85);
      const c = S() < 0.25 ? '#ffe9a8' : '#ffffff';
      putT(x, y, c);
      if (S() < 0.12) { putT(x - 1, y, '#8fa0d8'); putT(x + 1, y, '#8fa0d8'); putT(x, y - 1, '#8fa0d8'); putT(x, y + 1, '#8fa0d8'); }
    }
    const mx = Math.round(W * (opts.moonX ?? 0.34)), my = Math.round(horizon * (opts.moonY ?? 0.2)), mr = Math.max(6, Math.round(H * 0.06));
    if (!wet) for (let y = my - mr - 3; y <= my + mr + 3; y++) for (let x = mx - mr - 3; x <= mx + mr + 3; x++) {
      const d1 = Math.hypot(x - mx, y - my), d2 = Math.hypot(x - (mx + mr * 0.75), y - (my - mr * 0.45));
      if (d1 <= mr && d2 > mr * 0.78) putT(x, y, d1 > mr - 1.2 ? '#f3d77a' : '#fff4c2');
      else if (d1 <= mr + 2.5 && d1 > mr && d2 > mr * 0.85 && (x + y) % 2 === 0) putT(x, y, '#3a4890');   // soft glow
    }
  }
  if (!night && wx === 'sun') {
    // a big friendly sun with rays
    const sx = Math.round(W * (opts.moonX ?? 0.34)), sy = Math.round(horizon * (opts.moonY ?? 0.2)), sr = Math.max(6, Math.round(H * 0.06));
    for (let y = sy - sr * 2; y <= sy + sr * 2; y++) for (let x = sx - sr * 2; x <= sx + sr * 2; x++) {
      const dd = Math.hypot(x - sx, y - sy), a = Math.atan2(y - sy, x - sx);
      if (dd <= sr) putT(x, y, dd > sr - 1.3 ? '#ffb627' : dd < sr * 0.45 ? '#fff6b0' : '#ffd84a');
      else if (dd <= sr * 1.75 && dd > sr + 1.5 && Math.abs(((a / (Math.PI / 4)) % 1 + 1) % 1 - 0.5) > 0.38) putT(x, y, '#ffd84a');
    }
  }
  // clouds (their own random numbers, so the trees and flowers stay put whatever the weather)
  const RC = rng(13);
  const cloud = (cx, cy, size) => {
    const puffs = [];
    const n = 4 + Math.floor(RC() * 4);
    for (let i = 0; i < n; i++) puffs.push([cx + (RC() - 0.5) * size * 2.6, cy + (RC() - 0.5) * size * 0.5, size * (0.45 + RC() * 0.5)]);
    for (let y = Math.floor(cy - size * 1.5); y < cy + size; y++) for (let x = Math.floor(cx - size * 3); x < cx + size * 3; x++) {
      let inside = false, shade = false;
      for (const [px, py, r] of puffs) {
        const dx = x - px, dy = (y - py) * 1.25;
        if (dx * dx + dy * dy < r * r) { inside = true; if (y > py + r * 0.25) shade = true; }
      }
      if (y > cy + size * 0.35) continue; // flat bottom
      if (inside) putT(x, y, night ? (wet ? (shade ? '#1a1f33' : '#262c45') : (shade ? '#2a3570' : '#3d4a86'))
        : wet ? (shade ? '#6f7a8e' : '#8a94a6') : grey ? (shade ? '#c3cfdb' : '#e6edf3') : (shade ? '#d3ecfa' : '#ffffff'));
    }
  };
  const nClouds = Math.round(W / 38 * (wet ? 2.6 : grey ? 1.9 : wx === 'sun' ? 0.6 : 1));
  for (let i = 0; i < nClouds; i++) cloud(RC() * W, 10 + RC() * (horizon * 0.55), 4 + RC() * 6);
  paintingSky = false;

  // ridge helper (midpoint displacement)
  const ridge = (base, amp, rough, seedShift) => {
    const pts = new Array(W + 1).fill(0);
    let step = 64; const pr = rng(seedShift);
    const n = Math.ceil(W / step) + 1; const anchors = [];
    for (let i = 0; i < n; i++) anchors.push(base - pr() * amp);
    for (let x = 0; x <= W; x++) {
      const i = Math.floor(x / step), t = (x % step) / step;
      const a = anchors[i], b = anchors[Math.min(n - 1, i + 1)];
      const tri = Math.abs(((x / step) % 1) - 0.5) * 2; // 1 at anchors, 0 at mid
      pts[x] = a + (b - a) * t - (1 - tri) * amp * 0.35 * (pr() * 0.2 + 0.9) + (pr() - 0.5) * rough;
    }
    return pts;
  };
  // far mountains (peaky)
  const peaks = (count, base, height, seed, light, dark, snow) => {
    const pr = rng(seed); const list = [];
    for (let i = 0; i < count; i++) list.push([pr() * W, height * (0.55 + pr() * 0.45), 0.8 + pr() * 0.5]);
    for (let x = 0; x < W; x++) {
      let top = base, which = null;
      for (const p of list) { const h = base - (p[1] - Math.abs(x - p[0]) * p[2]); if (h < top) { top = h; which = p; } }
      top = Math.round(top + (pr() < 0.3 ? 1 : 0));
      for (let y = top; y < horizon + 12; y++) {
        const lit = which && x < which[0];
        let c = lit ? light : dark;
        if (snow && which && y < top + 3 && which[1] > height * 0.85) c = '#eef6fb';
        put(x, y, c);
      }
    }
  };
  peaks(Math.max(3, Math.round(W / 55)), horizon + 4, horizon * 0.62, 11, '#6f9fc4', '#5a8ab3', false);
  peaks(Math.max(3, Math.round(W / 70)), horizon + 6, horizon * 0.5, 29, '#4f8a76', '#386f62', false);

  // pine tree helper
  const pine = (x0, yb, h, c1, c2) => {
    for (let y = 0; y < h; y++) {
      const tier = (y % Math.max(3, Math.round(h / 4)));
      const w = Math.round((y / h) * h * 0.38 + tier * 0.4);
      for (let dx = -w; dx <= w; dx++) put(x0 + dx, yb - h + y, dx < 0 ? c1 : c2);
    }
    put(x0, yb, '#4a3326'); put(x0, yb + 1, '#4a3326');
  };
  // tree line
  for (let x = 0; x < W; x += 3 + Math.floor(R() * 3)) {
    pine(x, horizon + 4 + Math.floor(R() * 2), 6 + Math.floor(R() * 6), '#2f6b4a', '#245a3e');
  }
  // meadow
  const g1 = '#6db35c', g2 = '#5fa252', g3 = '#7cc169', g4 = '#4f9147';
  for (let y = horizon + 4; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (y - horizon) / (H - horizon);
    let c = t < 0.15 ? g2 : t < 0.5 ? g1 : g3;
    const n = Math.sin(x * 0.11 + y * 0.31) + Math.sin(x * 0.047 - y * 0.2) * 1.3;
    if (n > 1.9) c = g4; else if (n < -1.8) c = g3;
    if ((t > 0.12 && t < 0.17) && (x + y) % 2 === 0) c = g1;
    put(x, y, c);
  }
  // big side trees
  const sideTree = (x, h) => pine(x, horizon + 22 + Math.floor(R() * 8), h, '#3a7d55', '#2b6646');
  for (let i = 0; i < 3; i++) sideTree(4 + i * 9 + R() * 5, 20 + R() * 12);
  for (let i = 0; i < 3; i++) sideTree(W - 6 - i * 9 - R() * 5, 20 + R() * 12);
  // grass tufts + flowers
  const flowerCols = [['#f08bb8', '#ffe27a'], ['#ffffff', '#ffd23f'], ['#c58bf0', '#ffe27a']];
  for (let i = 0; i < W * 0.9; i++) {
    const x = Math.floor(R() * W), y = horizon + 10 + Math.floor(R() * (H - horizon - 12));
    if (R() < 0.55) { put(x, y, g4); put(x - 1, y - 1, g4); put(x + 1, y - 1, g4); }
    else {
      const [p, c] = flowerCols[Math.floor(R() * (R() < 0.7 ? 1 : 3))];
      put(x, y + 1, g4); put(x, y, c); put(x - 1, y, p); put(x + 1, y, p); put(x, y - 1, p);
    }
  }
  if (!night && wet) {
    // a rainy day: everything a bit darker
    for (let k = 0; k < W * H; k++) { if (skyPix[k]) continue; const i = k * 4; d[i] *= 0.78; d[i + 1] *= 0.8; d[i + 2] *= 0.86; }
  }
  if (night) {
    // moonlight: the hills, trees and meadow turn dark blue
    for (let k = 0; k < W * H; k++) {
      if (skyPix[k]) continue;
      const i = k * 4;
      d[i] = d[i] * 0.36 + 6; d[i + 1] = d[i + 1] * 0.42 + 10; d[i + 2] = d[i + 2] * 0.62 + 34;
    }
  }
  ctx.putImageData(img, 0, 0);

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  const out = canvas.getContext('2d');
  out.imageSmoothingEnabled = false;
  out.drawImage(off, 0, 0, canvas.width, canvas.height);
  return { horizon: horizon / H };
}

export function itemEffect(it) {
  const parts = [];
  if (it.hunger) parts.push(`+${it.hunger} 饱`);
  if (it.water) parts.push(`+${it.water} 💧`);
  if (it.happy) parts.push(`+${it.happy} ❤`);
  if (it.hygiene) parts.push(`+${it.hygiene} 🛁`);
  return parts.join(' · ');
}

export const TOMB = {
  pal: { o: '#2e2a3a', s: '#9aa1ad', l: '#c3c8d1', d: '#717887', g: '#4f8f48', f: '#ff9ec4', y: '#ffd23f' },
  art: [
    '.....oooooooo.....',
    '...oolllssssssoo..',
    '..olllssssssssddo.',
    '..ollssssssssssdo.',
    '..ollssdssdsssddo.',
    '..ollsdssssdssddo.',
    '..ollsssddssssddo.',
    '..ollssddddsssddo.',
    '..ollsssddssssddo.',
    '..ollssssssssssdo.',
    '..ollssssssssssdo.',
    '..ollsssssssssddo.',
    '.oooooooooooooooo.',
    'oggggggggggggggggo',
    'ogfggggyggggggfggo',
    'oooooooooooooooooo',
  ],
};

// ---------- home furniture ----------
Object.assign(ITEMS, {
  sofa: { cat: 'decor', name: '沙发', en: 'Sofa', price: 150, spot: 'back-right',
    pal: { o: O, r: '#6cc3b8', d: '#3f948b', l: '#a6e3da', w: '#7a4a2a', p: '#ff9ec4', y: '#ffd23f' },
    art: [
      '..................................',
      '..................................',
      '.oooooooooooooooooooooooooooooooo.',
      'oddddddddddddddddddddddddddddddddo',
      'odrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrdo',
      'odrrrrrrrrppppprrrryyyyyrrrrrrrrdo',
      'odrrrrrrrrppppprrrryyyyyrrrrrrrrdo',
      'olllllrrrrppppprrrryyyyyrrrrlllllo',
      'olllllrrrrrrrrrrrrrrrrrrrrrrlllllo',
      'orrrrrlllllllllldlllllllllllrrrrro',
      'orrrrrrrrrrrrrrrdrrrrrrrrrrrrrrrro',
      'orrrrrrrrrrrrrrrdrrrrrrrrrrrrrrrro',
      'orrrrrrrrrrrrrrrdrrrrrrrrrrrrrrrro',
      'orrrrrrrrrrrrrrrdrrrrrrrrrrrrrrrro',
      '.owwoooooooooooooooooooooooooowwo.',
      '.owwo........................owwo.',
      '..oo..........................oo..',
    ] },
  bookshelf: { cat: 'decor', name: '书架', en: 'Bookshelf', price: 130, spot: 'back-left',
    pal: { o: O, w: '#b07a48', d: '#6b4426', r: '#e8576b', b: '#5fa8e8', g: '#5cc46e', y: '#ffd23f', p: '#c58bf0' },
    art: [
      '.oooooooooooooooo.',
      'owwwwwwwwwwwwwwwwo',
      'owdddddddppbbdrdwo',
      'owgdddppdppbbdrdwo',
      'owgppdppdppbbdrdwo',
      'owgppdppdppbbdrdwo',
      'owgppdppdppbbdrdwo',
      'owgppdppdppbbdrdwo',
      'owwwwwwwwwwwwwwwwo',
      'owdddyybbdggddddwo',
      'owpdyyybbdggppggwo',
      'owpdyyybbbggppggwo',
      'owpdyyybbbggppggwo',
      'owpdyyybbbggppggwo',
      'owpdyyybbbggppggwo',
      'owwwwwwwwwwwwwwwwo',
      'owdddddddrrbdrrdwo',
      'owppddggdrrbdrrdwo',
      'owppbbggdrrbdrrdwo',
      'owppbbggdrrbdrrdwo',
      'owppbbggdrrbdrrdwo',
      'owppbbggdrrbdrrdwo',
      'owwwwwwwwwwwwwwwwo',
      'owddddddddddddddwo',
      'owddppdrdddbbggdwo',
      'owyyppdrdbbbbggdwo',
      'owyyppdrdbbbbggdwo',
      'owyyppdrdbbbbggdwo',
      'owyyppwrwbbbbggwwo',
      '.owwwwwwwwwwwwwwo.',
    ] },
  lamp: { cat: 'decor', name: '落地灯', en: 'Floor lamp', price: 70, spot: 'back-mid-left',
    pal: { o: O, y: '#ffe58a', l: '#fff6c8', d: '#e0b84a', k: '#5a4d6e' },
    art: [
      '.oooooooooo.',
      'oyllllllllyo',
      'oyyyyyyyyyyo',
      'oyyyyyyyyyyo',
      'oyyyyyyyyyyo',
      'oyyyyyyyyyyo',
      'oyyyyyyyyyyo',
      'oddddddddddo',
      '.ooookkoooo.',
      '....okko....',
      '....okko....',
      '....okko....',
      '....okko....',
      '....okko....',
      '....okko....',
      '....okko....',
      '....okko....',
      '....okko....',
      '....okko....',
      '....okko....',
      '....okko....',
      '....okko....',
      '....okko....',
      '....okko....',
      '....okko....',
      '....okko....',
      '..oookkooo..',
      '.okkkkkkkko.',
      '.okkkkkkkko.',
      '..oooooooo..',
    ] },
  painting: { cat: 'decor', name: '挂画', en: 'Painting', price: 60, spot: 'wall-left',
    pal: { o: O, w: '#c9963c', s: '#bfe6ff', g: '#6db35c', h: '#4f9147', y: '#ffd23f' },
    art: [
      '.oooooooooooooooooo.',
      'owwwwwwwwwwwwwwwwwwo',
      'owwwwwwwwwwwwwwwwwwo',
      'owwssssssssssyysswwo',
      'owwsssssssssyyyyswwo',
      'owwsssssssssyyyyswwo',
      'owwsssssssshhyysswwo',
      'owwsggggghhhhhhhhwwo',
      'owwgggggghhhhhhhhwwo',
      'owwgggggghhhhhhhhwwo',
      'owwgggggghhhhhhhhwwo',
      'owwgggggggghhhhggwwo',
      'owwggggggggggggggwwo',
      'owwwwwwwwwwwwwwwwwwo',
      'owwwwwwwwwwwwwwwwwwo',
      '.oooooooooooooooooo.',
    ] },
  clock: { cat: 'decor', name: '挂钟', en: 'Wall clock', price: 50, spot: 'wall-right',
    pal: { o: O, w: '#e8576b', f: '#fffaf0', k: '#2b2140', r: '#e8576b' },
    art: [
      '....oooooo....',
      '..oowwwwwwoo..',
      '.owwfffkffwwo.',
      '.owffffffffwo.',
      'owfffffkffffwo',
      'owfffffkffffwo',
      'owfffffkffffwo',
      'owkffffrrrffko',
      'owffffffffffwo',
      'owffffffffffwo',
      '.owffffffffwo.',
      '.owwffffffwwo.',
      '..oowwwkwwoo..',
      '....oooooo....',
    ] },
  rug: { cat: 'decor', name: '圆地毯', en: 'Round rug', price: 60, spot: 'rug',
    pal: { o: O, r: '#c58bf0', p: '#f7c6e0', y: '#fff3a8' },
    art: [
      '......oooooooorrrrrrrrrrrroooooooo......',
      '...ooorrrrrrrrrrrrrrrrrrrrrrrrrrrrooo...',
      '.oorrrrrpppppppppppppppppppppppprrrrroo.',
      'orrrrppppppyyyyyyyyyyyyyyyyyypppppprrrro',
      'rrrrpppppyyyyyyyyyyyyyyyyyyyyyyppppprrrr',
      'orrrrppppppyyyyyyyyyyyyyyyyyypppppprrrro',
      '.oorrrrrpppppppppppppppppppppppprrrrroo.',
      '...ooorrrrrrrrrrrrrrrrrrrrrrrrrrrrooo...',
      '......oooooooorrrrrrrrrrrroooooooo......',
    ] },
  curtains: { cat: 'decor', name: '窗帘', en: 'Curtains', price: 55, spot: 'curtain',
    pal: { o: O, w: '#b07a48', r: '#ff9ec4', d: '#e0628c', y: '#ffd23f' },
    art: [
      'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'orrrrrrrrroooooooooooooooorrrrrrrrro',
      'ordrrdrrdro..............ordrrdrrdro',
      'ordrrdrrdro..............ordrrdrrdro',
      'ordrrdrrdro..............ordrrdrrdro',
      'ordrrdrrdro..............ordrrdrrdro',
      'ordrrdrrdro..............ordrrdrrdro',
      'ordrrdrrdro..............ordrrdrrdro',
      'ordrrdrrdro..............ordrrdrrdro',
      'ordrrdrrdro..............ordrrdrrdro',
      'ordrrdrrdro..............ordrrdrrdro',
      'oyyyyyyyyyo..............oyyyyyyyyyo',
      'oyyyyyyyyyo..............oyyyyyyyyyo',
      'ordrrdrrdro..............ordrrdrrdro',
      'ordrrdrrdro..............ordrrdrrdro',
      'ordrrdrrdro..............ordrrdrrdro',
      'ordrrdrrdro..............ordrrdrrdro',
      'ordrrdrrdro..............ordrrdrrdro',
      'ordrrdrrdro..............ordrrdrrdro',
      'ordrrdrrdro..............ordrrdrrdro',
      'ordrrdrrdro..............ordrrdrrdro',
      'ordrrdrrdro..............ordrrdrrdro',
      'ordrrdrrdro..............ordrrdrrdro',
      '.ooooooooo................ooooooooo.',
      '....................................',
    ] },
  table: { cat: 'decor', name: '小茶桌', en: 'Tea table', price: 80, spot: 'front-left',
    pal: { o: O, w: '#c9905a', l: '#e6b483', d: '#8a5a32', b: '#7ec3e8', c: '#ffffff' },
    art: [
      '.......obbbo..........',
      '......obbbbo..........',
      '.....obbbbbboo.ooo....',
      '.....obbbbbbbboccco...',
      '.....obbbbbboooccco...',
      '.oooooobbbboooocccooo.',
      'owllllllllllllllllllwo',
      'owwwwwwwwwwwwwwwwwwwwo',
      'owwwwwwwwwwwwwwwwwwwwo',
      '.ooddooooooooooooddoo.',
      '..oddo..........oddo..',
      '..oddo..........oddo..',
      '..oddo..........oddo..',
      '..oddo..........oddo..',
      '..oddo..........oddo..',
      '...oo............oo...',
    ] },
  cattree: { cat: 'decor', name: '猫爬架', en: 'Cat tree', price: 140, spot: 'front-right',
    pal: { o: O, t: '#c9905a', s: '#e8d3a8', d: '#c4ad80', p: '#ff9ec4', k: '#5a4d6e', y: '#ffd23f' },
    art: [
      '.oppppo...........',
      '.oppppo...........',
      '.oppppo...........',
      '.oppppoooo........',
      'ottttttttto.......',
      'ottttttttto.......',
      'otttttttttso......',
      '.ooooooddddo......',
      '......osssso......',
      '......osssso......',
      '......oddddo......',
      '......osssso......',
      '......osssso......',
      '......oddddo......',
      '......ossssoooooo.',
      '......osstttttttto',
      '......oddtttttttto',
      '......osstttttttto',
      '......ossssokoooo.',
      '......oddddoko....',
      '......ossssoko....',
      '.oooooossssyyo....',
      'ottttttttddyyo....',
      'ottttttttssoo.....',
      'ottttttttsso......',
      '.ooooooddddo......',
      '......osssso......',
      '......osssso......',
      '......oddddo......',
      '..ooooossssooooo..',
      '.otttttttttttttto.',
      '.otttttttttttttto.',
      '.otttttttttttttto.',
      '..oooooooooooooo..',
    ] },
  fishtank: { cat: 'decor', name: '鱼缸', en: 'Fish tank', price: 120, spot: 'back-mid-right',
    pal: { o: O, b: '#8fd0f5', l: '#d6f0ff', s: '#e8d3a8', w: '#7a4a2a', y: '#ffb020', r: '#ef5d73', k: '#2b2140', g: '#5cc46e' },
    art: [
      '......................',
      '.oooooooooooooooooooo.',
      'ollllllllllllllllllllo',
      'ollllllllllllllllllllo',
      'obbbbbbbbbbbbbbbbbbbbo',
      'obbbbbbbbbbbbbbbbbbbbo',
      'obbbbyyyybybbbbbbbgbbo',
      'obbbbykyybybbbbbbbgbbo',
      'obbbgbbbbbybbrrrrbggbo',
      'obbggbbbbbbbbrkrrrgbbo',
      'obbbgbbbbbbbbbbbbbgbbo',
      'obbbgbbbbbbbbbbbbbgbbo',
      'osssssssssssssssssssso',
      'osssssssssssssssssssso',
      'owwwwwwwwwwwwwwwwwwwwo',
      'owwwwwwwwwwwwwwwwwwwwo',
      'owwwwwwwwwwwwwwwwwwwwo',
      '.oooooooooooooooooooo.',
    ] },
  tv: { cat: 'decor', name: '电视', en: 'TV', price: 160, spot: 'shelf',
    pal: { o: O, k: '#3a3a4a', s: '#8fd0f5', g: '#6db35c', y: '#ffd23f', w: '#7a4a2a' },
    art: [
      '.oooooooooooooooooooooo.',
      'okkkkkkkkkkkkkkkkkkkkkko',
      'okkkkkkkkkkkkkkkkkkkkkko',
      'okksssssssssssssssssskko',
      'okksssssssssssssssssskko',
      'okkssssyysssssssssssskko',
      'okksssyyyyssssssssssskko',
      'okksssyyyyssssssssssskko',
      'okkssssyysssssssssssskko',
      'okkggggggggggggggggggkko',
      'okkggggggggggggggggggkko',
      'okkggggggggggggggggggkko',
      'okkggggggggggggggggggkko',
      'okkkkkkkkkkkkkkkkkkkkkko',
      'okkkkkkkkkkkkkkkkkkkkkko',
      '.oooooooookkkkooooooooo.',
      '......ooookkkkoooo......',
      '.....owwwwwwwwwwwwo.....',
      '.....owwwwwwwwwwwwo.....',
      '......oooooooooooo......',
    ] },
});

// ---------- clothes, shoes and hair accessories ----------
// shop icons are drawn from shared templates in each item's colours
const SHIRT = [
  '..oo....oo..',
  '.oaao..oaao.',
  'oaaaaooaaaao',
  'oaaaabbaaaao',
  '.ooaaaaaaoo.',
  '..oaaaaaao..',
  '..oaacaaao..',
  '..oaaaaaao..',
  '..occcccco..',
  '..oooooooo..',
];
const DRESS = [
  '...oo..oo...',
  '..oaaooaao..',
  '..oaaaaaao..',
  '..oaabbaao..',
  '..oaaaaaao..',
  '.oaaaaaaaao.',
  '.oaacaacaao.',
  'oaaaaaaaaaao',
  'occcccccccco',
  'oooooooooooo',
];
const SHOE = [
  '............',
  '..ooooo.....',
  '.oaaaaao....',
  '.oalaaaaooo.',
  'oaaaaaaaaaao',
  'obbbbbbbbbbo',
  '.oooooooooo.',
];
const wearBody = (id, name, en, price, pal, paint, tpl = SHIRT) => [id, { cat: 'wear', slot: 'body', name, en, price, pal: { o: O, ...pal }, art: tpl, paint }];
const wearFeet = (id, name, en, price, pal) => [id, { cat: 'wear', slot: 'feet', name, en, price, pal: { o: O, ...pal }, art: SHOE }];
Object.assign(ITEMS, Object.fromEntries([
  wearBody('tshirt', '蓝色T恤', 'Blue T-shirt', 45, { a: '#5fa8e8', b: '#ffffff', c: '#3f7fc0' },
    (x, y, p) => (y === 4 || y === 5 ? p.b : p.a)),
  wearBody('sailor', '水手服', 'Sailor top', 70, { a: '#ffffff', b: '#2f4f8f', c: '#e8576b' },
    (x, y, p) => (y <= 2 ? p.b : (y >= 3 && y <= 5 && (x === 0 || x === -1)) ? p.c : y >= 11 ? p.b : p.a)),
  wearBody('dress', '粉色连衣裙', 'Pink dress', 80, { a: '#ff9ec4', b: '#ffffff', c: '#ffffff' },
    (x, y, p) => (y >= 11 ? p.c : (y > 3 && (x + y * 3) % 4 === 0) ? p.b : p.a), DRESS),
  wearBody('raincoat', '黄色雨衣', 'Yellow raincoat', 65, { a: '#ffd23f', b: '#7a4a12', c: '#e0a524' },
    (x, y, p) => (x === 0 && y % 3 === 1 ? p.b : x === 0 || y >= 12 ? p.c : p.a)),
  wearBody('hoodie', '灰色卫衣', 'Grey hoodie', 60, { a: '#aab3c2', b: '#8a93a3', c: '#ffffff' },
    (x, y, p) => ((x === -1 || x === 1) && y <= 3 ? p.c : (y >= 7 && y <= 9 && Math.abs(x) <= 3) ? p.b : p.a)),
  wearBody('qipao', '小旗袍', 'Little qipao', 120, { a: '#e8394f', b: '#ffd23f', c: '#ffd23f' },
    (x, y, p) => (y === 0 ? p.b : (x === y - 1 && y <= 5) ? p.c : ((x * 3 + y * 5) % 9 === 0 ? p.b : p.a)), DRESS),
  // princess gown: only from the 10-day check-in mystery box (not sold in the shop, wearable at any level)
  wearBody('princess', '公主裙', 'Princess gown', 300, { a: '#f7a8d8', b: '#ffd23f', c: '#fde3f3', d: '#c86fb0', w: '#ffffff' },
    (x, y, p) => (y === 0 ? p.b
      : y <= 3 ? (x === 0 ? p.b : (Math.abs(x) >= 4 ? p.c : p.a))
      : y === 4 ? p.b
      : y >= 11 ? ((x + y) % 2 ? p.b : p.d)
      : ((x + y * 2) % 7 === 0 && y > 5) ? p.w
      : (y % 3 === 1 ? p.c : p.a)), DRESS),
  // purple "spooky-cute" set
  wearBody('lacedress', '紫色蕾丝裙', 'Purple lace dress', 110, { a: '#9b6bd6', b: '#2f2440', c: '#ffffff', d: '#6a3fb0' },
    (x, y, p) => (y === 0 ? p.c
      : y <= 3 ? (x === 0 ? p.a : p.b)
      : y === 4 ? p.d
      : y >= 11 ? ((x + y) % 2 ? p.c : p.b)
      : ((x + y) % 5 === 0 ? p.d : p.a)), DRESS),
  wearBody('uniform', '校服', 'School uniform', 75, { a: '#ffffff', b: '#2f4f8f', c: '#2f4f8f' },
    (x, y, p) => (y >= 7 ? p.b : (x === 0 && y >= 1 && y <= 4) ? p.b : p.a)),
  wearFeet('sneakers', '红色球鞋', 'Red sneakers', 40, { a: '#e8576b', b: '#ffffff', l: '#ffb3c0' }),
  wearFeet('boots', '黄色雨靴', 'Rain boots', 45, { a: '#ffd23f', b: '#a8781a', l: '#fff3a8' }),
  wearFeet('flats', '芭蕾鞋', 'Ballet flats', 50, { a: '#ff9ec4', b: '#d65f89', l: '#ffd6e6' }),
  wearFeet('schoolshoes', '白色校鞋', 'School shoes', 35, { a: '#ffffff', b: '#8a93a3', l: '#dfe6ee' }),
  wearFeet('purpleboots', '紫色小靴', 'Purple boots', 50, { a: '#9b6bd6', b: '#2f2440', l: '#d9c4ff' }),
  wearFeet('slippers', '毛绒拖鞋', 'Fluffy slippers', 30, { a: '#c9a7f0', b: '#9a78c8', l: '#efe2ff' }),
]));
ITEMS.clip = { cat: 'wear', slot: 'head', name: '星星发夹', en: 'Star hair clip', price: 30,
  pal: { o: O, y: '#ffd23f', d: '#e0a524' },
  art: [
    '..o..',
    '.oyo.',
    'oyyyo',
    '.ydy.',
    'oo.oo',
  ], wear: { x: 22, y: 7 } };
ITEMS.headband = { cat: 'wear', slot: 'head', name: '草莓发箍', en: 'Strawberry headband', price: 55,
  pal: { o: O, r: '#e8394f', g: '#5cc46e', w: '#ffffff', p: '#ff9ec4' },
  art: [
    '....ogo.......ogo....',
    '...orwro.....orwro...',
    '...orrro.....orrro...',
    'ooooorooooooooorooooo',
    'opppppppppppppppppppo',
    'ooooooooooooooooooooo',
  ], wear: { x: 5, y: 7 } };

ITEMS.devilhorns = { cat: 'wear', slot: 'head', name: '小恶魔角', en: 'Little devil horns', price: 45,
  pal: { o: O, p: '#9b6bd6', d: '#6a3fb0', k: '#3a2a5a' },
  art: [
    '......o.......o......',
    '.....opo.....opo.....',
    '.....oppo...oppo.....',
    '....opdpo...opdpo....',
    'ooooooooooooooooooooo',
    'okkkkkkkkkkkkkkkkkkko',
    'ooooooooooooooooooooo',
  ], wear: { x: 5, y: 5 } };
ITEMS.batbow = { cat: 'wear', slot: 'head', name: '蝙蝠蝴蝶结', en: 'Bat-wing bow', price: 60,
  pal: { o: O, p: '#a77be6', d: '#7a4fc0', w: '#e6d6ff', k: '#2b2140' },
  art: [
    '.koo.....ook.',
    'kkopoo.oopokk',
    '.kopwpodppok.',
    'kkoppodopdokk',
    '.kopoo.oopok.',
    '.koo.....ook.',
  ], wear: { x: 2, y: 3 } };
ITEMS.starchoker = { cat: 'wear', slot: 'neck', name: '紫星项圈', en: 'Purple star choker', price: 40,
  pal: { o: O, k: '#3a2a5a', p: '#b48cf0' },
  art: [
    '.oooooooooooooo.',
    'okkkkkkkkkkkkkko',
    '.ooooooppoooooo.',
    '......opppo.....',
    '.......opo......',
    '........o.......',
  ], wear: { x: 8, y: 23 } };

export const WEAR_SLOTS = [
  ['head', '头饰', 'Hair'],
  ['body', '衣服', 'Clothes'],
  ['feet', '鞋子', 'Shoes'],
  ['face', '眼镜', 'Glasses'],
  ['neck', '围巾领结', 'Neckwear'],
];

// ---------- the kitten's home: cut-away house on the meadow ----------
function lowres(canvas, W, H, paint) {
  const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
  if (!cssW || !cssH) return;
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const ctx = off.getContext('2d');
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  paint(R, W, H);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  const out = canvas.getContext('2d'); out.imageSmoothingEnabled = false;
  out.drawImage(off, 0, 0, canvas.width, canvas.height);
}
// window position inside the room (fractions), shared with the curtains
// ---------- bedroom and kitchen furniture (made from simple shapes) ----------
Object.assign(ITEMS, {
  bed: { cat: 'decor', room: 'bedroom', name: '小床', en: 'Bed', price: 180, spot: 'back-right',
    pal: { o: O, w: '#c98f58', l: '#e2b07c', m: '#ffffff', i: '#fff8e6', q: '#ffe9b0', b: '#8fb8f2', c: '#c9dcff', h: '#ff6f9c' },
    art: [
      'ooooooo...............................',
      'olllllo...............................',
      'owwwwwo...............................',
      'owwwwwo...............................',
      'owwhwwo...............................',
      'owwhwwo...............................',
      'owwwwwooooooooo.......................',
      'owwwwwooqqqqqooooooooooooooooooooooooo',
      'owwwwwooiiiiiocccccccccccccccccolllllo',
      'owwwwwooiiiiiobbbbbbbbbbbbbbbbbowwwwwo',
      'owwwwwoooooooobbccbbccbbccbbccbowwwwwo',
      'owwwwwommmmmmobbccbbccbbccbbccbowwwwwo',
      'owwwwwommmmmmobbbbbbbbbbbbbbbbbowwwwwo',
      'owwwwwommmmmmooooooooooooooooooowwwwwo',
      'owwwwwoooooooooooooooooooooooooowwwwwo',
      'owwwwwollllllllllllllllllllllllowwwwwo',
      'owwwwwowwwwwwwwwwwwwwwwwwwwwwwwowwwwwo',
      'owwwwwoooooooooooooooooooooooooowwwwwo',
      'owwwwwo........................owwwwwo',
      'ooooooo........................ooooooo',
      '.ooo..............................ooo.',
      '.ooo..............................ooo.',
    ] },
  wardrobe: { cat: 'decor', room: 'bedroom', name: '衣柜', en: 'Wardrobe', price: 150, spot: 'back-left',
    pal: { o: O, w: '#b07a48', l: '#d29c64', d: '#c98f58', y: '#ffd23f' },
    art: [
      'oooooooooooooooooooo',
      'ollllllllllllllllllo',
      'ollllllllllllllllllo',
      'owwwwwwwwwwwwwwwwwwo',
      'owoooooooooooooooowo',
      'owolllllloollllllowo',
      'owoddddddooddddddowo',
      'owoddddddooddddddowo',
      'owoddddddooddddddowo',
      'owoddddddooddddddowo',
      'owoddddddooddddddowo',
      'owoddddddooddddddowo',
      'owoddddddooddddddowo',
      'owoddddddooddddddowo',
      'owoddddddooddddddowo',
      'owodddddyooydddddowo',
      'owodddddyooydddddowo',
      'owoddddddooddddddowo',
      'owoddddddooddddddowo',
      'owoddddddooddddddowo',
      'owoddddddooddddddowo',
      'owoddddddooddddddowo',
      'owoddddddooddddddowo',
      'owoddddddooddddddowo',
      'owoddddddooddddddowo',
      'owoddddddooddddddowo',
      'owoddddddooddddddowo',
      'owoooooooooooooooowo',
      'owwwwwwwwwwwwwwwwwwo',
      'oooooooooooooooooooo',
      '.ooo............ooo.',
      '.ooo............ooo.',
    ] },
  nightstand: { cat: 'decor', room: 'bedroom', name: '床头柜', en: 'Bedside table', price: 70, spot: 'back-mid-right',
    pal: { o: O, w: '#b07a48', l: '#d29c64', d: '#c98f58', y: '#ffe28a', z: '#fff4c2' },
    art: [
      '....oooooo....',
      '....ozzzzo....',
      '....oyyyyo....',
      '....oyyyyo....',
      '....oooooo....',
      '......oo......',
      '......oo......',
      '......oo......',
      '...oooooooo...',
      'oooooooooooooo',
      'ollllllllllllo',
      'owwwwwwwwwwwwo',
      'oooooooooooooo',
      'ooddddyyddddoo',
      'ooddddddddddoo',
      'oooooooooooooo',
      'owwwwwwwwwwwwo',
      'owwwwwwwwwwwwo',
      'owwwwwwwwwwwwo',
      'oooooooooooooo',
      '.oo........oo.',
      '.oo........oo.',
    ] },
  dresser: { cat: 'decor', room: 'bedroom', name: '梳妆台', en: 'Dresser', price: 120, spot: 'back-mid-left',
    pal: { o: O, m: '#bfe6ff', n: '#ffffff', p: '#f7a8c4', k: '#ffd0e0', q: '#ffbcd4', y: '#ffd23f' },
    art: [
      '.....oooooooooooo.....',
      '.....ommmmmmmmmmo.....',
      '.....omnnnmmmmmmo.....',
      '.....omnnmmmmmmmo.....',
      '.....ommmmmmmmmmo.....',
      '.....ommmmmmmmmmo.....',
      '.....ommmmmmmmmmo.....',
      '.....ommmmmmmmmmo.....',
      '.....ommmmmmmmmmo.....',
      '.....ommmmmmmmmmo.....',
      '.....ommmmmmmmmmo.....',
      '.....oooooooooooo.....',
      '..........oo..........',
      'oooooooooooooooooooooo',
      'okkkkkkkkkkkkkkkkkkkko',
      'oppppppppppppppppppppo',
      'opoooooooooooooooooopo',
      'opoqqqqqqqyyqqqqqqqopo',
      'opoqqqqqqqqqqqqqqqqopo',
      'opoooooooooooooooooopo',
      'opoooooooooooooooooopo',
      'opoqqqqqqqyyqqqqqqqopo',
      'opoqqqqqqqqqqqqqqqqopo',
      'opoooooooooooooooooopo',
      'opoooooooooooooooooopo',
      'opoqqqqqqqyyqqqqqqqopo',
      'opoqqqqqqqqqqqqqqqqopo',
      'oooooooooooooooooooooo',
      '.ooo..............ooo.',
      '.ooo..............ooo.',
    ] },
  starlight: { cat: 'decor', room: 'bedroom', name: '星星夜灯', en: 'Star night light', price: 60, spot: 'wall-left',
    pal: { o: O, y: '#ffd23f', w: '#fff8c2' },
    art: [
      '...............',
      '.......o.......',
      '......oyo......',
      '......oyo......',
      '.....oyyyo.....',
      '.ooooyywyyoooo.',
      '..oyyywyyyyyo..',
      '...oyyyyyyyo...',
      '....oyyyyyo....',
      '....oyyoyyo....',
      '...oyyo.oyyo...',
      '...oyo...oyo...',
      '..ooo.....ooo..',
      '...............',
      '...............',
    ] },
  teddy: { cat: 'decor', room: 'bedroom', name: '泰迪熊', en: 'Teddy bear', price: 50, spot: 'front-left',
    pal: { o: O, b: '#b97a4a', l: '#e8c39a', p: '#ff9ec4', r: '#e8576b' },
    art: [
      '.ooooo....ooooo.',
      '.obbbo....obbbo.',
      '.oooooooooooooo.',
      '.oobbbbbbbbbboo.',
      '.oobbbbbbbbbboo.',
      '..obbobbbbobbo..',
      '..obbboooobbbo..',
      '..obbboooobbbo..',
      '..obbbollobbbo..',
      '..obbboooobbbo..',
      'oooooorrrroooooo',
      'obboboooooobobbo',
      'obbobollllobobbo',
      'obbobollllobobbo',
      'oooobolllloboooo',
      '..oooooooooooo..',
      '..obbboooobbbo..',
      '..ooooo..ooooo..',
    ] },
  fridge: { cat: 'decor', room: 'kitchen', name: '冰箱', en: 'Fridge', price: 160, spot: 'back-left',
    pal: { o: O, w: '#f4fbff', s: '#ffffff', g: '#9fb3c8', m: '#fff3c4', r: '#e8576b', y: '#5cc46e', p: '#ffffff' },
    art: [
      'oooooooooooooooooo',
      'osssssssssssssssso',
      'owwwwwwwwwwwwwwwwo',
      'owwwooowwwwwwwwwwo',
      'owwwopowwwwwwwggwo',
      'owwwooowwwwwwwggwo',
      'owwwwwwwwwwwwwggwo',
      'owwwwwwwwwwwwwggwo',
      'owwwwwwwwwwwwwggwo',
      'owwwwwwwwwwwwwwwwo',
      'owwwwwwwwwwwwwwwwo',
      'oooooooooooooooooo',
      'owwwwwwwwwwwwwwwwo',
      'owwwwwwwwwwwwwwwwo',
      'owwwwwwwwwwwwwggwo',
      'owwoooooowwwwwggwo',
      'owwommmmowwwwwggwo',
      'owwomrrmowwwwwggwo',
      'owwomymmowwwwwggwo',
      'owwommmmowwwwwggwo',
      'owwoooooowwwwwggwo',
      'owwwwwwwwwwwwwggwo',
      'owwwwwwwwwwwwwggwo',
      'owwwwwwwwwwwwwwwwo',
      'owwwwwwwwwwwwwwwwo',
      'owwwwwwwwwwwwwwwwo',
      'owwwwwwwwwwwwwwwwo',
      'owwwwwwwwwwwwwwwwo',
      'owwwwwwwwwwwwwwwwo',
      'owwwwwwwwwwwwwwwwo',
      'owwwwwwwwwwwwwwwwo',
      'oooooooooooooooooo',
      '.ooo..........ooo.',
      '.ooo..........ooo.',
    ] },
  stove: { cat: 'decor', room: 'kitchen', name: '炉灶', en: 'Stove', price: 140, spot: 'back-mid-left',
    pal: { o: O, r: '#e8576b', q: '#ff9a9a', f: '#ffb02e', k: '#3a3f4a', d: '#5b6170', w: '#e9edf2', s: '#ffffff', g: '#26304a', y: '#ffd23f' },
    art: [
      '.....oooooooooooooo.....',
      '.....oqqqqqqqqqqqqo.....',
      '.....orrrrrrrrrrrro.....',
      '...ooorrrrrrrrrrrrooo...',
      '...ooorrrrrrrrrrrrooo...',
      '.....orrrrrrrrrrrro.....',
      '.....orrrrrrrrrrrro.....',
      '.....orrrrrrrrrrrro.....',
      '.....oooooooooooooo.....',
      '.......ff......ff.......',
      'oooooooooooooooooooooooo',
      'okkkdddddkkkkkkdddddkkko',
      'okkkkkkkkkkkkkkkkkkkkkko',
      'oooooooooooooooooooooooo',
      'osssrsssyssssssysssrssso',
      'owwwwwwwwwwwwwwwwwwwwwwo',
      'owwoooooooooooooooooowwo',
      'owwoddddddddddddddddowwo',
      'owwodoooooooooooooodowwo',
      'owwodossssggggggggodowwo',
      'owwodoggggggggggggodowwo',
      'owwodoggggggggggggodowwo',
      'owwodoggggggggggggodowwo',
      'owwodoooooooooooooodowwo',
      'owwoddddddddddddddddowwo',
      'owwoooooooooooooooooowwo',
      'owwwwwwwwwwwwwwwwwwwwwwo',
      'oooooooooooooooooooooooo',
      '.ooo................ooo.',
      '.ooo................ooo.',
    ] },
  sink: { cat: 'decor', room: 'kitchen', name: '洗碗槽', en: 'Sink', price: 120, spot: 'back-mid-right',
    pal: { o: O, g: '#9fb3c8', b: '#8fd0f5', c: '#c9ecff', t: '#e9edf2', w: '#7fc8a9', l: '#a6e3c8', d: '#6ab896', y: '#ffd23f' },
    art: [
      '...........gggg...........',
      '...........gggg...........',
      '...........gggg...........',
      '...........b.gg...........',
      '...........b.gg...........',
      '.............gg...........',
      'oooooooooooooooooooooooooo',
      'otttttoccccccccccccottttto',
      'otttttoooooooooooooottttto',
      'oooooooooooooooooooooooooo',
      'ollllllllllllllllllllllllo',
      'owwwwwwwwwwwwwwwwwwwwwwwwo',
      'owoooooooooowwoooooooooowo',
      'owoddddddddowwoddddddddowo',
      'owoddddddddowwoddddddddowo',
      'owoddddddddowwoddddddddowo',
      'owodddddddyowwoydddddddowo',
      'owoddddddddowwoddddddddowo',
      'owoddddddddowwoddddddddowo',
      'owoddddddddowwoddddddddowo',
      'owoddddddddowwoddddddddowo',
      'owoooooooooowwoooooooooowo',
      'owwwwwwwwwwwwwwwwwwwwwwwwo',
      'oooooooooooooooooooooooooo',
      '.ooo..................ooo.',
      '.ooo..................ooo.',
    ] },
  spiceshelf: { cat: 'decor', room: 'kitchen', name: '调料架', en: 'Spice shelf', price: 60, spot: 'wall-right',
    pal: { o: O, w: '#b07a48', l: '#d29c64', r: '#e8576b', y: '#ffd23f', g: '#5cc46e', p: '#c58bf0', k: '#ffffff' },
    art: [
      'oooooooooooooooooooooooooo',
      'ollllllllllllllllllllllllo',
      'oooooooooooooooooooooooooo',
      '..okko.okko.okko.okkookko.',
      '..orro.oyyo.oggo.oppoorro.',
      '..orro.oyyo.oggo.oppoorro.',
      '..orro.oyyo.oggo.oppoorro.',
      '..orro.oyyo.oggo.oppoorro.',
      '..oooo.oooo.oooo.oooooooo.',
      'oooooooooooooooooooooooooo',
      'ollllllllllllllllllllllllo',
      'oooooooooooooooooooooooooo',
      '..oo..................oo..',
      '..oo..................oo..',
      '..oo..................oo..',
      '..........................',
    ] },
  diningtable: { cat: 'decor', room: 'kitchen', name: '餐桌', en: 'Dining table', price: 150, spot: 'front-right',
    pal: { o: O, c: '#e2b07c', t: '#c98f58', l: '#e2b07c', w: '#b07a48', m: '#ffffff', f: '#ffd23f', r: '#e8576b' },
    art: [
      '..................................',
      '..................................',
      'oooooo......................oooooo',
      'occcco......................occcco',
      'occcco......oooo....r.......occcco',
      'occcco......ommo..ooooo.....occcco',
      'occcco......ommo..offfo.....occcco',
      'occcco......oooo..ooooo.....occcco',
      'occccoooooooooooooooooooooooocccco',
      'occccollllllllllllllllllllllocccco',
      'occccoooooooooooooooooooooooocccco',
      'occcco.oww..............wwo.occcco',
      'ooooooooww..............wwoooooooo',
      'occccccoww..............wwocccccco',
      'ooooooooww..............wwoooooooo',
      'oooccoooww..............wwoooccooo',
      'oooccoooww..............wwoooccooo',
      'oooccoooww..............wwoooccooo',
      'oooccoooww..............wwoooccooo',
      'ooooooooww..............wwoooooooo',
      '.oo...ooww..............wwoo...oo.',
      '.oo...ooww..............wwoo...oo.',
    ] },
  foodbowl: { cat: 'decor', room: 'kitchen', name: '猫饭碗', en: 'Kitty bowl', price: 40, spot: 'front-left',
    pal: { o: O, b: '#ff8fb1', c: '#ffc2d6', w: '#ffffff', f: '#7fb8e8' },
    art: [
      '....oooooo..o...',
      '...offffffoofo..',
      '..ofwoffffffo...',
      '...offffffoofo..',
      '.oooooooooooooo.',
      '.occcccccccccco.',
      '.obbbwwbbwwbbbo.',
      '.obbbbbbbbbbbbo.',
      '.oooooooooooooo.',
    ] },
  piano: { cat: 'decor', name: '钢琴', en: 'Piano', price: 200, spot: 'back-left', playable: 'piano',
    pal: { o: O, w: '#6b3a2a', l: '#8f5440', d: '#4a271c', m: '#fff8e6', n: '#ffffff', k: '#ffffff', y: '#ffd23f' },
    art: [
      'oooooooooooooooooooooooooooooooo',
      'ollllllllllllllllllllllllllllllo',
      'oddddddddddddddddddddddddddddddo',
      'oooooooooooooooooooooooooooooooo',
      '.ollllllllllllllllllllllllllllo.',
      '.owwwwwwwwoooooooooooowwwwwwwwo.',
      '.owwwwwwwwommoommmmmmowwwwwwwwo.',
      '.owwwwwwwwonnonnnnnnnowwwwwwwwo.',
      '.owwwwwwwwommmmmmoommowwwwwwwwo.',
      '.owwwwwwwwonnnnnnonnnowwwwwwwwo.',
      '.owwwwwwwwommmmmmmmmmowwwwwwwwo.',
      '.owwwwwwwwoooooooooooowwwwwwwwo.',
      '.owwwwwwwwwwwwwwwwwwwwwwwwwwwwo.',
      'oooooooooooooooooooooooooooooooo',
      'okookookkkkookookookkkkookookkko',
      'okookookkkkookookookkkkookookkko',
      'okkokkokkokkokkokkokkokkokkokkoo',
      'okkokkokkokkokkokkokkokkokkokkoo',
      'oooooooooooooooooooooooooooooooo',
      '.ollllllllllllllllllllllllllllo.',
      '.owwoooooooooooooooooooooooowwo.',
      '.owwoddddddddddddddddddddddowwo.',
      '.owwoddddddddddddddddddddddowwo.',
      '.owwoddddddddddddddddddddddowwo.',
      '.owwoooooooooooooooooooooooowwo.',
      '.owwwwwwwwwwwwwwwwwwwwwwwwwwwwo.',
      '.oooooooooooooooooooooooooooooo.',
      '..ooo.....yyy......yyy.....ooo..',
      '..ooo......................ooo..',
      '..ooo......................ooo..',
    ] },
});

// ---------- a kitten sitting side-on (at the dining table), facing right; mirror it to face left ----------
export function kittenSideGrid(fur = 'ginger', mood = 'normal', frame = 0) {
  const P = FURS[fur] || FURS.ginger;
  const g = grid(KW, KH), part = grid(KW, KH);
  const Y = (v) => v + OY;
  const fill = (test, c, r) => { for (let y = 0; y < KH; y++) for (let x = 0; x < KW; x++) if (test(x, y)) { g[y][x] = c; part[y][x] = r; } };
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < KW && y < KH) g[y][x] = c; };
  const sway = frame % 2;
  // tail curling up behind her
  for (let t = 0; t <= 1; t += 0.02) {
    const bx = (1 - t) ** 2 * 9 + 2 * (1 - t) * t * (1 + sway) + t * t * (3 + sway), by = (1 - t) ** 2 * Y(29) + 2 * (1 - t) * t * Y(28) + t * t * Y(18);
    fill((x, y) => inEllipse(x, y, bx, by, 1.7, 1.7), t > 0.8 ? P.s : P.f, 'tail');
  }
  // sitting body: round haunch at the back, chest at the front
  fill((x, y) => inEllipse(x, y, 13, Y(24.5), 8, 6.6), P.f, 'body');
  fill((x, y) => inEllipse(x, y, 19, Y(21.5), 5, 6.4), P.f, 'body');
  fill((x, y) => inEllipse(x, y, 21, Y(22), 2.6, 4.4), P.w, 'body');                  // white chest
  if (P.patch) fill((x, y) => part[y][x] === 'body' && inEllipse(x, y, 11, Y(21), 4, 3), P.patch, 'body');
  else [[9, 19], [12, 18], [15, 18]].forEach(([x, y]) => { for (let k = 0; k < 3; k++) if (part[Y(y + k)] && part[Y(y + k)][x] === 'body') g[Y(y + k)][x] = P.s; });
  // front leg and paws
  fill((x, y) => x >= 19 && x <= 21 && y >= Y(24) && y <= Y(30), P.f, 'leg');
  fill((x, y) => inEllipse(x, y, 21.2, Y(30.4), 2.8, 1.5), P.w, 'paw');
  fill((x, y) => inEllipse(x, y, 10, Y(30.4), 3.4, 1.5), P.w, 'paw');
  // ears (the far one peeks out behind)
  fill((x, y) => inTri(x, y, [12, Y(6)], [13.5, Y(-0.5)], [18, Y(4)]), P.s, 'head');
  fill((x, y) => inTri(x, y, [16, Y(5)], [19.5, Y(-1)], [23, Y(4.5)]), P.f, 'head');
  fill((x, y) => inTri(x, y, [17.8, Y(4)], [19.5, Y(1)], [21.5, Y(4)]), PINK, 'head');
  // head and muzzle
  fill((x, y) => inEllipse(x, y, 18.5, Y(11), 8.6, 7.8), P.f, 'head');
  fill((x, y) => inEllipse(x, y, 25, Y(13.6), 3.8, 2.8), P.w, 'head');
  if (P.patch) fill((x, y) => part[y][x] === 'head' && inEllipse(x, y, 14, Y(7), 4, 3.4), P.patch, 'head');
  else [[15, 4], [17, 4]].forEach(([x, y]) => { set(x, Y(y), P.s); set(x, Y(y + 1), P.s); });
  // face
  set(28, Y(12), NOSE); set(28, Y(13), NOSE);
  set(26, Y(15), P.o); set(27, Y(15), P.o); set(25, Y(14), P.o);
  set(23, Y(14), BLUSH); set(22, Y(14), BLUSH);
  if (mood === 'happy' || mood === 'love') { set(21, Y(11), EYE); set(22, Y(10), EYE); set(23, Y(10), EYE); set(24, Y(11), EYE); }
  else if (mood === 'sleepy' || mood === 'blink') { for (let x = 21; x <= 24; x++) set(x, Y(11), EYE); }
  else { for (let yy = 9; yy <= 11; yy++) { set(22, Y(yy), EYE); set(23, Y(yy), EYE); } set(22, Y(9), '#ffffff'); }
  // outline
  const out = g.map((r) => r.slice());
  for (let y = 0; y < KH; y++) for (let x = 0; x < KW; x++) {
    if (g[y][x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy] && g[y + dy][x + dx] && g[y + dy][x + dx] !== P.o)) out[y][x] = P.o;
  }
  // whiskers
  [[29, 13], [30, 12], [29, 15], [30, 15]].forEach(([x, y]) => { if (!out[Y(y)][x]) out[Y(y)][x] = P.o; });
  return out;
}

// ---------- a kitten lying down (in bed): head resting on the left, body stretched out, tail curled ----------
export function kittenLyingGrid(fur = 'ginger', mood = 'sleepy', equipped = {}, frame = 0) {
  const P = FURS[fur] || FURS.ginger;
  const LW = 54, LH = 30;
  const g = Array.from({ length: LH }, () => Array(LW).fill(null)), part = Array.from({ length: LH }, () => Array(LW).fill(null));
  const fill = (test, c, r) => { for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) if (test(x, y)) { g[y][x] = c; part[y][x] = r; } };
  const sway = frame % 2;
  // tail curling up at the far end
  for (let t = 0; t <= 1; t += 0.02) {
    const bx = (1 - t) ** 2 * 46 + 2 * (1 - t) * t * (53 - sway) + t * t * (49 + sway), by = (1 - t) ** 2 * 24 + 2 * (1 - t) * t * 22 + t * t * 12;
    fill((x, y) => (x + 0.5 - bx) ** 2 + (y + 0.5 - by) ** 2 <= 2.6, t > 0.8 ? P.s : P.f, 'tail');
  }
  // long body, lighter tummy, back paw, front paws tucked under the chin
  fill((x, y) => ((x + 0.5 - 34) / 15) ** 2 + ((y + 0.5 - 21.5) / 6.2) ** 2 <= 1, P.f, 'body');
  fill((x, y) => ((x + 0.5 - 33) / 11) ** 2 + ((y + 0.5 - 25) / 2.6) ** 2 <= 1, P.w, 'body');
  if (P.patch) fill((x, y) => part[y][x] === 'body' && ((x + 0.5 - 38) / 5) ** 2 + ((y + 0.5 - 18) / 3) ** 2 <= 1, P.patch, 'body');
  else [[30, 16], [34, 16], [38, 16], [42, 17]].forEach(([x, y]) => { for (let k = 0; k < 3; k++) if (g[y + k] && part[y + k][x] === 'body') g[y + k][x] = P.s; });
  fill((x, y) => ((x + 0.5 - 45) / 3.2) ** 2 + ((y + 0.5 - 26.5) / 1.8) ** 2 <= 1, P.w, 'paw');
  fill((x, y) => ((x + 0.5 - 21) / 3.4) ** 2 + ((y + 0.5 - 27) / 1.8) ** 2 <= 1, P.w, 'paw');
  // outline round the body
  const out = g.map((r) => r.slice());
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    if (g[y][x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy] && g[y + dy][x + dx])) out[y][x] = P.o;
  }
  // the head (same face and hat as when she sits), resting on the left
  const head = kittenGrid(fur, mood, { ...equipped, body: null, feet: null }, frame, false, true);
  const top = 0, rows = 28;
  for (let y = 0; y < Math.min(rows, head.length); y++) for (let x = 0; x < 32; x++) {
    const c = head[y][x]; if (!c) continue;
    const ty = y + top - 2, tx = x;
    if (ty >= 0 && ty < LH && tx < LW) out[ty][tx] = c;
  }
  return out;
}

// ---------- renovations: wallpapers and floors (drawn by pattern, x/y in room pixels) ----------
const WALLPAT = {
  mint: (x, y) => (x % 8 < 4 ? '#cdeedd' : '#e3f6ec'),
  sky: (x, y) => { const cx = (x + 40) % 40, cy = y % 26; const cloud = (cx > 6 && cx < 18 && cy > 6 && cy < 10) || (cx > 9 && cx < 15 && cy === 5); return cloud ? '#ffffff' : '#cfe8fb'; },
  dots: (x, y) => ((x % 6 === 2 && y % 6 === 2) || (x % 6 === 5 && y % 6 === 5) ? '#ffc94a' : '#fff1b8'),
  hearts: (x, y) => { const hx = x % 10, hy = y % 10; const H = [[1, 1], [3, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [2, 3], [3, 3], [2, 4]]; return H.some(([a, b]) => a === hx && b === hy) ? '#ff8fb1' : '#ffe0ea'; },
  brick: (x, y) => { const row = Math.floor(y / 4); if (y % 4 === 3) return '#f0d6c4'; return ((x + (row % 2) * 5) % 10 === 9) ? '#f0d6c4' : (row % 3 ? '#d9825b' : '#cf7650'); },
};
const FLOORPAT = {
  oak: (x, y) => { const row = Math.floor(y / 4); if (y % 4 === 3) return '#c49a62'; return (x + row * 13) % 24 === 0 ? '#c49a62' : (row % 2 ? '#e8c48e' : '#dcb47c'); },
  tile: (x, y) => ((Math.floor(x / 6) + Math.floor(y / 4)) % 2 ? '#7fd0c8' : '#f4fbff'),
  carpet: (x, y) => (((x * 7 + y * 13) % 17) === 0 ? '#ffd0df' : '#f5a9c2'),
  marble: (x, y) => { if (x % 12 === 0 || y % 8 === 0) return '#c9cdd6'; return ((x * 3 + y * 5) % 23) === 0 ? '#d9dde6' : '#f2f3f7'; },
  walnut: (x, y) => { const row = Math.floor(y / 4); if (y % 4 === 3) return '#4e2c18'; return (x + row * 9) % 20 === 0 ? '#4e2c18' : (row % 2 ? '#7a4a2a' : '#6b3e22'); },
};
// a little square swatch picture of a pattern, for the shop
function swatchArt(fn, floorish) {
  const W = 16, H = 12, pal = { o: O }, map = new Map(); let n = 0;
  const code = (c) => { if (!map.has(c)) { const k = 'abcdefghijklmnpqrstuvwxyz'[n++]; map.set(c, k); pal[k] = c; } return map.get(c); };
  const art = [];
  for (let y = 0; y < H; y++) { let row = ''; for (let x = 0; x < W; x++) row += (x === 0 || y === 0 || x === W - 1 || y === H - 1) ? 'o' : code(fn(x * (floorish ? 1 : 2), y * (floorish ? 1 : 2))); art.push(row); }
  return { art, pal };
}
[['wall-mint', '薄荷条纹墙纸', 'Mint stripes wallpaper', 'mint', 80], ['wall-sky', '蓝天白云墙纸', 'Sky & clouds wallpaper', 'sky', 100], ['wall-dots', '黄色圆点墙纸', 'Yellow dots wallpaper', 'dots', 80],
  ['wall-hearts', '粉色爱心墙纸', 'Pink hearts wallpaper', 'hearts', 100], ['wall-brick', '红砖墙', 'Red brick wall', 'brick', 120]].forEach(([id, name, en, pat, price]) => {
  ITEMS[id] = { cat: 'reno', kind: 'wall', name, en, price, pat, ...swatchArt(WALLPAT[pat]) };
});
[['floor-oak', '浅色木地板', 'Light oak floor', 'oak', 90], ['floor-tile', '蓝绿格子地砖', 'Teal check tiles', 'tile', 90], ['floor-carpet', '粉色地毯', 'Pink carpet', 'carpet', 100],
  ['floor-marble', '大理石地砖', 'Marble tiles', 'marble', 130], ['floor-walnut', '深色木地板', 'Dark walnut floor', 'walnut', 110]].forEach(([id, name, en, pat, price]) => {
  ITEMS[id] = { cat: 'reno', kind: 'floor', name, en, price, pat, ...swatchArt(FLOORPAT[pat], true) };
});

// ---------- more window coverings (stretched to fit the window, top to bottom) ----------
function coverArt(W, H, fn) {
  const pal = { o: O }, map = new Map(); let n = 0;
  const code = (c) => { if (!c) return '.'; if (!map.has(c)) { const k = 'abcdefghijklmnpqrstuvwxyz'[n++]; map.set(c, k); pal[k] = c; } return map.get(c); };
  const art = [];
  for (let y = 0; y < H; y++) { let row = ''; for (let x = 0; x < W; x++) row += code(fn(x, y, W, H)); art.push(row); }
  return { art, pal };
}
const ROD = (x, y) => (y < 2 ? (y === 0 ? '#8a5a32' : '#b07a48') : null);
Object.assign(ITEMS, {
  blinds: { cat: 'decor', name: '百叶窗', en: 'Window blinds', price: 70, spot: 'curtain',
    ...coverArt(36, 28, (x, y, W) => ROD(x, y) || (x > 1 && x < W - 2 && y < 18 ? (y % 3 === 2 ? '#c9ced8' : '#f4f6fa') : (y < 18 ? '#3a2a35' : (x === 30 && y < 24 ? '#c9ced8' : (x === 30 && y === 24 ? '#ffd23f' : null))))) },
  roman: { cat: 'decor', name: '罗马帘', en: 'Roman blind', price: 75, spot: 'curtain',
    ...coverArt(36, 28, (x, y, W) => ROD(x, y) || (x > 1 && x < W - 2 && y < 13 ? (y % 4 === 3 ? '#6f9e72' : (x === 2 || x === W - 3 ? '#6f9e72' : '#9cc79f')) : (x > 1 && x < W - 2 && y === 13 ? '#3a2a35' : null))) },
  lace: { cat: 'decor', name: '蕾丝纱帘', en: 'Lace curtains', price: 65, spot: 'curtain',
    ...coverArt(36, 28, (x, y, W) => ROD(x, y) || ((x < 12 || x >= W - 12) ? (((x + y) % 4 === 0) ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.6)') : null)) },
  starcurtain: { cat: 'decor', name: '星星窗帘', en: 'Starry curtains', price: 80, spot: 'curtain',
    ...coverArt(36, 28, (x, y, W) => { if (ROD(x, y)) return ROD(x, y); const side = x < 11 || x >= W - 11; if (!side) return null; if ((x === 0 || x === 10 || x === W - 11 || x === W - 1)) return '#3a2a35'; const sx = x % 6, sy = y % 6; return (sx === 3 && sy === 3) || (sx === 3 && (sy === 2 || sy === 4)) || (sy === 3 && (sx === 2 || sx === 4)) ? '#ffd23f' : '#2e3f7a'; }) },
  pianobench: { cat: 'decor', name: '钢琴椅', en: 'Piano bench', price: 60, spot: 'bench',
    ...coverArt(24, 12, (x, y, W, H) => { if (y < 4) return (y === 0 || x === 0 || x === W - 1) ? '#3a2a35' : (y === 1 ? '#a25b78' : '#8a4766'); if (y === 4) return '#3a2a35'; if (y === 5) return x === 0 || x === W - 1 ? '#3a2a35' : '#6b3a2a'; return (x >= 1 && x <= 3) || (x >= W - 4 && x <= W - 2) ? (x === 1 || x === W - 2 ? '#3a2a35' : '#4a271c') : null; }) },
});
// photo frames: where the photo goes (fraction of the frame picture)
ITEMS.painting.frame = { x: 3 / 20, y: 3 / 16, w: 14 / 20, h: 10 / 16 };
ITEMS.photoframe = { cat: 'decor', name: '相框', en: 'Photo frame', price: 50, spot: 'wall-mid', frame: { x: 3 / 18, y: 3 / 22, w: 12 / 18, h: 16 / 22 },
  ...coverArt(18, 22, (x, y, W, H) => {
    if ((x === 0 || y === 0 || x === W - 1 || y === H - 1)) return (x === 0 && y === 0) || (x === W - 1 && y === 0) || (x === 0 && y === H - 1) || (x === W - 1 && y === H - 1) ? null : '#3a2a35';
    if (x < 3 || y < 3 || x >= W - 3 || y >= H - 3) return (x + y) % 4 === 0 ? '#ffd23f' : '#ff9ec4';
    // an empty frame shows a little heart until a photo goes in
    const hx = x - 9, hy = y - 11, heart = [[-2, -1], [-1, -2], [1, -2], [2, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2], [-1, -1], [1, -1], [0, -1]];
    return heart.some(([a, b]) => a === hx && b === hy) ? '#ff8fb1' : '#fff1f5';
  }) };

// where a kitten sits on furniture (fraction of the piece: x across, y down to where her paws rest)
ITEMS.sofa.seat = { x: 0.5, y: 0.78, spots: [0.2, 0.8] };          // room for two kittens side by side
if (ITEMS.diningtable) ITEMS.diningtable.seat = { x: 0.06, y: 0.64, spots: [0.04, 0.96], side: true };   // one chair each side, facing each other
if (ITEMS.pianobench) ITEMS.pianobench.seat = { x: 0.5, y: 0.45, back: true };   // facing the piano
if (ITEMS.bed) ITEMS.bed.seat = { x: 0.52, y: 0.63, lie: true, blanket: [6, 14, 16, 32] };   // blanket rows 6-13, columns 13-31

// furniture you can switch on and off at home
ITEMS.tv.power = 'tv';
['lamp', 'lantern', 'starlight', 'nightstand'].forEach((id) => { if (ITEMS[id]) ITEMS[id].power = 'light'; });

export const ROOM_WINDOW = { x0: 0.39, x1: 0.61, y0: 0.08, y1: 0.42 };
// kind: 'living' (cream & pink, wooden floor) · 'bedroom' (lilac with stars, soft carpet) · 'kitchen' (tiles, chequered floor)
export function drawRoom(canvas, night = false, kind = 'living', style = null) {
  const cssW = canvas.clientWidth || 300, cssH = canvas.clientHeight || 200;
  const W = 120, H = Math.max(40, Math.round(W * cssH / cssW));
  lowres(canvas, W, H, (R) => {
    const floorY = Math.round(H * 0.64);
    if (kind === 'bedroom') {
      // lilac wallpaper with little stars and moons
      R(0, 0, W, floorY, '#e6dcff');
      for (let x = 0; x < W; x += 10) R(x, 0, 4, floorY, '#ded2fb');
      for (let y = 5; y < floorY - 6; y += 10) for (let x = (y % 20 ? 3 : 8); x < W; x += 10) { R(x, y, 1, 1, '#fff7c2'); R(x - 1, y + 1, 3, 1, '#fff7c2'); R(x, y + 2, 1, 1, '#fff7c2'); }
      R(0, Math.round(H * 0.05), W, 1, '#c9b8f0');
      R(0, floorY - 3, W, 3, '#9a86d6'); R(0, floorY - 3, W, 1, '#b8a6ec');
      // soft blue carpet
      R(0, floorY, W, H - floorY, '#9ec9f0');
      for (let y = floorY + 2; y < H; y += 3) for (let x = (y % 6 ? 1 : 3); x < W; x += 4) R(x, y, 1, 1, '#b8d9f6');
    } else if (kind === 'kitchen') {
      // white tiles on the wall, mint stripe
      R(0, 0, W, floorY, '#f4fbff');
      for (let y = 0; y < floorY; y += 5) R(0, y, W, 1, '#dbe8f0');
      for (let y = 0, row = 0; y < floorY; y += 5, row++) for (let x = row % 2 ? 0 : 3; x < W; x += 6) R(x, y, 1, 5, '#dbe8f0');
      R(0, Math.round(floorY * 0.55), W, 2, '#7fc8a9');
      R(0, floorY - 3, W, 3, '#5b6170'); R(0, floorY - 3, W, 1, '#7b8190');
      // black-and-white chequered floor
      for (let y = floorY, row = 0; y < H; y += 4, row++) for (let x = 0, col = 0; x < W; x += 6, col++) R(x, y, 6, 4, (row + col) % 2 ? '#3d4252' : '#f2f2f2');
    } else {
      // wallpaper: cream with soft pink stripes and tiny dots
      R(0, 0, W, floorY, '#fbe8d3');
      for (let x = 0; x < W; x += 8) R(x, 0, 3, floorY, '#f8dccb');
      for (let y = 3; y < floorY - 4; y += 7) for (let x = (y % 14 ? 1 : 5); x < W; x += 8) R(x, y, 1, 1, '#f2b8c6');
      // picture rail + baseboard
      R(0, Math.round(H * 0.05), W, 1, '#e9c7a8');
      R(0, floorY - 3, W, 3, '#b07a48'); R(0, floorY - 3, W, 1, '#c9905a');
      // wooden floor planks
      for (let y = floorY, row = 0; y < H; y += 4, row++) {
        R(0, y, W, 4, row % 2 ? '#d29c64' : '#c98f58');
        R(0, y + 3, W, 1, '#b07a48');
        for (let x = (row * 13) % 24; x < W; x += 24) R(x, y, 1, 3, '#b07a48');
      }
    }
    // renovations: a new wallpaper and/or floor for this room
    const wall = style && ITEMS[style.wall] && WALLPAT[ITEMS[style.wall].pat];
    const floor = style && ITEMS[style.floor] && FLOORPAT[ITEMS[style.floor].pat];
    if (wall) {
      for (let y = 0; y < floorY - 3; y++) for (let x = 0; x < W; x++) R(x, y, 1, 1, wall(x, y));
      R(0, floorY - 3, W, 3, '#b07a48'); R(0, floorY - 3, W, 1, '#c9905a');
    }
    if (floor) for (let y = floorY; y < H; y++) for (let x = 0; x < W; x++) R(x, y, 1, 1, floor(x, y - floorY));
    // window with the sky outside
    const wx0 = Math.round(W * ROOM_WINDOW.x0), wx1 = Math.round(W * ROOM_WINDOW.x1), wy0 = Math.round(H * ROOM_WINDOW.y0), wy1 = Math.round(H * ROOM_WINDOW.y1);
    R(wx0 - 2, wy0 - 2, wx1 - wx0 + 4, wy1 - wy0 + 4, '#ffffff');
    if (night) {
      R(wx0, wy0, wx1 - wx0, wy1 - wy0, '#1d286a');
      R(wx0, wy0, wx1 - wx0, Math.round((wy1 - wy0) * 0.35), '#10174a');
      [[3, 3], [9, 6], [5, 9], [15, 4], [20, 8], [17, 11], [24, 3]].forEach(([x, y]) => { if (wx0 + x < wx1 - 1 && wy0 + y < wy1 - 5) R(wx0 + x, wy0 + y, 1, 1, '#ffffff'); });
      R(wx1 - 7, wy0 + 2, 3, 3, '#fff4c2'); R(wx1 - 6, wy0 + 2, 2, 2, '#10174a');   // little crescent moon
      R(wx0, wy1 - 4, wx1 - wx0, 4, '#26453a'); R(wx0 + 4, wy1 - 6, 7, 2, '#1f3a31');
    } else {
      R(wx0, wy0, wx1 - wx0, wy1 - wy0, '#8cc6f0');
      R(wx0, wy0, wx1 - wx0, Math.round((wy1 - wy0) * 0.35), '#6aaee8');
      R(wx0 + 2, wy0 + 3, 6, 2, '#ffffff'); R(wx0 + 3, wy0 + 2, 3, 1, '#ffffff');
      R(wx0, wy1 - 4, wx1 - wx0, 4, '#6db35c'); R(wx0 + 4, wy1 - 6, 7, 2, '#5fa252');
    }
    const mx = Math.round((wx0 + wx1) / 2), my = Math.round((wy0 + wy1) / 2);
    R(mx, wy0, 1, wy1 - wy0, '#ffffff'); R(wx0, my, wx1 - wx0, 1, '#ffffff');
    R(wx0 - 3, wy1 + 1, wx1 - wx0 + 6, 2, '#e9e1d4');
  });
}
export function drawRoof(canvas) {
  const cssW = canvas.clientWidth || 300, cssH = canvas.clientHeight || 60;
  const W = 120, H = Math.max(10, Math.round(W * cssH / cssW));
  lowres(canvas, W, H, (R) => {
    // chimney
    R(Math.round(W * 0.74), 0, 8, H, '#9a5a4a'); R(Math.round(W * 0.74) - 1, 0, 10, 2, '#7a4038');
    // stepped roof, wider at the bottom, with tile rows
    for (let y = 0; y < H; y++) {
      const inset = Math.round((H - 1 - y) * (W * 0.16) / H);
      const c = (Math.floor(y / 2) % 2) ? '#e8576b' : '#d94a5e';
      R(inset, y, W - inset * 2, 1, c);
      if (y % 2 === 0) for (let x = inset + ((y / 2) % 2 ? 2 : 5); x < W - inset; x += 6) R(x, y, 1, 1, '#b83a4e');
    }
    R(0, H - 1, W, 1, '#7a2a3a');
  });
}
ITEMS.princess.special = true;   // reward only
