// Game state: saved on this iPad (localStorage). Shaped as one JSON blob so it can
// later be backed up to Supabase as a single row.
import { ITEMS } from './pixel.js';

const KEY = 'meow-chinese-v1';

export const REWARDS = {
  firstTry: 3,      // word correct on first try
  retry: 1,         // word correct after learning it
  taskSpell: 15,    // finish one spelling round
  taskPerfect: 10,  // at least 8 out of 10 words right today
  taskCare: 5,      // feed or pet the kitten
  allBonus: 20,     // all daily tasks done
};
export const WORDS_TARGET = 10;   // write at least 10 words today…
export const RIGHT_TARGET = 8;    // …with 8 out of 10 (80%) right on the first try
export const MAX_FREEZES = 3;
export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

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
    kitten: { name: '咪咪', fur: 'ginger', hunger: 75, water: 75, happy: 75, lastTick: Date.now(), equipped: { head: null, body: null, feet: null, neck: null, face: null }, xp: 0, petsToday: 0 },
    coins: 30,
    pantry: { fish: 2, milk: 1, water: 2 },
    prices: {},      // parent overrides: { itemId: price }
    owned: [],
    decorHidden: [],
    decorPos: {},
    letters: [],       // letters from friends: { id, from, fromName, text, at, read }
    gifts: [],         // gifts from friends: { id, from, fromName, item, message, at, opened }
    friendNews: [],    // e.g. a friend fed her kitten: { id, fromName, item, at, seen }
    appliedEvents: [], // friend event ids already handled on this account
    notifications: [], // the flip phone's notifications: { id, kind, title, body, essayId, at, read }
    notes: [],         // notepad: { id, text, at }
    alarms: [],        // clock alarms: { id, time: 'HH:MM', on }
    sentLetters: [],   // messages she sent: { id, to, toName, text, at }
    bank: { deposits: [] },  // fixed deposits: { id, amount, plan, at }    // where she dragged each home item: { id: { x, y } } in % of the room
    catPos: null,    // where the kitten stands in the house: { x, y } in % (x = centre, y = from the floor)
    lists: [list],
    activeListId: list.id,
    words: {},       // per-word stats: { attempts, firstTry, wrong, lastSeen, lastResult, review, okStreak }
    sessions: [],    // { at, listName, total, firstTry, coins, mode }
    daily: { date: todayStr(), spell: false, tried: 0, right: 0, care: false, paid: { spell: false, perfect: false, care: false, bonus: false } },
    streak: { count: 0, lastDate: null, freezes: 0 },
    health: { stage: 'ok', lastActive: todayStr(), treated: null },
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
  out.streak = { ...base.streak, ...(s.streak || {}) };
  out.health = { ...base.health, ...(s.health || {}) };
  out.prices = { ...(s.prices || {}) };
  // the garden fence was retired when the garden became a home: refund it
  if ((out.owned || []).includes('fence')) { out.owned = out.owned.filter((x) => x !== 'fence'); out.coins += 40; }
  out.owned = (out.owned || []).filter((x) => ITEMS[x]);
  if (typeof out.kitten.water !== 'number') out.kitten.water = 75;
  if (typeof out.daily.tried !== 'number') { out.daily.tried = 0; out.daily.right = 0; }
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
// another tab of the app saved: take its copy, so this tab never writes old progress back over it
const externalListeners = new Set();
export function onExternalChange(fn) { externalListeners.add(fn); }
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try {
    const other = JSON.parse(e.newValue);
    if ((other.updatedAt || 0) < (state.updatedAt || 0)) return;
    state = migrate(other);
    externalListeners.forEach((fn) => fn(state));
  } catch (x) { console.warn('could not read the other tab\'s save', x); }
});
// save bookkeeping (e.g. sync status) without counting it as a change
export function saveQuiet() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('save failed', e); } }
export function replaceAll(obj) { state = migrate(obj); save(); }
export function replaceQuiet(obj) { state = migrate(obj); saveQuiet(); }
export function resetAll() { state = fresh(); save(); }

