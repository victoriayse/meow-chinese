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
  // the toy piano: one random note from a C-major scale, with a soft piano-like fade; returns its name
  // pass a note number to play that exact note (a friend's piano), or nothing for a random one; returns { i, name }
  piano(i) {
    const NOTES = [['Do', 261.63], ['Re', 293.66], ['Mi', 329.63], ['Fa', 349.23], ['Sol', 392.0], ['La', 440.0], ['Ti', 493.88],
      ['Do', 523.25], ['Re', 587.33], ['Mi', 659.25], ['Fa', 698.46], ['Sol', 783.99], ['La', 880.0]];
    if (!(Number.isInteger(i) && NOTES[i])) i = Math.floor(Math.random() * NOTES.length);
    const [name, f] = NOTES[i];
    if (on()) { tone(f, 0, 1.3, 'triangle', 0.16); tone(f * 2, 0, 0.6, 'sine', 0.05); tone(f * 3, 0, 0.25, 'sine', 0.02); }
    return { i, name };
  },
  unlock() {
    ac();
    // iOS only lets a page speak after speech starts inside a tap, so warm it up here
    if (canSpeak() && isIOS && !window.__speechWarm) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); window.__speechWarm = true; }
  },
};

// ---------- meow ----------
// a synthesised "mi-aow": a buzzy voice through two moving vocal formants
export function meow(mood = 'normal') {
  if (!on()) return;
  const a = ac(); if (!a) return;
  const sad = ['cry', 'cough', 'dizzy', 'faint', 'hungry', 'thirsty', 'sleepy', 'bored'].includes(mood);
  const t = a.currentTime + 0.01, dur = sad ? 0.75 : 0.5;
  const base = sad ? 520 : 680 + Math.random() * 120;
  const o = a.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(base * 0.85, t);
  o.frequency.linearRampToValueAtTime(base * 1.25, t + dur * 0.35);
  o.frequency.linearRampToValueAtTime(base * (sad ? 0.7 : 0.9), t + dur);
  const vib = a.createOscillator(), vg = a.createGain(); vib.frequency.value = 7; vg.gain.value = sad ? 14 : 8;
  vib.connect(vg).connect(o.frequency);
  const f1 = a.createBiquadFilter(), f2 = a.createBiquadFilter();
  f1.type = f2.type = 'bandpass'; f1.Q.value = 6; f2.Q.value = 8;
  f1.frequency.setValueAtTime(700, t); f1.frequency.linearRampToValueAtTime(1100, t + dur * 0.4); f1.frequency.linearRampToValueAtTime(650, t + dur);
  f2.frequency.setValueAtTime(1800, t); f2.frequency.linearRampToValueAtTime(2600, t + dur * 0.4); f2.frequency.linearRampToValueAtTime(1500, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(sad ? 0.16 : 0.22, t + 0.06);
  g.gain.setValueAtTime(sad ? 0.14 : 0.2, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(a.destination);
  o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
}

// ---------- soothing background music (a gentle music-box lullaby, generated live) ----------
const music = { playing: false, timer: null, next: 0, step: 0, gain: null, track: 0 };
// five cosy tunes; each is a chord loop, an 8-bar melody (scale steps, 0 = rest) and a voice
const C = [261.63, 329.63, 392.0], Am = [220.0, 261.63, 329.63], F = [174.61, 220.0, 261.63], G = [196.0, 246.94, 293.66];
export const TRACKS = [
  { zh: '音乐盒摇篮曲', en: 'Music-box lullaby', icon: '🎠', bpm: 66, voice: 'bell', bass: 'bell',
    chords: [C, Am, F, G],
    scale: [0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5],
    melody: [[5, 0, 3, 0, 2, 3, 0, 0], [1, 0, 2, 0, 3, 0, 0, 0], [6, 0, 5, 3, 0, 2, 0, 0], [2, 0, 3, 0, 5, 0, 0, 0],
      [5, 0, 6, 5, 0, 3, 0, 0], [3, 0, 2, 0, 1, 0, 0, 0], [2, 0, 3, 0, 5, 3, 0, 0], [2, 0, 1, 0, 0, 0, 0, 0]] },
  { zh: '雨天咖啡馆', en: 'Rainy café', icon: '☕', bpm: 70, voice: 'epiano', bass: 'epiano', rain: true,
    chords: [[174.61, 220.0, 261.63, 329.63], [164.81, 196.0, 246.94, 293.66], [146.83, 174.61, 220.0, 261.63], [130.81, 164.81, 196.0, 246.94]],
    scale: [0, 523.25, 587.33, 659.25, 698.46, 783.99, 880.0, 1046.5],
    melody: [[6, 0, 5, 0, 3, 0, 0, 0], [2, 0, 3, 5, 0, 0, 3, 0], [4, 0, 3, 0, 2, 0, 0, 0], [1, 0, 2, 0, 3, 0, 0, 0],
      [6, 0, 7, 6, 0, 5, 0, 0], [3, 0, 5, 0, 2, 0, 0, 0], [2, 0, 3, 0, 4, 3, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0]] },
  { zh: '星星夜', en: 'Starry night', icon: '🌙', bpm: 56, voice: 'flute', bass: 'bell',
    chords: [Am, F, [196.0, 261.63, 329.63], G],
    scale: [0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0],
    melody: [[4, 0, 0, 0, 3, 0, 0, 0], [2, 0, 0, 0, 1, 0, 0, 0], [2, 0, 3, 0, 4, 0, 0, 0], [5, 0, 0, 0, 4, 0, 0, 0],
      [6, 0, 0, 0, 5, 0, 4, 0], [3, 0, 0, 0, 2, 0, 0, 0], [1, 0, 2, 0, 3, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0]] },
  { zh: '樱花小风', en: 'Blossom breeze', icon: '🌸', bpm: 78, voice: 'pluck', bass: 'pluck',
    chords: [G, [164.81, 196.0, 246.94], [130.81, 164.81, 196.0], [146.83, 185.0, 220.0]],
    scale: [0, 392.0, 440.0, 493.88, 587.33, 659.25, 783.99],
    melody: [[4, 5, 4, 0, 3, 0, 2, 0], [1, 0, 2, 0, 3, 0, 0, 0], [5, 0, 6, 5, 4, 0, 3, 0], [2, 0, 0, 0, 0, 0, 0, 0],
      [4, 0, 5, 0, 6, 5, 4, 0], [3, 0, 4, 3, 2, 0, 0, 0], [1, 2, 3, 0, 5, 0, 3, 0], [1, 0, 0, 0, 0, 0, 0, 0]] },
  { zh: '小猫去散步', en: 'Kitten stroll', icon: '🐾', bpm: 92, voice: 'marimba', bass: 'marimba',
    chords: [C, G, Am, F],
    scale: [0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5],
    melody: [[1, 3, 5, 3, 6, 5, 3, 0], [2, 0, 2, 3, 5, 0, 0, 0], [3, 5, 6, 5, 3, 2, 1, 0], [2, 0, 3, 0, 1, 0, 0, 0],
      [5, 5, 6, 5, 3, 0, 2, 0], [3, 0, 2, 0, 1, 0, 0, 0], [6, 5, 3, 5, 6, 0, 5, 0], [1, 0, 0, 0, 0, 0, 0, 0]] },
];
export const trackIndex = () => { const i = get().settings.musicTrack; return Number.isInteger(i) && TRACKS[i] ? i : 0; };
function env(g, t, vol, attack, dur) {
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function bell(freq, t, vol, dur = 1.6) {
  const a = ctx;
  const o = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain();
  o.type = 'sine'; o2.type = 'sine'; o.frequency.value = freq; o2.frequency.value = freq * 2.01;
  const g2 = a.createGain(); g2.gain.value = 0.25;
  env(g, t, vol, 0.015, dur);
  o.connect(g); o2.connect(g2).connect(g); g.connect(music.gain);
  o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}
function epiano(freq, t, vol, dur = 1.6) {
  const a = ctx, g = a.createGain();
  [1, 1.004].forEach((k) => { const o = a.createOscillator(); o.type = 'sine'; o.frequency.value = freq * k; o.connect(g); o.start(t); o.stop(t + dur + 0.05); });
  const o3 = a.createOscillator(), g3 = a.createGain(); o3.type = 'sine'; o3.frequency.value = freq * 3; g3.gain.value = 0.08; o3.connect(g3).connect(g); o3.start(t); o3.stop(t + 0.3);
  env(g, t, vol * 0.8, 0.01, dur * 1.1);
  g.connect(music.gain);
}
function flute(freq, t, vol, dur = 1.6) {
  const a = ctx, o = a.createOscillator(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
  o.type = 'triangle'; o.frequency.value = freq / 2 * 2;
  lfo.frequency.value = 5; lg.gain.value = freq * 0.006; lfo.connect(lg).connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * 0.9, t + 0.12); g.gain.linearRampToValueAtTime(vol * 0.6, t + dur * 0.6); g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.2);
  o.connect(g).connect(music.gain);
  o.start(t); lfo.start(t); o.stop(t + dur * 1.2 + 0.05); lfo.stop(t + dur * 1.2 + 0.05);
}
function pluck(freq, t, vol, dur = 1.0) {
  const a = ctx, o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
  o.type = 'sawtooth'; o.frequency.value = freq;
  f.type = 'lowpass'; f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.5);
  env(g, t, vol * 0.7, 0.005, Math.min(dur, 1.1));
  o.connect(f).connect(g).connect(music.gain); o.start(t); o.stop(t + 1.2);
}
function marimba(freq, t, vol, dur = 0.6) {
  const a = ctx, g = a.createGain();
  const o = a.createOscillator(); o.type = 'sine'; o.frequency.value = freq; o.connect(g);
  const o2 = a.createOscillator(), g2 = a.createGain(); o2.type = 'sine'; o2.frequency.value = freq * 4; g2.gain.value = 0.15; o2.connect(g2).connect(g);
  env(g, t, vol, 0.005, Math.min(dur, 0.7));
  g.connect(music.gain); o.start(t); o2.start(t); o.stop(t + 0.8); o2.stop(t + 0.15);
}
const VOICES = { bell, epiano, flute, pluck, marimba };
function pad(freqs, t, dur) {
  const a = ctx;
  freqs.forEach((f) => {
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'triangle'; o.frequency.value = f / 2;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.018, t + 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(music.gain); o.start(t); o.stop(t + dur + 0.1);
  });
}
// soft rain for the café tune: filtered noise taps
let noiseBuf = null;
function rainTap(t) {
  const a = ctx;
  if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate * 0.05, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); }
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = 3000 + Math.random() * 3000; g.gain.value = 0.012;
  src.connect(f).connect(g).connect(music.gain); src.start(t);
}
function schedule() {
  const tr = TRACKS[music.track] || TRACKS[0];
  const beat = 60 / tr.bpm / 2;                     // eighth notes
  const voice = VOICES[tr.voice], bass = VOICES[tr.bass];
  while (music.next < ctx.currentTime + 0.6) {
    const bar = Math.floor(music.step / 8) % 8, i = music.step % 8;
    const chord = tr.chords[Math.floor(bar / 2) % 4];
    if (i === 0 && bar % 2 === 0) pad(chord, music.next, beat * 16);
    if (i === 0 || i === 4) bass(chord[0] * (tr.bass === 'pluck' || tr.bass === 'marimba' ? 1 : 2), music.next, 0.035, 1.2);
    if (tr.voice === 'marimba' && (i === 2 || i === 6)) marimba(chord[1] * 2, music.next, 0.02, 0.4);
    const deg = tr.melody[bar][i];
    if (deg) voice(tr.scale[deg], music.next, 0.06, tr.voice === 'flute' ? beat * 3.5 : 1.8);
    if (tr.rain) for (let k = 0; k < 3; k++) if (Math.random() < 0.6) rainTap(music.next + Math.random() * beat);
    music.next += beat; music.step++;
  }
}
// switch tune (keeps playing if music is on)
export function setTrack(i) {
  get().settings.musicTrack = i;
  if (music.playing) { stopMusic(true); setTimeout(() => startMusic(), 650); }
}
export function musicOn() { return get().settings.music !== false; }
let gestured = false, pendingMusic = false;
window.addEventListener('pointerdown', () => { gestured = true; if (pendingMusic) { pendingMusic = false; startMusic(); } }, { capture: true });
// the radio at home is playing her own song: keep the game's music quiet until it stops
let hushed = false;
export function hushMusic(on) { hushed = !!on; if (on) stopMusic(); else if (musicOn()) startMusic(); }
export function startMusic() {
  if (!musicOn() || music.playing || hushed) return;
  if (!gestured) { pendingMusic = true; return; }   // browsers block sound until the first tap
  const a = ac(); if (!a) return;
  if (!music.gain) {
    music.gain = a.createGain();
    // a little echo makes it dreamy
    const delay = a.createDelay(), fb = a.createGain(), wet = a.createGain();
    delay.delayTime.value = 0.38; fb.gain.value = 0.28; wet.gain.value = 0.3;
    music.gain.connect(a.destination); music.gain.connect(delay); delay.connect(fb).connect(delay); delay.connect(wet).connect(a.destination);
  }
  music.gain.gain.cancelScheduledValues(a.currentTime);
  music.gain.gain.setValueAtTime(0.0001, a.currentTime); music.gain.gain.exponentialRampToValueAtTime(0.9, a.currentTime + 1.5);
  music.playing = true; music.next = a.currentTime + 0.1; music.step = 0; music.track = trackIndex();
  schedule(); music.timer = setInterval(schedule, 200);
}
export function stopMusic(keepPending = false) {
  if (!keepPending) pendingMusic = false;
  if (!music.playing) return;
  music.playing = false; clearInterval(music.timer);
  if (music.gain && ctx) { music.gain.gain.cancelScheduledValues(ctx.currentTime); music.gain.gain.setValueAtTime(music.gain.gain.value, ctx.currentTime); music.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6); }
}
