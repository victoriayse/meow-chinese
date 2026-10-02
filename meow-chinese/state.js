// Game state: saved on this iPad (localStorage). Shaped as one JSON blob so it can
// later be backed up to Supabase as a single row.
import { ITEMS } from './pixel.js';

const KEY = 'meow-chinese-v1';

export const REWARDS = {
  firstTry: 3,      // word correct on first try
  retry: 1,         // word correct after learning it
  taskSpell: 15,    // finish one spelling round
  taskPerfect: 10,  // 5 words right first try today
  taskCare: 5,      // feed or pet the kitten
  allBonus: 20,     // all daily tasks done
};
export const PERFECT_TARGET = 5;

export const todayStr = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate() - 1); return todayStr(d); };
export const uid = () => Math.random().toString(36).slice(2, 10);

function sampleList() {
  return {
    id: uid(), name: '示例 Sample list', createdAt: Date.now(),
    words: [
      { w: '公园', hint: '我们去公园玩' },
      { w: '朋友', hint: '她是我的好朋友' },
      { w: '高兴', hint: '我今天很高兴' },
      { w: '帮助', hint: '我们要互相帮助' },
      { w: '认真', hint: '上课要认真听讲' },
      { w: '生日快乐', hint: '祝你生日快乐' },
    ],
  };
}

function fresh() {
  const list = sampleList();
  return {
    version: 1,
    onboarded: false,
    childName: '',
    kitten: { name: '咪咪', fur: 'ginger', hunger: 75, happy: 75, lastTick: Date.now(), equipped: { head: null, neck: null, face: null }, xp: 0, petsToday: 0 },
    coins: 30,
    pantry: { fish: 2, milk: 1 },
    owned: [],
    decorHidden: [],
    lists: [list],
    activeListId: list.id,
    words: {},       // per-word stats: { attempts, firstTry, wrong, lastSeen, lastResult, review, okStreak }
    sessions: [],    // { at, listName, total, firstTry, coins, mode }
    daily: { date: todayStr(), spell: false, perfect: 0, care: false, paid: { spell: false, perfect: false, care: false, bonus: false } },
    streak: { count: 0, lastDate: null },
    settings: { rate: 0.75, voiceURI: null, pin: null, sound: true },
    updatedAt: Date.now(),
  };
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.warn('load failed', e); }
  return fresh();
}
function migrate(s) {
  const base = fresh();
  const out = { ...base, ...s };
  out.kitten = { ...base.kitten, ...(s.kitten || {}) };
  out.kitten.equipped = { ...base.kitten.equipped, ...((s.kitten || {}).equipped || {}) };
  out.settings = { ...base.settings, ...(s.settings || {}) };
  out.daily = { ...base.daily, ...(s.daily || {}) };
  out.daily.paid = { ...base.daily.paid, ...((s.daily || {}).paid || {}) };
  if (!out.lists || !out.lists.length) { const l = sampleList(); out.lists = [l]; out.activeListId = l.id; }
  return out;
}

export function get() { return state; }
export function save() {
  state.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('save failed', e); }
  listeners.forEach((fn) => fn(state));
}
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function replaceAll(obj) { state = migrate(obj); save(); }
export function resetAll() { state = fresh(); save(); }

// ---------- time passing ----------
export function tick() {
  const k = state.kitten, now = Date.now();
  const hours = Math.max(0, (now - (k.lastTick || now)) / 3600000);
  if (hours > 0.05) {
    k.hunger = Math.max(8, k.hunger - hours * 1.5);   // ~36 per day
    k.happy = Math.max(8, k.happy - hours * 1.0);     // ~24 per day
    k.lastTick = now;
  }
  const d = todayStr();
  if (state.daily.date !== d) {
    state.daily = { date: d, spell: false, perfect: 0, care: false, paid: { spell: false, perfect: false, care: false, bonus: false } };
    k.petsToday = 0;
  }
  save();
}

export function mood() {
  const k = state.kitten;
  if (k.hunger < 30) return { face: 'normal', bubble: 'hungry', text: '肚子饿了… I\'m hungry!' };
  if (k.happy < 30) return { face: 'sleepy', bubble: 'sleepy', text: '好无聊… Play with me?' };
  if (k.hunger > 70 && k.happy > 70) return { face: 'happy', bubble: null, text: '今天好开心！' };
  return { face: 'normal', bubble: null, text: '' };
}
export const level = () => 1 + Math.floor((state.kitten.xp || 0) / 20);
export const levelProgress = () => ((state.kitten.xp || 0) % 20) / 20;