// ---------- time passing ----------
export function tick() {
  const k = state.kitten, now = Date.now();
  const hours = Math.max(0, (now - (k.lastTick || now)) / 3600000);
  if (hours > 0.05) {
    k.hunger = Math.max(8, k.hunger - hours * 1.5);   // ~36 per day
    k.happy = Math.max(8, k.happy - hours * 1.0);     // ~24 per day
    k.water = Math.max(8, (k.water ?? 75) - hours * 2.0); // ~48 per day
    k.lastTick = now;
  }
  const d = todayStr();
  if (state.daily.date !== d) {
    state.daily = { date: d, spell: false, tried: 0, right: 0, care: false, paid: { spell: false, perfect: false, care: false, bonus: false } };
    k.petsToday = 0;
    // missed days: use streak freezes if she has enough, otherwise the streak resets
    const st = state.streak;
    if (st.lastDate && st.count > 0) {
      const missed = daysBetween(st.lastDate, d) - 1;
      if (missed > 0) {
        if ((st.freezes || 0) >= missed) { st.freezes -= missed; st.lastDate = yesterdayStr(); state.freezeUsed = missed; }
        else { st.count = 0; }
      }
    }
  }
  updateHealth();
  saveQuiet();
}

// ---------- health: skipping tasks for days makes the kitten ill ----------
// A day counts as active if she finished a spelling round, the 8/10 task, or fed the kitten (petting doesn't count).
export const STAGES = ['ok', 'cough', 'dizzy', 'faint', 'dead'];
export const SICK_AFTER = { cough: 3, dizzy: 5, faint: 7, dead: 10 };
export function missedDays() {
  const h = state.health, t = todayStr();
  const from = [h.lastActive, h.treated].filter(Boolean).sort().pop() || t;
  return Math.max(0, daysBetween(from, t) - 1);   // full days missed, not counting today
}
function stageFor(missed) {
  if (missed >= SICK_AFTER.dead) return 'dead';
  if (missed >= SICK_AFTER.faint) return 'faint';
  if (missed >= SICK_AFTER.dizzy) return 'dizzy';
  if (missed >= SICK_AFTER.cough) return 'cough';
  return 'ok';
}
export function updateHealth() {
  const h = state.health;
  const next = stageFor(missedDays());
  // illness only gets worse by itself; medicine or the hospital makes it better
  if (STAGES.indexOf(next) > STAGES.indexOf(h.stage)) h.stage = next;
}
export const health = () => state.health.stage;
export function markActive() { state.health.lastActive = todayStr(); }
export const CURES = { syrup: 'cough', panadol: 'dizzy', hospital: 'faint' };
export function treat(id) {
  const h = state.health, need = CURES[id];
  if (!need || h.stage !== need) return false;
  const cost = price(id);
  if (state.coins < cost) return false;
  state.coins -= cost;
  h.stage = 'ok'; h.treated = todayStr();
  if (id === 'hospital') { const k = state.kitten; k.hunger = Math.max(k.hunger, 60); k.water = Math.max(k.water ?? 0, 60); k.happy = Math.max(k.happy, 60); }
  save();
  return true;
}
// the kitten has died: choose a new kitten. Word lists, progress, coins and items are kept.
export function restartKitten() {
  const base = fresh();
  state.kitten = { ...base.kitten, equipped: { head: null, body: null, feet: null, neck: null, face: null } };
  state.health = base.health;
  state.streak = { ...base.streak, freezes: state.streak.freezes || 0 };
  state.daily = base.daily;
  state.needsSetup = true;
  save();
}

