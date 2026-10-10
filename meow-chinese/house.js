// The kitten's house, shared by her own home page and by visits to a friend's house:
// one fixed layout size, the furniture, the cats walking around, speech bubbles and the chat bar.
import { ITEMS, drawGrid, artGrid, ROOM_WINDOW, kittenGrid } from './pixel.js';
import { get as getState, roomNeighbors, UNLOCKS, roomInfo, isAdmin } from './state.js';
import { KittenView, esc, html } from './ui.js';
import { sfx, hushMusic } from './audio.js';
// a film's sound is on: the game's music goes quiet until it's muted again (or the screen goes away)
let loudVideo = null;
function screenSound(v) {
  if (!v.muted) { if (loudVideo && loudVideo !== v) { loudVideo.muted = true; const b = loudVideo.parentElement && loudVideo.parentElement.querySelector('.vid-sound'); if (b) b.textContent = '🔇'; } loudVideo = v; hushMusic(true); }
  else if (loudVideo === v) { loudVideo = null; hushMusic(false); }
}
setInterval(() => { if (loudVideo && (!loudVideo.isConnected || loudVideo.muted)) { loudVideo = null; hushMusic(false); } }, 1000);

export const HOUSE = { w: 720, roof: 48, room: 600, kitten: 4, decor: 5 };   // kitten: was 7, then 5, now 4 (20% smaller again)
const ROOM_ARROW = 40;   // screen px kept free on each side for the ◀ ▶ room arrows
export let houseK = 1;

// scale the fixed-size house to fit its box (the arrows sit outside it)
export function fitHouse(box, unit) {
  if (!box || !unit) return;
  const side = box.querySelector('.room-nav') ? (window.innerWidth <= 600 ? 28 : ROOM_ARROW) : 0;
  const k = Math.min((box.clientWidth - 2 * side) / HOUSE.w, box.clientHeight / (HOUSE.roof + HOUSE.room)) || 1;
  houseK = k;
  unit.style.setProperty('--k', k); unit.style.setProperty('--inv', 1 / k);
  box.style.setProperty('--gap', `${Math.max(0, (box.clientWidth - HOUSE.w * k) / 2)}px`);
}

// ◀ ▶ ▲ ▼ buttons to the rooms next to this one (locked ones show greyed, or are left out)
export function roomArrowsHtml(key, isOpen, { showLocked = true } = {}) {
  const sym = { left: '◀', right: '▶', up: '▲', down: '▼' };
  return Object.entries(roomNeighbors(key)).filter(([, r]) => r).map(([d, r]) => {
    const open = isOpen(r.key); if (!open && !showLocked) return '';
    return `<button class="room-nav ${d} ${open ? '' : 'locked'}" data-room="${r.key}" aria-label="${r.en}${open ? '' : ` (Lv${UNLOCKS[r.lock]})`}">${sym[d]}</button>`;
  }).join('');
}
// the swimming pool: a square pool standing on the floor that she can drag around (🪑 Move furniture)
const POOL_W = 40, POOL_H = 35;   // art pixels
function poolGrid() {
  const g = [];
  for (let y = 0; y < POOL_H; y++) {
    const row = [];
    for (let x = 0; x < POOL_W; x++) {
      const edge = x < 2 || y < 2 || x >= POOL_W - 2 || y >= POOL_H - 2;
      let c = edge ? (((x + y) % 4 === 0) ? '#c9d3de' : '#eef2f6') : (y < 4 ? '#2f97cc' : '#3fb4ea');
      if (!edge && y >= 4 && y % 5 === 2 && ((x + Math.floor(y / 5) * 6) % 12) < 5) c = '#9fe3ff';
      if (x === 0 || y === 0 || x === POOL_W - 1 || y === POOL_H - 1) c = '#3a2a35';
      // a little ladder at the back corner
      if ((x === POOL_W - 7 || x === POOL_W - 4) && y >= 1 && y <= 8) c = '#9fb3c8';
      if (x > POOL_W - 7 && x < POOL_W - 4 && (y === 3 || y === 6)) c = '#9fb3c8';
      row.push(c);
    }
    g.push(row);
  }
  return g;
}
function poolEl({ id, css }) {
  const wrap = document.createElement('div');
  wrap.className = 'decor flat movable pool-el'; wrap.dataset.id = id; wrap.style.cssText = css;
  const c = document.createElement('canvas'); drawGrid(c, poolGrid(), HOUSE.decor);
  const shine = document.createElement('div'); shine.className = 'pool-shine';
  wrap.append(c, shine);
  return wrap;
}
// is this spot (percent of the room: x across, y up from the bottom) in the water?
export function inPool(roomEl, x, y) {
  const el = roomEl && roomEl.querySelector('.pool-el'); if (!el) return false;
  const W = roomEl.clientWidth || 1, H = roomEl.clientHeight || 1;
  const x0 = (el.offsetLeft / W) * 100, x1 = ((el.offsetLeft + el.offsetWidth) / W) * 100;
  const y0 = ((H - el.offsetTop - el.offsetHeight) / H) * 100, y1 = ((H - el.offsetTop) / H) * 100;
  return x > x0 + 3 && x < x1 - 3 && y > y0 + 1 && y < y1 - 6;
}

// where each home item sits inside the room (percent of the room box)
export const DECOR_POS = {
  ceiling: 'left:27%;top:0',
  'wall-left': 'left:5%;top:9%',
  'wall-right': 'right:7%;top:5%',
  shelf: 'right:5%;top:24%',
  curtain: 'curtain',
  'back-left': 'left:2%;bottom:30%',
  'back-mid-left': 'left:21%;bottom:31%',
  'back-mid-right': 'right:25%;bottom:31%',
  'back-right': 'right:2%;bottom:29%',
  'front-left': 'left:2%;bottom:3%',
  plant: 'left:21%;bottom:3%',
  'toy-left': 'left:32%;bottom:2%',
  'toy-right': 'right:32%;bottom:2%',
  house: 'right:17%;bottom:3%',
  'front-right': 'right:2%;bottom:3%',
  bench: 'left:9%;bottom:25%',
  'wall-mid': 'left:24%;top:10%',
  mirror: 'left:3%;top:1%',
  hang: 'left:30%;top:0',
  hang2: 'left:62%;top:0',
  cinemascreen: 'left:21%;top:0',
  projector: 'left:6%;top:0',
};

