// Friends: add friends by email, visit their kitten, feed it, write letters and send gifts.
import * as S from './state.js';
import * as Auth from './auth.js';
import { rest } from './cloud.js';
import { ITEMS, spriteCanvas, itemEffect, FURS } from './pixel.js';
import { TABS } from './shop.js';
import { $, html, esc, coinI, KittenView, toast, openModal, closeModal, confirmBox, burst, confetti, hydrateIcons } from './ui.js';
import { sfx, meow } from './audio.js';

const rpc = (name, body = {}) => rest('rpc/' + name, { method: 'POST', body: JSON.stringify(body) });
export const LETTER_MAX = 120;

// ---------- friend list (from the server) ----------
let friends = [];
const listeners = new Set();
export const onFriends = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const acceptedFriends = () => friends.filter((f) => f.status === 'accepted');
export const incomingRequests = () => friends.filter((f) => f.status === 'pending' && f.incoming);
export const outgoingRequests = () => friends.filter((f) => f.status === 'pending' && !f.incoming);
export async function refreshFriends() {
  if (!Auth.session()) return friends;
  try { friends = (await rpc('my_friends')) || []; listeners.forEach((fn) => fn(friends)); } catch (e) { /* offline */ }
  return friends;
}
export const friendName = (row) => {
  if (!row) return '朋友';
  const c = row.card;
  if (c && c.name) return c.childName ? `${c.childName}的${c.name}` : c.name;
  return row.email || '朋友';
};
const myName = () => { const s = S.get(); return s.childName ? `${s.childName}的${s.kitten.name}` : s.kitten.name; };

// ---------- my kitten's card, which friends can see ----------
function myCard() {
  const s = S.get(), k = s.kitten, md = S.mood();
  return { v: 1, name: k.name, childName: s.childName || '', fur: k.fur, equipped: k.equipped,
    hunger: Math.round(k.hunger), water: Math.round(k.water ?? 75), happy: Math.round(k.happy), level: S.level(), stage: S.health(), face: md.face };
}
let lastCard = '', cardTimer = null;
export function publishCard(now = false) {
  if (!Auth.session()) return;
  const c = myCard(), j = JSON.stringify(c);
  if (j === lastCard) return;
  clearTimeout(cardTimer);
  cardTimer = setTimeout(async () => { try { await rpc('put_my_card', { p_card: c }); lastCard = j; } catch (e) { /* try again next change */ } }, now ? 0 : 2500);
}

// ---------- things friends send me ----------
let polling = false, onNews = () => {};
export async function pollInbox() {
  if (polling || !Auth.session() || !Auth.user()) return;
  polling = true;
  try {
    const me = Auth.user().id;
    const evs = await rest(`friend_events?select=*&to_user=eq.${me}&done=eq.false&order=id.asc&limit=50`);
    if (evs && evs.length) {
      if (!friends.length || evs.some((ev) => !friends.find((f) => f.other === ev.from_user))) await refreshFriends();
      const got = [];
      for (const ev of evs) {
        const row = friends.find((f) => f.other === ev.from_user);
        const out = S.receiveFriendEvent(ev, row ? friendName(row) : String((ev.payload || {}).senderName || '朋友').slice(0, 40));
        if (out) got.push(out);
      }
      await rpc('mark_events_done', { p_ids: evs.map((e) => e.id) });
      if (got.length) onNews(got);
    }
  } catch (e) { /* offline: try later */ } finally { polling = false; }
}
async function sendEvent(to, kind, payload) {
  const r = await rpc('send_friend_event', { p_to: to, p_kind: kind, p_payload: { ...payload, senderName: myName() } });
  if (!r || !r.ok) throw new Error((r && r.error) || 'failed');
  return r;
}