export const tasksDone = () => !!state.daily.paid.bonus;
export function mood() {
  const k = state.kitten, needs = [];
  if (k.hunger < 30) needs.push('hungry');
  if ((k.water ?? 75) < 30) needs.push('thirsty');
  const st = state.health.stage;
  if (st === 'faint') return { face: 'faint', needs, text: '' };
  if (st === 'dizzy') return { face: 'dizzy', needs, text: '头好晕…需要药药' };
  if (st === 'cough') return { face: 'cough', needs, text: '咳咳…咳咳…' };
  if ((state.essays || []).some((e) => e.status === 'assigned')) return { face: 'happy', needs, text: '我们一起写作文！', essay: true };
  if (state.daily.bored && !state.daily.playDone) return { face: 'bored', needs, text: '好无聊…陪我玩嘛！' };
  if (!tasksDone()) return { face: 'cry', needs, text: '呜呜…今天的任务还没做完' };
  if (needs.includes('thirsty')) return { face: 'thirsty', needs, text: '好渴…想喝水' };
  if (needs.includes('hungry')) return { face: 'hungry', needs, text: '肚子饿了…' };
  if (k.happy < 30) return { face: 'sleepy', needs, text: '好无聊… Play with me?' };
  return { face: 'happy', needs, text: '今天好开心！' };
}
// XP: parents can change how much each thing gives and how much one level needs
export const XP_DEFAULTS = { word: 1, essay: 10, level: 20 };
const xpSetting = (k) => { const v = Number((state.settings.xp || {})[k]); return Number.isFinite(v) && v >= 0 ? v : XP_DEFAULTS[k]; };
export const xpPerWord = () => xpSetting('word');
export const xpPerEssay = () => xpSetting('essay');
export const xpPerLevel = () => Math.max(1, xpSetting('level'));
export function setXpSetting(k, v) {
  v = Math.max(k === 'level' ? 1 : 0, Math.round(Number(v) || 0));
  state.settings.xp = { ...(state.settings.xp || {}), [k]: v };
  if (state.lastLevel && state.lastLevel > level()) state.lastLevel = level();
  save();
}
export const xp = () => state.kitten.xp || 0;
export function addXp(n) {
  state.kitten.xp = Math.max(0, xp() + Math.round(Number(n) || 0));
  if (state.lastLevel && state.lastLevel > level()) state.lastLevel = level();
}
export const level = () => 1 + Math.floor(xp() / xpPerLevel());
export const levelProgress = () => (xp() % xpPerLevel()) / xpPerLevel();
export const xpIntoLevel = () => xp() % xpPerLevel();

// ---------- coins & daily tasks ----------
export function addCoins(n) { state.coins += n; save(); }

export function perfectDone() {
  const d = state.daily;
  return d.tried >= WORDS_TARGET && d.right / d.tried >= RIGHT_TARGET / WORDS_TARGET;
}
// returns list of {label, coins} rewards newly granted
export function checkDaily() {
  const d = state.daily, got = [];
  if (d.spell || d.fed || perfectDone()) markActive();
  const pay = (key, coins, label) => { if (!d.paid[key]) { d.paid[key] = true; state.coins += coins; got.push({ label, coins }); } };
  if (d.spell) pay('spell', REWARDS.taskSpell, '完成听写 Spelling done');
  if (perfectDone()) pay('perfect', REWARDS.taskPerfect, `${RIGHT_TARGET}/${WORDS_TARGET} 写对 Great accuracy`);
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
  state.kitten.water = Math.min(100, (state.kitten.water ?? 75) + (it.water || 0));
  state.daily.care = true;
  state.daily.fed = true;
  markActive();
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
export const price = (id) => (Number.isFinite(state.prices?.[id]) ? state.prices[id] : ITEMS[id].price);
export function setPrice(id, v) {
  v = Math.round(Number(v));
  if (!Number.isFinite(v) || v < 0) return;
  if (v === ITEMS[id].price) delete state.prices[id]; else state.prices[id] = v;
  save();
}
export function buy(id) {
  const it = ITEMS[id], cost = it ? price(id) : Infinity;
  if (!it || state.coins < cost) return false;
  if (it.cat === 'pharmacy' || it.cat === 'service') return treat(id);
  if (it.cat === 'special') {
    if ((state.streak.freezes || 0) >= MAX_FREEZES) return false;
    state.coins -= cost; state.streak.freezes = (state.streak.freezes || 0) + 1; save(); return true;
  }
  if (it.cat !== 'food' && state.owned.includes(id)) return false;
  state.coins -= cost;
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
export const activeList = () => state.lists.find((l) => l.id === state.activeListId) || currentList() || state.lists[0];

// ---------- spelling dates ----------
// Each list has a date set by the parent. A list appears for her on its date. The newest one is the
// "current" spelling: she must finish it once before older lists open again. Each list can be done once a day.
export const listDate = (l) => l.date || todayStr(new Date(l.createdAt || Date.now()));
const byNewest = (a, b) => (listDate(b).localeCompare(listDate(a))) || ((b.createdAt || 0) - (a.createdAt || 0));
export const releasedLists = () => state.lists.filter((l) => listDate(l) <= todayStr()).sort(byNewest);
export const currentList = () => releasedLists()[0] || null;
// 'open' | 'done-today' | 'locked' (finish the current list first) | 'future'
export function listStatus(l) {
  if (!l) return 'future';
  if (listDate(l) > todayStr()) return 'future';
  if (l.lastDone === todayStr()) return 'done-today';
  const cur = currentList();
  if (cur && cur.id !== l.id && !cur.done) return 'locked';
  return 'open';
}
export function finishList(id) {
  const l = state.lists.find((x) => x.id === id);
  if (!l) return;
  l.done = true; l.lastDone = todayStr();
  save();
}

export function recordWord(w, result, firstAttempt = result === 'first') {
  // result: 'first' | 'retry' | 'wrong'
  if (firstAttempt) { state.daily.tried += 1; if (result === 'first') state.daily.right += 1; }
  const s = state.words[w] || (state.words[w] = { attempts: 0, firstTry: 0, wrong: 0, okStreak: 0, review: false });
  s.attempts += 1; s.lastSeen = Date.now(); s.lastResult = result;
  if (result === 'first') {
    s.firstTry += 1; s.okStreak += 1;
    if (s.okStreak >= 2) s.review = false;
    addXp(xpPerWord());
  } else {
    s.okStreak = 0; s.review = true;
    if (result === 'wrong') s.wrong += 1; else addXp(xpPerWord());
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

// parse the parent's word list text: one entry per line, optional hint sentence after | or ｜ or tab.
// Several words on one line (separated by spaces, commas or 、) become separate words.
export function parseWords(text) {
  const out = [];
  text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
    const [left, ...rest] = line.split(/[|｜\t]/);
    const hint = rest.join(' ').trim();
    const words = left.split(/[\s,，、;；。.]+/).map((w) => w.trim()).filter(Boolean);
    words.forEach((w) => out.push({ w, hint: words.length === 1 || hint.includes(w) ? hint : '' }));
  });
  return out;
}

// essay helping words: exactly one word or phrase per line (spaces are kept), optional "| meaning"
export function parseLines(text) {
  return String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [left, ...rest] = line.split(/[|｜\t]/);
    return { w: left.trim().replace(/\s+/g, ' '), hint: rest.join(' ').trim() };
  }).filter((x) => x.w);
}

