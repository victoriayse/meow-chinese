// 喵喵中文 phone notifications (Web Push).
// Called by: the database (a friend event, a game save change, and every 15 minutes) with a shared secret,
// and by the app itself ("send a test") with the user's login token.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

let cfg: Record<string, string> | null = null;
async function config() {
  if (cfg) return cfg;
  const { data, error } = await sb.from("push_config").select("key,value");
  if (error) throw error;
  cfg = Object.fromEntries((data || []).map((r: { key: string; value: string }) => [r.key, r.value]));
  webpush.setVapidDetails("https://victoriayse.github.io/meow-chinese/meow-chinese/", cfg.vapid_public, cfg.vapid_private);
  return cfg;
}

type Sub = { id: number; endpoint: string; p256dh: string; auth: string; prefs: Record<string, boolean> };
type Msg = { title: string; body: string; tag?: string };

// ---------- time helpers (the family's own time zone) ----------
function local(tz: string) {
  let parts: Record<string, string>;
  try {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
    parts = Object.fromEntries(f.formatToParts(new Date()).map((p) => [p.type, p.value]));
  } catch { return local("Asia/Singapore"); }
  return { date: `${parts.year}-${parts.month}-${parts.day}`, mins: (Number(parts.hour) % 24) * 60 + Number(parts.minute) };
}
const toMins = (t: string, def: number) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : def; };
function pushSettings(data: any) {
  const p = data?.settings?.push || {};
  return { tz: p.tz || "Asia/Singapore", quietOn: p.quietOn !== false, quietFrom: toMins(p.quietFrom, 21 * 60), quietTo: toMins(p.quietTo, 7 * 60), remindAt: toMins(p.remindAt, 18 * 60) };
}
function isQuiet(data: any) {
  const p = pushSettings(data);
  if (!p.quietOn || p.quietFrom === p.quietTo) return false;
  const m = local(p.tz).mins;
  return p.quietFrom < p.quietTo ? m >= p.quietFrom && m < p.quietTo : m >= p.quietFrom || m < p.quietTo;
}

// ---------- sending ----------
// a linked parent's phones also get the child's notifications, with the child's name in front
async function childLabel(userId: string) {
  const { data } = await sb.from("user_saves").select("data").eq("user_id", userId).maybeSingle();
  const d = data?.data || {};
  return d.childName || d.kitten?.name || "孩子";
}
async function sendTo(userId: string, type: string, msg: Msg) {
  await config();
  const parents = type === "test" ? [] : ((await sb.from("parent_links").select("parent").eq("child", userId)).data || []).map((r: { parent: string }) => r.parent);
  const { data: subs } = await sb.from("push_subs").select("id,user_id,endpoint,p256dh,auth,prefs").in("user_id", [userId, ...parents]);
  let sent = 0, label: string | null = null;
  for (const s of (subs || []) as (Sub & { user_id: string })[]) {
    if (type !== "test" && s.prefs && s.prefs[type] === false) continue;
    let title = msg.title;
    if (s.user_id !== userId) { label = label ?? await childLabel(userId); title = `${label}：${msg.title}`; }
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body: msg.body, tag: (msg.tag || type) + (s.user_id !== userId ? "-" + userId.slice(0, 8) : ""), url: "./" }), { TTL: 6 * 3600, urgency: "high" });
      sent++;
      await sb.from("push_subs").update({ last_ok: new Date().toISOString() }).eq("id", s.id);
    } catch (e: any) {
      // the phone turned notifications off or the app was removed: forget this device
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await sb.from("push_subs").delete().eq("id", s.id);
      else console.log("push failed", s.id, e?.statusCode, e?.body || String(e));
    }
  }
  return sent;
}
async function getSave(userId: string) {
  const { data } = await sb.from("user_saves").select("data").eq("user_id", userId).maybeSingle();
  return data?.data || {};
}
async function getState(userId: string) {
  const { data } = await sb.from("push_state").select("data").eq("user_id", userId).maybeSingle();
  return (data?.data || {}) as Record<string, any>;
}
const putState = (userId: string, st: Record<string, any>) => sb.from("push_state").upsert({ user_id: userId, data: st, updated_at: new Date().toISOString() });
const catName = (d: any) => d?.kitten?.name || "小猫";

// ---------- a friend sent something ----------
async function onEvent(ev: any) {
  const save = await getSave(ev.to_user);
  if (isQuiet(save)) return 0;
  const who = ev.payload?.senderName || "朋友";
  if (ev.kind === "letter") return sendTo(ev.to_user, "message", { title: `✉️ ${who}给你写了信！`, body: `${String(ev.payload?.text || "").slice(0, 80)}\nYou got a new message`, tag: "msg-" + ev.id });
  if (ev.kind === "gift") return sendTo(ev.to_user, "gift", { title: `🎁 ${who}送你一个礼物！`, body: "Open the app to unwrap your gift", tag: "gift-" + ev.id });
  if (ev.kind === "feed") return sendTo(ev.to_user, "feed", { title: `🐟 ${who}喂了${catName(save)}！`, body: "A friend fed your kitten", tag: "feed-" + ev.id });
  return 0;
}

