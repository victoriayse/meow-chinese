import * as S from './state.js';
import { openBasket, openPrizes, machineBoard } from './arcade.js';
import { ITEMS, SNACKS, spriteCanvas, drawGrid, artGrid, FASHION_EXCLUSIVE, HOME_EXCLUSIVE } from './pixel.js';
import { rest } from './cloud.js';
import { html, $, openModal, closeModal, toast, coinI, hydrateIcons } from './ui.js';
import { openKiosk, showCounter, snackCanvas, kioskConfirm } from './snacks.js';
import { MALL_VENUES, MALL_ROOM_INFO, mallTables } from './mall.js';
import { deliverCat } from './cafe-tables.js';
import { openBowling } from './bowling.js';
import { openClaw } from './claw.js';
const action = (kind,venue,data={}) => rest('rpc/mall_action',{method:'POST',body:JSON.stringify({p_action:kind,p_venue:venue,p_data:data})});
const served = new Set();
let transferBusy = false;

// Fashion / Home Store: buy only at the ordering kiosk. The cat behind the collection counter
// brings each item out as a shopping bag (1 item = 1 bag); tap a bag to take it home.
const GOODS = {
  mallfashion: { kiosk: 'mallfashionkiosk', counter: 'mallfashioncounter', goods: FASHION_EXCLUSIVE, title: '👗 服装店 Fashion Store' },
  mallhome: { kiosk: 'mallhomekiosk', counter: 'mallhomecounter', goods: HOME_EXCLUSIVE, title: '🛋️ 家居店 Home Store' },
};
const bags = () => (S.get().mallBags ||= []);
const goodsArt = (id) => { const c = spriteCanvas(id, 30); c.classList.add('goods-art'); return c; };
function openGoodsKiosk(venueKey, onPaid) {
  const g = GOODS[venueKey], qty = {};
  const box = html`<div class="card stack kiosk-card"><div class="h-title">${g.title}</div><div class="kiosk-list"></div><div class="kiosk-total"></div>
    <p class="help" style="margin:0">付钱以后，去 <b>取货柜台</b> 拿购物袋。<br>After you pay, collect your shopping bag at the <b>collection counter</b>. 1 item = 1 bag.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn white k-close">关闭 Close</button><button class="btn green k-pay" disabled>💳 <span class="zh">付钱</span> Pay</button></div></div>`;
  const list = $('.kiosk-list', box), pay = $('.k-pay', box);
  const pending = (id) => bags().some((b) => b.item === id);
  const maxOf = (id) => ITEMS[id].cat === 'wear' ? ((S.get().owned.includes(id) || pending(id)) ? 0 : 1) : 6;
  const total = () => g.goods.reduce((t, k) => t + (qty[k] || 0) * S.price(k), 0);
  const count = () => g.goods.reduce((t, k) => t + (qty[k] || 0), 0);
  function draw() {
    list.replaceChildren();
    if (!g.goods.length) list.innerHTML = '<p class="help kiosk-soon">🎁 <span class="zh">新货快到了！</span><br>New exclusive items are coming soon.</p>';
    g.goods.forEach((k) => {
      const it = ITEMS[k], max = maxOf(k);
      const row = html`<div class="kiosk-row"><span class="art"></span><span class="nm"><span class="zh">${it.name}</span><small>${it.en}</small></span>
        <span class="pr">${S.price(k)}${coinI(14)}</span>${max ? `<span class="q"><button type="button" class="qty-btn" data-q="-1">−</button><b>${qty[k] || 0}</b><button type="button" class="qty-btn" data-q="1">＋</button></span>` : `<small>${pending(k) ? '🛍️ Bag waiting' : '✓ Owned'}</small>`}</div>`;
      $('.art', row).append(goodsArt(k));
      row.querySelectorAll('.qty-btn').forEach((b) => { b.onclick = () => { qty[k] = Math.max(0, Math.min(max, (qty[k] || 0) + +b.dataset.q)); if (count() > 12) qty[k]--; draw(); }; });
      list.append(row);
    });
    const t = total(), coins = S.get().coins;
    $('.kiosk-total', box).innerHTML = `<span class="zh">合计</span> Total: <b>${t}</b>${coinI(18)} <small>· 你有 You have ${coins}${coinI(14)}</small>${t > coins ? '<br><small class="bad">金币不够 · Not enough coins</small>' : ''}`;
    pay.disabled = !count() || t > coins; hydrateIcons(box);
  }
  $('.k-close', box).onclick = closeModal;
  pay.onclick = async () => {
    const t = total(), items = g.goods.flatMap((k) => Array(qty[k] || 0).fill(k));
    if (!items.length || S.get().coins < t) return;
    if (!(await kioskConfirm(box, items, t, goodsArt, (k) => ITEMS[k]))) return;
    if (S.get().coins < t) return;
    S.get().coins -= t;
    const now = Date.now(), last = Math.max(now, ...bags().filter((b) => b.venue === venueKey).map((b) => b.readyAt));
    items.forEach((item, i) => bags().push({ id: crypto.randomUUID(), item, venue: venueKey, readyAt: Math.max(now + 3000, last + 1500) + i * 1500 }));
    S.save(); closeModal();
    toast(`🧾 <span class="zh">付好了！去取货柜台拿购物袋</span> Paid ${t} — collect your bag${items.length > 1 ? 's' : ''} at the counter`, { ms: 3500 });
    onPaid();
  };
  draw(); openModal(box);
}
export function wireMall(room, roomKey, layout, go, onChanged = () => {}) {
  const venue=MALL_VENUES[roomKey];let busy=false, cookTimer=null;
  room.querySelectorAll('.decor').forEach((d)=>{const it=ITEMS[d.dataset.id.split('#')[0]];if(!it)return;if(it.mallGame||it.hotpot||it.prizeDesk)d.classList.add('mall-interactive');if(it.mallGame==='basketball')machineBoard(d);});
  room.addEventListener('click',(e)=>{
    const d=e.target.closest('.decor');if(!d||e.target.closest('button'))return;const it=ITEMS[d.dataset.id.split('#')[0]];if(!it)return;
    const goods=GOODS[roomKey];
    if(goods&&d.dataset.id.split('#')[0]===goods.kiosk)return openGoodsKiosk(roomKey,()=>{showBags();setTimeout(showBags,3200);});
    if(it.prizeDesk)return openPrizes();
    if(it.mallGame==='basketball')return openBasket(()=>room.querySelectorAll('.decor').forEach((x)=>{if(ITEMS[x.dataset.id.split('#')[0]]?.mallGame==='basketball')machineBoard(x);}));
    if(it.mallGame)return it.mallGame==='claw'?openClaw():openBowling();
    if(venue&&d.dataset.id.split('#')[0]===venue.kiosk){
      const token=crypto.randomUUID();
      openKiosk({place:'mall',layout,tablesOverride:mallTables(layout,roomKey),menuOverride:venue.menu,
        confirmPay:true,orderFn:(items,service,number)=>action('order',roomKey,{token,items,service,number}),onPaid:()=>{refresh();setTimeout(refresh,3300);}});
    }
  });
  async function collect(row,button){button.disabled=true;try{const item=await action('pick',roomKey,{id:row.id});if(item)S.addSnack(item);await refresh();}catch{button.disabled=false;toast('Please try again');}}
  async function transfer(){const pending=S.get().mallPendingDrop;if(!pending||pending.venue!==roomKey||transferBusy)return;
    transferBusy=true;
    try { const result=await action('put',roomKey,pending);
      if(S.get().mallPendingDrop !== pending)return;
      if(!result.accepted)S.addSnack(pending.item);delete S.get().mallPendingDrop;S.save();
    } finally { transferBusy=false; }
  }
  function choose(table){
    const box=html`<div class="card stack"><div class="h-title">放食物 Place food</div><div class="mall-food-choices"></div><button class="btn white mall-close">Close</button></div>`;
    const choices=venue.menu.filter(id=>S.snacks()[id]>0);
    if(!choices.length)$('.mall-food-choices',box).textContent='Collect food from this venue first.';
    choices.forEach(id=>{const b=document.createElement('button');b.className='btn white';b.append(snackCanvas(id,3),document.createTextNode(SNACKS[id].en));b.onclick=async()=>{
      if(S.get().mallPendingDrop)return toast('Your previous food is still being placed.');
      if (!(S.snacks()[id] > 0)) return;
      S.get().snacks[id]--; if (!S.get().snacks[id]) delete S.get().snacks[id];
      if (S.get().holding === id) S.get().holding = null;
      S.get().mallPendingDrop={token:crypto.randomUUID(),venue:roomKey,item:id,table};S.save();onChanged();closeModal();try{await transfer();await refresh();}catch{toast('Food reserved. It will be placed when the connection returns.');}
    };$('.mall-food-choices',box).append(b);});
    $('.mall-close',box).onclick=closeModal;openModal(box);
  }
  function potChoice(row,button){
    const pots=[...room.querySelectorAll('.decor')].filter(d=>ITEMS[d.dataset.id].hotpot).sort((a,b)=>(b.dataset.id===row.furniture)-(a.dataset.id===row.furniture));
    const box=html`<div class="card stack"><div class="h-title">${SNACKS[row.item].en}</div><button class="btn green mall-pick">Pick up</button><div class="mall-pots"></div><button class="btn white mall-close">Close</button></div>`;
    $('.mall-pick',box).onclick=()=>{closeModal();collect(row,button);};
    pots.forEach((p,i)=>{const b=document.createElement('button');b.className='btn blue';b.textContent='加到锅里 Add to Pot '+(p.dataset.id===row.furniture?'(this table)':i+1);b.onclick=async()=>{b.disabled=true;try{await action('pot',roomKey,{id:row.id,pot:p.dataset.id});closeModal();await refresh();}catch{b.disabled=false;toast('Pot full or item already taken.');}};$('.mall-pots',box).append(b);});
    if(!pots.length)$('.mall-pots',box).textContent='Ask the admin to place a hotpot pot.';
    $('.mall-close',box).onclick=closeModal;openModal(box);
  }
  async function refresh(){
    if(!venue||busy||!room.isConnected)return;busy=true;
    try{await transfer();const data=await action('refresh',roomKey);if(!room.isConnected)return;
      clearTimeout(cookTimer);
      const due = (data.tables||[]).filter(r=>r.state==='pot'&&r.cookReadyAt).map(r=>Date.parse(r.cookReadyAt)-Date.now()).filter(ms=>ms>0);
      if(due.length) cookTimer=setTimeout(refresh,Math.min(...due)+30);
      // Only this room's matching collection counter receives its queue.
      const counter=[...room.querySelectorAll('.decor[data-counter]')].find(d=>d.dataset.id.split('#')[0]===venue.counter);
      if(counter){const wrapper={querySelector:()=>counter};showCounter(wrapper,data,collect,roomKey);}
      room.querySelectorAll('.mall-table-food,.mall-place,.mall-number').forEach(n=>n.remove());
      mallTables(layout,roomKey).forEach(t=>{const d=[...room.querySelectorAll('.decor')].find(d=>d.dataset.id===t.id);if(!d)return;
        const label=document.createElement('span');label.className='cafe-table-number mall-number';label.textContent='#'+t.number;d.append(label);if(ITEMS[d.dataset.id].builtInPot)d.classList.add('hotpot-table');
        const b=document.createElement('button');b.className='table-place mall-place';b.textContent='+ 放食物';b.onclick=e=>{e.stopPropagation();choose(t.id);};d.append(b);
      });
      (data.tables||[]).forEach(row=>{
        let d=[...room.querySelectorAll('.decor')].find(d=>d.dataset.id===row.furniture);const loose=!d;if(loose)d=room;
        const b=document.createElement('button');b.className='table-food mall-table-food'+(row.state==='pot'?' pot-food':'');b.title=SNACKS[row.item]?.en||'Food';if(!SNACKS[row.item])return;if (row.state === 'pot' && SNACKS[row.item].potArt) { const c = document.createElement('canvas'); drawGrid(c, artGrid(SNACKS[row.item].potArt, SNACKS[row.item].pal), 3); b.append(c); } else b.append(snackCanvas(row.item,3));
        const builtIn = !loose && ITEMS[d.dataset.id]?.builtInPot;
        const pt = builtIn ? (row.state === 'pot' ? [44 + ((row.slot - 4) % 3) * 6, 45 + Math.floor((row.slot - 4) / 3) * 7] : [[28,34],[72,34],[28,64],[72,64]][row.slot]) : null;
        b.style.left=(loose?8:pt?pt[0]:row.state==='pot'?25+(row.slot%3)*22:25+row.slot*16)+'%';b.style.top=(loose?85:pt?pt[1]:row.state==='pot'?24+Math.floor(row.slot/3)*15:42)+'%';
        if (builtIn) b.classList.add(row.state === 'pot' ? 'built-in-ingredient' : 'hotpot-side-food');
        b.onclick=e=>{e.stopPropagation();if(row.state==='table'&&row.item.startsWith('hotpot'))potChoice(row,b);else collect(row,b);};d.append(b);
        if(row.deliveredAt&&!served.has(row.id)&&Date.now()-Date.parse(row.deliveredAt)<12000&&!loose){served.add(row.id);deliverCat(room,d,b,row.item,{fur:venue.fur,route:roomKey==='mallhotpot'?'left':null});}
      });
    }catch{ /* retry on the next poll; keep the last displayed food */ }finally{busy=false;}
  }
  // shopping bags waiting on this store's collection counter (kept on her own device)
  function showBags(){
    const g=GOODS[roomKey];if(!g||!room.isConnected)return;
    const counter=[...room.querySelectorAll('.decor[data-counter]')].find(d=>d.dataset.id.split('#')[0]===g.counter);if(!counter)return;
    const mine=bags().filter(b=>b.venue===roomKey&&ITEMS[b.item]);
    const ready=mine.filter(b=>b.readyAt<=Date.now()).slice(0,2).map(b=>({id:b.id,item:'shopbag'}));
    const sig=ready.map(b=>b.id).join()+'|'+mine.length;if(counter.bagSig===sig)return;counter.bagSig=sig;
    showCounter({querySelector:()=>counter},{ready,waiting:mine.length},(o,button)=>{
      const i=bags().findIndex(b=>b.id===o.id);if(i<0)return;button.disabled=true;
      const [bag]=bags().splice(i,1);S.grantItem(bag.item);S.save();
      const it=ITEMS[bag.item];toast(`🛍️ <span class="zh">${it.name}</span> ${it.en} — ${it.cat==='wear'?'in your wardrobe 衣柜里':'in your storage box 储物箱里'}`,{ms:3000});
      onChanged();showBags();
    },roomKey);
  }
  if(GOODS[roomKey]){showBags();const t2=setInterval(()=>{if(!room.isConnected)return clearInterval(t2);showBags();},1000);}
  if(venue){refresh();const timer=setInterval(()=>{if(!room.isConnected)return clearInterval(timer);refresh();},4000);}
}

export function openMallDirectory(current, onGo) {
  const box = html`<div class="card stack"><div class="h-title">商场导览 Mall directory</div><div class="mall-directory-list"></div><button class="btn white directory-close">关闭 Close</button></div>`;
  for (const info of MALL_ROOM_INFO) {
    const b = document.createElement('button'); b.className = 'btn white'; b.dataset.destination = info.key;
    b.textContent = `${info.icon} ${info.en} · ${info.zh}${info.key === current ? ' ✓' : ''}`;
    b.onclick = () => { closeModal(); if (info.key !== current) onGo(info.key); };
    $('.mall-directory-list', box).append(b);
  }
  $('.directory-close', box).onclick = closeModal; openModal(box);
}
