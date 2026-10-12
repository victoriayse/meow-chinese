import * as S from './state.js';
import { ITEMS, SNACKS, spriteCanvas, drawGrid, artGrid } from './pixel.js';
import { rest } from './cloud.js';
import { html, $, openModal, closeModal, toast } from './ui.js';
import { openKiosk, showCounter, snackCanvas } from './snacks.js';
import { MALL_VENUES, mallTables } from './mall.js';
import { deliverCat } from './cafe-tables.js';
import { openBowling } from './bowling.js';
const action = (kind,venue,data={}) => rest('rpc/mall_action',{method:'POST',body:JSON.stringify({p_action:kind,p_venue:venue,p_data:data})});
const served = new Set();
let transferBusy = false;

function shop(kind, go) {
  if(kind==='changing'){go('wardrobe');return;}
  const candidates=Object.entries(ITEMS).filter(([id,it])=>!it.special && !it.retired && (kind==='wear'?it.cat==='wear':kind==='electronics'?['tv','laptop','radio','fridge','fan','aircon'].includes(id):it.cat==='decor'));
  const box=html`<div class="card stack mall-shop"><div class="h-title">${kind==='wear'?'服装店 Fashion Store':'家居店 Home Store'}</div><input class="mall-search" placeholder="Search / 搜索"><div class="mall-goods"></div><button class="btn white mall-close">Close</button></div>`;
  function draw(){const list=$('.mall-goods',box);list.replaceChildren();const q=$('.mall-search',box).value.toLowerCase();
    candidates.filter(([,it])=>(it.name+' '+it.en).toLowerCase().includes(q)).forEach(([id,it])=>{
      const b=document.createElement('button');b.className='btn white';const owned=it.cat==='wear'&&S.get().owned.includes(id);b.disabled=owned||S.get().coins<S.price(id);b.append(spriteCanvas(id,48),document.createTextNode(`${it.name} ${it.en} · ${owned?'Owned':S.price(id)+' coins'}`));
      b.onclick=()=>{if(S.buy(id)){toast('Purchased! 已购买');draw();}};list.append(b);
    });
  }
  $('.mall-search',box).oninput=draw;$('.mall-close',box).onclick=closeModal;draw();openModal(box);
}
export function wireMall(room, roomKey, layout, go, onChanged = () => {}) {
  const venue=MALL_VENUES[roomKey];let busy=false;
  room.querySelectorAll('.decor').forEach((d)=>{const it=ITEMS[d.dataset.id];if(it.mallShop||it.mallGame||it.hotpot)d.classList.add('mall-interactive');});
  room.addEventListener('click',(e)=>{
    const d=e.target.closest('.decor');if(!d||e.target.closest('button'))return;const it=ITEMS[d.dataset.id];
    if(it.mallShop)return shop(it.mallShop,go);
    if(it.mallGame)return openBowling();
    if(venue&&d.dataset.id.split('#')[0]===venue.kiosk){
      const token=crypto.randomUUID();
      openKiosk({place:'mall',layout,tablesOverride:mallTables(layout,roomKey),menuOverride:venue.menu,
        orderFn:(items,service,number)=>action('order',roomKey,{token,items,service,number}),onPaid:()=>{refresh();setTimeout(refresh,3300);}});
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
        if(row.deliveredAt&&!served.has(row.id)&&Date.now()-Date.parse(row.deliveredAt)<12000&&!loose){served.add(row.id);deliverCat(room,d,b,row.item,{fur:venue.fur});}
      });
    }catch{ /* retry on the next poll; keep the last displayed food */ }finally{busy=false;}
  }
  if(venue){refresh();const timer=setInterval(()=>{if(!room.isConnected)return clearInterval(timer);refresh();},4000);}
}