// ---------- "Play with me": a surprise revision round of past words ----------
export const PLAY_REWARD = 15;
export function maybeBored() {
  const d = state.daily;
  if (d.bored || d.playDone || state.health.stage !== 'ok') return false;
  if (Object.keys(state.words).length < 5) return false;     // needs some past words to revise
  if (Math.random() < 0.2) { d.bored = true; save(); return true; }
  return false;
}
export function playWords(n = 10) {
  const hints = {};
  state.lists.forEach((l) => l.words.forEach((x) => { if (x.hint && !hints[x.w]) hints[x.w] = x.hint; }));
  const all = Object.keys(state.words);
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all.slice(0, n).map((w) => ({ w, hint: hints[w] || '' }));
}
// returns coins won (0 if not good enough)
export function finishPlay(first, total) {
  const d = state.daily;
  d.playDone = true; d.bored = false;
  let won = 0;
  if (total > 0 && first / total >= RIGHT_TARGET / WORDS_TARGET && !d.playPaid) { d.playPaid = true; state.coins += PLAY_REWARD; won = PLAY_REWARD; }
  state.kitten.happy = Math.min(100, state.kitten.happy + 15);
  save();
  return won;
}

// ---------- level unlocks ----------
export const UNLOCKS = { head: 5, feet: 10, acc: 15, body: 20, decor: 25 };
export const UNLOCK_NAMES = { head: '头饰 Hair accessories', feet: '鞋子 Shoes', acc: '配饰 Extras', body: '衣服 Clothes', decor: '我的家 Home & furniture' };
export const unlocked = (key) => !(key in UNLOCKS) || !!state.settings.unlockAll || level() >= UNLOCKS[key];
export function nextUnlock() {
  const lv = level();
  const next = Object.entries(UNLOCKS).sort((a, b) => a[1] - b[1]).find(([, l]) => l > lv);
  return next ? { key: next[0], level: next[1], name: UNLOCK_NAMES[next[0]] } : null;
}

