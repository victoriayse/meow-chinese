import { BAKERY_EXCLUSIVE } from './pixel.js';
// Empty public mall: each floor's main room links vertically; side rooms link horizontally.
export const MALL_FLOORS = [
  ['mallcarpark'], ['malllobby', 'mallbakery', 'malltoilet1'],
  ['mallbuffet', 'mallfashion', 'mallchanging'], ['mallhome', 'mallcoffee'],
  ['mallhotpot', 'malltoilet4'], ['mallbowling', 'malltuition', 'mallclassroom'],
];
const names = [
  ['地下停车场', 'B1 · Carpark', '🚗'], ['商场大堂', 'L1 · Lobby', '🛍️'], ['面包店', 'L1 · Bakery', '🥐'], ['洗手间', 'L1 · Toilet', '🚻'],
  ['自助餐厅', 'L2 · Buffet', '🍱'], ['服装店', 'L2 · Fashion Store', '👗'], ['更衣室', 'L2 · Changing Room', '🚪'], ['家居店', 'L3 · Home Store 1', '🛋️'], ['咖啡店', 'L3 · Coffee Shop', '☕'],
  ['火锅店', 'L4 · Hotpot Restaurant', '🍲'], ['洗手间', 'L4 · Toilet', '🚻'], ['游戏厅', 'L5 · Arcade', '🕹️'], ['补习中心入口', 'L5 · Tuition Center Entrance', '📚'], ['补习室一', 'L5 · Tuition Room 1', '✏️'],
];
export const MALL_ROOMS = MALL_FLOORS.flat();
export const MALL_ROOM_INFO = MALL_ROOMS.map((key, i) => ({ key, zh: names[i][0], en: names[i][1], icon: names[i][2], place: 'mall', noRoof: true }));
// each floor's main room (the one with the stairs): the first room, except the Buffet sits to the LEFT of the Fashion Store
const LEFT_SIDE = new Set(['mallbuffet']);
const mainOf = (row) => row.find((k) => !LEFT_SIDE.has(k));
export function mallNeighbors(key) {
  const floor = MALL_FLOORS.findIndex((row) => row.includes(key)), row = MALL_FLOORS[floor];
  if (!row) return {};
  const i = row.indexOf(key), main = key === mainOf(row);
  return { ...(i ? { left: row[i - 1] } : {}), ...(i < row.length - 1 ? { right: row[i + 1] } : {}),
    ...(main && floor ? { down: mainOf(MALL_FLOORS[floor - 1]) } : {}), ...(main && floor < MALL_FLOORS.length - 1 ? { up: mainOf(MALL_FLOORS[floor + 1]) } : {}) };
}
export const MALL_VENUES = {
  mallbakery: { name: 'Bakery', kiosk: 'mallbakerykiosk', counter: 'mallbakerycounter', fur: 'ginger', menu: BAKERY_EXCLUSIVE },
  mallcoffee: { name: 'Coffee Shop', kiosk: 'mallcoffeekiosk', counter: 'mallcoffeecounter', fur: 'black', menu: ['coffee','tea','bubbletea','latte','cappuccino','hotchocolate','lemonade','desserttray','icedmatcha','hotmatcha','bottledwater','croissant','cakeslice'] },
  mallhotpot: { name: 'Hotpot Restaurant', kiosk: 'mallhotpotkiosk', counter: 'mallhotpotcounter', fur: 'white', menu: ['hotpotveg','hotpotmeat','hotpotseafood','hotpotfishball','hotpotmushroom','hotpotnoodles','bottledwater','tea'] },
};
export const mallTables = (layout, room) => ((layout.rooms || {})[room] || []).filter((e) => ['malltable','mallhotpottable','cafetable2','cafetable4'].includes(e.id.split('#')[0])).sort((a,b) => a.id < b.id ? -1 : 1).map((e,i) => ({...e,number:i+1}));
