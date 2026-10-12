// The cafe starts empty. Buy furnishings in Shop > Home > Cafe.
import { ITEMS } from './pixel.js';

export const CAFE_ROOMS = ['cafedining1', 'cafemain', 'cafedining2', 'cafetoilet', 'cafekitchen', 'cafeentrance'];
export const CAFE_NEIGHBORS = {
  cafeentrance: { up: 'cafemain' },
  cafemain: { left: 'cafedining1', right: 'cafedining2', up: 'cafekitchen', down: 'cafeentrance' },
  cafedining1: { right: 'cafemain' },
  cafedining2: { left: 'cafemain', right: 'cafetoilet' },
  cafetoilet: { left: 'cafedining2' },
  cafekitchen: { down: 'cafemain' },
};

// v132's free starter copies have reserved IDs. Shop purchases use other IDs.
export const isCafeStarter = (id) => /#cafe-\d+$/.test(id);
export function clearCafeStarter(S) {
  if (!S.isAdmin()) return;
  const st = S.get();
  if (!st.owned.some(isCafeStarter)) return;
  st.owned = st.owned.filter((id) => !isCafeStarter(id));
  st.decorHidden = st.decorHidden.filter((id) => !isCafeStarter(id));
  ['decorRoom', 'decorPos', 'decorLayer', 'decorScale', 'powerOff'].forEach((field) => {
    Object.keys(st[field] || {}).filter(isCafeStarter).forEach((id) => { delete st[field][id]; });
  });
  S.save();
}

export function cafeLayout() {
  return { rooms: Object.fromEntries(CAFE_ROOMS.map((room) => [room, []])),
    open: CAFE_ROOMS.slice(), power: { dark: {}, off: {} }, styles: {} };
}

// Import the shared saved layout only once, so later edits (including empty rooms) persist.
// No cloud save/table is touched here: these are the normal local furniture fields.
export function prepareCafe(S, layout) {
  clearCafeStarter(S);
  if (!S.isAdmin() || S.get().cafeReady) return;
  const st = S.get();
  st.decorRoom = st.decorRoom || {}; st.decorPos = st.decorPos || {}; st.decorLayer = st.decorLayer || {};
  CAFE_ROOMS.forEach((room) => {
    (layout.rooms[room] || []).forEach((e) => {
      if (isCafeStarter(e.id) || !ITEMS[e.id]) return;
      if (!st.owned.includes(e.id)) st.owned.push(e.id);
      st.decorHidden = st.decorHidden.filter((id) => id !== e.id);
      st.decorRoom[e.id] = room;
      const x = /left:([\d.]+)%/.exec(e.css), y = /top:([\d.]+)%/.exec(e.css);
      if (x && y) st.decorPos[e.id] = { x: +x[1], y: +y[1] };
      if (e.stock) (st.displayStock ||= {})[e.id] = e.stock;
      if (e.scale) { st.decorScale = st.decorScale || {}; st.decorScale[e.id] = e.scale; }
      if (e.layer) st.decorLayer[e.id] = e.layer;
    });
    st.roomStyle = st.roomStyle || {}; st.roomStyle[room] = { ...(layout.styles || {})[room] };
    st.lightsOff = st.lightsOff || {}; st.lightsOff[room] = !!((layout.power || {}).dark || {})[room];
  });
  st.cafePrices = { ...(layout.prices || {}) };
  st.powerOff = { ...(st.powerOff || {}), ...((layout.power || {}).off || {}) };
  st.cafeReady = true; S.save();
}

// Numbers follow the same ID ordering as the server; orders retain the furniture ID.
export function cafeTableList(layout) {
  return Object.entries(layout.rooms || {}).flatMap(([room, items]) => items
    .filter((e) => ['cafetable2', 'cafetable4'].includes(e.id.split('#')[0]))
    .map((e) => ({ id: e.id, room })))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map((e, i) => ({ ...e, number: i + 1 }));
}
