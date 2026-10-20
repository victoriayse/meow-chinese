// 🏷️ v274: shop sales — the admin puts items on sale (a % off, from a start to an end time); everyone sees the same sales.
// Stored online (shop_sales): anyone can read them, only the admin can add, change or remove them.
import * as S from './state.js';
import * as Auth from './auth.js';

const URL_ = () => `${Auth.API}/rest/v1/shop_sales`;
async function call(path = '', opts = {}) {
  const t = Auth.session() ? await Auth.token().catch(() => null) : null;
  const r = await fetch(URL_() + path, { ...opts, headers: { 'Content-Type': 'application/json', apikey: Auth.KEY, Authorization: `Bearer ${t || Auth.KEY}`, Prefer: 'return=representation', ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}
let lastLoad = 0, loading = null;
const listeners = new Set();
export const onSales = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
// sales that haven't ended (and, for the admin's list, ones that ended in the last 7 days)
export function loadSales(force = false) {
  if (loading) return loading;
  if (!force && Date.now() - lastLoad < 60000) return Promise.resolve(S.allSales());
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  loading = call(`?select=*&ends_at=gt.${encodeURIComponent(since)}&order=starts_at.asc`)
    .then((rows) => { lastLoad = Date.now(); S.setSales(rows); listeners.forEach((f) => { try { f(); } catch {} }); return rows; })
    .catch((e) => { console.warn('sales', e); return S.allSales(); })
    .finally(() => { loading = null; });
  return loading;
}
// the server answers with the rows it changed: none means it said no (e.g. not the admin)
const changed = (rows) => { if (!Array.isArray(rows) || !rows.length) throw new Error('not allowed'); return loadSales(true); };
export const addSale = ({ item, pct, start, end }) => call('', { method: 'POST', body: JSON.stringify({ item, pct, starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString() }) }).then(changed);
export const updateSale = (id, { pct, start, end }) => call(`?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ pct, starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString() }) }).then(changed);
export const removeSale = (id) => call(`?id=eq.${id}`, { method: 'DELETE' }).then(changed);
// "2d 04h 12m 09s", "03h 12m 09s", "04m 09s"
export function left(ms) {
  if (ms <= 0) return '0s';
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1000) % 60;
  const p = (x) => String(x).padStart(2, '0');   // v276: always with the seconds ticking, e.g. "2d 23h 59m 08s"
  return d ? `${d}d ${p(h)}h ${p(m)}m ${p(s)}s` : h ? `${p(h)}h ${p(m)}m ${p(s)}s` : `${p(m)}m ${p(s)}s`;
}
// start: once now, then every few minutes (a sale starting or ending changes prices for everyone)
let started = false;
export function startSales() { if (started) return; started = true; loadSales(true); setInterval(() => { if (!document.hidden) loadSales(true); }, 5 * 60000); }