// ---------- 看图作文 picture compositions ----------
// An essay is set up by a parent; the child writes on paper and taps "Submit";
// the parent reviews it and gives stars, coins and a comment.
export const essays = () => state.essays || (state.essays = []);
export const outstandingEssays = () => essays().filter((e) => e.status === 'assigned');
export function addEssay({ title, storyId = null, image = null, words = [], minChars = 80, timeLimit = 0, allowExtend = true }) {
  const e = { id: uid(), title, storyId, image, words, minChars, timeLimit, allowExtend, extraMin: 0, extensions: 0, status: 'assigned', createdAt: Date.now() };
  essays().unshift(e); save(); return e;
}
export function updateEssay(id, patch) { const e = essays().find((x) => x.id === id); if (e) { Object.assign(e, patch); save(); } return e; }
// ----- friends -----
// handle something a friend sent (each event only once, even with two devices)
export function receiveFriendEvent(ev, fromName) {
  const key = 'e' + ev.id;
  if ((state.appliedEvents || []).includes(key)) return null;
  state.appliedEvents = [...(state.appliedEvents || []), key].slice(-300);
  const p = ev.payload || {}, at = Date.parse(ev.created_at) || Date.now(), id = key;
  let out = null;
  if (ev.kind === 'feed' && ITEMS[p.item] && ITEMS[p.item].cat === 'food') {
    const it = ITEMS[p.item], k = state.kitten;
    k.hunger = Math.min(100, k.hunger + (it.hunger || 0));
    k.happy = Math.min(100, k.happy + (it.happy || 0) + 3);
    k.water = Math.min(100, (k.water ?? 75) + (it.water || 0));
    out = { id, kind: 'feed', fromName, item: p.item, at, seen: false };
    state.friendNews = [out, ...(state.friendNews || [])].slice(0, 30);
    state.notifications = [{ id: 'n' + id, kind: 'feed', title: `${fromName}喂了你的小猫`, body: `A friend fed your kitten ${it.en}`, item: p.item, at, read: false }, ...(state.notifications || [])].slice(0, 200);
  } else if (ev.kind === 'letter' && p.text) {
    out = { id, kind: 'letter', from: ev.from_user, fromName, text: String(p.text).slice(0, 300), at, read: false };
    state.letters = [out, ...(state.letters || [])].slice(0, 100);
  } else if (ev.kind === 'gift' && ITEMS[p.item]) {
    out = { id, kind: 'gift', from: ev.from_user, fromName, item: p.item, message: String(p.message || '').slice(0, 300), at, opened: false };
    state.gifts = [out, ...(state.gifts || [])].slice(0, 100);
    state.notifications = [{ id: 'n' + id, kind: 'gift', title: `${fromName}送你一份礼物`, body: 'You got a gift — open the 🎁 box on the home screen', item: p.item, at, read: false }, ...(state.notifications || [])].slice(0, 200);
  }
  save();
  return out;
}
// ----- flip phone -----
export function notify(n) {
  state.notifications = state.notifications || [];
  if (state.notifications.some((x) => x.id === n.id)) return;
  state.notifications.unshift({ at: Date.now(), read: false, ...n });
  state.notifications = state.notifications.slice(0, 200);
  save();
}
export const unreadNotifications = () => (state.notifications || []).filter((x) => !x.read);
export const phoneBadge = () => unreadNotifications().length + unreadLetters().length;
export function readNotification(id) { const x = (state.notifications || []).find((y) => y.id === id); if (x && !x.read) { x.read = true; if (x.essayId) markEssaySeen(x.essayId); else save(); } }
export function deleteNotification(id) { state.notifications = (state.notifications || []).filter((x) => x.id !== id); save(); }
// a checked composition becomes a notification once (deleting it never brings it back)
export function essayNotifications() {
  let changed = false;
  essays().forEach((e) => {
    if (e.status === 'reviewed' && !e.notified) {
      e.notified = true; changed = true;
      state.notifications = state.notifications || [];
      if (!state.notifications.some((x) => x.id === 'essay-' + e.id)) {
        state.notifications.unshift({ id: 'essay-' + e.id, kind: 'essay', essayId: e.id, title: `作文批改好了：${e.title}`, body: 'Mum checked your writing', at: (e.review && e.review.at) || Date.now(), read: !!e.seen });
      }
    }
  });
  if (changed) save();
}
// messages older than 10 days disappear by themselves
export const MESSAGE_DAYS = 10;
export function purgeOldMessages() {
  const cut = Date.now() - MESSAGE_DAYS * 86400000;
  const a = state.letters || [], b = state.sentLetters || [];
  const a2 = a.filter((x) => x.at >= cut), b2 = b.filter((x) => x.at >= cut);
  if (a2.length !== a.length || b2.length !== b.length) { state.letters = a2; state.sentLetters = b2; save(); }
}
export function recordSent(to, toName, text) {
  state.sentLetters = [{ id: uid(), to, toName, text: String(text).slice(0, 300), at: Date.now() }, ...(state.sentLetters || [])].slice(0, 300);
  save();
}
export function deleteSent(id) { state.sentLetters = (state.sentLetters || []).filter((x) => x.id !== id); save(); }
export function deleteThread(friendId) {
  state.letters = (state.letters || []).filter((x) => x.from !== friendId);
  state.sentLetters = (state.sentLetters || []).filter((x) => x.to !== friendId);
  save();
}
// conversations grouped by friend, newest first
export function threads() {
  const map = new Map();
  const add = (fid, name, m) => {
    if (!map.has(fid)) map.set(fid, { id: fid, name, msgs: [], unread: 0, last: 0 });
    const t = map.get(fid);
    t.msgs.push(m);
    if (m.at > t.last) { t.last = m.at; if (name) t.name = name; }
    if (m.mine === false && !m.read) t.unread++;
  };
  (state.letters || []).forEach((l) => add(l.from || 'unknown', l.fromName, { ...l, mine: false }));
  (state.sentLetters || []).forEach((l) => add(l.to, l.toName, { ...l, mine: true, read: true }));
  const out = [...map.values()];
  out.forEach((t) => t.msgs.sort((x, y) => x.at - y.at));
  return out.sort((x, y) => y.last - x.last);
}
export function readThread(friendId) {
  let ch = false;
  (state.letters || []).forEach((l) => { if (l.from === friendId && !l.read) { l.read = true; ch = true; } });
  if (ch) save();
}

