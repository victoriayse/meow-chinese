// Friends: add friends by email, visit their kitten, feed it, write letters and send gifts.
import * as S from './state.js';
import * as Auth from './auth.js';
import { rest, managing } from './cloud.js';
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
  if (c && c.name) return c.childName && !String(c.name).includes(c.childName) ? `${c.childName}的${c.name}` : c.name;
  return row.email || '朋友';
};
const myName = () => { const s = S.get(); return s.childName && !String(s.kitten.name).includes(s.childName) ? `${s.childName}的${s.kitten.name}` : s.kitten.name; };

// ---------- my kitten's card, which friends can see ----------
function myCard() {
  const s = S.get(), k = s.kitten, md = S.mood();
  return { v: 1, name: k.name, childName: s.childName || '', fur: k.fur, equipped: k.equipped,
    hunger: Math.round(k.hunger), water: Math.round(k.water ?? 75), happy: Math.round(k.happy), level: S.level(), stage: S.health(), face: s.settings.alwaysSmile && md.face !== 'faint' ? 'happy' : md.face,
    doing: document.hidden ? 'away' : activity, ...(s.settings.houseLocked ? { locked: true } : {}) };
}
// what she is doing right now, shown to friends ('essay', 'spelling', 'phone', ...)
let activity = 'online';
export function setActivity(a) { if (a === activity) return; activity = a; publishCard(true); }
let lastCard = '', lastSent = 0, cardTimer = null;
export function publishCard(now = false) {
  if (!Auth.session() || managing()) return;   // a parent looking after a child's account: don't show the child's cat as hers
  const c = myCard(), j = JSON.stringify(c);
  if (j === lastCard && Date.now() - lastSent < 40000) return;   // unchanged: still re-send every 40 s so friends see she's online
  clearTimeout(cardTimer);
  cardTimer = setTimeout(async () => { try { await rpc('put_my_card', { p_card: c }); lastCard = j; lastSent = Date.now(); } catch (e) { /* try again next change */ } }, now ? 0 : 2500);
}
// a friend counts as online if their app checked in during the last 100 seconds
// "Last seen: 3 Oct, 11:45 pm" from the friend's last check-in
export function lastSeen(f) {
  if (!f || !f.card_updated) return '';
  const d = new Date(f.card_updated), today = new Date();
  const time = d.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' });
  const y = new Date(); y.setDate(y.getDate() - 1);
  const day = d.toDateString() === today.toDateString() ? '今天 Today' : d.toDateString() === y.toDateString() ? '昨天 Yesterday' : d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
  return `${day}, ${time}`;
}
export const isOnline = (f) => !!(f && f.card && f.card.doing !== 'away' && f.card_updated && Date.now() - Date.parse(f.card_updated) < 100000);
const DOING = {
  essay: ['在写作文', 'is doing an essay', '✍️'], spelling: ['在听写', 'is doing spelling', '✏️'], phone: ['在玩手机', 'is using the phone', '📱'],
  shop: ['在逛商店', 'is shopping', '🛍️'], wardrobe: ['在换衣服', 'is dressing up', '👗'], house: ['在家里', 'is at home', '🏠'],
  friends: ['在看朋友', 'is visiting friends', '👫'], practice: ['在做练习', 'is practising Chinese', '📝'], online: ['在线', 'is online', '🟢'],
};
export function doingText(f) {
  const c = f.card || {}, d = DOING[c.doing] || DOING.online;
  return `${d[2]} ${c.name || ''}${d[0]} · ${c.name || ''} ${d[1]}`;
}
const doingHTML = (f) => { const c = f.card || {}, d = DOING[c.doing] || DOING.online; return `${d[2]} ${esc(c.name || '')}${d[0]}<small>${esc(c.name || '')} ${d[1]}</small>`; };

