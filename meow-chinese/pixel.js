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
export function kittenGrid(fur = 'ginger', mood = 'normal', equipped = {}, frame = 0) {
  const P = FURS[fur] || FURS.ginger;
  const g = grid(KW, KH), region = grid(KW, KH);
  const set = (x, y, c, r) => { if (x >= 0 && y >= 0 && x < KW && y < KH) { g[y][x] = c; if (r) region[y][x] = r; } };
  const fillShape = (test, c, r) => { for (let y = 0; y < KH; y++) for (let x = 0; x < KW; x++) if (test(x, y)) set(x, y, c, r); };
  const Y = (v) => v + OY;
  const tailSway = frame % 2 === 0 ? 0 : 1;

  // tail (behind body)
  for (let t = 0; t <= 1; t += 0.02) {
    const x0 = 22, y0 = Y(28), cx = 30 + tailSway, cy = Y(26), x1 = 27 + tailSway, y1 = Y(17);
    const bx = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1;
    const by = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1;
    fillShape((x, y) => inEllipse(x, y, bx, by, 1.7, 1.7), t > 0.82 ? P.s : P.f, 'tail');
  }
  // body
  fillShape((x, y) => inEllipse(x, y, 16, Y(24.5), 7.6, 6.6), P.f, 'body');
  fillShape((x, y) => inEllipse(x, y, 16, Y(25.5), 4.2, 4.6), P.w, 'body');
  // paws
  fillShape((x, y) => inEllipse(x, y, 12.2, Y(30.2), 2.6, 1.7), P.w, 'paw');
  fillShape((x, y) => inEllipse(x, y, 19.8, Y(30.2), 2.6, 1.7), P.w, 'paw');
  // ears
  const earL = [[5, Y(10)], [7.5, Y(0.5)], [14, Y(5)]], earR = [[27, Y(10)], [24.5, Y(0.5)], [18, Y(5)]];
  fillShape((x, y) => inTri(x, y, ...earL), P.f, 'head');
  fillShape((x, y) => inTri(x, y, ...earR), P.f, 'head');
  fillShape((x, y) => inTri(x, y, [7.6, Y(8)], [8.3, Y(3)], [12, Y(6)]), PINK, 'head');
  fillShape((x, y) => inTri(x, y, [24.4, Y(8)], [23.7, Y(3)], [20, Y(6)]), PINK, 'head');
  // head
  fillShape((x, y) => inEllipse(x, y, 16, Y(11.5), 11.2, 8.4), P.f, 'head');
  if (P.patch) {
    fillShape((x, y) => region[y][x] === 'head' && inEllipse(x, y, 9, Y(6), 5, 4), P.patch);
    fillShape((x, y) => region[y][x] === 'head' && inEllipse(x, y, 24, Y(7), 3.5, 3), P.s);
    fillShape((x, y) => region[y][x] === 'tail', P.s);
  }
  // forehead stripes
  if (!P.patch) {
    [[13, 4], [16, 4], [19, 4]].forEach(([x, y]) => { set(x, Y(y), P.s); set(x, Y(y + 1), P.s); });
    set(16, Y(6), P.s);
  }
  // muzzle
  fillShape((x, y) => inEllipse(x, y, 16, Y(15.2), 4.6, 2.9), P.w, 'head');
  // cheeks blush
  [[7, 14], [8, 14], [24, 14], [23, 14]].forEach(([x, y]) => set(x, Y(y), BLUSH));
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
  } else {
    set(14, Y(15), P.o); set(15, Y(14), P.o); set(16, Y(14), P.o); set(17, Y(15), P.o);
  }
  // eyes
  const eyes = (ex) => {
    if (mood === 'happy' || mood === 'eat') {
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
  if (mood === 'thirsty' || mood === 'hungry') {
    [[27, 5], [26, 6], [27, 6], [28, 6], [26, 7], [27, 7], [28, 7], [27, 8]].forEach(([x, y]) => { out[Y(y)][x] = mood === 'thirsty' ? T1 : T2; });
    out[Y(6)][27] = '#ffffff';
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
  drawGrid(c, g, Math.max(1, Math.floor(px / Math.max(g.length, g[0].length))));
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
  yarn: { cat: 'decor', name: '毛线球', en: 'Yarn ball', price: 60, spot: 'front-right', toy: true,
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
  sunflower: { cat: 'decor', name: '向日葵', en: 'Sunflower', price: 80, spot: 'left',
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
  cathouse: { cat: 'decor', name: '小猫屋', en: 'Kitty house', price: 160, spot: 'right',
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
  lantern: { cat: 'decor', name: '中秋灯笼', en: 'Lantern', price: 90, spot: 'far-left',
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
  mouse: { cat: 'decor', name: '玩具老鼠', en: 'Toy mouse', price: 50, spot: 'front-left', toy: true,
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
  fence: { cat: 'decor', name: '小木栅栏', en: 'Picket fence', price: 40, spot: 'back',
    pal: { o: O, w: '#e8c89a', d: '#c49a64' },
    art: [
      '.o....o....o....o....o....o.',
      'owo..owo..owo..owo..owo..owo',
      'owoooowoooowoooowoooowoooowo',
      'owddddwddddwddddwddddwddddwo',
      'owoooowoooowoooowoooowoooowo',
      'owo..owo..owo..owo..owo..owo',
      'owoooowoooowoooowoooowoooowo',
      'owddddwddddwddddwddddwddddwo',
      'owoooowoooowoooowoooowoooowo',
      'odo..odo..odo..odo..odo..odo',
      'ooo..ooo..ooo..ooo..ooo..ooo',
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
  };
  const horizon = Math.round(H * (opts.horizon || 0.56));

  // sky bands with dithering
  const sky = ['#3a78d4', '#4a8ade', '#5c9de6', '#73b2ec', '#8cc6f0', '#a6d8f3'];
  const band = Math.ceil(horizon / sky.length);
  for (let y = 0; y < horizon + 10; y++) for (let x = 0; x < W; x++) {
    let b = Math.min(sky.length - 1, Math.floor(y / band));
    const into = y % band;
    if (into < 2 && b > 0 && (x + y) % 2 === 0) b -= 1;
    put(x, y, sky[b]);
  }
  // clouds
  const cloud = (cx, cy, size) => {
    const puffs = [];
    const n = 4 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) puffs.push([cx + (R() - 0.5) * size * 2.6, cy + (R() - 0.5) * size * 0.5, size * (0.45 + R() * 0.5)]);
    for (let y = Math.floor(cy - size * 1.5); y < cy + size; y++) for (let x = Math.floor(cx - size * 3); x < cx + size * 3; x++) {
      let inside = false, shade = false;
      for (const [px, py, r] of puffs) {
        const dx = x - px, dy = (y - py) * 1.25;
        if (dx * dx + dy * dy < r * r) { inside = true; if (y > py + r * 0.25) shade = true; }
      }
      if (y > cy + size * 0.35) continue; // flat bottom
      if (inside) put(x, y, shade ? '#d3ecfa' : '#ffffff');
    }
  };
  const nClouds = Math.round(W / 38);
  for (let i = 0; i < nClouds; i++) cloud(R() * W, 10 + R() * (horizon * 0.55), 4 + R() * 6);

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
