// Phone notifications (Web Push). On iPhone/iPad they only work when the app was added to the Home Screen.
import * as Auth from './auth.js';
import { rest } from './cloud.js';

export const VAPID_PUBLIC = 'BIOgdA_29vNBwSalJp16GEDaMnnLSKgmRJExIWDD24g5PVj9DT2WA9RMB-EkXmtI_jRu9Kh3-0XicClxyAwKQl4';
export const TYPES = [
  ['hungry', '🐟 小猫饿了 Kitten is hungry'],
  ['thirsty', '💧 小猫口渴了 Kitten is thirsty'],
  ['bored', '🎮 小猫无聊了 Kitten is bored'],
  ['tasks', '📋 今日任务还没做完 Daily tasks not done'],
  ['message', '✉️ 新信息 New message from a friend'],
  ['noti', '🔔 手机通知 New phone notification (e.g. essay checked)'],
  ['gift', '🎁 朋友送礼物 Gift from a friend'],
  ['feed', '🐟 朋友喂了小猫 A friend fed the kitten'],
];

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
export const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// why this device can't turn notifications on yet ('' = it can)
export function blocker() {
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return 'https';
  if (isIOS() && !isStandalone()) return 'homescreen';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return '';
}
export const defaultName = () => (/iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'iPad' : /iPhone/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android phone' : 'Computer');

const b64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); };
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function registration() {
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('sw.js'));
  return navigator.serviceWorker.ready.then(() => reg);
}
// this device's push address (null if notifications aren't on here)
export async function currentEndpoint() {
  try { if (!supported()) return null; const reg = await navigator.serviceWorker.getRegistration(); const s = reg && (await reg.pushManager.getSubscription()); return s ? s.endpoint : null; } catch { return null; }
}
// turn notifications on for this device (must be called from a tap)
export async function enable(name) {
  const why = blocker(); if (why) throw new Error(why);
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('denied');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID_PUBLIC) });
  const j = sub.toJSON();
  const prefs = Object.fromEntries(TYPES.map(([k]) => [k, true]));
  await rest('rpc/save_push_sub', { method: 'POST', body: JSON.stringify({ p_endpoint: sub.endpoint, p_p256dh: j.keys?.p256dh || toB64(sub.getKey('p256dh')), p_auth: j.keys?.auth || toB64(sub.getKey('auth')), p_name: name || defaultName(), p_prefs: prefs }) });
  return sub.endpoint;
}
export const devices = () => rest('push_subs?select=id,endpoint,name,prefs,created_at,last_ok&order=created_at');
const REP = { Prefer: 'return=representation' };
export const setPrefs = (id, prefs) => rest(`push_subs?id=eq.${id}`, { method: 'PATCH', headers: REP, body: JSON.stringify({ prefs }) });
export const rename = (id, name) => rest(`push_subs?id=eq.${id}`, { method: 'PATCH', headers: REP, body: JSON.stringify({ name }) });
export async function remove(id, endpoint) {
  await rest(`push_subs?id=eq.${id}`, { method: 'DELETE', headers: REP });
  // if it's this device, stop it here too
  if (endpoint && endpoint === (await currentEndpoint())) { try { const reg = await navigator.serviceWorker.getRegistration(); const s = await reg.pushManager.getSubscription(); if (s) await s.unsubscribe(); } catch {} }
}
export async function test() {
  const t = await Auth.token();
  const r = await fetch(`${Auth.API}/functions/v1/push`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: Auth.KEY, Authorization: `Bearer ${t}` }, body: JSON.stringify({ mode: 'test', delay: 6 }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j.sent || 0;
}