// ---------- coins & daily tasks ----------
export function addCoins(n) { state.coins += n; save(); }

// returns list of {label, coins} rewards newly granted
export function checkDaily() {
  const d = state.daily, got = [];
  const pay = (key, coins, label) => { if (!d.paid[key]) { d.paid[key] = true; state.coins += coins; got.push({ label, coins }); } };
  if (d.spell) pay('spell', REWARDS.taskSpell, '完成听写 Spelling done');
  if (d.perfect >= PERFECT_TARGET) pay('perfect', REWARDS.taskPerfect, `${PERFECT_TARGET}个全对 ${PERFECT_TARGET} perfect words`);
  if (d.care) pay('care', REWARDS.taskCare, '照顾小猫 Kitten care');
  if (d.paid.spell && d.paid.perfect && d.paid.care && !d.paid.bonus) {
    pay('bonus', REWARDS.allBonus, '全部完成！All tasks bonus');
    const s = state.streak;
    s.count = s.lastDate === yesterdayStr() ? s.count + 1 : (s.lastDate === todayStr() ? s.count : 1);
    s.lastDate = todayStr();
  }
  save();
  return got;
}

// ---------- kitten care ----------
export function feed(id) {
  const it = ITEMS[id];
  if (!it || !(state.pantry[id] > 0)) return false;
  state.pantry[id] -= 1;
  if (!state.pantry[id]) delete state.pantry[id];
  state.kitten.hunger = Math.min(100, state.kitten.hunger + (it.hunger || 0));
  state.kitten.happy = Math.min(100, state.kitten.happy + (it.happy || 0));
  state.daily.care = true;
  save();
  return true;
}
export function pet() {
  const k = state.kitten;
  k.petsToday = (k.petsToday || 0) + 1;
  if (k.petsToday <= 10) k.happy = Math.min(100, k.happy + 2);
  state.daily.care = true;
  save();
}
export function play() {
  state.kitten.happy = Math.min(100, state.kitten.happy + 6);
  state.daily.care = true;
  save();
}

// ---------- shop ----------
export function buy(id) {
  const it = ITEMS[id];
  if (!it || state.coins < it.price) return false;
  if (it.cat !== 'food' && state.owned.includes(id)) return false;
  state.coins -= it.price;
  if (it.cat === 'food') state.pantry[id] = (state.pantry[id] || 0) + 1;
  else state.owned.push(id);
  if (it.cat === 'wear') state.kitten.equipped[it.slot] = id;
  save();
  return true;
}
export function toggleWear(id) {
  const it = ITEMS[id]; const eq = state.kitten.equipped;
  eq[it.slot] = eq[it.slot] === id ? null : id;
  save();
}
export function toggleDecor(id) {
  const h = state.decorHidden;
  const i = h.indexOf(id);
  if (i >= 0) h.splice(i, 1); else h.push(id);
  save();
}

// ---------- lists & word stats ----------
export const activeList = () => state.lists.find((l) => l.id === state.activeListId) || state.lists[0];

export function recordWord(w, result) {
  // result: 'first' | 'retry' | 'wrong'
  const s = state.words[w] || (state.words[w] = { attempts: 0, firstTry: 0, wrong: 0, okStreak: 0, review: false });
  s.attempts += 1; s.lastSeen = Date.now(); s.lastResult = result;
  if (result === 'first') {
    s.firstTry += 1; s.okStreak += 1;
    if (s.okStreak >= 2) s.review = false;
    state.daily.perfect += 1;
    state.kitten.xp = (state.kitten.xp || 0) + 1;
  } else {
    s.okStreak = 0; s.review = true;
    if (result === 'wrong') s.wrong += 1; else state.kitten.xp = (state.kitten.xp || 0) + 1;
  }
  save();
}

export function reviewWords() {
  // words currently in the mistakes book, with hint sentence if one exists in any list
  const hints = {};
  state.lists.forEach((l) => l.words.forEach((x) => { if (x.hint && !hints[x.w]) hints[x.w] = x.hint; }));
  return Object.entries(state.words).filter(([, s]) => s.review).map(([w]) => ({ w, hint: hints[w] || '' }));
}

export function logSession(sess) {
  state.sessions.unshift({ at: Date.now(), ...sess });
  state.sessions = state.sessions.slice(0, 200);
  save();
}

// parse the parent's word list text: one entry per line, optional hint after | or ｜ or tab
export function parseWords(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [w, ...rest] = line.split(/[|｜\t]/);
    return { w: w.replace(/\s+/g, '').trim(), hint: rest.join(' ').trim() };
  }).filter((x) => x.w);
}
