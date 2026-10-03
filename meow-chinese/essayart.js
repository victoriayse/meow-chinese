// Built-in 看图作文 picture stories, drawn as black-and-white line art like school workbooks.
// Each story has 4 panels (400 x 300 each), a title and 参考词语 (reference words).

const K = '#111', G = '#d6d6d6', DG = '#555', W = '#fff';
const ln = (x1, y1, x2, y2, w = 3, c = K) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
// an outlined limb: thick black stroke under a thinner white one
const limb = (pts, w = 9, fill = W) => {
  const p = pts.map((q) => q.join(',')).join(' ');
  return `<polyline points="${p}" fill="none" stroke="${K}" stroke-width="${w + 5}" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<polyline points="${p}" fill="none" stroke="${fill}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
};
const rad = (d) => (d * Math.PI) / 180;
const arm = (sx, sy, a1, a2, L1, L2) => {
  const ex = sx + Math.sin(rad(a1)) * L1, ey = sy + Math.cos(rad(a1)) * L1;
  const hx = ex + Math.sin(rad(a2)) * L2, hy = ey + Math.cos(rad(a2)) * L2;
  return [[sx, sy], [ex, ey], [hx, hy]];
};

// ---------- people ----------
// kind: kid | adult | old ; hair: boy | girl | woman | man | granny | police
// mood: happy | sad | surprised | worried | neutral | crying
// arms: [leftUpper, leftLower, rightUpper, rightLower] angles (0 = down, + = outwards)
export function person(x, y, o = {}) {
  const kind = o.kind || 'kid', s = o.scale || 1;
  const kid = kind === 'kid';
  const R = kid ? 23 : 21;
  const neck = kid ? -108 : -160, hip = kid ? -54 : -84, sw = kid ? 40 : 50, hw = kid ? 36 : 42;
  const L1 = kid ? 30 : 40, L2 = kid ? 26 : 36;
  const hx = 0, hy = neck - R + 3;
  const [la1, la2, ra1, ra2] = o.arms || [12, 6, 12, 6];
  const walk = o.walk || 0;
  let g = '';
  // legs
  const legW = kid ? 10 : 12;
  g += limb([[-9, hip + 4], [-9 - walk * 14, -6]], legW, o.pants || W);
  g += limb([[9, hip + 4], [9 + walk * 14, -6]], legW, o.pants || W);
  g += `<ellipse cx="${-11 - walk * 14}" cy="-3" rx="11" ry="6" fill="${K}"/><ellipse cx="${11 + walk * 14}" cy="-3" rx="11" ry="6" fill="${K}"/>`;
  // skirt or shorts
  if (o.skirt) g += `<path d="M ${-hw / 2 - 2} ${hip - 6} L ${-hw / 2 - 12} ${hip + 22} L ${hw / 2 + 12} ${hip + 22} L ${hw / 2 + 2} ${hip - 6} Z" fill="${o.skirt === true ? G : o.skirt}" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>`;
  // torso
  const shirt = o.shirt || W;
  g += `<path d="M ${-sw / 2} ${neck + 4} Q 0 ${neck - 4} ${sw / 2} ${neck + 4} L ${hw / 2} ${hip} Q 0 ${hip + 6} ${-hw / 2} ${hip} Z" fill="${shirt}" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>`;
  if (o.stripes) for (let yy = neck + 16; yy < hip - 4; yy += 12) g += ln(-sw / 2 + 4, yy, sw / 2 - 4, yy, 2, DG);
  if (o.collar) g += `<path d="M -10 ${neck + 1} L 0 ${neck + 12} L 10 ${neck + 1}" fill="none" stroke="${K}" stroke-width="2.5"/>`;
  if (o.tie) g += `<path d="M -3 ${neck + 6} L 3 ${neck + 6} L 5 ${neck + 34} L 0 ${neck + 40} L -5 ${neck + 34} Z" fill="${DG}" stroke="${K}" stroke-width="1.5"/>`;
  // arms
  const la = arm(-sw / 2 + 3, neck + 8, -la1, -la2, L1, L2), ra = arm(sw / 2 - 3, neck + 8, ra1, ra2, L1, L2);
  g += limb(la, kid ? 9 : 10, o.sleeve || W) + limb(ra, kid ? 9 : 10, o.sleeve || W);
  g += `<circle cx="${la[2][0]}" cy="${la[2][1]}" r="${kid ? 6 : 7}" fill="${W}" stroke="${K}" stroke-width="3"/>`;
  g += `<circle cx="${ra[2][0]}" cy="${ra[2][1]}" r="${kid ? 6 : 7}" fill="${W}" stroke="${K}" stroke-width="3"/>`;
  if (o.holdL) g += o.holdL(la[2][0], la[2][1]);
  if (o.holdR) g += o.holdR(ra[2][0], ra[2][1]);
  // head
  g += hairBack(o.hair, hx, hy, R);
  g += `<circle cx="${hx - R + 1}" cy="${hy + 2}" r="5" fill="${W}" stroke="${K}" stroke-width="2.5"/><circle cx="${hx + R - 1}" cy="${hy + 2}" r="5" fill="${W}" stroke="${K}" stroke-width="2.5"/>`;
  g += `<circle cx="${hx}" cy="${hy}" r="${R}" fill="${W}" stroke="${K}" stroke-width="3"/>`;
  g += face(hx + (o.look || 0), hy, o.mood || 'neutral', R);
  g += hairFront(o.hair, hx, hy, R);
  if (o.glasses) g += `<circle cx="${hx - 8}" cy="${hy - 1}" r="6.5" fill="none" stroke="${K}" stroke-width="2"/><circle cx="${hx + 8}" cy="${hy - 1}" r="6.5" fill="none" stroke="${K}" stroke-width="2"/>${ln(hx - 1.5, hy - 1, hx + 1.5, hy - 1, 2)}`;
  if (o.extra) g += o.extra(hx, hy, R);
  const flip = o.flip ? ' scale(-1,1)' : '';
  return `<g transform="translate(${x},${y}) scale(${s})${flip}">${g}</g>`;
}
function face(x, y, mood, R) {
  let g = '';
  const ey = y - 1;
  if (mood === 'happy') {
    g += `<path d="M ${x - 12} ${ey + 1} Q ${x - 8} ${ey - 5} ${x - 4} ${ey + 1}" fill="none" stroke="${K}" stroke-width="2.5" stroke-linecap="round"/>`;
    g += `<path d="M ${x + 4} ${ey + 1} Q ${x + 8} ${ey - 5} ${x + 12} ${ey + 1}" fill="none" stroke="${K}" stroke-width="2.5" stroke-linecap="round"/>`;
    g += `<path d="M ${x - 8} ${y + 9} Q ${x} ${y + 18} ${x + 8} ${y + 9} Z" fill="${DG}" stroke="${K}" stroke-width="2" stroke-linejoin="round"/>`;
  } else {
    g += `<ellipse cx="${x - 8}" cy="${ey}" rx="2.6" ry="${mood === 'surprised' ? 4 : 3.2}" fill="${K}"/><ellipse cx="${x + 8}" cy="${ey}" rx="2.6" ry="${mood === 'surprised' ? 4 : 3.2}" fill="${K}"/>`;
    if (mood === 'sad' || mood === 'crying' || mood === 'worried') {
      g += ln(x - 13, ey - 10, x - 5, ey - 7, 2.2) + ln(x + 5, ey - 7, x + 13, ey - 10, 2.2);
      g += `<path d="M ${x - 6} ${y + 14} Q ${x} ${y + 8} ${x + 6} ${y + 14}" fill="none" stroke="${K}" stroke-width="2.5" stroke-linecap="round"/>`;
      if (mood === 'crying') g += `<path d="M ${x - 10} ${ey + 5} q -2 6 0 9 q 2 -3 0 -9" fill="#9fd0ff" stroke="${K}" stroke-width="1.2"/><path d="M ${x + 10} ${ey + 5} q -2 6 0 9 q 2 -3 0 -9" fill="#9fd0ff" stroke="${K}" stroke-width="1.2"/>`;
    } else if (mood === 'surprised') {
      g += ln(x - 13, ey - 11, x - 4, ey - 12, 2.2) + ln(x + 4, ey - 12, x + 13, ey - 11, 2.2);
      g += `<ellipse cx="${x}" cy="${y + 12}" rx="4" ry="5" fill="${DG}" stroke="${K}" stroke-width="2"/>`;
    } else {
      g += `<path d="M ${x - 5} ${y + 11} Q ${x} ${y + 14} ${x + 5} ${y + 11}" fill="none" stroke="${K}" stroke-width="2.5" stroke-linecap="round"/>`;
    }
  }
  g += `<path d="M ${x - 1} ${y + 3} q 2 2 4 0" fill="none" stroke="${K}" stroke-width="1.6"/>`;
  return g;
}
function hairBack(h, x, y, R) {
  if (h === 'girl') return `<circle cx="${x + R - 2}" cy="${y - R + 6}" r="9" fill="${K}"/><circle cx="${x - R + 2}" cy="${y - R + 6}" r="9" fill="${K}"/>`;
  if (h === 'woman') return `<path d="M ${x - R - 4} ${y + 14} Q ${x - R - 6} ${y - R - 6} ${x} ${y - R - 6} Q ${x + R + 6} ${y - R - 6} ${x + R + 4} ${y + 14} Z" fill="${K}"/>`;
  if (h === 'granny') return `<circle cx="${x}" cy="${y - R - 6}" r="10" fill="#9a9a9a" stroke="${K}" stroke-width="2.5"/>`;
  return '';
}
function hairFront(h, x, y, R) {
  const top = (fill, fr) => `<path d="M ${x - R} ${y - 2} Q ${x - R} ${y - R - 4} ${x} ${y - R - 4} Q ${x + R} ${y - R - 4} ${x + R} ${y - 2} Q ${x + R * 0.5} ${y - R * fr} ${x} ${y - R * 0.5} Q ${x - R * 0.6} ${y - R * fr} ${x - R} ${y - 2} Z" fill="${fill}" stroke="${K}" stroke-width="2.5" stroke-linejoin="round"/>`;
  if (h === 'boy') return top(K, 0.75) + `<path d="M ${x - 6} ${y - R - 3} l -4 -6 l 8 3 l 2 -7 l 5 7" fill="${K}"/>`;
  if (h === 'girl' || h === 'woman') return top(K, 0.65);
  if (h === 'man') return top(K, 0.85);
  if (h === 'granny') return top('#9a9a9a', 0.7);
  if (h === 'oldman') return `<path d="M ${x - R} ${y - 2} Q ${x - R + 2} ${y - R + 6} ${x - R + 8} ${y - R + 2}" fill="none" stroke="#777" stroke-width="5"/><path d="M ${x + R} ${y - 2} Q ${x + R - 2} ${y - R + 6} ${x + R - 8} ${y - R + 2}" fill="none" stroke="#777" stroke-width="5"/>`;
  if (h === 'police') return top(K, 0.85) + `<path d="M ${x - R - 4} ${y - R + 6} L ${x + R + 4} ${y - R + 6} L ${x + R} ${y - R - 10} Q ${x} ${y - R - 18} ${x - R} ${y - R - 10} Z" fill="${DG}" stroke="${K}" stroke-width="2.5"/><rect x="${x - R - 6}" y="${y - R + 3}" width="${2 * R + 12}" height="6" rx="3" fill="${K}"/><circle cx="${x}" cy="${y - R - 4}" r="4" fill="${W}" stroke="${K}" stroke-width="1.5"/>`;
  return '';
}

// ---------- props ----------
const umbrellaOpen = (x, y, s = 1) => `<g transform="translate(${x},${y}) scale(${s})">
  <path d="M -60 0 Q -58 -50 0 -54 Q 58 -50 60 0 Q 50 -10 40 0 Q 30 -10 20 0 Q 10 -10 0 0 Q -10 -10 -20 0 Q -30 -10 -40 0 Q -50 -10 -60 0 Z" fill="${G}" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>
  ${ln(0, -54, 0, 60, 3)}<path d="M 0 60 q 0 10 -9 8" fill="none" stroke="${K}" stroke-width="3"/>
  ${ln(-20, 0, 0, -54, 1.5, DG)}${ln(20, 0, 0, -54, 1.5, DG)}</g>`;
const umbrellaClosed = (x, y) => `<g transform="translate(${x},${y})"><path d="M 0 -48 L 6 -6 L -6 -6 Z" fill="${G}" stroke="${K}" stroke-width="2.5"/>${ln(0, -6, 0, 12, 3)}</g>`;
const rain = (x0, y0, x1, y1, seed = 1) => {
  let g = ''; let r = seed;
  const R = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 46; i++) { const x = x0 + R() * (x1 - x0), y = y0 + R() * (y1 - y0); g += ln(x, y, x - 4, y + 14, 1.6, '#444'); }
  return g;
};
const ground = (y = 262) => ln(0, y, 400, y, 3);
const tree = (x, y, s = 1) => `<g transform="translate(${x},${y}) scale(${s})"><path d="M -10 0 L -8 -70 L 8 -70 L 10 0 Z" fill="${W}" stroke="${K}" stroke-width="3"/>
  <path d="M -48 -70 Q -60 -110 -30 -120 Q -20 -150 10 -142 Q 40 -150 48 -118 Q 70 -104 52 -76 Q 30 -60 0 -68 Q -30 -58 -48 -70 Z" fill="${W}" stroke="${K}" stroke-width="3"/>
  <path d="M -26 -100 q 8 -8 16 0 M 12 -112 q 8 -8 16 0 M 0 -88 q 6 -6 12 0" fill="none" stroke="${K}" stroke-width="2"/></g>`;
const bench = (x, y) => `<g transform="translate(${x},${y})"><rect x="-60" y="-34" width="120" height="10" fill="${W}" stroke="${K}" stroke-width="3"/><rect x="-60" y="-60" width="120" height="10" fill="${W}" stroke="${K}" stroke-width="3"/>${ln(-48, -24, -48, 0, 4)}${ln(48, -24, 48, 0, 4)}${ln(-48, -50, -48, -34, 3)}${ln(48, -50, 48, -34, 3)}</g>`;
const wallet = (x, y, s = 1) => `<g transform="translate(${x},${y}) scale(${s})"><rect x="-14" y="-10" width="28" height="18" rx="3" fill="${DG}" stroke="${K}" stroke-width="2.5"/>${ln(-14, -3, 14, -3, 2, K)}<circle cx="9" cy="2" r="2.5" fill="${W}"/></g>`;
const bubble = (x, y, text, w = 90) => `<g transform="translate(${x},${y})"><path d="M ${-w / 2} -22 Q ${-w / 2} -40 ${-w / 2 + 14} -40 L ${w / 2 - 14} -40 Q ${w / 2} -40 ${w / 2} -22 Q ${w / 2} -6 ${w / 2 - 14} -6 L 6 -6 L -6 8 L -4 -6 L ${-w / 2 + 14} -6 Q ${-w / 2} -6 ${-w / 2} -22 Z" fill="${W}" stroke="${K}" stroke-width="2.5" stroke-linejoin="round"/>
  <text x="0" y="-16" text-anchor="middle" font-size="18" font-family="'PingFang SC','Hiragino Sans GB','Noto Sans SC',sans-serif" font-weight="700" fill="${K}">${text}</text></g>`;
const think = (x, y, inner) => `<g transform="translate(${x},${y})"><circle cx="-26" cy="20" r="4" fill="${W}" stroke="${K}" stroke-width="2"/><circle cx="-16" cy="10" r="6" fill="${W}" stroke="${K}" stroke-width="2"/>
  <ellipse cx="14" cy="-14" rx="30" ry="22" fill="${W}" stroke="${K}" stroke-width="2.5"/>${inner}</g>`;
const sign = (x, y, text, w = 96) => `<g transform="translate(${x},${y})"><rect x="${-w / 2}" y="-20" width="${w}" height="30" fill="${W}" stroke="${K}" stroke-width="3"/><text x="0" y="3" text-anchor="middle" font-size="18" font-family="'PingFang SC','Hiragino Sans GB','Noto Sans SC',sans-serif" font-weight="700">${text}</text></g>`;
const sun = (x, y) => { let g = `<circle cx="${x}" cy="${y}" r="16" fill="${W}" stroke="${K}" stroke-width="3"/>`; for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; g += ln(x + Math.cos(a) * 22, y + Math.sin(a) * 22, x + Math.cos(a) * 30, y + Math.sin(a) * 30, 2.5); } return g; };
const cloud = (x, y, s = 1) => `<path transform="translate(${x},${y}) scale(${s})" d="M -30 0 Q -40 -18 -20 -20 Q -14 -36 4 -30 Q 20 -40 28 -22 Q 44 -20 36 0 Z" fill="${W}" stroke="${K}" stroke-width="2.5"/>`;
const heart = (x, y, s = 1) => `<path transform="translate(${x},${y}) scale(${s})" d="M 0 8 C -14 -2 -12 -14 -4 -14 C 0 -14 0 -10 0 -9 C 0 -10 0 -14 4 -14 C 12 -14 14 -2 0 8 Z" fill="${G}" stroke="${K}" stroke-width="2"/>`;
const motion = (x, y, dir = 1) => ln(x, y, x + 14 * dir, y - 4, 2) + ln(x + 2 * dir, y + 8, x + 16 * dir, y + 6, 2) + ln(x, y + 16, x + 14 * dir, y + 16, 2);
const bags = (x, y) => `<g transform="translate(${x},${y})"><path d="M -14 -26 L 14 -26 L 16 6 L -16 6 Z" fill="${G}" stroke="${K}" stroke-width="2.5"/><path d="M -7 -26 q 7 -14 14 0" fill="none" stroke="${K}" stroke-width="2.5"/><path d="M -10 -24 l 4 -10 M 4 -26 l 6 -8" stroke="${K}" stroke-width="2"/></g>`;
const ball = (x, y, r = 13) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${W}" stroke="${K}" stroke-width="2.5"/><path d="M ${x - 5} ${y - 4} l 5 -4 l 5 4 l -2 6 h -6 Z" fill="${K}"/>`;
const vase = (x, y, broken = false) => broken
  ? `<g transform="translate(${x},${y})"><path d="M -24 0 l 8 -10 l 6 8 Z M -6 0 l 4 -14 l 8 6 l -2 8 Z M 12 0 l 6 -8 l 8 8 Z" fill="${G}" stroke="${K}" stroke-width="2"/><path d="M 30 -2 q 10 -16 22 -6" fill="none" stroke="${K}" stroke-width="2"/><path d="M -40 -2 q -6 -10 4 -14" fill="none" stroke="${K}" stroke-width="2"/></g>`
  : `<g transform="translate(${x},${y})"><path d="M -10 0 Q -18 -20 -8 -34 L -6 -44 L 6 -44 L 8 -34 Q 18 -20 10 0 Z" fill="${G}" stroke="${K}" stroke-width="2.5"/><path d="M -2 -44 q -10 -16 -16 -12 M 2 -44 q 6 -18 14 -14 M 0 -44 v -16" fill="none" stroke="${K}" stroke-width="2"/><circle cx="-18" cy="-58" r="5" fill="${W}" stroke="${K}" stroke-width="2"/><circle cx="16" cy="-60" r="5" fill="${W}" stroke="${K}" stroke-width="2"/><circle cx="0" cy="-64" r="5" fill="${W}" stroke="${K}" stroke-width="2"/></g>`;
const table = (x, y, w = 90) => `<g transform="translate(${x},${y})"><rect x="${-w / 2}" y="-52" width="${w}" height="10" fill="${W}" stroke="${K}" stroke-width="3"/>${ln(-w / 2 + 8, -42, -w / 2 + 8, 0, 4)}${ln(w / 2 - 8, -42, w / 2 - 8, 0, 4)}</g>`;
const sofa = (x, y) => `<g transform="translate(${x},${y})"><path d="M -70 -10 L -70 -70 Q -70 -80 -60 -80 L 60 -80 Q 70 -80 70 -70 L 70 -10 Z" fill="${W}" stroke="${K}" stroke-width="3"/><rect x="-80" y="-48" width="22" height="48" rx="6" fill="${W}" stroke="${K}" stroke-width="3"/><rect x="58" y="-48" width="22" height="48" rx="6" fill="${W}" stroke="${K}" stroke-width="3"/><rect x="-58" y="-40" width="116" height="30" fill="${G}" stroke="${K}" stroke-width="3"/></g>`;
const windowFrame = (x, y, w = 90, h = 70) => `<g transform="translate(${x},${y})"><rect x="0" y="0" width="${w}" height="${h}" fill="${W}" stroke="${K}" stroke-width="3"/>${ln(w / 2, 0, w / 2, h, 2.5)}${ln(0, h / 2, w, h / 2, 2.5)}</g>`;
const doorFrame = (x, y, w = 70, h = 150) => `<g transform="translate(${x},${y})"><rect x="0" y="${-h}" width="${w}" height="${h}" fill="${W}" stroke="${K}" stroke-width="3"/><circle cx="${w - 12}" cy="${-h / 2}" r="4" fill="${K}"/></g>`;
const schoolGate = () => `<rect x="0" y="40" width="400" height="10" fill="${G}" stroke="${K}" stroke-width="2.5"/>${ln(0, 50, 400, 50, 3)}
  <rect x="30" y="50" width="22" height="212" fill="${W}" stroke="${K}" stroke-width="3"/><rect x="348" y="50" width="22" height="212" fill="${W}" stroke="${K}" stroke-width="3"/>
  ${sign(200, 24, '学校', 80)}`;
const zebra = (y = 262) => { let g = `<rect x="0" y="${y}" width="400" height="38" fill="${G}"/>`; for (let x = 20; x < 400; x += 46) g += `<rect x="${x}" y="${y + 6}" width="26" height="26" fill="${W}" stroke="${K}" stroke-width="2"/>`; return g + ln(0, y, 400, y, 3); };
const trafficLight = (x, y, man = 'red') => `<g transform="translate(${x},${y})">${ln(0, 0, 0, -130, 6)}<rect x="-16" y="-180" width="32" height="56" rx="6" fill="${W}" stroke="${K}" stroke-width="3"/>
  <circle cx="0" cy="-165" r="9" fill="${man === 'red' ? K : W}" stroke="${K}" stroke-width="2"/><circle cx="0" cy="-139" r="9" fill="${man === 'green' ? K : W}" stroke="${K}" stroke-width="2"/></g>`;
const policePost = () => `<rect x="250" y="70" width="150" height="192" fill="${W}" stroke="${K}" stroke-width="3"/>${sign(325, 98, '警察局', 100)}${windowFrame(272, 130, 60, 50)}${doorFrame(340, 262, 46, 110)}`;
const frame = (inner) => `<rect x="1.5" y="1.5" width="397" height="297" fill="${W}"/>${inner}<rect x="1.5" y="1.5" width="397" height="297" fill="none" stroke="${K}" stroke-width="3"/>`;
const holdUmbrellaUp = (hx, hy) => umbrellaOpen(hx + 6, hy - 64, 0.9);
const holdWallet = (hx, hy) => wallet(hx, hy - 6, 0.8);
const holdBag = (hx, hy) => bags(hx, hy + 26);

// ---------- stories ----------
export const STORIES = [
  {
    id: 'umbrella', title: '下雨天', en: 'A rainy day',
    words: ['放学', '下雨', '着急', '雨伞', '一起', '关心', '感谢', '乐于助人'],
    panels: [
      frame(schoolGate() + ground() + rain(60, 60, 340, 250, 3)
        + person(140, 262, { hair: 'girl', mood: 'neutral', skirt: true, collar: true, holdR: (x, y) => umbrellaClosed(x + 4, y + 10), arms: [10, 4, 8, 30] })
        + person(250, 262, { hair: 'boy', mood: 'worried', collar: true, arms: [30, 120, 30, 120] })
        + think(300, 120, rain(-10, -30, 40, 0, 7))),
      frame(schoolGate() + ground() + rain(60, 60, 340, 250, 5)
        + person(150, 262, { hair: 'girl', mood: 'happy', skirt: true, collar: true, arms: [10, 4, 70, 80], holdR: (x, y) => umbrellaOpen(x + 30, y - 30, 0.75) })
        + person(270, 262, { hair: 'boy', mood: 'surprised', collar: true, arms: [10, 5, 10, 5] })),
      frame(ground() + rain(0, 0, 400, 250, 9)
        + `<ellipse cx="80" cy="276" rx="40" ry="8" fill="${G}" stroke="${K}" stroke-width="2"/><ellipse cx="330" cy="282" rx="34" ry="7" fill="${G}" stroke="${K}" stroke-width="2"/>`
        + person(175, 262, { hair: 'girl', mood: 'happy', skirt: true, collar: true, walk: 0.6, arms: [10, 6, 30, 150], holdR: (x, y) => umbrellaOpen(x + 14, y - 74, 1.15) })
        + person(240, 262, { hair: 'boy', mood: 'happy', collar: true, walk: 0.6, arms: [12, 6, 12, 6] })),
      frame(ground() + sun(340, 50) + cloud(70, 60) + doorFrame(40, 262, 80, 170)
        + person(140, 262, { kind: 'adult', hair: 'woman', mood: 'happy', skirt: true, arms: [20, 10, 40, 110] })
        + person(250, 262, { hair: 'girl', mood: 'happy', skirt: true, collar: true, holdR: (x, y) => umbrellaClosed(x + 4, y + 10) })
        + person(320, 262, { hair: 'boy', mood: 'happy', collar: true, arms: [150, 170, 12, 6] })
        + bubble(150, 52, '谢谢你！')),
    ],
  },
  {
    id: 'wallet', title: '捡到钱包', en: 'The lost wallet',
    words: ['公园', '散步', '钱包', '捡到', '警察', '失主', '拾金不昧', '称赞'],
    panels: [
      frame(ground() + tree(70, 262) + bench(270, 262) + sun(350, 48) + wallet(210, 258)
        + person(150, 262, { hair: 'boy', mood: 'surprised', stripes: true, walk: 0.4, arms: [20, 40, 20, 40] })
        + `<path d="M 186 214 l 14 26 M 194 210 l 14 22" stroke="${K}" stroke-width="2" stroke-dasharray="4 4"/>`),
      frame(ground() + tree(70, 262) + bench(290, 262)
        + person(190, 262, { hair: 'boy', mood: 'worried', stripes: true, look: -4, arms: [30, 130, 40, 140], holdR: holdWallet })
        + think(250, 70, `<text x="14" y="-6" text-anchor="middle" font-size="28" font-weight="700">?</text>`)),
      frame(ground() + policePost()
        + person(130, 262, { hair: 'boy', mood: 'neutral', stripes: true, arms: [10, 5, 60, 80], holdR: holdWallet })
        + person(225, 262, { kind: 'adult', hair: 'police', mood: 'happy', shirt: G, tie: true, arms: [12, 6, 55, 85] })),
      frame(ground() + tree(340, 262, 0.9) + sun(60, 50)
        + person(140, 262, { hair: 'boy', mood: 'happy', stripes: true, arms: [12, 6, 50, 70] })
        + person(250, 262, { kind: 'adult', hair: 'oldman', glasses: true, mood: 'happy', collar: true, arms: [50, 80, 12, 6], holdR: holdWallet })
        + bubble(250, 50, '谢谢你！') + heart(196, 140, 1.2)),
    ],
  },
  {
    id: 'vase', title: '打破花瓶', en: 'The broken vase',
    words: ['客厅', '踢球', '不小心', '花瓶', '打破', '害怕', '诚实', '原谅'],
    panels: [
      frame(ground() + windowFrame(40, 50) + table(310, 262) + vase(310, 210)
        + person(150, 262, { hair: 'boy', mood: 'happy', stripes: true, walk: 0.8, arms: [40, 60, 40, 60] })
        + ball(225, 236) + motion(240, 228, 1)),
      frame(ground() + windowFrame(40, 50) + table(310, 262) + vase(300, 258, true) + ball(360, 248)
        + person(160, 262, { hair: 'boy', mood: 'surprised', stripes: true, arms: [150, 30, 150, 30] })
        + `<text x="262" y="200" font-size="22" font-weight="800">啪!</text>`),
      frame(ground() + doorFrame(300, 262, 80, 170) + vase(130, 258, true)
        + person(310, 262, { kind: 'adult', hair: 'woman', mood: 'surprised', skirt: true, arms: [20, 10, 30, 20], holdR: holdBag })
        + person(190, 262, { hair: 'boy', mood: 'sad', stripes: true, arms: [10, -20, 10, -20] })
        + bubble(190, 104, '对不起！', 104)),
      frame(ground() + sofa(200, 262) + sun(352, 46)
        + person(150, 262, { kind: 'adult', hair: 'woman', mood: 'happy', skirt: true, arms: [20, 10, 60, 100] })
        + person(250, 262, { hair: 'boy', mood: 'happy', stripes: true, arms: [12, 6, 12, 6] })
        + heart(200, 80, 1.4)),
    ],
  },
  {
    id: 'crossing', title: '帮老奶奶过马路', en: 'Helping Grandma cross the road',
    words: ['马路', '老奶奶', '吃力', '红绿灯', '斑马线', '小心', '感激', '帮助'],
    panels: [
      frame(zebra() + trafficLight(360, 262, 'red') + cloud(80, 50)
        + person(150, 262, { kind: 'adult', hair: 'granny', glasses: true, mood: 'worried', skirt: G, arms: [14, 6, 14, 6], holdL: holdBag, holdR: holdBag })
        + person(280, 262, { hair: 'girl', mood: 'neutral', skirt: true, collar: true, walk: 0.5, look: -4, arms: [12, 6, 12, 6] })),
      frame(zebra() + trafficLight(360, 262, 'red')
        + person(150, 262, { kind: 'adult', hair: 'granny', glasses: true, mood: 'surprised', skirt: G, arms: [14, 6, 14, 6], holdL: holdBag })
        + person(250, 262, { hair: 'girl', mood: 'happy', skirt: true, collar: true, arms: [60, 80, 12, 6] })
        + bubble(260, 92, '我来帮您！', 112)),
      frame(zebra() + trafficLight(360, 262, 'green')
        + person(150, 262, { kind: 'adult', hair: 'granny', glasses: true, mood: 'happy', skirt: G, walk: 0.5, arms: [14, 6, 40, 30] })
        + person(235, 262, { hair: 'girl', mood: 'happy', skirt: true, collar: true, walk: 0.5, arms: [40, 30, 14, 6], holdR: holdBag })
        + motion(300, 200, 1)),
      frame(ground() + tree(60, 262, 0.9) + sun(340, 48)
        + person(170, 262, { kind: 'adult', hair: 'granny', glasses: true, mood: 'happy', skirt: G, arms: [50, 70, 14, 6] })
        + person(260, 262, { hair: 'girl', mood: 'happy', skirt: true, collar: true, arms: [12, 6, 12, 6] })
        + bubble(170, 52, '谢谢你，好孩子！', 150) + heart(222, 150, 1.2)),
    ],
  },
];

// the 4 panels as one 2 x 2 SVG, numbered like a workbook
export function storySVG(story, { width = '100%' } = {}) {
  const cells = story.panels.map((p, i) => {
    const x = (i % 2) * 410, y = Math.floor(i / 2) * 310;
    return `<g transform="translate(${x},${y})">${p}<rect x="10" y="10" width="26" height="26" fill="#fff" stroke="#111" stroke-width="2.5"/><text x="23" y="30" text-anchor="middle" font-size="18" font-weight="800" font-family="sans-serif">${i + 1}</text></g>`;
  }).join('');
  return `<svg class="story-svg" viewBox="0 0 810 610" width="${width}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${story.title}">${cells}</svg>`;
}
export const storyById = (id) => STORIES.find((s) => s.id === id);