// ---------- things friends send me ----------
let polling = false, onNews = () => {};
// screens that want to know straight away when something arrives (e.g. the open phone)
const inboxListeners = new Set();
export const onInbox = (fn) => { inboxListeners.add(fn); return () => inboxListeners.delete(fn); };
let pollAgain = false;
export async function pollInbox() {
  if (polling) { pollAgain = true; return; }                                  // look again as soon as this one ends
  if (!Auth.session() || !Auth.user() || managing()) return;   // her own letters and gifts wait until she's back on her account
  polling = true; pollAgain = false;
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
      if (got.length) { onNews(got); inboxListeners.forEach((fn) => { try { fn(got); } catch (x) { console.warn(x); } }); }
    }
  } catch (e) { /* offline: try later */ } finally { polling = false; if (pollAgain) setTimeout(pollInbox, 0); }
}

// ---------- live: the server tells this phone the moment a friend sends something ----------
// (Supabase Realtime over a WebSocket; the 8-second check stays as a backup)
let ws = null, wsUser = null, wsBeat = null, wsRef = 0, wsRetry = 0, wsTimer = null;
const wsSend = (sock, topic, event, payload) => { if (sock && sock.readyState === 1) sock.send(JSON.stringify({ topic, event, payload, ref: String(++wsRef) })); };
function stopLive() {
  clearInterval(wsBeat); wsBeat = null; clearTimeout(wsTimer); wsTimer = null;
  const old = ws; ws = null; wsUser = null;
  if (old) { old.onclose = null; try { old.close(); } catch {} }
}
async function startLive() {
  const u = Auth.user();
  if (!u || !Auth.session() || managing() || document.hidden || typeof WebSocket === 'undefined') { stopLive(); return; }
  if (ws && wsUser === u.id && ws.readyState <= 1) return;                   // already listening
  stopLive();
  const t = await Auth.token().catch(() => null); if (!t) return;
  const topic = `realtime:inbox-${u.id}`;
  const sock = new WebSocket(`${Auth.API.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(Auth.KEY)}&vsn=1.0.0`);
  ws = sock; wsUser = u.id;
  sock.onopen = () => {
    wsSend(sock, topic, 'phx_join', { config: { broadcast: { self: false }, presence: { key: '' },
      postgres_changes: [{ event: 'INSERT', schema: 'public', table: 'friend_events', filter: `to_user=eq.${u.id}` },
        { event: 'UPDATE', schema: 'public', table: 'friend_events', filter: `from_user=eq.${u.id}` }] }, access_token: t });
    clearInterval(wsBeat);
    wsBeat = setInterval(async () => {
      wsSend(sock, 'phoenix', 'heartbeat', {});
      const nt = await Auth.token().catch(() => null); if (nt) wsSend(sock, topic, 'access_token', { access_token: nt });   // keep the login fresh
    }, 25000);
    pollInbox();                                                             // anything that came while we were away
  };
  sock.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.event === 'postgres_changes') {
      wsRetry = 0;
      const d = (m.payload && (m.payload.data || m.payload)) || {}, rec = d.record || {};
      if (d.type === 'UPDATE') { if (rec.read_at && rec.id != null && S.markSentSeen([rec.id])) seenChanged(); }   // a friend read my message
      else pollInbox();
    }
    else if (m.event === 'phx_reply' && m.payload && m.payload.status === 'ok') wsRetry = 0;
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    clearInterval(wsBeat); wsBeat = null; ws = null; wsUser = null;
    wsTimer = setTimeout(startLive, Math.min(60000, 2000 * 2 ** wsRetry++));   // try again, a bit slower each time
  };
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
  setInterval(() => { if (!document.hidden) { pollInbox(); startLive(); } }, 8000);   // (startLive does nothing if already connected)
  setInterval(() => { if (!document.hidden) refreshFriends(); }, 30000);
  setInterval(() => { if (!document.hidden) publishCard(true); }, 40000);      // heartbeat
  document.addEventListener('visibilitychange', () => { publishCard(true); if (!document.hidden) { pollInbox(); refreshFriends(); startLive(); } else stopLive(); });
  window.addEventListener('online', () => startLive());
  setTimeout(() => { refreshFriends(); pollInbox(); publishCard(true); startLive(); }, 1500);
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
      const on = isOnline(f);
      const t = html`<button class="friend-tile ${on ? 'online' : ''}">${on ? `<i class="online-dot" title="Online"></i><div class="doing zh">${doingHTML(f)}</div>` : ''}<div class="kv"></div><div class="nm zh">${esc(friendName(f))}</div><div class="lv">Lv${c.level || 1}${c.stage && c.stage !== 'ok' ? ' · ' + (STAGE_TEXT[c.stage] || '').split(' ')[0] : ''}</div>${!on && f.card_updated ? `<div class="last-seen">最后上线 Last seen<br>${esc(lastSeen(f))}</div>` : ''}</button>`;
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
  const iv = setInterval(() => { if (!n.isConnected) return clearInterval(iv); if (!document.hidden) refreshFriends(); }, 12000);
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
          <div class="presence ${isOnline(f) ? 'on' : ''}">${isOnline(f) ? esc(doingText(f)) : `⚪ 不在线 · Offline${f.card_updated ? `<small class="last-seen">最后上线 Last seen: ${esc(lastSeen(f))}</small>` : ''}`}</div>
          ${f.card ? `${bar('饱饱 Food', c.hunger, '#f59b2a')}${bar('喝水 Water', c.water, '#4fb3ef')}${bar('开心 Happy', c.happy, '#ff6f9c')}
          ${STAGE_TEXT[c.stage] ? `<div class="sick-note">${STAGE_TEXT[c.stage]}</div>` : ''}
          <p class="help" style="margin:0">更新 Updated ${ago(f.card_updated)}</p>` : '<p class="help">这只小猫还没上线。 This kitten hasn\'t been online yet.</p>'}
          <div class="visit-actions">
            <button class="btn white" id="v-feed">🐟 <span class="zh">喂它</span> Feed</button>
            <button class="btn blue" id="v-letter">✉️ <span class="zh">写信</span> Letter</button>
            <button class="btn pink" id="v-gift">🎁 <span class="zh">送礼物</span> Gift</button>
          </div>
          <button class="btn green big" id="v-home" ${isOnline(f) && !c.locked ? '' : 'disabled'}>${c.locked ? '🔒' : '🏠'} <span class="zh">去串门</span> Visit their house</button>
          <button class="btn blue" id="v-invite" ${isOnline(f) ? '' : 'disabled'}>📨 <span class="zh">邀请来我家</span> Invite to my house</button>
          ${c.locked ? '<p class="help" style="margin:0">🔒 朋友的家锁上了。 Your friend\'s house is locked right now.</p>' : isOnline(f) ? '' : '<p class="help" style="margin:0">朋友在线的时候才可以去串门。 You can visit when your friend is online.</p>'}
        </div>
      </div>`;
    const kv = f.card ? friendKitten(c, Math.max(4, Math.min(8, Math.floor(window.innerHeight * 0.32 / 38)))) : null;
    if (kv) { $('.visit-kv', v).replaceWith(kv.canvas); kv.canvas.onclick = () => { meow(c.face); kv.jump(); burst($('#fx', v), 'heart', 3, '50%', '30%'); }; }
    $('#v-feed', v).onclick = () => feedFriend(f, kv, $('#fx', v), draw);
    $('#v-letter', v).onclick = () => writeLetter(f);
    $('#v-gift', v).onclick = () => sendGift(f);
    $('#v-home', v).onclick = () => go('visit', { id: f.other, name: friendName(f) });
    const vi = $('#v-invite', v); if (vi) vi.onclick = () => import('./app.js').then((A) => A.inviteOver(f.other, friendName(f)));
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
  S.recordSent(to, toName || (row ? friendName(row) : '朋友'), t, r && r.id != null ? r.id : null);
  return r;
}
// ---------- read receipts (✓ sent · ✓✓ read) ----------
const seenListeners = new Set();
export const onSeen = (fn) => { seenListeners.add(fn); return () => seenListeners.delete(fn); };
const seenChanged = () => seenListeners.forEach((fn) => { try { fn(); } catch (e) { console.warn(e); } });
// I opened a chat: tell the server I've read my friend's messages (they get ✓✓)
export async function markRead(friendId) {
  if (!Auth.session() || managing() || !friendId || friendId === 'unknown') return;
  try { await rpc('mark_letters_read', { p_from: friendId }); } catch (e) { /* offline: next time */ }
}
// which of my sent messages have been read? (asked when a chat opens; live updates come over the socket)
export async function refreshSeen() {
  const ids = S.unseenSentIds().slice(0, 80);
  if (!ids.length || !Auth.session() || managing()) return;
  try {
    const rows = await rest(`friend_events?select=id&id=in.(${ids.join(',')})&read_at=not.is.null`);
    if (rows && rows.length && S.markSentSeen(rows.map((r) => r.id))) seenChanged();
  } catch (e) { /* offline */ }
}
export const errorText = (code) => ERR[code];
const GIFT_TABS = TABS.filter((t) => ['food', 'toiletry', 'head', 'body', 'feet', 'acc', 'decor'].includes(t.key));
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

// ---------- from the shop: buy this item as a present for a friend ----------
export async function giftFromShop(id, after) {
  if (!Auth.session() || managing()) return toast('Log in on her own account to send gifts');
  const it = ITEMS[id], cost = S.price(id);
  let to = null;
  const box = html`<div class="card stack gift-pick">
      <div class="h-title"><span class="zh">🎁 买来送朋友</span><span class="en">Buy as a gift</span></div>
      <div class="row" style="gap:12px;align-items:center"><div class="art" id="art"></div>
        <div class="gp-info"><div><b class="zh">${it.name}</b> <small>${esc(it.en)}</small></div><div class="gp-price">${coinI(16)} <b>${cost}</b> <small class="help">(你有 You have ${S.get().coins})</small></div></div></div>
      <div class="help" style="margin:0">送给谁？ Who is it for?</div>
      <div class="gift-friends" id="fr"><span class="help">Loading friends…</span></div>
      <label class="field">写几句话 Add a message (optional)<textarea id="msg" maxlength="${LETTER_MAX}" rows="2" placeholder="送给你！"></textarea></label>
      <div class="row" style="justify-content:flex-end"><button class="btn white" id="c">取消 Cancel</button><button class="btn pink" id="ok" disabled>🎁 <span class="zh">送出</span> Send · ${cost} ${coinI(16)}</button></div>
    </div>`;
  $('#art', box).appendChild(spriteCanvas(id, 56));
  const drawFriends = () => {
    const list = acceptedFriends(), fr = $('#fr', box);
    if (!list.length) { fr.innerHTML = '<p class="help" style="margin:0">还没有朋友。先在 👫 朋友 Friends 加朋友吧！<br>No friends yet — add one in 👫 Friends first.</p>'; return; }
    fr.innerHTML = list.map((f) => `<button class="btn white small friend-pick ${to === f.other ? 'on' : ''}" data-f="${f.other}">${esc(friendName(f))}</button>`).join('');
    $('#ok', box).disabled = !to || cost > S.get().coins;
  };
  $('#fr', box).onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) { to = b.dataset.f; drawFriends(); } };
  $('#c', box).onclick = closeModal;
  $('#ok', box).onclick = async (e) => {
    const f = acceptedFriends().find((x) => x.other === to); if (!f) return;
    if (!S.spend(cost)) return toast('金币不够 Not enough coins');
    e.currentTarget.disabled = true;
    try {
      await sendEvent(f.other, 'gift', { item: id, message: $('#msg', box).value.trim().slice(0, LETTER_MAX) });
      closeModal(); sfx.fanfare(); confetti();
      toast(`🎁 <span class="zh">礼物送给${esc(friendName(f))}了！</span> Gift sent!`, { ms: 3000 });
    } catch (x) {
      S.addCoins(cost);                                                      // refund
      e.currentTarget.disabled = false;
      toast(ERR[x.message] || '没送到，请再试。 Could not send — try again.');
    }
    if (after) after();
  };
  openModal(box); hydrateIcons(box);
  drawFriends();
  await refreshFriends(); if (box.isConnected) drawFriends();
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