// the studio's wooden barre runs along the wall IN FRONT of wall things like the mirror
export function studioBarre(roomEl, on) {
  let el = roomEl.querySelector('.studio-barre');
  if (!on) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.className = 'studio-barre'; el.innerHTML = '<i></i><i></i><i></i><i></i>'; roomEl.appendChild(el); }
}
// the furniture standing in one room: [{ id, css, kind: 'curtain' | 'flat' | 'stand' }]
export function roomLayout(s, roomKey, roomOf) {
  const pos = s.decorPos || {};
  return (s.owned || []).filter((id) => ITEMS[id] && ITEMS[id].cat === 'decor' && !(s.decorHidden || []).includes(id) && roomOf(id) === roomKey).map((id) => {
    const it = ITEMS[id], spot = DECOR_POS[it.spot] || 'left:10%;bottom:10%', saved = pos[id];
    // window coverings hang from just above the window to just below it, as wide as the window plus a little
    if (spot === 'curtain' && roomKey === 'garden') return null;   // no window outside
    if (spot === 'curtain') return { id, kind: 'curtain', closed: !!(s.curtainClosed || {})[id], css: `left:${(ROOM_WINDOW.x0 + ROOM_WINDOW.x1) * 50}%;top:${ROOM_WINDOW.y0 * 100 - 4}%;width:${(ROOM_WINDOW.x1 - ROOM_WINDOW.x0) * 100 + 12}%;height:${(ROOM_WINDOW.y1 - ROOM_WINDOW.y0) * 100 + 7}%;transform:translateX(-50%);z-index:1` };
    const flat = it.spot === 'rug' || it.spot === 'under';
    let css = saved ? `left:${saved.x}%;top:${saved.y}%` : flat ? `left:50%;bottom:${it.spot === 'rug' ? 2 : 3}%;transform:translateX(-50%)` : spot;
    // a second or third copy that hasn't been dragged anywhere yet: nudge it so it doesn't hide the first one
    const copy = !saved && id.includes('#') ? (parseInt(id.split('#')[1], 10) || 2) - 1 : 0;
    if (copy) {
      const dx = (copy % 2 ? 1 : -1) * 6 * Math.ceil(copy / 2);
      css = css.replace(/(left|right):(-?[\d.]+)%/, (m, side, v) => `${side}:${Math.max(0, Math.min(80, +v + (side === 'left' ? dx : -dx)))}%`)
        .replace(/(bottom):(-?[\d.]+)%/, (m, side, v) => `bottom:${+v + 2 * copy}%`);
    }
    const photo = it.frame ? (s.framePhotos || {})[id] || null : null;   // a photo she put in a frame
    const text = it.board ? ((s.boardTexts || {})[id] ?? it.board.def) : null;   // what's written on a menu board
    const sv = it.video && (s.screenVideos || {})[id], video = sv ? { url: sv.url, at: sv.at } : null;   // a film on the projector screen
    // a pet cage shows the water bottle, wheel… she bought for that pet, and an open door while the pet is out
    const cage = it.cage ? { things: (s.owned || []).filter((x) => ITEMS[x] && ITEMS[x].cat === 'petacc' && (ITEMS[x].cageFor || []).includes(it.cage) && !(s.cageOff || []).includes(x)), open: !!((s.pets || []).find((p) => p.kind === it.cage) || {}).out } : null;
    const fv = (s.facing || {})[id];
    const back = ((it.frames && it.frames.back) || it.flip) && fv === 'back';   // turned round (or sideways)
    const front = it.frames && it.frames.front && fv === 'front';            // facing straight into the room
    const layer = (s.decorLayer || {})[id] || 0;
    const opened = it.tapOpen && !!(s.openThings || {})[id];   // changing cubicle: curtain pulled open   // dragged on top of something: stays in front of it
    return { id, kind: flat ? 'flat' : 'stand', css, ...(photo ? { photo } : {}), ...(cage ? { cage } : {}), ...(back ? { facing: 'back' } : front ? { facing: 'front' } : {}), ...(layer ? { layer } : {}), ...(opened ? { opened } : {}), ...(text != null ? { text } : {}), ...(video ? { video } : {}) };
  }).filter(Boolean).concat(((s.roomStyle || {})[roomKey] || {}).pool ? [(() => {
    // the swimming pool (from 🎨 Renovate): she can move it like furniture
    const id = `@pool-${roomKey}`, saved = pos[id];
    return { id, kind: 'pool', css: saved ? `left:${saved.x}%;top:${saved.y}%` : 'left:38%;bottom:2%' };
  })()] : []);
}
// a window covering drawn shut: side curtains meet in the middle, blinds come all the way down
export function closedCurtain(g) {
  const H = g.length, W = g[0].length, mid = Math.floor(H / 2), cx = Math.floor(W / 2);
  const out = g.map((r) => r.slice());
  if (g[mid][0] && !g[mid][cx]) {
    let pw = 0; while (pw < W && g[mid][pw]) pw++;
    // each side panel spreads to the middle, repeating its own folds, and the two edges meet there
    for (let y = 2; y < H; y++) for (let x = pw - 1; x <= W - pw; x++) {
      if (!g[y][1] && !out[y][x]) continue;
      const left = x < cx, mx = left ? x : W - 1 - x, src = 1 + ((mx - 1) % Math.max(1, pw - 2));
      out[y][x] = (x === cx - 1 || x === cx) ? (left ? g[y][pw - 1] : g[y][W - pw]) : (left ? g[y][src] : g[y][W - 1 - src]);
    }
    return out;
  }
  let B = 2; for (let y = 2; y < H; y++) if (g[y][cx]) B = y;
  const same = (a, b) => a.join() === b.join();
  let p = 1; for (let q = 2; q <= 6; q++) if (B - 2 * q >= 2 && same(g[B - 1], g[B - 1 - q]) && same(g[B - 2], g[B - 2 - q])) { p = q; break; }
  const body = Math.max(2, B - p);
  for (let y = B; y < H - 1; y++) out[y] = g[body + ((y - B) % p)].slice();
  out[H - 1] = g[B].slice();
  return out;
}
// one piece of furniture as a page element
export function decorEl({ id, css, kind, photo, closed, cage, facing, layer, opened, text, video }, { putAway = false, videoPick = putAway && isAdmin(), videoOwner = videoPick } = {}) {
  if (kind === 'pool') return poolEl({ id, css });
  const it = ITEMS[id]; if (!it) return null;
  const c = document.createElement('canvas');
  const art = (cage && cage.open || opened) && it.frames && it.frames.open ? it.frames.open : facing === 'front' && it.frames && it.frames.front ? it.frames.front : facing === 'back' && !it.flip && it.frames && it.frames.back ? it.frames.back : it.art;
  const flipped = facing === 'back' && it.flip;   // turned sideways: drawn the other way round
  if (flipped) c.style.scale = '-1 1';
  const g = artGrid(art, it.pal);
  drawGrid(c, kind === 'curtain' && closed ? closedCurtain(g) : g, HOUSE.decor * (it.size || 1));   // some small things are drawn smaller
  const wrap = document.createElement('div');
  wrap.className = 'decor';
  wrap.dataset.id = id;
  wrap.style.cssText = css;
  if (kind === 'curtain') { wrap.classList.add('curtain'); if (closed) wrap.classList.add('closed'); }
  else { wrap.classList.add('movable'); if (kind === 'flat') wrap.classList.add('flat'); }
  if (it.playable) wrap.classList.add('playable');
  if (it.seat) wrap.classList.add('seat');
  if (it.frame) {
    wrap.classList.add('frame');
    if (photo) {
      const img = document.createElement('img'); img.className = 'frame-photo'; img.alt = ''; img.src = photo;
      const f = it.frame; img.style.cssText = `left:${f.x * 100}%;top:${f.y * 100}%;width:${f.w * 100}%;height:${f.h * 100}%`;
      wrap.appendChild(img);
    }
  }
  if (it.label && (it.labelBox || it.screen)) {
    // words on a screen (the kiosk's "Order Here") or a plaque (the collection counter's "Collection")
    const box = it.labelBox || it.screen;
    const lb = document.createElement('div'); lb.className = `screen-label ${it.labelStyle || ''}`; lb.textContent = it.label;
    Object.assign(lb.style, { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` });
    wrap.appendChild(lb);
  }
  if (it.counter) {
    // the waiter: a white cat in a tuxedo who always stands behind the collection counter
    const tux = document.createElement('div'); tux.className = 'tux-cat';
    const tw = document.createElement('div'); tw.className = 'kitten-wrap';
    const tkv = new KittenView({ scale: HOUSE.kitten, fur: 'white', equipped: { body: 'tuxedo', neck: 'bowtie' } });
    tkv.setMood('happy'); tkv.canvas.classList.remove('bob');
    tw.appendChild(tkv.canvas); tux.appendChild(tw); wrap.insertBefore(tux, wrap.firstChild);
    wrap.tux = { el: tux, wrap: tw, kv: tkv };
  }
  if (it.board) {
    // a menu board: chalk writing she can change (tap it)
    wrap.classList.add('board');
    const t = document.createElement('div'); t.className = 'board-text';
    const b = it.board; Object.assign(t.style, { left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` });
    t.textContent = text ?? b.def;
    wrap.appendChild(t);
  }
  if (it.power) {
    wrap.dataset.power = it.power;
    if (it.power === 'tv') {
      const sc = Object.assign(document.createElement('i'), { className: 'tv-screen' });
      if (it.screen) Object.assign(sc.style, { left: `${it.screen.x * 100}%`, top: `${it.screen.y * 100}%`, width: `${it.screen.w * 100}%`, height: `${it.screen.h * 100}%` });   // e.g. the laptop's screen
      wrap.appendChild(sc);
      if (video && video.url) {
        // a film playing on the screen: everyone sees the same part (it started at video.at); tap 🔇 for sound
        const v = document.createElement('video'); v.className = 'screen-video';
        v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
        v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.setAttribute('autoplay', ''); v.setAttribute('loop', '');
        v.src = video.url;
        Object.assign(v.style, { left: sc.style.left, top: sc.style.top, width: sc.style.width, height: sc.style.height });
        const sync = () => { if (v.duration > 0) { try { v.currentTime = ((Date.now() - (video.at || 0)) / 1000) % v.duration; } catch {} } };
        v.addEventListener('loadedmetadata', sync);
        v.addEventListener('play', sync, { once: true });
        const btn = (cls, txt, title) => { const x = document.createElement('button'); x.type = 'button'; x.className = cls; x.textContent = txt; x.title = title; x.addEventListener('pointerdown', (e) => e.stopPropagation()); return x; };
        const snd = btn('vid-sound', '🔇', 'Sound'), play = btn(`vid-play ${videoOwner ? 'owner' : ''}`, '▶️', 'Play / stop');
        const show = () => { play.textContent = v.paused ? '▶️' : '⏸️'; wrap.classList.toggle('vid-paused', v.paused); };
        v.addEventListener('play', show); v.addEventListener('pause', show);
        // start it (phones may refuse until someone taps — then the ▶️ button / a tap on the screen starts it)
        v.startFilm = () => { if (v.dataset.stopped) return; const p = v.play(); if (p) p.catch(() => show()); };
        snd.onclick = (e) => {
          e.stopPropagation();
          v.muted = !v.muted; snd.textContent = v.muted ? '🔇' : '🔊';
          if (!v.muted) { delete v.dataset.stopped; sync(); v.play().catch(() => {}); }
          screenSound(v);
        };
        play.onclick = (e) => {
          e.stopPropagation();
          if (videoOwner) { play.dispatchEvent(new CustomEvent('screen-power', { bubbles: true, detail: { id } })); return; }   // the owner: on / off for everyone
          if (v.paused) { delete v.dataset.stopped; sync(); v.play().catch(() => {}); }
          else { v.dataset.stopped = '1'; v.pause(); if (!v.muted) { v.muted = true; snd.textContent = '🔇'; screenSound(v); } }
        };
        // a tap on the screen itself: start the film if it isn't playing
        wrap.addEventListener('click', (e) => { if (e.target.closest('button') || !v.paused || wrap.classList.contains('off')) return; delete v.dataset.stopped; sync(); v.play().catch(() => {}); });
        wrap.classList.add('has-film', 'vid-paused');
        wrap.append(v, snd, play);
        requestAnimationFrame(() => { if (!wrap.classList.contains('off')) v.startFilm(); });
      }
      if (videoPick) {
        const pk = document.createElement('button'); pk.type = 'button'; pk.className = 'vid-pick'; pk.textContent = '🎞️'; pk.title = 'Choose a video';
        pk.addEventListener('pointerdown', (e) => e.stopPropagation());
        pk.onclick = (e) => { e.stopPropagation(); pk.dispatchEvent(new CustomEvent('screen-video', { bubbles: true, detail: { id } })); };
        wrap.appendChild(pk);
      }
    }
  }
  if (it.spin) {
    // a fan: the round head (blades spin, and it turns side to side) on a pole that stays still
    const g = artGrid(it.art, it.pal), sp = it.spin, inRing = (x, y) => Math.hypot(x - sp.cx, y - sp.cy) <= sp.r;
    drawGrid(c, g.map((row, y) => row.map((v, x) => (inRing(x, y) ? null : v))), HOUSE.decor);
    const head = document.createElement('div'); head.className = 'spin-head';
    const ring = document.createElement('canvas'); ring.className = 'spin-ring';
    drawGrid(ring, g.slice(0, sp.cy * 2 + 1).map((row, y) => row.slice(0, sp.cx * 2 + 1).map((v, x) => (inRing(x, y) ? v : null))), HOUSE.decor);
    head.appendChild(ring); wrap.append(c, head);
  } else wrap.appendChild(c);
  if (it.ride) {
    // playground rides: the part that moves is drawn on its own layer (the swing's seat, the see-saw's plank, the merry-go-round's turning frames)
    wrap.classList.add('ride'); wrap.dataset.ride = it.ride.kind;
    const sc = HOUSE.decor * (it.size || 1);
    if (it.ride.kind === 'merry') {
      const grids = Array.from({ length: it.ride.n }, (_, k) => artGrid(it.frames[`m${k}`], it.pal));
      const box = document.createElement('div'); box.className = 'ride-part';
      const strip = document.createElement('canvas'); strip.className = 'ride-strip';
      drawGrid(strip, grids[0].map((row, y) => grids.flatMap((gk) => gk[y])), sc);
      box.appendChild(strip); wrap.appendChild(box);
    } else {
      drawGrid(c, artGrid(it.frames.base, it.pal), sc);
      const part = document.createElement('canvas'); part.className = 'ride-part';
      drawGrid(part, artGrid(it.frames.part, it.pal), sc);
      part.style.transformOrigin = `${it.ride.px * 100}% ${it.ride.py * 100}%`;
      wrap.appendChild(part);
    }
  }
  if (it.slide) wrap.classList.add('slidey');
  if (cage) {
    wrap.classList.add('cage'); wrap.dataset.cage = it.cage; if (cage.open) wrap.classList.add('door-open');
    const W = artGrid(it.art, it.pal)[0].length, H = it.art.length, inner = it.cageW || W;
    cage.things.forEach((tid) => {
      const t = ITEMS[tid]; if (!t || !t.inCage) return;
      let tc;
      if (t.wheel) {
        // a wheel: the ring (which spins while the hamster runs) and its stand, drawn separately
        const g = artGrid(t.art, t.pal), w = t.wheel;
        const inRing = (x, y) => Math.hypot(x - w.cx, y - w.cy) <= w.r;
        const ring = document.createElement('canvas'); ring.className = 'wheel-ring';
        drawGrid(ring, g.slice(0, w.cy * 2 + 1).map((row, y) => row.slice(0, w.cx * 2 + 1).map((c, x) => (inRing(x, y) ? c : null))), HOUSE.decor * (t.inCage.s || 1));
        const stand = document.createElement('canvas'); stand.className = 'wheel-stand';
        drawGrid(stand, g.map((row, y) => row.map((c, x) => (inRing(x, y) ? null : c))), HOUSE.decor * (t.inCage.s || 1));
        tc = document.createElement('div'); tc.className = 'cage-thing wheel'; tc.dataset.id = tid;
        tc.style.width = stand.style.width; tc.style.height = stand.style.height;
        tc.append(stand, ring);
      } else {
        tc = document.createElement('canvas'); tc.className = 'cage-thing';
        drawGrid(tc, artGrid(t.art, t.pal), HOUSE.decor * (t.inCage.s || 1));   // things in a cage are drawn a bit smaller
      }
      Object.assign(tc.style, { left: `${((1 + t.inCage.x * (inner - 2 - t.art[0].length * (t.inCage.s || 1))) / W) * 100}%`, bottom: `${t.inCage.y * 100}%`, zIndex: t.inCage.z });   // keep the size drawGrid set (sharp screens draw at 2×)
      wrap.appendChild(tc);
    });
    // the cage's bars in front of everything inside it (only the bedding stays behind)
    const back = new Set([it.pal.z, it.pal.y].filter(Boolean));
    const front = document.createElement('canvas'); front.className = 'cage-front';
    drawGrid(front, g.map((row) => row.map((v) => (back.has(v) ? null : v))), HOUSE.decor * (it.size || 1));
    wrap.appendChild(front);
    wrap.dataset.inner = (inner / W).toFixed(3);
    wrap.dataset.floor = ((7 / H) * 100).toFixed(1);
  }
  if (facing === 'back') wrap.dataset.facing = flipped ? 'flip' : 'back';
  if (facing === 'front') wrap.dataset.facing = 'front';
  if (it.tapOpen) wrap.classList.add('tap-open');
  if (it.power === 'shower') wrap.appendChild(Object.assign(document.createElement('i'), { className: 'shower-water' }));
  if (it.belt) {     // the treadmill's moving belt
    const bt = document.createElement('i'); bt.className = 'belt';
    const bl = facing === 'front' && it.beltFront ? it.beltFront : it.belt;
    const x = flipped ? 1 - bl.x - bl.w : bl.x;
    if (facing === 'front') bt.classList.add('down');
    Object.assign(bt.style, { left: `${x * 100}%`, top: `${bl.y * 100}%`, width: `${bl.w * 100}%`, height: `${bl.h * 100}%` });
    if (flipped) bt.classList.add('rev');
    wrap.appendChild(bt);
  }
  if (layer) wrap.dataset.layer = layer;
  if (it.radio) wrap.classList.add('radio');
  if (it.garland) wrap.classList.add('garland');
  if (putAway && kind !== 'curtain') {                // ⬆ ⬇ put it in front of / behind other things (shown while moving furniture)
    const up = document.createElement('button'); up.className = 'layer-btn up'; up.type = 'button'; up.title = 'Bring to front'; up.textContent = '⬆';
    const dn = document.createElement('button'); dn.className = 'layer-btn down'; dn.type = 'button'; dn.title = 'Send behind'; dn.textContent = '⬇';
    wrap.append(up, dn);
  }
  if (putAway && ((it.frames && (it.frames.back || it.frames.front)) || it.flip)) {      // 🔄 turn it round / sideways (shown while moving furniture)
    const tb = document.createElement('button'); tb.className = 'turn-btn'; tb.type = 'button'; tb.title = 'Turn around'; tb.textContent = '🔄'; wrap.appendChild(tb);
  }
  if (putAway && it.radio) {                          // 🎵 pick the radio's song
    const sb = document.createElement('button'); sb.className = 'radio-song'; sb.type = 'button'; sb.title = 'Choose a song'; sb.textContent = '🎵'; wrap.appendChild(sb);
  }
  if (putAway) { const pa = document.createElement('button'); pa.className = 'put-away'; pa.type = 'button'; pa.title = 'Put away'; pa.textContent = '📦'; wrap.appendChild(pa); }
  return wrap;
}
// furniture she put in front (⬆ or dragged last) / behind (⬇) other things stays that way.
// decorLayer: a big positive number = in front (newest wins), negative = behind.
export function stackDecor(roomEl) {
  const els = [...roomEl.querySelectorAll('.decor:not(.curtain):not(.flat)')];
  const box = (el) => ({ l: el.offsetLeft, t: el.offsetTop, r: el.offsetLeft + el.offsetWidth, b: el.offsetTop + el.offsetHeight });
  const overlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const lay = (el) => +el.dataset.layer || 0;
  for (let pass = 0; pass < 4; pass++) {
    els.forEach((a) => {
      if (!lay(a)) return;
      const A = box(a);
      els.forEach((b) => {
        if (a === b || !overlap(A, box(b))) return;
        const za = +a.style.zIndex || 0, zb = +b.style.zIndex || 0;
        if (lay(a) > lay(b) && za <= zb) a.style.zIndex = zb + 1;
        else if (lay(a) < lay(b) && za >= zb) a.style.zIndex = Math.max(2, zb - 1);
      });
    });
  }
  // the studio's barre: things put in front go in front of it, things put behind go behind it
  const barre = roomEl.querySelector('.studio-barre');
  if (barre) {
    const bz = +getComputedStyle(barre).zIndex || 68, by = barre.offsetTop;
    els.forEach((el) => {
      const B = box(el); if (!(B.t < by + 6 && B.b > by)) return;
      if (lay(el) > 0 && (+el.style.zIndex || 0) <= bz) el.style.zIndex = bz + 1;
      if (lay(el) < 0 && (+el.style.zIndex || 0) >= bz) el.style.zIndex = bz - 1;
    });
  }
}
// things lower down the room stand in front of things further back
export function depthOf(el, room) {
  if (el.classList.contains('flat')) return 1;
  return 2 + Math.round(((el.offsetTop + el.offsetHeight) / room.clientHeight) * 100);
}