// ----- bank: fixed deposits that earn interest if left long enough -----
export const BANK_DEFAULTS = [{ rate: 0.10, days: 5 }, { rate: 0.15, days: 7 }, { rate: 0.20, days: 14 }];
// parents can change the three plans; each deposit keeps the terms it was made with
export const bankPlans = () => {
  const p = state.settings.bankPlans;
  return Array.isArray(p) && p.length === 3 ? p.map((x, i) => ({ rate: Number.isFinite(+x.rate) ? +x.rate : BANK_DEFAULTS[i].rate, days: Math.max(1, Math.round(+x.days || BANK_DEFAULTS[i].days)) })) : BANK_DEFAULTS;
};
export function setBankPlans(list) { state.settings.bankPlans = list.map((x) => ({ rate: Math.max(0, Math.min(5, +x.rate || 0)), days: Math.max(1, Math.min(365, Math.round(+x.days || 1))) })); save(); }
const terms = (d) => (Number.isFinite(d.rate) && d.days ? { rate: d.rate, days: d.days } : (bankPlans()[d.plan] || BANK_DEFAULTS[0]));
export const depositTerms = terms;
export const bank = () => { if (!state.bank) state.bank = { deposits: [] }; return state.bank; };
export const depositMatures = (d) => d.at + terms(d).days * 86400000;
export const depositInterest = (d) => Math.round(d.amount * terms(d).rate);
export function deposit(amount, plan) {
  amount = Math.floor(Number(amount) || 0);
  const p = bankPlans()[plan];
  if (amount <= 0 || amount > state.coins || !p) return null;
  state.coins -= amount;
  const d = { id: uid(), amount, plan, rate: p.rate, days: p.days, at: Date.now() };
  bank().deposits.push(d); save(); return d;
}
export function withdraw(id) {
  const b = bank(), d = b.deposits.find((x) => x.id === id);
  if (!d) return null;
  const ripe = Date.now() >= depositMatures(d);
  const interest = ripe ? depositInterest(d) : 0;
  b.deposits = b.deposits.filter((x) => x.id !== id);
  state.coins += d.amount + interest;
  save();
  return { amount: d.amount, interest };
}
export function readLetter(id) { const l = (state.letters || []).find((x) => x.id === id); if (l && !l.read) { l.read = true; save(); } }
export function deleteLetter(id) { state.letters = (state.letters || []).filter((x) => x.id !== id); save(); }
export function saveNote(id, text) {
  state.notes = state.notes || [];
  const t = String(text).slice(0, 2000);
  const n = id && state.notes.find((x) => x.id === id);
  if (n) { n.text = t; n.at = Date.now(); } else state.notes.unshift({ id: uid(), text: t, at: Date.now() });
  save();
}
export function deleteNote(id) { state.notes = (state.notes || []).filter((x) => x.id !== id); save(); }
export function setAlarms(list) { state.alarms = list; save(); }
export const unopenedGifts = () => (state.gifts || []).filter((g) => !g.opened);
export const unreadLetters = () => (state.letters || []).filter((l) => !l.read);
export function openGift(id) {
  const g = (state.gifts || []).find((x) => x.id === id);
  if (!g || g.opened) return null;
  const it = ITEMS[g.item];
  g.opened = true; g.openedAt = Date.now();
  let result = 'added';
  if (it.cat === 'food') state.pantry[g.item] = (state.pantry[g.item] || 0) + 1;
  else if (state.owned.includes(g.item)) { state.coins += price(g.item); result = 'coins'; }   // already has it: turn it into coins
  else state.owned.push(g.item);
  save();
  return { gift: g, result, coins: result === 'coins' ? price(g.item) : 0 };
}
export function markLettersRead() { (state.letters || []).forEach((l) => { l.read = true; }); save(); }
export function markNewsSeen() { (state.friendNews || []).forEach((x) => { x.seen = true; }); save(); }
export function usePantry(id) {
  if (!(state.pantry[id] > 0)) return false;
  state.pantry[id] -= 1; if (!state.pantry[id]) delete state.pantry[id];
  save(); return true;
}
export function spend(n) { if (state.coins < n) return false; state.coins -= n; save(); return true; }

