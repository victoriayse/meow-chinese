// Speech (Mandarin text-to-speech) and little 8-bit sound effects.
import { get } from './state.js';

// ---------- speech ----------
let voices = [];
function loadVoices() { voices = (window.speechSynthesis && speechSynthesis.getVoices()) || []; }
if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

export function chineseVoices() {
  loadVoices();
  return voices.filter((v) => /^zh|cmn/i.test(v.lang) && !/HK|yue/i.test(v.lang));
}
function pickVoice() {
  const pref = get().settings.voiceURI;
  const zh = chineseVoices();
  return zh.find((v) => v.voiceURI === pref)
    || zh.find((v) => /zh[-_]CN/i.test(v.lang) && /ting|li-mu|yu-shu|xiaoxiao/i.test(v.name))
    || zh.find((v) => /zh[-_]CN/i.test(v.lang))
    || zh[0] || null;
}
export const canSpeak = () => 'speechSynthesis' in window;

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const keep = new Set(); // hold utterances so Chrome doesn't garbage-collect them mid-speech
let stuckWarned = false;

function speakOnce(text, slow) {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v ? v.lang : 'zh-CN';
    const base = get().settings.rate || 0.75;
    u.rate = slow ? Math.max(0.35, base * 0.6) : base;
    let started = false, done = false;
    const finish = (ok) => { if (done) return; done = true; keep.delete(u); resolve(ok); };
    u.onstart = () => { started = true; };
    u.onend = () => finish(true);
    u.onerror = (e) => finish(e.error === 'interrupted' || e.error === 'canceled' ? true : started);
    keep.add(u);
    speechSynthesis.speak(u);
    if (speechSynthesis.paused) speechSynthesis.resume();
    // watchdog: if the engine never starts, report failure so we can retry
    setTimeout(() => { if (!started && !done && !speechSynthesis.speaking) finish(false); }, 1800);
    setTimeout(() => { if (!started) finish(false); else finish(true); }, 2600 + text.length * 900);
  });
}

export async function speak(text, { slow = false } = {}) {
  if (!canSpeak()) return;
  speechSynthesis.cancel();
  await new Promise((r) => setTimeout(r, 60)); // Chrome drops a speak() issued straight after cancel()
  let ok = await speakOnce(text, slow);
  if (!ok) {
    speechSynthesis.cancel();
    await new Promise((r) => setTimeout(r, 250));
    ok = await speakOnce(text, slow);
  }
  if (!ok && !stuckWarned) {
    stuckWarned = true;
    window.dispatchEvent(new CustomEvent('speech-stuck'));
  }
}
export function stopSpeaking() { if (canSpeak()) speechSynthesis.cancel(); }

// ---------- sound effects ----------
let ctx;
function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freq, start, dur, type = 'square', vol = 0.06) {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = freq;
  const t = a.currentTime + start;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
const on = () => get().settings.sound !== false;
export const sfx = {
  click() { if (on()) tone(660, 0, 0.05, 'square', 0.03); },
  coin() { if (on()) { tone(988, 0, 0.08); tone(1319, 0.08, 0.22); } },
  stroke() { if (on()) tone(784, 0, 0.04, 'triangle', 0.05); },
  correct() { if (on()) [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.16, 'square', 0.05)); },
  oops() { if (on()) { tone(330, 0, 0.12, 'triangle', 0.08); tone(262, 0.12, 0.2, 'triangle', 0.08); } },
  miss() { if (on()) tone(200, 0, 0.08, 'triangle', 0.05); },
  purr() { if (on()) for (let i = 0; i < 6; i++) tone(90 + (i % 2) * 10, i * 0.07, 0.07, 'sawtooth', 0.02); },
  yum() { if (on()) { tone(587, 0, 0.08, 'triangle', 0.07); tone(784, 0.1, 0.12, 'triangle', 0.07); } },
  fanfare() { if (on()) [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.18, 'square', 0.05)); },
  unlock() {
    ac();
    // iOS only lets a page speak after speech starts inside a tap, so warm it up here
    if (canSpeak() && isIOS && !window.__speechWarm) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); window.__speechWarm = true; }
  },
};