// ---------- the save changed: new phone notifications (e.g. Mum checked an essay) ----------
async function onSave(userId: string) {
  const save = await getSave(userId), st = await getState(userId);
  const seen: string[] = Array.isArray(st.noti) ? st.noti : [];
  const recent = Date.now() - 6 * 3600000;
  const items: { key: string; title: string; body: string }[] = [];
  for (const n of save.notifications || []) {
    if (!n || n.read || (n.at || 0) < recent) continue;
    items.push({ key: `${n.id}:${n.at}`, title: `🔔 ${n.title || "新通知"}`, body: n.body || "You have a new notification" });
  }
  for (const e of save.essays || []) {
    if (e?.status !== "reviewed" || e.seen || !e.review || (e.review.at || 0) < recent) continue;
    if ((save.notifications || []).some((n: any) => n.essayId === e.id)) continue;
    items.push({ key: `essay-${e.id}:${e.review.at}`, title: `🔔 作文批改好了：${e.title || ""}`, body: "Mum checked your writing" });
  }
  const fresh = items.filter((x) => !seen.includes(x.key));
  if (!fresh.length) return 0;
  if (isQuiet(save)) return 0;   // still new next time (until 6 hours have passed)
  let sent = 0;
  for (const x of fresh.slice(0, 3)) sent += await sendTo(userId, "noti", { title: x.title, body: x.body, tag: "noti-" + x.key });
  st.noti = [...seen, ...fresh.map((x) => x.key)].slice(-60);
  await putState(userId, st);
  return sent;
}

// ---------- every 15 minutes: hungry, thirsty, bored, daily tasks ----------
const TASK_DEFAULTS: Record<string, boolean> = { spell: true, perfect: true, care: true, choice: false, match: false, order: false, essay: false, review: false, listen: false };
async function checkUser(userId: string) {
  const save = await getSave(userId), st = await getState(userId);
  if (!save.onboarded) return 0;   // e.g. a parent's account that never set up its own kitten
  const before = JSON.stringify(st);
  const k = save.kitten || {}, name = catName(save);
  const quiet = isQuiet(save), god = !!save.settings?.godMode;
  const stage = save.health?.stage || "ok";
  let sent = 0;
  if (stage !== "dead") {
    const hours = Math.max(0, (Date.now() - (k.lastTick || Date.now())) / 3600000);
    const hunger = (k.hunger ?? 100) - hours * (100 / 24), water = (k.water ?? 75) - hours * (100 / 24);
    // hungry / thirsty: tell once each time she drops below half (again after she has been fed)
    if (god || hunger >= 50) st.hungryArmed = true;
    else if (st.hungryArmed !== false && !quiet) { sent += await sendTo(userId, "hungry", { title: `🐟 ${name}饿了！`, body: `${name} is hungry — come and feed her!` }); st.hungryArmed = false; }
    if (god || water >= 50) st.thirstyArmed = true;
    else if (st.thirstyArmed !== false && !quiet) { sent += await sendTo(userId, "thirsty", { title: `💧 ${name}口渴了！`, body: `${name} is thirsty — give her some water!` }); st.thirstyArmed = false; }
    // bored: 3 hours after she last played (only once per time)
    const words = Object.keys(save.words || {}).length;
    const bored = stage === "ok" && words >= 5 && (save.boredSince || Date.now() - (save.lastPlayAt || 0) >= 3 * 3600000);
    const key = String(save.lastPlayAt || 0);
    if (bored && st.boredKey !== key && !quiet) { sent += await sendTo(userId, "bored", { title: `🎮 ${name}好无聊！`, body: `${name} is bored — come and play with her!` }); st.boredKey = key; }
  }
  // daily tasks: one reminder at the time the parent chose, if they aren't all done
  const p = pushSettings(save), now = local(p.tz);
  if (now.mins >= p.remindAt && st.taskDay !== now.date && !quiet) {
    const on = save.settings?.daily?.on || {};
    const any = Object.keys(TASK_DEFAULTS).some((t) => (on[t] === undefined ? TASK_DEFAULTS[t] : !!on[t]));
    const done = save.daily?.date === now.date && !!save.daily?.paid?.bonus;
    if (any && !done) sent += await sendTo(userId, "tasks", { title: "📋 今天的任务还没做完！", body: `Your daily tasks aren't finished yet — ${name} is waiting for you!` });
    st.taskDay = now.date;
  }
  if (JSON.stringify(st) !== before) await putState(userId, st);
  return sent;
}
async function onCron() {
  const { data } = await sb.from("push_subs").select("user_id");
  const withPhones = [...new Set((data || []).map((r: { user_id: string }) => r.user_id))];
  // children whose parent has a phone set up count too
  const { data: kids } = withPhones.length ? await sb.from("parent_links").select("child").in("parent", withPhones) : { data: [] };
  const users = [...new Set([...withPhones, ...((kids || []).map((r: { child: string }) => r.child))])];
  let sent = 0;
  for (const u of users) { try { sent += await checkUser(u); } catch (e) { console.log("cron user failed", u, String(e)); } }
  return { users: users.length, sent };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const c = await config();
    // the app: "send a test notification to my devices"
    if (body.mode === "test" || body.mode === "key") {
      if (body.mode === "key") return json({ key: c.vapid_public });
      const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u } = await sb.auth.getUser(token);
      if (!u?.user) return json({ error: "not signed in" }, 401);
      const n = await sendTo(u.user.id, "test", { title: "🐱 喵！通知开好了", body: "Notifications are working! 喵喵中文" });
      return json({ sent: n });
    }
    if (body.secret !== c.hook_secret) return json({ error: "forbidden" }, 403);
    if (body.mode === "event") return json({ sent: await onEvent(body.event || {}) });
    if (body.mode === "save") return json({ sent: await onSave(body.user_id) });
    if (body.mode === "cron") return json(await onCron());
    return json({ error: "unknown mode" }, 400);
  } catch (e) {
    console.log("error", String(e));
    return json({ error: String(e) }, 500);
  }
});
