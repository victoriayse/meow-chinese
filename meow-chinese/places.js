// Public places on the 🗺️ map (the cinema; the cafe is coming soon).
// Anyone signed in can walk in and see everyone else there, friends or not.
// Only the admin furnishes them: she buys and arranges the cinema's furniture like her own rooms,
// and the layout is saved online for everyone to see.
import * as S from './state.js';
import * as Auth from './auth.js';
import { rest, managing } from './cloud.js';
import { roomLayout } from './house.js';
import { Channel } from './rt.js';

export const ADMIN_IDS = ['9d0ff106-393a-4de4-8ab4-e8636c8c7f8f'];   // Victoria
export const isAdmin = () => { const u = Auth.user(); return !!(u && ADMIN_IDS.includes(u.id) && !managing()); };
S.setAdminCheck(isAdmin);

const rpc = (name, body = {}) => rest('rpc/' + name, { method: 'POST', body: JSON.stringify(body) });

export const PLACES = {
  cinema: { zh: '电影院', en: 'Cinema', icon: '🎬', rooms: S.PLACE_ROOMS.cinema, start: 'lobby' },
};

// the layout everyone sees: { rooms: { theatre1: [...], lobby: [...], theatre2: [...] }, open, power, styles }
export function layoutOf(place) {
  const st = S.get(), rooms = {}, keys = PLACES[place].rooms, off = {}, dark = {};
  keys.forEach((k) => { rooms[k] = roomLayout(st, k, S.roomOf); });
  const ids = new Set(keys.flatMap((k) => rooms[k].map((e) => e.id)));
  Object.entries(st.powerOff || {}).forEach(([id, v]) => { if (v && ids.has(id)) off[id] = true; });
  keys.forEach((k) => { if ((st.lightsOff || {})[k]) dark[k] = true; });
  return { rooms, open: keys.slice(), power: { dark, off }, prices: { ...(st.kioskPrices || {}) } };
}
export async function loadPlace(place) {
  const empty = { rooms: {}, open: PLACES[place].rooms.slice(), power: {} };
  try { const r = await rpc('get_place', { p_key: place }); return r && r.rooms ? { ...empty, ...r, open: empty.open } : empty; } catch (e) { return empty; }
}

// the admin: whenever the cinema's furniture changes, save it online and tell anyone inside
let lastSent = '', busy = false;
async function publish(place) {
  if (busy || !isAdmin()) return;
  const layout = layoutOf(place), j = JSON.stringify(layout);
  if (j === lastSent) return;
  busy = true;
  try {
    await rpc('put_place', { p_key: place, p_layout: layout }); lastSent = j;
    const me = Auth.user().id;
    const ch = new Channel(`place:${place}`, { presenceKey: `${me}-admin`, onStatus: (st) => { if (st === 'joined') { ch.send('house', { id: `${me}-admin`, house: layout }); setTimeout(() => ch.close(), 1500); } } });
    ch.open(); setTimeout(() => ch.close(), 8000);
  } catch (e) { console.warn('place publish', e); }
  busy = false;
}
export function startPublishing() {
  setInterval(() => { if (isAdmin() && !document.hidden) publish('cinema'); }, 6000);
}

