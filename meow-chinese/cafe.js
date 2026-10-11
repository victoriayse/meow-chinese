// The cafe starts furnished. Its owner can move, store, sell or replace every piece.
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

export function cafeLayout() {
  let copy = 0;
  const at = (id, x, y, layer = 0) => ({ id: `${id}#cafe-${++copy}`, kind: 'stand', css: `left:${x}%;top:${y}%`, ...(layer ? { layer } : {}) });
  return { rooms: {
    cafeentrance: [at('cafecoffeesign', 37, 12), at('cafesofa', 30, 56), at('cafemenu', 64, 52), at('cafetree', 8, 41), at('cafetree', 76, 41)],
    cafemain: [at('cafecoffeesign', 6, 12), at('cafeshelves', 48, 12), at('cafebar', 4, 50),
      at('cafeespresso', 6, 30, 1), at('cafebeans', 30, 42, 1), at('cafepitcher', 38, 42, 1),
      at('cafeplant', 76, 17, 1), at('cafebarstool', 10, 67), at('cafebarstool', 29, 67),
      at('cafedisplay', 47, 45), at('cafecroissant', 52, 47, 1), at('cafepainauchocolat', 62, 47, 1), at('cafedonut', 72, 47, 1),
      at('cafecanele', 52, 57, 1), at('cafecakeslice', 62, 57, 1), at('cafecookies', 72, 57, 1),
      at('cafekiosk', 85, 40), at('cafecollect', 64, 76)],
    cafedining1: [at('cafependant', 22, 0), at('cafetable2', 12, 64), at('cafetable2', 57, 64), at('cafetree', 6, 28), at('cafeshelves', 58, 18), at('cafeplant', 80, 23, 1)],
    cafedining2: [at('cafetable4', 31, 55), at('cafesofa', 5, 36), at('cafetree', 77, 29)],
    cafetoilet: [at('washbasin', 57, 44), at('toilet', 17, 46), at('cafeplant', 83, 64)],
    cafekitchen: [at('fridge', 5, 28), at('sink', 37, 45), at('cafeshelves', 55, 12), at('cafestool', 30, 72), at('cafebin', 86, 65)],
  }, open: CAFE_ROOMS.slice(), power: { dark: {}, off: {} }, styles: {} };
}

// Import the shared starter/saved layout only once, so later edits (including empty rooms) persist.
// No cloud save/table is touched here: these are the normal local furniture fields.
export function prepareCafe(S, layout) {
  if (!S.isAdmin() || S.get().cafeReady) return;
  const st = S.get();
  st.decorRoom = st.decorRoom || {}; st.decorPos = st.decorPos || {}; st.decorLayer = st.decorLayer || {};
  CAFE_ROOMS.forEach((room) => {
    (layout.rooms[room] || []).forEach((e) => {
      if (!ITEMS[e.id]) return;
      if (!st.owned.includes(e.id)) st.owned.push(e.id);
      st.decorHidden = st.decorHidden.filter((id) => id !== e.id);
      st.decorRoom[e.id] = room;
      const x = /left:([\d.]+)%/.exec(e.css), y = /top:([\d.]+)%/.exec(e.css);
      if (x && y) st.decorPos[e.id] = { x: +x[1], y: +y[1] };
      if (e.layer) st.decorLayer[e.id] = e.layer;
    });
    st.roomStyle = st.roomStyle || {}; st.roomStyle[room] = { ...(layout.styles || {})[room] };
    st.lightsOff = st.lightsOff || {}; st.lightsOff[room] = !!((layout.power || {}).dark || {})[room];
  });
  st.cafePrices = { ...(layout.prices || {}) };
  st.powerOff = { ...(st.powerOff || {}), ...((layout.power || {}).off || {}) };
  st.cafeReady = true; S.save();
}
