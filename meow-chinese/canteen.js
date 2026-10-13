// 🍱 The school canteen: three stores (Local / Western / Drinks). Each has its own ordering kiosk and its own
// collection counter with a cat behind it. Orders are shared by everyone at the school, like the mall's bakery.
import * as S from './state.js';
import { SNACKS, CANTEEN_STORES } from './pixel.js';
import { rest } from './cloud.js';
import { toast } from './ui.js';
import { sfx } from './audio.js';
import { openKiosk, showCounter } from './snacks.js';

const action = (p_action, p_venue = null, p_data = {}) => rest('rpc/canteen_action', { method: 'POST', body: JSON.stringify({ p_action, p_venue, p_data }) });
const base = (id) => String(id).split('#')[0];

export function wireCanteen(room) {
  room.querySelectorAll('.decor').forEach((d) => { if (/^canteen(local|western|drinks)kiosk$/.test(base(d.dataset.id))) d.classList.add('mall-interactive'); });
  room.addEventListener('click', (e) => {
    const d = e.target.closest('.decor'); if (!d || e.target.closest('button') || room.classList.contains('arranging')) return;
    const m = /^(canteen(?:local|western|drinks))kiosk$/.exec(base(d.dataset.id)); if (!m) return;
    const key = m[1], store = CANTEEN_STORES[key], token = crypto.randomUUID();
    sfx.click();
    openKiosk({ place: 'canteen', service: 'pickup', confirmPay: true, menuOverride: store.menu,
      orderFn: (items) => action('order', key, { token, items }),
      onPaid: () => { refresh(); setTimeout(refresh, 3300); } });
  });
  let busy = false;
  async function refresh() {
    if (busy || !room.isConnected) return; busy = true;
    try {
      const data = await action('refresh');
      if (!room.isConnected || !data) return;
      Object.keys(CANTEEN_STORES).forEach((key) => {
        const counter = [...room.querySelectorAll('.decor[data-counter]')].find((d) => base(d.dataset.id) === key + 'counter');
        if (!counter) return;
        showCounter({ querySelector: () => counter }, data[key] || { ready: [] }, async (o, btn) => {
          btn.disabled = true;
          try {
            const got = await action('pick', key, { id: o.id });
            if (got && SNACKS[got]) { S.addSnack(got); sfx.coin(); toast(`😋 <span class="zh">拿到${SNACKS[got].zh}了！</span> Tap it at the bottom to hold it`, { ms: 2200 }); }
            else { sfx.miss(); toast('<span class="zh">被拿走了</span> Someone already took it', { ms: 1800 }); }
          } catch { btn.disabled = false; toast('请再试一次 · Please try again'); }
          refresh();
        }, key);
      });
    } catch { /* keep what's shown; try again on the next poll */ }
    finally { busy = false; }
  }
  refresh();
  const t = setInterval(() => { if (!room.isConnected) return clearInterval(t); if (!document.hidden) refresh(); }, 4000);
}
