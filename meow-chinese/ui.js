// Small UI helpers shared by all screens.
import { kittenGrid, kittenLyingGrid, drawGrid, artGrid, COIN, HEART, FISHBONE } from './pixel.js';
import { get } from './state.js';
import { sfx } from './audio.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function html(strings, ...vals) {
  const t = document.createElement('template');
  t.innerHTML = strings.reduce((a, s, i) => a + s + (i < vals.length ? vals[i] : ''), '').trim();
  return t.content.firstElementChild;
}

export function icon(kind, px = 22) {
  const def = kind === 'coin' ? COIN : kind === 'heart' ? HEART : FISHBONE;
  const c = document.createElement('canvas');
  c.className = 'sprite icon-' + kind;
  const g = artGrid(def.art, def.pal);
  drawGrid(c, g, Math.max(1, Math.round(px / Math.max(g.length, g[0].length * 0.7))));
  return c;
}
// Replace <i data-icon="coin"></i> placeholders with real canvases
export function hydrateIcons(root) {
  $$('[data-icon]', root).forEach((el) => {
    const c = icon(el.dataset.icon, +(el.dataset.size || 22));
    el.replaceWith(c);
  });
  return root;
}
export const coinI = (size = 22) => `<i data-icon="coin" data-size="${size}"></i>`;
export const heartI = (size = 22) => `<i data-icon="heart" data-size="${size}"></i>`;
export const foodI = (size = 22) => `<i data-icon="fish" data-size="${size}"></i>`;

// ---------- kitten view ----------
export class KittenView {
  constructor({ scale = 7, equipped = null, fur = null, interactive = false, onTap = null } = {}) {
    this.scale = scale; this.equippedOverride = equipped; this.furOverride = fur;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'kitten-canvas bob';
    this.mood = 'normal'; this.frame = 0; this.blinkT = 0; this.temp = null;
    if (interactive) this.canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); onTap && onTap(e); });
    this.draw();
    this.timer = setInterval(() => this.step(), 400);
  }
  get fur() { return this.furOverride || get().kitten.fur; }
  get equipped() { return this.equippedOverride || get().kitten.equipped; }
  setMood(m) { this.mood = m; this.draw(); }
  setPose(p) { if (this.pose !== p) { this.pose = p; this.draw(); } }
  // face left or right (the picture is mirrored, but fur patches stay where they are)
  setFacing(left) { if (this.left !== !!left) { this.left = !!left; this.draw(); } }
  flash(m, ms = 1200) { this.temp = m; this.draw(); clearTimeout(this.tt); this.tt = setTimeout(() => { this.temp = null; this.draw(); }, ms); }
  step() {
    if (!this.canvas.isConnected) { clearInterval(this.timer); return; }
    this.frame++;
    this.blinkT = (this.mood === 'normal' && !this.temp && Math.random() < 0.12) ? 1 : 0;
    this.draw();
  }
  draw() {
    let m = this.temp || (this.blinkT ? 'blink' : this.mood);
    // parent setting "always smiling": her own kitten keeps a happy face (a fainted kitten still lies down)
    const s = get();
    if (!this.furOverride && s && s.settings && s.settings.alwaysSmile && !['faint', 'love', 'happy'].includes(m) && !String(m).startsWith('e-')) m = 'happy';
    if (this.pose === 'lie') {   // lying in bed: eyes closed unless she's making a face
      const lm = this.temp || (['happy', 'love'].includes(this.mood) ? this.mood : 'sleepy');
      drawGrid(this.canvas, kittenLyingGrid(this.fur, lm, this.equipped, Math.floor(this.frame / 3)), this.scale);
      return;
    }
    if (this.pose === 'back') { drawGrid(this.canvas, kittenGrid(this.fur, 'back', this.equipped, Math.floor(this.frame / 3)), this.scale); return; }
    let g = kittenGrid(this.fur, m, this.equipped, Math.floor(this.frame / 3), !!this.left);
    if (this.left) g = g.map((row) => [...row].reverse());
    drawGrid(this.canvas, g, this.scale);
  }
  jump() { this.canvas.classList.remove('jump'); void this.canvas.offsetWidth; this.canvas.classList.add('jump'); }
}

// floating hearts / coins at a point in a layer
export function burst(layer, kind = 'heart', n = 3, x = '50%', y = '30%') {
  for (let i = 0; i < n; i++) {
    const f = document.createElement('div');
    f.className = 'fx';
    f.style.left = `calc(${x} + ${(Math.random() - 0.5) * 90}px)`;
    f.style.top = `calc(${y} + ${(Math.random() - 0.5) * 30}px)`;
    f.style.animationDelay = `${i * 0.12}s`;
    f.appendChild(icon(kind, 26));
    layer.appendChild(f);
    setTimeout(() => f.remove(), 1600);
  }
}

export function toast(content, { coins = 0, ms = 2700 } = {}) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = content + (coins ? ` <span class="price">+${coins} ${coinI(20)}</span>` : '');
  hydrateIcons(t);
  t.style.animationDuration = (ms - 100) / 1000 + 's';
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms);
  if (coins) sfx.coin();
}

export function confetti() {
  const box = document.createElement('div'); box.className = 'confetti';
  const cols = ['#ffd23f', '#ff8fb3', '#6cb6f2', '#5cc46e', '#fff'];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = cols[i % cols.length];
    p.style.animationDuration = 1.6 + Math.random() * 1.6 + 's';
    p.style.animationDelay = Math.random() * 0.6 + 's';
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4000);
}

// ---------- modal ----------
export function openModal(node, { onClose } = {}) {
  const m = $('#modal');
  m.innerHTML = '';
  m.appendChild(node);
  m.classList.remove('hidden');
  m.onclick = (e) => { if (e.target === m) closeModal(); };
  m._onClose = onClose;
  hydrateIcons(m);
  return m;
}
export function closeModal() {
  const m = $('#modal');
  m.classList.add('hidden'); m.innerHTML = '';
  if (m._onClose) { const f = m._onClose; m._onClose = null; f(); }
}
export function confirmBox(title, body, okLabel = '好 OK', cancelLabel = '取消 Cancel') {
  return new Promise((resolve) => {
    const n = html`<div class="card stack">
      <h2>${title}</h2><p class="help">${body}</p>
      <div class="row" style="justify-content:flex-end"><button class="btn white" data-a="no">${cancelLabel}</button><button class="btn red" data-a="yes">${okLabel}</button></div></div>`;
    n.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      resolve(a.dataset.a === 'yes'); closeModal();
    });
    openModal(n, { onClose: () => resolve(false) });
  });
}

export function tapSound(root) {
  root.addEventListener('click', (e) => { if (e.target.closest('button')) sfx.click(); }, true);
}