// ---------- speech bubbles (chat) ----------
export const CHAT_MAX = 60;
export function say(wrapEl, text) {
  if (!wrapEl) return;
  wrapEl.querySelectorAll('.bubble').forEach((b) => b.remove());
  const b = html`<div class="bubble chat-bubble">${esc(String(text).slice(0, CHAT_MAX))}</div>`;
  wrapEl.appendChild(b);
  // it grows upwards from above the head; slide it sideways so it stays inside the room (the tail keeps pointing at the kitten)
  const room = wrapEl.closest('.room');
  if (room) {
    const r = b.getBoundingClientRect(), R = room.getBoundingClientRect(), pad = 6;
    let shift = 0;
    if (r.left < R.left + pad) shift = R.left + pad - r.left;
    else if (r.right > R.right - pad) shift = R.right - pad - r.right;
    if (shift) {
      const scale = r.width / (b.offsetWidth || r.width) || 1;          // screen px per bubble px
      b.style.marginLeft = `${shift / scale}px`;
      b.style.setProperty('--tailx', `${-shift / scale}px`);
    }
  }
  const ms = Math.min(12000, 5000 + String(text).length * 150);
  setTimeout(() => b.remove(), ms);
}

// ---------- other cats in the room (friends visiting, or the friend whose house it is) ----------
// look: { name, level, fur, equipped }  ·  where: { x, y, room, left }
export class OtherCats {
  constructor() { this.m = new Map(); this.roomEl = null; this.roomKey = null; this.raf = 0; }
  attach(roomEl, roomKey) { this.roomEl = roomEl; this.roomKey = roomKey; this.m.forEach((c) => { c.el = null; }); this.m.forEach((_, id) => this.draw(id)); }
  // the latest place we heard about is the target; the cat walks there smoothly (updates arrive in uneven bursts)
  upsert(id, data) {
    const c = this.m.get(id) || { x: 30, y: 6, room: 'living' };
    const roomChanged = data.room && data.room !== c.room;
    Object.assign(c, data);
    if (c.dx == null || roomChanged || c.seat || Math.hypot(c.x - c.dx, (c.y - c.dy) * 1.5) > 25) { c.dx = c.x; c.dy = c.y; }   // first sight, new room or a big jump: just appear there
    this.m.set(id, c); this.draw(id); this.go(); return c;
  }
  remove(id) { const c = this.m.get(id); if (c && c.el) c.el.remove(); this.m.delete(id); syncRides(this.roomEl); }
  has(id) { return this.m.has(id); }
  ids() { return [...this.m.keys()]; }
  say(id, text) { const c = this.m.get(id); if (c && c.el) say($w(c.el), text); }
  emote(id, mood) { const c = this.m.get(id); if (c && c.kv && EMOTES.some((e) => e[0] === mood)) { c.kv.flash(mood, 3000); c.kv.jump(); } }
  go() { if (!this.raf) { this.last = 0; this.raf = requestAnimationFrame((t) => this.tick(t)); } }
  tick(t) {
    const dt = Math.min(0.05, (t - (this.last || t)) / 1000); this.last = t;
    let moving = false;
    this.m.forEach((c, id) => {
      const ex = c.x - c.dx, ey = c.y - c.dy;
      const walking = Math.abs(ex) > 0.15 || Math.abs(ey) > 0.15;
      if (walking) {
        // same speed as walking with the arrows, a little faster if it has fallen behind
        const boost = 1 + Math.min(2, Math.hypot(ex, ey) / 12);
        const sx = 32 * boost * dt, sy = 22 * boost * dt;
        c.dx += Math.max(-sx, Math.min(sx, ex)); c.dy += Math.max(-sy, Math.min(sy, ey));
        moving = true;
      } else { c.dx = c.x; c.dy = c.y; }
      if (c.kv) { c.kv.canvas.classList.toggle('walking', walking); if (Math.abs(ex) > 0.15) c.kv.setFacing(ex < 0); else c.kv.setFacing(!!c.left); }
      this.place(c);
    });
    this.raf = moving ? requestAnimationFrame((tt) => this.tick(tt)) : 0;
  }
  place(c) {
    if (!c.el) return;
    const spot = c.seat && seatSpot(this.roomEl, c.seat, c.slot);
    if (spot) { c.x = c.dx = spot.x; c.y = c.dy = spot.y; }
    c.el.style.left = `${c.dx}%`; c.el.style.bottom = `${c.dy}%`;
    c.el.style.zIndex = spot ? spot.z : 2 + Math.round(100 - c.dy);
    c.el.classList.toggle('lying', !!(spot && spot.lie)); c.el.classList.toggle('seated', !!spot);
    c.el.classList.toggle('swimming', !spot && inPool(this.roomEl, c.dx, c.dy));
    if (c.kv) { c.kv.setPose(spot ? spot.pose : null); c.kv.setHeld(c.look && c.look.hold); } c.el.dataset.pose = (spot && spot.pose) || '';
    if (c.kv && spot && spot.run) { c.kv.setFacing(spot.flip); c.kv.canvas.classList.add('walking'); }
    else if (c.kv && spot) c.kv.canvas.classList.remove('walking');
    if (c.bedShown && c.bedShown !== (spot && spot.lie && c.seat)) { blanket(this.roomEl, c.bedShown, false); c.bedShown = null; }
    if (spot && spot.lie) { blanket(this.roomEl, c.seat, true); c.bedShown = c.seat; }
    rideFx(this.roomEl, c.el, spot ? c.seat : null);
  }
  draw(id) {
    const c = this.m.get(id); if (!c) return;
    const here = this.roomEl && this.roomEl.isConnected && c.room === this.roomKey && c.look;
    if (!here) { if (c.el) { c.el.remove(); c.el = null; } return; }
    if (!c.el || !c.el.isConnected) {
      const el = html`<div class="vcat"><div class="kitten-wrap"><div class="kflip"></div><div class="nametag">${esc(c.look.name || '🐱')}<span class="lv">Lv${c.look.level || 1}</span></div></div></div>`;
      const kv = new KittenView({ scale: HOUSE.kitten, fur: c.look.fur || 'ginger', equipped: { ...(c.look.equipped || {}) } });
      kv.setMood('happy'); kv.setFacing(!!c.left);
      el.querySelector('.kflip').appendChild(kv.canvas);
      c.kv = kv; c.el = el;
      this.roomEl.appendChild(el);
    }
    this.place(c);
  }
}
const $w = (el) => el.querySelector('.kitten-wrap');

