// Empty shelving: the owner chooses merchandise; visitors buy through the usual coin shop.
import * as S from './state.js';
import { ITEMS, spriteCanvas } from './pixel.js';
import { html, $, openModal, closeModal, toast } from './ui.js';
const sellable = (it) => it && !it.special && !it.retired && !it.displaySlots && ['decor','wear','food','toiletry'].includes(it.cat);
export function renderDisplay(wrap, it, stock) {
  wrap.classList.add('display-rack'); wrap.displayStock = stock;
  it.displaySlots.forEach((p, i) => {
    const b = document.createElement('button'); b.className = 'display-slot'; b.dataset.slot = i;
    b.style.left = p.x * 100 + '%'; b.style.top = p.y * 100 + '%';
    const item = ITEMS[stock[i]];
    if (sellable(item)) { b.append(spriteCanvas(stock[i], 42)); b.title = item.en + ' · ' + S.price(stock[i]) + ' coins'; }
    else { b.classList.add('empty'); b.textContent = '+'; b.title = 'Choose a display item'; }
    wrap.append(b);
  });
}
export function wireDisplays(room, {edit = false, changed = () => {}} = {}) {
  if (edit) room.classList.add('display-owner');
  room.addEventListener('pointerdown', e => { if (e.target.closest('.display-slot')) e.stopPropagation(); });
  room.addEventListener('click', e => {
    const slot = e.target.closest('.display-slot'), d = slot?.closest('.display-rack'); if (!d) return;
    e.stopPropagation(); const index = slot.dataset.slot, id = d.displayStock[index];
    if (!edit) {
      if (!sellable(ITEMS[id])) return;
      const box = html`<div class="card stack"><div class="h-title"></div><div class="display-preview"></div><button class="btn green display-buy">Buy · ${S.price(id)} coins</button><button class="btn white display-close">Close</button></div>`;
      $('.h-title',box).textContent = ITEMS[id].en; $('.display-preview',box).append(spriteCanvas(id,100));
      $('.display-buy',box).onclick = () => { if (S.buy(id)) { closeModal(); toast('Purchased! 已购买'); } else toast('Not enough coins, or already owned.'); };
      $('.display-close',box).onclick = closeModal; openModal(box); return;
    }
    const box = html`<div class="card stack"><div class="h-title">Choose shelf item</div><input class="display-search" placeholder="Search / 搜索"><div class="display-options"></div><button class="btn white display-clear">Empty this space</button><button class="btn white display-close">Close</button></div>`;
    async function choose(value) {
      const st = S.get(); st.displayStock ||= {};
      const stock = {...d.displayStock}; if (value) stock[index] = value; else delete stock[index];
      st.displayStock[d.dataset.id] = stock; S.save();
      d.querySelectorAll('.display-slot').forEach(b => b.remove()); renderDisplay(d, ITEMS[d.dataset.id], stock); closeModal();
      try { await changed(); } catch { toast('Saved on this device. Please reconnect to publish the display.'); }
    }
    function draw() {
      const q = $('.display-search',box).value.toLowerCase(), list = $('.display-options',box); list.replaceChildren();
      Object.entries(ITEMS).filter(([,it]) => sellable(it) && (it.name+' '+it.en).toLowerCase().includes(q)).forEach(([key,it]) => {
        const b = document.createElement('button'); b.className = 'btn white'; b.append(spriteCanvas(key,40),document.createTextNode(it.en+' · '+S.price(key))); b.onclick = () => choose(key); list.append(b);
      });
    }
    $('.display-search',box).oninput = draw; $('.display-clear',box).onclick = () => choose(null); $('.display-close',box).onclick = closeModal;
    draw(); openModal(box);
  });
}
