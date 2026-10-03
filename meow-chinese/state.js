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
// save bookkeeping (e.g. sync status) without counting it as a change
export function saveQuiet() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('save failed', e); } }
export function replaceAll(obj) { state = migrate(obj); save(); }
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
  save();
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
export const level = () => 1 + Math.floor((state.kitten.xp || 0) / 20);
export const levelProgress = () => ((state.kitten.xp || 0) % 20) / 20;

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
export const activeList = () => state.lists.find((l) => l.id === state.activeListId) || state.lists[0];

export function recordWord(w, result, firstAttempt = result === 'first') {
  // result: 'first' | 'retry' | 'wrong'
  if (firstAttempt) { state.daily.tried += 1; if (result === 'first') state.daily.right += 1; }
  const s = state.words[w] || (state.words[w] = { attempts: 0, firstTry: 0, wrong: 0, okStreak: 0, review: false });
  s.attempts += 1; s.lastSeen = Date.now(); s.lastResult = result;
  if (result === 'first') {
    s.firstTry += 1; s.okStreak += 1;
    if (s.okStreak >= 2) s.review = false;
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
export function addEssay({ title, storyId = null, image = null, words = [], minChars = 80 }) {
  const e = { id: uid(), title, storyId, image, words, minChars, status: 'assigned', createdAt: Date.now() };
  essays().unshift(e); save(); return e;
}
export function updateEssay(id, patch) { const e = essays().find((x) => x.id === id); if (e) { Object.assign(e, patch); save(); } return e; }
export function submitEssay(id) {
  const e = essays().find((x) => x.id === id);
  if (!e || e.status !== 'assigned') return false;
  e.status = 'submitted'; e.submittedAt = Date.now();
  markActive(); save(); return true;
}
export function reviewEssay(id, { stars, coins, comment }) {
  const e = essays().find((x) => x.id === id);
  if (!e || e.status !== 'submitted') return false;
  coins = Math.max(0, Math.round(Number(coins) || 0));
  e.status = 'reviewed'; e.review = { stars, coins, comment: (comment || '').trim(), at: Date.now() }; e.seen = false;
  state.coins += coins; save(); return true;
}
export function markEssaySeen(id) { const e = essays().find((x) => x.id === id); if (e) { e.seen = true; save(); } }
export function deleteEssay(id) { state.essays = essays().filter((x) => x.id !== id); save(); }