// ---------- chat bar at the bottom of the house ----------
// six faces she can send with the emoji button
export const EMOTES = [['e-laugh', '😆'], ['e-wow', '😮'], ['e-angry', '😠'], ['e-wink', '😉'], ['e-shy', '☺️'], ['e-cool', '😎']];
export const emoteIcon = (m) => (EMOTES.find((e) => e[0] === m) || [0, ''])[1];
// a kitten's head with an expression (her own fur and hat), as a little picture
export function catFace(mood, px = 4) {
  const k = (getState() || {}).kitten || {};
  const g = kittenGrid(k.fur || 'ginger', mood, k.equipped || {}, 0).slice(5, 25).map((r) => r.slice(2, 31));   // just the head
  const c = document.createElement('canvas'); c.className = 'cat-face';
  drawGrid(c, g, px);
  return c;
}
export function chatBar(onSend, onEmote) {
  const bar = html`<form class="house-chat" autocomplete="off">
      ${onEmote ? `<div class="emote-wrap"><button type="button" class="btn white small emote-btn" aria-label="Faces"></button>
        <div class="emote-pick hidden">${EMOTES.map(([k, e]) => `<button type="button" data-emote="${k}" aria-label="${e}"></button>`).join('')}</div></div>` : ''}
      <input type="text" maxlength="${CHAT_MAX}" placeholder="说点什么… Say something" enterkeyhint="send">
      <button type="submit" class="btn green small">➤ <span class="zh">说</span></button>
    </form>`;
  const inp = bar.querySelector('input');
  bar.onsubmit = (e) => { e.preventDefault(); const t = inp.value.trim(); if (!t) return; inp.value = ''; onSend(t); };
  if (onEmote) {
    const pick = bar.querySelector('.emote-pick');
    bar.querySelector('.emote-btn').appendChild(catFace('happy', 1));
    pick.querySelectorAll('[data-emote]').forEach((b) => b.appendChild(catFace(b.dataset.emote, 1)));
    bar.querySelector('.emote-btn').onclick = () => pick.classList.toggle('hidden');
    pick.addEventListener('click', (e) => { const b = e.target.closest('[data-emote]'); if (!b) return; pick.classList.add('hidden'); onEmote(b.dataset.emote); });
  }
  return bar;
}