// ---------- 🎞️ a film for the projector screen (the admin uploads it; anyone can watch) ----------
export const MAX_VIDEO = 10 * 1024 * 1024;   // 10 MB
const objUrl = (path) => `${Auth.API}/storage/v1/object/cinema/${path}`;
export async function uploadScreenVideo(id, file) {
  if (!isAdmin()) throw new Error('not allowed');
  if (!file) throw new Error('no file');
  if (file.size > MAX_VIDEO) throw new Error('too big');
  if (!/^video\//.test(file.type) && !/\.(mp4|m4v|mov|webm)$/i.test(file.name)) throw new Error('not video');
  const ext = ((file.name.match(/\.([a-z0-9]{2,4})$/i) || [])[1] || 'mp4').toLowerCase();
  const type = file.type || (ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4');
  const path = `${Auth.user().id}/screen-${Date.now()}.${ext}`;
  const t = await Auth.token();
  const r = await fetch(objUrl(path), { method: 'POST', headers: { apikey: Auth.KEY, Authorization: `Bearer ${t}`, 'content-type': type, 'x-upsert': 'true' }, body: file });
  if (!r.ok) { const txt = await r.text().catch(() => ''); throw new Error(/too large|exceeded|size/i.test(txt) ? 'too big' : /mime|type/i.test(txt) ? 'not video' : `upload ${r.status}`); }
  const st = S.get(); st.screenVideos = st.screenVideos || {};
  const old = st.screenVideos[id];
  st.screenVideos[id] = { path, url: `${Auth.API}/storage/v1/object/public/cinema/${path}`, name: file.name.replace(/\.[^.]+$/, '').slice(0, 60), at: Date.now() };
  S.save();
  if (old && old.path && old.path !== path) fetch(objUrl(old.path), { method: 'DELETE', headers: { apikey: Auth.KEY, Authorization: `Bearer ${t}` } }).catch(() => {});
}
export async function removeScreenVideo(id) {
  const st = S.get(), old = (st.screenVideos || {})[id]; if (!old) return;
  delete st.screenVideos[id]; S.save();
  const t = await Auth.token().catch(() => null);
  if (t && old.path) fetch(objUrl(old.path), { method: 'DELETE', headers: { apikey: Auth.KEY, Authorization: `Bearer ${t}` } }).catch(() => {});
}

// ---------- the 🗺️ map: Home, Cinema, Cafe ----------
import { $, html, toast } from './ui.js';
import { sfx } from './audio.js';
function drawMap(c) {
  const W = 160, H = 110; c.width = W; c.height = H;
  const g = c.getContext('2d'), R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  R(0, 0, W, H, '#8fd06a');
  for (let y = 2; y < H; y += 5) for (let x = (y % 10 ? 1 : 4); x < W; x += 7) R(x, y, 1, 1, '#a6dc84');
  // a river and a little bridge
  for (let x = 0; x < W; x++) { const y = 82 + Math.round(4 * Math.sin(x / 11)); R(x, y, 1, 7, '#5ab4ea'); R(x, y, 1, 1, '#9fd9fb'); }
  // roads
  R(0, 50, W, 7, '#c9b48a'); R(76, 0, 7, H, '#c9b48a');
  for (let x = 2; x < W; x += 8) R(x, 53, 4, 1, '#f4ead2');
  for (let y = 2; y < H; y += 8) R(79, y, 1, 4, '#f4ead2');
  R(70, 80, 19, 12, '#a8743f'); for (let x = 71; x < 89; x += 3) R(x, 80, 1, 12, '#8a5a32');
  // trees and ponds
  [[10, 12], [22, 30], [60, 18], [130, 14], [146, 34], [104, 70], [20, 70], [140, 98], [8, 100], [52, 100]].forEach(([x, y]) => { R(x - 3, y - 4, 7, 6, '#4f9a52'); R(x - 2, y - 5, 5, 1, '#66b566'); R(x, y + 2, 1, 3, '#8a5a32'); });
  R(110, 92, 14, 8, '#5ab4ea'); R(112, 91, 10, 10, '#5ab4ea');
}
const PINS = [
  { key: 'home', zh: '我的家', en: 'Home', icon: '🏠', x: 30, y: 30 },
  { key: 'cinema', zh: '电影院', en: 'Cinema', icon: '🎬', x: 70, y: 22 },
  { key: 'cafe', zh: '咖啡馆', en: 'Cafe', icon: '☕', x: 66, y: 68, soon: true },
];
export function mapScreen({ go }) {
  const n = html`<section class="screen"><div class="card stack map-card">
      <div class="h-title"><span class="zh">🗺️ 地图</span><span class="en">Map</span></div>
      <p class="help" style="margin:0">点一个地方去看看！电影院和咖啡馆是大家的地方，在那里可以见到所有人。<br>Tap a place to go there. The cinema and cafe are public — you'll see everyone who is there.</p>
      <div class="map-box"><canvas class="map-art"></canvas>
        ${PINS.map((p) => `<button class="map-pin ${p.soon ? 'pin-soon' : ''}" data-pin="${p.key}" style="left:${p.x}%;top:${p.y}%"><span class="ic">${p.icon}</span><span class="lb"><span class="zh">${p.zh}</span> ${p.en}${p.soon ? '<small>即将开放 Coming soon</small>' : ''}</span></button>`).join('')}
      </div></div></section>`;
  drawMap($('.map-art', n));
  n.querySelectorAll('.map-pin').forEach((b) => {
    b.onclick = () => {
      const p = PINS.find((x) => x.key === b.dataset.pin);
      if (p.soon) { sfx.miss(); return toast(`${p.icon} <span class="zh">${p.zh}即将开放！</span> The ${p.en.toLowerCase()} is coming soon`, { ms: 2500 }); }
      sfx.click();
      if (p.key === 'home') return go('home', { view: 'house' });
      if (!Auth.session()) return toast('要先登录 · Please log in first');
      go('visit', { place: p.key });
    };
  });
  return n;
}