// ----- essay timer -----
export const EXTEND_MIN = 15, EXTEND_WORDS = 5;
export function startEssay(id) { const e = essays().find((x) => x.id === id); if (e && !e.startedAt) { e.startedAt = Date.now(); save(); } return e; }
export const essayEndsAt = (e) => (e.timeLimit && e.startedAt ? e.startedAt + (e.timeLimit + (e.extraMin || 0)) * 60000 : null);
export function extendEssay(id) {
  const e = essays().find((x) => x.id === id);
  if (!e) return null;
  // add 15 minutes from now if the time already ran out, so she really gets 15 more minutes
  const now = Date.now(), end = essayEndsAt(e);
  const lateBy = end && end < now ? Math.ceil((now - end) / 60000) : 0;
  e.extraMin = (e.extraMin || 0) + lateBy + EXTEND_MIN; e.extensions = (e.extensions || 0) + 1;
  save(); return e;
}
// words for the "extend timer" challenge: her mistakes first, then words she has got wrong before, then list words
export function challengeWords(n = EXTEND_WORDS) {
  const hints = {};
  state.lists.forEach((l) => l.words.forEach((x) => { if (x.hint && !hints[x.w]) hints[x.w] = x.hint; }));
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const picked = [];
  const add = (w) => { if (picked.length < n && w && !picked.includes(w) && [...w].some((ch) => /\p{Script=Han}/u.test(ch))) picked.push(w); };
  shuffle(Object.entries(state.words).filter(([, s]) => s.review).map(([w]) => w)).forEach(add);
  Object.entries(state.words).filter(([, s]) => s.wrong > 0).sort((a, b) => b[1].wrong - a[1].wrong).forEach(([w]) => add(w));
  shuffle(state.lists.flatMap((l) => l.words.map((x) => x.w))).forEach(add);
  return picked.map((w) => ({ w, hint: hints[w] || '' }));
}
export function submitEssay(id) {
  const e = essays().find((x) => x.id === id);
  if (!e || e.status !== 'assigned') return false;
  e.status = 'submitted'; e.submittedAt = Date.now();
  markActive(); save(); return true;
}
export function reviewEssay(id, { stars, coins, xp: x, comment }) {
  const e = essays().find((x) => x.id === id);
  if (!e || e.status !== 'submitted') return false;
  coins = Math.max(0, Math.round(Number(coins) || 0));
  x = x === undefined ? xpPerEssay() : Math.max(0, Math.round(Number(x) || 0));
  e.status = 'reviewed'; e.review = { stars, coins, xp: x, comment: (comment || '').trim(), at: Date.now() }; e.seen = false;
  state.coins += coins; addXp(x); save(); return true;
}
export function markEssaySeen(id) { const e = essays().find((x) => x.id === id); if (e) { e.seen = true; save(); } }
export function deleteEssay(id) { state.essays = essays().filter((x) => x.id !== id); save(); }