let started = false;
export function startFriends(newsCallback) {
  onNews = newsCallback || onNews;
  if (started) return; started = true;
  S.onChange(() => publishCard());
  setInterval(() => { if (!document.hidden) pollInbox(); }, 8000);
  setInterval(() => { if (!document.hidden) refreshFriends(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { pollInbox(); refreshFriends(); } });
  setTimeout(() => { refreshFriends(); pollInbox(); publishCard(true); }, 1500);
}

// ---------- shared bits ----------
const bar = (label, v, c) => `<div class="stat"><span>${label}</span><div class="bar segmented"><i style="width:${Math.max(0, Math.min(100, v || 0))}%;--c:${c}"></i></div></div>`;
const STAGE_TEXT = { ok: '', cough: '🤒 咳嗽了 Coughing', dizzy: '😵‍💫 头晕 Dizzy', faint: '😵 晕倒了 Fainted', dead: '🪦 …' };
function friendKitten(card, scale) {
  const kv = new KittenView({ scale, fur: FURS[card.fur] ? card.fur : 'ginger', equipped: { ...(card.equipped || {}) } });
  kv.setMood(card.face || 'normal');
  if (card.stage === 'faint') kv.canvas.classList.add('fainted');
  return kv;
}
const ago = (t) => {
  if (!t) return '';
  const m = Math.round((Date.now() - Date.parse(t)) / 60000);
  return m < 2 ? '刚刚 just now' : m < 60 ? `${m} 分钟前 min ago` : m < 1440 ? `${Math.round(m / 60)} 小时前 h ago` : `${Math.round(m / 1440)} 天前 days ago`;
};
const ERR = { not_found: '找不到这个邮箱。 No account with that email.', self: '这是你自己的邮箱哦！ That\'s your own email.', already: '你们已经是朋友了！ You are already friends.', pending: '已经发过邀请了。 Request already sent — waiting for them.', too_many: '今天发太多了，明天再试。 Too many requests today.', not_friends: '你们还不是朋友。 You are not friends yet.' };

// ---------- the Friends page ----------
export function friendsScreen({ go }) {
  const n = html`<section class="screen"><div class="friends stack">
      <div class="card stack">
        <div class="h-title"><span class="zh">👫 我的朋友</span><span class="en">My friends</span></div>
        <div class="friend-grid" id="grid"><p class="help">加载中… Loading…</p></div>
      </div>
      <div class="card stack" id="req"></div>
      <div class="card stack">
        <div class="h-title" style="font-size:22px"><span class="zh">加朋友</span><span class="en">Add a friend</span></div>
        <p class="help" style="margin:0">输入朋友登录用的邮箱。他们同意以后，你们就能看到对方的小猫。<br>Type the email your friend uses to log in. Once they accept, you can visit each other's kittens.</p>
        <div class="row add-friend"><input type="email" id="em" placeholder="friend@email.com" autocomplete="off" autocapitalize="off"><button class="btn green" id="send">📨 <span class="zh">发送</span> Send</button></div>
      </div>
    </div></section>`;
  const render = () => {
    const grid = $('#grid', n);
    const list = acceptedFriends();
    grid.innerHTML = list.length ? '' : '<p class="help" style="margin:0">还没有朋友。在下面输入朋友的邮箱吧！ No friends yet — add one below.</p>';
    grid.classList.toggle('empty', !list.length);
    list.forEach((f) => {
      const c = f.card || {};
      const t = html`<button class="friend-tile"><div class="kv"></div><div class="nm zh">${esc(friendName(f))}</div><div class="lv">Lv${c.level || 1}${c.stage && c.stage !== 'ok' ? ' · ' + (STAGE_TEXT[c.stage] || '').split(' ')[0] : ''}</div></button>`;
      if (f.card) $('.kv', t).replaceWith(friendKitten(c, 3).canvas); else $('.kv', t).innerHTML = '🐱';
      t.onclick = () => go('friend', { id: f.other });
      grid.appendChild(t);
    });
    const inc = incomingRequests(), out = outgoingRequests(), req = $('#req', n);
    req.classList.toggle('hidden', !inc.length && !out.length);
    req.innerHTML = `<div class="h-title" style="font-size:22px"><span class="zh">好友邀请</span><span class="en">Friend requests</span></div>
      ${inc.map((f) => `<div class="req-row">📩 <b>${esc(f.email)}</b> 想和你做朋友！<span class="help" style="margin:0">请妈妈在 🔒 家长专区同意。 Ask Mum to accept it in the 🔒 Parent area.</span></div>`).join('')}
      ${out.map((f) => `<div class="req-row">⏳ <b>${esc(f.email)}</b> <span class="help" style="margin:0">等对方同意 · Waiting for them to accept</span></div>`).join('')}`;
  };
  $('#send', n).onclick = async () => {
    const em = $('#em', n).value.trim();
    if (!/^\S+@\S+\.\S+$/.test(em)) return toast('请输入邮箱 Type an email address');
    const btn = $('#send', n); btn.disabled = true;
    try {
      const r = await rpc('send_friend_request', { p_email: em });
      if (r && r.ok) { sfx.coin(); toast(r.accepted ? '🎉 <span class="zh">你们是朋友了！</span> You are now friends!' : '📨 <span class="zh">邀请已发送！</span> Request sent!', { ms: 3500 }); $('#em', n).value = ''; await refreshFriends(); render(); }
      else toast(ERR[r && r.error] || 'Could not send', { ms: 4000 });
    } catch (e) { toast('网络不好，请再试。 Network problem — try again.'); }
    btn.disabled = false;
  };
  const off = onFriends(() => { if (!n.isConnected) return off(); render(); });
  render();
  refreshFriends();
  return n;
}

// ---------- visiting one friend's kitten ----------
export function friendScreen({ go, id }) {
  const n = html`<section class="screen"><div class="friend-visit stack"></div></section>`;
  const root = $('.friend-visit', n);
  const draw = () => {
    const f = acceptedFriends().find((x) => x.other === id);
    root.innerHTML = '';
    if (!f) { root.appendChild(html`<div class="card"><p class="help">${friends.length ? '找不到这个朋友。 Friend not found.' : '加载中… Loading…'}</p></div>`); return; }
    const c = f.card || {};
    const v = html`<div class="visit-grid">
        <div class="card visit-stage"><div class="visit-kv"></div><div class="nametag">${esc(c.name || '🐱')}<span class="lv">Lv${c.level || 1}</span></div><div class="fx-layer" id="fx"></div></div>
        <div class="card stack visit-info">
          <div class="h-title"><span class="zh">${esc(friendName(f))}</span></div>
          ${f.card ? `${bar('饱饱 Food', c.hunger, '#f59b2a')}${bar('喝水 Water', c.water, '#4fb3ef')}${bar('开心 Happy', c.happy, '#ff6f9c')}
          ${STAGE_TEXT[c.stage] ? `<div class="sick-note">${STAGE_TEXT[c.stage]}</div>` : ''}
          <p class="help" style="margin:0">更新 Updated ${ago(f.card_updated)}</p>` : '<p class="help">这只小猫还没上线。 This kitten hasn\'t been online yet.</p>'}
          <div class="visit-actions">
            <button class="btn white" id="v-feed">🐟 <span class="zh">喂它</span> Feed</button>
            <button class="btn blue" id="v-letter">✉️ <span class="zh">写信</span> Letter</button>
            <button class="btn pink" id="v-gift">🎁 <span class="zh">送礼物</span> Gift</button>
          </div>
        </div>
      </div>`;
    const kv = f.card ? friendKitten(c, Math.max(4, Math.min(8, Math.floor(window.innerHeight * 0.32 / 38)))) : null;
    if (kv) { $('.visit-kv', v).replaceWith(kv.canvas); kv.canvas.onclick = () => { meow(c.face); kv.jump(); burst($('#fx', v), 'heart', 3, '50%', '30%'); }; }
    $('#v-feed', v).onclick = () => feedFriend(f, kv, $('#fx', v), draw);
    $('#v-letter', v).onclick = () => writeLetter(f);
    $('#v-gift', v).onclick = () => sendGift(f);
    root.appendChild(v);
    hydrateIcons(root);
  };
  draw();
  if (!acceptedFriends().length) refreshFriends().then(() => n.isConnected && draw());
  return n;
}

function feedFriend(f, kv, fx, redraw) {
  const s = S.get();
  const foods = Object.entries(s.pantry).filter(([id, c]) => c > 0 && ITEMS[id] && ITEMS[id].cat === 'food');
  const box = html`<div class="card stack">
      <div class="h-title"><span class="zh">喂${esc((f.card || {}).name || '小猫')}</span><span class="en">Feed your friend's kitten</span></div>
      <p class="help" style="margin:0">用你冰箱里的食物。 Uses food from your own pantry.</p>
      ${foods.length ? '<div class="pantry" id="pantry"></div>' : '<p class="help">冰箱空空的！先去商店买吃的。 Your pantry is empty — buy food in the shop first.</p>'}
      <button class="btn white" id="close">关闭 Close</button>
    </div>`;
  foods.forEach(([id, count]) => {
    const it = ITEMS[id];
    const b = html`<button class="item"><span class="count">×${count}</span><div class="art"></div><div class="nm">${it.name}</div><div class="eff">${itemEffect(it)}</div></button>`;
    $('.art', b).appendChild(spriteCanvas(id, 56));
    b.onclick = async () => {
      if (!S.usePantry(id)) return;
      closeModal();
      try {
        await sendEvent(f.other, 'feed', { item: id });
        sfx.yum(); if (kv) { kv.flash('eat', 1600); kv.jump(); } burst(fx, 'heart', 4, '50%', '30%');
        if (f.card) { f.card.hunger = Math.min(100, (f.card.hunger || 0) + (it.hunger || 0)); f.card.water = Math.min(100, (f.card.water || 0) + (it.water || 0)); f.card.happy = Math.min(100, (f.card.happy || 0) + (it.happy || 0) + 3); }
        toast(`<span class="zh">喂好了！</span> You fed ${esc((f.card || {}).name || 'the kitten')} ${esc(it.en)}!`);
        setTimeout(redraw, 1700);
      } catch (e) {
        S.get().pantry[id] = (S.get().pantry[id] || 0) + 1; S.save();          // give the food back
        toast(ERR[e.message] || '没送到，请再试。 Could not send — try again.');
      }
    };
    $('#pantry', box).appendChild(b);
  });
  $('#close', box).onclick = closeModal;
  openModal(box);
}

function writeLetter(f) {
  const box = html`<div class="card stack letter-card">
      <div class="h-title"><span class="zh">✉️ 写信给${esc((f.card || {}).name || '朋友')}</span><span class="en">Write a letter</span></div>
      <textarea id="tx" maxlength="${LETTER_MAX}" rows="4" placeholder="你好！我的小猫很想你……"></textarea>
      <div class="row" style="justify-content:space-between"><span class="help" style="margin:0" id="cnt">0/${LETTER_MAX}</span>
        <span class="row"><button class="btn white" id="c">取消 Cancel</button><button class="btn green" id="ok">📮 <span class="zh">寄出</span> Send</button></span></div>
    </div>`;
  const tx = $('#tx', box);
  tx.oninput = () => { $('#cnt', box).textContent = `${tx.value.length}/${LETTER_MAX}`; };
  $('#c', box).onclick = closeModal;
  $('#ok', box).onclick = async () => {
    const text = tx.value.trim();
    if (!text) return toast('写点什么吧！ Write something first');
    $('#ok', box).disabled = true;
    try { await sendLetter(f.other, text, friendName(f)); closeModal(); sfx.coin(); toast('📮 <span class="zh">信寄出去了！</span> Letter sent!'); }
    catch (e) { $('#ok', box).disabled = false; toast(ERR[e.message] || '没寄出，请再试。 Could not send — try again.'); }
  };
  openModal(box);
  setTimeout(() => tx.focus(), 50);
}

export async function sendLetter(to, text, toName) {
  const t = String(text).slice(0, LETTER_MAX);
  const r = await sendEvent(to, 'letter', { text: t });
  const row = friends.find((f) => f.other === to);
  S.recordSent(to, toName || (row ? friendName(row) : '朋友'), t);
  return r;
}
export const errorText = (code) => ERR[code];
const GIFT_TABS = TABS.filter((t) => ['food', 'head', 'body', 'feet', 'acc', 'decor'].includes(t.key));
function sendGift(f) {
  let tab = 'food', pick = null;
  const box = html`<div class="card stack gift-pick">
      <div class="h-title"><span class="zh">🎁 送礼物</span><span class="en">Send a gift to ${esc((f.card || {}).name || 'your friend')}</span></div>
      <div class="row"><span class="wallet-mini">${coinI(20)} <b id="w">${S.get().coins}</b></span></div>
      <div class="aisles small" id="tabs"></div>
      <div class="gift-items" id="items"></div>
      <label class="field">写几句话 Add a message (optional)<textarea id="msg" maxlength="${LETTER_MAX}" rows="2" placeholder="生日快乐！"></textarea></label>
      <div class="row" style="justify-content:flex-end"><button class="btn white" id="c">取消 Cancel</button><button class="btn pink" id="ok" disabled>🎁 <span class="zh">送出</span> Send</button></div>
    </div>`;
  const render = () => {
    $('#tabs', box).innerHTML = GIFT_TABS.map((t) => {
      const locked = t.lock && !S.unlocked(t.lock);
      return `<button class="aisle ${t.key === tab ? 'on' : ''}" data-t="${t.key}" ${locked ? 'disabled' : ''}>${locked ? '🔒' : t.icon} <span class="zh">${t.zh}</span></button>`;
    }).join('');
    const items = $('#items', box); items.innerHTML = '';
    const t = GIFT_TABS.find((x) => x.key === tab);
    Object.entries(ITEMS).filter(([, it]) => t.test(it)).forEach(([id, it]) => {
      const cost = S.price(id);
      const b = html`<button class="item ${pick === id ? 'on' : ''}"><div class="art"></div><div class="nm">${it.name}</div><div class="eff">${cost} ${coinI(14)}</div></button>`;
      $('.art', b).appendChild(spriteCanvas(id, 48));
      b.disabled = cost > S.get().coins;
      b.onclick = () => { pick = id; render(); };
      items.appendChild(b);
    });
    $('#ok', box).disabled = !pick;
    if (pick) $('#ok', box).innerHTML = `🎁 <span class="zh">送出</span> Send · ${S.price(pick)} ${coinI(16)}`;
    hydrateIcons(box);
  };
  $('#tabs', box).onclick = (e) => { const b = e.target.closest('[data-t]'); if (b && !b.disabled) { tab = b.dataset.t; render(); } };
  $('#c', box).onclick = closeModal;
  $('#ok', box).onclick = async () => {
    if (!pick) return;
    const cost = S.price(pick);
    if (!(await confirmBox('送这个礼物？ Send this gift?', `${ITEMS[pick].name} ${esc(ITEMS[pick].en)} — ${cost} coins`, '送出 Send', '取消 Cancel'))) return sendGift(f);
    if (!S.spend(cost)) return toast('金币不够 Not enough coins');
    try {
      await sendEvent(f.other, 'gift', { item: pick, message: ($('#msg', box) ? $('#msg', box).value : '').trim().slice(0, LETTER_MAX) });
      sfx.fanfare(); confetti(); toast('🎁 <span class="zh">礼物送出去了！</span> Gift sent!', { ms: 3000 });
    } catch (e) {
      S.addCoins(cost);                                                      // refund
      toast(ERR[e.message] || '没送到，请再试。 Could not send — try again.');
    }
  };
  render();
  openModal(box);
  $('#modal .card').style.width = 'min(760px, 96vw)';
}

// ---------- my gift box and mailbox ----------
export function openGiftBox(gift, after) {
  const it = ITEMS[gift.item];
  const box = html`<div class="card stack gift-open" style="align-items:center;text-align:center">
      <div class="h-title" style="justify-content:center"><span class="zh">你收到礼物了！</span><span class="en">You got a gift!</span></div>
      <div class="from">来自 From: <b class="zh">${esc(gift.fromName || '朋友')}</b></div>
      <button class="giftbox" id="gb" aria-label="Open">🎁</button>
      <div class="help" id="tap">点礼物盒打开！ Tap the box to open it!</div>
      <div class="reveal hidden" id="rv"></div>
      <button class="btn green hidden" id="ok">好的！ Yay!</button>
    </div>`;
  $('#gb', box).onclick = () => {
    const res = S.openGift(gift.id);
    if (!res) return closeModal();
    $('#gb', box).classList.add('opened'); $('#tap', box).classList.add('hidden');
    sfx.fanfare(); confetti();
    const rv = $('#rv', box);
    rv.innerHTML = `<div class="art"></div><div class="zh" style="font-size:24px">${it.name} <span class="en">${esc(it.en)}</span></div>
      ${gift.message ? `<div class="parent-note"><small>${esc(gift.fromName || '朋友')} 说 · says:</small><div class="zh">${esc(gift.message)}</div></div>` : ''}
      <div class="help">${res.result === 'coins' ? `你已经有了，换成 ${res.coins} 金币！ You already have it, so it became ${res.coins} coins.` : it.cat === 'food' ? '放进冰箱了！ Added to your pantry.' : '放进我的物品了！ Added to My Items.'}</div>`;
    $('.art', rv).appendChild(spriteCanvas(gift.item, 96));
    setTimeout(() => { rv.classList.remove('hidden'); $('#ok', box).classList.remove('hidden'); }, 500);
  };
  $('#ok', box).onclick = () => { closeModal(); after && after(); };
  openModal(box);
}
export function openMailbox(after) {
  const letters = (S.get().letters || []).slice(0, 50);
  const box = html`<div class="card stack mailbox">
      <div class="h-title"><span class="zh">✉️ 我的信箱</span><span class="en">My letters</span></div>
      <div class="letters">${letters.length ? letters.map((l) => `<div class="letter ${l.read ? '' : 'new'}"><div class="lh"><b class="zh">${esc(l.fromName || '朋友')}</b><small>${new Date(l.at).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small></div><div class="zh lt">${esc(l.text)}</div></div>`).join('') : '<p class="help">还没有信。 No letters yet.</p>'}</div>
      <button class="btn white" id="close">关闭 Close</button>
    </div>`;
  $('#close', box).onclick = () => { closeModal(); after && after(); };
  openModal(box, { onClose: () => S.markLettersRead() });
}

// ---------- parent area: requests, friends, letters ----------
export function parentFriendsView(rerender) {
  const n = html`<div class="stack">
      <p class="help">Friends are other families using Meow Chinese. Friends can see her kitten's name, level and bars, feed it, write short letters and send gifts. Requests only become friends after <b>you</b> accept them here.</p>
      <h3>Friend requests</h3><div id="inc" class="stack"></div>
      <h3>Friends</h3><div id="fr" class="stack"></div>
      <h3>Letters she received</h3><div id="lt" class="stack"></div>
    </div>`;
  const draw = () => {
    const inc = incomingRequests(), acc = acceptedFriends(), out = outgoingRequests();
    $('#inc', n).innerHTML = inc.length ? '' : '<p class="help" style="margin:0">No requests waiting.</p>';
    inc.forEach((f) => {
      const r = html`<div class="list-row" style="grid-template-columns:1fr auto"><div><b>${esc(f.email)}</b><div class="help" style="margin:0">wants to be friends</div></div>
        <div class="row" style="gap:6px"><button class="btn green small" data-a="yes">Accept</button><button class="btn white small" data-a="no">Decline</button></div></div>`;
      r.querySelector('[data-a=yes]').onclick = async () => { await rpc('respond_friend_request', { p_id: f.friendship_id, p_accept: true }); toast('Accepted ✓'); await refreshFriends(); draw(); };
      r.querySelector('[data-a=no]').onclick = async () => { await rpc('respond_friend_request', { p_id: f.friendship_id, p_accept: false }); toast('Declined'); await refreshFriends(); draw(); };
      $('#inc', n).appendChild(r);
    });
    $('#fr', n).innerHTML = acc.length || out.length ? '' : '<p class="help" style="margin:0">No friends yet. She can add friends by email from the 👫 Friends page.</p>';
    [...acc, ...out].forEach((f) => {
      const r = html`<div class="list-row" style="grid-template-columns:1fr auto"><div><b class="zh">${esc(f.status === 'accepted' ? friendName(f) : '')}</b> <span class="help" style="margin:0">${esc(f.email)}${f.status === 'pending' ? ' · waiting for them to accept' : ''}</span></div>
        <button class="btn white small" data-a="rm">${f.status === 'pending' ? 'Cancel' : 'Remove'}</button></div>`;
      r.querySelector('[data-a=rm]').onclick = async () => {
        if (!(await confirmBox('Remove friend?', `${esc(f.email)} will no longer see her kitten.`, 'Remove'))) return;
        await rpc('remove_friend', { p_id: f.friendship_id }); await refreshFriends(); draw();
      };
      $('#fr', n).appendChild(r);
    });
    const letters = (S.get().letters || []).slice(0, 30);
    $('#lt', n).innerHTML = letters.length ? letters.map((l) => `<div class="letter"><div class="lh"><b class="zh">${esc(l.fromName || '')}</b><small>${new Date(l.at).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small></div><div class="zh lt">${esc(l.text)}</div></div>`).join('') : '<p class="help" style="margin:0">No letters yet.</p>';
  };
  draw();
  refreshFriends().then(() => n.isConnected && draw());
  return n;
}
