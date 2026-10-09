// Pets at home: a puppy that roams the whole house (and hops onto sofas, chairs, mats and beds),
// and a hamster / guinea pig that live in their cage until the door is opened.
// Where each pet is lives only here (not saved): it wanders on its own every few seconds.
// The house screen (and friends visiting) draw the pets from snapshot().
import * as S from './state.js';
import { ITEMS } from './pixel.js';
import { roomLayout } from './house.js';

const live = new Map();          // kind -> { room, x, y, left, mode: 'walk'|'idle'|'sit'|'cage', seat, until, dur, jump, exit }
const listeners = new Set();
export const onPets = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const SPEED = { dog: 11, guineapig: 6, hamster: 7 };      // % of the room per second
const rnd = (a, b) => a + Math.random() * (b - a);
const openRooms = () => (S.unlocked('decor') ? S.ROOMS.filter((r) => S.roomOpen(r.key)).map((r) => r.key) : ['living']);

// is this pet free to wander (dog always; the small ones when let out, or when their cage is put away)
export const roaming = (p) => !ITEMS[p.kind].cage || p.out || !S.petCage(p.kind);

function start(p) {
  const rooms = openRooms();
  const cage = ITEMS[p.kind].cage && S.petCage(p.kind);
  const room = cage ? S.roomOf(cage) : (rooms.includes('living') ? 'living' : rooms[0]);
  return { room, x: rnd(15, 85), y: rnd(2, 20), left: Math.random() < 0.5, mode: 'idle', seat: null, until: Date.now() + rnd(500, 2500), dur: 0, jump: true };
}
// she let the hamster out: it starts from the cage door
export function letOut(kind) {
  const cage = S.petCage(kind), l = live.get(kind) || {};
  S.setPetOut(kind, true);
  live.set(kind, { ...l, room: cage ? S.roomOf(cage) : (l.room || 'living'), mode: 'idle', seat: null, until: Date.now() + 1200, dur: 0, jump: true, fromCage: cage });
  changed();
}
export function putBack(kind) { S.setPetOut(kind, false); live.delete(kind); changed(); }

// somewhere to sit in this room: seats (sofa, chairs, bench, bed) and mats / rugs / the dog bed
function sitSpots(room) {
  const s = S.get(), out = [];
  roomLayout(s, room, S.roomOf).forEach((e) => {
    const it = ITEMS[e.id]; if (!it) return;
    if (it.seat) (it.seat.spots || [0]).forEach((_, i) => out.push({ id: e.id, slot: i }));
    else if (it.petbed || e.kind === 'flat') out.push({ id: e.id, flat: true });
  });
  const cs = s.catSeat;
  return out.filter((o) => !(cs && cs.room === room && cs.id === o.id && (cs.slot || 0) === (o.slot || 0)));
}
function walkTo(l, kind, x, y) {
  const d = Math.hypot(x - l.x, (y - l.y) * 1.4);
  l.dur = Math.max(0.6, d / SPEED[kind]);
  l.left = x < l.x; l.x = x; l.y = y; l.mode = 'walk'; l.seat = null;
  l.until = Date.now() + l.dur * 1000;
}
function step(p, l, now) {
  l.jump = false; l.fromCage = null;
  const kind = p.kind, rooms = openRooms();
  if (!rooms.includes(l.room)) { Object.assign(l, start(p)); return; }
  // arrived at the edge of the room: pop into the next one
  if (l.exit) {
    const i = rooms.indexOf(l.room), next = rooms[i + (l.exit === 'left' ? -1 : 1)];
    if (next) { l.room = next; l.x = l.exit === 'left' ? 97 : 3; l.jump = true; l.mode = 'idle'; l.until = now + 300; l.dur = 0; }
    l.exit = null; return;
  }
  const r = Math.random();
  const i = rooms.indexOf(l.room);
  const doors = [i > 0 ? 'left' : null, i < rooms.length - 1 ? 'right' : null].filter(Boolean);
  if (l.mode === 'walk' || l.mode === 'sit') { l.mode = 'idle'; l.seat = null; l.dur = 0; l.until = now + rnd(1500, 4500); if (Math.random() < 0.5) return; }
  if (r < 0.16 && doors.length) {                     // wander off to the next room
    const dir = doors[Math.floor(Math.random() * doors.length)];
    walkTo(l, kind, dir === 'left' ? 1 : 99, l.y); l.exit = dir; return;
  }
  if (kind === 'dog' && r < 0.42) {                    // hop onto something comfy for a while
    const spots = sitSpots(l.room);
    if (spots.length) { const sp = spots[Math.floor(Math.random() * spots.length)]; l.mode = 'sit'; l.seat = sp; l.dur = 0.8; l.until = now + rnd(7000, 14000); return; }
  }
  if (r < 0.8) { walkTo(l, kind, rnd(8, 92), rnd(1, 26)); return; }
  l.mode = 'idle'; l.dur = 0; l.until = now + rnd(2000, 5000);
}
function tick() {
  const now = Date.now(); let any = false;
  const kinds = new Set();
  S.pets().forEach((p) => {
    kinds.add(p.kind);
    if (!roaming(p)) {
      const cage = S.petCage(p.kind), l = live.get(p.kind);
      const room = S.roomOf(cage);
      if (!l || l.mode !== 'cage' || l.cage !== cage || l.room !== room) { live.set(p.kind, { mode: 'cage', cage, room, x: 0, y: 0 }); any = true; }
      return;
    }
    let l = live.get(p.kind);
    if (!l || l.mode === 'cage') { l = start(p); if (live.get(p.kind) && live.get(p.kind).mode === 'cage') { const c = live.get(p.kind).cage; l.room = S.roomOf(c); l.fromCage = c; } live.set(p.kind, l); any = true; }
    if (now >= l.until) { step(p, l, now); any = true; }
  });
  [...live.keys()].forEach((k) => { if (!kinds.has(k)) { live.delete(k); any = true; } });
  if (any) changed();
}
function changed() { const snap = snapshot(); listeners.forEach((fn) => { try { fn(snap); } catch (e) { console.warn(e); } }); }
// what to draw: [{ kind, name, room, x, y, left, mode, seat, dur, jump, cage, fromCage }]
export function snapshot() {
  return S.pets().filter((p) => live.has(p.kind)).map((p) => {
    const l = live.get(p.kind);
    return { kind: p.kind, name: p.name, room: l.room, x: +(+l.x || 0).toFixed(1), y: +(+l.y || 0).toFixed(1), left: !!l.left, mode: l.mode, seat: l.seat || null, dur: +(l.dur || 0).toFixed(2), jump: !!l.jump, cage: l.cage || null, fromCage: l.fromCage || null };
  });
}
// where pets are sitting in a room (so the kitten doesn't sit on top of the puppy)
export const seatedIn = (room) => snapshot().filter((p) => p.room === room && p.mode === 'sit' && p.seat && !p.seat.flat).map((p) => ({ seat: p.seat.id, slot: p.seat.slot || 0 }));
let timer = null;
export function startPets() { if (!timer) { timer = setInterval(tick, 400); tick(); } }
export const refreshPets = () => { tick(); changed(); };