// ---------- walking: arrow keys and the on-screen arrows ----------
// onStep(dx, dy, dt) is called every frame while a direction is held; onStop() when she lets go
export function walker(dpad, { onStep, onStop, canWalk = () => true, isAlive }) {
  const held = new Set();
  let raf = 0, lastT = 0;
  const loop = (t) => {
    if (!isAlive()) { held.clear(); raf = 0; onStop(); return; }
    const dt = Math.min(0.05, (t - (lastT || t)) / 1000); lastT = t;
    let dx = 0, dy = 0;
    if (held.has('left')) dx -= 1; if (held.has('right')) dx += 1;
    if (held.has('up')) dy += 1; if (held.has('down')) dy -= 1;
    onStep(dx, dy, dt);
    if (held.size) raf = requestAnimationFrame(loop);
    else { raf = 0; lastT = 0; onStop(); }
  };
  const press = (d) => { if (!canWalk()) return; held.add(d); if (!raf) raf = requestAnimationFrame(loop); };
  const release = (d) => held.delete(d);
  const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  const kd = (e) => {
    if (!isAlive()) { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); return; }
    const d = KEYS[e.key];
    if (!d || /INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || '') || !document.querySelector('#modal').classList.contains('hidden')) return;
    e.preventDefault(); press(d);
  };
  const ku = (e) => { const d = KEYS[e.key]; if (d) release(d); };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  window.addEventListener('blur', () => held.clear(), { once: true });
  dpad.querySelectorAll('button').forEach((b) => {
    const d = b.dataset.d;
    const down = () => { b.classList.add('down'); press(d); };
    const up = () => { b.classList.remove('down'); release(d); };
    b.addEventListener('touchstart', (e) => { e.preventDefault(); down(); }, { passive: false });
    b.addEventListener('touchend', (e) => { e.preventDefault(); up(); }, { passive: false });
    b.addEventListener('touchcancel', up);
    b.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') return; e.preventDefault(); b.setPointerCapture(e.pointerId); down(); });
    b.addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch') up(); });
    b.addEventListener('pointercancel', (e) => { if (e.pointerType !== 'touch') up(); });
    b.addEventListener('lostpointercapture', (e) => { if (e.pointerType !== 'touch') up(); });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  return { held };
}
export const DPAD = `<div class="dpad"><button data-d="up" aria-label="Up">▲</button><button data-d="left" aria-label="Left">◀</button><button data-d="down" aria-label="Down">▼</button><button data-d="right" aria-label="Right">▶</button></div>`;

// furniture you can play (the piano): tap it for a random note — not while moving furniture
export function wirePlayable(roomEl, onPlay) {
  roomEl.addEventListener('click', (e) => {
    const d = e.target.closest('.decor.playable');
    if (!d || roomEl.classList.contains('arranging')) return;
    const { i, name } = sfx.piano();
    const n = document.createElement('div');
    n.className = 'music-note'; n.textContent = `♪ ${name}`;
    n.style.left = `${d.offsetLeft + d.offsetWidth * (0.25 + Math.random() * 0.5)}px`; n.style.top = `${d.offsetTop}px`;
    roomEl.appendChild(n); setTimeout(() => n.remove(), 1400);
    d.classList.remove('bounce'); void d.offsetWidth; d.classList.add('bounce');
    if (onPlay) onPlay(i, name);
  });
}
// a friend played the piano: we hear the same note, and see it float up if the piano is in this room
export function hearNote(roomEl, i) {
  const { name } = sfx.piano(i);
  const d = roomEl && roomEl.isConnected && roomEl.querySelector('.decor.playable');
  if (!d) return;
  const n = document.createElement('div');
  n.className = 'music-note'; n.textContent = `♪ ${name}`;
  n.style.left = `${d.offsetLeft + d.offsetWidth * (0.25 + Math.random() * 0.5)}px`; n.style.top = `${d.offsetTop}px`;
  roomEl.appendChild(n); setTimeout(() => n.remove(), 1400);
}

// ---------- chat history: who said what while you are in the house ----------
export function chatLog(entries) {
  const el = html`<div class="chat-log"></div>`;
  const line = ({ who, text, mine, at }) => {
    const t = new Date(at), hm = `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`;
    return html`<div class="vl-line ${mine ? 'mine' : ''}"><b>${esc(who)}</b><span class="zh">${esc(String(text).slice(0, CHAT_MAX))}</span><small>${hm}</small></div>`;
  };
  const empty = () => { if (!entries.length) el.innerHTML = '<div class="vl-empty">💬 聊天记录会出现在这里 · Chat shows up here</div>'; };
  entries.forEach((e) => el.appendChild(line(e))); empty();
  setTimeout(() => { el.scrollTop = el.scrollHeight; }, 0);
  return {
    el,
    add(who, text, mine) {
      const e = { who, text, mine, at: Date.now() };
      entries.push(e); while (entries.length > 100) entries.shift();
      const ph = el.querySelector('.vl-empty'); if (ph) ph.remove();
      el.appendChild(line(e)); while (el.children.length > 100) el.firstElementChild.remove();
      el.scrollTop = el.scrollHeight;
    },
  };
}

// ---------- lights and TV ----------
// look: { dark: is the room's ceiling light off, off: { id: true } furniture switched off }
export function applyPower(roomEl, { dark = false, off = {} } = {}) {
  if (!roomEl) return;
  roomEl.querySelectorAll('.decor[data-power]').forEach((d) => d.classList.toggle('off', !!off[d.dataset.id]));
  roomEl.querySelectorAll('.decor .screen-video').forEach((v) => { if (v.closest('.decor').classList.contains('off')) { v.pause(); v.muted = true; screenSound(v); } else if (v.startFilm) v.startFilm(); });
  let shade = roomEl.querySelector('.room-dark');
  if (!shade) { shade = document.createElement('div'); shade.className = 'room-dark'; roomEl.appendChild(shade); }
  roomEl.classList.toggle('lights-off', !!dark);
  // lamps that are still on glow in the dark
  roomEl.querySelectorAll('.lamp-glow').forEach((g) => g.remove());
  if (dark) roomEl.querySelectorAll('.decor[data-power="light"]:not(.off), .decor[data-power="tv"]:not(.off)').forEach((d) => {
    const g = document.createElement('div');
    g.className = `lamp-glow ${d.dataset.power}`;
    g.style.left = `${d.offsetLeft + d.offsetWidth / 2}px`; g.style.top = `${d.offsetTop + d.offsetHeight * (d.dataset.power === 'tv' ? 0.4 : 0.25)}px`;
    roomEl.appendChild(g);
  });
  syncRides(roomEl);
}
// ---------- playground rides ----------
// the swing and see-saw move while a kitten rides them; the merry-go-round turns while it's switched on.
// Every moving thing runs on the same clock (startTime 0), so a kitten riding stays in step with the ride.
const loopAnim = (el, kf, opts) => { const a = el.animate(kf, { iterations: Infinity, ...opts }); try { a.startTime = 0; } catch {} return a; };
const rockKf = (deg) => [{ rotate: `${-deg}deg`, easing: 'ease-in-out' }, { rotate: `${deg}deg`, easing: 'ease-in-out' }, { rotate: `${-deg}deg` }];
export function syncRides(roomEl) {
  if (!roomEl || !roomEl.animate) return;
  const riders = [...roomEl.querySelectorAll('[data-ride-for]')];
  roomEl.querySelectorAll('.decor.ride').forEach((d) => {
    const r = ITEMS[d.dataset.id] && ITEMS[d.dataset.id].ride; if (!r) return;
    const moving = r.kind === 'merry' ? d.classList.contains('off') : riders.some((c) => c.dataset.rideFor === d.dataset.id);   // the merry-go-round starts still: tapping it ("off") sets it turning
    d.classList.toggle('moving', moving);
    const part = d.querySelector(r.kind === 'merry' ? '.ride-strip' : '.ride-part'); if (!part) return;
    if (moving && !part._a) part._a = r.kind === 'merry' ? loopAnim(part, [{ translate: '0 0' }, { translate: '-100% 0' }], { duration: r.ms, easing: `steps(${r.n})` }) : loopAnim(part, rockKf(r.deg), { duration: r.ms });
    if (!moving && part._a) { part._a.cancel(); part._a = null; }
  });
  riders.forEach((c) => {
    const d = roomEl.querySelector(`.decor.ride[data-id="${c.dataset.rideFor}"]`), on = !!(d && d.classList.contains('moving'));
    const key = on ? `${c.dataset.rideFor}|${d.offsetLeft},${d.offsetTop},${c.offsetLeft},${c.offsetTop}` : '';
    if (c._rk === key) return;
    if (c._ra) { c._ra.cancel(); c._ra = null; }
    c.style.transformOrigin = ''; c._rk = key;
    if (!on) return;
    const r = ITEMS[c.dataset.rideFor].ride;
    if (r.kind === 'merry') {
      // round and round, a quarter turn for each run of the turning frames
      const rx = r.rx * d.offsetWidth, ry = r.ry * d.offsetHeight, kf = [];
      for (let i = 0; i <= 16; i++) { const t = ((45 + i * 22.5) * Math.PI) / 180; kf.push({ translate: `${(rx * Math.cos(t)).toFixed(1)}px ${(ry * Math.sin(t)).toFixed(1)}px` }); }
      c._ra = loopAnim(c, kf, { duration: r.ms * 4 });
    } else {
      // swinging / rocking round the same point as the swing's seat or the see-saw's plank
      c.style.transformOrigin = `${d.offsetLeft + d.offsetWidth * r.px - c.offsetLeft}px ${d.offsetTop + d.offsetHeight * r.py - c.offsetTop}px`;
      c._ra = loopAnim(c, rockKf(r.deg), { duration: r.ms });
    }
  });
}
// a kitten sat on (or got off) a ride
export function rideFx(roomEl, catEl, id) {
  if (!catEl) return;
  const rid = id && ITEMS[id] && ITEMS[id].ride ? id : '';
  if (!rid && !catEl.dataset.rideFor) return;
  if (rid) catEl.dataset.rideFor = rid;
  else { delete catEl.dataset.rideFor; if (catEl._ra) { catEl._ra.cancel(); catEl._ra = null; } catEl._rk = ''; catEl.style.transformOrigin = ''; }
  syncRides(roomEl);
}
// tap a lamp or the TV to switch it (not while moving furniture)
export function wirePower(roomEl, onToggle) {
  roomEl.addEventListener('click', (e) => {
    const d = e.target.closest('.decor[data-power]');
    if (!d || roomEl.classList.contains('arranging') || d.classList.contains('has-film')) return;
    sfx.click(); onToggle(d.dataset.id);
  });
}

// ---------- sitting on furniture ----------
// the spot (in room %) where a kitten sits on this piece, and the layer just in front of it
export function seatSpot(roomEl, id, slot = 0) {
  const el = roomEl && roomEl.querySelector(`.decor.seat[data-id="${id}"]`), it = ITEMS[id];
  const seat = it && (el && el.dataset.facing === 'front' && it.seatFront ? it.seatFront : it.seat);
  if (!el || !seat) return null;
  const W = roomEl.clientWidth, H = roomEl.clientHeight;
  const flip = el.dataset.facing === 'flip';
  let sx = seat.spots ? seat.spots[Math.min(slot || 0, seat.spots.length - 1)] : seat.x;
  if (flip) sx = 1 - sx;
  return {
    run: !!seat.run, flip,
    back: !!seat.back || el.dataset.facing === 'back', pose: seat.lie ? 'lie' : (seat.back || el.dataset.facing === 'back') ? 'back' : seat.side ? ((slot || 0) === 0 ? 'side-r' : 'side-l') : null,
    x: ((el.offsetLeft + el.offsetWidth * sx) / W) * 100,
    y: ((H - (el.offsetTop + el.offsetHeight * seat.y)) / H) * 100,
    z: (parseInt(el.style.zIndex, 10) || 50) + 1, lie: !!seat.lie, el,
  };
}
// the bed's blanket drawn over a kitten lying in it
export function blanket(roomEl, id, on) {
  const el = roomEl && roomEl.querySelector(`.decor.seat[data-id="${id}"]`), seat = ITEMS[id] && ITEMS[id].seat;
  let b = roomEl && roomEl.querySelector(`.blanket[data-for="${id}"]`);
  if (seat && seat.cover) on = true;      // a table: its front is always drawn over the cats sitting behind it
  if (!on || !el || !seat || !seat.blanket) { if (b) b.remove(); return; }
  if (!b) {
    const [r0, r1, c0, c1] = seat.blanket, it = ITEMS[id];
    const g = artGrid((seat.coverArt && it.frames && it.frames[seat.coverArt]) || it.art, it.pal).map((row, y) => row.map((c, x) => (y >= r0 && y < r1 && x >= c0 && x < c1 ? c : null)));   // the shower's glass door
    b = document.createElement('canvas'); b.className = 'blanket'; b.dataset.for = id;
    drawGrid(b, g, HOUSE.decor);
    roomEl.appendChild(b);
  }
  // laid over the bed, one layer above the kitten in it
  b.style.left = `${el.offsetLeft}px`; b.style.top = `${el.offsetTop}px`;
  b.style.zIndex = (parseInt(el.style.zIndex, 10) || 50) + 2;
}

// the first free place on a piece of furniture (a sofa has two); taken = [{ seat, slot }]
export function freeSlot(id, taken) {
  const seat = ITEMS[id] && ITEMS[id].seat; const n = seat && seat.spots ? seat.spots.length : 1;
  for (let i = 0; i < n; i++) if (!taken.some((t) => t && t.seat === id && (t.slot || 0) === i)) return i;
  return -1;   // full
}

// ---------- photos for frames: shrink to at most 50 KB ----------
export async function compressPhoto(file, maxBytes = 50 * 1024) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    let side = 420, q = 0.82;
    for (let tries = 0; tries < 14; tries++) {
      const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', q));
      if (blob && blob.size <= maxBytes) {
        return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
      }
      if (q > 0.5) q -= 0.12; else { side = Math.round(side * 0.8); q = 0.75; }   // lower quality first, then smaller
    }
    throw new Error('too big');
  } finally { URL.revokeObjectURL(url); }
}

// ---------- pets walking around the house (drawn from the pets' snapshot; see pets.js) ----------
function petCanvas(kind, frame) {
  const it = ITEMS[kind]; const art = frame ? (it.frames || {})[frame] : it.art; if (!art) return null;
  const c = document.createElement('canvas'); c.className = `pf pf-${frame || 'stand'}`;
  drawGrid(c, artGrid(art, it.pal), HOUSE.decor * (it.scale || 1));
  return c;
}
const perch = new Map();   // pet kind -> { up: floor spot in front of the seat, at: the seat } while it sits up on furniture
export class PetLayer {
  constructor(roomEl, roomKey, { onClick, onSpot } = {}) {
    this.roomEl = roomEl; this.roomKey = roomKey; this.onClick = onClick; this.onSpot = onSpot; this.els = new Map();
    // pets in the pool swim (checked a few times a second, as they walk)
    const t = setInterval(() => {
      if (!roomEl.isConnected) { clearInterval(t); return; }
      const pool = !!roomEl.querySelector('.pool-el'), W = roomEl.clientWidth || 1, H = roomEl.clientHeight || 1;
      this.els.forEach((el) => {
        if (el.classList.contains('in-cage') || !el.isConnected) return;
        const cs = getComputedStyle(el);
        el.classList.toggle('swimming', pool && !el.classList.contains('sitting') && inPool(roomEl, (parseFloat(cs.left) / W) * 100, (parseFloat(cs.bottom) / H) * 100));
      });
    }, 250);
  }
  el(p) {
    let el = this.els.get(p.kind);
    if (el) { el.querySelector('.pet-tag').textContent = p.name; return el; }
    el = document.createElement('div'); el.className = 'pet'; el.dataset.kind = p.kind;
    const flip = document.createElement('div'); flip.className = 'pflip';
    ['', 'walk', 'sit'].forEach((f) => { const c = petCanvas(p.kind, f); if (c) flip.appendChild(c); });
    el.appendChild(flip);
    const tag = document.createElement('div'); tag.className = 'nametag pet-tag'; tag.textContent = p.name; el.appendChild(tag);
    if (this.onClick) { el.classList.add('clickable'); el.addEventListener('click', (e) => { e.stopPropagation(); if (!this.roomEl.classList.contains('arranging')) this.onClick(p.kind, el); }); }
    el.dataset.fresh = '1';
    this.els.set(p.kind, el);
    return el;
  }
  update(list) {
    const room = this.roomEl; if (!room || !room.isConnected) return;
    const here = (list || []).filter((p) => p.room === this.roomKey);
    for (const [k, el] of this.els) if (!here.some((p) => p.kind === k)) { el.remove(); this.els.delete(k); }
    const W = room.clientWidth || 1, H = room.clientHeight || 1;
    here.forEach((p) => {
      const el = this.el(p);
      if (p.mode === 'cage') {
        const cw = room.querySelector(`.decor.cage[data-id="${p.cage}"]`);
        if (!cw) { el.remove(); return; }
        if (el.parentElement !== cw) cw.appendChild(el);
        if (ITEMS[p.kind].stayIn) {     // the parrot: always on its perch
          el.className = `pet in-cage perched${this.onClick ? ' clickable' : ''}`;
          el.style.cssText = `bottom:${(ITEMS[cw.dataset.id] || {}).perch * 100 || 40}%`;
          return;
        }
        const wheel = p.wheel && cw.querySelector('.cage-thing.wheel');
        cw.querySelectorAll('.cage-thing.wheel').forEach((w) => w.classList.toggle('spinning', !!wheel));
        el.className = `pet in-cage${wheel ? ' on-wheel' : ''}${this.onClick ? ' clickable' : ''}`;
        if (wheel) {
          // running inside the wheel: stand in the middle of the ring
          const cwW = cw.offsetWidth || 1, cwH = cw.offsetHeight || 1;
          el.style.cssText = `left:${((wheel.offsetLeft + wheel.offsetWidth / 2 - el.offsetWidth / 2) / cwW) * 100}%;bottom:${((cwH - wheel.offsetTop - wheel.offsetHeight * 0.8) / cwH) * 100}%`;
        } else el.style.cssText = `bottom:${cw.dataset.floor}%;--to:${Math.max(10, (+cw.dataset.inner || 0.8) * 100 - 38)}%`;
        return;
      }
      const fresh = el.dataset.fresh === '1' || el.parentElement !== room;
      const pc = perch.get(p.kind) || {};      // perched up on a sofa / bed right now?
      if (el.parentElement !== room) room.appendChild(el);
      el.classList.remove('in-cage'); delete el.dataset.fresh;
      let x = p.x, y = p.y, z = null, sit = false, up = null;
      if (p.mode === 'sit' && p.seat) {
        if (!p.seat.flat) {
          const sp = seatSpot(room, p.seat.id, p.seat.slot);
          if (sp) {
            x = sp.x; y = sp.y; z = sp.z; sit = true;
            // a raised seat (sofa, bed, chair): walk to the floor in front of it, then jump up
            const floorY = Math.max(1, Math.min(30, ((H - sp.el.offsetTop - sp.el.offsetHeight) / H) * 100 + 1));
            if (y - floorY > 1) up = { x, y: Math.min(floorY, y - 2) };
          }
        } else { const d = room.querySelector(`.decor[data-id="${p.seat.id}"]`); if (d) { x = ((d.offsetLeft + d.offsetWidth / 2) / W) * 100; y = ((H - d.offsetTop - d.offsetHeight * 0.6) / H) * 100; z = (parseInt(d.style.zIndex, 10) || 1) + 1; sit = true; } }
      }
      // done sitting on a sofa / bed: it jumps down to the floor in front of it and stands there
      if (!sit && pc.up && pc.at && Math.abs(x - pc.at.x) < 1 && Math.abs(y - pc.at.y) < 1) {
        x = pc.up.x; y = pc.up.y; if (this.onSpot) this.onSpot(p.kind, x, y, true);
      }
      let start = null;
      if (p.jump && p.fromCage) {          // just let out: it hops out of the cage door
        const cw = room.querySelector(`.decor[data-id="${p.fromCage}"]`);
        if (cw) { x = ((cw.offsetLeft + cw.offsetWidth * 0.75) / W) * 100; y = Math.max(1, ((H - cw.offsetTop - cw.offsetHeight) / H) * 100); if (this.onSpot) this.onSpot(p.kind, x, y); }
      }
      if (sit && this.onSpot) this.onSpot(p.kind, x, y);
      // the same plan as last time (another pet moved): leave this one alone
      const goal = [p.mode, x.toFixed(1), y.toFixed(1), p.seat ? `${p.seat.id}/${p.seat.slot || 0}` : ''].join('|');
      if (!fresh && !p.jump && el._goal === goal) return;
      el._goal = goal;
      if (fresh || p.jump) {
        // just drawn (or popped into this room): start where it is now — half-way through a walk if it's walking
        el.getAnimations().forEach((an) => an.cancel()); el._tok = null;
        if (!p.jump && p.mode === 'walk' && p.age != null && p.age < p.dur * 1000) {
          const f = p.age / (p.dur * 1000); start = { x: p.x0 + (x - p.x0) * f, y: p.y0 + (y - p.y0) * f };
        } else {
          el.style.left = `${x}%`; el.style.bottom = `${y}%`;
          el.style.zIndex = z != null ? z : 2 + Math.round(100 - y);
          el.classList.remove('walking'); el.classList.toggle('sitting', sit); perch.set(el.dataset.kind, sit && up ? { up, at: { x, y } } : {});
          el.classList.toggle('left', !!p.left);
          return;
        }
      } else {
        // where it is on screen right now (even half-way through a step)
        const cs = getComputedStyle(el);
        start = { x: (parseFloat(cs.left) / W) * 100, y: (parseFloat(cs.bottom) / H) * 100 };
        el.getAnimations().forEach((an) => an.cancel());
      }
      // the route: jump down from where it's sitting, walk, and jump up onto the new seat
      const segs = [];
      const sameSeat = pc.up && up && Math.abs(pc.up.x - up.x) < 0.5 && Math.abs(pc.up.y - up.y) < 0.5;
      if (pc.up && !sameSeat) segs.push({ x: pc.up.x, y: pc.up.y, hop: true });
      if (up && !sameSeat) { segs.push({ x: up.x, y: up.y }); segs.push({ x, y, hop: true, z }); }
      else segs.push({ x, y });
      this.run(el, start, segs, { sit, up, z, kind: p.kind });
      if (!segs.length) el.classList.toggle('left', !!p.left);
    });
  }
  // walk / jump along the route, one piece after another (a newer plan cancels this one)
  async run(el, start, segs, { sit, up, z, kind }) {
    const tok = {}; el._tok = tok;
    const speed = { dog: 11, guineapig: 6, hamster: 7 }[kind] || 9;
    let cur = start;
    el.classList.remove('sitting');
    for (const sg of segs) {
      if (el._tok !== tok) return;
      const dist = Math.hypot(sg.x - cur.x, (sg.y - cur.y) * 1.4);
      if (dist < 0.3 && !sg.hop) { cur = sg; continue; }
      if (sg.x < cur.x - 0.2) el.classList.add('left'); else if (sg.x > cur.x + 0.2) el.classList.remove('left');
      el.classList.toggle('walking', !sg.hop);
      if (sg.hop) { perch.set(el.dataset.kind, {}); el.style.zIndex = sg.z != null ? sg.z : 2 + Math.round(100 - sg.y); }
      else el.style.zIndex = 2 + Math.round(100 - Math.min(cur.y, sg.y));
      const P = (q) => ({ left: `${q.x}%`, bottom: `${q.y}%` });
      const frames = sg.hop
        ? [P(cur), { left: `${(cur.x + sg.x) / 2}%`, bottom: `${Math.max(cur.y, sg.y) + 7}%`, offset: 0.45 }, P(sg)]
        : [P(cur), P(sg)];
      el.style.left = `${sg.x}%`; el.style.bottom = `${sg.y}%`;      // where it ends up
      const an = el.animate(frames, { duration: sg.hop ? 420 : Math.max(250, (dist / speed) * 1000), easing: sg.hop ? 'ease-in-out' : 'linear' });
      cur = sg;
      try { await an.finished; } catch { return; }
    }
    if (el._tok !== tok) return;
    el.classList.remove('walking'); el.classList.toggle('sitting', !!sit);
    if (z != null) el.style.zIndex = z; else el.style.zIndex = 2 + Math.round(100 - cur.y);
    perch.set(el.dataset.kind, sit && up ? { up, at: { x: cur.x, y: cur.y } } : {});
  }
}
